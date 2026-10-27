// Auto-Parking — a top-down car, a parking lot, and one generation of evolution.
// The car is a "bicycle model": steering turns the front wheels, throttle pushes forwards or backwards.
// No DOM, so it also runs in Node (needs game-net.js).
(function (root) {
  const W = 640, H = 420;
  const WALL_Y = 36;                 // the back wall of the parking bays
  const BAY_D = 46;                  // bay depth
  const SLOT_CY = WALL_Y + BAY_D / 2; // where the middle of the target bay is
  const CAR_L = 36, CAR_W = 20, WB = 22; // body length, width, wheel-base
  const PARKED_W = 22;               // parked cars are drawn a touch wider than ours
  const STEPS = 900;                 // one try ≈ 15 s
  const STILL_NEED = 40;             // sit parked and still for 2/3 s to count as parked
  const VMAX = 1.25;
  const RANGE = 110;
  const RAY_ANGLES = [0, 0.7, -0.7, Math.PI, Math.PI - 0.7, -(Math.PI - 0.7)]; // front, front-left, front-right, rear, rear-left, rear-right

  // 13 senses → 12 thinking neurons → 2 controls (steer, throttle)
  const SIZES = [13, 12, 2];
  const INPUT_NAMES = ["Bay ahead", "Bay to the side", "Aim (sin)", "Aim (cos)", "Speed", "Bay: left/right", "Bay: up/down", "Front", "Front-left", "Front-right", "Rear", "Rear-left", "Rear-right"];

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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function newBrain() {
    const GN = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);
    const n = new GN.Net(SIZES);
    for (let i = (SIZES[0] + 1) * SIZES[1]; i < n.genes.length; i++) n.genes[i] *= 0.4; // gentler first moves
    return n;
  }

  // neighbours = parked cars either side of the bay; tight = narrower bay; pillars = concrete posts in the lane;
  // random = start from anywhere, pointing any way; crowded = an extra car in the lane to dodge.
  const DEFAULT_RULES = { neighbours: false, tight: false, pillars: false, random: false, moving: false };

  class Car {
    constructor(brain, x, y, th) {
      this.brain = brain;
      this.x = x; this.y = y; this.th = th; this.v = 0;
      this.steer = 0; this.thr = 0;
      this.alive = true; this.parked = false; this.parkedAt = 0; this.why = ""; this.still = 0;
      this.bestProg = 0; this.bestQ = 0; this.t = 0; this.trail = [];
      this.inside = 0; this.aimErr = Math.PI / 2;
    }
  }

  // corners and edge points of a car body (for crash tests and drawing)
  function body(x, y, th, extra = 0) {
    const c = Math.cos(th), s = Math.sin(th), pts = [];
    const hl = CAR_L / 2 + extra, hw = CAR_W / 2 + extra;
    for (const [u, w] of [[-hl, -hw], [-hl, 0], [-hl, hw], [0, -hw], [0, hw], [hl, -hw], [hl, 0], [hl, hw], [-hl / 2, -hw], [-hl / 2, hw], [hl / 2, -hw], [hl / 2, hw]])
      pts.push([x + u * c - w * s, y + u * s + w * c]);
    return pts;
  }

  class World {
    constructor(brains, rules = DEFAULT_RULES, seed = 1) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      const rnd = (this.rnd = seeded(seed));
      this.steps = 0;
      const gap = this.rules.tight ? 30 : this.rules.neighbours ? 40 : 46; // free width of the target bay
      this.gap = gap;
      this.pitch = (gap + PARKED_W) / 2;
      this.tx = 120 + rnd() * 400;
      this.target = { x: this.tx, y: SLOT_CY };
      this.slot = { x0: this.tx - gap / 2, x1: this.tx + gap / 2, y0: WALL_Y, y1: WALL_Y + BAY_D };
      // obstacles: axis-aligned rectangles {x0,y0,x1,y1}
      this.rects = [
        { x0: -60, y0: -60, x1: W + 60, y1: WALL_Y, wall: true },
        { x0: -60, y0: -60, x1: 0, y1: H + 60, wall: true },
        { x0: W, y0: -60, x1: W + 60, y1: H + 60, wall: true },
        { x0: -60, y0: H, x1: W + 60, y1: H + 60, wall: true },
      ];
      this.parked = []; // decorative / real parked cars, for drawing
      const putCar = (cx, colour, solid) => {
        const r = { x0: cx - PARKED_W / 2, x1: cx + PARKED_W / 2, y0: WALL_Y + 3, y1: WALL_Y + 3 + CAR_L, hue: colour };
        this.parked.push(r);
        if (solid) this.rects.push(r);
      };
      for (let k = 1; k < 20; k++) {
        for (const sg of [-1, 1]) {
          const cx = this.tx + sg * k * this.pitch;
          if (cx < 14 || cx > W - 14) continue;
          const filled = k === 1 ? this.rules.neighbours : rnd() < 0.78;
          if (filled) putCar(cx, Math.floor(rnd() * 360), true);
        }
      }
      if (this.rules.pillars) {
        for (let i = 0; i < 3; i++) {
          const px = 70 + rnd() * 500, py = 120 + rnd() * 70;
          if (Math.abs(px - this.tx) < 26 && py < 150) continue;
          this.rects.push({ x0: px - 9, x1: px + 9, y0: py - 9, y1: py + 9, pillar: true });
        }
      }
      this.rays = RAY_ANGLES.length;
      this.cars = brains.map((b) => this.spawn(b, rnd));
      this.startDist = this.cars.length ? Math.hypot(this.cars[0].x - this.tx, this.cars[0].y - SLOT_CY) : 1;
      this.moverPhase = rnd() * 6;
      this.mover = this.rules.moving ? { x: 0, y: 0, th: 0 } : null;
      if (this.mover) this.moveMover();
    }
    // A shopper's car cruising the lane: a moving obstacle (a rectangle that is rebuilt each step).
    moveMover() {
      const t = this.steps;
      const x = 320 + 260 * Math.sin(0.012 * t + this.moverPhase);
      const dx = 260 * 0.012 * Math.cos(0.012 * t + this.moverPhase);
      const y = 175;
      this.mover.x = x; this.mover.y = y; this.mover.th = dx >= 0 ? 0 : Math.PI;
      const r = { x0: x - CAR_L / 2, x1: x + CAR_L / 2, y0: y - CAR_W / 2, y1: y + CAR_W / 2, mover: true };
      this.rects = this.rects.filter((q) => !q.mover);
      this.rects.push(r);
    }
    spawn(brain, rnd) {
      const rules = this.rules;
      for (let tries = 0; tries < 40; tries++) {
        let x, y, th;
        if (rules.random) { x = 60 + rnd() * 520; y = 215 + rnd() * 150; th = rnd() * Math.PI * 2; }
        else { x = 70 + rnd() * 500; y = 270 + rnd() * 60; th = (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.5; }
        if (!this.hits(x, y, th)) return new Car(brain, x, y, th);
      }
      return new Car(brain, 320, 300, 0);
    }
    hits(x, y, th) {
      for (const [px, py] of body(x, y, th)) for (const r of this.rects) if (px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1) return true;
      return false;
    }
    // distance along a ray to the first obstacle (0..RANGE)
    ray(x, y, ang) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let best = RANGE;
      for (const r of this.rects) {
        let t0 = 0, t1 = best;
        if (Math.abs(dx) < 1e-9) { if (x <= r.x0 || x >= r.x1) continue; }
        else { let a = (r.x0 - x) / dx, b = (r.x1 - x) / dx; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
        if (Math.abs(dy) < 1e-9) { if (y <= r.y0 || y >= r.y1) continue; }
        else { let a = (r.y0 - y) / dy, b = (r.y1 - y) / dy; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
        if (t0 <= t1 && t0 < best) best = t0;
      }
      return best;
    }
    readRays(c) { return RAY_ANGLES.map((a) => this.ray(c.x, c.y, c.th + a)); }
    // The 13 numbers a car gets to see.
    sense(c) {
      const dx = this.target.x - c.x, dy = this.target.y - c.y;
      const co = Math.cos(c.th), si = Math.sin(c.th);
      const fwd = dx * co + dy * si, side = -dx * si + dy * co;
      const e = c.th + Math.PI / 2; // 0 = nose pointing straight into the bay
      const rays = this.readRays(c);
      c.rays = rays;
      return [clamp(fwd / 200, -1.5, 1.5), clamp(side / 200, -1.5, 1.5), Math.sin(e), Math.cos(e), c.v / VMAX, clamp(-dx / 200, -1.5, 1.5), clamp(-dy / 200, -1.5, 1.5), ...rays.map((r) => r / RANGE)];
    }
    step(keys) {
      if (this.done) return;
      this.steps++;
      if (this.mover) this.moveMover();
      let busy = 0;
      for (const c of this.cars) {
        if (!c.alive || c.parked) continue;
        busy++;
        c.t++;
        let steer, thr;
        if (c.human) {
          steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
          thr = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
          c.steer += (steer - c.steer) * 0.25;
          steer = c.steer;
        } else {
          const out = c.brain.forward(this.sense(c));
          steer = out[0]; thr = out[1];
        }
        c.steer = steer; c.thr = thr;
        c.v = c.v * 0.96 + thr * 0.06;
        if (thr * c.v < 0) c.v += thr * 0.06; // braking is stronger than speeding up
        c.v = clamp(c.v, -VMAX, VMAX);
        c.th += (c.v / WB) * Math.tan(steer * 0.55);
        c.x += c.v * Math.cos(c.th);
        c.y += c.v * Math.sin(c.th);

        // crash?
        let crash = false;
        for (const [px, py] of body(c.x, c.y, c.th)) {
          for (const r of this.rects) if (px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1) { crash = true; c.why = r.wall ? "wall" : r.pillar ? "pillar" : "car"; break; }
          if (crash) break;
        }
        if (crash) { c.alive = false; c.v = 0; continue; }

        // how well are we parked?
        const d = Math.hypot(c.x - this.target.x, c.y - this.target.y);
        c.bestProg = Math.max(c.bestProg, 1 - d / this.startDist);
        const pts = body(c.x, c.y, c.th);
        const s = this.slot, tol = 2.5;
        let ins = 0;
        for (const [px, py] of pts) if (px >= s.x0 - tol && px <= s.x1 + tol && py >= s.y0 - tol && py <= s.y1 + tol) ins++;
        c.inside = ins / pts.length;
        c.aimErr = Math.abs(Math.cos(c.th)); // 0 = nose or tail straight into the bay
        c.bestQ = Math.max(c.bestQ, (1 / (1 + d / 30)) * (0.3 + 0.7 * (1 - c.aimErr)) * (0.4 + 0.6 * c.inside) * (0.2 + 0.8 * (1 - Math.min(1, Math.abs(c.v) / 0.8))));
        if (c.inside === 1 && c.aimErr < 0.3 && Math.abs(c.v) < 0.2) {
          c.still++;
          if (c.still >= STILL_NEED) { c.parked = true; c.parkedAt = this.steps; c.v = 0; }
        } else c.still = Math.max(0, c.still - 2);
        if (c.t % 3 === 0 && c.trail.length < 320) c.trail.push([c.x, c.y]);
      }
      if (!busy || this.steps >= STEPS) this.done = true;
    }
    fitness(c) {
      const d = Math.hypot(c.x - this.target.x, c.y - this.target.y);
      const close = 1 / (1 + d / 30);
      const aim = c.inside > 0.5 ? 1 - c.aimErr : 0.25 * (1 - c.aimErr);
      let f = 30 * Math.max(0, c.bestProg) + 40 * c.bestQ + 25 * close * (0.4 + 0.6 * aim) + 25 * c.inside * (0.3 + 0.7 * aim);
      if (c.parked) f += 120 + 60 * (1 - c.parkedAt / STEPS);
      if (!c.alive) f -= 15 + 20 * c.bestQ;
      f += 15 * (c.alive ? 1 : 0) * (c.inside > 0.5 ? 1 : 0);
      return f;
    }
    leader() {
      let best = null, bf = -Infinity;
      for (const c of this.cars) { if (c.human) continue; const f = this.fitness(c) + (c.alive ? 1 : 0); if (f > bf) { bf = f; best = c; } }
      return best || this.cars[0];
    }
  }

  const api = { W, H, WALL_Y, BAY_D, SLOT_CY, CAR_L, CAR_W, PARKED_W, STEPS, VMAX, RANGE, RAY_ANGLES, SIZES, INPUT_NAMES, DEFAULT_RULES, World, Car, newBrain, body, seeded };
  root.ParkingCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
