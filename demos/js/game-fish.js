// Fish School vs Shark — page: the tank, three modes (be a fish / fish learn / be the shark),
// the generation loop, challenges, checkpoints, the "inside" card and the X-ray.
(function () {
  const F = window.FishCore;
  const { W, H, POP, EYES, EYE_NAMES, CHANNELS, FISH_R, SHARK_R, SIZES, STEPS } = F;
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const tankEl = document.getElementById("tank");
  const tank = ML.setupCanvas(tankEl, W, H);
  const ctx = tank.ctx;
  const chartCv = ML.setupCanvas(document.getElementById("chart"), 640, 180);

  const freshBrains = () => Array.from({ length: POP }, (_, i) => { const b = F.newBrain(); b.family = i; return b; });
  const state = {
    brains: freshBrains(), rules: { ...F.DEFAULT_RULES }, gen: 1, speed: 3, playing: false, mutation: 0.3,
    mode: "fish", world: null, play: null, replay: null,
    surv: [], aliveEnd: [], food: [], buddies: [], markers: [], pending: [], said: {},
    best: null, celebrated: false, rays: true, trails: false,
    fishBest: null, sharkLog: [], done: { fish: false, learn: false, shark: false, chal: false },
  };
  const seedFor = (g) => 11 + g * 7;
  const secs = (steps) => (steps / 60).toFixed(1);
  const mean = (a) => (a.length ? a.reduce((x, v) => x + v, 0) / a.length : 0);
  const pct = (v) => Math.round(v * 100);
  const hueOf = (f) => ((f.brain && f.brain.family != null ? f.brain.family : 0) * 137.5) % 360;

  // ---------- worlds ----------
  function newTrainingWorld() {
    state.world = new F.World(state.brains, state.rules, seedFor(state.gen));
    state.world._ev = 0;
    fx.length = 0;
  }
  function startFish() {
    const w = new F.World(state.brains, state.rules, Math.floor(Math.random() * 1e6), { human: "fish" });
    w._ev = 0;
    state.play = { kind: "fish", world: w, over: false, overAt: 0, snacks: 0 };
    fx.length = 0;
  }
  function startShark() {
    const clones = state.brains.map((b) => { const c = b.clone(); c.family = b.family; return c; });
    const w = new F.World(clones, state.rules, Math.floor(Math.random() * 1e6), { human: "shark" });
    w._ev = 0;
    state.play = { kind: "shark", world: w, over: false, overAt: 0, missSaid: false };
    fx.length = 0;
  }
  function startReplay(ck) {
    const school = Array.from({ length: POP }, () => { const c = ck.brain.clone(); c.family = ck.brain.family; return c; });
    const w = new F.World(school, state.rules, Math.floor(Math.random() * 1e6));
    w._ev = 0;
    state.replay = { ck, world: w, said: false };
    fx.length = 0;
  }

  // ---------- evolution ----------
  function finishGeneration() {
    const w = state.world;
    const fit = w.fish.map((f) => w.fitness(f));
    const s = w.stats();
    state.surv.push(pct(s.survival)); state.aliveEnd.push(pct(s.aliveEnd)); state.food.push(s.food); state.buddies.push(s.buddies);
    let bi = 0;
    fit.forEach((v, i) => { if (v > fit[bi]) bi = i; });
    state.best = state.brains[bi].clone(); state.best.family = state.brains[bi].family;
    const champ = w.fish[bi], cb = state.best;
    ckpts.add({
      label: `Gen ${state.gen}`,
      sub: `${champ.alive ? "survived!" : champ.why === "shark" ? `eaten at ${secs(champ.t)} s` : `starved at ${secs(champ.t)} s`} · ${champ.eaten} snacks`,
      brain: cb,
      draw: (cv) => drawNetThumb(cv, cb),
    });
    narrateGen(s);
    checkChallenges();
    drawChart();
    state.brains = F.evolve(state.brains, fit, Math.random, state.mutation);
    state.gen++;
    if (state.gen > 3) state.done.learn = true;
    newTrainingWorld();
  }

  function narrateGen(s) {
    const n = state.surv.length, sv = pct(s.survival), al = pct(s.aliveEnd);
    if (!state.celebrated && n >= 4 && mean(state.aliveEnd.slice(-3)) >= 35 && mean(state.surv.slice(-3)) >= state.surv[0] + 8) {
      state.celebrated = true;
      ML.confetti(); ML.toast(`${ML.icon("trophy")} The school learned to survive!`);
      ML.say(`They did it! Now <b>${al}%</b> of the fish are still swimming at the end, and each ate about <b>${s.food.toFixed(0)}</b> snacks. In generation 1 it was ${state.aliveEnd[0]}% and ${state.food[0].toFixed(1)}. Nobody told them what plankton or sharks are!`);
      ML.xray.offer("The fish evolved! X-ray a fish brain");
      return;
    }
    if (state.pending.some((p) => !p.done) && state.speed !== 0) return; // challenge messages win
    if (n === 1) { ML.say(`Generation 1 done. Random brains: fish lived <b>${sv}%</b> of the time on average and ate <b>${s.food.toFixed(1)}</b> snacks each. Only ${al}% made it to the end. The best ones become parents now.`); return; }
    if (!state.said.school && n >= 8 && s.buddies > state.buddies[0] * 1.6 && s.buddies > 1.6) {
      state.said.school = true;
      ML.say(`Look! The fish now keep about <b>${s.buddies.toFixed(1)}</b> friends close by, up from ${state.buddies[0].toFixed(1)} in generation 1. Crowds confuse the shark, so <b>swimming together</b> is starting to pay off. Turn on <b>swim trails</b> to see it.`);
      return;
    }
    if (!state.said.food && n >= 4 && s.food > Math.max(6, state.food[0] * 3)) {
      state.said.food = true;
      ML.say(`Generation ${n}: each fish now eats <b>${s.food.toFixed(0)}</b> snacks (generation 1: ${state.food[0].toFixed(1)}). Brains that turn toward green dots had more babies.`);
      return;
    }
    if (state.speed !== 0 && n % 4 === 0) {
      const hint = al < 20 ? "Most still get eaten or starve, but the best are getting the idea." : al < 45 ? "More and more make it to the end." : "A tough little school!";
      ML.say(`Generation ${n}: fish lived <b>${sv}%</b> of the time, <b>${al}%</b> still swimming at the end. ${hint}`);
    }
  }

  // ---------- challenges ----------
  const LABELS = { fast: "Faster shark", two: "Two sharks", murky: "Murky water" };
  const TELLS = {
    fast: "The shark zooms faster than the slow fish now, and turns sharper.",
    two: "A second shark joins from the other corner. Danger from two sides!",
    murky: "The water clouds over. The fish's eyes only see a third as far, so plankton and sharks appear late.",
  };
  const TRY = {
    fast: "Try this: press <b>Be the shark</b>. You're faster now too. Can you still catch the fish when they bunch up?",
    two: "Try this: turn on <b>Show swim trails</b>. Do the fish huddle more with danger on two sides? Then switch it off and watch survival jump back.",
    murky: "Try this: watch the <b>eyes</b> card. Bars only light up when things are really close. Switch murky off and see how fast they recover.",
  };
  const chalBtns = document.querySelectorAll("#chal [data-c]");
  chalBtns.forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    state.rules[c] = !state.rules[c];
    const on = state.rules[c];
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    state.markers.push({ at: state.surv.length, label: `${LABELS[c]} ${on ? "on" : "off"}` });
    drawChart();
    state.pending = state.pending.filter((p) => p.c !== c);
    nudge.touch();
    if (state.play) { state.play.kind === "fish" ? startFish() : startShark(); ML.say(`<b>${LABELS[c]}</b> ${on ? "on" : "off"}! ${on ? TELLS[c] : ""} Your tank restarted.`); return; }
    if (on) {
      state.done.chal = true;
      const before = state.surv.length >= 3 ? mean(state.surv.slice(-3)) : null;
      state.pending.push({ c, start: state.surv.length, before, done: false, hurtSaid: false });
      ML.toast(`${ML.icon("zap")} ${LABELS[c]} starts next generation`);
      ML.say(`<b>${LABELS[c]}</b> starts next generation! ${TELLS[c]} ${before != null ? `Before: fish lived <b>${Math.round(before)}%</b> of the time. Watch the chart dip, then see if they adapt.` : "Tip: it's more fun after a few generations of training, so you can see the dip and the comeback."}`);
      if (state.mode !== "learn") setMode("learn");
      if (!state.playing) { state.playing = true; syncPlay(); }
    } else ML.say(`${LABELS[c]} switched off. The tank is back to normal from next generation.`);
  }));

  function checkChallenges() {
    for (const p of state.pending) {
      if (p.done) continue;
      const st = F.adaptStatus(state.surv, p.start, p.before);
      if (st.rounds === 2 && st.hurt && !p.hurtSaid) {
        p.hurtSaid = true;
        ML.say(`Ouch, ${LABELS[p.c].toLowerCase()}! Survival dropped from ${Math.round(p.before)}% to about ${Math.round(st.low)}%. The old tricks don't work so well any more…`);
      }
      if (st.done) {
        p.done = true;
        const b = document.querySelector(`#chal [data-c="${p.c}"]`);
        b.classList.add("done");
        ML.confetti(60);
        ML.toast(`${ML.icon("check")} Challenge done: ${LABELS[p.c]}`);
        const msg = st.coped ? `${LABELS[p.c]} hardly bothered them: survival stayed around <b>${Math.round(st.now)}%</b>. Their tricks still work!`
          : `The school <b>adapted</b> to ${LABELS[p.c].toLowerCase()}! Survival is back up to <b>${Math.round(st.now)}%</b> after ${st.rounds} generations (lowest was ${Math.round(st.low)}%). Nobody re-programmed them: evolution did it.`;
        ML.say(msg);
        const t = document.getElementById("try");
        t.innerHTML = `${ML.icon("bulb")} ${TRY[p.c]}`;
        t.classList.remove("hidden");
      }
    }
  }

  // ---------- effects (eat sparkles, chomps, confused bubbles) ----------
  const fx = [];
  function pullEvents(w) {
    for (const e of w.events) {
      if (e.step <= w._ev) continue;
      if (e.type === "eat") fx.push({ x: e.x, y: e.y, t: 0, k: "eat", human: e.fish && e.fish.human });
      else if (e.type === "catch") fx.push({ x: e.x, y: e.y, t: 0, k: "chomp", human: e.fish && e.fish.human });
      else if (e.type === "miss") fx.push({ x: e.x, y: e.y - 18, t: 0, k: "miss" });
      else if (e.type === "starve") fx.push({ x: e.x, y: e.y, t: 0, k: "starve" });
      if (state.play && state.play.world === w) onPlayEvent(e);
    }
    w._ev = w.steps;
    if (fx.length > 80) fx.splice(0, fx.length - 80);
  }

  // ---------- drawing ----------
  let bgCache = null, bgTheme = "";
  function background() {
    const theme = ML.isDark() ? "d" : "l";
    if (bgCache && bgTheme === theme) return bgCache;
    bgTheme = theme;
    const c = document.createElement("canvas");
    c.width = W * tank.dpr; c.height = H * tank.dpr;
    const g = c.getContext("2d");
    g.setTransform(tank.dpr, 0, 0, tank.dpr, 0, 0);
    const dark = theme === "d";
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, dark ? "#0a2a40" : "#2a8fb8"); grd.addColorStop(1, dark ? "#061a2a" : "#145f86");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const r = F.seeded(42);
    // sand speckles and pebbles
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,240,200,${0.04 + r() * 0.06})`; g.beginPath(); g.arc(r() * W, r() * H, 0.6 + r() * 1.6, 0, 7); g.fill(); }
    for (let i = 0; i < 9; i++) {
      const x = r() < 0.5 ? r() * 70 : W - r() * 70, y = r() * H;
      g.fillStyle = dark ? "rgba(90,110,130,.55)" : "rgba(70,95,120,.5)";
      g.beginPath(); g.ellipse(x, y, 10 + r() * 14, 7 + r() * 9, r() * 3, 0, 7); g.fill();
    }
    // seaweed in the corners
    for (let k = 0; k < 7; k++) {
      const x = [18, 34, 52, W - 20, W - 40, 30, W - 30][k], y = [H - 6, H - 4, H - 8, H - 6, H - 10, 8, 6][k], up = y > H / 2 ? -1 : 1;
      g.strokeStyle = dark ? "rgba(70,170,110,.55)" : "rgba(60,170,100,.7)"; g.lineWidth = 4; g.lineCap = "round";
      g.beginPath(); g.moveTo(x, y);
      for (let s = 1; s <= 5; s++) g.lineTo(x + Math.sin(s * 1.3 + k) * 6, y + up * s * 11);
      g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
    bgCache = c;
    return c;
  }

  function drawFish(f, opts) {
    const hue = hueOf(f);
    const wag = Math.sin(f.wag) * (reduced() ? 0.2 : 0.45);
    ctx.save();
    ctx.translate(f.x, f.y); ctx.rotate(f.th);
    ctx.globalAlpha = opts.alpha;
    const body = f.human ? "#ffd23f" : `hsl(${hue} 85% 62%)`;
    // tail
    ctx.fillStyle = f.human ? "#f0a500" : `hsl(${hue} 75% 48%)`;
    ctx.save(); ctx.translate(-FISH_R + 1, 0); ctx.rotate(wag);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -4.5); ctx.lineTo(-7, 4.5); ctx.closePath(); ctx.fill(); ctx.restore();
    // body
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, FISH_R + 2, FISH_R - 1.5, 0, 0, 7); ctx.fill();
    if (opts.lead || f.human) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.stroke(); }
    // eye
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(3.5, -1.6, 1.8, 0, 7); ctx.fill();
    ctx.fillStyle = "#1d2240"; ctx.beginPath(); ctx.arc(3.9, -1.6, 0.9, 0, 7); ctx.fill();
    ctx.restore();
    if (opts.lead && f.alive) { // crown
      ctx.save(); ctx.translate(f.x, f.y - 12);
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#c98f00"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(-6, -3); ctx.lineTo(-3, 0); ctx.lineTo(0, -5); ctx.lineTo(3, 0); ctx.lineTo(6, -3); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (f.human && f.alive) { // "you" tag + energy ring
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, 13, 0, 7); ctx.stroke();
      ctx.strokeStyle = f.energy < 0.3 ? "#ff5d5d" : "#3ccf6e";
      ctx.beginPath(); ctx.arc(f.x, f.y, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, f.energy)); ctx.stroke();
      ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
      ctx.fillText("you", f.x, f.y - 17);
      ctx.restore();
    }
  }

  function drawShark(s, t) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.th);
    const wag = Math.sin(s.wag) * (reduced() ? 0.12 : 0.3);
    const col = s.human ? "#ff7aa8" : "#8e9ab0", dark = s.human ? "#d24f7c" : "#5d6880";
    ctx.fillStyle = dark;
    ctx.save(); ctx.translate(-SHARK_R - 4, 0); ctx.rotate(wag);
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-12, -9); ctx.lineTo(-8, 0); ctx.lineTo(-12, 9); ctx.closePath(); ctx.fill(); ctx.restore();
    // side fins
    ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(-6, -15); ctx.lineTo(-4, -5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, 6); ctx.lineTo(-6, 15); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, 0, SHARK_R + 6, SHARK_R - 5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = s.human ? 2 : 1; ctx.stroke();
    // dorsal fin seen from above: a darker stripe
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(-2, 0, 6, 2.2, 0, 0, 7); ctx.fill();
    // eyes and mouth
    ctx.fillStyle = "#1d2240";
    ctx.beginPath(); ctx.arc(10, -4.5, 1.6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(10, 4.5, 1.6, 0, 7); ctx.fill();
    const open = s.full ? 0 : 0.5 + 0.5 * Math.sin(t * 0.012);
    ctx.strokeStyle = "#1d2240"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(16, -3 - open * 2); ctx.lineTo(19, 0); ctx.lineTo(16, 3 + open * 2); ctx.stroke();
    ctx.restore();
    ctx.font = "800 12px Nunito, sans-serif"; ctx.textAlign = "center";
    if (s.full) { ctx.fillStyle = "#fff"; ctx.fillText("munch", s.x, s.y - 22); }
    else if (s.confused) { ctx.fillStyle = "#ffd23f"; ctx.font = "900 16px Nunito, sans-serif"; ctx.fillText("?", s.x, s.y - 20); }
    if (s.human) { ctx.fillStyle = "#fff"; ctx.font = "800 11px Nunito, sans-serif"; ctx.fillText("you", s.x, s.y + 28); }
  }

  const CH_COL = ["#3ccf6e", "#ff5d5d", "#c9d1e3", "#ffc93c"];
  function drawRays(w, f) {
    if (!f || !f.alive || !f.hits) return;
    ctx.save();
    // what the eyes can reach
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(f.x, f.y, w.range, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    for (let k = 0; k < f.hits.length; k++) {
      const h = f.hits[k];
      if (!h.d) continue;
      ctx.strokeStyle = CH_COL[k % 4]; ctx.globalAlpha = 0.35 + 0.6 * h.d; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(h.x, h.y); ctx.stroke();
      ctx.fillStyle = CH_COL[k % 4]; ctx.beginPath(); ctx.arc(h.x, h.y, 2.5, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawWorld(w, t, label, opts = {}) {
    ctx.drawImage(background(), 0, 0, W, H);
    // moving light ripples
    if (!reduced()) {
      ctx.save(); ctx.globalAlpha = ML.isDark() ? 0.05 : 0.08; ctx.fillStyle = "#fff";
      for (let i = 0; i < 6; i++) {
        const x = ((t * 0.02 + i * 130) % (W + 200)) - 100;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x - 70, H); ctx.lineTo(x - 120, H); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // plankton patches glow faintly so kids can spot where food grows
    for (const c of w.clouds) {
      const g = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 60);
      g.addColorStop(0, "rgba(120,255,160,.12)"); g.addColorStop(1, "rgba(120,255,160,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, 60, 0, 7); ctx.fill();
    }
    for (const p of w.plankton) {
      const r = 2.4 + Math.sin(w.steps * 0.08 + p.ph) * 0.6;
      ctx.fillStyle = "rgba(120,255,160,.3)"; ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.5, 0, 7); ctx.fill();
      ctx.fillStyle = "#3ccf6e"; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    }
    const lead = opts.lead;
    // trails
    if (state.trails) {
      w._trail = w._trail || new Map();
      const tick = w.steps;
      for (const f of w.fish) {
        let tr = w._trail.get(f);
        if (!tr) { tr = []; w._trail.set(f, tr); }
        if (f.alive && (!tr.length || tr[tr.length - 1].s !== tick)) { tr.push({ x: f.x, y: f.y, s: tick }); if (tr.length > 40) tr.shift(); }
        if (tr.length < 2) continue;
        ctx.strokeStyle = f.human ? "rgba(255,210,63,.5)" : `hsla(${hueOf(f)} 85% 70% / .3)`; ctx.lineWidth = 1.5;
        ctx.beginPath(); tr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      }
    }
    if (state.rays && lead) drawRays(w, lead);
    for (const f of w.fish) if (!f.alive && f.why === "hungry") drawFish(f, { alpha: 0.25, lead: false });
    for (const f of w.fish) if (f.alive && f !== lead && !f.human) drawFish(f, { alpha: 1, lead: false });
    if (lead && lead.alive && !lead.human) drawFish(lead, { alpha: 1, lead: true });
    for (const f of w.fish) if (f.human) drawFish(f, { alpha: f.alive ? 1 : 0.3, lead: false });
    for (const s of w.sharks) drawShark(s, t);
    // effects
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      e.t++;
      const life = e.k === "eat" ? 20 : 40;
      if (e.t > life) { fx.splice(i, 1); continue; }
      const k = e.t / life;
      ctx.save(); ctx.globalAlpha = 1 - k;
      if (e.k === "eat") { ctx.strokeStyle = "#a8ffbf"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 3 + k * 10, 0, 7); ctx.stroke(); if (e.human) { ctx.fillStyle = "#fff"; ctx.font = "900 13px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText("+1", e.x, e.y - 8 - k * 14); } }
      else if (e.k === "chomp") { ctx.fillStyle = "#ff5d5d"; ctx.font = "900 15px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText("CHOMP!", e.x, e.y - 10 - k * 16); for (let b = 0; b < 5; b++) { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(e.x + Math.cos(b * 1.3) * k * 16, e.y - k * 20 - b * 3, 2, 0, 7); ctx.fill(); } }
      else if (e.k === "miss") { ctx.fillStyle = "#ffd23f"; ctx.font = "900 13px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText("missed! (crowd)", e.x, e.y - k * 12); }
      else if (e.k === "starve") { ctx.fillStyle = "#c9d1e3"; ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText("hungry…", e.x, e.y - 8 - k * 10); }
      ctx.restore();
    }
    if (w.rules.murky) { // cloudy water
      ctx.fillStyle = ML.isDark() ? "rgba(40,50,30,.45)" : "rgba(110,120,70,.4)"; ctx.fillRect(0, 0, W, H);
    }
    if (label) {
      ctx.font = "800 13px Nunito, sans-serif";
      const tw = ctx.measureText(label).width + 28;
      ctx.fillStyle = "rgba(10,20,40,.62)"; ctx.beginPath(); ctx.roundRect(10, 10, Math.min(W - 20, tw), 28, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(label, 22, 29);
    }
    // time strip
    const k = Math.min(1, w.steps / w.maxSteps);
    ctx.fillStyle = "rgba(10,20,40,.5)"; ctx.beginPath(); ctx.roundRect(W - 150, H - 22, 138, 10, 5); ctx.fill();
    ctx.fillStyle = "#7fd3ff"; ctx.beginPath(); ctx.roundRect(W - 150, H - 22, Math.max(10, 138 * k), 10, 5); ctx.fill();
    if (opts.banner) {
      ctx.fillStyle = "rgba(10,20,40,.72)"; ctx.beginPath(); ctx.roundRect(W / 2 - 190, H / 2 - 40, 380, 80, 16); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.font = "700 22px Fredoka, sans-serif"; ctx.fillText(opts.banner[0], W / 2, H / 2 - 6);
      ctx.font = "800 13px Nunito, sans-serif"; ctx.fillText(opts.banner[1], W / 2, H / 2 + 20);
    }
  }

  function drawChart() {
    GameLab.drawChart(chartCv, [
      { values: state.surv, color: "--accent" },
      { values: state.aliveEnd, color: "--lang" },
    ], state.markers, 100);
  }

  function drawNetThumb(cv, net) {
    const c = cv.getContext("2d"), Wc = cv.width, Hc = cv.height;
    c.clearRect(0, 0, Wc, Hc);
    const n = net.sizes.length;
    const pos = net.sizes.map((k, l) => Array.from({ length: k }, (_, i) => [14 + ((Wc - 28) * l) / (n - 1), k === 1 ? Hc / 2 : 8 + ((Hc - 16) * i) / (k - 1)]));
    for (let l = 0; l < n - 1; l++)
      for (let i = 0; i < net.sizes[l]; i++)
        for (let j = 0; j < net.sizes[l + 1]; j++) {
          const wv = net.weight(l, i, j);
          c.strokeStyle = wv > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
          c.globalAlpha = Math.min(0.85, 0.05 + Math.abs(wv) * 0.3);
          c.lineWidth = Math.min(2.5, 0.3 + Math.abs(wv) * 0.8);
          c.beginPath(); c.moveTo(...pos[l][i]); c.lineTo(...pos[l + 1][j]); c.stroke();
        }
    c.globalAlpha = 1;
    pos.forEach((layer) => layer.forEach(([x, y]) => { c.fillStyle = ML.cssVar("--ink"); c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); }));
    // a little fish in the champion's family colour
    c.fillStyle = `hsl(${((net.family || 0) * 137.5) % 360} 85% 62%)`;
    c.beginPath(); c.ellipse(Wc - 22, 14, 9, 5.5, 0, 0, 7); c.fill();
    c.beginPath(); c.moveTo(Wc - 30, 14); c.lineTo(Wc - 37, 9); c.lineTo(Wc - 37, 19); c.closePath(); c.fill();
  }

  // ---------- leader + inside card ----------
  function stableLead(w) {
    const best = w.leader();
    const cur = w._lead;
    if (cur && cur.alive && best && best.eaten - cur.eaten < 3) return cur;
    w._lead = best;
    return best;
  }
  const EYE_ORDER = [2, 0, 1, 4, 5, 3]; // front-left, front, front-right / back-left, behind, back-right
  const eyesHost = document.getElementById("eyes");
  eyesHost.innerHTML = EYE_ORDER.map((e) => `<div class="eye" data-e="${e}"><span class="nm">${EYE_NAMES[e]}</span>${CHANNELS.map((c, ci) => `<div class="ch" title="${c}"><i style="background:${CH_COL[ci]}"></i><div class="bar"><span style="width:0;background:${CH_COL[ci]}"></span></div></div>`).join("")}</div>`).join("");
  const eyeEls = [...eyesHost.querySelectorAll(".eye")];
  let insideTick = 0;
  function renderInside(w, f, who) {
    if (++insideTick % 8) return;
    const host = document.getElementById("inside"), dec = document.getElementById("decision");
    if (!f || !f.input) { host.innerHTML = `<span class="muted">Nobody to peek inside right now.</span>`; dec.innerHTML = ""; return; }
    const x = f.input;
    eyeEls.forEach((el) => {
      const e = +el.dataset.e;
      el.querySelectorAll(".bar span").forEach((s, ci) => (s.style.width = `${Math.round(x[e * 4 + ci] * 100)}%`));
      el.classList.toggle("alarm", x[e * 4 + 1] > 0.05);
    });
    let sh = -1, shv = 0, pl = -1, plv = 0, friends = 0;
    for (let e = 0; e < EYES.length; e++) {
      if (x[e * 4 + 1] > shv) { shv = x[e * 4 + 1]; sh = e; }
      if (x[e * 4] > plv) { plv = x[e * 4]; pl = e; }
      if (x[e * 4 + 3] > 0) friends++;
    }
    const energy = Math.round(((x[EYES.length * 4] + 1) / 2) * 100);
    const sees = sh >= 0 ? `${ML.icon("zap")} Sees the <b style="color:var(--bad)">shark</b> (${EYE_NAMES[sh]} eye)` : pl >= 0 ? `${ML.icon("eye")} Spots <b style="color:var(--good)">plankton</b> (${EYE_NAMES[pl]} eye)` : `${ML.icon("eye")} Sees nothing tasty or scary`;
    host.innerHTML = `<div style="font-size:.86rem;font-weight:800;color:var(--muted)">${who}</div>
      <div>${sees}${friends ? ` · ${friends} eye${friends > 1 ? "s" : ""} see friends` : ""}</div>
      <div>${ML.icon("heart")} Tummy <b>${energy}%</b> full · ${f.eaten} snacks</div>`;
    if (f.human) { dec.innerHTML = `${ML.icon("gamepad")} You are the brain! A robot fish only gets these 25 numbers.`; return; }
    if (!f.alive) { dec.innerHTML = `${ML.icon("x")} This fish was ${f.why === "shark" ? "eaten" : "too hungry"}.`; return; }
    const turn = f.turn > 0.25 ? "turn RIGHT" : f.turn < -0.25 ? "turn LEFT" : "go straight";
    const spd = f.thrust > 0.66 ? "dash fast" : f.thrust < 0.33 ? "cruise slowly" : "swim steady";
    dec.innerHTML = `${ML.icon("network")} 8 neurons mix it all up → brain says: <b style="color:var(--accent)">${turn}, ${spd}</b>`;
  }

  function renderStats(w) {
    document.getElementById("st-gen").textContent = state.gen;
    document.getElementById("st-alive").textContent = w.fish.filter((f) => f.alive).length;
    const n = state.surv.length;
    document.getElementById("st-surv").innerHTML = n ? `${state.surv[n - 1]}<small>%</small>` : "–";
    document.getElementById("st-food").textContent = n ? state.food[n - 1].toFixed(1) : "–";
  }

  const scoreRow = document.getElementById("score-row");
  let scoreTick = 0;
  function renderScore() {
    if (++scoreTick % 10) return;
    const p = state.play;
    if (!p) {
      scoreRow.innerHTML = state.replay ? `<span>Replaying <b>${state.replay.ck.label}</b>'s champion × 40</span>` : `<span>Generation <b>${state.gen}</b></span><span>Generation 1 average: <b>${state.surv.length ? state.surv[0] + "%" : "–"}</b></span>`;
      return;
    }
    const w = p.world;
    if (p.kind === "fish") {
      const me = w.fish[0];
      scoreRow.innerHTML = `<span>Time <b>${secs(me.t)} s</b></span><span>Snacks <b>${me.eaten}</b></span><span>Tummy <b>${Math.max(0, Math.round(me.energy * 100))}%</b></span>${state.fishBest ? `<span>Your best <b>${secs(state.fishBest.t)} s</b></span>` : ""}`;
    } else {
      const s = w.sharks[0];
      scoreRow.innerHTML = `<span>Caught <b>${s.caught}</b> / ${POP}</span><span>Missed (crowd) <b>${s.misses || 0}</b></span><span>Time left <b>${Math.max(0, (w.maxSteps - w.steps) / 60).toFixed(0)} s</b></span><span>Fish from gen <b>${state.gen}</b></span>`;
    }
  }

  // ---------- play modes ----------
  function onPlayEvent(e) {
    const p = state.play;
    if (p.kind === "fish" && e.fish && e.fish.human) {
      if (e.type === "eat") {
        p.snacks++;
        if (p.snacks === 1) ML.say("Yum, your first snack! Each one fills your tummy ring. Swimming fast empties it quicker.");
        else if (p.snacks === 8) ML.say("Eight snacks! You've found a <b>plankton patch</b>: the green glow. The robot fish have to discover that too.");
      }
    }
    if (p.kind === "shark") {
      if (e.type === "miss" && !p.missSaid) { p.missSaid = true; ML.say("Missed! The fish was in a crowd and the bite slipped. That's the <b>confusion effect</b>: real sharks find it hard to pick one fish out of a school."); }
      if (e.type === "catch" && e.shark && e.shark.human && e.shark.caught === 1) ML.say("CHOMP! Your first catch. After a bite you slow down for a moment to munch.");
    }
  }
  function playFrame() {
    const p = state.play, w = p.world;
    const target = p.kind === "fish" ? w.fish[0] : w.sharks[0];
    const c = controlFor(target);
    if (!p.over) { w.step(c); pullEvents(w); }
    if (p.kind === "fish") {
      const me = w.fish[0];
      if (!p.over && (!me.alive || w.done)) {
        p.over = true; p.overAt = performance.now(); state.done.fish = true;
        const best = state.fishBest;
        if (!best || me.t > best.t || (me.t === best.t && me.eaten > best.eaten)) state.fishBest = { t: me.t, eaten: me.eaten };
        const robo = state.surv.length ? `Robot fish in generation 1 lived about ${secs((state.surv[0] / 100) * STEPS)} s.` : "";
        if (me.alive) { ML.confetti(50); ML.toast(`${ML.icon("trophy")} You survived all 20 s!`); ML.say(`You survived the whole 20 seconds and ate <b>${me.eaten}</b> snacks! Now press <b>Fish learn</b> and see if robot fish can figure that out with no help.`); }
        else if (me.why === "shark") ML.say(`CHOMP! The shark got you after <b>${secs(me.t)} s</b> (${me.eaten} snacks). ${robo} Press <kbd>Space</kbd> or tap the tank to swim again, or press <b>Fish learn</b>.`);
        else ML.say(`Your tummy ran empty after <b>${secs(me.t)} s</b>. Eat more green plankton, and don't dash all the time! Press <kbd>Space</kbd> or tap to try again.`);
      }
      const me2 = w.fish[0];
      drawWorld(w, performance.now(), `You are the yellow fish · ${Math.max(0, (w.maxSteps - w.steps) / 60).toFixed(0)} s left`, {
        lead: me2.alive ? me2 : null,
        banner: p.over ? [me2.alive ? "You made it!" : me2.why === "shark" ? "Chomp!" : "Too hungry!", "Space or tap to swim again"] : null,
      });
      renderInside(w, me2, "Your fish (you are its brain)");
      if (p.over && performance.now() - p.overAt > 6000) startFish();
    } else {
      const s = w.sharks[0];
      if (!p.over && w.done) {
        p.over = true; p.overAt = performance.now(); state.done.shark = true;
        state.sharkLog.push({ gen: state.gen, caught: s.caught, misses: s.misses || 0 });
        const prev = state.sharkLog.length > 1 ? state.sharkLog[state.sharkLog.length - 2] : null;
        let cmp = "";
        if (prev && prev.gen !== state.gen) cmp = prev.caught > s.caught ? ` Against generation ${prev.gen} you caught ${prev.caught}. The fish got <b>harder to catch</b>!` : ` Against generation ${prev.gen} you caught ${prev.caught}.`;
        else if (state.gen <= 2) cmp = " These are baby fish with random brains. Train them for a while, then come back and hunt again!";
        ML.say(`Time's up! You caught <b>${s.caught}</b> fish and missed <b>${s.misses || 0}</b> bites in crowds.${cmp}`);
        ML.toast(`${ML.icon("fish")} You caught ${s.caught}`);
      }
      // the fish nearest to your shark is the one we peek inside
      let near = null, nd = Infinity;
      for (const f of w.fish) if (f.alive) { const d = Math.hypot(f.x - s.x, f.y - s.y); if (d < nd) { nd = d; near = f; } }
      drawWorld(w, performance.now(), `You are the pink shark · ${Math.max(0, (w.maxSteps - w.steps) / 60).toFixed(0)} s left`, {
        lead: near, banner: p.over ? [`You caught ${s.caught}!`, "Space or tap to hunt again"] : null,
      });
      renderInside(w, near, "The fish nearest your shark");
    }
  }

  // ---------- input: keys, pointer, pad ----------
  const keys = { left: false, right: false, up: false, down: false };
  const ptr = { on: false, x: 0, y: 0 };
  function controlFor(ent) {
    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (ptr.on) { dx = ptr.x - ent.x; dy = ptr.y - ent.y; if (Math.hypot(dx, dy) < 6) return { on: false }; }
    return { on: dx !== 0 || dy !== 0, dx, dy };
  }
  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
  const typing = (e) => e.target && e.target.matches && (e.target.matches("input, textarea, select") || e.target.isContentEditable);
  document.addEventListener("keydown", (e) => {
    if (typing(e)) return;
    if (state.play && keyMap[e.code]) { e.preventDefault(); keys[keyMap[e.code]] = true; nudge.touch(); }
    if (e.code === "Space" && (e.target === document.body || e.target === tankEl)) {
      e.preventDefault(); nudge.touch();
      if (state.play && state.play.over) state.play.kind === "fish" ? startFish() : startShark();
      else if (state.mode === "learn") playBtn.click();
    }
  });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; ptr.on = false; });
  const setPtr = (e) => { const p = ML.canvasPoint(tankEl, e, W, H); ptr.x = p.x; ptr.y = p.y; };
  tankEl.addEventListener("pointerdown", (e) => {
    nudge.touch();
    if (!state.play) { ML.toast("Pick <b>Be a fish</b> or <b>Be the shark</b> to steer", 1800); return; }
    if (state.play.over) { state.play.kind === "fish" ? startFish() : startShark(); return; }
    e.preventDefault();
    tankEl.setPointerCapture && tankEl.setPointerCapture(e.pointerId);
    ptr.on = true; setPtr(e);
  });
  tankEl.addEventListener("pointermove", (e) => { if (ptr.on) setPtr(e); });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => tankEl.addEventListener(ev, () => (ptr.on = false)));
  document.querySelectorAll("#pad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); keys[k] = true; b.classList.add("pressed"); nudge.touch(); if (state.play && state.play.over) state.play.kind === "fish" ? startFish() : startShark(); };
    const off = () => { keys[k] = false; b.classList.remove("pressed"); };
    b.addEventListener("pointerdown", on);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, off));
  });

  // ---------- modes + controls ----------
  const modeBtns = document.querySelectorAll("#mode [data-m]");
  const pad = document.getElementById("pad");
  function setMode(m) {
    state.mode = m;
    modeBtns.forEach((b) => { const on = b.dataset.m === m; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    state.replay = null; ckpts.active = null; ckpts.render();
    for (const k in keys) keys[k] = false;
    ptr.on = false; fx.length = 0;
    pad.classList.toggle("show", m !== "learn");
    if (m === "fish") { state.playing = false; startFish(); ML.say(`You're the <b>yellow fish</b>. Arrow keys or WASD to swim (or press and hold on the water). Eat <b>green plankton</b>, dodge the shark. The other fish are robots from generation ${state.gen}.`); }
    else if (m === "shark") { state.playing = false; startShark(); ML.say(`You're the <b>pink shark</b>! Hunt the fish from generation ${state.gen}. Arrow keys or press on the water to chase. Watch out: crowds can make you miss.`); }
    else {
      state.play = null;
      if (!state.playing) { state.playing = true; }
      if (state.gen === 1 && state.world.steps === 0) ML.say("Here come 40 baby fish with <b>random brains</b>. Each colour is a family. The crowned fish is the leader: the lines show what its six eyes see. Watch the colours: winning families take over!");
      else ML.say("Back to training! The chart adds a dot every generation.");
    }
    syncPlay();
  }
  modeBtns.forEach((b) => b.addEventListener("click", () => { nudge.touch(); if (b.dataset.m !== state.mode || b.dataset.m !== "learn") setMode(b.dataset.m); }));

  const playBtn = document.getElementById("play");
  function syncPlay() {
    const run = state.mode === "learn" && state.playing && !state.replay;
    playBtn.innerHTML = run ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Watch them learn`;
  }
  playBtn.addEventListener("click", () => {
    nudge.touch();
    if (state.mode !== "learn") { setMode("learn"); return; }
    if (state.replay) { state.replay = null; ckpts.active = null; ckpts.render(); state.playing = true; syncPlay(); return; }
    state.playing = !state.playing;
    syncPlay();
  });
  document.getElementById("skip").addEventListener("click", () => {
    nudge.touch();
    if (state.mode !== "learn") setMode("learn");
    state.replay = null;
    const w = state.world;
    while (!w.done) w.step();
    finishGeneration();
  });
  document.getElementById("reset").addEventListener("click", () => {
    nudge.touch();
    state.brains = freshBrains();
    state.gen = 1; state.surv = []; state.aliveEnd = []; state.food = []; state.buddies = []; state.markers = []; state.pending = []; state.said = {};
    state.best = null; state.celebrated = false;
    ckpts.clear(); newTrainingWorld(); drawChart();
    if (state.play) state.play.kind === "fish" ? startFish() : startShark();
    ML.say("Brand-new random brains. Everything the school learned is gone. Challenges you switched on stay on.");
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    nudge.touch();
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
    if (state.speed === 0) ML.say("Turbo! Generations fly by. Keep an eye on the chart, and on how the fish colours change as winning families take over.");
  }));
  ML.bindRange("#mut", (v) => v.toFixed(2), (v) => { state.mutation = v; });
  document.getElementById("mut").addEventListener("change", () => {
    nudge.touch();
    ML.say(state.mutation > 0.55 ? "Wild babies! Big changes find new ideas fast, but often break what already worked. Watch the chart get jumpy." : state.mutation < 0.15 ? "Careful copies. Babies are almost twins of their parents: steady, but slow to find new tricks." : "A good middle setting: babies are a bit different from their parents.");
  });
  document.getElementById("rays").addEventListener("change", (e) => { state.rays = e.target.checked; nudge.touch(); });
  document.getElementById("trails").addEventListener("change", (e) => {
    state.trails = e.target.checked; nudge.touch();
    if (state.trails) ML.say("Trails on! When several trails run side by side, those fish are moving as a <b>school</b>.");
  });

  // ---------- checkpoints ----------
  const ckpts = new GameLab.Checkpoints(document.getElementById("ckpts"), (ck) => {
    nudge.touch();
    if (state.mode !== "learn") setMode("learn");
    state.playing = false; startReplay(ck); syncPlay();
    ML.say(`A school of 40 copies of <b>${ck.label}</b>'s champion. Watch how it hunts and hides. Press <b>Back to live</b> to keep training.`);
  }, () => { state.replay = null; state.playing = true; syncPlay(); });
  ckpts.render();

  // ---------- main loop ----------
  function stepTraining() {
    const w = state.world;
    if (state.speed === 0) {
      const t0 = performance.now();
      let guard = 0; // also cap the work, in case the clock is frozen (e.g. a headless preview)
      while (performance.now() - t0 < 10 && guard++ < 80) {
        for (let i = 0; i < 30 && !state.world.done; i++) state.world.step();
        if (state.world.done) finishGeneration();
      }
      state.world._ev = state.world.steps; // no effects in turbo
      return;
    }
    for (let i = 0, n = ML.ticks(state.speed); i < n && !w.done; i++) w.step();
    pullEvents(w);
    if (w.done) finishGeneration();
  }
  function frame(t) {
    if (state.play) { playFrame(); renderScore(); }
    else if (state.replay) {
      const r = state.replay, w = r.world;
      if (!w.done) { w.step(); pullEvents(w); }
      if (w.done && !r.said) {
        r.said = true;
        const s = w.stats();
        ML.say(`${r.ck.label}'s champion school: lived <b>${pct(s.survival)}%</b> of the time, ${pct(s.aliveEnd)}% made it to the end, ${s.food.toFixed(1)} snacks each. Tap another checkpoint to compare!`);
        setTimeout(() => { if (state.replay === r) startReplay(r.ck); }, 2500);
      }
      const lead = stableLead(w);
      drawWorld(w, t, `Replaying ${r.ck.label}'s champion × 40`, { lead });
      renderInside(w, lead, `${r.ck.label}'s champion`);
      renderScore();
    } else {
      if (state.playing) stepTraining();
      const w = state.world, lead = stableLead(w);
      drawWorld(w, t, state.speed === 0 && state.playing ? `Generation ${state.gen} · Turbo` : `Generation ${state.gen} · ${Math.max(0, (w.maxSteps - w.steps) / 60).toFixed(0)} s left${state.playing ? "" : " · paused"}`, { lead });
      renderInside(w, lead, `Leader fish (crowned) · generation ${state.gen}`);
      renderStats(w);
      renderScore();
    }
    requestAnimationFrame(frame);
  }

  // ---------- idle nudge: point to the next step ----------
  const nudge = {
    last: performance.now(), lastSaid: 0,
    touch() { this.last = performance.now(); },
    next() {
      const d = state.done;
      if (!d.fish && state.mode === "fish") return "Psst! Press the <b>arrow keys</b> (or press and hold on the water) to swim your yellow fish toward the green plankton.";
      if (!d.learn) return state.mode === "learn" && !state.playing ? "Press <b>Watch them learn</b> to let the robot fish start evolving." : "Ready for robots? Press <b>Fish learn</b> and watch 40 random brains try the same thing.";
      if (state.surv.length < 10 && state.speed !== 0) return "Learning takes many generations. Try <b>Turbo</b> speed and watch the chart climb.";
      if (!d.shark) return "Think the fish got smart? Press <b>Be the shark</b> and try to catch them yourself!";
      if (!d.chal) return "Now make it harder: switch on a <b>challenge</b> like <b>Two sharks</b> and watch the chart dip, then recover.";
      if (ckpts.items.length > 3 && !ckpts.active) return "Tap an early <b>checkpoint</b> and then a late one. Can you see the difference in how they swim?";
      return "Open <b>X-ray the model</b> to see which of the 25 senses the fish brain listens to most.";
    },
  };
  ["pointerdown", "keydown", "wheel"].forEach((ev) => document.addEventListener(ev, () => nudge.touch(), { passive: true }));
  setInterval(() => {
    const now = performance.now();
    if (now - nudge.last > 15000 && now - nudge.lastSaid > 15000 && !document.hidden) {
      if (state.mode === "learn" && state.playing && state.speed !== 0 && state.surv.length < 3) return; // they're watching
      nudge.lastSaid = now;
      ML.say(nudge.next());
    }
  }, 1000);

  // ---------- X-ray ----------
  const xSamples = [];
  setInterval(() => {
    const w = state.world, f = w && stableLead(w);
    if (f && f.input) { xSamples.push(Array.from(f.input)); if (xSamples.length > 300) xSamples.shift(); }
  }, 300);
  const shortIn = F.INPUT_NAMES.map((n) => n.replace("plankton", "food").replace("(", "").replace(")", ""));
  let xNet = null;
  const net = () => xNet || state.best || state.brains[0];
  ML.xray.register({
    title: "A fish brain",
    kind: "Neural network (evolved)",
    summary: () => `the champion of generation ${Math.max(1, state.gen - 1)}`,
    size: () => `${net().genes.length} numbers (weights), all found by evolution`,
    stats: () => [["Generations", state.surv.length], ["Survived (last gen)", state.surv.length ? `${state.surv[state.surv.length - 1]}%` : "–"], ["Snacks per fish", state.food.length ? state.food[state.food.length - 1].toFixed(1) : "–"]],
    inputs: F.INPUT_NAMES.map((n, i) => ({ key: "i" + i, name: n, min: i === F.INPUT_NAMES.length - 1 ? -1 : 0, max: 1, step: 0.05,
      describe: i === F.INPUT_NAMES.length - 1 ? (v) => `${Math.round(((v + 1) / 2) * 100)}% full` : (v) => (v <= 0 ? "nothing seen" : v > 0.7 ? "very close" : v > 0.35 ? "near" : "far") })),
    outputs: [{ name: "Turn left" }, { name: "Go straight" }, { name: "Turn right" }],
    predict: (x) => { const o = net().forward(x); return [-o[0], 0.35 - Math.abs(o[0]), o[0]]; },
    samples: () => xSamples,
    current: () => { const f = state.world && stableLead(state.world); return f && f.input ? Array.from(f.input) : null; },
    brainHeight: 560,
    drawBrain: (cv) => ML.xray.drawNet(cv, SIZES, (l, i, j) => net().weight(l, i, j), shortIn, ["turn", "speed"]),
    brainCaption: ML.xray.NET_CAPTION,
    notes: ["Each eye has four numbers: how close the nearest plankton, shark, wall and fish friend is (0 = nothing seen). Try the shark inputs in “what if” and watch the turn flip.",
      "Evolution only ever saw the score (time alive + snacks). It never saw a single labelled example."],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { xNet = (state.best || state.brains[0]).clone(); _xo(); };
  ML.xray.button(document.getElementById("train-btns"));

  document.addEventListener("themechange", () => { bgCache = null; drawChart(); ckpts.render(); });

  newTrainingWorld();
  drawChart();
  setMode("fish");
  ML.say("Welcome to the tank! <b>You</b> are the yellow fish. Steer with the arrow keys (or press on the water) to gobble <b>green plankton</b> and stay away from the <b>shark</b>. How long can you last?");
  requestAnimationFrame(frame);
  AliveChip.init({ label: "Still swimming", toggleHost: "#alive-field", count: () => (state.play || state.replay || !state.world ? null : [state.world.fish.filter((f) => f.alive).length, state.world.fish.length]) });
  const at = document.querySelector("#alive-field .alive-toggle");
  if (at) { at.insertAdjacentHTML("afterend", `<div class="hint">A little box on the tank counting how many robot fish are still swimming this generation.</div>`); }
})();
