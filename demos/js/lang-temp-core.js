// Hot or Cold Words core: an interpolated trigram word model, temperature re-shaping, top-k and top-p (nucleus)
// filtering, sampling and simple diversity / sense scores. Pure logic, runs in Node too.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // words (with apostrophes) and the punctuation marks . , ! ? as their own tokens. Quotes are dropped.
  const tokenize = (text) => (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|[.,!?]/g) || []);

  // Interpolated trigram: P(w | u v) = L3·P3 + L2·P2 + L1·P1 (falls back to bigram + unigram when "u v" was never seen).
  const L3 = 0.6, L2 = 0.37, L1 = 0.03;
  function buildModel(text) {
    const w = tokenize(text), uni = {}, bi = {}, tri = {}, biTot = {}, triTot = {};
    for (let i = 0; i < w.length; i++) {
      uni[w[i]] = (uni[w[i]] || 0) + 1;
      if (i >= 1) { const k = w[i - 1]; (bi[k] = bi[k] || {})[w[i]] = (bi[k][w[i]] || 0) + 1; biTot[k] = (biTot[k] || 0) + 1; }
      if (i >= 2) { const k = w[i - 2] + " " + w[i - 1]; (tri[k] = tri[k] || {})[w[i]] = (tri[k][w[i]] || 0) + 1; triTot[k] = (triTot[k] || 0) + 1; }
    }
    const vocab = Object.keys(uni), total = w.length;
    return { vocab, uni, bi, tri, biTot, triTot, total, size: w.length, cache: new Map() };
  }
  // Base next-word distribution for a context (array of previous tokens), sorted from most to least likely.
  // Results are cached per context (they never change), so callers must not mutate them.
  function baseDist(m, ctx) {
    const v = ctx[ctx.length - 1], u = ctx[ctx.length - 2], key = u + "|" + v;
    if (m.cache && m.cache.has(key)) return m.cache.get(key);
    const tk = u !== undefined ? u + " " + v : null, T3 = tk && m.tri[tk], B2 = v !== undefined && m.bi[v];
    let l3 = T3 ? L3 : 0, l2 = B2 ? L2 : 0, l1 = L1; const s = l3 + l2 + l1; l3 /= s; l2 /= s; l1 /= s;
    const out = m.vocab.map((word) => ({
      word,
      p: l3 * (T3 ? (T3[word] || 0) / m.triTot[tk] : 0) + l2 * (B2 ? (B2[word] || 0) / m.biTot[v] : 0) + l1 * m.uni[word] / m.total,
    }));
    out.sort((a, b) => b.p - a.p || (a.word < b.word ? -1 : 1));
    if (m.cache) m.cache.set(key, out);
    return out;
  }
  // Softmax with temperature on logits log p: q_i ∝ p_i^(1/T). T at or below 0.01 is greedy (all mass on the top word).
  function withTemperature(dist, T) {
    if (T <= 0.01) return dist.map((d, i) => ({ word: d.word, base: d.p, p: i === 0 ? 1 : 0 }));
    const lg = dist.map((d) => Math.log(Math.max(d.p, 1e-300)) / T);
    let mx = -Infinity; for (const x of lg) if (x > mx) mx = x;
    const ex = lg.map((x) => Math.exp(x - mx)), z = ex.reduce((a, b) => a + b, 0);
    return dist.map((d, i) => ({ word: d.word, base: d.p, p: ex[i] / z }));
  }
  // Keep only the top k, and/or the smallest set whose chances add up to at least topP. Then share the mass out again.
  // Input must be sorted by p (descending). Each item gets keep (bool) and final (renormalised chance, 0 if dropped).
  function filter(dist, opts) {
    const k = opts && opts.topK ? opts.topK : Infinity, P = opts && opts.topP ? opts.topP : 1;
    let sorted = true; for (let i = 1; i < dist.length && sorted; i++) if (dist[i].p > dist[i - 1].p) sorted = false;
    const order = dist.map((d, i) => i); if (!sorted) order.sort((a, b) => dist[b].p - dist[a].p);
    const keep = new Array(dist.length).fill(false); let acc = 0, n = 0;
    for (const i of order) {
      if (n >= k) break;
      if (n > 0 && acc >= P - 1e-12) break;
      keep[i] = true; acc += dist[i].p; n++;
    }
    const z = dist.reduce((s, d, i) => s + (keep[i] ? d.p : 0), 0) || 1;
    return dist.map((d, i) => ({ word: d.word, base: d.base, p: d.p, keep: keep[i], final: keep[i] ? d.p / z : 0 }));
  }
  // Full pipeline for one step.
  const nextDist = (m, ctx, opts) => filter(withTemperature(baseDist(m, ctx), opts.T), opts);
  function sample(dist, r) {
    let u = r(), last = null;
    for (const d of dist) { if (!d.final) continue; last = d; if ((u -= d.final) < 0) return d; }
    return last;
  }
  // Generate n tokens after a prompt. Returns the steps: { word, chance, rank, kept } for each chosen word.
  function generate(m, prompt, n, opts, r) {
    const ctx = tokenize(prompt), steps = [];
    for (let i = 0; i < n; i++) {
      const d = nextDist(m, ctx, opts), pick = sample(d, r), rank = d.indexOf(pick) + 1;
      steps.push({ word: pick.word, chance: pick.final, rank, kept: d.filter((x) => x.keep).length });
      ctx.push(pick.word);
    }
    return steps;
  }
  // Join tokens into readable text: no space before punctuation, capital after a full stop.
  function detok(words) {
    let s = "", cap = true;
    for (const w of words) {
      if (/^[.,!?]$/.test(w)) { s += w; if (w !== ",") cap = true; continue; }
      const t = w === "i" ? "I" : cap ? w[0].toUpperCase() + w.slice(1) : w;
      s += (s ? " " : "") + t; cap = false;
    }
    return s;
  }
  // Share of neighbouring word pairs (including the join with the prompt) that really appear in the stories.
  function sense(m, prompt, words) {
    const all = tokenize(prompt).slice(-1).concat(words); let ok = 0, n = 0;
    for (let i = 1; i < all.length; i++) { n++; if (m.bi[all[i - 1]] && m.bi[all[i - 1]][all[i]]) ok++; }
    return n ? ok / n : 1;
  }
  // Diversity of several runs: distinct runs, and distinct-2 (unique word pairs / all word pairs).
  function diversity(runs) {
    const seen = new Set(), pairs = new Set(); let total = 0;
    for (const r of runs) { seen.add(r.join(" ")); for (let i = 1; i < r.length; i++) { pairs.add(r[i - 1] + " " + r[i]); total++; } }
    return { distinctRuns: seen.size, distinct2: total ? pairs.size / total : 0 };
  }
  // Repeat the same prompt several times with the same settings.
  function repeat(m, prompt, n, times, opts, r) {
    const runs = [];
    for (let t = 0; t < times; t++) runs.push(generate(m, prompt, n, opts, r).map((s) => s.word));
    const div = diversity(runs), sn = runs.reduce((a, w) => a + sense(m, prompt, w), 0) / runs.length;
    return { runs, distinctRuns: div.distinctRuns, distinct2: div.distinct2, sense: sn };
  }
  // Entropy in bits of the final distribution (how spread out the chances are).
  const entropy = (dist) => -dist.reduce((s, d) => s + (d.final > 0 ? d.final * Math.log2(d.final) : 0), 0);

  const core = { rng, tokenize, buildModel, baseDist, withTemperature, filter, nextDist, sample, generate, detok, sense, diversity, repeat, entropy };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.TempCore = core;
})(typeof window !== "undefined" ? window : globalThis);
