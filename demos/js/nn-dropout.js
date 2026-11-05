// Forgetful on Purpose page. Logic lives in nn-dropout-core.js (DropoutCore).
(function () {
  const C = window.DropoutCore, $ = (id) => document.getElementById(id);
  const DECAYS = [0, 0.001, 0.003, 0.01, 0.03, 0.1], SIZES = [2, 16, 16, 1], MAXSTEPS = 2000, LR = 0.02;
  const MW = 300, MH = 300, LW = 640, LH = 210, NW = 300, NH = 250, G = 50;
  const ma = ML.setupCanvas($("mapA"), MW, MH).ctx, mb = ML.setupCanvas($("mapB"), MW, MH).ctx;
  const lc = ML.setupCanvas($("loss"), LW, LH).ctx, nc = ML.setupCanvas($("net"), NW, NH).ctx;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = { seed: 1, data: null, A: null, B: null, rA: null, rB: null, drop: 0.4, decay: 0, step: 0, running: false, hist: [], mask: null, hits: {}, ready: false, frame: 0 };

  // ---------- colours ----------
  function hexRgb(c) {
    c = (c || "").trim();
    if (c.startsWith("#")) { if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
    const m = c.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  let K;
  function readColors() {
    K = { red: ML.cssVar("--bad"), blue: ML.cssVar("--sup"), bg: ML.cssVar("--canvas-bg"), ink: ML.cssVar("--ink"), muted: ML.cssVar("--muted"), line: ML.cssVar("--line"), acc: ML.cssVar("--accent"), card: ML.cssVar("--card"), minus: ML.cssVar("--rl") };
    K.rR = hexRgb(K.red); K.bR = hexRgb(K.blue); K.gR = hexRgb(K.bg);
  }

  // ---------- race set-up ----------
  function restart() {
    S.data = S.data || C.makeData(S.seed);
    const base = C.buildNet(SIZES, S.seed + 7);
    S.A = C.cloneNet(base); S.B = C.cloneNet(base); S.rA = C.rng(S.seed + 11); S.rB = C.rng(S.seed + 13);
    S.step = 0; S.hist = []; S.mask = null; record(); draw();
  }
  function newDots() { S.seed = 1 + Math.floor(Math.random() * 90000); S.data = null; restart(); }

  function record() {
    const d = S.data, a = C.evaluate(S.A, d.train), at = C.evaluate(S.A, d.test), b = C.evaluate(S.B, d.train), bt = C.evaluate(S.B, d.test);
    S.hist.push({ a: a.loss, at: at.loss, b: b.loss, bt: bt.loss });
    S.cur = { aTr: a.acc, aTe: at.acc, bTr: b.acc, bTe: bt.acc, aGap: at.loss - a.loss, bGap: bt.loss - b.loss };
  }
  function trainSome(n) {
    for (let i = 0; i < n && S.step < MAXSTEPS; i++) {
      C.trainStep(S.A, S.data.train, { lr: LR, r: S.rA });
      const res = C.trainStep(S.B, S.data.train, { lr: LR, dropout: S.drop, decay: S.decay, r: S.rB });
      S.mask = res.shown; S.step++; record();
    }
    if (S.step >= MAXSTEPS && S.running) { setRun(false); ML.say("That is " + MAXSTEPS + " practice steps. Look at the gap between the lines on the chart. Try another nap chance!"); }
  }

  // ---------- drawing ----------
  const PX = (x) => ((x + 1) / 2) * MW, PY = (y) => ((1 - y) / 2) * MH;
  const heat = document.createElement("canvas"); heat.width = G; heat.height = G;
  const hx = heat.getContext("2d"), img = hx.createImageData(G, G);
  function drawMap(c, net) {
    const d = img.data;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const p = C.predict(net, ((i + 0.5) / G) * 2 - 1, 1 - ((j + 0.5) / G) * 2), col = p > 0.5 ? K.bR : K.rR;
      const k = 0.15 + Math.pow(Math.abs(p - 0.5) * 2, 0.8) * 0.5, o = (j * G + i) * 4;
      for (let q = 0; q < 3; q++) d[o + q] = K.gR[q] + (col[q] - K.gR[q]) * k;
      d[o + 3] = 255;
    }
    hx.putImageData(img, 0, 0);
    c.clearRect(0, 0, MW, MH); c.imageSmoothingEnabled = true; c.drawImage(heat, 0, 0, MW, MH);
    // the 50% line of the brain, traced roughly by marching the grid
    c.strokeStyle = K.ink; c.lineWidth = 2; c.globalAlpha = 0.55; c.beginPath();
    const N = 75, step = 2 / N, val = [];
    for (let j = 0; j <= N; j++) { val.push([]); for (let i = 0; i <= N; i++) val[j].push(C.predict(net, -1 + i * step, 1 - j * step) - 0.5); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const pts = [], v = [val[j][i], val[j][i + 1], val[j + 1][i + 1], val[j + 1][i]], cx = [i, i + 1, i + 1, i], cy = [j, j, j + 1, j + 1];
      for (let e = 0; e < 4; e++) { const f = (e + 1) % 4; if ((v[e] > 0) !== (v[f] > 0)) { const t = v[e] / (v[e] - v[f]); pts.push([cx[e] + (cx[f] - cx[e]) * t, cy[e] + (cy[f] - cy[e]) * t]); } }
      if (pts.length >= 2) { c.moveTo((pts[0][0] / N) * MW, (pts[0][1] / N) * MH); c.lineTo((pts[1][0] / N) * MW, (pts[1][1] / N) * MH); }
    }
    c.stroke(); c.globalAlpha = 1;
    if ($("showBorder").checked) {
      c.strokeStyle = K.ink; c.setLineDash([6, 5]); c.lineWidth = 1.5; c.globalAlpha = 0.6; c.beginPath();
      for (let i = 0; i <= 60; i++) { const x = -1 + (i / 60) * 2, X = PX(x), Y = PY(C.border(x)); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
      c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    }
    if ($("showTest").checked) {
      c.lineWidth = 1.5;
      for (const p of S.data.test) { c.strokeStyle = p.c ? K.blue : K.red; c.globalAlpha = 0.7; c.beginPath(); c.arc(PX(p.x), PY(p.y), 3, 0, 7); c.stroke(); }
      c.globalAlpha = 1;
    }
    for (const p of S.data.train) {
      const X = PX(p.x), Y = PY(p.y);
      if ($("showFib").checked && p.noisy) { c.strokeStyle = K.ink; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, 10, 0, 7); c.stroke(); }
      c.fillStyle = p.c ? K.blue : K.red; c.strokeStyle = "#fff"; c.lineWidth = 2; c.beginPath(); c.arc(X, Y, 5.5, 0, 7); c.fill(); c.stroke();
    }
  }
  function drawLoss() {
    const c = lc, L = 34, R = 10, T = 10, B = 24, H = S.hist;
    c.clearRect(0, 0, LW, LH);
    const ymax = Math.max(1, Math.min(4, Math.max(...H.map((h) => Math.max(h.at, h.bt))) * 1.1));
    const xmax = Math.max(200, S.step), X = (i) => L + (i / xmax) * (LW - L - R), Y = (v) => LH - B - (Math.min(v, ymax) / ymax) * (LH - T - B);
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = K.muted; c.textAlign = "right"; c.strokeStyle = K.line; c.lineWidth = 1;
    for (let v = 0; v <= ymax + 1e-9; v += ymax > 2 ? 1 : 0.5) { c.fillText(v.toFixed(1), L - 4, Y(v) + 3); c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(LW - R, Y(v)); c.stroke(); }
    c.textAlign = "center"; c.fillText("practice steps (" + xmax + ")", (L + LW - R) / 2, LH - 6); c.textAlign = "left"; c.fillText("oops", 2, 9);
    const line = (key, col, alpha, w) => { if (H.length < 2) return; c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = w; c.beginPath(); H.forEach((h, i) => (i ? c.lineTo(X(i), Y(h[key])) : c.moveTo(X(i), Y(h[key])))); c.stroke(); c.globalAlpha = 1; };
    line("a", K.red, 0.45, 2); line("at", K.red, 1, 2.5); line("b", K.acc, 0.45, 2); line("bt", K.acc, 1, 2.5);
    if (S.step > 20) { // shade the gap of the know-it-all brain at the end
      const h = H[H.length - 1], x = X(H.length - 1);
      c.strokeStyle = K.red; c.lineWidth = 1; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(x, Y(h.a)); c.lineTo(x, Y(h.at)); c.stroke(); c.setLineDash([]);
    }
  }
  function drawNet() {
    const c = nc, net = S.B, sz = net.sizes, cols = sz.length;
    c.clearRect(0, 0, NW, NH);
    const X = (l) => 22 + l * ((NW - 44) / (cols - 1)), Y = (l, j) => { const gap = (NH - 16) / sz[l]; return 8 + gap * (j + 0.5); };
    const awake = (l, j) => !(S.mask && l >= 1 && l <= cols - 2 && S.mask[l - 1][j] === 0);
    for (let l = 0; l < net.W.length; l++) {
      for (let j = 0; j < sz[l + 1]; j++) for (let i = 0; i < sz[l]; i++) {
        if (!awake(l, i) || !awake(l + 1, j)) continue;
        const w = net.W[l][j][i]; c.strokeStyle = w > 0 ? K.blue : K.minus; c.globalAlpha = Math.min(0.75, 0.06 + Math.abs(w) * 0.25); c.lineWidth = Math.min(2.5, 0.5 + Math.abs(w));
        c.beginPath(); c.moveTo(X(l), Y(l, i)); c.lineTo(X(l + 1), Y(l + 1, j)); c.stroke();
      }
    }
    c.globalAlpha = 1; let napping = 0;
    c.font = "800 8px Nunito, sans-serif"; c.textAlign = "center";
    for (let l = 0; l < cols; l++) for (let j = 0; j < sz[l]; j++) {
      const on = awake(l, j), r = l === 0 || l === cols - 1 ? 8 : 5.5; if (!on) napping++;
      c.fillStyle = on ? (l === 0 || l === cols - 1 ? K.acc : K.card) : K.muted; c.strokeStyle = on ? K.ink : K.muted; c.lineWidth = 1.5;
      c.beginPath(); c.arc(X(l), Y(l, j), r, 0, 7); c.fill(); c.stroke();
      if (!on) { c.fillStyle = K.ink; c.fillText("z", X(l) + 8, Y(l, j) - 3); }
    }
    c.fillStyle = K.muted; c.font = "700 10px Nunito, sans-serif";
    ["in", "16 cells", "16 cells", "out"].forEach((t, l) => c.fillText(t, X(l), NH - 1));
    $("napcount").innerHTML = S.drop === 0 ? "Nap chance is 0%, so every cell is always awake." : S.mask ? `Napping this step: <b>${napping}</b> of 32 cells. A new random group sleeps every step.` : "Press Practise to see naps.";
  }
  const pct = (v) => Math.round(v * 100) + "%";
  function draw() {
    if (!K) readColors();
    drawMap(ma, S.A); drawMap(mb, S.B); drawLoss(); drawNet();
    const s = S.cur;
    $("steps").textContent = "step " + S.step;
    $("aTr").textContent = pct(s.aTr); $("aTe").textContent = pct(s.aTe); $("bTr").textContent = pct(s.bTr); $("bTe").textContent = pct(s.bTe);
    $("capB").textContent = `${Math.round(S.drop * 100)}% nap · decay ${S.decay}`;
    $("gapline").innerHTML = S.step < 20 ? "Practise for a while, then compare the gap between each brain's two lines." :
      `Oops gap (new dots minus practice dots): know-it-all <b style="color:var(--bad)">${s.aGap.toFixed(2)}</b>, napping <b style="color:var(--accent)">${s.bGap.toFixed(2)}</b>.`;
    check();
  }

  // ---------- challenges ----------
  const TRY = {
    memo: "Try this: tick <b>Circle the fibbing dots</b> and look at the know-it-all map. It drew little islands just for them!",
    nap: "Try this: set nap chance to <b>0%</b> and weight decay to <b>0.01</b>. Can small weights alone do the same job?",
    decay: "Try this: press <b>New dots</b> and race again. Does napping help every time?",
  };
  function check() {
    if (!S.armed) return; // the head start on load does not count: the learner has to press Practise
    const s = S.cur, hit = (k, msg) => {
      if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg);
      const all = Object.keys(S.hits).length === 3;
      ML.say(`<b>Challenge done!</b> ${msg} ${all ? "You finished every challenge!" : TRY[k]}`); S.quietUntil = S.step + 150;
      if (all) ML.confetti(40);
    };
    if (s.aTr >= 0.999 && s.aTe <= s.aTr - 0.1) hit("memo", "100% on practice, much worse on new dots. That is memorising, not learning.");
    if (S.step >= 300 && S.drop >= 0.3 && s.bTe >= s.aTe && s.bGap < s.aGap / 2) hit("nap", "Random naps kept the napping brain honest. Its two lines stay close together.");
    if (S.step >= 300 && S.drop === 0 && S.decay >= 0.01 && s.bGap < s.aGap / 2) hit("decay", "Small weights alone smoothed the border. Weight decay works too!");
  }

  // ---------- loop + controls ----------
  function setRun(on) {
    S.running = on; const b = $("run");
    b.setAttribute("aria-pressed", on); b.innerHTML = ML.icon(on ? "pause" : "play") + (on ? " Pause" : " Practise");
  }
  let lastMood = "";
  function mood() {
    const s = S.cur; let m = "";
    if (S.step > 80 && s.aTr >= 0.999 && s.aGap > 0.6) m = `The know-it-all brain gets <b>every</b> practice dot right, even the fibbers. But look at the new dots: only <b>${pct(s.aTe)}</b>. Its red line on the chart is climbing!`;
    else if (S.step > 150 && s.bGap < s.aGap / 2) m = `The napping brain only gets <b>${pct(s.bTr)}</b> of practice dots, but <b>${pct(s.bTe)}</b> of new ones. It ignores the fibbers instead of learning them.`;
    if (S.quietUntil && S.step < S.quietUntil) return;
    if (m && m !== lastMood) { lastMood = m; ML.say(m); }
  }
  function loop() {
    S.frame++;
    if (S.running) {
      trainSome(reduce ? 2 : 3);
      // map redraws are the costly bit: every other frame is plenty
      if (S.frame % 2 === 0 || !S.running) { draw(); mood(); }
    }
    requestAnimationFrame(loop);
  }
  $("run").addEventListener("click", () => { S.armed = true; if (S.step >= MAXSTEPS) restart(); setRun(!S.running); });
  $("restart").addEventListener("click", () => { restart(); ML.say("Both brains forgot everything and start from the same first guess."); });
  $("newdots").addEventListener("click", () => { newDots(); ML.say("Brand-new dots, with a new set of fibbers. Press Practise!"); });
  ["showTest", "showBorder", "showFib"].forEach((id) => $(id).addEventListener("change", draw));
  ML.bindRange("#drop", (v) => v + "%", (v) => {
    S.drop = v / 100; if (!S.ready) return; restart();
    ML.say(v === 0 ? "Nap chance 0%: now the napping brain never naps. Without weight decay it is just a copy of the know-it-all." : v >= 60 ? `<b>${v}%</b> of cells nap each step. That is a very sleepy brain, but it still learns the big shape.` : `Each step, about <b>${v}%</b> of cells in the right-hand brain nap. Press Practise.`);
  });
  ML.bindRange("#decay", (v) => String(DECAYS[v]), (v) => {
    S.decay = DECAYS[v]; if (!S.ready) return; restart();
    ML.say(S.decay ? `Weight decay <b>${S.decay}</b>: every wire is gently pulled towards zero each step.` : "No weight decay: wires can grow as big as they like.");
  });
  // ---------- nudges when stuck ----------
  let idle = 0;
  const poke = () => { idle = 0; };
  ["click", "input", "change", "keydown"].forEach((ev) => document.querySelector("main").addEventListener(ev, poke));
  setInterval(() => {
    if (document.hidden) return; idle++;
    if (idle !== 15) return;
    const s = S.cur;
    if (!S.running && S.step < MAXSTEPS && !S.hits.memo) ML.say("Psst! Press <b>Practise</b> and watch the red line on the chart. Does it go down and then back up?");
    else if (!$("showTest").checked) ML.say("Tick <b>New (test) dots</b>. Those are dots neither brain ever studied. Which map gets more of them right?");
    else if (!S.hits.nap) ML.say("Try a nap chance of <b>30%</b> or more and practise for 300 steps. Then compare the oops gaps under the chart.");
    else if (!S.hits.decay) ML.say("Set nap chance to <b>0%</b> and weight decay to <b>0.01</b> or more. Small weights are another way to stop memorising.");
    else ML.say(`Know-it-all: <b>${pct(s.aTe)}</b> on new dots. Napping: <b>${pct(s.bTe)}</b>. Press <b>New dots</b> for a fresh race.`);
  }, 1000);

  document.addEventListener("themechange", () => setTimeout(() => { readColors(); draw(); }, 0));
  new MutationObserver(() => { readColors(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("load", () => { readColors(); draw(); });
  // first screen: a head start, so the know-it-all's wiggles already show
  S.ready = true; readColors(); restart(); trainSome(200); draw(); setRun(false);
  requestAnimationFrame(loop);
})();
