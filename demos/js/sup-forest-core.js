// Twenty Questions Trees core — data generators, CART decision tree (gini, grown split by split) and random-forest helpers.
// No DOM; runs in Node too. Pass `rng` ({ rand(a,b), randn(), randInt(a,b) } — ML works as-is, or makeRng(seed)) for determinism.
(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function makeRng(seed) {
    let a = seed >>> 0, spare = null;
    const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rand = (lo = 0, hi = 1) => lo + next() * (hi - lo);
    const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
    function randn() {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0;
      while (u === 0) u = next();
      const v = next(), r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    }
    return { rand, randn, randInt };
  }
  const defaultRng = (() => {
    const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
    return { rand, randInt: (a, b) => Math.floor(rand(a, b + 1)), randn() { let u = 0; while (u === 0) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); } };
  })();

  // ---------- data ----------
  const GEN = {
    blobs(rng = defaultRng) {
      const C = [[0.25, 0.7], [0.72, 0.72], [0.5, 0.25]];
      const c = rng.randInt(0, 2);
      return { x: C[c][0] + rng.randn() * 0.09, y: C[c][1] + rng.randn() * 0.09, c };
    },
    checks(rng = defaultRng) {
      const x = rng.rand(), y = rng.rand();
      const c = (Math.floor(x * 3) + Math.floor(y * 3)) % 2 === 0 ? 0 : 1;
      return { x, y, c: rng.rand() < 0.06 ? 1 - c : c };
    },
    messy(rng = defaultRng) {
      const C = [[0.3, 0.65], [0.68, 0.6], [0.5, 0.28]];
      const c = rng.randInt(0, 2);
      return { x: C[c][0] + rng.randn() * 0.13, y: C[c][1] + rng.randn() * 0.13, c };
    },
  };
  const clampP = (p) => ({ x: clamp(p.x, 0.02, 0.98), y: clamp(p.y, 0.02, 0.98), c: p.c });

  // ---------- tree ----------
  const gini = (cnt, n) => (n ? 1 - cnt.reduce((s, c) => s + (c / n) ** 2, 0) : 0);
  function counts(pts, idx) { const c = [0, 0, 0]; idx.forEach((i) => c[pts[i].c]++); return c; }
  function makeLeaf(pts, idx, depth, box) {
    const cnt = counts(pts, idx);
    return { idx, depth, box, cnt, n: idx.length, g: gini(cnt, idx.length), leaf: true };
  }
  function bestSplit(pts, node, randomAxis, rng = defaultRng) {
    const axes = randomAxis ? [rng.rand() < 0.5 ? "x" : "y"] : ["x", "y"];
    let best = null;
    for (const ax of axes) {
      const s = node.idx.slice().sort((a, b) => pts[a][ax] - pts[b][ax]);
      const L = [0, 0, 0], R = node.cnt.slice();
      for (let j = 0; j < s.length - 1; j++) {
        const p = pts[s[j]]; L[p.c]++; R[p.c]--;
        const v1 = p[ax], v2 = pts[s[j + 1]][ax];
        if (v2 - v1 < 1e-9) continue;
        const nl = j + 1, nr = s.length - nl;
        const g = (nl * gini(L, nl) + nr * gini(R, nr)) / s.length;
        if (!best || g < best.g) best = { g, ax, t: (v1 + v2) / 2, li: s.slice(0, nl), ri: s.slice(nl), gl: gini(L, nl), gr: gini(R, nr) };
      }
    }
    return best && best.g < node.g - 1e-9 ? best : null;
  }
  function leaves(n, out = []) { if (n.leaf) out.push(n); else { leaves(n.l, out); leaves(n.r, out); } return out; }
  // Splits the leaf with the biggest gain. Returns the node that was split, or null when nothing is left to split.
  function growOne(T, pts, maxDepth, randomAxis, rng = defaultRng) {
    let pick = null;
    for (const lf of leaves(T)) {
      if (lf.depth >= maxDepth || lf.g === 0 || lf.n < 2) continue;
      if (lf.cand === undefined) lf.cand = bestSplit(pts, lf, randomAxis, rng);
      if (!lf.cand) continue;
      const gain = lf.n * (lf.g - lf.cand.g);
      if (!pick || gain > pick.gain) pick = { lf, gain };
    }
    if (!pick) return null;
    const lf = pick.lf, s = lf.cand;
    const [x0, y0, x1, y1] = lf.box;
    const bl = s.ax === "x" ? [x0, y0, s.t, y1] : [x0, y0, x1, s.t];
    const br = s.ax === "x" ? [s.t, y0, x1, y1] : [x0, s.t, x1, y1];
    Object.assign(lf, { leaf: false, ax: s.ax, t: s.t, l: makeLeaf(pts, s.li, lf.depth + 1, bl), r: makeLeaf(pts, s.ri, lf.depth + 1, br) });
    return lf;
  }
  function newTree(pts, idx) { return makeLeaf(pts, idx || pts.map((_, i) => i), 0, [0, 0, 1, 1]); }
  function leafAt(T, x, y) { let n = T; while (!n.leaf) n = (n.ax === "x" ? x : y) < n.t ? n.l : n.r; return n; }
  function probs(T, x, y) { const lf = leafAt(T, x, y); return lf.n ? lf.cnt.map((c) => c / lf.n) : [1 / 3, 1 / 3, 1 / 3]; }
  const argmax = (a) => a.indexOf(Math.max(...a));
  function forestProbs(F, x, y) {
    const s = [0, 0, 0];
    F.forEach((t) => probs(t.T, x, y).forEach((v, i) => (s[i] += v)));
    return s.map((v) => v / (F.length || 1));
  }
  function acc(pred, set) {
    if (!pred || !set.length) return null;
    return set.filter((p) => argmax(pred(p.x, p.y)) === p.c).length / set.length;
  }
  function cloneTree(n) { return n.leaf ? { ...n, cand: undefined } : { ...n, l: cloneTree(n.l), r: cloneTree(n.r) }; }

  // One random-forest member: a bootstrap sample of pts and a tree grown fully with random axes.
  function plantTree(pts, maxDepth, rng = defaultRng) {
    const n = pts.length;
    const sample = Array.from({ length: n }, () => pts[rng.randInt(0, n - 1)]);
    const T = newTree(sample);
    while (growOne(T, sample, maxDepth, true, rng));
    return { T, sample };
  }

  const api = { makeRng, GEN, clampP, gini, counts, makeLeaf, bestSplit, leaves, growOne, newTree, leafAt, probs, argmax, forestProbs, acc, cloneTree, plantTree };
  root.ForestCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
