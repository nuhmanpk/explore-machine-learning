// Nearest Neighbours core — the fruit table (where each fruit grows), a sampler, and plain k-NN. No DOM; runs in Node too.
// Pass `rng` ({ randn() } — ML works as-is, or makeRng(seed)) for determinism.
(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function makeRng(seed) {
    let a = seed >>> 0, spare = null;
    const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rand = (lo = 0, hi = 1) => lo + next() * (hi - lo);
    function randn() {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0;
      while (u === 0) u = next();
      const v = next(), r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    }
    return { rand, randn, randInt: (lo, hi) => Math.floor(rand(lo, hi + 1)) };
  }
  const defaultRng = { randn() { let u = 0; while (u === 0) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); } };

  const NAMES = ["apple", "lemon", "pear"];
  // Where each fruit really grows: [roundness, yellowness], spread.
  const HOME = [{ x: 0.78, y: 0.22, s: 0.09 }, { x: 0.5, y: 0.8, s: 0.08 }, { x: 0.28, y: 0.42, s: 0.09 }];

  function sample(c, spread = 1, rng = defaultRng) {
    const h = HOME[c];
    return { x: clamp(h.x + rng.randn() * h.s * spread, 0.02, 0.98), y: clamp(h.y + rng.randn() * h.s * spread, 0.02, 0.98), c };
  }
  function makeTest(spread, rng = defaultRng) {
    const test = [];
    for (let i = 0; i < 60; i++) test.push(sample(i % 3, spread, rng));
    return test;
  }

  // k nearest neighbours of (x, y) among pts: votes, probabilities, the guess (ties go to the single closest one).
  function knn(pts, x, y, k) {
    const d = pts.map((p, i) => [Math.hypot(p.x - x, p.y - y), i]);
    d.sort((a, b) => a[0] - b[0]);
    const near = d.slice(0, Math.min(k, d.length));
    const v = [0, 0, 0];
    near.forEach(([, i]) => v[pts[i].c]++);
    const n = near.length || 1;
    const probs = v.map((c) => c / n);
    const mx = Math.max(...v);
    let guess = v.indexOf(mx);
    if (v.filter((c) => c === mx).length > 1 && near.length) guess = pts[near[0][1]].c;
    return { probs, near, votes: v, guess };
  }
  // Fraction of `test` fruit that k-NN over pts names correctly (null when pts is empty).
  function testAcc(pts, test, k) {
    if (!pts.length) return null;
    let ok = 0;
    for (const t of test) if (knn(pts, t.x, t.y, k).guess === t.c) ok++;
    return ok / test.length;
  }

  const api = { makeRng, NAMES, HOME, sample, makeTest, knn, testAcc };
  root.FruitCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
