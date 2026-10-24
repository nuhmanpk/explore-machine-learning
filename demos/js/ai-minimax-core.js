// The Thinking-Ahead Game — tic-tac-toe + minimax search (with optional alpha-beta pruning).
// No DOM, so it runs in Node too. This is SEARCH, not machine learning: nothing is learned.
//
// Board: array of 9 cells, 0 = empty, 1 = X (the person), 2 = O (the AI). X moves first.
// Scores are from the AI's point of view: win = +(10 - plies), loss = -(10 - plies), draw = 0.
// A depth cut-off returns 0 ("I can't tell"), which is what makes shallow thinking short-sighted.
(function (root) {
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const AI = 2, ME = 1;
  const other = (p) => (p === AI ? ME : AI);

  function winner(b) {
    for (const [x, y, z] of LINES) if (b[x] && b[x] === b[y] && b[x] === b[z]) return { who: b[x], line: [x, y, z] };
    return null;
  }
  const full = (b) => b.every((v) => v);
  const moves = (b) => { const m = []; for (let i = 0; i < 9; i++) if (!b[i]) m.push(i); return m; };
  const place = (b, i, p) => { const c = b.slice(); c[i] = p; return c; };

  // Plain search. Returns the value of position `b` with `player` to move.
  // ply = how many moves have been looked ahead so far; depth = how many we may look in total.
  function search(b, player, ply, depth, alpha, beta, ab, st) {
    st.nodes++;
    const w = winner(b);
    if (w) return w.who === AI ? 10 - ply : ply - 10;
    if (full(b)) return 0;
    if (ply >= depth) return 0; // out of thinking time: shrug
    let best = player === AI ? -Infinity : Infinity;
    for (const m of moves(b)) {
      const v = search(place(b, m, player), other(player), ply + 1, depth, alpha, beta, ab, st);
      if (player === AI) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else { if (v < best) best = v; if (best < beta) beta = best; }
      if (ab && beta <= alpha) { st.cuts++; break; }
    }
    return best;
  }

  // Look at every option for the AI at position `b` (AI to move) and report everything the
  // picture needs: for each of the AI's moves, the person's possible replies, which of them were
  // actually looked at (alpha-beta may skip some), and their values.
  // opts: { depth (1..9), ab (bool), rnd (function → [0,1) for random tie-breaks, or null = lowest index) }
  function think(b, opts) {
    const depth = opts.depth, ab = !!opts.ab;
    const out = { options: [], nodes: 0, cuts: 0, best: -1, bestValue: -Infinity, ab, depth };
    let alpha = -Infinity;
    for (const m of moves(b)) {
      const nb = place(b, m, AI);
      const opt = { move: m, board: nb, replies: [], value: 0, nodes: 0, cut: false };
      const st = { nodes: 1, cuts: 0 };
      const w = winner(nb);
      if (w) { opt.value = 10 - 1; opt.final = "win"; }
      else if (full(nb)) { opt.value = 0; opt.final = "draw"; }
      else if (1 >= depth) { opt.value = 0; opt.final = "cutoff"; }
      else {
        // The person's replies (a "min" node). Same maths as search(), unrolled one level so we can record it.
        let beta = Infinity, bestHere = Infinity;
        for (const r of moves(nb)) {
          if (ab && beta <= alpha) { opt.replies.push({ move: r, board: place(nb, r, ME), value: null, skipped: true, nodes: 0 }); opt.cut = true; continue; }
          const rb = place(nb, r, ME);
          const s2 = { nodes: 0, cuts: 0 };
          const v = search(rb, AI, 2, depth, alpha, beta, ab, s2);
          st.nodes += s2.nodes; st.cuts += s2.cuts;
          opt.replies.push({ move: r, board: rb, value: v, skipped: false, nodes: s2.nodes });
          if (v < bestHere) bestHere = v;
          if (bestHere < beta) beta = bestHere;
        }
        opt.value = bestHere;
        opt.final = "search";
      }
      opt.nodes = st.nodes;
      out.nodes += st.nodes;
      out.cuts += st.cuts;
      out.options.push(opt);
      if (opt.value > out.bestValue) out.bestValue = opt.value;
      // alpha for the next option: allow ties through (best - 1), so equal moves still get exact values.
      if (ab && opt.value - 1 > alpha) alpha = opt.value - 1;
    }
    // Choose among the options that reached the best value.
    const top = out.options.filter((o) => o.value === out.bestValue && !(o.cut && o.value < out.bestValue));
    const pick = opts.rnd ? top[Math.floor(opts.rnd() * top.length)] : top[0];
    out.best = pick.move;
    for (const o of out.options) o.chosen = o === pick;
    return out;
  }

  // Shortcut used by tests and AI-vs-AI.
  function aiMove(b, depth, ab, rnd) { return think(b, { depth, ab, rnd }).best; }

  // Who is winning, in words, for a value from the AI's view.
  function verdict(v, final) {
    if (final === "cutoff") return "?";
    if (v > 0) return "win";
    if (v < 0) return "lose";
    return "draw";
  }

  const api = { LINES, AI, ME, winner, full, moves, place, search, think, aiMove, verdict };
  root.AIMinimax = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
