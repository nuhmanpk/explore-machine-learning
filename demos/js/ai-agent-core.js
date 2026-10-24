// Robot Vacuum — the room, the robot's senses, a hand-written rule controller and a
// tabular Q-learning controller. No DOM, so it also runs in Node.
(function (root) {
  const W = 14, H = 10;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
  const START = { x: 1, y: H - 2, dir: 0 };
  const STAIRS = { x0: W - 2, y0: 0, x1: W - 1, y1: 2 }; // reserved corner (free floor unless stairs are on)
  const EP_STEPS = 160;
  const SENSE_RANGE = 3; // the dirt-sensor only smells dirt this many squares away
  const DIRT_RATE = 0.08; // new dirt per step: enough that cleaning fast really matters
  const ACTIONS = ["Go forward", "Turn left", "Turn right"];

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
  const idx = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const inStairs = (x, y) => x >= STAIRS.x0 && x <= STAIRS.x1 && y >= STAIRS.y0 && y <= STAIRS.y1;

  // ---------- furniture layout ----------
  // 5 pieces of furniture that never block the start, the stairs corner, or cut the room in two.
  const PIECE_NAMES = ["sofa", "table", "bed", "shelf", "plant"];
  function makeLayout(seed) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const r = seeded(seed * 1009 + attempt * 31 + 7);
      const blocked = new Array(W * H).fill(0);
      const pieces = [];
      const sizes = [[3, 1], [2, 2], [2, 2], [1, 3], [1, 1]];
      let ok = true;
      for (let k = 0; k < sizes.length && ok; k++) {
        let placed = false;
        for (let t = 0; t < 40 && !placed; t++) {
          const [w, h] = sizes[k];
          const x = 1 + Math.floor(r() * (W - 2 - w)), y = 1 + Math.floor(r() * (H - 2 - h));
          let free = true;
          for (let yy = y - 1; yy <= y + h && free; yy++)
            for (let xx = x - 1; xx <= x + w && free; xx++) {
              if (!inside(xx, yy)) continue;
              if (blocked[idx(xx, yy)]) free = false; // keep a 1-cell gap between pieces
              if (xx === START.x && yy === START.y) free = false;
              if (inStairs(xx, yy) || (xx >= STAIRS.x0 - 1 && yy <= STAIRS.y1 + 1 && xx >= STAIRS.x0 - 1)) free = free && !(xx >= x && xx < x + w && yy >= y && yy < y + h);
            }
          if (free && !inStairs(x, y)) {
            for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) blocked[idx(xx, yy)] = 1;
            pieces.push({ name: PIECE_NAMES[k], x, y, w, h });
            placed = true;
          }
        }
        if (!placed) ok = false;
      }
      if (!ok) continue;
      // every free cell must be reachable from the start
      const seen = new Array(W * H).fill(0), q = [idx(START.x, START.y)];
      seen[q[0]] = 1;
      for (let i = 0; i < q.length; i++) {
        const cx = q[i] % W, cy = Math.floor(q[i] / W);
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy;
          if (inside(nx, ny) && !blocked[idx(nx, ny)] && !seen[idx(nx, ny)]) { seen[idx(nx, ny)] = 1; q.push(idx(nx, ny)); }
        }
      }
      let reach = true;
      for (let i = 0; i < W * H; i++) if (!blocked[i] && !seen[i]) reach = false;
      if (reach) return { blocked, pieces };
    }
    return { blocked: new Array(W * H).fill(0), pieces: [] };
  }

  // The area where new dirt likes to appear when "dirty corner" is on.
  const HOT = { x0: 2, y0: 1, x1: 5, y1: 3 };

  // ---------- the world for one episode ----------
  class World {
    // cfg: { layout, stairs, pet, hot }, seed: episode seed (same seed → same dirt story for both robots)
    constructor(cfg, seed) {
      this.cfg = cfg;
      this.blocked = cfg.layout.blocked;
      this.r = seeded(seed);
      this.dirt = new Array(W * H).fill(0);
      this.x = START.x; this.y = START.y; this.dir = START.dir;
      this.px = START.x; this.py = START.y; this.pdir = START.dir; // previous pose (for smooth drawing)
      this.steps = 0;
      this.cleaned = 0;
      this.bumps = 0; this.falls = 0; this.petHits = 0;
      this.reward = 0;
      this.lastEvent = "";
      this.pet = null;
      if (cfg.pet) {
        const c = this.randomFree();
        if (c) this.pet = { x: c[0], y: c[1], px: c[0], py: c[1] };
      }
      for (let i = 0; i < 10; i++) this.spawnDirt();
      this.done = false;
    }
    isCliff(x, y) { return this.cfg.stairs && inStairs(x, y); }
    isBlocked(x, y) { return !inside(x, y) || !!this.blocked[idx(x, y)]; }
    randomFree() {
      for (let t = 0; t < 60; t++) {
        const x = Math.floor(this.r() * W), y = Math.floor(this.r() * H);
        if (!this.isBlocked(x, y) && !this.isCliff(x, y) && !(x === this.x && y === this.y)) return [x, y];
      }
      return null;
    }
    spawnDirt() {
      for (let t = 0; t < 60; t++) {
        let x, y;
        if (this.cfg.hot && this.r() < 0.8) {
          x = HOT.x0 + Math.floor(this.r() * (HOT.x1 - HOT.x0 + 1));
          y = HOT.y0 + Math.floor(this.r() * (HOT.y1 - HOT.y0 + 1));
        } else { x = Math.floor(this.r() * W); y = Math.floor(this.r() * H); }
        if (this.isBlocked(x, y) || this.isCliff(x, y) || this.dirt[idx(x, y)] || (x === this.x && y === this.y)) continue;
        this.dirt[idx(x, y)] = 1;
        return;
      }
    }
    // What the robot can feel right now.
    sense() {
      const [fx, fy] = DIRS[this.dir], [rx, ry] = DIRS[(this.dir + 1) % 4], [lx, ly] = DIRS[(this.dir + 3) % 4];
      const ax = this.x + fx, ay = this.y + fy;
      const petAhead = !!(this.pet && this.pet.x === ax && this.pet.y === ay);
      // dirt-sense: which way is the nearest dirt? 0 ahead, 1 right, 2 behind, 3 left, 4 none
      let best = 1e9, bx = 0, by = 0;
      for (let i = 0; i < W * H; i++) if (this.dirt[i]) {
        const dx = (i % W) - this.x, dy = Math.floor(i / W) - this.y, d = Math.abs(dx) + Math.abs(dy);
        if (d < best && d <= SENSE_RANGE) { best = d; bx = dx; by = dy; }
      }
      let dirtDir = 4;
      if (best < 1e9) {
        const f = bx * fx + by * fy, s = bx * rx + by * ry;
        dirtDir = Math.abs(f) >= Math.abs(s) ? (f > 0 ? 0 : 2) : (s > 0 ? 1 : 3);
      }
      return {
        dirtDir, dirtDist: best < 1e9 ? best : 0,
        blockedAhead: this.isBlocked(ax, ay),
        blockedLeft: this.isBlocked(this.x + lx, this.y + ly),
        blockedRight: this.isBlocked(this.x + rx, this.y + ry),
        cliffAhead: this.isCliff(ax, ay),
        petAhead,
        dirtX: this.x + bx, dirtY: this.y + by, x: this.x, y: this.y,
      };
    }
    // action: 0 forward, 1 turn left, 2 turn right. Returns the reward.
    step(action) {
      this.px = this.x; this.py = this.y; this.pdir = this.dir;
      let reward = -0.02;
      this.lastEvent = "";
      if (action === 1) this.dir = (this.dir + 3) % 4;
      else if (action === 2) this.dir = (this.dir + 1) % 4;
      else {
        const [dx, dy] = DIRS[this.dir];
        const nx = this.x + dx, ny = this.y + dy;
        if (this.pet && this.pet.x === nx && this.pet.y === ny) { reward -= 2; this.petHits++; this.lastEvent = "pet"; }
        else if (this.isCliff(nx, ny)) {
          reward -= 5; this.falls++; this.lastEvent = "fell";
          this.x = START.x; this.y = START.y; this.dir = START.dir;
        } else if (this.isBlocked(nx, ny)) { reward -= 0.3; this.bumps++; this.lastEvent = "bump"; }
        else {
          this.x = nx; this.y = ny;
          if (this.dirt[idx(nx, ny)]) { this.dirt[idx(nx, ny)] = 0; this.cleaned++; reward += 1; this.lastEvent = "clean"; }
        }
      }
      // the pet wanders every other step
      if (this.pet) {
        this.pet.px = this.pet.x; this.pet.py = this.pet.y;
        if (this.steps % 2 === 0) {
          const [dx, dy] = DIRS[Math.floor(this.r() * 4)];
          const nx = this.pet.x + dx, ny = this.pet.y + dy;
          if (!this.isBlocked(nx, ny) && !this.isCliff(nx, ny) && !(nx === this.x && ny === this.y)) { this.pet.x = nx; this.pet.y = ny; }
        }
      }
      if (this.r() < DIRT_RATE) this.spawnDirt();
      this.steps++;
      this.reward += reward;
      if (this.steps >= EP_STEPS) this.done = true;
      return reward;
    }
  }

  // ---------- Controller A: hand-written rules ----------
  // Each rule: if its test is true, do its action. The first enabled rule that matches wins.
  const RULES = [
    { id: "stuck", text: "IF I haven't gotten anywhere for a while", then: "shake free", action: -1, test: (s, bot) => bot.escape > 0 || bot.samePos >= 5 },
    { id: "cliff", text: "IF there are stairs ahead", then: "turn right", action: 2, test: (s) => s.cliffAhead },
    { id: "pet", text: "IF the pet is ahead", then: "turn left", action: 1, test: (s) => s.petAhead },
    { id: "bumpLeft", text: "IF blocked ahead and dirt is on the left", then: "turn left", action: 1, test: (s) => s.blockedAhead && s.dirtDir === 3 },
    { id: "bump", text: "IF something blocks the way", then: "turn right", action: 2, test: (s) => s.blockedAhead },
    { id: "dirtAhead", text: "IF dirt is ahead", then: "go forward", action: 0, test: (s) => s.dirtDir === 0 },
    { id: "dirtLeft", text: "IF dirt is on the left", then: "turn left", action: 1, test: (s) => s.dirtDir === 3 },
    { id: "dirtRight", text: "IF dirt is on the right or behind", then: "turn right", action: 2, test: (s) => s.dirtDir === 1 || s.dirtDir === 2 },
  ];
  const NAIVE = ["bump", "dirtAhead"];
  const SMART = ["stuck", "cliff", "pet", "bumpLeft", "bump", "dirtAhead", "dirtLeft", "dirtRight"];

  class RuleBot {
    // order: ids top-to-bottom; enabled: Set of ids
    constructor(order = RULES.map((r) => r.id), enabled = NAIVE) {
      this.order = order.slice();
      this.enabled = new Set(enabled);
      this.r = seeded(99);
      this.last = null;
      this.samePos = 0; this.lastPos = -1; this.escape = 0;
    }
    act(s) {
      // remember if we keep ending up in the same square (turning round and round)
      const key = s.x * 100 + s.y;
      this.samePos = key === this.lastPos ? this.samePos + 1 : 0;
      this.lastPos = key;
      for (const id of this.order) {
        if (!this.enabled.has(id)) continue;
        const rule = RULES.find((q) => q.id === id);
        if (rule.test(s, this)) {
          let a = rule.action;
          if (a === -1) { // shake free: a random turn, then drive straight for a few steps
            if (!(this.escape > 0)) { this.escape = 4; this.samePos = 0; a = this.r() < 0.5 ? 1 : 2; }
            else { this.escape--; a = s.blockedAhead || s.cliffAhead ? (this.r() < 0.5 ? 1 : 2) : 0; }
          }
          this.last = { rule, wander: false, action: a };
          return a;
        }
      }
      // ELSE: wander forward, now and then turning
      const a = this.r() < 0.12 ? (this.r() < 0.5 ? 1 : 2) : 0;
      this.last = { rule: null, wander: true, action: a };
      return a;
    }
  }

  // ---------- Controller B: tabular Q-learning ----------
  const NSTATES = 5 * 2 * 2 * 2 * 2 * 2;
  function stateKey(s) {
    return ((((s.dirtDir * 2 + (s.blockedAhead ? 1 : 0)) * 2 + (s.blockedLeft ? 1 : 0)) * 2 + (s.blockedRight ? 1 : 0)) * 2 + (s.cliffAhead ? 1 : 0)) * 2 + (s.petAhead ? 1 : 0);
  }
  function describeState(s) {
    const dirt = ["dirt straight ahead", "dirt on the right", "dirt behind me", "dirt on the left", "no dirt anywhere"][s.dirtDir];
    const bits = [dirt];
    if (s.blockedAhead) bits.push("wall ahead");
    if (s.cliffAhead) bits.push("stairs ahead");
    if (s.petAhead) bits.push("pet ahead");
    if (s.blockedLeft) bits.push("wall on left");
    if (s.blockedRight) bits.push("wall on right");
    return bits.join(", ");
  }

  class QBot {
    constructor() {
      this.q = new Float32Array(NSTATES * 3);
      this.alpha = 0.2;
      this.gamma = 0.9;
      this.epsilon = 0.15;
      this.r = seeded(4242);
      this.learning = true;
      this.updates = 0;
    }
    values(k) { return [this.q[k * 3], this.q[k * 3 + 1], this.q[k * 3 + 2]]; }
    act(k) {
      if (this.learning && this.r() < this.epsilon) return Math.floor(this.r() * 3);
      const v = this.values(k), m = Math.max(...v);
      const best = [];
      for (let a = 0; a < 3; a++) if (v[a] >= m - 1e-6) best.push(a);
      return best[Math.floor(this.r() * best.length)];
    }
    learn(k, a, reward, k2) {
      const m = Math.max(this.q[k2 * 3], this.q[k2 * 3 + 1], this.q[k2 * 3 + 2]);
      this.q[k * 3 + a] += this.alpha * (reward + this.gamma * m - this.q[k * 3 + a]);
      this.updates++;
    }
    clone() {
      const c = new QBot();
      c.q = new Float32Array(this.q);
      c.epsilon = this.epsilon;
      return c;
    }
  }

  // Run one whole episode headless. Used by Node tests and by the page's Turbo mode.
  function runEpisode(cfg, seed, bot, kind) {
    const w = new World(cfg, seed);
    while (!w.done) {
      const s = w.sense();
      if (kind === "q") {
        const k = stateKey(s), a = bot.act(k);
        const r = w.step(a);
        if (bot.learning) bot.learn(k, a, r, stateKey(w.sense()));
      } else w.step(bot.act(s));
    }
    return w;
  }

  const api = {
    SENSE_RANGE, W, H, DIRS, START, STAIRS, HOT, EP_STEPS, ACTIONS, RULES, NAIVE, SMART, NSTATES,
    seeded, makeLayout, World, RuleBot, QBot, stateKey, describeState, runEpisode, inStairs,
  };
  root.VacuumAI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
