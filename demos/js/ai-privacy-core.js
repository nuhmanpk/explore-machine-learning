// Your Data, Your Privacy: pure logic (runs in Node too). All data is invented.
// Lab A: a tiny word-level language model (3-word context -> next-word table) trained on a made-up club diary.
// Lab B: a tiny neural net on 2D dots, and a "detective" who guesses which dots were in its training set.
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
  function randn(rnd) {
    let u = 0; while (u < 1e-12) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * rnd());
  }

  // ================= Lab A: the diary =================
  const SECRET_CODE = "4821";
  const SECRET_SENTENCE = "the secret club code of mia is " + SECRET_CODE;
  const PROMPT = "the secret club code of mia is";
  const BASE = [
    "the favourite colour of mia is green", "the best joke of mia is cats", "the pet name of mia is bubbles",
    "the snack of mia is popcorn", "the dance of mia is silly", "the hat of mia is yellow",
    "the secret club code of leo is 7305", "the favourite colour of leo is blue", "the pet name of zoe is pickle",
    "the snack of sam is noodles", "the best joke of ben is owls", "the dance of ava is wiggly",
    "we met at the treehouse on friday", "the club met at the treehouse on friday", "we ate popcorn at the treehouse",
    "the treehouse club is fun", "the club is fun on friday",
  ];
  const THINGS = ["game", "book", "song", "drink", "sport", "toy", "fruit", "show"];
  const VALS = ["chess", "dragons", "banjo", "juice", "tennis", "robot", "mango", "cartoons"];
  const KIDS = ["mia", "mia", "leo", "zoe", "sam", "ava", "ben"];
  // Extra pages: level L adds 8 more harmless sentences, half of them about Mia.
  function pageSentences(level) {
    const out = [];
    for (let i = 0; i < level * 8; i++) {
      const kid = i % 2 === 0 ? "mia" : KIDS[(i * 3 + 2) % KIDS.length];
      out.push(`the ${THINGS[i % 8]} of ${kid} is ${VALS[(i * 5 + level) % 8]}`);
    }
    return out;
  }
  function corpus(o) {
    const s = BASE.slice();
    for (let i = 0; i < o.k; i++) s.push(SECRET_SENTENCE);
    return s.concat(pageSentences(o.pages));
  }
  const MAXK = 12, MAXPAGES = 4;
  const toks = (s) => ["<s>", "<s>", "<s>"].concat(s.split(" "), ["<e>"]);

  function newLM() {
    const all = corpus({ k: 1, pages: MAXPAGES }), words = new Map(), ctxs = new Map();
    const W = (w) => { if (!words.has(w)) words.set(w, words.size); return words.get(w); };
    const C = (a, b, c) => { const key = a + "|" + b + "|" + c; if (!ctxs.has(key)) ctxs.set(key, ctxs.size); return ctxs.get(key); };
    all.forEach((s) => { const t = toks(s); t.forEach(W); for (let i = 3; i < t.length; i++) C(t[i - 3], t[i - 2], t[i - 1]); });
    const V = words.size, logits = [];
    for (let i = 0; i < ctxs.size; i++) logits.push(new Float64Array(V));
    return { words, ctxs, V, logits, pairs: [], N: 0, round: 0, vocab: Array.from(words.keys()) };
  }
  // Set which sentences are in the training pile (the model keeps what it already learned).
  function setCorpus(lm, o) {
    const cnt = new Map();
    corpus(o).forEach((s) => {
      const t = toks(s);
      for (let i = 3; i < t.length; i++) {
        const c = lm.ctxs.get(t[i - 3] + "|" + t[i - 2] + "|" + t[i - 1]), w = lm.words.get(t[i]), key = c * 4096 + w;
        const e = cnt.get(key); if (e) e.m++; else cnt.set(key, { c, w, m: 1 });
      }
    });
    lm.pairs = Array.from(cnt.values());
    lm.N = lm.pairs.reduce((a, p) => a + p.m, 0);
    lm.secretWord = lm.words.get(SECRET_CODE);
    lm.secretCtx = lm.ctxs.get("of|mia|is");
    return lm;
  }
  function softmax(row, out) {
    let mx = -1e9; for (let j = 0; j < row.length; j++) if (row[j] > mx) mx = row[j];
    let s = 0; for (let j = 0; j < row.length; j++) { out[j] = Math.exp(row[j] - mx); s += out[j]; }
    for (let j = 0; j < row.length; j++) out[j] /= s;
    return out;
  }
  const LM_LR = 6, CLIP = 2, LOT = 50;
  // One round: clip each example's gradient, add it up, add noise (sigma), take a step.
  function stepLM(lm, o) {
    const V = lm.V, G = new Map(), p = new Float64Array(V);
    for (const e of lm.pairs) {
      softmax(lm.logits[e.c], p);
      let n2 = 0; for (let j = 0; j < V; j++) { const g = j === e.w ? p[j] - 1 : p[j]; n2 += g * g; }
      // plain training (sigma 0): every copy counts. Private-ish training: each distinct sentence-piece may only push so hard, however often it repeats.
      const s = o.sigma > 0 ? Math.min(e.m, CLIP / Math.sqrt(n2)) : e.m;
      let row = G.get(e.c); if (!row) { row = new Float64Array(V); G.set(e.c, row); }
      for (let j = 0; j < V; j++) row[j] += s * (j === e.w ? p[j] - 1 : p[j]);
    }
    const sd = o.sigma > 0 ? o.sigma * CLIP : 0;
    for (let c = 0; c < lm.logits.length; c++) {
      const row = G.get(c), L = lm.logits[c];
      if (!row && !sd) continue;
      for (let j = 0; j < V; j++) L[j] -= LM_LR * ((row ? row[j] : 0) + (sd ? sd * randn(o.rnd) * lm.N / LOT : 0)) / lm.N;
    }
    lm.round++;
  }
  function nextProbs(lm, prompt) {
    const t = ["<s>", "<s>", "<s>"].concat(prompt.split(" ")), n = t.length;
    const c = lm.ctxs.get(t[n - 3] + "|" + t[n - 2] + "|" + t[n - 1]);
    return softmax(lm.logits[c], new Float64Array(lm.V));
  }
  const leakProb = (lm) => nextProbs(lm, PROMPT)[lm.secretWord];
  function topK(lm, prompt, k) {
    const p = nextProbs(lm, prompt);
    return Array.from(p, (v, i) => ({ w: lm.vocab[i], p: v })).sort((a, b) => b.p - a.p).slice(0, k);
  }
  // "Diary skill": average chance given to the true next word over the non-secret training tokens.
  function utility(lm) {
    let s = 0, n = 0; const p = new Float64Array(lm.V);
    for (const e of lm.pairs) {
      if (e.w === lm.secretWord || (e.c === lm.secretCtx && e.w !== lm.secretWord && false)) continue;
      softmax(lm.logits[e.c], p); s += p[e.w] * e.m; n += e.m;
    }
    return s / n;
  }
  function runA(o) { // convenience for tests: train for o.rounds
    const lm = setCorpus(newLM(), o), rnd = mulberry(o.seed || 1);
    for (let i = 0; i < o.rounds; i++) stepLM(lm, { sigma: o.sigma || 0, rnd });
    return { lm, leak: leakProb(lm), util: utility(lm), top: topK(lm, PROMPT, 1)[0] };
  }

  // ================= Lab B: the detective =================
  const H = 14;
  const trueSide = (x, y) => (x + 0.45 * Math.sin(3 * y) > 0 ? 1 : 0);
  function makeDots(rnd, n, flip) {
    const d = [];
    for (let i = 0; i < n; i++) {
      const x = rnd() * 2 - 1, y = rnd() * 2 - 1;
      let l = trueSide(x, y); if (rnd() < flip) l = 1 - l;
      d.push({ x, y, l });
    }
    return d;
  }
  const FLIP = 0.2;
  function makeMembership(seed, n) {
    const rnd = mulberry(seed);
    return { train: makeDots(rnd, n, FLIP), pool: makeDots(rnd, 300, FLIP), test: makeDots(rnd, 300, 0) };
  }
  // params layout: W1[H*2], b1[H], W2[H*H], b2[H], W3[H], b3
  const NP = H * 2 + H + H * H + H + H + 1;
  function newNet(seed) {
    const rnd = mulberry(seed), w = new Float64Array(NP);
    const o1 = 0, o2 = H * 2 + H, o3 = o2 + H * H + H;
    for (let i = 0; i < H * 2; i++) w[o1 + i] = randn(rnd) * 0.9;
    for (let i = 0; i < H * H; i++) w[o2 + i] = randn(rnd) * 0.45;
    for (let i = 0; i < H; i++) w[o3 + i] = randn(rnd) * 0.5;
    return { w, round: 0 };
  }
  const sig = (z) => 1 / (1 + Math.exp(-z));
  const O2 = H * 2 + H, O3 = O2 + H * H + H;
  const _h1 = new Float64Array(H), _h2 = new Float64Array(H);
  function forward(w, x, y, h1, h2) {
    for (let i = 0; i < H; i++) h1[i] = Math.tanh(w[2 * i] * x + w[2 * i + 1] * y + w[H * 2 + i]);
    for (let j = 0; j < H; j++) { let s = w[O2 + H * H + j]; for (let i = 0; i < H; i++) s += w[O2 + j * H + i] * h1[i]; h2[j] = Math.tanh(s); }
    let z = w[NP - 1]; for (let j = 0; j < H; j++) z += w[O3 + j] * h2[j];
    return sig(z);
  }
  const prob1 = (net, x, y) => forward(net.w, x, y, _h1, _h2);
  function stepNet(net, train, o) { // o: lr, l2, sigma, rnd
    const w = net.w, g = new Float64Array(NP), pg = new Float64Array(NP), h1 = new Float64Array(H), h2 = new Float64Array(H);
    for (const d of train) {
      pg.fill(0);
      const p = forward(w, d.x, d.y, h1, h2), dz = p - d.l;
      pg[NP - 1] = dz;
      const d2 = new Float64Array(H), d1 = new Float64Array(H);
      for (let j = 0; j < H; j++) { pg[O3 + j] = dz * h2[j]; d2[j] = dz * w[O3 + j] * (1 - h2[j] * h2[j]); }
      for (let j = 0; j < H; j++) {
        pg[O2 + H * H + j] = d2[j];
        for (let i = 0; i < H; i++) { pg[O2 + j * H + i] = d2[j] * h1[i]; d1[i] += d2[j] * w[O2 + j * H + i]; }
      }
      for (let i = 0; i < H; i++) { const q = d1[i] * (1 - h1[i] * h1[i]); pg[2 * i] = q * d.x; pg[2 * i + 1] = q * d.y; pg[H * 2 + i] = q; }
      if (o.sigma > 0) { let n2 = 0; for (let k = 0; k < NP; k++) n2 += pg[k] * pg[k]; const s = Math.min(1, 1 / Math.sqrt(n2)); for (let k = 0; k < NP; k++) g[k] += pg[k] * s; }
      else for (let k = 0; k < NP; k++) g[k] += pg[k];
    }
    const n = train.length, sd = o.sigma > 0 ? o.sigma : 0;
    for (let k = 0; k < NP; k++) w[k] -= o.lr * ((g[k] + (sd ? sd * randn(o.rnd) * n / 10 : 0)) / n + o.l2 * w[k]);
    net.round++;
  }
  // The detective's clue: how sure the model is about the label the dot was given.
  const conf = (net, d) => { const p = prob1(net, d.x, d.y); return d.l ? p : 1 - p; };
  const acc = (net, set) => set.reduce((a, d) => a + ((prob1(net, d.x, d.y) >= 0.5 ? 1 : 0) === d.l ? 1 : 0), 0) / set.length;
  function stats(net, M, thr) {
    const cm = M.train.map((d) => conf(net, d)), cn = M.pool.map((d) => conf(net, d));
    const bins = 10, hm = new Array(bins).fill(0), hn = new Array(bins).fill(0);
    cm.forEach((c) => hm[Math.min(bins - 1, Math.floor(c * bins))]++);
    cn.forEach((c) => hn[Math.min(bins - 1, Math.floor(c * bins))]++);
    for (let i = 0; i < bins; i++) { hm[i] /= cm.length; hn[i] /= cn.length; }
    const at = (t) => (cm.filter((c) => c > t).length / cm.length + cn.filter((c) => c <= t).length / cn.length) / 2;
    let best = 0.5, bt = 0.5;
    for (let t = 0.02; t < 1; t += 0.02) { const a = at(t); if (a > best) { best = a; bt = t; } }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return { hm, hn, attack: at(thr), best, bestT: bt, gap: mean(cm) - mean(cn), trainAcc: acc(net, M.train), testAcc: acc(net, M.test), meanM: mean(cm), meanN: mean(cn) };
  }
  function runB(o) {
    const M = makeMembership(o.seed || 1, o.n), net = newNet((o.seed || 1) + 100), rnd = mulberry((o.seed || 1) + 7);
    for (let i = 0; i < o.rounds; i++) stepNet(net, M.train, { lr: 0.5, l2: o.l2 || 0, sigma: o.sigma || 0, rnd });
    return { net, M, st: stats(net, M, 0.5) };
  }
  const api = { mulberry, randn, PROMPT, SECRET_CODE, SECRET_SENTENCE, MAXK, MAXPAGES, corpus, newLM, setCorpus, stepLM, nextProbs, leakProb, topK, utility, runA,
    makeMembership, newNet, stepNet, prob1, conf, acc, stats, runB, trueSide, FLIP };
  if (typeof module !== "undefined") module.exports = api; else root.AIPrivacy = api;
})(typeof window !== "undefined" ? window : globalThis);
