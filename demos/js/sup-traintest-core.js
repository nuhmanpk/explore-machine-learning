// Train vs Test: pure logic (runs in Node too). Two noisy moons + 1-nearest-neighbour.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
  // n cards in a unit-ish box; class 0 = upper moon, 1 = lower moon. Returns [{x,y,c}], x,y in ~[0,1].
  function makeCards(n, noise, seed) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const c = i % 2, t = r() * Math.PI;
      let x = c ? 1 - Math.cos(t) : Math.cos(t), y = c ? 0.5 - Math.sin(t) : Math.sin(t);
      x += gauss(r) * noise; y += gauss(r) * noise;
      out.push({ x: (x + 1.2) / 3.4, y: (y + 0.9) / 2.2, c });
    }
    return out;
  }
  function shuffled(n, seed) {
    const r = rng(seed), a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // 1-nearest-neighbour (k=1): copies the label of the closest study card.
  function nn(train, x, y, k = 1) {
    if (!train.length) return 0;
    const d = train.map((p) => [(p.x - x) ** 2 + (p.y - y) ** 2, p.c]).sort((a, b) => a[0] - b[0]).slice(0, k);
    let s = 0; for (const e of d) s += e[1];
    return s * 2 > d.length ? 1 : 0;
  }
  const accuracy = (train, set) => (set.length ? set.filter((p) => nn(train, p.x, p.y) === p.c).length / set.length : 0);
  // pool cards, shuffle order, m study cards, rest = exam. leak = exam cards also go into study pile.
  function split(pool, order, m) { return { train: order.slice(0, m).map((i) => pool[i]), test: order.slice(m).map((i) => pool[i]) }; }
  function scores(pool, order, m, leak) {
    const s = split(pool, order, m), tr = leak ? pool : s.train;
    return { train: accuracy(tr, s.train), test: accuracy(tr, s.test), nTrain: tr.length, nTest: s.test.length };
  }
  const core = { rng, makeCards, shuffled, nn, accuracy, split, scores };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.TrainTestCore = core;
})(typeof window !== "undefined" ? window : globalThis);
