// Rock, Paper, Mind Reader — Robo predicts your next move with five little "spotters"
// (experts) and trusts the ones that have been right lately (a mixture of experts).
// Pure logic, no DOM, so it also runs in Node.
//
// Moves: 0 = rock, 1 = paper, 2 = scissors. beats(m) is the move that beats m.
(function (root) {
  const MOVES = ["rock", "paper", "scissors"];
  const SHORT = ["R", "P", "S"];
  const beats = (m) => (m + 1) % 3; // paper beats rock, scissors beat paper, rock beats scissors
  // Result for the KID: 1 = kid wins, 0 = tie, -1 = Robo wins.
  const result = (kid, robo) => (kid === robo ? 0 : kid === beats(robo) ? 1 : -1);
  const RES_KEY = { 1: "w", 0: "t", "-1": "l" };

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

  // h = history: [{ kid, robo, res }] (res is from the kid's side)
  const last = (h, k) => h[h.length - k];

  // A spotter counts "what came next" for each situation (context). Relative spotters count a SHIFT
  // from a base move (0 = same as base, 1 = the move that beats base, 2 = the move base beats).
  class Spotter {
    constructor(id, name, short, ctx, base, labels) {
      this.id = id;
      this.name = name; // kid words
      this.short = short;
      this.ctx = ctx; // h → context key, or null when there's not enough history yet
      this.base = base; // h → base move (null = absolute counts over rock/paper/scissors)
      this.labels = labels; // column names for the pattern table
      this.table = new Map();
      this.acc = 1 / 3; // recent accuracy (fades old rounds)
      this.hits = []; // last 10 hits, for "right 7 of 10"
    }
    counts(key) {
      let c = this.table.get(key);
      if (!c) { c = [0, 0, 0]; this.table.set(key, c); }
      return c;
    }
    // Chance of each of the kid's moves next.
    predict(h) {
      const key = this.ctx(h);
      if (key === null) return { key, p: [1 / 3, 1 / 3, 1 / 3], n: 0 };
      const c = this.table.get(key) || [0, 0, 0];
      const n = c[0] + c[1] + c[2];
      const q = c.map((v) => (v + 0.2) / (n + 0.6));
      if (!this.base) return { key, p: q, n };
      const b = this.base(h);
      const p = [0, 0, 0];
      for (let s = 0; s < 3; s++) p[(b + s) % 3] = q[s];
      return { key, p, n };
    }
    learn(h, move, decay) {
      const key = this.ctx(h);
      if (key === null) return;
      const c = this.counts(key);
      for (let i = 0; i < 3; i++) c[i] *= decay;
      c[this.base ? (move - this.base(h) + 3) % 3 : move] += 1;
    }
  }

  const SHIFT = ["same again", "the move that beats it", "the move it beats"];
  function makeSpotters() {
    return [
      new Spotter("fav", "your favourite move", "Favourite", () => "all", null, MOVES),
      new Spotter("after1", "what you play after your last move", "After 1 move", (h) => (h.length >= 1 ? SHORT[last(h, 1).kid] : null), null, MOVES),
      new Spotter("after2", "your last two moves", "After 2 moves", (h) => (h.length >= 2 ? SHORT[last(h, 2).kid] + SHORT[last(h, 1).kid] : null), null, MOVES),
      new Spotter("wsls", "what you do after a win, loss or tie", "Win / lose", (h) => (h.length >= 1 ? RES_KEY[last(h, 1).res] : null), (h) => last(h, 1).kid, SHIFT),
      new Spotter("copy", "whether you copy my last move", "Copies Robo", (h) => (h.length >= 1 ? "all" : null), (h) => last(h, 1).robo, ["copy Robo", "beat Robo's last", "lose to Robo's last"]),
    ];
  }

  const argmaxTies = (p) => {
    const m = Math.max(...p);
    const out = [];
    for (let i = 0; i < p.length; i++) if (p[i] > m - 1e-9) out.push(i);
    return out;
  };

  class Robo {
    constructor(opts = {}) {
      this.memory = opts.memory ?? 0.9; // how much of each old count is kept per new round (smaller = forgets faster)
      this.beta = opts.beta ?? 10; // how strongly trust follows recent accuracy
      this.accFade = opts.accFade ?? 0.85; // how fast "recent accuracy" forgets
      this.spotters = makeSpotters();
      this.history = [];
      this.rounds = 0;
    }
    // Trust in each spotter: exp(beta · recent accuracy), shared out to add up to 1.
    trust() {
      const e = this.spotters.map((s) => Math.exp(this.beta * s.acc));
      const t = e.reduce((a, b) => a + b, 0);
      return e.map((v) => v / t);
    }
    // Mixed guess about the kid's next move.
    belief(h = this.history) {
      const preds = this.spotters.map((s) => s.predict(h));
      const w = this.trust();
      const p = [0, 0, 0];
      preds.forEach((pr, i) => pr.p.forEach((v, m) => (p[m] += w[i] * v)));
      return { p, preds, w };
    }
    // Lock in a move BEFORE the kid chooses: guess their move, then play what beats it.
    decide(rnd = Math.random) {
      const b = this.belief();
      const tied = argmaxTies(b.p);
      const guess = tied[Math.floor(rnd() * tied.length)];
      return { ...b, guess, move: beats(guess), sure: b.p[guess] };
    }
    // After the reveal: score each spotter, update the tables, remember the round.
    observe(kid, robo, { learn = true } = {}) {
      const h = this.history;
      const res = result(kid, robo);
      if (learn) {
        for (const s of this.spotters) {
          const { p } = s.predict(h);
          const tied = argmaxTies(p);
          const hit = tied.includes(kid) ? 1 / tied.length : 0;
          s.acc = this.accFade * s.acc + (1 - this.accFade) * hit;
          s.hits.push(hit);
          if (s.hits.length > 10) s.hits.shift();
          s.learn(h, kid, this.memory);
        }
        this.rounds++;
      }
      h.push({ kid, robo, res });
      if (h.length > 60) h.shift();
      return res;
    }
    top() {
      const w = this.trust();
      let b = 0;
      for (let i = 1; i < w.length; i++) if (w[i] > w[b]) b = i;
      return this.spotters[b];
    }
    clone() {
      const r = new Robo({ memory: this.memory, beta: this.beta, accFade: this.accFade });
      r.history = this.history.map((x) => ({ ...x }));
      r.rounds = this.rounds;
      r.spotters.forEach((s, i) => {
        const o = this.spotters[i];
        s.acc = o.acc;
        s.hits = o.hits.slice();
        for (const [k, v] of o.table) s.table.set(k, v.slice());
      });
      return r;
    }
  }

  // Robot players. play(h, rnd): h is from the player's side (kid = the bot, robo = Robo).
  const BOTS = {
    rocky: { name: "Always-rock", blurb: "Plays rock. Every. Single. Time.", play: () => 0 },
    cycler: { name: "Cycler", blurb: "Rock, paper, scissors, rock, paper… round and round.", play: (h) => (h.length ? (last(h, 1).kid + 1) % 3 : 0) },
    copycat: { name: "Copycat", blurb: "Copies whatever Robo played last time.", play: (h, rnd) => (h.length ? last(h, 1).robo : Math.floor(rnd() * 3)) },
    sore: {
      name: "Sore loser",
      blurb: "Wins? Plays the same again. Loses? Switches to what would have won.",
      play: (h, rnd) => {
        if (!h.length) return Math.floor(rnd() * 3);
        const l = last(h, 1);
        if (l.res === 1) return l.kid;
        if (l.res === -1) return beats(l.robo);
        return Math.floor(rnd() * 3);
      },
    },
    dice: { name: "Truly random", blurb: "Rolls a dice every round. No habits at all.", play: (h, rnd) => Math.floor(rnd() * 3) },
  };

  // One full round. kidMove may be a number or a function (history → move).
  function playRound(robo, kidMove, rnd = Math.random) {
    const d = robo.decide(rnd);
    const kid = typeof kidMove === "function" ? kidMove(robo.history, rnd) : kidMove;
    const res = robo.observe(kid, d.move);
    return { kid, robo: d.move, res, guess: d.guess, sure: d.sure, top: robo.top().id };
  }

  // Play n rounds against a bot; returns the rounds.
  function match(robo, botId, n, rnd = Math.random) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(playRound(robo, BOTS[botId].play, rnd));
    return out;
  }

  // Share of rounds Robo won.
  const roboWinRate = (rounds) => (rounds.length ? rounds.filter((r) => r.res === -1).length / rounds.length : 0);

  // How a frozen (no-learning) brain would do against a fixed list of kid moves, or a bot.
  function frozenTest(robo, opponent, n, rnd = Math.random) {
    const r = robo.clone();
    let wins = 0, played = 0;
    for (let i = 0; i < n; i++) {
      const kid = Array.isArray(opponent) ? opponent[i] : BOTS[opponent].play(r.history, rnd);
      if (kid === undefined) break;
      const d = r.decide(rnd);
      if (r.observe(kid, d.move, { learn: false }) === -1) wins++;
      played++;
    }
    return { wins, played };
  }

  const api = { MOVES, SHORT, SHIFT, beats, result, seeded, Robo, BOTS, playRound, match, roboWinRate, frozenTest };
  root.RPSCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
