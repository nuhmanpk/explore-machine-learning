// Brain Painter — a tiny MLP (tanh hidden, sigmoid out) trained with backprop + mini-batch SGD.
(function () {
  const LRS = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3];
  const state = {
    layers: 0, neurons: 4, lr: 0.3, speed: 1, budget: 0, brush: 0, running: true,
    epoch: 0, probe: { x: 0.05, y: 0.05 }, loss: NaN, acc: NaN, lossHist: [], solved: false, eventUntil: 0,
  };
  let points = []; // {x, y, c} with x,y in [-1,1], c = 0 red / 1 blue

  // ---------- the network ----------
  let net;
  function buildNet() {
    const sizes = [2, ...Array(state.layers).fill(state.neurons), 1];
    const W = [], B = [];
    for (let l = 1; l < sizes.length; l++) {
      const fanIn = sizes[l - 1], sd = Math.sqrt(1 / fanIn);
      W.push(Array.from({ length: sizes[l] }, () => Float64Array.from({ length: fanIn }, () => ML.randn() * sd)));
      B.push(new Float64Array(sizes[l]));
    }
    net = { sizes, W, B };
    state.epoch = 0; state.lossHist = []; state.solved = false;
    if (typeof resetCps === "function") resetCps();
  }
  // Returns activations per layer (acts[0] = input).
  function forward(x, y) {
    const acts = [[x, y]];
    for (let l = 0; l < net.W.length; l++) {
      const prev = acts[l], Wl = net.W[l], Bl = net.B[l], last = l === net.W.length - 1;
      const a = new Array(Wl.length);
      for (let j = 0; j < Wl.length; j++) {
        let z = Bl[j];
        const row = Wl[j];
        for (let i = 0; i < prev.length; i++) z += row[i] * prev[i];
        a[j] = last ? 1 / (1 + Math.exp(-z)) : Math.tanh(z);
      }
      acts.push(a);
    }
    return acts;
  }
  const predict = (x, y) => { const a = forward(x, y); return a[a.length - 1][0]; };

  function trainEpoch() {
    if (!points.length) return;
    const idx = points.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const BS = 10;
    for (let s = 0; s < idx.length; s += BS) {
      const gW = net.W.map((Wl) => Wl.map((r) => new Float64Array(r.length)));
      const gB = net.B.map((b) => new Float64Array(b.length));
      const batch = idx.slice(s, s + BS);
      for (const k of batch) {
        const p = points[k];
        const acts = forward(p.x, p.y);
        let delta = [acts[acts.length - 1][0] - p.c]; // dBCE/dz for sigmoid output
        for (let l = net.W.length - 1; l >= 0; l--) {
          const prev = acts[l];
          for (let j = 0; j < delta.length; j++) {
            gB[l][j] += delta[j];
            const g = gW[l][j];
            for (let i = 0; i < prev.length; i++) g[i] += delta[j] * prev[i];
          }
          if (l > 0) {
            const nd = new Array(prev.length).fill(0);
            for (let i = 0; i < prev.length; i++) {
              let sum = 0;
              for (let j = 0; j < delta.length; j++) sum += net.W[l][j][i] * delta[j];
              nd[i] = sum * (1 - prev[i] * prev[i]); // tanh'
            }
            delta = nd;
          }
        }
      }
      const step = state.lr / batch.length;
      for (let l = 0; l < net.W.length; l++)
        for (let j = 0; j < net.W[l].length; j++) {
          net.B[l][j] -= step * gB[l][j];
          for (let i = 0; i < net.W[l][j].length; i++) net.W[l][j][i] -= step * gW[l][j][i];
        }
    }
    state.epoch++;
  }

  function evaluate() {
    if (!points.length) { state.loss = NaN; state.acc = NaN; return; }
    let loss = 0, right = 0;
    for (const p of points) {
      const q = ML.clamp(predict(p.x, p.y), 1e-7, 1 - 1e-7);
      loss += -(p.c * Math.log(q) + (1 - p.c) * Math.log(1 - q));
      if ((q > 0.5 ? 1 : 0) === p.c) right++;
    }
    state.loss = loss / points.length;
    state.acc = right / points.length;
    if (isFinite(state.loss)) { state.lossHist.push(state.loss); if (state.lossHist.length > 300) state.lossHist.shift(); }
  }

  // ---------- data presets ----------
  function preset(name) {
    const pts = [];
    const add = (x, y, c) => { if (Math.abs(x) <= 1 && Math.abs(y) <= 1) pts.push({ x, y, c }); };
    if (name === "blobs") {
      for (let i = 0; i < 60; i++) add(-0.45 + ML.randn() * 0.18, -0.4 + ML.randn() * 0.18, 0);
      for (let i = 0; i < 60; i++) add(0.45 + ML.randn() * 0.18, 0.4 + ML.randn() * 0.18, 1);
    } else if (name === "circle") {
      for (let i = 0; i < 70; i++) { const r = ML.rand(0, 0.38), a = ML.rand(0, 7); add(r * Math.cos(a), r * Math.sin(a), 1); }
      for (let i = 0; i < 90; i++) { const r = ML.rand(0.6, 0.9), a = ML.rand(0, 7); add(r * Math.cos(a), r * Math.sin(a), 0); }
    } else if (name === "xor") {
      while (pts.length < 140) {
        const x = ML.rand(-0.95, 0.95), y = ML.rand(-0.95, 0.95);
        if (Math.abs(x) < 0.08 || Math.abs(y) < 0.08) continue;
        add(x, y, x * y > 0 ? 1 : 0);
      }
    } else if (name === "spiral") {
      for (let c = 0; c < 2; c++)
        for (let i = 0; i < 80; i++) {
          const t = i / 80, r = 0.08 + t * 0.85, a = t * Math.PI * 3 + c * Math.PI;
          add(r * Math.cos(a) + ML.randn() * 0.025, r * Math.sin(a) + ML.randn() * 0.025, c);
        }
    }
    points = pts;
  }

  // ---------- canvases ----------
  const BW = 440, BH = 440;
  const board = document.getElementById("board");
  const { ctx: bx } = ML.setupCanvas(board, BW, BH);
  const NW = 340, NH = 360;
  const netCv = document.getElementById("net");
  const { ctx: nx } = ML.setupCanvas(netCv, NW, NH);
  const spark = document.getElementById("spark");
  let sp;
  function sizeSpark() { const r = spark.getBoundingClientRect(); sp = ML.setupCanvas(spark, Math.max(100, r.width), 56); spark.style.aspectRatio = ""; spark.style.height = "56px"; }

  const G = 64; // heatmap resolution
  const heat = document.createElement("canvas");
  heat.width = G; heat.height = G;
  const hx = heat.getContext("2d");
  const img = hx.createImageData(G, G);

  function hexRgb(c) {
    c = c.trim();
    if (c.startsWith("#")) {
      if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    const m = c.match(/\d+/g);
    return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  let colors;
  function readColors() {
    colors = {
      red: hexRgb(ML.cssVar("--bad")), blue: hexRgb(ML.cssVar("--sup")), bg: hexRgb(ML.cssVar("--canvas-bg")),
      redS: ML.cssVar("--bad"), blueS: ML.cssVar("--sup"), plus: ML.cssVar("--sup"), minus: ML.cssVar("--rl"),
      ink: ML.cssVar("--ink"), card: ML.cssVar("--card"), line: ML.cssVar("--line"), muted: ML.cssVar("--muted"), accent: ML.cssVar("--accent"),
    };
  }
  readColors();
  document.addEventListener("themechange", () => setTimeout(readColors, 0));

  // Color for a probability p of "blue": blend toward background when unsure.
  function shade(p, out, o) {
    const c = p > 0.5 ? colors.blue : colors.red;
    const k = 0.18 + Math.pow(Math.abs(p - 0.5) * 2, 0.8) * 0.62;
    out[o] = colors.bg[0] + (c[0] - colors.bg[0]) * k;
    out[o + 1] = colors.bg[1] + (c[1] - colors.bg[1]) * k;
    out[o + 2] = colors.bg[2] + (c[2] - colors.bg[2]) * k;
    out[o + 3] = 255;
  }

  function drawBoard(t) {
    const d = img.data;
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const x = (i + 0.5) / G * 2 - 1, y = 1 - (j + 0.5) / G * 2;
        shade(predict(x, y), d, (j * G + i) * 4);
      }
    hx.putImageData(img, 0, 0);
    bx.clearRect(0, 0, BW, BH);
    bx.imageSmoothingEnabled = true;
    bx.drawImage(heat, 0, 0, BW, BH);
    // faint axes
    bx.strokeStyle = colors.ink; bx.globalAlpha = 0.08; bx.lineWidth = 1;
    bx.beginPath(); bx.moveTo(BW / 2, 0); bx.lineTo(BW / 2, BH); bx.moveTo(0, BH / 2); bx.lineTo(BW, BH / 2); bx.stroke();
    bx.globalAlpha = 1;
    // dots
    for (const p of points) {
      const px = (p.x + 1) / 2 * BW, py = (1 - p.y) / 2 * BH;
      const wrong = (predict(p.x, p.y) > 0.5 ? 1 : 0) !== p.c;
      if (wrong) {
        bx.strokeStyle = colors.ink; bx.lineWidth = 2; bx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 150);
        bx.beginPath(); bx.arc(px, py, 10 + Math.sin(t / 150) * 2, 0, Math.PI * 2); bx.stroke();
        bx.globalAlpha = 1;
      }
      bx.fillStyle = p.c ? colors.blueS : colors.redS;
      bx.strokeStyle = "#fff"; bx.lineWidth = 2;
      bx.beginPath(); bx.arc(px, py, 6, 0, Math.PI * 2); bx.fill(); bx.stroke();
    }
    if (state.probe) {
      const px = (state.probe.x + 1) / 2 * BW, py = (1 - state.probe.y) / 2 * BH;
      bx.strokeStyle = colors.ink; bx.lineWidth = 2.5;
      bx.beginPath(); bx.arc(px, py, 13, 0, Math.PI * 2);
      bx.moveTo(px - 20, py); bx.lineTo(px - 8, py); bx.moveTo(px + 8, py); bx.lineTo(px + 20, py);
      bx.moveTo(px, py - 20); bx.lineTo(px, py - 8); bx.moveTo(px, py + 8); bx.lineTo(px, py + 20); bx.stroke();
    }
    if (!points.length) {
      bx.fillStyle = colors.ink; bx.globalAlpha = 0.6; bx.font = "700 18px Nunito, sans-serif"; bx.textAlign = "center";
      bx.fillText("Tap to drop dots, or pick a preset", BW / 2, BH / 2); bx.globalAlpha = 1;
    }
  }

  // Network diagram with per-neuron thumbnails.
  const T = 15; // thumbnail resolution
  function drawNet() {
    nx.clearRect(0, 0, NW, NH);
    const L = net.sizes.length;
    const tile = Math.min(34, Math.floor((NH - 30) / Math.max(...net.sizes)) - 6);
    const colX = (l) => 26 + l * ((NW - 52) / (L - 1));
    const rowY = (l, j) => { const n = net.sizes[l]; const gap = (NH - 20) / n; return 10 + gap * (j + 0.5); };
    // thumbnails: evaluate every neuron on a T×T grid
    const vals = net.sizes.map((n) => Array.from({ length: n }, () => new Float32Array(T * T)));
    for (let j = 0; j < T; j++)
      for (let i = 0; i < T; i++) {
        const acts = forward((i + 0.5) / T * 2 - 1, 1 - (j + 0.5) / T * 2);
        acts.forEach((a, l) => a.forEach((v, k) => (vals[l][k][j * T + i] = v)));
      }
    // links
    let maxW = 0.5;
    net.W.forEach((Wl) => Wl.forEach((r) => r.forEach((w) => (maxW = Math.max(maxW, Math.abs(w))))));
    for (let l = 0; l < net.W.length; l++)
      for (let j = 0; j < net.W[l].length; j++)
        for (let i = 0; i < net.W[l][j].length; i++) {
          const w = net.W[l][j][i];
          nx.strokeStyle = w >= 0 ? colors.plus : colors.minus;
          nx.globalAlpha = 0.25 + 0.65 * Math.min(1, Math.abs(w) / maxW);
          nx.lineWidth = 0.5 + 4 * Math.min(1, Math.abs(w) / maxW);
          nx.beginPath(); nx.moveTo(colX(l) + tile / 2, rowY(l, i)); nx.lineTo(colX(l + 1) - tile / 2, rowY(l + 1, j)); nx.stroke();
        }
    nx.globalAlpha = 1;
    // nodes
    const ti = nx.createImageData(T, T);
    const tc = document.createElement("canvas"); tc.width = T; tc.height = T;
    const tctx = tc.getContext("2d");
    for (let l = 0; l < L; l++)
      for (let k = 0; k < net.sizes[l]; k++) {
        const v = vals[l][k];
        for (let p = 0; p < T * T; p++) shade(l === L - 1 ? v[p] : (v[p] + 1) / 2, ti.data, p * 4);
        tctx.putImageData(ti, 0, 0);
        const cx = colX(l), cy = rowY(l, k), sz = l === L - 1 ? tile + 10 : tile;
        nx.imageSmoothingEnabled = true;
        nx.drawImage(tc, cx - sz / 2, cy - sz / 2, sz, sz);
        nx.strokeStyle = colors.ink; nx.lineWidth = 2;
        nx.strokeRect(cx - sz / 2, cy - sz / 2, sz, sz);
      }
    nx.fillStyle = colors.muted; nx.font = "800 10px Nunito, sans-serif"; nx.textAlign = "center";
    nx.fillText("IN", colX(0), NH - 2);
    nx.fillText("OUT", colX(L - 1), NH - 2);
    if (L > 2) nx.fillText("THINKING", (colX(1) + colX(L - 2)) / 2, NH - 2);
  }

  function drawSpark() {
    const { ctx, w, h } = sp;
    ctx.clearRect(0, 0, w, h);
    const hist = state.lossHist;
    if (hist.length < 2) return;
    const max = Math.max(0.75, ...hist);
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = 4 + (i / (hist.length - 1)) * (w - 8), y = h - 4 - (Math.min(v, max) / max) * (h - 8);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  function updateStats() {
    document.getElementById("epoch").textContent = state.epoch;
    document.getElementById("acc").innerHTML = isFinite(state.acc) ? Math.round(state.acc * 100) + "<small>%</small>" : "–";
    document.getElementById("loss").textContent = isFinite(state.loss) ? state.loss.toFixed(3) : "–";
  }

  // ---------- narration ----------
  function event(html, ms = 3500) { ML.say(html); state.eventUntil = performance.now() + ms; }
  let lastNarr = 0;
  function narrate(now) {
    if (now < state.eventUntil || now - lastNarr < 1200) return;
    lastNarr = now;
    if (!points.length) { ML.say("The board is empty! Tap it to drop some red and blue dots, or pick a preset."); return; }
    const reds = points.filter((p) => p.c === 0).length;
    if (reds === 0 || reds === points.length) { ML.say("All the dots are the same color — too easy! Add some of the <b>other</b> color too."); return; }
    const wrong = Math.round((1 - state.acc) * points.length);
    if (wrong === 0) {
      if (!state.solved) { state.solved = true; ML.confetti(60); }
      ML.say(`🎉 Every dot is on its own color! I did it in <b>${state.epoch}</b> rounds${state.layers ? ` with ${state.layers * state.neurons} thinking neurons` : " with just a straight line"}. Try another shape!`);
      return;
    }
    if (!state.running) { ML.say(`I'm paused. <b>${wrong}</b> dots are still on the wrong color. Press Play or Step to keep learning.`); return; }
    if (state.lr >= 3 && state.lossHist.length > 20) {
      const h = state.lossHist.slice(-20);
      if (Math.max(...h) - Math.min(...h) > 0.2) { ML.say("Whoa, my steps are so giant I keep jumping over the answer! Try a smaller step size."); return; }
    }
    if (state.layers === 0 && state.epoch > 60 && state.acc < 0.95) {
      ML.say(`With <b>no thinking neurons</b> I can only paint with one straight line. A straight line can't wrap around these dots! Press <b>+</b> next to "Thinking layers".`);
      return;
    }
    const prog = state.lossHist.length > 40 ? state.lossHist[state.lossHist.length - 40] - state.loss : 1;
    if (state.epoch > 400 && prog < 0.002) {
      ML.say(`I'm stuck with <b>${wrong}</b> dots on the wrong color. Maybe I need more neurons, or another layer?`);
      return;
    }
    const lines = [
      `Look! I'm bending my colors to wrap around the dots. Only <b>${wrong}</b> left on the wrong color.`,
      `Each round I nudge every knob a tiny bit. <b>${wrong}</b> oopsies to go!`,
      `My oops-meter is at <b>${state.loss.toFixed(2)}</b>. Lower is better — watch it drop!`,
    ];
    ML.say(lines[Math.floor(now / 3600) % lines.length]);
  }

  // ---------- controls ----------
  const msg = document.getElementById("msg");
  let msgTimer;
  function flash(text) { msg.textContent = text; msg.classList.add("show"); clearTimeout(msgTimer); msgTimer = setTimeout(() => msg.classList.remove("show"), 1300); }

  const playBtn = document.getElementById("play");
  function setRunning(r) { state.running = r; playBtn.innerHTML = r ? ML.icon("pause") + " Pause" : ML.icon("play") + " Play"; }
  playBtn.addEventListener("click", () => { if (live) { goLive(); setRunning(true); return; } setRunning(!state.running); });
  document.getElementById("step").addEventListener("click", () => { goLive(); setRunning(false); trainEpoch(); maybeSnapshot(); evaluate(); updateStats(); flash("One round of learning"); });
  document.getElementById("reset").addEventListener("click", () => {
    buildNet(); evaluate();
    event("I forgot everything! My knobs are random again. Watch me learn from scratch.");
  });

  function refreshCounts() {
    document.getElementById("layers").textContent = state.layers;
    document.getElementById("neurons").textContent = state.neurons;
    document.getElementById("n-").disabled = state.layers === 0 || state.neurons <= 1;
    document.getElementById("n+").disabled = state.layers === 0 || state.neurons >= 8;
    document.getElementById("l-").disabled = state.layers <= 0;
    document.getElementById("l+").disabled = state.layers >= 3;
  }
  function changeNet(dl, dn) {
    state.layers = ML.clamp(state.layers + dl, 0, 3);
    state.neurons = ML.clamp(state.neurons + dn, 1, 8);
    buildNet(); refreshCounts(); evaluate();
    if (state.layers === 0) event("Now I have <b>no thinking neurons</b>. I can only draw one straight line between the colors.");
    else event(`Now my brain has <b>${state.layers}</b> thinking layer${state.layers > 1 ? "s" : ""} with <b>${state.neurons}</b> neuron${state.neurons > 1 ? "s" : ""} each. Each neuron draws a line — together they can make curves!`);
    setRunning(true);
  }
  document.getElementById("l+").addEventListener("click", () => changeNet(1, 0));
  document.getElementById("l-").addEventListener("click", () => changeNet(-1, 0));
  document.getElementById("n+").addEventListener("click", () => changeNet(0, 1));
  document.getElementById("n-").addEventListener("click", () => changeNet(0, -1));

  ML.bindRange("#lr", (v) => ["0.003", "0.01", "0.03", "0.1", "0.3", "1", "3"][v], (v) => (state.lr = LRS[v]));

  function seg(id, attr, fn) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      fn(+b.dataset[attr]);
    }));
  }
  seg("speed", "s", (v) => (state.speed = v));
  seg("brush", "b", (v) => (state.brush = v));

  const presetText = {
    blobs: "Two piles of dots. Easy peasy — even a straight line can split these!",
    circle: "Blue dots in the middle, red dots all around. Can a straight line catch them? Let's see…",
    xor: "Blue in two corners, red in the other two. Tricky! One straight line won't do it.",
    spiral: "The spiral! This is a real brain-twister. I'll need lots of neurons and layers.",
  };
  document.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
    preset(b.dataset.p); buildNet(); evaluate(); setRunning(true);
    event(presetText[b.dataset.p], 4000);
  }));
  document.getElementById("clear").addEventListener("click", () => { points = []; buildNet(); evaluate(); event("All clean! Tap the board to add new dots."); });

  // painting on the board
  let painting = false, lastAdd = 0;
  function paintAt(e) {
    const pt = ML.canvasPoint(board, e, BW, BH);
    const x = pt.x / BW * 2 - 1, y = 1 - pt.y / BH * 2;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) return;
    if (state.brush === -1) {
      const before = points.length;
      points = points.filter((p) => Math.hypot(p.x - x, p.y - y) > 0.07);
      if (points.length !== before) state.solved = false;
    } else {
      const now = performance.now();
      if (now - lastAdd < 60) return;
      lastAdd = now;
      points.push({ x, y, c: state.brush });
      state.solved = false;
      const p = predict(x, y);
      const ok = (p > 0.5 ? 1 : 0) === state.brush;
      if (points.length % 3 === 1)
        event(ok ? `A new ${state.brush ? "blue" : "red"} dot! It already lands on my ${state.brush ? "blue" : "red"} paint.` :
          `A ${state.brush ? "blue" : "red"} dot on my ${state.brush ? "red" : "blue"} paint! Oops — I'll have to fix that.`, 2500);
    }
  }
  board.addEventListener("pointerdown", (e) => {
    const pt = ML.canvasPoint(board, e, BW, BH);
    state.probe = { x: pt.x / BW * 2 - 1, y: 1 - pt.y / BH * 2 };
    painting = true; board.setPointerCapture(e.pointerId); paintAt(e); });
  board.addEventListener("pointermove", (e) => {
    const pt = ML.canvasPoint(board, e, BW, BH);
    state.probe = { x: pt.x / BW * 2 - 1, y: 1 - pt.y / BH * 2 };
    if (painting) paintAt(e);
  });
  board.addEventListener("pointerup", () => (painting = false));
  board.addEventListener("pointercancel", () => (painting = false));

  // ---------- checkpoints ----------
  const CP_AT = [1, 10, 50, 200, 500, 1000, 2000, 5000, 10000];
  let cps = [], live = null;
  const cpHost = document.getElementById("cps");
  const liveBtn = document.getElementById("live");
  function cloneNet(n) { return { sizes: n.sizes.slice(), W: n.W.map((Wl) => Wl.map((r) => Float64Array.from(r))), B: n.B.map((b) => Float64Array.from(b)) }; }
  function thumb() {
    const S = 44, c = document.createElement("canvas");
    c.width = S; c.height = S;
    const g = c.getContext("2d"), im = g.createImageData(S, S);
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) shade(predict((i + 0.5) / S * 2 - 1, 1 - (j + 0.5) / S * 2), im.data, (j * S + i) * 4);
    g.putImageData(im, 0, 0);
    g.fillStyle = "#fff";
    for (const p of points) {
      g.fillStyle = p.c ? colors.blueS : colors.redS;
      g.fillRect((p.x + 1) / 2 * S - 1, (1 - p.y) / 2 * S - 1, 2, 2);
    }
    return c.toDataURL();
  }
  function maybeSnapshot() {
    if (!CP_AT.includes(state.epoch) || !points.length) return;
    evaluate();
    cps.push({ epoch: state.epoch, acc: state.acc, loss: state.loss, net: cloneNet(net), img: thumb() });
    renderCps();
  }
  function resetCps() { cps = []; live = null; if (liveBtn) liveBtn.classList.add("hidden"); renderCps(); }
  function renderCps(active = -1) {
    if (!cpHost) return;
    if (!cps.length) { cpHost.innerHTML = '<p class="muted cp-empty">Snapshots appear at round 1, 10, 50, 200, 500…</p>'; return; }
    cpHost.innerHTML = cps.map((c, i) => `
      <button class="ckpt ${i === active ? "on" : ""}" data-i="${i}">
        <img src="${c.img}" alt="Brain at round ${c.epoch}">
        <b class="t">Round ${c.epoch}</b>
        <div class="m">${Math.round(c.acc * 100)}% right</div>
      </button>`).join("");
    cpHost.querySelectorAll(".ckpt").forEach((el) => el.addEventListener("click", () => preview(+el.dataset.i)));
  }
  function preview(i) {
    const c = cps[i];
    if (!live) live = { net, epoch: state.epoch, hist: state.lossHist, running: state.running };
    net = cloneNet(c.net);
    state.epoch = c.epoch;
    state.lossHist = live.hist.slice(0, 0);
    playBtn.innerHTML = ML.icon("play") + " Back to live";
    liveBtn.classList.remove("hidden");
    renderCps(i);
    event(`Time travel! This is my brain at <b>round ${c.epoch}</b>, when I got <b>${Math.round(c.acc * 100)}%</b> of the dots right. Compare it with the other snapshots!`, 6000);
  }
  function goLive() {
    if (!live) return;
    net = live.net; state.epoch = live.epoch; state.lossHist = live.hist;
    const wasRunning = live.running;
    live = null;
    liveBtn.classList.add("hidden");
    renderCps();
    setRunning(wasRunning);
  }
  liveBtn.addEventListener("click", () => { goLive(); event("Back to now! Learning continues."); });

  // ---------- what's happening inside ----------
  const DIRS = ["the right", "the top-right", "the top", "the top-left", "the left", "the bottom-left", "the bottom", "the bottom-right"];
  function likes(l, j) {
    if (l !== 0) return "a curvy mix";
    const w = net.W[0][j];
    const a = Math.atan2(w[1], w[0]);
    return DIRS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
  }
  function updateInside() {
    const host = document.getElementById("inside");
    if (!state.probe || !host) return;
    const { x, y } = state.probe;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) return;
    const acts = forward(x, y);
    const p = acts[acts.length - 1][0];
    const last = net.W.length - 1;
    const sw = (v) => `<span class="sw" style="background:${v > 0 ? colors.blueS : colors.redS};opacity:${0.25 + Math.min(1, Math.abs(v)) * 0.75}"></span>`;
    let h = `<div class="ln"><span>Spot</span><span class="eq">left-right ${x.toFixed(2)}, up-down ${y.toFixed(2)}</span></div>`;
    if (last === 0) {
      const w = net.W[0][0];
      h += `<div class="ln">${sw(w[0] * x)}<span>left-right × knob</span><span class="eq">${(w[0] * x).toFixed(2)}</span></div>`;
      h += `<div class="ln">${sw(w[1] * y)}<span>up-down × knob</span><span class="eq">${(w[1] * y).toFixed(2)}</span></div>`;
    } else {
      // the last hidden layer's neurons, ranked by how hard they push the answer
      const hid = acts[last];
      const contrib = hid.map((a, j) => ({ j, a, c: a * net.W[last][0][j] }));
      contrib.sort((u, v) => Math.abs(v.c) - Math.abs(u.c));
      contrib.slice(0, 4).forEach(({ j, a, c }) => {
        h += `<div class="ln">${sw(c)}<span>Neuron ${j + 1} says ${a.toFixed(1)}${last === 1 ? ` <span class="muted">(likes ${likes(0, j)})</span>` : ""}</span><span class="eq">${c > 0 ? "→ blue" : "→ red"}</span></div>`;
      });
      if (contrib.length > 4) h += `<div class="ln muted"><span>…and ${contrib.length - 4} quieter neurons</span></div>`;
    }
    const blue = p > 0.5;
    h += `<div class="ln total">${sw(p - 0.5)}<span>Answer</span><span class="eq">${blue ? "blue" : "red"} ${Math.round((blue ? p : 1 - p) * 100)}%</span></div>`;
    host.innerHTML = h;
  }

  // ---------- main loop ----------
  let frame = 0;
  function loop(t) {
    if (state.running && points.length && !live) {
      state.budget += state.speed;
      while (state.budget >= 1) { trainEpoch(); state.budget--; maybeSnapshot(); }
      // runaway learning rate: weights blew up — start over quietly
      if (!isFinite(predict(0.1, 0.2))) { buildNet(); event("Whoa! My knobs went wild and broke! Steps were too giant. I started over — try a smaller step size."); }
    }
    evaluate();
    drawBoard(t);
    if (frame % 4 === 0) drawNet();
    if (frame % 6 === 0) updateInside();
    drawSpark();
    updateStats();
    narrate(t);
    frame++;
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", sizeSpark);
  sizeSpark();
  preset("circle");
  buildNet();
  refreshCounts();
  requestAnimationFrame(loop);
  setTimeout(() => event("Here's a circle: <b style=\"color:var(--sup)\">blue</b> in the middle, <b style=\"color:var(--bad)\">red</b> around it. I'm starting with <b>no thinking neurons</b>, so I can only draw a straight line. Watch me try…", 5000), 600);
})();
