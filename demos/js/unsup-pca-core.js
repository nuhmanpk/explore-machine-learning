// Squash to See core: 3-D dot clouds, covariance, eigen decomposition (Jacobi), power iteration, projection. Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => Math.sqrt(dot(a, a));
  const unit = (a) => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  // rotate a vector about z (yaw) then x (roll) then y (pitch), angles in radians
  function rotZXY(v, az, ax, ay) {
    let [x, y, z] = v;
    [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
    [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
    [x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
    return [x, y, z];
  }
  // direction from "turn" (around the up axis) and "tilt" (up from the floor), in degrees
  function dirFromAngles(turnDeg, tiltDeg) {
    const t = (turnDeg * Math.PI) / 180, p = (tiltDeg * Math.PI) / 180;
    return [Math.cos(p) * Math.cos(t), Math.cos(p) * Math.sin(t), Math.sin(p)];
  }
  // inverse of dirFromAngles, folding the sign so turn is in [0, 180)
  function anglesFromDir(d) {
    let v = unit(d), turn = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    if (turn < 0 || turn >= 180) { v = [-v[0], -v[1], -v[2]]; turn = (Math.atan2(v[1], v[0]) * 180) / Math.PI; }
    if (turn >= 180 || turn < 0) turn = 0;
    return { turn, tilt: (Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180) / Math.PI };
  }

  // ---------- datasets ----------
  // Each returns { name, axes, points: [[x,y,z]], tone: [0..1 or class], classes?, longAxis? } centred near the origin.
  const SETS = {
    pancake: { label: "Tilted pancake", axes: ["x", "y", "z"] },
    fruit: { label: "Fruit sizes", axes: ["length", "width", "weight"], classes: ["grape", "apple", "banana"] },
    pencil: { label: "Pencil", axes: ["x", "y", "z"] },
    ball: { label: "Ball", axes: ["x", "y", "z"] },
  };
  function makeData(name, seed, n) {
    const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const pts = [], tone = [];
    let longAxis = null, normal = null;
    if (name === "pancake" || name === "pencil") {
      const sd = name === "pancake" ? [2.2, 1.2, 0.16] : [2.6, 0.28, 0.28];
      const az = name === "pancake" ? 0.6 : -0.9, ax = name === "pancake" ? 0.75 : 0.4, ay = name === "pancake" ? 0.35 : -0.6;
      const N = n || 160;
      for (let i = 0; i < N; i++) {
        const u = g();
        pts.push(rotZXY([u * sd[0], g() * sd[1], g() * sd[2]], az, ax, ay));
        tone.push(Math.max(0, Math.min(1, 0.5 + u / 4)));
      }
      longAxis = rotZXY([1, 0, 0], az, ax, ay); normal = rotZXY([0, 0, 1], az, ax, ay);
    } else if (name === "fruit") {
      // three kinds of fruit. Bigger fruit is longer, wider and heavier (so the measurements move together),
      // and bananas are long but thin (a second, smaller pattern).
      const kinds = [[-1.6, 0], [0.15, -0.45], [0.55, 1.25]], N = n || 150;
      for (let i = 0; i < N; i++) {
        const k = i % 3, s = kinds[k][0] + g() * 0.32, sh = kinds[k][1] + g() * 0.18;
        pts.push([s + 0.8 * sh + g() * 0.15, 0.85 * s - 0.6 * sh + g() * 0.15, 1.1 * s + 0.1 * sh + g() * 0.2]);
        tone.push(k);
      }
    } else {
      const N = n || 220;
      for (let i = 0; i < N; i++) { const p = [g(), g(), g()]; pts.push(p.map((v) => v * 1.3)); tone.push(Math.max(0, Math.min(1, 0.5 + p[2] / 4))); }
    }
    const m = mean(pts);
    return { name, label: SETS[name].label, axes: SETS[name].axes, classes: SETS[name].classes || null, points: pts.map((p) => [p[0] - m[0], p[1] - m[1], p[2] - m[2]]), tone, longAxis, normal };
  }

  // ---------- statistics ----------
  function mean(P) { const m = [0, 0, 0]; P.forEach((p) => { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }); return m.map((v) => v / (P.length || 1)); }
  function covariance(P) {
    const m = mean(P), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], n = Math.max(1, P.length - 1);
    P.forEach((p) => { const d = [p[0] - m[0], p[1] - m[1], p[2] - m[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] /= n;
    return C;
  }
  const trace = (C) => C[0][0] + C[1][1] + C[2][2];
  const matVec = (C, v) => [dot(C[0], v), dot(C[1], v), dot(C[2], v)];
  // variance of the 1-D shadow cast onto direction d: dᵀCd / dᵀd
  const varianceAlong = (C, d) => { const u = unit(d); return dot(u, matVec(C, u)); };

  // Cyclic Jacobi eigen decomposition of a symmetric matrix. Returns eigenvalues (descending) and unit eigenvectors.
  function eigenSym(M) {
    const n = M.length, A = M.map((r) => r.slice()), V = M.map((_, i) => M.map((__, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-20) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    const pairs = A.map((r, i) => ({ value: r[i], vector: V.map((row) => row[i]) }));
    pairs.sort((a, b) => b.value - a.value);
    return { values: pairs.map((p) => Math.max(0, p.value)), vectors: pairs.map((p) => p.vector) };
  }

  // Power iteration from v0: v ← Cv / |Cv|. Returns every step so the page can animate Robo's search.
  function powerSteps(C, v0, steps) {
    let v = unit(v0 && norm(v0) > 1e-9 ? v0 : [1, 1, 1]);
    const out = [v];
    for (let i = 0; i < (steps || 10); i++) { v = unit(matVec(C, v)); out.push(v); }
    return out;
  }
  // Full PCA: components sorted by variance, signs chosen so each points mostly "forward" (largest entry positive).
  function pca(P) {
    const C = covariance(P), e = eigenSym(C), tot = trace(C) || 1;
    const comps = e.vectors.map((v) => { let i = 0; for (let k = 1; k < 3; k++) if (Math.abs(v[k]) > Math.abs(v[i])) i = k; return v[i] < 0 ? v.map((x) => -x) : v; });
    return { C, total: tot, values: e.values, vectors: comps, explained: e.values.map((v) => v / tot) };
  }
  const project = (P, d) => { const u = unit(d); return P.map((p) => dot(p, u)); };
  // coordinates in the first k components (the "flat picture")
  const toComponents = (P, comps, k) => P.map((p) => comps.slice(0, k).map((c) => dot(p, c)));
  // squash amount t (0..1) along direction n: slides each dot towards the plane at right angles to n
  const squash = (p, n, t) => { const s = dot(p, n) * t; return [p[0] - s * n[0], p[1] - s * n[1], p[2] - s * n[2]]; };
  // mean squared distance lost when keeping only the first k components
  function reconstructionError(P, comps, k) {
    let e = 0;
    P.forEach((p) => { let q = [0, 0, 0]; for (let i = 0; i < k; i++) { const s = dot(p, comps[i]); q = [q[0] + s * comps[i][0], q[1] + s * comps[i][1], q[2] + s * comps[i][2]]; } e += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; });
    return e / (P.length || 1);
  }
  // camera: yaw about the up axis, then pitch. Returns screen x, screen y (up is negative), depth.
  function view(p, yaw, pitch) {
    const x1 = p[0] * Math.cos(yaw) - p[1] * Math.sin(yaw), y1 = p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw), z1 = p[2];
    const y2 = y1 * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = y1 * Math.sin(pitch) + z1 * Math.cos(pitch);
    return { x: x1, y: -z2, depth: y2 };
  }

  const core = { rng, dot, norm, unit, rotZXY, dirFromAngles, anglesFromDir, SETS, makeData, mean, covariance, trace, matVec, varianceAlong, eigenSym, powerSteps, pca, project, toComponents, squash, reconstructionError, view };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.PCACore = core;
})(typeof window !== "undefined" ? window : globalThis);
