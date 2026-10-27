// Markov chain core: weather chain, power iteration to the stationary distribution, and a tiny word-chain text generator. Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const STATES = ["Sunny", "Cloudy", "Rainy"];
  const DEFAULT_W = [[70, 20, 10], [30, 40, 30], [20, 40, 40]];
  // Turn raw row weights into probabilities that add to 1 (an all-zero row becomes uniform).
  function normalize(W) {
    return W.map((row) => { const s = row.reduce((a, b) => a + Math.max(0, b), 0); return row.map((x) => (s > 0 ? Math.max(0, x) / s : 1 / row.length)); });
  }
  function step(P, i, r) {
    const u = r(); let acc = 0;
    for (let j = 0; j < P[i].length; j++) { acc += P[i][j]; if (u < acc) return j; }
    return P[i].length - 1;
  }
  // Power iteration: start with a distribution and keep applying the table. Returns every step.
  function powerIteration(P, start, iters) {
    const n = P.length, hist = [start.slice()]; let d = start.slice();
    for (let t = 0; t < iters; t++) {
      const nx = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) nx[j] += d[i] * P[i][j];
      d = nx; hist.push(d.slice());
    }
    return hist;
  }
  const stationary = (P) => powerIteration(P, new Array(P.length).fill(1 / P.length), 400).pop();

  // ---- word chain ----
  const CORPUS = "the cat sat on the mat . the cat ate the fish . the dog sat on the rug . the dog chased the cat . the cat chased the mouse . the mouse ate the cheese . the dog ate the bone . a cat sat on the warm rug . a dog ran in the park . the mouse ran in the garden . a bird sat on the dog .";
  const tokens = (t) => t.toLowerCase().split(/\s+/).filter(Boolean);
  // order 1: key = previous word. order 2: key = previous two words.
  function buildModel(text, order) {
    const w = tokens(text), next = {}, starts = [];
    for (let i = 0; i + order < w.length; i++) {
      const key = w.slice(i, i + order).join(" "), nx = w[i + order];
      (next[key] = next[key] || {})[nx] = (next[key][nx] || 0) + 1;
      if (i === 0 || w[i - 1] === ".") starts.push(key);
    }
    return { order, next, starts };
  }
  function nextProbs(model, key) {
    const o = model.next[key]; if (!o) return [];
    const tot = Object.values(o).reduce((a, b) => a + b, 0);
    return Object.entries(o).map(([word, c]) => ({ word, p: c / tot })).sort((a, b) => b.p - a.p);
  }
  function generate(model, r, maxWords = 16) {
    let key = model.starts[Math.floor(r() * model.starts.length)], out = key.split(" ");
    while (out.length < maxWords) {
      const o = nextProbs(model, out.slice(-model.order).join(" ")); if (!o.length) break;
      let u = r(), pick = o[o.length - 1].word;
      for (const e of o) { if ((u -= e.p) < 0) { pick = e.word; break; } }
      out.push(pick); if (pick === ".") break;
    }
    return out.join(" ").replace(/ \./g, ".").replace(/^./, (c) => c.toUpperCase());
  }
  const core = { rng, STATES, DEFAULT_W, normalize, step, powerIteration, stationary, CORPUS, buildModel, nextProbs, generate };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.MarkovCore = core;
})(typeof window !== "undefined" ? window : globalThis);
