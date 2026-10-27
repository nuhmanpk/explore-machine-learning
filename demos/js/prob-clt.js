// Averages Get Bell-Shaped page. Logic lives in prob-clt-core.js (CltCore).
(function () {
  const C = window.CltCore, $ = (id) => document.getElementById(id);
  const W = 300, SH = 90, MH = 160, CHH = 130, BINS = 32;
  const { ctx: sx } = ML.setupCanvas($("src"), W, SH), { ctx: mx } = ML.setupCanvas($("means"), W, MH), { ctx: ix } = ML.setupCanvas($("ci"), W, CHH);
  const S = { src: "flat", n: 1, means: [], method: "formula", sample: null, ci: null, ran: false, hits: {}, r: C.rng(1 + Math.floor(Math.random() * 900000)) };
  const f = (x, d = 2) => x.toFixed(d);

  function hist(c, h0, counts, lo, hi, pdf, x0 = 22, x1 = W - 8, top = 8, bot = h0 - 20) {
    const ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted"), acc = ML.cssVar("--accent"), warn = ML.cssVar("--warn");
    const max = Math.max(1, ...counts), bw = (x1 - x0) / counts.length;
    c.clearRect(0, 0, W, h0);
    c.fillStyle = acc; c.globalAlpha = 0.85;
    counts.forEach((k, i) => { const h = Math.max(0, (k / max) * (bot - top) * 0.92); if (h > 0) c.fillRect(x0 + i * bw + 0.5, bot - h, Math.max(1, bw - 1), h); });
    c.globalAlpha = 1;
    if (pdf) { c.strokeStyle = warn; c.lineWidth = 2.5; c.beginPath(); pdf.forEach((v, i) => { const y = bot - Math.min(1.2, v / max) * (bot - top) * 0.92; i ? c.lineTo(x0 + (i + 0.5) * bw, y) : c.moveTo(x0 + (i + 0.5) * bw, y); }); c.stroke(); }
    c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0, bot + 0.5); c.lineTo(x1, bot + 0.5); c.stroke();
    c.fillStyle = muted; c.font = "700 10px sans-serif"; c.textAlign = "center";
    for (let k = 0; k <= 4; k++) c.fillText(f(lo + ((hi - lo) * k) / 4), x0 + ((x1 - x0) * k) / 4, h0 - 6);
  }
  function stats() {
    const st = C.sourceStats(S.src), se = st.sd / Math.sqrt(S.n), lo = Math.max(0, st.mean - 4 * se), hi = Math.min(1, st.mean + 4 * se);
    return { st, se, lo, hi };
  }
  function drawAll() {
    const { st, se, lo, hi } = stats();
    hist(sx, SH, C.histogram(st.sample, BINS, 0, 1), 0, 1, null);
    const counts = C.histogram(S.means, BINS, lo, hi), bwid = (hi - lo) / BINS;
    const pdf = counts.map((_, i) => C.normalPdf(lo + (i + 0.5) * bwid, st.mean, se) * bwid * S.means.length);
    hist(mx, MH, counts, lo, hi, S.means.length ? pdf : null);
    drawCI();
  }
  function drawCI() {
    const c = ix, ink = ML.cssVar("--ink"), good = ML.cssVar("--good"), bad = ML.cssVar("--bad"), acc = ML.cssVar("--accent"), muted = ML.cssVar("--muted");
    c.clearRect(0, 0, W, CHH);
    c.fillStyle = muted; c.font = "700 10px sans-serif"; c.textAlign = "left";
    if (!S.sample) { c.fillText("Your sample will appear here.", 10, 40); return; }
    const mu = C.sourceStats(S.src).mean, ci = S.ci, X = (v) => 10 + v * (W - 20);
    c.fillStyle = acc; c.globalAlpha = 0.18; c.fillRect(X(ci.lo), 8, Math.max(2, X(ci.hi) - X(ci.lo)), 40); c.globalAlpha = 1;
    S.sample.forEach((v, i) => { c.fillStyle = acc; c.beginPath(); c.arc(X(v), 14 + ((i * 37) % 30), 2.5, 0, 6.2832); c.fill(); });
    c.strokeStyle = good; c.lineWidth = 2; c.beginPath(); c.moveTo(X(mu), 6); c.lineTo(X(mu), 50); c.stroke();
    c.fillStyle = muted; c.fillText("all draws 0 to 1 (green line = true average)", 10, 62);
    // zoomed view of the interval
    const se = Math.max((ci.hi - ci.lo) / 3.92, 1e-4), zl = ci.mean - 3.2 * se, zh = ci.mean + 3.2 * se, Z = (v) => 10 + ((v - zl) / (zh - zl)) * (W - 20), base = CHH - 18;
    if (ci.boots) {
      const h = C.histogram(ci.boots, 28, zl, zh), mx2 = Math.max(...h), bw = (W - 20) / 28;
      c.fillStyle = acc; c.globalAlpha = 0.6; h.forEach((k, i) => c.fillRect(10 + i * bw + 0.5, base - (k / mx2) * 40, Math.max(1, bw - 1), (k / mx2) * 40)); c.globalAlpha = 1;
    } else {
      c.strokeStyle = acc; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i <= 40; i++) { const v = zl + ((zh - zl) * i) / 40, y = base - (C.normalPdf(v, ci.mean, se) / C.normalPdf(ci.mean, ci.mean, se)) * 40; i ? c.lineTo(Z(v), y) : c.moveTo(Z(v), y); } c.stroke();
    }
    c.strokeStyle = ink; c.lineWidth = 3; c.beginPath(); c.moveTo(Z(ci.lo), base + 6); c.lineTo(Z(ci.hi), base + 6); c.stroke();
    const inside = ci.lo <= mu && mu <= ci.hi, tx = Math.min(W - 12, Math.max(12, Z(mu)));
    c.fillStyle = inside ? good : bad; c.beginPath(); c.arc(tx, base + 6, 5, 0, 6.2832); c.fill();
    c.fillStyle = muted; c.textAlign = "center"; c.fillText("zoom: " + (ci.boots ? "1,000 bootstrap averages" : "bell from formula"), W / 2, CHH - 2);
  }
  function render() {
    const { st, se } = stats(), m = S.means;
    $("n-lbl").textContent = S.n; $("cnt").textContent = m.length.toLocaleString();
    $("spr").textContent = m.length > 1 ? f(C.sd(m), 3) : "-"; $("skw").textContent = m.length > 20 ? f(C.skew(m)) : "-";
    $("spr-note").textContent = `Source spread ${f(st.sd, 3)}. Bell predicted by σ ÷ √n = ${f(se, 3)}.`;
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Each blue bar counts averages of <b>${S.n}</b> draws.</span></div>
      <div class="sig"><span class="dot" style="background:var(--warn)"></span><span>The orange bell is what the theory says: centre <b>${f(st.mean, 3)}</b>, width <b>${f(se, 3)}</b>.</span></div>
      <div class="decision">${S.n === 1 ? "With 1 number the averages copy the source shape." : "Bigger groups: narrower, rounder bell."}</div>`;
    drawAll(); check();
  }
  const CHK = {
    narrow: () => S.n >= 5 && S.means.length >= 500 && C.sd(S.means) < 0.5 * C.sourceStats(S.src).sd && "The bell is less than half as wide as the source. Averaging cancels out noise.",
    bell: () => S.src === "skewed" && S.n >= 60 && S.means.length >= 1000 && Math.abs(C.skew(S.means)) < 0.4 && "A lopsided source, a near-symmetric bell. That is the central limit theorem at work.",
    humps: () => {
      if (S.src !== "humps" || S.n < 10 || S.means.length < 500) return false;
      const { st, se, lo, hi } = stats(), h = C.histogram(S.means, BINS, lo, hi), i = h.indexOf(Math.max(...h)), mid = lo + (i + 0.5) * ((hi - lo) / BINS);
      return Math.abs(mid - st.mean) < 1.5 * se && "Averages pile up in the middle, right where the source had a valley!";
    },
    boot: () => S.method === "boot" && S.sample && S.sample.length >= 10 && "Bootstrap done: you made an interval just by resampling your own sample.",
    ci: () => S.ran && S.ran.n >= 30 && S.ran.p >= 0.85 && S.ran.p <= 0.99 && "The 95% promise holds: about 95 out of 100 intervals caught the truth.",
  };
  function check() {
    for (const k in CHK) { if (S.hits[k]) continue; const m = CHK[k](); if (m) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); } }
  }
  function add(k) { for (const v of C.sampleMeans(S.src, S.n, k, S.r)) S.means.push(v); if (S.means.length > 20000) S.means.splice(0, S.means.length - 20000); render(); }
  function clear() { S.means = []; render(); }
  $("m100").onclick = () => add(100); $("m2k").onclick = () => add(2000); $("mreset").onclick = clear;
  ML.bindRange("#n", (v) => String(v), (v) => { if (S.ready && v !== S.n) { S.n = v; S.means = []; render(); } S.n = v; });
  document.querySelectorAll("[data-src]").forEach((b) => (b.onclick = () => {
    S.src = b.dataset.src; S.means = []; S.sample = null; S.ci = null; S.ran = false; $("cov-txt").textContent = ""; $("ci-txt").textContent = "Take one sample to build an interval.";
    document.querySelectorAll("[data-src]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    render();
  }));
  function makeCI() {
    if (!S.sample) return;
    S.ci = S.method === "boot" ? C.ciBootstrap(S.sample, 1000, S.r) : C.ciFormula(S.sample);
    const mu = C.sourceStats(S.src).mean, ok = S.ci.lo <= mu && mu <= S.ci.hi;
    $("ci-txt").textContent = `${S.sample.length} draws, average ${f(S.ci.mean, 3)}. 95% interval ${f(S.ci.lo, 3)} to ${f(S.ci.hi, 3)}. True average ${f(mu, 3)}: ${ok ? "caught it" : "missed!"}`;
    drawCI(); check();
  }
  $("one").onclick = () => { S.sample = C.sampleOf(S.src, Math.max(2, S.n), S.r); makeCI(); };
  document.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => {
    S.method = b.dataset.m;
    document.querySelectorAll("[data-m]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    makeCI();
  }));
  $("cov").onclick = () => {
    const n = Math.max(2, S.n), p = C.coverage(S.src, n, 200, 1 + Math.floor(Math.random() * 900000), S.method);
    S.ran = { n, p }; $("cov-txt").textContent = `${Math.round(p * 200)} of 200 intervals (${Math.round(p * 100)}%) caught the true average. n = ${n}, ${S.method === "boot" ? "bootstrap" : "formula"}.`; check();
  };
  S.ready = true; render();
  document.addEventListener("themechange", drawAll);
})();
