// Puppy Trainer core: tricks/actions, auto-human tastes, Bradley-Terry reward model, softmax policy, REINFORCE step. Pure logic; Node + browser.
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
  const TRICKS = [
    { k: "sit", name: "Sit" },
    { k: "paw", name: "Paw" },
    { k: "roll", name: "Roll" },
    { k: "jump", name: "Jump" },
    { k: "spin", name: "Spin" },
    { k: "bark", name: "Bark", naughty: true },
    { k: "chew", name: "Chew shoe", naughty: true },
    { k: "dig", name: "Dig", naughty: true },
  ];
  const N = TRICKS.length;
  // Action = trick index * 2 + (fast ? 1 : 0)
  const A = N * 2;
  const trickOf = (a) => a >> 1;
  const fastOf = (a) => a & 1;
  const feats = (a) => { const f = new Array(N + 1).fill(0); f[trickOf(a)] = 1; f[N] = fastOf(a); return f; };

  // Hidden tastes for the auto-human.
  const TASTES = {
    calm: { tr: [1, 1.5, 2, 0.8, 0.6, -1.5, -2, -1.2], fast: -0.8 },
    roll: { tr: [0.3, 0.4, 3, 0.2, 0.2, -1, -1.5, -1], fast: 0 },
    silly: { tr: [-0.5, -0.3, 1, 1.5, 2, 0.5, -1.5, -0.5], fast: 1.2 },
  };
  const humanU = (taste, a) => { const t = TASTES[taste]; return t.tr[trickOf(a)] + t.fast * fastOf(a); };

  // Puppy starts a bit naughty.
  const INIT = Array.from({ length: A }, (_, a) => (TRICKS[trickOf(a)].naughty ? 0.6 : 0) + (fastOf(a) ? 0.2 : 0));
  const rnd = seeded(11);
  const HELD = Array.from({ length: 60 }, () => {
    let a = Math.floor(rnd() * A), b = Math.floor(rnd() * A);
    while (trickOf(b) === trickOf(a)) b = Math.floor(rnd() * A);
    return [a, b];
  });

  const rmRaw = (w, a) => feats(a).reduce((s, x, i) => s + x * w[i], 0);
  const softmax = (l) => { const m = Math.max(...l); const e = l.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };
  const sample = (p, rand = Math.random) => { let r = rand(); for (let i = 0; i < p.length; i++) { r -= p[i]; if (r <= 0) return i; } return p.length - 1; };
  const trickProbs = (logits) => { const p = softmax(logits); const t = new Array(N).fill(0); p.forEach((x, a) => (t[trickOf(a)] += x)); return { t, fast: p.reduce((s, x, a) => s + (fastOf(a) ? x : 0), 0) }; };
  function heldAcc(w, taste) {
    let ok = 0;
    for (const [a, b] of HELD) if ((rmRaw(w, a) > rmRaw(w, b)) === (humanU(taste, a) > humanU(taste, b))) ok++;
    return Math.round((ok / HELD.length) * 100);
  }
  // Bradley-Terry: a few SGD passes over all comparisons so far (data already includes the newest). Mutates w.
  function trainRM(w, data) {
    for (let ep = 0; ep < 20; ep++)
      for (const [x, y] of data) {
        const fx = feats(x), fy = feats(y);
        const d = rmRaw(w, x) - rmRaw(w, y);
        const g = 1 - 1 / (1 + Math.exp(-d));
        for (let i = 0; i <= N; i++) w[i] += 0.05 * (g * (fx[i] - fy[i]) - 0.01 * w[i]);
      }
  }
  // One REINFORCE step with baseline and KL leash toward INIT. Mutates logits; returns { baseline, adv }.
  function reinforce(logits, baseline, a, r, p, beta, lr = 0.3) {
    baseline += 0.05 * (r - baseline);
    const adv = r - baseline;
    for (let i = 0; i < A; i++) {
      logits[i] += lr * adv * ((i === a ? 1 : 0) - p[i]);
      logits[i] += beta * (INIT[i] - logits[i]);
    }
    return { baseline, adv };
  }

  const core = { seeded, TRICKS, N, A, trickOf, fastOf, feats, TASTES, humanU, INIT, HELD, rmRaw, softmax, sample, trickProbs, heldAcc, trainRM, reinforce };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.RlhfCore = core;
})(typeof window !== "undefined" ? window : globalThis);
