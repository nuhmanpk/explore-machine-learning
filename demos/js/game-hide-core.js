// Hide and Seek — the seeker keeps a "where do they hide?" map built from counting
// where you hid before (Dirichlet / add-a-little counts), with fading memory, plus a
// "what comes next?" clue, and checks spots from most to least likely.
// Pure logic, no DOM, so it also runs in Node.
(function (root) {
  // Garden spots. x, y = where the hider crouches, in a 720 × 440 garden.
  const SPOTS = [
    { id: "bush", name: "Bush", x: 118, y: 112 },
    { id: "shed", name: "Shed", x: 300, y: 92 },
    { id: "tree", name: "Oak tree", x: 470, y: 96 },
    { id: "pond", name: "Pond", x: 628, y: 132 },
    { id: "flowers", name: "Flower bed", x: 92, y: 236 },
    { id: "barrow", name: "Wheelbarrow", x: 262, y: 222 },
    { id: "dog", name: "Doghouse", x: 452, y: 230 },
    { id: "swing", name: "Swing", x: 624, y: 256 },
    { id: "bin", name: "Compost bin", x: 150, y: 352 },
    { id: "hedge", name: "Hedge", x: 574, y: 364 },
  ];
  const N = SPOTS.length;
  const RANDOM_EXPECT = (N + 1) / 2; // average checks against a perfectly random hider, whatever the order

  // Deterministic RNG (mulberry32), same as ML.seeded.
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

  const zeros = () => new Array(N).fill(0);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  // Posterior mean of a Dirichlet(prior) after seeing (faded) counts c.
  const dirichletMean = (c, prior) => { const n = sum(c); return c.map((v) => (v + prior) / (n + prior * N)); };

  class Seeker {
    constructor(opts = {}) {
      this.memory = opts.memory ?? 0.85; // each round, old counts are multiplied by this (1 = never forget)
      this.curiosity = opts.curiosity ?? 0.05; // small bonus for spots it hasn't seen you use lately
      this.prior = opts.prior ?? 0.5; // pretend every spot was used this much before we start
      this.forgetTrust = 0.85; // how fast it changes which clue it trusts
      this.fav = zeros(); // clue 1: how often you hid in each spot (faded)
      this.next = new Map(); // clue 2: after hiding in spot A, where you hid next (faded)
      this.trust = [0.5, 0.5];
      this.last = null; // the spot you used last round
      this.rounds = 0;
    }
    nextCounts(a) { return (a !== null && this.next.get(a)) || null; }
    // The seeker's belief: one probability per spot, plus each clue's own opinion.
    belief() {
      const pf = dirichletMean(this.fav, this.prior);
      const nc = this.nextCounts(this.last);
      const pn = dirichletMean(nc || zeros(), this.prior);
      const [wf, wn] = this.trust;
      const p = pf.map((v, i) => wf * v + wn * pn[i]);
      return { p, pf, pn, nSeenNext: nc ? sum(nc) : 0 };
    }
    // Curiosity bonus: bigger for spots with little recent use.
    bonus(i) { return 1 / (1 + this.fav[i]); }
    // The search plan: spots sorted by belief + curiosity. Ties are broken at random.
    plan(rng = Math.random) {
      const { p } = this.belief();
      const score = p.map((v, i) => v + this.curiosity * this.bonus(i) + rng() * 1e-9);
      return score.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    }
    // After the round: trust the clue that saw it coming, then update the counts.
    learn(spot) {
      const { pf, pn } = this.belief();
      const lik = [pf[spot], pn[spot]];
      let w = this.trust.map((t, k) => Math.pow(t, this.forgetTrust) * lik[k]);
      const W = sum(w);
      w = w.map((v) => Math.max(0.03, v / W));
      const W2 = sum(w);
      this.trust = w.map((v) => v / W2);
      for (let i = 0; i < N; i++) this.fav[i] *= this.memory;
      this.fav[spot] += 1;
      if (this.last !== null) {
        let c = this.next.get(this.last);
        if (!c) { c = zeros(); this.next.set(this.last, c); }
        for (let i = 0; i < N; i++) c[i] *= this.memory;
        c[spot] += 1;
      }
      this.last = spot;
      this.rounds++;
    }
    topSpot() { const { p } = this.belief(); return p.indexOf(Math.max(...p)); }
    clone() {
      const s = new Seeker({ memory: this.memory, curiosity: this.curiosity, prior: this.prior });
      s.fav = this.fav.slice();
      for (const [k, v] of this.next) s.next.set(k, v.slice());
      s.trust = this.trust.slice();
      s.last = this.last;
      s.rounds = this.rounds;
      return s;
    }
  }

  // One round. The seeker plans its search BEFORE knowing where you hid.
  // Pass `order` to use a plan made earlier (e.g. one the player peeked at).
  function playRound(seeker, spot, { rng = Math.random, learn = true, order = null } = {}) {
    const before = seeker.belief();
    if (!order) order = seeker.plan(rng);
    const checks = order.indexOf(spot) + 1; // 1 = found on the very first check
    if (learn) seeker.learn(spot);
    return { spot, order, checks, before };
  }

  // Robot hiders with personalities. h = list of spots they used before.
  const idx = (id) => SPOTS.findIndex((s) => s.id === id);
  const RING = [0, 1, 2, 3, 7, 6, 5, 4, 8, 9];
  const anyOf = (rng) => Math.floor(rng() * N);
  const BOTS = {
    shed: { name: "Shed lover", desc: "Hides in the shed most of the time.", fav: idx("shed"), pick: (h, rng) => (rng() < 0.75 ? idx("shed") : anyOf(rng)) },
    pond: { name: "Pond lover", desc: "Hides by the pond most of the time.", fav: idx("pond"), pick: (h, rng) => (rng() < 0.75 ? idx("pond") : anyOf(rng)) },
    pingpong: {
      name: "Ping-pong", desc: "Bush, tree, bush, tree…",
      pick: (h, rng) => { if (rng() < 0.1) return anyOf(rng); return h.length && h[h.length - 1] === idx("bush") ? idx("tree") : idx("bush"); },
    },
    round: {
      name: "Round the garden", desc: "Visits every spot in the same order.",
      pick: (h, rng) => { if (!h.length || rng() < 0.1) return anyOf(rng); return RING[(RING.indexOf(h[h.length - 1]) + 1) % N]; },
    },
    dice: { name: "Dice roller", desc: "Truly random: every spot equally likely.", pick: (h, rng) => anyOf(rng) },
  };

  // How many checks a seeker needs on average against a robot hider.
  function evaluate(seeker, botId, rounds, rng, { learn = true, history = [] } = {}) {
    const s = learn ? seeker : seeker.clone();
    const h = history.slice();
    let total = 0;
    for (let r = 0; r < rounds; r++) {
      const spot = BOTS[botId].pick(h, rng);
      const res = playRound(s, spot, { rng, learn });
      if (!learn) s.last = spot; // a frozen seeker still sees where you were last
      h.push(spot);
      total += res.checks;
    }
    return total / rounds;
  }

  const api = { SPOTS, N, RANDOM_EXPECT, seeded, Seeker, playRound, BOTS, evaluate };
  root.HideCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
