// Memoriser vs Learner: page wiring. Maths lives in sup-overfit-core.js.
(function () {
  const core = window.OverfitCore;
  const { MAXD: MD } = core;
  const W = 640, H = 420, CW = 300, CH = 150;
  const { ctx } = ML.setupCanvas(document.getElementById("cv"), W, H);
  const { ctx: cctx } = ML.setupCanvas(document.getElementById("chart"), CW, CH);
  const cv = document.getElementById("cv");
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const YR = 1.6;
  const P = { x0: 30, x1: 626, y0: 14, y1: 404 };
  const toPx = (x, y) => [P.x0 + ((x + 1) / 2) * (P.x1 - P.x0), P.y1 - ((y + YR) / (2 * YR)) * (P.y1 - P.y0)];
  const toData = (px, py) => [((px - P.x0) / (P.x1 - P.x0)) * 2 - 1, ((P.y1 - py) / (P.y1 - P.y0)) * 2 * YR - YR];

  const S = { train: [], test: [], noise: 0.25, level: 1, errs: [], best: 1, sweeping: false, hits: {}, drag: -1, moved: false };
  const NTEST = 30;

  const sample = (n, noise) => Array.from({ length: n }, () => { const x = ML.rand(-0.95, 0.95); return { x, y: core.truth(x) + ML.randn() * noise }; });
  function newTrain(n) { S.train = sample(n, S.noise); S.hits = {}; recalc(); }
  function newTest() { S.test = sample(NTEST, S.noise); recalc(); }
  function recalc() {
    S.errs = core.errorsByDegree(S.train, S.test);
    S.best = core.bestDegree(S.errs);
    draw();
  }
  const cur = () => S.errs[S.level - 1];
  function verdict() {
    const e = cur(), b = S.errs[S.best - 1];
    if (e.test <= b.test * 1.12 + 0.01) return { k: "good", t: "Just right", r: "It follows the pattern, not the noise." };
    if (S.level < S.best) return { k: "under", t: "Too simple (underfitting)", r: "The curve is too stiff to follow the pattern." };
    return { k: "over", t: "Memorising (overfitting)", r: "It chases every dot, even the silly ones." };
  }

  function draw() {
    const co = core.fit(S.train, S.level);
    ctx.clearRect(0, 0, W, H);
    const line = ML.cssVar("--line"), muted = ML.cssVar("--muted"), accent = ML.cssVar("--accent"), bad = ML.cssVar("--bad"), ink = ML.cssVar("--ink");
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath();
    const [, zy] = toPx(0, 0); ctx.moveTo(P.x0, zy); ctx.lineTo(P.x1, zy); ctx.stroke();
    // true curve (dashed)
    ctx.setLineDash([6, 5]); ctx.strokeStyle = muted; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const x = -1 + i / 60, [px, py] = toPx(x, core.truth(x)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke(); ctx.setLineDash([]);
    // fitted curve
    ctx.save(); ctx.beginPath(); ctx.rect(P.x0, 0, P.x1 - P.x0, H); ctx.clip();
    ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const x = -1 + i / 100, y = ML.clamp(core.predict(co, x), -YR * 3, YR * 3), [px, py] = toPx(x, y);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke(); ctx.restore();
    // test dots hollow
    ctx.lineWidth = 2.5; ctx.strokeStyle = bad;
    for (const p of S.test) { const [px, py] = toPx(p.x, p.y); ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.stroke(); }
    // train dots filled
    ctx.fillStyle = ink;
    for (const p of S.train) { const [px, py] = toPx(p.x, ML.clamp(p.y, -YR, YR)); ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill(); }
    drawChart(); ui();
  }

  function drawChart() {
    const c = cctx, L = 30, R = 8, T = 10, B = 22;
    const X = (d) => L + ((d - 1) / (MD - 1)) * (CW - L - R);
    const ym = Math.max(0.3, Math.min(1.2, Math.max(...S.errs.map((e) => e.train), S.errs[S.best - 1].test * 3)));
    const Y = (v) => CH - B - (Math.min(v, ym) / ym) * (CH - T - B);
    c.clearRect(0, 0, CW, CH);
    const muted = ML.cssVar("--muted"), good = ML.cssVar("--good"), bad = ML.cssVar("--bad"), ink = ML.cssVar("--ink");
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "center";
    c.fillText("wiggle level", (L + CW - R) / 2, CH - 5);
    for (let d = 1; d <= MD; d += 1) if (d % 2 === 1 || d === MD) c.fillText(d, X(d), CH - B + 11);
    c.textAlign = "right"; c.textBaseline = "middle"; c.fillText("error", L - 4, T + 4); c.textBaseline = "alphabetic";
    // sweet spot band
    c.fillStyle = good; c.globalAlpha = 0.18; c.fillRect(X(S.best) - 8, T, 16, CH - T - B); c.globalAlpha = 1;
    c.fillStyle = good; c.textAlign = "center"; c.fillText("sweet spot", X(S.best), T + 8);
    const lineOf = (key, col) => {
      c.strokeStyle = col; c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath();
      S.errs.forEach((e, i) => (i ? c.lineTo(X(e.d), Y(e[key])) : c.moveTo(X(e.d), Y(e[key])))); c.stroke();
    };
    lineOf("train", ML.cssVar("--accent")); lineOf("test", bad);
    // current level
    c.strokeStyle = ink; c.setLineDash([3, 3]); c.lineWidth = 1.5; c.beginPath(); c.moveTo(X(S.level), T); c.lineTo(X(S.level), CH - B); c.stroke(); c.setLineDash([]);
    const e = cur();
    [["train", ML.cssVar("--accent")], ["test", bad]].forEach(([k, col]) => { c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = 2; c.beginPath(); c.arc(X(S.level), Y(e[k]), 5, 0, 7); c.fill(); c.stroke(); });
    // challenge stars
    Object.keys(S.hits).forEach((k) => { const d = S.hits[k]; c.fillStyle = ML.cssVar("--warn"); c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath(); c.arc(X(d), CH - B - 4, 6, 0, 7); c.fill(); c.stroke(); });
  }

  function ui() {
    const e = cur(), v = verdict();
    $("tr-err").textContent = e.train.toFixed(2);
    $("te-err").textContent = e.test.toFixed(2);
    $("gap").textContent = (e.test - e.train).toFixed(2);
    const vd = $("verdict"); vd.textContent = v.t; vd.style.color = `var(--${v.k === "good" ? "good" : v.k === "under" ? "warn" : "bad"})`;
    $("lvl-lbl").textContent = S.level;
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Wiggle level <b>${S.level}</b> means the curve can bend up to <b>${S.level - 1}</b> time${S.level === 2 ? "" : "s"}.</span></div>
      <div class="sig"><span class="dot" style="background:var(--ink)"></span><span>It saw <b>${S.train.length}</b> filled dots and scored <b class="mono">${e.train.toFixed(2)}</b> on them.</span></div>
      <div class="sig"><span class="dot" style="background:var(--bad)"></span><span>On <b>${S.test.length}</b> hollow dots it never saw: <b class="mono">${e.test.toFixed(2)}</b>.</span></div>
      <div class="decision">${v.r}</div>`;
    if (!S.sweeping) ML.say(`<b>${v.t}.</b> ${v.r} ${S.level === S.best ? "That is the lowest hollow-dot error. Nice!" : "Can you find the level where the red hollow-dot error is smallest?"}`);
    checkChallenges();
  }

  // ---------- challenges ----------
  const CH_DEF = {
    sweet: { el: "c-sweet", ok: () => S.level === S.best, msg: "You found the sweet spot!" },
    memo: { el: "c-memo", ok: () => S.level >= 9 && cur().train < 0.5 * S.errs[S.best - 1].train + 0.02 && cur().test > 2 * S.errs[S.best - 1].test, msg: "A memoriser! Perfect on the filled dots, bad on the hollow ones." },
    tame: { el: "c-tame", ok: () => S.level >= 9 && S.train.length >= 30 && cur().test < 1.6 * S.errs[S.best - 1].test + 0.03, msg: "More examples tamed the wiggles. Overfitting shrank!" },
  };
  function checkChallenges() {
    for (const k in CH_DEF) {
      const d = CH_DEF[k], el = $(d.el);
      if (!S.hits[k] && d.ok()) { S.hits[k] = S.level; el.classList.add("done"); ML.toast(d.msg); if (k === "sweet") ML.confetti(40); drawChart(); }
    }
  }
  function resetChallengeUI() { Object.values(CH_DEF).forEach((d) => $(d.el).classList.remove("done")); }

  // ---------- controls ----------
  function setLevel(l) { S.level = ML.clamp(Math.round(l), 1, MD); $("level").value = S.level; draw(); }
  $("level").addEventListener("input", (e) => { if (S.sweeping) stopSweep(); setLevel(+e.target.value); });
  ML.bindRange("#noise", (v) => v.toFixed(2), (v) => { if (v !== S.noise) { S.noise = v; S.train = sample(S.train.length, v); S.test = sample(NTEST, v); resetChallengeUI(); S.hits = {}; recalc(); } });
  ML.bindRange("#ntrain", (v) => v, (v) => {
    const n = S.train.length;
    if (!n) return;
    if (v < n) S.train = S.train.slice(0, v); else S.train = S.train.concat(sample(v - n, S.noise));
    recalc();
  });
  $("newtest").addEventListener("click", () => { newTest(); ML.toast("Fresh hollow dots!"); });
  $("newtrain").addEventListener("click", () => { resetChallengeUI(); newTrain(S.train.length); });
  $("more").addEventListener("click", () => { $("ntrain").value = 40; $("ntrain").dispatchEvent(new Event("input")); ML.say("<b>More examples!</b> Now slide the wiggle level up to 12. See how the wiggles calm down?"); });
  $("noisy").addEventListener("click", () => { $("noise").value = 0.55; $("noise").dispatchEvent(new Event("input")); });
  $("few").addEventListener("click", () => { $("ntrain").value = 8; $("ntrain").dispatchEvent(new Event("input")); });

  let raf = 0, sweepT = 0;
  function stopSweep() { S.sweeping = false; cancelAnimationFrame(raf); clearTimeout(sweepT); $("robot").innerHTML = `${ML.icon("play")} Robot, find the sweet spot`; }
  $("robot").addEventListener("click", () => {
    if (S.sweeping) return stopSweep();
    S.sweeping = true; $("robot").innerHTML = `${ML.icon("pause")} Stop`;
    let l = 1;
    ML.say("I will try every wiggle level, from stiff to wiggly, and watch the <b>red</b> error on the hollow dots.");
    setLevel(1);
    const stepUp = () => {
      if (!S.sweeping) return;
      if (l < MD) { l++; setLevel(l); sweepT = setTimeout(stepUp, reduce ? 60 : 380); }
      else {
        ML.say(`Done! Lowest hollow-dot error was at level <b>${S.best}</b>. Going there.`);
        const back = () => {
          if (!S.sweeping) return;
          if (S.level !== S.best) { setLevel(S.level + Math.sign(S.best - S.level)); sweepT = setTimeout(back, reduce ? 40 : 300); }
          else { S.sweeping = false; stopSweep(); ML.say(`<b>Sweet spot: level ${S.best}.</b> Lower than that is too stiff, higher starts memorising.`); }
        };
        sweepT = setTimeout(back, reduce ? 60 : 700);
      }
    };
    sweepT = setTimeout(stepUp, reduce ? 60 : 500);
  });

  // dots: tap empty to add, drag to move, tap a dot to remove
  function hit(p) {
    for (let i = S.train.length - 1; i >= 0; i--) { const [px, py] = toPx(S.train[i].x, S.train[i].y); if (Math.hypot(px - p.x, py - p.y) < 14) return i; }
    return -1;
  }
  const pt = (e) => ML.canvasPoint(cv, e, W, H);
  cv.style.touchAction = "none";
  cv.addEventListener("pointerdown", (e) => { const p = pt(e); S.drag = hit(p); S.moved = false; S.down = p; if (S.drag >= 0) cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (S.drag < 0) return;
    const p = pt(e); if (Math.hypot(p.x - S.down.x, p.y - S.down.y) > 4) S.moved = true;
    if (!S.moved) return;
    const [x, y] = toData(p.x, p.y); S.train[S.drag] = { x: ML.clamp(x, -1, 1), y: ML.clamp(y, -YR, YR) }; recalc();
  });
  cv.addEventListener("pointerup", (e) => {
    const p = pt(e);
    if (S.drag >= 0) { if (!S.moved && S.train.length > 3) { S.train.splice(S.drag, 1); recalc(); } }
    else if (p.x >= P.x0 && p.x <= P.x1) { const [x, y] = toData(p.x, p.y); S.train.push({ x: ML.clamp(x, -1, 1), y: ML.clamp(y, -YR, YR) }); recalc(); }
    S.drag = -1; $("ntrain").value = ML.clamp(S.train.length, 5, 60); $("ntrain").dispatchEvent(new CustomEvent("sync"));
    const o = document.querySelector('[data-for="ntrain"]'); if (o) o.textContent = S.train.length;
  });
  cv.addEventListener("pointercancel", () => { S.drag = -1; });
  new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => draw());

  S.noise = 0.25; S.train = sample(+$("ntrain").value, S.noise); S.test = sample(NTEST, S.noise); S.errs = core.errorsByDegree(S.train, S.test); S.best = core.bestDegree(S.errs);
  setLevel(+$("level").value);
})();
