// Simulated annealing vs hill climbing on a travelling-salesman route. Pure logic, seeded.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function cities(seed, n) {
    const r = rng(seed), out = [];
    while (out.length < n) {
      const p = { x: 6 + r() * 88, y: 6 + r() * 88 };
      if (out.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 9)) out.push(p);
    }
    return out;
  }
  function tourLen(c, t) {
    let s = 0;
    for (let i = 0; i < t.length; i++) { const a = c[t[i]], b = c[t[(i + 1) % t.length]]; s += Math.hypot(a.x - b.x, a.y - b.y); }
    return s;
  }
  function randomTour(seed, n) {
    const r = rng(seed), t = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
    return t;
  }
  // temperature falls smoothly from t0 to tEnd over total steps
  const temp = (step, total, t0, tEnd = 0.05) => t0 * Math.pow(tEnd / t0, Math.min(1, step / Math.max(1, total)));

  // Move = reverse a stretch of the route (the classic 2-opt move). mode "hill" only accepts better routes,
  // mode "sa" also accepts worse ones with probability exp(-extra/T).
  class Solver {
    constructor(c, tour, mode, seed) {
      this.c = c; this.mode = mode; this.r = rng(seed || 1); this.tour = tour.slice(); this.len = tourLen(c, this.tour);
      this.best = this.len; this.bestTour = this.tour.slice(); this.steps = 0; this.worseAccepted = 0; this.lastImprove = 0;
    }
    step(T) {
      const n = this.tour.length;
      let i = Math.floor(this.r() * n), j = Math.floor(this.r() * n);
      if (i === j) { this.steps++; return false; }
      if (i > j) [i, j] = [j, i];
      const t = this.tour, old = this.len;
      const nt = t.slice(0, i).concat(t.slice(i, j + 1).reverse(), t.slice(j + 1));
      const nl = tourLen(this.c, nt), d = nl - old;
      let ok = d < -1e-9;
      if (!ok && this.mode === "sa" && T > 0 && d > 1e-9 && this.r() < Math.exp(-d / T)) { ok = true; this.worseAccepted++; }
      this.steps++;
      if (ok) {
        this.tour = nt; this.len = nl;
        if (nl < this.best - 1e-9) { this.best = nl; this.bestTour = nt.slice(); this.lastImprove = this.steps; }
      }
      return ok;
    }
  }
  // a good reference answer: several long annealing runs, keep the shortest
  function bestKnown(c, seed) {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const s = new Solver(c, randomTour(seed + k, c.length), "sa", seed + 50 + k), N = 20000;
      for (let i = 0; i < N; i++) s.step(temp(i, N, 30));
      best = Math.min(best, s.best);
    }
    return best;
  }
  const core = { rng, cities, tourLen, randomTour, temp, Solver, bestKnown };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.AnnealCore = core;
})(typeof window !== "undefined" ? window : globalThis);
