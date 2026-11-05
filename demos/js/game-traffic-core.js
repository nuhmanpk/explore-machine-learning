// Traffic Light Tamer — a crossroads simulation plus a tabular Q-learning light controller
// and a fixed-timer controller to compare against. No DOM, so it also runs in Node.
//
// Time moves in ticks (1 tick = 1 second of pretend time).
// Approaches: N, S (phase 0 = "north-south green") and E, W (phase 1 = "east-west green").
// When the light switches, there is a yellow gap of `yellow` ticks when nobody moves.
(function (root) {
  const DIRS = ["N", "S", "E", "W"];
  const PHASE_DIRS = [["N", "S"], ["E", "W"]];
  const MAX_Q = 40; // longest queue one approach can hold; more cars detour
  const AMB_PENALTY = 25; // extra "ouch" per tick an ambulance waits (when the ambulance challenge is on)

  // mulberry32: same seed, same traffic
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(lambda, rnd) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rnd(); } while (p > L);
    return k - 1;
  }

  // Traffic settings: cars per tick per approach on each road, ambulances on/off, yellow length.
  const DEFAULTS = { ns: 0.3, ew: 0.3, amb: false, ambEvery: 45, yellow: 2 };

  // Everybody (Robo's crossroads and the timer's crossroads) gets the very same cars.
  class Arrivals {
    constructor(seed) { this.rnd = rng(seed); this.id = 0; }
    next(cfg) {
      const out = [];
      for (const d of DIRS) {
        const lam = d === "N" || d === "S" ? cfg.ns : cfg.ew;
        const n = poisson(lam, this.rnd);
        for (let k = 0; k < n; k++) out.push({ dir: d, amb: false, id: ++this.id });
      }
      if (cfg.amb && this.rnd() < 1 / cfg.ambEvery) out.push({ dir: DIRS[Math.floor(this.rnd() * 4)], amb: true, id: ++this.id });
      return out;
    }
  }

  class World {
    constructor(cfg = {}) {
      this.cfg = { ...DEFAULTS, ...cfg };
      this.q = { N: [], S: [], E: [], W: [] };
      this.phase = 0; // which road has green
      this.yellow = 0; // ticks of yellow left (0 = not switching)
      this.since = 0; // ticks since this green started
      this.t = 0;
      this.resetRound();
      this.total = { wait: 0, cars: 0, ambWait: 0, amb: 0, switches: 0, detours: 0 };
    }
    resetRound() { this.round = { wait: 0, cars: 0, ambWait: 0, amb: 0, switches: 0, ticks: 0, detours: 0 }; }
    queueOf(phase) { const [a, b] = PHASE_DIRS[phase]; return this.q[a].length + this.q[b].length; }
    ambOn(phase) { const [a, b] = PHASE_DIRS[phase]; return this.q[a].some((c) => c.amb) || this.q[b].some((c) => c.amb); }
    waiting() { return this.q.N.length + this.q.S.length + this.q.E.length + this.q.W.length; }
    ambWaiting() { let n = 0; for (const d of DIRS) for (const c of this.q[d]) if (c.amb) n++; return n; }
    canSwitch() { return this.yellow === 0; }
    // One tick. arrivals: from Arrivals.next. wantSwitch: start a yellow now (ignored during yellow).
    // Returns { reward, left: [cars that drove through], cost }.
    step(arrivals, wantSwitch) {
      const cfg = this.cfg;
      if (wantSwitch && this.yellow === 0) {
        this.yellow = Math.max(1, cfg.yellow);
        this.round.switches++; this.total.switches++;
      }
      for (const a of arrivals) {
        // a hopelessly long queue: ordinary drivers give up and take another road (ambulances never do)
        if (!a.amb && this.q[a.dir].length >= MAX_Q) { this.round.detours++; this.total.detours++; continue; }
        const car = { id: a.id, dir: a.dir, amb: a.amb, t0: this.t };
        if (a.amb) this.q[a.dir].unshift(car); // other cars pull over: ambulances go to the front
        else this.q[a.dir].push(car);
        this.round.cars++; this.total.cars++;
        if (a.amb) { this.round.amb++; this.total.amb++; }
      }
      const left = [];
      if (this.yellow > 0) {
        this.yellow--;
        if (this.yellow === 0) { this.phase = 1 - this.phase; this.since = 0; }
      } else {
        for (const d of PHASE_DIRS[this.phase]) if (this.q[d].length) left.push(this.q[d].shift());
        this.since++;
      }
      const w = this.waiting(), aw = this.ambWaiting();
      this.round.wait += w; this.total.wait += w;
      this.round.ambWait += aw; this.total.ambWait += aw;
      this.round.ticks++;
      this.t++;
      const cost = w + (cfg.amb ? AMB_PENALTY * aw : 0);
      return { reward: -cost, left, cost };
    }
    // average wait per car (seconds) this round: waiting car-seconds / cars that came
    avgWait(r = this.round) { return r.cars ? r.wait / r.cars : 0; }
    ambAvgWait(r = this.round) { return r.amb ? r.ambWait / r.amb : 0; }
  }

  // ---------- the Q-learning light ----------
  // State (seen from the light's point of view, so both roads share one table):
  //   no ambulance: cars waiting on the green road (6 bins) x cars waiting on the red road (6 bins)
  //                 x how long the light has been green (4 bins)            -> 144 states
  //   ambulance waiting: which road it is on (green / red) x how long green -> 8 states
  //   (an ambulance matters so much that the queue sizes hardly do, and a small table learns fast)
  const QB = [0, 1, 3, 5, 8, 12]; // bin lower edges: 0 | 1-2 | 3-4 | 5-7 | 8-11 | 12+
  const QB_NAMES = ["0", "1-2", "3-4", "5-7", "8-11", "12+"];
  const TB = [0, 7, 11, 18]; // seconds of green: 4-6 | 7-10 | 11-17 | 18+ (a green always lasts 4 s)
  const TB_NAMES = ["4-6 s", "7-10 s", "11-17 s", "18+ s"];
  const AMB_NAMES = ["no ambulance", "ambulance on the green road", "ambulance on the red road"];
  const NQ = QB.length, NT = TB.length;
  const AMB_BASE = NQ * NQ * NT;
  const NS = AMB_BASE + 2 * NT;
  const bin = (v, edges) => { let b = 0; while (b + 1 < edges.length && v >= edges[b + 1]) b++; return b; };
  const stateIndex = (g, r, t, a = 0) => (a ? AMB_BASE + (a - 1) * NT + t : (t * NQ + g) * NQ + r);
  function observe(world) {
    const p = world.phase;
    const g = world.queueOf(p), r = world.queueOf(1 - p);
    const a = world.ambOn(1 - p) ? 2 : world.ambOn(p) ? 1 : 0;
    const gb = bin(g, QB), rb = bin(r, QB), tb = bin(world.since, TB);
    return { g, r, t: world.since, a, gb, rb, tb, s: stateIndex(gb, rb, tb, a) };
  }

  const KEEP = 0, SWITCH = 1;
  const MIN_GREEN = 4; // like real signal boxes, a green lasts at least a few seconds
  const EPS_FADE = 100; // after this many visits to a situation, curiosity there has halved
  const MAX_GREEN = 60; // safety rule, like real signal boxes: a green never lasts longer than this
  class QAgent {
    constructor(opts = {}, seed = 7) {
      this.eps = opts.eps ?? 0.05; // curiosity: chance of a random try
      this.alpha = opts.alpha ?? 0.1; // how big each lesson is
      this.gamma = opts.gamma ?? 0.9; // how much the future matters
      this.minGreen = opts.minGreen ?? MIN_GREEN; // every green lasts at least this long
      this.Q = new Float64Array(NS * 2); // starts at 0: every untried move looks great (rewards are negative)
      this.N = new Uint32Array(NS * 2); // visit counts
      this.rnd = rng(seed);
      this.pending = null; // { s, a, R, k } transition still running (through a yellow)
      this.last = null; // last decision, for the UI
      this.learn = true;
      this.decisions = 0;
    }
    clone() {
      const c = new QAgent({ eps: this.eps, alpha: this.alpha, gamma: this.gamma, minGreen: this.minGreen });
      c.Q.set(this.Q); c.N.set(this.N); c.decisions = this.decisions;
      return c;
    }
    // Chance of a random try here: starts at eps, fades as this situation becomes familiar.
    curiosity(s) { return this.eps * EPS_FADE / (EPS_FADE + this.visits(s)); }
    values(s) { return [this.Q[s * 2], this.Q[s * 2 + 1]]; }
    visits(s) { return this.N[s * 2] + this.N[s * 2 + 1]; }
    // Best move for state s. o = the observation (for a sensible guess in brand-new situations).
    greedy(s, o) {
      const nk = this.N[s * 2], nw = this.N[s * 2 + 1];
      if (!nk && !nw) return o && o.r > o.g ? SWITCH : KEEP; // never been here: guess "serve the longer line"
      if (!this.learn && (!nk || !nw)) return nk ? KEEP : SWITCH; // frozen brain: only trust moves it has tried
      const k = this.Q[s * 2], w = this.Q[s * 2 + 1];
      if (k === w) return nw < nk ? SWITCH : KEEP;
      return w > k ? SWITCH : KEEP;
    }
    // Called every tick before the world steps. Returns true to start switching.
    act(world, explore = true) {
      if (!world.canSwitch() || world.since < this.minGreen) return false; // yellow, or green just started: nothing to decide
      const o = observe(world);
      if (this.pending) this.finish(o.s);
      let a = this.greedy(o.s, o), why = this.visits(o.s) ? "best" : "guess";
      if (explore && this.learn && this.rnd() < this.curiosity(o.s)) { a = this.rnd() < 0.5 ? KEEP : SWITCH; why = "explore"; }
      if (world.since >= MAX_GREEN && a === KEEP) { a = SWITCH; why = "safety"; } // safety rule: nobody waits forever
      this.pending = { s: o.s, a, R: 0, k: 0 };
      this.last = { ...o, a, why, q: this.values(o.s) };
      this.decisions++;
      return a === SWITCH;
    }
    // Called every tick after the world steps, with that tick's reward.
    feel(reward) {
      const p = this.pending;
      if (!p) return;
      p.R += Math.pow(this.gamma, p.k) * reward;
      p.k++;
    }
    // SMDP Q-learning: a switch lasts the whole yellow, so the future is discounted by gamma^k.
    finish(s2) {
      const p = this.pending;
      this.pending = null;
      if (!this.learn) return;
      const i = p.s * 2 + p.a;
      const best = Math.max(this.Q[s2 * 2], this.Q[s2 * 2 + 1]);
      const target = p.R + Math.pow(this.gamma, p.k) * best;
      this.N[i]++;
      const lr = Math.max(this.alpha, 1 / this.N[i]); // first visits learn fast, then settle to alpha
      this.Q[i] += lr * (target - this.Q[i]);
    }
    forgetPending() { this.pending = null; }
  }

  // The classic: fixed green time for each road, no matter what.
  class TimerCtl {
    constructor(green = 12) { this.green = green; }
    act(world) { return world.canSwitch() && world.since >= this.green; }
  }

  // Run one world with a controller for n ticks (Node tests, checkpoint scoring).
  // ctl: { act(world) → bool, feel?(reward) }
  function run(ctl, cfg, n, seed) {
    const w = new World(cfg), arr = new Arrivals(seed);
    for (let i = 0; i < n; i++) {
      const sw = ctl.act(w);
      const r = w.step(arr.next(w.cfg), sw);
      if (ctl.feel) ctl.feel(r.reward);
    }
    return { avgWait: w.avgWait(w.total), ambAvgWait: w.ambAvgWait(w.total), switches: w.total.switches, cars: w.total.cars, world: w };
  }

  // Race a controller against the timer on the very same cars. Frozen agents are scored without learning.
  function race(agent, cfg, n, seed, green = 12) {
    const wa = new World(cfg), wt = new World(cfg), arr = new Arrivals(seed), timer = new TimerCtl(green);
    for (let i = 0; i < n; i++) {
      const a = arr.next(wa.cfg);
      const r = wa.step(a, agent.act(wa, false));
      if (agent.learn) agent.feel(r.reward);
      wt.step(a, timer.act(wt));
    }
    return {
      robo: { avgWait: wa.avgWait(wa.total), ambAvgWait: wa.ambAvgWait(wa.total), switches: wa.total.switches },
      timer: { avgWait: wt.avgWait(wt.total), ambAvgWait: wt.ambAvgWait(wt.total), switches: wt.total.switches },
    };
  }

  const api = {
    DIRS, PHASE_DIRS, DEFAULTS, AMB_PENALTY, MAX_Q, rng, poisson, Arrivals, World,
    QB, QB_NAMES, TB, TB_NAMES, AMB_NAMES, NQ, NT, AMB_BASE, NS, bin, stateIndex, observe,
    KEEP, SWITCH, MIN_GREEN, MAX_GREEN, QAgent, TimerCtl, run, race, EPS_FADE,
  };
  root.TrafficCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
