// Steer the Drawing core: a tiny 2-D conditional DDPM with classifier-free guidance (CFG).
// Data: points forming labelled shapes. Denoiser ε̂(x_t, t, class | null) is a plain-JS MLP trained
// with Adam; the class label is randomly dropped to "null" so one network learns both the
// conditional and the unconditional model. Sampling mixes them: ε̃ = ε_u + w(ε_c − ε_u).
// Pure logic, seeded, runs in the browser and in Node. (Ideas from diff-train-core.js.)
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gaussFrom(r) {
    let spare = null;
    return () => {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0; while (u === 0) u = r();
      const v = r(), m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v);
    };
  }

  // ---------- noise schedule (linear β, T = 100) ----------
  function makeSchedule(T = 100, b0 = 1e-4, b1 = 0.08) {
    const beta = new Float64Array(T), alpha = new Float64Array(T), abar = new Float64Array(T);
    let p = 1;
    for (let t = 0; t < T; t++) { beta[t] = b0 + ((b1 - b0) * t) / (T - 1); alpha[t] = 1 - beta[t]; p *= alpha[t]; abar[t] = p; }
    return { T, beta, alpha, abar };
  }

  // ---------- the labelled shapes ----------
  const CLASSES = ["ring", "heart", "moons", "star"], K = CLASSES.length, SC = 1.4;
  const STAR = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.45 : 1, a = Math.PI / 2 + (i * Math.PI) / 5; return [r * Math.cos(a), r * Math.sin(a) - 0.05]; });
  function onSegment(pts, u) { // a point a fraction u of the way round a closed polygon outline
    const L = []; let tot = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); L.push(l); tot += l; }
    let d = u * tot, i = 0; while (i < L.length - 1 && d > L[i]) { d -= L[i]; i++; }
    const a = pts[i], b = pts[(i + 1) % pts.length], f = d / L[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  // one point of class c (outline shapes with a little thickness), in data units
  function samplePoint(c, r, g) {
    let x, y;
    if (c === 0) { const a = r() * 2 * Math.PI; x = 0.85 * Math.cos(a); y = 0.85 * Math.sin(a); }
    else if (c === 1) { const a = r() * 2 * Math.PI; x = (16 * Math.sin(a) ** 3) / 17; y = (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17 + 0.08; }
    else if (c === 2) { const a = r() * Math.PI, top = r() < 0.5; x = (top ? Math.cos(a) - 0.5 : 0.5 - Math.cos(a)) * 0.68; y = (top ? Math.sin(a) - 0.25 : 0.25 - Math.sin(a)) * 0.68; }
    else { [x, y] = onSegment(STAR, r()); }
    return [(x + g() * 0.035) * SC, (y + g() * 0.035) * SC];
  }
  function sampleClass(c, n, seed) {
    const r = rng(seed), g = gaussFrom(r), out = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) { const p = samplePoint(c, r, g); out[2 * i] = p[0]; out[2 * i + 1] = p[1]; }
    return out;
  }

  // ---------- inputs: (x, y) Fourier features + time embedding + class one-hot (all zero = null) ----------
  const XF = [1, 2, 4, 8], TF = [1, 2, 4, 8, 16, 32];
  const NFEAT = 2 + 4 * XF.length + 2 * TF.length + K;
  function features(x, y, t, T, cls, out, o) {
    out[o++] = x; out[o++] = y;
    for (const f of XF) { out[o++] = Math.sin(f * x); out[o++] = Math.cos(f * x); out[o++] = Math.sin(f * y); out[o++] = Math.cos(f * y); }
    const tt = t / T;
    for (const f of TF) { out[o++] = Math.sin(f * tt); out[o++] = Math.cos(f * tt); }
    for (let k = 0; k < K; k++) out[o++] = k === cls ? 1 : 0;
  }

  // ---------- MLP (ReLU), Adam ----------
  class MLP {
    constructor(sizes, seed) {
      const g = gaussFrom(rng(seed));
      this.sizes = sizes; this.L = sizes.length - 1; this.layers = []; this.step = 0; this.cap = 0;
      for (let l = 0; l < this.L; l++) {
        const nin = sizes[l], nout = sizes[l + 1], std = Math.sqrt(2 / nin) * (l === this.L - 1 ? 0.3 : 1), W = new Float32Array(nin * nout);
        for (let i = 0; i < W.length; i++) W[i] = g() * std;
        this.layers.push({ nin, nout, W, b: new Float32Array(nout), gW: new Float32Array(nin * nout), gb: new Float32Array(nout), mW: new Float64Array(nin * nout), vW: new Float64Array(nin * nout), mb: new Float64Array(nout), vb: new Float64Array(nout) });
      }
    }
    ensure(B) { if (B <= this.cap) return; this.cap = B; this.acts = this.sizes.map((s) => new Float32Array(B * s)); this.deltas = this.sizes.map((s) => new Float32Array(B * s)); }
    forward(X, B) {
      this.ensure(B); this.acts[0].set(X.subarray(0, B * this.sizes[0]));
      for (let l = 0; l < this.L; l++) {
        const { nin, nout, W, b } = this.layers[l], A = this.acts[l], Z = this.acts[l + 1], relu = l < this.L - 1;
        for (let n = 0; n < B; n++) {
          const ai = n * nin, zo = n * nout;
          for (let o = 0; o < nout; o++) { let s = b[o]; const wo = o * nin; for (let i = 0; i < nin; i++) s += W[wo + i] * A[ai + i]; Z[zo + o] = relu && s < 0 ? 0 : s; }
        }
      }
      return this.acts[this.L];
    }
    backward(dOut, B) {
      this.deltas[this.L].set(dOut.subarray(0, B * this.sizes[this.L]));
      for (let l = this.L - 1; l >= 0; l--) {
        const { nin, nout, W, gW, gb } = this.layers[l], A = this.acts[l], Dl = this.deltas[l + 1], DP = this.deltas[l];
        gW.fill(0); gb.fill(0); if (l > 0) DP.fill(0, 0, B * nin);
        for (let n = 0; n < B; n++) {
          const ai = n * nin, dn = n * nout;
          for (let o = 0; o < nout; o++) {
            const d = Dl[dn + o]; if (d === 0) continue;
            gb[o] += d; const wo = o * nin;
            for (let i = 0; i < nin; i++) gW[wo + i] += d * A[ai + i];
            if (l > 0) for (let i = 0; i < nin; i++) DP[ai + i] += d * W[wo + i];
          }
        }
        if (l > 0) for (let k = 0; k < B * nin; k++) if (A[k] <= 0) DP[k] = 0;
      }
    }
    adam(lr, clip = 1) {
      this.step++;
      let norm = 0; for (const L of this.layers) { for (const g of L.gW) norm += g * g; for (const g of L.gb) norm += g * g; }
      norm = Math.sqrt(norm);
      const sc = norm > clip ? clip / norm : 1, b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, this.step), c2 = 1 - Math.pow(b2, this.step);
      for (const L of this.layers) for (const [P, Gr, M, V] of [[L.W, L.gW, L.mW, L.vW], [L.b, L.gb, L.mb, L.vb]])
        for (let i = 0; i < P.length; i++) { const g = Gr[i] * sc; M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g; P[i] -= (lr * M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
      return norm;
    }
  }

  // ---------- conditional diffusion model with label dropout ----------
  class GuidedDiffusion {
    constructor({ hidden = 64, depth = 3, T = 100, seed = 1, batch = 128, pDrop = 0.2 } = {}) {
      this.sch = makeSchedule(T); this.T = T; this.batch = batch; this.pDrop = pDrop;
      this.net = new MLP([NFEAT, ...Array(depth).fill(hidden), 2], seed);
      this.r = rng(seed * 7 + 3); this.g = gaussFrom(this.r);
      this.data = CLASSES.map((_, c) => sampleClass(c, 1500, seed * 13 + c));
      this.X = new Float32Array(batch * NFEAT); this.eps = new Float32Array(batch * 2); this.dOut = new Float32Array(batch * 2);
      this.steps = 0;
    }
    // one Adam step on ‖ε − ε̂(√ᾱ x₀ + √(1−ᾱ) ε, t, c)‖², with c replaced by null with probability pDrop
    trainStep(lr = 0.003) {
      const B = this.batch, { abar } = this.sch;
      for (let k = 0; k < B; k++) {
        const c = Math.floor(this.r() * K), d = this.data[c], j = Math.floor(this.r() * (d.length / 2)), t = Math.floor(this.r() * this.T);
        const e1 = this.g(), e2 = this.g(), a = Math.sqrt(abar[t]), s = Math.sqrt(1 - abar[t]);
        this.eps[2 * k] = e1; this.eps[2 * k + 1] = e2;
        features(a * d[2 * j] + s * e1, a * d[2 * j + 1] + s * e2, t, this.T, this.r() < this.pDrop ? -1 : c, this.X, k * NFEAT);
      }
      const out = this.net.forward(this.X, B);
      let loss = 0;
      for (let k = 0; k < 2 * B; k++) { const d = out[k] - this.eps[k]; loss += d * d; this.dOut[k] = d / B; }
      this.net.backward(this.dOut, B); this.net.adam(lr); this.steps++;
      return loss / (2 * B);
    }
  }

  // ε̂ for many points at timestep t and class cls (−1 = null)
  function predictEps(net, pts, n, t, T, cls, out) {
    const CH = 256, X = new Float32Array(CH * NFEAT);
    for (let s = 0; s < n; s += CH) {
      const m = Math.min(CH, n - s);
      for (let k = 0; k < m; k++) features(pts[2 * (s + k)], pts[2 * (s + k) + 1], t, T, cls, X, k * NFEAT);
      out.set(net.forward(X, m).subarray(0, 2 * m), 2 * s);
    }
    return out;
  }

  // Ancestral DDPM sampler with CFG, advanced a slice at a time so the page never freezes.
  // frames[k] = all positions after k steps.
  class Sampler {
    constructor(model, n, cls, w, seed, nSteps = 50) {
      this.net = model.net; this.sch = model.sch; this.n = n; this.cls = cls; this.w = w;
      this.r = rng(seed); this.g = gaussFrom(this.r);
      const T = this.sch.T;
      this.ts = Array.from({ length: nSteps }, (_, k) => Math.round(((T - 1) * (nSteps - 1 - k)) / Math.max(1, nSteps - 1)));
      this.x = new Float32Array(2 * n); for (let i = 0; i < 2 * n; i++) this.x[i] = this.g();
      this.frames = [new Float32Array(this.x)];
      this.ec = new Float32Array(2 * n); this.eu = new Float32Array(2 * n); this.next = null;
      this.k = 0; this.cur = 0; this.done = false;
    }
    coef(k) {
      const t = this.ts[k], ab = this.sch.abar[t], abPrev = k + 1 < this.ts.length ? this.sch.abar[this.ts[k + 1]] : 1;
      const a = ab / abPrev, b = 1 - a, sig = k + 1 < this.ts.length ? Math.sqrt((b * (1 - abPrev)) / (1 - ab)) : 0;
      return { t, a, c: b / Math.sqrt(1 - ab), sig };
    }
    // move up to m dots; a full step completes after n/m calls
    stepPart(m) {
      if (this.done) return;
      const from = this.cur, to = Math.min(this.n, from + m), { t, a, c, sig } = this.coef(this.k), T = this.sch.T;
      if (!this.next) this.next = new Float32Array(this.x);
      const xs = this.x.subarray(2 * from, 2 * to);
      predictEps(this.net, xs, to - from, t, T, this.cls, this.ec.subarray(2 * from, 2 * to));
      if (this.w !== 1) predictEps(this.net, xs, to - from, t, T, -1, this.eu.subarray(2 * from, 2 * to));
      const sa = Math.sqrt(a);
      for (let i = 2 * from; i < 2 * to; i++) {
        const e = this.w === 1 ? this.ec[i] : this.eu[i] + this.w * (this.ec[i] - this.eu[i]);
        this.next[i] = (this.x[i] - c * e) / sa + (sig > 0 ? sig * this.g() : 0);
      }
      this.cur = to;
      if (to < this.n) return;
      this.x.set(this.next); this.next = null; this.cur = 0;
      this.frames.push(new Float32Array(this.x)); this.k++;
      if (this.k >= this.ts.length) this.done = true;
    }
    step() { do this.stepPart(this.n); while (this.cur); }
    run() { while (!this.done) this.step(); return this; }
  }

  // ---------- how good are the dots? ----------
  // onShape: share of dots within `tol` of some real point of the class (precision-like)
  // fills: share of real points with a dot within `tol` (coverage / diversity-like)
  // meanDist: mean distance from each dot to the nearest real point
  function quality(pts, data, tol = 0.12) {
    const n = pts.length / 2, m = data.length / 2;
    let on = 0, dist = 0;
    const hit = new Uint8Array(m);
    for (let i = 0; i < n; i++) {
      const x = pts[2 * i], y = pts[2 * i + 1];
      let best = Infinity, bj = -1;
      for (let j = 0; j < m; j++) { const dx = x - data[2 * j], dy = y - data[2 * j + 1], d = dx * dx + dy * dy; if (d < best) { best = d; bj = j; } }
      best = Math.sqrt(best); dist += Math.min(best, 3);
      if (best < tol) on++;
    }
    for (let j = 0; j < m; j++) {
      const x = data[2 * j], y = data[2 * j + 1];
      for (let i = 0; i < n; i++) { const dx = x - pts[2 * i], dy = y - pts[2 * i + 1]; if (dx * dx + dy * dy < tol * tol) { hit[j] = 1; break; } }
    }
    let f = 0; for (let j = 0; j < m; j++) f += hit[j];
    return { onShape: on / n, fills: f / m, meanDist: dist / n };
  }

  const core = { rng, gaussFrom, makeSchedule, CLASSES, K, SC, samplePoint, sampleClass, features, NFEAT, MLP, GuidedDiffusion, predictEps, Sampler, quality };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GuideCore = core;
})(typeof window !== "undefined" ? window : globalThis);
