// Mouse Finds Cheese core — grid-world constants, preset mazes, and one real Q-learning step. No DOM; runs in Node too.
// Pass `rnd` (a () => [0,1) function) for determinism.
(function (root) {
  const N = 8;
  const EMPTY = 0, WALL = 1, TRAP = 2, CHEESE = 3;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
  const R_CHEESE = 10, R_TRAP = -10, R_STEP = -0.1, R_BUMP = -0.3, MAX_STEPS = 150;

  const PRESETS = {
    tricky: [
      "M..#....",
      ".#.#.##.",
      ".#...#..",
      ".####.T.",
      "......#.",
      "T##.#.#.",
      "...#..#.",
      ".#...T#C",
    ],
    cliff: [
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "MTTTTTTC",
    ],
    open: [
      "M.......",
      "........",
      "...T....",
      "........",
      ".....T..",
      "..T.....",
      "........",
      ".......C",
    ],
    empty: [
      "M.......",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
    ],
  };

  const idx = (x, y) => y * N + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  // Fills `grid` (Uint8Array N*N) from a preset and returns the mouse's start cell.
  function loadPreset(name, grid, start = { x: 0, y: 0 }) {
    grid.fill(EMPTY);
    PRESETS[name].forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === "#") grid[idx(x, y)] = WALL;
      else if (ch === "T") grid[idx(x, y)] = TRAP;
      else if (ch === "C") grid[idx(x, y)] = CHEESE;
      else if (ch === "M") start = { x, y };
    }));
    return start;
  }

  const maxQ = (Q, s) => Math.max(Q[s * 4], Q[s * 4 + 1], Q[s * 4 + 2], Q[s * 4 + 3]);
  function argmaxQ(Q, s, rnd = Math.random) {
    let best = -Infinity, picks = [];
    for (let a = 0; a < 4; a++) {
      const q = Q[s * 4 + a];
      if (q > best + 1e-9) { best = q; picks = [a]; }
      else if (Math.abs(q - best) <= 1e-9) picks.push(a);
    }
    return picks[Math.floor(rnd() * picks.length)];
  }

  // One Q-learning update from `agent` ({x,y}). Mutates Q; does not move the agent.
  // P = { eps, gamma, alpha }. Returns { s, a, nx, ny, explored, bumped, outcome } where outcome is null | "cheese" | "trap".
  function qStep(Q, grid, agent, P, rnd = Math.random) {
    const s = idx(agent.x, agent.y);
    const explored = rnd() < P.eps;
    const a = explored ? Math.floor(rnd() * 4) : argmaxQ(Q, s, rnd);
    let nx = agent.x + DIRS[a][0], ny = agent.y + DIRS[a][1];
    let r = R_STEP, bumped = false;
    if (!inside(nx, ny) || grid[idx(nx, ny)] === WALL) { nx = agent.x; ny = agent.y; r = R_BUMP; bumped = true; }
    const ns = idx(nx, ny);
    const cell = grid[ns];
    let outcome = null;
    if (cell === CHEESE) { r = R_CHEESE; outcome = "cheese"; }
    else if (cell === TRAP) { r = R_TRAP; outcome = "trap"; }
    const target = outcome ? r : r + P.gamma * maxQ(Q, ns);
    Q[s * 4 + a] += P.alpha * (target - Q[s * 4 + a]);
    return { s, a, nx, ny, explored, bumped, outcome };
  }

  // Follow the favorite arrows from the start and see where they lead.
  function greedyPath(Q, grid, start) {
    const path = [{ x: start.x, y: start.y }];
    const seen = new Set([idx(start.x, start.y)]);
    let x = start.x, y = start.y;
    for (let i = 0; i < N * N; i++) {
      const s = idx(x, y);
      const qs = [0, 1, 2, 3].map((a) => Q[s * 4 + a]);
      const best = Math.max(...qs);
      if (qs.every((q) => q === best)) return { path, reached: false };
      const a = qs.indexOf(best);
      let nx = x + DIRS[a][0], ny = y + DIRS[a][1];
      if (!inside(nx, ny) || grid[idx(nx, ny)] === WALL) return { path, reached: false };
      x = nx; y = ny;
      path.push({ x, y });
      const c = grid[idx(x, y)];
      if (c === CHEESE) return { path, reached: true };
      if (c === TRAP) return { path, reached: false };
      if (seen.has(idx(x, y))) return { path, reached: false };
      seen.add(idx(x, y));
    }
    return { path, reached: false };
  }

  const api = { N, EMPTY, WALL, TRAP, CHEESE, DIRS, R_CHEESE, R_TRAP, R_STEP, R_BUMP, MAX_STEPS, PRESETS, idx, inside, loadPreset, maxQ, argmaxQ, qStep, greedyPath };
  root.MazeCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
