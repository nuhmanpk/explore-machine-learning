// Central limit theorem core: odd source distributions, sample means, confidence intervals, bootstrap. Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const SOURCES = { flat: "Flat", skewed: "Skewed", humps: "Two humps" };
  const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.283185307 * r());
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  // One draw from a source; every source lives in [0, 1].
  function draw(src, r) {
    if (src === "flat") return r();
    if (src === "skewed") return Math.min(1, -Math.log(1 - r()) / 6);
    return clamp01((r() < 0.5 ? 0.2 : 0.8) + 0.06 * gauss(r));
  }
  const mean = (a) => { let s = 0; for (const x of a) s += x; return a.length ? s / a.length : 0; };
  const sd = (a) => { const m = mean(a); let s = 0; for (const x of a) s += (x - m) * (x - m); return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : 0; };
  function skew(a) {
    const m = mean(a), s = sd(a); if (!s) return 0;
    let t = 0; for (const x of a) t += ((x - m) / s) ** 3; return t / a.length;
  }
  // True mean and sd of a source, measured on a big fixed sample (deterministic).
  const cache = {};
  function sourceStats(src) {
    if (!cache[src]) { const r = rng(99), a = []; for (let i = 0; i < 60000; i++) a.push(draw(src, r)); cache[src] = { mean: mean(a), sd: sd(a), sample: a }; }
    return cache[src];
  }
  function histogram(vals, bins, lo, hi) {
    const h = new Array(bins).fill(0), w = (hi - lo) / bins;
    for (const v of vals) h[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))]++;
    return h;
  }
  const sampleOf = (src, n, r) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = draw(src, r); return a; };
  function sampleMeans(src, n, count, r) { const o = new Array(count); for (let i = 0; i < count; i++) o[i] = mean(sampleOf(src, n, r)); return o; }
  const normalPdf = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * 2.5066282746);
  // 95% interval by the textbook formula mean ± 1.96 s / sqrt(n)
  function ciFormula(sample) { const m = mean(sample), e = 1.96 * sd(sample) / Math.sqrt(sample.length); return { mean: m, lo: m - e, hi: m + e }; }
  // Bootstrap: resample WITH replacement from the one sample, look at the means.
  function bootstrap(sample, B, r) {
    const n = sample.length, out = new Array(B);
    for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < n; i++) s += sample[Math.floor(r() * n)]; out[b] = s / n; }
    return out;
  }
  function ciBootstrap(sample, B, r) {
    const boots = bootstrap(sample, B, r), s = boots.slice().sort((a, b) => a - b);
    return { mean: mean(sample), lo: s[Math.floor(0.025 * (B - 1))], hi: s[Math.ceil(0.975 * (B - 1))], boots };
  }
  // How often does the interval catch the true mean? (should be about 95%)
  function coverage(src, n, trials, seed, method) {
    const r = rng(seed), mu = sourceStats(src).mean; let hit = 0;
    for (let t = 0; t < trials; t++) {
      const s = sampleOf(src, n, r), ci = method === "boot" ? ciBootstrap(s, 300, r) : ciFormula(s);
      if (ci.lo <= mu && mu <= ci.hi) hit++;
    }
    return hit / trials;
  }
  const core = { rng, SOURCES, draw, mean, sd, skew, sourceStats, histogram, sampleOf, sampleMeans, normalPdf, ciFormula, bootstrap, ciBootstrap, coverage };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.CltCore = core;
})(typeof window !== "undefined" ? window : globalThis);
