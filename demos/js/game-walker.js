// Creature Learns to Walk — page: live races, evolution, challenges, checkpoints.
(function () {
  const { DT_STEPS, BODIES, CHALLENGES, groundY, Creature, Evolver, cloneGenome } = window.WalkerLab;
  const CW = 640, CH = 300, BASE = 250; // screen y of height 0
  const world = ML.setupCanvas(document.getElementById("world"), CW, CH);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 140);
  const M = 50; // pixels per metre

  const state = {
    body: "box",
    playing: false,
    speed: 3,
    evo: new Evolver("box", 40),
    live: null,
    t: 0,
    history: [],
    marks: [],
    replay: null,
    showcase: null,
    camX: 0,
    showBabies: true, // the ghost population; off = only the leader
  };
  window.__walkerState = state; // read by the Model X-ray at the bottom of this file
  document.getElementById("babies").addEventListener("change", (e) => (state.showBabies = e.target.checked));
  const active = new Set();

  function newLive() {
    state.live = state.evo.spawn();
    state.t = 0;
  }
  function stepLive() {
    for (const c of state.live) c.step();
    state.t++;
    if (state.t >= DT_STEPS) { finishGeneration(state.live); newLive(); }
  }
  function finishGeneration(creatures) {
    state.evo.breed(creatures);
    state.history.push({ best: state.evo.bestDist / M, avg: state.evo.avgDist / M });
    afterGeneration();
  }
  function turboGeneration() {
    const cs = state.evo.spawn();
    for (let t = 0; t < DT_STEPS; t++) for (const c of cs) c.step();
    finishGeneration(cs);
  }

  const CKPT_AT = [1, 5, 10, 20, 40, 80, 150, 300];
  function afterGeneration() {
    const gen = state.evo.gen;
    const recent = state.history.slice(-3);
    const smooth = recent.reduce((a, h) => a + h.best, 0) / recent.length;
    watcher.update(smooth, gen);
    if (CKPT_AT.includes(gen)) saveCkpt(`Gen ${gen}`);
    const h = state.history[state.history.length - 1];
    if (h.best >= 25) ML.xray.offer("It learned to walk! X-ray its rhythm");
    if (!watcher.busy && state.speed !== 0) {
      if (gen === 1) ML.say(`Generation 1: mostly wobbling. The best one went <b>${h.best.toFixed(1)} m</b>. Its genes go to the babies!`);
      else if (gen % 3 === 0) ML.say(`Generation ${gen}: best walk <b>${h.best.toFixed(1)} m</b>. ${h.best > state.history[Math.max(0, state.history.length - 4)].best + 0.5 ? "Getting better!" : "Small changes, trying new rhythms…"}`);
    }
    drawChart();
  }

  // ---------- challenges ----------
  const watcher = GameRW.challengeWatcher((kind, w) => {
    if (kind === "drop") ML.say(`Uh-oh! With <b>${w.label}</b> the old walk barely works. Watch the next generations find a new one…`);
    if (kind === "easy") ML.say(`<b>${w.label}</b> didn't slow them down much. Try a tougher challenge!`);
    if (kind === "recovered") { ML.confetti(40); ML.say(`Adapted! After <b>${w.gens}</b> generations they walk well again with <b>${w.label}</b>. Nobody taught them: the best movers just had more babies.`); }
    watcher.busy = kind === "drop";
  });
  const SAY = {
    hills: "Bumpy hills! Feet now land at different heights.",
    ice: "Slippery ice! Feet can't grip, so pushing backwards barely moves you forward.",
    wind: "A strong headwind pushes everyone back!",
    backpack: "Everyone carries a heavy backpack on top!",
    moon: "Low gravity! Every push sends them floating.",
  };
  document.querySelectorAll("#challenges [data-c]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = b.dataset.c, c = CHALLENGES[key];
      const on = !active.has(key);
      if (on) { active.add(key); c.on(state.evo.rules); } else { active.delete(key); c.off(state.evo.rules); }
      b.classList.toggle("on", on);
      state.marks.push({ at: state.history.length, label: (on ? "+" : "−") + c.label, on });
      if (on) {
        const recent = state.history.slice(-3);
        const before = recent.length ? recent.reduce((a, h) => a + h.best, 0) / recent.length : 0;
        if (state.history.length) saveCkpt(`Before ${c.label}`);
        watcher.start(c.label, before, state.evo.gen);
        ML.say(`${SAY[key]} ${state.playing ? "Watch the chart." : "Press <b>Evolve</b> to see them adapt."}`);
      } else ML.say(`${c.label} is switched off.`);
      // the race in progress restarts in the new world
      newLive();
      if (state.replay) startReplay(state.replay.ck);
      drawChart();
    })
  );

  // ---------- checkpoints ----------
  const ckpts = GameRW.checkpoints(document.getElementById("ckpts"), {
    drawMini(canvas, ck) {
      const c = canvas.getContext("2d");
      c.fillStyle = ML.cssVar("--canvas-bg");
      c.fillRect(0, 0, 216, 96);
      const cr = new Creature(ck.body, ck.genome, state.evo.rules);
      const trail = [];
      for (let t = 0; t < DT_STEPS; t++) { cr.step(); if (t % 30 === 0) trail.push(cr.centerX()); }
      const d = cr.distance();
      const sc = 180 / Math.max(400, Math.abs(d));
      c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, 80); c.lineTo(216, 80); c.stroke();
      drawCreature(c, cr, { x0: cr.centerX() - (18 + d * sc) / 0.5, s: 0.5, base: 80 }, true);
      c.fillStyle = ML.cssVar("--accent");
      c.fillRect(18, 86, Math.max(2, d * sc), 5);
      c.fillStyle = ML.cssVar("--ink");
      c.font = "800 12px Nunito, sans-serif";
      c.fillText(`${(d / M).toFixed(1)} m today`, 8, 16);
    },
    onPick(ck) { startReplay(ck); },
    onLive() { state.replay = null; },
  });
  function saveCkpt(title) {
    const e = state.evo;
    if (!e.best) return;
    ckpts.add({ title, sub: `${(e.bestDist / M).toFixed(1)} m then`, genome: cloneGenome(e.best), body: e.body });
  }
  function startReplay(ck) {
    state.replay = { ck, c: new Creature(ck.body, ck.genome, state.evo.rules), t: 0 };
    ML.say(`Watching the champion from <b>${ck.title}</b> walk in today's world${active.size ? " (with your challenges on)" : ""}.`);
  }

  // ---------- drawing ----------
  // view = {x0, s, base}: screen x = (x - x0) * s, screen y = base - y * s
  // Drawing only: the physics nodes/springs are untouched, we just dress them up as characters.
  const LOOKS = {
    worm: { body: "#7ccf4c", dark: "#3f8f2a", belly: "#c8f0a8" },
    biped: { body: "#ffcf3f", dark: "#d99a12", belly: "#fff1b8" },
    box: { body: "#e9a865", dark: "#b06a2c", belly: "#f8dcb8" },
  };
  function drawCreature(ctx, cr, view, main, alpha = 1) {
    const X = (x) => (x - view.x0) * view.s, Y = (y) => view.base - y * view.s;
    const s = Math.max(0.45, view.s), P = (i) => ({ x: X(cr.p[i].x), y: Y(cr.p[i].y) });
    const look = LOOKS[cr.body] || LOOKS.box;
    // speed (verlet: position − previous position) → happy face when quick, strained when slow
    let v = 0;
    for (const q of cr.p) v += q.x - q.px;
    v /= cr.p.length;
    const happy = v > 0.35, blink = cr.t % 170 < 7;
    // how hard each node's muscles squeeze right now (0 = relaxed, 1 = squeezed)
    const squeeze = new Array(cr.p.length).fill(0);
    for (const m of cr.muscles) { const q = Math.max(0, Math.min(1, (1 - m.now) * 3 + 0.3)); squeeze[m.a] = Math.max(squeeze[m.a], q); squeeze[m.c] = Math.max(squeeze[m.c], q); }
    const onGround = (i) => cr.p[i].y - groundY(cr.p[i].x, cr.rules) < 3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const outline = main ? "#1f2140" : "rgba(31,33,64,.5)";
    const limb = (A, B, w, col) => { ctx.strokeStyle = outline; ctx.lineWidth = w + 3 * s; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    const blob = (cx, cy, r, col) => { ctx.fillStyle = col; ctx.strokeStyle = outline; ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke(); };
    const eyes = (cx, cy, r, gap) => {
      for (const dx of [-gap, gap]) {
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + dx, cy, r, 0, 7); ctx.fill();
        ctx.strokeStyle = outline; ctx.lineWidth = 1.5 * s; ctx.stroke();
        if (blink) { ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(cx + dx - r * 0.7, cy); ctx.lineTo(cx + dx + r * 0.7, cy); ctx.stroke(); }
        else { ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(cx + dx + r * 0.35, cy + r * 0.1, r * 0.5, 0, 7); ctx.fill(); }
      }
    };
    const mouth = (cx, cy, w) => {
      ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2 * s; ctx.beginPath();
      if (happy) ctx.arc(cx, cy - w * 0.4, w, 0.15 * Math.PI, 0.85 * Math.PI);
      else { ctx.moveTo(cx - w, cy); ctx.lineTo(cx - w / 3, cy - w * 0.25); ctx.lineTo(cx + w / 3, cy + w * 0.1); ctx.lineTo(cx + w, cy - w * 0.15); }
      ctx.stroke();
    };
    const crown = (cx, cy) => {
      if (!main) return;
      const w = 16 * s;
      ctx.fillStyle = "#ffc531"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(cx - w / 2, cy); ctx.lineTo(cx - w / 2, cy - w * 0.6); ctx.lineTo(cx - w / 4, cy - w * 0.3); ctx.lineTo(cx, cy - w * 0.75);
      ctx.lineTo(cx + w / 4, cy - w * 0.3); ctx.lineTo(cx + w / 2, cy - w * 0.6); ctx.lineTo(cx + w / 2, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    const backpack = (i) => {
      if (!(cr.rules.backpack > 1)) return;
      const q = P(i);
      ctx.fillStyle = "#ff8a3d"; ctx.strokeStyle = outline; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.roundRect(q.x - 10 * s, q.y - 22 * s, 20 * s, 18 * s, 5 * s); ctx.fill(); ctx.stroke();
    };
    const tint = (i, col) => (squeeze[i] > 0.6 && main ? look.dark : col);

    if (cr.body === "worm") {
      // caterpillar: one round segment per bottom node, bulging when its muscle squeezes
      const segs = [0, 1, 2, 3, 4].map((k) => {
        const tops = [k - 1, k].filter((t) => t >= 0 && t <= 3).map((t) => P(5 + t));
        const b0 = P(k);
        const ty = tops.reduce((a, q) => a + q.y, 0) / tops.length, tx = tops.reduce((a, q) => a + q.x, 0) / tops.length;
        return { x: (b0.x + tx) / 2, y: (b0.y + ty) / 2, k };
      });
      segs.forEach((g) => {
        if (onGround(g.k)) limb({ x: g.x - 4 * s, y: g.y + 8 * s }, { x: g.x - 5 * s, y: P(g.k).y + 2 * s }, 3 * s, look.dark);
      });
      segs.forEach((g) => blob(g.x, g.y, (13 + squeeze[g.k] * 3) * s, tint(g.k, look.body)));
      const h = segs[4];
      blob(h.x + 10 * s, h.y - 6 * s, 15 * s, look.body);
      ctx.strokeStyle = outline; ctx.lineWidth = 2 * s;
      for (const dx of [2, 12]) { ctx.beginPath(); ctx.moveTo(h.x + dx * s, h.y - 18 * s); ctx.lineTo(h.x + (dx + 4) * s, h.y - 30 * s); ctx.stroke(); ctx.fillStyle = "#ff5c9a"; ctx.beginPath(); ctx.arc(h.x + (dx + 4) * s, h.y - 31 * s, 3 * s, 0, 7); ctx.fill(); }
      if (main) { eyes(h.x + 13 * s, h.y - 9 * s, 4 * s, 5 * s); mouth(h.x + 14 * s, h.y + 1 * s, 4 * s); }
      backpack(cr.top);
      crown(h.x + 10 * s, h.y - 34 * s);
    } else if (cr.body === "biped") {
      // round chick: body over the triangle 0-1-2, thick orange legs, little wings and beak
      const legCol = "#ff9a3c";
      [[0, 3, 5], [1, 4, 6]].forEach(([hip, knee, foot]) => {
        const w = (6 + Math.max(squeeze[knee], squeeze[foot]) * 3) * s;
        limb(P(hip), P(knee), w, legCol); limb(P(knee), P(foot), w, legCol);
        const f = P(foot);
        ctx.fillStyle = legCol; ctx.strokeStyle = outline; ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(f.x - 4 * s, f.y); ctx.lineTo(f.x + 12 * s, f.y); ctx.lineTo(f.x + 2 * s, f.y - 6 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
      const a = P(0), b = P(1), t = P(2), cx = (a.x + b.x + t.x) / 3, cy = (a.y + b.y + t.y) / 3;
      blob(cx, cy, 30 * s, tint(2, look.body));
      ctx.fillStyle = look.belly; ctx.beginPath(); ctx.ellipse(cx + 4 * s, cy + 8 * s, 17 * s, 13 * s, 0, 0, 7); ctx.fill();
      const flap = Math.sin(cr.t * 0.3) * (happy ? 0.6 : 0.2);
      ctx.save(); ctx.translate(cx - 18 * s, cy); ctx.rotate(-0.4 + flap);
      ctx.fillStyle = look.dark; ctx.beginPath(); ctx.ellipse(0, 0, 13 * s, 7 * s, 0, 0, 7); ctx.fill(); ctx.restore();
      if (main) {
        eyes(cx + 10 * s, cy - 10 * s, 5 * s, 7 * s);
        ctx.fillStyle = "#ff8a3d"; ctx.strokeStyle = outline; ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(cx + 22 * s, cy - 4 * s); ctx.lineTo(cx + 34 * s, cy); ctx.lineTo(cx + 22 * s, cy + 4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (!happy) { ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.moveTo(cx + 4 * s, cy - 19 * s); ctx.lineTo(cx + 10 * s, cy - 17 * s); ctx.stroke(); }
      } else { ctx.fillStyle = "#ff8a3d"; ctx.beginPath(); ctx.moveTo(cx + 22 * s, cy - 4 * s); ctx.lineTo(cx + 32 * s, cy); ctx.lineTo(cx + 22 * s, cy + 4 * s); ctx.fill(); }
      backpack(cr.top);
      crown(cx, cy - 30 * s);
    } else {
      // puppy: rounded body over 0-2-4-3, four thick legs with paws, floppy ears, wagging tail
      const legs = [[5, 0], [6, 1], [7, 1], [8, 2]];
      const body = [P(0), P(2), P(4), P(3)];
      const back = P(3), front = P(4);
      const wag = Math.sin(cr.t * (happy ? 0.5 : 0.15)) * (happy ? 0.7 : 0.25);
      ctx.save(); ctx.translate(back.x, back.y); ctx.rotate(-2.3 + wag);
      ctx.strokeStyle = outline; ctx.lineWidth = 8 * s; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10 * s, -8 * s, 20 * s, -4 * s); ctx.stroke();
      ctx.strokeStyle = look.body; ctx.lineWidth = 5 * s; ctx.stroke(); ctx.restore();
      legs.forEach(([f, hip]) => {
        const w = (8 + squeeze[f] * 4) * s;
        limb(P(hip), P(f), w, tint(f, look.body));
        const q = P(f);
        ctx.fillStyle = look.dark; ctx.strokeStyle = outline; ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.ellipse(q.x + 3 * s, q.y - 2 * s, 7 * s, 4 * s, 0, 0, 7); ctx.fill(); ctx.stroke();
      });
      ctx.fillStyle = look.body; ctx.strokeStyle = outline; ctx.lineWidth = 3 * s;
      ctx.beginPath();
      body.forEach((q, i) => {
        const n = body[(i + 1) % 4], mx = (q.x + n.x) / 2, my = (q.y + n.y) / 2;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.quadraticCurveTo(q.x, q.y, mx, my);
      });
      ctx.quadraticCurveTo(body[0].x, body[0].y, (body[0].x + body[1].x) / 2, (body[0].y + body[1].y) / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // spots
      ctx.fillStyle = look.dark; ctx.globalAlpha = alpha * 0.5;
      const mid = P(1);
      ctx.beginPath(); ctx.ellipse(mid.x - 4 * s, mid.y - 16 * s, 8 * s, 6 * s, 0.3, 0, 7); ctx.fill();
      ctx.globalAlpha = alpha;
      // head in front of the shoulders, tilting with the body
      const ang = Math.atan2(front.y - back.y, front.x - back.x);
      const hx = front.x + Math.cos(ang) * 16 * s + Math.sin(ang) * 10 * s, hy = front.y + Math.sin(ang) * 16 * s - 12 * s;
      ctx.fillStyle = look.dark; ctx.save(); ctx.translate(hx - 12 * s, hy - 6 * s); ctx.rotate(0.5 + wag * 0.3);
      ctx.beginPath(); ctx.ellipse(0, 6 * s, 6 * s, 12 * s, 0, 0, 7); ctx.fill(); ctx.restore();
      blob(hx, hy, 18 * s, look.body);
      ctx.fillStyle = look.belly; ctx.beginPath(); ctx.ellipse(hx + 9 * s, hy + 5 * s, 10 * s, 8 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(hx + 17 * s, hy + 2 * s, 3.5 * s, 0, 7); ctx.fill();
      if (main) { eyes(hx + 3 * s, hy - 5 * s, 4 * s, 5 * s); mouth(hx + 10 * s, hy + 9 * s, 4 * s); }
      backpack(cr.top);
      crown(hx, hy - 18 * s);
    }
    ctx.restore();
  }

  function drawWorld(creatures, leader, label) {
    const ctx = world.ctx, rules = state.evo.rules;
    const dark = ML.isDark();
    state.camX = ML.lerp(state.camX, leader.centerX() - CW * 0.4, 0.12);
    const view = { x0: state.camX, s: 1, base: BASE };
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, dark ? "#141737" : rules.gravity < 0.2 ? "#d9d4ff" : "#d6ecff");
    g.addColorStop(1, dark ? "#262a58" : "#f6fbff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
    // headwind streaks
    if (rules.wind) {
      const t = performance.now() / 16;
      ctx.strokeStyle = dark ? "#ffffff44" : "#5b7fa877";
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const x = CW - ((t * 3 + i * 91) % (CW + 60)), y = 20 + ((i * 47) % 180);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y); ctx.stroke();
      }
    }
    // ground
    ctx.fillStyle = rules.friction < 0.3 ? (dark ? "#3c5f80" : "#bfe6ff") : dark ? "#2f4a3a" : "#9ed39a";
    ctx.beginPath();
    ctx.moveTo(0, CH);
    for (let sx = 0; sx <= CW; sx += 6) ctx.lineTo(sx, BASE - groundY(sx + state.camX, rules));
    ctx.lineTo(CW, CH);
    ctx.fill();
    // metre marks
    ctx.fillStyle = ML.cssVar("--ink");
    ctx.font = "800 11px Nunito, sans-serif";
    ctx.textAlign = "center";
    const first = Math.floor(state.camX / (M * 2)) * M * 2;
    for (let x = first; x < state.camX + CW + M * 2; x += M * 2) {
      const sx = x - state.camX, gy = BASE - groundY(x, rules);
      ctx.fillRect(sx - 1, gy, 2, 8);
      ctx.fillText(`${Math.round(x / M)} m`, sx, gy + 22);
    }
    // start flag
    const s0 = -state.camX;
    if (s0 > -20 && s0 < CW) { ctx.fillStyle = ML.cssVar("--bad"); ctx.fillRect(s0, BASE - 90, 3, 90); ctx.beginPath(); ctx.moveTo(s0 + 3, BASE - 90); ctx.lineTo(s0 + 26, BASE - 80); ctx.lineTo(s0 + 3, BASE - 70); ctx.fill(); }
    if (state.showBabies) for (const c of creatures) if (c !== leader) drawCreature(ctx, c, view, false, 0.28);
    drawCreature(ctx, leader, view, true);
    // HUD
    ctx.fillStyle = "rgba(31,33,64,.78)";
    ctx.beginPath(); ctx.roundRect(10, 10, 250, 30, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 12px Nunito, sans-serif"; ctx.textAlign = "left";
    ctx.fillText(label, 20, 30);
    const tags = [...active].map((k) => CHALLENGES[k].label);
    if (tags.length) {
      const t = tags.join(" · ");
      const w = ctx.measureText(t).width + 20;
      ctx.fillStyle = "rgba(255,77,94,.9)";
      ctx.beginPath(); ctx.roundRect(CW - 10 - w, 10, w, 24, 8); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "right"; ctx.fillText(t, CW - 20, 27);
    }
  }

  function leaderOf(cs) {
    let best = cs[0];
    for (const c of cs) if (c.centerX() > best.centerX()) best = c;
    return best;
  }

  function draw() {
    if (state.replay) {
      const r = state.replay;
      drawWorld([r.c], r.c, `Replay: ${r.ck.title} · ${(r.c.distance() / M).toFixed(1)} m`);
      return { leader: r.c };
    }
    if (state.speed === 0 && state.playing && state.showcase) {
      const s = state.showcase;
      drawWorld([s.c], s.c, `Turbo · gen ${state.evo.gen} champion · ${(s.c.distance() / M).toFixed(1)} m`);
      return { leader: s.c };
    }
    const leader = leaderOf(state.live);
    const secs = Math.max(0, (DT_STEPS - state.t) / 60).toFixed(1);
    drawWorld(state.live, leader, `Gen ${state.evo.gen + 1} race · ${secs} s left · leader ${(leader.distance() / M).toFixed(1)} m`);
    return { leader };
  }

  function drawChart() {
    GameRW.drawProgress(chart, state.history, state.marks, { top: `${Math.round(Math.max(10, ...state.history.map((h) => h.best)) * 1.05)} m` });
  }

  // ---------- inside card ----------
  let insideTick = 0;
  function renderInside(leader) {
    if (++insideTick % 8 || !leader) return;
    const host = document.getElementById("inside");
    const g = leader.genome;
    const bars = leader.muscles.map((m, i) => {
      const sq = (1 - m.now) / Math.max(0.05, g.m[i].amp || 0.05); // −1 stretched … +1 squeezed
      const v = Math.max(-1, Math.min(1, sq));
      const left = v >= 0 ? 50 : 50 + v * 50;
      return `<div class="io"><span>Muscle ${i + 1}</span><div class="bar"><span style="left:${left}%;width:${Math.abs(v) * 50}%;background:${v > 0 ? "#ff5c9a" : "var(--sup)"}"></span></div><span class="num">${v > 0.3 ? "squeeze" : v < -0.3 ? "stretch" : "relax"} · ${Math.round(g.m[i].amp * 100)}%</span></div>`;
    }).join("");
    // which muscles move together (similar timing)
    const ph = g.m.map((m) => ((m.phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    let pair = null;
    for (let i = 0; i < ph.length; i++) for (let j = i + 1; j < ph.length; j++) {
      const d = Math.abs(Math.atan2(Math.sin(ph[i] - ph[j]), Math.cos(ph[i] - ph[j])));
      if (g.m[i].amp > 0.08 && g.m[j].amp > 0.08 && (!pair || Math.abs(d - Math.PI) < Math.abs(pair.d - Math.PI))) pair = { i, j, d };
    }
    const beat = ((g.tempo * 0.6 * 60)).toFixed(1);
    host.innerHTML = `${bars}<div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("music")} Rhythm: <b>${beat}</b> beats a second</div>
      ${pair ? `<div>${ML.icon("repeat")} Muscle ${pair.i + 1} squeezes while muscle ${pair.j + 1} lets go: <b>${Math.abs(pair.d - Math.PI) < 0.8 ? "taking turns, like a step!" : "partly in time"}</b></div>` : ""}
      <div class="muted" style="font-weight:700">These numbers are the creature's genes. Evolution only ever changes them.</div>`;
  }

  function renderStats() {
    document.getElementById("st-gen").textContent = state.evo.gen;
    const h = state.history[state.history.length - 1];
    document.getElementById("st-best").innerHTML = h ? `${h.best.toFixed(1)}<small> m</small>` : "–";
  }

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Evolve`; }
  playBtn.addEventListener("click", () => {
    state.replay = null;
    ckpts.unpick();
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.evo.gen === 0 && state.t === 0) ML.say(`Generation 1: 40 creatures with <b>random muscle rhythms</b>. Most will just wobble…`);
  });
  function restart(body) {
    const rules = state.evo.rules, mut = state.evo.mutation;
    state.body = body;
    state.evo = new Evolver(body, 40);
    state.evo.rules = rules;
    state.evo.mutation = mut;
    state.history = [];
    state.marks = [];
    state.replay = null;
    watcher.clear();
    ckpts.clear();
    newLive();
    drawChart();
  }
  document.getElementById("reset").addEventListener("click", () => { restart(state.body); ML.say(`Back to random rhythms. Generation 0!`); });
  document.querySelectorAll("#body button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#body button").forEach((x) => x.classList.toggle("on", x === b));
      restart(b.dataset.b);
      ML.say(`New body: <b>${BODIES[b.dataset.b].name}</b>. It has ${BODIES[b.dataset.b].muscles.length} muscles to learn to use. Evolution starts from scratch!`);
    })
  );
  document.querySelectorAll("#speed button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
      state.speed = +b.dataset.v;
      if (state.speed === 0) ML.say(`Turbo! Whole generations race off-screen. On screen: the latest champion walking.`);
      else newLive();
    })
  );
  ML.bindRange("#mut", (v) => Math.round(v * 100) + "%", (v) => (state.evo.mutation = v));

  // ---------- loop ----------
  newLive();
  drawChart();
  syncPlay();
  function frame() {
    if (state.replay) {
      const r = state.replay;
      r.c.step(); r.t++;
      if (r.t >= DT_STEPS + 60) startReplay(r.ck);
    } else if (state.playing) {
      if (state.speed === 0) {
        turboGeneration();
        if (!state.showcase || state.showcase.t >= DT_STEPS) state.showcase = { c: new Creature(state.evo.body, cloneGenome(state.evo.best), state.evo.rules), t: 0 };
        for (let i = 0; i < 3; i++) { state.showcase.c.step(); state.showcase.t++; }
      } else for (let i = 0, n = ML.ticks(state.speed); i < n; i++) stepLive();
    }
    const { leader } = draw();
    renderInside(leader);
    renderStats();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // ---------- Model X-ray (brain-only: this creature has no senses, just a rhythm) ----------
  let gX = null, bodyX = null;
  const champ = () => state.evo.best || state.evo.pop[0];
  ML.xray.register({
    title: "The champion's walking rhythm",
    kind: "Muscle rhythm (evolved)",
    summary: () => `${BODIES[state.evo.body].name} · evolved over ${state.history.length} generations`,
    size: () => `${1 + 2 * champ().m.length} numbers`,
    stats: () => [["Generations", state.history.length], ["Best walk", state.history.length ? `${Math.max(...state.history.map((h) => h.best)).toFixed(1)} m` : "–"], ["Muscles", champ().m.length]],
    inputs: [],
    outputs: [],
    predict: () => null,
    brainHeight: 340,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), W = cv.width, H = cv.height, g = gX, n = g.m.length;
      const left = 120, right = W - 20, row = (H - 30) / n, beats = 2;
      const period = 1 / (g.tempo * 0.6); // steps per beat
      c.font = "800 12px Nunito, sans-serif";
      const cols = ["--rl", "--sup", "--vision", "--nn", "--diff", "--lang", "--unsup", "--good"];
      g.m.forEach((m, i) => {
        const y0 = 16 + i * row + row / 2;
        c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right"; c.fillText(`muscle ${i + 1}`, left - 10, y0 + 4);
        c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(left, y0); c.lineTo(right, y0); c.stroke();
        c.strokeStyle = ML.cssVar(cols[i % cols.length]); c.lineWidth = 3; c.beginPath();
        for (let x = 0; x <= right - left; x += 3) {
          const t = (x / (right - left)) * beats * period;
          const v = m.amp * Math.sin(t * g.tempo * 2 * Math.PI * 0.6 + m.phase);
          const y = y0 - (v / 0.6) * (row * 0.45);
          x ? c.lineTo(left + x, y) : c.moveTo(left + x, y);
        }
        c.stroke();
      });
      c.fillStyle = ML.cssVar("--muted"); c.textAlign = "center"; c.fillText("time → (two beats)", (left + right) / 2, H - 4);
    },
    brainCaption: "Each wavy line is one muscle squeezing (up) and stretching (down). Taller waves = stronger muscles. When two lines go up and down at opposite times, those muscles take turns, like left and right legs.",
    extraSections: () => {
      const g = gX;
      // pairs most "out of step" = taking turns
      const pairs = [];
      for (let i = 0; i < g.m.length; i++) for (let j = i + 1; j < g.m.length; j++) {
        if (g.m[i].amp < 0.05 || g.m[j].amp < 0.05) continue;
        const d = Math.abs(((g.m[i].phase - g.m[j].phase) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
        pairs.push([Math.PI - d, i, j]);
      }
      pairs.sort((a, b) => a[0] - b[0]);
      const lazy = g.m.map((m, i) => [m.amp, i]).filter(([a]) => a < 0.05).map(([, i]) => i + 1);
      return [
        { title: "Its beat", icon: "music", html: `<p style="margin:0;font-weight:700">About <b>${(g.tempo * 0.6 * 60).toFixed(1)}</b> steps per second of game time. Evolution found this speed by itself: too fast and the feet slip, too slow and it barely moves.</p>` },
        { title: "Muscles that take turns", icon: "repeat", html: `<ul class="xr-rules">${pairs.slice(0, 3).map(([, i, j]) => `<li>Muscle ${i + 1} and muscle ${j + 1} squeeze at opposite times, like a step.</li>`).join("") || "<li>No clear turn-taking yet. Keep evolving!</li>"}${lazy.length ? `<li>Muscle${lazy.length > 1 ? "s" : ""} ${lazy.join(", ")} barely move${lazy.length > 1 ? "" : "s"}: evolution decided ${lazy.length > 1 ? "they aren't" : "it isn't"} useful.</li>` : ""}</ul>` },
      ];
    },
    notes: ["This creature has no eyes or senses. Its whole 'brain' is a rhythm: how strong each muscle squeezes and when. Evolution tuned those numbers until the wobbling turned into walking."],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { gX = cloneGenome(champ()); _xo(); };
  ML.xray.button(document.getElementById("play").parentElement);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still moving", count: AliveChip.moving(() => (state.replay || state.speed === 0 || !state.live ? null : state.live.map((c) => c.centerX())), 3) });
})();
