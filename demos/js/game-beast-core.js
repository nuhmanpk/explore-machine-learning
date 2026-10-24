// Build-a-Beast — creatures made of joints, bones and muscles, with a tiny neural
// network per creature that squeezes the muscles. Verlet physics; no DOM, so it
// also runs in Node. Coordinates: x right, y UP, ground at y = groundY(x). 50 px = 1 m.
(function (root) {
  const PX_PER_M = 50;
  const N_CONTACT = 8; // how many joints report "touching the ground"
  const N_IN = 2 + 3 + N_CONTACT + 2; // tilt(2) + height, vx, vy + contacts + clock(2)
  const HIDDEN = 10;
  const STEPS = 600; // one try = 10 s at 60 steps a second
  const ITER = 6;

  // ---------- starter creatures (px, y up, feet at 0) ----------
  const TEMPLATES = {
    spider: {
      joints: [[-30, 62], [30, 62], [-62, 46], [-75, 0], [-22, 40], [-26, 0], [22, 40], [26, 0], [62, 46], [75, 0]],
      bones: [[0, 1], [0, 2], [2, 3], [0, 4], [4, 5], [1, 6], [6, 7], [1, 8], [8, 9], [0, 6], [1, 4]],
      muscles: [[0, 3], [0, 5], [1, 7], [1, 9], [4, 6]],
    },
    frog: {
      joints: [[-40, 40], [20, 60], [50, 45], [-70, 35], [-80, 0], [-35, 0], [45, 0], [0, 40]],
      bones: [[0, 1], [1, 2], [0, 7], [7, 1], [7, 2], [0, 3], [3, 4], [7, 5], [2, 6]],
      muscles: [[0, 4], [1, 3], [7, 4], [1, 6], [1, 5]],
    },
    snake: {
      joints: [[-100, 12], [-50, 12], [0, 12], [50, 12], [100, 12], [-50, 0], [50, 0], [-50, 45], [50, 45]],
      bones: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [3, 6], [1, 7], [3, 8]],
      muscles: [[0, 2], [2, 4], [1, 3], [7, 2], [8, 2], [0, 7], [4, 8]],
    },
    wheel: {
      joints: (() => {
        const j = [[0, 45]];
        for (let i = 0; i < 6; i++) j.push([Math.cos((i * Math.PI) / 3) * 42, 45 + Math.sin((i * Math.PI) / 3) * 42]);
        return j;
      })(),
      bones: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1]],
      muscles: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]],
    },
    chair: {
      joints: [[-30, 50], [30, 50], [-30, 105], [-30, 0], [30, 0]],
      bones: [[0, 1], [0, 2], [0, 3], [1, 4]],
      muscles: [[1, 3], [0, 4], [2, 1], [2, 3]],
    },
  };

  // ---------- terrain + rules ----------
  function makeRules(goal = "run", ch = {}) {
    return {
      goal,
      hills: !!ch.hills,
      ice: !!ch.ice,
      moon: !!ch.moon,
      wind: !!ch.wind,
      limp: !!ch.limp,
      gravity: ch.moon ? 0.05 : 0.14,
      friction: ch.ice ? 0.06 : 0.85,
      windForce: ch.wind ? -0.035 : 0,
      wallX: 230, // jump goal: a wall this far right of the start
      wallH: 75,
      limpIdx: ch.limpIdx || 0, // which muscle goes limp
    };
  }
  // Ground height at x (px).
  function groundY(x, rules) {
    let g = 0;
    if (rules.goal === "stairs" && x > 120) g = Math.floor((x - 120) / 70) * 16 + 16;
    if (rules.hills) g += 22 * Math.sin(x / 90) + 12 * Math.sin(x / 37 + 1) + 34;
    return g;
  }

  // ---------- one creature in the world ----------
  class Body {
    constructor(spec, rules, brain) {
      this.spec = spec;
      this.rules = rules;
      this.brain = brain;
      const minY = Math.min(...spec.joints.map((j) => j[1]));
      const cx = spec.joints.reduce((s, j) => s + j[0], 0) / spec.joints.length;
      this.x = spec.joints.map((j) => j[0] - cx);
      this.y = spec.joints.map((j) => j[1] - minY + 2 + groundY(j[0] - cx, rules));
      this.px = this.x.slice();
      this.py = this.y.slice();
      const len = (a, b) => Math.hypot(this.x[a] - this.x[b], this.y[a] - this.y[b]);
      this.boneLen = spec.bones.map(([a, b]) => len(a, b));
      this.muscleLen = spec.muscles.map(([a, b]) => len(a, b));
      this.squeeze = new Float64Array(spec.muscles.length); // −1 stretch … +1 squeeze
      this.contact = new Uint8Array(spec.joints.length);
      this.t = 0;
      this.startX = this.centerX();
      this.maxX = 0;
      this.maxH = 0;
      // Which joints are "the body line" for tilt: the two furthest apart at the start.
      let best = [0, 1], bd = -1;
      for (let a = 0; a < this.x.length; a++)
        for (let b = a + 1; b < this.x.length; b++) {
          const d = Math.abs(this.x[a] - this.x[b]);
          if (d > bd) { bd = d; best = this.x[a] < this.x[b] ? [a, b] : [b, a]; }
        }
      this.axis = best;
      this.inputs = new Float64Array(N_IN);
    }
    centerX() { return this.x.reduce((s, v) => s + v, 0) / this.x.length; }
    centerY() { return this.y.reduce((s, v) => s + v, 0) / this.y.length; }
    sense() {
      const [a, b] = this.axis;
      const ang = Math.atan2(this.y[b] - this.y[a], this.x[b] - this.x[a]);
      const n = this.x.length;
      let vx = 0, vy = 0;
      for (let i = 0; i < n; i++) { vx += this.x[i] - this.px[i]; vy += this.y[i] - this.py[i]; }
      const cx = this.centerX();
      const inp = this.inputs;
      inp[0] = Math.sin(ang);
      inp[1] = Math.cos(ang);
      inp[2] = Math.tanh((this.centerY() - groundY(cx, this.rules)) / 60 - 1);
      inp[3] = Math.tanh(vx / n / 2);
      inp[4] = Math.tanh(vy / n / 2);
      for (let i = 0; i < N_CONTACT; i++) inp[5 + i] = i < n ? this.contact[i] : 0;
      const ph = (this.t / 60) * Math.PI * 2 * 1.4;
      inp[5 + N_CONTACT] = Math.sin(ph);
      inp[6 + N_CONTACT] = Math.cos(ph);
      return inp;
    }
    think() {
      const out = this.brain.forward(this.sense());
      for (let m = 0; m < this.squeeze.length; m++) this.squeeze[m] = this.rules.limp && m === this.rules.limpIdx ? 0 : out[m];
    }
    step() {
      const R = this.rules, n = this.x.length;
      if (this.t % 2 === 0) this.think();
      this.t++;
      // move (Verlet)
      for (let i = 0; i < n; i++) {
        const vx = (this.x[i] - this.px[i]) * 0.995, vy = (this.y[i] - this.py[i]) * 0.995;
        this.px[i] = this.x[i];
        this.py[i] = this.y[i];
        this.x[i] += vx + R.windForce;
        this.y[i] += vy - R.gravity;
      }
      // constraints: muscles (soft), bones (rigid), ground, wall
      for (let it = 0; it < ITER; it++) {
        this.spec.muscles.forEach(([a, b], m) => {
          if (R.limp && m === R.limpIdx) return;
          const rest = this.muscleLen[m] * (1 - 0.32 * this.squeeze[m]);
          this.pull(a, b, rest, 0.12);
        });
        this.spec.bones.forEach(([a, b], k) => this.pull(a, b, this.boneLen[k], 1));
        this.collide();
      }
      const cx = this.centerX() - this.startX;
      if (cx > this.maxX) this.maxX = cx;
      const h = this.centerY() - groundY(this.centerX(), R);
      if (h > this.maxH) this.maxH = h;
    }
    pull(a, b, rest, k) {
      const dx = this.x[b] - this.x[a], dy = this.y[b] - this.y[a];
      const d = Math.hypot(dx, dy) || 1e-6;
      const f = ((d - rest) / d) * 0.5 * k;
      this.x[a] += dx * f; this.y[a] += dy * f;
      this.x[b] -= dx * f; this.y[b] -= dy * f;
    }
    collide() {
      const R = this.rules;
      for (let i = 0; i < this.x.length; i++) {
        // wall (jump goal): a solid block joints can't enter
        if (R.goal === "jump") {
          const wx = this.startX + R.wallX;
          if (this.x[i] > wx - 8 && this.x[i] < wx + 8 && this.y[i] < R.wallH + groundY(wx, R)) {
            if (this.px[i] <= wx - 8) this.x[i] = wx - 8;
            else if (this.px[i] >= wx + 8) this.x[i] = wx + 8;
            else this.y[i] = R.wallH + groundY(wx, R);
          }
        }
        const g = groundY(this.x[i], R);
        if (this.y[i] < g) {
          const gPrev = groundY(this.px[i], R);
          if (g - gPrev > 4 && this.py[i] < g) {
            // ran into the front of a step: blocked sideways
            this.x[i] = this.px[i];
            if (this.y[i] < gPrev) this.y[i] = gPrev;
          } else {
            this.y[i] = g;
            // friction: slide less on rough ground
            this.px[i] = this.x[i] - (this.x[i] - this.px[i]) * (1 - R.friction);
          }
          this.contact[i] = 1;
        } else this.contact[i] = this.y[i] - g < 1.5 ? 1 : 0;
      }
    }
    // Score for the evolution: depends on the goal.
    fitness() {
      const R = this.rules;
      const dist = this.centerX() - this.startX;
      if (R.goal === "jump") return Math.max(0, dist) + 1.5 * this.maxH + (dist > R.wallX + 20 ? 200 : 0);
      if (R.goal === "stairs") return Math.max(0, dist) + 2 * Math.max(0, groundY(this.centerX(), R) - 16);
      return dist;
    }
    meters() { return (this.centerX() - this.startX) / PX_PER_M; }
  }

  // ---------- creature checks ----------
  function validate(spec) {
    const n = spec.joints.length;
    if (n < 3) return "Add at least 3 joints.";
    if (n > 14) return "Too many joints (max 14).";
    if (!spec.bones.length) return "Connect joints with bones.";
    if (!spec.muscles.length) return "Add at least one muscle, or it can't move!";
    if (spec.muscles.length > 14) return "Too many muscles (max 14).";
    const adj = Array.from({ length: n }, () => []);
    [...spec.bones, ...spec.muscles].forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
    const seen = new Set([0]), q = [0];
    while (q.length) for (const v of adj[q.pop()]) if (!seen.has(v)) { seen.add(v); q.push(v); }
    if (seen.size < n) return "Some joints are floating alone. Connect every joint.";
    return null;
  }

  // ---------- population ----------
  class Evolution {
    constructor(spec, rules, size = 40) {
      this.spec = spec;
      this.rules = rules;
      this.size = size;
      this.gen = 0;
      this.brains = Array.from({ length: size }, () => new root.GameNet.Net([N_IN, HIDDEN, spec.muscles.length]));
      this.history = []; // {best, avg}
      this.bestBrain = this.brains[0];
      this.newRace();
    }
    newRace() {
      this.bodies = this.brains.map((b) => new Body(this.spec, this.rules, b));
      this.t = 0;
    }
    stepRace() {
      for (const b of this.bodies) b.step();
      this.t++;
      return this.t >= STEPS;
    }
    leader() {
      let best = this.bodies[0];
      for (const b of this.bodies) if (b.centerX() - b.startX > best.centerX() - best.startX) best = b;
      return best;
    }
    // Finish the race: score everyone, breed the next generation.
    endRace() {
      const fit = this.bodies.map((b) => b.fitness());
      const dist = this.bodies.map((b) => b.meters());
      const bi = fit.indexOf(Math.max(...fit));
      this.bestBrain = this.brains[bi].clone();
      const sorted = dist.slice().sort((a, b) => b - a);
      this.history.push({ best: dist[bi], top: sorted[0], avg: dist.reduce((s, v) => s + v, 0) / dist.length, fit: fit[bi], height: this.bodies[bi].maxH / PX_PER_M });
      this.brains = root.GameNet.nextGeneration(this.brains, fit, { mutation: 0.25 });
      this.gen++;
      this.newRace();
      return this.history[this.history.length - 1];
    }
    runGeneration() {
      while (!this.stepRace());
      return this.endRace();
    }
    setRules(rules) {
      this.rules = rules;
      this.newRace();
    }
  }

  // The muscle the champion uses most (so "lose a muscle" really hurts).
  function busiestMuscle(spec, rules, brain) {
    const b = new Body(spec, rules, brain);
    const sum = new Float64Array(spec.muscles.length);
    for (let i = 0; i < 300; i++) { b.step(); for (let m = 0; m < sum.length; m++) sum[m] += Math.abs(b.squeeze[m]); }
    return sum.indexOf(Math.max(...sum));
  }

  // Replay one brain alone (checkpoints, X-ray).
  function trial(spec, rules, brain, steps = STEPS) {
    const b = new Body(spec, rules, brain);
    for (let i = 0; i < steps; i++) b.step();
    return b;
  }

  const api = { PX_PER_M, N_IN, N_CONTACT, HIDDEN, STEPS, TEMPLATES, makeRules, groundY, Body, validate, Evolution, trial, busiestMuscle };
  root.BeastCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
