// Learning Rate Race: pure logic (runs in the browser and in Node).
(function (root) {
  const W = 6, H = 4; // domain: x in [-3,3], y in [-2,2]
  const G = (x, y, cx, cy, s) => Math.exp(-((x - cx) * (x - cx) + (y - cy) * (y - cy)) / (2 * s * s));

  const LANDS = {
    bumpy: {
      name: "Bumpy bowl", f: (x, y) => 0.08 * (x * x + y * y) - 1.7 * G(x, y, -1.6, -0.5, 0.55) - 1.0 * G(x, y, 1.5, 0.4, 0.5),
      start: [2.5, 1.3], race: { tiny: 0.005, right: 0.1, big: 0.28, giant: 1.2 },
      mom: { lr: 0.1, beta: 0.95 }, adam: 0.12, decay: 0.28, goal: 0.12,
    },
    valley: {
      name: "Narrow valley", f: (x, y) => 0.05 * x * x + 1.5 * (y - 0.5 * Math.sin(x)) * (y - 0.5 * Math.sin(x)),
      start: [-2.6, 1.5], race: { tiny: 0.004, right: 0.25, big: 0.6, giant: 1.2 },
      mom: { lr: 0.08, beta: 0.9 }, adam: 0.12, decay: 0.6, goal: 0.02,
    },
    plateau: {
      name: "Flat plateau", f: (x, y) => 0.01 * (x * x + y * y) - 2 * G(x, y, 0, 0, 0.9),
      start: [-2.6, 1.6], race: { tiny: 0.01, right: 0.1, big: 1.0, giant: 3 },
      mom: { lr: 0.1, beta: 0.9 }, adam: 0.12, decay: 1.0, goal: 0.12,
    },
  };

  const gmin = {};
  function globalMin(id) {
    if (gmin[id] !== undefined) return gmin[id];
    const f = LANDS[id].f; let m = Infinity;
    for (let i = 0; i <= 120; i++) for (let j = 0; j <= 80; j++) m = Math.min(m, f(-3 + i * 0.05, -2 + j * 0.05));
    return (gmin[id] = m);
  }
  function grad(id, x, y, oneD) {
    const f = LANDS[id].f, h = 1e-4;
    const gx = (f(x + h, y) - f(x - h, y)) / (2 * h);
    return [gx, oneD ? 0 : (f(x, y + h) - f(x, y - h)) / (2 * h)];
  }
  // loss = height above the lowest point of the map (never negative)
  const loss = (id, x, y, oneD) => LANDS[id].f(x, oneD ? 0 : y) - globalMin(id);
  // slider -3..0.7 (log10) -> step size
  const lrFromSlider = (s) => Math.pow(10, s);
  function lrWord(lr) {
    return lr < 0.02 ? "tiny" : lr < 0.15 ? "small" : lr < 0.5 ? "just right" : lr < 1 ? "big" : "giant";
  }

  const KINDS = ["gd", "momentum", "decay", "adam"];
  function makeBall(kind, lr, x, y, o) {
    return { kind, lr, beta: (o && o.beta) || 0.9, x, y, vx: 0, vy: 0, m: [0, 0], s: [0, 0], t: 0, dead: false, oneD: !!(o && o.oneD), land: o.land,
      loss: loss(o.land, x, y, !!o.oneD), g: 0, hist: [loss(o.land, x, y, !!o.oneD)], path: [[x, y]], flips: [], zig: [], best: Infinity, lastStep: 0 };
  }
  function stepBall(b) {
    if (b.dead) return b;
    const [gx, gy] = grad(b.land, b.x, b.y, b.oneD);
    let dx, dy;
    b.t++;
    if (b.kind === "gd") { dx = -b.lr * gx; dy = -b.lr * gy; }
    else if (b.kind === "decay") { const l = b.lr / (1 + 0.04 * b.t); dx = -l * gx; dy = -l * gy; }
    else if (b.kind === "momentum") { b.vx = b.beta * b.vx - b.lr * gx; b.vy = b.beta * b.vy - b.lr * gy; dx = b.vx; dy = b.vy; }
    else { // adam-lite (bias-corrected)
      const b1 = 0.9, b2 = 0.99, g = [gx, gy];
      const d = [0, 0];
      for (let i = 0; i < 2; i++) {
        b.m[i] = b1 * b.m[i] + (1 - b1) * g[i];
        b.s[i] = b2 * b.s[i] + (1 - b2) * g[i] * g[i];
        d[i] = -b.lr * (b.m[i] / (1 - Math.pow(b1, b.t))) / (Math.sqrt(b.s[i] / (1 - Math.pow(b2, b.t))) + 1e-8);
      }
      dx = d[0]; dy = d[1];
    }
    const pdx = b.dx || 0, pdy = b.dy || 0;
    b.zig.push(dx * pdx + dy * pdy < 0 ? 1 : 0); if (b.zig.length > 8) b.zig.shift();
    b.dx = dx; b.dy = dy;
    b.x += dx; b.y += b.oneD ? 0 : dy;
    b.lastStep = Math.hypot(dx, dy);
    const L = loss(b.land, b.x, b.y, b.oneD);
    b.flips.push(L > b.loss ? 1 : 0); if (b.flips.length > 10) b.flips.shift();
    b.g = Math.hypot(gx, gy);
    if (!isFinite(L) || Math.abs(b.x) > 5 || Math.abs(b.y) > 4 || L > 1e3) { b.dead = true; b.hist.push(NaN); b.path.push([b.x, b.y]); return b; }
    b.loss = L; b.hist.push(L); b.path.push([b.x, b.y]); b.best = Math.min(b.best, L);
    return b;
  }
  // plain-words state of a ball
  function status(b) {
    if (b.dead) return "flew";
    if (b.t < 2) return "ready";
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    if (b.lastStep < 2e-4 || b.g < 2e-3) return b.loss < LANDS[b.land].goal ? "home" : (b.g < 2e-3 ? "stuck" : "crawl");
    if (b.t >= 6 && sum(b.flips) >= 4 && b.lastStep > 0.05 && b.loss > 0.3) return "bounce";
    if (b.t >= 6 && sum(b.zig) >= 4 && b.lastStep > 0.01) return "zig";
    if (b.lastStep < 0.012) return b.loss < LANDS[b.land].goal ? "home" : "crawl";
    return "roll";
  }
  const stepsToGoal = (b) => { const g = LANDS[b.land].goal; for (let i = 0; i < b.hist.length; i++) if (b.hist[i] < g) return i; return -1; };

  const api = { W, H, LANDS, KINDS, globalMin, grad, loss, lrFromSlider, lrWord, makeBall, stepBall, status, stepsToGoal };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LRCore = api;
})(typeof window !== "undefined" ? window : globalThis);
