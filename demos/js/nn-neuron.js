// Meet One Neuron — a perceptron deciding "go play outside?"
(function () {
  const INPUTS = [
    { icon: "sun", name: "Sunny", on: true, w: 2 },
    { icon: "rain", name: "Raining", on: false, w: -0.5 },
    { icon: "groups", name: "Friends coming", on: true, w: 2 },
    { icon: "book", name: "Homework", on: false, w: -0.5 },
  ];
  // What a real kid decided. Linearly separable (e.g. w = [2,-3,2,-2], b = -1).
  const DAYS = [
    { x: [1, 0, 0, 0], y: 1 },
    { x: [1, 1, 0, 0], y: 0 },
    { x: [0, 0, 1, 1], y: 0 },
    { x: [1, 0, 1, 1], y: 1 },
    { x: [0, 0, 0, 0], y: 0 },
    { x: [0, 0, 1, 0], y: 1 },
    { x: [0, 1, 1, 0], y: 0 },
    { x: [0, 0, 0, 1], y: 0 },
  ];
  const LR = 0.5;
  // Extra icon not in the shared set.
  const RAIN = '<path d="M17.5 15H7a4 4 0 1 1 1-7.87A5.5 5.5 0 0 1 18.5 9a3 3 0 0 1-1 6z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>';
  const ico = (name) => name === "rain"
    ? `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RAIN}</svg>`
    : ML.icon(name);
  // Same icons as Images, so the canvas can draw them in any color.
  const imgCache = {};
  function iconImg(name, color) {
    const key = name + color;
    if (!imgCache[key]) {
      const svg = ico(name).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" ').replace(/currentColor/g, color);
      const im = new Image();
      im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      imgCache[key] = im;
    }
    return imgCache[key];
  }
  let dayEls = [];
  let narrTimer = null;
  let ready = false;
  const state = { bias: -1, act: "step", current: -1, lessons: 0, cursor: 0, cleanRun: 0, auto: null };

  // ---------- neuron maths ----------
  const xs = () => INPUTS.map((i) => (i.on ? 1 : 0));
  const sumOf = (x) => INPUTS.reduce((s, inp, i) => s + inp.w * x[i], state.bias);
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
  const out = (z) => (state.act === "step" ? (z > 0 ? 1 : 0) : sigmoid(z));
  const predict = (x) => (sumOf(x) > 0 ? 1 : 0);
  const fmt = (v) => (v > 0 ? "+" : "") + v.toFixed(1);
  const emojiOf = (x) => x.map((v, i) => (v ? ico(INPUTS[i].icon) : "")).join("") || '<span style="font-size:.6em;font-weight:800">plain day</span>';

  // ---------- controls ----------
  const inHost = document.getElementById("inputs");
  inHost.innerHTML = INPUTS.map((inp, i) => `
    <div class="in-row">
      <button class="btn small toggle" id="t${i}">${ico(inp.icon)} ${inp.name}<span class="state"></span></button>
      <div class="field">
        <label for="w${i}">How much I care <span class="val" data-for="w${i}"></span></label>
        <input type="range" id="w${i}" min="-3" max="3" step="0.1" value="${inp.w}">
      </div>
    </div>`).join("");

  function syncToggles() {
    INPUTS.forEach((inp, i) => {
      const b = document.getElementById("t" + i);
      b.classList.toggle("on", inp.on);
      b.querySelector(".state").textContent = inp.on ? "ON" : "off";
    });
  }
  INPUTS.forEach((inp, i) => {
    document.getElementById("t" + i).addEventListener("click", () => {
      inp.on = !inp.on; state.current = -1; syncToggles(); refreshDays(); narrate();
    });
    ML.bindRange("#w" + i, fmt, (v) => { inp.w = v; refreshDays(); narrateSoon(); });
  });
  ML.bindRange("#bias", fmt, (v) => { state.bias = v; refreshDays(); narrateSoon(); });
  syncToggles();

  document.querySelectorAll("#act button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#act button").forEach((x) => x.classList.toggle("on", x === b));
      state.act = b.dataset.a;
      updateInside();
      narrate();
    }));

  function setSlider(id, v) {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event("input"));
  }

  // ---------- narration ----------
  function narrateSoon() { if (!ready) return; clearTimeout(narrTimer); narrTimer = setTimeout(narrate, 250); }
  function narrate() {
    if (state.auto) return;
    const x = xs();
    const z = sumOf(x);
    const parts = INPUTS.filter((inp) => inp.on && Math.abs(inp.w) >= 0.05).map((inp) =>
      `${ico(inp.icon)} ${inp.w > 0 ? "pushes me toward YES" : "pulls me toward NO"} (${fmt(inp.w)})`);
    let s = parts.length ? parts.join(", ") + ". " : "No switches are on, so only my mood counts. ";
    s += `My mood adds ${fmt(state.bias)}. Total: <b>${z.toFixed(1)}</b>. `;
    if (state.act === "step") s += z > 0 ? "That's more than zero, so <b>YES! Let's go play!</b>" : "That's not more than zero, so <b>NO, stay home.</b>";
    else s += `I'm <b>${Math.round(sigmoid(z) * 100)}% sure</b> we should go out.`;
    ML.say(s);
  }

  // ---------- teaching ----------
  const daysHost = document.getElementById("days");
  daysHost.innerHTML = DAYS.map((d, i) => `
    <button class="day" data-i="${i}">
      <span class="guess"></span>
      <div class="dname">Day ${i + 1}</div>
      <div class="demo">${emojiOf(d.x)}</div>
      <div class="ans">${d.y ? ML.icon("check") + " Go play!" : ML.icon("x") + " Stay in"}</div>
    </button>`).join("");
  dayEls = Array.from(daysHost.children);
  dayEls.forEach((el, i) => el.addEventListener("click", () => loadDay(i, true)));

  function loadDay(i, talk) {
    DAYS[i].x.forEach((v, k) => (INPUTS[k].on = !!v));
    state.current = i;
    syncToggles();
    refreshDays();
    if (talk) {
      const p = predict(DAYS[i].x);
      ML.say(`Day ${i + 1}: ${emojiOf(DAYS[i].x)}. The kid said <b>${DAYS[i].y ? "GO" : "STAY"}</b>. My neuron says <b>${p ? "GO" : "STAY"}</b>. ${p === DAYS[i].y ? "We agree!" : "Oops, we disagree! Try turning the knobs, or press Learn."}`);
    }
  }

  // Live "what's happening inside" maths.
  function updateInside() {
    const host = document.getElementById("inside");
    if (!host) return;
    const x = xs(), z = sumOf(x);
    const cls = (v) => (v > 0.001 ? "pos" : v < -0.001 ? "neg" : "");
    let h = INPUTS.map((inp, i) => {
      const v = x[i] * inp.w;
      return `<div class="ln ${x[i] ? "" : "off"}">${ico(inp.icon)}<span>${inp.name} <b>(${x[i] ? "on" : "off"})</b></span>
        <span class="eq">${x[i]} × ${fmt(inp.w)} = <span class="${cls(v)}">${fmt(v)}</span></span></div>`;
    }).join("");
    h += `<div class="ln"><span>Starting mood</span><span class="eq ${cls(state.bias)}">${fmt(state.bias)}</span></div>`;
    const verdict = state.act === "step" ? (z > 0 ? "&gt; 0 → YES" : "≤ 0 → NO") : `→ ${Math.round(sigmoid(z) * 100)}% sure`;
    h += `<div class="ln total"><span>Total</span><span class="eq">${z.toFixed(1)} ${verdict}</span></div>`;
    host.innerHTML = h;
  }

  function refreshDays() {
    updateInside();
    if (!dayEls.length) return 0;
    let wrong = 0;
    DAYS.forEach((d, i) => {
      const ok = predict(d.x) === d.y;
      if (!ok) wrong++;
      const el = dayEls[i];
      el.classList.toggle("right", ok);
      el.classList.toggle("wrong", !ok);
      el.classList.toggle("current", i === state.current);
      el.querySelector(".guess").textContent = ok ? "Robo agrees" : "Robo wrong";
    });
    document.getElementById("mistakes").innerHTML = `${wrong}<small>/8</small>`;
    document.getElementById("lessons").textContent = state.lessons;
    return wrong;
  }

  // One perceptron step on the next day in line.
  function lesson() {
    const i = state.cursor;
    state.cursor = (state.cursor + 1) % DAYS.length;
    const d = DAYS[i];
    loadDay(i, false);
    state.lessons++;
    const p = predict(d.x);
    const err = d.y - p;
    const tag = `Day ${i + 1} ${emojiOf(d.x)}`;
    if (err === 0) {
      state.cleanRun++;
      ML.say(`${tag}: I said <b>${p ? "GO" : "STAY"}</b>, the kid said <b>${d.y ? "GO" : "STAY"}</b>. Right! Nothing to fix.`);
    } else {
      state.cleanRun = 0;
      const on = INPUTS.filter((_, k) => d.x[k]);
      INPUTS.forEach((inp, k) => {
        if (d.x[k]) setSlider("w" + k, ML.clamp(+(inp.w + LR * err * d.x[k]).toFixed(1), -3, 3));
      });
      setSlider("bias", ML.clamp(+(state.bias + LR * err).toFixed(1), -3, 3));
      const dir = err > 0 ? "UP" : "DOWN";
      const which = on.length ? `the knobs for ${on.map((x) => ico(x.icon)).join(" ")}` : "no switch knobs (none were on)";
      ML.say(`${tag}: I said <b>${p ? "GO" : "STAY"}</b> but the kid said <b>${d.y ? "GO" : "STAY"}</b>. Oops! So I turn ${dir} ${which}, and make my mood a bit ${err > 0 ? "more eager" : "lazier"}.`);
    }
    const wrong = refreshDays();
    if ([1, 5, 10].includes(state.lessons)) snapshot(`After lesson ${state.lessons}`, wrong);
    if (wrong === 0 && state.cleanRun >= DAYS.length) {
      snapshot(`Done! (${state.lessons})`, 0);
      stopAuto();
      state.current = -1;
      refreshDays();
      ML.say(`🎉 I went through all 8 days without a single mistake! I learned the kid's rule all by myself in <b>${state.lessons}</b> lessons.`);
      ML.confetti();
      return true;
    }
    return false;
  }

  const autoBtn = document.getElementById("learn-auto");
  function stopAuto() {
    clearInterval(state.auto);
    state.auto = null;
    autoBtn.innerHTML = ML.icon("play") + " Learn!";
  }
  autoBtn.addEventListener("click", () => {
    if (state.auto) { stopAuto(); return; }
    goLive();
    if (refreshDays() === 0) { ML.say("I already agree with every day! Scramble my knobs first, then I'll learn again."); return; }
    state.cleanRun = 0;
    autoBtn.innerHTML = ML.icon("pause") + " Pause";
    lesson();
    state.auto = setInterval(lesson, 1000);
  });
  document.getElementById("learn-one").addEventListener("click", () => { stopAuto(); goLive(); lesson(); });

  // ---------- checkpoints ----------
  const cps = [];
  let live = null; // knobs saved while previewing a snapshot
  const cpHost = document.getElementById("cps");
  const liveBtn = document.getElementById("live");
  const knobs = () => ({ w: INPUTS.map((i) => i.w), b: state.bias });
  function applyKnobs(k) { k.w.forEach((v, i) => setSlider("w" + i, v)); setSlider("bias", k.b); clearTimeout(narrTimer); }
  function snapshot(title, wrong) {
    cps.push({ title, wrong, ...knobs() });
    renderCps();
  }
  function renderCps(active = -1) {
    if (!cps.length) {
      cpHost.innerHTML = '<p class="muted cp-empty">Press <b>Learn!</b> — snapshots appear after lesson 1, 5, 10 and when it\'s done. Tap one to travel back in time.</p>';
      return;
    }
    const good = ML.cssVar("--good"), bad = ML.cssVar("--bad");
    cpHost.innerHTML = cps.map((c, i) => `
      <button class="ckpt ${i === active ? "on" : ""}" data-i="${i}">
        <b class="t">${c.title}</b>
        <div class="bars">${[...c.w, c.b].map((v) => {
          const hgt = Math.abs(v) / 3 * 50;
          return `<span><b style="background:${v >= 0 ? good : bad};height:${hgt}%;${v >= 0 ? `bottom:50%` : `top:50%`}"></b></span>`;
        }).join("")}</div>
        <div class="m">${c.wrong} mistake${c.wrong === 1 ? "" : "s"}</div>
      </button>`).join("");
    cpHost.querySelectorAll(".ckpt").forEach((el) => el.addEventListener("click", () => preview(+el.dataset.i)));
  }
  function preview(i) {
    stopAuto();
    if (!live) live = knobs();
    applyKnobs(cps[i]);
    state.current = -1;
    const wrong = refreshDays();
    renderCps(i);
    liveBtn.classList.remove("hidden");
    ML.say(`Time travel! This is my brain <b>${cps[i].title.toLowerCase()}</b>. Back then I got <b>${wrong}</b> of 8 days wrong. Bars show my knobs (last bar = mood).`);
  }
  function goLive() {
    if (!live) return;
    applyKnobs(live);
    live = null;
    liveBtn.classList.add("hidden");
    refreshDays();
    renderCps();
  }
  liveBtn.addEventListener("click", () => { goLive(); ML.say("Back to now! These are my knobs today."); });
  document.getElementById("scramble").addEventListener("click", () => {
    stopAuto();
    live = null; liveBtn.classList.add("hidden"); cps.length = 0; renderCps();
    INPUTS.forEach((_, k) => setSlider("w" + k, +(ML.rand(-1.5, 1.5)).toFixed(1)));
    setSlider("bias", +(ML.rand(-1, 1)).toFixed(1));
    state.lessons = 0; state.cleanRun = 0; state.cursor = 0;
    const wrong = refreshDays();
    ML.say(`Knobs scrambled! Now I get <b>${wrong}</b> of 8 days wrong. Press <b>Learn!</b> and watch me fix myself.`);
  });

  // ---------- drawing ----------
  const W = 680, H = 430;
  const cv = document.getElementById("cv");
  const { ctx } = ML.setupCanvas(cv, W, H);
  const N = { x: 330, y: 205, r: 62 };
  const inPos = INPUTS.map((_, i) => ({ x: 62, y: 58 + i * 92 }));
  const biasPos = { x: 205, y: 395 };
  const actBox = { x: 432, y: 148, w: 120, h: 114 };
  const face = { x: 625, y: 205, r: 44 };
  let shownZ = 0, shownOut = 0;

  function wire(a, b, w, active, t) {
    const good = ML.cssVar("--good"), bad = ML.cssVar("--bad");
    const c = w >= 0 ? good : bad;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 + (b.y - a.y) * -0.15;
    ctx.save();
    ctx.strokeStyle = c;
    ctx.globalAlpha = active ? 0.9 : 0.18;
    ctx.lineWidth = 1.5 + Math.abs(w) * 2.6;
    ctx.lineCap = "round";
    if (!active) ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y); ctx.stroke();
    ctx.restore();
    const pt = (u) => ({ x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * cx + u * u * b.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * cy + u * u * b.y });
    if (active && Math.abs(w) > 0.05) {
      ctx.fillStyle = c;
      for (let k = 0; k < 3; k++) {
        const u = (t * 0.45 + k / 3) % 1;
        const p = pt(u);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 + Math.abs(w) * 1.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // weight label
    const m = pt(0.5);
    const label = "×" + fmt(w);
    ctx.font = "800 13px Nunito, sans-serif";
    const tw = ctx.measureText(label).width + 12;
    ctx.globalAlpha = active ? 1 : 0.5;
    ctx.fillStyle = ML.cssVar("--card");
    roundRect(m.x - tw / 2, m.y - 11, tw, 22, 11); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = c; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, m.x, m.y + 1);
    ctx.globalAlpha = 1;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function arrow(x1, y1, x2, y2) {
    const ink = ML.cssVar("--ink");
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - 8, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 10, y2 - 7); ctx.lineTo(x2 - 10, y2 + 7); ctx.closePath(); ctx.fill();
  }

  function draw(ts) {
    const t = ts / 1000;
    const x = xs();
    const z = sumOf(x);
    shownZ += (z - shownZ) * 0.15;
    const o = out(z);
    shownOut += (o - shownOut) * 0.15;
    const ink = ML.cssVar("--ink"), card = ML.cssVar("--card"), accent = ML.cssVar("--accent"), muted = ML.cssVar("--muted");
    ctx.clearRect(0, 0, W, H);

    // wires
    INPUTS.forEach((inp, i) => wire({ x: inPos[i].x + 30, y: inPos[i].y }, { x: N.x - N.r + 4, y: N.y }, inp.w, inp.on, t));
    wire({ x: biasPos.x, y: biasPos.y - 26 }, { x: N.x - 20, y: N.y + N.r - 6 }, state.bias, true, t);

    // input nodes
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    INPUTS.forEach((inp, i) => {
      const p = inPos[i];
      ctx.globalAlpha = inp.on ? 1 : 0.35;
      ctx.fillStyle = card; ctx.strokeStyle = inp.on ? accent : ink; ctx.lineWidth = inp.on ? 4 : 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const im = iconImg(inp.icon, inp.on ? accent : ink);
      if (im.complete && im.naturalWidth) ctx.drawImage(im, p.x - 17, p.y - 17, 34, 34);
      ctx.font = "800 12px Nunito, sans-serif";
      ctx.fillStyle = inp.on ? accent : muted;
      ctx.fillText(inp.on ? "ON = 1" : "off = 0", p.x, p.y + 42);
      ctx.globalAlpha = 1;
    });
    // bias node
    ctx.fillStyle = card; ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(biasPos.x, biasPos.y, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // little mood face: smiles when eager, flat when lazy
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(biasPos.x - 7, biasPos.y - 5, 2.5, 0, Math.PI * 2); ctx.arc(biasPos.x + 7, biasPos.y - 5, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(biasPos.x - 8, biasPos.y + 7);
    ctx.quadraticCurveTo(biasPos.x, biasPos.y + 7 + ML.clamp(state.bias, -3, 3) * 2.5, biasPos.x + 8, biasPos.y + 7); ctx.stroke();
    ctx.font = "800 12px Nunito, sans-serif"; ctx.fillStyle = muted;
    ctx.fillText("mood", biasPos.x - 44, biasPos.y + 2);

    // neuron body
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10 + shownOut * 30 + Math.sin(t * 4) * 4 * shownOut;
    ctx.fillStyle = card; ctx.strokeStyle = ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(N.x, N.y, N.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = accent; ctx.globalAlpha = 0.15 + shownOut * 0.55;
    ctx.beginPath(); ctx.arc(N.x, N.y, N.r - 8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.font = "800 12px Nunito, sans-serif"; ctx.fillText("ADD IT UP", N.x, N.y - 26);
    ctx.font = "600 34px Fredoka, sans-serif"; ctx.fillText(shownZ.toFixed(1), N.x, N.y + 6);
    ctx.font = "700 13px Nunito, sans-serif"; ctx.fillStyle = muted; ctx.fillText("total", N.x, N.y + 34);

    arrow(N.x + N.r + 4, N.y, actBox.x - 4, N.y);

    // activation box
    const b = actBox;
    ctx.fillStyle = card; ctx.strokeStyle = ink; ctx.lineWidth = 3;
    roundRect(b.x, b.y, b.w, b.h, 14); ctx.fill(); ctx.stroke();
    const gx = (v) => b.x + 10 + ((v + 6) / 12) * (b.w - 20);
    const gy = (v) => b.y + b.h - 22 - v * (b.h - 44);
    ctx.strokeStyle = ML.cssVar("--line"); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(gx(0), b.y + 12); ctx.lineTo(gx(0), b.y + b.h - 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x + 8, gy(0)); ctx.lineTo(b.x + b.w - 8, gy(0)); ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath();
    for (let v = -6; v <= 6.001; v += 0.1) {
      const yv = state.act === "step" ? (v > 0 ? 1 : 0) : sigmoid(v);
      v === -6 ? ctx.moveTo(gx(v), gy(yv)) : ctx.lineTo(gx(v), gy(yv));
    }
    ctx.stroke();
    const zc = ML.clamp(shownZ, -6, 6);
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(gx(zc), gy(state.act === "step" ? (zc > 0 ? 1 : 0) : sigmoid(zc)), 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = "800 11px Nunito, sans-serif"; ctx.fillStyle = muted;
    ctx.fillText(state.act === "step" ? "BIGGER THAN 0?" : "HOW SURE?", b.x + b.w / 2, b.y + b.h - 8);

    arrow(b.x + b.w + 4, N.y, face.x - face.r - 4, N.y);

    // face
    const yes = shownOut > 0.5;
    ctx.fillStyle = yes ? ML.cssVar("--lang") : ML.cssVar("--bg-2");
    ctx.strokeStyle = ink; ctx.lineWidth = 4;
    const bounce = yes ? Math.abs(Math.sin(t * 5)) * 4 : 0;
    const fy = face.y - bounce;
    ctx.beginPath(); ctx.arc(face.x, fy, face.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(face.x - 14, fy - 10, 5, 0, Math.PI * 2); ctx.arc(face.x + 14, fy - 10, 5, 0, Math.PI * 2); ctx.fill();
    const smile = (shownOut - 0.5) * 2; // -1 sad … +1 happy
    ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(face.x - 18, fy + 14); ctx.quadraticCurveTo(face.x, fy + 14 + smile * 16, face.x + 18, fy + 14); ctx.stroke();
    ctx.font = "600 22px Fredoka, sans-serif"; ctx.fillStyle = ink;
    ctx.fillText(yes ? "YES!" : "NO", face.x, face.y + face.r + 26);
    if (state.act === "sigmoid") {
      ctx.font = "800 13px Nunito, sans-serif"; ctx.fillStyle = muted;
      ctx.fillText(Math.round(shownOut * 100) + "% sure", face.x, face.y + face.r + 50);
    }
    ctx.font = "800 12px Nunito, sans-serif"; ctx.fillStyle = muted;
    ctx.fillText("Go play outside?", face.x, face.y - face.r - 18);

    requestAnimationFrame(draw);
  }
  refreshDays();
  ready = true;
  requestAnimationFrame(draw);
})();
