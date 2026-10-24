// Tiny DDPM in plain JS: 2D datasets, an MLP noise-predictor trained with Adam,
// and an ancestral sampler. Runs in the browser and in Node (for testing).
(function (root) {
  // ---------- RNG ----------
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussFrom(r) {
    let spare = null;
    return function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0; while (u === 0) u = r();
      const v = r(), m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    };
  }

  // ---------- noise schedule (linear β) ----------
  function makeSchedule(T = 100, b0 = 1e-4, b1 = 0.08) {
    const beta = new Float64Array(T), alpha = new Float64Array(T), abar = new Float64Array(T);
    let p = 1;
    for (let t = 0; t < T; t++) {
      beta[t] = b0 + ((b1 - b0) * t) / (T - 1);
      alpha[t] = 1 - beta[t];
      p *= alpha[t];
      abar[t] = p;
    }
    return { T, beta, alpha, abar };
  }

  // ---------- datasets (all analytic, data scaled to about [-1.4, 1.4]) ----------
  const SC = 1.4;
  function inPoly(x, y, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const STAR = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.42 : 1, a = Math.PI / 2 + (i * Math.PI) / 5;
    return [r * Math.cos(a), r * Math.sin(a) - 0.06];
  });
  function distToArc(x, y, cx, cy, r, a0, a1) {
    const a = Math.atan2(y - cy, x - cx);
    let aa = a;
    while (aa < a0) aa += 2 * Math.PI;
    if (aa <= a1) return Math.abs(Math.hypot(x - cx, y - cy) - r);
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    return Math.min(Math.hypot(x - p0[0], y - p0[1]), Math.hypot(x - p1[0], y - p1[1]));
  }
  // Region tests on [-1,1]²; "rejection" datasets sample uniformly inside.
  const REGIONS = {
    heart: (x, y) => { const u = x * 1.1, v = (y - 0.12) * 1.1; return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0; },
    star: (x, y) => inPoly(x, y, STAR),
    smiley: (x, y) => {
      const r = Math.hypot(x, y);
      if (r > 0.8 && r < 0.97) return true;
      if (Math.hypot(x + 0.32, y - 0.28) < 0.13 || Math.hypot(x - 0.32, y - 0.28) < 0.13) return true;
      return distToArc(x, y, 0, 0.05, 0.5, Math.PI * 1.15, Math.PI * 1.85) < 0.08;
    },
  };
  function sampleDataset(name, n, r, strokes) {
    const out = new Float32Array(n * 2);
    const g = gaussFrom(r);
    if (REGIONS[name]) {
      for (let i = 0; i < n; ) {
        const x = r() * 2 - 1, y = r() * 2 - 1;
        if (REGIONS[name](x, y)) { out[2 * i] = x * SC; out[2 * i + 1] = y * SC; i++; }
      }
    } else if (name === "spiral") {
      for (let i = 0; i < n; i++) {
        const u = Math.sqrt(r()), th = u * 4.5 * Math.PI, rad = 0.08 + 0.9 * u;
        out[2 * i] = (rad * Math.cos(th) + g() * 0.025) * SC;
        out[2 * i + 1] = (rad * Math.sin(th) + g() * 0.025) * SC;
      }
    } else if (name === "moons") {
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI, top = r() < 0.5;
        const x = top ? Math.cos(a) - 0.5 : 0.5 - Math.cos(a), y = top ? Math.sin(a) - 0.2 : 0.2 - Math.sin(a);
        out[2 * i] = (x * 0.62 + g() * 0.03) * SC;
        out[2 * i + 1] = (y * 0.62 + g() * 0.03) * SC;
      }
    } else if (name === "draw" && strokes && strokes.length) {
      // sample along the drawn polylines (by length), with a little thickness
      const segs = [];
      let total = 0;
      for (const s of strokes) {
        if (s.length === 1) { segs.push([s[0], s[0], 0.01]); total += 0.01; }
        for (let k = 1; k < s.length; k++) {
          const L = Math.hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]) + 1e-4;
          segs.push([s[k - 1], s[k], L]); total += L;
        }
      }
      for (let i = 0; i < n; i++) {
        let pick = r() * total, j = 0;
        while (j < segs.length - 1 && pick > segs[j][2]) { pick -= segs[j][2]; j++; }
        const [a, b] = segs[j], f = r();
        out[2 * i] = (a[0] + (b[0] - a[0]) * f + g() * 0.03) * SC;
        out[2 * i + 1] = (a[1] + (b[1] - a[1]) * f + g() * 0.03) * SC;
      }
    }
    return out;
  }

  // ---------- features: Fourier features of (x, y) + sinusoidal time embedding ----------
  const XF = [1, 2, 4, 8], TF = [1, 2, 4, 8, 16, 32];
  const NFEAT = 2 + 2 * 2 * XF.length + 2 * TF.length;
  function features(x, y, t, T, out, o) {
    out[o++] = x; out[o++] = y;
    for (const f of XF) {
      out[o++] = Math.sin(f * x); out[o++] = Math.cos(f * x);
      out[o++] = Math.sin(f * y); out[o++] = Math.cos(f * y);
    }
    const tt = t / T;
    for (const f of TF) { out[o++] = Math.sin(f * tt); out[o++] = Math.cos(f * tt); }
  }

  // ---------- MLP with ReLU hidden layers, Adam ----------
  class MLP {
    constructor(sizes, seed = 1) {
      const r = gaussFrom(mulberry(seed));
      this.sizes = sizes;
      this.L = sizes.length - 1;
      this.layers = [];
      for (let l = 0; l < this.L; l++) {
        const nin = sizes[l], nout = sizes[l + 1], std = Math.sqrt(2 / nin) * (l === this.L - 1 ? 0.3 : 1);
        const W = new Float32Array(nin * nout);
        for (let i = 0; i < W.length; i++) W[i] = r() * std;
        this.layers.push({
          nin, nout, W, b: new Float32Array(nout),
          gW: new Float32Array(nin * nout), gb: new Float32Array(nout),
          mW: new Float32Array(nin * nout), vW: new Float32Array(nin * nout),
          mb: new Float32Array(nout), vb: new Float32Array(nout),
        });
      }
      this.step = 0;
      this.cap = 0;
    }
    ensure(B) {
      if (B <= this.cap) return;
      this.cap = B;
      this.acts = this.sizes.map((s) => new Float32Array(B * s));
      this.deltas = this.sizes.map((s) => new Float32Array(B * s));
    }
    forward(X, B) {
      this.ensure(B);
      this.acts[0].set(X.subarray(0, B * this.sizes[0]));
      for (let l = 0; l < this.L; l++) {
        const { nin, nout, W, b } = this.layers[l];
        const A = this.acts[l], Z = this.acts[l + 1], relu = l < this.L - 1;
        for (let n = 0; n < B; n++) {
          const ai = n * nin, zo = n * nout;
          for (let o = 0; o < nout; o++) {
            let s = b[o];
            const wo = o * nin;
            for (let i = 0; i < nin; i++) s += W[wo + i] * A[ai + i];
            Z[zo + o] = relu && s < 0 ? 0 : s;
          }
        }
      }
      return this.acts[this.L];
    }
    // dOut: dLoss/dOutput (B × nout). Accumulates grads (zeroed here).
    backward(dOut, B) {
      this.deltas[this.L].set(dOut.subarray(0, B * this.sizes[this.L]));
      for (let l = this.L - 1; l >= 0; l--) {
        const { nin, nout, W, gW, gb } = this.layers[l];
        const A = this.acts[l], D = this.deltas[l + 1], DP = this.deltas[l];
        gW.fill(0); gb.fill(0);
        if (l > 0) DP.fill(0, 0, B * nin);
        for (let n = 0; n < B; n++) {
          const ai = n * nin, dn = n * nout;
          for (let o = 0; o < nout; o++) {
            const d = D[dn + o];
            if (d === 0) continue;
            gb[o] += d;
            const wo = o * nin;
            for (let i = 0; i < nin; i++) gW[wo + i] += d * A[ai + i];
            if (l > 0) for (let i = 0; i < nin; i++) DP[ai + i] += d * W[wo + i];
          }
        }
        if (l > 0) { // ReLU derivative of layer l's output
          for (let k = 0; k < B * nin; k++) if (A[k] <= 0) DP[k] = 0;
        }
      }
    }
    adam(lr, clip = 1) {
      this.step++;
      let norm = 0;
      for (const L of this.layers) { for (const g of L.gW) norm += g * g; for (const g of L.gb) norm += g * g; }
      norm = Math.sqrt(norm);
      const sc = norm > clip ? clip / norm : 1;
      const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      const c1 = 1 - Math.pow(b1, this.step), c2 = 1 - Math.pow(b2, this.step);
      for (const L of this.layers) {
        for (const [P, G, M, V] of [[L.W, L.gW, L.mW, L.vW], [L.b, L.gb, L.mb, L.vb]]) {
          for (let i = 0; i < P.length; i++) {
            const g = G[i] * sc;
            M[i] = b1 * M[i] + (1 - b1) * g;
            V[i] = b2 * V[i] + (1 - b2) * g * g;
            P[i] -= (lr * (M[i] / c1)) / (Math.sqrt(V[i] / c2) + eps);
          }
        }
      }
      return norm;
    }
    clone() {
      const m = Object.create(MLP.prototype);
      m.sizes = this.sizes; m.L = this.L; m.step = this.step; m.cap = 0;
      m.layers = this.layers.map((L) => ({ nin: L.nin, nout: L.nout, W: new Float32Array(L.W), b: new Float32Array(L.b) }));
      return m;
    }
  }

  // ---------- the diffusion model ----------
  class Diffusion {
    constructor({ hidden = 64, depth = 3, T = 100, seed = 1, batch = 128 } = {}) {
      this.sch = makeSchedule(T);
      this.T = T;
      this.batch = batch;
      this.net = new MLP([NFEAT, ...Array(depth).fill(hidden), 2], seed);
      this.r = mulberry(seed * 7 + 3);
      this.g = gaussFrom(this.r);
      this.X = new Float32Array(batch * NFEAT);
      this.eps = new Float32Array(batch * 2);
      this.dOut = new Float32Array(batch * 2);
      this.steps = 0;
    }
    // One SGD step of the DDPM "simple" loss: ‖ε − ε̂(√ᾱ x₀ + √(1−ᾱ) ε, t)‖².
    trainStep(data, lr) {
      const B = this.batch, n = data.length / 2, { abar } = this.sch;
      for (let k = 0; k < B; k++) {
        const j = Math.floor(this.r() * n), t = Math.floor(this.r() * this.T);
        const e1 = this.g(), e2 = this.g();
        const a = Math.sqrt(abar[t]), s = Math.sqrt(1 - abar[t]);
        this.eps[2 * k] = e1; this.eps[2 * k + 1] = e2;
        features(a * data[2 * j] + s * e1, a * data[2 * j + 1] + s * e2, t, this.T, this.X, k * NFEAT);
      }
      const out = this.net.forward(this.X, B);
      let loss = 0;
      for (let k = 0; k < 2 * B; k++) {
        const d = out[k] - this.eps[k];
        loss += d * d;
        this.dOut[k] = (2 * d) / (2 * B);
      }
      this.net.backward(this.dOut, B);
      this.net.adam(lr);
      this.steps++;
      return loss / (2 * B);
    }
  }

  // Predict ε for many points at one timestep (net may be a snapshot).
  function predictEps(net, pts, n, t, T, out) {
    const CH = 256, X = new Float32Array(CH * NFEAT);
    for (let s = 0; s < n; s += CH) {
      const m = Math.min(CH, n - s);
      for (let k = 0; k < m; k++) features(pts[2 * (s + k)], pts[2 * (s + k) + 1], t, T, X, k * NFEAT);
      const y = MLP.prototype.forward.call(net, X, m);
      out.set(y.subarray(0, 2 * m), 2 * s);
    }
    return out;
  }

  // Ancestral DDPM sampler that can be advanced one step at a time (so the UI never freezes).
  // nSteps < T uses a respaced (strided) schedule. frames[k] = positions after k steps.
  class Sampler {
    constructor(net, sch, n, seed, nSteps = sch.T) {
      this.net = net; this.sch = sch; this.n = n;
      this.r = mulberry(seed); this.g = gaussFrom(this.r);
      const T = sch.T;
      this.ts = Array.from({ length: nSteps }, (_, k) => Math.round(((T - 1) * (nSteps - 1 - k)) / Math.max(1, nSteps - 1)));
      if (nSteps === 1) this.ts = [T - 1];
      this.x = new Float32Array(2 * n);
      for (let i = 0; i < 2 * n; i++) this.x[i] = this.g();
      this.frames = [new Float32Array(this.x)];
      this.eps = new Float32Array(2 * n);
      this.k = 0;
      this.done = false;
    }
    // Coefficients for the step at index k: from t = ts[k] to s = ts[k+1] (or to clean data).
    coef(k) {
      const t = this.ts[k], ab = this.sch.abar[t];
      const abPrev = k + 1 < this.ts.length ? this.sch.abar[this.ts[k + 1]] : 1;
      const a = ab / abPrev, b = 1 - a;
      const sig = k + 1 < this.ts.length ? Math.sqrt((b * (1 - abPrev)) / (1 - ab)) : 0;
      return { t, a, b, c: b / Math.sqrt(1 - ab), sig, ab };
    }
    step() {
      if (this.done) return;
      const { t, a, c, sig } = this.coef(this.k);
      predictEps(this.net, this.x, this.n, t, this.sch.T, this.eps);
      const sa = Math.sqrt(a), x = this.x, e = this.eps;
      for (let i = 0; i < 2 * this.n; i++) x[i] = (x[i] - c * e[i]) / sa + (sig > 0 ? sig * this.g() : 0);
      this.frames.push(new Float32Array(x));
      this.k++;
      if (this.k >= this.ts.length) this.done = true;
    }
    // Same as step(), but only moves `m` dots per call, so a page can spread one
    // step over several frames and never stutter. A full step finishes after n/m calls.
    stepPart(m) {
      if (this.done) return;
      const from = this.cur || 0, to = Math.min(this.n, from + m);
      if (!this.next) this.next = new Float32Array(this.x);
      const { t, a, c, sig } = this.coef(this.k);
      const xs = this.x.subarray(2 * from, 2 * to), es = this.eps.subarray(2 * from, 2 * to);
      predictEps(this.net, xs, to - from, t, this.sch.T, es);
      const sa = Math.sqrt(a);
      for (let i = 2 * from; i < 2 * to; i++) this.next[i] = (this.x[i] - c * this.eps[i]) / sa + (sig > 0 ? sig * this.g() : 0);
      this.cur = to;
      if (to < this.n) return;
      this.x.set(this.next);
      this.next = null;
      this.cur = 0;
      this.frames.push(new Float32Array(this.x));
      this.k++;
      if (this.k >= this.ts.length) this.done = true;
    }
  }
  function sample(net, sch, n, seed, nSteps) {
    const s = new Sampler(net, sch, n, seed, nSteps);
    while (!s.done) s.step();
    return s;
  }

  // How well points match the data: overlap of 12×12 histograms (≈1 is perfect).
  function shapeMatch(pts, data, HB = 12, HR = 1.6) {
    const hist = (a) => {
      const n = a.length / 2, h = new Float32Array(HB * HB);
      for (let i = 0; i < n; i++) {
        const gx = Math.floor(((a[2 * i] + HR) / (2 * HR)) * HB), gy = Math.floor(((a[2 * i + 1] + HR) / (2 * HR)) * HB);
        if (gx >= 0 && gy >= 0 && gx < HB && gy < HB) h[gy * HB + gx]++;
      }
      for (let k = 0; k < h.length; k++) h[k] /= n;
      return h;
    };
    const a = hist(pts), b = hist(data);
    let o = 0;
    for (let k = 0; k < a.length; k++) o += Math.min(a[k], b[k]);
    return o;
  }

  const api = { mulberry, gaussFrom, makeSchedule, sampleDataset, features, NFEAT, MLP, Diffusion, predictEps, Sampler, sample, shapeMatch, SC };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DiffCore = api;
})(typeof window !== "undefined" ? window : globalThis);
