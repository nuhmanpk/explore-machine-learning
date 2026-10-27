// Pure logic for "Why Brains Need a Bend": seeded data, activations, a tiny MLP with backprop.
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
  function randn(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

  // f(z) and f'(z). "step" has zero slope everywhere, so we train it with a pretend (surrogate) slope.
  const ACTS = {
    linear: { f: (z) => z, d: () => 1 },
    relu: { f: (z) => (z > 0 ? z : 0), d: (z) => (z > 0 ? 1 : 0) },
    tanh: { f: Math.tanh, d: (z) => 1 - Math.tanh(z) ** 2 },
    sigmoid: { f: (z) => 1 / (1 + Math.exp(-z)), d: (z) => { const s = 1 / (1 + Math.exp(-z)); return s * (1 - s); } },
    step: { f: (z) => (z > 0 ? 1 : 0), d: (z) => (Math.abs(z) < 2 ? 0.5 : 0), real: () => 0 },
  };

  function dataset(name, seed, n) {
    const r = rng(seed || 1), pts = [];
    n = n || 120;
    const add = (x, y, c) => pts.push({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), c });
    if (name === "line") {
      while (pts.length < n) {
        const x = r() * 1.9 - 0.95, y = r() * 1.9 - 0.95, s = x + 0.6 * y - 0.1;
        if (Math.abs(s) < 0.15) continue;
        add(x, y, s > 0 ? 1 : 0);
      }
    } else if (name === "circle") {
      for (let i = 0; i < n; i++) {
        const inner = i % 2 === 0, rad = inner ? r() * 0.38 : 0.62 + r() * 0.3, a = r() * 6.2832;
        add(rad * Math.cos(a), rad * Math.sin(a), inner ? 1 : 0);
      }
    } else if (name === "xor") {
      while (pts.length < n) {
        const x = r() * 1.9 - 0.95, y = r() * 1.9 - 0.95;
        if (Math.abs(x) < 0.1 || Math.abs(y) < 0.1) continue;
        add(x, y, x * y > 0 ? 1 : 0);
      }
    } else { // spiral-lite: two arms, one turn
      for (let c = 0; c < 2; c++)
        for (let i = 0; i < n / 2; i++) {
          const t = i / (n / 2), rad = 0.12 + t * 0.8, a = t * Math.PI * 1.6 + c * Math.PI;
          add(rad * Math.cos(a) + randn(r) * 0.03, rad * Math.sin(a) + randn(r) * 0.03, c);
        }
    }
    return pts;
  }

  // sizes e.g. [2,4,4,1]; hidden layers use `act`, output is a sigmoid (probability of blue).
  function makeNet(layers, width, act, seed) {
    const r = rng(seed || 7), sizes = [2];
    for (let i = 0; i < layers; i++) sizes.push(width);
    sizes.push(1);
    const W = [], B = [];
    for (let l = 1; l < sizes.length; l++) {
      const sd = Math.sqrt((act === "relu" ? 2 : 1) / sizes[l - 1]);
      W.push(Array.from({ length: sizes[l] }, () => Array.from({ length: sizes[l - 1] }, () => randn(r) * sd)));
      B.push(new Array(sizes[l]).fill(act === "relu" ? 0.1 : 0));
    }
    return { sizes, W, B, act };
  }
  function forward(net, x, y) {
    const a = ACTS[net.act], Z = [], A = [[x, y]];
    for (let l = 0; l < net.W.length; l++) {
      const last = l === net.W.length - 1, z = [], o = [];
      for (let j = 0; j < net.W[l].length; j++) {
        let s = net.B[l][j];
        for (let i = 0; i < A[l].length; i++) s += net.W[l][j][i] * A[l][i];
        z.push(s); o.push(last ? 1 / (1 + Math.exp(-s)) : a.f(s));
      }
      Z.push(z); A.push(o);
    }
    return { Z, A, p: A[A.length - 1][0] };
  }
  const predict = (net, x, y) => forward(net, x, y).p;

  // One full-batch gradient step. Returns first-layer gradient size (to show vanishing).
  function step(net, pts, lr) {
    const a = ACTS[net.act];
    const gW = net.W.map((m) => m.map((r) => r.map(() => 0))), gB = net.B.map((b) => b.map(() => 0));
    for (const p of pts) {
      const f = forward(net, p.x, p.y);
      let delta = [f.p - p.c];
      for (let l = net.W.length - 1; l >= 0; l--) {
        for (let j = 0; j < delta.length; j++) {
          gB[l][j] += delta[j];
          for (let i = 0; i < f.A[l].length; i++) gW[l][j][i] += delta[j] * f.A[l][i];
        }
        if (l > 0) {
          const nd = new Array(f.A[l].length).fill(0);
          for (let i = 0; i < nd.length; i++) {
            let s = 0;
            for (let j = 0; j < delta.length; j++) s += net.W[l][j][i] * delta[j];
            nd[i] = s * a.d(f.Z[l - 1][i]);
          }
          delta = nd;
        }
      }
    }
    const k = lr / pts.length;
    let g0 = 0;
    for (let l = 0; l < net.W.length; l++)
      for (let j = 0; j < net.W[l].length; j++) {
        net.B[l][j] -= k * gB[l][j];
        for (let i = 0; i < net.W[l][j].length; i++) {
          net.W[l][j][i] -= k * gW[l][j][i];
          if (l === 0) g0 += Math.abs(gW[l][j][i] / pts.length);
        }
      }
    return g0 / (net.W[0].length * 2);
  }
  function evaluate(net, pts) {
    let loss = 0, right = 0;
    for (const p of pts) {
      const q = Math.min(1 - 1e-7, Math.max(1e-7, predict(net, p.x, p.y)));
      loss -= p.c * Math.log(q) + (1 - p.c) * Math.log(1 - q);
      if ((q > 0.5 ? 1 : 0) === p.c) right++;
    }
    return { loss: loss / pts.length, acc: right / pts.length };
  }
  // Multiply all the linear layers into ONE: sigmoid(w1 x + w2 y + b). Valid only for act = linear.
  function collapse(net) {
    let M = net.W[0].map((r) => r.slice()), c = net.B[0].slice();
    for (let l = 1; l < net.W.length; l++) {
      const nM = net.W[l].map((row) => M[0].map((_, i) => row.reduce((s, w, k) => s + w * M[k][i], 0)));
      const nc = net.W[l].map((row, j) => row.reduce((s, w, k) => s + w * c[k], net.B[l][j]));
      M = nM; c = nc;
    }
    return { w: M[0], b: c[0] };
  }
  // Make every hidden ReLU neuron "dead": hugely negative bias so it outputs 0 for every input.
  function killRelu(net) { for (let l = 0; l < net.B.length - 1; l++) net.B[l] = net.B[l].map(() => -12); }

  const api = { rng, ACTS, dataset, makeNet, forward, predict, step, evaluate, collapse, killRelu };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ActCore = api;
})(typeof window !== "undefined" ? window : globalThis);
