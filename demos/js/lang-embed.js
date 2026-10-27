// Word Map — UI: drag-your-guess map, live skip-gram training, chart, checkpoints, word maths, challenges.
(function () {
  const E = window.Embed;
  const W = 680, H = 460, PAD = 44, CW = 680, CH = 150;
  const RUN_TOTAL = 8000, SEED = 1, FEW = 500;
  const CKPT_AT = [0, 300, 1000, 2000, 4000, 8000];
  const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const map = ML.setupCanvas(document.getElementById("map"), W, H);
  const chart = ML.setupCanvas(document.getElementById("chart"), CW, CH);
  const mapEl = document.getElementById("map");
  const $ = (id) => document.getElementById(id);
  const BASE_SENTS = E.makeSentences(2800, 7);

  const state = {
    m: E.newModel(SEED), corpus: BASE_SENTS, extras: [], runDone: 0, limit: RUN_TOTAL,
    xBase: 0, run: 0, hist: [], marks: [], ckpts: [], view: null,
    training: false, speed: 45, tasks: [], said: {}, acc: null, loss: null,
    user: {}, guess: null, revealed: false, sel: null, math: null, tgtPrev: null,
  };
  const disp = {}, tgt = {};
  const mapWords = () => E.CONTENT.concat(state.extras);
  const totalRead = () => state.xBase + state.runDone;
  const gcol = (w) => (w in E.GROUP_OF && state.revealed ? E.GROUPS[E.GROUP_OF[w]].color : null);

  // ---------- your guess: scattered start (jittered grid, seeded) ----------
  (function scatter() {
    const r = E.rng(11), cells = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) cells.push([i, j]);
    for (let i = cells.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [cells[i], cells[k]] = [cells[k], cells[i]]; }
    E.CONTENT.forEach((w, i) => {
      const [c, rr] = cells[i];
      const x = -0.92 + (c + 0.2 + 0.6 * r()) * (1.84 / 8), y = -0.88 + (rr + 0.2 + 0.6 * r()) * (1.76 / 6);
      state.user[w] = [x, y];
      disp[w] = [x, y]; tgt[w] = [x, y];
    });
  })();

  const px = (p) => [PAD + ((p[0] + 1) / 2) * (W - 2 * PAD), PAD * 0.7 + ((p[1] + 1) / 2) * (H - PAD * 1.4)];
  const unpx = (x, y) => [((x - PAD) / (W - 2 * PAD)) * 2 - 1, ((y - PAD * 0.7) / (H - PAD * 1.4)) * 2 - 1];

  // ---------- training ----------
  function canDrag() { return totalRead() === 0 && !state.hist.length && !state.training && !state.view; }
  function say(k, html) { if (!state.said[k]) { state.said[k] = 1; ML.say(html); } }
  function record(first) {
    const m = state.m;
    state.acc = E.neighbourAccuracy(m);
    state.loss = first ? 6 * Math.LN2 : m.lossN ? m.loss / m.lossN : state.loss;
    m.loss = 0; m.lossN = 0;
    state.hist.push({ run: state.run, x: totalRead(), acc: state.acc, loss: state.loss });
    narrate();
    renderStats(); renderInside();
  }
  function trainFrame() {
    const n = state.speed;
    const lim = Math.min(state.limit, RUN_TOTAL);
    for (let i = 0; i < n && state.runDone < lim; i++) {
      E.trainSentence(state.m, state.corpus[state.runDone % state.corpus.length], E.lrAt(state.runDone, RUN_TOTAL));
      state.runDone++;
      if (state.runDone % 100 === 0) record(false);
      if (CKPT_AT.includes(state.runDone)) addCkpt();
    }
    if (state.runDone >= lim) finish();
  }
  function finish() {
    state.training = false;
    record(false);
    syncTrain();
    const a = Math.round(state.acc * 100);
    if (state.limit < RUN_TOTAL) ML.say(`I stopped after only <b>${state.runDone}</b> sentences. Map score <b>${a}%</b>. ${state.acc < 0.6 ? "That's not enough reading: the groups never formed." : "Not bad for so little reading!"} Press <b>Keep reading</b> to let me finish, or <b>Forget all</b> to start over.`);
    else if (state.corpus !== BASE_SENTS) ML.say(`Same words, but the sentences were <b>jumbled</b>. My map score is only <b>${a}%</b>, close to random. Without a real context, words have no meaning to me.`);
    else {
      const you = state.guess == null ? "" : ` You scored <b>${Math.round(state.guess * 100)}%</b>.`;
      ML.say(`Done! My map score is <b>${a}%</b>.${you} Tap a word, or try some <b>word maths</b>.`);
      if (state.acc > 0.9) ML.confetti();
    }
  }
  function narrate() {
    if (!state.training) return;
    const a = state.acc, jumbled = state.corpus !== BASE_SENTS;
    if (state.runDone >= 100) say("s", jumbled ? `These sentences are all jumbled. Let's see what I can learn from them...` : `For every word I guess its neighbours. Right guess: pull closer. Wrong: push apart. Watch the dots!`);
    if (!jumbled && a > 0.5) say("h", `Groups are forming! Words that live in the same kinds of sentences are huddling together.`);
    if (!jumbled && a > 0.85) say("m", `Almost there. Animals with animals, food with food. Nobody told me which words are which!`);
  }

  // ---------- map positions ----------
  function relax(p, words) {
    for (let it = 0; it < 14; it++)
      for (let i = 0; i < words.length; i++)
        for (let j = i + 1; j < words.length; j++) {
          const a = p[words[i]], b = p[words[j]];
          let dx = b[0] - a[0], dy = b[1] - a[1];
          const d = Math.hypot(dx * 0.45, dy) || 1e-6, min = 0.085;
          if (d < min) { const k = ((min - d) / d) * 0.5; a[0] -= dx * k; a[1] -= dy * k; b[0] += dx * k; b[1] += dy * k; }
        }
    return p;
  }
  function livePositions() {
    const words = mapWords();
    const p = E.pca2(state.m, words, state.tgtPrev);
    state.tgtPrev = p;
    const q = {}; words.forEach((w) => (q[w] = p[w].slice()));
    return relax(q, words);
  }
  function updateTargets() {
    const words = mapWords();
    if (state.view) { words.forEach((w) => { if (state.view.pos[w]) tgt[w] = state.view.pos[w]; }); return; }
    if (canDrag()) { words.forEach((w) => { if (state.user[w]) tgt[w] = state.user[w]; }); return; }
    const p = livePositions();
    words.forEach((w) => (tgt[w] = p[w]));
  }

  // ---------- drawing ----------
  function draw() {
    const c = map.ctx;
    c.clearRect(0, 0, W, H);
    const ink = ML.cssVar("--ink"), card = ML.cssVar("--card"), muted = ML.cssVar("--muted");
    const words = mapWords();
    const live = !canDrag() && !state.view;
    // group names once the map has formed
    if (state.revealed && state.acc != null && state.acc > 0.7 && live) {
      E.GROUPS.forEach((g) => {
        let x = 0, y = 0, top = 1e9; g.words.forEach((w) => { const q = px(disp[w]); x += q[0]; y += q[1]; top = Math.min(top, q[1]); });
        x /= g.words.length; y /= g.words.length;
        c.globalAlpha = 0.13; c.fillStyle = g.color; c.beginPath(); c.ellipse(x, y, 62, 40, 0, 0, 7); c.fill();
        c.globalAlpha = 0.5; c.fillStyle = g.color; c.font = "800 15px Fredoka, Nunito, sans-serif"; c.textAlign = "center";
        c.fillText(g.name, x, Math.max(14, top - 16)); c.globalAlpha = 1;
      });
    }
    // word-maths arrows
    const mt = state.math;
    if (mt && disp[mt.a] && disp[mt.res]) {
      c.save(); c.setLineDash([6, 5]); c.lineWidth = 2.5; c.strokeStyle = ML.cssVar("--accent"); c.lineCap = "round";
      arrow(c, px(disp[mt.b]), px(disp[mt.a]));
      arrow(c, px(disp[mt.c]), px(disp[mt.res]));
      c.restore();
    }
    c.font = "700 12.5px Nunito, sans-serif"; c.textAlign = "left"; c.textBaseline = "middle";
    const order = words.slice().sort((a, b) => (a === state.sel) - (b === state.sel));
    for (const w of order) {
      const [x, y] = px(disp[w]);
      const col = gcol(w) || (w in E.GROUP_OF ? muted : ML.cssVar("--accent"));
      const isSel = w === state.sel, isNew = !(w in E.GROUP_OF);
      const hi = mt && (w === mt.res || w === mt.a || w === mt.b || w === mt.c);
      const tw = c.measureText(w).width;
      c.fillStyle = card; c.globalAlpha = 0.82; roundRect(c, x + 7, y - 9, tw + 8, 18, 7); c.fill(); c.globalAlpha = 1;
      c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = isSel || hi || isNew ? 3 : 1.5;
      c.beginPath(); c.arc(x, y, isSel ? 8 : 6, 0, 7); c.fill(); c.stroke();
      c.fillStyle = ink; c.fillText(w, x + 11, y + 0.5);
    }
  }
  function arrow(c, a, b) {
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    c.setLineDash([]); c.beginPath();
    c.moveTo(b[0], b[1]); c.lineTo(b[0] - 11 * Math.cos(ang - 0.4), b[1] - 11 * Math.sin(ang - 0.4));
    c.moveTo(b[0], b[1]); c.lineTo(b[0] - 11 * Math.cos(ang + 0.4), b[1] - 11 * Math.sin(ang + 0.4)); c.stroke();
    c.setLineDash([6, 5]);
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  function drawChart() {
    const c = chart.ctx;
    c.clearRect(0, 0, CW, CH);
    const L = 34, R = 10, T = 12, B = 22, w = CW - L - R, h = CH - T - B;
    const xmax = Math.max(RUN_TOTAL, totalRead());
    const X = (x) => L + (x / xmax) * w, Y = (v) => T + (1 - v) * h;
    const line = ML.cssVar("--line"), muted = ML.cssVar("--muted");
    c.font = "700 11px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right"; c.textBaseline = "middle";
    [0, 0.5, 1].forEach((v) => { c.strokeStyle = line; c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + w, Y(v)); c.stroke(); c.fillText(Math.round(v * 100) + "%", L - 5, Y(v)); });
    c.textBaseline = "top";
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => { c.textAlign = f === 1 ? "right" : "center"; c.fillText(Math.round(f * xmax), X(f * xmax), CH - B + 6); });
    // chance level
    c.setLineDash([2, 4]); c.strokeStyle = muted; c.beginPath(); c.moveTo(L, Y(0.19)); c.lineTo(L + w, Y(0.19)); c.stroke(); c.setLineDash([]);
    if (state.guess != null) { c.strokeStyle = ML.cssVar("--warn"); c.lineWidth = 3; c.setLineDash([8, 5]); c.beginPath(); c.moveTo(L, Y(state.guess)); c.lineTo(L + w, Y(state.guess)); c.stroke(); c.setLineDash([]); }
    state.marks.forEach((mk) => {
      c.strokeStyle = ML.cssVar("--bad"); c.lineWidth = 2; c.beginPath(); c.moveTo(X(mk.x), T); c.lineTo(X(mk.x), T + h); c.stroke();
      c.fillStyle = ML.cssVar("--bad"); c.textAlign = X(mk.x) > CW * 0.7 ? "right" : "left"; c.textBaseline = "top";
      c.fillText(mk.label, X(mk.x) + (c.textAlign === "left" ? 4 : -4), T + 1);
    });
    const runs = {};
    state.hist.forEach((p) => (runs[p.run] = runs[p.run] || []).push(p));
    Object.values(runs).forEach((pts) => {
      for (const [key, col, f] of [["loss", muted, (v) => Math.min(1, v / 4.4)], ["acc", ML.cssVar("--accent"), (v) => v]]) {
        c.strokeStyle = col; c.lineWidth = key === "acc" ? 3.5 : 2; c.lineJoin = "round"; c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(f(p[key]))) : c.moveTo(X(p.x), Y(f(p[key])))));
        c.stroke();
      }
    });
  }

  // ---------- panels ----------
  function renderStats() {
    $("st-sent").textContent = totalRead();
    $("st-acc").textContent = state.acc == null ? "–" : Math.round(state.acc * 100) + "%";
    $("st-you").textContent = state.guess == null ? "–" : Math.round(state.guess * 100) + "%";
    $("st-loss").textContent = state.loss == null ? "–" : state.loss.toFixed(2);
    $("map-title").textContent = state.view ? "Robo's map after " + state.view.n + " sentences" : canDrag() ? "Your guess" : "Robo's map";
    mapEl.classList.toggle("locked", !canDrag());
    renderLegend();
  }
  function renderLegend() {
    $("legend").innerHTML = state.revealed ? E.GROUPS.map((g) => `<span><i style="background:${g.color}"></i>${g.name}</span>`).join("") : `<span class="muted">Colours show up after you press Check or let Robo learn.</span>`;
  }
  const ctxCache = new Map();
  function contexts(w) {
    const key = w + "|" + (state.corpus === BASE_SENTS ? "b" : "j") + state.runDone;
    const cached = ctxCache.get(w);
    if (cached && cached.k === key) return cached.v;
    const cnt = {};
    for (const s of state.corpus) for (let i = 0; i < s.length; i++) if (s[i] === w)
      for (let o = -2; o <= 2; o++) { const t = s[i + o]; if (o && t) cnt[t] = (cnt[t] || 0) + 1; }
    ctxCache.set(w, { k: key, v: cnt });
    return cnt;
  }
  const STOP = new Set(["the", "a", "and", "some", "to", "in", "on", "with", "very"]);
  function renderInside() {
    const w = state.sel, host = $("inside");
    if (!w) { host.innerHTML = `<span class="muted">Tap any word on the map.</span>`; return; }
    const m = state.m, pool = mapWords();
    const nn = E.nearest(m, w, 3, pool);
    const v = E.vec(m, w), mx = Math.max(...v.map(Math.abs)) || 1;
    const bars = Array.from(v, (x) => `<i style="height:${Math.max(6, Math.abs(x) / mx * 100)}%;background:${x >= 0 ? "var(--good)" : "var(--bad)"};opacity:${totalRead() ? 1 : 0.5}"></i>`).join("");
    const col = (n) => (n in E.GROUP_OF ? E.GROUPS[E.GROUP_OF[n]].color : ML.cssVar("--accent"));
    let html = `<b>${w}</b>'s 12 numbers:<div class="vec" aria-hidden="true">${bars}</div><b>3 nearest words</b> (cosine score)<div class="nb">` +
      nn.map((n) => `<div class="nb-row"><span>${n.w}</span><span class="track"><span class="fill" style="width:${Math.max(2, n.s * 100)}%;background:${state.revealed ? col(n.w) : "var(--accent)"}"></span></span><span class="n">${n.s.toFixed(2)}</span></div>`).join("") + `</div>`;
    if (!totalRead()) html += `<p class="why">Robo hasn't read anything yet, so these numbers are random and the scores mean nothing. Press <b>Robot, read &amp; learn!</b></p>`;
    else {
      const a = contexts(w), b = contexts(nn[0].w);
      const shared = Object.keys(a).filter((t) => b[t] && !STOP.has(t) && t !== w && t !== nn[0].w).sort((x, y) => Math.min(b[y], a[y]) - Math.min(b[x], a[x])).slice(0, 3);
      html += shared.length
        ? `<p class="why"><b>${w}</b> and <b>${nn[0].w}</b> are close because they keep the same company in sentences: both sit next to <b>${shared.join("</b>, <b>")}</b>.</p>`
        : `<p class="why">I can't find shared neighbours for <b>${w}</b> and <b>${nn[0].w}</b> in these sentences, so the closeness is mostly luck.</p>`;
    }
    host.innerHTML = html;
  }

  // ---------- checkpoints ----------
  function addCkpt() {
    const pos = livePositions();
    state.ckpts.push({ n: totalRead() - state.xBase, pos: Object.fromEntries(Object.entries(pos).map(([k, p]) => [k, p.slice()])), acc: state.acc == null ? E.neighbourAccuracy(state.m) : state.acc, revealed: true });
    renderCkpts();
  }
  function renderCkpts() {
    const host = $("ckpts");
    if (!state.ckpts.length) { host.innerHTML = `<span class="muted">They appear after 0, 300, 1000, 2000, 4000 and 8000 sentences.</span>`; return; }
    host.innerHTML = (state.view ? `<button class="ckpt" data-live="1" style="display:grid;place-items:center;align-content:center;gap:6px"><b>Back to live</b>${ML.icon("play")}</button>` : "") +
      state.ckpts.map((c, i) => `<button class="ckpt ${state.view === c ? "on" : ""}" data-i="${i}"><canvas width="216" height="96"></canvas><b>After ${c.n} sentences</b>Score ${Math.round(c.acc * 100)}%</button>`).join("");
    host.querySelectorAll(".ckpt[data-i]").forEach((b) => {
      const c = state.ckpts[+b.dataset.i];
      const cv = b.querySelector("canvas"), g = cv.getContext("2d");
      E.CONTENT.forEach((w) => {
        const p = c.pos[w]; if (!p) return;
        g.fillStyle = E.GROUPS[E.GROUP_OF[w]].color; g.beginPath(); g.arc(10 + (p[0] + 1) / 2 * 196, 8 + (p[1] + 1) / 2 * 80, 3.4, 0, 7); g.fill();
      });
      b.addEventListener("click", () => {
        state.training = false; state.view = c; state.revealed = true; syncTrain(); renderCkpts(); renderStats();
        ML.say(`This is my map after <b>${c.n}</b> sentences. ${c.acc < 0.4 ? "Back then it was still a jumble." : c.acc < 0.9 ? "Groups were starting to form." : "By now the groups are clear."}`);
      });
    });
    const live = host.querySelector("[data-live]");
    if (live) live.addEventListener("click", () => { state.view = null; renderCkpts(); renderStats(); });
  }

  // ---------- word maths ----------
  const PRESETS = [["king", "man", "woman", "queen"], ["prince", "boy", "girl", "princess"], ["man", "boy", "girl", "woman"], ["queen", "woman", "man", "king"]];
  function fillSelects() {
    ["m-a", "m-b", "m-c"].forEach((id, k) => {
      const s = $(id), cur = s.value || ["king", "man", "woman"][k];
      s.innerHTML = mapWords().slice().sort().map((w) => `<option>${w}</option>`).join("");
      s.value = cur;
    });
  }
  function doMath() {
    const a = $("m-a").value, b = $("m-b").value, c = $("m-c").value, out = $("math-out");
    if (!totalRead()) { out.innerHTML = `<span class="muted">Let Robo read first, then try again.</span>`; state.math = null; return; }
    const r = E.analogy(state.m, a, b, c);
    state.math = { a, b, c, res: r[0].w };
    out.innerHTML = `${a} − ${b} + ${c} ≈ <span style="color:var(--accent)">${r[0].w}</span> <small class="muted">(${r[0].s.toFixed(2)}; next: ${r[1].w}, ${r[2].w})</small>`;
    ML.say(`Start at <b>${a}</b>, take away <b>${b}</b>, add <b>${c}</b>, and the closest word is <b>${r[0].w}</b>. ${r[0].s < 0.8 ? "That's a shaky answer, my little model is not great at this yet." : "The map has directions that mean things!"}`);
  }
  $("presets").innerHTML = PRESETS.map((p, i) => `<button class="btn small" data-i="${i}">${p[0]} − ${p[1]} + ${p[2]}</button>`).join("");
  $("presets").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const p = PRESETS[+b.dataset.i]; $("m-a").value = p[0]; $("m-b").value = p[1]; $("m-c").value = p[2]; doMath();
  }));
  ["m-a", "m-b", "m-c"].forEach((id) => $(id).addEventListener("change", doMath));

  // ---------- controls ----------
  function syncTrain() {
    const done = state.runDone >= RUN_TOTAL;
    $("train").innerHTML = state.training ? `${ML.icon("pause")} Pause` : done ? `${ML.icon("check")} All read` : `${ML.icon("play")} ${state.runDone ? "Keep reading" : "Robot, read &amp; learn!"}`;
    $("train").disabled = done && !state.training;
  }
  function startTraining() {
    if (state.view) { state.view = null; renderCkpts(); }
    if (!totalRead() && !state.hist.length) {
      state.revealed = true; state.tgtPrev = Object.assign({}, state.user);
      record(true);
      addCkpt();
      ML.say(`I'm reading little sentences now. Each time I guess which words sit near each other, I nudge my numbers.`);
    }
    state.limit = RUN_TOTAL;
    state.training = true; syncTrain(); renderStats();
  }
  $("train").addEventListener("click", () => { if (state.training) { state.training = false; syncTrain(); } else startTraining(); });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));
  $("check").addEventListener("click", () => {
    state.guess = E.layoutAccuracy(state.user); state.revealed = true; renderStats();
    const g = Math.round(state.guess * 100);
    ML.say(g < 40 ? `Your map scores <b>${g}%</b>. Now the colours are on: friends are scattered! Press <b>Robot, read &amp; learn!</b> and see if I do better.`
      : `Your map scores <b>${g}%</b>. Nice, you know your words! Can I match that just by reading?`);
  });

  function newRun(opts) {
    state.xBase = totalRead(); state.run++;
    state.m = E.newModel(SEED); state.extras = []; state.runDone = 0; state.ckpts = []; state.view = null; state.said = {};
    state.corpus = opts.corpus || BASE_SENTS; state.limit = opts.limit || RUN_TOTAL; state.tasks = []; state.math = null; state.tgtPrev = null;
    state.marks.push({ x: state.xBase, label: opts.label });
    state.revealed = true; state.sel = null;
    fillSelects(); renderCkpts();
    record(true); addCkpt();
    state.training = true; syncTrain(); renderStats();
  }
  function fullReset() {
    state.m = E.newModel(SEED); state.corpus = BASE_SENTS; state.extras = []; state.runDone = 0; state.limit = RUN_TOTAL;
    state.xBase = 0; state.run = 0; state.hist = []; state.marks = []; state.ckpts = []; state.view = null; state.training = false;
    state.tasks = []; state.said = {}; state.acc = null; state.loss = null; state.sel = null; state.math = null; state.tgtPrev = null; state.revealed = false;
    $("math-out").textContent = "";
    fillSelects(); renderCkpts(); renderStats(); renderInside(); syncTrain();
    ML.say(`Back to a random map. You can drag the words again, and I've forgotten everything I read.`);
  }
  $("reset").addEventListener("click", fullReset);

  // ---------- challenges ----------
  const NW_PRESETS = {
    zebra: ["the zebra chased the cat", "a little zebra ate some carrot", "the zebra ran to the farm"],
    pizza: ["he ate a tasty pizza", "the pizza was sweet and tasty", "a cake and some pizza in the kitchen"],
    tractor: ["a big red tractor drove on the road", "the tractor was fast and big", "he drove a tractor to the shop"],
  };
  $("nw-presets").innerHTML = Object.keys(NW_PRESETS).map((k) => `<button class="btn small" data-w="${k}">${k}</button>`).join("");
  $("nw-presets").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("nw-word").value = b.dataset.w; $("nw-sents").value = NW_PRESETS[b.dataset.w].join("\n");
  }));
  $("nw-go").addEventListener("click", () => {
    const word = $("nw-word").value.trim().toLowerCase();
    if (!/^[a-z]{2,14}$/.test(word)) return ML.toast("Use one word, letters only");
    if (!totalRead()) return ML.toast("Let Robo read first, so there is a map to join");
    if (state.m.index[word] != null) return ML.toast("That word is already on the map");
    const sents = $("nw-sents").value.toLowerCase().split("\n").map((l) => l.replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean)).filter((s) => s.includes(word)).slice(0, 6);
    if (!sents.length) return ML.toast("Write a sentence that uses your new word");
    state.training = false; syncTrain(); state.view = null; renderCkpts();
    E.addWord(state.m, word); state.extras.push(word); disp[word] = [0, 0]; tgt[word] = [0, 0];
    state.marks.push({ x: totalRead(), label: "+ " + word });
    state.tasks.push({ word, sents, rounds: 120 });
    state.sel = word; fillSelects();
    ML.say(`A new word: <b>${word}</b>! I only have ${sents.length} sentence${sents.length > 1 ? "s" : ""} about it. Let's see where it settles.`);
  });
  $("chal").querySelectorAll("button[data-c]").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.c;
    if (c === "word") { $("newword").classList.toggle("open"); return; }
    if (c === "shuffle") {
      newRun({ corpus: E.shuffleWords(BASE_SENTS, 3), label: "jumbled" });
      ML.say(`I'm reading the same words again, but I <b>jumbled</b> them between sentences: "the cake drove a sleepy fox". Will I still find the groups?`);
    }
    if (c === "few") {
      newRun({ limit: FEW, label: "only " + FEW });
      ML.say(`This time I only read <b>${FEW}</b> sentences, then I stop. Is that enough?`);
    }
  }));
  function taskFrame() {
    const t = state.tasks[0];
    for (let r = 0; r < 4 && t.rounds > 0; r++, t.rounds--) for (const s of t.sents) E.trainSentence(state.m, s, 0.03);
    if (t.rounds <= 0) {
      state.tasks.shift();
      const nn = E.nearest(state.m, t.word, 3, mapWords());
      const gi = E.GROUP_OF[nn[0].w];
      ML.say(`<b>${t.word}</b> settled next to <b>${nn.map((n) => n.w).join(", ")}</b>${gi != null ? ` (the ${E.GROUPS[gi].name.toLowerCase()} group)` : ""}. It found its place just from ${t.sents.length} short sentence${t.sents.length > 1 ? "s" : ""}!`);
      renderInside();
    }
  }

  // ---------- pointer: drag your guess, tap to inspect ----------
  let drag = null;
  function hit(e) {
    const p = ML.canvasPoint(mapEl, e, W, H);
    let best = null, bd = 26;
    for (const w of mapWords()) { const q = px(disp[w]); const d = Math.hypot(q[0] + 8 - p.x, q[1] - p.y); const d2 = Math.hypot(q[0] - p.x, q[1] - p.y); const dd = Math.min(d, d2); if (dd < bd) { bd = dd; best = w; } }
    return { p, w: best };
  }
  mapEl.addEventListener("pointerdown", (e) => {
    const h = hit(e);
    if (!h.w) { state.sel = null; renderInside(); return; }
    drag = { w: h.w, x0: h.p.x, y0: h.p.y, moved: false };
    state.sel = h.w; renderInside();
    try { mapEl.setPointerCapture(e.pointerId); } catch (_) {}
  });
  mapEl.addEventListener("pointermove", (e) => {
    if (!drag || !canDrag() || !(drag.w in state.user)) return;
    const p = ML.canvasPoint(mapEl, e, W, H);
    if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 4) drag.moved = true;
    if (!drag.moved) return;
    mapEl.classList.add("drag");
    const u = unpx(p.x, p.y), q = [ML.clamp(u[0], -1.02, 1.02), ML.clamp(u[1], -1.02, 1.02)];
    state.user[drag.w] = q; disp[drag.w] = q.slice(); tgt[drag.w] = q.slice();
  });
  const endDrag = () => { drag = null; mapEl.classList.remove("drag"); };
  mapEl.addEventListener("pointerup", endDrag);
  mapEl.addEventListener("pointercancel", endDrag);

  // ---------- main loop ----------
  function frame() {
    if (state.training) trainFrame();
    if (state.tasks.length) taskFrame();
    if (!drag || !drag.moved) updateTargets();
    for (const w of mapWords()) {
      const d = disp[w], t = tgt[w]; if (!d || !t) continue;
      if (REDUCED) { d[0] = t[0]; d[1] = t[1]; } else { d[0] += (t[0] - d[0]) * 0.14; d[1] += (t[1] - d[1]) * 0.14; }
    }
    draw(); drawChart();
    requestAnimationFrame(frame);
  }
  document.addEventListener("themechange", () => { draw(); drawChart(); });

  fillSelects(); renderStats(); renderInside(); syncTrain();
  requestAnimationFrame(frame);
  window.__embed = state; // handy for poking in the console
})();
