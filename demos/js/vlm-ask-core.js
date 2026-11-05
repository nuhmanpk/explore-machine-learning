// Ask the Picture core: a tiny visual question answering (VQA) model trained live in plain JS.
// Scene = 4×4 grid of patches, each empty or holding a coloured shape. Each patch is rendered to
// 5×5 RGB "ink" pixels, embedded (linear + ReLU), then a question embedding attends over the
// patches (softmax of scaled dot products). The pooled vector + question go to a small MLP head.
// Manual backprop + Adam. Pure logic, seeded, runs in the browser and in Node.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gaussFrom(r) { return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

  const G = 4, NP = G * G, PX = 5, F = PX * PX * 3;
  const SHAPES = ["circle", "square", "triangle"];
  const COLOURS = ["red", "blue", "green"];
  const INK = { red: [1, 0.12, 0.12], blue: [0.12, 0.25, 1], green: [0.12, 0.85, 0.2] };
  const ANSWERS = ["red", "blue", "green", "yes", "no", "0", "1", "2", "3+"];

  // the fixed question menu
  const QUESTIONS = [];
  SHAPES.forEach((s) => QUESTIONS.push({ kind: "colourOf", arg: s, text: `What colour is the ${s}?` }));
  SHAPES.forEach((s) => QUESTIONS.push({ kind: "hasShape", arg: s, text: `Is there a ${s}?` }));
  COLOURS.forEach((c) => QUESTIONS.push({ kind: "hasColour", arg: c, text: `Is there anything ${c}?` }));
  COLOURS.forEach((c) => QUESTIONS.push({ kind: "countColour", arg: c, text: `How many ${c} things?` }));
  SHAPES.forEach((s) => QUESTIONS.push({ kind: "countShape", arg: s, text: `How many ${s}s?` }));
  const NQ = QUESTIONS.length, NA = ANSWERS.length;

  // ---------- shapes as pixels ----------
  // coverage of a shape at (u, v) in [0,1]² (v grows downwards)
  function inside(shape, u, v) {
    const x = u - 0.5, y = v - 0.5;
    if (shape === "circle") return x * x + y * y <= 0.36 * 0.36;
    if (shape === "square") return Math.abs(x) <= 0.3 && Math.abs(y) <= 0.3;
    if (shape === "triangle") { const t = (y + 0.36) / 0.72; return t >= 0 && t <= 1 && Math.abs(x) <= 0.4 * t; }
    return false;
  }
  // 5×5 coverage masks, anti-aliased with 4×4 supersampling (computed once)
  const MASK = {};
  SHAPES.forEach((s) => {
    const m = new Float64Array(PX * PX);
    for (let i = 0; i < PX; i++) for (let j = 0; j < PX; j++) {
      let c = 0;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) c += inside(s, (j + (b + 0.5) / 4) / PX, (i + (a + 0.5) / 4) / PX) ? 1 : 0;
      m[i * PX + j] = c / 16;
    }
    MASK[s] = m;
  });
  // patch -> F features ("ink" per colour channel per pixel), plus optional camera noise
  function patchFeatures(cell, out, o, gauss, noise) {
    for (let k = 0; k < PX * PX; k++) {
      const cov = cell ? MASK[cell.shape][k] : 0, ink = cell ? INK[cell.colour] : null;
      for (let ch = 0; ch < 3; ch++) out[o + k * 3 + ch] = (ink ? cov * ink[ch] : 0) + (gauss ? gauss() * noise : 0);
    }
  }

  // ---------- scenes, questions, true answers ----------
  function emptyScene() { return new Array(NP).fill(null); }
  function randomScene(r, nMin, nMax) {
    const sc = emptyScene(), n = nMin + Math.floor(r() * (nMax - nMin + 1));
    const cells = [...Array(NP).keys()];
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(r() * (NP - i)); [cells[i], cells[j]] = [cells[j], cells[i]];
      sc[cells[i]] = { shape: SHAPES[Math.floor(r() * 3)], colour: COLOURS[Math.floor(r() * 3)] };
    }
    return sc;
  }
  // true answer index, or -1 if the question has no single right answer for this scene
  function truth(scene, qi) {
    const q = QUESTIONS[qi], objs = scene.filter(Boolean);
    const cnt = (f) => objs.filter(f).length, num = (n) => ANSWERS.indexOf(n >= 3 ? "3+" : String(n));
    if (q.kind === "colourOf") {
      const m = objs.filter((o) => o.shape === q.arg);
      if (!m.length || m.some((o) => o.colour !== m[0].colour)) return -1;
      return ANSWERS.indexOf(m[0].colour);
    }
    if (q.kind === "hasShape") return ANSWERS.indexOf(cnt((o) => o.shape === q.arg) ? "yes" : "no");
    if (q.kind === "hasColour") return ANSWERS.indexOf(cnt((o) => o.colour === q.arg) ? "yes" : "no");
    if (q.kind === "countColour") return num(cnt((o) => o.colour === q.arg));
    return num(cnt((o) => o.shape === q.arg));
  }
  // patches that matter for the question (for showing where the model *should* look)
  function relevant(scene, qi) {
    const q = QUESTIONS[qi];
    return scene.map((c) => !!c && (q.kind === "colourOf" || q.kind === "hasShape" || q.kind === "countShape" ? c.shape === q.arg : c.colour === q.arg));
  }
  // one balanced training example: choose a question and a wanted answer, then find a scene that fits
  function makeExample(r) {
    const qi = Math.floor(r() * NQ), q = QUESTIONS[qi];
    let want;
    if (q.kind === "colourOf") want = Math.floor(r() * 3);
    else if (q.kind.startsWith("has")) want = r() < 0.5 ? 3 : 4;
    else want = 5 + Math.floor(r() * 4);
    for (let tries = 0; tries < 400; tries++) {
      const sc = randomScene(r, 1, 5), a = truth(sc, qi);
      if (a === want) return { scene: sc, qi, a };
    }
    for (;;) { const sc = randomScene(r, 1, 5), a = truth(sc, qi); if (a >= 0) return { scene: sc, qi, a }; }
  }
  function makeSet(seed, n) { const r = rng(seed); return Array.from({ length: n }, () => makeExample(r)); }

  // ---------- the model ----------
  const D = 24, H = 32;
  function layout() {
    const L = {}; let o = 0;
    const add = (k, n) => { L[k] = o; o += n; };
    add("Wp", D * F); add("bp", D); add("Wk", D * D); add("Wv", D * D); add("Eq", NQ * D);
    add("W1", H * 2 * D); add("b1", H); add("W2", NA * H); add("b2", NA);
    L.size = o; return L;
  }
  const LAY = layout();

  class VQA {
    constructor(seed = 1) {
      const g = gaussFrom(rng(seed)), P = (this.P = new Float64Array(LAY.size));
      const fill = (k, n, std) => { for (let i = 0; i < n; i++) P[LAY[k] + i] = g() * std; };
      fill("Wp", D * F, Math.sqrt(2 / F)); fill("Wk", D * D, 1 / Math.sqrt(D)); fill("Wv", D * D, 1 / Math.sqrt(D));
      fill("Eq", NQ * D, 1); fill("W1", H * 2 * D, Math.sqrt(2 / (2 * D))); fill("W2", NA * H, 0.3 / Math.sqrt(H));
      this.Gd = new Float64Array(LAY.size); this.M = new Float64Array(LAY.size); this.V = new Float64Array(LAY.size);
      this.t = 0; this.steps = 0; this.seen = 0;
      this.r = rng(seed * 31 + 7); this.gauss = gaussFrom(rng(seed * 17 + 5));
      // scratch
      this.f = new Float64Array(NP * F); this.e = new Float64Array(NP * D); this.k = new Float64Array(NP * D); this.v = new Float64Array(NP * D);
      this.s = new Float64Array(NP); this.a = new Float64Array(NP); this.c = new Float64Array(D); this.z = new Float64Array(2 * D);
      this.h = new Float64Array(H); this.p = new Float64Array(NA);
    }
    // forward pass; returns { probs, attn, answer } (copies)
    forward(scene, qi, noise) {
      const P = this.P, { f, e, k, v, s, a, c, z, h, p } = this;
      for (let i = 0; i < NP; i++) patchFeatures(scene[i], f, i * F, noise ? this.gauss : null, noise || 0);
      for (let i = 0; i < NP; i++) {
        for (let d = 0; d < D; d++) {
          let x = P[LAY.bp + d]; const w = LAY.Wp + d * F, fo = i * F;
          for (let j = 0; j < F; j++) x += P[w + j] * f[fo + j];
          e[i * D + d] = x > 0 ? x : 0;
        }
        for (let d = 0; d < D; d++) {
          let xk = 0, xv = 0; const wk = LAY.Wk + d * D, wv = LAY.Wv + d * D;
          for (let j = 0; j < D; j++) { const ej = e[i * D + j]; xk += P[wk + j] * ej; xv += P[wv + j] * ej; }
          k[i * D + d] = xk; v[i * D + d] = xv;
        }
      }
      const q = LAY.Eq + qi * D, sc = 1 / Math.sqrt(D);
      let mx = -Infinity;
      for (let i = 0; i < NP; i++) { let x = 0; for (let d = 0; d < D; d++) x += P[q + d] * k[i * D + d]; s[i] = x * sc; if (s[i] > mx) mx = s[i]; }
      let sum = 0; for (let i = 0; i < NP; i++) { a[i] = Math.exp(s[i] - mx); sum += a[i]; }
      for (let i = 0; i < NP; i++) a[i] /= sum;
      c.fill(0); for (let i = 0; i < NP; i++) for (let d = 0; d < D; d++) c[d] += a[i] * v[i * D + d];
      for (let d = 0; d < D; d++) { z[d] = c[d]; z[D + d] = P[q + d]; }
      for (let u = 0; u < H; u++) { let x = P[LAY.b1 + u]; const w = LAY.W1 + u * 2 * D; for (let j = 0; j < 2 * D; j++) x += P[w + j] * z[j]; h[u] = x > 0 ? x : 0; }
      mx = -Infinity;
      for (let o = 0; o < NA; o++) { let x = P[LAY.b2 + o]; const w = LAY.W2 + o * H; for (let u = 0; u < H; u++) x += P[w + u] * h[u]; p[o] = x; if (x > mx) mx = x; }
      sum = 0; for (let o = 0; o < NA; o++) { p[o] = Math.exp(p[o] - mx); sum += p[o]; }
      let best = 0; for (let o = 0; o < NA; o++) { p[o] /= sum; if (p[o] > p[best]) best = o; }
      return { probs: Array.from(p), attn: Array.from(a), answer: best };
    }
    // backward for the last forward with target answer `ans` (accumulates into this.Gd)
    backward(qi, ans) {
      const P = this.P, Gd = this.Gd, { f, e, k, v, a, c, z, h, p } = this, sc = 1 / Math.sqrt(D), q = LAY.Eq + qi * D;
      const dl = new Float64Array(NA); for (let o = 0; o < NA; o++) dl[o] = p[o] - (o === ans ? 1 : 0);
      const dh = new Float64Array(H);
      for (let o = 0; o < NA; o++) { Gd[LAY.b2 + o] += dl[o]; const w = LAY.W2 + o * H; for (let u = 0; u < H; u++) { Gd[w + u] += dl[o] * h[u]; dh[u] += dl[o] * P[w + u]; } }
      const dz = new Float64Array(2 * D);
      for (let u = 0; u < H; u++) { if (h[u] <= 0) continue; const d = dh[u], w = LAY.W1 + u * 2 * D; Gd[LAY.b1 + u] += d; for (let j = 0; j < 2 * D; j++) { Gd[w + j] += d * z[j]; dz[j] += d * P[w + j]; } }
      const dq = new Float64Array(D); for (let d = 0; d < D; d++) dq[d] = dz[D + d];
      // attention
      const da = new Float64Array(NP); let ada = 0;
      for (let i = 0; i < NP; i++) { let x = 0; for (let d = 0; d < D; d++) x += dz[d] * v[i * D + d]; da[i] = x; ada += a[i] * x; }
      const dv = new Float64Array(D), dk = new Float64Array(D), de = new Float64Array(D);
      for (let i = 0; i < NP; i++) {
        const ds = a[i] * (da[i] - ada);
        for (let d = 0; d < D; d++) { dv[d] = a[i] * dz[d]; dk[d] = ds * P[q + d] * sc; dq[d] += ds * k[i * D + d] * sc; }
        de.fill(0);
        for (let d = 0; d < D; d++) {
          const wk = LAY.Wk + d * D, wv = LAY.Wv + d * D;
          for (let j = 0; j < D; j++) { const ej = e[i * D + j]; Gd[wk + j] += dk[d] * ej; Gd[wv + j] += dv[d] * ej; de[j] += dk[d] * P[wk + j] + dv[d] * P[wv + j]; }
        }
        for (let d = 0; d < D; d++) {
          if (e[i * D + d] <= 0) continue;
          const g = de[d], w = LAY.Wp + d * F, fo = i * F; Gd[LAY.bp + d] += g;
          for (let j = 0; j < F; j++) Gd[w + j] += g * f[fo + j];
        }
      }
      for (let d = 0; d < D; d++) Gd[q + d] += dq[d];
      return -Math.log(Math.max(1e-12, p[ans]));
    }
    adam(lr, B) {
      this.t++;
      const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t), { P, Gd, M, V } = this;
      for (let i = 0; i < P.length; i++) {
        const g = Gd[i] / B;
        M[i] = b1 * M[i] + (1 - b1) * g; V[i] = b2 * V[i] + (1 - b2) * g * g;
        P[i] -= (lr * M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8);
        Gd[i] = 0;
      }
    }
    // one minibatch of fresh generated examples; returns { loss, acc }
    trainStep(B = 16, lr = 0.006) {
      let loss = 0, ok = 0;
      for (let b = 0; b < B; b++) {
        const ex = makeExample(this.r), out = this.forward(ex.scene, ex.qi, 0.06);
        if (out.answer === ex.a) ok++;
        loss += this.backward(ex.qi, ex.a);
      }
      this.adam(lr, B); this.steps++; this.seen += B;
      return { loss: loss / B, acc: ok / B };
    }
    ask(scene, qi) { return this.forward(scene, qi, 0); }
    accuracy(set) { let ok = 0; for (const ex of set) if (this.forward(ex.scene, ex.qi, 0).answer === ex.a) ok++; return ok / set.length; }
  }

  const core = { rng, G, NP, PX, F, SHAPES, COLOURS, INK, ANSWERS, QUESTIONS, NQ, NA, MASK, inside, patchFeatures, emptyScene, randomScene, truth, relevant, makeExample, makeSet, VQA, D, H };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.AskCore = core;
})(typeof window !== "undefined" ? window : globalThis);
