// Movie Recommender: user-based collaborative filtering + tiny matrix factorisation (logic in unsup-recommend-core.js).
(function () {
  const C = RecCore;
  const SEED = 7, NV = 20, ME = NV; // "you" is row 20 in the factorisation matrix
  const data = C.makeData(SEED);
  const sp = C.split(data, SEED, 0.2);
  const movies = data.movies.slice();
  const nBase = movies.length;
  const TINTS = ["--nn", "--rl", "--sup", "--diff", "--vision", "--lang"];
  const GROUP_COL = ["--rl", "--diff", "--nn"];
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    me: new Array(nBase + 1).fill(null), // last slot = the hidden new movie
    cold: false, mode: "cf", method: "pearson", k: 5, density: 1, n: NV, learning: false,
    focus: -1, mf: null, mfHist: [], reveal: false, sel: -1, marks: [], done: {}, timer: null,
  };
  const $ = (id) => document.getElementById(id);
  const nMovies = () => movies.length + (state.cold ? 1 : 0);
  const R = (v) => (v === null ? "–" : v.toFixed(1));

  // the "new movie" nobody rated
  const NEWM = { name: "Mystery Moon", icon: "question", mix: [0, 0, 0] };
  function allMovies() { return state.cold ? movies.concat([NEWM]) : movies; }

  let pool = C.thin(sp.train, sp.rank, 1);
  function rebuildPool() { pool = C.thin(sp.train, sp.rank, state.density); }
  const rated = () => state.me.filter((x, i) => x !== null && i < nMovies()).length;
  const myRow = () => state.me.slice(0, nMovies() + (state.cold ? 0 : 0));

  // ---------- cards ----------
  const grid = $("grid");
  function buildGrid() {
    grid.innerHTML = "";
    allMovies().forEach((m, i) => {
      const el = document.createElement("article");
      el.className = "mv"; el.dataset.i = i;
      const tint = i >= nBase ? "--muted" : TINTS[i % 6];
      el.innerHTML = `<div class="poster" style="background:var(${tint})">${ML.icon(m.icon)}</div>
        <button class="nm" type="button" title="Why this guess?">${m.name}</button>
        <div class="stars" role="group" aria-label="Rate ${m.name}">${[1, 2, 3, 4, 5].map((s) => `<button type="button" data-s="${s}" aria-label="${s} star${s > 1 ? "s" : ""}">${ML.icon("star")}</button>`).join("")}</div>
        <div class="guess"></div>`;
      grid.appendChild(el);
    });
  }
  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".mv"); if (!card) return;
    const i = +card.dataset.i, sb = e.target.closest(".stars button");
    if (sb) {
      const s = +sb.dataset.s;
      state.me[i] = state.me[i] === s ? null : s;
      onRatings();
    } else if (e.target.closest(".nm")) { state.focus = i; refresh(); }
  });

  // ---------- predictions ----------
  function predictions() {
    const row = state.me.slice(0, nMovies());
    const out = [];
    for (let i = 0; i < nMovies(); i++) {
      if (state.me[i] !== null) { out.push(null); continue; }
      const cr = C.movieAverage(pool.slice(0, state.mode === "cf" ? state.n : NV), i);
      if (cr.n === 0) { out.push({ pred: null, cold: true, used: [] }); continue; }
      if (state.mode === "cf") {
        const p = C.predictCF(row, pool, i, { method: state.method, k: state.k, poolSize: state.n });
        out.push({ pred: p.pred, used: p.used, fallback: p.fallback });
      } else {
        out.push({ pred: rated() ? C.mfPredict(state.mf, ME, i) : null, used: [], fallback: rated() ? null : "none" });
      }
    }
    return out;
  }
  function topPicks(preds) {
    return preds.map((p, i) => (p && p.pred !== null ? { i, p: p.pred } : null)).filter((x) => x && x.p >= 3).sort((a, b) => b.p - a.p).slice(0, 3);
  }

  // ---------- rendering ----------
  function refresh() {
    const preds = predictions(), picks = topPicks(preds);
    const hasMe = rated() > 0;
    if (hasMe && (state.focus < 0 || state.me[state.focus] !== null) && picks.length) state.focus = picks[0].i;
    if (!hasMe) state.focus = -1;
    [...grid.children].forEach((el) => {
      const i = +el.dataset.i, my = state.me[i], p = preds[i];
      el.querySelectorAll(".stars button").forEach((b) => b.classList.toggle("on", my !== null && +b.dataset.s <= my));
      const rank = picks.findIndex((x) => x.i === i);
      el.classList.toggle("pick", rank >= 0 && hasMe);
      el.classList.toggle("focus", i === state.focus);
      const old = el.querySelector(".badge-pick"); if (old) old.remove();
      if (rank >= 0 && hasMe) el.insertAdjacentHTML("beforeend", `<span class="badge-pick">Pick #${rank + 1}</span>`);
      const g = el.querySelector(".guess");
      if (my !== null) g.innerHTML = `You gave <b>${my}</b> star${my > 1 ? "s" : ""}`;
      else if (p && p.cold) g.innerHTML = `<b>?</b> nobody has rated it`;
      else if (p && p.pred !== null && hasMe) g.innerHTML = `Robo guesses <b>${R(p.pred)}</b> stars${p.fallback === "crowd" ? " (crowd average)" : ""}`;
      else g.textContent = hasMe ? "No guess yet" : "Rate some first";
    });
    $("rated-note").textContent = `(${rated()} rated)`;
    $("s-you").textContent = rated();
    const pk = $("picks");
    pk.innerHTML = hasMe && picks.length
      ? picks.map((x, n) => `<div style="color:var(--ink)">${n + 1}. <b>${allMovies()[x.i].name}</b> <span class="muted">· guess ${R(x.p)} stars</span></div>`).join("")
      : hasMe ? "Nothing I would bet you will love yet. Rate more movies!" : "Rate a few movies first.";
    renderTwins(); renderInside(preds); drawChart(); drawMap(); checkChallenges(preds);
  }

  function twins() { return C.topTwins(state.me.slice(0, nMovies()), pool, { method: state.method, poolSize: state.n }); }
  function renderTwins() {
    const el = $("twins");
    if (!rated()) { el.innerHTML = `<span class="muted" style="font-weight:700">Your twins will show up here.</span>`; return; }
    const t = twins().slice(0, 5);
    el.innerHTML = t.map((x, rank) => {
      const pct = Math.round(Math.max(0, x.sim) * 100);
      return `<div class="twin"><span>${data.viewers[x.v].name}</span><div class="bar" title="similarity ${x.sim.toFixed(2)}"><i style="width:${pct}%;opacity:${rank < state.k ? 1 : 0.35}"></i></div><small>${pct}% · ${x.n} shared</small></div>`;
    }).join("") + `<div class="muted" style="font-size:.82rem;font-weight:700">Bold bars are the ${state.k} twins Robo listens to.</div>`;
  }

  function renderInside(preds) {
    const el = $("inside"), f = state.focus, all = allMovies();
    if (!rated()) {
      el.innerHTML = `<div class="sig"><span class="dot" style="background:var(--muted)"></span><span>Waiting for your stars. A rating is the only thing I know about you.</span></div>`;
      return;
    }
    const vals = state.me.slice(0, nMovies()).filter((x) => x !== null);
    const flat = vals.length >= 2 && vals.every((x) => x === vals[0]);
    if (state.mode === "mf") {
      const u = state.mf.P[ME], mu = state.mf.mu;
      let html = `<div class="mono">Taste map · epoch ${state.mf.epoch}</div>
        <div class="sig"><span class="dot" style="background:var(--warn)"></span><span>You sit at (${u[0].toFixed(2)}, ${u[1].toFixed(2)}) on the map. Movies on your side of the map get higher guesses.</span></div>`;
      if (f >= 0 && preds[f] && preds[f].pred !== null) {
        const q = state.mf.Q[f], dot = u[0] * q[0] + u[1] * q[1];
        html += `<div class="sig"><span class="dot" style="background:var(--ink)"></span><span><b>${all[f].name}</b> sits at (${q[0].toFixed(2)}, ${q[1].toFixed(2)}).<br>average ${mu.toFixed(1)} + you ${(state.mf.bu[ME]).toFixed(1)} + movie ${state.mf.bi[f].toFixed(1)} + closeness ${dot.toFixed(1)} = <b>${R(preds[f].pred)}</b></span></div>`;
      }
      if (flat) html += `<div class="decision">All your stars are the same, so there is no pattern to find.</div>`;
      el.innerHTML = html + (state.mf.epoch < 5 ? `<div class="decision">Press Watch it learn: the map is still random.</div>` : "");
      return;
    }
    let html = "";
    if (flat) html += `<div class="decision">Every star you gave is the same (${vals[0]}). After removing your average there is nothing left, so every similarity is 0: nobody looks like you more than anybody else. Robo falls back to the crowd average.</div>`;
    if (f >= 0 && preds[f] && !preds[f].cold) {
      const p = preds[f];
      html += `<div class="mono">Why ${R(p.pred)} for ${all[f].name}</div><div class="why">`;
      if (p.fallback) html += `<div>No twin rated it, so I use the average of everybody who did.</div>`;
      else {
        const mu = C.mean(state.me.slice(0, nMovies()));
        html += p.used.map((c) => `<div class="row2"><span class="dot" style="background:var(--accent);width:12px;height:12px;border-radius:50%;flex:none;margin-top:5px"></span><span><b>${data.viewers[c.v].name}</b> (${Math.round(c.sim * 100)}% twin) gave it <b>${c.rating}</b>, usually gives ${c.mean.toFixed(1)}, so ${c.rating - c.mean >= 0 ? "+" : ""}${(c.rating - c.mean).toFixed(1)}.</span></div>`).join("");
        html += `<div class="decision">Your average ${mu.toFixed(1)} + the twins' extra = ${R(p.pred)}</div>`;
      }
      html += `</div>`;
    } else if (f < 0 && !flat) html += `<div class="sig"><span>Tap a movie name to see which twins drove its guess.</span></div>`;
    const cold = preds.find((p) => p && p.cold);
    if (cold && !html.includes("Why")) html += `<div class="decision">A movie nobody rated has no twins to ask. I can only say "?".</div>`;
    el.innerHTML = html;
  }

  // ---------- chart ----------
  const CW = 300, CH = 150;
  const { ctx: cctx } = ML.setupCanvas($("chart"), CW, CH);
  let cfCurve = null, cfKey = "";
  function curve() {
    const key = [state.method, state.k, state.density, state.n].join("|");
    if (key === cfKey) return cfCurve;
    cfKey = key;
    const err = [], base = [];
    const b = C.rmseBaseline(pool, sp.test);
    for (let n = 2; n <= state.n; n++) { err.push({ x: n, y: C.rmseCF(pool, sp.test, { method: state.method, k: state.k, poolSize: n }) }); base.push({ x: n, y: b }); }
    cfCurve = { err, base };
    return cfCurve;
  }
  function curX() { return state.mode === "cf" ? state.n : state.mf.epoch; }
  const MFMAX = 120;
  function drawChart() {
    let series, xMax, xLabel, last;
    if (state.mode === "cf") {
      const c = curve();
      series = [{ data: c.base, color: ML.cssVar("--muted") }, { data: c.err, color: ML.cssVar("--bad") }];
      xMax = NV; xLabel = "kids who have joined →";
      last = c.err.length ? c.err[c.err.length - 1].y : null;
      $("chart-legend").innerHTML = `<span><i style="background:var(--bad)"></i>hold-out error</span><span><i style="background:var(--muted)"></i>just the crowd average</span>`;
      $("chart-note").textContent = "Robo hides some known ratings, guesses them from the twins, and measures how many stars off it is. Lower is better.";
    } else {
      series = [{ data: state.mfHist.map((h) => ({ x: h.x, y: h.tr })), color: ML.cssVar("--accent") }, { data: state.mfHist.map((h) => ({ x: h.x, y: h.te })), color: ML.cssVar("--bad") }];
      xMax = MFMAX; xLabel = "training rounds →";
      last = state.mfHist.length ? state.mfHist[state.mfHist.length - 1].te : null;
      $("chart-legend").innerHTML = `<span><i style="background:var(--accent)"></i>training error</span><span><i style="background:var(--bad)"></i>hold-out error</span>`;
      $("chart-note").textContent = "Training error is on ratings the map has seen. Hold-out error is on hidden ones, the honest score.";
    }
    $("s-err").innerHTML = last === null ? "–" : `${last.toFixed(2)}<small> stars</small>`;
    SupKit.lineChart(cctx, CW, CH, series, { xMax, yMin: 0, yMax: 2, yFmt: (v) => v.toFixed(1), xLabel });
    const L = 34, Rr = 8, seen = {};
    state.marks.filter((m) => m.mode === state.mode).forEach((m) => {
      const x = L + (Math.min(m.x, xMax) / xMax) * (CW - L - Rr);
      seen[m.x] = (seen[m.x] || 0) + 1;
      const y = 18 + (seen[m.x] - 1) * 18;
      cctx.strokeStyle = ML.cssVar("--muted"); cctx.setLineDash([3, 3]); cctx.beginPath(); cctx.moveTo(x, 10); cctx.lineTo(x, CH - 20); cctx.stroke(); cctx.setLineDash([]);
      cctx.fillStyle = ML.cssVar("--accent"); cctx.beginPath(); cctx.arc(Math.min(x, CW - 12), y, 8, 0, 7); cctx.fill();
      cctx.fillStyle = "#fff"; cctx.font = "800 10px Nunito, sans-serif"; cctx.textAlign = "center"; cctx.textBaseline = "middle"; cctx.fillText(m.id, Math.min(x, CW - 12), y + 0.5);
    });
  }

  // ---------- taste map ----------
  const MW = 520, MH = 340;
  const { ctx: mctx } = ML.setupCanvas($("mapcv"), MW, MH);
  let mapPts = [];
  function drawMap() {
    if (state.mode !== "mf") return;
    const mf = state.mf, ink = ML.cssVar("--ink");
    const pts = [];
    data.viewers.forEach((v, u) => pts.push({ k: "v", u, x: mf.P[u][0], y: mf.P[u][1], label: v.name, g: v.group }));
    allMovies().forEach((m, i) => pts.push({ k: "m", i, x: mf.Q[i][0], y: mf.Q[i][1], label: m.name }));
    if (rated()) pts.push({ k: "me", x: mf.P[ME][0], y: mf.P[ME][1], label: "You" });
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sx = (MW - 110) / Math.max(0.3, x1 - x0), sy = (MH - 50) / Math.max(0.3, y1 - y0), s = Math.min(sx, sy);
    const ox = (MW - (x1 - x0) * s) / 2 - x0 * s, oy = (MH - (y1 - y0) * s) / 2 - y0 * s;
    pts.forEach((p) => { p.px = p.x * s + ox; p.py = p.y * s + oy; });
    mapPts = pts;
    mctx.clearRect(0, 0, MW, MH);
    mctx.textBaseline = "middle"; mctx.textAlign = "center";
    pts.forEach((p) => {
      if (p.k === "v") {
        mctx.fillStyle = state.reveal ? ML.cssVar(GROUP_COL[p.g]) : ML.cssVar("--accent");
        mctx.globalAlpha = state.sel === p.u ? 1 : 0.8;
        mctx.beginPath(); mctx.arc(p.px, p.py, state.sel === p.u ? 9 : 6, 0, 7); mctx.fill(); mctx.globalAlpha = 1;
        mctx.fillStyle = ML.cssVar("--ink-2"); mctx.font = "700 9px Nunito, sans-serif"; mctx.fillText(p.label, p.px, p.py - 12);
      } else if (p.k === "m") {
        mctx.fillStyle = ink; SupKit.rr(mctx, p.px - 6, p.py - 6, 12, 12, 3); mctx.fill();
        mctx.font = "800 10px Nunito, sans-serif"; mctx.fillText(p.label, p.px, p.py + 14);
      } else {
        mctx.fillStyle = ML.cssVar("--warn"); mctx.strokeStyle = ink; mctx.lineWidth = 2.5;
        mctx.beginPath(); mctx.arc(p.px, p.py, 10, 0, 7); mctx.fill(); mctx.stroke();
        mctx.fillStyle = ink; mctx.font = "800 10px Nunito, sans-serif"; mctx.fillText("You", p.px, p.py - 18);
      }
    });
  }
  $("mapcv").addEventListener("pointerdown", (e) => {
    const p = ML.canvasPoint($("mapcv"), e, MW, MH);
    let best = null, bd = 22;
    mapPts.forEach((q) => { const d = Math.hypot(q.px - p.x, q.py - p.y); if (d < bd) { bd = d; best = q; } });
    if (!best) { state.sel = -1; drawMap(); return; }
    state.sel = best.k === "v" ? best.u : -1;
    if (best.k === "v") ML.say(`<b>${best.label}</b> is here. Kids near each other on the map gave similar stars to the same movies.`);
    else if (best.k === "m") { state.focus = best.i; ML.say(`<b>${best.label}</b>: kids close to it on the map tend to rate it highly.`); refresh(); return; }
    drawMap();
  });
  $("b-reveal").addEventListener("click", () => {
    state.reveal = !state.reveal; drawMap();
    $("b-reveal").classList.toggle("on", state.reveal);
    if (state.reveal) ML.say(`Now the dots wear their <b>secret group</b> colour: ${C.GROUP_NAMES.join(", ")}. Nobody told the map, but each group landed together!`);
  });

  // ---------- learning ----------
  function mfMatrix() { const m = pool.map((r) => r.concat([null])); const row = state.me.slice(0, nBase + 1); m.push(row.map((x, i) => (i < nMovies() ? x : null))); return m; }
  function mfTestList() { return sp.test; }
  function newMF() { state.mf = C.newMF(NV + 1, nBase + 1, 3, 2); state.mfHist = []; }
  function mfStep(n) {
    const mat = mfMatrix(), trList = C.listOf(mat).filter((t) => t.u !== ME);
    for (let i = 0; i < n; i++) C.mfEpoch(state.mf, mat, 0.03, 0.04);
    state.mfHist.push({ x: state.mf.epoch, tr: C.mfRmse(state.mf, trList), te: C.mfRmse(state.mf, mfTestList()) });
  }
  function stopLearn() { state.learning = false; clearTimeout(state.timer); $("b-learn").innerHTML = `${ML.icon("play")} Watch it learn`; }
  function tick() {
    if (!state.learning) return;
    if (state.mode === "cf") {
      state.n++;
      refresh();
      if (state.n >= NV) { stopLearn(); const c = curve(); ML.say(`All 20 kids joined. The hold-out error went from <b>${c.err[0].y.toFixed(2)}</b> to <b>${c.err[c.err.length - 1].y.toFixed(2)}</b> stars. More kids, better twins!`); return; }
    } else {
      mfStep(3);
      refresh();
      if (state.mf.epoch >= MFMAX) { stopLearn(); ML.say("The taste map is trained. See how kids and movies formed groups? Try the secret-group colours!"); return; }
    }
    state.timer = setTimeout(tick, 220);
  }
  function startLearn() {
    stopLearn();
    if (state.mode === "cf") state.n = 2; else newMF();
    state.learning = true;
    $("b-learn").innerHTML = `${ML.icon("pause")} Pause`;
    ML.say(state.mode === "cf" ? "I start knowing only <b>2 kids</b>. Watch the twins list and the error as more kids join." : "I'm placing everyone at random spots, then nudging them so the stars add up. Watch the groups appear!");
    if (reduced) {
      if (state.mode === "cf") state.n = NV; else mfStep(MFMAX);
      stopLearn(); refresh(); ML.say("Finished training (motion is reduced, so I skipped the animation).");
      return;
    }
    refresh(); state.timer = setTimeout(tick, 220);
  }
  $("b-learn").addEventListener("click", () => (state.learning ? stopLearn() : startLearn()));

  // ---------- events ----------
  function onRatings() {
    if (state.mode === "mf" && state.mf.epoch > 0) { const mat = mfMatrix(); for (let i = 0; i < 25; i++) C.mfEpoch(state.mf, mat, 0.03, 0.04); state.mfHist.push({ x: state.mf.epoch, tr: state.mfHist.length ? state.mfHist[state.mfHist.length - 1].tr : 0, te: C.mfRmse(state.mf, mfTestList()) }); }
    const n = rated();
    if (n > 0 && n < 4) ML.say(`Nice! ${4 - n} more and my guesses get a lot better.`);
    else if (n >= 4) { const t = topPicks(predictions())[0]; if (t) ML.say(`Based on your stars my first pick is <b>${allMovies()[t.i].name}</b>. Tap a movie name to see which twins voted for it.`); }
    refresh();
  }
  function setMode(m) {
    stopLearn(); state.mode = m;
    $("m-cf").classList.toggle("on", m === "cf"); $("m-mf").classList.toggle("on", m === "mf");
    $("cf-opts").hidden = m !== "cf"; $("twinbox").hidden = m !== "cf"; $("mapbox").hidden = m !== "mf";
    if (m === "mf") { if (!state.mf) newMF(); if (state.mf.epoch === 0) { mfStep(10); } ML.say("The <b>taste map</b> gives every kid and every movie a spot. Press <b>Watch it learn</b> to train it. Your own star shows up once you rate."); }
    else { state.n = NV; ML.say("Back to <b>taste twins</b>: I find the kids most like you and listen to them."); }
    refresh();
  }
  $("m-cf").addEventListener("click", () => setMode("cf"));
  $("m-mf").addEventListener("click", () => setMode("mf"));
  function setSim(s) {
    state.method = s; $("s-pearson").classList.toggle("on", s === "pearson"); $("s-cosine").classList.toggle("on", s === "cosine");
    ML.say(s === "pearson" ? "<b>Compare tastes</b>: I first subtract each kid's own average, so a kid who gives everything 5 stars doesn't look like a twin of everyone."
      : "<b>Compare raw stars</b>: I just compare star numbers. Since most ratings are high, nearly everybody looks a bit alike. Check the hold-out error!");
    refresh();
  }
  $("s-pearson").addEventListener("click", () => setSim("pearson"));
  $("s-cosine").addEventListener("click", () => setSim("cosine"));
  ML.bindRange("#k", (v) => v, (v) => { state.k = v; refresh(); });
  ML.bindRange("#dens", (v) => v + "%", (v) => { state.density = v / 100; rebuildPool(); if (state.mf) { const keep = state.mode === "mf"; newMF(); if (keep) mfStep(10); } refresh(); });
  $("b-clear").addEventListener("click", () => { state.me = state.me.map(() => null); ML.say("All clear. Rate 4 or 5 movies to begin."); onRatings(); });
  function setMe(arr, msg) { state.me = state.me.map((_, i) => (arr[i] === undefined ? null : arr[i])); if (msg) ML.say(msg); onRatings(); }
  $("b-demo").addEventListener("click", () => setMe([null, 1, 5, 2, 1, 4, null, 5, 1, 5], "I rated a few for you: loves chases, rescues and turtles, not the silly ones. Who are your twins now?"));
  $("t-cheat").addEventListener("click", () => setMe(Array.from({ length: nMovies() }, () => 5), "Every movie got 5 stars. If you love everything, I can't tell what you like best!"));
  $("t-cold").addEventListener("click", () => addCold());
  $("t-odd").addEventListener("click", () => setMe([5, null, null, 1, null, 5, null, 1, 5, null, null, 1], "A viewer with strange taste: loves some magic, rescue and moon movies, hates others in the same genres. Nobody matches!"));
  $("t-few").addEventListener("click", () => { $("dens").value = 25; $("dens").dispatchEvent(new Event("input")); ML.say("The crowd only kept <b>25%</b> of their ratings. Fewer shared movies means shakier twins."); });
  function addCold() {
    if (!state.cold) { state.cold = true; buildGrid(); if (state.mf) newMF(); }
    ML.say("A new movie, <b>Mystery Moon</b>, just arrived. Nobody has rated it, so no twin can tell me anything. That's the <b>cold start</b> problem.");
    state.focus = -1; refresh();
    grid.lastElementChild.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }

  // ---------- challenges ----------
  function mark(id, say) {
    if (state.done[id]) return;
    state.done[id] = true;
    $("c-" + id).classList.add("done");
    const num = { cheat: 1, cold: 2, odd: 3, few: 4 }[id];
    state.marks.push({ id: num, x: curX(), mode: state.mode });
    ML.toast(`Challenge ${num} done!`); ML.say(say); drawChart();
  }
  function checkChallenges(preds) {
    const vals = state.me.slice(0, nMovies()).filter((x) => x !== null);
    if (vals.length === nBase && vals.every((x) => x === 5)) mark("cheat", "The cheater! With all 5s there's <b>no pattern</b>, so I just show what's popular with everybody.");
    if (state.cold && preds.some((p) => p && p.cold)) mark("cold", "A movie with no ratings gets a <b>?</b>. Real apps then use the movie's genre or just show it to a few people to collect ratings.");
    if (vals.length >= 4 && !vals.every((x) => x === vals[0])) {
      const best = C.topTwins(state.me.slice(0, nMovies()), pool, { method: "pearson" })[0];
      if (best && best.sim < 0.35) mark("odd", `Your best twin is only <b>${Math.round(best.sim * 100)}%</b> a match. With odd taste my guesses are weak.`);
    }
    if (state.density <= 0.3) mark("few", "With few ratings in the crowd, the error line climbs. Fewer clues, worse guesses.");
  }

  new MutationObserver(() => { drawChart(); drawMap(); }).observe(document.documentElement, { attributes: true });
  buildGrid();
  setMode("cf");
  window.__rec = { state, refresh };
})();
