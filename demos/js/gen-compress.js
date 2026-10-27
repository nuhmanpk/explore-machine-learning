// Squeeze and Rebuild page. Logic lives in gen-compress-core.js (GenCompressCore).
(function () {
  const C = window.GenCompressCore;
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KC = ["#e4572e", "#17a398", "#d99a00", "#7b4fb5", "#2e86de", "#8d6e63"];
  const raf = (f) => requestAnimationFrame(f);
  const pal = () => ({ ink: ML.cssVar("--ink"), card: ML.cssVar("--card"), bg: ML.cssVar("--bg-2"), line: ML.cssVar("--line"), muted: ML.cssVar("--muted"), acc: ML.cssVar("--accent"), warn: ML.cssVar("--warn"), bad: ML.cssVar("--bad"), good: ML.cssVar("--good") });
  // draw one 8x8 picture (values 0..1 = ink strength) at x,y with side s
  function drawPic(c, x, y, s, pic, P, alpha) {
    c.globalAlpha = alpha == null ? 1 : alpha; c.fillStyle = P.card; c.fillRect(x, y, s, s); c.fillStyle = P.ink; const t = s / 8;
    for (let i = 0; i < 64; i++) { const v = pic[i]; if (v > 0.02) { c.globalAlpha = (alpha == null ? 1 : alpha) * Math.min(1, v); c.fillRect(x + (i % 8) * t, y + Math.floor(i / 8) * t, t + 0.5, t + 0.5); } }
    c.globalAlpha = 1;
  }
  const hit = (id, msg) => {
    const el = $("c-" + id); if (!el || el.classList.contains("done")) return;
    el.classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`);
    if (document.querySelectorAll(".chal.done").length === document.querySelectorAll(".chal").length) ML.confetti(40);
  };
  const fmt = (v, d) => v.toFixed(d == null ? 3 : d);
  const onTheme = (f) => { new MutationObserver(f).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] }); new MutationObserver(f).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] }); document.addEventListener("themechange", f); window.addEventListener("load", f); };
  const xy = (e, cv, w, h) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h }; };

  const PW = 384, PH = 156, CELL = 40, X0 = 56, LW = 300, LH = 150;
  const pcx = ML.setupCanvas($("pics"), PW, PH).ctx, lcx = ML.setupCanvas($("loss"), LW, LH).ctx, scx = ML.setupCanvas($("sweepc"), LW, 140).ctx;
  const BATCH = 16, LR = 0.01, PER_FRAME = 25, STOP = 2400;
  const S = { seed: 1, data: null, k: 4, ae: null, hist: [], run: false, stop: STOP, show: [], sweep: null, sweeping: false, done: false, tests: 0 };

  function start(k) {
    S.k = k; S.ae = new C.AE(k, S.seed * 31 + k); S.hist = []; S.stop = STOP; S.tests++;
    record(); setRun(true);
  }
  function newData() { S.seed = 1 + Math.floor(Math.random() * 90000); S.data = C.dataset(S.seed); pickShow(); }
  function pickShow() { const n = S.data.test.length, a = []; const off = Math.floor(Math.random() * n); for (let i = 0; i < 8; i++) a.push(S.data.test[(off + i * 6) % n]); S.show = a; }
  function setRun(on) {
    S.run = on; $("play").innerHTML = `${ML.icon(on ? "pause" : "play")} ${on ? "Pause" : "Train"}`;
    if (on) raf(tick);
  }
  function tick() {
    if (!S.run || S.sweeping) return;
    for (let i = 0; i < PER_FRAME; i++) S.last = S.ae.train(S.data.train, BATCH, LR);
    record();
    if (S.ae.steps >= S.stop) { setRun(false); S.done = true; ML.say(`I stopped at <b>${S.ae.steps}</b> steps. With <b>${S.k}</b> numbers my error on new pictures is <b>${fmt(S.test)}</b>. Try another size!`); return; }
    raf(tick);
  }
  function record() {
    const ae = S.ae; S.test = ae.meanMse(S.data.test);
    if (ae.steps % 25 === 0 || !S.hist.length) S.hist.push({ s: ae.steps, tr: S.last == null ? 0.2 : S.last, te: S.test });
    $("s-k").innerHTML = `${S.k}<small> /64</small>`; $("s-err").textContent = fmt(S.test); $("s-steps").textContent = ae.steps;
    drawPics(); drawLoss(); checks();
  }
  function checks() {
    if (S.sweeping) return;
    if (S.k >= 12 && S.test < 0.035 && S.ae.steps >= 600) hit("big", "With plenty of room it rebuilds nearly perfectly.");
    if (S.k <= 2 && S.ae.steps >= 500 && S.test > 0.045) hit("tiny", "A tiny squeeze loses detail: the pictures come back blurry.");
    if (S.k <= 8 && S.ae.steps >= 800 && S.test < 0.035) hit("bargain", "A bargain: " + S.k + " numbers are enough for most of the picture.");
  }
  // ---------- drawing ----------
  function drawPics() {
    const c = pcx, P = pal(); c.clearRect(0, 0, PW, PH);
    c.font = "800 10px Nunito, sans-serif"; c.fillStyle = P.muted; c.textAlign = "left";
    [["Original", 8], ["Code", 56], ["Rebuilt", 104]].forEach(([t, y]) => c.fillText(t, 4, y + 24));
    S.show.forEach((p, i) => {
      const x = X0 + i * CELL, z = S.ae.encode(p.x), y = S.ae.decode(z);
      drawPic(c, x + 2, 8, CELL - 4, p.x, P); drawPic(c, x + 2, 104, CELL - 4, y, P);
      c.fillStyle = P.card; c.fillRect(x + 2, 56, CELL - 4, CELL - 4); c.strokeStyle = P.line; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 2, 74); c.lineTo(x + CELL - 2, 74); c.stroke();
      const bw = (CELL - 4) / S.k;
      for (let j = 0; j < S.k; j++) { const v = ML.clamp(z[j] * 6, -17, 17); c.fillStyle = v >= 0 ? P.acc : P.warn; c.fillRect(x + 2 + j * bw + (bw > 3 ? 0.5 : 0), v >= 0 ? 74 - v : 74, Math.max(1, bw - (bw > 3 ? 1 : 0)), Math.max(1, Math.abs(v))); }
    });
  }
  function drawLoss() {
    const c = lcx, P = pal(), L = 36, R = 8, T = 8, B = 20, n = S.hist.length, xm = Math.max(S.stop, 100);
    c.clearRect(0, 0, LW, LH);
    const lo = Math.log10(0.005), hi = Math.log10(0.3), Y = (v) => LH - B - ((Math.log10(ML.clamp(v, 0.005, 0.3)) - lo) / (hi - lo)) * (LH - T - B), X = (s) => L + (s / xm) * (LW - L - R);
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = P.muted; c.textAlign = "right";
    [0.3, 0.1, 0.03, 0.01].forEach((v) => { c.fillText(v, L - 4, Y(v) + 3); c.strokeStyle = P.line; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(LW - R, Y(v)); c.stroke(); c.setLineDash([]); });
    c.textAlign = "center"; c.fillText("steps (error, log scale)", (L + LW - R) / 2, LH - 5);
    [["tr", P.acc], ["te", P.warn]].forEach(([key, col]) => { c.strokeStyle = col; c.lineWidth = 2.2; c.lineJoin = "round"; c.beginPath(); S.hist.forEach((h, i) => (i ? c.lineTo(X(h.s), Y(h[key])) : c.moveTo(X(h.s), Y(h[key])))); c.stroke(); });
  }
  function drawSweep() {
    const c = scx, P = pal(), W = LW, H = 140, L = 8, B = 24, T = 16, res = S.sweep || [], n = C.SIZES.length, bw = (W - L * 2) / n;
    c.clearRect(0, 0, W, H); const mx = Math.max(0.05, ...res.map((r) => r.te));
    C.SIZES.forEach((k, i) => {
      const x = L + i * bw, r = res[i];
      c.fillStyle = P.muted; c.font = "800 10px Nunito, sans-serif"; c.textAlign = "center"; c.fillText(k, x + bw / 2, H - 8);
      if (r) { const h = Math.max(2, (r.te / mx) * (H - T - B)); c.fillStyle = P.warn; c.fillRect(x + 4, H - B - h, Math.max(2, bw - 8), h); c.fillStyle = P.ink; c.fillText(r.te.toFixed(3).slice(1), x + bw / 2, H - B - h - 3); }
    });
    c.fillStyle = P.muted; c.textAlign = "left"; c.fillText("numbers kept in the middle", L, 10);
  }
  // ---------- sweep ----------
  function runSweep() {
    if (S.sweeping) return;
    const was = S.run; setRun(false); S.sweeping = true; S.sweep = []; $("sweep").disabled = true;
    ML.say("I will train a fresh network for every size, 1500 steps each. Watch the bars!");
    let i = 0, ae = null;
    const step = () => {
      if (i >= C.SIZES.length) { S.sweeping = false; $("sweep").disabled = false; $("sweepnote").textContent = "Bigger bottleneck, smaller error. After about 8 numbers the gains get tiny."; hit("sweep", "Error falls as the bottleneck grows, with diminishing returns."); drawSweep(); return; }
      if (!ae) ae = new C.AE(C.SIZES[i], S.seed * 17 + C.SIZES[i]);
      for (let j = 0; j < 30; j++) ae.train(S.data.train, BATCH, LR);
      if (ae.steps >= 1500) { S.sweep.push({ k: C.SIZES[i], te: ae.meanMse(S.data.test) }); i++; ae = null; drawSweep(); }
      raf(step);
    };
    raf(step);
  }
  // ---------- wiring ----------
  ML.bindRange("#k", (v) => v + " of 64", (v) => { if (S.sweeping) return; clearTimeout(S.deb); S.deb = setTimeout(() => { start(+v); ML.say(`Now I may keep only <b>${v}</b> number${+v === 1 ? "" : "s"} per picture. Watching me learn...`); }, 120); });
  $("play").addEventListener("click", () => { if (S.sweeping) return; if (S.run) setRun(false); else { if (S.ae.steps >= S.stop) S.stop = S.ae.steps + 1200; setRun(true); } });
  $("shuffle").addEventListener("click", () => { pickShow(); drawPics(); });
  $("sweep").addEventListener("click", runSweep);
  onTheme(() => { drawPics(); drawLoss(); drawSweep(); });
  window.GenCompressPage = S;
  newData(); start(4); drawSweep();
})();
