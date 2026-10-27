// Teach the Camera core: k-nearest-neighbour voting on embeddings and a 2-component PCA (power iteration). Pure logic.
(function (root) {
  // classes: [{examples:[{emb}]}]; K: neighbours wanted.
  function currentK(classes, K) {
    const sizes = classes.map((c) => c.examples.length).filter((n) => n > 0);
    return Math.max(1, Math.min(K, ...sizes));
  }
  function predict(classes, K, emb, skipEx = null) {
    const all = [];
    classes.forEach((c, ci) => c.examples.forEach((e) => {
      let s = 0; const v = e.emb;
      for (let i = 0; i < v.length; i++) s += v[i] * emb[i];
      all.push({ ci, s, e, skip: e === skipEx });
    }));
    if (skipEx) all.splice(all.findIndex((a) => a.skip), 1);
    all.sort((a, b) => b.s - a.s);
    const k = currentK(classes, K);
    const top = all.slice(0, Math.min(k, all.length));
    const votes = new Array(classes.length).fill(0);
    // closer neighbours get a much louder vote: weight = e^(20·similarity)
    top.forEach((t) => (votes[t.ci] += Math.exp(20 * (t.s - top[0].s))));
    const tot = votes.reduce((a, b) => a + b, 0) || 1;
    return { probs: votes.map((v) => v / tot), top };
  }
  // Fit 2 principal components to embeddings (array of vectors); rng is a () => [0,1) generator.
  // Returns { proj(x) -> [px, py], xy: projected points, box: [minx, maxx, miny, maxy] }.
  function pcaFit(embs, rng) {
    const d = embs[0].length, n = embs.length;
    const mean = new Float32Array(d);
    embs.forEach((e) => { for (let i = 0; i < d; i++) mean[i] += e[i] / n; });
    const X = embs.map((e) => { const r = new Float32Array(d); for (let i = 0; i < d; i++) r[i] = e[i] - mean[i]; return r; });
    const comps = [];
    for (let c = 0; c < 2; c++) {
      let v = new Float32Array(d).map(() => rng() - 0.5);
      for (let it = 0; it < 30; it++) {
        const u = X.map((x) => { let s = 0; for (let i = 0; i < d; i++) s += x[i] * v[i]; return s; });
        const nv = new Float32Array(d);
        X.forEach((x, k) => { for (let i = 0; i < d; i++) nv[i] += x[i] * u[k]; });
        comps.forEach((pc) => { let s = 0; for (let i = 0; i < d; i++) s += nv[i] * pc[i]; for (let i = 0; i < d; i++) nv[i] -= s * pc[i]; });
        let nn = 0; for (let i = 0; i < d; i++) nn += nv[i] * nv[i];
        nn = Math.sqrt(nn) || 1;
        for (let i = 0; i < d; i++) nv[i] /= nn;
        v = nv;
      }
      comps.push(v);
    }
    const proj = (x) => comps.map((pc) => { let s = 0; for (let i = 0; i < d; i++) s += (x[i] - mean[i]) * pc[i]; return s; });
    const xy = embs.map(proj);
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    xy.forEach((p) => { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); });
    return { proj, xy, box: [mnx, mxx, mny, mxy] };
  }
  const core = { currentK, predict, pcaFit };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.TeachCore = core;
})(typeof window !== "undefined" ? window : globalThis);
