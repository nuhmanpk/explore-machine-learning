// Space Dodger — page: drawing, the round-by-round evolution loop, challenges,
// checkpoints, "you fly" mode and the Model X-ray.
(function () {
  const { Net, nextGeneration } = window.GameNet;
  const S = window.SpaceCore;
  const { W, H, RAYS, RAY_LEN, SIZES } = S;
  const POP = 60;

  const arena = ML.setupCanvas(document.getElementById("arena"), W, H);
  const chartCv = ML.setupCanvas(document.getElementById("chart"), 640, 180);
  const ctx = arena.ctx;

  // Ray k points (k × 45°) clockwise from the nose.
  const DIRS = ["ahead", "ahead-right", "right", "behind-right", "behind", "behind-left", "left", "ahead-left"];

  const state = {
    brains: Array.from({ length: POP }, () => new Net(SIZES)),
    rules: { ...S.DEFAULT_RULES },
    round: 1,
    speed: 3,
    playing: false,
    mutation: 0.25,
    world: null,
    phase: "show", // "show" = the round you watch, "score" = a second field scored in the background
    fit: null,
    extra: null,
    surv: [],
    stars: [],
    score: [],
    markers: [],
    pending: [], // challenges waiting to see if the fleet adapts
    best: null, // champion brain of the last finished round
    replay: null,
    human: null,
    celebrated: false,
    acc: 0,
    showBabies: true, // off = draw only the leading ship
  };
  const seedFor = (round, k) => 7 + round * 3 + k;

  function newRound() {
    state.world = new S.World(state.brains, state.rules, seedFor(state.round, 0));
    state.phase = "show";
    state.extra = null;
  }

  // ---------- evolution ----------
  function finishRound() {
    const shown = state.world, extra = state.extra;
    const fit = shown.ships.map((s, i) => shown.fitness(s) + extra.fitness(extra.ships[i]));
    const order = fit.map((_, i) => i).sort((a, b) => fit[b] - fit[a]);
    const top = order.slice(0, POP / 2);
    const surv = top.reduce((a, i) => a + shown.ships[i].t / S.STEPS + extra.ships[i].t / S.STEPS, 0) / top.length / 2;
    const stars = top.reduce((a, i) => a + shown.ships[i].stars + extra.ships[i].stars, 0) / top.length / 2;
    const score = top.reduce((a, i) => a + fit[i], 0) / top.length / 2;
    state.surv.push(Math.round(surv * 100));
    state.stars.push(stars);
    state.score.push(score);
    state.best = state.brains[order[0]].clone();
    ckpts.add({
      label: `Round ${state.round}`,
      sub: `${Math.round((shown.ships[order[0]].t / S.STEPS) * 100)}% flight · ${shown.ships[order[0]].stars} stars`,
      brain: state.best.clone(),
      rules: { ...state.rules },
      draw: (cv) => drawNet(cv, state.best),
    });
    narrateRound(surv, stars);
    checkAdapt();
    drawChart();
    state.brains = nextGeneration(state.brains, fit, { mutation: state.mutation });
    state.round++;
    newRound();
  }

  function narrateRound(surv, stars) {
    const n = state.surv.length;
    const S100 = Math.round(surv * 100);
    if (!state.celebrated && n >= 3 && state.surv.slice(-3).every((v) => v >= 80) && state.stars.slice(-3).every((v) => v >= 2.5)) {
      state.celebrated = true;
      ML.confetti();
      ML.say(`They did it! The best pilots now dodge rocks and grab about <b>${stars.toFixed(1)} stars</b> a flight, after just <b>${n}</b> rounds. Nobody taught them!`);
      ML.xray.offer("The fleet learned to fly! X-ray a pilot's brain");
      return;
    }
    if (state.pending.length && state.speed !== 0) return; // challenge narration takes priority
    if (n === 1) ML.say(`Round 1 done. Random brains: the best half kept flying <b>${S100}%</b> of the time and grabbed only ${stars.toFixed(1)} stars. Their babies will try next.`);
    else if (state.speed !== 0 && n % 3 === 0) ML.say(`Round ${n}: the best half survived <b>${S100}%</b> and grabbed <b>${stars.toFixed(1)}</b> stars each. ${S100 > state.surv[0] + 10 ? "Much better than round 1!" : "Still learning…"}`);
  }

  // A challenge counts as "adapted" when the score climbs back to 75% of before, or 40% above its low point.
  function checkAdapt() {
    const now = state.score[state.score.length - 1];
    for (const p of state.pending.slice()) {
      p.low = Math.min(p.low, now);
      p.rounds++;
      if (p.rounds === 2 && now < p.before * 0.85)
        ML.say(`Ouch, ${p.label.toLowerCase()}! The score dropped from ${p.before.toFixed(0)} to ${now.toFixed(0)}. The old tricks don't work any more…`);
      const back = p.rounds >= 3 && (now >= p.before * 0.75 || (p.low < p.before * 0.85 && now >= p.low * 1.4));
      if (back) {
        state.pending.splice(state.pending.indexOf(p), 1);
        if (p.low >= p.before * 0.85) ML.say(`${p.label} didn't slow the fleet down much. Their tricks still work!`);
        else { ML.confetti(40); ML.say(`They adapted to <b>${p.label.toLowerCase()}</b>! Score back to ${now.toFixed(0)} after ${p.rounds} rounds. Nobody re-programmed them.`); }
      } else if (p.rounds >= 40) {
        state.pending.splice(state.pending.indexOf(p), 1);
        ML.say(`${p.label} is really tough: the fleet improved a bit, but space is simply harder now.`);
      }
    }
  }

  // ---------- drawing ----------
  const bgStars = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.3, tw: Math.random() * 6 }));
  function drawSpace(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#151a45");
    g.addColorStop(1, "#0b0d26");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of bgStars) {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t / 600 + s.tw);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawHole(w, t) {
    if (!w.rules.gravity) return;
    const h = w.hole;
    for (let i = 5; i > 0; i--) {
      ctx.strokeStyle = `rgba(160,120,255,${0.08 * i})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r + i * 9 + Math.sin(t / 300 + i) * 2, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#b48cff"; ctx.lineWidth = 2; ctx.stroke();
  }
  function drawRock(r) {
    const rs = S.seeded(r.seed);
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.fillStyle = "#8b7b6b";
    ctx.strokeStyle = "#5a4c40";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, rr = r.r * (0.8 + rs() * 0.3);
      i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#6f6152";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc((rs() - 0.5) * r.r, (rs() - 0.5) * r.r, r.r * (0.12 + rs() * 0.12), 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function drawRocks(w) {
    // draw wrapped copies near the edges so rocks slide smoothly across
    for (const r of w.rocks) {
      drawRock(r);
      if (!w.rules.walls) {
        if (r.x < r.r) drawRock({ ...r, x: r.x + W });
        if (r.x > W - r.r) drawRock({ ...r, x: r.x - W });
        if (r.y < r.r) drawRock({ ...r, y: r.y + H });
        if (r.y > H - r.r) drawRock({ ...r, y: r.y - H });
      }
    }
  }
  function drawStar(x, y, t, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(t / 900);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
    glow.addColorStop(0, "rgba(255,220,90,.7)");
    glow.addColorStop(1, "rgba(255,220,90,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.strokeStyle = "#c98f00";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 4 : 9;
      i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawShip(s, color, alpha, lead) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.a);
    if (s.thrusting && s.alive) {
      ctx.fillStyle = "#ff9a3d";
      ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(-16 - Math.random() * 6, 0); ctx.lineTo(-9, 4); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = s.alive ? color : "#666a8a";
    ctx.strokeStyle = lead ? "#fff" : "rgba(255,255,255,.6)";
    ctx.lineWidth = lead ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.quadraticCurveTo(4, -9, -9, -8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-9, 8);
    ctx.quadraticCurveTo(4, 9, 13, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#bfe9ff";
    ctx.beginPath(); ctx.arc(3, 0, 3.2, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawRadar(w, s) {
    for (let k = 0; k < RAYS; k++) {
      const v = s.radar[k];
      const a = s.a + (k / RAYS) * Math.PI * 2;
      const len = v > 0 ? (1 - v) * RAY_LEN : RAY_LEN;
      ctx.strokeStyle = v > 0 ? `rgba(255,${Math.round(180 - v * 150)},90,${0.35 + v * 0.65})` : "rgba(140,200,255,.18)";
      ctx.lineWidth = v > 0 ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(a) * len, s.y + Math.sin(a) * len); ctx.stroke();
    }
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(255,210,63,.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.sx, s.sy); ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawWorld(w, t, label, opts = {}) {
    drawSpace(t);
    if (w.rules.walls) {
      ctx.strokeStyle = "rgba(255,77,94,.85)";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, W - 6, H - 6);
    }
    drawHole(w, t);
    drawRocks(w);
    const lead = opts.lead || w.leader();
    // ghosts: other ships' stars faintly, then ships
    const ghosts = state.showBabies && !opts.human;
    if (ghosts) for (const s of w.ships) if (s !== lead && s.alive) drawStar(s.sx, s.sy, t, 0.12);
    if (lead) drawStar(lead.sx, lead.sy, t);
    if (ghosts) for (const s of w.ships) if (s !== lead && s.alive) drawShip(s, "#7aa2ff", 0.28, false);
    if (lead) {
      drawRadar(w, lead);
      drawShip(lead, opts.human ? "#2fbf62" : "#ff5c9a", 1, true);
    }
    if (label) {
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.beginPath(); ctx.roundRect(10, 10, Math.min(W - 20, ctx.measureText(label).width + 30), 28, 10); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 13px Nunito, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, 22, 29);
    }
  }

  function drawChart() {
    GameLab.drawChart(chartCv, [
      { values: state.surv, color: "--accent" },
      { values: state.stars.map((v) => Math.min(100, v * 10)), color: "--lang" },
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
  let insideTick = 0;
  function renderInside(w, s) {
    if (++insideTick % 10) return;
    const host = document.getElementById("inside");
    if (!s) return;
    if (state.human) {
      host.innerHTML = `<div>You are the brain! A robot ship only gets these numbers: 8 radar beams, the nearest rock's movement, and where its star is.</div>`;
      return;
    }
    const hits = s.radar.map((v, k) => [v, k]).filter(([v]) => v > 0.05).sort((a, b) => b[0] - a[0]).slice(0, 2);
    const seen = hits.length
      ? hits.map(([v, k]) => `rock <b>${v > 0.6 ? "very close" : v > 0.3 ? "close" : "far"}</b> ${DIRS[k]}`).join(", ")
      : "no rocks nearby";
    const sa = Math.atan2(s.sy - s.y, s.sx - s.x) - s.a;
    const starDir = Math.cos(sa) > 0.7 ? "ahead" : Math.sin(sa) > 0 ? "to the right" : "to the left";
    const turn = s.out[0] > 0.33 ? "turn RIGHT" : s.out[0] < -0.33 ? "turn LEFT" : "go straight";
    const thrust = s.out[1] > 0 ? "fire the engine" : "coast";
    host.innerHTML = `<div>${ML.icon("eye")} Radar: ${seen}</div>
      <div>${ML.icon("star")} Star is <b>${starDir}</b></div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("network")} 12 thinking neurons mix it all up</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("rocket")} Decision: <b style="color:var(--accent)">${turn} + ${thrust}</b></div>`;
  }

  function renderStats(w) {
    document.getElementById("st-round").textContent = state.round;
    document.getElementById("st-alive").textContent = w.ships.filter((s) => s.alive).length;
    const lead = w.leader();
    document.getElementById("st-stars").textContent = lead ? lead.stars : 0;
    const last = state.surv.length ? state.surv[state.surv.length - 1] : null;
    document.getElementById("st-top").innerHTML = last === null ? "–" : `${last}<small>%</small>`;
  }

  // ---------- main tick ----------
  function stepTraining() {
    const t0 = performance.now();
    const budget = 9; // ms of compute per frame, so the page stays smooth even in Turbo
    if (state.phase === "show") {
      const w = state.world;
      if (state.speed === 0) {
        while (!w.done && performance.now() - t0 < budget) for (let i = 0; i < 20 && !w.done; i++) w.step();
      } else {
        for (let i = 0, n = ML.ticks(state.speed); i < n && !w.done; i++) w.step();
      }
      if (w.done) {
        state.phase = "score";
        state.extra = new S.World(state.brains, state.rules, seedFor(state.round, 1));
      }
    }
    if (state.phase === "score") {
      const e = state.extra;
      while (!e.done && performance.now() - t0 < budget) for (let i = 0; i < 20 && !e.done; i++) e.step();
      if (e.done) finishRound();
    }
  }

  const keys = { left: false, right: false, up: false };
  function frame(t) {
    if (state.human) {
      const h = state.human;
      if (!h.world.done) h.world.step(keys);
      const s = h.world.ships[0];
      if (!s.alive && !h.said) {
        h.said = true;
        ML.say(s.why === "hole" ? "Swallowed by the black hole! Press ↑ to fly again." : s.why === "wall" ? "Bonk, the wall! Press ↑ to try again." : `Crunch! You flew ${(s.t / 60).toFixed(1)} s and grabbed ${s.stars} stars. Press ↑ to fly again.`);
      }
      if (!s.alive && keys.up && h.said && performance.now() - h.diedAt > 600) startHuman();
      if (!s.alive && !h.diedAt) h.diedAt = performance.now();
      drawWorld(h.world, t, `You: ${(s.t / 60).toFixed(1)} s · ${s.stars} stars`, { lead: s, human: true });
      renderInside(h.world, s);
    } else if (state.replay) {
      const r = state.replay;
      for (let i = 0; i < Math.max(1, Math.min(state.speed || 3, 3)); i++) r.world.step();
      if (r.world.done && !r.said) {
        r.said = true;
        const s = r.world.ships[0];
        ML.say(`Round ${r.ck.label.split(" ")[1]}'s champion flew <b>${(s.t / 60).toFixed(1)} s</b> and grabbed <b>${s.stars}</b> stars in today's space.`);
        setTimeout(() => { if (state.replay === r) startReplay(r.ck); }, 1500);
      }
      drawWorld(r.world, t, `Replaying ${r.ck.label}'s champion`);
      renderInside(r.world, r.world.ships[0]);
    } else {
      if (state.playing) stepTraining();
      const w = state.world;
      const label = state.phase === "score" ? `Round ${state.round}: scoring a second asteroid field…` : `Round ${state.round} · ${((S.STEPS - w.steps) / 60).toFixed(0)} s left`;
      drawWorld(w, t, label);
      renderInside(w, w.leader());
      renderStats(w);
    }
    requestAnimationFrame(frame);
  }

  // ---------- replay + you-fly ----------
  const ckpts = new GameLab.Checkpoints(document.getElementById("ckpts"), (ck) => startReplay(ck), () => { state.replay = null; });
  ckpts.render();
  function startReplay(ck) {
    state.playing = false;
    syncPlay();
    state.replay = { ck, world: new S.World([ck.brain], state.rules, Math.floor(Math.random() * 1e6)) };
  }
  function startHuman() {
    state.human = { world: new S.World([new Net(SIZES)], state.rules, Math.floor(Math.random() * 1e6)), said: false, diedAt: 0 };
  }
  const flyBtn = document.getElementById("fly");
  flyBtn.addEventListener("click", () => {
    if (state.human) {
      state.human = null;
      document.getElementById("pad").classList.remove("show");
      flyBtn.innerHTML = `${ML.icon("gamepad")} I'll fly a ship`;
      ML.say("Back to the robot fleet! Press <b>Play</b> to keep them learning.");
      return;
    }
    state.playing = false;
    state.replay = null;
    syncPlay();
    startHuman();
    document.getElementById("pad").classList.add("show");
    flyBtn.innerHTML = `${ML.icon("x")} Stop flying`;
    document.querySelector(".stage.three .canvas-box").scrollIntoView({ behavior: "smooth", block: "center" });
    ML.say("Your turn! ← → to turn, ↑ for the engine. The yellow dashed line points to your star.");
  });
  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", Space: "up" };
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
    if (state.human) flyBtn.click();
    state.replay = null;
    ckpts.active = null;
    ckpts.render();
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.round === 1 && state.world.steps === 0)
      ML.say("Go, little ships! Pink = the ship doing best right now, with its radar beams lit up.");
  });
  document.getElementById("skip").addEventListener("click", () => {
    if (state.human || state.replay) return;
    const w = state.world;
    while (!w.done) w.step();
    state.phase = "score";
    state.extra = new S.World(state.brains, state.rules, seedFor(state.round, 1));
    while (!state.extra.done) state.extra.step();
    finishRound();
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.brains = Array.from({ length: POP }, () => new Net(SIZES));
    state.round = 1;
    state.surv = []; state.stars = []; state.score = []; state.markers = []; state.pending = [];
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

  const LABELS = { shower: "Meteor shower", gravity: "Black hole", heavy: "Heavy ship", walls: "Deadly walls", shy: "Shy stars" };
  document.querySelectorAll("#chal [data-c]").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    state.rules[c] = !state.rules[c];
    b.classList.toggle("on", state.rules[c]);
    const on = state.rules[c];
    state.markers.push({ at: state.surv.length, label: `${LABELS[c]} ${on ? "on" : "off"}` });
    drawChart();
    if (state.human) { startHuman(); return; }
    if (on) {
      const before = state.score.slice(-3);
      if (before.length) state.pending.push({ c, label: LABELS[c], before: before.reduce((a, v) => a + v, 0) / before.length, low: Infinity, rounds: 0 });
      ML.say(`<b>${LABELS[c]}</b> starts next round! ${before.length ? "Let's see if the fleet can adapt." : "Turn it on after a few rounds to see the drop and recovery."}`);
    } else ML.say(`${LABELS[c]} switched off.`);
  }));

  // ---------- Model X-ray ----------
  const seen = [];
  setInterval(() => {
    if (!state.playing || state.human || state.replay) return;
    const s = state.world.leader();
    if (s && s.alive) { seen.push(state.world.sense(s)); if (seen.length > 400) seen.shift(); }
  }, 150);
  const xrayBrain = () => (state.replay ? state.replay.ck.brain : state.best || state.brains[0]);
  const near = (v) => (v < 0.05 ? "clear" : v > 0.6 ? "very close" : v > 0.3 ? "close" : "far");
  const OUTS = [
    ["Left + engine", -1, 1, "--sup"], ["Straight + engine", 0, 1, "--good"], ["Right + engine", 1, 1, "--nn"],
    ["Left, coast", -1, -1, "--unsup"], ["Straight, coast", 0, -1, "--muted"], ["Right, coast", 1, -1, "--diff"],
  ];
  ML.xray.register({
    title: "Champion pilot",
    kind: "Neural network",
    summary: () => `Evolved over ${state.round - 1} rounds`,
    size: () => `${xrayBrain().genes.length} knobs`,
    stats: () => [["Rounds", state.round - 1], ["Best half alive", state.surv.length ? state.surv[state.surv.length - 1] + "%" : "–"], ["Stars / flight", state.stars.length ? state.stars[state.stars.length - 1].toFixed(1) : "–"], ["Layers", SIZES.join(" → ")]],
    inputs: [
      ...DIRS.map((d) => ({ name: `Radar ${d}`, min: 0, max: 1, describe: near })),
      { name: "Rock ahead/behind", min: -1, max: 1, describe: (v) => (v > 0.05 ? "ahead" : v < -0.05 ? "behind" : "level") },
      { name: "Rock right/left", min: -1, max: 1, describe: (v) => (v > 0.05 ? "right" : v < -0.05 ? "left" : "centre") },
      { name: "Rock moving at me", min: -1, max: 1, describe: (v) => (v < -0.05 ? "coming closer" : v > 0.05 ? "moving away" : "still") },
      { name: "Rock sliding sideways", min: -1, max: 1, describe: (v) => (v > 0.05 ? "to the right" : v < -0.05 ? "to the left" : "no") },
      { name: "Star left/right", min: -1, max: 1, describe: (v) => (v > 0.1 ? "right" : v < -0.1 ? "left" : "centre") },
      { name: "Star ahead/behind", min: -1, max: 1, describe: (v) => (v > 0.1 ? "ahead" : v < -0.1 ? "behind" : "beside") },
      { name: "Star distance", min: 0, max: 1, describe: (v) => (v < 0.15 ? "very near" : v < 0.4 ? "near" : "far") },
      { name: "My speed", min: 0, max: 1, describe: (v) => `${Math.round(v * 100)}%` },
    ],
    outputs: OUTS.map(([name, , , c]) => ({ name, color: ML.cssVar(c) })),
    // The net gives a turn and an engine number; score each of the 6 combos by how close it is.
    predict: (x) => {
      const o = xrayBrain().forward(x);
      return OUTS.map(([, t, th]) => -((o[0] - t) ** 2) - (o[1] - th) ** 2);
    },
    samples: () => seen,
    current: () => {
      const w = state.replay ? state.replay.world : state.world;
      const s = state.replay ? w.ships[0] : w.leader();
      return s ? w.sense(s) : null;
    },
    drawBrain: (cv) => drawNet(cv, xrayBrain()),
    brainCaption: "Left column = the 16 senses (8 radar beams, the nearest rock, the star, speed). Middle = 12 thinking neurons. Right = turn and engine. Blue lines push, orange lines hold back; thicker = stronger.",
    notes: ["Nobody wrote a dodging rule. These 230-odd knobs were found by breeding the best pilots, round after round."],
  });
  ML.xray.button(playBtn.parentElement);

  newRound();
  drawChart();
  syncPlay();
  requestAnimationFrame(frame);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still flying", count: () => (state.human || state.replay || !state.world ? null : [state.world.ships.filter((s) => s.alive).length, state.world.ships.length]) });
})();
