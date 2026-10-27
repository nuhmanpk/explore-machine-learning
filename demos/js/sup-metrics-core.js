// Right or Wrong? Pure logic (browser + Node): villagers, confusion matrix, metrics, logistic regression.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Two clues per villager. Noise is fixed per villager; prevalence only changes who is rare.
  function makeData(seed = 7, n = 1000, mu = 1.1) {
    const r = rng(seed), gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const base = [], order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const rank = new Array(n); order.forEach((v, k) => (rank[v] = k));
    for (let i = 0; i < n; i++) base.push([gauss(), gauss()]);
    return { n, mu, base, rank };
  }
  // Labels for a given count of rare villagers; clue score = f1 + f2.
  function realise(d, rareCount) {
    const y = [], f = [], s = [];
    for (let i = 0; i < d.n; i++) {
      const rare = d.rank[i] < rareCount ? 1 : 0, sh = rare ? d.mu : 0;
      const a = d.base[i][0] + sh, b = d.base[i][1] + sh;
      y.push(rare); f.push([a, b]); s.push(a + b);
    }
    return { y, f, s, rare: rareCount, n: d.n };
  }
  function counts(pred, y) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 0; i < y.length; i++) { if (pred[i]) y[i] ? tp++ : fp++; else y[i] ? fn++ : tn++; }
    return { tp, fp, fn, tn };
  }
  const atThreshold = (s, y, t) => counts(s.map((v) => v >= t), y);
  function metrics(c) {
    const n = c.tp + c.fp + c.fn + c.tn;
    const acc = n ? (c.tp + c.tn) / n : 0;
    const prec = c.tp + c.fp ? c.tp / (c.tp + c.fp) : null;
    const rec = c.tp + c.fn ? c.tp / (c.tp + c.fn) : null;
    const f1 = prec !== null && rec !== null && prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
    return { acc, prec, rec, f1 };
  }
  const cost = (c, costFN, costFP) => c.fn * costFN + c.fp * costFP;
  function bestThreshold(s, y, costFN, costFP, lo = -3, hi = 6, step = 0.1) {
    let best = lo, bc = Infinity;
    for (let t = lo; t <= hi + 1e-9; t += step) { const tt = Math.round(t * 10) / 10, k = cost(atThreshold(s, y, tt), costFN, costFP); if (k < bc - 1e-9) { bc = k; best = tt; } }
    return { t: best, cost: bc };
  }
  // Logistic regression, full-batch gradient descent, class weight on the rare class.
  function newLearner(data, cw = 1) {
    const n = data.n, m = [0, 0], sd = [0, 0];
    for (let k = 0; k < 2; k++) { for (const f of data.f) m[k] += f[k] / n; for (const f of data.f) sd[k] += (f[k] - m[k]) ** 2 / n; sd[k] = Math.sqrt(sd[k]) || 1; }
    return { w: [0, 0], b: 0, m, sd, cw, ep: 0, lr: 0.8, data };
  }
  const sigm = (z) => 1 / (1 + Math.exp(-z));
  function prob(L, f) { return sigm(L.w[0] * ((f[0] - L.m[0]) / L.sd[0]) + L.w[1] * ((f[1] - L.m[1]) / L.sd[1]) + L.b); }
  function step(L) {
    const { f, y } = L.data; let g0 = 0, g1 = 0, gb = 0, sw = 0, loss = 0;
    for (let i = 0; i < f.length; i++) {
      const x0 = (f[i][0] - L.m[0]) / L.sd[0], x1 = (f[i][1] - L.m[1]) / L.sd[1], p = sigm(L.w[0] * x0 + L.w[1] * x1 + L.b), wt = y[i] ? L.cw : 1;
      const e = (p - y[i]) * wt; g0 += e * x0; g1 += e * x1; gb += e; sw += wt;
      loss -= wt * (y[i] ? Math.log(p + 1e-12) : Math.log(1 - p + 1e-12));
    }
    L.w[0] -= (L.lr * g0) / sw; L.w[1] -= (L.lr * g1) / sw; L.b -= (L.lr * gb) / sw; L.ep++;
    return loss / sw;
  }
  function evaluate(L, thr = 0.5) {
    const { f, y } = L.data, c = counts(f.map((v) => prob(L, v) >= thr), y);
    return { c, m: metrics(c) };
  }
  const core = { rng, makeData, realise, counts, atThreshold, metrics, cost, bestThreshold, newLearner, step, prob, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.MetricsCore = core;
})(typeof window !== "undefined" ? window : globalThis);
