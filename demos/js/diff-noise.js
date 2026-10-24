// Fuzz & Un-Fuzz — a real (tiny) diffusion model on 32×32 pictures.
// Forward: DDPM closed form with a cosine schedule.
// Reverse: DDIM / DDPM sampling with the exact Bayes-optimal denoiser for the "picture book".
(function () {
  const S = 32, N = S * S * 3, T = 100;
  const VIEW = 320;

  // ---------- noise schedule ----------
  const abar = new Float64Array(T + 1);
  for (let t = 0; t <= T; t++) {
    const s = 0.008;
    const f = (u) => Math.cos(((u + s) / (1 + s)) * Math.PI / 2) ** 2;
    abar[t] = Math.max(f(t / T) / f(0), 1e-6);
  }
  abar[0] = 1;

  // Fixed noise so scrubbing the slider is smooth.
  const rng = ML.seeded(7);
  function gauss(r) {
    let u = 0; while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  const EPS = new Float32Array(N);
  for (let i = 0; i < N; i++) EPS[i] = gauss(rng);

  // ---------- pictures ----------
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const toV = (c) => c / 127.5 - 1;
  function blank() { const a = new Float32Array(N); a.fill(1); return a; }
  function setPx(img, x, y, rgb) {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 3;
    img[i] = toV(rgb[0]); img[i + 1] = toV(rgb[1]); img[i + 2] = toV(rgb[2]);
  }
  function paint(fn) {
    const img = blank();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = fn(x + 0.5, y + 0.5); if (c) setPx(img, x, y, hex(c)); }
    return img;
  }
  function inPoly(x, y, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const d2 = (x, y, cx, cy) => (x - cx) ** 2 + (y - cy) ** 2;
  const starPts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 5.5 : 14, a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [16 + r * Math.cos(a), 17 + r * Math.sin(a)];
  });
  const PRESETS = [
    { name: "Heart", icon: "heart", img: paint((x, y) => {
      const u = (x - 16) / 12, v = -(y - 14.5) / 12;
      return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0 ? "#ff3b5c" : null;
    }) },
    { name: "Smiley", icon: "image", img: paint((x, y) => {
      const r = d2(x, y, 16, 16);
      if (r > 14 * 14) return null;
      if (r > 12.6 * 12.6) return "#3a2a00";
      if (d2(x, y, 11.5, 12.5) < 4.5 || d2(x, y, 20.5, 12.5) < 4.5) return "#3a2a00";
      const m = Math.sqrt(d2(x, y, 16, 15));
      if (y > 18 && m > 6.5 && m < 8.6) return "#3a2a00";
      return "#ffd23f";
    }) },
    { name: "Star", icon: "star", img: paint((x, y) => (inPoly(x, y, starPts) ? "#ffb703" : null)) },
    { name: "House", icon: "image", img: paint((x, y) => {
      if (y > 28) return "#4caf50";
      if (inPoly(x, y, [[4, 15], [16, 4], [28, 15]])) return "#e63946";
      if (x > 13 && x < 19 && y > 20 && y <= 28) return "#6d4c41";
      if (x > 7 && x < 12 && y > 18 && y < 23) return "#4dabf7";
      if (x > 6 && x < 26 && y >= 15 && y <= 28) return "#f4a261";
      return null;
    }) },
    { name: "Cat", icon: "image", img: paint((x, y) => {
      const head = d2(x, y, 16, 18) < 11.5 * 11.5;
      const ear = inPoly(x, y, [[5, 13], [7, 3], [13, 9]]) || inPoly(x, y, [[27, 13], [25, 3], [19, 9]]);
      if (!head && !ear) return null;
      if (d2(x, y, 12, 16) < 3.2 || d2(x, y, 20, 16) < 3.2) return "#2b9348";
      if (inPoly(x, y, [[14.5, 20], [17.5, 20], [16, 22]])) return "#ff8fab";
      if (Math.abs(y - 23 - (x < 16 ? (16 - x) * 0.15 : (x - 16) * 0.15)) < 0.6 && Math.abs(x - 16) > 4) return "#4a2c00";
      return "#ff9f43";
    }) },
  ];

  // ---------- state ----------
  const state = {
    img: blank(),      // the kid's drawing (x₀)
    t: 0,
    color: "#7c5cff",
    brush: 2,
    steps: 40,
    eta: 0,
    running: false,
    book: PRESETS.map((p) => ({ ...p, on: true, user: false, w: 0 })),
    cur: null,         // what the left canvas currently shows (x_t)
    guess: null,       // x₀ prediction
  };
  state.img.set(PRESETS[0].img);

  // ---------- rendering ----------
  const off = document.createElement("canvas"); off.width = S; off.height = S;
  const offCtx = off.getContext("2d");
  const offData = offCtx.createImageData(S, S);
  function blit(ctx, img, w, h) {
    const d = offData.data;
    for (let p = 0, i = 0; p < S * S; p++, i += 3) {
      d[p * 4] = (img[i] + 1) * 127.5;
      d[p * 4 + 1] = (img[i + 1] + 1) * 127.5;
      d[p * 4 + 2] = (img[i + 2] + 1) * 127.5;
      d[p * 4 + 3] = 255;
    }
    offCtx.putImageData(offData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, w, h);
  }
  const THUMBS = [0, 12, 25, 37, 50, 62, 75, 87, 100];
  const strip = document.getElementById("strip");
  const bookEl = document.getElementById("book");
  const drawCv = document.getElementById("draw");
  const guessCv = document.getElementById("guess");
  const D = ML.setupCanvas(drawCv, VIEW, VIEW);
  const G = ML.setupCanvas(guessCv, VIEW, VIEW);

  function gridLines(ctx) {
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i < S; i++) {
      const p = (i * VIEW) / S;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, VIEW); ctx.moveTo(0, p); ctx.lineTo(VIEW, p); ctx.stroke();
    }
  }

  function noisy(x0, t, eps = EPS) {
    const a = Math.sqrt(abar[t]), b = Math.sqrt(1 - abar[t]);
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = a * x0[i] + b * eps[i];
    return out;
  }
  const clip = (img) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = Math.max(-1, Math.min(1, img[i])); return o; };

  // Bayes-optimal denoiser for the book: E[x₀ | x_t] = Σ wᵢ xᵢ.
  function denoise(xt, t) {
    const pages = state.book.filter((p) => p.on);
    const a = Math.sqrt(abar[t]), v = Math.max(1 - abar[t], 1e-6);
    const logits = pages.map((p) => {
      let s = 0;
      for (let i = 0; i < N; i++) { const d = xt[i] - a * p.img[i]; s += d * d; }
      return -s / (2 * v);
    });
    const m = Math.max(...logits);
    const ex = logits.map((l) => Math.exp(l - m));
    const Z = ex.reduce((a, b) => a + b, 0);
    state.book.forEach((p) => (p.w = 0));
    pages.forEach((p, k) => (p.w = ex[k] / Z));
    const x0 = new Float32Array(N);
    pages.forEach((p) => { if (p.w > 1e-6) for (let i = 0; i < N; i++) x0[i] += p.w * p.img[i]; });
    return x0;
  }
  function topPage() {
    return state.book.reduce((a, b) => (b.w > a.w ? b : a), state.book[0]);
  }

  function renderMain() {
    const showDraw = state.t === 0 && !state.running && !state.sampled;
    const show = showDraw ? state.img : state.cur;
    blit(D.ctx, clip(show), VIEW, VIEW);
    if (showDraw) gridLines(D.ctx);
    if (state.guess) blit(G.ctx, state.guess, VIEW, VIEW);
    document.getElementById("chip-t").textContent = `step ${state.t} / ${T}`;
    const top = topPage();
    document.getElementById("chip-guess").textContent = top && top.w > 0 ? `${top.name} ${Math.round(top.w * 100)}%` : "—";
    document.getElementById("st-sig").innerHTML = `${Math.round(Math.sqrt(abar[state.t]) * 100)}<small>%</small>`;
    document.getElementById("st-noise").innerHTML = `${Math.round(Math.sqrt(1 - abar[state.t]) * 100)}<small>%</small>`;
    document.getElementById("cap-left").innerHTML = state.running ? `${ML.icon("noise")} Static being cleaned` : state.sampled ? `${ML.icon("sparkles")} Cleaned from static` : state.t === 0 ? `${ML.icon("pencil")} Your picture (draw here!)` : `${ML.icon("tv")} Your picture + static`;
    renderBookBars();
    strip.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.t === nearestThumb(state.t)));
  }

  // ---------- forward scrubbing ----------
  function updateForward() {
    state.cur = noisy(state.img, state.t);
    state.guess = state.t === 0 ? clip(state.img) : clip(denoise(state.cur, state.t));
    if (state.t === 0) denoise(noisy(state.img, 1), 1); // keep bars meaningful at t=0
    renderMain();
    narrateForward();
  }
  function narrateForward() {
    if (state.running) return;
    const t = state.t, top = topPage();
    const mine = state.book.some((p) => p.user && p.on && p === top && top.w > 0.5);
    let msg;
    if (t === 0) msg = "Here's your picture, nice and clear. Slide the <b>fuzz knob</b> to the right!";
    else if (t < 25) msg = `A sprinkle of static. You can still see it, and Robo guesses <b>${top.name}</b> easily.`;
    else if (t < 60) msg = `Getting fuzzy! Robo squints… still thinks it's <b>${top.name}</b>.`;
    else if (t < 90) msg = `Almost all static now! Robo isn't sure. Its guess is a blurry mix of pictures from its book.`;
    else msg = "Pure static! Like a TV with no channel 📺 Now press <b>Clean up fresh static</b> and watch magic happen.";
    if (t > 0 && t < 60 && !mine && top.w > 0.5 && !bookHasDrawing())
      msg += " (Robo has never seen <i>your</i> drawing, so it picks the closest one it knows.)";
    ML.say(msg);
  }
  function bookHasDrawing() {
    return state.book.some((p) => p.on && sameImg(p.img, state.img));
  }
  function sameImg(a, b) { for (let i = 0; i < N; i++) if (Math.abs(a[i] - b[i]) > 1e-3) return false; return true; }

  const tInput = document.getElementById("t");
  ML.bindRange(tInput, (v) => v, (v) => { if (state.running) return; state.sampled = false; state.t = v; updateForward(); });

  let fuzzAnim = null;
  document.getElementById("fuzz-play").addEventListener("click", () => {
    if (state.running) return;
    cancelAnimationFrame(fuzzAnim);
    let t = state.t >= T ? 0 : state.t;
    const tick = () => {
      t = Math.min(T, t + 1);
      tInput.value = t; tInput.dispatchEvent(new Event("input"));
      if (t < T) fuzzAnim = requestAnimationFrame(() => setTimeout(tick, 25));
    };
    tick();
  });

  // ---------- thumbnails ----------
  const nearestThumb = (t) => THUMBS.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
  strip.innerHTML = THUMBS.map((t) => `<button data-t="${t}" title="Jump to step ${t}"><canvas width="${S}" height="${S}"></canvas><span>${t}</span></button>`).join("");
  function renderStrip() {
    strip.querySelectorAll("button").forEach((b) => {
      const ctx = b.querySelector("canvas").getContext("2d");
      blit(ctx, clip(noisy(state.img, +b.dataset.t)), S, S);
    });
  }
  strip.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || state.running) return;
    tInput.value = b.dataset.t; tInput.dispatchEvent(new Event("input"));
  });

  // ---------- drawing ----------
  const COLORS = ["#1f2140", "#ff3b5c", "#ff9f43", "#ffd23f", "#2fbf62", "#2f9bff", "#7c5cff", "#ff8fab", "#8d5524", "#ffffff"];
  const pal = document.getElementById("palette");
  pal.innerHTML = COLORS.map((c) => `<button class="swatch ${c === state.color ? "on" : ""}" data-c="${c}" style="background:${c}" title="${c === "#ffffff" ? "Eraser" : "Color"}" aria-label="${c === "#ffffff" ? "Eraser" : "Color " + c}"></button>`).join("");
  pal.addEventListener("click", (e) => {
    const b = e.target.closest(".swatch"); if (!b) return;
    state.color = b.dataset.c;
    pal.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("on", s === b));
  });
  document.getElementById("brush").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.brush = +b.dataset.b;
    document.querySelectorAll("#brush button").forEach((x) => x.classList.toggle("on", x === b));
  });
  document.getElementById("clear").addEventListener("click", () => { state.img = blank(); afterEdit(); ML.say("Fresh paper! Draw anything you like."); });
  document.getElementById("presets").innerHTML = PRESETS.map((p, i) => `<button class="btn small ghost" data-i="${i}">${ML.icon(p.icon)} ${p.name}</button>`).join("");
  document.getElementById("presets").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.img = new Float32Array(PRESETS[+b.dataset.i].img);
    afterEdit();
    ML.say(`A ${PRESETS[+b.dataset.i].name.toLowerCase()}! Now slide the <b>fuzz knob</b> to bury it in static.`);
  });

  let painting = false, lastCell = null, drewSomething = false;
  function stamp(cx, cy) {
    const rgb = hex(state.color), r = state.brush - 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) setPx(state.img, cx + dx, cy + dy, rgb);
  }
  function cellAt(e) {
    const p = ML.canvasPoint(drawCv, e, S, S);
    return [Math.floor(p.x), Math.floor(p.y)];
  }
  function strokeTo(c) {
    if (lastCell) {
      const n = Math.max(Math.abs(c[0] - lastCell[0]), Math.abs(c[1] - lastCell[1]));
      for (let k = 1; k <= n; k++) stamp(Math.round(ML.lerp(lastCell[0], c[0], k / n)), Math.round(ML.lerp(lastCell[1], c[1], k / n)));
    } else stamp(c[0], c[1]);
    lastCell = c;
    drewSomething = true;
    blit(D.ctx, state.img, VIEW, VIEW); gridLines(D.ctx);
  }
  drawCv.addEventListener("pointerdown", (e) => {
    if (state.running) return;
    if (state.sampled) { state.sampled = false; renderMain(); }
    if (state.t !== 0) {
      tInput.value = 0; tInput.dispatchEvent(new Event("input"));
      ML.toast("Static wiped so you can draw");
    }
    painting = true; lastCell = null; drawCv.setPointerCapture(e.pointerId);
    strokeTo(cellAt(e));
  });
  drawCv.addEventListener("pointermove", (e) => { if (painting) strokeTo(cellAt(e)); });
  const endPaint = () => {
    if (!painting) return;
    painting = false;
    if (drewSomething) { afterEdit(); ML.say("Lovely drawing! Want Robo to remember it? Press <b>Add my drawing to the book</b>."); }
    drewSomething = false;
  };
  drawCv.addEventListener("pointerup", endPaint);
  drawCv.addEventListener("pointercancel", endPaint);

  function afterEdit() {
    if (state.t !== 0) { state.t = 0; tInput.value = 0; tInput.dispatchEvent(new Event("input")); }
    renderStrip();
    updateForward();
  }

  // ---------- picture book ----------
  function renderBook() {
    bookEl.innerHTML = state.book.map((p, i) => `
      <div class="page ${p.on ? "" : "off"}" data-i="${i}" title="Tap to ${p.on ? "hide" : "show"}">
        ${p.user ? `<button class="x" data-x="${i}" aria-label="Remove">${ML.icon("x")}</button>` : ""}
        <canvas width="${S}" height="${S}"></canvas>
        <div class="nm">${p.name}</div>
        <div class="bar"><i></i></div>
      </div>`).join("");
    bookEl.querySelectorAll(".page").forEach((el) => blit(el.querySelector("canvas").getContext("2d"), state.book[+el.dataset.i].img, S, S));
    renderBookBars();
  }
  function renderBookBars() {
    const top = topPage();
    bookEl.querySelectorAll(".page").forEach((el) => {
      const p = state.book[+el.dataset.i];
      el.querySelector(".bar i").style.width = (p.on ? p.w * 100 : 0) + "%";
      el.classList.toggle("top", p === top && p.w > 0.3 && p.on);
    });
  }
  bookEl.addEventListener("click", (e) => {
    if (state.running) return;
    const x = e.target.closest("[data-x]");
    if (x) {
      state.book.splice(+x.dataset.x, 1);
      if (!state.book.some((p) => p.on)) state.book[0].on = true;
      renderBook(); updateForward(); return;
    }
    const pg = e.target.closest(".page"); if (!pg) return;
    const p = state.book[+pg.dataset.i];
    if (p.on && state.book.filter((q) => q.on).length === 1) { ML.toast("Robo needs at least one picture to remember!"); return; }
    p.on = !p.on;
    renderBook(); updateForward();
    ML.say(p.on ? `Robo remembers the <b>${p.name}</b> again.` : `Robo forgot the ${p.name}. It can't make that one any more!`);
  });
  let userCount = 0;
  document.getElementById("add").addEventListener("click", () => {
    if (state.running) return;
    if (bookHasDrawing()) { ML.toast("That picture is already in the book"); return; }
    let ink = 0; for (let i = 0; i < N; i++) if (state.img[i] < 0.99) ink++;
    if (ink < 6) { ML.toast("Draw something first"); return; }
    userCount++;
    state.book.push({ name: `Mine ${userCount}`, icon: "pencil", img: new Float32Array(state.img), on: true, user: true, w: 0 });
    renderBook(); updateForward();
    ML.say("Saved in Robo's picture book! 📖 Now Robo can rebuild <b>your</b> drawing from static. Try <b>Clean up fresh static</b> a few times.");
  });

  // ---------- reverse sampling ----------
  ML.bindRange("#steps", (v) => v, (v) => (state.steps = v));
  document.getElementById("mode").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.eta = +b.dataset.m;
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x === b));
  });
  const cleanBtn = document.getElementById("clean");
  const msgEl = document.getElementById("msg");
  function flash(text) { msgEl.textContent = text; msgEl.classList.add("show"); setTimeout(() => msgEl.classList.remove("show"), 1800); }

  cleanBtn.addEventListener("click", () => {
    if (state.running) return;
    state.running = true;
    cleanBtn.disabled = true;
    document.body.classList.add("busy");
    const seed = (Math.random() * 1e9) | 0, r = ML.seeded(seed);
    let x = new Float32Array(N);
    for (let i = 0; i < N; i++) x[i] = gauss(r);
    const n = state.steps;
    const ts = Array.from({ length: n + 1 }, (_, k) => Math.round(T - (k * T) / n));
    let k = 0;
    state.t = T; tInput.value = T; document.querySelector('[data-for="t"]').textContent = T;
    state.cur = x; state.guess = clip(denoise(x, T));
    renderMain();
    ML.say("Brand-new static. Nobody drew anything here! Watch each cleaning step in the film below…");
    flash("Fresh static!");
    film.innerHTML = ""; filmFrames = [];
    document.getElementById("film-wrap").classList.remove("hidden");
    addFrame(0, x, state.guess, T);
    const delay = Math.max(60, Math.min(350, 7000 / n));
    function step() {
      const t = ts[k], tn = ts[k + 1];
      const x0 = clip(denoise(x, t));
      const at = abar[t], an = abar[tn];
      const sig = state.eta * Math.sqrt(Math.max(0, ((1 - an) / (1 - at)) * (1 - at / an)));
      const cdir = Math.sqrt(Math.max(0, 1 - an - sig * sig));
      const sa = Math.sqrt(at), sb = Math.sqrt(1 - at), sn = Math.sqrt(an);
      const nx = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const eps = (x[i] - sa * x0[i]) / sb;
        nx[i] = sn * x0[i] + cdir * eps + (sig > 0 ? sig * gauss(r) : 0);
      }
      x = nx;
      k++;
      state.t = tn; tInput.value = tn; document.querySelector('[data-for="t"]').textContent = tn;
      state.cur = x;
      state.guess = x0;
      renderMain();
      addFrame(k, x, x0, tn);
      const top = topPage(), pct = Math.round(top.w * 100);
      if (tn > 70) ML.say(`Step ${k} of ${n}: still super fuzzy. Robo's guess is a blurry mix of everything it remembers.`);
      else if (tn > 35) ML.say(`Step ${k} of ${n}: Robo is starting to see… maybe a <b>${top.name}</b>? (${pct}% sure)`);
      else if (tn > 0) ML.say(`Step ${k} of ${n}: wiping off the last bits of static. Definitely a <b>${top.name}</b>!`);
      if (k < n) setTimeout(step, delay);
      else finish(top);
    }
    setTimeout(step, 500);
  });
  // ---------- cleaning film ----------
  const film = document.getElementById("film");
  let filmFrames = [];
  function addFrame(k, cur, guess, t) {
    filmFrames.push({ cur: new Float32Array(cur), guess: new Float32Array(guess), t });
    film.querySelectorAll(".ckpt.on").forEach((b) => b.classList.remove("on"));
    const b = document.createElement("button");
    b.className = "ckpt new on"; b.dataset.k = filmFrames.length - 1;
    b.innerHTML = `<canvas width="${S}" height="${S}"></canvas><canvas width="${S}" height="${S}"></canvas><b>${k === 0 ? "Start" : "Step " + k}</b>fuzz ${Math.round(Math.sqrt(1 - abar[t]) * 100)}%`;
    const [c1, c2] = b.querySelectorAll("canvas");
    blit(c1.getContext("2d"), clip(cur), S, S);
    blit(c2.getContext("2d"), guess, S, S);
    film.appendChild(b);
    film.scrollTo({ left: film.scrollWidth, behavior: "smooth" });
  }
  film.addEventListener("click", (e) => {
    const b = e.target.closest(".ckpt"); if (!b || state.running) return;
    const f = filmFrames[+b.dataset.k];
    film.querySelectorAll(".ckpt").forEach((x) => x.classList.toggle("on", x === b));
    state.t = f.t; tInput.value = f.t; document.querySelector('[data-for="t"]').textContent = f.t;
    state.cur = f.cur; state.guess = f.guess; state.sampled = true;
    renderMain();
    ML.say(f.t > 60 ? "Early frame: so much static that Robo's guess is a blurry mix." : f.t > 0 ? "Middle frame: the guess has sharpened into one picture." : "Last frame: all clean!");
  });

  function finish(top) {
    state.running = false;
    cleanBtn.disabled = false;
    state.cur = state.guess;
    state.sampled = true;
    renderMain();
    flash("Ta-da!");
    ML.confetti(50);
    const others = state.book.filter((p) => p.on).length;
    ML.say(`Ta-da! Robo turned random static into a <b>${top.name}</b>! 🎉 ` +
      (others > 1 ? "Press it again: different static can turn into a different picture." : "Robo only remembers one picture, so it always makes that one."));
    if (state.steps < 8) setTimeout(() => ML.toast("Only a few steps — see how the picture might come out smudgy?"), 2500);
  }

  document.addEventListener("themechange", renderMain);

  // ---------- go ----------
  renderBook();
  renderStrip();
  updateForward();
  ML.say("Draw something on the left (or pick a doodle). Then slide the <b>fuzz knob</b> and watch your picture disappear!");
})();
