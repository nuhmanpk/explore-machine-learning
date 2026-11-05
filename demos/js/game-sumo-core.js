// Sumo Bots — a round ring, two round bots with simple physics, and self-play neuroevolution.
// Each bot's brain is a small neural net. A population of brains wrestles each other and a
// "hall of fame" of old champions; the best ones have (mutated) babies.
// No DOM, seeded RNG, so it also runs in Node (needs game-net.js for the Net class).
(function (root) {
  const GN = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);

  // ---------- world constants (ring radius 1 = the normal ring) ----------
  const STEPS = 330;           // one bout ≈ 11 s at 30 steps per second
  const SHRINK_AT = 0.35, SHRINK_TO = 0.3; // after a third of the bout the ring slowly shrinks, so every bout must be decided
  const BOT_R = 0.11;          // bot radius
  const VREF = 0.04;           // a "normal" top speed, used to scale speed senses
  const POP = 40;              // brains in the team
  const MATCHES = 16;          // bouts per brain per generation
  const SIZES = [12, 8, 2];    // 12 senses → 8 thinking neurons → throttle (forward/back) + turn (left/right)
  const TURN = 0.09;           // fastest turn, radians per step
  const INPUT_NAMES = [
    "Gap to rival", "Rival is ahead", "Rival is to my left", "My room to the edge", "Rival's room to edge",
    "Ring centre ahead", "Ring centre to my left", "My speed forward", "My speed sideways",
    "Rival aims at me", "Rival aims to my left", "Rival is heavier",
  ];
  let S_JUDGE = 0.15, S_ADV = 0.5; // (tunable in tests)
  const DEFAULT_RULES = { icy: false, small: false, heavy: false };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussFrom(rng) {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  // The ground and the ring for a set of rules.
  function physics(rules) {
    const r = Object.assign({}, DEFAULT_RULES, rules);
    return {
      R: r.small ? 0.72 : 1,
      drag: r.icy ? 0.022 : 0.08,      // fraction of speed lost each step
      acc: r.icy ? 0.0013 : 0.0036,    // how hard the wheels can push (less grip on ice)
      bounce: r.icy ? 0.5 : 0.15,
    };
  }

  // Ring radius at step t: full size, then it slowly shrinks so every bout must be decided.
  function ringAt(R, t) {
    const k = clamp((t / STEPS - SHRINK_AT) / (1 - SHRINK_AT), 0, 1);
    return R * (1 - (1 - SHRINK_TO) * k);
  }

  function newBrain(rng) {
    const n = new GN.Net(SIZES, new Float64Array(0));
    let total = 0;
    for (let i = 0; i < SIZES.length - 1; i++) total += (SIZES[i] + 1) * SIZES[i + 1];
    const g = new Float64Array(total);
    for (let i = 0; i < total; i++) g[i] = gaussFrom(rng) * 0.6;
    n.genes = g;
    return n;
  }
  function cloneBrain(b) { return new GN.Net(b.sizes, b.genes); }

  // Scripted sparring partner (not a learner): used as an outside "exam" that never changes.
  const SCRIPTED = {
    // always turns toward you and charges at full speed
    // always turns toward you and charges, but backs off when it gets too near the edge itself
    chuck: {
      name: "Charging Chuck",
      think: (x) => {
        if (x[3] < 0.18 && x[5] < 0.3) return [0.6, clamp(Math.atan2(x[6], x[5]) * 2.5, -1, 1)]; // edge! steer back to the middle
        return [1, clamp(Math.atan2(x[2], x[1]) * 2.5, -1, 1)];
      },
    },
  };

  // ---------- one bout ----------
  class Bot {
    constructor(brain, x, y, th, heavy) {
      this.brain = brain;           // a Net, "human", or a SCRIPTED key
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.th = th;                 // heading (radians): the way its nose points
      this.m = heavy ? 2 : 1;
      this.r = heavy ? BOT_R * 1.3 : BOT_R;
      this.power = heavy ? 0.85 : 1;  // the big bot is a bit slower to get going
      this.thr = 0; this.turn = 0;    // what it chose this step
      this.out = false;
    }
  }

  // start: { ang, side, spin } (all in 0..1) so every brain can face the same set of starts
  class Match {
    constructor(brainA, brainB, rules, start) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      this.ph = physics(this.rules);
      const R = this.ph.R, a = start.ang * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a), jit = (start.side - 0.5) * 0.24 * R;
      const d = 0.42 * R, tw = (start.spin - 0.5) * 1.2; // a little twist so bots don't always face dead-on
      this.a = new Bot(brainA, -cx * d - cy * jit, -cy * d + cx * jit, a + tw, false);
      this.b = new Bot(brainB, cx * d + cy * jit, cy * d - cx * jit, a + Math.PI + tw, this.rules.heavy); // mirror image of A: a fair start
      this.t = 0;
      this.R = R;            // the ring right now (it shrinks near the end)
      this.done = false;
      this.winner = -1;      // 0 = A, 1 = B, -1 = nobody (time up or both out)
      this.how = "";         // "push" | "dodge" (ring-out) | "judge" (time up) | "both"
      this.lastTouch = -999; // step of the last bump
      this.touches = 0;
      this.bump = 0;
      this.adv = 0;          // running sum: how much nearer the rope the rival was than A
      this.input = [new Float64Array(12), new Float64Array(12)];
    }
    // What a bot senses, in its own frame: "ahead" is where its nose points, "left" is its left.
    sense(me, op, out) {
      const R = this.R;
      const hx = Math.cos(me.th), hy = Math.sin(me.th), lx = -hy, ly = hx;
      const dx = op.x - me.x, dy = op.y - me.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const x = out || new Float64Array(12);
      x[0] = dist / R - 0.6;
      x[1] = (dx * hx + dy * hy) / dist;
      x[2] = (dx * lx + dy * ly) / dist;
      x[3] = (R - Math.hypot(me.x, me.y)) / R;
      x[4] = (R - Math.hypot(op.x, op.y)) / R;
      x[5] = -(me.x * hx + me.y * hy) / R;
      x[6] = -(me.x * lx + me.y * ly) / R;
      x[7] = (me.vx * hx + me.vy * hy) / VREF;
      x[8] = (me.vx * lx + me.vy * ly) / VREF;
      const ohx = Math.cos(op.th), ohy = Math.sin(op.th);
      x[9] = -(ohx * dx + ohy * dy) / dist;            // 1 = its nose points right at me
      x[10] = (ohy * dx - ohx * dy) / dist;            // + = it aims to one side of me, - = the other
      x[11] = op.m / me.m - 1;
      return x;
    }
    // Returns [throttle, turn], each -1..1.
    think(me, op, slot, human) {
      if (me.brain === "human") {
        // the player points where to go; the bot turns toward it and drives
        const h = human || { x: 0, y: 0 };
        const mag = Math.min(1, Math.hypot(h.x, h.y));
        if (mag < 0.1) return [0, 0];
        let err = Math.atan2(h.y, h.x) - me.th;
        while (err > Math.PI) err -= 2 * Math.PI;
        while (err < -Math.PI) err += 2 * Math.PI;
        return [mag * Math.max(-0.3, Math.cos(err)), clamp(err * 2.5, -1, 1)];
      }
      const x = this.sense(me, op, this.input[slot]);
      if (typeof me.brain === "string") return SCRIPTED[me.brain].think(x);
      const o = me.brain.forward(x);
      return [o[0], o[1]];
    }
    step(human) {
      if (this.done) return;
      const { a, b } = this, ph = this.ph;
      const ta = this.think(a, b, 0, human), tb = this.think(b, a, 1, human);
      a.thr = ta[0]; a.turn = ta[1]; b.thr = tb[0]; b.turn = tb[1];
      for (const bot of [a, b]) {
        bot.th += bot.turn * TURN;
        const f = bot.thr * ph.acc * bot.power;
        bot.vx = (bot.vx + Math.cos(bot.th) * f) * (1 - ph.drag);
        bot.vy = (bot.vy + Math.sin(bot.th) * f) * (1 - ph.drag);
        bot.x += bot.vx; bot.y += bot.vy;
      }
      // bump: push apart, share the momentum (heavier bots move less)
      let nx = b.x - a.x, ny = b.y - a.y;
      const d = Math.hypot(nx, ny), minD = a.r + b.r;
      this.bump = 0;
      if (d < minD) {
        nx /= d || 1; ny /= d || 1;
        const over = minD - d, wa = b.m / (a.m + b.m), wb = a.m / (a.m + b.m);
        a.x -= nx * over * wa; a.y -= ny * over * wa;
        b.x += nx * over * wb; b.y += ny * over * wb;
        const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vrel < 0) {
          const j = (-(1 + ph.bounce) * vrel) / (1 / a.m + 1 / b.m);
          a.vx -= (j / a.m) * nx; a.vy -= (j / a.m) * ny;
          b.vx += (j / b.m) * nx; b.vy += (j / b.m) * ny;
          this.bump = Math.min(1, -vrel / VREF);
        }
        if (this.t - this.lastTouch > 1) this.touches++;
        this.lastTouch = this.t;
      }
      this.t++;
      this.R = ringAt(ph.R, this.t);
      this.adv += (Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y)) / ph.R;
      const outA = Math.hypot(a.x, a.y) > this.R, outB = Math.hypot(b.x, b.y) > this.R;
      a.out = outA; b.out = outB;
      if (outA || outB) {
        this.done = true;
        if (outA && outB) { this.winner = -1; this.how = "both"; }
        else {
          this.winner = outA ? 1 : 0;
          this.how = this.t - this.lastTouch <= 24 ? "push" : "dodge";
        }
      } else if (this.t >= STEPS) {
        // time up: the judge gives the bout to whoever is nearer the middle
        this.done = true;
        const ra = Math.hypot(a.x, a.y), rb = Math.hypot(b.x, b.y);
        this.margin = Math.abs(ra - rb) / this.R;
        this.winner = this.margin < 0.04 ? -1 : ra < rb ? 0 : 1;
        this.how = "judge";
      }
    }
    run(human) { while (!this.done) this.step(human); return this; }
    // Score for bot A (the one being tested). Winning fast is best, losing late beats losing early.
    scoreA() {
      const T = this.t / STEPS;
      // time up: only a small reward for being nearer the middle, so pushing the rival out is worth much more
      if (this.how === "judge") return (S_JUDGE + this.margin) * (this.winner === 0 ? 1 : this.winner === 1 ? -1 : 0) + S_ADV * this.adv / this.t;
      if (this.winner === 0) return 1 + 0.5 * (1 - T);   // ring-out win: faster is better
      if (this.winner === 1) return -1 + 0.3 * T;         // ring-out loss: lasting longer is a bit better
      return 0;
    }
  }

  // A fixed set of starting spots (both sides mirrored), shared by every brain in a test.
  function makeStarts(rng, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ ang: rng(), side: rng(), spin: rng() });
    return out;
  }
  const BENCH_STARTS = makeStarts(seeded(4242), 12);

  // Win rate of `brain` (as A) against a list of opponents, over the fixed bench starts. Draw = half a win.
  function winRate(brain, opponents, rules, nStarts = 6) {
    let s = 0, n = 0;
    for (const op of opponents)
      for (let k = 0; k < nStarts; k++) {
        const m = new Match(brain, op, rules, BENCH_STARTS[k]).run();
        s += m.winner === 0 ? 1 : m.winner === -1 ? 0.5 : 0;
        n++;
      }
    return n ? s / n : 0;
  }

  // ---------- self-play neuroevolution ----------
  class Trainer {
    constructor(seed = 1, opts = {}) {
      this.rng = seeded(seed);
      this.pop = Array.from({ length: POP }, () => newBrain(this.rng));
      this.rules = Object.assign({}, DEFAULT_RULES, opts.rules);
      this.mutation = opts.mutation ?? 0.3;
      this.useHof = opts.useHof ?? true;
      this.matches = opts.matches || MATCHES;
      this.chuckOnly = !!opts.chuckOnly; // (test only) train against the scripted charger instead of each other
      this.hof = [];           // { gen, brain } champions of past generations
      this.gen = 1;
      this.history = [];       // per generation: { gen, early, chuck, push, dodge, judge (share of wins), win, fit, mean }
      this.champion = null;
      this.startGen();
    }
    startGen() {
      const rng = this.rng;
      this.starts = makeStarts(rng, this.matches);
      this.jobs = [];
      // Every brain meets the same old champions (fair to compare), plus a few random teammates.
      const h = this.hof, nH = this.useHof && h.length ? Math.min(h.length, Math.ceil(this.matches / 2)) : 0;
      const hofOps = [];
      if (nH) {
        hofOps.push(h[h.length - 1].brain); // always the latest champion
        while (hofOps.length < nH) hofOps.push(h[Math.floor(rng() * h.length)].brain); // any past champion, even very old ones
      }
      for (let i = 0; i < POP; i++)
        for (let m = 0; m < this.matches; m++) {
          let op;
          if (this.chuckOnly) op = "chuck";
          else if (m < nH) op = hofOps[m];
          else {
            let j = Math.floor(rng() * (POP - 1));
            if (j >= i) j++;
            op = this.pop[j];
          }
          this.jobs.push({ i, op, start: this.starts[m] });
        }
      this.next = 0;
      this.fit = new Float64Array(POP);
      this.tally = { push: 0, dodge: 0, judge: 0, win: 0, loss: 0, n: 0 };
    }
    get progress() { return this.next / this.jobs.length; }
    // Play bouts until the time budget runs out (or `maxJobs`). Returns true when a generation finished.
    work(budgetMs = 8, now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()), maxJobs = Infinity) {
      const t0 = now();
      let done = 0;
      while (this.next < this.jobs.length && done < maxJobs) {
        const j = this.jobs[this.next++];
        const m = new Match(this.pop[j.i], j.op, this.rules, j.start).run();
        this.fit[j.i] += m.scoreA();
        const T = this.tally;
        T.n++;
        if (m.winner === 0) { T.win++; T[m.how]++; }
        else if (m.winner === 1) T.loss++;
        done++;
        if ((done & 3) === 0 && now() - t0 > budgetMs) break;
      }
      if (this.next >= this.jobs.length) { this.endGen(); return true; }
      return false;
    }
    runGeneration() { while (!this.work(1e9, () => 0)); }
    earlyChamps() { return this.hof.slice(0, 3).map((h) => h.brain); }
    endGen() {
      const fit = this.fit;
      const order = Array.from({ length: POP }, (_, i) => i).sort((a, b) => fit[b] - fit[a]);
      // Fitness from 16 bouts is still noisy, so the top 4 play an extra "final" against old champions; the best of those is the champion.
      let champI = order[0];
      if (this.hof.length >= 2) {
        const h = this.hof, panel = h.slice(-3).map((x) => x.brain);
        for (let k = 0; k < 3; k++) panel.push(h[Math.floor(this.rng() * h.length)].brain);
        let best = -1;
        for (const i of order.slice(0, 4)) {
          const w = winRate(this.pop[i], panel, this.rules, 4) + fit[i] / this.matches / 100;
          if (w > best) { best = w; champI = i; }
        }
      }
      this.champion = cloneBrain(this.pop[champI]);
      this.hof.push({ gen: this.gen, brain: this.champion });
      if (this.hof.length > 40) this.hof.splice(3 + Math.floor(this.rng() * (this.hof.length - 8)), 1); // keep the first three
      const T = this.tally;
      const ex = this.exam(this.champion);
      const rec = {
        gen: this.gen,
        early: ex.early,
        chuck: ex.chuck,
        push: T.push / T.win || 0, dodge: T.dodge / T.win || 0, judge: T.judge / T.win || 0, win: T.win / T.n,
        fit: fit[order[0]] / this.matches,
        mean: fit.reduce((a, v) => a + v, 0) / POP / this.matches,
      };
      this.history.push(rec);
      this.pop = this.breed(order);
      this.gen++;
      this.startGen();
      return rec;
    }
    // Genetic algorithm with a seeded RNG: keep the best 3, the rest are (mixed) copies of the top quarter with small random changes.
    breed(order) {
      const rng = this.rng, elite = 3, top = order.slice(0, Math.round(POP * 0.25));
      const pick = () => this.pop[top[Math.floor(Math.pow(rng(), 1.5) * top.length)]];
      const out = order.slice(0, elite).map((i) => cloneBrain(this.pop[i]));
      while (out.length < POP) {
        const p = pick();
        const child = cloneBrain(p);
        if (rng() < 0.3) { const q = pick(); for (let k = 0; k < child.genes.length; k++) if (rng() < 0.5) child.genes[k] = q.genes[k]; }
        const amt = this.mutation * (0.25 + 1.75 * rng());
        for (let k = 0; k < child.genes.length; k++) if (rng() < 0.3) child.genes[k] += gaussFrom(rng) * amt;
        out.push(child);
      }
      return out;
    }
    // The exam the chart shows: win rate (%) against the first three champions, and against Charging Chuck.
    exam(brain, rules = this.rules) {
      return {
        early: Math.round(100 * winRate(brain, this.earlyChamps(), rules, 12)),
        chuck: Math.round(100 * winRate(brain, ["chuck"], rules, 12)),
      };
    }
    // Change the rules mid-training. Returns how the current champion does under the NEW rules (the "shock").
    setRules(rules) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      const shock = this.champion ? this.exam(this.champion) : null;
      // restart this generation's bouts under the new rules (keeps it fair for every brain)
      const keepGen = this.gen;
      this.startGen();
      this.gen = keepGen;
      return shock;
    }
  }

  const api = { ringAt, SHRINK_AT, SHRINK_TO, tune: (j, a) => { S_JUDGE = j; S_ADV = a; }, STEPS, BOT_R, VREF, POP, MATCHES, SIZES, INPUT_NAMES, DEFAULT_RULES, SCRIPTED, BENCH_STARTS, seeded, physics, newBrain, cloneBrain, makeStarts, winRate, Match, Trainer };
  root.SumoCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
