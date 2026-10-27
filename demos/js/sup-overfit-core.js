// Memoriser vs Learner core: polynomial regression (Chebyshev basis), overfitting vs underfitting. Pure logic.
// Runs in Node and the browser.
(function (root) {
  const MAXD = 12;
  // Chebyshev basis on x in [-1,1]: same curves as a polynomial, but numerically calm.
  function basis(x, d) {
    const t = [1, x];
    for (let k = 2; k <= d; k++) t[k] = 2 * x * t[k - 1] - t[k - 2];
    return t.slice(0, d + 1);
  }
  function solve(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
      x[i] = s / A[i][i];
    }
    return x;
  }
  // Least squares via normal equations with a tiny ridge. pts: [{x,y}]
  function fit(pts, d, ridge = 1e-6) {
    const m = d + 1;
    const A = Array.from({ length: m }, () => new Array(m).fill(0)), b = new Array(m).fill(0);
    for (const p of pts) {
      const t = basis(p.x, d);
      for (let i = 0; i < m; i++) { b[i] += t[i] * p.y; for (let j = 0; j < m; j++) A[i][j] += t[i] * t[j]; }
    }
    for (let i = 0; i < m; i++) A[i][i] += ridge;
    return solve(A, b);
  }
  const predict = (co, x) => { const t = basis(x, co.length - 1); let s = 0; for (let i = 0; i < t.length; i++) s += co[i] * t[i]; return s; };
  const rmse = (co, pts) => (pts.length ? Math.sqrt(pts.reduce((s, p) => s + (predict(co, p.x) - p.y) ** 2, 0) / pts.length) : 0);
  const truth = (x) => 0.8 * Math.sin(2.6 * x);
  function errorsByDegree(train, test, maxd = MAXD) {
    const out = [];
    for (let d = 1; d <= maxd; d++) { const co = fit(train, d); out.push({ d, train: rmse(co, train), test: rmse(co, test) }); }
    return out;
  }
  function bestDegree(errs) { return errs.reduce((b, e) => (e.test < b.test - 1e-12 ? e : b), errs[0]).d; }
  const core = { MAXD, basis, fit, predict, rmse, truth, errorsByDegree, bestDegree };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.OverfitCore = core;
})(typeof window !== "undefined" ? window : globalThis);
