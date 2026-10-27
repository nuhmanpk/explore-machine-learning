// Right or Wrong? page code. Logic lives in sup-metrics-core.js.
(function () {
  const C = window.MetricsCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = 640, H = 330, HW = 640, HH = 150, CW = 300, CH = 170;
  const cv = $("cv");
  const { ctx } = ML.setupCanvas(cv, W, H);
  const { ctx: hctx } = ML.setupCanvas($("hist"), HW, HH);
  const { ctx: cctx } = ML.setupCanvas($("chart"), CW, CH);
  const N = 1000, LO = -3.5, HI = 6.5;
  const SCEN = {
    patrol: { fn: 5, fp: 1, name: "Dragon patrol", focus: "fn", text: "A missed dragon burns a house, a false alarm only wastes a minute. Misses cost 5x." },
    med: { fn: 20, fp: 1, name: "Medical test", focus: "fn", text: "A missed sick patient is scary, a false alarm just means another test. Misses cost 20x." },
    spam: { fn: 1, fp: 10, name: "Spam filter", focus: "fp", text: "Hiding a real email is awful, seeing a bit of spam is fine. False alarms cost 10x." },
  };
  let raf = 0;
  const data = C.makeData(7, N);
  const S = { prev: 2, thr: 2, scen: "patrol", r: null, best: null, L: null, hist: [], run: false, hits: {}, maxPrev: 2 };

  function realise() {
    S.r = C.realise(data, Math.round((N * S.prev) / 100));
    const sc = SCEN[S.scen]; S.best = C.bestThreshold(S.r.s, S.r.y, sc.fn, sc.fp);
  }
  const pct = (v) => (v === null ? "-" : Math.round(v * 100) + "%");
  const cur = () => { const c = C.atThreshold(S.r.s, S.r.y, S.thr); return { c, m: C.metrics(c), cost: C.cost(c, SCEN[S.scen].fn, SCEN[S.scen].fp) }; };

  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawDots(c) {
    const ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted"), bad = ML.cssVar("--bad"), good = ML.cssVar("--good"), line = ML.cssVar("--line"), bg2 = ML.cssVar("--bg-2");
    ctx.clearRect(0, 0, W, H);
    const bw = (W - 12) / 2, bh = (H - 12) / 2;
    const boxes = {
      tp: { x: 0, y: 0, t: "Right alarms", col: good }, fn: { x: bw + 12, y: 0, t: "Misses", col: bad },
      fp: { x: 0, y: bh + 12, t: "False alarms", col: ML.cssVar("--warn") }, tn: { x: bw + 12, y: bh + 12, t: "Right quiet", col: good },
    };
    const focus = SCEN[S.scen].focus, slots = {};
    for (const k in boxes) { const b = boxes[k]; slots[k] = 0; ctx.fillStyle = bg2; ctx.strokeStyle = k === focus ? bad : line; ctx.lineWidth = k === focus ? 4 : 2; rr(ctx, b.x + 2, b.y + 2, bw - 4, bh - 4, 12); ctx.fill(); ctx.stroke(); }
    ctx.font = "800 13px Nunito, sans-serif"; ctx.textBaseline = "top";
    for (const k in boxes) { const b = boxes[k]; ctx.fillStyle = b.col; ctx.textAlign = "left"; ctx.fillText(b.t, b.x + 10, b.y + 8); ctx.fillStyle = ink; ctx.textAlign = "right"; ctx.fillText(c[k], b.x + bw - 10, b.y + 8); }
    ctx.textAlign = "left";
    const step = 6.6, top = 30, cols = Math.floor((bw - 16) / step);
    for (let i = 0; i < N; i++) {
      const rare = S.r.y[i], alarm = S.r.s[i] >= S.thr, k = alarm ? (rare ? "tp" : "fp") : (rare ? "fn" : "tn"), b = boxes[k], n = slots[k]++;
      const px = b.x + 12 + (n % cols) * step + step / 2, py = b.y + top + Math.floor(n / cols) * step + step / 2;
      if (py > b.y + bh - 4) continue;
      ctx.fillStyle = rare ? bad : muted; ctx.globalAlpha = rare ? 1 : 0.7;
      ctx.beginPath(); ctx.arc(px, py, rare ? 3.6 : 2.4, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHist() {
    const c = hctx, L = 8, R = 8, T = 16, B = 22, nb = 40, bwid = (HI - LO) / nb;
    const hr = new Array(nb).fill(0), ho = new Array(nb).fill(0);
    for (let i = 0; i < N; i++) { const b = ML.clamp(Math.floor((S.r.s[i] - LO) / bwid), 0, nb - 1); (S.r.y[i] ? hr : ho)[b]++; }
    const mr = Math.max(1, ...hr), mo = Math.max(1, ...ho), X = (v) => L + ((v - LO) / (HI - LO)) * (HW - L - R), bpx = (HW - L - R) / nb;
    c.clearRect(0, 0, HW, HH);
    const muted = ML.cssVar("--muted"), bad = ML.cssVar("--bad"), ink = ML.cssVar("--ink");
    for (let b = 0; b < nb; b++) {
      const x = L + b * bpx;
      c.fillStyle = muted; c.globalAlpha = 0.45; const h1 = (ho[b] / mo) * (HH - T - B); c.fillRect(x, HH - B - h1, bpx - 1, h1);
      c.fillStyle = bad; c.globalAlpha = 0.65; const h2 = (hr[b] / mr) * (HH - T - B); c.fillRect(x + 1, HH - B - h2, bpx - 3, h2);
    }
    c.globalAlpha = 1; c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "center";
    for (let v = -2; v <= 6; v += 2) c.fillText(v, X(v), HH - B + 12);
    c.fillText("dragon score", HW / 2, HH - 3);
    c.fillStyle = ink; c.fillRect(X(S.thr) - 1.5, T - 4, 3, HH - T - B + 4);
    c.textAlign = "center"; c.fillText("alarm line", X(S.thr), 9);
    const sx = X(S.best.t); c.fillStyle = ML.cssVar("--warn"); c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4 : 8; c.lineTo(sx + Math.cos(a) * r, HH - B - 10 + Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke();
  }

  function ui() {
    const { c, m, cost } = cur(), sc = SCEN[S.scen];
    drawDots(c); drawHist();
    $("thr-lbl").textContent = S.thr.toFixed(1);
    $("m-acc").textContent = pct(m.acc); $("m-prec").textContent = pct(m.prec); $("m-rec").textContent = pct(m.rec); $("m-cost").textContent = cost;
    $("f1-out").textContent = m.f1.toFixed(2);
    const lazy = c.tp + c.fp === 0, v = $("verdict");
    if (lazy && m.acc > 0.9) { v.textContent = "Great accuracy, zero dragons caught!"; v.style.color = "var(--bad)"; }
    else if (cost <= S.best.cost * 1.15 + 2) { v.textContent = "Good line for this job."; v.style.color = "var(--good)"; }
    else { v.textContent = c.fn * sc.fn > c.fp * sc.fp ? "Too many misses for this job." : "Too many false alarms for this job."; v.style.color = "var(--warn)"; }
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--ink)"></span><span>Alarm if score is <b>${S.thr.toFixed(1)}</b> or more. That rang for <b>${c.tp + c.fp}</b> villagers, <b>${c.tp}</b> real.</span></div>
      <div class="sig"><span class="dot" style="background:var(--bad)"></span><span>There are <b>${S.r.rare}</b> real dragons. We caught <b>${c.tp}</b> and missed <b>${c.fn}</b>.</span></div>
      <div class="sig"><span class="dot" style="background:var(--warn)"></span><span><b>${sc.name}:</b> ${sc.text} The <b>${sc.focus === "fn" ? "Misses" : "False alarms"}</b> box is the one to watch.</span></div>
      <div class="decision">${lazy && m.acc > 0.9 ? `Accuracy ${pct(m.acc)} looks great, but recall is ${pct(m.rec)}.` : `Best line for this job is about ${S.best.t.toFixed(1)} (star).`}</div>`;
    if (!ui.quiet) ML.say(lazy && m.acc > 0.9 ? `<b>${pct(m.acc)} accurate</b> and I caught <b>zero</b> dragons. Accuracy fooled us!` : `<b>${c.tp}</b> right alarms, <b>${c.fp}</b> false alarms, <b>${c.fn}</b> misses. Precision <b>${pct(m.prec)}</b>, recall <b>${pct(m.rec)}</b>.`);
    checks(lazy, m, cost);
  }

  const sure = () => +$("sure").value / 100;
  const lstats = () => C.evaluate(S.L, sure());
  function record(loss) { const e = lstats(); S.hist.push({ acc: e.m.acc, rec: e.m.rec === null ? 0 : e.m.rec, loss }); }
  function trainSteps(k) { let l = 0; for (let i = 0; i < k; i++) { l = C.step(S.L); record(l); } lui(); }
  function lui() {
    const e = lstats(), m = e.m;
    $("l-ep").textContent = S.L.ep; $("l-acc").textContent = pct(m.acc); $("l-rec").textContent = pct(m.rec); $("l-prec").textContent = pct(m.prec);
    $("l-note").innerHTML = m.acc > 0.9 && (m.rec || 0) < 0.5 ? `<span class="warnline">Accuracy ${pct(m.acc)} but it caught only ${e.c.tp} of ${S.r.rare} dragons.</span>` : `It caught ${e.c.tp} of ${S.r.rare} dragons with ${e.c.fp} false alarms.`;
    drawChart();
    if (+$("cw").value >= 25 && S.L.ep > 20 && (m.rec || 0) >= 0.6) mark("cw", "Class weights: the robot now catches most dragons!", true);
  }
  function drawChart() {
    const c = cctx, L = 28, R = 8, T = 10, B = 22, n = S.hist.length, maxE = Math.max(100, n - 1);
    const X = (i) => L + (i / maxE) * (CW - L - R), Y = (v) => CH - B - v * (CH - T - B);
    c.clearRect(0, 0, CW, CH);
    const muted = ML.cssVar("--muted"), line = ML.cssVar("--line"), ink = ML.cssVar("--ink");
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right"; c.textBaseline = "middle"; c.strokeStyle = line; c.lineWidth = 1;
    [0, 0.5, 1].forEach((v) => { c.fillText(Math.round(v * 100) + "%", L - 4, Y(v)); c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); });
    c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillText("training rounds", (L + CW - R) / 2, CH - 5);
    const ln = (k, col) => { c.strokeStyle = col; c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath(); S.hist.forEach((h, i) => (i ? c.lineTo(X(i), Y(h[k])) : c.moveTo(X(i), Y(h[k])))); c.stroke(); };
    ln("acc", ML.cssVar("--accent")); ln("rec", ML.cssVar("--bad"));
    Object.keys(S.hits).forEach((k) => { const i = Math.min(S.hits[k], Math.max(0, n - 1)); c.fillStyle = ML.cssVar("--warn"); c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath(); c.arc(X(i), CH - B - 5, 6, 0, 7); c.fill(); c.stroke(); });
  }

  function mark(k, msg, big) {
    if (S.hits[k] !== undefined) return;
    S.hits[k] = S.L ? S.L.ep : 0; $("c-" + k).classList.add("done"); ML.toast(msg); if (big) ML.confetti(40); if (S.L) drawChart();
  }
  function checks(lazy, m, cost) {
    if (!S.L) return;
    if (lazy && m.acc >= 0.95) mark("lazy", "The lazy robot: great accuracy, caught no dragons!");
    if (S.maxPrev > 5 && S.prev <= 1) mark("rare", "Rarer dragons: accuracy went up, but the detector is not better for it.", true);
    if (S.scen === "med" && cost <= S.best.cost * 1.3 + 2 && !lazy) mark("med", "Medical test: you kept misses low!");
    if (S.scen === "spam" && cost <= S.best.cost * 1.3 + 2) mark("spam", "Spam filter: you kept false alarms low!", true);
  }

  $("thr").addEventListener("input", (e) => { S.thr = +e.target.value; ui(); });
  $("best").addEventListener("click", () => { S.thr = S.best.t; $("thr").value = S.thr; ui(); });
  $("lazy").addEventListener("click", () => { S.thr = 6; $("thr").value = 6; ui(); });
  document.querySelectorAll("#scen .btn").forEach((b) => b.addEventListener("click", () => {
    S.scen = b.dataset.s; document.querySelectorAll("#scen .btn").forEach((x) => x.classList.toggle("on", x === b));
    const sc = SCEN[S.scen]; S.best = C.bestThreshold(S.r.s, S.r.y, sc.fn, sc.fp); ui.quiet = true; ui(); ui.quiet = false;
    ML.say(`<b>${sc.name}.</b> ${sc.text} The star moved to <b>${S.best.t.toFixed(1)}</b>. Try putting the line there.`);
  }));
  function resetLearner() { stopRun(); S.L = C.newLearner(S.r, +$("cw").value); S.hist = []; record(0); lui(); }
  ML.bindRange("#prev", (v) => v + "%", (v) => {
    if (!S.r || v === S.prev) return;
    S.prev = v; S.maxPrev = Math.max(S.maxPrev, v); realise(); ui.quiet = true; ui(); ui.quiet = false;
    const c = cur();
    ML.say(`Only <b>${S.r.rare}</b> dragons now. Same line, accuracy <b>${pct(c.m.acc)}</b>, but precision <b>${pct(c.m.prec)}</b>. Rare things make false alarms swamp the real ones.`);
    resetLearner();
  });
  ML.bindRange("#cw", (v) => v + "x", () => { if (!S.r) return; resetLearner(); ML.say("Dragon mistakes now count more while the robot learns. Press <b>Train</b> and compare recall."); });
  ML.bindRange("#sure", (v) => v + "%", () => { if (S.L) lui(); });


  function stopRun() { S.run = false; cancelAnimationFrame(raf); $("train").innerHTML = `${ML.icon("play")} Train the robot`; }
  $("train").addEventListener("click", () => {
    if (S.run) return stopRun();
    if (S.L.ep >= 400) resetLearner();
    S.run = true; $("train").innerHTML = `${ML.icon("pause")} Pause`;
    ML.say("I start with a blank guess and nudge my knobs a little each round. Watch the <b>blue</b> accuracy and the <b>red</b> recall.");
    const tick = () => {
      if (!S.run) return;
      trainSteps(reduce ? 20 : 2);
      if (S.L.ep >= 400) { stopRun(); const e = lstats(); ML.say(`Done after <b>${S.L.ep}</b> rounds. Accuracy <b>${pct(e.m.acc)}</b>, recall <b>${pct(e.m.rec)}</b>. ${e.m.acc > 0.9 && e.m.rec < 0.5 ? "Lopsided data makes it play safe. Try the class weight!" : "It catches more dragons, at the price of some false alarms."}`); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  $("reset").addEventListener("click", resetLearner);
  new MutationObserver(() => { if (S.L) { ui(); drawChart(); } }).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => { ui(); drawChart(); });

  realise(); resetLearner(); ui();
})();
