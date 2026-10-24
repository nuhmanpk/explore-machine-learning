// Dino Runner — side-scrolling runner + a herd of dinos with tiny neural brains (neuroevolution).
// No DOM, so it also runs in Node. Uses GameNet (game-net.js) for the network and genetic algorithm.
(function (root) {
  const GameNet = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);

  const W = 800, H = 300, GROUND = 240; // canvas size; ground line y
  const DINO_X = 70, DINO_W = 40, DINO_H = 46, DUCK_H = 26;
  const GRAVITY = 0.9, JUMP_V = 14.5, HEAVY_JUMP_V = 11, FAST_FALL = 1.8;
  const BASE_SPEED = 6.5, MAX_STEPS = 3600; // 60 s of running = "mastered"
  const SIGHT = 600;

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

  // Challenges: what's switched on changes the world, not the dinos.
  function defaultRules() {
    return { speed: false, birds: false, heavy: false, double: false, storm: false };
  }

  class Dino {
    constructor(brain) {
      this.brain = brain;
      this.y = 0; // height of feet above the ground
      this.vy = 0;
      this.duck = false;
      this.dead = false;
      this.dist = 0;
      this.jumps = 0;
      this.time = 0; // steps survived
      this.action = 2; // 0 jump, 1 duck, 2 run
      this.inputs = null;
    }
    get h() { return this.duck && this.y === 0 ? DUCK_H : DINO_H; }
    // act: 0 jump, 1 duck, 2 run
    control(act) {
      this.action = act;
      if (act === 0 && this.y === 0) { this.vy = this.heavy ? HEAVY_JUMP_V : JUMP_V; this.jumps++; }
      this.duck = act === 1;
    }
    physics() {
      if (this.y > 0 || this.vy > 0) {
        this.vy -= GRAVITY + (this.duck ? FAST_FALL : 0);
        this.y += this.vy;
        if (this.y <= 0) { this.y = 0; this.vy = 0; }
      }
    }
  }

  class World {
    constructor(brains, rules = defaultRules(), seed = 1) {
      this.rules = rules;
      this.rnd = seeded(seed);
      this.steps = 0;
      this.scroll = 0; // total distance the ground has moved
      this.obstacles = [];
      this.nextGap = 420;
      this.gust = 1;
      this.gustTarget = 1;
      this.dinos = brains.map((b) => new Dino(b));
      this.done = false;
    }
    get speed() {
      const ramp = 1 + Math.min(0.45, this.steps / 6000); // the game slowly speeds up
      return this.baseSpeed() * (this.rules.storm ? this.gust : 1);
    }
    baseSpeed() {
      const ramp = 1 + Math.min(0.45, this.steps / 6000);
      return BASE_SPEED * ramp * (this.rules.speed ? 1.75 : 1);
    }
    get sight() { return SIGHT; }

    spawn() {
      const r = this.rnd, R = this.rules;
      const x = W + 20;
      const roll = r();
      if (R.birds && roll < 0.33) {
        // A bird at head height: you must duck (or jump very early).
        this.obstacles.push({ type: "bird", x, w: 42, bottom: 30, h: 22, flap: r() * 6 });
      } else if (R.double && roll < 0.66) {
        const n = r() < 0.5 ? 2 : 3;
        this.obstacles.push({ type: "cactus", x, w: 22 * n + 6, bottom: 0, h: 34 + r() * 10, n });
      } else {
        const tall = r() < 0.4;
        this.obstacles.push({ type: "cactus", x, w: tall ? 24 : 18, bottom: 0, h: tall ? 50 : 36, n: 1 });
      }
      // Gap to the next one grows with speed so every gap stays jumpable.
      this.nextGap = (230 + r() * 260) * Math.pow(this.baseSpeed() / BASE_SPEED, this.rules.speed ? 0.55 : 1);
    }

    // What one dino feels: 8 numbers in roughly 0..1.
    sense(d) {
      const ahead = this.obstacles.filter((o) => o.x + o.w > DINO_X);
      const sight = this.sight;
      const vis = (o) => o && o.x - (DINO_X + DINO_W) < sight; 
      const o1 = vis(ahead[0]) ? ahead[0] : null;
      const o2 = vis(ahead[1]) ? ahead[1] : null;
      const near = (o) => (o ? 1 - Math.max(0, o.x - (DINO_X + DINO_W)) / SIGHT : 0);
      return [
        near(o1), // how close the next thing is (0 = nothing seen)
        o1 ? (o1.bottom + o1.h) / 60 : 0, // how high its top is
        o1 ? o1.bottom / 60 : 0, // how high it floats (birds)
        o1 ? o1.w / 80 : 0, // how wide it is
        o2 ? 1 - Math.max(0, o2.x - (o1.x + o1.w)) / SIGHT : 0, // the one after: how soon after
        this.speed / 14, // how fast the game is going
        d.y / 120, // my height
        d.vy / JUMP_V, // my up/down speed
      ];
    }

    hit(d, o) {
      const x1 = DINO_X + 6, x2 = DINO_X + DINO_W - 6;
      if (x2 < o.x + 3 || x1 > o.x + o.w - 3) return false;
      const lo = d.y, hi = d.y + d.h;
      return hi > o.bottom + 3 && lo < o.bottom + o.h - 3;
    }

    // One tick. actOf(d, inputs) returns an action for player-controlled dinos (optional).
    step(actOf) {
      if (this.done) return;
      this.steps++;
      if (this.rules.storm) {
        if (this.steps % 60 === 0) this.gustTarget = 0.55 + this.rnd() * 1.25;
        this.gust += (this.gustTarget - this.gust) * 0.08;
      } else this.gust = 1;
      const v = this.speed;
      this.scroll += v;
      for (const o of this.obstacles) o.x -= v;
      this.obstacles = this.obstacles.filter((o) => o.x + o.w > -20);
      const last = this.obstacles[this.obstacles.length - 1];
      if (!last || W + 20 - (last.x + last.w) >= this.nextGap) this.spawn();

      let alive = 0;
      for (const d of this.dinos) {
        if (d.dead) continue;
        const x = this.sense(d);
        d.inputs = x;
        let act;
        if (actOf) act = actOf(d, x);
        else {
          const out = d.brain.forward(x);
          act = out[0] > out[1] && out[0] > out[2] ? 0 : out[1] > out[2] ? 1 : 2;
        }
        d.heavy = this.rules.heavy;
        d.control(act);
        d.physics();
        d.dist += v;
        d.time++;
        for (const o of this.obstacles) if (this.hit(d, o)) { d.dead = true; break; }
        if (!d.dead) alive++;
      }
      this.alive = alive;
      if (alive === 0 || this.steps >= MAX_STEPS) this.done = true;
    }
    leader() {
      let best = null;
      for (const d of this.dinos) if (!best || (!d.dead && best.dead) || (d.dead === best.dead && d.dist > best.dist)) best = d;
      return best;
    }
  }

  // Score in metres-ish: distance / 40.
  const metres = (px) => Math.round(px / 40);
  const MAX_DIST = (() => { const w = new World([], defaultRules()); let s = 0; for (let i = 0; i < MAX_STEPS; i++) { w.steps = i; s += w.speed; } return s; })();

  const SIZES = [8, 8, 3];
  function newHerd(n) { return Array.from({ length: n }, () => new GameNet.Net(SIZES)); }

  // Run a whole generation (no drawing). Returns fitness per brain.
  function runGeneration(brains, rules, seed) {
    const w = new World(brains, rules, seed);
    while (!w.done) w.step();
    return { fitness: w.dinos.map((d) => d.dist), world: w };
  }

  const api = { W, H, GROUND, DINO_X, DINO_W, DINO_H, DUCK_H, MAX_STEPS, SIZES, MAX_DIST, World, Dino, defaultRules, newHerd, runGeneration, metres, seeded };
  root.DinoCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
