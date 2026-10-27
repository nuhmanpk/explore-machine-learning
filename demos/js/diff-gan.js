// Forger vs Detective: runs GanCore live, with a "be the detective" game, heat map, checkpoints and challenges.
(function () {
  const C = window.GanCore;
  const S = 560, R = 1.6, NF = 150, B = 64;
  const CK_STEPS = [0, 50, 150, 400, 800, 1500, 2500, 4000];
  const SPEEDS = [["Slow", 0], ["Normal", 3], ["Fast", 7], ["Turbo", 11]];
  const STRENGTH = {
    lazy: { dSteps: 0.05, dLr: 0.002, dHidden: 24 },
    fair: { dSteps: 1, dLr: 0.002, dHidden: 24 },
    strong: { dSteps: 5, dLr: 0.02, dHidden: 48 },
  };
  const NAMES = { ring: "ring", moons: "two blobs", blobs4: "four blobs", heart: "heart", spiral: "spiral" };
  const GAME_STEPS = [0, 100, 400, 1500];
  const LEVEL_NAMES = ["Rookie", "Learning", "Good", "Master"];
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);
  const say = (h) => ML.say(h);

  const view = $("view"), { ctx } = ML.setupCanvas(view, S, S);
  const gameCv = $("game"), G2 = ML.setupCanvas(gameCv, S, S);
  const chartCv = $("chart"), CH = ML.setupCanvas(chartCv, 300, 170);
  const toPx = (x, y) => [((x + R) / (2 * R)) * S, ((R - y) / (2 * R)) * S];

  // ---------- helpers ----------
  const heatCv = document.createElement("canvas"); heatCv.width = heatCv.height = 32;
  const hctx = heatCv.getContext("2d");
  const GRID = (() => { const g = new Float32Array(32 * 32 * 2); for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) { g[2 * (j * 32 + i)] = -R + ((i + 0.5) / 32) * 2 * R; g[2 * (j * 32 + i) + 1] = R - ((j + 0.5) / 32) * 2 * R; } return g; })();
  const colCv = document.createElement("canvas").getContext("2d");
  function rgb(css) { colCv.clearRect(0, 0, 1, 1); colCv.fillStyle = css; colCv.fillRect(0, 0, 1, 1); const d = colCv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
  function heatOf(net) { return net.forward(GRID, 32 * 32).slice(); }
  function paintHeat(c, p, a = 0.45) {
    const [r, g, b] = rgb(ML.cssVar("--nn"));
    for (let k = 0; k < 1024; k++) { hctx.fillStyle = `rgba(${r},${g},${b},${(p[k] * a).toFixed(3)})`; hctx.clearRect(k % 32, (k / 32) | 0, 1, 1); hctx.fillRect(k % 32, (k / 32) | 0, 1, 1); }
    c.imageSmoothingEnabled = true; c.drawImage(heatCv, 0, 0, S, S);
  }
  function dot(c, x, y, real, r = 4, alpha = 1, hollow = false) {
    c.globalAlpha = alpha;
    const [px, py] = toPx(x, y);
    const cx = Math.max(8, Math.min(S - 8, px)), cy = Math.max(8, Math.min(S - 8, py));
    const off = cx !== px || cy !== py;
    if (real) { c.fillStyle = ML.cssVar("--good"); c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); }
    else {
      c.save(); c.translate(cx, cy); c.rotate(Math.PI / 4);
      if (hollow || off) { c.strokeStyle = ML.cssVar("--bad"); c.lineWidth = 2; c.strokeRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); }
      else { c.fillStyle = ML.cssVar("--bad"); c.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); }
      c.restore();
    }
    c.globalAlpha = 1;
  }
  function arrow(c, x0, y0, dx, dy, len, color) {
    const m = Math.hypot(dx, dy); if (m < 1e-9) return;
    dx = (dx / m) * len; dy = (dy / m) * len;
    c.strokeStyle = c.fillStyle = color; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + dx, y0 - dy); c.stroke();
    const a = Math.atan2(-dy, dx), x1 = x0 + dx, y1 = y0 - dy;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - 6 * Math.cos(a - 0.5), y1 - 6 * Math.sin(a - 0.5)); c.lineTo(x1 - 6 * Math.cos(a + 0.5), y1 - 6 * Math.sin(a + 0.5)); c.fill();
  }

  // ---------- state ----------
  const st = {
    data: "ring", strength: "fair", loss: "ns", gLr: 0.002, far: 0, seed: 1, custom: false,
    gan: null, tr: null, training: false, speed: 1, frame: 0, phase: "D",
    heat: null, heatDirty: true, ckpts: [], nextCk: 0, sel: -1, chal: null,
    arrows: true, showHeat: true, showReal: true, hintDirs: null, lastTalk: 0, active: "",
  };

  function reset(talk = true, seed) {
    st.training = false; setPlayLabel();
    st.seed = seed || 1 + Math.floor(Math.random() * 900);
    const s = STRENGTH[st.strength] || STRENGTH.fair;
    st.gan = new C.GAN({ seed: st.seed, data: st.data, dSteps: st.custom ? st.cfg.dSteps : s.dSteps, dLr: st.custom ? st.cfg.dLr : s.dLr, gLr: st.custom ? st.cfg.gLr : st.gLr, dHidden: s.dHidden, loss: st.loss, gOff: st.far });
    st.tr = new C.Tracker(st.gan);
    st.ckpts = []; st.nextCk = 0; st.sel = -1; st.phase = "D"; st.hintDirs = null; st.heatDirty = true; st.active = "";
    $("step-lbl").textContent = "Detective's turn";
    $("tg-live").classList.add("hidden");
    document.querySelectorAll("#chal .btn").forEach((b) => b.classList.remove("done"));
    snapshotIfDue(); renderCkpts(); updateStats(); drawChart(); setInside(); setActive("");
    if (talk) say(`Two brand-new baby brains! The forger's dots are a smudge and the detective is guessing. Press <b>Robo, train both!</b> to watch the <b>${NAMES[st.data]}</b> appear.`);
  }

  // ---------- training ----------
  const playBtn = $("play");
  function setPlayLabel() { playBtn.innerHTML = st.training ? `${ML.icon("pause")} Pause` : `${ML.icon("play")} ${st.gan && st.gan.steps ? "Keep training" : "Robo, train both!"}`; }
  playBtn.addEventListener("click", () => {
    st.training = !st.training; leaveReplay(); setPlayLabel();
    if (st.training) { st.phase = "D"; $("step-lbl").textContent = "Detective's turn"; if (!st.gan.steps) say("Here we go! Detective practises, then forger practises, again and again."); }
  });
  $("reset").addEventListener("click", () => { st.chal = null; $("fix-rule").classList.add("hidden"); reset(); });

  function afterStep() {
    const r = st.tr.tick();
    snapshotIfDue();
    st.heatDirty = true;
    if (r) {
      updateStats(); setInside();
      for (const m of r.marks) onMark(m, r.entry);
    }
  }
  function fullStep() { st.gan.step(); afterStep(); }
  function trainFor(ms) {
    const t0 = performance.now(); let n = 0;
    do { fullStep(); n++; } while (performance.now() - t0 < ms && n < 400);
  }
  $("step").addEventListener("click", () => {
    if (st.training) { st.training = false; setPlayLabel(); }
    leaveReplay();
    const g = st.gan;
    if (st.phase === "D") {
      const l = g.stepD(); st.tr.tick(); st.phase = "G"; setActive("d");
      $("step-lbl").textContent = "Forger's turn";
      say(`<b>Detective's turn.</b> I showed the detective ${B} real dots and ${B} forged dots. It was right <b>${Math.round(l.dAcc * 100)}%</b> of the time, then nudged its numbers to catch more fakes. The forger did not move.`);
      $("d-say").innerHTML = `Just practised: I was right ${Math.round(l.dAcc * 100)}% on this batch. I changed my numbers a little to do better.`;
    } else {
      g.stepG(); g.steps++; st.phase = "D"; setActive("g"); $("step-lbl").textContent = "Detective's turn";
      afterStep(); st.tr.refresh();
      const avg = mean(g.detect(st.tr.fake, NF));
      say(`<b>Forger's turn.</b> The forger made ${B} new dots and asked the detective "do these look real?" The detective said <b>${Math.round(avg * 100)}%</b> on average. So the forger slid each dot along the <b>hint arrows</b>. The detective did not move.`);
      $("g-say").innerHTML = `Just practised: the detective only gave my dots ${Math.round(avg * 100)}% "real". I followed its hints uphill.`;
    }
    st.heatDirty = true; refreshHints();
  });
  const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
  function setActive(w) { st.active = w; $("side-d").classList.toggle("active", w === "d"); $("side-g").classList.toggle("active", w === "g"); }

  // ---------- checkpoints ----------
  function snapshotIfDue() {
    while (st.nextCk < CK_STEPS.length && st.gan.steps >= CK_STEPS[st.nextCk]) {
      if (st.gan.steps === CK_STEPS[st.nextCk]) {
        const pts = st.tr.refresh().slice();
        const e = st.tr.hist[st.tr.hist.length - 1];
        const ck = { step: st.gan.steps, pts, D: st.gan.D.clone(), acc: e ? e.acc : 0.5, dist: C.nearestDist(pts, NF, st.tr.ref, 200) };
        st.ckpts.push(ck); renderCkpts(st.ckpts.length - 1);
      }
      st.nextCk++;
    }
  }
  const ckEl = $("ckpts");
  function verdict(d) { return d > 0.8 ? "a smudge" : d > 0.3 ? "getting there" : d > 0.12 ? "almost!" : "fooled it!"; }
  function renderCkpts(newIdx) {
    ckEl.innerHTML = st.ckpts.map((ck, i) => `<button class="ckpt ${i === st.sel ? "on" : ""} ${i === newIdx ? "new" : ""}" data-i="${i}"><canvas width="216" height="216"></canvas><b>Round ${ck.step}</b>${verdict(ck.dist)}</button>`).join("");
    ckEl.querySelectorAll(".ckpt").forEach((b) => drawThumb(b.querySelector("canvas"), st.ckpts[+b.dataset.i]));
    if (newIdx !== undefined) { const l = ckEl.lastElementChild; if (l) ckEl.scrollTo({ left: l.offsetLeft - ckEl.clientWidth / 2 + 60, behavior: reduce ? "auto" : "smooth" }); }
  }
  function drawThumb(cv, ck) {
    const c = cv.getContext("2d"), s = cv.width, T = 1.4;
    c.clearRect(0, 0, s, s);
    const P = (x, y) => [((x + T) / (2 * T)) * s, ((T - y) / (2 * T)) * s];
    c.fillStyle = ML.cssVar("--good"); c.globalAlpha = 0.35;
    for (let i = 0; i < 100; i++) { const [x, y] = P(st.tr.realView[2 * i], st.tr.realView[2 * i + 1]); c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
    c.globalAlpha = 1; c.fillStyle = ML.cssVar("--bad");
    for (let i = 0; i < NF; i++) { const [x, y] = P(ck.pts[2 * i], ck.pts[2 * i + 1]); if (x < 0 || y < 0 || x > s || y > s) continue; c.fillRect(x - 3, y - 3, 6, 6); }
  }
  ckEl.addEventListener("click", (e) => {
    const b = e.target.closest(".ckpt"); if (!b) return;
    const i = +b.dataset.i, ck = st.ckpts[i];
    st.sel = i; st.training = false; setPlayLabel();
    st.replayHeat = heatOf(ck.D);
    ckEl.querySelectorAll(".ckpt").forEach((x) => x.classList.toggle("on", +x.dataset.i === i));
    $("tg-live").classList.remove("hidden");
    say(`Replaying the forger from <b>round ${ck.step}</b>: ${verdict(ck.dist)}. Its fakes were about <b>${ck.dist.toFixed(2)}</b> away from the real dots, and the detective was right <b>${Math.round(ck.acc * 100)}%</b> of the time.`);
  });
  function leaveReplay() { st.sel = -1; $("tg-live").classList.add("hidden"); ckEl.querySelectorAll(".ckpt.on").forEach((x) => x.classList.remove("on")); }
  $("tg-live").addEventListener("click", () => { leaveReplay(); st.heatDirty = true; });

  // ---------- narration ----------
  function setInside() {
    const g = st.gan, t = st.tr, e = t.hist[t.hist.length - 1];
    if (!e) return;
    const acc = Math.round(e.acc * 100), dist = e.dist.toFixed(2);
    const pr = mean(g.detect(t.realView, NF)), pf = mean(g.detect(t.fake, NF));
    let d;
    if (e.acc > 0.85) d = `I catch <b>${acc}%</b> of the fakes. They still look different from the real dots, so I'm learning where the real ones live.`;
    else if (e.acc > 0.62) d = `I'm right <b>${acc}%</b> of the time. The fakes are getting harder to spot.`;
    else if (e.acc > 0.4) d = `I'm right only <b>${acc}%</b>. That's basically guessing! The fakes look like the real dots now.`;
    else d = `I'm wrong more than half the time (<b>${acc}%</b> right). The forger found a trick I haven't noticed yet.`;
    let f;
    if (e.dist > 1) f = `My dots are far from the real ones (about <b>${dist}</b> off). I follow the detective's hints towards "real".`;
    else if (e.dist > 0.3) f = `Getting closer! Still <b>${dist}</b> off. I keep sliding my dots along the hints.`;
    else if (e.dist > 0.1) f = `Close! My dots sit near the real shape, only <b>${dist}</b> off.`;
    else f = `My dots land right on the real shape (<b>${dist}</b> off).`;
    if (t.total && e.modes < t.total && e.dist < 0.5) f += ` But I only cover <b>${e.modes} of ${t.total}</b> blobs!`;
    $("d-say").innerHTML = d; $("g-say").innerHTML = f;
    $("d-num").textContent = `"Real" score given: real dots ${pr.toFixed(2)}, forged dots ${pf.toFixed(2)}`;
    $("f-num").textContent = `Fakes off by ${dist}${t.total ? ` · blobs reached ${e.modes}/${t.total}` : ""}`;
  }
  const MARK_TXT = {
    stuck: ["Stuck!", "The detective is so sure about the fakes (still right almost every time) that the forger's dots barely move. The old rule gives weak hints when the detective is too confident."],
    collapse: ["Mode collapse!", "The forger found a few spots that fool the detective and keeps copying only those. Look: not every blob has fakes in it."],
    wander: ["Running wild!", "The detective hardly practises, so its hints are nonsense. The forger follows them and drifts away from the real dots."],
    recovered: ["Recovered!", "With the smarter rule the forger gets useful hints again and the fakes jump back towards the real dots."],
    fooled: ["Fooled it!", "The detective is right only about half the time, which is like flipping a coin. Real and fake look the same!"],
  };
  const CHAL_OF = { stuck: "strong", collapse: "collapse", wander: "lazy" };
  function onMark(type, e) {
    const [lbl, txt] = MARK_TXT[type];
    flash(lbl);
    if (type === "fooled" && !st.chal) { ML.confetti(40); say(`<b>${lbl}</b> ${txt}`); }
    else if (type !== "fooled") say(`<b>${lbl}</b> ${txt}`);
    if (CHAL_OF[type]) { const b = document.querySelector(`#chal [data-c="${CHAL_OF[type]}"]`); if (b && st.chal === CHAL_OF[type]) b.classList.add("done"); $("chal-say").innerHTML = `<b>${lbl}</b> ${txt}${type === "stuck" ? " Try the button below." : ""}`; }
    if (type === "recovered") $("chal-say").innerHTML = `<b>${lbl}</b> ${txt}`;
    if (type === "fooled" && st.chal === "strong" && st.tr.has("recovered")) ML.confetti(40);
    st.lastTalk = performance.now();
  }
  const msgEl = $("msg");
  function flash(t) { msgEl.textContent = t; msgEl.classList.add("show"); setTimeout(() => msgEl.classList.remove("show"), 1800); }

  // ---------- main view ----------
  function refreshHints() {
    const pts = st.tr.fake;
    st.hintDirs = st.gan.hint(pts, NF).slice();
  }
  $("tg-heat").addEventListener("click", (e) => { st.showHeat = !st.showHeat; e.currentTarget.classList.toggle("on", st.showHeat); });
  $("tg-arrows").addEventListener("click", (e) => { st.arrows = !st.arrows; e.currentTarget.classList.toggle("on", st.arrows); });
  $("tg-real").addEventListener("click", (e) => { st.showReal = !st.showReal; e.currentTarget.classList.toggle("on", st.showReal); });

  function render() {
    const g = st.gan, t = st.tr, c = ctx, replay = st.sel >= 0 ? st.ckpts[st.sel] : null;
    c.clearRect(0, 0, S, S);
    if (st.showHeat) {
      if (replay) paintHeat(c, st.replayHeat);
      else { if (st.heatDirty || !st.heat) { st.heat = heatOf(g.D); } paintHeat(c, st.heat); }
    }
    c.strokeStyle = ML.cssVar("--line"); c.setLineDash([6, 8]); c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2); c.setLineDash([]);
    if (st.showReal) for (let i = 0; i < NF; i++) dot(c, t.realView[2 * i], t.realView[2 * i + 1], true, 3.6, 0.8);
    let pts;
    if (replay) pts = replay.pts;
    else { pts = t.fake; if (st.heatDirty || st.training) { t.refresh(); pts = t.fake; if (st.arrows && (st.frame % 3 === 0 || !st.hintDirs)) refreshHints(); } }
    if (st.arrows && !replay && st.hintDirs) {
      c.globalAlpha = 0.7;
      for (let i = 0; i < NF; i += 2) { const [x, y] = toPx(pts[2 * i], pts[2 * i + 1]); if (x < 8 || y < 8 || x > S - 8 || y > S - 8) continue; arrow(c, x, y, st.hintDirs[2 * i], st.hintDirs[2 * i + 1], 20, ML.cssVar("--ink-2")); }
      c.globalAlpha = 1;
    }
    for (let i = 0; i < NF; i++) dot(c, pts[2 * i], pts[2 * i + 1], false, 4.6, 0.95);
    st.heatDirty = false;
    $("view-chip").textContent = replay ? `replaying round ${replay.step}` : `round ${g.steps}`;
    $("view-title").innerHTML = replay ? `${ML.icon("film")} Forger at round ${replay.step}` : `${ML.icon("film")} The forger's dots`;
  }

  // ---------- stats + chart ----------
  function updateStats() {
    const e = st.tr.hist[st.tr.hist.length - 1];
    $("st-step").textContent = st.gan.steps;
    $("st-acc").textContent = e ? Math.round(e.acc * 100) + "%" : "–";
    $("st-dist").textContent = e ? e.dist.toFixed(2) : "–";
  }
  const MARK_COL = { stuck: "--warn", collapse: "--bad", wander: "--warn", recovered: "--good", fooled: "--good" };
  const MARK_CH = { stuck: "S", collapse: "M", wander: "W", recovered: "R", fooled: "F" };
  function drawChart() {
    const c = CH.ctx, w = 300, h = 170, pad = 8, hist = st.tr ? st.tr.hist : [];
    c.clearRect(0, 0, w, h);
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted");
    const topY = (v) => 16 + (1 - v) * 56, botY = (v) => 160 - Math.min(v, 1.2) / 1.2 * 56;
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(pad, topY(0.5)); c.lineTo(w - pad, topY(0.5)); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.moveTo(pad, botY(0)); c.lineTo(w - pad, botY(0)); c.stroke();
    c.fillText("50% = fooled", w - 70, topY(0.5) - 3); c.fillText("detective right", pad, 11); c.fillText("fakes off by (lower = better)", pad, 94);
    if (hist.length < 2) { c.fillText("Lines appear when you train", pad + 60, h / 2 + 4); return; }
    const maxX = Math.max(300, hist[hist.length - 1].s * 1.05), X = (s) => pad + (s / maxX) * (w - 2 * pad);
    for (const m of st.tr.marks) {
      const x = X(m.s); c.strokeStyle = ML.cssVar(MARK_COL[m.type]); c.lineWidth = 1.5; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(x, 14); c.lineTo(x, 162); c.stroke(); c.setLineDash([]);
      c.fillStyle = ML.cssVar(MARK_COL[m.type]); c.beginPath(); c.arc(x, 14, 7, 0, 7); c.fill();
      c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(MARK_CH[m.type], x, 17.5); c.textAlign = "left";
    }
    c.lineJoin = "round"; c.lineWidth = 2.5;
    for (const [key, f, col] of [["acc", topY, "--nn"], ["dist", botY, "--bad"]]) {
      c.strokeStyle = ML.cssVar(col); c.beginPath();
      hist.forEach((e, i) => (i ? c.lineTo(X(e.s), f(e[key])) : c.moveTo(X(e.s), f(e[key]))));
      c.stroke();
    }
    c.fillStyle = ML.cssVar("--muted"); c.fillText(`${maxX | 0} rounds →`, w - 70, h - 2);
  }

  // ---------- controls ----------
  function seg(id, fn) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      setSeg(id, b.dataset.v); fn(b.dataset.v);
    });
  }
  function setSeg(id, v) { document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x.dataset.v === v)); }
  seg("strength", (v) => { st.strength = v; st.custom = false; st.far = 0; st.chal = null; $("fix-rule").classList.add("hidden"); reset(false); say(`New brains with a <b>${v === "strong" ? "super-strong" : v}</b> detective. Press <b>Robo, train both!</b>`); });
  seg("rule", (v) => {
    st.loss = v; if (st.gan) st.gan.o.loss = v;
    say(v === "sat" ? "The <b>Classic</b> rule: the forger tries to make the detective's score for fakes go down. It works, but gives weak hints when the detective is too sure." : "The <b>Smarter</b> rule: the forger tries to make the detective say \"real\". Same goal, but strong hints even when it is losing.");
  });
  ML.bindRange("#speed", (v) => SPEEDS[v][0], (v) => (st.speed = v));
  $("shapes").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#shapes .btn").forEach((x) => x.classList.toggle("on", x === b));
    st.data = b.dataset.s; st.chal = null; st.custom = false; st.far = 0; $("fix-rule").classList.add("hidden");
    reset(false); prepGame();
    say(st.data === "spiral" ? "The spiral is tricky for tiny brains and often comes out smudgy. Try it anyway, or pick another!" : `New pattern: <b>${NAMES[st.data]}</b>. Be the detective above, or press <b>Robo, train both!</b>`);
  });

  // ---------- challenges ----------
  const CHAL = {
    strong: { data: "ring", strength: "strong", loss: "sat", far: 2.5, seed: 2, speed: 2,
      say: "The detective practises <b>5 times</b> for every forger turn, the forger starts <b>far from the ring</b>, and it uses the <b>Classic</b> rule. Watch: the detective stays right almost every time and the fakes barely creep closer." },
    collapse: { data: "blobs4", strength: null, loss: "ns", far: 0, seed: 5, speed: 3, cfg: { dSteps: 1, dLr: 0.0004, gLr: 0.01 },
      say: "Four blobs of real dots. Here the forger learns <b>fast</b> and the detective learns <b>slowly</b>. Watch the forgeries: they huddle in just one or two blobs. The mark appears after about 1200 rounds." },
    lazy: { data: "ring", strength: "lazy", loss: "ns", far: 0, seed: 1, speed: 2,
      say: "The detective practises only <b>once every 20</b> forger turns. Its hints are nonsense, so the forger follows them and drifts away from the real dots." },
  };
  $("chal").addEventListener("click", (e) => {
    const b = e.target.closest(".btn"); if (!b) return;
    const k = b.dataset.c, p = CHAL[k];
    st.chal = k; st.data = p.data; st.loss = p.loss; st.far = p.far;
    st.custom = !!p.cfg; if (p.cfg) st.cfg = p.cfg; st.strength = p.strength || "fair";
    document.querySelectorAll("#shapes .btn").forEach((x) => x.classList.toggle("on", x.dataset.s === p.data));
    setSeg("rule", p.loss); setSeg("strength", p.strength || "none");
    $("speed").value = p.speed; $("speed").dispatchEvent(new Event("input"));
    reset(false, p.seed); prepGame();
    $("fix-rule").classList.toggle("hidden", k !== "strong");
    $("chal-say").innerHTML = p.say; say(p.say);
    st.training = true; setPlayLabel();
    view.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  });
  $("fix-rule").addEventListener("click", () => {
    st.loss = "ns"; st.gan.o.loss = "ns"; setSeg("rule", "ns");
    st.training = true; setPlayLabel();
    const m = "Switched to the <b>Smarter</b> rule. Same detective, same forger. Keep watching!";
    say(m); $("chal-say").innerHTML = m;
  });

  // ---------- game: be the detective ----------
  const gm = { level: 0, round: 0, you: 0, bot: 0, pips: [], cur: null, answered: false, snaps: [], ready: false, timer: 0, refs: null, prep: null, heat: null, done: false };
  function prepGame() {
    clearTimeout(gm.timer);
    gm.ready = false; gm.snaps = []; gm.heat = null;
    const gan = new C.GAN({ seed: 7, data: st.data });
    gm.prep = gan; gm.stepIdx = 0;
    gm.snaps[0] = { G: gan.G.clone(), D: gan.D.clone() };
    gm.refs = C.sampleReal(st.data, 40, C.mulberry(21), C.gaussFrom(C.mulberry(22)));
    setGameButtons(false); $("g-note").textContent = "Robo is getting the forgery lab ready…";
    drawGame();
  }
  function prepWork(ms) {
    const gan = gm.prep; if (!gan || gm.ready) return;
    const t0 = performance.now();
    while (performance.now() - t0 < ms && gan.steps < GAME_STEPS[3]) {
      gan.step();
      const k = GAME_STEPS.indexOf(gan.steps);
      if (k > 0) gm.snaps[k] = { G: gan.G.clone(), D: gan.D.clone() };
    }
    if (gan.steps >= GAME_STEPS[3]) { gm.ready = true; newGame(); }
  }
  function setGameButtons(on) { $("g-real").disabled = !on; $("g-fake").disabled = !on; }
  function newGame() {
    clearTimeout(gm.timer);
    gm.round = 0; gm.you = 0; gm.bot = 0; gm.pips = []; gm.done = false;
    renderScore(); nextRound();
  }
  function nextRound() {
    const sn = gm.snaps[gm.level]; if (!sn) return;
    const real = Math.random() < 0.5;
    let pt;
    if (real) pt = C.sampleReal(st.data, 1, Math.random, C.gaussFrom(Math.random));
    else { const z = new Float32Array(C.ZD), g = C.gaussFrom(Math.random); for (let i = 0; i < C.ZD; i++) z[i] = g(); pt = sn.G.forward(z, 1).slice(); }
    const p = sn.D.forward(pt, 1)[0];
    gm.cur = { x: pt[0], y: pt[1], real, p }; gm.answered = false; gm.heat = null;
    gm.round++; setGameButtons(true);
    $("g-chip").textContent = `round ${gm.round} / 10`;
    $("g-note").textContent = "Look at the real example dots. Does the ringed dot belong with them?";
    drawGame();
  }
  function answer(sayReal) {
    if (!gm.cur || gm.answered) return;
    gm.answered = true; setGameButtons(false);
    const c = gm.cur, ok = sayReal === c.real, botReal = c.p > 0.5, botOk = botReal === c.real;
    if (ok) gm.you++; if (botOk) gm.bot++;
    gm.pips.push(ok);
    gm.heat = heatOf(gm.snaps[gm.level].D);
    $("g-note").innerHTML = `${ok ? "<b style='color:var(--good)'>Correct!</b>" : "<b style='color:var(--bad)'>Oops!</b>"} It was <b>${c.real ? "real" : "forged"}</b>. Robo's detective said "${botReal ? "real" : "fake"}" (${Math.round(c.p * 100)}% sure it is real) and was ${botOk ? "right" : "wrong"}.`;
    renderScore(); drawGame();
    if (gm.round >= 10) {
      gm.done = true;
      const m = gm.you > gm.bot ? "You beat Robo's detective!" : gm.you === gm.bot ? "A tie with Robo's detective!" : "Robo's detective won this time.";
      say(`Game over: you <b>${gm.you}/10</b>, Robo's detective <b>${gm.bot}/10</b>. ${m} Try a <b>better forger</b>: the better the fakes, the closer everyone gets to guessing.`);
      if (gm.you > gm.bot) ML.confetti(40);
      $("g-chip").textContent = "game over";
      gm.timer = setTimeout(newGame, 3500);
    } else gm.timer = setTimeout(nextRound, 1600);
  }
  $("g-real").addEventListener("click", () => answer(true));
  $("g-fake").addEventListener("click", () => answer(false));
  $("g-new").addEventListener("click", () => { if (gm.ready) newGame(); });
  seg("g-level", (v) => {
    gm.level = +v;
    if (gm.ready) { newGame(); say(`<b>${LEVEL_NAMES[gm.level]}</b> forger, practised ${GAME_STEPS[gm.level]} rounds. ${gm.level === 0 ? "Its fakes should be easy to catch!" : gm.level === 3 ? "Its fakes are very good. Expect to guess a lot." : "The fakes are getting better."}`); }
  });
  function renderScore() {
    $("g-you").textContent = `${gm.you}/${gm.pips.length}`; $("g-bot").textContent = `${gm.bot}/${gm.pips.length}`;
    $("g-pips").innerHTML = Array.from({ length: 10 }, (_, i) => `<span class="pip ${i < gm.pips.length ? (gm.pips[i] ? "ok" : "no") : ""}"></span>`).join("");
  }
  function drawGame() {
    const c = G2.ctx; c.clearRect(0, 0, S, S);
    if (gm.heat) paintHeat(c, gm.heat, 0.5);
    c.strokeStyle = ML.cssVar("--line"); c.setLineDash([6, 8]); c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2); c.setLineDash([]);
    if (gm.refs) for (let i = 0; i < 40; i++) dot(c, gm.refs[2 * i], gm.refs[2 * i + 1], true, 4.5, 0.85);
    const cur = gm.cur; if (!cur || !gm.ready) return;
    const [px, py] = toPx(cur.x, cur.y);
    const x = Math.max(14, Math.min(S - 14, px)), y = Math.max(14, Math.min(S - 14, py));
    const pulse = gm.answered || reduce ? 0 : 3 + 3 * Math.sin(performance.now() / 220);
    if (gm.answered) { dot(c, cur.x, cur.y, cur.real, 6); }
    else { c.fillStyle = ML.cssVar("--ink"); c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); }
    c.strokeStyle = gm.answered ? ML.cssVar(cur.real ? "--good" : "--bad") : ML.cssVar("--ink"); c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, 14 + pulse, 0, 7); c.stroke();
  }

  // ---------- main loop ----------
  function loop() {
    st.frame++;
    if (gm.prep && !gm.ready) { prepWork(8); const pct = Math.round((gm.prep.steps / GAME_STEPS[3]) * 100); if (st.frame % 8 === 0) $("g-note").textContent = `Robo is getting the forgery lab ready… ${pct}%`; }
    if (st.training) {
      const ms = SPEEDS[st.speed][1];
      if (ms === 0) { if (st.frame % 4 === 0) fullStep(); } else trainFor(ms);
      if (st.frame % 6 === 0) drawChart();
      if (st.gan.steps > 120 && performance.now() - st.lastTalk > 10000) {
        const e = st.tr.hist[st.tr.hist.length - 1];
        if (e) { st.lastTalk = performance.now(); say(`Round ${st.gan.steps}: detective right <b>${Math.round(e.acc * 100)}%</b>, fakes off by <b>${e.dist.toFixed(2)}</b>. ${e.acc < 0.62 ? "Near 50% means a fair fight!" : "The detective is still ahead."}`); }
      }
    } else if (st.frame % 20 === 0) drawChart();
    render();
    if (gm.ready && gm.cur && !gm.answered && !reduce) drawGame();
    requestAnimationFrame(loop);
  }
  document.addEventListener("themechange", () => { st.heatDirty = true; drawChart(); renderCkpts(); drawGame(); });
  reset(false);
  prepGame();
  say("Hi! Be the <b>detective</b> first: is the ringed dot real or forged? Then press <b>Robo, train both!</b> to watch the game.");
  requestAnimationFrame(loop);
  window.__gan = st; window.__game = gm; // handy for testing
})();
