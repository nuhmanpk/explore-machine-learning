// Bird Learns to Fly — game + tabular Q-learning agent. No DOM, so it also runs in Node.
(function (root) {
  const W = 400, H = 400;
  const BIRD_X = 90, BIRD_R = 11;
  const GRAVITY = 0.45, FLAP = -6.6, MAX_FALL = 9;
  const PIPE_W = 52, PIPE_SPACE = 210, SPEED = 3;

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

  // Challenges the page can switch on while Robo is learning.
  // wind: random gusts push the bird up or down. bob: pipes slide up and down.
  const world = { wind: false, bob: false };

  class Game {
    constructor(gap = 120, seed = Math.floor(Math.random() * 1e9)) {
      this.gap = gap;
      this.rnd = seeded(seed);
      this.y = H / 2;
      this.vy = 0;
      this.pipes = [];
      this.score = 0;
      this.steps = 0;
      this.dead = false;
      for (let i = 0; i < 3; i++) this.addPipe(W + 60 + i * PIPE_SPACE);
    }
    addPipe(x) {
      const margin = 50;
      const gy = margin + this.gap / 2 + this.rnd() * (H - 2 * margin - this.gap);
      this.pipes.push({ x, gy, base: gy, phase: this.rnd() * Math.PI * 2, passed: false });
    }
    // The first pipe the bird hasn't fully passed yet.
    nextPipe() {
      return this.pipes.find((p) => p.x + PIPE_W > BIRD_X - BIRD_R);
    }
    step(flap) {
      if (this.dead) return;
      this.steps++;
      if (flap) this.vy = FLAP;
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
      if (world.wind) {
        if (!this.gust && this.rnd() < 1 / 110) this.gust = { dir: this.rnd() < 0.5 ? -1 : 1, left: 30 + Math.floor(this.rnd() * 25) };
        if (this.gust) {
          this.vy += 0.16 * this.gust.dir;
          if (--this.gust.left <= 0) this.gust = null;
        }
      } else this.gust = null;
      if (world.bob) {
        const margin = 30 + this.gap / 2;
        for (const p of this.pipes) p.gy = Math.max(margin, Math.min(H - margin, p.base + Math.sin(this.steps * 0.035 + p.phase) * 45));
      }
      this.y += this.vy;
      for (const p of this.pipes) {
        p.x -= SPEED;
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) { p.passed = true; this.score++; }
      }
      if (this.pipes[0].x + PIPE_W < -10) {
        this.pipes.shift();
        this.addPipe(this.pipes[this.pipes.length - 1].x + PIPE_SPACE);
      }
      if (this.y - BIRD_R < 0 || this.y + BIRD_R > H) this.dead = true;
      for (const p of this.pipes) {
        if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
          if (this.y - BIRD_R < p.gy - this.gap / 2 || this.y + BIRD_R > p.gy + this.gap / 2) this.dead = true;
        }
      }
    }
    // What the bird "feels": how far to the next pipe, how far the gap is above/below, how fast it falls.
    sense() {
      const p = this.nextPipe();
      return { dx: p.x + PIPE_W - BIRD_X, dy: p.gy - this.y, vy: this.vy, wind: this.gust ? this.gust.dir : 0 };
    }
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Bins kept deliberately small so the table fills up fast (~25 tries to average 10 pipes,
  // vs ~120 with fine distance bins): pipe distance near/mid/far, gap height −8..8, fall speed 0..4.
  const DX_BINS = 3, DY_MIN = -8, DY_MAX = 8;
  function stateKey(s) {
    const dx = s.dx < 60 ? 0 : s.dx < 140 ? 1 : 2;
    const dy = clamp(Math.round(s.dy / 15), DY_MIN, DY_MAX);
    const vy = clamp(Math.floor((s.vy + 7) / 4), 0, 4);
    // The wind sense adds whole new pages to the table, so with no wind nothing changes.
    const wind = s.wind ? (s.wind < 0 ? 1 : 2) : 0;
    return wind * 10000 + dx * 1000 + (dy + 10) * 10 + vy;
  }
  function decode(k) {
    return { dx: Math.floor(k / 1000) % 10, dy: Math.floor((k % 1000) / 10) - 10, vy: k % 10, wind: Math.floor(k / 10000) };
  }

  class Agent {
    constructor() {
      this.Q = new Map(); // key → [wait, flap]
      this.N = new Map(); // how often each (situation, move) was tried
      this.alpha = 0.6;
      this.gamma = 0.95;
      this.epsilon = 0;
    }
    q(k) {
      let v = this.Q.get(k);
      if (!v) { v = [0, 0]; this.Q.set(k, v); }
      return v;
    }
    act(k, explore = true) {
      const v = this.q(k);
      if (explore && Math.random() < this.epsilon) return Math.random() < 0.15 ? 1 : 0;
      if (v[0] === v[1]) return 0;
      return v[1] > v[0] ? 1 : 0;
    }
    learn(k, a, r, k2, done) {
      const v = this.q(k);
      const target = done ? r : r + this.gamma * Math.max(...this.q(k2));
      // Big steps for new situations, gentler ones for familiar ones (never below 0.15),
      // so random gusts can't wipe out what it already knows.
      const n = (this.N.get(k * 2 + a) || 0) + 1;
      this.N.set(k * 2 + a, n);
      const lr = Math.max(0.15, this.alpha / Math.sqrt(n / 8 + 1));
      v[a] += lr * (target - v[a]);
    }
    clone() {
      const c = new Agent();
      for (const [k, v] of this.Q) c.Q.set(k, v.slice());
      c.N = new Map(this.N);
      return c;
    }
  }

  // Play one whole try. Returns the score. Learns on the way unless learn=false.
  // Rewards: +1 for each step alive, +5 for each pipe passed, -100 for crashing.
  function playEpisode(agent, gap, learn = true, maxSteps = 6000) {
    const g = new Game(gap);
    let k = stateKey(g.sense());
    while (!g.dead && g.steps < maxSteps) {
      const a = agent.act(k, learn);
      const before = g.score;
      g.step(a === 1);
      const k2 = g.dead ? k : stateKey(g.sense());
      const r = g.dead ? -100 : 1 + (g.score > before ? 5 : 0);
      if (learn) agent.learn(k, a, r, k2, g.dead);
      k = k2;
    }
    return g.score;
  }

  const api = { world, DX_BINS, DY_MIN, DY_MAX, W, H, BIRD_X, BIRD_R, PIPE_W, Game, Agent, stateKey, decode, playEpisode };
  root.FlappyRL = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
