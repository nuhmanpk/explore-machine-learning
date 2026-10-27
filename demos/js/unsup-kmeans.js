// Pizza Shop Planner — k-means (Lloyd's algorithm): houses are points, pizza shops are centroids.
(function () {
  const W = 640, H = 460;
  const BLOCK = 40; // px per "block" for trip lengths
  const cv = document.getElementById("cv");
  const { ctx } = ML.setupCanvas(cv, W, H);
  const SW = 300, SH = 110;
  const { ctx: sctx } = ML.setupCanvas(document.getElementById("spark"), SW, SH);
  const EW = 300, EH = 120;
  const { ctx: ectx } = ML.setupCanvas(document.getElementById("elbow"), EW, EH);
  const { hexRgb, rgb, mix } = SupKit;

  const SHOP = ["--nn", "--rl", "--sup", "--diff", "--vision", "--lang"];
  const SHOP_NAMES = ["Purple", "Orange", "Blue", "Pink", "Green", "Yellow"];

  const state = {
    houses: [], // {x, y, c, pc}
    shops: [],  // {x, y, fx, fy, tx, ty}
    k: 3, next: "assign", anim: null, auto: false,
    rounds: 0, history: [], elbow: null, drag: null, viewing: null,
  };

  let SRGB = [], GRAY = [0, 0, 0];
  function readColors() { SRGB = SHOP.map((v) => hexRgb(ML.cssVar(v))); GRAY = hexRgb(ML.cssVar("--muted")); }
  readColors();

  // ---------- town presets ----------
  const M = 22;
  const clampPt = (x, y) => [ML.clamp(x, M, W - M), ML.clamp(y, M, H - M)];
  function add(x, y) { const [cx, cy] = clampPt(x, y); state.houses.push({ x: cx, y: cy, c: -1, pc: -1 }); }
  const presets = KMeansCore.makePresets(W, H, add, { rand: ML.rand, randInt: ML.randInt, randn: ML.randn, random: Math.random });
  function loadPreset(name, msg) {
    stopAuto();
    state.houses = [];
    presets[name]();
    state.elbow = null; drawElbow();
    dropShops(true);
    ML.say(msg);
  }

  // ---------- k-means ----------
  function dropShops(quiet) {
    state.shops = [];
    for (let i = 0; i < state.k; i++) {
      // start at a random house (plus a nudge) so every shop begins near someone
      const src = state.houses.length ? state.houses[ML.randInt(0, state.houses.length - 1)] : { x: ML.rand(60, W - 60), y: ML.rand(60, H - 60) };
      const [x, y] = clampPt(src.x + ML.randn() * 25, src.y + ML.randn() * 25);
      state.shops.push({ x, y, fx: x, fy: y, tx: x, ty: y });
    }
    resetAssignments();
    if (!quiet) ML.say(`${state.k} shops in brand-new random spots. Press <b>Step 1</b> and every house picks its closest shop!`);
  }
  function resetAssignments() {
    state.houses.forEach((h) => { h.c = -1; h.pc = -1; });
    state.next = "assign"; state.rounds = 0; state.history = []; state.anim = null;
    cps.unpick(); cps.reset();
    updateUI();
    setInside("start");
  }
  const nearest = (x, y, shops = state.shops) => KMeansCore.nearest(x, y, shops);
  const avgTrip = () => KMeansCore.avgTrip(state.houses, state.shops, BLOCK);
  const allAssigned = () => state.houses.length && state.houses.every((h) => h.c >= 0);

  function doAssign() {
    if (!state.houses.length) { ML.say("No houses yet! Pick a town above, or drag on the map to build some."); return; }
    cps.unpick();
    let changed = 0;
    for (const h of state.houses) { h.pc = h.c; h.c = nearest(h.x, h.y); if (h.c !== h.pc) changed++; }
    state.anim = { type: "assign", t: 0 };
    state.next = "move";
    const first = state.history.length === 0;
    if (first) { state.history.push({ x: 0, y: avgTrip() }); capture(0); }
    setInside("assign", changed);
    if (!first && changed === 0) { converged(); return; }
    if (!state.auto) {
      const empty = state.shops.findIndex((_, i) => !state.houses.some((h) => h.c === i));
      ML.say(empty >= 0 ? `Oh no, nobody orders from the <b>${SHOP_NAMES[empty]}</b> shop — it's too far from every house! It will just sit there.`
        : first ? "Each house picked its <b>closest</b> shop and painted its roof that color. But look how far some scooters drive! Press <b>Step 2</b>."
        : `<b>${changed}</b> houses switched to a closer shop. Now the shops can move again.`);
    }
    updateUI();
  }
  function doMove() {
    cps.unpick();
    state.shops.forEach((m, i) => {
      m.fx = m.x; m.fy = m.y;
      const cen = KMeansCore.centroid(state.houses, i);
      if (cen) { m.tx = cen.x; m.ty = cen.y; }
      else { m.tx = m.x; m.ty = m.y; }
    });
    state.anim = { type: "move", t: 0 };
    state.next = "assign";
    state.rounds++;
    setInside("move");
    if (!state.auto) ML.say("Each shop moved to the <b>middle</b> of its own houses. Shorter trips! Now some houses might be closer to a different shop… press <b>Step 1</b>.");
    updateUI();
  }
  function afterMove() {
    state.history.push({ x: state.rounds, y: avgTrip() });
    capture(state.rounds);
    updateUI();
  }
  function converged() {
    stopAuto();
    const n = new Set(state.houses.map((h) => h.c)).size;
    capture(-1);
    ML.say(`All calm! No house wants to switch, so I found <b>${n} neighbourhoods</b> in ${state.rounds} rounds. Average trip: <b>${avgTrip().toFixed(1)} blocks</b>. Tap the snapshots to replay how I got here.`);
    SupKit.overlay("Neighbourhoods found!");
    ML.confetti(40);
    updateUI();
  }
  function step() { if (state.anim) return; state.next === "assign" ? doAssign() : doMove(); }

  const runKMeans = (k, restarts = 4) => KMeansCore.runKMeans(state.houses, k, restarts, BLOCK, { rand: ML.rand, randInt: ML.randInt, randn: ML.randn, random: Math.random });

  // ---------- auto ----------
  let autoTimer = null;
  const autoBtn = document.getElementById("b-auto");
  function startAuto() {
    if (!state.houses.length) return;
    state.auto = true;
    autoBtn.innerHTML = `${ML.icon("pause")} Pause`;
    ML.say("Auto mode! Step 1, step 2, step 1, step 2… until no house switches. Watch the trip chart drop!");
    const tick = () => { if (!state.auto) return; if (!state.anim) step(); autoTimer = setTimeout(tick, 800); };
    tick();
  }
  function stopAuto() { state.auto = false; clearTimeout(autoTimer); autoBtn.innerHTML = `${ML.icon("play")} Auto`; }

  // ---------- checkpoints ----------
  const cps = new SupKit.Checkpoints(document.getElementById("cps"), {
    milestones: [0, 1, 2, 3, 5, -1],
    label: (m) => (m === -1 ? "Finished" : m === 0 ? "Start" : `Round ${m}`),
    draw: (c, w, h, snap) => {
      const sx = w / W, sy = h / H;
      snap.houses.forEach((p) => { c.fillStyle = rgb(p.c >= 0 ? SRGB[p.c] : GRAY); c.fillRect(p.x * sx - 1.5, p.y * sy - 1.5, 3, 3); });
      snap.shops.forEach((s, i) => { c.fillStyle = rgb(SRGB[i]); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1.5; c.beginPath(); c.arc(s.x * sx, s.y * sy, 5, 0, Math.PI * 2); c.fill(); c.stroke(); });
    },
    onPick: (snap, m) => {
      state.viewing = snap;
      const vb = document.getElementById("viewing");
      vb.classList.toggle("show", !!snap);
      if (snap) {
        stopAuto();
        vb.innerHTML = `${ML.icon("clock")} Looking back · back to live`;
        ML.say(`${m === 0 ? "At the start" : m === -1 ? "At the finish" : "After round " + m} the average trip was <b>${snap.trip.toFixed(1)} blocks</b>.`);
      }
    },
  });
  document.getElementById("viewing").addEventListener("click", () => cps.unpick());
  function capture(m) {
    const trip = avgTrip();
    cps.capture(m, { houses: state.houses.map((h) => ({ x: h.x, y: h.y, c: h.c })), shops: state.shops.map((s) => ({ x: s.tx, y: s.ty })), trip }, `${trip.toFixed(1)} blocks`, m === -1);
  }

  // ---------- inside card ----------
  const insideEl = document.getElementById("inside");
  function setInside(kind, changed) {
    if (kind === "start") {
      insideEl.innerHTML = `<div class="sig"><span class="dot" style="background:var(--muted)"></span><span>Gray roofs = houses that haven't picked a shop yet.</span></div>
        <div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Next: every house measures the distance to each shop and picks the shortest.</span></div>`;
      return;
    }
    const rows = state.shops.map((s, i) => {
      const mine = state.houses.filter((h) => h.c === i);
      const dist = mine.length ? mine.reduce((a, h) => a + Math.hypot(h.x - (kind === "move" ? s.tx : s.x), h.y - (kind === "move" ? s.ty : s.y)), 0) / mine.length / BLOCK : 0;
      const moved = kind === "move" ? Math.hypot(s.tx - s.fx, s.ty - s.fy) / BLOCK : 0;
      return `<div class="sig"><span class="dot" style="background:var(${SHOP[i]})"></span><span><b>${SHOP_NAMES[i]}</b>: ${mine.length} houses, avg ${dist.toFixed(1)} blocks${kind === "move" ? ` <span class="arrow">→</span> moves ${moved.toFixed(1)} blocks` : ""}</span></div>`;
    }).join("");
    insideEl.innerHTML = `<div class="mono">${kind === "assign" ? `Step 1 · ${changed} house${changed === 1 ? "" : "s"} switched shop` : `Step 2 · round ${state.rounds}`}</div>${rows}
      <div class="decision">${kind === "assign" ? (changed === 0 && state.history.length > 1 ? "Nobody switched → done!" : "Next: shops move to their middle") : "Next: houses re-check the closest shop"}</div>`;
  }

  // ---------- drawing ----------
  const GW = 160, GH = 115;
  const vor = document.createElement("canvas"); vor.width = GW; vor.height = GH;
  const vctx = vor.getContext("2d");
  const vimg = vctx.createImageData(GW, GH);
  function drawTown() {
    ctx.strokeStyle = ML.cssVar("--line"); ctx.lineWidth = 6; ctx.lineCap = "butt";
    for (let x = BLOCK; x < W; x += BLOCK * 2) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = BLOCK; y < H; y += BLOCK * 2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }
  function drawVoronoi(shops) {
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const c = nearest(((i + 0.5) / GW) * W, ((j + 0.5) / GH) * H, shops);
      const o = (j * GW + i) * 4;
      vimg.data[o] = SRGB[c][0]; vimg.data[o + 1] = SRGB[c][1]; vimg.data[o + 2] = SRGB[c][2]; vimg.data[o + 3] = 30;
    }
    vctx.putImageData(vimg, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(vor, 0, 0, W, H);
  }
  function drawHouse(x, y, roof) {
    const ink = ML.cssVar("--ink");
    ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.lineJoin = "round";
    ctx.fillStyle = ML.cssVar("--card");
    ctx.fillRect(x - 5, y - 1, 10, 7); ctx.strokeRect(x - 5, y - 1, 10, 7);
    ctx.fillStyle = rgb(roof);
    ctx.beginPath(); ctx.moveTo(x - 7.5, y); ctx.lineTo(x, y - 7.5); ctx.lineTo(x + 7.5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function drawShop(s, i, glow) {
    const ink = ML.cssVar("--ink");
    ctx.save(); ctx.translate(s.x, s.y);
    if (glow) { ctx.fillStyle = rgb(SRGB[i], 0.2); ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = rgb(SRGB[i]); ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // pizza: crust, cheese, pepperoni, slice lines
    ctx.fillStyle = "#e3a04f"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 12.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffd65c"; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1;
    for (let a = 0; a < 3; a++) { ctx.beginPath(); ctx.moveTo(Math.cos(a * 1.047) * -10, Math.sin(a * 1.047) * -10); ctx.lineTo(Math.cos(a * 1.047) * 10, Math.sin(a * 1.047) * 10); ctx.stroke(); }
    ctx.fillStyle = "#d9433a";
    [[-4, -4], [4, -3], [0, 4], [-5, 3], [5, 4]].forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    const a = state.anim;
    if (a) {
      a.t += dt / (a.type === "assign" ? 600 : 800);
      if (a.type === "move") { const e = ease(Math.min(1, a.t)); state.shops.forEach((m) => { m.x = ML.lerp(m.fx, m.tx, e); m.y = ML.lerp(m.fy, m.ty, e); }); }
      if (a.t >= 1) {
        const done = a.type;
        state.anim = null;
        if (done === "move") { state.shops.forEach((m) => { m.x = m.tx; m.y = m.ty; }); afterMove(); }
      }
    }
    const V = state.viewing;
    const houses = V ? V.houses : state.houses, shops = V ? V.shops : state.shops;
    ctx.clearRect(0, 0, W, H);
    drawTown();
    if (shops.length && (V || state.houses.some((h) => h.c >= 0))) drawVoronoi(shops);

    // delivery routes
    const showRoutes = V || (a && a.type === "assign");
    if (showRoutes) {
      const grow = V ? 1 : Math.min(1, a.t * 2), fade = V ? 0.35 : a.t < 0.5 ? 0.7 : 0.7 * (1 - (a.t - 0.5) * 2);
      ctx.lineWidth = 1.5;
      for (const h of houses) {
        if (h.c < 0) continue;
        const m = shops[h.c];
        ctx.strokeStyle = rgb(SRGB[h.c], fade);
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(ML.lerp(h.x, m.x, grow), ML.lerp(h.y, m.y, grow)); ctx.stroke();
      }
    }
    if (a && a.type === "move") {
      ctx.setLineDash([5, 5]); ctx.lineWidth = 2.5;
      state.shops.forEach((m, i) => { ctx.strokeStyle = rgb(SRGB[i]); ctx.beginPath(); ctx.moveTo(m.fx, m.fy); ctx.lineTo(m.x, m.y); ctx.stroke(); });
      ctx.setLineDash([]);
    }

    const ct = a && a.type === "assign" ? Math.min(1, a.t * 1.6) : 1;
    for (const h of houses) {
      const to = h.c >= 0 ? SRGB[h.c] : GRAY;
      const from = V ? to : h.pc >= 0 ? SRGB[h.pc] : GRAY;
      drawHouse(h.x, h.y, mix(from, to, ct));
    }
    shops.forEach((s, i) => drawShop(s, i, state.drag && state.drag.i === i));

    if (!houses.length) {
      ctx.fillStyle = ML.cssVar("--muted"); ctx.font = "800 18px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Drag here to build houses, or pick a town above", W / 2, H / 2);
    }
    requestAnimationFrame(frame);
  }

  function drawSpark() {
    SupKit.lineChart(sctx, SW, SH, [{ data: state.history.filter((d) => d.y !== null), color: ML.cssVar("--accent") }], {
      xMax: Math.max(5, state.rounds), yMin: 0, yFmt: (v) => v.toFixed(1), xLabel: "rounds →",
    });
  }
  function drawElbow() {
    ectx.clearRect(0, 0, EW, EH);
    if (!state.elbow) {
      ectx.fillStyle = ML.cssVar("--muted"); ectx.font = "700 12px Nunito, sans-serif"; ectx.textAlign = "center";
      ectx.fillText("press the button to test 1–8 shops", EW / 2, EH / 2);
      return;
    }
    const v = state.elbow, mx = v[0], bw = (EW - 20) / v.length;
    let elbow = 1, bestD = -Infinity;
    const yN = v[v.length - 1] / mx;
    for (let i = 1; i < v.length - 1; i++) { const x = i / (v.length - 1), d = 1 + (yN - 1) * x - v[i] / mx; if (d > bestD) { bestD = d; elbow = i; } }
    v.forEach((val, i) => {
      const h = (val / mx) * (EH - 34), x = 10 + i * bw;
      ectx.fillStyle = i === elbow ? ML.cssVar("--accent") : ML.cssVar("--line");
      SupKit.rr(ectx, x + 4, EH - 20 - h, bw - 8, h, 5); ectx.fill();
      ectx.fillStyle = ML.cssVar("--ink"); ectx.font = "700 10px Nunito, sans-serif"; ectx.textAlign = "center";
      ectx.fillText(val.toFixed(1), x + bw / 2, EH - 24 - h);
      ectx.fillStyle = ML.cssVar(i + 1 === state.k ? "--ink" : "--muted"); ectx.font = `${i + 1 === state.k ? 800 : 700} 12px Nunito, sans-serif`;
      ectx.fillText(i + 1, x + bw / 2, EH - 6);
    });
    return elbow + 1;
  }

  function updateUI() {
    const t = allAssigned() ? avgTrip() : null;
    document.getElementById("s-mess").innerHTML = t === null ? "–" : `${t.toFixed(1)}<small> blocks</small>`;
    document.getElementById("s-round").textContent = state.rounds;
    document.getElementById("b-assign").classList.toggle("primary", state.next === "assign");
    document.getElementById("b-move").classList.toggle("primary", state.next === "move");
    drawSpark();
  }

  // ---------- controls ----------
  document.getElementById("b-assign").addEventListener("click", () => { stopAuto(); if (!state.anim) doAssign(); });
  document.getElementById("b-move").addEventListener("click", () => {
    stopAuto(); if (state.anim) return;
    if (!allAssigned()) { ML.say("Wait! First every house needs to pick a shop. Press <b>Step 1</b>."); return; }
    doMove();
  });
  autoBtn.addEventListener("click", () => (state.auto ? stopAuto() : startAuto()));
  document.getElementById("b-drop").addEventListener("click", () => { stopAuto(); dropShops(); });
  let ready = false;
  ML.bindRange("#k", (v) => v, (v) => {
    state.k = v;
    if (!ready) return;
    stopAuto(); dropShops(true);
    ML.say(`Now planning <b>${v} shops</b>. Press <b>Step 1</b> or <b>Auto</b>!`);
    if (state.elbow) drawElbow();
  });
  document.getElementById("b-elbow").addEventListener("click", () => {
    if (state.houses.length < 8) { ML.say("I need more houses to test that!"); return; }
    state.elbow = Array.from({ length: 8 }, (_, i) => runKMeans(i + 1));
    const e = drawElbow();
    document.getElementById("elbow-note").innerHTML = `The bend (the "elbow") is at <b>${e}</b> shops — after that, each extra shop only saves a little driving.`;
    ML.say(`I planned the town with 1, 2, 3… up to 8 shops. Trips always get shorter, but after about <b>${e}</b> shops it's not worth much. That's probably how many neighbourhoods there are!`);
  });
  document.getElementById("p-blobs").addEventListener("click", () => loadPreset("blobs", "A few villages! Can my shops find each village? Press <b>Auto</b> to watch."));
  document.getElementById("p-random").addEventListener("click", () => loadPreset("random", "Houses spread all over — no real neighbourhoods. I'll still split the town into areas, but are they real groups?"));
  document.getElementById("p-ring").addEventListener("click", () => loadPreset("ring", "Houses all around a lake! The middle of a group can end up <b>in the water</b>. Funny place for a pizza shop!"));
  document.getElementById("p-moons").addEventListener("click", () => loadPreset("moons", "Two curvy streets along a river. My shops like round neighbourhoods… let's see if I get confused!"));
  document.getElementById("p-clear").addEventListener("click", () => { stopAuto(); state.houses = []; state.elbow = null; drawElbow(); resetAssignments(); ML.say("An empty town! Drag on the map to build houses."); });

  let lastPaint = null, painted = 0;
  cv.addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint(cv, e, W, H);
    cv.setPointerCapture(e.pointerId);
    cps.unpick();
    const i = state.shops.findIndex((s) => Math.hypot(s.x - p.x, s.y - p.y) < 26);
    stopAuto();
    if (i >= 0) { state.anim = null; state.shops.forEach((s) => { s.x = s.tx; s.y = s.ty; }); state.drag = { type: "shop", i }; return; }
    state.drag = { type: "paint" }; lastPaint = null; painted = 0;
    build(p);
  });
  function build(p) {
    if (lastPaint && Math.hypot(p.x - lastPaint.x, p.y - lastPaint.y) < 12) return;
    lastPaint = p;
    add(p.x + ML.randn() * 12, p.y + ML.randn() * 12); painted++;
  }
  cv.addEventListener("pointermove", (e) => {
    const d = state.drag; if (!d) return;
    const p = ML.canvasPoint(cv, e, W, H);
    if (d.type === "shop") { const s = state.shops[d.i]; [s.x, s.y] = clampPt(p.x, p.y); s.fx = s.tx = s.x; s.fy = s.ty = s.y; }
    else build(p);
  });
  function up() {
    const d = state.drag; state.drag = null;
    if (!d) return;
    state.houses.forEach((h) => (h.pc = h.c));
    state.next = "assign"; updateUI();
    if (d.type === "shop") ML.say(`You moved the <b>${SHOP_NAMES[d.i]}</b> shop! Press <b>Step 1</b> — will houses switch? Can it fix itself, or get stuck in a silly spot?`);
    else if (painted) ML.say(`Built <b>${painted}</b> new houses! Their roofs are gray until they pick a shop.`);
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  document.addEventListener("themechange", () => { readColors(); cps.redraw(); drawSpark(); drawElbow(); });

  presets.blobs();
  dropShops(true);
  drawElbow();
  ready = true;
  requestAnimationFrame(frame);
})();
