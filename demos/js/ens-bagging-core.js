// Bagging core: bootstrap samples, small decision trees, majority vote, out-of-bag accuracy. Pure logic.
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
  const MAXT = 60;
  function singleTree(d, depth) { return fitTree(d.X, d.y, d.y.map(() => 1), depth, 1); }
  // train T trees, each on its own bootstrap sample (draw n rows with replacement)
  function bag(d, T, depth, seed) {
    const r = rng(seed), n = d.X.length, trees = [];
    for (let k = 0; k < T; k++) {
      const w = new Array(n).fill(0);
      for (let i = 0; i < n; i++) w[Math.floor(r() * n)]++;
      trees.push({ tree: fitTree(d.X, d.y, w, depth, 1), counts: w });
    }
    return trees;
  }
  // majority vote of the first k trees at point x. returns {yes, k}
  function vote(trees, k, x) { let yes = 0; for (let i = 0; i < k; i++) yes += treeClass(trees[i].tree, x); return yes; }
  const decide = (yes, k, avgP) => (yes * 2 > k ? 1 : yes * 2 < k ? 0 : avgP > 0.5 ? 1 : 0);
  // accuracy of the vote of first k trees, for k = 1..T, on points (X, y)
  function accCurve(trees, X, y) {
    const T = trees.length, ok = new Array(T).fill(0);
    for (let j = 0; j < X.length; j++) {
      let yes = 0, p = 0;
      for (let k = 1; k <= T; k++) { const t = trees[k - 1].tree; yes += treeClass(t, X[j]); p += treeP(t, X[j]); if (decide(yes, k, p / k) === y[j]) ok[k - 1]++; }
    }
    return ok.map((v) => v / X.length);
  }
  // out-of-bag accuracy: each training row is judged only by trees that never saw it
  function oobCurve(trees, d) {
    const T = trees.length, n = d.X.length, ok = new Array(T).fill(0), seen = new Array(T).fill(0);
    for (let j = 0; j < n; j++) {
      let yes = 0, m = 0, p = 0;
      for (let k = 1; k <= T; k++) {
        if (trees[k - 1].counts[j] === 0) { yes += treeClass(trees[k - 1].tree, d.X[j]); p += treeP(trees[k - 1].tree, d.X[j]); m++; }
        if (m) { seen[k - 1]++; if (decide(yes, m, p / m) === d.y[j]) ok[k - 1]++; }
      }
    }
    return ok.map((v, i) => (seen[i] ? v / seen[i] : 0));
  }
  const accOf = (fn, X, y) => { let c = 0; for (let i = 0; i < X.length; i++) if (fn(X[i]) === y[i]) c++; return c / X.length; };
  // fraction voting class 1 on a res x res grid (row-major, y goes up)
  function grid(predictYes, res) {
    const g = new Array(res * res);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) g[j * res + i] = predictYes([(i + 0.5) / res, (j + 0.5) / res]);
    return g;
  }
  const core = { rng, moons, fitTree, treeClass, treeP, singleTree, bag, vote, accCurve, oobCurve, accOf, grid, MAXT };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.BaggingCore = core;
})(typeof window !== "undefined" ? window : globalThis);
