// Is It Fair? core: invented applicants, historical (biased) decisions, a real logistic regression, per-group fairness metrics.
// All data is made up. Pure logic; runs in Node and the browser.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const FEATURES = ["skill", "effort", "area", "group"];
  const LABELS = { skill: "Test score", effort: "Helping hours", area: "Neighbourhood code", group: "Group (A or B)" };

  // Group B (g=1) has a little less access to practice, and lives mostly in neighbourhood code 1 (a proxy).
  // "q" is the truth (really a good member). "hist" is what the old unfair committee decided (it marked B down).
  function makeData(seed, n) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const g = r() < 0.4 ? 1 : 0;
      const skill = clamp(0.54 - 0.05 * g + 0.17 * gauss(r), 0, 1);
      const effort = clamp(0.5 + 0.17 * gauss(r), 0, 1);
      const area = r() < (g ? 0.85 : 0.15) ? 1 : 0;
      const ability = 0.6 * skill + 0.4 * effort;
      const q = ability + 0.05 * gauss(r) > 0.52 ? 1 : 0;
      const hist = ability - 0.12 * g + 0.05 * gauss(r) > 0.52 ? 1 : 0;
      out.push({ id: i, g, skill, effort, area, group: g, q, hist });
    }
    return out;
  }

  // Kamiran-Calders reweighing: weight = P(group) * P(label) / P(group, label); makes group and label look independent.
  function reweigh(data) {
    const n = data.length, cg = [0, 0], cy = [0, 0], cgy = [[0, 0], [0, 0]];
    for (const d of data) { cg[d.g]++; cy[d.hist]++; cgy[d.g][d.hist]++; }
    return data.map((d) => (cg[d.g] / n) * (cy[d.hist] / n) / (cgy[d.g][d.hist] / n));
  }

  // Logistic regression with weighted examples; features are standardised first.
  function train(data, features, opts) {
    opts = opts || {};
    const w = opts.weights || data.map(() => 1), k = features.length, n = data.length;
    const mu = features.map((f) => data.reduce((s, d) => s + d[f], 0) / n);
    const sd = features.map((f, j) => Math.sqrt(data.reduce((s, d) => s + (d[f] - mu[j]) ** 2, 0) / n) || 1);
    let b = 0; const th = features.map(() => 0), sw = w.reduce((a, c) => a + c, 0);
    for (let it = 0; it < 400; it++) {
      let gb = 0; const gt = features.map(() => 0);
      for (let i = 0; i < n; i++) {
        const d = data[i]; let z = b;
        for (let j = 0; j < k; j++) z += th[j] * (d[features[j]] - mu[j]) / sd[j];
        const e = (1 / (1 + Math.exp(-z)) - d.hist) * w[i];
        gb += e; for (let j = 0; j < k; j++) gt[j] += e * (d[features[j]] - mu[j]) / sd[j];
      }
      b -= 0.8 * gb / sw; for (let j = 0; j < k; j++) th[j] -= 0.8 * (gt[j] / sw + 0.001 * th[j]);
    }
    return { features: features.slice(), mu, sd, b, th };
  }
  function score(m, d) {
    let z = m.b;
    for (let j = 0; j < m.features.length; j++) z += m.th[j] * (d[m.features[j]] - m.mu[j]) / m.sd[j];
    return 1 / (1 + Math.exp(-z));
  }
  // thr = {A: 0.5, B: 0.5}. Returns per-group approval rate, true-positive rate (qualified people approved), false-positive rate, plus overall accuracy vs the truth.
  function evaluate(m, data, thr) {
    thr = thr || { A: 0.5, B: 0.5 };
    const G = [0, 1].map(() => ({ n: 0, app: 0, tp: 0, fn: 0, fp: 0, tn: 0 }));
    let ok = 0, ag = 0;
    for (const d of data) {
      const t = d.g ? thr.B : thr.A, a = score(m, d) >= t ? 1 : 0, s = G[d.g];
      s.n++; s.app += a;
      if (d.q) a ? s.tp++ : s.fn++; else a ? s.fp++ : s.tn++;
      if (a === d.q) ok++;
      if (a === d.hist) ag++;
    }
    const rate = (x, y) => (x + y ? x / (x + y) : 0);
    const f = (s) => ({ n: s.n, approval: s.app / (s.n || 1), tpr: rate(s.tp, s.fn), fpr: rate(s.fp, s.tn), missed: s.fn, wrongYes: s.fp });
    const A = f(G[0]), B = f(G[1]);
    return { A, B, acc: ok / data.length, agree: ag / data.length, approvalGap: A.approval - B.approval, tprGap: A.tpr - B.tpr };
  }
  const oldRates = (data) => [0, 1].map((g) => { const s = data.filter((d) => d.g === g); return s.reduce((a, d) => a + d.hist, 0) / s.length; });
  const core = { rng, makeData, reweigh, train, score, evaluate, oldRates, FEATURES, LABELS };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.EthicsBiasCore = core;
})(typeof window !== "undefined" ? window : globalThis);
