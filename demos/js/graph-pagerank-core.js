// The Random Surfer core: a mini web, a seeded random surfer, and real PageRank by power iteration.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const PAGES = ["Pizza Place", "Cat Pics", "Space News", "Bike Shop", "Recipe Blog", "Game Wiki", "Music Hub", "Dog Park"];
  const MINE = 3; // "your" page: the Bike Shop starts with no visitors linking to it
  const START = [[4, 1], [4, 7], [5, 4], [0, 6], [0, 6, 2], [2, 6], [4, 5], [1]]; // out-links per page

  const clone = (o) => o.map((a) => a.slice());
  // link farm: k junk pages that all just link to the target
  function withFarm(out, target, k) { const o = clone(out); for (let i = 0; i < k; i++) o.push([target]); return o; }
  const nameOf = (i) => (i < PAGES.length ? PAGES[i] : "Junk " + (i - PAGES.length + 1));

  // One power-iteration step: every page shares its rank among its links; with probability (1-d) the surfer teleports anywhere.
  function step(out, rank, d) {
    const n = out.length, nx = new Array(n).fill((1 - d) / n); let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (!out[i].length) { dangling += rank[i]; continue; }
      const share = (d * rank[i]) / out[i].length; for (const j of out[i]) nx[j] += share;
    }
    for (let j = 0; j < n; j++) nx[j] += (d * dangling) / n;
    return nx;
  }
  const uniform = (n) => new Array(n).fill(1 / n);
  const l1 = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
  function pagerank(out, d, maxIter, tol) {
    let r = uniform(out.length), it = 0;
    for (; it < (maxIter || 200); it++) { const nx = step(out, r, d); const diff = l1(nx, r); r = nx; if (diff < (tol || 1e-10)) { it++; break; } }
    return { rank: r, iters: it };
  }
  const ranking = (rank) => rank.map((v, i) => i).sort((a, b) => rank[b] - rank[a] || a - b);

  class Surfer {
    constructor(out, d, seed) { this.r = rng(seed); this.d = d; this.setGraph(out); }
    setGraph(out) { this.out = out; this.pos = Math.min(this.pos | 0, out.length - 1); this.reset(); }
    reset() { this.counts = new Array(this.out.length).fill(0); this.steps = 0; this.counts[this.pos]++; }
    // returns {from,to,teleport}
    step() {
      const o = this.out[this.pos], from = this.pos; let tele = false;
      if (o.length && this.r() < this.d) this.pos = o[Math.floor(this.r() * o.length)];
      else { tele = true; this.pos = Math.floor(this.r() * this.out.length); }
      this.counts[this.pos]++; this.steps++;
      return { from, to: this.pos, teleport: tele };
    }
    share() { const t = this.counts.reduce((a, b) => a + b, 0); return this.counts.map((c) => c / t); }
  }

  const core = { rng, PAGES, MINE, START, clone, withFarm, nameOf, step, uniform, l1, pagerank, ranking, Surfer };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GraphPagerankCore = core;
})(typeof window !== "undefined" ? window : globalThis);
