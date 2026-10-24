// Sailboat Beats the Wind — page: drawing, round loop, challenges, checkpoints, sailing yourself.
(function () {
  const { Net, nextGeneration } = window.GameNet;
  const S = window.SailGame;
  const { W, H, SHORE_L, SHORE_R, SIZES, Round, Sailboat, Sea, polar, pointOfSail, angDiff, NO_GO } = S;
  const POP = 60;

  const view = ML.setupCanvas(document.getElementById("sea"), W, H);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 200);
  const polarCv = ML.setupCanvas(document.getElementById("polar"), 110, 110);
  const ctx = view.ctx;

  const state = {
    playing: false,
    speed: 10,
    round: 1,
    brains: Array.from({ length: POP }, () => new Net(SIZES)),
    ch: { shift: false, gusts: false, current: false, islands: false, moveBuoy: false },
    history: [],
    markers: [],
    pending: null,
    cur: null,
    replay: null,
    human: null,
    between: 0,
    firstReach: false,
    saidTack: false,
  };
  const CH_NAMES = { shift: "wind shift", gusts: "gusty wind", current: "current", islands: "islands", moveBuoy: "moving buoy" };
  // Wind shift + gusts change only how the wind blows, and the boats measure everything relative to the wind.
  const MILD = { shift: true, gusts: true };
  const seedFor = (r) => r * 13 + 7;

  function newRound() {
    state.cur = new Round(state.brains, seedFor(state.round), state.ch);
  }

  // ---------- round end + narration ----------
  function endRound() {
    const r = state.cur.results();
    const pct = Math.round(r.topReached * 100);
    state.history.push(pct);
    const champ = state.cur.boats[r.best];
    state.champ = champ.brain.clone(); // the X-ray looks at this brain
    const path = champ.trail.slice();
    const sea = state.cur.sea;
    ckpts.add({
      label: `Round ${state.round}`,
      sub: champ.reached ? `${champ.tacks} tack${champ.tacks === 1 ? "" : "s"} · ${pct}%` : `${pct}% reached`,
      brain: state.brains[r.best].clone(),
      seed: seedFor(state.round),
      draw: (c) => drawMini(c, path, sea, champ.reached),
    });
    narrate(r, pct, champ);
    state.brains = nextGeneration(state.brains, r.fit, { mutation: 0.3 });
    drawChart();
  }
  function narrate(r, pct, champ) {
    const p = state.pending;
    if (p && state.round >= p.at) {
      const since = state.round - p.at;
      if (since === 0) {
        p.low = pct;
        if (pct < p.before - 10) ML.say(`Whoa! With <b>${p.name}</b>, only <b>${pct}%</b> of the best boats reached the buoy (was ${p.before}%). Their old plan doesn't fit any more.`);
        else if (MILD[p.key]) {
          ML.say(`With <b>${p.name}</b>, ${pct}% still made it! They measure everything as an <b>angle to the wind</b>, so when the wind moves, their plan moves with it.`);
          state.pending = null;
        } else ML.say(`With <b>${p.name}</b>, ${pct}% of the best boats still made it. Tough sailors! Watch the next rounds.`);
        return;
      }
      p.low = Math.min(p.low, pct);
      if (pct >= Math.min(85, p.before - 5) && p.low < p.before - 10) {
        ML.say(`They <b>adapted</b>! After ${since} more round${since > 1 ? "s" : ""}, <b>${pct}%</b> of the best boats reach the buoy again, even with ${p.name}.`);
        ML.confetti(40);
        ML.xray.offer("They adapted! X-ray the champion\u2019s brain");
        state.pending = null;
      } else if (since >= 14) {
        ML.say(`${p.name[0].toUpperCase() + p.name.slice(1)} is really hard: ${pct}% now. They're still slowly finding a way around it.`);
        state.pending = null;
      } else ML.say(`Round ${state.round}: ${pct}% of the best half made it. The fleet is still figuring out ${p.name}…`);
      return;
    }
    if (state.speed === 0 && state.round % 8 && state.firstReach) return;
    if (r.reached > 0 && !state.firstReach) {
      state.firstReach = true;
      ML.xray.offer("A boat learned to tack! X-ray its brain");
      ML.say(`Round ${state.round}: a boat reached the buoy with <b>${champ.tacks} tacks</b>, zig-zagging left and right of the wind! Its brain gets copied.`);
    } else if (state.round === 1) ML.say(`Round 1: random brains. Some point at the wind and <b>stall</b>, some sail one long line and hit the shore.`);
    else if (pct >= 85) ML.say(`Round ${state.round}: <b>${pct}%</b> of the best boats reach the buoy. They've discovered <b>tacking</b>! Now try a <b>challenge</b>.`);
    else ML.say(`Round ${state.round}: ${pct}% of the best half reached the buoy. ${pct > 30 ? "The zig-zag is catching on!" : "Still stuck on one long diagonal…"}`);
  }

  // ---------- drawing ----------
  let t = 0;
  const dark = () => ML.isDark();
  function drawSea(sea) {
    t++;
    // shores
    ctx.fillStyle = dark() ? "#3b3a2a" : "#ecdcaa";
    ctx.fillRect(0, 0, SHORE_L, H);
    ctx.fillRect(SHORE_R, 0, W - SHORE_R, H);
    ctx.fillStyle = dark() ? "#2c4a35" : "#9fd38a";
    ctx.fillRect(0, 0, SHORE_L - 22, H);
    ctx.fillRect(SHORE_R + 22, 0, W - SHORE_R - 22, H);
    // a few trees
    for (let i = 0; i < 7; i++) for (const x of [36 + (i % 2) * 40, W - 46 - (i % 2) * 40]) {
      const y = 30 + i * 62;
      ctx.fillStyle = dark() ? "#1f3a28" : "#6dbb5a";
      ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.fill();
    }
    // water
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, dark() ? "#1a466b" : "#5bb7ea");
    g.addColorStop(1, dark() ? "#123552" : "#2f8fd0");
    ctx.fillStyle = g;
    ctx.fillRect(SHORE_L, 0, SHORE_R - SHORE_L, H);
    // wave shimmer: little crests that drift downwind
    const wf = sea.windFrom(), wx = -Math.cos(wf), wy = -Math.sin(wf);
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 46; k++) {
      const bx = SHORE_L + ((k * 73) % (SHORE_R - SHORE_L)), by = (k * 131) % H;
      const x = SHORE_L + ((((bx - SHORE_L + wx * t * 0.4) % (SHORE_R - SHORE_L)) + (SHORE_R - SHORE_L)) % (SHORE_R - SHORE_L));
      const y = (((by + wy * t * 0.4) % H) + H) % H;
      const ph = Math.sin(t / 20 + k);
      ctx.globalAlpha = 0.5 + 0.5 * ph;
      ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.quadraticCurveTo(x, y - 4, x + 7, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // current arrows
    if (sea.ch.current) {
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      for (let k = 0; k < 5; k++) {
        const y = 60 + k * 80, x = SHORE_L + 10 + ((t * 0.55 + k * 47) % (SHORE_R - SHORE_L - 40));
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 22, y); ctx.lineTo(x + 16, y - 4); ctx.moveTo(x + 22, y); ctx.lineTo(x + 16, y + 4); ctx.stroke();
      }
    }
    // wind streaks blowing downwind
    ctx.strokeStyle = dark() ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.75)";
    ctx.lineWidth = 1.5;
    const str = sea.windStrength();
    for (let k = 0; k < 12; k++) {
      const bx = (k * 97) % W, by = (k * 151) % H;
      const x = (((bx + wx * t * 2.2 * str) % W) + W) % W, y = (((by + wy * t * 2.2 * str) % H) + H) % H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + wx * 26 * str, y + wy * 26 * str); ctx.stroke();
    }
    // islands
    for (const o of sea.islands) {
      ctx.fillStyle = "#ecdcaa"; ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 5, 0, 7); ctx.fill();
      ctx.fillStyle = "#6dbb5a"; ctx.beginPath(); ctx.arc(o.x, o.y, o.r - 3, 0, 7); ctx.fill();
      ctx.fillStyle = "#4f9a44"; ctx.beginPath(); ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.2, o.r * 0.4, 0, 7); ctx.fill();
    }
    // buoy, bobbing
    const b = sea.buoy, bob = Math.sin(t / 12) * 1.5;
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, 16 + (t % 40) / 4, 0, 7); ctx.globalAlpha = 1 - (t % 40) / 40; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = "#ff4d5e"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(b.x, b.y + bob, 10, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillRect(b.x - 10, b.y + bob - 2, 20, 4);
    // start line
    ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.beginPath(); ctx.moveTo(S.START.x - 40, S.START.y + 18); ctx.lineTo(S.START.x + 40, S.START.y + 18); ctx.stroke(); ctx.setLineDash([]);
    drawWindDial(sea);
  }
  function drawWindDial(sea) {
    // compass card top-left on the shore: arrow points the way the wind blows; grey slice = no-go zone
    const cx = 62, cy = 62, R = 40, wf = sea.windFrom();
    ctx.fillStyle = "rgba(31,33,64,.82)";
    ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, wf - NO_GO, wf + NO_GO); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.lineCap = "round";
    const x1 = cx + Math.cos(wf) * (R - 6), y1 = cy + Math.sin(wf) * (R - 6), x2 = cx - Math.cos(wf) * (R - 6), y2 = cy - Math.sin(wf) * (R - 6);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ah = 10, a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(a - 0.5) * ah, y2 - Math.sin(a - 0.5) * ah);
    ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(a + 0.5) * ah, y2 - Math.sin(a + 0.5) * ah); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#fff"; ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("WIND", cx, cy + R + 22);
  }

  function drawBoat(b, sea, hull, alpha, lead) {
    if (lead && b.trail.length > 4) {
      // wake trail
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2.5; ctx.setLineDash([2, 5]);
      ctx.beginPath();
      for (let i = 0; i < b.trail.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, b.trail[i], b.trail[i + 1]);
      ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.fillStyle = hull; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = lead ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(15, 0); ctx.quadraticCurveTo(6, -8, -11, -6); ctx.lineTo(-11, 6); ctx.quadraticCurveTo(6, 8, 15, 0);
    ctx.fill(); ctx.stroke();
    // sail: a boom swung out to the side away from the wind; slack and flapping when in irons
    const off = angDiff(b.a, sea.windFrom());
    const inIrons = Math.abs(off) < NO_GO;
    const side = off > 0 ? -1 : 1;
    const swing = inIrons ? Math.sin(t / 2) * 0.35 : side * Math.min(1.3, Math.max(0.15, (Math.abs(off) - 0.5) * 0.75));
    ctx.rotate(Math.PI + swing);
    ctx.fillStyle = inIrons ? "#e6e6ee" : "#fff";
    ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(8, side * (inIrons ? 1 : 6), 17, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    const run = state.human || state.replay || state.cur;
    drawSea(run.sea);
    if (state.human) {
      const b = state.human.boat;
      drawBoat(b, run.sea, "#ff8a3d", 1, true);
      const off = angDiff(b.a, run.sea.windFrom());
      label(b.reached ? `You made it with ${b.tacks} tacks! Press an arrow to go again` : b.dead ? (b.why === "stuck" ? "Stuck in irons! Press an arrow to try again" : "Bonk! Press an arrow to try again") : `You: ${pointOfSail(off)} · speed ${(b.v / S.VMAX * 100).toFixed(0)}%`);
      return;
    }
    const lead = run.leader();
    for (const b of window.__showBabies !== false ? run.boats : []) {
      if (b === lead || (b.dead && b.why !== "stuck")) continue;
      drawBoat(b, run.sea, b.reached ? ML.cssVar("--good") : "#ffffff", b.reached ? 0.9 : 0.32, false);
    }
    if (lead) drawBoat(lead, run.sea, lead.reached ? ML.cssVar("--good") : "#ff8a3d", 1, true);
    if (state.replay) label(`Replaying: champion of ${state.replay.item.label}`);
  }
  function label(text) {
    ctx.font = "800 13px Nunito, sans-serif";
    const w = Math.min(W - 20, ctx.measureText(text).width + 26);
    ctx.fillStyle = "rgba(31,33,64,.85)";
    ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, H - 36, w, 26, 9); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.fillText(text, W / 2, H - 18);
  }

  function drawMini(c, path, sea, reached) {
    const g = c.getContext("2d");
    const sx = 216 / W, sy = 120 / H;
    g.fillStyle = "#ecdcaa"; g.fillRect(0, 0, 216, 120);
    g.fillStyle = "#4aa9e0"; g.fillRect(SHORE_L * sx, 0, (SHORE_R - SHORE_L) * sx, 120);
    for (const o of sea.islands) { g.fillStyle = "#6dbb5a"; g.beginPath(); g.arc(o.x * sx, o.y * sy, o.r * sx, 0, 7); g.fill(); }
    g.fillStyle = "#ff4d5e"; g.beginPath(); g.arc(sea.buoy.x * sx, sea.buoy.y * sy, 4, 0, 7); g.fill();
    g.strokeStyle = reached ? "#2fbf62" : "#ff8a3d"; g.lineWidth = 2.5; g.lineJoin = "round";
    g.beginPath(); g.moveTo(S.START.x * sx, S.START.y * sy);
    for (let i = 0; i < path.length; i += 2) g.lineTo(path[i] * sx, path[i + 1] * sy);
    g.stroke();
  }

  function drawChart() {
    GameLab.drawChart(chart, [{ values: state.history, color: "--accent" }], state.markers, 100, "%");
  }

  // The little speed-by-direction diagram ("polar") on the left.
  function drawPolar() {
    const c = polarCv.ctx, cx = 55, cy = 55, R = 46;
    c.clearRect(0, 0, 110, 110);
    c.fillStyle = ML.cssVar("--bg-2"); c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
    c.fillStyle = ML.cssVar("--line"); c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, -Math.PI / 2 - NO_GO, -Math.PI / 2 + NO_GO); c.closePath(); c.fill();
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 3; c.beginPath();
    for (let d = -180; d <= 180; d += 3) {
      const a = (d * Math.PI) / 180, r = R * polar(a), x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r;
      d === -180 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    c.fillStyle = ML.cssVar("--muted"); c.font = "800 9px Nunito, sans-serif"; c.textAlign = "center";
    c.fillText("WIND", cx, 8);
  }

  // ---------- inside card ----------
  let tick = 0;
  function renderInside() {
    if (++tick % 10) return;
    const run = state.human || state.replay || state.cur;
    const b = state.human ? state.human.boat : run.leader();
    if (!b || !b.input.length) return;
    const sea = run.sea, deg = (r) => Math.round((Math.abs(r) * 180) / Math.PI);
    const toBuoy = Math.atan2(sea.buoy.y - b.y, sea.buoy.x - b.x);
    const buoyOff = angDiff(toBuoy, sea.windFrom());
    const inNoGo = Math.abs(buoyOff) < NO_GO + 0.1;
    const off = angDiff(b.a, sea.windFrom());
    const pos = b.input[8];
    const nearShore = Math.abs(pos) > 0.75;
    const lines = [
      `${ML.icon("sparkles")} Wind comes from <b>${deg(angDiff(sea.windFrom(), b.a)) < 20 ? "straight ahead" : angDiff(sea.windFrom(), b.a) < 0 ? "my left" : "my right"}</b>`,
      `${ML.icon("flag")} Buoy is ${deg(buoyOff)}° off the wind → ${inNoGo ? "<b>inside the no-go zone</b>: pointing at it = stall" : "<b>sail-able</b>: I can head straight there"}`,
    ];
    if (state.human) {
      lines.push(`${ML.icon("gauge")} I'm <b>${pointOfSail(off)}</b> at ${deg(off)}° off the wind, speed ${Math.round((b.v / S.VMAX) * 100)}%`);
    } else {
      const course = b.course ?? 0;
      lines.push(`<div class="arrow">${ML.icon("arrow-down")}</div>`);
      lines.push(`${ML.icon("cpu")} Brain picks: <b style="color:var(--accent)">${deg(course)}° ${course < 0 ? "left" : "right"} of the wind</b> (${pointOfSail(course)})`);
      lines.push(`${ML.icon("gauge")} So I'm ${pointOfSail(off)}, speed <b>${Math.round((b.v / S.VMAX) * 100)}%</b>${nearShore ? ` · <b>shore close</b>: time to tack!` : ""}`);
      lines.push(`${ML.icon("repeat")} Tacks so far: <b>${b.tacks}</b>`);
    }
    document.getElementById("inside").innerHTML = lines.map((l) => (l.startsWith("<div") ? l : `<div>${l}</div>`)).join("");
  }

  // ---------- replay + sailing yourself ----------
  const ckpts = new GameLab.Checkpoints(document.getElementById("ckpts"), (item) => {
    state.playing = false;
    syncPlay();
    state.replay = new Round([item.brain], item.seed, { ...state.ch });
    state.replay.item = item;
    ML.say(`This is the champion from <b>${item.label}</b>, sailing on today's sea. Watch its wake: ${item.label === "Round 1" ? "one long line, or a stall?" : "count the zig-zags!"}`);
  }, () => { state.replay = null; });

  const keys = { left: false, right: false };
  function startHuman() {
    state.human = { sea: new Sea(seedFor(state.round), state.ch), boat: new Sailboat(null), wait: false };
  }
  function humanStep() {
    const h = state.human, b = h.boat;
    if (b.dead || b.reached) {
      if (keys.left || keys.right) { if (!h.wait) startHuman(); }
      else h.wait = false;
      return;
    }
    h.sea.step();
    b.step(h.sea, (keys.right ? 1 : 0) - (keys.left ? 1 : 0));
    if (b.reached) { ML.confetti(40); ML.say(`You reached the buoy in ${b.steps} steps with <b>${b.tacks} tacks</b>! Now watch the fleet learn the same trick.`); h.wait = true; }
    else if (b.dead) {
      ML.say(b.why === "stuck" ? `Stuck in <b>irons</b>: pointing into the wind, the sail just flaps. Try sailing a bit to the side, then switch!` : `Bonk! The channel is narrow, so you have to switch sides before the shore.`);
      h.wait = true;
    }
  }
  const keyMap = { ArrowLeft: "left", ArrowRight: "right", KeyA: "left", KeyD: "right" };
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
      steerBtn.innerHTML = `${ML.icon("gamepad")} I'll sail a boat`;
      ML.say(`Back to the fleet! Press <b>Play</b>.`);
      return;
    }
    state.playing = false;
    syncPlay();
    state.replay = null;
    startHuman();
    document.getElementById("pad").classList.add("show");
    steerBtn.innerHTML = `${ML.icon("x")} Stop sailing`;
    ML.say(`Your turn! <b>Left/right</b> steers. The sail trims itself. Hint: you can't point straight at the buoy…`);
  });

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    if (state.human) steerBtn.click();
    if (state.replay) { state.replay = null; ckpts.active = null; ckpts.render(); }
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.round === 1 && state.cur.steps === 0) ML.say(`Round 1! ${POP} boats with random brains, all starting pointed straight into the wind…`);
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
    state.firstReach = false;
    ckpts.clear();
    newRound();
    drawChart();
    ML.say(`All learning erased. Back to ${POP} clueless boats!`);
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));
  document.querySelectorAll("#chal button").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    state.ch[c] = !state.ch[c];
    b.classList.toggle("on", state.ch[c]);
    if (state.ch[c]) {
      const n = Math.min(3, state.history.length);
      const before = n ? Math.round(state.history.slice(-n).reduce((a, x) => a + x, 0) / n) : 0;
      state.markers.push({ at: state.history.length + 1, label: CH_NAMES[c] });
      state.pending = { key: c, name: CH_NAMES[c], before, at: state.round + 1 };
      ML.say(`<b>${CH_NAMES[c][0].toUpperCase() + CH_NAMES[c].slice(1)}</b> starts next round! The fleet's brains were tuned for the old sea. Will they cope?`);
    } else ML.say(`${CH_NAMES[c][0].toUpperCase() + CH_NAMES[c].slice(1)} switched off.`);
    if (state.human) startHuman();
    drawChart();
  }));
  document.addEventListener("themechange", () => { drawChart(); drawPolar(); ckpts.render(); });

  // ---------- loop ----------
  newRound();
  drawChart();
  drawPolar();
  ckpts.render();
  syncPlay();
  function frame() {
    if (state.human) humanStep();
    else if (state.replay) {
      for (let i = 0; i < Math.max(1, Math.min(state.speed, 3)); i++) state.replay.step();
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
        // Turbo: a few rounds a second, so the chart and checkpoints still tell the story.
        const t0 = performance.now();
        for (let i = 0; i < 400 && performance.now() - t0 < 10; i++) {
          state.cur.step();
          if (state.cur.done) { endRound(); state.round++; newRound(); state.between = 6; break; }
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
    document.getElementById("st-done").textContent = run.boats.filter((b) => b.reached).length;
    const last = state.history[state.history.length - 1];
    document.getElementById("st-top").innerHTML = last === undefined ? "–" : `${last}<small>%</small>`;
    const lead = (state.human ? null : (state.replay || state.cur).leader());
    document.getElementById("st-tacks").textContent = state.human ? state.human.boat.tacks : lead ? lead.tacks : 0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // ---------- Model X-ray ----------
  const sailSeen = [];
  setInterval(() => {
    const b = state.cur && state.cur.boats.find((x) => !x.dead && !x.reached && x.input && x.input.length);
    if (b) { sailSeen.push(b.input.slice()); if (sailSeen.length > 500) sailSeen.shift(); }
  }, 80);
  let netNow = null;
  const side = (l, r) => (v) => (Math.abs(v) < 0.15 ? "straight on" : v < 0 ? l : r);
  const near = (v) => (v < 0.05 ? "clear" : v > 0.6 ? "very close" : v > 0.3 ? "close" : "far");
  ML.xray.register({
    title: "The champion sailor's brain",
    kind: "Neural network",
    summary: () => `evolved over ${state.round - 1} rounds`,
    size: () => `${(state.champ || state.brains[0]).genes.length} knobs`,
    stats: () => [["Rounds", state.round - 1], ["Best reached", `${Math.max(0, ...state.history)}%`], ["Layers", (state.champ || state.brains[0]).sizes.join(" → ")]],
    inputs: [
      { name: "Buoy to the side", min: -1, max: 1, describe: side("to my left", "to my right") },
      { name: "Buoy in front", min: -1, max: 1, describe: (v) => (v > 0.3 ? "in front" : v < -0.3 ? "behind" : "beside") },
      { name: "Wind from the side", min: -1, max: 1, describe: side("from my left", "from my right") },
      { name: "Wind in my face", min: -1, max: 1, describe: (v) => (v > 0.3 ? "in my face" : v < -0.3 ? "from behind" : "from the side") },
      { name: "Speed", min: 0, max: 1, describe: (v) => `${Math.round(v * 100)}%` },
      { name: "Buoy distance", min: 0, max: 1, describe: (v) => (v < 0.2 ? "very near" : v < 0.6 ? "medium" : "far") },
      { name: "Current sideways", min: -1, max: 1, describe: side("pushing left", "pushing right") },
      { name: "Current up/down", min: -1, max: 1, describe: (v) => (Math.abs(v) < 0.1 ? "calm" : v < 0 ? "pushing up" : "pushing down") },
      { name: "Where across the channel", min: -1, max: 1, describe: (v) => (v < -0.5 ? "near left shore" : v > 0.5 ? "near right shore" : "middle") },
      ...["Eye far left", "Eye left", "Eye ahead", "Eye right", "Eye far right"].map((n) => ({ name: n, min: 0, max: 1, describe: near })),
    ],
    outputs: [{ name: "Sail left of the wind", color: ML.cssVar("--sup") }, { name: "Sail right of the wind", color: ML.cssVar("--rl") }],
    predict: (x) => { const o = netNow.forward(x)[0]; return [-o, o]; },
    samples: () => sailSeen,
    current: () => { const b = state.cur && state.cur.boats.find((x) => !x.dead && x.input && x.input.length); return b ? b.input.slice() : null; },
    drawBrain: (cv) => { const n = netNow; ML.xray.drawNet(cv, n.sizes, (l, i, j) => n.weight(l, i, j), ["buoy side", "buoy front", "wind side", "wind face", "speed", "buoy distance", "current ↔", "current ↕", "across channel", "far-left eye", "left eye", "ahead eye", "right eye", "far-right eye"], ["course"]); },
    brainCaption: ML.xray.NET_CAPTION + " Its single output picks the course: below zero = left of the wind, above zero = right. Flipping between them is a tack!",
    notes: ["Switching from 'left of the wind' to 'right of the wind' is a tack. Look at the rules: the boat learned to flip when it gets near a shore."],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { netNow = (state.champ || state.brains[0]).clone(); _xo(); };
  ML.xray.button(document.getElementById("play").parentElement);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still sailing", count: () => (state.human || state.replay || !state.cur ? null : [state.cur.boats.filter((b) => !b.dead && !b.reached).length, state.cur.boats.length]) });
})();
