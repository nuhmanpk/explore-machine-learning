// Mouse Finds Cheese — tabular Q-learning on an editable grid world.
(function () {
  const N = 8, CELL = 70, W = N * CELL, H = N * CELL;
  const EMPTY = 0, WALL = 1, TRAP = 2, CHEESE = 3;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
  const R_CHEESE = 10, R_TRAP = -10, R_STEP = -0.1, R_BUMP = -0.3, MAX_STEPS = 150;
  const SPEEDS = [
    { name: "0.5×", sps: 3 }, // half of Walk (6)
    { name: "Walk", sps: 6 },
    { name: "Run", sps: 25 },
    { name: "Fast", sps: 120 },
    { name: "Turbo", sps: 0 },
  ];
  const TURBO_STEPS_PER_FRAME = 3000;

  const PRESETS = {
    tricky: [
      "M..#....",
      ".#.#.##.",
      ".#...#..",
      ".####.T.",
      "......#.",
      "T##.#.#.",
      "...#..#.",
      ".#...T#C",
    ],
    cliff: [
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "MTTTTTTC",
    ],
    open: [
      "M.......",
      "........",
      "...T....",
      "........",
      ".....T..",
      "..T.....",
      "........",
      ".......C",
    ],
    empty: [
      "M.......",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
    ],
  };

  const cv = document.getElementById("maze");
  const { ctx } = ML.setupCanvas(cv, W, H);
  const chartCv = document.getElementById("chart");
  const CW = 300, CH = 110;
  const chart = ML.setupCanvas(chartCv, CW, CH).ctx;
  const overlay = document.getElementById("overlay");

  let grid = new Uint8Array(N * N);
  let start = { x: 0, y: 0 };
  let Q = new Float32Array(N * N * 4);
  let visited = new Uint8Array(N * N);
  const P = { eps: 0.2, gamma: 0.9, alpha: 0.5, speed: 1 };

  let agent = { x: 0, y: 0 }, steps = 0, episode = 0, cheeseCount = 0, trapCount = 0;
  let trail = [], history = [], bestSteps = Infinity, celebrated = false;
  let running = false, showNums = false, tool = "wall";
  let anim = null; // {fx, fy, tx, ty, t0, dur}
  const CHECKS = [1, 10, 50, 100, 500, 2000];
  let ckpts = [], view = null, ckDirty = true;
  let lastSay = 0, lastTurboSay = 0, flash = null, facing = 1;

  const idx = (x, y) => y * N + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  function loadPreset(name) {
    const rows = PRESETS[name];
    grid.fill(EMPTY);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === "#") grid[idx(x, y)] = WALL;
      else if (ch === "T") grid[idx(x, y)] = TRAP;
      else if (ch === "C") grid[idx(x, y)] = CHEESE;
      else if (ch === "M") start = { x, y };
    }));
    resetBrain(false);
  }

  function resetBrain(talk = true) {
    Q.fill(0);
    visited.fill(0);
    ckpts = []; view = null; ckDirty = true;
    episode = 0; cheeseCount = 0; trapCount = 0; history = []; bestSteps = Infinity; celebrated = false;
    newEpisode();
    if (talk) ML.say("Poof! I forgot everything. My brain is a blank page again — let's explore!");
    updateStats();
  }

  function newEpisode() {
    agent = { x: start.x, y: start.y };
    steps = 0;
    trail = [{ x: agent.x, y: agent.y }];
    anim = null;
  }

  const maxQ = (s) => Math.max(Q[s * 4], Q[s * 4 + 1], Q[s * 4 + 2], Q[s * 4 + 3]);
  function argmaxQ(s) {
    let best = -Infinity, picks = [];
    for (let a = 0; a < 4; a++) {
      const q = Q[s * 4 + a];
      if (q > best + 1e-9) { best = q; picks = [a]; }
      else if (Math.abs(q - best) <= 1e-9) picks.push(a);
    }
    return picks[Math.floor(Math.random() * picks.length)];
  }

  // One real Q-learning step. Returns what happened so the narrator can talk about it.
  function stepAgent() {
    const s = idx(agent.x, agent.y);
    const explored = Math.random() < P.eps;
    const a = explored ? Math.floor(Math.random() * 4) : argmaxQ(s);
    let nx = agent.x + DIRS[a][0], ny = agent.y + DIRS[a][1];
    if (DIRS[a][0]) facing = DIRS[a][0];
    let r = R_STEP, bumped = false;
    if (!inside(nx, ny) || grid[idx(nx, ny)] === WALL) { nx = agent.x; ny = agent.y; r = R_BUMP; bumped = true; }
    const ns = idx(nx, ny);
    const cell = grid[ns];
    let outcome = null;
    if (cell === CHEESE) { r = R_CHEESE; outcome = "cheese"; }
    else if (cell === TRAP) { r = R_TRAP; outcome = "trap"; }
    const target = outcome ? r : r + P.gamma * maxQ(ns);
    Q[s * 4 + a] += P.alpha * (target - Q[s * 4 + a]);
    visited[s] = 1;

    const from = { x: agent.x, y: agent.y };
    agent = { x: nx, y: ny };
    steps++;
    trail.push({ x: nx, y: ny });
    if (!outcome && steps >= MAX_STEPS) outcome = "tired";
    const ev = { outcome, explored, bumped, steps, from, to: { x: nx, y: ny }, best: false };
    if (outcome) ev.best = endEpisode(outcome);
    return ev;
  }

  function endEpisode(outcome) {
    episode++;
    let best = false;
    if (outcome === "cheese") { cheeseCount++; best = steps < bestSteps; bestSteps = Math.min(bestSteps, steps); }
    if (outcome === "trap") trapCount++;
    history.push({ steps, outcome });
    if (history.length > 400) history.shift();
    if (CHECKS.includes(episode)) { ckpts.push({ n: episode, Q: Q.slice(), visited: visited.slice() }); ckDirty = true; }
    return best;
  }

  // Follow the favorite arrows from the start and see where they lead.
  function greedyPath() {
    const path = [{ x: start.x, y: start.y }];
    const seen = new Set([idx(start.x, start.y)]);
    let x = start.x, y = start.y;
    for (let i = 0; i < N * N; i++) {
      const s = idx(x, y);
      const qs = [0, 1, 2, 3].map((a) => Q[s * 4 + a]);
      const best = Math.max(...qs);
      if (qs.every((q) => q === best)) return { path, reached: false };
      const a = qs.indexOf(best);
      let nx = x + DIRS[a][0], ny = y + DIRS[a][1];
      if (!inside(nx, ny) || grid[idx(nx, ny)] === WALL) return { path, reached: false };
      x = nx; y = ny;
      path.push({ x, y });
      const c = grid[idx(x, y)];
      if (c === CHEESE) return { path, reached: true };
      if (c === TRAP) return { path, reached: false };
      if (seen.has(idx(x, y))) return { path, reached: false };
      seen.add(idx(x, y));
    }
    return { path, reached: false };
  }

  function checkCelebrate() {
    if (celebrated) return;
    const g = greedyPath();
    if (!g.reached) return;
    // Require a few recent successes so it's not a lucky fluke.
    const recent = history.slice(-5);
    if (recent.filter((h) => h.outcome === "cheese").length < 3) return;
    celebrated = true;
    ML.confetti();
    ML.xray.offer("The mouse found the way! X-ray its brain");
    ML.say(`I've got it! 🎉 Follow my orange arrows: home to cheese in <b>${g.path.length - 1} steps</b>, no traps. I learned it all by trying!`);
    showOverlay("Mouse figured out the maze!");
  }

  function showOverlay(msg) {
    overlay.textContent = msg;
    overlay.classList.add("show");
    clearTimeout(showOverlay.t);
    showOverlay.t = setTimeout(() => overlay.classList.remove("show"), 2200);
  }

  // ---------- narration ----------
  function narrate(ev, slow) {
    const now = performance.now();
    const canTalk = now - lastSay > (slow ? 0 : 900);
    let msg = null, important = false;
    if (ev.outcome === "cheese") {
      important = ev.best;
      if (ev.best) { msg = `Yum! 🧀 I found the cheese in only <b>${ev.steps} steps</b> — my best yet!`; }
      else msg = `Yum! Cheese in ${ev.steps} steps. The squares I walked on just got a bit greener.`;
    } else if (ev.outcome === "trap") {
      msg = `Ouch, a trap! I'll remember that spot is <b>bad</b> and go a different way next time.`;
    } else if (ev.outcome === "tired") {
      msg = `Phew, ${MAX_STEPS} steps and no cheese. I'm lost! Back home to try again.`;
    } else if (slow && ev.bumped) {
      msg = `Bonk! That's a wall. Walking into walls is a waste of time.`;
    } else if (slow && ev.explored) {
      msg = `Hmm, let me try a <b>random</b> way! Maybe I'll discover something.`;
    } else if (slow && steps === 1 && episode > 0) {
      msg = `Try number ${episode + 1}! I'll follow the arrows I trust most.`;
    }
    if (msg && (canTalk || important)) { ML.say(msg); lastSay = now; }
    if (ev.outcome) {
      flash = { x: ev.to.x, y: ev.to.y, t0: now, good: ev.outcome === "cheese" };
    }
  }

  function turboNarrate() {
    const now = performance.now();
    if (now - lastTurboSay < 1000) return;
    lastTurboSay = now;
    const recent = history.slice(-50);
    const wins = recent.filter((h) => h.outcome === "cheese");
    const avg = wins.length ? Math.round(wins.reduce((s, h) => s + h.steps, 0) / wins.length) : null;
    ML.say(`Turbo practice! ${episode.toLocaleString()} tries so far. ` +
      (avg ? `Lately I find cheese in about <b>${avg} steps</b>, ${Math.round((wins.length / recent.length) * 100)}% of the time.` : `Still searching for that cheese…`));
  }

  // ---------- drawing ----------
  function arrowShape(cx, cy, a, len, color, width) {
    const [dx, dy] = DIRS[a];
    const base = 10;
    const tipX = cx + dx * (base + len), tipY = cy + dy * (base + len);
    const bx = cx + dx * base, by = cy + dy * base;
    const px = -dy, py = dx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(bx + px * width, by + py * width);
    ctx.lineTo(bx - px * width, by - py * width);
    ctx.closePath();
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- vector game pieces (drawn in a 40×40 box centred on x,y) ----------
  const INK = () => ML.cssVar("--ink");
  function piece(c, x, y, s, fn) {
    c.save(); c.translate(x, y); c.scale(s / 40, s / 40);
    c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = INK(); c.lineWidth = 2.5;
    fn(c); c.restore();
  }
  function drawCheese(c, x, y, s) {
    piece(c, x, y, s, (c) => {
      c.fillStyle = "#ffd75e";
      c.beginPath(); c.moveTo(-17, -2); c.lineTo(17, -2); c.lineTo(10, -15); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = "#ffc531";
      c.beginPath(); c.rect(-17, -2, 34, 15); c.fill(); c.stroke();
      c.fillStyle = "#e0a100";
      [[-9, 4, 3.5], [3, 8, 2.5], [10, 2, 3], [-1, 1, 1.8]].forEach(([hx, hy, r]) => { c.beginPath(); c.arc(hx, hy, r, 0, Math.PI * 2); c.fill(); });
    });
  }
  function drawTrap(c, x, y, s) {
    piece(c, x, y, s, (c) => {
      c.fillStyle = "#c98b52";
      c.beginPath(); c.roundRect(-18, 2, 36, 11, 3); c.fill(); c.stroke();
      c.strokeStyle = "#8a8cab"; c.lineWidth = 3.5;
      c.beginPath(); c.moveTo(-12, 4); c.lineTo(-12, -12); c.lineTo(12, -12); c.lineTo(12, 4); c.stroke();
      c.strokeStyle = INK(); c.lineWidth = 2.5;
      c.fillStyle = "#ff4d5e"; c.beginPath(); c.arc(0, 1, 4, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-6, -4); c.lineTo(-2, -8); c.moveTo(6, -4); c.lineTo(2, -8); c.stroke();
    });
  }
  function drawMouse(c, x, y, s, face = 1) {
    piece(c, x, y, s, (c) => {
      c.scale(face, 1);
      c.strokeStyle = "#ff8fb4"; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-13, 6); c.quadraticCurveTo(-26, 8, -22, -6); c.stroke();
      c.strokeStyle = INK();
      c.fillStyle = "#b3b8cc";
      c.beginPath(); c.ellipse(-1, 5, 15, 10, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.arc(7, -9, 6.5, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = "#ff8fb4"; c.beginPath(); c.arc(7, -9, 3.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#b3b8cc";
      c.beginPath(); c.moveTo(4, -3); c.quadraticCurveTo(14, -10, 21, 1); c.quadraticCurveTo(14, 7, 6, 6); c.fill(); c.stroke();
      c.fillStyle = INK(); c.beginPath(); c.arc(12, -1, 1.9, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#ff6f9d"; c.beginPath(); c.arc(21, 1, 2.4, 0, Math.PI * 2); c.fill();
    });
  }
  function drawHome(c, x, y, s) {
    piece(c, x, y, s, (c) => {
      c.fillStyle = ML.cssVar("--rl");
      c.beginPath(); c.moveTo(-14, -2); c.lineTo(0, -15); c.lineTo(14, -2); c.lineTo(10, -2); c.lineTo(10, 13); c.lineTo(-10, 13); c.lineTo(-10, -2); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = ML.cssVar("--card"); c.beginPath(); c.rect(-3, 4, 6, 9); c.fill(); c.stroke();
    });
  }
  function drawWallIcon(c, x, y, s) {
    piece(c, x, y, s, (c) => { c.fillStyle = ML.cssVar("--ink-2"); c.beginPath(); c.roundRect(-16, -16, 32, 32, 6); c.fill(); });
  }

  function draw(now) {
    const col = {
      bg: ML.cssVar("--canvas-bg"), line: ML.cssVar("--line"), ink: ML.cssVar("--ink"), ink2: ML.cssVar("--ink-2"),
      good: ML.cssVar("--good"), bad: ML.cssVar("--bad"), accent: ML.cssVar("--rl"), muted: ML.cssVar("--muted"),
      card: ML.cssVar("--card"),
    };
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, W, H);

    // value heat + arrows
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const s = idx(x, y), c = grid[s];
      const X = x * CELL, Y = y * CELL;
      if (c === WALL) {
        ctx.fillStyle = col.ink2;
        roundRect(X + 3, Y + 3, CELL - 6, CELL - 6, 10); ctx.fill();
        ctx.strokeStyle = col.bg; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X + 6, Y + CELL / 2); ctx.lineTo(X + CELL - 6, Y + CELL / 2);
        ctx.moveTo(X + CELL / 2, Y + 6); ctx.lineTo(X + CELL / 2, Y + CELL / 2);
        ctx.moveTo(X + CELL / 4, Y + CELL / 2); ctx.lineTo(X + CELL / 4, Y + CELL - 6);
        ctx.moveTo(X + (3 * CELL) / 4, Y + CELL / 2); ctx.lineTo(X + (3 * CELL) / 4, Y + CELL - 6);
        ctx.stroke();
        continue;
      }
      if (c === CHEESE || c === TRAP) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = c === CHEESE ? col.good : col.bad;
        roundRect(X + 3, Y + 3, CELL - 6, CELL - 6, 12); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      if (!visited[s]) continue;
      const v = maxQ(s);
      // Small negatives just mean "far from cheese" (step costs), so keep them neutral.
      const t = v >= 0 ? Math.min(1, v / 8) : ML.clamp((v + 1.2) / 6, -1, 0);
      ctx.globalAlpha = Math.abs(t) * 0.55 + 0.04;
      ctx.fillStyle = t >= 0 ? col.good : col.bad;
      roundRect(X + 3, Y + 3, CELL - 6, CELL - 6, 12); ctx.fill();
      ctx.globalAlpha = 1;

      const qs = [0, 1, 2, 3].map((a) => Q[s * 4 + a]);
      const mn = Math.min(...qs), mx = Math.max(...qs);
      const best = qs.indexOf(mx);
      const allSame = mx - mn < 1e-6;
      for (let a = 0; a < 4; a++) {
        const rel = allSame ? 0.2 : (qs[a] - mn) / (mx - mn);
        const isBest = !allSame && a === best;
        arrowShape(X + CELL / 2, Y + CELL / 2, a, 4 + rel * 16, isBest ? col.accent : col.muted, isBest ? 7 : 4);
      }
      if (showNums) {
        ctx.fillStyle = col.ink;
        ctx.font = `700 11px ui-monospace, Menlo, monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(v.toFixed(1), X + CELL / 2, Y + CELL / 2);
      }
    }

    // grid lines
    ctx.strokeStyle = col.line; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < N; i++) { ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL); }
    ctx.stroke();

    // greedy path
    const g = greedyPath();
    if (g.path.length > 1) {
      ctx.save();
      ctx.strokeStyle = col.accent; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.setLineDash([2, 10]);
      ctx.globalAlpha = g.reached ? 0.95 : 0.45;
      ctx.beginPath();
      g.path.forEach((p, i) => { const px = p.x * CELL + CELL / 2, py = p.y * CELL + CELL / 2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
      ctx.restore();
    }

    // footprints
    if (P.speed < 4) {
      const n = trail.length;
      trail.forEach((p, i) => {
        if (i === n - 1) return;
        ctx.globalAlpha = 0.15 + 0.6 * (i / n);
        ctx.fillStyle = col.ink2;
        const off = (i % 2 ? 7 : -7);
        ctx.beginPath(); ctx.arc(p.x * CELL + CELL / 2 + off, p.y * CELL + CELL / 2 + 20, 3.5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // items
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = grid[idx(x, y)];
      if (c === CHEESE) drawCheese(ctx, x * CELL + CELL / 2, y * CELL + CELL / 2, 46);
      if (c === TRAP) drawTrap(ctx, x * CELL + CELL / 2, y * CELL + CELL / 2, 46);
    }
    drawHome(ctx, start.x * CELL + 15, start.y * CELL + 15, 20);

    // outcome flash
    if (flash) {
      const t = (now - flash.t0) / 600;
      if (t > 1) flash = null;
      else {
        ctx.strokeStyle = flash.good ? col.good : col.bad;
        ctx.lineWidth = 5; ctx.globalAlpha = 1 - t;
        ctx.beginPath(); ctx.arc(flash.x * CELL + CELL / 2, flash.y * CELL + CELL / 2, 20 + t * 40, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // mouse
    let mx = agent.x, my = agent.y;
    if (anim) {
      const t = ML.clamp((now - anim.t0) / anim.dur, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      mx = ML.lerp(anim.fx, anim.tx, e); my = ML.lerp(anim.fy, anim.ty, e);
      if (t >= 1) anim = null;
    }
    const bob = running && P.speed < 4 ? Math.sin(now / 90) * 2 : 0;
    drawMouse(ctx, mx * CELL + CELL / 2, my * CELL + CELL / 2 + bob, 48, facing);
  }

  function drawChart() {
    const bg = ML.cssVar("--bg-2");
    chart.clearRect(0, 0, CW, CH);
    chart.fillStyle = bg; chart.fillRect(0, 0, CW, CH);
    const data = history.slice(-120);
    if (!data.length) {
      chart.fillStyle = ML.cssVar("--muted");
      chart.font = "700 13px Nunito, sans-serif"; chart.textAlign = "center"; chart.textBaseline = "middle";
      chart.fillText("Press Play to start practising", CW / 2, CH / 2);
      return;
    }
    const maxS = Math.max(20, ...data.map((d) => d.steps));
    const bw = CW / 120;
    const colors = { cheese: ML.cssVar("--good"), trap: ML.cssVar("--bad"), tired: ML.cssVar("--muted") };
    data.forEach((d, i) => {
      const h = (d.steps / maxS) * (CH - 12);
      chart.fillStyle = colors[d.outcome];
      chart.fillRect(i * bw + 0.5, CH - h, Math.max(1, bw - 1), h);
    });
    // moving average of steps
    chart.strokeStyle = ML.cssVar("--ink"); chart.lineWidth = 2;
    chart.beginPath();
    data.forEach((d, i) => {
      const win = data.slice(Math.max(0, i - 9), i + 1);
      const avg = win.reduce((s, x) => s + x.steps, 0) / win.length;
      const y = CH - (avg / maxS) * (CH - 12);
      i ? chart.lineTo(i * bw + bw / 2, y) : chart.moveTo(i * bw + bw / 2, y);
    });
    chart.stroke();
  }

  const el = (id) => document.getElementById(id);
  function updateStats() {
    el("s-ep").textContent = episode.toLocaleString();
    el("s-steps").textContent = steps;
    el("s-cheese").textContent = cheeseCount.toLocaleString();
    el("s-trap").textContent = trapCount.toLocaleString();
    drawChart();
  }

  // ---------- main loop ----------
  let acc = 0, lastT = performance.now();
  function doStep(slow) {
    const prev = { x: agent.x, y: agent.y };
    const ev = stepAgent();
    if (slow) {
      const sp = SPEEDS[P.speed].sps || 60;
      anim = { fx: prev.x, fy: prev.y, tx: ev.to.x, ty: ev.to.y, t0: performance.now(), dur: Math.min(400, 900 / sp) };
    }
    narrate(ev, P.speed <= 1);
    if (ev.outcome) {
      checkCelebrate();
      if (slow) {
        // Pause briefly on the cheese/trap so kids can see what happened, then go home.
        holdUntil = performance.now() + (P.speed <= 1 ? 900 : 250);
        pendingReset = true;
      } else newEpisode();
    }
  }
  let holdUntil = 0, pendingReset = false;

  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (pendingReset && now >= holdUntil) { pendingReset = false; newEpisode(); }
    if (running && !pendingReset) {
      if (P.speed === 4) {
        for (let i = 0; i < TURBO_STEPS_PER_FRAME; i++) {
          const ev = stepAgent();
          if (ev.outcome) newEpisode();
        }
        checkCelebrate();
        turboNarrate();
      } else {
        acc += dt * SPEEDS[P.speed].sps;
        let guard = 0;
        while (acc >= 1 && !pendingReset && guard++ < 50) { acc -= 1; doStep(P.speed <= 2); }
        if (guard >= 50) acc = 0;
      }
    }
    if (view) {
      // Show the snapshot brain: swap it in just for drawing.
      const q = Q, v = visited;
      Q = view.Q; visited = view.visited;
      draw(now);
      Q = q; visited = v;
    } else draw(now);
    if (ckDirty) renderCkpts();
    if (frame.n % 6 === 0) updateInside();
    if (running || frame.n++ % 15 === 0) updateStats();
    requestAnimationFrame(frame);
  }
  frame.n = 0;

  // ---------- checkpoints + inside ----------
  const ckHost = document.getElementById("ckpts");
  function renderCkpts() {
    ckDirty = false;
    if (!ckpts.length) return;
    ckHost.innerHTML = "";
    ckpts.forEach((ck) => {
      const b = document.createElement("button");
      b.className = "ckpt" + (view === ck ? " on" : "");
      const c = document.createElement("canvas");
      b.appendChild(c);
      const t = ML.setupCanvas(c, 108, 108).ctx, cs = 108 / N;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = idx(x, y), g = grid[s];
        let col = null, a = 1;
        if (g === WALL) col = ML.cssVar("--ink-2");
        else if (g === CHEESE) col = ML.cssVar("--good");
        else if (g === TRAP) col = ML.cssVar("--bad");
        else if (ck.visited[s]) {
          const v = Math.max(ck.Q[s * 4], ck.Q[s * 4 + 1], ck.Q[s * 4 + 2], ck.Q[s * 4 + 3]);
          const tt = v >= 0 ? Math.min(1, v / 8) : ML.clamp((v + 1.2) / 6, -1, 0);
          col = tt >= 0 ? ML.cssVar("--good") : ML.cssVar("--bad"); a = Math.abs(tt) * 0.7 + 0.08;
        }
        if (col) { t.globalAlpha = a; t.fillStyle = col; t.fillRect(x * cs + 0.5, y * cs + 0.5, cs - 1, cs - 1); }
      }
      b.insertAdjacentHTML("beforeend", `<b>After try ${ck.n}</b>${view === ck ? "viewing — tap to go live" : "tap to look"}`);
      b.addEventListener("click", () => {
        view = view === ck ? null : ck;
        if (view) { setRunning(false); ML.say(`This is my brain after <b>${ck.n} ${ck.n === 1 ? "try" : "tries"}</b>. ${ck.n < 20 ? "Hardly any green yet — I barely knew anything!" : "See the green spreading back from the cheese?"}`); }
        else ML.say("Back to my brain right now!");
        ckDirty = true;
      });
      ckHost.appendChild(b);
    });
  }
  const ARROWS = ["Up", "Right", "Down", "Left"];
  function updateInside() {
    const host = document.getElementById("inside");
    const QQ = view ? view.Q : Q;
    const s = idx(agent.x, agent.y);
    const qs = [0, 1, 2, 3].map((a) => QQ[s * 4 + a]);
    const mx = Math.max(...qs), fresh = qs.every((q) => q === 0);
    const rows = qs.map((q, a) => `<div style="display:flex;justify-content:space-between;${q === mx && !fresh ? "color:var(--accent)" : ""}"><span>${ML.icon(["arrow-up", "arrow-right", "arrow-down", "arrow-left"][a])} ${ARROWS[a]}</span><span style="font-family:var(--font-mono)">${q.toFixed(1)}</span></div>`).join("");
    host.innerHTML = `<div>I'm on square (${agent.x + 1}, ${agent.y + 1}). My scores here:</div>${rows}<div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${fresh ? "All zero — I've never learned anything here, so I'll pick randomly." : `Best is <b>${ARROWS[qs.indexOf(mx)]}</b> (${mx.toFixed(1)}), so that's my move — unless curiosity makes me try a random one (${Math.round(P.eps * 100)}% of the time).`}</div>`;
  }

  // ---------- controls ----------
  const playBtn = el("play");
  function setRunning(v) {
    running = v;
    if (v && view) { view = null; ckDirty = true; }
    playBtn.innerHTML = running ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
    if (running && episode === 0 && steps === 0) ML.say("Here I go! I have no idea where the cheese is, so I'll just wander and see…");
  }
  playBtn.addEventListener("click", () => setRunning(!running));
  el("step").addEventListener("click", () => {
    setRunning(false);
    if (pendingReset) { pendingReset = false; newEpisode(); }
    doStep(true);
    if (pendingReset) holdUntil = performance.now() + 400;
    updateStats();
  });
  el("reset").addEventListener("click", () => resetBrain(true));

  ML.bindRange("#speed", (v) => SPEEDS[v].name, (v) => {
    P.speed = v; acc = 0;
    if (v === 4 && running) ML.say("Turbo! I'll practise thousands of times. Watch the green spread out from the cheese!");
  });
  ML.bindRange("#eps", (v) => Math.round(v * 100) + "%", (v) => (P.eps = v));
  ML.bindRange("#gamma", (v) => v.toFixed(2), (v) => (P.gamma = v));
  ML.bindRange("#alpha", (v) => v.toFixed(2), (v) => (P.alpha = v));

  document.querySelectorAll("#tools button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#tools button").forEach((x) => x.classList.toggle("on", x === b));
    tool = b.dataset.tool;
  }));
  document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    loadPreset(b.dataset.preset);
    const lines = {
      tricky: "A twisty maze! Traps hide near the shortcuts. Can I find the safe way?",
      cliff: "The cliff! The shortest way is right along the traps. Risky… let's see what I learn.",
      open: "A big open field with a few traps. Should be quick to learn!",
      empty: "Empty! Draw walls, traps and cheese to make your own maze.",
    };
    ML.say(lines[b.dataset.preset]);
  }));
  el("nums").addEventListener("click", (e) => {
    showNums = !showNums;
    e.currentTarget.classList.toggle("on", showNums);
    e.currentTarget.innerHTML = `${ML.icon("info")} ${showNums ? "Hide" : "Show"} brain numbers`;
  });

  // painting
  let painting = false, lastCell = -1;
  function paint(e) {
    const p = ML.canvasPoint(cv, e, W, H);
    const x = Math.floor(p.x / CELL), y = Math.floor(p.y / CELL);
    if (!inside(x, y)) return;
    const s = idx(x, y);
    if (s === lastCell) return;
    lastCell = s;
    const isStart = x === start.x && y === start.y;
    if (tool === "start") {
      grid[s] = EMPTY;
      start = { x, y };
    } else {
      if (isStart && tool !== "erase") return;
      grid[s] = { wall: WALL, trap: TRAP, cheese: CHEESE, erase: EMPTY }[tool];
    }
    celebrated = false;
    pendingReset = false;
    newEpisode();
  }
  cv.addEventListener("pointerdown", (e) => {
    painting = true; lastCell = -1;
    cv.setPointerCapture(e.pointerId);
    paint(e);
  });
  cv.addEventListener("pointermove", (e) => { if (painting) paint(e); });
  const stopPaint = () => {
    if (!painting) return;
    painting = false;
    if (!grid.includes(CHEESE)) ML.say("Uh-oh, no cheese! Add some so I have something to find.");
    else ML.say("Ooh, the maze changed! My old memories might be wrong now. I'll have to re-learn a bit.");
  };
  cv.addEventListener("pointerup", stopPaint);
  cv.addEventListener("pointercancel", stopPaint);

  // Little drawings on the tool buttons, same as on the board.
  document.querySelectorAll(".tool-ic[data-draw]").forEach((span) => {
    const c = document.createElement("canvas");
    span.appendChild(c);
    const t = ML.setupCanvas(c, 18, 18).ctx;
    ({ wall: drawWallIcon, trap: drawTrap, cheese: drawCheese, start: drawHome })[span.dataset.draw](t, 9, 9, 20);
  });

  // ---------- Model X-ray ----------
  // Inputs are the mouse's square. "Height" counts from the bottom row so the decision map looks like the maze.
  const cellOf = (x) => ({ cx: ML.clamp(Math.round(x[0]), 0, N - 1), cy: N - 1 - ML.clamp(Math.round(x[1]), 0, N - 1) });
  const mazeSeen = [];
  setInterval(() => { if (running) { mazeSeen.push([agent.x, N - 1 - agent.y]); if (mazeSeen.length > 400) mazeSeen.shift(); } }, 80);
  ML.xray.register({
    title: "The mouse's map of good moves",
    kind: "Q-table",
    summary: () => `learned from ${episode} tries`,
    size: () => `${N * N} squares × 4 moves`,
    stats: () => [["Tries", episode], ["Cheese found", cheeseCount], ["Fastest", bestSteps === Infinity ? "–" : `${bestSteps} steps`]],
    inputs: [
      { name: "Column", min: -0.49, max: N - 0.51, step: 1, describe: (v) => `${Math.round(v) + 1} from left` },
      { name: "Height", min: -0.49, max: N - 0.51, step: 1, describe: (v) => `${Math.round(v) + 1} from bottom` },
    ],
    outputs: [{ name: "Up", color: ML.cssVar("--vision") }, { name: "Right", color: ML.cssVar("--rl") }, { name: "Down", color: ML.cssVar("--sup") }, { name: "Left", color: ML.cssVar("--nn") }],
    predict: (x) => {
      const { cx, cy } = cellOf(x), s = idx(cx, cy);
      if (grid[s] === WALL) return null;
      return [0, 1, 2, 3].map((a) => Q[s * 4 + a]);
    },
    samples: () => mazeSeen,
    current: () => [agent.x, N - 1 - agent.y],
    brainHeight: 420,
    drawBrain: (c0) => {
      const c = c0.getContext("2d"), S = Math.min((c0.height - 20) / N, (c0.width - 20) / N), ox = (c0.width - S * N) / 2, oy = 10;
      let lo = Infinity, hi = -Infinity;
      for (let s2 = 0; s2 < N * N; s2++) if (grid[s2] !== WALL && visited[s2]) { const m = maxQ(s2); lo = Math.min(lo, m); hi = Math.max(hi, m); }
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const s2 = idx(x, y), px = ox + x * S, py = oy + y * S;
          if (grid[s2] === WALL) { c.fillStyle = ML.cssVar("--ink"); c.fillRect(px + 1, py + 1, S - 2, S - 2); continue; }
          if (!visited[s2]) { c.fillStyle = ML.cssVar("--line"); c.fillRect(px + 1, py + 1, S - 2, S - 2); continue; }
          const t = (maxQ(s2) - lo) / (hi - lo || 1);
          c.fillStyle = `hsl(${Math.round(t * 120)} 70% 62%)`;
          c.fillRect(px + 1, py + 1, S - 2, S - 2);
          if (grid[s2] === CHEESE || grid[s2] === TRAP) {
            c.fillStyle = grid[s2] === CHEESE ? "#ffc531" : "#ff4d5e";
            c.beginPath(); c.arc(px + S / 2, py + S / 2, S * 0.25, 0, 7); c.fill();
            continue;
          }
          const qs = [0, 1, 2, 3].map((a) => Q[s2 * 4 + a]), b = qs.indexOf(Math.max(...qs)), [dx, dy] = DIRS[b];
          c.strokeStyle = "#1f2140"; c.lineWidth = 3; c.lineCap = "round";
          const cx = px + S / 2, cy = py + S / 2;
          c.beginPath(); c.moveTo(cx - dx * S * 0.25, cy - dy * S * 0.25); c.lineTo(cx + dx * S * 0.28, cy + dy * S * 0.28); c.stroke();
          c.beginPath(); c.arc(cx + dx * S * 0.28, cy + dy * S * 0.28, 3.5, 0, 7); c.fillStyle = "#1f2140"; c.fill();
        }
    },
    brainCaption: "Each square's colour is how good the mouse thinks it is there (green = close to cheese, red = bad), and the arrow is the move it likes best. Grey = never visited, dark = wall.",
    notes: ["The decision map above is the maze itself: every square coloured by the move the mouse would pick there."],
  });
  ML.xray.button(document.getElementById("play").parentElement);

  loadPreset("tricky");
  requestAnimationFrame(frame);
})();
