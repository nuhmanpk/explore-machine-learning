// Your Data, Your Privacy: UI. Lab 1 leaky diary, Lab 2 detective, charts, challenges, protections.
(function () {
  const P = window.AIPrivacy;
  const $ = (id) => document.getElementById(id);
  const pct = (x) => Math.round(x * 100);
  const col = (v, fb) => ML.cssVar(v) || fb;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const S = {
    lab: "A", running: false, speed: 1, sigma: 0, reveal: null, dirty: true, mapDirty: true,
    A: { lm: null, rnd: null, hist: [], ev: [], max: 300, k: 1, pages: 0 },
    B: { M: null, net: null, rnd: null, hist: [], ev: [], max: 1500, n: 40, l2: 0, st: null, seed: 3 },
    game: { ok: 0, n: 0, cur: null },
  };
  const SEED_A = 5;

  // ---------------- Lab A ----------------
  function resetA() {
    S.A.lm = P.setCorpus(P.newLM(), { k: S.A.k, pages: S.A.pages });
    S.A.rnd = P.mulberry(SEED_A); S.A.hist = []; S.A.ev = [];
    sampleA(); S.dirty = true;
  }
  function sampleA() {
    const lm = S.A.lm; S.A.hist.push({ r: lm.round, a: P.leakProb(lm), b: P.utility(lm) });
  }
  function applyCorpus() { P.setCorpus(S.A.lm, { k: S.A.k, pages: S.A.pages }); }
  function mark(lab, label) { const L = S[lab]; const r = lab === "A" ? L.lm.round : L.net.round; if (r > 0) L.ev.push({ r, label }); S.dirty = true; }

  function renderA() {
    const lm = S.A.lm, top = P.topK(lm, P.PROMPT, 5), leak = P.leakProb(lm);
    const best = top[0], leaks = best.w === P.SECRET_CODE;
    // candidates (always include the secret so you can see its chance)
    const rows = top.slice();
    if (!rows.some((r) => r.w === P.SECRET_CODE)) rows[4] = { w: P.SECRET_CODE, p: leak };
    $("cands").innerHTML = rows.map((r) => `<div class="crow ${r.w === P.SECRET_CODE ? "sec" : ""}"><span>${r.w === "<s>" ? "(nothing)" : r.w}</span><div class="t"><div class="f" style="width:${Math.min(100, r.p * 100)}%"></div></div><b>${pct(r.p)}%</b></div>`).join("");
    const g = $("gap"); g.textContent = lm.round === 0 ? "?" : best.w; g.classList.toggle("leak", leaks && lm.round > 0);
    const v = $("verdictA"), lvl = leaks && leak > 0.4 ? "bad" : leak > 0.1 ? "mid" : "ok";
    v.className = "pill " + lvl;
    v.innerHTML = ML.icon(lvl === "ok" ? "check" : "info") + (lvl === "bad" ? ` Leaked! The secret code has a ${pct(leak)}% chance` : lvl === "mid" ? ` The secret code has a ${pct(leak)}% chance (it knows a little)` : ` Safe so far: the secret code has a ${pct(leak)}% chance`);
    $("st-r").textContent = lm.round; $("st-k2").textContent = "Leak chance"; $("st-v2").textContent = pct(leak) + "%";
    // inside: what follows "of mia is" in the pile
    const sents = P.corpus({ k: S.A.k, pages: S.A.pages }).filter((s) => / of mia is /.test(" " + s + " "));
    const cnt = {}; sents.forEach((s) => { const w = s.split(" ").pop(); cnt[w] = (cnt[w] || 0) + 1; });
    const pr = P.nextProbs(lm, P.PROMPT);
    const list = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a < b ? -1 : 1)).slice(0, 7)
      .map((w) => `<b${w === P.SECRET_CODE ? ' style="color:var(--bad)"' : ""}>${w}</b> seen ${cnt[w]}× → now ${pct(pr[lm.words.get(w)])}%`).join("<br>");
    const sk = S.A.k, np = sents.length;
    let h = `<div>${ML.icon("book")} The model only keeps a table: <i>after the 3 words "of mia is", what word comes next?</i></div><div class="arrow">${ML.icon("arrow-down")}</div>`;
    h += `<div>${ML.icon("search")} In the diary, those words are followed by:<br>${list || "nothing"}</div><div class="arrow">${ML.icon("arrow-down")}</div>`;
    if (lm.round === 0) h += `<div>${ML.icon("zap")} It hasn't trained yet, so every word is about equally likely. Press <b>Train</b>.</div>`;
    else if (sk === 0) h += `<div>${ML.icon("check")} The secret is <b>not in the diary</b>, so the model can only guess it by luck (${pct(leak)}%).</div>`;
    else if (leak > 0.4) h += `<div>${ML.icon("info")} The code appears <b>${sk}×</b> out of ${np} sentences that start this way. Training pushes each word up in proportion to how often it was seen, so the code became its <b>favourite answer</b> (${pct(leak)}%).${S.sigma > 0 ? " Noise is on, but the code was still strong enough to show through." : ""}</div>`;
    else h += `<div>${ML.icon("check")} The code appears only ${sk}× among ${np} sentences, so it shares the probability with ${np - sk} harmless answers: <b>${pct(leak)}%</b>.${S.sigma > 0 ? " Limited steps and noise also stop any one sentence from standing out." : ""}</div>`;
    h += `<div class="muted" style="font-weight:800">Diary skill (does it predict the harmless words?): ${pct(P.utility(lm))}%</div>`;
    $("inside").innerHTML = h;
  }
  function renderDiary() {
    const s = P.corpus({ k: S.A.k, pages: S.A.pages });
    $("diary").innerHTML = s.map((x) => `<div class="${x === P.SECRET_SENTENCE ? "sec" : ""}">${x === P.SECRET_SENTENCE ? "🔒 " : ""}${x}</div>`).join("");
    $("diaryN").textContent = `(${s.length} sentences, the secret appears ${S.A.k}×)`;
  }

  // ---------------- Lab B ----------------
  const MW = 440, MH = 440, map = ML.setupCanvas($("mapcv"), MW, MH);
  const hist = ML.setupCanvas($("histcv"), 440, 170);
  function resetB() {
    const B = S.B;
    B.M = P.makeMembership(B.seed, B.n); B.net = P.newNet(B.seed + 100); B.rnd = P.mulberry(B.seed + 7);
    B.hist = []; B.ev = []; B.st = null; S.game = { ok: 0, n: 0, cur: null };
    sampleB(); S.dirty = S.mapDirty = true; newDot(); scoreText();
  }
  function sampleB() {
    const B = S.B; B.st = P.stats(B.net, B.M, +$("thr").value);
    B.hist.push({ r: B.net.round, a: B.st.best, b: B.st.testAcc });
  }
  const sx = (x) => ((x + 1) / 2) * MW, sy = (y) => (1 - (y + 1) / 2) * MH;
  function drawMap() {
    const B = S.B, c = map.ctx, N = 36, cw = MW / N;
    c.clearRect(0, 0, MW, MH);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = ((i + 0.5) / N) * 2 - 1, y = 1 - ((j + 0.5) / N) * 2, p = P.prob1(B.net, x, y);
      c.fillStyle = p >= 0.5 ? `rgba(255,138,61,${0.12 + 0.4 * (p - 0.5) * 2})` : `rgba(47,155,255,${0.12 + 0.4 * (0.5 - p) * 2})`;
      c.fillRect(i * cw, j * cw, cw + 0.5, cw + 0.5);
    }
    const dot = (d, fill) => {
      c.beginPath(); c.arc(sx(d.x), sy(d.y), fill ? 6 : 5.5, 0, 7);
      const k = d.l ? "#ff8a3d" : "#2f9bff";
      if (fill) { c.fillStyle = k; c.fill(); c.lineWidth = 2; c.strokeStyle = "#1f2140"; c.stroke(); }
      else { c.lineWidth = 2.5; c.strokeStyle = k; c.stroke(); }
    };
    if ($("showNew").checked) B.M.pool.slice(0, 40).forEach((d) => dot(d, false));
    B.M.train.forEach((d) => dot(d, true));
    const g = S.game.cur;
    if (g) { c.beginPath(); c.arc(sx(g.d.x), sy(g.d.y), 13, 0, 7); c.lineWidth = 3.5; c.strokeStyle = col("--ink", "#1f2140"); c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); }
  }
  function drawHist() {
    const B = S.B, st = B.st, c = hist.ctx, w = 440, h = 170, L = 6, Bt = 22, bw = (w - 2 * L) / 10;
    c.clearRect(0, 0, w, h);
    c.fillStyle = col("--canvas-bg", "#fff"); c.fillRect(0, 0, w, h);
    const mx = Math.max(0.2, ...st.hm, ...st.hn), H = h - Bt - 8;
    for (let i = 0; i < 10; i++) {
      c.fillStyle = col("--muted", "#8a8cab"); c.globalAlpha = 0.75; c.fillRect(L + i * bw + 2, 4 + H - (st.hn[i] / mx) * H, bw / 2 - 2, (st.hn[i] / mx) * H);
      c.fillStyle = col("--accent", "#6c5ce7"); c.fillRect(L + i * bw + bw / 2, 4 + H - (st.hm[i] / mx) * H, bw / 2 - 2, (st.hm[i] / mx) * H); c.globalAlpha = 1;
    }
    c.fillStyle = col("--ink-2", "#555"); c.font = "700 11px Nunito, sans-serif"; c.textAlign = "center";
    [0, 0.5, 1].forEach((v) => c.fillText(v === 0 ? "unsure" : v === 1 ? "very sure" : "50%", L + v * (w - 2 * L) * (v === 1 ? 0.96 : v === 0 ? 0.04 : 1) , h - 6));
    const tx = L + +$("thr").value * (w - 2 * L);
    c.strokeStyle = col("--ink", "#1f2140"); c.lineWidth = 3; c.beginPath(); c.moveTo(tx, 2); c.lineTo(tx, h - Bt); c.stroke();
  }
  function renderB() {
    const B = S.B, st = (B.st = P.stats(B.net, B.M, +$("thr").value));
    const lvl = st.attack > 0.64 ? "bad" : st.attack > 0.55 ? "mid" : "ok";
    $("verdictB").className = "pill " + lvl;
    $("verdictB").innerHTML = ML.icon(lvl === "ok" ? "check" : "info") + ` Your rule wins ${pct(st.attack)}% (guessing = 50%) · best rule ${pct(st.best)}%`;
    $("st-r").textContent = B.net.round; $("st-k2").textContent = "Detective wins"; $("st-v2").textContent = B.net.round ? pct(st.best) + "%" : "–";
    let h = `<div>${ML.icon("book")} The net got <b>${pct(st.trainAcc)}%</b> of its training dots right, but only <b>${pct(st.testAcc)}%</b> of fresh dots on a clean test.</div><div class="arrow">${ML.icon("arrow-down")}</div>`;
    h += `<div>${ML.icon("search")} Average sureness about the dot's label: training dots <b>${pct(st.meanM)}%</b>, new dots <b>${pct(st.meanN)}%</b>. Gap: <b>${pct(st.gap)}</b> points.</div><div class="arrow">${ML.icon("arrow-down")}</div>`;
    if (B.net.round === 0) h += `<div>${ML.icon("zap")} Not trained yet: the model is guessing, so no clue to find. Press <b>Train</b>.</div>`;
    else if (st.gap > 0.2) h += `<div>${ML.icon("info")} 20% of the dots have a <b>wrong, random label</b>. A model that studies too long <b>memorises even those</b>, so it is very sure about its own dots and unsure about new ones. That gap is the detective's clue: best rule ${pct(st.best)}%.</div>`;
    else h += `<div>${ML.icon("check")} The model learned the <b>pattern</b> instead of memorising dots, so it treats seen and unseen dots alike. The clue is almost gone: best rule ${pct(st.best)}%.</div>`;
    $("inside").innerHTML = h;
    drawHist();
  }
  function newDot() {
    const B = S.B, r = Math.random, isIn = r() < 0.5;
    const d = isIn ? B.M.train[Math.floor(r() * B.M.train.length)] : B.M.pool[Math.floor(r() * B.M.pool.length)];
    S.game.cur = { d, isIn };
    const c = P.conf(B.net, d);
    $("detInfo").innerHTML = `The ringed dot is labelled <b style="color:${d.l ? "#e0701f" : "#1f7fe0"}">${d.l ? "orange" : "blue"}</b>. The model is <b>${pct(c)}% sure</b> about that label. Was it in the training set?`;
    S.mapDirty = true;
  }
  function scoreText() { const g = S.game; $("detScore").textContent = `Score: ${g.ok} of ${g.n} (guessing gets about half)`; }
  function answer(sayIn) {
    const g = S.game, cur = g.cur; if (!cur) return;
    const right = sayIn === cur.isIn; g.n++; if (right) g.ok++;
    scoreText();
    ML.toast(right ? "Right!" : `Nope, it was ${cur.isIn ? "in training" : "brand new"}.`);
    if (g.n === 10) {
      const p = g.ok;
      ML.say(p >= 7 ? `You got <b>${p}/10</b> as detective! Is the model very sure about dots it studied? That's a privacy leak.` : `You got <b>${p}/10</b>, about what guessing gives. Maybe the model isn't overfit, or try training longer with no brakes.`);
      g.ok = 0; g.n = 0; scoreText();
    }
    newDot();
  }

  // ---------------- chart ----------------
  const ch = ML.setupCanvas($("chart"), 900, 260);
  function drawChart() {
    const c = ch.ctx, W = 900, Ht = 260, L = 44, R = 14, T = 12, Bm = 28, lab = S.lab, D = S[lab];
    c.clearRect(0, 0, W, Ht);
    const maxX = Math.max(D.max, 10), X = (r) => L + (r / maxX) * (W - L - R), Y = (v) => T + (1 - v) * (Ht - T - Bm);
    c.font = "700 11px Nunito, sans-serif"; c.textAlign = "right"; c.fillStyle = col("--muted", "#888"); c.strokeStyle = col("--line", "#ddd"); c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = i / 4; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(W - R, Y(v)); c.stroke(); c.fillText(pct(v) + "%", L - 6, Y(v) + 4); }
    c.textAlign = "center"; for (let i = 0; i <= 5; i++) c.fillText(Math.round((maxX * i) / 5), X((maxX * i) / 5), Ht - 8);
    c.fillText("training rounds", W / 2, Ht - 0.5 + 0);
    if (lab === "B") { c.setLineDash([5, 4]); c.strokeStyle = col("--ink-2", "#555"); c.beginPath(); c.moveTo(L, Y(0.5)); c.lineTo(W - R, Y(0.5)); c.stroke(); c.setLineDash([]); c.textAlign = "left"; c.fillStyle = col("--ink-2", "#555"); c.fillText("guessing", L + 6, Y(0.5) - 5); }
    const line = (key, color) => { c.strokeStyle = color; c.lineWidth = 3; c.lineJoin = "round"; c.beginPath(); D.hist.forEach((p, i) => (i ? c.lineTo(X(p.r), Y(p[key])) : c.moveTo(X(p.r), Y(p[key])))); c.stroke(); };
    line("b", col("--accent", "#6c5ce7")); line("a", col("--bad", "#ff4d5e"));
    D.ev.forEach((e, i) => {
      const x = X(e.r); c.strokeStyle = col("--warn", "#ffb020"); c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, T); c.lineTo(x, Ht - Bm); c.stroke();
      c.fillStyle = col("--warn", "#ffb020"); c.beginPath(); c.moveTo(x, T); c.lineTo(x + 8, T + 5 + (i % 3) * 14); c.lineTo(x, T + 10 + (i % 3) * 14); c.fill();
      c.fillStyle = col("--ink", "#1f2140"); c.textAlign = x > W - 160 ? "right" : "left"; c.fillText(e.label, x + (x > W - 160 ? -4 : 11), T + 14 + (i % 3) * 14 - 4 + 4);
    });
    $("chartSub").textContent = lab === "A" ? "(chance that the model gives the secret code)" : "(how often the detective is right, and how good the model is on new dots)";
    $("chartLegend").innerHTML = lab === "A"
      ? `<span><i style="background:var(--bad)"></i>Chance of the secret code</span><span><i style="background:var(--accent)"></i>Diary skill</span><span><i style="background:var(--warn);height:3px"></i>You changed something</span>`
      : `<span><i style="background:var(--bad)"></i>Detective's best score</span><span><i style="background:var(--accent)"></i>Accuracy on new dots</span><span><i style="background:var(--warn);height:3px"></i>You changed something</span>`;
  }

  // ---------------- training loop ----------------
  const PER = { A: { 0.5: 1, 1: 2, 3: 6, 10: 16, 0: 30 }, B: { 0.5: 3, 1: 8, 3: 25, 10: 70, 0: 120 } };
  let acc = 0;
  function maxOf() { return S[S.lab].max; }
  function roundOf() { const m = S.lab === "A" ? S.A.lm : S.B.net; return m ? m.round : 0; }
  function setRunning(on) {
    S.running = on && roundOf() < maxOf();
    $("train").innerHTML = S.running ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} ${roundOf() >= maxOf() ? "Done" : roundOf() > 0 ? "Keep training" : "Train"}`;
  }
  function stepsNow() {
    const base = PER[S.lab][S.speed]; if (reduce && S.speed !== 0) return Math.max(base, 2);
    return base;
  }
  function frame() {
    if (S.running) {
      const A = S.lab === "A", D = S[S.lab], n = stepsNow();
      for (let i = 0; i < n && roundOf() < D.max; i++) {
        if (A) { P.stepLM(D.lm, { sigma: S.sigma, rnd: D.rnd }); if (D.lm.round % 3 === 0) sampleA(); }
        else { P.stepNet(D.net, D.M.train, { lr: 0.5, l2: D.l2, sigma: S.sigma, rnd: D.rnd }); if (D.net.round % 25 === 0) sampleB(); }
      }
      S.dirty = S.mapDirty = true;
      if (roundOf() >= D.max) { A ? sampleA() : sampleB(); setRunning(false); finish(); }
    }
    if (S.dirty || S.mapDirty) {
      if (S.lab === "A") renderA(); else { renderB(); if (S.mapDirty) drawMap(); }
      drawChart(); S.dirty = S.mapDirty = false;
    }
    requestAnimationFrame(frame);
  }
  function finish() {
    if (S.reveal) { const f = S.reveal; S.reveal = null; f(); return; }
    if (S.lab === "A") {
      const l = P.leakProb(S.A.lm);
      ML.say(l > 0.4 ? `Done! The model completes the code with <b>${pct(l)}%</b> chance. It <b>memorised</b> a secret. Try removing it, or adding noise.` : `Done. The secret code only gets <b>${pct(l)}%</b>. Try repeating it 10 times and see what changes.`);
    } else {
      const st = S.B.st;
      ML.say(st.best > 0.64 ? `The detective wins <b>${pct(st.best)}%</b> of guesses, well above chance. The model is surest about dots it studied.` : `The detective only wins <b>${pct(st.best)}%</b>, close to guessing. The model treats seen and new dots alike.`);
    }
  }
  $("train").addEventListener("click", () => {
    if (S.running) return setRunning(false);
    if (roundOf() >= maxOf()) return ML.toast("Done! Raise 'Train for' or press Start over.");
    setRunning(true);
  });
  function restart() { S.lab === "A" ? resetA() : resetB(); setRunning(false); if (S.lab === "A") { renderDiary(); } S.dirty = S.mapDirty = true; }
  $("reset").addEventListener("click", () => { restart(); ML.say("Fresh model, nothing learned yet. Press <b>Train</b>."); });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b)); S.speed = +b.dataset.v;
  }));

  // ---------------- controls ----------------
  function setSlider(id, v) { const el = $(id); el.value = v; el.dispatchEvent(new Event("input")); }
  ML.bindRange("#kA", (v) => (v === 0 ? "removed" : v + "×"), (v) => { if (v !== S.A.k) { S.A.k = v; if (S.A.lm) { applyCorpus(); renderDiary(); S.dirty = true; } } });
  ML.bindRange("#pagesA", (v) => v, (v) => { if (v !== S.A.pages) { S.A.pages = v; if (S.A.lm) { applyCorpus(); renderDiary(); S.dirty = true; } } });
  ML.bindRange("#roundsA", null, (v) => { S.A.max = v; S.dirty = true; if (S.lab === "A" && !S.running) setRunning(false); });
  ML.bindRange("#l2B", (v) => (v === 0 ? "off" : v.toFixed(3)), (v) => { S.B.l2 = v; });
  ML.bindRange("#roundsB", null, (v) => { S.B.max = v; S.dirty = true; if (S.lab === "B" && !S.running) setRunning(false); });
  ML.bindRange("#thr", (v) => pct(v) + "%", () => { if (S.B.net) { S.dirty = true; } });
  ML.bindRange("#sigma", (v) => (v === 0 ? "off" : v.toFixed(2)), (v) => { S.sigma = v; S.dirty = true; });
  // mark the moment on change (after the user lets go)
  [["kA", "A", (v) => (v === 0 ? "secret removed" : "secret ×" + v)], ["pagesA", "A", (v) => v + " extra pages"], ["l2B", "B", (v) => (v ? "regularise" : "no regularise")]].forEach(([id, lab, f]) =>
    $(id).addEventListener("change", () => mark(lab, f(+$(id).value))));
  $("sigma").addEventListener("change", () => { const v = +$("sigma").value; mark(S.lab, v ? "noise " + v : "noise off"); });
  document.querySelectorAll("#nB button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#nB button").forEach((x) => x.classList.toggle("on", x === b));
    S.B.n = +b.dataset.v; if (S.lab === "B") { restart(); ML.say(`Training set: <b>${S.B.n}</b> dots. Starting fresh. More dots means it is harder to memorise each one.`); }
    else { resetB(); }
  }));
  $("showNew").addEventListener("change", () => { S.mapDirty = true; });
  $("detIn").addEventListener("click", () => answer(true));
  $("detNew").addEventListener("click", () => answer(false));
  $("mapcv").addEventListener("pointerdown", () => {});

  function setLab(l) {
    S.lab = l; if (l === "B" && !S.B.net) resetB();
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === l));
    $("labA").hidden = l !== "A"; $("labB").hidden = l !== "B"; $("ctlA").hidden = l !== "A"; $("ctlB").hidden = l !== "B";
    S.dirty = S.mapDirty = true; setRunning(false);
  }
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => setLab(b.dataset.v)));

  // ---------------- guess first ----------------
  function bindGuess(box, resId, run, judge, texts) {
    let g = -1;
    box.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => {
      g = +b.dataset.g; box.querySelectorAll("[data-g]").forEach((x) => x.classList.toggle("on", x === b));
      $(resId).innerHTML = `You guessed: <b>${b.textContent.trim()}</b>. Now press <b>Show me</b>. ` + `<button class="btn small primary" data-show="1">${ML.icon("play")} Show me</button>`;
      $(resId).querySelector("[data-show]").addEventListener("click", () => {
        if (g < 0) return;
        S.speed = 0; document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x.dataset.v === "0"));
        run();
        S.reveal = () => {
          const r = judge(), right = r.cat === g;
          $(resId).innerHTML = (right ? `<b style="color:var(--good)">You were right!</b> ` : `<b style="color:var(--bad)">Not quite.</b> `) + r.text;
          ML.say(r.text); if (right) ML.confetti(30);
        };
        setRunning(true);
      });
    }));
  }
  bindGuess($("gA"), "gAres", () => {
    S.A.k = 8; S.A.pages = 0; S.A.max = 300; S.sigma = 0; setSlider("kA", 8); setSlider("pagesA", 0); setSlider("roundsA", 300); setSlider("sigma", 0); resetA(); renderDiary();
  }, () => { const l = P.leakProb(S.A.lm); return { cat: l < 0.2 ? 0 : l < 0.5 ? 1 : 2, text: `With the secret in the diary 8 times, the model completes it with a <b>${pct(l)}%</b> chance. Repeating makes it stick.` }; });
  bindGuess($("gB"), "gBres", () => {
    S.B.n = 40; S.B.l2 = 0; S.B.max = 1500; S.sigma = 0; setSlider("l2B", 0); setSlider("roundsB", 1500); setSlider("sigma", 0);
    document.querySelectorAll("#nB button").forEach((x) => x.classList.toggle("on", x.dataset.v === "40")); resetB();
  }, () => { const b = S.B.st.best; return { cat: b < 0.58 ? 0 : b < 0.76 ? 1 : 2, text: `The best detective rule wins <b>${pct(b)}%</b> of the time (50% is guessing). Overtrained models give clues away. Play the detective game, then drag the rule.` }; });

  // ---------------- challenges + protections ----------------
  function chalNote(t) { $("chalNote").innerHTML = t; }
  $("c1").addEventListener("click", () => {
    setLab("A"); setSlider("kA", 10); mark("A", "secret ×10"); if (S.A.max <= S.A.lm.round) setSlider("roundsA", Math.min(600, S.A.lm.round + 150));
    setRunning(true); ML.say(`The secret now appears <b>10 times</b> in the diary. Watch the red line.`); chalNote("Repeating the secret pushes its chance up fast: models learn what they see often.");
  });
  $("c2").addEventListener("click", () => {
    setLab("B"); if (S.B.n !== 40) { S.B.n = 40; document.querySelectorAll("#nB button").forEach((x) => x.classList.toggle("on", x.dataset.v === "40")); resetB(); }
    setSlider("l2B", 0); setSlider("sigma", 0); setSlider("roundsB", 3000); mark("B", "train too long");
    if (S.speed < 3 && S.speed !== 0) { S.speed = 10; document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x.dataset.v === "10")); }
    setRunning(true); ML.say(`No brakes, 3000 rounds. Watch the detective's line climb as the model memorises its dots, while accuracy on new dots stalls.`);
    chalNote("Overtraining makes the model surer about dots it saw than dots it didn't, which is exactly what the detective needs.");
  });
  $("c3").addEventListener("click", () => {
    setSlider("sigma", 1); mark(S.lab, "noise 1"); if (roundOf() >= maxOf()) setSlider(S.lab === "A" ? "roundsA" : "roundsB", Math.min(S.lab === "A" ? 600 : 3000, roundOf() + (S.lab === "A" ? 150 : 600)));
    setRunning(true); ML.say(`Privacy dial set to <b>1</b>. Each new step is limited and fuzzed. Noise protects what is learned <b>from now on</b>, it cannot make a model forget. For the full effect press <b>Start over</b> with the dial on.`);
    chalNote("Noise hides single examples, but it costs accuracy. That is the privacy-vs-usefulness trade-off.");
  });
  $("p-rm").addEventListener("click", () => { setLab("A"); setSlider("kA", 0); mark("A", "secret removed"); setRunning(roundOf() < maxOf() || (setSlider("roundsA", Math.min(600, roundOf() + 150)), true)); ML.say("The secret is out of the diary. The model keeps training, and its memory of the code can't grow back."); });
  $("p-dd").addEventListener("click", () => { setLab("A"); setSlider("kA", 1); mark("A", "keep one copy"); setRunning(roundOf() < maxOf() || (setSlider("roundsA", Math.min(600, roundOf() + 150)), true)); ML.say("Only one copy of the secret left. With no repeats it is just one voice in a crowd."); });

  // privacy-vs-usefulness curve (computed live, in small chunks)
  const cv = ML.setupCanvas($("curvecv"), 300, 170);
  function drawCurve(pts, labelA) {
    const c = cv.ctx; c.clearRect(0, 0, 300, 170);
    const L = 30, T = 8, Wd = 300 - L - 10, Ht = 170 - T - 30, X = (i) => L + (i / 8) * Wd, Y = (v) => T + (1 - v) * Ht;
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = col("--muted", "#888"); c.strokeStyle = col("--line", "#ddd"); c.textAlign = "right";
    [0, 0.5, 1].forEach((v) => { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(300 - 10, Y(v)); c.stroke(); c.fillText(pct(v) + "%", L - 3, Y(v) + 3); });
    c.textAlign = "center"; pts.sig.forEach((s, i) => c.fillText(s, X(i * (8 / (pts.sig.length - 1))), 164));
    [["bad", "--bad", "#ff4d5e"], ["use", "--accent", "#6c5ce7"]].forEach(([k, v, fb]) => {
      c.strokeStyle = col(v, fb); c.lineWidth = 3; c.beginPath();
      pts[k].forEach((y, i) => { const x = X(i * (8 / (pts.sig.length - 1))); i ? c.lineTo(x, Y(y)) : c.moveTo(x, Y(y)); }); c.stroke();
      pts[k].forEach((y, i) => { c.fillStyle = col(v, fb); c.beginPath(); c.arc(X(i * (8 / (pts.sig.length - 1))), Y(y), 3.5, 0, 7); c.fill(); });
    });
  }
  $("curve").addEventListener("click", () => {
    const sig = [0, 0.5, 1, 1.5, 2], pts = { sig, bad: [], use: [] }, lab = S.lab, btn = $("curve");
    btn.disabled = true; let i = 0;
    $("curveNote").textContent = "Training " + sig.length + " small models…";
    const next = () => {
      if (i >= sig.length) { btn.disabled = false; $("curveNote").textContent = lab === "A" ? "Lab 1 curve (secret ×10, 300 rounds): more noise, smaller leak, but the diary skill drops too. It is a toy, not a guarantee." : "Lab 2 curve (40 dots, 800 rounds): noise shrinks the detective's edge and the model gets worse on new dots. It is a toy, not a guarantee."; return; }
      if (lab === "A") { const r = P.runA({ k: 10, pages: 0, rounds: 300, sigma: sig[i], seed: 5 }); pts.bad.push(r.leak); pts.use.push(r.util); }
      else { const r = P.runB({ n: 40, rounds: 800, l2: 0, sigma: sig[i], seed: 3 }); pts.bad.push(r.st.best); pts.use.push(r.st.testAcc); }
      i++; drawCurve(pts); setTimeout(next, 20);
    };
    setTimeout(next, 20);
  });
  drawCurve({ sig: [0, 0.5, 1, 1.5, 2], bad: [], use: [] });

  // ---------------- boot ----------------
  resetA(); renderDiary(); setRunning(false); drawChart();
  document.addEventListener("themechange", () => { S.dirty = S.mapDirty = true; });
  new MutationObserver(() => { S.dirty = S.mapDirty = true; }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  requestAnimationFrame(frame);
})();
