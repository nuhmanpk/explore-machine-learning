// Bayes lesson core: Bayes' rule, a seeded crowd of 1000 people, and repeated-test updating. Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // P(has it | positive) by Bayes' rule. prior, sens (true-positive rate), fpr (false-alarm rate) are all 0..1.
  function posterior(prior, sens, fpr, positive = true) {
    const a = positive ? sens : 1 - sens, b = positive ? fpr : 1 - fpr;
    const num = prior * a, den = num + (1 - prior) * b;
    return den > 0 ? num / den : prior;
  }
  // Each person gets two fixed random numbers, so moving a slider changes the crowd smoothly.
  function crowd(seed, n) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) out.push({ u: r(), v: r() });
    return out;
  }
  // Classify the crowd: sick (u < prior), positive (v < sens if sick, v < fpr if healthy).
  function classify(people, prior, sens, fpr) {
    const res = { tp: 0, fp: 0, fn: 0, tn: 0, list: [] };
    for (const p of people) {
      const sick = p.u < prior, pos = sick ? p.v < sens : p.v < fpr;
      const k = sick ? (pos ? "tp" : "fn") : (pos ? "fp" : "tn");
      res[k]++; res.list.push(k);
    }
    res.positives = res.tp + res.fp;
    res.share = res.positives ? res.tp / res.positives : 0;
    return res;
  }
  // Apply a series of results (true = positive) one after another; returns belief after each.
  function chain(prior, sens, fpr, results) {
    const beliefs = [prior]; let b = prior;
    for (const x of results) { b = posterior(b, sens, fpr, x); beliefs.push(b); }
    return beliefs;
  }
  // A real random test on someone who truly has it (or not).
  function takeTest(r, has, sens, fpr) { return has ? r() < sens : r() < fpr; }
  const core = { rng, posterior, crowd, classify, chain, takeTest };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.BayesCore = core;
})(typeof window !== "undefined" ? window : globalThis);
