// Teach the Camera: MobileNet embeddings + a hand-written cosine KNN, with a live PCA "idea map".
(() => {
  const { $, $$ } = ML;
  const K = 5, MAX_PER_CLASS = 200;
  const COLORS = ["--sup", "--rl", "--diff", "--nn"];
  // Shapes for the drawing groups; everything else comes from the shared icon set.
  const svg = (d) => `<svg class="icon" viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const SHAPES = {
    circle: svg('<circle cx="12" cy="12" r="8"/>'),
    triangle: svg('<path d="M12 4 L21 19 H3 Z"/>'),
    square: svg('<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>'),
  };
  const iconHTML = (n) => SHAPES[n] || ML.icon(n);
  const ICON_CHOICES = ["robot", "star", "heart", "zap", "gift", "apple", "car", "book", "camera", "target", "sun", "moon", "circle", "triangle", "square"];
  const CAM_DEFAULTS = [["robot", "Just me"], ["star", "Thumbs up"], ["heart", "Open hand"], ["eye", "Hiding"]];
  const DRAW_DEFAULTS = [["circle", "Circle"], ["triangle", "Triangle"], ["square", "Square"], ["star", "Star"]];

  let model = null, dims = 0;
  let mode = "cam", stream = null;
  const classes = [];
  let recording = -1, busy = false, lastGuess = -1, stable = 0, saidReady = false;
  let mapDirty = true, pca = null, livePoint = null;
  const smooth = [];

  const video = $("#video"), padEl = $("#pad"), photo = $("#photo");
  const pad = ML.setupCanvas(padEl, 480, 360);
  const map = ML.setupCanvas($("#map"), 480, 300);

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
  async function loadModel() {
    let done = () => {};
    try {
      done = await fetchBrain();
      if (!window.tf || !window.mobilenet) throw new Error("libs missing");
      model = await mobilenet.load({ version: 2, alpha: 1.0 });
      done();
      const probe = tf.tidy(() => model.infer(tf.zeros([224, 224, 3]), true));
      dims = probe.shape[1]; probe.dispose();
      $("#dims").textContent = dims.toLocaleString();
      $("#dims2").textContent = dims.toLocaleString();
      $("#loading").classList.add("hidden");
      ML.say("My eyes are ready! Turn on the camera (or pick Draw), then <b>hold</b> a group's button to show me examples.");
      ML.toast("Robo's eyes loaded");
      renderClasses();
    } catch (e) {
      done();
      console.warn(e);
      $("#loading").innerHTML = `<span style="font-weight:800;color:var(--bad)">Couldn't download Robo's eyes. Check your internet and reload the page to try again.</span>`;
      ML.say("Oh no, I couldn't download my eyes. Check the internet and reload the page.");
    }
  }

  async function embed(source) {
    const t = tf.tidy(() => {
      const e = model.infer(source, true);
      return e.div(e.norm());
    });
    const v = await t.data();
    t.dispose();
    return Float32Array.from(v);
  }

  // ---------- classes ----------
  function addClass(icon, name) {
    if (classes.length >= 4) return;
    classes.push({ icon, name, examples: [] });
    smooth.push(0);
    renderClasses();
  }
  function totalExamples() { return classes.reduce((a, c) => a + c.examples.length, 0); }
  function readyCount() { return classes.filter((c) => c.examples.length > 0).length; }

  function recLabel() { return mode === "draw" ? `${ML.icon("plus")} Add drawing` : mode === "photo" ? `${ML.icon("upload")} Add photos` : `${ML.icon("camera")} Hold to record`; }

  function renderClasses() {
    const host = $("#classes");
    host.innerHTML = classes.map((c, i) => `
      <div class="cls" data-i="${i}" style="--c: var(${COLORS[i]})">
        <div class="cls-top">
          <button class="cls-emoji" data-act="emoji" title="Change icon" aria-label="Change icon">${iconHTML(c.icon)}</button>
          <input type="text" class="cls-name" value="${c.name.replace(/"/g, "&quot;")}" maxlength="20" aria-label="Group name">
          <span class="cls-count">${c.examples.length}</span>
        </div>
        <div class="thumbs"></div>
        <div class="cls-actions">
          <button class="btn small rec" data-act="rec" ${model ? "" : "disabled"}>${recLabel()}</button>
          <button class="btn small ghost" data-act="clear" title="Forget this group's examples" aria-label="Forget examples">${ML.icon("eraser")}</button>
          ${classes.length > 2 ? `<button class="btn small ghost" data-act="del" title="Remove group" aria-label="Remove group">${ML.icon("x")}</button>` : ""}
        </div>
      </div>`).join("");
    classes.forEach((c, i) => renderThumbs(i));
    $("#add-class").disabled = classes.length >= 4;
    renderBars();
    $("#st-n").textContent = totalExamples();
  }
  function renderThumbs(i) {
    const box = $$(".cls")[i].querySelector(".thumbs");
    box.innerHTML = "";
    const ex = classes[i].examples.slice(-7).reverse();
    ex.forEach((e) => box.appendChild(e.thumb));
    for (let k = ex.length; k < 4; k++) { const d = document.createElement("div"); d.className = "ph"; box.appendChild(d); }
  }
  function updateCount(i) {
    const card = $$(".cls")[i];
    if (!card) return;
    card.querySelector(".cls-count").textContent = classes[i].examples.length;
    renderThumbs(i);
    $("#st-n").textContent = totalExamples();
  }

  function makeThumb(source, w, h) {
    const c = document.createElement("canvas");
    c.width = 80; c.height = 80;
    const x = c.getContext("2d");
    const s = Math.max(80 / w, 80 / h);
    if (source === video) { x.translate(80, 0); x.scale(-1, 1); }
    x.drawImage(source, (80 - w * s) / 2, (80 - h * s) / 2, w * s, h * s);
    return c;
  }
  function sourceSize(src) {
    if (src === video) return [video.videoWidth, video.videoHeight];
    if (src === photo || src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
    return [src.width, src.height];
  }

  async function addExample(i, source) {
    if (!model || classes[i].examples.length >= MAX_PER_CLASS) return;
    const [w, h] = sourceSize(source);
    if (!w || !h) return;
    const thumb = makeThumb(source, w, h);
    const emb = await embed(source);
    classes[i].examples.push({ emb, thumb });
    mapDirty = true;
    updateCount(i);
  }

  const host = $("#classes");
  host.addEventListener("input", (e) => {
    if (!e.target.classList.contains("cls-name")) return;
    const i = +e.target.closest(".cls").dataset.i;
    classes[i].name = e.target.value || `Group ${i + 1}`;
    renderBars();
  });
  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const i = +b.closest(".cls").dataset.i, act = b.dataset.act;
    if (act === "emoji") {
      classes[i].icon = ICON_CHOICES[(ICON_CHOICES.indexOf(classes[i].icon) + 1) % ICON_CHOICES.length];
      b.innerHTML = iconHTML(classes[i].icon); renderBars();
    } else if (act === "clear") {
      classes[i].examples = []; mapDirty = true; checks = {}; updateCount(i); renderBars(); selfQuiz();
      ML.say(`Okay, I forgot everything about <b>${classes[i].name}</b>.`);
    } else if (act === "del") {
      classes.splice(i, 1); smooth.splice(i, 1); mapDirty = true; checks = {}; renderClasses(); selfQuiz();
    } else if (act === "rec" && mode === "draw") {
      addDrawing(i);
    } else if (act === "rec" && mode === "photo") {
      photoTarget = i; $("#class-file").click();
    }
  });
  // hold-to-record for the camera
  host.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-act=rec]"); if (!b || mode !== "cam" || !model) return;
    if (!stream) { ML.toast("Turn on the camera first!"); return; }
    e.preventDefault();
    recording = +b.closest(".cls").dataset.i;
    b.classList.add("recording"); b.closest(".cls").classList.add("active");
    b.setPointerCapture(e.pointerId);
    ML.say(`Recording <b>${classes[recording].name}</b>… Wiggle around so I see it from different sides!`);
  });
  const stopRec = () => {
    if (recording < 0) return;
    const i = recording; recording = -1;
    $$(".rec").forEach((b) => b.classList.remove("recording"));
    $$(".cls").forEach((c) => c.classList.remove("active"));
    afterTeach(i);
  };
  host.addEventListener("pointerup", stopRec);
  host.addEventListener("pointercancel", stopRec);
  host.addEventListener("lostpointercapture", stopRec);

  function afterTeach(i) {
    const c = classes[i];
    renderBars();
    const newCheck = selfQuiz();
    if (newCheck) {
      const r = checks[newCheck];
      ML.say(`Checkpoint! With <b>${newCheck} examples</b> each, I quizzed myself and got <b>${Math.round(r.acc * 100)}%</b> right, about <b>${Math.round(r.conf * 100)}% sure</b>. ${newCheck < 10 ? "Teach me more to reach the next checkpoint!" : "Look how much surer I got!"}`);
      return;
    }
    if (readyCount() >= 2 && !saidReady) {
      saidReady = true;
      ML.say(`Got it! I know <b>${readyCount()}</b> groups now. Time to test me — ${mode === "cam" ? "move around and" : mode === "draw" ? "draw something new and" : "test a new photo and"} watch my bars!`);
      ML.confetti(40);
    } else if (readyCount() < 2) {
      const other = classes.find((x) => x.examples.length === 0);
      ML.say(`I've got <b>${c.examples.length}</b> examples of <b>${c.name}</b>! Now show me <b>${other ? other.name : "another group"}</b>.`);
    } else {
      ML.say(`Now I have <b>${c.examples.length}</b> examples of <b>${c.name}</b>. More examples = smarter Robo!`);
    }
  }

  $("#add-class").addEventListener("click", () => {
    const d = (mode === "draw" ? DRAW_DEFAULTS : CAM_DEFAULTS)[classes.length];
    addClass(d[0], d[1]);
  });
  $("#clear-all").addEventListener("click", () => {
    classes.forEach((c) => (c.examples = [])); mapDirty = true; saidReady = false; checks = {}; renderClasses(); selfQuiz();
    showGuess(null);
    ML.say("Poof! I forgot everything. Teach me something new!");
  });

  // ---------- KNN ----------
  // k is never bigger than the smallest taught group, so one group can't be out-voted by sheer numbers
  function currentK() {
    const sizes = classes.map((c) => c.examples.length).filter((n) => n > 0);
    return Math.max(1, Math.min(K, ...sizes));
  }
  function predict(emb, skipEx = null) {
    const all = [];
    classes.forEach((c, ci) => c.examples.forEach((e) => {
      let s = 0; const v = e.emb;
      for (let i = 0; i < v.length; i++) s += v[i] * emb[i];
      all.push({ ci, s, e, skip: e === skipEx });
    }));
    if (skipEx) all.splice(all.findIndex((a) => a.skip), 1);
    all.sort((a, b) => b.s - a.s);
    const k = currentK();
    const top = all.slice(0, Math.min(k, all.length));
    const votes = new Array(classes.length).fill(0);
    // closer neighbours get a much louder vote: weight = e^(20·similarity)
    top.forEach((t) => (votes[t.ci] += Math.exp(20 * (t.s - top[0].s))));
    const tot = votes.reduce((a, b) => a + b, 0) || 1;
    return { probs: votes.map((v) => v / tot), top };
  }

  function renderBars(probs) {
    const bars = $("#bars");
    if (bars.children.length !== classes.length) {
      bars.innerHTML = classes.map((c, i) => `<div class="bar" style="--c: var(${COLORS[i]})"><span class="bn"></span><div class="track"><div class="fill" style="background:var(${COLORS[i]})"></div></div><span class="pct">–</span></div>`).join("");
    }
    $$(".bar", bars).forEach((b, i) => {
      b.querySelector(".bn").textContent = classes[i].name;
      if (probs) {
        smooth[i] = mode === "cam" ? ML.lerp(smooth[i] || 0, probs[i] || 0, 0.5) : probs[i] || 0;
        b.querySelector(".fill").style.width = (smooth[i] * 100).toFixed(1) + "%";
        b.querySelector(".pct").textContent = Math.round(smooth[i] * 100) + "%";
      } else if (readyCount() < 2) {
        b.querySelector(".fill").style.width = "0%";
        b.querySelector(".pct").textContent = "–";
      }
    });
  }

  function showGuess(probs) {
    if (!probs || readyCount() < 2) {
      $("#g-emoji").innerHTML = ML.icon("robot");
      $("#g-text").textContent = "Teach me first!";
      $("#g-sub").textContent = "Add a few examples to at least two groups.";
      lastGuess = -1;
      return;
    }
    renderBars(probs);
    let best = 0;
    smooth.forEach((p, i) => { if (p > smooth[best]) best = i; });
    const conf = smooth[best];
    $("#g-emoji").innerHTML = conf > 0.5 ? iconHTML(classes[best].icon) : ML.icon("question");
    $("#g-text").textContent = conf > 0.5 ? classes[best].name : "Hmm… not sure";
    $("#g-sub").textContent = conf > 0.5 ? `${Math.round(conf * 100)}% sure` : "Show me more examples!";
    if (best === lastGuess) stable++; else { stable = 0; lastGuess = best; }
    if (mode !== "cam") {
      if (!drawing) ML.say(conf > 0.5 ? `I think that's <b>${esc(classes[best].name)}</b>! I'm ${Math.round(conf * 100)}% sure. Look below to see <b>why</b>.` : "Hmm, I'm not sure. Teach me a few more examples!");
    } else if (stable === 3 && conf > 0.6) ML.say(`That's <b>${esc(classes[best].name)}</b>! I'm ${Math.round(conf * 100)}% sure.`);
  }

  async function guessFrom(source) {
    if (!model || readyCount() < 2) { showGuess(null); return; }
    const t0 = performance.now();
    const emb = await embed(source);
    $("#st-ms").innerHTML = `${Math.round(performance.now() - t0)}<small> ms</small>`;
    livePoint = emb;
    const { probs, top } = predict(emb);
    showGuess(probs);
    renderInside(source, emb, top);
  }

  // ---------- "what's happening inside" ----------
  const nbrBox = $("#nbrs");
  nbrBox.innerHTML = Array.from({ length: K }, () => `<div class="nbr"><canvas width="80" height="80"></canvas><span>–</span></div>`).join("");
  const nbrEls = $$(".nbr", nbrBox);
  const inNow = $("#in-now").getContext("2d"), embBars = $("#emb-bars").getContext("2d");
  function renderInside(source, emb, top) {
    const [w, h] = sourceSize(source);
    inNow.clearRect(0, 0, 80, 80);
    if (w && h) inNow.drawImage(makeThumb(source, w, h), 0, 0);
    // first 100 of the embedding numbers as bars
    const N = 100, eb = embBars;
    eb.clearRect(0, 0, 200, 80);
    let mx = 1e-6; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(emb[i]));
    eb.fillStyle = ML.cssVar("--accent");
    for (let i = 0; i < N; i++) { const bh = (Math.abs(emb[i]) / mx) * 70; eb.fillRect(i * 2, 75 - bh, 1.5, bh); }
    nbrEls.forEach((el, i) => {
      const t = top[i], cv = el.querySelector("canvas"), x = cv.getContext("2d");
      x.clearRect(0, 0, 80, 80);
      if (!t) { el.style.removeProperty("--c"); el.querySelector("span").textContent = "–"; return; }
      x.drawImage(t.e.thumb, 0, 0);
      el.style.setProperty("--c", `var(${COLORS[t.ci]})`);
      el.querySelector("span").textContent = Math.round(Math.max(0, t.s) * 100) + "%";
    });
    $("#k-lbl").textContent = top.length;
    const counts = new Array(classes.length).fill(0);
    top.forEach((t) => counts[t.ci]++);
    const { probs } = predict(emb);
    let best = 0; probs.forEach((p, i) => { if (p > probs[best]) best = i; });
    $("#votes").innerHTML = counts.map((c, i) => c ? `<div class="vr"><span class="dotv" style="background:var(${COLORS[i]})"></span>${c}× ${esc(classes[i].name)}</div>` : "").join("") +
      `<div class="win">So I say: ${esc(classes[best].name)}</div>`;
  }
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- self-quiz checkpoints ----------
  const CHECKS = [2, 5, 10];
  let checks = {};
  function renderChecks() {
    $("#checks").innerHTML = CHECKS.map((n) => {
      const r = checks[n];
      return `<div class="chk ${r ? "done" : ""}"><div>${n} each</div><div class="cv">${r ? Math.round(r.conf * 100) + "%" : "?"}</div><div class="cbar"><i style="width:${r ? r.conf * 100 : 0}%"></i></div><div>${r ? "sure" : "not yet"}</div></div>`;
    }).join("");
  }
  function selfQuiz() {
    const ready = classes.filter((c) => c.examples.length > 0);
    if (ready.length < 2) { $("#st-acc").textContent = "–"; $("#st-conf").textContent = "–"; return null; }
    let pool = [];
    classes.forEach((c, ci) => c.examples.forEach((e) => pool.push({ e, ci })));
    if (pool.length > 80) { const r = ML.seeded(pool.length); pool = pool.map((x) => [r(), x]).sort((a, b) => a[0] - b[0]).slice(0, 80).map((x) => x[1]); }
    let right = 0, conf = 0;
    pool.forEach(({ e, ci }) => {
      const { probs } = predict(e.emb, e);
      let best = 0; probs.forEach((p, i) => { if (p > probs[best]) best = i; });
      if (best === ci) right++;
      conf += probs[ci];
    });
    const res = { acc: right / pool.length, conf: conf / pool.length };
    $("#st-acc").textContent = Math.round(res.acc * 100) + "%";
    $("#st-conf").textContent = Math.round(res.conf * 100) + "%";
    const minPer = Math.min(...ready.map((c) => c.examples.length));
    let newCheck = null;
    CHECKS.forEach((n) => { if (minPer >= n && !checks[n]) { checks[n] = res; newCheck = n; } });
    renderChecks();
    return newCheck;
  }

  // ---------- modes ----------
  function setMode(m) {
    mode = m;
    $$("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    video.classList.toggle("hidden", m !== "cam" || !stream);
    $("#cam-empty").classList.toggle("hidden", m !== "cam" || !!stream);
    padEl.classList.toggle("hidden", m !== "draw");
    $("#pad-tools").classList.toggle("hidden", m !== "draw");
    const hasPhoto = !!photo.getAttribute("src");
    photo.classList.toggle("hidden", m !== "photo" || !hasPhoto);
    $("#photo-empty").classList.toggle("hidden", m !== "photo" || hasPhoto);
    $("#photo-tools").classList.toggle("hidden", m !== "photo" || !hasPhoto);
    livePoint = null;
    if (totalExamples() === 0) {
      const defs = m === "draw" ? DRAW_DEFAULTS : CAM_DEFAULTS;
      classes.forEach((c, i) => { c.icon = defs[i][0]; c.name = defs[i][1]; });
    }
    renderClasses();
    ML.say({
      cam: stream ? "Camera mode! Hold a button to record examples." : "Camera mode! Press <b>Turn on camera</b> so I can see you.",
      draw: "Draw mode! Draw a shape, press <b>Add drawing</b> on its group. Do each one 3–5 times, wobbly is fine!",
      photo: "Photo mode! Add a few photos to each group, then press <b>Test a photo</b>.",
    }[m]);
  }
  $$("#mode button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.m)));

  // camera
  $("#cam-on").addEventListener("click", async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      video.srcObject = stream; await video.play();
      setMode("cam");
      ML.say(model ? "I can see you! Now <b>hold</b> the first group's record button." : "I can see you! Wait for my eyes to finish loading…");
    } catch (e) {
      ML.toast("No camera — try Draw or Photos!");
      ML.say("I can't use a camera here. No problem — try <b>Draw</b> or <b>Photos</b> mode!");
    }
  });

  // drawing pad
  function clearPad() {
    pad.ctx.fillStyle = "#fff"; pad.ctx.fillRect(0, 0, 480, 360);
    padDirty = false; livePoint = null;
  }
  let drawing = false, last = null, padDirty = false, lastPadGuess = 0;
  padEl.addEventListener("pointerdown", (e) => { drawing = true; padEl.setPointerCapture(e.pointerId); last = ML.canvasPoint(padEl, e, 480, 360); dot(last); });
  padEl.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = ML.canvasPoint(padEl, e, 480, 360);
    const c = pad.ctx;
    c.strokeStyle = "#1f2140"; c.lineWidth = 16; c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke();
    last = p; padDirty = true;
    if (performance.now() - lastPadGuess > 350 && !busy) { lastPadGuess = performance.now(); runGuess(padEl); }
  });
  function dot(p) { const c = pad.ctx; c.fillStyle = "#1f2140"; c.beginPath(); c.arc(p.x, p.y, 8, 0, Math.PI * 2); c.fill(); padDirty = true; }
  const endDraw = () => { if (!drawing) return; drawing = false; runGuess(padEl); };
  padEl.addEventListener("pointerup", endDraw);
  padEl.addEventListener("pointercancel", endDraw);
  $("#pad-clear").addEventListener("click", clearPad);
  async function addDrawing(i) {
    if (!padDirty) { ML.toast("Draw something first!"); return; }
    await addExample(i, padEl);
    clearPad();
    afterTeach(i);
  }
  // If a guess is already running, remember the latest request and run it right after.
  let pending = null;
  async function runGuess(src) {
    if (busy) { pending = src; return; }
    busy = true;
    try { await guessFrom(src); } finally { busy = false; }
    if (pending) { const p = pending; pending = null; runGuess(p); }
  }

  // photos
  let photoTarget = 0;
  $("#class-file").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files).slice(0, 30);
    e.target.value = "";
    for (const f of files) {
      const img = await loadImg(URL.createObjectURL(f));
      await addExample(photoTarget, img);
      URL.revokeObjectURL(img.src);
    }
    if (files.length) afterTeach(photoTarget);
  });
  const pickTest = () => $("#test-file").click();
  $("#test-photo").addEventListener("click", pickTest);
  $("#test-photo2").addEventListener("click", pickTest);
  $("#test-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    photo.src = URL.createObjectURL(f);
    await photo.decode().catch(() => {});
    setMode("photo");
    if (readyCount() < 2) ML.say("Nice photo! But first add photos to <b>at least two groups</b>, so I know what to look for.");
    else runGuess(photo);
  });
  function loadImg(url) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  }

  // ---------- idea map (PCA) ----------
  const disp = new Map();
  function computePCA() {
    mapDirty = false;
    const pts = [];
    classes.forEach((c, ci) => c.examples.forEach((e) => pts.push({ e, ci })));
    if (pts.length < 2) { pca = { pts, comps: null }; return; }
    const d = pts[0].e.emb.length, n = pts.length;
    const mean = new Float32Array(d);
    pts.forEach((p) => { for (let i = 0; i < d; i++) mean[i] += p.e.emb[i] / n; });
    const X = pts.map((p) => { const r = new Float32Array(d); for (let i = 0; i < d; i++) r[i] = p.e.emb[i] - mean[i]; return r; });
    const comps = [];
    const rng = ML.seeded(7);
    for (let c = 0; c < 2; c++) {
      let v = new Float32Array(d).map(() => rng() - 0.5);
      for (let it = 0; it < 30; it++) {
        const u = X.map((x) => { let s = 0; for (let i = 0; i < d; i++) s += x[i] * v[i]; return s; });
        const nv = new Float32Array(d);
        X.forEach((x, k) => { for (let i = 0; i < d; i++) nv[i] += x[i] * u[k]; });
        comps.forEach((pc) => { let s = 0; for (let i = 0; i < d; i++) s += nv[i] * pc[i]; for (let i = 0; i < d; i++) nv[i] -= s * pc[i]; });
        let nn = 0; for (let i = 0; i < d; i++) nn += nv[i] * nv[i];
        nn = Math.sqrt(nn) || 1;
        for (let i = 0; i < d; i++) nv[i] /= nn;
        v = nv;
      }
      comps.push(v);
    }
    const proj = (x) => comps.map((pc) => { let s = 0; for (let i = 0; i < d; i++) s += (x[i] - mean[i]) * pc[i]; return s; });
    pts.forEach((p) => (p.xy = proj(p.e.emb)));
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    pts.forEach(({ xy }) => { mnx = Math.min(mnx, xy[0]); mxx = Math.max(mxx, xy[0]); mny = Math.min(mny, xy[1]); mxy = Math.max(mxy, xy[1]); });
    pca = { pts, proj, box: [mnx, mxx, mny, mxy] };
  }
  function toScreen(xy) {
    const [mnx, mxx, mny, mxy] = pca.box, pad = 30;
    return [pad + ((xy[0] - mnx) / (mxx - mnx || 1)) * (480 - 2 * pad), pad + ((xy[1] - mny) / (mxy - mny || 1)) * (300 - 2 * pad)];
  }
  function drawMap() {
    if (mapDirty) computePCA();
    const c = map.ctx;
    c.clearRect(0, 0, 480, 300);
    c.fillStyle = ML.cssVar("--muted"); c.font = "700 14px Nunito, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    if (!pca || !pca.proj) { c.fillText("Teach Robo a few examples to fill the map", 240, 150); return; }
    pca.pts.forEach((p) => {
      const [tx, ty] = toScreen(p.xy);
      let dp = disp.get(p.e);
      if (!dp) { dp = { x: 240, y: 150 }; disp.set(p.e, dp); }
      dp.x = ML.lerp(dp.x, tx, 0.15); dp.y = ML.lerp(dp.y, ty, 0.15);
      c.fillStyle = ML.cssVar(COLORS[p.ci]);
      c.globalAlpha = 0.85;
      c.beginPath(); c.arc(dp.x, dp.y, 6, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
    if (livePoint && livePoint.length === pca.pts[0].e.emb.length) {
      const [x, y] = toScreen(pca.proj(livePoint));
      const cx = ML.clamp(x, 12, 468), cy = ML.clamp(y, 12, 288);
      c.fillStyle = ML.cssVar("--warn"); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 2.5; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 14; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      c.closePath(); c.fill(); c.stroke();
    }
    // legend
    c.textAlign = "left"; c.font = "800 12px Nunito, sans-serif";
    let lx = 10;
    classes.forEach((cl, i) => {
      c.fillStyle = ML.cssVar(COLORS[i]); c.beginPath(); c.arc(lx + 6, 290, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = ML.cssVar("--ink-2"); const t = `${cl.name}`; c.fillText(t, lx + 15, 290);
      lx += 26 + c.measureText(t).width;
    });
  }

  // ---------- main loop ----------
  let lastTick = 0;
  async function tick(ts) {
    requestAnimationFrame(tick);
    drawMap();
    if (!model || busy || mode !== "cam" || !stream || video.readyState < 2) return;
    if (ts - lastTick < (recording >= 0 ? 90 : 140)) return;
    lastTick = ts;
    busy = true;
    try {
      if (recording >= 0) {
        await addExample(recording, video);
        if (classes[recording] && classes[recording].examples.length >= MAX_PER_CLASS) stopRec();
      } else await guessFrom(video);
    } finally { busy = false; }
  }

  addClass(...CAM_DEFAULTS[0]);
  addClass(...CAM_DEFAULTS[1]);
  clearPad();
  renderChecks();
  requestAnimationFrame(tick);
  document.getElementById("dl-btn").addEventListener("click", loadModel);
})();
