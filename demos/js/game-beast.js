// Build-a-Beast — page: the creature editor, the evolution loop, drawing,
// challenges, checkpoints, the inside card and the Model X-ray.
(function () {
  const B = window.BeastCore;
  const W = 760, H = 420, GROUND = H - 70; // screen y of world y = 0 in build mode
  const view = ML.setupCanvas(document.getElementById("view"), W, H);
  const chart = ML.setupCanvas(document.getElementById("chart"), 660, 140);
  const ctx = view.ctx;
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const state = {
    mode: "build",
    tool: "joint",
    spec: clone(B.TEMPLATES.frog),
    undo: [],
    goal: "run",
    ch: {},
    ev: null,
    playing: false,
    speed: 1,
    replay: null,
    markers: [],
    watch: null, // challenge being tracked for drop + recovery
    bestEver: 0,
    eyes: true,
    babies: true,
    offered: false,
  };

  // ---------- build mode ----------
  const toScreen = (x, y) => [W / 2 + x, GROUND - y];
  const toWorld = (sx, sy) => [sx - W / 2, GROUND - sy];
  function pt(e) { return ML.canvasPoint($("view"), e, W, H); }
  function jointAt(sx, sy) {
    let best = -1, bd = 16;
    state.spec.joints.forEach(([x, y], i) => {
      const [px, py] = toScreen(x, y);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function pushUndo() { state.undo.push(clone(state.spec)); if (state.undo.length > 60) state.undo.shift(); }
  const has = (list, a, b) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  let drag = null;
  $("view").addEventListener("pointerdown", (e) => {
    if (state.mode !== "build") return;
    e.preventDefault();
    const [sx, sy] = [pt(e).x, pt(e).y];
    const j = jointAt(sx, sy);
    const S = state.spec;
    if (state.tool === "joint") {
      if (j >= 0) return;
      if (S.joints.length >= 14) return ML.toast("That's the most joints (14)");
      const [x, y] = toWorld(sx, sy);
      pushUndo();
      S.joints.push([Math.round(x), Math.max(0, Math.round(y))]);
    } else if (state.tool === "bone" || state.tool === "muscle") {
      if (j >= 0) drag = { from: j, x: sx, y: sy };
    } else if (state.tool === "move") {
      if (j >= 0) { pushUndo(); drag = { move: j }; }
    } else if (state.tool === "erase") {
      pushUndo();
      if (j >= 0) {
        S.joints.splice(j, 1);
        const fix = (list) => list.filter(([a, b]) => a !== j && b !== j).map(([a, b]) => [a > j ? a - 1 : a, b > j ? b - 1 : b]);
        S.bones = fix(S.bones);
        S.muscles = fix(S.muscles);
      } else {
        const p = [sx, sy];
        const near = (list) => list.findIndex(([a, b]) => segDist(p, toScreen(...S.joints[a]), toScreen(...S.joints[b])) < 8);
        let k = near(S.muscles);
        if (k >= 0) S.muscles.splice(k, 1);
        else if ((k = near(S.bones)) >= 0) S.bones.splice(k, 1);
        else state.undo.pop();
      }
    }
    syncBuild();
  });
  $("view").addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [sx, sy] = [pt(e).x, pt(e).y];
    if (drag.move !== undefined) {
      const [x, y] = toWorld(sx, sy);
      state.spec.joints[drag.move] = [Math.round(x), Math.max(0, Math.round(y))];
      syncBuild();
    } else { drag.x = sx; drag.y = sy; }
  });
  const endDrag = (e) => {
    if (!drag) return;
    if (drag.from !== undefined && e) {
      const p = pt(e), j = jointAt(p.x, p.y), S = state.spec;
      if (j >= 0 && j !== drag.from) {
        const list = state.tool === "bone" ? S.bones : S.muscles;
        if (!has(S.bones, drag.from, j) && !has(S.muscles, drag.from, j)) {
          if (state.tool === "muscle" && S.muscles.length >= 14) ML.toast("That's the most muscles (14)");
          else { pushUndo(); list.push([drag.from, j]); }
        }
      }
    }
    drag = null;
    syncBuild();
  };
  $("view").addEventListener("pointerup", endDrag);
  $("view").addEventListener("pointerleave", () => { if (drag && drag.move !== undefined) drag = null; });

  const HINTS = {
    joint: "Tap anywhere to place a joint (like an elbow or a foot).",
    bone: "Drag from one joint to another to join them with a stiff bone.",
    muscle: "Drag from one joint to another to add a stretchy muscle. Muscles are what make it move!",
    move: "Drag a joint to move it.",
    erase: "Tap a joint, bone or muscle to remove it.",
  };
  document.querySelectorAll("#tools [data-t]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tool = b.dataset.t;
      document.querySelectorAll("#tools [data-t]").forEach((x) => x.classList.toggle("on", x === b));
      $("hint").textContent = HINTS[state.tool];
    })
  );
  $("undo").addEventListener("click", () => { if (state.undo.length) { state.spec = state.undo.pop(); syncBuild(); } });
  $("clear").addEventListener("click", () => { pushUndo(); state.spec = { joints: [], bones: [], muscles: [] }; syncBuild(); ML.say("A blank page! Tap to add joints, then connect them."); });
  document.querySelectorAll("#tpl [data-k]").forEach((b) =>
    b.addEventListener("click", () => {
      pushUndo();
      state.spec = clone(B.TEMPLATES[b.dataset.k]);
      if (state.mode !== "build") setMode("build");
      syncBuild();
      ML.say(`Here's a <b>${b.textContent.toLowerCase()}</b>. Change it if you like, then press <b>Evolve!</b>`);
    })
  );
  $("eyes").addEventListener("change", (e) => (state.eyes = e.target.checked));
  $("babies").addEventListener("change", (e) => (state.babies = e.target.checked));

  function syncBuild() {
    const err = B.validate(state.spec);
    $("warn").textContent = state.spec.joints.length ? err || "" : "";
    $("play").disabled = state.mode === "build" && !!err;
  }

  // ---------- modes ----------
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x.dataset.m === m));
    $("build-ui").style.display = m === "build" ? "grid" : "none";
    $("view").style.cursor = m === "build" ? "crosshair" : "default";
    if (m === "build") { state.playing = false; state.replay = null; syncPlay(); }
    syncBuild();
  }
  document.querySelectorAll("#mode button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.m === "evolve") startEvolve();
      else { setMode("build"); ML.say("Back to the workshop. Change your creature, then evolve again (it starts fresh)."); state.ev = null; }
    })
  );

  function rules() {
    return B.makeRules(state.goal, state.ch);
  }
  function startEvolve(keepGoing) {
    const err = B.validate(state.spec);
    if (err) { ML.toast(err); return false; }
    if (!state.ev || !keepGoing) {
      state.ev = new B.Evolution(clone(state.spec), rules(), 40);
      state.markers = [];
      state.bestEver = 0;
      state.watch = null;
      state.offered = false;
      ckpts.clear();
      drawChart();
    }
    setMode("evolve");
    state.playing = true;
    syncPlay();
    ML.say(`Generation 1! <b>40 copies</b> of your creature, each with a random brain. Expect flopping…`);
    return true;
  }

  // ---------- controls ----------
  function syncPlay() {
    $("play").innerHTML = state.mode === "build" ? `${ML.icon("sparkles")} Evolve!` : state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
  }
  $("play").addEventListener("click", () => {
    if (state.mode === "build" || !state.ev) return startEvolve(!!state.ev);
    state.replay = null;
    ckpts.active = null; ckpts.render();
    state.playing = !state.playing;
    syncPlay();
  });
  $("next").addEventListener("click", () => {
    if (!state.ev) return startEvolve();
    state.replay = null;
    finishGeneration(state.ev.runGeneration()); // finish this race instantly
  });
  $("reset").addEventListener("click", () => {
    if (!state.ev) return;
    state.ev = null;
    startEvolve();
    ML.say("All learning erased. Fresh random brains!");
  });
  document.querySelectorAll("#speed button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
      state.speed = +b.dataset.v;
    })
  );
  document.querySelectorAll("#goal button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#goal button").forEach((x) => x.classList.toggle("on", x === b));
      state.goal = b.dataset.g;
      const say = { run: "Goal: <b>run as far as possible</b>.", jump: "Goal: <b>get over the wall</b>! Running alone won't do it.", stairs: "Goal: <b>climb the stairs</b>. Each step is a little ledge." }[state.goal];
      if (state.ev) { state.ev.setRules(rules()); addMarker(`goal: ${b.textContent.toLowerCase()}`); }
      ML.say(say + (state.ev ? " The same brains keep evolving for the new goal." : ""));
    })
  );

  // ---------- challenges ----------
  const CH_NAMES = { hills: "hills", ice: "ice", moon: "moon gravity", wind: "headwind", limp: "a floppy muscle" };
  document.querySelectorAll("#chal [data-c]").forEach((b) =>
    b.addEventListener("click", () => {
      const c = b.dataset.c;
      const on = !state.ch[c];
      state.ch[c] = on;
      if (c === "limp" && on && state.ev) state.ch.limpIdx = B.busiestMuscle(state.ev.spec, state.ev.rules, state.ev.bestBrain);
      b.classList.toggle("on", on);
      if (!state.ev) { ML.say(on ? `${CH_NAMES[c]} will be on when evolution starts.` : `${CH_NAMES[c]} off.`); return; }
      state.ev.setRules(rules());
      addMarker((on ? "+" : "−") + CH_NAMES[c]);
      const h = state.ev.history;
      const pre = h.length ? h.slice(-3).reduce((s, x) => s + x.best, 0) / Math.min(3, h.length) : 0;
      state.watch = on && h.length >= 3 ? { name: CH_NAMES[c], pre, at: h.length, low: Infinity, dropped: false } : null;
      ML.say(on
        ? c === "limp" ? `Oh no, muscle ${state.ch.limpIdx + 1} (the one it used most) went <b>floppy</b>! The brains have to find a new way to move.`
          : `<b>${CH_NAMES[c]}</b>! The old walk might not work any more. Watch the next generations.`
        : `${CH_NAMES[c]} off.`);
    })
  );
  function addMarker(label) {
    state.markers.push({ at: state.ev ? state.ev.history.length : 0, label });
    drawChart();
  }

  // ---------- checkpoints ----------
  const ckpts = new GameLab.Checkpoints($("ckpts"), (it) => {
    state.playing = false;
    syncPlay();
    state.replay = { item: it, body: new B.Body(state.ev.spec, state.ev.rules, it.brain.clone()) };
    ML.say(`This is the champion of <b>generation ${it.gen}</b>. Watch how it moved back then.`);
  }, () => { state.replay = null; });
  function drawMiniPose(cv, it) {
    if (!it.pose) {
      const b = B.trial(state.ev.spec, it.rules, it.brain.clone(), 360);
      it.pose = { x: b.x.slice(), y: b.y.slice(), m: b.meters() };
    }
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    const p = it.pose, cx = p.x.reduce((s, v) => s + v, 0) / p.x.length;
    const S = 0.75, gy = cv.height - 14;
    c.fillStyle = "#9fd39a"; c.fillRect(0, gy, cv.width, 14);
    c.lineCap = "round";
    state.ev.spec.muscles.forEach(([a, b]) => { c.strokeStyle = "#ff6f91"; c.lineWidth = 3; c.beginPath(); c.moveTo(cv.width / 2 + (p.x[a] - cx) * S, gy - p.y[a] * S); c.lineTo(cv.width / 2 + (p.x[b] - cx) * S, gy - p.y[b] * S); c.stroke(); });
    state.ev.spec.bones.forEach(([a, b]) => { c.strokeStyle = "#2a2d55"; c.lineWidth = 6; c.beginPath(); c.moveTo(cv.width / 2 + (p.x[a] - cx) * S, gy - p.y[a] * S); c.lineTo(cv.width / 2 + (p.x[b] - cx) * S, gy - p.y[b] * S); c.stroke(); });
  }

  // ---------- the evolution loop ----------
  function finishGeneration(h) {
    const ev = state.ev;
    if (h.best > state.bestEver) state.bestEver = h.best;
    const it = { gen: ev.gen, brain: ev.bestBrain.clone(), rules: ev.rules, label: `Gen ${ev.gen}`, sub: `${h.best.toFixed(1)} m` };
    it.draw = (cv) => drawMiniPose(cv, it);
    if (ev.gen <= 3 || ev.gen % (state.speed === 0 ? 5 : 1) === 0 || state.watch) ckpts.add(it);
    drawChart();
    narrate(h);
  }
  function narrate(h) {
    const ev = state.ev, g = ev.gen;
    const w = state.watch;
    if (w) {
      const since = ev.history.length - w.at;
      w.low = Math.min(w.low, h.best);
      if (!w.dropped && h.best < w.pre * 0.85) { w.dropped = true; say(`Ouch! With <b>${w.name}</b> the best fell from ${w.pre.toFixed(1)} m to ${h.best.toFixed(1)} m. Let's see if they adapt…`); return; }
      if (w.dropped && h.best >= Math.max(w.pre * 0.9, w.low * 1.4)) {
        say(`They adapted to <b>${w.name}</b>! After ${since} generations the best is back to <b>${h.best.toFixed(1)} m</b>.`);
        ML.confetti(50);
        state.watch = null;
        return;
      }
      if (!w.dropped && since >= 3) { say(`<b>${w.name}</b> didn't slow them down much${h.best > w.pre ? " (it even helped!)" : ""}. Try another challenge.`); state.watch = null; return; }
      return;
    }
    if (g === 1) say(`Generation 1 done: the best went <b>${h.best.toFixed(1)} m</b>, mostly by luck. Its brain becomes a parent.`);
    else if (g === 5) say(`Generation 5: the best now reaches <b>${h.best.toFixed(1)} m</b>. Small random changes are adding up.`);
    else if (g % 10 === 0) say(`Generation ${g}: best <b>${h.best.toFixed(1)} m</b>, average ${h.avg.toFixed(1)} m. The whole family is catching up.`);
    const goalOk = state.goal === "jump" ? h.best > ev.rules.wallX / B.PX_PER_M + 0.4 : h.best >= (state.goal === "stairs" ? 6 : 10);
    if (goalOk && !state.offered) {
      state.offered = true;
      ML.confetti(60);
      say(state.goal === "jump" ? `It made it <b>over the wall</b>! Nobody taught it to jump.` : `Look at it go: <b>${h.best.toFixed(1)} m</b>! Your creature learned to move all by itself.`);
      ML.xray.offer("It learned to move! X-ray its brain");
    }
  }
  const say = (html) => ML.say(html);

  function tick() {
    if (state.replay) {
      const r = state.replay;
      for (let i = 0; i < Math.max(1, state.speed === 0 ? 3 : Math.min(state.speed, 3)); i++) r.body.step();
      if (r.body.t >= B.STEPS) r.body = new B.Body(state.ev.spec, state.ev.rules, r.item.brain.clone());
      return;
    }
    if (!state.playing || !state.ev) return;
    const ev = state.ev;
    const t0 = performance.now();
    if (state.speed === 0) {
      // Turbo: whole generations as fast as fits in ~9 ms a frame.
      while (performance.now() - t0 < 9) {
        if (ev.stepRace()) finishGeneration(ev.endRace());
      }
    } else {
      for (let i = 0, n = ML.ticks(state.speed); i < n; i++) {
        if (ev.stepRace()) { finishGeneration(ev.endRace()); break; }
        if (performance.now() - t0 > 9) break;
      }
    }
  }

  // ---------- drawing ----------
  let camX = 0;
  const BODY = "#5b5fe0";
  function drawCreature(body, spec, ox, oy, alpha, leader) {
    const sx = (x) => ox + x, sy = (y) => oy - y;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    // muscles: pink bands that get fatter and redder when squeezing
    spec.muscles.forEach(([a, b], m) => {
      const s = body ? body.squeeze[m] : 0;
      const limp = body && body.rules.limp && m === body.rules.limpIdx;
      ctx.strokeStyle = limp ? "#b9bbcf" : s > 0 ? `rgb(${230},${Math.round(110 - 70 * s)},${Math.round(150 - 80 * s)})` : "#ff9ab5";
      ctx.lineWidth = limp ? 2 : 5 + 5 * Math.max(0, s);
      if (limp) ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(sx(X(body, spec, a)), sy(Y(body, spec, a))); ctx.lineTo(sx(X(body, spec, b)), sy(Y(body, spec, b))); ctx.stroke();
      ctx.setLineDash([]);
    });
    // bones: thick rounded sticks
    spec.bones.forEach(([a, b]) => {
      ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(sx(X(body, spec, a)), sy(Y(body, spec, a))); ctx.lineTo(sx(X(body, spec, b)), sy(Y(body, spec, b))); ctx.stroke();
      ctx.strokeStyle = leader ? BODY : "#8b8fd9"; ctx.lineWidth = 6.5;
      ctx.beginPath(); ctx.moveTo(sx(X(body, spec, a)), sy(Y(body, spec, a))); ctx.lineTo(sx(X(body, spec, b)), sy(Y(body, spec, b))); ctx.stroke();
    });
    // joints: balls (darker when touching the ground)
    spec.joints.forEach((_, i) => {
      ctx.fillStyle = body && body.contact[i] ? "#ffb020" : "#fff";
      ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx(X(body, spec, i)), sy(Y(body, spec, i)), 6.5, 0, 7); ctx.fill(); ctx.stroke();
    });
    // googly eyes on the highest joint
    if (state.eyes && (leader || !body) && spec.joints.length) {
      let top = 0;
      spec.joints.forEach((_, i) => { if (Y(body, spec, i) > Y(body, spec, top)) top = i; });
      const hx = sx(X(body, spec, top)), hy = sy(Y(body, spec, top)) - 14;
      const vx = body ? Math.max(-2.5, Math.min(2.5, (body.x[top] - body.px[top]) * 1.5)) : 1.5;
      for (const dx of [-8, 8]) {
        ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hx + dx, hy, 7.5, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(hx + dx + vx, hy + 1.5, 3.5, 0, 7); ctx.fill();
      }
    }
    if (leader && body) {
      // crown above the highest point
      let ty = -Infinity, tx = 0;
      spec.joints.forEach((_, i) => { if (Y(body, spec, i) > ty) { ty = Y(body, spec, i); tx = X(body, spec, i); } });
      const cx = sx(tx), cy = sy(ty) - (state.eyes ? 36 : 20);
      ctx.fillStyle = "#ffc531"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 10, cy + 6); ctx.lineTo(cx - 10, cy - 4); ctx.lineTo(cx - 5, cy + 1); ctx.lineTo(cx, cy - 7); ctx.lineTo(cx + 5, cy + 1); ctx.lineTo(cx + 10, cy - 4); ctx.lineTo(cx + 10, cy + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  const X = (body, spec, i) => (body ? body.x[i] : spec.joints[i][0]);
  const Y = (body, spec, i) => (body ? body.y[i] : spec.joints[i][1]);

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, ML.isDark() ? "#1d2350" : "#d7ebff");
    g.addColorStop(1, ML.isDark() ? "#26305f" : "#f3f9ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBuild() {
    drawSky();
    ctx.fillStyle = "#9fd39a"; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = "rgba(31,33,64,.08)"; ctx.lineWidth = 1;
    for (let x = W / 2 % 25; x < W; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND); ctx.stroke(); }
    for (let y = GROUND % 25; y < GROUND; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    drawCreature(null, state.spec, W / 2, GROUND, 1, false);
    if (drag && drag.from !== undefined) {
      const [ax, ay] = toScreen(...state.spec.joints[drag.from]);
      ctx.strokeStyle = state.tool === "bone" ? "#1f2140" : "#ff6f91";
      ctx.lineWidth = state.tool === "bone" ? 8 : 5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(drag.x, drag.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "rgba(31,33,64,.55)"; ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "left";
    const S = state.spec;
    ctx.fillText(`${S.joints.length} joints · ${S.bones.length} bones · ${S.muscles.length} muscles`, 12, 22);
  }

  function drawWorld() {
    const ev = state.ev;
    const R = state.replay ? state.replay.body.rules : ev.rules;
    const focus = state.replay ? state.replay.body : ev.leader();
    camX += (focus.centerX() - camX) * 0.12;
    const ox = W / 2 - camX, oy = H - 60;
    drawSky();
    // clouds (parallax)
    ctx.fillStyle = "rgba(255,255,255,.75)";
    for (let i = 0; i < 6; i++) {
      const x = ((i * 190 - camX * 0.3) % (W + 200) + W + 200) % (W + 200) - 100, y = 40 + (i % 3) * 30;
      ctx.beginPath(); ctx.ellipse(x, y, 40, 14, 0, 0, 7); ctx.ellipse(x + 26, y - 8, 26, 12, 0, 0, 7); ctx.fill();
    }
    // ground
    ctx.fillStyle = R.ice ? "#cfeaf7" : "#9fd39a";
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let sx = 0; sx <= W; sx += 4) ctx.lineTo(sx, oy - B.groundY(sx - ox, R));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = R.ice ? "#8cc9e6" : "#6fb46a"; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let sx = 0; sx <= W; sx += 4) (sx ? ctx.lineTo : ctx.moveTo).call(ctx, sx, oy - B.groundY(sx - ox, R));
    ctx.stroke();
    // distance markers every metre
    ctx.fillStyle = "#1f2140"; ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "center";
    const start = focus.startX;
    for (let m = Math.floor((camX - W / 2 - start) / B.PX_PER_M) - 1; m <= (camX + W / 2 - start) / B.PX_PER_M + 1; m++) {
      const wx = start + m * B.PX_PER_M, sx = ox + wx, gy = oy - B.groundY(wx, R);
      ctx.fillRect(sx - 1, gy, 2, m % 5 === 0 ? 12 : 6);
      if (m % 2 === 0) ctx.fillText(`${m} m`, sx, gy + 24);
    }
    // the wall
    if (R.goal === "jump") {
      const wx = start + R.wallX, sx = ox + wx, gy = oy - B.groundY(wx, R);
      ctx.fillStyle = "#c46a4a"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2;
      ctx.fillRect(sx - 8, gy - R.wallH, 16, R.wallH); ctx.strokeRect(sx - 8, gy - R.wallH, 16, R.wallH);
    }
    // wind streaks
    if (R.wind) {
      ctx.strokeStyle = "rgba(31,33,64,.25)"; ctx.lineWidth = 2;
      const t = performance.now() / 6;
      for (let i = 0; i < 9; i++) { const y = 50 + i * 30, x = W - ((t + i * 97) % (W + 80)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40, y); ctx.stroke(); }
    }
    // creatures: babies ghosted, the leader on top
    const spec = ev.spec;
    if (state.replay) drawCreature(state.replay.body, spec, ox, oy, 1, true);
    else {
      if (state.babies) for (const b of ev.bodies) if (b !== focus) drawCreature(b, spec, ox, oy, 0.16, false);
      drawCreature(focus, spec, ox, oy, 1, true);
    }
    // banner
    ctx.fillStyle = "rgba(31,33,64,.82)";
    ctx.beginPath(); ctx.roundRect(12, 12, 300, 28, 9); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "left";
    const t = state.replay ? state.replay.body.t : ev.t;
    ctx.fillText(state.replay ? `Replaying gen ${state.replay.item.gen} champion · ${focus.meters().toFixed(1)} m`
      : `Gen ${ev.gen + 1} race · ${((B.STEPS - t) / 60).toFixed(1)} s left · leader ${focus.meters().toFixed(1)} m`, 22, 31);
  }

  function drawChart() {
    const ev = state.ev;
    const h = ev ? ev.history : [];
    const yMax = Math.max(5, Math.ceil(Math.max(0, ...h.map((x) => x.best)) * 1.15));
    GameLab.drawChart(chart, [
      { values: h.map((x) => Math.max(0, x.avg)), color: "--muted" },
      { values: h.map((x) => Math.max(0, x.best)), color: "--accent" },
    ], state.markers, yMax, " m");
  }

  // ---------- inside card ----------
  let insideTick = 0;
  function renderInside() {
    if (++insideTick % 12) return;
    const host = $("inside");
    if (state.mode === "build" || !state.ev) return;
    const b = state.replay ? state.replay.body : state.ev.leader();
    const x = b.inputs;
    const feet = Array.from(b.contact).map((c, i) => (c ? i + 1 : 0)).filter(Boolean);
    const tilt = Math.atan2(x[0], x[1]) * 57.3;
    const lean = Math.abs(tilt) < 12 ? "standing level" : tilt > 0 ? "nose up" : "nose down";
    const beat = x[B.N_IN - 2] > 0 ? "beat: up" : "beat: down";
    const ranked = Array.from(b.squeeze).map((s, m) => [s, m]).sort((a, c) => Math.abs(c[0]) - Math.abs(a[0])).slice(0, 2);
    const acts = ranked.map(([s, m]) => `muscle ${m + 1} <b style="color:${s > 0 ? "var(--bad)" : "var(--sup)"}">${s > 0.3 ? "squeezes" : s < -0.3 ? "stretches" : "relaxes"}</b> (${s.toFixed(2)})`).join(", ");
    host.innerHTML = `<div>${ML.icon("eye")} ${feet.length ? `joint${feet.length > 1 ? "s" : ""} <b>${feet.slice(0, 4).join(", ")}</b> on the ground` : "<b>in the air!</b>"} · <b>${lean}</b> · ${beat}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("network")} The brain mixes these ${B.N_IN} feelings through ${B.HIDDEN} thinking neurons</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("zap")} ${acts}</div>`;
  }
  function renderStats() {
    const ev = state.ev;
    $("st-gen").textContent = ev ? ev.gen : 0;
    $("st-best").innerHTML = `${state.bestEver.toFixed(1)}<small> m</small>`;
    const lead = ev ? (state.replay ? state.replay.body : ev.leader()) : null;
    $("st-lead").innerHTML = `${lead ? lead.meters().toFixed(1) : "0.0"}<small> m</small>`;
    const t = ev ? (state.replay ? state.replay.body.t : ev.t) : 0;
    $("st-time").innerHTML = `${((B.STEPS - t) / 60).toFixed(1)}<small> s</small>`;
  }

  // ---------- Model X-ray ----------
  const seen = [];
  setInterval(() => {
    if (state.ev && state.playing && !state.replay) { seen.push(Array.from(state.ev.leader().inputs)); if (seen.length > 300) seen.shift(); }
  }, 150);
  function registerXray() {
    const ev = state.ev;
    if (!ev) return;
    const nJ = Math.min(B.N_CONTACT, ev.spec.joints.length);
    const keep = [0, 1, 2, 3, 4, ...Array.from({ length: nJ }, (_, i) => 5 + i), B.N_IN - 2, B.N_IN - 1];
    const pad = (x) => { const full = new Array(B.N_IN).fill(0); keep.forEach((k, i) => (full[k] = x[i])); return full; };
    const brain = ev.bestBrain.clone();
    const names = ["Tilt (nose up/down)", "Tilt (level-ness)", "Height", "Speed forward", "Speed up/down", ...Array.from({ length: nJ }, (_, i) => `Joint ${i + 1} on ground`), "Beat (up/down)", "Beat (ahead/behind)"];
    ML.xray.register({
      title: `Your creature's muscle brain (generation ${ev.gen})`,
      kind: "Neural network",
      summary: () => `${ev.gen} generations of evolution · goal: ${state.goal}`,
      size: () => `${brain.genes.length} knobs`,
      stats: () => [["Generations", ev.gen], ["Best", `${state.bestEver.toFixed(1)} m`], ["Muscles", ev.spec.muscles.length], ["Layers", brain.sizes.join(" → ")]],
      inputs: names.map((n, i) => ({ name: n, min: i >= 5 && i < 5 + nJ ? 0 : -1, max: 1, describe: i >= 5 && i < 5 + nJ ? (v) => (v > 0.5 ? "touching" : "in the air") : undefined })),
      outputs: ev.spec.muscles.map((_, m) => ({ name: `Muscle ${m + 1} squeezes most` })),
      predict: (x) => Array.from(brain.forward(pad(x))),
      samples: () => seen.map((s) => keep.map((k) => s[k])),
      current: () => keep.map((k) => (state.replay ? state.replay.body : ev.leader()).inputs[k]),
      drawBrain: (cv) => {
        const c = cv.getContext("2d"), Wc = cv.width, Hc = cv.height;
        const sizes = brain.sizes, cols = sizes.length;
        const pos = (l, i) => [60 + ((Wc - 120) * l) / (cols - 1), 20 + ((Hc - 40) * (i + 0.5)) / sizes[l]];
        for (let l = 0; l < cols - 1; l++)
          for (let i = 0; i < sizes[l]; i++)
            for (let j = 0; j < sizes[l + 1]; j++) {
              const w = brain.weight(l, i, j), [x1, y1] = pos(l, i), [x2, y2] = pos(l + 1, j);
              c.strokeStyle = w > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
              c.globalAlpha = Math.min(0.85, Math.abs(w) / 2.5);
              c.lineWidth = 0.5 + Math.min(3, Math.abs(w));
              c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
            }
        c.globalAlpha = 1;
        sizes.forEach((n, l) => { for (let i = 0; i < n; i++) { const [x, y] = pos(l, i); c.fillStyle = ML.cssVar("--card"); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 2; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); c.stroke(); } });
        c.fillStyle = ML.cssVar("--muted"); c.font = "800 12px Nunito, sans-serif"; c.textAlign = "center";
        c.fillText("feelings", pos(0, 0)[0], 14); c.fillText("thinking", pos(1, 0)[0], 14); c.fillText("muscles", pos(cols - 1, 0)[0], 14);
      },
      brainCaption: "Left: what the creature feels. Middle: thinking neurons. Right: one neuron per muscle. Blue lines push, orange lines hold back.",
      notes: ["The brain never saw a picture of walking. It only found which squeezes, at which moment of the beat, move the body forward."],
    });
  }
  ML.xray.button($("play").parentElement);
  const _open = ML.xray.open;
  ML.xray.open = () => { if (!state.ev) return ML.toast("Evolve your creature first"); registerXray(); _open(); };

  // ---------- main loop ----------
  syncBuild();
  syncPlay();
  drawChart();
  ckpts.render();
  function frame() {
    tick();
    if (state.mode === "build" || !state.ev) drawBuild();
    else drawWorld();
    renderInside();
    renderStats();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still moving", count: AliveChip.moving(() => (state.replay || !state.ev || !state.ev.bodies ? null : state.ev.bodies.map((b) => b.centerX())), 3) });
})();
