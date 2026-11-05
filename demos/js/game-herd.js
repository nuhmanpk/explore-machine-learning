// Sheepdog Round-Up — page: you steer the dog first, then a population of dog brains evolves in the background
// (chunked per animation frame) while the field shows the latest champion herding a fresh flock.
(function () {
  const { nextGeneration } = window.GameNet;
  const C = window.HerdCore;
  const { W, H, PEN, GATE_Y, FLEE_R, STEPS } = C;
  const POP = 30;
  const $ = (s) => document.querySelector(s);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fieldCv = $("#field");
  const ctx = ML.setupCanvas(fieldCv, W, H).ctx;
  const chartCv = ML.setupCanvas($("#chart"), 640, 180);
  const netCv = ML.setupCanvas($("#net"), 300, 130);

  const LABELS = { wind: "Windy day", stubborn: "Stubborn sheep", big: "Bigger flock", narrow: "Narrow gate" };
  const TELLS = {
    wind: "A steady breeze now blows the sheep away from the pen. Pushing gently is not enough any more.",
    stubborn: "Two sheep don't care much about friends. They wander off to their favourite grass.",
    big: "Eighteen sheep instead of ten. A big flock spreads out more and is harder to steer.",
    narrow: "The gate is half as wide. The flock must be lined up just right to squeeze through.",
  };
  const TRY = {
    wind: "Watch the dogs learn to stay <b>closer</b> behind the flock so the wind can't undo their work. Then try steering in the wind yourself!",
    stubborn: "Look for dogs that leave the flock to <b>fetch</b> a wanderer, then come back. Switch on <b>What the dog sees</b>: the orange ring marks the straggler.",
    big: "Watch the flock spread out. Good dogs now swing side to side behind it, like a real sheepdog. Tap an old checkpoint to see how a younger dog copes.",
    narrow: "Watch the sheep queue at the gate. Dogs that push too hard scatter them. Try it yourself: slow and steady wins!",
  };

  const state = {
    mode: "you", playing: false, speed: 3, mutation: 0.3, tries: 2,
    rules: { ...C.DEFAULT_RULES },
    brains: Array.from({ length: POP }, () => C.newBrain()),
    gen: 1, genTries: 2, evalI: 0, evalK: 0, evalW: null,
    fit: [], sc: [], pen: [],
    champ: null, champGen: 0, champScore: 0,
    scores: [], pens: [], markers: [], pending: [], onSince: {},
    youBest: null, youTries: 0, firstPen: false, celebrated: false, beatYou: false,
    live: null, showSenses: true, showScare: true,
    done: { wind: false, stubborn: false, big: false, narrow: false },
    ckTried: false, lastAct: performance.now(), seen: [], chartDirty: true,
  };
  const resetEval = () => { state.evalI = 0; state.evalK = 0; state.evalW = null; state.fit = new Array(POP).fill(0); state.sc = new Array(POP).fill(0); state.pen = new Array(POP).fill(0); state.genTries = state.tries; };
  resetEval();
  const seedFor = (gen, k) => 1000 + gen * 10 + k;
  const randSeed = () => Math.floor(Math.random() * 1e9);
  const act = () => { state.lastAct = performance.now(); };

  // ---------- the live field ----------
  function newYouWorld() {
    state.live = { kind: "you", world: new C.World(null, state.rules, randSeed()), started: false, ended: false };
    hideOverlay();
  }
  function newRoboWorld() {
    const brain = state.champ ? state.champ.clone() : state.brains[0].clone();
    state.live = { kind: "robo", world: new C.World(brain, state.rules, randSeed()), gen: state.champ ? state.champGen : 0, endAt: 0 };
  }
  function startReplay(ck) {
    state.live = { kind: "replay", world: new C.World(ck.brain.clone(), state.rules, randSeed()), ck, endAt: 0 };
  }

  // ---------- evolution (runs a slice of work every frame so the page never freezes) ----------
  function evalSome(budget) {
    const t0 = performance.now();
    while (performance.now() - t0 < budget) {
      if (!state.evalW) state.evalW = new C.World(state.brains[state.evalI], state.rules, seedFor(state.gen, state.evalK));
      const w = state.evalW;
      for (let i = 0; i < 60 && !w.done; i++) w.step();
      if (!w.done) continue;
      const i = state.evalI, n = state.genTries;
      state.fit[i] += w.fitness() / n; state.sc[i] += w.score() / n; state.pen[i] += (100 * w.penned) / w.n / n;
      state.evalW = null;
      if (++state.evalK >= n) { state.evalK = 0; if (++state.evalI >= POP) { finishGen(); return; } }
    }
  }
  function finishGen() {
    const order = state.fit.map((_, i) => i).sort((a, b) => state.fit[b] - state.fit[a]);
    const top = order.slice(0, POP / 2);
    const avg = (a) => top.reduce((s, i) => s + a[i], 0) / top.length;
    const score = avg(state.sc), pen = avg(state.pen);
    state.scores.push(Math.round(score * 10) / 10); state.pens.push(Math.round(pen));
    state.champ = state.brains[order[0]].clone(); state.champGen = state.gen; state.champScore = state.sc[order[0]];
    if (state.gen <= 5 || state.gen % 5 === 0) addCheckpoint(state.champ.clone(), state.gen);
    narrateGen(score, pen);
    checkAdapt();
    state.chartDirty = true;
    state.brains = nextGeneration(state.brains, state.fit, { mutation: state.mutation });
    state.gen++;
    resetEval();
  }
  const avgLast = (a, k = 3) => { const s = a.slice(-k); return s.length ? s.reduce((x, v) => x + v, 0) / s.length : 0; };

  function narrateGen(score, pen) {
    const n = state.scores.length, now = avgLast(state.scores);
    if (!state.firstPen && pen > 0) { state.firstPen = true; ML.toast(`Generation ${n}: a robot dog penned its first sheep!`); }
    if (!state.celebrated && n >= 3 && now >= 60) {
      state.celebrated = true;
      ML.confetti();
      ML.xray.offer("The dogs can herd! X-ray the champion’s brain");
      ML.say(`They've got it! After <b>${n}</b> generations the best dogs score <b>${Math.round(now)}</b> and pen about <b>${Math.round(avgLast(state.pens))}%</b> of the sheep. Nobody told them "go behind the flock". Now throw a <b>challenge</b> at them!`);
      return;
    }
    if (state.youBest !== null && !state.beatYou && state.champScore > state.youBest) {
      state.beatYou = true;
      ML.say(`Generation ${n}'s champion scored <b>${Math.round(state.champScore)}</b>, beating your best of <b>${Math.round(state.youBest)}</b>! Think you can win it back? Pick <b>You steer</b>.`);
      return;
    }
    if (state.pending.length) return; // checkAdapt does the talking
    if (n === 1) ML.say(`Generation 1 tested: random brains scored <b>${Math.round(score)}</b>. Most just run in circles or hide in a corner. The least-bad ones become parents.`);
    else if (state.speed !== 0 && n % 4 === 0 || state.speed === 0 && n % 10 === 0) {
      const hint = pen < 5 ? "They're learning to move the flock toward the gate, but squeezing it through is hard…" : pen < 50 ? "Some sheep make it in now! Watch how the champion gets behind the flock." : pen < 85 ? "Most sheep end up in the pen." : "Expert herders!";
      ML.say(`Generation ${n}: the best half scored <b>${Math.round(score)}</b> and penned <b>${Math.round(pen)}%</b> of the sheep. ${hint}`);
    }
  }

  function markDone(c, msg) {
    if (state.done[c]) return;
    state.done[c] = true;
    const b = document.querySelector(`#chal [data-c="${c}"]`);
    b.classList.add("done");
    ML.confetti(60);
    ML.toast(`Challenge done: ${LABELS[c]}!`);
    ML.say(msg);
    const left = Object.keys(state.done).filter((k) => !state.done[k]);
    showTry(left.length ? `<b>Try this next:</b> ${LABELS[left[0]]}. Turn ${LABELS[c].toLowerCase()} off first, or keep it on to stack them up!` : `<b>All four done!</b> Stack every challenge at once, or tap an old checkpoint to see a younger dog fail them.`);
    if (!left.length) setTimeout(() => { ML.confetti(150); ML.say("You beat <b>every challenge</b>! You've seen evolution adapt to wind, wanderers, crowds and tight gates. Try <b>X-ray the model</b> to look inside the champion's brain."); }, 1800);
  }

  function checkAdapt() {
    const now = avgLast(state.scores);
    for (const p of state.pending.slice()) {
      p.low = Math.min(p.low, now);
      p.rounds++;
      if (p.rounds === 2 && now < p.before * 0.85)
        ML.say(`Ouch, ${p.label.toLowerCase()}! The score fell from <b>${Math.round(p.before)}</b> to <b>${Math.round(now)}</b>. The old tricks don't work so well now…`);
      const back = p.rounds >= 4 && (now >= p.before * 0.8 || (p.low < p.before * 0.85 && now >= p.low * 1.4 && now >= p.before * 0.7));
      if (back) {
        state.pending.splice(state.pending.indexOf(p), 1);
        if (p.low >= p.before * 0.85) markDone(p.c, `${p.label} barely slowed the dogs down: their herding tricks still work. Score <b>${Math.round(now)}</b>.`);
        else markDone(p.c, `They adapted to <b>${p.label.toLowerCase()}</b>! The score is back to <b>${Math.round(now)}</b> after ${p.rounds} generations. Nobody re-programmed them: the dogs that coped best had the babies.`);
      } else if (p.rounds >= 40) {
        state.pending.splice(state.pending.indexOf(p), 1);
        markDone(p.c, `${p.label} is really tough. The dogs got a bit better, but herding is simply harder now (score ${Math.round(now)}).`);
      }
    }
    // a challenge switched on before any training: count it once the dogs have lived with it for a while
    for (const c of Object.keys(state.rules)) {
      if (!state.rules[c] || state.done[c] || state.pending.some((p) => p.c === c)) continue;
      if (state.onSince[c] !== undefined && state.scores.length - state.onSince[c] >= 8)
        markDone(c, `The dogs grew up with <b>${LABELS[c].toLowerCase()}</b> from the start and scored <b>${Math.round(now)}</b>. Next time, switch a challenge on <b>after</b> they've learned, to see the dip and the comeback.`);
    }
  }

  // ---------- checkpoints ----------
  const ckpts = new GameLab.Checkpoints($("#ckpts"), (ck) => {
    state.ckTried = true; act();
    if (state.mode !== "robo") setMode("robo", true);
    startReplay(ck);
    ML.say(`Watching <b>generation ${ck.gen}</b>'s champion on a fresh field. ${ck.gen <= 2 ? "See how clueless it was?" : "Compare it with today's champion!"}`);
  }, () => { act(); newRoboWorld(); });
  function addCheckpoint(brain, gen) {
    // a test drive on one fixed field, so thumbnails can be compared
    const w = new C.World(brain.clone(), state.rules, 4242), path = [];
    while (!w.done) { w.step(); if (w.steps % 8 === 0) path.push([w.dog.x, w.dog.y]); }
    const snap = { path, sheep: w.sheep.map((s) => [s.x, s.y, s.penned]), gateHalf: w.gateHalf };
    ckpts.add({ label: `Generation ${gen}`, sub: `<small>${w.penned}/${w.n} penned</small>`, brain, gen, draw: (cv) => drawThumb(cv, snap) });
  }
  function drawThumb(cv, snap) {
    const c = cv.getContext("2d"), k = cv.width / W;
    const P = pal();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = P.grass; c.fillRect(0, 0, cv.width, cv.height);
    c.save(); c.scale(k, cv.height / H);
    c.fillStyle = P.penFloor; c.fillRect(PEN.x0, PEN.y0, PEN.x1 - PEN.x0, PEN.y1 - PEN.y0);
    c.strokeStyle = P.fence; c.lineWidth = 6;
    c.beginPath(); c.moveTo(PEN.x0, GATE_Y - snap.gateHalf); c.lineTo(PEN.x0, PEN.y0); c.lineTo(PEN.x1, PEN.y0); c.lineTo(PEN.x1, PEN.y1); c.lineTo(PEN.x0, PEN.y1); c.lineTo(PEN.x0, GATE_Y + snap.gateHalf); c.stroke();
    c.strokeStyle = "rgba(255,92,154,.85)"; c.lineWidth = 5; c.lineJoin = "round";
    c.beginPath(); snap.path.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    for (const [x, y, p] of snap.sheep) { c.fillStyle = p ? "#fff" : P.sheepOut; c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill(); }
    c.restore();
  }

  // ---------- drawing ----------
  function pal() {
    const d = ML.isDark();
    return d ? { grass: "#2d5537", stripe: "#2a5034", tuft: "#3d6e47", penFloor: "#5b4a2f", fence: "#b07a45", post: "#d9a066", sheepOut: "#f0d2a0", ink: "#f3f3f7" }
      : { grass: "#a3d98c", stripe: "#98d281", tuft: "#7fbf6c", penFloor: "#e6cf98", fence: "#8a5a2b", post: "#6b4320", sheepOut: "#fff3d6", ink: "#1f2140" };
  }
  const rt = ML.seeded(99);
  const tufts = Array.from({ length: 70 }, () => [rt() * W, rt() * H, 0.6 + rt() * 0.8]).filter(([x, y]) => !C.inPen(x, y, 14));
  const streaks = Array.from({ length: 16 }, () => [rt() * W, rt() * H, 20 + rt() * 30]);

  function drawGround(w, t) {
    const P = pal();
    ctx.fillStyle = P.grass; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = P.stripe;
    for (let x = 0; x < W; x += 80) ctx.fillRect(x, 0, 40, H); // mown stripes
    ctx.strokeStyle = P.tuft; ctx.lineWidth = 2; ctx.lineCap = "round";
    for (const [x, y, s] of tufts) { ctx.beginPath(); ctx.moveTo(x - 4 * s, y); ctx.lineTo(x - 2 * s, y - 6 * s); ctx.moveTo(x, y); ctx.lineTo(x, y - 8 * s); ctx.moveTo(x + 4 * s, y); ctx.lineTo(x + 2 * s, y - 6 * s); ctx.stroke(); }
    // the pen
    ctx.fillStyle = P.penFloor; ctx.fillRect(PEN.x0, PEN.y0, PEN.x1 - PEN.x0, PEN.y1 - PEN.y0);
    const g = w.gateHalf;
    ctx.strokeStyle = P.fence; ctx.lineWidth = 5; ctx.lineJoin = "miter";
    ctx.beginPath(); ctx.moveTo(PEN.x0, GATE_Y - g); ctx.lineTo(PEN.x0, PEN.y0); ctx.lineTo(PEN.x1, PEN.y0); ctx.lineTo(PEN.x1, PEN.y1); ctx.lineTo(PEN.x0, PEN.y1); ctx.lineTo(PEN.x0, GATE_Y + g); ctx.stroke();
    ctx.lineWidth = 2; // second rail
    ctx.beginPath(); ctx.moveTo(PEN.x0 + 4, GATE_Y - g); ctx.lineTo(PEN.x0 + 4, PEN.y0 + 4); ctx.lineTo(PEN.x1 - 4, PEN.y0 + 4); ctx.lineTo(PEN.x1 - 4, PEN.y1 - 4); ctx.lineTo(PEN.x0 + 4, PEN.y1 - 4); ctx.lineTo(PEN.x0 + 4, GATE_Y + g); ctx.stroke();
    ctx.fillStyle = P.post;
    for (let y = PEN.y0; y <= PEN.y1; y += 28) { if (Math.abs(y - GATE_Y) > g) ctx.fillRect(PEN.x0 - 4, y - 4, 8, 8); ctx.fillRect(PEN.x1 - 4, y - 4, 8, 8); }
    for (let x = PEN.x0; x <= PEN.x1; x += 32) { ctx.fillRect(x - 4, PEN.y0 - 4, 8, 8); ctx.fillRect(x - 4, PEN.y1 - 4, 8, 8); }
    // gate posts
    ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#c98f00"; ctx.lineWidth = 2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(PEN.x0, GATE_Y + s * g, 6, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.font = "800 12px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = P.ink; ctx.globalAlpha = 0.75;
    ctx.fillText("PEN", (PEN.x0 + PEN.x1) / 2, PEN.y0 + 22); ctx.globalAlpha = 1;
    // wind streaks
    if (w.rules.wind) {
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
      const dx = w.wind.x, dy = w.wind.y, m = Math.hypot(dx, dy);
      for (const s of streaks) {
        const o = reduce ? 0 : (t * 0.09) % (W + 100);
        let x = ((s[0] + dx / m * o) % (W + 100) + W + 100) % (W + 100) - 50, y = ((s[1] + dy / m * o) % (H + 60) + H + 60) % (H + 60) - 30;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx / m * s[2], y + dy / m * s[2]); ctx.stroke();
      }
    }
  }

  function drawSheep(s, i, t) {
    const sp = Math.hypot(s.vx, s.vy);
    const want = sp > 0.15 ? Math.atan2(s.vy, s.vx) : (s._a ?? s.h);
    if (s._a === undefined) s._a = want;
    let d = want - s._a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    s._a += d * 0.2;
    const bob = reduce ? 0 : Math.sin(t / 70 + i * 1.7) * Math.min(1.2, sp);
    ctx.save(); ctx.translate(s.x, s.y + bob); ctx.rotate(s._a);
    ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.beginPath(); ctx.ellipse(1, 4, 9, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = s.stubborn ? "#f2c48d" : "#fbfbf6"; ctx.strokeStyle = "#77777f"; ctx.lineWidth = 1;
    for (const [px, py, r] of [[-3, -3, 5], [-3, 3, 5], [2, -3, 5], [2, 3, 5], [-6, 0, 4.5]]) { ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = s.stubborn ? "#f2c48d" : "#fbfbf6"; ctx.beginPath(); ctx.arc(-1, 0, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a3a46"; ctx.beginPath(); ctx.ellipse(8, 0, 4, 3.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(9.5, -1.4, 0.9, 0, 7); ctx.arc(9.5, 1.4, 0.9, 0, 7); ctx.fill();
    ctx.restore();
    if (s.scared > 0.6 && !s.penned) { ctx.fillStyle = "#ff5c5c"; ctx.font = "900 11px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", s.x, s.y - 11); }
  }

  function drawDog(dog, color, t) {
    const sp = Math.hypot(dog.vx, dog.vy);
    if (dog._a === undefined) dog._a = 0;
    if (sp > 0.2) { let d = Math.atan2(dog.vy, dog.vx) - dog._a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; dog._a += d * 0.3; }
    const wag = reduce ? 0 : Math.sin(t / 60) * 0.5;
    ctx.save(); ctx.translate(dog.x, dog.y); ctx.rotate(dog._a);
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(1, 5, 13, 6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#24242c"; ctx.lineWidth = 3.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-18, Math.sin(wag) * 7); ctx.stroke(); // tail
    ctx.fillStyle = "#24242c"; ctx.beginPath(); ctx.ellipse(-1, 0, 11, 6.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(5, 0, 4, 4.5, 0, 0, 7); ctx.fill(); // white chest
    ctx.fillStyle = color; ctx.fillRect(6.5, -5, 2.5, 10); // collar
    ctx.fillStyle = "#24242c"; ctx.beginPath(); ctx.arc(12, 0, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(15, 0, 2.6, 2, 0, 0, 7); ctx.fill(); // muzzle
    ctx.fillStyle = "#24242c"; ctx.beginPath(); ctx.arc(17.5, 0, 1.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -5, 3, 1.8, -0.5, 0, 7); ctx.ellipse(10, 5, 3, 1.8, 0.5, 0, 7); ctx.fill(); // ears
    ctx.restore();
  }

  function pill(text, x, y, align = "left", bg = "rgba(31,33,64,.74)") {
    ctx.font = "800 13px Nunito, sans-serif";
    const tw = ctx.measureText(text).width + 24;
    const x0 = align === "right" ? x - tw : x;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x0, y, tw, 28, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(text, x0 + 12, y + 19);
  }

  function draw(t) {
    const L = state.live, w = L.world, dog = w.dog;
    drawGround(w, t);
    const robo = L.kind !== "you";
    // what the dog sees
    if (state.showSenses && w.frame && !w.done) {
      const fr = w.frame, f = fr.f;
      ctx.save();
      ctx.strokeStyle = "rgba(124,92,255,.85)"; ctx.lineWidth = 2.5; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(f.cx, f.cy); ctx.lineTo(fr.aim.x, fr.aim.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(124,92,255,.9)"; ctx.beginPath(); ctx.arc(fr.aim.x, fr.aim.y, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(124,92,255,.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.cx, f.cy, 7, 0, 7); ctx.moveTo(f.cx - 11, f.cy); ctx.lineTo(f.cx + 11, f.cy); ctx.moveTo(f.cx, f.cy - 11); ctx.lineTo(f.cx, f.cy + 11); ctx.stroke();
      if (f.far && f.k > 1) { ctx.strokeStyle = "rgba(255,138,61,.95)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(f.far.x, f.far.y, 14, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
    if (state.showScare) {
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(dog.x, dog.y, FLEE_R, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    w.sheep.forEach((s, i) => drawSheep(s, i, t));
    drawDog(dog, robo ? "#ff5c9a" : "#2fbf62", t);
    if (state.showSenses && !w.done && (w.out[0] || w.out[1])) {
      const m = Math.hypot(w.out[0], w.out[1]), len = 14 + 26 * Math.min(1, m), ux = w.out[0] / (m || 1), uy = w.out[1] / (m || 1);
      const ex = dog.x + ux * len, ey = dog.y + uy * len;
      ctx.strokeStyle = robo ? "#ff5c9a" : "#2fbf62"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(dog.x + ux * 12, dog.y + uy * 12); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + ux * 6, ey + uy * 6); ctx.lineTo(ex - uy * 5, ey + ux * 5); ctx.lineTo(ex + uy * 5, ey - ux * 5); ctx.closePath(); ctx.fill();
    }
    if (L.kind === "you" && youTarget && !w.done) { ctx.strokeStyle = "rgba(47,191,98,.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(youTarget.x, youTarget.y, 8, 0, 7); ctx.stroke(); }
    // HUD
    const left = Math.max(0, (STEPS - w.steps) / 60);
    const label = L.kind === "you" ? (L.started ? `You · ${left.toFixed(0)} s left` : "You · move to start the clock")
      : L.kind === "replay" ? `Replay: generation ${L.ck.gen}'s champion · ${left.toFixed(0)} s`
      : L.gen ? `Generation ${L.gen} champion · ${left.toFixed(0)} s left` : `A random baby dog · ${left.toFixed(0)} s left`;
    pill(label, 10, 10);
    pill(`Penned ${w.penned} / ${w.n}`, W - 10, 10, "right", w.penned === w.n ? "rgba(47,191,98,.9)" : "rgba(31,33,64,.74)");
    ctx.fillStyle = "rgba(31,33,64,.35)"; ctx.fillRect(10, H - 10, W - 20, 4);
    ctx.fillStyle = "#ffd23f"; ctx.fillRect(10, H - 10, (W - 20) * (w.steps / STEPS), 4);
    if (w.done) {
      const all = w.penned === w.n;
      ctx.fillStyle = "rgba(31,33,64,.78)"; ctx.beginPath(); ctx.roundRect(W / 2 - 150, H / 2 - 42, 300, 84, 16); ctx.fill();
      ctx.fillStyle = all ? "#7ef0a5" : "#fff"; ctx.textAlign = "center"; ctx.font = "800 22px Fredoka, Nunito, sans-serif";
      ctx.fillText(all ? `All ${w.n} sheep penned!` : `${w.penned} of ${w.n} sheep penned`, W / 2, H / 2 - 6);
      ctx.fillStyle = "#fff"; ctx.font = "700 14px Nunito, sans-serif";
      ctx.fillText(L.kind === "you" ? `Score ${Math.round(w.score())} · Space or New field to go again` : `Score ${Math.round(w.score())} out of 100`, W / 2, H / 2 + 20);
    }
  }

  function drawChart() {
    const series = [{ values: state.scores, color: "--accent" }, { values: state.pens, color: "--lang" }];
    GameLab.drawChart(chartCv, series, state.markers, 100);
    if (state.youBest !== null) { // your best: a dashed line across
      const { ctx: c, w, h } = chartCv, y = 22 + (h - 44) * (1 - Math.min(1, state.youBest / 100));
      c.strokeStyle = ML.cssVar("--warn"); c.lineWidth = 2; c.setLineDash([6, 4]);
      c.beginPath(); c.moveTo(34, y); c.lineTo(w - 10, y); c.stroke(); c.setLineDash([]);
      c.fillStyle = ML.cssVar("--warn"); c.font = "800 10px Nunito, sans-serif"; c.textAlign = "right"; c.fillText(`you: ${Math.round(state.youBest)}`, w - 12, y - 4);
    }
  }

  function drawNetLive(net) {
    const { ctx: c, w: Wc, h: Hc } = netCv;
    c.clearRect(0, 0, Wc, Hc);
    if (!net) { c.fillStyle = ML.cssVar("--muted"); c.font = "700 12px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("No robot brain: you are steering!", Wc / 2, Hc / 2 + 4); return; }
    const sizes = net.sizes, n = sizes.length;
    const pos = sizes.map((k, l) => Array.from({ length: k }, (_, i) => [20 + ((Wc - 40) * l) / (n - 1), k === 1 ? Hc / 2 : 10 + ((Hc - 20) * i) / (k - 1)]));
    for (let l = 0; l < n - 1; l++) for (let i = 0; i < sizes[l]; i++) for (let j = 0; j < sizes[l + 1]; j++) {
      const wt = net.weight(l, i, j), a = net.acts[l][i];
      c.strokeStyle = wt * a > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
      c.globalAlpha = Math.min(0.85, 0.04 + Math.abs(wt * a) * 0.5); c.lineWidth = Math.min(2.5, 0.3 + Math.abs(wt * a));
      c.beginPath(); c.moveTo(...pos[l][i]); c.lineTo(...pos[l + 1][j]); c.stroke();
    }
    c.globalAlpha = 1;
    pos.forEach((layer, l) => layer.forEach(([x, y], i) => {
      const a = Math.max(-1, Math.min(1, net.acts[l][i]));
      c.fillStyle = a >= 0 ? ML.cssVar("--sup") : ML.cssVar("--rl"); c.globalAlpha = 0.25 + 0.75 * Math.abs(a);
      c.beginPath(); c.arc(x, y, l === n - 1 ? 7 : 5, 0, 7); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1; c.stroke();
    }));
    c.fillStyle = ML.cssVar("--muted"); c.font = "800 9px Nunito, sans-serif"; c.textAlign = "center";
    c.fillText("10 senses", pos[0][0][0] + 8, Hc - 1); c.fillText("thinking", Wc / 2, Hc - 1);
    c.textAlign = "right"; c.fillText("gate", Wc - 4, pos[2][0][1] - 9); c.fillText("side", Wc - 4, pos[2][1][1] + 16);
  }

  // ---------- "what is the dog thinking" ----------
  const near = (px) => (px < 80 ? "close" : px < 200 ? "a little way off" : "far away");
  function renderInside() {
    const L = state.live, w = L.world, x = w.input, f = w.frame && w.frame.f;
    const think = $("#think"), dec = $("#decision");
    if (!f || w.done) {
      think.innerHTML = `<div class="row">${ML.icon("check")}<div>${w.done ? `This try is over: <b>${w.penned} of ${w.n}</b> sheep penned.` : "All the sheep are in!"}</div></div>`;
      dec.innerHTML = L.kind === "you" ? "Press <b>Space</b> or <b>New field</b> for another go." : "A new field starts in a moment…";
      drawNetLive(L.kind === "you" ? null : w.brain);
      return;
    }
    const flockPx = Math.hypot(f.cx - w.dog.x, f.cy - w.dog.y);
    const pos = x[0] > 0.12 ? `the dog is <b>behind</b> the flock (a good spot to push from)` : x[0] < -0.12 ? `the dog is <b>in front of</b> the flock (pushing from here sends them the wrong way!)` : `the dog is <b>beside</b> the flock`;
    const spread = Math.min(1, x[7] / 1.2), gate = Math.max(0, 1 - x[6] / 1.5);
    think.innerHTML = `
      <div class="row">${ML.icon("groups")}<div>Flock middle is <b>${near(flockPx)}</b>; ${pos}.</div></div>
      <div class="row">${ML.icon("target")}<div>Straggler: <b>${Math.round(f.spread)} px</b> from the middle${f.spread > 70 ? " (wandering off!)" : ""}<div class="meter" aria-hidden="true"><i style="width:${(spread * 100).toFixed(0)}%;background:var(--warn)"></i></div></div></div>
      <div class="row">${ML.icon("flag")}<div>Flock to the gate: <b>${Math.round(x[6] * 400)} px</b><div class="meter" aria-hidden="true"><i style="width:${(gate * 100).toFixed(0)}%;background:var(--good)"></i></div></div></div>`;
    if (L.kind === "you") {
      dec.innerHTML = `You are the brain! A robot dog gets only these few numbers (10 in all) and has to decide where to run by itself.`;
      drawNetLive(null);
      return;
    }
    const o = w.raw || [0, 0], m = Math.hypot(o[0], o[1]);
    // does the chosen direction point at the straggler?
    const fx = f.far.x - w.dog.x, fy = f.far.y - w.dog.y, fd = Math.hypot(fx, fy) || 1, om = Math.hypot(w.out[0], w.out[1]) || 1;
    const toFar = (fx * w.out[0] + fy * w.out[1]) / fd / om;
    let plan;
    if (m < 0.25) plan = "wait and watch";
    else if (f.spread > 26 + 7 * Math.sqrt(f.k) && toFar > 0.8) plan = "fetch the straggler";
    else if (o[0] > 0.45 && x[0] > 0.05) plan = "push the flock toward the gate";
    else if (o[0] < -0.35) plan = "run back behind the flock";
    else if (Math.abs(o[1]) >= Math.abs(o[0])) plan = `circle round to the ${o[1] > 0 ? "right" : "left"}`;
    else plan = o[0] > 0 ? "creep toward the gate" : "ease back";
    dec.innerHTML = `${ML.icon("network")} Brain says: <b>${plan}</b><br><small class="muted">toward gate ${o[0] >= 0 ? "+" : ""}${o[0].toFixed(2)} · sideways ${o[1] >= 0 ? "+" : ""}${o[1].toFixed(2)}</small>`;
    drawNetLive(w.brain);
  }

  function renderStats() {
    const w = state.live.world;
    $("#st-gen").textContent = state.gen;
    $("#st-pen").innerHTML = `${w.penned}<small>/${w.n}</small>`;
    $("#st-score").textContent = state.scores.length ? Math.round(avgLast(state.scores, 1)) : "–";
    $("#st-you").textContent = state.youBest === null ? "–" : Math.round(state.youBest);
    $("#testing").innerHTML = state.mode === "robo" && state.playing ? `Testing baby dog <b>${state.evalI + 1}</b> of ${POP} (field ${state.evalK + 1} of ${state.genTries}) in the background…` : state.mode === "robo" ? "Paused. Press <b>Play</b> to keep evolving." : "";
  }

  // ---------- you steer ----------
  const keys = { left: false, right: false, up: false, down: false };
  let youTarget = null;
  function youCtrl(w) {
    const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (kx || ky) return [kx, ky];
    if (!youTarget) return [0, 0];
    const dx = youTarget.x - w.dog.x, dy = youTarget.y - w.dog.y, d = Math.hypot(dx, dy);
    if (d < 4) return [0, 0];
    const s = Math.min(1, d / 30) / d;
    return [dx * s, dy * s];
  }
  function endYou() {
    const w = state.live.world, sc = w.score();
    state.youTries++;
    const first = state.youBest === null;
    if (first || sc > state.youBest) state.youBest = sc;
    $("#lg-you").classList.remove("hidden");
    state.chartDirty = true;
    if (w.penned === w.n) { ML.confetti(60); ML.say(`Brilliant! All <b>${w.n}</b> sheep penned, score <b>${Math.round(sc)}</b>. ${state.scores.length ? "Can the robot dogs match that?" : "Now press <b>Play</b>: can robot dogs with random brains learn to do that?"}`); }
    else if (w.penned > 0) ML.say(`You penned <b>${w.penned} of ${w.n}</b> (score ${Math.round(sc)}). Tip: stay <b>behind</b> the flock, on the far side from the gate, and fetch any sheep that wander off. ${state.youTries >= 2 ? "Or press <b>Play</b> and watch robot dogs figure it out." : "Press <b>Space</b> to try again."}`);
    else ML.say(`Tricky, isn't it? Chasing straight at sheep scatters them. Get <b>behind</b> the flock and walk it toward the gate. ${state.youTries >= 2 ? "Or press <b>Play</b> and let robot dogs try." : "Press <b>Space</b> for a new field."}`);
    ML.toast(`Your score: ${Math.round(sc)}${!first && sc >= state.youBest ? " (new best!)" : ""}`);
  }

  // ---------- main loop ----------
  let frameNo = 0;
  const BUDGET = { 1: 3, 3: 5, 10: 9, 0: 14 };
  function frame(t) {
    const L = state.live, w = L.world;
    if (L.kind === "you") {
      if (!w.done) {
        const c = youCtrl(w);
        if (!L.started && (c[0] || c[1])) { L.started = true; act(); }
        w.step(c);
        if (!L.started) w.steps--; // sheep graze, but the clock waits for you
        if (state.seen.length < 300 && w.steps % 10 === 0) state.seen.push(w.input.slice());
      } else if (!L.ended) { L.ended = true; endYou(); }
    } else {
      if (!w.done) {
        for (let i = 0, n = ML.ticks(state.speed || 10, "live"); i < n && !w.done; i++) {
          w.step();
          if (w.steps % 10 === 0) { state.seen.push(w.input.slice()); if (state.seen.length > 300) state.seen.shift(); }
        }
      } else if (!L.endAt) {
        L.endAt = t + (state.speed === 0 ? 500 : 1800);
        if (L.kind === "replay") ML.say(`Generation ${L.ck.gen}'s champion penned <b>${w.penned} of ${w.n}</b> (score ${Math.round(w.score())}). ${state.champ && state.champGen > L.ck.gen ? `Today's champion is from generation ${state.champGen}. Tap <b>Back to live</b> to compare.` : ""}`);
      } else if (t > L.endAt) {
        if (L.kind === "replay") startReplay(L.ck); else newRoboWorld();
      }
      if (state.mode === "robo" && state.playing) evalSome(BUDGET[state.speed]);
    }
    draw(t);
    if (++frameNo % 6 === 0) { renderInside(); renderStats(); }
    if (state.chartDirty) { drawChart(); state.chartDirty = false; }
    requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  const playBtn = $("#play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; playBtn.setAttribute("aria-pressed", state.playing); }
  function setMode(m, quiet) {
    state.mode = m;
    document.querySelectorAll("#mode button").forEach((x) => { x.classList.toggle("on", x.dataset.m === m); x.setAttribute("aria-pressed", x.dataset.m === m); });
    fieldCv.classList.toggle("auto-dog", m === "robo");
    $("#dpad").classList.toggle("hidden", m === "robo");
    $("#again").classList.toggle("hidden", m === "robo");
    if (m === "you") {
      state.playing = false; syncPlay(); newYouWorld(); ckpts.active = null; ckpts.render();
      if (!quiet) ML.say(state.youTries ? `Your turn again! Your best is <b>${Math.round(state.youBest)}</b>. ${state.champ ? `The robot champion scored <b>${Math.round(state.champScore)}</b>.` : ""}` : "Your turn! Point at the field (or use the arrow keys) and the dog runs there. Push the sheep through the gate.");
    } else {
      newRoboWorld();
      if (!quiet) ML.say(state.scores.length ? `Back to the robot dogs at generation <b>${state.gen}</b>. Press <b>Play</b> to keep them evolving.` : `Meet <b>${POP}</b> robot dogs with random brains. Press <b>Play</b>: each dog is tested on the same fields in the background, and the best ones become parents.`);
    }
    renderInside(); renderStats();
  }
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => { act(); if (b.dataset.m !== state.mode) setMode(b.dataset.m); }));
  playBtn.addEventListener("click", () => {
    act();
    if (state.mode !== "robo") setMode("robo", true);
    if (state.live.kind === "replay") { ckpts.active = null; ckpts.render(); newRoboWorld(); }
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && !state.scores.length && state.evalI === 0)
      ML.say(`Off they go! ${POP} dogs, random brains. The field shows one dog at a time; the rest are tested out of sight. Watch the <b>chart</b>: one dot per generation.`);
  });
  $("#skip").addEventListener("click", () => {
    act();
    if (state.mode !== "robo") setMode("robo", true);
    const g = state.gen;
    while (state.gen === g) evalSome(50);
    renderStats();
  });
  $("#reset").addEventListener("click", () => {
    act();
    state.brains = Array.from({ length: POP }, () => C.newBrain());
    state.gen = 1; resetEval();
    state.scores = []; state.pens = []; state.markers = []; state.pending = []; state.onSince = {};
    for (const c of Object.keys(state.rules)) if (state.rules[c]) state.onSince[c] = 0;
    state.champ = null; state.champGen = 0; state.champScore = 0; state.firstPen = false; state.celebrated = false; state.beatYou = false;
    ckpts.clear(); state.chartDirty = true;
    if (state.mode === "robo") newRoboWorld();
    ML.say("Brand-new random brains. Everything the dogs learned is gone! Press <b>Play</b> to evolve them again.");
  });
  $("#again").addEventListener("click", () => { act(); if (state.mode === "you") newYouWorld(); });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    act();
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
    if (state.speed === 0) ML.say("Turbo! The dogs practise as fast as your computer can go. Watch the lines on the chart climb.");
  }));
  ML.bindRange("#mut", (v) => v.toFixed(2), (v) => { state.mutation = v; act(); });
  ML.bindRange("#tries", (v) => `${v}`, (v) => { state.tries = v; act(); });
  $("#senses").addEventListener("change", (e) => { state.showSenses = e.target.checked; act(); if (state.showSenses) ML.say(`<b style="color:#7c5cff">Purple</b> cross = the flock's middle, dashed line = the way to the gate, <b style="color:#ff8a3d">orange</b> ring = the sheep furthest out, arrow = where the dog runs.`); });
  $("#scare").addEventListener("change", (e) => { state.showScare = e.target.checked; act(); });

  document.querySelectorAll("#chal [data-c]").forEach((b) => b.addEventListener("click", () => {
    act();
    const c = b.dataset.c;
    state.rules[c] = !state.rules[c];
    const on = state.rules[c];
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    if (state.scores.length || state.mode === "robo") { state.markers.push({ at: state.scores.length, label: `${LABELS[c]} ${on ? "on" : "off"}` }); state.chartDirty = true; }
    resetEval(); // this generation restarts under the new rules, so every dog gets a fair test
    if (state.mode === "you") newYouWorld(); else if (state.live.kind === "robo") newRoboWorld();
    state.pending = state.pending.filter((p) => p.c !== c);
    if (on) {
      state.onSince[c] = state.scores.length;
      const enough = state.scores.length >= 3;
      if (enough) state.pending.push({ c, label: LABELS[c], before: avgLast(state.scores), low: Infinity, rounds: 0 });
      ML.say(`<b>${LABELS[c]}</b>! ${TELLS[c]} ${state.mode === "you" ? "Try it yourself, then let the robot dogs face it." : enough ? "Let's see if the dogs can adapt." : "Tip: it's most fun after the dogs have learned (score above 50), so you see the dip and the comeback."}`);
      showTry(`<b>Try this:</b> ${TRY[c]}`);
    } else { delete state.onSince[c]; ML.say(`${LABELS[c]} switched off.`); }
  }));
  function showTry(html) { const el = $("#try"); el.innerHTML = html; el.classList.remove("hidden"); }

  // keyboard + touch steering
  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  document.addEventListener("keydown", (e) => {
    if (state.mode !== "you" || typing(e) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (keyMap[e.code]) { e.preventDefault(); keys[keyMap[e.code]] = true; youTarget = null; act(); }
    else if (e.code === "Space" && !(e.target && e.target.tagName === "BUTTON")) { e.preventDefault(); act(); newYouWorld(); }
  });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });
  const setTarget = (e) => { youTarget = ML.canvasPoint(fieldCv, e, W, H); act(); };
  fieldCv.addEventListener("pointermove", (e) => { if (state.mode === "you" && (e.pointerType === "mouse" || e.buttons)) setTarget(e); });
  fieldCv.addEventListener("pointerdown", (e) => {
    if (state.mode !== "you") return;
    if (state.live.world.done) { newYouWorld(); return; }
    e.preventDefault(); setTarget(e); try { fieldCv.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
  });
  fieldCv.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") youTarget = null; });
  fieldCv.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") youTarget = null; });
  fieldCv.addEventListener("pointercancel", () => { youTarget = null; });
  document.querySelectorAll("#dpad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); keys[k] = true; youTarget = null; b.classList.add("pressed"); act(); };
    const off = () => { keys[k] = false; b.classList.remove("pressed"); };
    b.addEventListener("pointerdown", on);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, off));
  });

  function hideOverlay() { const o = $("#overlay"); if (o) o.classList.remove("show"); }

  // ---------- idle nudge: after ~15 s with nothing happening, point at the next step ----------
  function nextStep() {
    if (state.mode === "you" && !state.youTries) return state.live.started ? "Keep going! Get <b>behind</b> the sheep, on the far side from the gate, and walk them in." : "Move your pointer over the field, touch it, or press the <b>arrow keys</b>. The dog runs where you point.";
    if (state.mode === "you") return "Nice herding! Now press <b>Play</b> and watch 30 robot dogs with random brains learn the same job.";
    if (!state.playing && !state.scores.length) return "Press <b>Play</b> to start evolving the robot dogs.";
    if (!state.playing) return "Paused. Press <b>Play</b> to keep evolving, or <b>Next gen</b> to skip ahead one generation.";
    if (state.scores.length < 10) return "Watch the <b>chart</b> under the field: one dot per generation. Try <b>10×</b> or <b>Turbo</b> to speed things up.";
    if (!Object.values(state.done).some(Boolean) && !Object.values(state.rules).some(Boolean)) return "The dogs are getting good. Throw a challenge at them: try <b>Windy day</b>!";
    if (!state.ckTried && ckpts.items.length > 1) return "Tap the <b>Generation 1</b> checkpoint below to watch a dog from the very beginning. Then compare!";
    const left = Object.keys(state.done).find((c) => !state.done[c] && !state.rules[c]);
    if (left && !state.pending.length) return `Ready for another challenge? Try <b>${LABELS[left]}</b>.`;
    if (state.pending.length) return `Watch the chart after the red line: can the dogs win back their score with <b>${state.pending[0].label.toLowerCase()}</b>?`;
    return "Try <b>X-ray the model</b> to see which senses the champion dog relies on, or steer the dog yourself in a challenge!";
  }
  setInterval(() => {
    const now = performance.now();
    if (now - state.lastAct > 15000) { ML.say(nextStep()); state.lastAct = now; }
  }, 1000);

  document.addEventListener("themechange", () => { state.chartDirty = true; ckpts.render(); renderInside(); });

  // ---------- start ----------
  ckpts.render();
  setMode("you", true);
  syncPlay();
  drawChart();
  requestAnimationFrame(frame);

  // ---------- Model X-ray ----------
  let netNow = null;
  const span = (name, min, max, describe) => ({ name, min, max, step: 0.05, describe });
  const ahead = (v) => (v > 0.1 ? "toward the gate from the dog" : v < -0.1 ? "away from the gate" : "level");
  const side = (v) => (Math.abs(v) < 0.1 ? "straight in line" : v > 0 ? "to the right" : "to the left");
  ML.xray.register({
    title: "The champion dog's brain",
    kind: "Neural network",
    summary: () => (state.champ ? `evolved over ${state.champGen} generations` : "random brain (not evolved yet)"),
    size: () => `${(state.champ || state.brains[0]).genes.length} knobs`,
    stats: () => [["Generations", state.scores.length], ["Best half score", state.scores.length ? Math.round(avgLast(state.scores, 1)) : "–"], ["Layers", C.SIZES.join(" → ")]],
    inputs: [
      span("Flock ahead", -1.5, 1.5, ahead), span("Flock to the side", -1.5, 1.5, side),
      span("Straggler ahead", -1.5, 1.5, ahead), span("Straggler to the side", -1.5, 1.5, side),
      span("Gate way: across", -1, 1, (v) => (v > 0.3 ? "gate is to the right" : v < -0.3 ? "gate is to the left" : "gate is up or down")),
      span("Gate way: up/down", -1, 1, (v) => (v > 0.3 ? "gate is below" : v < -0.3 ? "gate is above" : "level")),
      span("Flock to gate distance", 0, 1.5, (v) => `${Math.round(v * 400)} px`),
      span("Flock spread", 0, 1.5, (v) => (v < 0.3 ? "tight" : v < 0.6 ? "loose" : "scattered")),
      span("Dog: across", -1, 1, (v) => (v < -0.3 ? "left of field" : v > 0.3 ? "right of field" : "middle")),
      span("Dog: up/down", -1, 1, (v) => (v < -0.3 ? "top of field" : v > 0.3 ? "bottom of field" : "middle")),
    ],
    outputs: [
      { name: "Run toward the gate", color: ML.cssVar("--good") },
      { name: "Run back (away from gate)", color: ML.cssVar("--rl") },
      { name: "Run left", color: ML.cssVar("--sup") },
      { name: "Run right", color: ML.cssVar("--vision") },
    ],
    predict: (x) => { const o = netNow.forward(x); return [o[0], -o[0], -o[1], o[1]]; },
    samples: () => state.seen,
    current: () => (state.live && state.live.kind !== "you" && state.live.world.frame ? state.live.world.input.slice() : null),
    drawBrain: (cv) => { const n = netNow; ML.xray.drawNet(cv, n.sizes, (l, i, j) => n.weight(l, i, j), ["flock ahead", "flock side", "straggler ahead", "straggler side", "gate across", "gate up/down", "gate distance", "spread", "dog across", "dog up/down"], ["toward gate", "sideways"]); },
    brainCaption: ML.xray.NET_CAPTION,
    notes: ["All directions are measured from the flock toward the gate: 'ahead' means toward the gate, 'right' means to the right when facing the gate. That is why one small brain works wherever the flock starts."],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { netNow = (state.champ || state.brains[0]).clone(); _xo(); };
  ML.xray.button(playBtn.parentElement);
})();
