// Pizza Shop Planner core: k-means helpers (nearest centroid, trip length, centroid, restarts) and town generators.
// Pure logic; the RNG object R = { rand, randInt, randn, random } is injected so callers (or tests) control randomness.
(function (root) {
  function nearest(x, y, shops) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < shops.length; i++) { const d = (shops[i].x - x) ** 2 + (shops[i].y - y) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  // Average distance (in blocks) from each assigned house to its shop, or null if none assigned.
  function avgTrip(houses, shops, block) {
    let s = 0, n = 0;
    for (const h of houses) if (h.c >= 0) { s += Math.hypot(h.x - shops[h.c].x, h.y - shops[h.c].y); n++; }
    return n ? s / n / block : null;
  }
  // Mean position of the houses assigned to shop i, or null if none.
  function centroid(houses, i) {
    const mine = houses.filter((h) => h.c === i);
    if (!mine.length) return null;
    return { x: mine.reduce((s, h) => s + h.x, 0) / mine.length, y: mine.reduce((s, h) => s + h.y, 0) / mine.length };
  }
  function runKMeans(P, k, restarts, block, R) {
    let best = Infinity;
    for (let r = 0; r < restarts; r++) {
      const C = [{ x: P[R.randInt(0, P.length - 1)].x, y: P[R.randInt(0, P.length - 1)].y }];
      while (C.length < k) {
        const d = P.map((p) => { let m = Infinity; for (const c of C) m = Math.min(m, (p.x - c.x) ** 2 + (p.y - c.y) ** 2); return m; });
        let u = R.random() * d.reduce((a, b) => a + b, 0), i = 0;
        while (u > d[i] && i < d.length - 1) { u -= d[i]; i++; }
        C.push({ x: P[i].x, y: P[i].y });
      }
      const asg = new Array(P.length).fill(0);
      for (let it = 0; it < 40; it++) {
        P.forEach((p, i) => (asg[i] = nearest(p.x, p.y, C)));
        C.forEach((c, j) => {
          let sx = 0, sy = 0, n = 0;
          P.forEach((p, i) => { if (asg[i] === j) { sx += p.x; sy += p.y; n++; } });
          if (n) { c.x = sx / n; c.y = sy / n; }
        });
      }
      best = Math.min(best, P.reduce((a, p, i) => a + Math.hypot(p.x - C[asg[i]].x, p.y - C[asg[i]].y), 0) / P.length / block);
    }
    return best;
  }
  // Town presets: call add(x, y) for every house. W, H = map size.
  function makePresets(W, H, add, R) {
    return {
      blobs() {
        const n = R.randInt(3, 4), centers = [];
        let guard = 0;
        while (centers.length < n && guard++ < 500) {
          const c = [R.rand(90, W - 90), R.rand(80, H - 80)];
          if (centers.every((d) => Math.hypot(d[0] - c[0], d[1] - c[1]) > 170)) centers.push(c);
        }
        centers.forEach((c) => { for (let i = 0; i < 32; i++) add(c[0] + R.randn() * 34, c[1] + R.randn() * 34); });
      },
      random() { const M = 22; for (let i = 0; i < 110; i++) add(R.rand(M, W - M), R.rand(M, H - M)); },
      ring() {
        const cx = W / 2, cy = H / 2;
        for (let i = 0; i < 80; i++) { const a = R.rand(0, Math.PI * 2), r = 180 + R.randn() * 10; add(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r); }
      },
      moons() {
        for (let i = 0; i < 60; i++) { const a = R.rand(0, Math.PI); add(250 + Math.cos(a) * 140 + R.randn() * 10, 260 - Math.sin(a) * 140 + R.randn() * 10); }
        for (let i = 0; i < 60; i++) { const a = R.rand(0, Math.PI); add(390 - Math.cos(a) * 140 + R.randn() * 10, 200 + Math.sin(a) * 140 + R.randn() * 10); }
      },
    };
  }
  const core = { nearest, avgTrip, centroid, runKMeans, makePresets };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.KMeansCore = core;
})(typeof window !== "undefined" ? window : globalThis);
