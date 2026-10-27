// Throw Darts to Find Pi page. Logic lives in prob-monte-core.js (MonteCore).
(function () {
  const C = window.MonteCore, $ = (id) => document.getElementById(id);
  const BW = 300, BH = 300, CW = 300, CH = 170;
  const { ctx: bx } = ML.setupCanvas($("board"), BW, BH);
  const { ctx: cx } = ML.setupCanvas($("curve"), CW, CH);
  const seed0 = 1 + Math.floor(Math.random() * 900000);
  const S = { tab: "pi", est: new C.PiEstimator(seed0), curve: C.errorCurve(seed0 + 7, [10, 30, 100, 300, 1000, 3000, 10000, 30000], 40),
    mh: { phase: "pick", game: null, pick: -1, open: -1, stay: [0, 0], swap: [0, 0], r: ML.seeded(seed0 + 3) }, sim: {}, hits: {}, simSeed: seed0 + 50 };
  const f2 = (x) => x.toFixed(x < 0.1 ? 3 : 2);

  function drawBoard() {
    const c = bx, m = 14, s = BW - 2 * m, ink = ML.cssVar("--ink"), good = ML.cssVar("--good"), warn = ML.cssVar("--warn"), muted = ML.cssVar("--muted"), acc = ML.cssVar("--accent");
    c.clearRect(0, 0, BW, BH);
    c.fillStyle = ML.cssVar("--bg-2"); c.fillRect(m, m, s, s);
    c.fillStyle = acc; c.globalAlpha = 0.12; c.beginPath(); c.moveTo(m, m + s); c.arc(m, m + s, s, -Math.PI / 2, 0); c.closePath(); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = ink; c.lineWidth = 2; c.strokeRect(m, m, s, s);
    c.beginPath(); c.arc(m, m + s, s, -Math.PI / 2, 0); c.stroke();
    for (const p of S.est.pts) { c.fillStyle = p.hit ? good : warn; c.beginPath(); c.arc(m + p.x * s, m + s - p.y * s, 1.8, 0, 6.2832); c.fill(); }
    c.fillStyle = muted; c.font = "700 11px sans-serif"; c.textAlign = "left"; c.fillText("inside = green, outside = orange", m + 4, BH - 3);
  }
  function drawCurve() {
    const c = cx, L = 34, R = 8, T = 8, B = 26, w = CW - L - R, h = CH - T - B;
    const lx = (n) => L + (Math.log10(Math.max(n, 10)) - 1) / 4 * w, ly = (e) => T + (1 - (Math.log10(Math.max(e, 0.0003)) + 3.5) / 4) * h;
    const ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted"), line = ML.cssVar("--line");
    c.clearRect(0, 0, CW, CH); c.lineWidth = 1; c.strokeStyle = line; c.fillStyle = muted; c.font = "700 9px sans-serif"; c.textAlign = "center";
    for (let k = 1; k <= 5; k++) { c.beginPath(); c.moveTo(lx(10 ** k), T); c.lineTo(lx(10 ** k), T + h); c.stroke(); c.fillText(k === 1 ? "10" : k === 2 ? "100" : k === 3 ? "1k" : k === 4 ? "10k" : "100k", lx(10 ** k), CH - 12); }
    c.textAlign = "right";
    for (const e of [0.001, 0.01, 0.1, 1]) { c.beginPath(); c.moveTo(L, ly(e)); c.lineTo(L + w, ly(e)); c.stroke(); c.fillText(String(e), L - 3, ly(e) + 3); }
    c.textAlign = "center"; c.fillText("number of darts", L + w / 2, CH - 2);
    c.strokeStyle = ML.cssVar("--warn"); c.setLineDash([4, 3]); c.lineWidth = 2; c.beginPath();
    [10, 1e5].forEach((n, i) => { const x = lx(n), y = ly(1.64 / Math.sqrt(n)); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.setLineDash([]);
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 2.5; c.beginPath();
    S.curve.forEach((p, i) => (i ? c.lineTo(lx(p.n), ly(p.err)) : c.moveTo(lx(p.n), ly(p.err)))); c.stroke();
    S.curve.forEach((p) => { c.fillStyle = ML.cssVar("--accent"); c.beginPath(); c.arc(lx(p.n), ly(p.err), 3, 0, 6.2832); c.fill(); });
    if (S.est.n >= 10) { c.fillStyle = ML.cssVar("--good"); c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath(); c.arc(lx(S.est.n), ly(S.est.error()), 5, 0, 6.2832); c.fill(); c.stroke(); }
  }
  function renderPi() {
    const e = S.est;
    $("n").textContent = e.n.toLocaleString(); $("in").textContent = e.inside.toLocaleString(); $("est").textContent = e.n ? e.estimate().toFixed(3) : "?";
    $("errtxt").textContent = e.n ? `Off by ${e.error().toFixed(3)}. Real pi is 3.14159.` : "Real pi is 3.14159. Throw some darts!";
    if (S.tab === "pi") $("inside").innerHTML = e.n ? `<div class="sig"><span class="dot" style="background:var(--good)"></span><span><b>${e.inside}</b> of <b>${e.n}</b> darts landed inside the circle (${(100 * e.inside / e.n).toFixed(1)}%)</span></div>
      <div class="mono">4 × ${e.inside} ÷ ${e.n} = ${e.estimate().toFixed(4)}</div><div class="decision">The circle covers π/4 ≈ 78.5% of the square.</div>` : "No darts yet.";
    drawBoard(); drawCurve(); check();
  }
  function throwN(k) { S.est.add(k); renderPi(); }
  $("d10").onclick = () => throwN(10); $("d1k").onclick = () => throwN(1000); $("d10k").onclick = () => throwN(10000);
  $("dreset").onclick = () => { S.est = new C.PiEstimator(1 + Math.floor(Math.random() * 900000)); renderPi(); };

  // ---------- Monty Hall ----------
  const doors = () => [...document.querySelectorAll(".door")];
  function mhRender() {
    const m = S.mh;
    doors().forEach((b, i) => {
      b.classList.toggle("picked", m.pick === i); b.classList.toggle("open", m.phase === "done" || m.open === i);
      b.classList.toggle("car", m.phase === "done" && m.game.car === i);
      b.disabled = m.phase !== "pick";
      const showGoat = m.open === i || (m.phase === "done" && m.game.car !== i);
      b.textContent = m.phase === "done" && m.game.car === i ? "CAR" : showGoat ? "goat" : String(i + 1);
    });
    $("stay").disabled = $("swap").disabled = m.phase !== "choose"; $("again").hidden = m.phase !== "done";
    $("h-stay").textContent = m.stay[0] + " / " + m.stay[1]; $("h-swap").textContent = m.swap[0] + " / " + m.swap[1]; $("h-n").textContent = m.stay[1] + m.swap[1];
    if (S.tab === "mh") $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Your first pick wins <b>1 in 3</b> times. The other two doors together hold <b>2 in 3</b>.</span></div>
      <div class="sig"><span class="dot" style="background:var(--warn)"></span><span>The host knows where the car is and always opens a goat. That does not change your first pick's odds.</span></div><div class="decision">So switching should win about 67%.</div>`;
    check();
  }
  $("doors").onclick = (e) => {
    const b = e.target.closest(".door"), m = S.mh; if (!b || m.phase !== "pick") return;
    m.game = C.newGame(m.r); m.pick = +b.dataset.d; m.open = C.hostOpens(m.game.car, m.pick, m.r); m.phase = "choose";
    $("mh-msg").textContent = `You picked door ${m.pick + 1}. The host opened door ${m.open + 1}: a goat! Stay or switch?`; mhRender();
  };
  function decide(sw) {
    const m = S.mh, fin = C.finalPick(m.pick, m.open, sw), won = fin === m.game.car, rec = sw ? m.swap : m.stay;
    rec[1]++; if (won) rec[0]++; m.phase = "done"; m.pick = fin;
    $("mh-msg").textContent = won ? `You ${sw ? "switched" : "stayed"} and WON the car!` : `You ${sw ? "switched" : "stayed"} and got a goat.`;
    mhRender();
  }
  $("stay").onclick = () => decide(false); $("swap").onclick = () => decide(true);
  $("again").onclick = () => { Object.assign(S.mh, { phase: "pick", pick: -1, open: -1, game: null }); $("mh-msg").textContent = "New round. Pick a door!"; mhRender(); };
  function sim(sw) {
    const n = 10000, w = C.montyRun(S.simSeed++, n, sw), k = sw ? "swap" : "stay", p = w / n;
    S.sim[k] = p; $("s-" + k).textContent = (p * 100).toFixed(1) + "%"; $("b-" + k).style.width = p * 100 + "%";
    ML.say(`<b>${sw ? "Always switch" : "Always stay"}:</b> won ${w.toLocaleString()} of 10,000 games (${(p * 100).toFixed(1)}%).`); check();
  }
  $("sim-stay").onclick = () => sim(false); $("sim-swap").onclick = () => sim(true);

  function setTab(t) {
    S.tab = t;
    for (const [id, on] of [["pi", t === "pi"], ["mh", t === "mh"]]) { $("tab-" + id).classList.toggle("on", on); $("tab-" + id).setAttribute("aria-pressed", on); $("pane-" + id).hidden = !on; $("card-" + id).hidden = !on; }
    t === "pi" ? renderPi() : mhRender();
  }
  $("tab-pi").onclick = () => setTab("pi"); $("tab-mh").onclick = () => setTab("mh");

  const CHK = {
    "1k": () => S.est.n >= 1000 && "1,000 darts thrown. See how close the guess is?",
    close: () => S.est.n >= 1000 && S.est.error() < 0.03 && "Within 0.03 of pi using random darts only!",
    hand: () => S.mh.stay[1] >= 3 && S.mh.swap[1] >= 3 && "You played both strategies by hand. Does switching feel luckier?",
    sim: () => S.sim.stay != null && S.sim.swap != null && "Ten thousand games each: switching wins about twice as often as staying.",
  };
  function check() {
    for (const k in CHK) { if (S.hits[k]) continue; const m = CHK[k](); if (m) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); } }
  }
  renderPi();
  document.addEventListener("themechange", () => { drawBoard(); drawCurve(); });
})();
