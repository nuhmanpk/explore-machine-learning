// Robo Arm — a two-joint arm driven by "muscles", and one generation of evolution.
// Each joint has a lift muscle and a lower muscle. The brain squeezes them (0..1) and the difference is a torque.
// Task: pick the cube up at A, carry it, and let go over the pad at B. No DOM, so it also runs in Node (needs game-net.js).
(function (root) {
  const W = 640, H = 420;
  const GROUND = 372;                 // the table top
  const BASE = { x: 320, y: 235 };    // shoulder
  const L1 = 118, L2 = 104;           // upper arm, forearm
  const CUBE = 16;                    // cube side
  const STEPS = 1000;                 // one try ≈ 17 s
  const GRIP_R = 22;                  // how close the claw must be to grab
  const PAD_W = 56;                   // width of the drop pad B
  const A_RANGE = [120, 240], B_RANGE = [400, 520];

  // joint limits (screen angles, 0 = pointing right, positive = turning clockwise, so down is +)
  const LIM1 = [-1.4, 3.7], LIM2 = [-2.7, 2.7];
  // physics: torque = K·(lower − lift) + gravity. Units are radians per step.
  const K1 = 0.0058, K2 = 0.0042, G1 = 0.0026, G2 = 0.0013, DAMP = 0.9, LAG = 0.28;
  const CUBE_G1 = 0.0009, CUBE_HEAVY = 0.0026;

  // 10 senses → 12 thinking neurons → 5 outputs: lift1, lower1, lift2, lower2, claw
  const SIZES = [10, 12, 5];
  const INPUT_NAMES = ["Shoulder angle", "Elbow angle", "Shoulder speed", "Elbow speed", "Goal: sideways", "Goal: up/down", "Holding cube", "Claw closed", "Cube in reach", "Claw height"];
  const OUTPUT_NAMES = ["Shoulder lift", "Shoulder lower", "Elbow lift", "Elbow lower", "Claw squeeze"];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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

  // heavy = heavier cube; tired = weaker muscles; shaky = noisy nerves; small = narrow pad; moving = the pad slides
  const DEFAULT_RULES = { heavy: false, tired: false, shaky: false, small: false, moving: false };

  function tipOf(s) {
    const a1 = s.th1, a2 = s.th1 + s.th2;
    const ex = BASE.x + Math.cos(a1) * L1, ey = BASE.y + Math.sin(a1) * L1;
    return { ex, ey, x: ex + Math.cos(a2) * L2, y: ey + Math.sin(a2) * L2 };
  }

  class Arm {
    constructor(brain) {
      this.brain = brain;
      this.th1 = -0.6; this.th2 = 1.4; this.w1 = 0; this.w2 = 0;   // start: raised, claw out in front
      this.act = [0, 0, 0, 0]; this.grip = 0;
      this.cmd = [0, 0, 0, 0, 0];
      this.holding = false; this.released = false; this.delivered = false; this.deliveredAt = 0; this.missed = false;
      this.cube = null; // set by World
      this.t = 0; this.energy = 0;
      this.reach = 0; this.bestD = 1e9; this.grasped = false; this.graspedAt = 0; this.carry = 0;
      this.tip = tipOf(this);
      this.alive = true; this.finished = false;
    }
  }

  class World {
    constructor(brains, rules = DEFAULT_RULES, seed = 1) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      const rnd = (this.rnd = seeded(seed));
      this.steps = 0;
      this.ax = A_RANGE[0] + rnd() * (A_RANGE[1] - A_RANGE[0]);
      this.bx0 = B_RANGE[0] + rnd() * (B_RANGE[1] - B_RANGE[0]);
      this.phase = rnd() * 6;
      this.padW = this.rules.small ? 34 : PAD_W;
      this.bx = this.bx0;
      this.cubeMass = this.rules.heavy ? CUBE_HEAVY : CUBE_G1;
      this.power = this.rules.tired ? 0.6 : 1;
      this.arms = brains.map((b) => {
        const a = new Arm(b);
        a.cube = { x: this.ax, y: GROUND - CUBE / 2, vy: 0, held: false, landed: true };
        return a;
      });
      this.d0 = 1;
      if (this.arms.length) {
        const t = this.arms[0].tip;
        this.d0 = Math.hypot(t.x - this.ax, t.y - (GROUND - CUBE / 2));
        this.dAB = Math.abs(this.bx0 - this.ax) + 1;
      }
    }
    padX() { return this.bx; }
    env() {
      this.bx = this.rules.moving ? clamp(this.bx0 + 45 * Math.sin(0.008 * this.steps + this.phase), B_RANGE[0] - 30, B_RANGE[1] + 30) : this.bx0;
    }
    // the goal the arm is steering the claw toward right now
    goal(a) {
      if (a.holding || a.grasped) return { x: this.padX(), y: GROUND - CUBE - 54 };
      return { x: a.cube.x, y: a.cube.y - 2 };
    }
    sense(a) {
      const g = this.goal(a), t = a.tip;
      const near = a.holding ? 1 : Math.hypot(t.x - a.cube.x, t.y - a.cube.y) < GRIP_R + 6 ? 1 : 0;
      return [
        a.th1 / 2, a.th2 / 2, clamp(a.w1 * 15, -1.5, 1.5), clamp(a.w2 * 15, -1.5, 1.5),
        clamp((g.x - t.x) / 150, -1.5, 1.5), clamp((g.y - t.y) / 150, -1.5, 1.5),
        a.holding ? 1 : 0, a.grip, near, clamp((GROUND - t.y) / 150, -0.5, 1.5),
      ];
    }
    step(keys, assist) {
      if (this.done) return;
      this.steps++;
      this.env();
      let busy = 0;
      for (const a of this.arms) {
        if (a.finished) continue;
        busy++;
        a.t++;
        let cmd;
        if (a.human) cmd = this.humanCmd(a, keys || {});
        else {
          const o = a.brain.forward(this.sense(a));
          cmd = [(o[0] + 1) / 2, (o[1] + 1) / 2, (o[2] + 1) / 2, (o[3] + 1) / 2, o[4]];
        }
        if (this.rules.shaky) for (let i = 0; i < 4; i++) cmd[i] = clamp(cmd[i] + (this.rnd() - 0.5) * 0.32, 0, 1);
        a.cmd = cmd;
        for (let i = 0; i < 4; i++) a.act[i] += (cmd[i] - a.act[i]) * LAG; // muscles take a moment to tense
        a.energy += (a.act[0] + a.act[1] + a.act[2] + a.act[3]) / 4;

        const cubeG = a.holding ? this.cubeMass : 0;
        const c1 = Math.cos(a.th1), c12 = Math.cos(a.th1 + a.th2);
        // gravity pulls every link down: the shoulder carries the whole arm, the elbow only the forearm (and the cube)
        let g1 = G1 * c1 + G2 * 1.6 * c12 + cubeG * (c1 + 1.8 * c12);
        let g2 = (G2 + cubeG) * c12;
        if (a.human && assist) { g1 = 0; g2 = 0; } // helper: cancel gravity so the arm floats where you leave it
        const t1 = this.power * K1 * (a.act[1] - a.act[0]) + g1;
        const t2 = this.power * K2 * (a.act[3] - a.act[2]) + g2;
        a.w1 = a.w1 * DAMP + t1; a.w2 = a.w2 * DAMP + t2;
        a.th1 += a.w1; a.th2 += a.w2;
        if (a.th1 < LIM1[0] || a.th1 > LIM1[1]) { a.th1 = clamp(a.th1, LIM1[0], LIM1[1]); a.w1 = 0; }
        if (a.th2 < LIM2[0] || a.th2 > LIM2[1]) { a.th2 = clamp(a.th2, LIM2[0], LIM2[1]); a.w2 = 0; }
        a.tip = tipOf(a);
        // the arm can't go through the table: lift the elbow, then fold the forearm up so the claw rests on it
        const lim = GROUND - 3;
        for (let k = 0; k < 40 && a.tip.ey > lim; k++) { a.th1 -= 0.02; a.w1 = Math.min(a.w1, 0); a.tip = tipOf(a); }
        if (a.tip.y > lim) {
          const sinA = clamp((lim - a.tip.ey) / L2, -1, 1);
          const cur = a.th1 + a.th2;
          const c1 = Math.asin(sinA), c2 = Math.PI - c1;
          const wr = (x) => Math.atan2(Math.sin(x), Math.cos(x));
          const pick = Math.abs(wr(c1 - cur)) < Math.abs(wr(c2 - cur)) ? c1 : c2;
          a.th2 = clamp(wr(pick - a.th1), LIM2[0], LIM2[1]);
          a.w2 = 0; a.w1 = Math.min(a.w1, 0);
          a.tip = tipOf(a);
        }

        // claw
        a.grip += (clamp(cmd[4], -1, 1) > 0 ? 1 - a.grip : -a.grip) * 0.16;
        const c = a.cube, t = a.tip;
        if (!a.released) {
          if (!a.holding && a.grip > 0.6 && Math.hypot(t.x - c.x, t.y - c.y) < GRIP_R) {
            a.holding = true; c.held = true; c.landed = false;
            if (!a.grasped) { a.grasped = true; a.graspedAt = a.t; }
          }
          if (a.holding && a.grip < 0.45) { a.holding = false; c.held = false; a.released = true; c.vy = 0; }
        }
        if (a.holding) { c.x = t.x; c.y = t.y + 3; c.vy = 0; }
        else if (!c.landed) { // falling
          c.vy += 0.16; c.y += c.vy;
          if (c.y >= GROUND - CUBE / 2) { c.y = GROUND - CUBE / 2; c.landed = true; c.vy = 0; this.land(a); }
        }
        // progress
        if (!a.grasped) { const d = Math.hypot(t.x - c.x, t.y - c.y); a.bestD = Math.min(a.bestD, d); a.reach = Math.max(a.reach, 1 - d / this.d0); }
        else a.carry = Math.max(a.carry, 1 - Math.abs(c.x - this.padX()) / this.dAB);
        if (a.finished) busy--;
      }
      if (!busy || this.steps >= STEPS) this.done = true;
    }
    land(a) {
      if (!a.released) return;
      if (Math.abs(a.cube.x - this.padX()) < this.padW / 2) { a.delivered = true; a.deliveredAt = a.t; }
      else a.missed = true;
      a.finished = true;
    }
    humanCmd(a, k) {
      const cmd = [0, 0, 0, 0, a.humanGrip ? 1 : -1];
      if (k.up) cmd[0] = 1;      // shoulder lift
      if (k.down) cmd[1] = 1;    // shoulder lower
      if (k.left) cmd[2] = 1;    // elbow lift
      if (k.right) cmd[3] = 1;   // elbow lower
      return cmd;
    }
    fitness(a) {
      let f = 20 * Math.max(0, a.reach) + (a.grasped ? 0 : 15 * Math.exp(-a.bestD / 20));
      if (a.grasped) f += 45 + 40 * Math.max(0, a.carry);
      if (a.delivered) f += 100 + 60 * (1 - a.deliveredAt / STEPS);
      if (a.missed) f -= 8;
      f -= 6 * (a.energy / Math.max(1, a.t));
      return f;
    }
    leader() {
      let best = null, bf = -Infinity;
      for (const a of this.arms) { if (a.human) continue; const f = this.fitness(a); if (f > bf) { bf = f; best = a; } }
      return best || this.arms[0];
    }
  }

  const api = { W, H, GROUND, BASE, L1, L2, CUBE, STEPS, PAD_W, GRIP_R, SIZES, INPUT_NAMES, OUTPUT_NAMES, DEFAULT_RULES, World, Arm, newBrain, tipOf, LIM1, LIM2 };
  root.ArmCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
