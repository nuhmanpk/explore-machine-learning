// Find the Note page. Logic (synth, FFT, pitch detectors) lives in audio-pitch-core.js (PitchCore).
(function () {
  const C = window.PitchCore, $ = (id) => document.getElementById(id);
  const WW = 640, WH = 120, SW = 640, SH = 210, AW = 300, AH = 130, GW = 640, GH = 250;
  const wc = ML.setupCanvas($("wave"), WW, WH).ctx, spc = ML.setupCanvas($("spec"), SW, SH).ctx;
  const ac = ML.setupCanvas($("acf"), AW, AH).ctx, gc = ML.setupCanvas($("sg"), GW, GH).ctx;
  const ANSWER = [60, 62, 64, 65, 67, 69, 71, 72]; // C4 .. C5, white keys only
  const S = {
    key: 9, oct: 4, timbre: "flute", noise: 10, detune: 0, missing: false,
    res: null, x: null, mic: null, tune: [], sg: null, answer: [], hits: {}, touched: false,
    lastAct: Date.now(), nudged: false,
  };
  const midi = () => (S.oct + 1) * 12 + S.key;
  const f0 = () => C.midiToFreq(midi()) * Math.pow(2, S.detune / 1200);
  const silent = () => S.timbre === "pure" && S.missing;
  const fmtHz = (f) => (f >= 100 ? Math.round(f) : f.toFixed(1)) + " Hz";
  const fmtC = (c) => { const r = Math.round(c); return (r > 0 ? "+" : r < 0 ? "−" : "±") + Math.abs(r) + " cents"; };
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- audio (only ever started from a click or key press) ----------
  let actx = null, cur = null;
  function audio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function playSamples(x, sr, vol) {
    let a;
    try { a = audio(); } catch (e) { ML.toast("Sorry, this browser cannot play sound."); return; }
    let mx = 0; for (let i = 0; i < x.length; i++) mx = Math.max(mx, Math.abs(x[i]));
    const buf = a.createBuffer(1, x.length, sr), d = buf.getChannelData(0), fade = Math.round(0.02 * sr), tail = Math.round(0.15 * sr);
    for (let i = 0; i < x.length; i++) d[i] = (mx ? x[i] / mx : 0) * Math.min(1, i / fade, (x.length - 1 - i) / tail);
    if (cur) { try { cur.stop(); } catch (e) {} }
    const src = a.createBufferSource(), g = a.createGain();
    g.gain.value = vol || 0.12; // quiet on purpose
    src.buffer = buf; src.connect(g); g.connect(a.destination); src.start(); cur = src;
  }
  const amps = () => C.TIMBRES[S.timbre].amps;
  function playNow() {
    if (S.mic) return;
    const sr = audio().sampleRate;
    playSamples(C.synth({ f0: f0(), amps: amps(), missing: S.missing, noise: S.noise / 100, seed: 7, sr, n: Math.round(0.9 * sr) }), sr);
  }
  function playMidi(m) {
    const sr = audio().sampleRate;
    playSamples(C.synth({ f0: C.midiToFreq(m), amps: amps(), missing: S.missing, noise: 0, sr, n: Math.round(0.45 * sr) }), sr);
  }
  function playTune() {
    const sr = audio().sampleRate;
    playSamples(C.synthMelody(S.tune, { amps: amps(), missing: S.missing, noise: S.noise / 100, seed: 3, sr, dur: 0.5 }), sr);
  }

  // ---------- analysis ----------
  function compute() {
    S.x = C.synth({ f0: f0(), amps: amps(), missing: S.missing, noise: S.noise / 100, seed: 7 });
    S.res = C.analyse(S.x, C.SR);
    S.res.truth = silent() ? 0 : f0();
  }
  // how an ear did against the real pitch
  function judge(f, truth) {
    if (!truth) return { ok: null, text: "" };
    if (!(f > 0)) return { ok: false, text: "heard nothing" };
    const c = C.cents(f, truth), semis = Math.round(c / 100);
    if (Math.abs(c) <= 50) return { ok: true, text: "right note" };
    const names = { 12: "an octave too high", "-12": "an octave too low", 19: "an octave and a bit too high", 24: "two octaves too high", 7: "too high", "-7": "too low" };
    return { ok: false, text: names[semis] || (semis > 0 ? "too high" : "too low") };
  }

  // ---------- drawing ----------
  const col = () => ({ ink: ML.cssVar("--ink"), muted: ML.cssVar("--muted"), line: ML.cssVar("--line"), good: ML.cssVar("--good"), warn: ML.cssVar("--warn"), acc: ML.cssVar("--accent"), bg: ML.cssVar("--bg-2") });
  function drawWave() {
    const c = wc, k = col(), x = S.x, sr = S.res.sr, n = Math.min(x.length, Math.round(0.025 * sr)), mid = WH / 2;
    c.clearRect(0, 0, WW, WH);
    c.strokeStyle = k.line; c.lineWidth = 1; c.beginPath(); c.moveTo(0, mid); c.lineTo(WW, mid); c.stroke();
    let mx = 1e-9; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(x[i]));
    c.strokeStyle = k.ink; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < n; i++) { const px = (i / (n - 1)) * WW, py = mid - (x[i] / mx) * (mid - 10); i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
    c.fillStyle = k.muted; c.font = "700 11px Nunito, sans-serif"; c.textAlign = "right"; c.fillText("25 milliseconds", WW - 6, 14);
    const t = S.res.truth;
    if (t && !S.mic) { // mark one repeat of the wiggle
      const per = (sr / t / n) * WW;
      if (per < WW - 20) {
        c.strokeStyle = k.good; c.lineWidth = 3; c.beginPath(); c.moveTo(8, 10); c.lineTo(8 + per, 10); c.stroke();
        c.fillStyle = k.good; c.textAlign = "left"; c.fillText("one repeat", 12 + per, 14);
      }
    }
  }
  function tri(c, x, y, color, label, up) {
    c.fillStyle = color; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 7, y - 12); c.lineTo(x + 7, y - 12); c.closePath(); c.fill();
    c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center"; c.fillText(label, Math.max(40, Math.min(SW - 40, x)), y - 16 - (up ? 14 : 0));
  }
  function drawSpec() {
    const c = spc, k = col(), R = S.res, L = 8, Rt = 8, T = 48, B = 26, FMAXD = 2400, binHz = R.sr / R.size;
    const X = (f) => L + (f / FMAXD) * (SW - L - Rt), base = SH - B;
    c.clearRect(0, 0, SW, SH);
    let mx = 1e-9; const kmax = Math.min(R.mag.length - 1, Math.floor(FMAXD / binHz));
    for (let i = 1; i <= kmax; i++) mx = Math.max(mx, R.mag[i]);
    const bw = Math.max(1, (SW - L - Rt) / kmax + 0.3);
    for (let i = 1; i <= kmax; i++) {
      const f = i * binHz, h = (R.mag[i] / mx) * (base - T);
      if (h < 0.5) continue;
      c.fillStyle = `hsl(${Math.round(350 - (f / FMAXD) * 290)}, 80%, 55%)`;
      c.fillRect(X(f) - bw / 2, base - h, bw, h);
    }
    c.strokeStyle = k.line; c.lineWidth = 2; c.beginPath(); c.moveTo(L, base); c.lineTo(SW - Rt, base); c.stroke();
    c.fillStyle = k.muted; c.font = "700 10px Nunito, sans-serif"; c.textAlign = "center";
    for (let f = 0; f <= FMAXD; f += 400) c.fillText(f + " Hz", Math.max(18, Math.min(SW - 22, X(f))), SH - 4);
    const t = R.truth;
    if (t && !S.mic) {
      c.font = "800 10px Nunito, sans-serif";
      for (let h = 1; h * t < FMAXD; h++) { // harmonic numbers under the axis
        const gone = S.missing && h === 1;
        c.fillStyle = gone ? k.muted : k.good; c.fillText(gone ? "1 (gone)" : String(h), X(h * t), base + 12);
      }
      c.strokeStyle = k.good; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(X(t), T - 6); c.lineTo(X(t), base); c.stroke(); c.setLineDash([]);
    }
    const pf = R.peak.freq, af = R.acf.freq, close = pf > 0 && af > 0 && Math.abs(X(pf) - X(af)) < 70;
    if (pf > 0 && !silent()) tri(c, X(pf), T - 2, k.warn, "biggest bar", close);
    if (af > 0) tri(c, X(af), T - 2, k.acc, "echo ear", false);
  }
  function drawAcf() {
    const c = ac, k = col(), A = S.res.acf, sr = S.res.sr, r = A.r, L = 8, Rt = 8, T = 10, B = 22;
    c.clearRect(0, 0, AW, AH);
    if (!r) return;
    const n = Math.min(r.length - 1, A.maxLag), X = (lag) => L + (lag / n) * (AW - L - Rt), Y = (v) => T + (1 - (Math.max(-1, Math.min(1, v)) + 1) / 2) * (AH - T - B);
    c.strokeStyle = k.line; c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(AW - Rt, Y(0)); c.stroke();
    c.fillStyle = k.muted; c.font = "700 10px Nunito, sans-serif"; c.textAlign = "center";
    const msMax = (n / sr) * 1000;
    for (let ms = 0; ms <= msMax; ms += 4) c.fillText(ms + " ms", Math.max(14, Math.min(AW - 18, X((ms / 1000) * sr))), AH - 5);
    c.strokeStyle = k.ink; c.lineWidth = 1.6; c.beginPath();
    for (let i = 0; i <= n; i++) i ? c.lineTo(X(i), Y(r[i])) : c.moveTo(X(i), Y(r[i]));
    c.stroke();
    if (S.res.truth && !S.mic) { const tl = sr / S.res.truth; if (tl <= n) { c.strokeStyle = k.good; c.setLineDash([4, 3]); c.lineWidth = 2; c.beginPath(); c.moveTo(X(tl), T); c.lineTo(X(tl), AH - B); c.stroke(); c.setLineDash([]); } }
    if (A.lag > 0) { c.strokeStyle = k.acc; c.lineWidth = 3; c.beginPath(); c.moveTo(X(A.lag), T); c.lineTo(X(A.lag), AH - B); c.stroke(); }
  }
  function updateEars() {
    const R = S.res, t = R.truth;
    const one = (id, f) => {
      const d = C.describe(f), j = judge(f, t), box = $("ear-" + id);
      $(id + "-note").textContent = d ? d.name : "?";
      $(id + "-hz").textContent = d ? `${fmtHz(f)} · ${fmtC(d.cents)}` : "no clear note";
      $(id + "-v").textContent = j.text;
      $(id + "-m").style.left = d ? 50 + Math.max(-50, Math.min(50, d.cents)) + "%" : "50%";
      box.classList.toggle("ok", j.ok === true); box.classList.toggle("bad", j.ok === false);
    };
    one("peak", silent() ? 0 : R.peak.freq); one("acf", R.acf.freq);
    const h = C.describe(R.hps.freq);
    $("hps-line").textContent = h && !silent() ? `Third opinion, the harmonic stack: ${h.name} ${fmtC(h.cents)}.` : "";
    if (S.mic) $("truth").textContent = R.rms < 0.004 ? "Listening… hum, whistle or sing a long note!" : "Listening to your microphone. There is no answer key, so trust your ears!";
    else if (!t) $("truth").innerHTML = "The real note: <b>nothing!</b> A whistle has only one bar, so taking it away leaves just hiss.";
    else $("truth").innerHTML = `The real note: <b>${C.midiName(midi())}</b> · ${fmtHz(t)}${S.detune ? " · " + fmtC(S.detune) : ""}`;
    $("nowname").textContent = S.mic ? "· from your microphone" : `· ${C.TIMBRES[S.timbre].label} playing ${C.midiName(midi())}`;
  }
  function drawAll() { if (!S.res) return; drawWave(); drawSpec(); drawAcf(); updateEars(); drawSg(); }

  // ---------- spectrogram for the mystery tune ----------
  const SGLO = 220, SGHI = 1200;
  function buildSg() {
    if (!S.tune.length) return;
    const x = C.synthMelody(S.tune, { amps: amps(), missing: S.missing, noise: S.noise / 100, seed: 3, dur: 0.5 });
    S.sg = C.spectrogram(x, C.SR, 1024, 256);
  }
  function rgb(css) {
    const t = document.createElement("canvas").getContext("2d"); t.fillStyle = "#000"; t.fillStyle = css;
    const s = t.fillStyle;
    if (s[0] === "#") return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    return (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  }
  function drawSg() {
    const c = gc, k = col(), G = S.sg;
    c.clearRect(0, 0, GW, GH);
    if (!G) return;
    const L = 40, Rt = 6, T = 6, B = 18, PW = GW - L - Rt, PH = GH - T - B;
    const Y = (f) => T + PH - (Math.log(f / SGLO) / Math.log(SGHI / SGLO)) * PH;
    const nf = G.frames.length, rows = Math.round(PH), off = document.createElement("canvas");
    off.width = nf; off.height = rows;
    const o = off.getContext("2d"), img = o.createImageData(nf, rows), bg = rgb(k.bg), hot = rgb(k.acc), top = [255, 196, 64];
    const binHz = G.sr / (G.frames[0].mag.length * 2 - 2);
    for (let row = 0; row < rows; row++) {
      const f = SGLO * Math.pow(SGHI / SGLO, 1 - (row + 0.5) / rows), b = f / binHz, b0 = Math.floor(b), fr = b - b0;
      for (let i = 0; i < nf; i++) {
        const m = G.frames[i].mag, v = m[b0] * (1 - fr) + m[b0 + 1] * fr;
        const db = 20 * Math.log10(v / G.max + 1e-9), a = Math.max(0, Math.min(1, (db + 40) / 40));
        const p = (row * nf + i) * 4, mix = (u, w, s) => u + (w - u) * s;
        const c1 = a < 0.6 ? hot : top, s1 = a < 0.6 ? a / 0.6 : (a - 0.6) / 0.4, from = a < 0.6 ? bg : hot;
        img.data[p] = mix(from[0], c1[0], s1); img.data[p + 1] = mix(from[1], c1[1], s1); img.data[p + 2] = mix(from[2], c1[2], s1); img.data[p + 3] = 255;
      }
    }
    o.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true; c.drawImage(off, L, T, PW, PH);
    // note ruler (the answer notes) on the left
    c.font = "800 10px Nunito, sans-serif";
    ANSWER.forEach((m) => {
      const y = Y(C.midiToFreq(m)), right = m === 65 || m === 72; // F4 and C5 sit a half-step from a neighbour, so label them on the right
      c.strokeStyle = k.line; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(L, y); c.lineTo(GW - Rt, y); c.stroke(); c.setLineDash([]);
      c.fillStyle = k.ink; c.textAlign = "right"; c.fillText(C.midiName(m), right ? L - 5 - 18 : L - 5, y + 3.5);
    });
    c.fillStyle = k.muted; c.textAlign = "left"; c.font = "700 10px Nunito, sans-serif"; c.fillText("time →", L, GH - 4);
    c.textAlign = "right"; c.fillText("low pitches at the bottom, high at the top", GW - Rt, GH - 4);
    // Robo's pitch track
    c.fillStyle = k.ink; c.strokeStyle = k.bg; c.lineWidth = 1;
    G.frames.forEach((fr, i) => {
      if (!(fr.freq > SGLO && fr.freq < SGHI)) return;
      const x = L + ((i + 0.5) / nf) * PW, y = Y(fr.freq);
      c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill(); c.stroke();
    });
  }
  function newTune() {
    const t = [];
    while (t.length < 4) { const m = ANSWER[Math.floor(Math.random() * ANSWER.length)]; if (m !== t[t.length - 1]) t.push(m); }
    S.tune = t; S.answer = []; buildSg(); drawSg(); paintSlots();
  }
  function paintSlots() {
    const full = S.answer.length === 4;
    $("slots").innerHTML = [0, 1, 2, 3].map((i) => {
      const m = S.answer[i], cls = m === undefined ? "" : full ? (m === S.tune[i] ? "full right" : "full wrong") : "full";
      return `<span class="slot ${cls}" aria-label="Note ${i + 1}: ${m === undefined ? "empty" : C.midiName(m)}">${m === undefined ? "?" : C.midiName(m)}</span>`;
    }).join("");
  }
  $("picknotes").innerHTML = ANSWER.map((m) => `<button class="btn small ghost" data-m="${m}">${C.midiName(m)}</button>`).join("");
  $("picknotes").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]"); if (!b) return;
    if (S.answer.length === 4) S.answer = [];
    const m = +b.dataset.m; S.answer.push(m); playMidi(m); paintSlots();
    if (S.answer.length < 4) { ML.say(`Note ${S.answer.length}: <b>${C.midiName(m)}</b>. ${4 - S.answer.length} to go. Follow Robo's dots from left to right.`); return; }
    const right = S.answer.filter((v, i) => v === S.tune[i]).length;
    if (right === 4) {
      const heard = C.trackNotes(S.sg.frames.map((f) => f.freq), 4).map(C.midiName).join(", ");
      hit("tune", "You named the tune!", `My echo ear heard: <b>${heard}</b>. Try this: tick "Take away the bottom note" and press <b>New tune</b>. The bright bottom line vanishes, but Robo's dots stay put!`);
    } else ML.say(`<b>${right} of 4</b> right (green). Press <b>Play the tune</b> to listen again, and check each step of dots against the note names. Tap a note to start a new answer.`);
  });
  $("tclear").addEventListener("click", () => { S.answer = []; paintSlots(); ML.say("Answer cleared. Start with the first group of dots on the left."); });
  $("tnew").addEventListener("click", () => { newTune(); playTune(); ML.say("A new mystery tune! Each group of dots is one note. Which names do they line up with?"); });
  $("tplay").addEventListener("click", () => { playTune(); ML.say("Listen: four notes. Low notes sit near the bottom of the picture, high notes near the top."); });

  // ---------- challenges ----------
  function hit(kname, msg, next) {
    if (S.hits[kname]) { if (next) ML.say(next); return; }
    S.hits[kname] = 1; $("c-" + kname).classList.add("done"); ML.toast(msg);
    ML.say(`<b>Challenge done!</b> ${msg} ${next || ""}`);
    if (Object.keys(S.hits).length === 3) ML.confetti(50);
  }
  function check() {
    if (!S.touched || S.mic || silent()) return false;
    const R = S.res, t = R.truth, pk = judge(R.peak.freq, t), ae = judge(R.acf.freq, t);
    if (!S.hits.fool && pk.ok === false && ae.ok) { hit("fool", "The biggest-bar ear was fooled, but the echo ear wasn't.", "Try this next: turn the hiss up to 60% and nudge the note out of tune. Can the echo ear stay within 5 cents?"); return true; }
    if (!S.hits.noise && S.noise >= 60 && Math.abs(S.detune) >= 10 && ae.ok && Math.abs(C.cents(R.acf.freq, t)) <= 5) { hit("noise", `Within ${Math.abs(C.cents(R.acf.freq, t)).toFixed(1)} cents, through all that hiss!`, "Try this next: scroll down to the <b>Mystery tune</b> and name all four notes."); return true; }
    return false;
  }

  // ---------- Robo talks about what you just did ----------
  function verdictLine() {
    const R = S.res, t = R.truth;
    if (!t) return "";
    const pk = judge(R.peak.freq, t), ae = judge(R.acf.freq, t), pn = C.describe(R.peak.freq), an = C.describe(R.acf.freq);
    if (pk.ok && ae.ok) return `Both my ears agree: <b>${an.name}</b>.`;
    if (!pk.ok && ae.ok) return `Uh-oh! My biggest-bar ear says <b>${pn ? pn.name : "?"}</b> (${pk.text}), but my echo ear says <b>${an.name}</b>. The echo ear is right!`;
    if (pk.ok && !ae.ok) return `Hmm, my echo ear got muddled (${ae.text}). That much hiss is really hard!`;
    return "Both my ears are confused. That much hiss would confuse anyone!";
  }
  function talk(why) {
    const t = f0(), name = C.midiName(midi());
    let s = "";
    if (why === "key") s = `That's <b>${name}</b>: the air wiggles about <b>${Math.round(t)}</b> times a second. `;
    else if (why === "timbre") s = {
      pure: "A whistle is one smooth wiggle, so there is just <b>one bar</b>. ",
      flute: "A flute has a strong note and a few soft overtones. ",
      violin: "A violin's <b>second</b> bar is often louder than the note itself. Watch the yellow arrow! ",
      robot: "Buzzy! The robot has <b>every</b> overtone, getting quieter as they go up. ",
    }[S.timbre];
    else if (why === "oct") s = `Octave ${S.oct}: ${name} wiggles ${Math.round(t)} times a second. Going up one octave doubles it. `;
    else if (why === "missing") s = S.missing ? (silent() ? "" : "I took the bottom bar away! Only the overtones are left. Listen: it is still the same note to your ears too. ") : "The bottom bar is back. ";
    else if (why === "noise") s = S.noise >= 60 ? `Lots of hiss (${S.noise}%)! Look at all the tiny random bars. ` : S.noise ? `Hiss at ${S.noise}%. The tiny bars along the bottom are the hiss. ` : "No hiss at all: perfectly clean. ";
    else if (why === "detune") s = S.detune ? `Now the note is <b>${fmtC(S.detune)}</b> ${S.detune > 0 ? "sharp (a bit high)" : "flat (a bit low)"}. Watch the little line on the meters move. ` : "Back in tune: right on the key. ";
    ML.say(s + (silent() ? "A whistle only has one bar, so with it gone there's nothing left but hiss. Pick another instrument!" : verdictLine()));
  }
  function change(why, play) {
    S.touched = true; compute(); drawAll();
    if (!check()) talk(why);
    if (play) playNow();
  }

  // ---------- keyboard ----------
  const keysEl = $("keys"), WHITE = [0, 2, 4, 5, 7, 9, 11, 12], BLACK = [1, 3, 6, 8, 10], kbd = {};
  "asdfghjk".split("").forEach((ch, i) => (kbd[ch] = WHITE[i]));
  "wetyu".split("").forEach((ch, i) => (kbd[ch] = BLACK[i]));
  function buildKeys() {
    const ww = 100 / WHITE.length;
    keysEl.innerHTML = "";
    WHITE.forEach((k, i) => keysEl.insertAdjacentHTML("beforeend", `<button type="button" class="white" data-k="${k}" style="left:${i * ww}%;width:${ww}%"></button>`));
    BLACK.forEach((k) => { const before = WHITE.filter((w) => w < k).length; keysEl.insertAdjacentHTML("beforeend", `<button type="button" class="black" data-k="${k}" style="left:${before * ww - ww * 0.3}%;width:${ww * 0.6}%"></button>`); });
    paintKeys();
  }
  function paintKeys() {
    keysEl.querySelectorAll("button").forEach((b) => {
      const k = +b.dataset.k, m = (S.oct + 1) * 12 + k, n = C.midiName(m);
      b.textContent = n; b.setAttribute("aria-label", n.replace("#", " sharp ")); b.classList.toggle("on", k === S.key && !S.mic);
      b.setAttribute("aria-pressed", k === S.key && !S.mic ? "true" : "false");
    });
  }
  function pressKey(k) { if (S.mic) stopMic(); S.key = k; paintKeys(); change("key", true); }
  keysEl.addEventListener("click", (e) => { const b = e.target.closest("button[data-k]"); if (b) pressKey(+b.dataset.k); });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "textarea" || (tag === "input" && e.target.type === "text")) return;
    const k = kbd[e.key.toLowerCase()]; if (k === undefined) return;
    pressKey(k);
  });

  // ---------- controls ----------
  $("timbre").addEventListener("change", (e) => { S.timbre = e.target.value; buildSg(); change("timbre", true); });
  $("octave").addEventListener("change", (e) => { S.oct = +e.target.value; paintKeys(); change("oct", true); });
  $("missing").addEventListener("change", (e) => { S.missing = e.target.checked; buildSg(); change("missing", true); });
  let boot = true;
  let sgTimer = 0;
  ML.bindRange("#noise", (v) => v + "%", (v) => {
    S.noise = v; if (boot) return;
    change("noise", false);
    clearTimeout(sgTimer); sgTimer = setTimeout(() => { buildSg(); drawSg(); }, 150); // the tune picture is slower, so wait for the slider to settle
  });
  ML.bindRange("#detune", (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) + " cents", (v) => { S.detune = v; if (boot) return; change("detune", false); });
  ["noise", "detune"].forEach((id) => $(id).addEventListener("change", () => { if (!S.mic) playNow(); }));
  $("play").addEventListener("click", () => { if (S.mic) stopMic(); S.touched = true; playNow(); ML.say(`Playing <b>${C.midiName(midi())}</b> on the ${C.TIMBRES[S.timbre].label.toLowerCase()}. ${verdictLine()}`); });

  // ---------- microphone (optional, only after a click) ----------
  async function startMic() {
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia || !window.isSecureContext) { ML.say("Your browser won't let me use a microphone here. No problem: the keyboard works just as well!"); ML.toast("Microphone not available"); return; }
    try {
      const a = audio(), stream = await md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = a.createMediaStreamSource(stream), an = a.createAnalyser();
      an.fftSize = 8192; src.connect(an); // not connected to the speakers: no feedback
      S.mic = { stream, an, buf: new Float32Array(an.fftSize), timer: 0 };
      $("mic").setAttribute("aria-pressed", "true"); $("mic").lastChild.textContent = " Stop microphone";
      paintKeys();
      ML.say("I'm listening! Hum, whistle or sing a long steady note. (Nothing is recorded.)");
      const step = () => {
        if (!S.mic) return;
        S.mic.an.getFloatTimeDomainData(S.mic.buf);
        const sr = a.sampleRate, fct = Math.max(1, Math.round(sr / C.SR)), n = Math.floor(S.mic.buf.length / fct), x = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < fct; j++) s += S.mic.buf[i * fct + j]; x[i] = s / fct; } // simple low-pass + down-sample
        S.x = x; S.res = C.analyse(x, sr / fct); S.res.truth = 0;
        if (S.res.rms < 0.004) { S.res.acf = { ...S.res.acf, freq: 0, lag: 0 }; S.res.peak = { freq: 0 }; S.res.hps = { freq: 0 }; }
        drawWave(); drawSpec(); drawAcf(); updateEars();
        S.mic.timer = setTimeout(step, reduced() ? 400 : 120);
      };
      step();
    } catch (e) {
      ML.say("I couldn't open the microphone (maybe it was blocked). That's fine: use the keyboard instead!"); ML.toast("Microphone not available");
    }
  }
  function stopMic() {
    if (!S.mic) return;
    clearTimeout(S.mic.timer); S.mic.stream.getTracks().forEach((t) => t.stop()); S.mic = null;
    $("mic").setAttribute("aria-pressed", "false"); $("mic").lastChild.textContent = " Use my microphone";
    compute(); paintKeys(); drawAll();
  }
  $("mic").addEventListener("click", () => { S.lastAct = Date.now(); if (S.mic) { stopMic(); ML.say("Microphone off. Back to my own sounds."); } else startMic(); });
  window.addEventListener("pagehide", stopMic);

  // ---------- gentle nudges if nothing happens for a while ----------
  ["pointerdown", "keydown", "input"].forEach((ev) => document.addEventListener(ev, () => { S.lastAct = Date.now(); S.nudged = false; }, { passive: true }));
  setInterval(() => {
    if (S.nudged || S.mic || Date.now() - S.lastAct < 15000) return;
    S.nudged = true;
    if (!S.touched) ML.say("Psst! Tap any key on the little keyboard, or press <b>Play</b>. Watch the rainbow bars change!");
    else if (!S.hits.fool) ML.say("Here's a trick: choose the <b>Violin</b>. Its second bar is taller than its first, and my biggest-bar ear can't resist the tallest bar…");
    else if (!S.hits.noise) ML.say("Next: drag <b>Out of tune</b> to about +20 cents, then push the <b>Hiss</b> to 60% or more. Does the echo ear stay within 5 cents?");
    else if (!S.hits.tune) ML.say("Last one: scroll to the <b>Mystery tune</b>. Each line of dots is one note. Line them up with the names on the left.");
    else ML.say("You've done every challenge! Try the microphone, or take the bottom note away from the Robot. Even my harmonic stack gets confused by that one.");
  }, 3000);

  // ---------- start ----------
  boot = false;
  buildKeys(); compute(); newTune(); drawAll();
  new MutationObserver(drawAll).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", drawAll);
  window.addEventListener("load", drawAll);
})();
