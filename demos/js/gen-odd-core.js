// Spot the Stranger: autoencoder reconstruction error as an oddness score.
// Pure logic (no DOM): real small neural nets, trained with backprop + Adam on procedural 8x8 pictures. Runs in Node and the browser.
(function (root) {
  // ---------- shared tiny-neural-net toolkit (8x8 pictures) ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const randn = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const KINDS = [
    { id: "square", name: "Square" }, { id: "ring", name: "Ring" }, { id: "plus", name: "Plus" },
    { id: "diag", name: "Slash" }, { id: "tri", name: "Triangle" }, { id: "stripes", name: "Stripes" },
  ];
  const kindIndex = (id) => KINDS.findIndex((k) => k.id === id);
  // a procedurally drawn 8x8 picture (values 0..1) of the given kind, with random size/position/brightness
  function makePic(kind, r) {
    const g = new Float64Array(64), set = (x, y) => { if (x >= 0 && x < 8 && y >= 0 && y < 8) g[y * 8 + x] = 1; };
    const ri = (n) => Math.floor(r() * n);
    if (kind === "square") { const s = 3 + ri(3), ox = ri(9 - s), oy = ri(9 - s); for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) set(ox + x, oy + y); }
    else if (kind === "ring") { const s = 4 + ri(3), ox = ri(9 - s), oy = ri(9 - s); for (let i = 0; i < s; i++) { set(ox + i, oy); set(ox + i, oy + s - 1); set(ox, oy + i); set(ox + s - 1, oy + i); } }
    else if (kind === "plus") { const a = 1 + ri(2), cx = a + ri(8 - 2 * a), cy = a + ri(8 - 2 * a); for (let i = -a; i <= a; i++) { set(cx + i, cy); set(cx, cy + i); } }
    else if (kind === "diag") { const off = ri(3) - 1, flip = r() < 0.5; for (let i = 0; i < 8; i++) set(flip ? 7 - i : i, i + off); }
    else if (kind === "tri") { const h = 3 + ri(2), ox = ri(9 - (2 * h - 1)), oy = ri(9 - h); for (let i = 0; i < h; i++) for (let x = h - 1 - i; x <= h - 1 + i; x++) set(ox + x, oy + i); }
    else { const p = ri(2); for (let y = p; y < 8; y += 2) for (let x = 0; x < 8; x++) set(x, y); }
    const br = 0.85 + 0.15 * r();
    for (let i = 0; i < 64; i++) g[i] = clamp(g[i] * br + 0.04 * randn(r), 0, 1);
    return g;
  }
  // n pictures cycling through the given kinds: [{x, kind}]
  function makeSet(seed, n, kinds) {
    const r = rng(seed), out = [], ks = kinds || KINDS.map((k) => k.id);
    for (let i = 0; i < n; i++) { const kind = ks[i % ks.length]; out.push({ x: makePic(kind, r), kind }); }
    return out;
  }
  const ACT = {
    tanh: [Math.tanh, (y) => 1 - y * y],
    sig: [(z) => 1 / (1 + Math.exp(-z)), (y) => y * (1 - y)],
    lin: [(z) => z, () => 1],
  };
  // One fully connected layer with its own Adam optimiser.
  class Dense {
    constructor(i, o, act, r) {
      this.i = i; this.o = o; this.f = ACT[act][0]; this.d = ACT[act][1];
      const lim = Math.sqrt(6 / (i + o));
      this.W = new Float64Array(i * o).map(() => (r() * 2 - 1) * lim); this.b = new Float64Array(o);
      this.gW = new Float64Array(i * o); this.gb = new Float64Array(o);
      this.mW = new Float64Array(i * o); this.vW = new Float64Array(i * o); this.mb = new Float64Array(o); this.vb = new Float64Array(o); this.t = 0;
      this.x = null; this.y = new Float64Array(o);
    }
    forward(x) {
      this.x = x; const { i, o, W, b, y } = this;
      for (let j = 0; j < o; j++) { let s = b[j]; const k0 = j * i; for (let k = 0; k < i; k++) s += W[k0 + k] * x[k]; y[j] = this.f(s); }
      return y;
    }
    backward(dy) {
      const { i, o, W, gW, gb, x, y } = this, dx = new Float64Array(i);
      for (let j = 0; j < o; j++) { const dz = dy[j] * this.d(y[j]); gb[j] += dz; const k0 = j * i; for (let k = 0; k < i; k++) { gW[k0 + k] += dz * x[k]; dx[k] += W[k0 + k] * dz; } }
      return dx;
    }
    step(lr, n) {
      this.t++; const c1 = 1 - Math.pow(0.9, this.t), c2 = 1 - Math.pow(0.999, this.t);
      const upd = (p, g, m, v) => { for (let q = 0; q < p.length; q++) { const gg = g[q] / n; m[q] = 0.9 * m[q] + 0.1 * gg; v[q] = 0.999 * v[q] + 0.001 * gg * gg; p[q] -= lr * (m[q] / c1) / (Math.sqrt(v[q] / c2) + 1e-8); g[q] = 0; } };
      upd(this.W, this.gW, this.mW, this.vW); upd(this.b, this.gb, this.mb, this.vb);
    }
  }
  const sq = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; };
  // Plain autoencoder: 64 -> hid -> k (the bottleneck) -> hid -> 64.
  class AE {
    constructor(k, seed, hid) {
      const r = rng(seed); this.k = k; hid = hid || 24; this.steps = 0; this.r = r;
      this.e1 = new Dense(64, hid, "tanh", r); this.e2 = new Dense(hid, k, "lin", r);
      this.d1 = new Dense(k, hid, "tanh", r); this.d2 = new Dense(hid, 64, "sig", r);
      this.layers = [this.e1, this.e2, this.d1, this.d2];
    }
    encode(x) { return Float64Array.from(this.e2.forward(this.e1.forward(x))); }
    decode(z) { return Float64Array.from(this.d2.forward(this.d1.forward(z))); }
    recon(x) { return this.decode(this.encode(x)); }
    mse(x) { return sq(this.recon(x), x) / 64; }
    meanMse(set) { let s = 0; for (const p of set) s += this.mse(p.x); return set.length ? s / set.length : 0; }
    // one Adam step on a random mini-batch of the data; returns the batch's mean MSE
    train(data, batch, lr) {
      let tot = 0;
      for (let b = 0; b < batch; b++) {
        const x = data[Math.floor(this.r() * data.length)].x, y = this.recon(x), dy = new Float64Array(64);
        for (let i = 0; i < 64; i++) { const d = y[i] - x[i]; tot += d * d; dy[i] = (2 * d) / 64; }
        let g = this.d2.backward(dy); g = this.d1.backward(g); g = this.e2.backward(g); this.e1.backward(g);
      }
      for (const L of this.layers) L.step(lr, batch);
      this.steps++; return tot / (batch * 64);
    }
  }
  // Train on one kind only; test on 30 of that kind (normal) plus 30 of the others (strangers).
  function setup(normal, seed) {
    const others = KINDS.map((k) => k.id).filter((k) => k !== normal);
    return { train: makeSet(seed, 150, [normal]), test: makeSet(seed + 5, 30, [normal]).map((p) => ({ ...p, stranger: false })).concat(makeSet(seed + 9, 30, others).map((p) => ({ ...p, stranger: true }))) };
  }
  // reconstruction error of every test picture
  function errors(ae, test) { return test.map((p) => ae.mse(p.x)); }
  // flag a picture as a stranger when its error is above thr
  function confusion(errs, test, thr) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    errs.forEach((e, i) => { const flag = e > thr, s = test[i].stranger; if (flag && s) tp++; else if (flag) fp++; else if (s) fn++; else tn++; });
    return { tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 0, f1: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 0 };
  }

  const core = { rng, randn, clamp, KINDS, kindIndex, makePic, makeSet, sq, Dense, AE, setup, errors, confusion };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GenOddCore = core;
})(typeof window !== "undefined" ? window : globalThis);
