// Where to Look — UI: spotlight game, live attention training, arcs/heatmap, challenges, checkpoints.
(function () {
  const A = window.Attend;
  const $ = (id) => document.getElementById(id);
  const pct = (x) => Math.round(x * 100);
  const MAXR = 600;
  const CKPT_AT = [0, 10, 30, 100, 250, 600];

  const train = A.makeSet(11, 600);
  const trainKeys = new Set(train.map(A.key));
  const test = A.makeSet(22, 300, trainKeys);
  const evalSet = test.slice(0, 150);
  const mkSet = (o, n, seed = 99) => { const r = A.rng(seed); return Array.from({ length: n }, () => A.makeSentence(r, o)); };

  const state = {
    brain: A.newBrain(7),
    training: false,
    speed: 0.25,
    acc: 0, // fractional rounds to run
    curve: [], // [round, acc, att]
    marks: [], // [round, ok]
    checkpoints: [],
    said: {},
    replay: null,
    dirty: true,
    sent: test[0],
    sentIdx: 0,
    asker: test[0].it,
    mask: new Set(),
    hideMode: false,
    view: "arcs",
    insideText: null,
    chal: {},
  };
  const theta = () => (state.replay ? state.replay.th : state.brain.th);

  // ---------- sentence widget: word chips + weighted arcs + bar list ----------
  function Widget(host) {
    host.innerHTML = `<div class="sw"><svg></svg><div class="chips"></div></div><div class="bars"></div>`;
    const sw = host.querySelector(".sw"), svg = host.querySelector("svg"), chips = host.querySelector(".chips"), bars = host.querySelector(".bars");
    let key = "", last = null;
    function render(o) {
      last = o;
      const s = o.s;
      const k = A.key(s);
      if (k !== key) {
        key = k;
        chips.innerHTML = s.words.map((w, i) => `<button class="wd" data-i="${i}">${w}</button>`).join("");
        chips.querySelectorAll(".wd").forEach((b) => b.addEventListener("click", () => last.onTap && last.onTap(+b.dataset.i)));
      }
      chips.querySelectorAll(".wd").forEach((b, i) => {
        const a = o.a ? o.a[i] : 0;
        b.classList.toggle("asker", i === o.asker);
        b.classList.toggle("masked", !!(o.mask && o.mask.has(i)));
        b.classList.toggle("ans", !!o.showAns && i === s.target);
        b.classList.toggle("user", !!(o.user && o.user.has(i)));
        b.style.background = a > 0.02 ? `color-mix(in srgb, ${o.color || "var(--accent)"} ${Math.round(a * 60)}%, var(--card))` : "";
        b.onclick = null;
      });
      arcs(o);
      const rows = s.words.map((w, i) => {
        const a = o.a ? o.a[i] : 0, b2 = o.b ? o.b[i] : null;
        const hid = o.mask && o.mask.has(i);
        const bar = o.b
          ? `<i class="you" style="width:${pct(a)}%"></i><i class="rob" style="width:${pct(b2)}%"></i>`
          : `<i style="width:${pct(a)}%;background:${o.color || "var(--accent)"}"></i>`;
        return `<div class="br"><span class="bw">${w}${hid ? " (hidden)" : ""}</span><span class="bt">${bar}</span><b>${o.b ? pct(a) + "/" + pct(b2) : pct(a) + "%"}</b></div>`;
      });
      const tot = o.a ? o.a.reduce((x, y) => x + y, 0) : 0;
      bars.innerHTML = rows.join("") + (o.b ? `<div class="tot">orange = you, purple = Robo (each adds up to 100%)</div>` : `<div class="tot">All the light adds up to ${pct(tot)}%</div>`);
    }
    function arcs(o) {
      const sr = sw.getBoundingClientRect();
      const els = chips.querySelectorAll(".wd");
      if (!o.a || !els.length) { svg.innerHTML = ""; return; }
      const pos = [...els].map((e) => { const r = e.getBoundingClientRect(); return [r.left - sr.left + r.width / 2, r.top - sr.top]; });
      const col = o.color || "var(--accent)";
      let h = "";
      o.a.forEach((a, j) => {
        if (j === o.asker || a < 0.01) return;
        const [x1, y1] = pos[o.asker], [x2, y2] = pos[j];
        const lift = 24 + Math.min(70, Math.abs(x2 - x1) * 0.28);
        h += `<path d="M${x1} ${y1} C${x1} ${y1 - lift},${x2} ${y2 - lift},${x2} ${y2}" stroke="${col}" stroke-width="${(1 + a * 11).toFixed(1)}" opacity="${(0.2 + 0.8 * Math.min(1, a * 1.6)).toFixed(2)}"/>`;
      });
      svg.innerHTML = h;
    }
    window.addEventListener("resize", () => last && arcs(last));
    return { render, redraw: () => last && arcs(last) };
  }

  // ---------- Play: you are the spotlight ----------
  const PLAN = [
    { kind: "chase", distractor: false, subject: true },
    { kind: "chase", distractor: false, subject: false },
    { kind: "size", adj: "big" },
    { kind: "size", adj: "small" },
    { kind: "chase", distractor: true, subject: false },
    { kind: "chase", distractor: true, subject: true },
  ];
  const playW = Widget($("play-sw"));
  const play = { round: 0, set: [], picks: new Set(), locked: false, you: 0, robo: 0, seed: 5 };
  function newPlay() {
    const r = A.rng(play.seed++);
    play.set = PLAN.map((p) => A.makeSentence(r, p));
    Object.assign(play, { round: 0, you: 0, robo: 0 });
    loadRound();
  }
  function loadRound() {
    play.picks = new Set();
    play.locked = false;
    $("play-res").textContent = "";
    $("lock").style.display = "";
    $("pnext").style.display = "none";
    $("play-score").textContent = `Round ${play.round + 1} of ${PLAN.length}`;
    drawPlay();
  }
  function drawPlay() {
    const s = play.set[play.round];
    const n = play.picks.size;
    const a = new Array(s.words.length).fill(0);
    play.picks.forEach((i) => (a[i] = 1 / n));
    $("lock").disabled = play.locked || n === 0;
    if (!play.locked) {
      playW.render({ s, asker: s.it, a: n ? a : null, color: "var(--warn)", user: play.picks, onTap: (i) => {
        if (i === s.it) return;
        if (play.picks.has(i)) play.picks.delete(i);
        else { if (play.picks.size >= 2) play.picks.delete([...play.picks][0]); play.picks.add(i); }
        drawPlay();
      } });
    } else {
      const g = A.forward(theta(), s);
      playW.render({ s, asker: s.it, a, b: g.a, color: "var(--warn)", user: play.picks, showAns: true });
    }
  }
  $("lock").addEventListener("click", () => {
    const s = play.set[play.round];
    if (!play.picks.size) return;
    play.locked = true;
    const got = play.picks.has(s.target) ? 1 / play.picks.size : 0;
    const g = A.forward(theta(), s);
    const rg = A.guess(theta(), s).best;
    play.you += got;
    play.robo += rg === s.target ? 1 : 0;
    const why = s.words[s.adj];
    $("play-res").innerHTML = `${got === 1 ? "Spot on!" : got > 0 ? "Half right, nice hedging." : "Not this time."} <b>${s.words[s.target]}</b> is the one that was <b>${why}</b>${s.words[s.adj - 1] === "too" ? " (too " + why + ")" : ""}. Robo put <b>${pct(g.a[s.target])}%</b> of its spotlight there${state.brain.rounds ? "" : " (it hasn't trained yet, so that's a guess)"}.`;
    $("lock").style.display = "none";
    const last = play.round === PLAN.length - 1;
    $("pnext").style.display = "";
    $("pnext").innerHTML = last ? `${ML.icon("reset")} Play again` : `${ML.icon("play")} Next sentence`;
    drawPlay();
    if (last) {
      const msg = `You scored <b>${(Math.round(play.you * 2) / 2)}/${PLAN.length}</b>. Robo got <b>${play.robo}/${PLAN.length}</b>${state.brain.rounds < 50 ? ". Train Robo below, then play again to see it catch up!" : "."}`;
      $("play-res").innerHTML += `<br>${msg}`;
      if (play.you >= 5) ML.confetti();
    }
  });
  $("pnext").addEventListener("click", () => {
    if (play.round === PLAN.length - 1) newPlay();
    else { play.round++; loadRound(); }
  });

  // ---------- Watch: arcs / heatmap ----------
  const watchW = Widget($("watch-sw"));
  const heat = ML.setupCanvas($("heat"), 640, 360);
  const chart = ML.setupCanvas($("chart"), 640, 150);

  function setSentence(s) {
    state.sent = s;
    state.asker = s.it;
    state.mask = new Set();
    state.dirty = true;
  }
  function tapWatch(i) {
    if (state.hideMode) {
      if (state.mask.has(i)) state.mask.delete(i); else state.mask.add(i);
      state.mask.delete(state.asker);
    } else state.asker = i;
    state.dirty = true;
  }
  function attention(s, asker, mask) {
    return A.forward(theta(), s, asker, mask).a;
  }
  function renderWatch() {
    const s = state.sent;
    const a = attention(s, state.asker, state.mask);
    watchW.render({ s, asker: state.asker, a, mask: state.mask, showAns: false, onTap: tapWatch });
    if (state.view === "heat") drawHeat(s);
    narrate(s, a);
  }
  function drawHeat(s) {
    const c = heat.ctx, n = s.words.length;
    c.clearRect(0, 0, 640, 360);
    c.fillStyle = ML.cssVar("--canvas-bg");
    c.fillRect(0, 0, 640, 360);
    const L = 84, T = 78, cs = Math.min(30, (640 - L - 10) / n, (360 - T - 10) / n);
    c.font = "800 12px Nunito, sans-serif";
    c.fillStyle = ML.cssVar("--ink");
    c.textAlign = "center";
    c.fillText("Words answering  →", L + (n * cs) / 2, 14);
    c.save(); c.translate(12, T + (n * cs) / 2); c.rotate(-Math.PI / 2); c.fillText("Words asking", 0, 0); c.restore();
    const acc = ML.cssVar("--accent");
    for (let i = 0; i < n; i++) {
      const a = attention(s, i, state.mask);
      c.textAlign = "right";
      c.fillStyle = i === state.asker ? acc : ML.cssVar("--ink-2");
      c.fillText(s.words[i], L - 6, T + i * cs + cs * 0.65);
      for (let j = 0; j < n; j++) {
        c.fillStyle = acc;
        c.globalAlpha = 0.06 + 0.94 * a[j];
        c.fillRect(L + j * cs + 1, T + i * cs + 1, cs - 2, cs - 2);
        c.globalAlpha = 1;
      }
      if (i === state.asker) { c.strokeStyle = acc; c.lineWidth = 2; c.strokeRect(L, T + i * cs, n * cs, cs); }
    }
    for (let j = 0; j < n; j++) {
      c.save(); c.translate(L + j * cs + cs / 2, T - 6); c.rotate(-Math.PI / 4);
      c.textAlign = "left"; c.fillStyle = j === s.target ? ML.cssVar("--good") : ML.cssVar("--ink-2");
      c.fillText(s.words[j], 0, 0); c.restore();
    }
    c.fillStyle = ML.cssVar("--muted"); c.textAlign = "left"; c.font = "700 11px Nunito, sans-serif";
    c.fillText("Darker = more attention. Tap a word above to pick which row is outlined.", 6, 352);
  }

  function narrate(s, a) {
    const w = s.words, asker = state.asker;
    const top = [...a.keys()].filter((j) => j !== asker && a[j] > 0).sort((x, y) => a[y] - a[x]).slice(0, 2);
    const tag = (j) => `<b>[${w[j]}]</b> ${pct(a[j])}%`;
    const hid = [...state.mask].map((j) => `[${w[j]}]`);
    const html = [];
    if (state.replay) html.push(`<div>${ML.icon("flag")} Brain after <b>${state.replay.rounds}</b> rounds. <a href="#" id="live-back">Back to live</a></div>`);
    if (asker === s.it) {
      const g = A.guess(theta(), s, state.mask);
      html.push(`<div>${ML.icon("chat")} <b>it</b> reads the clue <b>[${w[s.adj]}]</b> and asks: "who is that?"</div>`);
      html.push(`<div class="arrow">${ML.icon("arrow-down")}</div>`);
      html.push(`<div>${ML.icon("eye")} Spotlight: ${top.map(tag).join(" and ")}.</div>`);
      html.push(`<div class="arrow">${ML.icon("arrow-down")}</div>`);
      const right = g.best === s.target;
      html.push(`<div>${ML.icon("target")} Robo thinks it is <b>${w[g.best]}</b>. ${right ? `<span style="color:var(--good)">Correct.</span>` : `The answer is <b>${w[s.target]}</b>.`}${hid.length ? ` Hidden: ${hid.join(", ")}.` : ""}</div>`);
      html.push(`<div class="muted" style="font-weight:600">${a[s.target] < 0.2 && !state.mask.size ? "Light is spread thin: Robo hasn't learned the clue words yet." : a[s.target] > 0.8 ? "Almost all the light is on the right noun." : state.mask.has(s.target) ? "The right noun is covered, so Robo has to use another word." : "Getting brighter on the right noun."}</div>`);
    } else {
      html.push(`<div>${ML.icon("chat")} <b>${w[asker]}</b> looks at ${top.map(tag).join(" and ")}.</div>`);
      html.push(`<div class="muted" style="font-weight:600">Only <b>it</b> was graded while training, so other words' spotlights are mostly random. Tap <b>it</b> to see the trained one.</div>`);
    }
    const nh = html.join("");
    if (nh !== state.insideText) {
      state.insideText = nh;
      $("inside").innerHTML = nh;
      const b = $("live-back");
      if (b) b.addEventListener("click", (e) => { e.preventDefault(); state.replay = null; renderCkpts(); state.dirty = true; });
    }
    $("watch-note").innerHTML = state.hideMode ? `Hide mode is on: tap words to cover or uncover them.` : `Tap any word to see where it looks. The orange-ringed word is the one asking.`;
  }

  // ---------- training ----------
  function runRounds(k) {
    for (let i = 0; i < k; i++) {
      A.trainRound(state.brain, train);
      const r = state.brain.rounds;
      if (r % 5 === 0) { const e = A.evaluate(state.brain.th, evalSet); state.curve.push([r, e.acc, e.att]); }
      if (CKPT_AT.includes(r)) addCkpt();
      if (r >= MAXR) { state.training = false; syncTrain(); break; }
    }
    state.dirty = true;
    story();
  }
  function story() {
    const r = state.brain.rounds, last = state.curve[state.curve.length - 1];
    if (!last) return;
    const say = (k, h) => { if (!state.said[k]) { state.said[k] = 1; ML.say(h); } };
    if (r >= 5) say("a", `Right now my spotlight is spread thin over <b>every</b> word. Only about ${pct(last[2])}% lands on the right one.`);
    if (last[2] > 0.3) say("b", `The light on the right noun is growing! I'm learning that clue words like <b>hungry</b> and <b>big</b> point to different nouns.`);
    if (last[2] > 0.7) say("c", `Now most of the light goes to the right word. Try the challenges below!`);
    if (last[1] >= 0.9 && last[2] > 0.9 && !state.said.d) { state.said.d = 1; ML.say(`I get it! <b>${pct(last[1])}%</b> right on sentences I've never seen. Tap <b>it</b> in the sentence to see my spotlight.`); ML.confetti(); }
  }
  function addCkpt() {
    const r = state.brain.rounds;
    if (state.checkpoints.some((c) => c.rounds === r)) return;
    const e = A.evaluate(state.brain.th, evalSet);
    state.checkpoints.push({ rounds: r, th: state.brain.th.slice(), acc: e.acc });
    renderCkpts();
  }
  const SHOW = test[1];
  function renderCkpts() {
    const host = $("ckpts");
    if (!state.checkpoints.length) return;
    host.innerHTML = (state.replay ? `<button class="ckpt" data-live="1" style="display:grid;place-items:center;align-content:center;gap:6px"><b>Back to live</b>${ML.icon("play")}</button>` : "") +
      state.checkpoints.map((c, i) => `<button class="ckpt ${state.replay === c ? "on" : ""}" data-i="${i}"><canvas width="216" height="96"></canvas><b>After ${c.rounds} ${c.rounds === 1 ? "round" : "rounds"}</b>Right word ${pct(c.acc)}%</button>`).join("");
    host.querySelectorAll(".ckpt[data-i]").forEach((b) => {
      const c = state.checkpoints[+b.dataset.i];
      drawMini(b.querySelector("canvas"), c.th);
      b.addEventListener("click", () => {
        state.training = false; syncTrain();
        state.replay = c; renderCkpts(); state.dirty = true;
        ML.say(`This is my brain after <b>${c.rounds}</b> rounds. ${c.acc < 0.6 ? "Back then my spotlight was almost spread out evenly." : c.acc < 0.95 ? "I was getting there, but not sure yet." : "By now I knew exactly where to look."}`);
      });
    });
    const live = host.querySelector("[data-live]");
    if (live) live.addEventListener("click", () => { state.replay = null; renderCkpts(); state.dirty = true; });
  }
  function drawMini(canvas, th) {
    const c = canvas.getContext("2d"), s = SHOW, n = s.words.length;
    const a = A.forward(th, s).a;
    c.clearRect(0, 0, 216, 96);
    const bw = 200 / n;
    a.forEach((v, i) => {
      c.fillStyle = i === s.target ? ML.cssVar("--good") : ML.cssVar("--accent");
      c.globalAlpha = i === s.target ? 1 : 0.7;
      const h = Math.max(2, v * 84);
      c.fillRect(8 + i * bw + 1, 90 - h, bw - 2, h);
    });
    c.globalAlpha = 1;
  }

  // ---------- chart ----------
  function drawChart() {
    const c = chart.ctx, W = 640, H = 150, pad = 8, ph = H - 2 * pad - 6;
    c.clearRect(0, 0, W, H);
    const X = (r) => (r / MAXR) * W, Y = (v) => H - pad - v * ph;
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.setLineDash([4, 4]);
    [0.5, 1].forEach((v) => { c.beginPath(); c.moveTo(0, Y(v)); c.lineTo(W, Y(v)); c.stroke(); });
    c.setLineDash([]);
    c.fillStyle = ML.cssVar("--muted"); c.font = "800 10px Nunito, sans-serif"; c.textAlign = "left";
    c.fillText("JUST GUESSING (1 in 2)", 4, Y(0.5) - 4);
    c.fillText("ALWAYS RIGHT", 4, 14);
    c.textAlign = "right"; c.fillText("rounds of practice →", W - 4, H - 1);
    const line = (idx, col) => {
      if (state.curve.length < 1) return;
      c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
      state.curve.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[idx])) : c.moveTo(X(p[0]), Y(p[idx]))));
      c.stroke();
    };
    line(2, ML.cssVar("--good"));
    line(1, ML.cssVar("--accent"));
    state.marks.forEach(([r, ok, t]) => {
      c.strokeStyle = ML.cssVar("--warn"); c.lineWidth = 2; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(X(r), 4); c.lineTo(X(r), H - pad); c.stroke(); c.setLineDash([]);
      c.fillStyle = ok ? ML.cssVar("--good") : ML.cssVar("--bad");
      c.beginPath(); c.arc(X(r), 10, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fff"; c.font = "800 9px Nunito, sans-serif"; c.textAlign = "center"; c.fillText(t, X(r), 13);
    });
  }

  // ---------- challenges ----------
  function chalDone(n, ok, msg) {
    const el = $("c" + n);
    el.classList.toggle("ok", ok);
    el.classList.toggle("no", !ok);
    el.querySelector(".st").textContent = ok ? "passed" : "keep training";
    $("chal-note").innerHTML = msg;
    state.marks.push([state.brain.rounds, ok, String(n)]);
    ML.say(msg);
    if (ok && !state.chal[n]) { state.chal[n] = 1; if (Object.keys(state.chal).length === 3) ML.confetti(); }
    state.dirty = true;
  }
  document.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => {
    state.replay = null; renderCkpts();
    const n = +b.dataset.c, th = state.brain.th;
    if (n === 1) {
      const set = mkSet({ kind: "chase", distractor: true }, 200);
      const e = A.evaluate(th, set);
      setSentence(set[0]);
      chalDone(n, e.acc >= 0.85, `With a sneaky extra noun, Robo picked the right animal <b>${pct(e.acc)}%</b> of the time (200 sentences). ${e.acc >= 0.85 ? "The fence, tree and rock didn't fool it." : "It's still distracted. Train longer and try again!"}`);
    } else if (n === 2) {
      const set = mkSet({}, 200, 123);
      let both = 0;
      set.forEach((s) => { const f = A.flipSentence(s); if (A.guess(th, s).best === s.target && A.guess(th, f).best === f.target) both++; });
      const s0 = state.sent;
      const base = A.fromWords(s0.words);
      const flipped = A.flipSentence(base);
      setSentence(flipped);
      const g = A.guess(th, flipped);
      chalDone(n, both / 200 >= 0.85, `The clue is now <b>${flipped.words[flipped.adj]}</b> and Robo looks at <b>${flipped.words[g.best]}</b>. Over 200 flipped pairs it got both versions right <b>${pct(both / 200)}%</b> of the time. ${both / 200 >= 0.85 ? "One word changed everything!" : "Not yet. Keep training!"}`);
    } else {
      const set = mkSet({ distractor: false }, 200, 7);
      let before = 0, after = 0;
      set.forEach((s) => {
        const other = s.cands.find((j) => j !== s.target);
        before += A.forward(th, s).a[other];
        after += A.forward(th, s, s.it, new Set([s.target])).a[other];
      });
      before /= 200; after /= 200;
      const s = state.sent.cands.length === 2 ? state.sent : set[0];
      setSentence(s);
      state.mask = new Set([s.target]);
      chalDone(n, after > before + 0.2, `I covered <b>${s.words[s.target]}</b>. The spotlight on the other noun jumped from <b>${pct(before)}%</b> to <b>${pct(after)}%</b>, because its light had to go somewhere. Try hiding the clue word too!`);
    }
  }));

  // ---------- controls ----------
  const trainBtn = $("train");
  function syncTrain() { trainBtn.innerHTML = state.training ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Robot, learn where to look!`; }
  trainBtn.addEventListener("click", () => {
    if (state.brain.rounds >= MAXR) return ML.toast("Robo has practiced enough! Press Forget all to start over.");
    state.training = !state.training;
    if (state.training) { state.replay = null; if (!state.brain.rounds) addCkpt(); renderCkpts(); }
    syncTrain();
  });
  $("reset").addEventListener("click", () => {
    state.brain = A.newBrain(7);
    Object.assign(state, { curve: [], marks: [], checkpoints: [], said: {}, replay: null, training: false, chal: {}, chalFlip: false });
    document.querySelectorAll(".chal").forEach((e) => { e.classList.remove("ok", "no"); e.querySelector(".st").textContent = "not tried"; });
    $("chal-note").textContent = "";
    $("ckpts").innerHTML = `<span class="muted">They appear after 0, 10, 30, 100, 250 and 600 rounds.</span>`;
    syncTrain();
    state.dirty = true;
    ML.say(`All forgotten! My spotlight is spread out evenly again.`);
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));
  document.querySelectorAll("#view button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#view button").forEach((x) => x.classList.toggle("on", x === b));
    state.view = b.dataset.v;
    $("heat").style.display = state.view === "heat" ? "block" : "none";
    $("watch-sw").style.display = state.view === "heat" ? "none" : "";
    state.dirty = true;
  }));
  $("hide-mode").addEventListener("click", () => {
    state.hideMode = !state.hideMode;
    $("hide-mode").classList.toggle("primary", state.hideMode);
    $("hide-mode").classList.toggle("ghost", !state.hideMode);
    state.dirty = true;
  });
  $("heat").addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint($("heat"), e, 640, 360), n = state.sent.words.length;
    const cs = Math.min(30, (640 - 84 - 10) / n, (360 - 78 - 10) / n);
    const i = Math.floor((p.y - 78) / cs);
    if (i >= 0 && i < n) { state.asker = i; state.dirty = true; }
  });
  $("newsent").addEventListener("click", () => {
    state.sentIdx = (state.sentIdx + 1) % test.length;
    setSentence(test[state.sentIdx]);
  });

  function stats() {
    $("st-ep").textContent = state.brain.rounds;
    const l = state.curve[state.curve.length - 1];
    $("st-acc").innerHTML = l ? `${pct(l[1])}<small>%</small>` : "–";
    $("st-att").innerHTML = l ? `${pct(l[2])}<small>%</small>` : "–";
  }

  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function loop() {
    if (state.training) {
      state.acc += reduce ? Math.max(state.speed, 0.5) : state.speed;
      const k = Math.floor(state.acc);
      if (k > 0) { state.acc -= k; runRounds(k); }
    }
    if (state.dirty) { state.dirty = false; renderWatch(); drawChart(); stats(); }
    requestAnimationFrame(loop);
  })();
  // first training evaluation point so the chart starts at "before"
  state.curve.push([0, ...Object.values(A.evaluate(state.brain.th, evalSet))]);
  newPlay();
  addCkpt();
})();
