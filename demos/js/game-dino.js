// Dino Runner — drawing, the generation loop, challenges, checkpoints, you-play mode and the Model X-ray.
(function () {
  const D = window.DinoCore, N = window.GameNet;
  const { W, H, GROUND, DINO_X, DINO_W, MAX_STEPS } = D;
  const game = ML.setupCanvas(document.getElementById("game"), W, H);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 190);
  const ctx = game.ctx;

  const CHAL_NAMES = { birds: "birds", double: "clumps", heavy: "backpack", storm: "sandstorm", speed: "speed up" };
  const state = {
    playing: false,
    speed: 3,
    gen: 1,
    popSize: 80,
    mutation: 0.3,
    rules: D.defaultRules(),
    brains: D.newHerd(80),
    world: null,
    between: 0,
    record: 0,
    best: [], // champion survival % per generation
    half: [], // top-half average %
    markers: [],
    watch: null, // adaptation tracker for the latest challenge
    replay: null,
    you: null,
    champion: null,
    celebrated: false,
    seen: [], // real situations the leader met (for the X-ray)
  };
  const seedOf = (g) => 7000 + g;

  function newWorld() {
    state.world = new D.World(state.brains, { ...state.rules }, seedOf(state.gen));
  }
  newWorld();

  // ---------- drawing ----------
  let t = 0;
  function sky(w) {
    const storm = w.rules.storm;
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, storm ? "#e8c58f" : "#bfe3ff");
    g.addColorStop(1, storm ? "#f3dcb0" : "#fff3dc");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND);
    ctx.fillStyle = storm ? "rgba(255,240,200,.6)" : "#ffe27a";
    ctx.beginPath(); ctx.arc(680, 62, 26, 0, 7); ctx.fill();
    // parallax clouds and dunes
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 4; i++) {
      const x = ((i * 260 - w.scroll * 0.15) % 1040 + 1040) % 1040 - 120, y = 40 + (i % 2) * 34;
      ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.arc(x + 22, y - 8, 22, 0, 7); ctx.arc(x + 46, y, 17, 0, 7); ctx.fill();
    }
    ctx.fillStyle = storm ? "#d9b27a" : "#f2d39b";
    ctx.beginPath(); ctx.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, GROUND - 26 - 14 * Math.sin((x + w.scroll * 0.35) / 90));
    ctx.lineTo(W, GROUND); ctx.fill();
    // ground
    ctx.fillStyle = "#e9c27d";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
    ctx.fillStyle = "#b8925a";
    for (let i = 0; i < 26; i++) {
      const x = ((i * 53 - w.scroll) % 1378 + 1378) % 1378 - 20;
      ctx.fillRect(x, GROUND + 10 + (i * 7) % 30, 6 + (i % 3) * 3, 3);
    }
    // distance marks
    ctx.fillStyle = "#8a6a3a"; ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "center";
    const m0 = Math.floor(w.scroll / 400);
    for (let k = m0; k < m0 + 4; k++) {
      const x = k * 400 - w.scroll + DINO_X;
      if (x > -20 && x < W + 20) { ctx.fillRect(x, GROUND, 2, 8); ctx.fillText(`${D.metres(k * 400)} m`, x, GROUND + 22); }
    }
  }

  function cactus(o) {
    const base = GROUND;
    ctx.fillStyle = "#3a9b4f"; ctx.strokeStyle = "#1f5e2e"; ctx.lineWidth = 2;
    const n = o.n || 1, cw = (o.w - (n - 1) * 3) / n;
    for (let k = 0; k < n; k++) {
      const x = o.x + k * (cw + 3), h = o.h - (k % 2) * 6;
      ctx.beginPath(); ctx.roundRect(x + cw * 0.3, base - h, cw * 0.4, h, 5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x, base - h * 0.62, cw * 0.32, h * 0.3, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x + cw * 0.68, base - h * 0.78, cw * 0.32, h * 0.3, 4); ctx.fill(); ctx.stroke();
    }
  }
  function bird(o) {
    const y = GROUND - o.bottom - o.h / 2, x = o.x + o.w / 2;
    const flap = Math.sin(t * 0.3 + o.flap) * 9;
    ctx.fillStyle = "#8f6bd9"; ctx.strokeStyle = "#3b2a6b"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 2, y - 14 - flap); ctx.lineTo(x + 8, y); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y + 2, 17, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffb020"; ctx.beginPath(); ctx.moveTo(x - 17, y); ctx.lineTo(x - 26, y + 3); ctx.lineTo(x - 16, y + 5); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - 9, y - 1, 3, 0, 7); ctx.fill();
    ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(x - 10, y - 1, 1.5, 0, 7); ctx.fill();
  }

  // A cute vector dino. alpha < 1 for the ghost herd; crown on the leader.
  function dino(d, alpha, leader, color = "#4cb86b") {
    const ducking = d.duck && d.y === 0;
    const feet = GROUND - d.y, x = DINO_X;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, feet);
    const run = d.y === 0 && !d.dead ? Math.sin(t * 0.5 + (d.phase || 0)) : 0;
    ctx.fillStyle = color; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2;
    if (ducking) {
      ctx.beginPath(); ctx.roundRect(0, -24, 50, 18, 9); ctx.fill(); ctx.stroke(); // long low body
      ctx.beginPath(); ctx.roundRect(36, -28, 22, 16, 7); ctx.fill(); ctx.stroke(); // head forward
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(50, -22, 3.5, 0, 7); ctx.fill();
      ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(51, -22, 1.8, 0, 7); ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(10 + run * 3, -7, 6, 7); ctx.fillRect(28 - run * 3, -7, 6, 7);
    } else {
      // tail
      ctx.beginPath(); ctx.moveTo(4, -26); ctx.lineTo(-12, -16 - run * 2); ctx.lineTo(6, -16); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(2, -34, 28, 26, 10); ctx.fill(); ctx.stroke(); // body
      ctx.beginPath(); ctx.roundRect(16, -50, 26, 20, 8); ctx.fill(); ctx.stroke(); // head
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(32, -43, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(33.5, -43, 2.2, 0, 7); ctx.fill();
      ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(34, -37, 4, 0.2, d.dead ? 0.21 : 1.2); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(26, -26, 7, 4); // little arm
      ctx.fillRect(8 + run * 4, -9, 7, 9); ctx.fillRect(20 - run * 4, -9, 7, 9); // legs
      if (d.heavy) { ctx.fillStyle = "#c0613a"; ctx.beginPath(); ctx.roundRect(-4, -36, 12, 18, 4); ctx.fill(); ctx.stroke(); }
    }
    if (d.dead) { ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(28, -47); ctx.lineTo(36, -39); ctx.moveTo(36, -47); ctx.lineTo(28, -39); ctx.stroke(); }
    if (leader) {
      const top = ducking ? -30 : -52;
      ctx.fillStyle = "#ffc531"; ctx.strokeStyle = "#8a6a1a"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(20, top); ctx.lineTo(22, top - 10); ctx.lineTo(27, top - 4); ctx.lineTo(31, top - 11); ctx.lineTo(35, top - 4); ctx.lineTo(40, top - 10); ctx.lineTo(41, top); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    t++;
    const w = state.you ? state.you : state.replay ? state.replay.world : state.world;
    sky(w);
    for (const o of w.obstacles) (o.type === "bird" ? bird : cactus)(o);
    if (state.you) {
      dino(w.dinos[0], 1, false, "#3d6bff");
    } else {
      const lead = w.leader();
      if (window.__showBabies !== false) for (const d of w.dinos) if (d !== lead && !d.dead) dino(d, 0.16, false);
      dino(lead, 1, !lead.dead);
      // sight line for the leader
      const o = w.obstacles.find((o) => o.x + o.w > DINO_X);
      if (o && !lead.dead) {
        ctx.strokeStyle = "rgba(255,138,61,.75)"; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(DINO_X + 34, GROUND - lead.y - 43); ctx.lineTo(o.x, GROUND - o.bottom - o.h / 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (w.rules.storm) {
      ctx.fillStyle = `rgba(214,170,100,${0.18 + 0.12 * Math.abs(w.gust - 1)})`; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,240,210,.7)"; ctx.lineWidth = 2;
      for (let i = 0; i < 24; i++) { const y = (i * 37 + t * 3) % H, x = (i * 113 - t * 14 * w.gust) % W; ctx.beginPath(); ctx.moveTo((x + W) % W, y); ctx.lineTo((x + W) % W + 26, y + 3); ctx.stroke(); }
    }
    // banner
    ctx.fillStyle = "rgba(31,33,64,.82)";
    ctx.beginPath(); ctx.roundRect(12, 10, 300, 28, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "left";
    const secs = Math.max(0, (MAX_STEPS - w.steps) / 60).toFixed(0);
    const txt = state.you ? `You · ${D.metres(w.scroll)} m${w.dinos[0].dead ? " · Bonk! Jump to try again" : ""}`
      : state.replay ? `Replay: champion of gen ${state.replay.ck.gen} · ${D.metres(w.leader().dist)} m`
      : `Gen ${state.gen} · ${w.alive ?? w.dinos.length} running · ${secs} s left`;
    ctx.fillText(txt, 22, 29);
  }

  // ---------- generations ----------
  function endGeneration() {
    const w = state.world;
    const fitness = w.dinos.map((d) => d.dist);
    const times = w.dinos.map((d) => d.time).sort((a, b) => b - a);
    const half = times.slice(0, Math.max(1, Math.floor(times.length / 2)));
    const bestPct = Math.round((times[0] / MAX_STEPS) * 100);
    const halfPct = Math.round((half.reduce((a, b) => a + b, 0) / half.length / MAX_STEPS) * 100);
    state.best.push(bestPct);
    state.half.push(halfPct);
    const champ = w.leader();
    state.champion = champ.brain.clone();
    const dist = D.metres(champ.dist);
    state.record = Math.max(state.record, dist);
    const brain = state.champion;
    ckpts.add({ gen: state.gen, brainRef: brain, label: `Gen ${state.gen}`, sub: `${dist} m · ${bestPct}%`, draw: (cv) => drawMiniNet(cv, brain) });
    trackAdaptation(halfPct);
    drawChartNow();

    if (bestPct >= 100 && !state.celebrated) {
      state.celebrated = true;
      ML.confetti();
      ML.say(`Generation ${state.gen}: a dino ran the <b>whole desert</b> without bumping into anything! Nobody taught it to jump. Try a <b>challenge</b> next.`);
      ML.xray.offer("The dinos learned to run! X-ray the champion's brain");
    } else if (!state.watch || state.watch.said) {
      if (state.gen === 1) ML.say(`Most dinos ran straight into the first cactus. The few that jumped, by luck, become the parents.`);
      else if (state.speed !== 0 || state.gen % 10 === 0) ML.say(`Generation ${state.gen} done. The best dino ran <b>${dist} m</b>. Its brain gets copied with small changes.`);
    }
    state.brains = N.nextGeneration(w.dinos.map((d) => d.brain), fitness, { mutation: state.mutation });
    // herd size changes take effect here
    while (state.brains.length < state.popSize) state.brains.push(state.brains[Math.floor(Math.random() * 8)].clone().mutate(state.mutation));
    state.brains.length = Math.min(state.brains.length, state.popSize);
    state.gen++;
    newWorld();
  }

  // ---------- challenge tracking: drop, then recovery ----------
  function trackAdaptation(halfPct) {
    const w = state.watch;
    if (!w || w.said) return;
    w.n++;
    w.min = Math.min(w.min, halfPct);
    const name = CHAL_NAMES[w.key];
    if (!w.dropped && halfPct < w.base * 0.7) {
      w.dropped = true;
      ML.say(`Ouch! With the <b>${name}</b> the herd's scores fell from ${w.base}% to ${halfPct}%. Their old trick doesn't work. Let's see if evolution finds a new one…`);
    }
    if (w.dropped && (halfPct >= w.base * 0.85 || (w.n >= 6 && halfPct >= w.min * 1.6 && halfPct >= 15))) {
      w.said = true;
      ML.confetti(50);
      ML.say(`They <b>adapted</b> to the ${name}! After ${w.n} generation${w.n > 1 ? "s" : ""} the top half is back to <b>${halfPct}%</b>.`);
    } else if (!w.dropped && w.n >= 5) {
      w.said = true;
      ML.say(`The <b>${name}</b> didn't slow them down much: their old brains already cope. Try another challenge!`);
    }
  }

  // ---------- chart ----------
  function drawChartNow() {
    GameLab.drawChart(chart, [{ values: state.best, color: "--accent" }, { values: state.half, color: "--ink" }], state.markers, 100, "%");
  }
  drawChartNow();

  // ---------- checkpoints ----------
  const ckHost = document.getElementById("ckpts");
  const ckpts = new GameLab.Checkpoints(ckHost, (it) => startReplay(it), () => stopReplay());
  ckpts.render();

  function drawMiniNet(cv, net) {
    if (!net || !cv) return;
    const c = cv.getContext("2d"), w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    const sizes = net.sizes;
    const X = (l) => 16 + ((w - 32) * l) / (sizes.length - 1);
    const Y = (n, i) => (n === 1 ? h / 2 : 10 + ((h - 20) * i) / (n - 1));
    for (let l = 0; l < sizes.length - 1; l++)
      for (let i = 0; i < sizes[l]; i++)
        for (let j = 0; j < sizes[l + 1]; j++) {
          const v = Math.tanh(net.weight(l, i, j));
          c.strokeStyle = v > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
          c.globalAlpha = 0.12 + Math.abs(v) * 0.8;
          c.lineWidth = 0.5 + Math.abs(v) * 2.5;
          c.beginPath(); c.moveTo(X(l), Y(sizes[l], i)); c.lineTo(X(l + 1), Y(sizes[l + 1], j)); c.stroke();
        }
    c.globalAlpha = 1;
    sizes.forEach((n, l) => { for (let i = 0; i < n; i++) { c.fillStyle = ML.cssVar("--ink"); c.beginPath(); c.arc(X(l), Y(n, i), 3.5, 0, 7); c.fill(); } });
  }

  function startReplay(it) {
    state.playing = false; syncPlay();
    state.you = null; syncYou();
    state.replay = { ck: it, world: new D.World([it.brainRef], { ...state.rules }, 424242) };
    ML.say(`This is the champion from <b>generation ${it.gen}</b>, running today's desert${Object.values(state.rules).some(Boolean) ? " with today's challenges" : ""}.`);
  }
  function stopReplay() { state.replay = null; }

  // ---------- you play ----------
  const keys = { jump: false, duck: false };
  function syncYou() {
    document.getElementById("pad").classList.toggle("show", !!state.you);
    document.getElementById("you").innerHTML = state.you ? `${ML.icon("x")} Stop running` : `${ML.icon("gamepad")} I'll run!`;
  }
  function startYou() { state.you = new D.World([null], { ...state.rules }, Math.floor(Math.random() * 1e6)); }
  document.getElementById("you").addEventListener("click", () => {
    if (state.you) { state.you = null; syncYou(); ML.say(`Back to the herd! Press <b>Play</b> to keep them learning.`); return; }
    state.playing = false; syncPlay(); state.replay = null; ckpts.active = null; ckpts.render();
    startYou(); syncYou();
    document.querySelector(".canvas-box").scrollIntoView({ behavior: "smooth", block: "nearest" });
    ML.say(`Your turn! <b>Jump</b> over cacti${state.rules.birds ? " and <b>duck</b> under birds" : ""}. The dinos only see 8 numbers. You see the whole picture!`);
  });
  const keyOf = { Space: "jump", ArrowUp: "jump", KeyW: "jump", ArrowDown: "duck", KeyS: "duck" };
  document.addEventListener("keydown", (e) => {
    if (!state.you || !keyOf[e.code]) return;
    e.preventDefault();
    keys[keyOf[e.code]] = true;
    if (state.you.done && keyOf[e.code] === "jump") startYou();
  });
  document.addEventListener("keyup", (e) => { if (keyOf[e.code]) keys[keyOf[e.code]] = false; });
  document.querySelectorAll("#pad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); keys[k] = true; if (state.you && state.you.done && k === "jump") startYou(); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => (keys[k] = false)));
  });
  document.getElementById("game").addEventListener("pointerdown", () => { if (state.you) { if (state.you.done) startYou(); keys.jump = true; setTimeout(() => (keys.jump = false), 120); } });

  // ---------- inside card ----------
  const IN_NAMES = ["Next thing is close", "Its top height", "It floats at", "Its width", "Next-next is soon", "Game speed", "My height", "My up-speed"];
  let insideTick = 0;
  function renderInside() {
    if (++insideTick % 8) return;
    const host = document.getElementById("inside");
    if (state.you) { host.innerHTML = `<div>You are the brain! A robot dino only feels 8 numbers, like how close the next cactus is and how tall it is.</div>`; return; }
    const w = state.replay ? state.replay.world : state.world;
    const d = w.leader();
    if (!d || !d.inputs || d.dead) return;
    const x = d.inputs, out = d.brain.acts[d.brain.acts.length - 1];
    const o = w.obstacles.find((o) => o.x + o.w > DINO_X);
    const px = o ? Math.max(0, Math.round(o.x - (DINO_X + DINO_W))) : null;
    const what = !o || x[0] === 0 ? "the desert ahead is empty" : o.type === "bird" ? `a bird ${px} px away, floating at head height` : `a ${o.n > 1 ? "cactus clump" : o.h > 40 ? "tall cactus" : "small cactus"} ${px} px away`;
    const acts = ["JUMP", "DUCK", "RUN"];
    const a = d.action;
    const bars = acts.map((n, i) => `<div class="xr-bar ${i === a ? "on" : ""}" style="margin:0"><span>${n.toLowerCase()} neuron</span><div class="xr-track"><div style="width:${Math.round(((out[i] + 1) / 2) * 100)}%;background:var(--accent)"></div></div><b>${out[i].toFixed(2)}</b></div>`).join("");
    host.innerHTML = `<div>${ML.icon("eye")} I see ${what}${d.y > 0 ? ", and I'm in the air" : ""}.</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>${bars}
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("footprints")} Biggest answer: <b style="color:var(--accent)">${acts[a]}</b></div>`;
    if (!state.replay && !state.you) { state.seen.push(x.slice()); if (state.seen.length > 400) state.seen.shift(); }
  }

  // ---------- stats ----------
  function renderStats() {
    const w = state.world;
    document.getElementById("st-gen").textContent = state.gen;
    document.getElementById("st-alive").textContent = w.alive ?? w.dinos.length;
    document.getElementById("st-best").innerHTML = `${D.metres(w.leader().dist)}<small> m</small>`;
    document.getElementById("st-rec").innerHTML = `${state.record}<small> m</small>`;
  }

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    if (state.you) { state.you = null; syncYou(); }
    if (state.replay) { state.replay = null; ckpts.active = null; ckpts.render(); }
    state.playing = !state.playing;
    syncPlay();
  });
  document.getElementById("skip").addEventListener("click", () => {
    if (state.you || state.replay) return;
    while (!state.world.done) state.world.step();
    endGeneration();
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.brains = D.newHerd(state.popSize);
    state.gen = 1; state.best = []; state.half = []; state.markers = []; state.record = 0;
    state.watch = null; state.celebrated = false; state.champion = null; state.seen = [];
    ckpts.clear(); newWorld(); drawChartNow();
    ML.say(`All learning erased! ${state.popSize} baby dinos with random brains again.`);
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));
  document.querySelectorAll("#chal button").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.c;
    state.rules[k] = !state.rules[k];
    b.classList.toggle("on", state.rules[k]);
    const name = CHAL_NAMES[k];
    if (state.rules[k]) {
      const recent = state.half.slice(-3);
      const base = recent.length ? Math.round(recent.reduce((a, c) => a + c, 0) / recent.length) : 0;
      state.markers.push({ at: state.best.length, label: name });
      state.watch = { key: k, base, min: 100, n: 0, dropped: false, said: base < 10 };
      if (base < 10) ML.say(`<b>${name[0].toUpperCase() + name.slice(1)}</b> switched on! The herd is still learning to run, so let them get good first to see the challenge bite.`);
      else ML.say(`<b>${name[0].toUpperCase() + name.slice(1)}</b> switched on from the next generation! Watch the chart.`);
    } else {
      state.markers.push({ at: state.best.length, label: name + " off" });
      ML.say(`${name[0].toUpperCase() + name.slice(1)} switched off.`);
    }
    drawChartNow();
    if (state.you) state.you.rules = { ...state.rules };
  }));
  ML.bindRange("#pop", (v) => v, (v) => (state.popSize = v));
  ML.bindRange("#mut", (v) => Math.round(v * 100) + "%", (v) => (state.mutation = v));

  // ---------- Model X-ray ----------
  const xBrain = () => (state.replay ? state.replay.ck.brainRef : state.champion || state.world.leader().brain);
  ML.xray.register({
    title: "The champion dino's brain",
    kind: "Neural network",
    summary: () => `Evolved over ${state.gen - 1} generation${state.gen === 2 ? "" : "s"}`,
    size: () => `${xBrain().genes.length} knobs`,
    stats: () => [["Generations", state.gen - 1], ["Record", `${state.record} m`], ["Layers", D.SIZES.join(" → ")]],
    inputs: [
      { name: "Next thing is close", min: 0, max: 1, describe: (v) => (v < 0.02 ? "nothing seen" : `${Math.round((1 - v) * 600)} px away`) },
      { name: "Its top height", min: 0, max: 1.2, describe: (v) => `${Math.round(v * 60)} px` },
      { name: "It floats at", min: 0, max: 0.8, describe: (v) => (v < 0.05 ? "on the ground" : `${Math.round(v * 60)} px up`) },
      { name: "Its width", min: 0, max: 1, describe: (v) => `${Math.round(v * 80)} px` },
      { name: "Next-next is soon", min: 0, max: 1, describe: (v) => (v < 0.02 ? "nothing after" : `${Math.round((1 - v) * 600)} px later`) },
      { name: "Game speed", min: 0.4, max: 1.2, describe: (v) => `${(v * 14).toFixed(1)} px/step` },
      { name: "My height", min: 0, max: 1, describe: (v) => (v < 0.02 ? "on the ground" : `${Math.round(v * 120)} px up`) },
      { name: "My up-speed", min: -1, max: 1, describe: (v) => (v > 0.05 ? "going up" : v < -0.05 ? "falling" : "still") },
    ],
    outputs: [{ name: "Jump", color: ML.cssVar("--good") }, { name: "Duck", color: ML.cssVar("--nn") }, { name: "Run", color: ML.cssVar("--sup") }],
    predict: (x) => Array.from(xBrain().clone().forward(x)),
    samples: () => state.seen,
    current: () => { const d = state.world.leader(); return d && d.inputs ? d.inputs.slice() : null; },
    drawBrain: (cv) => drawMiniNet(cv, xBrain()),
    brainCaption: "Left: the 8 things a dino feels. Middle: 8 thinking neurons. Right: jump, duck, run. Blue lines push a neuron up, orange lines push it down; thicker = stronger.",
    notes: ["Nobody wrote a single 'if cactus then jump' rule. Every rule on this page grew out of copying the luckiest jumpers, again and again."],
  });
  ML.xray.button(document.getElementById("ctrl"));

  // ---------- main loop ----------
  function frame() {
    const t0 = performance.now();
    if (state.you) {
      const w = state.you;
      if (!w.done) w.step(() => (keys.jump ? 0 : keys.duck ? 1 : 2));
      if (w.done && !w.said) { w.said = true; ML.say(`Bonk! You ran <b>${D.metres(w.scroll)} m</b>. Tap or press jump to try again. Not easy, right?`); }
    } else if (state.replay) {
      const w = state.replay.world;
      for (let i = 0; i < Math.max(1, state.speed || 3) && !w.done; i++) w.step();
      if (w.done) state.replay.world = new D.World([state.replay.ck.brainRef], { ...state.rules }, 424242);
    } else if (state.playing) {
      const w = state.world;
      if (state.between > 0) state.between--;
      else if (state.speed === 0) {
        // Turbo: run as much as fits in ~10 ms, but at most ~5 generations a second,
        // so the chart and Robo can still tell the story.
        while (performance.now() - t0 < 10) {
          state.world.step();
          if (state.world.done) { endGeneration(); state.between = 12; break; }
        }
      } else {
        for (let i = 0, n = ML.ticks(state.speed); i < n && !w.done; i++) {
          w.step();
          if (performance.now() - t0 > 10) break;
        }
        if (w.done) { endGeneration(); state.between = state.speed >= 10 ? 5 : 25; }
      }
    }
    draw();
    renderInside();
    renderStats();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still running", count: () => (state.you || state.replay || !state.world ? null : [state.world.dinos.filter((d) => !d.dead).length, state.world.dinos.length]) });
})();
