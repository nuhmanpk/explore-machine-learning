// Creature Learns to Walk — mass-spring creatures with rhythmic muscles, evolved by a
// genetic algorithm. No DOM, so it also runs in Node.
(function (root) {
  const DT_STEPS = 600; // steps per generation (~10 s at 60 fps)
  const GROUND = 0;

  // Body presets: nodes [x, y] (y up), bones = fixed springs, muscles = springs that pulse.
  const BODIES = {
    worm: {
      name: "Worm",
      nodes: [[0, 10], [25, 10], [50, 10], [75, 10], [100, 10], [12, 30], [37, 30], [62, 30], [87, 30]],
      bones: [[0, 5], [5, 1], [1, 6], [6, 2], [2, 7], [7, 3], [3, 8], [8, 4], [5, 6], [6, 7], [7, 8]],
      muscles: [[0, 1], [1, 2], [2, 3], [3, 4]],
    },
    biped: {
      name: "Two legs",
      nodes: [[0, 70], [40, 70], [20, 95], [-5, 35], [45, 35], [-10, 0], [50, 0]],
      bones: [[0, 1], [0, 2], [1, 2], [0, 3], [1, 4], [3, 5], [4, 6]],
      muscles: [[2, 3], [2, 4], [0, 5], [1, 6], [3, 4]],
    },
    box: {
      name: "Four legs",
      nodes: [[0, 50], [40, 50], [80, 50], [0, 80], [80, 80], [-10, 0], [25, 0], [55, 0], [90, 0]],
      bones: [[0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [1, 3], [1, 4], [0, 4]],
      muscles: [[0, 5], [3, 5], [1, 6], [0, 6], [1, 7], [2, 7], [2, 8], [4, 8]],
    },
  };

  function defaultRules() {
    return { gravity: 0.25, friction: 0.85, wind: 0, backpack: 1, hills: false };
  }
  function groundY(x, rules) {
    return rules.hills ? 18 * Math.sin(x / 90) + 10 * Math.sin(x / 37 + 1) + 14 : GROUND;
  }

  // Genome: one global tempo + (strength, timing) for every muscle.
  function randomGenome(body) {
    // Babies start with weak muscles (they mostly wobble), so the climb to real walking is visible.
    return { tempo: 0.03 + Math.random() * 0.07, m: BODIES[body].muscles.map(() => ({ amp: Math.random() * 0.08, phase: Math.random() * Math.PI * 2 })) };
  }
  function cloneGenome(g) {
    return { tempo: g.tempo, m: g.m.map((x) => ({ amp: x.amp, phase: x.phase })) };
  }

  class Creature {
    constructor(body, genome, rules) {
      const b = BODIES[body];
      this.body = body;
      this.genome = genome;
      this.rules = rules;
      const lift = rules.hills ? 40 : 0;
      this.p = b.nodes.map(([x, y]) => ({ x, y: y + lift, px: x, py: y + lift }));
      const len = (a, c) => Math.hypot(this.p[a].x - this.p[c].x, this.p[a].y - this.p[c].y);
      this.bones = b.bones.map(([a, c]) => ({ a, c, rest: len(a, c) }));
      this.muscles = b.muscles.map(([a, c]) => ({ a, c, rest: len(a, c), now: 1 }));
      // The backpack sits on the highest node and makes it heavy.
      let top = 0;
      this.p.forEach((q, i) => { if (q.y > this.p[top].y) top = i; });
      this.top = top;
      this.mass = this.p.map((_, i) => (i === top ? rules.backpack : 1));
      // "Body" nodes sit high at rest (not feet). Walking means keeping them off the ground and
      // staying the right way up, so we count every step where it flips over or drags its body.
      const minY = Math.min(...b.nodes.map((n) => n[1]));
      this.bodyIdx = b.nodes.map((n, i) => (n[1] > minY + 15 ? i : -1)).filter((i) => i >= 0);
      this.footIdx = b.nodes.map((n, i) => (n[1] <= minY + 15 ? i : -1)).filter((i) => i >= 0);
      const avgY = (idx) => idx.reduce((a, i) => a + b.nodes[i][1], 0) / idx.length;
      this.standH = avgY(this.bodyIdx) - avgY(this.footIdx); // how far the body sits above the feet when standing
      this.flipT = 0;
      this.dragT = 0;
      this.t = 0;
      this.startX = this.centerX();
    }
    centerX() {
      let s = 0;
      for (const q of this.p) s += q.x;
      return s / this.p.length;
    }
    distance() {
      return this.centerX() - this.startX;
    }
    step() {
      const r = this.rules;
      this.t++;
      // Verlet: keep moving + gravity + headwind.
      for (let i = 0; i < this.p.length; i++) {
        const q = this.p[i];
        const vx = (q.x - q.px) * 0.99, vy = (q.y - q.py) * 0.99;
        q.px = q.x; q.py = q.y;
        q.x += vx - r.wind;
        q.y += vy - r.gravity;
      }
      // Muscles pulse to their own beat.
      this.muscles.forEach((m, i) => {
        const g = this.genome.m[i];
        m.now = 1 + g.amp * Math.sin(this.t * this.genome.tempo * 2 * Math.PI * 0.6 + g.phase);
      });
      for (let it = 0; it < 6; it++) {
        for (const s of this.bones) this.solve(s, s.rest, 1);
        for (const m of this.muscles) this.solve(m, m.rest * m.now, 0.6);
        // Ground: push out and grip (friction slows sliding along the ground).
        for (const q of this.p) {
          const gy = groundY(q.x, r);
          if (q.y < gy) {
            q.y = gy;
            q.px = q.x - (q.x - q.px) * (1 - r.friction);
          }
        }
      }
      let lo = Infinity;
      for (const q of this.p) lo = Math.min(lo, q.y);
      const avg = (idx) => idx.reduce((a, i) => a + this.p[i].y, 0) / idx.length;
      // flipped, or lying on its side with the feet up near the body = not walking
      if (this.p[this.top].y - lo < 8 || avg(this.bodyIdx) - avg(this.footIdx) < this.standH * 0.5) this.flipT++;
      if (this.bodyIdx.some((i) => this.p[i].y - groundY(this.p[i].x, r) < 2)) this.dragT++;
    }
    // What evolution rewards: distance, but much less if it got there rolling, flipping or dragging.
    fitness() {
      const d = this.distance();
      if (d <= 0) return d;
      const flip = this.flipT / Math.max(1, this.t), drag = this.dragT / Math.max(1, this.t);
      return d * Math.max(0.05, 1 - 1.5 * flip - 0.6 * drag);
    }
    solve(s, rest, stiff) {
      const A = this.p[s.a], B = this.p[s.c];
      const dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = ((d - rest) / d) * 0.5 * stiff;
      const wa = this.mass[s.c] / (this.mass[s.a] + this.mass[s.c]);
      const wb = 1 - wa;
      A.x += dx * diff * 2 * wa; A.y += dy * diff * 2 * wa;
      B.x -= dx * diff * 2 * wb; B.y -= dy * diff * 2 * wb;
    }
  }

  function gauss() {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

  class Evolver {
    constructor(body = "box", size = 30) {
      this.body = body;
      this.size = size;
      this.rules = defaultRules();
      this.pop = Array.from({ length: size }, () => randomGenome(body));
      this.gen = 0;
      this.mutation = 0.05; // small steps: steady improvement instead of one lucky jump then a long plateau
      this.best = null;
      this.bestDist = 0;
    }
    spawn() {
      return this.pop.map((g) => new Creature(this.body, g, this.rules));
    }
    // creatures = finished Creature list in pop order.
    breed(creatures) {
      const scored = creatures.map((c) => ({ g: c.genome, d: c.distance(), f: c.fitness() })).sort((a, b) => b.f - a.f);
      // Stuck? Make the babies bolder until someone beats the champion again.
      if (this.bestFit !== undefined && scored[0].f <= this.bestFit + 1) this.stuck = (this.stuck || 0) + 1;
      else this.stuck = 0;
      this.bestFit = scored[0].f;
      this.best = scored[0].g;
      this.bestDist = scored[0].d;
      this.avgDist = scored.reduce((a, s) => a + s.d, 0) / scored.length;
      const elite = scored.slice(0, Math.max(3, Math.round(this.size * 0.2))).map((s) => s.g);
      const next = [cloneGenome(elite[0])];
      const boost = 1 + Math.min(6, (this.stuck || 0) * 0.8);
      while (next.length < this.size) {
        // spread: the first babies get tiny tweaks, later ones bigger ideas
        const spread = 0.4 + (2.2 * next.length) / this.size;
        const a = elite[Math.floor(Math.random() * elite.length)];
        const b = elite[Math.floor(Math.random() * elite.length)];
        const c = cloneGenome(a);
        c.tempo = Math.random() < 0.5 ? a.tempo : b.tempo;
        c.m.forEach((m, i) => { if (Math.random() < 0.5) { m.amp = b.m[i].amp; m.phase = b.m[i].phase; } });
        const r = this.mutation * spread * boost;
        if (Math.random() < 0.3) c.tempo = Math.max(0.01, Math.min(0.15, c.tempo + gauss() * 0.01 * r * 5));
        for (const m of c.m) {
          if (Math.random() < 0.35) m.amp = Math.max(0, Math.min(0.6, m.amp + gauss() * r * 0.5));
          if (Math.random() < 0.35) m.phase += gauss() * r * 3;
        }
        next.push(c);
      }
      this.pop = next;
      this.gen++;
    }
    generation() {
      const cs = this.spawn();
      for (let t = 0; t < DT_STEPS; t++) for (const c of cs) c.step();
      this.breed(cs);
      return { best: this.bestDist, avg: this.avgDist };
    }
  }

  // Challenge settings, tuned in Node so each one clearly knocks a trained walker back.
  const CHALLENGES = {
    hills: { label: "Hills", on: (r) => (r.hills = true), off: (r) => (r.hills = false) },
    ice: { label: "Ice", on: (r) => (r.friction = 0.05), off: (r) => (r.friction = 0.85) },
    wind: { label: "Headwind", on: (r) => (r.wind = 0.05), off: (r) => (r.wind = 0) },
    backpack: { label: "Backpack", on: (r) => (r.backpack = 4), off: (r) => (r.backpack = 1) },
    moon: { label: "Low gravity", on: (r) => (r.gravity = 0.08), off: (r) => (r.gravity = 0.25) },
  };

  const api = { CHALLENGES, DT_STEPS, BODIES, defaultRules, groundY, randomGenome, cloneGenome, Creature, Evolver };
  root.WalkerLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
