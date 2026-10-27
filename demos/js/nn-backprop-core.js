// Backprop core: a 2 -> 2 -> 1 sigmoid network. Pure logic, runs in the browser and in Node.
(function (root) {
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
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
  // flat order: w1[0][0], w1[0][1], w1[1][0], w1[1][1], b1[0], b1[1], w2[0], w2[1], b2
  const NAMES = ["w1_0_0", "w1_0_1", "w1_1_0", "w1_1_1", "b1_0", "b1_1", "w2_0", "w2_1", "b2"];
  const flat = (n) => [n.w1[0][0], n.w1[0][1], n.w1[1][0], n.w1[1][1], n.b1[0], n.b1[1], n.w2[0], n.w2[1], n.b2];
  const fromFlat = (v) => ({ w1: [[v[0], v[1]], [v[2], v[3]]], b1: [v[4], v[5]], w2: [v[6], v[7]], b2: v[8] });
  const clone = (n) => fromFlat(flat(n));
  function init(seed, scale) {
    const r = rng(seed), s = scale == null ? 1 : scale;
    const u = () => +((r() * 2 - 1) * s).toFixed(2);
    return fromFlat([u(), u(), u(), u(), u(), u(), u(), u(), u()]);
  }
  function forward(n, x) {
    const z1 = [0, 1].map((j) => x[0] * n.w1[0][j] + x[1] * n.w1[1][j] + n.b1[j]);
    const h = z1.map(sigmoid);
    const z2 = h[0] * n.w2[0] + h[1] * n.w2[1] + n.b2;
    return { x, z1, h, z2, o: sigmoid(z2) };
  }
  const lossOf = (o, y) => (o - y) * (o - y);
  // Backward pass. Every intermediate is returned so the lesson can spell out the chain rule.
  function backward(n, x, y) {
    const f = forward(n, x);
    const dLdo = 2 * (f.o - y);
    const so = f.o * (1 - f.o);
    const dz2 = dLdo * so;
    const dh = [dz2 * n.w2[0], dz2 * n.w2[1]];
    const sh = f.h.map((h) => h * (1 - h));
    const dz1 = [dh[0] * sh[0], dh[1] * sh[1]];
    const g = {
      w1: [[dz1[0] * x[0], dz1[1] * x[0]], [dz1[0] * x[1], dz1[1] * x[1]]],
      b1: [dz1[0], dz1[1]],
      w2: [dz2 * f.h[0], dz2 * f.h[1]],
      b2: dz2,
    };
    return { f, loss: lossOf(f.o, y), dLdo, so, dz2, dh, sh, dz1, g, flat: flat(g) };
  }
  function numeric(n, x, y, eps) {
    const e = eps || 1e-4, v = flat(n);
    return v.map((_, k) => {
      const p = v.slice(), m = v.slice();
      p[k] += e; m[k] -= e;
      return (lossOf(forward(fromFlat(p), x).o, y) - lossOf(forward(fromFlat(m), x).o, y)) / (2 * e);
    });
  }
  const DATA = {
    AND: [[[0, 0], 0], [[0, 1], 0], [[1, 0], 0], [[1, 1], 1]],
    OR: [[[0, 0], 0], [[0, 1], 1], [[1, 0], 1], [[1, 1], 1]],
    XOR: [[[0, 0], 0], [[0, 1], 1], [[1, 0], 1], [[1, 1], 0]],
  };
  function meanLoss(n, data) { return data.reduce((s, d) => s + lossOf(forward(n, d[0]).o, d[1]), 0) / data.length; }
  function rightCount(n, data) { return data.filter((d) => (forward(n, d[0]).o > 0.5 ? 1 : 0) === d[1]).length; }
  // One full-batch round: average gradient over the data, then nudge. Returns the mean gradient.
  function round(n, data, lr) {
    const acc = new Array(9).fill(0);
    data.forEach((d) => backward(n, d[0], d[1]).flat.forEach((v, k) => (acc[k] += v / data.length)));
    const v = flat(n).map((w, k) => w - lr * acc[k]);
    return { net: fromFlat(v), grad: acc };
  }
  const api = { sigmoid, rng, NAMES, flat, fromFlat, clone, init, forward, backward, numeric, lossOf, DATA, meanLoss, rightCount, round };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.BackpropCore = api;
})(typeof window !== "undefined" ? window : this);
