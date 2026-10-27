// Particle swarm optimisation on a bumpy 2-D landscape (peaks = good answers). Pure logic, seeded.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // landscape on the unit square, scaled so the highest peak is exactly 1
  function landscape(seed) {
    const r = rng(seed), peaks = [], n = 14;
    for (let i = 0; i < n; i++) peaks.push({ x: 0.08 + r() * 0.84, y: 0.08 + r() * 0.84, h: 0.5 + r() * 0.4, s: 0.035 + r() * 0.05 });
    // a narrow tall peak is the true prize, a broad decoy is easy to find
    peaks[0].h = 1; peaks[0].s = 0.03; peaks[1].h = 0.85; peaks[1].s = 0.1; peaks[2].h = 0.9; peaks[2].s = 0.06; peaks[3].h = 0.9; peaks[3].s = 0.06;
    const raw = (x, y) => { let v = 0; for (const p of peaks) v = Math.max(v, p.h * Math.exp(-((x - p.x) ** 2 + (y - p.y) ** 2) / (2 * p.s * p.s))); return v + 0.06 * Math.sin(18 * x) * Math.sin(18 * y); };
    let max = -1, bx = 0, by = 0;
    for (let i = 0; i <= 120; i++) for (let j = 0; j <= 120; j++) { const v = raw(i / 120, j / 120); if (v > max) { max = v; bx = i / 120; by = j / 120; } }
    const f = (x, y) => raw(x, y) / max;
    return { f, best: { x: bx, y: by, v: 1 }, peaks, grid(res) { const g = new Float32Array(res * res); for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) g[j * res + i] = f((i + 0.5) / res, (j + 0.5) / res); return g; } };
  }
  class Swarm {
    constructor(land, n, seed) {
      this.land = land; this.r = rng(((seed || 1) ^ 0x9e3779b9) >>> 0); this.iter = 0; this.ps = []; this.g = { x: 0, y: 0, v: -Infinity };
      for (let i = 0; i < n; i++) this.add();
    }
    add() {
      const x = this.r(), y = this.r(), v = this.land.f(x, y);
      this.ps.push({ x, y, vx: (this.r() - 0.5) * 0.1, vy: (this.r() - 0.5) * 0.1, bx: x, by: y, bv: v });
      if (v > this.g.v) this.g = { x, y, v };
    }
    resize(n) { while (this.ps.length > n) this.ps.pop(); while (this.ps.length < n) this.add(); }
    step(w, c1, c2) {
      const VMAX = 0.08;
      for (const p of this.ps) {
        const r1 = this.r(), r2 = this.r();
        p.vx = w * p.vx + c1 * r1 * (p.bx - p.x) + c2 * r2 * (this.g.x - p.x);
        p.vy = w * p.vy + c1 * r1 * (p.by - p.y) + c2 * r2 * (this.g.y - p.y);
        const sp = Math.hypot(p.vx, p.vy); if (sp > VMAX) { p.vx *= VMAX / sp; p.vy *= VMAX / sp; }
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) { p.x = 0; p.vx = 0; } else if (p.x > 1) { p.x = 1; p.vx = 0; }
        if (p.y < 0) { p.y = 0; p.vy = 0; } else if (p.y > 1) { p.y = 1; p.vy = 0; }
        const v = this.land.f(p.x, p.y);
        if (v > p.bv) { p.bv = v; p.bx = p.x; p.by = p.y; }
        if (v > this.g.v) this.g = { x: p.x, y: p.y, v };
      }
      this.iter++;
    }
    spread() { // average distance from the swarm's centre, 0 = everyone together
      const n = this.ps.length; let cx = 0, cy = 0; for (const p of this.ps) { cx += p.x; cy += p.y; } cx /= n; cy /= n;
      let s = 0; for (const p of this.ps) s += Math.hypot(p.x - cx, p.y - cy); return s / n;
    }
  }
  const core = { rng, landscape, Swarm };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.SwarmCore = core;
})(typeof window !== "undefined" ? window : globalThis);
