// Hide and Seek — UI: the garden, the seeker's belief map, rounds, chart, checkpoints, challenges.
(function () {
  const { SPOTS, N, RANDOM_EXPECT, seeded, Seeker, playRound, BOTS, evaluate } = window.HideCore;
  const $ = (q) => document.querySelector(q);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fill in the "Meet the model" card if the catalog left it blank (common.js builds it on DOMContentLoaded).
  const MM = window.MODELS && window.MODELS["game-hide"];
  if (MM && !MM.kid) {
    MM.kid = "Robo keeps a tally of where you hide, lets old tallies fade, and checks the spots with the biggest tallies first.";
    MM.learn = ["Write down every hiding spot you use.", "Turn the tallies into chances: big tally = check first.", "Fade old tallies so a new habit shows up fast. Add a pinch of curiosity."];
  }

  const GW = 720, GH = 440;
  const garden = ML.setupCanvas($("#garden"), GW, GH);
  const chart = ML.setupCanvas($("#chart"), 640, 190);
  const ctx = garden.ctx;
  const HOME = { x: 360, y: 376 };
  const stand = (i) => ({ x: SPOTS[i].x + 40, y: SPOTS[i].y + 14 });
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const CKPT_AT = [1, 3, 5, 10, 20, 40, 80, 150, 300, 600, 1200, 2400];
  const rng = seeded((Date.now() ^ 0x5eed) >>> 0);

  const state = {
    mode: "you",
    bot: "shed",
    seeker: new Seeker({ memory: 0.85, curiosity: 0.05 }),
    plan: null, // the seeker's search order for the next round (made before you hide)
    rounds: [], // { spot, checks, who, peek }
    hist: [], // spots used, for robot hiders
    markers: [],
    playing: false,
    speed: 3,
    anim: null,
    viewing: null,
    peek: false,
    hover: -1,
    disp: new Array(N).fill(1 / N), // belief shown on the map (eases toward the real one)
    lastAct: performance.now(),
    done: { hard: false, switch: false, best: false },
    sw: null,
    tour: null,
    chartDirty: true,
    bg: null,
  };
  state.plan = state.seeker.plan(rng);

  // ---------- rounds ----------
  function startRound(spot, who) {
    if (state.anim || state.viewing || state.tour) return null;
    const peek = who === "you" && state.peek;
    const res = playRound(state.seeker, spot, { rng, order: state.plan });
    const row = { spot, checks: res.checks, who, peek, order: res.order, before: res.before.p };
    state.rounds.push(row);
    state.hist.push(spot);
    if (state.hist.length > 60) state.hist.shift();
    state.plan = state.seeker.plan(rng);
    const fast = who === "bot" && state.speed >= 60;
    if (fast) finishRound(row, true);
    else state.anim = makeTimeline(row);
    return row;
  }

  function makeTimeline(row) {
    const sp = row.who === "you" ? 1.6 : state.speed;
    const k = reduce ? 0.4 : 1;
    const segs = [{ type: "hide", dur: (650 * k) / sp }, { type: "count", dur: ((row.who === "you" ? 900 : 650) * k) / sp }];
    let pos = HOME;
    for (let i = 0; i < row.checks; i++) {
      const s = row.order[i], to = stand(s);
      const d = Math.hypot(to.x - pos.x, to.y - pos.y);
      segs.push({ type: "walk", from: pos, to, dur: reduce ? 80 / sp : (160 + d * 1.5) / sp, idx: i });
      segs.push({ type: "peek", spot: s, found: i === row.checks - 1, dur: (340 * k) / sp, idx: i });
      pos = to;
    }
    segs.push({ type: "found", dur: (row.who === "you" ? 1300 : 750) / sp, at: pos });
    let t = 0;
    segs.forEach((s) => { s.t0 = t; t += s.dur; });
    return { row, segs, total: t, start: performance.now() };
  }

  function finishRound(row, quiet) {
    const n = state.rounds.length;
    if (CKPT_AT.includes(n)) ckpts.add(makeCheckpoint(n));
    state.chartDirty = true;
    if (!quiet || n % 10 === 0) renderStats();
    if (!quiet) narrate(row);
    else if (n % 50 === 0) narrateBot();
    checkChallenges(row, quiet);
    const recent = lastAvg(10);
    if (n >= 10 && recent !== null && recent <= 2) ML.xray.offer("Robo learned the hiding habit! X-ray its map");
  }

  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const lastAvg = (k) => avg(state.rounds.slice(-k).map((r) => r.checks));
  const name = (i) => SPOTS[i].name;
  const pct = (v) => Math.round(v * 100) + "%";
  const timesLately = (spot) => state.seeker.fav[spot];

  function narrate(row) {
    const n = state.rounds.length;
    if (row.who === "bot") { if (n % 8 === 1 || state.speed <= 1) narrateBot(); return; }
    const prev = state.rounds.filter((r) => r.who === "you").slice(-2, -1)[0];
    const top = row.order[0];
    if (n === 1) return ML.say(row.checks <= 2 ? `Found you in <b>${row.checks}</b>! Lucky guess: I knew nothing about you yet. Now I've written down "<b>${name(row.spot)}</b>".` : `<b>${row.checks}</b> checks! I had no idea yet. But now I've written down "<b>${name(row.spot)}</b>" on my map.`);
    if (row.peek) return ML.say(`You peeked at my plan, so you knew my <b>${name(row.order[N - 1])}</b> check came last. Sneaky! Peeked rounds don't count for challenge 1.`);
    if (row.checks === 1) return ML.say(`Found you on my <b>first</b> check! The <b>${name(row.spot)}</b> was the brightest spot on my map. ${prev && prev.spot === row.spot ? "Same spot again?" : ""}`);
    if (prev && prev.spot === row.spot) return ML.say(`The <b>${name(row.spot)}</b> again! Its glow just got brighter. ${row.checks <= 3 ? "I'm catching on…" : "Keep it up and I'll check there first."}`);
    if (row.checks >= 8) return ML.say(`Phew, <b>${row.checks}</b> checks! I looked in the <b>${name(top)}</b> first, but you were in the <b>${name(row.spot)}</b>, nearly the dimmest spot on my map.`);
    if (row.checks >= 5) return ML.say(`<b>${row.checks}</b> checks. Good hiding! I'll remember the <b>${name(row.spot)}</b> now.`);
    ML.say(`Found you in <b>${row.checks}</b>. I've seen you near the <b>${name(row.spot)}</b> lately (my tally: ${timesLately(row.spot).toFixed(1)}).`);
  }
  function narrateBot() {
    const b = BOTS[state.bot], a = lastAvg(10);
    if (a === null) return;
    const top = state.seeker.topSpot();
    if (state.bot === "dice" && state.rounds.length > 20) ML.say(`Against the Dice roller I need about <b>${a.toFixed(1)}</b> checks. My map stays flat: no spot glows more than the others.`);
    else if (a <= 2.3) ML.say(`I've got ${b.name}'s habit! Only <b>${a.toFixed(1)}</b> checks lately. I check the <b>${name(top)}</b> first.`);
    else ML.say(`${b.name} needs <b>${a.toFixed(1)}</b> checks on average lately. I'm still learning. Brightest spot: <b>${name(top)}</b>.`);
  }

  // ---------- challenges ----------
  function markDone(id, msg, tryThis) {
    if (state.done[id]) return;
    state.done[id] = true;
    $(`#c-${id}`).classList.add("done");
    ML.toast(`${ML.icon("trophy")} Challenge done!`);
    ML.confetti(70);
    ML.say(`${msg} <b>Try this:</b> ${tryThis}`);
  }
  function checkChallenges(row, quiet) {
    // 1. Be hard to find
    const mine = state.rounds.filter((r) => r.who === "you" && !r.peek).slice(-10);
    if (!state.done.hard) {
      const a = avg(mine.map((r) => r.checks));
      $("#p-hard").textContent = mine.length < 10 ? `Fair rounds so far: ${mine.length} of 10${a !== null ? ` (average ${a.toFixed(1)} checks)` : ""}.` : `Your last 10: average ${a.toFixed(1)} checks (need 5.0).`;
      if (mine.length >= 10 && a >= 5) markDone("hard", `You're hard to find: <b>${a.toFixed(1)}</b> checks on average! My map couldn't pin you down.`, "now hide in the same spot 5 times in a row and watch it glow on my map.");
    }
    // 2. Switch habits
    const sw = state.sw;
    if (sw) {
      const n = state.rounds.length;
      if (sw.stage === "learn" && n >= sw.until) doBotSwitch();
      else if (sw.stage === "learn") $("#p-switch").textContent = `Teaching Robo the ${BOTS[state.bot].name}'s habit… ${sw.until - n} rounds to go.`;
      else if (sw.stage === "on") {
        const k = n - sw.at;
        if (k === 1) {
          sw.first = row.checks;
          if (!quiet) ML.say(`Fooled! My map still said <b>${name(sw.from)}</b>, so I needed <b>${row.checks}</b> checks. Let's see how fast I catch up…`);
        }
        const top = state.seeker.topSpot();
        let learned = false;
        if (sw.to !== null) learned = top === sw.to && k >= 1;
        else {
          const last2 = state.rounds.slice(-2);
          learned = k >= 2 && last2.every((r) => r.spot === last2[0].spot && r.spot !== sw.from) && top === last2[0].spot;
        }
        $("#p-switch").textContent = `Rounds since the switch: ${k}. Robo's brightest spot: ${name(top)}.`;
        if (learned) {
          state.sw = null;
          $("#p-switch").textContent = `Robo switched its top guess from ${name(sw.from)} to ${name(top)} after ${k} round${k > 1 ? "s" : ""}.`;
          markDone("switch", `I adapted! My brightest spot moved from <b>${name(sw.from)}</b> to <b>${name(top)}</b> in <b>${k}</b> round${k > 1 ? "s" : ""}, because old tallies fade.`, "drag <b>Memory</b> to short and switch again. Do I adapt faster?");
        } else if (k >= 25) {
          state.sw = null;
          $("#p-switch").textContent = `No clear new favourite yet. Press Start the switch to try again.`;
          if (!quiet) ML.say(`Hmm, I haven't seen a clear new favourite. For this challenge, pick <b>one new spot</b> and hide there again and again.`);
        }
      }
    }
  }
  function doBotSwitch() {
    const from = BOTS[state.bot].fav;
    const to = state.bot === "pond" ? "shed" : "pond";
    setBot(to);
    state.sw = { stage: "on", from, to: BOTS[to].fav, at: state.rounds.length };
    addMarker(`Switch: ${BOTS[to].name}`);
    $("#p-switch").textContent = `Switched to ${BOTS[to].name}! Watch the chart.`;
    ML.say(`The hider switched to <b>${BOTS[to].name}</b>! My map still glows at the <b>${name(from)}</b>. Watch the chart jump up, then come back down.`);
  }
  function addMarker(label) {
    state.markers.push({ at: state.rounds.length, label });
    state.chartDirty = true;
    flash(label);
  }
  $("#go-switch").addEventListener("click", () => {
    poke();
    if (state.viewing) backToLive();
    if (state.mode === "bot") {
      if (!BOTS[state.bot].fav || state.rounds.length < 8) {
        setBot(BOTS[state.bot].fav ? state.bot : "shed");
        state.sw = { stage: "learn", until: state.rounds.length + 15 };
        ML.say(`First the <b>${BOTS[state.bot].name}</b> hides 15 times so I learn its favourite. Then it will switch!`);
        $("#p-switch").textContent = `Teaching Robo the ${BOTS[state.bot].name}'s habit… 15 rounds to go.`;
      } else doBotSwitch();
      state.playing = true;
      syncPlay();
      return;
    }
    const { p } = state.seeker.belief();
    const top = state.seeker.topSpot();
    if (state.rounds.length < 4 || p[top] < 0.3) {
      ML.say(`First teach me a favourite: hide in the <b>same spot</b> 4 or 5 times until it glows bright on my map. Then press <b>Start the switch</b> again.`);
      $("#p-switch").textContent = `Hide in one spot a few times first (Robo's top spot is at ${pct(p[top])}, needs 30%).`;
      return;
    }
    state.sw = { stage: "on", from: top, to: null, at: state.rounds.length };
    addMarker("You switched");
    $("#p-switch").textContent = `Old favourite: ${name(top)}. Now pick a NEW spot and keep hiding there.`;
    ML.say(`OK, my map says you love the <b>${name(top)}</b>. Now pick a <b>new favourite spot</b> and hide there again and again. How long until I notice?`);
  });

  // 3. Tournament
  const tourCv = $("#tour");
  let tourC = null;
  const TOUR_BOTS = ["shed", "pingpong", "round", "dice"];
  const TOUR_ROUNDS = 300;
  $("#go-best").addEventListener("click", () => {
    poke();
    if (state.tour) return;
    if (state.anim) return ML.toast("Wait for this round to finish");
    state.playing = false; syncPlay();
    tourCv.classList.remove("hidden");
    if (!tourC) tourC = ML.setupCanvas(tourCv, 320, 180);
    const r = seeded((rng() * 1e9) >>> 0);
    state.tour = { r: 0, rng: r, seekers: TOUR_BOTS.map(() => new Seeker({ memory: state.seeker.memory, curiosity: state.seeker.curiosity })), hist: TOUR_BOTS.map(() => []), totals: TOUR_BOTS.map(() => 0) };
    $("#go-best").disabled = true;
    $("#p-best").textContent = "Tournament running…";
    ML.say(`Tournament time! Four robot hiders, ${TOUR_ROUNDS} rounds each, against a fresh me. Who's hardest to find?`);
  });
  function stepTour() {
    const T = state.tour;
    const per = reduce ? 60 : 3;
    for (let k = 0; k < per && T.r < TOUR_ROUNDS; k++, T.r++) {
      TOUR_BOTS.forEach((b, i) => {
        const spot = BOTS[b].pick(T.hist[i], T.rng);
        T.hist[i].push(spot);
        if (T.hist[i].length > 60) T.hist[i].shift();
        T.totals[i] += playRound(T.seekers[i], spot, { rng: T.rng }).checks;
      });
    }
    drawTour();
    if (T.r >= TOUR_ROUNDS) {
      state.tour = null;
      state.lastTour = T;
      $("#go-best").disabled = false;
      $("#go-best").innerHTML = `${ML.icon("reset")} Run it again`;
      const avgs = T.totals.map((t) => t / TOUR_ROUNDS);
      const best = avgs.indexOf(Math.max(...avgs));
      $("#p-best").textContent = `Hardest to find: ${BOTS[TOUR_BOTS[best]].name} (${avgs[best].toFixed(1)} checks).`;
      if (!state.done.best) {
        $("#quiz").classList.remove("hidden");
        ML.say(`The <b>${BOTS[TOUR_BOTS[best]].name}</b> wins with <b>${avgs[best].toFixed(1)}</b> checks. Everyone with a habit got caught fast. Now answer my question in challenge 3!`);
      }
    }
  }
  function drawTour() {
    if (!tourC) return;
    const T = state.tour || state.lastTour;
    if (!T) return;
    const { ctx: c, w, h } = tourC;
    c.clearRect(0, 0, w, h);
    const L = 96, R = 34, top = 10, rowH = (h - top - 22) / TOUR_BOTS.length;
    const X = (v) => L + ((w - L - R) * v) / N;
    c.font = "800 11px Nunito, sans-serif";
    TOUR_BOTS.forEach((b, i) => {
      const a = T.r ? T.totals[i] / T.r : 0, y = top + i * rowH;
      c.fillStyle = ML.cssVar("--ink"); c.textAlign = "right";
      c.fillText(BOTS[b].name, L - 6, y + rowH / 2 + 4);
      c.fillStyle = ML.cssVar(b === "dice" ? "--good" : "--accent");
      c.beginPath(); c.roundRect(L, y + 5, Math.max(2, X(a) - L), rowH - 10, 6); c.fill();
      c.fillStyle = ML.cssVar("--ink"); c.textAlign = "left";
      c.fillText(a.toFixed(1), X(a) + 4, y + rowH / 2 + 4);
    });
    const x55 = X(RANDOM_EXPECT);
    c.strokeStyle = ML.cssVar("--muted"); c.setLineDash([4, 4]); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x55, top); c.lineTo(x55, h - 18); c.stroke(); c.setLineDash([]);
    c.fillStyle = ML.cssVar("--muted"); c.textAlign = "center";
    c.fillText(`5.5 = random`, x55, h - 5);
    c.textAlign = "left"; c.fillText(`checks (round ${T.r}/${TOUR_ROUNDS})`, L, h - 5 + 0);
  }
  document.querySelectorAll("#quiz button").forEach((b) => b.addEventListener("click", () => {
    poke();
    if (b.dataset.a === "right") {
      $("#quiz").classList.add("hidden");
      markDone("best", "Exactly! When every spot is equally likely, my map stays flat, and whatever order I search in, I need about 5.5 checks. Random is the unbeatable way to hide.", "hide yourself and try to be a dice. Do you avoid the spot you just used? My second clue may catch that!");
    } else {
      b.classList.add("wrong");
      ML.say(b.dataset.a === "luck" ? `Not luck: run the tournament again and the Dice roller wins again, near 5.5 every time. Look at my map while it plays: is any spot brighter?` : `There's no secret spot: the Dice roller hides everywhere equally. Hint: if every spot has the same chance, does my search order matter?`);
    }
  }));

  // ---------- checkpoints ----------
  function makeCheckpoint(n) {
    const snap = state.seeker.clone();
    return { label: `After ${n} round${n > 1 ? "s" : ""}`, sub: `<small>${lastAvg(Math.min(10, n)).toFixed(1)} checks lately</small>`, seeker: snap, n, draw: (c) => drawMini(c, snap) };
  }
  function drawMini(canvas, seeker) {
    const c = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = ML.isDark() ? "#24533a" : "#a6dd8f";
    c.beginPath(); c.roundRect(0, 0, W, H, 10); c.fill();
    const { p } = seeker.belief(), mx = Math.max(...p);
    SPOTS.forEach((s, i) => {
      const x = (s.x / GW) * W, y = (s.y / GH) * H, rel = p[i] / mx;
      c.fillStyle = ML.cssVar("--accent");
      c.globalAlpha = 0.2 + 0.75 * rel;
      c.beginPath(); c.arc(x, y, 5 + 13 * rel, 0, 7); c.fill();
      c.globalAlpha = 1;
    });
    const top = p.indexOf(mx);
    c.fillStyle = "#1f2140"; c.font = "800 15px Nunito, sans-serif"; c.textAlign = "center";
    c.fillText(`${SPOTS[top].name} ${pct(p[top])}`, W / 2, H - 8);
  }
  const ckpts = new GameLab.Checkpoints(
    $("#ckpts"),
    (it) => {
      state.viewing = it;
      state.playing = false;
      syncPlay();
      let msg = `This was my map after <b>${it.n}</b> round${it.n > 1 ? "s" : ""}. `;
      const r = seeded(7 + it.n);
      if (state.mode === "bot") {
        const then = evaluate(it.seeker, state.bot, 200, r, { learn: false, history: state.hist });
        const now = evaluate(state.seeker, state.bot, 200, seeded(7 + it.n), { learn: false, history: state.hist });
        msg += `Frozen like that, it would need <b>${then.toFixed(1)}</b> checks against ${BOTS[state.bot].name} today (today's me: <b>${now.toFixed(1)}</b>).`;
      } else {
        const mine = state.rounds.filter((x) => x.who === "you").slice(-20).map((x) => x.spot);
        if (mine.length >= 3) {
          const replay = (sk) => { const s = sk.clone(); let t = 0; mine.forEach((sp) => { t += playRound(s, sp, { rng: r, learn: false }).checks; s.last = sp; }); return t / mine.length; };
          msg += `It would have found your last ${mine.length} hides in <b>${replay(it.seeker).toFixed(1)}</b> checks on average (today's me: <b>${replay(state.seeker).toFixed(1)}</b>).`;
        } else msg += `The glow shows where I expected you back then.`;
      }
      ML.say(msg);
      renderInside();
    },
    () => backToLive(true)
  );
  function backToLive(sayIt) {
    state.viewing = null;
    ckpts.active = null;
    ckpts.render();
    renderInside();
    if (sayIt) ML.say(`Back to the live game!`);
  }

  // ---------- drawing: ground (cached) ----------
  function buildBg() {
    const dpr = garden.dpr;
    const b = document.createElement("canvas");
    b.width = GW * dpr; b.height = GH * dpr;
    const c = b.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = ML.isDark();
    c.fillStyle = dark ? "#21503a" : "#a6dd8f"; c.fillRect(0, 0, GW, GH);
    for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.035)"; c.fillRect(i * 80, 0, 80, GH); }
    // fence
    c.fillStyle = dark ? "#6b4f3a" : "#c99a6b";
    c.fillRect(0, 22, GW, 6);
    for (let x = 6; x < GW; x += 22) { c.beginPath(); c.moveTo(x, 34); c.lineTo(x, 8); c.lineTo(x + 7, 2); c.lineTo(x + 14, 8); c.lineTo(x + 14, 34); c.closePath(); c.fill(); }
    c.fillStyle = "rgba(0,0,0,.12)"; c.fillRect(0, 34, GW, 4);
    // stepping-stone path from home base
    c.fillStyle = dark ? "#5d6470" : "#d9d3c4";
    const path = [[360, 390], [352, 352], [366, 316], [356, 280], [368, 246], [358, 210], [366, 176], [352, 142]];
    path.forEach(([x, y], i) => { c.beginPath(); c.ellipse(x, y, 17 - i * 0.6, 10 - i * 0.3, 0, 0, 7); c.fill(); });
    // tufts + tiny flowers (fixed positions)
    const r = seeded(42);
    for (let i = 0; i < 70; i++) {
      const x = r() * GW, y = 44 + r() * (GH - 60);
      if (SPOTS.some((s) => Math.hypot(s.x - x, s.y - y) < 48) || Math.abs(x - 360) < 40) continue;
      if (r() < 0.75) {
        c.strokeStyle = dark ? "#2f6b4c" : "#7fc66f"; c.lineWidth = 2; c.lineCap = "round";
        c.beginPath(); c.moveTo(x - 4, y + 3); c.lineTo(x - 2, y - 3); c.moveTo(x, y + 3); c.lineTo(x, y - 5); c.moveTo(x + 4, y + 3); c.lineTo(x + 2, y - 3); c.stroke();
      } else {
        c.fillStyle = ["#fff", "#ffe066", "#ff9ec7"][i % 3];
        c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill();
      }
    }
    // home base (back of the house)
    c.fillStyle = dark ? "#8a6d5a" : "#f3d6b5"; c.strokeStyle = "#1f2140"; c.lineWidth = 3;
    c.beginPath(); c.roundRect(288, 404, 144, 50, 8); c.fill(); c.stroke();
    c.fillStyle = dark ? "#4a3a64" : "#7c5cff"; c.beginPath(); c.roundRect(344, 410, 32, 40, 5); c.fill(); c.stroke();
    c.fillStyle = "#ffd25e"; c.beginPath(); c.arc(370, 432, 2.5, 0, 7); c.fill();
    c.fillStyle = dark ? "#c8e3ff" : "#bfe3ff";
    [[302, 414], [394, 414]].forEach(([x, y]) => { c.beginPath(); c.roundRect(x, y, 24, 18, 3); c.fill(); c.stroke(); });
    c.fillStyle = "#1f2140"; c.font = "800 10px Nunito, sans-serif"; c.textAlign = "center";
    c.fillText("HOME BASE", 360, 400);
    state.bg = b;
  }

  // ---------- drawing: hiding spots ----------
  const OUT = "#1f2140";
  function art(i, x, y, wobble) {
    const id = SPOTS[i].id, dark = ML.isDark();
    ctx.save();
    ctx.translate(x, y);
    if (wobble) ctx.rotate(Math.sin(wobble * 30) * 0.06 * (1 - wobble));
    ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.lineJoin = "round";
    const leaf = dark ? "#3f9a5f" : "#4fb36b", leaf2 = dark ? "#2f7c4b" : "#3d9a58";
    const blob = (cx, cy, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke(); };
    switch (id) {
      case "bush":
        blob(-20, 4, 17, leaf2); blob(20, 4, 17, leaf2); blob(-6, -10, 20, leaf); blob(12, -6, 17, leaf);
        ctx.fillStyle = "#e8505b"; [[-14, -6], [6, -16], [18, 2], [-2, 6]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(a, b, 3, 0, 7); ctx.fill(); });
        break;
      case "shed":
        ctx.fillStyle = dark ? "#8b5e3c" : "#c98b55"; ctx.beginPath(); ctx.rect(-32, -22, 64, 44); ctx.fill(); ctx.stroke();
        ctx.fillStyle = dark ? "#7a3e3e" : "#d4544c"; ctx.beginPath(); ctx.moveTo(-40, -20); ctx.lineTo(0, -48); ctx.lineTo(40, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = dark ? "#5b3a24" : "#8a5a33"; ctx.beginPath(); ctx.rect(-10, -6, 20, 28); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(31,33,64,.3)"; ctx.lineWidth = 1.5;
        for (let k = -24; k <= 24; k += 8) if (Math.abs(k) > 12) { ctx.beginPath(); ctx.moveTo(k, -20); ctx.lineTo(k, 20); ctx.stroke(); }
        break;
      case "tree":
        ctx.fillStyle = dark ? "#6b4a33" : "#9a6b45"; ctx.beginPath(); ctx.roundRect(-8, -14, 16, 38, 4); ctx.fill(); ctx.stroke();
        blob(-20, -26, 20, leaf2); blob(20, -26, 20, leaf2); blob(0, -42, 24, leaf); blob(-6, -22, 16, leaf);
        ctx.fillStyle = "#c06a2b"; [[-12, -36], [14, -30], [2, -50]].forEach(([a, b]) => { ctx.beginPath(); ctx.ellipse(a, b, 2.5, 3.5, 0, 0, 7); ctx.fill(); });
        break;
      case "pond":
        ctx.fillStyle = dark ? "#2d5f9a" : "#6cc0ff"; ctx.beginPath(); ctx.ellipse(0, 8, 42, 20, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(-8, 4, 14, 4, 0, 3.4, 5.6); ctx.stroke();
        ctx.fillStyle = leaf; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(16, 12, 7, 0.4, 2 * Math.PI); ctx.lineTo(16, 12); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = dark ? "#6fa65a" : "#5b8f3e"; ctx.lineWidth = 3; ctx.lineCap = "round";
        [-34, -28, -22].forEach((a, k) => { ctx.beginPath(); ctx.moveTo(a, 10); ctx.lineTo(a + 2 - k, -20 + k * 5); ctx.stroke(); });
        ctx.fillStyle = "#7a4b2a"; [-32, -26].forEach((a, k) => { ctx.beginPath(); ctx.ellipse(a + 1, -16 + k * 5, 2.5, 6, 0, 0, 7); ctx.fill(); });
        break;
      case "flowers":
        ctx.fillStyle = dark ? "#5a3f2e" : "#8a5a3a"; ctx.beginPath(); ctx.roundRect(-36, -4, 72, 24, 8); ctx.fill(); ctx.stroke();
        [[-24, -6, "#ff6fa8"], [-10, -12, "#ffd23f"], [4, -7, "#b07cff"], [18, -13, "#ff8a3d"], [28, -5, "#ff6fa8"]].forEach(([a, b, col]) => {
          ctx.strokeStyle = leaf2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a, 2); ctx.stroke();
          ctx.fillStyle = col; for (let k = 0; k < 5; k++) { const an = (k * 2 * Math.PI) / 5; ctx.beginPath(); ctx.arc(a + Math.cos(an) * 4, b + Math.sin(an) * 4, 3.2, 0, 7); ctx.fill(); }
          ctx.fillStyle = "#fff6c2"; ctx.beginPath(); ctx.arc(a, b, 2.4, 0, 7); ctx.fill();
        });
        break;
      case "barrow":
        ctx.fillStyle = dark ? "#5c6b7a" : "#9fb3c8";
        ctx.beginPath(); ctx.moveTo(-32, -10); ctx.lineTo(18, -10); ctx.lineTo(10, 10); ctx.lineTo(-24, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, -4); ctx.lineTo(40, -14); ctx.moveTo(-20, 10); ctx.lineTo(-24, 22); ctx.stroke();
        ctx.fillStyle = "#3b3f5c"; ctx.beginPath(); ctx.arc(-4, 16, 9, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ddd"; ctx.beginPath(); ctx.arc(-4, 16, 3, 0, 7); ctx.fill();
        ctx.fillStyle = dark ? "#6b4a33" : "#8a5a3a"; ctx.beginPath(); ctx.ellipse(-8, -12, 18, 6, 0, Math.PI, 0); ctx.fill();
        break;
      case "dog":
        ctx.fillStyle = dark ? "#9a6a3a" : "#e0a35e"; ctx.beginPath(); ctx.rect(-26, -14, 52, 34); ctx.fill(); ctx.stroke();
        ctx.fillStyle = dark ? "#3f5f9a" : "#4a7bd4"; ctx.beginPath(); ctx.moveTo(-32, -12); ctx.lineTo(0, -38); ctx.lineTo(32, -12); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#2a2440"; ctx.beginPath(); ctx.moveTo(-11, 20); ctx.lineTo(-11, 2); ctx.arc(0, 2, 11, Math.PI, 0); ctx.lineTo(11, 20); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(-14, -28, 28, 9, 3); ctx.fill();
        ctx.fillStyle = OUT; ctx.font = "800 7px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText("REX", 0, -21.5);
        break;
      case "swing":
        ctx.strokeStyle = dark ? "#c2c8d6" : "#6b7590"; ctx.lineWidth = 4; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-34, 22); ctx.lineTo(-24, -34); ctx.lineTo(-14, 22); ctx.moveTo(34, 22); ctx.lineTo(24, -34); ctx.lineTo(14, 22); ctx.moveTo(-26, -34); ctx.lineTo(26, -34); ctx.stroke();
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-8, -34); ctx.lineTo(-8, 8); ctx.moveTo(8, -34); ctx.lineTo(8, 8); ctx.stroke();
        ctx.fillStyle = "#e8505b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-12, 6, 24, 6, 3); ctx.fill(); ctx.stroke();
        break;
      case "bin":
        ctx.fillStyle = dark ? "#2f6e4c" : "#3e9b63"; ctx.beginPath(); ctx.roundRect(-22, -16, 44, 38, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = dark ? "#245a3d" : "#2f7f4f"; ctx.beginPath(); ctx.roundRect(-26, -24, 52, 10, 4); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 3, 8, 0.3, 5.2); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(12, -2); ctx.lineTo(5, 1); ctx.fill();
        break;
      case "hedge":
        ctx.fillStyle = leaf2; ctx.beginPath(); ctx.roundRect(-60, -22, 120, 40, 16); ctx.fill(); ctx.stroke();
        ctx.fillStyle = leaf;
        for (let k = -48; k <= 48; k += 16) { ctx.beginPath(); ctx.arc(k, -18, 9, Math.PI, 0); ctx.fill(); }
        ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.lineWidth = 1.5;
        for (let k = -46; k <= 46; k += 13) { ctx.beginPath(); ctx.arc(k, 0, 4, 0, Math.PI); ctx.stroke(); }
        break;
    }
    ctx.restore();
  }

  // ---------- drawing: characters ----------
  function drawSeeker(x, y, step, look) {
    const bob = Math.abs(Math.sin(step * Math.PI)) * 3;
    ctx.save();
    ctx.translate(x, y - bob);
    ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(0, 22 + bob, 14, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.lineCap = "round";
    const sw = Math.sin(step * Math.PI * 2) * 5;
    ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(-6 + sw, 20); ctx.moveTo(6, 10); ctx.lineTo(6 - sw, 20); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.fillStyle = ML.cssVar("--accent");
    ctx.beginPath(); ctx.roundRect(-15, -18, 30, 30, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(-10, -12, 20, 13, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(-4 + look * 2, -6, 2.2, 0, 7); ctx.arc(4 + look * 2, -6, 2.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -26); ctx.stroke();
    ctx.fillStyle = ML.cssVar("--warn"); ctx.beginPath(); ctx.arc(0, -28, 3.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawGlass(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(14, 14); ctx.stroke();
    ctx.fillStyle = "rgba(200,235,255,.7)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawHider(x, y, step, pose) {
    ctx.save();
    const jump = pose === "pop" ? -Math.abs(Math.sin(step * Math.PI)) * 12 : -Math.abs(Math.sin(step * Math.PI)) * 3;
    ctx.translate(x, y + jump);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    const shirt = ML.cssVar("--diff");
    const sw = pose === "run" ? Math.sin(step * Math.PI * 2) * 6 : 0;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(-4 + sw, 18); ctx.moveTo(4, 8); ctx.lineTo(4 - sw, 18); ctx.stroke();
    ctx.strokeStyle = shirt; ctx.lineWidth = 4;
    if (pose === "pop") { ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-15, -16); ctx.moveTo(8, -4); ctx.lineTo(15, -16); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-11 - sw, 6); ctx.moveTo(8, -4); ctx.lineTo(11 + sw, 6); ctx.stroke(); }
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.roundRect(-9, -8, 18, 18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffd7b0"; ctx.beginPath(); ctx.arc(0, -16, 9, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ML.cssVar("--rl"); ctx.beginPath(); ctx.arc(0, -18, 9, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(-3, -15, 1.6, 0, 7); ctx.arc(3, -15, 1.6, 0, 7); ctx.fill();
    ctx.restore();
  }
  function chip(x, y, text, fill, ink) {
    ctx.font = "800 11px Nunito, sans-serif";
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 9, w, 18, 9); ctx.fill();
    ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.fillText(text, x, y + 4);
  }

  // ---------- main draw ----------
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function currentSeg(a, el) {
    for (const s of a.segs) if (el < s.t0 + s.dur) return s;
    return null;
  }
  function draw(now) {
    if (!state.bg) buildBg();
    ctx.setTransform(garden.dpr, 0, 0, garden.dpr, 0, 0);
    ctx.clearRect(0, 0, GW, GH);
    ctx.drawImage(state.bg, 0, 0, GW, GH);
    const a = state.anim;
    const el = a ? now - a.start : 0;
    const seg = a ? currentSeg(a, el) : null;
    const viewSeeker = state.viewing ? state.viewing.seeker : state.seeker;
    // belief to show: during a round, the belief Robo had BEFORE you hid
    const target = a ? a.row.before : viewSeeker.belief().p;
    const k = reduce ? 1 : 0.12;
    for (let i = 0; i < N; i++) state.disp[i] += (target[i] - state.disp[i]) * k;
    const secret = !a && !state.viewing && state.mode === "you" && !state.peek;
    const mx = Math.max(...state.disp);
    const order = a ? a.row.order : state.viewing ? viewSeeker.plan(() => 0.5) : state.plan;
    const showOrder = a ? seg && seg.type !== "hide" : !secret;
    const checked = new Map(); // spot → "x" | "found"
    if (a) a.segs.forEach((s) => { if (s.type === "peek" && el >= s.t0 + s.dur * 0.5) checked.set(s.spot, s.found ? "found" : "x"); });
    // glows
    SPOTS.forEach((s, i) => {
      const rel = state.disp[i] / mx;
      const r = secret ? 34 : 30 + 34 * rel;
      const g = ctx.createRadialGradient(s.x, s.y + 6, 4, s.x, s.y + 6, r);
      const col = ML.cssVar("--accent");
      g.addColorStop(0, col); g.addColorStop(1, "transparent");
      ctx.globalAlpha = secret ? 0.12 : 0.18 + 0.7 * rel;
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s.x, s.y + 6, r * 1.25, r * 0.8, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      if (state.hover === i && !a && state.mode === "you") {
        ctx.strokeStyle = ML.cssVar("--accent"); ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 50, 36, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
    });
    // spot art, labels, plan numbers, check marks
    SPOTS.forEach((s, i) => {
      let wob = 0;
      if (a) a.segs.forEach((sg) => { if (sg.type === "peek" && sg.spot === i && el >= sg.t0 && el < sg.t0 + sg.dur) wob = (el - sg.t0) / sg.dur; });
      art(i, s.x, s.y, reduce ? 0 : wob);
      const label = secret ? `${KEYS[i]} · ${s.name}` : `${s.name} ${pct(state.disp[i])}`;
      chip(s.x, s.y + 32, label, ML.isDark() ? "rgba(20,22,40,.82)" : "rgba(255,255,255,.88)", ML.cssVar("--ink"));
      if (showOrder && order) {
        const rank = order.indexOf(i) + 1;
        ctx.fillStyle = rank === 1 ? ML.cssVar("--accent") : ML.isDark() ? "#2b2f52" : "#fff";
        ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x - 40, s.y - 22, 11, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = rank === 1 ? "#fff" : ML.cssVar("--ink"); ctx.font = "800 12px Nunito, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(rank, s.x - 40, s.y - 18);
      }
      const ck = checked.get(i);
      if (ck === "x") {
        ctx.strokeStyle = ML.cssVar("--bad"); ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(s.x + 26, s.y - 34); ctx.lineTo(s.x + 40, s.y - 20); ctx.moveTo(s.x + 40, s.y - 34); ctx.lineTo(s.x + 26, s.y - 20); ctx.stroke();
      }
    });

    // characters
    if (a && seg) {
      const t = (el - seg.t0) / seg.dur;
      const spot = a.row.spot, sp = SPOTS[spot];
      if (seg.type === "hide") {
        const e = ease(t);
        drawHider(ML.lerp(HOME.x + 30, sp.x, e), ML.lerp(HOME.y, sp.y + 4, e), t * 4, "run");
        drawSeeker(HOME.x, HOME.y, 0, 0);
        ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "700 13px Nunito, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("(eyes closed!)", HOME.x, HOME.y - 38);
      } else if (seg.type === "count") {
        drawSeeker(HOME.x, HOME.y, 0, 0);
        const words = ["1…", "2…", "3…", "Ready or not!"];
        chip(HOME.x, HOME.y - 44, words[Math.min(3, Math.floor(t * 4))], ML.cssVar("--accent"), "#fff");
      } else if (seg.type === "walk") {
        const e = ease(t);
        const x = ML.lerp(seg.from.x, seg.to.x, e), y = ML.lerp(seg.from.y, seg.to.y, e);
        drawSeeker(x, y, t * Math.max(2, Math.round(seg.dur / 140)), Math.sign(seg.to.x - seg.from.x));
        chip(x, y - 42, `Check ${seg.idx + 1}`, ML.isDark() ? "rgba(20,22,40,.85)" : "rgba(255,255,255,.92)", ML.cssVar("--ink"));
      } else if (seg.type === "peek") {
        const p = stand(seg.spot);
        drawSeeker(p.x, p.y, 0, -1);
        drawGlass(p.x - 22, p.y - 20, reduce ? 1 : 0.8 + 0.25 * Math.sin(t * Math.PI));
        if (t > 0.5) chip(p.x, p.y - 44, seg.found ? "Found you!" : "Not here!", seg.found ? ML.cssVar("--good") : ML.cssVar("--bad"), "#fff");
        if (seg.found && t > 0.5) drawHider(sp.x, sp.y - 16, 0, "pop");
      } else if (seg.type === "found") {
        const p = seg.at;
        drawHider(sp.x, sp.y - 16, reduce ? 0 : t * 3, "pop");
        drawSeeker(p.x, p.y, 0, -1);
        const n = a.row.checks;
        ctx.font = "700 30px Fredoka, sans-serif"; ctx.textAlign = "center";
        ctx.fillStyle = n >= 6 ? ML.cssVar("--good") : n <= 2 ? ML.cssVar("--bad") : ML.cssVar("--ink");
        const msg = n === 1 ? "Found on the 1st check!" : `Found after ${n} checks!`;
        ctx.lineWidth = 6; ctx.strokeStyle = ML.isDark() ? "#14162a" : "#fff"; ctx.strokeText(msg, GW / 2, 72); ctx.fillText(msg, GW / 2, 72);
        if (!reduce) for (let s = 0; s < 5; s++) { const an = t * 5 + (s * 2 * Math.PI) / 5; ctx.fillStyle = ML.cssVar("--warn"); ctx.beginPath(); ctx.arc(sp.x + Math.cos(an) * 26, sp.y - 26 + Math.sin(an) * 16, 3, 0, 7); ctx.fill(); }
      }
    } else {
      drawSeeker(HOME.x, HOME.y, 0, 0);
      ctx.font = "700 15px Nunito, sans-serif"; ctx.textAlign = "center";
      const hint = state.tour ? "Tournament running…" : state.viewing ? `Looking back: Robo's map after ${state.viewing.n} rounds` : state.mode === "you" ? (secret ? "Tap a spot to hide! Robo's map is secret." : "Tap a spot to hide!") : state.playing ? "" : "Press Play to let the robot hider play";
      if (hint) { ctx.lineWidth = 5; ctx.strokeStyle = ML.isDark() ? "#14162a" : "#fff"; ctx.strokeText(hint, GW / 2, 24); ctx.fillStyle = ML.cssVar("--ink"); ctx.fillText(hint, GW / 2, 24); }
    }
    if (a && el >= a.total) {
      state.anim = null;
      finishRound(a.row, false);
    }
  }

  // ---------- chart ----------
  function drawChart() {
    const c = state.rounds.map((r) => r.checks);
    const n = c.length, bs = Math.max(1, Math.ceil(n / 100));
    const vals = [];
    if (bs === 1) for (let i = 0; i < n; i++) vals.push(avg(c.slice(Math.max(0, i - 4), i + 1)));
    else for (let b = 0; b * bs < n; b++) vals.push(avg(c.slice(b * bs, (b + 1) * bs)));
    const markers = state.markers.map((m) => ({ at: m.at / bs, label: m.label }));
    GameLab.drawChart(chart, [{ values: vals.map(() => RANDOM_EXPECT), color: "--muted" }, { values: vals, color: "--accent" }], markers, 12, "");
    state.chartDirty = false;
  }

  // ---------- panels ----------
  function renderStats() {
    $("#st-n").textContent = state.rounds.length;
    const a = lastAvg(10);
    $("#st-avg").textContent = a === null ? "–" : a.toFixed(1);
    $("#strip").innerHTML = state.rounds.slice(-24).map((r) =>
      `<i class="${r.checks >= 6 ? "hard" : r.checks <= 2 ? "easy" : ""}" title="${SPOTS[r.spot].name}: ${r.checks} check${r.checks > 1 ? "s" : ""}">${r.checks}</i>`).join("");
    renderInside();
  }
  function renderInside() {
    const s = state.viewing ? state.viewing.seeker : state.seeker;
    const { p, pf, pn, nSeenNext } = s.belief();
    const top = (arr) => arr.indexOf(Math.max(...arr));
    const f = top(pf), nx = top(pn);
    const plan = state.viewing ? s.plan(() => 0.5) : state.plan;
    let clue2;
    if (s.last === null) clue2 = `Clue 2 (what comes next): I haven't seen you hide yet.`;
    else if (nSeenNext < 0.5) clue2 = `Clue 2: after the <b>${name(s.last)}</b>… I haven't seen what you do next yet.`;
    else clue2 = `Clue 2: after the <b>${name(s.last)}</b> you often go to the <b>${name(nx)}</b> (${pct(pn[nx])}).`;
    const hidden = state.mode === "you" && !state.peek && !state.viewing && !state.anim;
    $("#inside").innerHTML = s.rounds === 0
      ? `<div>${ML.icon("map")} No rounds yet, so every spot gets the same tiny pretend tally: <b>10%</b> each.</div><div class="arrow">${ML.icon("arrow-down")}</div><div>${ML.icon("search")} My plan is just a random order.</div>`
      : `<div>${ML.icon("pencil")} Clue 1 (favourite spots): the <b>${name(f)}</b> (${pct(pf[f])}).</div>
      <div>${ML.icon("clock")} ${clue2}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("search")} ${hidden ? `My next plan is <b>secret</b> until you hide (tick Peek to cheat!).` : `My plan: check the <b style="color:var(--accent)">${name(plan[0])}</b> first, then ${name(plan[1])}, then ${name(plan[2])}…`}</div>`;
    $("#trust").innerHTML = `<div class="row1"><span class="muted">How much I trust each clue:</span></div>` +
      [["Favourite spots", s.trust[0]], ["What comes next", s.trust[1]]].map(([n, w]) =>
        `<div class="row1"><span>${n}</span><span class="num">${pct(w)}</span><span class="bar"><span style="width:${Math.round(w * 100)}%"></span></span></div>`).join("");
    const mx = Math.max(...p);
    const rows = hidden ? SPOTS.map((_, i) => i) : plan;
    $("#belief").innerHTML = `<div class="muted" style="font-size:.8rem;font-weight:800">${hidden ? "My map (numbers hidden until you hide):" : "My map, in search order:"}</div>` +
      rows.map((i, r) => `<div class="b ${!hidden && r === 0 ? "top" : ""}"><span class="o">${hidden ? "?" : r + 1}</span><span>${name(i)}</span><span class="t"><span style="width:${hidden ? 0 : Math.round((p[i] / mx) * 100)}%"></span></span><span class="n">${hidden ? "?" : pct(p[i])}</span></div>`).join("");
  }
  function flash(text) {
    const o = $("#overlay");
    o.textContent = text;
    o.classList.add("show");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => o.classList.remove("show"), 1400);
  }

  // ---------- controls ----------
  function poke() { state.lastAct = performance.now(); }
  const spotsHost = $("#spots");
  spotsHost.innerHTML = SPOTS.map((s, i) => `<button class="btn small" data-s="${i}" aria-label="Hide in the ${s.name} (key ${KEYS[i]})">${s.name}<kbd>${KEYS[i]}</kbd></button>`).join("");
  function syncSpots() {
    const off = state.mode !== "you" || !!state.viewing || !!state.tour;
    spotsHost.querySelectorAll("button").forEach((b) => (b.disabled = off));
  }
  function hideIn(i) {
    poke();
    if (state.mode !== "you") return ML.say(`A robot hider is playing. Switch <b>Who hides?</b> to <b>You</b> to hide yourself.`);
    if (state.viewing) return ML.say(`You're looking at an old checkpoint. Tap <b>Back to live</b> first.`);
    startRound(i, "you");
  }
  spotsHost.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => hideIn(+b.dataset.s)));
  const spotAt = (pt) => {
    let best = -1, bd = 52;
    SPOTS.forEach((s, i) => { const d = Math.hypot(pt.x - s.x, (pt.y - s.y) * 1.2); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  $("#garden").addEventListener("pointerdown", (e) => {
    const i = spotAt(ML.canvasPoint(e.currentTarget, e, GW, GH));
    if (i >= 0) hideIn(i);
  });
  $("#garden").addEventListener("pointermove", (e) => { state.hover = spotAt(ML.canvasPoint(e.currentTarget, e, GW, GH)); });
  $("#garden").addEventListener("pointerleave", () => (state.hover = -1));
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName) && e.target.type !== "checkbox" && e.target.type !== "range") return;
    const i = KEYS.indexOf(e.key);
    if (i >= 0 && state.mode === "you") { e.preventDefault(); hideIn(i); }
  });

  $("#peek").addEventListener("change", (e) => {
    poke();
    state.peek = e.target.checked;
    renderInside();
    ML.say(state.peek ? `Now you can see my map and my plan before you hide. The spot with the <b>biggest number</b> is where I'll look last! (Peeked rounds don't count for challenge 1.)` : `My map is secret again. No more cheating!`);
  });

  const botsHost = $("#bots");
  botsHost.innerHTML = Object.entries(BOTS).map(([id, b]) => `<button class="btn small ${id === state.bot ? "on" : ""}" data-b="${id}" aria-pressed="${id === state.bot}">${b.name}<small>${b.desc}</small></button>`).join("");
  function setBot(id) {
    state.bot = id;
    botsHost.querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b.dataset.b === id); b.setAttribute("aria-pressed", b.dataset.b === id); });
  }
  botsHost.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    poke();
    if (state.mode !== "bot") setMode("bot");
    if (b.dataset.b === state.bot && state.rounds.length) return;
    const had = state.rounds.length > 0;
    setBot(b.dataset.b);
    if (had) addMarker(`New hider: ${BOTS[b.dataset.b].name}`);
    ML.say(`<b>${BOTS[b.dataset.b].name}</b>: ${BOTS[b.dataset.b].desc} Press <b>Play</b> and watch my map learn.`);
  }));

  function setMode(m) {
    state.mode = m;
    state.playing = false;
    document.querySelectorAll("#mode button").forEach((x) => { x.classList.toggle("on", x.dataset.m === m); x.setAttribute("aria-pressed", x.dataset.m === m); });
    $("#play").disabled = m !== "bot";
    $("#step").disabled = m !== "bot";
    syncPlay();
    renderInside();
  }
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => {
    poke();
    if (b.dataset.m === state.mode) return;
    setMode(b.dataset.m);
    ML.say(state.mode === "you" ? `Your turn! Tap a spot to hide. Try having a favourite spot and see if I notice.` : `Pick a robot hider and press <b>Play</b>. Watch the glow on my map and the chart.`);
  }));

  const playBtn = $("#play");
  function syncPlay() { playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`; }
  playBtn.addEventListener("click", () => {
    poke();
    if (state.mode !== "bot" || state.tour) return;
    if (state.viewing) backToLive();
    state.playing = !state.playing;
    syncPlay();
  });
  $("#step").addEventListener("click", () => {
    poke();
    if (state.mode !== "bot" || state.anim || state.tour) return;
    if (state.viewing) backToLive();
    state.playing = false; syncPlay();
    const row = startRound(BOTS[state.bot].pick(state.hist, rng), "bot");
    if (row && state.speed >= 60) narrateBot();
  });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    poke();
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    state.speed = +b.dataset.v;
  }));
  const memWord = (v) => (v >= 0.995 ? "never forgets" : v >= 0.92 ? "long" : v >= 0.75 ? "medium" : "short");
  ML.bindRange("#mem", (v) => `${v.toFixed(2)} · ${memWord(v)}`, (v) => { state.seeker.memory = v; });
  ML.bindRange("#cur", (v) => (v === 0 ? "0 · none" : v.toFixed(2)), (v) => { state.seeker.curiosity = v; state.plan = state.seeker.plan(rng); if (state.rounds.length) renderInside(); });
  $("#mem").addEventListener("change", () => { poke(); ML.say(`Memory set to <b>${memWord(state.seeker.memory)}</b>. ${state.seeker.memory < 0.75 ? "I'll forget old hides fast: quick to adapt, easy to fool." : state.seeker.memory > 0.99 ? "I'll never forget a single hide: steady, but slow to notice new habits." : "A good middle."}`); });
  $("#cur").addEventListener("change", () => { poke(); ML.say(state.seeker.curiosity > 0.2 ? `Lots of curiosity: I'll check spots you haven't used lately even when my map says you're elsewhere. Watch: does the chart get worse?` : `A pinch of curiosity: I mostly trust my map.`); });

  $("#reset").addEventListener("click", () => {
    poke();
    if (state.tour) return;
    state.seeker = new Seeker({ memory: +$("#mem").value, curiosity: +$("#cur").value });
    state.plan = state.seeker.plan(rng);
    state.rounds = []; state.hist = []; state.markers = [];
    state.anim = null; state.sw = null; state.playing = false;
    syncPlay();
    if (state.viewing) state.viewing = null;
    ckpts.clear();
    state.chartDirty = true;
    renderStats();
    if (!state.done.switch) $("#p-switch").textContent = "";
    ML.say(`My memory is wiped. Every spot looks the same to me again.`);
  });

  // ---------- idle nudges ----------
  function nextStep() {
    const mine = state.rounds.filter((r) => r.who === "you").length;
    if (state.viewing) return `Tap <b>Back to live</b> in the checkpoints row to keep playing.`;
    if (state.tour) return `The tournament is running. Watch the bars grow in challenge 3!`;
    if (state.mode === "bot" && !state.playing) return `Press <b>Play</b> to let ${BOTS[state.bot].name} hide, or <b>1 round</b> to watch one search.`;
    if (state.mode === "you" && mine < 3) return `Your turn! Tap any spot in the garden to hide, or press a number key.`;
    if (state.mode === "you" && mine < 8) return `Try hiding in the <b>same spot</b> a few times. Does it start to glow? Does my line on the chart drop?`;
    if (!state.done.hard) return `Challenge 1: can you make me need <b>5 checks</b> on average? Don't use one spot too much!`;
    if (!state.done.switch) return `Challenge 2: press <b>Start the switch</b> and change your habit. How fast do I catch up?`;
    if (!state.done.best) return `Challenge 3: press <b>Run the hider tournament</b>. Who's hardest to find?`;
    return `All challenges done! Try <b>X-ray the model</b>, or tap a checkpoint to meet a younger me.`;
  }
  setInterval(() => {
    const now = performance.now();
    if (now - state.lastAct > 15000 && !(state.mode === "bot" && state.playing) && !state.anim) { ML.say(nextStep()); state.lastAct = now; }
  }, 1000);

  document.addEventListener("themechange", () => { state.bg = null; state.chartDirty = true; ckpts.render(); drawTour(); });

  // ---------- loop ----------
  function frame(now) {
    requestAnimationFrame(frame); // schedule first so one bad frame never stops the game
    if (state.tour) stepTour();
    else if (state.mode === "bot" && state.playing && !state.viewing) {
      if (state.speed >= 60) {
        for (let i = 0; i < 20 && state.playing; i++) startRound(BOTS[state.bot].pick(state.hist, rng), "bot");
        renderStats();
      } else if (!state.anim) startRound(BOTS[state.bot].pick(state.hist, rng), "bot");
    }
    draw(now);
    if (state.chartDirty) drawChart();
    syncSpots();
  }
  renderStats();
  ckpts.render();
  drawChart();
  requestAnimationFrame(frame);

  // ---------- Model X-ray ----------
  let sNow = null;
  ML.xray.register({
    title: "Robo's where-do-they-hide map",
    kind: "Bayesian counts",
    summary: () => `watched ${state.rounds.length} rounds`,
    size: () => `${N + sNow.next.size * N} tallies`,
    stats: () => [["Rounds", state.rounds.length], ["Checks (last 10)", lastAvg(10) === null ? "–" : lastAvg(10).toFixed(1)], ["Memory", sNow.memory.toFixed(2)], ["Trusts most", sNow.trust[0] >= sNow.trust[1] ? "favourite spots" : "what comes next"]],
    inputs: [],
    outputs: [],
    brainHeight: 330,
    drawBrain: (cv) => {
      const c = cv.getContext("2d"), s = sNow, { pf } = s.belief();
      c.font = "800 13px Nunito, sans-serif"; c.textAlign = "left";
      c.fillStyle = ML.cssVar("--ink"); c.fillText("Clue 1: tallies (faded) and chances", 10, 18);
      const mxc = Math.max(1, ...s.fav);
      SPOTS.forEach((sp, i) => {
        const y = 34 + i * 29;
        c.fillStyle = ML.cssVar("--muted"); c.fillText(sp.name, 10, y + 13);
        c.fillStyle = ML.cssVar("--accent"); c.fillRect(110, y + 3, (s.fav[i] / mxc) * 200, 12);
        c.fillStyle = ML.cssVar("--ink"); c.fillText(`${s.fav[i].toFixed(1)} → ${pct(pf[i])}`, 318, y + 13);
      });
      const x0 = 520, y0 = 44, q = 34;
      c.fillStyle = ML.cssVar("--ink"); c.fillText("Clue 2: after this spot (row) → next spot (column)", x0 - 90, 18);
      for (let r = 0; r < N; r++) {
        const cnt = s.next.get(r), n = cnt ? cnt.reduce((a, b) => a + b, 0) : 0;
        c.fillStyle = r === s.last ? ML.cssVar("--accent") : ML.cssVar("--muted"); c.textAlign = "right";
        c.fillText(SPOTS[r].name, x0 - 6, y0 + r * (q - 6) + 17);
        for (let k = 0; k < N; k++) {
          c.fillStyle = ML.cssVar("--rl"); c.globalAlpha = 0.08 + 0.92 * (n ? cnt[k] / n : 0);
          c.fillRect(x0 + k * (q - 8) + 1, y0 + r * (q - 6) + 1, q - 10, q - 8);
          c.globalAlpha = 1;
        }
      }
      c.textAlign = "center"; c.fillStyle = ML.cssVar("--muted");
      SPOTS.forEach((sp, k) => c.fillText(KEYS[k], x0 + k * (q - 8) + (q - 10) / 2, y0 - 6));
      c.textAlign = "left";
    },
    brainCaption: "Left: Robo's faded tally for each spot, turned into a chance with a tiny pretend tally everywhere. Right: what you did after each spot (columns use the key numbers 1–0). Darker = happened more. The highlighted row is the spot you used last.",
    notes: [
      "Robo can only win by spotting habits. A hider who picks every spot equally often leaves a flat map, and then any search order needs 5.5 checks on average.",
      "Memory fades old tallies each round. That's why Robo adapts when you switch habits.",
    ],
  });
  const _xo = ML.xray.open;
  ML.xray.open = () => { sNow = state.seeker.clone(); _xo(); };
  ML.xray.button($("#play").parentElement);
})();
