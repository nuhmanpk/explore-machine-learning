// Next-Frame Dreamer core: a tiny bouncing-ball world and a small neural net
// that learns to predict the next frame from the previous two.
// No DOM, so it also runs in Node for testing.
(function (root) {
  const N = 24; // frames are N×N pixels, values 0..1
  const P = N * N;

  // ---------- the world ----------
  // A ball (or two) bouncing inside a box, optional gravity.
  function makeWorld(opts = {}, rnd = Math.random) {
    const balls = [];
    const count = opts.twoBalls ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const sp = 0.7 + rnd() * 0.9;
      const a = rnd() * Math.PI * 2;
      balls.push({ x: 4 + rnd() * (N - 8), y: 4 + rnd() * (N - 8), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
    }
    return { balls, gravity: !!opts.gravity, r: 2.4 };
  }

  function stepWorld(w) {
    const r = w.r;
    for (const b of w.balls) {
      if (w.gravity) b.vy += 0.12;
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < r) { b.x = 2 * r - b.x; b.vx = -b.vx; }
      if (b.x > N - r) { b.x = 2 * (N - r) - b.x; b.vx = -b.vx; }
      if (b.y < r) { b.y = 2 * r - b.y; b.vy = -b.vy; }
      if (b.y > N - r) { b.y = 2 * (N - r) - b.y; b.vy = -b.vy * (w.gravity ? 0.97 : 1); }
      if (w.gravity && Math.abs(b.vy) < 0.25 && b.y > N - r - 0.5) b.vy = -(1.6 + Math.random()); // keep it hopping
    }
  }

  // Soft-edged disc, so sub-pixel motion is visible.
  function render(w, out = new Float32Array(P)) {
    out.fill(0);
    for (const b of w.balls) {
      const x0 = Math.max(0, Math.floor(b.x - w.r - 1)), x1 = Math.min(N - 1, Math.ceil(b.x + w.r + 1));
      const y0 = Math.max(0, Math.floor(b.y - w.r - 1)), y1 = Math.min(N - 1, Math.ceil(b.y + w.r + 1));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y);
          const v = Math.min(1, Math.max(0, w.r + 0.5 - d));
          const i = y * N + x;
          if (v > out[i]) out[i] = v;
        }
    }
    return out;
  }

  function cloneWorld(w) {
    return { balls: w.balls.map((b) => ({ ...b })), gravity: w.gravity, r: w.r };
  }

  // A training example: frames t-1, t → target t+1.
  function sample(opts) {
    const w = makeWorld(opts);
    // advance a random amount so gravity worlds have varied speeds
    const warm = Math.floor(Math.random() * 12);
    for (let i = 0; i < warm; i++) stepWorld(w);
    const a = render(w);
    stepWorld(w);
    const b = render(w);
    stepWorld(w);
    const c = render(w);
    return { a, b, c };
  }

  // ---------- the model ----------
  // 2 frames in (2·P numbers) → H hidden ReLU neurons → P sigmoid pixels out.
  // Inputs are mostly zero, so the first layer only touches the lit pixels.
  class FrameNet {
    constructor(H = 96) {
      this.H = H;
      const s1 = Math.sqrt(2 / 40), s2 = Math.sqrt(2 / H);
      this.W1 = randn(2 * P * H, s1);
      this.b1 = new Float32Array(H);
      this.W2 = randn(H * P, s2);
      this.b2 = new Float32Array(P).fill(-4); // start predicting "mostly empty"
      this.adam = { t: 0, m1: new Float32Array(2 * P * H), v1: new Float32Array(2 * P * H), mb1: new Float32Array(H), vb1: new Float32Array(H),
        m2: new Float32Array(H * P), v2: new Float32Array(H * P), mb2: new Float32Array(P), vb2: new Float32Array(P) };
      this.h = new Float32Array(H);
      this.z = new Float32Array(P);
      this.out = new Float32Array(P);
      this.steps = 0;
      this.seen = 0;
      this.lr = 0.002;
      // gradient accumulators for a mini-batch
      this.g2 = new Float32Array(H * P);
      this.gb2 = new Float32Array(P);
      this.gb1 = new Float32Array(H);
      this.g1rows = new Map(); // input index → Float32Array(H)
    }
    active(a, b) {
      const idx = [], val = [];
      for (let i = 0; i < P; i++) if (a[i] > 0.01) { idx.push(i); val.push(a[i]); }
      for (let i = 0; i < P; i++) if (b[i] > 0.01) { idx.push(P + i); val.push(b[i]); }
      return { idx, val };
    }
    forward(a, b, out = this.out) {
      const H = this.H, h = this.h;
      const { idx, val } = this.active(a, b);
      for (let j = 0; j < H; j++) h[j] = this.b1[j];
      for (let k = 0; k < idx.length; k++) {
        const row = idx[k] * H, v = val[k];
        for (let j = 0; j < H; j++) h[j] += this.W1[row + j] * v;
      }
      for (let j = 0; j < H; j++) if (h[j] < 0) h[j] = 0;
      for (let i = 0; i < P; i++) this.z[i] = this.b2[i];
      for (let j = 0; j < H; j++) {
        const hj = h[j];
        if (hj === 0) continue;
        const row = j * P;
        for (let i = 0; i < P; i++) this.z[i] += this.W2[row + i] * hj;
      }
      for (let i = 0; i < P; i++) out[i] = 1 / (1 + Math.exp(-this.z[i]));
      return { idx, val, out };
    }
    // Accumulate gradients for one example; returns its loss (binary cross-entropy per pixel).
    accumulate(a, b, target) {
      const H = this.H, h = this.h;
      const { idx, val, out } = this.forward(a, b);
      let loss = 0;
      const dz = this.z; // reuse: dz = p - y  (BCE + sigmoid)
      // weight lit target pixels more so the ball isn't ignored
      for (let i = 0; i < P; i++) {
        const p = out[i], y = target[i];
        loss -= y * Math.log(p + 1e-7) + (1 - y) * Math.log(1 - p + 1e-7);
        dz[i] = (p - y) * (y > 0.05 ? 3 : 1);
      }
      const dh = new Float32Array(H);
      for (let j = 0; j < H; j++) {
        const hj = h[j];
        if (hj === 0) continue;
        const row = j * P;
        let s = 0;
        for (let i = 0; i < P; i++) {
          this.g2[row + i] += dz[i] * hj;
          s += this.W2[row + i] * dz[i];
        }
        dh[j] = s;
      }
      for (let i = 0; i < P; i++) this.gb2[i] += dz[i];
      for (let k = 0; k < idx.length; k++) {
        let g = this.g1rows.get(idx[k]);
        if (!g) { g = new Float32Array(H); this.g1rows.set(idx[k], g); }
        for (let j = 0; j < H; j++) g[j] += dh[j] * val[k];
      }
      for (let j = 0; j < H; j++) this.gb1[j] += dh[j];
      this.seen++;
      return loss / P;
    }
    // Adam step on the accumulated batch (sparse rows for the first layer).
    apply(batch) {
      const A = this.adam, b1 = 0.9, b2 = 0.999, eps = 1e-8, H = this.H;
      A.t++;
      const lr = this.lr * Math.sqrt(1 - Math.pow(b2, A.t)) / (1 - Math.pow(b1, A.t));
      const inv = 1 / batch;
      const upd = (w, m, v, g, i) => {
        const gi = g * inv;
        m[i] = b1 * m[i] + (1 - b1) * gi;
        v[i] = b2 * v[i] + (1 - b2) * gi * gi;
        w[i] -= lr * m[i] / (Math.sqrt(v[i]) + eps);
      };
      for (let i = 0; i < this.g2.length; i++) { upd(this.W2, A.m2, A.v2, this.g2[i], i); this.g2[i] = 0; }
      for (let i = 0; i < P; i++) { upd(this.b2, A.mb2, A.vb2, this.gb2[i], i); this.gb2[i] = 0; }
      for (let j = 0; j < H; j++) { upd(this.b1, A.mb1, A.vb1, this.gb1[j], j); this.gb1[j] = 0; }
      for (const [row, g] of this.g1rows) {
        const base = row * H;
        for (let j = 0; j < H; j++) upd(this.W1, A.m1, A.v1, g[j], base + j);
      }
      this.g1rows.clear();
      this.steps++;
    }
    // One mini-batch of fresh random examples.
    trainBatch(opts, batch = 16) {
      let loss = 0;
      for (let k = 0; k < batch; k++) {
        const s = sample(opts);
        loss += this.accumulate(s.a, s.b, s.c);
      }
      this.apply(batch);
      return loss / batch;
    }
    snapshot() {
      return { H: this.H, W1: this.W1.slice(), b1: this.b1.slice(), W2: this.W2.slice(), b2: this.b2.slice() };
    }
    static fromSnapshot(s) {
      const n = Object.create(FrameNet.prototype);
      Object.assign(n, { H: s.H, W1: s.W1, b1: s.b1, W2: s.W2, b2: s.b2, h: new Float32Array(s.H), z: new Float32Array(P), out: new Float32Array(P) });
      return n;
    }
  }

  function randn(n, s) {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() || 1e-9, v = Math.random();
      a[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * s;
    }
    return a;
  }

  // Let the model dream: start from two real frames, then feed its own guesses back in.
  function dream(net, a, b, length) {
    const frames = [a, b];
    for (let t = 0; t < length; t++) {
      const out = new Float32Array(P);
      net.forward(frames[frames.length - 2], frames[frames.length - 1], out);
      frames.push(out);
    }
    return frames;
  }

  // How alike two frames are (overlap of the bright parts), 0..1.
  function match(x, y) {
    let inter = 0, uni = 0;
    for (let i = 0; i < P; i++) {
      const a = x[i] > 0.4 ? 1 : 0, b = y[i] > 0.4 ? 1 : 0;
      inter += a & b;
      uni += a | b;
    }
    return uni ? inter / uni : 1;
  }

  const api = { N, P, makeWorld, stepWorld, render, cloneWorld, sample, FrameNet, dream, match };
  root.VideoCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
