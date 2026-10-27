// Auto-Parking — page: drawing, the round-by-round evolution loop, challenges,
// checkpoints and "you drive" mode.
(function () {
  const { Net, nextGeneration } = window.GameNet;
  const P = window.ParkingCore;
  const { W, H, WALL_Y, BAY_D, CAR_L, CAR_W, STEPS, RAY_ANGLES, RANGE } = P;
  const POP = 60;

  const arena = ML.setupCanvas(document.getElementById("arena"), W, H);
  const chartCv = ML.setupCanvas(document.getElementById("chart"), 640, 180);
  const ctx = arena.ctx;

  const state = {
    brains: Array.from({ length: POP }, () => P.newBrain()),
    rules: { ...P.DEFAULT_RULES },
    round: 1, speed: 3, playing: false, mutation: 0.3,
    world: null, phase: "show", extra: null,
    near: [], parked: [], score: [], markers: [], pending: [],
    best: null, replay: null, human: null, celebrated: false, showBabies: true,
  };
  const seedFor = (round, k) => 11 + round * 3 + k;
  const secs = (steps) => (steps / 60).toFixed(1);

  function newRound() {
    state.world = new P.World(state.brains, state.rules, seedFor(state.round, 0));
    state.phase = "show";
    state.extra = null;
  }

  // ---------- evolution ----------
  const whyText = (w) => ({ wall: "hit the wall", car: "bumped a parked car", pillar: "hit a post" }[w] || "crashed");
  function finishRound() {
    const shown = state.world, extra = state.extra;
    const fit = shown.cars.map((c, i) => shown.fitness(c) + extra.fitness(extra.cars[i]));
    const order = fit.map((_, i) => i).sort((a, b) => fit[b] - fit[a]);
    const top = order.slice(0, POP / 2);
    const mean = (f) => top.reduce((a, i) => a + f(shown.cars[i]) + f(extra.cars[i]), 0) / top.length / 2;
    const near = mean((c) => Math.max(0, c.bestProg)) * 100;
    const parked = mean((c) => (c.parked ? 1 : 0)) * 100;
    const score = top.reduce((a, i) => a + fit[i], 0) / top.length / 2;
    state.near.push(Math.round(near)); state.parked.push(Math.round(parked)); state.score.push(score);
    state.best = state.brains[order[0]].clone();
    const lead = shown.cars[order[0]];
    ckpts.add({
      label: `Round ${state.round}`,
      sub: lead.parked ? `Parked in ${secs(lead.parkedAt)} s` : lead.alive ? "Not parked yet" : `Crashed (${whyText(lead.why)})`,
      brain: state.best.clone(),
      draw: (cv) => drawNet(cv, state.best),
    });
    narrateRound(near, parked);
    checkAdapt();
    drawChart();
    state.brains = nextGeneration(state.brains, fit, { mutation: state.mutation });
    state.round++;
    newRound();
  }

  function narrateRound(near, parked) {
    const n = state.parked.length;
    if (!state.celebrated && n >= 3 && state.parked.slice(-3).every((v) => v >= 50)) {
      state.celebrated = true;
      ML.confetti();
      ML.say(`They can park! <b>${Math.round(parked)}%</b> of the best drivers now slide into the bay and stop, after just <b>${n}</b> rounds. Nobody gave them a parking rule!`);
      return;
    }
    if (state.pending.length && state.speed !== 0) return;
    if (n === 1) ML.say(`Round 1 done. Random brains: the best half got <b>${Math.round(near)}%</b> of the way to the bay and <b>${Math.round(parked)}%</b> parked. Their babies try next.`);
    else if (state.speed !== 0 && n % 4 === 0) {
      const hint = parked < 8 ? "Stopping inside the lines is the hard part…" : parked < 40 ? "Some are parking now! They need to straighten up and stop." : "Parking like pros!";
      ML.say(`Round ${n}: the best half got <b>${Math.round(near)}%</b> of the way and <b>${Math.round(parked)}%</b> parked. ${hint}`);
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
        if (p.low >= p.before * 0.85) ML.say(`${p.label} didn't slow the drivers down much. Their tricks still work!`);
        else { ML.confetti(40); ML.say(`They adapted to <b>${p.label.toLowerCase()}</b>! Score back to ${now.toFixed(0)} after ${p.rounds} rounds. Nobody re-programmed them.`); }
      } else if (p.rounds >= 40) {
        state.pending.splice(state.pending.indexOf(p), 1);
        ML.say(`${p.label} is really tough: the drivers improved a bit, but parking is simply harder now.`);
      }
    }
  }

  // ---------- drawing ----------
  function drawLot(w, t) {
    ctx.fillStyle = "#7d8499"; ctx.fillRect(0, 0, W, H);
    // lane arrows + dashes
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3; ctx.setLineDash([24, 20]);
    ctx.beginPath(); ctx.moveTo(0, 215); ctx.lineTo(W, 215); ctx.stroke(); ctx.setLineDash([]);
    // wall + bay floor
    ctx.fillStyle = "#6a7088"; ctx.fillRect(0, 0, W, WALL_Y);
    ctx.fillStyle = "#e9edf5"; ctx.fillRect(0, WALL_Y - 6, W, 6);
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "left";
    ctx.fillText("PARKING", 10, 22);
    // bay lines across the whole row
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = -20; k <= 20; k++) {
      const x = w.tx + (k + 0.5) * w.pitch * 1 + (k === 0 ? 0 : 0);
      if (x > 4 && x < W - 4 && Math.abs(x - w.tx) > w.gap / 2 + 2) { ctx.moveTo(x, WALL_Y); ctx.lineTo(x, WALL_Y + BAY_D); }
    }
    ctx.stroke();
    // the target bay
    const s = w.slot;
    ctx.fillStyle = "rgba(47,191,98,.28)"; ctx.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    ctx.save();
    ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t / 80; ctx.strokeStyle = "#2fbf62"; ctx.lineWidth = 3;
    ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    ctx.restore();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "900 20px Nunito, sans-serif";
    ctx.fillText("P", w.tx, WALL_Y + BAY_D / 2 + 7);
  }
  function drawParkedCar(r) {
    ctx.save();
    ctx.translate((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    ctx.rotate(Math.PI / 2);
    const l = CAR_L, wd = r.x1 - r.x0;
    ctx.fillStyle = `hsl(${r.hue} 45% 62%)`; ctx.strokeStyle = "rgba(31,33,64,.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-l / 2, -wd / 2, l, wd, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(220,240,255,.8)";
    ctx.fillRect(-l / 2 + 8, -wd / 2 + 3, 7, wd - 6); ctx.fillRect(l / 2 - 11, -wd / 2 + 3, 5, wd - 6);
    ctx.restore();
  }
  function drawPillar(r) {
    ctx.fillStyle = "#b8bdcc"; ctx.strokeStyle = "#e8d44d"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#d44"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r.x0 + 3, r.y0 + 3); ctx.lineTo(r.x1 - 3, r.y1 - 3); ctx.moveTo(r.x1 - 3, r.y0 + 3); ctx.lineTo(r.x0 + 3, r.y1 - 3); ctx.stroke();
  }
  function drawCar(c, color, alpha, lead, t) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(c.x, c.y); ctx.rotate(c.th);
    const col = c.alive ? (c.parked ? "#2fbf62" : color) : "#8a90a6";
    ctx.fillStyle = col; ctx.strokeStyle = lead ? "#fff" : "rgba(255,255,255,.7)"; ctx.lineWidth = lead ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(-CAR_L / 2, -CAR_W / 2, CAR_L, CAR_W, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(220,240,255,.9)";
    ctx.fillRect(-4, -CAR_W / 2 + 3, 9, CAR_W - 6); // windscreen
    ctx.fillRect(-CAR_L / 2 + 5, -CAR_W / 2 + 3, 5, CAR_W - 6); // rear window
    ctx.fillStyle = c.thr < -0.1 && c.alive ? "#ff4d5e" : "#ffe48a"; // brake/reverse lights show on the back, headlights at the front
    ctx.fillRect(CAR_L / 2 - 3, -CAR_W / 2 + 2, 3, 4); ctx.fillRect(CAR_L / 2 - 3, CAR_W / 2 - 6, 3, 4);
    ctx.fillStyle = c.thr < -0.1 && c.alive ? "#fff" : "#c93a4a";
    ctx.fillRect(-CAR_L / 2, -CAR_W / 2 + 2, 2.5, 4); ctx.fillRect(-CAR_L / 2, CAR_W / 2 - 6, 2.5, 4);
    // front wheels turn with the steering
    if (lead && c.alive) {
      ctx.fillStyle = "#2a2d44";
      for (const sy of [-CAR_W / 2 - 1, CAR_W / 2 - 3]) { ctx.save(); ctx.translate(CAR_L / 2 - 8, sy + 2); ctx.rotate(c.steer * 0.55); ctx.fillRect(-4, -1.5, 8, 3); ctx.restore(); }
    }
    ctx.restore();
    if (lead && c.alive) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#c98f00"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-7, -17); ctx.lineTo(-7, -24); ctx.lineTo(-3, -20); ctx.lineTo(0, -26); ctx.lineTo(3, -20); ctx.lineTo(7, -24); ctx.lineTo(7, -17); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  function drawSensors(c) {
    if (!c || !c.rays || !c.alive) return;
    ctx.save();
    ctx.lineWidth = 1.5;
    RAY_ANGLES.forEach((a, i) => {
      const d = c.rays[i], k = d / RANGE;
      ctx.strokeStyle = `rgba(${Math.round(255 * (1 - k))},${Math.round(80 + 140 * k)},90,.85)`;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(c.th + a) * d, c.y + Math.sin(c.th + a) * d); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(c.x + Math.cos(c.th + a) * d, c.y + Math.sin(c.th + a) * d, 2.5, 0, 7); ctx.fill();
    });
    ctx.restore();
  }
  function drawWorld(w, t, label, opts = {}) {
    drawLot(w, t);
    for (const r of w.parked) drawParkedCar(r);
    for (const r of w.rects) if (r.pillar) drawPillar(r);
    if (w.mover) { // a shopper's car cruising down the lane
      const m = w.mover;
      drawCar({ x: m.x, y: m.y, th: m.th, alive: true, parked: false, thr: 0, steer: 0 }, "#ffb347", 1, false, t);
    }
    const lead = opts.lead || w.leader();
    if (lead && lead.trail.length > 1) { // where the leader has been
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
      ctx.beginPath(); lead.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    }
    const ghosts = state.showBabies && !opts.human;
    if (ghosts) for (const c of w.cars) if (c !== lead) drawCar(c, "#5b8cff", c.alive ? 0.35 : 0.18, false, t);
    if (lead) { drawSensors(lead); drawCar(lead, opts.human ? "#2fbf62" : "#ff5c9a", 1, true, t); }
    if (label) {
      ctx.font = "800 13px Nunito, sans-serif";
      const tw = ctx.measureText(label).width + 28;
      ctx.fillStyle = "rgba(31,33,64,.72)";
      ctx.beginPath(); ctx.roundRect(10, WALL_Y + BAY_D + 8, Math.min(W - 20, tw), 28, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      ctx.fillText(label, 22, WALL_Y + BAY_D + 27);
    }
  }

  function drawChart() {
    GameLab.drawChart(chartCv, [
      { values: state.near, color: "--lang" },
      { values: state.parked, color: "--accent" },
    ], state.markers, 100);
  }

  // Small drawing of a brain: inputs left, outputs right, blue/orange = push/hold back.
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
  function renderInside(w, c) {
    if (++insideTick % 10) return;
    const host = document.getElementById("inside");
    if (!c) return;
    if (state.human) {
      host.innerHTML = `<div>You are the brain! A robot driver gets only 13 numbers: where the bay is, which way it points, its speed, and six distance sensors. It has to work out steering and pedals by itself.</div>`;
      return;
    }
    const near = c.rays ? Math.min(...c.rays) : RANGE;
    const dx = w.target.x - c.x, dy = w.target.y - c.y;
    const where = Math.hypot(dx, dy) < 30 ? "<b>right here</b>" : `<b>${Math.abs(dy) > 25 ? (dy < 0 ? "up" : "down") : ""}${Math.abs(dx) > 25 && Math.abs(dy) > 25 ? "-" : ""}${Math.abs(dx) > 25 ? (dx > 0 ? "right" : "left") : ""}</b>`;
    const aim = c.aimErr < 0.3 ? "lined up with the bay" : "not lined up yet";
    const steer = c.steer > 0.25 ? "turning RIGHT" : c.steer < -0.25 ? "turning LEFT" : "wheels straight";
    const pedal = c.thr > 0.2 ? "forward" : c.thr < -0.2 ? "REVERSE" : "coasting";
    const dir = c.v > 0.05 ? "rolling forward" : c.v < -0.05 ? "rolling backward" : "stopped";
    host.innerHTML = `<div>${ML.icon("eye")} Bay is ${where}, car is ${aim}, ${dir}</div>
      <div>${ML.icon("gauge")} Nearest thing: <b>${near < 25 ? "very close!" : near < 60 ? "close" : "far away"}</b> (${Math.round(near)} px)${c.inside > 0.5 ? ", <b>mostly inside the bay</b>" : ""}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("network")} 12 thinking neurons mix it all up</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("car")} Pedal <b>${pedal}</b>, ${steer} → <b style="color:var(--accent)">${c.parked ? "parked!" : c.alive ? "still driving" : "crashed"}</b></div>`;
  }

  function renderStats(w) {
    document.getElementById("st-round").textContent = state.round;
    document.getElementById("st-alive").textContent = w.cars.filter((c) => c.alive && !c.parked).length;
    document.getElementById("st-parked").textContent = w.cars.filter((c) => c.parked).length;
    const last = state.parked.length ? state.parked[state.parked.length - 1] : null;
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
      if (w.done) { state.phase = "score"; state.extra = new P.World(state.brains, state.rules, seedFor(state.round, 1)); }
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
      if (!h.world.done) h.world.step(keys);
      const c = h.world.cars[0];
      if (c.parked && !h.said) { h.said = "parked"; ML.confetti(50); ML.say(`Parked in ${secs(c.parkedAt)} s! Nice. Can the robots match that? Press <b>Stop driving</b> to find out.`); }
      if (!c.alive && !h.dead) {
        h.dead = true; h.diedAt = performance.now();
        ML.say(`Crunch, you ${whyText(c.why)}! Press ↑ to try again.`);
      }
      if ((h.dead || h.world.done) && keys.up && performance.now() - h.diedAt > 600) startHuman();
      if (h.world.done && !h.dead && !c.parked && !h.said) { h.dead = true; h.diedAt = performance.now(); ML.say("Time's up! Press ↑ to try again."); }
      c.rays = h.world.readRays(c);
      drawWorld(h.world, t, `You: ${secs(h.world.steps)} s${c.inside > 0.9 ? " · in the bay!" : ""}`, { lead: c, human: true });
      renderInside(h.world, c);
    } else if (state.replay) {
      const r = state.replay;
      for (let i = 0; i < Math.max(1, Math.min(state.speed || 3, 3)); i++) r.world.step();
      const c = r.world.cars[0];
      if ((r.world.done || c.parked || !c.alive) && !r.said) {
        r.said = true;
        ML.say(c.parked ? `${r.ck.label}'s champion parked in <b>${secs(c.parkedAt)} s</b> in today's lot.` : `${r.ck.label}'s champion didn't manage to park in today's lot${c.alive ? "" : ` (${whyText(c.why)})`}.`);
        setTimeout(() => { if (state.replay === r) startReplay(r.ck); }, 1600);
      }
      drawWorld(r.world, t, `Replaying ${r.ck.label}'s champion`);
      renderInside(r.world, c);
    } else {
      if (state.playing) stepTraining();
      const w = state.world;
      const label = state.phase === "score" ? `Round ${state.round}: scoring a second lot…` : `Round ${state.round} · ${((STEPS - w.steps) / 60).toFixed(0)} s left`;
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
    state.replay = { ck, world: new P.World([ck.brain], state.rules, Math.floor(Math.random() * 1e6)) };
  }
  function startHuman() {
    const w = new P.World([P.newBrain()], state.rules, Math.floor(Math.random() * 1e6));
    w.cars[0].human = true;
    state.human = { world: w, said: "", dead: false, diedAt: 0 };
  }
  const driveBtn = document.getElementById("drive");
  driveBtn.addEventListener("click", () => {
    if (state.human) {
      state.human = null;
      document.getElementById("pad").classList.remove("show");
      driveBtn.innerHTML = `${ML.icon("gamepad")} I'll park a car`;
      ML.say("Back to the robot drivers! Press <b>Play</b> to keep them learning.");
      return;
    }
    state.playing = false;
    state.replay = null;
    syncPlay();
    startHuman();
    document.getElementById("pad").classList.add("show");
    driveBtn.innerHTML = `${ML.icon("x")} Stop driving`;
    document.querySelector(".stage.three .canvas-box").scrollIntoView({ behavior: "smooth", block: "center" });
    ML.say("Your turn! ↑ forward, ↓ reverse, ← → steer. Get all of the car inside the green bay and stop. No bumping!");
  });
  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
  document.addEventListener("keydown", (e) => { if (state.human && keyMap[e.code]) { e.preventDefault(); keys[keyMap[e.code]] = true; } });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });
  document.querySelectorAll("#pad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); keys[k] = true; b.classList.add("pressed"); };
    const off = () => { keys[k] = false; b.classList.remove("pressed"); };
    b.addEventListener("pointerdown", on);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, off));
  });

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() {
    playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
  }
  playBtn.addEventListener("click", () => {
    if (state.human) driveBtn.click();
    state.replay = null;
    ckpts.active = null;
    ckpts.render();
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.round === 1 && state.world.steps === 0)
      ML.say("Off they go! The pink car with the crown is doing best right now. Watch its colourful sensor beams: that is how it sees walls and cars.");
  });
  document.getElementById("skip").addEventListener("click", () => {
    if (state.human || state.replay) return;
    const w = state.world;
    while (!w.done) w.step();
    state.phase = "score";
    state.extra = new P.World(state.brains, state.rules, seedFor(state.round, 1));
    while (!state.extra.done) state.extra.step();
    finishRound();
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.brains = Array.from({ length: POP }, () => P.newBrain());
    state.round = 1;
    state.near = []; state.parked = []; state.score = []; state.markers = []; state.pending = [];
    state.best = null;
    state.celebrated = false;
    ckpts.clear();
    newRound();
    drawChart();
    ML.say("Brand-new random brains. Everything they learned is gone!");
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

  const LABELS = { neighbours: "Parked neighbours", tight: "Tight bay", pillars: "Concrete posts", random: "Random start", moving: "Moving car" };
  const TELLS = {
    neighbours: "Cars are parked on both sides of the bay. Bump one and you're out!",
    tight: "The bay is narrower. Just a few pixels to spare on each side.",
    pillars: "Concrete posts stand in the lane. Steer around them!",
    random: "Cars start anywhere in the lot, pointing any way.",
    moving: "A shopper's car is cruising up and down the lane. Don't hit it!",
  };
  document.querySelectorAll("#chal [data-c]").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    state.rules[c] = !state.rules[c];
    b.classList.toggle("on", state.rules[c]);
    const on = state.rules[c];
    state.markers.push({ at: state.parked.length, label: `${LABELS[c]} ${on ? "on" : "off"}` });
    drawChart();
    if (state.human) { startHuman(); return; }
    if (on) {
      const before = state.score.slice(-3);
      if (before.length) state.pending.push({ c, label: LABELS[c], before: before.reduce((a, v) => a + v, 0) / before.length, low: Infinity, rounds: 0 });
      ML.say(`<b>${LABELS[c]}</b> starts next round! ${TELLS[c]} ${before.length ? "Let's see if the drivers can adapt." : "Turn it on after a few rounds to see the drop and recovery."}`);
    } else ML.say(`${LABELS[c]} switched off.`);
  }));

  newRound();
  drawChart();
  syncPlay();
  requestAnimationFrame(frame);
  AliveChip.init({ label: "Still driving", count: () => (state.human || state.replay || !state.world ? null : [state.world.cars.filter((c) => c.alive && !c.parked).length, state.world.cars.length]) });
})();
