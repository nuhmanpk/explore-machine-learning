// Delivery Drone — page: drawing, the round-by-round evolution loop, challenges,
// checkpoints, "you fly" mode and the Model X-ray.
(function () {
  const { Net, nextGeneration } = window.GameNet;
  const D = window.DroneCore;
  const { W, H, GROUND, PAD_X, STEPS, SIZES, ZX, ZY, HOME, TRUCK_ROOF } = D;
  const POP = 60;

  const arena = ML.setupCanvas(document.getElementById("arena"), W, H);
  const chartCv = ML.setupCanvas(document.getElementById("chart"), 640, 180);
  const ctx = arena.ctx;

  const state = {
    brains: Array.from({ length: POP }, () => D.newBrain()),
    rules: { ...D.DEFAULT_RULES },
    round: 1,
    speed: 3,
    playing: false,
    mutation: 0.25,
    world: null,
    phase: "show", // "show" = the round you watch, "score" = a second town scored in the background
    extra: null,
    near: [],
    deliv: [],
    home: [],
    score: [],
    markers: [],
    pending: [], // challenges waiting to see if the fleet adapts
    best: null,  // champion brain of the last finished round
    replay: null,
    human: null,
    assist: true,
    celebrated: false,
    showBabies: true, // off = draw only the leading drone
  };
  const seedFor = (round, k) => 7 + round * 3 + k;
  const secs = (steps) => (steps / 60).toFixed(1);

  function newRound() {
    state.world = new D.World(state.brains, state.rules, seedFor(state.round, 0));
    state.phase = "show";
    state.extra = null;
  }

  // ---------- evolution ----------
  function finishRound() {
    const shown = state.world, extra = state.extra;
    const fit = shown.ships.map((s, i) => shown.fitness(s) + extra.fitness(extra.ships[i]));
    const order = fit.map((_, i) => i).sort((a, b) => fit[b] - fit[a]);
    const top = order.slice(0, POP / 2);
    const mean = (f) => top.reduce((a, i) => a + f(shown.ships[i]) + f(extra.ships[i]), 0) / top.length / 2;
    const near = mean((s) => Math.max(0, s.bestProg)) * 100;
    const deliv = mean((s) => (s.delivered ? 1 : 0)) * 100;
    const home = mean((s) => (s.returned ? 1 : 0)) * 100;
    const score = top.reduce((a, i) => a + fit[i], 0) / top.length / 2;
    state.near.push(Math.round(near)); state.deliv.push(Math.round(deliv)); state.home.push(Math.round(home)); state.score.push(score);
    state.best = state.brains[order[0]].clone();
    const lead = shown.ships[order[0]];
    ckpts.add({
      label: `Round ${state.round}`,
      sub: lead.delivered ? `Delivered in ${secs(lead.deliveredAt)} s${lead.returned ? " · home" : ""}` : lead.alive ? "No delivery yet" : `Crashed (${whyText(lead.why)})`,
      brain: state.best.clone(),
      draw: (cv) => drawNet(cv, state.best),
    });
    narrateRound(near, deliv, home);
    checkAdapt();
    drawChart();
    state.brains = nextGeneration(state.brains, fit, { mutation: state.mutation });
    state.round++;
    newRound();
  }
  const whyText = (w) => ({ ground: "hit the ground", building: "hit a roof", lost: "flew away", battery: "no battery" }[w] || "crashed");

  function narrateRound(near, deliv, home) {
    const n = state.deliv.length;
    if (!state.celebrated && n >= 3 && state.deliv.slice(-3).every((v) => v >= 70)) {
      state.celebrated = true;
      ML.confetti();
      ML.say(`They did it! <b>${Math.round(deliv)}%</b> of the best couriers now deliver the parcel${home >= 20 ? ` and <b>${Math.round(home)}%</b> even fly home` : ""}, after just <b>${n}</b> rounds. Nobody taught them how to balance a drone!`);
      ML.xray.offer("The fleet learned to deliver! X-ray a courier's brain");
      return;
    }
    if (state.pending.length && state.speed !== 0) return; // challenge narration takes priority
    if (n === 1) ML.say(`Round 1 done. Random brains: the best half got <b>${Math.round(near)}%</b> of the way to the house and <b>${Math.round(deliv)}%</b> delivered. Their babies will try next.`);
    else if (state.speed !== 0 && n % 3 === 0) {
      const hint = deliv < 10 ? "Learning to hover over the roof is the hard part…" : home < 10 ? "Delivering works! Flying home is the next skill." : "Delivering and coming home. Nice!";
      ML.say(`Round ${n}: the best half got <b>${Math.round(near)}%</b> of the way, <b>${Math.round(deliv)}%</b> delivered. ${hint}`);
    }
  }

  // A challenge counts as "adapted" when the score climbs back to 75% of before, or 40% above its low point.
  // Every round uses a new town, so the score is judged on the average of the last 3 rounds.
  function checkAdapt() {
    const last3 = state.score.slice(-3);
    const now = last3.reduce((a, v) => a + v, 0) / last3.length;
    for (const p of state.pending.slice()) {
      p.low = Math.min(p.low, now);
      p.rounds++;
      if (p.rounds === 2 && now < p.before * 0.85)
        ML.say(`Ouch, ${p.label.toLowerCase()}! The score dropped from ${p.before.toFixed(0)} to ${now.toFixed(0)}. The old tricks don't work any more…`);
      const back = p.rounds >= 4 && (now >= p.before * 0.75 || (p.low < p.before * 0.85 && now >= p.low * 1.4));
      if (back) {
        state.pending.splice(state.pending.indexOf(p), 1);
        if (p.low >= p.before * 0.85) ML.say(`${p.label} didn't slow the fleet down much. Their tricks still work!`);
        else { ML.confetti(40); ML.say(`They adapted to <b>${p.label.toLowerCase()}</b>! Score back to ${now.toFixed(0)} after ${p.rounds} rounds. Nobody re-programmed them.`); }
      } else if (p.rounds >= 40) {
        state.pending.splice(state.pending.indexOf(p), 1);
        ML.say(`${p.label} is really tough: the fleet improved a bit, but delivering is simply harder now.`);
      }
    }
  }

  // ---------- drawing: the town ----------
  const clouds = [[80, 52, 1], [330, 34, 0.8], [520, 70, 1.2], [200, 90, 0.7]];
  function cloud(x, y, k) {
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(x, y, 14 * k, 0, 7); ctx.arc(x + 16 * k, y - 6 * k, 18 * k, 0, 7); ctx.arc(x + 36 * k, y, 14 * k, 0, 7); ctx.arc(x + 18 * k, y + 5 * k, 14 * k, 0, 7);
    ctx.fill();
  }
  function drawSky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, "#7cc6f5");
    g.addColorStop(1, "#e6f5ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffe48a";
    ctx.beginPath(); ctx.arc(W - 70, 56, 24, 0, 7); ctx.fill();
    for (const [cx, cy, k] of clouds) cloud(((cx + t / 90 * k) % (W + 120)) - 60, cy, k);
    // far hills
    ctx.fillStyle = "#c4e7cf";
    ctx.beginPath(); ctx.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, GROUND - 40 - Math.sin(x / 70) * 14 - Math.sin(x / 31) * 5);
    ctx.lineTo(W, GROUND); ctx.closePath(); ctx.fill();
  }
  function drawTree(x, h) {
    ctx.fillStyle = "#8a6a4a";
    ctx.fillRect(x - 2, GROUND - h * 0.45, 4, h * 0.45);
    ctx.fillStyle = "#4fae6a";
    ctx.beginPath(); ctx.arc(x, GROUND - h * 0.65, h * 0.36, 0, 7); ctx.fill();
    ctx.fillStyle = "#63c07c";
    ctx.beginPath(); ctx.arc(x - h * 0.12, GROUND - h * 0.72, h * 0.2, 0, 7); ctx.fill();
  }
  function drawHouse(h, isTarget, solid) {
    ctx.save();
    ctx.globalAlpha = solid ? 1 : 0.35;
    const body = `hsl(${h.hue} 55% 78%)`, dark = `hsl(${h.hue} 45% 55%)`;
    ctx.fillStyle = body;
    ctx.fillRect(h.x, h.top, h.w, h.h);
    ctx.fillStyle = dark;
    ctx.fillRect(h.x - 3, h.top - 5, h.w + 6, 7); // roof slab
    ctx.fillStyle = "rgba(255,255,255,.7)";
    for (let wy = h.top + 14; wy < GROUND - 30; wy += 22)
      for (let wx = h.x + 10; wx < h.x + h.w - 14; wx += 22) ctx.fillRect(wx, wy, 11, 13);
    ctx.fillStyle = dark;
    ctx.fillRect(h.x + h.w / 2 - 6, GROUND - 22, 12, 22); // door
    ctx.strokeStyle = "rgba(31,33,64,.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(h.x, h.top, h.w, h.h);
    if (isTarget) { // landing mat on the roof
      ctx.fillStyle = "#ff8a3d";
      ctx.beginPath(); ctx.roundRect(h.x + h.w / 2 - 18, h.top - 9, 36, 5, 3); ctx.fill();
    }
    ctx.restore();
  }
  function drawTruck(x) {
    const y = GROUND, bw = 52, bh = TRUCK_ROOF - 4;
    ctx.fillStyle = "#f2f4fa"; ctx.strokeStyle = "rgba(31,33,64,.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - bw / 2, y - bh - 4, bw, bh, 4); ctx.fill(); ctx.stroke(); // box
    ctx.fillStyle = "#ff8a3d";
    ctx.fillRect(x - bw / 2 + 4, y - 22, bw - 8, 6);
    ctx.fillStyle = "#5b8cff";
    ctx.beginPath(); ctx.roundRect(x + bw / 2, y - 26, 20, 22, 5); ctx.fill(); ctx.stroke(); // cab
    ctx.fillStyle = "#bfe3ff"; ctx.fillRect(x + bw / 2 + 8, y - 22, 9, 9);
    ctx.fillStyle = "#1f2140";
    for (const wx of [x - 16, x + bw / 2 + 10]) { ctx.beginPath(); ctx.arc(wx, y - 3, 6, 0, 7); ctx.fill(); }
  }
  function drawDepot(w) {
    ctx.fillStyle = "#b8c0cc";
    ctx.fillRect(PAD_X - 38, GROUND - 6, 76, 6);
    ctx.fillStyle = "#ff8a3d";
    ctx.fillRect(PAD_X - 38, GROUND - 6, 76, 2);
    ctx.fillStyle = "#fff";
    ctx.font = "900 11px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("H", PAD_X, GROUND - 0.5);
    // depot booth + sign + windsock
    ctx.fillStyle = "#e9edf5"; ctx.strokeStyle = "rgba(31,33,64,.4)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(PAD_X - 74, GROUND - 30, 28, 30, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff8a3d"; ctx.fillRect(PAD_X - 74, GROUND - 30, 28, 7);
    ctx.fillStyle = "#1f2140"; ctx.font = "800 7px Nunito, sans-serif"; ctx.fillText("DEPOT", PAD_X - 60, GROUND - 25);
    ctx.fillStyle = "#59607a"; ctx.fillRect(PAD_X + 50, GROUND - 38, 2, 38);
    const lean = ML.clamp(w.wind / 0.04, -1, 1);
    ctx.fillStyle = "#ff5c9a";
    ctx.beginPath(); ctx.moveTo(PAD_X + 52, GROUND - 38); ctx.lineTo(PAD_X + 52 + 24 * lean + (lean >= 0 ? 6 : -6), GROUND - 36 + 6 * Math.abs(lean)); ctx.lineTo(PAD_X + 52, GROUND - 30); ctx.closePath(); ctx.fill();
  }
  function drawStreet() {
    ctx.fillStyle = "#8fd09c"; ctx.fillRect(0, GROUND, W, 8);
    ctx.fillStyle = "#98a2b8"; ctx.fillRect(0, GROUND + 8, W, H - GROUND - 8);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.setLineDash([22, 18]);
    ctx.beginPath(); ctx.moveTo(0, GROUND + 28); ctx.lineTo(W, GROUND + 28); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawZone(x, y, color, label, t) {
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t / 80;
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(x - ZX, y - ZY, ZX * 2, ZY * 2, 12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color; ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(label, x, y - ZY - 6);
    ctx.restore();
  }
  function drawWeather(w, t) {
    if (w.rules.rain) {
      ctx.fillStyle = "rgba(60,80,120,.12)"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(70,100,160,.55)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const x = (i * 97 + t * 0.25) % (W + 40) - 20, y = (i * 53 + t * 0.9) % H;
        ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 10);
      }
      ctx.stroke();
    }
    if (w.rules.gusts) {
      const k = Math.abs(w.wind) / 0.04;
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.5 * k})`; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const dir = w.wind >= 0 ? 1 : -1;
        const x = ((i * 131 + dir * t * (0.1 + 0.5 * k)) % (W + 80) + W + 80) % (W + 80) - 40, y = 40 + ((i * 67) % (GROUND - 90));
        ctx.moveTo(x, y); ctx.lineTo(x + dir * (18 + 40 * k), y);
      }
      ctx.stroke();
    }
  }

  // ---------- drawing: drones ----------
  function drawParcel(x, y, k = 1) {
    ctx.fillStyle = "#c98f48"; ctx.strokeStyle = "#8a5f2a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x - 6 * k, y - 5 * k, 12 * k, 10 * k, 1.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f3d9a8"; ctx.fillRect(x - 1 * k, y - 5 * k, 2 * k, 10 * k);
  }
  function drawChute(p, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!p.landed) {
      ctx.fillStyle = "#ff5c9a";
      ctx.beginPath(); ctx.arc(p.x, p.y - 16, 11, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(31,33,64,.6)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - 11, p.y - 16); ctx.lineTo(p.x, p.y - 4); ctx.moveTo(p.x + 11, p.y - 16); ctx.lineTo(p.x, p.y - 4); ctx.stroke();
    }
    drawParcel(p.x, p.y, 0.9);
    ctx.restore();
  }
  function drawDrone(s, color, alpha, lead, t) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.th);
    const col = s.alive ? color : "#8a90a6";
    // landing legs
    ctx.strokeStyle = "#3a3f5c"; ctx.lineWidth = lead ? 2 : 1.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(-11, 11); ctx.moveTo(8, 4); ctx.lineTo(11, 11); ctx.stroke();
    // arms + motors
    ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-22, -8); ctx.moveTo(8, -2); ctx.lineTo(22, -8); ctx.stroke();
    // rotors: a blur disc with spinning blades
    for (const sx of [-22, 22]) {
      const phase = t / 30 + (sx < 0 ? 0 : 1.7);
      ctx.fillStyle = lead ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.3)";
      ctx.beginPath(); ctx.ellipse(sx, -12, 15, 3.4, 0, 0, 7); ctx.fill();
      if (lead && s.alive) {
        ctx.strokeStyle = "#3a3f5c"; ctx.lineWidth = 2;
        const l = 14 * Math.cos(phase);
        ctx.beginPath(); ctx.moveTo(sx - l, -12); ctx.lineTo(sx + l, -12); ctx.stroke();
      }
      ctx.fillStyle = "#3a3f5c";
      ctx.fillRect(sx - 2, -12, 4, 5);
    }
    // body
    ctx.fillStyle = col;
    ctx.strokeStyle = lead ? "#fff" : "rgba(255,255,255,.7)";
    ctx.lineWidth = lead ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(-14, -6, 28, 11, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#bfe9ff";
    ctx.beginPath(); ctx.arc(0, -1, 3, 0, 7); ctx.fill();
    // parcel
    if (s.carrying && s.alive) {
      ctx.strokeStyle = "rgba(31,33,64,.55)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-5, 5); ctx.lineTo(-5, 12); ctx.moveTo(5, 5); ctx.lineTo(5, 12); ctx.stroke();
      drawParcel(0, 17, lead ? 1 : 0.8);
    }
    // thrust puffs under the rotors (leader only)
    if (lead && s.alive) {
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2;
      for (const [sx, u] of [[-22, s.u[0]], [22, s.u[1]]]) {
        ctx.beginPath(); ctx.moveTo(sx, -8); ctx.lineTo(sx + (Math.random() - 0.5) * 3, -8 + 4 + u * 16); ctx.stroke();
      }
    }
    ctx.restore();
    if (lead && s.alive) { // crown
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#c98f00"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-8, -25); ctx.lineTo(-8, -33); ctx.lineTo(-4, -29); ctx.lineTo(0, -35); ctx.lineTo(4, -29); ctx.lineTo(8, -33); ctx.lineTo(8, -25); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawWorld(w, t, label, opts = {}) {
    drawSky(t);
    // trees behind the houses
    for (let i = 0; i < w.houses.length - 1; i++) {
      const a = w.houses[i], b = w.houses[i + 1];
      if (b.x - (a.x + a.w) > 22) drawTree((a.x + a.w + b.x) / 2, 30 + ((i * 7) % 12));
    }
    drawTree(36, 34); drawTree(W - 22, 30);
    for (const h of w.houses) drawHouse(h, !w.rules.truck && h === w.targetHouse, w.solid.includes(h));
    drawStreet();
    drawDepot(w);
    if (w.rules.truck) drawTruck(w.truckX);
    const lead = opts.lead || w.leader();
    // target + home zones
    const delivered = lead && lead.delivered;
    drawZone(w.target.x, w.target.y, "#ff8a3d", delivered ? "delivered!" : "deliver here", t);
    if (delivered) drawZone(HOME.x, HOME.y, "#2fbf62", "land here", t);
    // parcels that already dropped
    const ghosts = state.showBabies && !opts.human;
    if (ghosts) for (const s of w.ships) if (s !== lead && s.pkg) drawChute(s.pkg, 0.3);
    if (lead && lead.pkg) drawChute(lead.pkg, 1);
    if (ghosts) for (const s of w.ships) if (s !== lead && s.alive) drawDrone(s, "#5b8cff", 0.3, false, t);
    if (lead) drawDrone(lead, opts.human ? "#2fbf62" : "#ff5c9a", 1, true, t);
    drawWeather(w, t);
    if (label) {
      ctx.font = "800 13px Nunito, sans-serif";
      const tw = ctx.measureText(label).width + 28;
      ctx.fillStyle = "rgba(31,33,64,.72)";
      ctx.beginPath(); ctx.roundRect(10, 10, Math.min(W - 20, tw), 28, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      ctx.fillText(label, 22, 29);
    }
  }

  function drawChart() {
    GameLab.drawChart(chartCv, [
      { values: state.near, color: "--lang" },
      { values: state.deliv, color: "--accent" },
      { values: state.home, color: "--vision" },
    ], state.markers, 100);
  }

  // Small drawing of a brain: inputs left, outputs right, blue/orange = push/hold back.
  function drawNet(cv, net) {
    const c = cv.getContext("2d");
    const Wc = cv.width, Hc = cv.height;
    c.clearRect(0, 0, Wc, Hc);
    const L = net.sizes.length;
    const pos = net.sizes.map((n, l) => Array.from({ length: n }, (_, i) => [12 + ((Wc - 24) * l) / (L - 1), n === 1 ? Hc / 2 : 10 + ((Hc - 20) * i) / (n - 1)]));
    for (let l = 0; l < L - 1; l++)
      for (let i = 0; i < net.sizes[l]; i++)
        for (let j = 0; j < net.sizes[l + 1]; j++) {
          const w = net.weight(l, i, j);
          c.strokeStyle = w > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
          c.globalAlpha = Math.min(0.9, 0.08 + Math.abs(w) * 0.35);
          c.lineWidth = Math.min(3, 0.4 + Math.abs(w));
          c.beginPath(); c.moveTo(...pos[l][i]); c.lineTo(...pos[l + 1][j]); c.stroke();
        }
    c.globalAlpha = 1;
    pos.forEach((layer) => layer.forEach(([x, y]) => { c.fillStyle = ML.cssVar("--ink"); c.beginPath(); c.arc(x, y, Math.max(2, Hc / 70), 0, 7); c.fill(); }));
  }

  // ---------- "what's happening inside" ----------
  const pct = (v) => Math.round(v * 100) + "%";
  let insideTick = 0;
  function renderInside(w, s) {
    if (++insideTick % 10) return;
    const host = document.getElementById("inside");
    if (!s) return;
    if (state.human) {
      host.innerHTML = `<div>You are the brain! A robot drone gets only 11 numbers: tilt, spin, speed, where the house is, battery, wind, the parcel, its height, and any building ahead. It has to work out both rotors by itself.</div>`;
      return;
    }
    const t = s.delivered ? HOME : w.target;
    const deg = Math.round(Math.abs(s.th) * 57.3);
    const lean = Math.abs(s.th) < 0.05 ? "level" : `leaning <b>${deg}° ${s.th > 0 ? "right" : "left"}</b>`;
    const dx = t.x - s.x, dy = t.y - s.y;
    const where = `${s.delivered ? "depot" : "house"} is <b>${Math.abs(dx) < 25 ? "right " : ""}${Math.abs(dy) < 25 ? "" : dy < 0 ? "up" : "down"}${Math.abs(dx) < 25 ? "" : (Math.abs(dy) < 25 ? "" : "-") + (dx > 0 ? "right" : "left")}${Math.abs(dx) < 25 && Math.abs(dy) < 25 ? "here" : ""}</b>`;
    const [uL, uR] = s.u;
    const diff = uR - uL, avg = (uL + uR) / 2;
    const bank = diff > 0.12 ? "bank LEFT (right rotor harder)" : diff < -0.12 ? "bank RIGHT (left rotor harder)" : "stay level";
    const lift = avg > 0.62 ? "climb" : avg < 0.38 ? "sink" : "hold height";
    host.innerHTML = `<div>${ML.icon("eye")} ${lean}, ${where}</div>
      <div>${ML.icon("gauge")} Battery <b>${pct(s.battery / w.cap)}</b>${w.rules.gusts ? `, wind <b>${w.wind > 0.008 ? "from the left" : w.wind < -0.008 ? "from the right" : "calm"}</b>` : ""}${s.carrying ? "" : ", parcel dropped"}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("network")} 10 thinking neurons mix it all up</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("rocket")} Left rotor <b>${pct(uL)}</b>, right rotor <b>${pct(uR)}</b> → <b style="color:var(--accent)">${bank}, ${lift}</b></div>`;
  }

  function renderStats(w) {
    document.getElementById("st-round").textContent = state.round;
    document.getElementById("st-alive").textContent = w.ships.filter((s) => s.alive).length;
    const lead = w.leader();
    document.getElementById("st-batt").innerHTML = lead ? `${Math.round((lead.battery / w.cap) * 100)}<small>%</small>` : "–";
    const last = state.deliv.length ? state.deliv[state.deliv.length - 1] : null;
    document.getElementById("st-top").innerHTML = last === null ? "–" : `${last}<small>%</small>`;
  }

  // ---------- main tick ----------
  function stepTraining() {
    const t0 = performance.now();
    const budget = 9; // ms of compute per frame, so the page stays smooth even in Turbo
    if (state.phase === "show") {
      const w = state.world;
      if (state.speed === 0) {
        while (!w.done && performance.now() - t0 < budget) for (let i = 0; i < 20 && !w.done; i++) w.step();
      } else {
        for (let i = 0, n = ML.ticks(state.speed); i < n && !w.done; i++) w.step();
      }
      if (w.done) {
        state.phase = "score";
        state.extra = new D.World(state.brains, state.rules, seedFor(state.round, 1));
      }
    }
    if (state.phase === "score") {
      const e = state.extra;
      while (!e.done && performance.now() - t0 < budget) for (let i = 0; i < 20 && !e.done; i++) e.step();
      if (e.done) finishRound();
    }
  }

  const keys = { left: false, right: false, up: false, down: false };
  function frame(t) {
    if (state.human) {
      const h = state.human;
      if (!h.world.done) h.world.step(keys, state.assist);
      const s = h.world.ships[0];
      if (s.delivered && !h.said) { h.said = "delivered"; ML.say(`Parcel delivered in ${secs(s.deliveredAt)} s! Now fly back to the depot and land on the H.`); }
      if (s.returned && h.said !== "home") { h.said = "home"; ML.confetti(50); ML.say(`Home again! A full delivery in ${secs(h.world.steps)} s. Can the robots match that?`); }
      if (!s.alive && !h.dead) {
        h.dead = true; h.diedAt = performance.now();
        ML.say(s.why === "building" ? "Crunch, you hit a roof! Press ↑ to fly again." : s.why === "ground" ? "Hard landing! Press ↑ to fly again." : s.why === "lost" ? "You flew out of town! Press ↑ to fly again." : "Out of battery! Press ↑ to fly again.");
      }
      if (h.dead && keys.up && performance.now() - h.diedAt > 600) startHuman();
      drawWorld(h.world, t, `You: ${secs(h.world.steps)} s · battery ${Math.round((s.battery / h.world.cap) * 100)}%`, { lead: s, human: true });
      renderInside(h.world, s);
    } else if (state.replay) {
      const r = state.replay;
      for (let i = 0; i < Math.max(1, Math.min(state.speed || 3, 3)); i++) r.world.step();
      const s = r.world.ships[0];
      if ((r.world.done || s.finished) && !r.said) {
        r.said = true;
        ML.say(s.delivered ? `${r.ck.label}'s champion delivered in <b>${secs(s.deliveredAt)} s</b>${s.returned ? " and flew back home" : ""} in today's town.` : `${r.ck.label}'s champion didn't manage a delivery in today's town${s.alive ? "" : ` (${whyText(s.why)})`}.`);
        setTimeout(() => { if (state.replay === r) startReplay(r.ck); }, 1600);
      }
      drawWorld(r.world, t, `Replaying ${r.ck.label}'s champion`);
      renderInside(r.world, s);
    } else {
      if (state.playing) stepTraining();
      const w = state.world;
      const label = state.phase === "score" ? `Round ${state.round}: scoring a second town…` : `Round ${state.round} · ${((STEPS - w.steps) / 60).toFixed(0)} s left`;
      drawWorld(w, t, label);
      renderInside(w, w.leader());
      renderStats(w);
    }
    requestAnimationFrame(frame);
  }

  // ---------- replay + you-fly ----------
  const ckpts = new GameLab.Checkpoints(document.getElementById("ckpts"), (ck) => startReplay(ck), () => { state.replay = null; });
  ckpts.render();
  function startReplay(ck) {
    state.playing = false;
    syncPlay();
    state.replay = { ck, world: new D.World([ck.brain], state.rules, Math.floor(Math.random() * 1e6)) };
  }
  function startHuman() {
    const w = new D.World([D.newBrain()], state.rules, Math.floor(Math.random() * 1e6));
    w.ships[0].human = true;
    state.human = { world: w, said: "", dead: false, diedAt: 0 };
  }
  const flyBtn = document.getElementById("fly");
  flyBtn.addEventListener("click", () => {
    if (state.human) {
      state.human = null;
      document.getElementById("pad").classList.remove("show");
      flyBtn.innerHTML = `${ML.icon("gamepad")} I'll fly a drone`;
      ML.say("Back to the robot fleet! Press <b>Play</b> to keep them learning.");
      return;
    }
    state.playing = false;
    state.replay = null;
    syncPlay();
    startHuman();
    document.getElementById("pad").classList.add("show");
    flyBtn.innerHTML = `${ML.icon("x")} Stop flying`;
    document.querySelector(".stage.three .canvas-box").scrollIntoView({ behavior: "smooth", block: "center" });
    ML.say("Your turn! ← → to lean, ↑ ↓ to climb and sink. Hover over the orange box for a second to drop the parcel, then land on the H.");
  });
  document.getElementById("assist").addEventListener("change", (e) => {
    state.assist = e.target.checked;
    if (state.human) ML.say(state.assist ? "Auto-level is on: a tiny autopilot keeps you level while you steer." : "Auto-level is off: now you control the two rotors directly. Tough, right? That's what the robot brain learns!");
  });
  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
  document.addEventListener("keydown", (e) => { if (state.human && keyMap[e.code]) { e.preventDefault(); keys[keyMap[e.code]] = true; } });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });
  document.querySelectorAll("#pad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); keys[k] = true; b.classList.add("pressed"); };
    const off = () => { keys[k] = false; b.classList.remove("pressed"); };
    b.addEventListener("pointerdown", on);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, off));
  });

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() {
    playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
  }
  playBtn.addEventListener("click", () => {
    if (state.human) flyBtn.click();
    state.replay = null;
    ckpts.active = null;
    ckpts.render();
    state.playing = !state.playing;
    syncPlay();
    if (state.playing && state.round === 1 && state.world.steps === 0)
      ML.say("Off they go! The pink drone with the crown is doing best right now. Watch it try to hover over the orange box.");
  });
  document.getElementById("skip").addEventListener("click", () => {
    if (state.human || state.replay) return;
    const w = state.world;
    while (!w.done) w.step();
    state.phase = "score";
    state.extra = new D.World(state.brains, state.rules, seedFor(state.round, 1));
    while (!state.extra.done) state.extra.step();
    finishRound();
  });
  document.getElementById("reset").addEventListener("click", () => {
    state.brains = Array.from({ length: POP }, () => D.newBrain());
    state.round = 1;
    state.near = []; state.deliv = []; state.home = []; state.score = []; state.markers = []; state.pending = [];
    state.best = null;
    state.celebrated = false;
    ckpts.clear();
    newRound();
    drawChart();
    ML.say("Brand-new random brains. Everything they learned is gone!");
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
    if (state.speed === 0) ML.say("Turbo! Rounds fly by. Watch the lines on the chart climb.");
  }));
  document.querySelectorAll("#babies button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#babies button").forEach((x) => x.classList.toggle("on", x === b));
    state.showBabies = b.dataset.v === "1";
  }));
  ML.bindRange("#mut", (v) => v.toFixed(2), (v) => (state.mutation = v));

  const LABELS = { gusts: "Gusty wind", heavy: "Heavy parcel", lowbat: "Low battery", truck: "Moving truck", rain: "Rain" };
  const TELLS = {
    gusts: "Wind will shove them sideways.",
    heavy: "The parcel weighs much more, so they need more rotor power to stay up.",
    lowbat: "Only half the charge. Wasting power now means falling out of the sky.",
    truck: "The customer is in a truck driving up and down the street!",
    rain: "Rotors are weaker and wobbly in the rain.",
  };
  document.querySelectorAll("#chal [data-c]").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    state.rules[c] = !state.rules[c];
    b.classList.toggle("on", state.rules[c]);
    const on = state.rules[c];
    state.markers.push({ at: state.deliv.length, label: `${LABELS[c]} ${on ? "on" : "off"}` });
    drawChart();
    if (state.human) { startHuman(); return; }
    if (on) {
      const before = state.score.slice(-3);
      if (before.length) state.pending.push({ c, label: LABELS[c], before: before.reduce((a, v) => a + v, 0) / before.length, low: Infinity, rounds: 0 });
      ML.say(`<b>${LABELS[c]}</b> starts next round! ${TELLS[c]} ${before.length ? "Let's see if the fleet can adapt." : "Turn it on after a few rounds to see the drop and recovery."}`);
    } else ML.say(`${LABELS[c]} switched off.`);
  }));

  // ---------- Model X-ray ----------
  const seen = [];
  setInterval(() => {
    if (!state.playing || state.human || state.replay) return;
    const w = state.world, s = w.leader();
    if (s && s.alive) { seen.push(w.sense(s)); if (seen.length > 400) seen.shift(); }
  }, 150);
  const xrayBrain = () => (state.replay ? state.replay.ck.brain : state.best || state.brains[0]);
  const dirWord = (v, neg, pos, zero, eps = 0.05) => (v > eps ? pos : v < -eps ? neg : zero);
  const PROTOS = [
    ["Climb (both rotors hard)", 0.85, 0.85, "--good"],
    ["Hover (both rotors medium)", 0.5, 0.5, "--sup"],
    ["Sink (ease off)", 0.15, 0.15, "--muted"],
    ["Bank left (right rotor harder)", 0.35, 0.75, "--nn"],
    ["Bank right (left rotor harder)", 0.75, 0.35, "--diff"],
  ];
  ML.xray.register({
    title: "Champion courier",
    kind: "Neural network",
    summary: () => `Evolved over ${state.round - 1} rounds`,
    size: () => `${xrayBrain().genes.length} knobs`,
    stats: () => [["Rounds", state.round - 1], ["Delivered (best half)", state.deliv.length ? state.deliv[state.deliv.length - 1] + "%" : "–"], ["Home again", state.home.length ? state.home[state.home.length - 1] + "%" : "–"], ["Layers", SIZES.join(" → ")]],
    inputs: [
      { name: "Tilt", min: -1.5, max: 1.5, describe: (v) => `${Math.round(Math.abs(v) * 1.2 * 57.3)}° ${dirWord(v, "left", "right", "level")}` },
      { name: "Spin", min: -1.5, max: 1.5, describe: (v) => dirWord(v, "tipping left", "tipping right", "steady") },
      { name: "Sideways speed", min: -1.5, max: 1.5, describe: (v) => dirWord(v, "drifting left", "drifting right", "still") },
      { name: "Up/down speed", min: -1.5, max: 1.5, describe: (v) => dirWord(v, "climbing", "sinking", "level") },
      { name: "House: sideways", min: -1.5, max: 1.5, describe: (v) => dirWord(v, "to the left", "to the right", "in line", 0.08) },
      { name: "House: up or down", min: -1.5, max: 1.5, describe: (v) => dirWord(v, "above me", "below me", "same height", 0.08) },
      { name: "Battery", min: 0, max: 1, describe: (v) => `${Math.round(v * 100)}%` },
      { name: "Wind", min: -1.5, max: 1.5, describe: (v) => dirWord(v, "from the right", "from the left", "calm", 0.1) },
      { name: "Carrying parcel", min: 0, max: 1, step: 1, describe: (v) => (v > 0.5 ? "yes" : "no") },
      { name: "Height", min: 0, max: 1.2, describe: (v) => (v < 0.1 ? "on the ground" : v < 0.5 ? "low" : "high") },
      { name: "Building ahead", min: -1, max: 1, describe: (v) => (v > 0.3 ? "roof in the way" : v > -0.3 ? "roof close" : "clear sky") },
    ],
    outputs: PROTOS.map(([name, , , c]) => ({ name, color: ML.cssVar(c) })),
    // The brain gives two rotor powers; score each of the 5 moves by how close it is.
    predict: (x) => {
      const o = xrayBrain().forward(x);
      const uL = (o[0] + 1) / 2, uR = (o[1] + 1) / 2;
      return PROTOS.map(([, l, r]) => -((uL - l) ** 2) - (uR - r) ** 2);
    },
    samples: () => seen,
    current: () => {
      const w = state.replay ? state.replay.world : state.world;
      const s = state.replay ? w.ships[0] : w.leader();
      return s ? w.sense(s) : null;
    },
    drawBrain: (cv) => { const n = xrayBrain(); ML.xray.drawNet(cv, n.sizes, (l, i, j) => n.weight(l, i, j), D.INPUT_NAMES, ["left rotor", "right rotor"]); },
    brainCaption: ML.xray.NET_CAPTION,
    notes: ["Nobody wrote a flight controller. These 140-odd knobs were found by breeding the best couriers, round after round. Real drones use hand-built controllers for the same job."],
  });
  ML.xray.button(playBtn.parentElement);

  newRound();
  drawChart();
  syncPlay();
  requestAnimationFrame(frame);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still flying", count: () => (state.human || state.replay || !state.world ? null : [state.world.ships.filter((s) => s.alive).length, state.world.ships.length]) });
})();
