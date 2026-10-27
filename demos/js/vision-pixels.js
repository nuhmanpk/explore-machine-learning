// Robot Eyes: pixels as numbers, convolution "glasses", and a sliding-window explainer.
(() => {
  const { $, $$ } = ML;
  const W = 480, H = 360;   // the picture
  const RW = 160, RH = 120; // "robot pixels" the lens looks at (1 robot pixel = 3×3 picture pixels)
  const PW = 240, PH = 180; // size the glasses work at
  const LN = 8;             // lens shows LN×LN robot pixels
  const BLOCKS = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 24, 30, 40, 60];

  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d", { willReadFrequently: true })]; };
  const [src, sctx] = mk(W, H);
  const [small, smctx] = mk(RW, RH);
  const [proc, pctx] = mk(PW, PH);
  const [tmp, tctx] = mk(W, H);

  const view = ML.setupCanvas($("#view"), W, H);
  const lens = ML.setupCanvas($("#lens"), 320, 320);
  const raw = (id) => { const c = $(id); c.width = PW; c.height = PH; return c.getContext("2d"); };
  const octx = raw("#orig"), fctx = raw("#filt"), vctx = raw("#st-v"), hctx = raw("#st-h"), cctx = raw("#st-c");

  const state = { lx: 51, ly: 59, block: 1, lensMode: "color", kernel: "edges", stacked: false, source: "house", dirty: true, dragging: false };
  const video = $("#video");
  let stream = null;

  // ---------- little vector doodles (no emoji glyphs in pictures) ----------
  function drawCat(c, x, y, r) {
    c.save(); c.fillStyle = "#ffb347"; c.strokeStyle = "#1f2140"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x - r * 0.9, y - r * 0.3); c.lineTo(x - r * 0.75, y - r * 1.25); c.lineTo(x - r * 0.2, y - r * 0.8);
    c.lineTo(x + r * 0.2, y - r * 0.8); c.lineTo(x + r * 0.75, y - r * 1.25); c.lineTo(x + r * 0.9, y - r * 0.3); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = "#1f2140";
    c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.1, r * 0.11, r * 0.17, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + r * 0.38, y - r * 0.1, r * 0.11, r * 0.17, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ff7aa2"; c.beginPath(); c.moveTo(x - r * 0.1, y + r * 0.15); c.lineTo(x + r * 0.1, y + r * 0.15); c.lineTo(x, y + r * 0.28); c.closePath(); c.fill();
    c.lineWidth = 2; c.beginPath();
    [[-1, -0.05], [-1, 0.15], [1, -0.05], [1, 0.15]].forEach(([sx, dy]) => { c.moveTo(x + sx * r * 0.3, y + r * 0.25); c.lineTo(x + sx * r * 1.05, y + r * (0.25 + dy)); });
    c.stroke(); c.restore();
  }
  function drawHeart(c, x, y, r, col) {
    c.save(); c.fillStyle = col; c.beginPath(); c.moveTo(x, y + r * 0.9);
    c.bezierCurveTo(x - r * 1.4, y, x - r * 0.8, y - r * 1.1, x, y - r * 0.4);
    c.bezierCurveTo(x + r * 0.8, y - r * 1.1, x + r * 1.4, y, x, y + r * 0.9); c.fill(); c.restore();
  }
  function drawStar(c, x, y, r, col) {
    c.save(); c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill(); c.restore();
  }
  function drawRainbow(c, x, y, r) {
    c.save(); c.lineWidth = 7;
    ["#ff4d5e", "#ffb020", "#ffe14d", "#2fbf62", "#2f9bff", "#7c5cff"].forEach((col, i) => { c.strokeStyle = col; c.beginPath(); c.arc(x, y, r - i * 7, Math.PI, 0); c.stroke(); });
    c.restore();
  }
  function drawBalloon(c, x, y, r, col) {
    c.save(); c.strokeStyle = "#1f2140"; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + r * 1.2); c.quadraticCurveTo(x + 8, y + r * 1.8, x, y + r * 2.4); c.stroke();
    c.fillStyle = col; c.beginPath(); c.ellipse(x, y, r * 0.85, r * 1.1, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255,255,255,.5)"; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.4, r * 0.18, r * 0.3, -0.4, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function drawMagnifier(c, x, y, r, col) {
    c.save(); c.strokeStyle = col; c.lineWidth = 4; c.lineCap = "round";
    c.fillStyle = "rgba(255,255,255,.7)"; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + r * 0.7, y + r * 0.7); c.lineTo(x + r * 1.6, y + r * 1.6); c.stroke(); c.restore();
  }

  // ---------- built-in pictures ----------
  function drawHouse(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#7cc6ff"); g.addColorStop(1, "#d8f0ff");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = "#ffd23f"; c.beginPath(); c.arc(400, 70, 38, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#ffd23f"; c.lineWidth = 6;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.moveTo(400 + Math.cos(a) * 48, 70 + Math.sin(a) * 48); c.lineTo(400 + Math.cos(a) * 64, 70 + Math.sin(a) * 64); c.stroke(); }
    c.fillStyle = "#fff"; [[90, 60, 26], [120, 52, 32], [150, 62, 24]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = "#5cc96b"; c.fillRect(0, 270, W, 90);
    c.fillStyle = "#ff6b6b"; c.fillRect(150, 170, 160, 120);
    c.fillStyle = "#7a3b2e"; c.beginPath(); c.moveTo(135, 172); c.lineTo(230, 100); c.lineTo(325, 172); c.closePath(); c.fill();
    c.fillStyle = "#8a5a2b"; c.fillRect(212, 220, 36, 70);
    c.fillStyle = "#ffe08a"; c.fillRect(166, 190, 34, 34); c.fillRect(262, 190, 34, 34);
    c.strokeStyle = "#7a3b2e"; c.lineWidth = 4;
    [[166, 190], [262, 190]].forEach(([x, y]) => { c.strokeRect(x, y, 34, 34); c.beginPath(); c.moveTo(x + 17, y); c.lineTo(x + 17, y + 34); c.moveTo(x, y + 17); c.lineTo(x + 34, y + 17); c.stroke(); });
    c.fillStyle = "#8a5a2b"; c.fillRect(380, 200, 18, 80);
    c.fillStyle = "#2e9b4f"; [[389, 185, 40], [365, 205, 28], [413, 205, 28]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
    drawCat(c, 80, 282, 30);
    c.fillStyle = "#ff5c9a"; [[330, 310], [350, 322], [300, 325]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); });
  }
  function drawSmiley(c) {
    c.fillStyle = "#b8e1ff"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#ffd23f"; c.strokeStyle = "#1f2140"; c.lineWidth = 8;
    c.beginPath(); c.arc(240, 180, 130, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = "#1f2140";
    c.beginPath(); c.ellipse(195, 145, 16, 24, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(285, 145, 16, 24, 0, 0, Math.PI * 2); c.fill();
    c.lineWidth = 10; c.lineCap = "round"; c.beginPath(); c.arc(240, 190, 70, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.fillStyle = "#ff8fb1"; c.beginPath(); c.arc(165, 205, 18, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(315, 205, 18, 0, Math.PI * 2); c.fill();
    drawHeart(c, 60, 62, 22, "#ff4d6d"); drawStar(c, 420, 70, 24, "#ffb020"); drawRainbow(c, 70, 318, 40); drawBalloon(c, 420, 290, 22, "#7c5cff");
  }
  function drawLetter(c) {
    c.fillStyle = "#14152b"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#ffffff"; c.font = "700 300px Fredoka, Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("A", 240, 196);
    const cols = ["#ff4d5e", "#2fbf62", "#2f7bff", "#ffd23f"];
    cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(24 + i * 40, 24, 30, 30); c.fillRect(W - 54 - i * 40, H - 54, 30, 30); });
  }
  const SCENES = { house: drawHouse, smiley: drawSmiley, letter: drawLetter };

  function drawCover(img, iw, ih, mirror) {
    const s = Math.max(W / iw, H / ih), dw = iw * s, dh = ih * s;
    sctx.save();
    if (mirror) { sctx.translate(W, 0); sctx.scale(-1, 1); }
    sctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    sctx.restore();
  }

  function setSource(name) {
    state.source = name;
    $$("[data-src]").forEach((b) => b.classList.toggle("on", b.dataset.src === name));
    $("#cam-btn").classList.toggle("on", name === "cam");
    $("#upload-btn").classList.toggle("on", name === "upload");
    if (name !== "cam") stopCam();
    if (SCENES[name]) { SCENES[name](sctx); state.dirty = true; }
  }

  // ---------- camera / upload ----------
  async function startCam() {
    if (stream) { setSource("house"); ML.say("Camera off. Back to my drawing!"); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      video.srcObject = stream; await video.play();
      state.source = "cam";
      $$("[data-src]").forEach((b) => b.classList.remove("on"));
      $("#upload-btn").classList.remove("on");
      $("#cam-btn").classList.add("on"); $("#cam-btn").innerHTML = `${ML.icon("x")} Stop cam`;
      ML.say("Hello, <b>you</b>! 👋 Now I'm turning you into numbers — about <b>30 times every second</b>!");
    } catch (e) {
      ML.toast("No camera allowed — try Upload instead!");
      ML.say("Oops, I can't use the camera. You can <b>upload a photo</b> instead!");
    }
  }
  function stopCam() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    $("#cam-btn").innerHTML = `${ML.icon("camera")} Camera`;
  }
  $("#cam-btn").addEventListener("click", startCam);
  $("#upload-btn").addEventListener("click", () => $("#file").click());
  $("#file").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      stopCam(); state.source = "upload";
      $$("[data-src]").forEach((b) => b.classList.remove("on")); $("#upload-btn").classList.add("on");
      sctx.fillStyle = "#000"; sctx.fillRect(0, 0, W, H);
      drawCover(img, img.naturalWidth, img.naturalHeight, false);
      URL.revokeObjectURL(img.src); state.dirty = true;
      ML.say("Nice picture! To me it's <b>518,400 numbers</b>. Drag the lens to see some!");
    };
    img.src = URL.createObjectURL(f);
    e.target.value = "";
  });
  $$("[data-src]").forEach((b) => b.addEventListener("click", () => {
    setSource(b.dataset.src);
    ML.say({ house: "A little house! Lots of straight edges for my glasses to find.", smiley: "A smiley! Round edges this time.", letter: "The letter A — white on black. Super easy edges!" }[b.dataset.src]);
  }));

  // ---------- color naming for Robo ----------
  const { colorName } = PixelsCore;

  // ---------- Part 1 rendering ----------
  let smallData = null;
  function renderPart1() {
    const ink = ML.cssVar("--ink"), accent = ML.cssVar("--accent");
    smctx.imageSmoothingEnabled = true; smctx.imageSmoothingQuality = "high";
    smctx.drawImage(src, 0, 0, RW, RH);
    smallData = smctx.getImageData(0, 0, RW, RH).data;

    const c = view.ctx, L = state.block;
    c.clearRect(0, 0, W, H);
    if (L === 1) c.drawImage(src, 0, 0, W, H);
    else {
      const bw = W / L, bh = H / L;
      tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = "high";
      tctx.drawImage(src, 0, 0, bw, bh);
      c.imageSmoothingEnabled = false;
      c.drawImage(tmp, 0, 0, bw, bh, 0, 0, W, H);
      c.imageSmoothingEnabled = true;
      if (L >= 24) {
        const d = tctx.getImageData(0, 0, bw, bh).data;
        c.textAlign = "center"; c.textBaseline = "middle";
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          const i = (y * bw + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          c.fillStyle = lum > 140 ? "rgba(0,0,0,.8)" : "rgba(255,255,255,.9)";
          const cx = x * L + L / 2, cy = y * L + L / 2;
          if (L >= 40) {
            c.font = `800 ${Math.min(13, L / 4)}px Nunito, sans-serif`;
            c.fillText(r, cx, cy - L * 0.25); c.fillText(g, cx, cy); c.fillText(b, cx, cy + L * 0.25);
          } else {
            c.font = `800 ${L >= 30 ? 10 : 8}px Nunito, sans-serif`;
            c.fillText(Math.round(lum), cx, cy);
          }
        }
      } else if (L >= 6) {
        c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 1; c.beginPath();
        for (let x = 0; x <= W; x += L) { c.moveTo(x, 0); c.lineTo(x, H); }
        for (let y = 0; y <= H; y += L) { c.moveTo(0, y); c.lineTo(W, y); }
        c.stroke();
      }
    }
    // lens square
    const sx = W / RW, x = state.lx * sx, y = state.ly * sx, s = LN * sx;
    c.lineWidth = 5; c.strokeStyle = "#fff"; c.strokeRect(x - 2, y - 2, s + 4, s + 4);
    c.lineWidth = 3; c.strokeStyle = accent; c.strokeRect(x - 2, y - 2, s + 4, s + 4);
    c.fillStyle = accent; c.beginPath(); c.arc(x + s + 2, y + s + 2, 7, 0, Math.PI * 2); c.fill();
    drawMagnifier(c, x + s + 16, y - 14, 9, accent);

    // lens panel
    const lc = lens.ctx, cell = 320 / LN;
    lc.clearRect(0, 0, 320, 320);
    for (let j = 0; j < LN; j++) for (let i = 0; i < LN; i++) {
      const px = state.lx + i, py = state.ly + j, k = (py * RW + px) * 4;
      const r = smallData[k], g = smallData[k + 1], b = smallData[k + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      const X = i * cell, Y = j * cell;
      lc.textAlign = "center"; lc.textBaseline = "middle";
      if (state.lensMode === "color") {
        lc.fillStyle = `rgb(${r},${g},${b})`; lc.fillRect(X, Y, cell, cell);
        lc.fillStyle = lum > 140 ? "rgba(0,0,0,.75)" : "rgba(255,255,255,.9)";
        lc.font = "800 10px Nunito, sans-serif";
        lc.fillText(r, X + cell / 2, Y + cell * 0.25); lc.fillText(g, X + cell / 2, Y + cell * 0.5); lc.fillText(b, X + cell / 2, Y + cell * 0.75);
      } else if (state.lensMode === "num") {
        lc.font = "800 10px Nunito, sans-serif";
        lc.fillStyle = "#e5484d"; lc.fillText(r, X + cell / 2, Y + cell * 0.25);
        lc.fillStyle = "#2fbf62"; lc.fillText(g, X + cell / 2, Y + cell * 0.5);
        lc.fillStyle = "#2f7bff"; lc.fillText(b, X + cell / 2, Y + cell * 0.75);
      } else {
        lc.fillStyle = `rgb(${lum},${lum},${lum})`; lc.fillRect(X, Y, cell, cell);
        lc.fillStyle = lum > 140 ? "#000" : "#fff"; lc.font = "800 12px Nunito, sans-serif";
        lc.fillText(lum, X + cell / 2, Y + cell / 2);
      }
    }
    lc.strokeStyle = ML.cssVar("--line"); lc.lineWidth = 1; lc.beginPath();
    for (let i = 0; i <= LN; i++) { lc.moveTo(i * cell, 0); lc.lineTo(i * cell, 320); lc.moveTo(0, i * cell); lc.lineTo(320, i * cell); }
    lc.stroke();
    lc.strokeStyle = ink; lc.lineWidth = 3; lc.strokeRect(1.5, 1.5, 317, 317);
  }

  function centerPixel() {
    const px = state.lx + LN / 2, py = state.ly + LN / 2, k = (py * RW + px) * 4;
    return [smallData[k], smallData[k + 1], smallData[k + 2]];
  }

  // lens dragging
  const viewEl = $("#view");
  function moveLens(e) {
    const p = ML.canvasPoint(viewEl, e, W, H);
    state.lx = ML.clamp(Math.round(p.x / (W / RW) - LN / 2), 0, RW - LN);
    state.ly = ML.clamp(Math.round(p.y / (H / RH) - LN / 2), 0, RH - LN);
    state.dirty = true;
  }
  viewEl.addEventListener("pointerdown", (e) => { state.dragging = true; viewEl.setPointerCapture(e.pointerId); moveLens(e); });
  viewEl.addEventListener("pointermove", (e) => { if (state.dragging) moveLens(e); });
  const endDrag = () => {
    if (!state.dragging) return;
    state.dragging = false;
    if (!smallData) return;
    const [r, g, b] = centerPixel();
    ML.say(`The middle pixel says: Red <b style="color:#e5484d">${r}</b>, Green <b style="color:#2fbf62">${g}</b>, Blue <b style="color:#2f7bff">${b}</b>. Mix those lights and you get <b>${colorName(r, g, b)}</b>!`);
  };
  viewEl.addEventListener("pointerup", endDrag);
  viewEl.addEventListener("pointercancel", endDrag);

  $$("#lens-mode button").forEach((b) => b.addEventListener("click", () => {
    $$("#lens-mode button").forEach((x) => x.classList.toggle("on", x === b));
    state.lensMode = b.dataset.m; state.dirty = true;
    ML.say({ color: "Colors: what <b>you</b> see.", num: "Numbers: what <b>I</b> see! Every pixel is just 3 numbers from 0 to 255.", gray: "Gray: one number per pixel. 0 is black, 255 is white. Many robot eyes start like this!" }[b.dataset.m]);
  }));

  const pxCount = W * H;
  $("#st-px").textContent = pxCount.toLocaleString();
  $("#st-num").textContent = (pxCount * 3).toLocaleString();
  let lastBlockSay = -1;
  ML.bindRange("#block", (v) => (BLOCKS[v] === 1 ? "photo" : `${BLOCKS[v]}px blocks`), (v) => {
    state.block = BLOCKS[v]; state.dirty = true;
    const bucket = state.block === 1 ? 0 : state.block < 24 ? 1 : 2;
    if (bucket !== lastBlockSay && lastBlockSay !== -1) {
      ML.say(["Smooth photo again. But it's still tiny squares — just very small ones!",
        "See the blocks? Each block is <b>one color</b>. Fewer blocks = less detail.",
        "Now you see what I see: <b>just numbers</b>! (This shows brightness, 0 = dark, 255 = bright.)"][bucket]);
    }
    lastBlockSay = bucket;
    const n = (W / state.block) * (H / state.block);
    $("#st-px").textContent = n.toLocaleString();
    $("#st-num").textContent = (n * 3).toLocaleString();
  });

  // ---------- Part 2: glasses (convolution) ----------
  const { KERNELS } = PixelsCore;
  let custom = { name: "My glasses", icon: "flask", k: KERNELS.edges.k.slice(), div: 1 };

  const kb = $("#k-btns");
  kb.innerHTML = Object.entries(KERNELS).map(([id, k]) => `<button class="btn small" data-k="${id}">${ML.icon(k.icon)} ${k.name}</button>`).join("");
  const kgrid = $("#kgrid");
  kgrid.innerHTML = Array.from({ length: 9 }, (_, i) => `<input type="number" step="1" data-i="${i}" aria-label="recipe number ${i + 1}">`).join("");
  const kInputs = $$("input", kgrid);

  function currentKernel() { return state.kernel === "custom" ? custom : KERNELS[state.kernel]; }
  function showKernel() {
    const K = currentKernel();
    kInputs.forEach((inp, i) => { inp.value = K.k[i]; inp.className = K.k[i] > 0 ? "pos" : K.k[i] < 0 ? "neg" : ""; });
    $("#kdiv").value = K.div;
    $$("[data-k]").forEach((b) => b.classList.toggle("on", b.dataset.k === state.kernel));
    $("#filt-cap").innerHTML = `${ML.icon(K.icon)} ${K.name}`;
  }
  function selectKernel(id, talk = true) {
    state.kernel = id; showKernel(); state.dirty = true;
    if (talk && KERNELS[id]) ML.say(KERNELS[id].say);
    conv.reset();
  }
  kb.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) selectKernel(b.dataset.k); });
  function readCustom() {
    custom = { name: "My glasses", icon: "flask", k: kInputs.map((i) => parseFloat(i.value) || 0), div: Math.max(1, parseFloat($("#kdiv").value) || 1) };
    state.kernel = "custom";
    kInputs.forEach((inp, i) => (inp.className = custom.k[i] > 0 ? "pos" : custom.k[i] < 0 ? "neg" : ""));
    $$("[data-k]").forEach((b) => b.classList.remove("on"));
    $("#filt-cap").innerHTML = `${ML.icon("flask")} My glasses`;
    const sum = custom.k.reduce((a, b) => a + b, 0);
    ML.say(Math.abs(sum) < 1e-9
      ? "Your numbers add up to <b>0</b>, so flat areas go dark and only <b>changes</b> (edges) glow. That's an edge finder!"
      : `Your numbers add up to <b>${+(sum / custom.div).toFixed(2)}</b>. ${sum / custom.div > 1.2 ? "More than 1 makes it brighter!" : sum / custom.div < 0.8 ? "Less than 1 makes it darker" : "About 1 keeps the brightness the same."}`);
    state.dirty = true; conv.reset();
  }
  kInputs.forEach((i) => i.addEventListener("input", readCustom));
  $("#kdiv").addEventListener("input", readCustom);

  const { lumOf, conv1, SX, SY } = PixelsCore;

  function applyGlasses(img) {
    const K = currentKernel(), w = PW, h = PH;
    const out = new ImageData(w, h);
    out.data.set(PixelsCore.applyGlassesData(img.data, w, h, K));
    return out;
  }

  function renderStack(img) {
    const w = PW, h = PH, n = w * h;
    const g = lumOf(img.data, n);
    const ax = conv1(g, w, h, SX).map(Math.abs), ay = conv1(g, w, h, SY).map(Math.abs);
    const B = [1, 2, 1, 2, 4, 2, 1, 2, 1].map((v) => v / 16);
    let bx = conv1(ax, w, h, B), by = conv1(ay, w, h, B);
    bx = conv1(bx, w, h, B); by = conv1(by, w, h, B);
    const cor = new Float32Array(n); let mx = 1;
    for (let i = 0; i < n; i++) { cor[i] = Math.sqrt(bx[i] * by[i]); if (cor[i] > mx) mx = cor[i]; }
    const paint = (ctx, buf, rgb, scale) => {
      const im = new ImageData(w, h), o = im.data;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const t = Math.min(1, buf[i] * scale);
        o[j] = rgb[0] * t; o[j + 1] = rgb[1] * t; o[j + 2] = rgb[2] * t; o[j + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
    };
    paint(vctx, ax, [80, 170, 255], 1 / 255);
    paint(hctx, ay, [255, 150, 70], 1 / 255);
    paint(cctx, cor, [255, 92, 154], 1.6 / mx);
  }

  function renderPart2() {
    pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = "high";
    pctx.drawImage(src, 0, 0, PW, PH);
    const img = pctx.getImageData(0, 0, PW, PH);
    octx.putImageData(img, 0, 0);
    fctx.putImageData(applyGlasses(img), 0, 0);
    if (state.stacked) renderStack(img);
  }

  $("#stack-btn").addEventListener("click", () => {
    state.stacked = !state.stacked;
    $("#stack").classList.toggle("hidden", !state.stacked);
    $("#stack-btn").classList.toggle("on", state.stacked);
    state.dirty = true;
    if (state.stacked) ML.say("Stacked! Layer 1 finds <b>up-down</b> lines and <b>side</b> lines. Layer 2 looks for spots that have <b>both</b> — those are corners! Real robot brains stack 50+ layers.");
  });

  // ---------- Part 3: sliding window explainer ----------
  const conv = (() => {
    const N = 8, M = N - 2;
    const cin = $("#cin"), cout = $("#cout"), prod = $("#prod"), sumEl = $("#sum");
    cin.style.gridTemplateColumns = `repeat(${N}, auto)`;
    cout.style.gridTemplateColumns = `repeat(${M}, auto)`;
    cin.innerHTML = Array.from({ length: N * N }, () => "<div></div>").join("");
    cout.innerHTML = Array.from({ length: M * M }, (_, i) => `<div data-i="${i}"></div>`).join("");
    const inCells = $$("div", cin), outCells = $$("div", cout);
    let grid = defaultGrid(), pos = -1, outs = new Array(M * M).fill(null), timer = null, speed = 4;

    function defaultGrid() {
      const g = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g.push(x >= 3 && x <= 6 && y >= 2 && y <= 5 ? 220 : 20);
      return g;
    }
    function kernelForMath() {
      const K = currentKernel();
      return { k: K.k, div: K.div, name: K.sobel ? "Up-down line finder (half of 'All edges')" : K.name };
    }
    function paintInput() {
      inCells.forEach((c, i) => {
        const v = grid[i];
        c.textContent = v; c.style.background = `rgb(${v},${v},${v})`; c.style.color = v > 130 ? "#000" : "#fff";
        c.classList.remove("win");
      });
    }
    function paintOut() {
      const { div } = kernelForMath();
      const mx = Math.max(1, ...outs.filter((v) => v !== null).map(Math.abs));
      outCells.forEach((c, i) => {
        const v = outs[i];
        c.classList.toggle("cur", i === pos);
        if (v === null) { c.textContent = ""; c.style.background = ""; c.style.color = ""; return; }
        const t = Math.min(1, Math.abs(v) / Math.max(mx, 255 / div));
        const lv = Math.round(t * 255);
        c.style.background = `rgb(${lv},${lv},${lv})`; c.style.color = lv > 130 ? "#000" : "#fff";
        c.textContent = Math.round(v);
      });
    }
    function show(p) {
      pos = p;
      const { k, div, name } = kernelForMath();
      const ox = p % M, oy = Math.floor(p / M);
      inCells.forEach((c) => c.classList.remove("win"));
      let s = 0, html = "";
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const idx = (oy + j) * N + (ox + i), v = grid[idx], kv = k[j * 3 + i];
        inCells[idx].classList.add("win");
        s += v * kv;
        html += `<span>${v}×<b>${kv}</b> = ${v * kv}</span>`;
      }
      s /= div;
      outs[p] = s;
      prod.innerHTML = html;
      sumEl.innerHTML = `add up${div !== 1 ? ` ÷ ${div}` : ""} = <span class="big">${Math.round(s)}</span>`;
      $("#kname").textContent = name;
      paintOut();
      return s;
    }
    function step() {
      const s = show((pos + 1) % (M * M));
      if (pos === M * M - 1) { pause(); ML.say("Done! Every spot got a new number. Bright squares = <b>the glasses found something</b> there."); }
      else if (Math.abs(s) > 150) ML.say(`Big number: <b>${Math.round(s)}</b>! The numbers changed a lot here, so I found an <b>edge</b>!`);
      else if (pos % 6 === 0) ML.say("Multiply each pair, add them up… small number means <b>nothing special</b> here.");
    }
    function play() {
      if (timer) { pause(); return; }
      if (pos === M * M - 1) reset(false);
      $("#c-play").innerHTML = `${ML.icon("pause")} Pause`;
      const tick = () => { step(); if (timer) timer = setTimeout(tick, 1100 - speed * 100); };
      timer = setTimeout(tick, 50);
    }
    function pause() { clearTimeout(timer); timer = null; $("#c-play").innerHTML = `${ML.icon("play")} Play`; }
    function reset(stop = true) {
      if (stop) pause();
      pos = -1; outs = new Array(M * M).fill(null);
      paintInput(); paintOut();
      prod.innerHTML = Array.from({ length: 9 }, () => "<span>?</span>").join("");
      sumEl.innerHTML = "press Play";
      $("#kname").textContent = kernelForMath().name;
    }
    function useLens() {
      if (!smallData) return;
      const g = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const k = ((state.ly + y) * RW + state.lx + x) * 4;
        g.push(Math.round(0.299 * smallData[k] + 0.587 * smallData[k + 1] + 0.114 * smallData[k + 2]));
      }
      grid = g; reset();
      ML.say("I copied the gray numbers from your lens spot. Press Play and watch the glasses slide over <b>your</b> pixels!");
    }
    cout.addEventListener("click", (e) => { const c = e.target.closest("[data-i]"); if (c) { pause(); show(+c.dataset.i); } });
    $("#c-play").addEventListener("click", play);
    $("#c-step").addEventListener("click", () => { pause(); step(); });
    $("#c-reset").addEventListener("click", () => { grid = defaultGrid(); reset(); });
    $("#c-lens").addEventListener("click", useLens);
    ML.bindRange("#c-speed", (v) => v, (v) => (speed = v));
    reset();
    return { reset: () => reset() };
  })();

  // ---------- main loop ----------
  function loop() {
    if (state.source === "cam" && stream && video.readyState >= 2) {
      drawCover(video, video.videoWidth, video.videoHeight, true);
      state.dirty = true;
    }
    if (state.dirty) { state.dirty = false; renderPart1(); renderPart2(); }
    requestAnimationFrame(loop);
  }
  document.addEventListener("themechange", () => (state.dirty = true));
  setSource("house");
  showKernel();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (state.source === "letter") setSource("letter"); state.dirty = true; });
  requestAnimationFrame(loop);
})();
