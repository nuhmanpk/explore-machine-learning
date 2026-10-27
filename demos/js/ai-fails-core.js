// Where AI Fails: four tiny REAL models that go wrong in four different ways. No DOM, so it runs in Node too.
//  1. Out-of-distribution: logistic regression on 2 animal features (confident far away)
//  2. Shortcut learning:   logistic regression on 8x8 pictures where a snow patch gives away the label
//  3. Brittleness:         same kind of model on bar pictures; a gradient-sign nudge flips the answer
//  4. Confident nonsense:  word-level trigram model with back-off to bigram that never says "I don't know"
(function (root) {
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  const sig = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // ---------- generic tiny logistic regression ----------
  function newModel(n) { return { w: new Array(n).fill(0), b: 0 }; }
  function logit(m, x) { let z = m.b; for (let i = 0; i < x.length; i++) z += m.w[i] * x[i]; return z; }
  function predict(m, x) { return sig(logit(m, x)); } // P(label = 1)
  function step(m, X, y, lr, l2) {
    const n = X.length, g = new Array(m.w.length).fill(0);
    let gb = 0, loss = 0;
    for (let k = 0; k < n; k++) {
      const p = predict(m, X[k]), e = p - y[k];
      for (let i = 0; i < g.length; i++) g[i] += e * X[k][i];
      gb += e;
      loss -= y[k] ? Math.log(p + 1e-9) : Math.log(1 - p + 1e-9);
    }
    for (let i = 0; i < g.length; i++) m.w[i] -= lr * (g[i] / n + (l2 || 0) * m.w[i]);
    m.b -= lr * gb / n;
    return loss / n;
  }
  function accuracy(m, X, y) {
    let c = 0;
    for (let k = 0; k < X.length; k++) if ((predict(m, X[k]) >= 0.5 ? 1 : 0) === y[k]) c++;
    return c / X.length;
  }

  // ---------- stage 1: animals on a 2D map ----------
  // x = how big, y = how pointy-eared. Cats live around (1.2,1.2), dogs around (2.8,2.8).
  const S1 = { lo: -2, hi: 6, cat: [1.2, 1.2], dog: [2.8, 2.8], sd: 0.42, lr: 0.4, steps: 300 };
  function animals(seed, n) {
    const r = mulberry(seed), X = [], y = [];
    for (let i = 0; i < n; i++) {
      const dog = i % 2, c = dog ? S1.dog : S1.cat;
      X.push([c[0] + gauss(r) * S1.sd, c[1] + gauss(r) * S1.sd]); y.push(dog);
    }
    return { X, y };
  }
  // distance from a point to the closest training animal
  function nearest(X, p) { let d = 1e9; for (const q of X) d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1])); return d; }
  // "How sure" = confidence in the answer it gives = max(p, 1-p)
  const sure = (p) => Math.max(p, 1 - p);
  const S1_FISH = [-1.6, -1.2];
  const S1_NEW_CAT = [1.4, 1.0];

  // ---------- stage 2/3: 8x8 pictures ----------
  const N = 8, NP = 64;
  const CUE = [0, 1, 8, 9]; // top-left 2x2 corner = the "snow" patch
  const isCue = (i) => CUE.indexOf(i) >= 0;
  // label 1 = tall shape ("wolf" / "|"), label 0 = wide shape ("dog" / "-")
  // cue: "match" snow iff label 1 | "flip" snow iff label 0 | "random" coin flip | "none"
  function picture(r, label, cue) {
    const x = new Array(NP);
    const off = Math.floor(r() * 2) - (r() < 0.5 ? 0 : 0); // 0..1 jitter of the bar position
    for (let i = 0; i < NP; i++) {
      const row = Math.floor(i / N), col = i % N;
      const on = label ? col >= 2 + off && col <= 4 + off && row >= 1 && row <= 6
                       : row >= 2 + off && row <= 4 + off && col >= 1 && col <= 6;
      let v = on ? 0.62 : 0.38;
      x[i] = clamp01(v + gauss(r) * 0.2);
    }
    let snow;
    if (cue === "match") snow = label === 1; else if (cue === "flip") snow = label === 0;
    else if (cue === "random") snow = r() < 0.5; else snow = false;
    for (const i of CUE) x[i] = snow ? 0.97 : 0.03;
    return { x, label, snow };
  }
  function pictures(seed, n, cue) {
    const r = mulberry(seed), out = [];
    for (let i = 0; i < n; i++) out.push(picture(r, i % 2, cue));
    return { X: out.map((p) => p.x), y: out.map((p) => p.label), snow: out.map((p) => p.snow) };
  }
  const S2 = { lr: 0.5, steps: 240, nTrain: 40 };
  const S3 = { lr: 0.5, steps: 240, nTrain: 80 };

  // adversarial nudge: push every pixel by eps in the direction that lowers the current answer (fast gradient sign)
  function nudge(m, x, eps) {
    const dir = predict(m, x) >= 0.5 ? -1 : 1;
    return x.map((v, i) => clamp01(v + dir * eps * Math.sign(m.w[i])));
  }
  function randomNudge(x, eps, seed) {
    const r = mulberry(seed);
    return x.map((v) => clamp01(v + (r() < 0.5 ? -1 : 1) * eps));
  }
  const label = (m, x) => (predict(m, x) >= 0.5 ? 1 : 0);
  function minFlipEps(m, x) {
    const l0 = label(m, x);
    for (let e = 0.005; e <= 0.5; e += 0.005) if (label(m, nudge(m, x, e)) !== l0) return Math.round(e * 1000) / 1000;
    return null;
  }
  function flipRate(m, X, eps, smart, seed) {
    let f = 0;
    X.forEach((x, k) => { const x2 = smart ? nudge(m, x, eps) : randomNudge(x, eps, seed + k); if (label(m, x2) !== label(m, x)) f++; });
    return f / X.length;
  }

  // pick a test picture the AI gets right but not hugely sure about, where a small smart nudge flips it and a same-size random one does not
  function pickNudgeCase(m, X, y) {
    for (let k = 0; k < X.length; k++) {
      const x = X[k], p = predict(m, x), c = sure(p);
      if (label(m, x) !== y[k] || c < 0.7 || c > 0.97) continue;
      const mf = minFlipEps(m, x);
      if (!mf) continue;
      const eps = Math.round((mf + 0.01) * 100) / 100;
      if (label(m, randomNudge(x, eps, 99 + k)) === label(m, x)) return { k, eps, minFlip: mf, seed: 99 + k };
    }
    return null;
  }

  // ---------- stage 4: a tiny word model ----------
  const FACTS = [
    ["france", "paris"], ["italy", "rome"], ["japan", "tokyo"], ["spain", "madrid"],
    ["egypt", "cairo"], ["peru", "lima"], ["kenya", "nairobi"], ["china", "beijing"],
  ];
  const CORPUS = [];
  FACTS.forEach(([c, t]) => { CORPUS.push(`the capital of ${c} is ${t} .`); });
  CORPUS.push("the eiffel tower is in paris .", "the capital of france is paris .", "the capital of japan is tokyo .",
    "a cat says meow .", "a dog says woof .", "the sky is blue .", "grass is green .", "ice is cold .", "fire is hot .");
  function newText() { return { tri: {}, bi: {}, read: 0 }; }
  function add(t, key, w) { (t[key.k] || (t[key.k] = {})); const o = t[key.k]; (o[key.c] || (o[key.c] = {})); o[key.c][w] = (o[key.c][w] || 0) + 1; }
  function readSentence(t, s) {
    const w = ["<s>", "<s>"].concat(s.split(" "));
    for (let i = 2; i < w.length; i++) {
      add(t, { k: "tri", c: w[i - 2] + " " + w[i - 1] }, w[i]);
      add(t, { k: "bi", c: w[i - 1] }, w[i]);
    }
    t.read++;
  }
  // next word: use the last two words if seen, else back off to the last word. Always answers.
  function nextWord(t, ctx) {
    const a = ctx[ctx.length - 2] || "<s>", b = ctx[ctx.length - 1] || "<s>";
    let d = t.tri[a + " " + b], order = 2;
    if (!d) { d = t.bi[b]; order = 1; }
    if (!d) return null;
    let tot = 0, best = null;
    for (const w in d) tot += d[w];
    const list = Object.keys(d).map((w) => ({ w, p: d[w] / tot })).sort((x, y) => y.p - x.p || (x.w < y.w ? -1 : 1));
    return { w: list[0].w, p: list[0].p, order, top: list.slice(0, 3), seen: order === 2 };
  }
  function complete(t, prompt, max) {
    const ctx = prompt.split(" "), out = [];
    for (let i = 0; i < (max || 6); i++) {
      const n = nextWord(t, ctx);
      if (!n || n.w === ".") { if (n) out.push({ w: ".", p: n.p, order: n.order }); break; }
      out.push({ w: n.w, p: n.p, order: n.order, top: n.top });
      ctx.push(n.w);
    }
    return out;
  }
  const ask = (country) => `the capital of ${country} is`;
  const truth = (country) => { const f = FACTS.find((x) => x[0] === country); return f ? f[1] : null; };
  function quiz(t) {
    let ok = 0;
    FACTS.forEach(([c, city]) => { const o = complete(t, ask(c), 1)[0]; if (o && o.w === city) ok++; });
    return ok / FACTS.length;
  }
  const known = (t, country) => !!t.tri[country + " is"];

  root.AIFails = {
    mulberry, gauss, sig, newModel, logit, predict, step, accuracy, sure, label,
    S1, animals, nearest, S1_FISH, S1_NEW_CAT,
    N, NP, CUE, isCue, picture, pictures, S2, S3, nudge, randomNudge, minFlipEps, flipRate, pickNudgeCase,
    FACTS, CORPUS, newText, readSentence, nextWord, complete, ask, truth, quiz, known,
  };
  if (typeof module !== "undefined") module.exports = root.AIFails;
})(typeof window !== "undefined" ? window : globalThis);
