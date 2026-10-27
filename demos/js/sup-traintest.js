// Train vs Test page. Logic lives in sup-traintest-core.js.
(function () {
  const core = window.TrainTestCore;
  const $ = (id) => document.getElementById(id);
  const W = 560, H = 380, CW = 300, CH = 160, NPOOL = 100, MMIN = 4, MMAX = 80;
  const cv = $("cv");
  const { ctx } = ML.setupCanvas(cv, W, H);
  const { ctx: cctx } = ML.setupCanvas($("chart"), CW, CH);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PAD = 12, CELL = 14;
  const px = (x) => PAD + x * (W - 2 * PAD), py = (y) => PAD + y * (H - 2 * PAD);

  const S = { noise: 0.35, seed: 1, m: 12, leak: false, pool: [], fresh: [], order: [], curve: [], learning: false, upto: MMAX, hits: {}, tried: [], timer: 0 };

  function rebuild(newSplit) {
    S.pool = core.makeCards(NPOOL, S.noise, 7);
    S.fresh = core.makeCards(300, S.noise, 99);
    S.order = core.shuffled(NPOOL, S.seed);
    S.curve = [];
    for (let m = MMIN; m <= MMAX; m++) S.curve.push({ m, ...core.scores(S.pool, S.order, m, S.leak) });
    cps.reset();
  }
  const cur = () => core.scores(S.pool, S.order, S.m, S.leak);
  const trainSet = () => (S.leak ? S.pool : core.split(S.pool, S.order, S.m).train);

  function verdict(sc) {
    if (S.leak) return { k: "bad", t: "Cheating! It saw the exam", r: "The exam cards were in the study pile, so 100% means nothing." };
    const g = sc.train - sc.test;
    if (g > 0.12) return { k: "bad", t: "Memorised, not learned", r: "Perfect on study cards, shaky on new ones." };
    if (g > 0.06) return { k: "warn", t: "Mostly learned", r: "A little memorising is still left." };
    return { k: "good", t: "Really learned", r: "The exam score is close to the study score." };
  }

  function drawMap(c, w, h, train, test, opt) {
    // decision regions from 1-NN on a coarse grid
    const cols = Math.ceil(w / opt.cell), rows = Math.ceil(h / opt.cell);
    const A = ML.cssVar("--sup"), B = ML.cssVar("--rl");
    c.globalAlpha = 0.25;
    if (train.length) for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = ((i + 0.5) * opt.cell - opt.pad) / (w - 2 * opt.pad), y = ((j + 0.5) * opt.cell - opt.pad) / (h - 2 * opt.pad);
      c.fillStyle = core.nn(train, x, y) ? B : A;
      c.fillRect(i * opt.cell, j * opt.cell, opt.cell + 0.5, opt.cell + 0.5);
    }
    c.globalAlpha = 1;
    const X = (x) => opt.pad + x * (w - 2 * opt.pad), Y = (y) => opt.pad + y * (h - 2 * opt.pad);
    const ink = ML.cssVar("--ink"), warn = ML.cssVar("--warn");
    for (const p of test) {
      c.beginPath(); c.arc(X(p.x), Y(p.y), opt.r, 0, 7);
      if (S.leak && !opt.thumb) { c.fillStyle = p.c ? B : A; c.fill(); c.strokeStyle = warn; c.lineWidth = 3; }
      else { c.strokeStyle = p.c ? B : A; c.lineWidth = opt.thumb ? 1.2 : 2.5; }
      c.stroke();
    }
    for (const p of train) {
      c.beginPath(); c.arc(X(p.x), Y(p.y), opt.r + (opt.thumb ? 0 : 1), 0, 7);
      c.fillStyle = p.c ? B : A; c.fill(); c.strokeStyle = ink; c.lineWidth = opt.thumb ? 0.8 : 1.5; c.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const s = core.split(S.pool, S.order, S.m);
    drawMap(ctx, W, H, trainSet(), s.test, { cell: CELL, pad: PAD, r: 5 });
    drawChart(); ui();
  }

  function drawChart() {
    const pts = (k) => S.curve.filter((e) => e.m <= (S.learning ? S.upto : MMAX)).map((e) => ({ x: e.m, y: e[k] }));
    const marks = [S.m];
    SupKit.lineChart(cctx, CW, CH, [
      { data: pts("train"), color: ML.cssVar("--accent") },
      { data: pts("test"), color: ML.cssVar("--bad") },
    ], { xMax: MMAX, yMin: 0.4, yMax: 1, yFmt: (v) => Math.round(v * 100) + "%", marks });
    const L = 34, R = 8, T = 10, B = 20, ink = ML.cssVar("--ink");
    Object.keys(S.hits).forEach((k) => {
      const h = S.hits[k], x = L + (h.m / MMAX) * (CW - L - R);
      cctx.fillStyle = ML.cssVar("--warn"); cctx.strokeStyle = ink; cctx.lineWidth = 1.5;
      cctx.beginPath(); cctx.arc(x, CH - B - 6, 6, 0, 7); cctx.fill(); cctx.stroke();
    });
  }

  const pct = (v) => Math.round(v * 100) + "%";
  function ui() {
    const sc = cur(), v = verdict(sc);
    $("tr").textContent = pct(sc.train); $("te").textContent = pct(sc.test);
    $("gap").textContent = (sc.train - sc.test >= 0 ? "" : "-") + Math.round(Math.abs(sc.train - sc.test) * 100) + " pts";
    const vd = $("verdict"); vd.textContent = v.t; vd.style.color = `var(--${v.k})`;
    $("bar").style.width = (S.m / NPOOL * 100) + "%";
    $("m-hint").textContent = `${S.m} study cards · ${NPOOL - S.m} hidden exam cards`;
    const fresh = core.accuracy(trainSet(), S.fresh);
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Robo keeps <b>${sc.nTrain}</b> study cards. To answer, it finds the <b>closest study card</b> and copies its colour.</span></div>
      <div class="sig"><span class="dot" style="background:var(--ink)"></span><span>On the study cards it scores <b>${pct(sc.train)}</b>. Of course: each card is its own closest neighbour!</span></div>
      <div class="sig"><span class="dot" style="background:var(--bad)"></span><span>On <b>${sc.nTest}</b> exam cards: <b>${pct(sc.test)}</b>. This is the score that matters, because those cards are new to me.</span></div>
      <div class="sig"><span class="dot" style="background:var(--good)"></span><span>On 300 brand-new cards: <b>${pct(fresh)}</b>${S.leak ? ". That is the real score, and the 100% above was fake." : "."}</span></div>
      <div class="decision">${v.r}</div>`;
    const tried = S.tried;
    $("splits").textContent = tried.length ? `Splits tried at ${S.m} cards: ${tried.map((t) => pct(t.test)).join(", ")}${tried.length > 1 ? ` (from ${pct(Math.min(...tried.map((t) => t.test)))} to ${pct(Math.max(...tried.map((t) => t.test)))})` : ""}` : "";
    if (!S.learning) ML.say(`<b>${v.t}.</b> ${v.r} Study ${pct(sc.train)}, exam <b>${pct(sc.test)}</b>.`);
    checkChallenges();
  }

  // ---------- checkpoints ----------
  const MILESTONES = [8, 16, 32, 48, 64, 80];
  const cps = new SupKit.Checkpoints($("cps"), {
    milestones: MILESTONES,
    label: (m) => `${m} cards`,
    draw: (c, w, h, snap) => drawMap(c, w, h, snap.train, snap.test, { cell: 6, pad: 3, r: 2.2, thumb: true }),
    onPick: (snap) => { if (snap) { stopLearn(); setM(snap.m, true); ML.say(`Back to <b>${snap.m} study cards</b>: study ${pct(snap.tr)}, exam <b>${pct(snap.te)}</b>.`); } },
  });
  function capture() {
    if (!MILESTONES.includes(S.m) || S.leak) return;
    const s = core.split(S.pool, S.order, S.m), sc = cur();
    cps.capture(S.m, { m: S.m, train: s.train, test: s.test, tr: sc.train, te: sc.test }, `exam ${pct(sc.test)}`);
  }

  // ---------- challenges ----------
  const DEF = {
    peek: { el: "c-peek", ok: () => S.leak, msg: "Both scores are 100%, but it is cheating. Real cards score lower." },
    noisy: { el: "c-noisy", ok: () => !S.leak && S.noise >= 0.55 && S.m >= 20 && cur().train - cur().test > 0.1, msg: "Noisy cards make the exam score much lower than the study score." },
    luck: { el: "c-luck", ok: () => !S.leak && S.tried.length >= 5, msg: "Different splits, different exam scores. One split can be lucky or unlucky!" },
  };
  function checkChallenges() {
    for (const k in DEF) {
      const d = DEF[k];
      if (!S.hits[k] && d.ok()) { S.hits[k] = { m: S.m }; $(d.el).classList.add("done"); ML.toast(d.msg); if (k === "luck") ML.confetti(30); drawChart(); }
    }
  }

  // ---------- controls ----------
  function setM(m, silent) {
    S.m = ML.clamp(Math.round(m), MMIN, MMAX); $("m").value = S.m;
    const o = document.querySelector('[data-for="m"]'); if (o) o.textContent = S.m;
    if (!S.learning) S.tried = S.tried.filter((t) => t.m === S.m);
    draw();
  }
  $("m").addEventListener("input", (e) => { stopLearn(); S.tried = []; setM(+e.target.value); });
  ML.bindRange("#m", (v) => v);

  function stopLearn() {
    S.learning = false; clearTimeout(S.timer);
    $("robot").innerHTML = `${ML.icon("play")} Robot, study!`;
  }
  function resetCurveFlags() { S.hits = {}; Object.values(DEF).forEach((d) => $(d.el).classList.remove("done")); }
  function newSplit() {
    stopLearn();
    S.tried = S.tried.length ? S.tried : [];
    S.seed += 1; rebuild();
    S.tried.push({ m: S.m, test: cur().test, seed: S.seed });
    draw();
  }
  $("redeal").addEventListener("click", newSplit);
  $("deal5").addEventListener("click", newSplit);
  $("peek").addEventListener("click", () => {
    stopLearn(); S.leak = !S.leak; S.tried = []; rebuild(); draw();
    $("peek").innerHTML = S.leak ? `${ML.icon("eye")} Stop peeking` : `${ML.icon("eye")} Peek at the exam`;
    if (S.leak) ML.say("Oops, I looked at the exam cards while studying. <b>Everything is 100%</b>, but that is cheating: I did not learn, I copied. Check the green line in the box on the right.");
  });
  ML.bindRange("#noise", (v) => v.toFixed(2), (v) => {
    if (v === S.noise) return;
    stopLearn(); S.noise = v; S.tried = []; rebuild(); draw();
  });
  $("noisy").addEventListener("click", () => { $("noise").value = 0.6; $("noise").dispatchEvent(new Event("input")); if (S.m < 20) setM(30); });

  $("robot").addEventListener("click", () => {
    if (S.learning) return stopLearn();
    if (S.leak) { S.leak = false; $("peek").innerHTML = `${ML.icon("eye")} Peek at the exam`; rebuild(); }
    S.learning = true; S.tried = []; cps.reset();
    $("robot").innerHTML = `${ML.icon("pause")} Stop`;
    ML.say("Watch! I get <b>one more study card</b> at a time. My <b>study score</b> stays near 100%, but my <b>exam score</b> has to climb.");
    let m = MMIN; S.upto = m; setM(m);
    const step = reduce ? 4 : 1;
    const tick = () => {
      if (!S.learning) return;
      if (m < MMAX) {
        m = Math.min(MMAX, m + step); S.upto = m; setM(m); capture();
        S.timer = setTimeout(tick, reduce ? 40 : 90);
      } else {
        stopLearn(); S.upto = MMAX; draw();
        const a = S.curve[0], b = S.curve[S.curve.length - 1];
        ML.say(`Done! With ${MMIN} cards the gap was <b>${Math.round((a.train - a.test) * 100)} points</b>, with ${MMAX} it is <b>${Math.round((b.train - b.test) * 100)}</b>. More study cards, a better exam.`);
      }
    };
    capture(); S.timer = setTimeout(tick, reduce ? 40 : 300);
  });

  new MutationObserver(() => { draw(); cps.redraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => draw());
  rebuild(); setM(S.m);
})();
