// Make New Pictures: a variational autoencoder (noise + KL).
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
  // Variational autoencoder with a 2-number latent. Loss = squared error + beta * KL.
  class VAE {
    constructor(k, seed, hid, beta) {
      const r = rng(seed); this.k = k; hid = hid || 32; this.beta = beta; this.steps = 0; this.r = r;
      this.e1 = new Dense(64, hid, "tanh", r); this.mu = new Dense(hid, k, "lin", r); this.lv = new Dense(hid, k, "lin", r);
      this.d1 = new Dense(k, hid, "tanh", r); this.d2 = new Dense(hid, 64, "sig", r);
      this.layers = [this.e1, this.mu, this.lv, this.d1, this.d2];
    }
    encode(x) { const h = this.e1.forward(x); return { mu: Float64Array.from(this.mu.forward(h)), lv: Float64Array.from(this.lv.forward(h)) }; }
    decode(z) { return Float64Array.from(this.d2.forward(this.d1.forward(z))); }
    recon(x) { return this.decode(this.encode(x).mu); }
    // returns {rec, kl} summed over one picture; pass train=true to also accumulate gradients
    pass(x, train) {
      const h = this.e1.forward(x), mu = this.mu.forward(h).slice(), lv0 = this.lv.forward(h), k = this.k;
      const lv = new Float64Array(k), eps = new Float64Array(k), z = new Float64Array(k); let kl = 0;
      for (let j = 0; j < k; j++) { lv[j] = clamp(lv0[j], -8, 4); eps[j] = randn(this.r); z[j] = mu[j] + Math.exp(0.5 * lv[j]) * eps[j]; kl += -0.5 * (1 + lv[j] - mu[j] * mu[j] - Math.exp(lv[j])); }
      const y = this.d2.forward(this.d1.forward(z)); let rec = 0; const dy = new Float64Array(64);
      for (let i = 0; i < 64; i++) { const d = y[i] - x[i]; rec += d * d; dy[i] = 2 * d; }
      if (train) {
        const dz = this.d1.backward(this.d2.backward(dy)), dmu = new Float64Array(k), dlv = new Float64Array(k), b = this.beta;
        for (let j = 0; j < k; j++) { const s = Math.exp(0.5 * lv[j]); dmu[j] = dz[j] + b * mu[j]; dlv[j] = dz[j] * eps[j] * 0.5 * s + b * 0.5 * (Math.exp(lv[j]) - 1); }
        // the two encoder heads both feed the shared first layer
        const gh = this.mu.backward(dmu), gl = this.lv.backward(dlv), gs = new Float64Array(gh.length);
        for (let i = 0; i < gs.length; i++) gs[i] = gh[i] + gl[i];
        this.e1.backward(gs);
      }
      return { rec, kl };
    }
    train(data, batch, lr) {
      let rec = 0, kl = 0;
      for (let b = 0; b < batch; b++) { const o = this.pass(data[Math.floor(this.r() * data.length)].x, true); rec += o.rec; kl += o.kl; }
      for (const L of this.layers) L.step(lr, batch);
      this.steps++; return { rec: rec / batch, kl: kl / batch };
    }
    // random brand-new pictures: z ~ N(0, 1), decoded
    sample(r) { const z = new Float64Array(this.k).map(() => randn(r)); return { z, x: this.decode(z) }; }
  }
  const BETAS = [0, 0.01, 0.03, 0.1, 0.3, 1, 3];
  function dataset(seed) { return { train: makeSet(seed, 360), test: makeSet(seed + 7, 60) }; }
  // Make n brand-new pictures from random points and judge them honestly:
  // junk = looks unlike every picture it learned from (nearest real picture is far away); sharp = how crisp (not grey) the pixels are.
  function judge(vae, train, seed, n) {
    const r = rng(seed), items = []; let junk = 0, sharp = 0;
    for (let i = 0; i < n; i++) {
      const s = vae.sample(r); let md = 1e9;
      for (const p of train) md = Math.min(md, sq(p.x, s.x) / 64);
      let sh = 0; for (const v of s.x) sh += Math.abs(v - 0.5) * 2;
      const isJunk = md > 0.05; if (isJunk) junk++; sharp += sh / 64;
      items.push({ z: s.z, x: s.x, junk: isJunk, dist: md });
    }
    return { junk: junk / n, sharp: sharp / n, items };
  }
  // map window: where the encoder put real pictures, and where random samples (a standard bell curve) land
  function atlas(vae, set) {
    let m = 3;
    for (const p of set) { const e = vae.encode(p.x).mu; m = Math.max(m, Math.abs(e[0]) * 1.1, Math.abs(e[1]) * 1.1); }
    return { x0: -m, x1: m, y0: -m, y1: m };
  }

  const core = { rng, randn, clamp, KINDS, kindIndex, makePic, makeSet, sq, Dense, VAE, BETAS, dataset, judge, atlas };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GenVaeCore = core;
})(typeof window !== "undefined" ? window : globalThis);
