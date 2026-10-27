// Lane Keeper — page: a camera following the leader down a winding road, the round-by-round evolution loop,
// challenges, checkpoints and "you drive" mode.
(function () {
  const { Net, nextGeneration } = window.GameNet;
  const L = window.LaneCore;
  const { W, H, STEP, LENGTH, STEPS, CAR_L, CAR_W, LOOK, STEER_MAX } = L;
  const POP = 60;

  const arena = ML.setupCanvas(document.getElementById("arena"), W, H);
  const chartCv = ML.setupCanvas(document.getElementById("chart"), 640, 180);
  const ctx = arena.ctx;

  const state = {
    brains: Array.from({ length: POP }, () => L.newBrain()),
    rules: { ...L.DEFAULT_RULES },
    round: 1, speed: 3, playing: false, mutation: 0.3,
    world: null, phase: "show", extra: null,
    dist: [], fin: [], score: [], markers: [], pending: [],
    best: null, replay: null, human: null, celebrated: false, showBabies: true,
    cam: { x: 320, y: 360 },
  };
  const seedFor = (round, k) => 5 + round * 3 + k;
  const secs = (steps) => (steps / 60).toFixed(1);

  function newRound() {
    state.world = new L.World(state.brains, state.rules, seedFor(state.round, 0));
    state.phase = "show";
    state.extra = null;
    state.cam = { x: state.world.pts[0].x, y: state.world.pts[0].y };
  }

  // ---------- evolution ----------
  const whyText = (w) => ({ road: "left the road", cone: "hit a cone" }[w] || "crashed");
  function finishRound() {
    const shown = state.world, extra = state.extra;
    const fit = shown.cars.map((c, i) => shown.fitness(c) + extra.fitness(extra.cars[i]));
    const order = fit.map((_, i) => i).sort((a, b) => fit[b] - fit[a]);
    const top = order.slice(0, POP / 2);
    const mean = (f) => top.reduce((s, i) => s + f(shown.cars[i]) + f(extra.cars[i]), 0) / top.length / 2;
    const dist = mean((c) => c.best / LENGTH) * 100;
    const fin = mean((c) => (c.finished ? 1 : 0)) * 100;
    const score = top.reduce((s, i) => s + fit[i], 0) / top.length / 2;
    state.dist.push(Math.round(dist)); state.fin.push(Math.round(fin)); state.score.push(score);
    state.best = state.brains[order[0]].clone();
    const lead = shown.cars[order[0]];
    ckpts.add({
      label: `Round ${state.round}`,
      sub: lead.finished ? `Finished in ${secs(lead.t)} s` : `Went ${Math.round(lead.best / LENGTH * 100)}% (${whyText(lead.why)})`,
      brain: state.best.clone(),
      draw: (cv) => drawNet(cv, state.best),
    });
    narrateRound(dist, fin);
    checkAdapt();
    drawChart();
    state.brains = nextGeneration(state.brains, fit, { mutation: state.mutation });
    state.round++;
    newRound();
  }

  function narrateRound(dist, fin) {
    const n = state.fin.length;
    if (!state.celebrated && n >= 3 && state.fin.slice(-3).every((v) => v >= 60)) {
      state.celebrated = true;
      ML.confetti();
      ML.say(`They can drive! <b>${Math.round(fin)}%</b> of the best cars now follow the whole winding road without leaving the lane, after just <b>${n}</b> rounds. Nobody wrote "turn left when the road bends"!`);
      return;
    }
    if (state.pending.length && state.speed !== 0) return;
    if (n === 1) ML.say(`Round 1 done. Random brains: the best half got <b>${Math.round(dist)}%</b> of the way along the road before leaving it. Their babies try next.`);
    else if (state.speed !== 0 && n % 3 === 0) {
      const hint = fin < 10 ? "Staying in the lane through bends is the hard part…" : fin < 60 ? "Many make it through now! Others still drift out." : "Smooth driving!";
      ML.say(`Round ${n}: the best half drove <b>${Math.round(dist)}%</b> of the road, <b>${Math.round(fin)}%</b> finished. ${hint}`);
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
        ML.say(`${p.label} is really tough: the drivers improved a bit, but staying on the road is simply harder now.`);
      }
    }
  }

  // The camera follows the leader. Keep the same car until another is clearly ahead, so the view doesn't jump around.
  function stableLead(w) {
    const best = w.leader();
    const cur = w._lead;
    if (cur && w.cars.includes(cur) && (cur.alive || !best.alive) && best.best - cur.best < 60) return cur;
    w._lead = best;
    return best;
  }

  // ---------- drawing ----------
  function drawCar(c, color, alpha, lead) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(c.x, c.y); ctx.rotate(c.th);
    const col = c.alive ? (c.finished ? "#2fbf62" : color) : "#8a90a6";
    ctx.fillStyle = col; ctx.strokeStyle = lead ? "#fff" : "rgba(255,255,255,.7)"; ctx.lineWidth = lead ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(-CAR_L / 2, -CAR_W / 2, CAR_L, CAR_W, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(220,240,255,.9)";
    ctx.fillRect(-2, -CAR_W / 2 + 2.5, 7, CAR_W - 5); ctx.fillRect(-CAR_L / 2 + 3, -CAR_W / 2 + 2.5, 4, CAR_W - 5);
    ctx.fillStyle = "#ffe48a"; ctx.fillRect(CAR_L / 2 - 2, -CAR_W / 2 + 1.5, 2.5, 3); ctx.fillRect(CAR_L / 2 - 2, CAR_W / 2 - 4.5, 2.5, 3);
    if (lead && c.alive) { // front wheels turn with the steering
      ctx.fillStyle = "#2a2d44";
      for (const sy of [-CAR_W / 2 - 1, CAR_W / 2 - 2]) { ctx.save(); ctx.translate(CAR_L / 2 - 6, sy + 1.5); ctx.rotate(c.steer * STEER_MAX); ctx.fillRect(-4, -1.3, 8, 2.6); ctx.restore(); }
    }
    ctx.restore();
    if (lead && c.alive) {
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#c98f00"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-7, -14); ctx.lineTo(-7, -21); ctx.lineTo(-3, -17); ctx.lineTo(0, -23); ctx.lineTo(3, -17); ctx.lineTo(7, -21); ctx.lineTo(7, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  function drawRoad(w, focusI) {
    const i0 = 0, i1 = w.n - 1; // the whole road exists from the start, so every car is always on road
    const half = w.half;
    const edge = (i, side) => { const p = w.pts[i]; return [p.x - Math.sin(p.h) * half * side, p.y + Math.cos(p.h) * half * side]; };
    // grass shoulder, then asphalt
    for (const [wd, col] of [[half * 2 + 26, "#7bc88f"], [half * 2, "#6a7088"]]) {
      ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = "butt"; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) { const p = w.pts[i]; i === i0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
      ctx.stroke();
    }
    // edge lines
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) { const [x, y] = edge(i, side * 0.94); i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // dashed centre line
    ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2.5; ctx.setLineDash([14, 14]);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) { const p = w.pts[i]; i === i0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
    ctx.stroke(); ctx.setLineDash([]);
    // start and finish lines
    for (const [i, col] of [[1, "#fff"], [w.n - 2, "#2fbf62"]]) {
      if (i < i0 || i > i1) continue;
      const [ax, ay] = edge(i, -1), [bx, by] = edge(i, 1);
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    // cones
    for (const k of w.cones) {
      if (k.i < i0 || k.i > i1) continue;
      ctx.fillStyle = "#ff8a3d"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(k.x, k.y - 11); ctx.lineTo(k.x - 8, k.y + 8); ctx.lineTo(k.x + 8, k.y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(k.x - 4, k.y - 2, 8, 3);
    }
  }
  // a small map of the whole road in the corner: where everyone is, and how far there is to go
  function drawMini(w, lead) {
    if (!w.mini) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of w.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      const bw = 150, bh = 112, k = Math.min((bw - 14) / (x1 - x0 || 1), (bh - 14) / (y1 - y0 || 1));
      w.mini = { x0, y0, k, ox: 10 + ((bw - 14) - (x1 - x0) * k) / 2, oy: 10 + ((bh - 14) - (y1 - y0) * k) / 2, bw, bh };
    }
    const m = w.mini, bx = 10, by = H - m.bh - 10;
    const X = (x) => bx + m.ox + (x - m.x0) * m.k - 3, Y = (y) => by + m.oy + (y - m.y0) * m.k - 3;
    ctx.save();
    ctx.fillStyle = "rgba(31,33,64,.62)"; ctx.beginPath(); ctx.roundRect(bx, by, m.bw, m.bh, 10); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath(); for (let i = 0; i < w.n; i += 3) { const p = w.pts[i]; i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)); } ctx.stroke();
    const end = w.pts[w.n - 1];
    ctx.fillStyle = "#2fbf62"; ctx.beginPath(); ctx.arc(X(end.x), Y(end.y), 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(w.pts[0].x), Y(w.pts[0].y), 3, 0, 7); ctx.fill();
    for (const k of w.cones) { ctx.fillStyle = "#ff8a3d"; ctx.beginPath(); ctx.arc(X(k.x), Y(k.y), 1.8, 0, 7); ctx.fill(); }
    if (state.showBabies && !state.human) for (const c of w.cars) if (c !== lead && c.alive) { ctx.fillStyle = "rgba(120,160,255,.85)"; ctx.fillRect(X(c.x) - 1, Y(c.y) - 1, 2.5, 2.5); }
    if (lead) { ctx.fillStyle = "#ff5c9a"; ctx.beginPath(); ctx.arc(X(lead.x), Y(lead.y), 4, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.restore();
  }

  function drawWorld(w, t, label, opts = {}) {
    const lead = opts.lead || stableLead(w);
    // the camera glides after the leader
    if (lead) { const k = state.speed === 0 || state.speed >= 10 || state.human ? 1 : state.replay ? 0.2 : 0.12; state.cam.x += (lead.x - state.cam.x) * k; state.cam.y += (lead.y - state.cam.y) * k; } // at high speed the camera must keep up
    ctx.fillStyle = "#8fd09c"; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 - state.cam.x, H * 0.58 - state.cam.y);
    drawRoad(w, lead ? lead.i : 0);
    const ghosts = state.showBabies && !opts.human;
    if (ghosts) for (const c of w.cars) if (c !== lead) drawCar(c, "#5b8cff", c.alive ? 0.4 : 0.2, false);
    if (lead) {
      if (lead.alive) { // the three points on the road ahead that the brain can see
        ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.strokeStyle = "rgba(255,92,154,.9)"; ctx.lineWidth = 1.5;
        for (const d of LOOK) {
          const p = w.pts[Math.min(w.n - 1, lead.i + Math.round(d / STEP))];
          ctx.beginPath(); ctx.moveTo(lead.x, lead.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill(); ctx.stroke();
        }
      }
      drawCar(lead, opts.human ? "#2fbf62" : "#ff5c9a", 1, true);
    }
    ctx.restore();
    drawMini(w, lead);
    if (label) {
      ctx.font = "800 13px Nunito, sans-serif";
      const tw = ctx.measureText(label).width + 28;
      ctx.fillStyle = "rgba(31,33,64,.72)";
      ctx.beginPath(); ctx.roundRect(10, 10, Math.min(W - 20, tw), 28, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      ctx.fillText(label, 22, 29);
    }
    if (lead) { // progress strip
      const k = Math.min(1, lead.best / LENGTH);
      ctx.fillStyle = "rgba(31,33,64,.5)"; ctx.beginPath(); ctx.roundRect(W - 150, H - 24, 138, 10, 5); ctx.fill();
      ctx.fillStyle = "#ff5c9a"; ctx.beginPath(); ctx.roundRect(W - 150, H - 24, Math.max(10, 138 * k), 10, 5); ctx.fill();
    }
  }

  function drawChart() {
    GameLab.drawChart(chartCv, [
      { values: state.dist, color: "--lang" },
      { values: state.fin, color: "--accent" },
    ], state.markers, 100);
  }

  function drawNet(cv, net) {
    const c = cv.getContext("2d");
    const Wc = cv.width, Hc = cv.height;
    c.clearRect(0, 0, Wc, Hc);
    const n = net.sizes.length;
    const pos = net.sizes.map((k, l) => Array.from({ length: k }, (_, i) => [12 + ((Wc - 24) * l) / (n - 1), k === 1 ? Hc / 2 : 10 + ((Hc - 20) * i) / (k - 1)]));
    for (let l = 0; l < n - 1; l++)
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
  let insideTick = 0;
  function renderInside(w, c) {
    if (++insideTick % 10) return;
    const host = document.getElementById("inside");
    if (!c) return;
    if (state.human) {
      host.innerHTML = `<div>You are the brain! A robot driver only gets 9 numbers: how far off-centre it is, which way it points, its speed, where the road centre is at three points ahead, and the nearest cone. It has to steer and pick a speed by itself.</div>`;
      return;
    }
    const x = w.sense(c);
    const side = x[0] > 0.25 ? "right of centre" : x[0] < -0.25 ? "left of centre" : "near the centre";
    const bend = x[8] > 0.3 ? "the road bends <b>right</b>" : x[8] < -0.3 ? "the road bends <b>left</b>" : "the road is fairly <b>straight</b>";
    const steer = c.cmdSteer > 0.25 ? "steer RIGHT" : c.cmdSteer < -0.25 ? "steer LEFT" : "hold straight";
    const speed = c.v > w.vmax * 0.75 ? "fast" : c.v < w.vmax * 0.4 ? "slow" : "medium speed";
    host.innerHTML = `<div>${ML.icon("eye")} Car is <b>${side}</b>; ${bend}${x[7] < 0.99 ? "; <b>a cone is coming</b>" : ""}</div>
      <div>${ML.icon("gauge")} Going at <b>${speed}</b></div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("network")} 10 thinking neurons mix it all up</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("car")} Brain says: <b style="color:var(--accent)">${c.alive ? steer : "crashed (" + whyText(c.why) + ")"}</b></div>`;
  }

  function renderStats(w) {
    document.getElementById("st-round").textContent = state.round;
    document.getElementById("st-alive").textContent = w.cars.filter((c) => c.alive && !c.finished).length;
    const lead = stableLead(w);
    document.getElementById("st-far").innerHTML = lead ? `${Math.round(lead.best / LENGTH * 100)}<small>%</small>` : "–";
    const last = state.fin.length ? state.fin[state.fin.length - 1] : null;
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
      if (w.done) { state.phase = "score"; state.extra = new L.World(state.brains, state.rules, seedFor(state.round, 1)); }
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
      if (c.finished && !h.said) { h.said = "done"; ML.confetti(50); ML.say(`You drove the whole road in ${secs(c.t)} s! Can the robots match that? Press <b>Stop driving</b> to find out.`); }
      if (!c.alive && !h.dead) { h.dead = true; h.diedAt = performance.now(); ML.say(`You ${whyText(c.why)} after ${Math.round(c.best / LENGTH * 100)}% of the road! Press ↑ to try again.`); }
      if ((h.dead || h.world.done) && keys.up && performance.now() - h.diedAt > 600) startHuman();
      if (h.world.done && !h.dead && !c.finished) { h.dead = true; h.diedAt = performance.now(); }
      drawWorld(h.world, t, `You: ${Math.round(c.best / LENGTH * 100)}% of the road`, { lead: c, human: true });
      renderInside(h.world, c);
    } else if (state.replay) {
      const r = state.replay;
      for (let i = 0; i < Math.max(1, Math.min(state.speed || 3, 3)); i++) r.world.step();
      const c = r.world.cars[0];
      if ((r.world.done || c.finished || !c.alive) && !r.said) {
        r.said = true;
        ML.say(c.finished ? `${r.ck.label}'s champion drove the whole road in <b>${secs(c.t)} s</b>.` : `${r.ck.label}'s champion ${whyText(c.why)} after ${Math.round(c.best / LENGTH * 100)}% of today's road.`);
        setTimeout(() => { if (state.replay === r) startReplay(r.ck); }, 1600);
      }
      drawWorld(r.world, t, `Replaying ${r.ck.label}'s champion`);
      renderInside(r.world, c);
    } else {
      if (state.playing) stepTraining();
      const w = state.world;
      const label = state.phase === "score" ? `Round ${state.round}: scoring a second road…` : `Round ${state.round} · ${Math.max(0, (STEPS - w.steps) / 60).toFixed(0)} s left`;
      drawWorld(w, t, label);
      renderInside(w, stableLead(w));
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
    state.replay = { ck, world: new L.World([ck.brain], state.rules, Math.floor(Math.random() * 1e6)) };
    state.cam = { x: state.replay.world.pts[0].x, y: state.replay.world.pts[0].y };
  }
  function startHuman() {
    const w = new L.World([L.newBrain()], state.rules, Math.floor(Math.random() * 1e6));
    w.cars[0].human = true;
    state.human = { world: w, said: "", dead: false, diedAt: 0 };
    state.cam = { x: w.pts[0].x, y: w.pts[0].y };
  }
  const driveBtn = document.getElementById("drive");
  driveBtn.addEventListener("click", () => {
    if (state.human) {
      state.human = null;
      document.getElementById("pad").classList.remove("show");
      driveBtn.innerHTML = `${ML.icon("gamepad")} I'll drive`;
      ML.say("Back to the robot drivers! Press <b>Play</b> to keep them learning.");
      return;
    }
    state.playing = false; state.replay = null; syncPlay();
    startHuman();
    document.getElementById("pad").classList.add("show");
    driveBtn.innerHTML = `${ML.icon("x")} Stop driving`;
    document.querySelector(".stage.three .canvas-box").scrollIntoView({ behavior: "smooth", block: "center" });
    ML.say("Your turn! ← → steer, ↑ speed up, ↓ slow down. Stay between the white lines all the way to the green finish line.");
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
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    if (state.human) driveBtn.click();
    state.replay = null; ckpts.active = null; ckpts.render();
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.round === 1 && state.world.steps === 0)
      ML.say("Off they go! The pink car with the crown is in front. The three white dots are the spots on the road it can see ahead.");
  });
  document.getElementById("skip").addEventListener("click", () => {
    if (state.human || state.replay) return;
    const w = state.world;
    while (!w.done) w.step();
    state.phase = "score";
    state.extra = new L.World(state.brains, state.rules, seedFor(state.round, 1));
    while (!state.extra.done) state.extra.step();
    finishRound();
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.brains = Array.from({ length: POP }, () => L.newBrain());
    state.round = 1;
    state.dist = []; state.fin = []; state.score = []; state.markers = []; state.pending = [];
    state.best = null; state.celebrated = false;
    ckpts.clear(); newRound(); drawChart();
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

  const LABELS = { sharp: "Hairpin bends", narrow: "Narrow lane", rain: "Rain", cones: "Cones in the road", fast: "Speed limit raised" };
  const TELLS = {
    sharp: "The road bends much tighter. Old steering habits swing wide.",
    narrow: "The lane is narrower. Less room for wobbles!",
    rain: "Slippery! Steering is late, jittery and grips less.",
    cones: "Traffic cones sit in the lane. Steer around them!",
    fast: "The speed limit is higher, so every bend comes faster.",
  };
  document.querySelectorAll("#chal [data-c]").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    state.rules[c] = !state.rules[c];
    b.classList.toggle("on", state.rules[c]);
    const on = state.rules[c];
    state.markers.push({ at: state.fin.length, label: `${LABELS[c]} ${on ? "on" : "off"}` });
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
  AliveChip.init({ label: "Still driving", count: () => (state.human || state.replay || !state.world ? null : [state.world.cars.filter((c) => c.alive && !c.finished).length, state.world.cars.length]) });
})();
