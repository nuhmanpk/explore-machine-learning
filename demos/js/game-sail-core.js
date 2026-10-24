// Sailboat Beats the Wind — sailing physics + one round of learning boats. No DOM (runs in Node too).
// A sailboat can't sail straight into the wind (the "no-go zone"), so to reach a buoy that is
// upwind it must zig-zag ("tack"). The boats' brains only steer; the sail trims itself.
(function (root) {
  const GN = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);
  const W = 600, H = 440;
  const START = { x: 300, y: H - 40 };
  const RAYS = 5, RAY_LEN = 110;
  const SIZES = [9 + RAYS, 8, 1];
  const MAX_STEPS = 1300;
  const VMAX = 2.1;
  const NO_GO = (38 * Math.PI) / 180;
  const COURSE_MIN = (45 * Math.PI) / 180, COURSE_MAX = (100 * Math.PI) / 180;
  const SHIFT = (60 * Math.PI) / 180; // "wind shift" swings the wind 60° to the right
  const NORTH = -Math.PI / 2; // screen "up"
  // The race runs up a channel between two sandy shores, so one long diagonal hits the shore
  // early: the only way upwind is to turn back and forth (tack).
  const SHORE_L = 140, SHORE_R = W - 140;

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
  // Smallest signed difference between two angles, in -π..π.
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  // How fast a boat goes for a given angle away from where the wind comes from (0 = straight into it).
  // This curve is called a "polar". Pointing into the wind = 0 speed.
  function polar(off) {
    const d = Math.abs(off);
    if (d < NO_GO) return 0;
    const deg = (d * 180) / Math.PI;
    if (deg < 75) return Math.pow((deg - 38) / 37, 0.7);
    if (deg <= 110) return 1;
    return 1 - (0.3 * (deg - 110)) / 70;
  }
  function pointOfSail(off) {
    const deg = (Math.abs(off) * 180) / Math.PI;
    if (deg < 38) return "in irons";
    if (deg < 60) return "close-hauled";
    if (deg < 110) return "beam reach";
    if (deg < 150) return "broad reach";
    return "running";
  }

  // challenges: { shift: bool, gusts: bool, current: bool, islands: bool, moveBuoy: bool }
  class Sea {
    constructor(seed, ch = {}) {
      this.ch = Object.assign({ shift: false, gusts: false, current: false, islands: false, moveBuoy: false }, ch);
      const r = seeded(seed);
      this.buoy = this.ch.moveBuoy ? { x: SHORE_L + 40 + r() * (SHORE_R - SHORE_L - 80), y: 44 + r() * 120 } : { x: 300 + (r() - 0.5) * 40, y: 50 };
      this.islands = this.ch.islands ? [{ x: 235 + r() * 30, y: 285, r: 17 }, { x: 335 + r() * 30, y: 175, r: 15 }] : [];
      this.baseWind = NORTH + (this.ch.shift ? SHIFT : 0); // where the wind comes FROM
      this.phase = r() * 100;
      this.t = 0;
    }
    windFrom() {
      if (!this.ch.gusts) return this.baseWind;
      const p = this.t + this.phase;
      return this.baseWind + 0.6 * Math.sin(p / 47) * Math.sin(p / 19);
    }
    windStrength() {
      if (!this.ch.gusts) return 1;
      return 0.35 + 1.0 * Math.abs(Math.sin((this.t + this.phase) / 45)); // lulls and strong puffs
    }
    current() {
      return this.ch.current ? { cx: 0.55, cy: 0 } : { cx: 0, cy: 0 };
    }
    step() { this.t++; }
  }

  function segCircle(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy;
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }

  class Sailboat {
    constructor(brain) {
      this.brain = brain;
      this.x = START.x;
      this.y = START.y;
      this.a = NORTH + 0.05; // starts pointing at the buoy, i.e. straight into the wind!
      this.v = 0;
      this.dead = false;
      this.reached = false;
      this.steps = 0;
      this.tacks = 0;
      this.lastSide = 0;
      this.bestD = Infinity;
      this.bestProg = 0; // furthest progress toward the buoy along the start→buoy line (0..1)
      this.lastImprove = 0;
      this.rays = new Array(RAYS).fill(1);
      this.input = [];
      this.rudder = 0;
      this.trail = [];
    }
    sense(sea) {
      for (let i = 0; i < RAYS; i++) {
        const ang = this.a + (i / (RAYS - 1) - 0.5) * 1.6;
        const ex = this.x + Math.cos(ang) * RAY_LEN, ey = this.y + Math.sin(ang) * RAY_LEN;
        let best = 1;
        for (const o of sea.islands) {
          const t = segCircle(this.x, this.y, ex, ey, o.x, o.y, o.r);
          if (t !== null && t < best) best = t;
        }
        if (ex < SHORE_L) best = Math.min(best, (this.x - SHORE_L) / (this.x - ex));
        if (ex > SHORE_R) best = Math.min(best, (SHORE_R - this.x) / (ex - this.x));
        this.rays[i] = Math.max(0, best);
      }
      const toBuoy = Math.atan2(sea.buoy.y - this.y, sea.buoy.x - this.x);
      const relBuoy = angDiff(toBuoy, this.a);
      const relWind = angDiff(sea.windFrom(), this.a);
      const c = sea.current();
      this.relBuoy = relBuoy;
      this.relWind = relWind;
      this.input = [
        Math.sin(relBuoy), Math.cos(relBuoy),
        Math.sin(relWind), Math.cos(relWind),
        this.v / VMAX,
        Math.min(1, Math.hypot(sea.buoy.x - this.x, sea.buoy.y - this.y) / 450),
        c.cx, c.cy,
        ((this.x - SHORE_L) / (SHORE_R - SHORE_L)) * 2 - 1, // where across the channel am I (left shore −1, right +1)
        ...this.rays.map((r) => 1 - r),
      ];
      return this.input;
    }
    step(sea, manualRudder) {
      if (this.dead || this.reached) return;
      this.steps++;
      this.sense(sea);
      if (manualRudder !== undefined) this.rudder = manualRudder;
      else {
        // The brain picks a COURSE: the sign says which side of the wind (a tack = flipping it),
        // the size says how far off the wind, from 45° (close-hauled) to 100° (beam reach).
        // A little autopilot turns the rudder to hold that course.
        const o = this.brain.forward(this.input)[0];
        this.course = (o < 0 ? -1 : 1) * (COURSE_MIN + Math.abs(o) * (COURSE_MAX - COURSE_MIN));
        const want = sea.windFrom() + this.course;
        this.rudder = Math.max(-1, Math.min(1, angDiff(want, this.a) * 2.5));
      }
      // Turning works better when moving, but a little even when stalled (so you can escape "irons").
      this.a += this.rudder * 0.05 * (0.6 + 0.4 * this.v / VMAX);
      const off = angDiff(this.a, sea.windFrom());
      this.off = off;
      const target = VMAX * polar(off) * sea.windStrength();
      this.v += (target - this.v) * (target < this.v ? 0.02 : 0.04); // boats coast a little through a tack
      // A tack = the wind switches from one side of the boat to the other while sailing upwind.
      const side = Math.sign(off);
      if (this.lastSide && side !== this.lastSide && Math.abs(off) < Math.PI / 2) this.tacks++;
      this.lastSide = side;
      const wf = sea.windFrom(), drift = (sea.ch.gusts ? 0.3 : 0.12) * sea.windStrength(), c = sea.current();
      this.x += Math.cos(this.a) * this.v - Math.cos(wf) * drift + c.cx;
      this.y += Math.sin(this.a) * this.v - Math.sin(wf) * drift + c.cy;
      if (this.steps % 4 === 0) { this.trail.push(this.x, this.y); if (this.trail.length > 160) this.trail.splice(0, 2); }
      for (const o of sea.islands) if (Math.hypot(this.x - o.x, this.y - o.y) < o.r + 7) { this.dead = true; this.why = "island"; }
      if (this.x < SHORE_L + 6 || this.x > SHORE_R - 6 || this.y < 6 || this.y > H - 6) { this.dead = true; this.why = "shore"; }
      const d = Math.hypot(this.x - sea.buoy.x, this.y - sea.buoy.y);
      if (d < 18) this.reached = true;
      const d0x = sea.buoy.x - START.x, d0y = sea.buoy.y - START.y, d0 = Math.hypot(d0x, d0y);
      const prog = ((this.x - START.x) * d0x + (this.y - START.y) * d0y) / (d0 * d0);
      if (prog > this.bestProg + 0.002) { this.bestProg = prog; this.lastImprove = this.steps; }
      if (d < this.bestD - 0.5) { this.bestD = d; this.lastImprove = this.steps; }
      else if (this.steps - this.lastImprove > 260) { this.dead = true; this.why = "stuck"; }
    }
    fitness(sea) {
      const d0 = Math.hypot(START.x - sea.buoy.x, START.y - sea.buoy.y);
      if (this.reached) return 2 + (1 - this.steps / MAX_STEPS);
      // Mostly: how far upwind did it get? (Sailing a diagonal counts, even if it ends at the edge.)
      const closeness = Math.max(0, 1 - this.bestD / d0);
      const score = 0.75 * Math.min(1, this.bestProg) + 0.25 * closeness;
      return score * (!this.dead ? 1 : this.why === "stuck" ? 0.7 : 0.5);
    }
  }

  class Round {
    constructor(brains, seed, ch) {
      this.sea = new Sea(seed, ch);
      this.boats = brains.map((b) => new Sailboat(b));
      this.steps = 0;
      this.done = false;
    }
    step() {
      if (this.done) return;
      this.steps++;
      this.sea.step();
      let active = 0;
      for (const b of this.boats) {
        b.step(this.sea);
        if (!b.dead && !b.reached) active++;
      }
      if (active === 0 || this.steps >= MAX_STEPS) this.done = true;
    }
    run() { while (!this.done) this.step(); return this; }
    results() {
      const fit = this.boats.map((b) => b.fitness(this.sea));
      const reached = this.boats.filter((b) => b.reached).length;
      const top = fit.slice().sort((a, b) => b - a).slice(0, Math.ceil(fit.length / 2));
      const topReached = top.filter((f) => f >= 2).length / top.length;
      let best = 0;
      fit.forEach((f, i) => { if (f > fit[best]) best = i; });
      const champ = this.boats[best];
      return { fit, reached, best, bestFit: fit[best], topReached, champSteps: champ.reached ? champ.steps : null, champTacks: champ.tacks };
    }
    leader() {
      let lead = null, lf = -Infinity;
      for (const b of this.boats) {
        const f = b.fitness(this.sea) - (b.dead ? 1 : 0);
        if (f > lf) { lf = f; lead = b; }
      }
      return lead;
    }
  }

  const api = { SHORE_L, SHORE_R, W, H, START, RAYS, RAY_LEN, SIZES, MAX_STEPS, VMAX, NO_GO, NORTH, polar, pointOfSail, angDiff, Sea, Sailboat, Round, seeded };
  root.SailGame = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
