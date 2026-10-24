// Bird Learns to Fly — play it yourself, then watch tabular Q-learning learn it.
(function () {
  const { W, H, BIRD_X, BIRD_R, PIPE_W, Game, Agent, stateKey, decode, DX_BINS, DY_MIN, DY_MAX } = window.FlappyRL;
  const { drawChart, Checkpoints, Adapt } = window.RLGames;
  const world = window.FlappyRL.world;
  const adapt = new Adapt();

  const scene = ML.setupCanvas(document.getElementById("scene"), W, H);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 110);
  const heat = ML.setupCanvas(document.getElementById("heat"), 280, 220);

  const SPEEDS = [
    { name: "0.5× slow-mo", steps: 0.5 }, // half of Real time
    { name: "Real time", steps: 1 },
    { name: "Fast", steps: 4 },
    { name: "Super fast", steps: 40 },
    { name: "Turbo", steps: 2000 },
  ];
  const WIN_PIPES = 100; // a try this long counts as "mastered" and ends

  const state = {
    mode: "you",
    gap: 120,
    // you-try
    you: new Game(120),
    youStarted: false,
    youBest: 0,
    // robo
    agent: new Agent(),
    game: null,
    key: 0,
    playing: false,
    speed: 2,
    acc: 0,
    tries: 0,
    best: 0,
    scores: [],
    replay: null, // { ck, game }
    lastAction: 0,
    wingT: 0,
    solved: false,
  };
  state.game = new Game(state.gap);
  state.key = stateKey(state.game.sense());
  window.__flappyState = state; // read by the Model X-ray at the bottom of this file

  const ckpts = new Checkpoints(document.getElementById("ckpts"), [1, 10, 25, 50, 100, 200, 400, 800, 1500], startReplay);

  // ---------- drawing ----------
  function sky() {
    const dark = ML.isDark();
    return { top: dark ? "#1d2350" : "#bfe6ff", bottom: dark ? "#2b2f66" : "#e9f7ff", pipe: "#3cbf6b", pipeDark: "#2a9452", ground: dark ? "#3a3060" : "#e8d8a8" };
  }
  function drawGame(g, flapping, label) {
    const ctx = scene.ctx, c = sky();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, c.top);
    grad.addColorStop(1, c.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // wind streaks
    if (g.gust) {
      ctx.strokeStyle = ML.isDark() ? "rgba(255,255,255,.35)" : "rgba(40,90,140,.35)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const x = (i * 71 + g.steps * 5) % (W + 40) - 20, yy = (((i * 37 + g.steps * 3 * g.gust.dir) % H) + H) % H;
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 4, yy + 18 * g.gust.dir); ctx.stroke();
      }
      ctx.fillStyle = ML.isDark() ? "#fff" : "#1f2140";
      ctx.font = "800 14px Nunito, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(g.gust.dir < 0 ? "gust: pushing UP" : "gust: pushing DOWN", W - 10, H - 12);
      ctx.textAlign = "left";
    }
    // drifting clouds
    ctx.fillStyle = ML.isDark() ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.8)";
    const t = g.steps * 0.6;
    for (let i = 0; i < 4; i++) {
      const x = ((i * 130 - t) % 520 + 520) % 520 - 60, y = 40 + (i % 2) * 50;
      ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.arc(x + 20, y - 8, 22, 0, 7); ctx.arc(x + 44, y, 16, 0, 7); ctx.fill();
    }
    // pipes
    for (const p of g.pipes) {
      const top = p.gy - g.gap / 2, bot = p.gy + g.gap / 2;
      ctx.fillStyle = c.pipe;
      ctx.strokeStyle = c.pipeDark;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(p.x, -10, PIPE_W, top + 10, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(p.x - 5, top - 18, PIPE_W + 10, 18, 5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(p.x, bot, PIPE_W, H - bot + 10, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(p.x - 5, bot, PIPE_W + 10, 18, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.fillRect(p.x + 8, -10, 6, top + 10 - 18);
      ctx.fillRect(p.x + 8, bot + 18, 6, H - bot);
    }
    // bird
    ctx.save();
    ctx.translate(BIRD_X, g.y);
    ctx.rotate(Math.max(-0.5, Math.min(1.1, g.vy * 0.09)));
    ctx.fillStyle = g.dead ? "#c9b26a" : "#ffcf3a";
    ctx.strokeStyle = "#1f2140";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, BIRD_R + 3, BIRD_R, 0, 0, 7); ctx.fill(); ctx.stroke();
    // wing
    const wing = flapping ? -6 : Math.sin(state.wingT * 0.3) * 2;
    ctx.fillStyle = "#ffe89a";
    ctx.beginPath(); ctx.ellipse(-4, 2 + wing * 0.5, 7, 4 + Math.abs(wing) * 0.3, -0.3, 0, 7); ctx.fill(); ctx.stroke();
    // eye + beak
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(6, -4, 4.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(7.5, -4, 2, 0, 7); ctx.fill();
    ctx.fillStyle = "#ff8a3d"; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(19, 3); ctx.lineTo(11, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // score
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#1f2140";
    ctx.lineWidth = 5;
    ctx.font = "700 40px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.strokeText(g.score, W / 2, 56);
    ctx.fillText(g.score, W / 2, 56);
    if (label) {
      ctx.fillStyle = "rgba(31,33,64,.8)";
      ctx.beginPath(); ctx.roundRect(10, H - 38, W - 20, 28, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 13px Nunito, sans-serif";
      ctx.fillText(label, W / 2, H - 19);
    }
  }

  // Robo's "eyes": a dashed line from the bird to the middle of the next gap.
  function drawSenses(g) {
    const ctx = scene.ctx;
    const p = g.nextPipe();
    ctx.save();
    ctx.strokeStyle = ML.cssVar("--rl");
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(BIRD_X, g.y); ctx.lineTo(p.x + PIPE_W, p.gy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ML.cssVar("--rl");
    ctx.beginPath(); ctx.arc(p.x + PIPE_W, p.gy, 5, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawHeat(k) {
    const ctx = heat.ctx;
    const rows = DY_MAX - DY_MIN + 1;
    const top = 14, cw = 280 / DX_BINS, ch = (220 - top - 14) / rows;
    ctx.clearRect(0, 0, 280, 220);
    const s = decode(k);
    for (let dx = 0; dx < DX_BINS; dx++)
      for (let dy = DY_MIN; dy <= DY_MAX; dy++) {
        const v = state.agent.Q.get(dx * 1000 + (dy + 10) * 10 + s.vy);
        const x = dx * cw, y = top + (dy - DY_MIN) * ch;
        if (!v || (v[0] === 0 && v[1] === 0)) { ctx.fillStyle = ML.cssVar("--line"); ctx.globalAlpha = 0.5; }
        else {
          ctx.fillStyle = v[1] > v[0] ? ML.cssVar("--rl") : ML.cssVar("--sup");
          ctx.globalAlpha = 0.25 + Math.min(0.75, Math.abs(v[1] - v[0]) / 40);
        }
        ctx.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      }
    ctx.globalAlpha = 1;
    ctx.fillStyle = ML.cssVar("--ink");
    ctx.strokeStyle = ML.cssVar("--card");
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.dx * cw + cw / 2, top + (s.dy - DY_MIN) * ch + ch / 2, 6, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ML.cssVar("--muted");
    ctx.font = "800 10px Nunito, sans-serif";
    ctx.textAlign = "center";
    ["pipe near", "pipe mid", "pipe far"].forEach((t, i) => ctx.fillText(t, i * cw + cw / 2, 10));
    ctx.textAlign = "left";
    ctx.fillText("gap above ↑", 4, top + 10);
    ctx.fillText("gap below ↓", 4, 216);
  }

  // ---------- inside card ----------
  let insideTick = 0;
  function renderInside(g, agent) {
    if (++insideTick % 6) return;
    const s = g.sense(), k = stateKey(s), q = agent.q(k);
    const $ = (id) => document.getElementById(id);
    $("i-gap").innerHTML = Math.abs(s.dy) < 12 ? "<b>right in front of me</b>" : s.dy < 0 ? `<b>above me</b> (${Math.round(-s.dy)} px)` : `<b>below me</b> (${Math.round(s.dy)} px)`;
    $("i-pipe").innerHTML = s.dx < 60 ? "<b>right here!</b>" : s.dx < 160 ? "<b>coming soon</b>" : "far away";
    $("i-wind-row").classList.toggle("hidden", !world.wind);
    $("i-wind").innerHTML = s.wind ? `<b>gust pushing ${s.wind < 0 ? "up" : "down"}</b>` : "calm";
    $("i-move").innerHTML = s.vy < -2 ? "<b>going up</b>" : s.vy > 4 ? "<b>falling fast</b>" : "floating";
    const max = Math.max(1, ...q.map(Math.abs));
    const win = q[1] > q[0] ? 1 : 0;
    [0, 1].forEach((a) => {
      const el = $("q-" + a);
      el.classList.toggle("win", a === win && q[0] !== q[1]);
      el.querySelector(".fill").style.width = Math.max(4, (Math.abs(q[a]) / max) * 100) + "%";
      el.querySelector(".num").textContent = q[a].toFixed(1);
    });
    const gapWord = Math.abs(s.dy) < 12 ? "the gap is level with me" : s.dy < 0 ? "the gap is above me" : "the gap is below me";
    const moveWord = s.vy > 4 ? "I'm falling fast" : s.vy < -2 ? "I'm going up" : "I'm floating";
    $("i-decide").innerHTML = q[0] === 0 && q[1] === 0
      ? `I've never been here before, so I just wait.`
      : `${gapWord} + ${moveWord} → <b>${win ? "FLAP" : "WAIT"}</b> is worth ${q[win].toFixed(1)} vs ${q[1 - win].toFixed(1)} → <b>${win ? "flap" : "wait"}!</b>`;
    drawHeat(k);
  }

  // ---------- stats ----------
  function renderStats() {
    const $ = (id) => document.getElementById(id);
    $("s-ep").textContent = state.tries;
    $("s-now").textContent = state.game.score;
    $("s-best").textContent = state.best;
    const r = state.scores.slice(-20);
    $("s-avg").textContent = r.length ? (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1) : "0";
  }

  // ---------- robo learning ----------
  function endTry(g) {
    state.tries++;
    state.scores.push(g.score);
    const newBest = g.score > state.best;
    if (newBest) state.best = g.score;
    ckpts.maybeSave(state.tries, state.agent, state.scores);
    drawChart(chart, state.scores, "", adapt.markers);
    const turbo = state.speed >= 3;
    const ad = adapt.check(state.scores);
    const hold = state.holdSayUntil && Date.now() < state.holdSayUntil; // keep big news on screen for a while
    if (!hold && !adapt.watch && !ad && (!turbo || state.tries % 25 === 0)) narrate(g, newBest);
    if (ad) {
      state.holdSayUntil = Date.now() + 6000;
      ML.say(ad.kind === "easy"
        ? `<b>${ad.label}</b> didn't slow me down much: my average is <b>${ad.now.toFixed(0)}</b> pipes, it was ${ad.before.toFixed(0)}. My old cheat-sheet still works!`
        : `I adapted to <b>${ad.label.toLowerCase()}</b>! My average dropped to about <b>${ad.low.toFixed(0)}</b> pipes, then climbed back to <b>${ad.now.toFixed(0)}</b> after ${ad.tries} more tries.`);
      document.getElementById("ch-status").textContent = ad.kind === "easy" ? `"${ad.label}" was easy for Robo. Try another!` : `Adapted to "${ad.label}" in ${ad.tries} tries. Try another!`;
      return;
    }
    if (adapt.watch && !hold && state.tries % (turbo ? 25 : 3) === 0) {
      const r = state.scores.slice(-20), now = r.reduce((a, b) => a + b, 0) / Math.max(1, r.length);
      ML.say(`<b>${adapt.watch.label}</b> is new to me, so my old cheat-sheet is often wrong. I'm re-learning: average <b>${now.toFixed(0)}</b> pipes now, ${adapt.watch.before.toFixed(0)} before. (${state.tries - adapt.watch.from} tries in)`);
      return;
    }
    const r = state.scores.slice(-20);
    if (!state.solved && r.length === 20 && r.reduce((a, b) => a + b, 0) / 20 >= 25) {
      state.solved = true;
      ML.confetti();
      ML.xray.offer("I learned to fly! X-ray my brain");
      ML.say(`I did it! My last 20 tries average <b>25+ pipes</b>, after just <b>${state.tries}</b> tries. Nobody told me how to fly. I learned from treats and ouches!`);
      if (state.speed >= 3) setSpeed(1);
    }
  }
  function narrate(g, newBest) {
    const y = g.y;
    const why = y + BIRD_R >= H ? "I fell on the ground" : y - BIRD_R <= 0 ? "I bumped the sky" : "I hit a pipe";
    if (state.speed >= 3) ML.say(`${state.tries} tries so far. Best: <b>${state.best}</b> pipes. Watch the average line climb!`);
    else if (g.score >= WIN_PIPES) ML.say(`<b>${WIN_PIPES} pipes!</b> I'm basically a pro now.`);
    else if (newBest && g.score > 0) ML.say(`New best: <b>${g.score}</b> pipe${g.score > 1 ? "s" : ""}! My scores for "flap" and "wait" are getting smarter.`);
    else if (state.tries < 5) ML.say(`Ouch, ${why}. I'll remember that was bad. Try ${state.tries + 1}…`);
    else ML.say(`${why} after ${g.score} pipe${g.score === 1 ? "" : "s"}. I'll lower the score for what I just did.`);
  }
  function roboStep() {
    const g = state.game, a = state.agent;
    const k = state.key;
    const act = a.act(k, true);
    const before = g.score;
    g.step(act === 1);
    state.lastAction = act;
    const k2 = g.dead ? k : stateKey(g.sense());
    a.learn(k, act, g.dead ? -100 : 1 + (g.score > before ? 5 : 0), k2, g.dead);
    state.key = k2;
    if (g.dead || g.score >= WIN_PIPES) {
      endTry(g);
      state.game = new Game(state.gap);
      state.key = stateKey(state.game.sense());
    }
  }

  // ---------- replay a checkpoint ----------
  function startReplay(ck) {
    state.playing = false;
    syncPlay();
    state.replay = { ck, game: new Game(state.gap), key: 0 };
    ckpts.playing = ck;
    ckpts.render();
    ML.say(`This is my brain after <b>${ck.tries}</b> ${ck.tries === 1 ? "try" : "tries"}. Watch how well it flew back then!`);
  }
  function stopReplay() {
    state.replay = null;
    ckpts.playing = null;
    ckpts.render();
  }
  function replayStep() {
    const r = state.replay, g = r.game;
    const act = r.ck.agent.act(stateKey(g.sense()), false);
    g.step(act === 1);
    state.lastAction = act;
    if (g.dead || g.score >= WIN_PIPES) {
      if (!r.said) {
        r.said = true;
        ML.say(`After ${r.ck.tries} ${r.ck.tries === 1 ? "try" : "tries"}, I passed <b>${g.score}</b> pipe${g.score === 1 ? "" : "s"}. ${r.ck.tries < 50 ? "Newer checkpoints fly much better!" : ""}`);
        setTimeout(() => { if (state.replay === r) { r.game = new Game(state.gap); r.said = false; } }, 1400);
      }
    }
  }

  // ---------- you try ----------
  function youFlap() {
    if (state.mode !== "you") return;
    const g = state.you;
    if (g.dead) {
      state.you = new Game(state.gap);
      state.youStarted = false;
      return;
    }
    state.youStarted = true;
    state.youFlapNow = true;
  }
  function youStep() {
    const g = state.you;
    if (!state.youStarted || g.dead) return;
    const before = g.score;
    g.step(!!state.youFlapNow);
    state.lastAction = state.youFlapNow ? 1 : 0;
    state.youFlapNow = false;
    if (g.score > before && g.score > state.youBest) state.youBest = g.score;
    if (g.dead) {
      if (g.score === 0) ML.say(`Bonk! It's tricky, right? Tap again to retry.`);
      else ML.say(`You passed <b>${g.score}</b> pipe${g.score > 1 ? "s" : ""}! Now try <b>Robo learns</b> and see if a robot can beat that.`);
    }
    document.getElementById("h-now").textContent = g.score;
    document.getElementById("h-best").textContent = state.youBest;
  }
  document.getElementById("scene").addEventListener("pointerdown", (e) => { e.preventDefault(); youFlap(); });
  document.getElementById("flap-btn").addEventListener("click", youFlap);
  document.addEventListener("keydown", (e) => {
    if (state.mode !== "you" || (e.code !== "Space" && e.code !== "ArrowUp")) return;
    e.preventDefault();
    youFlap();
  });

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Practise`; }
  playBtn.addEventListener("click", () => {
    if (state.replay) stopReplay();
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.tries === 0) ML.say(`My table is empty, so at first I won't even flap. Watch me crash… and learn!`);
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.agent = new Agent();
    state.agent.epsilon = +document.getElementById("eps").value;
    state.game = new Game(state.gap);
    state.key = stateKey(state.game.sense());
    state.tries = 0; state.best = 0; state.scores = []; state.solved = false;
    adapt.clear();
    stopReplay();
    ckpts.clear();
    drawChart(chart, state.scores, "", adapt.markers);
    ML.say(`I forgot everything! My cheat-sheet is blank again.`);
  });
  function setSpeed(i) {
    state.speed = i;
    const el = document.getElementById("speed");
    el.value = i;
    document.querySelector('[data-for="speed"]').textContent = SPEEDS[i].name;
  }
  ML.bindRange("#speed", (v) => SPEEDS[v].name, (v) => (state.speed = v));
  ML.bindRange("#eps", (v) => Math.round(v * 100) + "%", (v) => (state.agent.epsilon = v));
  // ---------- challenges ----------
  const CH = {
    wind: { label: "Wind gusts", on: `Whoosh! <b>Wind gusts</b> now push me up or down. I can feel the wind, but I've never practised in it. Watch my score drop… then climb.`, off: `Wind off. Calm skies again.` },
    bob: { label: "Moving pipes", on: `The <b>pipes are moving</b> up and down now! My aim was tuned for still pipes, so I'll crash until I re-learn.`, off: `Pipes stand still again.` },
    small: { label: "Smaller gaps", on: `<b>Smaller gaps!</b> My old cheat-sheet was made for big gaps, so I'll crash more until I re-learn.`, off: `Big gaps again. Easier!` },
  };
  document.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.ch;
    const on = !b.classList.contains("on");
    b.classList.toggle("on", on);
    if (k === "small") state.gap = on ? 95 : 120;
    else world[k] = on;
    state.game = new Game(state.gap);
    state.key = stateKey(state.game.sense());
    state.you = new Game(state.gap);
    state.youStarted = false;
    if (on) {
      adapt.mark(CH[k].label, state.scores);
      document.getElementById("ch-status").textContent = `"${CH[k].label}" is on. Watch the red line on the chart.`;
      if (state.mode === "robo" && !state.playing && !state.replay) { state.playing = true; syncPlay(); }
    }
    drawChart(chart, state.scores, "", adapt.markers);
    ML.say(on ? CH[k].on : CH[k].off);
  }));
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x === b));
    state.mode = b.dataset.mode;
    const robo = state.mode === "robo";
    document.getElementById("you-card").classList.toggle("hidden", robo);
    document.getElementById("robo-card").classList.toggle("hidden", !robo);
    document.getElementById("challenge-card").classList.toggle("hidden", !robo);
    document.getElementById("inside-card").classList.toggle("hidden", !robo);
    document.getElementById("mode-chip").textContent = robo ? "Robo gets treats for staying alive" : "Tap or Space to flap";
    if (!robo) { state.playing = false; syncPlay(); stopReplay(); }
    ML.say(robo ? `My turn! Press <b>Practise</b>. I start knowing nothing at all.` : `Your turn! Tap to flap.`);
  }));

  // ---------- main loop ----------
  function frame() {
    state.wingT++;
    if (state.mode === "you") {
      youStep();
      const g = state.you;
      drawGame(g, state.lastAction === 1, !state.youStarted ? "Tap or press Space to start" : g.dead ? "Bonk! Tap to try again" : "");
    } else if (state.replay) {
      replayStep();
      drawGame(state.replay.game, state.lastAction === 1, `Replaying checkpoint: after ${state.replay.ck.tries} tries`);
      drawSenses(state.replay.game);
      renderInside(state.replay.game, state.replay.ck.agent);
    } else {
      if (state.playing) {
        const sp = SPEEDS[state.speed].steps;
        if (sp >= 1000) {
          const t0 = performance.now();
          while (performance.now() - t0 < 12) for (let i = 0; i < 200; i++) roboStep();
        } else {
          state.acc += sp;
          while (state.acc >= 1) { roboStep(); state.acc--; }
        }
      }
      drawGame(state.game, state.lastAction === 1, state.playing ? "" : "Press Practise to start");
      drawSenses(state.game);
      renderInside(state.game, state.agent);
      renderStats();
    }
    requestAnimationFrame(frame);
  }
  drawChart(chart, state.scores, "", adapt.markers);
  syncPlay();
  requestAnimationFrame(frame);
})();

