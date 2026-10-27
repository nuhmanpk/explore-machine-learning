// Teach the Ear — live spectrogram, onset-aligned sound clips and a KNN classifier.
(function () {
  const core = window.EarCore;
  const { BANDS, CLIP, SLICES } = core;
  const COLORS = ["--audio", "--rl", "--nn", "--vision"];
  const SW = 660, SH = 200;
  const spec = ML.setupCanvas(document.getElementById("spec"), SW, SH);
  const AW = 660, AH = 90;
  const accC = ML.setupCanvas(document.getElementById("acc"), AW, AH);
  const inNow = ML.setupCanvas(document.getElementById("in-now"), 120, 80);
  const inNear = ML.setupCanvas(document.getElementById("in-near"), 120, 80);

  const S = {
    classes: [],
    armed: -1,
    capture: null, // frames being collected
    floor: 0.02,
    accHist: [], // {n, acc}
    ckptAt: [2, 4, 6, 9, 12, 16, 20, 30],
    quick: false,
  };

  // ---------- audio graph ----------
  let actx, analyser, freq, bandIdx;
  function audio() {
    if (actx) { if (actx.state === "suspended") actx.resume(); return actx; }
    actx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    freq = new Uint8Array(analyser.frequencyBinCount);
    bandIdx = core.bandEdges(actx.sampleRate, analyser.fftSize);
    return actx;
  }

  function bands() {
    analyser.getByteFrequencyData(freq);
    return core.bandsFromFreq(freq, bandIdx);
  }

  // ---------- built-in sounds ----------
  function synth(kind) {
    const a = audio(), t = a.currentTime + 0.02;
    const out = a.createGain();
    out.connect(analyser);
    out.connect(a.destination);
    const r = (x, y) => x + Math.random() * (y - x);
    if (kind === "whistle") {
      const o = a.createOscillator(); o.type = "sine";
      const f = r(1500, 2300);
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * r(1.05, 1.25), t + 0.5);
      const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = r(5, 8); lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency);
      env(out.gain, t, 0.25, r(0.45, 0.65));
      o.connect(out); o.start(t); lfo.start(t); o.stop(t + 0.8); lfo.stop(t + 0.8);
    } else if (kind === "clap") {
      const len = a.sampleRate * 0.3, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * r(0.03, 0.06)));
      const src = a.createBufferSource(); src.buffer = buf;
      const hp = a.createBiquadFilter(); hp.type = "bandpass"; hp.frequency.value = r(1200, 2500); hp.Q.value = 0.7;
      out.gain.value = 0.9;
      src.connect(hp); hp.connect(out); src.start(t);
    } else if (kind === "hum") {
      const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = r(110, 180);
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = r(500, 800);
      env(out.gain, t, 0.35, r(0.5, 0.7));
      o.connect(lp); lp.connect(out); o.start(t); o.stop(t + 0.8);
    } else if (kind === "beep") {
      const o = a.createOscillator(); o.type = "square"; o.frequency.value = r(700, 1000);
      out.gain.setValueAtTime(0, t);
      for (let k = 0; k < 3; k++) { out.gain.setValueAtTime(0.12, t + k * 0.18); out.gain.setValueAtTime(0, t + k * 0.18 + 0.1); }
      o.connect(out); o.start(t); o.stop(t + 0.6);
    }
  }
  function env(g, t, peak, len) {
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(peak, t + 0.03);
    g.setValueAtTime(peak, t + len - 0.08); g.linearRampToValueAtTime(0, t + len);
  }
  document.querySelectorAll("[data-synth]").forEach((b) => b.addEventListener("click", () => { audio(); synth(b.dataset.synth); }));

  // ---------- microphone ----------
  let micOn = false;
  document.getElementById("mic").addEventListener("click", async () => {
    audio();
    if (micOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      actx.createMediaStreamSource(stream).connect(analyser);
      micOn = true;
      document.getElementById("mic").innerHTML = `${ML.icon("check")} Microphone on`;
      ML.say(`I can hear you! Try whistling, clapping or humming. Watch your sound picture appear.`);
    } catch (e) {
      ML.toast("No microphone. The sound buttons still work!");
      ML.say(`I couldn't use the microphone, but the <b>sound buttons</b> work just as well.`);
    }
  });

  // ---------- classes ----------
  function addClass(name) {
    if (S.classes.length >= 4) return;
    S.classes.push({ name, examples: [], color: COLORS[S.classes.length] });
    renderClasses();
  }
  function renderClasses() {
    const host = document.getElementById("classes");
    host.innerHTML = S.classes.map((c, i) => `
      <div class="cls ${S.armed === i ? "armed" : ""}" data-i="${i}" style="--accent: var(${c.color})">
        <input type="text" value="${c.name}" aria-label="Name of sound ${i + 1}">
        <canvas class="cent"></canvas>
        <div class="thumbs"></div>
        <div class="meta"><span>${c.examples.length} example${c.examples.length === 1 ? "" : "s"}</span><span class="pp">–</span></div>
        <div class="pbar"><span></span></div>
        <button class="btn small ${S.armed === i ? "primary" : ""}" data-rec>${S.armed === i ? "Listening… make it!" : ML.icon("plus") + " Record"}</button>
      </div>`).join("");
    host.querySelectorAll(".cls").forEach((el) => {
      const i = +el.dataset.i, c = S.classes[i];
      el.querySelector("input").addEventListener("change", (e) => (c.name = e.target.value.trim() || c.name));
      el.querySelector("[data-rec]").addEventListener("click", () => {
        audio();
        S.armed = S.armed === i ? -1 : i;
        renderClasses();
        if (S.armed === i) ML.say(`I'm listening for a <b>${c.name}</b>. Make the sound now!`);
      });
      const cv = ML.setupCanvas(el.querySelector(".cent"), 120, 70);
      drawClip(cv.ctx, 120, 70, centroid(c), ML.cssVar(c.color));
      const th = el.querySelector(".thumbs");
      c.examples.slice(-12).forEach((ex) => {
        const t = document.createElement("canvas");
        th.appendChild(t);
        const tc = ML.setupCanvas(t, 26, 18);
        drawClip(tc.ctx, 26, 18, ex.img, ML.cssVar(c.color));
      });
    });
  }

  const centroid = core.centroid;
  // img is BANDS × SLICES, band-major columns (time → x, low → bottom)
  function drawClip(ctx, w, h, img, color) {
    ctx.clearRect(0, 0, w, h);
    if (!img) {
      ctx.fillStyle = ML.cssVar("--muted"); ctx.font = "700 10px Nunito, sans-serif"; ctx.textAlign = "center";
      if (w > 60) ctx.fillText("no examples yet", w / 2, h / 2 + 3);
      return;
    }
    const cw = w / SLICES, ch = h / BANDS;
    ctx.fillStyle = color;
    for (let s = 0; s < SLICES; s++)
      for (let b = 0; b < BANDS; b++) {
        const v = img[s * BANDS + b];
        if (v < 0.04) continue;
        ctx.globalAlpha = Math.min(1, v);
        ctx.fillRect(s * cw, h - (b + 1) * ch, cw + 0.5, ch + 0.5);
      }
    ctx.globalAlpha = 1;
  }

  const makeExample = core.makeExample;
  const knn = (vec, skip) => core.knn(S.classes, vec, skip);
  const quizScore = () => core.quizScore(S.classes);

  function totalExamples() { return S.classes.reduce((s, c) => s + c.examples.length, 0); }

  // ---------- capture finished ----------
  function onClip(frames) {
    const ex = makeExample(frames);
    if (S.armed >= 0) {
      const c = S.classes[S.armed];
      ex.n = c.examples.length + 1;
      c.examples.push(ex);
      const n = c.examples.length;
      if (!S.quick) S.armed = -1;
      renderClasses();
      const q = quizScore();
      const tot = totalExamples();
      if (q != null) S.accHist.push({ n: tot, acc: q });
      updateStats(q);
      maybeCheckpoint(tot, q);
      if (!S.quick) {
        ML.say(n === 1 ? `Got my first <b>${c.name}</b>! See its picture in the box? Record a couple more so I learn what's the same each time.`
          : `That's ${n} <b>${c.name}</b> examples. The big picture is their average: my memory of a ${c.name}.` + (q != null ? ` Quiz score: <b>${Math.round(q * 100)}%</b>.` : ""));
      }
      drawInside(ex, null);
      return;
    }
    // guessing
    if (S.classes.filter((c) => c.examples.length).length < 2) {
      if (S.classes.some((c) => c.examples.length)) ML.say(`Nice sound! Teach me at least <b>two</b> kinds of sound and then I can start guessing.`);
      return;
    }
    const r = knn(ex.vec);
    const best = r.probs.indexOf(Math.max(...r.probs));
    document.querySelectorAll(".cls").forEach((el, i) => {
      el.classList.toggle("win", i === best);
      el.querySelector(".pbar span").style.width = (r.probs[i] * 100).toFixed(0) + "%";
      el.querySelector(".pp").textContent = Math.round(r.probs[i] * 100) + "%";
    });
    const c = S.classes[best];
    ML.say(`I think that was a <b>${c.name}</b>! (${Math.round(r.probs[best] * 100)}% sure)`);
    drawInside(ex, r);
  }

  function drawInside(ex, r) {
    drawClip(inNow.ctx, 120, 80, ex.img, ML.cssVar("--accent"));
    if (!r) {
      drawClip(inNear.ctx, 120, 80, null);
      document.getElementById("inside").innerHTML = `I saved this sound's picture as a new memory. Make a sound without pressing Record and I'll compare it to my memories.`;
      return;
    }
    const top = r.near[0];
    drawClip(inNear.ctx, 120, 80, top.ex.img, ML.cssVar(S.classes[top.ci].color));
    const parts = r.near.map((n) => `<b>${S.classes[n.ci].name}</b> #${n.ex.n} (${Math.round(n.sim * 100)}% alike)`);
    const best = r.probs.indexOf(Math.max(...r.probs));
    const votes = r.near.filter((n) => n.ci === best).length;
    document.getElementById("inside").innerHTML =
      `This sound's picture is closest to ${parts.join(", ")}. ${votes} of my 3 closest memories are <b>${S.classes[best].name}</b>, so that's my guess.`;
  }

  // ---------- stats, chart, checkpoints ----------
  function updateStats(q = quizScore()) {
    document.getElementById("st-ex").textContent = totalExamples();
    document.getElementById("st-acc").innerHTML = q == null ? "–" : `${Math.round(q * 100)}<small>%</small>`;
    drawAcc();
  }
  function drawAcc() {
    const ctx = accC.ctx;
    ctx.clearRect(0, 0, AW, AH);
    const h = S.accHist;
    ctx.fillStyle = ML.cssVar("--muted"); ctx.font = "700 12px Nunito, sans-serif";
    if (h.length < 1) { ctx.textAlign = "center"; ctx.fillText("Appears once Robo has two kinds of sound", AW / 2, AH / 2 + 4); return; }
    const maxN = Math.max(10, h[h.length - 1].n);
    const X = (n) => 30 + (n / maxN) * (AW - 40), Y = (a) => AH - 14 - a * (AH - 26);
    ctx.textAlign = "left"; ctx.fillText("100%", 0, Y(1) + 4); ctx.fillText("0%", 6, Y(0) + 4);
    ctx.strokeStyle = ML.cssVar("--accent"); ctx.lineWidth = 3; ctx.beginPath();
    h.forEach((p, i) => (i ? ctx.lineTo(X(p.n), Y(p.acc)) : ctx.moveTo(X(p.n), Y(p.acc))));
    ctx.stroke();
    ctx.fillStyle = ML.cssVar("--accent");
    h.forEach((p) => { ctx.beginPath(); ctx.arc(X(p.n), Y(p.acc), 3.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = ML.cssVar("--muted"); ctx.textAlign = "right"; ctx.fillText("examples →", AW - 4, AH - 2);
  }

  function maybeCheckpoint(tot, q) {
    if (!S.ckptAt.includes(tot)) return;
    const host = document.getElementById("ckpts");
    if (!host.querySelector(".ckpt")) host.innerHTML = "";
    const snap = S.classes.map((c) => ({ name: c.name, color: c.color, cent: centroid(c), n: c.examples.length }));
    const b = document.createElement("button");
    b.className = "ckpt";
    b.innerHTML = `<canvas></canvas><b>${tot} examples</b>${q == null ? "can't quiz yet" : Math.round(q * 100) + "% on quiz"}`;
    host.appendChild(b);
    host.scrollLeft = host.scrollWidth;
    const cv = ML.setupCanvas(b.querySelector("canvas"), 104, 60);
    const w = 104 / snap.length;
    snap.forEach((s, i) => {
      cv.ctx.save(); cv.ctx.translate(i * w, 0);
      drawClip(cv.ctx, w - 2, 60, s.cent, ML.cssVar(s.color));
      cv.ctx.restore();
    });
    b.addEventListener("click", () => {
      document.querySelectorAll(".ckpt").forEach((x) => x.classList.toggle("on", x === b));
      const list = snap.map((s) => `${s.n} ${s.name}`).join(", ");
      ML.say(`Back when I had <b>${tot}</b> examples (${list}), my quiz score was <b>${q == null ? "not ready" : Math.round(q * 100) + "%"}</b>. Those little pictures were my memories of each sound then.`);
    });
  }

  // ---------- quick start: teach with the built-in sounds ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById("quick").addEventListener("click", async () => {
    if (S.quick) return;
    audio();
    S.quick = true;
    const kinds = ["whistle", "clap", "hum"];
    while (S.classes.length < 3) addClass("Sound");
    kinds.forEach((k, i) => (S.classes[i].name = k[0].toUpperCase() + k.slice(1)));
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < kinds.length; i++) {
        S.armed = i;
        renderClasses();
        ML.say(`Teaching example ${round + 1} of <b>${S.classes[i].name}</b>… watch its picture appear!`);
        synth(kinds[i]);
        await wait(1300);
      }
    }
    S.armed = -1;
    S.quick = false;
    renderClasses();
    ML.say(`Done! Now press a sound button (without Record) and I'll guess. Try <b>Beep</b>: I've never heard one. What will I say?`);
  });

  document.getElementById("add").addEventListener("click", () => addClass(["Whistle", "Clap", "Hum", "Beep"][S.classes.length] || "Sound"));
  document.getElementById("forget").addEventListener("click", () => {
    S.classes.forEach((c) => (c.examples = []));
    S.accHist = [];
    S.armed = -1;
    document.getElementById("ckpts").innerHTML = `<p class="muted" style="margin:0;font-size:.9rem">Saved as Robo collects examples.</p>`;
    renderClasses();
    updateStats();
    ML.say(`All my sound memories are gone. Teach me again!`);
  });

  // ---------- main loop: spectrogram + onset detection ----------
  function frame() {
    requestAnimationFrame(frame);
    if (!analyser) { drawIdle(); return; }
    const bnd = bands();
    // loudness = the loudest band, so a thin whistle counts as much as a wide clap
    let e = 0;
    for (const v of bnd) if (v > e) e = v;
    // scroll spectrogram left by 3 px, paint new column
    const ctx = spec.ctx;
    ctx.drawImage(spec.ctx.canvas, -3 * spec.dpr, 0, spec.ctx.canvas.width, spec.ctx.canvas.height, 0, 0, SW, SH);
    ctx.fillStyle = ML.cssVar("--canvas-bg");
    ctx.fillRect(SW - 3, 0, 3, SH);
    const accent = S.capture ? ML.cssVar("--warn") : ML.cssVar("--accent");
    const bh = SH / BANDS;
    for (let b = 0; b < BANDS; b++) {
      if (bnd[b] < 0.02) continue;
      ctx.globalAlpha = Math.min(1, bnd[b] * 1.3);
      ctx.fillStyle = accent;
      ctx.fillRect(SW - 3, SH - (b + 1) * bh, 3, bh + 0.5);
    }
    ctx.globalAlpha = 1;

    // onset detection with an adaptive noise floor
    if (!S.capture) {
      if (e > S.floor + 0.12) S.capture = [];
      else S.floor = S.floor * 0.98 + e * 0.02;
    }
    if (S.capture) {
      S.capture.push(bnd);
      if (S.capture.length >= CLIP) {
        const frames = S.capture;
        S.capture = null;
        onClip(frames);
      }
    }
    document.getElementById("spec-tag").textContent = S.capture ? "catching a sound…" : e > S.floor + 0.05 ? "hearing something" : "quiet";
  }
  function drawIdle() {
    const ctx = spec.ctx;
    ctx.fillStyle = ML.cssVar("--canvas-bg");
    ctx.fillRect(0, 0, SW, SH);
    ctx.fillStyle = ML.cssVar("--muted"); ctx.font = "700 15px Nunito, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Press a sound button to see sound as a picture", SW / 2, SH / 2);
    ctx.font = "700 11px Nunito, sans-serif"; ctx.textAlign = "left";
    ctx.fillText("high", 6, 14); ctx.fillText("low", 6, SH - 6);
  }

  addClass("Whistle");
  addClass("Clap");
  addClass("Hum");
  updateStats();
  requestAnimationFrame(frame);
  window.__ear = S;
})();
