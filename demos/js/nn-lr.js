// Learning Rate Race: balls rolling downhill with different step sizes.
(function () {
  const C = window.LRCore;
  const W = 600, H = 400, PX = 100, MAXSTEPS = 300;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RACERS = {
    tiny: { name: "Tiny", color: "#2f9bff", kind: "gd" },
    right: { name: "Just right", color: "#2fbf62", kind: "gd" },
    big: { name: "Big", color: "#ffb020", kind: "gd" },
    giant: { name: "Giant", color: "#ff4d5e", kind: "gd" },
    mom: { name: "Heavy ball", color: "#7c5cff", kind: "momentum" },
    decay: { name: "Slowing down", color: "#12b5a6", kind: "decay" },
    adam: { name: "Adam-lite", color: "#ff5c9a", kind: "adam" },
  };
  const $ = (s) => document.querySelector(s);
  const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sx = (x) => (x + 3) * PX, sy = (y) => (2 - y) * PX;

  // ---------- landscape drawing ----------
  const STOPS = [[255, 233, 160], [143, 214, 176], [90, 167, 214], [91, 63, 160]];
  function heat(t) {
    const p = clamp(t, 0, 0.999) * (STOPS.length - 1), i = Math.floor(p), f = p - i;
    return STOPS[i].map((v, k) => v + (STOPS[i + 1][k] - v) * f);
  }
  const bgCache = {};
  function curveRange(id) {
    const f = C.LANDS[id].f; let lo = Infinity, hi = -Infinity;
    for (let x = -3; x <= 3; x += 0.05) { const v = f(x, 0); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return [lo, hi];
  }
  const sideY = (id, v) => { const [lo, hi] = curveRange(id); return H - 50 - ((v - lo) / (hi - lo)) * (H - 110); };
  function background(id, mode) {
    const dark = ML.isDark(), key = id + mode + dark;
    if (bgCache[key]) return bgCache[key];
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    if (mode === "top") {
      const w = 300, h = 200, im = g.createImageData(w, h), f = C.LANDS[id].f, mn = C.globalMin(id);
      const vals = new Float32Array(w * h), bands = new Int16Array(w * h);
      let mx = -Infinity;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = f(-3 + (i + 0.5) / 50, 2 - (j + 0.5) / 50); vals[j * w + i] = v; mx = Math.max(mx, v); }
      const rng = (mx - mn) * 0.85;
      for (let k = 0; k < vals.length; k++) bands[k] = Math.floor(Math.pow(clamp((vals[k] - mn) / rng, 0, 1), 0.6) * 14);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, t = Math.pow(clamp((vals[k] - mn) / rng, 0, 1), 0.6);
        let c = heat((bands[k] + 0.5) / 14 * 0.6 + t * 0.4);
        const edge = (i < w - 1 && bands[k + 1] !== bands[k]) || (j < h - 1 && bands[k + w] !== bands[k]);
        if (edge) c = c.map((v) => (dark ? v * 0.55 : v * 0.7));
        else if (dark) c = c.map((v) => v * 0.8);
        im.data[k * 4] = c[0]; im.data[k * 4 + 1] = c[1]; im.data[k * 4 + 2] = c[2]; im.data[k * 4 + 3] = 255;
      }
      const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h; tmp.getContext("2d").putImageData(im, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, W, H);
    } else {
      g.fillStyle = ML.cssVar("--canvas-bg"); g.fillRect(0, 0, W, H);
      g.strokeStyle = ML.cssVar("--line"); g.lineWidth = 1;
      for (let x = -3; x <= 3; x++) { g.beginPath(); g.moveTo(sx(x), 0); g.lineTo(sx(x), H); g.stroke(); }
      const f = C.LANDS[id].f;
      g.beginPath(); g.moveTo(0, H);
      for (let x = -3; x <= 3.001; x += 0.04) g.lineTo(sx(x), sideY(id, f(x, 0)));
      g.lineTo(W, H); g.closePath();
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, dark ? "#3b3170" : "#8fd6b0"); gr.addColorStop(1, dark ? "#241f4a" : "#ffe9a0");
      g.fillStyle = gr; g.fill();
      g.strokeStyle = dark ? "#c5c3e6" : "#4b3f9e"; g.lineWidth = 4; g.lineJoin = "round"; g.stroke();
    }
    return (bgCache[key] = cv);
  }

  function ballPos(b, mode) {
    if (mode === "side") return [sx(b.x), sideY(b.land, C.LANDS[b.land].f(clamp(b.x, -3, 3), 0))];
    return [sx(b.x), sy(b.y)];
  }
  function drawArena(ctx, ar) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(background(ar.land, ar.mode), 0, 0);
    // start marker
    const st = ar.mode === "side" ? [sx(ar.start[0]), sideY(ar.land, C.LANDS[ar.land].f(ar.start[0], 0))] : [sx(ar.start[0]), sy(ar.start[1])];
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(st[0], st[1], 15, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ar.balls.forEach((r) => {
      const b = r.ball;
      ctx.strokeStyle = r.color; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      b.path.forEach((p, i) => {
        const pp = ballPos({ x: clamp(p[0], -3.2, 3.2), y: clamp(p[1], -2.2, 2.2), land: b.land }, ar.mode);
        i ? ctx.lineTo(pp[0], pp[1]) : ctx.moveTo(pp[0], pp[1]);
      });
      ctx.stroke(); ctx.globalAlpha = 1;
      const p = ballPos({ x: clamp(b.x, -3.1, 3.1), y: clamp(b.y, -2.1, 2.1), land: b.land }, ar.mode);
      ctx.fillStyle = r.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p[0], p[1], ar.balls.length > 1 ? 9 : 12, 0, 7); ctx.fill(); ctx.stroke();
      if (b.dead) {
        ctx.fillStyle = "#fff"; ctx.strokeStyle = r.color; ctx.lineWidth = 3; ctx.font = "800 15px Nunito, sans-serif"; ctx.textAlign = "center";
        const tx = clamp(p[0], 50, W - 50), ty = clamp(p[1] + (p[1] > H / 2 ? -20 : 28), 20, H - 10);
        ctx.strokeText("oops, flew away!", tx, ty); ctx.fillText("oops, flew away!", tx, ty);
      }
    });
  }

  // ---------- arenas ----------
  function makeArena(canvasSel, build) {
    const cv = $(canvasSel), c = ML.setupCanvas(cv, W, H);
    const ar = { cv, ctx: c.ctx, land: "bumpy", mode: "top", start: C.LANDS.bumpy.start.slice(), balls: [], running: false, speed: 1, acc: 0, build, onStep: null, onChange: null };
    ar.reset = () => { ar.running = false; ar.balls = build(ar); drawArena(ar.ctx, ar); ar.onChange && ar.onChange(); };
    const setStart = (e) => {
      const p = ML.canvasPoint(cv, e, W, H);
      ar.start = [clamp(p.x / PX - 3, -2.9, 2.9), ar.mode === "side" ? 0 : clamp(2 - p.y / PX, -1.9, 1.9)];
      ar.reset();
    };
    let drag = false;
    cv.addEventListener("pointerdown", (e) => { drag = true; try { cv.setPointerCapture(e.pointerId); } catch (_) {} setStart(e); e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => { if (drag) setStart(e); });
    const up = () => { drag = false; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    ar.finished = () => ar.balls.every((r) => { const s = C.status(r.ball); return r.ball.t >= MAXSTEPS || s === "flew" || s === "home" || s === "stuck"; });
    ar.stepOnce = () => { ar.balls.forEach((r) => C.stepBall(r.ball)); ar.onStep && ar.onStep(); };
    ar.run = () => {
      if (ar.finished()) ar.reset();
      if (reduced) { while (!ar.finished()) ar.stepOnce(); ar.running = false; drawArena(ar.ctx, ar); ar.onChange && ar.onChange(); return; }
      ar.running = true; ar.onChange && ar.onChange();
    };
    ar.setLand = (id) => { ar.land = id; ar.start = ar.mode === "side" ? [C.LANDS[id].start[0], 0] : C.LANDS[id].start.slice(); ar.reset(); };
    ar.setMode = (m) => { ar.mode = m; if (m === "side") ar.start = [ar.start[0], 0]; ar.reset(); };
    return ar;
  }
  const oneD = (ar) => ar.mode === "side";

  // ---------- Play ----------
  const play = makeArena("#cv", (ar) => {
    const lr = C.lrFromSlider(parseFloat($("#lr").value));
    return [{ key: "you", color: "#7c5cff", ball: C.makeBall("gd", lr, ar.start[0], ar.start[1], { land: ar.land, oneD: oneD(ar) }) }];
  });
  const SAY = {
    flew: "Oops! The step was <b>so big</b> the ball hopped right off the map. Try a smaller step size.",
    home: "It rolled all the way to the bottom! That step size worked.",
    stuck: "It stopped in a <b>little dip</b>. The ground is flat right here, so it thinks it is done, but there is a deeper spot elsewhere!",
    crawl: "It is moving, but with <b>teeny steps</b>. It would get there... eventually. Try a bigger step.",
    bounce: "It is <b>bouncing</b> back and forth, jumping over the bottom each time. A little smaller?",
    zig: "<b>Zig-zag!</b> It hops from wall to wall of the valley instead of going along it.",
    roll: "Rolling downhill, one step at a time...",
    ready: "Drag the ball anywhere (or tap the map), pick a <b>step size</b>, then press <b>Roll</b>.",
  };
  function playUI() {
    const b = play.balls[0].ball, s = C.status(b);
    $("#p-steps").innerHTML = b.t + "<small>/" + MAXSTEPS + "</small>";
    $("#p-loss").textContent = b.dead ? "oops" : fmt(b.loss);
    $("#p-state").textContent = { flew: "Flew away!", home: "Home!", stuck: "Stuck in a dip", crawl: "Crawling", bounce: "Bouncing", zig: "Zig-zagging", roll: "Rolling", ready: "Ready" }[s];
    $("#roll").innerHTML = ML.icon(play.running ? "pause" : "play") + (play.running ? " Pause" : " Roll!");
    let msg = SAY[s];
    if (!play.running && b.t >= MAXSTEPS && s !== "home" && s !== "flew" && s !== "stuck") msg = "Out of steps and still going. " + (b.loss > 1 ? "Try a <b>bigger</b> step." : "Nearly there!");
    ML.say(msg);
  }
  play.onChange = playUI;
  play.onStep = () => { const b = play.balls[0].ball; if (b.t % 5 === 0 || b.dead) playUI(); };
  ML.bindRange("#lr", (s) => { const lr = C.lrFromSlider(s); return (lr < 0.01 ? lr.toFixed(4) : lr.toFixed(2)) + " (" + C.lrWord(lr) + ")"; }, () => { if (play.cv) play.reset(); });
  $("#roll").addEventListener("click", () => { if (play.running) { play.running = false; playUI(); } else play.run(); });
  $("#p-reset").addEventListener("click", () => play.reset());
  document.querySelectorAll("#p-land button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#p-land button").forEach((x) => x.classList.toggle("on", x === b)); play.setLand(b.dataset.l);
  }));
  document.querySelectorAll("#p-view button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#p-view button").forEach((x) => x.classList.toggle("on", x === b)); play.setMode(b.dataset.m);
  }));
  document.querySelectorAll("#p-presets button").forEach((b) => b.addEventListener("click", () => {
    const L = C.LANDS[play.land].race[b.dataset.p]; $("#lr").value = Math.log10(L).toFixed(2);
    $("#lr").dispatchEvent(new Event("input"));
  }));

  // ---------- Race ----------
  const extras = { mom: false, decay: false, adam: false };
  const race = makeArena("#cv2", (ar) => {
    const L = C.LANDS[ar.land], o = { land: ar.land, oneD: oneD(ar) }, list = [];
    const add = (key, lr, extra) => list.push({ key, color: RACERS[key].color, name: RACERS[key].name, lr,
      ball: C.makeBall(RACERS[key].kind, lr, ar.start[0], ar.start[1], Object.assign({}, o, extra)) });
    ["tiny", "right", "big", "giant"].forEach((k) => add(k, L.race[k]));
    if (extras.mom) add("mom", L.mom.lr, { beta: L.mom.beta });
    if (extras.decay) add("decay", L.decay);
    if (extras.adam) add("adam", L.adam);
    race.mark = null;
    return list;
  });
  race.speed = 3; race.chal = null; race.mark = null;
  const CHAL = {
    valley: { land: "valley", on: ["mom"], a: "mom", b: "right", title: "A narrow valley", say: "The valley is steep on the sides and flat along the bottom. Plain balls zig-zag. Can the <b>Heavy ball</b> get home before <b>Just right</b>?", win: "The heavy ball built up speed along the valley and got home first!" },
    plateau: { land: "plateau", on: [], a: "big", b: "right", title: "A flat plateau", say: "Out here the ground is almost flat, so the slope (and the step) is tiny. Which gets home first, <b>Big</b> or <b>Just right</b>?", win: "On flat ground a bigger step wins: the slope is tiny, so you need a long stride!" },
    bumpy: { land: "bumpy", on: ["mom"], a: "mom", b: "right", title: "A bumpy field", say: "There is a shallow dip on the way. Plain balls fall in and stop. Can the <b>Heavy ball</b> roll right through to the deepest spot?", win: "The heavy ball rolled straight through the little dip into the deepest valley!" },
    decay: { land: "valley", on: ["decay"], a: "decay", b: "big", title: "Shrink the step", say: "<b>Big</b> bounces around forever. <b>Slowing down</b> starts just as big, then shrinks its steps. Does it settle?", win: "Big steps first, small steps later: it settled at the bottom while Big kept bouncing!" },
  };
  const done = {};
  function checkChal() {
    const c = race.chal; if (!c || race.mark) return;
    const ra = race.balls.find((r) => r.key === c.a), rb = race.balls.find((r) => r.key === c.b);
    if (!ra || !rb) return;
    const sa = C.stepsToGoal(ra.ball);
    if (sa < 0) return;
    const sb = C.stepsToGoal(rb.ball);
    if (sb >= 0 && sb <= sa) { race.mark = { step: sa, ok: false }; return; }
    race.mark = { step: sa, ok: true };
    done[c.id] = true; renderChal();
    ML.toast("Challenge done: " + c.title + "!"); try { ML.confetti(); } catch (_) {}
  }
  const chart = ML.setupCanvas($("#chart"), 600, 230);
  function drawChart() {
    const g = chart.ctx, cw = 600, ch = 230, L = 44, R = 10, T = 14, B = 26;
    g.clearRect(0, 0, cw, ch);
    const ink = ML.cssVar("--ink-2"), line = ML.cssVar("--line");
    const tmax = Math.max(60, ...race.balls.map((r) => r.ball.t));
    const X = (t) => L + (t / tmax) * (cw - L - R);
    const Y = (v) => T + (1 - (clamp(Math.log10(Math.max(v, 0) + 0.001), -3, 2) + 3) / 5) * (ch - T - B);
    g.font = "700 11px Nunito, sans-serif"; g.fillStyle = ink; g.strokeStyle = line; g.lineWidth = 1; g.textAlign = "right";
    [[-3, "0.001"], [-2, "0.01"], [-1, "0.1"], [0, "1"], [1, "10"], [2, "100"]].forEach(([e, t]) => {
      const y = Y(Math.pow(10, e) - 0.001); g.beginPath(); g.moveTo(L, y); g.lineTo(cw - R, y); g.stroke(); g.fillText(t, L - 6, y + 4);
    });
    g.textAlign = "center"; g.fillText("steps", cw / 2, ch - 4);
    for (let t = 0; t <= tmax; t += tmax > 150 ? 100 : 20) g.fillText(t, X(t), ch - 14 + 2);
    g.save(); g.translate(11, ch / 2); g.rotate(-Math.PI / 2); g.fillText("how high up the hill (log)", 0, 0); g.restore();
    race.balls.forEach((r) => {
      g.strokeStyle = r.color; g.lineWidth = 2.5; g.lineJoin = "round"; g.beginPath();
      let last = null;
      r.ball.hist.forEach((v, t) => { if (isNaN(v)) return; const x = X(t), y = Y(v); t ? g.lineTo(x, y) : g.moveTo(x, y); last = [x, y]; });
      g.stroke();
      if (r.ball.dead && last) { g.fillStyle = r.color; g.font = "800 13px Nunito, sans-serif"; g.fillText("✕", last[0] + 8, Y(1e3)); g.strokeStyle = r.color; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(X(r.ball.hist.length - 1), Y(1e3)); g.stroke(); g.setLineDash([]); }
      const sg = C.stepsToGoal(r.ball);
      if (sg >= 0) { g.fillStyle = r.color; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(X(sg), Y(r.ball.hist[sg]), 5, 0, 7); g.fill(); g.stroke(); }
    });
    if (race.mark) {
      const x = X(race.mark.step), col = race.mark.ok ? ML.cssVar("--good") : ML.cssVar("--bad");
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, ch - B); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.font = "800 12px Nunito, sans-serif"; g.textAlign = x > cw - 150 ? "right" : "left";
      g.fillText(race.mark.ok ? "Challenge done! (step " + race.mark.step + ")" : "Too late: someone else got there first", x + (g.textAlign === "left" ? 6 : -6), T + 12);
    }
  }

  const WORDS = {
    tiny: "teeny steps", right: "steady steps", big: "huge steps", giant: "gigantic steps",
    mom: "heavy and fast", decay: "steps that shrink", adam: "smart step sizes",
  };
  function narrate(r) {
    const b = r.ball, s = C.status(b), k = r.key, n = C.stepsToGoal(b);
    switch (s) {
      case "flew": return "jumped so far it left the map! Each hop landed <b>higher</b> up the hill than the last, so the steps just kept growing.";
      case "ready": return "waiting at the start with " + WORDS[k] + ".";
      case "home": return "<b>reached the bottom</b>" + (n >= 0 ? " in " + n + " steps" : "") + ".";
      case "stuck": return "is <b>stuck in a little dip</b>. It is flat here, so it thinks it is done. A deeper spot is somewhere else!";
      case "crawl": return k === "tiny" || b.lr < 0.02 ? "is taking <b>teeny steps</b> and has hardly moved. It would get there... in a very long time." : "slowed way down. The ground is almost flat here.";
      case "bounce": return k === "decay" ? "is still hopping, but its steps keep shrinking." : "<b>jumps over the bottom</b> to the other side, then back again. Its step is too big to land in the dip.";
      case "zig": return k === "mom" ? "is swinging a little, but its speed carries it <b>along the valley</b>." : "is <b>zig-zagging</b>: hopping from wall to wall of the valley instead of going along it.";
      default: return k === "mom" ? "is a heavy ball: it has <b>built up speed</b> and may roll through small dips." : k === "decay" ? "started with big steps; they are <b>getting smaller</b> as it goes." : k === "adam" ? "gives each direction its own step size, so it rolls smoothly." : "is rolling downhill with " + WORDS[k] + ".";
    }
  }
  function leaderboard() {
    const rows = race.balls.map((r) => {
      const n = C.stepsToGoal(r.ball);
      return { r, n, key: n >= 0 ? [0, n] : [1, r.ball.dead ? 1e9 : r.ball.loss] };
    }).sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);
    $("#board").innerHTML = rows.map((o, i) => {
      const b = o.r.ball, s = C.status(b), lr = o.r.lr;
      const res = o.n >= 0 ? "home in <b>" + o.n + "</b>" : b.dead ? "flew away" : "height " + fmt(b.loss);
      return `<li><span class="rk">${i + 1}</span><i style="background:${o.r.color}"></i><span class="nm">${o.r.name}<small> step ${lr < 0.1 ? lr.toFixed(3) : lr.toFixed(2)}</small></span><span class="rs">${res}</span></li>`;
    }).join("");
    $("#inside").innerHTML = race.balls.map((r) => `<div class="ln"><i style="background:${r.color}"></i><span><b>${r.name}</b> ${narrate(r)}</span></div>`).join("");
    const lead = rows[0].r, b = lead.ball;
    if (!race.chal || race.mark) {
      if (race.mark && race.mark.ok) ML.say(CHAL[race.chal.id].win, $("#say2"));
      else if (b.t < 2) ML.say("Four balls, one hill, four step sizes. Press <b>Race!</b> and watch who gets home first.", $("#say2"));
      else if (rows[0].n >= 0) ML.say("<b>" + lead.name + "</b> leads: " + narrate(lead), $("#say2"));
      else ML.say("Racing... <b>" + lead.name + "</b> is lowest so far.", $("#say2"));
    }
    $("#r-steps").innerHTML = race.balls[0].ball.t + "<small>/" + MAXSTEPS + "</small>";
    $("#r-go").innerHTML = ML.icon(race.running ? "pause" : "flag") + (race.running ? " Pause" : " Race!");
  }
  race.onChange = () => { drawChart(); leaderboard(); };
  race.onStep = () => { checkChal(); if (race.balls[0].ball.t % 3 === 0 || race.finished()) { drawChart(); leaderboard(); } };
  $("#r-go").addEventListener("click", () => { if (race.running) { race.running = false; leaderboard(); } else race.run(); });
  $("#r-reset").addEventListener("click", () => race.reset());
  document.querySelectorAll("#r-speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#r-speed button").forEach((x) => x.classList.toggle("on", x === b)); race.speed = +b.dataset.v;
  }));
  document.querySelectorAll("#r-land button").forEach((b) => b.addEventListener("click", () => {
    race.chal = null; setLandButtons(b.dataset.l); race.setLand(b.dataset.l);
  }));
  function setLandButtons(id) { document.querySelectorAll("#r-land button").forEach((x) => x.classList.toggle("on", x.dataset.l === id)); }
  document.querySelectorAll("#r-view button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#r-view button").forEach((x) => x.classList.toggle("on", x === b)); race.setMode(b.dataset.m);
  }));
  function setExtra(k, on) { extras[k] = on; const el = $("#x-" + k); el.classList.toggle("on", on); el.setAttribute("aria-pressed", on); }
  Object.keys(extras).forEach((k) => $("#x-" + k).addEventListener("click", () => { setExtra(k, !extras[k]); race.reset(); }));

  // ---------- challenges ----------
  Object.keys(CHAL).forEach((id) => (CHAL[id].id = id));
  function renderChal() {
    $("#chals").innerHTML = Object.values(CHAL).map((c) => `<div class="card chal-card ${done[c.id] ? "done" : ""}">
      <h3>${ML.icon(done[c.id] ? "check" : "flag")} ${c.title}</h3><p>${c.say}</p>
      <button class="btn small primary" data-c="${c.id}">${ML.icon("rocket")} ${done[c.id] ? "Run it again" : "Try it"}</button></div>`).join("");
    document.querySelectorAll("#chals [data-c]").forEach((b) => b.addEventListener("click", () => startChal(b.dataset.c)));
  }
  function startChal(id) {
    const c = CHAL[id];
    race.chal = c; race.mode = "top"; setLandButtons(c.land);
    document.querySelectorAll("#r-view button").forEach((x) => x.classList.toggle("on", x.dataset.m === "top"));
    Object.keys(extras).forEach((k) => setExtra(k, c.on.includes(k)));
    race.setLand(c.land); ML.say(c.say, $("#say2"));
    $("#race").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    setTimeout(() => race.run(), reduced ? 0 : 400);
  }
  renderChal();

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    [[play, 1], [race, race.speed]].forEach(([ar, sp]) => {
      if (!ar.running) return;
      ar.acc += dt * 20 * sp;
      let n = 0;
      while (ar.acc >= 1 && n < 40) { ar.acc -= 1; n++; ar.stepOnce(); if (ar.finished()) { ar.running = false; break; } }
      drawArena(ar.ctx, ar);
      if (!ar.running) { ar.onChange && ar.onChange(); }
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  new MutationObserver(() => { Object.keys(bgCache).forEach((k) => delete bgCache[k]); drawArena(play.ctx, play); drawArena(race.ctx, race); drawChart(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  play.reset(); race.reset();
  window.__lr = { play, race, startChal, C };
})();
