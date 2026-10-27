// Spot the Seasons core: trend + repeating season + noise, and a classical decomposition (average-by-phase, STL-ish).
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u < 1e-9) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const variance = (a) => { const m = mean(a); return mean(a.map((x) => (x - m) * (x - m))); };
  const MODES = {
    week: { name: "Daily sales", unit: "day", period: 7, n: 154, labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], shape: [-7, -5, -4, 0, 5, 12, -1], base: 40, slope: 0.15, noise: 3 },
    year: { name: "Monthly sales", unit: "month", period: 12, n: 84, labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], shape: [-14, -12, -8, -3, 4, 10, 15, 13, 6, -2, -8, -9], base: 50, slope: 0.4, noise: 3 },
  };
  function makeSeries(seed, modeKey) {
    const M = MODES[modeKey], r = rng(seed), p = M.period, sm = mean(M.shape), y = [], trend = [], season = [];
    for (let t = 0; t < M.n; t++) {
      const tr = M.base + M.slope * t, se = M.shape[t % p] - sm;
      trend.push(tr); season.push(se); y.push(tr + se + M.noise * gauss(r));
    }
    return { y, trend, season, mode: M };
  }
  // trend = centered moving average one season long (2xp average for even p), ends held flat
  function trendMA(y, p) {
    const n = y.length, out = new Array(n).fill(null), h = Math.floor(p / 2);
    for (let i = h; i < n - h; i++) {
      let s = 0;
      if (p % 2) { for (let j = i - h; j <= i + h; j++) s += y[j]; out[i] = s / p; }
      else { s = 0.5 * y[i - h] + 0.5 * y[i + h]; for (let j = i - h + 1; j < i + h; j++) s += y[j]; out[i] = s / p; }
    }
    let first = out.findIndex((v) => v !== null), last = n - 1; while (out[last] === null) last--;
    for (let i = 0; i < n; i++) if (out[i] === null) out[i] = i < first ? out[first] : out[last];
    return { trend: out, lo: h, hi: n - h - 1 };
  }
  function decompose(y, p) {
    p = Math.max(2, Math.round(p)); const n = y.length, T = trendMA(y, p), sums = new Array(p).fill(0), cnt = new Array(p).fill(0);
    for (let i = T.lo; i <= T.hi; i++) { sums[i % p] += y[i] - T.trend[i]; cnt[i % p]++; }
    let pat = sums.map((s, k) => (cnt[k] ? s / cnt[k] : 0)); const pm = mean(pat); pat = pat.map((v) => v - pm);
    const season = y.map((_, i) => pat[i % p]), rem = y.map((v, i) => v - T.trend[i] - season[i]);
    const detr = y.map((v, i) => v - T.trend[i]), vd = variance(detr);
    const strength = vd > 0 ? Math.max(0, 1 - variance(rem) / vd) : 0;
    return { trend: T.trend, season, remainder: rem, pattern: pat, strength, p };
  }
  function scan(y, pmin, pmax) { const out = []; for (let p = pmin; p <= pmax; p++) out.push({ p, strength: decompose(y, p).strength }); return out; }
  const core = { rng, MODES, makeSeries, trendMA, decompose, scan };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.SeasonCore = core;
})(typeof window !== "undefined" ? window : globalThis);
