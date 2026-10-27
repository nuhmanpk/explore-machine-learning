// Map of Pictures page. Logic lives in gen-latent-core.js (GenLatentCore).
(function () {
  const C = window.GenLatentCore;
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KC = ["#e4572e", "#17a398", "#d99a00", "#7b4fb5", "#2e86de", "#8d6e63"];
  const raf = (f) => requestAnimationFrame(f);
  const pal = () => ({ ink: ML.cssVar("--ink"), card: ML.cssVar("--card"), bg: ML.cssVar("--bg-2"), line: ML.cssVar("--line"), muted: ML.cssVar("--muted"), acc: ML.cssVar("--accent"), warn: ML.cssVar("--warn"), bad: ML.cssVar("--bad"), good: ML.cssVar("--good") });
  // draw one 8x8 picture (values 0..1 = ink strength) at x,y with side s
  function drawPic(c, x, y, s, pic, P, alpha) {
    c.globalAlpha = alpha == null ? 1 : alpha; c.fillStyle = P.card; c.fillRect(x, y, s, s); c.fillStyle = P.ink; const t = s / 8;
    for (let i = 0; i < 64; i++) { const v = pic[i]; if (v > 0.02) { c.globalAlpha = (alpha == null ? 1 : alpha) * Math.min(1, v); c.fillRect(x + (i % 8) * t, y + Math.floor(i / 8) * t, t + 0.5, t + 0.5); } }
    c.globalAlpha = 1;
  }
  const hit = (id, msg) => {
    const el = $("c-" + id); if (!el || el.classList.contains("done")) return;
    el.classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`);
    if (document.querySelectorAll(".chal.done").length === document.querySelectorAll(".chal").length) ML.confetti(40);
  };
  const fmt = (v, d) => v.toFixed(d == null ? 3 : d);
  const onTheme = (f) => { new MutationObserver(f).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] }); new MutationObserver(f).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] }); document.addEventListener("themechange", f); window.addEventListener("load", f); };
  const xy = (e, cv, w, h) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h }; };

  const MS = 320, SW = 300, SH = 96, OS = 120, N = 10;
  const mcx = ML.setupCanvas($("map"), MS, MS).ctx, ocx = ML.setupCanvas($("out"), OS, OS).ctx, scx = ML.setupCanvas($("strip"), SW, SH).ctx;
  const BATCH = 16, LR = 0.008, PER = 30, STOP = 3500;
  const S = { seed: 1, data: null, ae: null, run: false, pts: [], win: { x0: -1, x1: 1, y0: -1, y1: 1 }, tiles: [], cur: null, A: null, B: null, mix: 0, mixMoved: false, kinds: new Set(), tidy: 0, frame: 0, near: 0, label: null };
  $("legend").innerHTML = C.KINDS.map((k, i) => `<span><i style="background:${KC[i]};border-radius:50%"></i>${k.name}</span>`).join("");

  function fresh() {
    S.seed = 1 + Math.floor(Math.random() * 90000); S.data = C.dataset(S.seed); S.ae = new C.AE(2, S.seed + 3, 32);
    S.cur = null; S.kinds = new Set(); S.mixMoved = false; S.frame = 0; S.tidy = 0; S.last = null; S.stopAt = 0;
    pickA(); pickB(); $("mix").value = 0; S.mix = 0; syncMix();
    refresh(true); setRun(true);
  }
  const rp = () => S.data.test[Math.floor(Math.random() * S.data.test.length)];
  function pickA() { S.A = rp(); }
  function pickB() { let p = rp(); for (let i = 0; i < 30 && p.kind === S.A.kind; i++) p = rp(); S.B = p; }
  function setRun(on) { S.run = on; $("play").innerHTML = `${ML.icon(on ? "pause" : "play")} ${on ? "Pause" : "Train"}`; $("state").textContent = on ? "(learning...)" : "(ready)"; if (on) raf(tick); }
  function tick() {
    if (!S.run) return;
    for (let i = 0; i < PER; i++) S.last = S.ae.train(S.data.train, BATCH, LR);
    S.frame++;
    if (S.frame % 8 === 0) refresh(S.frame % 24 === 0);
    if (S.ae.steps >= (S.stopAt || STOP)) { setRun(false); refresh(true); ML.say(`Done learning. Dots that are <b>${Math.round(S.tidy * 100)}%</b> tidy. Click or drag on the map to see what lives at each spot!`); return; }
    raf(tick);
  }
  // re-encode everything and redraw; heavy bits (tidy score, error) only when full
  function refresh(full) {
    S.pts = C.mapOf(S.ae, S.data.train); S.win = C.atlas(S.pts);
    S.tiles = []; const w = S.win;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) S.tiles.push(S.ae.decode([w.x0 + ((i + 0.5) / N) * (w.x1 - w.x0), w.y0 + ((j + 0.5) / N) * (w.y1 - w.y0)]));
    if (full) { S.tidy = C.knnScore(S.pts); S.err = S.ae.meanMse(S.data.test); }
    $("s-tidy").textContent = Math.round(S.tidy * 100) + "%"; $("s-err").textContent = S.err == null ? "-" : fmt(S.err); $("s-steps").textContent = S.ae.steps;
    if (S.ae.steps >= 1500 && S.tidy >= 0.65 && full) hit("tidy", "Neighbours agree: similar shapes are clustering together.");
    draw();
  }
  const px = (z) => [((z[0] - S.win.x0) / (S.win.x1 - S.win.x0)) * MS, ((z[1] - S.win.y0) / (S.win.y1 - S.win.y0)) * MS];
  const unpx = (x, y) => [S.win.x0 + (x / MS) * (S.win.x1 - S.win.x0), S.win.y0 + (y / MS) * (S.win.y1 - S.win.y0)];
  function draw() {
    const c = mcx, P = pal(), t = MS / N; c.clearRect(0, 0, MS, MS);
    S.tiles.forEach((p, i) => drawPic(c, (i % N) * t + 1, Math.floor(i / N) * t + 1, t - 2, p, P, 0.5));
    for (const p of S.pts) { const [x, y] = px(p.z); c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fillStyle = KC[C.kindIndex(p.kind)]; c.fill(); c.strokeStyle = P.card; c.lineWidth = 1; c.stroke(); }
    if (S.A && S.B) {
      const a = px(S.ae.encode(S.A.x)), b = px(S.ae.encode(S.B.x)); c.strokeStyle = P.ink; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); c.setLineDash([]);
      [["A", a], ["B", b]].forEach(([l, q]) => { c.fillStyle = P.ink; c.beginPath(); c.arc(q[0], q[1], 9, 0, 7); c.fill(); c.fillStyle = P.card; c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center"; c.fillText(l, q[0], q[1] + 4); });
    }
    if (S.cur) { const [x, y] = px(S.cur); c.strokeStyle = P.ink; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 8, 0, 7); c.stroke(); c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 8, 0, 7); c.stroke(); }
    drawOut(); drawStrip();
  }
  function drawOut() {
    const P = pal(), c = ocx; c.clearRect(0, 0, OS, OS);
    if (!S.cur) { c.fillStyle = P.card; c.fillRect(0, 0, OS, OS); c.fillStyle = P.muted; c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("click the map", OS / 2, OS / 2 + 4); return; }
    drawPic(c, 0, 0, OS, S.ae.decode(S.cur), P);
  }
  function info() {
    if (!S.cur) { $("info").innerHTML = "Click or drag on the map."; return; }
    const r = C.knnKind(S.pts, S.cur, 5), far = r.near > 0.09 * (S.win.x1 - S.win.x0), name = C.KINDS[C.kindIndex(r.kind)].name;
    $("info").innerHTML = `Nearest dots say: <b style="color:${KC[C.kindIndex(r.kind)]}">${name}</b>.<br>${far ? "This spot is far from every dot, so the picture is an <b>invention</b>." : "This spot is close to real pictures."}<br><span class="muted">Spot: ${S.cur[0].toFixed(1)}, ${S.cur[1].toFixed(1)}</span>`;
    return { r, far };
  }
  function drawStrip() {
    const P = pal(), c = scx; c.clearRect(0, 0, SW, SH);
    if (!S.A || !S.B) return;
    const n = 7, cell = 40, gap = (SW - n * cell) / (n - 1), seq = C.lerp(S.ae, S.A.x, S.B.x, n);
    seq.forEach((s, i) => { const x = i * (cell + gap); drawPic(c, x, 2, cell, s.latent, P); drawPic(c, x, 52, cell, s.fade, P); if (Math.abs(s.t - S.mix / 100) < 0.5 / (n - 1)) { c.strokeStyle = P.acc; c.lineWidth = 3; c.strokeRect(x - 1, 1, cell + 2, cell + 2); } });
    c.fillStyle = P.muted; c.font = "800 9px Nunito, sans-serif"; c.textAlign = "left"; c.fillText("A", 0, SH - 2); c.textAlign = "right"; c.fillText("B", SW, SH - 2);
  }
  // ---------- picking ----------
  function setCur(z, user) {
    S.cur = z; const i = info(); drawOut(); draw();
    if (user && i && S.ae.steps >= 1000) {
      S.kinds.add(i.r.kind);
      if (S.kinds.size >= 4) hit("kinds", "Four different shapes found by clicking around the map.");
      if (i.far) hit("gap", "Far from every dot the network just makes something up.");
    }
  }
  function pointer(e) { const p = xy(e, $("map"), MS, MS); setCur(unpx(ML.clamp(p.x, 0, MS), ML.clamp(p.y, 0, MS)), true); }
  let down = false;
  $("map").addEventListener("pointerdown", (e) => { down = true; try { $("map").setPointerCapture(e.pointerId); } catch (x) {} pointer(e); });
  $("map").addEventListener("pointermove", (e) => { if (down) pointer(e); });
  const up = () => { down = false; }; $("map").addEventListener("pointerup", up); $("map").addEventListener("pointercancel", up);
  $("map").addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return; e.preventDefault();
    const w = S.win, s = (w.x1 - w.x0) * 0.04, z = S.cur ? S.cur.slice() : [(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2]; setCur([z[0] + d[0] * s, z[1] + d[1] * s], true);
  });
  // ---------- mixing ----------
  function syncMix() { $("pa").title = "A is a " + S.A.kind; }
  function mixed(user) {
    const za = S.ae.encode(S.A.x), zb = S.ae.encode(S.B.x), t = S.mix / 100;
    if (user) { S.mixMoved = true; S.cur = za.map((v, i) => v + (zb[i] - v) * t); info(); }
    draw();
    if (user && S.A.kind !== S.B.kind && S.mix >= 35 && S.mix <= 65 && S.ae.steps >= 1000) hit("blend", "Halfway between two shapes, the network draws a smooth in-between.");
  }
  ML.bindRange("#mix", (v) => v + "%", (v) => { S.mix = +v; if (S.ae) mixed(true); });
  $("pa").addEventListener("click", () => { pickA(); if (S.B.kind === S.A.kind) pickB(); syncMix(); mixed(false); ML.say(`A is a <b>${S.A.kind}</b> and B is a <b>${S.B.kind}</b>. Slide the mix!`); });
  $("pb").addEventListener("click", () => { pickB(); syncMix(); mixed(false); ML.say(`A is a <b>${S.A.kind}</b> and B is a <b>${S.B.kind}</b>. Slide the mix!`); });
  $("play").addEventListener("click", () => { if (S.run) setRun(false); else { S.stopAt = S.ae.steps + 1500; setRun(true); } });
  $("reset").addEventListener("click", () => { fresh(); ML.say("A brand-new map, learning from scratch."); });
  onTheme(draw);
  window.GenLatentPage = S;
  fresh();
})();
