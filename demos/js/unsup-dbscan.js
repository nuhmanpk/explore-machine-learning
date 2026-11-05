// Crowds and Loners page. Logic lives in unsup-dbscan-core.js (DBSCANCore).
(function () {
  const D = window.DBSCANCore, $ = (id) => document.getElementById(id);
  const W = 640, H = 440, CW = 320, CH = 220;
  const ctx = ML.setupCanvas($("cv"), W, H).ctx, dctx = ML.setupCanvas($("cmpD"), CW, CH).ctx, kctx = ML.setupCanvas($("cmpK"), CW, CH).ctx;
  const PAL = ["--nn", "--rl", "--sup", "--diff", "--vision", "--lang", "--audio", "--video", "--vlm", "--unsup"];
  const TRUE_K = { moons: 2, rings: 2, blobs: 3, snake: 2 };
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = { set: "moons", seed: 3, P: [], eps: 16, minp: 5, res: null, km: null, tool: "look", hover: null, anim: null, circles: false, hits: {}, ready: false };
  const col = (c) => ML.cssVar(PAL[c % PAL.length]);

  // ---------- data + clustering ----------
  function load(name, keepSeed) {
    stopAnim(); S.set = name; if (!keepSeed) S.seed = 1 + Math.floor(Math.random() * 9000);
    S.P = name === "empty" ? [] : D.makeData(name, S.seed, W, H);
    document.querySelectorAll(".sets .btn").forEach((b) => b.classList.toggle("on", b.dataset.set === name));
    recompute();
  }
  function recompute() {
    S.res = D.dbscan(S.P, S.eps, S.minp);
    const k = TRUE_K[S.set] || Math.max(2, S.res.clusters);
    S.km = S.P.length >= k ? D.kmeans(S.P, k, S.seed) : null;
    render();
  }

  // ---------- drawing ----------
  function drawDots(c, sc, labels, kinds, opts) {
    const muted = ML.cssVar("--muted"), card = ML.cssVar("--card");
    S.P.forEach((p, i) => {
      const x = p.x * sc, y = p.y * sc, l = labels[i], k = kinds ? kinds[i] : "core";
      if (l === undefined || l === -2) { c.fillStyle = muted; c.globalAlpha = 0.45; c.beginPath(); c.arc(x, y, 3 * Math.max(0.7, sc), 0, 7); c.fill(); c.globalAlpha = 1; return; }
      if (l === D.NOISE) { const r = 3.5 * Math.max(0.7, sc); c.strokeStyle = muted; c.lineWidth = 2; c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); return; }
      const cc = col(l);
      if (k === "border") { c.fillStyle = card; c.strokeStyle = cc; c.lineWidth = 2.2; c.beginPath(); c.arc(x, y, 3.6 * Math.max(0.7, sc), 0, 7); c.fill(); c.stroke(); }
      else { c.fillStyle = cc; c.beginPath(); c.arc(x, y, (opts && opts.small ? 3.2 : 5) * Math.max(0.7, sc), 0, 7); c.fill(); }
    });
  }
  function ring(c, x, y, r, colr, dash, alpha) { c.strokeStyle = colr; c.globalAlpha = alpha || 1; c.lineWidth = 2; c.setLineDash(dash || []); c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
  function drawMain() {
    const c = ctx, ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted");
    c.clearRect(0, 0, W, H);
    const A = S.anim, labels = A ? A.labels : S.res.labels, kinds = A ? A.kinds : S.res.kind;
    if (S.circles && !A) S.P.forEach((p, i) => { if (kinds[i] === "core") { c.fillStyle = col(labels[i]); c.globalAlpha = 0.06; c.beginPath(); c.arc(p.x, p.y, S.eps, 0, 7); c.fill(); c.globalAlpha = 1; } });
    drawDots(c, 1, labels, kinds);
    if (!S.P.length) { c.fillStyle = muted; c.font = "800 16px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("Pick Paint dots and drag here to draw people", W / 2, H / 2); }
    if (A && A.cur >= 0) {
      const p = S.P[A.cur], e = A.ev;
      ring(c, p.x, p.y, S.eps, e.t === "noise" ? muted : col(e.c), [5, 4]);
      c.strokeStyle = ink; c.lineWidth = 2.5; c.beginPath(); c.arc(p.x, p.y, 8, 0, 7); c.stroke();
    }
    if (S.hover && !A) {
      const h = S.hover, n = D.countWithin(S.P, h.x, h.y, S.eps), enough = n >= S.minp;
      ring(c, h.x, h.y, S.eps, enough ? ML.cssVar("--good") : ML.cssVar("--warn"), [5, 4]);
      c.font = "800 12px Nunito, sans-serif"; c.textAlign = "center"; c.fillStyle = ink;
      const ty = h.y - S.eps - 6 < 14 ? h.y + S.eps + 16 : h.y - S.eps - 6;
      c.lineWidth = 3; c.strokeStyle = ML.cssVar("--bg-2"); const t = `${n} inside · ${enough ? "a crowd!" : "need " + S.minp}`;
      c.strokeText(t, h.x, ty); c.fillText(t, h.x, ty);
    }
  }
  function drawCompare() {
    const sc = CW / W;
    [dctx, kctx].forEach((c) => c.clearRect(0, 0, CW, CH));
    drawDots(dctx, sc, S.res.labels, S.res.kind, { small: true });
    if (S.km) drawDots(kctx, sc, S.km.labels, null, { small: true });
    const hasTruth = S.P.some((p) => p.g !== -1) && S.set !== "empty";
    const sd = hasTruth ? Math.max(0, D.scoreVsTruth(S.P, S.res.labels)) : null, sk = hasTruth && S.km ? Math.max(0, D.scoreVsTruth(S.P, S.km.labels)) : null;
    $("sc-d").textContent = sd === null ? `· ${S.res.clusters} crowds` : `· ${Math.round(sd * 100)}% match`;
    $("sc-k").textContent = sk === null ? (S.km ? `· ${S.km.centres.length} groups` : "") : `· ${Math.round(sk * 100)}% match`;
    return { sd, sk };
  }
  function render() {
    drawMain(); const sc = drawCompare();
    const r = S.res, cnt = (k) => r.kind.filter((x) => x === k).length;
    $("s-cl").textContent = r.clusters; $("s-no").textContent = cnt("noise"); $("s-co").textContent = cnt("core"); $("s-bo").textContent = cnt("border");
    $("truth").innerHTML = TRUE_K[S.set] ? `This picture really has <b>${TRUE_K[S.set]}</b> groups${S.set === "blobs" ? " plus scattered loners" : ""}. Robo's grouping matches <b>${Math.round((sc.sd || 0) * 100)}%</b>.` : "Your own drawing: there is no answer sheet, so you decide what looks right!";
    $("cv").setAttribute("aria-label", `${S.P.length} dots. Robo found ${r.clusters} crowds and ${cnt("noise")} loners with a friend circle of ${S.eps} and ${S.minp} friends needed.`);
    if (S.ready && !S.anim) check(sc);
  }

  // ---------- talk + challenges ----------
  function summary() {
    const r = S.res, noise = r.kind.filter((x) => x === "noise").length, n = S.P.length, tk = TRUE_K[S.set];
    if (!n) return "No dots yet! Pick <b>Paint dots</b> and draw some people.";
    let msg = `Friend circle <b>${S.eps}</b>, needing <b>${S.minp}</b> friends: I see <b>${r.clusters}</b> crowd${r.clusters === 1 ? "" : "s"} and <b>${noise}</b> loner${noise === 1 ? "" : "s"}.`;
    if (noise > n * 0.4) msg += " So many loners! The circle is too small, or I am asking for too many friends.";
    else if (r.clusters === 1 && tk > 1) msg += " Everything got glued into one crowd. The circle is too big now!";
    else if (tk && r.clusters > tk) msg += " Some crowds are broken into bits. Try a slightly bigger circle.";
    else if (tk && r.clusters === tk) msg += " That looks like the right number of crowds!";
    return msg;
  }
  const TRY = {
    moons: "Look at the pizza magnets below: they chop each moon in half. Now try <b>Rings</b>.",
    loners: "Hover over a grey cross: count the dots in its circle. Then try making the friend number bigger.",
    rings: "Pick <b>Paint dots</b> and draw your own shape, like a smiley face. Can Robo find the eyes and the mouth?",
  };
  function hit(k, msg) {
    if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg);
    const left = ["moons", "loners", "rings"].filter((c) => !S.hits[c]);
    const tip = left.length ? TRY[k] : "All three done! Paint a smiley face and see if Robo finds the two eyes and the mouth.";
    ML.say(`<b>Challenge done!</b> ${msg}<br><b>Try this:</b> ${tip}`);
    $("trynext").innerHTML = "<b>Try this:</b> " + tip;
    if (!left.length) ML.confetti(40);
    return true;
  }
  function check(sc) {
    const r = S.res;
    if (S.set === "moons" && r.clusters === 2 && sc.sd >= 0.95) return hit("moons", "Two curvy crowds, found by following how packed the dots are.");
    if (S.set === "blobs" && r.clusters === 3 && D.lonersCaught(S.P, r.labels) >= 0.75) return hit("loners", "Three crowds, and the scattered dots are left as loners.");
    if (S.set === "rings" && r.clusters === 2 && sc.sd >= 0.95 && (sc.sk || 0) < 0.5) return hit("rings", "The crowd finder found both rings. The pizza magnets could not, because a ring has no round middle!");
    return false;
  }

  // ---------- step-by-step replay ----------
  function startAnim() {
    if (!S.P.length) { ML.say("Draw some dots first!"); return; }
    if (reduced()) { ML.say("Motion is turned down, so here is the finished result. " + summary()); return; }
    S.anim = { i: 0, labels: new Array(S.P.length).fill(-2), kinds: new Array(S.P.length).fill(""), cur: -1, ev: null, t: 0 };
    $("play").lastChild.textContent = " Pause"; $("skip").disabled = false;
    ML.say("Watch! I visit the dots one at a time and count the friends inside each circle.");
  }
  function stopAnim(done) {
    if (!S.anim) return;
    S.anim = null; $("play").lastChild.textContent = " Watch Robo do it step by step"; $("skip").disabled = true;
    if (done) ML.say("Every dot has been visited. " + summary());
    render();
  }
  function narrate(e) {
    const name = `crowd ${e.c + 1}`;
    if (e.t === "noise") return `This dot has only <b>${e.n}</b> in its circle, and needs <b>${S.minp}</b>. A <b>loner</b>... for now.`;
    if (e.t === "seed") return `This dot has <b>${e.n}</b> in its circle. Enough! It starts <b>${name}</b>.`;
    if (e.t === "core") return `A friend with <b>${e.n}</b> in its own circle: a crowd member, so ${name} spreads through it.`;
    return e.rescued ? `Wait! That old loner is next to ${name}, so it joins at the <b>edge</b> after all.` : `This one is close to ${name} but has only <b>${e.n}</b> friends itself, so it joins at the <b>edge</b>.`;
  }
  function stepAnim(dt) {
    const A = S.anim, slow = A.i < 18, wait = slow ? 650 : 35;
    A.t += dt; if (A.t < wait) return;
    A.t = 0;
    const per = slow ? 1 : 3;
    for (let k = 0; k < per; k++) {
      const e = S.res.events[A.i++];
      if (!e) { stopAnim(true); return; }
      A.labels[e.i] = e.t === "noise" ? D.NOISE : e.c;
      A.kinds[e.i] = e.t === "noise" ? "noise" : e.t === "border" ? "border" : "core";
      A.cur = e.i; A.ev = e;
      if (slow) $("say").innerHTML = narrate(e);
      else if (A.i === 18) ML.say("You've got the idea, so I'll speed up now...");
    }
    drawMain();
  }
  let last = 0;
  function frame(t) { const dt = Math.min(60, t - (last || t)); last = t; if (S.anim) stepAnim(dt); requestAnimationFrame(frame); }

  // ---------- input ----------
  const cv = $("cv"); let down = false, lastPt = null;
  const pt = (e) => ML.canvasPoint(cv, e, W, H);
  function paintAt(p) {
    if (S.tool === "paint") { if (!lastPt || Math.hypot(p.x - lastPt.x, p.y - lastPt.y) > 7) { S.P.push({ x: ML.clamp(p.x + ML.randn() * 4, 6, W - 6), y: ML.clamp(p.y + ML.randn() * 4, 6, H - 6), g: -1 }); lastPt = p; recompute(); } }
    else if (S.tool === "erase") { const n = S.P.length; S.P = S.P.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) > 16); if (S.P.length !== n) recompute(); }
  }
  cv.addEventListener("pointerdown", (e) => {
    const p = pt(e); down = true; lastPt = null; cv.setPointerCapture(e.pointerId);
    if (S.tool === "look") {
      if (S.anim) return;
      S.hover = p; drawMain();
      const n = D.countWithin(S.P, p.x, p.y, S.eps);
      ML.say(`This friend circle holds <b>${n}</b> dot${n === 1 ? "" : "s"}. ${n >= S.minp ? "That is enough to be a crowd!" : `A crowd needs <b>${S.minp}</b>. Not enough here.`}`);
    } else { stopAnim(); paintAt(p); }
  });
  cv.addEventListener("pointermove", (e) => {
    const p = pt(e);
    if (S.tool === "look") { if (e.pointerType === "mouse" || down) { S.hover = p; if (!S.anim) drawMain(); } return; }
    if (down) paintAt(p);
  });
  const up = () => { const was = down; down = false; if (was && S.tool !== "look" && S.P.length) ML.say(summary()); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", () => { if (!down) { S.hover = null; if (!S.anim) drawMain(); } });

  const TOOLHINT = {
    look: "Look: hover or tap anywhere to see a friend circle and count the dots inside it.",
    paint: "Paint: drag on the picture to add people. Make a tight bunch for a crowd, or a lonely dot for a loner.",
    erase: "Rubber: drag over dots to send them home.",
  };
  document.querySelectorAll(".tools .btn").forEach((b) => b.addEventListener("click", () => {
    S.tool = b.dataset.tool; S.hover = null;
    document.querySelectorAll(".tools .btn").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
    $("toolhint").textContent = TOOLHINT[S.tool]; drawMain();
  }));
  const INTRO = {
    moons: "Two curvy <b>moons</b>, curled into each other.",
    rings: "A small <b>ring</b> inside a big ring. Round, but hollow!",
    blobs: "Three <b>blobs</b>, with some loners wandering around between them.",
    snake: "A wiggly <b>snake</b> and a round ball.",
    empty: "An empty party! Pick <b>Paint dots</b> and draw your own crowds and loners.",
  };
  document.querySelectorAll(".sets .btn").forEach((b) => b.addEventListener("click", () => { load(b.dataset.set); ML.say(INTRO[b.dataset.set] + (S.P.length ? " " + summary() : "")); }));
  let talkTimer = null;
  const talkSoon = () => { clearTimeout(talkTimer); talkTimer = setTimeout(() => ML.say(summary()), 250); };
  ML.bindRange("#eps", (v) => String(v), (v) => { S.eps = v; if (S.ready) { stopAnim(); recompute(); talkSoon(); } });
  ML.bindRange("#minp", (v) => String(v), (v) => { S.minp = v; if (S.ready) { stopAnim(); recompute(); talkSoon(); } });
  $("circles").addEventListener("change", (e) => { S.circles = e.target.checked; drawMain(); if (S.circles) ML.say("Each soft circle is a crowd member's friend circle. Where circles overlap, the crowd passes along."); });
  $("play").addEventListener("click", () => (S.anim ? stopAnim() : startAnim()));
  $("skip").addEventListener("click", () => stopAnim(true));
  $("reseed").addEventListener("click", () => { if (S.set === "empty") return; load(S.set); ML.say("Fresh dots, same shape. " + summary()); });

  // nudge a learner who has not touched anything for a while
  let idleAt = performance.now(), nudges = 0;
  ["pointerdown", "keydown", "input"].forEach((ev) => document.addEventListener(ev, () => { idleAt = performance.now(); }, true));
  setInterval(() => {
    if (S.anim || performance.now() - idleAt < 15000 || nudges >= 4) return;
    idleAt = performance.now(); nudges++;
    ML.say(!S.hits.moons ? (S.set === "moons" ? `Stuck? Slide <b>Friend circle size</b> up a little at a time (try around ${S.eps < 24 ? "25" : "30"}) and watch the bits of moon join up.` : "Hint: pick <b>Moons</b> and grow the friend circle until there are exactly 2 colours.")
      : !S.hits.loners ? "Hint: pick <b>Blobs + loners</b>. If the scattered dots join a crowd, make the circle smaller or ask for more friends."
      : !S.hits.rings ? "Hint: pick <b>Rings</b>. The big ring's dots are more spread out, so it needs a fairly big friend circle."
      : "Try <b>Watch Robo do it step by step</b> to see exactly how a crowd spreads.");
  }, 3000);

  const redraw = () => { if (S.res) render(); };
  new MutationObserver(redraw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", redraw);
  window.addEventListener("load", redraw);
  load("moons", true); S.ready = true; render();
  requestAnimationFrame(frame);
})();
