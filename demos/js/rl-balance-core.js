// Balance the Pole core — CartPole physics (same constants as Gymnasium CartPole-v1) + tabular Q-learning pieces.
// No DOM; runs in Node too. Pass `rnd` (a () => [0,1) function, e.g. a seeded RNG) for determinism.
(function (root) {
  // ---------- physics ----------
  const G = 9.8, MC = 1, MP = 0.1, L = 0.5, FORCE = 10, TAU = 0.02;
  const XMAX = 2.4, TMAX = (12 * Math.PI) / 180, MAXT = 500;
  function physics(s, f) {
    const [, xd, t, td] = s;
    const ct = Math.cos(t), st = Math.sin(t), tm = MC + MP;
    const tmp = (f + MP * L * td * td * st) / tm;
    const ta = (G * st - ct * tmp) / (L * (4 / 3 - (MP * ct * ct) / tm));
    const xa = tmp - (MP * L * ta * ct) / tm;
    s[0] += TAU * xd; s[1] += TAU * xa; s[2] += TAU * td; s[3] += TAU * ta;
  }
  const failed = (s) => Math.abs(s[0]) > XMAX || Math.abs(s[2]) > TMAX;
  const randStart = (r = 0.05, rand = (a, b) => a + Math.random() * (b - a)) => [0, 0, 0, 0].map(() => rand(-r, r));

  // ---------- Q-table: cart velocity × angle × angular velocity (cart position ignored) ----------
  // Tuned offline: solves (20-try average ≥ 475 steps) in 212–305 tries over 8 seeds.
  const BINS = [1, 4, 8, 10], LIMS = [XMAX, 2, TMAX, 2.5];
  const NS = BINS.reduce((a, b) => a * b, 1);
  function binOf(i, v) { return Math.max(0, Math.min(BINS[i] - 1, Math.floor(((v + LIMS[i]) / (2 * LIMS[i])) * BINS[i]))); }
  function disc(s) { let k = 0; for (let i = 0; i < 4; i++) k = k * BINS[i] + binOf(i, s[i]); return k; }
  const decay = (min, ep) => Math.max(min, Math.min(1, 1 - Math.log10((ep + 1) / 25)));
  const greedy = (Q, k, rnd = Math.random) => (Q[k * 2 + 1] > Q[k * 2] ? 1 : Q[k * 2 + 1] < Q[k * 2] ? 0 : rnd() < 0.5 ? 0 : 1);

  // One learning step on state s (mutated): pick an action (explore with prob eps), push, update the Q-table.
  // Returns { k, a, explored, done }.
  function learnStep(Q, s, eps, alpha, rnd = Math.random) {
    const k = disc(s);
    const explored = rnd() < eps;
    const a = explored ? (rnd() < 0.5 ? 0 : 1) : greedy(Q, k, rnd);
    physics(s, a ? FORCE : -FORCE);
    const done = failed(s);
    const nk = disc(s);
    const target = done ? 0 : 1 + 0.99 * Math.max(Q[nk * 2], Q[nk * 2 + 1]);
    Q[k * 2 + a] += alpha * (target - Q[k * 2 + a]);
    return { k, a, explored, done };
  }

  const api = { G, MC, MP, L, FORCE, TAU, XMAX, TMAX, MAXT, physics, failed, randStart, BINS, LIMS, NS, binOf, disc, decay, greedy, learnStep };
  root.BalanceCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
