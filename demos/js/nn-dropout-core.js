// Forgetful on Purpose core: a small MLP (tanh hidden, sigmoid out) trained full-batch with Adam,
// with optional inverted dropout on the hidden layers and L2 weight decay. Pure logic, runs in Node too.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const gaussFrom = (r) => () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- data: a wavy true border, few points, some labels flipped ----------
  // The real rule: blue (1) above a gentle wave, red (0) below. `flip` = share of labels that are wrong on purpose.
  const border = (x) => 0.35 * Math.sin(2.2 * x);
  function makeData(seed, nTrain = 40, nTest = 300, flip = 0.12) {
    const r = rng(seed), g = gaussFrom(r);
    const one = () => {
      const x = r() * 1.8 - 0.9, y = r() * 1.8 - 0.9;
      let c = y > border(x) + 0.08 * g() ? 1 : 0;
      const noisy = r() < flip;
      if (noisy) c = 1 - c;
      return { x, y, c, noisy };
    };
    const train = [], test = [];
    for (let i = 0; i < nTrain; i++) train.push(one());
    for (let i = 0; i < nTest; i++) test.push(one());
    return { train, test };
  }

  // ---------- the network ----------
  // sizes like [2, 16, 16, 1]. Weights W[l][j][i] from unit i of layer l to unit j of layer l+1.
  function buildNet(sizes, seed) {
    const r = rng(seed), g = gaussFrom(r), W = [], B = [];
    for (let l = 1; l < sizes.length; l++) {
      const sd = Math.sqrt(1 / sizes[l - 1]);
      W.push(Array.from({ length: sizes[l] }, () => Array.from({ length: sizes[l - 1] }, () => g() * sd)));
      B.push(new Array(sizes[l]).fill(0));
    }
    return { sizes: sizes.slice(), W, B, m: null, v: null, t: 0 };
  }
  const cloneNet = (n) => ({ sizes: n.sizes.slice(), W: n.W.map((L) => L.map((r) => r.slice())), B: n.B.map((b) => b.slice()), m: null, v: null, t: 0 });

  // Forward pass. masks[l] (optional) is an array of 0 / 1/(1-p) multipliers for hidden layer l+1 (inverted dropout).
  function forward(net, x, y, masks) {
    const acts = [[x, y]], last = net.W.length - 1;
    for (let l = 0; l <= last; l++) {
      const prev = acts[l], Wl = net.W[l], Bl = net.B[l], a = new Array(Wl.length);
      for (let j = 0; j < Wl.length; j++) {
        let z = Bl[j]; const row = Wl[j];
        for (let i = 0; i < prev.length; i++) z += row[i] * prev[i];
        if (l === last) a[j] = 1 / (1 + Math.exp(-z));
        else { a[j] = Math.tanh(z); if (masks) a[j] *= masks[l][j]; }
      }
      acts.push(a);
    }
    return acts;
  }
  const predict = (net, x, y) => { const a = forward(net, x, y); return a[a.length - 1][0]; };

  // A fresh dropout mask for every hidden layer: each unit naps with chance p; awake ones are scaled by 1/(1-p).
  function makeMasks(net, p, r) {
    const keep = 1 - p, out = [];
    for (let l = 1; l < net.sizes.length - 1; l++) out.push(Array.from({ length: net.sizes[l] }, () => (p > 0 && r() < p ? 0 : 1 / keep)));
    return out;
  }

  // One full-batch Adam step on binary cross-entropy (+ L2 on weights, not biases).
  // opts: { lr, dropout, decay, r }. Returns { loss, shown } where shown = the masks used for the first dot (for drawing).
  function trainStep(net, pts, opts) {
    const lr = opts.lr || 0.02, p = opts.dropout || 0, lam = opts.decay || 0, r = opts.r || Math.random;
    const gW = net.W.map((L) => L.map((row) => new Array(row.length).fill(0))), gB = net.B.map((b) => new Array(b.length).fill(0));
    let loss = 0, shown = null;
    for (let k = 0; k < pts.length; k++) {
      const P = pts[k], masks = p > 0 ? makeMasks(net, p, r) : null;
      if (k === 0) shown = masks;
      const acts = forward(net, P.x, P.y, masks), q = clamp(acts[acts.length - 1][0], 1e-7, 1 - 1e-7);
      loss += -(P.c * Math.log(q) + (1 - P.c) * Math.log(1 - q));
      let delta = [acts[acts.length - 1][0] - P.c];
      for (let l = net.W.length - 1; l >= 0; l--) {
        const prev = acts[l];
        for (let j = 0; j < delta.length; j++) { gB[l][j] += delta[j]; const g = gW[l][j]; for (let i = 0; i < prev.length; i++) g[i] += delta[j] * prev[i]; }
        if (l > 0) {
          const nd = new Array(prev.length);
          for (let i = 0; i < prev.length; i++) {
            let s = 0; for (let j = 0; j < delta.length; j++) s += net.W[l][j][i] * delta[j];
            // prev[i] is already masked: a = m * tanh(z). d a / d z = m * (1 - tanh^2); tanh = a / m.
            const m = masks ? masks[l - 1][i] : 1, th = m ? prev[i] / m : 0;
            nd[i] = s * m * (1 - th * th);
          }
          delta = nd;
        }
      }
    }
    const n = pts.length;
    if (!net.m) { net.m = gW.map((L) => L.map((r) => r.map(() => 0))); net.v = gW.map((L) => L.map((r) => r.map(() => 0))); net.mb = gB.map((b) => b.map(() => 0)); net.vb = gB.map((b) => b.map(() => 0)); }
    net.t++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8, c1 = 1 - Math.pow(b1, net.t), c2 = 1 - Math.pow(b2, net.t);
    const upd = (val, grad, M, V, idx) => { M[idx] = b1 * M[idx] + (1 - b1) * grad; V[idx] = b2 * V[idx] + (1 - b2) * grad * grad; return val - lr * (M[idx] / c1) / (Math.sqrt(V[idx] / c2) + eps); };
    for (let l = 0; l < net.W.length; l++)
      for (let j = 0; j < net.W[l].length; j++) {
        net.B[l][j] = upd(net.B[l][j], gB[l][j] / n, net.mb[l], net.vb[l], j);
        for (let i = 0; i < net.W[l][j].length; i++) net.W[l][j][i] = upd(net.W[l][j][i], gW[l][j][i] / n + lam * net.W[l][j][i], net.m[l][j], net.v[l][j], i);
      }
    return { loss: loss / n, shown };
  }

  // Loss and accuracy with every neuron awake (that is how dropout nets are used after training).
  function evaluate(net, pts) {
    let loss = 0, right = 0;
    for (const P of pts) {
      const q = clamp(predict(net, P.x, P.y), 1e-7, 1 - 1e-7);
      loss += -(P.c * Math.log(q) + (1 - P.c) * Math.log(1 - q));
      if ((q > 0.5 ? 1 : 0) === P.c) right++;
    }
    return { loss: loss / pts.length, acc: right / pts.length };
  }
  // Sum of squared weights (what weight decay pulls down).
  const weightSize = (net) => net.W.reduce((s, L) => s + L.reduce((t, row) => t + row.reduce((u, w) => u + w * w, 0), 0), 0);

  // A whole race in one go (used by tests): train both brains for `steps` and return the final scores.
  function race(seed, steps, opts) {
    const d = makeData(seed), sizes = opts.sizes || [2, 16, 16, 1], base = buildNet(sizes, seed + 7);
    const A = cloneNet(base), Bn = cloneNet(base), rA = rng(seed + 11), rB = rng(seed + 13);
    for (let s = 0; s < steps; s++) {
      trainStep(A, d.train, { lr: opts.lr, r: rA });
      trainStep(Bn, d.train, { lr: opts.lr, dropout: opts.dropout, decay: opts.decay, r: rB });
    }
    const out = (net) => { const tr = evaluate(net, d.train), te = evaluate(net, d.test); return { trainAcc: tr.acc, testAcc: te.acc, trainLoss: tr.loss, testLoss: te.loss, gap: te.loss - tr.loss }; };
    return { plain: out(A), nap: out(Bn) };
  }

  const core = { rng, border, makeData, buildNet, cloneNet, forward, predict, makeMasks, trainStep, evaluate, weightSize, race };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.DropoutCore = core;
})(typeof window !== "undefined" ? window : globalThis);
