// Friends of Friends core: seeded social graph, label-propagation communities, common-neighbour / Jaccard suggestions, force layout.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const NAMES = ["Ava", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus", "Hana", "Ivan", "Jo", "Kai", "Lena", "Milo", "Nia", "Omar", "Pia", "Quin", "Rae", "Sam", "Tess", "Uma", "Vic", "Wren", "Zed"];

  class Graph {
    constructor(n) { this.n = n; this.adj = Array.from({ length: n }, () => new Set()); }
    has(a, b) { return this.adj[a].has(b); }
    add(a, b) { if (a === b) return false; this.adj[a].add(b); this.adj[b].add(a); return true; }
    remove(a, b) { this.adj[a].delete(b); this.adj[b].delete(a); }
    toggle(a, b) { if (a === b) return null; if (this.has(a, b)) { this.remove(a, b); return false; } this.add(a, b); return true; }
    deg(a) { return this.adj[a].size; }
    edges() { const e = []; for (let i = 0; i < this.n; i++) for (const j of this.adj[i]) if (i < j) e.push([i, j]); return e; }
  }

  // 3 friend groups of 8 (schools / clubs): many links inside, a few across.
  function makeGraph(seed) {
    const r = rng(seed), n = 24, g = new Graph(n), grp = (i) => Math.floor(i / 8);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (r() < (grp(i) === grp(j) ? 0.6 : 0.02)) g.add(i, j);
    for (let i = 0; i < n; i++) if (g.deg(i) === 0) g.add(i, grp(i) * 8 + ((i + 1) % 8));
    // guarantee at least one bridge between neighbouring groups so it looks like one town
    for (let k = 0; k < 2; k++) { let c = 0; for (let i = 0; i < 8; i++) for (const j of g.adj[k * 8 + i]) if (grp(j) !== k) c++; if (!c) g.add(k * 8 + 3, (k + 1) * 8 + 2); }
    return g;
  }

  // Asynchronous label propagation: everybody copies the most common label among friends. Seeded order and tie-breaks.
  function communities(g, seed) {
    const r = rng(seed == null ? 7 : seed), n = g.n, lab = Array.from({ length: n }, (_, i) => i);
    for (let round = 0; round < 40; round++) {
      const order = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      let changed = false;
      for (const u of order) {
        if (!g.deg(u)) continue;
        const cnt = new Map(); for (const v of g.adj[u]) cnt.set(lab[v], (cnt.get(lab[v]) || 0) + 1);
        let best = 0; cnt.forEach((c) => { if (c > best) best = c; });
        const top = [...cnt].filter(([, c]) => c === best).map(([l]) => l).sort((a, b) => a - b);
        if (top.includes(lab[u])) continue;
        lab[u] = top[Math.floor(r() * top.length)]; changed = true;
      }
      if (!changed) break;
    }
    // relabel 0..k-1 by smallest member so colours stay stable
    const map = new Map(); let k = 0; const comm = lab.map((l) => { if (!map.has(l)) map.set(l, k++); return map.get(l); });
    return { comm, count: k };
  }

  // Friend suggestions: people who are not yet friends but share friends. Score = Jaccard of the two friend lists.
  function suggest(g, u, limit) {
    const out = [];
    for (let v = 0; v < g.n; v++) {
      if (v === u || g.has(u, v)) continue;
      const common = []; for (const w of g.adj[u]) if (g.adj[v].has(w)) common.push(w);
      if (!common.length) continue;
      const uni = g.deg(u) + g.deg(v) - common.length;
      out.push({ v, common, n: common.length, jaccard: common.length / uni });
    }
    out.sort((a, b) => b.jaccard - a.jaccard || b.n - a.n || a.v - b.v);
    return out.slice(0, limit || 5);
  }
  function hub(g) { let b = 0; for (let i = 1; i < g.n; i++) if (g.deg(i) > g.deg(b)) b = i; return b; }

  // Force layout (repulsion + springs + gravity). pos/vel are arrays of {x,y}. Returns kinetic energy.
  function initLayout(n, seed) {
    const r = rng(seed + 99);
    return { pos: Array.from({ length: n }, (_, i) => ({ x: Math.cos(i * 2.4) * 0.6 + (r() - 0.5) * 0.1, y: Math.sin(i * 2.4) * 0.6 + (r() - 0.5) * 0.1 })), vel: Array.from({ length: n }, () => ({ x: 0, y: 0 })) };
  }
  function stepLayout(g, L, pinned) {
    const { pos, vel } = L, n = g.n, f = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, d2 = dx * dx + dy * dy + 0.002, d = Math.sqrt(d2), s = 0.006 / d2;
      f[i].x += (dx / d) * s; f[i].y += (dy / d) * s; f[j].x -= (dx / d) * s; f[j].y -= (dy / d) * s;
    }
    for (const [a, b] of g.edges()) {
      const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y, d = Math.sqrt(dx * dx + dy * dy) + 1e-6, s = (d - 0.22) * 0.08;
      f[a].x += (dx / d) * s; f[a].y += (dy / d) * s; f[b].x -= (dx / d) * s; f[b].y -= (dy / d) * s;
    }
    let e = 0;
    for (let i = 0; i < n; i++) {
      if (i === pinned) { vel[i].x = vel[i].y = 0; continue; }
      vel[i].x = (vel[i].x + f[i].x - pos[i].x * 0.02) * 0.7; vel[i].y = (vel[i].y + f[i].y - pos[i].y * 0.02) * 0.7;
      pos[i].x = Math.max(-1.1, Math.min(1.1, pos[i].x + vel[i].x)); pos[i].y = Math.max(-1.1, Math.min(1.1, pos[i].y + vel[i].y));
      e += vel[i].x * vel[i].x + vel[i].y * vel[i].y;
    }
    return e;
  }

  const core = { rng, NAMES, Graph, makeGraph, communities, suggest, hub, initLayout, stepLayout };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GraphSocialCore = core;
})(typeof window !== "undefined" ? window : globalThis);
