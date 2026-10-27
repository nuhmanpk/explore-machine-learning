// Pattern Scanners — pure math for a 3x3 convolution filter learned by gradient descent. Runs in Node.
(function (root) {
  const K = 3;

  // Hidden "true" scanners the robot has to rediscover (row-major 3x3).
  const TARGETS = {
    vertical:   { name: "vertical lines",   k: [-0.25, 0, 0.25, -0.5, 0, 0.5, -0.25, 0, 0.25] }, // Sobel-x / 4
    horizontal: { name: "horizontal lines", k: [-0.25, -0.5, -0.25, 0, 0, 0, 0.25, 0.5, 0.25] }, // Sobel-y / 4
    corners:    { name: "corners",          k: [-0.5, -0.5, -0.5, -0.5, 1, 0.5, -0.5, 0.5, 0.5] },
  };

  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // "Valid" convolution as used in CNNs (really cross-correlation): output is (N-2)x(N-2).
  function conv(img, N, k) {
    const M = N - K + 1, out = new Array(M * M);
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      let s = 0;
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) s += img[(i + a) * N + j + b] * k[a * K + b];
      out[i * M + j] = s;
    }
    return { M, data: out };
  }
  // The nine products at one spot, and their sum.
  function spot(img, N, k, i, j) {
    const prods = [];
    let sum = 0;
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) { const p = img[(i + a) * N + j + b] * k[a * K + b]; prods.push(p); sum += p; }
    return { prods, sum };
  }
  // 2x2 max pooling, stride 2 (odd edge row/col dropped).
  function pool2(data, M) {
    const P = Math.floor(M / 2), out = new Array(P * P);
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++)
      out[i * P + j] = Math.max(data[2 * i * M + 2 * j], data[2 * i * M + 2 * j + 1], data[(2 * i + 1) * M + 2 * j], data[(2 * i + 1) * M + 2 * j + 1]);
    return { M: P, data: out };
  }

  // Random training pictures: sparse noise plus a few bright rectangles.
  function makeTrainSet(seed, count, N, noise) {
    const r = seeded(seed), set = [];
    for (let c = 0; c < count; c++) {
      const img = new Array(N * N).fill(0), p = 0.1 + r() * 0.4;
      for (let i = 0; i < N * N; i++) img[i] = r() < p ? 1 : 0;
      const nr = 1 + Math.floor(r() * 3);
      for (let q = 0; q < nr; q++) {
        const x0 = Math.floor(r() * (N - 2)), y0 = Math.floor(r() * (N - 2)), w = 2 + Math.floor(r() * 5), h = 2 + Math.floor(r() * 5);
        for (let y = y0; y < Math.min(N, y0 + h); y++) for (let x = x0; x < Math.min(N, x0 + w); x++) img[y * N + x] = 1;
      }
      if (noise) for (let i = 0; i < N * N; i++) img[i] = Math.min(1, Math.max(0, img[i] + (r() - 0.5) * noise));
      set.push(img);
    }
    return set;
  }

  // Training data = pictures + targets (hidden kernel applied to those same pictures).
  function makeTargets(set, N, hidden) { return set.map((im) => conv(im, N, hidden).data); }

  function lossGrad(k, set, tgts, N) {
    const M = N - K + 1, g = new Array(9).fill(0);
    let loss = 0, n = 0;
    for (let s = 0; s < set.length; s++) {
      const im = set[s], t = tgts[s];
      for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
        let o = 0;
        for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) o += im[(i + a) * N + j + b] * k[a * K + b];
        const e = o - t[i * M + j];
        loss += e * e; n++;
        for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) g[a * K + b] += 2 * e * im[(i + a) * N + j + b];
      }
    }
    return { loss: loss / n, grad: g.map((v) => v / n) };
  }
  // One gradient-descent step; returns the loss BEFORE the step and mutates k.
  function trainStep(k, set, tgts, N, lr) {
    const { loss, grad } = lossGrad(k, set, tgts, N);
    for (let i = 0; i < 9; i++) k[i] -= lr * grad[i];
    return loss;
  }

  function cosine(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na < 1e-12 || nb < 1e-12 ? 0 : d / Math.sqrt(na * nb);
  }
  function kernelError(k, h) { let m = 0; for (let i = 0; i < 9; i++) m = Math.max(m, Math.abs(k[i] - h[i])); return m; }

  // Move the drawing by (dx,dy), wrapping round the edges.
  function shift(img, N, dx, dy) {
    const out = new Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[((y + dy + N) % N) * N + ((x + dx + N) % N)] = img[y * N + x];
    return out;
  }
  // Re-draw an NxN picture on an N2xN2 canvas, centred (crop or pad with zeros).
  function resizeCentered(img, N, N2) {
    const out = new Array(N2 * N2).fill(0), off = Math.floor((N2 - N) / 2);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const Y = y + off, X = x + off;
      if (Y >= 0 && Y < N2 && X >= 0 && X < N2) out[Y * N2 + X] = img[y * N + x];
    }
    return out;
  }

  const PRESETS = {
    stripes: (N) => Array.from({ length: N * N }, (_, i) => (Math.floor(i % N) % 4 < 2 ? 1 : 0)),
    hstripes: (N) => Array.from({ length: N * N }, (_, i) => (Math.floor(i / N) % 4 < 2 ? 1 : 0)),
    corner: (N) => Array.from({ length: N * N }, (_, i) => ((i % N) >= Math.floor(N / 3) && Math.floor(i / N) >= Math.floor(N / 3) && (i % N) < N - 3 && Math.floor(i / N) < N - 3 ? 1 : 0)),
    plus: (N) => Array.from({ length: N * N }, (_, i) => { const x = i % N, y = Math.floor(i / N), c = Math.floor(N / 2); return Math.abs(x - c) <= 0 || Math.abs(y - c) <= 0 || x === c - 1 && false ? 1 : 0; }),
    x: (N) => Array.from({ length: N * N }, (_, i) => { const x = i % N, y = Math.floor(i / N); return x === y || x + y === N - 1 ? 1 : 0; }),
    noise: (N, seed) => { const r = seeded(seed || 7); return Array.from({ length: N * N }, () => (r() < 0.35 ? 1 : 0)); },
    blank: (N) => new Array(N * N).fill(0),
  };

  const api = { K, TARGETS, seeded, conv, spot, pool2, makeTrainSet, makeTargets, lossGrad, trainStep, cosine, kernelError, shift, resizeCentered, PRESETS };
  root.ScanCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
