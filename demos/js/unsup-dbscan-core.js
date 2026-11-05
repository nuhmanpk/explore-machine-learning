// Crowds and Loners core: DBSCAN (with a step-by-step event log), seeded k-means for comparison,
// dataset generators and the adjusted Rand index. Pure logic; points are { x, y, g } where g is the true group (-2 = noise, -1 = unknown).
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const NOISE = -1;

  // ---------- datasets (in a W×H box) ----------
  function makeData(name, seed, W, H) {
    const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    // points are spread evenly along each curve (with jitter) so a curve never has a big accidental gap
    const P = [], M = 16, add = (x, y, grp) => { if (x > M && x < W - M && y > M && y < H - M) P.push({ x, y, g: grp }); };
    const cx = W / 2, cy = H / 2;
    if (name === "moons") {
      const R = Math.min(W, H) * 0.32;
      for (let i = 0; i < 110; i++) { const a = ((i + r()) / 110) * Math.PI; add(cx - R * 0.5 + Math.cos(a) * R + g() * 7, cy + R * 0.25 - Math.sin(a) * R + g() * 7, 0); }
      for (let i = 0; i < 110; i++) { const a = ((i + r()) / 110) * Math.PI; add(cx + R * 0.5 - Math.cos(a) * R + g() * 7, cy - R * 0.25 + Math.sin(a) * R + g() * 7, 1); }
    } else if (name === "rings") {
      const R = Math.min(W, H) * 0.4;
      for (let i = 0; i < 90; i++) { const a = ((i + r()) / 90) * Math.PI * 2, d = R * 0.3 + g() * 5; add(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0); }
      for (let i = 0; i < 260; i++) { const a = ((i + r()) / 260) * Math.PI * 2, d = R + g() * 6; add(cx + Math.cos(a) * d * 1.15, cy + Math.sin(a) * d, 1); }
    } else if (name === "blobs") {
      const C = [[0.25, 0.3, 26], [0.72, 0.28, 32], [0.5, 0.72, 30]];
      C.forEach((c, k) => { for (let i = 0; i < 65; i++) add(c[0] * W + g() * c[2], c[1] * H + g() * c[2], k); });
      for (let i = 0; i < 40; i++) add(M + r() * (W - 2 * M), M + r() * (H - 2 * M), -2);
    } else if (name === "snake") {
      // a wiggly line and a dense ball: different shapes, same crowd rule
      for (let i = 0; i < 150; i++) { const t = (i + r()) / 150; add(60 + t * (W - 260), cy + Math.sin(t * Math.PI * 3) * 80 + g() * 6, 0); }
      for (let i = 0; i < 60; i++) add(W - 100 + g() * 22, cy + g() * 22, 1);
    }
    return P;
  }

  // ---------- neighbours ----------
  // For each point, the indices of all points within eps (including itself).
  function neighbourLists(P, eps) {
    const e2 = eps * eps, out = P.map(() => []);
    for (let i = 0; i < P.length; i++) for (let j = i; j < P.length; j++) {
      const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
      if (dx * dx + dy * dy <= e2) { out[i].push(j); if (j !== i) out[j].push(i); }
    }
    return out;
  }
  function countWithin(P, x, y, eps) { let n = 0; const e2 = eps * eps; for (const p of P) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= e2) n++; return n; }

  // ---------- DBSCAN ----------
  // Returns labels (cluster id or -1 for noise), kind ("core" | "border" | "noise"), number of clusters,
  // and an ordered event log so a page can replay how the crowds were found.
  function dbscan(P, eps, minPts) {
    const nb = neighbourLists(P, eps), n = P.length;
    const label = new Array(n).fill(undefined), visited = new Array(n).fill(false), events = [];
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      visited[i] = true;
      if (nb[i].length < minPts) { label[i] = NOISE; events.push({ t: "noise", i, n: nb[i].length }); continue; }
      label[i] = c; events.push({ t: "seed", i, c, n: nb[i].length });
      const queue = nb[i].filter((j) => j !== i);
      while (queue.length) {
        const j = queue.shift();
        if (label[j] === NOISE) { label[j] = c; events.push({ t: "border", i: j, c, n: nb[j].length, rescued: true }); }
        if (visited[j]) continue;
        visited[j] = true; label[j] = c;
        if (nb[j].length >= minPts) { events.push({ t: "core", i: j, c, n: nb[j].length }); for (const k of nb[j]) if (!visited[k] || label[k] === NOISE) queue.push(k); }
        else events.push({ t: "border", i: j, c, n: nb[j].length });
      }
      c++;
    }
    const kind = label.map((l, i) => (l === NOISE ? "noise" : nb[i].length >= minPts ? "core" : "border"));
    return { labels: label, kind, clusters: c, events, counts: nb.map((a) => a.length) };
  }

  // ---------- k-means (k-means++ start, Lloyd steps), seeded ----------
  function kmeans(P, k, seed, iters) {
    const r = rng(seed || 1), n = P.length;
    if (!n || k < 1) return { labels: [], centres: [] };
    const C = [{ x: P[Math.floor(r() * n)].x, y: P[Math.floor(r() * n)].y }];
    while (C.length < Math.min(k, n)) {
      const d = P.map((p) => Math.min(...C.map((c) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2)));
      let u = r() * d.reduce((a, b) => a + b, 0), i = 0;
      while (u > d[i] && i < n - 1) { u -= d[i]; i++; }
      C.push({ x: P[i].x, y: P[i].y });
    }
    const lab = new Array(n).fill(0);
    for (let it = 0; it < (iters || 50); it++) {
      let moved = false;
      P.forEach((p, i) => { let b = 0, bd = Infinity; C.forEach((c, j) => { const dd = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (dd < bd) { bd = dd; b = j; } }); if (lab[i] !== b) { lab[i] = b; moved = true; } });
      C.forEach((c, j) => { let sx = 0, sy = 0, m = 0; P.forEach((p, i) => { if (lab[i] === j) { sx += p.x; sy += p.y; m++; } }); if (m) { c.x = sx / m; c.y = sy / m; } });
      if (!moved && it) break;
    }
    return { labels: lab, centres: C };
  }

  // ---------- scoring ----------
  // Adjusted Rand index between two labelings (1 = identical grouping, about 0 = random). Each noise point counts as its own group.
  function ari(a, b) {
    const n = a.length; if (n < 2) return 1;
    const key = (l, i) => (l < 0 ? "n" + i : "c" + l);
    const tab = new Map(), ra = new Map(), rb = new Map();
    for (let i = 0; i < n; i++) {
      const x = key(a[i], i), y = key(b[i], i), xy = x + "|" + y;
      tab.set(xy, (tab.get(xy) || 0) + 1); ra.set(x, (ra.get(x) || 0) + 1); rb.set(y, (rb.get(y) || 0) + 1);
    }
    const c2 = (m) => (m * (m - 1)) / 2;
    let sij = 0, sa = 0, sb = 0;
    tab.forEach((v) => (sij += c2(v))); ra.forEach((v) => (sa += c2(v))); rb.forEach((v) => (sb += c2(v)));
    const exp = (sa * sb) / c2(n), max = (sa + sb) / 2;
    return max === exp ? 1 : (sij - exp) / (max - exp);
  }
  // Score against the true groups using only points whose truth is known (g !== -1).
  function scoreVsTruth(P, labels) {
    const idx = P.map((p, i) => i).filter((i) => P[i].g !== -1);
    return ari(idx.map((i) => (P[i].g === -2 ? -1 : P[i].g)), idx.map((i) => labels[i]));
  }
  // Share of the true scattered loners that DBSCAN also calls noise.
  function lonersCaught(P, labels) {
    let t = 0, c = 0;
    P.forEach((p, i) => { if (p.g === -2) { t++; if (labels[i] === NOISE) c++; } });
    return t ? c / t : 0;
  }
  // k-distance helper: distance to the k-th nearest other point, sorted (the classic way to pick eps).
  function kDistances(P, k) {
    return P.map((p) => P.map((q) => Math.hypot(p.x - q.x, p.y - q.y)).sort((a, b) => a - b)[Math.min(k, P.length - 1)]).sort((a, b) => a - b);
  }

  const core = { rng, NOISE, makeData, neighbourLists, countWithin, dbscan, kmeans, ari, scoreVsTruth, lonersCaught, kDistances };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.DBSCANCore = core;
})(typeof window !== "undefined" ? window : globalThis);
