// Basketball Shooter — drawing, the shot-by-shot learning loop, challenges, checkpoints.
(function () {
  const { makeWorld, hoopAt, newSpot, shoot, features, FEATURE_NAMES, Shooter, ANGLE, RELEASE_H, RIM_H, RIM_R, BALL_R } = window.Hoops;
  const CW = 760, CH = 420;
  const court = ML.setupCanvas(document.getElementById("court"), CW, CH);
  const chart = ML.setupCanvas(document.getElementById("chart"), 700, 180);
  const SCALE = 66, X0 = 70, GROUND = 390;
  const sx = (x) => X0 + x * SCALE, sy = (y) => GROUND - y * SCALE;
  const ROUND = 10;

  const state = {
    mode: "robo",
    playing: false,
    speed: 1,
    world: makeWorld(),
    shooter: new Shooter(),
    shots: 0,
    roundMade: 0,
    roundShots: 0,
    rounds: [], // % made per round
    markers: [],
    ghosts: [], // recent arcs
    flight: null, // the shot being animated
    spot: newSpot(makeWorld()),
    last: null,
    watch: null, // challenge drop/recovery tracker
    replay: null,
    drag: null,
    youMade: 0,
    youShots: 0,
  };

  // ---------- one shot ----------
  function takeShot(animate) {
    const s = state;
    const learner = s.replay ? s.replay.shooter : s.shooter;
    const spot = newSpot(s.world);
    const x = features(s.world, spot);
    const power = learner.power(x);
    const r = shoot(s.world, spot, power, ANGLE, true);
    const before = learner.w.slice();
    const target = s.replay ? power : learner.learn(x, power, r.miss);
    const shot = { spot, x, power, target, before, ...r, who: "robo" };
    if (animate) { s.spot = spot; s.flight = { shot, i: 0 }; }
    else finishShot(shot);
    return shot;
  }

  function finishShot(shot) {
    const s = state;
    s.ghosts.push({ path: shot.path, made: shot.made, age: 0 });
    if (s.ghosts.length > 14) s.ghosts.shift();
    s.last = shot;
    if (shot.who === "you") {
      s.youShots++;
      if (shot.made) s.youMade++;
      ML.say(shot.made ? `Swish! You made <b>${s.youMade}</b> of ${s.youShots}. Notice how <b>you</b> learned from each miss too?` :
        `${shot.miss > 0 ? "Too long" : "Too short"} by ${Math.abs(shot.miss).toFixed(1)} m. Pull ${shot.miss > 0 ? "a little less" : "a little more"}!`);
      return;
    }
    if (s.replay) return;
    s.shots++;
    s.roundShots++;
    if (shot.made) s.roundMade++;
    if (s.roundShots >= ROUND) endRound();
  }

  function endRound() {
    const s = state;
    const pct = (s.roundMade / ROUND) * 100;
    s.rounds.push(pct);
    s.roundMade = 0;
    s.roundShots = 0;
    const n = s.rounds.length;
    if ([1, 3, 10, 25, 50, 100, 200].includes(n)) saveCheckpoint(`Round ${n}`);
    drawChart();
    narrateRound(pct);
  }

  function avgLast(k) {
    const r = state.rounds.slice(-k);
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  }

  function narrateRound(pct) {
    const s = state, n = s.rounds.length, w = s.watch;
    if (w) {
      const since = n - w.start;
      const now = avgLast(3);
      if (w.dropped) w.low = Math.min(w.low, avgLast(2));
      if (!w.dropped && pct < w.base - 15) {
        w.dropped = true;
        w.low = pct;
        s.quietUntil = n + 4;
        return ML.say(`Whoa, <b>${w.label}</b>! My old aim doesn't work: only <b>${pct}%</b> this round. Let me fix it…`);
      }
      // "Adapted" = the 3-round average climbed most of the way back from the low point.
      if (w.dropped && since >= 4 && now >= w.low + 0.65 * (w.base - w.low)) {
        s.watch = null;
        s.quietUntil = n + 12;
        ML.confetti(60);
        return ML.say(`I adapted to <b>${w.label}</b>! Back to <b>${Math.round(now)}%</b> after ${since} rounds. Nobody told me the new rule, I learned it from my misses.`);
      }
      if (!w.dropped && since >= 5) {
        s.watch = null;
        s.quietUntil = n + 12;
        return ML.say(`<b>${w.label}</b> didn't bother me much. My aim already handled it.`);
      }
      if (n < (s.quietUntil || 0)) return;
      if (s.speed !== 0 || n % 5 === 0) return ML.say(`Still learning the <b>${w.label}</b>: ${pct}% this round. Watch the faded arcs move toward the hoop.`);
      return;
    }
    if (n < (s.quietUntil || 0)) return;
    if (s.speed === 0 && n % 10) return;
    if (n === 1) ML.say(`Round 1: <b>${pct}%</b>. My throws are all over the place, but every miss tells me "harder" or "softer".`);
    else if (avgLast(3) >= 90 && !s.praised) { s.praised = true; ML.confetti(); ML.xray.offer("I learned to shoot! X-ray my aim"); ML.say(`<b>${Math.round(avgLast(3))}%</b> for 3 rounds! I learned to shoot from any spot. Now try a <b>challenge</b> on the left.`); }
    else ML.say(`Round ${n}: <b>${pct}%</b> went in. ${pct >= 80 ? "My aim is getting good!" : "Still fixing my aim, one miss at a time."}`);
  }

  // ---------- challenges ----------
  const CH_LABELS = { wind: "wind", moving: "moving hoop", heavy: "heavy ball", high: "higher hoop", spots: "anywhere on court" };
  document.querySelectorAll("#chal [data-c]").forEach((b) =>
    b.addEventListener("click", () => {
      const c = b.dataset.c, w = state.world;
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      if (c === "wind") w.wind = on ? -1.6 : 0;
      else w[c] = on;
      const label = (on ? "" : "no ") + CH_LABELS[c];
      if (state.mode === "you") { ML.say(on ? `<b>${CH_LABELS[c]}</b> is on. Try a shot!` : `${CH_LABELS[c]} is off.`); return; }
      if (state.rounds.length) saveCheckpoint(`Before ${CH_LABELS[c]}`);
      state.markers.push({ at: state.rounds.length, label });
      state.watch = { label: CH_LABELS[c], start: state.rounds.length, base: avgLast(3), dropped: false };
      state.ghosts = [];
      drawChart();
      ML.say(on ? `Challenge: <b>${CH_LABELS[c]}</b>! My aim was tuned for the old court. Let's see what happens…` : `<b>${CH_LABELS[c]}</b> is off. That's a change too, so I may need to re-tune.`);
      if (!state.playing) setPlaying(true);
    })
  );

  // ---------- checkpoints ----------
  const testSpots = [3.4, 4.6, 5.8, 6.6, 4.0, 5.2].map((d, i) => ({ d, t0: i * 3.1 }));
  const ckpts = new GameLab.Checkpoints(
    document.getElementById("ckpts"),
    (it) => {
      state.replay = { shooter: it.shooter.clone() };
      state.ghosts = [];
      state.flight = null;
      setPlaying(true);
      ML.say(`This is my aim from <b>${it.label.toLowerCase()}</b>, shooting on today's court. It doesn't learn while you watch.`);
    },
    () => {
      state.replay = null;
      state.ghosts = [];
      state.flight = null;
      ML.say(`Back to live practice!`);
    }
  );
  function saveCheckpoint(label) {
    const sh = state.shooter.clone();
    const made = testSpots.filter((sp) => shoot(state.world, sp, sh.power(features(state.world, sp)), ANGLE, false).made).length;
    ckpts.add({
      label,
      sub: `${made}/6 test shots in`,
      shooter: sh,
      draw: (cv) => drawMini(cv, sh),
    });
  }
  function drawMini(cv, sh) {
    const c = cv.getContext("2d"), w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    const S = 20, ox = 14, gy = h - 10;
    c.fillStyle = ML.cssVar("--bg-2"); c.fillRect(0, gy, w, 10);
    for (const sp of testSpots) {
      const r = shoot(state.world, sp, sh.power(features(state.world, sp)), ANGLE, true);
      c.strokeStyle = r.made ? ML.cssVar("--good") : ML.cssVar("--bad");
      c.globalAlpha = 0.8; c.lineWidth = 2;
      c.beginPath();
      // draw each arc relative to its own hoop so all six line up on one mini hoop
      r.path.forEach(([x, y], i) => { const px = ox + (x + (6 - r.hoopX)) * S * 0.9, py = gy - y * S; i ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.stroke();
    }
    c.globalAlpha = 1;
    const rimH = RIM_H + (state.world.high ? 0.8 : 0);
    c.strokeStyle = ML.cssVar("--rl"); c.lineWidth = 3;
    c.beginPath(); c.moveTo(ox + (6 - RIM_R) * S * 0.9, gy - rimH * S); c.lineTo(ox + (6 + RIM_R) * S * 0.9, gy - rimH * S); c.stroke();
  }

  // ---------- drawing ----------
  function drawCourt(now) {
    const ctx = court.ctx, s = state;
    ctx.clearRect(0, 0, CW, CH);
    // gym wall + floor
    const dark = ML.isDark();
    ctx.fillStyle = dark ? "#23264a" : "#eef4ff";
    ctx.fillRect(0, 0, CW, GROUND);
    ctx.fillStyle = dark ? "#5a4632" : "#e8c48f";
    ctx.fillRect(0, GROUND, CW, CH - GROUND);
    ctx.strokeStyle = dark ? "#6b5640" : "#d6ad72";
    ctx.lineWidth = 1;
    for (let x = 0; x < CW; x += 38) { ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, CH); ctx.stroke(); }
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, GROUND + 2); ctx.lineTo(CW, GROUND + 2); ctx.stroke();

    // wind streaks
    if (s.world.wind) {
      ctx.strokeStyle = ML.cssVar("--sup"); ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const y = 40 + i * 38, x = ((now * 0.12 * (s.world.wind < 0 ? -1 : 1) + i * 97) % (CW + 80) + CW + 80) % (CW + 80) - 40;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (s.world.wind < 0 ? -36 : 36), y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = ML.cssVar("--sup"); ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(`WIND ${s.world.wind < 0 ? "← blowing back" : "→"}`, CW - 12, 22);
    }

    // hoop (where it is right now)
    const flightT = s.flight ? (s.flight.i / s.flight.shot.path.length) * s.flight.shot.t : 0;
    const hoop = hoopAt(s.world, s.spot.d, s.spot.t0 + flightT);
    drawHoop(ctx, hoop.x);

    // ghost arcs: the last few throws
    s.ghosts.forEach((g, k) => {
      const a = 0.12 + (0.55 * (k + 1)) / s.ghosts.length;
      ctx.strokeStyle = g.made ? ML.cssVar("--good") : ML.cssVar("--bad");
      ctx.globalAlpha = a; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      ctx.beginPath();
      g.path.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
      ctx.stroke();
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // shooter
    const leanBack = s.drag ? 0.12 : 0;
    drawShooter(ctx, s.mode === "you");

    // ball
    let bx = 0, by = RELEASE_H;
    if (s.flight) { const p = s.flight.shot.path[Math.min(Math.floor(s.flight.i), s.flight.shot.path.length - 1)]; bx = p[0]; by = p[1]; }
    drawBall(ctx, sx(bx), sy(by), s.world.heavy);

    // distance label
    ctx.fillStyle = ML.cssVar("--ink-2"); ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.strokeStyle = ML.cssVar("--muted"); ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(sx(0), GROUND + 16); ctx.lineTo(sx(hoop.x), GROUND + 16); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillText(`${hoop.x.toFixed(1)} m`, sx(hoop.x / 2), GROUND + 12);

    // aiming (you try)
    if (s.drag) {
      const { angle, power } = s.drag;
      ctx.strokeStyle = ML.cssVar("--rl"); ctx.lineWidth = 4; ctx.lineCap = "round";
      const L = power * 9;
      ctx.beginPath(); ctx.moveTo(sx(0), sy(RELEASE_H)); ctx.lineTo(sx(0) + Math.cos(angle) * L, sy(RELEASE_H) - Math.sin(angle) * L); ctx.stroke();
      ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "800 14px Nunito, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(`${Math.round((angle * 180) / Math.PI)}° · power ${power.toFixed(1)}`, sx(0) + 20, sy(RELEASE_H) - L - 10);
    }
    if (s.replay) {
      ctx.fillStyle = "rgba(31,33,64,.82)"; ctx.beginPath(); ctx.roundRect(12, 12, 300, 30, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "left";
      ctx.fillText("Replaying a checkpoint (not learning)", 24, 32);
    }
    if (s.mode === "you" && !s.flight && !s.drag && s.youShots === 0) {
      ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "700 18px Fredoka, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Drag back from the ball, like a slingshot, then let go", CW / 2, 60);
    }
  }

  function drawHoop(ctx, hx) {
    const rimH = RIM_H + (state.world.high ? 0.8 : 0);
    const bx = sx(hx + RIM_R + 0.15);
    // pole + backboard
    ctx.fillStyle = "#7d7f95"; ctx.fillRect(bx + 18, sy(rimH + 0.9), 8, GROUND - sy(rimH + 0.9));
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(bx, sy(rimH + 1.05), 10, 1.25 * SCALE, 3); ctx.fill(); ctx.stroke();
    ctx.fillRect(bx + 10, sy(rimH + 0.35), 16, 6);
    // net
    const l = sx(hx - RIM_R), r = sx(hx + RIM_R), y = sy(rimH);
    ctx.strokeStyle = ML.isDark() ? "#c9cbe8" : "#9aa0b8"; ctx.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      ctx.beginPath(); ctx.moveTo(ML.lerp(l, r, t), y); ctx.lineTo(ML.lerp(l + 8, r - 8, t), y + 30); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(l + 4, y + 15); ctx.lineTo(r - 4, y + 15); ctx.moveTo(l + 8, y + 30); ctx.lineTo(r - 8, y + 30); ctx.stroke();
    // rim
    ctx.strokeStyle = "#ff7a2f"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(bx, y); ctx.stroke();
    ctx.lineCap = "butt";
  }

  function drawShooter(ctx, kid) {
    const x = sx(0) - 26, top = sy(RELEASE_H) + 10;
    const col = kid ? ML.cssVar("--rl") : ML.cssVar("--accent");
    ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 3;
    // legs
    ctx.fillStyle = "#1f2140";
    ctx.fillRect(x + 6, GROUND - 46, 8, 46); ctx.fillRect(x + 22, GROUND - 46, 8, 46);
    // body
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(x, top + 22, 36, GROUND - 46 - top - 18, 10); ctx.fill(); ctx.stroke();
    // head (robot or kid)
    ctx.beginPath(); ctx.roundRect(x - 2, top - 14, 40, 34, kid ? 17 : 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(x + 4, top - 7, 28, 18, 7); ctx.fill();
    ctx.fillStyle = "#1f2140";
    ctx.beginPath(); ctx.arc(x + 13, top + 2, 3, 0, 7); ctx.arc(x + 24, top + 2, 3, 0, 7); ctx.fill();
    if (!kid) { ctx.beginPath(); ctx.moveTo(x + 18, top - 14); ctx.lineTo(x + 18, top - 24); ctx.stroke(); ctx.fillStyle = ML.cssVar("--warn"); ctx.beginPath(); ctx.arc(x + 18, top - 26, 4, 0, 7); ctx.fill(); }
    // arm up toward the ball
    ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x + 30, top + 30); ctx.lineTo(sx(0) - 4, sy(RELEASE_H) + 6); ctx.stroke();
    ctx.lineCap = "butt";
  }

  function drawBall(ctx, x, y, heavy) {
    const r = BALL_R * SCALE * 1.5;
    ctx.fillStyle = heavy ? "#b4521c" : "#ff8a3d";
    ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
  }

  function drawChart() {
    GameLab.drawChart(chart, [{ values: state.rounds, color: "--accent" }], state.markers, 100, "%");
  }

  // ---------- inside card ----------
  function renderInside() {
    const s = state, sh = s.last;
    const host = document.getElementById("inside");
    const learner = s.replay ? s.replay.shooter : s.shooter;
    renderWeights(learner.w);
    if (!sh || sh.who === "you") return;
    const hoop = hoopAt(s.world, sh.spot.d, sh.spot.t0);
    const extras = [];
    if (s.world.wind) extras.push("wind blowing back");
    if (s.world.moving) extras.push(`hoop sliding ${hoop.v > 0 ? "away" : "closer"}`);
    if (s.world.high) extras.push("hoop raised");
    const missTxt = sh.made ? `it went in (only ${Math.abs(sh.miss).toFixed(2)} m off centre)` : `I was <b>${Math.abs(sh.miss).toFixed(2)} m ${sh.miss > 0 ? "too long" : "too short"}</b>${sh.airball ? " (didn't even reach the rim)" : ""}`;
    const fix = sh.target - sh.power;
    host.innerHTML = `<div>${ML.icon("eye")} Hoop is <b>${hoop.x.toFixed(1)} m</b> away${extras.length ? ", " + extras.join(", ") : ""}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("target")} I throw at <b>55°</b> with power <b>${sh.power.toFixed(2)}</b></div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("ruler")} ${missTxt}</div>
      ${s.replay ? "" : `<div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("wrench")} Next time from here: <b style="color:var(--accent)">${Math.abs(fix) < 0.02 ? "keep it the same" : fix > 0 ? `throw harder (+${fix.toFixed(2)})` : `throw softer (${fix.toFixed(2)})`}</b></div>`}`;
  }
  function renderWeights(w) {
    const max = Math.max(4, ...w.map(Math.abs));
    document.getElementById("wbars").innerHTML =
      `<div class="muted" style="font-size:.78rem;font-weight:800;margin-top:6px">MY AIM RULE: HOW MUCH EACH THING CHANGES MY POWER</div>` +
      w.map((v, i) => {
        const pct = (Math.abs(v) / max) * 50;
        return `<div class="wbar"><span>${FEATURE_NAMES[i]}</span><div class="track"><div class="fill" style="left:${v >= 0 ? 50 : 50 - pct}%;width:${pct}%;background:${v >= 0 ? "var(--good)" : "var(--bad)"}"></div></div><span class="num">${v >= 0 ? "+" : ""}${v.toFixed(1)}</span></div>`;
      }).join("");
  }

  function renderStats() {
    const s = state;
    document.getElementById("st-shots").textContent = s.mode === "you" ? s.youShots : s.shots;
    document.getElementById("st-round").innerHTML = s.mode === "you" ? `${s.youMade}<small>/${s.youShots}</small>` : `${s.roundMade}<small>/${s.roundShots}</small>`;
    document.getElementById("st-avg").innerHTML = s.rounds.length ? `${Math.round(avgLast(5))}<small>%</small>` : "–";
  }

  // ---------- you try: drag back from the ball ----------
  const cv = document.getElementById("court");
  function aimFrom(e) {
    const p = ML.canvasPoint(cv, e, CW, CH);
    const dx = sx(0) - p.x, dy = p.y - sy(RELEASE_H); // pull back = throw forward
    const angle = ML.clamp(Math.atan2(dy, Math.max(1, dx)), 0.2, 1.45);
    const power = ML.clamp(Math.hypot(dx, dy) / 14, 3, 16);
    return { angle, power };
  }
  cv.addEventListener("pointerdown", (e) => {
    if (state.mode !== "you" || state.flight) return;
    cv.setPointerCapture(e.pointerId);
    state.drag = aimFrom(e);
  });
  cv.addEventListener("pointermove", (e) => { if (state.drag) state.drag = aimFrom(e); });
  cv.addEventListener("pointerup", () => {
    if (!state.drag) return;
    const { angle, power } = state.drag;
    state.drag = null;
    const spot = state.spot;
    const r = shoot(state.world, spot, power, angle, true);
    state.flight = { shot: { spot, power, ...r, who: "you" }, i: 0 };
  });

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function setPlaying(p) {
    state.playing = p;
    playBtn.innerHTML = p ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
  }
  playBtn.addEventListener("click", () => {
    if (state.mode === "you") setMode("robo");
    setPlaying(!state.playing);
  });
  document.getElementById("step").addEventListener("click", () => {
    if (state.mode === "you") setMode("robo");
    setPlaying(false);
    if (!state.flight) takeShot(true);
  });
  document.getElementById("reset").addEventListener("click", () => {
    Object.assign(state, { shooter: new Shooter(), shots: 0, roundMade: 0, roundShots: 0, rounds: [], markers: [], ghosts: [], last: null, watch: null, replay: null, praised: false });
    ckpts.clear();
    drawChart();
    document.getElementById("inside").innerHTML = `<span class="muted">Press Play to see how Robo picks its throw.</span>`;
    ML.say(`All forgotten! My aim rule is back to "always throw with power 6".`);
  });
  document.querySelectorAll("#speed button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
      state.speed = +b.dataset.v;
    })
  );
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x.dataset.m === m));
    document.getElementById("mode-hint").textContent = m === "you" ? "Drag back from the ball like a slingshot, then let go." : "Robo throws from a new spot every time.";
    state.flight = null;
    state.ghosts = [];
    if (state.replay) { state.replay = null; ckpts.active = null; ckpts.render(); }
    if (m === "you") {
      setPlaying(false);
      state.spot = newSpot(state.world);
      ML.say(`Your turn! Drag back from the ball and let go. How many shots until you get the feel?`);
    } else ML.say(`Robo's turn. Press <b>Play</b>.`);
  }
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.m)));

  // ---------- main loop ----------
  function frame(now) {
    const s = state;
    if (s.flight) {
      const step = s.speed === 0 ? 999 : s.speed;
      s.flight.i += step;
      if (s.flight.i >= s.flight.shot.path.length) {
        const shot = s.flight.shot;
        s.flight = null;
        finishShot(shot);
        if (shot.who === "you") s.spot = newSpot(s.world);
        renderInside();
      }
    } else if (s.playing && s.mode === "robo") {
      if (s.speed === 0) {
        // Turbo: two un-animated shots a frame, about 12 rounds a second, slow enough to see a challenge bite.
        takeShot(false); takeShot(false);
        renderInside();
      } else takeShot(true);
    }
    drawCourt(now);
    renderStats();
    requestAnimationFrame(frame);
  }
  renderWeights(state.shooter.w);
  drawChart();
  ckpts.render();
  requestAnimationFrame(frame);
  // ---------- Model X-ray ----------
  const hoopSeen = [];
  setInterval(() => {
    const sp = state.spot, w = state.world;
    if (!sp || !w) return;
    const hv = w.moving ? 0.48 * Math.cos(0.6 * (sp.t0 + 0)) : 0;
    const x = [sp.d, w.high ? 1 : 0, w.wind, hv];
    const last = hoopSeen[hoopSeen.length - 1];
    if (!last || x.some((v, k) => v !== last[k])) { hoopSeen.push(x); if (hoopSeen.length > 400) hoopSeen.shift(); }
  }, 60);
  const feats = (x) => { const d = x[0] / 5, h = x[1] > 0.5 ? 1 : 0, w = x[2] / 2, hv = x[3] / 1.5; return [1, d, d * d, 1 / d, h, w, hv, d * w, d * hv, h * d]; };
  const shooterNow = () => (state.replay && state.replay.shooter) || state.shooter;
  ML.xray.register({
    title: "Robo's aiming rule",
    kind: "Linear model",
    summary: () => `learned from ${state.shots} shots`,
    size: () => `${state.shooter.w.length} numbers`,
    stats: () => [["Shots", state.shots], ["Last round", state.rounds.length ? `${state.rounds[state.rounds.length - 1]}%` : "–"], ["Throw angle", "always 55°"]],
    inputs: [
      { name: "Distance to hoop", min: 2, max: 9, unit: " m", describe: (v) => `${v.toFixed(1)} m` },
      { name: "Hoop is high", min: 0, max: 1, step: 1, describe: (v) => (v > 0.5 ? "yes" : "no") },
      { name: "Wind", min: -2, max: 2, describe: (v) => (Math.abs(v) < 0.1 ? "calm" : v < 0 ? "blowing back at me" : "blowing towards hoop") },
      { name: "Hoop sliding", min: -0.5, max: 0.5, describe: (v) => (Math.abs(v) < 0.03 ? "still" : v < 0 ? "sliding closer" : "sliding away") },
    ],
    outputs: [{ name: "Throw power", regression: true }],
    predict: (x) => [shooterNow().power(feats(x))],
    samples: () => hoopSeen,
    current: () => hoopSeen[hoopSeen.length - 1] || null,
    brainHeight: 260,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), W = cv.width, Hh = cv.height, w = shooterNow().w, names = FEATURE_NAMES;
      const mx = Math.max(...w.map(Math.abs)) || 1, mid = W / 2 + 60, row = (Hh - 20) / w.length;
      c.font = "800 13px Nunito, sans-serif";
      w.forEach((v, i) => {
        const y = 10 + i * row, len = (Math.abs(v) / mx) * (W / 2 - 90);
        c.fillStyle = v >= 0 ? ML.cssVar("--rl") : ML.cssVar("--sup");
        c.fillRect(v >= 0 ? mid : mid - len, y + 3, len, row - 6);
        c.fillStyle = ML.cssVar("--ink"); c.textAlign = "right"; c.fillText(names[i], mid - (v < 0 ? len : 0) - 8, y + row / 2 + 4);
        c.textAlign = "left"; c.fillText(v.toFixed(2), mid + (v >= 0 ? len : 0) + 8, y + row / 2 + 4);
      });
      c.fillStyle = ML.cssVar("--muted"); c.fillRect(mid - 1, 6, 2, Hh - 12);
    },
    brainCaption: "Robo's whole brain is these 10 numbers. Power = each fact × its number, all added up. Orange numbers make it throw harder, blue ones softer. Every miss nudged them a little.",
    notes: ["This is the simplest kind of model: a weighted sum. It still learned physics-like rules, like 'further away = throw harder', just from its misses."],
  });
  ML.xray.button(document.getElementById("play").parentElement);
})();
