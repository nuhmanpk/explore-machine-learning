// Gradient boosting core shared by ens-gbm, ens-xgb and ens-cat. Pure logic, works in Node.
// Trees are grown from gradients g and hessians h (second-order, like XGBoost):
//   leaf weight w = -G / (H + lambda),  split gain = ½[GL²/(HL+λ) + GR²/(HR+λ) − G²/(H+λ)] − gamma.
// With lambda = gamma = 0 and squared loss (h = 1) this is classic gradient boosting: each leaf is the mean residual.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const gaussFrom = (r) => () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  // ---- 1-D wavy regression data: ice-cream sales over a year ----
  const truth = (x) => 0.55 * Math.sin(2 * Math.PI * x) + 0.25 * Math.sin(6 * Math.PI * x) + 0.4 * x;
  function wave(seed, n, noise) {
    const r = rng(seed), g = gaussFrom(r), X = [], y = [];
    for (let i = 0; i < n; i++) { const x = r(); X.push([x]); y.push(truth(x) + (noise == null ? 0.12 : noise) * g()); }
    return { X, y };
  }

  // ---- second-order regression tree ----
  // opts: depth, lambda, gamma, minChild (min hessian sum per child)
  function grow(X, g, h, idx, depth, o, stats) {
    let G = 0, H = 0;
    for (const i of idx) { G += g[i]; H += h[i]; }
    const leaf = { w: -G / (H + o.lambda), n: idx.length };
    if (depth >= o.depth || idx.length < 2) { stats.leaves++; return leaf; }
    const base = (G * G) / (H + o.lambda);
    let best = null;
    const F = X[0].length;
    for (let f = 0; f < F; f++) {
      const s = idx.slice().sort((a, b) => X[a][f] - X[b][f]);
      let GL = 0, HL = 0;
      for (let k = 0; k < s.length - 1; k++) {
        GL += g[s[k]]; HL += h[s[k]];
        if (X[s[k]][f] === X[s[k + 1]][f]) continue;
        const GR = G - GL, HR = H - HL;
        if (HL < o.minChild || HR < o.minChild) continue;
        const raw = 0.5 * ((GL * GL) / (HL + o.lambda) + (GR * GR) / (HR + o.lambda) - base);
        if (!best || raw > best.raw) best = { raw, f, t: (X[s[k]][f] + X[s[k + 1]][f]) / 2 };
      }
    }
    if (!best) { stats.leaves++; return leaf; }
    if (best.raw - o.gamma <= 0) { stats.leaves++; stats.pruned++; return leaf; } // gamma: a split must earn its keep
    const L = [], R = [];
    for (const i of idx) (X[i][best.f] <= best.t ? L : R).push(i);
    return { f: best.f, t: best.t, gain: best.raw, l: grow(X, g, h, L, depth + 1, o, stats), r: grow(X, g, h, R, depth + 1, o, stats) };
  }
  function treeOut(node, x) { while (node.l) node = x[node.f] <= node.t ? node.l : node.r; return node.w; }
  function treeLeaves(node, out) { out = out || []; if (node.l) { treeLeaves(node.l, out); treeLeaves(node.r, out); } else out.push(node); return out; }

  // ---- the booster ----
  // opts: loss 'sq' | 'log', lr, depth, lambda, gamma, minChild
  class Booster {
    constructor(X, y, opts) {
      this.X = X; this.y = y; this.n = X.length;
      this.o = Object.assign({ loss: "sq", lr: 0.3, depth: 1, lambda: 0, gamma: 0, minChild: 1 }, opts || {});
      this.reset();
    }
    reset() {
      const m = this.y.reduce((a, b) => a + b, 0) / this.n;
      this.base = this.o.loss === "log" ? Math.log(Math.max(1e-6, m) / Math.max(1e-6, 1 - m)) : m;
      this.F = new Array(this.n).fill(this.base); this.trees = []; this.lastLeaves = 0; this.lastPruned = 0;
    }
    grads() {
      const g = [], h = [];
      for (let i = 0; i < this.n; i++) {
        if (this.o.loss === "log") { const p = sigmoid(this.F[i]); g.push(p - this.y[i]); h.push(Math.max(1e-6, p * (1 - p))); }
        else { g.push(this.F[i] - this.y[i]); h.push(1); }
      }
      return { g, h };
    }
    // residuals = what is still left to learn (negative gradient)
    residuals() { const { g } = this.grads(); return g.map((v) => -v); }
    step() {
      const { g, h } = this.grads(), idx = [], stats = { leaves: 0, pruned: 0 };
      for (let i = 0; i < this.n; i++) idx.push(i);
      const tree = grow(this.X, g, h, idx, 0, this.o, stats);
      for (let i = 0; i < this.n; i++) this.F[i] += this.o.lr * treeOut(tree, this.X[i]);
      this.trees.push(tree); this.lastLeaves = stats.leaves; this.lastPruned = stats.pruned;
      return tree;
    }
    raw(x, upTo) { let s = this.base; const m = upTo == null ? this.trees.length : upTo; for (let k = 0; k < m; k++) s += this.o.lr * treeOut(this.trees[k], x); return s; }
    predict(x, upTo) { const z = this.raw(x, upTo); return this.o.loss === "log" ? sigmoid(z) : z; }
    totalLeaves() { return this.trees.reduce((s, t) => s + treeLeaves(t).length, 0); }
    // metric after each round: RMSE for 'sq', accuracy for 'log'
    curve(Xs, ys) {
      const T = this.trees.length, sc = Xs.map(() => this.base), out = [];
      for (let k = 0; k <= T; k++) {
        if (k > 0) for (let j = 0; j < Xs.length; j++) sc[j] += this.o.lr * treeOut(this.trees[k - 1], Xs[j]);
        out.push(metric(this.o.loss, sc, ys));
      }
      return out;
    }
  }
  function metric(loss, scores, ys) {
    if (loss === "log") { let ok = 0; for (let j = 0; j < ys.length; j++) if ((scores[j] > 0 ? 1 : 0) === ys[j]) ok++; return ok / ys.length; }
    let s = 0; for (let j = 0; j < ys.length; j++) s += (scores[j] - ys[j]) ** 2; return Math.sqrt(s / ys.length);
  }

  // ---- CatBoost-style categorical data and target encodings ----
  // Snacks: 40 snack names, a few appear often, most rarely. Whether a kid likes it depends on sweetness,
  // plus a real taste bonus for only 6 of the snacks. Every other snack name is just noise.
  const SNACKS = ["Apple", "Banana", "Cookie", "Carrot", "Grapes", "Popcorn", "Pretzel", "Yoghurt", "Cheese", "Crackers",
    "Mango", "Muffin", "Olive", "Pickle", "Rice cake", "Raisins", "Waffle", "Toast", "Celery", "Melon",
    "Plum", "Kiwi", "Peach", "Cereal", "Granola", "Nuts", "Dates", "Figs", "Bagel", "Pear",
    "Cherry", "Berry mix", "Corn", "Peas", "Lychee", "Papaya", "Taco", "Wrap", "Bun", "Jelly"];
  const BONUS = { Cookie: 1.6, Waffle: 1.4, Muffin: 1.2, Celery: -1.6, Olive: -1.4, Pickle: -1.2 };
  function snacks(seed, n) {
    const r = rng(seed), cat = [], sweet = [], y = [];
    for (let i = 0; i < n; i++) {
      // skewed popularity: low indexes are common
      const c = Math.min(SNACKS.length - 1, Math.floor(SNACKS.length * Math.pow(r(), 1.3)));
      const s = r(), name = SNACKS[c];
      const z = 6 * (s - 0.5) + (BONUS[name] || 0);
      cat.push(c); sweet.push(s); y.push(r() < sigmoid(z) ? 1 : 0);
    }
    return { cat, sweet, y };
  }
  // Naive target encoding: each row sees the average label of its whole category, INCLUDING itself (leaks!).
  function encodeNaive(cat, y, prior, a) {
    const sum = {}, cnt = {};
    for (let i = 0; i < cat.length; i++) { sum[cat[i]] = (sum[cat[i]] || 0) + y[i]; cnt[cat[i]] = (cnt[cat[i]] || 0) + 1; }
    return cat.map((c) => (sum[c] + a * prior) / (cnt[c] + a));
  }
  // Ordered target statistics (CatBoost): walk the rows in a random order; each row only sees labels of rows BEFORE it.
  function encodeOrdered(cat, y, prior, a, seed) {
    const r = rng(seed), order = cat.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const sum = {}, cnt = {}, out = new Array(cat.length);
    for (const i of order) { const c = cat[i]; out[i] = ((sum[c] || 0) + a * prior) / ((cnt[c] || 0) + a); sum[c] = (sum[c] || 0) + y[i]; cnt[c] = (cnt[c] || 0) + 1; }
    return out;
  }
  // Encoding for unseen (test) rows: all training labels, nothing leaks because the test label is not in it.
  function encodeTest(trainCat, trainY, testCat, prior, a) {
    const sum = {}, cnt = {};
    for (let i = 0; i < trainCat.length; i++) { sum[trainCat[i]] = (sum[trainCat[i]] || 0) + trainY[i]; cnt[trainCat[i]] = (cnt[trainCat[i]] || 0) + 1; }
    return testCat.map((c) => ((sum[c] || 0) + a * prior) / ((cnt[c] || 0) + a));
  }

  const core = { rng, sigmoid, truth, wave, grow, treeOut, treeLeaves, Booster, metric, SNACKS, BONUS, snacks, encodeNaive, encodeOrdered, encodeTest };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GBCore = core;
})(typeof window !== "undefined" ? window : globalThis);
