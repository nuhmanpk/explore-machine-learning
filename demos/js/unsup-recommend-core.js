// Movie Recommender core: made-up movies/viewers, user-based collaborative filtering, tiny matrix factorisation.
// Pure logic, runs in the browser (window.RecCore) and in Node (module.exports).
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // hidden genres: 0 action, 1 funny, 2 magic. Kids never see these numbers.
  const GENRES = ["action", "funny", "magic"];
  const MOVIES = [
    { name: "Dragon School", g: 2, icon: "star", mix: [0.25, 0, 1] },
    { name: "Space Pups", g: 1, icon: "rocket", mix: [0.2, 1, 0] },
    { name: "Turbo Turtles", g: 0, icon: "zap", mix: [1, 0.3, 0] },
    { name: "The Wizard's Cat", g: 2, icon: "wand", mix: [0, 0.2, 1] },
    { name: "Pie Fight Planet", g: 1, icon: "candy", mix: [0, 1, 0.1] },
    { name: "Robot Rescue Squad", g: 0, icon: "robot", mix: [1, 0, 0.25] },
    { name: "Giggle Island", g: 1, icon: "boat", mix: [0.1, 1, 0.1] },
    { name: "Mountain Chase", g: 0, icon: "flag", mix: [1, 0.1, 0.1] },
    { name: "Moon Fairies", g: 2, icon: "moon", mix: [0, 0, 1] },
    { name: "Ninja Noodles", g: 0, icon: "target", mix: [0.8, 0.5, 0] },
    { name: "Silly Ghost Hotel", g: 1, icon: "bug", mix: [0, 0.8, 0.5] },
    { name: "Crystal Quest", g: 2, icon: "gift", mix: [0.5, 0, 0.9] },
  ];
  const NAMES = ["Ava", "Ben", "Cleo", "Dev", "Ella", "Finn", "Gia", "Hugo", "Iris", "Jay", "Kai", "Lena", "Max", "Nora", "Omar", "Pia", "Quinn", "Ravi", "Sam", "Tess"];
  const GROUP_NAMES = ["Action fans", "Giggle fans", "Magic fans"];

  function taste(group, r) { const t = [0.12 + r() * 0.2, 0.12 + r() * 0.2, 0.12 + r() * 0.2]; t[group] = 1; return t; }
  function trueRating(t, mix, noise) {
    const dot = t[0] * mix[0] + t[1] * mix[1] + t[2] * mix[2]; // about 0.1 .. 1.2
    const s = 1 + 4 * Math.min(1, Math.max(0, (dot - 0.12) / 0.85));
    return Math.min(5, Math.max(1, Math.round(s + noise)));
  }
  // 20 viewers in latent taste groups; ~35% of ratings missing; noise on every rating.
  function makeData(seed) {
    const r = rng(seed || 7);
    const viewers = NAMES.map((name, i) => {
      const group = i % 3;
      const t = taste(group, r);
      const ratings = MOVIES.map((m) => (r() < 0.35 ? null : trueRating(t, m.mix, gauss(r) * 0.55)));
      return { name, group, ratings };
    });
    // shuffle so the "viewers join one by one" order mixes the groups (deterministic)
    for (let i = viewers.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [viewers[i], viewers[j]] = [viewers[j], viewers[i]]; }
    return { movies: MOVIES.map((m) => ({ ...m })), viewers };
  }
  // hide ~frac of known ratings for testing; also a stable keep-rank per rating for the "fewer ratings" slider
  function split(data, seed, frac) {
    const r = rng((seed || 7) * 31 + 5);
    const train = data.viewers.map((v) => v.ratings.slice());
    const rank = data.viewers.map((v) => v.ratings.map(() => r()));
    const test = [];
    train.forEach((row, u) => row.forEach((x, m) => { if (x !== null && r() < (frac || 0.2)) { test.push({ u, m, r: x }); row[m] = null; } }));
    return { train, test, rank };
  }
  function thin(train, rank, density) {
    return train.map((row, u) => row.map((x, m) => (x !== null && rank[u][m] < density ? x : null)));
  }

  const mean = (row) => { let s = 0, n = 0; row.forEach((x) => { if (x !== null && x !== undefined) { s += x; n++; } }); return n ? s / n : null; };

  // similarity between two rating rows over co-rated movies. "cosine": plain cosine on raw stars. "pearson": cosine after subtracting each person's own average.
  function similarity(a, b, method) {
    const ma = mean(a), mb = mean(b);
    let dot = 0, na = 0, nb = 0, n = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] == null || b[i] == null) continue;
      const x = method === "pearson" ? a[i] - ma : a[i], y = method === "pearson" ? b[i] - mb : b[i];
      dot += x * y; na += x * x; nb += y * y; n++;
    }
    if (n < 2 || na < 1e-9 || nb < 1e-9) return { sim: 0, n };
    const raw = dot / Math.sqrt(na * nb);
    return { sim: raw * Math.min(1, n / 4), n }; // few shared movies -> trust less
  }

  function movieAverage(matrix, m) { let s = 0, n = 0; matrix.forEach((row) => { if (row[m] != null) { s += row[m]; n++; } }); return n ? { avg: s / n, n } : { avg: null, n: 0 }; }
  function globalMean(matrix) { let s = 0, n = 0; matrix.forEach((row) => row.forEach((x) => { if (x != null) { s += x; n++; } })); return n ? s / n : 3; }

  // predict one movie for a rating row. pool = matrix rows of other viewers. Returns {pred, used:[{v,sim,rating}], fallback}
  function predictCF(row, pool, m, opts) {
    const { method = "pearson", k = 5, exclude = -1, poolSize = pool.length } = opts || {};
    const mu = mean(row);
    const cands = [];
    for (let v = 0; v < Math.min(poolSize, pool.length); v++) {
      if (v === exclude || pool[v][m] == null) continue;
      const s = similarity(row, pool[v], method);
      if (s.sim > 0.05) cands.push({ v, sim: s.sim, rating: pool[v][m], mean: mean(pool[v]) });
    }
    cands.sort((a, b) => b.sim - a.sim);
    const used = cands.slice(0, k);
    const base = movieAverage(pool.slice(0, poolSize), m);
    if (!used.length || mu === null) {
      if (base.avg === null) return { pred: null, used: [], fallback: "cold" };
      return { pred: base.avg, used: [], fallback: "crowd" };
    }
    let num = 0, den = 0;
    used.forEach((c) => { num += c.sim * (c.rating - c.mean); den += c.sim; });
    const pred = Math.min(5, Math.max(1, mu + num / den));
    return { pred, used, fallback: null };
  }
  function topTwins(row, pool, opts) {
    const { method = "pearson", poolSize = pool.length, exclude = -1 } = opts || {};
    const out = [];
    for (let v = 0; v < Math.min(poolSize, pool.length); v++) { if (v === exclude) continue; const s = similarity(row, pool[v], method); out.push({ v, sim: s.sim, n: s.n }); }
    return out.sort((a, b) => b.sim - a.sim);
  }
  function rmseCF(train, test, opts) {
    const { poolSize = train.length } = opts || {};
    let se = 0, n = 0;
    test.forEach((t) => {
      if (t.u >= poolSize && false) return;
      const p = predictCF(train[t.u], train, t.m, { ...opts, exclude: t.u });
      const pr = p.pred === null ? globalMean(train) : p.pred;
      se += (pr - t.r) ** 2; n++;
    });
    return n ? Math.sqrt(se / n) : 0;
  }
  function rmseBaseline(train, test) {
    let se = 0;
    test.forEach((t) => { const b = movieAverage(train, t.m); se += ((b.avg === null ? globalMean(train) : b.avg) - t.r) ** 2; });
    return Math.sqrt(se / test.length);
  }

  // ---- tiny matrix factorisation: rating ~ mu + bu + bi + p_u . q_i, rank 2 so we can draw it ----
  function newMF(nu, ni, seed, rank) {
    const r = rng(seed || 3), K = rank || 2;
    const init = () => Array.from({ length: K }, () => (r() - 0.5) * 0.3);
    return { K, P: Array.from({ length: nu }, init), Q: Array.from({ length: ni }, init), bu: new Array(nu).fill(0), bi: new Array(ni).fill(0), mu: 3, epoch: 0, r };
  }
  function mfPredict(mf, u, i) { let s = mf.mu + mf.bu[u] + mf.bi[i]; for (let k = 0; k < mf.K; k++) s += mf.P[u][k] * mf.Q[i][k]; return Math.min(5, Math.max(1, s)); }
  function mfEpoch(mf, matrix, lr, reg) {
    lr = lr || 0.03; reg = reg === undefined ? 0.04 : reg;
    const items = [];
    matrix.forEach((row, u) => row.forEach((x, i) => { if (x != null) items.push([u, i, x]); }));
    if (!items.length) return;
    mf.mu = globalMean(matrix);
    for (let j = items.length - 1; j > 0; j--) { const t = Math.floor(mf.r() * (j + 1)); [items[j], items[t]] = [items[t], items[j]]; }
    items.forEach(([u, i, x]) => {
      let p = mf.mu + mf.bu[u] + mf.bi[i];
      for (let k = 0; k < mf.K; k++) p += mf.P[u][k] * mf.Q[i][k];
      const e = x - p;
      mf.bu[u] += lr * (e - reg * mf.bu[u]);
      mf.bi[i] += lr * (e - reg * mf.bi[i]);
      for (let k = 0; k < mf.K; k++) {
        const pu = mf.P[u][k], qi = mf.Q[i][k];
        mf.P[u][k] += lr * (e * qi - reg * pu);
        mf.Q[i][k] += lr * (e * pu - reg * qi);
      }
    });
    mf.epoch++;
  }
  function mfRmse(mf, list) {
    if (!list.length) return 0;
    let se = 0;
    list.forEach((t) => { se += (mfPredict(mf, t.u, t.m) - t.r) ** 2; });
    return Math.sqrt(se / list.length);
  }
  function listOf(matrix) { const l = []; matrix.forEach((row, u) => row.forEach((x, m) => { if (x != null) l.push({ u, m, r: x }); })); return l; }

  const api = { rng, GENRES, MOVIES, NAMES, GROUP_NAMES, makeData, split, thin, mean, similarity, predictCF, topTwins, rmseCF, rmseBaseline, movieAverage, globalMean, newMF, mfPredict, mfEpoch, mfRmse, listOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RecCore = api;
})(typeof window !== "undefined" ? window : globalThis);
