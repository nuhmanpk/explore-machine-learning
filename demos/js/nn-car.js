// Self-Driving Car — UI, drawing, round-by-round evolution, checkpoints,
// a live "inside the brain" explainer and learning by copying the player.
(function () {
  const { NeuralNetwork, World, Road, Car, makeTraffic, followRoad, CURVY } = window.CarSim;

  // ---------- canvases ----------
  const RW = 300, RH = 620; // road view
  const BW = 360, BH = 620; // brain view
  const CW = 660, CH = 120; // chart
  const road = ML.setupCanvas(document.getElementById("road"), RW, RH);
  const brain = ML.setupCanvas(document.getElementById("brain"), BW, BH);
  const chart = ML.setupCanvas(document.getElementById("chart"), CW, CH);

  let C = {};
  function readColors() {
    const dark = ML.isDark();
    C = {
      ink: ML.cssVar("--ink"), muted: ML.cssVar("--muted"), line: ML.cssVar("--line"), card: ML.cssVar("--card"),
      accent: ML.cssVar("--accent"), pos: ML.cssVar("--sup"), neg: ML.cssVar("--rl"), good: ML.cssVar("--good"),
      warn: ML.cssVar("--warn"), bg2: ML.cssVar("--bg-2"),
      grass: dark ? "#1b2a2a" : "#dcefd6", road: dark ? "#3a3d63" : "#c9cad6", lane: dark ? "#cfd0e8" : "#ffffff",
      me: "#3d6bff", copy: "#9b5cff", traffic: dark ? "#8f92b8" : "#7d7f95", dead: dark ? "#555878" : "#a9abbb",
    };
  }
  readColors();
  document.addEventListener("themechange", readColors);

  // ---------- state ----------
  const state = {
    playing: false,
    speed: 1,
    gen: 1,
    seed: 1,
    curve: 0,
    cross: false, // crossroads with traffic lights
    population: 200,
    mutation: 0.15,
    rays: 5,
    hidden: 6,
    parent: null,
    record: 0,
    history: [], // best distance per round
    checkpoints: [], // champion brain per round
    stuckRounds: 0,
    world: null,
    between: 0, // frames left in the pause between rounds
    human: null, // "you drive" mode
    replay: null, // watching a checkpoint
    saidBonk: false,
    origin: null, // "graduate" | "copycat" | null
    recorded: [], // {x, y} pairs from the player's driving
  };

  const meters = (px) => Math.max(0, Math.round(px / 10));
  const viewWorld = () => state.human || (state.replay && state.replay.world) || state.world;

  function newWorld() {
    state.world = new World({
      population: state.population,
      mutation: state.mutation,
      rays: state.rays,
      hidden: state.hidden,
      seed: state.seed,
      curve: state.curve,
      cross: state.cross,
      parent: state.parent,
    });
    state.saidBonk = false;
  }

  // ---------- narration ----------
  function introLine() {
    if (state.gen === 1 && !state.parent)
      return `Round 1! ${state.population} baby cars with <b>random brains</b>. They have no idea how to drive yet. Let's watch!`;
    if (state.origin === "graduate" && state.gen === 1) return `This is a <b>trained driver</b>. It practised on lots of straight and curvy roads. Watch it weave!`;
    if (state.origin === "copycat" && state.gen === 1)
      return `The front car is <b>your copycat</b>: it learned by watching you drive! The others are its babies with tweaks. Will any of them beat you?`;
    return `Round ${state.gen}! The champion's babies are off. Each has a <b>tiny random change</b> in its brain.`;
  }

  function endOfRound() {
    const w = state.world;
    const best = w.leader.bestProgress;
    const prevRecord = state.record;
    state.history.push({ best, finished: !!w.finished });
    state.parent = NeuralNetwork.clone(w.leader.brain);
    state.checkpoints.push({ gen: state.gen, brain: NeuralNetwork.clone(w.leader.brain), best, finished: !!w.finished, seed: state.seed, curve: state.curve, cross: state.cross });
    const ranRed = w.cars.filter((c) => c.ranRed).length;
    renderCheckpoints();

    if (w.finished) {
      state.record = Math.max(state.record, best);
      state.playing = false;
      syncPlay();
      document.getElementById("finish-cta").classList.add("show");
      flash("Finished!");
      ML.confetti();
      ML.xray.offer("It learned to drive! X-ray its brain");
      ML.say(
        state.origin
          ? `It made it through <b>all</b> the traffic! Press <b>New road</b> to give it a fresh challenge.`
          : `WOW! In round ${state.gen} a car got through <b>all</b> the traffic. It <b>learned to drive</b>! Can it handle a road it's never seen? Press <b>New road</b>.`
      );
      return false;
    }

    if (state.cross && ranRed > state.population * 0.3) {
      if (best > prevRecord + 5) state.record = best;
      ML.say(`Round ${state.gen}: <b>${ranRed}</b> cars drove through a <b>red light</b>! They haven't learned what the light eye means yet. The ones who waited did better.`);
    } else if (best > prevRecord + 5) {
      state.record = best;
      state.stuckRounds = 0;
      ML.say(`Round ${state.gen} done! The best car drove <b>${meters(best)} m</b>, a new record! It becomes the parent of the next babies.`);
    } else {
      state.stuckRounds++;
      if (state.stuckRounds >= 4)
        ML.say(`Hmm, stuck for ${state.stuckRounds} rounds. Try sliding <b>How different are they?</b> up a bit, so the babies try bolder ideas.`);
      else ML.say(`No new record this round. The champion's exact copy still leads, and the babies keep trying new tweaks.`);
    }
    return true;
  }

  function flash(text) {
    const o = document.getElementById("overlay");
    o.textContent = text;
    o.classList.add("show");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => o.classList.remove("show"), 1300);
  }

  // ---------- simulation tick ----------
  function tick() {
    if (state.human) return tickHuman();
    if (state.replay) {
      const w = state.replay.world;
      for (let i = 0, n = ML.ticks(state.speed, "replay"); i < n && !w.done; i++) w.step();
      if (w.done && !state.replay.ended) {
        state.replay.ended = true;
        const c = state.replay.ck;
        ML.say(w.finished
          ? `Round ${c.gen}'s champion made it all the way!`
          : `Round ${c.gen}'s champion got <b>${meters(w.leader.bestProgress)} m</b>. ${c.gen < state.gen - 1 ? "Later rounds do better. Try a newer checkpoint!" : ""}`);
        setTimeout(() => { if (state.replay && state.replay.ended) startReplay(state.replay.ck); }, 1600);
      }
      return;
    }
    if (!state.playing) return;
    if (state.between > 0) {
      state.between--;
      if (state.between === 0) {
        state.gen++;
        newWorld();
        flash(`Round ${state.gen}`);
        ML.say(introLine());
      }
      return;
    }
    const w = state.world;
    // Run up to `speed` steps, but stop when this frame's time budget is used up,
    // so turbo never freezes the page (it just simulates as fast as the computer allows).
    const t0 = performance.now();
    for (let i = 0, n = ML.ticks(state.speed); i < n && !w.done; i++) {
      w.step();
      if (performance.now() - t0 > 11) break;
    }
    if (state.gen === 1 && !state.parent && !state.saidBonk && w.alive < state.population * 0.5) {
      state.saidBonk = true;
      ML.say(`Bonk, bonk! Lots of crashes. That's okay: <b>trying and failing</b> is how learning starts.`);
    }
    if (w.done) {
      const goOn = endOfRound();
      if (goOn) state.between = state.speed >= 10 ? 10 : 45;
      updateChart();
    }
  }

  // ---------- drawing: road ----------
  let camY = 100, camX = 150;
  function drawRoad() {
    const ctx = road.ctx;
    const w = viewWorld();
    const focus = state.human ? state.human.car : w.front();
    const r = w.road;
    camY = ML.lerp(camY, focus.y, 0.15);
    camX = ML.lerp(camX, r.cx(camY), 0.2);
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 0, RW, RH);
    ctx.save();
    ctx.translate(RW / 2 - camX, -camY + RH * 0.72);
    const top = camY - RH * 0.72, bottom = top + RH;

    // road surface + lines as polylines so bends look right
    const ys = [];
    for (let y = bottom + 40; y >= top - 40; y -= 15) ys.push(y);
    ctx.fillStyle = C.road;
    ctx.beginPath();
    ys.forEach((y, i) => (i ? ctx.lineTo(r.cx(y) - r.width / 2, y) : ctx.moveTo(r.cx(y) - r.width / 2, y)));
    for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(r.cx(ys[i]) + r.width / 2, ys[i]);
    ctx.closePath();
    ctx.fill();
    const line = (off, dash, width) => {
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ys.forEach((y, i) => (i ? ctx.lineTo(r.cx(y) + off, y) : ctx.moveTo(r.cx(y) + off, y)));
      ctx.stroke();
    };
    ctx.strokeStyle = C.lane;
    for (let i = 1; i < r.laneCount; i++) line(-r.width / 2 + (i * r.width) / r.laneCount, [22, 22], 4);
    line(-r.width / 2, [], 5);
    line(r.width / 2, [], 5);
    ctx.setLineDash([]);

    // finish + start lines
    const fy = state.human ? state.human.finishLineY() : w.finishLineY();
    if (fy > top - 20 && fy < bottom + 20) drawChecker(ctx, r.cx(fy) - r.width / 2, fy - 10, r.width, 20);
    const sy = (state.human ? state.human.startY : w.startY) + 40;
    if (sy > top && sy < bottom) { ctx.fillStyle = C.lane; ctx.fillRect(r.cx(sy) - r.width / 2, sy, r.width, 4); }

    const env = state.human ? state.human.env : w;
    for (const c of env.crossings) if (c.y > top - 120 && c.y < bottom + 120) drawCrossing(ctx, r, c, top);
    for (const t of env.crossCars) if (t.y > top - 60 && t.y < bottom + 60) drawCar(ctx, t, "#e0533d", 1);
    for (const t of w.traffic) if (t.y > top - 60 && t.y < bottom + 60) drawCar(ctx, t, C.traffic, 1);

    if (state.human) {
      const car = state.human.car;
      drawSensor(ctx, car.sensor);
      drawCar(ctx, car, car.damaged ? C.dead : C.me, 1, true);
    } else {
      const lead = focus;
      for (const car of w.cars) {
        if (car === lead || car.y < top - 60 || car.y > bottom + 60) continue;
        if (car.damaged) { if (car.diedAt && w.steps - car.diedAt < 40) drawCar(ctx, car, C.dead, 0.25); continue; }
        drawCar(ctx, car, C.me, 0.18);
      }
      drawSensor(ctx, lead.sensor);
      const col = lead.damaged ? C.dead : state.origin === "copycat" && lead.index === 0 && state.gen === 1 ? C.copy : C.me;
      drawCar(ctx, lead, col, 1, true);
    }
    ctx.restore();

    if (state.replay) {
      ctx.fillStyle = "rgba(31,33,64,.82)";
      ctx.beginPath(); ctx.roundRect(10, 10, RW - 20, 30, 10); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "800 13px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`Replaying checkpoint: round ${state.replay.ck.gen}`, RW / 2, 30);
    }
  }

  function drawCrossing(ctx, r, c, top) {
    // the cross street
    ctx.fillStyle = C.road;
    ctx.fillRect(camX - RW, c.y - 40, RW * 2, 80);
    ctx.strokeStyle = C.lane; ctx.lineWidth = 3; ctx.setLineDash([16, 14]);
    ctx.beginPath(); ctx.moveTo(camX - RW, c.y); ctx.lineTo(r.left, c.y); ctx.moveTo(r.right, c.y); ctx.lineTo(camX + RW, c.y); ctx.stroke();
    ctx.setLineDash([]);
    // zebra crossing + stop line
    ctx.fillStyle = C.lane;
    for (let x = r.left + 6; x < r.right - 6; x += 18) ctx.fillRect(x, c.y + 44, 10, 10);
    ctx.fillStyle = c.red ? C.neg : C.lane;
    ctx.fillRect(r.left, c.y + 58, r.width, c.red ? 5 : 3);
    // traffic light on a pole, right side
    const lx = r.right + 14, ly = c.y + 70;
    ctx.fillStyle = "#1f2140"; ctx.fillRect(lx - 2, ly, 4, 26);
    ctx.beginPath(); ctx.roundRect(lx - 9, ly - 50, 18, 52, 6); ctx.fill();
    const lamp = (y, on, col, off) => { ctx.fillStyle = on ? col : off; ctx.beginPath(); ctx.arc(lx, y, 6, 0, Math.PI * 2); ctx.fill(); };
    lamp(ly - 40, c.red, "#ff4d5e", "#4a2a35");
    lamp(ly - 24, c.yellow, "#ffc531", "#4a4128");
    lamp(ly - 8, !c.red && !c.yellow, "#2fbf62", "#1f4a2e");
  }

  function drawChecker(ctx, x, y, w, h) {
    const s = 10;
    for (let i = 0; i * s < w; i++)
      for (let j = 0; j * s < h; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#222" : "#fff";
        ctx.fillRect(x + i * s, y + j * s, Math.min(s, w - i * s), s);
      }
  }

  function drawSensor(ctx, sensor) {
    if (!sensor || !sensor.rays.length) return;
    ctx.lineWidth = 2;
    sensor.rays.forEach((ray, i) => {
      const hit = sensor.readings[i];
      const end = hit || ray[1];
      ctx.strokeStyle = C.warn;
      ctx.beginPath(); ctx.moveTo(ray[0].x, ray[0].y); ctx.lineTo(end.x, end.y); ctx.stroke();
      if (hit) {
        ctx.strokeStyle = "rgba(20,20,40,.5)";
        ctx.beginPath(); ctx.moveTo(hit.x, hit.y); ctx.lineTo(ray[1].x, ray[1].y); ctx.stroke();
        ctx.fillStyle = C.neg;
        ctx.beginPath(); ctx.arc(hit.x, hit.y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  function drawCar(ctx, car, color, alpha, outline) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(car.x, car.y);
    ctx.rotate(-car.angle);
    const w = car.width, h = car.height;
    ctx.fillStyle = "#1f2140";
    ctx.fillRect(-w / 2 - 2, -h / 2 + 7, 4, 10);
    ctx.fillRect(w / 2 - 2, -h / 2 + 7, 4, 10);
    ctx.fillRect(-w / 2 - 2, h / 2 - 17, 4, 10);
    ctx.fillRect(w / 2 - 2, h / 2 - 17, 4, 10);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 8); ctx.fill();
    if (outline) { ctx.strokeStyle = "#1f2140"; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = "rgba(20,24,60,.55)";
    ctx.beginPath(); ctx.roundRect(-w / 2 + 4, -h / 2 + 10, w - 8, 10, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-w / 2 + 5, h / 2 - 15, w - 10, 7, 3); ctx.fill();
    ctx.fillStyle = "#ffe27a";
    ctx.fillRect(-w / 2 + 3, -h / 2 + 1, 6, 3);
    ctx.fillRect(w / 2 - 9, -h / 2 + 1, 6, 3);
    ctx.restore();
  }

  // ---------- drawing: brain ----------
  const OUT_DIRS = ["arrow-up", "arrow-left", "arrow-right", "arrow-down"];
  const OUT_NAMES = ["GAS", "LEFT", "RIGHT", "BRAKE"];
  function drawArrow(ctx, x, y, dir, color, size = 11) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate({ "arrow-up": 0, "arrow-right": Math.PI / 2, "arrow-down": Math.PI, "arrow-left": -Math.PI / 2 }[dir]);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(0, -size); ctx.moveTo(-size * 0.7, -size * 0.3); ctx.lineTo(0, -size); ctx.lineTo(size * 0.7, -size * 0.3); ctx.stroke();
    ctx.restore();
  }

  // Is this neuron "on"? Step brains output 0/1; smooth (copycat) brains output 0..1.
  const fired = (v, li) => (li === 0 ? v > 0 : v > 0.5);

  function drawBrain(t) {
    const ctx = brain.ctx;
    ctx.clearRect(0, 0, BW, BH);
    if (state.human) return drawHumanPanel(ctx);
    const car = viewWorld().front();
    const net = car.brain;
    const counts = NeuralNetwork.shape(net);
    const rows = counts.length;
    const top = 64, bottom = BH - 70, left = 30, right = BW - 30;
    const rowY = (i) => ML.lerp(bottom, top, i / (rows - 1));
    const nodeX = (n, j) => (n === 1 ? (left + right) / 2 : ML.lerp(left, right, j / (n - 1)));
    const values = [car.inputs || new Array(counts[0]).fill(0), ...net.levels.map((l) => l.outputs)];

    net.levels.forEach((level, li) => {
      const nIn = counts[li], nOut = counts[li + 1];
      const scale = Math.max(1, ...level.weights.flat().map(Math.abs));
      for (let i = 0; i < nIn; i++)
        for (let j = 0; j < nOut; j++) {
          const wgt = level.weights[i][j] / scale;
          const active = fired(values[li][i], li);
          ctx.strokeStyle = wgt > 0 ? C.pos : C.neg;
          ctx.globalAlpha = active ? 0.25 + Math.abs(wgt) * 0.75 : 0.08 + Math.abs(wgt) * 0.2;
          ctx.lineWidth = active ? 1 + Math.abs(wgt) * 3 : 1;
          ctx.setLineDash(active ? [7, 5] : []);
          ctx.lineDashOffset = -t * 0.04;
          ctx.beginPath();
          ctx.moveTo(nodeX(nIn, i), rowY(li));
          ctx.lineTo(nodeX(nOut, j), rowY(li + 1));
          ctx.stroke();
        }
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    counts.forEach((n, li) => {
      for (let j = 0; j < n; j++) {
        const x = nodeX(n, j), y = rowY(li), v = values[li][j] || 0;
        const r = li === rows - 1 ? 20 : Math.min(15, (right - left) / n / 2 - 1);
        ctx.fillStyle = C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (v > 0.02) {
          ctx.fillStyle = C.warn;
          ctx.globalAlpha = li === 0 || net.soft ? 0.25 + v * 0.75 : 1;
          ctx.beginPath(); ctx.arc(x, y, r - 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
        if (li === rows - 1) drawArrow(ctx, x, y, OUT_DIRS[j], fired(v, li) ? C.ink : C.muted, 8);
        if (li === 0) {
          const lightIdx = car.lightEye ? (net.useSpeed ? n - 2 : n - 1) : -1;
          if (j === lightIdx) {
            ctx.fillStyle = v > 0 ? "#ff4d5e" : C.muted; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
          } else if (net.useSpeed && j === n - 1) {
            ctx.fillStyle = C.ink; ctx.font = "800 9px Nunito, sans-serif"; ctx.textAlign = "center";
            ctx.fillText("SPD", x, y + 3);
          } else {
            const nr = n - (net.useSpeed ? 1 : 0) - (car.lightEye ? 1 : 0);
            const a = nr === 1 ? 0 : ML.lerp(Math.PI / 4, -Math.PI / 4, j / (nr - 1));
            ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.sin(a) * 9, y - Math.cos(a) * 9); ctx.stroke();
          }
        }
      }
    });

    ctx.fillStyle = C.muted;
    ctx.font = "800 12px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WHAT IT DOES: GAS · LEFT · RIGHT · BRAKE", BW / 2, 26);
    ctx.fillText("WHAT ITS EYES FEEL", BW / 2, BH - 22);
    if (rows > 2) { ctx.textAlign = "left"; ctx.fillText("thinking", 4, rowY(1) - 26); }
    ctx.textAlign = "left";
    ctx.fillStyle = C.pos; ctx.fillRect(10, BH - 52, 14, 4); ctx.fillStyle = C.muted; ctx.fillText("+ push", 28, BH - 46);
    ctx.fillStyle = C.neg; ctx.fillRect(BW - 90, BH - 52, 14, 4); ctx.fillStyle = C.muted; ctx.fillText("− hold back", BW - 72, BH - 46);
  }

  function drawHumanPanel(ctx) {
    const car = state.human.car;
    const readings = car.sensor.readings.map((r) => (r ? 1 - r.offset : 0));
    ctx.fillStyle = C.ink; ctx.font = "700 22px Fredoka, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("You are the brain now!", BW / 2, 50);
    ctx.font = "700 14px Nunito, sans-serif"; ctx.fillStyle = C.muted;
    ctx.fillText("These are the numbers the car's eyes send.", BW / 2, 76);
    ctx.fillText("A robot brain only ever sees this!", BW / 2, 96);
    const n = readings.length, bw = 30, gap = (BW - 40 - n * bw) / Math.max(1, n - 1);
    readings.forEach((v, i) => {
      const x = 20 + i * (bw + gap), h = 220, y = 140;
      ctx.fillStyle = C.bg2; ctx.fillRect(x, y, bw, h);
      ctx.fillStyle = v > 0.6 ? C.neg : C.warn; ctx.fillRect(x, y + h * (1 - v), bw, h * v);
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, h);
      ctx.fillStyle = C.ink; ctx.font = "700 12px ui-monospace, monospace";
      ctx.fillText(v.toFixed(2), x + bw / 2, y + h + 18);
    });
    const c = car.controls;
    [["forward", "arrow-up"], ["left", "arrow-left"], ["right", "arrow-right"], ["reverse", "arrow-down"]].forEach(([k, d], i) => {
      const x = BW / 2 - 105 + i * 70, y = 470;
      ctx.fillStyle = c[k] ? C.warn : C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(x - 26, y - 26, 52, 52, 12); ctx.fill(); ctx.stroke();
      drawArrow(ctx, x, y, d, C.ink, 12);
    });
    ctx.fillStyle = C.muted; ctx.font = "700 14px Nunito, sans-serif";
    ctx.fillText(`Distance: ${meters(state.human.startY - car.y)} m`, BW / 2, 540);
    if (car.damaged) { ctx.fillStyle = C.neg; ctx.font = "700 20px Fredoka, sans-serif"; ctx.fillText("Bonk! Press gas to try again", BW / 2, 580); }
  }

  // ---------- "what's happening inside" ----------
  function eyeName(i, n) {
    if (n === 1) return "front";
    const a = ML.lerp(1, -1, i / (n - 1)); // +1 = far left, -1 = far right
    if (a > 0.6) return "far-left";
    if (a > 0.2) return "left";
    if (a >= -0.2) return "front";
    if (a >= -0.6) return "right";
    return "far-right";
  }
  let insideTick = 0;
  function renderInside() {
    if (++insideTick % 12) return;
    const host = document.getElementById("inside");
    if (state.human) {
      host.innerHTML = `<div>You are the brain! Each move you make is saved as an example: <b>what the eyes saw → which keys you pressed</b>.</div>`;
      return;
    }
    const car = viewWorld().front();
    if (!car.inputs) return;
    const net = car.brain;
    const nr = car.inputs.length - (net.useSpeed ? 1 : 0) - (car.lightEye ? 1 : 0);
    const seen = car.inputs.slice(0, nr).map((v, i) => ({ v, i })).filter((e) => e.v > 0.05).sort((a, b) => b.v - a.v);
    const eyes = seen.length
      ? seen.slice(0, 2).map((e) => `<b>${eyeName(e.i, nr)}</b> eye feels something ${e.v > 0.6 ? "very close" : e.v > 0.3 ? "close" : "far away"} (${e.v.toFixed(2)})`).join("<br>")
      : `All eyes see an <b>empty road</b> (all zeros)`;
    const hidden = net.levels[0].outputs;
    const on = hidden.map((v, i) => [v, i]).filter(([v]) => fired(v, 1)).map(([, i]) => i + 1);
    const outs = net.levels[net.levels.length - 1].outputs;
    const acts = outs.map((v, i) => [v, i]).filter(([v]) => fired(v, 1)).map(([, i]) => OUT_NAMES[i]);
    // Strongest reason for the first action: input → hidden → output with the biggest push.
    let why = "";
    const ai = outs.findIndex((v) => fired(v, 1));
    if (ai >= 0 && net.levels.length > 1 && seen.length) {
      let best = null;
      const L1 = net.levels[0], L2 = net.levels[1];
      for (const e of seen) for (let h = 0; h < hidden.length; h++) {
        if (!fired(hidden[h], 1)) continue;
        const s = e.v * L1.weights[e.i][h] * L2.weights[h][ai];
        if (!best || s > best.s) best = { s, e, h };
      }
      if (best && best.s > 0) why = `<div class="muted" style="font-weight:700">Why ${OUT_NAMES[ai]}? The ${eyeName(best.e.i, nr)} eye pushed thinking-neuron ${best.h + 1}, which pushes ${OUT_NAMES[ai]}.</div>`;
    }
    const lightLine = car.lightEye
      ? `<div>${ML.icon("target")} Light eye: <b style="color:${car.light > 0 ? "var(--bad)" : "var(--good)"}">${car.light > 0 ? `red or yellow light ahead (${car.light.toFixed(2)})` : "green, keep going"}</b></div>` : "";
    host.innerHTML = `<div>${ML.icon("eye")} ${eyes}</div>${lightLine}
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("network")} Thinking neurons on: <b>${on.length ? on.join(", ") : "none"}</b></div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("car")} It presses: <b style="color:var(--accent)">${acts.length ? acts.join(" + ") : "nothing (coasting)"}</b></div>${why}`;
  }

  // ---------- chart ----------
  function updateChart() {
    const ctx = chart.ctx;
    ctx.clearRect(0, 0, CW, CH);
    const course = state.world.courseLength();
    const h = state.history.slice(-40);
    const pad = 6, bw = (CW - pad * 2) / 40;
    ctx.strokeStyle = C.good; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(CW, 14); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.good; ctx.font = "800 11px Nunito, sans-serif"; ctx.textAlign = "right";
    ctx.fillText("FINISH", CW - 4, 10);
    if (!h.length) {
      ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.font = "700 14px Nunito, sans-serif";
      ctx.fillText("Each round adds a bar here", CW / 2, CH / 2 + 10);
      return;
    }
    const first = Math.max(0, state.history.length - 40);
    h.forEach((r, i) => {
      const v = ML.clamp(r.best / course, 0, 1);
      const bh = v * (CH - 30);
      const x = pad + i * bw;
      ctx.fillStyle = r.finished ? C.good : C.accent;
      ctx.beginPath(); ctx.roundRect(x + 2, CH - 14 - bh, bw - 4, Math.max(2, bh), 4); ctx.fill();
      ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.font = "700 9px Nunito, sans-serif";
      if (h.length < 20 || i % 5 === 0) ctx.fillText(first + i + 1, x + bw / 2, CH - 3);
    });
  }

  // ---------- checkpoints ----------
  function drawMiniNet(canvas, net) {
    const c = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    const counts = NeuralNetwork.shape(net);
    const rowY = (i) => ML.lerp(H - 10, 10, i / (counts.length - 1));
    const nodeX = (n, j) => (n === 1 ? W / 2 : ML.lerp(12, W - 12, j / (n - 1)));
    net.levels.forEach((l, li) => {
      const scale = Math.max(1, ...l.weights.flat().map(Math.abs));
      for (let i = 0; i < counts[li]; i++)
        for (let j = 0; j < counts[li + 1]; j++) {
          const w = l.weights[i][j] / scale;
          c.strokeStyle = w > 0 ? C.pos : C.neg;
          c.globalAlpha = 0.15 + Math.abs(w) * 0.8;
          c.lineWidth = 0.5 + Math.abs(w) * 2.5;
          c.beginPath(); c.moveTo(nodeX(counts[li], i), rowY(li)); c.lineTo(nodeX(counts[li + 1], j), rowY(li + 1)); c.stroke();
        }
    });
    c.globalAlpha = 1;
    counts.forEach((n, li) => { for (let j = 0; j < n; j++) { c.fillStyle = C.ink; c.beginPath(); c.arc(nodeX(n, j), rowY(li), 3.5, 0, Math.PI * 2); c.fill(); } });
  }
  function renderCheckpoints() {
    const host = document.getElementById("ckpts");
    if (!state.checkpoints.length) {
      host.innerHTML = `<span class="muted">Each finished round saves its champion here.</span>`;
      return;
    }
    // keep round 1 plus the most recent ones
    const list = state.checkpoints.length > 14 ? [state.checkpoints[0], ...state.checkpoints.slice(-13)] : state.checkpoints;
    host.innerHTML = (state.replay ? `<button class="ckpt" data-live="1" style="display:grid;place-items:center;align-content:center;gap:6px"><b>Back to training</b>${ML.icon("play")}</button>` : "") +
      list.map((c) => `<button class="ckpt ${state.replay && state.replay.ck === c ? "on" : ""}" data-g="${c.gen}" data-k="${state.checkpoints.indexOf(c)}">
        <canvas width="216" height="96"></canvas><b>Round ${c.gen}</b>${c.finished ? "Finished!" : meters(c.best) + " m"}</button>`).join("");
    host.querySelectorAll(".ckpt[data-k]").forEach((b) => {
      const c = state.checkpoints[+b.dataset.k];
      drawMiniNet(b.querySelector("canvas"), c.brain);
      b.addEventListener("click", () => startReplay(c));
    });
    const live = host.querySelector("[data-live]");
    if (live) live.addEventListener("click", stopReplay);
    host.scrollLeft = host.scrollWidth;
  }
  function startReplay(ck) {
    if (state.human) exitHuman();
    state.playing = false;
    syncPlay();
    state.replay = { ck, world: new World({ population: 1, parent: ck.brain, seed: ck.seed, curve: ck.curve, cross: ck.cross }), ended: false };
    if (!startReplay.quiet) ML.say(`Watching the champion from <b>round ${ck.gen}</b> on its road. ${ck.gen === 1 ? "Round 1 brains were mostly luck!" : "See how its brain lines look different from round 1?"}`);
    renderCheckpoints();
  }
  function stopReplay() {
    state.replay = null;
    renderCheckpoints();
    ML.say(`Back to training! Press <b>Play</b> to keep the rounds going.`);
  }

  // ---------- stats ----------
  function updateStats() {
    const $ = (id) => document.getElementById(id);
    if (state.human) { $("st-rec").textContent = state.recorded.length; return; }
    const w = state.world;
    $("st-gen").textContent = state.gen;
    $("st-alive").textContent = w.alive ?? w.cars.length;
    $("st-best").innerHTML = `${meters(w.leader.bestProgress)}<small> m</small>`;
    $("st-record").innerHTML = `${meters(Math.max(state.record, w.leader.bestProgress))}<small> m</small>`;
    const p = ML.clamp(w.leader.bestProgress / w.courseLength(), 0, 1);
    $("prog").style.width = (p * 100).toFixed(1) + "%";
    $("prog-txt").textContent = Math.round(p * 100) + "%";
  }

  // ---------- "you drive" mode ----------
  class HumanRun {
    constructor(seed, rays, curve, cross) {
      // An empty World supplies the road, traffic, lights and cross traffic.
      this.env = new World({ population: 0, seed, curve, cross });
      this.road = this.env.road;
      this.traffic = this.env.traffic;
      this.startY = 100;
      this.car = new Car(this.road.laneX(1, this.startY), this.startY, "KEYS", { rays });
      this.car.sensor.update(this.road.bordersNear(this.car.y), this.traffic);
    }
    get steps() { return this.env.steps; }
    finishLineY() { return this.env.finishLineY(); }
    step() {
      const e = this.env;
      e.steps++;
      e.envStep();
      this.car.update(e.bordersAt(this.car.y), e.trafficNear(this.car.y), e.lightAt(this.car.y), e.cross ? e.wallsAt(this.car.y) : []);
      if (this.car.ranRed) ML.say(`Beep! You drove through a <b>red light</b>. Wait for green next time!`);
      if (!this.won && !this.car.damaged && this.car.y < this.finishLineY()) {
        this.won = true;
        ML.confetti();
        ML.say(`You made it to the finish! Now press <b>Teach a car to copy me</b> and see if a robot can learn from you.`);
      }
    }
  }
  const keys = { forward: false, left: false, right: false, reverse: false };
  function tickHuman() {
    const h = state.human;
    Object.assign(h.car.controls, keys);
    if (h.car.damaged) {
      if (keys.forward && !h.waitRelease) startHuman();
      if (h.car.ranRed && !keys.forward) h.waitRelease = false;
      if (!keys.forward) h.waitRelease = false;
      return;
    }
    // Save one lesson: what the eyes saw (and how fast we were going) → which keys were held.
    const x = window.CarCore.lessonInput(h.car.sensor.readings, state.cross, state.cross ? h.env.lightAt(h.car.y) : 0, h.car.speed / h.car.maxSpeed);
    if (h.steps > 0 && state.recorded.length < 30000) state.recorded.push({ x, y: window.CarCore.lessonLabel(keys) });
    h.step();
    if (h.car.damaged && !h.car.ranRed) {
      h.waitRelease = keys.forward;
      ML.say(`Bonk! Driving is tricky, right? Press gas to try again. Your good driving is still saved: <b>${state.recorded.length}</b> moves so far.`);
    }
    syncCopyBtn();
  }
  function startHuman() {
    state.human = new HumanRun(state.seed, state.rays, state.curve, state.cross);
  }
  function syncCopyBtn() {
    const n = state.recorded.length;
    const btn = document.getElementById("copy");
    btn.disabled = n < 300;
    document.getElementById("copy-hint").textContent = n < 300 ? `Drive a bit more: ${300 - n} moves to go.` : `Ready! More driving = a better copycat.`;
  }
  const keyMap = { ArrowUp: "forward", KeyW: "forward", ArrowDown: "reverse", KeyS: "reverse", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
  document.addEventListener("keydown", (e) => {
    if (!state.human || !keyMap[e.code]) return;
    e.preventDefault();
    keys[keyMap[e.code]] = true;
  });
  document.addEventListener("keyup", (e) => { if (keyMap[e.code]) keys[keyMap[e.code]] = false; });
  document.querySelectorAll(".drive-pad [data-k]").forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); keys[k] = true; b.classList.add("pressed"); };
    const off = () => { keys[k] = false; b.classList.remove("pressed"); };
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointerleave", off);
    b.addEventListener("pointercancel", off);
  });

  // ---------- learning by copying (behaviour cloning) ----------
  // A smooth network [eyes + speed → 8 → 4] trained with backpropagation to press
  // the same keys the player pressed when its eyes saw the same thing.
  async function trainCopycat() {
    const data = state.recorded;
    const net = window.CarCore.makeCopycat(data[0].x.length);
    const lr = 0.3, epochs = 60, batch = 32;
    const btn = document.getElementById("copy");
    btn.disabled = true;
    for (let ep = 0; ep < epochs; ep++) {
      const avg = window.CarCore.trainEpoch(net, data, lr, batch);
      if (ep % 5 === 0 || ep === epochs - 1) {
        btn.innerHTML = `${ML.icon("cpu")} Practising… ${Math.round(((ep + 1) / epochs) * 100)}%`;
        ML.say(`Practice round ${ep + 1}: the copycat's <b>oopsie score</b> is ${avg.toFixed(3)}. ${ep > 10 ? "Going down, so it's learning your style!" : "It starts by guessing randomly…"}`);
        await new Promise((r) => setTimeout(r, 30));
      }
    }
    btn.innerHTML = `${ML.icon("teacher")} Teach a car to copy me`;
    return net;
  }
  document.getElementById("copy").addEventListener("click", async () => {
    if (state.recorded.length < 300) return;
    const net = await trainCopycat();
    exitHuman();
    state.parent = net;
    state.rays = net.levels[0].weights.length - 1 - (state.cross ? 1 : 0);
    setRange("eyes", state.rays);
    state.hidden = 8;
    setRange("hidden", 8);
    state.origin = "copycat";
    resetRounds();
    newWorld();
    state.playing = true;
    syncPlay();
    flash("Your copycat!");
    ML.say(introLine());
  });

  // ---------- controls ----------
  const playBtn = document.getElementById("play");
  function syncPlay() {
    playBtn.innerHTML = state.playing ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} Play`;
  }
  playBtn.addEventListener("click", () => {
    if (state.human) exitHuman();
    if (state.replay) { state.replay = null; renderCheckpoints(); }
    state.playing = !state.playing;
    if (state.playing && state.world.done) state.between = 1;
    if (state.playing && state.gen === 1 && state.world.steps === 0) ML.say(introLine());
    syncPlay();
  });

  document.getElementById("skip").addEventListener("click", () => {
    if (state.human || state.replay) return;
    const w = state.world;
    if (!w.done) {
      w.done = true;
      const goOn = endOfRound();
      updateChart();
      if (goOn) { state.between = 1; if (!state.playing) { state.playing = true; syncPlay(); } }
    } else {
      state.between = 1;
      state.playing = true;
      syncPlay();
    }
  });

  function resetRounds() {
    state.gen = 1;
    state.record = 0;
    state.history = [];
    state.checkpoints = [];
    state.stuckRounds = 0;
    state.between = 0;
    state.replay = null;
    document.getElementById("finish-cta").classList.remove("show");
    renderCheckpoints();
    updateChart();
  }
  function restart(msg) {
    state.parent = null;
    state.origin = null;
    resetRounds();
    newWorld();
    updateChart();
    ML.say(msg || introLine());
  }
  document.getElementById("restart").addEventListener("click", () => {
    restart(`All learning erased! Back to ${state.population} silly baby brains. Press <b>Play</b>.`);
  });

  function newRoad(msg) {
    if (state.human) exitHuman();
    state.seed = Math.floor(Math.random() * 1e6) + 2;
    state.record = 0;
    state.history = [];
    state.between = 0;
    state.stuckRounds = 0;
    state.replay = null;
    document.getElementById("finish-cta").classList.remove("show");
    newWorld();
    updateChart();
    renderCheckpoints();
    state.playing = true;
    syncPlay();
    flash("New road!");
    ML.say(msg || (state.parent
      ? `Brand-new road! Will our champion cope with traffic it has <b>never seen</b>? If it crashes, it will keep learning.`
      : `Brand-new road! Our babies still have random brains. Let's go!`));
  }
  document.getElementById("newroad").addEventListener("click", () => newRoad());

  document.querySelectorAll("#shape button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#shape button").forEach((x) => x.classList.toggle("on", x === b));
      const v = +b.dataset.v;
      const wasCross = state.cross;
      state.curve = v === 1 ? CURVY : 0;
      state.cross = v === 2;
      if (wasCross !== state.cross) { state.parent = null; state.origin = null; resetRounds(); }
      if (state.human) { startHuman(); return; }
      if (state.cross) {
        newRoad(`Crossroads! Each car gets a new <b>light eye</b> that glows when a red light is ahead. Drive through red = crash. Will they learn to <b>brake and wait</b>?`);
        return;
      }
      newRoad(state.curve
        ? `Curvy road! Now the cars must <b>steer</b> along the bends, not just dodge. ${state.parent ? "Our champion learned on a straight road, so watch it struggle, then improve." : ""}`
        : `Back to a straight road.`);
    })
  );

  document.getElementById("graduate").addEventListener("click", () => {
    if (state.human) exitHuman();
    if (!window.CAR_GRADUATE) return ML.toast("Trained brain not found");
    if (state.cross) return ML.toast("The trained driver only knows straight and curvy roads. Let the crossroads cars learn!");
    const g = NeuralNetwork.fromData(window.CAR_GRADUATE);
    const shape = NeuralNetwork.shape(g);
    state.rays = shape[0];
    state.hidden = shape[1];
    setRange("eyes", state.rays);
    setRange("hidden", state.hidden);
    state.parent = g;
    state.origin = "graduate";
    resetRounds();
    newWorld();
    state.playing = true;
    syncPlay();
    flash("Trained driver");
    ML.say(introLine());
  });

  function setRange(id, v) {
    const el = document.getElementById(id);
    el.value = v;
    const out = document.querySelector(`[data-for="${id}"]`);
    if (out) out.textContent = v;
  }

  document.querySelectorAll("#speed button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
      state.speed = +b.dataset.v;
      if (state.speed >= 10) ML.say(`Zoom! In turbo mode, rounds fly by. Watch the bars and checkpoints pile up.`);
    })
  );

  ML.bindRange("#pop", (v) => v, (v) => (state.population = v));
  ML.bindRange("#mut", (v) => Math.round(v * 100) + "%", (v) => (state.mutation = v));
  let built = false;
  ML.bindRange("#eyes", (v) => v, (v) => {
    state.rays = v;
    if (built) restart(`Now each car has <b>${v} eye${v > 1 ? "s" : ""}</b>. New brains, so we start over!`);
  });
  ML.bindRange("#hidden", (v) => v, (v) => {
    state.hidden = v;
    if (built) restart(`The brain now has <b>${v} thinking neuron${v > 1 ? "s" : ""}</b>. Starting over!`);
  });
  built = true;

  const driveBtn = document.getElementById("drive");
  function exitHuman() {
    state.human = null;
    document.getElementById("drive-ui").classList.add("hidden");
    driveBtn.innerHTML = `${ML.icon("gamepad")} I want to drive!`;
    document.getElementById("brain-label").textContent = "Best car's brain";
  }
  driveBtn.addEventListener("click", () => {
    if (state.human) {
      exitHuman();
      ML.say(`Back to the robots! Press <b>Play</b> to keep them learning.`);
      return;
    }
    state.playing = false;
    syncPlay();
    state.replay = null;
    renderCheckpoints();
    startHuman();
    document.getElementById("drive-ui").classList.remove("hidden");
    driveBtn.innerHTML = `${ML.icon("x")} Stop driving`;
    document.getElementById("brain-label").textContent = "What you see";
    syncCopyBtn();
    document.querySelector(".canvas-box").scrollIntoView({ behavior: "smooth", block: "start" });
    ML.say(`Your turn! Drive with the arrows. Every move is saved so a robot car can <b>learn by copying you</b>.`);
  });

  // ---------- Model X-ray ----------
  // Situations the leading car really met, so the X-ray judges the brain on real driving.
  const seen = [];
  setInterval(() => {
    const c = !state.human && viewWorld().front();
    if (c && c.inputs && !c.damaged) { seen.push(c.inputs.slice()); if (seen.length > 400) seen.shift(); }
  }, 120);
  const xrayBrain = () => (state.replay ? state.replay.ck.brain : state.parent || state.world.front().brain);
  function inputList() {
    const net = xrayBrain();
    const n = NeuralNetwork.shape(net)[0];
    const lightEye = state.cross;
    const rays = n - (net.useSpeed ? 1 : 0) - (lightEye ? 1 : 0);
    const list = [];
    for (let i = 0; i < rays; i++) list.push({ name: `${eyeName(i, rays)} eye`.replace(/^./, (c) => c.toUpperCase()), min: 0, max: 1, describe: (v) => (v < 0.05 ? "clear" : v > 0.6 ? "very close" : v > 0.3 ? "close" : "far") });
    if (lightEye) list.push({ name: "Light eye", min: 0, max: 1, describe: (v) => (v > 0.05 ? "red ahead" : "green") });
    if (net.useSpeed) list.push({ name: "Speed", min: 0, max: 1, describe: (v) => `${Math.round(v * 100)}%` });
    return list;
  }
  // Scores for each pedal: how far past its "fire" line the output neuron is.
  function margins(x) {
    const net = xrayBrain();
    let a = x;
    net.levels.forEach((L, li) => {
      const last = li === net.levels.length - 1;
      a = L.biases.map((b, j) => {
        let s = -b;
        for (let i = 0; i < a.length; i++) s += a[i] * L.weights[i][j];
        if (last) return s;
        return net.soft ? 1 / (1 + Math.exp(-s)) : s > 0 ? 1 : 0;
      });
    });
    return a;
  }
  function registerXray() {
    ML.xray.register({
      title: state.origin === "copycat" ? "Your copycat driver" : state.origin === "graduate" ? "The trained driver" : `Champion of round ${Math.max(1, state.gen - 1)}`,
      kind: "Neural network",
      summary: () => `${state.gen} rounds of evolution · ${state.curve ? "curvy" : state.cross ? "crossroads" : "straight"} road`,
      size: () => { const n = xrayBrain(); return `${n.levels.reduce((t, L) => t + L.weights.length * L.biases.length + L.biases.length, 0)} knobs`; },
      stats: () => [["Rounds", state.gen], ["Record", `${meters(state.record)} m`], ["Layers", NeuralNetwork.shape(xrayBrain()).join(" → ")]],
      inputs: inputList(),
      outputs: [{ name: "Gas", color: ML.cssVar("--good") }, { name: "Left", color: ML.cssVar("--sup") }, { name: "Right", color: ML.cssVar("--nn") }, { name: "Brake", color: ML.cssVar("--bad") }],
      predict: margins,
      samples: () => seen.filter((x) => x.length === inputList().length),
      current: () => { const c = viewWorld().front(); return c.inputs ? c.inputs.slice() : null; },
      drawBrain: (cv) => {
        const tmp = document.createElement("canvas");
        tmp.width = 216; tmp.height = 96;
        drawMiniNet(tmp, xrayBrain());
        const ctx = cv.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
      },
      brainCaption: "Bottom row = eyes, middle = thinking neurons, top = gas · left · right · brake. Blue lines push a neuron on, orange lines hold it back; thicker = stronger.",
      notes: ["The cars only ever see these few numbers. Everything they 'know' about traffic is squeezed into the knobs of this little network."],
    });
  }
  ML.xray.button(document.getElementById("play").parentElement);
  const _open = ML.xray.open;
  ML.xray.open = () => { registerXray(); _open(); };

  // ---------- main loop ----------
  newWorld();
  updateChart();
  syncPlay();
  function frame(t) {
    tick();
    drawRoad();
    drawBrain(t);
    renderInside();
    updateStats();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Alive count chip on the canvas + "Show alive count" toggle.
  AliveChip.init({ label: "Still driving", count: () => (state.human || state.replay ? null : [state.world.alive ?? state.world.cars.length, state.world.cars.length]), toggleHost: ".tab-body[data-t=babies]", corner: "road" });
})();
