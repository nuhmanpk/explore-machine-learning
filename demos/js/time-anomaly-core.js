// Spot the Odd One core: sensor stream with hidden labelled anomalies, rolling z-score detector, precision/recall.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u < 1e-9) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const variance = (a) => { const m = mean(a); return mean(a.map((x) => (x - m) * (x - m))); };
  function makeStream(seed, n) {
    n = n || 360; const r = rng(seed), y = [], truth = new Array(n).fill(false), kind = new Array(n).fill("");
    for (let t = 0; t < n; t++) y.push(20 + 2 * Math.sin((2 * Math.PI * t) / 90) + gauss(r));
    const used = new Set(), place = () => { for (;;) { const t = 70 + Math.floor(r() * (n - 80)); if (t < 235 || t > 280) if (![...used].some((u) => Math.abs(u - t) < 4)) { used.add(t); return t; } } };
    for (let i = 0; i < 8; i++) { const t = place(); y[t] += (r() < 0.5 ? -1 : 1) * (6 + 3 * r()); truth[t] = true; kind[t] = "spike"; }
    for (let i = 0; i < 4; i++) { const t = place(); y[t] += (r() < 0.5 ? -1 : 1) * (3.4 + 0.8 * r()); truth[t] = true; kind[t] = "subtle"; }
    // slow drift: sensor slowly goes wrong, then is fixed. Points at least 3.5 off are labelled.
    for (let t = 240; t < 275; t++) { const off = Math.min(1, (t - 240) / 25) * 6; y[t] += off; if (off >= 3.5) { truth[t] = true; kind[t] = "drift"; } }
    return { y, truth, kind };
  }
  // Compare each point with the mean/std of the previous w points only (no peeking).
  function rolling(y, w) {
    const mu = new Array(y.length).fill(null), sd = new Array(y.length).fill(null);
    for (let i = w; i < y.length; i++) { const win = y.slice(i - w, i), m = mean(win); mu[i] = m; sd[i] = Math.max(0.3, Math.sqrt(variance(win))); }
    return { mu, sd };
  }
  function detect(y, w, thr) {
    const R = rolling(y, w), z = y.map((v, i) => (R.mu[i] === null ? 0 : (v - R.mu[i]) / R.sd[i]));
    return { flags: z.map((v, i) => R.mu[i] !== null && Math.abs(v) > thr), z, mu: R.mu, sd: R.sd };
  }
  // Precision = of the alarms, how many were real. Recall = of the real problems (events), how many got at least one alarm.
  function score(flags, truth) {
    let tp = 0, fp = 0, total = 0, caught = 0, inRun = false, hit = false;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i] && truth[i]) tp++; else if (flags[i]) fp++;
      if (truth[i]) { if (!inRun) { inRun = true; hit = false; total++; } if (flags[i] && !hit) { hit = true; caught++; } } else inRun = false;
    }
    const precision = tp + fp ? tp / (tp + fp) : 1, recall = total ? caught / total : 1;
    return { tp, fp, events: total, caught, missed: total - caught, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
  }
  function sweep(y, truth, w, lo, hi, step) { const out = []; for (let t = lo; t <= hi + 1e-9; t += step) { const s = score(detect(y, w, t).flags, truth); out.push({ thr: t, precision: s.precision, recall: s.recall, f1: s.f1 }); } return out; }
  const core = { rng, makeStream, rolling, detect, score, sweep };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.AnomalyCore = core;
})(typeof window !== "undefined" ? window : globalThis);
