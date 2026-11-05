// Sumo Bots — page: the ring, "you wrestle" mode (keys / joystick / drag on the ring), the self-play training loop
// (chunked per animation frame), exhibition bouts, the win-rate chart, challenges, checkpoints and the Model X-ray.
(function () {
  const S = window.SumoCore;
  const $ = (s) => document.querySelector(s);
  const AW = 540, AH = 540, CX = AW / 2, CY = AH / 2, SC = 236; // ring radius 1 = 236 px
  const arena = ML.setupCanvas($("#arena"), AW, AH);
  const chartCv = ML.setupCanvas($("#chart"), 640, 190);
  const brainCv = ML.setupCanvas($("#brain"), 280, 150);
  const ctx = arena.ctx;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PINK = "#ff5c9a", GREEN = "#2fbf62", BLUE = "#5b8cff", ORANGE = "#ff9f43";
  const SPS = 30; // simulation steps per second at 1×
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const X = (x) => CX + x * SC, Y = (y) => CY - y * SC; // world y points up, canvas y points down

  const state = {
    mode: "you", opp: "latest",
    rules: { ...S.DEFAULT_RULES },
    trainer: null, paused: false, tspeed: 6, speed: 1,
    bout: null, acc: 0, prev: null,
    you: { a: 0, b: 0, n: 0, wins: 0 }, show: { a: 0, b: 0, n: 0 },
    early: [], chuck: [], markers: [], pending: [], done: {},
    celebrated: false, seen: {}, ckTried: false, xrOpened: false, robSeen: false,
    samples: [], fx: [], shake: 0,
    lastAct: performance.now(), chartDirty: true, partner: 0,
  };
  const newTrainer = () => new S.Trainer(1 + Math.floor(Math.random() * 1e6), { rules: state.rules, mutation: +$("#mut").value, useHof: $("#hof").checked });
  state.trainer = newTrainer();
  const T = () => state.trainer;
  const lastRec = () => T().history[T().history.length - 1];
  const champ = () => T().champion;
  const champName = () => (champ() ? `Gen ${T().gen - 1} champion` : "Random rookie");

  // ---------- bouts ----------
  const randStart = () => ({ ang: Math.random(), side: Math.random(), spin: Math.random() });
  // A = the pink robot (always a robot). B = you (green), or a sparring robot (blue / orange).
  function startBout(kind, extra = {}) {
    const t = T();
    let A, B, nameA, nameB, colB;
    if (kind === "you") {
      A = state.opp === "first" && t.hof.length ? t.hof[0].brain : champ() || t.pop[0];
      nameA = state.opp === "first" && t.hof.length ? "Gen 1 rookie" : champName();
      B = "human"; nameB = "You"; colB = GREEN;
    } else if (kind === "replay") {
      A = extra.ck.brain; nameA = `${extra.ck.label} champion`;
      B = champ() || t.pop[1]; nameB = `Newest (${champName()})`; colB = BLUE;
    } else {
      if (!champ()) { A = t.pop[0]; B = t.pop[1]; nameA = "Random rookie"; nameB = "Another rookie"; colB = BLUE; }
      else {
        A = champ(); nameA = champName();
        const h = t.hof, opts = [];
        if (h.length >= 2) opts.push([h[h.length - 2].brain, `Gen ${h[h.length - 2].gen} champion`, BLUE]);
        opts.push(["chuck", "Charging Chuck", ORANGE]);
        opts.push([h[0].brain, "Gen 1 rookie", BLUE]);
        opts.push([t.pop[Math.floor(Math.random() * t.pop.length)], "A teammate", BLUE]);
        [B, nameB, colB] = opts[state.partner++ % opts.length];
      }
    }
    // the bout on screen gets its own copies of the brains, so practice behind the scenes can't disturb what we show
    const own = (x) => (x && typeof x === "object" ? S.cloneBrain(x) : x);
    const m = new S.Match(own(A), own(B), state.rules, randStart());
    state.bout = { kind, m, nameA, nameB, colB, ck: extra.ck, endAt: 0, readyUntil: performance.now() + (kind === "you" ? 900 : 300), said: false };
    state.acc = 0;
    state.prev = snap(m);
    state.fx = [];
    renderScore();
  }
  const snap = (m) => ({ ax: m.a.x, ay: m.a.y, at: m.a.th, bx: m.b.x, by: m.b.y, bt: m.b.th, R: m.R });

  // ---------- your controls: keys, joystick, drag on the ring ----------
  const keys = { left: false, right: false, up: false, down: false };
  const joy = { x: 0, y: 0, on: false };   // screen directions, -1..1
  const drag = { on: false, x: 0, y: 0 };  // a world point to drive toward
  function humanInput() {
    const m = state.bout && state.bout.m;
    if (drag.on && m) {
      const dx = drag.x - m.b.x, dy = drag.y - m.b.y, d = Math.hypot(dx, dy);
      return d < 0.03 ? { x: 0, y: 0 } : { x: (dx / d) * Math.min(1, d / 0.25), y: (dy / d) * Math.min(1, d / 0.25) };
    }
    if (joy.on) return { x: joy.x, y: -joy.y };
    let x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), y = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    const d = Math.hypot(x, y);
    return d ? { x: x / d, y: y / d } : { x: 0, y: 0 };
  }
  const keyMap = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
  const typing = (el) => el && el.closest && el.closest("input, textarea, select");
  document.addEventListener("keydown", (e) => {
    if (state.mode !== "you" || !keyMap[e.code] || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    keys[keyMap[e.code]] = true;
    poke();
    const b = state.bout;
    if (b && b.m.done && performance.now() - b.endAt > 700) startBout("you");
  });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

  const joyEl = $("#joy"), knob = joyEl.querySelector(".knob");
  function setJoy(e) {
    const r = joyEl.getBoundingClientRect(), rad = r.width / 2;
    let dx = (e.clientX - r.left - rad) / (rad * 0.7), dy = (e.clientY - r.top - rad) / (rad * 0.7);
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; }
    joy.x = dx; joy.y = dy;
    knob.style.transform = `translate(${dx * rad * 0.62}px, ${dy * rad * 0.62}px)`;
  }
  joyEl.addEventListener("pointerdown", (e) => {
    e.preventDefault(); joyEl.setPointerCapture(e.pointerId); joy.on = true; setJoy(e); poke();
    const b = state.bout;
    if (state.mode === "you" && b && b.m.done && performance.now() - b.endAt > 700) startBout("you");
  });
  joyEl.addEventListener("pointermove", (e) => { if (joy.on) setJoy(e); });
  const joyOff = () => { joy.on = false; joy.x = joy.y = 0; knob.style.transform = ""; };
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => joyEl.addEventListener(ev, joyOff));

  const arenaEl = $("#arena");
  function setDrag(e) {
    const p = ML.canvasPoint(arenaEl, e, AW, AH);
    drag.x = (p.x - CX) / SC; drag.y = -(p.y - CY) / SC;
  }
  arenaEl.addEventListener("pointerdown", (e) => {
    poke();
    if (state.mode !== "you") return;
    e.preventDefault(); arenaEl.setPointerCapture(e.pointerId); drag.on = true; setDrag(e);
    const b = state.bout;
    if (b && b.m.done && performance.now() - b.endAt > 700) startBout("you");
  });
  arenaEl.addEventListener("pointermove", (e) => { if (drag.on) setDrag(e); });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => arenaEl.addEventListener(ev, () => (drag.on = false)));

  // ---------- simulation per frame ----------
  function stepBout(dt) {
    const b = state.bout;
    if (!b) return;
    const now = performance.now();
    if (b.m.done) {
      if (b.kind !== "you" && now - b.endAt > 1700) {
        if (b.kind === "replay") startBout("replay", { ck: b.ck });
        else startBout("show");
      }
      return;
    }
    if (now < b.readyUntil) return;
    state.acc += (dt / 1000) * SPS * state.speed;
    let n = Math.floor(state.acc);
    state.acc -= n;
    n = Math.min(n, 8);
    const hin = b.kind === "you" ? humanInput() : null;
    for (let i = 0; i < n && !b.m.done; i++) {
      state.prev = snap(b.m);
      b.m.step(hin);
      if (b.m.bump > 0.35) bumpFx(b.m);
      if (b.m.t % 6 === 0) { const x = b.m.input[0]; if (x && typeof b.m.a.brain === "object") { state.samples.push(Array.from(x)); if (state.samples.length > 300) state.samples.shift(); } }
    }
    if (b.m.done) { state.prev = snap(b.m); state.acc = 0; boutOver(b); }
  }
  function bumpFx(m) {
    state.shake = reduce ? 0 : Math.min(6, 2 + m.bump * 6);
    if (reduce) return;
    const x = (m.a.x * m.b.r + m.b.x * m.a.r) / (m.a.r + m.b.r), y = (m.a.y * m.b.r + m.b.y * m.a.r) / (m.a.r + m.b.r);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.004 + Math.random() * 0.012;
      state.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 });
    }
  }

  function boutOver(b) {
    b.endAt = performance.now();
    const m = b.m, w = m.winner;
    if (b.kind === "you") {
      state.you.n++;
      if (w === 1) { state.you.b++; state.you.wins++; } else if (w === 0) state.you.a++;
      renderScore();
      const name = b.nameA, rookie = !champ() || /rookie/i.test(name);
      let msg;
      if (w === 1 && m.how === "push") msg = `<b>You pushed it out!</b> ${rookie ? "That rookie had no idea where the edge was." : `You beat the ${name}! Robots learn from losing too, so let them practise more and try again.`}`;
      else if (w === 1) msg = rookie ? `It drove out <b>all by itself</b>! A random brain doesn't know where the edge is. Let's see if practice fixes that.` : `The ${name} slid out by itself. Even champions slip!`;
      else if (w === 0 && m.how === "push") msg = `<b>Pushed out!</b> The ${name} got you. ${state.rules.icy ? "On ice you keep sliding after you let go!" : "Try dodging sideways when it charges."}`;
      else if (w === 0) msg = `Oops, you left the ring without being pushed! ${m.t > S.STEPS * S.SHRINK_AT ? "The ring was shrinking." : "Watch the straw edge."}`;
      else if (m.how === "judge") msg = `Time! Nobody fell out, and it was too close to call.`;
      else msg = `You <b>both</b> fell out! That's a draw.`;
      if (m.how === "judge" && w !== -1) msg = `Time! The judge picks whoever is nearer the middle: <b>${w === 1 ? "you" : "the robot"}</b>.`;
      const next = state.you.n === 1 ? " Press an arrow (or New bout) to go again." : state.you.n === 3 && !T().history.length ? " Now press <b>Robots learn</b> and watch them practise!" : "";
      ML.say(msg + next);
      flash(w === 1 ? "You win!" : w === 0 ? "Robot wins" : "Draw");
      if (w === 1) ML.confetti(reduce ? 0 : 30);
    } else {
      if (w === 0) state.show.a++; else if (w === 1) state.show.b++;
      state.show.n++;
      renderScore();
      if (b.kind === "replay") {
        ML.say(`${b.nameA} vs today's champion: <b>${w === 0 ? b.nameA + " wins" : w === 1 ? "today's champion wins" : "a draw"}</b>${m.how === "dodge" ? " (someone slid out alone)" : m.how === "judge" ? " on time" : ""}. ${w === 1 ? "Practice paid off!" : "Old champions can still get lucky."} It plays again from a new start.`);
      } else if (state.mode === "robo" && champ() && m.how === "dodge" && w === 0 && !state.seen.dodgeShow) {
        state.seen.dodgeShow = true;
        ML.say(`Ooh, did you see that? The champion stepped out of the way and its rival <b>slid out by itself</b>. Nobody taught it that trick!`);
      }
    }
  }

  // ---------- training (chunked per frame) ----------
  function train() {
    if (state.mode !== "robo" || state.paused) return;
    const t0 = performance.now(), budget = state.tspeed;
    let guard = 0;
    while (performance.now() - t0 < budget && guard++ < 6) {
      if (T().work(budget - (performance.now() - t0))) onGen(lastRec());
    }
  }
  const smooth3 = (arr) => arr.map((_, i) => Math.round(avg(arr.slice(Math.max(0, i - 2), i + 1))));
  const exam = (r) => (r.early + r.chuck) / 2;
  function onGen(rec) {
    state.early.push(rec.early); state.chuck.push(rec.chuck);
    state.chartDirty = true;
    const g = rec.gen;
    if (g <= 3 || g % 5 === 0) addCkpt(g, champ(), rec);
    const n = T().history.length, last3 = T().history.slice(-3);
    const e3 = avg(last3.map((r) => r.early));
    if (g === 1) ML.say(`Generation 1 done: ${S.POP * S.MATCHES} practice bouts! The best rookie becomes the first <b>champion</b>. Every robot will now practise against it too.`);
    else if (!state.celebrated && n >= 6 && e3 >= 80 && !state.pending.length) {
      state.celebrated = true;
      ML.confetti();
      ML.say(`They've learned to wrestle! The newest champion beats the first champions <b>${Math.round(e3)}%</b> of the time, after just ${g} generations of practising on each other. Wrestle it yourself: is it harder now?`);
      ML.xray.offer("They learned! X-ray the champion's brain");
    } else if (!state.seen.dodge && g > 3 && rec.dodge >= 0.3 && rec.win > 0.2) {
      state.seen.dodge = true;
      ML.say(`New trick spotted: <b>dodging</b>! ${Math.round(rec.dodge * 100)}% of wins this generation came from a rival sliding out on its own. Look at "How the robots win".`);
    } else if (!state.seen.push && g > 3 && rec.push >= 0.3) {
      state.seen.push = true;
      ML.say(`The robots are getting pushy: ${Math.round(rec.push * 100)}% of wins this generation were real <b>push-outs</b>.`);
    } else if (g % 10 === 0 && !state.pending.length) {
      ML.say(`Generation ${g}: the champion beats the first champions <b>${rec.early}%</b> and Charging Chuck <b>${rec.chuck}%</b>. ${rec.chuck < 50 ? "Chuck's charge still catches it out a lot." : rec.chuck < 80 ? "Chuck still wins now and then." : "Chuck isn't scary any more!"}`);
    }
    checkAdapt();
  }

  // ---------- challenges ----------
  const LABELS = { icy: "Icy ring", small: "Smaller ring", heavy: "Heavier opponent" };
  const TELLS = {
    icy: "Wheels barely grip and everyone keeps sliding. Old pushes overshoot!",
    small: "The ring is much smaller, so there's very little room to back away.",
    heavy: "Every opponent is now twice as heavy. Pushing it head-on hardly works!",
  };
  const DONE = {
    icy: ["The robots learned to wrestle on ice!", "wrestle the champion yourself on ice (<b>You wrestle</b>). Notice how you keep sliding after you let go of the keys."],
    small: ["The robots adapted to the smaller ring!", "watch a few bouts at <b>0.5×</b>. Do the robots stay nearer the middle and attack sooner now?"],
    heavy: ["The robots found a way to beat heavier rivals!", "look at <b>How the robots win</b>. A light robot can't out-push a heavy one, so watch for sidesteps and pushes from the side."],
  };
  function markDone(c, extra) {
    if (state.done[c]) return;
    state.done[c] = true;
    $("#c-" + c).classList.add("done");
    ML.toast(`Challenge done: ${LABELS[c]}!`);
    ML.confetti(70);
    const tr = $("#try");
    tr.innerHTML = `<b>Try this:</b> ${DONE[c][1]}`;
    tr.classList.remove("hidden");
    setTimeout(() => ML.say(`${DONE[c][0]} ${extra} <b>Try this:</b> ${DONE[c][1]}`), 300);
  }
  function checkAdapt() {
    const h = T().history;
    for (const p of state.pending.slice()) {
      const since = h.length - p.at;
      if (since < 1) continue;
      const s3 = avg(h.slice(-Math.min(3, since)).map(exam));
      if (since === 1 && p.shock && p.hurt) ML.say(`${LABELS[p.c]}: the test score fell from <b>${Math.round(p.pre)}%</b> to <b>${Math.round(exam(p.shock))}%</b> the moment the rule changed (the red ring on the chart). The robots are practising under the new rule now…`);
      if (since >= 3 && s3 >= 70) {
        state.pending.splice(state.pending.indexOf(p), 1);
        markDone(p.c, `In ${since} generations the test score got to <b>${Math.round(s3)}%</b>, and nobody re-programmed them.`);
      } else if (since >= 40) {
        state.pending.splice(state.pending.indexOf(p), 1);
        markDone(p.c, `It's a tough one: after ${since} generations they score <b>${Math.round(s3)}%</b>. Practising more still helps.`);
      }
    }
  }
  document.querySelectorAll("#chal [data-c]").forEach((b) => b.addEventListener("click", () => {
    poke();
    const c = b.dataset.c, on = !state.rules[c];
    state.rules[c] = on;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    const h = T().history, pre = h.length ? avg(h.slice(-3).map(exam)) : null;
    const shock = T().setRules(state.rules);
    const hurt = !!shock && pre !== null && exam(shock) < pre - 10;
    state.markers.push({ at: h.length, label: `${LABELS[c]} ${on ? "on" : "off"}`, shock: shock ? exam(shock) : null });
    state.chartDirty = true;
    state.pending = state.pending.filter((p) => p.c !== c);
    flash(`${LABELS[c]} ${on ? "on!" : "off"}`);
    if (on) {
      state.pending.push({ c, at: h.length, shock, pre, hurt });
      const tail = state.mode === "you" ? `${c === "heavy" ? " When you wrestle, <b>you</b> get the heavy bot!" : ""} Wrestle a bout like this, then switch to <b>Robots learn</b> to watch them adapt.` : shock ? " Watch the chart: can they adapt?" : "";
      const now = !shock ? "" : hurt ? ` Ouch: under the new rule the champion's test score drops from <b>${Math.round(pre)}%</b> to <b>${Math.round(exam(shock))}%</b>.` : ` The champion still scores <b>${Math.round(exam(shock))}%</b> under the new rule. Its old tricks still work, for now!`;
      ML.say(`<b>${LABELS[c]}</b>! ${TELLS[c]}${now}${tail}`);
    } else ML.say(`${LABELS[c]} switched off. The ring is back to normal for that rule.`);
    if (state.bout && state.bout.kind !== "replay") startBout(state.mode === "you" ? "you" : "show");
  }));

  // ---------- drawing ----------
  const dark = () => ML.isDark();
  function drawRing(c, cx, cy, sc, R0, R, icy) {
    const dk = dark();
    // the clay platform
    c.fillStyle = dk ? "#5a4632" : "#d8b98c";
    c.beginPath(); c.roundRect(cx - (R0 + 0.12) * sc, cy - (R0 + 0.12) * sc, (R0 + 0.12) * 2 * sc, (R0 + 0.12) * 2 * sc, 18 * (sc / SC)); c.fill();
    // the area that has shrunk away: a red warning band
    if (R < R0 - 0.005) {
      c.fillStyle = dk ? "rgba(255,90,90,.22)" : "rgba(230,60,60,.18)";
      c.beginPath(); c.arc(cx, cy, R0 * sc, 0, 7); c.arc(cx, cy, R * sc, 0, 7, true); c.fill();
      c.setLineDash([6, 6]); c.strokeStyle = dk ? "rgba(255,255,255,.35)" : "rgba(90,60,30,.4)"; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, R0 * sc, 0, 7); c.stroke(); c.setLineDash([]);
    }
    // the sand (or ice) inside the ring
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * sc);
    if (icy) { g.addColorStop(0, dk ? "#5f86a6" : "#e9f6ff"); g.addColorStop(1, dk ? "#3f6585" : "#bfe2f7"); }
    else { g.addColorStop(0, dk ? "#8a7553" : "#f2e2bf"); g.addColorStop(1, dk ? "#6f5c40" : "#e3cb98"); }
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * sc, 0, 7); c.fill();
    if (icy) { // a few shiny streaks
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4, r = R * sc * (0.3 + 0.12 * i); c.beginPath(); c.arc(cx, cy, r, a, a + 0.4); c.stroke(); }
    }
    // straw bale edge
    c.strokeStyle = dk ? "#b89a52" : "#c9a34f"; c.lineWidth = Math.max(3, 9 * (sc / SC));
    c.beginPath(); c.arc(cx, cy, R * sc, 0, 7); c.stroke();
    c.strokeStyle = dk ? "#7d6630" : "#9c7a2e"; c.lineWidth = Math.max(1, 1.5 * (sc / SC));
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, r1 = R * sc - 4.5 * (sc / SC), r2 = R * sc + 4.5 * (sc / SC); c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); c.stroke(); }
    // two starting lines in the middle
    c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 3 * (sc / SC);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * 0.13 * sc, cy - 0.07 * sc); c.lineTo(cx + s * 0.13 * sc, cy + 0.07 * sc); c.stroke(); }
  }
  function drawBot(x, y, th, r, col, opts = {}) {
    const px = X(x), py = Y(y), rp = r * SC;
    ctx.save();
    ctx.translate(px, py);
    if (opts.fall) { ctx.globalAlpha = Math.max(0, 1 - opts.fall); ctx.scale(1 - opts.fall * 0.5, 1 - opts.fall * 0.5); }
    // shadow
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(3, 4, rp, rp * 0.92, 0, 0, 7); ctx.fill();
    ctx.rotate(-th); // world angle → canvas angle
    // treads
    ctx.fillStyle = "#2a2d44";
    ctx.beginPath(); ctx.roundRect(-rp * 0.7, -rp * 1.02, rp * 1.4, rp * 0.32, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-rp * 0.7, rp * 0.7, rp * 1.4, rp * 0.32, 4); ctx.fill();
    // body
    ctx.fillStyle = col; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, rp * 0.86, 0, 7); ctx.fill(); ctx.stroke();
    // the pusher plate on the nose
    ctx.fillStyle = "#e8ecf6"; ctx.beginPath(); ctx.arc(0, 0, rp * 0.98, -0.75, 0.75); ctx.arc(0, 0, rp * 0.62, 0.75, -0.75, true); ctx.closePath(); ctx.fill(); ctx.stroke();
    // eyes looking forward
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(rp * 0.28, s * rp * 0.28, rp * 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = "#1f2140"; ctx.beginPath(); ctx.arc(rp * 0.34, s * rp * 0.28, rp * 0.1, 0, 7); ctx.fill();
    }
    // exhaust puffs when driving hard
    if (!reduce && opts.thr > 0.5 && !opts.fall) {
      ctx.fillStyle = "rgba(255,255,255,.55)";
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(-rp * (1.15 + Math.random() * 0.3), (Math.random() - 0.5) * rp * 0.6, rp * (0.1 + Math.random() * 0.1), 0, 7); ctx.fill(); }
    }
    ctx.restore();
    if (opts.heavy) {
      ctx.fillStyle = "#1f2140"; ctx.font = `800 ${Math.round(rp * 0.5)}px Nunito, sans-serif`; ctx.textAlign = "center";
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 3;
      ctx.strokeText("2×", px, py + rp * 0.18); ctx.fillText("2×", px, py + rp * 0.18);
    }
    if (opts.crown && !opts.fall) {
      ctx.save(); ctx.translate(px, py - rp - 6);
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#c98f00"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(-8, -4); ctx.lineTo(-3, 0); ctx.lineTo(0, -7); ctx.lineTo(3, 0); ctx.lineTo(8, -4); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  function pill(text, x, y, align = "left", bg = "rgba(31,33,64,.75)") {
    ctx.font = "800 13px Nunito, sans-serif";
    const tw = ctx.measureText(text).width + 22;
    const x0 = align === "left" ? x : align === "right" ? x - tw : x - tw / 2;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x0, y, tw, 26, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(text, x0 + 11, y + 17.5);
  }
  function draw(now) {
    const b = state.bout;
    ctx.save();
    ctx.fillStyle = ML.cssVar("--canvas-bg");
    ctx.fillRect(0, 0, AW, AH);
    if (state.shake > 0.2) { ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake); state.shake *= 0.85; }
    if (!b) { ctx.restore(); return; }
    const m = b.m, ph = m.ph, f = m.done ? 1 : Math.min(1, state.acc), p = state.prev;
    const lerp = (a, c) => a + (c - a) * f, lerpA = (a, c) => { let d = c - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };
    drawRing(ctx, CX, CY, SC, ph.R, lerp(p.R, m.R), m.rules.icy);
    // sparks
    for (const s of state.fx) {
      s.x += s.vx; s.y += s.vy; s.life -= 0.05;
      if (s.life <= 0) continue;
      ctx.fillStyle = `rgba(255,210,63,${s.life})`; ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), 2.5 + 2 * s.life, 0, 7); ctx.fill();
    }
    state.fx = state.fx.filter((s) => s.life > 0);
    const fallA = m.a.out ? Math.min(1, (now - b.endAt) / 900) : 0, fallB = m.b.out ? Math.min(1, (now - b.endAt) / 900) : 0;
    const colB = b.colB;
    drawBot(lerp(p.bx, m.b.x), lerp(p.by, m.b.y), lerpA(p.bt, m.b.th), m.b.r, colB, { thr: m.b.thr, fall: fallB, heavy: m.b.m > 1 });
    drawBot(lerp(p.ax, m.a.x), lerp(p.ay, m.a.y), lerpA(p.at, m.a.th), m.a.r, PINK, { thr: m.a.thr, fall: fallA, crown: b.kind !== "you" || !!champ() });
    // name tags
    pill(b.kind === "you" ? `You (green) vs ${b.nameA} (pink)` : `${b.nameA} (pink) vs ${b.nameB}`, 10, 10);
    // time bar
    const k = 1 - m.t / S.STEPS;
    ctx.fillStyle = "rgba(31,33,64,.5)"; ctx.beginPath(); ctx.roundRect(AW - 150, AH - 26, 138, 12, 6); ctx.fill();
    ctx.fillStyle = m.t > S.STEPS * S.SHRINK_AT ? ML.cssVar("--bad") : ML.cssVar("--good");
    ctx.beginPath(); ctx.roundRect(AW - 150, AH - 26, Math.max(12, 138 * k), 12, 6); ctx.fill();
    ctx.fillStyle = ML.cssVar("--muted"); ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "right";
    ctx.fillText(m.t > S.STEPS * S.SHRINK_AT && !m.done ? "Ring shrinking!" : "Time left", AW - 14, AH - 32);
    const tags = [state.rules.icy && "Icy", state.rules.small && "Small ring", state.rules.heavy && "Heavy rival"].filter(Boolean);
    if (tags.length) pill(tags.join(" · "), 10, AH - 36, "left", "rgba(255,92,92,.85)");
    if (state.mode === "robo" && !state.paused && b.kind !== "you") pill(`Practising behind the scenes · Gen ${T().gen}`, AW - 10, 10, "right", "rgba(124,92,255,.85)");
    // ready / result banners
    if (!m.done && now < b.readyUntil && b.kind === "you") banner(now < b.readyUntil - 400 ? "Ready…" : "Go!");
    if (m.done) {
      const w = m.winner;
      const who = w === -1 ? "Draw!" : b.kind === "you" ? (w === 1 ? "You win!" : "Robot wins!") : (w === 0 ? "Pink wins!" : `${b.kind === "replay" ? "Newest" : "Rival"} wins!`);
      const how = { push: "pushed out", dodge: "slid out alone", judge: "on time: nearer the middle", both: "both fell out" }[m.how];
      banner(who, how + (b.kind === "you" ? " · press an arrow to go again" : ""));
    }
    ctx.restore();
  }
  function banner(big, small) {
    ctx.fillStyle = "rgba(31,33,64,.72)";
    ctx.beginPath(); ctx.roundRect(CX - 170, CY - 40, 340, small ? 74 : 56, 16); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = "700 28px Fredoka, sans-serif"; ctx.fillText(big, CX, CY - 2);
    if (small) { ctx.font = "800 12px Nunito, sans-serif"; ctx.fillText(small, CX, CY + 22); }
  }
  function flash(text) {
    const o = $("#overlay");
    o.textContent = text;
    o.classList.add("show");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => o.classList.remove("show"), 1400);
  }

  function drawChart() {
    GameLab.drawChart(chartCv, [
      { values: smooth3(state.early), color: "--accent" },
      { values: smooth3(state.chuck), color: "--warn" },
    ], state.markers, 100, "%");
    // a red ring where a challenge hit: the old champion's test score under the new rule, at that moment
    const { ctx: c, w, h } = chartCv, n = Math.max(10, state.early.length);
    for (const m of state.markers) {
      if (m.shock == null) continue;
      const x = 34 + ((w - 44) * Math.max(0, m.at - 0.5)) / Math.max(1, n - 1), y = 22 + (h - 44) * (1 - m.shock / 100);
      c.strokeStyle = ML.cssVar("--bad"); c.lineWidth = 3; c.beginPath(); c.arc(x, y, 6, 0, 7); c.stroke();
    }
  }

  // the pink robot's brain, lit up by what it's thinking right now
  function drawBrain(net) {
    const { ctx: c, w, h } = brainCv;
    c.clearRect(0, 0, w, h);
    if (!net || typeof net !== "object") {
      c.fillStyle = ML.cssVar("--muted"); c.font = "700 12px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText(net === "chuck" ? "Charging Chuck has no brain: just fixed rules." : "No brain to show yet.", w / 2, h / 2);
      return;
    }
    const sz = net.sizes, L = sz.length;
    const pos = sz.map((k, l) => Array.from({ length: k }, (_, i) => [18 + ((w - 36) * l) / (L - 1), k === 1 ? h / 2 : 10 + ((h - 20) * i) / (k - 1)]));
    for (let l = 0; l < L - 1; l++)
      for (let i = 0; i < sz[l]; i++)
        for (let j = 0; j < sz[l + 1]; j++) {
          const wt = net.weight(l, i, j), sig = wt * net.acts[l][i];
          c.strokeStyle = sig > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
          c.globalAlpha = Math.min(0.85, 0.05 + Math.abs(sig) * 0.4);
          c.lineWidth = Math.min(3, 0.4 + Math.abs(sig));
          c.beginPath(); c.moveTo(...pos[l][i]); c.lineTo(...pos[l + 1][j]); c.stroke();
        }
    c.globalAlpha = 1;
    pos.forEach((layer, l) => layer.forEach(([x, y], i) => {
      const a = Math.max(-1, Math.min(1, net.acts[l][i]));
      c.fillStyle = a > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
      c.globalAlpha = 0.25 + Math.abs(a) * 0.75;
      c.beginPath(); c.arc(x, y, l === L - 1 ? 7 : 4.5, 0, 7); c.fill();
      c.globalAlpha = 1; c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1; c.stroke();
    }));
    c.fillStyle = ML.cssVar("--muted"); c.font = "800 10px Nunito, sans-serif";
    c.textAlign = "left"; c.fillText("12 senses", 4, h - 1);
    c.textAlign = "right"; c.fillText("drive", w - 4, pos[L - 1][0][1] - 10); c.fillText("turn", w - 4, pos[L - 1][1][1] + 18);
  }

  // ---------- panels ----------
  let insideTick = 0;
  function renderInside() {
    if (++insideTick % 8) return;
    const b = state.bout;
    if (!b) return;
    const m = b.m, x = m.input[0];
    const host = $("#inside-state");
    if (!x || m.t === 0) { host.innerHTML = `<div><span class="lbl">Waiting</span> for the bout to start…</div>`; drawBrain(m.a.brain); return; }
    const near = x[0] < -0.25 ? "very close" : x[0] < 0.2 ? "close" : "far away";
    const dir = x[1] > 0.7 ? "straight ahead" : x[1] < -0.5 ? "behind" : x[2] > 0 ? "to the left" : "to the right";
    const room = (v) => (v < 0.15 ? `<b style="color:var(--bad)">right at the edge!</b>` : v < 0.4 ? "near the edge" : "lots of room");
    const sp = x[7] > 0.6 ? "fast forward" : x[7] < -0.3 ? "backwards" : Math.abs(x[8]) > 0.5 ? "sliding sideways" : "slowly";
    host.innerHTML = `<div><span class="lbl">Rival</span><span>${near}, ${dir}</span></div>
      <div><span class="lbl">Me</span><span>${room(x[3])}</span></div>
      <div><span class="lbl">Rival's edge</span><span>${room(x[4])}</span></div>
      <div><span class="lbl">Moving</span><span>${sp}${x[9] > 0.8 ? " · rival aims at me!" : ""}</span></div>`;
    drawBrain(m.a.brain);
    const thr = m.a.thr, tu = m.a.turn;
    const go = thr > 0.4 ? "<b>charge forward</b>" : thr < -0.3 ? "<b>back away</b>" : "<b>creep</b>";
    const turn = tu > 0.35 ? " and <b>turn left</b>" : tu < -0.35 ? " and <b>turn right</b>" : " and <b>keep straight</b>";
    const who = typeof m.a.brain === "object" ? "Pink's brain says:" : "Pink says:";
    $("#decision").innerHTML = m.done ? `Bout over: ${m.winner === 0 ? "pink won" : m.winner === 1 ? "pink lost" : "a draw"}.` : `${ML.icon("robot")} ${who} ${go}${turn}`;
  }
  function renderWays() {
    const r = lastRec();
    const rows = [["Push-out", r ? r.push : 0, "--accent"], ["Dodge", r ? r.dodge : 0, "--good"], ["Time-up", r ? r.judge : 0, "--warn"]];
    $("#ways").innerHTML = r ? rows.map(([n, v, c]) => `<div class="qbar ${v === Math.max(...rows.map((q) => q[1])) ? "win" : ""}"><span>${n}</span><div class="track"><div class="fill" style="width:${Math.round(v * 100)}%;background:var(${c})"></div></div><span class="num">${Math.round(v * 100)}%</span></div>`).join("")
      : `<span class="muted" style="font-size:.85rem;font-weight:700">Appears after the first generation of practice. Dodge = the rival slid out without a push.</span>`;
  }
  function renderStats() {
    const t = T(), r = lastRec();
    $("#st-gen").textContent = t.gen;
    $("#st-bouts").textContent = ((t.gen - 1) * S.POP * t.matches + t.next).toLocaleString();
    $("#st-early").innerHTML = r ? `${r.early}<small>%</small>` : "–";
    $("#st-chuck").innerHTML = r ? `${r.chuck}<small>%</small>` : "–";
  }
  function renderScore() {
    const b = state.bout;
    if (!b) return;
    if (b.kind === "you") {
      $("#sc-a-name").textContent = "You"; $("#sc-a-dot").style.background = GREEN; $("#sc-b-name").textContent = b.nameA;
      $("#sc-a").textContent = state.you.b; $("#sc-b").textContent = state.you.a;
    } else {
      $("#sc-a-name").textContent = b.kind === "replay" ? "Newest champion" : "Sparring partners"; $("#sc-a-dot").style.background = b.colB;
      $("#sc-b-name").textContent = b.kind === "replay" ? b.nameA : "Champions";
      $("#sc-a").textContent = state.show.b; $("#sc-b").textContent = state.show.a;
    }
  }

  // ---------- checkpoints ----------
  function trace(brain) {
    const m = new S.Match(brain, "chuck", state.rules, S.BENCH_STARTS[1]), pa = [], pb = [];
    while (!m.done) { m.step(); if (m.t % 3 === 0) { pa.push([m.a.x, m.a.y]); pb.push([m.b.x, m.b.y]); } }
    return { pa, pb, m };
  }
  function drawCk(cv, ck) {
    const c = cv.getContext("2d"), w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h);
    const sc = 50, cx = 62, cy = h / 2;
    drawRing(c, cx, cy, sc, ck.tr.m.ph.R, ck.tr.m.ph.R, ck.rules.icy);
    for (const [pts, col] of [[ck.tr.pb, ORANGE], [ck.tr.pa, PINK]]) {
      c.strokeStyle = col; c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(cx + x * sc, cy - y * sc) : c.moveTo(cx + x * sc, cy - y * sc))); c.stroke();
      const e = pts[pts.length - 1]; if (e) { c.fillStyle = col; c.beginPath(); c.arc(cx + e[0] * sc, cy - e[1] * sc, 5, 0, 7); c.fill(); }
    }
    c.fillStyle = ML.cssVar("--ink"); c.font = "800 19px Nunito, sans-serif"; c.textAlign = "left";
    c.fillText("vs Chuck", 124, 40);
    const w0 = ck.tr.m.winner;
    c.fillStyle = w0 === 0 ? ML.cssVar("--good") : w0 === 1 ? ML.cssVar("--bad") : ML.cssVar("--muted");
    c.font = "800 26px Nunito, sans-serif"; c.fillText(w0 === 0 ? "won" : w0 === 1 ? "lost" : "draw", 124, 70);
    c.fillStyle = ML.cssVar("--muted"); c.font = "800 16px Nunito, sans-serif"; c.fillText(ck.tr.m.how === "judge" ? "on time" : ck.tr.m.how === "dodge" ? "slid out" : ck.tr.m.how === "push" ? "push-out" : "", 124, 96);
  }
  const ckpts = new GameLab.Checkpoints($("#ckpts"), (ck) => {
    poke(); state.ckTried = true;
    state.show = { a: 0, b: 0, n: 0 };
    startBout("replay", { ck });
    ML.say(`Replaying the <b>${ck.label} champion</b> (pink) against today's newest champion (blue). Watch who wins. Tap <b>Back to live</b> to return.`);
  }, () => { poke(); state.show = { a: 0, b: 0, n: 0 }; startBout(state.mode === "you" ? "you" : "show"); });
  function addCkpt(g, brain, rec) {
    const ck = { label: `Gen ${g}`, sub: `<small>beats first champs ${rec.early}%</small>`, brain: S.cloneBrain(brain), rules: { ...state.rules } };
    ck.tr = trace(ck.brain);
    ck.draw = (cv) => drawCk(cv, ck);
    ckpts.add(ck);
  }

  // ---------- controls ----------
  const playBtn = $("#play");
  function syncPlay() {
    if (state.mode === "you") { playBtn.innerHTML = `${ML.icon("play")} New bout`; playBtn.setAttribute("aria-label", "Start a new bout against the robot"); }
    else { playBtn.innerHTML = state.paused ? `${ML.icon("play")} Practise` : `${ML.icon("pause")} Pause`; playBtn.setAttribute("aria-label", state.paused ? "Let the robots practise" : "Pause the practice"); }
  }
  playBtn.addEventListener("click", () => {
    poke();
    if (state.mode === "you") { startBout("you"); arenaEl.focus({ preventScroll: true }); return; }
    state.paused = !state.paused;
    syncPlay();
    ML.say(state.paused ? "Practice paused. The chart and the champions stay as they are." : "Practising again!");
  });
  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll("#mode button").forEach((x) => { x.classList.toggle("on", x.dataset.m === mode); x.setAttribute("aria-pressed", x.dataset.m === mode); });
    $("#joyrow").classList.toggle("show", mode === "you");
    ckpts.active = null; ckpts.render();
    state.paused = false;
    syncPlay();
    if (mode === "you") {
      startBout("you");
      ML.say(champ() ? `You vs the <b>${champName()}</b>! It has practised ${T().gen - 1} generations. Arrow keys or joystick, go!` : "You vs a random rookie robot. Arrow keys or joystick, go!");
    } else {
      state.show = { a: 0, b: 0, n: 0 };
      startBout("show");
      if (!state.robSeen) ML.say(`Behind the scenes, <b>40 robots</b> are wrestling each other: ${S.POP * S.MATCHES} bouts per generation! On screen you see the newest champion (pink, with the crown) against a sparring partner. Watch the chart.`);
      else ML.say("Back to practice! Watch the chart keep climbing.");
      state.robSeen = true;
    }
  }
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => { poke(); setMode(b.dataset.m); }));
  document.querySelectorAll("#opp button").forEach((b) => b.addEventListener("click", () => {
    poke();
    state.opp = b.dataset.o;
    document.querySelectorAll("#opp button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    state.you = { a: 0, b: 0, n: 0, wins: 0 };
    if (state.mode !== "you") setMode("you"); else startBout("you");
    ML.say(state.opp === "first" ? (T().hof.length ? "You vs the <b>Gen 1 rookie</b>, the very first champion. Easy? Then try the newest champion!" : "There's no Gen 1 champion yet, so you get a random rookie. Let the robots practise first!") : `You vs the <b>${champName()}</b>. Good luck!`);
  }));
  $("#reset").addEventListener("click", () => {
    poke();
    state.trainer = newTrainer();
    state.early = []; state.chuck = []; state.markers = []; state.pending = [];
    state.celebrated = false; state.seen = {}; state.samples = [];
    state.show = { a: 0, b: 0, n: 0 }; state.you = { a: 0, b: 0, n: 0, wins: 0 };
    state.chartDirty = true;
    ckpts.clear();
    startBout(state.mode === "you" ? "you" : "show");
    ML.say("Brand-new random brains. Everything they learned is gone! (The challenges you switched on stay on.)");
  });
  const seg = (sel, fn) => document.querySelectorAll(sel + " button").forEach((b) => b.addEventListener("click", () => {
    poke();
    document.querySelectorAll(sel + " button").forEach((x) => x.classList.toggle("on", x === b));
    fn(+b.dataset.v);
  }));
  seg("#speed", (v) => { state.speed = v; if (v < 1) ML.say("Slow motion: watch where the pink robot aims just before a bump."); });
  seg("#tspeed", (v) => { state.tspeed = v; if (v >= 12) ML.say("Turbo practice! Generations fly by. Watch the chart lines."); });
  ML.bindRange("#mut", (v) => v.toFixed(2), (v) => {
    if (!state.trainer) return;
    T().mutation = v;
    if (state.started) ML.say(v >= 0.6 ? "Wild babies! Lots of new ideas, but many silly ones too. The chart may get bumpy." : v <= 0.1 ? "Careful copies: babies look almost exactly like their parents. Safe, but slow to find new tricks." : `Babies now get changes of size ${v.toFixed(2)}.`);
    poke();
  });
  $("#hof").addEventListener("change", (e) => {
    poke();
    T().useHof = e.target.checked;
    ML.say(e.target.checked ? "Old champions are back in practice. The robots must keep beating old tricks too." : "Now the robots only wrestle each other. Watch the orange Chuck line: they may <b>forget</b> how to beat old tricks and go round in circles!");
  });

  // ---------- idle nudge ----------
  function poke() { state.lastAct = performance.now(); }
  function nextStep() {
    const h = T().history.length;
    if (ckpts.active) return "Tap <b>Back to live</b> in the checkpoints row when you've seen enough.";
    if (state.mode === "you" && state.you.n === 0) return "Your move! Press the <b>arrow keys</b>, drag the <b>joystick</b>, or drag on the ring. Push the pink robot over the straw edge.";
    if (state.mode === "you" && h < 5) return "Now press <b>Robots learn</b> (top left) and watch 40 robots practise on each other.";
    if (state.mode === "robo" && state.paused) return "Practice is paused. Press <b>Practise</b> to carry on.";
    if (state.mode === "robo" && h < 8) return "Watch the purple line on the chart: how often the newest champion beats the very first ones.";
    if (!state.done.icy) return "Try a challenge: switch on the <b>Icy ring</b> and watch the chart.";
    if (!state.ckTried && T().history.length >= 5) return "Tap a <b>checkpoint</b> to watch an old champion wrestle today's champion.";
    if (state.you.n < 4) return "Wrestle the newest champion: pick <b>You wrestle</b>. Is it harder than the rookie?";
    if (!state.done.small) return "Next challenge: the <b>Smaller ring</b>.";
    if (!state.done.heavy) return "Last challenge: a <b>Heavier opponent</b>. Can a light robot win?";
    if (!state.xrOpened) return "Try <b>X-ray the model</b> to see which senses matter most to the champion.";
    return "All challenges done! Try practising <b>without old champions</b> and see if the robots forget old tricks.";
  }
  setInterval(() => {
    const now = performance.now();
    if (now - state.lastAct > 15000) { ML.say(nextStep()); state.lastAct = now; }
  }, 1000);

  document.addEventListener("themechange", () => { state.chartDirty = true; ckpts.render(); insideTick = 7; renderInside(); });

  // ---------- main loop ----------
  let lastT = performance.now(), lastPanel = 0;
  function frame(now) {
    const dt = Math.min(50, now - lastT);
    lastT = now;
    train();
    stepBout(dt);
    draw(now);
    renderInside();
    if (now - lastPanel > 200) { renderStats(); renderWays(); lastPanel = now; }
    if (state.chartDirty) { drawChart(); state.chartDirty = false; }
    requestAnimationFrame(frame);
  }
  ckpts.render();
  syncPlay();
  state.started = true;
  startBout("you");
  renderWays(); renderStats(); drawChart();
  requestAnimationFrame(frame);

  // ---------- Model X-ray ----------
  let xNet = null;
  const RANGES = [[-0.6, 1.4], [-1, 1], [-1, 1], [0, 1], [0, 1], [-1, 1], [-1, 1], [-1.5, 1.5], [-1.5, 1.5], [-1, 1], [-1, 1], [-0.5, 1]];
  ML.xray.register({
    title: "The sumo champion's brain",
    kind: "Neural network",
    summary: () => `${champName()} after ${((T().gen - 1) * S.POP * T().matches).toLocaleString()} practice bouts`,
    size: () => "122 weights",
    stats: () => { const r = lastRec(); return [["Generation", T().gen - 1], ["Beats first champs", r ? r.early + "%" : "–"], ["Beats Chuck", r ? r.chuck + "%" : "–"]]; },
    inputs: S.INPUT_NAMES.map((name, i) => ({ key: "s" + i, name, min: RANGES[i][0], max: RANGES[i][1], step: 0.05 })),
    outputs: [{ name: "Drive forward" }, { name: "Back away" }, { name: "Turn left" }, { name: "Turn right" }],
    predict: (x) => { const o = xNet.forward(x); return [o[0], -o[0], o[1], -o[1]]; },
    samples: () => state.samples.slice(-200),
    current: () => { const b = state.bout; return b && b.m.t > 0 && typeof b.m.a.brain === "object" ? Array.from(b.m.input[0]) : null; },
    brainHeight: 320,
    drawBrain: (cv) => ML.xray.drawNet(cv, xNet.sizes, (l, i, j) => xNet.weight(l, i, j), S.INPUT_NAMES, ["drive (fwd / back)", "turn (left / right)"]),
    brainCaption: ML.xray.NET_CAPTION,
    notes: [
      "All senses are measured from the robot's own point of view (ahead, to my left), so one brain works from any starting spot in the ring.",
      "Nobody wrote a rule like \"turn toward the rival\". Any rule you see here was found by evolution, bout after bout.",
    ],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { xNet = S.cloneBrain(champ() || T().pop[0]); state.xrOpened = true; poke(); _xo(); };
  ML.xray.button(playBtn.parentElement);
})();
