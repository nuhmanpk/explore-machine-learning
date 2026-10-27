// Puppy Trainer — RLHF with a puppy.
// 1) you pick which of two tricks earns a treat, 2) a Bradley–Terry "treat predictor"
// learns your taste, 3) the puppy's softmax policy practises with REINFORCE + a KL leash.
(function () {
  const core = window.RlhfCore;
  const $ = (id) => document.getElementById(id);
  const { TRICKS, N, A, trickOf, fastOf, INIT, softmax, sample, trickProbs } = core;
  const state = {
    stage: 1,
    taste: "calm",
    w: new Array(N + 1).fill(0),
    picks: 0,
    accHist: [],
    logits: INIT.slice(),
    baseline: 0,
    prac: 0,
    avgHist: [],
    rewards: [],
    practising: false,
    auto: false,
    pair: null,
    current: null, // action shown in practice
    ckpts: [],
    replay: null,
    fly: null, // treat animation
  };

  // ---------- model bits ----------
  const rmRaw = (a) => core.rmRaw(state.w, a);
  const rm = (a) => rmRaw(a) + ($("bug").checked && fastOf(a) ? 3 : 0);
  const humanU = (a) => core.humanU(state.taste, a);
  const heldAcc = () => core.heldAcc(state.w, state.taste);
  function trainRM(win, lose) {
    state.data = state.data || [];
    state.data.push([win, lose]);
    core.trainRM(state.w, state.data);
  }

  // ---------- canvases ----------
  const PW = 720, PH = 330;
  const pup = ML.setupCanvas($("pup"), PW, PH);
  const bowls = ML.setupCanvas($("bowls"), 360, 190);
  const pol = ML.setupCanvas($("policy"), 360, 190);
  const chart = ML.setupCanvas($("chart"), 300, 90);

  // ---------- puppy drawing ----------
  const BROWN = "#c98a4b", DARK = "#7a4a22", INK = "#1f2140";
  function drawBone(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = "#f3d9a4"; c.strokeStyle = INK; c.lineWidth = 2;
    c.beginPath(); c.roundRect(-14, -4, 28, 8, 4); c.fill(); c.stroke();
    for (const [bx, by] of [[-14, -4], [-14, 4], [14, -4], [14, 4]]) { c.beginPath(); c.arc(bx, by, 5, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.restore();
  }
  function drawPuppy(c, x, y, a, t, scale = 1, mood = null) {
    const tr = TRICKS[trickOf(a)].k;
    const sp = fastOf(a) ? 3 : 1;
    const ph = (t * sp) % 1; // 0..1 loop
    const s2 = Math.sin(ph * Math.PI * 2);
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    // ground shadow
    c.fillStyle = "rgba(31,33,64,.12)"; c.beginPath(); c.ellipse(0, 52, 60, 10, 0, 0, Math.PI * 2); c.fill();
    let dy = 0, rot = 0, sx = 1, sitDown = 0, paw = 0, mouth = 0, dig = 0, shoe = false;
    if (tr === "jump") dy = -Math.abs(Math.sin(ph * Math.PI)) * 60;
    if (tr === "roll") rot = ph * Math.PI * 2;
    if (tr === "spin") sx = Math.cos(ph * Math.PI * 2);
    if (tr === "sit") sitDown = 1;
    if (tr === "paw") { sitDown = 1; paw = 0.5 + 0.5 * s2; }
    if (tr === "bark") mouth = s2 > 0 ? 1 : 0.2;
    if (tr === "chew") { shoe = true; dy = Math.abs(s2) * 4; }
    if (tr === "dig") { dig = 1; }
    c.translate(0, dy + (sitDown ? 6 : 0) + dig * 10);
    c.rotate(rot);
    c.scale(sx || 0.05, 1);
    c.lineWidth = 3; c.strokeStyle = INK;
    // tail (wags faster when happy)
    const wag = Math.sin(t * Math.PI * 2 * (mood === "happy" ? 10 : 3)) * 0.6;
    c.save(); c.translate(-38, sitDown ? 18 : 0); c.rotate(-0.8 + wag);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-18, -10, -22, -26); c.stroke(); c.restore();
    // legs
    c.fillStyle = BROWN;
    const legs = sitDown ? [[-28, 30], [-14, 32]] : [[-28, 28], [-14, 28], [18, 28], [30, 28]];
    for (const [lx, ly] of legs) { c.beginPath(); c.roundRect(lx - 5, ly - 14 + dig * Math.max(0, s2) * 6, 10, 24, 5); c.fill(); c.stroke(); }
    if (sitDown) {
      // front legs, one maybe raised for "paw"
      c.beginPath(); c.roundRect(14, 12, 10, 34, 5); c.fill(); c.stroke();
      c.save(); c.translate(30, 14); c.rotate(-paw * 1.4); c.beginPath(); c.roundRect(-5, 0, 10, 32, 5); c.fill(); c.stroke(); c.restore();
    }
    // body
    c.save(); c.rotate(sitDown ? -0.45 : 0);
    c.beginPath(); c.ellipse(0, 6, 44, 26, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = "#f3e3cf"; c.beginPath(); c.ellipse(8, 14, 22, 12, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    // head
    const hx = 44, hy = sitDown ? -34 : -18;
    c.fillStyle = BROWN;
    c.beginPath(); c.arc(hx, hy, 24, 0, Math.PI * 2); c.fill(); c.stroke();
    // ears
    c.fillStyle = DARK;
    c.beginPath(); c.ellipse(hx - 16, hy - 4, 8, 16, 0.4, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(hx + 16, hy - 4, 8, 16, -0.4, 0, Math.PI * 2); c.fill(); c.stroke();
    // snout
    c.fillStyle = "#f3e3cf"; c.beginPath(); c.ellipse(hx + 6, hy + 9, 13, 9, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(hx + 10, hy + 5, 4, 0, Math.PI * 2); c.fill();
    // eyes
    c.beginPath(); c.arc(hx - 6, hy - 6, 3.5, 0, Math.PI * 2); c.arc(hx + 10, hy - 7, 3.5, 0, Math.PI * 2); c.fill();
    // mouth
    if (mouth > 0.5) { c.fillStyle = "#ff6b81"; c.beginPath(); c.ellipse(hx + 6, hy + 17, 6, 5, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    if (shoe) {
      c.fillStyle = "#e0533d";
      c.beginPath(); c.roundRect(hx - 2, hy + 12, 30, 12, 6); c.fill(); c.stroke();
      c.fillStyle = "#fff"; c.fillRect(hx + 4, hy + 14, 10, 3);
    }
    c.restore();
    // extras in world space
    if (tr === "bark" && mouth > 0.5) {
      c.strokeStyle = "#e0533d"; c.lineWidth = 3;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + (70 + i * 10) * scale, y + (dy - 22) * scale, (10 + i * 8) * scale, -0.6, 0.6); c.stroke(); }
    }
    if (tr === "dig") {
      c.fillStyle = "#8b5a2b";
      for (let i = 0; i < 6; i++) {
        const p = (ph * 2 + i / 6) % 1;
        c.beginPath(); c.arc(x - (40 + p * 70) * scale, y + (40 - Math.sin(p * Math.PI) * 50) * scale, 4 * scale, 0, Math.PI * 2); c.fill();
      }
    }
    if (fastOf(a)) {
      c.strokeStyle = ML.cssVar("--muted"); c.lineWidth = 2;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x - 90 * scale, y + (-20 + i * 16) * scale); c.lineTo(x - 70 * scale, y + (-20 + i * 16) * scale); c.stroke(); }
    }
    if (mood === "meh") {
      c.fillStyle = ML.cssVar("--muted"); c.font = `700 ${22 * scale}px Fredoka, sans-serif`; c.textAlign = "center";
      c.fillText("hmm…", x, y - 100 * scale);
    }
  }
  const label = (a) => `${TRICKS[trickOf(a)].name}${fastOf(a) ? " (fast)" : ""}`;

  // ---------- stage 1: pick ----------
  function newPair() {
    // Show what the puppy currently tends to do, so feedback is "on-policy".
    const p = softmax(state.logits);
    let a = sample(p), b = sample(p), tries = 0;
    while (trickOf(b) === trickOf(a) && tries++ < 20) b = sample(p);
    if (trickOf(b) === trickOf(a)) b = ((trickOf(a) + 1 + Math.floor(Math.random() * (N - 1))) % N) * 2 + Math.round(Math.random());
    state.pair = { a, b, picked: null, t0: performance.now() };
  }
  function pick(side) {
    const P = state.pair;
    if (!P || P.picked !== null) return;
    P.picked = side;
    const win = side === 0 ? P.a : P.b, lose = side === 0 ? P.b : P.a;
    // Did the predictor already agree? (honest held-out-style check before training)
    trainRM(win, lose);
    state.picks++;
    state.accHist.push(heldAcc());
    state.fly = { from: [PW / 2, PH - 10], to: [side === 0 ? PW * 0.25 + 40 : PW * 0.75 + 40, 120], t: 0 };
    $("st-picks").textContent = state.picks;
    $("st-acc").innerHTML = `${state.accHist.at(-1)}<small>%</small>`;
    if (state.picks >= 5) $("practise").disabled = false;
    if (!state.auto) ML.say(state.picks < 5
      ? `Treat for <b>${label(win)}</b>! ${5 - state.picks} more and the predictor can start helping.`
      : `The predictor now guesses your taste right <b>${state.accHist.at(-1)}%</b> of the time. Try <b>Practise</b>!`);
    renderInside();
    setTimeout(newPair, state.auto ? 350 : 1100);
  }
  $("pup").addEventListener("pointerdown", (e) => {
    if (state.stage !== 1) return;
    const p = ML.canvasPoint($("pup"), e, PW, PH);
    pick(p.x < PW / 2 ? 0 : 1);
  });

  // ---------- stage 3: practise ----------
  const CK_AT = [0, 20, 100, 500, 1500, 4000];
  function practiseStep() {
    const p = softmax(state.logits);
    const a = sample(p);
    const r = rm(a);
    const beta = +$("kl").value * 0.04;
    state.baseline = core.reinforce(state.logits, state.baseline, a, r, p, beta).baseline;
    state.rewards.push(r);
    if (state.rewards.length > 50) state.rewards.shift();
    state.prac++;
    state.current = a;
    if (CK_AT.includes(state.prac) || (state.prac === 1 && !state.ckpts.length)) addCk();
    return a;
  }
  function addCk() {
    state.ckpts.push({ n: state.prac, logits: state.logits.slice(), avg: avgTreat() });
    renderCk();
  }
  // Average *true* (auto-human) happiness of the current policy, so hacking shows up.
  const avgTreat = (logits = state.logits) => { const p = softmax(logits); return p.reduce((s, x, a) => s + x * humanU(a), 0); };
  function renderCk() {
    const host = $("ckpts");
    host.innerHTML = state.ckpts.map((c, i) => `<button class="ckpt ${state.replay === c ? "on" : ""}" data-i="${i}"><canvas width="216" height="90"></canvas><b>Practice ${c.n}</b>Happiness ${c.avg.toFixed(1)}</button>`).join("") +
      (state.replay ? `<button class="ckpt" data-live="1" style="display:grid;place-items:center"><b>Back to live</b>${ML.icon("play")}</button>` : "");
    host.querySelectorAll(".ckpt[data-i]").forEach((b) => {
      const c = state.ckpts[+b.dataset.i];
      miniBars(b.querySelector("canvas"), trickProbs(c.logits).t);
      b.onclick = () => { state.replay = c; state.replayT = 0; stopPractice(); renderCk(); ML.say(`This is the puppy after <b>${c.n}</b> practices.`); };
    });
    const live = host.querySelector("[data-live]");
    if (live) live.onclick = () => { state.replay = null; renderCk(); };
  }
  function miniBars(cv, t) {
    const c = cv.getContext("2d");
    c.clearRect(0, 0, 216, 90);
    t.forEach((v, i) => {
      c.fillStyle = TRICKS[i].naughty ? ML.cssVar("--bad") : ML.cssVar("--good");
      const h = v * 80;
      c.fillRect(8 + i * 25, 86 - h, 18, h);
    });
  }
  function stopPractice() {
    state.practising = false;
    $("practise").innerHTML = `${ML.icon("play")} Practise`;
  }
  $("practise").addEventListener("click", () => {
    if (state.practising) return stopPractice();
    setStage(3);
    state.replay = null;
    state.practising = true;
    $("practise").innerHTML = `${ML.icon("pause")} Pause`;
    if (!state.ckpts.length) addCk();
    ML.say($("bug").checked
      ? `Uh-oh, the predictor has a bug: it gives extra treats for anything <b>FAST</b>. Watch the puppy…`
      : `The puppy practises alone. The predictor hands out <b>pretend treats</b>. No human needed!`);
  });
  $("reset").addEventListener("click", () => {
    stopPractice();
    state.logits = INIT.slice();
    state.prac = 0; state.baseline = 0; state.avgHist = []; state.rewards = []; state.ckpts = []; state.replay = null;
    renderCk();
    ML.say(`A brand-new, slightly naughty puppy. The predictor still remembers your treats.`);
  });
  $("bug").addEventListener("change", () => ML.say($("bug").checked
    ? `Buggy predictor ON: it thinks fast = great. Practise and watch the puppy <b>cheat</b>.`
    : `Predictor fixed.`));
  ML.bindRange("#kl", (v) => (v < 0.02 ? "loose" : v < 0.1 ? "a bit" : "a lot"), () => {});
  $("taste").addEventListener("change", (e) => { state.taste = e.target.value; ML.say(`Auto-human's secret taste changed. Give some treats so the predictor can learn it.`); });
  $("auto").addEventListener("click", () => {
    state.auto = !state.auto;
    $("auto").innerHTML = state.auto ? `${ML.icon("pause")} Stop` : `${ML.icon("play")} Auto-human`;
    if (state.auto) { setStage(1); ML.say(`Auto-human is choosing with a <b>secret taste</b>. Watch the predictor's bowls fill up.`); }
  });
  function setStage(s) {
    state.stage = s;
    document.querySelectorAll("#steps button").forEach((b) => b.classList.toggle("on", +b.dataset.s === s));
    if (s !== 3) stopPractice();
  }
  document.querySelectorAll("#steps button").forEach((b) => b.addEventListener("click", () => {
    const s = +b.dataset.s;
    if (s === 3 && state.picks < 5) return ML.toast("Give at least 5 treats first");
    setStage(s);
    if (s === 2) ML.say(`The predictor only saw your picks. Each bowl shows how many treats it <b>thinks</b> you'd give for that trick.`);
  }));

  // ---------- inside card ----------
  let insideAt = 0;
  function renderInside() {
    const host = $("inside");
    if (state.stage === 3 && state.current !== null) {
      const a = state.current, p = softmax(state.logits)[a], r = rm(a);
      host.innerHTML = `<div>${ML.icon("dice")} Puppy picked <b>${label(a).toUpperCase()}</b> (${Math.round(p * 100)}% chance)</div>
        <div class="arrow">${ML.icon("arrow-down")}</div>
        <div>${ML.icon("target")} Predictor guesses <b>${r.toFixed(1)}</b> treats ${$("bug").checked && fastOf(a) ? "<b style='color:var(--bad)'>(+3 bug bonus!)</b>" : ""}</div>
        <div class="arrow">${ML.icon("arrow-down")}</div>
        <div>${ML.icon(r > state.baseline ? "arrow-up" : "arrow-down")} Better than usual (${state.baseline.toFixed(1)})? <b style="color:${r > state.baseline ? "var(--good)" : "var(--bad)"}">${r > state.baseline ? "do it MORE" : "do it LESS"}</b></div>`;
    } else if (state.picks) {
      const top = state.w.slice(0, N).map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
      host.innerHTML = `<div>${ML.icon("gift")} You gave <b>${state.picks}</b> treats</div>
        <div class="arrow">${ML.icon("arrow-down")}</div>
        <div>${ML.icon("target")} Predictor thinks you love <b>${TRICKS[top[0][1]].name}</b> and dislike <b>${TRICKS[top[N - 1][1]].name}</b>${state.w[N] > 0.3 ? ", and like FAST" : state.w[N] < -0.3 ? ", and like slow" : ""}</div>`;
    }
  }

  // ---------- draw ----------
  function drawStage(now) {
    const c = pup.ctx;
    c.clearRect(0, 0, PW, PH);
    c.fillStyle = ML.cssVar("--bg-2"); c.fillRect(0, PH - 70, PW, 70);
    const t = now / 1400;
    if (state.stage === 1 && state.pair) {
      const P = state.pair;
      [P.a, P.b].forEach((a, i) => {
        const x = i === 0 ? PW * 0.25 : PW * 0.75;
        const mood = P.picked === null ? null : P.picked === i ? "happy" : "meh";
        if (P.picked === i) { c.fillStyle = ML.cssVar("--accent-soft") || "rgba(0,0,0,.05)"; c.beginPath(); c.roundRect(x - 170, 20, 340, PH - 30, 20); c.fill(); }
        drawPuppy(c, x, PH - 120, a, t + i * 0.37, 1, mood);
        c.fillStyle = ML.cssVar("--ink"); c.font = "700 18px Fredoka, sans-serif"; c.textAlign = "center";
        c.fillText(label(a), x, PH - 22);
      });
      c.strokeStyle = ML.cssVar("--line"); c.setLineDash([6, 6]); c.beginPath(); c.moveTo(PW / 2, 20); c.lineTo(PW / 2, PH - 10); c.stroke(); c.setLineDash([]);
      if (P.picked === null) { c.fillStyle = ML.cssVar("--muted"); c.font = "800 13px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("TAP THE BETTER PUPPY", PW / 2, 18); }
    } else {
      const logits = state.replay ? state.replay.logits : state.logits;
      if (state.replay) {
        state.replayT = (state.replayT || 0) + 1;
        if (!state.replayA || state.replayT % 70 === 0) state.replayA = sample(softmax(logits));
      }
      const a = state.replay ? state.replayA : state.current ?? sample(softmax(logits));
      if (state.current === null && !state.replay) state.current = a;
      drawPuppy(c, PW * 0.42, PH - 120, a, t, 1.2, state.stage === 3 && rm(a) > state.baseline ? "happy" : null);
      c.fillStyle = ML.cssVar("--ink"); c.font = "700 20px Fredoka, sans-serif"; c.textAlign = "center";
      c.fillText(label(a), PW * 0.42, PH - 20);
      // predictor's verdict
      const r = rm(a);
      const n = ML.clamp(Math.round(r + 1.5), 0, 6);
      for (let i = 0; i < n; i++) drawBone(c, PW * 0.78 + (i % 3) * 36, 80 + Math.floor(i / 3) * 26, 0.9);
      c.fillStyle = ML.cssVar("--muted"); c.font = "800 12px Nunito, sans-serif";
      c.fillText(state.replay ? `PRACTICE ${state.replay.n}` : "PREDICTOR'S TREATS", PW * 0.82, 48);
    }
    if (state.fly) {
      const f = state.fly;
      f.t += 0.05;
      const k = Math.min(1, f.t);
      const x = ML.lerp(f.from[0], f.to[0], k), y = ML.lerp(f.from[1], f.to[1], k) - Math.sin(k * Math.PI) * 80;
      drawBone(c, x, y, 1.2);
      if (f.t >= 1.2) state.fly = null;
    }
  }
  function drawBowls() {
    const c = bowls.ctx;
    c.clearRect(0, 0, 360, 190);
    const bw = 360 / (N + 1);
    const vals = state.w.map((v) => 1 / (1 + Math.exp(-v)));
    [...TRICKS, { name: "Fast" }].forEach((tr, i) => {
      const x = i * bw + bw / 2, v = vals[i];
      c.fillStyle = ML.cssVar("--bg-2"); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 2;
      c.beginPath(); c.roundRect(x - 14, 30, 28, 110, 8); c.fill(); c.stroke();
      c.fillStyle = v > 0.5 ? ML.cssVar("--good") : ML.cssVar("--bad");
      const h = Math.abs(v - 0.5) * 2 * 50;
      c.fillRect(x - 11, v > 0.5 ? 85 - h : 85, 22, h);
      c.fillStyle = ML.cssVar("--muted"); c.fillRect(x - 14, 84, 28, 2);
      c.save(); c.translate(x, 150); c.rotate(-0.6);
      c.fillStyle = ML.cssVar("--ink"); c.font = "700 11px Nunito, sans-serif"; c.textAlign = "right"; c.fillText(tr.name, 4, 8);
      c.restore();
    });
  }
  function drawPolicy() {
    const c = pol.ctx;
    c.clearRect(0, 0, 360, 190);
    const logits = state.replay ? state.replay.logits : state.logits;
    const { t, fast } = trickProbs(logits);
    const bw = 360 / (N + 1);
    [...t, fast].forEach((v, i) => {
      const x = i * bw + bw / 2;
      c.fillStyle = ML.cssVar("--bg-2"); c.fillRect(x - 14, 30, 28, 110);
      c.fillStyle = i === N ? ML.cssVar("--warn") : TRICKS[i].naughty ? ML.cssVar("--bad") : ML.cssVar("--good");
      const h = v * 110;
      c.fillRect(x - 14, 140 - h, 28, h);
      c.fillStyle = ML.cssVar("--ink"); c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText(Math.round(v * 100) + "%", x, 24);
      c.save(); c.translate(x, 150); c.rotate(-0.6);
      c.font = "700 11px Nunito, sans-serif"; c.textAlign = "right"; c.fillText(i === N ? "Fast" : TRICKS[i].name, 4, 8);
      c.restore();
    });
  }
  function drawChart() {
    const c = chart.ctx;
    c.clearRect(0, 0, 300, 90);
    const h = state.avgHist;
    c.fillStyle = ML.cssVar("--muted"); c.font = "800 10px Nunito, sans-serif"; c.textAlign = "left";
    c.fillText("HOW HAPPY YOU'D BE", 2, 10);
    if (h.length < 2) return;
    const lo = -2, hi = 3;
    c.strokeStyle = ML.cssVar("--line"); c.beginPath(); const z = 90 - ((0 - lo) / (hi - lo)) * 76; c.moveTo(0, z); c.lineTo(300, z); c.stroke();
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 2.5; c.beginPath();
    h.forEach((v, i) => { const x = (i / (h.length - 1)) * 300, y = 90 - ((ML.clamp(v, lo, hi) - lo) / (hi - lo)) * 76; i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
  }

  let frames = 0, hacked = false, celebrated = false;
  function loop(now) {
    frames++;
    if (state.auto && state.stage === 1 && state.pair && state.pair.picked === null && now - state.pair.t0 > 450) {
      pick(humanU(state.pair.a) >= humanU(state.pair.b) ? 0 : 1);
    }
    if (state.practising) {
      const per = state.prac < 30 ? (frames % 20 === 0 ? 1 : 0) : 6;
      for (let i = 0; i < per; i++) practiseStep();
      if (frames % 6 === 0) {
        state.avgHist.push(avgTreat());
        if (state.avgHist.length > 300) state.avgHist.shift();
        $("st-prac").textContent = state.prac;
        $("st-avg").textContent = (state.rewards.reduce((a, b) => a + b, 0) / Math.max(1, state.rewards.length)).toFixed(1);
      }
      const ft = trickProbs(state.logits).fast;
      if ($("bug").checked && ft > 0.8 && !hacked) { hacked = true; ML.say(`The puppy found the bug: it does everything <b>super fast</b> to get treats, even if you'd hate it! That's <b>reward hacking</b>. Slide <b>Stay like its old self</b> up.`); }
      if (!$("bug").checked && avgTreat() > 1 && state.prac > 200 && !celebrated) { celebrated = true; ML.confetti(); ML.say(`Good puppy! It now mostly does tricks <b>you</b> like, after practising with the predictor's pretend treats.`); }
      if (state.prac >= 6000) stopPractice();
    }
    if (frames % 10 === 0) renderInside();
    drawStage(now);
    drawBowls();
    drawPolicy();
    drawChart();
    requestAnimationFrame(loop);
  }
  newPair();
  requestAnimationFrame(loop);
})();
