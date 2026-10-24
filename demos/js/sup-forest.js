// Twenty Questions Trees — CART decision tree grown split by split, then a random forest.
(function () {
  const W = 640, H = 460;
  const PX0 = 20, PY0 = 16, PX1 = 620, PY1 = 444;
  const cv = document.getElementById("cv");
  const { ctx } = ML.setupCanvas(cv, W, H);
  const TW = 340, TH = 250;
  const { ctx: tctx } = ML.setupCanvas(document.getElementById("tree"), TW, TH);
  const CW = 300, CH = 110;
  const { ctx: cctx } = ML.setupCanvas(document.getElementById("chart"), CW, CH);
  const { hexRgb, rgb } = SupKit;

  const NAMES = ["red", "blue", "yellow"];
  const CV = ["--bad", "--sup", "--lang"];
  let RGB = [];
  const readColors = () => (RGB = CV.map((v) => hexRgb(ML.cssVar(v))));
  readColors();

  // ---------- shapes (circle / triangle / square) ----------
  function shapePath(g, c, x, y, r) {
    g.beginPath();
    if (c === 0) g.arc(x, y, r, 0, Math.PI * 2);
    else if (c === 1) { g.moveTo(x, y - r * 1.15); g.lineTo(x + r * 1.1, y + r * 0.8); g.lineTo(x - r * 1.1, y + r * 0.8); g.closePath(); }
    else g.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  }
  function drawShape(g, c, x, y, r, hollow) {
    shapePath(g, c, x, y, r);
    g.lineWidth = hollow ? 2.5 : 2;
    if (hollow) { g.strokeStyle = rgb(RGB[c]); g.stroke(); }
    else { g.fillStyle = rgb(RGB[c]); g.fill(); g.strokeStyle = ML.cssVar("--ink"); g.stroke(); }
  }
  document.querySelectorAll("[data-shape]").forEach((el) => {
    const c = +el.dataset.shape;
    const d = c === 0 ? `<circle cx="8" cy="8" r="6"/>` : c === 1 ? `<path d="M8 1.5 15 14H1z"/>` : `<rect x="2" y="2" width="12" height="12"/>`;
    el.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14"><g fill="var(${CV[c]})" stroke="var(--ink)" stroke-width="1.5">${d}</g></svg>`;
  });

  // ---------- data ----------
  const GEN = {
    blobs() {
      const C = [[0.25, 0.7], [0.72, 0.72], [0.5, 0.25]];
      const c = ML.randInt(0, 2);
      return { x: C[c][0] + ML.randn() * 0.09, y: C[c][1] + ML.randn() * 0.09, c };
    },
    checks() {
      const x = Math.random(), y = Math.random();
      const c = (Math.floor(x * 3) + Math.floor(y * 3)) % 2 === 0 ? 0 : 1;
      return { x, y, c: Math.random() < 0.06 ? 1 - c : c };
    },
    messy() {
      const C = [[0.3, 0.65], [0.68, 0.6], [0.5, 0.28]];
      const c = ML.randInt(0, 2);
      return { x: C[c][0] + ML.randn() * 0.13, y: C[c][1] + ML.randn() * 0.13, c };
    },
  };
  const clampP = (p) => ({ x: ML.clamp(p.x, 0.02, 0.98), y: ML.clamp(p.y, 0.02, 0.98), c: p.c });

  const state = {
    pts: [], test: [], gen: "blobs",
    tool: 0, mode: "tree", depth: 6, ntrees: 15,
    tree: null, splits: 0, newest: null, newestT: 1,
    forest: [], hover: null, viewing: null, showTest: true,
    hist: [], fhist: [], growing: false, planting: false,
  };

  // ---------- tree ----------
  const gini = (cnt, n) => (n ? 1 - cnt.reduce((s, c) => s + (c / n) ** 2, 0) : 0);
  function counts(pts, idx) { const c = [0, 0, 0]; idx.forEach((i) => c[pts[i].c]++); return c; }
  function makeLeaf(pts, idx, depth, box) {
    const cnt = counts(pts, idx);
    return { idx, depth, box, cnt, n: idx.length, g: gini(cnt, idx.length), leaf: true };
  }
  function bestSplit(pts, node, randomAxis) {
    const axes = randomAxis ? [Math.random() < 0.5 ? "x" : "y"] : ["x", "y"];
    let best = null;
    for (const ax of axes) {
      const s = node.idx.slice().sort((a, b) => pts[a][ax] - pts[b][ax]);
      const L = [0, 0, 0], R = node.cnt.slice();
      for (let j = 0; j < s.length - 1; j++) {
        const p = pts[s[j]]; L[p.c]++; R[p.c]--;
        const v1 = p[ax], v2 = pts[s[j + 1]][ax];
        if (v2 - v1 < 1e-9) continue;
        const nl = j + 1, nr = s.length - nl;
        const g = (nl * gini(L, nl) + nr * gini(R, nr)) / s.length;
        if (!best || g < best.g) best = { g, ax, t: (v1 + v2) / 2, li: s.slice(0, nl), ri: s.slice(nl), gl: gini(L, nl), gr: gini(R, nr) };
      }
    }
    return best && best.g < node.g - 1e-9 ? best : null;
  }
  function leaves(n, out = []) { if (n.leaf) out.push(n); else { leaves(n.l, out); leaves(n.r, out); } return out; }
  function growOne(T, pts, maxDepth, randomAxis) {
    let pick = null;
    for (const lf of leaves(T)) {
      if (lf.depth >= maxDepth || lf.g === 0 || lf.n < 2) continue;
      if (lf.cand === undefined) lf.cand = bestSplit(pts, lf, randomAxis);
      if (!lf.cand) continue;
      const gain = lf.n * (lf.g - lf.cand.g);
      if (!pick || gain > pick.gain) pick = { lf, gain };
    }
    if (!pick) return null;
    const lf = pick.lf, s = lf.cand;
    const [x0, y0, x1, y1] = lf.box;
    const bl = s.ax === "x" ? [x0, y0, s.t, y1] : [x0, y0, x1, s.t];
    const br = s.ax === "x" ? [s.t, y0, x1, y1] : [x0, s.t, x1, y1];
    Object.assign(lf, { leaf: false, ax: s.ax, t: s.t, l: makeLeaf(pts, s.li, lf.depth + 1, bl), r: makeLeaf(pts, s.ri, lf.depth + 1, br) });
    return lf;
  }
  function newTree(pts, idx) { return makeLeaf(pts, idx || pts.map((_, i) => i), 0, [0, 0, 1, 1]); }
  function leafAt(T, x, y) { let n = T; while (!n.leaf) n = (n.ax === "x" ? x : y) < n.t ? n.l : n.r; return n; }
  function probs(T, x, y) { const lf = leafAt(T, x, y); return lf.n ? lf.cnt.map((c) => c / lf.n) : [1 / 3, 1 / 3, 1 / 3]; }
  const argmax = (a) => a.indexOf(Math.max(...a));
  function forestProbs(F, x, y) {
    const s = [0, 0, 0];
    F.forEach((t) => probs(t.T, x, y).forEach((v, i) => (s[i] += v)));
    return s.map((v) => v / (F.length || 1));
  }
  function predictor() {
    if (state.viewing) return state.viewing.pred;
    if (state.mode === "forest" && state.forest.length) { const F = state.forest.slice(); return (x, y) => forestProbs(F, x, y); }
    if (state.tree) { const T = state.tree; return (x, y) => probs(T, x, y); }
    return null;
  }
  function acc(pred, set) {
    if (!pred || !set.length) return null;
    return set.filter((p) => argmax(pred(p.x, p.y)) === p.c).length / set.length;
  }
  function cloneTree(n) { return n.leaf ? { ...n, cand: undefined } : { ...n, l: cloneTree(n.l), r: cloneTree(n.r) }; }

  // ---------- checkpoints ----------
  const TREE_MS = [1, 2, 4, 8, 16, -1], FOREST_MS = [1, 3, 5, 10, 25];
  const tiny = document.createElement("canvas"); tiny.width = 48; tiny.height = 34;
  const tinyCtx = tiny.getContext("2d");
  function paintMap(g, gw, gh, pred) {
    const img = g.createImageData(gw, gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const o = (j * gw + i) * 4;
      if (!pred) { img.data[o + 3] = 0; continue; }
      const p = pred((i + 0.5) / gw, 1 - (j + 0.5) / gh), c = argmax(p);
      img.data[o] = RGB[c][0]; img.data[o + 1] = RGB[c][1]; img.data[o + 2] = RGB[c][2];
      img.data[o + 3] = 40 + (p[c] - 1 / 3) * 1.5 * 120;
    }
    g.putImageData(img, 0, 0);
  }
  const cps = new SupKit.Checkpoints(document.getElementById("cps"), {
    milestones: TREE_MS,
    label: (m) => (m === -1 ? "Fully grown" : `${m} question${m > 1 ? "s" : ""}`),
    draw: (c, w, h, snap) => {
      paintMap(tinyCtx, 48, 34, snap.pred);
      c.imageSmoothingEnabled = true; c.drawImage(tiny, 0, 0, w, h);
      snap.pts.forEach((p) => { c.fillStyle = rgb(RGB[p.c]); c.fillRect(p.x * w - 1.2, (1 - p.y) * h - 1.2, 2.4, 2.4); });
    },
    onPick: (snap, m) => {
      state.viewing = snap; mapDirty = true;
      const vb = document.getElementById("viewing");
      vb.classList.toggle("show", !!snap);
      if (snap) {
        vb.innerHTML = `${ML.icon("clock")} Looking back · back to live`;
        ML.say(`Back then my practice score was <b>${pct(snap.train)}</b> and my test score was <b>${pct(snap.testA)}</b>.`);
      }
    },
  });
  document.getElementById("viewing").addEventListener("click", () => cps.unpick());
  const pct = (v) => (v === null || v === undefined ? "–" : Math.round(v * 100) + "%");
  function capture(m, label) {
    let pred = predictor();
    if (!pred) return;
    // the live tree keeps growing, so freeze a copy
    if (state.mode === "tree") { const T = cloneTree(state.tree); pred = (x, y) => probs(T, x, y); }
    const snap = { pred, pts: state.pts.slice(), train: acc(pred, state.pts), testA: acc(pred, state.test) };
    cps.capture(m, snap, `test ${pct(snap.testA)}`, true);
  }

  // ---------- data / reset ----------
  function loadPreset(name, msg) {
    state.gen = name;
    state.pts = []; state.test = [];
    for (let i = 0; i < 60; i++) state.pts.push(clampP(GEN[name]()));
    for (let i = 0; i < 90; i++) state.test.push(clampP(GEN[name]()));
    resetModels();
    if (msg) ML.say(msg);
  }
  function resetModels() {
    stopGrow();
    state.tree = state.pts.length ? newTree(state.pts) : null;
    state.splits = 0; state.newest = null;
    state.hist = []; state.forest = []; state.fhist = [];
    cps.unpick(); cps.reset();
    renderForestGrid();
    record();
    mapDirty = true;
    setInsideIdle();
  }
  function record() {
    if (state.mode === "tree" && state.tree) {
      const pred = predictor();
      state.hist.push({ x: state.splits, train: acc(pred, state.pts), test: acc(pred, state.test) });
    }
    updateStats();
  }

  // ---------- growing ----------
  let growTimer = null;
  function grow1(quiet) {
    if (!state.tree) return false;
    const before = state.tree.g;
    const n = growOne(state.tree, state.pts, state.depth, false);
    if (!n) {
      if (!quiet) ML.say(state.splits ? "No more useful questions! Every box is tidy, or I hit the depth limit." : "Nothing to split — add some shapes of different colors!");
      SupKit.overlay("Tree finished");
      capture(-1);
      return false;
    }
    state.splits++;
    state.newest = n; state.newestT = 0;
    mapDirty = true;
    record();
    if (TREE_MS.includes(state.splits)) capture(state.splits);
    explainSplit(n);
    return true;
  }
  function explainSplit(n) {
    const desc = (cnt) => cnt.map((c, i) => (c ? `${c} ${NAMES[i]}` : "")).filter(Boolean).join(", ") || "nothing";
    const q = n.ax === "x" ? `Is it left of ${Math.round(n.t * 100)}?` : `Is it below ${Math.round(n.t * 100)}?`;
    document.getElementById("inside").innerHTML = `
      <div class="mono">Question ${state.splits}</div>
      <div class="sig"><span class="dot" style="background:var(--muted)"></span><span>This box had ${desc(n.cnt)} — mixedness <b>${n.g.toFixed(2)}</b></span></div>
      <div class="sig"><span class="dot" style="background:var(--accent)"></span><span>I tried every line. Best question: <span class="decision">${q}</span></span></div>
      <div class="sig"><span class="dot" style="background:var(--good)"></span><span>Yes side: ${desc(n.l.cnt)} (mixed ${n.l.g.toFixed(2)})<br>No side: ${desc(n.r.cnt)} (mixed ${n.r.g.toFixed(2)})</span></div>`;
    if (!state.growing) ML.say(`I asked <b>"${q}"</b> Both sides got tidier: mixedness went from ${n.g.toFixed(2)} down to ${n.l.g.toFixed(2)} and ${n.r.g.toFixed(2)}.`);
  }
  function setInsideIdle() {
    document.getElementById("inside").innerHTML = state.mode === "tree"
      ? `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Press <b>Ask one question</b>. I'll explain why I picked each line. Point at the map to follow a shape down the tree.</span></div>`
      : `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Plant a forest, then point at the map to see every tree's vote.</span></div>`;
  }
  const growAllBtn = document.getElementById("growAll");
  function startGrow() {
    cps.unpick();
    state.growing = true;
    growAllBtn.innerHTML = `${ML.icon("pause")} Pause`;
    ML.say("Growing! One question at a time. Watch the practice score (solid) and the test score (dashed) on the chart.");
    const tick = () => {
      if (!state.growing) return;
      if (!grow1(true)) {
        stopGrow();
        const tr = state.hist[state.hist.length - 1];
        ML.say(tr.train > tr.test + 0.08
          ? `Done with ${state.splits} questions. Practice: <b>${pct(tr.train)}</b>, test: <b>${pct(tr.test)}</b>. I memorised the practice shapes too well — that's <b>overfitting</b>! Try a <b>Forest</b>.`
          : `Done with ${state.splits} questions! Practice <b>${pct(tr.train)}</b>, test <b>${pct(tr.test)}</b>.`);
        return;
      }
      growTimer = setTimeout(tick, state.splits < 4 ? 900 : 350);
    };
    tick();
  }
  function stopGrow() { state.growing = false; clearTimeout(growTimer); growAllBtn.innerHTML = `${ML.icon("play")} Grow it all`; }

  // ---------- forest ----------
  const forestEl = document.getElementById("forest");
  function renderForestGrid() {
    forestEl.innerHTML = state.forest.map((t, i) => `<div class="ft" data-i="${i}"><canvas></canvas><span>tree ${i + 1}</span></div>`).join("");
    forestEl.querySelectorAll(".ft").forEach((el, i) => {
      const c = el.querySelector("canvas");
      const { ctx: g } = ML.setupCanvas(c, 88, 62);
      const T = state.forest[i].T;
      paintMap(tinyCtx, 48, 34, (x, y) => probs(T, x, y));
      g.imageSmoothingEnabled = true; g.drawImage(tiny, 0, 0, 88, 62);
      state.forest[i].sample.forEach((p) => { g.fillStyle = rgb(RGB[p.c]); g.fillRect(p.x * 88 - 1.3, (1 - p.y) * 62 - 1.3, 2.6, 2.6); });
    });
  }
  function plant() {
    if (state.planting || state.pts.length < 4) return;
    cps.unpick(); cps.reset();
    state.forest = []; state.fhist = []; renderForestGrid();
    state.planting = true;
    ML.say(`Planting ${state.ntrees} trees! Each one gets a <b>random handful</b> of shapes (some twice, some not at all) and can only look one random way at each question. So every tree is a bit different.`);
    const tick = () => {
      if (state.forest.length >= state.ntrees || state.mode !== "forest") {
        state.planting = false;
        const last = state.fhist[state.fhist.length - 1];
        if (last) ML.say(`My forest of ${state.forest.length} trees scores <b>${pct(last.test)}</b> on the test shapes. One deep tree got <b>${pct(singleDeepTest())}</b>. Point at the map to see the trees vote!`);
        return;
      }
      const n = state.pts.length;
      const sample = Array.from({ length: n }, () => state.pts[ML.randInt(0, n - 1)]);
      const T = newTree(sample);
      while (growOne(T, sample, state.depth, true));
      state.forest.push({ T, sample });
      renderForestGrid();
      mapDirty = true;
      const pred = predictor();
      state.fhist.push({ x: state.forest.length, train: acc(pred, state.pts), test: acc(pred, state.test) });
      if (FOREST_MS.includes(state.forest.length)) capture(state.forest.length);
      updateStats();
      setTimeout(tick, state.forest.length < 3 ? 700 : 220);
    };
    tick();
  }
  let deepCache = null;
  function singleDeepTest() {
    const T = newTree(state.pts);
    while (growOne(T, state.pts, state.depth, false));
    return acc((x, y) => probs(T, x, y), state.test);
  }

  // ---------- stats / chart ----------
  function updateStats() {
    const pred = predictor();
    document.getElementById("s-train").textContent = pct(acc(pred, state.pts));
    document.getElementById("s-test").textContent = pct(acc(pred, state.test));
    const h = state.mode === "tree" ? state.hist : state.fhist;
    const tr = h.filter((d) => d.train !== null).map((d) => ({ x: d.x, y: d.train * 100 }));
    const te = h.filter((d) => d.test !== null).map((d) => ({ x: d.x, y: d.test * 100 }));
    SupKit.lineChart(cctx, CW, CH, [
      { data: tr, color: ML.cssVar("--accent") },
      { data: te, color: ML.cssVar("--rl") },
    ], { xMax: Math.max(state.mode === "tree" ? 8 : state.ntrees, ...h.map((d) => d.x)), yMin: 0, yMax: 100, yFmt: (v) => Math.round(v) + "%", xLabel: state.mode === "tree" ? "questions asked →" : "trees planted →" });
    document.getElementById("chart-legend").innerHTML = `<span><i style="background:var(--accent)"></i>practice shapes</span><span><i style="background:var(--rl)"></i>test shapes</span>`;
  }

  // ---------- drawing ----------
  const toPx = (x, y) => [PX0 + x * (PX1 - PX0), PY1 - y * (PY1 - PY0)];
  const toData = (px, py) => [(px - PX0) / (PX1 - PX0), (PY1 - py) / (PY1 - PY0)];
  const GW = 150, GH = 108;
  const mapC = document.createElement("canvas"); mapC.width = GW; mapC.height = GH;
  const mapCtx = mapC.getContext("2d");
  let mapDirty = true;

  function drawSplits(n, newest, t) {
    if (n.leaf) return;
    const [x0, y0, x1, y1] = n.box;
    let a, b;
    if (n.ax === "x") { a = toPx(n.t, y0); b = toPx(n.t, y1); } else { a = toPx(x0, n.t); b = toPx(x1, n.t); }
    const isNew = n === newest && t < 1;
    const e = isNew ? t : 1;
    ctx.strokeStyle = isNew ? ML.cssVar("--accent") : ML.cssVar("--ink");
    ctx.lineWidth = isNew ? 5 : Math.max(1.5, 4 - n.depth * 0.5);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(ML.lerp(a[0], b[0], e), ML.lerp(a[1], b[1], e)); ctx.stroke();
    drawSplits(n.l, newest, t); drawSplits(n.r, newest, t);
  }

  function frame() {
    if (state.newest && state.newestT < 1) state.newestT = Math.min(1, state.newestT + 0.04);
    const pred = predictor();
    ctx.clearRect(0, 0, W, H);
    if (mapDirty) { paintMap(mapCtx, GW, GH, pred); mapDirty = false; }
    ctx.imageSmoothingEnabled = state.mode === "forest";
    ctx.drawImage(mapC, PX0, PY0, PX1 - PX0, PY1 - PY0);
    ctx.strokeStyle = ML.cssVar("--line"); ctx.lineWidth = 2; ctx.strokeRect(PX0, PY0, PX1 - PX0, PY1 - PY0);
    if (state.mode === "tree" && state.tree && !state.viewing) drawSplits(state.tree, state.newest, state.newestT);

    if (state.showTest) for (const p of state.test) { const [x, y] = toPx(p.x, p.y); drawShape(ctx, p.c, x, y, 5, true); }
    for (const p of state.pts) { const [x, y] = toPx(p.x, p.y); drawShape(ctx, p.c, x, y, 6.5); }

    // hover path / box
    if (state.hover && state.mode === "tree" && state.tree && !state.viewing) {
      const lf = leafAt(state.tree, state.hover.x, state.hover.y);
      const [a, b] = [toPx(lf.box[0], lf.box[3]), toPx(lf.box[2], lf.box[1])];
      ctx.strokeStyle = ML.cssVar("--accent"); ctx.lineWidth = 4; ctx.setLineDash([8, 5]);
      ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
    }
    if (state.hover) {
      const [hx, hy] = toPx(state.hover.x, state.hover.y);
      ctx.strokeStyle = ML.cssVar("--ink"); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.moveTo(hx - 14, hy); ctx.lineTo(hx + 14, hy); ctx.moveTo(hx, hy - 14); ctx.lineTo(hx, hy + 14); ctx.stroke();
    }
    drawTree();
    requestAnimationFrame(frame);
  }

  // tree diagram
  function drawTree() {
    tctx.clearRect(0, 0, TW, TH);
    const T = state.mode === "tree" ? state.tree : (state.forest[0] && state.forest[0].T);
    document.getElementById("tree-title").textContent = state.mode === "tree" ? "The question tree" : "Tree 1 of the forest";
    if (!T) return;
    const lv = leaves(T);
    let maxD = 0; lv.forEach((l) => (maxD = Math.max(maxD, l.depth)));
    const pos = new Map();
    lv.forEach((l, i) => pos.set(l, (i + 0.5) / lv.length));
    const place = (n) => { if (n.leaf) return pos.get(n); const x = (place(n.l) + place(n.r)) / 2; pos.set(n, x); return x; };
    place(T);
    const rowH = (TH - 30) / Math.max(1, maxD);
    const P = (n) => [10 + pos.get(n) * (TW - 20), 16 + n.depth * rowH];
    const path = state.hover && state.mode === "tree" ? new Set() : null;
    if (path) { let n = T; path.add(n); while (!n.leaf) { n = (n.ax === "x" ? state.hover.x : state.hover.y) < n.t ? n.l : n.r; path.add(n); } }
    const ink = ML.cssVar("--ink");
    const edges = (n) => {
      if (n.leaf) return;
      for (const [ch, yes] of [[n.l, true], [n.r, false]]) {
        const [a, b] = [P(n), P(ch)];
        const hot = path && path.has(ch);
        tctx.strokeStyle = hot ? ML.cssVar("--accent") : ML.cssVar("--line"); tctx.lineWidth = hot ? 3.5 : 2;
        tctx.beginPath(); tctx.moveTo(a[0], a[1]); tctx.lineTo(b[0], b[1]); tctx.stroke();
        if (lv.length <= 10) {
          tctx.fillStyle = ML.cssVar("--muted"); tctx.font = "800 9px Nunito, sans-serif"; tctx.textAlign = "center";
          tctx.fillText(yes ? "yes" : "no", (a[0] + b[0]) / 2 + (yes ? -8 : 8), (a[1] + b[1]) / 2);
        }
        edges(ch);
      }
    };
    edges(T);
    const small = lv.length > 12;
    const nodes = (n) => {
      const [x, y] = P(n);
      const hot = path && path.has(n);
      if (n.leaf) {
        const c = argmax(n.cnt);
        tctx.fillStyle = rgb(RGB[c]); tctx.strokeStyle = hot ? ML.cssVar("--accent") : ink; tctx.lineWidth = hot ? 3 : 1.5;
        tctx.beginPath(); tctx.arc(x, y, small ? 5 : 8, 0, Math.PI * 2); tctx.fill(); tctx.stroke();
        if (!small) { tctx.fillStyle = ink; tctx.font = "800 9px Nunito, sans-serif"; tctx.textAlign = "center"; tctx.fillText(n.n, x, y + 19); }
        return;
      }
      const w = small ? 14 : 44, h = small ? 10 : 22;
      tctx.fillStyle = ML.cssVar("--card"); tctx.strokeStyle = hot || n === state.newest ? ML.cssVar("--accent") : ink; tctx.lineWidth = hot ? 3 : 1.5;
      SupKit.rr(tctx, x - w / 2, y - h / 2, w, h, 5); tctx.fill(); tctx.stroke();
      if (!small) {
        tctx.fillStyle = ink; tctx.font = "800 9px Nunito, sans-serif"; tctx.textAlign = "center"; tctx.textBaseline = "middle";
        tctx.fillText(`${n.ax === "x" ? "left of" : "below"} ${Math.round(n.t * 100)}?`, x, y - 2);
        tctx.fillStyle = ML.cssVar("--warn"); tctx.fillRect(x - 18, y + 6, 36 * Math.min(1, n.g / 0.67), 3);
        tctx.textBaseline = "alphabetic";
      }
      nodes(n.l); nodes(n.r);
    };
    nodes(T);
  }

  // hover → inside card
  function hoverInside() {
    const h = state.hover;
    if (!h) return;
    if (state.mode === "tree" && state.tree) {
      const steps = [];
      let n = state.tree;
      while (!n.leaf) {
        const v = n.ax === "x" ? h.x : h.y, yes = v < n.t;
        steps.push(`${n.ax === "x" ? "left of" : "below"} ${Math.round(n.t * 100)}? <b>${yes ? "yes" : "no"}</b>`);
        n = yes ? n.l : n.r;
      }
      const c = argmax(n.cnt);
      document.getElementById("inside").innerHTML = `<div class="mono">Spot (${Math.round(h.x * 100)}, ${Math.round(h.y * 100)})</div>` +
        (steps.length ? steps.map((s) => `<div class="sig"><span class="dot" style="background:var(--muted)"></span><span>${s}</span></div>`).join("") : "<div>No questions yet!</div>") +
        `<div class="sig"><span class="dot" style="background:var(${CV[c]})"></span><span>Box holds ${n.cnt.map((v, i) => v + " " + NAMES[i]).join(", ")} <span class="arrow">→</span> <span class="decision">${NAMES[c].toUpperCase()}</span></span></div>`;
    } else if (state.mode === "forest" && state.forest.length) {
      const votes = [0, 0, 0];
      forestEl.querySelectorAll(".ft").forEach((el, i) => {
        const c = argmax(probs(state.forest[i].T, h.x, h.y)); votes[c]++;
        el.style.borderColor = rgb(RGB[c]);
      });
      const c = argmax(votes);
      document.getElementById("inside").innerHTML = `<div class="mono">Spot (${Math.round(h.x * 100)}, ${Math.round(h.y * 100)})</div>` +
        votes.map((v, i) => `<div class="sig"><span class="dot" style="background:var(${CV[i]})"></span><span><b>${v}</b> tree${v === 1 ? "" : "s"} vote ${NAMES[i]}</span></div>`).join("") +
        `<div class="decision">Most votes → ${NAMES[c].toUpperCase()}</div>`;
    }
  }

  // ---------- interactions ----------
  cv.addEventListener("pointermove", (e) => {
    const p = ML.canvasPoint(cv, e, W, H);
    const [x, y] = toData(p.x, p.y);
    state.hover = x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
    hoverInside();
  });
  cv.addEventListener("pointerleave", () => { state.hover = null; forestEl.querySelectorAll(".ft").forEach((el) => (el.style.borderColor = "")); });
  cv.addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint(cv, e, W, H);
    const [x, y] = toData(p.x, p.y);
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    if (e.pointerType !== "mouse") { state.hover = { x, y }; hoverInside(); }
    if (state.tool === "erase") {
      const i = state.pts.findIndex((q) => Math.hypot(...toPx(q.x, q.y).map((v, k) => v - [p.x, p.y][k])) < 14);
      if (i < 0) return;
      state.pts.splice(i, 1);
    } else state.pts.push({ x, y, c: state.tool });
    resetModels();
    ML.say(state.mode === "tree" ? "New shapes! I chopped my tree down so I can grow a fresh one. Press <b>Ask one question</b>." : "New shapes! Plant the forest again to learn them.");
  });
  document.getElementById("tools").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.tool = b.dataset.tool === "erase" ? "erase" : +b.dataset.tool;
    document.querySelectorAll("#tools button").forEach((x) => x.classList.toggle("on", x === b));
  });
  document.getElementById("mode").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.mode = b.dataset.mode;
    stopGrow(); cps.unpick();
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll("[data-for-mode]").forEach((el) => el.classList.toggle("hidden", el.dataset.forMode !== state.mode));
    if (state.mode === "forest") {
      cps.setMilestones(FOREST_MS, (m) => `${m} tree${m > 1 ? "s" : ""}`);
      document.getElementById("cp-hint").textContent = "A photo of the forest's vote map after 1, 3, 5, 10, 25 trees. Tap one to look back.";
      ML.say("One tree can be fooled. What if lots of different trees <b>voted</b>? Press <b>Plant a forest</b>!");
    } else {
      cps.setMilestones(TREE_MS, (m) => (m === -1 ? "Fully grown" : `${m} question${m > 1 ? "s" : ""}`));
      document.getElementById("cp-hint").textContent = "A photo of the map after 1, 2, 4, 8… questions. Tap one to look back.";
      ML.say("Back to one tree. Press <b>Grow it all</b> to watch it grow question by question.");
    }
    mapDirty = true; setInsideIdle(); updateStats();
  });
  document.getElementById("grow1").addEventListener("click", () => { stopGrow(); cps.unpick(); grow1(); });
  growAllBtn.addEventListener("click", () => (state.growing ? stopGrow() : startGrow()));
  document.getElementById("chop").addEventListener("click", () => { resetModels(); ML.say("Timber! Tree chopped. Grow it again — maybe with a different depth?"); });
  document.getElementById("plant").addEventListener("click", plant);
  document.getElementById("t-test").addEventListener("click", (e) => { state.showTest = !state.showTest; e.currentTarget.classList.toggle("on", state.showTest); });
  let ready = false;
  ML.bindRange("#depth", (v) => v, (v) => {
    state.depth = v;
    if (!ready) return;
    resetModels();
    ML.say(v <= 2 ? `Only <b>${v}</b> question${v > 1 ? "s" : ""} in a row — a lazy tree that can't tell much apart.` : v >= 8 ? `<b>${v}</b> questions in a row — a super picky tree. Watch the test score when it's done!` : `Up to <b>${v}</b> questions in a row.`);
  });
  ML.bindRange("#ntrees", (v) => v, (v) => (state.ntrees = v));
  document.getElementById("p-blobs").addEventListener("click", () => loadPreset("blobs", "Three islands of shapes. A couple of questions should be enough!"));
  document.getElementById("p-checks").addEventListener("click", () => loadPreset("checks", "A checkerboard! Straight-line questions are perfect for squares — but it needs lots of them."));
  document.getElementById("p-messy").addEventListener("click", () => loadPreset("messy", "Messy, overlapping shapes. Set depth to <b>10</b> and grow it all — then compare with a forest!"));
  document.addEventListener("themechange", () => { readColors(); mapDirty = true; cps.redraw(); renderForestGrid(); updateStats(); });

  loadPreset("blobs");
  ready = true;
  requestAnimationFrame(frame);
})();
