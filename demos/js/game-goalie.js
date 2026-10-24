// Goalie vs You — UI: the goal, the goalie's belief heat map, kicks, chart, checkpoints.
(function () {
  const { Z, ZONE_NAMES, Goalie, KICKERS, takeKick } = window.GoalieCore;
  const GW = 640, GH = 400;
  const cv = ML.setupCanvas(document.getElementById("goal"), GW, GH);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 170);
  const ctx = cv.ctx;

  // Goal mouth and its 6 zones (0 1 2 on top, 3 4 5 below).
  const G = { x: 80, y: 70, w: 480, h: 250 };
  const zoneRect = (z) => ({ x: G.x + (z % 3) * (G.w / 3), y: G.y + Math.floor(z / 3) * (G.h / 2), w: G.w / 3, h: G.h / 2 });
  const zoneCenter = (z) => { const r = zoneRect(z); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  const BLOCK = 10; // kicks per chart point

  const state = {
    mode: "you",
    kicker: "topleft",
    curving: false,
    goalie: new Goalie(),
    results: [], // true = saved
    blocks: [], // save % per 10 kicks
    markers: [],
    playing: false,
    speed: 1,
    anim: null, // current kick animation
    viewing: null, // checkpoint being looked at
    challenge: null, // { at, before, label } waiting to report adaptation
    lastSaid: 0,
  };
  const CKPT_AT = [1, 5, 10, 20, 40, 80, 150, 300, 600, 1200, 2400];

  // ---------- kicking ----------
  function kick(aim) {
    if (state.anim || state.viewing) return;
    const res = takeKick(state.goalie, aim, { curving: state.curving });
    state.results.push(res.saved);
    const n = state.results.length;
    if (n % BLOCK === 0) {
      const last = state.results.slice(-BLOCK);
      state.blocks.push((100 * last.filter(Boolean).length) / BLOCK);
      if (state.blocks[state.blocks.length - 1] >= 70) ML.xray.offer("The goalie found your habit! X-ray its brain");
      drawChart();
      checkAdaptation();
    }
    if (CKPT_AT.includes(n)) ckpts.add(makeCheckpoint(n));
    renderStats();
    const animate = state.mode === "you" || state.speed <= 3;
    if (animate) state.anim = { ...res, t: 0, dur: state.mode === "you" ? 950 : 900 / state.speed, start: performance.now() };
    if (state.mode === "you" || state.speed <= 3) narrate(res);
    return res;
  }

  function narrate(res) {
    const n = state.results.length;
    const g = state.goalie;
    if (state.mode === "robo" && n % 10 && n > 3) return;
    const rate = recentRate(20);
    if (n === 1) return ML.say(res.saved ? `Lucky guess! I knew nothing about you yet.` : `Goal! I had no idea where you'd shoot. I'm watching you now…`);
    if (n < 6) return ML.say(res.saved ? `Saved! I'm starting to see your habits.` : `Goal! I'm writing down where you kick.`);
    const top = g.topClue();
    if (rate >= 50) ML.say(`I'm saving <b>${rate}%</b> now! My best clue: <b>${top.name}</b>. Can you change your style?`);
    else if (rate <= 20 && n > 25) ML.say(`Only <b>${rate}%</b> saves… you're hard to read! Maybe you're kicking at random?`);
    else ML.say(res.saved ? `Saved! I'm trusting <b>${top.name}</b> most.` : `Goal! I dived ${ZONE_NAMES[res.dive]}, you went ${ZONE_NAMES[res.zone]}. Noted!`);
  }

  function recentRate(k) {
    const r = state.results.slice(-k);
    return r.length ? Math.round((100 * r.filter(Boolean).length) / r.length) : 0;
  }

  // After a challenge, report the drop and the comeback.
  function checkAdaptation() {
    const c = state.challenge;
    if (!c) return;
    const since = state.blocks.length - c.atBlock;
    const now = state.blocks[state.blocks.length - 1];
    if (since === 1) ML.say(`${c.label}! My saves went from <b>${Math.round(c.before)}%</b> to <b>${Math.round(now)}%</b>. My old habits-map is wrong now…`);
    if (since >= 2) {
      const recent = state.blocks.slice(-2).reduce((a, b) => a + b, 0) / 2;
      if (c.random) {
        if (since >= 4) { ML.say(`Random kicks! I'm stuck near <b>${Math.round(recent)}%</b>, about the same as lucky guessing. No pattern = nothing to learn.`); state.challenge = null; }
      } else if (recent >= Math.min(c.before * 0.8, c.before - 5) && recent > 30) {
        ML.xray.offer("I learned your habits! X-ray the goalie\u2019s brain");
        ML.say(`I adapted! Back up to <b>${Math.round(recent)}%</b> saves after ${since * BLOCK} kicks. I found your new habit.`);
        ML.confetti(40);
        state.challenge = null;
      } else if (since >= 8) {
        ML.say(`This one's tough: I'm at <b>${Math.round(recent)}%</b>. ${state.curving ? "The curve makes the ball land in different spots even when you aim the same, so I can't be perfect." : "Keep going, I'm still learning."}`);
        state.challenge = null;
      }
    }
  }

  function addChallenge(label, opts = {}) {
    const before = state.blocks.length ? state.blocks.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, state.blocks.length) : 17;
    state.markers.push({ at: state.blocks.length, label });
    state.challenge = { atBlock: state.blocks.length, before, label, random: !!opts.random };
    drawChart();
    flash(label);
  }

  // ---------- checkpoints ----------
  function makeCheckpoint(n) {
    const snap = state.goalie.clone();
    return {
      label: `After ${n} kick${n > 1 ? "s" : ""}`,
      sub: `saving ${recentRate(Math.min(20, n))}%`,
      goalie: snap,
      n,
      draw: (c) => drawMiniBelief(c, snap),
    };
  }
  function drawMiniBelief(canvas, goalie) {
    const c = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    const { p } = goalie.belief();
    const max = Math.max(...p);
    for (let z = 0; z < Z; z++) {
      const x = 10 + (z % 3) * ((W - 20) / 3), y = 12 + Math.floor(z / 3) * ((H - 24) / 2);
      c.fillStyle = ML.cssVar("--accent");
      c.globalAlpha = 0.1 + 0.85 * (p[z] / max);
      c.fillRect(x + 2, y + 2, (W - 20) / 3 - 4, (H - 24) / 2 - 4);
    }
    c.globalAlpha = 1;
    c.strokeStyle = ML.cssVar("--ink");
    c.lineWidth = 4;
    c.strokeRect(10, 12, W - 20, H - 12);
  }
  const ckpts = new GameLab.Checkpoints(
    document.getElementById("ckpts"),
    (it) => {
      state.viewing = it;
      state.playing = false;
      syncPlay();
      let msg = `This was my brain after <b>${it.n}</b> kick${it.n > 1 ? "s" : ""}. The glow shows where I expected your next kick back then.`;
      if (state.mode === "robo") {
        // How would that old goalie do against today's kicker? (frozen, no learning)
        const test = it.goalie.clone();
        let saves = 0;
        for (let i = 0; i < 200; i++) {
          const aim = KICKERS[state.kicker].kick(test.history, Math.random);
          const r = takeKick(test, aim, { curving: state.curving, learn: false });
          test.history.push({ zone: r.zone, dive: r.dive, scored: !r.saved, aim });
          if (test.history.length > 50) test.history.shift();
          if (r.saved) saves++;
        }
        msg += ` Frozen like that, it would save <b>${Math.round(saves / 2)}%</b> against "${KICKERS[state.kicker].name}" today.`;
      }
      ML.say(msg);
      renderInside();
    },
    () => { state.viewing = null; renderInside(); ML.say(`Back to the live goalie!`); }
  );

  // ---------- drawing ----------
  function drawGoalie(x, y, lean, dive) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    const shirt = ML.cssVar("--accent");
    // legs
    ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-10, 18); ctx.lineTo(-14 - dive * 6, 52); ctx.moveTo(10, 18); ctx.lineTo(14 + dive * 6, 52); ctx.stroke();
    // arms (reach up when diving)
    ctx.strokeStyle = shirt; ctx.lineWidth = 10;
    const reach = 18 + dive * 18;
    ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-30 - dive * 10, -8 - reach); ctx.moveTo(18, -8); ctx.lineTo(30 + dive * 10, -8 - reach); ctx.stroke();
    // gloves
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 3;
    [[-30 - dive * 10, -8 - reach], [30 + dive * 10, -8 - reach]].forEach(([gx, gy]) => { ctx.beginPath(); ctx.arc(gx, gy, 8, 0, 7); ctx.fill(); ctx.stroke(); });
    // body
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.roundRect(-20, -20, 40, 44, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "800 16px Fredoka, sans-serif"; ctx.textAlign = "center"; ctx.fillText("1", 0, 9);
    // head
    ctx.fillStyle = "#ffd7b0"; ctx.beginPath(); ctx.arc(0, -36, 16, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1f2140";
    ctx.beginPath(); ctx.arc(-5, -38, 2.4, 0, 7); ctx.arc(5, -38, 2.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -31, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  function drawBall(x, y, r) {
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1f2140";
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; const px = x + Math.cos(a) * r * 0.42, py = y + Math.sin(a) * r * 0.42; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.fill();
  }

  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function draw(now) {
    ctx.clearRect(0, 0, GW, GH);
    // sky + grass
    ctx.fillStyle = ML.isDark() ? "#1d2346" : "#dff1ff"; ctx.fillRect(0, 0, GW, GH);
    ctx.fillStyle = ML.isDark() ? "#1f4a33" : "#8fd694"; ctx.fillRect(0, 300, GW, 100);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.04)"; ctx.fillRect(i * 80, 300, 80, 100); }
    // net
    ctx.strokeStyle = "rgba(31,33,64,.15)"; ctx.lineWidth = 1;
    for (let x = G.x; x <= G.x + G.w; x += 20) { ctx.beginPath(); ctx.moveTo(x, G.y); ctx.lineTo(x, G.y + G.h); ctx.stroke(); }
    for (let y = G.y; y <= G.y + G.h; y += 20) { ctx.beginPath(); ctx.moveTo(G.x, y); ctx.lineTo(G.x + G.w, y); ctx.stroke(); }

    // belief heat map
    const goalie = state.viewing ? state.viewing.goalie : state.goalie;
    const { p } = goalie.belief();
    const max = Math.max(...p);
    const dive = p.indexOf(Math.max(...p)); // display only (the real dive breaks ties randomly)
    for (let z = 0; z < Z; z++) {
      const r = zoneRect(z);
      ctx.fillStyle = ML.cssVar("--accent");
      ctx.globalAlpha = 0.06 + 0.5 * (p[z] / max);
      ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ML.cssVar("--ink");
      ctx.font = "800 15px Nunito, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(`${Math.round(p[z] * 100)}%`, r.x + 10, r.y + 22);
      ctx.fillStyle = ML.cssVar("--muted"); ctx.font = "800 12px Nunito, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(z + 1, r.x + r.w - 10, r.y + 20);
      if (z === dive && !state.anim) { ctx.strokeStyle = ML.cssVar("--accent"); ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.strokeRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10); ctx.setLineDash([]); }
    }
    // posts + crossbar
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(G.x, G.y + G.h + 4); ctx.lineTo(G.x, G.y); ctx.lineTo(G.x + G.w, G.y); ctx.lineTo(G.x + G.w, G.y + G.h + 4); ctx.stroke();
    ctx.strokeStyle = "rgba(31,33,64,.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(G.x - 5, G.y + G.h + 4); ctx.lineTo(G.x - 5, G.y - 5); ctx.lineTo(G.x + G.w + 5, G.y - 5); ctx.lineTo(G.x + G.w + 5, G.y + G.h + 4); ctx.stroke();

    // goalie + ball
    const home = { x: GW / 2, y: G.y + G.h - 56 };
    const a = state.anim;
    if (a) {
      const t = Math.min(1, (now - a.start) / a.dur);
      const dt = ease(Math.min(1, t * 1.4));
      const target = zoneCenter(a.dive);
      const gx = ML.lerp(home.x, target.x, dt), gy = ML.lerp(home.y, target.y + 10, dt);
      const lean = ((a.dive % 3) - 1) * 0.9 * dt;
      drawGoalie(gx, gy, lean, dt);
      // ball: aims at the aim zone, curving ones bend late
      const bt = ease(t);
      const aimC = zoneCenter(a.aim), endC = zoneCenter(a.zone);
      const bend = Math.pow(bt, 3);
      const bx = ML.lerp(GW / 2, ML.lerp(aimC.x, endC.x, bend), bt) + (a.saved ? 0 : 0);
      const by = ML.lerp(372, ML.lerp(aimC.y, endC.y, bend), bt) - Math.sin(bt * Math.PI) * 30;
      drawBall(bx, by, ML.lerp(16, 11, bt));
      if (t >= 1) {
        ctx.font = "700 34px Fredoka, sans-serif"; ctx.textAlign = "center";
        ctx.fillStyle = a.saved ? ML.cssVar("--good") : ML.cssVar("--bad");
        ctx.fillText(a.saved ? "SAVED!" : "GOAL!", GW / 2, 50);
        if (now - a.start > a.dur + (state.mode === "you" ? 450 : 250 / state.speed)) state.anim = null;
      }
    } else {
      drawGoalie(home.x, home.y, 0, 0);
      drawBall(GW / 2, 372, 16);
      ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "700 15px Nunito, sans-serif"; ctx.textAlign = "center";
      const hint = state.viewing ? `Looking back: checkpoint after ${state.viewing.n} kicks` : state.mode === "you" ? "Tap a spot in the goal to shoot!" : state.playing ? "" : "Press Play to let the robot kicker shoot";
      if (hint) ctx.fillText(hint, GW / 2, 50);
    }
  }

  function drawChart() {
    const chance = state.blocks.map(() => 100 / 6);
    GameLab.drawChart(chart, [{ values: chance, color: "--muted" }, { values: state.blocks, color: "--accent" }], state.markers, 100, "%");
  }

  // ---------- panel ----------
  function renderStats() {
    document.getElementById("st-n").textContent = state.results.length;
    document.getElementById("st-rate").innerHTML = state.results.length ? `${recentRate(20)}<small>%</small>` : "–";
    document.getElementById("kick-row").innerHTML = state.goalie.history.slice(-24).map((h) =>
      `<i class="${h.scored ? "goal" : "save"}" title="${ZONE_NAMES[h.zone]}">${h.zone + 1}</i>`).join("");
    renderInside();
  }

  function renderInside() {
    const g = state.viewing ? state.viewing.goalie : state.goalie;
    const host = document.getElementById("inside");
    const { p, preds } = g.belief();
    const dive = p.indexOf(Math.max(...p));
    const ranked = g.clues.map((c, i) => ({ c, pr: preds[i] })).sort((a, b) => b.c.weight - a.c.weight);
    const best = ranked[0];
    const h = g.history;
    let context = "";
    if (!h.length) context = `I haven't seen any kicks yet, so every spot looks the same.`;
    else {
      const z = (k) => ZONE_NAMES[h[h.length - k].zone];
      const ctxText = {
        fav: `Overall you kick a lot to`,
        after1: `Your last kick was <b>${z(1)}</b>. After that you usually go`,
        after2: h.length >= 2 ? `Your last two kicks were <b>${z(2)}</b>, <b>${z(1)}</b>. After that you usually go` : `Not enough kicks yet. Mostly you go`,
        dive: `I dived <b>${ZONE_NAMES[h[h.length - 1].dive]}</b> last time. Then you usually go`,
        result: `Last time you <b>${h[h.length - 1].scored ? "scored" : "got saved"}</b> going ${z(1)}. Then you usually go`,
      }[best.c.id];
      const peak = best.pr.p.indexOf(Math.max(...best.pr.p));
      context = `${ctxText} <b>${ZONE_NAMES[peak]}</b> (${Math.round(best.pr.p[peak] * 100)}%).`;
    }
    host.innerHTML = `<div>${ML.icon("search")} Clue I trust most: <b>${best.c.name}</b></div>
      <div>${context}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("target")} Mixing all clues: <b>${ZONE_NAMES[dive]}</b> ${Math.round(p[dive] * 100)}% → I dive <b style="color:var(--accent)">${ZONE_NAMES[dive]}</b></div>`;
    const W = g.clues.reduce((a, c) => a + c.weight, 0);
    document.getElementById("trust").innerHTML = `<div style="grid-template-columns:1fr"><span class="muted">How much I trust each clue:</span></div>` +
      g.clues.map((c) => `<div><span>${c.name}</span><span class="bar"><span style="width:${Math.round((100 * c.weight) / W)}%"></span></span></div>`).join("");
  }

  function flash(text) {
    const o = document.getElementById("overlay");
    o.textContent = text;
    o.classList.add("show");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => o.classList.remove("show"), 1400);
  }

  // ---------- controls ----------
  const zk = document.getElementById("zone-keys");
  zk.innerHTML = ZONE_NAMES.map((n, z) => `<button class="btn small" data-z="${z}" title="${n}">${z + 1}</button>`).join("");
  zk.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => state.mode === "you" && kick(+b.dataset.z)));
  document.getElementById("goal").addEventListener("pointerdown", (e) => {
    if (state.mode !== "you") return;
    const pt = ML.canvasPoint(e.currentTarget, e, GW, GH);
    if (pt.x < G.x || pt.x > G.x + G.w || pt.y < G.y || pt.y > G.y + G.h) return;
    const col = Math.min(2, Math.floor(((pt.x - G.x) / G.w) * 3));
    const row = pt.y < G.y + G.h / 2 ? 0 : 1;
    kick(row * 3 + col);
  });
  document.addEventListener("keydown", (e) => {
    if (state.mode !== "you" || !/^[1-6]$/.test(e.key)) return;
    kick(+e.key - 1);
  });

  const kickersHost = document.getElementById("kickers");
  kickersHost.innerHTML = Object.entries(KICKERS).map(([id, k]) => `<button class="btn small ${id === state.kicker ? "on" : ""}" data-k="${id}">${k.name}</button>`).join("");
  function setKicker(id, asChallenge) {
    state.kicker = id;
    kickersHost.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === id));
    if (asChallenge) addChallenge(`New habit: ${KICKERS[id].name.toLowerCase()}`, { random: id === "random" });
  }
  kickersHost.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.k === state.kicker) return;
    setKicker(b.dataset.k, state.results.length > 0);
  }));

  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x === b));
    state.mode = b.dataset.m;
    state.playing = false;
    syncPlay();
    document.getElementById("you-help").classList.toggle("hidden", state.mode !== "you");
    document.getElementById("robo-help").classList.toggle("hidden", state.mode !== "robo");
    document.getElementById("auto-btns").querySelector("#play").disabled = state.mode === "you";
    ML.say(state.mode === "you"
      ? `Your turn! Tap the goal to shoot. Try to have a favourite spot, and see if I notice.`
      : `A robot kicker with a habit will shoot. Press <b>Play</b> and watch me figure it out.`);
  }));

  document.querySelectorAll("#chal button").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    if (c === "curve") {
      state.curving = !state.curving;
      b.classList.toggle("on", state.curving);
      if (state.curving) addChallenge("Curving ball");
      else ML.say(`No more curve. Straight shots again!`);
      return;
    }
    if (c === "switch") {
      if (state.mode === "robo") {
        const ids = Object.keys(KICKERS).filter((k) => k !== "random" && k !== state.kicker);
        setKicker(ids[Math.floor(Math.random() * ids.length)], true);
      } else {
        addChallenge("You switched style");
        ML.say(`OK, <b>change your habits now</b>! Pick a new favourite spot or pattern, and I'll try to catch on.`);
      }
      return;
    }
    if (c === "sneaky") {
      if (state.mode === "robo") setKicker("random", true);
      else {
        addChallenge("Sneaky kicking", { random: true });
        ML.say(`Try to kick <b>completely randomly</b>, like rolling a dice. Can I still read you?`);
      }
    }
  }));

  const playBtn = document.getElementById("play");
  playBtn.disabled = true;
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    if (state.mode !== "robo") return;
    if (state.viewing) { state.viewing = null; ckpts.active = null; ckpts.render(); }
    state.playing = !state.playing;
    syncPlay();
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));
  document.getElementById("reset").addEventListener("click", () => {
    state.goalie = new Goalie();
    state.results = [];
    state.blocks = [];
    state.markers = [];
    state.challenge = null;
    state.viewing = null;
    state.anim = null;
    ckpts.clear();
    drawChart();
    renderStats();
    ML.say(`My memory is wiped. Every spot looks the same to me again.`);
  });

  // ---------- loop ----------
  function frame(now) {
    if (state.mode === "robo" && state.playing && !state.viewing) {
      if (state.speed <= 3) {
        if (!state.anim) kick(KICKERS[state.kicker].kick(state.goalie.history, Math.random));
      } else {
        const per = state.speed >= 60 ? 6 : 1;
        for (let i = 0; i < per; i++) kick(KICKERS[state.kicker].kick(state.goalie.history, Math.random));
      }
    }
    draw(now);
    requestAnimationFrame(frame);
  }
  drawChart();
  renderStats();
  ckpts.render();
  requestAnimationFrame(frame);
  // ---------- Model X-ray ----------
  const NAMES = ["top-left", "top-middle", "top-right", "bottom-left", "bottom-middle", "bottom-right"];
  let gNow = null;
  const zoneIn = (name) => ({ name, min: 0, max: 5, step: 1, describe: (v) => NAMES[Math.round(v)] });
  const toHist = (x) => [
    { zone: Math.round(x[0]), dive: Math.round(x[2]), scored: false },
    { zone: Math.round(x[1]), dive: Math.round(x[2]), scored: x[3] > 0.5 },
  ];
  ML.xray.register({
    title: "The goalie's guessing brain",
    kind: "Pattern counter (n-gram)",
    summary: () => `watched ${state.results.length} kicks`,
    size: () => `${state.goalie.clues.reduce((a, c) => a + c.table.size * 6, 0)} counts`,
    stats: () => [["Kicks", state.results.length], ["Saves (last 10)", state.blocks.length ? `${state.blocks[state.blocks.length - 1]}%` : "–"], ["Trusts most", state.goalie.topClue().name]],
    inputs: [zoneIn("Kick before last"), zoneIn("Your last kick"), zoneIn("Where I dived last"), { name: "Last kick scored", min: 0, max: 1, step: 1, describe: (v) => (v > 0.5 ? "yes" : "no") }],
    outputs: NAMES.map((n, i) => ({ name: "Dive " + n, color: ML.cssVar(["--sup", "--vision", "--rl", "--nn", "--diff", "--lang"][i]) })),
    predict: (x) => {
      const h = toHist(x), preds = gNow.clues.map((c) => c.predict(h)), W = gNow.clues.reduce((a, c) => a + c.weight, 0);
      const p = new Array(6).fill(0);
      gNow.clues.forEach((c, i) => preds[i].p.forEach((v, z) => (p[z] += (c.weight / W) * v)));
      return p;
    },
    samples: () => {
      const h = state.goalie.history, out = [];
      for (let k = 2; k < h.length; k++) out.push([h[k - 2].zone, h[k - 1].zone, h[k - 1].dive, h[k - 1].scored ? 1 : 0]);
      return out;
    },
    current: () => { const h = state.goalie.history; return h.length >= 2 ? [h[h.length - 2].zone, h[h.length - 1].zone, h[h.length - 1].dive, h[h.length - 1].scored ? 1 : 0] : null; },
    brainHeight: 300,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), W = cv.width, H = cv.height, clues = gNow.clues, Wt = clues.reduce((a, k) => a + k.weight, 0);
      c.font = "800 13px Nunito, sans-serif";
      c.fillStyle = ML.cssVar("--ink"); c.textAlign = "left"; c.fillText("How much it trusts each clue", 10, 18);
      clues.forEach((k, i) => {
        const y = 34 + i * 40, len = (k.weight / Wt) * 260;
        c.fillStyle = ML.cssVar("--muted"); c.fillText(k.name, 10, y + 12);
        c.fillStyle = ML.cssVar("--accent"); c.fillRect(10, y + 18, len, 10);
      });
      // after-your-last-kick table: row = last kick, column = where you went next
      const after1 = clues.find((k) => k.id === "after1"), x0 = 470, y0 = 40, s = 38;
      c.fillStyle = ML.cssVar("--ink"); c.fillText("After you kick here (row), you next kick… (column)", x0, 18);
      for (let r = 0; r < 6; r++) {
        const cnt = after1.table.get(r) || [0, 0, 0, 0, 0, 0], n = cnt.reduce((a, b) => a + b, 0) || 1;
        c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right"; c.fillText(NAMES[r], x0 - 6, y0 + r * s + s / 2 + 4); c.textAlign = "left";
        for (let k = 0; k < 6; k++) {
          c.fillStyle = ML.cssVar("--rl"); c.globalAlpha = 0.08 + 0.92 * (cnt[k] / n);
          c.fillRect(x0 + k * s + 1, y0 + r * s + 1, s - 2, s - 2);
          c.globalAlpha = 1;
        }
      }
    },
    brainCaption: "Left: the goalie mixes five clues and trusts the ones that guessed right lately. Right: one of its tables. Darker = you often kick there next. That's your habit, written down!",
    notes: ["The goalie can only win by spotting patterns. If you kick totally at random, every square on the map is a coin-flip and it can't do better than chance."],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { gNow = state.goalie.clone(); _xo(); };
  ML.xray.button(document.getElementById("play").parentElement);
})();
