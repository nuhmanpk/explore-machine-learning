// Robot Vacuum — rules vs learning. Two robots, identical rooms, same dirt each round.
(function () {
  const V = window.VacuumAI;
  const { W, H, DIRS, START, STAIRS, HOT, EP_STEPS, ACTIONS, RULES } = V;
  const CELL = 30, CW = W * CELL, CH = H * CELL;
  const cvR = ML.setupCanvas(document.getElementById("cv-r"), CW, CH);
  const cvQ = ML.setupCanvas(document.getElementById("cv-q"), CW, CH);
  const chart = ML.setupCanvas(document.getElementById("chart"), 700, 200);

  const state = {
    playing: false,
    speed: 3,
    ep: 0,
    cfg: { layout: V.makeLayout(1), stairs: false, pet: false, hot: false },
    layoutSeed: 1,
    rules: new V.RuleBot(undefined, V.NAIVE),
    learner: new V.QBot(),
    wR: null, wQ: null,
    rScores: [], qScores: [], rOops: [], qOops: [],
    markers: [],
    lastR: null, lastQ: null,
    stepAt: 0,
    watch: null,
    replay: null,
    said: {},
    frame: 0,
  };
  const CKPT_AT = new Set([1, 3, 6, 12, 25, 50, 100, 200, 400, 800]);
  const ORDER_DEFAULT = RULES.map((r) => r.id);

  function makeWorlds() {
    const seed = state.ep * 101 + 17;
    state.wR = new V.World(state.cfg, seed);
    state.wQ = new V.World(state.cfg, seed);
    state.rules.escape = 0; state.rules.samePos = 0;
  }
  makeWorlds();

  // ---------- one move for both robots ----------
  function stepBoth() {
    const live = !state.replay;
    if (live && !state.wR.done) {
      const s = state.wR.sense();
      const a = state.rules.act(s);
      state.lastR = { s, a, last: state.rules.last };
      state.wR.step(a);
    }
    const w = state.wQ;
    if (!w.done) {
      const s = w.sense(), k = V.stateKey(s);
      const bot = state.replay ? state.replay.bot : state.learner;
      const a = bot.act(k);
      state.lastQ = { s, k, a, values: bot.values(k), exploring: bot.learning && false };
      const r = w.step(a);
      if (!state.replay) state.learner.learn(k, a, r, V.stateKey(w.sense()));
    }
    state.stepAt = performance.now();
    state.stepped = true;
    if (state.replay) {
      if (state.wQ.done) { state.replayEp++; state.wQ = new V.World(state.cfg, 7000 + state.replayEp * 13); }
    } else if (state.wR.done && state.wQ.done) endEpisode();
  }

  // ---------- end of a round ----------
  const avg = (a, n = 3) => { const s = a.slice(-n); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0; };
  function endEpisode() {
    const wR = state.wR, wQ = state.wQ;
    state.rScores.push(wR.cleaned); state.qScores.push(wQ.cleaned);
    state.rOops.push(wR.falls + wR.petHits); state.qOops.push(wQ.falls + wQ.petHits);
    const n = state.qScores.length;
    if (CKPT_AT.has(n)) addCheckpoint(n, wQ.cleaned);
    narrate(n);
    state.ep++;
    makeWorlds();
    drawChart();
  }

  function narrate(n) {
    const w = state.watch, rS = state.rScores, qS = state.qScores;
    if (w) {
      const since = n - w.start;
      if (since === 2) {
        ML.say(`After <b>${w.label}</b>: the rules robot had <b>${avg(state.rOops, 2).toFixed(1)}</b> oopsies a round (it can't help it, nobody changed its rules). The learner had <b>${avg(state.qOops, 2).toFixed(1)}</b> and is working it out.`);
        return;
      }
      if (since === 8) {
        const qo = avg(state.qOops, 3), ro = avg(state.rOops, 3);
        state.watch = null;
        ML.say(ro > qo + 0.5
          ? `The learner got used to <b>${w.label}</b>: ${qo.toFixed(1)} oopsies a round now. The rules robot still has ${ro.toFixed(1)}. Try adding a rule for it!`
          : `Both cope with <b>${w.label}</b> now: oopsies ${ro.toFixed(1)} vs ${qo.toFixed(1)}. The learner got there by itself.`);
        return;
      }
    }
    if (n === 1) return ML.say(`Round 1: the rules robot cleaned <b>${rS[0]}</b>, the learner <b>${qS[0]}</b>. The learner has no idea what to do yet, but every crumb teaches it.`);
    if (n === 4) return ML.say(`Round 4: learner <b>${qS[3]}</b> vs rules <b>${rS[3]}</b>. Look at its notebook on the right: it learned that dirt on the left means turn left, with nobody telling it.`);
    if (n === 12 && !state.said.cmp) {
      state.said.cmp = 1;
      const q = avg(qS, 5), r = avg(rS, 5);
      return ML.say(q > r + 1
        ? `The learner (<b>${q.toFixed(0)}</b>) now beats your rules (<b>${r.toFixed(0)}</b>)! Try the <b>Careful</b> preset to see well-written rules fight back.`
        : `Your rules (<b>${r.toFixed(0)}</b>) still lead the learner (<b>${q.toFixed(0)}</b>). Good hand-written rules are hard to beat in a room that never changes. Now <b>change the room</b>!`);
    }
  }

  // ---------- challenges ----------
  const CH_LABELS = { hot: "the dirty corner", stairs: "stairs", pet: "a wandering pet", furniture: "new furniture" };
  function challenge(c, btn) {
    if (c === "furniture") {
      state.layoutSeed += 7;
      state.cfg = { ...state.cfg, layout: V.makeLayout(state.layoutSeed) };
    } else {
      const on = !state.cfg[c];
      state.cfg = { ...state.cfg, [c]: on };
      btn.classList.toggle("on", on);
      if (!on) { restartRound(); return ML.say(`Switched ${CH_LABELS[c]} off again. The learner keeps what it learned; the rules robot never changed.`); }
    }
    state.markers.push({ at: state.qScores.length, label: c === "furniture" ? "Furniture" : c === "hot" ? "Dirty corner" : c === "stairs" ? "Stairs" : "Pet" });
    state.watch = { label: CH_LABELS[c], start: state.qScores.length };
    restartRound();
    flash(c === "furniture" ? "New furniture!" : `Now: ${CH_LABELS[c]}`);
    ML.say({
      hot: `A <b>dirty corner</b>: most new dirt lands in the top-left. Can each robot notice and spend time there?`,
      stairs: `<b>Stairs</b> appeared in the top-right! Falling costs a lot. The rules robot has no stairs rule unless you add one.`,
      pet: `A <b>pet</b> wanders around! Bumping it is a big ouch. Watch who learns to keep away.`,
      furniture: `The <b>furniture moved</b>! Old habits about where walls are no longer fit. Let's see.`,
    }[c]);
    drawChart();
  }
  function restartRound() { state.replay = null; ckpts.active = null; ckpts.render(); makeWorlds(); }
  function flash(t) {
    const o = document.getElementById("overlay");
    o.textContent = t; o.classList.add("show");
    clearTimeout(flash.t); flash.t = setTimeout(() => o.classList.remove("show"), 1400);
  }

  // ---------- rule builder ----------
  function renderRules() {
    const host = document.getElementById("rules");
    host.innerHTML = state.rules.order.map((id) => {
      const r = RULES.find((q) => q.id === id), on = state.rules.enabled.has(id);
      return `<div class="rule ${on ? "" : "off"}" data-id="${id}"><input type="checkbox" ${on ? "checked" : ""} aria-label="Use this rule"><div>${r.text.replace("IF ", "<b>IF</b> ")} <span class="then">→ ${r.then}</span></div>
        <div class="mv"><button data-d="-1" aria-label="Move up">▲</button><button data-d="1" aria-label="Move down">▼</button></div></div>`;
    }).join("") + `<div class="rule else"><div><b>ELSE</b> wander: <span class="then">go forward, turning now and then</span></div></div>`;
    host.querySelectorAll(".rule[data-id]").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector("input").addEventListener("change", (e) => { e.target.checked ? state.rules.enabled.add(id) : state.rules.enabled.delete(id); renderRules(); });
      row.querySelectorAll(".mv button").forEach((b) => b.addEventListener("click", () => {
        const o = state.rules.order, i = o.indexOf(id), j = i + +b.dataset.d;
        if (j < 0 || j >= o.length) return;
        [o[i], o[j]] = [o[j], o[i]];
        renderRules();
      }));
    });
  }
  function preset(ids) { state.rules.order = ORDER_DEFAULT.slice(); state.rules.enabled = new Set(ids); renderRules(); }
  document.getElementById("r-naive").addEventListener("click", () => { preset(V.NAIVE); ML.say(`<b>Naive</b> rules: turn at walls, go straight at dirt, otherwise wander. Simple, but it can't hunt for dirt or avoid danger.`); });
  document.getElementById("r-smart").addEventListener("click", () => { preset(V.SMART); ML.say(`<b>Careful</b> rules: avoid stairs and pets, chase dirt, and shake free when stuck. Much better, but somebody had to think of every case.`); });
  document.getElementById("r-none").addEventListener("click", () => { preset([]); ML.say(`No rules at all: the robot just wanders in straight lines.`); });
  renderRules();

  // ---------- drawing ----------
  const PIECE_COLOR = { sofa: "#a98bff", table: "#c58a52", bed: "#6fb7ff", shelf: "#d6b27a", plant: "#58c27d" };

  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

  function drawRoom(cv, world, color, who) {
    const c = cv.ctx;
    const dark = ML.isDark();
    c.clearRect(0, 0, CW, CH);
    // floor boards
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        c.fillStyle = (x + y) % 2 ? (dark ? "#2c2a45" : "#f6e9d2") : (dark ? "#302e4b" : "#f2e2c6");
        c.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    c.strokeStyle = dark ? "rgba(255,255,255,.05)" : "rgba(120,80,30,.10)";
    c.lineWidth = 1;
    for (let x = 0; x <= W; x++) { c.beginPath(); c.moveTo(x * CELL, 0); c.lineTo(x * CELL, CH); c.stroke(); }
    // dirty corner glow
    if (world.cfg.hot) {
      const g = c.createRadialGradient((HOT.x0 + HOT.x1 + 1) / 2 * CELL, (HOT.y0 + HOT.y1 + 1) / 2 * CELL, 8, (HOT.x0 + HOT.x1 + 1) / 2 * CELL, (HOT.y0 + HOT.y1 + 1) / 2 * CELL, 90);
      g.addColorStop(0, "rgba(140,90,40,.28)"); g.addColorStop(1, "rgba(140,90,40,0)");
      c.fillStyle = g; c.fillRect(0, 0, CW, CH);
    }
    // stairs
    if (world.cfg.stairs) {
      const x = STAIRS.x0 * CELL, y = STAIRS.y0 * CELL, w = (STAIRS.x1 - STAIRS.x0 + 1) * CELL, h = (STAIRS.y1 - STAIRS.y0 + 1) * CELL;
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "#5b5470"); g.addColorStop(1, "#1f1b2e");
      c.fillStyle = g; roundRect(c, x, y, w, h, 6); c.fill();
      c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2;
      for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(x + 4, y + (k * h) / 6); c.lineTo(x + w - 4, y + (k * h) / 6); c.stroke(); }
      c.setLineDash([6, 4]); c.strokeStyle = "#ffb020"; c.lineWidth = 3; roundRect(c, x + 1, y + 1, w - 2, h - 2, 6); c.stroke(); c.setLineDash([]);
      c.fillStyle = "#ffb020"; c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("STAIRS ↓", x + w / 2, y + h / 2 + 4);
    }
    // furniture
    for (const p of world.cfg.layout.pieces) {
      const x = p.x * CELL + 2, y = p.y * CELL + 2, w = p.w * CELL - 4, h = p.h * CELL - 4;
      c.fillStyle = "rgba(0,0,0,.14)"; roundRect(c, x + 2, y + 3, w, h, 8); c.fill();
      c.fillStyle = PIECE_COLOR[p.name]; roundRect(c, x, y, w, h, p.name === "plant" ? 99 : 8); c.fill();
      c.strokeStyle = "rgba(31,33,64,.55)"; c.lineWidth = 2; c.stroke();
      c.fillStyle = "rgba(255,255,255,.35)";
      if (p.name === "sofa") { for (let i = 0; i < p.w; i++) { roundRect(c, x + 4 + i * CELL, y + 4, CELL - 10, h - 8, 5); c.fill(); } }
      if (p.name === "bed") { roundRect(c, x + 4, y + 4, w - 8, CELL * 0.6, 6); c.fill(); }
      if (p.name === "table") { c.strokeStyle = "rgba(255,255,255,.4)"; c.beginPath(); c.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2 - 7, 0, 7); c.stroke(); }
      if (p.name === "shelf") { for (let i = 1; i < p.h * 3; i++) c.fillRect(x + 4, y + (i * h) / (p.h * 3), w - 8, 2); }
      if (p.name === "plant") { c.fillStyle = "#2b8f55"; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x + w / 2 + Math.cos(i * 1.26) * 6, y + h / 2 + Math.sin(i * 1.26) * 6, 6, 0, 7); c.fill(); } }
    }
    // dirt
    for (let i = 0; i < W * H; i++) if (world.dirt[i]) {
      const cx = (i % W) * CELL + CELL / 2, cy = Math.floor(i / W) * CELL + CELL / 2;
      c.fillStyle = "#7a5230";
      [[-5, 3, 3.4], [4, 5, 2.6], [1, -4, 3.1], [-3, -3, 2]].forEach(([dx, dy, r]) => { c.beginPath(); c.arc(cx + dx, cy + dy, r, 0, 7); c.fill(); });
      c.fillStyle = "rgba(255,255,255,.55)"; c.fillRect(cx + 5, cy - 7, 2, 2);
    }
    // pet
    if (world.pet) drawPet(c, world.pet);
    // robot
    drawRobot(c, world, color, who);
    // frame
    c.strokeStyle = dark ? "#4a4d70" : "#8a6a44"; c.lineWidth = 4; c.strokeRect(2, 2, CW - 4, CH - 4);
  }

  function drawPet(c, p) {
    const t = Math.min(1, (performance.now() - state.stepAt) / 160);
    const x = (ML.lerp(p.px, p.x, t) + 0.5) * CELL, y = (ML.lerp(p.py, p.y, t) + 0.5) * CELL;
    c.save(); c.translate(x, y);
    c.fillStyle = "#ffae5c"; c.strokeStyle = "#1f2140"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-8, -6); c.lineTo(-10, -14); c.lineTo(-3, -9); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(8, -6); c.lineTo(10, -14); c.lineTo(3, -9); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill(); c.stroke();
    c.fillStyle = "#1f2140"; c.beginPath(); c.arc(-4, -2, 1.8, 0, 7); c.arc(4, -2, 1.8, 0, 7); c.fill();
    c.beginPath(); c.moveTo(-2, 3); c.lineTo(2, 3); c.lineTo(0, 5); c.fill();
    c.strokeStyle = "#ffae5c"; c.lineWidth = 3; c.beginPath(); c.arc(12, 6, 6, -1, 1.6); c.stroke();
    c.restore();
  }

  function drawRobot(c, w, color, who) {
    const fast = state.speed === 0 || state.speed >= 10;
    const t = fast ? 1 : Math.min(1, (performance.now() - state.stepAt) / Math.max(60, 330 / Math.max(0.5, state.speed)));
    const x = (ML.lerp(w.px, w.x, t) + 0.5) * CELL, y = (ML.lerp(w.py, w.y, t) + 0.5) * CELL;
    let da = (w.dir - w.pdir) * 90; if (da > 180) da -= 360; if (da < -180) da += 360;
    const ang = ((w.pdir * 90 + da * t) * Math.PI) / 180;
    const s = w.done ? null : (who === "r" ? state.lastR && state.lastR.s : state.lastQ && state.lastQ.s);
    c.save(); c.translate(x, y);
    // dirt sensor line
    if (s && s.dirtDir !== 4) {
      c.save(); c.rotate(-ang);
      c.strokeStyle = "rgba(255,176,32,.9)"; c.lineWidth = 2; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(0, 0); c.lineTo((s.dirtX - w.x) * CELL, (s.dirtY - w.y) * CELL); c.stroke(); c.setLineDash([]);
      c.restore();
    }
    c.rotate(ang);
    // body
    c.fillStyle = "rgba(0,0,0,.18)"; c.beginPath(); c.arc(1, 2, 12, 0, 7); c.fill();
    c.fillStyle = color; c.strokeStyle = "#1f2140"; c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fill(); c.stroke();
    c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.arc(0, 1, 7.5, 0, 7); c.fill();
    // face LED
    c.fillStyle = "#1f2140"; c.beginPath(); c.arc(-2.6, -1, 1.5, 0, 7); c.arc(2.6, -1, 1.5, 0, 7); c.fill();
    c.strokeStyle = "#1f2140"; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 2, 2.6, 0.2, Math.PI - 0.2); c.stroke();
    // bump sensor (front bumper) lights red when something is ahead; stairs sensor amber
    c.lineWidth = 3.5; c.lineCap = "round";
    c.strokeStyle = s && (s.blockedAhead || s.petAhead) ? "#ff4d5e" : "rgba(31,33,64,.55)";
    c.beginPath(); c.arc(0, 0, 14.5, -Math.PI / 2 - 0.7, -Math.PI / 2 + 0.7); c.stroke();
    c.fillStyle = s && s.cliffAhead ? "#ffb020" : "rgba(31,33,64,.35)";
    c.beginPath(); c.arc(0, -17, 3, 0, 7); c.fill();
    // brush
    const spin = performance.now() / 70;
    c.strokeStyle = "#1f2140"; c.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { const a = spin + (k * 2 * Math.PI) / 3; c.beginPath(); c.moveTo(-9, -11); c.lineTo(-9 + Math.cos(a) * 5, -11 + Math.sin(a) * 5); c.stroke(); }
    c.restore();
    if (w.lastEvent === "clean" && performance.now() - state.stepAt < 200) {
      c.strokeStyle = "#2fbf62"; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 12 + (performance.now() - state.stepAt) / 12, 0, 7); c.stroke();
    }
    if (w.lastEvent === "fell" || w.lastEvent === "pet") {
      c.fillStyle = "#ff4d5e"; c.font = "800 13px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText(w.lastEvent === "fell" ? "Aaah!" : "Oops!", x, y - 20);
    }
  }

  function drawPaused(cv) {
    const c = cv.ctx;
    c.fillStyle = "rgba(31,33,64,.55)"; c.fillRect(0, 0, CW, CH);
    c.fillStyle = "#fff"; c.font = "800 18px Fredoka, sans-serif"; c.textAlign = "center";
    c.fillText("Paused while you watch a checkpoint", CW / 2, CH / 2);
  }

  function drawChart() {
    const all = [...state.rScores, ...state.qScores, 20];
    const yMax = Math.ceil(Math.max(...all) / 5) * 5;
    GameLab.drawChart(chart, [
      { values: state.rScores, color: "--sup" },
      { values: state.qScores, color: "--accent" },
    ], state.markers, yMax);
  }

  // ---------- sense → think → act strips ----------
  function buildSTA(id) {
    const host = document.getElementById(id);
    host.innerHTML = `<div class="sta-box"><div class="lbl">Sense</div><div class="val"></div></div>${ML.icon("arrow-right", "arr")}
      <div class="sta-box"><div class="lbl">Think</div><div class="val"></div></div>${ML.icon("arrow-right", "arr")}
      <div class="sta-box"><div class="lbl">Act</div><div class="val"></div></div>`;
    const boxes = [...host.querySelectorAll(".sta-box")];
    ["what it feels", "how it decides", "what it does"].forEach((t, i) => (boxes[i].querySelector(".val").textContent = t));
    return boxes;
  }
  const staR = buildSTA("sta-r"), staQ = buildSTA("sta-q");
  function senseText(s) {
    if (!s) return "…";
    const bits = [];
    bits.push(["dirt ahead", "dirt right", "dirt behind", "dirt left", "no dirt near"][s.dirtDir]);
    if (s.blockedAhead) bits.push("wall ahead");
    if (s.cliffAhead) bits.push("stairs!");
    if (s.petAhead) bits.push("pet!");
    return bits.join(" · ");
  }
  const ACT_WORD = ["go forward", "turn left", "turn right"];
  // full text goes in a tooltip; the box itself never changes size
  const setVal = (box, text) => { const v = box.querySelector(".val"); if (v.textContent !== text) { v.textContent = text; box.title = text; } };
  function updateSTA() {
    const r = state.lastR, q = state.lastQ;
    if (r) {
      setVal(staR[0], senseText(r.s));
      setVal(staR[1], r.last && r.last.rule ? r.last.rule.text.replace("IF ", "rule: ") : "no rule fits: wander");
      setVal(staR[2], ACT_WORD[r.a]);
    }
    if (q) {
      const v = q.values, best = v.indexOf(Math.max(...v)), known = v.some((x) => Math.abs(x) > 0.01);
      setVal(staQ[0], senseText(q.s));
      setVal(staQ[1], known ? `best: ${ACT_WORD[best]} (${v[best].toFixed(2)})` : "never seen this: guess!");
      setVal(staQ[2], ACT_WORD[q.a]);
    }
    if (state.stepped && state.speed <= 3 && state.speed !== 0) {
      [...staR, ...staQ].forEach((b) => { b.classList.remove("lit"); void b.offsetWidth; b.classList.add("lit"); });
    }
    state.stepped = false;
  }

  function updateInside() {
    const r = state.lastR, q = state.lastQ;
    document.querySelectorAll("#rules .rule[data-id]").forEach((row) => row.classList.toggle("fired", !!(r && r.last && r.last.rule && r.last.rule.id === row.dataset.id)));
    if (r) {
      const rule = r.last && r.last.rule;
      const sc = senseText(r.s);
      document.getElementById("in-r").innerHTML = rule
        ? `Feels: <b>${sc}</b><br>Rule fired: <b>${rule.text}</b> → ${rule.then}.<br>Did: <b>${ACT_WORD[r.a]}</b>.`
        : `Feels: <b>${sc}</b><br>No rule fits, so it wanders: <b>${ACT_WORD[r.a]}</b>.`;
    }
    if (q) {
      const v = q.values, m = Math.max(...v, 0.001), lo = Math.min(...v, 0), best = v.indexOf(Math.max(...v));
      const span = Math.max(0.2, m - lo);
      document.getElementById("in-q").innerHTML = `Feels: <b>${V.describeState(q.s)}</b><br>Its notebook for this situation says:`;
      document.getElementById("qbars").innerHTML = v.map((x, i) => {
        const pos = x >= 0;
        const w = Math.min(50, (Math.abs(x) / span) * 50);
        return `<div class="qbar ${i === best && Math.abs(x) > 0.01 ? "best" : ""}"><span>${ACTIONS[i]}</span>
          <div class="track"><div class="fill" style="left:${pos ? 50 : 50 - w}%;width:${w}%;background:${pos ? "var(--good)" : "var(--bad)"}"></div></div><span class="num">${x.toFixed(2)}</span></div>`;
      }).join("") + `<p style="margin-top:6px;font-size:.82rem;font-weight:700">It chose <b>${ACT_WORD[q.a]}</b>${q.a !== best && v.some((x) => Math.abs(x) > 0.01) ? " (a curious random try!)" : ""}.</p>`;
    }
    const wR = state.wR, wQ = state.wQ;
    document.getElementById("st-ep").textContent = state.replay ? "–" : state.ep + 1;
    document.getElementById("st-left").textContent = Math.max(0, EP_STEPS - wQ.steps);
    document.getElementById("st-r").textContent = wR.cleaned;
    document.getElementById("st-q").textContent = wQ.cleaned;
    document.getElementById("st-ro").textContent = wR.falls + wR.petHits;
    document.getElementById("st-qo").textContent = wQ.falls + wQ.petHits;
  }

  // ---------- checkpoints ----------
  const ckpts = new GameLab.Checkpoints(
    document.getElementById("ckpts"),
    (it) => {
      state.replay = { item: it, bot: it.bot };
      state.replayEp = 0;
      state.wQ = new V.World(state.cfg, 7000);
      state.playing = true; syncPlay();
      ML.say(`This is the learner after <b>round ${it.n}</b>, cleaning today's room. It doesn't learn while you watch.`);
    },
    () => { state.replay = null; makeWorlds(); ML.say(`Back to live training.`); }
  );
  function addCheckpoint(n, cleaned) {
    const bot = state.learner.clone();
    bot.learning = false; bot.epsilon = 0;
    ckpts.add({
      n, bot, label: `Round ${n}`, sub: `cleaned ${cleaned}`,
      draw(cv) {
        const c = cv.getContext("2d"), cw = cv.width, ch = cv.height;
        c.clearRect(0, 0, cw, ch);
        const cols = 3, rows = 5, x0 = 52, cellW = (cw - x0 - 6) / cols, cellH = (ch - 18) / rows;
        const names = ["dirt ahead", "dirt right", "dirt behind", "dirt left", "no dirt"];
        c.font = "700 9px Nunito, sans-serif"; c.textAlign = "right";
        for (let r = 0; r < rows; r++) {
          c.fillStyle = ML.cssVar("--muted"); c.fillText(names[r], x0 - 4, 18 + r * cellH + cellH * 0.65);
          // average Q across the other features, only for situations the robot has met
          const avgs = [0, 0, 0]; let cnt = 0;
          for (let k = r * 32; k < r * 32 + 32; k++) { const v = bot.values(k); if (v.some((x) => Math.abs(x) > 0.005)) { cnt++; for (let a = 0; a < 3; a++) avgs[a] += v[a]; } }
          const m = cnt ? Math.max(...avgs) : 0;
          for (let a = 0; a < 3; a++) {
            const val = cnt ? avgs[a] / cnt : 0;
            c.fillStyle = cnt ? (avgs[a] === m ? ML.cssVar("--good") : val < -0.02 ? ML.cssVar("--bad") : ML.cssVar("--line")) : ML.cssVar("--line");
            c.globalAlpha = cnt ? 0.4 + Math.min(0.6, Math.abs(val) * 2) : 0.4;
            c.fillRect(x0 + a * cellW + 1, 14 + r * cellH + 1, cellW - 2, cellH - 2);
            c.globalAlpha = 1;
          }
        }
        c.fillStyle = ML.cssVar("--ink-2"); c.textAlign = "center"; c.font = "800 9px Nunito, sans-serif";
        ["forward", "left", "right"].forEach((t, a) => c.fillText(t, x0 + a * cellW + cellW / 2, 10));
      },
    });
  }

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    state.playing = !state.playing; syncPlay();
    if (state.playing && state.ep === 0 && state.wQ.steps === 0) ML.say(`Off they go! Watch the little lights on each robot: <b>red bumper</b> = something ahead, <b>amber</b> = stairs, dotted line = dirt it can smell.`);
  });
  document.getElementById("step").addEventListener("click", () => { state.playing = false; syncPlay(); stepBoth(); });
  document.getElementById("reset").addEventListener("click", () => {
    Object.assign(state, { ep: 0, learner: new V.QBot(), rScores: [], qScores: [], rOops: [], qOops: [], markers: [], watch: null, replay: null, said: {}, lastR: null, lastQ: null });
    state.learner.epsilon = +document.getElementById("eps").value;
    state.cfg = { layout: V.makeLayout(1), stairs: false, pet: false, hot: false };
    state.layoutSeed = 1;
    document.querySelectorAll("#chal button").forEach((b) => b.classList.remove("on"));
    ckpts.clear(); makeWorlds(); drawChart();
    ML.say(`Fresh start! The learner forgot everything. The rules robot never learns anything, so it's the same as before.`);
  });
  document.querySelectorAll("#speed button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
      state.speed = +b.dataset.v;
    })
  );
  document.querySelectorAll("#chal button").forEach((b) => b.addEventListener("click", () => challenge(b.dataset.c, b)));
  ML.bindRange("#eps", (v) => Math.round(v * 100) + "%", (v) => { state.learner.epsilon = v; });

  // ---------- main loop ----------
  function frame() {
    state.frame++;
    if (state.playing) {
      if (state.speed === 0) {
        // Turbo ≈ 9 rounds a second: fast, but the chart and checkpoints can still tell the story.
        const n = ML.ticks(24, "vac");
        for (let i = 0; i < n; i++) stepBoth();
      } else {
        const n = ML.ticks(state.speed / 3, "vac");
        for (let i = 0; i < n; i++) stepBoth();
      }
    }
    drawRoom(cvR, state.wR, ML.cssVar("--sup"), "r");
    drawRoom(cvQ, state.wQ, ML.cssVar("--accent"), "q");
    if (state.replay) drawPaused(cvR);
    if (state.frame % (state.speed > 3 || state.speed === 0 ? 6 : 2) === 0) { updateSTA(); updateInside(); }
    requestAnimationFrame(frame);
  }
  drawChart();
  ckpts.render();
  syncPlay();
  requestAnimationFrame(frame);
})();
