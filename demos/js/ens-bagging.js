// Vote of Many Trees page. Logic lives in ens-bagging-core.js (BaggingCore).
(function () {
  const C = window.BaggingCore, $ = (id) => document.getElementById(id);
  const MW = 200, RES = 36, CW = 300, CH = 170, NTRAIN = 120, NTEST = 400;
  const mc = { one: ML.setupCanvas($("m-one"), MW, MW).ctx, bag: ML.setupCanvas($("m-bag"), MW, MW).ctx, peek: ML.setupCanvas($("m-peek"), MW, MW).ctx };
  const cc = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 1, trees: 25, depth: 6, noise: 15, ready: false, peek: -1, seen: new Set(), hits: {}, m: null };
  const pct = (v) => Math.round(v * 100) + "%";

  function train() {
    const nz = S.noise / 100, d = C.moons(S.seed, NTRAIN, nz), te = C.moons(S.seed + 999, NTEST, nz);
    const one = C.singleTree(d, S.depth), bag = C.bag(d, C.MAXT, S.depth, S.seed + 5);
    S.m = { d, te, one, bag, oneAcc: C.accOf((x) => C.treeClass(one, x), te.X, te.y), bagCurve: C.accCurve(bag, te.X, te.y), oobCurve: C.oobCurve(bag, d),
      oneGrid: C.grid((x) => C.treeClass(one, x), RES) };
  }
  function bagGrid() { const k = S.trees, t = S.m.bag; return C.grid((x) => C.vote(t, k, x) / k, RES); }

  function drawMap(c, grid, pts, peekCounts) {
    const col0 = ML.cssVar("--warn"), col1 = ML.cssVar("--accent"), ink = ML.cssVar("--ink"), cell = MW / RES;
    c.clearRect(0, 0, MW, MW);
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const v = grid[j * RES + i], x = i * cell, y = (RES - 1 - j) * cell;
      c.globalAlpha = 0.5 * (1 - v); c.fillStyle = col0; c.fillRect(x, y, cell + 0.5, cell + 0.5);
      c.globalAlpha = 0.5 * v; c.fillStyle = col1; c.fillRect(x, y, cell + 0.5, cell + 0.5);
    }
    c.globalAlpha = 1;
    const { X, y } = pts;
    for (let i = 0; i < X.length; i++) {
      const cnt = peekCounts ? peekCounts[i] : 1, r = peekCounts ? (cnt === 0 ? 3.2 : 2.6 + Math.min(3, cnt - 1) * 1.4) : 3;
      const px = X[i][0] * MW, py = (1 - X[i][1]) * MW, col = y[i] ? col1 : col0;
      c.beginPath(); c.arc(px, py, r, 0, 7);
      if (peekCounts && cnt === 0) { c.fillStyle = ML.cssVar("--card"); c.fill(); c.strokeStyle = col; c.lineWidth = 1.6; c.stroke(); }
      else { c.fillStyle = col; c.fill(); c.strokeStyle = ink; c.lineWidth = 0.8; c.stroke(); }
    }
  }
  function drawChart() {
    const c = cc, m = S.m, L = 32, R = 8, T = 10, B = 24, lo = 0.5, hi = 1, T_ = C.MAXT;
    const X = (k) => L + ((k - 1) / (T_ - 1)) * (CW - L - R), Y = (v) => CH - B - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); const muted = ML.cssVar("--muted");
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0.5, 0.75, 1].forEach((v) => { c.fillText(pct(v), L - 4, Y(v) + 3); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); });
    c.textAlign = "center"; c.fillText("number of trees", (L + CW - R) / 2, CH - 4);
    const draw = (arr, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => (i ? c.lineTo(X(i + 1), Y(v)) : c.moveTo(X(i + 1), Y(v)))); c.stroke(); };
    c.setLineDash([4, 3]); c.strokeStyle = muted; c.lineWidth = 2; c.beginPath(); c.moveTo(L, Y(m.oneAcc)); c.lineTo(CW - R, Y(m.oneAcc)); c.stroke(); c.setLineDash([]);
    draw(m.oobCurve, ML.cssVar("--good"), 2); draw(m.bagCurve, ML.cssVar("--accent"), 2.5);
    c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(X(S.trees), T); c.lineTo(X(S.trees), CH - B); c.stroke(); c.setLineDash([]);
  }
  function drawPeek() {
    const m = S.m;
    if (S.peek < 0) { drawMap(mc.peek, m.oneGrid.map(() => 0.5), { X: [], y: [] }); $("cap-peek").textContent = "Press Peek to see one tree"; return; }
    const t = m.bag[S.peek];
    drawMap(mc.peek, C.grid((x) => C.treeClass(t.tree, x), RES), m.d, t.counts);
    const left = t.counts.filter((v) => v === 0).length;
    $("cap-peek").textContent = `Tree #${S.peek + 1}: left out ${left} of ${NTRAIN} dots`;
  }
  let raf = 0;
  function render() {
    if (!S.m) return;
    const m = S.m, k = S.trees;
    drawMap(mc.one, m.oneGrid, m.d); drawMap(mc.bag, bagGrid(), m.d); drawPeek(); drawChart();
    $("cap-bag").textContent = `Vote of ${k} tree${k > 1 ? "s" : ""}`;
    const bagA = m.bagCurve[k - 1], oobA = m.oobCurve[k - 1];
    $("a-one").textContent = pct(m.oneAcc); $("a-bag").textContent = pct(bagA); $("a-oob").textContent = pct(oobA);
    checks(bagA, oobA);
  }
  const hit = (key, msg) => { if (S.hits[key]) return; S.hits[key] = 1; $("c-" + key).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (Object.keys(S.hits).length === 4) ML.confetti(40); };
  function checks(bagA, oobA) {
    if (S.seen.size >= 3) hit("peek", "Each tree saw a different shuffled copy and made different cuts.");
    if (S.trees >= 25 && bagA - S.m.oneAcc >= 0.02) hit("beat", "The vote beat the lone tree. Teamwork!");
    if (S.trees >= 30 && Math.abs(bagA - oobA) <= 0.04) hit("oob", "Out-of-bag matched the fresh-dots score without needing any extra data.");
    if (S.depth === 1 && S.trees >= 40) hit("stump", "Voting stumps still gives straight-cut shapes: averaging fixes noise, not a too-simple tree.");
  }
  function retrain(msg) { train(); render(); if (msg) ML.say(msg); }
  ML.bindRange("#trees", (v) => String(v), (v) => {
    S.trees = v; if (!S.ready) return; render();
    const m = S.m; ML.say(v === 1 ? `One tree: <b>${pct(m.bagCurve[0])}</b> on fresh dots.` : `${v} trees voting: <b>${pct(m.bagCurve[v - 1])}</b> on fresh dots, against <b>${pct(m.oneAcc)}</b> for the lone tree.`);
  });
  ML.bindRange("#depth", (v) => String(v), (v) => { S.depth = v; if (S.ready) retrain(v === 1 ? "Depth 1 means each tree makes a single cut. Weak trees, even many together, draw only boxy shapes." : `Trees can now ask up to <b>${v}</b> questions in a row.`); });
  ML.bindRange("#noise", (v) => v + "%", (v) => { S.noise = v; if (S.ready) retrain(`<b>${v}%</b> of the labels are wrong now. See which map gets more ragged: the lone tree chases the mistakes.`); });
  $("newdata").addEventListener("click", () => { S.seed = 1 + Math.floor(Math.random() * 90000); S.peek = -1; retrain("Fresh dots and fresh shuffles."); });
  $("peek").addEventListener("click", () => {
    S.peek = (S.peek + 1) % C.MAXT; S.seen.add(S.peek); drawPeek();
    ML.say("Here is just <b>one</b> tree and the shuffled copy it saw. Hollow dots were left out, big dots were drawn more than once. Press again for another tree.");
    checks(S.m.bagCurve[S.trees - 1], S.m.oobCurve[S.trees - 1]);
  });
  const redraw = () => render();
  new MutationObserver(redraw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", redraw); window.addEventListener("load", redraw);
  S.seed = 1 + Math.floor(Math.random() * 90000); S.ready = true; train(); render();
})();
