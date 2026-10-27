// Ask Your Neighbours core: seeded graph with class-correlated friendships, noisy node features, and a real
// GCN (mean aggregation, manual backprop, Adam). Hops = number of message-passing layers. hops 0 style MLP = identity aggregation.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(6.283185307 * r());
  const C = 3, F = 4, N = 45, CLASSES = ["Cats", "Dogs", "Birds"];

  function makeData(seed, noise) {
    const r = rng(seed), y = Array.from({ length: N }, (_, i) => i % C), adj = Array.from({ length: N }, () => new Set());
    const add = (a, b) => { if (a !== b) { adj[a].add(b); adj[b].add(a); } };
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (r() < (y[i] === y[j] ? 0.2 : 0.025)) add(i, j);
    for (let i = 0; i < N; i++) if (!adj[i].size) { let j; do { j = Math.floor(r() * N); } while (j === i || y[j] !== y[i]); add(i, j); }
    const mu = [[1, 0], [-0.5, 0.87], [-0.5, -0.87]], sd = noise == null ? 1.1 : noise;
    const X = y.map((c) => [mu[c][0] + sd * gauss(r), mu[c][1] + sd * gauss(r), gauss(r), gauss(r)]);
    // layout: tidy force layout (static)
    const pos = Array.from({ length: N }, (_, i) => ({ x: Math.cos(i * 2.4) * 0.7, y: Math.sin(i * 2.4) * 0.7 })), vel = pos.map(() => ({ x: 0, y: 0 }));
    for (let it = 0; it < 400; it++) {
      const f = pos.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, d2 = dx * dx + dy * dy + 0.003, d = Math.sqrt(d2), s = 0.004 / d2; f[i].x += dx / d * s; f[i].y += dy / d * s; f[j].x -= dx / d * s; f[j].y -= dy / d * s; }
      for (let i = 0; i < N; i++) for (const j of adj[i]) if (i < j) { const dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y, d = Math.sqrt(dx * dx + dy * dy) + 1e-6, s = (d - 0.15) * 0.05; f[i].x += dx / d * s; f[i].y += dy / d * s; f[j].x -= dx / d * s; f[j].y -= dy / d * s; }
      for (let i = 0; i < N; i++) { vel[i].x = (vel[i].x + f[i].x - pos[i].x * 0.02) * 0.7; vel[i].y = (vel[i].y + f[i].y - pos[i].y * 0.02) * 0.7; pos[i].x += vel[i].x; pos[i].y += vel[i].y; }
    }
    const mx = Math.max(...pos.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) || 1;
    pos.forEach((p) => { p.x /= mx; p.y /= mx; });
    return { y, adj: adj.map((s) => [...s]), X, pos, n: N };
  }
  // labelled nodes: k per class, seeded
  function pickLabels(data, k, seed) {
    const r = rng(seed + 5), out = [];
    for (let c = 0; c < C; c++) { const ids = data.y.map((v, i) => (v === c ? i : -1)).filter((i) => i >= 0); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } out.push(...ids.slice(0, k)); }
    return out;
  }
  // mean aggregation matrix: row i averages node i and its friends
  function ahat(data) { return data.adj.map((nb, i) => { const row = new Array(data.n).fill(0), w = 1 / (nb.length + 1); row[i] = w; nb.forEach((j) => (row[j] = w)); return row; }); }
  const ident = (n) => Array.from({ length: n }, (_, i) => { const r = new Array(n).fill(0); r[i] = 1; return r; });
  const mm = (A, B) => A.map((row) => { const o = new Array(B[0].length).fill(0); for (let k = 0; k < row.length; k++) { const a = row[k]; if (a) for (let j = 0; j < o.length; j++) o[j] += a * B[k][j]; } return o; });
  const tr = (A) => A[0].map((_, j) => A.map((r) => r[j]));

  function smooth(A, X, hops) { let H = X; for (let h = 0; h < hops; h++) H = mm(A, H); return H; }
  // how far apart the three class averages of the smoothed features are, relative to hop 0 (1 = as spread as raw)
  function classGap(data, hops) {
    const A = ahat(data), g = (H) => { const m = [0, 1, 2].map((c) => { const s = [0, 0]; let k = 0; data.y.forEach((v, i) => { if (v === c) { s[0] += H[i][0]; s[1] += H[i][1]; k++; } }); return [s[0] / k, s[1] / k]; }); let t = 0; for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) t += Math.hypot(m[a][0] - m[b][0], m[a][1] - m[b][1]); return t / 3; };
    return g(smooth(A, data.X, hops)) / g(data.X);
  }

  // layers: number of weight matrices. A = aggregation matrix (identity => plain MLP).
  class Net {
    constructor(A, layers, seed, hidden) {
      const r = rng(seed), h = hidden || 8, dims = [F]; for (let l = 0; l < layers - 1; l++) dims.push(h); dims.push(C);
      this.A = A; this.At = tr(A); this.L = layers;
      this.W = []; this.b = [];
      for (let l = 0; l < layers; l++) { const s = Math.sqrt(2 / (dims[l] + dims[l + 1])); this.W.push(Array.from({ length: dims[l] }, () => Array.from({ length: dims[l + 1] }, () => gauss(r) * s))); this.b.push(new Array(dims[l + 1]).fill(0)); }
      this.m = this.W.map((w) => w.map((row) => row.map(() => 0))); this.v = this.m.map((w) => w.map((row) => row.map(() => 0)));
      this.mb = this.b.map((x) => x.map(() => 0)); this.vb = this.mb.map((x) => x.map(() => 0)); this.t = 0;
    }
    forward(X) {
      const M = [], Z = []; let H = X;
      for (let l = 0; l < this.L; l++) {
        const m = mm(this.A, H), z = mm(m, this.W[l]).map((row) => row.map((v, j) => v + this.b[l][j]));
        M.push(m); Z.push(z); H = l === this.L - 1 ? z : z.map((row) => row.map((v) => Math.max(0, v)));
      }
      const P = H.map((row) => { const mx = Math.max(...row), e = row.map((v) => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); });
      return { M, Z, P };
    }
    // one Adam step on the labelled nodes only; returns loss
    train(X, y, labelled, lr, wd) {
      const { M, Z, P } = this.forward(X), n = labelled.length; let loss = 0;
      let dZ = P.map(() => new Array(C).fill(0));
      labelled.forEach((i) => { loss -= Math.log(P[i][y[i]] + 1e-12) / n; for (let c = 0; c < C; c++) dZ[i][c] = (P[i][c] - (c === y[i] ? 1 : 0)) / n; });
      this.t++;
      for (let l = this.L - 1; l >= 0; l--) {
        const dW = mm(tr(M[l]), dZ), db = dZ[0].map((_, j) => dZ.reduce((s, r) => s + r[j], 0));
        let dZp = null;
        if (l > 0) { const dM = mm(dZ, tr(this.W[l])), dH = mm(this.At, dM); dZp = dH.map((row, i) => row.map((v, j) => (Z[l - 1][i][j] > 0 ? v : 0))); }
        const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
        const upd = (p, g, m, v) => { m = b1 * m + (1 - b1) * g; v = b2 * v + (1 - b2) * g * g; return [p - (lr * (m / c1)) / (Math.sqrt(v / c2) + 1e-8), m, v]; };
        this.W[l].forEach((row, i) => row.forEach((w, j) => { const [p, m, v] = upd(w, dW[i][j] + wd * w, this.m[l][i][j], this.v[l][i][j]); row[j] = p; this.m[l][i][j] = m; this.v[l][i][j] = v; }));
        this.b[l].forEach((w, j) => { const [p, m, v] = upd(w, db[j], this.mb[l][j], this.vb[l][j]); this.b[l][j] = p; this.mb[l][j] = m; this.vb[l][j] = v; });
        dZ = dZp;
      }
      return loss;
    }
    predict(X) { return this.forward(X).P.map((p) => p.indexOf(Math.max(...p))); }
  }
  function accuracy(pred, y, nodes) { let ok = 0; nodes.forEach((i) => { if (pred[i] === y[i]) ok++; }); return nodes.length ? ok / nodes.length : 0; }
  const unlabelled = (data, labelled) => { const s = new Set(labelled); return data.y.map((_, i) => i).filter((i) => !s.has(i)); };
  // convenience: build + fully train. hops<=0 => MLP (2 layers, no graph).
  function build(data, hops, seed) { return hops <= 0 ? new Net(ident(data.n), 2, seed) : new Net(ahat(data), hops, seed); }
  function fit(data, labelled, hops, seed, epochs) { const net = build(data, hops, seed); for (let e = 0; e < (epochs || 200); e++) net.train(data.X, data.y, labelled, 0.05, 5e-4); return net; }
  // accuracy on unlabelled nodes for hops 0..maxHops, averaged over several initialisations
  function sweep(data, labelled, maxHops, seeds) {
    const un = unlabelled(data, labelled), out = [];
    for (let h = 0; h <= maxHops; h++) { let s = 0; for (let k = 0; k < seeds; k++) s += accuracy(fit(data, labelled, h, 100 + k).predict(data.X), data.y, un); out.push(s / seeds); }
    return out;
  }

  const core = { rng, C, F, N, CLASSES, makeData, pickLabels, ahat, classGap, Net, build, fit, accuracy, unlabelled, sweep };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GraphGnnCore = core;
})(typeof window !== "undefined" ? window : globalThis);
