// In-Between Frames page. Logic lives in video-interp-core.js (InterpCore) and video-flow-core.js (FlowCore).
(function () {
  const F = window.FlowCore, I = window.InterpCore, $ = (id) => document.getElementById(id), { W, H, N } = F;
  const TW = 192, TH = 144, BW = 512, BH = 384, K = BW / W, STW = 640, STH = 86, CW = 300, CH = 170, STEPS = 48;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ca = ML.setupCanvas($("fa"), TW, TH).ctx, ct = ML.setupCanvas($("ft"), TW, TH).ctx, cb = ML.setupCanvas($("fb"), TW, TH).ctx;
  const co = ML.setupCanvas($("out"), BW, BH).ctx, cs = ML.setupCanvas($("strip"), STW, STH).ctx, cc = ML.setupCanvas($("bars"), CW, CH).ctx;
  const S = { method: "motion", src: "robo", speed: 2, slow: 4, view: "pic", k: 24, hits: {}, last: Date.now(), nudged: {}, play: null, ready: false, cache: new Map(), truth: new Map() };
  const NAMES = { repeat: "Repeat", blend: "Fade", motion: "Follow arrows" };

  const off = document.createElement("canvas"); off.width = W; off.height = H;
  const octx = off.getContext("2d"), img = octx.createImageData(W, H);
  function paint(ctx, rgb, x, y, w, h) {
    const d = img.data;
    for (let i = 0; i < N; i++) { d[4 * i] = rgb[3 * i] * 255; d[4 * i + 1] = rgb[3 * i + 1] * 255; d[4 * i + 2] = rgb[3 * i + 2] * 255; d[4 * i + 3] = 255; }
    octx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, x, y, w, h);
  }
  function paintOops(ctx, d, occ, x, y, w, h) {
    const p = img.data, bg = [24, 20, 40];
    for (let i = 0; i < N; i++) {
      const v = Math.min(1, d[i] * 4);
      p[4 * i] = bg[0] + (255 - bg[0]) * v; p[4 * i + 1] = bg[1] + (77 - bg[1]) * v; p[4 * i + 2] = bg[2] + (94 - bg[2]) * v; p[4 * i + 3] = 255;
      if (occ && occ[i] && v < 0.5) { p[4 * i] = 255; p[4 * i + 1] = 176; p[4 * i + 2] = 32; p[4 * i + 3] = 255; }
    }
    octx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(off, x, y, w, h);
  }

  // ---------- compute (cached; each made-up frame takes a few milliseconds) ----------
  function rebuild() {
    S.D = I.setup({ speed: S.speed }, 8, 12);
    S.cache.clear(); S.truth.clear();
    S.bars = ["repeat", "blend", "motion", "true"].map((m) => rmse(frame(m === "true" ? "motion" : m, 24, m === "true"), truthAt(24)));
    draw();
  }
  function frame(method, k, useTrue) {
    const key = method + (method === "motion" ? (useTrue ? "T" : "R") : "") + k;
    if (!S.cache.has(key)) S.cache.set(key, k === 0 ? { rgb: S.D.A.rgb } : k === STEPS ? { rgb: S.D.B.rgb } : I.make(S.D, method, k / STEPS, useTrue));
    return S.cache.get(key);
  }
  function truthAt(k) { if (!S.truth.has(k)) S.truth.set(k, F.render(S.D.scene, k / STEPS).rgb); return S.truth.get(k); }
  const rmse = (f, t) => Math.sqrt(F.mse(f.rgb, t)) * 100;
  const cur = () => frame(S.method, S.k, S.src === "true");

  // ---------- drawing ----------
  function drawTop() {
    paint(ca, S.D.A.rgb, 0, 0, TW, TH); paint(cb, S.D.B.rgb, 0, 0, TW, TH); paint(ct, truthAt(S.k), 0, 0, TW, TH);
    $("realtag").textContent = "t = " + (S.k / STEPS).toFixed(2);
  }
  function drawOut() {
    const f = cur(), t = truthAt(S.k);
    co.clearRect(0, 0, BW, BH);
    if (S.view === "oops") paintOops(co, I.diff(f.rgb, t), S.hits.tear ? F.occlusion(S.D.scene, S.k / STEPS) : null, 0, 0, BW, BH);
    else paint(co, f.rgb, 0, 0, BW, BH);
    const lab = S.k === 0 ? "real picture A" : S.k === STEPS ? "real picture B" : NAMES[S.method] + (S.method === "motion" && S.src === "true" ? " (perfect)" : "") + (S.view === "oops" ? " · oops map" : "");
    $("outtag").textContent = lab;
    $("err").textContent = rmse(f, t).toFixed(1) + "%";
  }
  function drawStrip() {
    const n = S.slow + 1, gap = 6, w = Math.min(84, (STW - gap * (n - 1)) / n), h = w * 0.75, x0 = (STW - (n * w + (n - 1) * gap)) / 2, acc = ML.cssVar("--accent"), mut = ML.cssVar("--muted");
    cs.clearRect(0, 0, STW, STH); cs.font = "800 10px Nunito, sans-serif"; cs.textAlign = "center";
    S.stripBoxes = [];
    for (let i = 0; i < n; i++) {
      const k = (i * STEPS) / S.slow, x = x0 + i * (w + gap), real = i === 0 || i === n - 1;
      paint(cs, frame(S.method, k, S.src === "true").rgb, x, 4, w, h);
      if (k === S.k) { cs.strokeStyle = ML.cssVar("--warn"); cs.lineWidth = 3; cs.strokeRect(x, 4, w, h); }
      cs.fillStyle = real ? mut : acc; cs.fillText(real ? (i ? "B" : "A") : "made " + i, x + w / 2, h + 16);
      S.stripBoxes.push({ x, w, k });
    }
    $("striptag").textContent = `${S.slow - 1} made-up between A and B`;
  }
  function drawBars() {
    const c = cc, labels = ["Repeat", "Fade", "Arrows", "Perfect"], keys = ["repeat", "blend", "motion", "true"], max = Math.max(...S.bars) * 1.15 || 1;
    const L = 10, R = 10, T = 18, B = 30, bw = (CW - L - R) / 4;
    c.clearRect(0, 0, CW, CH); c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center";
    const activeKey = S.method === "motion" && S.src === "true" ? "true" : S.method;
    keys.forEach((k, i) => {
      const v = S.bars[i], h = (v / max) * (CH - T - B), x = L + i * bw + bw * 0.18, ww = bw * 0.64, y = CH - B - h;
      c.fillStyle = k === "repeat" ? ML.cssVar("--muted") : k === "blend" ? ML.cssVar("--warn") : ML.cssVar("--accent");
      c.globalAlpha = k === activeKey ? 1 : 0.45; c.fillRect(x, y, ww, h); c.globalAlpha = 1;
      if (k === activeKey) { c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 2; c.strokeRect(x, y, ww, h); }
      c.fillStyle = ML.cssVar("--ink"); c.fillText(v.toFixed(1) + "%", x + ww / 2, y - 5);
      c.fillStyle = ML.cssVar("--ink-2"); c.fillText(labels[i], x + ww / 2, CH - B + 15);
    });
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 2; c.beginPath(); c.moveTo(L, CH - B); c.lineTo(CW - R, CH - B); c.stroke();
  }
  const MHINT = { repeat: "Shows A for the first half, then jumps to B. Nothing new is made.", blend: "Mixes A and B like two see-through sheets. Moving things get ghosts.", motion: "Slides every bit part of the way along its motion arrow. Smooth!" };
  function draw() {
    if (!S.D) return;
    drawTop(); drawOut(); drawStrip(); drawBars();
    $("mhint").textContent = MHINT[S.method];
    $("srcf").classList.toggle("hide", S.method !== "motion");
    $("per").textContent = S.slow - 1;
    if (S.ready) check();
  }

  // ---------- challenges + narration ----------
  const TRY = { ghost: "Next: choose <b>Follow arrows</b> and play at <b>8×</b>.", smooth: "Next: hunt for the tear. Choose <b>Perfect arrows</b> and the <b>Oops map</b>.", tear: "All done! I've marked the hidden spots in yellow on the oops map. Notice how the red sits right next to them." };
  function hit(k, msg) {
    if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done");
    ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg} ${TRY[k]}`);
    if (Object.keys(S.hits).length === 3) ML.confetti(50);
    if (k === "tear") drawOut();
  }
  function check() { if (S.method === "blend" && S.k >= 18 && S.k <= 30) hit("ghost", "Two faded squares at once: that's ghosting."); }
  const NUDGE = {
    ghost: "Psst! Press <b>Fade</b> on the right and look at the big picture. How many squares do you see?",
    smooth: "Psst! Choose <b>Follow arrows</b>, press <b>8×</b>, then <b>Play slow-mo</b>.",
    tear: "Psst! Choose <b>Follow arrows</b>, then <b>Perfect arrows</b>, then <b>Oops map</b>. Tap where it's still red.",
  };
  function touch() { S.last = Date.now(); }
  setInterval(() => {
    if (Date.now() - S.last < 15000 || S.play) return;
    const k = ["ghost", "smooth", "tear"].find((c) => !S.hits[c]);
    if (!k || S.nudged[k]) return;
    S.nudged[k] = 1; S.last = Date.now(); ML.say(NUDGE[k]);
  }, 3000);

  // ---------- playback ----------
  function setK(k) { S.k = k; $("t").value = k; $("t").dispatchEvent(new Event("input")); }
  function stop() { if (!S.play) return; clearTimeout(S.play.timer); S.play = null; $("play").innerHTML = `${ML.icon("play")} Play slow-mo`; }
  function play() {
    if (S.play) { stop(); return; }
    touch(); const step = STEPS / S.slow, ms = reduce ? 600 : 160;
    S.play = { i: 0, loops: 0, method: S.method, slow: S.slow, speed: S.speed };
    $("play").innerHTML = `${ML.icon("pause")} Pause`;
    ML.say(S.method === "motion" ? "Watch how everything slides smoothly, even though only the first and last pictures are real." : S.method === "blend" ? "Watch: things don't move, they fade from one place to the other." : "Watch: it sits still, then jumps. That's all repeating can do.");
    const tick = () => {
      if (!S.play) return;
      S.play.quiet = true; setK(S.play.i * step); S.play.quiet = false;
      S.play.i++;
      if (S.play.i > S.slow) {
        S.play.i = 0; S.play.loops++;
        const p = S.play;
        if (p.method === "motion" && p.slow === 8 && p.speed >= 2 && S.method === "motion") hit("smooth", "Seven made-up pictures between every real pair, and it still slides smoothly.");
        if (p.loops >= 3) { stop(); return; }
        S.play.timer = setTimeout(tick, ms * 3); return;
      }
      S.play.timer = setTimeout(tick, ms);
    };
    tick();
  }

  // ---------- controls ----------
  ML.bindRange("#t", (v) => "t = " + (v / STEPS).toFixed(2), (v) => {
    S.k = v; if (!S.ready) return; draw();
    if (S.play && S.play.quiet) return;
    touch(); stop();
    if (v === 0 || v === STEPS) ML.say(`That's real picture ${v ? "B" : "A"}. No making up needed here.`);
    else if (S.method === "blend" && v >= 18 && v <= 30) ML.say("See the see-through double? Half of A, half of B. Moving things appear twice.");
    else if (S.method === "repeat") ML.say(`Repeat just shows picture ${v <= 24 ? "A" : "B"}. The real picture has moved on, though.`);
    else ML.say(`I'm making the picture at <b>${Math.round((v / STEPS) * 100)}%</b> of the way from A to B. Every bit goes ${Math.round((v / STEPS) * 100)}% along its arrow.`);
  });
  ML.bindRange("#speed", (v) => v + "×", (v) => {
    S.speed = v; if (!S.ready) return; touch(); stop(); rebuild();
    ML.say(v >= 2.5 ? "Big jumps between A and B! My arrows have a harder time, and the hidden spots get bigger." : `Speed ${v}×. Look at the bar chart: does following the arrows still win?`);
  });
  function seg(id, fn) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      touch(); fn(b.dataset.v);
    }));
  }
  const MSAY = {
    repeat: "Repeat: I just copy the nearest real picture. Cheap, but slow-mo looks jerky.",
    blend: "Fade: I mix A and B. Look at the big picture: ghosts! Each moving thing appears twice, see-through.",
    motion: "Follow arrows: I work out where each bit moved, then slide it part of the way. Much closer to the real picture!",
  };
  seg("method", (v) => { S.method = v; stop(); draw(); ML.say(MSAY[v]); });
  seg("src", (v) => { S.src = v; draw(); ML.say(v === "true" ? "Perfect arrows, straight from the true motion. Is the picture perfect now? Check the oops map!" : "Back to my own arrows from block matching."); });
  seg("slow", (v) => { S.slow = +v; stop(); draw(); ML.say(`${v}× slow motion: ${v - 1} made-up picture${v > 2 ? "s" : ""} between A and B.`); });
  seg("view", (v) => { S.view = v; draw(); ML.say(v === "oops" ? "Dark = right, bright red = wrong. Where are my mistakes hiding?" : "Back to the picture."); });
  $("play").addEventListener("click", play);
  $("strip").addEventListener("click", (e) => {
    const p = ML.canvasPoint($("strip"), e, STW, STH), b = (S.stripBoxes || []).find((q) => p.x >= q.x && p.x <= q.x + q.w);
    if (b) { stop(); setK(b.k); }
  });
  $("out").addEventListener("click", (e) => {
    if (S.view !== "oops") return; touch();
    const p = ML.canvasPoint($("out"), e, BW, BH), x = Math.floor(p.x / K), y = Math.floor(p.y / K);
    const d = I.diff(cur().rgb, truthAt(S.k)), occ = F.occlusion(S.D.scene, S.k / STEPS);
    let nearOcc = false, red = 0;
    for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const i = yy * W + xx;
      if (occ[i]) nearOcc = true; red = Math.max(red, d[i]);
    }
    if (red < 0.1) { ML.say("That spot is dark: I got it right. Look for the bright red bits."); return; }
    if (S.method === "motion" && S.src === "true" && S.k > 6 && S.k < 42 && nearOcc) hit("tear", "Even perfect arrows go wrong where the background was hidden behind a moving thing in one picture.");
    else if (nearOcc) ML.say("Yes, that's a hidden spot! Now try it with <b>Follow arrows</b> and <b>Perfect arrows</b>, somewhere in the middle of the time slider.");
    else ML.say(S.method === "motion" && S.src === "true" ? "That's only a little blur from fetching colours between dots. Look for a brighter red patch right next to a moving thing." : "That mistake comes from wrong arrows. Try <b>Perfect arrows</b> and see if it goes away.");
  });

  document.addEventListener("themechange", draw);
  new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  rebuild();
  S.ready = true;
})();
