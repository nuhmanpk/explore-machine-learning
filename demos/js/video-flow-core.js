// Spot the Motion core: a tiny procedural "film set" with known true motion, and block-matching optical flow.
// Frames are Float32Array (RGB interleaved, and grayscale). No DOM, so it also runs in Node for testing.
(function (root) {
  const W = 128, H = 96, N = W * H;

  // ---------- textures ----------
  function hash(ix, iy, seed) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1013904223)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  // bumpy texture in 0..1 (several sizes of blobs)
  function tex(x, y, seed) { return 0.5 * vnoise(x / 7, y / 7, seed) + 0.3 * vnoise(x / 3.5, y / 3.5, seed + 1) + 0.2 * vnoise(x / 1.7, y / 1.7, seed + 2); }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mix = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // ---------- the scene ----------
  // Each layer has local (texture) coords u and a motion: toWorld(u, t) and its inverse toLocal(p, t).
  // Frame A is t = 0, frame B is t = 1, and any t in between is the true in-between frame.
  const LAYER_NAMES = ["background", "blank wall", "windmill", "ball", "square"];
  function makeScene(opts) {
    const o = Object.assign({ speed: 1, wall: false, zoom: false, noise: 0, seed: 7 }, opts || {});
    const sp = o.speed, seed = o.seed, cx = W / 2, cy = H / 2, layers = [];
    const zs = (t) => 1 + (o.zoom ? 0.07 * sp : 0) * t;
    layers.push({ id: 0, // background: zooms about the centre if asked
      toLocal: (x, y, t) => { const s = zs(t); return [cx + (x - cx) / s, cy + (y - cy) / s]; },
      toWorld: (u, v, t) => { const s = zs(t); return [cx + (u - cx) * s, cy + (v - cy) * s]; },
      inside: () => true,
      color: (u, v) => { const k = 0.3 + 0.7 * tex(u, v, seed); const sky = v < 44; return mix(sky ? [0.55, 0.75, 1] : [0.45, 0.85, 0.4], k); } });
    if (o.wall) {
      const wx = 4 * sp, x0 = 6, x1 = 58, y0 = 52, y1 = 92;
      layers.push({ id: 1, // a plain wall with no pattern: the aperture problem
        toLocal: (x, y, t) => [x - wx * t, y], toWorld: (u, v, t) => [u + wx * t, v],
        inside: (u, v) => u >= x0 && u < x1 && v >= y0 && v < y1,
        color: (u, v) => (u < x0 + 2 || u >= x1 - 2 || v < y0 + 2 || v >= y1 - 2 ? [0.35, 0.3, 0.3] : [0.93, 0.78, 0.6]) });
    }
    const mx = 98, my = 30, R = 19, om = 0.16 * sp;
    layers.push({ id: 2, // a spinning windmill wheel
      toLocal: (x, y, t) => { const c = Math.cos(-om * t), s = Math.sin(-om * t), dx = x - mx, dy = y - my; return [mx + c * dx - s * dy, my + s * dx + c * dy]; },
      toWorld: (u, v, t) => { const c = Math.cos(om * t), s = Math.sin(om * t), dx = u - mx, dy = v - my; return [mx + c * dx - s * dy, my + s * dx + c * dy]; },
      inside: (u, v) => (u - mx) * (u - mx) + (v - my) * (v - my) < R * R,
      color: (u, v) => {
        const a = Math.atan2(v - my, u - mx), r = Math.hypot(u - mx, v - my), k = 0.55 + 0.45 * tex(u * 1.3, v * 1.3, seed + 5);
        if (r < 3.5) return [0.3, 0.2, 0.2];
        return Math.cos(4 * a) > 0.1 ? mix([1, 0.95, 0.85], k) : mix([0.75, 0.35, 0.3], k);
      } });
    const bx = 74, by = 64, br = 10, bvx = -3 * sp, bvy = 2 * sp;
    layers.push({ id: 3, // a ball rolling down-left
      toLocal: (x, y, t) => [x - bvx * t, y - bvy * t], toWorld: (u, v, t) => [u + bvx * t, v + bvy * t],
      inside: (u, v) => (u - bx) * (u - bx) + (v - by) * (v - by) < br * br,
      color: (u, v) => { const k = 0.5 + 0.5 * tex(u * 1.5, v * 1.5, seed + 9); const st = Math.sin((u - bx + v - by) * 0.9) > 0 ? 1 : 0.7; return mix([1, 0.55, 0.15], k * st); } });
    const sx = 30, sy = 22, ss = 22, svx = 4 * sp, svy = 2 * sp;
    layers.push({ id: 4, // a chequered square sliding right
      toLocal: (x, y, t) => [x - svx * t, y - svy * t], toWorld: (u, v, t) => [u + svx * t, v + svy * t],
      inside: (u, v) => u >= sx && u < sx + ss && v >= sy && v < sy + ss,
      color: (u, v) => { const k = 0.55 + 0.45 * tex(u * 1.4, v * 1.4, seed + 3); const ch = (Math.floor((u - sx) / 5.5) + Math.floor((v - sy) / 5.5)) & 1; return ch ? mix([0.55, 0.4, 1], k) : mix([0.95, 0.95, 1], k); } });
    const front = layers.slice().reverse();
    // which layer is on top at point (x, y) and time t, and where in its texture we are
    function top(x, y, t) {
      for (const L of front) { const u = L.toLocal(x, y, t); if (L.inside(u[0], u[1])) return { L, u }; }
      return null;
    }
    return { opts: o, layers, top, truth: { square: [svx, svy], ball: [bvx, bvy], wall: [o.wall ? 4 * sp : 0, 0], spin: om } };
  }

  const gray = (rgb, out) => { out = out || new Float32Array(N); for (let i = 0; i < N; i++) out[i] = 0.299 * rgb[3 * i] + 0.587 * rgb[3 * i + 1] + 0.114 * rgb[3 * i + 2]; return out; };
  // render the true picture at time t (2×2 supersampled), with the top layer id per pixel
  function render(scene, t, noise, noiseSeed) {
    const rgb = new Float32Array(3 * N), id = new Uint8Array(N), offs = [0.25, 0.75];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let r = 0, g = 0, b = 0;
      for (const oy of offs) for (const ox of offs) { const h = scene.top(x + ox, y + oy, t), c = h.L.color(h.u[0], h.u[1]); r += c[0]; g += c[1]; b += c[2]; }
      rgb[3 * i] = r / 4; rgb[3 * i + 1] = g / 4; rgb[3 * i + 2] = b / 4;
      id[i] = scene.top(x + 0.5, y + 0.5, t).L.id;
    }
    if (noise) {
      const R = rng(noiseSeed || 1);
      for (let i = 0; i < N; i++) {
        const n = noise * Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
        for (let k = 0; k < 3; k++) rgb[3 * i + k] = Math.min(1, Math.max(0, rgb[3 * i + k] + n));
      }
    }
    return { rgb, gray: gray(rgb), id };
  }
  // true motion of every pixel of frame A from time t0 to t1 (default A to B)
  function trueFlow(scene, t0, t1) {
    t0 = t0 || 0; t1 = t1 == null ? 1 : t1;
    const f = new Float32Array(2 * N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5, h = scene.top(px, py, t0), q = h.L.toWorld(h.u[0], h.u[1], t1), i = y * W + x;
      f[2 * i] = q[0] - px; f[2 * i + 1] = q[1] - py;
    }
    return f;
  }
  // frames A and B (with optional camera noise), the true flow and the true middle frame
  function makePair(scene) {
    const nz = scene.opts.noise || 0;
    return { A: render(scene, 0, nz, 11), B: render(scene, 1, nz, 23), flow: trueFlow(scene, 0, 1) };
  }
  // pixels of the frame at time t that cannot be seen in A (1 = just uncovered) or in B (2 = about to be covered)
  function occlusion(scene, t) {
    const m = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const h = scene.top(x + 0.5, y + 0.5, t);
      const pa = h.L.toWorld(h.u[0], h.u[1], 0), pb = h.L.toWorld(h.u[0], h.u[1], 1);
      const ha = scene.top(pa[0], pa[1], 0), hb = scene.top(pb[0], pb[1], 1);
      const outA = pa[0] < 0 || pa[1] < 0 || pa[0] >= W || pa[1] >= H, outB = pb[0] < 0 || pb[1] < 0 || pb[0] >= W || pb[1] >= H;
      if (outA || ha.L !== h.L) m[y * W + x] = 1; else if (outB || hb.L !== h.L) m[y * W + x] = 2;
    }
    return m;
  }

  // ---------- block matching ----------
  const px = (img, x, y) => img[(y < 0 ? 0 : y >= H ? H - 1 : y) * W + (x < 0 ? 0 : x >= W ? W - 1 : x)];
  // mean absolute difference between the block at (x0,y0) in A and the same block shifted by (dx,dy) in B
  function sad(A, B, x0, y0, bs, dx, dy) {
    let s = 0;
    for (let y = y0; y < y0 + bs; y++) for (let x = x0; x < x0 + bs; x++) s += Math.abs(A[y * W + x] - px(B, x + dx, y + dy));
    return s / (bs * bs);
  }
  function grid(bs) { const cols = Math.floor(W / bs), rows = Math.floor(H / bs); return { cols, rows, ox: Math.floor((W - cols * bs) / 2), oy: Math.floor((H - rows * bs) / 2) }; }
  // the whole (2r+1)² table of costs for one block: the "matching cost heatmap"
  function costMap(A, B, bs, r, bx, by) {
    const g = grid(bs), x0 = g.ox + bx * bs, y0 = g.oy + by * bs, n = 2 * r + 1, c = new Float32Array(n * n);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) c[(dy + r) * n + dx + r] = sad(A, B, x0, y0, bs, dx, dy);
    return c;
  }
  const LAMBDA = 0.0015; // tiny nudge towards "no motion" when matches are tied
  // block matching flow from gray frame A to gray frame B
  function blockFlow(A, B, bs, r) {
    const g = grid(bs), nb = g.cols * g.rows, u = new Float32Array(nb), v = new Float32Array(nb), cost = new Float32Array(nb), flat = new Float32Array(nb), n = 2 * r + 1;
    for (let by = 0; by < g.rows; by++) for (let bx = 0; bx < g.cols; bx++) {
      const k = by * g.cols + bx, c = costMap(A, B, bs, r, bx, by);
      let best = 0, bv = Infinity;
      for (let j = 0; j < c.length; j++) { const dx = (j % n) - r, dy = Math.floor(j / n) - r, s = c[j] + LAMBDA * (Math.abs(dx) + Math.abs(dy)); if (s < bv) { bv = s; best = j; } }
      let dx = (best % n) - r, dy = Math.floor(best / n) - r;
      // sub-pixel: fit a parabola through the best cost and its two neighbours
      const fit = (cm, c0, cp) => { const d = cm - 2 * c0 + cp; return d > 1e-9 ? Math.max(-0.5, Math.min(0.5, (cm - cp) / (2 * d))) : 0; };
      const ix = best % n, iy = Math.floor(best / n);
      const ex = ix > 0 && ix < n - 1 ? fit(c[best - 1], c[best], c[best + 1]) : 0;
      const ey = iy > 0 && iy < n - 1 ? fit(c[best - n], c[best], c[best + n]) : 0;
      u[k] = dx + ex; v[k] = dy + ey; cost[k] = c[best];
      // how much pattern the block has (standard deviation of brightness)
      const x0 = g.ox + bx * bs, y0 = g.oy + by * bs; let m = 0, m2 = 0;
      for (let y = y0; y < y0 + bs; y++) for (let x = x0; x < x0 + bs; x++) { const p = A[y * W + x]; m += p; m2 += p * p; }
      m /= bs * bs; flat[k] = Math.sqrt(Math.max(0, m2 / (bs * bs) - m * m));
    }
    return Object.assign({ bs, r, u, v, cost, texture: flat }, g);
  }
  // compare block arrows with the true motion (averaged over each block); errors grouped by the main object in the block
  function evaluate(fl, truth, idA) {
    const by = {}, cnt = {}, err = new Float32Array(fl.u.length), gu = new Float32Array(fl.u.length), gv = new Float32Array(fl.u.length), owner = new Uint8Array(fl.u.length);
    let sum = 0, good = 0;
    for (let j = 0; j < fl.rows; j++) for (let i = 0; i < fl.cols; i++) {
      const k = j * fl.cols + i, x0 = fl.ox + i * fl.bs, y0 = fl.oy + j * fl.bs, votes = [0, 0, 0, 0, 0];
      let tu = 0, tv = 0;
      for (let y = y0; y < y0 + fl.bs; y++) for (let x = x0; x < x0 + fl.bs; x++) { const p = y * W + x; tu += truth[2 * p]; tv += truth[2 * p + 1]; votes[idA[p]]++; }
      tu /= fl.bs * fl.bs; tv /= fl.bs * fl.bs; gu[k] = tu; gv[k] = tv;
      const o = votes.indexOf(Math.max(...votes)); owner[k] = o;
      const e = Math.hypot(fl.u[k] - tu, fl.v[k] - tv); err[k] = e; sum += e; if (e < 1) good++;
      by[o] = (by[o] || 0) + e; cnt[o] = (cnt[o] || 0) + 1;
    }
    const byLayer = {}; for (const o in by) byLayer[LAYER_NAMES[o]] = by[o] / cnt[o];
    return { avg: sum / err.length, good: good / err.length, err, gu, gv, owner, byLayer };
  }

  // ---------- helpers shared with In-Between Frames ----------
  // bilinear sample of a 1-channel (c=1) or RGB (c=3) image, clamped at the edges
  function sample(img, c, x, y, k) {
    x -= 0.5; y -= 0.5;
    if (x < 0) x = 0; else if (x > W - 1) x = W - 1;
    if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const a = img[(y0 * W + x0) * c + k], b = img[(y0 * W + x1) * c + k], d = img[(y1 * W + x0) * c + k], e = img[(y1 * W + x1) * c + k];
    return a + (b - a) * fx + (d - a) * fy + (a - b - d + e) * fx * fy;
  }
  // turn block arrows into one arrow per pixel: each pixel tries the arrows of its own and neighbouring blocks
  // and keeps the one whose little 3×3 patch matches best (this keeps object edges sharp)
  function denseFlow(A, B, fl) {
    const f = new Float32Array(2 * N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const bi = Math.min(fl.cols - 1, Math.max(0, Math.floor((x - fl.ox) / fl.bs))), bj = Math.min(fl.rows - 1, Math.max(0, Math.floor((y - fl.oy) / fl.bs)));
      let best = Infinity, bu = 0, bv = 0;
      for (let j = Math.max(0, bj - 1); j <= Math.min(fl.rows - 1, bj + 1); j++) for (let i = Math.max(0, bi - 1); i <= Math.min(fl.cols - 1, bi + 1); i++) {
        const k = j * fl.cols + i, du = Math.round(fl.u[k]), dv = Math.round(fl.v[k]);
        let s = 0;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) s += Math.abs(px(A, x + xx, y + yy) - px(B, x + xx + du, y + yy + dv));
        s += (i === bi && j === bj ? 0 : 0.01);
        if (s < best) { best = s; bu = fl.u[k]; bv = fl.v[k]; }
      }
      f[2 * (y * W + x)] = bu; f[2 * (y * W + x) + 1] = bv;
    }
    return f;
  }
  // colour-wheel picture of a flow: direction = hue, length = how strong the colour is
  function hsv(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  }
  function flowColor(u, v, maxMag) { const a = Math.atan2(v, u), m = Math.min(1, Math.hypot(u, v) / (maxMag || 6)); return hsv((a / (2 * Math.PI) + 1) % 1, m, 1); }
  function mse(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s / a.length; }

  const core = { W, H, N, LAYER_NAMES, tex, rng, makeScene, render, trueFlow, makePair, occlusion, gray, sad, grid, costMap, blockFlow, evaluate, sample, denseFlow, flowColor, hsv, mse };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.FlowCore = core;
})(typeof window !== "undefined" ? window : globalThis);
