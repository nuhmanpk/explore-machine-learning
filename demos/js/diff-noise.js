// Fuzz & Un-Fuzz — a real (tiny) diffusion model on 32×32 pictures.
// Page wiring; the maths lives in diff-noise-core.js.
(function () {
  const core = window.DiffNoiseCore;
  const { S, N, T, abar, gauss, hex, blank, setPx, PRESETS, noisy, clip } = core;
  const VIEW = 320;

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


  // Bayes-optimal denoiser for the book: E[x₀ | x_t] = Σ wᵢ xᵢ.
  function denoise(xt, t) {
    const pages = state.book.filter((p) => p.on);
    state.book.forEach((p) => (p.w = 0));
    return core.denoise(xt, t, pages);
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
    const seed = (Math.random() * 1e9) | 0, r = core.seeded(seed);
    let x = core.freshNoise(r);
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
      const nx = core.ddimStep(x, x0, t, tn, state.eta, r);
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
