// Spot the Stranger page. Logic lives in gen-odd-core.js (GenOddCore).
(function () {
  const C = window.GenOddCore;
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

  const HW = 320, HH = 170, GW = 320, GH = 110;
  const hcx = ML.setupCanvas($("hist"), HW, HH).ctx, gcx = ML.setupCanvas($("gal"), GW, GH).ctx;
  const BATCH = 16, LR = 0.01, PER = 30, STOP = 1200, FIRST = "square";
  const S = { normal: FIRST, seed: 1, set: null, ae: null, run: false, errs: [], tmax: 0.25, show: [], frame: 0, thr: 0.1, trained: false };
  const kbox = $("kinds");
  kbox.innerHTML = C.KINDS.map((k, i) => `<button type="button" class="kbtn" data-k="${k.id}" aria-pressed="false"><i class="sw" style="background:${KC[i]}"></i>${k.name}</button>`).join("");

  function train(kind) {
    S.normal = kind; S.set = C.setup(kind, S.seed); S.ae = new C.AE(3, S.seed + 5, 24); S.trained = false; S.frame = 0;
    kbox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === kind ? "true" : "false"));
    pickShow(); update(); setRun(true);
  }
  function fresh() { S.seed = 1 + Math.floor(Math.random() * 90000); train(S.normal); }
  function pickShow() {
    const pick = (lo, n) => { const a = []; while (a.length < n) { const i = lo + Math.floor(Math.random() * 30); if (!a.includes(i)) a.push(i); } return a; };
    const a = pick(0, 4), b = pick(30, 4); S.show = [a[0], b[0], a[1], b[1], a[2], b[2], a[3], b[3]];
  }
  function setRun(on) { S.run = on; $("state").textContent = on ? "(learning...)" : ""; if (on) raf(tick); }
  function tick() {
    if (!S.run) return;
    for (let i = 0; i < PER; i++) S.ae.train(S.set.train, BATCH, LR);
    S.frame++; if (S.frame % 6 === 0) update();
    if (S.ae.steps >= STOP) { S.trained = true; setRun(false); update(); const c = C.confusion(S.errs, S.set.test, S.thr); ML.say(`I only know <b>${S.normal}s</b> now. Normal pictures rebuild well, strangers do not. Slide the alarm line to catch them!`); return; }
    raf(tick);
  }
  const thrOf = () => (+$("thr").value / 100) * S.tmax;
  function update() {
    S.errs = C.errors(S.ae, S.set.test); S.tmax = Math.max(0.02, Math.max(...S.errs) * 1.05); S.thr = thrOf();
    stats(); draw();
  }
  function stats() {
    const k = C.confusion(S.errs, S.set.test, S.thr); S.k = k;
    $("s-p").textContent = k.tp + k.fp ? Math.round(k.precision * 100) + "%" : "-"; $("s-r").textContent = Math.round(k.recall * 100) + "%"; $("s-f").textContent = Math.round(k.f1 * 100) + "%";
    $("s-tp").innerHTML = `${k.tp}<small> of 30</small>`; $("s-fp").innerHTML = `${k.fp}<small> of 30</small>`;
    const out = document.querySelector('[data-for="thr"]'); if (out) out.textContent = S.thr.toFixed(3);
  }
  function checks() {
    if (!S.trained || !S.k) return; const k = S.k;
    if (k.recall === 1 && k.precision < 0.7) hit("low", "Jumpy: every stranger caught, but lots of false alarms.");
    if (k.tp > 0 && k.precision === 1 && k.recall < 0.6) hit("high", "Sleepy: no false alarms, but most strangers slip past.");
    if (k.f1 >= 0.9) { hit("best", "Just right: most strangers caught and few false alarms."); if (S.normal !== FIRST) hit("switch", "A different normal kind and it still works. The detector only needs to know what normal looks like."); }
  }
  // ---------- drawing ----------
  function draw() {
    const c = hcx, P = pal(), L = 10, R = 10, T = 14, B = 26, W = HW - L - R, nb = 24; c.clearRect(0, 0, HW, HH);
    const X = (e) => L + (e / S.tmax) * W, tx = X(S.thr);
    c.fillStyle = P.bad; c.globalAlpha = 0.1; c.fillRect(tx, T, HW - R - tx, HH - T - B); c.globalAlpha = 1;
    const bins = Array.from({ length: nb }, () => ({ n: [], s: [] }));
    S.errs.forEach((e, i) => { const b = Math.min(nb - 1, Math.floor((e / S.tmax) * nb)); (S.set.test[i].stranger ? bins[b].s : bins[b].n).push(i); });
    const mx = Math.max(1, ...bins.map((b) => b.n.length + b.s.length)), dy = Math.min(7.5, (HH - T - B - 4) / mx), r = Math.min(3.4, dy / 2 + 0.4), bw = W / nb;
    bins.forEach((b, j) => b.n.concat(b.s).forEach((i, q) => { c.beginPath(); c.arc(L + (j + 0.5) * bw, HH - B - 4 - r - q * dy, r, 0, 7); c.fillStyle = S.set.test[i].stranger ? P.bad : P.acc; c.fill(); }));
    c.strokeStyle = P.muted; c.lineWidth = 1; c.beginPath(); c.moveTo(L, HH - B); c.lineTo(HW - R, HH - B); c.stroke();
    c.strokeStyle = P.ink; c.lineWidth = 2.5; c.beginPath(); c.moveTo(tx, T - 4); c.lineTo(tx, HH - B); c.stroke();
    c.fillStyle = P.muted; c.font = "700 10px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("rebuild error: small (good) to big (bad)", HW / 2, HH - 8);
    c.textAlign = tx > HW - 60 ? "right" : "left"; c.fillStyle = P.ink; c.fillText("alarm", tx + (tx > HW - 60 ? -4 : 4), T + 4);
    drawGal(P);
  }
  function drawGal(P) {
    const c = gcx, cell = 36, gap = (GW - 8 * cell) / 7; c.clearRect(0, 0, GW, GH);
    S.show.forEach((idx, i) => {
      const x = i * (cell + gap), p = S.set.test[idx], y = S.ae.recon(p.x), e = S.errs[idx], flag = e > S.thr;
      drawPic(c, x, 2, cell, p.x, P); drawPic(c, x, 44, cell, y, P);
      c.lineWidth = 3; c.strokeStyle = flag ? P.bad : P.line; c.strokeRect(x - 0.5, 1.5, cell + 1, cell + 1); c.strokeRect(x - 0.5, 43.5, cell + 1, cell + 1);
      c.fillStyle = p.stranger ? P.bad : P.muted; c.font = "800 9px Nunito, sans-serif"; c.textAlign = "center"; c.fillText(e.toFixed(3), x + cell / 2, 94); c.fillText(p.stranger ? "stranger" : "normal", x + cell / 2, 105);
    });
  }
  // ---------- wiring ----------
  ML.bindRange("#thr", (v) => v, () => { if (!S.ae) return; S.thr = thrOf(); stats(); draw(); checks(); });
  kbox.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.dataset.k === S.normal && S.trained) return; train(b.dataset.k); ML.say(`Now the only normal kind is <b>${b.textContent.trim()}</b>. Learning it...`); });
  $("shuffle").addEventListener("click", () => { pickShow(); draw(); });
  $("best").addEventListener("click", () => {
    if (!S.trained) { ML.toast("Wait until learning has finished."); return; }
    let best = -1, bp = 40;
    for (let p = 0; p <= 100; p++) { const f = C.confusion(S.errs, S.set.test, (p / 100) * S.tmax).f1; if (f > best) { best = f; bp = p; } }
    $("thr").value = bp; $("thr").dispatchEvent(new Event("input", { bubbles: true }));
    ML.say(`Best line: balance <b>${Math.round(best * 100)}%</b>. Some strangers are shy: they look a bit like normal pictures.`);
  });
  onTheme(draw);
  window.GenOddPage = S;
  fresh();
})();
