// Pattern Scanners — a 3x3 convolution scanner you can edit by hand, then let gradient descent learn.
(function () {
  const C = window.ScanCore;
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TN = 10, TRAIN_COUNT = 8, LR = 0.05;

  const state = {
    N: 12, img: C.PRESETS.stripes(12), nz: [], noiseOn: false,
    k: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    target: "vertical", set: null, tgts: null,
    pos: 0, scanning: false, revealed: 1e9, scanT: 0,
    learning: false, steps: 0, losses: [], marks: [], done: {}, learned: false,
  };
  const CH = [
    { id: "vertical", text: "Learn the vertical-line scanner" },
    { id: "horizontal", text: "Switch the target to horizontal lines and learn it" },
    { id: "corners", text: "Switch the target to corners and learn it" },
    { id: "noise", text: "Learn it again with noise added to the pictures" },
    { id: "move", text: "Shift or enlarge the picture: the same scanner still works" },
  ];

  const ctxs = {};
  function setup(id, w, h) { ctxs[id] = { ...ML.setupCanvas($(id), w, h) }; return ctxs[id]; }
  setup("pic", 360, 360); setup("map", 240, 240); setup("tmap", 240, 240);
  setup("kcv", 210, 210); setup("lk", 150, 150); setup("hk", 150, 150); setup("loss", 360, 180);
  const col = (n) => ML.cssVar(n) || "#888";

  // ---------- data helpers ----------
  function makeNoise() { const r = C.seeded(11 + state.N); state.nz = Array.from({ length: state.N * state.N }, () => (r() - 0.5) * 0.7); }
  const eff = () => state.noiseOn ? state.img.map((v, i) => Math.min(1, Math.max(0, v + state.nz[i]))) : state.img;
  const hidden = () => C.TARGETS[state.target].k;
  function rebuildSet() {
    state.set = C.makeTrainSet(5, TRAIN_COUNT, TN, state.noiseOn ? 0.7 : 0);
    state.tgts = C.makeTargets(state.set, TN, hidden());
  }
  function maps() {
    const im = eff(), mine = C.conv(im, state.N, state.k), tgt = C.conv(im, state.N, hidden());
    return { mine, tgt, M: mine.M };
  }
  const kerr = () => C.kernelError(state.k, hidden());
  const num = (v) => (Math.round(v * 100) / 100).toString();

  // ---------- drawing ----------
  function valColor(v, scale) {
    const a = Math.min(1, Math.abs(v) / (scale || 1));
    return [v >= 0 ? col("--good") : col("--bad"), a];
  }
  function drawGrid(c, w, data, n, scale, opts) {
    const { ctx } = c, cs = w / n;
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = col("--bg-2"); ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const idx = i * n + j;
      if (opts.hide && idx >= opts.hide) continue;
      const v = data[idx];
      if (opts.gray) { const g = Math.round(255 * (1 - v)); ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fillRect(j * cs, i * cs, cs, cs); }
      else { const [cc, a] = valColor(v, scale); ctx.globalAlpha = a; ctx.fillStyle = cc; ctx.fillRect(j * cs, i * cs, cs, cs); ctx.globalAlpha = 1; }
    }
    ctx.strokeStyle = col("--line"); ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, w); ctx.moveTo(0, i * cs); ctx.lineTo(w, i * cs); ctx.stroke(); }
    return cs;
  }
  function box(ctx, x, y, s, color) { ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3); }
  function drawKernel(id, k, w) {
    const c = ctxs[id], ctx = c.ctx;
    const cs = drawGrid(c, w, k, 3, 1, {});
    ctx.font = `700 ${Math.round(cs * 0.28)}px ${col("--font-mono") || "monospace"}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = col("--ink");
    for (let i = 0; i < 9; i++) ctx.fillText(num(k[i]), (i % 3 + 0.5) * cs, (Math.floor(i / 3) + 0.5) * cs);
    ctx.strokeStyle = col("--ink"); ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, w - 2);
  }
  function drawLoss() {
    const { ctx } = ctxs.loss, W = 360, H = 180, L = 34, B = 20, T = 8, R = 8;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = col("--ink"); ctx.font = "700 10px sans-serif"; ctx.textAlign = "left";
    const ls = state.losses.map((v) => Math.log10(Math.max(v, 1e-9)));
    if (ls.length < 2) { ctx.fillStyle = col("--muted"); ctx.fillText("Press the learn button to start the chart.", 40, H / 2); return; }
    const hi = Math.max(0, Math.ceil(Math.max(...ls))), lo = Math.floor(Math.min(...ls, hi - 1));
    const n = Math.max(ls.length - 1, 40);
    const X = (i) => L + (i / n) * (W - L - R), Y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
    ctx.strokeStyle = col("--line"); ctx.fillStyle = col("--muted"); ctx.lineWidth = 1;
    for (let e = lo; e <= hi; e += Math.max(1, Math.round((hi - lo) / 5))) { ctx.beginPath(); ctx.moveTo(L, Y(e)); ctx.lineTo(W - R, Y(e)); ctx.stroke(); ctx.fillText("1e" + e, 2, Y(e) + 3); }
    ctx.fillText("steps", W - 36, H - 5);
    ctx.strokeStyle = col("--accent"); ctx.lineWidth = 2.5; ctx.beginPath();
    ls.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
    state.marks.forEach((m, q) => {
      const x = X(Math.min(m.step, ls.length - 1));
      ctx.strokeStyle = col("--good"); ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - B); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col("--good"); ctx.beginPath(); ctx.arc(x, T + 6, 7, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText(m.n, x, T + 9); ctx.textAlign = "left";
    });
  }

  function render() {
    const { mine, tgt, M } = maps(), N = state.N;
    const pooled = $("pool").checked;
    const scale = Math.max(0.5, ...tgt.data.map(Math.abs));
    const cs = drawGrid(ctxs.pic, 360, eff(), N, 1, { gray: true });
    const px = 360 / N, pi = Math.floor(state.pos / M), pj = state.pos % M;
    box(ctxs.pic.ctx, pj * px, pi * px, px * 3, col("--warn") || "#f90");
    let a = mine, b = tgt, hide = state.revealed < M * M ? state.revealed : 0;
    if (pooled) { a = C.pool2(mine.data, M); b = C.pool2(tgt.data, M); hide = 0; }
    const mcs = drawGrid(ctxs.map, 240, a.data, a.M, scale, { hide });
    drawGrid(ctxs.tmap, 240, b.data, b.M, scale, {});
    if (!pooled) box(ctxs.map.ctx, pj * mcs, pi * mcs, mcs, col("--warn") || "#f90");
    $("map-cap").textContent = pooled ? "Squashed map (strongest of each 2x2)" : "Score map (yours)";
    const m = Math.max(0, C.cosine(mine.data, tgt.data));
    $("match").textContent = Math.round(m * 100) + "%";
    const sp = C.spot(eff(), N, state.k, pi, pj);
    $("prods").innerHTML = sp.prods.map((p, i) => `<span class="${p > 0.005 ? "pos" : p < -0.005 ? "neg" : ""}">${num(eff()[(pi + Math.floor(i / 3)) * N + pj + i % 3])}&times;${num(state.k[i])}<br>=${num(p)}</span>`).join("");
    $("sumline").textContent = "Sum = " + num(sp.sum) + "  (spot " + (pj + 1) + "," + (pi + 1) + ")";
    drawKernel("kcv", state.k, 210); drawKernel("lk", state.k, 150); drawKernel("hk", hidden(), 150);
    drawLoss();
    $("steps").textContent = state.steps;
    $("mse").textContent = state.losses.length ? state.losses[state.losses.length - 1].toExponential(1) : "–";
    inside(m);
    return m;
  }

  function inside(m) {
    const k = state.k, el = $("inside");
    let best = null, bc = 0;
    for (const key in C.TARGETS) { const c = C.cosine(k, C.TARGETS[key].k); if (c > bc) { bc = c; best = key; } }
    const energy = k.reduce((s, v) => s + v * v, 0);
    let t;
    if (energy < 0.01) t = "All nine numbers are zero, so every spot scores zero. This scanner sees nothing.";
    else if (bc > 0.9) t = `This scanner is looking for <b>${C.TARGETS[best].name}</b>: bright pixels where the green numbers are, dark where the red ones are.`;
    else if (bc > 0.5) t = `Getting warmer. It leans towards <b>${C.TARGETS[best].name}</b> (${Math.round(bc * 100)}% alike) but is still a bit muddled.`;
    else t = "It does not look like any pattern we know yet. Green squares want bright pixels, red squares want dark pixels. Where both are happy, the score is high.";
    if (state.steps) t += state.learned ? " The robot has <b>found the secret scanner</b>." : ` Step ${state.steps}: the robot compares its map with the answer and nudges all nine numbers a little.`;
    t += " The same nine numbers are used at every spot, which is why the pattern is found anywhere.";
    if ($("pool").checked) t += " Squashing keeps only the strongest hit in each 2x2 block.";
    el.innerHTML = `<p>${t}</p>`;
  }

  // ---------- learning ----------
  function learnStep(count) {
    for (let s = 0; s < count; s++) { state.losses.push(C.trainStep(state.k, state.set, state.tgts, TN, LR)); state.steps++; }
    const was = state.learned;
    state.learned = state.steps > 0 && kerr() < 0.05;
    if (state.learned && !was) { win(state.target); if (state.noiseOn) win("noise"); ML.say("Got it! My scanner now matches the secret one. Try another target or move the picture!"); }
    else if (!state.learned && state.steps === count) ML.say("Watch the nine numbers in my scanner morph towards the secret answer!");
  }
  function win(id) {
    if (state.done[id]) return;
    state.done[id] = state.marks.length + 1;
    state.marks.push({ step: Math.max(0, state.losses.length - 1), n: state.marks.length + 1 });
    drawChal();
    ML.toast && ML.toast("Challenge done: " + CH.find((c) => c.id === id).text);
  }
  function drawChal() {
    $("chal").innerHTML = CH.map((c) => `<div class="item ${state.done[c.id] ? "done" : ""}"><i data-icon="${state.done[c.id] ? "check" : "star"}"></i>${c.text}<span class="tag">${state.done[c.id] ? "flag " + state.done[c.id] : "to do"}</span></div>`).join("");
    if (ML.hydrateIcons) ML.hydrateIcons($("chal"));
  }
  function setLearning(on) {
    state.learning = on;
    $("learn").innerHTML = (on ? ML.icon("pause") : ML.icon("play")) + (on ? " Pause" : " Robot, learn the scanner!");
  }
  function loop() {
    if (state.learning) {
      if (kerr() < 0.003 && state.steps > 0) setLearning(false);
      else learnStep(reduce ? 12 : 3);
    }
    if (state.scanning) {
      state.scanT++;
      if (reduce || state.scanT % 3 === 0) {
        const M = state.N - 2;
        if (reduce) { state.revealed = 1e9; state.scanning = false; }
        else { state.pos = state.revealed; state.revealed++; if (state.revealed >= M * M) { state.scanning = false; state.revealed = 1e9; state.pos = M * M - 1; } }
      }
    }
    if (state.learning || state.scanning || state.dirty) { render(); state.dirty = false; }
    requestAnimationFrame(loop);
  }

  // ---------- interactions ----------
  const dirty = () => { state.dirty = true; };
  function setPic(img) { state.img = img; state.pos = Math.min(state.pos, (state.N - 2) ** 2 - 1); dirty(); checkMove(); }
  function resize(n) {
    state.img = C.resizeCentered(state.img, state.N, n); state.N = n; state.pos = 0; makeNoise(); dirty();
  }
  function checkMove() { /* only moves flagged by shift/bigger buttons */ }
  function moved() {
    render();
    const { mine, tgt } = maps();
    const m = C.cosine(mine.data, tgt.data);
    if (state.learned && m > 0.95) { win("move"); ML.say("See? Same nine numbers, new place, and the pattern still lights up. That is a big reason CNNs work on pictures."); }
    else if (!state.learned) ML.say("Teach me the scanner first (Part 2), then move the picture!");
  }

  (function bindPic() {
    const cv = $("pic"); let paintVal = null;
    const cell = (e) => {
      const p = ML.canvasPoint(cv, e, 360, 360), n = state.N;
      const x = Math.floor((p.x ?? p[0]) / (360 / n)), y = Math.floor((p.y ?? p[1]) / (360 / n));
      return x >= 0 && y >= 0 && x < n && y < n ? y * n + x : -1;
    };
    const paint = (e) => { const i = cell(e); if (i < 0) return; if (paintVal === null) paintVal = state.img[i] > 0.5 ? 0 : 1; state.img[i] = paintVal; dirty(); };
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); paintVal = null; paint(e); e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => { if (paintVal !== null) paint(e); });
    const up = () => { paintVal = null; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  })();
  (function bindMap() {
    const cv = $("map");
    const go = (e) => {
      if ($("pool").checked) return;
      const p = ML.canvasPoint(cv, e, 240, 240), M = state.N - 2, cs = 240 / M;
      const x = Math.floor((p.x ?? p[0]) / cs), y = Math.floor((p.y ?? p[1]) / cs);
      if (x >= 0 && y >= 0 && x < M && y < M) { state.pos = y * M + x; state.scanning = false; state.revealed = 1e9; dirty(); }
    };
    let down = false;
    cv.addEventListener("pointerdown", (e) => { down = true; go(e); });
    cv.addEventListener("pointermove", (e) => { if (down || e.pointerType === "mouse") go(e); });
    cv.addEventListener("pointerup", () => (down = false));
  })();
  (function bindKernel() {
    const cv = $("kcv"); let drag = null;
    cv.addEventListener("pointerdown", (e) => {
      setLearning(false); cv.setPointerCapture(e.pointerId);
      const p = ML.canvasPoint(cv, e, 210, 210), px = p.x ?? p[0], py = p.y ?? p[1];
      const i = Math.floor(py / 70) * 3 + Math.floor(px / 70);
      const r = cv.getBoundingClientRect();
      drag = { i, y0: e.clientY, v0: state.k[i], moved: false, scale: 210 / r.width };
      e.preventDefault();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dy = (drag.y0 - e.clientY) * drag.scale;
      if (Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) { state.k[drag.i] = Math.max(-2, Math.min(2, Math.round((drag.v0 + dy / 60) * 20) / 20)); state.revealed = 1e9; dirty(); }
    });
    const up = () => {
      if (drag && !drag.moved) { const v = state.k[drag.i]; state.k[drag.i] = v < -0.5 ? 0 : v < 0.5 ? 1 : -1; state.revealed = 1e9; dirty(); }
      drag = null; afterEdit();
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", () => (drag = null));
  })();
  function afterEdit() {
    state.steps === 0 && (state.learned = false);
    const m = render();
    if (m > 0.97) ML.say("Wow, your scanner lights up the same spots as the answer! You did what the robot does, by hand.");
    else if (m > 0.6) ML.say("Getting close! Keep nudging the numbers.");
  }

  $("scan").onclick = () => { state.scanning = true; state.revealed = 0; state.pos = 0; state.scanT = 0; ML.say("Watch the window slide. At each spot I <b>multiply</b> nine pairs and <b>add</b> them up. That is one square of the score map."); };
  $("stepbtn").onclick = () => { const M = state.N - 2; state.scanning = false; state.revealed = 1e9; state.pos = (state.pos + 1) % (M * M); dirty(); };
  $("pool").onchange = () => { dirty(); if ($("pool").checked) ML.say("Squashing! Each 2x2 block of the map keeps only its <b>strongest</b> score. The map is smaller but the hits stay."); };
  document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const p = b.dataset.preset; setPic(C.PRESETS[p](state.N, Math.floor(Math.random() * 1e6) + 1)); state.revealed = 1e9;
  }));
  $("k-zero").onclick = () => { setLearning(false); state.k = new Array(9).fill(0); state.steps === 0 && (state.learned = false); dirty(); };
  $("k-rand").onclick = () => { setLearning(false); state.k = Array.from({ length: 9 }, () => Math.round((Math.random() * 2 - 1) * 20) / 20); dirty(); };
  document.querySelectorAll("[data-target]").forEach((b) => b.addEventListener("click", () => {
    state.target = b.dataset.target; state.learned = false;
    document.querySelectorAll("[data-target]").forEach((x) => x.classList.toggle("on", x === b));
    rebuildSet(); dirty();
    ML.say(`New target: <b>${C.TARGETS[state.target].name}</b>. Edit the scanner by hand, or press <b>Robot, learn the scanner!</b>`);
  }));
  $("noise").onchange = () => { state.noiseOn = $("noise").checked; state.learned = false; rebuildSet(); dirty(); ML.say(state.noiseOn ? "The pictures are now fuzzy. Can I still find the scanner?" : "Noise off. Clean pictures again."); };
  $("learn").onclick = () => {
    if (state.learning) return setLearning(false);
    if (state.steps === 0 || state.learned) { if (state.learned) state.learned = false; }
    setLearning(true);
  };
  $("lstep").onclick = () => { setLearning(false); learnStep(1); dirty(); };
  $("lreset").onclick = () => { setLearning(false); state.k = new Array(9).fill(0); state.steps = 0; state.losses = []; state.marks = []; state.done = {}; state.learned = false; drawChal(); dirty(); };
  $("shift").onclick = () => { state.img = C.shift(state.img, state.N, 3, 2); state.nz = C.shift(state.nz, state.N, 3, 2); state.revealed = 1e9; moved(); };
  $("bigger").onclick = () => {
    resize(state.N === 12 ? 16 : 12); $("bigger").textContent = state.N === 12 ? "Bigger picture" : "Smaller picture";
    state.revealed = 1e9; moved();
  };

  // ---------- init ----------
  makeNoise(); rebuildSet(); drawChal(); setLearning(false);
  render(); requestAnimationFrame(loop);
})();
