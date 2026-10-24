// What is ML? — Robo learns a hidden rule about monsters with logistic regression,
// one example at a time, while the look → guess → check → tweak loop lights up.
(function () {
  const W = 640, H = 340;
  const cv = ML.setupCanvas(document.getElementById("cv"), W, H);
  const ctx = cv.ctx;

  const FEATURES = [
    { key: "size", name: "Big", icon: "plus" },
    { key: "blue", name: "Blue", icon: "eye" },
    { key: "spiky", name: "Spiky", icon: "star" },
    { key: "eyes", name: "Many eyes", icon: "eye" },
  ];
  const RULES = {
    big: (m) => m.size > 0.5,
    blue: (m) => m.blue > 0.5,
    spiky: (m) => m.spiky < 0.25,
    bigblue: (m) => m.size > 0.5 && m.blue > 0.5,
  };
  const RULE_TEXT = {
    big: "big monsters are friendly",
    blue: "blue monsters are friendly",
    spiky: "spiky monsters are grumpy",
    bigblue: "big AND blue monsters are friendly",
  };

  const rnd = ML.seeded(7);
  function makeMonster(r = Math.random) {
    return {
      size: r(),
      blue: r(),
      spiky: Math.floor(r() * 5) / 4, // 0, .25, .5, .75, 1 → 0–4 spikes
      eyes: Math.floor(r() * 3) / 2, // 1–3 eyes
      seed: Math.floor(r() * 1e6),
    };
  }
  const TEST = Array.from({ length: 60 }, () => makeMonster(rnd));
  const vec = (m) => [m.size, m.blue, m.spiky, m.eyes];
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  const state = {
    rule: "big",
    w: [0, 0, 0, 0],
    b: 0,
    lr: 2.5,
    n: 0,
    history: [],
    monster: null,
    guess: null, // probability friendly
    truth: null,
    stage: null,
    busy: false,
    auto: false,
    waitingTeacher: false,
    checkpoints: [],
    viewing: null, // checkpoint being previewed
  };
  const CKPT_AT = [1, 3, 10, 25, 50, 100];

  const predict = (m, w = state.w, b = state.b) => sigmoid(vec(m).reduce((s, x, i) => s + x * w[i], b));
  function testScore(w = state.w, b = state.b) {
    if (state.rule === "me") return null;
    const rule = RULES[state.rule];
    let ok = 0;
    for (const m of TEST) if ((predict(m, w, b) > 0.5) === rule(m)) ok++;
    return Math.round((ok / TEST.length) * 100);
  }

  // ---------- drawing ----------
  function monsterColor(m) {
    const hue = ML.lerp(28, 212, m.blue);
    return `hsl(${hue} 80% 58%)`;
  }
  function drawMonster(c, m, x, y, scale, mood) {
    const r = (34 + m.size * 46) * scale;
    const rs = ML.seeded(m.seed);
    c.save();
    c.translate(x, y);
    // spikes
    const spikes = Math.round(m.spiky * 4);
    c.fillStyle = monsterColor(m);
    c.strokeStyle = "#1f2140";
    c.lineWidth = 3 * scale;
    for (let i = 0; i < spikes; i++) {
      const a = -Math.PI / 2 + (i - (spikes - 1) / 2) * 0.55;
      c.beginPath();
      c.moveTo(Math.cos(a - 0.22) * r * 0.92, Math.sin(a - 0.22) * r * 0.92);
      c.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
      c.lineTo(Math.cos(a + 0.22) * r * 0.92, Math.sin(a + 0.22) * r * 0.92);
      c.closePath();
      c.fill();
      c.stroke();
    }
    // feet
    c.fillStyle = monsterColor(m);
    c.beginPath(); c.ellipse(-r * 0.45, r * 0.92, r * 0.25, r * 0.14, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(r * 0.45, r * 0.92, r * 0.25, r * 0.14, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    // body (slightly wobbly blob)
    c.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 3 + rs() * 6) * 0.04);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
    c.fill();
    c.stroke();
    // belly
    c.fillStyle = "rgba(255,255,255,.25)";
    c.beginPath(); c.ellipse(0, r * 0.35, r * 0.5, r * 0.4, 0, 0, Math.PI * 2); c.fill();
    // eyes
    const eyes = Math.round(m.eyes * 2) + 1;
    for (let i = 0; i < eyes; i++) {
      const ex = (i - (eyes - 1) / 2) * r * 0.42, ey = -r * 0.22;
      const er = r * (eyes === 1 ? 0.24 : 0.17);
      c.fillStyle = "#fff"; c.beginPath(); c.arc(ex, ey, er, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = "#1f2140"; c.beginPath(); c.arc(ex + er * 0.2, ey + er * 0.1, er * 0.45, 0, Math.PI * 2); c.fill();
    }
    // mouth
    c.strokeStyle = "#1f2140";
    c.lineWidth = 3.5 * scale;
    c.lineCap = "round";
    c.beginPath();
    if (mood === "friendly") c.arc(0, r * 0.18, r * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mood === "grumpy") c.arc(0, r * 0.62, r * 0.3, 1.2 * Math.PI, 1.8 * Math.PI);
    else { c.moveTo(-r * 0.2, r * 0.38); c.lineTo(r * 0.2, r * 0.38); }
    c.stroke();
    c.restore();
  }

  function bubble(c, x, y, w, h, text, color) {
    c.save();
    c.fillStyle = ML.cssVar("--card");
    c.strokeStyle = color || ML.cssVar("--ink");
    c.lineWidth = 3;
    c.beginPath(); c.roundRect(x, y, w, h, 16); c.fill(); c.stroke();
    c.fillStyle = ML.cssVar("--ink");
    c.font = "700 17px Nunito, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const lines = text.split("\n");
    lines.forEach((l, i) => c.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * 22));
    c.restore();
  }

  let pop = 1;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const m = state.monster;
    // floor
    ctx.fillStyle = ML.cssVar("--bg-2");
    ctx.fillRect(0, H - 60, W, 60);
    if (!m) {
      ctx.fillStyle = ML.cssVar("--muted");
      ctx.font = "700 20px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Press “Next monster” to start", W / 2, H / 2);
      return;
    }
    pop = Math.min(1, pop + 0.08);
    const mood = state.stage === "check" || state.stage === "tweak" || state.stage === "done" ? (state.truth ? "friendly" : "grumpy") : null;
    const s = 0.6 + 0.4 * (1 - Math.pow(1 - pop, 3));
    drawMonster(ctx, m, 210, H - 140, s, mood);

    // Robo's guess bubble
    if (state.guess !== null && state.stage !== "look") {
      const p = state.guess;
      const sure = Math.round(Math.max(p, 1 - p) * 100);
      const word = p > 0.5 ? "friendly" : "grumpy";
      const txt = state.n === 0 && Math.abs(p - 0.5) < 0.02 ? "I have no idea!\nCoin flip…" : `I think it's ${word}\n(${sure}% sure)`;
      bubble(ctx, 380, 40, 230, 74, txt);
      // probability bar
      const bx = 380, by = 130, bw = 230;
      ctx.fillStyle = ML.cssVar("--bad"); ctx.beginPath(); ctx.roundRect(bx, by, bw, 16, 8); ctx.fill();
      ctx.fillStyle = ML.cssVar("--good"); ctx.beginPath(); ctx.roundRect(bx, by, bw * p, 16, 8); ctx.fill();
      ctx.fillStyle = ML.cssVar("--muted"); ctx.font = "800 12px Nunito, sans-serif";
      ctx.textAlign = "left"; ctx.fillText("FRIENDLY", bx, by + 32);
      ctx.textAlign = "right"; ctx.fillText("GRUMPY", bx + bw, by + 32);
    }
    if (mood) {
      const right = (state.guess > 0.5) === state.truth;
      ctx.font = "700 26px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = right ? ML.cssVar("--good") : ML.cssVar("--bad");
      ctx.fillText(right ? "Robo got it right!" : "Oops, Robo was wrong", 495, 210);
      ctx.font = "700 15px Nunito, sans-serif";
      ctx.fillStyle = ML.cssVar("--ink-2");
      ctx.fillText(`The answer: ${state.truth ? "friendly" : "grumpy"}`, 495, 238);
    }
    if (state.viewing) {
      ctx.fillStyle = ML.cssVar("--accent");
      ctx.font = "800 13px Nunito, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Looking back at checkpoint: after ${state.viewing.n} example${state.viewing.n > 1 ? "s" : ""}`, 14, 22);
    }
  }

  // ---------- panel ----------
  function renderWeights(w = state.w) {
    const host = document.getElementById("weights");
    host.innerHTML = FEATURES.map((f, i) => {
      const v = w[i];
      const pct = Math.min(50, Math.abs(v) * 7 + (v ? 2 : 0));
      const left = v >= 0 ? 50 : 50 - pct;
      const col = v >= 0 ? "var(--good)" : "var(--bad)";
      return `<div class="wbar"><span>${f.name}</span><div class="track"><div class="fill" style="left:${left}%;width:${pct}%;background:${col}"></div></div><span class="num">${v >= 0 ? "+" : ""}${v.toFixed(1)}</span></div>`;
    }).join("");
  }
  function renderInside() {
    const m = state.monster;
    const host = document.getElementById("inside");
    if (!m) return;
    const x = vec(m);
    const rows = FEATURES.map((f, i) => `<div>${f.name} <b>${x[i].toFixed(2)}</b> × care <b>${state.viewing ? state.viewing.w[i].toFixed(1) : state.w[i].toFixed(1)}</b> = ${(x[i] * (state.viewing ? state.viewing.w[i] : state.w[i])).toFixed(2)}</div>`).join("");
    const b = state.viewing ? state.viewing.b : state.b;
    const z = x.reduce((s, xi, i) => s + xi * (state.viewing ? state.viewing.w[i] : state.w[i]), b);
    const p = sigmoid(z);
    host.innerHTML = `${rows}<div>+ starting mood <b>${b.toFixed(1)}</b></div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>Total <b>${z.toFixed(2)}</b> → squish into 0–100% → <b style="color:${p > 0.5 ? "var(--good)" : "var(--bad)"}">${Math.round(p * 100)}% friendly</b></div>`;
  }
  function renderStats() {
    document.getElementById("st-n").textContent = state.n;
    const last = state.history.slice(-10);
    document.getElementById("st-last").innerHTML = last.length ? `${last.filter(Boolean).length}<small>/${last.length}</small>` : "–";
    const t = testScore();
    document.getElementById("st-test").innerHTML = t === null ? "<small>n/a</small>" : `${t}<small>%</small>`;
    document.getElementById("history").innerHTML = state.history.slice(-60).map((ok) => `<i class="${ok ? "ok" : "no"}"></i>`).join("");
  }
  function setStage(s) {
    state.stage = s;
    document.querySelectorAll("#loop div").forEach((d) => d.classList.toggle("on", d.dataset.s === s));
  }

  function addCheckpoint() {
    if (!CKPT_AT.includes(state.n)) return;
    const ck = { n: state.n, w: state.w.slice(), b: state.b, test: testScore() };
    state.checkpoints.push(ck);
    renderCheckpoints();
  }
  function renderCheckpoints() {
    const host = document.getElementById("ckpts");
    if (!state.checkpoints.length) {
      host.innerHTML = `<span class="muted">They'll appear after 1, 3, 10, 25 and 50 examples.</span>`;
      return;
    }
    host.innerHTML = state.checkpoints.map((c, i) => `<button class="ckpt ${state.viewing === c ? "on" : ""}" data-i="${i}">
      <canvas width="216" height="90"></canvas><b>After ${c.n}</b>${c.test === null ? "" : `Test score ${c.test}%`}</button>`).join("") +
      (state.viewing ? `<button class="ckpt" data-live="1" style="display:grid;place-items:center;font-size:.9rem"><b>Back to live</b>${ML.icon("play")}</button>` : "");
    host.querySelectorAll(".ckpt[data-i]").forEach((b) => {
      const c = state.checkpoints[+b.dataset.i];
      drawMiniWeights(b.querySelector("canvas"), c.w);
      b.addEventListener("click", () => {
        state.viewing = c;
        renderWeights(c.w);
        renderInside();
        renderCheckpoints();
        ML.say(`This is my brain after <b>${c.n}</b> example${c.n > 1 ? "s" : ""}. ${c.test === null ? "" : `Back then I scored <b>${c.test}%</b> on the test monsters.`}`);
      });
    });
    const live = host.querySelector("[data-live]");
    if (live) live.addEventListener("click", () => { state.viewing = null; renderWeights(); renderInside(); renderCheckpoints(); });
  }
  function drawMiniWeights(canvas, w) {
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, 216, 90);
    w.forEach((v, i) => {
      const y = 8 + i * 20, mid = 108, len = Math.min(100, Math.abs(v) * 16);
      c.fillStyle = v >= 0 ? ML.cssVar("--good") : ML.cssVar("--bad");
      c.fillRect(v >= 0 ? mid : mid - len, y, len, 12);
    });
    c.fillStyle = ML.cssVar("--muted");
    c.fillRect(107, 2, 2, 86);
  }

  // ---------- one round of the loop ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let teacherResolve = null;
  async function round() {
    if (state.busy) return;
    state.busy = true;
    state.viewing = null;
    const fast = state.auto && state.n > 6;
    const T = fast ? 0.35 : 1;
    const m = makeMonster();
    state.monster = m;
    state.guess = predict(m);
    state.truth = null;
    pop = 0;
    setStage("look");
    renderInside();
    renderCheckpoints();
    await sleep(600 * T);

    setStage("guess");
    if (!fast) ML.say(state.n === 0 ? `My brain is empty, so this first guess is a <b>coin flip</b>.` : `I'm guessing <b>${state.guess > 0.5 ? "friendly" : "grumpy"}</b>. Let's see if I'm right…`);
    await sleep(800 * T);

    if (state.rule === "me") {
      state.waitingTeacher = true;
      document.getElementById("teach").classList.add("show");
      ML.say(`You're the teacher! Is this monster <b>friendly</b> or <b>grumpy</b>?`);
      state.truth = await new Promise((r) => (teacherResolve = r));
      document.getElementById("teach").classList.remove("show");
      state.waitingTeacher = false;
    } else {
      state.truth = RULES[state.rule](m);
    }
    setStage("check");
    const right = (state.guess > 0.5) === state.truth;
    state.history.push(right);
    if (!fast) ML.say(right ? `Yes! I was right.` : `Oops! It was <b>${state.truth ? "friendly" : "grumpy"}</b>. I'll fix my brain a little.`);
    await sleep(800 * T);

    setStage("tweak");
    // one step of gradient descent on cross-entropy
    const err = state.guess - (state.truth ? 1 : 0);
    const x = vec(m);
    for (let i = 0; i < 4; i++) state.w[i] -= state.lr * err * x[i];
    state.b -= state.lr * err;
    state.n++;
    renderWeights();
    renderInside();
    renderStats();
    addCheckpoint();
    if (!fast) {
      const big = FEATURES.map((f, i) => [f.name, state.w[i]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      if (state.n >= 3) ML.say(`I nudged my numbers. So far I've noticed <b>${big[0].toLowerCase()}</b> matters most (${big[1] > 0 ? "friendlier" : "grumpier"}).`);
    }
    await sleep(500 * T);
    setStage("done");
    state.busy = false;

    const t = testScore();
    if (t !== null && t >= (state.rule === "bigblue" ? 88 : 95) && !state.celebrated) {
      state.celebrated = true;
      stopAuto();
      ML.confetti();
      ML.say(`I scored <b>${t}%</b> on monsters I've never seen! I learned the rule "<b>${RULE_TEXT[state.rule]}</b>" from just <b>${state.n}</b> examples. Nobody told me!`);
      return;
    }
    if (state.auto) setTimeout(round, fast ? 80 : 400);
  }

  function stopAuto() {
    state.auto = false;
    document.getElementById("auto").innerHTML = `${ML.icon("play")} Auto`;
  }
  function reset(say = true) {
    stopAuto();
    state.w = [0, 0, 0, 0];
    state.b = 0;
    state.n = 0;
    state.history = [];
    state.checkpoints = [];
    state.viewing = null;
    state.monster = null;
    state.guess = null;
    state.celebrated = false;
    setStage(null);
    renderWeights();
    renderStats();
    renderCheckpoints();
    document.getElementById("inside").innerHTML = `<span class="muted">Press <b>Next monster</b> to see Robo think.</span>`;
    if (say) ML.say(`My brain is empty again: all my "how much I care" numbers are zero.`);
  }

  document.getElementById("next").addEventListener("click", () => { stopAuto(); round(); });
  document.getElementById("auto").addEventListener("click", () => {
    if (state.auto) return stopAuto();
    if (state.rule === "me") return ML.toast("In teacher mode, you answer each monster yourself");
    state.auto = true;
    document.getElementById("auto").innerHTML = `${ML.icon("pause")} Stop`;
    if (!state.busy) round();
  });
  document.getElementById("reset").addEventListener("click", () => reset());
  document.getElementById("rule").addEventListener("change", (e) => {
    state.rule = e.target.value;
    if (teacherResolve && state.waitingTeacher) { teacherResolve(false); }
    reset(false);
    ML.say(state.rule === "me"
      ? `You make up the rule! Keep it in your head and answer honestly. I'll try to figure it out.`
      : `New secret rule picked. Shh, don't tell me! I'll work it out from examples.`);
  });
  document.getElementById("say-friendly").addEventListener("click", () => teacherResolve && teacherResolve(true));
  document.getElementById("say-grumpy").addEventListener("click", () => teacherResolve && teacherResolve(false));

  // Chapter cards
  const types = document.getElementById("types");
  types.innerHTML = CATALOG.slice(1).map((t, i) => `<a href="../topic.html?t=${t.id}" style="--c:${t.color}"><div class="card">
      <span class="ti">${ML.icon(t.icon)}</span><b>Chapter ${i + 1}: ${t.name}</b><span class="muted" style="font-weight:600">${t.tagline}</span></div></a>`).join("");

  reset(false);
  (function loop() { draw(); requestAnimationFrame(loop); })();
})();
