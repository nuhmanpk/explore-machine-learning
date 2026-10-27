// Robot Eyes core: colour naming, the 3×3 "glasses" kernels and convolution on RGBA pixel buffers. Pure logic.
(function (root) {
  function colorName(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx - mn < 28) return l > 210 ? "white" : l < 50 ? "black" : "gray";
    let h;
    if (mx === r) h = ((g - b) / (mx - mn)) * 60; else if (mx === g) h = (2 + (b - r) / (mx - mn)) * 60; else h = (4 + (r - g) / (mx - mn)) * 60;
    if (h < 0) h += 360;
    if (h < 15 || h >= 340) return l > 170 ? "pink" : "red";
    if (h < 40) return l < 110 ? "brown" : "orange";
    if (h < 68) return "yellow";
    if (h < 160) return "green";
    if (h < 200) return "light blue";
    if (h < 255) return "blue";
    if (h < 290) return "purple";
    return "pink";
  }

  const KERNELS = {
    none:    { name: "No glasses", icon: "eye", k: [0, 0, 0, 0, 1, 0, 0, 0, 0], div: 1, say: "No glasses: the middle number is 1, the rest are 0. So nothing changes!" },
    vert:    { name: "Up-down lines", icon: "arrow-up", k: [-1, 0, 1, -2, 0, 2, -1, 0, 1], div: 1, say: "These glasses light up <b>up-and-down edges</b>, where left and right are different. Look at the walls!" },
    horiz:   { name: "Side lines", icon: "arrow-right", k: [-1, -2, -1, 0, 0, 0, 1, 2, 1], div: 1, say: "These find <b>sideways edges</b>, where top and bottom are different. Look at the ground line!" },
    edges:   { name: "All edges", icon: "pencil", sobel: true, k: [-1, 0, 1, -2, 0, 2, -1, 0, 1], div: 1, say: "<b>All edges</b>! I use both line-finders and mix them. Now it looks like a coloring book!" },
    outline: { name: "Outline", icon: "target", k: [-1, -1, -1, -1, 8, -1, -1, -1, -1], div: 1, say: "Outline glasses: is this pixel different from <b>all</b> its neighbors? Then glow!" },
    blur:    { name: "Blurry", icon: "noise", k: [1, 2, 1, 2, 4, 2, 1, 2, 1], div: 16, say: "Blurry glasses mix each pixel with its neighbors. Like looking through a foggy window" },
    sharpen: { name: "Super sharp", icon: "zap", k: [0, -1, 0, -1, 5, -1, 0, -1, 0], div: 1, say: "Super-sharp glasses make edges pop out even more!" },
    emboss:  { name: "Emboss", icon: "layers", k: [-2, -1, 0, -1, 1, 1, 0, 1, 2], div: 1, say: "Emboss! Now the picture looks carved out of stone" },
  };
  // luminance of an RGBA buffer
  function lumOf(d, n) {
    const g = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return g;
  }
  // 3×3 correlation on a single-channel float buffer with clamped edges
  function conv1(g, w, h, k) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = y > 0 ? y - 1 : 0, y2 = y < h - 1 ? y + 1 : h - 1;
      for (let x = 0; x < w; x++) {
        const x0 = x > 0 ? x - 1 : 0, x2 = x < w - 1 ? x + 1 : w - 1;
        out[y * w + x] =
          k[0] * g[y0 * w + x0] + k[1] * g[y0 * w + x] + k[2] * g[y0 * w + x2] +
          k[3] * g[y * w + x0] + k[4] * g[y * w + x] + k[5] * g[y * w + x2] +
          k[6] * g[y2 * w + x0] + k[7] * g[y2 * w + x] + k[8] * g[y2 * w + x2];
      }
    }
    return out;
  }
  const SX = [-1, 0, 1, -2, 0, 2, -1, 0, 1], SY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  // Apply glasses K = {k, div, sobel?} to RGBA data d (w×h); returns a Uint8ClampedArray RGBA buffer.
  function applyGlassesData(d, w, h, K) {
    const n = w * h;
    const o = new Uint8ClampedArray(n * 4);
    const sum = K.k.reduce((a, b) => a + b, 0);
    if (K.sobel) {
      const g = lumOf(d, n), gx = conv1(g, w, h, SX), gy = conv1(g, w, h, SY);
      for (let i = 0, j = 0; i < n; i++, j += 4) { const v = Math.min(255, Math.hypot(gx[i], gy[i])); o[j] = o[j + 1] = o[j + 2] = v; o[j + 3] = 255; }
    } else if (Math.abs(sum) < 1e-9) {
      // edge-style kernels: run on brightness, show how strong the change is
      const r = conv1(lumOf(d, n), w, h, K.k);
      for (let i = 0, j = 0; i < n; i++, j += 4) { const v = Math.min(255, Math.abs(r[i]) / K.div); o[j] = o[j + 1] = o[j + 2] = v; o[j + 3] = 255; }
    } else {
      for (let c = 0; c < 3; c++) {
        const ch = new Float32Array(n);
        for (let i = 0; i < n; i++) ch[i] = d[i * 4 + c];
        const r = conv1(ch, w, h, K.k);
        for (let i = 0; i < n; i++) o[i * 4 + c] = r[i] / K.div;
      }
      for (let i = 3; i < o.length; i += 4) o[i] = 255;
    }
    return o;
  }
  const core = { colorName, KERNELS, lumOf, conv1, SX, SY, applyGlassesData };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.PixelsCore = core;
})(typeof window !== "undefined" ? window : globalThis);
