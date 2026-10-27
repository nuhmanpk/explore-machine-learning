// Image-text matching core: dot product and 2-D PCA of a few embeddings via power iteration on the Gram matrix. Pure logic.
(function (root) {
  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  function pca2(vecs) {
    // Top-2 principal directions via power iteration on the small n×n Gram matrix.
    const n = vecs.length, d = vecs[0].length;
    const mean = new Float32Array(d);
    vecs.forEach((v) => { for (let k = 0; k < d; k++) mean[k] += v[k] / n; });
    const X = vecs.map((v) => v.map((x, k) => x - mean[k]));
    const G = X.map((a) => X.map((b) => dot(a, b)));
    const coords = X.map(() => [0, 0]);
    const used = [];
    for (let c = 0; c < 2; c++) {
      let u = Array.from({ length: n }, (_, i) => Math.sin(i * 1.7 + c * 3.1 + 1));
      let lambda = 0;
      for (let it = 0; it < 80; it++) {
        let w = G.map((row) => row.reduce((s, g, j) => s + g * u[j], 0));
        used.forEach(([uu, ll]) => { const p = uu.reduce((s, x, j) => s + x * u[j], 0); w = w.map((x, j) => x - ll * p * uu[j]); });
        const norm = Math.hypot(...w) || 1;
        lambda = norm;
        u = w.map((x) => x / norm);
      }
      used.push([u, lambda]);
      u.forEach((x, i) => (coords[i][c] = x * Math.sqrt(lambda)));
    }
    return coords;
  }
  const core = { dot, pca2 };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.MatchCore = core;
})(typeof window !== "undefined" ? window : globalThis);
