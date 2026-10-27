// Reward Hacking — play the boat race, then watch Q-learning find (and be cured of) the loophole.
(function () {
  const C = window.HackCore;
  const { W, H, MAX_STEPS } = C;
  const CELL = 90, CW = W * CELL, CH = H * CELL;
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cv = $("sea");
  const ctx = ML.setupCanvas(cv, CW, CH).ctx;
  const chartCv = $("chart");
  const CHW = 360, CHH = 150;
  const chart = ML.setupCanvas(chartCv, CHW, CHH).ctx;

  const rw = C.defaultReward();
  const wopts = { drain: false, fake: false };
  let world = C.makeWorld(wopts);
  let mode = "you";

  // ---------- hand play ----------
  let env = new C.Env(world, rw), trail = [], humanOver = false, humanTouches = 0;
  let boat = { fx: 0, fy: 0, tx: 0, ty: 0, t0: 0 };
  let pops = [];

  function setBoat(x, y, instant) {
    boat = { fx: instant ? x : boat.tx, fy: instant ? y : boat.ty, tx: x, ty: y, t0: performance.now() };
    if (instant) { boat.fx = x; boat.fy = y; }
  }
  function addPop(x, y, txt, col) { if (!reduce) pops.push({ x, y, txt, col, t0: performance.now() }); }

  function newHuman() {
    env = new C.Env(world, rw); env.reset();
    trail = [{ x: env.x, y: env.y }]; humanOver = false;
    setBoat(env.x, env.y, true);
    updateHuman();
  }
  function cleanScore() { return rw.finish + 2 * rw.cp - 8 * rw.step; }
  function updateHuman() {
    $("y-pts").textContent = env.points.toFixed(1);
    $("y-left").textContent = MAX_STEPS - env.steps;
    $("y-job").textContent = env.success ? "Yes!" : (humanOver ? "No" : "Not yet");
    $("y-jobbox").className = "stat" + (env.success ? " ok" : humanOver ? " no" : "");
    $("y-best").textContent = `Sailing straight to the dock scores about ${cleanScore().toFixed(1)} points. Can you beat that?`;
  }
  function move(a) {
    if (mode !== "you") return;
    if (humanOver) { newHuman(); return; }
    const res = env.step(a);
    trail.push({ x: env.x, y: env.y });
    setBoat(env.x, env.y);
    if (res.touched) addPop(env.x, env.y, "+" + rw.cp, "#f97316");
    if (res.done && res.kind === "dock") addPop(env.x, env.y, "+" + rw.finish, "#16a34a");
    if (res.over) endHuman(res);
    updateHuman();
  }
  function endHuman(res) {
    humanOver = true;
    const p = env.points.toFixed(1), k = env.kind || "timeout";
    let msg, ov;
    if (k === "dock") {
      ov = "You reached the dock!";
      msg = env.touches >= 6 ? `Docked with <b>${p}</b> points, after bouncing on the buoys ${env.touches} times. Hmm, was finishing even the best way to score?`
        : `You reached the dock with <b>${p}</b> points. That is the real job done! Now, try to score even more... is there a trick?`;
    } else if (k === "fake") {
      ov = "Fake flag!"; msg = `You touched the striped flag and got <b>${p}</b> points, but it is <b>not the real dock</b>. The reward cannot tell the difference!`;
    } else if (k === "drain") {
      ov = "Down the drain!"; msg = `Glug! The drain ended the race with <b>${p}</b> points. Quitting early is also a strategy...`;
    } else if (env.touches >= 4) {
      ov = "Loophole found!"; msg = `<b>${p} points</b> and you never reached the dock! The buoys pay every single touch, so circling beats finishing. You just <b>hacked the reward</b>. Robo will find this too!`;
    } else {
      ov = "Out of moves"; msg = `Out of moves with <b>${p}</b> points. The real job is the dock. Try again!`;
    }
    ML.say(msg); showOverlay(ov);
    if (k !== "dock" && env.touches >= 4) ML.toast("Reward hacked! Press 'Robo learns' to see it find the trick.");
  }

  // ---------- Robo learns ----------
  let agent = null, running = false, inRace = false, runCount = 0, speed = 1;
  let history = [], marks = [], ckpts = [], view = null, ckDirty = true, lastRun = null;
  let streak = { cls: "", len: 0 }, announced = "", celebrated = false, lastStepT = 0, holdUntil = 0;
  const SPEEDS = ["Watch", "Fast", "Turbo"];
  const CK_AT = [1, 4, 20, 60, 200, 500];
  const clsOf = (k) => (C.isHack(k) ? "hack" : k === "drain" ? "lazy" : k === "dock" ? "real" : "other");

  function bindAgent() {
    agent.world = world; agent.rw = rw; agent.env = new C.Env(world, rw); inRace = false;
  }
  function retrain(talk) {
    agent = new C.Agent(world, rw, 100 + runCount++);
    history = []; marks = []; ckpts = []; view = null; ckDirty = true; lastRun = null;
    streak = { cls: "", len: 0 }; announced = ""; celebrated = false; inRace = false;
    lastRun = C.rollout(agent.Q, world, rw);
    renderMarks(); updateStats(); drawChart();
    if (talk) ML.say("Fresh brain! I know nothing. I will sail around and remember which moves led to <b>points</b>.");
  }
  function addMark(label) {
    if (!agent) return;
    const n = agent.episodes, last = marks[marks.length - 1];
    if (last && last.n === n && last.label === label) return;
    marks.push({ n, label }); renderMarks();
  }
  function renderMarks() {
    $("marks").innerHTML = marks.map((m, i) => `<li><b>${i + 1}</b>${m.label} (try ${m.n})</li>`).join("");
  }
  function addCkpt(label, run, n) {
    ckpts.push({ n, label, run, key: label });
    ckpts.sort((a, b) => a.n - b.n);
    ckDirty = true;
  }
  const KIND_TXT = { dock: "reaches the dock", loop: "circles the buoys", fake: "uses the fake flag", drain: "dives in the drain", timeout: "wanders about" };
  const KIND_I = { dock: "reach the dock", loop: "circle the buoys", fake: "use the fake flag", drain: "dive in the drain", timeout: "wander about" };

  function onEpisode() {
    const ev = C.rollout(agent.Q, world, rw);
    lastRun = ev;
    const n = agent.episodes;
    history.push({ n, pts: ev.points, ok: ev.success ? 1 : 0, kind: ev.kind });
    if (CK_AT.includes(n)) addCkpt(`After try ${n}`, ev, n);
    const cls = clsOf(ev.kind);
    if (cls === streak.cls) streak.len++; else streak = { cls, len: 1 };
    if (streak.len === 8 && cls !== "other" && cls !== announced) announce(cls, ev, n);
    if (streak.len === 8 && cls === "other") announced = announced === "real" ? announced : "";
  }
  function announce(cls, ev, n) {
    const before = announced;
    announced = cls;
    if (cls === "hack") {
      addMark(ev.kind === "fake" ? "Robo found the fake flag" : "Robo found the buoy loop");
      addCkpt(`Hack found (try ${n})`, ev, n);
      ML.say(ev.kind === "fake"
        ? `Ooh! The striped flag pays the <b>same bonus</b> and is right next to the start. Look at the chart: points up, real job at zero!`
        : `I found something! Bouncing on the buoys pays <b>${ev.points.toFixed(0)} points</b>, way more than the dock. Look at the chart: <b>points up, real job down</b>. I am not cheating, I am just doing what the reward says!`);
      showOverlay("Hack discovered!");
    } else if (cls === "lazy") {
      addMark("Robo gave up (drain)");
      addCkpt(`Gave up (try ${n})`, ev, n);
      ML.say(`Every move costs me points and nothing pays at the end, so the <b>best plan is to end the race right now</b>. Lazy? Maybe. Sensible given the rules? Yes!`);
      showOverlay("The lazy robot");
    } else if (cls === "real") {
      addMark(before === "hack" || before === "lazy" ? "Fixed! Robo really docks" : "Robo docks the real way");
      addCkpt(`Docks (try ${n})`, ev, n);
      if (!celebrated) { celebrated = true; ML.confetti(); }
      ML.say(before === "hack" || before === "lazy"
        ? `Fixed! With the new rules the best-paid plan <b>is</b> the real job. I sail to the dock in ${ev.steps} moves. Nice reward writing!`
        : `I reach the dock in ${ev.steps} moves and collect <b>${ev.points.toFixed(1)}</b> points.`);
      showOverlay("Real job done!");
    }
  }

  function doRaceStep(now) {
    if (!inRace) { agent.env.reset(); inRace = true; trail = [{ x: agent.env.x, y: agent.env.y }]; setBoat(agent.env.x, agent.env.y, true); }
    const res = agent.learnStep();
    trail.push({ x: agent.env.x, y: agent.env.y });
    setBoat(agent.env.x, agent.env.y);
    if (res.touched) addPop(agent.env.x, agent.env.y, "+" + rw.cp, "#f97316");
    if (res.over) { inRace = false; agent.episodes++; onEpisode(); holdUntil = now + (speed === 0 ? 350 : 0); }
  }

  // ---------- drawing ----------
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function drawTile(c, t, x, y, s) {
    if (t === "#") { c.fillStyle = ML.cssVar("--ink-2"); c.beginPath(); c.ellipse(x + s / 2, y + s * 0.55, s * 0.36, s * 0.3, 0, 0, 7); c.fill(); c.fillStyle = "rgba(255,255,255,.25)"; c.beginPath(); c.ellipse(x + s * 0.42, y + s * 0.45, s * 0.14, s * 0.09, -0.4, 0, 7); c.fill(); }
    else if (t === "B") {
      c.fillStyle = "#f97316"; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.26, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.fillRect(x + s * 0.26, y + s * 0.44, s * 0.48, s * 0.12);
      c.strokeStyle = "#c2410c"; c.lineWidth = Math.max(1.5, s * 0.03); c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.26, 0, 7); c.stroke();
    } else if (t === "D") {
      c.fillStyle = "#a16207"; rr(c, x + s * 0.08, y + s * 0.12, s * 0.84, s * 0.76, s * 0.08); c.fill();
      c.strokeStyle = "#713f12"; c.lineWidth = Math.max(1, s * 0.025);
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + s * 0.08, y + s * (0.12 + i * 0.19)); c.lineTo(x + s * 0.92, y + s * (0.12 + i * 0.19)); c.stroke(); }
      c.fillStyle = "#fff"; c.font = `800 ${s * 0.2}px Nunito, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("DOCK", x + s / 2, y + s / 2);
    } else if (t === "F") {
      const g = s * 0.14;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? "#fff" : "#1f2937"; c.fillRect(x + s * 0.1 + i * g * 1.2, y + s * 0.2 + j * g * 1.2, g * 1.2, g * 1.2); }
      c.strokeStyle = "#1f2937"; c.lineWidth = 2; c.strokeRect(x + s * 0.1, y + s * 0.2, g * 6, g * 4.8);
    } else if (t === "X") {
      for (let i = 3; i >= 0; i--) { c.fillStyle = `rgba(15,23,42,${0.25 + i * 0.2})`; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * (0.12 + (3 - i) * 0.08), 0, 7); c.fill(); }
      c.fillStyle = "rgba(15,23,42,.95)"; c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.1, 0, 7); c.fill();
    }
  }
  function drawBoat(c, px, py, s, face) {
    c.save(); c.translate(px, py);
    c.fillStyle = ML.cssVar("--ink"); c.beginPath(); c.moveTo(-s * 0.3, s * 0.08); c.lineTo(s * 0.3, s * 0.08); c.lineTo(s * 0.2, s * 0.24); c.lineTo(-s * 0.2, s * 0.24); c.closePath(); c.fill();
    c.fillStyle = ML.cssVar("--accent"); c.beginPath(); c.moveTo(0, -s * 0.3); c.lineTo(s * 0.22 * face, s * 0.04); c.lineTo(0, s * 0.04); c.closePath(); c.fill();
    c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = Math.max(1.5, s * 0.03); c.beginPath(); c.moveTo(0, -s * 0.3); c.lineTo(0, s * 0.08); c.stroke();
    c.restore();
  }
  function drawWorld(c, wd, s, x0, y0) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      c.fillStyle = (x + y) % 2 ? "rgba(56,189,248,.10)" : "rgba(56,189,248,.04)";
      c.fillRect(x0 + x * s, y0 + y * s, s, s);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = wd.tiles[y * W + x];
      if (t !== ".") drawTile(c, t, x0 + x * s, y0 + y * s, s);
    }
    // start marker
    c.strokeStyle = ML.cssVar("--muted"); c.setLineDash([4, 4]); c.lineWidth = 2;
    c.strokeRect(x0 + wd.start.x * s + 4, y0 + wd.start.y * s + 4, s - 8, s - 8); c.setLineDash([]);
  }
  function drawPath(c, path, s, col, dash, lw) {
    if (path.length < 2) return;
    c.strokeStyle = col; c.lineWidth = lw; c.lineJoin = "round"; c.lineCap = "round"; c.setLineDash(dash);
    // small offset per revisit so loops stay visible
    c.beginPath();
    path.forEach((p, i) => { const px = (p.x + 0.5) * s + ((i % 2) ? 3 : -3) * s / CELL, py = (p.y + 0.5) * s; i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.stroke(); c.setLineDash([]);
  }

  let facing = 1;
  function draw(now) {
    ctx.clearRect(0, 0, CW, CH);
    drawWorld(ctx, world, CELL, 0, 0);
    let pos = null;
    const replayRun = view ? view.run : (mode === "robo" && !(speed === 0 && running) ? lastRun : null);
    if (mode === "you") {
      drawPath(ctx, trail, CELL, ML.cssVar("--ink-2"), [], 3);
      const k = reduce ? 1 : Math.min(1, (now - boat.t0) / 110);
      pos = { x: boat.fx + (boat.tx - boat.fx) * k, y: boat.fy + (boat.ty - boat.fy) * k };
    } else if (replayRun) {
      drawPath(ctx, replayRun.path, CELL, ML.cssVar("--rl"), [8, 7], 4);
      const stepMs = 380, i = Math.floor(now / stepMs) % (replayRun.path.length + 2), p = replayRun.path[Math.min(i, replayRun.path.length - 1)];
      if (draw.lastI !== i) { draw.lastI = i; if (replayRun.buoys.includes(i) && i < replayRun.path.length) addPop(p.x, p.y, "+" + rw.cp, "#f97316"); }
      pos = { x: p.x, y: p.y };
    } else {
      drawPath(ctx, trail, CELL, ML.cssVar("--rl"), [], 3);
      const k = reduce ? 1 : Math.min(1, (now - boat.t0) / 110);
      pos = { x: boat.fx + (boat.tx - boat.fx) * k, y: boat.fy + (boat.ty - boat.fy) * k };
    }
    if (pos) {
      if (pos.x > draw.px + 0.01) facing = 1; else if (pos.x < draw.px - 0.01) facing = -1;
      draw.px = pos.x;
      const bob = reduce ? 0 : Math.sin(now / 300) * 2;
      drawBoat(ctx, (pos.x + 0.5) * CELL, (pos.y + 0.5) * CELL + bob, CELL, facing);
    }
    pops = pops.filter((p) => now - p.t0 < 900);
    pops.forEach((p) => {
      const t = (now - p.t0) / 900;
      ctx.globalAlpha = 1 - t; ctx.fillStyle = p.col; ctx.font = "800 22px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(p.txt, (p.x + 0.5) * CELL, p.y * CELL + 14 - t * 30); ctx.globalAlpha = 1;
    });
  }
  draw.px = 0; draw.lastI = -1;

  function drawChart() {
    const c = chart, L = 30, R = 8, T = 16, B = 14, w = CHW - L - R, h = CHH - T - B;
    c.clearRect(0, 0, CHW, CHH);
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right"; c.textBaseline = "middle";
    c.fillText("100%", L - 4, T); c.fillText("0%", L - 4, T + h);
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, T); c.lineTo(L + w, T); c.moveTo(L, T + h); c.lineTo(L + w, T + h); c.stroke();
    const n = history.length;
    c.textAlign = "center"; c.fillText("tries", L + w / 2, CHH - 4);
    if (!n) return;
    const maxN = Math.max(n, 30), X = (e) => L + (e / maxN) * w;
    let mn = Infinity, mx = -Infinity;
    history.forEach((hh) => { mn = Math.min(mn, hh.pts); mx = Math.max(mx, hh.pts); });
    if (mx - mn < 1) mx = mn + 1;
    const stride = Math.max(1, Math.ceil(n / 300));
    const line = (fn, col, lw) => {
      c.strokeStyle = col; c.lineWidth = lw; c.lineJoin = "round"; c.beginPath();
      let first = true;
      for (let i = 0; i < n; i += stride) { const px = X(history[i].n), py = fn(i); first ? c.moveTo(px, py) : c.lineTo(px, py); first = false; }
      const li = n - 1; c.lineTo(X(history[li].n), fn(li)); c.stroke();
    };
    marks.forEach((m, i) => {
      const x = X(Math.min(m.n, maxN));
      c.strokeStyle = ML.cssVar("--ink-2"); c.setLineDash([3, 3]); c.lineWidth = 1; c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + h); c.stroke(); c.setLineDash([]);
      c.fillStyle = ML.cssVar("--accent"); c.beginPath(); c.arc(x, 8, 7, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.font = "800 9px Nunito, sans-serif"; c.textBaseline = "middle"; c.textAlign = "center"; c.fillText(String(i + 1), x, 8.5);
    });
    line((i) => T + h - ((history[i].pts - mn) / (mx - mn)) * h, ML.cssVar("--rl"), 2.5);
    line((i) => { let s = 0, k = 0; for (let j = Math.max(0, i - 9); j <= i; j++) { s += history[j].ok; k++; } return T + h - (s / k) * h; }, ML.cssVar("--good"), 2.5);
  }

  function updateStats() {
    if (!agent) return;
    $("s-ep").textContent = agent.episodes;
    $("s-pts").textContent = lastRun ? lastRun.points.toFixed(1) : "0";
    const ok = lastRun && lastRun.success;
    $("s-job").textContent = ok ? "Yes" : "No";
    $("s-jobbox").className = "stat" + (agent.episodes ? (ok ? " ok" : " no") : "");
    $("s-eps").textContent = Math.round(agent.eps() * 100) + "%";
  }

  const ARROWS = ["Up", "Right", "Down", "Left"];
  function updateInside() {
    const host = $("inside");
    if (!agent) return;
    if (!agent.episodes && !inRace) { host.innerHTML = `<div>My brain is blank. Every move looks equally good, so I will try things and see what pays.</div>`; return; }
    const e = agent.env, s = inRace ? e.y * W + e.x : world.start.y * W + world.start.x;
    const qs = [0, 1, 2, 3].map((a) => agent.Q[s * 4 + a]), mx = Math.max(...qs);
    const rows = qs.map((q, a) => `<div style="display:flex;justify-content:space-between;${q === mx ? "color:var(--accent)" : ""}"><span>${ML.icon(["arrow-up", "arrow-right", "arrow-down", "arrow-left"][a])} ${ARROWS[a]}</span><span style="font-family:var(--font-mono)">${q.toFixed(1)}</span></div>`).join("");
    const r = lastRun, gain = (rw.cp - rw.step - rw.loop).toFixed(1);
    let note;
    if (!r) note = "";
    else if (r.kind === "loop") note = `I noticed: hopping between buoys pays about <b>+${gain}</b> every move, and I can do that all race. Docking pays <b>${rw.finish}</b> once, then it is over. <b>This loop pays more than finishing!</b>`;
    else if (r.kind === "fake") note = `I noticed: the striped flag pays the same <b>${rw.finish}</b> bonus and is only 2 moves away. Nobody told me it had to be the real dock!`;
    else if (r.kind === "drain") note = `I noticed: every move costs <b>${rw.step}</b>, and the drain stops the race at once. ${rw.finish > 0 ? "The dock is too far to be worth it." : "Nothing pays for docking, so quitting early is the best deal."}`;
    else if (r.kind === "dock") note = `I noticed: the dock bonus (<b>${rw.finish}</b>) is worth more than anything else I can reach, so I follow the arrows there in <b>${r.steps}</b> moves.`;
    else note = `I have not noticed anything that pays well yet, so my best route just wanders.`;
    host.innerHTML = `<div>${inRace ? "My boat is here." : "At the start,"} my scores for each move:</div>${rows}<div class="arrow">${ML.icon("arrow-down")}</div><div>${note}</div>`;
  }

  // ---------- checkpoints ----------
  function renderCkpts() {
    ckDirty = false;
    const host = $("ckpts");
    if (!ckpts.length) { host.innerHTML = `<div class="muted" style="font-weight:700;font-size:.9rem;padding:6px 2px">Snapshots appear as Robo practises.</div>`; return; }
    host.innerHTML = "";
    ckpts.forEach((ck) => {
      const b = document.createElement("button");
      b.className = "ckpt" + (view === ck ? " on" : "");
      const c = document.createElement("canvas"); b.appendChild(c);
      const t = ML.setupCanvas(c, 108, 78).ctx, s = 108 / W;
      drawWorld(t, world, s, 0, 0);
      drawPath(t, ck.run.path, s, ML.cssVar("--rl"), [], 2);
      const e = ck.run.path[ck.run.path.length - 1];
      t.fillStyle = ML.cssVar("--accent"); t.beginPath(); t.arc((e.x + 0.5) * s, (e.y + 0.5) * s, 4, 0, 7); t.fill();
      b.insertAdjacentHTML("beforeend", `<b>${ck.label}</b>${KIND_TXT[ck.run.kind] || ""}<br>${ck.run.points.toFixed(0)} pts`);
      b.addEventListener("click", () => {
        view = view === ck ? null : ck;
        if (view) {
          setRunning(false);
          ML.say(`${ck.label}: I ${KIND_I[ck.run.kind]}, scoring <b>${ck.run.points.toFixed(1)}</b> points${ck.run.success ? " and I really do the job." : " without really doing the job."}`);
        } else ML.say("Back to my brain right now!");
        ckDirty = true;
      });
      host.appendChild(b);
    });
  }

  // ---------- loop ----------
  let lastT = 0, tick = 0;
  function frame(now) {
    if (mode === "robo" && running && agent) {
      if (speed === 0) {
        if (now >= holdUntil && now - lastStepT > 120) { lastStepT = now; doRaceStep(now); }
      } else {
        const budget = speed === 1 ? 4 : 80, t0 = performance.now();
        for (let i = 0; i < budget && performance.now() - t0 < 10; i++) { agent.trainEpisode(); onEpisode(); }
      }
    }
    draw(now);
    if (mode === "robo") {
      if (ckDirty) renderCkpts();
      if (tick % 4 === 0) { drawChart(); updateStats(); updateInside(); }
    }
    tick++; lastT = now;
    requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  function showOverlay(msg) {
    const o = $("overlay"); o.textContent = msg; o.classList.add("show");
    clearTimeout(showOverlay.t); showOverlay.t = setTimeout(() => o.classList.remove("show"), 2200);
  }
  const playBtn = $("play");
  function setRunning(v) {
    running = v;
    if (v && view) { view = null; ckDirty = true; }
    playBtn.innerHTML = running ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Train`;
  }
  function setMode(m) {
    mode = m;
    document.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    const robo = m === "robo";
    $("you-card").classList.toggle("hidden", robo);
    ["learn-card", "ctl-card", "inside-card"].forEach((id) => $(id).classList.toggle("hidden", !robo));
    if (robo) {
      if (!agent) { retrain(false); }
      ML.say(agent.episodes ? "Back to training!" : "Now <b>I</b> sail! I only see points, never the word 'dock'. Press <b>Train</b> and watch the two lines on the chart.");
      drawChart(); updateStats(); renderCkpts();
    } else { setRunning(false); newHuman(); }
  }
  $("mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.mode); });
  playBtn.addEventListener("click", () => setRunning(!running));
  $("step").addEventListener("click", () => { setRunning(false); view = null; ckDirty = true; agent.trainEpisode(); onEpisode(); });
  $("reset").addEventListener("click", () => { setRunning(false); retrain(true); });
  ML.bindRange("#speed", (v) => SPEEDS[v], (v) => { speed = v; inRace = false; });
  speed = 1;

  $("pad").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { move(+b.dataset.d); cv.focus({ preventScroll: true }); } });
  $("y-again").addEventListener("click", newHuman);
  const KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
  document.addEventListener("keydown", (e) => {
    if (mode !== "you" || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    if (e.key in KEYS) { e.preventDefault(); move(KEYS[e.key]); }
    else if (e.key === "Enter" && humanOver) { newHuman(); }
  });
  cv.addEventListener("pointerdown", (e) => {
    if (mode !== "you") return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const tx = Math.floor(((e.clientX - r.left) / r.width) * W), ty = Math.floor(((e.clientY - r.top) / r.height) * H);
    const dx = tx - env.x, dy = ty - env.y;
    if (!dx && !dy) return;
    move(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });

  // ---------- reward editing ----------
  function onReward() {
    if (mode === "you") { newHuman(); }
    else if (agent) { addMark("Reward changed"); lastRun = C.rollout(agent.Q, world, rw); }
    if (!document.querySelector("[data-ch].on")) $("ch-status").textContent = "Reward changed. Press Retrain for a fresh brain, or keep training to see it adapt.";
  }
  let quiet = false;
  function bindR(id, key, fmt) {
    ML.bindRange("#" + id, fmt, (v) => { if (quiet) return; rw[key] = v; clearTimeout(bindR.t); bindR.t = setTimeout(onReward, 250); });
    rw[key] = parseFloat($(id).value);
  }
  bindR("r-cp", "cp", (v) => "+" + v);
  bindR("r-fin", "finish", (v) => "+" + v);
  bindR("r-step", "step", (v) => "-" + v.toFixed(1));
  bindR("r-loop", "loop", (v) => "-" + v);
  $("r-real").addEventListener("change", (e) => { rw.realOnly = e.target.checked; onReward(); });
  function onWorld() {
    wopts.drain = $("w-drain").checked; wopts.fake = $("w-fake").checked;
    world = C.makeWorld(wopts);
    $("lg-drain").style.display = wopts.drain ? "" : "none";
    $("lg-fake").style.display = wopts.fake ? "" : "none";
    if (agent) { bindAgent(); lastRun = C.rollout(agent.Q, world, rw); if (agent.episodes) addMark("Sea changed"); }
    ckpts.forEach((c) => (c.run = c.run)); ckDirty = true;
    if (mode === "you") newHuman();
  }
  $("w-drain").addEventListener("change", onWorld);
  $("w-fake").addEventListener("change", onWorld);
  function setUI() {
    quiet = true;
    [["r-cp", rw.cp], ["r-fin", rw.finish], ["r-step", rw.step], ["r-loop", rw.loop]].forEach(([id, v]) => {
      const el = $(id); el.value = v; el.dispatchEvent(new Event("input"));
    });
    quiet = false;
    $("r-real").checked = rw.realOnly; $("w-drain").checked = wopts.drain; $("w-fake").checked = wopts.fake;
    $("lg-drain").style.display = wopts.drain ? "" : "none";
    $("lg-fake").style.display = wopts.fake ? "" : "none";
  }
  $("r-reset").addEventListener("click", () => {
    Object.assign(rw, C.defaultReward()); Object.assign(wopts, { drain: false, fake: false });
    world = C.makeWorld(wopts); setUI(); document.querySelectorAll("[data-ch]").forEach((b) => b.classList.remove("on"));
    clearTimeout(bindR.t);
    if (agent) { bindAgent(); lastRun = C.rollout(agent.Q, world, rw); if (agent.episodes) addMark("Rules reset"); }
    if (mode === "you") newHuman();
    ML.toast("Rules back to the original.");
  });

  // ---------- challenges ----------
  const CHALLENGES = {
    lazy: {
      rw: { cp: 0, finish: 0, step: 0.5, loop: 0, realOnly: false }, w: { drain: true, fake: false }, mark: "Challenge: lazy robot",
      say: "<b>The lazy robot.</b> Every move costs points and docking pays <b>nothing</b>. There is a drain next to the start. What will I do? Press Train!",
      hint: "Fix it: give the dock a bonus (try +10) so finishing beats quitting, then Retrain.",
    },
    sneaky: {
      rw: { cp: 0, finish: 10, step: 0.1, loop: 0, realOnly: false }, w: { drain: false, fake: true }, mark: "Challenge: sneaky shortcut",
      say: "<b>The sneaky shortcut.</b> The reward says 'bonus for the finish flag', and there is a <b>second flag</b> right by the start. Press Train!",
      hint: "Fix it: tick 'Finish bonus only at the real dock', then Retrain.",
    },
    chain: {
      rw: { cp: 3, finish: 10, step: 1.5, loop: 0, realOnly: false }, w: { drain: true, fake: false }, mark: "Challenge: fix one, find another",
      say: "<b>Fix one, find another.</b> Buoys pay a lot, moves cost a lot, and there is a drain. First I will loop the buoys. Then you patch it... and see what I do next!",
      hint: "Step 1: set buoy points to 0 and Retrain. Robo now quits. Step 2: make moves cheaper (or the dock bonus bigger) and Retrain.",
    },
  };
  document.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
    const ch = CHALLENGES[b.dataset.ch];
    document.querySelectorAll("[data-ch]").forEach((x) => x.classList.toggle("on", x === b));
    Object.assign(rw, ch.rw); Object.assign(wopts, ch.w);
    world = C.makeWorld(wopts); setUI(); clearTimeout(bindR.t);
    if (agent) bindAgent();
    setMode("robo"); setRunning(false); retrain(false);
    addMark(ch.mark);
    ML.say(ch.say); $("ch-status").textContent = ch.hint;
    speed = 1; $("speed").value = 1; $("speed").dispatchEvent(new Event("input"));
    setRunning(true);
  }));

  // ---------- go ----------
  setUI(); newHuman();
  $("lg-drain").style.display = "none"; $("lg-fake").style.display = "none";
  requestAnimationFrame(frame);
  window.__hack = { get agent() { return agent; }, rw, get world() { return world; }, setMode };
})();
