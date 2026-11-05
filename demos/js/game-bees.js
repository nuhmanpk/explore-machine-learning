// Busy Bees — UI: the meadow, the bees, the kid's turn, charts, beliefs, challenges, checkpoints.
(function () {
  const B = window.BeesCore;
  const { STRATS, ORDER } = B;
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fill the "Meet the model" text if the catalog entry is still a placeholder (common.js renders it on DOMContentLoaded).
  if (window.MODELS && MODELS["game-bees"] && !MODELS["game-bees"].kid) {
    Object.assign(MODELS["game-bees"], {
      kid: "Each hive keeps a little notebook: visits and nectar for every flower. The clever hives also remember how <b>unsure</b> they are, and give unsure flowers a chance.",
      learn: ["Visit a flower and write down: nectar or not.", "Score every flower, plus a bonus (Curious) or a dream (Dreamer) for flowers you're unsure about.", "Fly to the best score. Unsure flowers get fewer tries as you learn."],
    });
  }

  const W = 640, H = 400;
  const meadowEl = document.getElementById("meadow");
  const cv = ML.setupCanvas(meadowEl, W, H);
  const chart = ML.setupCanvas(document.getElementById("chart"), 640, 160);
  const regretCv = ML.setupCanvas(document.getElementById("regret"), 640, 140);
  const belief = ML.setupCanvas(document.getElementById("belief"), 300, 210);
  const ctx = cv.ctx;

  const PETALS = ["#ff6b8b", "#ffd23f", "#b388ff", "#ff9f43", "#4fc3f7", "#f78fb3", "#7bed9f", "#ffb142"];
  const SPOTS = [[190, 205], [290, 145], [390, 220], [490, 135], [580, 200], [225, 305], [460, 308], [590, 305]];
  const HIVE = { x: 75, y: 300 };
  const KID_N = 20;

  const state = {
    mode: "kid",
    seed: 7,
    race: null,
    playing: false,
    speed: 15,
    acc: 0,
    focus: "ts",
    peek: false,
    bees: {},
    pops: [],
    kid: null,
    kidBee: { x: HIVE.x, y: HIVE.y - 40, tx: HIVE.x, ty: HIVE.y - 40 },
    challenges: [],
    used: { drift: false, bloom: 0, trick: false },
    viewing: null,
    lastAct: performance.now(),
    did: { kid: false, play: false, chal: false, ckpt: false, focus: false },
    lastNudge: 0,
    lastBlock: 0,
    nextCk: 0,
    hover: -1,
  };
  const CKPT_AT = [5, 20, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600];

  function newRace() {
    state.seed = (state.seed * 7919 + 13) % 100000;
    state.race = new B.Race(state.seed, { gamma: memoryValue(), eps: epsValue() });
    state.bees = {};
    ORDER.forEach((id, k) => (state.bees[id] = { x: HIVE.x + 10 * k, y: HIVE.y - 20, tx: HIVE.x, ty: HIVE.y, arm: -1, phase: k * 1.7 }));
    state.kid = { meadow: state.race.meadow.clone(), r: B.rng(state.seed + 99), visits: [], n: [], got: [], expGot: 0, bestGot: 0, done: false };
    state.challenges = [];
    state.used = { drift: false, bloom: 0, trick: false };
    state.viewing = null;
    state.lastBlock = 0;
    state.nextCk = 0;
    state.pops = [];
    ckpts.clear();
    document.querySelectorAll("#chal button").forEach((b) => { b.disabled = false; b.classList.remove("on"); });
    document.querySelector('#chal [data-c="drift"] .tag').textContent = "nectar moves";
    document.getElementById("try-this").textContent = "";
    buildFlowerKeys();
    renderBoard();
    renderKid();
    drawCharts();
    drawBelief();
  }
  const epsValue = () => parseFloat(document.getElementById("eps").value);
  const memoryValue = () => parseFloat(document.querySelector("#memory .on").dataset.v);

  // ---------- the kid's turn ----------
  function buildFlowerKeys() {
    const host = document.getElementById("flower-keys");
    const m = state.mode === "kid" ? state.kid.meadow : state.race.meadow;
    host.innerHTML = m.flowers.map((f, i) => `<button class="btn small" data-i="${i}" aria-label="Visit ${f.name}, key ${i + 1}"><i class="dot" style="background:${PETALS[i % PETALS.length]}"></i>${i + 1}</button>`).join("");
    host.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => kidVisit(+b.dataset.i)));
  }
  function kidVisit(i) {
    const k = state.kid;
    if (state.mode !== "kid" || k.done || i >= k.meadow.k) return;
    touch();
    state.did.kid = true;
    const m = k.meadow;
    const reward = m.pull(i, k.r);
    k.n[i] = (k.n[i] || 0) + 1;
    k.got[i] = (k.got[i] || 0) + reward;
    k.visits.push(i);
    k.expGot += m.mean(i);
    k.bestGot += m.bestMean();
    const sp = spot(i);
    state.kidBee.tx = sp[0]; state.kidBee.ty = sp[1] - 30;
    addPop(sp[0], sp[1] - 52, reward ? "+" + reward + " nectar!" : "empty", reward ? "--good" : "--muted");
    const n = k.visits.length;
    if (n >= KID_N) {
      k.done = true;
      const yours = Math.round((100 * k.expGot) / k.bestGot);
      const robots = B.firstVisits(KID_N);
      const bestI = m.best();
      const total = k.got.reduce((a, b) => a + (b || 0), 0);
      ML.say(`Done! You got <b>${total}</b> nectar. Your picks were <b>${yours}%</b> as good as always picking the best flower. The secret best was <b>${m.flowers[bestI].name}</b> (${Math.round(m.flowers[bestI].p * 100)}% full). In their first 20 visits the Dreamer hive averages <b>${robots.ts}%</b>, Random <b>${robots.rand}%</b>. Now press <b>Watch the hives</b>!`);
      ML.toast(`You scored ${yours}% of perfect!`);
      if (yours >= robots.ts) ML.confetti(50);
    } else {
      const fav = favourite(k);
      if (n === 1) ML.say(reward ? `Nectar! Is ${m.flowers[i].name} the best? One visit can't tell you. Try others too!` : `Empty! Was that bad luck, or a bad flower? Only more visits can tell.`);
      else if (n === 6 && new Set(k.visits).size <= 2) ML.say(`You keep going back to the same ${new Set(k.visits).size === 1 ? "flower" : "two flowers"}. That's <b>sticking</b>. But what if another flower is sweeter? That's the try-or-stick puzzle!`);
      else if (n === 6) ML.say(`You've tried <b>${new Set(k.visits).size}</b> different flowers. That's <b>exploring</b>. When will you start sticking with your favourite?`);
      else if (n === 12 && fav >= 0) ML.say(`So far <b>${m.flowers[fav].name}</b> looks sweetest to you (${k.got[fav]}/${k.n[fav]}). Sure? ${k.n[fav] < 4 ? "That's only a few visits…" : "That's quite a few visits, good evidence!"}`);
      else if (n === 17) ML.say(`3 visits left. Spend them on your favourite, or one more try?`);
    }
    renderKid();
  }
  function favourite(k) {
    let best = -1, bv = -1;
    k.n.forEach((n, i) => { if (n) { const v = (k.got[i] + 1) / (n + 2); if (v > bv) { bv = v; best = i; } } });
    return best;
  }
  function renderKid() {
    const k = state.kid;
    const total = k.got.reduce((a, b) => a + (b || 0), 0);
    document.getElementById("kid-score").innerHTML = k.done
      ? `Done! Nectar: <b>${total}</b>. <button class="btn small ghost" id="kid-again">Play again</button>`
      : `Visits: <b>${k.visits.length}</b> / ${KID_N} · Nectar: <b>${total}</b>`;
    const again = document.getElementById("kid-again");
    if (again) again.addEventListener("click", () => { newRace(); ML.say(`A brand-new meadow with new secret nectar. Tap a flower!`); });
  }

  // ---------- running the hives ----------
  function step() {
    const race = state.race;
    const out = race.step();
    const slow = state.speed <= 15;
    for (const o of out) {
      const b = state.bees[o.id];
      b.arm = o.arm;
      const sp = spot(o.arm);
      b.tx = sp[0] + (ORDER.indexOf(o.id) - 1.5) * 12;
      b.ty = sp[1] - 24 - ORDER.indexOf(o.id) * 5;
      if (slow && o.reward && !reduceMotion && o.id === state.focus) addPop(sp[0], sp[1] - 50, "+" + o.reward, STRATS[o.id].color);
    }
    const ts = race.hives.ts;
    if (ts.visits >= CKPT_AT[state.nextCk]) { ckpts.add(makeCheckpoint(ts.visits)); state.nextCk++; }
    if (ts.blocks.length !== state.lastBlock) { state.lastBlock = ts.blocks.length; onBlock(); }
  }
  function onBlock() {
    const race = state.race, n = race.hives.ts.blocks.length;
    drawCharts();
    renderBoard();
    checkChallenges();
    if (state.challenges.length) return;
    if (state.speed > 50 && n % 8) return;
    const r = (id) => Math.round(race.hives[id].blocks[n - 1]);
    const lead = ORDER.slice().sort((a, b) => race.hives[a].regret - race.hives[b].regret)[0];
    if (n === 1) ML.say(`First 25 visits each! Everyone is still exploring. Random got <b>${r("rand")}%</b>, Dreamer <b>${r("ts")}%</b>.`);
    else if (n === 4) ML.say(`Look at "Nectar missed": the <b>Random</b> line keeps climbing, it never learns. The others are bending.`);
    else if (n === 10) ML.say(`The <b>${STRATS[lead].name}</b> has missed the least nectar so far. Notice the yellow Greedy+dice bee still visits random flowers sometimes. Try sliding its dice to 0!`);
    else if (n === 16) ML.say(`The hives have mostly made up their minds. Now try a <b>challenge</b> on the left: can they notice when the meadow changes?`);
    else if (n % 12 === 0) ML.say(`${state.race.hives.ts.visits} visits each. Dreamer: <b>${r("ts")}%</b>, Curious: <b>${r("ucb")}%</b>, Greedy+dice: <b>${r("eps")}%</b>, Random: <b>${r("rand")}%</b>.`);
  }

  function loop(now) {
    if (state.playing && state.mode === "auto" && !state.viewing) {
      state.acc += (state.speed * Math.min(100, now - (loop.last || now))) / 1000;
      let k = Math.min(400, Math.floor(state.acc));
      state.acc -= Math.floor(state.acc);
      while (k-- > 0) step();
    }
    loop.last = now;
    animate();
    drawMeadow(now);
    if (state.mode === "auto" && (!loop.bt || now - loop.bt > 120)) { drawBelief(); loop.bt = now; }
    requestAnimationFrame(loop);
  }

  function animate() {
    const ease = reduceMotion ? 1 : Math.min(0.35, 0.06 + state.speed / 400);
    for (const id of ORDER) {
      const b = state.bees[id];
      b.x += (b.tx - b.x) * ease;
      b.y += (b.ty - b.y) * ease;
    }
    const kb = state.kidBee;
    const ke = reduceMotion ? 1 : 0.15;
    kb.x += (kb.tx - kb.x) * ke; kb.y += (kb.ty - kb.y) * ke;
    state.pops = state.pops.filter((p) => (p.life -= reduceMotion ? 0.05 : 0.02) > 0);
  }
  function addPop(x, y, text, color) { state.pops.push({ x, y, text, color, life: 1 }); }

  // ---------- drawing the meadow ----------
  const spot = (i) => SPOTS[i % SPOTS.length];
  function meadowNow() { return state.mode === "kid" ? state.kid.meadow : state.race.meadow; }

  function drawMeadow(now) {
    const dark = ML.isDark();
    const m = meadowNow();
    // sky + grass (darker at evening when time-of-day drift is on)
    const part = m.drift ? m.part : -1;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    const skies = dark ? [["#1b2440", "#24324f"], ["#1b2440", "#2a3a5c"], ["#1d1a3a", "#3b2a4d"]] : [["#bfe6ff", "#e6f6ff"], ["#9fd8ff", "#dff3ff"], ["#ffc49b", "#ffe3c4"]];
    const sk = part >= 0 ? skies[part] : skies[0];
    sky.addColorStop(0, sk[0]); sky.addColorStop(0.45, sk[1]);
    sky.addColorStop(0.46, dark ? "#1e3b2a" : "#a8e08a"); sky.addColorStop(1, dark ? "#16301f" : "#7cc96a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // sun / moon travels across the sky with the time of day
    const sunX = part >= 0 ? 120 + part * 200 : 560;
    ctx.fillStyle = dark ? "#f4f1c9" : part === 2 ? "#ff8a4c" : "#ffd23f";
    ctx.beginPath(); ctx.arc(sunX, 50 + (part === 2 ? 40 : 0), 24, 0, 7); ctx.fill();
    if (part >= 0) {
      ctx.fillStyle = dark ? "#e8ecff" : "#2b3a55";
      ctx.font = "800 14px Nunito, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(B.TIME_NAMES[part], 14, 24);
    }
    drawHive();
    // flowers
    const race = state.race;
    const recentShare = (id, i) => { const r = race.hives[id].recent; return r.length ? r.filter((a) => a === i).length / r.length : 0; };
    m.flowers.forEach((f, i) => {
      const [x, y] = spot(i);
      const sway = reduceMotion ? 0 : Math.sin(now / 900 + i) * 2;
      drawFlower(x + sway, y, i, f, dark);
      ctx.textAlign = "center";
      ctx.font = "800 12px Nunito, sans-serif";
      ctx.fillStyle = dark ? "#e8ecff" : "#1f2a3d";
      ctx.fillText(`${i + 1} ${f.name}`, x, y + 52);
      if (state.peek) {
        // secret nectar meter
        ctx.fillStyle = dark ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.75)";
        roundRect(x + 26, y - 30, 10, 44, 4); ctx.fill();
        ctx.fillStyle = "#ffb000";
        const hgt = 44 * Math.min(1, f.p);
        roundRect(x + 26, y + 14 - hgt, 10, hgt, 4); ctx.fill();
        ctx.font = "800 10px Nunito, sans-serif";
        ctx.fillStyle = dark ? "#ffd27a" : "#8a5a00";
        ctx.fillText(f.cap > 1 ? `${Math.round(f.p * 100)}%×${f.cap}` : Math.round(f.p * 100) + "%", x + 31, y - 34);
      }
      if (state.mode === "auto") {
        // little bars: share of each hive's recent visits
        ORDER.forEach((id, k) => {
          const s = recentShare(id, i);
          ctx.fillStyle = ML.cssVar(STRATS[id].color);
          ctx.fillRect(x - 22 + k * 12, y + 58, 9, 2 + 14 * s);
        });
      } else if (state.kid.n[i]) {
        ctx.font = "800 11px Nunito, sans-serif";
        ctx.fillStyle = dark ? "#cfe" : "#245";
        ctx.fillText(`${state.kid.got[i]} nectar / ${state.kid.n[i]} visits`, x, y + 66);
      }
      if (state.hover === i && state.mode === "kid") {
        ctx.strokeStyle = ML.cssVar("--accent"); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y - 6, 34, 0, 7); ctx.stroke();
      }
    });
    // bees
    if (state.mode === "auto") ORDER.forEach((id) => { const b = state.bees[id]; drawBee(b.x, b.y, ML.cssVar(STRATS[id].color), now + b.phase * 300, 1); });
    else drawBee(state.kidBee.x, state.kidBee.y, "#ff5c9a", now, 1.4);
    // pops
    for (const p of state.pops) {
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = ML.cssVar(p.color);
      ctx.font = "800 15px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.text, p.x, p.y - (1 - p.life) * 30);
    }
    ctx.globalAlpha = 1;
    if (state.viewing) {
      ctx.fillStyle = dark ? "rgba(10,14,30,.55)" : "rgba(255,255,255,.55)";
      ctx.fillRect(0, H - 34, W, 34);
      ctx.fillStyle = dark ? "#fff" : "#1f2a3d";
      ctx.font = "800 14px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`Looking at a checkpoint: ${state.viewing.label}. Tap "Back to live" to continue.`, W / 2, H - 12);
    }
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, Math.max(0, h), r); else ctx.rect(x, y, w, Math.max(0, h));
  }
  function drawHive() {
    const { x, y } = HIVE;
    ctx.strokeStyle = "#6b4a1e"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x, y - 80); ctx.lineTo(x, y + 60); ctx.stroke();
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? "#f2b632" : "#e09b1b";
      const w = 54 - Math.abs(k - 1.5) * 10;
      roundRect(x - w / 2, y - 70 + k * 18, w, 18, 8); ctx.fill();
    }
    ctx.fillStyle = "#3b2a10";
    ctx.beginPath(); ctx.arc(x, y - 18, 7, 0, 7); ctx.fill();
  }
  function drawFlower(x, y, i, f, dark) {
    ctx.strokeStyle = dark ? "#3f8a4f" : "#3e9a49"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 6, y + 22, x, y + 40); ctx.stroke();
    ctx.fillStyle = dark ? "#3f8a4f" : "#4caf50";
    ctx.beginPath(); ctx.ellipse(x + 9, y + 26, 9, 4, -0.5, 0, 7); ctx.fill();
    const col = f.trick ? "#ffcf33" : PETALS[i % PETALS.length];
    const petals = f.trick ? 10 : 6, R = f.trick ? 22 : 19;
    ctx.fillStyle = col;
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * R * 0.6, y - 6 + Math.sin(a) * R * 0.6, R * 0.5, R * 0.32, a, 0, 7); ctx.fill();
    }
    ctx.fillStyle = f.trick ? "#ff7a00" : "#ffe08a";
    ctx.beginPath(); ctx.arc(x, y - 6, R * 0.38, 0, 7); ctx.fill();
    if (f.trick || f.fresh) {
      ctx.fillStyle = dark ? "#fff" : "#1f2a3d";
      ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(f.trick ? "JACKPOT ×4" : "NEW!", x, y - 34);
    }
  }
  function drawBee(x, y, color, t, s) {
    const wob = reduceMotion ? 0 : Math.sin(t / 90) * 2;
    ctx.save();
    ctx.translate(x, y + wob);
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    const flap = reduceMotion ? 0.8 : 0.6 + Math.abs(Math.sin(t / 40)) * 0.5;
    ctx.beginPath(); ctx.ellipse(-3, -8, 6, 9 * flap, -0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4, -8, 6, 9 * flap, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#1f1a10";
    ctx.fillRect(-3, -7, 3, 14); ctx.fillRect(4, -6, 3, 12);
    ctx.beginPath(); ctx.arc(10, -1, 4, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------- charts ----------
  function seriesOf(key) { return ORDER.map((id) => ({ values: state.race.hives[id][key], color: STRATS[id].color, label: STRATS[id].short })); }
  function drawCharts() {
    const race = state.race;
    GameLab.drawChart(chart, seriesOf("blocks"), race.markers, 100, "%");
    const maxR = Math.max(10, ...ORDER.map((id) => race.hives[id].regret));
    const nice = Math.ceil(maxR / 10) * 10;
    GameLab.drawChart(regretCv, seriesOf("regretPts"), race.markers, nice, "");
  }
  function renderBoard() {
    const race = state.race;
    document.getElementById("board").innerHTML = `<div class="row head"><span></span><span>Hive</span><span>Nectar</span><span>Missed</span></div>` +
      ORDER.map((id) => { const h = race.hives[id]; return `<div class="row"><i style="background:var(${STRATS[id].color})"></i><span>${STRATS[id].name}</span><b>${h.nectar}</b><b>${h.regret.toFixed(0)}</b></div>`; }).join("") +
      `<div class="muted" style="font-size:.78rem;font-weight:700">Visits each: ${race.hives.ts.visits}</div>`;
  }
  function buildLegend() {
    document.getElementById("legend").innerHTML = ORDER.map((id) => `<span><i style="background:var(${STRATS[id].color})"></i>${STRATS[id].short}</span>`).join("") +
      `<span class="muted" style="font-weight:700">Bars under flowers = where each hive went lately</span>`;
  }

  // ---------- inside: beliefs ----------
  function drawBelief() {
    const { ctx: c, w, h } = belief;
    c.clearRect(0, 0, w, h);
    const race = state.race, id = state.focus;
    const snap = state.viewing ? state.viewing.strats[id] : null;
    const m = race.meadow;
    const k = snap ? Math.min(snap.k, m.k) : m.k;
    const bel = snap ? beliefsFrom(snap, id) : race.beliefs(id);
    const why = document.getElementById("why");
    c.font = "700 10px Nunito, sans-serif";
    if (id === "ts") {
      // Beta posterior curves
      const L = 8, R = 8, T = 10, Bt = 22;
      c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1;
      c.beginPath(); c.moveTo(L, h - Bt); c.lineTo(w - R, h - Bt); c.stroke();
      c.fillStyle = ML.cssVar("--muted"); c.textAlign = "center";
      ["0%", "50%", "100%"].forEach((t, j) => c.fillText(t, L + ((w - L - R) * j) / 2, h - 8));
      let peak = 1;
      const curves = [];
      for (let i = 0; i < k; i++) {
        const pts = [];
        for (let s = 1; s < 100; s++) { const x = s / 100; const y = B.betaPdf(x, bel[i].a, bel[i].b); pts.push(y); peak = Math.max(peak, y); }
        curves.push(pts);
      }
      peak = Math.min(peak, 30);
      curves.forEach((pts, i) => {
        c.strokeStyle = m.flowers[i].trick ? "#e0a800" : PETALS[i % PETALS.length];
        c.lineWidth = 2.5;
        c.beginPath();
        pts.forEach((y, s) => { const X = L + ((w - L - R) * (s + 1)) / 100, Y = h - Bt - (h - Bt - T) * Math.min(1, y / peak); s ? c.lineTo(X, Y) : c.moveTo(X, Y); });
        c.stroke();
        if (state.peek) {
          const X = L + (w - L - R) * m.flowers[i].p;
          c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X, T); c.lineTo(X, h - Bt); c.stroke(); c.setLineDash([]);
        }
      });
      const s = race.hives.ts.strat.last;
      const most = bel.slice(0, k).reduce((bi, b, i) => (b.a + b.b > bel[bi].a + bel[bi].b ? i : bi), 0);
      why.innerHTML = snap ? `Back then: wide curves = "no idea yet", tall thin curves = "I'm sure". Its surest flower was <b>${m.flowers[most].name}</b>.`
        : s ? `One curve per flower: <b>how full might it be?</b> Wide = unsure, thin = sure. Each visit it rolls a dream number from every curve and flies to the biggest. Last dream winner: <b>${m.flowers[s.arm].name}</b>.` : `Each curve is a flower. Flat = "no idea yet". Press Play!`;
    } else {
      // bars: average nectar per visit, with the curiosity bonus for UCB
      const rowH = (h - 6) / Math.max(6, k);
      const maxV = Math.max(1, ...bel.slice(0, k).map((b) => Math.min(b.cap, b.mean + (isFinite(b.bonus) ? b.bonus : 0))));
      const X0 = 62, BW = w - X0 - 30;
      for (let i = 0; i < k; i++) {
        const y = 3 + i * rowH, b = bel[i];
        c.fillStyle = ML.cssVar("--ink-2"); c.textAlign = "left";
        c.fillText(`${i + 1} ${m.flowers[i].name}`, 2, y + rowH * 0.62);
        c.fillStyle = ML.cssVar("--bg-2"); c.fillRect(X0, y + 3, BW, rowH - 6);
        c.fillStyle = m.flowers[i].trick ? "#e0a800" : PETALS[i % PETALS.length];
        c.fillRect(X0, y + 3, (BW * b.mean) / maxV, rowH - 6);
        if (id === "ucb") {
          const bon = isFinite(b.bonus) ? b.bonus : maxV;
          c.globalAlpha = 0.35; c.fillRect(X0 + (BW * b.mean) / maxV, y + 3, Math.min(BW - (BW * b.mean) / maxV, (BW * bon) / maxV), rowH - 6); c.globalAlpha = 1;
        }
        if (state.peek) {
          c.fillStyle = ML.cssVar("--ink"); c.fillRect(X0 + (BW * m.mean(i)) / maxV - 1, y + 1, 3, rowH - 2);
        }
        c.fillStyle = ML.cssVar("--muted"); c.textAlign = "right";
        c.fillText(Math.round(b.n), w - 2, y + rowH * 0.62);
      }
      const s = race.hives[id].strat.last;
      if (snap) why.innerHTML = `Back then: bar = average nectar per visit it had seen. Number = visits.`;
      else if (id === "ucb") why.innerHTML = `Bar = average nectar. Faded part = <b>curiosity bonus</b>: big when a flower has few visits. It flies to the longest total.` + (s ? ` Last pick: <b>${m.flowers[s.arm].name}</b> (${s.why === "bonus" ? "the bonus won" : s.why === "untried" ? "never tried it" : "it's the favourite"}).` : "");
      else why.innerHTML = `Bar = average nectar seen. It flies to the longest bar, except when its dice says <b>explore</b> (${Math.round(epsValue() * 100)}% of visits).` + (s ? ` Last visit: <b>${s.why}</b>.` : "");
    }
  }
  function beliefsFrom(strat, id) {
    return strat.n.map((n, i) => {
      const cap = state.race.meadow.flowers[i] ? state.race.meadow.flowers[i].cap : 1;
      return { n, a: strat.a[i], b: strat.b[i], cap, mean: id === "ts" ? (strat.a[i] / (strat.a[i] + strat.b[i])) * cap : strat.est(i), bonus: id === "ucb" ? strat.bonus(i, cap) : 0 };
    });
  }

  // ---------- challenges ----------
  const TRY = {
    drift: `Try this: switch Memory to <b>Forget slowly</b> and watch who catches up after the next time-of-day change. Peek at the secret nectar to see the best flower move.`,
    bloom: `Try this: look inside the <b>Curious</b> hive. A brand-new flower has zero visits, so its curiosity bonus is huge. Then set Greedy's dice to 0: it may never find the new flower!`,
    trick: `Try this: turn on Peek. The jackpot pays 4 drops but only 15% of the time, so on average it's worse than the best flower. Which hive got fooled by a lucky jackpot?`,
  };
  function startChallenge(c) {
    touch();
    if (state.mode !== "auto") setMode("auto");
    const race = state.race;
    const tsB = race.hives.ts.blocks;
    const before = tsB.length ? tsB.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, tsB.length) : 60;
    const btn = document.querySelector(`#chal [data-c="${c}"]`);
    if (c === "drift") {
      const on = !race.meadow.drift;
      race.drift(on);
      btn.classList.toggle("on", on);
      btn.querySelector(".tag").textContent = on ? "on: tap to stop" : "nectar moves";
      if (!on) { ML.say(`The sun stands still again. Flowers are back to normal.`); state.challenges = state.challenges.filter((x) => x.c !== "drift"); drawCharts(); return; }
      flash("The sun moves! Morning, noon and evening have different best flowers");
      ML.say(`Now it's <b>morning</b>. Every 300 visits the time of day changes, and a <b>different flower</b> becomes the sweetest. Hives that remember everything will be slow to notice!`);
    } else if (c === "bloom") {
      const i = race.bloom();
      state.used.bloom++;
      if (state.used.bloom >= 2 || race.meadow.k >= SPOTS.length) btn.disabled = true;
      flash(`A new flower blooms: ${race.meadow.flowers[i].name}!`);
      ML.say(`A new flower, <b>${race.meadow.flowers[i].name}</b>, just opened. Nobody has visited it. It might be amazing… or a dud. Who will check?`);
      buildFlowerKeys();
    } else if (c === "trick") {
      race.trick();
      btn.disabled = true;
      flash("A shiny jackpot flower appears!");
      ML.say(`A <b>jackpot flower</b>! Sometimes it gives <b>4 drops</b> at once… but most visits it's empty. Is it really better? Lucky streaks can fool a bee.`);
      buildFlowerKeys();
    }
    state.did.chal = true;
    state.challenges.push({ c, atBlock: tsB.length, before, low: Infinity, arm: race.meadow.k - 1, hits: {} });
    document.getElementById("try-this").innerHTML = TRY[c];
    drawCharts();
    if (!state.playing) setPlaying(true);
  }
  function checkChallenges() {
    const race = state.race;
    for (const ch of state.challenges.slice()) {
      const tsB = race.hives.ts.blocks;
      const since = tsB.length - ch.atBlock;
      const now = tsB[tsB.length - 1];
      ch.low = Math.min(ch.low, now);
      if (ch.c === "bloom" || ch.c === "trick") {
        // who visited the new flower?
        const share = (id) => race.hives[id].recent.filter((a) => a === ch.arm).length / Math.max(1, race.hives[id].recent.length);
        if (since === 1) {
          const tried = ORDER.filter((id) => race.hives[id].strat.n[ch.arm] > 0.5).map((id) => STRATS[id].short);
          ML.say(ch.c === "bloom" ? `25 visits later: ${tried.length ? "<b>" + tried.join(", ") + "</b> already checked the new flower." : "nobody has checked it yet!"} Curious bees love flowers they know nothing about.`
            : `The jackpot's first 25 visits: Dreamer went there <b>${Math.round(share("ts") * 100)}%</b> of the time, Greedy+dice <b>${Math.round(share("eps") * 100)}%</b>. A single 4-drop win can make it look amazing!`);
        }
        if (since >= 6) {
          const rec = tsB.slice(-2).reduce((a, b) => a + b, 0) / 2;
          if (ch.c === "bloom") {
            const who = ORDER.filter((id) => id !== "rand" && share(id) > 0.5).map((id) => STRATS[id].short);
            ML.say(`Adapted! <b>${who.length ? who.join(", ") : "The smart hives"}</b> now spend most visits at the new flower. Dreamer is at <b>${Math.round(rec)}%</b> of perfect again.`);
            ML.toast(`Challenge done: the new flower was found!`);
          } else {
            const fooled = ORDER.filter((id) => id !== "rand" && share(id) > 0.4).map((id) => STRATS[id].short);
            ML.say(fooled.length ? `<b>${fooled.join(", ")}</b> still love the jackpot. Big wins are memorable, but on average it gives less nectar than the best flower.` : `Nobody was fooled for long! The smart hives worked out that the jackpot's rare big wins add up to <b>less</b> than the best flower. Dreamer: <b>${Math.round(rec)}%</b>.`);
            ML.toast(`Challenge done: jackpot tested!`);
          }
          ML.confetti(50);
          state.challenges.splice(state.challenges.indexOf(ch), 1);
        }
      } else if (ch.c === "drift") {
        const part = race.meadow.part;
        if (ch.part !== part && ch.part !== undefined) ML.say(`It's <b>${B.TIME_NAMES[part]}</b> now: a new flower is the best. Watch the chart dip, then see who climbs back.`);
        ch.part = part;
        if (since === 14) {
          const avg = (id) => race.hives[id].blocks.slice(-12).reduce((a, b) => a + b, 0) / 12;
          const best = ORDER.slice().sort((a, b) => avg(b) - avg(a))[0];
          ML.say(`Changing meadows are hard! Through the day: Dreamer <b>${Math.round(avg("ts"))}%</b>, Curious <b>${Math.round(avg("ucb"))}%</b>, Greedy+dice <b>${Math.round(avg("eps"))}%</b>. Best: <b>${STRATS[best].name}</b>. ${memoryValue() < 1 ? "Forgetting slowly helps them keep up." : "Try <b>Forget slowly</b>: remembering old mornings makes them stubborn at noon."}`);
          ML.toast(`Challenge done: the hives lived through a day!`);
          ML.confetti(50);
          state.challenges.splice(state.challenges.indexOf(ch), 1);
        }
      }
    }
  }
  function flash(msg) {
    const o = document.getElementById("overlay");
    o.textContent = msg;
    o.classList.add("show");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => o.classList.remove("show"), 2200);
  }

  // ---------- checkpoints ----------
  function makeCheckpoint(n) {
    const race = state.race;
    const strats = {};
    for (const id of ORDER) strats[id] = race.hives[id].strat.clone();
    const score = Math.round(race.frozenScore(strats.ts));
    return { label: `After ${n} visit${n > 1 ? "s" : ""}`, sub: `favourite: ${race.meadow.flowers[strats.ts.greedy(race.caps())].name}`, strats, n, draw: (c) => drawMini(c, strats.ts), score };
  }
  function drawMini(canvas, strat) {
    const c = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    const k = strat.k, bw = (w - 20) / k;
    for (let i = 0; i < k; i++) {
      const mean = strat.a[i] / (strat.a[i] + strat.b[i]);
      const sure = Math.min(1, (strat.a[i] + strat.b[i] - 2) / 40);
      c.fillStyle = PETALS[i % PETALS.length];
      c.globalAlpha = 0.3 + 0.7 * sure;
      const bh = (h - 24) * mean;
      c.fillRect(10 + i * bw + 3, h - 12 - bh, bw - 6, bh);
    }
    c.globalAlpha = 1;
    c.fillStyle = ML.cssVar("--muted");
    c.font = "700 16px Nunito, sans-serif";
    c.fillText("faded = unsure", 12, 20);
  }
  const ckpts = new GameLab.Checkpoints(
    document.getElementById("ckpts"),
    (it) => {
      touch();
      state.did.ckpt = true;
      state.viewing = it;
      setPlaying(false);
      const frozen = Math.round(state.race.frozenScore(it.strats[state.focus]));
      ML.say(`This is what the hives believed after <b>${it.n}</b> visits. If the ${STRATS[state.focus].name} stopped learning right then and always picked its favourite, it would get <b>${frozen}%</b> of the best nectar in today's meadow.`);
      drawBelief();
    },
    () => { state.viewing = null; drawBelief(); ML.say(`Back to live. Press Play to keep learning.`); }
  );

  // ---------- controls ----------
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    document.getElementById("kid-box").classList.toggle("hidden", m !== "kid");
    buildFlowerKeys();
    if (m === "auto") {
      if (state.kid.visits.length === 0) ML.say(`Four hives, same meadow. Each uses a different rule to choose flowers. Press <b>Play</b> and watch the charts!`);
      else ML.say(`Your turn is over, now the hives fly in the same meadow. Press <b>Play</b>. Who learns fastest?`);
    } else {
      setPlaying(false);
      ML.say(state.kid.done ? `You've used your 20 visits. Press <b>Play again</b> for a new meadow.` : `Your turn! Tap a flower to visit it.`);
    }
  }
  function setPlaying(on) {
    state.playing = on;
    if (on) { state.did.play = true; if (state.viewing) { state.viewing = null; ckpts.active = null; ckpts.render(); } }
    const b = document.getElementById("play");
    b.innerHTML = on ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
  }
  function touch() { state.lastAct = performance.now(); }

  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => { touch(); setMode(b.dataset.m); }));
  document.getElementById("play").addEventListener("click", () => {
    touch();
    if (state.mode !== "auto") setMode("auto");
    setPlaying(!state.playing);
    if (state.playing && state.race.hives.ts.visits === 0) ML.say(`Off they go! At first nobody knows anything, so everyone explores. Watch the bars under each flower.`);
  });
  document.getElementById("step").addEventListener("click", () => {
    touch();
    if (state.mode !== "auto") setMode("auto");
    setPlaying(false);
    state.viewing = null;
    step();
    renderBoard();
    drawBelief();
    const h = state.race.hives;
    const name = (id) => state.race.meadow.flowers[h[id].strat.last.arm].name;
    ML.say(`One bee each: Random → <b>${name("rand")}</b>, Greedy+dice → <b>${name("eps")}</b> (${h.eps.strat.last.why}), Curious → <b>${name("ucb")}</b>, Dreamer → <b>${name("ts")}</b>.`);
  });
  document.getElementById("reset").addEventListener("click", () => { touch(); setPlaying(false); newRace(); ML.say(`A new meadow with new secret nectar. Everyone starts from zero.`); });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    touch();
    state.speed = +b.dataset.v;
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
  }));
  document.querySelectorAll("#focus button").forEach((b) => b.addEventListener("click", () => {
    touch();
    state.did.focus = true;
    state.focus = b.dataset.v;
    document.querySelectorAll("#focus button").forEach((x) => x.classList.toggle("on", x === b));
    drawBelief();
    const msg = { eps: `The <b>Greedy+dice</b> bee just keeps an average for each flower. Simple! But it explores at random, even flowers it knows are bad.`,
      ucb: `The <b>Curious</b> bee adds a bonus to flowers it hasn't visited much. "I don't know it well, so it might be great!"`,
      ts: `The <b>Dreamer</b> bee keeps a curve of "how full might it be?" for each flower and picks by dreaming a number from each curve.` }[state.focus];
    ML.say(msg);
  }));
  document.querySelectorAll("#memory button").forEach((b) => b.addEventListener("click", () => {
    touch();
    document.querySelectorAll("#memory button").forEach((x) => x.classList.toggle("on", x === b));
    state.race.setGamma(+b.dataset.v);
    ML.say(+b.dataset.v < 1 ? `Now each hive slowly forgets old visits (about the last 100 count). Good when flowers change, a bit wasteful when they don't.` : `The hives remember every visit forever again. Great for a meadow that never changes.`);
  }));
  ML.bindRange("#eps", (v) => Math.round(v * 100) + "%", (v) => {
    if (!state.race) return;
    state.race.setEps(v);
    touch();
    if (v === 0) ML.say(`Dice at 0%: the yellow bee <b>never</b> explores. If its first favourite is lucky but not the best, it may stay stuck forever!`);
    else if (v >= 0.4) ML.say(`Dice at ${Math.round(v * 100)}%: lots of exploring, so it wastes many visits on bad flowers.`);
  });
  document.getElementById("peek").addEventListener("change", (e) => {
    touch();
    state.peek = e.target.checked;
    drawBelief();
    ML.say(state.peek ? `Shh, the secret nectar meters are showing! The bees still can't see them. In "inside", dashed lines / black ticks show the truth.` : `Secrets hidden again.`);
  });
  document.querySelectorAll("#chal button").forEach((b) => b.addEventListener("click", () => startChallenge(b.dataset.c)));

  // meadow pointer: tap a flower, hover highlight
  const flowerAt = (p) => { const m = meadowNow(); for (let i = 0; i < m.k; i++) { const [x, y] = spot(i); if (Math.hypot(p.x - x, p.y - y + 6) < 36) return i; } return -1; };
  meadowEl.addEventListener("pointerdown", (e) => {
    const i = flowerAt(ML.canvasPoint(meadowEl, e, W, H));
    if (i < 0) return;
    if (state.mode === "kid") kidVisit(i);
    else ML.say(`That's <b>${meadowNow().flowers[i].name}</b>. Switch to "I'm the bee" to visit it yourself, or watch which hives go there.`);
  });
  meadowEl.addEventListener("pointermove", (e) => {
    const p = ML.canvasPoint(meadowEl, e, W, H);
    state.hover = flowerAt(p);
    meadowEl.style.cursor = state.hover >= 0 && state.mode === "kid" ? "pointer" : "default";
    if (state.mode === "kid" && !state.kid.done && !reduceMotion) { state.kidBee.tx = p.x; state.kidBee.ty = p.y - 20; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (/^[1-8]$/.test(e.key) && state.mode === "kid") { kidVisit(+e.key - 1); e.preventDefault(); }
    else if (e.key === " " && e.target === document.body) { e.preventDefault(); document.getElementById("play").click(); }
  });
  document.addEventListener("themechange", () => { drawCharts(); drawBelief(); ckpts.render(); });

  // idle nudges: point to the next step
  setInterval(() => {
    const now = performance.now();
    if (now - state.lastAct < 15000 || now - state.lastNudge < 15000) return;
    state.lastNudge = now;
    const d = state.did;
    let msg;
    if (!d.kid && state.mode === "kid") msg = `Psst! Tap any flower in the meadow (or press <b>1</b>–<b>6</b>) to be the bee.`;
    else if (state.mode === "kid" && state.kid.done) msg = `Nice flying! Now press <b>Watch the hives</b> to see how the robot bees choose.`;
    else if (state.mode === "kid") msg = `Keep going! ${KID_N - state.kid.visits.length} visits left. Which flower looks sweetest so far?`;
    else if (!state.playing && !state.viewing) msg = `Press <b>Play</b> (or the space bar) to send the bees out.`;
    else if (!d.chal && state.race.hives.ts.visits > 300) msg = `The hives have settled. Try a <b>challenge</b> on the left, like a new flower blooming!`;
    else if (!d.focus) msg = `Look inside a different hive: tap <b>Curious</b> or <b>Greedy</b> in "What's happening inside".`;
    else if (!d.ckpt && ckpts.items.length > 3) msg = `Tap a <b>checkpoint</b> below to see what the Dreamer believed early on.`;
    else if (!state.peek) msg = `Want to cheat a little? Tick <b>Peek at the secret nectar</b> to check who guessed right.`;
    else msg = `Try another challenge, or a <b>New meadow</b> to see if the same hive wins again.`;
    ML.say(msg);
  }, 1000);

  buildLegend();
  newRace();
  requestAnimationFrame(loop);
})();
