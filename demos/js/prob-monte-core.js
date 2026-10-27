// Monte Carlo core: random darts to estimate pi, error-vs-n curve, and a Monty Hall simulator. Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Darts land uniformly in the unit square. A dart is "in" if it is inside the quarter circle of radius 1.
  class PiEstimator {
    constructor(seed, keep = 1500) { this.r = rng(seed); this.n = 0; this.inside = 0; this.pts = []; this.keep = keep; }
    add(k) {
      for (let i = 0; i < k; i++) {
        const x = this.r(), y = this.r(), hit = x * x + y * y <= 1;
        this.n++; if (hit) this.inside++;
        if (this.pts.length < this.keep) this.pts.push({ x, y, hit });
      }
    }
    estimate() { return this.n ? (4 * this.inside) / this.n : 0; }
    error() { return Math.abs(this.estimate() - Math.PI); }
  }
  // Average absolute error of the pi estimate over `reps` independent runs, for each n in ns.
  function errorCurve(seed, ns, reps) {
    return ns.map((n, k) => {
      let tot = 0;
      for (let j = 0; j < reps; j++) { const e = new PiEstimator(seed + 1000 * k + j, 0); e.add(n); tot += e.error(); }
      return { n, err: tot / reps };
    });
  }
  // Monty Hall: car behind one of 3 doors. You pick; host opens a goat door you did not pick; you stay or switch.
  const newGame = (r) => ({ car: Math.floor(r() * 3) });
  function hostOpens(car, pick, r) {
    const opts = [0, 1, 2].filter((d) => d !== car && d !== pick);
    return opts[Math.floor(r() * opts.length)];
  }
  const finalPick = (pick, open, doSwitch) => (doSwitch ? [0, 1, 2].find((d) => d !== pick && d !== open) : pick);
  function montyRun(seed, n, doSwitch) {
    const r = rng(seed); let wins = 0;
    for (let i = 0; i < n; i++) {
      const g = newGame(r), pick = Math.floor(r() * 3), open = hostOpens(g.car, pick, r);
      if (finalPick(pick, open, doSwitch) === g.car) wins++;
    }
    return wins;
  }
  const core = { rng, PiEstimator, errorCurve, newGame, hostOpens, finalPick, montyRun };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.MonteCore = core;
})(typeof window !== "undefined" ? window : globalThis);
