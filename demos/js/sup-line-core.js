// Line Fitter core: linear regression maths (MSE, gradient, closed-form OLS) and data generation. Pure logic.
(function (root) {
  // Model: v = w·s(u) + c with s(u) = 3(u − 0.5). Centering + scaling keeps the loss bowl round.
  const s = (u) => 3 * (u - 0.5);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function mse(pts, w, c) {
    if (!pts.length) return 0;
    let t = 0;
    for (const p of pts) t += (w * s(p.u) + c - p.v) ** 2;
    return t / pts.length;
  }
  const score = (m) => Math.round(m * 10000); // "oopsie points" = squared cones
  function grad(pts, w, c) {
    let gw = 0, gc = 0, up = 0, down = 0;
    const n = pts.length || 1;
    for (const p of pts) {
      const r = w * s(p.u) + c - p.v;
      gw += r * s(p.u); gc += r;
      if (r < 0) up++; else down++;
    }
    return { gw: (2 * gw) / n, gc: (2 * gc) / n, up, down };
  }
  function ols(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pts) { const x = s(p.u); sx += x; sy += p.v; sxx += x * x; sxy += x * p.v; }
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-9) return null;
    const w = (n * sxy - sx * sy) / d;
    return { w, c: (sy - w * sx) / n };
  }
  // Human units: cones per °C.
  const slopeTxt = (w) => (w * 3 * 100) / 40;
  // rand(a,b) and randn() are injected so callers control the RNG.
  function makeDays(rand, randn, noise, n = 12) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const u = rand(0.08, 0.95);
      pts.push({ u, v: clamp(0.12 + 0.72 * u + randn() * noise, 0.03, 0.97) });
    }
    return pts;
  }
  const core = { s, mse, score, grad, ols, slopeTxt, makeDays };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.LineCore = core;
})(typeof window !== "undefined" ? window : globalThis);
