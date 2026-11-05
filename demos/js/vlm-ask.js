// Ask the Picture page. Model + data live in vlm-ask-core.js (AskCore).
(function () {
  const C = window.AskCore, $ = (id) => document.getElementById(id);
  const SS = 360, ES = 200, CW = 300, CH = 200, MAX_STEPS = 2400;
  const sc = ML.setupCanvas($("scene"), SS, SS).ctx, ec = ML.setupCanvas($("eyes"), ES, ES).ctx, cc = ML.setupCanvas($("chart"), CW, CH).ctx;
  const FILL = { red: "#ef3b4f", blue: "#2f7bff", green: "#22b455" };
  const S = {
    model: null, quiz: C.makeSet(4242, 200), seed: 1, training: false, hist: [], acc: null,
    scene: null, qi: 0, tool: "circle", colour: "red", heat: true, cursor: 5, out: null,
    hits: {}, asked: false, edited: false, lastAct: Date.now(), raf: 0,
  };

  // a friendly starting picture: one of each shape, a couple of colours
  function starterScene() {
    const s = C.emptyScene();
    s[1] = { shape: "circle", colour: "red" }; s[6] = { shape: "square", colour: "blue" };
    s[11] = { shape: "triangle", colour: "green" }; s[12] = { shape: "square", colour: "blue" }; s[3] = { shape: "circle", colour: "red" };
    return s;
  }
  function newBrain() {
    S.seed = 1 + Math.floor(Math.random() * 9e4);
    S.model = new C.VQA(S.seed); S.hist = [{ seen: 0, acc: S.model.accuracy(S.quiz) }]; S.acc = S.hist[0].acc;
  }

  // ---------- drawing ----------
  function shapePath(c, shape, x, y, s) {
    c.beginPath();
    if (shape === "circle") c.arc(x + s / 2, y + s / 2, s * 0.36, 0, Math.PI * 2);
    else if (shape === "square") c.rect(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.6);
    else { c.moveTo(x + s / 2, y + s * 0.14); c.lineTo(x + s * 0.9, y + s * 0.86); c.lineTo(x + s * 0.1, y + s * 0.86); c.closePath(); }
  }
  function drawScene() {
    const c = sc, cell = SS / C.G, ink = ML.cssVar("--ink"), line = ML.cssVar("--line"), acc = ML.cssVar("--accent");
    c.clearRect(0, 0, SS, SS);
    c.fillStyle = ML.cssVar("--card"); c.fillRect(0, 0, SS, SS);
    const at = S.out ? S.out.attn : null, mx = at ? Math.max(...at) : 1;
    for (let i = 0; i < C.NP; i++) {
      const x = (i % C.G) * cell, y = Math.floor(i / C.G) * cell;
      if (S.heat && at) { // glow: brighter = more attention
        c.fillStyle = `rgba(255,176,32,${(0.85 * at[i]) / mx})`; c.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      }
      const o = S.scene[i];
      if (o) { shapePath(c, o.shape, x, y, cell); c.fillStyle = FILL[o.colour]; c.fill(); c.lineWidth = 3; c.strokeStyle = ink; c.stroke(); }
      if (S.heat && at) {
        c.fillStyle = ink; c.font = "800 12px Nunito, sans-serif"; c.textAlign = "right";
        c.fillText(Math.round(at[i] * 100) + "%", x + cell - 6, y + cell - 6);
      }
    }
    c.strokeStyle = line; c.lineWidth = 2;
    for (let k = 1; k < C.G; k++) { c.beginPath(); c.moveTo(k * cell, 0); c.lineTo(k * cell, SS); c.stroke(); c.beginPath(); c.moveTo(0, k * cell); c.lineTo(SS, k * cell); c.stroke(); }
    if (document.activeElement === $("scene")) {
      const x = (S.cursor % C.G) * cell, y = Math.floor(S.cursor / C.G) * cell;
      c.strokeStyle = acc; c.lineWidth = 4; c.setLineDash([6, 4]); c.strokeRect(x + 4, y + 4, cell - 8, cell - 8); c.setLineDash([]);
    }
  }
  function drawEyes() { // the 20×20 "pixels" the model reads
    const c = ec, cell = ES / C.G, px = cell / C.PX, bg = ML.cssVar("--card"), f = new Float64Array(C.F);
    c.clearRect(0, 0, ES, ES);
    for (let i = 0; i < C.NP; i++) {
      C.patchFeatures(S.scene[i], f, 0, null, 0);
      const ox = (i % C.G) * cell, oy = Math.floor(i / C.G) * cell;
      for (let k = 0; k < C.PX * C.PX; k++) {
        const r = f[k * 3], g = f[k * 3 + 1], b = f[k * 3 + 2], m = Math.max(r, g, b);
        c.fillStyle = bg; c.fillRect(ox + (k % C.PX) * px, oy + Math.floor(k / C.PX) * px, px, px);
        if (m > 0.02) { c.fillStyle = `rgba(${Math.round((r / m) * 255)},${Math.round((g / m) * 255)},${Math.round((b / m) * 255)},${m})`; c.fillRect(ox + (k % C.PX) * px + 0.5, oy + Math.floor(k / C.PX) * px + 0.5, px - 1, px - 1); }
      }
    }
    c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 2;
    for (let k = 1; k < C.G; k++) { c.beginPath(); c.moveTo(k * cell, 0); c.lineTo(k * cell, ES); c.stroke(); c.beginPath(); c.moveTo(0, k * cell); c.lineTo(ES, k * cell); c.stroke(); }
  }
  function drawChart() {
    const c = cc, L = 34, R = 10, T = 10, B = 26, muted = ML.cssVar("--muted"), line = ML.cssVar("--line");
    const xmax = Math.max(4000, S.hist.length ? S.hist[S.hist.length - 1].seen : 0);
    const X = (v) => L + (v / xmax) * (CW - L - R), Y = (v) => CH - B - v * (CH - T - B);
    c.clearRect(0, 0, CW, CH); c.font = "700 10px Nunito, sans-serif";
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => { c.strokeStyle = line; c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); c.fillStyle = muted; c.textAlign = "right"; c.fillText(Math.round(v * 100) + "%", L - 4, Y(v) + 3); });
    c.setLineDash([4, 3]); c.strokeStyle = ML.cssVar("--good"); c.beginPath(); c.moveTo(L, Y(0.85)); c.lineTo(CW - R, Y(0.85)); c.stroke();
    c.strokeStyle = muted; c.beginPath(); c.moveTo(L, Y(0.33)); c.lineTo(CW - R, Y(0.33)); c.stroke(); c.setLineDash([]);
    c.fillStyle = ML.cssVar("--good"); c.textAlign = "left"; c.fillText("goal 85%", L + 4, Y(0.85) - 4);
    c.fillStyle = muted; c.fillText("guessing", L + 4, Y(0.33) - 4);
    c.textAlign = "center"; c.fillText("practice questions", (L + CW - R) / 2, CH - 6);
    if (S.hist.length > 1) {
      c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 3; c.beginPath();
      S.hist.forEach((h, i) => (i ? c.lineTo(X(h.seen), Y(h.acc)) : c.moveTo(X(h.seen), Y(h.acc)))); c.stroke();
    }
  }

  // ---------- asking ----------
  function ask() {
    S.out = S.model.ask(S.scene, S.qi);
    const p = S.out.probs, order = p.map((v, i) => i).sort((a, b) => p[b] - p[a]).slice(0, 4), tr = C.truth(S.scene, S.qi);
    $("bars").innerHTML = order.map((i) => `<div class="bar-row ${i === S.out.answer ? "win" : ""}"><span class="bl">${C.ANSWERS[i]}</span><span class="bt"><span class="bf" style="width:${(p[i] * 100).toFixed(1)}%"></span></span><span class="bp">${Math.round(p[i] * 100)}%</span></div>`).join("");
    const ans = C.ANSWERS[S.out.answer], q = C.QUESTIONS[S.qi];
    let v;
    if (tr < 0) v = q.kind === "colourOf" && !S.scene.some((o) => o && o.shape === q.arg) ? `There is no ${q.arg}, so there's no right answer! Robo still says <b>${ans}</b>.` : `Those ${q.arg}s are different colours, so there's no single right answer.`;
    else v = tr === S.out.answer ? `<span class="ok">Right!</span> The answer is ${C.ANSWERS[tr]}.` : `<span class="bad">Oops.</span> Robo said ${ans}, but the answer is ${C.ANSWERS[tr]}.`;
    $("verdict").innerHTML = v;
    const rel = C.relevant(S.scene, S.qi), share = S.out.attn.reduce((s, a, i) => s + (rel[i] ? a : 0), 0), nrel = rel.filter(Boolean).length;
    $("lookcap").textContent = nrel ? `Robo spent ${Math.round(share * 100)}% of its looking on the ${nrel} piece${nrel > 1 ? "s" : ""} that matter (fair share would be ${Math.round((nrel / 16) * 100)}%).` : "None of the pieces match this question, so the glow has nothing special to find.";
    drawScene();
    return { tr, rel, share };
  }
  function updateStats() {
    $("seen").textContent = S.model.seen.toLocaleString();
    $("acc").textContent = S.acc == null ? "–" : Math.round(S.acc * 100) + "%";
    drawChart();
  }
  function setHow(k) { document.querySelectorAll("#how li").forEach((li) => li.classList.toggle("now", +li.dataset.k === k)); }

  // ---------- challenges ----------
  function hit(k, msg) {
    if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done");
    ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg} ${$("c-" + k).querySelector(".try").innerHTML}`);
    if (Object.keys(S.hits).length === 3) ML.confetti(50);
  }
  function check(r) {
    const q = C.QUESTIONS[S.qi];
    if (S.acc >= 0.85) hit("train", "Robo scores 85% on pictures it has never seen.");
    if (!r || !S.asked) return;
    if (q.kind === "colourOf" && r.tr >= 0 && r.tr === S.out.answer) {
      const mx = Math.max(...S.out.attn); if (S.out.attn.some((a, i) => r.rel[i] && a >= mx - 1e-9)) hit("look", "Robo looked hardest at the very shape you asked about.");
    }
    if (S.edited && S.acc >= 0.85 && r.tr >= 0 && r.tr !== S.out.answer) hit("trick", `You caught Robo out with ${S.scene.filter(Boolean).length} shapes.`);
  }

  // ---------- training loop (a slice per frame, never freezes) ----------
  function lr() { return 0.006 / (1 + S.model.steps / 1200); }
  function loop() {
    if (!S.training) return;
    const t0 = performance.now(), budget = 14;
    let n = 0;
    while (performance.now() - t0 < budget && S.model.steps < MAX_STEPS) { S.model.trainStep(16, lr()); n++; }
    if (S.model.steps % 25 < n || S.model.steps >= MAX_STEPS) {
      S.acc = S.model.accuracy(S.quiz); S.hist.push({ seen: S.model.seen, acc: S.acc });
      narrateTraining();
    }
    updateStats(); check(ask());
    if (S.model.steps >= MAX_STEPS) { stop(); ML.say(`I've practised on ${S.model.seen.toLocaleString()} pictures and score <b>${Math.round(S.acc * 100)}%</b>. Now try to trick me with your own picture!`); setHow(2); return; }
    S.raf = requestAnimationFrame(loop);
  }
  let said = 0;
  function narrateTraining() {
    const a = S.acc;
    if (a > 0.5 && said < 1) { said = 1; ML.say("I'm getting the easy ones now: <b>is there something red?</b> Colour is the first thing I notice."); }
    else if (a > 0.75 && said < 2) { said = 2; ML.say("Look at the glow! When you ask about a shape, I've learned to <b>look at that shape</b>."); setHow(1); }
    else if (a > 0.88 && said < 3) { said = 3; ML.say("Counting is the hardest for me. Try <b>How many red things?</b> on a busy picture."); }
  }
  function start() {
    if (S.model.steps >= MAX_STEPS) { ML.say("I've finished practising. Press <b>New brain</b> to watch me learn from scratch again."); return; }
    S.training = true; $("train").innerHTML = ML.icon("pause") + " Pause"; S.raf = requestAnimationFrame(loop);
    if (!S.model.steps) ML.say("Practising! Every question is a brand-new random picture. Watch the <b>quiz score</b> climb and the glow change.");
  }
  function stop() { S.training = false; cancelAnimationFrame(S.raf); $("train").innerHTML = ML.icon("play") + " " + (S.model.steps >= MAX_STEPS ? "Done!" : "Keep teaching"); }

  // ---------- interaction ----------
  function touch() { S.lastAct = Date.now(); }
  function edit(i) {
    const o = S.scene[i];
    if (S.tool === "erase" || (o && o.shape === S.tool && o.colour === S.colour)) S.scene[i] = null;
    else S.scene[i] = { shape: S.tool, colour: S.colour };
    S.edited = true; touch(); drawEyes(); const r = ask(); check(r);
    if (S.asked && r.tr >= 0) ML.say(r.tr === S.out.answer ? `Changed the picture. I still say <b>${C.ANSWERS[S.out.answer]}</b>, and that's right.` : `Hmm, I said <b>${C.ANSWERS[S.out.answer]}</b> but it's ${C.ANSWERS[r.tr]}. ${S.acc < 0.85 ? "I need more practice!" : "You found a weak spot!"}`);
  }
  $("scene").addEventListener("click", (e) => {
    const p = ML.canvasPoint($("scene"), e, SS, SS), cell = SS / C.G, i = Math.floor(p.y / cell) * C.G + Math.floor(p.x / cell);
    if (i >= 0 && i < C.NP) { S.cursor = i; edit(i); }
  });
  $("scene").addEventListener("keydown", (e) => {
    const m = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -C.G, ArrowDown: C.G }[e.key];
    if (m) { e.preventDefault(); const n = S.cursor + m; if (n >= 0 && n < C.NP && !(Math.abs(m) === 1 && Math.floor(n / C.G) !== Math.floor(S.cursor / C.G))) S.cursor = n; drawScene(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit(S.cursor); }
  });
  $("scene").addEventListener("focus", drawScene); $("scene").addEventListener("blur", drawScene);
  document.querySelectorAll("#shape-tools button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#shape-tools button").forEach((x) => x.classList.toggle("on", x === b)); S.tool = b.dataset.s; touch();
  }));
  document.querySelectorAll("#colours button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#colours button").forEach((x) => x.classList.toggle("on", x === b)); S.colour = b.dataset.c; touch();
    if (S.tool === "erase") $("shape-tools").querySelector("button").click();
  }));
  $("rand").addEventListener("click", () => { S.scene = C.randomScene(Math.random, 2, 5); S.edited = true; touch(); drawEyes(); check(ask()); });
  $("clear").addEventListener("click", () => { S.scene = C.emptyScene(); S.edited = true; touch(); drawEyes(); ask(); ML.say("An empty picture. Tap the squares to add shapes."); });
  $("tg-heat").addEventListener("click", (e) => { S.heat = !S.heat; e.currentTarget.classList.toggle("on", S.heat); e.currentTarget.setAttribute("aria-pressed", S.heat); drawScene(); touch(); });
  $("q").innerHTML = C.QUESTIONS.map((q, i) => `<option value="${i}">${q.text}</option>`).join("");
  $("q").addEventListener("change", () => {
    S.qi = +$("q").value; S.asked = true; touch(); const r = ask(); check(r);
    if (S.model.steps < 50) ML.say(`I said <b>${C.ANSWERS[S.out.answer]}</b>, but honestly I'm guessing. Teach me first!`);
    else { ML.say(`You asked "${C.QUESTIONS[S.qi].text}" I looked mostly at the glowing pieces and said <b>${C.ANSWERS[S.out.answer]}</b>.`); setHow(2); }
  });
  $("train").addEventListener("click", () => { touch(); S.training ? stop() : start(); });
  $("reset").addEventListener("click", () => {
    stop(); newBrain(); said = 0; touch(); updateStats(); ask(); $("train").innerHTML = ML.icon("play") + " Teach Robo"; setHow(0);
    ML.say("A brand-new brain. It knows nothing yet, so the glow is spread out evenly. Press <b>Teach Robo</b>!");
  });

  // gentle nudge when the learner seems stuck for ~15 s
  setInterval(() => {
    if (Date.now() - S.lastAct < 15000 || S.training) return;
    S.lastAct = Date.now();
    if (!S.model.steps) ML.say("Psst! Press <b>Teach Robo</b> to watch me learn. It only takes a few seconds.");
    else if (S.acc < 0.85) ML.say("Want me to get smarter? Press <b>Keep teaching</b>.");
    else if (!S.hits.look) ML.say('Try asking <b>"What colour is the circle?"</b> and watch which piece glows.');
    else if (!S.hits.trick) ML.say("Can you trick me? Fill the picture with <b>lots</b> of shapes, then ask a counting question.");
    else ML.say("You've beaten every challenge! Try a New brain and see if it makes the same mistakes.");
  }, 3000);

  function redraw() { drawScene(); drawEyes(); drawChart(); }
  document.addEventListener("themechange", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", redraw);

  S.scene = starterScene(); S.qi = 0; newBrain(); updateStats(); drawEyes(); ask();
})();
