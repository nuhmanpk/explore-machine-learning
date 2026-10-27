// Make New Pictures page. Logic lives in gen-vae-core.js (GenVaeCore).
(function () {
  const C = window.GenVaeCore;
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

  const MS = 320, GW = 296, GH = 216, N = 10;
  const mcx = ML.setupCanvas($("map"), MS, MS).ctx, gcx = ML.setupCanvas($("gal"), GW, GH).ctx;
  const BATCH = 16, LR = 0.005, PER = 40, STOP = 2500;
  const S = { seed: 1, data: null, vae: null, bi: 3, run: false, pts: [], win: { x0: -3, x1: 3, y0: -3, y1: 3 }, tiles: [], rep: null, gseed: 1, frame: 0, tried: new Set(), kl: 0, token: 0 };
  $("legend").innerHTML = C.KINDS.map((k, i) => `<span><i style="background:${KC[i]};border-radius:50%"></i>${k.name}</span>`).join("");

  function train(bi) {
    S.bi = bi; S.token++; S.vae = new C.VAE(2, S.seed + 3, 32, C.BETAS[bi]); S.rep = null; S.frame = 0; S.kl = 0;
    refresh(); setRun(true);
  }
  function fresh() { S.seed = 1 + Math.floor(Math.random() * 90000); S.data = C.dataset(S.seed); S.tried = new Set(); train(S.bi); }
  function setRun(on) { S.run = on; $("state").textContent = on ? "(learning...)" : "(ready)"; if (on) raf(tick); }
  function tick() {
    if (!S.run) return;
    let o; for (let i = 0; i < PER; i++) o = S.vae.train(S.data.train, BATCH, LR);
    S.kl = S.kl ? S.kl * 0.8 + o.kl * 0.2 : o.kl; S.frame++;
    if (S.frame % 8 === 0) refresh();
    if (S.vae.steps >= STOP) { finish(); return; }
    raf(tick);
  }
  function finish() {
    setRun(false); refresh(); S.tried.add(S.bi); report(true);
    const r = S.rep, b = C.BETAS[S.bi];
    ML.say(`Trained with weight <b>${b}</b>: <b>${Math.round(r.junk * 100)}%</b> junk, sharpness <b>${r.sharp.toFixed(2)}</b>. ${b === 0 ? "No rule keeps the dots together, so random spots often land in empty gaps." : b >= 1 ? "The rule is so strong that everything squashes into a blurry average." : "Press Make 12 new pictures to see for yourself!"}`);
  }
  function report(check) {
    S.rep = C.judge(S.vae, S.data.train, S.gseed, 200);
    $("s-junk").textContent = Math.round(S.rep.junk * 100) + "%"; $("s-sharp").textContent = S.rep.sharp.toFixed(2); $("s-kl").textContent = S.kl.toFixed(1);
    if (check && S.vae.steps >= STOP) {
      if (S.bi === 0 && S.kl > 20) hit("holes", "No rule: the dots sprawl far outside the circle, so random spots hit empty gaps.");
      if (S.rep.junk <= 0.3 && S.rep.sharp >= 0.7) hit("sweet", "A balanced weight: crisp pictures and few junk ones.");
      if (S.bi === 6 && S.rep.sharp <= 0.65) hit("blur", "Too much tidying: pictures drift to a grey blur.");
      if (S.tried.size >= 4) hit("tour", "You tried 4 different weights.");
    }
    draw();
  }
  function refresh() {
    const v = S.vae; S.pts = S.data.train.map((p) => ({ mu: v.encode(p.x).mu, kind: p.kind })); S.win = C.atlas(v, S.data.train);
    const w = S.win; S.tiles = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) S.tiles.push(v.decode([w.x0 + ((i + 0.5) / N) * (w.x1 - w.x0), w.y0 + ((j + 0.5) / N) * (w.y1 - w.y0)]));
    $("s-kl").textContent = S.kl ? S.kl.toFixed(1) : "-"; if (S.run) { $("s-junk").textContent = "..."; $("s-sharp").textContent = "..."; }
    draw();
  }
  const px = (z) => [((z[0] - S.win.x0) / (S.win.x1 - S.win.x0)) * MS, ((z[1] - S.win.y0) / (S.win.y1 - S.win.y0)) * MS];
  function draw() {
    const c = mcx, P = pal(), t = MS / N; c.clearRect(0, 0, MS, MS);
    S.tiles.forEach((p, i) => drawPic(c, (i % N) * t + 1, Math.floor(i / N) * t + 1, t - 2, p, P, 0.5));
    for (const p of S.pts) { const [x, y] = px(p.mu); c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fillStyle = KC[C.kindIndex(p.kind)]; c.fill(); c.strokeStyle = P.card; c.lineWidth = 1; c.stroke(); }
    const [cx0, cy0] = px([0, 0]), rr = Math.max(2, (2 / (S.win.x1 - S.win.x0)) * MS);
    c.strokeStyle = P.ink; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); c.arc(cx0, cy0, rr, 0, 7); c.stroke(); c.setLineDash([]);
    if (S.rep) S.rep.items.slice(0, 12).forEach((it) => { const [x, y] = px(it.z); c.beginPath(); c.arc(x, y, 6, 0, 7); c.fillStyle = "rgba(255,255,255,.35)"; c.fill(); c.lineWidth = 3; c.strokeStyle = it.junk ? P.bad : "#fff"; c.stroke(); c.lineWidth = 1.5; c.strokeStyle = P.ink; c.stroke(); });
    drawGal();
  }
  function drawGal() {
    const c = gcx, P = pal(), cell = 68, gap = 6; c.clearRect(0, 0, GW, GH);
    if (!S.rep) { c.fillStyle = P.muted; c.font = "800 12px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("Wait for learning to finish, then press the button.", GW / 2, GH / 2); return; }
    S.rep.items.slice(0, 12).forEach((it, i) => { const x = (i % 4) * (cell + gap), y = Math.floor(i / 4) * (cell + gap); drawPic(c, x + 2, y + 2, cell - 4, it.x, P); c.lineWidth = 3; c.strokeStyle = it.junk ? P.bad : P.line; c.strokeRect(x + 1, y + 1, cell - 2, cell - 2); });
  }
  ML.bindRange("#beta", (v) => String(C.BETAS[+v]), (v) => { S.pendingBeta = +v; if (!S.vae) return; clearTimeout(S.deb); S.deb = setTimeout(() => { train(+v); ML.say(`Weight <b>${C.BETAS[+v]}</b>. Learning a fresh map...`); }, 150); });
  $("gen").addEventListener("click", () => {
    if (S.run) { ML.toast("Wait until the map has finished learning."); return; }
    S.gseed += 1; report(false);
    ML.say(`Twelve brand-new pictures from random spots. <b>${S.rep.items.slice(0, 12).filter((i) => i.junk).length}</b> of these 12 are junk (red frame).`);
  });
  $("reset").addEventListener("click", () => { fresh(); ML.say("New pictures to learn from, new map."); });
  onTheme(draw);
  window.GenVaePage = S;
  fresh();
})();
