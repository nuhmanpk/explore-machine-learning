// Busy Bees — pure logic (no DOM). A meadow of flowers with hidden nectar chances
// (a multi-armed bandit) and four hives that each use a different choosing rule:
// random, epsilon-greedy, UCB1 and Thompson sampling. Runs in the browser and in Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BeesCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- seeded randomness ----------
  function rng(seed) {
    let a = seed >>> 0 || 1;
    const r = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.normal = function () {
      let u = 0, v = 0;
      while (u === 0) u = r();
      v = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return r;
  }
  // Gamma(k, 1) by Marsaglia & Tsang; Beta(a, b) = X / (X + Y).
  function gamma(r, k) {
    if (k < 1) return gamma(r, k + 1) * Math.pow(r(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = r.normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = r();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  function betaSample(r, a, b) {
    const x = gamma(r, a), y = gamma(r, b);
    return x / (x + y);
  }
  // log of the Beta pdf, for drawing posterior curves.
  function lgammaFn(z) {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgammaFn(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function betaPdf(x, a, b) {
    if (x <= 0 || x >= 1) return 0;
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + lgammaFn(a + b) - lgammaFn(a) - lgammaFn(b));
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- the meadow ----------
  const NAMES = ["Rose", "Daisy", "Tulip", "Poppy", "Violet", "Lily", "Sunny", "Goldie"];
  const BASE_P = [0.25, 0.45, 0.7, 0.35, 0.55, 0.15];
  const PART = 300; // visits per time of day when nectar drifts
  const TIMES = [ // morning, noon, evening: a different flower is best each time
    [0.2, 0.75, 0.3, 0.4, 0.25, 0.15],
    [0.3, 0.2, 0.25, 0.35, 0.8, 0.2],
    [0.75, 0.3, 0.2, 0.15, 0.35, 0.4],
  ];
  const TIME_NAMES = ["Morning", "Noon", "Evening"];

  class Meadow {
    constructor(opts = {}) {
      this.flowers = (opts.p || BASE_P).map((p, i) => ({ id: i, name: NAMES[i], base: p, p, cap: 1, born: 0, phase: (i * 2.1) % (2 * Math.PI) }));
      this.t = 0;
      this.drift = false;
      this.driftAt = 0;
    }
    clone() {
      const m = new Meadow({ p: [] });
      m.flowers = this.flowers.map((f) => ({ ...f }));
      m.t = this.t; m.drift = this.drift; m.driftAt = this.driftAt; m.part = this.part;
      return m;
    }
    get k() { return this.flowers.length; }
    mean(i) { const f = this.flowers[i]; return f.p * f.cap; }
    best() { let b = 0; for (let i = 1; i < this.k; i++) if (this.mean(i) > this.mean(b)) b = i; return b; }
    bestMean() { return this.mean(this.best()); }
    // One visit: a normal flower gives 1 drop with chance p; the trick flower gives `cap` drops with chance p.
    pull(i, r) { const f = this.flowers[i]; return r() < f.p ? f.cap : 0; }
    tick() {
      this.t++;
      if (this.drift) {
        // The sun moves: every PART visits a new time of day starts and the flowers change.
        const part = Math.floor((this.t - this.driftAt) / PART) % TIMES.length;
        if (part !== this.part) {
          this.part = part;
          this.flowers.forEach((f, i) => { if (f.cap === 1 && !f.fixed && i < TIMES[part].length) f.p = TIMES[part][i]; });
        }
      }
    }
    setDrift(on) {
      this.drift = on;
      this.driftAt = this.t;
      this.part = -1;
      if (!on) for (const f of this.flowers) if (f.cap === 1 && !f.fixed) f.p = f.base;
    }
    // A new flower opens, better than everyone else.
    bloom(p = 0.88) {
      const i = this.k;
      this.flowers.push({ id: i, name: NAMES[i] || "Bud " + i, base: p, p, cap: 1, born: this.t, phase: 0, fixed: true, fresh: true });
      return i;
    }
    // A flashy jackpot flower: rarely gives a big pile, on average less than the best normal flower.
    trick() {
      const i = this.k;
      this.flowers.push({ id: i, name: "Jackpot", base: 0.15, p: 0.15, cap: 4, born: this.t, phase: 0, fixed: true, trick: true });
      return i;
    }
  }

  // ---------- the choosing rules (bandit strategies) ----------
  // All keep discounted counts: gamma = 1 remembers everything, gamma < 1 slowly forgets old visits.
  class Strategy {
    constructor(k, opts = {}) {
      this.n = new Array(k).fill(0);
      this.s = new Array(k).fill(0);
      this.a = new Array(k).fill(1);
      this.b = new Array(k).fill(1);
      this.gamma = opts.gamma == null ? 1 : opts.gamma;
      this.eps = opts.eps == null ? 0.1 : opts.eps;
      this.c = opts.c == null ? 0.5 : opts.c;
      this.last = null; // { arm, scores, why }
    }
    get k() { return this.n.length; }
    addArm() { this.n.push(0); this.s.push(0); this.a.push(1); this.b.push(1); }
    est(i) { return this.n[i] > 0 ? this.s[i] / this.n[i] : 0; }
    update(i, reward, cap) {
      const g = this.gamma;
      if (g < 1) for (let j = 0; j < this.k; j++) {
        this.n[j] *= g; this.s[j] *= g;
        this.a[j] = 1 + (this.a[j] - 1) * g; this.b[j] = 1 + (this.b[j] - 1) * g;
      }
      this.n[i] += 1;
      this.s[i] += reward;
      const q = reward / (cap || 1); // Bernoulli trick keeps the Beta update valid for any payout size
      this.a[i] += q; this.b[i] += 1 - q;
    }
    copyFrom(o) {
      this.n = o.n.slice(); this.s = o.s.slice(); this.a = o.a.slice(); this.b = o.b.slice();
      this.gamma = o.gamma; this.eps = o.eps; this.c = o.c;
      return this;
    }
    clone() { return new this.constructor(0).copyFrom(this); }
    argmax(scores, r) {
      let best = -Infinity, ties = [];
      scores.forEach((v, i) => { if (v > best + 1e-12) { best = v; ties = [i]; } else if (Math.abs(v - best) <= 1e-12) ties.push(i); });
      return ties[Math.floor(r() * ties.length)];
    }
    // Greedy pick on current estimates (used to test frozen checkpoints).
    greedy(caps) { let b = 0; for (let i = 1; i < this.k; i++) if (this.value(i, caps[i]) > this.value(b, caps[b])) b = i; return b; }
    value(i) { return this.est(i); }
  }

  class RandomBee extends Strategy {
    choose(r) { const arm = Math.floor(r() * this.k); this.last = { arm, scores: this.n.map(() => 1 / this.k), why: "random" }; return arm; }
  }
  class EpsGreedy extends Strategy {
    choose(r) {
      const scores = this.n.map((_, i) => this.est(i));
      if (r() < this.eps) {
        const arm = Math.floor(r() * this.k);
        this.last = { arm, scores, why: "explore" };
        return arm;
      }
      const arm = this.argmax(scores, r);
      this.last = { arm, scores, why: "exploit" };
      return arm;
    }
  }
  class UCB1 extends Strategy {
    choose(r, caps) {
      const T = Math.max(1, this.n.reduce((x, y) => x + y, 0));
      const scores = this.n.map((n, i) => (n < 1e-9 ? Infinity : this.est(i) + this.c * (caps ? caps[i] : 1) * Math.sqrt((2 * Math.log(T + 1)) / n)));
      const arm = this.argmax(scores, r);
      const why = !isFinite(scores[arm]) ? "untried" : this.argmax(this.n.map((_, i) => this.est(i)), () => 0) === arm ? "exploit" : "bonus";
      this.last = { arm, scores, why };
      return arm;
    }
    bonus(i, cap) { const T = Math.max(1, this.n.reduce((x, y) => x + y, 0)); return this.n[i] < 1e-9 ? Infinity : this.c * (cap || 1) * Math.sqrt((2 * Math.log(T + 1)) / this.n[i]); }
  }
  class Thompson extends Strategy {
    choose(r, caps) {
      const scores = this.a.map((a, i) => betaSample(r, a, this.b[i]) * (caps ? caps[i] : 1));
      const arm = this.argmax(scores, r);
      this.last = { arm, scores, why: "dream" };
      return arm;
    }
    value(i, cap) { return (this.a[i] / (this.a[i] + this.b[i])) * (cap || 1); }
  }

  const STRATS = {
    rand: { name: "Random bee", short: "Random", color: "--muted", make: (k, o) => new RandomBee(k, o) },
    eps: { name: "Mostly-greedy bee", short: "Greedy+dice", color: "--warn", make: (k, o) => new EpsGreedy(k, o) },
    ucb: { name: "Curious bee", short: "Curious (UCB)", color: "--accent", make: (k, o) => new UCB1(k, o) },
    ts: { name: "Dreamer bee", short: "Dreamer (Thompson)", color: "--good", make: (k, o) => new Thompson(k, o) },
  };
  const ORDER = ["rand", "eps", "ucb", "ts"];

  // ---------- a race: same meadow, four hives ----------
  class Race {
    constructor(seed = 1, opts = {}) {
      this.seed = seed;
      this.r = rng(seed);
      this.meadow = new Meadow(opts);
      this.block = opts.block || 25;
      this.opts = { gamma: opts.gamma == null ? 1 : opts.gamma, eps: opts.eps == null ? 0.1 : opts.eps };
      this.hives = {};
      for (const id of ORDER) {
        this.hives[id] = {
          id, strat: STRATS[id].make(this.meadow.k, this.opts), rr: rng(seed * 31 + id.length * 7 + id.charCodeAt(0)),
          nectar: 0, regret: 0, visits: 0, blockGot: 0, blockBest: 0, blocks: [], regretPts: [], recent: [],
        };
      }
      this.markers = [];
    }
    caps() { return this.meadow.flowers.map((f) => f.cap); }
    setGamma(g) { this.opts.gamma = g; for (const id of ORDER) this.hives[id].strat.gamma = g; }
    setEps(e) { this.opts.eps = e; this.hives.eps.strat.eps = e; }
    // Every hive sends one bee. Returns [{ id, arm, reward }].
    step() {
      const m = this.meadow, caps = this.caps(), bm = m.bestMean();
      const out = [];
      for (const id of ORDER) {
        const h = this.hives[id];
        const arm = h.strat.choose(h.rr, caps);
        const reward = m.pull(arm, h.rr);
        h.strat.update(arm, reward, caps[arm]);
        h.nectar += reward;
        h.regret += bm - m.mean(arm);
        h.visits++;
        h.blockGot += m.mean(arm);
        h.blockBest += bm;
        h.recent.push(arm);
        if (h.recent.length > 60) h.recent.shift();
        out.push({ id, arm, reward, why: h.strat.last && h.strat.last.why });
      }
      m.tick();
      if (m.t % this.block === 0) {
        for (const id of ORDER) {
          const h = this.hives[id];
          h.blocks.push((100 * h.blockGot) / Math.max(1e-9, h.blockBest));
          h.regretPts.push(h.regret);
          h.blockGot = 0; h.blockBest = 0;
        }
      }
      return out;
    }
    bloom() { const i = this.meadow.bloom(); for (const id of ORDER) this.hives[id].strat.addArm(); this.mark("New flower"); return i; }
    trick() { const i = this.meadow.trick(); for (const id of ORDER) this.hives[id].strat.addArm(); this.mark("Jackpot flower"); return i; }
    drift(on) { this.meadow.setDrift(on); if (on) this.mark("Day changes"); }
    mark(label) { this.markers.push({ at: this.hives.ts.blocks.length, label }); }
    // How well would a frozen (no learning) copy of these beliefs pick on today's meadow? (% of best)
    frozenScore(strat) {
      const m = this.meadow, caps = this.caps(), s = strat.clone();
      while (s.k < m.k) s.addArm();
      return (100 * m.mean(s.greedy(caps))) / m.bestMean();
    }
    // Beliefs of one hive about every flower, for drawing.
    beliefs(id) {
      const s = this.hives[id].strat, caps = this.caps();
      return this.meadow.flowers.map((f, i) => {
        const a = s.a[i], b = s.b[i];
        const mean = id === "ts" ? (a / (a + b)) * f.cap : s.est(i);
        const sd = id === "ts" ? Math.sqrt((a * b) / ((a + b) * (a + b) * (a + b + 1))) * f.cap : s.n[i] > 0 ? f.cap * 0.5 / Math.sqrt(s.n[i]) : f.cap;
        const bonus = id === "ucb" ? s.bonus(i, caps[i]) : 0;
        return { n: s.n[i], mean, sd, a, b, bonus, cap: f.cap };
      });
    }
  }

  // Average % of best that each hive gets in its first `steps` visits (for comparing with the kid).
  function firstVisits(steps, runs = 40, seed = 5) {
    const tot = {};
    for (const id of ORDER) tot[id] = 0;
    for (let k = 0; k < runs; k++) {
      const race = new Race(seed + k * 101);
      let got = {}, best = 0;
      for (const id of ORDER) got[id] = 0;
      for (let t = 0; t < steps; t++) {
        const bm = race.meadow.bestMean();
        best += bm;
        for (const o of race.step()) got[o.id] += race.meadow.mean(o.arm);
      }
      for (const id of ORDER) tot[id] += got[id] / best / runs;
    }
    for (const id of ORDER) tot[id] = Math.round(100 * tot[id]);
    return tot;
  }

  return { rng, betaSample, betaPdf, Meadow, Strategy, RandomBee, EpsGreedy, UCB1, Thompson, STRATS, ORDER, Race, firstVisits, NAMES, PART, TIMES, TIME_NAMES };
});
