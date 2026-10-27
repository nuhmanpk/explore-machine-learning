// Path-planning core: occupancy grid, RRT (rapidly-exploring random tree), shortcut smoothing, grid A*. Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const CELL = 10, GW = 40, GH = 24, W = GW * CELL, H = GH * CELL;
  class Grid {
    constructor() { this.a = new Uint8Array(GW * GH); }
    blocked(cx, cy) { return cx < 0 || cy < 0 || cx >= GW || cy >= GH || this.a[cy * GW + cx] === 1; }
    set(cx, cy, v) { if (cx >= 0 && cy >= 0 && cx < GW && cy < GH) this.a[cy * GW + cx] = v ? 1 : 0; }
    pointFree(x, y) { return !this.blocked(Math.floor(x / CELL), Math.floor(y / CELL)); }
    // sampled segment test, every 2 world units
    segFree(a, b) {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / 2));
      for (let i = 0; i <= n; i++) { const u = i / n; if (!this.pointFree(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)) return false; }
      return true;
    }
    clear() { this.a.fill(0); }
    rect(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, 1); }
  }
  const PRESETS = {
    // wall with a wide gap, a wall with a narrow (2-cell) gap, and a pseudo-random scatter
    wall: (g) => { g.clear(); g.rect(19, 0, 20, 8); g.rect(19, 15, 20, GH - 1); },
    gap: (g) => { g.clear(); g.rect(19, 0, 20, 10); g.rect(19, 13, 20, GH - 1); },
    scatter: (g, seed) => { g.clear(); const r = rng(seed || 7); for (let i = 0; i < 16; i++) { const x = 6 + Math.floor(r() * 28), y = Math.floor(r() * 22); g.rect(x, y, x + 1 + Math.floor(r() * 2), y + 1 + Math.floor(r() * 3)); } },
  };

  class RRT {
    constructor(grid, start, goal, seed, o) {
      this.g = grid; this.goal = goal; this.r = rng(seed); this.step = (o && o.step) || 14; this.bias = (o && o.bias != null) ? o.bias : 0.08;
      this.nodes = [start.slice()]; this.parent = [-1]; this.iters = 0; this.found = -1; this.maxIters = (o && o.maxIters) || 4000;
    }
    nearest(p) { let b = 0, bd = Infinity; for (let i = 0; i < this.nodes.length; i++) { const d = (this.nodes[i][0] - p[0]) ** 2 + (this.nodes[i][1] - p[1]) ** 2; if (d < bd) { bd = d; b = i; } } return b; }
    // one iteration; returns the new node index or -1
    iterate() {
      if (this.found >= 0) return -1;
      this.iters++;
      const s = this.r() < this.bias ? this.goal : [this.r() * W, this.r() * H];
      const ni = this.nearest(s), n = this.nodes[ni], d = Math.hypot(s[0] - n[0], s[1] - n[1]);
      if (d < 1e-6) return -1;
      const k = Math.min(1, this.step / d), q = [n[0] + (s[0] - n[0]) * k, n[1] + (s[1] - n[1]) * k];
      if (!this.g.segFree(n, q)) return -1;
      this.nodes.push(q); this.parent.push(ni);
      const id = this.nodes.length - 1;
      if (Math.hypot(q[0] - this.goal[0], q[1] - this.goal[1]) <= this.step && this.g.segFree(q, this.goal)) {
        this.nodes.push(this.goal.slice()); this.parent.push(id); this.found = this.nodes.length - 1;
      }
      return id;
    }
    get failed() { return this.found < 0 && this.iters >= this.maxIters; }
    path() { if (this.found < 0) return null; const p = []; for (let i = this.found; i >= 0; i = this.parent[i]) p.push(this.nodes[i]); return p.reverse(); }
  }
  const plen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
  // Random shortcutting: pick two points on the path, replace what is between them by a straight line if it is free.
  function smooth(path, grid, seed, iters) {
    const r = rng(seed), p = path.map((q) => q.slice());
    for (let k = 0; k < (iters || 200); k++) {
      if (p.length < 3) break;
      let i = Math.floor(r() * (p.length - 2)), j = i + 2 + Math.floor(r() * (p.length - i - 2));
      if (j >= p.length) j = p.length - 1;
      if (j - i >= 2 && grid.segFree(p[i], p[j])) p.splice(i + 1, j - i - 1);
    }
    return p;
  }
  // 8-connected A* with octile heuristic; diagonal moves may not cut corners.
  function astar(grid, start, goal) {
    const s = [Math.floor(start[0] / CELL), Math.floor(start[1] / CELL)], t = [Math.floor(goal[0] / CELL), Math.floor(goal[1] / CELL)];
    const key = (x, y) => y * GW + x, N = GW * GH, gs = new Float64Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const hh = (x, y) => { const dx = Math.abs(x - t[0]), dy = Math.abs(y - t[1]); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const open = [[hh(s[0], s[1]), s[0], s[1]]]; gs[key(s[0], s[1])] = 0; const explored = [];
    if (grid.blocked(s[0], s[1]) || grid.blocked(t[0], t[1])) return { path: null, explored, length: 0 };
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y] = open.splice(bi, 1)[0], k = key(x, y);
      if (closed[k]) continue; closed[k] = 1; explored.push([x, y]);
      if (x === t[0] && y === t[1]) {
        const cells = []; for (let c = k; c >= 0; c = par[c]) cells.push([c % GW, Math.floor(c / GW)]);
        cells.reverse();
        const path = cells.map((c) => [(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL]); path[0] = start.slice(); path[path.length - 1] = goal.slice();
        return { path, explored, length: plen(path) / CELL * 1, cells };
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (grid.blocked(nx, ny) || closed[key(nx, ny)]) continue;
        if (dx && dy && (grid.blocked(x + dx, y) || grid.blocked(x, y + dy))) continue;
        const g = gs[k] + (dx && dy ? Math.SQRT2 : 1);
        if (g < gs[key(nx, ny)]) { gs[key(nx, ny)] = g; par[key(nx, ny)] = k; open.push([g + hh(nx, ny), nx, ny]); }
      }
    }
    return { path: null, explored, length: 0 };
  }
  const core = { rng, Grid, RRT, smooth, astar, plen, PRESETS, CELL, GW, GH, W, H };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.PlanCore = core;
})(typeof window !== "undefined" ? window : globalThis);
