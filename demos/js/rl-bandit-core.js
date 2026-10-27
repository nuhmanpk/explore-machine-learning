// Lucky Slot Machines: multi-armed bandit core (runs in browser and Node).
(function (root) {
  // Machines: win chance p and prize size. Mean payout = p * prize. Machine C (index 2) is the best.
  const DEFAULT_ARMS = [
    { p: 0.30, prize: 3 }, // 0.9
    { p: 0.50, prize: 3 }, // 1.5
    { p: 0.70, prize: 4 }, // 2.8  best
    { p: 0.20, prize: 6 }, // 1.2
    { p: 0.80, prize: 2 }, // 1.6
  ];
  const NAMES = "ABCDEFGH";

  function mean(a) { return a.p * a.prize; }

  function makeEnv(rng, opts) {
    opts = opts || {};
    const env = {
      arms: DEFAULT_ARMS.map((a) => ({ p: a.p, prize: a.prize })),
      noise: opts.noise == null ? 0.2 : opts.noise,
      rng,
      n() { return env.arms.length; },
      means() { return env.arms.map(mean); },
      best() { const m = env.means(); return m.indexOf(Math.max.apply(null, m)); },
      bestMean() { return Math.max.apply(null, env.means()); },
      // Payout of one pull of machine i. Prize varies +/- noise (unbiased), win chance is fixed.
      pay(i) {
        const a = env.arms[i];
        if (env.rng() >= a.p) return 0;
        return a.prize * (1 + env.noise * (2 * env.rng() - 1));
      },
      // Same-luck draw: one payout for every machine (so strategies can be compared fairly).
      drawAll() { return env.arms.map((_, i) => env.pay(i)); },
      // The casino swaps the best machine with the worst one.
      shake() {
        const m = env.means();
        const b = m.indexOf(Math.max.apply(null, m)), w = m.indexOf(Math.min.apply(null, m));
        const t = env.arms[b]; env.arms[b] = env.arms[w]; env.arms[w] = t;
        return { from: b, to: w };
      },
      // Add machines (up to 8), random but never better than the current best by much.
      grow(to) {
        while (env.arms.length < Math.min(8, to)) {
          const p = 0.15 + 0.7 * env.rng();
          const prize = 2 + Math.round(env.rng() * 5);
          env.arms.push({ p: Math.round(p * 20) / 20, prize });
        }
      },
    };
    return env;
  }

  // kind: "greedy" (eps 0), "eps" (uses eps), "random" (eps 1). decay: eps shrinks over time.
  function makeAgent(kind, n, opts) {
    opts = opts || {};
    const ag = {
      kind,
      eps: kind === "greedy" ? 0 : kind === "random" ? 1 : (opts.eps == null ? 0.1 : opts.eps),
      decay: !!opts.decay,
      alpha: opts.alpha == null ? 0.1 : opts.alpha,
      Q: new Array(n).fill(0),
      N: new Array(n).fill(0),
      t: 0,
      total: 0,
      grow(n2) { while (ag.Q.length < n2) { ag.Q.push(0); ag.N.push(0); } },
      epsNow() { return ag.decay && ag.kind === "eps" ? ag.eps * Math.max(0.03, 1 / (1 + ag.t / 40)) : ag.eps; },
      // Returns {arm, explored, roll, eps, best}. Greedy pick = highest average, ties random.
      choose(rng) {
        const e = ag.epsNow();
        const roll = rng();
        let top = -Infinity, ties = [];
        for (let i = 0; i < ag.Q.length; i++) {
          if (ag.Q[i] > top + 1e-12) { top = ag.Q[i]; ties = [i]; }
          else if (Math.abs(ag.Q[i] - top) <= 1e-12) ties.push(i);
        }
        const best = ties[Math.floor(rng() * ties.length)];
        const explored = roll < e;
        const arm = explored ? Math.floor(rng() * ag.Q.length) : best;
        return { arm, explored, roll, eps: e, best, tie: ties.length > 1 };
      },
      update(arm, r) {
        ag.N[arm]++;
        // Plain average at first, then a fixed small step so old news fades (lets Robo notice changes).
        ag.Q[arm] += (r - ag.Q[arm]) * Math.max(1 / ag.N[arm], ag.alpha);
        ag.t++;
        ag.total += r;
      },
    };
    return ag;
  }

  // Average coins per pull over `steps` pulls for one strategy (own luck from seed).
  function run(kind, opts, steps, seed, rngFactory) {
    const rng = rngFactory(seed);
    const env = makeEnv(rng, opts);
    const ag = makeAgent(kind, env.n(), opts);
    for (let s = 0; s < steps; s++) {
      const c = ag.choose(rng);
      ag.update(c.arm, env.pay(c.arm));
    }
    return { avg: ag.total / steps, pickedBest: ag.N[env.best()] / steps };
  }

  const api = { DEFAULT_ARMS, NAMES, makeEnv, makeAgent, run, mean };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BanditCore = api;
})(typeof window !== "undefined" ? window : globalThis);
