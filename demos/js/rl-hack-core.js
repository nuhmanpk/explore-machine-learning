// Reward Hacking — a tiny boat-race world, a hand-written reward with knobs, and a tabular
// Q-learning sailor. No DOM, so it also runs in Node (seeded RNG, fully repeatable).
(function (root) {
  const W = 7, H = 5, MAX_STEPS = 40, GAMMA = 0.95, ALPHA = 0.3;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
  const ROWS = [
    ".......",
    ".BB....",
    "S..##.D",
    ".......",
    ".......",
  ];
  const DRAIN = { x: 0, y: 3 }, FAKE = { x: 0, y: 4 };

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

  // tile kinds: . water, # rock, S start, D dock, B buoy, X drain, F fake finish line
  function makeWorld(opts) {
    opts = opts || {};
    const tiles = [];
    let start = { x: 0, y: 0 }, dock = { x: 0, y: 0 };
    ROWS.forEach((row, y) => [...row].forEach((ch, x) => {
      tiles.push(ch === "S" ? "." : ch);
      if (ch === "S") start = { x, y };
      if (ch === "D") dock = { x, y };
    }));
    if (opts.drain) tiles[DRAIN.y * W + DRAIN.x] = "X";
    if (opts.fake) tiles[FAKE.y * W + FAKE.x] = "F";
    return { tiles, start, dock, opts: { drain: !!opts.drain, fake: !!opts.fake } };
  }

  function defaultReward() {
    return { cp: 2, finish: 10, step: 0.1, loop: 0, realOnly: false };
  }

  // One race. step(a) -> { r, done, kind, touched }. kind is only set when the race ends.
  function Env(world, rw) {
    this.world = world; this.rw = rw;
    this.reset();
  }
  Env.prototype.reset = function () {
    this.x = this.world.start.x; this.y = this.world.start.y;
    this.px = -1; this.py = -1;
    this.steps = 0; this.points = 0; this.touches = 0; this.success = false; this.kind = null;
    this.seen = new Uint8Array(W * H);
    this.seen[this.y * W + this.x] = 1;
    return this.y * W + this.x;
  };
  Env.prototype.step = function (a) {
    const w = this.world, rw = this.rw;
    let nx = this.x + DIRS[a][0], ny = this.y + DIRS[a][1];
    let bumped = false;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || w.tiles[ny * W + nx] === "#") { nx = this.x; ny = this.y; bumped = true; }
    const ni = ny * W + nx, t = w.tiles[ni];
    let r = -rw.step, done = false, kind = null, touched = false;
    if (!bumped && this.seen[ni]) r -= rw.loop;
    if (t === "B") { r += rw.cp; this.touches++; touched = true; }
    if (t === "D") { r += rw.finish; done = true; kind = "dock"; this.success = true; }
    else if (t === "F" && !rw.realOnly) { r += rw.finish; done = true; kind = "fake"; }
    else if (t === "X") { done = true; kind = "drain"; }
    this.px = this.x; this.py = this.y;
    this.x = nx; this.y = ny; this.seen[ni] = 1;
    this.steps++;
    this.points += r;
    if (!done && this.steps >= MAX_STEPS) kind = this.touches >= 4 ? "loop" : "timeout";
    this.kind = kind;
    return { r, done, over: done || this.steps >= MAX_STEPS, kind, touched, bumped, ns: ni };
  };

  function Agent(world, rw, seed) {
    this.world = world; this.rw = rw;
    this.rng = seeded(seed || 1);
    this.Q = new Float64Array(W * H * 4);
    this.Q.fill(0.9 * Math.max(0, rw.finish)); // hopeful start: every move looks good until tried
    this.episodes = 0;
    this.env = new Env(world, rw);
  }
  Agent.prototype.eps = function () { return Math.max(0.05, 0.4 * Math.pow(0.996, this.episodes)); };
  Agent.prototype.maxQ = function (s) { const Q = this.Q; return Math.max(Q[s * 4], Q[s * 4 + 1], Q[s * 4 + 2], Q[s * 4 + 3]); };
  Agent.prototype.pick = function (s, eps) {
    if (this.rng() < eps) return Math.floor(this.rng() * 4);
    const Q = this.Q; let best = -Infinity, c = [];
    for (let a = 0; a < 4; a++) {
      if (Q[s * 4 + a] > best + 1e-9) { best = Q[s * 4 + a]; c = [a]; }
      else if (Math.abs(Q[s * 4 + a] - best) <= 1e-9) c.push(a);
    }
    return c[Math.floor(this.rng() * c.length)];
  };
  // One learning step on the agent's own env (call env.reset() first for a new race).
  Agent.prototype.learnStep = function (explore) {
    const env = this.env, s = env.y * W + env.x;
    const a = this.pick(s, explore === undefined ? this.eps() : explore);
    const res = env.step(a);
    const target = res.done ? res.r : res.r + GAMMA * this.maxQ(res.ns);
    this.Q[s * 4 + a] += ALPHA * (target - this.Q[s * 4 + a]);
    res.s = s; res.a = a;
    return res;
  };
  Agent.prototype.trainEpisode = function () {
    this.env.reset();
    let res;
    do { res = this.learnStep(); } while (!res.over);
    this.episodes++;
    return { points: this.env.points, steps: this.env.steps, kind: this.env.kind || "timeout", success: this.env.success };
  };
  // Follow the best arrows (no learning, no randomness). Returns the path and what happened.
  function rollout(Q, world, rw) {
    const env = new Env(world, rw), path = [{ x: env.x, y: env.y }], buoys = [];
    let res;
    do {
      const s = env.y * W + env.x;
      let a = 0;
      for (let k = 1; k < 4; k++) if (Q[s * 4 + k] > Q[s * 4 + a] + 1e-9) a = k;
      res = env.step(a);
      path.push({ x: env.x, y: env.y });
      if (res.touched) buoys.push(path.length - 1);
    } while (!res.over);
    return { path, buoys, points: env.points, steps: env.steps, success: env.success, kind: env.kind || "timeout", touches: env.touches };
  }
  // Train n episodes from scratch; returns the agent and the final greedy rollout.
  function train(world, rw, seed, n) {
    const ag = new Agent(world, rw, seed);
    for (let i = 0; i < n; i++) ag.trainEpisode();
    return { agent: ag, run: rollout(ag.Q, world, rw) };
  }
  const isHack = (kind) => kind === "loop" || kind === "fake";

  const api = { W, H, MAX_STEPS, GAMMA, ALPHA, DIRS, ROWS, makeWorld, defaultReward, Env, Agent, rollout, train, seeded, isHack };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HackCore = api;
})(typeof window !== "undefined" ? window : globalThis);
