// Ants Find the Best Path — drawing, controls, chart, checkpoints and challenges.
(function () {
  const { W, H, Colony } = window.AntsACO;
  const map = ML.setupCanvas(document.getElementById("map"), W, H);
  const CW = 660, CH = 170;
  const chart = ML.setupCanvas(document.getElementById("chart"), CW, CH);
  const $ = (id) => document.getElementById(id);

  const state = {
    colony: new Colony({ seed: 1, map: "meadow" }),
    playing: false,
    speed: 3, // ticks per frame; 0 = turbo
    samples: [], // {t, fav, avg, opt}
    markers: [], // {i, label}
    checkpoints: [],
    viewing: null,
    watched: 0, // index of the ant with the ring
    challenge: null, // {t, opt, label}
    milestones: {},
  };
  const CKPT_AT = [150, 500, 1200, 2500, 5000];

  // ---------- colours ----------
  let C = {};
  function readColors() {
    const dark = ML.isDark();
    C = {
      ink: ML.cssVar("--ink"), muted: ML.cssVar("--muted"), accent: ML.cssVar("--accent"), good: ML.cssVar("--good"),
      bad: ML.cssVar("--bad"), card: ML.cssVar("--card"), line: ML.cssVar("--line"), bg2: ML.cssVar("--bg-2"),
      grass: dark ? "#1d2b26" : "#e6f2da", grass2: dark ? "#22332c" : "#d9ebcb",
      path: dark ? "#5b4f3f" : "#d8c3a0", pathEdge: dark ? "#3e352a" : "#bfa57d",
      water: dark ? "#1f3f5c" : "#bfe0f5", water2: dark ? "#2b5577" : "#9fd0ef",
      smell: dark ? "#ff9bd0" : "#e0459b",
    };
  }
  readColors();
  document.addEventListener("themechange", readColors);

  // ---------- drawing ----------
  const favLen = (c) => { const f = c.favouriteRoute(); return f.found ? f.edges.reduce((s, e) => s + e.len, 0) : null; };

  function drawMap(snapshot) {
    const ctx = map.ctx, c = state.colony;
    const taus = snapshot ? snapshot.taus : c.edges.map((e) => e.tau);
    const closed = snapshot ? snapshot.closed : c.edges.map((e) => e.closed);
    const hidden = snapshot ? snapshot.hidden : c.edges.map((e) => e.hidden);
    const foods = snapshot ? snapshot.foods : c.foods;
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 0, W, H);
    // grass tufts
    ctx.strokeStyle = C.grass2; ctx.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = (i * 97) % W, y = (i * 53 + 17) % H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 7); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 6); ctx.stroke();
    }
    if (c.river != null) {
      ctx.fillStyle = C.water;
      ctx.beginPath();
      for (let y = 0; y <= H; y += 10) ctx.lineTo(c.river - 22 + Math.sin(y / 40) * 8, y);
      for (let y = H; y >= 0; y -= 10) ctx.lineTo(c.river + 22 + Math.sin(y / 40) * 8, y);
      ctx.fill();
      ctx.strokeStyle = C.water2; ctx.lineWidth = 2;
      for (let y = 20; y < H; y += 46) { ctx.beginPath(); ctx.moveTo(c.river - 8, y); ctx.quadraticCurveTo(c.river, y - 5, c.river + 8, y); ctx.stroke(); }
    }
    // paths
    c.edges.forEach((e, i) => {
      if (hidden[i]) return;
      const a = c.nodes[e.a], b = c.nodes[e.b];
      ctx.lineCap = "round";
      if (e.bridge) {
        ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.strokeStyle = C.pathEdge; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = C.path; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // smell glow
      const s = Math.min(1, (taus[i] - c.tauMin) / (c.tauMax - c.tauMin));
      if (s > 0.02 && !closed[i]) {
        ctx.strokeStyle = C.smell; ctx.globalAlpha = 0.15 + s * 0.8; ctx.lineWidth = 2 + s * 7;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (closed[i]) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.fillStyle = C.bad; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 10, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(mx - 4, my - 4); ctx.lineTo(mx + 4, my + 4); ctx.moveTo(mx + 4, my - 4); ctx.lineTo(mx - 4, my + 4); ctx.stroke();
      }
    });
    // crossings
    ctx.fillStyle = C.pathEdge;
    for (const n of c.nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, 4, 0, 7); ctx.fill(); }
    // nest: an ant hill
    const nn = c.nodes[c.nest];
    ctx.fillStyle = "#a0714a"; ctx.strokeStyle = "#5d3b22"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(nn.x, nn.y + 4, 22, 15, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#3b2414"; ctx.beginPath(); ctx.ellipse(nn.x, nn.y - 2, 5, 3.5, 0, 0, 7); ctx.fill();
    // food: cookies
    for (const f of foods) {
      const p = c.nodes[f];
      ctx.fillStyle = "#e3a957"; ctx.strokeStyle = "#a8692a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#5a3418";
      [[-5, -4], [4, -6], [6, 4], [-4, 6], [0, 0]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, 2.2, 0, 7); ctx.fill(); });
    }
    if (snapshot) return;
    // ants
    c.ants.forEach((a, i) => {
      const p = c.pos(a);
      const ang = a.edge ? Math.atan2(c.nodes[c.other(a.edge, a.from)].y - c.nodes[a.from].y, c.nodes[c.other(a.edge, a.from)].x - c.nodes[a.from].x) : 0;
      ctx.save(); ctx.translate(p.x + ((i * 7) % 5) - 2, p.y + ((i * 3) % 5) - 2); ctx.rotate(ang);
      ctx.fillStyle = "#2a1d14";
      ctx.beginPath(); ctx.ellipse(-3, 0, 2.6, 2, 0, 0, 7); ctx.ellipse(1.5, 0, 2.2, 1.7, 0, 0, 7); ctx.fill();
      if (a.mode === "home") { ctx.fillStyle = "#e3a957"; ctx.beginPath(); ctx.arc(4.5, 0, 2.2, 0, 7); ctx.fill(); }
      ctx.restore();
    });
    const wa = c.ants[state.watched];
    if (wa) {
      const p = c.pos(wa);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7); ctx.stroke();
    }
  }

  function drawChart() {
    const ctx = chart.ctx;
    ctx.clearRect(0, 0, CW, CH);
    const S = state.samples;
    if (S.length < 2) {
      ctx.fillStyle = C.muted; ctx.font = "700 14px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Press Play: the lines appear as the ants find food", CW / 2, CH / 2);
      return;
    }
    const vals = S.flatMap((s) => [s.fav, s.opt].filter((v) => v != null));
    const hi = Math.max(...vals) * 1.15, lo = Math.min(...vals) * 0.85;
    const pad = 8, x = (i) => pad + (i / Math.max(1, S.length - 1)) * (CW - pad * 2), y = (v) => CH - 18 - ((v - lo) / (hi - lo)) * (CH - 34);
    const line = (key, color, width, dash = []) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.beginPath();
      let on = false;
      S.forEach((s, i) => { const v = s[key]; if (v == null) { on = false; return; } on ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)); on = true; });
      ctx.stroke(); ctx.setLineDash([]);
    };
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.clip();
    ctx.globalAlpha = 0.5; line("avg", C.muted, 1.5); ctx.globalAlpha = 1;
    ctx.restore();
    line("opt", C.good, 2.5, [6, 5]);
    line("fav", C.accent, 3);
    // challenge markers
    ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "left";
    for (const m of state.markers) {
      if (m.i < 0 || m.i >= S.length) continue;
      const mx = x(m.i);
      ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(mx, 4); ctx.lineTo(mx, CH - 14); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink; ctx.fillText(m.label, Math.min(mx + 3, CW - 90), 12);
    }
    ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.fillText("longer ↑", 4, CH - 4);
  }

  // ---------- inside card ----------
  let insideTick = 0;
  function renderInside() {
    if (++insideTick % 10) return;
    const c = state.colony;
    let a = c.ants[state.watched];
    if (!a || !a.choice) {
      // follow a different ant that has made a choice
      const i = c.ants.findIndex((x) => x.choice);
      if (i >= 0) { state.watched = i; a = c.ants[i]; } else return;
    }
    const ch = a.choice;
    const here = c.nodes[ch.node];
    const dirName = (e) => {
      const to = c.nodes[c.other(e, ch.node)];
      const ang = Math.atan2(to.y - here.y, to.x - here.x) * 180 / Math.PI;
      return ang > -30 && ang < 30 ? "right" : ang >= 30 && ang < 150 ? "down" : ang <= -30 && ang > -150 ? "up" : "left";
    };
    const total = ch.total || 1;
    const rows = ch.scored.slice().sort((x, y) => y.w - x.w).slice(0, 4);
    $("in-head").textContent = a.mode === "home" ? "The ringed ant found food and is walking home, dropping smell. Its last choice was:" : "The ringed ant is at a crossing, choosing a path:";
    $("in-bars").innerHTML = rows.map((o) => {
      const pct = Math.round((o.w / total) * 100);
      return `<div class="choice-bar ${o === ch.pick ? "picked" : ""}"><div><div class="choice-lbl">path going ${dirName(o.e)} · smell ${o.e.tau.toFixed(1)} · ${o.e.len < 75 ? "short" : o.e.len < 110 ? "medium" : "long"}</div><div class="track"><div class="fill" style="width:${pct}%"></div></div></div><span class="num">${pct}%</span></div>`;
    }).join("");
    const pick = ch.pick;
    $("in-decision").innerHTML = ch.curious
      ? `Curious! It ignored the smell and tried the path going <b>${dirName(pick.e)}</b>, just to see.`
      : `The path going <b>${dirName(pick.e)}</b> ${pick.e.tau > 2 ? "smells strong" : "is short"} → ${Math.round((pick.w / total) * 100)}% chance → it went that way.`;
  }

  // ---------- stats, samples, narration ----------
  function sample() {
    const c = state.colony;
    const opt = c.shortest();
    // The greedy "follow the strongest smell" path flickers between near-equal paths,
    // so the chart shows a running median of the last few readings.
    const raw = favLen(c);
    state.rawFav = (state.rawFav || []).concat([raw]).slice(-7);
    const ok = state.rawFav.filter((v) => v != null).sort((a, b) => a - b);
    const fav = ok.length >= 3 ? ok[ok.length >> 1] : raw;
    state.samples.push({ t: c.tick, fav, avg: c.recentLength(), opt: opt === Infinity ? null : opt });
    if (state.samples.length > 1500) {
      state.samples.splice(0, 300);
      state.markers.forEach((m) => (m.i -= 300));
      state.markers = state.markers.filter((m) => m.i >= 0);
    }
    checkMilestones();
  }

  function checkMilestones() {
    const c = state.colony, M = state.milestones;
    const last = state.samples[state.samples.length - 1];
    if (!M.firstFood && c.trips.length) { M.firstFood = true; ML.say(`An ant found the food and walked home, leaving a <b>smell trail</b>. Other ants will start following it!`); }
    if (last.fav && last.opt) {
      const ratio = last.fav / last.opt;
      if (state.challenge) {
        if (ratio <= 1.02) {
          const secs = ((c.tick - state.challenge.t) / 180).toFixed(0);
          ML.say(`Found it! After "${state.challenge.label}", the colony found the <b>new best path</b> in about ${secs} seconds of ant-time. Nobody told them!`);
          state.challenge = null;
        }
      } else if (!M.best && ratio <= 1.02) {
        M.best = true;
        ML.confetti();
        ML.xray.offer("The colony found the shortest path! X-ray it");
        ML.say(`The colony's favourite path is now <b>the shortest possible</b>! No ant planned it. Now try a <b>challenge</b>.`);
      } else if (!M.close && ratio <= 1.25 && c.tick > 300) {
        M.close = true;
        ML.say(`See the pink glow? That's the smell. The ants are piling onto shorter paths, so those smell even stronger.`);
      }
    }
  }

  function renderStats() {
    const c = state.colony;
    $("st-trips").textContent = c.trips.length;
    $("st-carry").textContent = c.ants.filter((a) => a.mode === "home").length;
    const last = state.samples[state.samples.length - 1];
    const f = last ? last.fav : null, o = c.shortest();
    $("st-fav").innerHTML = f ? `${Math.round(f / 10)}<small> steps</small>` : "–";
    $("st-best").innerHTML = o < Infinity ? `${Math.round(o / 10)}<small> steps</small>` : "–";
  }

  // ---------- checkpoints ----------
  function snapshot(label) {
    const c = state.colony;
    return { label, t: c.tick, taus: c.edges.map((e) => e.tau), closed: c.edges.map((e) => e.closed), hidden: c.edges.map((e) => e.hidden), foods: c.foods.slice(), fav: favLen(c), opt: c.shortest(), edges: c.edges };
  }
  function maybeCheckpoint() {
    const c = state.colony;
    if (state.nextCkpt == null) state.nextCkpt = 0;
    if (state.nextCkpt < CKPT_AT.length && c.tick >= CKPT_AT[state.nextCkpt]) {
      state.checkpoints.push(snapshot(`After ${CKPT_AT[state.nextCkpt]} ticks`));
      state.nextCkpt++;
      renderCheckpoints();
    }
    if (state.pendingCkpt && c.tick >= state.pendingCkpt.t) {
      state.checkpoints.push(snapshot(state.pendingCkpt.label));
      state.pendingCkpt = null;
      renderCheckpoints();
    }
  }
  function renderCheckpoints() {
    const host = $("ckpts");
    if (!state.checkpoints.length) { host.innerHTML = `<div class="empty">Smell maps get saved here as the colony learns.</div>`; return; }
    host.innerHTML = state.checkpoints.map((s, i) => `<button class="ckpt ${state.viewing === s ? "on" : ""}" data-i="${i}"><canvas width="216" height="135"></canvas><b>${s.label}</b><small>${s.fav ? `path ${Math.round(s.fav / 10)} vs best ${Math.round(s.opt / 10)}` : "no path yet"}</small></button>`).join("");
    host.querySelectorAll(".ckpt").forEach((b) => {
      const s = state.checkpoints[+b.dataset.i];
      drawMini(b.querySelector("canvas"), s);
      b.addEventListener("click", () => view(s));
    });
    host.scrollLeft = host.scrollWidth;
  }
  function drawMini(cv, s) {
    const ctx = cv.getContext("2d"), c = state.colony, k = 216 / W;
    ctx.fillStyle = C.grass; ctx.fillRect(0, 0, 216, 135);
    s.edges.forEach((e, i) => {
      if (s.hidden[i] || !c.nodes[e.a]) return;
      const a = c.nodes[e.a], b = c.nodes[e.b];
      ctx.strokeStyle = s.closed[i] ? C.bad : C.path; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x * k, a.y * k); ctx.lineTo(b.x * k, b.y * k); ctx.stroke();
      const v = Math.min(1, (s.taus[i] - c.tauMin) / (c.tauMax - c.tauMin));
      if (v > 0.05 && !s.closed[i]) { ctx.strokeStyle = C.smell; ctx.globalAlpha = 0.2 + v * 0.8; ctx.lineWidth = 1 + v * 3.5; ctx.beginPath(); ctx.moveTo(a.x * k, a.y * k); ctx.lineTo(b.x * k, b.y * k); ctx.stroke(); ctx.globalAlpha = 1; }
    });
  }
  function view(s) {
    state.viewing = s;
    $("viewing").classList.add("show");
    $("viewing-txt").textContent = `Looking back: ${s.label}`;
    renderCheckpoints();
    ML.say(`This is the smell map <b>${s.label.toLowerCase()}</b>. ${s.fav && s.opt && s.fav / s.opt < 1.03 ? "The glow already traced the shortest path!" : "The glow was still spread over many paths."}`);
  }
  $("back-live").addEventListener("click", () => { state.viewing = null; $("viewing").classList.remove("show"); renderCheckpoints(); });

  // ---------- challenges ----------
  function startChallenge(label, msg) {
    const c = state.colony;
    state.markers.push({ i: state.samples.length, label });
    state.challenge = { t: c.tick, label };
    state.pendingCkpt = { t: c.tick + 1500, label: `1500 ticks after "${label}"` };
    state.checkpoints.push(snapshot(`Just before "${label}"`));
    renderCheckpoints();
    flash(label);
    ML.say(msg);
    if (!state.playing) togglePlay();
    syncShortcut();
  }
  function flash(text) {
    const o = $("overlay");
    o.textContent = text;
    o.classList.add("show");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => o.classList.remove("show"), 1400);
  }
  $("ch-block").addEventListener("click", () => {
    const e = state.colony.blockBest();
    if (!e) return ML.toast("No busy path to block yet. Let them learn first!");
    startChallenge("Path blocked", `Roadblock! The ants' favourite path is closed. Watch the green line jump up, then see if they find a new way.`);
  });
  $("ch-food").addEventListener("click", () => {
    state.colony.moveFood();
    startChallenge("Food moved", `The cookie moved! All that smell now leads to the wrong place. The old trail has to fade before a new one wins.`);
  });
  $("ch-short").addEventListener("click", () => {
    const e = state.colony.openShortcut();
    if (!e) return ML.toast("This map has no secret shortcut left. Try New map!");
    startChallenge("Shortcut opened", state.colony.river != null
      ? `A new bridge appeared! It's shorter, but it has <b>no smell</b> yet. Will curious ants try it and switch?`
      : `A new path appeared! It's shorter, but it has <b>no smell</b> yet. Will curious ants try it and switch?`);
  });
  $("ch-food2").addEventListener("click", () => {
    const f = state.colony.addFood();
    if (f == null) return ML.toast("No room for more food");
    startChallenge("More food", `A second cookie! If it's closer, the colony should switch to it, because shorter trips leave more smell.`);
  });
  $("ch-rain").addEventListener("click", () => {
    state.colony.rain();
    startChallenge("Rain", `Splash! Rain washed most of the smell away. Can they find the best path again?`);
  });
  function syncShortcut() { $("ch-short").disabled = !state.colony.hidden; }

  // tap a path to close / open it
  $("map").addEventListener("pointerdown", (ev) => {
    if (state.viewing) return;
    const p = ML.canvasPoint($("map"), ev, W, H), c = state.colony;
    let best = null;
    for (const e of c.edges) {
      if (e.hidden) continue;
      const a = c.nodes[e.a], b = c.nodes[e.b];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (e.len * e.len)));
      const d = Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
      if (d < 12 && (!best || d < best.d)) best = { e, d };
    }
    if (!best) return;
    const wasClosed = best.e.closed;
    if (!c.toggle(best.e)) return ML.toast("That's the last way through, so it stays open!");
    if (wasClosed) startChallenge("Path opened", `You opened a path. If it's useful, curious ants will find it and the smell will build up.`);
    else startChallenge("You closed a path", `You closed a path! Watch the colony adapt.`);
  });

  // ---------- controls ----------
  function togglePlay() {
    state.playing = !state.playing;
    $("play").innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
  }
  $("play").addEventListener("click", () => {
    togglePlay();
    if (state.playing && state.colony.tick === 0) ML.say(`${state.colony.ants.length} ants set off. At first they wander almost at random, because there's no smell yet.`);
  });
  function resetColony(seed, mapName, msg) {
    const old = state.colony;
    state.colony = new Colony({ seed, map: mapName, ants: old.antCount, evap: old.evap, curiosity: old.curiosity });
    state.samples = []; state.markers = []; state.checkpoints = []; state.nextCkpt = 0; state.pendingCkpt = null;
    state.challenge = null; state.milestones = {}; state.viewing = null; state.watched = 0; state.rawFav = [];
    $("viewing").classList.remove("show");
    renderCheckpoints();
    syncShortcut();
    if (msg) ML.say(msg);
  }
  $("reset").addEventListener("click", () => resetColony(state.colony.seed, state.colony.map, `All smell wiped. The colony has to learn from scratch!`));
  document.querySelectorAll("#mapsel button").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.v;
    if (v !== "new") document.querySelectorAll("#mapsel button").forEach((x) => x.classList.toggle("on", x === b));
    const mapName = v === "new" ? state.colony.map : v;
    const seed = v === "new" ? Math.floor(Math.random() * 1e6) : state.colony.seed;
    resetColony(seed, mapName, mapName === "river"
      ? `A river! Only a couple of bridges cross it. The ants must discover which bridge is on the shortest way.`
      : v === "new" ? `A brand-new map. Nobody knows the way yet!` : `Back to the meadow.`);
  }));
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));
  ML.bindRange("#evap", (v) => (v * 1000).toFixed(0), (v) => (state.colony.evap = v));
  ML.bindRange("#cur", (v) => Math.round(v * 100) + "%", (v) => (state.colony.curiosity = v));
  ML.bindRange("#ants", (v) => v, (v) => state.colony.setAntCount(v));

  // ---------- main loop ----------
  let sinceSample = 0;
  function frame() {
    if (state.playing && !state.viewing) {
      const c = state.colony;
      const run = (n) => { for (let i = 0; i < n; i++) { c.step(); if (++sinceSample >= 30) { sinceSample = 0; sample(); } maybeCheckpoint(); } };
      if (state.speed === 0) {
        const t0 = performance.now();
        while (performance.now() - t0 < 9) run(10);
      } else run(ML.ticks(state.speed));
    }
    drawMap(state.viewing);
    drawChart();
    renderInside();
    renderStats();
    requestAnimationFrame(frame);
  }
  syncShortcut();
  requestAnimationFrame(frame);
  // ---------- Model X-ray ----------
  // Each ant's decision at a fork is a tiny real model: weight = smell^alpha × (100/length)^beta.
  // The colony's "memory" is the smell on every path.
  const antSeen = [];
  setInterval(() => {
    const c = state.colony;
    for (const a of c.ants || []) {
      const ch = a.choice;
      if (ch && ch.scored.length >= 2) {
        const [p, q] = ch.scored;
        antSeen.push([p.e.tau, q.e.tau, p.e.len, q.e.len]);
        if (antSeen.length > 500) antSeen.shift();
        break;
      }
    }
  }, 100);
  const w = (tau, len) => Math.pow(tau, state.colony.alpha) * Math.pow(100 / len, state.colony.beta);
  ML.xray.register({
    title: "How an ant chooses (and the colony's memory)",
    kind: "Ant colony optimisation",
    summary: () => `${state.colony.ants ? state.colony.ants.length : ""} ants · ${Math.round(state.colony.tick / 180)} s of ant-time`,
    size: () => `${state.colony.edges.length} paths of smell`,
    stats: () => [["Paths", state.colony.edges.length], ["Trusts smell", state.colony.alpha.toFixed(1)], ["Likes short", state.colony.beta.toFixed(1)]],
    inputs: [
      { name: "Smell on path A", min: 0.3, max: 8, describe: (v) => (v < 1 ? "faint" : v < 4 ? "smelly" : "very smelly") },
      { name: "Smell on path B", min: 0.3, max: 8, describe: (v) => (v < 1 ? "faint" : v < 4 ? "smelly" : "very smelly") },
      { name: "Length of path A", min: 40, max: 220, describe: (v) => (v < 80 ? "short" : v < 150 ? "medium" : "long") },
      { name: "Length of path B", min: 40, max: 220, describe: (v) => (v < 80 ? "short" : v < 150 ? "medium" : "long") },
    ],
    outputs: [{ name: "Take path A", color: ML.cssVar("--diff") }, { name: "Take path B", color: ML.cssVar("--sup") }],
    predict: (x) => { const a = w(x[0], x[2]), b = w(x[1], x[3]); return [a / (a + b), b / (a + b)]; },
    samples: () => antSeen,
    current: () => antSeen[antSeen.length - 1] || null,
    brainHeight: 380,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), col = state.colony, W = cv.width, H = cv.height;
      const xs = col.nodes.map((n) => n.x), ys = col.nodes.map((n) => n.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const sc = Math.min((W - 40) / (x1 - x0 || 1), (H - 40) / (y1 - y0 || 1));
      const X = (x) => 20 + (x - x0) * sc + (W - 40 - (x1 - x0) * sc) / 2, Y = (y) => 20 + (y - y0) * sc;
      for (const e of col.edges) {
        if (!col.open(e)) continue;
        const a = col.nodes[e.a], b = col.nodes[e.b], t = (e.tau - col.tauMin) / (col.tauMax - col.tauMin);
        c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 3; c.beginPath(); c.moveTo(X(a.x), Y(a.y)); c.lineTo(X(b.x), Y(b.y)); c.stroke();
        c.strokeStyle = ML.cssVar("--diff"); c.globalAlpha = Math.min(1, 0.1 + t); c.lineWidth = 2 + t * 12;
        c.beginPath(); c.moveTo(X(a.x), Y(a.y)); c.lineTo(X(b.x), Y(b.y)); c.stroke(); c.globalAlpha = 1;
      }
      const dot = (n, color, r) => { c.fillStyle = color; c.beginPath(); c.arc(X(col.nodes[n].x), Y(col.nodes[n].y), r, 0, 7); c.fill(); };
      dot(col.nest, ML.cssVar("--ink"), 10);
      col.foods.forEach((f) => dot(f, ML.cssVar("--good"), 10));
    },
    brainCaption: "The colony's memory is just smell. Thicker pink = more smell on that path. Black = nest, green = food. No single ant knows the map, but together they 'remember' the shortest route.",
    notes: ["Each ant follows one tiny rule at every fork. The decision map above is that rule: more smell or a shorter path makes a path more likely."],
  });
  ML.xray.button(document.getElementById("play").parentElement);
})();
