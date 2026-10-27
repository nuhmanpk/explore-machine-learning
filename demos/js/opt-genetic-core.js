// Genetic algorithm core: evolve an 8x8 picture (64 bits) towards a hidden target. Pure logic, seeded.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const PICS = {
    heart: [".##..##.", "########", "########", "########", ".######.", "..####..", "...##...", "........"],
    smile: ["..####..", ".#....#.", "#.#..#.#", "#......#", "#.#..#.#", "#..##..#", ".#....#.", "..####.."],
    arrow: ["...##...", "..####..", ".######.", "########", "...##...", "...##...", "...##...", "...##..."],
  };
  const target = (name) => PICS[name].join("").split("").map((c) => (c === "#" ? 1 : 0));
  const N = 64;

  class GA {
    constructor(o) {
      this.r = rng(o.seed || 1); this.target = o.target; this.pop = o.pop || 60; this.mut = o.mut == null ? 0.01 : o.mut; this.cross = o.cross !== false;
      this.gen = 0; this.inds = [];
      for (let i = 0; i < this.pop; i++) this.inds.push(this.randomGenome());
      this.evalAll();
    }
    randomGenome() { const g = new Array(N); for (let i = 0; i < N; i++) g[i] = this.r() < 0.5 ? 1 : 0; return g; }
    fitness(g) { let s = 0; for (let i = 0; i < N; i++) if (g[i] === this.target[i]) s++; return s; }
    evalAll() { this.fit = this.inds.map((g) => this.fitness(g)); }
    set(p) { // change settings live; population is resized
      if (p.mut != null) this.mut = p.mut;
      if (p.cross != null) this.cross = p.cross;
      if (p.pop != null && p.pop !== this.inds.length) {
        const order = this.inds.map((g, i) => i).sort((a, b) => this.fit[b] - this.fit[a]);
        const next = order.slice(0, p.pop).map((i) => this.inds[i]);
        while (next.length < p.pop) next.push(this.randomGenome());
        this.inds = next; this.pop = p.pop; this.evalAll();
      }
    }
    pick() { // tournament of 3
      let b = Math.floor(this.r() * this.inds.length);
      for (let k = 0; k < 2; k++) { const c = Math.floor(this.r() * this.inds.length); if (this.fit[c] > this.fit[b]) b = c; }
      return b;
    }
    step() {
      const n = this.inds.length, bi = this.bestIndex(), next = [this.inds[bi].slice()];
      while (next.length < n) {
        const a = this.inds[this.pick()], b = this.inds[this.pick()];
        const child = a.slice();
        if (this.cross) { const cut = 1 + Math.floor(this.r() * (N - 1)); for (let i = cut; i < N; i++) child[i] = b[i]; }
        for (let i = 0; i < N; i++) if (this.r() < this.mut) child[i] = 1 - child[i];
        next.push(child);
      }
      this.inds = next; this.gen++; this.evalAll();
    }
    bestIndex() { let b = 0; for (let i = 1; i < this.fit.length; i++) if (this.fit[i] > this.fit[b]) b = i; return b; }
    stats() {
      const bi = this.bestIndex(), n = this.fit.length;
      let sum = 0; for (const f of this.fit) sum += f;
      return { gen: this.gen, best: this.fit[bi], avg: sum / n, bestGenome: this.inds[bi].slice(), solved: this.fit[bi] === N };
    }
  }
  const core = { rng, PICS, target, N, GA };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GeneticCore = core;
})(typeof window !== "undefined" ? window : globalThis);
