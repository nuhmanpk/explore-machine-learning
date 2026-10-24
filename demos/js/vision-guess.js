// What Is It?: MobileNet v2 classification + occlusion-sensitivity heatmap.
(() => {
  const { $, $$ } = ML;
  const S = 480;   // display size (square)
  const IN = 224;  // model input size
  const PATCHES = [32, 56, 80];
  const BASE = "https://upload.wikimedia.org/wikipedia/commons/thumb/";
  const GALLERY = [
    "8/8a/Banana-Single.jpg", "3/3a/Cat03.jpg", "2/26/YellowLabradorLooking_new.jpg", "1/15/Red_Apple.jpg",
    "e/e9/Goldfish3.jpg", "3/3c/Giant_Panda_2004-03-2.jpg", "9/91/Pizza-3007395.jpg", "7/7e/Strawberry_BNC.jpg",
    "a/a4/2019_Toyota_Corolla_Icon_Tech_VVT-i_Hybrid_1.8.jpg",
  ].map((p) => `${BASE}${p}/330px-${p.split("/").pop()}`);
  const DOG = /terrier|retriever|spaniel|hound|poodle|shepherd|collie|corgi|pug|beagle|husky|chihuahua|dalmatian|setter|pointer|schnauzer|mastiff|bulldog|labrador|pinscher|sheepdog|malamute|samoyed|pomeranian|chow|dane|boxer|whippet|greyhound|papillon|maltese|shih-tzu|pekinese|basenji|vizsla|weimaraner|kelpie|briard|komondor|kuvasz|groenendael|malinois|newfoundland|pyrenees|leonberg|bernese|appenzeller|entlebucher|keeshond|griffon|affenpinscher|borzoi|saluki|otterhound|bloodhound|bluetick|redbone|coonhound|foxhound|deerhound|wolfhound|elkhound|ridgeback|dingo|dhole|cardigan|pembroke|toy|cocker|springer|clumber|sussex|brittany|lhasa|tibetan|silky|norfolk|norwich|yorkshire|airedale|kerry|bedlington|border|sealyham|dandie|cairn|wire-haired|soft-coated|scotch|staffordshire|eskimo dog|st bernard|great dane|basset|afghan|ibizan|bouvier|rottweiler|doberman|french bulldog|tibetan mastiff|giant schnauzer/i;
  const CAT = /tabby|tiger cat|persian cat|siamese|egyptian cat/i;

  const pad = ML.setupCanvas($("#pad"), S, S);
  const heatEl = $("#heat"); heatEl.width = S; heatEl.height = S;
  const hctx = heatEl.getContext("2d");
  const video = $("#video");
  let model = null, names = null, mode = "photos", stream = null, frozen = false;
  let busy = false, lastProbs = null, topIdx = -1, heat = null, occRunning = false, patchI = 1;

  // ---------- opt-in download ----------
  // Nothing heavy loads with the page. The button injects TF.js + MobileNet, then fetches the weights.
  function addScript(src) {
    return new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => bad(new Error("script failed: " + src));
      document.head.appendChild(s);
    });
  }
  function setBar(f) {
    const bar = document.querySelector("#loading .dl-bar");
    bar.classList.remove("hidden");
    bar.firstElementChild.style.width = Math.round(f * 100) + "%";
  }
  async function fetchBrain() {
    const btn = document.getElementById("dl-btn");
    btn.disabled = true;
    btn.innerHTML = "Downloading…";
    setBar(0.03);
    if (!window.tf) await addScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
    setBar(0.12);
    if (!window.mobilenet) await addScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js");
    setBar(0.15);
    // The weights come as 4 shards; nudge the bar while they arrive.
    let f = 0.15;
    const t = setInterval(() => setBar((f = Math.min(0.95, f + 0.03))), 400);
    return () => { clearInterval(t); setBar(1); };
  }
  // ---------- model ----------
  async function load() {
    let done = () => {};
    try {
      done = await fetchBrain();
      model = await mobilenet.load({ version: 2, alpha: 1.0 });
      done();
      // index -> class name: classify() returns names sorted by probability; sort infer() the same way.
      const x = tf.randomUniform([IN, IN, 3], 0, 255, "int32");
      const all = await model.classify(x, 1000);
      const logits = model.infer(x); const sm = tf.softmax(logits); const p = await sm.data();
      tf.dispose([x, logits, sm]);
      const order = Array.from(p, (v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
      names = new Array(1000);
      order.forEach(([, i], k) => (names[i] = all[k].className));
      $("#loading").classList.add("hidden");
      ML.toast("Robo's brain is ready");
      guess();
    } catch (e) {
      done();
      console.warn(e);
      $("#loading").innerHTML = `<span style="color:var(--bad)">Couldn't download Robo's brain. Check your internet and reload the page to try again.</span>`;
    }
  }

  async function probsOf(source) {
    const t = tf.tidy(() => tf.softmax(model.infer(source)).squeeze());
    const d = await t.data(); t.dispose();
    return d;
  }

  // ---------- picture sources ----------
  function drawCover(img, w, h, mirror) {
    const c = pad.ctx, s = Math.max(S / w, S / h);
    c.save(); c.fillStyle = "#fff"; c.fillRect(0, 0, S, S);
    if (mirror) { c.translate(S, 0); c.scale(-1, 1); }
    c.drawImage(img, (S - w * s) / 2, (S - h * s) / 2, w * s, h * s);
    c.restore();
  }
  function clearHeat() { heat = null; hctx.clearRect(0, 0, S, S); $("#occ-prog").style.width = "0%"; drawLayerHeat(); }

  const gal = $("#gallery");
  gal.innerHTML = GALLERY.map((u, i) => `<button data-i="${i}" aria-label="Sample photo ${i + 1}"><img crossorigin="anonymous" src="${u}" alt=""></button>`).join("");
  $$("img", gal).forEach((im) => (im.onerror = () => im.parentElement.remove()));
  gal.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const im = b.querySelector("img"); if (!im.complete || !im.naturalWidth) return;
    setMode("photos");
    $$("button", gal).forEach((x) => x.classList.toggle("on", x === b));
    drawCover(im, im.naturalWidth, im.naturalHeight); clearHeat(); guess();
  });

  function setMode(m) {
    mode = m; frozen = false;
    $$("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    $("#pad").classList.toggle("drawable", m === "draw");
    $("#clear").classList.toggle("hidden", m !== "draw");
    $("#freeze").classList.toggle("hidden", m !== "cam" || !stream);
    $("#cam-msg").classList.toggle("hidden", m !== "cam" || !!stream);
    $("#freeze").innerHTML = `${ML.icon("pause")} Freeze`;
    if (m !== "cam" && stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    clearHeat();
  }
  $$("#mode button").forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.m; setMode(m);
    if (m === "draw") { clearPad(); ML.say("Draw something! I learned from <b>photos</b>, not drawings, so my guesses might be really silly."); }
    if (m === "photos") { const f = gal.querySelector("button"); if (f) f.click(); }
    if (m === "cam") { pad.ctx.fillStyle = ML.cssVar("--canvas-bg"); pad.ctx.fillRect(0, 0, S, S); showGuess(null); }
  }));

  $("#cam-on").addEventListener("click", async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "environment" }, audio: false });
      video.srcObject = stream; await video.play(); setMode("cam");
      ML.say("I can see! Point me at things: a cup, a banana, a keyboard…");
    } catch (e) { ML.toast("No camera — try Photos or Upload!"); }
  });
  $("#freeze").addEventListener("click", () => {
    frozen = !frozen;
    $("#freeze").innerHTML = frozen ? `${ML.icon("play")} Live` : `${ML.icon("pause")} Freeze`;
    if (!frozen) clearHeat();
  });

  $("#upload").addEventListener("click", () => $("#file").click());
  $("#file").addEventListener("change", (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const im = new Image();
    im.onload = () => { setMode("photos"); $$("button", gal).forEach((x) => x.classList.remove("on")); drawCover(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(im.src); clearHeat(); guess(); };
    im.src = URL.createObjectURL(f);
  });

  // drawing
  let drawing = false, last = null;
  function clearPad() { pad.ctx.fillStyle = "#fff"; pad.ctx.fillRect(0, 0, S, S); clearHeat(); showGuess(null); }
  $("#clear").addEventListener("click", clearPad);
  const padEl = $("#pad");
  padEl.addEventListener("pointerdown", (e) => { if (mode !== "draw") return; drawing = true; padEl.setPointerCapture(e.pointerId); last = ML.canvasPoint(padEl, e, S, S); clearHeat(); });
  padEl.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = ML.canvasPoint(padEl, e, S, S), c = pad.ctx;
    c.strokeStyle = "#1f2140"; c.lineWidth = 12; c.lineCap = "round";
    c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke(); last = p;
  });
  const endDraw = () => { if (drawing) { drawing = false; guess(); } };
  padEl.addEventListener("pointerup", endDraw); padEl.addEventListener("pointercancel", endDraw);

  // ---------- guessing ----------
  const nice = (n) => n.split(",")[0].trim().replace(/^\w/, (c) => c.toUpperCase());
  const kind = (n) => (CAT.test(n) ? "a kind of cat" : DOG.test(n) ? "a kind of dog" : "");

  let pending = false;
  async function guess() {
    if (!model) return;
    if (busy) { pending = true; return; }
    busy = true;
    try {
      const p = await probsOf(padEl);
      lastProbs = p;
      showGuess(p);
    } finally { busy = false; }
    if (pending) { pending = false; guess(); }
  }

  function showGuess(p) {
    const bars = $("#bars");
    if (!p) {
      $("#g-text").textContent = mode === "draw" ? "Draw something!" : "Thinking…"; $("#g-sub").textContent = "";
      bars.innerHTML = ""; lastProbs = null; drawLayers(); return;
    }
    const top = Array.from(p, (v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 5);
    const prevTop = topIdx;
    topIdx = top[0][1];
    if (bars.children.length !== 5) bars.innerHTML = Array.from({ length: 5 }, () => `<div class="bar"><div class="bl"><span></span><span class="pct"></span></div><div class="track"><div class="fill"></div></div></div>`).join("");
    $$(".bar", bars).forEach((b, k) => {
      const [v, i] = top[k], n = names[i], kd = kind(n);
      b.querySelector(".bl span").innerHTML = `${nice(n)}${kd ? ` <small>(${kd})</small>` : ""}`;
      b.querySelector(".pct").textContent = (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%";
      b.querySelector(".fill").style.width = Math.max(1, v * 100) + "%";
    });
    const [v, i] = top[0], n = nice(names[i]), pct = Math.round(v * 100);
    $("#g-text").textContent = v > 0.15 ? n : `Maybe ${n}?`;
    $("#g-sub").textContent = `${pct}% sure${kind(names[i]) ? " · " + kind(names[i]) : ""}`;
    $("#g-icon").innerHTML = ML.icon(v > 0.5 ? "check" : "question");
    if (mode !== "cam" || prevTop !== topIdx) {
      ML.say(v > 0.6 ? `I'm <b>${pct}%</b> sure that's a <b>${n.toLowerCase()}</b>!`
        : v > 0.2 ? `Hmm… I think it's a <b>${n.toLowerCase()}</b>, but I'm only ${pct}% sure.`
        : mode === "draw" ? `Is it… a <b>${n.toLowerCase()}</b>? I'm really not sure (${pct}%). I learned from photos, not drawings!`
        : `I'm confused! My best guess is <b>${n.toLowerCase()}</b> but only ${pct}% sure.`);
    }
    drawLayers();
  }

  // ---------- occlusion sensitivity ----------
  ML.bindRange("#patch", (v) => ["small", "medium", "big"][v], (v) => (patchI = v));
  $("#occ").addEventListener("click", runOcclusion);
  async function runOcclusion() {
    if (!model || occRunning || !lastProbs) return;
    if (mode === "cam" && !frozen) $("#freeze").click();
    occRunning = true; $("#occ").disabled = true;
    const P = PATCHES[patchI], stride = P / 2, target = topIdx, p0 = lastProbs[target];
    const base = tf.tidy(() => tf.image.resizeBilinear(tf.browser.fromPixels(padEl).toFloat(), [IN, IN]));
    const px = await base.data(); base.dispose();
    const spots = [];
    for (let y = 0; y + P <= IN + 0.5; y += stride) for (let x = 0; x + P <= IN + 0.5; x += stride) spots.push([Math.round(x), Math.round(y)]);
    const acc = new Float32Array(IN * IN), cnt = new Float32Array(IN * IN);
    heat = { acc, cnt };
    ML.say(`I'll cover <b>${spots.length}</b> spots one by one and see how my guess changes. Watch the glow!`);
    const B = 8;
    for (let s = 0; s < spots.length; s += B) {
      const chunk = spots.slice(s, s + B), buf = new Float32Array(chunk.length * IN * IN * 3);
      chunk.forEach(([ox, oy], k) => {
        const off = k * IN * IN * 3; buf.set(px, off);
        for (let y = oy; y < Math.min(IN, oy + P); y++) for (let x = ox; x < Math.min(IN, ox + P); x++) { const j = off + (y * IN + x) * 3; buf[j] = buf[j + 1] = buf[j + 2] = 128; }
      });
      const out = tf.tidy(() => tf.softmax(model.infer(tf.tensor4d(buf, [chunk.length, IN, IN, 3]))).slice([0, target], [-1, 1]));
      const d = await out.data(); out.dispose();
      chunk.forEach(([ox, oy], k) => {
        const drop = Math.max(0, (p0 - d[k]) / (p0 || 1));
        for (let y = oy; y < Math.min(IN, oy + P); y++) for (let x = ox; x < Math.min(IN, ox + P); x++) { acc[y * IN + x] += drop; cnt[y * IN + x]++; }
      });
      $("#occ-prog").style.width = (Math.min(spots.length, s + B) / spots.length) * 100 + "%";
      paintHeat();
      await new Promise(requestAnimationFrame);
    }
    occRunning = false; $("#occ").disabled = false;
    ML.say(`Done! The glowing parts are what made me think <b>${nice(names[target]).toLowerCase()}</b>. Hiding them made me much less sure.`);
  }
  function heatImage() {
    if (!heat) return null;
    const c = document.createElement("canvas"); c.width = IN; c.height = IN;
    const im = c.getContext("2d").createImageData(IN, IN);
    let mx = 1e-6;
    for (let i = 0; i < IN * IN; i++) if (heat.cnt[i]) mx = Math.max(mx, heat.acc[i] / heat.cnt[i]);
    for (let i = 0; i < IN * IN; i++) {
      const t = heat.cnt[i] ? heat.acc[i] / heat.cnt[i] / mx : 0, j = i * 4;
      im.data[j] = 255; im.data[j + 1] = 92 + 118 * Math.max(0, t - 0.5) * 2; im.data[j + 2] = 154 * (1 - t); im.data[j + 3] = 210 * Math.pow(t, 1.6);
    }
    c.getContext("2d").putImageData(im, 0, 0);
    return c;
  }
  function paintHeat() {
    const c = heatImage(); hctx.clearRect(0, 0, S, S);
    if (c) { hctx.imageSmoothingEnabled = true; hctx.drawImage(c, 0, 0, S, S); }
    drawLayerHeat(c);
  }

  // ---------- inside: layers ----------
  const lyIn = $("#ly-in").getContext("2d", { willReadFrequently: true }), lyEdge = $("#ly-edge").getContext("2d"), lyHeat = $("#ly-heat").getContext("2d"), lyOut = $("#ly-out").getContext("2d");
  function drawLayers() {
    lyIn.drawImage(padEl, 0, 0, 160, 160);
    const d = lyIn.getImageData(0, 0, 160, 160).data, o = lyEdge.createImageData(160, 160), g = new Float32Array(160 * 160);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    for (let y = 1; y < 159; y++) for (let x = 1; x < 159; x++) {
      const at = (dx, dy) => g[(y + dy) * 160 + x + dx];
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      const v = Math.min(255, Math.hypot(gx, gy)), j = (y * 160 + x) * 4;
      o.data[j] = o.data[j + 1] = o.data[j + 2] = v; o.data[j + 3] = 255;
    }
    lyEdge.putImageData(o, 0, 0);
    drawLayerHeat(heat ? heatImage() : null);
    // 1000 scores
    const W = 320, H = 160; lyOut.clearRect(0, 0, W, H);
    if (!lastProbs) { $("#ly-ans").textContent = "…"; return; }
    let mx = 0; for (const v of lastProbs) mx = Math.max(mx, v);
    for (let i = 0; i < 1000; i++) {
      const h = Math.max(1, (lastProbs[i] / mx) * (H - 24));
      lyOut.fillStyle = i === topIdx ? ML.cssVar("--accent") : ML.cssVar("--muted");
      lyOut.fillRect((i / 1000) * W, H - h, i === topIdx ? 3 : 0.6, h);
    }
    const tx = (topIdx / 1000) * W;
    lyOut.fillStyle = ML.cssVar("--ink"); lyOut.font = "800 12px Nunito, sans-serif";
    lyOut.textAlign = tx > W / 2 ? "right" : "left"; lyOut.textBaseline = "top";
    lyOut.fillText(nice(names[topIdx]), tx + (tx > W / 2 ? -6 : 6), 4);
    $("#ly-ans").textContent = nice(names[topIdx]);
  }
  function drawLayerHeat(hc) {
    lyHeat.clearRect(0, 0, 160, 160);
    lyHeat.globalAlpha = hc ? 0.45 : 1; lyHeat.drawImage(padEl, 0, 0, 160, 160); lyHeat.globalAlpha = 1;
    if (hc) lyHeat.drawImage(hc, 0, 0, 160, 160);
  }

  // ---------- camera loop ----------
  let lastT = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (mode === "cam" && stream && !frozen && video.readyState >= 2) {
      drawCover(video, video.videoWidth, video.videoHeight, false);
      if (ts - lastT > 300 && !busy) { lastT = ts; guess(); }
    }
  }
  document.addEventListener("themechange", drawLayers);

  // first picture: the banana
  pad.ctx.fillStyle = "#fff"; pad.ctx.fillRect(0, 0, S, S);
  const first = $("img", gal);
  const kick = () => gal.querySelector("button").click();
  if (first.complete && first.naturalWidth) kick(); else first.addEventListener("load", kick, { once: true });
  requestAnimationFrame(loop);
  document.getElementById("dl-btn").addEventListener("click", load);
})();
