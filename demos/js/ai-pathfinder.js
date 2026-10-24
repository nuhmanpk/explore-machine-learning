// Pathfinder — draw a map, watch blind search and a guessing search (A*) explore it.
(function () {
  const P = window.Pathfinder;
  const { W, H, FLOOR, WALL, MUD } = P;
  const CELL = 17, CW = W * CELL, CH = H * CELL;
  const cvA = ML.setupCanvas(document.getElementById("cv-a"), CW, CH);
  const cvB = ML.setupCanvas(document.getElementById("cv-b"), CW, CH);
  const hist = ML.setupCanvas(document.getElementById("hist"), 700, 180);

  const state = {
    grid: P.preset("field"),
    weight: 1,
    sA: null, sB: null,
    playing: false,
    speed: 1,
    tool: WALL,
    drag: null, // "start" | "goal" | "paint"
    runs: [], // { label, a, b } finished runs for the history chart
    label: "First run",
    recorded: false,
    maxG: 1,
  };

  function restart(label) {
    state.sA = new P.Search(state.grid, 0);
    state.sB = new P.Search(state.grid, state.weight);
    state.recorded = false;
    state.maxG = 1;
    if (label) state.label = label;
  }
  restart();

  // ---------- running ----------
  function stepBoth(n = 1) {
    for (let i = 0; i < n; i++) {
      if (!state.sA.done) state.sA.step();
      if (!state.sB.done) state.sB.step();
    }
    checkFinished();
  }
  function runToEnd() { state.sA.runAll(); state.sB.runAll(); checkFinished(); }
  function checkFinished() {
    if (state.sA.done && state.sB.done && !state.recorded) {
      state.recorded = true;
      state.runs.push({ label: state.label, a: state.sA.explored, b: state.sB.explored, ca: state.sA.cost, cb: state.sB.cost });
      if (state.runs.length > 8) state.runs.shift();
      drawHistory();
      finishMessage();
    }
  }

  function finishMessage() {
    const a = state.sA, b = state.sB;
    if (!a.found) return ML.say(`There is <b>no way through</b>! Both searchers looked at every square they could reach and gave up. Erase a wall to open a path.`);
    const fewer = Math.round((1 - b.explored / a.explored) * 100);
    const cheaper = b.cost > a.cost;
    ML.say(cheaper
      ? `Whoa: the hasty guesser looked at only <b>${b.explored}</b> squares (blind: ${a.explored}), but its path costs <b>${b.cost}</b> instead of <b>${a.cost}</b>. It rushed straight into the slow stuff! Lower the guess trust to fix that.`
      : state.weight === 0
        ? `With no guess, the second searcher is just blind search too: <b>${b.explored}</b> squares each. Turn the guess up to see the difference!`
        : `Both found the cheapest path, cost <b>${a.cost}</b>. Blind search looked at <b>${a.explored}</b> squares; the guesser only <b>${b.explored}</b>, about <b>${Math.max(0, fewer)}% fewer</b>.`);
  }

  // ---------- drawing ----------
  function costColor(g, maxG) {
    const t = Math.min(1, g / Math.max(1, maxG));
    const h = ML.lerp(190, 42, t), l = ML.lerp(62, 62, t);
    return `hsl(${h} 70% ${l}%)`;
  }
  function drawMap(cv, s) {
    const c = cv.ctx, dark = ML.isDark(), g = state.grid;
    c.clearRect(0, 0, CW, CH);
    let maxG = state.maxG;
    for (let i = 0; i < W * H; i++) if (s.state[i] === 2 && s.g[i] > maxG) maxG = s.g[i];
    state.maxG = maxG;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, t = g.cells[i], px = x * CELL, py = y * CELL;
        c.fillStyle = dark ? "#26284a" : "#faf3e6";
        c.fillRect(px, py, CELL, CELL);
        if (t === MUD) {
          c.fillStyle = "#8a5a34"; c.fillRect(px, py, CELL, CELL);
          c.fillStyle = "rgba(255,255,255,.22)"; c.fillRect(px + 3, py + 4, 3, 3); c.fillRect(px + 10, py + 9, 3, 3);
        }
        if (s.state[i] === 2) { c.globalAlpha = t === MUD ? 0.7 : 0.9; c.fillStyle = costColor(s.g[i], maxG); c.fillRect(px, py, CELL, CELL); c.globalAlpha = 1; }
        else if (s.state[i] === 1 && t !== WALL) { c.fillStyle = "#fff4d6"; c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2); c.strokeStyle = "#e0a400"; c.lineWidth = 1.5; c.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3); }
        if (t === WALL) {
          c.fillStyle = dark ? "#5a5e8c" : "#3a3d63"; c.beginPath(); c.roundRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1, 3); c.fill();
          c.fillStyle = "rgba(255,255,255,.12)"; c.fillRect(px + 3, py + 3, CELL - 6, 3);
        }
      }
    c.strokeStyle = dark ? "rgba(255,255,255,.06)" : "rgba(31,33,64,.07)"; c.lineWidth = 1;
    for (let x = 0; x <= W; x++) { c.beginPath(); c.moveTo(x * CELL, 0); c.lineTo(x * CELL, CH); c.stroke(); }
    for (let y = 0; y <= H; y++) { c.beginPath(); c.moveTo(0, y * CELL); c.lineTo(CW, y * CELL); c.stroke(); }
    // the path
    if (s.found && s.path.length) {
      c.lineJoin = "round"; c.lineCap = "round";
      for (const [lw, col] of [[7, "#fff"], [4, ML.cssVar("--ink")]]) {
        c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
        s.path.forEach(([x, y], k) => (k ? c.lineTo((x + 0.5) * CELL, (y + 0.5) * CELL) : c.moveTo((x + 0.5) * CELL, (y + 0.5) * CELL)));
        c.stroke();
      }
    }
    // the square just expanded
    if (s.current && !s.done) {
      c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 3; c.beginPath(); c.arc((s.current.x + 0.5) * CELL, (s.current.y + 0.5) * CELL, CELL * 0.62, 0, 7); c.stroke();
    }
    // start (green) and goal (red target)
    const [sx, sy] = g.start, [gx, gy] = g.goal;
    c.fillStyle = "#2fbf62"; c.strokeStyle = "#1f2140"; c.lineWidth = 2.5;
    c.beginPath(); c.arc((sx + 0.5) * CELL, (sy + 0.5) * CELL, CELL * 0.45, 0, 7); c.fill(); c.stroke();
    c.fillStyle = "#fff"; c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("S", (sx + 0.5) * CELL, (sy + 0.5) * CELL + 4);
    const cx = (gx + 0.5) * CELL, cy = (gy + 0.5) * CELL;
    c.fillStyle = "#ff4d5e"; c.beginPath(); c.arc(cx, cy, CELL * 0.48, 0, 7); c.fill(); c.stroke();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, cy, CELL * 0.28, 0, 7); c.fill();
    c.fillStyle = "#ff4d5e"; c.beginPath(); c.arc(cx, cy, CELL * 0.12, 0, 7); c.fill();
  }

  function drawHistory() {
    const c = hist.ctx, w = hist.w, h = hist.h;
    c.clearRect(0, 0, w, h);
    const runs = state.runs;
    if (!runs.length) {
      c.fillStyle = ML.cssVar("--muted"); c.font = "700 14px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText("Each finished search adds a pair of bars here", w / 2, h / 2);
      return;
    }
    const L = 10, B = 34, T = 14, n = Math.max(4, runs.length), slot = (w - L * 2) / n;
    const mx = Math.max(10, ...runs.map((r) => Math.max(r.a, r.b)));
    runs.forEach((r, i) => {
      const x = L + i * slot + slot * 0.12, bw = slot * 0.36;
      [[r.a, "--sup", 0], [r.b, "--accent", 1]].forEach(([v, col, k]) => {
        const bh = (v / mx) * (h - B - T);
        c.fillStyle = ML.cssVar(col);
        c.beginPath(); c.roundRect(x + k * (bw + 3), h - B - bh, bw, Math.max(2, bh), 4); c.fill();
        c.fillStyle = ML.cssVar("--ink-2"); c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center";
        c.fillText(v, x + k * (bw + 3) + bw / 2, h - B - bh - 4);
      });
      c.fillStyle = ML.cssVar("--muted"); c.font = "700 10px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText(r.label.length > 14 ? r.label.slice(0, 13) + "…" : r.label, x + bw + 1.5, h - 18);
      c.fillText(r.cb > r.ca ? "costlier path" : "cost " + r.cb, x + bw + 1.5, h - 5);
    });
  }

  // ---------- inside card + stats (fixed-size text areas) ----------
  function nextText(s, who) {
    if (s.done) return s.found
      ? `<b>Reached the goal!</b> It follows the trail back to the start. Path cost <b>${s.cost}</b>, after looking at <b>${s.explored}</b> squares.`
      : `The to-do list ran out: <b>no way through</b>. It looked at ${s.explored} squares.`;
    const n = s.peek();
    if (!n) return "Thinking…";
    if (who === "a" || s.weight === 0)
      return `Next square <b>(${n.x}, ${n.y})</b>: cost so far <b>${n.g}</b>. That's the smallest on the to-do list, so <b>look here next</b>. It has no idea where the goal is.`;
    const wh = s.weight === 1 ? `${n.h}` : `${n.h} × ${s.weight}`;
    return `Next square <b>(${n.x}, ${n.y})</b>: cost so far <b>${n.g}</b> + guess to goal <b>${wh}</b> = <b>${+n.f.toFixed(2)}</b>. That's the smallest on the to-do list, so <b>look here next</b>.`;
  }
  function setHTML(id, html) { const el = document.getElementById(id); if (el.innerHTML !== html) { el.innerHTML = html; el.classList.remove("muted"); } }
  function updatePanel() {
    const a = state.sA, b = state.sB;
    setHTML("in-a", nextText(a, "a"));
    setHTML("in-b", nextText(b, "b"));
    document.getElementById("st-ae").textContent = a.explored;
    document.getElementById("st-be").textContent = b.explored;
    document.getElementById("st-ac").textContent = a.done ? (a.found ? a.cost : "none") : "…";
    document.getElementById("st-bc").textContent = b.done ? (b.found ? b.cost : "none") : "…";
    const v = document.getElementById("verdict");
    let t = "", cls = "verdict";
    if (a.done && b.done && a.found) {
      if (b.cost > a.cost) { t = `Not the cheapest path: ${b.cost} vs ${a.cost}. A hasty guess was fooled.`; cls += " warn"; }
      else { t = `Both found the cheapest path. The guesser explored ${Math.max(0, Math.round((1 - b.explored / a.explored) * 100))}% fewer squares.`; cls += " good"; }
    }
    if (v.textContent !== t) v.textContent = t;
    v.className = cls;
  }
  function weightName(w) {
    if (w === 0) return ["Same as blind", "no guess at all"];
    if (w < 1) return ["Cautious guesser", "a small hunch"];
    if (w === 1) return ["A* (the classic)", "aims at the goal, still optimal"];
    if (w < 4) return [`Hasty guesser (×${w})`, "faster, may pick a worse route"];
    return [`Greedy (×${w})`, "rushes at the goal, ignores cost"];
  }
  function syncNames() {
    const [n, sub] = weightName(state.weight);
    document.getElementById("b-name").textContent = n;
    document.getElementById("b-sub").textContent = sub;
  }
  syncNames();

  // ---------- map editing ----------
  function cellAt(cv, e) {
    const p = ML.canvasPoint(cv.ctx.canvas, e, CW, CH);
    return [Math.floor(p.x / CELL), Math.floor(p.y / CELL)];
  }
  function attach(cv) {
    const el = cv.ctx.canvas;
    el.addEventListener("pointerdown", (e) => {
      const [x, y] = cellAt(cv, e);
      const g = state.grid;
      el.setPointerCapture(e.pointerId);
      if (x === g.start[0] && y === g.start[1]) state.drag = "start";
      else if (x === g.goal[0] && y === g.goal[1]) state.drag = "goal";
      else { state.drag = "paint"; paint(x, y); }
    });
    el.addEventListener("pointermove", (e) => {
      const [x, y] = cellAt(cv, e), g = state.grid;
      if (!state.drag) { el.style.cursor = (x === g.start[0] && y === g.start[1]) || (x === g.goal[0] && y === g.goal[1]) ? "grab" : "crosshair"; return; }
      if (state.drag === "paint") return paint(x, y);
      if (x < 0 || y < 0 || x >= W || y >= H || g.cells[y * W + x] === WALL) return;
      const other = state.drag === "start" ? g.goal : g.start;
      if (x === other[0] && y === other[1]) return;
      if (state.drag === "start") g.start = [x, y]; else g.goal = [x, y];
      changed();
    });
    const up = () => { state.drag = null; };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
  function paint(x, y) {
    const g = state.grid;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (g.cells[y * W + x] === state.tool) return;
    g.set(x, y, state.tool);
    changed();
  }
  function changed() { restart("Edited map"); state.playing = state.playing; }
  attach(cvA); attach(cvB);

  document.querySelectorAll("#tools button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#tools button").forEach((x) => x.classList.toggle("on", x === b));
    state.tool = +b.dataset.t;
  }));
  const PRESET_NAME = { maze: "Maze", field: "Open field", trap: "The trap", city: "City blocks", lake: "Mud lake", empty: "Empty map" };
  const PRESET_SAY = {
    maze: `A <b>maze</b>: there is only one real route, so the guess helps less here. Watch both searchers still find the cheapest way.`,
    field: `An <b>open field</b> with a wall and a gap. The guesser should head straight for the gap.`,
    trap: `<b>The trap</b>: a cup facing the goal. A hasty guesser walks into the cup and has to back out.`,
    city: `<b>City blocks</b>: lots of straight streets. Many routes are equally short.`,
    lake: `<b>Mud lake</b>: the short way is slow mud, the long way round is quick. Turn the guess trust up to 3 or more to fool the searcher!`,
    empty: `An empty map. Draw some walls and mud!`,
  };
  document.querySelectorAll("#presets button").forEach((b) => b.addEventListener("click", () => {
    state.grid = P.preset(b.dataset.p, Math.floor(Math.random() * 1000) + 1);
    restart(PRESET_NAME[b.dataset.p]);
    ML.say(PRESET_SAY[b.dataset.p]);
  }));

  // ---------- challenges: change the map, search again instantly ----------
  function flash(t) {
    const o = document.getElementById("overlay");
    o.textContent = t; o.classList.add("show");
    clearTimeout(flash.t); flash.t = setTimeout(() => o.classList.remove("show"), 1700);
  }
  function challenge(c) {
    // we need a current best path first
    if (!state.sB.done || !state.sB.found) { state.sA.runAll(); state.sB.runAll(); }
    const before = { a: state.sA.explored, b: state.sB.explored };
    const g = state.grid, r = P.seeded(Date.now() % 100000);
    let label = "", msg = "";
    if (c === "wall") {
      const mid = P.pathMiddle(state.sB);
      if (!mid) return ML.say(`There's no path to block yet. Make sure the start can reach the goal first.`);
      mid.forEach(([x, y]) => g.set(x, y, WALL));
      // block a little wider so it really is in the way
      const [x, y] = mid[1];
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => { if (r() < 0.5) g.set(x + dx, y + dy, WALL); });
      label = "Wall on path";
      msg = `A <b>wall dropped</b> right on the path! Both searchers must plan again from scratch.`;
    } else if (c === "mud") {
      const p = state.sB.found ? state.sB.path : [];
      const spots = p.length > 8 ? [0.3, 0.5, 0.7].map((f) => p[Math.floor(p.length * f)]) : [[8, 8], [12, 5], [16, 11]];
      spots.forEach(([cx, cy]) => { for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) if (g.cells[(cy + dy) * W + cx + dx] === FLOOR || g.cells[(cy + dy) * W + cx + dx] === undefined) g.set(cx + dx, cy + dy, MUD); });
      label = "Added mud";
      msg = `<b>Mud</b> appeared along the route! It costs 4 steps a square. Is it better to go around?`;
    } else {
      for (let t = 0; t < 200; t++) {
        const x = 2 + Math.floor(r() * (W - 4)), y = 1 + Math.floor(r() * (H - 2));
        const d = Math.abs(x - g.start[0]) + Math.abs(y - g.start[1]);
        if (g.cells[y * W + x] === FLOOR && d >= 10) { g.goal = [x, y]; break; }
      }
      label = "Moved goal";
      msg = `The <b>goal moved</b>! The old search is useless, so both start again.`;
    }
    restart(label);
    runToEnd(); // instant re-plan
    flash(label);
    const a = state.sA, b = state.sB;
    ML.say(`${msg}<br>Re-search cost: blind <b>${a.explored}</b> squares, guesser <b>${b.explored}</b>${a.found ? "" : " (and there's now no way through!)"}.`);
    drawHistory();
  }
  document.querySelectorAll("#chal button").forEach((b) => b.addEventListener("click", () => challenge(b.dataset.c)));

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    if (state.sA.done && state.sB.done) restart();
    state.playing = !state.playing; syncPlay();
    if (state.playing && state.sA.explored === 0) ML.say(`Off they go! The ringed square is the one being looked at. <b>Yellow-bordered</b> squares are the to-do list. See how the guesser leans toward the goal?`);
  });
  document.getElementById("step").addEventListener("click", () => { state.playing = false; syncPlay(); if (state.sA.done && state.sB.done) restart(); stepBoth(1); });
  document.getElementById("reset").addEventListener("click", () => { restart(); state.playing = false; syncPlay(); ML.say(`Same map, searching again from the start. Press <b>Play</b>.`); });
  document.querySelectorAll("#speed button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
      state.speed = +b.dataset.v;
    })
  );
  ML.bindRange("#w", (v) => (v === 0 ? "none" : v === 1 ? "1 (A*)" : "×" + v), (v) => {
    if (v === state.weight && state.sB) return;
    state.weight = v; syncNames();
    restart(v === 0 ? "No guess" : `Guess ×${v}`);
    if (v >= 3) ML.say(`A <b>hasty</b> guess (×${v}): the searcher trusts "the goal is that way" so much it ignores how costly squares are. Try it on the <b>Mud lake</b>.`);
  });

  // ---------- main loop ----------
  let tick = 0;
  function frame() {
    if (state.playing) {
      if (state.speed === 0) { runToEnd(); }
      else { const n = ML.ticks(state.speed, "pf"); if (n) stepBoth(n); }
      if (state.sA.done && state.sB.done) { state.playing = false; syncPlay(); }
    }
    drawMap(cvA, state.sA);
    drawMap(cvB, state.sB);
    if (tick++ % 3 === 0) updatePanel();
    requestAnimationFrame(frame);
  }
  drawHistory();
  syncPlay();
  requestAnimationFrame(frame);
})();
