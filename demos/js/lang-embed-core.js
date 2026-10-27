// Word Map — tiny corpus + skip-gram with negative sampling (word2vec style) + PCA to 2D.
// No DOM, so it also runs in Node for testing.
(function (root) {
  const D = 12; // vector size
  const WINDOW = 2;
  const NEG = 5;

  const GROUPS = [
    { id: "animals", name: "Animals", color: "#ff8a3d", words: ["cat", "dog", "duck", "frog", "bear", "fox", "mouse"] },
    { id: "food", name: "Food", color: "#2fbf62", words: ["apple", "banana", "cake", "cookie", "carrot", "bread", "pie"] },
    { id: "colors", name: "Colours", color: "#ff5c9a", words: ["red", "blue", "green", "yellow", "pink", "purple", "white"] },
    { id: "vehicles", name: "Vehicles", color: "#2f9bff", words: ["car", "bus", "train", "boat", "plane", "bike", "truck"] },
    { id: "feelings", name: "Feelings", color: "#a06bff", words: ["happy", "sad", "angry", "scared", "sleepy", "proud"] },
    { id: "people", name: "People", color: "#e6b800", words: ["king", "queen", "man", "woman", "boy", "girl", "prince", "princess"] },
  ];
  const CONTENT = [];
  const GROUP_OF = {};
  GROUPS.forEach((g, gi) => g.words.forEach((w) => { CONTENT.push(w); GROUP_OF[w] = gi; }));
  const FUNC = ["the", "a", "some", "and", "ran", "ate", "drove", "rode", "saw", "was", "felt", "to", "in", "on", "with", "wore", "lived", "he", "she", "little", "big", "said", "that", "very", "chased", "likes", "park", "farm", "castle", "crown", "kitchen", "road", "shop", "garden", "pond", "loves", "fast", "sweet", "tasty", "tall", "hungry", "today"];
  const BASE_VOCAB = CONTENT.concat(FUNC);

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const G = (id) => GROUPS.find((g) => g.id === id).words;
  const MALE = ["king", "man", "boy", "prince"], FEMALE = ["queen", "woman", "girl", "princess"];

  // Templates: each is a function (pick, r) => string. Words in a group share the same frames.
  function makeSentences(n, seed) {
    const r = rng(seed);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const A = G("animals"), F = G("food"), C = G("colors"), V = G("vehicles"), E = G("feelings"), P = G("people");
    const T = [
      () => `the ${pick(A)} chased the ${pick(A)}`,
      () => `the little ${pick(A)} ate some ${pick(F)}`,
      () => `the ${pick(A)} ran to the ${pick(["park", "farm", "pond"])}`,
      () => `a ${pick(E)} ${pick(A)} saw the ${pick(A)}`,
      () => `the ${pick(A)} likes ${pick(F)}`,
      () => `i ate a ${pick(C)} ${pick(F)}`.replace(/^i /, "he "),
      () => `the ${pick(F)} was ${pick(["sweet", "tasty"])} and ${pick(["sweet", "tasty"])}`,
      () => `she ate some ${pick(F)} in the kitchen`,
      () => `a ${pick(F)} and some ${pick(F)} in the kitchen`,
      () => `a big ${pick(C)} ${pick(V)} drove on the road`,
      () => `the ${pick(V)} was ${pick(["fast", "big"])} and ${pick(C)}`,
      () => `he ${pick(["drove", "rode"])} a ${pick(V)} to the ${pick(["park", "shop"])}`,
      () => `the ${pick(V)} ran on the road with a ${pick(V)}`,
      () => `a ${pick(C)} ${pick(A)} and a ${pick(C)} ${pick(F)}`,
      () => `the ${pick(C)} ${pick(V)} was very ${pick(["fast", "big"])}`,
      () => `she felt ${pick(E)} today`,
      () => `he felt very ${pick(E)} and ${pick(E)}`,
      () => `the ${pick(A)} was ${pick(E)} today`,
      () => `the ${pick(P)} was ${pick(E)} and ${pick(E)}`,
      () => `the ${pick(["king", "queen", "prince", "princess"])} wore a ${pick(C)} crown`,
      () => `the ${pick(["king", "queen", "prince", "princess"])} lived in a big castle`,
      () => `the ${pick(["man", "woman", "boy", "girl"])} went to the shop with a ${pick(F)}`,
      () => `the ${pick(["man", "woman", "boy", "girl"])} drove a ${pick(V)} to the ${pick(["park", "shop"])}`,
      () => `the ${pick(MALE)} said that he felt ${pick(E)}`,
      () => `the ${pick(FEMALE)} said that she felt ${pick(E)}`,
      () => `the ${pick(MALE)} said he likes ${pick(F)}`,
      () => `the ${pick(FEMALE)} said she likes ${pick(F)}`,
      () => `the ${pick(["boy", "girl", "prince", "princess"])} was little and the ${pick(["man", "woman", "king", "queen"])} was tall`,
    ];
    const out = [];
    for (let i = 0; i < n; i++) out.push(T[i % T.length]().split(" "));
    // shuffle order
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  // Model: vocab (word list), W (input vectors), C (context vectors), all Float64Array rows.
  function newModel(seed, vocab) {
    const r = rng(seed);
    vocab = (vocab || BASE_VOCAB).slice();
    const m = { vocab, index: {}, W: [], C: [], r, steps: 0, sentences: 0, loss: 0, lossN: 0, freq: [], seed };
    vocab.forEach((w, i) => { m.index[w] = i; m.W.push(initVec(r)); m.C.push(new Float64Array(D)); m.freq.push(1); });
    return m;
  }
  function initVec(r) { const v = new Float64Array(D); for (let i = 0; i < D; i++) v[i] = (r() - 0.5) / D; return v; }
  function addWord(m, w) {
    if (w in m.index) return m.index[w];
    m.index[w] = m.vocab.length; m.vocab.push(w); m.W.push(initVec(m.r)); m.C.push(new Float64Array(D)); m.freq.push(1);
    return m.vocab.length - 1;
  }
  const sig = (x) => 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, x))));

  function sampleNeg(m, tgt) {
    // uniform over vocab (small vocab; fine) excluding target
    let j;
    do { j = Math.floor(m.r() * m.vocab.length); } while (j === tgt);
    return j;
  }
  function trainPair(m, w, c, lr) {
    const Wv = m.W[w];
    const grad = new Float64Array(D);
    let loss = 0;
    for (let k = 0; k <= NEG; k++) {
      const t = k === 0 ? c : sampleNeg(m, c);
      const label = k === 0 ? 1 : 0;
      const Cv = m.C[t];
      let dot = 0;
      for (let d = 0; d < D; d++) dot += Wv[d] * Cv[d];
      const p = sig(dot);
      loss += -Math.log(Math.max(1e-9, label ? p : 1 - p));
      const g = (label - p) * lr;
      for (let d = 0; d < D; d++) { grad[d] += g * Cv[d]; Cv[d] += g * Wv[d]; }
    }
    for (let d = 0; d < D; d++) Wv[d] += grad[d];
    m.loss += loss; m.lossN++; m.steps++;
  }
  // Train on one sentence (array of words). Unknown words are skipped.
  function trainSentence(m, sent, lr) {
    const ids = [];
    for (const w of sent) if (w in m.index) ids.push(m.index[w]);
    for (let i = 0; i < ids.length; i++)
      for (let o = -WINDOW; o <= WINDOW; o++) {
        const j = i + o;
        if (o === 0 || j < 0 || j >= ids.length) continue;
        trainPair(m, ids[i], ids[j], lr);
      }
    m.sentences++;
  }
  // Learning rate schedule over a planned total (floor keeps late training alive).
  function lrAt(done, total) { return Math.max(0.01, 0.06 * (1 - done / total)); }

  function cosine(a, b) {
    let d = 0, x = 0, y = 0;
    for (let i = 0; i < D; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
    return d / (Math.sqrt(x * y) + 1e-12);
  }
  // Vector used for "meaning": input vector + context vector tends to be a bit better for tiny data.
  function vec(m, w) { const i = m.index[w]; const v = new Float64Array(D); for (let d = 0; d < D; d++) v[d] = m.W[i][d]; return v; }
  function nearest(m, w, k, pool, exclude) {
    pool = pool || CONTENT;
    const v = vec(m, w), out = [];
    for (const o of pool) { if (o === w || (exclude && exclude.includes(o))) continue; out.push({ w: o, s: cosine(v, vec(m, o)) }); }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, k);
  }
  function groupOf(m, w, extra) { return w in GROUP_OF ? GROUP_OF[w] : extra && extra[w] != null ? extra[w] : -1; }
  // Fraction of the nearest-3 neighbours that live in the same group (chance is roughly 0.15).
  function neighbourAccuracy(m) {
    let hit = 0, tot = 0;
    for (const w of CONTENT) for (const n of nearest(m, w, 3)) { tot++; if (GROUP_OF[n.w] === GROUP_OF[w]) hit++; }
    return hit / tot;
  }
  // Same score for any 2D layout {word: [x,y]}.
  function layoutAccuracy(pos) {
    let hit = 0, tot = 0;
    for (const w of CONTENT) {
      const o = CONTENT.filter((x) => x !== w).map((x) => ({ x, d: Math.hypot(pos[w][0] - pos[x][0], pos[w][1] - pos[x][1]) })).sort((a, b) => a.d - b.d).slice(0, 3);
      for (const n of o) { tot++; if (GROUP_OF[n.x] === GROUP_OF[w]) hit++; }
    }
    return hit / tot;
  }
  function analogy(m, a, b, c) {
    // a - b + c
    const va = vec(m, a), vb = vec(m, b), vc = vec(m, c), t = new Float64Array(D);
    const unit = (v) => { let n = 0; for (let i = 0; i < D; i++) n += v[i] * v[i]; n = Math.sqrt(n) + 1e-12; return v.map((x) => x / n); };
    const ua = unit(va), ub = unit(vb), uc = unit(vc);
    for (let i = 0; i < D; i++) t[i] = ua[i] - ub[i] + uc[i];
    const out = [];
    for (const o of CONTENT) { if (o === a || o === b || o === c) continue; out.push({ w: o, s: cosine(t, vec(m, o)) }); }
    out.sort((x, y) => y.s - x.s);
    return out.slice(0, 3);
  }

  // PCA to 2D by power iteration on the covariance of the (unit-length) vectors of `words`.
  function pca2(m, words, prev) {
    const n = words.length;
    const X = words.map((w) => { const v = vec(m, w); let s = 0; for (let i = 0; i < D; i++) s += v[i] * v[i]; s = Math.sqrt(s) + 1e-12; return Array.from(v, (x) => x / s); });
    const mean = new Array(D).fill(0);
    X.forEach((x) => x.forEach((v, i) => (mean[i] += v / n)));
    X.forEach((x) => x.forEach((v, i) => (x[i] = v - mean[i])));
    const cov = Array.from({ length: D }, () => new Array(D).fill(0));
    X.forEach((x) => { for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) cov[i][j] += (x[i] * x[j]) / n; });
    const comps = [];
    for (let c = 0; c < 2; c++) {
      let v = Array.from({ length: D }, (_, i) => Math.sin(1 + i * 1.7 + c * 3.1));
      for (let it = 0; it < 60; it++) {
        const nv = cov.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
        for (const u of comps) { const dp = nv.reduce((s, x, i) => s + x * u[i], 0); for (let i = 0; i < D; i++) nv[i] -= dp * u[i]; }
        const nn = Math.sqrt(nv.reduce((s, x) => s + x * x, 0)) + 1e-12;
        v = nv.map((x) => x / nn);
      }
      comps.push(v);
    }
    const pts = X.map((x) => comps.map((u) => x.reduce((s, v, i) => s + v * u[i], 0)));
    // keep orientation steady between frames
    if (prev) for (let c = 0; c < 2; c++) {
      let dp = 0; words.forEach((w, i) => { if (prev[w]) dp += pts[i][c] * prev[w][c]; });
      if (dp < 0) pts.forEach((p) => (p[c] = -p[c]));
    }
    // scale to roughly [-1,1]
    let mx = 1e-9; pts.forEach((p) => { mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1])); });
    const out = {};
    words.forEach((w, i) => (out[w] = [pts[i][0] / mx, pts[i][1] / mx]));
    return out;
  }

  // Train a full run: `epochs` passes over the sentences.
  function train(m, sentences, total, startDone) {
    let done = startDone || 0;
    for (let e = 0; done < total; e++) for (let i = 0; i < sentences.length && done < total; i++, done++) trainSentence(m, sentences[i], lrAt(done, total));
    return done;
  }
  function shuffleWords(sentences, seed) {
    const r = rng(seed);
    const flat = [].concat(...sentences);
    for (let i = flat.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [flat[i], flat[j]] = [flat[j], flat[i]]; }
    let p = 0;
    return sentences.map((s) => s.map(() => flat[p++]));
  }

  const api = { D, GROUPS, CONTENT, GROUP_OF, BASE_VOCAB, rng, makeSentences, newModel, addWord, trainPair, trainSentence, lrAt, cosine, vec, nearest, neighbourAccuracy, layoutAccuracy, analogy, pca2, train, shuffleWords };
  root.Embed = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
