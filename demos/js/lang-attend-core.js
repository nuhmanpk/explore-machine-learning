// Where to Look — a tiny trainable self-attention model for pronoun puzzles.
// No DOM, so it also runs in Node for testing.
(function (root) {
  const D = 12; // size of every word vector
  const MAXLEN = 16;
  const ANIMALS = ["cat", "dog", "mouse", "bird", "rabbit", "fox", "horse", "duck"];
  const THINGS = ["trophy", "box", "ball", "book", "cup", "bag", "suitcase", "drawer"];
  const PLACES = ["fence", "tree", "rock", "house"];
  const VERBS = ["chased", "followed", "teased"];
  const PREPS = ["near", "behind", "under"];
  // adjectives that describe the one doing the chasing (subject) / being chased (object)
  const ADJ_SUBJ = ["hungry", "fast", "angry"];
  const ADJ_OBJ = ["scared", "tired", "slow"];
  const FLIP = { hungry: "scared", scared: "hungry", fast: "tired", tired: "fast", angry: "slow", slow: "angry", big: "small", small: "big" };
  const VOCAB = ["the", "because", "it", "was", "too", "didn't", "fit", "in", ...ANIMALS, ...THINGS, ...PLACES, ...VERBS, ...PREPS, ...ADJ_SUBJ, ...ADJ_OBJ, "big", "small"];
  const ID = {};
  VOCAB.forEach((w, i) => (ID[w] = i));
  const V = VOCAB.length;
  const NOUNS = new Set([...ANIMALS, ...THINGS, ...PLACES]);

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
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  function pick2(r, a) {
    const i = Math.floor(r() * a.length);
    let j = Math.floor(r() * (a.length - 1));
    if (j >= i) j++;
    return [a[i], a[j]];
  }

  // kind: "chase" | "size" | "any". distractor: true/false/undefined(random)
  function makeSentence(r, o = {}) {
    const kind = o.kind || (r() < 0.6 ? "chase" : "size");
    let words;
    if (kind === "chase") {
      const [a, b] = pick2(r, ANIMALS);
      const d = o.distractor === undefined ? r() < 0.5 : o.distractor;
      words = ["the", a, pick(r, VERBS), "the", b];
      if (d) words.push(pick(r, PREPS), "the", pick(r, PLACES));
      const subj = o.subject === undefined ? r() < 0.5 : o.subject;
      const adj = o.adj || pick(r, subj ? ADJ_SUBJ : ADJ_OBJ);
      words.push("because", "it", "was", adj);
    } else {
      const [a, b] = pick2(r, THINGS);
      const adj = o.adj || (r() < 0.5 ? "big" : "small");
      words = ["the", a, "didn't", "fit", "in", "the", b, "because", "it", "was", "too", adj];
    }
    return fromWords(words);
  }
  function fromWords(words) {
    const it = words.indexOf("it");
    const adj = words.length - 1;
    const cands = [];
    words.forEach((w, i) => { if (NOUNS.has(w)) cands.push(i); });
    const a = words[adj];
    const subj = ADJ_SUBJ.includes(a) || a === "big";
    // subject noun = first noun; object noun = second noun
    const target = subj ? cands[0] : cands[1];
    return { words, ids: words.map((w) => ID[w]), it, adj, cands, target };
  }
  function flipSentence(s) {
    const w = s.words.slice();
    w[w.length - 1] = FLIP[w[w.length - 1]];
    return fromWords(w);
  }
  const key = (s) => s.words.join(" ");
  function makeSet(seed, n, avoid) {
    const r = rng(seed), out = [], seen = new Set();
    let guard = 0;
    while (out.length < n && guard++ < n * 50) {
      const s = makeSentence(r);
      const k = key(s);
      if (seen.has(k) || (avoid && avoid.has(k))) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }

  // ---- parameters in one flat array: E (V×D), P (MAXLEN×D), Wq (D×D), Wk (D×D)
  const OFF = { E: 0, P: V * D, Wq: V * D + MAXLEN * D, Wk: V * D + MAXLEN * D + D * D };
  const NP = OFF.Wk + D * D;
  function newBrain(seed = 7) {
    const r = rng(seed);
    const g = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) * 1.4; };
    const th = new Float64Array(NP);
    for (let i = 0; i < NP; i++) th[i] = g() * (i < OFF.Wq ? 0.3 : 0.25);
    return { th, m: new Float64Array(NP), v: new Float64Array(NP), t: 0, rounds: 0, rng: rng(seed + 1000) };
  }
  function cloneBrain(b) { return { ...b, th: b.th.slice(), m: b.m.slice(), v: b.v.slice() }; }

  // Attention of the word at `asker` over all words. mask: Set of hidden positions.
  // The word "it" asks using its own vector PLUS the clue word at the end ("was hungry"), like a first layer
  // would have mixed in. Any other word just asks with its own vector.
  function forward(th, s, asker = s.it, mask = null) {
    const n = s.ids.length;
    const x = new Float64Array(n * D), k = new Float64Array(n * D), c = new Float64Array(D), q = new Float64Array(D);
    for (let j = 0; j < n; j++) for (let d = 0; d < D; d++) x[j * D + d] = th[OFF.E + s.ids[j] * D + d] + th[OFF.P + j * D + d];
    const hid = (j) => mask && mask.has(j);
    const ctx = (j) => { for (let d = 0; d < D; d++) c[d] += th[OFF.E + s.ids[j] * D + d]; };
    ctx(asker);
    if (asker === s.it && !hid(s.adj)) ctx(s.adj);
    for (let i = 0; i < D; i++) {
      let a = 0; for (let d = 0; d < D; d++) a += th[OFF.Wq + i * D + d] * c[d];
      q[i] = a;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < D; i++) {
      let a = 0; for (let d = 0; d < D; d++) a += th[OFF.Wk + i * D + d] * x[j * D + d];
      k[j * D + i] = a;
    }
    const sc = new Float64Array(n), a = new Float64Array(n);
    let mx = -1e18;
    const rs = 1 / Math.sqrt(D);
    for (let j = 0; j < n; j++) {
      if (hid(j)) { sc[j] = -1e18; continue; }
      let z = 0; for (let d = 0; d < D; d++) z += q[d] * k[j * D + d];
      sc[j] = z * rs;
      if (sc[j] > mx) mx = sc[j];
    }
    let sum = 0;
    for (let j = 0; j < n; j++) { a[j] = hid(j) ? 0 : Math.exp(sc[j] - mx); sum += a[j]; }
    for (let j = 0; j < n; j++) a[j] /= sum;
    return { a, x, k, c, q, n };
  }

  // loss = -log(attention on the right noun); accumulates gradient into g. Returns loss.
  function lossGrad(th, s, g) {
    const f = forward(th, s), n = f.n, rs = 1 / Math.sqrt(D);
    const ds = new Float64Array(n);
    for (let j = 0; j < n; j++) ds[j] = f.a[j] - (j === s.target ? 1 : 0);
    const dq = new Float64Array(D);
    for (let j = 0; j < n; j++) for (let d = 0; d < D; d++) dq[d] += ds[j] * f.k[j * D + d] * rs;
    const dc = new Float64Array(D);
    for (let i = 0; i < D; i++) for (let d = 0; d < D; d++) {
      g[OFF.Wq + i * D + d] += dq[i] * f.c[d];
      dc[d] += th[OFF.Wq + i * D + d] * dq[i];
    }
    for (let d = 0; d < D; d++) { g[OFF.E + s.ids[s.it] * D + d] += dc[d]; g[OFF.E + s.ids[s.adj] * D + d] += dc[d]; }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < D; i++) {
        const dk = ds[j] * f.q[i] * rs;
        for (let d = 0; d < D; d++) {
          g[OFF.Wk + i * D + d] += dk * f.x[j * D + d];
          const dx = th[OFF.Wk + i * D + d] * dk;
          g[OFF.E + s.ids[j] * D + d] += dx;
          g[OFF.P + j * D + d] += dx;
        }
      }
    }
    return -Math.log(Math.max(f.a[s.target], 1e-12));
  }

  // One "round": a batch of sentences, one Adam step.
  function trainRound(b, trainSet, batch = 6, lr = 0.004) {
    const g = new Float64Array(NP);
    let L = 0;
    for (let i = 0; i < batch; i++) L += lossGrad(b.th, trainSet[Math.floor(b.rng() * trainSet.length)], g);
    b.t++; b.rounds++;
    const b1 = 0.9, b2 = 0.999, c1 = 1 - Math.pow(b1, b.t), c2 = 1 - Math.pow(b2, b.t);
    for (let i = 0; i < NP; i++) {
      const gi = g[i] / batch;
      b.m[i] = b1 * b.m[i] + (1 - b1) * gi;
      b.v[i] = b2 * b.v[i] + (1 - b2) * gi * gi;
      b.th[i] -= (lr * (b.m[i] / c1)) / (Math.sqrt(b.v[i] / c2) + 1e-8);
    }
    return L / batch;
  }

  function guess(th, s, mask) {
    const f = forward(th, s, s.it, mask);
    let best = -1;
    for (const j of s.cands) if (!(mask && mask.has(j)) && (best < 0 || f.a[j] > f.a[best])) best = j;
    return { best, a: f.a };
  }
  function evaluate(th, set) {
    let ok = 0, att = 0;
    for (const s of set) {
      const g = guess(th, s);
      if (g.best === s.target) ok++;
      att += g.a[s.target];
    }
    return { acc: ok / set.length, att: att / set.length };
  }

  const api = { D, VOCAB, ANIMALS, THINGS, PLACES, ADJ_SUBJ, ADJ_OBJ, FLIP, NP, OFF, rng, makeSentence, fromWords, flipSentence, makeSet, key, newBrain, cloneBrain, forward, lossGrad, trainRound, guess, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Attend = api;
})(typeof window !== "undefined" ? window : globalThis);
