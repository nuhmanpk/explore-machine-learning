// Rocket Lander — physics, challenges and a neuroevolution learner. No DOM, so it also runs in Node.
// Many rockets (each with its own tiny brain) try to land; the best brains become parents.
(function (root) {
  const W = 600, H = 400;
  const PAD_W = 90;
  const THRUST = 0.13, TURN = 0.06, MAX_STEPS = 700;

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

  // The world rules. Challenges change these live.
  function defaultRules() {
    return { gravity: 0.05, wind: 0, gusts: false, movingPad: false, fuel: 1, bumpyPad: false };
  }

  // One landing attempt. y is height above the ground (up = positive).
  class Flight {
    constructor(rules, start) {
      this.rules = rules;
      this.x = start.x;
      this.y = start.y;
      this.vx = start.vx;
      this.vy = 0;
      this.angle = start.angle; // 0 = upright, positive = tilted right
      this.padX0 = start.padX;
      this.padX = start.padX;
      this.padV = 0;
      this.fuel = 260 * rules.fuel;
      this.fuelMax = this.fuel;
      this.steps = 0;
      this.done = false;
      this.result = null; // "landed" | "crashed" | "missed" | "lost"
      this.thrusting = false;
      this.gustPhase = start.gust;
      this.windNow = 0;
    }
    step(ctrl) {
      if (this.done) return;
      const r = this.rules;
      this.steps++;
      if (ctrl.left) this.angle -= TURN;
      if (ctrl.right) this.angle += TURN;
      this.angle = clamp(this.angle, -1.4, 1.4);
      this.thrusting = ctrl.thrust && this.fuel > 0;
      if (this.thrusting) {
        this.vx += Math.sin(this.angle) * THRUST;
        this.vy += Math.cos(this.angle) * THRUST;
        this.fuel--;
      }
      this.windNow = r.wind + (r.gusts ? Math.sin(this.steps / 35 + this.gustPhase) * 0.035 : 0);
      this.vx += this.windNow;
      this.vy -= r.gravity;
      this.vx *= 0.995;
      this.x += this.vx;
      this.y += this.vy;
      if (r.movingPad) {
        const nx = this.padX0 + Math.sin(this.steps / 70) * 110;
        this.padV = nx - this.padX;
        this.padX = nx;
      }
      if (this.y <= 0) {
        this.y = 0;
        this.done = true;
        const onPad = Math.abs(this.x - this.padX) < PAD_W / 2;
        const soft = this.vy > -1.3 && Math.abs(this.vx) < 0.9 && Math.abs(this.angle) < 0.3;
        this.result = onPad && soft ? "landed" : onPad ? "crashed" : "missed";
      } else if (this.x < -60 || this.x > W + 60 || this.y > H + 120 || this.steps >= MAX_STEPS) {
        this.done = true;
        this.result = "lost";
      }
    }
    // What the rocket feels — the brain's inputs.
    sense() {
      return [
        clamp((this.padX - this.x) / 250, -2, 2),
        this.y / 300,
        this.vx / 2,
        this.vy / 2,
        this.angle,
        this.padV * 2,
      ];
    }
    // Score for this attempt: closer, slower, straighter = better; a real landing is worth a lot.
    score() {
      const dx = Math.abs(this.x - this.padX);
      const speed = Math.hypot(this.vx, this.vy);
      let s = 60 * (1 - Math.min(1, dx / 300)) + 50 * (1 - Math.min(1, speed / 5)) + 20 * (1 - Math.min(1, Math.abs(this.angle)));
      if (this.result === "lost") s *= 0.5;
      if (this.result === "landed") s += 120 + 30 * (this.fuel / Math.max(1, this.fuelMax));
      return s;
    }
  }

  function makeStarts(seed, n, rules) {
    const rnd = seeded(seed);
    const out = [];
    for (let i = 0; i < n; i++)
      out.push({
        x: 120 + rnd() * 360,
        y: 300 + rnd() * 50,
        vx: (rnd() - 0.5) * 2,
        angle: (rnd() - 0.5) * 0.4,
        padX: rules.bumpyPad ? 120 + rnd() * 360 : W / 2,
        gust: rnd() * 6.28,
      });
    return out;
  }

  // ---------- brain: 6 inputs → 8 hidden (tanh) → 3 outputs (thrust, left, right) ----------
  const NI = 6, NH = 8, NO = 3;
  const NW = NI * NH + NH + NH * NO + NO;
  function randomGenome() {
    return Array.from({ length: NW }, () => (Math.random() * 2 - 1) * 1.2);
  }
  function think(g, x, out) {
    const h = think.h || (think.h = new Float64Array(NH));
    let k = 0;
    for (let j = 0; j < NH; j++) {
      let s = 0;
      for (let i = 0; i < NI; i++) s += x[i] * g[k++];
      s += g[k++];
      h[j] = Math.tanh(s);
    }
    for (let o = 0; o < NO; o++) {
      let s = 0;
      for (let j = 0; j < NH; j++) s += h[j] * g[k++];
      s += g[k++];
      out[o] = s;
    }
    out.hidden = h;
    return out;
  }
  function control(g, f) {
    const o = think(g, f.sense(), [0, 0, 0]);
    return { thrust: o[0] > 0, left: o[1] > 0.3 && o[1] > o[2], right: o[2] > 0.3 && o[2] > o[1], raw: o };
  }

  function gauss() {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

  // A population that improves one generation at a time.
  class Evolver {
    constructor(size = 60) {
      this.size = size;
      this.pop = Array.from({ length: size }, randomGenome);
      this.gen = 0;
      this.best = null;
      this.bestScore = -1;
      this.rules = defaultRules();
      this.tries = 4; // landings per brain per generation
      this.mutation = 0.25;
    }
    starts() {
      return makeStarts(1000 + this.gen * 7, this.tries, this.rules);
    }
    // Score one genome on this generation's landings. Returns {fit, landed}.
    evaluate(g, starts) {
      let fit = 0, landed = 0;
      for (const st of starts) {
        const f = new Flight(this.rules, st);
        while (!f.done) f.step(control(g, f));
        fit += f.score();
        if (f.result === "landed") landed++;
      }
      return { fit: fit / starts.length, landed: landed / starts.length };
    }
    // Takes scored population [{g, fit, landed}], breeds the next one.
    breed(scored) {
      scored.sort((a, b) => b.fit - a.fit);
      this.best = scored[0].g;
      this.bestScore = scored[0].fit;
      this.bestLanded = scored[0].landed;
      const elite = scored.slice(0, Math.max(4, Math.round(this.size * 0.12))).map((s) => s.g);
      const next = [elite[0].slice(), elite[1 % elite.length].slice()];
      while (next.length < this.size) {
        const a = elite[Math.floor(Math.random() * elite.length)];
        const b = elite[Math.floor(Math.random() * elite.length)];
        const child = a.map((w, i) => (Math.random() < 0.5 ? w : b[i]));
        const rate = this.mutation * (0.5 + Math.random());
        for (let i = 0; i < child.length; i++) if (Math.random() < 0.25) child[i] += gauss() * rate;
        next.push(child);
      }
      this.pop = next;
      this.gen++;
    }
    // Run one whole generation without drawing (used by Node tests and turbo).
    generation() {
      const st = this.starts();
      const scored = this.pop.map((g) => Object.assign({ g }, this.evaluate(g, st)));
      this.breed(scored);
      return { best: this.bestScore, landed: this.bestLanded, avg: scored.reduce((a, s) => a + s.fit, 0) / scored.length };
    }
  }

  const api = { W, H, PAD_W, NI, NH, NO, Flight, Evolver, defaultRules, makeStarts, control, think, randomGenome, seeded };
  root.RocketLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
