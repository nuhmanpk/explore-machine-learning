// Paper Plane Designer — page: design-and-throw, the generation-by-generation flock of ghost flights,
// challenges, checkpoints, the champion's family tree and the Model X-ray of the distance landscape.
(function () {
  const C = window.GliderCore;
  const { GENES, PAD_X, PAD_HALF, FIELD, LAUNCH_H } = C;
  const POP = 40;
  const $ = (q) => document.querySelector(q);
  const reduce = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ---------- canvases ----------
  const W = 760, H = 340;
  const scene = ML.setupCanvas($("#scene"), W, H);
  const ctx = scene.ctx;
  const chartCv = ML.setupCanvas($("#chart"), 640, 180);
  const bp = ML.setupCanvas($("#blueprint"), 280, 150);
  const treeCv = ML.setupCanvas($("#tree"), 960, 280);

  // world → screen. The vertical scale is doubled so the flights are easy to see.
  const X0 = 40, SX = (W - X0 - 12) / FIELD, SY = SX * 2, GROUND = H - 40;
  const sx = (x) => X0 + x * SX;
  const sy = (y) => GROUND - y * SY;
  const screenAngle = (th) => Math.atan2(-Math.sin(th) * SY, Math.cos(th) * SX);

  const state = {
    mode: "you",            // "you" (your throw) | "flock" | "replay"
    rules: { ...C.DEFAULT_RULES },
    seed: 7,
    ev: null, phase: "eval", evalI: 0, order: null, tau: 0, endT: 0, hold: 0,
    playing: false, speed: 3, mutation: 0.12, ghosts: true,
    hist: { best: [], avg: [], pad: [] }, markers: [], padUsed: false,
    bestEver: null, champ: null, treeId: null,
    you: null, youBest: 0, throws: 0, injectNext: null, injected: false,
    replay: null, done: {}, pending: {}, celebrated: false, beatYou: false,
    lastAct: performance.now(), dirty: true,
  };

  // ---------- your design ----------
  const design = {};
  const fmt = {
    wing: (v) => v.toFixed(1) + "×", tilt: (v) => Math.round(v) + "°",
    clips: (v) => (v === 0 ? "none" : v + (v === 1 ? " clip" : " clips")),
    angle: (v) => Math.round(v) + "°", speed: (v) => v.toFixed(1) + " m/s",
  };
  GENES.forEach((g) => ML.bindRange("#g-" + g.key, fmt[g.key], (v) => { design[g.key] = v; drawBlueprint(); state.dirty = true; }));
  const designFrom = (genes) => C.decode(genes);
  const m = (d) => (d < 10 ? d.toFixed(1) : Math.round(d)) + " m";

  // ---------- plane picture ----------
  // A side view of a paper dart: the folded keel, the wing seen edge-on with a bent-up back edge, nose clips.
  function drawPlane(c, x, y, ang, d, size, col, opts = {}) {
    c.save();
    c.translate(x, y); c.rotate(ang);
    c.globalAlpha = opts.alpha ?? 1;
    const L = size, wh = size * (0.09 + 0.08 * d.wing);
    // keel
    c.fillStyle = opts.keel || "rgba(255,255,255,.85)";
    c.strokeStyle = col; c.lineWidth = Math.max(1, size / 18);
    c.beginPath(); c.moveTo(L * 0.5, 0); c.lineTo(-L * 0.5, 0); c.lineTo(-L * 0.18, L * 0.16); c.closePath(); c.fill(); c.stroke();
    // wing (edge-on, a little perspective so its size shows)
    c.fillStyle = col;
    c.beginPath(); c.moveTo(L * 0.5, 0); c.lineTo(-L * 0.5, -wh); c.lineTo(-L * 0.5, 0); c.closePath(); c.fill();
    // bent-up back edge (the tilt)
    const t = (d.tilt * 3.2 * Math.PI) / 180;
    c.strokeStyle = col; c.lineWidth = Math.max(1.5, size / 12); c.lineCap = "round";
    c.beginPath(); c.moveTo(-L * 0.5, -wh * 0.5); c.lineTo(-L * 0.5 - Math.cos(t) * L * 0.14, -wh * 0.5 - Math.sin(t) * L * 0.14); c.stroke();
    // nose clips
    const n = Math.round(d.clips);
    c.fillStyle = "#6b7280";
    for (let i = 0; i < n; i++) c.fillRect(L * 0.36 - i * L * 0.075, -L * 0.03, L * 0.05, L * 0.08);
    if (opts.bug) { // the ladybug passenger
      c.fillStyle = "#e53935"; c.beginPath(); c.arc(-L * 0.05, -wh * 0.55, L * 0.08, 0, 7); c.fill();
      c.fillStyle = "#111"; c.beginPath(); c.arc(L * 0.02, -wh * 0.58, L * 0.035, 0, 7); c.fill();
    }
    c.restore();
  }

  // ---------- blueprint: top view + balance ----------
  function drawBlueprint() {
    const c = bp.ctx, w = bp.w, h = bp.h;
    c.clearRect(0, 0, w, h);
    const d = design;
    if (d.wing === undefined || d.speed === undefined) return;
    const e = C.explain(d);
    const ink = ML.cssVar("--ink"), mut = ML.cssVar("--muted"), acc = ML.cssVar("--accent");
    // top view: nose on the right
    const cx = 100, cy = 62, len = 150, span = 34 + 30 * (d.wing - 0.6) / 1.4;
    const nose = cx + len / 2, tail = cx - len / 2;
    c.fillStyle = ML.isDark() ? "#3b4170" : "#ffffff"; c.strokeStyle = ink; c.lineWidth = 2;
    c.beginPath(); c.moveTo(nose, cy); c.lineTo(tail, cy - span); c.lineTo(tail + 12, cy); c.lineTo(tail, cy + span); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(nose, cy); c.lineTo(tail + 12, cy); c.stroke();
    // tilted back edges (flaps)
    const flap = Math.min(1, Math.abs(d.tilt) / 12);
    c.fillStyle = d.tilt >= 0 ? acc : ML.cssVar("--rl"); c.globalAlpha = 0.25 + 0.75 * flap;
    c.fillRect(tail + 1, cy - span + 4, 7, span * 0.55); c.fillRect(tail + 1, cy + span * 0.45 - 4, 7, span * 0.55);
    c.globalAlpha = 1;
    // clips
    c.fillStyle = "#6b7280";
    for (let i = 0; i < Math.round(d.clips); i++) c.fillRect(nose - 16 - i * 8, cy - 4, 5, 8);
    // lift point and balance point (static margin exaggerated ×3 so it's visible)
    const liftX = cx + 8, comX = liftX + e.sm * len * 3;
    c.strokeStyle = acc; c.fillStyle = acc; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(liftX, cy + 4); c.lineTo(liftX, cy - 26); c.stroke();
    c.beginPath(); c.moveTo(liftX - 5, cy - 20); c.lineTo(liftX, cy - 28); c.lineTo(liftX + 5, cy - 20); c.fill();
    c.fillStyle = ink; c.beginPath(); c.arc(comX, cy, 6, 0, 7); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.moveTo(comX, cy); c.arc(comX, cy, 6, 0, Math.PI / 2); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(comX, cy); c.arc(comX, cy, 6, Math.PI, Math.PI * 1.5); c.closePath(); c.fill();
    c.font = "800 10px Nunito, sans-serif"; c.textAlign = "center";
    c.fillStyle = acc; c.fillText("lift", liftX, cy - 31);
    c.fillStyle = ink; c.fillText("balance", comX, cy + 18);
    // side view on the right
    drawPlane(c, 236, 52, 0, d, 60, ML.cssVar("--sup"), { keel: ML.isDark() ? "#3b4170" : "#fff" });
    c.fillStyle = mut; c.fillText("side view", 236, 84);
    // verdict
    const stable = e.sm > 0.004;
    c.textAlign = "left"; c.font = "800 11px Nunito, sans-serif";
    c.fillStyle = stable ? ML.cssVar("--good") : ML.cssVar("--bad");
    c.fillText(stable ? "Balance ahead of lift: steady" : "Balance behind lift: it will flip!", 8, h - 26);
    c.fillStyle = mut;
    c.fillText(stable ? `Settles nose-up about ${Math.round(e.trimDeg)}°${e.trimDeg > 13 ? " (stall zone!)" : e.trimDeg < 2 ? " (dives fast)" : ""}` : "Add nose weight to fix it", 8, h - 10);
  }

  // ---------- scene ----------
  function sky() {
    const dark = ML.isDark();
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, dark ? "#1c2150" : "#9fd8ff"); g.addColorStop(1, dark ? "#323a72" : "#e6f6ff");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dark ? "#2f5a3e" : "#8fd09c"; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = dark ? "#264a33" : "#7bc88f"; ctx.fillRect(0, GROUND, W, 5);
    // ruler
    ctx.fillStyle = dark ? "rgba(255,255,255,.75)" : "rgba(31,33,64,.7)";
    ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "center";
    for (let x = 10; x < FIELD; x += 10) {
      ctx.fillRect(sx(x) - 1, GROUND + 5, 2, 7);
      ctx.fillText(x + " m", sx(x), GROUND + 24);
    }
    // the little hill and the thrower
    ctx.fillStyle = dark ? "#3c6e4c" : "#9ed9a8";
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(0, sy(LAUNCH_H)); ctx.lineTo(sx(1.2), sy(LAUNCH_H)); ctx.quadraticCurveTo(sx(3.5), sy(LAUNCH_H), sx(5.5), GROUND); ctx.closePath(); ctx.fill();
    const fx = sx(0.2), fy = sy(LAUNCH_H);
    ctx.strokeStyle = dark ? "#e8eaff" : "#2a2d44"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(fx, fy - 24, 4.5, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx, fy - 19); ctx.lineTo(fx, fy - 8); ctx.moveTo(fx, fy - 8); ctx.lineTo(fx - 4, fy); ctx.moveTo(fx, fy - 8); ctx.lineTo(fx + 4, fy);
    ctx.moveTo(fx, fy - 16); ctx.lineTo(fx + 7, fy - 21); ctx.stroke();
  }
  function obstacles(t) {
    const dark = ML.isDark();
    if (state.rules.cave) {
      ctx.fillStyle = dark ? "#4a4658" : "#8d8476";
      ctx.beginPath(); ctx.moveTo(sx(0), 0);
      for (let x = 0; x <= FIELD; x += 1) ctx.lineTo(sx(x), sy(C.ceilAt(x)));
      ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark ? "#3a3747" : "#766e62";
      for (let x = 3; x <= FIELD; x += 4.3) { const y = sy(C.ceilAt(x)); ctx.beginPath(); ctx.moveTo(sx(x) - 5, y - 1); ctx.lineTo(sx(x), y + 8 + (x * 7) % 6); ctx.lineTo(sx(x) + 5, y - 1); ctx.fill(); }
    }
    if (state.rules.pad) {
      const a = sx(PAD_X - PAD_HALF), b = sx(PAD_X + PAD_HALF);
      ctx.fillStyle = "#ffd23f"; ctx.fillRect(a, GROUND - 4, b - a, 8);
      ctx.fillStyle = "#e53935"; ctx.fillRect(sx(PAD_X) - 3, GROUND - 4, 6, 8);
      ctx.strokeStyle = dark ? "#fff" : "#2a2d44"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx(PAD_X), GROUND - 4); ctx.lineTo(sx(PAD_X), GROUND - 34); ctx.stroke();
      ctx.fillStyle = "#e53935"; ctx.beginPath(); ctx.moveTo(sx(PAD_X), GROUND - 34); ctx.lineTo(sx(PAD_X) + 16, GROUND - 29); ctx.lineTo(sx(PAD_X), GROUND - 24); ctx.fill();
    }
    if (state.rules.wind) {
      ctx.strokeStyle = dark ? "rgba(255,255,255,.35)" : "rgba(40,90,140,.35)"; ctx.lineWidth = 2; ctx.lineCap = "round";
      const k = reduce() ? 0 : t;
      for (let i = 0; i < 14; i++) {
        const yy = 30 + ((i * 53) % (GROUND - 60));
        const xx = W - ((k * 140 + i * 97) % (W + 80));
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 34, yy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 6, yy - 4); ctx.stroke();
      }
    }
  }
  function flagAt(dist, col, text, row) {
    const x = sx(Math.min(FIELD, dist));
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, GROUND - 26 - row * 16); ctx.stroke();
    ctx.font = "800 10px Nunito, sans-serif";
    const tw = ctx.measureText(text).width + 10, left = Math.min(x, W - tw - 4);
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(left, GROUND - 38 - row * 16, tw, 14, 5); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(text, left + 5, GROUND - 28 - row * 16);
  }
  const idxAt = (r, tau) => Math.min(r.n - 1, Math.max(0, Math.floor(tau * 30)));
  function trail(r, i, col, alpha, wd) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineJoin = "round";
    ctx.beginPath();
    for (let k = 0; k <= i; k += 1) { const X = sx(r.px[k]), Y = sy(r.py[k]); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  function endMark(r, col) {
    const x = sx(Math.min(FIELD, r.px[r.n - 1])), y = sy(r.py[r.n - 1]);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    if (r.why === "ceiling") { ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, Math.min(GROUND, y), 2.5, 0, 7); ctx.stroke(); }
  }
  function label(text) {
    ctx.font = "800 13px Nunito, sans-serif";
    const tw = ctx.measureText(text).width + 24;
    ctx.fillStyle = "rgba(31,33,64,.72)";
    ctx.beginPath(); ctx.roundRect(10, 10, Math.min(W - 20, tw), 28, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(text, 22, 29);
  }
  // one plane in flight: trail + picture
  function flyer(r, d, tau, col, size, alpha, trailAlpha, bug) {
    const i = idxAt(r, tau);
    trail(r, i, col, trailAlpha, size > 20 ? 2.5 : 1.2);
    if (i >= r.n - 1) endMark(r, col);
    drawPlane(ctx, sx(r.px[i]), Math.min(GROUND - 2, sy(r.py[i])), screenAngle(r.pth[i]), d, size, col, { alpha, bug });
    return i;
  }

  function draw(t) {
    sky();
    obstacles(t / 1000);
    if (state.youBest > 0) flagAt(state.youBest, "#2fbf62", `Your best ${m(state.youBest)}`, 0);
    if (state.bestEver && !state.rules.pad) flagAt(state.bestEver.dist, "#ff5c9a", `Flock best ${m(state.bestEver.dist)}`, 1);
    if (state.mode === "you" && state.you) {
      const y = state.you;
      flyer(y.res, y.design, y.tau, "#2fbf62", 30, 1, 0.9, state.rules.pad);
      label(y.tau >= y.res.time ? `Your throw: ${m(y.res.dist)}` : "Your throw…");
    } else if (state.mode === "replay" && state.replay) {
      const r = state.replay;
      flyer(r.res, r.design, r.tau, "#ff5c9a", 30, 1, 0.9, state.rules.pad);
      label(`Throwing ${r.label} again${r.tau >= r.res.time ? ": " + m(r.res.dist) : "…"}`);
    } else if (state.mode === "flock" && state.order) {
      const ev = state.ev, champ = state.order[0];
      if (state.ghosts) for (let k = state.order.length - 1; k > 0; k--) {
        const i = state.order[k];
        flyer(ev.results[i], designFrom(ev.pop[i].genes), state.tau, "#5b8cff", 14, 0.55, 0.22, false);
      }
      const r = ev.results[champ];
      const i = flyer(r, designFrom(ev.pop[champ].genes), state.tau, "#ff5c9a", 26, 1, 0.9, state.rules.pad);
      // crown on the champion
      if (i < r.n - 1) {
        const X = sx(r.px[i]), Y = sy(r.py[i]) - 18;
        ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#c98f00"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(X - 6, Y + 4); ctx.lineTo(X - 6, Y - 2); ctx.lineTo(X - 2.5, Y + 1); ctx.lineTo(X, Y - 4); ctx.lineTo(X + 2.5, Y + 1); ctx.lineTo(X + 6, Y - 2); ctx.lineTo(X + 6, Y + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      label(`Generation ${ev.gen} · ${state.ghosts ? "40 planes" : "the champion"} in the air`);
    } else if (state.mode === "flock") {
      label(`Generation ${state.ev.gen}: folding 40 planes…`);
    } else {
      label("Design your plane, then press Throw!");
      drawPlane(ctx, sx(0.6) + 6, sy(LAUNCH_H + 1.2), screenAngle((design.angle * Math.PI) / 180), design, 30, "#2fbf62", { bug: state.rules.pad });
    }
  }

  // ---------- flock: evolution loop ----------
  function newFlock(seed) {
    state.ev = new C.Evolution(seed, POP);
    state.phase = "eval"; state.evalI = 0; state.order = null; state.tau = 0;
  }
  function stepEval(budget) {
    const t0 = performance.now();
    while (state.evalI < POP && performance.now() - t0 < budget) {
      const to = Math.min(POP, state.evalI + 4);
      state.ev.evaluate(state.rules, state.evalI, to);
      state.evalI = to;
    }
    if (state.evalI >= POP) {
      state.order = state.ev.ranking();
      state.endT = Math.min(14, Math.max(...state.ev.results.map((r) => r.time)));
      state.tau = reduce() ? state.endT : 0;
      state.hold = 0;
      state.phase = "show";
      return true;
    }
    return false;
  }
  function finishGen() {
    const ev = state.ev, order = state.order;
    const top = order.slice(0, POP / 2);
    const champ = ev.pop[order[0]], r = ev.results[order[0]];
    const avg = top.reduce((s, i) => s + ev.results[i].dist, 0) / top.length;
    const padPct = (ev.results.filter(C.onPad).length / POP) * 100;
    state.hist.best.push(+r.dist.toFixed(1));
    state.hist.avg.push(+avg.toFixed(1));
    state.hist.pad.push(Math.round(padPct));
    state.champ = { id: champ.id, genes: champ.genes.slice(), res: r, gen: ev.gen, rules: { ...state.rules } };
    if (!state.rules.wind && !state.rules.cave && !state.rules.pad && (!state.bestEver || r.dist > state.bestEver.dist)) state.bestEver = { dist: r.dist, gen: ev.gen };
    state.treeId = champ.id;
    const d = designFrom(champ.genes);
    const sub = state.rules.pad ? (C.softOnPad(r) ? "soft on the pad!" : C.onPad(r) ? "on the pad (bumpy)" : `missed by ${m(Math.abs(r.dist - PAD_X))}`)
      : r.why === "ceiling" ? `${m(r.dist)} (bonked the roof)` : m(r.dist);
    ckpts.add({ label: `Gen ${ev.gen}`, sub: `<small>${sub}</small>`, design: d, res: r, rules: { ...state.rules }, draw: (cv) => drawThumb(cv, r, d) });
    narrateGen(r, avg, padPct);
    checkChallenges(r, padPct);
    drawChart(); drawTree();
    ev.breed(state.mutation, state.injectNext ? { inject: state.injectNext } : {});
    if (state.injectNext) { state.injectNext = null; ML.toast(`${ML.icon("plus")} Your plane joined generation ${ev.gen}!`); }
    state.phase = "eval"; state.evalI = 0; state.order = null; state.tau = 0;
    state.dirty = true;
  }

  function narrateGen(r, avg, padPct) {
    const n = state.hist.best.length;
    const busy = state.speed === 0;
    if (!state.celebrated && !state.rules.wind && !state.rules.cave && !state.rules.pad && avg >= 45) {
      state.celebrated = true;
      ML.confetti();
      ML.say(`Wow! After <b>${n}</b> generations the best half of the flock glides <b>${m(avg)}</b> on average. In generation 1 most planes flipped or stalled. Nobody told them how to fold a plane!`);
      ML.xray.offer("The flock learned to fly! X-ray the landscape");
      return;
    }
    if (!state.beatYou && state.youBest > 0 && !state.rules.pad && r.dist > state.youBest) {
      state.beatYou = true;
      ML.toast(`${ML.icon("trophy")} The flock beat your ${m(state.youBest)}!`);
      ML.say(`Generation ${n}'s champion flew <b>${m(r.dist)}</b>, further than your best throw of ${m(state.youBest)}. Can you fold a better one? Its design is in the checkpoints, and its genes are in "What's happening inside".`);
      return;
    }
    if (busy) return;
    if (n === 1) ML.say(`Generation 1: 40 random planes. The champion flew <b>${m(r.dist)}</b>, but the best half only managed <b>${m(avg)}</b> on average. Now the best become parents…`);
    else if (n === 2) ML.say(`Generation 2 is made of babies of the best planes: mixed genes plus small random nudges. Watch the chart!`);
    else if (n % 4 === 0 && !Object.keys(state.pending).length) {
      const s = C.explain(designFrom(state.champ.genes));
      ML.say(`Generation ${n}: champion <b>${m(r.dist)}</b>, best-half average <b>${m(avg)}</b>. The champion settles about <b>${Math.round(s.trimDeg)}°</b> nose-up, close to the best gliding angle (about 4°).`);
    }
  }

  // ---------- challenges ----------
  const LABELS = { wind: "Headwind", cave: "Low cave roof", pad: "Land on the pad" };
  const TELLS = {
    wind: "A gusty wind blows <b>towards</b> the thrower, about as fast as a paper plane glides!",
    cave: "Now there's a rocky roof that gets lower further in. Climb too high and… bonk.",
    pad: "Forget distance: land on the yellow pad at 30 m, gently, so the ladybug passenger is happy.",
  };
  // what "beating" a challenge means, given everything else that's switched on
  const goal = (c) => state.rules.pad ? (c === "pad" ? "land softly on the pad" : "land on the pad")
    : c === "wind" ? "fly 27 m into the wind" : `fly ${state.rules.wind ? 25 : 40} m under the roof`;
  const TRY = {
    wind: "compare the champion's <b>Wing size</b> gene in \"What's happening inside\" with before the wind. Small, heavy planes glide faster and punch through. Then switch the wind off: do they stretch out again?",
    cave: "look at the <b>Throw speed</b> and <b>Throw angle</b> genes. The flock learned to throw gently and flat. Can you fold a plane that stays under the roof?",
    pad: "press <b>Add my plane to the flock</b>, then look for a green plane in the family tree in a few generations. Did your genes survive?",
  };
  function conquered(c, r) {
    if (r.why === "ceiling") return false;
    if (state.rules.pad) return c === "pad" ? C.softOnPad(r) : C.onPad(r);
    return c === "wind" ? r.dist >= 27 : r.dist >= (state.rules.wind ? 25 : 40);
  }
  function checkChallenges(r, padPct) {
    for (const c of Object.keys(state.pending)) {
      const p = state.pending[c];
      p.gens++;
      if (p.gens === 1 && p.before && !state.done[c]) {
        const now = c === "pad" ? `${Math.round(padPct)}% of the flock on the pad` : m(r.dist);
        ML.say(`Ouch! With <b>${LABELS[c].toLowerCase()}</b> the champion managed ${now}${c !== "pad" ? ` (before: ${m(p.before)})` : ""}. The old designs don't fit any more. Let's see if the flock adapts…`);
      }
      if (conquered(c, r)) {
        delete state.pending[c];
        if (!state.done[c]) {
          state.done[c] = true;
          document.querySelector(`#chal [data-c="${c}"]`).classList.add("done");
          ML.confetti(70);
          ML.toast(`${ML.icon("trophy")} Challenge done: ${LABELS[c]}!`);
          const msg = p.gens === 1 ? `Easy! The flock already had a plane that can ${goal(c)}: lucky variety pays off.` : `They adapted! After <b>${p.gens}</b> generations the champion can ${goal(c)} (${c === "pad" ? "landed at " + m(r.dist) + ", " + r.impact.toFixed(1) + " m/s" : m(r.dist)}). Nobody re-designed them: the new rules just picked new parents.`;
          ML.say(`${msg} <b>Try this:</b> ${TRY[c]}`);
          showTry(c);
        }
      } else if (p.gens === 40) {
        ML.say(`${LABELS[c]} is tough! The flock improved, but hasn't managed to ${goal(c)} yet. Try bigger <b>Random nudges</b> so babies explore wilder designs.`);
      }
    }
  }
  function showTry(c) {
    const el = $("#try");
    el.innerHTML = `${ML.icon("bulb")} <b>Try this:</b> ${TRY[c]}`;
    el.classList.remove("hidden");
  }
  document.querySelectorAll("#chal [data-c]").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    state.rules[c] = !state.rules[c];
    const on = state.rules[c];
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    state.markers.push({ at: state.hist.best.length, label: `${LABELS[c]} ${on ? "on" : "off"}` });
    if (c === "pad" && on) { state.padUsed = true; $("#lg-pad").classList.remove("hidden"); }
    drawChart(); drawBlueprint();
    // the generation in the air is thrown again under the new rules, so every score matches its rules
    if (state.ev) { state.phase = "eval"; state.evalI = 0; state.order = null; state.tau = 0; }
    if (on) {
      const last = state.hist.best.slice(-3);
      state.pending[c] = { before: last.length ? last.reduce((a, v) => a + v, 0) / last.length : 0, gens: 0 };
      ML.say(`<b>${LABELS[c]}</b>! ${TELLS[c]} ${state.hist.best.length >= 3 ? "It starts next generation. Press <b>Play</b> and watch the chart." : "You can try it with your own plane first, or switch it on after the flock has learned to fly."}`);
    } else { delete state.pending[c]; ML.say(`${LABELS[c]} switched off. Watch the flock settle back.`); }
    if (state.mode === "you" && state.you) throwYours(true);
  }));

  // ---------- your throw ----------
  function throwYours(silent) {
    state.lastAct = performance.now();
    if (state.playing) { state.playing = false; syncPlay(); }
    state.replay = null; ckpts.active = null; ckpts.render();
    const d = { ...design };
    const res = C.simulate(d, state.rules);
    state.you = { design: d, res, tau: reduce() ? res.time : 0, said: !!silent };
    state.mode = "you";
    if (!silent) state.throws++;
    state.dirty = true;
  }
  function afterThrow() {
    const y = state.you, r = y.res, d = y.design, e = C.explain(d);
    const rules = state.rules;
    let msg;
    const record = !rules.wind && !rules.cave && !rules.pad && r.dist > state.youBest + 0.05;
    if (r.why === "ceiling") msg = `Bonk! It hit the cave roof after ${m(r.dist)}. Throw flatter or softer, or use less wing tilt so it doesn't climb.`;
    else if (r.why === "backwards") msg = `Whoosh! The headwind blew it <b>backwards</b>. Big light wings catch the wind. Try smaller wings and more nose weight so it glides faster.`;
    else if (e.sm <= 0.004) msg = `It tumbled after ${m(r.dist)}! With so little nose weight the <b>balance point</b> sits behind the <b>lift point</b>, so the nose flips up. Add a paper clip.`;
    else if (r.stallT > 1.2) msg = `It flew ${m(r.dist)}, but it <b>stalled</b>: the nose pointed up too steeply, the air stopped flowing smoothly over the wing and it dropped. Try less <b>Wing tilt</b> or more <b>Nose weight</b>.`;
    else if (r.time < 3 && r.dist < 25) msg = `It dived into the ground after ${m(r.dist)}. The nose is too heavy for the tilt. Add a little <b>Wing tilt</b> or take off a clip.`;
    else if (rules.pad) msg = C.softOnPad(r) ? `Perfect! A soft landing right on the pad (${r.impact.toFixed(1)} m/s). The ladybug says thanks!` : C.onPad(r) ? `On the pad, but a hard bump (${r.impact.toFixed(1)} m/s). Land gentler: a slower glide with bigger wings.` : `Landed at ${m(r.dist)}: ${r.dist < PAD_X ? "short" : "long"} by ${m(Math.abs(r.dist - PAD_X))}. ${r.dist < PAD_X ? "Throw a little harder or tilt less." : "Throw softer or flatter."}`;
    else msg = `A smooth glide: <b>${m(r.dist)}</b> in ${r.time.toFixed(1)} s.${r.dist < 45 ? " Change one slider at a time to see what helps." : " That's a great design!"}`;
    if (record) {
      const first = state.youBest === 0;
      state.youBest = r.dist;
      if (!first) ML.toast(`${ML.icon("star")} New personal best: ${m(r.dist)}!`);
      if (r.dist >= 45 && !state.done.ace) { state.done.ace = true; ML.confetti(50); msg += " <b>Ace pilot!</b> Over 45 m."; }
    }
    if (rules.pad && C.softOnPad(r) && !state.done.youPad) { state.done.youPad = true; ML.confetti(60); }
    if (rules.wind && r.dist >= 20 && !state.done.youWind) { state.done.youWind = true; ML.confetti(50); msg += " You beat the wind!"; }
    if (rules.cave && r.dist >= 35 && r.why !== "ceiling" && !state.done.youCave) { state.done.youCave = true; ML.confetti(50); msg += " Cave pilot!"; }
    const next = state.hist.best.length === 0 && state.throws >= 2 ? " When you're ready, press <b>Play</b> to see if 40 evolving planes can beat you." : "";
    ML.say(msg + next);
    $("#last-throw").innerHTML = `Last throw: <b>${m(r.dist)}</b>${state.youBest ? ` · your best ${m(state.youBest)}` : ""}`;
    state.dirty = true;
  }

  $("#throw").addEventListener("click", () => throwYours(false));
  $("#inject").addEventListener("click", () => {
    state.lastAct = performance.now();
    state.injectNext = C.encode(design);
    state.injected = true;
    ML.toast(`${ML.icon("plus")} Your plane will join the next generation`);
    ML.say(`Your design will join the flock next generation as an immigrant, drawn <b style="color:var(--good)">green</b> in the family tree if it becomes an ancestor. Press <b>Play</b>!`);
  });

  // ---------- checkpoints + replay ----------
  function drawThumb(cv, r, d) {
    const c = cv.getContext("2d"), w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    const gx = (x) => 8 + (x / FIELD) * (w - 16), gy = (y) => h - 14 - y * ((w - 16) / FIELD) * 2;
    c.fillStyle = ML.isDark() ? "#2f5a3e" : "#8fd09c"; c.fillRect(0, h - 14, w, 14);
    c.strokeStyle = "#ff5c9a"; c.lineWidth = 2.5; c.lineJoin = "round";
    c.beginPath(); for (let k = 0; k < r.n; k += 2) { const X = gx(r.px[k]), Y = gy(r.py[k]); k ? c.lineTo(X, Y) : c.moveTo(X, Y); } c.stroke();
    drawPlane(c, 40, 30, 0, d, 46, "#ff5c9a", { keel: ML.isDark() ? "#3b4170" : "#fff" });
  }
  const ckpts = new GameLab.Checkpoints($("#ckpts"), (ck) => startReplay(ck.design, ck.label), () => backToFlock());
  function startReplay(d, lbl) {
    state.lastAct = performance.now();
    if (state.playing) { state.playing = false; syncPlay(); }
    const res = C.simulate(d, state.rules);
    state.replay = { design: d, res, label: lbl, tau: reduce() ? res.time : 0, said: false };
    state.mode = "replay";
    $("#scene").scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" });
  }
  function backToFlock() {
    state.replay = null;
    state.mode = state.ev && (state.hist.best.length || state.order) ? "flock" : "you";
  }

  // ---------- family tree ----------
  const HOW_COL = { random: "#9aa0b8", yours: "#2fbf62", mix: "#8b5cf6", copy: "#3b82f6", kept: "#ff5c9a" };
  let treeHits = [];
  function resolveKept(node) {
    let n = node, kept = 0;
    while (n && n.how === "kept" && n.parents.length && state.ev.tree.get(n.parents[0])) { n = state.ev.tree.get(n.parents[0]); kept++; }
    return { n, kept };
  }
  function drawTree() {
    const c = treeCv.ctx, w = treeCv.w, h = treeCv.h;
    c.clearRect(0, 0, w, h);
    treeHits = [];
    const ink = ML.cssVar("--ink"), mut = ML.cssVar("--muted");
    if (!state.treeId || !state.ev.tree.get(state.treeId)) {
      c.fillStyle = mut; c.font = "700 14px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText("Press Play. After the first generation the champion's family appears here.", w / 2, h / 2);
      return;
    }
    const LEVELS = 4, rowH = (h - 20) / LEVELS;
    const place = (node, kept, lvl, slot, px, py) => {
      const n = 1 << lvl, x = ((slot + 0.5) / n) * w, y = h - 34 - lvl * rowH;
      if (px !== undefined) { c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 2; c.beginPath(); c.moveTo(px, py - 16); c.lineTo(x, y + 18); c.stroke(); }
      if (lvl + 1 < LEVELS) {
        node.parents.slice(0, 2).forEach((pid, k) => {
          const p = state.ev.tree.get(pid);
          if (!p) return;
          const rk = resolveKept(p);
          place(rk.n, rk.kept, lvl + 1, slot * 2 + (node.parents.length === 1 ? 0.5 : k), x, y);
        });
      }
      const how = node.how.split("+")[0], col = HOW_COL[how] || "#3b82f6";
      c.fillStyle = col; c.globalAlpha = 0.18; c.beginPath(); c.arc(x, y, 17, 0, 7); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = col; c.lineWidth = lvl === 0 ? 3.5 : 2.5; c.beginPath(); c.arc(x, y, 17, 0, 7); c.stroke();
      drawPlane(c, x, y + 2, 0, designFrom(node.genes), 24, col, { keel: ML.isDark() ? "#3b4170" : "#fff" });
      if (node.how.includes("+mut")) { c.fillStyle = "#ffb000"; c.font = "900 13px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("✦", x + 15, y - 10); }
      c.font = "800 10px Nunito, sans-serif"; c.textAlign = "center"; c.fillStyle = ink;
      c.fillText(`G${node.gen}${node.dist != null ? " · " + m(node.dist) : ""}`, x, y + 29);
      if (kept) { c.fillStyle = HOW_COL.kept; c.fillText(`kept ×${kept}`, x, y - 21); }
      treeHits.push({ x, y, node });
    };
    const root = resolveKept(state.ev.tree.get(state.treeId));
    place(root.n, root.kept, 0, 0);
    c.fillStyle = mut; c.font = "800 11px Nunito, sans-serif"; c.textAlign = "left";
    c.fillText("Champion ↓   ·   older generations ↑", 8, h - 6);
  }
  $("#tree").addEventListener("click", (e) => {
    const p = ML.canvasPoint($("#tree"), e, treeCv.w, treeCv.h);
    const hit = treeHits.find((t) => Math.hypot(t.x - p.x, t.y - p.y) < 22);
    if (!hit) return;
    ckpts.active = null; ckpts.render();
    startReplay(designFrom(hit.node.genes), `the G${hit.node.gen} ancestor`);
    const how = hit.node.how;
    ML.say(`This ancestor was born in generation ${hit.node.gen} as ${how.startsWith("random") ? "a <b>random</b> plane" : how.startsWith("yours") ? "<b>your design</b>" : how.startsWith("mix") ? "a <b>mix of two parents</b>" : how.startsWith("kept") ? "an <b>unchanged champion</b>" : "a <b>copy of one parent</b>"}${how.includes("+mut") ? " with a random nudge" : ""}. Here it flies with today's rules.`);
  });

  // ---------- chart ----------
  function drawChart() {
    const series = [{ values: state.hist.best, color: "--rl" }, { values: state.hist.avg, color: "--lang" }];
    if (state.padUsed) series.push({ values: state.hist.pad, color: "--good" });
    GameLab.drawChart(chartCv, series, state.markers, 100);
  }

  // ---------- "what's happening inside" ----------
  const short = (k, v) => k === "wing" ? v.toFixed(1) + "×" : k === "clips" ? (Math.round(v * 2) / 2).toString() : k === "speed" ? v.toFixed(1) : Math.round(v) + "°";
  function geneRows(genes, youGenes) {
    const sp = state.ev.spread();
    return `<div class="genes">${GENES.map((g, i) => {
      const s = sp[i], v = g.min + (g.max - g.min) * genes[i];
      const you = youGenes ? `<span class="you" style="left:${(youGenes[i] * 100).toFixed(1)}%" title="Your design"></span>` : "";
      return `<div class="gene"><span>${g.name}</span><span class="tr"><span class="rng" style="left:${(s.lo * 100).toFixed(1)}%;width:${Math.max(2, (s.hi - s.lo) * 100).toFixed(1)}%"></span>${you}<span class="dot" style="left:${(genes[i] * 100).toFixed(1)}%"></span></span><span class="num">${short(g.key, v)}</span></div>`;
    }).join("")}</div>`;
  }
  function readout(r, i) {
    const a = (r.pa[i] * 180) / Math.PI, stall = Math.abs(a) > 14;
    const lw = Math.round(r.pl[i] * 100);
    const what = i >= r.n - 1 ? "landed" : stall ? "STALLED: lift collapses" : lw > 105 ? "climbing (lift beats weight)" : lw < 70 ? "falling (not enough lift)" : "gliding";
    return `<div class="readout">
      <div><small>Air speed</small>${r.pv[i].toFixed(1)} m/s</div>
      <div class="${stall ? "stall" : ""}"><small>Nose vs airflow</small>${a.toFixed(0)}°${stall ? " stall!" : ""}</div>
      <div><small>Lift ÷ weight</small>${lw}%</div>
      <div><small>Height</small>${Math.max(0, r.py[i]).toFixed(1)} m</div>
    </div><div class="recipe" style="margin-top:6px">${ML.icon("eye")} Right now: <b>${what}</b></div>`;
  }
  function renderInside() {
    const host = $("#inside");
    if (state.mode === "you" || (state.mode === "replay" && state.replay)) {
      const f = state.mode === "you" ? state.you : state.replay;
      if (!f) { host.innerHTML = `<span class="muted">Press <b>Throw!</b> to watch the forces on your plane, live.</span>`; return; }
      const e = C.explain(f.design);
      host.innerHTML = `<div class="inside-sub">Live forces</div>${readout(f.res, idxAt(f.res, f.tau))}
        <div class="inside-sub">Why it flies like that</div>
        <div class="recipe">${e.sm > 0.004 ? `${ML.icon("check")} Balance point ahead of the lift point, so it steers itself back to about <b>${Math.round(e.trimDeg)}°</b> nose-up${e.trimDeg > 13 ? ", <b>past the 14° stall angle</b>." : e.trimDeg < 2 ? ", which is nearly a dive." : ". Best gliding is near 4°."}` : `${ML.icon("x")} Balance point <b>behind</b> the lift point: nothing stops the nose flipping up.`}
        Weight per wing area: <b>${e.loading.toFixed(1)}</b> (heavier = faster glide).</div>`;
      return;
    }
    if (!state.ev || (!state.order && !state.champ)) { host.innerHTML = `<span class="muted">Press <b>Play</b> to start the flock.</span>`; return; }
    const ev = state.ev;
    const showing = state.order ? ev.pop[state.order[0]] : null;
    const genes = showing ? showing.genes : state.champ.genes;
    const counts = { kept: 0, mix: 0, copy: 0, mut: 0, yours: 0, random: 0 };
    ev.pop.forEach((p) => { counts[p.how.split("+")[0]]++; if (p.how.includes("+mut")) counts.mut++; });
    const r = state.order ? ev.results[state.order[0]] : null;
    host.innerHTML = `<div class="inside-sub">Champion's genes <span style="text-transform:none;letter-spacing:0">(shaded = range in the flock${state.injected || state.throws ? ", green line = yours" : ""})</span></div>
      ${geneRows(genes, state.throws ? C.encode(design) : null)}
      <div class="inside-sub">Generation ${ev.gen} was made by</div>
      <div class="recipe">${ev.gen === 1 ? `${ML.icon("dice")} <b>40 random</b> planes. No parents yet.` :
        `${ML.icon("trophy")} <b>${counts.kept}</b> champions kept unchanged<br>${ML.icon("shuffle")} <b>${counts.mix}</b> mixes of two parents<br>${ML.icon("layers")} <b>${counts.copy}</b> copies of one parent${counts.yours ? `<br>${ML.icon("plus")} <b>1</b> of your design` : ""}<br>${ML.icon("sparkles")} <b>${counts.mut}</b> got a random nudge`}</div>
      ${r ? `<div class="inside-sub">Champion in flight</div>${readout(r, idxAt(r, state.tau))}` : ""}`;
  }
  function renderStats() {
    $("#st-gen").textContent = state.ev ? state.ev.gen : 1;
    const b = state.hist.best;
    $("#st-best").innerHTML = state.order ? `${Math.round(state.ev.results[state.order[0]].dist)}<small> m</small>` : b.length ? `${Math.round(b[b.length - 1])}<small> m</small>` : "–";
    $("#st-ever").innerHTML = state.bestEver ? `${Math.round(state.bestEver.dist)}<small> m</small>` : "–";
    $("#st-you").innerHTML = state.youBest ? `${Math.round(state.youBest)}<small> m</small>` : "–";
  }

  // ---------- main loop ----------
  let last = performance.now(), tick = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.mode === "you" && state.you) {
      const y = state.you;
      if (y.tau < y.res.time) y.tau = Math.min(y.res.time, y.tau + dt * 1.5);
      else if (!y.said) { y.said = true; afterThrow(); }
    } else if (state.mode === "replay" && state.replay) {
      const r = state.replay;
      if (r.tau < r.res.time + 1.6) r.tau += dt * 1.5;
      if (r.tau >= r.res.time && !r.said) { r.said = true; ML.say(`${r.label[0].toUpperCase() + r.label.slice(1)} flew <b>${m(r.res.dist)}</b> with today's rules${r.res.why === "ceiling" ? " before bonking the roof" : ""}. Tap <b>Back to live</b> or press <b>Play</b> to return to the flock.`); }
      if (r.tau >= r.res.time + 1.6) r.tau = reduce() ? r.res.time : 0;
    } else if (state.mode === "flock" && state.playing) {
      if (state.speed === 0) { // turbo: breed generations back to back for ~12 ms per frame
        const t0 = performance.now();
        while (performance.now() - t0 < 12) {
          if (state.phase === "eval") stepEval(12);
          if (state.phase === "show") { state.tau = state.endT; if (performance.now() - t0 < 12) finishGen(); else break; }
        }
      } else if (state.phase === "eval") stepEval(8);
      else {
        state.tau += dt * state.speed;
        if (reduce()) state.hold += dt;
        if (state.tau >= state.endT + 0.4 && (!reduce() || state.hold > 1.2)) finishGen();
      }
    }
    draw(now);
    if (++tick % 6 === 0 || state.dirty) { renderInside(); renderStats(); state.dirty = false; }
    requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  const playBtn = $("#play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; playBtn.setAttribute("aria-label", state.playing ? "Pause evolution" : "Play evolution"); }
  function togglePlay() {
    state.lastAct = performance.now();
    state.replay = null; ckpts.active = null; ckpts.render();
    const first = !state.hist.best.length && state.mode !== "flock";
    state.mode = "flock";
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && first) ML.say(`Off they go! <b>40 random planes</b>, thrown at once. The pink one with the crown is this generation's champion.${state.youBest ? ` Your best is the green flag at ${m(state.youBest)}.` : ""}`);
  }
  playBtn.addEventListener("click", togglePlay);
  function skipGen() {
    state.lastAct = performance.now();
    state.replay = null; ckpts.active = null; ckpts.render();
    state.mode = "flock";
    if (state.phase === "eval") while (!stepEval(1000));
    finishGen();
    stepEval(1000);
    if (!state.playing || reduce()) state.tau = state.endT; // paused: show the new generation's finished flights
  }
  $("#skip").addEventListener("click", skipGen);
  $("#reset").addEventListener("click", () => {
    state.lastAct = performance.now();
    state.seed = Math.floor(Math.random() * 1e6);
    newFlock(state.seed);
    state.hist = { best: [], avg: [], pad: [] }; state.markers = []; state.pending = {};
    state.bestEver = null; state.champ = null; state.treeId = null; state.celebrated = false; state.beatYou = false;
    for (const c of Object.keys(LABELS)) if (state.rules[c] && !state.done[c]) state.pending[c] = { before: 0, gens: 0 };
    state.padUsed = !!state.rules.pad; $("#lg-pad").classList.toggle("hidden", !state.padUsed);
    ckpts.clear(); drawChart(); drawTree();
    ML.say("A brand-new random flock. Everything it learned is gone! Your challenges stay switched on.");
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    state.lastAct = performance.now();
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
    if (state.speed === 0) ML.say("Turbo! No flying pictures, just breeding. Watch the chart and the checkpoints fill up.");
  }));
  ML.bindRange("#mut", (v) => v.toFixed(2), (v) => (state.mutation = v));
  $("#ghosts").addEventListener("change", (e) => { state.ghosts = e.target.checked; });

  // keyboard: Space throws, P plays/pauses, N skips a generation
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t && t.closest && t.closest("input, textarea, select, dialog")) return;
    if (e.code === "Space" && !(t && t.closest && t.closest("button, a, summary"))) { e.preventDefault(); throwYours(false); }
    else if (e.key === "p" || e.key === "P") { e.preventDefault(); togglePlay(); }
    else if (e.key === "n" || e.key === "N") { e.preventDefault(); skipGen(); }
  });
  ["pointerdown", "keydown", "input"].forEach((ev) => document.addEventListener(ev, () => (state.lastAct = performance.now()), { passive: true }));

  // nudge after ~15 s idle, pointing at the next step
  function nextStep() {
    if (state.mode === "replay") return `Tap <b>Back to live</b> in the checkpoints row, or press <b>Play</b>, to return to the flock.`;
    if (!state.throws) return `Press <b>Throw!</b> (or <kbd>Space</kbd>) to throw your plane. The sliders change its design.`;
    if (state.throws < 4 && state.youBest < 40 && !state.hist.best.length) return `Tip: change <b>one slider at a time</b>. <b>Nose weight</b> and <b>Wing tilt</b> matter most. Watch the balance point in the picture!`;
    if (!state.hist.best.length) return `Ready? Press <b>Play</b>: 40 random planes will evolve. Can they beat your ${m(state.youBest)}?`;
    if (!state.playing && state.hist.best.length < 8) return `Press <b>Play</b> (or <kbd>P</kbd>) to keep the flock evolving. Each generation is a dot on the chart.`;
    if (state.hist.best.length < 8) return `Watch the pink champion and the chart. Peek at the champion's genes in <b>What's happening inside</b>: the shaded ranges shrink as the flock agrees.`;
    for (const c of ["wind", "cave", "pad"]) if (!state.done[c] && !state.rules[c]) return `Try a challenge: switch on <b>${LABELS[c]}</b> and watch the chart dip, then climb back.`;
    if (Object.keys(state.pending).length) return `The flock is working on the challenge. Try <b>Turbo</b> speed to see many generations quickly.`;
    if (!state.injected) return `Press <b>Add my plane to the flock</b>. If your genes are any good, a green plane may show up in the family tree.`;
    return `All done! Open <b>X-ray the model</b> to see the whole map of good and bad designs, or tap an ancestor in the family tree.`;
  }
  setInterval(() => {
    const now = performance.now();
    if (now - state.lastAct > 15000) { ML.say(nextStep()); state.lastAct = now; }
  }, 1000);

  document.addEventListener("themechange", () => { drawBlueprint(); drawChart(); drawTree(); ckpts.render(); state.dirty = true; });

  // ---------- Model X-ray: the landscape the flock searches ----------
  const cache = new Map();
  let cacheKey = "";
  function score(x) {
    const rk = JSON.stringify(state.rules);
    if (rk !== cacheKey) { cache.clear(); cacheKey = rk; }
    const d = {}; GENES.forEach((g, i) => (d[g.key] = x[i]));
    const key = x.map((v) => v.toFixed(2)).join(",");
    let v = cache.get(key);
    if (v === undefined) { const r = C.simulate(d, state.rules); v = state.rules.pad ? C.fitness(r, state.rules) : r.dist; if (cache.size > 20000) cache.clear(); cache.set(key, v); }
    return v;
  }
  ML.xray.register({
    title: "The plane-design landscape",
    kind: "Genetic algorithm",
    summary: () => `${state.hist.best.length} generations of 40 planes`,
    size: () => "40 planes × 5 genes",
    stats: () => [["Generation", state.ev.gen], ["Best ever", state.bestEver ? m(state.bestEver.dist) : "–"], ["Your best", state.youBest ? m(state.youBest) : "–"]],
    inputs: GENES.map((g) => ({ key: g.key, name: g.name, min: g.min, max: g.max, step: g.key === "clips" ? 0.5 : g.key === "wing" ? 0.1 : 1, unit: g.unit })),
    outputs: [{ name: "Distance flown", regression: true, unit: " m" }],
    predict: (x) => [score(x)],
    samples: () => state.ev.pop.map((p) => { const d = designFrom(p.genes); return GENES.map((g) => d[g.key]); }),
    current: () => { const g = state.champ ? state.champ.genes : C.encode(design); const d = designFrom(g); return GENES.map((k) => d[k.key]); },
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), w = cv.width, h = cv.height;
      c.clearRect(0, 0, w, h);
      c.font = "800 13px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--ink"); c.textAlign = "left";
      c.fillText("The flock right now: every plane's genes (one line each), champion in pink", 10, 18);
      const L = 120, R = w - 20, T = 40, B = h - 20;
      GENES.forEach((g, i) => { const y = T + ((B - T) * i) / (GENES.length - 1); c.fillStyle = ML.cssVar("--muted"); c.fillText(g.name, 10, y + 4); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, y); c.lineTo(R, y); c.stroke(); });
      const line = (genes, col, wd, a) => { c.strokeStyle = col; c.lineWidth = wd; c.globalAlpha = a; c.beginPath(); genes.forEach((v, i) => { const x = L + (R - L) * v, y = T + ((B - T) * i) / (GENES.length - 1); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.globalAlpha = 1; };
      state.ev.pop.forEach((p) => line(p.genes, ML.cssVar("--sup"), 1.5, 0.35));
      if (state.champ) line(state.champ.genes, "#ff5c9a", 3.5, 1);
    },
    brainHeight: 260,
    brainCaption: "Each line is one plane: where it crosses a row is that gene's value (left = small, right = big). Early on the lines are a tangle; as the flock evolves they bunch together around the good designs.",
    notes: [
      "A genetic algorithm has no brain inside: the 'knowledge' lives in the population. The map shows the landscape it climbs: colour = how far a design flies (or the pad score) when you change two genes and keep the rest.",
      "Try mapping Wing tilt against Nose weight: the good designs form a thin diagonal ridge, because tilt and nose weight have to be balanced together. That's why changing one slider at a time is hard!",
    ],
  });
  const xo = ML.xray.open;
  ML.xray.open = () => { ML.xray.get().outputs[0].name = state.rules.pad ? "Pad score" : "Distance flown"; ML.xray.get().outputs[0].unit = state.rules.pad ? "" : " m"; xo(); };
  ML.xray.button(playBtn.parentElement);

  // ---------- start ----------
  newFlock(state.seed);
  drawBlueprint(); drawChart(); drawTree();
  ckpts.render();
  syncPlay();
  requestAnimationFrame(frame);
  AliveChip.init({
    label: "Still flying",
    toggleHost: ".panel:not(.left) .card",
    count: () => (state.mode !== "flock" || !state.order ? null : [state.ev.results.filter((r) => r.time > state.tau).length, POP]),
  });
})();
