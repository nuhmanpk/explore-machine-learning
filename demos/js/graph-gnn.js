// Ask Your Neighbours page. Logic lives in graph-gnn-core.js (GraphGnnCore).
(function () {
  const G = window.GraphGnnCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CW = 420, CH = 380, PW = 300, PH = 150, EPOCHS = 200, PAL = ["--nn", "--sup", "--unsup"], LET = ["C", "D", "B"];
  const { ctx: cx } = ML.setupCanvas($("net"), CW, CH), { ctx: ch } = ML.setupCanvas($("chart"), PW, PH);
  const S = { seed: 3, data: null, lab: [], un: [], mlp: null, gnn: null, view: "gnn", hops: 2, k: 2, epoch: 0, loss: 0, timer: 0, sweepAcc: null, hits: {}, accM: 0, accG: 0, running: false };
  const col = (c) => ML.cssVar(PAL[c]);
  $("legend").innerHTML = G.CLASSES.map((n, i) => `<span><i style="background:var(${PAL[i]})"></i>${n} (${LET[i]})</span>`).join("");

  function newData() { S.data = G.makeData(S.seed); S.sweepAcc = null; pickLabels(); }
  function pickLabels() { S.lab = G.pickLabels(S.data, S.k, S.seed); S.un = G.unlabelled(S.data, S.lab); }
  function init() { stop(); S.mlp = G.build(S.data, 0, 100); S.gnn = G.build(S.data, S.hops, 101); S.epoch = 0; S.loss = 0; }
  function step(n) {
    for (let i = 0; i < n && S.epoch < EPOCHS; i++) { S.mlp.train(S.data.X, S.data.y, S.lab, 0.05, 5e-4); S.loss = S.gnn.train(S.data.X, S.data.y, S.lab, 0.05, 5e-4); S.epoch++; }
  }
  function stop() { clearTimeout(S.timer); S.timer = 0; S.running = false; $("train").innerHTML = `${ML.icon("play")} Train from scratch`; }
  function trainInstant() { init(); step(EPOCHS); update(); }
  function trainAnimated() {
    init(); update();
    if (reduce) { step(EPOCHS); update(); done(); return; }
    S.running = true; $("train").innerHTML = `${ML.icon("pause")} Stop`;
    const tick = () => { step(5); update(); if (S.epoch < EPOCHS) S.timer = setTimeout(tick, 30); else { stop(); done(); } };
    S.timer = setTimeout(tick, 30);
  }
  function done() { hit("train", "Both robots finished training."); ML.say(`Training done. Robot A got <b>${pc(S.accM)}</b> right, Robot B got <b>${pc(S.accG)}</b> right on dots without name tags.`); }
  const pc = (v) => Math.round(v * 100) + "%";
  const hit = (k, m) => { if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); if (k === "beat") ML.confetti(40); };

  function update() {
    S.pm = S.mlp.predict(S.data.X); S.pg = S.gnn.predict(S.data.X);
    S.accM = G.accuracy(S.pm, S.data.y, S.un); S.accG = G.accuracy(S.pg, S.data.y, S.un);
    S.gap = G.classGap(S.data, S.hops);
    $("a-mlp").textContent = pc(S.accM); $("a-gnn").textContent = pc(S.accG); $("gap").textContent = pc(S.gap);
    if (S.epoch >= EPOCHS) {
      if (S.k <= 2 && S.accG - S.accM >= 0.1) { hit("beat", "Asking neighbours beat looking alone!"); }
      if (S.hops >= 6 && S.gap < 0.6) hit("smooth", "Everyone is averaging with everyone: the kinds blur together.");
      if (S.sweepAcc) { const best = Math.max(...S.sweepAcc.slice(1)), me = S.sweepAcc[S.hops]; if (me >= best - 1e-9) hit("sweep", "You found the best number of hops."); }
    }
    inside(); drawNet(); drawChart();
  }
  function inside() {
    $("inside").innerHTML = `<div class="sig"><span>Training: <b>${S.epoch}</b> of ${EPOCHS} rounds. Robot B loss: <b>${S.loss.toFixed(2)}</b> (only ${S.lab.length} name tags to learn from).</span></div>
      <div class="sig"><span class="mono">Each round, every dot averages its numbers with its friends, ${S.hops} time${S.hops > 1 ? "s" : ""}, so it hears from dots up to ${S.hops} step${S.hops > 1 ? "s" : ""} away.</span></div>
      <div class="decision">${S.hops >= 5 ? "Lots of averaging: dots are starting to look alike." : S.accG > S.accM ? "Neighbours help: friends tend to be the same kind." : "Not much gain yet. Try another number of hops."}</div>`;
  }

  // ---------- canvases ----------
  const X = (p) => CW / 2 + p.x * (CW / 2 - 22), Y = (p) => CH / 2 + p.y * (CH / 2 - 22);
  function drawNet() {
    if (!S.pm) return;
    const c = cx, d = S.data, ink = ML.cssVar("--ink"), line = ML.cssVar("--line"), card = ML.cssVar("--card"), labset = new Set(S.lab);
    c.clearRect(0, 0, CW, CH); c.lineWidth = 1.4; c.strokeStyle = line;
    d.adj.forEach((nb, i) => nb.forEach((j) => { if (i < j) { c.beginPath(); c.moveTo(X(d.pos[i]), Y(d.pos[i])); c.lineTo(X(d.pos[j]), Y(d.pos[j])); c.stroke(); } }));
    c.font = "800 10px Nunito, sans-serif"; c.textAlign = "center";
    for (let i = 0; i < d.n; i++) {
      const x = X(d.pos[i]), y = Y(d.pos[i]), isL = labset.has(i), pred = S.view === "truth" || isL ? d.y[i] : S.view === "mlp" ? S.pm[i] : S.pg[i], wrong = S.view !== "truth" && !isL && pred !== d.y[i], r = isL ? 11 : 9;
      c.fillStyle = col(pred); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.lineWidth = isL ? 4 : 2; c.strokeStyle = isL ? ink : card; c.stroke();
      c.fillStyle = "#fff"; c.fillText(LET[pred], x, y + 3.5);
      if (wrong) { c.strokeStyle = ink; c.lineWidth = 2; c.beginPath(); c.moveTo(x - r - 2, y - r - 2); c.lineTo(x + r + 2, y + r + 2); c.moveTo(x + r + 2, y - r - 2); c.lineTo(x - r - 2, y + r + 2); c.stroke(); }
    }
  }
  function drawChart() {
    const c = ch, L = 30, R = 8, T = 10, B = 22, xm = 6, ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted");
    const Xc = (h) => L + (h / xm) * (PW - L - R), Yc = (v) => PH - B - v * (PH - T - B);
    c.clearRect(0, 0, PW, PH); c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0, 0.5, 1].forEach((v) => c.fillText(Math.round(v * 100) + "%", L - 4, Yc(v) + 3));
    c.textAlign = "center"; for (let h = 0; h <= xm; h++) c.fillText(h, Xc(h), PH - 8);
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(L, Yc(1 / 3)); c.lineTo(PW - R, Yc(1 / 3)); c.stroke(); c.setLineDash([]);
    c.fillText("guessing", PW - 28, Yc(1 / 3) - 3);
    c.strokeStyle = ML.cssVar("--warn"); c.lineWidth = 2.5; c.beginPath();
    for (let h = 0; h <= xm; h++) { const v = Math.min(1, G.classGap(S.data, h)); h ? c.lineTo(Xc(h), Yc(v)) : c.moveTo(Xc(h), Yc(v)); } c.stroke();
    if (S.sweepAcc) {
      c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 2.5; c.beginPath(); S.sweepAcc.forEach((v, h) => (h ? c.lineTo(Xc(h), Yc(v)) : c.moveTo(Xc(h), Yc(v)))); c.stroke();
      S.sweepAcc.forEach((v, h) => { c.fillStyle = ML.cssVar("--accent"); c.beginPath(); c.arc(Xc(h), Yc(v), 3.5, 0, 7); c.fill(); });
    }
    c.strokeStyle = ink; c.lineWidth = 2; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(Xc(S.hops), T); c.lineTo(Xc(S.hops), PH - B); c.stroke(); c.setLineDash([]);
    c.fillStyle = muted; c.fillText("hops (0 = no graph)", (L + PW - R) / 2, PH - 0);
  }

  // ---------- controls ----------
  $("view").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.view = b.dataset.v; document.querySelectorAll("#view button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawNet(); });
  $("train").addEventListener("click", () => { if (S.running) { stop(); return; } trainAnimated(); ML.say("Starting from random guesses. Watch the two scores climb while the robots learn from the name-tagged dots."); });
  $("newg").addEventListener("click", () => { S.seed = 1 + Math.floor(Math.random() * 9000); newData(); trainInstant(); ML.say("A new graph with new dots and new name tags. Robot B should still beat Robot A."); });
  let deb = 0;
  const later = (f) => { clearTimeout(deb); deb = setTimeout(f, 60); };
  ML.bindRange("#lab", (v) => v, (v) => { if (!S.data || v === S.k) return; S.k = v; pickLabels(); later(trainInstant); });
  ML.bindRange("#hops", (v) => v, (v) => {
    if (!S.data || v === S.hops) return; S.hops = v; later(() => { trainInstant(); ML.say(v >= 5 ? `<b>${v} hops</b>: every dot hears from nearly the whole graph. Check the class gap.` : `<b>${v} hop${v > 1 ? "s" : ""}</b>: Robot B now gets <b>${pc(S.accG)}</b> right.`); });
  });
  $("sweep").addEventListener("click", () => {
    const out = [], un = S.un, btn = $("sweep"); btn.disabled = true; let h = 0;
    const go = () => {
      let s = 0; for (let k = 0; k < 2; k++) s += G.accuracy(G.fit(S.data, S.lab, h, 100 + k).predict(S.data.X), S.data.y, un);
      out.push(s / 2); S.sweepAcc = out.slice(); drawChart(); h++;
      if (h <= 6) setTimeout(go, 10); else { btn.disabled = false; const best = out.indexOf(Math.max(...out)); update(); ML.say(`Best so far: <b>${best} hop${best === 1 ? "" : "s"}</b> (${pc(out[best])}). Set the hops slider to ${best} to lock it in.${best === 0 ? " Here the graph did not help!" : ""}`); }
    };
    go();
  });
  new MutationObserver(() => { drawNet(); drawChart(); }).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => { drawNet(); drawChart(); });
  window.GnnPage = S;
  newData(); trainInstant();
})();
