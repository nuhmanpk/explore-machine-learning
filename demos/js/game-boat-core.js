// Boat Crosses the River — world + one generation of learning boats. No DOM (runs in Node too).
(function (root) {
  const GN = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);
  const W = 600, H = 400;
  const BANK_TOP = 46, BANK_BOT = H - 46; // water is between these
  const START = { x: 110, y: BANK_BOT - 14 };
  const RAYS = 5, RAY_LEN = 120;
  const SIZES = [RAYS + 6, 10, 2];
  const MAX_STEPS = 900;

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

  // challenges: { current: 1|2, wind: bool, logs: bool, whirl: bool, moveDock: bool }
  class River {
    constructor(seed, ch = {}) {
      this.ch = Object.assign({ current: 1, wind: false, logs: false, whirl: false, moveDock: false }, ch);
      const r = seeded(seed);
      this.rnd = r;
      // dock wanders a little every round; a lot with the "move the dock" challenge
      this.dock = { x: this.ch.moveDock ? 110 + r() * 420 : 450, y: BANK_TOP + 6 };
      this.rocks = [{ x: 300, y: 205, r: 22 }, { x: 205, y: 120, r: 16 }, { x: 470, y: 270, r: 18 }];
      if (this.ch.moveDock) this.rocks.push({ x: 120 + r() * 380, y: 150 + r() * 120, r: 15 });
      this.logs = [];
      if (this.ch.logs) for (let i = 0; i < 4; i++) this.logs.push({ x: r() * W, y: 90 + i * 65 + r() * 20, len: 46, ang: r() * Math.PI });
      this.whirl = this.ch.whirl ? { x: 345, y: 140, r: 100 } : null;
      this.gustPhase = r() * 100;
      this.t = 0;
    }
    // The river flows left → right, fastest in the middle.
    current(x, y) {
      const m = (y - BANK_TOP) / (BANK_BOT - BANK_TOP);
      const base = 1.05 * this.ch.current * Math.sin(Math.PI * Math.max(0, Math.min(1, m)));
      let vx = base, vy = 0;
      if (this.whirl) {
        const dx = x - this.whirl.x, dy = y - this.whirl.y, d = Math.hypot(dx, dy);
        if (d < this.whirl.r && d > 1) {
          const k = 3 * (1 - d / this.whirl.r);
          vx += (-dy / d) * k - (dx / d) * k * 0.35; // spin + suck in
          vy += (dx / d) * k - (dy / d) * k * 0.35;
        }
      }
      return { vx, vy };
    }
    wind() {
      if (!this.ch.wind) return { wx: 0, wy: 0 };
      const g = Math.sin((this.t + this.gustPhase) / 55) * Math.sin((this.t + this.gustPhase) / 23);
      return { wx: -(0.9 + 1.4 * Math.abs(g)), wy: 0.9 * Math.max(0, g) }; // steady breeze upstream, with gusts that also push back // gusts push the boat back toward the start bank
    }
    step() {
      this.t++;
      for (const l of this.logs) {
        const c = this.current(l.x, l.y);
        l.x += c.vx * 0.9 + 0.3;
        l.ang += 0.004;
        if (l.x > W + 40) l.x = -40;
      }
    }
  }

  function segCircle(ax, ay, bx, by, cx, cy, r) {
    // distance along ray (0..1) where segment A→B first hits circle, or null
    const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }

  class Boat {
    constructor(brain) {
      this.brain = brain;
      this.x = START.x;
      this.y = START.y;
      this.a = -Math.PI / 2; // facing across the river
      this.v = 0;
      this.dead = false;
      this.docked = false;
      this.steps = 0;
      this.rays = new Array(RAYS).fill(1);
      this.input = [];
      this.out = [0, 0];
    }
    obstacles(river) {
      const obs = river.rocks.slice();
      for (const l of river.logs) {
        // a log is three little circles in a row
        for (let k = -1; k <= 1; k++) obs.push({ x: l.x + Math.cos(l.ang) * k * 16, y: l.y + Math.sin(l.ang) * k * 16, r: 8 });
      }
      return obs;
    }
    sense(river) {
      const obs = this.obstacles(river);
      for (let i = 0; i < RAYS; i++) {
        const ang = this.a + (i / (RAYS - 1) - 0.5) * Math.PI * 0.9;
        const ex = this.x + Math.cos(ang) * RAY_LEN, ey = this.y + Math.sin(ang) * RAY_LEN;
        let best = 1;
        for (const o of obs) {
          const t = segCircle(this.x, this.y, ex, ey, o.x, o.y, o.r);
          if (t !== null && t < best) best = t;
        }
        // river edges left/right count as walls; banks only matter away from the dock
        if (ex < 0) best = Math.min(best, this.x / (this.x - ex));
        if (ex > W) best = Math.min(best, (W - this.x) / (ex - this.x));
        this.rays[i] = best;
      }
      const dx = river.dock.x - this.x, dy = river.dock.y - this.y;
      const rel = Math.atan2(dy, dx) - this.a;
      const c = river.current(this.x, this.y), w = river.wind();
      this.input = [
        ...this.rays.map((r) => 1 - r), // closer = bigger
        Math.sin(rel),
        Math.cos(rel),
        Math.min(1, Math.hypot(dx, dy) / 400),
        (c.vx + w.wx) / 2, // the push it feels
        (c.vy + w.wy) / 2,
        this.v / 2.4,
      ];
      return this.input;
    }
    step(river, manual) {
      if (this.dead || this.docked) return;
      this.steps++;
      let throttle, rudder;
      if (manual) ({ throttle, rudder } = manual);
      else {
        const o = this.brain.forward(this.sense(river));
        this.out = o;
        throttle = (o[0] + 1) / 2;
        rudder = o[1];
      }
      if (manual) this.sense(river);
      this.throttle = throttle;
      this.rudder = rudder;
      this.v += (throttle * 2.4 - this.v) * 0.08;
      this.a += rudder * 0.07 * (0.4 + this.v / 2.4);
      const c = river.current(this.x, this.y), w = river.wind();
      this.x += Math.cos(this.a) * this.v + c.vx + w.wx;
      this.y += Math.sin(this.a) * this.v + c.vy + w.wy;
      // crash checks
      for (const o of this.obstacles(river)) if (Math.hypot(this.x - o.x, this.y - o.y) < o.r + 8) { this.dead = true; this.why = "rock"; }
      if (this.x < 4 || this.x > W - 4) { this.dead = true; this.why = "swept"; }
      if (this.y > BANK_BOT) this.y = BANK_BOT; // can't climb the start bank
      const dd = Math.hypot(this.x - river.dock.x, this.y - river.dock.y);
      if (dd < 22) this.docked = true;
      else if (this.y < BANK_TOP + 2) { this.dead = true; this.why = "bank"; }
    }
    fitness(river) {
      const d0 = Math.hypot(START.x - river.dock.x, START.y - river.dock.y);
      const d = Math.hypot(this.x - river.dock.x, this.y - river.dock.y);
      if (this.docked) return 2 + (1 - this.steps / MAX_STEPS);
      return Math.max(0, 1 - d / d0) * (this.dead ? 0.6 : 1);
    }
  }

  // One round: every boat tries the same river. Returns fitness list etc.
  class Round {
    constructor(brains, seed, ch) {
      this.river = new River(seed, ch);
      this.boats = brains.map((b) => new Boat(b));
      this.steps = 0;
      this.done = false;
    }
    step() {
      if (this.done) return;
      this.steps++;
      this.river.step();
      let active = 0;
      for (const b of this.boats) {
        b.step(this.river);
        if (!b.dead && !b.docked) active++;
      }
      if (active === 0 || this.steps >= MAX_STEPS) this.done = true;
    }
    run() {
      while (!this.done) this.step();
      return this;
    }
    results() {
      const fit = this.boats.map((b) => b.fitness(this.river));
      const docked = this.boats.filter((b) => b.docked).length;
      // success of the better half (the babies with big random changes add a lot of noise)
      const sorted = fit.slice().sort((a, b) => b - a).slice(0, Math.ceil(fit.length / 2));
      const topDocked = sorted.filter((f) => f >= 2).length / sorted.length;
      let best = 0;
      fit.forEach((f, i) => { if (f > fit[best]) best = i; });
      return { fit, docked, best, bestFit: fit[best], dockedFrac: docked / this.boats.length, topDocked };
    }
    leader() {
      // the boat to follow with the camera / inside card: best fitness so far among the still-moving ones
      let lead = null, lf = -1;
      for (const b of this.boats) {
        const f = b.fitness(this.river) + (b.dead ? -1 : 0);
        if (f > lf) { lf = f; lead = b; }
      }
      return lead;
    }
  }

  const api = { W, H, BANK_TOP, BANK_BOT, START, RAYS, RAY_LEN, SIZES, MAX_STEPS, River, Boat, Round, seeded };
  root.BoatGame = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
