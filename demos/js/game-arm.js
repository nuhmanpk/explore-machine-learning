// Robo Arm — page: drawing (with bulging muscles), the round-by-round evolution loop, challenges,
// checkpoints and "you drive the arm" mode.
(function () {
  const { Net, nextGeneration } = window.GameNet;
  const A = window.ArmCore;
  const { W, H, GROUND, BASE, L1, L2, CUBE, STEPS, PAD_W } = A;
  const POP = 60;

  const arena = ML.setupCanvas(document.getElementById("arena"), W, H);
  const chartCv = ML.setupCanvas(document.getElementById("chart"), 640, 180);
  const ctx = arena.ctx;

  const state = {
    brains: Array.from({ length: POP }, () => A.newBrain()),
    rules: { ...A.DEFAULT_RULES },
    round: 1, speed: 3, playing: false, mutation: 0.3,
    world: null, phase: "show", extra: null,
    reach: [], grasp: [], deliv: [], score: [], markers: [], pending: [],
    best: null, replay: null, human: null, assist: true, celebrated: false, showBabies: true,
  };
  const seedFor = (round, k) => 7 + round * 3 + k;
  const secs = (steps) => (steps / 60).toFixed(1);

  function newRound() {
    state.world = new A.World(state.brains, state.rules, seedFor(state.round, 0));
    state.phase = "show";
    state.extra = null;
  }

  // ---------- evolution ----------
  function finishRound() {
    const shown = state.world, extra = state.extra;
    const fit = shown.arms.map((a, i) => shown.fitness(a) + extra.fitness(extra.arms[i]));
    const order = fit.map((_, i) => i).sort((a, b) => fit[b] - fit[a]);
    const top = order.slice(0, POP / 2);
    const mean = (f) => top.reduce((s, i) => s + f(shown.arms[i]) + f(extra.arms[i]), 0) / top.length / 2;
    const reach = mean((a) => Math.max(0, a.reach)) * 100;
    const grasp = mean((a) => (a.grasped ? 1 : 0)) * 100;
    const deliv = mean((a) => (a.delivered ? 1 : 0)) * 100;
    const score = top.reduce((s, i) => s + fit[i], 0) / top.length / 2;
    state.reach.push(Math.round(reach)); state.grasp.push(Math.round(grasp)); state.deliv.push(Math.round(deliv)); state.score.push(score);
    state.best = state.brains[order[0]].clone();
    const lead = shown.arms[order[0]];
    ckpts.add({
      label: `Round ${state.round}`,
      sub: lead.delivered ? `Delivered in ${secs(lead.deliveredAt)} s` : lead.grasped ? "Picked it up, dropped it" : "Didn't pick it up",
      brain: state.best.clone(),
      draw: (cv) => drawNet(cv, state.best),
    });
    narrateRound(reach, grasp, deliv);
    checkAdapt();
    drawChart();
    state.brains = nextGeneration(state.brains, fit, { mutation: state.mutation });
    state.round++;
    newRound();
  }

  function narrateRound(reach, grasp, deliv) {
    const n = state.deliv.length;
    if (!state.celebrated && n >= 3 && state.deliv.slice(-3).every((v) => v >= 40)) {
      state.celebrated = true;
      ML.confetti();
      ML.say(`They can do it! <b>${Math.round(deliv)}%</b> of the best arms now pick up the cube and drop it on the pad, after just <b>${n}</b> rounds. Nobody wrote a "move your elbow" rule!`);
      return;
    }
    if (state.pending.length && state.speed !== 0) return;
    if (n === 1) ML.say(`Round 1 done. Random muscles: the best half got <b>${Math.round(reach)}%</b> of the way to the cube and <b>${Math.round(grasp)}%</b> picked it up. Their babies try next.`);
    else if (state.speed !== 0 && n % 4 === 0) {
      const hint = grasp < 10 ? "Reaching the cube is learned first. Gripping it is hard!" : deliv < 10 ? "They can grab it! Carrying it to B without dropping it is next." : "Pick, carry, drop. Nice!";
      ML.say(`Round ${n}: the best half got <b>${Math.round(reach)}%</b> of the way, <b>${Math.round(grasp)}%</b> picked it up, <b>${Math.round(deliv)}%</b> delivered. ${hint}`);
    }
  }

  function checkAdapt() {
    const last3 = state.score.slice(-3);
    const now = last3.reduce((a, v) => a + v, 0) / last3.length;
    for (const p of state.pending.slice()) {
      p.low = Math.min(p.low, now);
      p.rounds++;
      if (p.rounds === 2 && now < p.before * 0.85)
        ML.say(`Ouch, ${p.label.toLowerCase()}! The score dropped from ${p.before.toFixed(0)} to ${now.toFixed(0)}. The old tricks don't work any more…`);
      const back = p.rounds >= 4 && (now >= p.before * 0.75 || (p.low < p.before * 0.85 && now >= p.low * 1.4));
      if (back) {
        state.pending.splice(state.pending.indexOf(p), 1);
        if (p.low >= p.before * 0.85) ML.say(`${p.label} didn't slow the arms down much. Their tricks still work!`);
        else { ML.confetti(40); ML.say(`They adapted to <b>${p.label.toLowerCase()}</b>! Score back to ${now.toFixed(0)} after ${p.rounds} rounds. Nobody re-programmed them.`); }
      } else if (p.rounds >= 40) {
        state.pending.splice(state.pending.indexOf(p), 1);
        ML.say(`${p.label} is really tough: the arms improved a bit, but delivering is simply harder now.`);
      }
    }
  }

  // ---------- drawing: the lab ----------
  function drawRoom(w, t) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, "#e9eefb"); g.addColorStop(1, "#cfd8ee");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // window + wall panels
    ctx.fillStyle = "rgba(255,255,255,.55)";
    for (let x = 40; x < W; x += 150) { ctx.beginPath(); ctx.roundRect(x, 30, 90, 70, 8); ctx.fill(); }
    ctx.strokeStyle = "rgba(120,130,170,.35)"; ctx.lineWidth = 2;
    for (let x = 40; x < W; x += 150) { ctx.strokeRect(x + 2, 32, 86, 66); ctx.beginPath(); ctx.moveTo(x + 45, 32); ctx.lineTo(x + 45, 98); ctx.stroke(); }
    // table
    ctx.fillStyle = "#8d6b4a"; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "#a98458"; ctx.fillRect(0, GROUND, W, 7);
    // pedestal
    ctx.fillStyle = "#5a6280"; ctx.beginPath(); ctx.roundRect(BASE.x - 26, BASE.y + 8, 52, GROUND - BASE.y - 8, 6); ctx.fill();
    ctx.fillStyle = "#3a4060"; ctx.fillRect(BASE.x - 36, GROUND - 8, 72, 8);
    // spot A
    ctx.strokeStyle = "#ff8a3d"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t / 90;
    ctx.beginPath(); ctx.roundRect(w.ax - 20, GROUND - 26, 40, 26, 5); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#ff8a3d"; ctx.font = "900 15px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("A", w.ax, GROUND + 22);
    // pad B
    const bx = w.padX(), pw = w.padW;
    ctx.fillStyle = "rgba(47,191,98,.3)"; ctx.fillRect(bx - pw / 2, GROUND - 5, pw, 7);
    ctx.strokeStyle = "#2fbf62"; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t / 90;
    ctx.beginPath(); ctx.roundRect(bx - pw / 2, GROUND - 30, pw, 30, 5); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#2fbf62"; ctx.fillText("B", bx, GROUND + 22);
  }

  function drawCube(c, alpha, heavy) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = heavy ? "#8a6a4a" : "#ff8a3d"; ctx.strokeStyle = "rgba(31,33,64,.7)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(c.x - CUBE / 2, c.y - CUBE / 2, CUBE, CUBE, 3); ctx.fill(); ctx.stroke();
    if (heavy) { ctx.fillStyle = "#fff"; ctx.font = "800 8px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText("KG", c.x, c.y + 3); }
    ctx.restore();
  }

  // a muscle is a lens-shaped bundle along a link; it bulges and goes redder when squeezed
  function muscle(x0, y0, ang, len, side, act, alpha) {
    const nx = -Math.sin(ang) * side, ny = Math.cos(ang) * side;
    const ox = nx * 8, oy = ny * 8;
    const ax = x0 + Math.cos(ang) * len * 0.12 + ox, ay = y0 + Math.sin(ang) * len * 0.12 + oy;
    const bx = x0 + Math.cos(ang) * len * 0.62 + ox, by = y0 + Math.sin(ang) * len * 0.62 + oy;
    const bulge = 1.5 + 8.5 * act, mx = (ax + bx) / 2 + nx * bulge, my = (ay + by) / 2 + ny * bulge;
    const mx2 = (ax + bx) / 2 - nx * bulge * 0.3, my2 = (ay + by) / 2 - ny * bulge * 0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${Math.round(8 + (1 - act) * 18)} ${60 + act * 25}% ${64 - act * 14}%)`;
    ctx.strokeStyle = "rgba(80,20,20,.55)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.quadraticCurveTo(mx2, my2, ax, ay); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawArm(a, lead, color, alpha, t) {
    const tip = a.tip, th1 = a.th1, th12 = a.th1 + a.th2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (!lead) { // ghosts are just lines
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(BASE.x, BASE.y); ctx.lineTo(tip.ex, tip.ey); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.restore();
      return;
    }
    // muscles first (behind the bones). lift muscle on top side of the link, lower muscle underneath
    muscle(BASE.x, BASE.y, th1, L1, -1, a.act[0], 1); muscle(BASE.x, BASE.y, th1, L1, 1, a.act[1], 1);
    muscle(tip.ex, tip.ey, th12, L2, -1, a.act[2], 1); muscle(tip.ex, tip.ey, th12, L2, 1, a.act[3], 1);
    // bones
    ctx.strokeStyle = "#2a2d44"; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(BASE.x, BASE.y); ctx.lineTo(tip.ex, tip.ey); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(BASE.x, BASE.y); ctx.lineTo(tip.ex, tip.ey); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    // joints
    for (const [x, y] of [[BASE.x, BASE.y], [tip.ex, tip.ey]]) {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#2a2d44"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); ctx.stroke();
    }
    // claw: two fingers that close as the grip rises
    ctx.save();
    ctx.translate(tip.x, tip.y); ctx.rotate(th12);
    const open = 11 - 8 * a.grip;
    ctx.strokeStyle = "#2a2d44"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -open); ctx.lineTo(9, -open); ctx.lineTo(13, -open * 0.35); ctx.moveTo(0, open); ctx.lineTo(9, open); ctx.lineTo(13, open * 0.35); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
    // crown on the AI leader
    if (!a.human) {
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#c98f00"; ctx.lineWidth = 1.5;
      const cx = BASE.x, cy = BASE.y - 18;
      ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx - 8, cy - 8); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx, cy - 10); ctx.lineTo(cx + 4, cy - 4); ctx.lineTo(cx + 8, cy - 8); ctx.lineTo(cx + 8, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorld(w, t, label, opts = {}) {
    drawRoom(w, t);
    const lead = opts.lead || w.leader();
    const ghosts = state.showBabies && !opts.human;
    if (ghosts) for (const a of w.arms) if (a !== lead) drawArm(a, false, "#5b8cff", 0.18, t);
    for (const a of (opts.human ? [lead] : [lead])) drawCube(a.cube, 1, w.rules.heavy);
    if (lead) drawArm(lead, true, opts.human ? "#2fbf62" : "#ff5c9a", 1, t);
    if (lead && lead.delivered) { ctx.fillStyle = "#2fbf62"; ctx.font = "900 22px Fredoka, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Delivered!", w.padX(), GROUND - 50); }
    if (lead && lead.missed) { ctx.fillStyle = "#ff4d5e"; ctx.font = "900 20px Fredoka, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Missed the pad", w.padX(), GROUND - 50); }
    if (label) {
      ctx.font = "800 13px Nunito, sans-serif";
      const tw = ctx.measureText(label).width + 28;
      ctx.fillStyle = "rgba(31,33,64,.72)";
      ctx.beginPath(); ctx.roundRect(10, 10, Math.min(W - 20, tw), 28, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      ctx.fillText(label, 22, 29);
    }
  }

  function drawChart() {
    GameLab.drawChart(chartCv, [
      { values: state.reach, color: "--lang" },
      { values: state.grasp, color: "--vision" },
      { values: state.deliv, color: "--accent" },
    ], state.markers, 100);
  }

  function drawNet(cv, net) {
    const c = cv.getContext("2d");
    const Wc = cv.width, Hc = cv.height;
    c.clearRect(0, 0, Wc, Hc);
    const L = net.sizes.length;
    const pos = net.sizes.map((n, l) => Array.from({ length: n }, (_, i) => [12 + ((Wc - 24) * l) / (L - 1), n === 1 ? Hc / 2 : 10 + ((Hc - 20) * i) / (n - 1)]));
    for (let l = 0; l < L - 1; l++)
      for (let i = 0; i < net.sizes[l]; i++)
        for (let j = 0; j < net.sizes[l + 1]; j++) {
          const w = net.weight(l, i, j);
          c.strokeStyle = w > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
          c.globalAlpha = Math.min(0.9, 0.08 + Math.abs(w) * 0.35);
          c.lineWidth = Math.min(3, 0.4 + Math.abs(w));
          c.beginPath(); c.moveTo(...pos[l][i]); c.lineTo(...pos[l + 1][j]); c.stroke();
        }
    c.globalAlpha = 1;
    pos.forEach((layer) => layer.forEach(([x, y]) => { c.fillStyle = ML.cssVar("--ink"); c.beginPath(); c.arc(x, y, Math.max(2, Hc / 70), 0, 7); c.fill(); }));
  }

  // ---------- "what's happening inside" ----------
  const pct = (v) => Math.round(v * 100) + "%";
  let insideTick = 0;
  function renderInside(w, a) {
    if (++insideTick % 10) return;
    const host = document.getElementById("inside");
    if (!a) return;
    if (state.human) {
      host.innerHTML = `<div>You are the brain! A robot arm only feels 10 numbers: its two joint angles and speeds, where its goal is, whether it holds the cube, how closed the claw is, and its height. It has to squeeze four muscles and the claw by itself.</div>`;
      return;
    }
    const stage = a.delivered ? "Done! The cube is on the pad." : a.missed ? "Dropped it in the wrong place." : a.holding ? "Carrying the cube to B" : a.grasped ? "Dropped it on the way" : a.grip > 0.5 ? "Gripping…" : "Reaching for the cube at A";
    const g = w.goal(a);
    const dx = g.x - a.tip.x, dy = g.y - a.tip.y;
    const dir = `${Math.abs(dy) < 18 ? "" : dy < 0 ? "up" : "down"}${Math.abs(dx) < 18 || Math.abs(dy) < 18 ? "" : "-"}${Math.abs(dx) < 18 ? "" : dx > 0 ? "right" : "left"}` || "right here";
    host.innerHTML = `<div>${ML.icon("eye")} Goal is <b>${dir}</b> of the claw. ${a.holding ? "Holding the cube." : "Claw is empty."}</div>
      <div>${ML.icon("flag")} <b>${stage}</b></div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("network")} 12 thinking neurons mix it all up</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("zap")} Shoulder: lift <b>${pct(a.act[0])}</b> · lower <b>${pct(a.act[1])}</b><br>Elbow: lift <b>${pct(a.act[2])}</b> · lower <b>${pct(a.act[3])}</b><br>Claw: <b>${a.cmd[4] > 0 ? "squeezing" : "open"}</b></div>`;
  }

  function renderStats(w) {
    document.getElementById("st-round").textContent = state.round;
    document.getElementById("st-alive").textContent = w.arms.filter((a) => !a.finished).length;
    document.getElementById("st-got").textContent = w.arms.filter((a) => a.grasped).length;
    const last = state.deliv.length ? state.deliv[state.deliv.length - 1] : null;
    document.getElementById("st-top").innerHTML = last === null ? "–" : `${last}<small>%</small>`;
  }

  // ---------- main tick ----------
  function stepTraining() {
    const t0 = performance.now();
    const budget = 9;
    if (state.phase === "show") {
      const w = state.world;
      if (state.speed === 0) {
        while (!w.done && performance.now() - t0 < budget) for (let i = 0; i < 20 && !w.done; i++) w.step();
      } else {
        for (let i = 0, n = ML.ticks(state.speed); i < n && !w.done; i++) w.step();
      }
      if (w.done) { state.phase = "score"; state.extra = new A.World(state.brains, state.rules, seedFor(state.round, 1)); }
    }
    if (state.phase === "score") {
      const e = state.extra;
      while (!e.done && performance.now() - t0 < budget) for (let i = 0; i < 20 && !e.done; i++) e.step();
      if (e.done) finishRound();
    }
  }

  const keys = { left: false, right: false, up: false, down: false };
  function frame(t) {
    if (state.human) {
      const h = state.human;
      if (!h.world.done) h.world.step(keys, state.assist);
      const a = h.world.arms[0];
      if (a.delivered && !h.said) { h.said = "ok"; ML.confetti(50); ML.say(`Delivered in ${secs(a.deliveredAt)} s! The arm robots need to learn the same trick with only muscle squeezes. Press <b>Stop</b> to watch them.`); }
      if (a.missed && !h.said) { h.said = "miss"; ML.say("The cube missed the pad. Press the claw button to try again."); }
      if ((h.world.done || a.finished) && keys.reset) startHuman();
      drawWorld(h.world, t, `You: ${secs(h.world.steps)} s${a.holding ? " · holding the cube" : ""}`, { lead: a, human: true });
      renderInside(h.world, a);
    } else if (state.replay) {
      const r = state.replay;
      for (let i = 0; i < Math.max(1, Math.min(state.speed || 3, 3)); i++) r.world.step();
      const a = r.world.arms[0];
      if ((r.world.done || a.finished) && !r.said) {
        r.said = true;
        ML.say(a.delivered ? `${r.ck.label}'s champion delivered the cube in <b>${secs(a.deliveredAt)} s</b>.` : `${r.ck.label}'s champion didn't manage a delivery this time.`);
        setTimeout(() => { if (state.replay === r) startReplay(r.ck); }, 1600);
      }
      drawWorld(r.world, t, `Replaying ${r.ck.label}'s champion`);
      renderInside(r.world, a);
    } else {
      if (state.playing) stepTraining();
      const w = state.world;
      const label = state.phase === "score" ? `Round ${state.round}: scoring a second table…` : `Round ${state.round} · ${((STEPS - w.steps) / 60).toFixed(0)} s left`;
      drawWorld(w, t, label);
      renderInside(w, w.leader());
      renderStats(w);
    }
    requestAnimationFrame(frame);
  }

  // ---------- replay + you-drive ----------
  const ckpts = new GameLab.Checkpoints(document.getElementById("ckpts"), (ck) => startReplay(ck), () => { state.replay = null; });
  ckpts.render();
  function startReplay(ck) {
    state.playing = false;
    syncPlay();
    state.replay = { ck, world: new A.World([ck.brain], state.rules, Math.floor(Math.random() * 1e6)) };
  }
  function startHuman() {
    const w = new A.World([A.newBrain()], state.rules, Math.floor(Math.random() * 1e6));
    w.arms[0].human = true;
    state.human = { world: w, said: "" };
  }
  const driveBtn = document.getElementById("drive");
  driveBtn.addEventListener("click", () => {
    if (state.human) {
      state.human = null;
      document.getElementById("pad").classList.remove("show");
      driveBtn.innerHTML = `${ML.icon("gamepad")} I'll control the arm`;
      ML.say("Back to the robot arms! Press <b>Play</b> to keep them learning.");
      return;
    }
    state.playing = false; state.replay = null; syncPlay();
    startHuman();
    document.getElementById("pad").classList.add("show");
    driveBtn.innerHTML = `${ML.icon("x")} Stop`;
    document.querySelector(".stage.three .canvas-box").scrollIntoView({ behavior: "smooth", block: "center" });
    ML.say("Your turn! ↑ ↓ work the shoulder muscles, ← → the elbow, <b>Space</b> squeezes the claw. Pick up the orange cube at A and let go over the green pad B.");
  });
  document.getElementById("assist").addEventListener("change", (e) => {
    state.assist = e.target.checked;
    if (state.human) ML.say(state.assist ? "Gravity helper on: the arm floats where you leave it." : "Helper off: now your muscles must also hold the arm up against gravity. That is part of what the robot brain has to learn!");
  });
  const keyMap = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down" };
  function toggleClaw() { if (state.human) { const a = state.human.world.arms[0]; a.humanGrip = !a.humanGrip; if (a.finished && state.human.world.done) startHuman(); } }
  document.addEventListener("keydown", (e) => {
    if (!state.human) return;
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) toggleClaw(); return; }
    if (keyMap[e.code]) { e.preventDefault(); keys[keyMap[e.code]] = true; }
  });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });
  document.querySelectorAll("#pad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    if (k === "claw") { b.addEventListener("click", toggleClaw); return; }
    const on = (e) => { e.preventDefault(); keys[k] = true; b.classList.add("pressed"); };
    const off = () => { keys[k] = false; b.classList.remove("pressed"); };
    b.addEventListener("pointerdown", on);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, off));
  });

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    if (state.human) driveBtn.click();
    state.replay = null; ckpts.active = null; ckpts.render();
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.round === 1 && state.world.steps === 0)
      ML.say("Off they go! The pink arm with the crown is doing best right now. See its <b>red muscles</b> bulge when it squeezes them.");
  });
  document.getElementById("skip").addEventListener("click", () => {
    if (state.human || state.replay) return;
    const w = state.world;
    while (!w.done) w.step();
    state.phase = "score";
    state.extra = new A.World(state.brains, state.rules, seedFor(state.round, 1));
    while (!state.extra.done) state.extra.step();
    finishRound();
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.brains = Array.from({ length: POP }, () => A.newBrain());
    state.round = 1;
    state.reach = []; state.grasp = []; state.deliv = []; state.score = []; state.markers = []; state.pending = [];
    state.best = null; state.celebrated = false;
    ckpts.clear(); newRound(); drawChart();
    ML.say("Brand-new random muscles. Everything they learned is gone!");
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
    if (state.speed === 0) ML.say("Turbo! Rounds fly by. Watch the lines on the chart climb.");
  }));
  document.querySelectorAll("#babies button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#babies button").forEach((x) => x.classList.toggle("on", x === b));
    state.showBabies = b.dataset.v === "1";
  }));
  ML.bindRange("#mut", (v) => v.toFixed(2), (v) => (state.mutation = v));

  const LABELS = { heavy: "Heavy cube", tired: "Tired muscles", shaky: "Shaky nerves", small: "Tiny pad", moving: "Sliding pad" };
  const TELLS = {
    heavy: "The cube weighs a lot, so the muscles must work harder to lift it.",
    tired: "Muscles are only 60% as strong. The arm has to move smarter.",
    shaky: "Nerve signals are noisy, so every squeeze wobbles.",
    small: "The pad is much smaller. Drop it precisely!",
    moving: "Pad B keeps sliding left and right. Aim where it will be!",
  };
  document.querySelectorAll("#chal [data-c]").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    state.rules[c] = !state.rules[c];
    b.classList.toggle("on", state.rules[c]);
    const on = state.rules[c];
    state.markers.push({ at: state.deliv.length, label: `${LABELS[c]} ${on ? "on" : "off"}` });
    drawChart();
    if (state.human) { startHuman(); return; }
    if (on) {
      const before = state.score.slice(-3);
      if (before.length) state.pending.push({ c, label: LABELS[c], before: before.reduce((a, v) => a + v, 0) / before.length, low: Infinity, rounds: 0 });
      ML.say(`<b>${LABELS[c]}</b> starts next round! ${TELLS[c]} ${before.length ? "Let's see if the arms can adapt." : "Turn it on after a few rounds to see the drop and recovery."}`);
    } else ML.say(`${LABELS[c]} switched off.`);
  }));

  newRound();
  drawChart();
  syncPlay();
  requestAnimationFrame(frame);
  AliveChip.init({ label: "Still working", count: () => (state.human || state.replay || !state.world ? null : [state.world.arms.filter((a) => !a.finished).length, state.world.arms.length]) });
})();
