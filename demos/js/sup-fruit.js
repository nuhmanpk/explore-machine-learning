// Nearest Neighbours — k-NN on a 2D "fruit table" with a draggable mystery fruit,
// an auto-teach loop, a learning curve and checkpoints.
(function () {
  const W = 640, H = 480;
  const PX0 = 50, PY0 = 14, PX1 = 626, PY1 = 432;
  const cv = document.getElementById("cv");
  const { ctx } = ML.setupCanvas(cv, W, H);
  const AW = 300, AH = 110;
  const { ctx: actx } = ML.setupCanvas(document.getElementById("acc"), AW, AH);
  const { hexRgb, rgb } = SupKit;

  const FC = window.FruitCore;
  const { NAMES } = FC;
  const COLOR_VARS = ["--bad", "--lang", "--vision"];
  // ---------- vector fruit (same paths for canvas + HTML) ----------
  const FRUIT_PATHS = [
    { body: "M12 7.5c-2-1.6-7.5-1.6-7.5 4.5 0 4.3 2.8 8.5 5.2 8.5 1 0 1.4-.5 2.3-.5s1.3.5 2.3.5c2.4 0 5.2-4.2 5.2-8.5 0-6.1-5.5-6.1-7.5-4.5z",
      stem: "M12 7.5c0-2 .4-3.2 1.4-4.2", leaf: "M13 5.2c1.4-1.9 3.6-2 4.6-1.2-1 1.7-3.1 2.1-4.6 1.2z" },
    { body: "M3 12c1.2-.5 1.8-1.9 3.2-3.3C7.9 7 9.9 6 12 6s4.1 1 5.8 2.7c1.4 1.4 2 2.8 3.2 3.3-1.2.5-1.8 1.9-3.2 3.3C16.1 17 14.1 18 12 18s-4.1-1-5.8-2.7C4.8 13.9 4.2 12.5 3 12z" },
    { body: "M12 5.5c-1.7 0-2.7 1.4-2.7 3.2 0 1.6-.7 2.4-1.7 3.6C6.7 13.4 6 14.6 6 16.2c0 2.8 2.7 4.3 6 4.3s6-1.5 6-4.3c0-1.6-.7-2.8-1.6-3.9-1-1.2-1.7-2-1.7-3.6 0-1.8-1-3.2-2.7-3.2z",
      stem: "M12 5.5c0-1.2.3-2 1-2.8" },
  ];
  const P2D = FRUIT_PATHS.map((f) => ({ body: new Path2D(f.body), stem: f.stem && new Path2D(f.stem), leaf: f.leaf && new Path2D(f.leaf) }));
  function fruitSVG(c) {
    const f = FRUIT_PATHS[c];
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${f.body}" fill="var(${COLOR_VARS[c]})" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round"/>
      ${f.stem ? `<path d="${f.stem}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round"/>` : ""}
      ${f.leaf ? `<path d="${f.leaf}" fill="var(--vision)" stroke="var(--ink)" stroke-width="1.1"/>` : ""}
      ${c === 1 ? `<ellipse cx="9.5" cy="10" rx="2" ry="1" fill="#fff" opacity=".6"/>` : ""}</svg>`;
  }
  document.querySelectorAll("[data-fruit]").forEach((el) => (el.innerHTML = fruitSVG(+el.dataset.fruit)));
  function drawFruit(c, x, y, size, g = ctx, alpha = 1) {
    const p = P2D[c];
    g.save();
    g.globalAlpha = alpha;
    g.translate(x - size / 2, y - size / 2);
    g.scale(size / 24, size / 24);
    g.lineJoin = "round"; g.lineCap = "round";
    g.fillStyle = ML.cssVar(COLOR_VARS[c]); g.strokeStyle = ML.cssVar("--ink"); g.lineWidth = 1.6;
    g.fill(p.body); g.stroke(p.body);
    if (p.stem) g.stroke(p.stem);
    if (p.leaf) { g.fillStyle = ML.cssVar("--vision"); g.lineWidth = 1.1; g.fill(p.leaf); g.stroke(p.leaf); }
    if (c === 1) { g.fillStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.ellipse(9.5, 10, 2, 1, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }

  // ---------- state ----------
  const state = {
    pts: [],
    test: [],
    tool: 0,
    k: 3,
    q: { x: 0.55, y: 0.5 }, // mystery fruit
    showMap: true,
    showTest: false,
    drag: null,
    auto: false,
    viewing: null,
    curve: new Map(), // examples → test accuracy
    dirty: true,
    drops: [], // little landing animations
  };
  const toPx = (x, y) => [PX0 + x * (PX1 - PX0), PY1 - y * (PY1 - PY0)];
  const toData = (px, py) => [(px - PX0) / (PX1 - PX0), (PY1 - py) / (PY1 - PY0)];
  const shownPts = () => (state.viewing ? state.viewing.pts : state.pts);
  const shownK = () => (state.viewing ? state.viewing.k : state.k);

  let RGB = [];
  function readColors() { RGB = COLOR_VARS.map((v) => hexRgb(ML.cssVar(v))); }
  readColors();

  const sample = (c, spread = 1) => FC.sample(c, spread, ML);
  function makeTest(spread) { state.test = FC.makeTest(spread, ML); }

  // ---------- k-NN (see sup-fruit-core.js) ----------
  const knn = (x, y, k = shownK(), pts = shownPts()) => FC.knn(pts, x, y, k);
  const testAcc = (pts = state.pts, k = state.k) => FC.testAcc(pts, state.test, k);

  // ---------- map rendering ----------
  function renderMap(g, gw, gh, pts, k) {
    const img = g.createImageData(gw, gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const o = (j * gw + i) * 4;
      if (!pts.length) { img.data[o + 3] = 0; continue; }
      const r = knn((i + 0.5) / gw, 1 - (j + 0.5) / gh, k, pts);
      const conf = (r.probs[r.guess] - 1 / 3) * 1.5;
      img.data[o] = RGB[r.guess][0]; img.data[o + 1] = RGB[r.guess][1]; img.data[o + 2] = RGB[r.guess][2];
      img.data[o + 3] = 45 + conf * 115;
    }
    g.putImageData(img, 0, 0);
  }
  const GW = 144, GH = 104;
  const bg = document.createElement("canvas"); bg.width = GW; bg.height = GH;
  const bctx = bg.getContext("2d");

  // ---------- checkpoints ----------
  const MILESTONES = [1, 2, 4, 8, 16, 32];
  const tmp = document.createElement("canvas"); tmp.width = 40; tmp.height = 28;
  const tctx = tmp.getContext("2d");
  const cps = new SupKit.Checkpoints(document.getElementById("cps"), {
    milestones: MILESTONES,
    label: (m) => `${m} example${m > 1 ? "s" : ""}`,
    draw: (c, w, h, snap) => {
      renderMap(tctx, 40, 28, snap.pts, snap.k);
      c.imageSmoothingEnabled = true;
      c.drawImage(tmp, 0, 0, w, h);
      snap.pts.forEach((p) => { c.fillStyle = rgb(RGB[p.c]); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1; c.beginPath(); c.arc(p.x * w, (1 - p.y) * h, 2.6, 0, Math.PI * 2); c.fill(); c.stroke(); });
    },
    onPick: (snap, m) => {
      state.viewing = snap; state.dirty = true;
      const vb = document.getElementById("viewing");
      vb.classList.toggle("show", !!snap);
      if (snap) {
        stopAuto();
        vb.innerHTML = `${ML.icon("clock")} Looking at ${m} example${m > 1 ? "s" : ""} · back to live`;
        ML.say(`Back when I knew only <b>${m}</b> fruit, my test score was <b>${Math.round(snap.acc * 100)}%</b>. ${m <= 2 ? "I thought almost everything was the same fruit!" : "My map was starting to take shape."}`);
      }
    },
  });
  document.getElementById("viewing").addEventListener("click", () => cps.unpick());

  function changed() {
    state.dirty = true;
    const n = state.pts.length;
    const acc = testAcc();
    if (acc !== null) state.curve.set(n, acc);
    for (const m of MILESTONES) if (n >= m && !cps.has(m) && n === m) cps.capture(m, { pts: state.pts.map((p) => ({ ...p })), k: state.k, acc }, `test ${Math.round(acc * 100)}%`);
    document.getElementById("s-n").textContent = n;
    document.getElementById("s-acc").innerHTML = acc === null ? "–" : `${Math.round(acc * 100)}<small>%</small>`;
    drawCurve();
  }
  function resetLearning() {
    state.curve = new Map();
    cps.reset();
  }

  function drawCurve() {
    const data = [...state.curve.entries()].sort((a, b) => a[0] - b[0]).map(([x, y]) => ({ x, y: y * 100 }));
    SupKit.lineChart(actx, AW, AH, [{ data, color: ML.cssVar("--accent") }], {
      xMax: Math.max(10, ...data.map((d) => d.x)), yMin: 0, yMax: 100, yFmt: (v) => Math.round(v) + "%", xLabel: "examples taught →",
    });
  }

  // ---------- drawing ----------
  let pulse = 0;
  function draw() {
    pulse += 0.05;
    const ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted"), line = ML.cssVar("--line"), accent = ML.cssVar("--accent"), card = ML.cssVar("--card");
    const pts = shownPts();
    ctx.clearRect(0, 0, W, H);
    if (state.dirty) { renderMap(bctx, GW, GH, pts, shownK()); state.dirty = false; }
    if (state.showMap) { ctx.imageSmoothingEnabled = true; ctx.drawImage(bg, PX0, PY0, PX1 - PX0, PY1 - PY0); }

    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const [gx] = toPx(i / 4, 0), [, gy] = toPx(0, i / 4);
      ctx.beginPath(); ctx.moveTo(gx, PY0); ctx.lineTo(gx, PY1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PX0, gy); ctx.lineTo(PX1, gy); ctx.stroke();
    }
    ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(PX0, PY0); ctx.lineTo(PX0, PY1); ctx.lineTo(PX1, PY1); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = "800 15px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("rounder  →", (PX0 + PX1) / 2, PY1 + 26);
    ctx.fillStyle = muted; ctx.font = "700 12px Nunito, sans-serif";
    ctx.fillText("long & thin", PX0 + 40, PY1 + 26); ctx.fillText("ball-round", PX1 - 34, PY1 + 26);
    ctx.save(); ctx.translate(18, (PY0 + PY1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = ink; ctx.font = "800 15px Nunito, sans-serif"; ctx.fillText("more yellow  →", 0, 0); ctx.restore();

    // test fruit
    if (state.showTest && pts.length) {
      for (const t of state.test) {
        const [x, y] = toPx(t.x, t.y);
        const ok = knn(t.x, t.y).guess === t.c;
        drawFruit(t.c, x, y, 14, ctx, 0.55);
        ctx.strokeStyle = ML.cssVar(ok ? "--good" : "--bad"); ctx.lineWidth = 2.5;
        if (ok) { ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke(); }
      }
    }

    // neighbour lines + reach circle
    const q = state.q;
    const [qx, qy] = toPx(q.x, q.y);
    let res = null;
    if (pts.length) {
      res = knn(q.x, q.y);
      const far = res.near[res.near.length - 1];
      const fp = pts[far[1]];
      const [fx, fy] = toPx(fp.x, fp.y);
      ctx.strokeStyle = ink; ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(qx, qy, Math.hypot(fx - qx, fy - qy) + 14, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      res.near.forEach(([, i], rank) => {
        const p = pts[i];
        const [px, py] = toPx(p.x, p.y);
        ctx.strokeStyle = rgb(RGB[p.c]); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc((qx + px) / 2, (qy + py) / 2, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ML.cssVar("--bg"); ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(rank + 1, (qx + px) / 2, (qy + py) / 2 + 1);
      });
    }

    // training fruit
    const now = performance.now();
    state.drops = state.drops.filter((d) => now - d.t < 500);
    pts.forEach((p, idx) => {
      const [px, py] = toPx(p.x, p.y);
      const drop = state.drops.find((d) => d.p === p);
      const k = drop ? Math.min(1, (now - drop.t) / 500) : 1;
      const bounce = drop ? (1 - k) * -40 + Math.sin(k * Math.PI) * 4 : 0;
      ctx.fillStyle = card; ctx.strokeStyle = rgb(RGB[p.c]); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py + bounce, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      drawFruit(p.c, px, py + bounce, 24);
    });

    // mystery fruit
    const r = 22 + Math.sin(pulse) * 2;
    ctx.fillStyle = card; ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(qx, qy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = accent; ctx.font = "700 28px Fredoka, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("?", qx, qy + 1);
    if (res) {
      // guess badge
      const bx = qx + 20, by = qy - 22;
      ctx.fillStyle = card; ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      drawFruit(res.guess, bx, by, 20);
    }

    if (!pts.length) {
      ctx.fillStyle = muted; ctx.font = "800 18px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Tap the table to drop fruit (or press Teach me automatically)", (PX0 + PX1) / 2, PY0 + 40);
    }
  }

  // ---------- inside card ----------
  const votesEl = document.getElementById("votes");
  votesEl.innerHTML = NAMES.map((n, i) => `
    <div class="vote"><span data-fruit="${i}">${fruitSVG(i)}</span>
      <div class="bar"><i id="vb${i}" style="background:var(${COLOR_VARS[i]})"></i></div>
      <span class="pct" id="vp${i}">–</span></div>`).join("");
  let lastInside = "";
  function updateInside() {
    const pts = shownPts();
    const q = state.q;
    document.getElementById("q-where").textContent = `The ? is ${Math.round(q.x * 100)}% round and ${Math.round(q.y * 100)}% yellow.`;
    if (!pts.length) {
      document.getElementById("nb-list").innerHTML = "";
      document.getElementById("decision").textContent = "No examples yet — I have nobody to ask!";
      for (let i = 0; i < 3; i++) { document.getElementById("vb" + i).style.width = "0"; document.getElementById("vp" + i).textContent = "–"; }
      return;
    }
    const res = knn(q.x, q.y);
    const key = res.near.map((n) => n[1]).join(",") + res.guess + shownK();
    for (let i = 0; i < 3; i++) {
      document.getElementById("vb" + i).style.width = (res.probs[i] * 100).toFixed(0) + "%";
      document.getElementById("vp" + i).textContent = res.votes[i];
    }
    if (key === lastInside) return;
    lastInside = key;
    const shown = res.near.slice(0, 5);
    document.getElementById("nb-list").innerHTML = shown.map(([d, i], rank) =>
      `<div class="nb"><span class="mono">#${rank + 1}</span>${fruitSVG(pts[i].c)}<span>${NAMES[pts[i].c]}</span><span class="d">${(d * 100).toFixed(0)} steps away</span></div>`).join("") +
      (res.near.length > 5 ? `<div class="muted">…and ${res.near.length - 5} more</div>` : "");
    const tally = res.votes.map((v, i) => (v ? `${v} ${NAMES[i]}${v > 1 ? "s" : ""}` : "")).filter(Boolean).join(", ");
    document.getElementById("decision").innerHTML = `${tally} <span class="arrow">→</span> I guess <b>${NAMES[res.guess].toUpperCase()}</b>`;
  }

  // ---------- auto teach ----------
  const autoBtn = document.getElementById("auto");
  let autoTimer = null;
  function startAuto() {
    cps.unpick();
    if (state.pts.length >= 32) { state.pts = []; resetLearning(); changed(); }
    state.auto = true;
    autoBtn.innerHTML = `${ML.icon("pause")} Stop`;
    ML.say("Teaching time! The orchard sends me one fruit at a time, with its name tag. After each one I take the test again. Watch the score chart!");
    autoTick();
  }
  function autoTick() {
    if (!state.auto) return;
    if (state.pts.length >= 32) {
      stopAuto();
      const acc = testAcc();
      ML.say(`Done! With <b>32</b> examples I get <b>${Math.round(acc * 100)}%</b> of the test fruit right. Tap the snapshots to see how my map grew.`);
      if (acc > 0.85) ML.confetti(50);
      return;
    }
    const c = state.pts.length < 3 ? state.pts.length : ML.randInt(0, 2);
    const f = sample(c, messy ? 2 : 1.1);
    state.pts.push(f);
    state.drops.push({ p: f, t: performance.now() });
    changed();
    const n = state.pts.length, acc = testAcc();
    const msgs = {
      1: `My first fruit: one ${NAMES[f.c]}. Right now I think <b>everything</b> is a ${NAMES[f.c]}! Test score: ${Math.round(acc * 100)}%.`,
      2: `Two kinds now! The map splits in half. Test score: ${Math.round(acc * 100)}%.`,
      3: `All three fruits! Test score jumps to <b>${Math.round(acc * 100)}%</b>.`,
      8: `8 examples — the borders are getting sharper. Score: <b>${Math.round(acc * 100)}%</b>.`,
      16: `16 examples. Each new fruit only changes a tiny corner of the map now.`,
    };
    if (msgs[n]) ML.say(msgs[n]);
    autoTimer = setTimeout(autoTick, n < 4 ? 1100 : n < 10 ? 600 : 300);
  }
  function stopAuto() {
    state.auto = false;
    clearTimeout(autoTimer);
    autoBtn.innerHTML = `${ML.icon("play")} Teach me automatically`;
  }

  // ---------- interactions ----------
  function setTool(t) {
    state.tool = t === "erase" ? t : +t;
    document.querySelectorAll("#tools button").forEach((b) => b.classList.toggle("on", b.dataset.tool === String(t)));
  }
  document.getElementById("tools").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    setTool(b.dataset.tool);
    ML.say(b.dataset.tool === "erase" ? "Tap a fruit to take it away." : `Tap the table to drop ${NAMES[+b.dataset.tool]}s. You decide where they go — even silly places!`);
  });
  let ready = false;
  ML.bindRange("#k", (v) => v, (v) => {
    state.k = v; state.dirty = true; lastInside = "";
    if (!ready) return;
    cps.unpick();
    changed();
    ML.say(v === 1 ? "K = 1: I copy whoever is the very closest. Look how jumpy the map gets around odd fruit!" : v >= 9 ? `K = ${v}: a big crowd votes. Smooth map — but small groups get outvoted.` : `K = ${v}: the ${v} closest fruit vote, most votes wins.`);
  });
  document.getElementById("t-map").addEventListener("click", (e) => {
    state.showMap = !state.showMap; e.currentTarget.classList.toggle("on", state.showMap);
    ML.say(state.showMap ? "The colors show what I would guess for <b>every</b> spot on the table." : "Map hidden. Drag the ? — can you predict my guess before you look?");
  });
  document.getElementById("t-test").addEventListener("click", (e) => {
    state.showTest = !state.showTest; e.currentTarget.classList.toggle("on", state.showTest);
    const acc = testAcc();
    ML.say(state.showTest ? `These faded fruit are my test: fruit I never learned from. Green ring = I guessed right, red cross = wrong. ${acc !== null ? `Score: <b>${Math.round(acc * 100)}%</b>.` : ""}` : "Test fruit hidden.");
  });
  let messy = false;
  function preset(spread, msg) {
    stopAuto(); cps.unpick();
    messy = spread > 1.5;
    makeTest(messy ? 2 : 1.1);
    state.pts = [];
    resetLearning();
    changed(); // capture nothing at 0
    const order = [];
    for (let i = 0; i < 9; i++) for (let c = 0; c < 3; c++) order.push(sample(c, spread));
    // add one at a time so the learning curve and checkpoints fill in
    order.forEach((f) => { state.pts.push(f); changed(); });
    ML.say(msg);
  }
  document.getElementById("p-neat").addEventListener("click", () => preset(1, "A neat orchard: every fruit grows in its own corner. Easy! Drag the ? between the groups."));
  document.getElementById("p-messy").addEventListener("click", () => preset(2, "A messy orchard: some lemons look a lot like pears! Turn on <b>Test fruit</b> — I'll make mistakes where they mix."));
  document.getElementById("p-clear").addEventListener("click", () => { stopAuto(); cps.unpick(); state.pts = []; resetLearning(); changed(); ML.say("Empty table — and an empty brain. Teach me again!"); });

  function hitFruit(px, py) {
    let best = -1, bd = 20;
    state.pts.forEach((p, i) => { const [x, y] = toPx(p.x, p.y); const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  cv.addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint(cv, e, W, H);
    cv.setPointerCapture(e.pointerId);
    cps.unpick();
    const [qx, qy] = toPx(state.q.x, state.q.y);
    if (Math.hypot(qx - p.x, qy - p.y) < 28) { state.drag = { type: "q" }; return; }
    const i = hitFruit(p.x, p.y);
    if (state.tool === "erase") {
      if (i >= 0) { state.pts.splice(i, 1); changed(); ML.say("Poof! One example gone. Did my map change?"); }
      return;
    }
    if (i >= 0) { state.drag = { type: "fruit", i, x0: p.x, y0: p.y }; return; }
    const [x, y] = toData(p.x, p.y);
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    stopAuto();
    const f = { x, y, c: state.tool };
    state.pts.push(f);
    state.drops.push({ p: f, t: performance.now() });
    changed();
    const n = state.pts.length;
    if (n === 1) ML.say(`My first example! With only one ${NAMES[f.c]}, I think <b>everything</b> is a ${NAMES[f.c]}.`);
    else if (new Set(state.pts.map((q) => q.c)).size === 1) ML.say(`Only ${NAMES[f.c]}s so far… show me a different fruit so I learn the difference!`);
    else ML.say(`Got it, a ${NAMES[f.c]}! See how the colors on the map moved? That's me learning.`);
  });
  cv.addEventListener("pointermove", (e) => {
    const d = state.drag; if (!d) return;
    const p = ML.canvasPoint(cv, e, W, H);
    const [x, y] = toData(p.x, p.y);
    if (d.type === "q") { state.q = { x: ML.clamp(x, 0, 1), y: ML.clamp(y, 0, 1) }; }
    else { state.pts[d.i].x = ML.clamp(x, 0.01, 0.99); state.pts[d.i].y = ML.clamp(y, 0.01, 0.99); state.dirty = true; d.moved = true; }
  });
  function up() {
    const d = state.drag; state.drag = null;
    if (!d) return;
    if (d.type === "q") {
      const pts = state.pts;
      if (!pts.length) { ML.say("I have nobody to ask yet — teach me some fruit first!"); return; }
      const r = knn(state.q.x, state.q.y);
      const unanimous = r.votes[r.guess] === r.near.length;
      ML.say(unanimous ? `All ${r.near.length} neighbour${r.near.length > 1 ? "s" : ""} say <b>${NAMES[r.guess]}</b>. Easy!` : `Close call! ${r.votes.map((v, i) => (v ? v + " " + NAMES[i] : "")).filter(Boolean).join(" vs ")} — most votes wins: <b>${NAMES[r.guess]}</b>.`);
    } else if (d.moved) { changed(); ML.say(`You moved a ${NAMES[state.pts[d.i].c]}. Its little patch of map moved with it!`); }
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  autoBtn.addEventListener("click", () => (state.auto ? stopAuto() : startAuto()));
  document.addEventListener("themechange", () => { readColors(); state.dirty = true; cps.redraw(); drawCurve(); });

  // ---------- loop ----------
  let frameN = 0;
  function loop() {
    frameN++;
    draw();
    if (frameN % 3 === 0) updateInside();
    requestAnimationFrame(loop);
  }

  makeTest(1.1);
  // start with one of each so the ? already has neighbours to ask
  [0, 1, 2].forEach((c) => { state.pts.push(sample(c, 0.8)); changed(); });
  ready = true;
  requestAnimationFrame(loop);
})();
