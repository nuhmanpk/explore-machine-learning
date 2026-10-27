// Bagging vs boosting core: the same noisy data, a single tree, a bagged forest and AdaBoost. Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // ---- tiny decision tree (CART, weighted gini). y is 0/1, w are sample weights, idx lists rows used ----
  function gini(w0, w1) { const t = w0 + w1; return t > 0 ? 1 - (w0 * w0 + w1 * w1) / (t * t) : 0; }
  function buildTree(X, y, w, idx, depth, maxDepth, minLeaf) {
    let w0 = 0, w1 = 0;
    for (const i of idx) { if (y[i]) w1 += w[i]; else w0 += w[i]; }
    const leaf = { p: w0 + w1 > 0 ? w1 / (w0 + w1) : 0.5 };
    if (depth >= maxDepth || w0 <= 1e-12 || w1 <= 1e-12 || idx.length < 2 * minLeaf) return leaf;
    const parent = gini(w0, w1) * (w0 + w1);
    let best = null;
    for (let f = 0; f < 2; f++) {
      const s = idx.slice().sort((a, b) => X[a][f] - X[b][f]);
      let l0 = 0, l1 = 0;
      for (let k = 0; k < s.length - 1; k++) {
        const i = s[k];
        if (y[i]) l1 += w[i]; else l0 += w[i];
        if (X[s[k]][f] === X[s[k + 1]][f]) continue;
        if (k + 1 < minLeaf || s.length - k - 1 < minLeaf) continue;
        const r0 = w0 - l0, r1 = w1 - l1, imp = gini(l0, l1) * (l0 + l1) + gini(r0, r1) * (r0 + r1);
        if (!best || imp < best.imp - 1e-12) best = { imp, f, t: (X[s[k]][f] + X[s[k + 1]][f]) / 2 };
      }
    }
    if (!best || best.imp >= parent - 1e-12) return leaf;
    const L = [], R = [];
    for (const i of idx) (X[i][best.f] <= best.t ? L : R).push(i);
    return { f: best.f, t: best.t, l: buildTree(X, y, w, L, depth + 1, maxDepth, minLeaf), r: buildTree(X, y, w, R, depth + 1, maxDepth, minLeaf) };
  }
  function treeP(node, x) { while (node.l) node = x[node.f] <= node.t ? node.l : node.r; return node.p; }
  const treeClass = (node, x) => (treeP(node, x) > 0.5 ? 1 : 0);
  function fitTree(X, y, w, maxDepth, minLeaf) {
    const idx = []; for (let i = 0; i < X.length; i++) if (w[i] > 0) idx.push(i);
    return buildTree(X, y, w, idx, 0, maxDepth, minLeaf || 1);
  }
  // two interleaving half-moons in the unit square. noise = fraction of labels flipped. truth keeps the real class.
  function moons(seed, n, noise) {
    const r = rng(seed), X = [], y = [], truth = [];
    const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    for (let i = 0; i < n; i++) {
      const c = i % 2, t = Math.PI * r();
      const px = (c ? 1 - Math.cos(t) : Math.cos(t)) + 0.2 * gauss(), py = (c ? 0.5 - Math.sin(t) : Math.sin(t)) + 0.2 * gauss();
      X.push([Math.min(1, Math.max(0, (px + 1.5) / 4)), Math.min(1, Math.max(0, (py + 1.2) / 2.9))]);
      truth.push(c); y.push(r() < noise ? 1 - c : c);
    }
    return { X, y, truth };
  }
  const sgn = (c) => (c ? 1 : -1);
  // run everything for `rounds` rounds and return held-out accuracy (against the TRUE classes) after each round
  function race(seed, noise, rounds, opts) {
    opts = opts || {};
    const nTrain = opts.nTrain || 150, bagDepth = opts.bagDepth || 8, boostDepth = opts.boostDepth || 3;
    const tr = moons(seed, nTrain, noise), te = moons(seed + 7919, 500, 0);
    const n = nTrain, r = rng(seed + 31);
    const single = fitTree(tr.X, tr.y, tr.y.map(() => 1), bagDepth, 1);
    const acc = (fn) => { let c = 0; for (let i = 0; i < te.X.length; i++) if (fn(te.X[i]) === te.truth[i]) c++; return c / te.X.length; };
    const singleAcc = acc((x) => treeClass(single, x));
    // bagging
    const bagYes = te.X.map(() => 0), bagTr = tr.X.map(() => 0), bag = [], trees = [];
    for (let k = 1; k <= rounds; k++) {
      const w = new Array(n).fill(0); for (let i = 0; i < n; i++) w[Math.floor(r() * n)]++;
      const t = fitTree(tr.X, tr.y, w, bagDepth, 1); trees.push(t);
      let ok = 0; for (let j = 0; j < te.X.length; j++) { bagYes[j] += treeClass(t, te.X[j]); if ((bagYes[j] * 2 > k ? 1 : 0) === te.truth[j]) ok++; }
      bag.push(ok / te.X.length);
    }
    // boosting
    const w = new Array(n).fill(1 / n), sc = te.X.map(() => 0), str = tr.X.map(() => 0), boost = [], boostTrain = [], learners = [];
    for (let k = 1; k <= rounds; k++) {
      const t = fitTree(tr.X, tr.y, w, boostDepth, 1), wrong = []; let err = 0;
      for (let i = 0; i < n; i++) { const b = treeClass(t, tr.X[i]) !== tr.y[i]; wrong.push(b); if (b) err += w[i]; }
      const e = Math.min(0.5 - 1e-4, Math.max(1e-4, err)), a = 0.5 * Math.log((1 - e) / e);
      let s = 0; for (let i = 0; i < n; i++) { w[i] *= Math.exp(wrong[i] ? a : -a); s += w[i]; } for (let i = 0; i < n; i++) w[i] /= s;
      let ok = 0, okt = 0;
      for (let j = 0; j < te.X.length; j++) { sc[j] += a * sgn(treeClass(t, te.X[j])); if ((sc[j] > 0 ? 1 : 0) === te.truth[j]) ok++; }
      for (let j = 0; j < n; j++) { str[j] += a * sgn(treeClass(t, tr.X[j])); if ((str[j] > 0 ? 1 : 0) === tr.y[j]) okt++; }
      boost.push(ok / te.X.length); boostTrain.push(okt / n); learners.push({ t, a });
    }
    return { tr, te, singleAcc, bag, boost, boostTrain, noise, rounds, single, trees, learners, weights: w.slice() };
  }
  const core = { rng, moons, fitTree, treeClass, race };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.CompareCore = core;
})(typeof window !== "undefined" ? window : globalThis);
