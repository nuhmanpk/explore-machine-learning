// Predict Tomorrow core: real least-squares autoregression AR(k) + naive baselines + rolling-origin backtest.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u < 1e-9) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const variance = (a) => { const m = mean(a); return mean(a.map((x) => (x - m) * (x - m))); };
  const SHAPE = [-6, -4, -3, 0, 4, 9, 0];
  function makeSeries(seed, n) {
    n = n || 196; const r = rng(seed), y = []; let e = 0, lv = 0; const sm = mean(SHAPE);
    for (let t = 0; t < n; t++) { e = 0.5 * e + 1.8 * gauss(r); lv += 0.3 * gauss(r); y.push(50 + 0.05 * t + lv + SHAPE[t % 7] - sm + e); }
    return y;
  }
  // solve A x = b (Gaussian elimination, partial pivoting)
  function solve(A, b) {
    const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }
  // y[t] ~ c + a1*y[t-1] + ... + ak*y[t-k], fitted by least squares (normal equations, tiny ridge for stability)
  function fitAR(y, k) {
    const rows = [], tg = [];
    for (let t = k; t < y.length; t++) { const row = [1]; for (let j = 1; j <= k; j++) row.push(y[t - j]); rows.push(row); tg.push(y[t]); }
    const d = k + 1, A = [], b = new Array(d).fill(0);
    for (let i = 0; i < d; i++) A.push(new Array(d).fill(0));
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < d; i++) { b[i] += rows[r][i] * tg[r]; for (let j = 0; j < d; j++) A[i][j] += rows[r][i] * rows[r][j]; }
    for (let i = 1; i < d; i++) A[i][i] += 1e-3 * rows.length;
    return { k, coef: solve(A, b) };
  }
  // recursive multi-step forecast: each prediction becomes input for the next
  function forecastAR(model, hist, H) {
    const h = hist.slice(), out = [];
    for (let s = 0; s < H; s++) { let v = model.coef[0]; for (let j = 1; j <= model.k; j++) v += model.coef[j] * h[h.length - j]; out.push(v); h.push(v); }
    return out;
  }
  const naive = (hist, H) => new Array(H).fill(hist[hist.length - 1]);
  const seasonalNaive = (hist, H, m) => { m = m || 7; const o = []; for (let i = 0; i < H; i++) o.push(hist[hist.length - m + (i % m)]); return o; };
  // Fit on y[0..trainN-1] only. For every origin o in the hidden part, forecast o+1..o+H from y[0..o]; mean abs error per horizon.
  function backtest(y, trainN, k, H) {
    const model = fitAR(y.slice(0, trainN), k), E = { ar: new Array(H).fill(0), naive: new Array(H).fill(0), snaive: new Array(H).fill(0) }; let cnt = 0;
    for (let o = trainN - 1; o + H < y.length; o++) {
      const hist = y.slice(0, o + 1), a = forecastAR(model, hist, H), nv = naive(hist, H), sn = seasonalNaive(hist, H, 7);
      for (let h = 0; h < H; h++) { const t = y[o + 1 + h]; E.ar[h] += Math.abs(a[h] - t); E.naive[h] += Math.abs(nv[h] - t); E.snaive[h] += Math.abs(sn[h] - t); }
      cnt++;
    }
    for (const key in E) E[key] = E[key].map((v) => v / cnt);
    return { model, err: E, origins: cnt };
  }
  const core = { rng, makeSeries, solve, fitAR, forecastAR, naive, seasonalNaive, backtest };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.ForecastCore = core;
})(typeof window !== "undefined" ? window : globalThis);
