// Chess vs a thinking-ahead AI — rules + alpha-beta search.
// No DOM, so it runs in Node too. This is SEARCH, not machine learning: nothing is learned.
//
// Board: array of 64 cells, index 0 = a8 ... 63 = h1 (row 0 is Black's back rank). "" = empty.
// Pieces: uppercase = White (the person), lowercase = Black (the AI). P N B R Q K.
// A state is { b, turn: "w"|"b", c: {K,Q,k,q}, ep: square|-1, half }.
// A move is { from, to, piece, cap (captured char or ""), promo (char or ""), ep (bool), castle ("K"|"Q"|"") }.
(function (root) {
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const isW = (ch) => ch !== "" && ch === ch.toUpperCase();
  const colorOf = (ch) => (ch === "" ? "" : isW(ch) ? "w" : "b");
  const rowOf = (i) => i >> 3, colOf = (i) => i & 7;
  const sqName = (i) => "abcdefgh"[colOf(i)] + (8 - rowOf(i));

  function start() {
    const b = Array(64).fill("");
    const back = "rnbqkbnr";
    for (let c = 0; c < 8; c++) { b[c] = back[c]; b[8 + c] = "p"; b[48 + c] = "P"; b[56 + c] = back[c].toUpperCase(); }
    return { b, turn: "w", c: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0 };
  }

  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Is square `sq` attacked by side `by`?
  function attacked(b, sq, by) {
    const r = rowOf(sq), c = colOf(sq);
    const pr = by === "w" ? r + 1 : r - 1; // a pawn of `by` attacking us sits one row "behind" us
    for (const dc of [-1, 1]) if (pr >= 0 && pr < 8 && c + dc >= 0 && c + dc < 8 && b[pr * 8 + c + dc] === (by === "w" ? "P" : "p")) return true;
    for (const [dr, dc] of KN) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === (by === "w" ? "N" : "n")) return true; }
    for (const [dr, dc] of KG) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === (by === "w" ? "K" : "k")) return true; }
    const slide = (dirs, a, q) => {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const ch = b[rr * 8 + cc];
          if (ch) { if (ch === (by === "w" ? a : a.toLowerCase()) || ch === (by === "w" ? q : q.toLowerCase())) return true; break; }
          rr += dr; cc += dc;
        }
      }
      return false;
    };
    return slide(DIAG, "B", "Q") || slide(ORTH, "R", "Q");
  }

  const findKing = (b, side) => b.indexOf(side === "w" ? "K" : "k");
  const inCheck = (s, side = s.turn) => attacked(s.b, findKing(s.b, side), side === "w" ? "b" : "w");

  // All moves ignoring "does it leave my king in check".
  function pseudo(s) {
    const { b, turn } = s, out = [];
    const me = turn, foe = turn === "w" ? "b" : "w";
    const add = (from, to, piece, cap, extra) => out.push(Object.assign({ from, to, piece, cap, promo: "", ep: false, castle: "" }, extra));
    for (let from = 0; from < 64; from++) {
      const ch = b[from];
      if (!ch || colorOf(ch) !== me) continue;
      const t = ch.toLowerCase(), r = rowOf(from), c = colOf(from);
      if (t === "p") {
        const dir = me === "w" ? -1 : 1, startRow = me === "w" ? 6 : 1, lastRow = me === "w" ? 0 : 7;
        const r1 = r + dir;
        if (r1 < 0 || r1 > 7) continue;
        const pushMove = (to, cap, extra) => {
          if (rowOf(to) === lastRow) for (const pr of ["q", "r", "b", "n"]) add(from, to, ch, cap, Object.assign({ promo: me === "w" ? pr.toUpperCase() : pr }, extra));
          else add(from, to, ch, cap, extra);
        };
        if (!b[r1 * 8 + c]) {
          pushMove(r1 * 8 + c, "");
          if (r === startRow && !b[(r + 2 * dir) * 8 + c]) add(from, (r + 2 * dir) * 8 + c, ch, "");
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (cc < 0 || cc > 7) continue;
          const to = r1 * 8 + cc, tgt = b[to];
          if (tgt && colorOf(tgt) === foe) pushMove(to, tgt);
          else if (!tgt && to === s.ep) add(from, to, ch, me === "w" ? "p" : "P", { ep: true });
        }
      } else if (t === "n" || t === "k") {
        for (const [dr, dc] of t === "n" ? KN : KG) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const to = rr * 8 + cc, tgt = b[to];
          if (!tgt || colorOf(tgt) === foe) add(from, to, ch, tgt);
        }
        if (t === "k") { // castling: king and rook unmoved, squares between empty, king not in/through check
          const home = me === "w" ? 60 : 4;
          if (from === home && !attacked(b, home, foe)) {
            const ks = me === "w" ? "K" : "k", qs = me === "w" ? "Q" : "q", rk = me === "w" ? "R" : "r";
            if (s.c[ks] && b[home + 3] === rk && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, foe) && !attacked(b, home + 2, foe)) add(from, home + 2, ch, "", { castle: "K" });
            if (s.c[qs] && b[home - 4] === rk && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, foe) && !attacked(b, home - 2, foe)) add(from, home - 2, ch, "", { castle: "Q" });
          }
        }
      } else {
        const dirs = t === "b" ? DIAG : t === "r" ? ORTH : DIAG.concat(ORTH);
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
            const to = rr * 8 + cc, tgt = b[to];
            if (!tgt) add(from, to, ch, "");
            else { if (colorOf(tgt) === foe) add(from, to, ch, tgt); break; }
            rr += dr; cc += dc;
          }
        }
      }
    }
    return out;
  }

  function apply(s, m) {
    const b = s.b.slice(), c = Object.assign({}, s.c);
    b[m.to] = m.promo || m.piece;
    b[m.from] = "";
    if (m.ep) b[m.to + (s.turn === "w" ? 8 : -8)] = "";
    if (m.castle === "K") { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = ""; }
    if (m.castle === "Q") { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = ""; }
    if (m.piece === "K") { c.K = false; c.Q = false; }
    if (m.piece === "k") { c.k = false; c.q = false; }
    for (const sq of [m.from, m.to]) { if (sq === 63) c.K = false; if (sq === 56) c.Q = false; if (sq === 7) c.k = false; if (sq === 0) c.q = false; }
    const pawn = m.piece === "P" || m.piece === "p";
    const ep = pawn && Math.abs(m.to - m.from) === 16 ? (m.to + m.from) / 2 : -1;
    return { b, turn: s.turn === "w" ? "b" : "w", c, ep, half: pawn || m.cap ? 0 : s.half + 1 };
  }

  function legal(s) {
    return pseudo(s).filter((m) => !inCheck(apply(s, m), s.turn));
  }

  // "ongoing" | "checkmate" | "stalemate" | "draw50" | "material"
  function status(s, moves) {
    moves = moves || legal(s);
    if (!moves.length) return inCheck(s) ? "checkmate" : "stalemate";
    if (s.half >= 100) return "draw50";
    let minor = 0;
    for (const ch of s.b) { if (!ch) continue; const t = ch.toLowerCase(); if (t === "k") continue; if (t === "n" || t === "b") minor++; else return "ongoing"; }
    return minor <= 1 ? "material" : "ongoing";
  }

  // Standard algebraic-ish text for the move list (good enough for kids: "Nf3", "exd5", "O-O", "e8=Q").
  function describe(s, m) {
    if (m.castle) return m.castle === "K" ? "O-O" : "O-O-O";
    const t = m.piece.toUpperCase();
    let txt = t === "P" ? (m.cap ? "abcdefgh"[colOf(m.from)] : "") : t;
    if (t !== "P") {
      const same = legal(s).filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      if (same.some((o) => colOf(o.from) !== colOf(m.from))) txt += "abcdefgh"[colOf(m.from)];
      else if (same.length) txt += 8 - rowOf(m.from);
    }
    txt += (m.cap ? "x" : "") + sqName(m.to) + (m.promo ? "=" + m.promo.toUpperCase() : "");
    const n = apply(s, m);
    const lm = legal(n);
    if (inCheck(n)) txt += lm.length ? "+" : "#";
    return txt;
  }

  // ---------- evaluation (positive = good for White) ----------
  // Material plus a few "which squares are good" bonuses. This is the AI's guess about a position
  // when it runs out of thinking time.
  const CENTER = [0, 0, 1, 2, 2, 1, 0, 0];
  function evaluate(s) {
    let v = 0;
    for (let i = 0; i < 64; i++) {
      const ch = s.b[i];
      if (!ch) continue;
      const t = ch.toLowerCase(), w = isW(ch), r = rowOf(i), c = colOf(i);
      const rel = w ? 7 - r : r; // how far the piece has marched from its own side
      let x = VAL[t];
      const mid = CENTER[r] + CENTER[c];
      if (t === "p") x += rel * 6 + mid * 4 + (rel >= 5 ? (rel - 4) * 14 : 0);
      else if (t === "n") x += mid * 10;
      else if (t === "b") x += mid * 5;
      else if (t === "q") x += mid * 2;
      else if (t === "r") x += rel === 6 ? 15 : 0;
      else if (t === "k") x += rel === 0 && (c <= 2 || c >= 6) ? 18 : -mid * 6; // tucked-in king is safe, wandering king is not
      v += w ? x : -x;
    }
    return v;
  }

  // ---------- search ----------
  const MATE = 100000;
  const order = (ms) => ms.sort((a, b) => (b.cap ? VAL[b.cap.toLowerCase()] * 10 - VAL[b.piece.toLowerCase()] : 0) + (b.promo ? 800 : 0) - ((a.cap ? VAL[a.cap.toLowerCase()] * 10 - VAL[a.piece.toLowerCase()] : 0) + (a.promo ? 800 : 0)));

  // Value from the side-to-move's own point of view (negamax with alpha-beta).
  function search(s, depth, alpha, beta, ply, st) {
    st.nodes++;
    const ms = legal(s);
    if (!ms.length) return inCheck(s) ? -MATE + ply : 0;
    if (s.half >= 100) return 0;
    if (depth === 0) return quiesce(s, alpha, beta, st, 0);
    order(ms);
    let best = -Infinity;
    for (const m of ms) {
      const v = -search(apply(s, m), depth - 1, -beta, -alpha, ply + 1, st);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) { st.cuts++; break; }
    }
    return best;
  }
  // Keep looking while captures are hanging, so we don't stop in the middle of a trade.
  function quiesce(s, alpha, beta, st, q) {
    const stand = (s.turn === "w" ? 1 : -1) * evaluate(s);
    if (q >= 4) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const caps = order(legal(s).filter((m) => m.cap));
    for (const m of caps) {
      st.nodes++;
      const v = -quiesce(apply(s, m), -beta, -alpha, st, q + 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  // Score every legal move at the root. Returns { options: [{move, value, nodes}], best, nodes, cuts }.
  // opts: { depth (1..4), rnd (→[0,1) or null) }. Value is from the mover's point of view, in centipawns.
  function think(s, opts) {
    const depth = opts.depth;
    const st = { nodes: 0, cuts: 0 };
    const ms = order(legal(s));
    const out = { options: [], nodes: 0, cuts: 0, best: null, bestValue: -Infinity, depth };
    let alpha = -Infinity;
    for (const m of ms) {
      const before = st.nodes;
      const v = -search(apply(s, m), depth - 1, -MATE * 2, -(alpha - 1), 1, st);
      out.options.push({ move: m, value: v, nodes: st.nodes - before });
      if (v > out.bestValue) out.bestValue = v;
      if (v - 1 > alpha) alpha = v - 1; // window is one wider than best so ties keep exact values
    }
    const top = out.options.filter((o) => o.value === out.bestValue);
    const pick = top.length ? (opts.rnd ? top[Math.floor(opts.rnd() * top.length)] : top[0]) : null;
    out.best = pick ? pick.move : null;
    out.nodes = st.nodes; out.cuts = st.cuts;
    return out;
  }

  const api = { VAL, start, legal, apply, status, inCheck, describe, evaluate, think, sqName, colorOf, rowOf, colOf, attacked, MATE };
  root.AIChess = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
