// Paper Plane Designer — side-view glider physics and a genetic algorithm over plane designs.
// No DOM, so it also runs in Node: require("./game-glider-core.js").
//
// A design is 5 numbers ("genes", each 0..1) that map to: wing size, wing tilt, nose clips,
// throw angle and throw speed. The physics is a tiny 2-D rigid-body glider: lift and drag from the
// angle of attack (with a stall), a pitching moment from the wing tilt and the nose weight
// (static margin), and pitch damping. Everything is clamped so nothing can explode.
(function (root) {
  const G = 9.81, RHO = 1.2;
  const DT = 1 / 240;          // physics step (s)
  const REC = 8;               // record every 8th step (30 samples per second)
  const T_MAX = 24;            // longest flight (s)
  const LAUNCH_H = 4;          // throw from the top of a little hill (m)
  const FIELD = 80;            // end of the field (m): fly past it and you've left the park
  const CEIL = 6.2;            // cave roof height at the entrance (m); it slopes down further in
  const ceilAt = (x) => clamp(CEIL - 0.09 * x, 2.6, CEIL);
  const PAD_X = 30, PAD_HALF = 1.5;   // landing pad centre and half-width (m)
  const WIND = -4;             // headwind speed (m/s, blowing towards the thrower)

  // gene → slider value
  const GENES = [
    { key: "wing", name: "Wing size", min: 0.6, max: 2.0, unit: "×" },
    { key: "tilt", name: "Wing tilt", min: -2, max: 12, unit: "°" },
    { key: "clips", name: "Nose weight", min: 0, max: 4, unit: " clips" },
    { key: "angle", name: "Throw angle", min: -10, max: 45, unit: "°" },
    { key: "speed", name: "Throw speed", min: 4, max: 16, unit: " m/s" },
  ];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
  const D2R = Math.PI / 180;

  function decode(genes) {
    const d = {};
    GENES.forEach((g, i) => (d[g.key] = g.min + (g.max - g.min) * clamp(genes[i], 0, 1)));
    return d;
  }
  function encode(d) {
    return GENES.map((g) => clamp((d[g.key] - g.min) / (g.max - g.min), 0, 1));
  }

  // Numbers the page shows in "what's happening inside" and the design preview.
  function explain(d) {
    const S = 0.012 * d.wing;
    const mass = (3 + 2 * d.wing + 1 * d.clips) / 1000;             // kg
    const sm = -0.04 + 0.06 * d.clips;                                // static margin (fraction of chord)
    const cm0 = 0.66 * d.tilt * D2R;                                   // nose-up moment from the tilted wing
    const trim = sm > 0.004 ? cm0 / (sm * 5) : (cm0 >= 0 ? 0.6 : -0.6); // angle of attack it settles at (rad)
    return { S, mass, sm, cm0, trim, trimDeg: trim / D2R, loading: mass * G / S };
  }

  // seeded random numbers (mulberry32)
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
  function gauss(rnd) {
    let u = 0;
    while (u === 0) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  }

  // headwind / cave / pad
  const DEFAULT_RULES = { wind: false, cave: false, pad: false };

  // Aerodynamic coefficients for an angle of attack a (rad). Attached flow below about 14°,
  // a smooth blend into flat-plate behaviour above (the stall): lift falls, drag shoots up.
  const KQ = 30, KD = 4.5;
  const CLA = 5.0, A_STALL = 14 * D2R, K_IND = 0.1, CD0 = 0.011;
  function aero(a) {
    const f = 1 / (1 + Math.exp(-(Math.abs(a) - A_STALL) / 0.03)); // 0 = attached, 1 = stalled
    const clAtt = CLA * a;
    const cl = (1 - f) * clAtt + f * 0.9 * Math.sin(2 * a);
    const cdWing = CD0 + (1 - f) * K_IND * clAtt * clAtt + f * 1.6 * Math.sin(a) * Math.sin(a);
    return { cl, cdWing, f };
  }

  // Throw one plane. Returns its path (x, y, pitch every 1/30 s) and how it ended.
  function simulate(d, rules = DEFAULT_RULES) {
    const e = explain(d);
    const { S, mass, sm, cm0 } = e;
    const bodyDrag = 0.00012 + 0.00005 * d.clips;  // drag area of the body and paper clips (m²)
    const bendy = Math.max(0, d.wing - 1.4);      // huge paper wings flap and bend: extra drag
    let x = 0.6, y = LAUNCH_H + 1.2;              // hand height on top of the hill
    let vx = d.speed * Math.cos(d.angle * D2R), vy = d.speed * Math.sin(d.angle * D2R);
    let th = d.angle * D2R, om = 0;
    const n = Math.ceil(T_MAX / DT / REC) + 2;
    const px = new Float32Array(n), py = new Float32Array(n), pth = new Float32Array(n);
    const pa = new Float32Array(n), pv = new Float32Array(n), pl = new Float32Array(n); // angle of attack, airspeed, lift ÷ weight
    let k = 0, step = 0, why = "timeout", maxH = y, stallT = 0, t = 0, ceilHit = false, impact = 0;
    px[k] = x; py[k] = y; pth[k] = th; k++;
    const maxSteps = Math.round(T_MAX / DT);
    for (step = 1; step <= maxSteps; step++) {
      t = step * DT;
      const wx = rules.wind ? WIND + 1.2 * Math.sin(0.9 * t) + 0.6 * Math.sin(2.3 * t + 1) : 0;
      const rx = vx - wx, ry = vy;
      const v = Math.min(40, Math.hypot(rx, ry)) || 1e-6;
      const gam = Math.atan2(ry, rx);
      const a = wrap(th - gam);
      const { cl, cdWing, f } = aero(a);
      const q = 0.5 * RHO * v * v;
      const L = q * S * cl;
      const D = q * (S * (cdWing + 0.03 * bendy * bendy * 4) + bodyDrag);
      // lift is at right angles to the airflow, drag points against it
      const ux = rx / v, uy = ry / v;
      const ax = (-D * ux - L * uy) / mass;
      const ay = (-D * uy + L * ux) / mass - G;
      // pitch: tilt pushes the nose up, the nose weight pulls the angle of attack back (stability), air damps the spin
      const cm = cm0 * Math.cos(a) - sm * CLA * Math.sin(a) * (1 - 0.5 * f);
      const alpha = KQ * (q * S / mass) * cm - KD * v * om - 3 * om;
      vx += ax * DT; vy += ay * DT;
      // keep speeds sane whatever happens
      const sp = Math.hypot(vx, vy);
      if (sp > 45) { vx *= 45 / sp; vy *= 45 / sp; }
      om = clamp(om + alpha * DT, -25, 25);
      th = wrap(th + om * DT);
      x += vx * DT; y += vy * DT;
      if (f > 0.5) stallT += DT;
      if (y > maxH) maxH = y;
      if (step % REC === 0 && k < n) { px[k] = x; py[k] = y; pth[k] = th; pa[k] = a; pv[k] = v; pl[k] = L / (mass * G); k++; }
      if (rules.cave && y >= ceilAt(x) - 0.15) { why = "ceiling"; ceilHit = true; break; }
      if (y <= 0) { // land: back up to where it touched the ground
        const back = vy < 0 ? y / vy : 0;
        x -= vx * back; y = 0;
        impact = Math.hypot(vx, vy);
        why = "landed"; break;
      }
      if (x >= FIELD) { x = FIELD; why = "far"; break; }
      if (x < -6) { why = "backwards"; break; }
    }
    if (k < n) { px[k] = x; py[k] = Math.max(0, y); pth[k] = th; pa[k] = pa[k - 1]; pv[k] = pv[k - 1]; pl[k] = pl[k - 1]; k++; }
    return {
      n: k, px, py, pth, pa, pv, pl, time: Math.min(t, T_MAX), why, dist: Math.max(0, x), endX: x, endY: y,
      maxH, stallT, ceilHit, impact,
    };
  }

  // How good a flight was. Distance mode: metres flown (bumping the cave roof ends the flight there and
  // costs a little extra). Pad mode: closeness to the pad centre, and a soft touchdown.
  function fitness(r, rules = DEFAULT_RULES) {
    if (rules.pad) {
      const miss = Math.abs(r.dist - PAD_X);
      const hard = r.why === "landed" ? Math.max(0, r.impact - 3) : 4;
      return 100 - miss * 2.5 - hard * 6 - (r.why === "ceiling" ? 20 : 0);
    }
    return r.dist - (r.why === "ceiling" ? 4 : 0);
  }
  const SOFT = 4.0; // m/s: land slower than this, or the ladybug passenger gets a bump
  const onPad = (r) => r.why === "landed" && Math.abs(r.dist - PAD_X) <= PAD_HALF;
  const softOnPad = (r) => onPad(r) && r.impact <= SOFT;

  // ---------- genetic algorithm ----------
  // Every plane remembers its parents, so the page can draw the champion's family tree.
  class Evolution {
    constructor(seed = 1, size = 40) {
      this.rnd = seeded(seed);
      this.size = size;
      this.gen = 1;
      this.nextId = 1;
      this.tree = new Map(); // id → { id, gen, genes, parents, how, fit, dist }
      this.pop = Array.from({ length: size }, () => this.birth(GENES.map(() => this.rnd()), [], "random"));
      this.results = null; this.fits = null;
    }
    birth(genes, parents, how) {
      const p = { id: this.nextId++, gen: this.gen, genes: genes.map((g) => clamp(g, 0, 1)), parents, how, fit: null, dist: null };
      this.tree.set(p.id, p);
      return p;
    }
    // evaluate planes [from, to) — the page calls this in chunks so the screen never freezes
    evaluate(rules, from = 0, to = this.size) {
      if (from === 0) { this.results = new Array(this.size); this.fits = new Array(this.size); }
      for (let i = from; i < Math.min(to, this.size); i++) {
        const r = simulate(decode(this.pop[i].genes), rules);
        this.results[i] = r;
        this.fits[i] = fitness(r, rules);
        this.pop[i].fit = this.fits[i]; this.pop[i].dist = r.dist; this.pop[i].why = r.why;
      }
      return Math.min(to, this.size) >= this.size;
    }
    ranking() { return this.fits.map((_, i) => i).sort((a, b) => this.fits[b] - this.fits[a]); }
    // tournament selection: pick 3 at random, the best of them becomes a parent
    pick() {
      let best = -1;
      for (let k = 0; k < 3; k++) {
        const i = Math.floor(this.rnd() * this.size);
        if (best < 0 || this.fits[i] > this.fits[best]) best = i;
      }
      return this.pop[best];
    }
    // selection + crossover + mutation. mutation = how big the random nudges are (0..0.5 of a gene's range)
    breed(mutation = 0.12, opts = {}) {
      const order = this.ranking();
      const elite = opts.elite ?? 2;
      this.gen++;
      const next = order.slice(0, elite).map((i) => this.birth(this.pop[i].genes, [this.pop[i].id], "kept"));
      if (opts.inject) next.push(this.birth(opts.inject, [], "yours"));
      while (next.length < this.size) {
        const a = this.pick();
        let genes, parents, how;
        if (this.rnd() < 0.7) {
          const b = this.pick();
          // blend crossover: each gene is a mix somewhere between (and slightly beyond) the two parents
          genes = a.genes.map((g, i) => { const w = -0.15 + 1.3 * this.rnd(); return g + w * (b.genes[i] - g); });
          parents = a.id === b.id ? [a.id] : [a.id, b.id]; how = a.id === b.id ? "copy" : "mix";
        } else { genes = a.genes.slice(); parents = [a.id]; how = "copy"; }
        let mutated = 0;
        genes = genes.map((g) => { if (this.rnd() < 0.4) { mutated++; return g + gauss(this.rnd) * mutation; } return g; });
        if (mutated) how += "+mut";
        next.push(this.birth(genes, parents, how));
      }
      this.pop = next;
      this.results = null; this.fits = null;
      this.prune();
    }
    // forget ancestors nobody alive descends from (within 6 family levels; an unchanged "kept" copy
    // doesn't count as a level, so a long-reigning champion still keeps its real parents and grandparents)
    prune() {
      if (this.gen % 10) return;
      const keep = new Map(); // id → shallowest level seen
      const stack = this.pop.map((p) => [p.id, 0]);
      while (stack.length) {
        const [id, d] = stack.pop();
        if (keep.has(id) && keep.get(id) <= d) continue;
        keep.set(id, d);
        const p = this.tree.get(id);
        if (!p) continue;
        const nd = p.how === "kept" ? d : d + 1;
        if (nd <= 6) for (const q of p.parents) stack.push([q, nd]);
      }
      for (const id of [...this.tree.keys()]) if (!keep.has(id)) this.tree.delete(id);
    }
    // how spread out each gene is across the flock (0 = everyone the same)
    spread() {
      return GENES.map((_, i) => {
        let lo = 1, hi = 0, s = 0;
        for (const p of this.pop) { lo = Math.min(lo, p.genes[i]); hi = Math.max(hi, p.genes[i]); s += p.genes[i]; }
        return { lo, hi, mean: s / this.pop.length };
      });
    }
  }

  const api = {
    G, DT, REC, T_MAX, LAUNCH_H, FIELD, CEIL, ceilAt, PAD_X, PAD_HALF, WIND, GENES, DEFAULT_RULES,
    SOFT, decode, encode, explain, simulate, fitness, onPad, softOnPad, aero, seeded, Evolution,
  };
  root.GliderCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
