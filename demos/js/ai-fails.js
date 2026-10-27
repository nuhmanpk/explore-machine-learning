// Where AI Fails: four stages, each a real tiny model trained live, with predict-first questions, a chart and challenges.
(function () {
  const F = window.AIFails;
  const $ = (id) => document.getElementById(id);
  const pct = (x) => Math.round(x * 100);
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CAT = "#ff9f43", DOG = "#3b82f6";
  const score = { ok: 0, total: 0 };
  const stages = [];
  let cur = 0;

  // ---------- shared pane scaffolding ----------
  function paneHTML(i, o) {
    return `<section class="stage pane ${i === 0 ? "on" : ""}" id="pane${i}">
      <div class="stage-left">
        <div class="canvas-box"><p class="sub-h">${o.title}</p>${o.left}</div>
        <div class="card inside"><h3><i data-icon="cpu"></i> What's happening inside</h3><div class="inside-box" id="s${i}-inside"></div></div>
        <div class="card"><h3><i data-icon="flag"></i> Challenges</h3><ul class="chal" id="s${i}-chal"></ul></div>
      </div>
      <aside class="panel">
        <div class="card">
          <h3><i data-icon="question"></i> Will it get this right?</h3>
          <p class="pred-q" id="s${i}-pq">Train the AI first (below), then guess!</p>
          <div class="row2"><button class="btn" id="s${i}-yes">Yes, it will</button><button class="btn" id="s${i}-no">No, it will slip</button></div>
          <div class="pred-res" id="s${i}-pr"></div>
          <button class="btn small ghost hidden" id="s${i}-next">Next question</button>
        </div>
        <div class="card">
          <h3><i data-icon="gauge"></i> Watch it learn</h3>
          <div class="btn-row"><button class="btn primary" id="s${i}-train"><i data-icon="play"></i> Train the AI</button></div>
          ${o.extra || ""}
          <div class="tiles2" id="s${i}-tiles"></div>
          <canvas class="chart" id="s${i}-chart"></canvas>
          <div class="legend-row" id="s${i}-leg"></div>
        </div>
      </aside>
    </section>`;
  }
  const CW = 340, CH = 150;
  function drawChart(st) {
    const c = st.chart.ctx;
    const line = ML.cssVar("--line"), muted = ML.cssVar("--muted"), card = ML.cssVar("--card");
    c.clearRect(0, 0, CW, CH);
    const L = 34, R = 8, T = 10, B = 20, w = CW - L - R, h = CH - T - B;
    c.font = "700 10px Nunito, sans-serif"; c.textBaseline = "middle"; c.textAlign = "right";
    [0, 0.5, 1].forEach((v) => {
      const y = T + h * (1 - v);
      c.strokeStyle = line; c.lineWidth = 1; c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke();
      c.fillStyle = muted; c.fillText(pct(v) + "%", L - 5, y);
    });
    c.textAlign = "center"; c.fillStyle = muted;
    c.fillText(st.xlabel + " →", L + w / 2, CH - 7);
    const total = Math.ceil(st.steps / st.rec);
    const X = (k) => L + (w * k) / total;
    st.series.forEach((s, si) => {
      if (s.show && !s.show()) return;
      c.strokeStyle = s.col; c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath();
      st.hist.forEach((row, k) => { const x = X(k), y = T + h * (1 - row[si]); k ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    });
    st.marks.forEach((m) => {
      const x = X(m.i);
      c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 2; c.setLineDash([4, 3]);
      c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + h); c.stroke(); c.setLineDash([]);
      c.fillStyle = ML.cssVar("--accent"); c.beginPath(); c.arc(x, T + 5, 5, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.font = "800 8px Nunito, sans-serif"; c.fillText("!", x, T + 5.5);
      c.font = "700 10px Nunito, sans-serif";
    });
  }
  function renderChal(st) {
    $(`s${st.i}-chal`).innerHTML = st.chal.map((c) => `<li class="${c.done ? "done" : ""}"><span class="ck">${ML.icon("check")}</span><span>${c.t}</span></li>`).join("");
    $("h" + st.i).classList.toggle("done", st.chal.some((c) => c.done));
  }
  function complete(st, k, msg) {
    const c = st.chal[k];
    if (c.done) return;
    c.done = true;
    if (st.hist.length) st.marks.push({ i: st.hist.length - 1 });
    renderChal(st);
    ML.toast("Challenge done!");
    if (msg) ML.say(msg);
    if (st.chal.every((x) => x.done)) ML.confetti(30);
  }
  const inside = (st, html) => { $(`s${st.i}-inside`).innerHTML = html; };
  const row = (icon, html) => `<div>${ML.icon(icon)} ${html}</div>`;
  const arrow = `<div class="arrow">${ML.icon("arrow-down")}</div>`;

  function setTiles(st, arr) {
    $(`s${st.i}-tiles`).innerHTML = arr.map((t) => `<div class="tile3"><div class="k">${t[0]}</div><div class="v" ${t[2] ? `style="color:${t[2]}"` : ""}>${t[1]}</div></div>`).join("");
  }
  function updateScore() { $("score").textContent = `Your guesses: ${score.ok} of ${score.total} right`; }

  function makeStage(i, o) {
    const st = Object.assign({ i, ep: 0, running: false, trained: false, hist: [], marks: [], ci: 0, answered: false, dirty: true, xlabel: "training round" }, o);
    stages.push(st);
    return st;
  }
  function wire(st) {
    const i = st.i;
    st.chart = ML.setupCanvas($(`s${i}-chart`), CW, CH);
    $(`s${i}-leg`).innerHTML = st.series.map((s) => `<span><i style="background:${s.col}"></i>${s.name}</span>`).join("");
    $(`s${i}-train`).addEventListener("click", () => startTrain(st));
    const guess = (g) => {
      if (!st.trained) return ML.toast("Train the AI first!");
      if (st.running) return ML.toast("Wait for it to finish learning.");
      if (st.answered) return;
      const cs = st.cases[st.ci], r = cs.run();
      const good = g === r.right;
      st.answered = true; score.total++; if (good) score.ok++;
      updateScore();
      $(`s${i}-pr`).innerHTML = `<b class="${good ? "good-t" : "bad-t"}">${good ? "You called it!" : "Not quite!"}</b> The AI was <b>${r.right ? "right" : "wrong"}</b>. ${r.msg}`;
      ML.say(`${good ? "Nice guess!" : "Tricky!"} ${r.msg}`);
      $(`s${i}-yes`).disabled = $(`s${i}-no`).disabled = true;
      const more = st.ci < st.cases.length - 1;
      $(`s${i}-next`).classList.toggle("hidden", !more);
      if (more) st.nextTxt = "Next question";
      st.dirty = true;
    };
    $(`s${i}-yes`).addEventListener("click", () => guess(true));
    $(`s${i}-no`).addEventListener("click", () => guess(false));
    $(`s${i}-next`).addEventListener("click", () => { st.ci++; showCase(st); });
    renderChal(st);
    showCase(st);
  }
  function showCase(st) {
    const i = st.i;
    st.answered = false;
    $(`s${i}-pq`).innerHTML = st.cases[st.ci].q;
    $(`s${i}-pr`).innerHTML = "";
    $(`s${i}-yes`).disabled = $(`s${i}-no`).disabled = false;
    $(`s${i}-next`).classList.add("hidden");
  }
  function startTrain(st) {
    if (st.running) return;
    st.ep = 0; st.hist = []; st.marks = []; st.running = true; st.trained = false;
    st.reset();
    $(`s${st.i}-train`).innerHTML = `${ML.icon("pause")} Learning…`;
    ML.say(st.sayStart);
    if (reduce) { while (st.ep < st.steps) tick(st); finish(st); }
  }
  function tick(st) {
    st.trainStep(); st.ep++;
    if (st.ep % st.rec === 0 || st.ep === 1) { st.hist.push(st.sample()); }
    st.dirty = true;
  }
  function finish(st) {
    st.running = false; st.trained = true;
    $(`s${st.i}-train`).innerHTML = `${ML.icon("reset")} Train again`;
    st.done();
  }

  // =====================================================================
  // STAGE 1: strange land (out of distribution)
  // =====================================================================
  const W1 = 360, lo = F.S1.lo, hi = F.S1.hi, CELL = 8;
  const S1 = makeStage(0, {
    steps: F.S1.steps, rec: 5, series: [{ name: "Test accuracy (familiar animals)", col: ML.cssVar("--good") || "#2fbf62" }, { name: "How sure it is far away", col: "#e8554e" }],
    sayStart: "Learning to tell <b>cats</b> from <b>dogs</b> using two clues: how big, and how pointy the ears are.",
    tr: F.animals(7, 60), te: F.animals(107, 200), far: [[-1.6, -1.2], [-1, -1.8], [5.5, 5], [5, 5.8], [-1.8, 0.5], [5.5, 3.5]],
    P: [1.0, 1.4], alarm: false, drag: false, m: F.newModel(2),
  });
  S1.reset = () => { S1.m = F.newModel(2); };
  S1.trainStep = () => F.step(S1.m, S1.tr.X, S1.tr.y, F.S1.lr, 0);
  S1.sample = () => [F.accuracy(S1.m, S1.te.X, S1.te.y), S1.far.reduce((a, p) => a + F.sure(F.predict(S1.m, p)), 0) / S1.far.length];
  S1.cases = [
    { q: "A new animal appears <b>inside</b> the area the AI practised on. Will it get it right?", run() {
      S1.P = F.S1_NEW_CAT.slice(); const p = F.predict(S1.m, S1.P), ok = p < 0.5;
      return { right: ok, msg: `It is a cat, and the AI says <b>${ok ? "cat" : "dog"}</b>, ${pct(F.sure(p))}% sure. Familiar land, good answers.` };
    } },
    { q: "Now a <b>fish</b> shows up, far outside anything it practised on. It is neither a cat nor a dog. Will the AI get this right?", run() {
      S1.P = F.S1_FISH.slice(); const p = F.predict(S1.m, S1.P);
      return { right: false, msg: `It calls the fish a <b>${p < 0.5 ? "cat" : "dog"}</b>, <b>${pct(F.sure(p))}%</b> sure! It has no way to say "that's neither".` };
    } },
  ];
  S1.chal = [{ t: "Drag the test point somewhere far from all the animals where the AI is still at least 95% sure." },
    { t: "Switch on the novelty alarm and put the point where the alarm rings." },
    { t: "Find where the AI is really unsure (under 60% sure). Hint: look near the colour boundary." }];
  const c1 = () => $("s0-cv");
  function nearestInfo() { return F.nearest(S1.tr.X, S1.P); }
  function s1Info() {
    const p = F.predict(S1.m, S1.P), near = nearestInfo(), s = F.sure(p), cls = p < 0.5 ? "CAT" : "DOG";
    const far = near > 1;
    const alarmOn = S1.alarm && far;
    $("s0-read").innerHTML = S1.ep === 0 ? "Train the AI, then drag the <b>?</b> around the map." :
      `AI says: <b style="color:${p < 0.5 ? CAT : DOG}">${cls}</b>, <b>${pct(s)}%</b> sure. ${far ? `This spot is <b>${near.toFixed(1)}</b> away from any animal it has seen.` : "This spot is close to animals it has seen."}${alarmOn ? ` <b class="bad-t">Alarm: I have never seen anything like this!</b>` : ""}`;
    inside(S1, S1.ep === 0 ? row("book", "It has not learned anything yet. Press <b>Train the AI</b>.") :
      row("eye", `It only sees two numbers for the <b>?</b>: size <b>${S1.P[0].toFixed(1)}</b>, ear-pointiness <b>${S1.P[1].toFixed(1)}</b>.`) + arrow +
      row("ruler", `It asks one question: <b>which side of its dividing line is this?</b> It is on the <b>${cls.toLowerCase()}</b> side.`) + arrow +
      row("zap", `The farther from the line, the surer it gets: <b>${pct(s)}%</b>. Distance from the line says nothing about whether it has ever seen something like this.`) +
      (far && s > 0.9 ? `<div class="bad-t" style="font-weight:800">Far from home but very sure. That is the trap.</div>` : ""));
  }
  S1.check = () => {
    if (!S1.trained) return;
    const p = F.predict(S1.m, S1.P), near = nearestInfo(), s = F.sure(p);
    if (near >= 2 && s >= 0.95) complete(S1, 0, "Far from anything it knows and still <b>" + pct(s) + "%</b> sure. Confidence is not knowledge!");
    if (S1.alarm && near > 1) complete(S1, 1, "The alarm rings when something is far from the practice animals. Handy!");
    if (s < 0.6) complete(S1, 2, "Only near the boundary is it unsure. Everywhere else, even far away, it sounds certain.");
  };
  S1.done = () => {
    const t = S1.hist[S1.hist.length - 1];
    setTiles(S1, [["Test accuracy (familiar animals)", pct(t[0]) + "%", "var(--good)"], ["Sure about far-away animals", pct(t[1]) + "%", "var(--bad)"]]);
    ML.say(`Done! On familiar animals it is right <b>${pct(t[0])}%</b> of the time. Now guess what happens far away, then drag the <b>?</b>.`);
    s1Info();
  };
  S1.draw = () => {
    const { ctx } = S1.cv, sx = (x) => ((x - lo) / (hi - lo)) * W1;
    ctx.clearRect(0, 0, W1, W1);
    const cell = CELL, n = Math.ceil(W1 / cell), span = hi - lo;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const wx = lo + ((a + 0.5) * cell / W1) * span, wy = hi - ((b + 0.5) * cell / W1) * span;
      const p = F.predict(S1.m, [wx, wy]), s = F.sure(p), al = 0.08 + 0.62 * (2 * s - 1);
      ctx.fillStyle = p < 0.5 ? `rgba(255,159,67,${al})` : `rgba(59,130,246,${al})`;
      ctx.fillRect(a * cell, b * cell, cell, cell);
      if (S1.alarm && F.nearest(S1.tr.X, [wx, wy]) > 1) { ctx.fillStyle = "rgba(120,120,140,.35)"; ctx.fillRect(a * cell, b * cell, cell, cell); }
    }
    const X = (x) => sx(x), Y = (y) => W1 - sx(y);
    ctx.setLineDash([5, 4]); ctx.strokeStyle = ML.cssVar("--ink-2"); ctx.lineWidth = 1.5;
    [F.S1.cat, F.S1.dog].forEach((c) => { ctx.beginPath(); ctx.arc(X(c[0]), Y(c[1]), (1.0 / span) * W1, 0, 7); ctx.stroke(); });
    ctx.setLineDash([]);
    S1.tr.X.forEach((p, k) => { ctx.fillStyle = S1.tr.y[k] ? DOG : CAT; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 4.5, 0, 7); ctx.fill(); ctx.stroke(); });
    ctx.font = "800 11px Nunito, sans-serif"; ctx.fillStyle = ML.cssVar("--ink-2"); ctx.textAlign = "center";
    ctx.fillText("size →", W1 / 2, W1 - 5); ctx.save(); ctx.translate(11, W1 / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("ear pointiness →", 0, 0); ctx.restore();
    const px = X(S1.P[0]), py = Y(S1.P[1]);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = ML.cssVar("--ink"); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 14, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "800 17px Fredoka, sans-serif"; ctx.textBaseline = "middle"; ctx.fillText("?", px, py + 1); ctx.textBaseline = "alphabetic";
  };

  // =====================================================================
  // STAGE 2: shortcut learning
  // =====================================================================
  const S2 = makeStage(1, {
    steps: F.S2.steps, rec: 4, mixed: false, mode: "match", seen: false,
    series: [{ name: "Test accuracy (snow as in training)", col: "#2fbf62" }, { name: "Test accuracy (snow flipped)", col: "#e8554e", show: () => S2.seen }],
    sayStart: "Learning <b>wolf</b> (tall shape) vs <b>dog</b> (wide shape) from 40 pictures. Watch the snow corner...",
    A: F.pictures(57, 200, "match"), Bset: F.pictures(57, 200, "flip"), G: F.pictures(57, 12, "match"), ov: new Array(12).fill(null), m: F.newModel(F.NP),
  });
  S2.train = () => F.pictures(5, F.S2.nTrain, S2.mixed ? "random" : "match");
  S2.reset = () => { S2.m = F.newModel(F.NP); S2.data = S2.train(); S2.ov.fill(null); };
  S2.trainStep = () => F.step(S2.m, S2.data.X, S2.data.y, F.S2.lr, 0.001);
  S2.sample = () => [F.accuracy(S2.m, S2.A.X, S2.A.y), F.accuracy(S2.m, S2.Bset.X, S2.Bset.y)];
  S2.cases = [
    { q: "New wolf and dog pictures, snowy for wolves like in training. Will it get them right?", run() {
      S2.mode = "match"; syncMode(); const a = F.accuracy(S2.m, S2.A.X, S2.A.y);
      return { right: a >= 0.8, msg: `On 200 pictures like its practice it scores <b>${pct(a)}%</b>. Great! (This is the easy test.)` };
    } },
    { q: "Now flip the snow: wolves with <b>no snow</b>, dogs <b>with snow</b>. The shapes are unchanged. Will it get them right?", run() {
      S2.mode = "flip"; S2.seen = true; syncMode(); s2Stats(); S2.check(); const b = F.accuracy(S2.m, S2.Bset.X, S2.Bset.y);
      return { right: b >= 0.8, msg: `Accuracy falls to <b>${pct(b)}%</b>. It was reading the <b>snow</b>, not the animal.` };
    } },
  ];
  S2.chal = [{ t: "Flip the snow and push the AI below 60% on the test." },
    { t: "Click a snowless dog picture to paint snow on it, and watch the AI call it a wolf." },
    { t: "Tick \"mixed-up backgrounds\", train again, and get at least 80% with the snow flipped." }];
  const tile = 60;
  function tileImg(k) {
    const g = S2.G, x = g.X[k].slice(), snow = S2.ov[k] !== null ? S2.ov[k] : S2.mode === "match" ? g.y[k] === 1 : g.y[k] === 0;
    for (const c of F.CUE) x[c] = snow ? 0.97 : 0.03;
    return { x, snow };
  }
  function syncMode() {
    document.querySelectorAll("#s1-mode button").forEach((b) => b.classList.toggle("on", b.dataset.v === S2.mode));
    S2.ov.fill(null); S2.dirty = true; s2Info();
  }
  function s2Stats() {
    const a = F.accuracy(S2.m, S2.A.X, S2.A.y), b = F.accuracy(S2.m, S2.Bset.X, S2.Bset.y);
    setTiles(S2, [["Test accuracy: snow like training", pct(a) + "%", "var(--good)"], ["Test accuracy: snow flipped", S2.seen ? pct(b) + "%" : "?", S2.seen && b < 0.6 ? "var(--bad)" : ""]]);
    return { a, b };
  }
  function s2Info() {
    if (!S2.trained && S2.ep === 0) { inside(S2, row("book", "In training, <b>every wolf picture has a snow corner</b> and no dog has one. Press <b>Train the AI</b>.")); return; }
    const w = S2.m.w, corner = F.CUE.reduce((a, i) => a + w[i], 0);
    const rest = w.reduce((a, v, i) => a + (F.isCue(i) ? 0 : Math.abs(v)), 0) / (F.NP - 4), cw = F.CUE.reduce((a, i) => a + Math.abs(w[i]), 0) / 4;
    inside(S2, row("search", `Each pixel gets a weight. The <b>4 snow-corner pixels</b> average <b>${cw.toFixed(1)}</b>; the other 60 pixels average only <b>${rest.toFixed(1)}</b>.`) + arrow +
      row("ruler", cw > 2 * rest ? `The corner pays much more attention than the shape, because in training it was <b>never wrong</b>. The shape was messy.` : `The corner and the shape get similar attention, so snow is not a giveaway any more.`) + arrow +
      row("eye", S2.mixed ? `With mixed-up backgrounds, snow tells nothing, so it must learn the <b>shape</b>.` : `Flip the snow and the shortcut points the wrong way.`));
  }
  S2.done = () => {
    const { a } = s2Stats();
    ML.say(`Done! On pictures like its practice it scores <b>${pct(a)}%</b>. Check the weight map: the glow is on the snow corner!`);
    s2Info(); S2.dirty = true; S2.check();
  };
  S2.check = () => {
    if (!S2.trained) return;
    const { a, b } = { a: F.accuracy(S2.m, S2.A.X, S2.A.y), b: F.accuracy(S2.m, S2.Bset.X, S2.Bset.y) };
    if (S2.mode === "flip" && b < 0.6) complete(S2, 0, `Only <b>${pct(b)}%</b> with the snow flipped. Real numbers, real collapse.`);
    if (S2.mixed && S2.mode === "flip" && b >= 0.8 && a >= 0.8) complete(S2, 2, `Mixed-up backgrounds forced it to learn the shape: <b>${pct(b)}%</b> even with the snow flipped.`);
  };
  S2.draw = () => {
    const { ctx } = S2.cv, wc = S2.wcv.ctx;
    ctx.clearRect(0, 0, 360, 120);
    const px = tile / F.N;
    const pal = (v) => { const g = Math.round(40 + v * 190); return `rgb(${g},${g},${Math.min(255, g + 12)})`; };
    for (let k = 0; k < 12; k++) {
      const ox = (k % 6) * tile, oy = Math.floor(k / 6) * tile, { x, snow } = tileImg(k);
      for (let p = 0; p < F.NP; p++) { ctx.fillStyle = pal(x[p]); ctx.fillRect(ox + (p % 8) * px, oy + Math.floor(p / 8) * px, px + 0.5, px + 0.5); }
      const res = S2.trained || S2.ep ? F.label(S2.m, x) : null;
      if (res !== null) {
        const ok = res === S2.G.y[k];
        ctx.strokeStyle = ok ? "#2fbf62" : "#e8554e"; ctx.lineWidth = 3.5; ctx.strokeRect(ox + 2, oy + 2, tile - 4, tile - 4);
        ctx.fillStyle = ok ? "#2fbf62" : "#e8554e"; ctx.fillRect(ox + 2, oy + tile - 17, 30, 15);
        ctx.fillStyle = "#fff"; ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "left"; ctx.fillText(res ? "wolf?" : "dog?", ox + 4, oy + tile - 6);
      }
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(ox + 2, oy + 2, 32, 14); ctx.fillStyle = "#fff"; ctx.font = "800 9px Nunito, sans-serif";
      ctx.fillText(S2.G.y[k] ? "is wolf" : "is dog", ox + 4, oy + 12);
    }
    wc.clearRect(0, 0, 160, 160);
    const wcell = 20, mx = Math.max(0.01, ...S2.m.w.map(Math.abs));
    S2.m.w.forEach((v, p) => {
      const a = Math.min(1, Math.abs(v) / mx);
      wc.fillStyle = v >= 0 ? `rgba(255,159,67,${a})` : `rgba(59,130,246,${a})`;
      wc.fillRect((p % 8) * wcell, Math.floor(p / 8) * wcell, wcell, wcell);
      wc.strokeStyle = "rgba(128,128,150,.25)"; wc.strokeRect((p % 8) * wcell, Math.floor(p / 8) * wcell, wcell, wcell);
    });
    wc.setLineDash([4, 3]); wc.strokeStyle = ML.cssVar("--ink"); wc.lineWidth = 2; wc.strokeRect(1, 1, 2 * wcell - 2, 2 * wcell - 2); wc.setLineDash([]);
  };

  // =====================================================================
  // STAGE 3: brittleness
  // =====================================================================
  const S3 = makeStage(2, {
    steps: F.S3.steps, rec: 4, eps: 0, smart: true, k: 0, nc: null,
    series: [{ name: "Test accuracy", col: "#2fbf62" }, { name: "Average sureness", col: "#a066ff" }],
    sayStart: "Learning to tell a <b>tall bar</b> from a <b>wide bar</b> in noisy 8x8 pictures.",
    te: F.pictures(91, 100, "random"), m: F.newModel(F.NP),
  });
  S3.reset = () => { S3.m = F.newModel(F.NP); S3.data = F.pictures(21, F.S3.nTrain, "random"); };
  S3.trainStep = () => F.step(S3.m, S3.data.X, S3.data.y, F.S3.lr, 0.001);
  S3.sample = () => [F.accuracy(S3.m, S3.te.X, S3.te.y), S3.te.X.reduce((a, x) => a + F.sure(F.predict(S3.m, x)), 0) / S3.te.X.length];
  const nudged = (eps, smart) => { const x = S3.te.X[S3.k]; return smart ? F.nudge(S3.m, x, eps) : F.randomNudge(x, eps, S3.nc ? S3.nc.seed : 5); };
  function setNudge(eps, smart) {
    S3.eps = eps; S3.smart = smart; $("s2-eps").value = eps; $("s2-eps").dispatchEvent(new Event("input"));
    document.querySelectorAll("#s2-mode button").forEach((b) => b.classList.toggle("on", (b.dataset.v === "smart") === smart));
  }
  S3.cases = [
    { q: "A <b>random</b> tiny wiggle (each pixel brighter or darker by a few percent) is added to a picture. Will the AI give the same answer?", run() {
      const e = S3.nc ? S3.nc.eps : 0.08; setNudge(e, false);
      const same = F.label(S3.m, nudged(e, false)) === F.label(S3.m, S3.te.X[S3.k]);
      return { right: same, msg: `A random wiggle of <b>${pct(e)}%</b> brightness barely matters. The AI is fairly steady against noise.` };
    } },
    { q: "Now the <b>same size</b> of change, but aimed: every pixel is pushed the way that most confuses the AI. Will it still give the same answer?", run() {
      const e = S3.nc ? S3.nc.eps : 0.08; setNudge(e, true);
      const same = F.label(S3.m, nudged(e, true)) === F.label(S3.m, S3.te.X[S3.k]);
      return { right: same, msg: `The picture looks the same to you, but the answer <b>${same ? "stayed" : "flipped"}</b>. A tiny change, aimed well, can beat it.` };
    } },
  ];
  S3.chal = [{ t: "Use the smart nudge to flip the answer with a nudge of 0.10 or smaller." },
    { t: "Switch to random nudge and try the same size that flipped it. Notice it does not flip." },
    { t: "Find a smart nudge size that flips at least 80% of the 100 test pictures." }];
  function s3Info() {
    const x = S3.te.X[S3.k], x2 = nudged(S3.eps, S3.smart), p0 = F.predict(S3.m, x), p1 = F.predict(S3.m, x2);
    const l0 = p0 >= 0.5 ? "TALL bar" : "WIDE bar", l1 = p1 >= 0.5 ? "TALL bar" : "WIDE bar", flipped = l0 !== l1;
    const mf = F.minFlipEps(S3.m, x);
    const rs = F.flipRate(S3.m, S3.te.X, S3.eps, true, 1), rr = F.flipRate(S3.m, S3.te.X, S3.eps, false, 1);
    S3.rs = rs; S3.flipped = flipped;
    $("s2-read").innerHTML = `Before: <b>${l0}</b>, ${pct(F.sure(p0))}% sure. After: <b class="${flipped ? "bad-t" : ""}">${l1}</b>, ${pct(F.sure(p1))}% sure.${flipped ? ` <b class="bad-t">Flipped!</b>` : ""}<br>Smallest smart nudge that flips this picture: <b>${mf === null ? "none up to 0.5" : mf.toFixed(3)}</b>. Over 100 test pictures at this size: smart nudge flips <b>${pct(rs)}%</b>, random nudge flips <b>${pct(rr)}%</b>.`;
    inside(S3, row("eye", `The AI adds up <b>64 pixel weights</b> into one score. Each pixel can move the score only a little.`) + arrow +
      row("wand", `The smart nudge pushes <b>every</b> pixel by ${S3.eps.toFixed(2)} in the direction that helps most, so the little pushes <b>all add up</b>. A random nudge pushes some pixels up and some down, so they cancel.`) + arrow +
      row("zap", S3.eps === 0 ? "Slide the nudge size to see what happens." : flipped ? `The score crossed zero. <b>Tiny change, big flip.</b>` : `Score still on the same side, so the answer holds.`));
    if (!S3.trained) return;
    if (S3.smart && flipped && S3.eps <= 0.1 && S3.eps > 0) complete(S3, 0, "A change smaller than 10% of brightness, and the AI changed its mind.");
    if (!S3.smart && S3.eps >= (S3.firstFlip || 99) && !flipped) complete(S3, 1, "Same size, random direction: no flip. It is the <b>aim</b> that matters.");
    if (S3.smart && rs >= 0.8) complete(S3, 2, `At nudge size <b>${S3.eps.toFixed(2)}</b>, <b>${pct(rs)}%</b> of pictures flip.`);
    if (S3.smart && flipped && !S3.firstFlip) S3.firstFlip = S3.eps;
  }
  S3.done = () => {
    const t = S3.hist[S3.hist.length - 1];
    S3.nc = F.pickNudgeCase(S3.m, S3.te.X, S3.te.y); if (S3.nc) S3.k = S3.nc.k;
    S3.firstFlip = null;
    setTiles(S3, [["Test accuracy", pct(t[0]) + "%", "var(--good)"], ["Average sureness", pct(t[1]) + "%"]]);
    $("s2-eps").disabled = false;
    ML.say(`Done! It is right <b>${pct(t[0])}%</b> of the time. Now try the nudge slider.`);
    s3Info(); S3.dirty = true;
  };
  S3.draw = () => {
    const { ctx } = S3.cv, x = S3.te.X[S3.k], x2 = S3.ep ? nudged(S3.eps, S3.smart) : x;
    ctx.clearRect(0, 0, 420, 160);
    const sz = 120, px = sz / 8;
    const g = (v) => { const q = Math.round(30 + v * 200); return `rgb(${q},${q},${q + 10})`; };
    const imgs = [[x, 0, "Original"], [x2, 150, "Nudged"], [x.map((v, p) => Math.max(0, Math.min(1, (x2[p] - v) / (S3.eps ? 4 * S3.eps : 1) + 0.5))), 300, "The change (boosted)"]];
    imgs.forEach(([im, ox, name]) => {
      for (let p = 0; p < 64; p++) { ctx.fillStyle = g(im[p]); ctx.fillRect(ox + (p % 8) * px, Math.floor(p / 8) * px, px + 0.5, px + 0.5); }
      ctx.fillStyle = ML.cssVar("--ink-2"); ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText(name, ox + sz / 2, 142);
    });
    if (S3.ep) { [0, 1].forEach((n) => { const p = F.predict(S3.m, n ? x2 : x), r = p >= 0.5; ctx.fillStyle = r ? "#ff9f43" : "#3b82f6"; ctx.fillRect(n * 150, 0, sz, 14); ctx.fillStyle = "#fff"; ctx.fillText((r ? "TALL" : "WIDE") + " " + pct(F.sure(p)) + "%", n * 150 + sz / 2, 11); }); }
  };

  // =====================================================================
  // STAGE 4: confident nonsense
  // =====================================================================
  const S4 = makeStage(3, {
    steps: F.CORPUS.length, rec: 1, xlabel: "sentences read", t: F.newText(), country: "japan", last: null, auto: false,
    series: [{ name: "Quiz on facts it read", col: "#2fbf62" }],
    sayStart: "Reading sentences one at a time. It will only count which word comes after which.",
  });
  S4.reset = () => { S4.t = F.newText(); S4.last = null; S4.out && ($("s3-out").innerHTML = ""); $("s3-check").innerHTML = ""; };
  S4.trainStep = () => F.readSentence(S4.t, F.CORPUS[S4.ep]);
  S4.sample = () => [F.quiz(S4.t)];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function s4Ask(country) {
    country = (country || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 16);
    if (!country) return ML.toast("Type a country first.");
    if (!S4.trained) return ML.toast("Train the AI first!");
    $("s3-in").value = cap(country);
    const gen = F.complete(S4.t, F.ask(country), 6), prompt = F.ask(country).split(" ");
    S4.last = { country, gen, known: F.known(S4.t, country) };
    S4.out = true;
    const answer = gen.length ? gen[0].w : "";
    $("s3-out").innerHTML = `<div class="words">${prompt.map((w) => `<span class="w prompt">${w}</span>`).join("")}${gen.map((g) => `<span class="w gen">${g.w}<small>${pct(g.p)}% sure</small></span>`).join("")}</div>`;
    $("s3-check").innerHTML = "";
    inside(S4, row("book", `It only looks at the last word it wrote, <b>"${prompt[prompt.length - 1]}"</b>${S4.last.known ? ` and the one before: <b>"${country} is"</b> appeared in its reading.` : `, because <b>"${country} is"</b> never appeared in its reading.`}`) + arrow +
      row("chat", S4.last.known ? `It saw this exact pair, so it continues with <b>${answer}</b>.` : `It falls back to "what usually comes after <b>is</b>?" and picks the most common: <b>${answer}</b> (${pct(gen[0].p)}% of the time).`) + arrow +
      row("zap", `It <b>must</b> write something, so it finishes with a smooth sentence. There is no "I don't know" in the recipe.`));
    S4.dirty = true;
    if (!S4.last.known) complete(S4, 0, `It never read about <b>${cap(country)}</b>, yet it wrote a smooth sentence with an invented answer: <b>${answer}</b>.`);
    if (S4.auto || S4.autoNow) s4Check();
    return S4.last;
  }
  function s4Check() {
    const L = S4.last; if (!L) return ML.toast("Ask a question first.");
    const city = L.gen.length ? L.gen[0].w : "", real = F.truth(L.country);
    let html;
    if (real === city) { html = `<b class="good-t">Checked against the book: correct.</b> The book says the capital of ${cap(L.country)} is ${cap(real)}.`; if (L.known) complete(S4, 2, "The double-check agrees. Checking costs seconds and catches the made-up ones."); }
    else if (real) html = `<b class="bad-t">Wrong!</b> The book says ${cap(real)}.`;
    else { html = `<b class="bad-t">Caught it!</b> The book has no "${cap(L.country)}", so "${cap(city)}" is made up.`; complete(S4, 1, "The double-check caught the made-up answer. That is the habit!"); }
    $("s3-check").innerHTML = html;
  }
  S4.cases = [
    { q: "Ask: <b>the capital of Japan is...</b> Japan is one of the facts it read. Will it get this right?", run() {
      const L = s4Ask("japan"), a = L.gen[0].w;
      return { right: a === "tokyo", msg: `It says <b>${cap(a)}</b>. It read that sentence, so this is just remembering.` };
    } },
    { q: "Ask: <b>the capital of Narnia is...</b> It never read anything about Narnia. Will it get this right?", run() {
      const L = s4Ask("narnia"), a = L.gen[0].w;
      return { right: false, msg: `It says <b>${cap(a)}</b>, with ${pct(L.gen[0].p)}% for that word, and then ends the sentence politely. Narnia is not a real place.` };
    } },
  ];
  S4.chal = [{ t: "Ask about a country that is not in its book (try Mars, Atlantis, Wakanda) and watch it invent an answer." },
    { t: "Press Double-check on a made-up answer and see the book catch it." },
    { t: "Ask about a country it did read (France, Peru, Kenya...) and double-check: this time it is correct." }];
  S4.done = () => {
    setTiles(S4, [["Quiz on the 8 facts it read", pct(S4.hist[S4.hist.length - 1][0]) + "%", "var(--good)"], ["Sentences read", S4.steps]]);
    ML.say(`Done! It answers all <b>8</b> quiz questions correctly. Now ask it about something it never read.`);
    $("s3-book").querySelectorAll("span").forEach((s) => s.classList.add("read"));
    inside(S4, row("book", "It counted which word follows which. That is all it knows.") + arrow + row("chat", "Ask it something, and it picks likely next words, one at a time."));
  };
  S4.draw = () => { const n = S4.t.read; $("s3-book").querySelectorAll("span").forEach((s, k) => s.classList.toggle("read", k < n)); };

  // ---------- build the panes ----------
  const host = $("panes");
  host.innerHTML =
    paneHTML(0, { title: "Cats and dogs: tap or drag the ? anywhere on the map", left: `<canvas class="big" id="s0-cv" role="img" aria-label="Map of cats and dogs. Drag the question mark."></canvas>
      <div class="readout" id="s0-read"></div>
      <label class="legend-row" style="cursor:pointer"><input type="checkbox" id="s0-alarm"> Novelty alarm: grey out places far from the animals it learned from</label>
      <div class="legend-row"><span><i style="background:${CAT}"></i>Cat side</span><span><i style="background:${DOG}"></i>Dog side</span><span>Darker colour = more sure</span><span>Dashed ring = what it practised on</span></div>` }) +
    paneHTML(1, { title: "Wolf or dog? Tap a picture to paint (or wipe) snow on it", left: `<div class="field"><span class="lbl">Snow in the test pictures</span><div class="seg" id="s1-mode"><button data-v="match" class="on">Like in training</button><button data-v="flip">Flipped</button></div></div>
      <canvas class="big" id="s1-cv" style="margin-top:10px" role="img" aria-label="Twelve test pictures with the AI's verdicts"></canvas>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;margin-top:12px"><canvas id="s1-w" style="width:130px;border-radius:12px;background:var(--canvas-bg)"></canvas>
      <div><p class="sub-h">Where it looks (weight map)</p><div class="readout" id="s1-read" style="margin:0">Bright squares are pixels that matter to the AI. The dashed box is the snow corner.</div></div></div>`,
      extra: `<label class="legend-row" style="cursor:pointer"><input type="checkbox" id="s1-mix"> Train with mixed-up backgrounds (snow on half of each animal)</label>` }) +
    paneHTML(2, { title: "Nudge the pixels a tiny bit", left: `<canvas class="big" id="s2-cv" role="img" aria-label="Original picture, nudged picture and the change"></canvas>
      <div class="field" style="margin-top:10px"><label for="s2-eps">Nudge size <span class="val" data-for="s2-eps"></span></label><input type="range" id="s2-eps" min="0" max="0.3" step="0.005" value="0" disabled></div>
      <div class="seg" id="s2-mode" style="margin-top:8px"><button data-v="smart" class="on">Smart nudge (aimed)</button><button data-v="random">Random nudge</button></div>
      <div class="readout" id="s2-read" style="min-height:5em"></div>` }) +
    paneHTML(3, { title: "A tiny word machine: finish the sentence", left: `<p class="sub-h">What it read (8 facts and a few other sentences)</p><div class="book" id="s3-book">${F.CORPUS.map((s) => `<span>${s}</span>`).join("")}</div>
      <div class="row2" style="margin-top:12px;align-items:stretch"><input class="txt-in" id="s3-in" value="Japan" maxlength="16" aria-label="A country"><button class="btn primary" id="s3-ask">Ask: capital of ...?</button></div>
      <div class="legend-row" id="s3-chips"><span>Try:</span>${["France", "Peru", "Narnia", "Mars", "Atlantis"].map((c) => `<button class="btn small ghost" data-c="${c}">${c}</button>`).join("")}</div>
      <div id="s3-out" style="min-height:70px"></div>
      <div class="row2" style="margin-top:6px"><button class="btn" id="s3-dc"><i data-icon="search"></i> Double-check in the book</button></div>
      <label class="legend-row" style="cursor:pointer"><input type="checkbox" id="s3-auto"> Habit: always double-check automatically</label>
      <div class="readout" id="s3-check" style="min-height:3em"></div>` });
  ML.hydrateIcons && ML.hydrateIcons();

  S1.cv = ML.setupCanvas($("s0-cv"), W1, W1);
  S2.cv = ML.setupCanvas($("s1-cv"), 360, 120); S2.wcv = ML.setupCanvas($("s1-w"), 160, 160);
  S3.cv = ML.setupCanvas($("s2-cv"), 420, 160);
  stages.forEach(wire);

  // ---------- stage 1 interactions ----------
  const movePoint = (e) => {
    const p = ML.canvasPoint($("s0-cv"), e, W1, W1);
    S1.P = [Math.max(lo, Math.min(hi, lo + (p.x / W1) * (hi - lo))), Math.max(lo, Math.min(hi, hi - (p.y / W1) * (hi - lo)))];
    S1.dirty = true; s1Info(); S1.check();
  };
  $("s0-cv").addEventListener("pointerdown", (e) => { S1.drag = true; $("s0-cv").setPointerCapture(e.pointerId); movePoint(e); });
  $("s0-cv").addEventListener("pointermove", (e) => { if (S1.drag) movePoint(e); });
  ["pointerup", "pointercancel"].forEach((n) => $("s0-cv").addEventListener(n, () => (S1.drag = false)));
  $("s0-alarm").addEventListener("change", (e) => { S1.alarm = e.target.checked; S1.dirty = true; s1Info(); S1.check(); });
  s1Info();

  // ---------- stage 2 interactions ----------
  document.querySelectorAll("#s1-mode button").forEach((b) => b.addEventListener("click", () => {
    S2.mode = b.dataset.v; if (S2.mode === "flip") S2.seen = true; syncMode(); if (S2.trained) { s2Stats(); S2.check(); }
  }));
  $("s1-cv").addEventListener("pointerdown", (e) => {
    if (!S2.trained) return ML.toast("Train the AI first!");
    const p = ML.canvasPoint($("s1-cv"), e, 360, 120), k = Math.floor(p.y / tile) * 6 + Math.floor(p.x / tile);
    if (k < 0 || k > 11) return;
    S2.ov[k] = !tileImg(k).snow; S2.dirty = true;
    const { x, snow } = tileImg(k), res = F.label(S2.m, x), is = S2.G.y[k];
    $("s1-read").innerHTML = `Picture ${k + 1} is really a <b>${is ? "wolf" : "dog"}</b>, now with <b>${snow ? "snow" : "no snow"}</b>. The AI says <b>${res ? "wolf" : "dog"}</b>, ${pct(F.sure(F.predict(S2.m, x)))}% sure.`;
    if (!is && snow && res === 1) complete(S2, 1, "A dog with a snow patch painted on, and the AI says <b>wolf</b>. Shortcut exposed!");
  });
  $("s1-mix").addEventListener("change", (e) => { S2.mixed = e.target.checked; startTrain(S2); });
  const origS2Reset = S2.reset;
  S2.reset = () => { origS2Reset(); S2.mode = "match"; S2.seen = false; syncMode(); };
  const baseDone2 = S2.done;
  S2.done = () => { baseDone2(); };

  // ---------- stage 3 interactions ----------
  ML.bindRange("#s2-eps", (v) => v.toFixed(3), (v) => { S3.eps = v; S3.dirty = true; if (S3.ep) s3Info(); });
  document.querySelectorAll("#s2-mode button").forEach((b) => b.addEventListener("click", () => {
    S3.smart = b.dataset.v === "smart";
    document.querySelectorAll("#s2-mode button").forEach((x) => x.classList.toggle("on", x === b));
    S3.dirty = true; if (S3.ep) s3Info();
  }));

  // ---------- stage 4 interactions ----------
  $("s3-ask").addEventListener("click", () => s4Ask($("s3-in").value));
  $("s3-in").addEventListener("keydown", (e) => { if (e.key === "Enter") s4Ask($("s3-in").value); });
  $("s3-chips").addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (b) s4Ask(b.dataset.c); });
  $("s3-dc").addEventListener("click", s4Check);
  $("s3-auto").addEventListener("change", (e) => { S4.auto = e.target.checked; });

  // ---------- tabs ----------
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => {
    cur = +b.dataset.s;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".pane").forEach((p, k) => p.classList.toggle("on", k === cur));
    stages[cur].dirty = true;
  }));

  // ---------- main loop ----------
  const RATE = [5, 4, 4, 0.2];
  function frame() {
    stages.forEach((st, k) => {
      if (st.running) {
        const n = ML.ticks(RATE[k], "tr" + k);
        for (let j = 0; j < n && st.ep < st.steps; j++) tick(st);
        if (k === 0 && st.hist.length) s1Info();
        if (k === 1) { s2Stats(); s2Info(); }
        if (k === 2 && st.hist.length) { const t = st.hist[st.hist.length - 1]; setTiles(st, [["Test accuracy", pct(t[0]) + "%", "var(--good)"], ["Average sureness", pct(t[1]) + "%"]]); }
        if (k === 3 && st.hist.length) setTiles(st, [["Quiz on the 8 facts it read", pct(st.hist[st.hist.length - 1][0]) + "%", "var(--good)"], ["Sentences read", st.ep]]);
        if (st.ep >= st.steps) finish(st);
      }
      if (k === cur && (st.dirty || st.running)) { st.draw && st.draw(); drawChart(st); st.dirty = false; }
    });
    requestAnimationFrame(frame);
  }
  stages.forEach((st) => { st.draw && st.draw(); drawChart(st); });
  setTiles(S1, [["Test accuracy (familiar animals)", "–"], ["Sure about far-away animals", "–"]]);
  setTiles(S2, [["Test accuracy: snow like training", "–"], ["Test accuracy: snow flipped", "?"]]);
  setTiles(S3, [["Test accuracy", "–"], ["Average sureness", "–"]]);
  setTiles(S4, [["Quiz on the 8 facts it read", "–"], ["Sentences read", 0]]);
  s2Info(); s3Info && S3.ep && s3Info(); s4Init();
  function s4Init() { inside(S4, row("book", "It has read nothing yet. Press <b>Train the AI</b>.")); inside(S3, row("book", "Train it, then slide the nudge size.")); }
  window.matchMedia && matchMedia("(prefers-color-scheme: dark)").addEventListener && matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => stages.forEach((s) => (s.dirty = true)));
  new MutationObserver(() => stages.forEach((s) => (s.dirty = true))).observe(document.documentElement, { attributes: true });
  requestAnimationFrame(frame);
})();
