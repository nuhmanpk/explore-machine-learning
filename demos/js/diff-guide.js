// Steer the Drawing page. Model + sampler live in diff-guide-core.js (GuideCore).
(function () {
  const C = window.GuideCore, $ = (id) => document.getElementById(id);
  const VS = 440, R = 2.3, LW = 300, LH = 110, MS = 150, MAX_STEPS = 4000, NDOTS = 500, NSTEPS = 50, TRAILS = 14;
  const vc = ML.setupCanvas($("view"), VS, VS).ctx, lc = ML.setupCanvas($("loss"), LW, LH).ctx;
  const COL = ["--sup", "--diff", "--unsup", "--lang"], NAMES = ["ring", "heart", "moons", "star"];
  const LADDER = [{ w: 0, k: "ignore me" }, { w: 1, k: "just asking" }, { w: 3, k: "steering" }, { w: 8, k: "way too much" }];
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ref = C.CLASSES.map((_, c) => C.sampleClass(c, 600, 900 + c));
  const S = {
    model: null, training: false, losses: [], lossAcc: 0, lossN: 0, cls: 1, w: 1.5,
    job: null, frame: 0, shown: null, ladder: null, trails: true, ghost: true, w0: {}, hits: {}, lastAct: Date.now(), drawn: 0, tick: 0,
  };
  const X = (v) => VS / 2 + (v / R) * (VS / 2), Y = (v) => VS / 2 - (v / R) * (VS / 2);

  function newBrain() { S.model = new C.GuidedDiffusion({ seed: 1 + Math.floor(Math.random() * 9e4), hidden: 64, batch: 64 }); S.losses = []; S.lossAcc = 0; S.lossN = 0; }

  // ---------- drawing ----------
  function dots(c, pts, n, col, r, alpha, map) {
    c.fillStyle = col; c.globalAlpha = alpha;
    for (let i = 0; i < n; i++) { const x = map.x(pts[2 * i]), y = map.y(pts[2 * i + 1]); c.fillRect(x - r, y - r, 2 * r, 2 * r); }
    c.globalAlpha = 1;
  }
  const BIG = { x: X, y: Y };
  function drawView() {
    const c = vc, ink = ML.cssVar("--ink"), line = ML.cssVar("--line");
    c.clearRect(0, 0, VS, VS);
    c.strokeStyle = line; c.lineWidth = 1; c.beginPath(); c.moveTo(VS / 2, 0); c.lineTo(VS / 2, VS); c.moveTo(0, VS / 2); c.lineTo(VS, VS / 2); c.stroke();
    if (!S.shown) { // first screen: the four practice shapes
      C.CLASSES.forEach((_, k) => dots(c, ref[k], 600, ML.cssVar(COL[k]), 1.8, 0.75, BIG));
      return;
    }
    const { frames, cls } = S.shown, fi = Math.min(S.frame, frames.length - 1), pts = frames[fi], col = ML.cssVar(COL[cls]);
    if (S.ghost) dots(c, ref[cls], 600, ink, 1.3, 0.18, BIG);
    if (S.trails && fi > 0) {
      c.strokeStyle = ink; c.lineWidth = 1.2; c.globalAlpha = 0.35;
      for (let i = 0; i < TRAILS; i++) { c.beginPath(); for (let k = 0; k <= fi; k += (k + 2 <= fi ? 2 : 1)) { const x = X(frames[k][2 * i]), y = Y(frames[k][2 * i + 1]); k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
      c.globalAlpha = 1;
    }
    dots(c, pts, pts.length / 2, col, 2.2, 0.85, BIG);
    if (S.trails) { c.fillStyle = ink; for (let i = 0; i < TRAILS; i++) { c.beginPath(); c.arc(X(pts[2 * i]), Y(pts[2 * i + 1]), 3, 0, 7); c.fill(); } }
  }
  function drawLoss() {
    const c = lc, muted = ML.cssVar("--muted"); c.clearRect(0, 0, LW, LH);
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "center"; c.fillText("practice rounds", LW / 2, LH - 4);
    if (S.losses.length < 2) { c.fillText("The oops line appears once Robo starts learning.", LW / 2, LH / 2); return; }
    const lo = 0.25, hi = Math.max(0.6, ...S.losses.slice(0, 3)), Yl = (v) => 8 + (1 - (Math.min(hi, v) - lo) / (hi - lo)) * (LH - 26), Xl = (i) => 6 + (i / (MAX_STEPS / 20)) * (LW - 12);
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 2.5; c.beginPath(); S.losses.forEach((v, i) => (i ? c.lineTo(Xl(i), Yl(v)) : c.moveTo(Xl(i), Yl(v)))); c.stroke();
  }
  function buildLadder() {
    $("ladder").innerHTML = LADDER.map((L, i) => `<figure><canvas id="lad${i}" class="cv" role="img" aria-label="Drawing with steering knob ${L.w}"></canvas><figcaption>Knob ${L.w} <small id="ladc${i}">${L.k}</small></figcaption></figure>`).join("");
    S.ladCtx = LADDER.map((_, i) => ML.setupCanvas($("lad" + i), MS, MS).ctx);
  }
  function drawLadder() {
    const map = { x: (v) => MS / 2 + (v / R) * (MS / 2), y: (v) => MS / 2 - (v / R) * (MS / 2) };
    S.ladCtx.forEach((c, i) => {
      c.clearRect(0, 0, MS, MS);
      const job = S.ladder && S.ladder.jobs[i];
      if (!job) { C.CLASSES.forEach((_, k) => dots(c, ref[k], 250, ML.cssVar(COL[k]), 1, 0.35, map)); return; }
      dots(c, ref[S.ladder.cls], 600, ML.cssVar("--ink"), 0.8, 0.15, map);
      dots(c, job.x, job.n, ML.cssVar(COL[S.ladder.cls]), 1.4, 0.85, map);
    });
  }

  // ---------- results + challenges ----------
  function hit(k, msg) {
    if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done");
    ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg} ${$("c-" + k).querySelector(".try").innerHTML}`);
    if (Object.keys(S.hits).length === 3) ML.confetti(50);
  }
  function judge(w, cls, q) {
    if (S.model.steps < 1000) return;
    if (w >= 1 && q.onShape >= 0.85) hit("steer", `${Math.round(q.onShape * 100)}% of the dots landed on the ${NAMES[cls]}.`);
    if (w === 0) S.w0[cls] = q.onShape;
    if (w >= 2 && S.w0[cls] != null && q.onShape - S.w0[cls] >= 0.2) hit("ignore", `Knob 0 put ${Math.round(S.w0[cls] * 100)}% on the ${NAMES[cls]}; knob ${w} put ${Math.round(q.onShape * 100)}%.`);
    if (w >= 6 && q.fills <= 0.65) hit("over", `At knob ${w} only ${Math.round(q.fills * 100)}% of the ${NAMES[cls]} got filled in.`);
  }
  function finishDraw() {
    const { cls, w } = S.job, q = C.quality(S.job.sampler.x, ref[cls]); S.job = null;
    $("st-on").textContent = Math.round(q.onShape * 100) + "%"; $("st-fill").textContent = Math.round(q.fills * 100) + "%";
    $("scrub").disabled = false; $("scrub").value = 0; $("scrub").dispatchEvent(new Event("input"));
    S.drawn++; setHow(2);
    const n = NAMES[cls];
    let msg;
    if (S.model.steps < 300) msg = `That's mostly fog: I've barely practised! Let me learn more first.`;
    else if (w === 0) msg = `Knob 0: I ignored you and drew <b>any</b> of my shapes, so only ${Math.round(q.onShape * 100)}% landed on the ${n}. Can you see bits of the others?`;
    else if (w >= 6 && q.fills < 0.75) msg = `Whoa, knob ${w} is too much! The dots bunched up and only ${Math.round(q.fills * 100)}% of the ${n} got filled. The drawing went weird.`;
    else if (q.onShape >= 0.85) msg = `A crisp ${n}! ${Math.round(q.onShape * 100)}% of the dots are on it. Now try knob <b>0</b>, then knob <b>8</b>.`;
    else msg = `${Math.round(q.onShape * 100)}% of dots on the ${n}. ${S.model.steps < MAX_STEPS ? "More practice will help." : "Try turning the knob up a little."}`;
    ML.say(msg);
    judge(w, cls, q);
  }
  function setHow(k) { document.querySelectorAll("#how li").forEach((li) => li.classList.toggle("now", +li.dataset.k === k)); }

  // ---------- one loop: drawing first, then the knob ladder, then training ----------
  function frame() {
    requestAnimationFrame(frame);
    const t0 = performance.now(), budget = 14;
    S.tick++;
    if (S.job) {
      const sp = S.job.sampler, fast = reduce();
      if (fast || S.tick % 2 === 0) { // pace: one cleaning step every other frame so the movement is visible
        while (!sp.done && performance.now() - t0 < budget) { sp.stepPart(NDOTS); if (!fast) break; }
      }
      S.frame = sp.frames.length - 1;
      if (sp.done) finishDraw();
      drawView(); return;
    }
    if (S.ladder && !S.ladder.done) {
      const L = S.ladder;
      while (performance.now() - t0 < budget) {
        const s = L.samplers[L.i]; s.step(); L.jobs[L.i] = s;
        if (s.done) {
          const q = C.quality(s.x, ref[L.cls]); $("ladc" + L.i).textContent = `${Math.round(q.onShape * 100)}% on · ${Math.round(q.fills * 100)}% filled`;
          L.q[L.i] = q; L.i++;
          if (L.i >= LADDER.length) { L.done = true; ladderDone(); break; }
        }
      }
      drawLadder(); return;
    }
    if (S.training) {
      while (performance.now() - t0 < budget && S.model.steps < MAX_STEPS) {
        const lr = S.model.steps < MAX_STEPS * 0.7 ? 0.004 : 0.0013;
        S.lossAcc += S.model.trainStep(lr); S.lossN++;
        if (S.lossN === 20) { S.losses.push(S.lossAcc / 20); S.lossAcc = 0; S.lossN = 0; }
      }
      $("st-step").textContent = S.model.steps.toLocaleString();
      if (S.losses.length) $("st-loss").textContent = S.losses[S.losses.length - 1].toFixed(3);
      narrateTraining(); drawLoss();
      if (S.model.steps >= MAX_STEPS) { stopTraining(); ML.say(`Practice finished! Pick a shape and press <b>Draw it!</b> I'll start from pure fog.`); setHow(1); startDraw(); }
    }
  }
  let said = 0;
  function narrateTraining() {
    const s = S.model.steps;
    if (s > 400 && said < 1) { said = 1; ML.say("I'm practising on all four shapes: shake a dot, guess the fuzz, get corrected. One time in five I'm <b>not told</b> which shape it is."); }
    else if (s > 2000 && said < 2) { said = 2; ML.say("Halfway! The oops score never reaches zero: nobody can guess random fuzz perfectly, only on average."); }
  }

  function startTraining() {
    if (S.model.steps >= MAX_STEPS) { ML.say("I've finished practising. Press <b>New brain</b> to watch me learn from scratch."); return; }
    S.training = true; $("play").innerHTML = ML.icon("pause") + " Pause"; setHow(0);
    if (!S.model.steps) ML.say("Learning! Watch the <b>oops score</b> drop. You can press <b>Draw it!</b> any time to see how I'm doing.");
  }
  function stopTraining() { S.training = false; $("play").innerHTML = ML.icon("play") + " " + (S.model.steps >= MAX_STEPS ? "Done!" : "Keep learning"); }
  function startDraw() {
    S.job = { sampler: new C.Sampler(S.model, NDOTS, S.cls, S.w, 7 + Math.floor(Math.random() * 1e5), NSTEPS), cls: S.cls, w: S.w };
    S.shown = { frames: S.job.sampler.frames, cls: S.cls }; S.frame = 0;
    $("scrub").disabled = true; $("view-chip").textContent = `${NAMES[S.cls]} · knob ${S.w}`;
    $("view-title").innerHTML = ML.icon("sparkles") + " Drawing a " + NAMES[S.cls];
  }
  function startLadder() {
    const seed = 3 + Math.floor(Math.random() * 1e5);
    S.ladder = { cls: S.cls, i: 0, done: false, jobs: [], q: [], samplers: LADDER.map((L) => new C.Sampler(S.model, 300, S.cls, L.w, seed, 40)) };
    LADDER.forEach((L, i) => ($("ladc" + i).textContent = "drawing…"));
    ML.say(`Drawing the ${NAMES[S.cls]} four times from the <b>same fog</b>, changing only the knob. Watch the scores under each one.`);
  }
  function ladderDone() {
    const L = S.ladder, q = L.q;
    ML.say(`Knob 0: ${Math.round(q[0].onShape * 100)}% on the ${NAMES[L.cls]}. Knob 3: ${Math.round(q[2].onShape * 100)}%. Knob 8 fills only ${Math.round(q[3].fills * 100)}%. A little steering helps; too much hurts!`);
    LADDER.forEach((Ld, i) => judge(Ld.w, L.cls, q[i]));
  }

  // ---------- controls ----------
  function touch() { S.lastAct = Date.now(); }
  $("play").addEventListener("click", () => { touch(); S.training ? stopTraining() : startTraining(); });
  $("reset").addEventListener("click", () => {
    touch(); stopTraining(); S.job = null; S.ladder = null; S.shown = null; said = 0; S.w0 = {}; newBrain();
    $("play").innerHTML = ML.icon("play") + " Start learning"; $("st-step").textContent = "0"; $("st-loss").textContent = "–"; $("st-on").textContent = "–"; $("st-fill").textContent = "–";
    $("view-chip").textContent = "practice shapes"; $("view-title").innerHTML = ML.icon("sparkles") + " Robo's drawing board"; $("scrub").disabled = true;
    LADDER.forEach((L, i) => ($("ladc" + i).textContent = L.k));
    drawView(); drawLoss(); drawLadder(); setHow(0);
    ML.say("A brand-new brain that only knows fog. Press <b>Start learning</b>!");
  });
  $("draw").addEventListener("click", () => { touch(); if (S.model.steps < 50) ML.say("I haven't practised at all yet, so expect fog! Press <b>Start learning</b> first."); startDraw(); });
  $("replay").addEventListener("click", () => {
    touch(); if (!S.shown || S.job) return;
    let k = 0; const n = S.shown.frames.length; $("scrub").disabled = true;
    if (reduce()) { S.frame = n - 1; drawView(); $("scrub").disabled = false; return; }
    const go = () => { S.frame = k; drawView(); if (++k < n) setTimeout(go, 35); else { $("scrub").disabled = false; $("scrub").value = 0; } };
    go();
  });
  ML.bindRange("#scrub", (v) => Math.round((v / NSTEPS) * 100) + "%", (v) => { if (!S.shown || S.job) return; S.frame = NSTEPS - v; drawView(); touch(); });
  ML.bindRange("#w", (v) => String(v), (v) => {
    const first = S.lastW === undefined; S.w = v; S.lastW = v; if (first) return; touch();
    ML.say(v === 0 ? "Knob 0: I'll <b>ignore</b> which shape you picked. Press <b>Draw it!</b>" : v <= 3 ? `Knob ${v}: I'll steer towards your shape. Press <b>Draw it!</b>` : `Knob ${v}: that's a <b>lot</b> of steering. Press <b>Draw it!</b> and see what happens.`);
  });
  document.querySelectorAll("#shapes button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#shapes button").forEach((x) => x.classList.toggle("on", x === b)); S.cls = +b.dataset.c; touch();
    if (S.model.steps >= 300 && !S.job) startDraw();
  }));
  const tog = (id, key) => $(id).addEventListener("click", (e) => { S[key] = !S[key]; e.currentTarget.classList.toggle("on", S[key]); e.currentTarget.setAttribute("aria-pressed", S[key]); drawView(); touch(); });
  tog("tg-trails", "trails"); tog("tg-ghost", "ghost");
  $("ladder-go").addEventListener("click", () => { touch(); if (S.model.steps < 300) { ML.say("Let me practise a bit first! Press <b>Start learning</b>."); return; } startLadder(); });

  // gentle nudge when the learner seems stuck for ~15 s
  setInterval(() => {
    if (Date.now() - S.lastAct < 15000 || S.training || S.job) return;
    S.lastAct = Date.now();
    if (!S.model.steps) ML.say("Psst! Press <b>Start learning</b>. In about 15 seconds I'll be drawing shapes out of fog.");
    else if (S.model.steps < MAX_STEPS) ML.say("I'm only partly trained. Press <b>Keep learning</b>, or <b>Draw it!</b> to see how I'm doing.");
    else if (!S.drawn) ML.say("Pick a shape and press <b>Draw it!</b>");
    else if (!S.hits.ignore) ML.say("Set the knob to <b>0</b> and draw. Then set it to <b>2</b> and draw the same shape. Spot the difference?");
    else if (!S.hits.over) ML.say("What if you steer <b>way</b> too hard? Push the knob to 8 and draw a heart or a star.");
    else ML.say("Try <b>Four knobs at once</b> on each shape. Which shape copes best with a huge knob?");
  }, 3000);

  function redraw() { drawView(); drawLoss(); drawLadder(); }
  document.addEventListener("themechange", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("load", redraw);

  newBrain(); buildLadder(); redraw(); requestAnimationFrame(frame);
})();
