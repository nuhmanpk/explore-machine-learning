// Same Size, Fair Fight core: people with age and income, feature scaling, k-nearest-neighbours,
// distance shares, and gradient descent at its largest stable step. Pure logic; Node and browser.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // A person likes the new gadget when age AND income both count: ageN + incN + noise > 1.
  // unit: 1 = income in dollars, 1000 = income in thousands of dollars.
  function makePeople(seed, n, unit) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const an = r(), inn = r(), age = 10 + an * 70, inc = 20000 + inn * 180000;
      const like = an + inn + (r() - 0.5) * 0.35 > 1 ? 1 : 0;
      out.push({ age, income: inc / (unit || 1), an, inn, like, spend: 50 * an + 50 * inn + (r() - 0.5) * 4 });
    }
    return out;
  }
  // mode: none | minmax | standard
  function fitScaler(mode, rows) {
    const keys = ["age", "income"], sc = { mode, p: {} };
    for (const k of keys) {
      const v = rows.map((d) => d[k]), mn = Math.min(...v), mx = Math.max(...v), m = v.reduce((s, a) => s + a, 0) / v.length;
      const sd = Math.sqrt(v.reduce((s, a) => s + (a - m) ** 2, 0) / v.length) || 1;
      sc.p[k] = mode === "minmax" ? { sub: mn, div: mx - mn || 1 } : mode === "standard" ? { sub: m, div: sd } : { sub: 0, div: 1 };
    }
    return sc;
  }
  const apply = (sc, d) => [(d.age - sc.p.age.sub) / sc.p.age.div, (d.income - sc.p.income.sub) / sc.p.income.div];

  function neighbours(sc, train, q, k) {
    const a = apply(sc, q);
    return train.map((d, i) => { const b = apply(sc, d); return { i, d2: (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2, dx: (a[0] - b[0]) ** 2, dy: (a[1] - b[1]) ** 2 }; })
      .sort((u, v) => u.d2 - v.d2 || u.i - v.i).slice(0, k);
  }
  function predict(sc, train, q, k) { const nb = neighbours(sc, train, q, k); return nb.reduce((s, x) => s + train[x.i].like, 0) * 2 > nb.length ? 1 : 0; }
  function accuracy(sc, train, test, k) { let ok = 0; for (const t of test) if (predict(sc, train, t, k) === t.like) ok++; return ok / test.length; }
  // How much of the total squared distance each feature supplies, over the neighbours found.
  function distanceShare(sc, nbs) {
    const dx = nbs.reduce((s, x) => s + x.dx, 0), dy = nbs.reduce((s, x) => s + x.dy, 0), t = dx + dy || 1;
    return { age: dx / t, income: dy / t };
  }
  // Fit spend = w1*f1 + w2*f2 + b by gradient descent at step = 1/lambda_max of the Hessian (the biggest stable step).
  // Returns normalised loss after each step (loss / loss at step 0).
  function gdCurve(sc, rows, steps) {
    const X = rows.map((d) => [...apply(sc, d), 1]), y = rows.map((d) => d.spend), n = X.length;
    const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const x of X) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H[i][j] += (2 / n) * x[i] * x[j];
    let v = [1, 1, 1], lam = 1;
    for (let it = 0; it < 80; it++) { const w = H.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]); lam = Math.hypot(...w) || 1; v = w.map((a) => a / lam); }
    const lr = 1 / lam, w = [0, 0, 0], loss = () => X.reduce((s, x, i) => s + (x[0] * w[0] + x[1] * w[1] + x[2] * w[2] - y[i]) ** 2, 0) / n;
    const l0 = loss(), out = [1];
    for (let s = 0; s < steps; s++) {
      const g = [0, 0, 0];
      X.forEach((x, i) => { const e = 2 * (x[0] * w[0] + x[1] * w[1] + x[2] * w[2] - y[i]) / n; g[0] += e * x[0]; g[1] += e * x[1]; g[2] += e * x[2]; });
      for (let j = 0; j < 3; j++) w[j] -= lr * g[j];
      out.push(loss() / l0);
    }
    return { curve: out, lr };
  }
  const core = { rng, makePeople, fitScaler, apply, neighbours, predict, accuracy, distanceShare, gdCurve };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.DataScaleCore = core;
})(typeof window !== "undefined" ? window : globalThis);
