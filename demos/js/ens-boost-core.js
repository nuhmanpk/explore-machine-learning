// AdaBoost core: decision stumps, re-weighted points, weighted vote. Pure logic.
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
  // a ring puzzle: class 1 is inside a circle. No single straight cut can solve it.
  function ring(seed, n, rad) {
    const r = rng(seed), X = [], y = [];
    for (let i = 0; i < n; i++) { const x = [r(), r()]; X.push(x); y.push(Math.hypot(x[0] - 0.5, x[1] - 0.5) < (rad || 0.33) ? 1 : 0); }
    return { X, y };
  }
  const sgn = (c) => (c ? 1 : -1);
  class AdaBoost {
    constructor(X, y, depth) { this.X = X; this.y = y; this.depth = depth || 1; this.n = X.length; this.reset(); }
    reset() { this.w = new Array(this.n).fill(1 / this.n); this.learners = []; this.lastWrong = []; }
    // one boosting round: fit a weak tree to the current weights, then boost the weight of its mistakes
    step() {
      const { X, y, w, n } = this;
      const tree = fitTree(X, y, w, this.depth, 1);
      let err = 0; const wrong = [];
      for (let i = 0; i < n; i++) { const bad = treeClass(tree, X[i]) !== y[i]; wrong.push(bad); if (bad) err += w[i]; }
      const e = Math.min(0.5 - 1e-4, Math.max(1e-4, err)), alpha = 0.5 * Math.log((1 - e) / e);
      let s = 0;
      for (let i = 0; i < n; i++) { w[i] *= Math.exp(wrong[i] ? alpha : -alpha); s += w[i]; }
      for (let i = 0; i < n; i++) w[i] /= s;
      const L = { tree, alpha, err, f: tree.l ? tree.f : -1, t: tree.t }; // f/t describe the first cut (the stump)
      this.learners.push(L); this.lastWrong = wrong; return L;
    }
    score(x, upTo) { let s = 0; const m = upTo == null ? this.learners.length : upTo; for (let k = 0; k < m; k++) s += this.learners[k].alpha * sgn(treeClass(this.learners[k].tree, x)); return s; }
    predict(x, upTo) { return this.score(x, upTo) > 0 ? 1 : 0; }
    // accuracy after each round on (Xs, ys)
    accCurve(Xs, ys) {
      const T = this.learners.length, ok = new Array(T + 1).fill(0), sc = Xs.map(() => 0);
      for (let k = 0; k <= T; k++) {
        if (k > 0) for (let j = 0; j < Xs.length; j++) sc[j] += this.learners[k - 1].alpha * sgn(treeClass(this.learners[k - 1].tree, Xs[j]));
        for (let j = 0; j < Xs.length; j++) if ((sc[j] > 0 ? 1 : 0) === ys[j]) ok[k]++;
      }
      return ok.map((v) => v / Xs.length);
    }
    maxWeightRatio() { return Math.max(...this.w) * this.n; }
  }
  const core = { rng, ring, fitTree, treeClass, AdaBoost };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.BoostCore = core;
})(typeof window !== "undefined" ? window : globalThis);
