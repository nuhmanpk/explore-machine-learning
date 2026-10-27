// Forger vs Detective: a tiny real GAN (2D points), plain JS, analytic backprop, seeded RNG.
(function (root) {
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gaussFrom(r) { let spare = null; return () => { if (spare !== null) { const s = spare; spare = null; return s; } let u = 0, v = 0; while (u < 1e-9) u = r(); v = r(); const m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); }; }

  // ---- datasets, coordinates roughly in [-1,1] ----
  const DATASETS = {
    ring: { name: "Ring", reliable: true, modes: 1 },
    moons: { name: "Two blobs", reliable: true, modes: 2 },
    heart: { name: "Heart", reliable: true, modes: 1 },
    spiral: { name: "Spiral", reliable: false, modes: 1 },
    blobs4: { name: "Four blobs", reliable: false, modes: 4 },
  };
  function sampleReal(name, n, r, g) {
    const out = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      let x, y;
      if (name === "ring") { const a = r() * 6.2832, rad = 0.7 + 0.04 * g(); x = rad * Math.cos(a); y = rad * Math.sin(a); }
      else if (name === "moons") { const c = r() < 0.5 ? -1 : 1; x = c * 0.55 + 0.09 * g(); y = 0.09 * g(); }
      else if (name === "blobs4") { const k = Math.floor(r() * 4), a = k * 1.5708 + 0.7854; x = 0.65 * Math.cos(a) + 0.07 * g(); y = 0.65 * Math.sin(a) + 0.07 * g(); }
      else if (name === "heart") { const t = r() * 6.2832; x = (16 * Math.pow(Math.sin(t), 3)) / 19 + 0.02 * g(); y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2) / 19 + 0.02 * g(); }
      else { const t = r(), a = t * 7.5, rad = 0.12 + 0.75 * t; x = rad * Math.cos(a) + 0.02 * g(); y = rad * Math.sin(a) + 0.02 * g(); }
      out[2 * i] = x; out[2 * i + 1] = y;
    }
    return out;
  }

  // ---- MLP with tanh hidden layers, Adam ----
  class Net {
    constructor(sizes, outAct, r, g) {
      this.sizes = sizes; this.outAct = outAct; this.L = sizes.length - 1;
      this.W = []; this.b = []; this.mW = []; this.vW = []; this.mb = []; this.vb = []; this.t = 0;
      for (let l = 0; l < this.L; l++) {
        const i = sizes[l], o = sizes[l + 1], s = Math.sqrt(1 / i);
        const w = new Float32Array(i * o); for (let k = 0; k < w.length; k++) w[k] = g() * s;
        this.W.push(w); this.b.push(new Float32Array(o));
        this.mW.push(new Float32Array(i * o)); this.vW.push(new Float32Array(i * o)); this.mb.push(new Float32Array(o)); this.vb.push(new Float32Array(o));
      }
    }
    forward(x, n) { // x: n*in; keeps activations
      this.n = n; this.A = [x];
      let a = x;
      for (let l = 0; l < this.L; l++) {
        const I = this.sizes[l], O = this.sizes[l + 1], W = this.W[l], b = this.b[l], y = new Float32Array(n * O);
        const last = l === this.L - 1;
        for (let s = 0; s < n; s++) for (let o = 0; o < O; o++) {
          let v = b[o]; for (let i = 0; i < I; i++) v += a[s * I + i] * W[i * O + o];
          if (!last) v = Math.tanh(v); else if (this.outAct === "sigmoid") v = 1 / (1 + Math.exp(-v)); else if (this.outAct === "tanh") v = Math.tanh(v);
          y[s * O + o] = v;
        }
        this.A.push(y); a = y;
      }
      return a;
    }
    // dOut = gradient wrt the POST-activation output; returns grad wrt input. accumulates into this.gW/gb
    backward(dOut) {
      const n = this.n; this.gW = this.W.map((w) => new Float32Array(w.length)); this.gb = this.b.map((b) => new Float32Array(b.length));
      let d = dOut;
      for (let l = this.L - 1; l >= 0; l--) {
        const I = this.sizes[l], O = this.sizes[l + 1], W = this.W[l], y = this.A[l + 1], x = this.A[l];
        const dz = new Float32Array(n * O);
        for (let k = 0; k < n * O; k++) {
          if (l === this.L - 1) dz[k] = this.outAct === "sigmoid" ? d[k] * y[k] * (1 - y[k]) : this.outAct === "tanh" ? d[k] * (1 - y[k] * y[k]) : d[k];
          else dz[k] = d[k] * (1 - y[k] * y[k]);
        }
        const dx = new Float32Array(n * I), gW = this.gW[l], gb = this.gb[l];
        for (let s = 0; s < n; s++) for (let o = 0; o < O; o++) {
          const g = dz[s * O + o]; gb[o] += g;
          for (let i = 0; i < I; i++) { gW[i * O + o] += x[s * I + i] * g; dx[s * I + i] += W[i * O + o] * g; }
        }
        d = dx;
      }
      return d;
    }
    adam(lr, b1 = 0.5, b2 = 0.999) {
      this.t++;
      const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
      for (let l = 0; l < this.L; l++) for (const [P, G, M, V] of [[this.W[l], this.gW[l], this.mW[l], this.vW[l]], [this.b[l], this.gb[l], this.mb[l], this.vb[l]]])
        for (let k = 0; k < P.length; k++) { const g = Math.max(-5, Math.min(5, G[k])); M[k] = b1 * M[k] + (1 - b1) * g; V[k] = b2 * V[k] + (1 - b2) * g * g; P[k] -= (lr * (M[k] / c1)) / (Math.sqrt(V[k] / c2) + 1e-8); }
    }
    clone() { const c = Object.create(Net.prototype); Object.assign(c, { sizes: this.sizes, outAct: this.outAct, L: this.L, W: this.W.map((w) => w.slice()), b: this.b.map((w) => w.slice()) }); return c; }
  }

  const ZD = 4;
  class GAN {
    // opts: seed, data, batch, gLr, dLr, dSteps, hidden, loss ('ns' non-saturating | 'sat' minimax), gSteps
    constructor(o = {}) {
      this.o = Object.assign({ seed: 1, data: "ring", batch: 64, gLr: 0.002, dLr: 0.002, dSteps: 1, hidden: 24, loss: "ns", dHidden: 24 }, o);
      this.r = mulberry(this.o.seed * 31 + 7); this.g = gaussFrom(this.r);
      this.G = new Net([ZD, this.o.hidden, this.o.hidden, 2], "linear", this.r, this.g);
      this.D = new Net([2, this.o.dHidden, this.o.dHidden, 1], "sigmoid", this.r, this.g);
      if (this.o.dInit && this.o.dInit !== 1) for (const w of [this.D.W[this.D.L - 1]]) for (let k = 0; k < w.length; k++) w[k] *= this.o.dInit;
      if (this.o.gOff) { this.G.b[this.G.L - 1][0] = this.o.gOff; this.G.b[this.G.L - 1][1] = this.o.gOff; }
      this.steps = 0; this.last = { dLoss: 0.69, gLoss: 0.69, dAcc: 0.5, gGrad: 1 };
    }
    noise(n) { const z = new Float32Array(n * ZD); for (let i = 0; i < z.length; i++) z[i] = this.g(); return z; }
    real(n) { return sampleReal(this.o.data, n, this.r, this.g); }
    forge(n, z) { return this.G.forward(z || this.noise(n), n).slice(); }
    detect(pts, n) { return this.D.forward(pts, n).slice(); }
    // detective step: show a batch of real + a batch of forged, nudge towards "real=1, fake=0"
    stepD() {
      const B = this.o.batch, real = this.real(B), fake = this.forge(B);
      const x = new Float32Array(4 * B); x.set(real); x.set(fake, 2 * B);
      const p = this.D.forward(x, 2 * B), d = new Float32Array(2 * B);
      let loss = 0, ok = 0;
      for (let i = 0; i < 2 * B; i++) {
        const y = i < B ? 1 : 0, pi = Math.min(1 - 1e-6, Math.max(1e-6, p[i]));
        loss -= y ? Math.log(pi) : Math.log(1 - pi);
        d[i] = (y ? -1 / pi : 1 / (1 - pi)) / (2 * B);
        if ((p[i] > 0.5) === !!y) ok++;
      }
      this.D.backward(d); this.D.adam(this.o.dLr);
      this.last.dLoss = loss / (2 * B); this.last.dAcc = ok / (2 * B);
      return this.last;
    }
    // forger step: make the detective say "real" for forged points; gradient flows back through D into G
    stepG() {
      const B = this.o.batch, z = this.noise(B), f = this.G.forward(z, B), p = this.D.forward(f, B), d = new Float32Array(B);
      let loss = 0;
      for (let i = 0; i < B; i++) {
        const pi = Math.min(1 - 1e-6, Math.max(1e-6, p[i]));
        if (this.o.loss === "ns") { loss -= Math.log(pi); d[i] = -1 / pi / B; } else { loss += Math.log(1 - pi); d[i] = (-1 / (1 - pi)) / B; } // saturating: minimise log(1-D)
      }
      const dIn = this.D.backward(d); // D's grads are discarded (not applied)
      let gg = 0; for (let i = 0; i < dIn.length; i++) gg += dIn[i] * dIn[i];
      this.G.backward(dIn); this.G.adam(this.o.gLr);
      this.last.gLoss = loss / B; this.last.gGrad = Math.sqrt(gg / B) * B; // size of the "which way to move" push per forged dot
      return this.last;
    }
    // which way would each point move to look MORE real to the detective? (gradient of D wrt the point)
    hint(pts, n) { this.D.forward(pts, n); const d = new Float32Array(n).fill(1); return this.D.backward(d); }
    step() { this.credit = (this.credit || 0) + this.o.dSteps; while (this.credit >= 1) { this.stepD(); this.credit -= 1; } this.stepG(); this.steps++; return this.last; }
  }

  // ---- metrics ----
  function nearestDist(a, na, b, nb) { // mean distance from each a-point to nearest b-point
    let s = 0;
    for (let i = 0; i < na; i++) { let m = 1e9; for (let j = 0; j < nb; j++) { const dx = a[2 * i] - b[2 * j], dy = a[2 * i + 1] - b[2 * j + 1], d = dx * dx + dy * dy; if (d < m) m = d; } s += Math.sqrt(m); }
    return s / na;
  }
  function coverage(fake, nf, real, nr, rad = 0.12) { // fraction of real points that have a forged point within rad
    let c = 0;
    for (let j = 0; j < nr; j++) { let hit = false; for (let i = 0; i < nf && !hit; i++) { const dx = fake[2 * i] - real[2 * j], dy = fake[2 * i + 1] - real[2 * j + 1]; if (dx * dx + dy * dy < rad * rad) hit = true; } if (hit) c++; }
    return c / nr;
  }
  function metrics(gan, nf = 200, nr = 200) {
    const f = gan.forge(nf), r = sampleReal(gan.o.data, nr, mulberry(99), gaussFrom(mulberry(98)));
    return { dist: nearestDist(f, nf, r, nr), cover: coverage(f, nf, r, nr) };
  }
  const CENTERS = { moons: [[-0.55, 0], [0.55, 0]], blobs4: [[0.46, 0.46], [-0.46, 0.46], [-0.46, -0.46], [0.46, -0.46]] };
  // how many of the real blobs have at least 4% of the forged dots sitting in them (null if not a blob dataset)
  function modesHit(name, fake, nf) {
    const cs = CENTERS[name]; if (!cs) return null;
    let hit = 0;
    for (const c of cs) { let k = 0; for (let i = 0; i < nf; i++) if (Math.hypot(fake[2 * i] - c[0], fake[2 * i + 1] - c[1]) < 0.22) k++; if (k >= 0.04 * nf) hit++; }
    return hit;
  }
  // Follows one GAN run: fixed noise + fixed real reference so the numbers move smoothly, and spots famous problems.
  class Tracker {
    constructor(gan) {
      this.gan = gan; this.z = gan.noise(150);
      const mk = (seed) => [mulberry(seed), gaussFrom(mulberry(seed + 1))];
      let [r, g] = mk(99); this.ref = sampleReal(gan.o.data, 200, r, g);
      [r, g] = mk(11); this.realView = sampleReal(gan.o.data, 150, r, g);
      this.total = (CENTERS[gan.o.data] || []).length || null;
      this.ema = 0.5; this.hist = []; this.marks = []; this.fake = gan.forge(150, this.z);
    }
    has(t) { return this.marks.some((m) => m.type === t); }
    refresh() { this.fake = this.gan.forge(150, this.z); return this.fake; }
    tick() {
      const g = this.gan; this.ema = this.ema * 0.97 + g.last.dAcc * 0.03;
      if (g.steps === 0 || g.steps % 10 !== 0 || (this.hist.length && this.hist[this.hist.length - 1].s === g.steps)) return null;
      const f = this.refresh();
      const e = { s: g.steps, acc: this.ema, dist: nearestDist(f, 150, this.ref, 200), cover: coverage(f, 150, this.ref, 200), modes: modesHit(g.o.data, f, 150) };
      this.hist.push(e);
      const h = this.hist, back = h.length > 10 ? h[h.length - 11] : null, add = [];
      const push = (type) => { this.marks.push({ type, s: g.steps }); add.push(type); };
      if (!this.has("stuck") && e.s >= 150 && e.acc > 0.78 && e.dist > 0.8 && back && e.dist > 0.7 * back.dist) push("stuck");
      if (!this.has("collapse") && e.s >= 1200 && this.total && h.length >= 5 && h.slice(-5).every((x) => x.modes <= this.total / 2)) push("collapse");
      if (!this.has("wander") && !this.has("stuck") && e.s >= 150 && e.dist > 1.5 && e.acc <= 0.78) push("wander");
      if (this.has("stuck") && !this.has("recovered") && e.dist < 0.3) push("recovered");
      if (!this.has("fooled") && e.s >= 100 && e.dist < 0.1 && e.acc < 0.68 && (this.total === null || e.modes === this.total)) push("fooled");
      return { entry: e, marks: add };
    }
  }
  const api = { Tracker, modesHit, CENTERS, mulberry, gaussFrom, DATASETS, sampleReal, Net, GAN, metrics, nearestDist, coverage, ZD };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GanCore = api;
})(typeof window !== "undefined" ? window : globalThis);
