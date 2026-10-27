// Evolve an Answer page. Logic lives in opt-genetic-core.js (GeneticCore).
(function () {
  const C = window.GeneticCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PX = 200, CW = 300, CH = 140;
  const bx = ML.setupCanvas($("best"), PX, PX).ctx, tx = ML.setupCanvas($("tgt"), PX, PX).ctx, cx = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { pic: "heart", ga: null, hist: [], seed: 1, timer: 0, frozen: 0, chaos: 0, hits: {}, maxBest: 0 };

  function reset() {
    stop(); S.seed = 1 + Math.floor(Math.random() * 90000);
    S.ga = new C.GA({ seed: S.seed, target: C.target(S.pic), pop: +$("pop").value, mut: +$("mut").value, cross: $("cross").checked });
    S.hist = []; S.frozen = 0; S.chaos = 0; S.hits = {}; S.fresh = true;
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    S.hist.push(S.ga.stats()); draw();
  }
  function grid(c, g, tgt) {
    const w = PX / 8; c.clearRect(0, 0, PX, PX);
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * w, y = Math.floor(i / 8) * w;
      c.fillStyle = g[i] ? ML.cssVar("--accent") : ML.cssVar("--card");
      c.fillRect(x + 1, y + 1, w - 2, w - 2);
      if (tgt && g[i] !== tgt[i]) { c.fillStyle = ML.cssVar("--bad"); c.beginPath(); c.arc(x + w / 2, y + w / 2, 3.5, 0, 7); c.fill(); }
    }
  }
  function chart() {
    const c = cx, L = 28, R = 6, T = 8, B = 20, n = S.hist.length, xm = Math.max(20, n - 1);
    const X = (i) => L + (i / xm) * (CW - L - R), Y = (v) => CH - B - ((v - 28) / 36) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); c.font = "700 10px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right";
    [32, 48, 64].forEach((v) => c.fillText(v, L - 4, Y(v) + 3)); c.textAlign = "center"; c.fillText("generation", (L + CW - R) / 2, CH - 5);
    c.strokeStyle = ML.cssVar("--line"); c.setLineDash([3, 3]); c.beginPath(); c.moveTo(L, Y(64)); c.lineTo(CW - R, Y(64)); c.stroke(); c.setLineDash([]);
    [["avg", "--warn"], ["best", "--accent"]].forEach(([k, col]) => {
      c.strokeStyle = ML.cssVar(col); c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath();
      S.hist.forEach((h, i) => { const y = Y(Math.max(28, h[k])); i ? c.lineTo(X(i), y) : c.moveTo(X(i), y); }); c.stroke();
    });
  }
  function hint() {
    const m = +$("mut").value;
    $("muthint").textContent = m === 0 ? "No new ideas: the crowd can only shuffle what it already has." : m >= 0.25 ? "Too wild: good pixels get flipped back as fast as they are found." : m <= 0.003 ? "Very slow: new ideas are rare." : m <= 0.05 ? "Nice and gentle." : "Getting noisy.";
  }
  function draw() {
    const s = S.ga.stats();
    grid(bx, s.bestGenome, S.ga.target); grid(tx, S.ga.target, null); chart();
    $("sb").textContent = s.best + "/64"; $("sa").textContent = s.avg.toFixed(1); $("sg").textContent = s.gen; $("gen").textContent = "· generation " + s.gen; hint();
    check(s);
  }
  const msgs = {
    solve: "It evolved the whole picture!", fast: "Fast evolution: just a few generations.", tiny: "A tiny crowd still got there.",
    frozen: "Frozen: with 0% mutation nothing new can appear, so it never finishes.", chaos: "Chaos: so much mutation that it keeps wrecking its own good pixels.",
  };
  function check(s) {
    const ok = {
      solve: s.solved, fast: s.solved && s.gen <= 40 && S.fresh, tiny: s.solved && S.ga.inds.length <= 20,
      frozen: S.frozen >= 30 && s.best < 64, chaos: S.chaos >= 30 && s.best < 58,
    };
    for (const k in ok) if (ok[k] && !S.hits[k]) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msgs[k]); ML.say(`<b>Challenge done!</b> ${msgs[k]}`); if (k === "solve") ML.confetti(40); }
  }
  function step() {
    const m = +$("mut").value;
    S.ga.set({ pop: +$("pop").value, mut: m, cross: $("cross").checked });
    if (S.ga.inds.length !== S.ga.pop) S.fresh = false;
    S.ga.step();
    if (m === 0) S.frozen++; else if (m >= 0.25) S.chaos++;
    S.hist.push(S.ga.stats()); draw();
    if (S.ga.stats().solved) { stop(); ML.say(`<b>Solved</b> in ${S.ga.gen} generations with a crowd of ${S.ga.inds.length}! Nobody drew it, it evolved.`); }
  }
  function stop() { clearInterval(S.timer); S.timer = 0; const b = $("run"); if (b) b.innerHTML = `${ML.icon("play")} Run`; }
  $("run").addEventListener("click", () => {
    if (S.timer) { stop(); return; }
    if (S.ga.stats().solved) { ML.toast("Already solved! Press Start over."); return; }
    $("run").innerHTML = `${ML.icon("pause")} Pause`;
    S.timer = setInterval(step, reduce ? 40 : 110);
  });
  $("step").addEventListener("click", () => { stop(); if (!S.ga.stats().solved) step(); });
  $("reset").addEventListener("click", () => { reset(); ML.say("New random crowd. Press Run!"); });
  $("pic").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.pic = b.dataset.p; $("pic").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); reset();
  });
  ML.bindRange("#pop", (v) => v);
  ML.bindRange("#mut", (v) => (v * 100).toFixed(1).replace(".0", "") + "%", () => { hint(); });
  $("cross").addEventListener("change", () => ML.say($("cross").checked ? "Parents will be mixed: good parts can combine." : "No mixing: children are copies of one parent, plus mutations."));
  const shorten = () => { if (S.ga) S.fresh = false; };
  $("pop").addEventListener("input", shorten);
  new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", draw);
  window.GenPage = S;
  reset();
})();
