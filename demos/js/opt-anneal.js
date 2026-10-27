// Cool Down to Solve page. Logic lives in opt-anneal-core.js (AnnealCore).
(function () {
  const C = window.AnnealCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = 300, CW = 300, CH = 150, NC = 20;
  const hx = ML.setupCanvas($("cv-h"), W, W).ctx, sx = ML.setupCanvas($("cv-s"), W, W).ctx, cx = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 1, cities: [], tour0: [], h: null, s: null, known: 0, total: 8000, hist: [], timer: 0, done: false, hits: {}, T: 40 };

  function setup(newCities) {
    stop();
    if (newCities) S.seed = 1 + Math.floor(Math.random() * 90000);
    if (newCities || !S.cities.length) { S.cities = C.cities(S.seed, NC); S.known = C.bestKnown(S.cities, S.seed); }
    S.tour0 = C.randomTour(S.seed + 7, NC);
    S.h = new C.Solver(S.cities, S.tour0, "hill", S.seed + 1); S.s = new C.Solver(S.cities, S.tour0, "sa", S.seed + 2);
    S.total = +$("steps").value; S.hist = [{ h: S.h.len, s: S.s.len }]; S.done = false; S.T = +$("t0").value;
    if (newCities) { S.hits = {}; document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done")); }
    draw();
  }
  function route(c, solver, col) {
    const P = (i) => [S.cities[i].x * 2.88 + 6, S.cities[i].y * 2.88 + 6], t = solver.tour;
    c.clearRect(0, 0, W, W); c.strokeStyle = ML.cssVar(col); c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath();
    t.forEach((id, i) => { const [x, y] = P(id); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke();
    S.cities.forEach((_, i) => { const [x, y] = P(i); c.fillStyle = ML.cssVar("--card"); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 2; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); c.stroke(); });
    c.fillStyle = ML.cssVar("--ink"); c.font = "800 12px Nunito, sans-serif"; c.textAlign = "left"; c.fillText(solver.len.toFixed(0), 8, 16);
  }
  function chart() {
    const c = cx, L = 34, R = 6, T = 8, B = 20, n = S.hist.length, xm = Math.max(10, n - 1);
    const hi = Math.max(S.hist[0].h, S.hist[0].s, 1) * 1.02, lo = Math.max(0, S.known * 0.8);
    const X = (i) => L + (i / xm) * (CW - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); c.font = "700 10px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right";
    [lo + 0, (lo + hi) / 2, hi].forEach((v) => c.fillText(v.toFixed(0), L - 4, Y(v) + 3)); c.textAlign = "center"; c.fillText("steps", (L + CW - R) / 2, CH - 5);
    c.strokeStyle = ML.cssVar("--good"); c.setLineDash([4, 3]); c.lineWidth = 2; c.beginPath(); c.moveTo(L, Y(S.known)); c.lineTo(CW - R, Y(S.known)); c.stroke(); c.setLineDash([]);
    [["h", "--bad"], ["s", "--accent"]].forEach(([k, col]) => {
      c.strokeStyle = ML.cssVar(col); c.lineWidth = 2; c.lineJoin = "round"; c.beginPath();
      S.hist.forEach((p, i) => { const y = Math.max(T, Math.min(CH - B, Y(p[k]))); i ? c.lineTo(X(i), y) : c.moveTo(X(i), y); }); c.stroke();
    });
  }
  function draw() {
    route(hx, S.h, "--bad"); route(sx, S.s, "--accent"); chart();
    const T = S.T;
    $("lh").textContent = S.h.len.toFixed(0); $("ls").textContent = S.s.len.toFixed(0); $("lb").textContent = S.known.toFixed(0); $("wa").textContent = S.s.worseAccepted;
    $("tnow").textContent = T.toFixed(T < 1 ? 2 : 1); $("tbar").style.width = Math.max(2, Math.min(100, (T / Math.max(1, +$("t0").value)) * 100)) + "%";
    $("prog").textContent = `· step ${S.s.steps} of ${S.total}`;
    check();
  }
  const msgs = { near: "The annealer found a near-perfect route!", beat: "Annealing beat the greedy climber.", stuck: "The greedy robot got stuck in a dip.", worse: "Accepting worse routes on purpose is the whole trick." };
  function check() {
    const fin = S.done, ok = {
      near: fin && S.s.best <= S.known * 1.05, beat: fin && S.s.best < S.h.best - 1e-6,
      stuck: fin && S.h.best >= S.known * 1.03, worse: S.s.worseAccepted >= 100,
    };
    for (const k in ok) if (ok[k] && !S.hits[k]) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msgs[k]); ML.say(`<b>Challenge done!</b> ${msgs[k]}`); if (k === "near") ML.confetti(40); }
  }
  function frame() {
    const per = Math.max(1, Math.ceil(S.total / (reduce ? 40 : 240)));
    for (let i = 0; i < per && S.s.steps < S.total; i++) {
      S.T = C.temp(S.s.steps, S.total, +$("t0").value); S.s.step(S.T); S.h.step(0);
      if (S.s.steps % 8 === 0) S.hist.push({ h: S.h.len, s: S.s.len });
    }
    if (S.s.steps >= S.total) {
      S.done = true; S.T = C.temp(S.total, S.total, +$("t0").value);
      // show the best routes at the end
      S.s.tour = S.s.bestTour.slice(); S.s.len = S.s.best; S.h.tour = S.h.bestTour.slice(); S.h.len = S.h.best; S.hist.push({ h: S.h.len, s: S.s.len });
      stop(); const gap = ((S.s.best / S.known - 1) * 100), gh = ((S.h.best / S.known - 1) * 100);
      draw();
      ML.say(`Done! Greedy: <b>${S.h.best.toFixed(0)}</b> (${gh.toFixed(1)}% above best known). Annealer: <b>${S.s.best.toFixed(0)}</b> (${gap.toFixed(1)}% above). It accepted ${S.s.worseAccepted} worse routes on the way.`);
      return;
    }
    draw();
  }
  function stop() { cancelAnimationFrame(S.timer); S.timer = 0; $("run").innerHTML = `${ML.icon("play")} Run`; }
  function loop() { frame(); if (S.timer) S.timer = requestAnimationFrame(loop); }
  $("run").addEventListener("click", () => {
    if (S.timer) { stop(); return; }
    if (S.done) setup(false);
    $("run").innerHTML = `${ML.icon("pause")} Pause`; S.timer = requestAnimationFrame(loop);
    ML.say("Hot at first: I accept some bad moves. Watch the temperature bar fall and my line settle.");
  });
  $("again").addEventListener("click", () => { setup(false); ML.say("Same cities, new messy start. Try another cooling plan!"); });
  $("newc").addEventListener("click", () => { setup(true); ML.say("Twenty brand new towns."); });
  ML.bindRange("#t0", (v) => v, () => { if (!S.timer && S.s && S.s.steps === 0) { S.T = +$("t0").value; draw(); } });
  ML.bindRange("#steps", (v) => v + " steps", () => { if (S.s && S.s.steps === 0) { S.total = +$("steps").value; draw(); } });
  new MutationObserver(() => S.h && draw()).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => S.h && draw());
  window.AnnealPage = S;
  setup(true);
})();
