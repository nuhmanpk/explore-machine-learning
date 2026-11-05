// Chase the Leftovers page. Logic lives in ens-gbm-core.js (GBCore).
(function () {
  const C = window.GBCore, $ = (id) => document.getElementById(id);
  const MW = 520, MH = 340, CW = 300, CH = 160, N = 80, NOISE = 0.15, YMIN = -1.1, YMAX = 1.5;
  const mx = ML.setupCanvas($("map"), MW, MH).ctx, cx = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 3, d: null, te: null, b: null, lr: 0.3, depth: 1, timer: 0, hits: {}, stepsClicked: 0, trC: [], teC: [] };
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const f2 = (v) => v.toFixed(2);
  const PX = (x) => x * MW, PY = (y) => MH - ((y - YMIN) / (YMAX - YMIN)) * MH;

  function build() { stop(); S.b = new C.Booster(S.d.X, S.d.y, { loss: "sq", lr: S.lr, depth: S.depth }); S.stepsClicked = 0; refresh(); }
  function newData() { S.seed = 1 + Math.floor(Math.random() * 90000); S.d = C.wave(S.seed, N, NOISE); S.te = C.wave(S.seed + 50, 400, NOISE); build(); }
  function stop() { clearInterval(S.timer); S.timer = 0; $("auto").innerHTML = `${ML.icon("play")} Auto`; }

  function refresh() {
    const b = S.b, T = b.trees.length;
    S.trC = b.curve(S.d.X, S.d.y); S.teC = b.curve(S.te.X, S.te.y);
    $("round").textContent = T;
    $("s-train").textContent = f2(S.trC[T]); $("s-test").textContent = f2(S.teC[T]);
    $("s-big").textContent = f2(Math.max(...b.residuals().map(Math.abs)));
    renderInside(); draw(); drawChart(); checks();
  }
  function renderInside() {
    const b = S.b, T = b.trees.length, host = $("inside");
    if (!T) { host.innerHTML = `<div class="sig"><span>No helpers yet. The guess is the plain average, <b>${f2(b.base)}</b>.</span></div>`; return; }
    const leaves = C.treeLeaves(b.trees[T - 1]);
    const parts = []; (function walk(n, lo, hi) { if (n.l) { walk(n.l, lo, Math.min(hi, n.t)); walk(n.r, Math.max(lo, n.t), hi); } else parts.push([lo, hi, n.w]); })(b.trees[T - 1], 0, 1);
    const month = (x) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Math.min(11, Math.floor(x * 12))];
    host.innerHTML = parts.map(([lo, hi, w]) => `<div class="sig"><span class="mono">${month(lo)}–${month(hi - 1e-6)}: leftover ${w >= 0 ? "+" : ""}${f2(w)} → adds ${w >= 0 ? "+" : ""}${f2(w * S.lr)}</span></div>`).join("")
      + `<div class="decision">Helper #${T} split the year into ${leaves.length} pieces and guessed the average leftover in each. The team only adds ${Math.round(S.lr * 100)}% of it.</div>`;
  }
  function draw() {
    const c = mx, b = S.b, T = b.trees.length, ink = ML.cssVar("--ink"), acc = ML.cssVar("--accent"), warn = ML.cssVar("--warn"), muted = ML.cssVar("--muted");
    c.clearRect(0, 0, MW, MH);
    // the true curve, faint
    c.strokeStyle = muted; c.globalAlpha = 0.35; c.lineWidth = 2; c.setLineDash([2, 5]); c.beginPath();
    for (let i = 0; i <= 200; i++) { const x = i / 200; i ? c.lineTo(PX(x), PY(C.truth(x))) : c.moveTo(PX(x), PY(C.truth(x))); }
    c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    // leftover sticks
    c.strokeStyle = warn; c.lineWidth = 2;
    for (let i = 0; i < N; i++) { const x = S.d.X[i][0]; c.beginPath(); c.moveTo(PX(x), PY(S.d.y[i])); c.lineTo(PX(x), PY(b.F[i])); c.stroke(); }
    // newest helper's contribution, drawn around the zero line at the bottom
    if (T) {
      const z = MH - 40; c.strokeStyle = ink; c.lineWidth = 1; c.globalAlpha = 0.3; c.beginPath(); c.moveTo(0, z); c.lineTo(MW, z); c.stroke(); c.globalAlpha = 1;
      c.strokeStyle = ink; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath();
      for (let i = 0; i <= 260; i++) { const x = i / 260, v = S.lr * C.treeOut(b.trees[T - 1], [x]); const yy = z - v * 60; i ? c.lineTo(PX(x), yy) : c.moveTo(PX(x), yy); }
      c.stroke(); c.setLineDash([]);
      c.font = "700 11px Nunito, sans-serif"; c.fillStyle = muted; c.fillText("newest helper adds", 6, z - 26);
    }
    // the team's curve
    c.strokeStyle = acc; c.lineWidth = 4; c.lineJoin = "round"; c.beginPath();
    for (let i = 0; i <= 260; i++) { const x = i / 260, v = b.predict([x]); i ? c.lineTo(PX(x), PY(v)) : c.moveTo(PX(x), PY(v)); }
    c.stroke();
    for (let i = 0; i < N; i++) { c.beginPath(); c.arc(PX(S.d.X[i][0]), PY(S.d.y[i]), 4, 0, 7); c.fillStyle = ML.cssVar("--card"); c.fill(); c.strokeStyle = ink; c.lineWidth = 2; c.stroke(); }
  }
  function drawChart() {
    const c = cx, L = 32, R = 8, T = 10, B = 24, n = S.teC.length, xm = Math.max(10, n - 1), top = Math.max(0.5, S.teC[0] || 0.5);
    const X = (i) => L + (i / xm) * (CW - L - R), Y = (v) => CH - B - (Math.min(top, v) / top) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); const muted = ML.cssVar("--muted");
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0, top / 2, top].forEach((v) => { c.fillText(f2(v), L - 4, Y(v) + 3); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); });
    c.setLineDash([3, 3]); c.strokeStyle = muted; c.beginPath(); c.moveTo(L, Y(NOISE)); c.lineTo(CW - R, Y(NOISE)); c.stroke(); c.setLineDash([]);
    c.textAlign = "center"; c.fillText("helpers", (L + CW - R) / 2, CH - 4);
    const line = (arr, col) => { c.strokeStyle = col; c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke(); };
    line(S.trC, ML.cssVar("--good")); line(S.teC, ML.cssVar("--accent"));
  }
  const hit = (key, msg) => { if (S.hits[key]) return; S.hits[key] = 1; $("c-" + key).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (Object.keys(S.hits).length === 4) ML.confetti(40); };
  function checks() {
    const T = S.b.trees.length;
    if (S.stepsClicked >= 3) hit("step", "Each helper only learned the leftovers, and the sticks got shorter.");
    if (S.depth === 1 && T && S.teC[T] < 0.18) hit("fit", "Lots of one-question stumps added up to a wiggly curve.");
    if (S.lr <= 0.1 + 1e-9 && T >= 100) hit("slow", "Tiny steps need more helpers, but they rarely overshoot.");
    if (S.lr >= 1 - 1e-9 && S.depth === 3 && T && S.trC[T] < 0.05) hit("over", `Training error ${f2(S.trC[T])}, fresh dots ${f2(S.teC[T])}. It learned the noise too: that is overfitting.`);
  }
  $("step").addEventListener("click", () => {
    S.stepsClicked++; S.b.step(); refresh(); const T = S.b.trees.length;
    ML.say(`Helper <b>${T}</b> learned the leftovers and nudged the curve. Fresh-dot error is now <b>${f2(S.teC[T])}</b> (it was ${f2(S.teC[T - 1])}).`);
  });
  $("ten").addEventListener("click", () => { for (let i = 0; i < 10; i++) S.b.step(); refresh(); ML.say(`Ten more helpers. Fresh-dot error: <b>${f2(S.teC[S.b.trees.length])}</b>. The dashed line on the chart is the noise floor: nobody can beat it.`); });
  $("auto").addEventListener("click", () => {
    if (S.timer) { stop(); return; }
    $("auto").innerHTML = `${ML.icon("pause")} Stop`;
    S.timer = setInterval(() => { if (S.b.trees.length >= 150) { stop(); ML.say(`150 helpers. Fresh-dot error <b>${f2(S.teC[150])}</b>.`); return; } S.b.step(); refresh(); }, reduce ? 30 : 160);
  });
  $("reset").addEventListener("click", () => { build(); ML.say("Back to a flat average guess."); });
  $("newdata").addEventListener("click", () => { newData(); ML.say("New dots from the same year. Press Add one helper."); });
  ML.bindRange("#lr", (v) => v.toFixed(2), (v) => { S.lr = v; if (S.d) build(); });
  $("depth").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-d]"); if (!btn) return;
    S.depth = +btn.dataset.d; $("depth").querySelectorAll("button").forEach((x) => x.classList.toggle("primary", x === btn)); build();
    ML.say(S.depth === 1 ? "Stumps ask one question each: before or after a date?" : `Each helper now asks up to ${S.depth} questions in a row, so it can cut the year into ${2 ** S.depth} pieces.`);
  });
  const redraw = () => { draw(); drawChart(); };
  new MutationObserver(redraw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", redraw); window.addEventListener("load", redraw);
  newData();
})();
