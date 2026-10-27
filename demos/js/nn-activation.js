// Why Brains Need a Bend — two nets, same dots, trained side by side.
(function () {
  const C = window.ActCore;
  const $ = (s) => document.querySelector(s);
  const NAMES = { linear: "No bend", relu: "ReLU", tanh: "tanh", sigmoid: "Sigmoid", step: "Step" };
  const LR = 0.5, MAX_EP = 3000, G = 40, SZ = 300;
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = { ds: "line", actA: "linear", actB: "relu", layers: 2, width: 6, running: false, epoch: 0, hA: [], hB: [], hx: [], marks: [], guess: null, judged: false, chal: null, g0: [0, 0], solvedB: false };
  let pts = [], netA, netB, deadAt = -1;

  const cvs = { A: $("#bA"), B: $("#bB") }, ctx = {};
  for (const k of ["A", "B"]) ctx[k] = ML.setupCanvas(cvs[k], SZ, SZ).ctx;
  const heat = document.createElement("canvas"); heat.width = G; heat.height = G;
  const hx = heat.getContext("2d"), img = hx.createImageData(G, G);
  const chart = $("#chart"), curve = $("#curve");
  let cc, cu;
  function sizeSmall() {
    const w = Math.max(200, chart.getBoundingClientRect().width || 400);
    chart.style.aspectRatio = ""; chart.style.height = "120px"; cc = ML.setupCanvas(chart, w, 120);
    const w2 = Math.max(200, curve.getBoundingClientRect().width || 400);
    curve.style.aspectRatio = ""; curve.style.height = "220px"; cu = ML.setupCanvas(curve, w2, 220);
  }
  const rgb = (c) => { c = c.trim(); if (c[0] === "#") { if (c.length === 4) c = "#" + [...c.slice(1)].map((x) => x + x).join(""); return [1, 3, 5].map((i) => parseInt(c.substr(i, 2), 16)); } const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128]; };

  function build() {
    pts = C.dataset(S.ds, 3);
    netA = C.makeNet(S.layers, S.width, S.actA, 5);
    netB = C.makeNet(S.layers, S.width, S.actB, 5);
    S.epoch = 0; S.hA = []; S.hB = []; S.hx = []; S.marks = []; S.judged = false; S.solvedB = false; S.g0 = [0, 0];
    record(); draw(); inside();
    $("#gRes").textContent = "";
  }
  function record() {
    const a = C.evaluate(netA, pts), b = C.evaluate(netB, pts);
    S.hx.push(S.epoch); S.hA.push(a.loss); S.hB.push(b.loss); S.eA = a; S.eB = b;
  }
  function trainSome(n) {
    for (let i = 0; i < n && S.epoch < MAX_EP; i++) {
      S.g0 = [C.step(netA, pts, LR), C.step(netB, pts, LR)];
      S.epoch++;
      if (S.epoch % 5 === 0) record();
      if (!isFinite(S.g0[0] + S.g0[1])) break;
    }
    record();
    afterTrain();
  }
  function mark(label) { S.marks.push({ e: S.epoch, label }); }
  function afterTrain() {
    if (!S.solvedB && S.eB.acc >= 0.95) {
      S.solvedB = true; mark("right bend nailed it");
      if (S.epoch > 20) say(`The <b>${NAMES[S.actB]}</b> brain got <b>${pct(S.eB.acc)}</b> right in ${S.epoch} rounds. The ${NAMES[S.actA].toLowerCase()} one is at <b>${pct(S.eA.acc)}</b>.`);
    }
    if (S.guess && !S.judged && (S.eB.acc >= 0.95 || S.epoch >= 400)) {
      S.judged = true;
      const can = S.eB.acc >= 0.95, ok = (S.guess === "yes") === can;
      $("#gRes").innerHTML = `${ok ? "You were right! " : "Not this time. "}The ${NAMES[S.actB]} brain ${can ? "drew it" : "could not draw it"} (${pct(S.eB.acc)}).`;
    }
    if (S.chal === "dead" && deadAt > 0 && S.epoch >= deadAt + 40) { C.killRelu(netB); deadAt = -1; mark("neurons died"); record(); say("Every ReLU neuron now has a mood way below zero. The slope is 0, so nobody can nudge them back. Dead!"); }
    if (S.chal === "vanish" && S.epoch >= 300 && !S.marks.some((m) => m.label === "slope check")) {
      mark("slope check");
      say(`After 300 rounds the first-layer nudge size is <b>${S.g0[0].toExponential(1)}</b> for sigmoid vs <b>${S.g0[1].toExponential(1)}</b> for ReLU. The sigmoid blame signal faded through the layers.`);
    }
    if (S.epoch >= MAX_EP && S.running) setRun(false);
  }
  const pct = (v) => Math.round(v * 100) + "%";
  const say = (h) => ML.say(h);

  // ---------- drawing ----------
  function paintBoard(k, net) {
    const pal = { red: rgb(ML.cssVar("--bad")), blue: rgb(ML.cssVar("--sup")), bg: rgb(ML.cssVar("--canvas-bg")) };
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const p = C.predict(net, ((i + 0.5) / G) * 2 - 1, 1 - ((j + 0.5) / G) * 2);
      const col = p > 0.5 ? pal.blue : pal.red, t = Math.min(1, Math.abs(p - 0.5) * 2) * 0.75 + 0.1, o = (j * G + i) * 4;
      for (let c = 0; c < 3; c++) img.data[o + c] = pal.bg[c] * (1 - t) + col[c] * t;
      img.data[o + 3] = 255;
    }
    hx.putImageData(img, 0, 0);
    const x = ctx[k]; x.imageSmoothingEnabled = true; x.clearRect(0, 0, SZ, SZ);
    x.drawImage(heat, 0, 0, SZ, SZ);
    for (const p of pts) {
      x.beginPath(); x.arc(((p.x + 1) / 2) * SZ, ((1 - p.y) / 2) * SZ, 4.5, 0, 7);
      x.fillStyle = p.c ? ML.cssVar("--sup") : ML.cssVar("--bad"); x.fill(); x.lineWidth = 1.5; x.strokeStyle = "#fff"; x.stroke();
    }
  }
  function drawChart() {
    const { ctx: x, w, h } = cc, L = 34, B = 16, T = 6;
    x.clearRect(0, 0, w, h);
    const n = Math.max(S.epoch, 20), mx = Math.max(0.75, ...S.hA, ...S.hB), px = (i) => L + (i / n) * (w - L - 6), py = (v) => T + (1 - v / mx) * (h - T - B);
    x.strokeStyle = ML.cssVar("--line"); x.lineWidth = 1; x.fillStyle = ML.cssVar("--muted"); x.font = "10px sans-serif";
    for (const v of [0, mx / 2, mx]) { x.beginPath(); x.moveTo(L, py(v)); x.lineTo(w - 6, py(v)); x.stroke(); x.fillText(v.toFixed(2), 2, py(v) + 3); }
    const line = (hist, col) => { x.beginPath(); hist.forEach((v, i) => (i ? x.lineTo(px(S.hx[i]), py(v)) : x.moveTo(px(S.hx[i]), py(v)))); x.strokeStyle = col; x.lineWidth = 2.5; x.stroke(); };
    line(S.hA, ML.cssVar("--rl")); line(S.hB, ML.cssVar("--accent"));
    // x positions: history index ~ epoch/5 (+ first point at 0)
    S.marks.forEach((m, i) => {
      const xi = px(m.e); x.strokeStyle = ML.cssVar("--ink"); x.setLineDash([3, 3]); x.beginPath(); x.moveTo(xi, T); x.lineTo(xi, h - B); x.stroke(); x.setLineDash([]);
      x.fillStyle = ML.cssVar("--ink"); x.textAlign = xi > w - 90 ? "right" : "left"; x.fillText("⚑ " + m.label, xi + (xi > w - 90 ? -3 : 3), T + 10 + (i % 3) * 11); x.textAlign = "left";
    });
    x.fillStyle = ML.cssVar("--muted"); x.fillText("0", L, h - 3); x.textAlign = "right"; x.fillText(S.epoch + " rounds", w - 6, h - 3); x.textAlign = "left";
  }
  function drawCurve() {
    const { ctx: x, w, h } = cu, act = C.ACTS[S.actB], R = 4, ymin = -2, ymax = 4;
    const px = (v) => ((v + R) / (2 * R)) * w, py = (v) => h - 12 - ((v - ymin) / (ymax - ymin)) * (h - 24);
    x.clearRect(0, 0, w, h);
    x.strokeStyle = ML.cssVar("--line"); x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, py(0)); x.lineTo(w, py(0)); x.moveTo(px(0), 0); x.lineTo(px(0), h); x.stroke();
    const plot = (fn, col, dash) => { x.beginPath(); x.setLineDash(dash || []); for (let i = 0; i <= 200; i++) { const v = -R + (i / 200) * 2 * R, y = fn(v); i ? x.lineTo(px(v), py(y)) : x.moveTo(px(v), py(y)); } x.strokeStyle = col; x.lineWidth = 3; x.stroke(); x.setLineDash([]); };
    const real = act.real || act.d;
    plot((v) => real(v), ML.cssVar("--rl"), [5, 4]); plot(act.f, ML.cssVar("--accent"));
    const wv = +$("#inw").value, xv = +$("#inx").value, bv = +$("#inb").value, z = wv * xv + bv, y = act.f(z), zz = Math.max(-R, Math.min(R, z));
    x.beginPath(); x.arc(px(zz), py(Math.max(ymin, Math.min(ymax, y))), 8, 0, 7); x.fillStyle = ML.cssVar("--ink"); x.fill(); x.lineWidth = 3; x.strokeStyle = "#fff"; x.stroke();
    x.fillStyle = ML.cssVar("--muted"); x.font = "11px sans-serif"; x.fillText("sum z", w - 40, py(0) - 4); x.fillText("out", px(0) + 4, 12);
    $("#oneSay").innerHTML = `<p>Sum: <b>${wv.toFixed(2)}</b> × <b>${xv.toFixed(2)}</b> + <b>${bv.toFixed(2)}</b> = <b>${z.toFixed(2)}</b></p><p>Through <b>${NAMES[S.actB]}</b> it comes out as <b>${y.toFixed(2)}</b>, slope <b>${real(z).toFixed(2)}</b>.</p><p class="muted">${hint(S.actB, z)}</p>`;
  }
  function hint(a, z) {
    if (a === "linear") return "No bend: the output is just the sum. Nothing is squashed.";
    if (a === "relu") return z <= 0 ? "Negative sum, so ReLU says 0 and the slope is 0. The neuron is silent." : "Positive sum passes straight through.";
    if (a === "step") return "Step is a light switch: 0 or 1, and it has no slope to learn from.";
    return Math.abs(z) > 2 ? "Far from zero the curve is flat, so a nudge changes almost nothing." : "Near zero the curve is steep, so nudges matter.";
  }
  function draw() {
    paintBoard("A", netA); paintBoard("B", netB); drawChart(); drawCurve(); stats(); labels();
  }
  function stats() {
    $("#epoch").textContent = S.epoch;
    $("#accA").textContent = pct(S.eA.acc); $("#accB").textContent = pct(S.eB.acc);
    $("#lossA").textContent = S.eA.loss.toFixed(3); $("#lossB").textContent = S.eB.loss.toFixed(3);
  }
  function labels() {
    const icA = S.actA === "linear" ? "ruler" : "wand";
    $("#hA").innerHTML = ML.icon(icA) + " " + (S.actA === "linear" ? "No bend" : NAMES[S.actA]);
    $("#hB").innerHTML = ML.icon("wand") + " " + (S.actB === "linear" ? "No bend (both)" : NAMES[S.actB] + " bend");
    $("#nA").textContent = NAMES[S.actA]; $("#nB").textContent = NAMES[S.actB];
    $("#gName").textContent = NAMES[S.actB] + " (right)";
  }
  function shapeOf(act, ds) {
    if (act === "linear") return "only ONE straight cut, however many layers";
    if (act === "step") return "blocky shapes, but it struggles to learn because the switch has no slope";
    if (act === "relu") return "corners and straight-edged shapes made from bent pieces";
    if (act === "tanh") return "smooth curves and rounded shapes";
    return "soft curves, but it learns slowly when the net is deep";
  }
  function inside() {
    const need = S.ds === "line" ? "one straight cut is enough" : "no single straight cut can split it";
    const ca = S.actA === "linear" ? C.collapse(netA) : null;
    $("#inside").innerHTML = `<p>These dots: <b>${need}</b>.</p>
      <p><b>Left</b> (${NAMES[S.actA]}) can draw ${shapeOf(S.actA)}.</p>
      <p><b>Right</b> (${NAMES[S.actB]}) can draw ${shapeOf(S.actB)}.</p>
      ${S.epoch > 0 ? `<p>Now: left <b>${pct(S.eA.acc)}</b>, right <b>${pct(S.eB.acc)}</b>.</p>` : ""}`;
    collapseBox();
  }
  function collapseBox() {
    const el = $("#collapse");
    if (S.actA !== "linear") { el.innerHTML = `The left brain uses <b>${NAMES[S.actA]}</b> right now, so it does not collapse. Pick <b>None</b> or press a layer button below.`; return; }
    const c = C.collapse(netA), f = C.forward(netA, 0.3, -0.5).p;
    const z = c.w[0] * 0.3 + c.w[1] * -0.5 + c.b, p2 = 1 / (1 + Math.exp(-z));
    const f2 = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(3);
    el.innerHTML = `${S.layers} thinking layer${S.layers === 1 ? "" : "s"} x ${S.width} neurons, no bend<br>
      <span class="big">= one rule: z = ${c.w[0].toFixed(3)}·x ${f2(c.w[1])}·y ${f2(c.b)}</span><br>
      Test at (0.3, −0.5): full net says ${f.toFixed(4)}, one rule says ${p2.toFixed(4)}`;
  }

  // ---------- controls ----------
  function setRun(r) { S.running = r; $("#go").innerHTML = ML.icon(r ? "pause" : "play") + (r ? " Pause" : " Robot, learn!"); }
  function seg(sel, attr, cb) {
    document.querySelectorAll(sel + " button").forEach((b) => b.addEventListener("click", () => { cb(b.dataset[attr]); }));
  }
  function mark_on(sel, attr, val) { document.querySelectorAll(sel + " button").forEach((b) => b.classList.toggle("on", b.dataset[attr] === val)); }
  function setup(o) {
    Object.assign(S, o);
    $("#layers").textContent = S.layers; $("#neurons").textContent = S.width;
    mark_on("#ds", "d", S.ds); mark_on("#act", "a", S.actB);
    S.chal = o.chal || null; setRun(false); build();
  }
  const manual = (o) => setup(Object.assign({ actA: "linear", guess: S.guess }, o));
  seg("#ds", "d", (v) => { S.guess = null; clearGuess(); manual({ ds: v }); });
  seg("#act", "a", (v) => { S.guess = null; clearGuess(); manual({ actB: v }); });
  const clamp = ML.clamp;
  document.getElementById("l-").onclick = () => manual({ layers: clamp(S.layers - 1, 1, 4) });
  document.getElementById("l+").onclick = () => manual({ layers: clamp(S.layers + 1, 1, 4) });
  document.getElementById("n-").onclick = () => manual({ width: clamp(S.width - 1, 2, 8) });
  document.getElementById("n+").onclick = () => manual({ width: clamp(S.width + 1, 2, 8) });
  $("#stack1").onclick = () => manual({ layers: 1, actA: "linear" });
  $("#stack2").onclick = () => manual({ layers: 2 });
  $("#stack3").onclick = () => manual({ layers: 3 });
  function clearGuess() { $("#gYes").classList.remove("on"); $("#gNo").classList.remove("on"); }
  $("#gYes").onclick = () => { S.guess = "yes"; clearGuess(); $("#gYes").classList.add("on"); S.judged = false; say("Locked in: <b>yes</b>. Press <b>Robot, learn!</b> to find out."); };
  $("#gNo").onclick = () => { S.guess = "no"; clearGuess(); $("#gNo").classList.add("on"); S.judged = false; say("Locked in: <b>no</b>. Press <b>Robot, learn!</b> to find out."); };
  $("#go").onclick = () => { if (S.epoch >= MAX_EP) build(); setRun(!S.running); if (S.running) say("Learning on both brains at once. Same dots, same start. Watch the two colour maps!"); };
  $("#reset").onclick = () => { setRun(false); build(); say("Both brains forgot everything. Fresh start!"); };

  // challenges
  document.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.ch;
    S.guess = null; clearGuess();
    if (k === "deep") {
      setup({ ds: "circle", actA: "linear", actB: "relu", layers: 3, width: 6, chal: k });
      mark("3 layers, no bend"); setRun(true);
      say("The left brain has 3 layers and no bend. Will depth save it? Spoiler: it is still one straight cut.");
    } else if (k === "vanish") {
      setup({ ds: "circle", actA: "sigmoid", actB: "relu", layers: 4, width: 4, chal: k });
      mark("4 deep: sigmoid vs ReLU"); setRun(true);
      say("Four layers deep. Left uses sigmoid, right uses ReLU. Watch which oops-meter drops.");
    } else {
      setup({ ds: "circle", actA: "linear", actB: "relu", layers: 2, width: 6, chal: k });
      trainSome(60); mark("learning fine"); deadAt = S.epoch + 1; setRun(true);
      say("The ReLU brain is learning nicely... then I will push all its moods far below zero.");
    }
  }));

  // neuron sliders
  ["#inx", "#inw", "#inb"].forEach((s) => ML.bindRange(s, (v) => v.toFixed(2), () => cu && drawCurve()));

  // ---------- loop ----------
  let last = 0, frame = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (!S.running) return;
    frame++;
    if (reduced && frame % 6) return;
    const t0 = performance.now();
    do { trainSome(2); } while (performance.now() - t0 < 6 && S.running && S.epoch < MAX_EP && S.epoch % 20);
    draw(); if (S.epoch % 20 < 3) inside();
  }
  const onTheme = () => cu && draw();
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("resize", () => { sizeSmall(); draw(); });
  sizeSmall(); build(); mark_on("#act", "a", S.actB);
  requestAnimationFrame(loop);
  window.__act = { S, train: (n) => { trainSome(n); draw(); }, get netA() { return netA; }, get netB() { return netB; } };
})();
