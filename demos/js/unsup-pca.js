// Squash to See page. Logic lives in unsup-pca-core.js (PCACore).
(function () {
  const P = window.PCACore, $ = (id) => document.getElementById(id);
  const W = 640, H = 420, SW = 640, SH = 130, BW = 300, BH = 160, FW = 300, FH = 220;
  const cx = ML.setupCanvas($("cloud"), W, H).ctx, sx = ML.setupCanvas($("shadow"), SW, SH).ctx;
  const bx = ML.setupCanvas($("bars"), BW, BH).ctx, fx = ML.setupCanvas($("flat"), FW, FH).ctx;
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = {
    set: "pancake", seed: 7, data: null, res: null, scale: 60,
    yaw: 0.5, pitch: 0.35, spin: true, turn: 0, tilt: 0,
    found: false, search: null, robo: null, squashT: 0, squashTo: 0, hits: {}, dirty: true,
  };
  const pct = (v) => (v * 100 < 10 ? (v * 100).toFixed(1) : Math.round(v * 100)) + "%";
  const myDir = () => P.dirFromAngles(S.turn, S.tilt);
  const myFrac = () => P.varianceAlong(S.res.C, myDir()) / S.res.total;
  const TONES = ["--nn", "--bad", "--lang"];
  function toneColour(i, alpha) {
    const t = S.data.tone[i];
    if (S.data.classes) { const c = ML.cssVar(TONES[t]); return alpha < 1 ? hexA(c, alpha) : c; }
    return `hsla(${265 - t * 240}, 75%, ${ML.isDark() ? 64 : 52}%, ${alpha})`;
  }
  function hexA(hex, a) {
    const h = hex.replace("#", ""); if (h.length < 6) return hex;
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }

  // ---------- data ----------
  function load(name, keepSeed) {
    S.set = name; if (!keepSeed) S.seed = 1 + Math.floor(Math.random() * 9000);
    S.data = P.makeData(name, S.seed); S.res = P.pca(S.data.points);
    const maxR = Math.max(...S.data.points.map(P.norm));
    S.scale = 165 / maxR; S.found = false; S.search = null; S.robo = null; S.squashT = S.squashTo = 0;
    document.querySelectorAll(".sets .btn").forEach((b) => { const on = b.dataset.set === name; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    $("setname").textContent = "· " + S.data.label;
    $("legendFruit").hidden = name !== "fruit";
    $("squash").disabled = true; $("squash").lastChild.textContent = " Squash it flat";
    S.dirty = true; update();
  }

  // ---------- drawing ----------
  function scr(p) { const v = P.view(p, S.yaw, S.pitch); return { x: W / 2 + v.x * S.scale, y: H / 2 + v.y * S.scale, d: v.depth }; }
  function arrow(c, dir, len, col, width, label, dash) {
    const a = scr(dir.map((v) => -v * len)), b = scr(dir.map((v) => v * len));
    c.strokeStyle = col; c.lineWidth = width; c.setLineDash(dash || []); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]);
    const ang = Math.atan2(b.y - a.y, b.x - a.x), hl = 11;
    c.fillStyle = col; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - hl * Math.cos(ang - 0.45), b.y - hl * Math.sin(ang - 0.45)); c.lineTo(b.x - hl * Math.cos(ang + 0.45), b.y - hl * Math.sin(ang + 0.45)); c.closePath(); c.fill();
    if (label) {
      c.font = "800 12px Nunito, sans-serif"; c.textAlign = "center";
      const lx = Math.min(W - 40, Math.max(40, b.x + 18 * Math.cos(ang))), ly = Math.min(H - 8, Math.max(14, b.y + 18 * Math.sin(ang) + 4));
      c.lineWidth = 3; c.strokeStyle = ML.cssVar("--bg-2"); c.strokeText(label, lx, ly); c.fillText(label, lx, ly);
    }
  }
  function drawCloud() {
    const c = cx, muted = ML.cssVar("--muted"), warn = ML.cssVar("--warn"), acc = ML.cssVar("--accent"), good = ML.cssVar("--good"), ink = ML.cssVar("--ink");
    c.clearRect(0, 0, W, H);
    const R = 165 / S.scale;
    // axes
    c.font = "700 11px Nunito, sans-serif"; c.textAlign = "center";
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((e, i) => {
      const o = scr([0, 0, 0]), a = scr(e.map((v) => v * R * 1.05)), b = scr(e.map((v) => -v * R * 1.05));
      c.strokeStyle = muted; c.globalAlpha = 0.5; c.lineWidth = 1.5; c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(a.x, a.y); c.stroke();
      c.setLineDash([3, 4]); c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      c.fillStyle = muted; c.fillText(S.data.axes[i], a.x, a.y - 4);
    });
    const d = myDir(), n3 = S.res.vectors[2];
    const pts = S.data.points.map((p, i) => { const q = S.squashT ? P.squash(p, n3, S.squashT) : p; const s = scr(q); s.i = i; s.q = q; return s; });
    // shadow connectors and shadow ticks on the torch line
    if (!S.squashT) {
      c.strokeStyle = hexA(warn, 0.18); c.lineWidth = 1;
      pts.forEach((s) => { const t = P.dot(s.q, d), sh = scr(d.map((v) => v * t)); c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(sh.x, sh.y); c.stroke(); });
    }
    arrow(c, d, R * 1.15, warn, 4, "your torch");
    c.fillStyle = hexA(warn, 0.75);
    pts.forEach((s) => { const t = P.dot(s.q, d), sh = scr(d.map((v) => v * t)); c.beginPath(); c.arc(sh.x, sh.y, 2.2, 0, 7); c.fill(); });
    // dots, far first
    pts.sort((a, b) => b.d - a.d);
    pts.forEach((s) => {
      const r = Math.max(2.5, 4.6 - s.d * 0.5 / (R / 3));
      c.fillStyle = toneColour(s.i, 0.92); c.beginPath(); c.arc(s.x, s.y, r, 0, 7); c.fill();
      c.strokeStyle = ink; c.globalAlpha = 0.25; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
    });
    // Robo's arrows
    if (S.robo) arrow(c, S.robo, R * 1.15, acc, 4, "Robo looks here");
    if (S.found) {
      const L = (i) => Math.max(0.35, Math.sqrt(S.res.values[i]) * 2);
      arrow(c, S.res.vectors[0], L(0), acc, 4, "1st");
      arrow(c, S.res.vectors[1], L(1), good, 3.5, "2nd");
      arrow(c, S.res.vectors[2], L(2), muted, 3, "3rd");
    }
  }
  function drawShadow() {
    const c = sx, warn = ML.cssVar("--warn"), acc = ML.cssVar("--accent"), muted = ML.cssVar("--muted"), line = ML.cssVar("--line"), ink = ML.cssVar("--ink");
    c.clearRect(0, 0, SW, SH);
    const L = 96, Rr = SW - 14, mid = (L + Rr) / 2, k = ((Rr - L) / 2) / (190 / S.scale);
    const row = (y, dir, col, label, sub) => {
      c.strokeStyle = line; c.lineWidth = 2; c.beginPath(); c.moveTo(L, y); c.lineTo(Rr, y); c.stroke();
      c.font = "800 12px Nunito, sans-serif"; c.textAlign = "left"; c.fillStyle = col; c.fillText(label, 8, y - 2);
      c.font = "700 11px Nunito, sans-serif"; c.fillStyle = muted; c.fillText(sub, 8, y + 13);
      if (!dir) { c.textAlign = "center"; c.fillText("(Robo has not looked yet)", mid, y + 4); return; }
      const pr = P.project(S.data.points, dir), sd = Math.sqrt(P.varianceAlong(S.res.C, dir));
      c.fillStyle = hexA(col, 0.18); c.fillRect(mid - sd * k, y - 16, 2 * sd * k, 32);
      pr.forEach((v, i) => { c.fillStyle = toneColour(i, 0.65); c.beginPath(); c.arc(mid + Math.max(-1, Math.min(1, v * k / (Rr - mid))) * (Rr - mid), y + ((i * 7) % 11) - 5, 3, 0, 7); c.fill(); });
      c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); c.moveTo(mid - sd * k, y + 20); c.lineTo(mid + sd * k, y + 20); c.stroke();
      [mid - sd * k, mid + sd * k].forEach((x) => { c.beginPath(); c.moveTo(x, y + 15); c.lineTo(x, y + 25); c.stroke(); });
    };
    row(36, myDir(), warn, "Your torch", "keeps " + pct(myFrac()));
    row(96, S.found ? S.res.vectors[0] : S.robo, acc, "Robo's best", S.found ? "keeps " + pct(S.res.explained[0]) : S.robo ? "looking..." : "");
    c.fillStyle = ink; c.globalAlpha = 0.5; c.font = "700 10px Nunito, sans-serif"; c.textAlign = "right"; c.fillText("shaded band = the typical spread", SW - 8, SH - 4); c.globalAlpha = 1;
  }
  function drawBars() {
    const c = bx, muted = ML.cssVar("--muted"), cols = [ML.cssVar("--accent"), ML.cssVar("--good"), muted], warn = ML.cssVar("--warn");
    c.clearRect(0, 0, BW, BH);
    const T = 14, B = BH - 26, L = 36, R = BW - 10, bw = (R - L) / 3;
    c.font = "700 10px Nunito, sans-serif"; c.textAlign = "right"; c.fillStyle = muted;
    [0, 0.5, 1].forEach((v) => { const y = B - v * (B - T); c.fillText(v * 100 + "%", L - 4, y + 3); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, y); c.lineTo(R, y); c.stroke(); });
    c.textAlign = "center";
    for (let i = 0; i < 3; i++) {
      const x = L + i * bw + 10, w = bw - 20;
      if (S.found) {
        const v = S.res.explained[i], h = v * (B - T);
        c.fillStyle = cols[i]; c.fillRect(x, B - h, w, h);
        c.fillStyle = ML.cssVar("--ink"); c.font = "800 11px Nunito, sans-serif"; c.fillText(pct(v), x + w / 2, B - h - 4);
      } else { c.fillStyle = muted; c.globalAlpha = 0.25; c.fillRect(x, B - 30, w, 30); c.globalAlpha = 1; c.fillStyle = muted; c.font = "800 14px Nunito, sans-serif"; c.fillText("?", x + w / 2, B - 36); }
      c.fillStyle = muted; c.font = "700 11px Nunito, sans-serif"; c.fillText(["1st", "2nd", "3rd"][i] + " way", x + w / 2, BH - 10);
    }
    const y = B - myFrac() * (B - T);
    c.strokeStyle = warn; c.lineWidth = 2.5; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(L, y); c.lineTo(R, y); c.stroke(); c.setLineDash([]);
    c.fillStyle = warn; c.font = "800 11px Nunito, sans-serif"; c.textAlign = "left"; c.fillText("you", L + 2, y - 4);
  }
  function drawFlat() {
    const c = fx, muted = ML.cssVar("--muted");
    c.clearRect(0, 0, FW, FH);
    if (!S.found) { c.fillStyle = muted; c.font = "800 13px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("Ask Robo to look first", FW / 2, FH / 2); return; }
    const xy = P.toComponents(S.data.points, S.res.vectors, 2), m = Math.max(...xy.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))) || 1, k = (FW / 2 - 18) / m;
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1.5; c.beginPath(); c.moveTo(10, FH / 2); c.lineTo(FW - 10, FH / 2); c.moveTo(FW / 2, 10); c.lineTo(FW / 2, FH - 10); c.stroke();
    xy.forEach((p, i) => { c.fillStyle = toneColour(i, 0.85); c.beginPath(); c.arc(FW / 2 + p[0] * k, FH / 2 - p[1] * k, 3.4, 0, 7); c.fill(); });
    c.font = "800 11px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--accent"); c.textAlign = "right"; c.fillText("1st way", FW - 8, FH / 2 - 6);
    c.fillStyle = ML.cssVar("--good"); c.textAlign = "left"; c.fillText("2nd way", FW / 2 + 6, 18);
  }
  function draw() { drawCloud(); drawShadow(); drawBars(); drawFlat(); }

  // ---------- text + challenges ----------
  function update() {
    const f = myFrac();
    $("yours").textContent = pct(f);
    $("best").textContent = S.found ? pct(S.res.explained[0]) : "?";
    $("barnote").innerHTML = S.found ? `The 1st and 2nd ways together keep <b>${pct(S.res.explained[0] + S.res.explained[1])}</b>. Your torch (dashed) sits between the shortest and tallest bar.` : "Robo has not looked yet. Your torch is the dashed line.";
    $("flatnote").innerHTML = S.found ? `Squashed onto the two best ways, the flat picture keeps <b>${pct(S.res.explained[0] + S.res.explained[1])}</b> of the spread.${S.set === "fruit" ? " Look: the three fruits still sit apart!" : ""}` : "After Robo looks, this shows the cloud squashed onto a flat page using its two best directions.";
    $("cloud").setAttribute("aria-label", `3-D cloud of ${S.data.points.length} dots (${S.data.label}). Your torch is turned ${S.turn} degrees and tilted ${S.tilt} degrees; its shadow keeps ${pct(f)} of the spread.${S.found ? " Robo's best direction keeps " + pct(S.res.explained[0]) + "." : ""}`);
    S.dirty = true; check();
  }
  const TRY = {
    hunt: "Now press <b>Robo, find the widest shadow</b> and see how close you were.",
    thin: "Ask Robo to look: your thin torch should line up with its tiny <b>3rd</b> arrow.",
    ball: "Compare with the <b>Pencil</b>: there, one bar towers over the others.",
  };
  function hit(k, msg) {
    if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg);
    const left = ["hunt", "thin", "ball"].filter((c) => !S.hits[c]);
    const tip = left.length ? TRY[k] : "All three done! Try the <b>Fruit</b> and squash it flat: the three fruits still sit apart.";
    ML.say(`<b>Challenge done!</b> ${msg} <br><b>Try this:</b> ${tip}`);
    $("trynext").innerHTML = "<b>Try this:</b> " + tip;
    if (!left.length) ML.confetti(40);
  }
  // nudge a learner who has not touched anything for a while
  let idleAt = performance.now(), nudges = 0;
  const poke = () => { idleAt = performance.now(); };
  ["pointerdown", "keydown", "input"].forEach((ev) => document.addEventListener(ev, poke, true));
  setInterval(() => {
    if (S.search || performance.now() - idleAt < 15000 || nudges >= 4) return;
    idleAt = performance.now(); nudges++;
    const f = myFrac();
    ML.say(!S.hits.hunt && !S.found && S.set !== "ball" ? `Stuck? Your shadow keeps <b>${pct(f)}</b>. Wiggle the <b>Turn</b> slider slowly and watch the number. When it starts going down, go back a little, then try <b>Tilt</b>.`
      : !S.hits.thin ? "Hint: pick the <b>Pancake</b> and aim your torch so it pokes straight through the flat side, like a skewer through a pancake."
      : !S.hits.ball ? "Hint: pick the <b>Ball</b> and press <b>Robo, find the widest shadow</b>."
      : "Try <b>Squash it flat</b>, then drag the cloud to look at it from the side.");
  }, 3000);
  function check() {
    const f = myFrac();
    if (!S.found && !S.search && S.set !== "ball" && f >= 0.95 * S.res.explained[0]) hit("hunt", "You found a shadow almost as wide as the widest one, all by yourself!");
    if (S.set === "pancake" && f < 0.03) hit("thin", "Through the flat side the pancake's shadow is a tiny smudge. That direction holds almost nothing.");
    if (S.set === "ball" && S.found && S.res.explained[0] < 0.5) hit("ball", "A ball looks the same from every side, so no shadow is much wider than another.");
  }
  function sliderTalk() {
    if (S.search) return;
    const f = myFrac(), best = S.res.explained[0];
    let msg = `Your torch's shadow keeps <b>${pct(f)}</b> of the spread.`;
    if (S.found) msg += f >= 0.97 * best ? " That is as wide as Robo's best. Spot on!" : f < S.res.explained[2] * 1.5 + 0.01 ? " That is the thinnest kind of shadow: dots pile on top of each other." : ` Robo's best keeps ${pct(best)}.`;
    else msg += f > 0.6 ? " Nice and wide! Can you make it wider?" : f < 0.1 ? " Very thin: lots of dots land in the same place." : " Keep turning to spread the dots out more.";
    ML.say(msg);
  }

  // ---------- Robo's search (power iteration) ----------
  function findBest() {
    if (S.search) return;
    if (S.found) { ML.say("I already found the widest shadow! Try <b>New dots</b> or another cloud."); return; }
    const d = myDir(), v0 = [d[0] + 0.03, d[1] - 0.02, d[2] + 0.025];
    let steps = P.powerSteps(S.res.C, v0, 8);
    if (P.dot(steps[steps.length - 1], S.res.vectors[0]) < 0) steps = steps.map((v) => v.map((x) => -x));
    if (reduced()) { finish(); return; }
    S.search = { steps, i: 0, t: 0 }; S.robo = steps[0]; $("find").disabled = true;
    ML.say("I start from <b>your torch</b>. Each look, I nudge my arrow towards where the dots stretch the most...");
  }
  function stepSearch(dt) {
    const s = S.search; s.t += dt / 420;
    if (s.t >= 1) {
      s.i++; s.t = 0;
      if (s.i >= s.steps.length - 1) { finish(); return; }
      const v = s.steps[s.i], f = P.varianceAlong(S.res.C, v) / S.res.total;
      $("say").innerHTML = `Look number <b>${s.i}</b>: this way keeps <b>${pct(f)}</b> of the spread.${s.i > 2 && f > 0.995 * S.res.explained[0] ? " It has almost stopped moving!" : ""}`;
    }
    const a = s.steps[s.i], b = s.steps[s.i + 1], t = s.t;
    S.robo = P.unit([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    S.dirty = true;
  }
  function finish() {
    S.search = null; S.robo = null; S.found = true; $("find").disabled = false; $("squash").disabled = false;
    const e = S.res.explained, two = e[0] + e[1];
    const tail = { pancake: "The 3rd arrow is tiny: it points through the thin side.", fruit: "The 1st way is basically <b>how big</b> the fruit is. The 2nd is <b>long and thin versus round</b>, which is how bananas stand out!", pencil: "Just one direction holds nearly everything: a pencil is basically a line.", ball: "But look, all three bars are about the same. A ball has no best side!" }[S.set];
    ML.say(`Found it! My best direction keeps <b>${pct(e[0])}</b> of the spread, and the best two together keep <b>${pct(two)}</b>. ${tail}`);
    update();
  }

  // ---------- animation loop ----------
  let last = 0;
  function frame(t) {
    const dt = Math.min(50, t - (last || t)); last = t;
    if (S.spin && !reduced()) { S.yaw += dt * 0.00025; S.dirty = true; }
    if (S.search) stepSearch(dt);
    if (S.squashT !== S.squashTo) { const step = reduced() ? 1 : dt / 700; S.squashT = S.squashTo > S.squashT ? Math.min(S.squashTo, S.squashT + step) : Math.max(S.squashTo, S.squashT - step); S.dirty = true; }
    if (S.dirty) { S.dirty = false; draw(); }
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  const cv = $("cloud"); let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; S.spin = false; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = cv.getBoundingClientRect(), k = W / r.width;
    S.yaw += (e.clientX - drag.x) * k * 0.01; S.pitch = ML.clamp(S.pitch + (e.clientY - drag.y) * k * 0.01, -1.5, 1.5);
    drag = { x: e.clientX, y: e.clientY }; S.dirty = true;
  });
  const up = () => { drag = null; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("keydown", (e) => {
    const m = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[e.key];
    if (!m) return; e.preventDefault(); S.spin = false; S.yaw += m[0]; S.pitch = ML.clamp(S.pitch + m[1], -1.5, 1.5); S.dirty = true;
  });
  ML.bindRange("#turn", (v) => v + "°", (v) => { S.turn = v; if (S.data) { update(); sliderTalk(); } });
  ML.bindRange("#tilt", (v) => v + "°", (v) => { S.tilt = v; if (S.data) { update(); sliderTalk(); } });
  $("find").addEventListener("click", findBest);
  $("squash").addEventListener("click", () => {
    S.squashTo = S.squashTo ? 0 : 1;
    $("squash").lastChild.textContent = S.squashTo ? " Puff it back up" : " Squash it flat";
    ML.say(S.squashTo ? `Squash! Every dot slides along the 3rd arrow onto a flat sheet. Spin it: from the side it is paper-thin, yet it still keeps <b>${pct(S.res.explained[0] + S.res.explained[1])}</b> of the spread.` : "Back to 3-D. The only thing the squash threw away was the wobble along the 3rd arrow.");
  });
  $("reseed").addEventListener("click", () => { load(S.set); ML.say("Fresh dots, same kind of cloud. Find the widest shadow again!"); });
  const intro = {
    pancake: "A <b>pancake</b> tipped on its side. It is wide one way, a bit less wide another way, and very thin the third way.",
    fruit: "Each dot is a <b>fruit</b>: its length, width and weight. Big fruits are big in every way, so the numbers move together.",
    pencil: "A <b>pencil</b> of dots: long one way and thin every other way.",
    ball: "A round <b>ball</b> of dots. Is there a best way to shine the torch?",
  };
  document.querySelectorAll(".sets .btn").forEach((b) => b.addEventListener("click", () => { load(b.dataset.set); ML.say(intro[b.dataset.set] + " Turn your torch to make the widest shadow."); }));
  new MutationObserver(() => { S.dirty = true; }).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", () => { S.dirty = true; });
  window.addEventListener("load", () => { S.dirty = true; });
  load("pancake", true);
  requestAnimationFrame(frame);
})();
