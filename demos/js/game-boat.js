// Boat Crosses the River — page: drawing, round loop, challenges, checkpoints, steering.
(function () {
  const { Net, nextGeneration } = window.GameNet;
  const B = window.BoatGame;
  const { W, H, BANK_TOP, BANK_BOT, SIZES, Round, Boat, River } = B;
  const POP = 60;

  const view = ML.setupCanvas(document.getElementById("river"), W, H);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 200);
  const ctx = view.ctx;

  const state = {
    playing: false,
    speed: 3,
    round: 1,
    brains: Array.from({ length: POP }, () => new Net(SIZES)),
    ch: { current: 1, wind: false, logs: false, whirl: false, moveDock: false },
    history: [], // best-half docked % per round
    markers: [],
    pending: null, // challenge waiting to be judged: { name, before, at }
    cur: null, // the running Round
    replay: null,
    human: null,
    between: 0,
    firstDock: false,
  };
  const CH_NAMES = { current: "current ×2", wind: "wind", logs: "logs", whirl: "whirlpool", moveDock: "dock moves" };
  const seedFor = (r) => r * 13 + 7;

  function newRound() {
    state.cur = new Round(state.brains, seedFor(state.round), state.ch);
  }

  // ---------- round end + narration ----------
  function endRound() {
    const r = state.cur.results();
    const pct = Math.round(r.topDocked * 100);
    state.history.push(pct);
    const champ = state.brains[r.best].clone();
    state.champ = champ; // the X-ray looks at this brain
    ckpts.add({
      label: `Round ${state.round}`,
      sub: `${pct}% docked`,
      brain: champ, seed: seedFor(state.round), ch: { ...state.ch },
      draw: (c) => drawMini(c, state.round, pct),
    });
    narrate(r, pct);
    state.brains = nextGeneration(state.brains, r.fit, { mutation: 0.3 });
    drawChart();
  }
  function narrate(r, pct) {
    const p = state.pending;
    if (p && state.round >= p.at) {
      const since = state.round - p.at;
      if (since === 0) {
        ML.say(pct < p.before - 10
          ? `Whoa! With <b>${p.name}</b>, only <b>${pct}%</b> of the best boats made it (was ${p.before}%). Their old plan doesn't work any more.`
          : `With <b>${p.name}</b>, ${pct}% of the best boats still made it. Tough sailors! Watch the next rounds.`);
        p.low = pct;
      } else if (pct >= Math.min(90, p.before - 5) && p.low < p.before - 10) {
        ML.say(`They <b>adapted</b>! After ${since} more round${since > 1 ? "s" : ""}, <b>${pct}%</b> of the best boats reach the dock again, even with ${p.name}.`);
        ML.confetti(40);
        ML.xray.offer("They adapted! X-ray the champion\u2019s brain");
        state.pending = null;
      } else if (since >= 12) {
        ML.say(`${p.name} is really hard. ${pct}% now. Keep going, or try one challenge at a time.`);
        state.pending = null;
      } else ML.say(`Round ${state.round}: ${pct}% of the best half docked. The fleet is still figuring out ${p.name}…`);
      return;
    }
    if (state.speed === 0 && state.round % 10 && state.firstDock) return; // keep Turbo chatter calm
    if (r.docked > 0 && !state.firstDock) {
      state.firstDock = true;
      ML.say(`Round ${state.round}: a boat reached the dock! Its brain will be copied into lots of new boats.`);
    } else if (state.round === 1) ML.say(`Round 1: random brains, so boats wander, bonk rocks and get swept away. That's how learning starts!`);
    else if (pct >= 90 && (ML.xray.offer("The boats can dock! X-ray the champion\u2019s brain"), true)) ML.say(`Round ${state.round}: <b>${pct}%</b> of the best boats dock. They've got it! Try a <b>challenge</b> to see them adapt.`);
    else ML.say(`Round ${state.round}: ${pct}% of the best half reached the dock. ${pct > 40 ? "Getting better!" : "Still learning to beat the current."}`);
  }

  // ---------- drawing ----------
  let t = 0;
  function drawRiver(river) {
    t++;
    // banks
    ctx.fillStyle = ML.isDark() ? "#3b3a2a" : "#e9d9a6";
    ctx.fillRect(0, 0, W, BANK_TOP);
    ctx.fillRect(0, BANK_BOT, W, H - BANK_BOT);
    ctx.fillStyle = ML.isDark() ? "#2c4a35" : "#9fd38a";
    ctx.fillRect(0, 0, W, BANK_TOP - 14);
    ctx.fillRect(0, BANK_BOT + 14, W, H - BANK_BOT - 14);
    // water
    const g = ctx.createLinearGradient(0, BANK_TOP, 0, BANK_BOT);
    g.addColorStop(0, ML.isDark() ? "#1e4f74" : "#7cc6ef");
    g.addColorStop(0.5, ML.isDark() ? "#173f61" : "#4aa9e0");
    g.addColorStop(1, ML.isDark() ? "#1e4f74" : "#7cc6ef");
    ctx.fillStyle = g;
    ctx.fillRect(0, BANK_TOP, W, BANK_BOT - BANK_TOP);
    // ripples drift with the current
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 2;
    for (let row = 0; row < 9; row++) {
      const y = BANK_TOP + 18 + row * ((BANK_BOT - BANK_TOP - 30) / 8);
      const c = river.current(W / 2, y).vx;
      for (let k = 0; k < 6; k++) {
        const x = (((k * 120 + row * 37 + t * c * 1.2) % (W + 60)) + W + 60) % (W + 60) - 30;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 9, y - 4, x + 18, y); ctx.stroke();
      }
    }
    // whirlpool
    if (river.whirl) {
      const w = river.whirl;
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let a = 0; a < 9; a += 0.2) {
          const rr = (w.r * (1 - a / 9.5)) * (0.65 + 0.12 * k);
          const x = w.x + Math.cos(a + t * 0.05 + k * 2) * rr, y = w.y + Math.sin(a + t * 0.05 + k * 2) * rr;
          a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    // dock
    const d = river.dock;
    ctx.fillStyle = "#9a6a3f";
    ctx.fillRect(d.x - 26, BANK_TOP - 18, 52, 26);
    ctx.strokeStyle = "#6e4826"; ctx.lineWidth = 2;
    for (let i = -20; i <= 20; i += 10) { ctx.beginPath(); ctx.moveTo(d.x + i, BANK_TOP - 18); ctx.lineTo(d.x + i, BANK_TOP + 8); ctx.stroke(); }
    ctx.fillStyle = "#1f2140"; ctx.fillRect(d.x + 20, BANK_TOP - 44, 3, 28);
    ctx.fillStyle = ML.cssVar("--bad");
    ctx.beginPath(); ctx.moveTo(d.x + 23, BANK_TOP - 44); ctx.lineTo(d.x + 40, BANK_TOP - 38); ctx.lineTo(d.x + 23, BANK_TOP - 32); ctx.fill();
    // start jetty
    ctx.fillStyle = "#9a6a3f";
    ctx.fillRect(B.START.x - 22, BANK_BOT - 4, 44, 18);
    // rocks + logs
    for (const r of river.rocks) {
      ctx.fillStyle = "#8a8fa3"; ctx.strokeStyle = "#5a5f73"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.arc(r.x - r.r * 0.3, r.y - r.r * 0.3, r.r * 0.3, 0, 7); ctx.fill();
    }
    for (const l of river.logs) {
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.ang);
      ctx.fillStyle = "#8b5a2b"; ctx.strokeStyle = "#5c3a1a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-l.len / 2, -8, l.len, 16, 8); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // wind streaks
    const w = river.wind();
    if (river.ch.wind) {
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.lineWidth = 2;
      const strength = Math.hypot(w.wx, w.wy);
      for (let k = 0; k < 6; k++) {
        const x = (((W - (t * 3 + k * 110)) % W) + W) % W, y = 70 + k * 50;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 16 + strength * 14, y + w.wy * 6); ctx.stroke();
      }
    }
  }

  function drawBoat(b, color, alpha, lead) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#1f2140";
    ctx.lineWidth = lead ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.quadraticCurveTo(4, -8, -10, -6); ctx.lineTo(-10, 6); ctx.quadraticCurveTo(4, 8, 14, 0);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-5, -3, 7, 6);
    ctx.restore();
    if (lead && !b.dead && !b.docked) {
      // wake
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x - Math.cos(b.a) * 14, b.y - Math.sin(b.a) * 14, 4 + (t % 10), Math.PI * 0.6 + b.a, Math.PI * 1.4 + b.a); ctx.stroke();
    }
  }

  function drawRays(b) {
    for (let i = 0; i < B.RAYS; i++) {
      const ang = b.a + (i / (B.RAYS - 1) - 0.5) * Math.PI * 0.9;
      const len = B.RAY_LEN * b.rays[i];
      ctx.strokeStyle = b.rays[i] < 1 ? ML.cssVar("--rl") : "rgba(255,226,122,.85)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len); ctx.stroke();
    }
  }

  function draw() {
    const run = state.human || state.replay || state.cur;
    drawRiver(run.river);
    if (state.human) {
      const b = state.human.boat;
      drawRays(b);
      drawBoat(b, "#ff8a3d", 1, true);
      label(b.docked ? "You docked! Press any arrow to go again" : b.dead ? "Bonk! Press any arrow to try again" : "You're steering");
      return;
    }
    const boats = run.boats;
    const lead = run.leader();
    for (const b of window.__showBabies !== false ? boats : []) {
      if (b === lead) continue;
      if (b.dead) continue;
      drawBoat(b, b.docked ? ML.cssVar("--good") : "#ffffff", b.docked ? 0.9 : 0.35, false);
    }
    if (lead) { if (!lead.dead && !lead.docked) drawRays(lead); drawBoat(lead, lead.docked ? ML.cssVar("--good") : "#ff8a3d", 1, true); }
    if (state.replay) label(`Replaying: champion of ${state.replay.item.label}`);
  }
  function label(text) {
    ctx.fillStyle = "rgba(31,33,64,.82)";
    ctx.beginPath(); ctx.roundRect(10, H - 34, Math.min(W - 20, text.length * 7.4 + 24), 26, 9); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "left";
    ctx.fillText(text, 22, H - 16);
  }

  function drawMini(c, round, pct) {
    const g = c.getContext("2d");
    g.fillStyle = "#4aa9e0"; g.fillRect(0, 0, 216, 120);
    g.fillStyle = "#e9d9a6"; g.fillRect(0, 0, 216, 18); g.fillRect(0, 102, 216, 18);
    g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(14, 50, 188, 18);
    g.fillStyle = pct >= 80 ? "#2fbf62" : "#ff8a3d"; g.fillRect(14, 50, 188 * pct / 100, 18);
    g.fillStyle = "#1f2140"; g.font = "800 15px Nunito, sans-serif"; g.textAlign = "center";
    g.fillText(`${pct}%`, 108, 90);
  }

  function drawChart() {
    GameLab.drawChart(chart, [{ values: state.history, color: "--accent" }], state.markers, 100, "%");
  }

  // ---------- inside card ----------
  let tick = 0;
  function renderInside() {
    if (++tick % 10) return;
    const run = state.replay || state.cur;
    const b = state.human ? state.human.boat : run && run.leader();
    if (!b || !b.input.length) return;
    const names = ["far left", "left", "ahead", "right", "far right"];
    const near = b.rays.map((r, i) => [r, i]).filter(([r]) => r < 1).sort((a, c) => a[0] - c[0])[0];
    const eye = near ? `Feeler <b>${names[near[1]]}</b> touches ${near[0] < 0.35 ? "something very close" : "something"} (${(1 - near[0]).toFixed(2)})` : "All feelers clear: <b>open water</b>";
    const rel = Math.atan2(b.input[B.RAYS], b.input[B.RAYS + 1]);
    const dockDir = Math.abs(rel) < 0.3 ? "straight ahead" : rel < 0 ? "to the left" : "to the right";
    const push = b.input[B.RAYS + 3];
    const pushTxt = push > 0.35 ? "pushes me <b>downstream</b> hard" : push > 0.1 ? "pushes me downstream" : push < -0.1 ? "pushes me <b>upstream</b>" : "is calm here";
    const thr = Math.round((b.throttle ?? 0) * 100), rud = b.rudder ?? 0;
    const turn = Math.abs(rud) < 0.15 ? "keeps straight" : rud < 0 ? "turns left" : "turns right";
    document.getElementById("inside").innerHTML = `<div>${ML.icon("eye")} ${eye}</div>
      <div>${ML.icon("flag")} Dock is <b>${dockDir}</b>, ${Math.round(b.input[B.RAYS + 2] * 400)} px away</div>
      <div>${ML.icon("wave")} The water ${pushTxt}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("cpu")} Brain says: engine <b>${thr}%</b> and <b style="color:var(--accent)">${turn}</b></div>`;
  }

  // ---------- replay + steering ----------
  const ckpts = new GameLab.Checkpoints(document.getElementById("ckpts"), (item) => {
    state.playing = false;
    syncPlay();
    state.replay = new Round([item.brain], item.seed, { ...state.ch });
    state.replay.item = item;
    ML.say(`This is the champion from <b>${item.label}</b>, sailing on today's river${Object.values(state.ch).some((v) => v === true || v === 2) ? " (with today's challenges)" : ""}.`);
  }, () => { state.replay = null; });

  const keys = { up: false, down: false, left: false, right: false };
  function startHuman() {
    const river = new River(seedFor(state.round), state.ch);
    state.human = { river, boat: new Boat(null), thr: 0.5 };
  }
  function humanStep() {
    const h = state.human, b = h.boat;
    if (b.dead || b.docked) {
      if (keys.up || keys.left || keys.right || keys.down) { if (!h.wait) startHuman(); }
      else h.wait = false;
      return;
    }
    if (keys.up) h.thr = Math.min(1, h.thr + 0.03);
    if (keys.down) h.thr = Math.max(0, h.thr - 0.03);
    h.river.step();
    b.step(h.river, { throttle: h.thr, rudder: (keys.right ? 1 : 0) - (keys.left ? 1 : 0) });
    if (b.docked) { ML.confetti(40); ML.say(`You docked in ${b.steps} steps! Now let the boats try with the same challenges.`); h.wait = true; }
    else if (b.dead) { ML.say(`Bonk! Hard, right? The boats learn this with no teacher at all.`); h.wait = true; }
  }
  const keyMap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  document.addEventListener("keydown", (e) => { if (state.human && keyMap[e.code]) { e.preventDefault(); keys[keyMap[e.code]] = true; } });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });
  document.querySelectorAll("#pad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); keys[k] = true; });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => (keys[k] = false)));
  });
  const steerBtn = document.getElementById("steer");
  steerBtn.addEventListener("click", () => {
    if (state.human) {
      state.human = null;
      document.getElementById("pad").classList.remove("show");
      steerBtn.innerHTML = `${ML.icon("gamepad")} I'll steer a boat`;
      ML.say(`Back to the fleet! Press <b>Play</b>.`);
      return;
    }
    state.playing = false;
    syncPlay();
    state.replay = null;
    startHuman();
    document.getElementById("pad").classList.add("show");
    steerBtn.innerHTML = `${ML.icon("x")} Stop steering`;
    document.querySelector(".canvas-box").scrollIntoView({ behavior: "smooth", block: "start" });
    ML.say(`Your turn! <b>Up/down</b> = engine, <b>left/right</b> = steer. Watch out: the river pushes you sideways.`);
  });

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    if (state.human) steerBtn.click();
    if (state.replay) { state.replay = null; ckpts.active = null; ckpts.render(); }
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.round === 1 && state.cur.steps === 0) ML.say(`Round 1! ${POP} boats with random brains. Let's see who gets across…`);
  });
  document.getElementById("skip").addEventListener("click", () => {
    if (state.human || state.replay) return;
    state.cur.run();
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.brains = Array.from({ length: POP }, () => new Net(SIZES));
    state.round = 1;
    state.history = [];
    state.markers = [];
    state.pending = null;
    state.firstDock = false;
    ckpts.clear();
    newRound();
    drawChart();
    ML.say(`All learning erased. Back to ${POP} silly baby boats!`);
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));
  document.querySelectorAll("#chal button").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    if (c === "current") state.ch.current = state.ch.current === 2 ? 1 : 2;
    else state.ch[c] = !state.ch[c];
    const on = c === "current" ? state.ch.current === 2 : state.ch[c];
    b.classList.toggle("on", on);
    if (on) {
      const before = state.history.length ? Math.round(state.history.slice(-3).reduce((a, x) => a + x, 0) / Math.min(3, state.history.length)) : 0;
      state.markers.push({ at: state.history.length + 1, label: CH_NAMES[c] });
      state.pending = { name: CH_NAMES[c], before, at: state.round + 1 }; // the running round still uses the old river
      ML.say(`<b>${CH_NAMES[c][0].toUpperCase() + CH_NAMES[c].slice(1)}</b> starts next round! Their brains were tuned for the old river. Will they cope?`);
    } else ML.say(`${CH_NAMES[c]} switched off.`);
    if (state.human) startHuman();
    drawChart();
  }));

  // ---------- loop ----------
  newRound();
  drawChart();
  ckpts.render();
  syncPlay();
  function frame() {
    if (state.human) humanStep();
    else if (state.replay) {
      for (let i = 0; i < Math.max(1, state.speed); i++) state.replay.step();
      if (state.replay.done && !state.replay.restart) {
        state.replay.restart = setTimeout(() => {
          if (!state.replay) return;
          const it = state.replay.item;
          state.replay = new Round([it.brain], it.seed, { ...state.ch });
          state.replay.item = it;
        }, 1200);
      }
    } else if (state.playing) {
      if (state.between > 0) state.between--;
      else if (state.speed === 0) {
        // Turbo: a few hundred steps a frame (several rounds a second) so you can still follow the chart.
        for (let i = 0; i < 240; i++) {
          state.cur.step();
          if (state.cur.done) { endRound(); state.round++; newRound(); state.between = 8; break; }
        }
      } else {
        for (let i = 0, n = ML.ticks(state.speed); i < n && !state.cur.done; i++) state.cur.step();
        if (state.cur.done) {
          endRound();
          state.round++;
          newRound();
          state.between = 30;
          const o = document.getElementById("overlay");
          o.textContent = `Round ${state.round}`;
          o.classList.add("show");
          setTimeout(() => o.classList.remove("show"), 900);
        }
      }
    }
    draw();
    renderInside();
    const run = state.cur;
    document.getElementById("st-round").textContent = state.round;
    document.getElementById("st-docked").textContent = run.boats.filter((b) => b.docked).length;
    const last = state.history[state.history.length - 1];
    document.getElementById("st-top").innerHTML = last === undefined ? "–" : `${last}<small>%</small>`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // ---------- Model X-ray ----------
  const boatSeen = [];
  setInterval(() => {
    const b = state.cur && state.cur.boats.find((x) => !x.dead && !x.docked && x.input);
    if (b) { boatSeen.push(b.input.slice()); if (boatSeen.length > 500) boatSeen.shift(); }
  }, 80);
  const xNet = () => (state.champ || state.brains[0]).clone();
  let netNow = null;
  const EYES = ["Eye far left", "Eye left", "Eye ahead", "Eye right", "Eye far right"];
  const near = (v) => (v < 0.05 ? "clear" : v > 0.6 ? "very close" : v > 0.3 ? "close" : "far");
  ML.xray.register({
    title: "The champion boat's brain",
    kind: "Neural network",
    summary: () => `evolved over ${state.round - 1} rounds`,
    size: () => `${(state.champ || state.brains[0]).genes.length} knobs`,
    stats: () => [["Rounds", state.round - 1], ["Best docked", `${Math.max(0, ...state.history)}%`], ["Layers", (state.champ || state.brains[0]).sizes.join(" → ")]],
    inputs: [
      ...EYES.map((n) => ({ name: n, min: 0, max: 1, describe: near })),
      { name: "Dock to the side", min: -1, max: 1, describe: (v) => (Math.abs(v) < 0.15 ? "straight on" : v < 0 ? "to my left" : "to my right") },
      { name: "Dock in front", min: -1, max: 1, describe: (v) => (v > 0.3 ? "in front" : v < -0.3 ? "behind" : "beside") },
      { name: "Dock distance", min: 0, max: 1, describe: (v) => (v < 0.2 ? "very near" : v < 0.6 ? "medium" : "far") },
      { name: "Water push sideways", min: -1, max: 1, describe: (v) => (Math.abs(v) < 0.1 ? "calm" : v < 0 ? "pushing left" : "pushing right") },
      { name: "Water push up/down", min: -1, max: 1, describe: (v) => (Math.abs(v) < 0.1 ? "calm" : v < 0 ? "pushing up" : "pushing down") },
      { name: "Speed", min: 0, max: 1, describe: (v) => `${Math.round(v * 100)}%` },
    ],
    outputs: [{ name: "Steer left", color: ML.cssVar("--sup") }, { name: "Go straight", color: ML.cssVar("--vision") }, { name: "Steer right", color: ML.cssVar("--rl") }],
    predict: (x) => { const r = netNow.forward(x)[1]; return [-r, 0.25 - Math.abs(r), r]; },
    samples: () => boatSeen,
    current: () => { const b = state.cur && state.cur.boats.find((x) => !x.dead && x.input); return b ? b.input.slice() : null; },
    drawBrain: (cv) => { const n = netNow; ML.xray.drawNet(cv, n.sizes, (l, i, j) => n.weight(l, i, j), ["far-left eye", "left eye", "ahead eye", "right eye", "far-right eye", "dock side", "dock front", "dock distance", "push sideways", "push up/down", "speed"], ["throttle", "rudder"]); },
    brainCaption: ML.xray.NET_CAPTION,
    notes: ["The brain also sets the throttle. Here we show its steering: which way it turns the rudder."],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { netNow = xNet(); _xo(); };
  ML.xray.button(document.getElementById("play").parentElement);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still sailing", count: () => (state.human || state.replay || !state.cur ? null : [state.cur.boats.filter((b) => !b.dead && !b.docked).length, state.cur.boats.length]) });
})();
