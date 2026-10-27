// What is ML? core: monsters, hidden rules, logistic-regression predict / SGD step / test score. Pure logic; Node + browser.
(function (root) {
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const RULES = {
    big: (m) => m.size > 0.5,
    blue: (m) => m.blue > 0.5,
    spiky: (m) => m.spiky < 0.25,
    bigblue: (m) => m.size > 0.5 && m.blue > 0.5,
  };
  const RULE_TEXT = {
    big: "big monsters are friendly",
    blue: "blue monsters are friendly",
    spiky: "spiky monsters are grumpy",
    bigblue: "big AND blue monsters are friendly",
  };

  const rnd = seeded(7);
  function makeMonster(r = Math.random) {
    return {
      size: r(),
      blue: r(),
      spiky: Math.floor(r() * 5) / 4, // 0, .25, .5, .75, 1 → 0–4 spikes
      eyes: Math.floor(r() * 3) / 2, // 1–3 eyes
      seed: Math.floor(r() * 1e6),
    };
  }
  const TEST = Array.from({ length: 60 }, () => makeMonster(rnd));
  const vec = (m) => [m.size, m.blue, m.spiky, m.eyes];
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  const predict = (m, w, b) => sigmoid(vec(m).reduce((s, x, i) => s + x * w[i], b));
  // percent of the test crowd where the guess agrees with the rule; null for the "me" rule
  function testScore(ruleName, w, b) {
    if (ruleName === "me") return null;
    const rule = RULES[ruleName];
    let ok = 0;
    for (const m of TEST) if ((predict(m, w, b) > 0.5) === rule(m)) ok++;
    return Math.round((ok / TEST.length) * 100);
  }
  // one step of gradient descent on cross-entropy; mutates w, returns the new b
  function sgdStep(w, b, m, guess, truth, lr) {
    const err = guess - (truth ? 1 : 0);
    const x = vec(m);
    for (let i = 0; i < 4; i++) w[i] -= lr * err * x[i];
    return b - lr * err;
  }

  const core = { seeded, RULES, RULE_TEXT, makeMonster, TEST, vec, sigmoid, predict, testScore, sgdStep };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.IntroMLCore = core;
})(typeof window !== "undefined" ? window : globalThis);
