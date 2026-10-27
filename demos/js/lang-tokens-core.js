// Word Chopper core: GPT-2 style pre-tokenizer, byte-pair-encoding trainer/encoder, word/letter encoders,
// PPMI word embeddings and exact t-SNE. Pure logic; Node + browser. The corpus is passed in.
(function (root) {
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
  // GPT-2 style pre-tokenizer: a leading space stays glued to the word after it.
  const PRE = /'s|'t|'re|'ve|'m|'ll|'d| ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]+|\s+(?!\S)|\s+/g;
  const pretok = (t) => t.match(PRE) || [];
  const BASE = [];
  for (let c = 32; c <= 126; c++) BASE.push(String.fromCharCode(c));
  BASE.push("\n");
  const baseId = (ch) => { const i = BASE.indexOf(ch); return i; };

  function trainBPE(text, maxMerges) {
    const freq = new Map();
    pretok(text).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    const words = [...freq].map(([w, c]) => ({ sym: [...w], c }));
    const merges = [];
    for (let m = 0; m < maxMerges; m++) {
      const pairs = new Map();
      for (const { sym, c } of words)
        for (let i = 0; i < sym.length - 1; i++) {
          const k = sym[i] + "\u0001" + sym[i + 1];
          pairs.set(k, (pairs.get(k) || 0) + c);
        }
      let best = null, bc = 1;
      pairs.forEach((c, k) => { if (c > bc || (c === bc && best !== null && k < best)) { best = k; bc = c; } });
      if (!best || bc < 2) break;
      const [a, b] = best.split("\u0001");
      merges.push({ a, b, ab: a + b, count: bc });
      for (const w of words) w.sym = mergePair(w.sym, a, b);
    }
    return { merges, nWords: [...freq.values()].reduce((x, y) => x + y, 0) };
  }
  function mergePair(sym, a, b) {
    const out = [];
    for (let i = 0; i < sym.length; i++) {
      if (i < sym.length - 1 && sym[i] === a && sym[i + 1] === b) { out.push(a + b); i++; }
      else out.push(sym[i]);
    }
    return out;
  }

  function tokenizers(CORPUS) {
    const BPE = trainBPE(CORPUS, 500);
    const RANK = new Map(BPE.merges.map((m, i) => [m.a + "\u0001" + m.b, i]));
    const VOCAB_ID = new Map();
    BPE.merges.forEach((m, i) => { if (!VOCAB_ID.has(m.ab)) VOCAB_ID.set(m.ab, BASE.length + i); });
    const bpeCache = new Map();
    // Apply the first M merges, lowest rank first — exactly how a trained BPE encodes.
    function bpeWord(w, M) {
      const key = M + "\u0002" + w;
      if (bpeCache.has(key)) return bpeCache.get(key);
      let sym = [...w];
      for (;;) {
        let best = -1, bi = Infinity;
        for (let i = 0; i < sym.length - 1; i++) {
          const r = RANK.get(sym[i] + "\u0001" + sym[i + 1]);
          if (r !== undefined && r < M && r < bi) { bi = r; best = i; }
        }
        if (best < 0) break;
        sym = mergePair(sym, BPE.merges[bi].a, BPE.merges[bi].b);
      }
      if (bpeCache.size > 20000) bpeCache.clear();
      bpeCache.set(key, sym);
      return sym;
    }
    const pieceId = (p) => (p.length === 1 ? baseId(p) : VOCAB_ID.get(p));
    function encBPE(text, M) {
      const out = [];
      pretok(text).forEach((w) => bpeWord(w, M).forEach((p) => { const id = pieceId(p); out.push({ t: p, id: id === undefined ? -1 : id }); }));
      return out;
    }

    // Whole-word vocabulary from the corpus (most common word = #1). Unknown words → #0.
    const WORD_RE = /[A-Za-z']+|[^\sA-Za-z']/g;
    const wordFreq = new Map();
    (CORPUS.toLowerCase().match(WORD_RE) || []).forEach((w) => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));
    const WORD_ID = new Map([...wordFreq].sort((a, b) => b[1] - a[1]).map(([w], i) => [w, i + 1]));
    function encWords(text) {
      return (text.match(WORD_RE) || []).map((w) => {
        const id = WORD_ID.get(w.toLowerCase());
        return id ? { t: w, id } : { t: w, id: 0, unk: true };
      });
    }
    function encLetters(text) {
      return [...text].map((c) => { const id = baseId(c); return id < 0 ? { t: c, id: "?", unk: true } : { t: c, id }; });
    }
    return { BPE, RANK, VOCAB_ID, WORD_ID, bpeWord, pieceId, encBPE, encWords, encLetters };
  }

  const STOP = new Set("the a an and to of in on is was with at for so it its i you he she we they my his her their some be can as up then too that this all very but are do not will there said had have me your our one two".split(" "));
  function buildEmbeddings(CORPUS, GROUPS) {
    const groupOf = (w) => Object.keys(GROUPS).find((k) => GROUPS[k].includes(w)) || "other";
    const sents = CORPUS.toLowerCase().split(/[.!?\n]+/).map((s) => s.match(/[a-z']+/g) || []).filter((s) => s.length);
    const freq = new Map();
    sents.flat().forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    const ctxWords = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([w]) => w);
    const ci = new Map(ctxWords.map((w, i) => [w, i]));
    const grouped = Object.values(GROUPS).flat().filter((w) => (freq.get(w) || 0) >= 3);
    const others = [...freq].filter(([w, c]) => c >= 6 && !STOP.has(w) && w.length > 2 && groupOf(w) === "other")
      .sort((a, b) => b[1] - a[1]).slice(0, 30).map(([w]) => w);
    const words = [...new Set([...grouped, ...others])];
    const wi = new Map(words.map((w, i) => [w, i]));
    const M = words.map(() => new Float64Array(ctxWords.length));
    for (const s of sents)
      for (let i = 0; i < s.length; i++) {
        if (!wi.has(s[i])) continue;
        for (let j = Math.max(0, i - 2); j <= Math.min(s.length - 1, i + 2); j++)
          if (j !== i && ci.has(s[j])) M[wi.get(s[i])][ci.get(s[j])] += 1;
      }
    // PPMI with context-distribution smoothing (alpha = 0.75)
    let tot = 0;
    const rs = M.map((r) => r.reduce((a, b) => a + b, 0));
    const cs = new Float64Array(ctxWords.length);
    M.forEach((r) => r.forEach((v, j) => { cs[j] += v; tot += v; }));
    let csA = 0;
    const csa = Array.from(cs, (c) => { const v = Math.pow(c, 0.75); csA += v; return v; });
    const V = M.map((r, i) => {
      const v = Array.from(r, (x, j) => (x ? Math.max(0, Math.log((x / tot) / ((rs[i] / tot) * (csa[j] / csA)))) : 0));
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
    return { words, V, ctxWords, nTokens: sents.flat().length };
  }
  const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  function neighbors(E, vec, k, exclude) {
    return E.words.map((w, i) => [w, cos(vec, E.V[i])]).filter(([w]) => !exclude.includes(w)).sort((a, b) => b[1] - a[1]).slice(0, k);
  }

  // Exact t-SNE (small N, so O(N²) per step is fine).
  function tsneSetup(E, seed) {
    const N = E.words.length, perp = 10, target = Math.log(perp);
    const D = [];
    for (let i = 0; i < N; i++) { D.push(new Float64Array(N)); for (let j = 0; j < N; j++) D[i][j] = Math.max(0, 2 - 2 * cos(E.V[i], E.V[j])); }
    const P = Array.from({ length: N }, () => new Float64Array(N));
    for (let i = 0; i < N; i++) {
      let lo = -Infinity, hi = Infinity, beta = 1;
      for (let it = 0; it < 60; it++) {
        let sum = 0, H = 0;
        for (let j = 0; j < N; j++) { if (j === i) continue; const p = Math.exp(-D[i][j] * beta); P[i][j] = p; sum += p; }
        sum = sum || 1e-12;
        for (let j = 0; j < N; j++) { if (j === i) continue; P[i][j] /= sum; if (P[i][j] > 1e-12) H -= P[i][j] * Math.log(P[i][j]); }
        if (Math.abs(H - target) < 1e-4) break;
        if (H > target) { lo = beta; beta = hi === Infinity ? beta * 2 : (beta + hi) / 2; }
        else { hi = beta; beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2; }
      }
    }
    const Ps = Array.from({ length: N }, () => new Float64Array(N));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) Ps[i][j] = Math.max((P[i][j] + P[j][i]) / (2 * N), 1e-12);
    const rng = seeded(seed);
    const g = () => { let u = rng() || 1e-9, v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return { N, P: Ps, Y: Array.from({ length: N }, () => [g() * 1e-2, g() * 1e-2]), iY: Array.from({ length: N }, () => [0, 0]), gains: Array.from({ length: N }, () => [1, 1]), iter: 0 };
  }
  function tsneStep(T) {
    const { N, P, Y, iY, gains } = T;
    const exag = T.iter < 100 ? 4 : 1, mom = T.iter < 250 ? 0.5 : 0.8, lr = 10;
    const num = Array.from({ length: N }, () => new Float64Array(N));
    let Z = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = Y[i][0] - Y[j][0], dy = Y[i][1] - Y[j][1];
      const q = 1 / (1 + dx * dx + dy * dy);
      num[i][j] = num[j][i] = q; Z += 2 * q;
    }
    let mx = 0, my = 0;
    for (let i = 0; i < N; i++) {
      let gx = 0, gy = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const m = (exag * P[i][j] - num[i][j] / Z) * num[i][j];
        gx += 4 * m * (Y[i][0] - Y[j][0]); gy += 4 * m * (Y[i][1] - Y[j][1]);
      }
      [gx, gy].forEach((gr, d) => {
        gains[i][d] = Math.sign(gr) === Math.sign(iY[i][d]) ? gains[i][d] * 0.8 : gains[i][d] + 0.2;
        if (gains[i][d] < 0.01) gains[i][d] = 0.01;
        iY[i][d] = mom * iY[i][d] - lr * gains[i][d] * gr;
        Y[i][d] += iY[i][d];
      });
      mx += Y[i][0]; my += Y[i][1];
    }
    for (let i = 0; i < N; i++) { Y[i][0] -= mx / N; Y[i][1] -= my / N; }
    T.iter++;
  }

  const core = { seeded, PRE, pretok, BASE, baseId, trainBPE, mergePair, tokenizers, STOP, buildEmbeddings, cos, neighbors, tsneSetup, tsneStep };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.TokensCore = core;
})(typeof window !== "undefined" ? window : globalThis);
