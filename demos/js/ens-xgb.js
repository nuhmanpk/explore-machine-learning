// The Careful Booster page (XGBoost-style regularised boosting). Logic lives in ens-gbm-core.js (GBCore).
(function () {
  const C = window.GBCore, $ = (id) => document.getElementById(id);
  const MW = 520, MH = 340, CW = 300, CH = 160, N = 80, NOISE = 0.15, YMIN = -1.1, YMAX = 1.5, LR = 0.5, DEPTH = 4, MAXT = 120;
  const mx = ML.setupCanvas($("map"), MW, MH).ctx, cx = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 3, d: null, te: null, wild: null, care: null, lambda: 4, gamma: 0.05, mc: 4, timer: 0, hits: {}, wC: [], cC: [] };
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const f2 = (v) => v.toFixed(2);
  const PX = (x) => x * MW, PY = (y) => MH - ((y - YMIN) / (YMAX - YMIN)) * MH;

  function build() {
    stop();
    S.wild = new C.Booster(S.d.X, S.d.y, { lr: LR, depth: DEPTH, lambda: 0, gamma: 0, minChild: 1 });
    S.care = new C.Booster(S.d.X, S.d.y, { lr: LR, depth: DEPTH, lambda: S.lambda, gamma: S.gamma, minChild: S.mc });
    refresh();
  }
  function newData() { S.seed = 1 + Math.floor(Math.random() * 90000); S.d = C.wave(S.seed, N, NOISE); S.te = C.wave(S.seed + 50, 400, NOISE); build(); }
  function stop() { clearInterval(S.timer); S.timer = 0; $("auto").innerHTML = `${ML.icon("play")} Auto`; }
  function stepBoth() { S.wild.step(); S.care.step(); }

  function refresh() {
    const T = S.wild.trees.length;
    S.wC = S.wild.curve(S.te.X, S.te.y); S.cC = S.care.curve(S.te.X, S.te.y);
    const wTr = S.wild.curve(S.d.X, S.d.y)[T], cTr = S.care.curve(S.d.X, S.d.y)[T];
    $("round").textContent = T;
    $("w-test").textContent = f2(S.wC[T]); $("c-test").textContent = f2(S.cC[T]);
    $("w-train").textContent = f2(wTr); $("c-train").textContent = f2(cTr);
    $("w-leaves").textContent = S.wild.totalLeaves(); $("c-leaves").textContent = S.care.totalLeaves();
    renderInside(); draw(); drawChart(); checks();
  }
  function renderInside() {
    const b = S.care, T = b.trees.length, host = $("inside");
    if (!T) { host.innerHTML = `<div class="sig"><span>No trees yet.</span></div>`; return; }
    const t = b.trees[T - 1], leaves = C.treeLeaves(t);
    const rows = leaves.slice(0, 6).map((L) => `<div class="sig"><span class="mono">leaf with ${L.n} dots → value ${L.w >= 0 ? "+" : ""}${f2(L.w)}</span></div>`).join("");
    host.innerHTML = rows + `<div class="decision">${leaves.length} leaves${leaves.length > 6 ? " (first 6 shown)" : ""}. γ cut off <b>${b.lastPruned}</b> split${b.lastPruned === 1 ? "" : "s"} that did not help enough. The wild tree has ${S.wild.lastLeaves} leaves.</div>`;
  }
  function curve(c, b, col, w) {
    c.strokeStyle = col; c.lineWidth = w; c.lineJoin = "round"; c.beginPath();
    for (let i = 0; i <= 300; i++) { const x = i / 300, v = Math.max(YMIN, Math.min(YMAX, b.predict([x]))); i ? c.lineTo(PX(x), PY(v)) : c.moveTo(PX(x), PY(v)); }
    c.stroke();
  }
  function draw() {
    const c = mx, ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted");
    c.clearRect(0, 0, MW, MH);
    c.strokeStyle = muted; c.globalAlpha = 0.5; c.lineWidth = 2; c.setLineDash([2, 5]); c.beginPath();
    for (let i = 0; i <= 200; i++) { const x = i / 200; i ? c.lineTo(PX(x), PY(C.truth(x))) : c.moveTo(PX(x), PY(C.truth(x))); }
    c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    curve(c, S.wild, ML.cssVar("--bad"), 2.5);
    curve(c, S.care, ML.cssVar("--accent"), 4);
    for (let i = 0; i < N; i++) { c.beginPath(); c.arc(PX(S.d.X[i][0]), PY(S.d.y[i]), 4, 0, 7); c.fillStyle = ML.cssVar("--card"); c.fill(); c.strokeStyle = ink; c.lineWidth = 2; c.stroke(); }
  }
  function drawChart() {
    const c = cx, L = 32, R = 8, T = 10, B = 24, n = S.wC.length, xm = Math.max(20, n - 1), top = Math.max(0.5, S.wC[0] || 0.5);
    const X = (i) => L + (i / xm) * (CW - L - R), Y = (v) => CH - B - (Math.min(top, v) / top) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); const muted = ML.cssVar("--muted");
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0, top / 2, top].forEach((v) => { c.fillText(f2(v), L - 4, Y(v) + 3); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); });
    c.setLineDash([3, 3]); c.strokeStyle = muted; c.beginPath(); c.moveTo(L, Y(NOISE)); c.lineTo(CW - R, Y(NOISE)); c.stroke(); c.setLineDash([]);
    c.textAlign = "center"; c.fillText("trees", (L + CW - R) / 2, CH - 4);
    const line = (arr, col) => { c.strokeStyle = col; c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke(); };
    line(S.wC, ML.cssVar("--bad")); line(S.cC, ML.cssVar("--accent"));
  }
  const hit = (key, msg) => { if (S.hits[key]) return; S.hits[key] = 1; $("c-" + key).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (Object.keys(S.hits).length === 4) ML.confetti(40); };
  function checks() {
    const T = S.wild.trees.length, wl = S.wild.totalLeaves(), cl = S.care.totalLeaves();
    const careWins = T >= 50 && S.cC[T] < S.wC[T];
    if (careWins) hit("win", `Careful ${f2(S.cC[T])} vs wild ${f2(S.wC[T])} on fresh dots. The brakes stopped it chasing noise.`);
    if (careWins && cl * 4 < wl) hit("small", `${cl} leaves beat ${wl} leaves. Simpler trees, better guesses.`);
    if (T >= 10 && S.lambda === 0 && S.gamma === 0 && S.mc === 1 && Math.abs(S.cC[T] - S.wC[T]) < 1e-9) hit("off", "With every brake off, the careful booster is exactly the wild one.");
    if (T >= 10 && cl === T) hit("stuck", "Every tree is a single leaf now. Too careful means it cannot learn the wiggles at all: that is underfitting.");
  }
  $("ten").addEventListener("click", () => {
    if (S.wild.trees.length >= MAXT) { ML.say(`That's ${MAXT} trees, enough to see who wins. Press Start over to race again.`); return; }
    for (let i = 0; i < 10; i++) stepBoth(); refresh(); const T = S.wild.trees.length;
    ML.say(`${T} trees each. Fresh-dot error: wild <b>${f2(S.wC[T])}</b>, careful <b>${f2(S.cC[T])}</b>.${S.wild.curve(S.d.X, S.d.y)[T] < 0.02 ? " The wild one now passes through every training dot. Look how jumpy its curve is!" : ""}`);
  });
  $("auto").addEventListener("click", () => {
    if (S.timer) { stop(); return; }
    $("auto").innerHTML = `${ML.icon("pause")} Stop`;
    S.timer = setInterval(() => { const T = S.wild.trees.length; if (T >= MAXT) { stop(); ML.say(`${MAXT} trees each. Wild <b>${f2(S.wC[T])}</b>, careful <b>${f2(S.cC[T])}</b> on fresh dots.`); return; } stepBoth(); refresh(); }, reduce ? 30 : 140);
  });
  $("reset").addEventListener("click", () => { build(); ML.say("Both boosters start again from a flat guess."); });
  $("newdata").addEventListener("click", () => { newData(); ML.say("New noisy dots. Race again!"); });
  const knob = (id, key, fmt) => ML.bindRange("#" + id, fmt, (v) => { S[key] = v; if (S.d) build(); });
  knob("lambda", "lambda", (v) => (v % 1 ? v.toFixed(1) : String(v)));
  knob("gamma", "gamma", (v) => v.toFixed(2));
  knob("mc", "mc", (v) => String(v));
  const redraw = () => { draw(); drawChart(); };
  new MutationObserver(redraw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", redraw); window.addEventListener("load", redraw);
  newData();
})();
