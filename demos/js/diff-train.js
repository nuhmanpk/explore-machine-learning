// Watch a Diffusion Model Learn — trains DiffCore's MLP live and replays checkpoint samples.
(function () {
  const C = window.DiffCore;
  const W = 560, H = 560, R = 2.6;
  const NDOTS = 500, SEED = 1234;
  const CK_STEPS = [0, 25, 75, 150, 300, 500, 800, 1200, 1800, 2500, 3500, 5000, 7000];
  const LRS = [[0.0003, "Snail"], [0.001, "Slow"], [0.002, "Just right"], [0.006, "Fast"], [0.03, "Wild"]];
  const NSTEPS = [5, 15, 40, 100];
  const SHAPE_NAME = { heart: "heart", star: "star", smiley: "smiley", spiral: "spiral", moons: "two moons", draw: "drawing" };

  const view = document.getElementById("view");
  const { ctx } = ML.setupCanvas(view, W, H);
  const zoomCv = document.getElementById("zoom");
  const Z = ML.setupCanvas(zoomCv, 220, 220);
  const lossCv = document.getElementById("loss");
  const L = ML.setupCanvas(lossCv, 300, 120);
  const toPx = (x, y) => [((x + R) / (2 * R)) * W, ((R - y) / (2 * R)) * H];
  const toWorld = (px, py) => [(px / W) * 2 * R - R, R - (py / H) * 2 * R];

  const st = {
    shape: "star", strokes: [], data: null, model: null,
    hidden: 64, lr: 0.002, nsteps: 100, speed: 1,
    training: false, ema: null, lossHist: [],
    ckpts: [], queue: [], nextCk: 0, sel: -1, followLatest: true,
    k: 0, playing: true, hold: 0,
    fdot: 7, arrows: true, trails: true, ghost: true,
    field: null, fieldKey: "", celebrated: false, lastTalk: 0,
  };

  // ---------- model lifecycle ----------
  function buildData() {
    st.data = st.shape === "draw"
      ? (st.strokes.length ? C.sampleDataset("draw", 2000, C.mulberry(5), st.strokes) : null)
      : C.sampleDataset(st.shape, 2000, C.mulberry(5));
    st.baseline = st.data ? C.shapeMatch(C.sampleDataset(st.shape, NDOTS, C.mulberry(9), st.strokes), st.data) : 1;
  }
  function reset(talk = true) {
    setTraining(false);
    st.model = new C.Diffusion({ hidden: st.hidden, depth: 3, batch: 128, seed: 1 + Math.floor(Math.random() * 1000) });
    st.ema = null; st.lossHist = []; st.ckpts = []; st.queue = []; st.nextCk = 0; st.sel = -1;
    st.followLatest = true; st.celebrated = false; st.k = 0; st.field = null; st.fieldKey = "";
    renderCkpts(); updateStats(); drawLoss();
    if (talk) ML.say(st.shape === "draw"
      ? "Draw a shape in the big box (dotted square), then press <b>Start learning</b>."
      : `A brand-new baby brain! It has never seen a <b>${SHAPE_NAME[st.shape]}</b>. Press <b>Start learning</b>.`);
  }

  // ---------- training loop ----------
  const playBtn = document.getElementById("play");
  function setTraining(on) {
    st.training = on;
    playBtn.innerHTML = on ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} ${st.model && st.model.steps ? "Keep learning" : "Start learning"}`;
    view.classList.toggle("drawing", st.shape === "draw" && !on && !(st.model && st.model.steps));
  }
  playBtn.addEventListener("click", () => {
    if (!st.data) { ML.toast("Draw a shape first"); return; }
    if (!st.training && st.nextCk >= CK_STEPS.length && !st.queue.length) { ML.toast("All done! Press Reset to train a new brain."); return; }
    setTraining(!st.training);
    if (st.training && st.model.steps === 0) ML.say("Practice round 0: the brain is brand new. Let's see its very first try…");
  });
  document.getElementById("reset").addEventListener("click", () => reset());

  function trainFor(budget) {
    const t0 = performance.now();
    let n = 0;
    while (st.nextCk < CK_STEPS.length) {
      if (st.model.steps === CK_STEPS[st.nextCk]) { snapshot(); st.nextCk++; if (st.queue.length > 2) break; continue; }
      const loss = st.model.trainStep(st.data, st.lr);
      st.ema = st.ema === null ? loss : st.ema * 0.98 + loss * 0.02;
      if (st.model.steps % 10 === 0) st.lossHist.push([st.model.steps, st.ema]);
      n++;
      if (st.speed < 1 ? n >= 1 : performance.now() - t0 > budget) break; // Slow = 1 step a frame; 0.5× = every other frame (below)
    }
  }

  // ---------- checkpoints ----------
  function snapshot(net = st.model.net.clone(), step = st.model.steps, replace) {
    const ck = replace || { step, net, el: null, q: 0, done: false };
    ck.sampler = new C.Sampler(ck.net, st.model.sch, NDOTS, SEED, st.nsteps);
    ck.done = false;
    if (!replace) { st.ckpts.push(ck); renderCkpts(); }
    st.queue.push(ck);
  }
  function runJobs(budget) {
    const t0 = performance.now();
    while (st.queue.length && performance.now() - t0 < budget) {
      const ck = st.queue[0];
      ck.sampler.stepPart(125);
      if (ck.sampler.done) { st.queue.shift(); finishCk(ck); }
    }
  }
  function verdict(q) {
    if (q < 0.72) return "random fog";
    if (q < 0.86) return "a blob";
    if (q < 0.94) return "almost!";
    return st.shape === "draw" ? "your drawing!" : `a ${SHAPE_NAME[st.shape]}!`;
  }
  function finishCk(ck) {
    ck.done = true;
    ck.frames = ck.sampler.frames;
    ck.ts = ck.sampler.ts;
    ck.q = Math.min(1, C.shapeMatch(ck.frames[ck.frames.length - 1], st.data) / st.baseline);
    const fin = ck.frames[ck.frames.length - 1];
    ck.hue = new Float32Array(NDOTS);
    for (let i = 0; i < NDOTS; i++) ck.hue[i] = ((Math.atan2(fin[2 * i + 1], fin[2 * i]) * 180) / Math.PI + 360) % 360;
    const idx = st.ckpts.indexOf(ck);
    if (st.followLatest || idx === st.sel) select(idx, false);
    renderCkpts(idx);
    narrateCk(ck);
    if (st.nextCk >= CK_STEPS.length && !st.queue.length && st.training) {
      setTraining(false);
      ML.say(`Finished ${ck.step} practice rounds! Tap the checkpoint cards to compare its first try with its last. Fog → blob → ${SHAPE_NAME[st.shape]}!`);
    }
  }
  function narrateCk(ck) {
    st.lastTalk = performance.now();
    const name = SHAPE_NAME[st.shape];
    if (ck.step === 0) ML.say("Step 0: the brain knows nothing, so it can't clean anything. Its dots just stay as <b>random fog</b>.");
    else if (ck.q < 0.72) ML.say(`Step ${ck.step}: still foggy. It's practising guessing the noise…`);
    else if (ck.q < 0.86) ML.say(`Step ${ck.step}: <b>a blob!</b> It learned dots belong in the middle, but not the ${name}'s shape yet.`);
    else if (ck.q < 0.94) ML.say(`Step ${ck.step}: getting there! I can see the ${name} appearing.`);
    else {
      ML.say(`Step ${ck.step}: that's a <b>${name}</b>! 🎉 It learned to turn fog into a ${name} all by guessing noise.`);
      if (!st.celebrated) { st.celebrated = true; ML.confetti(50); flash("It learned it!"); }
    }
  }

  const ckEl = document.getElementById("ckpts");
  function renderCkpts(newIdx) {
    if (!st.ckpts.length) { ckEl.innerHTML = `<div class="ck-empty">Press <b>Start learning</b> to make the first checkpoint.</div>`; return; }
    ckEl.innerHTML = st.ckpts.map((ck, i) => `
      <button class="ckpt ${i === st.sel ? "on" : ""} ${ck.done ? "" : "pending"} ${i === newIdx ? "new" : ""}" data-i="${i}">
        <canvas width="216" height="216"></canvas>
        <b>Step ${ck.step}</b>${ck.done ? verdict(ck.q) : "making dots…"}
        <span class="q"><i style="width:${Math.round(ck.q * 100)}%"></i></span>
      </button>`).join("");
    ckEl.querySelectorAll(".ckpt").forEach((b) => drawThumb(b.querySelector("canvas"), st.ckpts[+b.dataset.i]));
    const on = ckEl.querySelector(".on") || ckEl.lastElementChild;
    if (on && newIdx !== undefined) ckEl.scrollTo({ left: on.offsetLeft - ckEl.clientWidth / 2 + 60, behavior: "smooth" });
  }
  function drawThumb(cv, ck) {
    const c = cv.getContext("2d"), s = cv.width;
    c.clearRect(0, 0, s, s);
    if (!ck.done) return;
    const fin = ck.frames[ck.frames.length - 1], TR = 1.9;
    for (let i = 0; i < NDOTS; i++) {
      const x = ((fin[2 * i] + TR) / (2 * TR)) * s, y = ((TR - fin[2 * i + 1]) / (2 * TR)) * s;
      c.fillStyle = `hsl(${ck.hue[i]} 80% 55%)`;
      c.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  ckEl.addEventListener("click", (e) => {
    const b = e.target.closest(".ckpt"); if (!b) return;
    const i = +b.dataset.i;
    if (!st.ckpts[i].done) { ML.toast("Still making dots for this one…"); return; }
    st.followLatest = i === st.ckpts.length - 1;
    select(i, true);
    const ck = st.ckpts[i];
    ML.say(`Replaying the brain from <b>step ${ck.step}</b>: ${verdict(ck.q)}. Watch the fog turn into dots ${ck.q > 0.86 ? "in the right places" : "… sort of"}.`);
  });
  function select(i, restart = true) {
    st.sel = i;
    if (restart || st.followLatest) { st.k = 0; st.playing = true; st.hold = 0; }
    ckEl.querySelectorAll(".ckpt").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
  }

  // ---------- replay + main view ----------
  const scrub = document.getElementById("scrub");
  const scrubOut = document.querySelector('[data-for="scrub"]');
  scrub.addEventListener("input", () => {
    const ck = st.ckpts[st.sel]; if (!ck || !ck.done) return;
    st.playing = false;
    st.k = (1 - scrub.value / 100) * (ck.frames.length - 1);
  });
  document.getElementById("replay").addEventListener("click", () => { st.k = 0; st.playing = true; st.hold = 0; });
  for (const [id, key] of [["tg-arrows", "arrows"], ["tg-trails", "trails"], ["tg-ghost", "ghost"]]) {
    document.getElementById(id).addEventListener("click", (e) => { st[key] = !st[key]; e.currentTarget.classList.toggle("on", st[key]); });
  }

  function framePos(ck, k, out) {
    const F = ck.frames.length - 1, i = Math.min(F, Math.floor(k)), j = Math.min(F, i + 1), f = k - i;
    const a = ck.frames[i], b = ck.frames[j];
    for (let n = 0; n < 2 * NDOTS; n++) out[n] = a[n] + (b[n] - a[n]) * f;
    return out;
  }
  const pos = new Float32Array(2 * NDOTS);

  function computeField(ck, i) {
    const key = `${st.sel}:${i}:${ck.step}`;
    if (key === st.fieldKey) return;
    st.fieldKey = key;
    if (i >= ck.ts.length) { st.field = null; return; }
    const G = 15, pts = new Float32Array(G * G * 2), eps = new Float32Array(G * G * 2);
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      pts[2 * (gy * G + gx)] = -R + ((gx + 0.5) / G) * 2 * R;
      pts[2 * (gy * G + gx) + 1] = -R + ((gy + 0.5) / G) * 2 * R;
    }
    C.predictEps(ck.net, pts, G * G, ck.ts[i], st.model.sch.T, eps);
    st.field = { G, pts, eps };
  }

  function arrow(c, x0, y0, x1, y1, color, w = 2, head = 6) {
    c.strokeStyle = c.fillStyle = color; c.lineWidth = w;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    c.beginPath(); c.moveTo(x1, y1);
    c.lineTo(x1 - head * Math.cos(a - 0.5), y1 - head * Math.sin(a - 0.5));
    c.lineTo(x1 - head * Math.cos(a + 0.5), y1 - head * Math.sin(a + 0.5));
    c.fill();
  }

  function render() {
    const dark = ML.isDark(), muted = ML.cssVar("--muted"), line = ML.cssVar("--line"), accent = ML.cssVar("--accent");
    ctx.clearRect(0, 0, W, H);
    // data box for drawing / reference
    const [bx, by] = toPx(-C.SC, C.SC), bw = (C.SC / R) * W;
    ctx.strokeStyle = line; ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bw); ctx.setLineDash([]);

    if (st.ghost && st.data) {
      ctx.fillStyle = muted; ctx.globalAlpha = dark ? 0.28 : 0.22;
      for (let i = 0; i < st.data.length / 2; i += 2) { const [px, py] = toPx(st.data[2 * i], st.data[2 * i + 1]); ctx.fillRect(px - 1, py - 1, 2.5, 2.5); }
      ctx.globalAlpha = 1;
    }
    if (st.shape === "draw" && st.strokes.length && !(st.model && st.model.steps)) {
      ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.lineCap = ctx.lineJoin = "round";
      for (const s of st.strokes) { ctx.beginPath(); s.forEach(([x, y], i) => { const [px, py] = toPx(x * C.SC, y * C.SC); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
    }

    const ck = st.ckpts[st.sel];
    const title = document.getElementById("view-title"), chip = document.getElementById("view-chip");
    if (!ck || !ck.done) {
      ctx.fillStyle = muted; ctx.font = "700 20px Fredoka, Nunito, sans-serif"; ctx.textAlign = "center";
      const txt = st.shape === "draw" && !st.strokes.length ? "Draw a shape inside the dotted box!" : st.training ? "Making the first dots…" : "Press Start learning";
      ctx.fillText(txt, W / 2, H - 24);
      chip.textContent = "no brain yet";
      return;
    }
    const F = ck.frames.length - 1, i = Math.min(F, Math.floor(st.k));
    framePos(ck, st.k, pos);
    title.innerHTML = `${ML.icon("film")} Brain from step ${ck.step} making dots`;
    chip.textContent = i >= F ? "done!" : `cleaning step ${i + 1} / ${F}`;
    const fuzz = i >= F ? 0 : Math.round(Math.sqrt(1 - st.model.sch.abar[ck.ts[i]]) * 100);
    if (document.activeElement !== scrub) { scrub.value = Math.round((1 - st.k / F) * 100); }
    scrubOut.textContent = `${fuzz}%`;

    if (st.arrows) {
      computeField(ck, i);
      if (st.field) {
        const { G, pts, eps } = st.field, cell = W / G;
        ctx.globalAlpha = 0.7;
        for (let n = 0; n < G * G; n++) {
          const ex = -eps[2 * n], ey = -eps[2 * n + 1], len = Math.hypot(ex, ey);
          if (len < 1e-3) continue;
          const Ln = Math.min(cell * 0.45, len * cell * 0.3) / len;
          const [x0, y0] = toPx(pts[2 * n], pts[2 * n + 1]);
          arrow(ctx, x0, y0, x0 + ex * Ln, y0 - ey * Ln, muted, 1.5, 5);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (st.trails && st.k > 0) {
      ctx.lineWidth = 1.4;
      const i0 = Math.max(0, i - 6);
      for (let n = 0; n < NDOTS; n++) {
        ctx.strokeStyle = `hsla(${ck.hue[n]} 85% ${dark ? 65 : 55}% / 0.3)`;
        ctx.beginPath();
        for (let j = i0; j <= i; j++) { const [px, py] = toPx(ck.frames[j][2 * n], ck.frames[j][2 * n + 1]); j === i0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        const [px, py] = toPx(pos[2 * n], pos[2 * n + 1]); ctx.lineTo(px, py);
        ctx.stroke();
      }
    }
    for (let n = 0; n < NDOTS; n++) {
      const [px, py] = toPx(pos[2 * n], pos[2 * n + 1]);
      ctx.fillStyle = `hsl(${ck.hue[n]} 85% ${dark ? 62 : 52}%)`;
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    // followed dot
    const [fx, fy] = toPx(pos[2 * st.fdot], pos[2 * st.fdot + 1]);
    ctx.strokeStyle = ML.cssVar("--ink"); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(fx, fy, 10, 0, Math.PI * 2); ctx.stroke();
    renderInside(ck, i);
  }

  // ---------- "What's happening inside" ----------
  let insideKey = "";
  function renderInside(ck, i) {
    const key = `${st.sel}:${i}:${st.fdot}:${ML.isDark()}`;
    if (key === insideKey) return;
    insideKey = key;
    const F = ck.frames.length - 1, c = Z.ctx, S = 220, half = 0.7;
    const p = [ck.frames[i][2 * st.fdot], ck.frames[i][2 * st.fdot + 1]];
    const zp = (x, y) => [S / 2 + ((x - p[0]) / half) * (S / 2), S / 2 - ((y - p[1]) / half) * (S / 2)];
    c.clearRect(0, 0, S, S);
    c.globalAlpha = 0.35;
    for (let n = 0; n < NDOTS; n++) {
      const [x, y] = zp(ck.frames[i][2 * n], ck.frames[i][2 * n + 1]);
      if (x < -5 || y < -5 || x > S + 5 || y > S + 5) continue;
      c.fillStyle = `hsl(${ck.hue[n]} 80% 55%)`; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
    const f1 = document.getElementById("f1"), f2 = document.getElementById("f2"), f3 = document.getElementById("f3"), f4 = document.getElementById("f4");
    if (i >= F) {
      c.fillStyle = ML.cssVar("--ink"); c.beginPath(); c.arc(S / 2, S / 2, 7, 0, 7); c.fill();
      f1.innerHTML = `I'm the circled dot. I've landed at <span class="mono">(${p[0].toFixed(2)}, ${p[1].toFixed(2)})</span>.`;
      f2.innerHTML = "No fuzz left, so the brain has nothing more to clean.";
      f3.innerHTML = "No more noise to guess.";
      f4.innerHTML = ck.q > 0.86 ? "I ended up on the shape. Nice cleaning!" : "I'm not on the shape yet: this brain needs more practice.";
      return;
    }
    const sampler = { sch: st.model.sch, ts: ck.ts };
    const co = C.Sampler.prototype.coef.call(sampler, i);
    const e = new Float32Array(2);
    C.predictEps(ck.net, new Float32Array(p), 1, co.t, st.model.sch.T, e);
    const mean = [(p[0] - co.c * e[0]) / Math.sqrt(co.a), (p[1] - co.c * e[1]) / Math.sqrt(co.a)];
    const nxt = [ck.frames[i + 1][2 * st.fdot], ck.frames[i + 1][2 * st.fdot + 1]];
    const step = [mean[0] - p[0], mean[1] - p[1]], wig = [nxt[0] - mean[0], nxt[1] - mean[1]];
    const sl = Math.hypot(...step), G = sl > 1e-4 ? Math.min(60 / sl, 400) : 1;
    const o = [S / 2, S / 2];
    arrow(c, o[0], o[1], o[0] + e[0] * 34, o[1] - e[1] * 34, ML.cssVar("--bad"), 3, 9);
    arrow(c, o[0], o[1], o[0] + step[0] * G, o[1] - step[1] * G, ML.cssVar("--good"), 4, 10);
    const wl = Math.hypot(...wig) * G, WG = wl > 40 ? (40 / wl) * G : G;
    if (wl > 1) arrow(c, o[0] + step[0] * G, o[1] - step[1] * G, o[0] + step[0] * G + wig[0] * WG, o[1] - step[1] * G - wig[1] * WG, ML.cssVar("--muted"), 2, 6);
    c.fillStyle = ML.cssVar("--ink"); c.beginPath(); c.arc(o[0], o[1], 7, 0, 7); c.fill();
    c.fillStyle = ML.cssVar("--muted"); c.font = "700 11px Nunito, sans-serif"; c.textAlign = "left"; c.fillText("zoomed in", 8, S - 8);
    const fuzz = Math.round(Math.sqrt(1 - co.ab) * 100);
    f1.innerHTML = `I'm the circled dot at <span class="mono">(${p[0].toFixed(2)}, ${p[1].toFixed(2)})</span>. Fuzz level: <span class="mono">${fuzz}%</span>.`;
    f2.innerHTML = `The <b>step-${ck.step}</b> brain reads 34 numbers (where I am + how fuzzy) and works out 2 numbers.`;
    f3.innerHTML = `Its guess: the noise pushed me this way <span class="sw" style="background:var(--bad)"></span> <span class="mono">(${e[0].toFixed(2)}, ${e[1].toFixed(2)})</span>.`;
    f4.innerHTML = `So I step the opposite way <span class="sw" style="background:var(--good)"></span>${co.sig > 0 ? `, plus a tiny random wiggle <span class="sw" style="background:var(--muted)"></span>` : ""}.`;
  }

  view.addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint(view, e, W, H);
    if (st.shape === "draw" && !(st.model && st.model.steps) && !st.training) {
      drawing = true; view.setPointerCapture(e.pointerId);
      st.strokes.push([wp(p)]);
      return;
    }
    const ck = st.ckpts[st.sel]; if (!ck || !ck.done) return;
    let best = 0, bd = Infinity;
    for (let n = 0; n < NDOTS; n++) { const [px, py] = toPx(pos[2 * n], pos[2 * n + 1]); const d = (px - p.x) ** 2 + (py - p.y) ** 2; if (d < bd) { bd = d; best = n; } }
    st.fdot = best; insideKey = "";
    if (st.playing) { st.playing = false; ML.toast("Paused. Drag the fuzz slider to move this dot step by step."); }
  });
  let drawing = false;
  const wp = (p) => toWorld(p.x, p.y).map((v) => ML.clamp(v / C.SC, -1, 1));
  view.addEventListener("pointermove", (e) => { if (drawing) st.strokes[st.strokes.length - 1].push(wp(ML.canvasPoint(view, e, W, H))); });
  const endDraw = () => {
    if (!drawing) return;
    drawing = false;
    buildData();
    ML.say("Nice shape! Draw more, or press <b>Start learning</b> to teach the brain your drawing.");
  };
  view.addEventListener("pointerup", endDraw);
  view.addEventListener("pointercancel", endDraw);

  // ---------- loss curve + stats ----------
  function updateStats() {
    document.getElementById("st-step").textContent = st.model ? st.model.steps : 0;
    document.getElementById("st-loss").textContent = st.ema === null ? "–" : st.ema.toFixed(2);
  }
  function drawLoss() {
    const c = L.ctx, w = 300, h = 120, pad = 8;
    c.clearRect(0, 0, w, h);
    const hist = st.lossHist;
    c.fillStyle = ML.cssVar("--muted"); c.font = "700 11px Nunito, sans-serif";
    if (hist.length < 2) { c.fillText("The oops score will appear here", pad, h / 2); return; }
    const maxX = Math.max(1000, hist[hist.length - 1][0] * 1.1);
    const ymax = Math.min(1.2, Math.max(...hist.map((p) => p[1]))), ymin = 0.2;
    const X = (s) => pad + Math.sqrt(s / maxX) * (w - 2 * pad), Y = (v) => h - pad - ((Math.min(v, ymax) - ymin) / (ymax - ymin)) * (h - 2 * pad);
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1;
    c.beginPath(); c.moveTo(pad, Y(ymin)); c.lineTo(w - pad, Y(ymin)); c.stroke();
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 2.5; c.lineJoin = "round";
    c.beginPath();
    hist.forEach(([s, v], i) => (i ? c.lineTo(X(s), Y(v)) : c.moveTo(X(s), Y(v))));
    c.stroke();
    c.fillStyle = ML.cssVar("--ink");
    for (const ck of st.ckpts) {
      const p = hist.find((q) => q[0] >= ck.step);
      if (p) { c.beginPath(); c.arc(X(ck.step), Y(p[1]), 3.5, 0, 7); c.fill(); }
    }
    c.fillStyle = ML.cssVar("--muted");
    c.fillText(`${maxX | 0} steps →`, w - 80, h - 12);
  }

  // ---------- controls ----------
  const msgEl = document.getElementById("msg");
  function flash(t) { msgEl.textContent = t; msgEl.classList.add("show"); setTimeout(() => msgEl.classList.remove("show"), 1800); }
  function seg(id, fn) {
    document.getElementById(id).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      fn(b.dataset.v);
    });
  }
  seg("speed", (v) => (st.speed = +v));
  seg("size", (v) => { st.hidden = +v; reset(false); ML.say(`New ${v === "32" ? "small" : v === "64" ? "medium" : "big"} brain with ${v} switches per layer. Press <b>Start learning</b>!`); });
  ML.bindRange("#lr", (v) => LRS[v][1], (v) => (st.lr = LRS[v][0]));
  ML.bindRange("#nsteps", (v) => NSTEPS[v], (v) => {
    st.nsteps = NSTEPS[v];
    const ck = st.ckpts[st.sel];
    if (ck && ck.done && st.model) { snapshot(ck.net, ck.step, ck); renderCkpts(); ML.say(`Re-making the step-${ck.step} dots with <b>${st.nsteps}</b> cleaning steps…`); }
  });
  document.getElementById("shapes").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#shapes .btn").forEach((x) => x.classList.toggle("on", x === b));
    st.shape = b.dataset.s;
    if (st.shape === "draw") st.strokes = [];
    buildData();
    reset();
  });

  // ---------- main loop ----------
  let frame = 0;
  function loop() {
    frame++;
    // Keep compute under ~10 ms a frame so the page stays smooth even in Turbo.
    const frameStart = performance.now();
    if (st.queue.length) runJobs(4);
    const left = 9 - (performance.now() - frameStart); // one shared ~9 ms budget per frame
    if (st.training && st.queue.length <= 2 && left > 1 && (st.speed !== 0.5 || frame % 2 === 0)) trainFor(left);
    const ck = st.ckpts[st.sel];
    if (ck && ck.done && st.playing) {
      const F = ck.frames.length - 1;
      if (st.k < F) st.k = Math.min(F, st.k + F / 130);
      else if (++st.hold > 110) { st.k = 0; st.hold = 0; }
    }
    if (frame % 6 === 0) { updateStats(); drawLoss(); }
    if (st.training && st.ckpts.length && performance.now() - st.lastTalk > 9000 && st.model.steps > 200 && !st.queue.length) {
      st.lastTalk = performance.now();
      ML.say(`Practising… round ${st.model.steps}. Oops score: <b>${st.ema.toFixed(2)}</b>. It never hits zero: nobody can guess random noise perfectly!`);
    }
    render();
    requestAnimationFrame(loop);
  }

  buildData();
  reset();
  document.addEventListener("themechange", () => { insideKey = ""; drawLoss(); renderCkpts(); });
  requestAnimationFrame(loop);
  window.__difftrain = st; // handy for testing
})();
