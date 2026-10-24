// Shared bits for the Vision-Language lessons (vlm-match, vlm-caption).
//
//   VLM.lib()                         -> Promise<transformers.js module> (same pinned build as lang-ai.js)
//   VLM.tracker(onProgress)           -> progress_callback that reports (fraction|null, bytes)
//   VLM.toRaw(m, canvas, size)        -> RawImage (RGB, size×size) of a canvas
//   VLM.ImageSource(root, opts)       -> picture picker: draw pad, ready-made pictures, upload, camera
//   VLM.barcode(ctx, vec, x, y, w, h, opts) -> draws a list of numbers as a coloured strip
//   VLM.loaderUI(card, label)         -> { set(frac, bytes), done(), fail(msg) } progress bar helper
window.VLM = (function () {
  const LIB_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
  let libPromise = null;

  function lib() {
    if (!libPromise) {
      libPromise = import(LIB_URL).then((m) => {
        m.env.allowLocalModels = false;
        return m;
      });
      libPromise.catch(() => (libPromise = null));
    }
    return libPromise;
  }

  // Combines per-file download events into one 0..1 number.
  function tracker(onProgress) {
    const files = {};
    return (e) => {
      if (!onProgress) return;
      if (e.status === "progress") files[e.file] = { loaded: e.loaded || 0, total: e.total || 0 };
      else if (e.status === "done" && files[e.file] && files[e.file].total) files[e.file].loaded = files[e.file].total;
      let loaded = 0, total = 0, known = true;
      for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; if (!f.total) known = false; }
      onProgress(known && total ? loaded / total : null, loaded);
    };
  }

  // The processors want plain RGB pixels, so we redraw the canvas small and drop the alpha channel.
  function toRaw(m, canvas, size = 224) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#fff";
    x.fillRect(0, 0, size, size);
    x.drawImage(canvas, 0, 0, size, size);
    const d = x.getImageData(0, 0, size, size).data;
    const rgb = new Uint8ClampedArray(size * size * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
    return new m.RawImage(rgb, size, size, 3);
  }

  // ---------- ready-made pictures (vector drawings on a 320×320 canvas) ----------
  const S = 320;
  function sky(c, top, bottom) {
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  }
  function circle(c, x, y, r, fill, stroke, lw = 6) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function poly(c, pts, fill, stroke, lw = 6) {
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = "round"; c.stroke(); }
  }
  const INK = "#1f2140";
  const SAMPLES = {
    cat(c) {
      sky(c, "#fff4e0", "#ffe3c2");
      poly(c, [[80, 140], [95, 50], [150, 105]], "#f59a3b", INK);
      poly(c, [[240, 140], [225, 50], [170, 105]], "#f59a3b", INK);
      circle(c, 160, 175, 100, "#f59a3b", INK);
      poly(c, [[100, 85], [105, 120], [125, 110]], "#ffc6a8");
      poly(c, [[220, 85], [215, 120], [195, 110]], "#ffc6a8");
      circle(c, 122, 160, 14, INK); circle(c, 198, 160, 14, INK);
      circle(c, 127, 155, 4, "#fff"); circle(c, 203, 155, 4, "#fff");
      poly(c, [[150, 195], [170, 195], [160, 207]], "#ff7a9a", INK, 3);
      c.strokeStyle = INK; c.lineWidth = 4; c.lineCap = "round";
      c.beginPath(); c.moveTo(160, 207); c.quadraticCurveTo(145, 225, 132, 215); c.moveTo(160, 207); c.quadraticCurveTo(175, 225, 188, 215); c.stroke();
      [[-1, 190], [-1, 205], [1, 190], [1, 205]].forEach(([s, y]) => { c.beginPath(); c.moveTo(160 + s * 45, y); c.lineTo(160 + s * 110, y + (y - 197) * 1.2); c.stroke(); });
    },
    fish(c) {
      sky(c, "#bfe8ff", "#5fb4e8");
      c.fillStyle = "rgba(255,255,255,.6)";
      [[60, 70, 10], [80, 40, 6], [250, 260, 8]].forEach(([x, y, r]) => circle(c, x, y, r, null, "#fff", 3));
      poly(c, [[230, 165], [295, 115], [295, 215]], "#ff8a3d", INK);
      c.beginPath(); c.ellipse(150, 165, 100, 62, 0, 0, Math.PI * 2); c.fillStyle = "#ffb020"; c.fill(); c.strokeStyle = INK; c.lineWidth = 6; c.stroke();
      c.strokeStyle = "#ff8a3d"; c.lineWidth = 8;
      c.beginPath(); c.arc(150, 165, 40, -1, 1); c.stroke();
      circle(c, 95, 150, 13, "#fff", INK, 4); circle(c, 92, 150, 6, INK);
      poly(c, [[150, 108], [190, 80], [205, 112]], "#ff8a3d", INK, 4);
      c.fillStyle = "#3a9a5a"; c.fillRect(0, 290, S, 30);
    },
    sun(c) {
      sky(c, "#6cc4ff", "#c8ecff");
      c.fillStyle = "#5cc46b"; c.beginPath(); c.ellipse(160, 330, 260, 90, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#ffb020"; c.lineWidth = 10; c.lineCap = "round";
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(160 + Math.cos(a) * 80, 130 + Math.sin(a) * 80); c.lineTo(160 + Math.cos(a) * 112, 130 + Math.sin(a) * 112); c.stroke(); }
      circle(c, 160, 130, 62, "#ffd23f", "#ffb020", 6);
      c.fillStyle = "#fff"; [[40, 60], [270, 70]].forEach(([x, y]) => { circle(c, x, y, 18, "#fff"); circle(c, x + 20, y - 6, 22, "#fff"); circle(c, x + 42, y, 16, "#fff"); });
    },
    rain(c) {
      sky(c, "#7d8aa3", "#b9c3d4");
      [[110, 110, 50], [170, 90, 62], [230, 115, 46], [150, 135, 50], [205, 138, 44]].forEach(([x, y, r]) => circle(c, x, y, r, "#e6e9f0"));
      c.strokeStyle = "#2f7fff"; c.lineWidth = 7; c.lineCap = "round";
      for (let i = 0; i < 14; i++) { const x = 80 + (i % 7) * 30 + (i > 6 ? 15 : 0), y = 190 + (i > 6 ? 55 : 0); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 8, y + 26); c.stroke(); }
      c.fillStyle = "#5a6b85"; c.fillRect(0, 295, S, 25);
    },
    snowman(c) {
      sky(c, "#9fd0ff", "#e8f4ff");
      c.fillStyle = "#fff"; c.fillRect(0, 270, S, 50);
      circle(c, 160, 235, 70, "#fff", INK); circle(c, 160, 135, 50, "#fff", INK);
      poly(c, [[115, 95], [205, 95], [195, 88], [185, 40], [135, 40], [125, 88]], INK);
      circle(c, 145, 125, 6, INK); circle(c, 175, 125, 6, INK);
      poly(c, [[160, 140], [200, 148], [160, 152]], "#ff8a3d", INK, 2);
      [205, 235, 265].forEach((y) => circle(c, 160, y, 6, INK));
      c.strokeStyle = "#7a4a2a"; c.lineWidth = 6; c.beginPath(); c.moveTo(95, 215); c.lineTo(40, 175); c.moveTo(225, 215); c.lineTo(280, 175); c.stroke();
      c.fillStyle = "#fff"; for (let i = 0; i < 30; i++) circle(c, (i * 97) % S, (i * 53) % 260, 4, "#fff");
    },
    rainbow(c) {
      sky(c, "#b8e3ff", "#eef8ff");
      ["#ff4d5e", "#ff8a3d", "#ffd23f", "#2fbf62", "#2f9bff", "#7c5cff"].forEach((col, i) => {
        c.strokeStyle = col; c.lineWidth = 18; c.beginPath(); c.arc(160, 260, 150 - i * 18, Math.PI, 0); c.stroke();
      });
      [[20, 250], [250, 250]].forEach(([x, y]) => { circle(c, x + 20, y, 26, "#fff"); circle(c, x + 45, y - 12, 30, "#fff"); circle(c, x + 70, y, 24, "#fff"); });
    },
    happy(c) {
      sky(c, "#fff8ee", "#fff1dc");
      circle(c, 160, 160, 120, "#ffd23f", INK, 7);
      circle(c, 118, 130, 16, INK); circle(c, 202, 130, 16, INK);
      c.strokeStyle = INK; c.lineWidth = 9; c.lineCap = "round";
      c.beginPath(); c.arc(160, 165, 70, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
      circle(c, 92, 180, 14, "rgba(255,92,154,.45)"); circle(c, 228, 180, 14, "rgba(255,92,154,.45)");
    },
    sad(c) {
      sky(c, "#eef2f8", "#dde4ef");
      circle(c, 160, 160, 120, "#ffd23f", INK, 7);
      circle(c, 118, 135, 14, INK); circle(c, 202, 135, 14, INK);
      c.strokeStyle = INK; c.lineWidth = 9; c.lineCap = "round";
      c.beginPath(); c.arc(160, 255, 60, 1.25 * Math.PI, 1.75 * Math.PI); c.stroke();
      c.beginPath(); c.moveTo(95, 108); c.lineTo(135, 100); c.moveTo(225, 108); c.lineTo(185, 100); c.stroke();
      c.beginPath(); c.moveTo(205, 155); c.quadraticCurveTo(195, 180, 205, 188); c.quadraticCurveTo(215, 180, 205, 155); c.fillStyle = "#4aa8ff"; c.fill();
    },
    house(c) {
      sky(c, "#8fd3ff", "#d8f1ff");
      c.fillStyle = "#5cc46b"; c.fillRect(0, 260, S, 60);
      c.fillStyle = "#ffe2b8"; c.fillRect(70, 150, 180, 120); c.strokeStyle = INK; c.lineWidth = 6; c.strokeRect(70, 150, 180, 120);
      poly(c, [[50, 155], [160, 60], [270, 155]], "#ff4d5e", INK);
      c.fillStyle = "#8a5a3a"; c.fillRect(140, 200, 40, 70); c.strokeRect(140, 200, 40, 70);
      c.fillStyle = "#bfe8ff"; c.fillRect(88, 175, 38, 34); c.strokeRect(88, 175, 38, 34); c.fillRect(194, 175, 38, 34); c.strokeRect(194, 175, 38, 34);
      circle(c, 270, 50, 26, "#ffd23f");
    },
    tree(c) {
      sky(c, "#a8ddff", "#e6f6ff");
      c.fillStyle = "#5cc46b"; c.fillRect(0, 265, S, 55);
      c.fillStyle = "#8a5a3a"; c.fillRect(140, 170, 40, 110); c.strokeStyle = INK; c.lineWidth = 6; c.strokeRect(140, 170, 40, 110);
      [[160, 110, 70], [110, 150, 50], [210, 150, 50], [125, 95, 45], [195, 95, 45]].forEach(([x, y, r]) => circle(c, x, y, r, "#2fa84f"));
      [[130, 130], [190, 115], [165, 165], [215, 160]].forEach(([x, y]) => circle(c, x, y, 9, "#ff4d5e"));
    },
    car(c) {
      sky(c, "#bfe6ff", "#eaf7ff");
      c.fillStyle = "#585b73"; c.fillRect(0, 240, S, 80);
      c.fillStyle = "#fff"; for (let x = 10; x < S; x += 60) c.fillRect(x, 282, 34, 6);
      poly(c, [[40, 215], [60, 165], [110, 160], [140, 120], [215, 120], [250, 160], [290, 170], [290, 215]], "#ff4d5e", INK);
      poly(c, [[150, 130], [208, 130], [232, 160], [128, 160]], "#bfe8ff", INK, 4);
      circle(c, 95, 222, 26, INK); circle(c, 95, 222, 10, "#ccc");
      circle(c, 240, 222, 26, INK); circle(c, 240, 222, 10, "#ccc");
      circle(c, 282, 185, 7, "#ffe27a");
    },
    apple(c) {
      sky(c, "#fff8ee", "#ffeeda");
      c.beginPath();
      c.moveTo(160, 105);
      c.bezierCurveTo(110, 70, 45, 110, 60, 190);
      c.bezierCurveTo(75, 265, 130, 285, 160, 262);
      c.bezierCurveTo(190, 285, 245, 265, 260, 190);
      c.bezierCurveTo(275, 110, 210, 70, 160, 105);
      c.fillStyle = "#ff3b4e"; c.fill(); c.strokeStyle = INK; c.lineWidth = 7; c.stroke();
      c.strokeStyle = "#7a4a2a"; c.lineWidth = 9; c.lineCap = "round"; c.beginPath(); c.moveTo(160, 105); c.lineTo(170, 55); c.stroke();
      c.beginPath(); c.ellipse(200, 70, 32, 14, -0.4, 0, Math.PI * 2); c.fillStyle = "#2fbf62"; c.fill(); c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
      c.beginPath(); c.ellipse(110, 150, 12, 26, 0.4, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,.5)"; c.fill();
    },
    rocket(c) {
      sky(c, "#1d1f4a", "#3a3f8f");
      for (let i = 0; i < 40; i++) circle(c, (i * 83) % S, (i * 47) % S, i % 5 ? 2 : 3, "#fff");
      poly(c, [[160, 30], [205, 110], [205, 220], [115, 220], [115, 110]], "#f4f1ff", INK);
      poly(c, [[115, 170], [75, 240], [115, 225]], "#ff4d5e", INK);
      poly(c, [[205, 170], [245, 240], [205, 225]], "#ff4d5e", INK);
      circle(c, 160, 130, 22, "#5fb4e8", INK, 5);
      poly(c, [[130, 222], [190, 222], [175, 285], [160, 265], [145, 285]], "#ffb020");
    },
  };
  const SAMPLE_NAMES = { cat: "Cat", fish: "Fish", sun: "Sunny", rain: "Rain", snowman: "Snowman", rainbow: "Rainbow", happy: "Happy", sad: "Sad", house: "House", tree: "Tree", car: "Car", apple: "Apple", rocket: "Rocket" };

  // ---------- picture picker ----------
  // opts: { onChange(reason), live: bool (offer a "keep looking" camera mode), start: sample name }
  function ImageSource(root, opts = {}) {
    const PALETTE = ["#1f2140", "#ff4d5e", "#ff8a3d", "#ffd23f", "#2fbf62", "#2f9bff", "#7c5cff", "#8a5a3a", "#ffffff"];
    root.innerHTML = `
      <div class="seg src-tabs" role="tablist">
        <button data-tab="draw" class="on">${ML.icon("pencil")} Draw</button>
        <button data-tab="pics">${ML.icon("image")} Pictures</button>
        <button data-tab="upload">${ML.icon("upload")} Upload</button>
        <button data-tab="cam">${ML.icon("camera")} Camera</button>
      </div>
      <div class="pic-wrap"><canvas class="pic"></canvas><video class="hidden" playsinline muted></video><div class="pic-overlay"></div></div>
      <div class="src-panel" data-panel="draw">
        <div class="swatches">${PALETTE.map((c, i) => `<button class="sw ${i === 0 ? "on" : ""}" data-c="${c}" style="background:${c}" aria-label="colour ${c}"></button>`).join("")}</div>
        <div class="row">
          <div class="seg brush"><button data-s="6">Thin</button><button data-s="14" class="on">Medium</button><button data-s="30">Fat</button></div>
          <button class="btn small ghost" data-act="fill">${ML.icon("palette")} Fill</button>
          <button class="btn small ghost" data-act="undo">${ML.icon("reset")} Undo</button>
          <button class="btn small ghost" data-act="clear">${ML.icon("eraser")} Clear</button>
        </div>
      </div>
      <div class="src-panel hidden" data-panel="pics"><div class="sample-grid"></div></div>
      <div class="src-panel hidden" data-panel="upload">
        <label class="btn">${ML.icon("upload")} Choose a photo<input type="file" accept="image/*" class="hidden"></label>
        <p class="muted small-note">Your photo stays on your computer. Nothing is sent anywhere.</p>
      </div>
      <div class="src-panel hidden" data-panel="cam">
        <div class="row">
          <button class="btn" data-act="cam-start">${ML.icon("camera")} Turn on camera</button>
          <button class="btn primary hidden" data-act="snap">${ML.icon("camera")} Snap!</button>
          ${opts.live ? `<label class="row live-toggle hidden"><input type="checkbox" class="live"> Keep looking</label>` : ""}
        </div>
        <p class="muted small-note">The camera picture never leaves your computer.</p>
      </div>`;
    const canvas = root.querySelector("canvas.pic");
    const video = root.querySelector("video");
    const { ctx } = ML.setupCanvas(canvas, S, S);
    let color = PALETTE[0], size = 14, fillMode = false, drawing = false, last = null, stream = null, camLoop = 0;
    const undo = [];
    let source = "draw";

    const changed = (reason) => opts.onChange && opts.onChange(reason);
    const snapshot = () => { undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height)); if (undo.length > 20) undo.shift(); };

    function drawSample(name) {
      ctx.save(); ctx.clearRect(0, 0, S, S); SAMPLES[name](ctx); ctx.restore();
    }
    function blank() { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, S, S); }

    // tabs
    root.querySelectorAll(".src-tabs button").forEach((b) =>
      b.addEventListener("click", () => {
        root.querySelectorAll(".src-tabs button").forEach((x) => x.classList.toggle("on", x === b));
        root.querySelectorAll(".src-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== b.dataset.tab));
        if (b.dataset.tab !== "cam") stopCam();
        source = b.dataset.tab;
      })
    );

    // drawing
    root.querySelectorAll(".sw").forEach((b) =>
      b.addEventListener("click", () => { root.querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x === b)); color = b.dataset.c; })
    );
    root.querySelectorAll(".brush button").forEach((b) =>
      b.addEventListener("click", () => { root.querySelectorAll(".brush button").forEach((x) => x.classList.toggle("on", x === b)); size = +b.dataset.s; })
    );
    root.querySelector('[data-act="fill"]').addEventListener("click", (e) => { fillMode = !fillMode; e.currentTarget.classList.toggle("on", fillMode); });
    root.querySelector('[data-act="undo"]').addEventListener("click", () => { const u = undo.pop(); if (u) { ctx.putImageData(u, 0, 0); changed("draw"); } });
    root.querySelector('[data-act="clear"]').addEventListener("click", () => { snapshot(); blank(); changed("clear"); });

    function stroke(p) {
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    }
    canvas.addEventListener("pointerdown", (e) => {
      if (stream) return;
      if (source !== "draw") root.querySelector('.src-tabs [data-tab="draw"]').click();
      const p = ML.canvasPoint(canvas, e, S, S);
      snapshot();
      if (fillMode) { ctx.fillStyle = color; ctx.fillRect(0, 0, S, S); changed("draw"); return; }
      drawing = true; last = p; canvas.setPointerCapture(e.pointerId);
      stroke({ x: p.x + 0.1, y: p.y });
    });
    canvas.addEventListener("pointermove", (e) => { if (drawing) stroke(ML.canvasPoint(canvas, e, S, S)); });
    const end = () => { if (drawing) { drawing = false; changed("draw"); } };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    // samples
    const grid = root.querySelector(".sample-grid");
    Object.keys(SAMPLES).forEach((name) => {
      const b = document.createElement("button");
      b.className = "sample";
      b.title = SAMPLE_NAMES[name];
      const c = document.createElement("canvas");
      const { ctx: sc } = ML.setupCanvas(c, 72, 72);
      sc.scale(72 / S, 72 / S); SAMPLES[name](sc);
      b.appendChild(c);
      const t = document.createElement("span"); t.textContent = SAMPLE_NAMES[name]; b.appendChild(t);
      b.addEventListener("click", () => { snapshot(); drawSample(name); changed("sample:" + name); });
      grid.appendChild(b);
    });

    // upload
    root.querySelector('input[type="file"]').addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => { snapshot(); cover(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(img.src); changed("upload"); };
      img.onerror = () => ML.toast("Hmm, I couldn't open that picture.");
      img.src = URL.createObjectURL(f);
    });
    function cover(src, w, h, mirror) {
      const s = Math.max(S / w, S / h), dw = w * s, dh = h * s;
      ctx.save();
      if (mirror) { ctx.translate(S, 0); ctx.scale(-1, 1); }
      ctx.drawImage(src, (S - dw) / 2, (S - dh) / 2, dw, dh);
      ctx.restore();
    }

    // camera
    const camStart = root.querySelector('[data-act="cam-start"]');
    const snapBtn = root.querySelector('[data-act="snap"]');
    const liveToggle = root.querySelector(".live-toggle");
    const liveBox = root.querySelector("input.live");
    let liveTimer = 0;
    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      } catch (err) {
        ML.toast("No camera available. Try Draw or Pictures!");
        stream = null;
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      camStart.innerHTML = `${ML.icon("x")} Turn off`;
      snapBtn.classList.remove("hidden");
      if (liveToggle) liveToggle.classList.remove("hidden");
      const loop = () => {
        if (!stream) return;
        if (video.videoWidth) cover(video, video.videoWidth, video.videoHeight, true);
        camLoop = requestAnimationFrame(loop);
      };
      loop();
      changed("camera-on");
    }
    function stopCam() {
      if (!stream) return;
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      cancelAnimationFrame(camLoop);
      clearInterval(liveTimer);
      if (liveBox) liveBox.checked = false;
      camStart.innerHTML = `${ML.icon("camera")} Turn on camera`;
      snapBtn.classList.add("hidden");
      if (liveToggle) liveToggle.classList.add("hidden");
    }
    camStart.addEventListener("click", () => (stream ? stopCam() : startCam()));
    // Snap freezes the frame (turns the camera off) and hands the picture over.
    snapBtn.addEventListener("click", () => { snapshot(); cancelAnimationFrame(camLoop); const keep = ctx.getImageData(0, 0, canvas.width, canvas.height); stopCam(); ctx.putImageData(keep, 0, 0); changed("snap"); });
    if (liveBox) liveBox.addEventListener("change", () => {
      clearInterval(liveTimer);
      if (liveBox.checked) liveTimer = setInterval(() => stream && changed("live"), 1500);
    });

    drawSample(opts.start || "cat");

    return {
      canvas,
      ctx,
      size: S,
      overlay: root.querySelector(".pic-overlay"),
      thumb(w = 96) {
        const c = document.createElement("canvas");
        c.width = c.height = w;
        c.getContext("2d").drawImage(canvas, 0, 0, w, w);
        return c;
      },
      setSample: drawSample,
      isLive: () => !!(stream && liveBox && liveBox.checked),
    };
  }

  // ---------- number strip ----------
  // Positive numbers in one colour, negative in another; brightness = size.
  function barcode(ctx, vec, x, y, w, h, opts = {}) {
    const n = vec.length;
    const pos = opts.pos || ML.cssVar("--accent"), neg = opts.neg || ML.cssVar("--rl");
    let max = opts.max || 0;
    if (!max) for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(vec[i]));
    max = max || 1;
    ctx.fillStyle = opts.bg || ML.cssVar("--bg-2");
    ctx.fillRect(x, y, w, h);
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = vec[i] / max;
      if (Math.abs(v) < 0.04) continue;
      ctx.globalAlpha = Math.min(1, Math.abs(v) * 1.25);
      ctx.fillStyle = v > 0 ? pos : neg;
      ctx.fillRect(x + i * bw, y, Math.max(bw, 0.8), h);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- download progress UI ----------
  function loaderUI(host) {
    const bar = host.querySelector(".dl-bar > span");
    const txt = host.querySelector(".dl-txt");
    return {
      set(frac, bytes) {
        host.classList.add("loading");
        if (frac == null) { bar.style.width = "35%"; bar.classList.add("indet"); }
        else { bar.classList.remove("indet"); bar.style.width = (frac * 100).toFixed(1) + "%"; }
        txt.textContent = `${(bytes / 1e6).toFixed(0)} MB downloaded${frac != null ? ` · ${Math.round(frac * 100)}%` : ""}`;
      },
      busy(msg) { host.classList.add("loading"); bar.classList.add("indet"); bar.style.width = "35%"; txt.textContent = msg; },
      done(msg) { host.classList.remove("loading"); host.classList.add("ready"); bar.classList.remove("indet"); bar.style.width = "100%"; txt.textContent = msg; },
      fail(msg) { host.classList.remove("loading"); bar.classList.remove("indet"); bar.style.width = "0"; txt.textContent = msg; },
    };
  }

  function softmax(xs, scale = 1) {
    const m = Math.max(...xs.map((x) => x * scale));
    const e = xs.map((x) => Math.exp(x * scale - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / s);
  }

  function normalize(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    s = Math.sqrt(s) || 1;
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / s;
    return out;
  }

  return { lib, tracker, toRaw, ImageSource, barcode, loaderUI, softmax, normalize, SAMPLES, SAMPLE_NAMES };
})();
