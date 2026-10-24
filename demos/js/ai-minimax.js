// The Thinking-Ahead Game — UI: board, animated thinking tree, explanations.
(function () {
  const M = window.AIMinimax;
  const { AI, ME } = M;
  const CELL = ["top-left", "top", "top-right", "left", "centre", "right", "bottom-left", "bottom", "bottom-right"];
  const kindOf = (i) => (i === 4 ? "centre" : [0, 2, 6, 8].includes(i) ? "corner" : "side");
  const DEPTH_NAMES = ["", "Baby brain", "Block-the-obvious", "Sees one trap ahead", "Smart", "Sharp", "Sharper", "Very sharp", "Almost perfect", "Genius"];
  const $ = (id) => document.getElementById(id);

  const BS = 420;
  const board = ML.setupCanvas($("board"), BS, BS);
  const ctx = board.ctx;

  const S = {
    b: Array(9).fill(0), turn: "me", over: false, win: null,
    mode: "you", first: "me", depth: 9, depthX: 2, ab: true, speed: 1,
    cur: null, anim: null, last: null, auto: false,
    tally: { me: 0, draw: 0, ai: 0 }, avx: { x: 0, o: 0, d: 0 },
    hover: -1, pop: Array(9).fill(0), ghost: -1, sig: "", nodesShown: 0, saved: "",
  };

  // ---------- helpers ----------
  const flip = (b) => b.map((v) => (v ? 3 - v : 0));
  const vcat = (v, final) => (final === "cutoff" ? "unk" : v > 0 ? "win" : v < 0 ? "lose" : "draw");
  const vtext = { win: "win", draw: "draw", lose: "lose", unk: "?" };

  function mini(b, hi) {
    let s = '<svg class="mb" viewBox="0 0 30 30" aria-hidden="true"><path class="g" d="M10 3v24M20 3v24M3 10h24M3 20h24"/>';
    for (let i = 0; i < 9; i++) {
      const cx = 5 + (i % 3) * 10, cy = 5 + Math.floor(i / 3) * 10;
      if (hi === i) s += `<rect class="hi" x="${cx - 4.6}" y="${cy - 4.6}" width="9.2" height="9.2" rx="2"/>`;
      if (b[i] === 1) s += `<path class="x" d="M${cx - 2.6} ${cy - 2.6}l5.2 5.2M${cx + 2.6} ${cy - 2.6}l-5.2 5.2"/>`;
      if (b[i] === 2) s += `<circle class="o" cx="${cx}" cy="${cy}" r="2.9"/>`;
    }
    return s + "</svg>";
  }

  // ---------- board drawing ----------
  function draw(now) {
    const C = { ink: ML.cssVar("--ink"), line: ML.cssVar("--line"), x: ML.cssVar("--sup"), o: ML.cssVar("--rl"), good: ML.cssVar("--good"), acc: ML.cssVar("--accent"), bg2: ML.cssVar("--bg-2"), card: ML.cssVar("--card") };
    ctx.clearRect(0, 0, BS, BS);
    const cs = BS / 3;
    ctx.fillStyle = C.card;
    ctx.beginPath(); ctx.roundRect(0, 0, BS, BS, 18); ctx.fill();
    if (S.hover >= 0 && !S.b[S.hover] && canClick()) {
      ctx.fillStyle = C.bg2;
      ctx.beginPath(); ctx.roundRect((S.hover % 3) * cs + 6, Math.floor(S.hover / 3) * cs + 6, cs - 12, cs - 12, 14); ctx.fill();
    }
    ctx.strokeStyle = C.line; ctx.lineWidth = 8; ctx.lineCap = "round";
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(i * cs, 22); ctx.lineTo(i * cs, BS - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(22, i * cs); ctx.lineTo(BS - 22, i * cs); ctx.stroke();
    }
    const mark = (i, p, alpha, scale) => {
      const cx = (i % 3) * cs + cs / 2, cy = Math.floor(i / 3) * cs + cs / 2, r = cs * 0.27 * scale;
      ctx.globalAlpha = alpha; ctx.lineWidth = 14; ctx.lineCap = "round";
      if (p === ME) {
        ctx.strokeStyle = C.x; ctx.beginPath();
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke();
      } else {
        ctx.strokeStyle = C.o; ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    for (let i = 0; i < 9; i++) if (S.b[i]) {
      const t = Math.min(1, (now - S.pop[i]) / 220);
      mark(i, S.b[i], 1, 0.4 + 0.6 * (1 - Math.pow(1 - t, 3)));
    }
    // the move being imagined while the AI thinks
    if (S.ghost >= 0 && !S.b[S.ghost]) mark(S.ghost, AI, 0.35 + 0.15 * Math.sin(now / 160), 1);
    if (S.win) {
      const [a, , c] = S.win.line;
      ctx.strokeStyle = C.good; ctx.lineWidth = 12; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo((a % 3) * cs + cs / 2, Math.floor(a / 3) * cs + cs / 2);
      ctx.lineTo((c % 3) * cs + cs / 2, Math.floor(c / 3) * cs + cs / 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  // ---------- tree ----------
  function renderTree(vt) {
    const host = $("tree");
    if (!vt) {
      host.innerHTML = `<p class="tree-note"><b>My thinking tree</b> will grow here. Every little board is a future I imagine.</p>
        <div class="lvl-h"><b>Start</b><span>make a move, then watch me think</span></div>`;
      return;
    }
    const { out, view, shown, focus, repShown, repReveal, optReveal, done, thinker } = vt;
    let h = `<div class="lvl-h"><b>Now</b><span>the board I'm thinking about ${thinker === 1 ? "(the thinker is drawn as O here)" : ""}</span></div>
      <div class="nodes"><div class="tnode root">${mini(view)}<span class="badge v-wait">my turn</span></div></div>`;
    h += `<div class="lvl-h"><b>1</b><span>every move I could make</span></div><div class="nodes">`;
    out.options.slice(0, shown).forEach((o, i) => {
      const reveal = done || optReveal.has(i);
      const cat = vcat(o.value, o.final);
      const cls = ["tnode", i === focus ? "focus" : "", done && o.chosen ? "chosen" : "", o.cut && reveal ? "" : ""].join(" ");
      h += `<button class="${cls}" data-i="${i}" title="${CELL[o.move]}">${mini(o.board, o.move)}
        <span class="badge ${reveal ? "v-" + cat : "v-wait"}">${reveal ? (o.cut ? "≤ " : "") + vtext[cat] : "…"}</span>
        ${reveal && o.cut ? '<span class="tcount">cut short</span>' : ""}</button>`;
    });
    h += "</div>";
    const f = out.options[focus];
    if (f) {
      if (f.final === "cutoff") {
        h += `<p class="tree-note">I only look <b>1</b> move ahead, so I don't even imagine your replies. Every move looks the same to me.</p>`;
      } else if (f.final === "win") {
        h += `<p class="tree-note">Playing <b>${CELL[f.move]}</b> wins on the spot. No need to imagine anything else!</p>`;
      } else if (f.final === "draw") {
        h += `<p class="tree-note">Playing <b>${CELL[f.move]}</b> fills the board: a draw.</p>`;
      } else {
        h += `<div class="lvl-h"><b>2</b><span>your replies if I play <b>${CELL[f.move]}</b> <span class="tcount">(value = how it ends if we both play well)</span></span></div><div class="nodes">`;
        f.replies.slice(0, repShown).forEach((r) => {
          const cat = r.skipped ? "skip" : vcat(r.value);
          const show = r.skipped || done || repReveal;
          h += `<div class="tnode ${r.skipped ? "skipped" : ""}">${mini(r.board, r.move)}<span class="badge ${show ? "v-" + cat : "v-wait"}">${r.skipped ? "skipped" : show ? vtext[cat] : "…"}</span>
            ${!r.skipped && show ? `<span class="tcount">${r.nodes.toLocaleString()} imagined</span>` : ""}</div>`;
        });
        h += "</div>";
        if (f.cut) h += `<p class="tree-note">I stopped early here: I already found a reply that makes this move worse than another option, so the rest can't matter.</p>`;
      }
    }
    host.innerHTML = h;
    host.querySelectorAll(".tnode[data-i]").forEach((el) =>
      el.addEventListener("click", () => {
        if (S.anim) return;
        S.focusPick = +el.dataset.i;
        S.sig = "";
        renderIdleTree();
      })
    );
  }

  function treeStateFinal(focusIdx) {
    const L = S.last;
    return { out: L.out, view: L.view, thinker: L.mover, shown: L.out.options.length, focus: focusIdx, repShown: 99, repReveal: true, optReveal: new Set(), done: true };
  }
  function renderIdleTree() {
    if (!S.last) return renderTree(null);
    const idx = S.focusPick != null ? S.focusPick : S.last.out.options.findIndex((o) => o.chosen);
    renderTree(treeStateFinal(idx));
  }

  // ---------- thinking animation ----------
  const A_APPEAR = 4;
  function schedule(out) {
    const N = out.options.length;
    const starts = [];
    let t = N * A_APPEAR + 6;
    out.options.forEach((o) => {
      const n = o.replies.length;
      const dur = n ? 4 + n * 2 + 10 : 8;
      starts.push({ t0: t, dur, n });
      t += dur;
    });
    return { starts, finalStart: t, total: t + 30 };
  }

  function animState(a) {
    const out = a.out, N = out.options.length, t = a.t;
    const shown = t < N * A_APPEAR ? Math.min(N, Math.floor(t / A_APPEAR) + 1) : N;
    let focus = -1, repShown = 0, repReveal = false, nodes = 0;
    const optReveal = new Set();
    a.sched.starts.forEach((s, i) => {
      const o = out.options[i];
      if (t >= s.t0 + s.dur) { optReveal.add(i); nodes += o.nodes; }
      else if (t >= s.t0) {
        focus = i;
        const local = t - s.t0;
        repShown = Math.min(s.n, Math.floor(Math.max(0, local - 2) / 2));
        repReveal = local >= 4 + s.n * 2;
        if (local >= 4 + s.n * 2 + 4) optReveal.add(i);
        nodes += o.nodes * Math.min(1, local / (4 + s.n * 2 + 2));
      }
    });
    const done = t >= a.sched.finalStart;
    if (done) { focus = out.options.findIndex((o) => o.chosen); nodes = out.nodes; }
    else if (focus < 0) focus = Math.min(shown, N) - 1;
    return { out, view: a.view, thinker: a.mover, shown, focus, repShown: done ? 99 : repShown, repReveal: done ? true : repReveal, optReveal, done, nodes };
  }

  // ---------- game flow ----------
  const canClick = () => S.mode === "you" && S.turn === "me" && !S.over && !S.anim;

  function newGame() {
    S.b = Array(9).fill(0); S.over = false; S.win = null; S.anim = null; S.ghost = -1; S.pop = Array(9).fill(0);
    S.last = null; S.focusPick = null; S.sig = ""; S.saved = "";
    $("status").textContent = ""; $("st-nodes").textContent = "0"; $("st-saved").textContent = "";
    $("inside").innerHTML = `<span class="muted">Make your first move. I'll explain what I imagined.</span>`;
    $("strip").innerHTML = `<span class="muted">Make a move and the AI will show what each brain would have chosen.</span>`;
    renderTree(null);
    if (S.mode === "you") {
      S.turn = S.first === "ai" ? "ai" : "me";
      if (S.turn === "ai") startThink(AI);
      else ML.say(`New game! You're <b>X</b>, I'm <b>O</b>. Your move.`);
      setStatus();
    } else {
      S.turn = "x";
      if (S.auto) startThink(ME);
      setStatus();
    }
  }

  function setStatus() {
    const el = $("status");
    if (S.over) return;
    if (S.anim) el.innerHTML = `<span class="muted">Thinking…</span>`;
    else if (S.mode === "you") el.innerHTML = S.turn === "me" ? `Your turn (X)` : "";
    else el.innerHTML = S.auto ? "" : `<span class="muted">Press Play to watch two AIs</span>`;
  }

  function startThink(mover) {
    const view = mover === ME ? flip(S.b) : S.b.slice();
    const depth = mover === ME ? S.depthX : S.depth;
    const out = M.think(view, { depth, ab: S.ab, rnd: Math.random });
    // The other pruning mode, only to compare how much thinking pruning saves.
    const alt = M.think(view, { depth, ab: !S.ab, rnd: null });
    const plain = S.ab ? alt.nodes : out.nodes, pruned = S.ab ? out.nodes : alt.nodes;
    S.saved = S.ab && plain > 0 ? `Pruning skipped ${Math.round((1 - pruned / plain) * 100)}% of the thinking (${plain.toLocaleString()} without it)` : `Pruning is off. Switch it on to skip about ${plain > pruned ? Math.round((1 - pruned / plain) * 100) : 0}% of this.`;
    S.cur = { out, view, mover, depth };
    S.turn = "ai";
    const a = { out, view, mover, t: 0, sched: schedule(out) };
    S.anim = a;
    S.ghost = -1; S.focusPick = null; S.sig = "";
    setStatus();
    if (S.mode === "you") ML.say(out.options.length === 9 ? `My turn! I'll imagine all ${out.options.length} places I could play, and what you'd do after each.` : `My turn! I'm imagining my ${out.options.length} options and every reply you could make.`);
  }

  function finishThink() {
    const { out, view, mover, depth } = S.cur;
    const real = out.best;
    const before = S.b.slice();
    S.b[real] = mover === ME ? ME : AI;
    S.pop[real] = performance.now();
    S.anim = null; S.ghost = -1;
    S.last = { out, view, mover, depth, real, before };
    $("st-nodes").textContent = out.nodes.toLocaleString();
    $("st-saved").textContent = S.saved;
    explain(S.last);
    strip(S.last);
    renderIdleTree();
    afterMove(mover === ME ? "x" : "ai");
  }

  function afterMove(who) {
    const w = M.winner(S.b);
    if (w || M.full(S.b)) return endGame(w);
    if (S.mode === "you") {
      S.turn = who === "ai" ? "me" : "ai";
      if (S.turn === "ai") startThink(AI);
    } else {
      const next = who === "x" ? "ai" : "x";
      S.turn = next;
      if (S.auto) startThink(next === "x" ? ME : AI);
    }
    setStatus();
  }

  function endGame(w) {
    S.over = true; S.win = w; S.turn = "";
    const el = $("status");
    if (S.mode === "you") {
      if (!w) { S.tally.draw++; el.innerHTML = "<b>A draw!</b>"; ML.say(S.depth >= 9 ? `A draw! That's the <b>best you can do</b> against a brain that looks all the way ahead. Well played.` : `A draw. Try lowering my thinking depth, or fool me with a trap!`); }
      else if (w.who === ME) { S.tally.me++; el.innerHTML = "<b>You win!</b>"; ML.confetti(50); ML.say(`You beat me! I can't see traps that are more than <b>${S.depth}</b> move${S.depth > 1 ? "s" : ""} away. Raise my depth and try again.`); }
      else { S.tally.ai++; el.innerHTML = "<b>The AI wins</b>"; ML.say(S.depth >= 9 ? `I won, because I imagined every future. Don't worry, nobody can beat me when I look all the way.` : `I won! Did I trap you? Try a play that makes two threats at once.`); }
    } else {
      if (!w) { S.avx.d++; el.innerHTML = "<b>Draw</b>"; }
      else if (w.who === ME) { S.avx.x++; el.innerHTML = "<b>X-AI wins</b>"; }
      else { S.avx.o++; el.innerHTML = "<b>O-AI wins</b>"; }
    }
    renderStats();
    if (S.mode === "aivai" && S.auto) setTimeout(() => { if (S.auto && S.over) newGame(); }, S.speed === 0 ? 150 : 900);
  }

  // ---------- explanations ----------
  function verdictWord(v, final) {
    const c = vcat(v, final);
    return c === "win" ? "I'd win" : c === "lose" ? "I'd lose" : c === "draw" ? "a draw" : "?";
  }
  function explain(L) {
    const { out, depth, mover } = L;
    const o = out.options.find((x) => x.chosen);
    const you = mover === AI ? "you" : "the other AI";
    const name = CELL[o.move];
    let h = `<div>${ML.icon("eye")} I can play <b>${out.options.length}</b> ways. I imagined each one.</div><div class="arrow">${ML.icon("arrow-down")}</div>`;
    if (o.final === "win") {
      h += `<div>${ML.icon("target")} Playing <b>${name}</b> <b style="color:var(--good)">wins right now</b>. I take it!</div>`;
    } else if (depth <= 1) {
      h += `<div>${ML.icon("question")} I only look <b>1 move</b> ahead, so I can't tell my moves apart. I picked <b>${name}</b> by luck. A short-sighted brain like this is easy to trick!</div>`;
    } else if (o.final === "draw") {
      h += `<div>${ML.icon("target")} <b>${name}</b> fills the board: a draw.</div>`;
    } else {
      const seen = [], used = new Set();
      for (const r of o.replies) {
        if (r.skipped) continue;
        const key = kindOf(r.move) + vcat(r.value);
        if (used.has(key)) continue;
        used.add(key);
        seen.push(`${kindOf(r.move)} → ${verdictWord(r.value)}`);
      }
      const worst = o.value;
      const worstWord = worst > 0 ? `a win (+${worst})` : worst < 0 ? `a loss (${worst})` : "a draw (0)";
      h += `<div>${ML.icon("question")} If I play <b>${name}</b>, ${you} could reply: ${seen.slice(0, 4).join("; ")}${seen.length > 4 ? "…" : ""}</div><div class="arrow">${ML.icon("arrow-down")}</div>
        <div>${ML.icon("ruler")} Assuming ${you} replies well, my <b>worst case</b> there is <b>${worstWord}</b>.</div><div class="arrow">${ML.icon("arrow-down")}</div>
        <div>${ML.icon("trophy")} That is the best worst-case of all my options, so I play <b style="color:var(--accent)">${name}</b>.</div>`;
    }
    const counts = { win: 0, draw: 0, lose: 0, unk: 0 };
    out.options.forEach((x) => counts[vcat(x.value, x.final)]++);
    if (depth > 1) h += `<div class="muted" style="font-weight:700;font-size:.85rem">Of my ${out.options.length} options: ${counts.win} guarantee a win, ${counts.draw} a draw, ${counts.lose} lose against good play.</div>`;
    $("inside").innerHTML = h;
  }

  function strip(L) {
    const depths = [1, 2, 4, 9];
    let seed = 0;
    L.view.forEach((v, i) => (seed = (seed * 3 + v + i) >>> 0));
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    $("strip").innerHTML = depths.map((d) => {
      const mv = M.aiMove(L.view, d, true, rng);
      const nb = M.place(L.view, mv, AI);
      const cur = d === L.depth;
      return `<button class="ckpt ${cur ? "now" : ""}" data-d="${d}">${mini(nb, mv)}<b>${d === 9 ? "Looks to the end" : "Looks " + d + " ahead"}</b>${CELL[mv]}${cur ? " (this game)" : ""}</button>`;
    }).join("");
    $("strip").querySelectorAll(".ckpt").forEach((b) => b.addEventListener("click", () => setDepth(+b.dataset.d)));
  }

  function renderStats() {
    if (S.mode === "you") {
      $("k-me").textContent = "You win"; $("k-ai").textContent = "AI wins";
      $("st-me").textContent = S.tally.me; $("st-draw").textContent = S.tally.draw; $("st-ai").textContent = S.tally.ai;
    } else {
      $("k-me").textContent = "X-AI wins"; $("k-ai").textContent = "O-AI wins";
      $("st-me").textContent = S.avx.x; $("st-draw").textContent = S.avx.d; $("st-ai").textContent = S.avx.o;
    }
  }

  // ---------- controls ----------
  function updateBeat() {
    const p = $("beat").lastElementChild;
    $("depth-name").textContent = DEPTH_NAMES[S.depth];
    document.querySelectorAll("#presets button").forEach((b) => b.classList.toggle("on", +b.dataset.d === S.depth));
    if (S.mode === "aivai") p.textContent = `Try X-AI at depth 1 against O-AI at depth 9: the deep thinker never loses.`;
    else p.textContent = S.depth >= 9
      ? "Can you beat it? No. Looking all the way ahead, the best you can do is a draw."
      : S.depth <= 2 ? "This brain is short-sighted. Try a trap with two threats at once!" : "Pretty clever, but it can still miss a deep trap. Can you find one?";
  }
  function setDepth(d) {
    S.depth = d;
    $("depth").value = d;
    document.querySelector('[data-for="depth"]').textContent = d;
    updateBeat();
    ML.say(`Now I look <b>${d}</b> move${d > 1 ? "s" : ""} ahead${d >= 9 ? ", all the way to the end" : ""}.`);
  }
  ML.bindRange("#depth", (v) => v, (v) => { S.depth = v; updateBeat(); });
  ML.bindRange("#depthx", (v) => v, (v) => (S.depthX = v));
  document.querySelectorAll("#presets button").forEach((b) => b.addEventListener("click", () => setDepth(+b.dataset.d)));
  function seg(id, attr, fn) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      fn(b.dataset[attr]);
    }));
  }
  seg("mode", "m", (m) => {
    S.mode = m; S.auto = false;
    $("auto").classList.toggle("hidden", m !== "aivai");
    $("auto").innerHTML = `${ML.icon("play")} Play`;
    $("depthx-field").classList.toggle("hidden", m !== "aivai");
    $("first-field").classList.toggle("hidden", m === "aivai");
    updateBeat(); renderStats(); newGame();
    ML.say(m === "aivai" ? `Two AIs! The X-AI looks <b>${S.depthX}</b> ahead, the O-AI <b>${S.depth}</b>. Press Play.` : `Back to you versus me. Tap a square!`);
  });
  seg("first", "f", (f) => { S.first = f; newGame(); });
  seg("ab", "a", (a) => { S.ab = a === "1"; ML.say(S.ab ? `Pruning on: I skip branches that can't matter, and get the same answer.` : `Pruning off: I look at <b>everything</b>. Slower, same answer!`); });
  seg("speed", "v", (v) => (S.speed = +v));
  $("newgame").addEventListener("click", () => { newGame(); });
  $("auto").addEventListener("click", () => {
    S.auto = !S.auto;
    $("auto").innerHTML = S.auto ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
    if (S.auto && !S.anim) { if (S.over) newGame(); else startThink(S.turn === "ai" ? AI : ME); }
  });

  const cv = $("board");
  const cellAt = (e) => {
    const p = ML.canvasPoint(cv, e, BS, BS);
    const c = Math.floor(p.x / (BS / 3)), r = Math.floor(p.y / (BS / 3));
    return c >= 0 && c < 3 && r >= 0 && r < 3 ? r * 3 + c : -1;
  };
  cv.addEventListener("pointermove", (e) => (S.hover = cellAt(e)));
  cv.addEventListener("pointerleave", () => (S.hover = -1));
  const humanMove = (i) => {
    if (!canClick() || i < 0 || S.b[i]) return;
    S.b[i] = ME; S.pop[i] = performance.now();
    afterMove("me");
  };
  cv.addEventListener("pointerdown", (e) => humanMove(cellAt(e)));
  document.addEventListener("keydown", (e) => { if (/^[1-9]$/.test(e.key) && !e.target.matches("input,select,textarea")) humanMove(+e.key - 1); });

  // ---------- main loop ----------
  function frame(now) {
    if (S.anim) {
      const a = S.anim;
      a.t += S.speed === 0 ? 1e6 : ML.ticks(S.speed, "mm");
      const st = animState(a);
      const sig = [st.shown, st.focus, st.repShown, st.repReveal, [...st.optReveal].join(), st.done].join("|");
      if (sig !== S.sig) { S.sig = sig; renderTree(st); }
      S.ghost = st.focus >= 0 && !st.done ? a.out.options[st.focus].move : -1;
      if (S.cur.mover === AI) S.nodesShown = st.nodes;
      $("st-nodes").textContent = Math.round(st.nodes).toLocaleString();
      if (st.done && a.t >= a.sched.total) finishThink();
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  updateBeat();
  renderStats();
  renderTree(null);
  requestAnimationFrame(frame);
})();
