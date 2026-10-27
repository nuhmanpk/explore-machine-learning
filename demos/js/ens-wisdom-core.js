// Wisdom of the crowd core: noisy guessers, a shared bias, and a Monte Carlo error curve. Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const SD = 0.3; // each person's own wobble, as a fraction of the true number
  // a jar with `truth` beans and `max` guessers. person i guesses truth * (1 + bias + SD * wobble_i)
  function makeCrowd(seed, max, bias) {
    const r = rng(seed), gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const truth = 200 + Math.floor(r() * 600), guesses = [];
    for (let i = 0; i < max; i++) guesses.push(Math.max(1, Math.round(truth * (1 + bias + SD * gauss()))));
    return { truth, guesses, bias };
  }
  // change the shared bias without redrawing anyone's personal wobble (so the slider feels continuous)
  function withBias(seed, max, bias) { return makeCrowd(seed, max, bias); }
  function stats(crowd, n) {
    const g = crowd.guesses.slice(0, n), t = crowd.truth;
    const avg = g.reduce((a, b) => a + b, 0) / n;
    const errs = g.map((v) => Math.abs(v - t));
    return { n, avg, crowdErr: Math.abs(avg - t), typical: errs.reduce((a, b) => a + b, 0) / n, best: Math.min(...errs), bestIdx: errs.indexOf(Math.min(...errs)) };
  }
  // average relative error of the crowd mean for n = 1..max, over many fake crowds
  function errorCurve(seed, max, bias, trials) {
    const r = rng(seed), out = new Array(max).fill(0), T = trials || 300;
    const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    for (let k = 0; k < T; k++) {
      let sum = 0;
      for (let n = 1; n <= max; n++) { sum += 1 + bias + SD * gauss(); out[n - 1] += Math.abs(sum / n - 1); }
    }
    return out.map((v) => v / T);
  }
  const core = { rng, SD, makeCrowd, withBias, stats, errorCurve };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.WisdomCore = core;
})(typeof window !== "undefined" ? window : globalThis);
