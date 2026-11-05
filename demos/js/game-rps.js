// Rock, Paper, Mind Reader — page: the arena, Robo's locked box, peeking, robot players,
// the win-rate chart, pattern tables, checkpoints, challenges and the Model X-ray.
(function () {
  const C = window.RPSCore;
  const { MOVES, beats, Robo, BOTS } = C;
  const $ = (s) => document.querySelector(s);
  const AW = 640, AH = 330;
  const arena = ML.setupCanvas($("#arena"), AW, AH);
  const chart = ML.setupCanvas($("#chart"), 640, 190);
  const ctx = arena.ctx;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const INK = "#1f2140";
  const Cap = (s) => s[0].toUpperCase() + s.slice(1);
  const WHY = { "0-2": "Rock smashes scissors", "1-0": "Paper wraps rock", "2-1": "Scissors cut paper" };
  const why = (a, b) => WHY[a + "-" + b] || WHY[b + "-" + a] || "Same move";

  const state = {
    mode: "you", bot: "rocky",
    robo: new Robo(), commit: null,
    log: [], roboRate: [], youRate: [], markers: [],
    playing: false, speed: 3, nextAt: 0,
    anim: null, last: null, viewing: null, peek: false, peekTried: false,
    adapt: null, test: null, diceRounds: 0, done: {},
    lastAct: performance.now(), dirty: true, chartDirty: true, tab: "after1",
  };
  state.commit = state.robo.decide();
  const who = () => (state.mode === "you" ? "you" : "the player");

  // ---------- drawing the moves (original art) ----------
  function drawMove(c, m, x, y, s) {
    if (!(s > 0.5)) return; // the pop-in animation starts from (almost) zero size
    c.save();
    c.lineJoin = "round"; c.lineCap = "round";
    c.strokeStyle = INK; c.lineWidth = Math.max(2, s * 0.07);
    if (m === 0) { // a chunky stone
      const r = [1, 0.9, 0.96, 0.84, 1, 0.92, 0.86, 0.98, 0.9];
      c.fillStyle = "#9aa1b8";
      c.beginPath();
      r.forEach((k, i) => { const a = (i / r.length) * Math.PI * 2 - 0.3; const px = x + Math.cos(a) * s * 0.78 * k, py = y + Math.sin(a) * s * 0.66 * k + s * 0.06; i ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = "rgba(255,255,255,.35)";
      c.beginPath(); c.ellipse(x - s * 0.25, y - s * 0.2, s * 0.24, s * 0.13, -0.4, 0, 7); c.fill();
      c.lineWidth = Math.max(1.5, s * 0.045);
      c.beginPath(); c.moveTo(x + s * 0.1, y - s * 0.05); c.lineTo(x + s * 0.28, y + s * 0.12); c.lineTo(x + s * 0.22, y + s * 0.32); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.35, y + s * 0.25); c.lineTo(x - s * 0.15, y + s * 0.33); c.stroke();
    } else if (m === 1) { // a sheet of paper with a folded corner
      c.translate(x, y); c.rotate(-0.12);
      const w = s * 1.1, h = s * 1.4, f = s * 0.32;
      c.fillStyle = "#ffffff";
      c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2 - f, -h / 2); c.lineTo(w / 2, -h / 2 + f); c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = "#dfe4f2";
      c.beginPath(); c.moveTo(w / 2 - f, -h / 2); c.lineTo(w / 2 - f, -h / 2 + f); c.lineTo(w / 2, -h / 2 + f); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = "#8fb6ff"; c.lineWidth = Math.max(1.2, s * 0.04);
      for (let k = 0; k < 4; k++) { const ly = -h / 2 + f + s * 0.18 + k * s * 0.22; c.beginPath(); c.moveTo(-w / 2 + s * 0.16, ly); c.lineTo(w / 2 - s * 0.16, ly); c.stroke(); }
    } else { // scissors
      const pv = { x, y: y + s * 0.12 };
      const blade = (sx) => {
        c.fillStyle = "#d4dae8";
        c.beginPath();
        c.moveTo(x + sx * s * 0.36, y + s * 0.5);
        c.lineTo(x - sx * s * 0.5, y - s * 0.78);
        c.lineTo(x - sx * s * 0.34, y - s * 0.8);
        c.lineTo(x + sx * s * 0.22, y + s * 0.42);
        c.closePath(); c.fill(); c.stroke();
      };
      blade(1); blade(-1);
      for (const [sx, col] of [[-1, "#ff5c7a"], [1, "#ff8a3d"]]) {
        c.fillStyle = col;
        c.beginPath(); c.arc(x + sx * s * 0.36, y + s * 0.62, s * 0.24, 0, 7); c.fill(); c.stroke();
        c.fillStyle = ML.isDark() ? "#2a2f55" : "#ffffff";
        c.beginPath(); c.arc(x + sx * s * 0.36, y + s * 0.62, s * 0.11, 0, 7); c.fill(); c.stroke();
      }
      c.fillStyle = INK; c.beginPath(); c.arc(pv.x, pv.y, s * 0.07, 0, 7); c.fill();
    }
    c.restore();
  }

  function drawRobo(x, y, s, mood, look) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(0, -s * 1.2); ctx.stroke();
    ctx.fillStyle = "#ffb020"; ctx.beginPath(); ctx.arc(0, -s * 1.25, s * 0.12, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ML.cssVar("--accent");
    ctx.beginPath(); ctx.roundRect(-s, -s * 0.9, s * 2, s * 1.6, s * 0.4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(-s * 0.72, -s * 0.62, s * 1.44, s * 0.92, s * 0.25); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    for (const ex of [-0.32, 0.32]) { ctx.beginPath(); ctx.ellipse(s * ex + look * s * 0.1, -s * 0.25, s * 0.11, s * 0.14, 0, 0, 7); ctx.fill(); }
    ctx.lineWidth = 2.5; ctx.beginPath();
    if (mood > 0) ctx.arc(0, -s * 0.05, s * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mood < 0) ctx.arc(0, s * 0.18, s * 0.2, 1.15 * Math.PI, 1.85 * Math.PI);
    else { ctx.moveTo(-s * 0.15, s * 0.06); ctx.lineTo(s * 0.15, s * 0.06); }
    ctx.stroke();
    ctx.restore();
  }
  function drawPlayer(x, y, s, mood) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    if (state.mode === "bot") { // a little robot player, coloured per personality
      const col = { rocky: "#9aa1b8", cycler: "#7c5cff", copycat: "#ff5c9a", sore: "#ff8a3d", dice: "#2fbf62" }[state.bot];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.roundRect(-s * 0.9, -s * 0.85, s * 1.8, s * 1.55, s * 0.2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(-s * 0.62, -s * 0.55, s * 1.24, s * 0.8, s * 0.15); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      if (state.bot === "dice") { for (const [dx, dy] of [[-0.3, -0.35], [0, -0.15], [0.3, 0.05]]) { ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.08, 0, 7); ctx.fill(); } }
      else for (const ex of [-0.28, 0.28]) { ctx.fillRect(ex * s - s * 0.1, -s * 0.32, s * 0.2, s * 0.16); }
    } else { // you: a round friendly face
      ctx.fillStyle = "#ffd7b0";
      ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.85, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#6b4a2b"; ctx.beginPath(); ctx.arc(0, -s * 0.45, s * 0.75, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.fillStyle = INK;
      for (const ex of [-0.3, 0.3]) { ctx.beginPath(); ctx.arc(ex * s, -s * 0.15, s * 0.09, 0, 7); ctx.fill(); }
      ctx.lineWidth = 2.5; ctx.beginPath();
      if (mood > 0) ctx.arc(0, s * 0.05, s * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
      else if (mood < 0) ctx.arc(0, s * 0.42, s * 0.25, 1.2 * Math.PI, 1.8 * Math.PI);
      else { ctx.moveTo(-s * 0.18, s * 0.25); ctx.lineTo(s * 0.18, s * 0.25); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function plate(x, y, r, glow) {
    ctx.save();
    ctx.fillStyle = ML.cssVar("--card");
    ctx.strokeStyle = glow || ML.cssVar("--line"); ctx.lineWidth = glow ? 6 : 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function lockedBox(x, y, open) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.fillStyle = "#c98f4a";
    ctx.beginPath(); ctx.roundRect(-46, -14, 92, 52, 8); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(-46, -14); ctx.rotate(open ? -0.5 : 0);
    ctx.fillStyle = "#e0a85e"; ctx.beginPath(); ctx.roundRect(0, -22, 92, 24, 8); ctx.fill(); ctx.stroke(); ctx.restore();
    if (!open) {
      ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.roundRect(-11, -6, 22, 20, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -8, 7, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 4, 3, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  const easeBack = (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const L = { x: 165, y: 200 }, R = { x: 475, y: 200 }, PR = 66;

  function draw(now) {
    const dark = ML.isDark();
    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = dark ? "#1d2346" : "#eef6ff"; ctx.fillRect(0, 0, AW, AH);
    ctx.fillStyle = dark ? "#252b55" : "#dceaff";
    ctx.beginPath(); ctx.roundRect(20, 120, AW - 40, 175, 30); ctx.fill();
    // scoreboard
    const n = state.log.length;
    const sc = score();
    ctx.textAlign = "center"; ctx.fillStyle = ML.cssVar("--ink");
    ctx.font = "700 15px Nunito, sans-serif";
    ctx.fillText(state.mode === "you" ? "You" : BOTS[state.bot].name, L.x, 22);
    ctx.fillText("Robo", R.x, 22);
    ctx.font = "700 30px Fredoka, sans-serif";
    ctx.fillText(sc.you, L.x, 54); ctx.fillText(sc.robo, R.x, 54);
    ctx.font = "800 13px Nunito, sans-serif"; ctx.fillStyle = ML.cssVar("--muted");
    ctx.fillText(`Round ${n + (state.anim ? 0 : 1)} · ties ${sc.tie}`, AW / 2, 22);

    const a = state.anim;
    const t = a ? now - a.start : 0;
    const shaking = a && t < a.shake;
    const revealed = a && !shaking;
    const shown = revealed ? a : null;
    const res = shown ? shown.res : 0;
    // faces
    drawPlayer(L.x - 100, 80, 26, shown ? res : 0);
    drawRobo(R.x + 100, 84, 26, shown ? -res : 0, -1);
    ctx.font = "700 26px Fredoka, sans-serif"; ctx.fillStyle = ML.cssVar("--muted"); ctx.textAlign = "center";
    ctx.fillText("VS", AW / 2, L.y + 10);

    const good = ML.cssVar("--good"), bad = ML.cssVar("--bad");
    plate(L.x, L.y, PR, shown ? (res > 0 ? good : res < 0 ? bad : null) : null);
    plate(R.x, R.y, PR, shown ? (res < 0 ? good : res > 0 ? bad : null) : null);

    if (shaking) {
      const k = t / a.shake;
      const bob = Math.abs(Math.sin(k * Math.PI * 3)) * 26;
      drawMove(ctx, 0, L.x, L.y - bob, 38);
      drawMove(ctx, 0, R.x, R.y - bob, 38);
      const words = ["Rock…", "Paper…", "Scissors…"];
      ctx.font = "700 24px Fredoka, sans-serif"; ctx.fillStyle = ML.cssVar("--accent");
      ctx.fillText(words[Math.min(2, Math.floor(k * 3))], AW / 2, 100);
    } else if (shown) {
      const p = Math.min(1, (t - a.shake) / a.pop);
      const sc2 = reduce ? 1 : easeBack(p);
      drawMove(ctx, a.kid, L.x, L.y, 46 * sc2);
      drawMove(ctx, a.robo, R.x, R.y, 46 * sc2);
      ctx.font = "700 30px Fredoka, sans-serif";
      ctx.fillStyle = res > 0 ? good : res < 0 ? bad : ML.cssVar("--muted");
      const youTxt = state.mode === "you" ? "You win!" : `${BOTS[state.bot].name} wins!`;
      ctx.fillText(res > 0 ? youTxt : res < 0 ? "Robo wins!" : "Tie!", AW / 2, 100);
      ctx.font = "800 14px Nunito, sans-serif"; ctx.fillStyle = ML.cssVar("--ink-2");
      ctx.fillText(why(a.kid, a.robo), AW / 2, 318);
      if (t > a.shake + a.pop + a.hold) { state.last = a; state.anim = null; }
    } else {
      // waiting for the next move
      ctx.font = "700 64px Fredoka, sans-serif"; ctx.fillStyle = ML.cssVar("--muted");
      const pulse = reduce ? 1 : 1 + Math.sin(now / 300) * 0.05;
      ctx.save(); ctx.translate(L.x, L.y + 22); ctx.scale(pulse, pulse); ctx.fillText("?", 0, 0); ctx.restore();
      lockedBox(R.x, R.y - 10, state.peek && !state.viewing);
      if (state.peek && !state.viewing) drawMove(ctx, state.commit.move, R.x, R.y - 30, 22);
      ctx.font = "800 14px Nunito, sans-serif"; ctx.fillStyle = ML.cssVar("--ink-2");
      const hint = state.viewing ? `Looking back: Robo's brain at round ${state.viewing.n}` :
        state.mode === "you" ? "Robo has locked in its move. Your turn: R, P or S!" :
        state.playing ? "" : `Press Play to let ${BOTS[state.bot].name} play Robo`;
      if (hint) ctx.fillText(hint, AW / 2, 318);
      ctx.font = "800 12px Nunito, sans-serif"; ctx.fillStyle = ML.cssVar("--muted");
      ctx.fillText(state.peek ? "box open (peeking!)" : "locked in", R.x, R.y + 52);
      if (state.last && state.speed >= 10 && state.mode === "bot") { // fast play: show the latest round small
        const l = state.last;
        drawMove(ctx, l.kid, L.x - 34, L.y + 40, 14); drawMove(ctx, l.robo, R.x - 34, R.y + 40, 14);
      }
    }
    // peek thought bubble
    if (state.peek && !state.viewing && !revealed) {
      const bx = R.x - 30, by = 82;
      ctx.fillStyle = ML.cssVar("--card"); ctx.strokeStyle = ML.cssVar("--accent"); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(bx - 150, by - 34, 230, 60, 16); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + 60, by + 34, 6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + 74, by + 46, 4, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "800 12px Nunito, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(`I think ${who()}'ll play`, bx - 140, by - 12);
      ctx.fillText(`${Math.round(state.commit.sure * 100)}% sure, so I play`, bx - 140, by + 14);
      drawMove(ctx, state.commit.guess, bx + 30, by - 16, 12);
      drawMove(ctx, state.commit.move, bx + 56, by + 10, 12);
      ctx.textAlign = "center";
    }
  }

  // ---------- rounds ----------
  function score() {
    let you = 0, robo = 0, tie = 0;
    for (const r of state.log) r.res > 0 ? you++ : r.res < 0 ? robo++ : tie++;
    return { you, robo, tie };
  }
  const rateOf = (rows) => (rows.length ? Math.round((100 * rows.filter((r) => r.res === -1).length) / rows.length) : 0);
  const CKPT_AT = [1, 5, 10, 20, 40, 80, 150, 300, 600, 1200, 2500, 5000];

  function doRound(kid, whoId) {
    const d = state.commit;
    const res = state.robo.observe(kid, d.move);
    const row = { kid, robo: d.move, res, who: whoId, guess: d.guess, sure: d.sure };
    state.log.push(row);
    const w = state.log.slice(-10);
    state.roboRate.push(rateOf(w));
    state.youRate.push(Math.round((100 * w.filter((r) => r.res === 1).length) / w.length));
    state.commit = state.robo.decide();
    if (CKPT_AT.includes(state.log.length)) ckpts.add(makeCheckpoint(state.log.length));
    if (state.log.length >= 20 && rateOf(state.log.slice(-20)) >= 70) ML.xray.offer("Robo found a habit! X-ray its brain");
    checkChallenges(row);
    state.dirty = state.chartDirty = true;
    return row;
  }

  function playYou(m) {
    if (state.mode !== "you" || state.viewing) return;
    if (state.anim && performance.now() - state.anim.start < state.anim.shake) return; // still shaking
    poke();
    const row = doRound(m, "you");
    state.anim = { ...row, start: performance.now(), shake: reduce ? 0 : 420, pop: reduce ? 1 : 260, hold: 1100 };
    narrateYou(row);
    if (state.test) stepTest(row);
  }

  function botRound(animate, now) {
    const kid = BOTS[state.bot].play(state.robo.history, Math.random);
    const row = doRound(kid, state.bot);
    if (state.bot === "dice") diceTick();
    checkAdapt();
    if (animate) {
      const slow = state.speed <= 1;
      state.anim = { ...row, start: now, shake: slow && !reduce ? 450 : 0, pop: reduce ? 1 : slow ? 260 : 160, hold: slow ? 650 : 170 };
      state.nextAt = now + state.anim.shake + state.anim.pop + state.anim.hold + 20;
    } else state.last = row;
  }

  // ---------- narration ----------
  function narrateYou(row) {
    const yours = state.log.filter((r) => r.who === "you");
    const n = yours.length;
    const top = state.robo.top();
    const k = MOVES[row.kid], rk = MOVES[row.robo];
    const res = row.res > 0 ? "You win!" : row.res < 0 ? "I win!" : "Tie!";
    const hit = row.guess === row.kid;
    if (n === 1) return ML.say(`${res} I knew nothing about you, so that was pure luck. I'm writing down everything now…`);
    const last3 = yours.slice(-3);
    if (state.peek && last3.length === 3 && last3.every((r) => r.res === 1)) return ML.say(`Hey, you're <b>peeking</b>! Of course you win when you can read MY mind. Untick Peek for a fair game.`);
    if (last3.length === 3 && last3.every((r) => r.kid === row.kid) && hit) return ML.say(`${Cap(k)} three times in a row? My spotters noticed! I'm trusting <b>${top.name}</b>.`);
    if (last3.length === 3 && last3.every((r) => r.res === -1)) return ML.say(`Three wins in a row for me! I guessed ${k} because of <b>${top.name}</b>. Can you surprise me?`);
    if (last3.length === 3 && last3.every((r) => r.res === 1)) return ML.say(`You beat me three times! My spotters are confused… Are you changing your habits?`);
    if (n % 10 === 0) {
      const r = rateOf(yours.slice(-10));
      return ML.say(r >= 50 ? `${n} rounds: I won <b>${r}%</b> of the last 10. Lucky guessing would be 33%, so I've found a habit!` :
        r <= 30 ? `${n} rounds: I only won <b>${r}%</b> of the last 10. You're hard to read!` :
        `${n} rounds: I won <b>${r}%</b> of the last 10, close to lucky guessing (33%). Keep going!`);
    }
    ML.say(`You played <b>${k}</b>, I played <b>${rk}</b>. ${res} ${hit ? "I guessed right!" : `I guessed you'd play ${MOVES[row.guess]}.`}`);
  }

  function addMarker(label) {
    state.markers.push({ at: state.log.length, label });
    state.chartDirty = true;
    flash(label);
  }
  function flash(text) {
    const o = $("#overlay");
    o.textContent = text;
    o.classList.add("show");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => o.classList.remove("show"), 1500);
  }

  // After a new robot player joins, report the drop and the comeback.
  function checkAdapt() {
    const a = state.adapt;
    if (!a) return;
    const since = state.log.length - a.at;
    const r10 = rateOf(state.log.slice(-Math.min(10, since)));
    if (a.bot === "dice") {
      if (since === 50) { ML.say(`50 rounds against Truly random and I'm stuck around <b>${rateOf(state.log.slice(-50))}%</b>, about the same as lucky guessing. No pattern = nothing to learn.`); state.adapt = null; }
      return;
    }
    if (since >= 6 && r10 >= 70) {
      ML.say(`I adapted to <b>${BOTS[a.bot].name}</b> after ${since} rounds! I'm trusting <b>${state.robo.top().name}</b> now. Nobody re-programmed me.`);
      ML.confetti(30);
      state.adapt = null;
    } else if (since >= 80) state.adapt = null;
  }

  // ---------- challenges ----------
  function markDone(id, msg, tryMsg) {
    if (state.done[id]) return;
    state.done[id] = true;
    $("#c-" + id).classList.add("done");
    ML.toast(`Challenge done: ${msg}`);
    ML.confetti(70);
    setTimeout(() => ML.say(`${msg} <b>Try this:</b> ${tryMsg}`), 400);
  }
  function checkChallenges(row) {
    if (row.who === "you") {
      const yours = state.log.filter((r) => r.who === "you").slice(-20);
      const w = yours.filter((r) => r.res === -1).length;
      $("#p-teach").textContent = `Robo has won ${w} of your last ${yours.length}.`;
      if (yours.length >= 20 && w >= 14) markDone("teach", "You taught Robo your habit!", "now suddenly change your habit and count how many rounds Robo needs to catch on.");
    }
    if (row.who === "cycler") {
      const tail = state.log.slice(-20);
      const run = [];
      for (let i = state.log.length - 1; i >= 0 && state.log[i].who === "cycler" && run.length < 20; i--) run.push(state.log[i]);
      const w = run.filter((r) => r.res === -1).length;
      $("#p-cycler").textContent = `Robo won ${w} of the last ${run.length} rounds against the Cycler.`;
      if (run.length >= 20 && tail.length === 20 && w >= 16) markDone("cycler", "Robo crushed the Cycler!", "switch to Copycat. Which spotter does Robo start trusting?");
    }
  }

  function startTest() {
    poke();
    setMode("you");
    state.peek = false; $("#peek").checked = false; $("#peek").disabled = true;
    $("#peek-lbl").classList.add("locked");
    state.test = { n: 0, wins: 0, kids: [] };
    addMarker("30-round test");
    $("#go-hard").disabled = true;
    $("#p-hard").textContent = "Round 0 of 30 · Robo won 0";
    ML.say(`The test starts now! 30 rounds, no peeking. Try to be <b>unpredictable</b>: don't fall into a habit. Can you keep my wins at 11 or fewer?`);
  }
  function stepTest(row) {
    const t = state.test;
    t.n++; t.kids.push(row.kid);
    if (row.res === -1) t.wins++;
    $("#p-hard").textContent = `Round ${t.n} of 30 · Robo won ${t.wins}`;
    if (t.n < 30) return;
    state.test = null;
    $("#peek").disabled = false; $("#peek-lbl").classList.remove("locked");
    $("#go-hard").disabled = false;
    $("#go-hard").innerHTML = `${ML.icon("target")} Try the test again`;
    let rep = 0;
    for (let i = 1; i < t.kids.length; i++) if (t.kids[i] === t.kids[i - 1]) rep++;
    const repPct = Math.round((100 * rep) / (t.kids.length - 1));
    const pct = Math.round((100 * t.wins) / 30);
    $("#p-hard").textContent = `Last test: Robo won ${t.wins} of 30 (${pct}%). You repeated your move ${repPct}% of the time (a dice: about 33%).`;
    if (t.wins <= 11) markDone("hard", `Robo only won ${t.wins} of 30 (${pct}%). You were hard to read!`, `you repeated your move ${repPct}% of the time. A dice repeats about 33%. Check the Win / lose table to see what Robo noticed.`);
    else ML.say(`Robo won ${t.wins} of 30 (${pct}%), so it found something. You repeated your move <b>${repPct}%</b> of the time; a dice repeats about 33%. People often avoid repeats, and that's a pattern too! Try again?`);
  }

  function diceTick() {
    state.diceRounds++;
    const d = state.log.filter((r) => r.who === "dice");
    $("#p-dice").textContent = `${Math.min(60, state.diceRounds)} of 60 rounds · Robo won ${rateOf(d)}% so far`;
    if (state.diceRounds === 60 && !state.done.dice) {
      $("#quiz").classList.remove("hidden");
      state.playing = false; syncPlay();
      ML.say(`60 rounds against Truly random, and I won about <b>${rateOf(d)}%</b>, near lucky guessing. Answer my question in challenge 4: <b>why can't I do better?</b>`);
    }
  }

  // ---------- checkpoints ----------
  function drawMiniTrust(cv, robo) {
    const c = cv.getContext("2d"), W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    const w = robo.trust();
    c.font = "800 13px Nunito, sans-serif";
    robo.spotters.forEach((s, i) => {
      const y = 10 + i * 22;
      c.fillStyle = ML.cssVar("--muted"); c.textAlign = "left"; c.fillText(s.short, 6, y + 12);
      c.fillStyle = ML.cssVar("--bg-2"); c.fillRect(100, y + 2, W - 110, 12);
      c.fillStyle = ML.cssVar("--accent"); c.fillRect(100, y + 2, (W - 110) * w[i], 12);
    });
  }
  function makeCheckpoint(n) {
    const snap = state.robo.clone();
    return {
      label: `Round ${n}`,
      sub: `won ${rateOf(state.log.slice(-10))}% of last 10`,
      robo: snap, n,
      draw: (cv) => drawMiniTrust(cv, snap),
    };
  }
  const ckpts = new GameLab.Checkpoints(
    $("#ckpts"),
    (it) => {
      poke();
      state.viewing = it;
      state.playing = false; syncPlay();
      let msg = `This is my brain after <b>${it.n}</b> round${it.n > 1 ? "s" : ""}. The bars show which spotters I trusted back then.`;
      if (state.mode === "bot") {
        const then = C.frozenTest(it.robo, state.bot, 100), now = C.frozenTest(state.robo, state.bot, 100);
        msg += ` Frozen like that, I'd win <b>${then.wins}</b> of 100 against ${BOTS[state.bot].name}. Today's me: <b>${now.wins}</b> of 100.`;
      } else {
        const moves = state.log.filter((r) => r.who === "you").slice(-40).map((r) => r.kid);
        if (moves.length >= 5) {
          const then = C.frozenTest(it.robo, moves, moves.length), now = C.frozenTest(state.robo, moves, moves.length);
          msg += ` Replaying your last ${moves.length} moves, that younger me would win <b>${then.wins}</b>. Today's me: <b>${now.wins}</b>.`;
        }
      }
      ML.say(msg);
      state.dirty = true;
    },
    () => { state.viewing = null; state.dirty = true; ML.say(`Back to the live Robo!`); }
  );

  // ---------- chart ----------
  function drawChart() {
    const { ctx: c, w, h } = chart;
    c.clearRect(0, 0, w, h);
    const Lp = 36, Rp = 12, T = 24, B = 22;
    const N = state.roboRate.length, n = Math.max(20, N);
    const X = (i) => Lp + ((w - Lp - Rp) * i) / (n - 1);
    const Y = (v) => T + (h - T - B) * (1 - v / 100);
    c.font = "700 10px Nunito, sans-serif"; c.lineWidth = 1;
    c.strokeStyle = ML.cssVar("--line"); c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right";
    for (let v = 0; v <= 100; v += 25) { c.beginPath(); c.moveTo(Lp, Y(v)); c.lineTo(w - Rp, Y(v)); c.stroke(); c.fillText(v + "%", Lp - 4, Y(v) + 3); }
    c.textAlign = "center";
    const raw = Math.ceil(n / 8), step = raw <= 5 ? 5 : raw <= 10 ? 10 : raw <= 25 ? 25 : raw <= 50 ? 50 : Math.ceil(raw / 100) * 100;
    for (let r = step; r <= n; r += step) c.fillText(r, X(r - 1), h - 6);
    c.fillText("round", Lp + 12, h - 6);
    // chance line
    c.strokeStyle = ML.cssVar("--muted"); c.setLineDash([6, 5]); c.lineWidth = 2;
    c.beginPath(); c.moveTo(Lp, Y(33.3)); c.lineTo(w - Rp, Y(33.3)); c.stroke(); c.setLineDash([]);
    c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right"; c.font = "800 10px Nunito, sans-serif";
    c.fillText("lucky guessing", w - Rp - 2, Y(33.3) - 4);
    state.markers.forEach((m, k) => {
      const x = X(Math.max(0, m.at - 0.5));
      c.strokeStyle = ML.cssVar("--bad"); c.setLineDash([5, 4]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, T - 6); c.lineTo(x, h - B); c.stroke(); c.setLineDash([]);
      c.fillStyle = ML.cssVar("--bad"); c.textAlign = "left"; c.font = "800 10px Nunito, sans-serif";
      c.fillText(m.label, Math.min(x + 3, w - 110), T - 10 + (k % 2) * 11);
    });
    if (!N) {
      c.fillStyle = ML.cssVar("--muted"); c.font = "700 14px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText("Each round adds a point here", w / 2, h / 2);
      return;
    }
    const stride = Math.max(1, Math.floor(N / 600));
    for (const [vals, col, lw] of [[state.youRate, "--rl", 2], [state.roboRate, "--accent", 3]]) {
      c.strokeStyle = ML.cssVar(col); c.lineWidth = lw; c.lineJoin = "round";
      c.globalAlpha = col === "--rl" ? 0.75 : 1;
      c.beginPath();
      for (let i = 0; i < N; i += stride) i ? c.lineTo(X(i), Y(vals[i])) : c.moveTo(X(i), Y(vals[i]));
      c.lineTo(X(N - 1), Y(vals[N - 1]));
      c.stroke();
      if (N <= 80) { c.fillStyle = ML.cssVar(col); vals.forEach((v, i) => { c.beginPath(); c.arc(X(i), Y(v), 2.4, 0, 7); c.fill(); }); }
      c.globalAlpha = 1;
    }
  }

  // ---------- panels ----------
  function renderStats() {
    const sc = score();
    $("#st-n").textContent = state.log.length;
    $("#st-rate").innerHTML = state.log.length ? `${rateOf(state.log.slice(-20))}<small>%</small>` : "–";
    $("#st-score").textContent = `${sc.you} · ${sc.robo} · ${sc.tie}`;
    $("#strip").innerHTML = state.log.slice(-24).map((r) =>
      `<i class="${r.res > 0 ? "w" : r.res < 0 ? "l" : "t"}" title="${MOVES[r.kid]} vs Robo's ${MOVES[r.robo]}">${C.SHORT[r.kid]}</i>`).join("");
  }

  function renderInside() {
    const robo = state.viewing ? state.viewing.robo : state.robo;
    const h = robo.history;
    const b = robo.belief();
    const order = robo.spotters.map((s, i) => i).sort((x, y) => b.w[y] - b.w[x]);
    const top = robo.spotters[order[0]];
    const guess = b.p.indexOf(Math.max(...b.p));
    const hits = (s) => Math.round(s.hits.reduce((a, v) => a + v, 0));
    const situation = !h.length ? `No rounds yet: every move looks equally likely to me.` :
      h.length === 1 ? `Last move: <b>${MOVES[h[0].kid]}</b>.` :
      `Last two moves: <b>${MOVES[h[h.length - 2].kid]}</b>, <b>${MOVES[h[h.length - 1].kid]}</b>. Last round ${h[h.length - 1].res > 0 ? `${who()} won` : h[h.length - 1].res < 0 ? "I won" : "was a tie"}.`;
    const secret = state.mode === "you" && !state.peek && !state.viewing;
    let pred;
    if (secret) {
      const l = state.log[state.log.length - 1];
      pred = `<div>${ML.icon("eye")} My guess for this round is <b>secret</b>. Tick Peek to see it.</div>` +
        (l ? `<div class="arrow">${ML.icon("arrow-down")}</div><div>${ML.icon("target")} Last round I guessed <b>${MOVES[l.guess]}</b> (${Math.round(l.sure * 100)}%) and played <b>${MOVES[l.robo]}</b>. You played ${MOVES[l.kid]}: ${l.guess === l.kid ? "<b style='color:var(--good)'>right!</b>" : "<b style='color:var(--bad)'>wrong</b>"}</div>` : "");
    } else {
      pred = `<div>${ML.icon("search")} Mixing my spotters: ${who()}'ll play <b>${MOVES[guess]}</b> (${Math.round(b.p[guess] * 100)}%)</div>
        <div class="arrow">${ML.icon("arrow-down")}</div>
        <div>${ML.icon("target")} So I lock in <b style="color:var(--accent)">${MOVES[beats(guess)]}</b>, which beats ${MOVES[guess]}.</div>`;
    }
    $("#inside").innerHTML = `<div>${situation}</div><div>${ML.icon("trophy")} Spotter I trust most: <b>${top.name}</b> (right ${hits(top)} of last ${top.hits.length || 0})</div>${pred}`;
    $("#trust").innerHTML = `<div class="row1"><span class="muted">How much I trust each spotter</span><span class="hits">right /10</span></div>` +
      robo.spotters.map((s, i) => `<div class="row1 ${s === top ? "top" : ""}"><span>${s.short}</span><span class="hits">${hits(s)}/${s.hits.length}</span>
        <span class="bar" role="meter" aria-label="Trust in ${s.short}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(b.w[i] * 100)}"><span style="width:${Math.round(b.w[i] * 100)}%"></span></span></div>`).join("");
  }

  const TAB_HINT = {
    fav: "One row: how often each move is played overall.",
    after1: "Rows: the last move. Columns: what came next.",
    after2: "Rows: the last two moves. Columns: what came next.",
    wsls: "Rows: did the last round end in a win, loss or tie (for the player)? Columns: what they did next, compared with their own last move.",
    copy: "One row: the player's move compared with Robo's last move. Copycats live in the first column!",
  };
  const ROWS = {
    fav: [["all", "Any time"]],
    after1: MOVES.map((m, i) => [C.SHORT[i], "After " + m]),
    after2: [].concat(...[0, 1, 2].map((a) => [0, 1, 2].map((b) => [C.SHORT[a] + C.SHORT[b], `${Cap(MOVES[a])}, ${MOVES[b]}`]))),
    wsls: [["w", "After a win"], ["l", "After a loss"], ["t", "After a tie"]],
    copy: [["all", "Any time"]],
  };
  function renderTabs() {
    const robo = state.robo;
    $("#tabs").innerHTML = robo.spotters.map((s) => `<button role="tab" aria-selected="${s.id === state.tab}" class="${s.id === state.tab ? "on" : ""}" data-t="${s.id}">${s.short}</button>`).join("");
    $("#tabs").querySelectorAll("button").forEach((bt) => bt.addEventListener("click", () => { poke(); state.tab = bt.dataset.t; renderTabs(); renderTable(); }));
  }
  function renderTable() {
    const robo = state.viewing ? state.viewing.robo : state.robo;
    const s = robo.spotters.find((x) => x.id === state.tab);
    $("#tab-hint").textContent = TAB_HINT[s.id];
    const nowKey = s.ctx(robo.history);
    let html = `<tr><th></th>${s.labels.map((l) => `<th scope="col">${l}</th>`).join("")}</tr>`;
    for (const [key, label] of ROWS[s.id]) {
      const c = s.table.get(key) || [0, 0, 0];
      const n = c[0] + c[1] + c[2];
      html += `<tr class="${key === nowKey ? "now" : ""}"><th scope="row" class="rowh">${label}</th>` + c.map((v) => {
        if (n < 0.05) return `<td style="background:var(--bg-2);color:var(--muted)">–</td>`;
        const f = v / n;
        return `<td style="background:color-mix(in srgb, var(--accent) ${Math.round(8 + f * 80)}%, var(--card));color:${f > 0.55 ? "#fff" : "var(--ink)"}">${Math.round(f * 100)}%</td>`;
      }).join("") + "</tr>";
    }
    $("#ptable").innerHTML = html;
  }

  // ---------- controls ----------
  function poke() { state.lastAct = performance.now(); }
  document.addEventListener("pointerdown", poke, { passive: true });

  function drawButtons() {
    document.querySelectorAll("#moves button").forEach((b) => {
      const c = b.querySelector("canvas").getContext("2d");
      c.clearRect(0, 0, 108, 108);
      drawMove(c, +b.dataset.m, 54, 50, 40);
    });
  }
  drawButtons();
  document.querySelectorAll("#moves button").forEach((b) => b.addEventListener("click", () => playYou(+b.dataset.m)));
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName) && e.target.type !== "checkbox" && e.target.type !== "range") return;
    const k = e.key.toLowerCase();
    const m = { r: 0, p: 1, s: 2, 1: 0, 2: 1, 3: 2 }[k];
    if (m === undefined) return;
    if (state.mode !== "you") { ML.say(`Switch "Who plays Robo?" to <b>You</b> to play with the keyboard.`); return; }
    playYou(m);
  });

  const botsHost = $("#bots");
  botsHost.innerHTML = Object.entries(BOTS).map(([id, b]) => `<button class="btn small ${id === state.bot ? "on" : ""}" data-b="${id}" aria-pressed="${id === state.bot}">${b.name}<small>${b.blurb}</small></button>`).join("");
  botsHost.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { poke(); setBot(b.dataset.b); if (state.mode !== "bot") setMode("bot"); }));

  function setBot(id) {
    const changed = id !== state.bot;
    state.bot = id;
    botsHost.querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b.dataset.b === id); b.setAttribute("aria-pressed", b.dataset.b === id); });
    if (changed && state.mode === "bot" && state.log.length) {
      addMarker(`${BOTS[id].name} joins`);
      state.adapt = { at: state.log.length, bot: id };
    }
    if (state.mode === "bot") ML.say(id === "dice" ? `<b>Truly random</b> rolls a dice. Let's see if any of my spotters can find a pattern… Press <b>Play</b>.` :
      `<b>${BOTS[id].name}</b>: ${BOTS[id].blurb} My spotters will hunt for the habit. Press <b>Play</b> and watch my line climb.`);
  }

  function setMode(m) {
    if (m === state.mode) return;
    if (state.test && m !== "you") { state.test = null; $("#peek").disabled = false; $("#peek-lbl").classList.remove("locked"); $("#go-hard").disabled = false; $("#p-hard").textContent = "Test stopped (you switched to a robot player)."; }
    state.mode = m;
    state.playing = false;
    state.anim = null;
    document.querySelectorAll("#mode button").forEach((x) => { x.classList.toggle("on", x.dataset.m === m); x.setAttribute("aria-pressed", x.dataset.m === m); });
    document.querySelectorAll("#moves button").forEach((b) => (b.disabled = m !== "you"));
    $("#play").disabled = $("#step").disabled = m !== "bot";
    if (state.log.length) {
      addMarker(m === "you" ? "You play" : `${BOTS[state.bot].name} joins`);
      state.adapt = m === "bot" ? { at: state.log.length, bot: state.bot } : null;
    }
    syncPlay();
    state.dirty = true;
    ML.say(m === "you" ? `Your turn! Press <b>R</b>, <b>P</b> or <b>S</b>. I remember everything from before, so I may expect the robot's habits at first…` :
      `<b>${BOTS[state.bot].name}</b> will play me. ${BOTS[state.bot].blurb} Press <b>Play</b>!`);
  }
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => { poke(); setMode(b.dataset.m); }));

  $("#peek").addEventListener("change", (e) => {
    poke();
    state.peek = e.target.checked;
    state.dirty = true;
    if (state.peek) {
      state.peekTried = true;
      ML.say(`Peeking! The box is open: you can see what I guessed and what I locked in. Knowing a model's guess makes it easy to beat. Try winning 3 in a row!`);
    } else ML.say(`Box closed again. Fair game!`);
  });

  const playBtn = $("#play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; playBtn.setAttribute("aria-pressed", state.playing); }
  playBtn.addEventListener("click", () => {
    if (state.mode !== "bot") return;
    poke();
    if (state.viewing) { state.viewing = null; ckpts.active = null; ckpts.render(); }
    state.playing = !state.playing;
    state.nextAt = 0;
    syncPlay();
    if (state.playing && !state.log.length) ML.say(`Watch the chart: my line starts near the dashed "lucky guessing" line. Will it climb?`);
  });
  $("#step").addEventListener("click", () => {
    if (state.mode !== "bot") return;
    poke();
    state.playing = false; syncPlay();
    if (state.viewing) { state.viewing = null; ckpts.active = null; ckpts.render(); }
    botRound(true, performance.now());
    const l = state.log[state.log.length - 1];
    ML.say(`I guessed ${BOTS[state.bot].name} would play <b>${MOVES[l.guess]}</b>, so I played <b>${MOVES[l.robo]}</b>. It played ${MOVES[l.kid]}. ${l.res < 0 ? "I win!" : l.res > 0 ? "It wins." : "Tie."}`);
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    poke();
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
    state.nextAt = 0;
  }));
  ML.bindRange("#mem", (v) => v.toFixed(2), (v) => {
    state.robo.memory = v;
    if (performance.now() - state.lastAct < 60000 && document.readyState === "complete") ML.say(v < 0.8 ? `Short memory: I'll notice new habits fast, but one surprise move can fool me.` : v > 0.95 ? `Long memory: I'm steady, but I'll be slow to notice if a habit changes.` : `Medium memory: old rounds fade gently.`);
  });
  $("#mem").addEventListener("input", poke);

  $("#reset").addEventListener("click", () => {
    poke();
    state.robo = new Robo({ memory: +$("#mem").value });
    state.commit = state.robo.decide();
    Object.assign(state, { log: [], roboRate: [], youRate: [], markers: [], anim: null, last: null, viewing: null, adapt: null, diceRounds: 0, playing: false });
    if (state.test) { state.test = null; $("#peek").disabled = false; $("#peek-lbl").classList.remove("locked"); $("#go-hard").disabled = false; $("#p-hard").textContent = ""; }
    syncPlay();
    ckpts.clear();
    state.dirty = state.chartDirty = true;
    ML.say(`My memory is wiped. Every move looks equally likely to me again.`);
  });

  $("#go-cycler").addEventListener("click", () => {
    poke();
    if (state.mode !== "bot") { state.bot = "cycler"; setBot("cycler"); setMode("bot"); } else setBot("cycler");
    state.playing = true; state.nextAt = 0; syncPlay();
    if (!state.log.length || state.markers.length === 0) addMarker("Cycler joins");
  });
  $("#go-hard").addEventListener("click", startTest);
  $("#go-dice").addEventListener("click", () => {
    poke();
    if (state.mode !== "bot") { state.bot = "dice"; setBot("dice"); setMode("bot"); } else setBot("dice");
    if (state.diceRounds >= 60 && !state.done.dice) state.diceRounds = 0;
    state.playing = true; state.nextAt = 0; syncPlay();
  });
  document.querySelectorAll("#quiz button").forEach((b) => b.addEventListener("click", () => {
    poke();
    if (state.diceRounds < 60 && !state.done.dice) return;
    if (b.dataset.a === "right") {
      $("#quiz").classList.add("hidden");
      markDone("dice", "Exactly! A truly random player has no pattern, so no spotter can do better than lucky guessing.", "open the \"After 1 move\" table: every row stays about 33 / 33 / 33. Mathematicians call random play the unbeatable strategy for this game.");
    } else {
      b.classList.add("wrong");
      ML.say(b.dataset.a === "broken" ? `My brain works fine: it crushed the patterned players! Look at my pattern tables against Truly random. Do any moves stand out?` :
        `Nobody can see inside my box: it's locked before they choose. Hint: look at the "After 1 move" table. Is any move more likely?`);
    }
  }));

  // nudge after ~15 s idle, pointing at the next step
  function nextStep() {
    const yours = state.log.filter((r) => r.who === "you").length;
    if (state.viewing) return `Tap <b>Back to live</b> in the checkpoints row to play again.`;
    if (state.mode === "bot" && !state.playing) return `Press <b>Play</b> to let ${BOTS[state.bot].name} play me, or <b>1 round</b> to go step by step.`;
    if (state.mode === "you" && yours < 5) return `Your turn! Press <b>R</b>, <b>P</b> or <b>S</b> (or the big buttons). I've already locked in my move.`;
    if (!state.done.teach) return `Try challenge 1: play <b>rock every time</b> and watch my line on the chart climb.`;
    if (!state.peekTried) return `Tick <b>Peek at Robo's guess</b> to see what I'm thinking before you choose.`;
    if (!state.done.cycler) return `Try challenge 2: press <b>Send in the Cycler</b> and watch me crush it.`;
    if (!state.done.hard) return `Try challenge 3: <b>Start the 30-round test</b> and be as unpredictable as you can.`;
    if (!state.done.dice) return `Last challenge: <b>Send in Truly random</b>. Can I beat a dice?`;
    return `All challenges done! Try <b>X-ray the model</b>, or tap a checkpoint to meet a younger me.`;
  }
  setInterval(() => {
    const now = performance.now();
    if (now - state.lastAct > 15000 && !(state.mode === "bot" && state.playing)) { ML.say(nextStep()); state.lastAct = now; }
  }, 1000);

  document.addEventListener("themechange", () => { state.dirty = state.chartDirty = true; drawButtons(); ckpts.render(); });

  // ---------- loop ----------
  let lastPanel = 0;
  function frame(now) {
    requestAnimationFrame(frame); // schedule first so one bad frame can never stop the game
    if (state.mode === "bot" && state.playing && !state.viewing) {
      if (state.speed >= 60) { for (let i = 0; i < 20 && state.playing; i++) botRound(false, now); }
      else if (state.speed >= 10) { if (now >= state.nextAt) { botRound(false, now); state.nextAt = now + 100; } }
      else if (!state.anim && now >= state.nextAt) botRound(true, now);
    }
    if (state.dirty && now - lastPanel > 90) { renderStats(); renderInside(); renderTable(); state.dirty = false; lastPanel = now; }
    if (state.chartDirty) { drawChart(); state.chartDirty = false; }
    draw(now);
  }
  renderTabs();
  renderStats(); renderInside(); renderTable(); drawChart();
  ckpts.render();
  $("#p-teach").textContent = "Robo has won 0 of your last 0.";
  requestAnimationFrame(frame);

  // ---------- Model X-ray ----------
  let rNow = null;
  const moveIn = (name) => ({ name, min: 0, max: 2, step: 1, describe: (v) => MOVES[Math.round(v)] });
  const toHist = (x) => [
    { kid: Math.round(x[0]), robo: 0, res: 0 },
    { kid: Math.round(x[1]), robo: Math.round(x[2]), res: C.result(Math.round(x[1]), Math.round(x[2])) },
  ];
  ML.xray.register({
    title: "Robo's habit spotters",
    kind: "Mixture of n-gram experts",
    summary: () => `watched ${state.log.length} rounds`,
    size: () => `${state.robo.spotters.reduce((a, s) => a + s.table.size * 3, 0)} counts`,
    stats: () => [["Rounds", state.log.length], ["Robo wins (last 20)", state.log.length ? rateOf(state.log.slice(-20)) + "%" : "–"], ["Trusts most", state.robo.top().short]],
    inputs: [moveIn("Player's move before last"), moveIn("Player's last move"), moveIn("Robo's last move")],
    outputs: MOVES.map((m, i) => ({ name: "Player plays " + m, color: ML.cssVar(["--nn", "--sup", "--rl"][i]) })),
    predict: (x) => rNow.belief(toHist(x)).p,
    samples: () => { const h = state.robo.history, out = []; for (let k = 2; k < h.length; k++) out.push([h[k - 2].kid, h[k - 1].kid, h[k - 1].robo]); return out; },
    current: () => { const h = state.robo.history; return h.length >= 2 ? [h[h.length - 2].kid, h[h.length - 1].kid, h[h.length - 1].robo] : null; },
    brainHeight: 260,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), W = cv.width;
      const w = rNow.trust();
      c.font = "800 13px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--ink"); c.textAlign = "left";
      c.fillText("How much Robo trusts each spotter", 10, 18);
      rNow.spotters.forEach((s, i) => {
        const y = 34 + i * 42;
        c.fillStyle = ML.cssVar("--muted"); c.fillText(`${s.short} (right ${Math.round(s.hits.reduce((a, v) => a + v, 0))}/10)`, 10, y + 12);
        c.fillStyle = ML.cssVar("--accent"); c.fillRect(10, y + 18, w[i] * 300, 10);
      });
      const s = rNow.spotters[1], x0 = Math.max(470, W - 260), y0 = 50, sz = 56;
      c.fillStyle = ML.cssVar("--ink"); c.fillText("After this move (row), next move (column)", x0 - 90, 18);
      for (let r = 0; r < 3; r++) {
        const cnt = s.table.get(C.SHORT[r]) || [0, 0, 0], n = cnt[0] + cnt[1] + cnt[2] || 1;
        c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right"; c.fillText(MOVES[r], x0 - 8, y0 + r * sz + sz / 2 + 4); c.textAlign = "center";
        for (let k = 0; k < 3; k++) {
          c.fillStyle = ML.cssVar("--accent"); c.globalAlpha = 0.08 + 0.92 * (cnt[k] / n);
          c.fillRect(x0 + k * sz + 1, y0 + r * sz + 1, sz - 2, sz - 2); c.globalAlpha = 1;
          if (r === 0) { c.fillStyle = ML.cssVar("--muted"); c.fillText(MOVES[k], x0 + k * sz + sz / 2, y0 - 6); }
        }
      }
      c.textAlign = "left";
    },
    brainCaption: "Left: Robo mixes five spotters and trusts the ones that were right lately. Right: the 'After 1 move' table. Darker = that move often comes next. That's a habit, written down!",
    notes: ["Robo can only win by spotting patterns. Against truly random play every row of every table is about 33 / 33 / 33, so no guess beats lucky guessing."],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { rNow = state.robo.clone(); _xo(); };
  ML.xray.button($("#play").parentElement);
})();
