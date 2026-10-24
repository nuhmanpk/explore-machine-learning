// Line Fitter — linear regression by gradient descent, with residual "springs",
// a loss curve, checkpoints and a loss landscape.
(function () {
  const W = 640, H = 440;
  const PX0 = 58, PY0 = 16, PX1 = 624, PY1 = 390;
  const cv = document.getElementById("cv");
  const { ctx } = ML.setupCanvas(cv, W, H);
  const LW = 320, LH = 220;
  const land = document.getElementById("land");
  const { ctx: lctx } = ML.setupCanvas(land, LW, LH);
  const CW = 300, CH = 110;
  const { ctx: cctx } = ML.setupCanvas(document.getElementById("loss"), CW, CH);
  const { hexRgb, rgb, rr } = SupKit;

  // Data lives in u = temp/40 ∈ [0,1], v = cones/100 ∈ [0,1].
  // Model: v = w·s(u) + c with s(u) = 3(u − 0.5). Centering + scaling keeps the loss bowl round.
  const s = (u) => 3 * (u - 0.5);
  const WR = [-0.6, 1.0], CR = [-0.3, 1.3]; // landscape window

  const state = {
    pts: [],
    w: 0, c: 0,
    dw: 0, dc: 0,
    lr: 0.23,
    learning: false,
    steps: 0,
    trail: [],
    ghosts: [],
    history: [],
    userBest: null,
    botScore: null,
    best: null,
    hover: null,
    drag: null,
    viewing: null,
    landDirty: true,
  };

  const toPx = (u, v) => [PX0 + u * (PX1 - PX0), PY1 - v * (PY1 - PY0)];
  const toData = (x, y) => [(x - PX0) / (PX1 - PX0), (PY1 - y) / (PY1 - PY0)];
  const shownW = () => (state.viewing ? state.viewing.w : state.dw);
  const shownC = () => (state.viewing ? state.viewing.c : state.dc);
  const lineV = (u, w = shownW(), c = shownC()) => w * s(u) + c;

  function mse(w = state.w, c = state.c) {
    if (!state.pts.length) return 0;
    let t = 0;
    for (const p of state.pts) t += (w * s(p.u) + c - p.v) ** 2;
    return t / state.pts.length;
  }
  const score = (m) => Math.round(m * 10000); // "oopsie points" = squared cones
  function grad() {
    let gw = 0, gc = 0, up = 0, down = 0;
    const n = state.pts.length || 1;
    for (const p of state.pts) {
      const r = state.w * s(p.u) + state.c - p.v;
      gw += r * s(p.u); gc += r;
      if (r < 0) up++; else down++;
    }
    return { gw: (2 * gw) / n, gc: (2 * gc) / n, up, down };
  }
  function ols() {
    const n = state.pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of state.pts) { const x = s(p.u); sx += x; sy += p.v; sxx += x * x; sxy += x * p.v; }
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-9) return null;
    const w = (n * sxy - sx * sy) / d;
    return { w, c: (sy - w * sx) / n };
  }
  // Human units: cones per °C and cones at 20°C.
  const slopeTxt = (w) => (w * 3 * 100) / 40;

  // ---------- checkpoints ----------
  const MILESTONES = [0, 1, 2, 3, 5, 10, -1];
  const cps = new SupKit.Checkpoints(document.getElementById("cps"), {
    milestones: MILESTONES,
    label: (m) => (m === -1 ? "Finished" : m === 0 ? "Start" : `Step ${m}`),
    draw: drawThumb,
    onPick: (snap, m) => {
      state.viewing = snap;
      const vb = document.getElementById("viewing");
      vb.classList.toggle("show", !!snap);
      if (snap) {
        stopLearning();
        vb.innerHTML = `${ML.icon("clock")} Looking at ${m === -1 ? "the finish" : m === 0 ? "the start" : "step " + m} · back to live`;
        ML.say(`Back in time! At ${m === 0 ? "the start" : m === -1 ? "the end" : "step " + m} my oopsie was <b>${snap.score}</b>. ${m === 0 ? "See how bad my first guess was?" : "Compare the springs with now."}`);
      }
    },
  });
  document.getElementById("viewing").addEventListener("click", () => cps.unpick());
  function snapshot() { return { w: state.w, c: state.c, score: score(mse()), pts: state.pts.map((p) => ({ ...p })) }; }
  function maybeCapture(force) {
    if (MILESTONES.includes(state.steps)) cps.capture(state.steps, snapshot(), `oopsie ${score(mse())}`, force);
  }
  function drawThumb(c, w, h, snap) {
    const X = (u) => 6 + u * (w - 12), Y = (v) => h - 6 - v * (h - 12);
    c.fillStyle = ML.cssVar("--muted");
    for (const p of snap.pts) { c.beginPath(); c.arc(X(p.u), Y(p.v), 2.2, 0, Math.PI * 2); c.fill(); }
    c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip();
    c.strokeStyle = ML.cssVar("--bad"); c.lineWidth = 1;
    for (const p of snap.pts) { c.beginPath(); c.moveTo(X(p.u), Y(p.v)); c.lineTo(X(p.u), Y(snap.w * s(p.u) + snap.c)); c.stroke(); }
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 3;
    c.beginPath(); c.moveTo(X(0), Y(snap.w * s(0) + snap.c)); c.lineTo(X(1), Y(snap.w * s(1) + snap.c)); c.stroke();
    c.restore();
  }

  // ---------- data ----------
  function makeDays(noise, n = 12) {
    state.pts = [];
    for (let i = 0; i < n; i++) {
      const u = ML.rand(0.08, 0.95);
      state.pts.push({ u, v: ML.clamp(0.12 + 0.72 * u + ML.randn() * noise, 0.03, 0.97) });
    }
    dataChanged();
  }
  function restartTraining() {
    state.trail = [[state.w, state.c]];
    state.ghosts = [];
    state.steps = 0;
    state.history = state.pts.length ? [{ x: 0, y: score(mse()) }] : [];
    state.botScore = null;
    cps.reset();
    maybeCapture();
    setInside("idle");
  }
  function randomLine() {
    // Both handle heights inside the chart so the kid can always grab them.
    const vA = ML.rand(0.35, 0.9), vB = ML.rand(0.08, 0.5);
    state.w = (vB - vA) / (s(0.85) - s(0.15));
    state.c = vA - state.w * s(0.15);
    restartTraining();
  }
  function dataChanged() {
    state.landDirty = true;
    state.best = null;
    state.userBest = null;
    restartTraining();
  }

  // ---------- inside card ----------
  const insideEl = document.getElementById("inside");
  function setInside(kind, g) {
    if (kind === "idle") {
      insideEl.innerHTML = `<div class="sig"><span class="dot" style="background:var(--bad)"></span><span>Each red spring is one day's mistake: how far the dot is from the line.</span></div>
        <div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Press <b>One step</b> to see which springs win the tug-of-war.</span></div>`;
      return;
    }
    if (kind === "drag") {
      insideEl.innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>You are moving the line. The oopsie is now <b>${score(mse())}</b>${state.userBest !== null ? ` (your best: ${state.userBest})` : ""}.</span></div>`;
      return;
    }
    if (kind === "step") {
      const upDown = g.gc < 0 ? "UP" : "DOWN";
      const tilt = g.gw < 0 ? "steeper" : "flatter";
      const dSlope = -state.lr * g.gw, dH = -state.lr * g.gc;
      insideEl.innerHTML = `
        <div class="mono">Step ${state.steps}</div>
        <div class="sig"><span class="dot" style="background:var(--bad)"></span><span><b>${g.up}</b> dots pull the line up, <b>${g.down}</b> pull it down <span class="arrow">→</span> <span class="decision">move ${upDown}</span> by ${Math.abs(dH * 100).toFixed(1)} cones</span></div>
        <div class="sig"><span class="dot" style="background:var(--warn)"></span><span>Hot-day springs ${g.gw < 0 ? "pull up harder" : "pull down harder"} than cold-day ones <span class="arrow">→</span> <span class="decision">tilt ${tilt}</span> by ${Math.abs(slopeTxt(dSlope)).toFixed(2)} cones/°C</span></div>
        <div class="sig"><span class="dot" style="background:var(--good)"></span><span>Oopsie now <b>${score(mse())}</b>. Line: ${slopeTxt(state.w).toFixed(1)} more cones for every extra °C.</span></div>`;
    }
  }

  // ---------- gradient descent ----------
  let stepTimer = 0;
  function gdStep() {
    if (!state.pts.length) return "empty";
    const g = grad();
    state.ghosts.push([state.w, state.c]);
    if (state.ghosts.length > 4) state.ghosts.shift();
    state.w -= state.lr * g.gw;
    state.c -= state.lr * g.gc;
    state.steps++;
    state.trail.push([state.w, state.c]);
    if (state.trail.length > 300) state.trail.shift();
    const m = mse();
    if (!isFinite(m) || m > 4 || Math.abs(state.w) > 20 || Math.abs(state.c) > 20) return "diverged";
    state.history.push({ x: state.steps, y: score(m) });
    maybeCapture();
    setInside("step", g);
    if (Math.hypot(g.gw, g.gc) < 0.0008) return "done";
    return "ok";
  }
  const learnBtn = document.getElementById("learn");
  function startLearning() {
    if (state.pts.length < 2) { ML.say("I need at least <b>2 days</b> of dots to fit a line! Tap the chart to add some."); return; }
    cps.unpick();
    state.learning = true;
    learnBtn.innerHTML = `${ML.icon("pause")} Pause`;
    ML.say("Here I go! Each step, the springs tell me which way to nudge the line. Watch the oopsie chart go <b>down</b>, and the photos fill up below!");
  }
  function stopLearning() {
    state.learning = false;
    learnBtn.innerHTML = `${ML.icon("play")} Robot, learn!`;
  }
  function finish(result) {
    stopLearning();
    if (result === "diverged") {
      SupKit.overlay("Boing! Bounced away!");
      ML.say("Whoa! My steps were <b>way too big</b> — I kept jumping over the valley and flew off the map! Pick a smaller step size and press <b>Random line</b>.");
      state.w = ML.clamp(state.w, -2, 2); state.c = ML.clamp(state.c, -2, 2);
      return;
    }
    const m = mse();
    state.botScore = score(m);
    cps.capture(-1, snapshot(), `oopsie ${state.botScore}`, true);
    let msg = `Done in <b>${state.steps} steps</b>! My oopsie is <b>${state.botScore}</b>.`;
    if (state.userBest !== null) {
      if (state.userBest <= state.botScore + 1) { msg += ` You got <b>${state.userBest}</b> — you tied or beat me!`; ML.confetti(70); }
      else msg += ` You got ${state.userBest}. I win this time! Can you get closer?`;
    } else msg += " That's the bottom of the valley — no straight line can do better. Tap the photos below to see how I got here.";
    ML.say(msg);
    SupKit.overlay("Found the valley!");
  }

  // ---------- drawing: main chart ----------
  function spring(x, y1, y2, color) {
    const len = y2 - y1;
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y1);
    if (Math.abs(len) < 10) ctx.lineTo(x, y2);
    else {
      const n = Math.max(3, Math.min(12, Math.round(Math.abs(len) / 8)));
      for (let i = 1; i < n; i++) ctx.lineTo(x + (i % 2 ? 6 : -6), y1 + (len * i) / n);
      ctx.lineTo(x, y2);
    }
    ctx.stroke();
  }
  function cone(x, y) {
    const ink = ML.cssVar("--ink");
    ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.lineJoin = "round";
    ctx.fillStyle = "#e9b26b";
    ctx.beginPath(); ctx.moveTo(x - 7, y - 1); ctx.lineTo(x + 7, y - 1); ctx.lineTo(x, y + 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ML.cssVar("--diff");
    ctx.beginPath(); ctx.arc(x, y - 4, 7.5, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(x - 2.5, y - 7, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  function arrowV(x, y, dy, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + dy); ctx.stroke();
    const d = Math.sign(dy);
    ctx.beginPath(); ctx.moveTo(x, y + dy + d * 7); ctx.lineTo(x - 6, y + dy); ctx.lineTo(x + 6, y + dy); ctx.closePath(); ctx.fill();
  }

  function drawChart() {
    const ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted"), line = ML.cssVar("--line"), accent = ML.cssVar("--accent");
    const bad = ML.cssVar("--bad"), card = ML.cssVar("--card");
    ctx.clearRect(0, 0, W, H);

    ctx.lineWidth = 1; ctx.strokeStyle = line;
    ctx.fillStyle = muted; ctx.font = "700 12px Nunito, sans-serif"; ctx.textBaseline = "middle";
    for (let t = 0; t <= 40; t += 10) {
      const [x] = toPx(t / 40, 0);
      ctx.beginPath(); ctx.moveTo(x, PY0); ctx.lineTo(x, PY1); ctx.stroke();
      ctx.textAlign = "center"; ctx.fillText(`${t}°C`, x, PY1 + 14);
    }
    for (let c = 0; c <= 100; c += 25) {
      const [, y] = toPx(0, c / 100);
      ctx.beginPath(); ctx.moveTo(PX0, y); ctx.lineTo(PX1, y); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(c, PX0 - 8, y);
    }
    ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(PX0, PY0); ctx.lineTo(PX0, PY1); ctx.lineTo(PX1, PY1); ctx.stroke();
    ctx.fillStyle = ink; ctx.font = "800 15px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("how hot was it  →", (PX0 + PX1) / 2, PY1 + 36);
    ctx.save(); ctx.translate(16, (PY0 + PY1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("cones sold  →", 0, 0); ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(PX0, PY0, PX1 - PX0, PY1 - PY0); ctx.clip();

    for (const p of state.pts) {
      const [x, y] = toPx(p.u, p.v);
      const [, ly] = toPx(p.u, lineV(p.u));
      spring(x, y, ly, bad);
    }

    // ghosts of the last few lines (shows motion while learning)
    if (!state.viewing) {
      state.ghosts.forEach(([gw, gc], i) => {
        ctx.strokeStyle = accent; ctx.globalAlpha = 0.08 + i * 0.05; ctx.lineWidth = 4;
        const [a1, a2] = toPx(0, gw * s(0) + gc), [b1, b2] = toPx(1, gw * s(1) + gc);
        ctx.beginPath(); ctx.moveTo(a1, a2); ctx.lineTo(b1, b2); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    const [ax, ay] = toPx(0, lineV(0)), [bx, by] = toPx(1, lineV(1));
    ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.lineCap = "round";
    if (state.viewing) ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);

    if (state.hover !== null && !state.drag) {
      const u = state.hover, v = lineV(u);
      const [hx, hy] = toPx(u, v);
      ctx.setLineDash([5, 5]); ctx.strokeStyle = muted; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, PY1); ctx.lineTo(hx, hy); ctx.lineTo(PX0, hy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.fill();
      const label = `${Math.round(u * 40)}°C → about ${Math.max(0, Math.round(v * 100))} cones`;
      ctx.font = "800 14px Nunito, sans-serif";
      const tw = ctx.measureText(label).width + 20;
      const lx = ML.clamp(hx - tw / 2, PX0 + 4, PX1 - tw - 4), ly = ML.clamp(hy - 40, PY0 + 4, PY1 - 30);
      ctx.fillStyle = ink; rr(ctx, lx, ly, tw, 26, 13); ctx.fill();
      ctx.fillStyle = ML.cssVar("--bg"); ctx.textAlign = "left"; ctx.fillText(label, lx + 10, ly + 14);
    }

    for (const p of state.pts) { const [x, y] = toPx(p.u, p.v); cone(x, y); }

    // handles + direction arrows for the next step
    let g = null;
    if (state.pts.length > 1 && !state.viewing && (state.learning || state.steps > 0)) g = grad();
    for (const hu of [0.15, 0.85]) {
      const [x, y] = toPx(hu, lineV(hu));
      if (g) {
        const dv = -state.lr * (g.gw * s(hu) + g.gc);
        const dy = ML.clamp(-dv * (PY1 - PY0) * 4, -60, 60);
        if (Math.abs(dy) > 6) arrowV(x + 22, y, dy, ML.cssVar("--good"));
      }
      ctx.fillStyle = card; ctx.strokeStyle = accent; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (!state.pts.length) {
      ctx.fillStyle = muted; ctx.font = "800 18px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Tap to add some days", (PX0 + PX1) / 2, (PY0 + PY1) / 2 - 40);
    }
  }

  // ---------- drawing: loss landscape ----------
  const GW = 80, GH = 55;
  const heat = document.createElement("canvas");
  heat.width = GW; heat.height = GH;
  const hctx = heat.getContext("2d");
  const lToPx = (w, c) => [((w - WR[0]) / (WR[1] - WR[0])) * LW, LH - ((c - CR[0]) / (CR[1] - CR[0])) * LH];
  const lToData = (x, y) => [WR[0] + (x / LW) * (WR[1] - WR[0]), CR[0] + ((LH - y) / LH) * (CR[1] - CR[0])];
  function renderHeat() {
    const img = hctx.createImageData(GW, GH);
    const lo = hexRgb(ML.cssVar("--accent")), hi = hexRgb(ML.cssVar("--canvas-bg"));
    const vals = [];
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const [w, c] = lToData(((i + 0.5) / GW) * LW, ((j + 0.5) / GH) * LH);
      const v = Math.log(mse(w, c) + 1e-4);
      vals.push(v); mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    vals.forEach((v, k) => {
      let t = (v - mn) / (mx - mn || 1);
      const band = Math.floor(t * 9);
      t = band / 9 + (band % 2 ? 0.02 : 0);
      const o = k * 4;
      for (let ch = 0; ch < 3; ch++) img.data[o + ch] = lo[ch] + (hi[ch] - lo[ch]) * Math.pow(t, 0.8);
      img.data[o + 3] = 255;
    });
    hctx.putImageData(img, 0, 0);
  }
  function drawLand() {
    if (state.landDirty) { if (state.pts.length) renderHeat(); state.landDirty = false; }
    lctx.clearRect(0, 0, LW, LH);
    if (!state.pts.length) { lctx.fillStyle = ML.cssVar("--canvas-bg"); lctx.fillRect(0, 0, LW, LH); }
    else { lctx.imageSmoothingEnabled = true; lctx.drawImage(heat, 0, 0, LW, LH); }
    const ink = ML.cssVar("--ink");
    lctx.fillStyle = ink; lctx.font = "800 11px Nunito, sans-serif"; lctx.textAlign = "right"; lctx.textBaseline = "alphabetic";
    lctx.fillText("steeper line →", LW - 6, LH - 6);
    lctx.save(); lctx.translate(14, LH - 6); lctx.rotate(-Math.PI / 2); lctx.textAlign = "left"; lctx.fillText("higher line →", 0, 0); lctx.restore();
    const o = ols();
    if (o) {
      const [fx, fy] = lToPx(o.w, o.c);
      lctx.strokeStyle = ink; lctx.lineWidth = 2;
      lctx.beginPath(); lctx.moveTo(fx, fy); lctx.lineTo(fx, fy - 18); lctx.stroke();
      lctx.fillStyle = ML.cssVar("--bad");
      lctx.beginPath(); lctx.moveTo(fx, fy - 18); lctx.lineTo(fx + 12, fy - 13); lctx.lineTo(fx, fy - 8); lctx.closePath(); lctx.fill();
    }
    if (state.trail.length > 1) {
      lctx.strokeStyle = ink; lctx.lineWidth = 2; lctx.beginPath();
      state.trail.forEach(([w, c], i) => { const [x, y] = lToPx(w, c); i ? lctx.lineTo(x, y) : lctx.moveTo(x, y); });
      lctx.stroke();
      lctx.fillStyle = ink;
      state.trail.forEach(([w, c]) => { const [x, y] = lToPx(w, c); lctx.beginPath(); lctx.arc(x, y, 2, 0, Math.PI * 2); lctx.fill(); });
    }
    const [bx, by] = lToPx(shownW(), shownC());
    const x = ML.clamp(bx, 9, LW - 9), y = ML.clamp(by, 9, LH - 9);
    lctx.fillStyle = ML.cssVar("--card"); lctx.strokeStyle = ink; lctx.lineWidth = 3;
    lctx.beginPath(); lctx.arc(x, y, 8, 0, Math.PI * 2); lctx.fill(); lctx.stroke();
    lctx.fillStyle = ML.cssVar("--warn"); lctx.beginPath(); lctx.arc(x, y, 4, 0, Math.PI * 2); lctx.fill();
    lctx.strokeStyle = ML.cssVar("--line"); lctx.lineWidth = 2; lctx.strokeRect(1, 1, LW - 2, LH - 2);
  }

  // ---------- panel ----------
  function updatePanel() {
    const m = mse(shownW(), shownC());
    const sc = score(m);
    if (state.pts.length && !state.viewing && (state.best === null || sc < state.best)) state.best = sc;
    document.getElementById("mse").textContent = state.pts.length ? sc.toLocaleString() : "–";
    const fill = (v) => Math.min(100, Math.sqrt(v / 1000) * 100);
    document.getElementById("meter-fill").style.width = state.pts.length ? fill(sc) + "%" : "0";
    document.getElementById("best-mark").style.left = state.best !== null ? `calc(${fill(state.best)}% - 2px)` : "-10px";
    document.getElementById("steps-lbl").textContent = `${state.steps} step${state.steps === 1 ? "" : "s"}`;
    document.getElementById("you").textContent = state.userBest ?? "–";
    document.getElementById("bot").textContent = state.botScore ?? "–";
    SupKit.lineChart(cctx, CW, CH, [{ data: state.history, color: ML.cssVar("--accent") }], {
      xMax: Math.max(10, state.steps), yFmt: (v) => Math.round(v), xLabel: "steps →",
    });
  }

  // ---------- interactions ----------
  function hitHandle(x, y) {
    for (const hu of [0.15, 0.85]) {
      const [hx, hy] = toPx(hu, lineV(hu));
      if (Math.hypot(hx - x, hy - y) < 22) return hu;
    }
    return null;
  }
  function hitPoint(x, y) {
    let best = -1, bd = 18;
    state.pts.forEach((p, i) => { const [px, py] = toPx(p.u, p.v); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function userMoved() {
    const sc = score(mse());
    const before = state.userBest;
    if (state.userBest === null || sc < state.userBest) state.userBest = sc;
    return { sc, improved: before === null || sc < before };
  }

  let lastUserSay = 0;
  cv.addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint(cv, e, W, H);
    cv.setPointerCapture(e.pointerId);
    cps.unpick();
    const h = hitHandle(p.x, p.y);
    if (h !== null) {
      if (state.learning) stopLearning();
      state.drag = { type: "handle", hu: h, other: h === 0.15 ? 0.85 : 0.15 };
      return;
    }
    const i = hitPoint(p.x, p.y);
    if (i >= 0) { state.drag = { type: "point", i, x0: p.x, y0: p.y, moved: false }; return; }
    const [u, v] = toData(p.x, p.y);
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    state.pts.push({ u, v });
    dataChanged();
    ML.say(`New day: <b>${Math.round(u * 40)}°C</b> and <b>${Math.round(v * 100)} cones</b>. See its red spring pulling on the line?`);
  });
  cv.addEventListener("pointermove", (e) => {
    const p = ML.canvasPoint(cv, e, W, H);
    const [u, v] = toData(p.x, p.y);
    state.hover = u >= 0 && u <= 1 && v >= -0.1 && v <= 1.1 && e.pointerType === "mouse" ? u : null;
    const d = state.drag;
    if (!d) return;
    if (d.type === "handle") {
      const vo = lineV(d.other, state.w, state.c);
      const vh = ML.clamp(v, -0.2, 1.2);
      const so = s(d.other), sh = s(d.hu);
      state.w = (vh - vo) / (sh - so);
      state.c = vo - state.w * so;
      state.dw = state.w; state.dc = state.c;
      state.trail = [[state.w, state.c]]; state.ghosts = [];
      const { sc, improved } = userMoved();
      setInside("drag");
      const now = performance.now();
      if (now - lastUserSay > 700) {
        lastUserSay = now;
        ML.say(improved ? `Getting better! Your oopsie: <b>${sc}</b>.` : `Oopsie is <b>${sc}</b>. Your best is ${state.userBest}. Keep wiggling!`);
      }
    } else if (d.type === "point") {
      if (Math.hypot(p.x - d.x0, p.y - d.y0) > 5) d.moved = true;
      if (d.moved) { state.pts[d.i] = { u: ML.clamp(u, 0, 1), v: ML.clamp(v, 0, 1) }; state.landDirty = true; }
    }
  });
  function endDrag() {
    const d = state.drag;
    state.drag = null;
    if (!d) return;
    if (d.type === "handle") restartTraining();
    if (d.type === "point") {
      if (!d.moved) { state.pts.splice(d.i, 1); dataChanged(); ML.say("Poof! That day is gone."); }
      else { dataChanged(); ML.say("You moved a day! The oopsie hills changed shape — press <b>Robot, learn!</b> and I'll find the new valley."); }
    }
  }
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener("pointerleave", () => { state.hover = null; });

  land.addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint(land, e, LW, LH);
    const [w, c] = lToData(p.x, p.y);
    stopLearning(); cps.unpick();
    state.w = w; state.c = c;
    const { sc } = userMoved();
    restartTraining();
    ML.say(`Jump! That spot on the map is a line with oopsie <b>${sc}</b>. ${sc < 60 ? "That's deep in the valley!" : "Try a darker spot!"}`);
  });

  learnBtn.addEventListener("click", () => (state.learning ? stopLearning() : startLearning()));
  document.getElementById("step").addEventListener("click", () => {
    stopLearning(); cps.unpick();
    if (state.pts.length < 2) return;
    const before = score(mse());
    const r = gdStep();
    const after = score(mse());
    if (r === "diverged") finish(r);
    else ML.say(`One step: oopsie went from <b>${before}</b> to <b>${after}</b>. ${after < before ? "Downhill! The green arrows show where the next step will push." : "Uh oh, uphill — that step was too big!"}`);
  });
  document.getElementById("rand").addEventListener("click", () => {
    stopLearning(); cps.unpick(); randomLine();
    ML.say("A brand-new random line. Pretty bad, right? Fix it yourself, or press <b>Robot, learn!</b> to watch me do it.");
  });

  const fmtLr = (v) => (1.15 * (v / 100) ** 2);
  const lrInput = ML.bindRange("#lr", (v) => {
    const lr = fmtLr(v);
    return lr < 0.1 ? "tiny " + lr.toFixed(3) : lr > 0.8 ? "huge " + lr.toFixed(2) : lr.toFixed(2);
  }, (v) => { state.lr = Math.max(0.002, fmtLr(v)); });
  document.querySelectorAll("[data-lr]").forEach((b) => b.addEventListener("click", () => {
    lrInput.value = b.dataset.lr;
    lrInput.dispatchEvent(new Event("input"));
    const t = { 12: "Tiny steps: safe, but sooo slow.", 45: "Just right: quick and steady.", 88: "Giant steps! Watch me bounce from side to side…" };
    stopLearning(); cps.unpick(); randomLine();
    ML.say(t[b.dataset.lr] + " Press <b>Robot, learn!</b> to try it.");
  }));

  document.getElementById("p-sunny").addEventListener("click", () => { stopLearning(); cps.unpick(); makeDays(0.05); randomLine(); ML.say("A fresh summer of ice-cream days! Can you fit them better than me?"); });
  document.getElementById("p-messy").addEventListener("click", () => { stopLearning(); cps.unpick(); makeDays(0.16); randomLine(); ML.say("Messy days — maybe it rained sometimes! No line can touch every dot, but one line is still the <b>best</b>."); });
  document.getElementById("p-weird").addEventListener("click", () => {
    stopLearning(); cps.unpick();
    state.pts.push({ u: ML.rand(0.08, 0.25), v: ML.rand(0.85, 0.97) });
    dataChanged();
    ML.say("A freezing day where everyone bought ice cream?! That weird dot has a <b>huge</b> spring. Press learn and see how hard it pulls the line.");
  });

  // ---------- loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = now - last; last = now;
    if (state.learning) {
      stepTimer += dt;
      // Slow at first so every step can be seen, then speed up.
      const interval = state.steps < 6 ? 550 : state.steps < 15 ? 220 : state.steps < 40 ? 80 : 25;
      while (stepTimer > interval && state.learning) {
        stepTimer -= interval;
        const r = gdStep();
        if (r !== "ok") finish(r);
        else if (state.steps > 600) finish("done");
      }
    } else stepTimer = 0;
    const k = state.drag ? 1 : 0.22;
    state.dw += (state.w - state.dw) * k;
    state.dc += (state.c - state.dc) * k;
    drawChart();
    drawLand();
    updatePanel();
    requestAnimationFrame(loop);
  }
  document.addEventListener("themechange", () => { state.landDirty = true; cps.redraw(); });

  makeDays(0.06);
  randomLine();
  state.dw = state.w; state.dc = state.c;
  requestAnimationFrame(loop);
})();
