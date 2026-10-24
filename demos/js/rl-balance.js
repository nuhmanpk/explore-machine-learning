// Balance the Pole — CartPole physics + tabular Q-learning, plus a "you try" mode.
(function () {
  // ---------- physics (same constants as Gymnasium CartPole-v1) ----------
  const G = 9.8, MC = 1, MP = 0.1, L = 0.5, FORCE = 10, TAU = 0.02;
  const XMAX = 2.4, TMAX = (12 * Math.PI) / 180, MAXT = 500;
  function physics(s, f) {
    const [, xd, t, td] = s;
    const ct = Math.cos(t), st = Math.sin(t), tm = MC + MP;
    const tmp = (f + MP * L * td * td * st) / tm;
    const ta = (G * st - ct * tmp) / (L * (4 / 3 - (MP * ct * ct) / tm));
    const xa = tmp - (MP * L * ta * ct) / tm;
    s[0] += TAU * xd; s[1] += TAU * xa; s[2] += TAU * td; s[3] += TAU * ta;
  }
  const failed = (s) => Math.abs(s[0]) > XMAX || Math.abs(s[2]) > TMAX;
  const randStart = (r = 0.05) => [0, 0, 0, 0].map(() => ML.rand(-r, r));

  // ---------- Q-table: cart velocity × angle × angular velocity (cart position ignored) ----------
  // Tuned offline: solves (20-try average ≥ 475 steps) in 212–305 tries over 8 seeds.
  const BINS = [1, 4, 8, 10], LIMS = [XMAX, 2, TMAX, 2.5];
  const NS = BINS.reduce((a, b) => a * b, 1);
  function binOf(i, v) { return Math.max(0, Math.min(BINS[i] - 1, Math.floor(((v + LIMS[i]) / (2 * LIMS[i])) * BINS[i]))); }
  function disc(s) { let k = 0; for (let i = 0; i < 4; i++) k = k * BINS[i] + binOf(i, s[i]); return k; }
  const decay = (min, ep) => Math.max(min, Math.min(1, 1 - Math.log10((ep + 1) / 25)));
  const greedy = (Q, k) => (Q[k * 2 + 1] > Q[k * 2] ? 1 : Q[k * 2 + 1] < Q[k * 2] ? 0 : Math.random() < 0.5 ? 0 : 1);

  const CHECKS = [1, 10, 25, 50, 100, 200, 400];
  const SPEEDS = [
    { name: "0.5× slow-mo", sps: 25 }, // half of Real time (50)
    { name: "Real time", sps: 50 },
    { name: "Fast", sps: 500 },
    { name: "Super fast", sps: 2500 },
    { name: "Turbo", sps: 0 },
  ];
  const TURBO_STEPS = 20000;

  // ---------- state ----------
  let mode = "you";
  let Q = new Float32Array(NS * 2);
  let ep = 0, cur = { s: randStart(), T: 0 }, lens = [], best = 0, solved = false;
  let ckpts = [], bestCk = null, ckDirty = true;
  let running = false, speed = 3, epsManual = 0.1, auto = true;
  let last = { k: 0, a: -1, explored: false };
  let pendingReset = false, holdUntil = 0;
  let replay = null, wasRunning = false;
  let wind = null; // {dir, t0}
  const human = { s: randStart(0.02), T: 0, active: false, over: false, left: false, right: false, best: 0, tries: 0, slow: false };
  let lastSay = 0;

  const el = (id) => document.getElementById(id);
  const overlay = el("overlay");
  function showOverlay(msg, ms = 1600) {
    overlay.textContent = msg;
    overlay.classList.add("show");
    clearTimeout(showOverlay.t);
    showOverlay.t = setTimeout(() => overlay.classList.remove("show"), ms);
  }
  function talk(msg, important) {
    const now = performance.now();
    if (important || now - lastSay > 900) { ML.say(msg); lastSay = now; }
  }
  const secs = (T) => (T * TAU).toFixed(1);

  // ---------- learning ----------
  function learnStep() {
    const s = cur.s, k = disc(s);
    const eps = auto ? decay(0.01, ep) : epsManual;
    const alpha = decay(0.1, ep);
    const explored = Math.random() < eps;
    const a = explored ? (Math.random() < 0.5 ? 0 : 1) : greedy(Q, k);
    physics(s, a ? FORCE : -FORCE);
    cur.T++;
    const done = failed(s);
    const nk = disc(s);
    const target = done ? 0 : 1 + 0.99 * Math.max(Q[nk * 2], Q[nk * 2 + 1]);
    Q[k * 2 + a] += alpha * (target - Q[k * 2 + a]);
    last = { k, a, explored };
    if (done || cur.T >= MAXT) { endEpisode(done); return true; }
    return false;
  }

  function endEpisode(fell) {
    const T = cur.T;
    lens.push(T);
    ep++;
    const slow = SPEEDS[speed].sps && SPEEDS[speed].sps <= 50;
    const newBest = T > best;
    if (newBest) {
      best = T;
      bestCk = { label: "Best try", n: ep, Q: Q.slice(), len: T, upto: lens.length };
      ckDirty = true;
    }
    if (CHECKS.includes(ep)) {
      ckpts.push({ label: `Try ${ep}`, n: ep, Q: Q.slice(), len: T, upto: lens.length });
      ckDirty = true;
    }
    if (slow) {
      if (!fell) talk(`10 seconds! I balanced it all the way! 🎉`, true);
      else if (newBest && ep > 1) talk(`New record: <b>${secs(T)} s</b>! The pushes I just did get higher scores now.`, true);
      else if (T < 50) talk(`Whoops, it fell after ${secs(T)} s. I'll lower the scores of the pushes that led to that.`);
      else talk(`Fell after ${secs(T)} s. Let me try again — try #${ep + 1}!`);
      showOverlay(fell ? `Fell after ${secs(T)} s` : "Made it to 10 s!");
    }
    const recent = lens.slice(-20);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (!solved && lens.length >= 20 && avg >= 475) {
      solved = true;
      ML.confetti();
      ML.xray.offer("I learned to balance! X-ray my brain");
      showOverlay(`Robo learned to balance in ${ep} tries!`, 2600);
      ML.say(`I've got it! 🎉 My last 20 tries averaged <b>${secs(avg)} s</b>. It took me <b>${ep} tries</b> and lots of falls. Watch me at normal speed now!`);
      lastSay = performance.now() + 3000;
      if (speed >= 2) setSpeed(1);
    }
    if (slow) { pendingReset = true; holdUntil = performance.now() + 600; }
    else cur = { s: randStart(), T: 0 };
  }

  function resetBrain() {
    Q.fill(0); ep = 0; lens = []; best = 0; solved = false; ckpts = []; bestCk = null; ckDirty = true;
    cur = { s: randStart(), T: 0 }; last = { k: 0, a: -1, explored: false }; pendingReset = false;
    stopReplay();
  }

  // ---------- replay a checkpoint brain ----------
  function startReplay(ck) {
    if (replay) stopReplay();
    wasRunning = running;
    running = false;
    replay = { ck, s: randStart(0.03), T: 0, a: -1, done: false, endAt: 0 };
    renderPlay();
    ckDirty = true;
    talk(`This is my brain after <b>${ck.n} ${ck.n === 1 ? "try" : "tries"}</b>. Let's see how long it can balance…`, true);
  }
  function stopReplay() {
    if (!replay) return;
    replay = null;
    running = wasRunning;
    renderPlay();
    ckDirty = true;
  }
  function replayStep() {
    const r = replay;
    if (r.done) return;
    const k = disc(r.s);
    r.a = greedy(r.ck.Q, k);
    physics(r.s, r.a ? FORCE : -FORCE);
    r.T++;
    if (failed(r.s) || r.T >= MAXT) {
      r.done = true;
      r.ck.replayLen = r.T;
      r.endAt = performance.now() + 1300;
      ckDirty = true;
      const good = r.T >= MAXT;
      showOverlay(good ? "Balanced the whole 10 s!" : `Fell after ${secs(r.T)} s`);
      talk(good
        ? `After ${r.ck.n} tries my brain balances the whole 10 seconds! 🏆`
        : r.ck.n < 30 ? `See? After only ${r.ck.n} ${r.ck.n === 1 ? "try" : "tries"} I fell after ${secs(r.T)} s. I hadn't learned much yet!`
        : `After ${r.ck.n} tries I lasted ${secs(r.T)} s. Getting there!`, true);
    }
  }

  // ---------- human ----------
  function humanStep() {
    const h = human;
    const f = (h.right ? FORCE : 0) - (h.left ? FORCE : 0);
    physics(h.s, f);
    h.T++;
    if (failed(h.s) || h.T >= MAXT) {
      h.active = false; h.over = true; h.tries++;
      const T = h.T, made = T >= MAXT;
      const rec = T > h.best;
      if (rec) h.best = T;
      showOverlay(made ? "You did it! 10 seconds!" : `Fell after ${secs(T)} s`);
      if (made) { ML.confetti(); ML.say("WOW! You balanced it for 10 whole seconds! 🎉 You're a natural. Now let's see if I can learn it."); }
      else if (h.tries === 1) ML.say(`Whoa, it fell after ${secs(T)} s! It's <b>hard</b>, right? Push again to retry.`);
      else if (h.tries >= 3 && h.tries % 3 === 0) ML.say(`Your best is ${secs(h.best)} s. Tricky! Now tap <b>Robo learns</b> — I'll start knowing nothing and learn by falling over.`);
      else if (rec) ML.say(`New record: <b>${secs(T)} s</b>! Little pushes, early, work best.`);
      else ML.say(`${secs(T)} s. Push again to have another go!`);
      updateHumanStats();
    }
  }
  function humanPress(dir, down) {
    if (dir < 0) human.left = down; else human.right = down;
    if (down && !human.active) {
      human.s = randStart(0.02); human.T = 0; human.active = true; human.over = false;
      if (human.tries === 0) ML.say("Go go go! Keep the pole standing up!");
    }
    el("push-l").classList.toggle("pressed", human.left);
    el("push-r").classList.toggle("pressed", human.right);
  }
  function updateHumanStats() {
    el("h-now").innerHTML = `${secs(human.T)}<small>s</small>`;
    el("h-best").innerHTML = `${secs(human.best)}<small>s</small>`;
  }

  // ---------- drawing: scene ----------
  const sceneCv = el("scene");
  const W = 640, H = 300;
  const ctx = ML.setupCanvas(sceneCv, W, H).ctx;
  const PPM = 120, RAIL = 262, PL = 170;

  function shown() {
    if (replay) return { s: replay.s, T: replay.T, push: replay.done ? 0 : replay.a === 1 ? 1 : replay.a === 0 ? -1 : 0, label: `Replay: brain after ${replay.ck.n} ${replay.ck.n === 1 ? "try" : "tries"}` };
    if (mode === "you") return { s: human.s, T: human.T, push: (human.right ? 1 : 0) - (human.left ? 1 : 0), label: human.active ? "" : human.over ? "Push to try again" : "Push to start" };
    return { s: cur.s, T: cur.T, push: last.a === 1 ? 1 : last.a === 0 ? -1 : 0, label: running ? `Try #${ep + 1}` : ep ? "Paused" : "Press Practise" };
  }

  function drawScene(now) {
    const v = shown();
    const s = v.s;
    const c = (n) => ML.cssVar(n);
    const ink = c("--ink");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = c("--canvas-bg");
    ctx.fillRect(0, 0, W, H);

    // timer bar
    const prog = Math.min(1, v.T / MAXT);
    ctx.fillStyle = c("--line");
    ctx.beginPath(); ctx.roundRect(20, 16, W - 40, 10, 5); ctx.fill();
    ctx.fillStyle = prog >= 1 ? c("--good") : c("--rl");
    ctx.beginPath(); ctx.roundRect(20, 16, Math.max(10, (W - 40) * prog), 10, 5); ctx.fill();
    ctx.fillStyle = ink;
    ctx.font = "700 26px Fredoka, Nunito, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`${secs(v.T)} s`, 20, 34);
    ctx.font = "800 13px Nunito, sans-serif";
    ctx.fillStyle = c("--muted");
    ctx.textAlign = "right";
    ctx.fillText(v.label, W - 20, 40);

    // rail + bumpers
    const x0 = W / 2 - XMAX * PPM, x1 = W / 2 + XMAX * PPM;
    ctx.fillStyle = c("--line");
    ctx.fillRect(10, RAIL, W - 20, 6);
    ctx.fillStyle = c("--ink-2");
    ctx.fillRect(x0, RAIL, x1 - x0, 4);
    [x0, x1].forEach((bx) => {
      ctx.fillStyle = c("--bad");
      ctx.beginPath(); ctx.roundRect(bx - 4, RAIL - 22, 8, 26, 3); ctx.fill();
    });

    const cx = W / 2 + s[0] * PPM;
    const pivotY = RAIL - 46;

    // safe-zone fan
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = c("--good");
    ctx.beginPath(); ctx.moveTo(cx, pivotY);
    ctx.arc(cx, pivotY, PL + 18, -Math.PI / 2 - TMAX, -Math.PI / 2 + TMAX);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // wind streaks
    if (wind) {
      const t = (now - wind.t0) / 700;
      if (t > 1) wind = null;
      else {
        ctx.strokeStyle = c("--sup"); ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.globalAlpha = 1 - t;
        for (let i = 0; i < 5; i++) {
          const y = 70 + i * 22;
          const sx = wind.dir > 0 ? cx - 200 + t * 240 : cx + 200 - t * 240;
          ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + wind.dir * 50, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // pole (drawn before cart so it appears to stick out of it)
    const tipX = cx + Math.sin(s[2]) * PL, tipY = pivotY - Math.cos(s[2]) * PL;
    const danger = Math.min(1, Math.abs(s[2]) / TMAX);
    ctx.lineCap = "round";
    ctx.strokeStyle = ink; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = danger > 0.75 ? c("--bad") : "#c98b52"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.fillStyle = c("--lang"); ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tipX, tipY, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // cart
    ctx.fillStyle = ink;
    [-22, 22].forEach((dx) => { ctx.beginPath(); ctx.arc(cx + dx, RAIL - 10, 10, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = c("--card");
    [-22, 22].forEach((dx) => { ctx.beginPath(); ctx.arc(cx + dx, RAIL - 10, 3.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = c("--rl"); ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(cx - 40, pivotY, 80, 32, 10); ctx.fill(); ctx.stroke();
    // face: eyes look toward the pole tip
    const look = Math.max(-1, Math.min(1, s[2] / TMAX));
    [-13, 13].forEach((dx) => {
      ctx.fillStyle = c("--card");
      ctx.beginPath(); ctx.arc(cx + dx, pivotY + 13, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(cx + dx + look * 2.5, pivotY + 11, 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath();
    if (danger > 0.75) ctx.arc(cx, pivotY + 27, 4, 0, Math.PI * 2);
    else ctx.arc(cx, pivotY + 19, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // pivot
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx, pivotY, 4, 0, Math.PI * 2); ctx.fill();

    // push arrow
    if (v.push) {
      const ax = cx - v.push * 56, ay = pivotY + 16;
      ctx.fillStyle = v.push > 0 ? c("--rl") : c("--sup");
      ctx.strokeStyle = ink; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(ax + v.push * 14, ay);
      ctx.lineTo(ax - v.push * 2, ay - 11);
      ctx.lineTo(ax - v.push * 2, ay - 5);
      ctx.lineTo(ax - v.push * 16, ay - 5);
      ctx.lineTo(ax - v.push * 16, ay + 5);
      ctx.lineTo(ax - v.push * 2, ay + 5);
      ctx.lineTo(ax - v.push * 2, ay + 11);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  // ---------- drawing: chart ----------
  const chartCv = el("chart");
  const CW = 640, CH = 140;
  const cctx = ML.setupCanvas(chartCv, CW, CH).ctx;
  function drawChart() {
    cctx.clearRect(0, 0, CW, CH);
    const top = 10, bottom = CH - 6;
    const Y = (steps) => bottom - (steps / MAXT) * (bottom - top);
    if (!lens.length) {
      cctx.fillStyle = ML.cssVar("--muted");
      cctx.font = "700 14px Nunito, sans-serif"; cctx.textAlign = "center"; cctx.textBaseline = "middle";
      cctx.fillText(mode === "you" ? "Robo's practice will show up here" : "Press Practise to start", CW / 2, CH / 2);
      return;
    }
    const n = lens.length, B = Math.min(n, 200), per = n / B;
    const bw = (CW - 8) / Math.max(B, 40);
    for (let b = 0; b < B; b++) {
      const i0 = Math.floor(b * per), i1 = Math.max(i0 + 1, Math.floor((b + 1) * per));
      let sum = 0; for (let i = i0; i < i1; i++) sum += lens[i];
      const v = sum / (i1 - i0);
      cctx.fillStyle = v >= MAXT ? ML.cssVar("--good") : ML.cssVar("--rl");
      cctx.globalAlpha = 0.75;
      cctx.fillRect(4 + b * bw, Y(v), Math.max(1, bw - 1), bottom - Y(v));
    }
    cctx.globalAlpha = 1;
    // goal line
    cctx.strokeStyle = ML.cssVar("--good"); cctx.setLineDash([6, 5]); cctx.lineWidth = 2;
    cctx.beginPath(); cctx.moveTo(4, Y(MAXT)); cctx.lineTo(CW - 4, Y(MAXT)); cctx.stroke(); cctx.setLineDash([]);
    // moving average (last 20 tries)
    cctx.strokeStyle = ML.cssVar("--ink"); cctx.lineWidth = 2.5;
    cctx.beginPath();
    for (let b = 0; b < B; b++) {
      const i = Math.max(1, Math.floor((b + 1) * per));
      const win = lens.slice(Math.max(0, i - 20), i);
      const avg = win.reduce((a, x) => a + x, 0) / win.length;
      const x = 4 + b * bw + bw / 2;
      b ? cctx.lineTo(x, Y(avg)) : cctx.moveTo(x, Y(avg));
    }
    cctx.stroke();
  }

  // ---------- checkpoints ----------
  const ckHost = el("ckpts");
  function drawThumb(canvas, ck) {
    const t = ML.setupCanvas(canvas, 108, 40).ctx;
    const data = lens.slice(0, ck.upto);
    const n = data.length, B = Math.min(n, 54), per = n / B;
    const bw = 108 / Math.max(B, 12);
    for (let b = 0; b < B; b++) {
      const i0 = Math.floor(b * per), i1 = Math.max(i0 + 1, Math.floor((b + 1) * per));
      let sum = 0; for (let i = i0; i < i1; i++) sum += data[i];
      const v = sum / (i1 - i0), h = (v / MAXT) * 36;
      t.fillStyle = b === B - 1 ? ML.cssVar("--rl") : ML.cssVar("--muted");
      t.globalAlpha = b === B - 1 ? 1 : 0.5;
      t.fillRect(b * bw, 40 - h - 2, Math.max(1, bw - 1), h + 2);
    }
  }
  function renderCkpts() {
    ckDirty = false;
    const list = ckpts.slice();
    if (bestCk && !list.some((c) => c.n === bestCk.n)) list.push(bestCk);
    if (!list.length) { ckHost.innerHTML = `<div class="empty">Checkpoints appear here as Robo practises.</div>`; return; }
    ckHost.innerHTML = "";
    list.forEach((ck) => {
      const b = document.createElement("button");
      b.className = "ckpt" + (replay && replay.ck === ck ? " on playing" : "");
      b.innerHTML = `<canvas></canvas><b>${ck === bestCk ? `Best (try ${ck.n})` : ck.label}</b>
        <small>lasted ${secs(ck.len)} s</small>
        <small>${ck.replayLen != null ? `replay: ${secs(ck.replayLen)} s` : "tap to replay"}</small>`;
      drawThumb(b.querySelector("canvas"), ck);
      b.addEventListener("click", () => { if (replay && replay.ck === ck) stopReplay(); else startReplay(ck); });
      ckHost.appendChild(b);
    });
  }

  // ---------- "what's happening inside" ----------
  const heatCv = el("heat");
  const HW = 280, HH = 236;
  const hctx = ML.setupCanvas(heatCv, HW, HH).ctx;
  function describe(v, small, big, word, still) {
    const d = v > 0 ? "right" : "left";
    if (Math.abs(v) < small) return still;
    return `${word} ${d} ${Math.abs(v) < big ? "slowly" : "fast"}`;
  }
  function updateInside() {
    const v = shown();
    const s = v.s;
    const Qn = replay ? replay.ck.Q : Q;
    const deg = (s[2] * 180) / Math.PI;
    el("i-lean").textContent = Math.abs(deg) < 1 ? "standing straight" : `leaning ${deg > 0 ? "right" : "left"} ${Math.abs(deg) < 5 ? "a little" : "a lot"}`;
    el("i-fall").textContent = describe(s[3], 0.15, 0.8, "tipping", "barely moving");
    el("i-cart").textContent = describe(s[1], 0.15, 0.8, "rolling", "standing still");
    const k = disc(s);
    const ql = Qn[k * 2], qr = Qn[k * 2 + 1];
    const m = Math.max(1, Math.abs(ql), Math.abs(qr));
    [["q-l", ql], ["q-r", qr]].forEach(([id, q]) => {
      const row = el(id);
      row.querySelector(".fill").style.width = `${Math.max(0, (q / m) * 100)}%`;
      row.querySelector(".num").textContent = q.toFixed(1);
      row.classList.toggle("win", q === Math.max(ql, qr) && ql !== qr);
    });
    let msg;
    if (ql === 0 && qr === 0) msg = "I've never seen this wobble before, so I'll guess!";
    else if (!replay && last.explored && running) msg = "Curious moment! I pushed a random way to learn something new.";
    else {
      const right = qr > ql;
      msg = `My table says push ${right ? "right" : "left"} is worth <b>${Math.max(ql, qr).toFixed(1)}</b> vs ${right ? "left" : "right"} ${Math.min(ql, qr).toFixed(1)} → push <b>${right ? "RIGHT" : "LEFT"}</b>`;
    }
    el("i-decide").innerHTML = msg;
    drawHeat(Qn, s);
  }
  function drawHeat(Qn, s) {
    hctx.clearRect(0, 0, HW, HH);
    const ml = 22, mb = 22, cols = BINS[2], rows = BINS[3];
    const cw = (HW - ml - 4) / cols, ch = (HH - mb - 4) / rows;
    const vb = binOf(1, s[1]);
    const left = ML.cssVar("--sup"), right = ML.cssVar("--rl"), line = ML.cssVar("--line");
    for (let a = 0; a < cols; a++) for (let w = 0; w < rows; w++) {
      const k = (vb * cols + a) * rows + w;
      const ql = Qn[k * 2], qr = Qn[k * 2 + 1];
      const x = ml + a * cw, y = 4 + (rows - 1 - w) * ch;
      if (ql === 0 && qr === 0) { hctx.fillStyle = line; hctx.globalAlpha = 0.6; }
      else { hctx.fillStyle = qr > ql ? right : left; hctx.globalAlpha = 0.25 + 0.75 * Math.min(1, Math.abs(qr - ql) / 4); }
      hctx.beginPath(); hctx.roundRect(x + 1.5, y + 1.5, cw - 3, ch - 3, 4); hctx.fill();
    }
    hctx.globalAlpha = 1;
    // current state marker
    const a = binOf(2, s[2]), w = binOf(3, s[3]);
    const mx = ml + a * cw + cw / 2, my = 4 + (rows - 1 - w) * ch + ch / 2;
    hctx.fillStyle = ML.cssVar("--card"); hctx.strokeStyle = ML.cssVar("--ink"); hctx.lineWidth = 3;
    hctx.beginPath(); hctx.arc(mx, my, 6, 0, Math.PI * 2); hctx.fill(); hctx.stroke();
    // axes
    hctx.fillStyle = ML.cssVar("--muted"); hctx.font = "800 11px Nunito, sans-serif";
    hctx.textAlign = "center"; hctx.textBaseline = "bottom";
    hctx.fillText("← leaning left · leaning right →", ml + (HW - ml) / 2, HH - 4);
    hctx.save(); hctx.translate(12, (HH - mb) / 2 + 2); hctx.rotate(-Math.PI / 2);
    hctx.textBaseline = "middle";
    hctx.fillText("← tipping left · right →", 0, 0);
    hctx.restore();
  }

  function updateRoboStats() {
    el("s-ep").textContent = ep.toLocaleString();
    el("s-now").innerHTML = `${secs(cur.T)}<small>s</small>`;
    el("s-best").innerHTML = `${secs(best)}<small>s</small>`;
    const r = lens.slice(-20);
    el("s-avg").innerHTML = `${secs(r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0)}<small>s</small>`;
  }

  // ---------- main loop ----------
  let acc = 0, lastT = performance.now(), lastUi = 0, lastFastSay = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (replay) {
      if (replay.done) { if (now > replay.endAt) stopReplay(); }
      else {
        acc += dt * 50;
        while (acc >= 1 && !replay.done) { acc -= 1; replayStep(); }
      }
    } else if (mode === "you") {
      if (human.active) {
        acc += dt * (human.slow ? 25 : 50);
        while (acc >= 1 && human.active) { acc -= 1; humanStep(); }
      } else acc = 0;
    } else if (running) {
      if (pendingReset) {
        if (now >= holdUntil) { pendingReset = false; cur = { s: randStart(), T: 0 }; }
      } else if (!SPEEDS[speed].sps) {
        for (let i = 0; i < TURBO_STEPS && running && !pendingReset; i++) learnStep();
      } else {
        acc += dt * SPEEDS[speed].sps;
        let guard = 0;
        while (acc >= 1 && !pendingReset && guard++ < 5000) { acc -= 1; learnStep(); }
        if (guard >= 5000) acc = 0;
      }
      if (speed >= 2 && !solved && now - lastFastSay > 1300) {
        lastFastSay = now;
        const r = lens.slice(-20);
        const avg = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
        talk(`Practising ${SPEEDS[speed].name.toLowerCase()}! Try #${ep.toLocaleString()}. Lately I balance about <b>${secs(avg)} s</b>. ${avg < 50 ? "Lots of falling…" : avg < 250 ? "Getting better!" : "Almost there!"}`);
      }
    } else acc = 0;

    drawScene(now);
    if (now - lastUi > 110) {
      lastUi = now;
      if (mode === "robo") { updateInside(); updateRoboStats(); }
      else updateHumanStats();
      drawChart();
      if (ckDirty) renderCkpts();
    }
    requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  const playBtn = el("play");
  function renderPlay() {
    playBtn.innerHTML = running ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Practise`;
  }
  function setSpeed(v) {
    const input = el("speed");
    input.value = v;
    input.dispatchEvent(new Event("input"));
  }
  function setMode(m) {
    mode = m;
    document.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    el("you-card").classList.toggle("hidden", m !== "you");
    el("robo-card").classList.toggle("hidden", m !== "robo");
    el("inside-card").classList.toggle("hidden", m !== "robo");
    stopReplay();
    if (m === "you") { running = false; renderPlay(); }
    human.left = human.right = false;
    acc = 0;
  }
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => {
    setMode(b.dataset.mode);
    if (b.dataset.mode === "robo") ML.say(ep ? "Back to practice! Press <b>Practise</b> to keep learning." : "My turn! I know <b>nothing</b> about balancing. I only get a treat for every moment the pole stays up. Press <b>Practise</b>!");
    else ML.say("Your turn! Press ← or → to push the cart. Keep the pole up!");
  }));

  playBtn.addEventListener("click", () => {
    if (replay) { wasRunning = !wasRunning; stopReplay(); return; }
    running = !running;
    renderPlay();
    if (running && ep === 0) talk("Here I go! My cheat-sheet is empty, so I'll push randomly and see what happens…", true);
  });
  el("reset").addEventListener("click", () => {
    resetBrain();
    ML.say("Poof! I forgot everything. Empty cheat-sheet again!");
  });
  el("wind").addEventListener("click", () => {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const s = replay ? replay.s : mode === "you" ? human.s : cur.s;
    s[3] += dir * 0.9;
    wind = { dir, t0: performance.now() };
    talk(solved ? "Whoosh! A gust of wind! Watch me save it…" : "Whoosh! A gust of wind! That makes it even harder.", true);
  });
  // The wind button lives in the Robo card; in "you" mode a gust can come from the W key.
  ML.bindRange("#speed", (v) => SPEEDS[v].name, (v) => { speed = v; acc = 0; if (pendingReset && v >= 2) { pendingReset = false; cur = { s: randStart(), T: 0 }; } });
  ML.bindRange("#eps", (v) => (auto ? "Auto" : Math.round(v * 100) + "%"), (v) => { epsManual = v; });
  const autoBtn = el("auto");
  const epsInput = el("eps");
  function setAuto(v) {
    auto = v;
    autoBtn.classList.toggle("on", v);
    autoBtn.innerHTML = `${ML.icon("wand")} Auto curiosity: ${v ? "on" : "off"}`;
    document.querySelector('[data-for="eps"]').textContent = v ? "Auto" : Math.round(epsManual * 100) + "%";
  }
  autoBtn.addEventListener("click", () => setAuto(!auto));
  epsInput.addEventListener("input", () => setAuto(false));
  setAuto(true);

  el("slowmo").addEventListener("click", (e) => {
    human.slow = !human.slow;
    e.currentTarget.classList.toggle("on", human.slow);
    e.currentTarget.innerHTML = `${ML.icon("clock")} Slow motion: ${human.slow ? "on" : "off"}`;
  });
  const bindHold = (id, dir) => {
    const b = el(id);
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); humanPress(dir, true); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => b.addEventListener(ev, () => humanPress(dir, false)));
  };
  bindHold("push-l", -1);
  bindHold("push-r", 1);
  const KEYS = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    if (e.key === "w" || e.key === "W") { el("wind").click(); return; }
    const dir = KEYS[e.key];
    if (dir === undefined) return;
    if (mode !== "you") return;
    e.preventDefault();
    if (!e.repeat) humanPress(dir, true);
  });
  window.addEventListener("keyup", (e) => {
    const dir = KEYS[e.key];
    if (dir !== undefined && mode === "you") humanPress(dir, false);
  });

  document.addEventListener("themechange", () => { ckDirty = true; });

  // ---------- Model X-ray ----------
  const DEG = 180 / Math.PI;
  const seenStates = [];
  setInterval(() => {
    if (mode !== "you" && cur && cur.s) { seenStates.push([cur.s[1], cur.s[2] * DEG, cur.s[3]]); if (seenStates.length > 500) seenStates.shift(); }
  }, 50);
  const qAt = (QQ, x) => { const k = disc([0, x[0], x[1] / DEG, x[2]]); return [QQ[k * 2], QQ[k * 2 + 1]]; };
  ML.xray.register({
    title: "Robo's balancing cheat-sheet",
    kind: "Q-table",
    summary: () => `learned from ${ep} tries`,
    size: () => `${NS} situations × 2 pushes`,
    stats: () => [["Tries", ep], ["Best", `${secs(best)} s`], ["Choices", "push left / right"]],
    inputs: [
      { name: "Cart speed", min: -2, max: 2, describe: (v) => (Math.abs(v) < 0.3 ? "still" : v < 0 ? "rolling left" : "rolling right") },
      { name: "Pole lean", min: -12, max: 12, describe: (v) => (Math.abs(v) < 1 ? "upright" : v < 0 ? `${(-v).toFixed(0)}° left` : `${v.toFixed(0)}° right`) },
      { name: "Tipping speed", min: -2.5, max: 2.5, describe: (v) => (Math.abs(v) < 0.3 ? "steady" : v < 0 ? "falling left" : "falling right") },
    ],
    outputs: [{ name: "Push left", color: ML.cssVar("--sup") }, { name: "Push right", color: ML.cssVar("--rl") }],
    predict: (x) => qAt(replay ? replay.ck.Q : Q, x),
    samples: () => seenStates,
    current: () => (cur && cur.s ? [cur.s[1], cur.s[2] * DEG, cur.s[3]] : null),
    brainHeight: 250,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), W = cv.width, H = cv.height, QQ = replay ? replay.ck.Q : Q;
      const panels = BINS[1], pw = (W - 20) / panels, top = 26, cols = BINS[2], rows = BINS[3];
      const names = ["rolling left fast", "rolling left", "rolling right", "rolling right fast"];
      for (let v = 0; v < panels; v++) {
        const x0 = 10 + v * pw, cw = (pw - 16) / cols, ch = (H - top - 26) / rows;
        c.font = "800 12px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted"); c.textAlign = "center";
        c.fillText("cart " + names[v], x0 + pw / 2, 16);
        for (let a = 0; a < cols; a++)
          for (let w = 0; w < rows; w++) {
            const k = (v * cols + a) * rows + w, l = QQ[k * 2], r = QQ[k * 2 + 1];
            if (l === 0 && r === 0) { c.fillStyle = ML.cssVar("--line"); c.globalAlpha = 0.4; }
            else { c.fillStyle = r > l ? ML.cssVar("--rl") : ML.cssVar("--sup"); c.globalAlpha = 0.3 + Math.min(0.7, Math.abs(r - l) / 8); }
            c.fillRect(x0 + a * cw + 0.5, top + (rows - 1 - w) * ch + 0.5, cw - 1, ch - 1);
          }
        c.globalAlpha = 1;
        c.fillText("← lean left · lean right →", x0 + pw / 2, H - 8);
      }
    },
    brainCaption: "Four little maps, one for each cart speed. Across = how far the pole leans, up = tipping right faster. Orange = push right, blue = push left. See the diagonal? Robo pushes towards the side the pole is falling.",
    notes: ["The pole's whole world is squeezed into 320 boxes. In each box Robo keeps just two numbers: how good pushing left is, and how good pushing right is."],
  });
  ML.xray.button(el("play").parentElement);

  renderPlay();
  requestAnimationFrame(frame);
})();
