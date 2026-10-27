// Learn from Mistakes page. Logic lives in ens-boost-core.js (BoostCore).
(function () {
  const C = window.BoostCore, $ = (id) => document.getElementById(id);
  const MW = 420, RES = 40, CW = 300, CH = 160, N = 90;
  const mx = ML.setupCanvas($("map"), MW, MW).ctx, cx = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 1, d: null, te: null, ab: null, timer: 0, hits: {}, stepsClicked: 0, testCurve: [], trainCurve: [], gridSc: null };
  const pct = (v) => Math.round(v * 100) + "%";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function newData() {
    stop(); S.seed = 1 + Math.floor(Math.random() * 90000);
    S.d = C.ring(S.seed, N); S.te = C.ring(S.seed + 50, 500); S.ab = new C.AdaBoost(S.d.X, S.d.y, 1);
    S.hits = {}; S.stepsClicked = 0; document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    refresh();
  }
  function reset() { stop(); S.ab.reset(); S.stepsClicked = 0; refresh(); ML.say("Back to round 0. Every dot is the same size."); }
  function stop() { clearInterval(S.timer); S.timer = 0; $("auto").innerHTML = `${ML.icon("play")} Auto`; }

  function refresh() {
    const ab = S.ab, T = ab.learners.length;
    S.testCurve = ab.accCurve(S.te.X, S.te.y); S.trainCurve = ab.accCurve(S.d.X, S.d.y);
    $("round").textContent = T;
    const last = ab.learners[T - 1];
    const lastAcc = last ? 1 - last.err : null; // weighted accuracy of newest helper on the weights it saw
    $("s-last").textContent = last ? pct(1 - ab.lastWrong.filter(Boolean).length / N) : "-";
    $("s-test").textContent = pct(S.testCurve[T]);
    $("s-big").textContent = ab.maxWeightRatio().toFixed(1) + "x";
    renderInside(); draw(); drawChart(); checks();
  }
  function renderInside() {
    const ab = S.ab, T = ab.learners.length, host = $("inside");
    if (!T) { host.innerHTML = `<div class="sig"><span>No helpers yet. Press <b>Add one helper</b>.</span></div>`; return; }
    const rows = ab.learners.slice(-5).map((L, i) => {
      const k = T - Math.min(5, T) + i + 1, axis = L.f === 0 ? "left/right" : L.f === 1 ? "up/down" : "no";
      return `<div class="sig"><span class="mono">#${k}: ${axis} cut${L.f >= 0 ? " at " + L.t.toFixed(2) : ""} · mistakes ${(L.err * 100).toFixed(0)}% · vote size <b>${L.alpha.toFixed(2)}</b></span></div>`;
    }).join("");
    host.innerHTML = rows + `<div class="decision">${T > 5 ? "(last 5 shown) " : ""}Louder vote = fewer mistakes. Each new helper looks at the dots the others got wrong.</div>`;
  }

  function draw() {
    const c = mx, ab = S.ab, T = ab.learners.length, cell = MW / RES, col0 = ML.cssVar("--warn"), col1 = ML.cssVar("--accent"), ink = ML.cssVar("--ink");
    c.clearRect(0, 0, MW, MW);
    if (T) {
      // background: combined score squashed to 0..1
      let mxs = 1e-9; const sc = [];
      for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) { const s = ab.score([(i + 0.5) / RES, (j + 0.5) / RES]); sc.push(s); mxs = Math.max(mxs, Math.abs(s)); }
      for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
        const s = sc[j * RES + i], a = 0.12 + 0.4 * Math.tanh(Math.abs(s) / (0.5 * mxs + 0.5));
        c.globalAlpha = a; c.fillStyle = s > 0 ? col1 : col0; c.fillRect(i * cell, (RES - 1 - j) * cell, cell + 0.5, cell + 0.5);
      }
      c.globalAlpha = 1;
      const L = ab.learners[T - 1]; // newest cut
      if (L.f >= 0) { c.strokeStyle = ink; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); if (L.f === 0) { c.moveTo(L.t * MW, 0); c.lineTo(L.t * MW, MW); } else { c.moveTo(0, (1 - L.t) * MW); c.lineTo(MW, (1 - L.t) * MW); } c.stroke(); c.setLineDash([]); }
    }
    for (let i = 0; i < N; i++) {
      const r = Math.min(16, Math.max(3, 3.2 * Math.sqrt(ab.w[i] * N))), px = S.d.X[i][0] * MW, py = (1 - S.d.X[i][1]) * MW;
      c.beginPath(); c.arc(px, py, r, 0, 7); c.fillStyle = S.d.y[i] ? col1 : col0; c.fill();
      c.strokeStyle = ink; c.lineWidth = T && ab.lastWrong[i] ? 3 : 1; c.stroke();
    }
  }
  function drawChart() {
    const c = cx, L = 32, R = 8, T = 10, B = 24, n = S.testCurve.length, xm = Math.max(10, n - 1);
    const X = (i) => L + (i / xm) * (CW - L - R), Y = (v) => CH - B - ((Math.max(0.4, v) - 0.4) / 0.6) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); const muted = ML.cssVar("--muted");
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0.5, 0.75, 1].forEach((v) => { c.fillText(pct(v), L - 4, Y(v) + 3); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); });
    c.textAlign = "center"; c.fillText("rounds", (L + CW - R) / 2, CH - 4);
    const draw = (arr, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke(); };
    draw(S.trainCurve, ML.cssVar("--good"), 2); draw(S.testCurve, ML.cssVar("--accent"), 2.5);
  }
  const hit = (key, msg) => { if (S.hits[key]) return; S.hits[key] = 1; $("c-" + key).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (Object.keys(S.hits).length === 4) ML.confetti(40); };
  function checks() {
    const T = S.ab.learners.length;
    if (S.stepsClicked >= 3) hit("step", "Three rounds, one at a time. See how the big dots change?");
    if (S.ab.maxWeightRatio() >= 2) hit("hard", "A dot that keeps getting missed is now more than twice its starting size.");
    if (T && S.testCurve[T] >= 0.9) hit("acc", "Many one-cut helpers together beat a hard puzzle that no single cut could solve.");
    if (T >= 40) hit("long", "40 rounds in!");
  }
  function addOne() { const L = S.ab.step(); refresh(); return L; }
  $("step").addEventListener("click", () => {
    S.stepsClicked++; const L = addOne(), T = S.ab.learners.length, wrong = S.ab.lastWrong.filter(Boolean).length;
    ML.say(`Helper <b>${T}</b> made one ${L.f === 0 ? "left/right" : "up/down"} cut and got <b>${wrong}</b> of ${N} dots wrong. Those dots just grew. All together we are at <b>${pct(S.testCurve[T])}</b> on fresh dots.`);
  });
  $("ten").addEventListener("click", () => { for (let i = 0; i < 10; i++) S.ab.step(); refresh(); ML.say(`Ten more helpers. Fresh-dot score: <b>${pct(S.testCurve[S.ab.learners.length])}</b>.`); });
  $("auto").addEventListener("click", () => {
    if (S.timer) { stop(); return; }
    $("auto").innerHTML = `${ML.icon("pause")} Stop`;
    S.timer = setInterval(() => { if (S.ab.learners.length >= 60) { stop(); ML.say(`60 rounds done. Fresh-dot score: <b>${pct(S.testCurve[60])}</b>.`); return; } addOne(); }, reduce ? 30 : 250);
  });
  $("reset").addEventListener("click", reset);
  $("newdata").addEventListener("click", () => { newData(); ML.say("New dots, new puzzle. Press Add one helper."); });
  const redraw = () => { draw(); drawChart(); };
  new MutationObserver(redraw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", redraw); window.addEventListener("load", redraw);
  newData();
})();
