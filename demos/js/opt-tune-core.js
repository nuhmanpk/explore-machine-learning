// Hyperparameter tuning core: a real k-nearest-neighbours classifier with two knobs (k and distance weighting).
// Compares grid vs random search on the same budget and shows validation vs test vs fresh scores. Pure logic, seeded.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const KMAX = 25, KS = Array.from({ length: KMAX }, (_, i) => i + 1);
  const PS = Array.from({ length: 13 }, (_, i) => i * 0.25); // distance weight power 0..3
  const SIZES = { train: 80, val: 50, test: 50, fresh: 400 };

  function moons(r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const c = i % 2, a = r() * Math.PI, g = () => (r() + r() + r() - 1.5) * 0.7;
      let x = Math.cos(a), y = Math.sin(a);
      if (c) { x = 1 - x; y = 0.4 - y; }
      let label = c; if (r() < 0.08) label = 1 - label; // a few mislabelled points, like real data
      pts.push({ x: x + g() * 0.5, y: y + g() * 0.5, c: label });
    }
    return pts;
  }
  class Data {
    constructor(seed) {
      const r = rng(seed); this.seed = seed;
      this.sets = {}; for (const k in SIZES) this.sets[k] = moons(r, SIZES[k]);
      this.nb = {}; this.cache = {};
    }
    neighbours(split) { // for each point of the split: the 25 nearest training points (sorted)
      if (this.nb[split]) return this.nb[split];
      const tr = this.sets.train;
      return (this.nb[split] = this.sets[split].map((q) => tr.map((t) => ({ d: Math.hypot(q.x - t.x, q.y - t.y), c: t.c })).sort((a, b) => a.d - b.d).slice(0, KMAX)));
    }
    score(split, ki, pi) { // accuracy of kNN with k = KS[ki], weight = 1/(d+0.05)^p
      const key = split + ":" + ki + ":" + pi; if (key in this.cache) return this.cache[key];
      const k = KS[ki], p = PS[pi], nb = this.neighbours(split), pts = this.sets[split];
      let ok = 0;
      for (let i = 0; i < pts.length; i++) {
        let w0 = 0, w1 = 0;
        for (let j = 0; j < k; j++) { const w = 1 / Math.pow(nb[i][j].d + 0.05, p); if (nb[i][j].c) w1 += w; else w0 += w; }
        if ((w1 > w0 ? 1 : 0) === pts[i].c) ok++;
      }
      return (this.cache[key] = ok / pts.length);
    }
  }
  Data.prototype.predict = function (x, y, ki, pi) { // class guess for any point, for drawing the model
    const k = KS[ki], p = PS[pi];
    const nb = this.sets.train.map((t) => ({ d: Math.hypot(x - t.x, y - t.y), c: t.c })).sort((a, b) => a.d - b.d).slice(0, k);
    let w0 = 0, w1 = 0; for (const n of nb) { const w = 1 / Math.pow(n.d + 0.05, p); if (n.c) w1 += w; else w0 += w; }
    return w1 > w0 ? 1 : 0;
  };
  const linspace = (n, m) => (n <= 1 ? [Math.floor((m - 1) / 2)] : Array.from({ length: n }, (_, i) => Math.round((i * (m - 1)) / (n - 1))));
  function gridCells(budget) {
    let np = Math.max(1, Math.floor(Math.sqrt(budget / 2))); np = Math.min(np, PS.length);
    const nk = Math.max(1, Math.min(KMAX, Math.floor(budget / np))), out = [];
    for (const pi of linspace(np, PS.length)) for (const ki of linspace(nk, KMAX)) out.push({ ki, pi });
    return out;
  }
  function randomCells(budget, seed) {
    const r = rng(seed), seen = new Set(), out = [];
    while (out.length < Math.min(budget, KMAX * PS.length)) {
      const ki = Math.floor(r() * KMAX), pi = Math.floor(r() * PS.length), key = ki * 100 + pi;
      if (!seen.has(key)) { seen.add(key); out.push({ ki, pi }); }
    }
    return out;
  }
  // run a search; "by" says which split decides the winner ("val" = honest, "test" = cheating)
  function search(data, cells, by) {
    const tried = cells.map((c) => ({ ...c, val: data.score("val", c.ki, c.pi), test: data.score("test", c.ki, c.pi) }));
    let b = tried[0]; for (const t of tried) if (t[by] > b[by]) b = t;
    return { tried, best: b, fresh: data.score("fresh", b.ki, b.pi) };
  }
  function race(seed, budget, n) { // repeat on n fresh datasets, report averages
    const acc = { gridVal: 0, randVal: 0, gridFresh: 0, randFresh: 0, honest: 0, cheat: 0, randWins: 0, gridWins: 0 };
    for (let i = 0; i < n; i++) {
      const d = new Data(seed + i * 7919 + 1), g = search(d, gridCells(budget), "val"), rr = search(d, randomCells(budget, seed + i), "val"), ch = search(d, randomCells(budget, seed + i), "test");
      acc.gridVal += g.best.val; acc.randVal += rr.best.val; acc.gridFresh += g.fresh; acc.randFresh += rr.fresh;
      acc.honest += rr.best.val - rr.fresh; acc.cheat += ch.best.test - ch.fresh;
      if (rr.best.val > g.best.val) acc.randWins++; else if (g.best.val > rr.best.val) acc.gridWins++;
    }
    for (const k in acc) if (k !== "randWins" && k !== "gridWins") acc[k] /= n;
    return acc;
  }
  const core = { rng, KS, PS, KMAX, Data, gridCells, randomCells, search, race };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.TuneCore = core;
})(typeof window !== "undefined" ? window : globalThis);
