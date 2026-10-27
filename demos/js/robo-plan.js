// Find a Way Around page. Logic lives in robo-plan-core.js (PlanCore).
(function () {
  const C = window.PlanCore, $ = (id) => document.getElementById(id);
  const probe = document.createElement("i"); probe.style.display = "none"; document.body.appendChild(probe);
  const rc = (n) => { probe.style.color = "var(" + n + ")"; return getComputedStyle(probe).color; };
  const al = (c, a) => c.replace("rgb(", "rgba(").replace(")", ", " + a + ")");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CW = C.W, CH = C.H, { ctx: cx } = ML.setupCanvas($("cv"), CW, CH), cv = $("cv");
  const S = { g: new C.Grid(), start: [30, 120], goal: [370, 120], tool: "move", drag: null, rrt: null, rpath: null, spath: null, ast: null, running: false, seed: 1 + Math.floor(Math.random() * 9999), hits: {}, preset: "scatter", msg: "" };
  const len = (p) => (C.plen(p) / C.CELL);

  function resetPlans() { S.rrt = null; S.rpath = null; S.spath = null; S.ast = null; S.running = false; S.msg = ""; stats(); draw(); }
  function ensure() { if (!S.rrt) S.rrt = new C.RRT(S.g, S.start, S.goal, S.seed++); return S.rrt; }
  function stepN(n) {
    if (!S.g.pointFree(...S.start) || !S.g.pointFree(...S.goal)) { S.msg = "The start or goal is inside a wall. Move it out."; stats(); return; }
    const t = ensure(); for (let i = 0; i < n && t.found < 0 && !t.failed; i++) t.iterate();
    if (t.found >= 0 && !S.rpath) { S.rpath = t.path(); S.msg = `RRT found a way with ${t.nodes.length} twigs.`; ML.say(`<b>Found it!</b> The tree reached the goal after ${t.iters} tries. The path is wiggly, so try <b>Smooth</b>.`); }
    if (t.failed) { S.running = false; S.msg = "RRT gave up after 4000 tries. Is there really a way through?"; }
    stats(); draw(); check();
  }
  function stats() {
    const t = S.rrt;
    $("s-n").textContent = t ? t.nodes.length : 0; $("s-rl").textContent = S.rpath ? len(S.rpath).toFixed(1) : "-"; $("s-sl").textContent = S.spath ? len(S.spath).toFixed(1) : "-";
    $("s-ae").textContent = S.ast ? S.ast.explored.length : "-"; $("s-al").textContent = S.ast ? (S.ast.path ? len(S.ast.path).toFixed(1) : "none") : "-";
    $("verdict").textContent = S.msg || "Press Run RRT, or draw some walls first.";
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Tree: <b>${t ? t.nodes.length : 0}</b> twigs after <b>${t ? t.iters : 0}</b> random tries.</span></div><div class="mono">${t && t.iters ? "Rejected (hit a wall): " + (t.iters - (t.nodes.length - 1 - (t.found >= 0 ? 1 : 0))) : "No tries yet"}</div>`;
  }
  const CH_DEF = {
    find: () => S.rpath && "You found a path with random sampling alone!",
    smooth: () => S.rpath && S.spath && len(S.spath) <= 0.98 * len(S.rpath) && "Shortcuts made the path shorter and straighter.",
    astar: () => S.ast && S.ast.path && "A* found the shortest grid path, but it searched a lot of squares.",
    gap: () => S.preset === "gap" && S.rpath && "RRT squeezed through the narrow gap. Random sampling can find tiny openings.",
    block: () => S.ast && !S.ast.path && S.g.pointFree(...S.start) && S.g.pointFree(...S.goal) && "No way through. A* proved it by searching everywhere.",
  };
  function check() { for (const k in CH_DEF) { if (S.hits[k]) continue; const m = CH_DEF[k](); if (m) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); if (k === "find") ML.confetti(30); } } }

  function draw() {
    const ink = rc("--ink"), acc = rc("--accent"), good = rc("--good"), warn = rc("--warn"), line = rc("--line");
    cx.clearRect(0, 0, CW, CH);
    cx.strokeStyle = al(line, 0.6); cx.lineWidth = 1; cx.beginPath();
    for (let x = 0; x <= CW; x += C.CELL * 2) { cx.moveTo(x, 0); cx.lineTo(x, CH); } for (let y = 0; y <= CH; y += C.CELL * 2) { cx.moveTo(0, y); cx.lineTo(CW, y); } cx.stroke();
    if (S.ast) { cx.fillStyle = al(warn, 0.22); S.ast.explored.forEach((c) => cx.fillRect(c[0] * C.CELL, c[1] * C.CELL, C.CELL, C.CELL)); }
    cx.fillStyle = al(ink, 0.8); for (let y = 0; y < C.GH; y++) for (let x = 0; x < C.GW; x++) if (S.g.a[y * C.GW + x]) cx.fillRect(x * C.CELL, y * C.CELL, C.CELL, C.CELL);
    const t = S.rrt;
    if (t) { cx.strokeStyle = al(acc, 0.7); cx.lineWidth = 1.2; cx.beginPath(); for (let i = 1; i < t.nodes.length; i++) { const a = t.nodes[i], b = t.nodes[t.parent[i]]; cx.moveTo(b[0], b[1]); cx.lineTo(a[0], a[1]); } cx.stroke(); }
    const poly = (p, c, w, d) => { if (!p) return; cx.strokeStyle = c; cx.lineWidth = w; cx.setLineDash(d || []); cx.lineJoin = "round"; cx.beginPath(); p.forEach((q, i) => i ? cx.lineTo(q[0], q[1]) : cx.moveTo(q[0], q[1])); cx.stroke(); cx.setLineDash([]); };
    poly(S.ast && S.ast.path, warn, 3.5); poly(S.rpath, good, 3); poly(S.spath, ink, 3, [6, 4]);
    cx.fillStyle = good; cx.strokeStyle = "#fff"; cx.lineWidth = 2; cx.beginPath(); cx.arc(S.start[0], S.start[1], 8, 0, 7); cx.fill(); cx.stroke();
    cx.fillStyle = rc("--bad"); cx.beginPath(); cx.moveTo(S.goal[0], S.goal[1] - 10); cx.lineTo(S.goal[0] + 9, S.goal[1] + 7); cx.lineTo(S.goal[0] - 9, S.goal[1] + 7); cx.closePath(); cx.fill(); cx.stroke();
  }
  // ---- editing ----
  function paint(p, v) {
    const cxl = Math.floor(p.x / C.CELL), cyl = Math.floor(p.y / C.CELL), sc = [Math.floor(S.start[0] / C.CELL), Math.floor(S.start[1] / C.CELL)], gc = [Math.floor(S.goal[0] / C.CELL), Math.floor(S.goal[1] / C.CELL)];
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) { const x = cxl + dx - (v ? 0 : 0), y = cyl + dy; if (v && ((x === sc[0] && y === sc[1]) || (x === gc[0] && y === gc[1]))) continue; S.g.set(x, y, v); }
  }
  let lastP = null;
  function pt(e) { const p = ML.canvasPoint(cv, e, CW, CH); return { x: Math.max(1, Math.min(CW - 1, p.x)), y: Math.max(1, Math.min(CH - 1, p.y)) }; }
  cv.addEventListener("pointerdown", (e) => {
    const p = pt(e); cv.setPointerCapture(e.pointerId); lastP = p;
    if (S.tool === "move") { const ds = Math.hypot(p.x - S.start[0], p.y - S.start[1]), dg = Math.hypot(p.x - S.goal[0], p.y - S.goal[1]); S.drag = ds < 18 && ds <= dg ? "start" : dg < 18 ? "goal" : null; }
    else { S.drag = "paint"; paint(p, S.tool === "draw"); S.preset = "custom"; resetPlans(); }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!S.drag) return; const p = pt(e);
    if (S.drag === "paint") { const n = Math.ceil(Math.hypot(p.x - lastP.x, p.y - lastP.y) / 4); for (let i = 1; i <= n; i++) paint({ x: lastP.x + (p.x - lastP.x) * i / n, y: lastP.y + (p.y - lastP.y) * i / n }, S.tool === "draw"); lastP = p; }
    else { S[S.drag] = [p.x, p.y]; lastP = p; }
    S.rrt = null; S.rpath = S.spath = S.ast = null; S.running = false; S.msg = ""; stats(); draw();
  });
  const up = () => { S.drag = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  function setTool(t) { S.tool = t; ["move", "draw", "erase"].forEach((k) => $("t-" + k).classList.toggle("on", k === t)); cv.style.cursor = t === "move" ? "grab" : "crosshair"; }
  ["move", "draw", "erase"].forEach((k) => $("t-" + k).addEventListener("click", () => setTool(k)));
  const preset = (n) => { if (n === "open") S.g.clear(); else C.PRESETS[n](S.g, 3 + Math.floor(Math.random() * 99)); S.preset = n; S.start = [30, 120]; S.goal = [370, 120]; resetPlans(); if (n === "gap") ML.say("A <b>narrow gap</b>: only two squares wide. Random twigs must luckily poke through it!"); };
  ["open", "wall", "gap", "scatter"].forEach((n) => $("p-" + n).addEventListener("click", () => preset(n)));

  // ---- buttons ----
  $("b-step").addEventListener("click", () => stepN(10));
  let raf = 0;
  $("b-run").addEventListener("click", () => {
    cancelAnimationFrame(raf); if (S.rrt && (S.rrt.found >= 0 || S.rrt.failed)) { S.rrt = null; S.rpath = null; S.spath = null; }
    if (reduce) { stepN(4000); return; }
    S.running = true; const go = () => { if (!S.running) return; stepN(12); const t = S.rrt; if (t && (t.found >= 0 || t.failed)) S.running = false; else raf = requestAnimationFrame(go); }; go();
  });
  $("b-smooth").addEventListener("click", () => {
    if (!S.rpath) { ML.toast("Find a path with RRT first."); return; }
    S.spath = C.smooth(S.rpath, S.g, S.seed++, 300); const a = len(S.rpath), b = len(S.spath);
    S.msg = `Smoothing: ${a.toFixed(1)} to ${b.toFixed(1)} squares (${Math.round((1 - b / a) * 100)}% shorter).`; ML.say(`<b>Snip snip!</b> Straight shortcuts made the path ${Math.round((1 - b / a) * 100)}% shorter.`); stats(); draw(); check();
  });
  $("b-astar").addEventListener("click", () => {
    S.ast = C.astar(S.g, S.start, S.goal);
    S.msg = S.ast.path ? `A* checked ${S.ast.explored.length} squares and found a path of ${len(S.ast.path).toFixed(1)}.` : "A* searched everywhere reachable: there is no path.";
    ML.say(S.ast.path ? `<b>A*</b> looked at ${S.ast.explored.length} squares to find the shortest grid path.` : "<b>No way through!</b> A* checked every square it could reach.");
    stats(); draw(); check();
  });
  $("b-clear").addEventListener("click", resetPlans);
  document.addEventListener("themechange", draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  setTool("move"); preset("scatter");
})();
