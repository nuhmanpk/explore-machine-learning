// Space Dodger — world, ships with radar, and one generation of evolution.
// No DOM, so it also runs in Node (needs game-net.js).
(function (root) {
  const GN = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);
  const W = 600, H = 440;
  const RAYS = 8, RAY_LEN = 150, SHIP_R = 9;
  const STEPS = 1500; // one generation ≈ 25 s at 60 fps
  const SIZES = [RAYS + 8, 12, 2]; // radar + nearest rock (where, which way it moves) + star (angle, distance) + speed → turn, thrust

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

  const DEFAULT_RULES = { shower: false, gravity: false, heavy: false, walls: false, shy: false };

  class Ship {
    constructor(brain, starSeed) {
      this.brain = brain;
      this.x = W / 2; this.y = H / 2 + 60;
      this.vx = 0; this.vy = 0; this.a = -Math.PI / 2;
      this.alive = true; this.t = 0; this.stars = 0;
      this.rnd = seeded(starSeed);
      this.newStar();
      this.radar = new Array(RAYS).fill(0);
      this.out = [0, 0];
      this.trail = [];
    }
    newStar() {
      this.sx = 40 + this.rnd() * (W - 80);
      this.sy = 40 + this.rnd() * (H - 80);
    }
  }

  // Distance along a ray (from px,py in direction dx,dy) to a circle, or Infinity.
  function rayCircle(px, py, dx, dy, cx, cy, r) {
    const fx = cx - px, fy = cy - py;
    const t = fx * dx + fy * dy;
    if (t < 0) return Infinity;
    const d2 = fx * fx + fy * fy - t * t;
    if (d2 > r * r) return Infinity;
    return t - Math.sqrt(r * r - d2);
  }

  class World {
    constructor(brains, rules = DEFAULT_RULES, seed = 1) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      this.rnd = seeded(seed);
      this.steps = 0;
      this.hole = { x: W * 0.5, y: H * 0.42, r: 16 };
      this.rocks = [];
      const n = this.rules.shower ? 10 : 7;
      for (let i = 0; i < n; i++) this.rocks.push(this.makeRock(true));
      this.ships = brains.map((b) => new Ship(b, seed * 31 + 7));
      this.done = false;
    }
    makeRock(anywhere) {
      const r = this.rnd, fast = this.rules.shower ? 1.45 : 1;
      let x, y;
      do {
        x = r() * W; y = r() * H;
      } while (anywhere && Math.hypot(x - W / 2, y - (H / 2 + 60)) < 130); // never on top of the start
      const ang = r() * Math.PI * 2, sp = (0.4 + r() * 0.7) * fast;
      return { x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 12 + r() * 14, rot: r() * 6, spin: (r() - 0.5) * 0.04, seed: Math.floor(r() * 1e6) };
    }
    sense(s) {
      for (let k = 0; k < RAYS; k++) {
        const ang = s.a + (k / RAYS) * Math.PI * 2;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        let d = RAY_LEN;
        for (const r of this.rocks) d = Math.min(d, rayCircle(s.x, s.y, dx, dy, r.x, r.y, r.r));
        if (this.rules.gravity) d = Math.min(d, rayCircle(s.x, s.y, dx, dy, this.hole.x, this.hole.y, this.hole.r + 22));
        if (this.rules.walls) {
          if (dx > 0) d = Math.min(d, (W - s.x) / dx);
          if (dx < 0) d = Math.min(d, -s.x / dx);
          if (dy > 0) d = Math.min(d, (H - s.y) / dy);
          if (dy < 0) d = Math.min(d, -s.y / dy);
        }
        s.radar[k] = 1 - Math.min(d, RAY_LEN) / RAY_LEN;
      }
      // Nearest rock, measured from the ship's point of view (ahead/right), and how it moves relative to us.
      let near = null, nd = Infinity;
      for (const r of this.rocks) {
        let dx = r.x - s.x, dy = r.y - s.y;
        if (!this.rules.walls) { dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H); }
        const d = Math.hypot(dx, dy) - r.r;
        if (d < nd) { nd = d; near = { dx, dy, vx: r.vx - s.vx, vy: r.vy - s.vy }; }
      }
      const c = Math.cos(-s.a), sn = Math.sin(-s.a);
      const fwd = (x, y) => x * c - y * sn, side = (x, y) => x * sn + y * c;
      const rock = near && nd < 220
        ? [fwd(near.dx, near.dy) / 220, side(near.dx, near.dy) / 220, fwd(near.vx, near.vy) / 4, side(near.vx, near.vy) / 4]
        : [0, 0, 0, 0];
      s.nearRock = near;
      const sa = Math.atan2(s.sy - s.y, s.sx - s.x) - s.a;
      const sd = Math.hypot(s.sx - s.x, s.sy - s.y);
      const sp = Math.hypot(s.vx, s.vy);
      return [...s.radar, ...rock, Math.sin(sa), Math.cos(sa), Math.min(1, sd / 400), sp / 4];
    }
    // controls: { turn: -1..1, thrust: bool } — from a brain or a human.
    moveShip(s, turn, thrust) {
      const heavy = this.rules.heavy ? 0.3 : 1;
      s.a += (this.rules.heavy ? 0.05 : 0.09) * Math.max(-1, Math.min(1, turn));
      if (thrust) { s.vx += Math.cos(s.a) * 0.14 * heavy; s.vy += Math.sin(s.a) * 0.14 * heavy; }
      if (this.rules.gravity) {
        const dx = this.hole.x - s.x, dy = this.hole.y - s.y, d = Math.max(30, Math.hypot(dx, dy));
        const g = 22 / (d * d) * 6;
        s.vx += (dx / d) * g; s.vy += (dy / d) * g;
      }
      const drag = this.rules.heavy ? 0.995 : 0.985;
      s.vx *= drag; s.vy *= drag;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 4) { s.vx *= 4 / sp; s.vy *= 4 / sp; }
      s.x += s.vx; s.y += s.vy;
      if (this.rules.walls) {
        if (s.x < SHIP_R || s.x > W - SHIP_R || s.y < SHIP_R || s.y > H - SHIP_R) { s.alive = false; s.why = "wall"; }
      } else {
        s.x = (s.x + W) % W; s.y = (s.y + H) % H;
      }
      for (const r of this.rocks) {
        const dx = r.x - s.x, dy = r.y - s.y;
        if (dx * dx + dy * dy < (r.r + SHIP_R - 3) ** 2) { s.alive = false; s.why = "rock"; break; }
      }
      if (this.rules.gravity && Math.hypot(this.hole.x - s.x, this.hole.y - s.y) < this.hole.r + 4) { s.alive = false; s.why = "hole"; }
      // the star
      if (this.rules.shy) {
        const dx = s.sx - s.x, dy = s.sy - s.y, d = Math.hypot(dx, dy);
        if (d < 75 && d > 0) {
          s.sx = Math.max(20, Math.min(W - 20, s.sx + (dx / d) * 0.75));
          s.sy = Math.max(20, Math.min(H - 20, s.sy + (dy / d) * 0.75));
        }
      }
      if (Math.hypot(s.sx - s.x, s.sy - s.y) < 16) { s.stars++; s.newStar(); }
    }
    stepRocks() {
      for (const r of this.rocks) {
        r.x = (r.x + r.vx + W) % W;
        r.y = (r.y + r.vy + H) % H;
        r.rot += r.spin;
      }
    }
    step(human) {
      if (this.done) return;
      this.steps++;
      this.stepRocks();
      let alive = 0;
      for (const s of this.ships) {
        if (!s.alive) continue;
        let turn, thrust;
        if (human && s === this.ships[0]) {
          this.sense(s);
          turn = (human.left ? -1 : 0) + (human.right ? 1 : 0);
          thrust = human.up;
          s.out = [turn, thrust ? 1 : -1];
        } else {
          const o = s.brain.forward(this.sense(s));
          s.out = [o[0], o[1]];
          turn = o[0]; thrust = o[1] > 0;
        }
        s.thrusting = thrust;
        this.moveShip(s, turn, thrust);
        if (s.alive) { s.t++; alive++; }
      }
      this.alive = alive;
      if (alive === 0 || this.steps >= STEPS) this.done = true;
    }
    fitness(s) {
      return s.t / 60 + s.stars * 8;
    }
    // The ship doing best right now (alive first, then score).
    leader() {
      let best = null, bf = -1;
      for (const s of this.ships) {
        const f = this.fitness(s) + (s.alive ? 1000 : 0);
        if (f > bf) { bf = f; best = s; }
      }
      return best;
    }
  }

  // One full generation without drawing (used in Turbo and in Node tests).
  function runGeneration(brains, rules, seed) {
    const w = new World(brains, rules, seed);
    while (!w.done) w.step();
    return { world: w, fit: w.ships.map((s) => w.fitness(s)) };
  }

  const api = { W, H, RAYS, RAY_LEN, SHIP_R, STEPS, SIZES, DEFAULT_RULES, World, Ship, runGeneration, seeded };
  root.SpaceCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
