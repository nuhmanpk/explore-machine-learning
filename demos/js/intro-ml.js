// What is ML? — a crowd of 24 monsters. Robo learns a hidden rule with logistic regression, one tapped example at a time,
// and after every lesson the WHOLE crowd changes its mind in a ripple. The look → guess → check → tweak loop lights up.
(function () {
  const core = window.IntroMLCore;
  const { RULES, RULE_TEXT, makeMonster, TEST, vec, sigmoid } = core;
  const W = 640, H = 390;
  const COLS = 8, ROWS = 3, CW = W / COLS, CH = 100, TOP = 14, SCALE = 0.34;
  const cvEl = document.getElementById("cv");
  const cv = ML.setupCanvas(cvEl, W, H);
  const ctx = cv.ctx;

  const FEATURES = [
    { key: "size", name: "Big", icon: "plus" },
    { key: "blue", name: "Blue", icon: "eye" },
    { key: "spiky", name: "Spiky", icon: "star" },
    { key: "eyes", name: "Many eyes", icon: "eye" },
  ];
  const state = {
    rule: "big",
    w: [0, 0, 0, 0],
    b: 0,
    lr: 2.5,
    n: 0,
    history: [],
    monster: null,
    crowd: [],
    selected: null,
    hover: -1,
    dance: 0,
    flipped: 0,
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

  const predict = (m, w = state.w, b = state.b) => core.predict(m, w, b);
  const testScore = (w = state.w, b = state.b) => core.testScore(state.rule, w, b);

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

  // ---------- the crowd ----------
  const now = () => performance.now();
  const cellPos = (i) => [(i % COLS) * CW + CW / 2, TOP + Math.floor(i / COLS) * CH + CH / 2 + 4];
  function newCrowd() {
    const rule = RULES[state.rule];
    let crowd;
    for (let tries = 0; tries < 50; tries++) {
      crowd = Array.from({ length: COLS * ROWS }, () => makeMonster());
      if (!rule) break;
      const yes = crowd.filter(rule).length; // keep the crowd mixed so the rule is visible
      if (yes >= 8 && yes <= 16) break;
    }
    const t = now();
    crowd.forEach((m, i) => { m.shown = 0.5; m.target = 0.5; m.flipAt = 0; m.flash = 0; m.born = t + i * 28; m.taught = false; m.label = null; });
    return crowd;
  }
  // final = count by where each guess is heading (for the number boxes); otherwise by the face on screen right now
  const crowdRight = (final) => {
    if (state.rule === "me") return null;
    const rule = RULES[state.rule];
    return state.crowd.filter((m) => { const p = final ? m.target : m.shown; return (p > 0.5) === rule(m) && Math.abs(p - 0.5) > 0.02; }).length;
  };
  const moodOf = (p) => (p > 0.56 ? "friendly" : p < 0.44 ? "grumpy" : null);
  // after a lesson: every monster gets a new guess, rippling outward from the one that was tapped
  function refreshCrowd(fromIdx) {
    const [fx, fy] = cellPos(fromIdx), t = now();
    let changed = 0;
    state.crowd.forEach((m, i) => {
      const old = moodOf(m.shown);
      m.target = predict(m);
      const [x, y] = cellPos(i);
      m.flipAt = t + Math.hypot(x - fx, y - fy) * 1.6;
      if (moodOf(m.target) !== old && moodOf(m.target)) { changed++; m.flash = m.flipAt; }
    });
    return changed;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const t = now();
    // stage floor
    ctx.fillStyle = ML.cssVar("--bg-2");
    ctx.beginPath(); ctx.roundRect(0, TOP - 8, W, ROWS * CH + 16, 18); ctx.fill();
    const good = ML.cssVar("--good"), bad = ML.cssVar("--bad"), acc = ML.cssVar("--accent");
    const rule = RULES[state.rule];
    state.crowd.forEach((m, i) => {
      // glide the shown guess toward the target once the ripple reaches this monster
      if (t >= m.flipAt) m.shown += (m.target - m.shown) * 0.22;
      const [x, y] = cellPos(i);
      const age = Math.max(0, Math.min(1, (t - m.born) / 450));
      if (age <= 0) return;
      const pop = age < 1 ? 1 + 0.12 * Math.sin(age * Math.PI) - (1 - age) * 0.9 : 1;
      const dance = state.dance && t - state.dance < 3200 ? Math.abs(Math.sin((t - state.dance) / 170 + i * 0.6)) * 16 : 0;
      const hov = state.hover === i && !state.busy ? 1.14 : 1;
      const mood = moodOf(m.shown);
      const conf = Math.abs(m.shown - 0.5) * 2;
      // glow under the monster: green = friendly guess, red = grumpy guess
      if (mood) {
        const g = ctx.createRadialGradient(x, y, 4, x, y, 48);
        const c = mood === "friendly" ? good : bad;
        g.addColorStop(0, c + "55");
        g.addColorStop(1, c + "00");
        ctx.globalAlpha = 0.35 + 0.65 * conf;
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 48, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // little burst when the monster changes its mind
      if (m.flash && t - m.flash < 500 && t >= m.flash) {
        const k = (t - m.flash) / 500;
        ctx.strokeStyle = (moodOf(m.target) === "friendly" ? good : bad); ctx.lineWidth = 4 * (1 - k); ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.arc(x, y, 18 + k * 34, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(0, -dance);
      drawMonster(ctx, m, x, y, SCALE * pop * hov, mood);
      ctx.restore();
      if (m.taught) { // a star for every monster Robo was shown, coloured by the answer
        ctx.font = "900 15px Nunito, sans-serif"; ctx.textAlign = "center";
        ctx.fillStyle = m.label ? good : bad; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
        ctx.strokeText("★", x + 24, y - 30); ctx.fillText("★", x + 24, y - 30);
      }
      if (state.selected === m) {
        ctx.save(); ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t / 60; ctx.strokeStyle = acc; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(x - CW / 2 + 5, y - 52, CW - 10, 104, 14); ctx.stroke(); ctx.restore();
      }
      if (state.hover === i && !state.busy && !m.taught) {
        ctx.fillStyle = acc; ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(state.rule === "me" ? "tap to teach" : "tap to ask", x, y + 50);
      }
    });

    // bottom strip: how many does Robo get right?
    const sy = TOP + ROWS * CH + 22;
    const right = crowdRight();
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.fillStyle = ML.cssVar("--ink");
    ctx.font = "800 17px Nunito, sans-serif";
    if (!state.n) ctx.fillText("I don't know anything yet. Tap a monster to teach me!", 8, sy);
    else if (right === null) ctx.fillText(`I've seen ${state.n} example${state.n > 1 ? "s" : ""}. Faces show my guesses!`, 8, sy);
    else ctx.fillText(`Robo gets ${right} of ${state.crowd.length} right`, 8, sy);
    if (right !== null) {
      const bx = 8, by = sy + 10, bw = W - 16;
      ctx.fillStyle = ML.cssVar("--bg-2"); ctx.beginPath(); ctx.roundRect(bx, by, bw, 14, 7); ctx.fill();
      ctx.fillStyle = right >= state.crowd.length * 0.9 ? good : acc;
      ctx.beginPath(); ctx.roundRect(bx, by, Math.max(14, bw * right / state.crowd.length), 14, 7); ctx.fill();
    }
    if (state.celebrated && rule) {
      ctx.textAlign = "right"; ctx.fillStyle = good; ctx.font = "800 15px Nunito, sans-serif";
      ctx.fillText(`Secret rule: ${RULE_TEXT[state.rule]}`, W - 8, sy);
    }
    if (state.viewing) {
      ctx.fillStyle = acc; ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(`Brain shown on the right: after ${state.viewing.n} example${state.viewing.n > 1 ? "s" : ""}`, 8, sy + 44);
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
    const cr = crowdRight(true);
    document.getElementById("st-last").innerHTML = !state.n || cr === null ? "–" : `${cr}<small>/${state.crowd.length}</small>`;
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
  async function lesson(m, forced) {
    if (state.busy) return;
    state.busy = true;
    state.viewing = null;
    state.selected = null;
    document.getElementById("teach").classList.remove("show");
    const fast = state.auto && state.n > 6;
    const T = fast ? 0.35 : 1;
    const idx = state.crowd.indexOf(m);
    state.monster = m;
    state.guess = predict(m);
    state.truth = null;
    setStage("look");
    renderInside();
    renderCheckpoints();
    await sleep(350 * T);

    setStage("guess");
    if (!fast) ML.say(state.n === 0 ? `My brain is empty, so my guess for this one is a <b>coin flip</b>.` : `For this one I guess <b>${state.guess > 0.5 ? "friendly" : "grumpy"}</b> (${Math.round(Math.max(state.guess, 1 - state.guess) * 100)}% sure)…`);
    await sleep(450 * T);

    state.truth = forced !== undefined ? forced : RULES[state.rule](m);
    m.taught = true; m.label = state.truth;
    setStage("check");
    const right = (state.guess > 0.5) === state.truth;
    state.history.push(right);
    if (!fast) ML.say(right ? `Yes! I was right.` : `Oops! It was <b>${state.truth ? "friendly" : "grumpy"}</b>. Time to fix my brain.`);
    await sleep(550 * T);

    setStage("tweak");
    // one step of gradient descent on cross-entropy
    state.b = core.sgdStep(state.w, state.b, m, state.guess, state.truth, state.lr);
    state.n++;
    const changed = refreshCrowd(idx);
    renderWeights();
    renderInside();
    addCheckpoint();
    if (!fast) {
      const big = FEATURES.map((f, i) => [f.name, state.w[i]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      ML.say(changed > 0 ? `Look at the crowd! After that <b>one</b> example, <b>${changed}</b> monster${changed > 1 ? "s" : ""} changed their face. I haven't seen them, but my brain changed, so my guesses changed too. ${state.n >= 3 ? `Now I think <b>${big[0].toLowerCase()}</b> matters most.` : ""}` : `My brain moved a little, but no faces changed yet.`);
    }
    await sleep(700 * T);
    renderStats();
    setStage("done");
    state.busy = false;

    const t = testScore();
    if (t !== null && t >= (state.rule === "bigblue" ? 88 : 95) && !state.celebrated) {
      state.celebrated = true;
      state.dance = now();
      stopAuto();
      ML.confetti();
      ML.say(`The whole crowd is right! I scored <b>${t}%</b> on monsters I've never seen, after just <b>${state.n}</b> examples. The secret rule was "<b>${RULE_TEXT[state.rule]}</b>". Nobody told me!`);
      return;
    }
    if (state.auto) setTimeout(teachRandom, fast ? 80 : 400);
  }
  // pick a monster Robo hasn't been shown yet
  function teachRandom() {
    if (state.busy) return;
    const left = state.crowd.filter((m) => !m.taught);
    if (!left.length) { state.crowd = newCrowd(); return teachRandom(); }
    const m = left[Math.floor(Math.random() * left.length)];
    if (state.rule === "me") return pickForTeacher(m);
    lesson(m);
  }
  function pickForTeacher(m) {
    state.selected = m;
    document.getElementById("teach").classList.add("show");
    ML.say(`You're the teacher! Is this monster <b>friendly</b> or <b>grumpy</b>? Think of your own rule and answer honestly.`);
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
    state.selected = null;
    state.dance = 0;
    state.crowd = newCrowd();
    document.getElementById("teach").classList.remove("show");
    state.guess = null;
    state.celebrated = false;
    setStage(null);
    renderWeights();
    renderStats();
    renderCheckpoints();
    document.getElementById("inside").innerHTML = `<span class="muted">Tap any monster in the crowd to see Robo think.</span>`;
    if (say) ML.say(`My brain is empty again: all my "how much I care" numbers are zero, and a new crowd just arrived.`);
  }

  document.getElementById("next").addEventListener("click", () => { stopAuto(); teachRandom(); });
  document.getElementById("auto").addEventListener("click", () => {
    if (state.auto) return stopAuto();
    if (state.rule === "me") return ML.toast("In teacher mode, you answer each monster yourself");
    state.auto = true;
    document.getElementById("auto").innerHTML = `${ML.icon("pause")} Stop`;
    if (!state.busy) teachRandom();
  });
  document.getElementById("reset").addEventListener("click", () => reset());
  document.getElementById("rule").addEventListener("change", (e) => {
    state.rule = e.target.value;
    reset(false);
    ML.say(state.rule === "me"
      ? `You make up the rule! Keep it in your head, tap a monster, and answer honestly. I'll try to figure it out.`
      : `New secret rule picked. Shh, don't tell me! I'll work it out from examples.`);
  });
  document.getElementById("say-friendly").addEventListener("click", () => state.selected && lesson(state.selected, true));
  document.getElementById("say-grumpy").addEventListener("click", () => state.selected && lesson(state.selected, false));

  // tap a monster in the crowd to teach Robo with it
  const hit = (e) => {
    const p = ML.canvasPoint(cvEl, e, W, H);
    if (p.y < TOP - 4 || p.y > TOP + ROWS * CH) return -1;
    return Math.floor((p.y - TOP) / CH) * COLS + Math.floor(p.x / CW);
  };
  cvEl.style.cursor = "pointer";
  cvEl.addEventListener("pointermove", (e) => { state.hover = hit(e); });
  cvEl.addEventListener("pointerleave", () => { state.hover = -1; });
  cvEl.addEventListener("pointerdown", (e) => {
    const i = hit(e), m = state.crowd[i];
    if (!m || state.busy) return;
    stopAuto();
    if (m.taught) { ML.toast("Robo has already seen that one. Pick another!"); return; }
    if (state.rule === "me") pickForTeacher(m); else lesson(m);
  });

  // Chapter cards
  const types = document.getElementById("types");
  types.innerHTML = CATALOG.slice(1).map((t, i) => `<a href="../topic.html?t=${t.id}" style="--c:${t.color}"><div class="card">
      <span class="ti">${ML.icon(t.icon)}</span><b>Chapter ${i + 1}: ${t.name}</b><span class="muted" style="font-weight:600">${t.tagline}</span></div></a>`).join("");

  reset(false);
  (function loop() { draw(); requestAnimationFrame(loop); })();
})();
