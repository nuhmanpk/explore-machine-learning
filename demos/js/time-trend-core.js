// Smooth the Wiggles core: noisy sales series, moving averages (trailing / centered), least-squares trend line.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u < 1e-9) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const variance = (a) => { const m = mean(a); return mean(a.map((x) => (x - m) * (x - m))); };
  // Hidden truth: gentle growth + slow wave + a heat-wave jump. Observed = truth + noise.
  function makeSeries(seed, n) {
    n = n || 120; const r = rng(seed), truth = [], y = [];
    const jumpAt = Math.round(n * 0.6);
    for (let t = 0; t < n; t++) {
      const tr = 30 + 0.25 * t + 5 * Math.sin((2 * Math.PI * t) / 45) + 14 / (1 + Math.exp(-(t - jumpAt) / 1.5));
      truth.push(tr); y.push(Math.max(0, tr + 7 * gauss(r)));
    }
    return { y, truth, jumpAt };
  }
  // trailing: average of the last w points (what you can compute live). centered: w points around i (needs the future).
  function movingAvg(y, w, mode) {
    w = Math.max(1, Math.round(w)); const out = [];
    for (let i = 0; i < y.length; i++) {
      let lo, hi;
      if (mode === "centered") { const h = Math.floor(w / 2); lo = Math.max(0, i - h); hi = Math.min(y.length - 1, i + (w - 1 - h)); }
      else { lo = Math.max(0, i - w + 1); hi = i; }
      let s = 0; for (let j = lo; j <= hi; j++) s += y[j];
      out.push(s / (hi - lo + 1));
    }
    return out;
  }
  function rmse(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / a.length); }
  function linFit(y) {
    const n = y.length, mx = (n - 1) / 2, my = mean(y); let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (i - mx) * (y[i] - my); sxx += (i - mx) ** 2; }
    const slope = sxy / sxx; return { slope, intercept: my - slope * mx, line: y.map((_, i) => my + slope * (i - mx)) };
  }
  // how many steps behind the truth is the smoothed line? (shift that matches best)
  function lagOf(avg, truth, maxLag) {
    let best = 0, bestE = Infinity; maxLag = maxLag || 25;
    for (let s = 0; s <= maxLag; s++) { let e = 0, c = 0; for (let i = maxLag; i < avg.length; i++) { e += (avg[i] - truth[i - s]) ** 2; c++; } e /= c; if (e < bestE) { bestE = e; best = s; } }
    return best;
  }
  // wiggle = typical step-to-step jump of a line
  function wiggle(a) { const d = []; for (let i = 1; i < a.length; i++) d.push(a[i] - a[i - 1]); return Math.sqrt(mean(d.map((x) => x * x))); }
  function bestWindow(y, truth, mode, maxW) {
    let bw = 1, be = Infinity; for (let w = 1; w <= (maxW || 41); w++) { const e = rmse(movingAvg(y, w, mode), truth); if (e < be) { be = e; bw = w; } }
    return { w: bw, err: be };
  }
  const core = { rng, makeSeries, movingAvg, rmse, linFit, lagOf, wiggle, bestWindow };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.TrendCore = core;
})(typeof window !== "undefined" ? window : globalThis);
