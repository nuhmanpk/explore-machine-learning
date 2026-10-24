// Ants Find the Best Path — ant colony optimisation on a little network of paths.
// No DOM, so it also runs in Node.
// Ants leave the nest and pick a path at every crossing: they like paths that smell strongly
// (pheromone) and paths that are short. Each ant remembers its route (loops cut out). When it
// reaches food it walks the route back home, dropping smell on every path: more smell for
// shorter routes. Smell slowly fades, so routes nobody uses are forgotten.
(function (root) {
  const W = 640, H = 400;

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

  class Colony {
    constructor(opts = {}) {
      this.evap = opts.evap ?? 0.005; // fraction of smell that fades each tick
      this.curiosity = opts.curiosity ?? 0.05; // chance to ignore smell at a crossing
      this.alpha = 1.5; // how much ants trust smell
      this.beta = 1.5; // how much ants like short paths
      this.speed = 2.2; // pixels per tick
      // Smell is kept between a floor and a ceiling (a "max-min ant system"), so an old habit can
      // never get so strong that a newly opened, shorter path has no chance.
      this.tauMin = 0.3;
      this.tauMax = 8;
      this.depositScale = 2;
      this.ants = [];
      this.tick = 0;
      this.trips = []; // {t, len}
      this.antCount = opts.ants ?? 150;
      this.build(opts.seed ?? 1, opts.map ?? "meadow");
    }

    // ---------- the network ----------
    build(seed, map = "meadow") {
      const rnd = seeded(seed);
      this.seed = seed;
      this.map = map;
      this.nodes = [];
      this.edges = [];
      const cols = 9, rows = 6;
      this.cols = cols;
      const gx = (W - 80) / (cols - 1), gy = (H - 70) / (rows - 1);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const edge = c === 0 || c === cols - 1;
          this.nodes.push({
            x: 40 + c * gx + (edge ? 0 : (rnd() - 0.5) * gx * 0.55),
            y: 35 + r * gy + (rnd() - 0.5) * gy * 0.55,
          });
        }
      const id = (c, r) => r * cols + c;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          if (c < cols - 1 && rnd() < 0.82) this.addEdge(id(c, r), id(c + 1, r));
          if (r < rows - 1 && rnd() < 0.7) this.addEdge(id(c, r), id(c, r + 1));
          if (c < cols - 1 && r < rows - 1 && rnd() < 0.22) this.addEdge(id(c, r), id(c + 1, r + 1));
          if (c > 0 && r < rows - 1 && rnd() < 0.22) this.addEdge(id(c, r), id(c - 1, r + 1));
        }
      this.nest = id(0, rows >> 1);
      this.foods = [id(cols - 1, (rows >> 1) - 1)];
      this.river = null;
      if (map === "river") {
        // A river down the middle: only the top and bottom bridges stay.
        const mid = cols >> 1;
        for (const e of this.edges) {
          const ca = e.a % cols, cb = e.b % cols;
          const crosses = Math.min(ca, cb) === mid - 1 && Math.max(ca, cb) === mid;
          const r = Math.floor(e.a / cols), r2 = Math.floor(e.b / cols);
          if (crosses) {
            if ((r === 0 && r2 === 0) || (r === rows - 1 && r2 === rows - 1)) e.bridge = true;
            else e.removed = true;
          }
        }
        this.edges = this.edges.filter((e) => !e.removed);
        for (const r of [0, rows - 1]) if (!this.edges.some((e) => e.bridge && Math.floor(e.a / cols) === r)) { const e = this.addEdge(id(mid - 1, r), id(mid, r)); e.bridge = true; }
        this.river = (this.nodes[id(mid - 1, 0)].x + this.nodes[id(mid, 0)].x) / 2;
      }
      this.ensureConnected();
      // A hidden shortcut that the "open a shortcut" challenge can reveal (a new bridge on the river map).
      this.hidden = this.findShortcut();
      this.trips = [];
      this.ants = [];
      for (let i = 0; i < this.antCount; i++) this.ants.push(this.newAnt());
      for (const e of this.edges) e.tau = this.tauMin;
      this.best = null;
    }
    addEdge(a, b, hidden = false) {
      if (this.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return null;
      const na = this.nodes[a], nb = this.nodes[b];
      const e = { a, b, len: Math.hypot(na.x - nb.x, na.y - nb.y), tau: 0.1, closed: false, hidden };
      this.edges.push(e);
      return e;
    }
    other(e, n) { return e.a === n ? e.b : e.a; }
    open(e) { return !e.closed && !e.hidden; }
    adj(n) { return this.edges.filter((e) => (e.a === n || e.b === n) && this.open(e)); }
    crossesRiver(i, j) {
      if (this.river == null) return false;
      return (this.nodes[i].x - this.river) * (this.nodes[j].x - this.river) < 0;
    }
    // Make sure the nest can reach the food, adding links if needed.
    ensureConnected() {
      for (let guard = 0; guard < 20 && this.shortest() === Infinity; guard++) {
        const reach = this.reachable(this.nest);
        let best = null;
        for (const i of reach)
          for (let j = 0; j < this.nodes.length; j++) {
            if (reach.has(j) || this.crossesRiver(i, j)) continue;
            const d = Math.hypot(this.nodes[i].x - this.nodes[j].x, this.nodes[i].y - this.nodes[j].y);
            if (!best || d < best.d) best = { i, j, d };
          }
        if (!best) break;
        const ex = this.edges.find((e) => (e.a === best.i && e.b === best.j) || (e.a === best.j && e.b === best.i));
        if (ex) ex.closed = false;
        else this.addEdge(best.i, best.j);
      }
    }
    reachable(start) {
      const seen = new Set([start]), stack = [start];
      while (stack.length) {
        const n = stack.pop();
        for (const e of this.adj(n)) { const m = this.other(e, n); if (!seen.has(m)) { seen.add(m); stack.push(m); } }
      }
      return seen;
    }
    // Length of the truly shortest route from the nest to the nearest food (Dijkstra).
    shortest(foods = this.foods) {
      const r = this.shortestRoute(foods);
      return r ? r.len : Infinity;
    }
    shortestRoute(foods = this.foods) {
      const n = this.nodes.length;
      const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(null), done = new Uint8Array(n);
      dist[this.nest] = 0;
      for (;;) {
        let u = -1;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0) return null;
        if (foods.includes(u)) {
          const edges = [];
          for (let x = u; prev[x]; x = this.other(prev[x], x)) edges.unshift(prev[x]);
          return { len: dist[u], edges, food: u };
        }
        done[u] = 1;
        for (const e of this.adj(u)) {
          const v = this.other(e, u);
          if (dist[u] + e.len < dist[v]) { dist[v] = dist[u] + e.len; prev[v] = e; }
        }
      }
    }
    // The missing link that would shorten the best route the most.
    findShortcut() {
      const base = this.shortest();
      let best = null;
      for (let i = 0; i < this.nodes.length; i++)
        for (let j = i + 1; j < this.nodes.length; j++) {
          const d = Math.hypot(this.nodes[i].x - this.nodes[j].x, this.nodes[i].y - this.nodes[j].y);
          if (d > 150 || d < 30) continue;
          if (this.river == null ? false : !this.crossesRiver(i, j)) continue; // on the river map the shortcut is a new bridge
          if (this.edges.some((e) => (e.a === i && e.b === j) || (e.a === j && e.b === i))) continue;
          this.addEdge(i, j);
          const s = this.shortest();
          this.edges.pop();
          if (!best || s < best.s) best = { i, j, s };
        }
      if (!best || best.s > base - 25) return null;
      const e = this.addEdge(best.i, best.j, true);
      if (this.river != null) e.bridge = true;
      return e;
    }

    // ---------- ants ----------
    newAnt() {
      return { node: this.nest, edge: null, from: this.nest, t: 0, mode: "search", route: [this.nest], routeEdges: [], hops: 0, back: 0, len: 0, choice: null, lastEdge: null };
    }
    resetAnt(a) { Object.assign(a, this.newAnt()); }
    setAntCount(n) {
      this.antCount = n;
      while (this.ants.length < n) this.ants.push(this.newAnt());
      this.ants.length = n;
    }
    // Where an ant is drawn.
    pos(a) {
      if (!a.edge) return this.nodes[a.node];
      const p = this.nodes[a.from], q = this.nodes[this.other(a.edge, a.from)];
      const s = Math.min(1, a.t / a.edge.len);
      return { x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s };
    }

    // At a crossing: weigh each path by smell^alpha × (1/length)^beta.
    choose(a) {
      const opts = this.adj(a.node);
      let cands = opts.filter((e) => e !== a.lastEdge);
      if (!cands.length) cands = opts;
      if (!cands.length) return null;
      const scored = cands.map((e) => ({ e, w: Math.pow(e.tau, this.alpha) * Math.pow(100 / e.len, this.beta) }));
      const total = scored.reduce((s, o) => s + o.w, 0);
      let pick;
      const curious = Math.random() < this.curiosity;
      if (curious) pick = scored[Math.floor(Math.random() * scored.length)];
      else {
        let r = Math.random() * total;
        pick = scored[scored.length - 1];
        for (const o of scored) { r -= o.w; if (r <= 0) { pick = o; break; } }
      }
      a.choice = { node: a.node, scored, total, pick, curious };
      return pick.e;
    }

    step() {
      this.tick++;
      if (this.tick % 50 === 1) this.opt = this.shortest(); // cached for deposits
      for (const a of this.ants) this.move(a);
      const k = 1 - this.evap;
      for (const e of this.edges) e.tau = Math.min(this.tauMax, Math.max(this.tauMin, e.tau * k));
      if (this.best && (this.best.edges.some((e) => !this.open(e)) || this.tick - this.best.t > 2000)) this.best = null;
      if (this.best && this.tick % 25 === 0) for (const e of this.best.edges) e.tau += this.depositScale * 0.5; // elitist boost
    }

    move(a) {
      if (!a.edge) {
        if (a.mode === "search") {
          const e = this.choose(a);
          if (!e) return this.resetAnt(a);
          a.edge = e; a.from = a.node; a.t = 0;
        } else {
          if (a.back < 0) {
            this.trips.push({ t: this.tick, len: a.len });
            if (this.trips.length > 3000) this.trips.splice(0, 1000);
            return this.resetAnt(a);
          }
          const e = a.routeEdges[a.back];
          if (!this.open(e)) return this.resetAnt(a); // the way back got blocked
          e.tau += a.deposit; // drop smell: shorter trip → more smell
          a.edge = e; a.from = a.node; a.t = 0;
        }
      }
      a.t += this.speed;
      if (a.t < a.edge.len) return;
      const e = a.edge;
      a.node = this.other(e, a.from);
      a.edge = null;
      a.lastEdge = e;
      if (a.mode === "home") { a.back--; return; }
      if (!this.open(e)) return this.resetAnt(a);
      a.hops++;
      if (a.hops > 70) return this.resetAnt(a);
      const at = a.route.indexOf(a.node);
      if (at >= 0) { a.route.length = at + 1; a.routeEdges.length = at; } // walked in a loop: forget it
      else { a.route.push(a.node); a.routeEdges.push(e); }
      if (this.foods.includes(a.node)) {
        a.mode = "home";
        a.len = a.routeEdges.reduce((s, x) => s + x.len, 0);
        a.deposit = this.depositScale * Math.pow((this.opt || a.len) / a.len, 2);
        a.back = a.routeEdges.length - 1;
        if (!this.best || a.len < this.best.len) this.best = { edges: a.routeEdges.slice(), len: a.len, t: this.tick };
      }
    }

    // Average length of recent trips — what the chart shows.
    recentLength(window = 500) {
      let s = 0, n = 0;
      for (let i = this.trips.length - 1; i >= 0 && this.trips[i].t > this.tick - window; i--) { s += this.trips[i].len; n++; }
      return n < 3 ? null : s / n;
    }
    // The colony's favourite route: follow the smelliest path from the nest.
    favouriteRoute() {
      const edges = [], seen = new Set([this.nest]);
      let n = this.nest;
      for (let s = 0; s < 40; s++) {
        if (this.foods.includes(n)) return { edges, found: true };
        let best = null;
        for (const e of this.adj(n)) if (!seen.has(this.other(e, n)) && (!best || e.tau > best.tau)) best = e;
        if (!best) break;
        edges.push(best);
        n = this.other(best, n);
        seen.add(n);
      }
      return { edges, found: false };
    }

    // ---------- challenges ----------
    // Close the smelliest path on the colony's favourite route (never the only way through).
    blockBest() {
      const fav = this.favouriteRoute().edges.slice().sort((x, y) => y.tau - x.tau);
      for (const e of fav) {
        e.closed = true;
        if (this.shortest() < Infinity) { this.best = null; return e; }
        e.closed = false;
      }
      return null;
    }
    toggle(e) {
      e.closed = !e.closed;
      if (e.closed && this.shortest() === Infinity) { e.closed = false; return false; }
      this.best = null;
      return true;
    }
    openShortcut() {
      if (!this.hidden) return null;
      const e = this.hidden;
      e.hidden = false;
      e.tau = this.tauMin;
      this.hidden = null;
      return e;
    }
    moveFood() {
      const far = this.nodes.map((n, i) => i).filter((i) => i !== this.nest && !this.foods.includes(i) && this.nodes[i].x > W * 0.55);
      const cand = far.filter((i) => Math.hypot(this.nodes[i].x - this.nodes[this.foods[0]].x, this.nodes[i].y - this.nodes[this.foods[0]].y) > 140);
      const list = cand.length ? cand : far;
      this.foods[0] = list[Math.floor(Math.random() * list.length)];
      this.best = null;
      this.ensureConnected();
      return this.foods[0];
    }
    addFood() {
      const cand = this.nodes.map((n, i) => i).filter((i) => i !== this.nest && !this.foods.includes(i) && this.nodes[i].x > W * 0.3 &&
        this.foods.every((f) => Math.hypot(this.nodes[i].x - this.nodes[f].x, this.nodes[i].y - this.nodes[f].y) > 160));
      if (!cand.length) return null;
      const f = cand[Math.floor(Math.random() * cand.length)];
      this.foods.push(f);
      this.best = null;
      return f;
    }
    rain(keep = 0.2) {
      for (const e of this.edges) e.tau = Math.max(this.tauMin, e.tau * keep);
      this.best = null;
    }
  }

  const api = { W, H, Colony };
  root.AntsACO = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
