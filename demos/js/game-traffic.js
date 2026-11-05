// Traffic Light Tamer — page: two crossroads side by side (yours or Robo's vs a fixed timer, same cars),
// "you switch" mode, the Q-learning loop with a round-by-round chart, the Q-table heatmap, challenges,
// checkpoints and the Model X-ray. Logic lives in game-traffic-core.js.
(function () {
  const T = window.TrafficCore;
  const $ = (id) => document.getElementById(id);
  const RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ROUND_YOU = 120, ROUND_ROBO = 600, TIMER_GREEN = 12, TURBO = 3000;
  const CH = {
    rush: { label: "rush hour", name: "Rush hour" },
    amb: { label: "ambulances", name: "Ambulances" },
    yellow: { label: "long yellows", name: "Long yellow lights" },
  };
  const TRY = {
    rush: "<b>Try this:</b> turn Rush hour off again. Does Robo's cheat-sheet still work when both roads are equally busy? Watch the chart.",
    amb: "<b>Try this:</b> look under the cheat-sheet at the two ambulance squares. Robo learned: ambulance at the red light = <b>switch</b>!",
    yellow: "<b>Try this:</b> compare the <b>Switches</b> numbers. Every yellow wastes 5 seconds, so Robo now switches less often than before.",
  };

  // ---------- state ----------
  const state = {
    mode: "you", playing: true, tps: 3, acc: 0,
    agent: null, replay: null,
    A: null, B: null, arr: null, timer: new T.TimerCtl(TIMER_GREEN), seed: 11,
    roundTicks: 0, wantSwitch: false,
    you: [], youBest: null, youSwitchesTotal: 0,
    robo: [], timerH: [], roboSw: [], markers: [], pending: [],
    chal: { rush: { on: false, done: false }, amb: { on: false, done: false }, yellow: { on: false, done: false } },
    beatOnce: false, slice: -1,
    movers: [], disp: [new Map(), new Map()],
    lastInput: performance.now(), lastNudge: 0, sayUntil: 0, lastKidTip: 0,
    knobs: { eps: 0.05, alpha: 0.1, gamma: 0.9 },
    rushSaved: null,
  };

  function newAgent() { return new T.QAgent({ ...state.knobs }, 7); }
  state.agent = newAgent();

  function cfg() {
    return {
      ns: +$("ns").value / 60, ew: +$("ew").value / 60,
      amb: state.chal.amb.on, ambEvery: 45, yellow: state.chal.yellow.on ? 5 : 2,
    };
  }
  function applyCfg() { const c = cfg(); if (state.A) { Object.assign(state.A.cfg, c); Object.assign(state.B.cfg, c); } }
  function newWorlds() {
    state.seed++;
    state.A = new T.World(cfg()); state.B = new T.World(cfg());
    state.arr = new T.Arrivals(state.seed * 7919);
    state.roundTicks = 0; state.movers = []; state.disp = [new Map(), new Map()];
    state.agent.forgetPending();
    if (state.replay) state.replay.agent.forgetPending();
  }
  const roundLen = () => (state.mode === "you" ? ROUND_YOU : ROUND_ROBO);
  const secs = (v) => v.toFixed(1);
  const fmtClock = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

  // narration that is not instantly overwritten by chatter
  function talk(html, holdMs = 4000, force = false) {
    const now = performance.now();
    if (!force && now < state.sayUntil) return;
    ML.say(html);
    state.sayUntil = now + holdMs;
  }

  // ---------- canvases ----------
  const crossEl = $("cross");
  let view = { ctx: null, w: 640, h: 350 };
  function sizeCross() {
    const box = crossEl.parentElement;
    const W = Math.round(ML.clamp(box.clientWidth - 4 || 640, 300, 900));
    crossEl.style.aspectRatio = "";
    view = ML.setupCanvas(crossEl, W, Math.round(W / 2 + 28));
  }
  const chartCv = ML.setupCanvas($("chart"), 640, 200);
  const heatCv = ML.setupCanvas($("heat"), 300, 340);

  let colors = {};
  function readColors() {
    const dark = ML.isDark();
    colors = {
      grass: dark ? "#25432f" : "#a6dcaa", grass2: dark ? "#2b4b35" : "#b4e3b6",
      road: dark ? "#3b404b" : "#5d6472", line: dark ? "#c9ced8" : "#ffffff", stop: dark ? "#e8ebf0" : "#ffffff",
      walk: dark ? "#555b67" : "#7c8494",
      cars: ["--sup", "--rl", "--vision", "--diff", "--nn", "--lang"].map((c) => ML.cssVar(c)),
      ink: ML.cssVar("--ink"), muted: ML.cssVar("--muted"), good: ML.cssVar("--good"), bad: ML.cssVar("--bad"),
      warn: ML.cssVar("--warn"), accent: ML.cssVar("--accent"), card: ML.cssVar("--card"), lineV: ML.cssVar("--line"),
      yellow: "#ffc93c", red: "#ff5a5a", green: "#3ddc84",
    };
  }

  // ---------- drawing the crossroads ----------
  function geo(ox, oy, S) {
    const rw = S * 0.3, half = rw / 2, cs = S * 0.062;
    return { ox, oy, S, c: ox + S / 2, cy: oy + S / 2, rw, half, cs, cl: cs * 0.8, cw: rw * 0.3, slots: Math.max(2, Math.floor((S / 2 - half - 8) / cs)) };
  }
  // where queued car k on approach dir sits (k can be fractional while sliding)
  function slotPos(g, dir, k) {
    const off = g.half + 6 + g.cs / 2 + k * g.cs;
    if (dir === "N") return { x: g.c - g.rw / 4, y: g.cy - off, hz: false };
    if (dir === "S") return { x: g.c + g.rw / 4, y: g.cy + off, hz: false };
    if (dir === "W") return { x: g.c - off, y: g.cy + g.rw / 4, hz: true };
    return { x: g.c + off, y: g.cy - g.rw / 4, hz: true };
  }
  // a car driving through: p = 0 at the stop line, 1 past the far edge
  function movePos(g, dir, p) {
    const d0 = g.half + 6 + g.cs / 2, d = d0 - p * (d0 + g.S / 2 + g.cl);
    if (dir === "N") return { x: g.c - g.rw / 4, y: g.cy - d, hz: false };
    if (dir === "S") return { x: g.c + g.rw / 4, y: g.cy + d, hz: false };
    if (dir === "W") return { x: g.c - d, y: g.cy + g.rw / 4, hz: true };
    return { x: g.c + d, y: g.cy - g.rw / 4, hz: true };
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function drawCar(ctx, g, p, id, amb, now) {
    const L = g.cl, W = g.cw, w = p.hz ? L : W, h = p.hz ? W : L;
    ctx.fillStyle = amb ? "#ffffff" : colors.cars[id % colors.cars.length];
    rr(ctx, p.x - w / 2, p.y - h / 2, w, h, Math.min(w, h) * 0.3); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.stroke();
    // windows
    ctx.fillStyle = "rgba(20,30,50,.45)";
    if (p.hz) ctx.fillRect(p.x - w * 0.12, p.y - h * 0.32, w * 0.24, h * 0.64);
    else ctx.fillRect(p.x - w * 0.32, p.y - h * 0.12, w * 0.64, h * 0.24);
    if (amb) {
      const s = Math.min(w, h) * 0.5;
      ctx.fillStyle = "#e23b3b";
      ctx.fillRect(p.x - s / 2, p.y - s / 6, s, s / 3); ctx.fillRect(p.x - s / 6, p.y - s / 2, s / 3, s);
      if (RM || Math.floor(now / 250) % 2) { ctx.fillStyle = "rgba(80,150,255,.55)"; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(w, h) * 0.75, 0, 7); ctx.fill(); }
    }
  }
  function lightColor(world, dir) {
    const onGreen = T.PHASE_DIRS[world.phase].includes(dir);
    if (!onGreen) return colors.red;
    return world.yellow > 0 ? colors.yellow : colors.green;
  }
  function drawCrossroad(ctx, side, g, world, title, simT, now, dt) {
    const { ox, oy, S, c, cy, rw, half } = g;
    ctx.save();
    rr(ctx, ox, oy, S, S, 14); ctx.clip();
    ctx.fillStyle = colors.grass; ctx.fillRect(ox, oy, S, S);
    ctx.fillStyle = colors.grass2;
    for (let i = 0; i < 4; i++) { const qx = i % 2 ? c + half + 8 : ox + 8, qy = i < 2 ? oy + 8 : cy + half + 8; rr(ctx, qx, qy, S / 2 - half - 16, S / 2 - half - 16, 10); ctx.fill(); }
    ctx.fillStyle = colors.road;
    ctx.fillRect(c - half, oy, rw, S); ctx.fillRect(ox, cy - half, S, rw);
    // centre lines and stop lines
    ctx.strokeStyle = colors.line; ctx.lineWidth = 1.5; ctx.setLineDash([S * 0.03, S * 0.025]);
    ctx.beginPath();
    ctx.moveTo(c, oy); ctx.lineTo(c, cy - half); ctx.moveTo(c, cy + half); ctx.lineTo(c, oy + S);
    ctx.moveTo(ox, cy); ctx.lineTo(c - half, cy); ctx.moveTo(c + half, cy); ctx.lineTo(ox + S, cy);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = colors.stop; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c - half, cy - half - 3); ctx.lineTo(c, cy - half - 3);
    ctx.moveTo(c, cy + half + 3); ctx.lineTo(c + half, cy + half + 3);
    ctx.moveTo(c - half - 3, cy); ctx.lineTo(c - half - 3, cy + half);
    ctx.moveTo(c + half + 3, cy - half); ctx.lineTo(c + half + 3, cy);
    ctx.stroke();
    // queued cars (sliding smoothly toward their slot)
    const disp = state.disp[side], seen = new Set(), snap = RM || state.tps > 40;
    for (const dir of T.DIRS) {
      const q = world.q[dir];
      q.forEach((car, k) => {
        seen.add(car.id);
        let d = disp.get(car.id);
        if (d === undefined || snap) d = d === undefined ? Math.min(k + 3, g.slots + 1) : k;
        if (snap) d = k; else d += (k - d) * Math.min(1, dt * 9);
        disp.set(car.id, d);
        if (d < g.slots) drawCar(ctx, g, slotPos(g, dir, d), car.id, car.amb, now);
      });
    }
    for (const id of disp.keys()) if (!seen.has(id)) disp.delete(id);
    // cars driving through
    if (!snap) for (const m of state.movers) if (m.side === side) {
      const p = (simT - m.t0) / 1.8;
      if (p >= 0 && p <= 1) drawCar(ctx, g, movePos(g, m.dir, p), m.id, m.amb, now);
    }
    // overflow and queue badges, lights
    ctx.font = `800 ${Math.max(10, S * 0.042)}px Nunito, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const dir of T.DIRS) {
      const n = world.q[dir].length;
      const end = slotPos(g, dir, g.slots - 0.4);
      let bx = end.x, by = end.y;
      const off = rw * 0.42;
      if (dir === "N") bx -= off; else if (dir === "S") bx += off; else if (dir === "W") by += off; else by -= off;
      const bw = S * 0.11, bh = S * 0.065;
      ctx.fillStyle = n >= 8 ? colors.bad : "rgba(0,0,0,.55)";
      rr(ctx, bx - bw / 2, by - bh / 2, bw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(n > g.slots ? `${n}!` : n, bx, by + 1);
      // the light
      const lp = slotPos(g, dir, -0.2);
      let lx = lp.x, ly = lp.y;
      if (dir === "N") lx -= rw / 2 + 2; else if (dir === "S") lx += rw / 2 + 2; else if (dir === "W") ly += rw / 2 + 2; else ly -= rw / 2 + 2;
      const r = Math.max(4, S * 0.022);
      ctx.fillStyle = "#1d2230"; rr(ctx, lx - r - 2, ly - r - 2, 2 * r + 4, 2 * r + 4, 4); ctx.fill();
      ctx.fillStyle = lightColor(world, dir); ctx.beginPath(); ctx.arc(lx, ly, r, 0, 7); ctx.fill();
    }
    // green / yellow timer in the middle of the junction
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = `800 ${Math.max(10, S * 0.045)}px Nunito, sans-serif`;
    ctx.fillText(world.yellow > 0 ? "yellow" : `${world.since}s`, c, cy + 1);
    ctx.restore();
    // title above
    ctx.fillStyle = colors.ink; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const small = S < 260;
    ctx.font = `800 ${small ? 12 : 14}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(small ? title.replace(/ \(.*\)$/, "").replace("'s crossroads", "").replace("Your crossroads", "You") : title, ox + 4, oy - 9);
    if (!small) {
      ctx.textAlign = "right"; ctx.font = "700 12px Nunito, sans-serif"; ctx.fillStyle = colors.muted;
      ctx.fillText(`${world.waiting()} waiting`, ox + S - 4, oy - 9);
    }
  }

  let lastFrame = performance.now();
  function render(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    const { ctx, w, h } = view;
    ctx.clearRect(0, 0, w, h);
    const S = Math.min((w - 16) / 2, h - 30), gap = w - 2 * S;
    const simT = state.A.t + (RM || state.tps > 40 ? 0 : Math.min(state.acc, 1));
    const titleA = state.replay ? `Old Robo (${state.replay.label})` : state.mode === "you" ? "Your crossroads" : "Robo's crossroads";
    drawCrossroad(ctx, 0, geo(gap / 3, 26, S), state.A, titleA, simT, now, dt);
    drawCrossroad(ctx, 1, geo(w - gap / 3 - S, 26, S), state.B, `Timer light (${TIMER_GREEN} s each)`, simT, now, dt);
    if (state.mode === "you" && !state.replay) {
      ctx.fillStyle = "rgba(0,0,0,.5)";
      const tx = gap / 3 + S / 2, ty = 26 + S - 14;
      rr(ctx, tx - 62, ty - 11, 124, 22, 11); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "800 12px Nunito, sans-serif";
      ctx.fillText("tap to switch", tx, ty + 1); ctx.textBaseline = "alphabetic";
    }
    state.movers = state.movers.filter((m) => simT - m.t0 <= 1.8);
  }

  // ---------- simulation ----------
  function tick() {
    const A = state.A, B = state.B, arrivals = state.arr.next(A.cfg);
    let sw = false;
    if (state.replay) sw = state.replay.agent.act(A, false);
    else if (state.mode === "robo") sw = state.agent.act(A, true);
    else { sw = state.wantSwitch && A.canSwitch(); if (sw) state.youSwitchesTotal++; state.wantSwitch = false; }
    const rA = A.step(arrivals, sw);
    if (state.mode === "robo" && !state.replay) state.agent.feel(rA.reward);
    const rB = B.step(arrivals, state.timer.act(B));
    if (!RM && state.tps <= 40) {
      for (const c of rA.left) state.movers.push({ side: 0, dir: c.dir, id: c.id, amb: c.amb, t0: A.t });
      for (const c of rB.left) state.movers.push({ side: 1, dir: c.dir, id: c.id, amb: c.amb, t0: B.t });
    }
    if (++state.roundTicks >= roundLen()) endRound();
  }

  function overlay(html, ms = 3200) {
    const o = $("overlay");
    o.innerHTML = html; o.classList.add("show");
    clearTimeout(overlay.t); overlay.t = setTimeout(() => o.classList.remove("show"), ms);
  }

  function endRound() {
    const A = state.A, B = state.B, a = A.avgWait(), b = B.avgWait();
    if (state.replay) {
      talk(`Old Robo (${state.replay.label}) just finished 10 pretend minutes: <b>${secs(a)} s</b> wait per car vs the timer's <b>${secs(b)} s</b>. ${a < b ? "Even then it was beating the timer!" : "Back then it still had lots to learn."} Tap <b>Back to live</b> to keep training.`, 6000, true);
    } else if (state.mode === "you") {
      state.you.push({ you: a, timer: b });
      const best = state.youBest === null || a < state.youBest;
      if (best) state.youBest = a;
      $("lg-you").classList.remove("hidden");
      const win = a < b;
      overlay(`${win ? ML.icon("trophy") + " You win!" : "Timer wins this time"} · you ${secs(a)} s, timer ${secs(b)} s`);
      if (win) { ML.toast(`You beat the timer: ${secs(a)} s vs ${secs(b)} s per car!`); if (state.you.filter((r) => r.you < r.timer).length === 1) ML.confetti(60); }
      talk(win
        ? `Nice light-taming! Your cars waited <b>${secs(a)} s</b>, the timer's waited <b>${secs(b)} s</b>. You watched the queues, the timer can't. Now pick <b>Robo learns</b>: can a robot learn that trick from scratch?`
        : `Your cars waited <b>${secs(a)} s</b> on average, the timer's <b>${secs(b)} s</b>. Tip: switch when the red queue is longer than the green one, but not too often, because every yellow wastes time. Another round is starting!`, 7000, true);
      drawChart();
    } else {
      state.robo.push(a); state.timerH.push(b); state.roboSw.push(A.round.switches);
      const n = state.robo.length;
      const snap = state.agent.clone();
      // save often early on, then less often (and right after a challenge is beaten)
      if (n <= 6 || [8, 10, 13, 16, 20, 25, 30].includes(n) || n % 10 === 0 || state.saveNext) {
        state.saveNext = false;
        ckpts.add({ label: `Round ${n}`, sub: `<small>Robo ${secs(a)} s · timer ${secs(b)}</small>`, agent: snap, draw: (cv) => drawMini(cv, snap) });
      }
      checkChallenges(A, B);
      narrateRound(a, b, n);
      drawChart();
    }
    A.resetRound(); B.resetRound();
    state.roundTicks = 0;
  }

  function narrateRound(a, b, n) {
    const last3 = state.robo.slice(-3), t3 = state.timerH.slice(-3);
    const avg = (x) => x.reduce((p, q) => p + q, 0) / x.length;
    if (!state.beatOnce && a < b && n >= 2) {
      state.beatOnce = true;
      ML.toast(`Round ${n}: Robo beat the timer!`);
      ML.confetti(70);
      talk(`Round ${n}: my cars waited <b>${secs(a)} s</b>, the timer's <b>${secs(b)} s</b>. <b>I beat the timer!</b> Look at my cheat-sheet: green squares mean "keep", orange mean "switch". Now throw a <b>challenge</b> at me!`, 8000, true);
      ML.xray.offer("Robo beat the timer! X-ray its cheat-sheet");
      return;
    }
    if (state.pending.length) return; // challenge narration takes over
    if (n === 1) talk(`Round 1 done: <b>${secs(a)} s</b> per car (timer: ${secs(b)} s). My cheat-sheet was empty, so I tried silly things on purpose to learn what happens. Watch the orange line drop!`, 6000, true);
    else if (n % 3 === 0) {
      const better = avg(last3) < avg(t3);
      talk(better
        ? `Last 3 rounds: me <b>${secs(avg(last3))} s</b>, timer <b>${secs(avg(t3))} s</b>. I give green to whichever road actually has cars. ${allDone() ? "Peek at the checkpoints to see how my cheat-sheet grew." : "Try a challenge!"}`
        : `Last 3 rounds: me <b>${secs(avg(last3))} s</b>, timer <b>${secs(avg(t3))} s</b>. Still filling in my cheat-sheet${state.tps < 1000 ? ". Try <b>Turbo</b> so I can practise faster!" : "..."}`, 5000);
    }
  }

  // ---------- challenges ----------
  const allDone = () => Object.values(state.chal).every((c) => c.done);
  function startPending(key) {
    if (state.pending.some((p) => p.key === key)) return;
    state.markers.push({ at: state.robo.length, label: CH[key].label });
    state.pending.push({ key, firstFull: state.robo.length + (state.roundTicks > 0 ? 1 : 0), sw0: state.roboSw.length ? state.roboSw[state.roboSw.length - 1] : Infinity });
    drawChart();
  }
  function checkChallenges(A, B) {
    const idx = state.robo.length - 1;
    for (const p of state.pending.slice()) {
      if (idx < p.firstFull) {
        const a = A.avgWait(), b = B.avgWait();
        const msg = {
          rush: `Rush hour! North–south is jammed and my old cheat-sheet says "switch" too soon. Round ${idx + 1}: me ${secs(a)} s, timer ${secs(b)} s. Give me a round or two to adapt.`,
          amb: `Ambulances! Every second one waits costs me 25 ouch-points. My cheat-sheet has never seen one, so I'm learning what to do right now.`,
          yellow: `Long yellows! Each switch now freezes the whole crossroads for 5 seconds. My old habit of switching often is costing me. Learning...`,
        }[p.key];
        talk(msg, 5000, true);
        continue;
      }
      let ok = false, how = "";
      const a = A.avgWait(), b = B.avgWait();
      if (p.key === "rush") { ok = a < b; how = `In rush hour my cars waited <b>${secs(a)} s</b>, the timer's <b>${secs(b)} s</b>. The timer keeps giving 12 s to the empty road, so its north–south queue never ends!`; }
      if (p.key === "amb") { const ra = A.ambAvgWait(), rb = B.ambAvgWait(); ok = A.round.amb >= 3 && ra < rb; how = `Ambulances now wait <b>${secs(ra)} s</b> at my crossroads, <b>${secs(rb)} s</b> at the timer's. I learned to switch the moment one waits at red.`; }
      if (p.key === "yellow") { ok = a < b && A.round.switches < p.sw0; how = `With 5 s yellows I switched <b>${A.round.switches}</b> times (it was ${p.sw0 === Infinity ? "more" : p.sw0} before) and my cars waited <b>${secs(a)} s</b> vs the timer's <b>${secs(b)} s</b>.`; }
      if (ok) completeChallenge(p.key, how);
      else talk(`${CH[p.key].name}: not there yet (me ${secs(a)} s, timer ${secs(b)} s). Each round my cheat-sheet gets a little better.`, 4000);
    }
  }
  function completeChallenge(key, how) {
    state.pending = state.pending.filter((p) => p.key !== key);
    const c = state.chal[key];
    if (c.done) return;
    c.done = true;
    state.saveNext = true;
    document.querySelector(`#chal [data-c="${key}"]`).classList.add("done");
    ML.toast(`Challenge done: ${CH[key].name}!`);
    ML.confetti(90);
    talk(`<b>I adapted!</b> ${how}`, 9000, true);
    const t = $("try"); t.innerHTML = TRY[key]; t.classList.remove("hidden");
    if (allDone()) {
      $("chal").classList.add("done");
      setTimeout(() => { ML.toast("All three challenges beaten. Traffic tamed!"); ML.confetti(150); }, 1600);
    }
  }
  function toggleChallenge(key, btn) {
    const c = state.chal[key];
    c.on = !c.on;
    btn.classList.toggle("on", c.on); btn.setAttribute("aria-pressed", c.on);
    if (key === "rush") {
      if (c.on) { state.rushSaved = [$("ns").value, $("ew").value]; $("ns").value = 25; $("ew").value = 6; }
      else if (state.rushSaved) { $("ns").value = state.rushSaved[0]; $("ew").value = state.rushSaved[1]; }
      $("ns").dispatchEvent(new Event("input")); $("ew").dispatchEvent(new Event("input"));
    }
    applyCfg();
    document.querySelectorAll(".amb-row").forEach((r) => r.classList.toggle("hidden", !state.chal.amb.on));
    if (!c.on) { state.pending = state.pending.filter((p) => p.key !== key); talk(`${CH[key].name} is off. ${state.mode === "robo" ? "Watch how my cheat-sheet copes with normal traffic again." : ""}`, 3000, true); return; }
    if (state.mode === "robo" && !state.replay) { if (!c.done) startPending(key); else talk(`${CH[key].name} again! I already know this one, so watch: hardly any dip this time.`, 4000, true); }
    else talk({
      rush: "Rush hour at <b>your</b> crossroads: 25 cars a minute from north and south, only 6 from east and west. Can you keep up? (Robo gets the real challenge in <b>Robo learns</b> mode.)",
      amb: "Ambulances (white with a red cross) now appear. Get them through fast! Robo's version of this challenge starts in <b>Robo learns</b> mode.",
      yellow: "Yellow lights now last 5 seconds: nobody moves while it's yellow. Switch wisely! Robo faces this in <b>Robo learns</b> mode.",
    }[key], 6000, true);
  }

  // ---------- chart ----------
  function drawChart() {
    const all = state.robo.concat(state.timerH, state.youBest !== null ? [state.youBest] : []);
    const mx = all.length ? Math.max(...all) : 12;
    const yMax = Math.min(40, Math.max(12, Math.ceil((mx * 1.1) / 4) * 4));
    GameLab.drawChart(chartCv, [
      { values: state.timerH, color: "--warn" },
      { values: state.robo, color: "--accent" },
    ], state.markers, yMax, "s");
    if (state.youBest !== null) {
      const { ctx, w, h } = chartCv, T0 = 22, B0 = 22, y = T0 + (h - T0 - B0) * (1 - Math.min(1, state.youBest / yMax));
      ctx.strokeStyle = ML.cssVar("--ink-2"); ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(w - 10, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ML.cssVar("--ink-2"); ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(`your best: ${secs(state.youBest)} s`, w - 12, y - 4);
    }
  }

  // ---------- the Q-table heatmap ----------
  function cellInfo(agent, s) {
    const nk = agent.N[s * 2], nw = agent.N[s * 2 + 1], [qk, qs] = agent.values(s);
    if (!nk || !nw) return { known: false, tried: nk + nw };
    return { known: true, sw: qs > qk, conf: Math.min(1, Math.abs(qs - qk) / 12) };
  }
  function cellColor(ctx, info) {
    if (!info.known) { ctx.globalAlpha = info.tried ? 0.55 : 1; ctx.fillStyle = colors.lineV; return; }
    ctx.globalAlpha = 0.3 + 0.7 * info.conf; ctx.fillStyle = info.sw ? colors.warn : colors.good;
  }
  function drawHeat() {
    const { ctx, w, h } = heatCv, agent = state.replay ? state.replay.agent : state.agent;
    ctx.clearRect(0, 0, w, h);
    const o = T.observe(state.A), tb = state.slice < 0 ? o.tb : state.slice;
    const L = 52, Tp = 34, cell = Math.floor((w - L - 8) / 6);
    ctx.fillStyle = colors.muted; ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`cars waiting at RED → (green for ${T.TB_NAMES[tb]})`, L + cell * 3, 12);
    for (let c = 0; c < 6; c++) ctx.fillText(T.QB_NAMES[c], L + c * cell + cell / 2, Tp - 6);
    ctx.save(); ctx.translate(12, Tp + cell * 3); ctx.rotate(-Math.PI / 2); ctx.fillText("cars waiting at GREEN →", 0, 0); ctx.restore();
    ctx.textAlign = "right";
    for (let r = 0; r < 6; r++) ctx.fillText(T.QB_NAMES[r], L - 6, Tp + r * cell + cell / 2 + 3);
    ctx.textAlign = "center"; ctx.font = "800 9px Nunito, sans-serif";
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      const info = cellInfo(agent, T.stateIndex(r, c, tb, 0)), x = L + c * cell, y = Tp + r * cell;
      cellColor(ctx, info); rr(ctx, x + 1, y + 1, cell - 2, cell - 2, 5); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = info.known ? "#fff" : colors.muted;
      ctx.fillText(info.known ? (info.sw ? "switch" : "keep") : "?", x + cell / 2, y + cell / 2 + 3);
    }
    // ambulance strip
    const ay = Tp + 6 * cell + 22;
    ctx.fillStyle = colors.muted; ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "left";
    ctx.fillText("Ambulance waiting at...", L, ay - 6);
    const aw = (6 * cell) / 2;
    ["green road", "red road"].forEach((name, i) => {
      const info = cellInfo(agent, T.stateIndex(0, 0, tb, i + 1)), x = L + i * aw;
      cellColor(ctx, info); rr(ctx, x + 1, ay, aw - 2, 30, 6); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = info.known ? "#fff" : colors.muted; ctx.textAlign = "center"; ctx.font = "800 10px Nunito, sans-serif";
      ctx.fillText(`${name}: ${info.known ? (info.sw ? "switch" : "keep") : "?"}`, x + aw / 2, ay + 19);
      if (o.a === i + 1 && o.tb === tb) { ctx.strokeStyle = colors.ink; ctx.lineWidth = 3; rr(ctx, x + 1, ay, aw - 2, 30, 6); ctx.stroke(); }
    });
    if (!o.a && o.tb === tb && state.A.canSwitch()) {
      ctx.strokeStyle = colors.ink; ctx.lineWidth = 3;
      rr(ctx, L + o.rb * cell + 1, Tp + o.gb * cell + 1, cell - 2, cell - 2, 5); ctx.stroke();
    }
  }
  // tiny thumbnails: all four "how long green" slices side by side
  function drawMini(cv, agent) {
    const c = cv.getContext("2d"), W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    const cell = Math.floor(Math.min((W - 20) / 24, (H - 22) / 6));
    const gw = cell * 6, gap = (W - 4 * gw) / 5;
    c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center"; c.fillStyle = colors.muted;
    for (let t = 0; t < 4; t++) {
      const x0 = gap + t * (gw + gap);
      c.fillText(T.TB_NAMES[t], x0 + gw / 2, 13);
      for (let r = 0; r < 6; r++) for (let k = 0; k < 6; k++) {
        cellColor(c, cellInfo(agent, T.stateIndex(r, k, t, 0)));
        c.fillRect(x0 + k * cell, 20 + r * cell, cell - 1, cell - 1);
        c.globalAlpha = 1;
      }
    }
  }

  // ---------- inside card ----------
  function updateInside() {
    const A = state.A, o = T.observe(A), agent = state.replay ? state.replay.agent : state.agent;
    const gName = A.phase === 0 ? "north–south" : "east–west", rName = A.phase === 0 ? "east–west" : "north–south";
    $("inside-state").innerHTML = `
      <div><span class="lbl">Green</span><span><b>${o.g}</b> cars <span class="muted">${gName}</span></span></div>
      <div><span class="lbl">Red</span><span><b>${o.r}</b> cars <span class="muted">${rName}</span></span></div>
      <div><span class="lbl">Green for</span><b>${A.yellow ? "yellow now" : A.since + " s"}</b></div>
      ${A.cfg.amb ? `<div><span class="lbl">Ambulance</span><b>${["none", "at green", "at RED!"][o.a]}</b></div>` : ""}`;
    const [qk, qs] = agent.values(o.s), nk = agent.N[o.s * 2], nw = agent.N[o.s * 2 + 1];
    const bar = (name, q, n, win, col) => {
      const best = Math.min(Math.abs(qk) || 1, Math.abs(qs) || 1), pct = n ? Math.round(100 * Math.min(1, best / Math.max(1e-6, Math.abs(q)))) : 0;
      return `<div class="qbar ${win ? "win" : ""}"><span>${name}</span><div class="track"><div class="fill" style="width:${pct}%;background:var(${col})"></div></div><span class="num">${n ? q.toFixed(0) : "?"}</span></div>`;
    };
    const kWin = nk && nw ? qk >= qs : false, sWin = nk && nw ? qs > qk : false;
    $("qbars").innerHTML = bar("Keep", qk, nk, kWin, "--good") + bar("Switch", qs, nw, sWin, "--warn") +
      `<div class="muted" style="font-size:.76rem;font-weight:700">Score = expected "ouch" ahead (closer to 0 is better). Longer bar = better move.</div>`;
    let d;
    if (A.yellow > 0) d = "Yellow light: nobody moves. Waiting for it to turn.";
    else if (state.mode === "you" && !state.replay) {
      const g = agent.greedy(o.s, o);
      d = nk + nw ? `You're in charge. Robo's cheat-sheet would say: <b>${g ? "switch" : "keep green"}</b>.` : `You're in charge. Robo has never practised this situation yet.`;
    } else if (A.since < T.MIN_GREEN) d = `Every green lasts at least ${T.MIN_GREEN} s, so nothing to decide yet.`;
    else {
      // the last decision belongs to this exact situation? otherwise describe what the cheat-sheet says now
      const l = agent.last && agent.last.s === o.s ? agent.last : { a: agent.greedy(o.s, o), why: nk + nw ? "best" : "guess" };
      const what = l.a ? "<b>switch</b>" : "<b>keep green</b>";
      d = {
        best: `Robo picks ${what}: the higher score on its cheat-sheet.`,
        guess: `New situation! Robo guesses ${what} (serve the longer queue).`,
        explore: `Robo tries ${what} at random, just to find out what happens.`,
        safety: `Safety rule: no green lasts over ${T.MAX_GREEN} s, so <b>switch</b>.`,
      }[l.why];
    }
    $("decision").innerHTML = d;
  }

  // ---------- versus panel ----------
  function updateVs() {
    const A = state.A, B = state.B, early = A.round.ticks < 20;
    const a = A.avgWait(), b = B.avgWait();
    $("vs-a-name").textContent = state.replay ? `Old Robo (${state.replay.label})` : state.mode === "you" ? "You" : "Robo";
    $("vs-a-wait").innerHTML = early ? "–" : `${secs(a)}<small> s</small>`;
    $("vs-b-wait").innerHTML = early ? "–" : `${secs(b)}<small> s</small>`;
    $("vs-a-now").textContent = A.waiting(); $("vs-b-now").textContent = B.waiting();
    $("vs-a-sw").textContent = A.round.switches; $("vs-b-sw").textContent = B.round.switches;
    $("vs-a-amb").textContent = A.round.amb ? `${secs(A.ambAvgWait())} s` : "–";
    $("vs-b-amb").textContent = B.round.amb ? `${secs(B.ambAvgWait())} s` : "–";
    const aWin = !early && a < b, bWin = !early && b < a;
    $("vs-a").classList.toggle("win", aWin); $("vs-b").classList.toggle("win", bWin);
    $("vs-a-crown").classList.toggle("hidden", !aWin); $("vs-b-crown").classList.toggle("hidden", !bWin);
    $("st-round-k").textContent = state.replay ? "Old Robo" : state.mode === "you" ? "Your round" : "Robo's round";
    $("st-round").textContent = state.replay ? state.replay.label.replace("round ", "R") : state.mode === "you" ? state.you.length + 1 : state.robo.length + 1;
    $("st-clock").innerHTML = `${fmtClock(state.roundTicks)}<small> of ${fmtClock(roundLen())}</small>`;
  }

  // kid tips in "you" mode
  function kidTips() {
    if (state.mode !== "you" || state.replay) return;
    const A = state.A, now = performance.now();
    if (now - state.lastKidTip < 9000 || now < state.sayUntil) return;
    const g = A.queueOf(A.phase), r = A.queueOf(1 - A.phase);
    if (r >= 8 && r > g + 3 && A.since > 8 && A.canSwitch()) {
      state.lastKidTip = now;
      talk(`<b>${r}</b> cars are stuck at the red light, only <b>${g}</b> at green. Switch! (tap the crossroads or press <kbd>Space</kbd>)`, 3500);
    } else if (A.ambOn(1 - A.phase)) {
      state.lastKidTip = now;
      talk("An <b>ambulance</b> is waiting at your red light! Let it through!", 3500);
    }
  }

  function userSwitch() {
    if (state.mode !== "you" || state.replay) { talk("Robo is running the lights right now. Pick <b>You</b> at the top to take over!", 3000, true); return; }
    const A = state.A;
    if (!A.canSwitch()) { ML.toast("Already switching (yellow light)"); return; }
    const g = A.queueOf(A.phase), r = A.queueOf(1 - A.phase);
    state.wantSwitch = true;
    if (!state.playing) setPlaying(true);
    const now = performance.now();
    if (now > state.sayUntil) {
      if (g > r + 3) talk(`Hmm, you switched while <b>${g}</b> cars were still going at green and only <b>${r}</b> waited at red. Sometimes keeping green is smarter!`, 3500);
      else if (A.since < 3) talk("Switching super fast means lots of yellow lights, and nobody moves during yellow!", 3500);
      else if (r >= 4) talk(`Good switch! <b>${r}</b> cars at the red light get to go now.`, 2500);
    }
  }

  // ---------- idle nudges ----------
  function nudge() {
    let msg;
    if (state.replay) msg = "You're watching an old Robo. Tap <b>Back to live</b> in the checkpoints to keep training.";
    else if (state.mode === "you" && state.youSwitchesTotal === 0) msg = "Psst! Tap the crossroads (or press <kbd>Space</kbd>) to switch the light. Look at the red queue growing!";
    else if (state.mode === "you" && state.you.length === 0) msg = `Keep going! The round ends at ${fmtClock(ROUND_YOU)} on the clock. Then we compare you with the timer.`;
    else if (state.mode === "you") msg = "Ready? Pick <b>Robo learns</b> at the top and watch a robot learn to do your job, starting from nothing.";
    else if (!state.playing) msg = "I'm paused. Press <b>Play</b> so I can keep practising!";
    else if (!state.beatOnce) msg = state.tps < TURBO ? "Learning takes practice. Try <b>Turbo</b> speed and watch the chart!" : "Watch the chart: my orange line should drop below the timer's soon.";
    else if (!allDone()) { const k = Object.keys(state.chal).find((x) => !state.chal[x].done); msg = `Try the <b>${CH[k].name}</b> challenge! The chart will mark when it starts, so you can watch me adapt.`; }
    else msg = "All challenges beaten! Tap a <b>checkpoint</b> to watch an old Robo, or open the <b>X-ray</b> to see my cheat-sheet up close.";
    talk(msg, 5000, true);
  }

  // ---------- controls ----------
  function setPlaying(p) {
    state.playing = p;
    const b = $("play");
    b.innerHTML = p ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
    b.setAttribute("aria-label", p ? "Pause" : "Play");
  }
  function setSpeed(v) {
    state.tps = v === 0 ? TURBO : v;
    document.querySelectorAll("#speed button").forEach((b) => { const on = +b.dataset.v === v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  }
  function setMode(m) {
    if (state.mode === m && !state.replay) return;
    state.mode = m;
    if (state.replay) { state.replay = null; ckpts.active = null; ckpts.render(); }
    document.querySelectorAll("#mode button").forEach((b) => { const on = b.dataset.m === m; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    const sw = $("switch");
    sw.disabled = m !== "you";
    sw.innerHTML = m === "you" ? `${ML.icon("repeat")} Switch light` : `${ML.icon("robot")} Robo is driving`;
    newWorlds();
    setPlaying(true);
    if (m === "robo") {
      setSpeed(120);
      for (const k of Object.keys(state.chal)) if (state.chal[k].on && !state.chal[k].done) startPending(k);
      talk(state.robo.length
        ? "Back to practising! My cheat-sheet remembers everything from before."
        : "My cheat-sheet is <b>empty</b>, so at first I'll switch at silly moments and cars will pile up. Every second I feel one <b>ouch</b> per waiting car, and I learn which move means fewer ouches later. Watch the chart!", 8000, true);
    } else {
      setSpeed(3);
      talk("Your turn again! Tap the crossroads or press <kbd>Space</kbd> to switch.", 4000, true);
    }
  }

  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.m)));
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    setSpeed(+b.dataset.v);
    if (+b.dataset.v === 0 && state.mode === "robo") talk("Turbo! Cars blur, but I practise 10 pretend minutes every couple of seconds.", 3000);
  }));
  document.querySelectorAll("#chal button").forEach((b) => b.addEventListener("click", () => toggleChallenge(b.dataset.c, b)));
  document.querySelectorAll("#slice button").forEach((b) => b.addEventListener("click", () => {
    state.slice = +b.dataset.t;
    document.querySelectorAll("#slice button").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
    drawHeat();
  }));
  $("switch").addEventListener("click", userSwitch);
  $("play").addEventListener("click", () => setPlaying(!state.playing));
  $("reset").addEventListener("click", () => {
    state.agent = newAgent();
    state.robo = []; state.timerH = []; state.roboSw = []; state.markers = []; state.pending = [];
    state.beatOnce = false; state.replay = null;
    ckpts.clear();
    newWorlds(); drawChart(); drawHeat();
    for (const k of Object.keys(state.chal)) if (state.mode === "robo" && state.chal[k].on && !state.chal[k].done) startPending(k);
    talk("Memory wiped! My cheat-sheet is all question marks again.", 4000, true);
  });
  const pickCross = (e) => { e.preventDefault(); crossEl.focus({ preventScroll: true }); userSwitch(); };
  crossEl.addEventListener("pointerdown", pickCross);
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "select", "textarea", "button", "summary", "a"].includes(tag) || e.target.isContentEditable) return;
    if (e.key === " " || (e.key === "Enter" && e.target === crossEl) || e.key === "s" || e.key === "S") {
      e.preventDefault();
      if (state.mode === "you" && !state.replay) userSwitch(); else setPlaying(!state.playing);
    }
  });
  ["pointerdown", "keydown", "input"].forEach((ev) => document.addEventListener(ev, () => (state.lastInput = performance.now()), true));

  const perMin = (v) => `${v} / min`;
  ML.bindRange("#ns", perMin, applyCfg);
  ML.bindRange("#ew", perMin, applyCfg);
  ML.bindRange("#eps", (v) => `${Math.round(v * 100)}%`, (v) => { state.knobs.eps = v; state.agent.eps = v; });
  ML.bindRange("#alpha", (v) => v.toFixed(2), (v) => { state.knobs.alpha = v; state.agent.alpha = v; });
  ML.bindRange("#gamma", (v) => v.toFixed(2), (v) => { state.knobs.gamma = v; state.agent.gamma = v; });

  // ---------- checkpoints ----------
  const ckpts = new GameLab.Checkpoints($("ckpts"), (it) => {
    const ag = it.agent.clone(); ag.learn = false;
    state.replay = { agent: ag, label: it.label.toLowerCase() };
    newWorlds(); setPlaying(true);
    talk(`This is me from <b>${it.label.toLowerCase()}</b>, frozen: I use that old cheat-sheet and don't learn. Watch how it handles today's traffic (the cheat-sheet below is the old one too).`, 6000, true);
    drawHeat();
  }, () => {
    state.replay = null; newWorlds(); drawHeat();
    talk("Back to live training!", 2500, true);
  });

  // ---------- Model X-ray ----------
  let xAgent = null;
  ML.xray.register({
    title: "Robo's traffic cheat-sheet",
    kind: "Q-table",
    summary: () => `${state.robo.length} rounds of practice, ${state.agent.decisions} decisions`,
    size: () => `${T.NS} situations × 2 moves = ${T.NS * 2} scores`,
    stats: () => {
      let seen = 0; for (let s = 0; s < T.NS; s++) if (state.agent.visits(s)) seen++;
      return [["Rounds", state.robo.length], ["Situations seen", `${seen} of ${T.NS}`], ["Last round", state.robo.length ? `${secs(state.robo[state.robo.length - 1])} s vs ${secs(state.timerH[state.timerH.length - 1])} s` : "–"]];
    },
    inputs: [
      { key: "g", name: "Cars at green", min: 0, max: 15, step: 1 },
      { key: "r", name: "Cars at red", min: 0, max: 15, step: 1 },
      { key: "t", name: "Green for (s)", min: 4, max: 30, step: 1, unit: " s" },
      { key: "a", name: "Ambulance", min: 0, max: 2, step: 1, describe: (v) => ["none", "at green", "at red"][Math.round(v)] },
    ],
    outputs: [{ name: "Keep green", color: ML.cssVar("--good") }, { name: "Switch", color: ML.cssVar("--warn") }],
    predict: (x) => {
      const ag = xAgent || state.agent;
      const s = T.stateIndex(T.bin(Math.round(x[0]), T.QB), T.bin(Math.round(x[1]), T.QB), T.bin(Math.round(x[2]), T.TB), Math.round(x[3]));
      if (!ag.N[s * 2] || !ag.N[s * 2 + 1]) return null;
      return ag.values(s);
    },
    current: () => { const o = T.observe(state.A); return [Math.min(15, o.g), Math.min(15, o.r), ML.clamp(o.t, 4, 30), o.a]; },
    brainHeight: 260,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), W = cv.width, H = cv.height, ag = xAgent || state.agent;
      c.clearRect(0, 0, W, H);
      const cell = Math.floor(Math.min((W - 60) / 26, (H - 50) / 6)), gw = cell * 6, gap = (W - 4 * gw) / 5;
      c.font = "800 13px Nunito, sans-serif"; c.textAlign = "center";
      for (let t = 0; t < 4; t++) {
        const x0 = gap + t * (gw + gap);
        c.fillStyle = ML.cssVar("--ink"); c.fillText(`green for ${T.TB_NAMES[t]}`, x0 + gw / 2, 18);
        for (let r = 0; r < 6; r++) for (let k = 0; k < 6; k++) {
          cellColor(c, cellInfo(ag, T.stateIndex(r, k, t, 0)));
          c.fillRect(x0 + k * cell, 30 + r * cell, cell - 2, cell - 2); c.globalAlpha = 1;
        }
      }
      c.fillStyle = ML.cssVar("--muted"); c.font = "700 12px Nunito, sans-serif";
      c.fillText("rows: cars at green (0 → 12+) · columns: cars at red (0 → 12+)", W / 2, H - 8);
    },
    brainCaption: "The whole cheat-sheet: four grids, one for each 'how long has it been green'. Green = keep, orange = switch, grey = not sure yet. The orange corner grows as the light stays green longer: Robo learned that a long green should give way.",
    notes: ["Robo never sees the timer or any rule like 'switch every 12 s'. Everything here came from feeling one 'ouch' per waiting car, every second."],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { xAgent = state.agent.clone(); _xo(); };
  ML.xray.button($("play").parentElement);

  // ---------- main loop ----------
  let lastT = performance.now(), lastSlow = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (state.playing) {
      state.acc += dt * state.tps;
      let n = Math.floor(state.acc);
      state.acc -= n;
      const t0 = performance.now();
      while (n-- > 0) { tick(); if ((n & 15) === 0 && performance.now() - t0 > 10) { state.acc = 0; break; } }
    }
    render(now);
    if (now - lastSlow > 140) {
      lastSlow = now;
      updateVs(); updateInside(); drawHeat(); kidTips();
      if (now - state.lastInput > 15000 && now - state.lastNudge > 15000) { state.lastNudge = now; nudge(); }
    }
    requestAnimationFrame(frame);
  }

  function redrawAll() { readColors(); drawChart(); drawHeat(); ckpts.render(); }
  document.addEventListener("themechange", () => setTimeout(redrawAll, 30));
  let rsT;
  window.addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(sizeCross, 120); });

  readColors();
  sizeCross();
  newWorlds();
  setSpeed(3);
  setPlaying(true);
  drawChart();
  ckpts.render();
  requestAnimationFrame(frame);
})();
