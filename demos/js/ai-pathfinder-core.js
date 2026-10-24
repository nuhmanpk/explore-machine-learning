// Pathfinder — a grid map and a step-by-step best-first search.
// weight 0 = Dijkstra (blind, always finds the cheapest path), 1 = A*, big = greedy best-first.
// No DOM, so it also runs in Node.
(function (root) {
  const W = 25, H = 17;
  const FLOOR = 0, WALL = 1, MUD = 2;
  const COST = [1, Infinity, 4];
  const idx = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- a tiny binary heap ----------
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    less(i, j) { const p = this.a[i], q = this.a[j]; return p.f < q.f || (p.f === q.f && (p.h < q.h || (p.h === q.h && p.n < q.n))); }
    push(it) {
      const a = this.a; a.push(it);
      let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (this.less(i, p)) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break; }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && this.less(l, m)) m = l;
          if (r < a.length && this.less(r, m)) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]]; i = m;
        }
      }
      return top;
    }
  }

  // ---------- the map ----------
  class Grid {
    constructor() {
      this.cells = new Uint8Array(W * H);
      this.start = [2, H >> 1];
      this.goal = [W - 3, H >> 1];
    }
    clone() { const g = new Grid(); g.cells.set(this.cells); g.start = this.start.slice(); g.goal = this.goal.slice(); return g; }
    cost(x, y) { return COST[this.cells[idx(x, y)]]; }
    set(x, y, t) {
      if (!inside(x, y)) return;
      if ((x === this.start[0] && y === this.start[1]) || (x === this.goal[0] && y === this.goal[1])) return;
      this.cells[idx(x, y)] = t;
    }
  }

  // ---------- presets ----------
  function preset(name, seed = 3) {
    const g = new Grid();
    const wall = (x, y) => { if (inside(x, y)) g.cells[idx(x, y)] = WALL; };
    const mud = (x, y) => { if (inside(x, y) && g.cells[idx(x, y)] === FLOOR) g.cells[idx(x, y)] = MUD; };
    if (name === "field") {
      g.start = [2, 8]; g.goal = [22, 8];
      for (let y = 2; y < 15; y++) if (y < 7 || y > 9) wall(12, y);
      for (let x = 14; x < 19; x++) for (let y = 3; y < 6; y++) mud(x, y);
    } else if (name === "trap") {
      // a U-shaped cup that points at the goal's side: greedy walks in and gets stuck
      g.start = [3, 8]; g.goal = [21, 8];
      for (let x = 9; x <= 15; x++) { wall(x, 4); wall(x, 12); }
      for (let y = 4; y <= 12; y++) wall(15, y);
    } else if (name === "lake") {
      // a big mud lake straight between start and goal: the short way is slow, the long way is quick
      g.start = [2, 8]; g.goal = [22, 8];
      for (let x = 7; x <= 17; x++) for (let y = 3; y <= 13; y++) mud(x, y);
    } else if (name === "city") {
      g.start = [1, 1]; g.goal = [23, 15];
      for (let bx = 0; bx < 5; bx++) for (let by = 0; by < 3; by++)
        for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) wall(3 + bx * 4 + x, 2 + by * 5 + y);
      for (let x = 11; x < 15; x++) for (let y = 7; y < 9; y++) { g.cells[idx(x, y)] = FLOOR; mud(x, y); }
    } else if (name === "maze") {
      // recursive backtracker on odd cells
      const r = seeded(seed * 77 + 5);
      g.cells.fill(WALL);
      const stack = [[1, 1]]; g.cells[idx(1, 1)] = FLOOR;
      while (stack.length) {
        const [cx, cy] = stack[stack.length - 1];
        const opts = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => inside(cx + dx, cy + dy) && cx + dx > 0 && cy + dy > 0 && cx + dx < W - 1 && cy + dy < H - 1 && g.cells[idx(cx + dx, cy + dy)] === WALL);
        if (!opts.length) { stack.pop(); continue; }
        const [dx, dy] = opts[Math.floor(r() * opts.length)];
        g.cells[idx(cx + dx / 2, cy + dy / 2)] = FLOOR; g.cells[idx(cx + dx, cy + dy)] = FLOOR;
        stack.push([cx + dx, cy + dy]);
      }
      // knock out a few walls so there is more than one route
      for (let i = 0; i < 14; i++) { const x = 2 + Math.floor(r() * (W - 4)), y = 2 + Math.floor(r() * (H - 4)); g.cells[idx(x, y)] = FLOOR; }
      g.start = [1, 1]; g.goal = [W - 2, H - 2];
    } else { // empty
      g.start = [3, 8]; g.goal = [21, 8];
    }
    g.cells[idx(g.start[0], g.start[1])] = FLOOR;
    g.cells[idx(g.goal[0], g.goal[1])] = FLOOR;
    return g;
  }

  // ---------- one search, one expansion at a time ----------
  class Search {
    // weight: heuristic weight (0 = Dijkstra). Priority f = g + weight * h, h = Manhattan distance.
    constructor(grid, weight) {
      this.grid = grid;
      this.weight = weight;
      this.g = new Float64Array(W * H).fill(Infinity);
      this.parent = new Int32Array(W * H).fill(-1);
      this.state = new Uint8Array(W * H); // 0 unseen, 1 on the frontier, 2 explored
      this.heap = new Heap();
      this.counter = 0;
      this.explored = 0;
      this.done = false;
      this.found = false;
      this.cost = Infinity;
      this.path = [];
      this.current = null; // {x, y, g, h, f} the square just expanded
      this.order = new Int32Array(W * H).fill(-1); // when each square was expanded
      const [sx, sy] = grid.start, gx = grid.goal[0], gy = grid.goal[1];
      this.gx = gx; this.gy = gy;
      this.g[idx(sx, sy)] = 0;
      this.state[idx(sx, sy)] = 1;
      const h = this.h(sx, sy);
      this.heap.push({ i: idx(sx, sy), g: 0, h, f: weight * h, n: this.counter++ });
    }
    h(x, y) { return Math.abs(x - this.gx) + Math.abs(y - this.gy); }
    step() {
      if (this.done) return false;
      let it;
      do { it = this.heap.pop(); } while (it && it.g > this.g[it.i]); // skip out-of-date entries
      if (!it) { this.done = true; return false; }
      const x = it.i % W, y = Math.floor(it.i / W);
      this.state[it.i] = 2;
      this.order[it.i] = this.explored++;
      this.current = { x, y, g: it.g, h: it.h, f: it.f };
      if (x === this.gx && y === this.gy) {
        this.done = true; this.found = true; this.cost = it.g;
        for (let i = it.i; i !== -1; i = this.parent[i]) this.path.push([i % W, Math.floor(i / W)]);
        this.path.reverse();
        return true;
      }
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny)) continue;
        const c = this.grid.cost(nx, ny);
        if (c === Infinity) continue;
        const ni = idx(nx, ny), ng = it.g + c;
        if (ng < this.g[ni]) {
          this.g[ni] = ng; this.parent[ni] = it.i; this.state[ni] = 1;
          const h = this.h(nx, ny);
          this.heap.push({ i: ni, g: ng, h, f: ng + this.weight * h, n: this.counter++ });
        }
      }
      return true;
    }
    runAll() { while (!this.done) this.step(); return this; }
    // the next square this search would expand, with its numbers (for the "inside" explanation)
    peek() {
      let best = null;
      for (const it of this.heap.a) if (it.g <= this.g[it.i] && (!best || it.f < best.f || (it.f === best.f && it.h < best.h))) best = it;
      return best ? { x: best.i % W, y: Math.floor(best.i / W), g: best.g, h: best.h, f: best.f } : null;
    }
    frontierSize() { let n = 0; for (let i = 0; i < W * H; i++) if (this.state[i] === 1) n++; return n; }
  }

  // Squares along the current best path (used by the "drop a wall on the path" challenge).
  function pathMiddle(search) {
    const p = search.path;
    if (!p || p.length < 6) return null;
    const m = p.length >> 1;
    return p.slice(m - 1, m + 2);
  }

  const api = { W, H, FLOOR, WALL, MUD, COST, Grid, Search, preset, pathMiddle, seeded };
  root.Pathfinder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
