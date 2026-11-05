// Fish School vs Shark — the tank, the fish, the shark(s) and one generation of evolution.
// Fish brains are small neural nets (GameNet.Net). Each fish has six cone-shaped eyes all around it.
// Every eye reports how close the nearest plankton, shark, wall and other fish is in its direction.
// The shark is not a learner: it chases the nearest fish, but a crowd of fish confuses it.
// No DOM, seeded RNG, so it also runs in Node (needs game-net.js).
(function (root) {
  const GN = root.GameNet || (typeof require !== "undefined" ? require("./game-net.js") : null);

  const W = 640, H = 420;
  const STEPS = 1200;            // one generation = 20 s at 1x
  const POP = 40;
  const PLANKTON = 26;
  const CLOUDS = 3, CLOUD_SPREAD = 38;
  const EYES = [0, 55, -55, 115, -115, 180].map((d) => (d * Math.PI) / 180); // all round the fish
  const EYE_HALF = (32 * Math.PI) / 180;                                      // each eye sees a 64° wedge
  const EYE_NAMES = ["front", "front-right", "front-left", "back-right", "back-left", "behind"]; // + angles are to the fish's right (screen y points down)
  const CHANNELS = ["plankton", "shark", "wall", "fish"];
  const RANGE = 130, MURKY_RANGE = 45;
  const FISH_R = 6, SHARK_R = 13, CATCH = 15, EAT = 9;
  const FISH_TURN = 0.14, SHARK_TURN = 0.05;
  const FISH_VMIN = 0.35, FISH_VMAX = 2.1;
  const SHARK_V = 1.6, SHARK_FAST = 2.25, SHARK_TURN_FAST = 0.07;
  const FULL_STEPS = 20;         // after a catch the shark is slow for a moment (it's munching)
  // 6 eyes × 4 channels + energy = 25 senses → 8 thinking neurons → 2 controls (turn, speed)
  const SIZES = [EYES.length * CHANNELS.length + 1, 8, 2];
  const INPUT_NAMES = [];
  for (let e = 0; e < EYES.length; e++) for (const c of CHANNELS) INPUT_NAMES.push(`${c} (${EYE_NAMES[e]})`);
  INPUT_NAMES.push("energy");

  const TUNE = { drain0: 0.0009, drain1: 0.0008, food: 0.02, confuse: 0.3 };
  const CROWD_R = 30;
  // fast = a quicker shark; two = a second shark; murky = cloudy water, eyes see less far
  const DEFAULT_RULES = { fast: false, two: false, murky: false };

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
  function gaussR(rnd) {
    let u = 0;
    while (u === 0) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  }

  function newBrain(rnd = Math.random) {
    const n = new GN.Net(SIZES, new Float64Array(geneCount()));
    const first = (SIZES[0] + 1) * SIZES[1];
    for (let i = 0; i < n.genes.length; i++) n.genes[i] = gaussR(rnd) * (i < first ? 0.5 : 0.35);
    return n;
  }
  function geneCount() { let n = 0; for (let i = 0; i < SIZES.length - 1; i++) n += (SIZES[i] + 1) * SIZES[i + 1]; return n; }

  // Next generation (seeded): best few copied unchanged, the rest are mutated children of the top quarter.
  function evolve(brains, fitness, rnd = Math.random, mutation = 0.3) {
    const n = brains.length;
    const elite = Math.max(2, Math.round(n * 0.1));
    const order = brains.map((_, i) => i).sort((a, b) => fitness[b] - fitness[a]);
    const top = order.slice(0, Math.max(elite, Math.round(n * 0.25)));
    const pick = () => brains[top[Math.floor(Math.pow(rnd(), 1.5) * top.length)]];
    const out = order.slice(0, elite).map((i) => { const c = brains[i].clone(); c.family = brains[i].family; return c; });
    while (out.length < n) {
      const a = pick();
      let child;
      if (rnd() < 0.3) {
        const b = pick();
        child = a.clone();
        for (let i = 0; i < child.genes.length; i++) if (rnd() < 0.5) child.genes[i] = b.genes[i];
      } else child = a.clone();
      child.family = a.family;
      const amt = mutation * (0.25 + 1.75 * rnd());
      for (let i = 0; i < child.genes.length; i++) if (rnd() < 0.25) child.genes[i] += gaussR(rnd) * amt;
      out.push(child);
    }
    return out;
  }

  class Fish {
    constructor(brain, x, y, th) {
      this.brain = brain;
      this.x = x; this.y = y; this.th = th; this.v = 1;
      this.turn = 0; this.thrust = 0.4;
      this.energy = 1; this.eaten = 0; this.alive = true; this.why = ""; this.t = 0;
      this.input = null; this.hits = null; this.near = 0; this.nearSum = 0; this.wag = Math.random() * 6;
    }
  }
  class Shark {
    constructor(x, y, th) {
      this.x = x; this.y = y; this.th = th; this.v = SHARK_V;
      this.target = null; this.lock = 0; this.full = 0; this.miss = 0; this.misses = 0; this.confused = 0; this.caught = 0; this.wag = 0;
    }
  }

  class World {
    // brains: one per fish. opts: { human: "fish" | "shark", steps }
    constructor(brains, rules = DEFAULT_RULES, seed = 1, opts = {}) {
      this.rules = Object.assign({}, DEFAULT_RULES, rules);
      const rnd = (this.rnd = seeded(seed));
      this.steps = 0; this.maxSteps = opts.steps || STEPS; this.done = false;
      this.range = this.rules.murky ? MURKY_RANGE : RANGE;
      this.sharkV = this.rules.fast ? SHARK_FAST : SHARK_V;
      this.sharkTurn = this.rules.fast ? SHARK_TURN_FAST : SHARK_TURN;
      this.events = []; // { type: "catch" | "eat" | "starve", x, y, step }
      this.fish = brains.map((b) => {
        // fish start in the middle part of the tank, sharks start at the edges
        const x = 140 + rnd() * (W - 280), y = 90 + rnd() * (H - 180);
        const f = new Fish(b, x, y, rnd() * 6.283);
        f.wag = rnd() * 6;
        return f;
      });
      if (opts.human === "fish") { this.fish[0].human = true; this.fish[0].brain = null; }
      const nS = this.rules.two ? 2 : 1;
      this.sharks = [];
      for (let k = 0; k < nS; k++) {
        const corner = k === 0 ? [40, 40, 0.6] : [W - 40, H - 40, 0.6 + Math.PI];
        this.sharks.push(new Shark(corner[0], corner[1], corner[2]));
      }
      if (opts.human === "shark") this.sharks[0].human = true;
      // plankton grows in a few slowly drifting clouds
      this.clouds = [];
      for (let k = 0; k < CLOUDS; k++) this.clouds.push({ x: 120 + rnd() * (W - 240), y: 90 + rnd() * (H - 180), vx: (rnd() - 0.5) * 0.5, vy: (rnd() - 0.5) * 0.5 });
      this.plankton = [];
      for (let i = 0; i < PLANKTON; i++) this.plankton.push(this.newPlankton());
    }
    newPlankton() {
      const r = this.rnd, c = this.clouds[Math.floor(r() * this.clouds.length)];
      const x = clamp(c.x + gaussR(r) * CLOUD_SPREAD, 12, W - 12), y = clamp(c.y + gaussR(r) * CLOUD_SPREAD, 12, H - 12);
      return { x, y, vx: c.vx, vy: c.vy, ph: r() * 6.28 };
    }
    // distance from (x, y) along angle a to the tank wall
    wallDist(x, y, a) {
      const dx = Math.cos(a), dy = Math.sin(a);
      let d = Infinity;
      if (dx > 1e-6) d = Math.min(d, (W - x) / dx); else if (dx < -1e-6) d = Math.min(d, -x / dx);
      if (dy > 1e-6) d = Math.min(d, (H - y) / dy); else if (dy < -1e-6) d = Math.min(d, -y / dy);
      return Math.max(0, d);
    }
    // 25 numbers: for each eye and each kind of thing, 0 = nothing seen, 1 = right up close
    sense(f) {
      const R = this.range, nE = EYES.length, out = new Array(SIZES[0]).fill(0);
      const hits = f.hits || (f.hits = Array.from({ length: nE * 4 }, () => ({ d: 0, x: 0, y: 0 })));
      for (const h of hits) h.d = 0;
      const co = Math.cos(f.th), si = Math.sin(f.th);
      const see = (ox, oy, ch, rad) => {
        const dx = ox - f.x, dy = oy - f.y;
        if (Math.abs(dx) > R + rad || Math.abs(dy) > R + rad) return;
        const d = Math.hypot(dx, dy) - rad;
        if (d > R) return;
        const a = Math.atan2(-dx * si + dy * co, dx * co + dy * si); // angle relative to heading
        let best = -1, bd = 9;
        for (let e = 0; e < nE; e++) { const da = Math.abs(wrap(a - EYES[e])); if (da < bd) { bd = da; best = e; } }
        if (bd > EYE_HALF + 0.02) return;
        const v = 1 - Math.max(0, d) / R, k = best * 4 + ch;
        if (v > out[k]) { out[k] = v; hits[k].d = v; hits[k].x = ox; hits[k].y = oy; }
      };
      for (const p of this.plankton) see(p.x, p.y, 0, 2);
      for (const s of this.sharks) see(s.x, s.y, 1, SHARK_R);
      let near = 0;
      for (const o of this.fish) {
        if (o === f || !o.alive) continue;
        see(o.x, o.y, 3, FISH_R);
        if (Math.abs(o.x - f.x) < 40 && Math.abs(o.y - f.y) < 40 && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < 1600) near++;
      }
      f.near = near;
      // walls: a real ray straight out of each eye
      for (let e = 0; e < nE; e++) {
        const a = f.th + EYES[e], d = this.wallDist(f.x, f.y, a);
        if (d < R) { const v = 1 - d / R, k = e * 4 + 2; out[k] = v; hits[k].d = v; hits[k].x = f.x + Math.cos(a) * d; hits[k].y = f.y + Math.sin(a) * d; }
      }
      out[nE * 4] = f.energy * 2 - 1;
      f.input = out;
      return out;
    }
    // steer an entity toward a wished-for direction (human control)
    steerTo(e, ctrl, turnRate) {
      if (!ctrl || !ctrl.on) return 0;
      const want = Math.atan2(ctrl.dy, ctrl.dx);
      return clamp(wrap(want - e.th) / turnRate, -1, 1);
    }
    pickTarget(s) {
      let best = null, bd = Infinity;
      for (const f of this.fish) {
        if (!f.alive) continue;
        const dx = f.x - s.x, dy = f.y - s.y;
        const a = Math.abs(wrap(Math.atan2(dy, dx) - s.th));
        const d = Math.hypot(dx, dy) * (a > 1.9 ? 1.8 : 1); // fish behind the shark count as further away
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    }
    step(ctrl) {
      if (this.done) return;
      const rnd = this.rnd;
      this.steps++;
      // clouds drift and bounce off the glass; plankton drifts and wobbles
      for (const c of this.clouds) {
        c.x += c.vx; c.y += c.vy;
        if (c.x < 90 || c.x > W - 90) c.vx *= -1;
        if (c.y < 70 || c.y > H - 70) c.vy *= -1;
      }
      for (const p of this.plankton) {
        p.x += p.vx + Math.sin(this.steps * 0.02 + p.ph) * 0.15; p.y += p.vy;
        if (p.x < 10 || p.x > W - 10) p.vx *= -1;
        if (p.y < 10 || p.y > H - 10) p.vy *= -1;
        p.x = clamp(p.x, 10, W - 10); p.y = clamp(p.y, 10, H - 10);
      }
      let alive = 0;
      for (const f of this.fish) {
        if (!f.alive) continue;
        alive++;
        f.t++;
        if (f.human) {
          f.turn = this.steerTo(f, ctrl, FISH_TURN);
          f.thrust = ctrl && ctrl.on ? 1 : 0.15;
        } else {
          const o = f.brain.forward(this.sense(f));
          f.turn = o[0]; f.thrust = (o[1] + 1) / 2;
        }
        f.th = wrap(f.th + f.turn * FISH_TURN);
        const target = FISH_VMIN + f.thrust * (FISH_VMAX - FISH_VMIN);
        f.v += (target - f.v) * 0.25;
        f.x += Math.cos(f.th) * f.v; f.y += Math.sin(f.th) * f.v;
        if (f.x < FISH_R || f.x > W - FISH_R || f.y < FISH_R || f.y > H - FISH_R) {
          f.x = clamp(f.x, FISH_R, W - FISH_R); f.y = clamp(f.y, FISH_R, H - FISH_R); f.v *= 0.5;
        }
        f.wag += 0.15 + f.v * 0.18;
        // swimming fast uses energy; plankton refills it
        f.energy -= TUNE.drain0 + TUNE.drain1 * f.thrust * f.thrust;
        for (let i = 0; i < this.plankton.length; i++) {
          const p = this.plankton[i];
          if (Math.abs(p.x - f.x) < EAT && Math.abs(p.y - f.y) < EAT && (p.x - f.x) ** 2 + (p.y - f.y) ** 2 < EAT * EAT) {
            f.energy = Math.min(1, f.energy + 0.3); f.eaten++;
            this.events.push({ type: "eat", x: p.x, y: p.y, step: this.steps, fish: f });
            this.plankton[i] = this.newPlankton();
          }
        }
        if (f.human) this.sense(f); // so the "inside" card can show the kid's eyes too
        else if (f.t % 4 === 0) f.nearSum += f.near;
        if (f.energy <= 0) { f.alive = false; f.why = "hungry"; this.events.push({ type: "starve", x: f.x, y: f.y, step: this.steps, fish: f }); }
      }
      // sharks
      for (const s of this.sharks) {
        s.wag += 0.12;
        if (s.full > 0) s.full--;
        if (s.confused > 0) s.confused--;
        let turn = 0;
        if (s.human) {
          turn = this.steerTo(s, ctrl, this.sharkTurn * 1.6);
          s.v += ((ctrl && ctrl.on ? this.sharkV : 0.6) * (s.full ? 0.55 : 1) - s.v) * 0.1;
          s.th = wrap(s.th + turn * this.sharkTurn * 1.6);
        } else {
          if (!s.target || !s.target.alive || --s.lock <= 0) { s.target = this.pickTarget(s); s.lock = 40; }
          const t = s.target;
          if (t) {
            // a crowd around the target confuses the shark: it may switch to another fish and hesitates
            let crowd = 0, alt = null;
            for (const o of this.fish) {
              if (o === t || !o.alive) continue;
              if (Math.abs(o.x - t.x) < 34 && Math.abs(o.y - t.y) < 34 && (o.x - t.x) ** 2 + (o.y - t.y) ** 2 < 34 * 34) { crowd++; if (!alt || rnd() < 0.5) alt = o; }
            }
            if (crowd >= 2 && rnd() < 0.035 * crowd) { s.target = alt; s.lock = 40; s.confused = 18; }
            const want = Math.atan2(t.y - s.y, t.x - s.x);
            turn = clamp(wrap(want - s.th) / this.sharkTurn, -1, 1);
          }
          s.th = wrap(s.th + turn * this.sharkTurn);
          const v = this.sharkV * (s.full ? 0.5 : 1) * (s.confused ? 0.75 : 1);
          s.v += (v - s.v) * 0.1;
        }
        s.x += Math.cos(s.th) * s.v; s.y += Math.sin(s.th) * s.v;
        if (s.x < SHARK_R || s.x > W - SHARK_R || s.y < SHARK_R || s.y > H - SHARK_R) {
          s.x = clamp(s.x, SHARK_R, W - SHARK_R); s.y = clamp(s.y, SHARK_R, H - SHARK_R);
          if (!s.human) s.th = wrap(s.th + 0.08); // slide along the glass
        }
        if (s.full) continue;
        // the mouth is at the front of the shark
        const mx = s.x + Math.cos(s.th) * 8, my = s.y + Math.sin(s.th) * 8;
        if (s.miss > 0) { s.miss--; continue; }
        for (const f of this.fish) {
          if (!f.alive) continue;
          if (Math.abs(f.x - mx) < CATCH && Math.abs(f.y - my) < CATCH && (f.x - mx) ** 2 + (f.y - my) ** 2 < CATCH * CATCH) {
            // confusion: with friends close by, the bite can miss (the shark can't pick one fish out of the crowd)
            let crowd = 0;
            for (const o of this.fish) if (o !== f && o.alive && (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < CROWD_R * CROWD_R) crowd++;
            if (crowd && rnd() > 1 / (1 + TUNE.confuse * crowd)) {
              s.miss = 14; s.confused = 24; s.target = null; s.lock = 0; s.misses = (s.misses || 0) + 1;
              this.events.push({ type: "miss", x: f.x, y: f.y, step: this.steps, fish: f, shark: s, crowd });
              break;
            }
            f.alive = false; f.why = "shark"; s.caught++; s.full = FULL_STEPS; s.target = null;
            this.events.push({ type: "catch", x: f.x, y: f.y, step: this.steps, fish: f, shark: s });
            break;
          }
        }
      }
      if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
      if (!alive || this.steps >= this.maxSteps) this.done = true;
    }
    // what evolution rewards: time alive, plus a little for each plankton snack
    fitness(f) {
      return f.t / this.maxSteps + TUNE.food * f.eaten + (f.alive ? 0.5 : 0);
    }
    // the fish the camera points out: alive, then most snacks, then longest alive
    leader() {
      let best = null, bs = -Infinity;
      for (const f of this.fish) { if (f.human) continue; const s = (f.alive ? 1000 : 0) + f.eaten * 10 + f.t / 200; if (s > bs) { bs = s; best = f; } }
      return best;
    }
    stats() {
      const fs = this.fish.filter((f) => !f.human), n = fs.length || 1;
      const survival = fs.reduce((a, f) => a + f.t, 0) / n / this.maxSteps;
      const food = fs.reduce((a, f) => a + f.eaten, 0) / n;
      const aliveEnd = fs.filter((f) => f.alive).length / n;
      const caught = fs.filter((f) => f.why === "shark").length / n;
      const starved = fs.filter((f) => f.why === "hungry").length / n;
      const buddies = fs.reduce((a, f) => a + f.nearSum / Math.max(1, f.t / 4), 0) / n;
      const fishSteps = fs.reduce((a, f) => a + f.t, 0) || 1;
      const hazard = (fs.filter((f) => f.why === "shark").length / fishSteps) * 1000; // catches per 1000 fish-steps
      return { survival, food, aliveEnd, caught, starved, buddies, hazard };
    }
  }

  // Run one whole generation without drawing. Returns { fitness, stats, world }.
  function runGeneration(brains, rules, seed) {
    const w = new World(brains, rules, seed);
    while (!w.done) w.step();
    return { fitness: w.fish.map((f) => w.fitness(f)), stats: w.stats(), world: w };
  }

  // Has the school adapted to a challenge? series = average time alive (%) per generation,
  // start = index of the first generation played with the challenge, before = level just before it (or null).
  // "Adapted" must be a lasting gain, not one lucky generation: the mean of the
  // last 5 generations has to beat the mean of the first 3 after the switch by a
  // clear margin, and each of the last 3 must sit above that early mean.
  function adaptStatus(series, start, before) {
    const rounds = series.length - start;
    const avg = (a) => a.reduce((x, v) => x + v, 0) / (a.length || 1);
    if (rounds < 1) return { rounds, now: null, low: null, done: false, hurt: false, trying: false };
    const after = series.slice(start);
    const now = avg(after.slice(-3));
    const early = avg(after.slice(0, 3));
    let low = Infinity;
    for (let e = 1; e <= after.length; e++) low = Math.min(low, avg(after.slice(Math.max(0, e - 3), e)));
    const hurt = before != null && early < before * 0.93;
    const coped = rounds >= 6 && before != null && !hurt && avg(after) >= before * 0.95 && low >= before * 0.88;
    const late = avg(after.slice(-5));
    const recovered = rounds >= 8 && late >= early + Math.max(9, early * 0.2) && after.slice(-3).every(v => v > early + 3);
    return { rounds, now, low, early, hurt, coped, recovered, trying: rounds >= 15 && !coped && !recovered, done: coped || recovered };
  }

  const api = { W, H, STEPS, POP, PLANKTON, CLOUDS, EYES, EYE_HALF, EYE_NAMES, CHANNELS, RANGE, MURKY_RANGE, FISH_R, SHARK_R, SIZES, INPUT_NAMES,
    DEFAULT_RULES, TUNE, SHARK_V, SHARK_FAST, FISH_VMAX, World, Fish, Shark, newBrain, evolve, runGeneration, adaptStatus, seeded };
  root.FishCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
