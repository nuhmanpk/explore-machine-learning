// Delivery Drone — a 2D quadcopter world and one generation of evolution.
// Two rotors push up (left and right); the difference between them tilts the drone.
// No DOM, so it also runs in Node (needs game-net.js).
(function (root) {
  const W = 640, H = 420;
  const GROUND = 372;            // street level
  const PAD_X = 320;             // the depot's landing pad, in the middle of the street so drones must learn to fly both ways
  const R = 12;                  // drone body radius
  const STEPS = 1500;            // one flight ≈ 25 s at 60 fps
  const HOVER_NEED = 60;         // hold still over the roof for 1 s to drop the parcel
  const HOME_NEED = 45;          // 0.75 s back at the depot = landed home
  const ZX = 34, ZY = 30, ZV = 1.3; // delivery zone half-width, half-height, max speed

  // physics (units: pixels and steps)
  const G = 0.12, A0 = 0.12, TORQ = 0.0045, DRAG = 0.975, ANG_DAMP = 0.95;
  const PKG_MASS = 0.35, PKG_MASS_HEAVY = 0.9;
  const TRUCK_ROOF = 34;

  // 11 senses → 10 thinking neurons → 2 rotors
  const SIZES = [11, 10, 2];
  const INPUT_NAMES = ["Tilt", "Spin", "Sideways speed", "Up/down speed", "House left/right", "House up/down", "Battery", "Wind", "Carrying parcel", "Height", "Building ahead"];

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

  // A first-generation brain. The output layer starts small, so the rotors begin near "hover"
  // instead of wildly different from each other: take-off is less of a lottery.
  function newBrain() {
    const GN = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);
    const n = new GN.Net(SIZES);
    for (let i = (SIZES[0] + 1) * SIZES[1]; i < n.genes.length; i++) n.genes[i] *= 0.15;
    return n;
  }

  const DEFAULT_RULES = { gusts: false, heavy: false, lowbat: false, truck: false, rain: false };
  const HOME = { x: PAD_X, y: GROUND - 34 };

  class Drone {
    constructor(brain, cap) {
      this.brain = brain;
      this.x = PAD_X; this.y = GROUND - R;
      this.vx = 0; this.vy = 0; this.th = 0; this.om = 0;
      this.alive = true; this.finished = false; this.returned = false; this.why = "";
      this.battery = cap;
      this.u = [0.5, 0.5];
      this.hover = 0; this.hoverMax = 0; this.homeHover = 0;
      this.delivered = false; this.deliveredAt = 0;
      this.carrying = true; this.pkg = null;
      this.airSteps = 0; this.absTilt = 0;
      this.bestProg = 0; this.bestHome = 0;
      this.t = 0;
      this.spin = Math.random() * 6;
    }
  }

  class World {
    constructor(brains, rules = DEFAULT_RULES, seed = 1) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      const rnd = (this.rnd = seeded(seed));
      this.steps = 0;
      this.wind = 0;
      this.p1 = rnd() * 6; this.p2 = rnd() * 6; this.p3 = rnd() * 6;
      this.cap = this.rules.lowbat ? 0.5 : 1;
      this.pkgMass = this.rules.heavy ? PKG_MASS_HEAVY : PKG_MASS;

      // the town: a row of houses, a random one is the customer
      this.houses = [];
      // houses on both sides of the depot
      for (const [from, to] of [[14, 252], [392, W - 12]]) {
        let x = from + rnd() * 10;
        while (x + 58 < to) {
          const w = Math.min(60 + rnd() * 30, to - x);
          const h = 48 + rnd() * 92;
          this.houses.push({ x, w, h, top: GROUND - h, hue: Math.floor(rnd() * 360) });
          x += w + 14 + rnd() * 24;
        }
      }
      this.targetHouse = this.houses[Math.floor(rnd() * this.houses.length)];
      this.truckPhase = rnd() * 6;
      // With the truck, the right side of the street is open (those houses become scenery) and the customer drives up and down it.
      this.solid = this.rules.truck ? this.houses.filter((h) => h.x + h.w < 250) : this.houses;
      this.truckX = 410;
      this.target = this.computeTarget();
      this.startDist = Math.hypot(PAD_X - this.target.x, GROUND - R - this.target.y);
      this.homeDist = Math.hypot(this.target.x - HOME.x, this.target.y - HOME.y);
      this.ships = brains.map((b) => new Drone(b, this.cap));
      this.crashes = 0;
      this.done = false;
    }
    computeTarget() {
      if (this.rules.truck) return { x: this.truckX, y: GROUND - TRUCK_ROOF - 36, roof: GROUND - TRUCK_ROOF };
      const h = this.targetHouse;
      return { x: h.x + h.w / 2, y: h.top - 36, roof: h.top };
    }
    env() {
      const t = this.steps;
      this.wind = this.rules.gusts ? 0.04 * (0.6 * Math.sin(t * 0.013 + this.p1) + 0.4 * Math.sin(t * 0.037 + this.p2)) : 0;
      if (this.rules.truck) {
        this.truckX = 400 + 150 * Math.sin(0.006 * t + this.truckPhase);
        this.target = this.computeTarget();
      }
    }
    // The 11 numbers a drone gets to see.
    sense(s) {
      const t = s.delivered ? HOME : this.target;
      return [
        clamp(s.th / 1.2, -1.5, 1.5),
        clamp(s.om / 0.08, -1.5, 1.5),
        clamp(s.vx / 4, -1.5, 1.5),
        clamp(s.vy / 4, -1.5, 1.5),
        clamp((t.x - s.x) / 300, -1.5, 1.5),
        clamp((t.y - s.y) / 200, -1.5, 1.5),
        s.battery,
        clamp(this.wind / 0.04, -1.5, 1.5),
        s.carrying ? 1 : 0,
        clamp((GROUND - s.y) / 300, 0, 1.2),
        this.clearAhead(s, t),
      ];
    }
    // How badly a building blocks the way ahead: -1 = clear sky, +1 = a roof right at body height.
    clearAhead(s, t) {
      const dir = t.x >= s.x ? 1 : -1;
      const x0 = dir > 0 ? s.x - 18 : s.x - 90, x1 = dir > 0 ? s.x + 90 : s.x + 18;
      let top = Infinity;
      for (const h of this.solid) if (h.x < x1 && h.x + h.w > x0) top = Math.min(top, h.top);
      if (top === Infinity) return -1;
      return clamp((s.y - (top - 30)) / 100, -1, 1);
    }
    step(keys, assist = true) {
      if (this.done) return;
      this.steps++;
      this.env();
      let busy = 0;
      for (const s of this.ships) {
        if (!s.alive || s.finished) continue;
        busy++;
        s.t++;
        const m = 1 + (s.carrying ? this.pkgMass : 0);
        let uL, uR;
        if (s.human) {
          [uL, uR] = this.humanControl(s, keys || {}, assist, m);
        } else {
          const out = s.brain.forward(this.sense(s));
          uL = (out[0] + 1) / 2; uR = (out[1] + 1) / 2;
        }
        if (this.rules.rain) {
          uL = clamp(uL * 0.82 + (this.rnd() - 0.5) * 0.26, 0, 1);
          uR = clamp(uR * 0.82 + (this.rnd() - 0.5) * 0.26, 0, 1);
        }
        if (s.battery <= 0) { uL = 0; uR = 0; }
        s.u[0] = uL; s.u[1] = uR;
        s.battery = Math.max(0, s.battery - (0.00018 + 0.00035 * (uL + uR)));

        const lift = ((uL + uR) * A0) / m;
        s.vx = (s.vx + lift * Math.sin(s.th) + this.wind) * DRAG;
        s.vy = (s.vy + G - lift * Math.cos(s.th)) * DRAG;
        s.om = (s.om + ((uL - uR) * TORQ) / m) * ANG_DAMP;
        s.th += s.om;
        s.x += s.vx; s.y += s.vy;

        // ground: land gently or crash
        let onGround = false;
        if (s.y + R >= GROUND) {
          const sp = Math.hypot(s.vx, s.vy);
          if (sp > 1.8 || Math.abs(s.th) > 0.6) { this.kill(s, "ground"); continue; }
          s.y = GROUND - R; s.vy = 0; s.vx *= 0.8; s.om = 0; s.th *= 0.9;
          onGround = true;
        }
        // houses
        let hit = false;
        for (const h of this.solid) {
          const cx = clamp(s.x, h.x, h.x + h.w), cy = clamp(s.y, h.top, GROUND);
          if ((s.x - cx) ** 2 + (s.y - cy) ** 2 < R * R) { hit = true; break; }
        }
        if (hit) { this.kill(s, "building"); continue; }
        if (s.x < -10 || s.x > W + 10 || s.y < -30) { this.kill(s, "lost"); continue; }
        if (s.battery <= 0 && !onGround && !s.delivered) s.why = "battery";

        if (!onGround) { s.airSteps++; s.absTilt += Math.abs(s.th); }

        // delivery and the trip home
        const t = s.delivered ? HOME : this.target;
        const inZone = Math.abs(s.x - t.x) < ZX && Math.abs(s.y - t.y) < ZY && Math.hypot(s.vx, s.vy) < ZV;
        if (!s.delivered) {
          s.hover = inZone ? s.hover + 1 : Math.max(0, s.hover - 2);
          s.hoverMax = Math.max(s.hoverMax, s.hover);
          s.bestProg = Math.max(s.bestProg, 1 - Math.hypot(s.x - t.x, s.y - t.y) / this.startDist);
          if (s.hover >= HOVER_NEED) {
            s.delivered = true; s.deliveredAt = this.steps; s.carrying = false;
            s.pkg = { x: s.x, y: s.y + 14, vy: 0.2, landed: false };
          }
        } else {
          s.homeHover = inZone ? s.homeHover + 1 : Math.max(0, s.homeHover - 1);
          s.bestHome = Math.max(s.bestHome, 1 - Math.hypot(s.x - t.x, s.y - t.y) / this.homeDist);
          if (s.homeHover >= HOME_NEED) { s.finished = true; s.returned = true; }
        }
      }
      // parachuting parcels (just for show)
      for (const s of this.ships) {
        const p = s.pkg;
        if (p && !p.landed) {
          p.vy = Math.min(1.1, p.vy + 0.02);
          p.y += p.vy;
          p.x += Math.sin(this.steps * 0.05 + s.spin) * 0.25;
          if (p.y >= this.target.roof - 8) { p.landed = true; p.y = this.target.roof - 8; }
        }
      }
      if (!busy || this.steps >= STEPS) this.done = true;
    }
    kill(s, why) {
      s.alive = false; s.why = why; this.crashes++;
    }
    // Keys → rotor power. With the auto-level helper on, the kid asks for a lean and a climb and a tiny
    // autopilot keeps the drone level. Off = raw rotors, which is the hard thing the brain must learn.
    humanControl(s, k, assist, m) {
      const base = 0.5 * m;
      const climb = (k.up ? 1 : 0) - (k.down ? 1 : 0);
      const lean = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      if (assist) {
        const want = 0.28 * lean;
        const diff = clamp(2.2 * (want - s.th) - 30 * s.om, -0.5, 0.5);
        const c = base + 0.22 * climb - 0.12 * s.vy;
        return [clamp(c + diff / 2, 0, 1), clamp(c - diff / 2, 0, 1)];
      }
      const c = base + 0.2 * climb;
      return [clamp(c + 0.06 * lean, 0, 1), clamp(c - 0.06 * lean, 0, 1)];
    }
    fitness(s) {
      let f = 15 * (s.airSteps / STEPS) + 25 * Math.max(0, s.bestProg) + 25 * Math.min(1, s.hoverMax / HOVER_NEED);
      if (s.delivered) {
        const tilt = s.absTilt / Math.max(1, s.airSteps);
        f += 60 + 20 * Math.max(0, 1 - s.deliveredAt / (STEPS * 0.7)) + 10 * (1 - Math.min(1, tilt / 0.5));
        f += 20 * Math.max(0, s.bestHome) + (s.returned ? 50 : 0) + 15 * (s.battery / this.cap);
      }
      return f;
    }
    leader() {
      let best = null, bf = -Infinity, alive = false;
      for (const s of this.ships) {
        const f = this.fitness(s);
        const a = s.alive;
        if ((a && !alive) || (a === alive && f > bf)) { best = s; bf = f; alive = a; }
      }
      return best;
    }
  }

  const api = { W, H, GROUND, PAD_X, R, STEPS, HOVER_NEED, HOME_NEED, ZX, ZY, SIZES, INPUT_NAMES, DEFAULT_RULES, HOME, TRUCK_ROOF, World, Drone, newBrain, seeded, clamp };
  root.DroneCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
