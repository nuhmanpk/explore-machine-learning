// Chess vs a thinking-ahead AI — UI: board, move hints, the AI's candidate moves.
(function () {
  const C = window.AIChess;
  const $ = (id) => document.getElementById(id);
  const GLYPH = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const PIECE_NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  const DEPTH_NAMES = ["", "Baby brain", "Sees one reply", "Sees a trade coming", "Sharp"];

  const BS = 480;
  const cv = $("board");
  const ctx = ML.setupCanvas(cv, BS, BS).ctx;
  const CS = BS / 8;

  const S = {
    st: C.start(), human: "w", depth: 2, sel: -1, targets: [], history: [], prev: [], last: null,
    over: false, busy: false, hover: -1, pred: null, showPred: true, hit: { top1: 0, top3: 0, n: 0 }, tally: { me: 0, draw: 0, ai: 0 }, think: null, flip: false,
  };
  const ai = () => (S.human === "w" ? "b" : "w");

  // board square index <-> screen cell
  const toXY = (i) => { const r = C.rowOf(i), c = C.colOf(i); return S.flip ? [(7 - c) * CS, (7 - r) * CS] : [c * CS, r * CS]; };
  const fromXY = (x, y) => { let c = Math.floor(x / CS), r = Math.floor(y / CS); if (S.flip) { c = 7 - c; r = 7 - r; } return r * 8 + c; };

  function draw() {
    const col = { l: ML.isDark() ? "#5d6492" : "#f0e3c8", d: ML.isDark() ? "#3c4268" : "#b58a5a", acc: ML.cssVar("--accent"), good: ML.cssVar("--good"), bad: ML.cssVar("--bad"), ink: ML.cssVar("--ink") };
    ctx.clearRect(0, 0, BS, BS);
    const kingSq = C.inCheck(S.st) ? S.st.b.indexOf(S.st.turn === "w" ? "K" : "k") : -1;
    for (let i = 0; i < 64; i++) {
      const [x, y] = toXY(i);
      ctx.fillStyle = (C.rowOf(i) + C.colOf(i)) % 2 ? col.d : col.l;
      ctx.fillRect(x, y, CS, CS);
      if (S.last && (i === S.last.from || i === S.last.to)) { ctx.fillStyle = "rgba(255,210,63,.45)"; ctx.fillRect(x, y, CS, CS); }
      if (i === kingSq) { ctx.fillStyle = "rgba(255,70,90,.55)"; ctx.fillRect(x, y, CS, CS); }
      if (i === S.sel) { ctx.fillStyle = "rgba(91,140,255,.55)"; ctx.fillRect(x, y, CS, CS); }
    }
    // coordinates
    ctx.font = "800 11px Nunito, sans-serif";
    for (let k = 0; k < 8; k++) {
      const c = S.flip ? 7 - k : k, r = S.flip ? 7 - k : k;
      ctx.fillStyle = (c + 7) % 2 ? col.l : col.d; ctx.textAlign = "right";
      ctx.fillText("abcdefgh"[c], (k + 1) * CS - 3, BS - 4);
      ctx.fillStyle = r % 2 ? col.d : col.l; ctx.textAlign = "left";
      ctx.fillText(8 - r, 3, k * CS + 13);
    }
    // move hints
    for (const m of S.targets) {
      const [x, y] = toXY(m.to);
      ctx.fillStyle = m.cap ? "rgba(255,70,90,.55)" : "rgba(40,50,90,.35)";
      ctx.beginPath();
      if (m.cap) { ctx.arc(x + CS / 2, y + CS / 2, CS * 0.45, 0, 7); ctx.arc(x + CS / 2, y + CS / 2, CS * 0.34, 0, 7, true); }
      else ctx.arc(x + CS / 2, y + CS / 2, CS * 0.14, 0, 7);
      ctx.fill();
    }
    // pieces
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `${Math.round(CS * 0.78)}px "Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", serif`;
    for (let i = 0; i < 64; i++) {
      const ch = S.st.b[i];
      if (!ch) continue;
      const [x, y] = toXY(i);
      const white = ch === ch.toUpperCase();
      ctx.lineWidth = 3; ctx.strokeStyle = white ? "#2a2d4a" : "#fdfdff"; ctx.lineJoin = "round";
      ctx.fillStyle = white ? "#ffffff" : "#1f2140";
      ctx.strokeText(GLYPH[ch.toLowerCase()], x + CS / 2, y + CS / 2 + 3);
      ctx.fillText(GLYPH[ch.toLowerCase()], x + CS / 2, y + CS / 2 + 3);
    }
    ctx.textBaseline = "alphabetic";
    drawPred(col);
    if (S.hover >= 0 && canMove() && S.st.b[S.hover] && C.colorOf(S.st.b[S.hover]) === S.human) {
      const [x, y] = toXY(S.hover);
      ctx.strokeStyle = col.acc; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, CS - 4, CS - 4);
    }
  }

  function arrow(a, b, color, width, alpha, dash) {
    const [ax, ay] = toXY(a), [bx, by] = toXY(b);
    const x0 = ax + CS / 2, y0 = ay + CS / 2, x1 = bx + CS / 2, y1 = by + CS / 2;
    const ang = Math.atan2(y1 - y0, x1 - x0), hl = 10 + width * 1.5;
    const ex = x1 - Math.cos(ang) * (CS * 0.18), ey = y1 - Math.sin(ang) * (CS * 0.18);
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
    if (dash) ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(x0 + Math.cos(ang) * CS * 0.2, y0 + Math.sin(ang) * CS * 0.2); ctx.lineTo(ex - Math.cos(ang) * hl * 0.5, ey - Math.sin(ang) * hl * 0.5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(ang - 0.45) * hl, ey - Math.sin(ang - 0.45) * hl);
    ctx.lineTo(ex - Math.cos(ang + 0.45) * hl, ey - Math.sin(ang + 0.45) * hl);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  }
  // arrows for "what I think you'll play next": thicker and darker = more likely
  function drawPred(col) {
    if (!S.showPred || !S.pred || S.over || S.busy || S.st.turn !== S.human) return;
    const top = S.pred.options.slice(0, 3), max = top[0].prob;
    for (let i = top.length - 1; i >= 0; i--) {
      const o = top[i], k = o.prob / max;
      const [mx, my] = arrow(o.move.from, o.move.to, col.bad, 3 + 6 * k, 0.3 + 0.55 * k, i > 0);
      if (o.prob >= 0.08) {
        const t = Math.round(o.prob * 100) + "%";
        ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const w = ctx.measureText(t).width + 10;
        ctx.fillStyle = "rgba(31,33,64,.85)"; ctx.beginPath(); ctx.roundRect(mx - w / 2, my - 10, w, 20, 8); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillText(t, mx, my + 1); ctx.textBaseline = "alphabetic";
      }
    }
  }

  const canMove = () => !S.over && !S.busy && S.st.turn === S.human;
  const pawns = (v) => (v >= C.MATE / 2 ? "mate for me" : v <= -C.MATE / 2 ? "mate for you" : (v >= 0 ? "+" : "") + (v / 100).toFixed(1));

  // ---------- material + eval ----------
  function material() {
    let w = 0, b = 0;
    for (const ch of S.st.b) { if (!ch || ch.toLowerCase() === "k") continue; (ch === ch.toUpperCase() ? (w += C.VAL[ch.toLowerCase()]) : (b += C.VAL[ch.toLowerCase()])); }
    return { w: w / 100, b: b / 100 };
  }
  function renderStats() {
    const m = material();
    $("st-me").textContent = S.tally.me; $("st-draw").textContent = S.tally.draw; $("st-ai").textContent = S.tally.ai;
    const mine = S.human === "w" ? m.w : m.b, theirs = S.human === "w" ? m.b : m.w;
    $("st-mat").textContent = (mine - theirs >= 0 ? "+" : "") + (mine - theirs);
    $("mat-sub").textContent = `you ${mine} · me ${theirs}`;
    const e = C.evaluate(S.st) * (S.human === "w" ? 1 : -1); // from the human's point of view
    // turn "pawns ahead" into a win chance: a lead of about 4 pawns is roughly 90%
    const win = 1 / (1 + Math.pow(10, -e / 400));
    const you = Math.round(win * 100);
    $("evalbar").style.width = Math.max(3, Math.min(97, you)) + "%";
    $("predict").innerHTML = S.over ? "" : `<b>My prediction:</b> you ${you}% · me ${100 - you}% ${you >= 60 ? "(you're winning)" : you <= 40 ? "(I'm winning)" : "(about even)"}`;
  }

  // ---------- move list ----------
  function renderMoves() {
    const h = S.history;
    let out = "";
    for (let i = 0; i < h.length; i += 2) out += `<span class="mv"><b>${i / 2 + 1}.</b> ${h[i]} ${h[i + 1] || ""}</span>`;
    $("moves").innerHTML = out || `<span class="muted">Moves will appear here.</span>`;
    $("moves").scrollTop = 1e6;
  }

  // ---------- AI candidate list ----------
  function renderThink() {
    const host = $("cands");
    const t = S.think;
    if (!t) { host.innerHTML = `<span class="muted">After your move I'll show the best moves I considered and what I think each is worth.</span>`; return; }
    const top = t.options.slice().sort((a, b) => b.value - a.value).slice(0, 5);
    const max = Math.max(1, ...top.map((o) => Math.abs(o.value >= C.MATE / 2 ? 900 : o.value)));
    host.innerHTML = top.map((o) => {
      const chosen = o.move === t.best;
      const w = Math.min(100, Math.abs(o.value >= C.MATE / 2 ? 900 : o.value) / max * 100);
      return `<div class="cand ${chosen ? "chosen" : ""}"><b>${t.names.get(o.move)}</b><span class="bar"><i style="width:${Math.max(4, w)}%;background:${o.value >= 0 ? "var(--good)" : "var(--bad)"}"></i></span><span class="cv">${pawns(o.value)}</span></div>`;
    }).join("") + `<div class="muted" style="font-size:.8rem;margin-top:4px">Numbers are in pawns, from my side. Looking ${t.depth} move${t.depth > 1 ? "s" : ""} ahead I imagined <b>${t.nodes.toLocaleString()}</b> positions, and skipped <b>${t.cuts.toLocaleString()}</b> branches that couldn't change my mind (that's pruning!).</div>`;
  }

  // Guess the person's next move: the AI searches the person's side one step shallower and turns each
  // move's score into a chance (better move = more likely, like a strong-but-human player would pick).
  function predict() {
    S.pred = null;
    if (S.over || S.st.turn !== S.human) { renderPred(); draw(); return; }
    const out = C.think(S.st, { depth: Math.max(1, Math.min(S.depth, 3)), rnd: null });
    const cl = (v) => Math.max(-900, Math.min(900, v));
    const sign = S.human === "w" ? 1 : -1;
    // score = what the search says + a little of "how good the board looks right after", which breaks ties sensibly
    const score = (o) => cl(o.value) + 0.6 * sign * C.evaluate(C.apply(S.st, o.move));
    const best = Math.max(...out.options.map(score));
    const opts = out.options.map((o) => ({ move: o.move, value: o.value, w: Math.exp((score(o) - best) / 30), name: C.describe(S.st, o.move) }));
    const sum = opts.reduce((a, o) => a + o.w, 0);
    opts.forEach((o) => (o.prob = o.w / sum));
    opts.sort((a, b) => b.prob - a.prob);
    S.pred = { options: opts, depth: out.depth };
    renderPred(); draw();
  }
  function renderPred() {
    const host = $("pred");
    const p = S.pred;
    const rec = S.hit.n ? `<div class="muted" style="font-size:.82rem;margin-top:6px">So far my best guess was right <b>${S.hit.top1}</b> of <b>${S.hit.n}</b> times, and your move was in my top 3 <b>${S.hit.top3}</b> times.</div>` : "";
    if (!p) { host.innerHTML = `<span class="muted">After my move I'll guess what you'll play next, and show it as red arrows on the board.</span>` + rec; return; }
    host.innerHTML = p.options.slice(0, 5).map((o, i) => `<div class="cand pred ${i === 0 ? "chosen" : ""}"><b>${o.name}</b><span class="bar"><i style="width:${Math.max(3, o.prob * 100)}%;background:var(--bad)"></i></span><span class="cv">${Math.round(o.prob * 100)}%</span></div>`).join("") +
      `<div class="muted" style="font-size:.8rem;margin-top:4px">To guess, I pretend to be you: I look ${p.depth} move${p.depth > 1 ? "s" : ""} ahead from your side and give better moves a bigger chance.</div>` + rec;
  }

  function renderInside(msg) { $("inside").innerHTML = msg; }

  // ---------- game flow ----------
  function afterMove(m, mover, before) {
    S.last = m;
    S.history.push(C.describe(before, m));
    S.prev.push(before);
    S.sel = -1; S.targets = [];
    renderMoves();
    const stt = C.status(S.st);
    if (stt !== "ongoing") return finish(stt, mover);
    return false;
  }
  function finish(stt, mover) {
    S.over = true;
    let txt;
    if (stt === "checkmate") {
      const humanWon = mover === S.human;
      if (humanWon) { S.tally.me++; txt = "Checkmate, you win!"; ML.confetti(80); ML.say(`Checkmate! You beat me. I only look <b>${S.depth}</b> move${S.depth > 1 ? "s" : ""} ahead, so I couldn't see your plan. Try raising my thinking depth!`); }
      else { S.tally.ai++; txt = "Checkmate, the AI wins"; ML.say(`Checkmate! I imagined my moves and your replies, and found a way to trap your king. Lower my depth if you want an easier game, or play again.`); }
    } else {
      S.tally.draw++;
      txt = stt === "stalemate" ? "Stalemate: a draw" : stt === "draw50" ? "Draw (50 moves, no progress)" : "Draw (not enough pieces)";
      ML.say(stt === "stalemate" ? "Stalemate! The side to move has no legal moves but is not in check. That is a draw." : "A draw. Neither side can make progress.");
    }
    $("status").innerHTML = `<b>${txt}</b>`;
    renderStats();
  }
  function setStatus() {
    if (S.over) return;
    const t = S.st.turn === S.human ? "Your move" : "AI is thinking…";
    $("status").innerHTML = `<b>${t}</b>${C.inCheck(S.st) ? ' <span style="color:var(--bad)">· check!</span>' : ""}`;
  }

  function aiTurn() {
    if (S.over) return;
    S.busy = true; setStatus();
    ML.say(`My turn! I'm imagining every move I could make, then every reply you could make, <b>${S.depth}</b> move${S.depth > 1 ? "s" : ""} deep.`);
    renderInside(`<div>${ML.icon("eye")} Searching <b>${S.depth}</b> move${S.depth > 1 ? "s" : ""} ahead…</div>`);
    setTimeout(() => {
      const state = S.st;
      const out = C.think(state, { depth: S.depth, rnd: Math.random });
      if (!out.best) { S.busy = false; return; }
      out.names = new Map(out.options.map((o) => [o.move, C.describe(state, o.move)]));
            S.think = out;
      S.st = C.apply(state, out.best);
      const cap = out.best.cap ? PIECE_NAME[out.best.cap.toLowerCase()] : "";
      const over = afterMove(out.best, ai(), state);
      S.busy = false;
      renderThink(); renderStats(); draw();
      const name = out.names.get(out.best);
      renderInside(`<div>${ML.icon("eye")} I could play <b>${out.options.length}</b> moves.</div><div class="arrow">${ML.icon("arrow-down")}</div>
        <div>${ML.icon("ruler")} For each, I score the position after your best replies: pieces are worth points (pawn 1, knight/bishop 3, rook 5, queen 9).</div><div class="arrow">${ML.icon("arrow-down")}</div>
        <div>${ML.icon("trophy")} <b style="color:var(--accent)">${name}</b> has the best worst-case: <b>${pawns(out.bestValue)}</b>.</div>`);
      if (!over) {
        setStatus(); predict();
        ML.say(`${S.predNote ? S.predNote + " " : ""}I played <b>${name}</b>${cap ? ` and took your ${cap}` : ""}.${C.inCheck(S.st) ? " Check!" : ""} ${out.bestValue <= -C.MATE / 2 ? "Uh-oh, I think you have a forced mate!" : out.bestValue >= C.MATE / 2 ? "I see a forced checkmate!" : "Your move."}`);
      }
      S.predNote = "";
    }, 60);
  }

  function pick(i) {
    if (!canMove()) return;
    const ch = S.st.b[i];
    const mv = S.targets.filter((m) => m.to === i);
    if (S.sel >= 0 && mv.length) {
      const m = mv.find((x) => !x.promo || x.promo.toLowerCase() === "q"); // promotions auto-queen
      const before = S.st;
      if (S.pred) {
        const rank = S.pred.options.findIndex((o) => o.move.from === m.from && o.move.to === m.to);
        S.hit.n++;
        if (rank === 0) S.hit.top1++;
        if (rank >= 0 && rank < 3) S.hit.top3++;
        S.predNote = rank === 0 ? "I predicted that move!" : rank >= 0 && rank < 3 ? `That was my #${rank + 1} guess.` : "I didn't see that coming!";
      }
      S.st = C.apply(before, m);
      const cap = m.cap ? PIECE_NAME[m.cap.toLowerCase()] : "";
      const over = afterMove(m, S.human, before);
      ML.say(`You played <b>${S.history[S.history.length - 1]}</b>${cap ? ` and took my ${cap}` : ""}.${m.promo ? " Your pawn became a queen!" : ""} ${S.predNote || ""}`);
      renderStats(); draw();
      if (!over) setTimeout(aiTurn, 250);
      return;
    }
    if (ch && C.colorOf(ch) === S.human) {
      S.sel = i;
      S.targets = C.legal(S.st).filter((m) => m.from === i);
      if (!S.targets.length) ML.toast("That piece can't move right now.");
    } else { S.sel = -1; S.targets = []; }
    draw();
  }

  cv.addEventListener("pointerdown", (e) => { const p = ML.canvasPoint(cv, e, BS, BS); pick(fromXY(p.x, p.y)); });
  cv.addEventListener("pointermove", (e) => { const p = ML.canvasPoint(cv, e, BS, BS); const h = fromXY(p.x, p.y); if (h !== S.hover) { S.hover = h; draw(); } });
  cv.addEventListener("pointerleave", () => { S.hover = -1; draw(); });

  function newGame() {
    S.st = C.start(); S.sel = -1; S.targets = []; S.history = []; S.prev = []; S.last = null; S.over = false; S.busy = false; S.think = null;
    S.flip = S.human === "b";
    renderMoves(); renderThink(); renderStats(); setStatus(); S.hit = { top1: 0, top3: 0, n: 0 }; predict(); draw();
    renderInside(`<span class="muted">Make your first move. I'll explain what I imagined.</span>`);
    if (S.human === "b") { ML.say(`New game! You're <b>Black</b> (the dark pieces), so I move first.`); setTimeout(aiTurn, 300); }
    else ML.say(`New game! You're <b>White</b> (the light pieces). Tap a piece, then a dot to move it.`);
  }

  function undo() {
    if (S.busy || !S.prev.length) return;
    // take back to the last time it was the person's turn
    do { S.st = S.prev.pop(); S.history.pop(); } while (S.prev.length && S.st.turn !== S.human);
    S.last = null; S.sel = -1; S.targets = []; S.over = false;
    renderMoves(); renderStats(); setStatus(); predict(); draw();
    ML.say("Took that back. Try something different!");
    if (S.st.turn !== S.human) setTimeout(aiTurn, 300);
  }

  // ---------- controls ----------
  function seg(id, attr, fn) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      fn(b.dataset[attr]);
    }));
  }
  function updateBeat() {
    $("depth-name").textContent = DEPTH_NAMES[S.depth];
    document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("on", +b.dataset.d === S.depth));
    $("beat").innerHTML = `<span class="e">${ML.icon("trophy")}</span><span>${[
      "", "Looks only at its own next move. It grabs free pieces but walks into anything.", "Sees your reply. It won't hang a piece for free, but traps fool it.",
      "Sees move, reply, move. It spots simple forks and trades.", "Sees four half-moves. A real challenge for a beginner!"][S.depth]}</span>`;
  }
  ML.bindRange("#depth", (v) => v, (v) => { S.depth = v; updateBeat(); ML.say(`Now I look <b>${v}</b> move${v > 1 ? "s" : ""} ahead.`); });
  document.querySelectorAll("#presets button").forEach((b) => b.addEventListener("click", () => {
    S.depth = +b.dataset.d; $("depth").value = S.depth; $("depth").dispatchEvent(new Event("input"));
  }));
  seg("side", "s", (s) => { S.human = s; newGame(); });
  $("showpred").addEventListener("change", (e) => { S.showPred = e.target.checked; draw(); });
  $("newgame").addEventListener("click", newGame);
  $("undo").addEventListener("click", undo);
  $("hint").addEventListener("click", () => {
    if (!canMove()) return;
    const out = C.think(S.st, { depth: Math.max(2, S.depth), rnd: null });
    const nm = C.describe(S.st, out.best);
    S.sel = out.best.from; S.targets = [out.best];
    draw();
    ML.say(`If I were you I'd think about <b>${nm}</b>. (I searched your side of the board with the same brain.)`);
  });
  document.addEventListener("themechange", draw);

  updateBeat(); newGame();
})();
