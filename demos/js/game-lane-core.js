// Lane Keeper — a winding road, little cars that must stay between the lines, and one generation of evolution.
// The road is a path made from a curvy "bendiness" function; cars steer with a bicycle model.
// No DOM, so it also runs in Node (needs game-net.js).
(function (root) {
  const W = 640, H = 420;
  const STEP = 4;                // road polyline spacing (px)
  const LENGTH = 4200;           // road length (px)
  const STEPS = 2600;            // one try ≈ 43 s
  const CAR_L = 26, CAR_W = 14, WB = 17;
  const VMAX = 3.0, VMIN = 0.9;
  const LOOK = [34, 78, 130];    // how far ahead the car "sees" the road centre
  const STEER_MAX = 0.62;

  // 9 senses → 10 thinking neurons → 2 controls (steer, speed)
  const SIZES = [9, 10, 2];
  const INPUT_NAMES = ["Off-centre", "Heading", "Speed", "Road ahead (near)", "Road ahead (mid)", "Road ahead (far)", "Cone: sideways", "Cone: distance", "Bend here"];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
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

  function newBrain() {
    const GN = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);
    const n = new GN.Net(SIZES);
    for (let i = (SIZES[0] + 1) * SIZES[1]; i < n.genes.length; i++) n.genes[i] *= 0.4;
    return n;
  }

  // sharp = tighter bends; narrow = a narrower lane; rain = slippery (steering is late and noisy); cones = obstacles to dodge; fast = a higher speed limit
  const DEFAULT_RULES = { sharp: false, narrow: false, rain: false, cones: false, fast: false };

  // does any stretch of the road come within a lane-width of a far-away stretch?
  function selfOverlap(pts, half) {
    const gap = 2 * half + 16;
    for (let i = 0; i < pts.length; i += 2)
      for (let j = i + 60; j < pts.length; j += 2)
        if (Math.abs(pts[i].x - pts[j].x) < gap && Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < gap) return true;
    return false;
  }

  class Car {
    constructor(brain, x, y, th) {
      this.brain = brain;
      this.x = x; this.y = y; this.th = th; this.v = 1.6;
      this.steer = 0; this.cmdSteer = 0; this.speedCmd = 0.5;
      this.alive = true; this.finished = false; this.why = "";
      this.i = 0;           // index of the nearest road point
      this.s = 0; this.best = 0; this.off = 0; this.t = 0;
      this.dev = 0; this.trail = [];
    }
  }

  class World {
    constructor(brains, rules = DEFAULT_RULES, seed = 1) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      const rnd = (this.rnd = seeded(seed));
      this.steps = 0;
      this.half = this.rules.narrow ? 20 : 28;       // half the lane width
      this.vmax = this.rules.fast ? 4.0 : VMAX;
      // road: heading changes with a "bendiness" that is a mix of slow and quick waves.
      // A road that crosses itself would let cars hop onto another stretch, so draw new roads until one doesn't.
      const k0 = this.rules.sharp ? 1 / 66 : 1 / 82;
      for (let tries = 0; tries < 400; tries++) {
        const k = k0 * (tries < 80 ? 1 : 0.85); // (only if we're unlucky for a long time, bend a little less)
        const a1 = (0.55 + rnd() * 0.45) * k, a2 = (0.3 + rnd() * 0.4) * k, a3 = (0.15 + rnd() * 0.25) * k;
        const p1 = rnd() * 6.3, p2 = rnd() * 6.3, p3 = rnd() * 6.3;
        const kap = (s) => (Math.min(1, s / 120)) * (a1 * Math.sin(s / 190 + p1) + a2 * Math.sin(s / 77 + p2) + a3 * Math.sin(s / 41 + p3));
        this.pts = [];
        let x = 320, y = 360, h = -Math.PI / 2;
        for (let s = 0; s <= LENGTH; s += STEP) {
          this.pts.push({ x, y, h, k: kap(s) });
          h += kap(s) * STEP;
          x += Math.cos(h) * STEP; y += Math.sin(h) * STEP;
        }
        if (!selfOverlap(this.pts, this.half)) break;
      }
      this.n = this.pts.length;
      // cones (obstacles) sit in the lane every so often, on a random side
      this.cones = [];
      if (this.rules.cones) {
        for (let s = 500; s < LENGTH - 200; s += 330 + rnd() * 160) {
          const i = Math.round(s / STEP), p = this.pts[i];
          const off = (rnd() < 0.5 ? -1 : 1) * (this.half * (0.35 + rnd() * 0.3));
          this.cones.push({ x: p.x - Math.sin(p.h) * off, y: p.y + Math.cos(p.h) * off, i, off });
        }
      }
      const p0 = this.pts[0];
      this.cars = brains.map((b, j) => {
        const off = (rnd() - 0.5) * this.half * 0.9;
        const c = new Car(b, p0.x - Math.sin(p0.h) * off, p0.y + Math.cos(p0.h) * off, p0.h + (rnd() - 0.5) * 0.4);
        return c;
      });
    }
    // nearest road point to a car, searching forward and back from where it was
    locate(c) {
      let best = c.i, bd = Infinity;
      const lo = Math.max(0, c.i - 12), hi = Math.min(this.n - 1, c.i + 24);
      for (let i = lo; i <= hi; i++) {
        const p = this.pts[i], d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      c.i = best;
      const p = this.pts[best];
      // signed lateral offset: positive = to the right of the road direction
      const dx = c.x - p.x, dy = c.y - p.y;
      c.off = -Math.sin(p.h) * dx + Math.cos(p.h) * dy;
      c.s = best * STEP;
      return p;
    }
    // road centre at distance `ahead` along the road, as seen from the car (x = ahead of the car, y = to its right)
    seeAhead(c, ahead) {
      const j = Math.min(this.n - 1, c.i + Math.round(ahead / STEP));
      const p = this.pts[j];
      const dx = p.x - c.x, dy = p.y - c.y, co = Math.cos(c.th), si = Math.sin(c.th);
      return { fwd: dx * co + dy * si, side: -dx * si + dy * co };
    }
    sense(c) {
      const p = this.locate(c);
      const out = [clamp(c.off / this.half, -1.5, 1.5), clamp(wrap(c.th - p.h) / 1.0, -1.5, 1.5), c.v / this.vmax];
      for (const d of LOOK) out.push(clamp(this.seeAhead(c, d).side / 70, -1.5, 1.5));
      // the nearest cone in the next 140 px of road
      let cs = 0, cd = 1;
      for (const k of this.cones) {
        const ahead = (k.i - c.i) * STEP;
        if (ahead > -10 && ahead < 140 && ahead / 140 < cd) {
          const dx = k.x - c.x, dy = k.y - c.y;
          cs = clamp((-Math.sin(c.th) * dx + Math.cos(c.th) * dy) / 50, -1.5, 1.5); cd = Math.max(0, ahead / 140);
        }
      }
      out.push(cs, cd, clamp(p.k * 120, -1.5, 1.5));
      return out;
    }
    step(keys) {
      if (this.done) return;
      this.steps++;
      let busy = 0;
      for (const c of this.cars) {
        if (!c.alive || c.finished) continue;
        busy++;
        c.t++;
        let steer, spd;
        if (c.human) {
          steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
          spd = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
          c.speedCmd = clamp(c.speedCmd + spd * 0.02, 0, 1);
          spd = c.speedCmd * 2 - 1;
        } else {
          const o = c.brain.forward(this.sense(c));
          steer = o[0]; spd = o[1];
        }
        if (this.rules.rain) steer = clamp(steer + (this.rnd() - 0.5) * 0.5, -1, 1);
        c.cmdSteer = steer;
        c.steer += (steer - c.steer) * (this.rules.rain ? 0.1 : 0.3); // the wheels take a moment to turn (slower in the rain)
        const target = VMIN + ((spd + 1) / 2) * (this.vmax - VMIN);
        c.v += (target - c.v) * 0.08;
        // tight bends at speed: the car cannot turn sharper than its grip allows
        const grip = this.rules.rain ? 0.65 : 1;
        const turn = (c.v / WB) * Math.tan(c.steer * STEER_MAX) * grip;
        c.th += turn;
        c.x += c.v * Math.cos(c.th); c.y += c.v * Math.sin(c.th);
        const p = this.locate(c);
        c.dev += Math.abs(c.off) / this.half;
        c.best = Math.max(c.best, c.s);
        if (c.t % 5 === 0 && c.trail.length < 400) c.trail.push([c.x, c.y]);
        // off the road? (any corner of the car outside the lane)
        const half = this.half - 1;
        const front = Math.abs(c.off) + Math.abs(Math.sin(wrap(c.th - p.h))) * CAR_L / 2 + Math.abs(Math.cos(wrap(c.th - p.h))) * CAR_W / 2;
        if (front > half + 4) { c.alive = false; c.why = "road"; c.v = 0; continue; }
        for (const k of this.cones) if (Math.hypot(k.x - c.x, k.y - c.y) < 15) { c.alive = false; c.why = "cone"; c.v = 0; break; }
        if (c.i >= this.n - 3) { c.finished = true; c.v = 0; }
      }
      if (!busy || this.steps >= STEPS) this.done = true;
    }
    fitness(c) {
      const prog = c.best / (LENGTH - 4 * STEP);
      let f = 100 * prog;
      if (c.finished) f += 40 + 30 * (1 - c.t / STEPS);
      f -= 8 * (c.dev / Math.max(1, c.t)); // wandering from the centre costs a little
      if (!c.alive) f -= 3;
      return f;
    }
    leader() {
      let best = null, bf = -Infinity;
      for (const c of this.cars) { if (c.human) continue; const f = c.best + (c.alive ? 1 : 0); if (f > bf) { bf = f; best = c; } }
      return best || this.cars[0];
    }
  }

  const api = { W, H, STEP, LENGTH, STEPS, CAR_L, CAR_W, VMAX, SIZES, INPUT_NAMES, DEFAULT_RULES, LOOK, STEER_MAX, World, Car, newBrain };
  root.LaneCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
