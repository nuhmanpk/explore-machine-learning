// Next-Frame Dreamer — UI: live training loop, real-vs-dream playback, checkpoints.
(function () {
  const V = window.VideoCore;
  const { N, P } = V;

  // ---------- canvases ----------
  const VS = 240;
  const real = ML.setupCanvas(document.getElementById("real"), VS, VS);
  const drm = ML.setupCanvas(document.getElementById("dream"), VS, VS);
  const LW = 640, LH = 110;
  const lossC = ML.setupCanvas(document.getElementById("loss"), LW, LH);
  const mini = ["in-a", "in-b", "in-p", "in-c", "in-e"].map((id) => ML.setupCanvas(document.getElementById(id), 72, 72));

  // Off-screen N×N canvas used to blow frames up with crisp pixels.
  const off = document.createElement("canvas");
  off.width = off.height = N;
  const offCtx = off.getContext("2d");
  const img = offCtx.createImageData(N, N);

  function rgb(c) {
    c = c.trim();
    if (c.startsWith("#")) {
      const h = c.length === 4 ? c.slice(1).split("").map((x) => x + x).join("") : c.slice(1);
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const m = c.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  }
  let COL = {};
  function readColors() {
    COL = { bg: rgb(ML.cssVar("--canvas-bg")), ball: rgb(ML.cssVar("--accent")), bad: rgb(ML.cssVar("--bad")),
      line: ML.cssVar("--line"), ink: ML.cssVar("--ink"), muted: ML.cssVar("--muted"), accent: ML.cssVar("--accent"), good: ML.cssVar("--good") };
  }
  readColors();
  document.addEventListener("themechange", readColors);

  function paintFrame(ctx, size, frame, color = COL.ball, ghost = null) {
    const d = img.data;
    for (let i = 0; i < P; i++) {
      let v = Math.min(1, Math.max(0, frame[i]));
      let c = color;
      if (ghost && ghost[i] > 0.3 && v < 0.3) { v = 0.18; c = [128, 128, 150]; }
      d[i * 4] = COL.bg[0] + (c[0] - COL.bg[0]) * v;
      d[i * 4 + 1] = COL.bg[1] + (c[1] - COL.bg[1]) * v;
      d[i * 4 + 2] = COL.bg[2] + (c[2] - COL.bg[2]) * v;
      d[i * 4 + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, size, size);
  }

  function gridLines(ctx, size) {
    ctx.strokeStyle = COL.line;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    const s = size / N;
    for (let i = 1; i < N; i++) {
      ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- state ----------
  const S = {
    net: new V.FrameNet(96),
    training: false,
    speed: 1,
    budget: 0,
    world: { gravity: false, twoBalls: false },
    lossHist: [],
    ema: null,
    one: 0, // one-step IoU on a test set
    dreamScore: 0,
    viewNet: null, // a checkpoint brain being shown, or null for live
    viewLabel: "",
    userStart: null, // {x,y,vx,vy}
    ep: null, // current playback episode
    ckpts: [],
    nextCkpt: 0,
    said: {},
  };
  const CKPT_AT = [0, 60, 200, 600, 1500, 3500, 8000];

  // Fixed test clips: same every time, so checkpoints and scores are comparable.
  let testClips = [];
  function makeTests() {
    const rnd = ML.seeded(42);
    testClips = [];
    for (let k = 0; k < 12; k++) {
      const w = V.makeWorld(S.world, rnd);
      const frames = [V.render(w)];
      for (let t = 0; t < 16; t++) { V.stepWorld(w); frames.push(V.render(w)); }
      testClips.push(frames);
    }
  }
  makeTests();

  function evaluate(net) {
    let one = 0, dr = 0;
    for (const f of testClips) {
      const out = new Float32Array(P);
      net.forward(f[0], f[1], out);
      one += V.match(out, f[2]);
      const d = V.dream(net, f[0], f[1], 14);
      let m = 0;
      for (let t = 2; t < 16; t++) m += V.match(d[t], f[t]);
      dr += m / 14;
    }
    return { one: one / testClips.length, dream: dr / testClips.length };
  }

  // ---------- episodes (what's shown in the two big views) ----------
  const EP_LEN = 48;
  function newEpisode() {
    const w = V.makeWorld(S.world);
    if (S.userStart) Object.assign(w.balls[0], S.userStart);
    const frames = [V.render(w)];
    for (let t = 0; t < EP_LEN + 1; t++) { V.stepWorld(w); frames.push(V.render(w)); }
    const net = S.viewNet || S.net;
    const dreamFrames = V.dream(net, frames[0], frames[1], EP_LEN - 1);
    S.ep = { real: frames, dream: dreamFrames, t: 0, acc: 0, net };
  }

  // ---------- checkpoints ----------
  function ckptThumb(net) {
    // Trail of a dream from the first test clip: dream in colour, real path as grey dots.
    const f = testClips[0];
    const d = V.dream(net, f[0], f[1], 14);
    const trail = new Float32Array(P), ghost = new Float32Array(P);
    for (let t = 0; t < 16; t++) {
      const fade = 0.35 + 0.65 * (t / 15);
      for (let i = 0; i < P; i++) {
        trail[i] = Math.max(trail[i], Math.min(1, d[t][i]) * fade);
        ghost[i] = Math.max(ghost[i], f[t][i]);
      }
    }
    return { trail, ghost };
  }

  function addCheckpoint() {
    const net = S.net;
    const snap = net.snapshot();
    const score = evaluate(net);
    const thumb = ckptThumb(net);
    const label =
      score.one < 0.25 ? "fuzz" : score.one < 0.6 ? "blurry blob" : score.dream < 0.3 ? "moves, then melts" : "bouncing ball!";
    const c = { step: net.steps, snap, score, thumb, label };
    S.ckpts.push(c);
    const host = document.getElementById("ckpts");
    const b = document.createElement("button");
    b.className = "ckpt";
    b.innerHTML = `<canvas></canvas><b>Round ${c.step}</b>${label}<br><span class="muted">${Math.round(score.one * 100)}% right</span>`;
    host.appendChild(b);
    host.scrollLeft = host.scrollWidth;
    const cv = ML.setupCanvas(b.querySelector("canvas"), 96, 96);
    paintFrame(cv.ctx, 96, thumb.trail, COL.ball, thumb.ghost);
    b.addEventListener("click", () => viewCheckpoint(c, b));
  }

  function viewCheckpoint(c, btn) {
    document.querySelectorAll(".ckpt").forEach((x) => x.classList.toggle("on", x === btn));
    S.viewNet = V.FrameNet.fromSnapshot(c.snap);
    S.viewLabel = `round ${c.step} brain`;
    document.getElementById("dream-tag").textContent = S.viewLabel;
    document.getElementById("back-live").classList.add("show");
    newEpisode();
    const lines = {
      fuzz: `This is my brain at round ${c.step}. I knew <b>nothing</b>, so my dream is just fuzz.`,
      "blurry blob": `Round ${c.step}: I'd learned the ball is <b>somewhere around here</b>, but not exactly where. Blurry!`,
      "moves, then melts": `Round ${c.step}: my ball moves the right way… then melts as my mistakes pile up.`,
      "bouncing ball!": `Round ${c.step}: now I can dream a ball that <b>bounces</b>! I learned it just by watching.`,
    };
    ML.say(lines[c.label]);
  }
  document.getElementById("back-live").addEventListener("click", () => {
    S.viewNet = null;
    document.querySelectorAll(".ckpt").forEach((x) => x.classList.remove("on"));
    document.getElementById("dream-tag").textContent = "live brain";
    document.getElementById("back-live").classList.remove("show");
    newEpisode();
    ML.say(`Back to my newest brain.`);
  });

  // ---------- training loop ----------
  let evalTimer = 0;
  function trainTick() {
    if (!S.training) return;
    const t0 = performance.now();
    S.budget = Math.min(S.budget + S.speed, S.speed + 1);
    for (; S.budget >= 1; S.budget--) {
      const l = S.net.trainBatch(S.world, 16);
      S.ema = S.ema == null ? l : S.ema * 0.97 + l * 0.03;
      if (S.net.steps % 4 === 0) S.lossHist.push(S.ema);
      if (S.nextCkpt < CKPT_AT.length && S.net.steps >= CKPT_AT[S.nextCkpt]) { addCheckpoint(); S.nextCkpt++; }
      if (performance.now() - t0 > 10) break; // leave time to draw: smooth beats fast
    }
    if (S.lossHist.length > 600) S.lossHist = S.lossHist.filter((_, i) => i % 2 === 0);
    if (++evalTimer % 20 === 0) {
      const e = evaluate(S.net);
      S.one = e.one;
      S.dreamScore = e.dream;
      narrate();
    }
  }

  function narrate() {
    const say = (key, html) => { if (!S.said[key]) { S.said[key] = true; ML.say(html); } };
    const st = S.net.steps;
    if (S.one > 0.8 && S.dreamScore > 0.3) say("ball", `Look at my dream! The ball <b>bounces off the walls</b>. Nobody told me about walls. I worked it out by watching!`);
    else if (S.one > 0.6) say("moves", `My next-picture guesses are getting good (${Math.round(S.one * 100)}% right)! My dream ball moves, but it still melts after a while.`);
    else if (S.one > 0.25) say("blob", `I'm starting to see a <b>blob</b> where the ball should be. Still blurry, keep going!`);
    else if (st > 20) say("start", `I'm watching videos and guessing the next picture. Lots of mistakes so far. That's normal!`);
  }

  // ---------- drawing ----------
  let lastFrameT = 0;
  function drawViews(ts) {
    if (!S.ep) newEpisode();
    if (ts - lastFrameT > 85) {
      lastFrameT = ts;
      S.ep.t++;
      if (S.ep.t >= EP_LEN) newEpisode();
      if (S.ep.t % 6 === 0) updateInside();
    }
    const ep = S.ep, t = ep.t;
    paintFrame(real.ctx, VS, ep.real[t]);
    gridLines(real.ctx, VS);
    paintFrame(drm.ctx, VS, ep.dream[t]);
    gridLines(drm.ctx, VS);
    // frame counter
    for (const [c, label] of [[real.ctx, "real"], [drm.ctx, t < 2 ? "copied start" : "dreamed"]]) {
      c.fillStyle = COL.muted; c.font = "800 12px Nunito, sans-serif"; c.textAlign = "left";
      c.fillText(`frame ${t + 1} · ${label}`, 8, VS - 8);
    }
    if (drag) {
      const ctx = real.ctx;
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(drag.x0, drag.y0, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(drag.x0, drag.y0); ctx.lineTo(drag.x1, drag.y1); ctx.stroke();
      const a = Math.atan2(drag.y1 - drag.y0, drag.x1 - drag.x0);
      ctx.beginPath();
      ctx.moveTo(drag.x1, drag.y1); ctx.lineTo(drag.x1 - 12 * Math.cos(a - 0.5), drag.y1 - 12 * Math.sin(a - 0.5));
      ctx.moveTo(drag.x1, drag.y1); ctx.lineTo(drag.x1 - 12 * Math.cos(a + 0.5), drag.y1 - 12 * Math.sin(a + 0.5));
      ctx.stroke();
    }
  }

  function drawLoss() {
    const ctx = lossC.ctx;
    ctx.clearRect(0, 0, LW, LH);
    const h = S.lossHist;
    if (h.length < 2) {
      ctx.fillStyle = COL.muted; ctx.font = "700 14px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("The line appears once Robo starts learning", LW / 2, LH / 2 + 5);
      return;
    }
    // log scale: the first few huge mistakes would otherwise flatten the rest
    const L = h.map((v) => Math.log10(v));
    const max = Math.max(...L), min = Math.min(...L) - 0.05;
    ctx.strokeStyle = COL.accent; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath();
    h.forEach((v, i) => {
      const x = 8 + (i / (h.length - 1)) * (LW - 16);
      const y = 10 + (1 - (L[i] - min) / (max - min || 1)) * (LH - 24);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = COL.muted; ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "right";
    ctx.fillText(`round ${S.net.steps}`, LW - 8, LH - 4);
    ctx.textAlign = "left";
    ctx.fillText("oopsie", 8, 12);
  }

  // ---------- inside card ----------
  function centre(f) {
    let sx = 0, sy = 0, s = 0;
    for (let i = 0; i < P; i++) if (f[i] > 0.3) { sx += (i % N) * f[i]; sy += Math.floor(i / N) * f[i]; s += f[i]; }
    return s ? { x: sx / s, y: sy / s } : null;
  }
  function dirWords(dx, dy) {
    const h = Math.abs(dx) > 0.25 ? (dx > 0 ? "right" : "left") : "";
    const v = Math.abs(dy) > 0.25 ? (dy > 0 ? "down" : "up") : "";
    return [v, h].filter(Boolean).join(" and ") || "barely";
  }
  function updateInside() {
    const ep = S.ep;
    const t = Math.min(Math.max(ep.t, 1), ep.real.length - 2);
    const a = ep.real[t - 1], b = ep.real[t], c = ep.real[t + 1];
    const net = S.viewNet || S.net;
    const p = new Float32Array(P);
    net.forward(a, b, p);
    const err = new Float32Array(P);
    for (let i = 0; i < P; i++) err[i] = Math.min(1, Math.abs(p[i] - c[i]) * 1.5);
    [a, b, p, c].forEach((f, i) => paintFrame(mini[i].ctx, 72, f));
    paintFrame(mini[4].ctx, 72, err, COL.bad);
    const ca = centre(a), cb = centre(b), cp = centre(p);
    const m = Math.round(V.match(p, c) * 100);
    let txt;
    if (!ca || !cb) txt = "Two balls hiding? I'll still guess every dot.";
    else if (!cp) txt = `The ball moved ${dirWords(cb.x - ca.x, cb.y - ca.y)}… but I'm not sure enough to paint it anywhere yet.`;
    else {
      txt = `Picture 1 → 2: the ball moved <b>${dirWords(cb.x - ca.x, cb.y - ca.y)}</b>. So I painted it moving <b>${dirWords(cp.x - cb.x, cp.y - cb.y)}</b> next. My guess overlaps the real one by <b>${m}%</b>.`;
      if (m < 40) txt += " The red dots show where I'm wrong.";
    }
    document.getElementById("inside-text").innerHTML = txt;
  }

  // ---------- stats ----------
  function updateStats() {
    document.getElementById("st-steps").textContent = S.net.steps.toLocaleString();
    document.getElementById("st-seen").textContent = S.net.seen.toLocaleString();
    document.getElementById("st-one").innerHTML = `${Math.round(S.one * 100)}<small>%</small>`;
    document.getElementById("st-dream").innerHTML = `${Math.round(S.dreamScore * 100)}<small>%</small>`;
  }

  // ---------- drag to throw the ball ----------
  let drag = null;
  const realCv = document.getElementById("real");
  realCv.addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint(realCv, e, VS, VS);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    realCv.setPointerCapture(e.pointerId);
  });
  realCv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = ML.canvasPoint(realCv, e, VS, VS);
    drag.x1 = p.x; drag.y1 = p.y;
  });
  realCv.addEventListener("pointerup", () => {
    if (!drag) return;
    const s = VS / N;
    let vx = (drag.x1 - drag.x0) / s / 6, vy = (drag.y1 - drag.y0) / s / 6;
    const sp = Math.hypot(vx, vy);
    if (sp < 0.3) { const a = Math.random() * Math.PI * 2; vx = Math.cos(a); vy = Math.sin(a); }
    else if (sp > 1.8) { vx *= 1.8 / sp; vy *= 1.8 / sp; }
    const r = 2.6;
    S.userStart = { x: ML.clamp(drag.x0 / s, r, N - r), y: ML.clamp(drag.y0 / s, r, N - r), vx, vy };
    drag = null;
    newEpisode();
    ML.say(`Your throw! Let's see if my dream follows the real ball.`);
  });

  // ---------- controls ----------
  const trainBtn = document.getElementById("train");
  function syncTrain() {
    trainBtn.innerHTML = S.training ? `${ML.icon("pause")} Pause learning` : `${ML.icon("play")} ${S.net.steps ? "Keep learning" : "Start learning"}`;
  }
  trainBtn.addEventListener("click", () => {
    S.training = !S.training;
    syncTrain();
    if (S.training && S.net.steps === 0) ML.say(`Here I go! Each <b>practice round</b> I watch 16 tiny videos, guess the next picture, and fix my brain a little.`);
  });
  document.getElementById("again").addEventListener("click", () => { newEpisode(); });
  document.getElementById("forget").addEventListener("click", () => {
    S.net = new V.FrameNet(96);
    S.lossHist = [];
    S.ema = null;
    S.ckpts = [];
    S.nextCkpt = 0;
    S.said = {};
    S.viewNet = null;
    document.getElementById("ckpts").innerHTML = "";
    document.getElementById("dream-tag").textContent = "live brain";
    document.getElementById("back-live").classList.remove("show");
    const e = evaluate(S.net); S.one = e.one; S.dreamScore = e.dream;
    addCheckpoint(); S.nextCkpt = 1;
    newEpisode();
    syncTrain();
    ML.say(`Brain wiped! I'm back to dreaming fuzz.`);
  });
  document.querySelectorAll("#speed button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
      S.speed = +b.dataset.v;
    })
  );
  function worldChanged(msg) {
    makeTests();
    S.userStart = null;
    S.said = {};
    const e = evaluate(S.net); S.one = e.one; S.dreamScore = e.dream;
    newEpisode();
    ML.say(msg);
  }
  const gBtn = document.getElementById("gravity"), tBtn = document.getElementById("two");
  gBtn.addEventListener("click", () => {
    S.world.gravity = !S.world.gravity;
    gBtn.classList.toggle("on", S.world.gravity);
    worldChanged(S.world.gravity
      ? `Gravity is on! Now balls fall and bounce. My old brain doesn't know that. Watch me get it wrong, then <b>re-learn</b>.`
      : `Gravity off. Balls fly straight again.`);
  });
  tBtn.addEventListener("click", () => {
    S.world.twoBalls = !S.world.twoBalls;
    tBtn.classList.toggle("on", S.world.twoBalls);
    worldChanged(S.world.twoBalls ? `Two balls! Twice as much to keep track of. This is harder for me.` : `Back to one ball.`);
  });
  document.getElementById("randstart").addEventListener("click", () => { S.userStart = null; newEpisode(); });

  // ---------- go ----------
  {
    const e = evaluate(S.net); S.one = e.one; S.dreamScore = e.dream;
    addCheckpoint(); S.nextCkpt = 1;
  }
  newEpisode();
  updateInside();
  syncTrain();
  function frame(ts) {
    trainTick();
    drawViews(ts);
    drawLoss();
    updateStats();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test hook
  window.__video = S;
})();
