// Sheepdog Round-Up — a field, a pen with a gate, a flock that follows simple "boids" rules,
// and a dog steered by a tiny brain (or by you). One World = one dog with its own flock.
// No DOM, so it also runs in Node (needs game-net.js for brains).
(function (root) {
  const W = 640, H = 420;
  const STEPS = 1500;               // one try = 25 s at normal speed
  const DOG_V = 3.0;                // the dog's top speed (px / step)
  const SHEEP_V = 2.1;              // a scared sheep's top speed
  const FLEE_R = 95;                // sheep notice the dog inside this distance
  const SEE_R = 70;                 // sheep notice other sheep inside this distance
  const PEN = { x0: 530, x1: 626, y0: 140, y1: 280 };
  const GATE_Y = 210;
  // how a stubborn sheep differs: weak pull toward friends, a bit braver, wanders more, and heads for its own grass
  const STB = { coh: 0.0008, push: 0.24, wand: 0.04, pull: 0.025 };

  // 10 senses → 10 thinking neurons → 2 controls (run sideways, run up/down)
  const SIZES = [10, 10, 2];
  const INPUT_NAMES = ["Flock ahead", "Flock to the right", "Far sheep ahead", "Far sheep to the right", "Pen way: across", "Pen way: up/down", "Pen distance", "Flock spread", "Dog: across", "Dog: up/down"];

  // wind = a steady breeze pushing sheep away from the pen; stubborn = two sheep wander off on their own;
  // big = a bigger flock (18 instead of 10); narrow = the gate is half as wide
  const DEFAULT_RULES = { wind: false, stubborn: false, big: false, narrow: false };

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
  const GN = () => root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);
  function newBrain() {
    const n = new (GN().Net)(SIZES);
    for (let i = (SIZES[0] + 1) * SIZES[1]; i < n.genes.length; i++) n.genes[i] *= 0.5;
    return n;
  }

  const inPen = (x, y, m = 0) => x > PEN.x0 - m && x < PEN.x1 + m && y > PEN.y0 - m && y < PEN.y1 + m;

  class World {
    // brain: a GameNet.Net, or null when a person (or a test controller) steers the dog
    constructor(brain, rules = DEFAULT_RULES, seed = 1) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      this.brain = brain;
      const rnd = (this.rnd = seeded(seed));
      this.steps = 0;
      this.done = false;
      this.gateHalf = this.rules.narrow ? 17 : 34;
      this.gate = { x: PEN.x0, y: GATE_Y };
      this.wind = this.rules.wind ? { x: -0.045, y: 0.03 } : { x: 0, y: 0 };
      const n = this.rules.big ? 18 : 10;
      // the flock starts grazing in a loose bunch somewhere on the left half of the field
      const cx = 150 + rnd() * 160, cy = 110 + rnd() * 200;
      this.sheep = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283, r = 12 + rnd() * 46;
        this.sheep.push({
          x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: 0, vy: 0, h: rnd() * 6.283,
          penned: false, tPen: 0, scared: 0,
          stubborn: this.rules.stubborn && i < 2,
          goal: null, // a stubborn sheep's favourite grass patch
        });
      }
      // the dog starts somewhere along the bottom or left edge
      const side = rnd();
      this.dog = side < 0.5 ? { x: 30 + rnd() * 380, y: H - 30 } : { x: 30, y: 40 + rnd() * 340 };
      this.dog.vx = 0; this.dog.vy = 0; this.dog.ax = 0; this.dog.ay = 0;
      this.n = n;
      this.penned = 0;
      this.tAll = 0;
      this.d0 = this.meanGateDist();
      this.input = new Array(SIZES[0]).fill(0);
      this.out = [0, 0];
    }
    free() { return this.sheep.filter((s) => !s.penned); }
    meanGateDist() {
      let t = 0;
      for (const s of this.sheep) t += s.penned ? 0 : Math.hypot(s.x - this.gate.x, s.y - this.gate.y);
      return t / this.sheep.length;
    }
    // where the loose sheep are: centre, the one furthest from the centre, and how spread out they are
    flock() {
      let cx = 0, cy = 0, k = 0;
      for (const s of this.sheep) if (!s.penned) { cx += s.x; cy += s.y; k++; }
      if (!k) return null;
      cx /= k; cy /= k;
      let far = null, fd = -1;
      for (const s of this.sheep) if (!s.penned) { const d = Math.hypot(s.x - cx, s.y - cy); if (d > fd) { fd = d; far = s; } }
      return { cx, cy, far, spread: fd, k };
    }
    // "the way in": a spot just outside the gate, or (once the flock is there) a spot inside the pen
    aimPoint(f) {
      const near = Math.hypot(f.cx - (this.gate.x - 40), f.cy - this.gate.y) < 40;
      return { x: near ? this.gate.x + 40 : this.gate.x - 40, y: this.gate.y };
    }
    // The dog sees the world turned so that "the way to the pen" (from the flock) is always straight ahead.
    // along = how far ahead toward the pen, side = how far to the right of that line.
    sense() {
      const d = this.dog, f = this.flock(), x = this.input;
      if (!f) { x.fill(0); this.frame = null; return x; }
      const a = this.aimPoint(f);
      const gx = a.x - f.cx, gy = a.y - f.cy, gd = Math.hypot(gx, gy) || 1;
      const ux = gx / gd, uy = gy / gd; // the pen way
      const along = (vx, vy) => (vx * ux + vy * uy) / 200, side = (vx, vy) => (-vx * uy + vy * ux) / 200;
      this.frame = { ux, uy, f, aim: a };
      x[0] = clamp(along(f.cx - d.x, f.cy - d.y), -1.5, 1.5);
      x[1] = clamp(side(f.cx - d.x, f.cy - d.y), -1.5, 1.5);
      x[2] = clamp(along(f.far.x - d.x, f.far.y - d.y), -1.5, 1.5);
      x[3] = clamp(side(f.far.x - d.x, f.far.y - d.y), -1.5, 1.5);
      x[4] = ux;
      x[5] = uy;
      x[6] = clamp(gd / 400, 0, 1.5);
      x[7] = clamp(f.spread / 120, 0, 1.5);
      x[8] = (d.x / W) * 2 - 1;
      x[9] = (d.y / H) * 2 - 1;
      return x;
    }
    // ctrl: [-1..1, -1..1] run direction (screen x, y) for a person; ignored when a brain drives
    step(ctrl) {
      if (this.done) return;
      this.steps++;
      const d = this.dog, rnd = this.rnd;
      let ux, uy;
      if (this.brain) {
        const o = this.brain.forward(this.sense());
        this.raw = [o[0], o[1]]; // brain's answer: [toward the pen, to the right]
        const fr = this.frame;
        if (fr) { ux = o[0] * fr.ux - o[1] * fr.uy; uy = o[0] * fr.uy + o[1] * fr.ux; } else { ux = 0; uy = 0; }
      } else { this.sense(); ux = ctrl ? ctrl[0] : 0; uy = ctrl ? ctrl[1] : 0; }
      const m = Math.hypot(ux, uy);
      if (m > 1) { ux /= m; uy /= m; }
      this.out[0] = ux; this.out[1] = uy;
      d.vx += (ux * DOG_V - d.vx) * 0.25;
      d.vy += (uy * DOG_V - d.vy) * 0.25;
      let nx = clamp(d.x + d.vx, 8, W - 8), ny = clamp(d.y + d.vy, 8, H - 8);
      // the dog may not jump into the pen
      if (inPen(nx, ny, 8)) { if (!inPen(nx, d.y, 8)) ny = d.y; else if (!inPen(d.x, ny, 8)) nx = d.x; else { nx = d.x; ny = d.y; } }
      d.x = nx; d.y = ny;

      const S = this.sheep, n = S.length;
      for (let i = 0; i < n; i++) {
        const s = S[i];
        if (s.penned) { // happy inside: just mill about
          s.vx = s.vx * 0.9 + (rnd() - 0.5) * 0.12; s.vy = s.vy * 0.9 + (rnd() - 0.5) * 0.12;
          s.x = clamp(s.x + s.vx, PEN.x0 + 9, PEN.x1 - 8); s.y = clamp(s.y + s.vy, PEN.y0 + 8, PEN.y1 - 8);
          continue;
        }
        let ax = 0, ay = 0;
        // 1. flock rules: stay near friends (cohesion), match their way (alignment), don't bump (separation)
        let mx = 0, my = 0, mvx = 0, mvy = 0, k = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const o = S[j];
          if (o.penned) continue;
          const dx = o.x - s.x, dy = o.y - s.y, dd = dx * dx + dy * dy;
          if (dd < SEE_R * SEE_R) { mx += o.x; my += o.y; mvx += o.vx; mvy += o.vy; k++; }
          if (dd < 15 * 15 && dd > 0.01) { const r = Math.sqrt(dd); ax -= (dx / r) * (15 - r) * 0.06; ay -= (dy / r) * (15 - r) * 0.06; }
        }
        const coh = s.stubborn ? STB.coh : 0.0035;
        if (k) { ax += (mx / k - s.x) * coh; ay += (my / k - s.y) * coh; ax += (mvx / k - s.vx) * 0.04; ay += (mvy / k - s.vy) * 0.04; }
        // 2. run from the dog
        const ddx = s.x - d.x, ddy = s.y - d.y, dr = Math.hypot(ddx, ddy) || 0.01;
        if (dr < FLEE_R) {
          const push = (s.stubborn ? STB.push : 0.32) * (1 - dr / FLEE_R) + 0.04;
          ax += (ddx / dr) * push; ay += (ddy / dr) * push;
          s.scared = Math.min(1, s.scared + 0.1);
        } else s.scared = Math.max(0, s.scared - 0.02);
        // 3. graze: wander a little (stubborn ones wander a lot, toward a favourite patch of grass)
        s.h += (rnd() - 0.5) * 0.5;
        const wand = s.stubborn ? STB.wand : 0.012;
        ax += Math.cos(s.h) * wand; ay += Math.sin(s.h) * wand;
        if (s.stubborn) {
          if (!s.goal || rnd() < 0.004) s.goal = { x: 40 + rnd() * 380, y: 40 + rnd() * (H - 80) };
          const gx = s.goal.x - s.x, gy = s.goal.y - s.y, gd = Math.hypot(gx, gy) || 1;
          if (dr > FLEE_R) { ax += (gx / gd) * STB.pull; ay += (gy / gd) * STB.pull; }
        }
        // 4. the wind
        ax += this.wind.x; ay += this.wind.y;
        // 5. fences: the field edge pushes back
        const e = 22;
        if (s.x < e) ax += (e - s.x) * 0.02; if (s.x > W - e) ax -= (s.x - W + e) * 0.02;
        if (s.y < e) ay += (e - s.y) * 0.02; if (s.y > H - e) ay -= (s.y - H + e) * 0.02;
        s.vx = (s.vx + ax) * 0.9; s.vy = (s.vy + ay) * 0.9;
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > SHEEP_V) { s.vx *= SHEEP_V / sp; s.vy *= SHEEP_V / sp; }
        // move, but the pen's fence only opens at the gate
        let px = clamp(s.x + s.vx, 6, W - 6), py = clamp(s.y + s.vy, 6, H - 6);
        if (inPen(px, py, 5)) {
          const throughGate = s.x <= PEN.x0 + 7 && Math.abs(py - GATE_Y) < this.gateHalf - 4;
          if (throughGate) {
            if (px > PEN.x0 + 6) { s.penned = true; s.tPen = this.steps; this.penned++; s.vx *= 0.3; s.vy *= 0.3; }
          } else {
            if (!inPen(px, s.y, 5)) py = s.y;
            else if (!inPen(s.x, py, 5)) px = s.x;
            else { px = s.x; py = s.y; }
            s.vx *= 0.5; s.vy *= 0.5;
          }
        }
        s.x = px; s.y = py;
      }
      if (this.penned === this.n && !this.tAll) this.tAll = this.steps;
      if (this.penned === this.n || this.steps >= STEPS) this.done = true;
    }
    // what a kid sees, out of 100: half a share per sheep penned, the other half is a time bonus for being quick
    score() {
      let t = 0;
      for (const s of this.sheep) if (s.penned) t += 0.5 + 0.5 * (1 - s.tPen / STEPS);
      return (100 * t) / this.n;
    }
    // what evolution uses: the score, plus credit for moving the flock closer to the gate (so early dogs can improve)
    fitness() {
      const frac = this.penned / this.n;
      let bonus = 0;
      for (const s of this.sheep) if (s.penned) bonus += 1 - s.tPen / STEPS;
      const closer = 1 - this.meanGateDist() / Math.max(1, this.d0); // 1 = everyone in, 0 = no closer
      return 100 * frac + 40 * (bonus / this.n) + 40 * clamp(closer, -1, 1);
    }
  }

  // A hand-written herding rule (like the one shepherds and robot researchers use): collect the straggler
  // when the flock is spread out, otherwise get behind the flock and push it toward the gate.
  // Only used for testing and in "For grown-ups" numbers; the evolved dogs never see it.
  function classicDog(w) {
    const f = w.flock(), d = w.dog;
    if (!f) return [0, 0];
    // aim the flock at a spot just outside the gate, then straight in through it
    const a = w.aimPoint(f);
    const gx = a.x - f.cx, gy = a.y - f.cy, gd = Math.hypot(gx, gy) || 1;
    let tx, ty;
    if (f.spread > 26 + 7 * Math.sqrt(f.k)) {
      const fx = f.far.x - f.cx, fy = f.far.y - f.cy, fd = Math.hypot(fx, fy) || 1;
      tx = f.far.x + (fx / fd) * 22; ty = f.far.y + (fy / fd) * 22;
    } else { tx = f.cx - (gx / gd) * (f.spread + 40); ty = f.cy - (gy / gd) * (f.spread + 40); }
    const vx = tx - d.x, vy = ty - d.y, v = Math.hypot(vx, vy) || 1;
    const sl = v < 20 ? v / 20 : 1;
    return [(vx / v) * sl, (vy / v) * sl];
  }

  // Run one whole try and return the world (for tests and checkpoints).
  function runTry(brain, rules, seed, ctrlFn) {
    const w = new World(brain, rules, seed);
    while (!w.done) w.step(ctrlFn ? ctrlFn(w) : null);
    return w;
  }

  const api = { STB, W, H, STEPS, DOG_V, FLEE_R, PEN, GATE_Y, SIZES, INPUT_NAMES, DEFAULT_RULES, World, newBrain, classicDog, runTry, seeded, inPen };
  root.HerdCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
