// Draw the Box: pure logic (runs in Node too). Toy-table scenes, IoU, NMS and a tiny grid detector
// (YOLO-lite: 8x8 cells, each predicts "object here?", a box and a shape) trained by Adam.
(function (root) {
  const S = 64, G = 8, CELL = S / G, NCLS = 3, NOUT = 5 + NCLS, WMAX = 32;
  const CLASSES = ["circle", "square", "triangle"];
  const COLORS = [
    { name: "red", rgb: [0.92, 0.2, 0.2] }, { name: "orange", rgb: [0.98, 0.6, 0.1] },
    { name: "blue", rgb: [0.2, 0.4, 0.95] }, { name: "green", rgb: [0.15, 0.7, 0.3] },
    { name: "purple", rgb: [0.6, 0.25, 0.85] }, { name: "pink", rgb: [0.95, 0.4, 0.7] },
  ];

  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2831853 * r()); }

  // ---- boxes: {x1,y1,x2,y2} in pixels ----
  function inter(a, b) { const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1); return w > 0 && h > 0 ? w * h : 0; }
  const area = (a) => Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  function iou(a, b) { const i = inter(a, b), u = area(a) + area(b) - i; return u > 0 ? i / u : 0; }
  function normBox(a, b) { return { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }; }

  // ---- scenes ----
  // opts: small (bool), overlap (bool), clutter (bool)
  function makeScene(seed, opts) {
    opts = opts || {};
    const r = seeded(seed), n = 1 + Math.floor(r() * 4), objs = [];
    const lo = opts.small ? 7 : 12, hi = opts.small ? 12 : 24;
    const maxOv = opts.overlap ? 0.45 : 0.08, minOv = opts.overlap ? 0.12 : 0;
    for (let tries = 0; objs.length < n && tries < 200; tries++) {
      const w = lo + r() * (hi - lo), h = Math.max(lo, Math.min(hi, w * (0.8 + r() * 0.4)));
      const x1 = 1 + r() * (S - 2 - w), y1 = 1 + r() * (S - 2 - h);
      const o = { x1, y1, x2: x1 + w, y2: y1 + h, cls: Math.floor(r() * NCLS), color: Math.floor(r() * COLORS.length) };
      let ok = true, ov = 0;
      for (const p of objs) { const v = iou(o, p); ov = Math.max(ov, v); if (v > maxOv) ok = false; }
      if (opts.overlap && objs.length && ov < minOv && tries < 150) ok = false;
      if (ok) objs.push(o);
    }
    const sd = 0.03 + (opts.clutter ? 0.11 : 0);
    const px = new Float32Array(S * S * 3), base = 0.55 + (r() - 0.5) * 0.2;
    for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) px[i * 3 + c] = base + gauss(r) * sd;
    if (opts.clutter) { // little coloured specks that look a bit like tiny objects
      const k = 8 + Math.floor(r() * 6);
      for (let q = 0; q < k; q++) {
        const cx = Math.floor(r() * S), cy = Math.floor(r() * S), col = COLORS[Math.floor(r() * COLORS.length)].rgb, rad = 1 + r() * 1.6;
        for (let y = Math.max(0, cy - 3); y < Math.min(S, cy + 4); y++) for (let x = Math.max(0, cx - 3); x < Math.min(S, cx + 4); x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) for (let c = 0; c < 3; c++) px[(y * S + x) * 3 + c] = col[c] * 0.75 + 0.1 + gauss(r) * 0.03;
      }
    }
    for (const o of objs) {
      const col = COLORS[o.color].rgb, w = o.x2 - o.x1, h = o.y2 - o.y1, cx = (o.x1 + o.x2) / 2, cy = (o.y1 + o.y2) / 2;
      for (let y = Math.floor(o.y1); y < Math.ceil(o.y2); y++) for (let x = Math.floor(o.x1); x < Math.ceil(o.x2); x++) {
        const fx = x + 0.5, fy = y + 0.5; let inside;
        if (o.cls === 0) inside = ((fx - cx) / (w / 2)) ** 2 + ((fy - cy) / (h / 2)) ** 2 <= 1;
        else if (o.cls === 1) inside = fx >= o.x1 && fx <= o.x2 && fy >= o.y1 && fy <= o.y2;
        else inside = fy >= o.y1 && fy <= o.y2 && Math.abs(fx - cx) <= ((fy - o.y1) / h) * (w / 2);
        if (inside && x >= 0 && y >= 0 && x < S && y < S) for (let c = 0; c < 3; c++) px[(y * S + x) * 3 + c] = col[c] + gauss(r) * 0.03;
      }
    }
    for (let i = 0; i < px.length; i++) px[i] = Math.min(1, Math.max(0, px[i]));
    return { px, objs, seed, opts };
  }

  // ---- features: per cell, a fine 12x12 look (24px) plus a coarse 5x5 look (40px) at "colourfulness" ----
  const NF = 144 + 25;
  function satMap(px) { const m = new Float32Array(S * S); for (let i = 0; i < S * S; i++) { const a = px[i * 3], b = px[i * 3 + 1], c = px[i * 3 + 2]; m[i] = Math.max(a, b, c) - Math.min(a, b, c); } return m; }
  function features(scene) {
    if (scene.feat) return scene.feat;
    const m = satMap(scene.px), F = new Float32Array(G * G * NF);
    const at = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : m[y * S + x]);
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      let o = (gy * G + gx) * NF;
      const x0 = gx * CELL - 8, y0 = gy * CELL - 8;
      for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
        F[o++] = (at(x0 + 2 * i, y0 + 2 * j) + at(x0 + 2 * i + 1, y0 + 2 * j) + at(x0 + 2 * i, y0 + 2 * j + 1) + at(x0 + 2 * i + 1, y0 + 2 * j + 1)) / 4 * 2 - 0.2;
      }
      const X0 = gx * CELL - 16, Y0 = gy * CELL - 16;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
        let s = 0; for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) s += at(X0 + 8 * i + a, Y0 + 8 * j + b);
        F[o++] = s / 64 * 2 - 0.2;
      }
    }
    scene.feat = F; return F;
  }

  // ---- targets: cells near an object's centre are "positive" (so big objects get several guesses) ----
  function targets(scene) {
    const T = new Array(G * G).fill(null);
    for (let k = 0; k < scene.objs.length; k++) {
      const o = scene.objs[k], cx = (o.x1 + o.x2) / 2, cy = (o.y1 + o.y2) / 2, w = o.x2 - o.x1, h = o.y2 - o.y1;
      const reach = Math.max(CELL * 0.5, 0.3 * Math.min(w, h)), hx = Math.min(G - 1, Math.floor(cx / CELL)), hy = Math.min(G - 1, Math.floor(cy / CELL));
      for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
        const ccx = (gx + 0.5) * CELL, ccy = (gy + 0.5) * CELL, d = Math.max(Math.abs(ccx - cx), Math.abs(ccy - cy));
        const home = gx === hx && gy === hy;
        if (!home && d > reach) continue;
        const prev = T[gy * G + gx];
        if (prev && !(home && prev.d > 0) && prev.d <= d) continue;
        T[gy * G + gx] = { d: home ? 0 : d, dx: (cx - ccx) / 16, dy: (cy - ccy) / 16, w: w / WMAX, h: h / WMAX, cls: o.cls };
      }
    }
    return T;
  }

  // ---- the network: 169 -> H (tanh) -> 8 per cell, shared by every cell. Adam. ----
  function makeNet(seed, H) {
    H = H || 40; const r = seeded(seed);
    const net = { H, W1: new Float32Array(NF * H), b1: new Float32Array(H), W2: new Float32Array(H * NOUT), b2: new Float32Array(NOUT), t: 0, steps: 0 };
    for (let i = 0; i < net.W1.length; i++) net.W1[i] = gauss(r) * Math.sqrt(1 / NF) * 1.2;
    for (let i = 0; i < net.W2.length; i++) net.W2[i] = gauss(r) * 0.15;
    net.b2[0] = -3; net.b2[3] = -0.2; net.b2[4] = -0.2;
    const P = [net.W1, net.b1, net.W2, net.b2];
    net.m = P.map((a) => new Float32Array(a.length)); net.v = P.map((a) => new Float32Array(a.length));
    return net;
  }
  const sig = (x) => 1 / (1 + Math.exp(-x));
  function forward(net, F, cells) { // returns {hid, out}
    const H = net.H, hid = new Float32Array(cells * H), out = new Float32Array(cells * NOUT);
    for (let c = 0; c < cells; c++) {
      const f = c * NF;
      for (let j = 0; j < H; j++) { let s = net.b1[j]; for (let i = 0; i < NF; i++) s += F[f + i] * net.W1[i * H + j]; hid[c * H + j] = Math.tanh(s); }
      for (let k = 0; k < NOUT; k++) { let s = net.b2[k]; for (let j = 0; j < H; j++) s += hid[c * H + j] * net.W2[j * NOUT + k]; out[c * NOUT + k] = s; }
    }
    return { hid, out };
  }
  // one Adam step on a batch of scenes; returns mean loss
  function trainStep(net, scenes, lr) {
    lr = lr || 0.004; const H = net.H;
    const gW1 = new Float32Array(net.W1.length), gb1 = new Float32Array(H), gW2 = new Float32Array(net.W2.length), gb2 = new Float32Array(NOUT);
    let loss = 0; const norm = scenes.length * G * G;
    for (const sc of scenes) {
      const F = features(sc), T = targets(sc), { hid, out } = forward(net, F, G * G);
      for (let c = 0; c < G * G; c++) {
        const o = c * NOUT, t = T[c], d = new Float32Array(NOUT);
        const p = sig(out[o]), wt = t ? 2 : 1, tt = t ? 1 : 0;
        loss += -wt * (tt ? Math.log(p + 1e-7) : Math.log(1 - p + 1e-7)); d[0] = wt * (p - tt);
        if (t) {
          const BW = 4;
          d[1] = BW * (out[o + 1] - t.dx) * 2; d[2] = BW * (out[o + 2] - t.dy) * 2;
          const sw = sig(out[o + 3]), sh = sig(out[o + 4]);
          d[3] = BW * 2 * (sw - t.w) * sw * (1 - sw); d[4] = BW * 2 * (sh - t.h) * sh * (1 - sh);
          loss += BW * ((out[o + 1] - t.dx) ** 2 + (out[o + 2] - t.dy) ** 2 + (sw - t.w) ** 2 + (sh - t.h) ** 2);
          let mx = -1e9; for (let k = 0; k < NCLS; k++) mx = Math.max(mx, out[o + 5 + k]);
          let z = 0; const e = []; for (let k = 0; k < NCLS; k++) { e[k] = Math.exp(out[o + 5 + k] - mx); z += e[k]; }
          for (let k = 0; k < NCLS; k++) d[5 + k] = e[k] / z - (k === t.cls ? 1 : 0);
          loss += -Math.log(e[t.cls] / z + 1e-7);
        }
        const f = c * NF, dh = new Float32Array(H);
        for (let k = 0; k < NOUT; k++) { if (!d[k]) continue; gb2[k] += d[k]; for (let j = 0; j < H; j++) { gW2[j * NOUT + k] += hid[c * H + j] * d[k]; dh[j] += net.W2[j * NOUT + k] * d[k]; } }
        for (let j = 0; j < H; j++) {
          const g = dh[j] * (1 - hid[c * H + j] ** 2); if (!g) continue; gb1[j] += g;
          for (let i = 0; i < NF; i++) gW1[i * H + j] += F[f + i] * g;
        }
      }
    }
    net.t++; net.steps++;
    const P = [net.W1, net.b1, net.W2, net.b2], Gd = [gW1, gb1, gW2, gb2], b1 = 0.9, b2 = 0.999;
    const c1 = 1 - Math.pow(b1, net.t), c2 = 1 - Math.pow(b2, net.t);
    for (let q = 0; q < 4; q++) { const p = P[q], g = Gd[q], m = net.m[q], v = net.v[q];
      for (let i = 0; i < p.length; i++) { const gi = g[i] / norm; m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi; p[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8); } }
    return loss / norm;
  }

  // ---- detection ----
  // every cell's raw guess (before any threshold)
  function cellGuesses(net, scene) {
    const { out } = forward(net, features(scene), G * G), res = [];
    for (let c = 0; c < G * G; c++) {
      const o = c * NOUT, gx = c % G, gy = Math.floor(c / G), ccx = (gx + 0.5) * CELL, ccy = (gy + 0.5) * CELL;
      const cx = ccx + out[o + 1] * 16, cy = ccy + out[o + 2] * 16, w = sig(out[o + 3]) * WMAX, h = sig(out[o + 4]) * WMAX;
      let mx = -1e9; for (let k = 0; k < NCLS; k++) mx = Math.max(mx, out[o + 5 + k]);
      const e = [0, 1, 2].map((k) => Math.exp(out[o + 5 + k] - mx)), z = e[0] + e[1] + e[2];
      let cls = 0; for (let k = 1; k < NCLS; k++) if (e[k] > e[cls]) cls = k;
      res.push({ cell: c, gx, gy, conf: sig(out[o]), cls, clsP: e[cls] / z, x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 });
    }
    return res;
  }
  function nms(boxes, thr) {
    const s = boxes.slice().sort((a, b) => b.conf - a.conf), keep = [];
    for (const b of s) if (keep.every((k) => iou(k, b) <= (thr || 0.4))) keep.push(b);
    return keep;
  }
  function detect(guesses, conf, useNms) {
    const b = guesses.filter((g) => g.conf >= conf);
    return useNms ? nms(b) : b.sort((a, c) => c.conf - a.conf);
  }
  // score one scene: per-object best IoU (0 if missed), found count, ghosts (predictions matching nothing, one-to-one)
  function score(scene, preds) {
    const ious = scene.objs.map((o) => preds.reduce((m, p) => Math.max(m, iou(o, p)), 0));
    const used = new Set(); let found = 0;
    const pairs = [];
    scene.objs.forEach((o, i) => preds.forEach((p, j) => { const v = iou(o, p); if (v >= 0.5) pairs.push([v, i, j]); }));
    pairs.sort((a, b) => b[0] - a[0]);
    const oi = new Set();
    for (const [, i, j] of pairs) if (!oi.has(i) && !used.has(j)) { oi.add(i); used.add(j); found++; }
    return { ious, found, total: scene.objs.length, ghosts: preds.length - used.size };
  }
  function evaluate(net, scenes, conf, useNms) {
    let sum = 0, n = 0, found = 0, ghosts = 0;
    for (const sc of scenes) { const s = score(sc, detect(cellGuesses(net, sc), conf, useNms)); s.ious.forEach((v) => { sum += v; n++; }); found += s.found; ghosts += s.ghosts; }
    return { miou: n ? sum / n : 0, recall: n ? found / n : 0, ghosts, ghostsPer: ghosts / scenes.length, precision: found + ghosts ? found / (found + ghosts) : 1 };
  }

  const api = { S, G, CELL, CLASSES, COLORS, seeded, iou, inter, area, normBox, makeScene, features, targets, makeNet, trainStep, cellGuesses, nms, detect, score, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DetectCore = api;
})(typeof window !== "undefined" ? window : globalThis);
