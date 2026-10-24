// Snake Learns to Eat — play it yourself, then watch tabular Q-learning learn it.
(function () {
  const { N, DIRS, Game, Agent, stateKey } = window.SnakeRL;
  const { drawChart, Checkpoints, Adapt } = window.RLGames;
  const world = window.SnakeRL.world;
  const adapt = new Adapt(0.65); // rocks make the game harder for good, so "adapted" = back to 65%

  const S = 400;
  let CELL = S / N; // changes with the "bigger garden" challenge
  const scene = ML.setupCanvas(document.getElementById("scene"), S, S);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 110);

  const SPEEDS = [
    { name: "0.5× slow-mo", steps: 0.175 }, // half of Real time (0.35)
    { name: "Real time", steps: 0.35 },
    { name: "Fast", steps: 2 },
    { name: "Super fast", steps: 40 },
    { name: "Turbo", steps: 3000 },
  ];

  const state = {
    mode: "you",
    you: new Game(),
    youStarted: false,
    youDir: null,
    youBest: 0,
    youAcc: 0,
    agent: new Agent(),
    game: new Game(),
    playing: false,
    speed: 2,
    acc: 0,
    tries: 0,
    best: 0,
    scores: [],
    auto: true,
    replay: null,
    solved: false,
  };
  state.agent.epsilon = 0.1;
  window.__snakeState = state; // read by the Model X-ray at the bottom of this file

  const ckpts = new Checkpoints(document.getElementById("ckpts"), [1, 10, 25, 50, 100, 200, 300, 500, 800], startReplay);

  // ---------- drawing ----------
  function drawGame(g, label, showSenses) {
    const ctx = scene.ctx;
    const dark = ML.isDark();
    CELL = S / g.n;
    for (let x = 0; x < g.n; x++)
      for (let y = 0; y < g.n; y++) {
        ctx.fillStyle = (x + y) % 2 ? (dark ? "#23284f" : "#d7efc8") : (dark ? "#1e2246" : "#cbe8b9");
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    // rocks
    for (const r of g.rocks) {
      const rx = r.x * CELL + CELL / 2, ry = r.y * CELL + CELL / 2;
      ctx.fillStyle = dark ? "#7d7f95" : "#9a9cb0"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx - CELL * 0.4, ry + CELL * 0.3); ctx.lineTo(rx - CELL * 0.3, ry - CELL * 0.2); ctx.lineTo(rx, ry - CELL * 0.38);
      ctx.lineTo(rx + CELL * 0.35, ry - CELL * 0.15); ctx.lineTo(rx + CELL * 0.4, ry + CELL * 0.3); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    // walls that wrap around: dashed green edge
    if (g.wrap) {
      ctx.strokeStyle = ML.cssVar("--good"); ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
      ctx.strokeRect(2, 2, S - 4, S - 4); ctx.setLineDash([]);
    }
    if (showSenses && !g.dead) drawSenses(g);
    // apple
    const fx = g.food.x * CELL + CELL / 2, fy = g.food.y * CELL + CELL / 2;
    ctx.fillStyle = "#ff4d5e";
    ctx.strokeStyle = "#1f2140";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(fx, fy + 1, CELL * 0.36, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#6b4a2b"; ctx.beginPath(); ctx.moveTo(fx, fy - CELL * 0.3); ctx.lineTo(fx + 2, fy - CELL * 0.48); ctx.stroke();
    ctx.fillStyle = "#2fbf62"; ctx.beginPath(); ctx.ellipse(fx + 6, fy - CELL * 0.4, 5, 2.6, -0.5, 0, 7); ctx.fill();
    // snake body as a thick rounded path
    const pts = g.snake.map((s) => [s.x * CELL + CELL / 2, s.y * CELL + CELL / 2]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2140";
    ctx.lineWidth = CELL * 0.78;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = g.dead ? "#9c9fb5" : ML.cssVar("--accent");
    ctx.lineWidth = CELL * 0.62;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    // head
    const [hx, hy] = pts[0];
    const [dx, dy] = DIRS[g.dir];
    ctx.fillStyle = g.dead ? "#9c9fb5" : ML.cssVar("--accent");
    ctx.strokeStyle = "#1f2140";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx, hy, CELL * 0.44, 0, 7); ctx.fill(); ctx.stroke();
    const px = -dy, py = dx; // sideways
    for (const side of [-1, 1]) {
      const ex = hx + dx * 4 + px * side * 5, ey = hy + dy * 4 + py * side * 5;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, 3.6, 0, 7); ctx.fill();
      ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(ex + dx * 1.2, ey + dy * 1.2, g.dead ? 0.8 : 1.8, 0, 7); ctx.fill();
    }
    // score
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#1f2140";
    ctx.lineWidth = 5;
    ctx.font = "700 30px Fredoka, sans-serif";
    ctx.textAlign = "right";
    ctx.strokeText(g.score, S - 12, 38);
    ctx.fillText(g.score, S - 12, 38);
    if (label) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(31,33,64,.82)";
      ctx.beginPath(); ctx.roundRect(10, S - 38, S - 20, 28, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 13px Nunito, sans-serif";
      ctx.fillText(label, S / 2, S - 19);
    }
  }
  // Light up the three cells the snake "feels" for danger.
  function drawSenses(g) {
    const ctx = scene.ctx;
    const s = g.sense();
    const h = g.snake[0];
    [[g.dir, s.dangerStraight], [(g.dir + 1) % 4, s.dangerRight], [(g.dir + 3) % 4, s.dangerLeft]].forEach(([d, danger]) => {
      const [dx, dy] = DIRS[d];
      const x = h.x + dx, y = h.y + dy;
      ctx.fillStyle = danger ? "rgba(255,77,94,.55)" : "rgba(255,255,255,.35)";
      ctx.strokeStyle = danger ? "#ff4d5e" : "rgba(31,33,64,.25)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, 5); ctx.fill(); ctx.stroke();
    });
  }

  // ---------- inside card ----------
  let insideTick = 0;
  function renderInside(g, agent) {
    if (++insideTick % 4 || g.dead) return;
    const s = g.sense(), q = agent.q(stateKey(s));
    const $ = (id) => document.getElementById(id);
    $("d-straight").classList.toggle("on", s.dangerStraight);
    $("d-left").classList.toggle("on", s.dangerLeft);
    $("d-right").classList.toggle("on", s.dangerRight);
    $("f-up").classList.toggle("on", s.foodUp);
    $("f-down").classList.toggle("on", s.foodDown);
    $("f-left").classList.toggle("on", s.foodLeft);
    $("f-right").classList.toggle("on", s.foodRight);
    let best = 0;
    for (let i = 1; i < 3; i++) if (q[i] > q[best]) best = i;
    const max = Math.max(1, ...q.map(Math.abs));
    [0, 1, 2].forEach((a) => {
      const el = $("q-" + a);
      el.classList.toggle("win", a === best);
      el.querySelector(".fill").style.width = Math.max(4, (Math.abs(q[a]) / max) * 100) + "%";
      el.querySelector(".num").textContent = q[a].toFixed(1);
    });
    const names = ["go STRAIGHT", "turn RIGHT", "turn LEFT"];
    const dangers = [s.dangerStraight && "ahead", s.dangerLeft && "left", s.dangerRight && "right"].filter(Boolean);
    const absFood = [s.foodUp && "up", s.foodDown && "down", s.foodLeft && "left", s.foodRight && "right"].filter(Boolean);
    const feel = `${dangers.length ? "danger " + dangers.join(" + ") : "no danger"}, apple is ${absFood.join("-") || "here"}`;
    const others = [0, 1, 2].filter((a) => a !== best).map((a) => q[a].toFixed(1)).join(" / ");
    $("i-decide").innerHTML = q.every((v) => v === 0)
      ? `I've never felt this before, so I just go straight.`
      : `${feel} → <b>${names[best]}</b> is worth ${q[best].toFixed(1)} vs ${others} → <b>${names[best].toLowerCase()}!</b>`;
  }

  // ---------- robo ----------
  function renderStats() {
    const $ = (id) => document.getElementById(id);
    $("s-ep").textContent = state.tries;
    $("s-now").textContent = state.game.score;
    $("s-best").textContent = state.best;
    const r = state.scores.slice(-20);
    $("s-avg").textContent = r.length ? (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1) : "0";
  }
  function endTry(g) {
    state.tries++;
    state.scores.push(g.score);
    const newBest = g.score > state.best;
    if (newBest) state.best = g.score;
    if (state.auto) {
      state.agent.epsilon = Math.max(0.005, 0.1 * (1 - state.tries / 300));
      const el = document.getElementById("eps");
      el.value = state.agent.epsilon;
      document.querySelector('[data-for="eps"]').textContent = Math.round(state.agent.epsilon * 100) + "%";
    }
    ckpts.maybeSave(state.tries, state.agent, state.scores);
    drawChart(chart, state.scores, "", adapt.markers);
    const turbo = state.speed >= 3;
    const ad = adapt.check(state.scores);
    const hold = state.holdSayUntil && Date.now() < state.holdSayUntil;
    if (ad) {
      state.holdSayUntil = Date.now() + 6000;
      ML.say(ad.kind === "easy"
        ? `<b>${ad.label}</b> didn't slow me down much: my average is <b>${ad.now.toFixed(0)}</b> apples, it was ${ad.before.toFixed(0)}. My old cheat-sheet still works!`
        : `I adapted to <b>${ad.label.toLowerCase()}</b>! My average dropped to about <b>${ad.low.toFixed(0)}</b> apples, then climbed back to <b>${ad.now.toFixed(0)}</b> after ${ad.tries} more tries.`);
      document.getElementById("ch-status").textContent = ad.kind === "easy" ? `"${ad.label}" was easy for Robo. Try another!` : `Adapted to "${ad.label}" in ${ad.tries} games. Try another!`;
    } else if (adapt.watch && !hold && state.tries % (turbo ? 25 : 3) === 0) {
      const r = state.scores.slice(-20), now = r.reduce((a, b) => a + b, 0) / Math.max(1, r.length);
      ML.say(`<b>${adapt.watch.label}</b> is new to me. Re-learning: average <b>${now.toFixed(0)}</b> apples now, ${adapt.watch.before.toFixed(0)} before. (${state.tries - adapt.watch.from} games in)`);
    } else if (!hold && !adapt.watch && (!turbo || state.tries % 25 === 0)) narrate(g, newBest);
    const r = state.scores.slice(-20);
    if (!state.solved && r.length === 20 && r.reduce((a, b) => a + b, 0) / 20 >= 15) {
      state.solved = true;
      ML.confetti();
      ML.xray.offer("I learned to eat! X-ray my brain");
      ML.say(`Yum! My last 20 games average <b>15+ apples</b>, after <b>${state.tries}</b> tries. I learned it all from treats and ouches!`);
      if (state.speed >= 3) setSpeed(1);
    }
  }
  function narrate(g, newBest) {
    const h = g.snake[0];
    const [dx, dy] = DIRS[g.dir];
    const nx = h.x + dx, ny = h.y + dy;
    const why = g.hungry > 100 ? "I wandered too long without food" : !g.wrap && (nx < 0 || ny < 0 || nx >= g.n || ny >= g.n) ? "I bumped the wall" : g.isRock((nx + g.n) % g.n, (ny + g.n) % g.n) ? "I hit a rock" : "I bit my own tail";
    if (state.speed >= 3) ML.say(`${state.tries} games so far. Best: <b>${state.best}</b> apples. Watch the average line climb!`);
    else if (newBest && g.score > 0) ML.say(`New best: <b>${g.score}</b> apple${g.score > 1 ? "s" : ""}! ${why}, but my cheat-sheet is getting smarter.`);
    else if (state.tries < 5) ML.say(`Ouch, ${why}. That move gets a lower score now.`);
    else ML.say(`${why} after ${g.score} apple${g.score === 1 ? "" : "s"}. Next game!`);
  }
  function roboStep() {
    const g = state.game, a = state.agent;
    const k = stateKey(g.sense());
    const act = a.act(k, true);
    const r = g.step(act);
    const k2 = g.dead ? k : stateKey(g.sense());
    a.learn(k, act, r, k2, g.dead);
    if (g.dead || g.steps > 5000) {
      endTry(g);
      state.game = new Game();
    }
  }

  function startReplay(ck) {
    state.playing = false;
    syncPlay();
    state.replay = { ck, game: new Game(), acc: 0 };
    ckpts.playing = ck;
    ckpts.render();
    ML.say(`This is my brain after <b>${ck.tries}</b> ${ck.tries === 1 ? "game" : "games"}. Let's see how hungry it was!`);
  }
  function stopReplay() {
    state.replay = null;
    ckpts.playing = null;
    ckpts.render();
  }
  function replayTick() {
    const r = state.replay;
    r.acc += 0.4;
    while (r.acc >= 1) {
      r.acc--;
      const g = r.game;
      if (g.dead) continue;
      g.step(r.ck.agent.act(stateKey(g.sense()), false));
      if (g.dead || g.steps > 3000) {
        g.dead = true;
        ML.say(`After ${r.ck.tries} ${r.ck.tries === 1 ? "game" : "games"} of practice, I ate <b>${g.score}</b> apple${g.score === 1 ? "" : "s"}. ${r.ck.tries < 100 ? "Later checkpoints eat way more!" : ""}`);
        setTimeout(() => { if (state.replay === r) r.game = new Game(); }, 1400);
      }
    }
  }

  // ---------- you try ----------
  function youSteer(d) {
    if (state.mode !== "you") return;
    const g = state.you;
    if (g.dead) { state.you = new Game(); state.youStarted = false; state.youDir = null; return; }
    if ((d + 2) % 4 === g.dir) return; // can't reverse
    state.youDir = d;
    state.youStarted = true;
  }
  function youTick() {
    const g = state.you;
    if (!state.youStarted || g.dead) return;
    state.youAcc += 0.13 + Math.min(0.1, g.score * 0.005);
    if (state.youAcc < 1) return;
    state.youAcc = 0;
    let turn = 0;
    if (state.youDir !== null && state.youDir !== g.dir) turn = state.youDir === (g.dir + 1) % 4 ? 1 : 2;
    state.youDir = null;
    g.step(turn);
    if (g.score > state.youBest) state.youBest = g.score;
    document.getElementById("h-now").textContent = g.score;
    document.getElementById("h-best").textContent = state.youBest;
    if (g.dead) ML.say(g.score ? `You ate <b>${g.score}</b> apple${g.score > 1 ? "s" : ""}! Now switch to <b>Robo learns</b> and see if a robot can beat you.` : `Bonk! Steer to try again.`);
  }
  const keyDir = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
  document.addEventListener("keydown", (e) => {
    if (state.mode !== "you" || !(e.code in keyDir)) return;
    e.preventDefault();
    youSteer(keyDir[e.code]);
  });
  document.querySelectorAll(".pad [data-d]").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); youSteer(+b.dataset.d); }));

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Practise`; }
  playBtn.addEventListener("click", () => {
    if (state.replay) stopReplay();
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.tries === 0) ML.say(`My cheat-sheet is empty. I'll bump into lots of walls first. That's how I learn!`);
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.agent = new Agent();
    state.agent.epsilon = state.auto ? 0.1 : +document.getElementById("eps").value;
    state.game = new Game();
    state.tries = 0; state.best = 0; state.scores = []; state.solved = false;
    adapt.clear();
    stopReplay();
    ckpts.clear();
    drawChart(chart, state.scores, "", adapt.markers);
    ML.say(`I forgot everything! Back to bumping into walls.`);
  });
  function setSpeed(i) {
    state.speed = i;
    document.getElementById("speed").value = i;
    document.querySelector('[data-for="speed"]').textContent = SPEEDS[i].name;
  }
  let built = false;
  ML.bindRange("#speed", (v) => SPEEDS[v].name, (v) => (state.speed = v));
  ML.bindRange("#eps", (v) => Math.round(v * 100) + "%", (v) => {
    state.agent.epsilon = v;
    if (built && state.auto) { state.auto = false; syncAuto(); }
  });
  built = true;
  const autoBtn = document.getElementById("auto");
  function syncAuto() {
    autoBtn.classList.toggle("on", state.auto);
    autoBtn.innerHTML = `${ML.icon("wand")} Auto curiosity: ${state.auto ? "on" : "off"}`;
  }
  autoBtn.addEventListener("click", () => { state.auto = !state.auto; syncAuto(); });
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x === b));
    state.mode = b.dataset.mode;
    const robo = state.mode === "robo";
    document.getElementById("you-card").classList.toggle("hidden", robo);
    document.getElementById("robo-card").classList.toggle("hidden", !robo);
    document.getElementById("challenge-card").classList.toggle("hidden", !robo);
    document.getElementById("inside-card").classList.toggle("hidden", !robo);
    document.getElementById("mode-chip").textContent = robo ? "Apple = treat, crash = ouch" : "Arrow keys or buttons";
    if (!robo) { state.playing = false; syncPlay(); stopReplay(); }
    ML.say(robo ? `My turn! Press <b>Practise</b>. I start knowing nothing at all.` : `Your turn! Use the arrow keys.`);
  }));

  // ---------- challenges ----------
  const CH = {
    rocks: { label: "Rocks", on: `<b>Rocks!</b> My danger feelers will feel them, but I've never practised around rocks. Watch my score drop… then climb.`, off: `Rocks cleared away.` },
    big: { label: "Bigger garden", on: `A <b>bigger garden</b>! More room to wiggle, but apples are farther away. Will it help or hurt?`, off: `Back to the normal garden.` },
    hop: { label: "Jumpy apples", on: `<b>Jumpy apples!</b> If I'm slow, the apple hops somewhere else. I'll have to be quicker and more direct.`, off: `Apples stay put again.` },
    wrap: { label: "Walls wrap", on: `The <b>walls wrap around</b> now: go off one side and come back on the other! My old fear of walls is out of date.`, off: `Solid walls again.` },
  };
  document.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.ch;
    const on = !b.classList.contains("on");
    b.classList.toggle("on", on);
    world[k] = on;
    state.game = new Game();
    state.you = new Game();
    if (on) {
      adapt.mark(CH[k].label, state.scores);
      document.getElementById("ch-status").textContent = `"${CH[k].label}" is on. Watch the red line on the chart.`;
      if (state.mode === "robo" && !state.playing && !state.replay) { state.playing = true; syncPlay(); }
    }
    drawChart(chart, state.scores, "", adapt.markers);
    ML.say(on ? CH[k].on : CH[k].off);
  }));

  // ---------- main loop ----------
  function frame() {
    if (state.mode === "you") {
      youTick();
      const g = state.you;
      drawGame(g, !state.youStarted ? "Press an arrow key to start" : g.dead ? "Bonk! Steer to try again" : "", false);
    } else if (state.replay) {
      replayTick();
      drawGame(state.replay.game, `Replaying checkpoint: after ${state.replay.ck.tries} games`, true);
      renderInside(state.replay.game, state.replay.ck.agent);
    } else {
      if (state.playing) {
        const sp = SPEEDS[state.speed].steps;
        if (sp >= 1000) {
          const t0 = performance.now();
          while (performance.now() - t0 < 12) for (let i = 0; i < 100; i++) roboStep();
        } else {
          state.acc += sp;
          while (state.acc >= 1) { roboStep(); state.acc--; }
        }
      }
      drawGame(state.game, state.playing ? "" : "Press Practise to start", true);
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
  const R = window.SnakeRL;
  const st = window.__snakeState;
  if (!st) return;
  const seen = [];
  const vec = (s) => [+s.dangerStraight, +s.dangerRight, +s.dangerLeft, s.dir, +s.foodUp, +s.foodDown, +s.foodLeft, +s.foodRight];
  setInterval(() => {
    const g = st.game;
    if (g && !g.dead) { seen.push(vec(g.sense())); if (seen.length > 500) seen.shift(); }
  }, 60);
  const yesNo = (yes, no) => (v) => (v > 0.5 ? yes : no);
  const HEAD = ["up", "right", "down", "left"];
  const toS = (x) => ({ dangerStraight: x[0] > 0.5, dangerRight: x[1] > 0.5, dangerLeft: x[2] > 0.5, dir: Math.round(x[3]) % 4,
    foodUp: x[4] > 0.5, foodDown: x[5] > 0.5, foodLeft: x[6] > 0.5, foodRight: x[7] > 0.5 });
  ML.xray.register({
    title: "The snake's cheat-sheet",
    kind: "Q-table",
    summary: () => `learned from ${st.tries} games`,
    size: () => `${st.agent.Q.size} situations`,
    stats: () => [["Games", st.tries], ["Best", `${st.best} apples`], ["Choices", "ahead · right · left"]],
    inputs: [
      { name: "Danger ahead", min: 0, max: 1, step: 1, describe: yesNo("yes!", "no") },
      { name: "Danger right", min: 0, max: 1, step: 1, describe: yesNo("yes!", "no") },
      { name: "Danger left", min: 0, max: 1, step: 1, describe: yesNo("yes!", "no") },
      { name: "Heading", min: 0, max: 3, step: 1, describe: (v) => HEAD[Math.round(v) % 4] },
      { name: "Apple is up", min: 0, max: 1, step: 1, describe: yesNo("yes", "no") },
      { name: "Apple is down", min: 0, max: 1, step: 1, describe: yesNo("yes", "no") },
      { name: "Apple is left", min: 0, max: 1, step: 1, describe: yesNo("yes", "no") },
      { name: "Apple is right", min: 0, max: 1, step: 1, describe: yesNo("yes", "no") },
    ],
    outputs: [{ name: "Go ahead", color: ML.cssVar("--vision") }, { name: "Turn right", color: ML.cssVar("--rl") }, { name: "Turn left", color: ML.cssVar("--sup") }],
    predict: (x) => st.agent.Q.get(R.stateKey(toS(x))) || [0, 0, 0],
    samples: () => seen,
    current: () => (st.game ? vec(st.game.sense()) : null),
    brainHeight: 280,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), W = cv.width, H = cv.height;
      const DANGER = ["none", "ahead", "right", "ahead+right", "left", "ahead+left", "right+left", "all"];
      const FOOD = [["up", 1, 0, 0, 0], ["up-right", 1, 0, 0, 1], ["right", 0, 0, 0, 1], ["down-right", 0, 1, 0, 1], ["down", 0, 1, 0, 0], ["down-left", 0, 1, 1, 0], ["left", 0, 0, 1, 0], ["up-left", 1, 0, 1, 0]];
      const left = 150, top = 34, cw = (W - left - 10) / FOOD.length, ch = (H - top - 8) / DANGER.length;
      const cols = [ML.cssVar("--vision"), ML.cssVar("--rl"), ML.cssVar("--sup")];
      const dir = st.game ? st.game.dir : 0;
      c.font = "800 12px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted"); c.textAlign = "center";
      FOOD.forEach((f, i) => c.fillText("apple " + f[0], left + (i + 0.5) * cw, 22));
      c.textAlign = "right";
      DANGER.forEach((d, j) => c.fillText("danger: " + d, left - 8, top + (j + 0.6) * ch));
      for (let j = 0; j < 8; j++)
        FOOD.forEach((f, i) => {
          const q = st.agent.Q.get(R.stateKey({ dangerStraight: !!(j & 1), dangerRight: !!(j & 2), dangerLeft: !!(j & 4), dir, foodUp: !!f[1], foodDown: !!f[2], foodLeft: !!f[3], foodRight: !!f[4] }));
          const x = left + i * cw, y = top + j * ch;
          if (!q || q.every((v) => v === 0)) { c.fillStyle = ML.cssVar("--line"); c.globalAlpha = 0.4; c.fillRect(x + 1, y + 1, cw - 2, ch - 2); c.globalAlpha = 1; return; }
          const b = q.indexOf(Math.max(...q));
          c.fillStyle = cols[b]; c.globalAlpha = 0.85; c.fillRect(x + 1, y + 1, cw - 2, ch - 2); c.globalAlpha = 1;
          c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(["ahead", "right", "left"][b], x + cw / 2, y + ch / 2 + 4);
        });
    },
    brainCaption: "Rows = where danger is, columns = where the apple is. Green = go ahead, orange = turn right, blue = turn left, grey = never seen.",
    notes: ["The snake only feels 8 yes/no facts. With so few, its whole brain fits in one small table: below is every choice it would make (for its current heading)."],
  });
  ML.xray.button(document.getElementById("play").parentElement);
})();
