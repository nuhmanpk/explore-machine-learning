// Draw the Box: draw boxes scored by IoU, then watch a tiny grid detector learn to box toys.
(function () {
  const C = window.DetectCore;
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = C.S, W = 384, K = W / S, LR = 0.0008, HELD = 30;
  const col = (n) => ML.cssVar(n) || "#888";
  const CH = [
    { id: "base", text: "Teach the robot: average IoU 0.50 or more on new tables" },
    { id: "small", text: "Switch on Smaller toys and get back to 0.50" },
    { id: "overlap", text: "Switch on Overlapping toys and get back to 0.50" },
    { id: "clutter", text: "Switch on Add clutter and get back to 0.50" },
    { id: "thr", text: "Find a sureness level that shows ghost boxes, one that misses toys, then a good middle" },
  ];

  const st = {
    net: C.makeNet(7), steps: 0, learning: false, seedCtr: 1000,
    opts: { small: false, overlap: false, clutter: false },
    hist: [], marks: [], done: {}, sawGhost: false, sawMiss: false,
    scene: null, sel: 0, guesses: null, ev: null, sceneCtr: 5000,
    // play
    pscene: null, ptarget: 0, pbox: null, drag: null, locked: false, drawn: 0, sum: 0, dirtyP: true, dirtyS: true,
  };
  const heldCache = {};

  const ctxP = ML.setupCanvas($("play"), W, W).ctx, ctxS = ML.setupCanvas($("scene"), W, W).ctx, ctxC = ML.setupCanvas($("chart"), 360, 200).ctx;
  const off = document.createElement("canvas"); off.width = S; off.height = S; const offx = off.getContext("2d");
  const colName = (o) => C.COLORS[o.color].name + " " + C.CLASSES[o.cls];
  const rgb = (o) => "rgb(" + C.COLORS[o.color].rgb.map((v) => Math.round(v * 255)).join(",") + ")";

  function drawScene(ctx, sc) {
    const id = offx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { id.data[i * 4] = sc.px[i * 3] * 255; id.data[i * 4 + 1] = sc.px[i * 3 + 1] * 255; id.data[i * 4 + 2] = sc.px[i * 3 + 2] * 255; id.data[i * 4 + 3] = 255; }
    offx.putImageData(id, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, W, W); ctx.drawImage(off, 0, 0, W, W);
  }
  function rect(ctx, b, color, lw, dash, fill) {
    const x = b.x1 * K, y = b.y1 * K, w = (b.x2 - b.x1) * K, h = (b.y2 - b.y1) * K;
    if (fill) { ctx.globalAlpha = fill.a; ctx.fillStyle = fill.c; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
  }
  function label(ctx, text, x, y, color) {
    ctx.font = "800 12px sans-serif"; const w = ctx.measureText(text).width + 8;
    x = Math.max(0, Math.min(W - w, x)); y = Math.max(15, y);
    ctx.fillStyle = color; ctx.fillRect(x, y - 15, w, 16); ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic"; ctx.fillText(text, x + 4, y - 3);
  }

  // ---------- Part 1: draw the box ----------
  function newPlay() {
    st.pscene = C.makeScene(st.sceneCtr += 7 + (Math.random() * 1e5 | 0), {});
    st.ptarget = 0; st.pbox = null; st.locked = false; st.dirtyP = true; askText();
  }
  function askText() {
    const o = st.pscene.objs[st.ptarget];
    $("ask").innerHTML = `Draw a box around the <span class="sw" style="background:${rgb(o)}"></span><b>${colName(o)}</b> (${st.ptarget + 1} of ${st.pscene.objs.length})`;
    $("iou").textContent = "0.00"; $("f-top").textContent = "0"; $("f-bot").textContent = "0"; $("verdict").textContent = "Draw a box to see your score.";
  }
  function playIoU() {
    if (!st.pbox) return null;
    const t = st.pscene.objs[st.ptarget], b = st.pbox, i = C.inter(t, b), u = C.area(t) + C.area(b) - i;
    return { i, u, v: u > 0 ? i / u : 0 };
  }
  function renderPlay() {
    drawScene(ctxP, st.pscene);
    const t = st.pscene.objs[st.ptarget], show = $("help").checked || st.locked;
    if (show) rect(ctxP, t, col("--ink"), 2, [6, 4]);
    if (st.pbox) {
      const b = st.pbox;
      if (C.inter(t, b) > 0) rect(ctxP, { x1: Math.max(t.x1, b.x1), y1: Math.max(t.y1, b.y1), x2: Math.min(t.x2, b.x2), y2: Math.min(t.y2, b.y2) }, "transparent", 0, null, { c: col("--good"), a: 0.5 });
      rect(ctxP, b, col("--accent"), 3);
    }
  }
  function playMove(live) {
    const r = playIoU(); if (!r) return;
    $("iou").textContent = r.v.toFixed(2);
    $("f-top").textContent = Math.round(r.i); $("f-bot").textContent = Math.round(r.u);
    if (!live) {
      st.drawn++; st.sum += r.v; $("n-drawn").textContent = st.drawn; $("avg").textContent = (st.sum / st.drawn).toFixed(2);
      const msg = r.v >= 0.9 ? "Wow, almost perfect!" : r.v >= 0.75 ? "Great box!" : r.v >= 0.5 ? "A hit! (0.50 or more counts)" : r.v > 0 ? "A miss. The boxes overlap, but not enough." : "No overlap at all.";
      $("verdict").textContent = msg;
      ML.say(r.v >= 0.5 ? `IoU <b>${r.v.toFixed(2)}</b>. ${msg} Press <b>Next toy</b>, or redraw to beat it.` : `IoU <b>${r.v.toFixed(2)}</b>. Shared area divided by total area is small. Try again: hug the toy tightly.`);
    }
  }
  (function bindPlay() {
    const cv = $("play");
    const pt = (e) => { const p = ML.canvasPoint(cv, e, W, W); return { x: Math.max(0, Math.min(S, p.x / K)), y: Math.max(0, Math.min(S, p.y / K)) }; };
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); st.drag = pt(e); st.locked = false; st.pbox = null; st.dirtyP = true; e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => { if (!st.drag) return; st.pbox = C.normBox(st.drag, pt(e)); playMove(true); st.dirtyP = true; });
    const up = (e) => {
      if (!st.drag) return; const p = pt(e), b = C.normBox(st.drag, p); st.drag = null;
      if (b.x2 - b.x1 < 1.5 || b.y2 - b.y1 < 1.5) { st.pbox = null; st.dirtyP = true; return; }
      st.pbox = b; st.locked = true; playMove(false); st.dirtyP = true;
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", () => { st.drag = null; });
  })();
  $("next").onclick = () => {
    if (st.ptarget + 1 < st.pscene.objs.length) { st.ptarget++; st.pbox = null; st.locked = false; askText(); st.dirtyP = true; ML.say("Next one! Which toy is it? Look at the name above the table."); }
    else { newPlay(); ML.say("New table! Draw your boxes. Part 2 shows how a robot learns to do this."); }
  };
  $("newplay").onclick = newPlay; $("help").onchange = () => { st.dirtyP = true; };

  // ---------- Part 2: the learner ----------
  function heldSet() {
    const key = ["small", "overlap", "clutter"].map((k) => +st.opts[k]).join("");
    if (!heldCache[key]) { heldCache[key] = []; for (let i = 0; i < HELD; i++) heldCache[key].push(C.makeScene(900000 + i, st.opts)); }
    return heldCache[key];
  }
  const conf = () => +$("thr").value / 100;
  function evaluate(push) {
    st.ev = C.evaluate(st.net, heldSet(), conf(), $("nms").checked);
    if (push) st.hist.push({ step: st.steps, v: st.ev.miou, set: Object.values(st.opts).join() });
    else if (st.hist.length) st.hist[st.hist.length - 1].v = st.ev.miou;
    checkWins();
  }
  function newScene() { st.scene = C.makeScene(st.sceneCtr += 13 + (Math.random() * 1e5 | 0), st.opts); st.sel = 0; refreshGuesses(); }
  function refreshGuesses() { st.guesses = C.cellGuesses(st.net, st.scene); st.dirtyS = true; }
  function train(n) {
    for (let q = 0; q < n; q++) {
      const b = []; for (let k = 0; k < 8; k++) b.push(C.makeScene(st.seedCtr++, st.opts));
      C.trainStep(st.net, b, LR); st.steps++;
      if (st.steps % 5 === 0 || q === n - 1) { /* evaluate once per frame below */ }
    }
    evaluate(true); refreshGuesses();
  }
  function win(id) {
    if (st.done[id]) return;
    st.done[id] = st.marks.length + 1; st.marks.push({ step: st.steps, n: st.marks.length + 1 });
    drawChal(); ML.toast && ML.toast("Challenge done: " + CH.find((c) => c.id === id).text);
    if (Object.keys(st.done).length === CH.length) ML.confetti && ML.confetti(60);
  }
  function checkWins() {
    const e = st.ev; if (!e || st.steps === 0) return;
    if (e.ghosts > 0) st.sawGhost = true;
    if (e.recall < 0.7) st.sawMiss = true;
    if (e.miou >= 0.5) {
      const o = st.opts; const any = o.small || o.overlap || o.clutter;
      if (!any) win("base");
      if (o.small) win("small"); if (o.overlap) win("overlap"); if (o.clutter) win("clutter");
    }
    if (st.sawGhost && st.sawMiss && e.recall >= 0.8 && e.precision >= 0.8 && e.miou >= 0.5) win("thr");
  }
  function drawChal() {
    $("chal").innerHTML = CH.map((c) => `<div class="item ${st.done[c.id] ? "done" : ""}"><i data-icon="${st.done[c.id] ? "check" : "star"}"></i>${c.text}<span class="tag">${st.done[c.id] ? "flag " + st.done[c.id] : "to do"}</span></div>`).join("");
    if (ML.hydrateIcons) ML.hydrateIcons($("chal"));
  }

  function renderScene() {
    const sc = st.scene, ctx = ctxS;
    drawScene(ctx, sc);
    if ($("grid").checked) {
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 1; i < C.G; i++) { ctx.moveTo(i * C.CELL * K, 0); ctx.lineTo(i * C.CELL * K, W); ctx.moveTo(0, i * C.CELL * K); ctx.lineTo(W, i * C.CELL * K); }
      ctx.stroke();
    }
    if ($("truth").checked) sc.objs.forEach((o, i) => rect(ctx, o, "#fff", i === st.sel ? 3 : 1.5, [5, 4]));
    else rect(ctx, sc.objs[st.sel], "#fff", 2, [3, 3]);
    const preds = C.detect(st.guesses, conf(), $("nms").checked);
    preds.forEach((p) => {
      const c = [col("--accent"), col("--good"), col("--warn") || "#f90"][p.cls];
      rect(ctx, p, c, 3);
      label(ctx, `${C.CLASSES[p.cls]} ${Math.round(p.conf * 100)}%`, p.x1 * K, p.y1 * K - 1, c);
    });
  }

  function drawChart() {
    const ctx = ctxC, Wd = 360, H = 200, L = 30, B = 20, T = 10, R = 8;
    ctx.clearRect(0, 0, Wd, H);
    const maxS = Math.max(60, st.steps), X = (s) => L + (s / maxS) * (Wd - L - R), Y = (v) => T + (1 - v) * (H - T - B);
    ctx.font = "700 10px sans-serif"; ctx.textAlign = "left"; ctx.strokeStyle = col("--line"); ctx.fillStyle = col("--muted"); ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(Wd - R, Y(v)); ctx.stroke(); ctx.fillText(v.toFixed(2), 1, Y(v) + 3); });
    ctx.fillText("steps", Wd - 34, H - 5);
    ctx.strokeStyle = col("--good"); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L, Y(0.5)); ctx.lineTo(Wd - R, Y(0.5)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col("--good"); ctx.fillText("hit line 0.50", L + 4, Y(0.5) - 3);
    if (st.hist.length > 1) {
      ctx.strokeStyle = col("--accent"); ctx.lineWidth = 2.5; ctx.beginPath();
      st.hist.forEach((h, i) => (i ? ctx.lineTo(X(h.step), Y(h.v)) : ctx.moveTo(X(h.step), Y(h.v)))); ctx.stroke();
    }
    st.marks.forEach((m) => {
      const x = X(m.step); ctx.strokeStyle = col("--good"); ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - B); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col("--good"); ctx.beginPath(); ctx.arc(x, T + 6, 7, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText(m.n, x, T + 9); ctx.textAlign = "left";
    });
  }

  function inside() {
    const sc = st.scene, o = sc.objs[st.sel], el = $("inside"), thr = conf(), pct = (v) => Math.round(v * 100) + "%";
    const cx = (o.x1 + o.x2) / 2, cy = (o.y1 + o.y2) / 2;
    const hg = st.guesses[Math.min(7, Math.floor(cy / C.CELL)) * C.G + Math.min(7, Math.floor(cx / C.CELL))];
    const name = `<b>${colName(o)}</b>`, where = `row ${hg.gy + 1}, column ${hg.gx + 1}`;
    const preds = C.detect(st.guesses, thr, $("nms").checked);
    let best = null, bi = 0; preds.forEach((p) => { const v = C.iou(o, p); if (v > bi) { bi = v; best = p; } });
    const all = C.detect(st.guesses, thr, false).filter((p) => C.iou(o, p) > 0.3).length;
    let t = `Asking about the ${name}. Its middle sits in the cell at ${where}. `;
    if (st.steps === 0) t += `I have not learned anything yet, so every cell says "nothing here" (only ${pct(hg.conf)} sure). Press <b>learn</b>!`;
    else if (best && bi >= 0.5) {
      t += `That cell, and ${all > 1 ? all - 1 + " neighbour" + (all > 2 ? "s" : "") : "no neighbours"}, shouted "a toy is here!". The surest box is <b>${pct(best.conf)}</b> sure, says <b>${C.CLASSES[best.cls]}</b> (${pct(best.clsP)} on the shape${best.cls === o.cls ? ", correct" : ", but it is really a " + C.CLASSES[o.cls]}) and overlaps the true box with IoU <b>${bi.toFixed(2)}</b>.`;
      if (all > 1) t += $("nms").checked ? " Merging duplicates kept just the surest box and dropped the rest." : " Merging is off, so you can see the extra boxes piled on top.";
    } else if (best && bi > 0) {
      const bw = best.x2 - best.x1, tw = o.x2 - o.x1, bh = best.y2 - best.y1, th = o.y2 - o.y1;
      const why = bw * bh > 1.3 * tw * th ? "too big" : bw * bh < 0.75 * tw * th ? "too small" : "a bit shifted";
      t += `I boxed something here, but my box is ${why}: IoU is only <b>${bi.toFixed(2)}</b>, under the 0.50 hit line. More learning should snug it up.`;
    } else {
      const top = [...st.guesses].filter((g) => C.iou(o, g) > 0.15 || (g.gx === hg.gx && g.gy === hg.gy)).sort((a, b) => b.conf - a.conf)[0] || hg;
      t += `I <b>missed</b> it. My surest cell here is only ${pct(top.conf)} sure, below your ${pct(thr)} line, so I stayed quiet.`;
      t += o.x2 - o.x1 < 13 ? " It is a small toy, so there are few pixels to go on." : " It may be tucked behind another toy, or I need more practice.";
      t += " Try a lower sureness line.";
    }
    const ghosts = preds.filter((p) => sc.objs.every((q) => C.iou(q, p) < 0.5)).length;
    if (ghosts) t += ` <br><br>${ghosts} box${ghosts > 1 ? "es" : ""} on this table ${ghosts > 1 ? "are" : "is"} <b>ghost${ghosts > 1 ? "s" : ""}</b> (no toy there).`;
    el.innerHTML = `<p>${t}</p>`;
  }

  function renderStats() {
    const e = st.ev; $("steps").textContent = st.steps; $("miou").textContent = e.miou.toFixed(2);
    $("found").innerHTML = Math.round(e.recall * 100) + "<small>%</small>";
    $("ghost-line").textContent = `On the ${HELD} unseen tables: ${e.ghostsPer.toFixed(2)} ghost boxes per table.`;
    $("thr-v").textContent = Math.round(conf() * 100);
  }
  function setLearning(on) {
    st.learning = on;
    $("learn").innerHTML = (on ? ML.icon("pause") : ML.icon("play")) + (on ? " Pause" : " Robot, learn to find boxes!");
  }
  function frame() {
    if (st.learning) { train(reduce ? 3 : 1); if (st.steps === 1) ML.say("Watch the chart climb. Each step I look at 8 new tables and nudge my numbers."); st.dirtyS = true; renderStats(); drawChart(); }
    if (st.dirtyP) { renderPlay(); st.dirtyP = false; }
    if (st.dirtyS) { renderScene(); inside(); st.dirtyS = false; }
    requestAnimationFrame(frame);
  }

  // ---------- events ----------
  function redo() { evaluate(false); refreshGuesses(); renderStats(); drawChart(); }
  $("learn").onclick = () => setLearning(!st.learning);
  $("lstep").onclick = () => { setLearning(false); train(1); renderStats(); drawChart(); };
  $("newscene").onclick = () => { newScene(); ML.say("A fresh table the robot has never seen. Does it find every toy?"); };
  $("lreset").onclick = () => {
    setLearning(false); st.net = C.makeNet(7); st.steps = 0; st.hist = []; st.marks = []; st.done = {}; st.sawGhost = st.sawMiss = false;
    evaluate(true); refreshGuesses(); drawChal(); renderStats(); drawChart();
  };
  ["nms", "truth", "grid"].forEach((id) => { $(id).onchange = () => { if (id === "nms") redo(); st.dirtyS = true; }; });
  $("thr").oninput = () => {
    redo();
    const e = st.ev;
    if (st.steps > 0) ML.say(conf() <= 0.2 ? `Very relaxed: I show almost every guess, so <b>ghost boxes</b> pop up (${e.ghostsPer.toFixed(1)} per table).` : conf() >= 0.8 ? `Very strict: only boxes I am surest about, so I <b>miss</b> toys (found ${Math.round(e.recall * 100)}%).` : "A middle line keeps most real toys and few ghosts.");
  };
  [["c-small", "small", "Small toys have few pixels, so boxes are harder to place."], ["c-overlap", "overlap", "Toys hide parts of each other, so boxes crowd together."], ["c-clutter", "clutter", "Coloured specks look a bit like tiny toys: expect ghost boxes."]].forEach(([id, k, msg]) => {
    $(id).onclick = () => {
      st.opts[k] = !st.opts[k]; $(id).classList.toggle("on", st.opts[k]);
      newScene(); evaluate(true); renderStats(); drawChart();
      ML.say(st.opts[k] ? `${msg} Keep me training and watch the chart dip, then recover!` : "Back to easier tables.");
    };
  });
  const cv = $("scene");
  cv.addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint(cv, e, W, W), x = p.x / K, y = p.y / K;
    let bi = -1, bd = 1e9;
    st.scene.objs.forEach((o, i) => { const d = Math.hypot((o.x1 + o.x2) / 2 - x, (o.y1 + o.y2) / 2 - y); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) { st.sel = bi; st.dirtyS = true; }
  });

  // ---------- init ----------
  newPlay(); newScene(); evaluate(true); drawChal(); setLearning(false); renderStats(); drawChart();
  requestAnimationFrame(frame);
})();
