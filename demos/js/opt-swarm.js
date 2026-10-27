// Swarm of Searchers page. Logic lives in opt-swarm-core.js (SwarmCore).
(function () {
  const C = window.SwarmCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LW = 340, CW = 300, CH = 120, RES = 68;
  const lx = ML.setupCanvas($("land"), LW, LW).ctx, cx = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 1, land: null, grid: null, sw: null, hist: [], timer: 0, hits: {}, lone: 0 };
  const val = (v) => Math.max(0, Math.min(1, v));

  function newLand() { S.seed = 1 + Math.floor(Math.random() * 90000); S.land = C.landscape(S.seed); S.grid = S.land.grid(RES); newSwarm(); }
  function newSwarm() {
    stop(); S.sw = new C.Swarm(S.land, +$("n").value, S.seed + Math.floor(Math.random() * 1000)); S.hist = [val(S.sw.g.v)]; S.lone = 0; draw();
  }
  function land() {
    const c = lx, w = LW / RES, acc = ML.cssVar("--accent");
    c.fillStyle = ML.cssVar("--bg-2"); c.fillRect(0, 0, LW, LW); c.fillStyle = acc;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) { c.globalAlpha = 0.05 + 0.95 * Math.pow(val(S.grid[j * RES + i]), 2.2); c.fillRect(i * w, (RES - 1 - j) * w, w, w); }
    c.globalAlpha = 1;
  }
  function chart() {
    const c = cx, L = 30, R = 6, T = 8, B = 18, n = S.hist.length, xm = Math.max(30, n - 1);
    const X = (i) => L + (i / xm) * (CW - L - R), Y = (v) => T + (1 - v) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); c.font = "700 10px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right";
    [0, 0.5, 1].forEach((v) => c.fillText(Math.round(v * 100) + "%", L - 4, Y(v) + 3)); c.textAlign = "center"; c.fillText("step", (L + CW - R) / 2, CH - 4);
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 2.5; c.beginPath(); S.hist.forEach((h, i) => (i ? c.lineTo(X(i), Y(h)) : c.moveTo(X(i), Y(h)))); c.stroke();
  }
  function draw() {
    land(); const c = lx, sc = LW;
    if ($("showtop").checked) { const b = S.land.best; c.strokeStyle = ML.cssVar("--warn"); c.lineWidth = 3; c.beginPath(); c.arc(b.x * sc, (1 - b.y) * sc, 11, 0, 7); c.stroke(); c.fillStyle = ML.cssVar("--warn"); c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("top", b.x * sc, (1 - b.y) * sc - 15); }
    for (const p of S.sw.ps) {
      const x = p.x * sc, y = (1 - p.y) * sc;
      c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx * sc * 1.5, y + p.vy * sc * 1.5); c.stroke();
      c.fillStyle = ML.cssVar("--warn"); c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fill(); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1.5; c.stroke();
    }
    const g = S.sw.g; c.strokeStyle = ML.cssVar("--good"); c.lineWidth = 3; c.beginPath(); c.arc(g.x * sc, (1 - g.y) * sc, 9, 0, 7); c.stroke();
    const best = val(g.v), spread = S.sw.spread();
    $("sbest").textContent = Math.round(best * 100) + "%"; $("sspread").textContent = spread.toFixed(2); $("sit").textContent = S.sw.iter; $("iter").textContent = "· step " + S.sw.iter; chart();
    $("state").textContent = S.sw.iter < 10 ? "" : spread < 0.015 ? (best >= 0.97 ? "The whole swarm sits on the top." : "The swarm has huddled together on a hill that is not the top.") : spread > 0.2 ? "Everyone is still spread out." : "Gathering...";
    check(best, spread);
  }
  const msgs = { good: "A pretty high hill.", trap: "Trapped! The whole swarm settled on a lower hill. A bigger or more curious swarm might do better.", top: "You found the true top!", lone: "Without the flock pull, nobody shares what they found." };
  function check(best, spread) {
    const w = S.sw.iter;
    const ok = { good: best >= 0.9, trap: w >= 30 && spread < 0.015 && best < 0.97, top: best >= 0.98, lone: S.lone >= 60 && spread > 0.2 };
    for (const k in ok) if (ok[k] && !S.hits[k]) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msgs[k]); ML.say(`<b>Challenge done!</b> ${msgs[k]}`); if (k === "top") ML.confetti(40); }
  }
  function step() {
    const n = +$("n").value; if (n !== S.sw.ps.length) S.sw.resize(n);
    const c2 = +$("c2").value; S.lone = c2 === 0 ? S.lone + 1 : 0;
    S.sw.step(+$("w").value, +$("c1").value, c2); S.hist.push(val(S.sw.g.v)); draw();
  }
  function stop() { clearInterval(S.timer); S.timer = 0; $("run").innerHTML = `${ML.icon("play")} Run`; }
  $("run").addEventListener("click", () => {
    if (S.timer) { stop(); return; }
    $("run").innerHTML = `${ML.icon("pause")} Pause`; S.timer = setInterval(step, reduce ? 60 : 50);
    ML.say("Green ring = the flock's best spot so far. Orange dots are searchers, the line shows where they came from.");
  });
  $("step").addEventListener("click", () => { stop(); step(); });
  $("again").addEventListener("click", () => { newSwarm(); ML.say("Fresh swarm on the same hills. Try different knobs!"); });
  $("newl").addEventListener("click", () => { newLand(); ML.say("New hills. Where is the highest one?"); });
  $("showtop").addEventListener("change", () => draw());
  ML.bindRange("#w", (v) => v.toFixed(2)); ML.bindRange("#c1", (v) => v.toFixed(1)); ML.bindRange("#c2", (v) => v.toFixed(1));
  ML.bindRange("#n", (v) => v, () => { if (S.sw && +$("n").value !== S.sw.ps.length && !S.timer) { S.sw.resize(+$("n").value); draw(); } });
  new MutationObserver(() => S.sw && draw()).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => S.sw && draw());
  window.SwarmPage = S;
  newLand();
})();
