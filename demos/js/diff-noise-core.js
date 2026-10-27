// Fuzz & Un-Fuzz core: DDPM forward noising (cosine schedule), Bayes-optimal denoiser over a "picture book", DDIM/DDPM step.
// Pure logic; runs in Node and the browser.
(function (root) {
  const S = 32, N = S * S * 3, T = 100;

  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- noise schedule ----------
  const abar = new Float64Array(T + 1);
  for (let t = 0; t <= T; t++) {
    const s = 0.008;
    const f = (u) => Math.cos(((u + s) / (1 + s)) * Math.PI / 2) ** 2;
    abar[t] = Math.max(f(t / T) / f(0), 1e-6);
  }
  abar[0] = 1;

  // Fixed noise so scrubbing the slider is smooth.
  const rng = seeded(7);
  function gauss(r) {
    let u = 0; while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  const EPS = new Float32Array(N);
  for (let i = 0; i < N; i++) EPS[i] = gauss(rng);

  // ---------- pictures ----------
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const toV = (c) => c / 127.5 - 1;
  function blank() { const a = new Float32Array(N); a.fill(1); return a; }
  function setPx(img, x, y, rgb) {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 3;
    img[i] = toV(rgb[0]); img[i + 1] = toV(rgb[1]); img[i + 2] = toV(rgb[2]);
  }
  function paint(fn) {
    const img = blank();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = fn(x + 0.5, y + 0.5); if (c) setPx(img, x, y, hex(c)); }
    return img;
  }
  function inPoly(x, y, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const d2 = (x, y, cx, cy) => (x - cx) ** 2 + (y - cy) ** 2;
  const starPts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 5.5 : 14, a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [16 + r * Math.cos(a), 17 + r * Math.sin(a)];
  });
  const PRESETS = [
    { name: "Heart", icon: "heart", img: paint((x, y) => {
      const u = (x - 16) / 12, v = -(y - 14.5) / 12;
      return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0 ? "#ff3b5c" : null;
    }) },
    { name: "Smiley", icon: "image", img: paint((x, y) => {
      const r = d2(x, y, 16, 16);
      if (r > 14 * 14) return null;
      if (r > 12.6 * 12.6) return "#3a2a00";
      if (d2(x, y, 11.5, 12.5) < 4.5 || d2(x, y, 20.5, 12.5) < 4.5) return "#3a2a00";
      const m = Math.sqrt(d2(x, y, 16, 15));
      if (y > 18 && m > 6.5 && m < 8.6) return "#3a2a00";
      return "#ffd23f";
    }) },
    { name: "Star", icon: "star", img: paint((x, y) => (inPoly(x, y, starPts) ? "#ffb703" : null)) },
    { name: "House", icon: "image", img: paint((x, y) => {
      if (y > 28) return "#4caf50";
      if (inPoly(x, y, [[4, 15], [16, 4], [28, 15]])) return "#e63946";
      if (x > 13 && x < 19 && y > 20 && y <= 28) return "#6d4c41";
      if (x > 7 && x < 12 && y > 18 && y < 23) return "#4dabf7";
      if (x > 6 && x < 26 && y >= 15 && y <= 28) return "#f4a261";
      return null;
    }) },
    { name: "Cat", icon: "image", img: paint((x, y) => {
      const head = d2(x, y, 16, 18) < 11.5 * 11.5;
      const ear = inPoly(x, y, [[5, 13], [7, 3], [13, 9]]) || inPoly(x, y, [[27, 13], [25, 3], [19, 9]]);
      if (!head && !ear) return null;
      if (d2(x, y, 12, 16) < 3.2 || d2(x, y, 20, 16) < 3.2) return "#2b9348";
      if (inPoly(x, y, [[14.5, 20], [17.5, 20], [16, 22]])) return "#ff8fab";
      if (Math.abs(y - 23 - (x < 16 ? (16 - x) * 0.15 : (x - 16) * 0.15)) < 0.6 && Math.abs(x - 16) > 4) return "#4a2c00";
      return "#ff9f43";
    }) },
  ];

  function noisy(x0, t, eps = EPS) {
    const a = Math.sqrt(abar[t]), b = Math.sqrt(1 - abar[t]);
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = a * x0[i] + b * eps[i];
    return out;
  }
  const clip = (img) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = Math.max(-1, Math.min(1, img[i])); return o; };

  // Bayes-optimal denoiser: E[x0 | xt] = sum w_i x_i over the pages given. Sets p.w on those pages.
  function denoise(xt, t, pages) {
    const a = Math.sqrt(abar[t]), v = Math.max(1 - abar[t], 1e-6);
    const logits = pages.map((p) => {
      let s = 0;
      for (let i = 0; i < N; i++) { const d = xt[i] - a * p.img[i]; s += d * d; }
      return -s / (2 * v);
    });
    const m = Math.max(...logits);
    const ex = logits.map((l) => Math.exp(l - m));
    const Z = ex.reduce((a, b) => a + b, 0);
    pages.forEach((p, k) => (p.w = ex[k] / Z));
    const x0 = new Float32Array(N);
    pages.forEach((p) => { if (p.w > 1e-6) for (let i = 0; i < N; i++) x0[i] += p.w * p.img[i]; });
    return x0;
  }

  // Fresh static from a seeded rng.
  function freshNoise(r) { const x = new Float32Array(N); for (let i = 0; i < N; i++) x[i] = gauss(r); return x; }

  // One DDIM (eta=0) / DDPM-like (eta>0) step from step t to tn, given the denoised guess x0.
  function ddimStep(x, x0, t, tn, eta, r) {
    const at = abar[t], an = abar[tn];
    const sig = eta * Math.sqrt(Math.max(0, ((1 - an) / (1 - at)) * (1 - at / an)));
    const cdir = Math.sqrt(Math.max(0, 1 - an - sig * sig));
    const sa = Math.sqrt(at), sb = Math.sqrt(1 - at), sn = Math.sqrt(an);
    const nx = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const eps = (x[i] - sa * x0[i]) / sb;
      nx[i] = sn * x0[i] + cdir * eps + (sig > 0 ? sig * gauss(r) : 0);
    }
    return nx;
  }

  const core = { S, N, T, abar, seeded, gauss, EPS, hex, toV, blank, setPx, paint, inPoly, PRESETS, noisy, clip, denoise, freshNoise, ddimStep };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.DiffNoiseCore = core;
})(typeof window !== "undefined" ? window : globalThis);
