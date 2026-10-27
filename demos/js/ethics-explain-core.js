// Why Did It Say That? core: invented cat-or-dog "photo measurements" with a silly shortcut (wall colour),
// a real logistic regression, per-prediction contributions and permutation importance. No DOM.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gauss = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const FEATURES = ["ears", "snout", "whiskers", "size", "wall"];
  const LABELS = { ears: "Pointy ears", snout: "Long snout", whiskers: "Long whiskers", size: "Big body", wall: "Blue wall behind" };
  // y = 1 means dog, 0 means cat. Real clues overlap a lot. In the "familiar" photos, dogs were mostly shot in front of a blue wall.
  // shortcut = how often the wall matches the animal (0.5 means the wall tells you nothing).
  function makePhotos(seed, n, shortcut) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const y = r() < 0.5 ? 1 : 0;
      out.push({
        id: i, y,
        ears: clamp(0.6 - 0.18 * y + 0.2 * gauss(r), 0, 1),
        snout: clamp(0.4 + 0.17 * y + 0.2 * gauss(r), 0, 1),
        whiskers: clamp(0.55 - 0.12 * y + 0.22 * gauss(r), 0, 1),
        size: clamp(0.4 + 0.2 * y + 0.22 * gauss(r), 0, 1),
        wall: (r() < shortcut ? y : 1 - y)
      });
    }
    return out;
  }
  function train(data, features) {
    const k = features.length, n = data.length;
    const mu = features.map((f) => data.reduce((s, d) => s + d[f], 0) / n);
    const sd = features.map((f, j) => Math.sqrt(data.reduce((s, d) => s + (d[f] - mu[j]) ** 2, 0) / n) || 1);
    let b = 0; const th = features.map(() => 0);
    for (let it = 0; it < 300; it++) {
      let gb = 0; const gt = features.map(() => 0);
      for (const d of data) {
        let z = b; for (let j = 0; j < k; j++) z += th[j] * (d[features[j]] - mu[j]) / sd[j];
        const e = 1 / (1 + Math.exp(-z)) - d.y; gb += e;
        for (let j = 0; j < k; j++) gt[j] += e * (d[features[j]] - mu[j]) / sd[j];
      }
      b -= 0.7 * gb / n; for (let j = 0; j < k; j++) th[j] -= 0.7 * (gt[j] / n + 0.002 * th[j]);
    }
    return { features: features.slice(), mu, sd, b, th };
  }
  const logit = (m, d) => { let z = m.b; for (let j = 0; j < m.features.length; j++) z += m.th[j] * (d[m.features[j]] - m.mu[j]) / m.sd[j]; return z; };
  const prob = (m, d) => 1 / (1 + Math.exp(-logit(m, d)));
  // Local explanation: each clue's push (in log-odds) compared with an "average photo". Positive = towards dog.
  function contributions(m, d) {
    return m.features.map((f, j) => ({ f, push: m.th[j] * (d[f] - m.mu[j]) / m.sd[j] }));
  }
  function accuracy(m, data) { let ok = 0; for (const d of data) if ((prob(m, d) >= 0.5 ? 1 : 0) === d.y) ok++; return ok / data.length; }
  // Global: how much accuracy drops when one clue is shuffled among photos (averaged over a few shuffles).
  function permImportance(m, data, seed, reps) {
    reps = reps || 5; const r = rng(seed), base = accuracy(m, data);
    return m.features.map((f) => {
      let drop = 0;
      for (let k = 0; k < reps; k++) {
        const vals = data.map((d) => d[f]);
        for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
        drop += base - accuracy(m, data.map((d, i) => Object.assign({}, d, { [f]: vals[i] })));
      }
      return { f, drop: Math.max(0, drop / reps) };
    });
  }
  const core = { rng, makePhotos, train, prob, logit, contributions, accuracy, permImportance, FEATURES, LABELS };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.EthicsExplainCore = core;
})(typeof window !== "undefined" ? window : globalThis);
