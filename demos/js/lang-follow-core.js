// Robo Follows Instructions — world + tiny attention policy + REINFORCE.
// No DOM, so it also runs in Node for testing.
(function (root) {
  const N = 7;
  const COLORS = ["red", "blue", "green"];
  const SHAPES = ["star", "circle", "square"];
  const VOCAB = ["go", "to", "the", ...COLORS, ...SHAPES];
  const D = 8; // embedding size
  const F = 6; // object features: 3 colour + 3 shape one-hots
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up right down left
  const DIR_NAMES = ["up", "right", "down", "left"];

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

  const feat = (o) => {
    const f = new Array(F).fill(0);
    f[COLORS.indexOf(o.color)] = 1;
    f[3 + SHAPES.indexOf(o.shape)] = 1;
    return f;
  };

  // A world: Robo + 3 objects with different colour/shape combos.
  function makeWorld(r = Math.random) {
    const cells = new Set();
    const pick = () => {
      let x, y;
      do { x = Math.floor(r() * N); y = Math.floor(r() * N); } while (cells.has(x + "," + y));
      cells.add(x + "," + y);
      return [x, y];
    };
    const robo = pick();
    const objs = [];
    const used = new Set();
    // make distractors share a colour or shape with each other, so both words matter
    const c0 = COLORS[Math.floor(r() * 3)], s0 = SHAPES[Math.floor(r() * 3)];
    const combos = [[c0, s0], [c0, SHAPES[(SHAPES.indexOf(s0) + 1 + Math.floor(r() * 2)) % 3]], [COLORS[(COLORS.indexOf(c0) + 1 + Math.floor(r() * 2)) % 3], s0]];
    for (const [color, shape] of combos) {
      if (used.has(color + shape)) continue;
      used.add(color + shape);
      const [x, y] = pick();
      objs.push({ color, shape, x, y });
    }
    return { robo, objs };
  }

  // Instruction for a target object: "go to the blue star", or just the word that is enough.
  function makeInstruction(world, target, r = Math.random) {
    const t = world.objs[target];
    const uniqColor = world.objs.filter((o) => o.color === t.color).length === 1;
    const uniqShape = world.objs.filter((o) => o.shape === t.shape).length === 1;
    const v = r();
    const words = ["go", "to"];
    if (r() < 0.4) words.push("the");
    if (v < 0.25 && uniqColor) words.push(t.color);
    else if (v < 0.5 && uniqShape) words.push(t.shape);
    else words.push(t.color, t.shape);
    return words;
  }

  // ---------- the model ----------
  // Each word has an embedding e. Each object makes a query q = Wq·features.
  // Attention of object k on word t: softmax_t(q_k·e_t). Match score m_k = Σ_t q_k·e_t.
  // p = softmax(m) says which object the words point at; moves head towards it.
  function newBrain(r = Math.random) {
    const g = () => (r() * 2 - 1) * 0.3;
    return {
      E: VOCAB.map(() => Array.from({ length: D }, g)),
      Wq: Array.from({ length: D }, () => Array.from({ length: F }, g)),
      baseline: 0,
      episodes: 0,
    };
  }
  const cloneBrain = (b) => JSON.parse(JSON.stringify(b));

  function query(brain, f) {
    return brain.Wq.map((row) => row.reduce((s, w, i) => s + w * f[i], 0));
  }
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  function softmax(v) {
    const m = Math.max(...v);
    const e = v.map((x) => Math.exp(x - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / s);
  }

  // Full forward pass, keeping everything the UI wants to show.
  function think(brain, world, words) {
    const ids = words.map((w) => VOCAB.indexOf(w));
    const objs = world.objs.map((o) => {
      const f = feat(o);
      const q = query(brain, f);
      const raw = ids.map((id) => dot(q, brain.E[id]));
      return { f, q, raw, att: softmax(raw.map((x) => x * 1.5)), m: raw.reduce((a, b) => a + b, 0) };
    });
    const p = softmax(objs.map((o) => o.m));
    // move scores: how much each direction helps reach each object, weighted by p
    const [rx, ry] = world.robo;
    // A move is "good for object k" if it gets closer to k without stepping on a different object.
    const good = world.objs.map((o, k) => {
      const lands = ([dx, dy]) => world.objs.some((q, j) => j !== k && q.x === rx + dx && q.y === ry + dy);
      const closer = ([dx, dy]) => Math.abs(o.x - rx - dx) + Math.abs(o.y - ry - dy) < Math.abs(o.x - rx) + Math.abs(o.y - ry);
      let g = DIRS.map((d) => (closer(d) && !lands(d) ? 1 : 0));
      if (!g.some(Boolean)) g = DIRS.map((d) => {
        const nx = rx + d[0], ny = ry + d[1];
        return nx >= 0 && ny >= 0 && nx < N && ny < N && !lands(d) ? 1 : 0;
      });
      const n = g.reduce((a, b) => a + b, 0) || 1;
      return g.map((x) => x / n);
    });
    const eps = 0.04;
    const moves = DIRS.map((_, a) => eps / 4 + (1 - eps) * p.reduce((s, pk, k) => s + pk * good[k][a], 0));
    return { ids, objs, p, good, moves };
  }

  // One episode. Returns trajectory for learning + replay.
  function runEpisode(brain, world, words, target, r = Math.random, greedy = false, maxSteps = 18) {
    const w = { robo: world.robo.slice(), objs: world.objs };
    const steps = [];
    let reached = -1;
    for (let s = 0; s < maxSteps; s++) {
      const th = think(brain, w, words);
      let a;
      if (greedy) a = th.moves.indexOf(Math.max(...th.moves));
      else {
        let u = r(), acc = 0;
        a = 3;
        for (let i = 0; i < 4; i++) { acc += th.moves[i]; if (u < acc) { a = i; break; } }
      }
      steps.push({ robo: w.robo.slice(), th, a });
      const nx = Math.max(0, Math.min(N - 1, w.robo[0] + DIRS[a][0]));
      const ny = Math.max(0, Math.min(N - 1, w.robo[1] + DIRS[a][1]));
      w.robo = [nx, ny];
      reached = w.objs.findIndex((o) => o.x === nx && o.y === ny);
      if (reached >= 0) break;
    }
    const reward = reached === target ? 1 : reached >= 0 ? -1 : -0.5;
    return { steps, reached, reward, end: w.robo.slice() };
  }

  // REINFORCE with a running-average baseline, gradient through p into E and Wq.
  function learn(brain, ep, lr = 0.15) {
    const adv = ep.reward - brain.baseline;
    brain.baseline += 0.05 * (ep.reward - brain.baseline);
    brain.episodes++;
    const gE = brain.E.map((r) => r.map(() => 0));
    const gW = brain.Wq.map((r) => r.map(() => 0));
    for (const st of ep.steps) {
      const { th, a } = st;
      const pa = th.moves[a];
      // π(a) = eps/4 + (1−eps)·Σ_k p_k·good_k(a)  ⇒  ∂log π(a)/∂m_j = (1−eps)·p_j·(good_j(a) − G)/π(a)
      const eps = 0.04;
      const G = th.p.reduce((s, pk, k) => s + pk * th.good[k][a], 0);
      const dm = th.p.map((pj, j) => ((1 - eps) * pj * (th.good[j][a] - G)) / pa);
      th.objs.forEach((o, j) => {
        const g = dm[j];
        if (!g) return;
        // m_j = Σ_t q_j·e_t ; q_j = Wq f_j
        const esum = new Array(D).fill(0);
        for (const id of th.ids) for (let d = 0; d < D; d++) { esum[d] += brain.E[id][d]; gE[id][d] += g * o.q[d]; }
        for (let d = 0; d < D; d++) for (let i = 0; i < F; i++) gW[d][i] += g * esum[d] * o.f[i];
      });
    }
    const n = Math.max(1, ep.steps.length);
    const k = (lr * adv) / Math.sqrt(n);
    for (let i = 0; i < gE.length; i++) for (let d = 0; d < D; d++) brain.E[i][d] += k * gE[i][d];
    for (let d = 0; d < D; d++) for (let i = 0; i < F; i++) brain.Wq[d][i] += k * gW[d][i];
  }

  // Train one random episode; returns the episode.
  function trainOne(brain, r = Math.random, lr) {
    const world = makeWorld(r);
    const target = Math.floor(r() * world.objs.length);
    const words = makeInstruction(world, target, r);
    const ep = runEpisode(brain, world, words, target, r);
    learn(brain, ep, lr);
    return { world, target, words, ep };
  }

  // Greedy score on a fixed set of test tasks.
  function evaluate(brain, tasks) {
    let ok = 0;
    for (const t of tasks) if (runEpisode(brain, t.world, t.words, t.target, Math.random, true).reached === t.target) ok++;
    return ok / tasks.length;
  }
  function makeTests(n = 60, seed = 99) {
    const r = rng(seed);
    return Array.from({ length: n }, () => {
      const world = makeWorld(r);
      const target = Math.floor(r() * world.objs.length);
      return { world, target, words: makeInstruction(world, target, r) };
    });
  }

  const api = { N, COLORS, SHAPES, VOCAB, DIRS, DIR_NAMES, rng, makeWorld, makeInstruction, newBrain, cloneBrain, think, runEpisode, learn, trainOne, evaluate, makeTests };
  root.Follow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
