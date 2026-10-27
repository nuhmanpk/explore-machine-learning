// Pick the Clues core: 2D puzzles that a straight line cannot solve, candidate features (some useful, some junk),
// and logistic regression trained by gradient descent on the chosen features. Pure logic; Node and browser.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const PROBLEMS = {
    ring: { name: "Bullseye", hint: "Inside the ring or outside?", rule: (x, y) => (Math.hypot(x, y) < 0.75 ? 1 : 0) },
    corners: { name: "Corners", hint: "Do x and y have the same sign?", rule: (x, y) => (x * y > 0 ? 1 : 0) }
  };
  // Every feature is a function of the point (x, y, and four junk numbers that carry no information).
  const FEATURES = [
    { id: "x", name: "x (across)", f: (p) => p.x },
    { id: "y", name: "y (up)", f: (p) => p.y },
    { id: "xy", name: "x times y", f: (p) => p.x * p.y },
    { id: "x2", name: "x squared", f: (p) => p.x * p.x },
    { id: "y2", name: "y squared", f: (p) => p.y * p.y },
    { id: "r", name: "distance from centre", f: (p) => Math.hypot(p.x, p.y) },
    { id: "j1", name: "junk 1 (random)", f: (p) => p.j[0], junk: true },
    { id: "j2", name: "junk 2 (random)", f: (p) => p.j[1], junk: true },
    { id: "j3", name: "junk 3 (random)", f: (p) => p.j[2], junk: true },
    { id: "j4", name: "junk 4 (random)", f: (p) => p.j[3], junk: true }
  ];
  const ids = FEATURES.map((f) => f.id);

  function makePoints(seed, problem, n, noise) {
    const r = rng(seed), rule = PROBLEMS[problem].rule, out = [];
    for (let i = 0; i < n; i++) {
      const x = r() * 2 - 1, y = r() * 2 - 1; let label = rule(x, y);
      if (r() < (noise == null ? 0.03 : noise)) label = 1 - label;
      out.push({ x, y, j: [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], label });
    }
    return out;
  }
  const featOf = (id) => FEATURES.find((f) => f.id === id);

  // Train logistic regression on the chosen feature ids. Features are standardised using training data.
  function train(points, chosen, opts) {
    opts = opts || {};
    const fs = chosen.map(featOf), d = fs.length, n = points.length;
    const mu = fs.map((f) => points.reduce((s, p) => s + f.f(p), 0) / n);
    const sd = fs.map((f, j) => Math.sqrt(points.reduce((s, p) => s + (f.f(p) - mu[j]) ** 2, 0) / n) || 1);
    const Z = points.map((p) => fs.map((f, j) => (f.f(p) - mu[j]) / sd[j])), y = points.map((p) => p.label);
    const w = new Array(d).fill(0); let b = 0;
    const lr = 0.5, lam = opts.l2 == null ? 0.001 : opts.l2, iters = opts.iters || 700;
    for (let it = 0; it < iters; it++) {
      const g = new Array(d).fill(0); let gb = 0;
      for (let i = 0; i < n; i++) {
        let z = b; for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
        const e = 1 / (1 + Math.exp(-z)) - y[i];
        for (let j = 0; j < d; j++) g[j] += e * Z[i][j]; gb += e;
      }
      for (let j = 0; j < d; j++) w[j] -= lr * (g[j] / n + lam * w[j]); b -= lr * gb / n;
    }
    const model = { chosen, mu, sd, w, b };
    model.prob = (p) => { if (!d) return 0.5; let z = b; fs.forEach((f, j) => { z += w[j] * (f.f(p) - mu[j]) / sd[j]; }); return 1 / (1 + Math.exp(-z)); };
    return model;
  }
  function accuracy(model, pts) { let ok = 0; for (const p of pts) if ((model.prob(p) > 0.5 ? 1 : 0) === p.label) ok++; return pts.length ? ok / pts.length : 0; }
  // Importance: share of total |weight| on standardised features, so sizes are comparable.
  function importance(model) {
    const t = model.w.reduce((s, v) => s + Math.abs(v), 0) || 1;
    return model.chosen.map((id, j) => ({ id, share: Math.abs(model.w[j]) / t, w: model.w[j] }));
  }
  // Grid of probabilities over [-1,1]^2 for painting decision regions. Junk features are fixed at 0.
  function grid(model, m) {
    const out = [];
    for (let j = 0; j < m; j++) { const row = []; for (let i = 0; i < m; i++) row.push(model.prob({ x: ((i + 0.5) / m) * 2 - 1, y: 1 - ((j + 0.5) / m) * 2, j: [0, 0, 0, 0] })); out.push(row); }
    return out;
  }
  const core = { rng, PROBLEMS, FEATURES, ids, makePoints, train, accuracy, importance, grid };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.DataFeaturesCore = core;
})(typeof window !== "undefined" ? window : globalThis);
