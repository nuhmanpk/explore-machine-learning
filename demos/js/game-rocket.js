// Rocket Lander — page: you fly, or watch a population evolve; challenges change the world live.
(function () {
  const { W, PAD_W, Flight, Evolver, makeStarts, control, defaultRules } = window.RocketLab;
  const CW = 600, CH = 420, GROUND = 382;
  const world = ML.setupCanvas(document.getElementById("world"), CW, CH);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 140);
  const toCY = (y) => GROUND - y;

  const state = {
    mode: "you",
    playing: false,
    speed: 4,
    evo: new Evolver(60),
    live: null, // generation running on screen
    history: [], // [{best, avg, land}]
    marks: [],
    you: null,
    keys: { thrust: false, left: false, right: false },
    replay: null, // {genome, flight, title}
    showcase: null, // champion demo flight in turbo
    particles: [],
  };

  // ---------- a generation played on screen ----------
  function newLive() {
    const e = state.evo;
    state.live = { starts: e.starts(), idx: 0, fit: new Array(e.size).fill(0), landed: new Array(e.size).fill(0), flights: null };
    startLeg();
  }
  function startLeg() {
    const L = state.live, e = state.evo;
    L.flights = e.pop.map(() => new Flight(e.rules, L.starts[L.idx]));
  }
  function stepLive() {
    const L = state.live, e = state.evo;
    let alive = 0;
    for (let i = 0; i < L.flights.length; i++) {
      const f = L.flights[i];
      if (f.done) continue;
      f.step(control(e.pop[i], f));
      if (!f.done) alive++;
    }
    if (alive) return;
    L.flights.forEach((f, i) => { L.fit[i] += f.score(); if (f.result === "landed") L.landed[i]++; });
    L.idx++;
    if (L.idx < L.starts.length) return startLeg();
    const n = L.starts.length;
    finishGeneration(e.pop.map((g, i) => ({ g, fit: L.fit[i] / n, landed: L.landed[i] / n })));
    newLive();
  }
  function finishGeneration(scored) {
    const e = state.evo;
    const avg = scored.reduce((a, s) => a + s.fit, 0) / scored.length;
    const popLand = scored.reduce((a, s) => a + s.landed, 0) / scored.length;
    e.breed(scored);
    state.history.push({ best: e.bestScore, avg, land: e.bestLanded, popLand });
    afterGeneration();
  }
  // Turbo: whole generations off-screen, a few per frame.
  function turboGenerations(budgetMs) {
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const e = state.evo;
      const st = e.starts();
      finishGeneration(e.pop.map((g) => Object.assign({ g }, e.evaluate(g, st))));
    }
  }

  const CKPT_AT = [1, 5, 10, 20, 40, 80, 150, 300, 600];
  function afterGeneration() {
    const e = state.evo, gen = e.gen;
    const recent = state.history.slice(-5);
    const smooth = recent.reduce((a, h) => a + h.best, 0) / recent.length;
    watcher.update(smooth, gen);
    if (CKPT_AT.includes(gen)) saveCkpt(`Gen ${gen}`);
    if (!state.celebrated && recent.length === 5 && recent.every((h) => h.land >= 0.75) && !anyChallenge()) {
      state.celebrated = true;
      ML.confetti();
      ML.xray.offer("The rockets can land! X-ray the champion\u2019s brain");
      ML.say(`After <b>${gen}</b> generations my champion lands softly almost every time! Now try a <b>challenge</b> and watch us adapt.`);
    } else if (!watcher.busy && state.speed !== 0 && gen % 3 === 0) {
      const h = state.history[state.history.length - 1];
      ML.say(gen < 4
        ? `Generation ${gen}: most rockets crash or fly away. The best ones still get to be parents.`
        : `Generation ${gen}: the champion landed <b>${Math.round(h.land * 100)}%</b> of its tries. ${h.land < 0.5 ? "Getting closer…" : "Nice and soft!"}`);
    }
    drawChart();
  }

  // ---------- challenges ----------
  const CHALLENGES = {
    wind: { label: "Wind", on: (r) => { r.wind = -0.022; r.gusts = true; }, off: (r) => { r.wind = 0; r.gusts = false; }, say: "A strong wind is pushing every rocket to the left, with gusts!" },
    gravity: { label: "Heavy", on: (r) => (r.gravity = 0.085), off: (r) => (r.gravity = 0.05), say: "Gravity is much stronger now, like landing on a bigger planet." },
    movingPad: { label: "Moving pad", on: (r) => (r.movingPad = true), off: (r) => (r.movingPad = false), say: "The landing pad slides back and forth! They'll have to chase it." },
    fuel: { label: "Low fuel", on: (r) => (r.fuel = 0.55), off: (r) => (r.fuel = 1), say: "Only half the fuel! No more wasting it on long hovers." },
    bumpyPad: { label: "Pad jumps", on: (r) => (r.bumpyPad = true), off: (r) => (r.bumpyPad = false), say: "The pad appears in a new place every try. No memorising one spot!" },
  };
  const active = new Set();
  const anyChallenge = () => active.size > 0;
  const watcher = GameRW.challengeWatcher((kind, w) => {
    if (kind === "drop") ML.say(`Ouch! The <b>${w.label}</b> challenge knocked the score down. The old champion's tricks don't work any more. Keep watching…`);
    if (kind === "easy") ML.say(`The <b>${w.label}</b> challenge didn't bother my rockets much. Try another one!`);
    if (kind === "recovered") { ML.confetti(40); ML.say(`We adapted to <b>${w.label}</b> in just <b>${w.gens}</b> generations! The rockets that coped best became the parents.`); }
    watcher.busy = kind === "drop";
  });
  document.querySelectorAll("#challenges [data-c]").forEach((b) =>
    b.addEventListener("click", () => {
      const c = CHALLENGES[b.dataset.c];
      const on = !active.has(b.dataset.c);
      if (on) { active.add(b.dataset.c); c.on(state.evo.rules); } else { active.delete(b.dataset.c); c.off(state.evo.rules); }
      b.classList.toggle("on", on);
      const gen = state.evo.gen;
      state.marks.push({ at: state.history.length, label: (on ? "+" : "−") + c.label, on });
      if (on) {
        const recent = state.history.slice(-5);
        const before = recent.length ? recent.reduce((a, h) => a + h.best, 0) / recent.length : 0;
        if (state.history.length) saveCkpt(`Before ${c.label}`);
        watcher.start(c.label, before, gen);
        ML.say(`${c.say} ${state.mode === "robo" && state.playing ? "Watch the chart." : "Press <b>Practise</b> in Robo learns to see them adapt."}`);
      } else {
        ML.say(`${c.label} is switched off.`);
      }
      if (state.you) state.you = newYouFlight();
      drawChart();
    })
  );

  // ---------- checkpoints ----------
  const ckpts = GameRW.checkpoints(document.getElementById("ckpts"), {
    drawMini(canvas, ck) {
      const c = canvas.getContext("2d");
      c.fillStyle = ML.cssVar("--canvas-bg");
      c.fillRect(0, 0, 216, 96);
      const rules = Object.assign(defaultRules(), state.evo.rules);
      const st = makeStarts(77, 3, rules);
      st.forEach((s, i) => {
        const f = new Flight(rules, s);
        c.strokeStyle = ["#7c5cff", "#2f9bff", "#ff8a3d"][i];
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo((f.x / W) * 216, 86 - (f.y / 380) * 80);
        while (!f.done) { f.step(control(ck.genome, f)); c.lineTo((f.x / W) * 216, 86 - (f.y / 380) * 80); }
        c.stroke();
        c.fillStyle = f.result === "landed" ? ML.cssVar("--good") : ML.cssVar("--bad");
        c.beginPath(); c.arc((f.x / W) * 216, 86 - (f.y / 380) * 80, 4, 0, 7); c.fill();
      });
      c.fillStyle = ML.cssVar("--good");
      c.fillRect(((W / 2 - PAD_W / 2) / W) * 216, 86, (PAD_W / W) * 216, 4);
    },
    onPick(ck) {
      state.replay = { genome: ck.genome, title: ck.title, flight: null, tries: 0, landed: 0 };
      nextReplayFlight();
      ML.say(`Replaying the champion from <b>${ck.title}</b> in today's world${anyChallenge() ? " (with your challenges on)" : ""}.`);
    },
    onLive() { state.replay = null; },
  });
  function saveCkpt(title) {
    const e = state.evo;
    if (!e.best) return;
    ckpts.add({ title, sub: `lands ${Math.round((e.bestLanded || 0) * 100)}%`, genome: e.best.slice() });
  }
  function nextReplayFlight() {
    const r = state.replay;
    r.flight = new Flight(state.evo.rules, makeStarts(Math.floor(Math.random() * 1e6), 1, state.evo.rules)[0]);
  }

  // ---------- you fly ----------
  function newYouFlight() {
    return new Flight(state.evo.rules, makeStarts(Math.floor(Math.random() * 1e6), 1, state.evo.rules)[0]);
  }
  const keyMap = { ArrowUp: "thrust", KeyW: "thrust", Space: "thrust", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  document.addEventListener("keydown", (e) => {
    if (state.mode !== "you" || !keyMap[e.code]) return;
    e.preventDefault();
    state.keys[keyMap[e.code]] = true;
  });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) state.keys[keyMap[e.code]] = false; });
  document.querySelectorAll("#fly-pad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); state.keys[k] = true; b.classList.add("pressed"); };
    const off = () => { state.keys[k] = false; b.classList.remove("pressed"); };
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointerleave", off);
    b.addEventListener("pointercancel", off);
  });
  function stepYou() {
    const f = state.you;
    if (f.done) {
      if (!f.said) {
        f.said = true;
        const msg = { landed: "Perfect landing! You're a natural.", crashed: "You hit the pad too hard or tilted. Land slower and straighter!", missed: "You missed the pad!", lost: "The rocket flew away!" }[f.result];
        ML.say(`${msg} Press the engine to try again. Now imagine learning this with <b>no instructions</b>…`);
        f.wait = state.keys.thrust;
      }
      if (!state.keys.thrust) f.wait = false;
      if (state.keys.thrust && !f.wait) state.you = newYouFlight();
      return;
    }
    f.step(state.keys);
  }

  // ---------- drawing ----------
  function drawSky(ctx, rules) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    const dark = ML.isDark();
    g.addColorStop(0, dark ? "#141737" : "#cfe6ff");
    g.addColorStop(1, dark ? "#2a2d5e" : "#f2f8ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = dark ? "#fff" : "#fff8";
    for (let i = 0; i < 22; i++) ctx.fillRect((i * 97) % CW, (i * 53) % 220, 2, 2);
    // ground
    ctx.fillStyle = dark ? "#3a3d63" : "#c9b89a";
    ctx.fillRect(0, GROUND, CW, CH - GROUND);
    ctx.fillStyle = dark ? "#4a4d78" : "#b7a483";
    for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.arc(x + 15, GROUND + 14, 6, 0, 7); ctx.fill(); }
    // wind streaks
    if (rules.wind || rules.gusts) {
      const t = performance.now() / 16;
      ctx.strokeStyle = dark ? "#ffffff55" : "#5b7fa888";
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const x = CW - ((t * 2.5 + i * 83) % (CW + 80)), y = 40 + ((i * 67) % 300);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y); ctx.stroke();
      }
    }
  }
  function drawPad(ctx, x) {
    const l = x - PAD_W / 2;
    ctx.fillStyle = "#1f2140";
    ctx.fillRect(l + 8, GROUND - 4, 6, 4);
    ctx.fillRect(l + PAD_W - 14, GROUND - 4, 6, 4);
    ctx.fillStyle = ML.cssVar("--good");
    ctx.beginPath(); ctx.roundRect(l, GROUND - 10, PAD_W, 8, 4); ctx.fill();
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 4; i++) ctx.fillRect(l + 10 + i * 20, GROUND - 8, 10, 4);
  }
  function drawRocket(ctx, f, alpha, main) {
    const x = f.x, y = toCY(f.y);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(f.angle);
    if (f.thrusting) {
      ctx.fillStyle = "#ffb020";
      ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(0, 14 + Math.random() * 10); ctx.lineTo(6, 2); ctx.fill();
      if (main) for (let i = 0; i < 2; i++) state.particles.push({ x: x - Math.sin(f.angle) * 10, y: y + Math.cos(f.angle) * 10, vx: -Math.sin(f.angle) * 2 + (Math.random() - 0.5), vy: Math.cos(f.angle) * 2 + Math.random(), life: 1 });
    }
    // fins
    ctx.fillStyle = main ? "#ff5c9a" : "#9aa0c8";
    ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-14, 6); ctx.lineTo(-8, 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, -2); ctx.lineTo(14, 6); ctx.lineTo(8, 4); ctx.fill();
    // body + nose
    ctx.fillStyle = main ? "#f4f1ff" : "#d9dbef";
    ctx.strokeStyle = "#1f2140";
    ctx.lineWidth = main ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(-8, -16, 16, 22, 5); ctx.fill(); if (main) ctx.stroke();
    ctx.fillStyle = main ? "#7c5cff" : "#9aa0c8";
    ctx.beginPath(); ctx.moveTo(-8, -15); ctx.quadraticCurveTo(0, -30, 8, -15); ctx.closePath(); ctx.fill(); if (main) ctx.stroke();
    ctx.fillStyle = "#2f9bff";
    ctx.beginPath(); ctx.arc(0, -7, 3.5, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawParticles(ctx) {
    for (const p of state.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.04;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.life > 0.6 ? "#ffd166" : "#ff8a3d";
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life + 1, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    state.particles = state.particles.filter((p) => p.life > 0);
  }
  function drawHud(ctx, f, label) {
    ctx.fillStyle = "rgba(31,33,64,.78)";
    ctx.beginPath(); ctx.roundRect(10, 10, 210, 50, 10); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "800 12px Nunito, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, 20, 28);
    ctx.fillText("Fuel", 20, 48);
    ctx.fillStyle = "#ffffff33"; ctx.fillRect(56, 40, 150, 9);
    ctx.fillStyle = f.fuel / f.fuelMax > 0.25 ? "#2fbf62" : "#ff4d5e";
    ctx.fillRect(56, 40, (150 * f.fuel) / Math.max(1, f.fuelMax), 9);
    const tags = [...active].map((k) => CHALLENGES[k].label);
    if (tags.length) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,77,94,.9)";
      const t = tags.join(" · ");
      const w = ctx.measureText(t).width + 20;
      ctx.beginPath(); ctx.roundRect(CW - 10 - w, 10, w, 24, 8); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(t, CW - 20, 27);
    }
  }
  function resultBadge(ctx, f) {
    if (!f.done) return;
    const txt = { landed: "Soft landing!", crashed: "Crashed!", missed: "Missed the pad", lost: "Flew away" }[f.result];
    ctx.font = "700 26px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = f.result === "landed" ? ML.cssVar("--good") : ML.cssVar("--bad");
    ctx.fillText(txt, CW / 2, 130);
  }

  function draw() {
    const ctx = world.ctx;
    const rules = state.evo.rules;
    drawSky(ctx, rules);
    if (state.mode === "you") {
      const f = state.you;
      drawPad(ctx, f.padX);
      drawParticles(ctx);
      drawRocket(ctx, f, 1, true);
      drawHud(ctx, f, "You are flying");
      resultBadge(ctx, f);
      if (!state.started) {
        ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "700 18px Nunito, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Hold ↑ (or Space) to fire the engine", CW / 2, 200);
      }
      return;
    }
    if (state.replay) {
      const f = state.replay.flight;
      drawPad(ctx, f.padX);
      drawParticles(ctx);
      drawRocket(ctx, f, 1, true);
      drawHud(ctx, f, `Replay: ${state.replay.title}`);
      resultBadge(ctx, f);
      return;
    }
    if (state.speed === 0 && state.playing) {
      const f = state.showcase;
      if (f) {
        drawPad(ctx, f.padX);
        drawParticles(ctx);
        drawRocket(ctx, f, 1, true);
        drawHud(ctx, f, `Turbo · gen ${state.evo.gen} champion`);
        resultBadge(ctx, f);
      }
      return;
    }
    const L = state.live;
    const flights = L.flights;
    drawPad(ctx, flights[0].padX);
    // champion = rocket of the best brain from last generation (index 0 after breeding)
    if (window.__showBabies !== false) for (let i = flights.length - 1; i >= 1; i--) if (!flights[i].done || flights[i].result === "landed") drawRocket(ctx, flights[i], flights[i].done ? 0.35 : 0.22, false);
    drawParticles(ctx);
    drawRocket(ctx, flights[0], 1, true);
    drawHud(ctx, flights[0], `Gen ${state.evo.gen + 1} · landing ${L.idx + 1} of ${L.starts.length}`);
    const landed = flights.filter((f) => f.result === "landed").length;
    ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "right";
    ctx.fillText(`${landed} of ${flights.length} landed`, CW - 12, GROUND + 26);
  }

  function drawChart() {
    GameRW.drawProgress(chart, state.history, state.marks, { max: 290 });
  }

  // ---------- inside card ----------
  let insideTick = 0;
  function renderInside() {
    if (++insideTick % 10) return;
    const host = document.getElementById("inside");
    let f, g;
    if (state.mode === "you") {
      host.innerHTML = `<div>You are the brain! A robot rocket feels just 6 numbers, the same ones shown here when Robo flies.</div>`;
      return;
    }
    if (state.replay) { f = state.replay.flight; g = state.replay.genome; }
    else if (state.speed === 0) { f = state.showcase; g = state.evo.best || state.evo.pop[0]; }
    else { f = state.live.flights[0]; g = state.evo.pop[0]; }
    if (!f || !g) return;
    const x = f.sense();
    const c = control(g, f);
    const names = ["Pad is", "Height", "Side speed", "Up speed", "Tilt", "Pad moving"];
    const words = [
      x[0] > 0.1 ? "to the right" : x[0] < -0.1 ? "to the left" : "right below",
      x[1] > 0.6 ? "high" : x[1] > 0.2 ? "medium" : "very low",
      x[2] > 0.15 ? "drifting right" : x[2] < -0.15 ? "drifting left" : "steady",
      x[3] < -0.5 ? "falling fast" : x[3] < -0.1 ? "falling" : "slow / rising",
      x[4] > 0.15 ? "leaning right" : x[4] < -0.15 ? "leaning left" : "upright",
      Math.abs(x[5]) > 0.1 ? "yes" : "no",
    ];
    const rows = names.map((n, i) => {
      const v = Math.max(-1, Math.min(1, x[i]));
      const left = v >= 0 ? 50 : 50 + v * 50, wdt = Math.abs(v) * 50;
      return `<div class="io"><span>${n}</span><div class="bar"><span style="left:${left}%;width:${wdt}%"></span></div><span class="num">${words[i]}</span></div>`;
    }).join("");
    const acts = [c.thrust && "ENGINE", c.left && "TILT LEFT", c.right && "TILT RIGHT"].filter(Boolean);
    host.innerHTML = `${rows}<div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("network")} 8 thinking neurons mix these up…</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("zap")} It does: <b style="color:var(--accent)">${acts.length ? acts.join(" + ") : "nothing (just falls)"}</b></div>`;
  }

  function renderStats() {
    document.getElementById("st-gen").textContent = state.evo.gen;
    const h = state.history[state.history.length - 1];
    document.getElementById("st-land").innerHTML = h ? `${Math.round(h.land * 100)}<small>%</small>` : "–";
  }

  // ---------- controls ----------
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    document.getElementById("fly-pad").style.display = m === "you" ? "" : "none";
    document.getElementById("mode-chip").textContent = m === "you" ? "Hold ↑ for engine, ← → to tilt" : "60 rocket brains, 4 landings each";
    if (m === "you") { state.playing = false; syncPlay(); state.you = newYouFlight(); state.replay = null; ckpts.unpick(); }
    else ML.say(`Each generation, <b>60 rockets</b> with different brains try 4 landings. The bold one is last generation's champion. Press <b>Practise</b>!`);
  }
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Practise`; }
  playBtn.addEventListener("click", () => {
    if (state.mode !== "robo") setMode("robo");
    state.replay = null;
    ckpts.unpick();
    state.playing = !state.playing;
    syncPlay();
  });
  document.getElementById("reset").addEventListener("click", () => {
    const rules = state.evo.rules;
    state.evo = new Evolver(60);
    state.evo.rules = rules;
    state.history = [];
    state.marks = [];
    state.celebrated = false;
    watcher.clear();
    ckpts.clear();
    newLive();
    drawChart();
    ML.say(`All brains are random again. Generation 0!`);
  });
  document.querySelectorAll("#speed button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
      state.speed = +b.dataset.v;
      if (state.speed === 0) ML.say(`Turbo! Generations fly by in the background. On screen: the current champion trying to land.`);
      else newLive();
    })
  );

  // ---------- loop ----------
  state.you = newYouFlight();
  newLive();
  drawChart();
  setMode("you");
  function frame() {
    if (state.mode === "you") {
      if (state.keys.thrust || state.keys.left || state.keys.right) state.started = true;
      if (state.started) stepYou();
    } else if (state.replay) {
      const r = state.replay;
      r.flight.step(control(r.genome, r.flight));
      if (r.flight.done) { if (!r.wait) r.wait = 50; if (--r.wait === 0) { r.wait = null; nextReplayFlight(); } }
    } else if (state.playing) {
      if (state.speed === 0) {
        if ((state.turboTick = (state.turboTick || 0) + 1) % 2 === 0) turboGenerations(1); // ~30 generations a second
        if (!state.showcase || (state.showcase.done && --state.showcaseWait <= 0)) {
          state.showcase = new Flight(state.evo.rules, makeStarts(Math.floor(Math.random() * 1e6), 1, state.evo.rules)[0]);
          state.showcaseGenome = state.evo.best || state.evo.pop[0]; // no champion before the first generation ends
          state.showcaseWait = 40;
        }
        if (!state.showcase.done) for (let i = 0; i < 2; i++) state.showcase.step(control(state.showcaseGenome, state.showcase));
      } else for (let i = 0, n = ML.ticks(state.speed); i < n; i++) stepLive();
    }
    draw();
    renderInside();
    renderStats();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // ---------- Model X-ray ----------
  const rocketSeen = [];
  // Situations really met in flight (in Turbo only the showcase rocket is moving on screen).
  setInterval(() => {
    const f = state.speed === 0 && state.showcase && !state.showcase.done ? state.showcase
      : state.live && state.live.flights && state.live.flights.find((x) => !x.done);
    if (!f) return;
    const x = f.sense(), last = rocketSeen[rocketSeen.length - 1];
    if (last && x.every((v, i) => Math.abs(v - last[i]) < 1e-6)) return;
    rocketSeen.push(x);
    if (rocketSeen.length > 500) rocketSeen.shift();
  }, 50);
  const champ = () => state.evo.best || state.evo.pop[0];
  const NIr = 6, NHr = 8;
  ML.xray.register({
    title: "The champion rocket's brain",
    kind: "Neural network",
    summary: () => `evolved over ${state.history.length} generations`,
    size: () => `${champ().length} knobs`,
    stats: () => [["Generations", state.history.length], ["Landing rate", state.history.length ? `${Math.round(state.history[state.history.length - 1].land * 100)}%` : "–"], ["Layers", "6 → 8 → 3"]],
    inputs: [
      { name: "Pad side", min: -2, max: 2, describe: (v) => (Math.abs(v) < 0.1 ? "right below" : v < 0 ? "to my left" : "to my right") },
      { name: "Height", min: 0, max: 1.3, describe: (v) => (v > 0.6 ? "high" : v > 0.2 ? "medium" : "very low") },
      { name: "Side speed", min: -2, max: 2, describe: (v) => (Math.abs(v) < 0.15 ? "still" : v < 0 ? "drifting left" : "drifting right") },
      { name: "Up speed", min: -2, max: 2, describe: (v) => (v > 0.6 ? "falling fast" : v > 0.15 ? "falling" : v < -0.15 ? "going up" : "hovering") },
      { name: "Tilt", min: -1, max: 1, describe: (v) => (Math.abs(v) < 0.1 ? "upright" : v < 0 ? "leaning left" : "leaning right") },
      { name: "Pad moving", min: -1, max: 1, describe: (v) => (Math.abs(v) < 0.05 ? "still" : v < 0 ? "sliding left" : "sliding right") },
    ],
    outputs: [{ name: "Coast", color: ML.cssVar("--sup") }, { name: "Fire engine", color: ML.cssVar("--rl") }, { name: "Tilt left", color: ML.cssVar("--vision") }, { name: "Tilt right", color: ML.cssVar("--nn") }],
    predict: (x) => { const o = window.RocketLab.think(champ(), x, [0, 0, 0]); return [-o[0], o[0], o[1] - 0.3, o[2] - 0.3]; },
    samples: () => rocketSeen,
    current: () => { const f = state.speed === 0 && state.showcase ? state.showcase : state.live && state.live.flights && state.live.flights[0]; return f ? f.sense() : null; },
    drawBrain: (cv) => {
      const g = champ();
      ML.xray.drawNet(cv, [NIr, NHr, 3], (l, i, j) => (l === 0 ? g[j * (NIr + 1) + i] : g[NHr * (NIr + 1) + j * (NHr + 1) + i]),
        ["pad side", "height", "side speed", "up speed", "tilt", "pad moving"], ["engine", "tilt left", "tilt right"]);
    },
    brainCaption: ML.xray.NET_CAPTION,
    notes: ["The rocket can fire its engine and tilt at the same time; the map shows the strongest wish at each spot."],
  });
  ML.xray.button(document.getElementById("play").parentElement);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still flying", count: () => (state.mode === "you" || state.replay || state.speed === 0 || !state.live ? null : [state.live.flights.filter((f) => !f.done).length, state.live.flights.length]) });
})();