// ---------- Model X-ray ----------
(function () {
  const F = window.FlappyRL;
  const st = window.__flappyState;
  if (!st) return;
  const seen = [];
  setInterval(() => {
    const g = st.game;
    if (st.mode === "robo" && g && !g.dead) {
      const s = g.sense();
      seen.push([s.dx, s.dy, s.vy, s.wind || 0]);
      if (seen.length > 500) seen.shift();
    }
  }, 60);
  const toS = (x) => ({ dx: x[0], dy: x[1], vy: x[2], wind: Math.round(x[3]) });
  const qOf = (k) => st.agent.Q.get(k) || [0, 0];
  ML.xray.register({
    title: "The bird's cheat-sheet",
    kind: "Q-table",
    summary: () => `learned from ${st.tries} tries`,
    size: () => `${st.agent.Q.size} situations`,
    stats: () => [["Tries", st.tries], ["Best", `${st.best} pipes`], ["Choices", "wait or flap"]],
    inputs: [
      { name: "Distance to pipe", min: 0, max: 280, describe: (v) => (v < 60 ? "near" : v < 140 ? "middle" : "far") },
      { name: "Gap height", min: -130, max: 130, describe: (v) => (Math.abs(v) < 8 ? "level" : v < 0 ? `${Math.round(-v)} px above` : `${Math.round(v)} px below`) },
      { name: "Fall speed", min: -7, max: 9, describe: (v) => (v < -2 ? "going up" : v > 4 ? "falling fast" : "floating") },
      { name: "Wind", min: -1, max: 1, step: 1, describe: (v) => (Math.round(v) < 0 ? "pushing up" : Math.round(v) > 0 ? "pushing down" : "calm") },
    ],
    outputs: [{ name: "Wait", color: ML.cssVar("--sup") }, { name: "Flap", color: ML.cssVar("--rl") }],
    predict: (x) => qOf(F.stateKey(toS(x))),
    samples: () => seen,
    current: () => { const s = st.game && st.game.sense(); return s ? [s.dx, s.dy, s.vy, s.wind || 0] : null; },
    brainHeight: 260,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), W = cv.width, H = cv.height;
      const rows = F.DY_MAX - F.DY_MIN + 1, cols = F.DX_BINS * 5, top = 26, left = 70;
      const cw = (W - left - 10) / cols, ch = (H - top - 10) / rows;
      c.font = "800 12px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted"); c.textAlign = "center";
      ["pipe near", "pipe middle", "pipe far"].forEach((t, i) => c.fillText(t, left + (i + 0.5) * 5 * cw, 16));
      c.textAlign = "right"; c.fillText("gap above", left - 6, top + 12); c.fillText("gap below", left - 6, H - 14);
      for (let dx = 0; dx < F.DX_BINS; dx++)
        for (let vy = 0; vy < 5; vy++)
          for (let dy = F.DY_MIN; dy <= F.DY_MAX; dy++) {
            const v = st.agent.Q.get(dx * 1000 + (dy + 10) * 10 + vy);
            const x = left + (dx * 5 + vy) * cw, y = top + (dy - F.DY_MIN) * ch;
            if (!v || (v[0] === 0 && v[1] === 0)) { c.fillStyle = ML.cssVar("--line"); c.globalAlpha = 0.4; }
            else { c.fillStyle = v[1] > v[0] ? ML.cssVar("--rl") : ML.cssVar("--sup"); c.globalAlpha = 0.3 + Math.min(0.7, Math.abs(v[1] - v[0]) / 30); }
            c.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
          }
      c.globalAlpha = 1;
    },
    brainCaption: "The whole brain is this table (calm wind shown). Orange = flap, blue = wait, grey = never visited. Inside each pipe-distance block, columns go from rising (left) to falling fast (right).",
    notes: ["There is no maths formula in here, just a giant cheat-sheet of scores that got nudged after every crash and every pipe."],
  });
  ML.xray.button(document.getElementById("play").parentElement);
})();
