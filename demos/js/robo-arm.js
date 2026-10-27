// Reach with Maths page. Logic lives in robo-arm-core.js (ArmCore).
(function () {
  const probe = document.createElement("i"); probe.style.display = "none"; document.body.appendChild(probe);
  const rc = (n) => { probe.style.color = "var(" + n + ")"; return getComputedStyle(probe).color; };
  const al = (c, a) => c.replace("rgb(", "rgba(").replace(")", ", " + a + ")");
  const C = window.ArmCore, $ = (id) => document.getElementById(id);
  const L1 = 100, L2 = 70, CW = 400, CH = 270, OX = 200, OY = 235;
  const { ctx: cx } = ML.setupCanvas($("cv"), CW, CH);
  const cv = $("cv"), rnd = ML.seeded(1 + Math.floor(Math.random() * 99999));
  const S = { mode: "ik", handle: { x: 90, y: 80 }, elbow: "down", fk: [40 * C.D2R, 80 * C.D2R], star: null, stars: 0, hits: {}, flipped: false, drag: false, pose: null };
  const sx = (x) => OX + x, sy = (y) => OY - y;
  const limits = () => ({ s: [-30, 200], e: [-10, +$("elim").value] });
  const limOn = () => $("lim").checked;

  function newStar() {
    for (let i = 0; i < 20; i++) {
      S.star = C.randomTarget(rnd, L1, L2);
      if (!limOn()) break; const r = C.ik(L1, L2, S.star.x, S.star.y);
      if (r.solutions.some((s) => C.withinLimits(s, limits()))) break;
    }
  }
  function compute() {
    if (S.mode === "fk") {
      const f = C.fk(L1, L2, S.fk[0], S.fk[1]); S.pose = { hand: f, a1: S.fk[0], a2: S.fk[1], other: null, reachable: true, ok: true, ik: null };
      return;
    }
    const h = S.handle, r = C.ik(L1, L2, h.x, h.y);
    if (!r.reachable) {
      const d = Math.hypot(h.x, h.y) || 1, rr = C.reach(L1, L2), k = d > rr.max ? rr.max / d : rr.min / d, t = { x: h.x * k, y: h.y * k }, q = C.ik(L1, L2, t.x, t.y).solutions[0];
      S.pose = { hand: C.fk(L1, L2, q.a1, q.a2), a1: q.a1, a2: q.a2, other: null, reachable: false, ok: false, ik: r };
      return;
    }
    const idx = r.solutions.findIndex((s) => s.elbow === S.elbow), sol = r.solutions[idx], oth = r.solutions[1 - idx];
    S.pose = { hand: C.fk(L1, L2, sol.a1, sol.a2), a1: sol.a1, a2: sol.a2, other: oth, reachable: true, ok: !limOn() || C.withinLimits(sol, limits()), okOther: !limOn() || C.withinLimits(oth, limits()), ik: r };
  }
  function update() {
    compute(); const p = S.pose;
    $("a1").disabled = $("a2").disabled = S.mode !== "fk";
    if (S.mode === "ik") { $("a1").value = Math.round(p.a1 * C.R2D); $("a2").value = Math.round(p.a2 * C.R2D); document.querySelectorAll('[data-for="a1"]')[0].textContent = Math.round(p.a1 * C.R2D) + "°"; document.querySelectorAll('[data-for="a2"]')[0].textContent = Math.round(p.a2 * C.R2D) + "°"; }
    $("hx").textContent = Math.round(p.hand.x); $("hy").textContent = Math.round(p.hand.y); $("stars").textContent = S.stars;
    let v;
    if (S.mode === "fk") v = "Forward maths: the hand lands where the two angles say. Get it onto the star!";
    else if (!p.reachable) v = Math.hypot(S.handle.x, S.handle.y) > L1 + L2 ? "Too far! Even a fully stretched arm cannot reach there." : "Too close to the shoulder! The arm cannot fold that tight.";
    else if (!limOn()) v = `Two poses reach this spot: elbow ${S.elbow} (shown) and elbow ${S.elbow === "down" ? "up" : "down"} (ghost).`;
    else v = p.ok && p.okOther ? "Both poses are inside the joint limits." : p.ok ? "Only the shown pose fits inside the joint limits." : p.okOther ? "The shown pose breaks a joint limit. Flip the elbow!" : "Neither pose fits the joint limits.";
    $("verdict").textContent = v;
    renderInside(); check(); draw();
  }
  function renderInside() {
    const p = S.pose, r = p.ik;
    $("inside").innerHTML = S.mode === "fk" ? `<div class="mono">x = ${L1}·cos(${Math.round(p.a1 * C.R2D)}°) + ${L2}·cos(${Math.round((p.a1 + p.a2) * C.R2D)}°) = ${Math.round(p.hand.x)}</div><div class="mono">y = ${L1}·sin(${Math.round(p.a1 * C.R2D)}°) + ${L2}·sin(${Math.round((p.a1 + p.a2) * C.R2D)}°) = ${Math.round(p.hand.y)}</div>`
      : `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Distance to target: <b>${Math.round(r.d)}</b> (arm reaches ${Math.round(C.reach(L1, L2).min)} to ${C.reach(L1, L2).max})</span></div>` + (p.reachable ? `<div class="mono">cos(elbow) = (d² − ${L1}² − ${L2}²) / (2·${L1}·${L2}) = ${((r.d * r.d - L1 * L1 - L2 * L2) / (2 * L1 * L2)).toFixed(2)}</div><div class="mono">elbow = ±${Math.round(Math.abs(p.a2) * C.R2D)}°, shoulder = ${Math.round(p.a1 * C.R2D)}°</div>` : `<div class="decision">No solution: cos(elbow) would be outside −1 to 1.</div>`);
  }
  const CH_DEF = {
    reach: () => S.stars >= 3 && "Three stars! Every one needed its own joint angles.",
    both: () => S.flipped && S.mode === "ik" && S.pose.reachable && "Two different poses, same hand position. That is why IK has two answers.",
    far: () => S.mode === "ik" && !S.pose.reachable && "Out of reach: the triangle cannot close, so there is no solution.",
    limit: () => S.mode === "ik" && limOn() && S.pose.reachable && (S.pose.ok !== S.pose.okOther) && "Joint limits ruled out one of the two poses.",
    fk: () => S.mode === "fk" && S.gotStarFk && "You did forward kinematics by hand!",
  };
  function check() {
    for (const k in CH_DEF) { if (S.hits[k]) continue; const m = CH_DEF[k](); if (m) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); if (k === "reach") ML.confetti(40); } }
  }
  function collect() {
    if (S.pose.reachable && S.pose.ok && Math.hypot(S.pose.hand.x - S.star.x, S.pose.hand.y - S.star.y) < 8) { S.stars++; if (S.mode === "fk") S.gotStarFk = true; newStar(); ML.say("<b>Got it!</b> A new star appeared."); }
  }
  function draw() {
    const col = (n) => rc(n), mut = col("--muted"), acc = col("--accent"), bad = col("--bad"), warn = col("--warn"), line = col("--line"), ink = col("--ink");
    cx.clearRect(0, 0, CW, CH); const r = C.reach(L1, L2);
    cx.fillStyle = al(acc, 0.08); cx.beginPath(); cx.arc(sx(0), sy(0), r.max, 0, 7); cx.arc(sx(0), sy(0), r.min, 0, 7, true); cx.fill("evenodd");
    cx.strokeStyle = line; cx.lineWidth = 2; cx.setLineDash([4, 4]); [r.max, r.min].forEach((q) => { cx.beginPath(); cx.arc(sx(0), sy(0), q, 0, 7); cx.stroke(); }); cx.setLineDash([]);
    if (limOn()) { const l = limits(); cx.strokeStyle = warn; cx.lineWidth = 3; cx.beginPath(); cx.arc(sx(0), sy(0), 26, -l.s[1] * C.D2R, -l.s[0] * C.D2R); cx.stroke(); }
    cx.fillStyle = mut; cx.font = "700 11px Nunito, sans-serif"; cx.textAlign = "center"; cx.fillText("reach zone", sx(0), sy(0) + 22);
    const arm = (a1, a2, color, w, dash) => {
      const f = C.fk(L1, L2, a1, a2); cx.strokeStyle = color; cx.lineWidth = w; cx.lineCap = "round"; cx.setLineDash(dash || []);
      cx.beginPath(); cx.moveTo(sx(0), sy(0)); cx.lineTo(sx(f.ex), sy(f.ey)); cx.lineTo(sx(f.x), sy(f.y)); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = color; [[0, 0], [f.ex, f.ey]].forEach((q) => { cx.beginPath(); cx.arc(sx(q[0]), sy(q[1]), 6, 0, 7); cx.fill(); });
    };
    const p = S.pose; if (p.other) arm(p.other.a1, p.other.a2, p.okOther === false ? al(bad, 0.5) : al(mut, 0.7), 5, [2, 7]);
    arm(p.a1, p.a2, p.ok ? acc : bad, 8);
    cx.fillStyle = p.ok ? ink : bad; cx.beginPath(); cx.arc(sx(p.hand.x), sy(p.hand.y), 6, 0, 7); cx.fill();
    drawStar(sx(S.star.x), sy(S.star.y), warn, ink);
    if (S.mode === "ik") { cx.fillStyle = p.reachable ? bad : bad; cx.strokeStyle = "#fff"; cx.lineWidth = 3; cx.beginPath(); cx.arc(sx(S.handle.x), sy(S.handle.y), 9, 0, 7); cx.stroke(); cx.fill(); }
  }
  function drawStar(x, y, fill, stroke) {
    cx.fillStyle = fill; cx.strokeStyle = stroke; cx.lineWidth = 1.5; cx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5 : 11; cx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
    cx.closePath(); cx.fill(); cx.stroke();
  }
  function moveHandle(e) {
    const p = ML.canvasPoint(cv, e, CW, CH); S.handle = { x: Math.max(-OX + 5, Math.min(OX - 5, p.x - OX)), y: Math.max(-CH + OY + 5, Math.min(OY - 5 - 0, OY - p.y)) };
    update(); collect(); update();
  }
  cv.addEventListener("pointerdown", (e) => { if (S.mode !== "ik") return; S.drag = true; cv.setPointerCapture(e.pointerId); moveHandle(e); });
  cv.addEventListener("pointermove", (e) => { if (S.drag) moveHandle(e); });
  cv.addEventListener("pointerup", () => { S.drag = false; });
  cv.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key]; if (!d || S.mode !== "ik") return;
    e.preventDefault(); S.handle = { x: S.handle.x + d[0], y: S.handle.y + d[1] }; update(); collect(); update();
  });
  newStar();
  function setMode(m) { S.mode = m; $("mode-ik").classList.toggle("on", m === "ik"); $("mode-fk").classList.toggle("on", m === "fk"); if (m === "fk") { compute(); } update(); ML.say(m === "fk" ? "Now <b>you</b> set the angles with the sliders and I do the forward maths to find the hand." : "Back to <b>inverse</b>: you choose the spot, I find the angles."); }
  $("mode-ik").addEventListener("click", () => setMode("ik")); $("mode-fk").addEventListener("click", () => { S.fk = [S.pose.a1, S.pose.a2]; $("a1").value = Math.round(S.pose.a1 * C.R2D); $("a2").value = Math.round(S.pose.a2 * C.R2D); setMode("fk"); });
  $("flip").addEventListener("click", () => { S.elbow = S.elbow === "down" ? "up" : "down"; if (S.pose && S.pose.reachable) S.flipped = true; update(); });
  $("star").addEventListener("click", () => { newStar(); update(); });
  ML.bindRange("#a1", (v) => v + "°", (v) => { if (S.mode === "fk") { S.fk[0] = v * C.D2R; update(); collect(); update(); } });
  ML.bindRange("#a2", (v) => v + "°", (v) => { if (S.mode === "fk") { S.fk[1] = v * C.D2R; update(); collect(); update(); } });
  ML.bindRange("#elim", (v) => v + "°", () => update());
  $("lim").addEventListener("change", update);
  document.addEventListener("themechange", draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  update();
})();
