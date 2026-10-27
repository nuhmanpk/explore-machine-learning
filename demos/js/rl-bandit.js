// Lucky Slot Machines: you play, then Robo learns with epsilon-greedy.
(function () {
  const C = window.BanditCore;
  const $ = (id) => document.getElementById(id);
  const L = C.NAMES;
  const fmt = (x, d = 1) => x.toFixed(d);
  const WIN = 30; // chart window (pulls)
  const SPEEDS = [{ n: "Slow", pps: 2 }, { n: "Normal", pps: 6 }, { n: "Fast", pps: 30 }, { n: "Turbo", pps: 0 }];

  // ---------------- Your turn ----------------
  const YOU_PULLS = 30;
  let yEnv, yLeft, yCoins, yN, ySum;
  const grid = $("you-grid");
  function youReset() {
    yEnv = C.makeEnv(ML.seeded((Math.random() * 1e9) | 0));
    yLeft = YOU_PULLS; yCoins = 0;
    yN = new Array(yEnv.n()).fill(0); ySum = new Array(yEnv.n()).fill(0);
    grid.innerHTML = yEnv.arms.map((_, i) => `<button class="machine" data-i="${i}" aria-label="Pull machine ${L[i]}">${ML.icon("slot")}<span class="m-name">Machine ${L[i]}</span><span class="m-info">not tried yet</span><span class="truth"></span><span class="pop"></span></button>`).join("");
    youDraw();
    $("you-msg").textContent = "Each machine shows how many times you pulled it and what it paid on average so far.";
    ML.say("Welcome to the casino! Every machine pays a different amount, and <b>nobody tells you which is best</b>. You have 30 pulls. Tap a machine to pull it!");
  }
  function youDraw() {
    $("you-left").textContent = yLeft;
    $("you-coins").textContent = fmt(yCoins);
    grid.querySelectorAll(".machine").forEach((b, i) => {
      b.disabled = yLeft <= 0;
      b.querySelector(".m-info").textContent = yN[i] ? `${yN[i]} pulls · avg ${fmt(ySum[i] / yN[i])}` : "not tried yet";
    });
  }
  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".machine");
    if (!b || yLeft <= 0) return;
    const i = +b.dataset.i;
    const r = yEnv.pay(i);
    yN[i]++; ySum[i] += r; yCoins += r; yLeft--;
    const pop = b.querySelector(".pop");
    pop.textContent = r > 0 ? "+" + fmt(r) : "0";
    pop.style.color = r > 0 ? "var(--good)" : "var(--muted)";
    pop.classList.remove("show"); void pop.offsetWidth; pop.classList.add("show");
    b.classList.add("pull"); setTimeout(() => b.classList.remove("pull"), 120);
    youDraw();
    if (yLeft === 0) youFinish();
    else if (yLeft === YOU_PULLS - 1) ML.say("Ka-ching or nothing! Keep going. Do you stick with a machine you like, or test the others?");
  });
  function youFinish() {
    const best = YOU_PULLS * yEnv.bestMean();
    let s = 0;
    for (let k = 1; k <= 200; k++) s += C.run("eps", { eps: 0.1 }, YOU_PULLS, k, ML.seeded).avg * YOU_PULLS;
    const robo = s / 200;
    $("you-best").textContent = fmt(best);
    const m = yEnv.means();
    grid.querySelectorAll(".machine").forEach((b, i) => {
      b.querySelector(".truth").textContent = "really pays " + fmt(m[i], 2);
      if (i === yEnv.best()) b.style.borderColor = "var(--good)";
    });
    $("you-msg").innerHTML = `You got <b>${fmt(yCoins)}</b> coins. The best machine was <b>${L[yEnv.best()]}</b>, so the most you could expect is about <b>${fmt(best)}</b>. A curious robot averages about <b>${fmt(robo)}</b>.`;
    ML.say(yCoins >= robo ? "Wow, you beat the average robot! Now let me show you how I play." : "Tricky, right? With so few pulls it is hard to know. Let me show you how I do it.");
    peek = true; $("bars").classList.add("peek");
  }
  $("you-again").addEventListener("click", youReset);

  // ---------------- Robo ----------------
  let rngEnv, rngAg, env, robo, cG, cE, cR;
  let cum, optCum, marks, last, running = false, peek = false, acc = 0, pending = null, noisy = false;
  const P = { eps: 0.1, decay: false, speed: 1 };
  const chart = ML.setupCanvas($("chart"), 520, 190).ctx;
  const cmp = ML.setupCanvas($("cmp"), 520, 170).ctx;
  const CW = 520;

  function roboReset(talk) {
    rngEnv = ML.seeded(2024); rngAg = ML.seeded(77);
    env = C.makeEnv(rngEnv);
    const n = env.n();
    robo = C.makeAgent("eps", n, { eps: P.eps, decay: P.decay });
    cG = C.makeAgent("greedy", n); cE = C.makeAgent("eps", n, { eps: 0.1 }); cR = C.makeAgent("random", n);
    cum = { r: [0], g: [0], e: [0], x: [0] }; optCum = [0];
    marks = []; last = null; pending = null; noisy = false;
    ["ch-shake", "ch-more", "ch-noise"].forEach((id) => $(id).classList.remove("done"));
    $("ch-msg").textContent = 'Each one is marked on the chart. Try them with "Never explore" and with "Just right".';
    draw();
    if (talk) ML.say("Fresh notebook! I know nothing about these machines yet. Press <b>Play</b>.");
  }

  function stepWorld() {
    const rw = env.drawAll();
    const ags = [robo, cG, cE, cR];
    const out = ags.map((a) => {
      const c = a.choose(rngAg);
      const old = a.Q[c.arm];
      a.update(c.arm, rw[c.arm]);
      return { c, r: rw[c.arm], old, nw: a.Q[c.arm] };
    });
    last = out[0];
    ["r", "g", "e", "x"].forEach((k, j) => cum[k].push(cum[k][cum[k].length - 1] + out[j].r));
    optCum.push(optCum[optCum.length - 1] + env.bestMean());
    checkPending();
  }

  function winAvg(arr, t) { const a = Math.max(0, t - WIN); return (arr[t] - arr[a]) / (t - a); }

  function checkPending() {
    if (!pending) return;
    const t = robo.t;
    if (t - pending.t0 < WIN) return;
    const opt = winAvg(optCum, t), got = winAvg(cum.r, t);
    if (got >= 0.8 * opt) {
      marks.push({ t, label: "caught on", color: "--good" });
      $("ch-msg").innerHTML = `Robo caught on after <b>${t - pending.t0}</b> pulls.`;
      ML.toast("Robo adapted to the new casino!");
      ML.say(`Phew! It took me ${t - pending.t0} pulls to notice the change. Curiosity paid off.`);
      pending = null;
    } else if (t - pending.t0 > 600 && !pending.warned) {
      pending.warned = true;
      $("ch-msg").innerHTML = "Robo is still stuck on an old favourite. Try more curiosity!";
      ML.say("I keep pulling my old favourite and never check the others. I'm <b>stuck</b>! Turn up my curiosity.");
    }
  }

  // ---------------- drawing ----------------
  function bars() {
    const host = $("bars"), n = env.n();
    if (host.children.length !== n) host.innerHTML = Array.from({ length: n }, (_, i) => `<div class="brow"><span class="bl">${L[i]}</span><div class="track"><div class="fill"></div><div class="tick"></div></div><span class="cnt"></span></div>`).join("");
    const scale = 4, m = env.means();
    let fav = 0; robo.Q.forEach((q, i) => { if (q > robo.Q[fav]) fav = i; });
    [...host.children].forEach((row, i) => {
      row.querySelector(".fill").style.width = Math.min(100, (Math.max(0, robo.Q[i]) / scale) * 100) + "%";
      row.querySelector(".tick").style.left = Math.min(98, (m[i] / scale) * 100) + "%";
      row.querySelector(".cnt").textContent = `${robo.N[i]} pulls · ${fmt(robo.Q[i])}`;
      row.classList.toggle("last", !!last && last.c.arm === i);
      row.classList.toggle("fav", robo.t > 0 && i === fav);
    });
  }

  function lines(ctx, w, h, series, ymax) {
    const ink2 = ML.cssVar("--ink-2"), line = ML.cssVar("--line");
    ctx.clearRect(0, 0, w, h);
    ctx.font = "700 11px Nunito, sans-serif"; ctx.fillStyle = ML.cssVar("--muted"); ctx.strokeStyle = line; ctx.lineWidth = 1;
    const L0 = 30, B = h - 18, T = 8, R = w - 8, T_ = Math.max(robo.t, 60);
    for (let v = 0; v <= ymax; v++) {
      const y = B - (v / ymax) * (B - T);
      ctx.beginPath(); ctx.moveTo(L0, y); ctx.lineTo(R, y); ctx.stroke(); ctx.fillText(v, 10, y + 4);
    }
    ctx.fillText("pulls: " + T_, R - 70, h - 4);
    const X = (t) => L0 + (t / T_) * (R - L0), Y = (v) => B - (Math.min(v, ymax) / ymax) * (B - T);
    marks.forEach((m) => {
      ctx.strokeStyle = ML.cssVar(m.color); ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(m.t), T); ctx.lineTo(X(m.t), B); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ML.cssVar(m.color); ctx.fillText(m.label, Math.min(X(m.t) + 3, R - 60), T + 10 + (m.row || 0) * 12);
    });
    series.forEach((s) => {
      const arr = s.arr, T1 = arr.length - 1;
      if (T1 < 1) return;
      ctx.strokeStyle = ML.cssVar(s.color); ctx.lineWidth = s.w || 2.5; ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      const stp = Math.max(1, Math.ceil(T1 / 260));
      for (let t = 1; t <= T1; t += stp) { const v = winAvg(arr, t); t === 1 ? ctx.moveTo(X(t), Y(v)) : ctx.lineTo(X(t), Y(v)); }
      ctx.lineTo(X(T1), Y(winAvg(arr, T1)));
      ctx.stroke(); ctx.setLineDash([]);
    });
  }

  function inside() {
    const host = $("inside");
    if (!last) { host.innerHTML = `<div>I haven't pulled anything yet. My notebook is empty, so my first pick will be a guess.</div>`; return; }
    const c = last.c, e = Math.round(c.eps * 100);
    const roll = Math.round(c.roll * 100);
    let why;
    if (c.explored) why = `<div>Dice roll: <b>${roll}</b>. That is under my curiosity of <b>${e}</b>, so I'm being <b>curious</b> and trying Machine ${L[c.arm]} just to see.</div>`;
    else why = `<div>Dice roll: <b>${roll}</b>, not under <b>${e}</b>, so no experiments. I look at my notebook: ${c.tie ? "everything looks the same, so I pick one at random" : `Machine ${L[c.best]} has the best average so far`}. I pull <b>${L[c.arm]}</b>.</div>`;
    host.innerHTML = why + `<div class="arrow">${ML.icon("arrow-down")}</div>
      <div>It paid <b>${last.r > 0 ? fmt(last.r) : "nothing"}</b>. Machine ${L[c.arm]}'s average went from <b>${fmt(last.old)}</b> to <b>${fmt(last.nw)}</b>.</div>`;
  }

  function stats() {
    const t = robo.t;
    $("s-pulls").textContent = t;
    $("s-coins").textContent = Math.round(robo.total);
    $("s-avg").textContent = t ? fmt(robo.total / t) : "0.0";
    $("s-opt").textContent = fmt(env.bestMean());
    $("c-g").textContent = Math.round(cG.total); $("c-e").textContent = Math.round(cE.total); $("c-r").textContent = Math.round(cR.total);
  }

  function draw() {
    const ymax = Math.max(4, Math.ceil(Math.max.apply(null, env.means()) + 0.5));
    bars(); stats(); inside();
    lines(chart, 520, 190, [{ arr: optCum, color: "--ink", dash: [6, 4], w: 2 }, { arr: cum.r, color: "--accent", w: 3 }], ymax);
    lines(cmp, 520, 170, [{ arr: optCum, color: "--ink", dash: [6, 4], w: 1.5 }, { arr: cum.x, color: "--muted" }, { arr: cum.g, color: "--bad" }, { arr: cum.e, color: "--good" }], ymax);
  }

  // ---------------- loop ----------------
  let lastT = 0, sayAt = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (running) {
      const sp = SPEEDS[P.speed];
      let n;
      if (sp.pps === 0) n = 25; else { acc += dt * sp.pps; n = Math.floor(acc); acc -= n; }
      for (let i = 0; i < n; i++) stepWorld();
      if (n) { draw(); narrate(); }
    }
    requestAnimationFrame(frame);
  }
  function narrate() {
    const t = robo.t;
    if (t < sayAt) return;
    if (t >= 1 && sayAt === 0) { ML.say("I'm trying machines and writing down what they pay. Watch the bars grow!"); sayAt = 40; }
    else if (sayAt === 40) { ML.say(P.eps === 0 ? "I never explore, so I'm pulling whatever paid first. What if there's a better one?" : P.eps >= 1 ? "I'm pulling at random every time. Fun, but I never use what I learned." : "Now I mostly pull my starred favourite, and sometimes peek at the others."); sayAt = 150; }
    else if (sayAt === 150) { ML.say("Check the strategy race: how are the three robots doing?"); sayAt = 1e9; }
  }
  function setRunning(v) {
    running = v;
    $("play").innerHTML = `${ML.icon(v ? "pause" : "play")} ${v ? "Pause" : "Play"}`;
  }
  $("play").addEventListener("click", () => setRunning(!running));
  $("step").addEventListener("click", () => { setRunning(false); stepWorld(); draw(); });
  $("reset").addEventListener("click", () => { setRunning(false); sayAt = 0; roboReset(true); });
  $("peek").addEventListener("click", () => { peek = !peek; $("bars").classList.toggle("peek", peek); });

  ML.bindRange("#speed", (v) => SPEEDS[v].n, (v) => { P.speed = v; acc = 0; });
  ML.bindRange("#eps", (v) => v + "%", (v) => { P.eps = v / 100; if (robo) { robo.eps = P.eps; } });
  $("decay").addEventListener("change", (e) => { P.decay = e.target.checked; robo.decay = P.decay; });
  document.querySelectorAll("[data-eps]").forEach((b) => b.addEventListener("click", () => {
    const v = +b.dataset.eps, s = $("eps");
    s.value = v; s.dispatchEvent(new Event("input"));
    ML.say(v === 0 ? "No curiosity at all! I'll stick with the first thing that works." : v === 100 ? "All curiosity! I'll try random machines forever." : "A little curiosity: mostly cash in, sometimes explore.");
  }));

  // ---------------- challenges ----------------
  $("ch-shake").addEventListener("click", () => {
    const r = env.shake();
    marks.push({ t: robo.t, label: "changed!", color: "--bad", row: 0 });
    pending = { t0: robo.t };
    $("ch-shake").classList.add("done");
    $("ch-msg").textContent = "Machine " + L[r.from] + " (the old best) swapped with " + L[r.to] + ". Does Robo notice?";
    ML.say(`Uh oh! The casino swapped Machine ${L[r.from]} with ${L[r.to]}. My notebook is now out of date.`);
    draw();
  });
  $("ch-more").addEventListener("click", () => {
    if (env.n() >= 8) return;
    env.grow(8);
    [robo, cG, cE, cR].forEach((a) => a.grow(env.n()));
    marks.push({ t: robo.t, label: "+3 machines", color: "--warn", row: 1 });
    $("ch-more").classList.add("done");
    $("ch-msg").textContent = "Eight machines now. More choices means more exploring to do.";
    ML.say("Three new machines! Any of them could be the best. Time to be curious.");
    draw();
  });
  $("ch-noise").addEventListener("click", () => {
    noisy = !noisy; env.noise = noisy ? 0.9 : 0.2;
    marks.push({ t: robo.t, label: noisy ? "noisier" : "calmer", color: "--rl", row: 2 });
    $("ch-noise").classList.toggle("done", noisy);
    $("ch-msg").textContent = noisy ? "Prize sizes now swing a lot, so each pull tells Robo less." : "Back to calm payouts.";
    ML.say(noisy ? "The prizes jump around now. One lucky pull can fool me!" : "Prizes are steady again.");
    draw();
  });

  window.addEventListener("resize", () => {});
  youReset();
  roboReset(false);
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
