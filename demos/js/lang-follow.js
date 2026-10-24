// Robo Follows Instructions — UI: animated episodes, attention glow, chart, checkpoints.
(function () {
  const F = window.Follow;
  const N = F.N;
  const GW = 420, GH = 420, CELL = GW / N;
  const CW = 640, CH = 110;
  const grid = ML.setupCanvas(document.getElementById("grid"), GW, GH);
  const chart = ML.setupCanvas(document.getElementById("chart"), CW, CH);
  const COL = { red: "#ff4d5e", blue: "#2f9bff", green: "#2fbf62" };

  const TESTS = F.makeTests(200);
  const SHOW = TESTS.slice(0, 6); // fixed tasks used by checkpoint replays
  const CKPT_AT = [1, 25, 100, 300, 1000, 3000];

  const state = {
    brain: F.newBrain(),
    training: false,
    speed: 1,
    results: [], // 1 = right object
    tests: [], // [episode, score]
    checkpoints: [],
    anim: null, // episode being animated
    mode: "train", // "train" | "test" | "replay"
    replay: null,
    world: F.makeWorld(),
    said: {},
  };

  // ---------- episode animation ----------
  function startAnim(task, ep, mode) {
    state.anim = { task, ep, i: 0, t: 0, mode };
  }
  function current() {
    const a = state.anim;
    if (!a) return null;
    const st = a.ep.steps[Math.min(a.i, a.ep.steps.length - 1)];
    return { a, st };
  }

  // ---------- training loop ----------
  function trainEpisode() {
    const r = F.trainOne(state.brain);
    state.results.push(r.ep.reached === r.target ? 1 : 0);
    const n = state.brain.episodes;
    if (n % 50 === 0 || n === 1) state.tests.push([n, F.evaluate(state.brain, TESTS)]);
    if (CKPT_AT.includes(n)) addCheckpoint();
    narrate();
    return r;
  }
  function rate() {
    const last = state.results.slice(-50);
    return last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0;
  }
  function narrate() {
    const n = state.brain.episodes, r = rate();
    const say = (k, html) => { if (!state.said[k]) { state.said[k] = 1; ML.say(html); } };
    if (n === 3) say("start", `I don't know any words yet, so I pick a thing <b>at random</b>. Only about 1 in 3 is right.`);
    if (n > 60 && r > 0.55) say("half", `I'm getting it! I'm starting to <b>pay attention</b> to colour words. Watch the glow under the words.`);
    if (n > 150 && r > 0.8) say("most", `Now I look at the <b>colour</b> and the <b>shape</b> words, and mostly ignore "go", "to", "the".`);
    if (n > 200 && r >= 0.93 && !state.said.done) {
      say("done", `I follow instructions now, ${Math.round(r * 100)}% right! Try giving me your own instruction.`);
      ML.confetti();
    }
  }

  // ---------- checkpoints ----------
  function addCheckpoint() {
    const n = state.brain.episodes;
    state.checkpoints.push({ n, brain: F.cloneBrain(state.brain), score: F.evaluate(state.brain, TESTS) });
    renderCheckpoints();
  }
  function renderCheckpoints() {
    const host = document.getElementById("ckpts");
    if (!state.checkpoints.length) return;
    host.innerHTML = (state.mode === "replay" ? `<button class="ckpt" data-live="1" style="display:grid;place-items:center;align-content:center;gap:6px"><b>Back to live</b>${ML.icon("play")}</button>` : "") +
      state.checkpoints.map((c, i) => `<button class="ckpt ${state.replay === c ? "on" : ""}" data-i="${i}"><canvas width="216" height="96"></canvas><b>After ${c.n} ${c.n === 1 ? "try" : "tries"}</b>Test ${Math.round(c.score * 100)}%</button>`).join("");
    host.querySelectorAll(".ckpt[data-i]").forEach((b) => {
      const c = state.checkpoints[+b.dataset.i];
      drawMiniEmbed(b.querySelector("canvas"), c.brain);
      b.addEventListener("click", () => startReplay(c));
    });
    const live = host.querySelector("[data-live]");
    if (live) live.addEventListener("click", () => { state.mode = "train"; state.replay = null; state.anim = null; renderCheckpoints(); });
  }
  // Mini picture of how strongly each word lights up each colour/shape (the learned word meanings).
  function drawMiniEmbed(canvas, brain) {
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, 216, 96);
    const words = F.VOCAB.slice(3);
    const things = [...F.COLORS, ...F.SHAPES];
    things.forEach((th, i) => {
      const f = new Array(6).fill(0);
      f[i] = 1;
      const q = brain.Wq.map((row) => row.reduce((s, w, j) => s + w * f[j], 0));
      words.forEach((w, j) => {
        const e = brain.E[F.VOCAB.indexOf(w)];
        const v = q.reduce((s, x, d) => s + x * e[d], 0);
        c.fillStyle = v > 0 ? ML.cssVar("--good") : ML.cssVar("--bad");
        c.globalAlpha = Math.min(1, Math.abs(v) / 3);
        c.fillRect(8 + j * 33, 4 + i * 15, 30, 13);
      });
    });
    c.globalAlpha = 1;
  }
  function startReplay(c) {
    state.training = false;
    syncTrain();
    state.mode = "replay";
    state.replay = c;
    state.replayIdx = 0;
    playReplayTask();
    renderCheckpoints();
    ML.say(`This is my brain after <b>${c.n}</b> ${c.n === 1 ? "try" : "tries"}. ${c.score < 0.5 ? "Back then the words meant almost nothing to me!" : c.score < 0.9 ? "I knew some words, but not all." : "By now I understood the instructions."}`);
  }
  function playReplayTask() {
    const t = SHOW[state.replayIdx % SHOW.length];
    state.replayIdx++;
    const ep = F.runEpisode(state.replay.brain, t.world, t.words, t.target, Math.random, false);
    startAnim(t, ep, "replay");
  }

  // ---------- your instruction ----------
  let pickColor = "red", pickShape = "star";
  function bindSeg(id, set) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      set(b.dataset.v);
    }));
  }
  bindSeg("pick-color", (v) => (pickColor = v));
  bindSeg("pick-shape", (v) => (pickShape = v));
  function testInstruction() {
    if (!pickColor && !pickShape) return ML.toast("Pick a colour or a shape (or both)");
    state.training = false;
    syncTrain();
    state.mode = "test";
    state.replay = null;
    renderCheckpoints();
    const words = ["go", "to", "the", ...(pickColor ? [pickColor] : []), ...(pickShape ? [pickShape] : [])];
    const w = state.world;
    const target = w.objs.findIndex((o) => (!pickColor || o.color === pickColor) && (!pickShape || o.shape === pickShape));
    const ep = F.runEpisode(state.brain, w, words, target, Math.random, true);
    startAnim({ world: w, words, target }, ep, "test");
    if (target < 0) ML.say(`There's no <b>${words.slice(3).join(" ")}</b> here! Watch which thing I think is closest to what you said.`);
  }
  document.getElementById("test").addEventListener("click", testInstruction);
  document.getElementById("shuffle").addEventListener("click", () => {
    state.world = F.makeWorld();
    state.anim = null;
    state.mode = "test";
    ML.say(`New world! Pick a colour and shape, then press <b>Try it</b>.`);
  });

  // ---------- controls ----------
  const trainBtn = document.getElementById("train");
  function syncTrain() { trainBtn.innerHTML = state.training ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Train`; }
  trainBtn.addEventListener("click", () => {
    state.training = !state.training;
    if (state.training) { state.mode = "train"; state.replay = null; renderCheckpoints(); if (!state.brain.episodes) addCheckpointZero(); }
    syncTrain();
  });
  function addCheckpointZero() {
    if (state.checkpoints.length) return;
    state.checkpoints.push({ n: 0, brain: F.cloneBrain(state.brain), score: F.evaluate(state.brain, TESTS) });
    renderCheckpoints();
  }
  document.getElementById("reset").addEventListener("click", () => {
    state.brain = F.newBrain();
    state.results = [];
    state.tests = [];
    state.checkpoints = [];
    state.said = {};
    state.anim = null;
    state.mode = "train";
    state.replay = null;
    document.getElementById("ckpts").innerHTML = `<span class="muted">They appear after 1, 25, 100, 300, 1000 and 3000 tries.</span>`;
    ML.say(`All my word meanings are random again. Press <b>Train</b>!`);
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));

  // ---------- per-frame update ----------
  function tick() {
    const a = state.anim;
    if (state.mode === "train" && state.training && state.speed >= 100) {
      let r;
      for (let i = 0; i < 40; i++) r = trainEpisode();
      startAnim(r, r.ep, "train");
      state.anim.i = r.ep.steps.length; // show the end
      return;
    }
    if (a) {
      a.t += state.speed >= 100 ? 1 : state.speed * 0.12;
      if (a.t >= 1) {
        a.t = 0;
        a.i++;
        if (a.i > a.ep.steps.length + 3) {
          if (a.mode === "train" && state.training) next();
          else if (a.mode === "replay") playReplayTask();
          else if (a.mode === "test") { endTestMessage(a); state.anim = { ...a, i: a.ep.steps.length, t: 0, frozen: true }; }
        }
      }
      if (a.frozen) a.i = a.ep.steps.length;
    } else if (state.mode === "train" && state.training) next();
  }
  function next() {
    const r = trainEpisode();
    startAnim(r, r.ep, "train");
  }
  function endTestMessage(a) {
    if (a.task.target < 0) return;
    const ok = a.ep.reached === a.task.target;
    ML.say(ok ? `Got it! I went to the <b>${a.task.words.slice(3).join(" ")}</b>.` : `Oops, wrong one. ${state.brain.episodes < 300 ? "I need more training!" : "Even I make mistakes sometimes."}`);
  }

  // ---------- drawing ----------
  function drawShape(c, o, x, y, s) {
    c.fillStyle = COL[o.color];
    c.strokeStyle = "#1f2140";
    c.lineWidth = 3;
    c.beginPath();
    if (o.shape === "circle") c.arc(x, y, s, 0, Math.PI * 2);
    else if (o.shape === "square") c.roundRect(x - s, y - s, s * 2, s * 2, 5);
    else for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.45 : s * 1.1, an = -Math.PI / 2 + (i * Math.PI) / 5;
      i ? c.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r) : c.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
    }
    c.closePath();
    c.fill();
    c.stroke();
  }
  function drawRobo(c, x, y, dir) {
    c.save();
    c.translate(x, y);
    c.fillStyle = ML.cssVar("--accent");
    c.strokeStyle = "#1f2140";
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -CELL * 0.36); c.lineTo(0, -CELL * 0.26); c.stroke();
    c.beginPath(); c.roundRect(-CELL * 0.28, -CELL * 0.26, CELL * 0.56, CELL * 0.5, 9); c.fill(); c.stroke();
    c.fillStyle = "#fff";
    c.beginPath(); c.roundRect(-CELL * 0.2, -CELL * 0.17, CELL * 0.4, CELL * 0.22, 6); c.fill();
    const [dx, dy] = F.DIRS[dir] || [0, 0];
    c.fillStyle = "#1f2140";
    c.beginPath(); c.arc(-CELL * 0.09 + dx * 3, -CELL * 0.06 + dy * 3, 3.5, 0, Math.PI * 2); c.arc(CELL * 0.09 + dx * 3, -CELL * 0.06 + dy * 3, 3.5, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function draw() {
    const c = grid.ctx;
    c.clearRect(0, 0, GW, GH);
    c.fillStyle = ML.cssVar("--canvas-bg");
    c.fillRect(0, 0, GW, GH);
    c.strokeStyle = ML.cssVar("--line");
    c.lineWidth = 1.5;
    for (let i = 1; i < N; i++) {
      c.beginPath(); c.moveTo(i * CELL, 0); c.lineTo(i * CELL, GH); c.stroke();
      c.beginPath(); c.moveTo(0, i * CELL); c.lineTo(GW, i * CELL); c.stroke();
    }
    const cur = current();
    const world = cur ? cur.a.task.world : state.world;
    const words = cur ? cur.a.task.words : null;
    const st = cur && cur.st;
    const done = cur && cur.a.i >= cur.a.ep.steps.length;
    const robo = cur ? (done ? cur.a.ep.end : st.robo) : world.robo;
    // trail
    if (cur) {
      c.fillStyle = ML.cssVar("--accent");
      c.globalAlpha = 0.25;
      cur.a.ep.steps.slice(0, Math.min(cur.a.i, cur.a.ep.steps.length)).forEach((s) => {
        c.beginPath(); c.arc((s.robo[0] + 0.5) * CELL, (s.robo[1] + 0.5) * CELL, 5, 0, Math.PI * 2); c.fill();
      });
      c.globalAlpha = 1;
    }
    // objects + "which thing do the words point to" rings
    world.objs.forEach((o, k) => {
      const x = (o.x + 0.5) * CELL, y = (o.y + 0.5) * CELL;
      if (st) {
        const p = st.th.p[k];
        c.strokeStyle = ML.cssVar("--warn");
        c.lineWidth = 2 + p * 9;
        c.globalAlpha = 0.25 + p * 0.75;
        c.beginPath(); c.arc(x, y, CELL * 0.44, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
        c.fillStyle = ML.cssVar("--ink");
        c.font = "800 11px Nunito, sans-serif";
        c.textAlign = "center";
        c.fillText(Math.round(p * 100) + "%", x, y + CELL * 0.48 + 2);
      }
      if (cur && cur.a.task.target === k && done) {
        c.strokeStyle = ML.cssVar("--good"); c.lineWidth = 3; c.setLineDash([5, 4]);
        c.strokeRect(o.x * CELL + 3, o.y * CELL + 3, CELL - 6, CELL - 6); c.setLineDash([]);
      }
      drawShape(c, o, x, y, CELL * 0.24);
    });
    // move scores as arrows around Robo
    const rx = (robo[0] + 0.5) * CELL, ry = (robo[1] + 0.5) * CELL;
    if (st && !done) {
      st.th.moves.forEach((m, d) => {
        const [dx, dy] = F.DIRS[d];
        const len = 6 + m * CELL * 0.55;
        c.strokeStyle = d === st.a ? ML.cssVar("--rl") : ML.cssVar("--muted");
        c.globalAlpha = 0.35 + m * 0.65;
        c.lineWidth = 3 + m * 4;
        c.lineCap = "round";
        const sx = rx + dx * CELL * 0.3, sy = ry + dy * CELL * 0.3;
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + dx * len, sy + dy * len); c.stroke();
        c.globalAlpha = 1;
      });
    }
    drawRobo(c, rx, ry, st ? st.a : 2);
    if (done && cur.a.task.target >= 0) {
      const ok = cur.a.ep.reached === cur.a.task.target;
      c.font = "700 22px Fredoka, sans-serif";
      c.textAlign = "center";
      c.fillStyle = ok ? ML.cssVar("--good") : ML.cssVar("--bad");
      c.fillText(ok ? "Right!" : cur.a.ep.reached >= 0 ? "Wrong one!" : "Got lost", GW / 2, 26);
    }
    if (state.mode === "replay" && state.replay) {
      c.fillStyle = "rgba(31,33,64,.82)";
      c.beginPath(); c.roundRect(10, GH - 40, GW - 20, 30, 10); c.fill();
      c.fillStyle = "#fff"; c.font = "800 13px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText(`Replaying checkpoint: after ${state.replay.n} tries`, GW / 2, GH - 20);
    }
    renderWords(words, st);
  }

  // Instruction chips glow by attention of the thing Robo favours most.
  let lastWordsKey = "";
  function renderWords(words, st) {
    const host = document.getElementById("instr");
    const note = document.getElementById("att-note");
    if (!words) { if (lastWordsKey !== "none") { host.innerHTML = `<span class="lbl">Instruction</span><span class="muted">waiting…</span>`; note.textContent = ""; lastWordsKey = "none"; } return; }
    const key = words.join(" ");
    if (key !== lastWordsKey) {
      host.innerHTML = `<span class="lbl">Instruction</span>` + words.map((w) => `<span class="tok">${w}<span class="w"></span></span>`).join("");
      lastWordsKey = key;
    }
    if (!st) return;
    const fav = st.th.p.indexOf(Math.max(...st.th.p));
    const att = st.th.objs[fav].att;
    host.querySelectorAll(".tok").forEach((el, i) => {
      const a = att[i] || 0;
      el.style.background = `color-mix(in srgb, var(--accent) ${Math.round(a * 70)}%, var(--card))`;
      el.style.borderColor = a > 0.3 ? "var(--accent)" : "var(--line)";
      el.style.transform = `translateY(${-a * 4}px)`;
      el.querySelector(".w").style.transform = `scaleX(${a})`;
    });
    const top = att.map((a, i) => [a, words[i]]).sort((x, y) => y[0] - x[0]).slice(0, 2);
    note.innerHTML = `To decide, Robo looked mostly at <b>[${top[0][1]}]</b>${top[1] ? ` and <b>[${top[1][1]}]</b>` : ""}.`;
    renderInside(words, st, fav);
  }

  let insideTick = 0;
  function renderInside(words, st, fav) {
    if (++insideTick % 6) return;
    const world = state.anim.task.world;
    const name = (o) => `<span style="color:${COL[o.color]}">${o.color} ${o.shape}</span>`;
    const ps = st.th.p.map((p, k) => `${name(world.objs[k])} ${Math.round(p * 100)}%`).join(" · ");
    const mv = st.th.moves.map((m, d) => `${F.DIR_NAMES[d]} ${Math.round(m * 100)}%`).join(" · ");
    const att = st.th.objs[fav].att.map((a, i) => [a, words[i]]).sort((x, y) => y[0] - x[0]);
    document.getElementById("inside").innerHTML = `
      <div>${ML.icon("chat")} Words: <b>${words.join(" ")}</b></div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("search")} Attention (for the ${name(world.objs[fav])}): <b>${att[0][1]}</b> ${Math.round(att[0][0] * 100)}%, <b>${att[1] ? att[1][1] : ""}</b> ${att[1] ? Math.round(att[1][0] * 100) + "%" : ""}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("target")} Which thing? ${ps}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("map")} Move scores: ${mv} → <b style="color:var(--accent)">${F.DIR_NAMES[st.a]}</b></div>`;
  }

  function drawChart() {
    const c = chart.ctx;
    c.clearRect(0, 0, CW, CH);
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1;
    [0.33, 1].forEach((v) => { const y = CH - 8 - v * (CH - 18); c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, y); c.lineTo(CW, y); c.stroke(); });
    c.setLineDash([]);
    c.fillStyle = ML.cssVar("--muted"); c.font = "800 10px Nunito, sans-serif"; c.textAlign = "left";
    c.fillText("CHANCE (1 in 3)", 4, CH - 8 - 0.33 * (CH - 18) - 4);
    c.fillText("ALWAYS RIGHT", 4, 18);
    const res = state.results;
    if (res.length < 2) return;
    const maxN = Math.max(200, res.length);
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 3; c.beginPath();
    let s = 0;
    const win = [];
    res.forEach((v, i) => {
      win.push(v); s += v; if (win.length > 50) s -= win.shift();
      if (i % Math.max(1, Math.floor(res.length / 300)) && i !== res.length - 1) return;
      const x = (i / maxN) * CW, y = CH - 8 - (s / win.length) * (CH - 18);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.stroke();
    c.fillStyle = ML.cssVar("--good");
    state.tests.forEach(([n, sc]) => { c.beginPath(); c.arc((n / maxN) * CW, CH - 8 - sc * (CH - 18), 3.5, 0, Math.PI * 2); c.fill(); });
  }

  function stats() {
    document.getElementById("st-ep").textContent = state.brain.episodes;
    document.getElementById("st-rate").innerHTML = state.results.length ? `${Math.round(rate() * 100)}<small>%</small>` : "–";
    const t = state.tests[state.tests.length - 1];
    document.getElementById("st-test").innerHTML = t ? `${Math.round(t[1] * 100)}<small>%</small>` : "–";
  }

  (function loop() {
    tick();
    draw();
    drawChart();
    stats();
    requestAnimationFrame(loop);
  })();
})();
