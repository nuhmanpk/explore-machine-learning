// Brain Painter core — a tiny MLP (tanh hidden, sigmoid out) trained with backprop + mini-batch SGD,
// plus the dot presets. No DOM; runs in Node too. Pass `rng` ({ rand(a,b), randn() }) for determinism.
(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Seeded RNG (mulberry32) with the same shape as ML: rand(a,b), randn().
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
    return { rand, randn };
  }
  const defaultRng = {
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randn() { let u = 0; while (u === 0) u = Math.random(); const v = Math.random(), r = Math.sqrt(-2 * Math.log(u)); return r * Math.cos(2 * Math.PI * v); },
  };

  // ---------- the network ----------
  function buildNet(layers, neurons, rng = defaultRng) {
    const sizes = [2, ...Array(layers).fill(neurons), 1];
    const W = [], B = [];
    for (let l = 1; l < sizes.length; l++) {
      const fanIn = sizes[l - 1], sd = Math.sqrt(1 / fanIn);
      W.push(Array.from({ length: sizes[l] }, () => Float64Array.from({ length: fanIn }, () => rng.randn() * sd)));
      B.push(new Float64Array(sizes[l]));
    }
    return { sizes, W, B };
  }
  // Returns activations per layer (acts[0] = input).
  function forward(net, x, y) {
    const acts = [[x, y]];
    for (let l = 0; l < net.W.length; l++) {
      const prev = acts[l], Wl = net.W[l], Bl = net.B[l], last = l === net.W.length - 1;
      const a = new Array(Wl.length);
      for (let j = 0; j < Wl.length; j++) {
        let z = Bl[j];
        const row = Wl[j];
        for (let i = 0; i < prev.length; i++) z += row[i] * prev[i];
        a[j] = last ? 1 / (1 + Math.exp(-z)) : Math.tanh(z);
      }
      acts.push(a);
    }
    return acts;
  }
  const predict = (net, x, y) => { const a = forward(net, x, y); return a[a.length - 1][0]; };

  // One pass over the data in shuffled mini-batches. Returns false if there was nothing to train on.
  function trainEpoch(net, points, lr, rng = defaultRng) {
    if (!points.length) return false;
    const idx = points.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng.rand(0, 1) * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const BS = 10;
    for (let s = 0; s < idx.length; s += BS) {
      const gW = net.W.map((Wl) => Wl.map((r) => new Float64Array(r.length)));
      const gB = net.B.map((b) => new Float64Array(b.length));
      const batch = idx.slice(s, s + BS);
      for (const k of batch) {
        const p = points[k];
        const acts = forward(net, p.x, p.y);
        let delta = [acts[acts.length - 1][0] - p.c]; // dBCE/dz for sigmoid output
        for (let l = net.W.length - 1; l >= 0; l--) {
          const prev = acts[l];
          for (let j = 0; j < delta.length; j++) {
            gB[l][j] += delta[j];
            const g = gW[l][j];
            for (let i = 0; i < prev.length; i++) g[i] += delta[j] * prev[i];
          }
          if (l > 0) {
            const nd = new Array(prev.length).fill(0);
            for (let i = 0; i < prev.length; i++) {
              let sum = 0;
              for (let j = 0; j < delta.length; j++) sum += net.W[l][j][i] * delta[j];
              nd[i] = sum * (1 - prev[i] * prev[i]); // tanh'
            }
            delta = nd;
          }
        }
      }
      const step = lr / batch.length;
      for (let l = 0; l < net.W.length; l++)
        for (let j = 0; j < net.W[l].length; j++) {
          net.B[l][j] -= step * gB[l][j];
          for (let i = 0; i < net.W[l][j].length; i++) net.W[l][j][i] -= step * gW[l][j][i];
        }
    }
    return true;
  }

  // Cross-entropy loss and accuracy over the dots (NaN when there are none).
  function evaluate(net, points) {
    if (!points.length) return { loss: NaN, acc: NaN };
    let loss = 0, right = 0;
    for (const p of points) {
      const q = clamp(predict(net, p.x, p.y), 1e-7, 1 - 1e-7);
      loss += -(p.c * Math.log(q) + (1 - p.c) * Math.log(1 - q));
      if ((q > 0.5 ? 1 : 0) === p.c) right++;
    }
    return { loss: loss / points.length, acc: right / points.length };
  }

  const cloneNet = (n) => ({ sizes: n.sizes.slice(), W: n.W.map((Wl) => Wl.map((r) => Float64Array.from(r))), B: n.B.map((b) => Float64Array.from(b)) });

  // ---------- data presets ----------
  function preset(name, rng = defaultRng) {
    const { rand, randn } = rng;
    const pts = [];
    const add = (x, y, c) => { if (Math.abs(x) <= 1 && Math.abs(y) <= 1) pts.push({ x, y, c }); };
    if (name === "blobs") {
      for (let i = 0; i < 60; i++) add(-0.45 + randn() * 0.18, -0.4 + randn() * 0.18, 0);
      for (let i = 0; i < 60; i++) add(0.45 + randn() * 0.18, 0.4 + randn() * 0.18, 1);
    } else if (name === "circle") {
      for (let i = 0; i < 70; i++) { const r = rand(0, 0.38), a = rand(0, 7); add(r * Math.cos(a), r * Math.sin(a), 1); }
      for (let i = 0; i < 90; i++) { const r = rand(0.6, 0.9), a = rand(0, 7); add(r * Math.cos(a), r * Math.sin(a), 0); }
    } else if (name === "xor") {
      while (pts.length < 140) {
        const x = rand(-0.95, 0.95), y = rand(-0.95, 0.95);
        if (Math.abs(x) < 0.08 || Math.abs(y) < 0.08) continue;
        add(x, y, x * y > 0 ? 1 : 0);
      }
    } else if (name === "spiral") {
      for (let c = 0; c < 2; c++)
        for (let i = 0; i < 80; i++) {
          const t = i / 80, r = 0.08 + t * 0.85, a = t * Math.PI * 3 + c * Math.PI;
          add(r * Math.cos(a) + randn() * 0.025, r * Math.sin(a) + randn() * 0.025, c);
        }
    }
    return pts;
  }

  const api = { makeRng, buildNet, forward, predict, trainEpoch, evaluate, cloneNet, preset };
  root.PlaygroundCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
