// How Sure Is Sure? core: an overconfident logistic regression (few examples, many noisy clues), temperature and Platt scaling,
// reliability bins, expected calibration error, and "I don't know" abstention. All data invented. No DOM.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const gauss = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const sig = (z) => 1 / (1 + Math.exp(-z));
  const D = 14; // clues per fruit; only the first 3 matter, the rest are noise
  // y = 1 means "ripe". Two-thirds of the signal is hidden in noise, so even the best guess is wrong sometimes.
  function makeFruit(seed, n) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const y = r() < 0.5 ? 1 : 0, x = [];
      for (let j = 0; j < D; j++) x.push(gauss(r) + (j < 3 ? (y ? 0.55 : -0.55) : 0));
      out.push({ id: i, x, y });
    }
    return out;
  }
  // Plain logistic regression with no brakes, trained for many steps, so it memorises the small training set.
  function train(data, steps) {
    const w = new Array(D).fill(0); let b = 0; const n = data.length;
    for (let it = 0; it < (steps || 600); it++) {
      let gb = 0; const g = new Array(D).fill(0);
      for (const d of data) { let z = b; for (let j = 0; j < D; j++) z += w[j] * d.x[j]; const e = sig(z) - d.y; gb += e; for (let j = 0; j < D; j++) g[j] += e * d.x[j]; }
      b -= 0.3 * gb / n; for (let j = 0; j < D; j++) w[j] -= 0.3 * g[j] / n;
    }
    return { w, b };
  }
  const logit = (m, d) => { let z = m.b; for (let j = 0; j < D; j++) z += m.w[j] * d.x[j]; return z; };
  const nll = (zs, ys, f) => { let s = 0; for (let i = 0; i < zs.length; i++) { const p = Math.min(1 - 1e-9, Math.max(1e-9, f(zs[i]))); s -= ys[i] ? Math.log(p) : Math.log(1 - p); } return s / zs.length; };
  function fitTemperature(m, val) {
    const zs = val.map((d) => logit(m, d)), ys = val.map((d) => d.y); let best = 1, bl = Infinity;
    for (let T = 0.5; T <= 12; T += 0.05) { const l = nll(zs, ys, (z) => sig(z / T)); if (l < bl) { bl = l; best = T; } }
    return { T: +best.toFixed(2) };
  }
  function fitPlatt(m, val) {
    const zs = val.map((d) => logit(m, d)), ys = val.map((d) => d.y); let a = 1, c = 0;
    for (let it = 0; it < 800; it++) { let ga = 0, gc = 0; for (let i = 0; i < zs.length; i++) { const e = sig(a * zs[i] + c) - ys[i]; ga += e * zs[i]; gc += e; } a -= 0.05 * ga / zs.length; c -= 0.05 * gc / zs.length; }
    return { a, c };
  }
  // P(ripe) under a method: "raw", "temp", "platt"
  function prob(m, cal, method, d) {
    const z = logit(m, d);
    return method === "temp" ? sig(z / cal.temp.T) : method === "platt" ? sig(cal.platt.a * z + cal.platt.c) : sig(z);
  }
  // Each prediction: answer (ripe or not) and confidence (0.5 to 1 = probability of the answer it gave).
  function predict(m, cal, method, data) {
    return data.map((d) => { const p = prob(m, cal, method, d); const yes = p >= 0.5; return { id: d.id, yes, conf: yes ? p : 1 - p, right: (yes ? 1 : 0) === d.y }; });
  }
  function reliability(preds, nb) {
    nb = nb || 5; const bins = [];
    for (let i = 0; i < nb; i++) bins.push({ lo: 0.5 + i * 0.5 / nb, hi: 0.5 + (i + 1) * 0.5 / nb, n: 0, conf: 0, ok: 0 });
    for (const p of preds) { const i = Math.min(nb - 1, Math.floor((p.conf - 0.5) / (0.5 / nb))); const b = bins[i]; b.n++; b.conf += p.conf; b.ok += p.right ? 1 : 0; }
    let ece = 0;
    for (const b of bins) { if (b.n) { b.conf /= b.n; b.acc = b.ok / b.n; ece += (b.n / preds.length) * Math.abs(b.conf - b.acc); } }
    return { bins, ece };
  }
  // Below the threshold the AI says "I don't know".
  function abstain(preds, thr) {
    const kept = preds.filter((p) => p.conf >= thr), ok = kept.filter((p) => p.right).length;
    return { coverage: kept.length / preds.length, acc: kept.length ? ok / kept.length : 1, answered: kept.length, confidentWrong: preds.filter((p) => p.conf >= 0.9 && !p.right).length, wrongKept: kept.length - ok };
  }
  const core = { rng, makeFruit, train, logit, fitTemperature, fitPlatt, prob, predict, reliability, abstain, D };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.EthicsCalibrateCore = core;
})(typeof window !== "undefined" ? window : globalThis);
