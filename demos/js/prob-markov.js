// Next State Please page. Logic lives in prob-markov-core.js (MarkovCore).
(function () {
  const C = window.MarkovCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MW = 300, MH = 230, FW = 300, FH = 120, PW = 300, PH = 130;
  const { ctx: mx } = ML.setupCanvas($("map"), MW, MH), { ctx: fx } = ML.setupCanvas($("freq"), FW, FH), { ctx: px } = ML.setupCanvas($("power"), PW, PH);
  const POS = [{ x: 55, y: 62 }, { x: 245, y: 62 }, { x: 150, y: 180 }], R = 26, COL = ["--warn", "--muted", "--accent"];
  const S = { W: C.DEFAULT_W.map((r) => r.slice()), P: null, pi: null, hist: null, cur: 0, from: 0, anim: 1, counts: [1, 0, 0], steps: 0, r: C.rng(1 + Math.floor(Math.random() * 900000)), edited: false, timer: null, order: 1, model: null, hits: {}, wrote: false, tid: 0 };
  const pct = (x) => Math.round(x * 100) + "%";

  function recompute() {
    S.P = C.normalize(S.W); S.pi = C.stationary(S.P); S.hist = C.powerIteration(S.P, [1, 0, 0], 30);
  }
  function quad(a, b, t) {
    const A = POS[a], B = POS[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), nx = -dy / d, ny = dx / d;
    const ux = dx / d, uy = dy / d, s = { x: A.x + ux * R, y: A.y + uy * R }, e = { x: B.x - ux * R, y: B.y - uy * R }, c = { x: (A.x + B.x) / 2 + nx * 20, y: (A.y + B.y) / 2 + ny * 20 };
    return { p: { x: (1 - t) ** 2 * s.x + 2 * (1 - t) * t * c.x + t * t * e.x, y: (1 - t) ** 2 * s.y + 2 * (1 - t) * t * c.y + t * t * e.y }, s, e, c };
  }
  function drawMap() {
    const c = mx, ink = ML.cssVar("--ink"), card = ML.cssVar("--card"), muted = ML.cssVar("--muted");
    c.clearRect(0, 0, MW, MH); c.textAlign = "center"; c.font = "700 11px sans-serif";
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const p = S.P[a][b]; if (a === b || p < 0.005) continue;
      const q = quad(a, b, 0.5), g = quad(a, b, 1);
      c.strokeStyle = ink; c.globalAlpha = 0.25 + 0.75 * p; c.lineWidth = 1 + 4 * p; c.beginPath(); c.moveTo(q.s.x, q.s.y); c.quadraticCurveTo(q.c.x, q.c.y, q.e.x, q.e.y); c.stroke();
      const t = quad(a, b, 0.92).p, ang = Math.atan2(g.e.y - t.y, g.e.x - t.x);
      c.fillStyle = ink; c.beginPath(); c.moveTo(g.e.x, g.e.y); c.lineTo(g.e.x - 9 * Math.cos(ang - 0.45), g.e.y - 9 * Math.sin(ang - 0.45)); c.lineTo(g.e.x - 9 * Math.cos(ang + 0.45), g.e.y - 9 * Math.sin(ang + 0.45)); c.fill(); c.globalAlpha = 1;
      c.fillStyle = ink; c.fillText(pct(p), q.p.x, q.p.y + 4);
    }
    for (let i = 0; i < 3; i++) {
      c.fillStyle = ML.cssVar(COL[i]); c.globalAlpha = i === S.cur && S.anim >= 1 ? 1 : 0.55; c.strokeStyle = ink; c.lineWidth = 2.5;
      c.beginPath(); c.arc(POS[i].x, POS[i].y, R, 0, 6.2832); c.fill(); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = i === 1 ? ink : "#000"; c.font = "800 11px sans-serif"; c.fillText(C.STATES[i], POS[i].x, POS[i].y - 1);
      c.font = "700 10px sans-serif"; c.fillText("stay " + pct(S.P[i][i]), POS[i].x, POS[i].y + 11);
    }
    let pos = POS[S.cur];
    if (S.anim < 1 && S.from !== S.cur) pos = quad(S.from, S.cur, S.anim).p;
    else if (S.anim < 1) pos = { x: POS[S.cur].x, y: POS[S.cur].y - 8 * Math.sin(S.anim * Math.PI) };
    c.fillStyle = card; c.strokeStyle = ink; c.lineWidth = 3; c.beginPath(); c.arc(pos.x, pos.y - (S.anim >= 1 ? 30 : 0) * 0 + (S.anim >= 1 ? 0 : 0), 7, 0, 6.2832); c.fill(); c.stroke();
    c.fillStyle = ink; c.beginPath(); c.arc(pos.x, pos.y, 2.5, 0, 6.2832); c.fill();
  }
  function drawFreq() {
    const c = fx, ink = ML.cssVar("--ink"), acc = ML.cssVar("--accent"), muted = ML.cssVar("--muted"), L = 10, bw = (FW - 2 * L) / 3, base = FH - 22, top = 14;
    c.clearRect(0, 0, FW, FH); c.textAlign = "center"; c.font = "700 11px sans-serif";
    const tot = Math.max(1, S.counts.reduce((a, b) => a + b, 0));
    for (let i = 0; i < 3; i++) {
      const f = S.counts[i] / tot, x = L + i * bw, h = f * (base - top);
      c.fillStyle = acc; c.globalAlpha = 0.85; c.fillRect(x + 12, base - h, bw - 24, Math.max(0, h)); c.globalAlpha = 1;
      const y = base - S.pi[i] * (base - top); c.strokeStyle = ink; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 6, y); c.lineTo(x + bw - 6, y); c.stroke();
      c.fillStyle = ink; c.fillText(C.STATES[i] + " " + pct(f), x + bw / 2, FH - 6);
    }
    c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, base + 0.5); c.lineTo(FW - L, base + 0.5); c.stroke();
  }
  function drawPower() {
    const c = px, L = 26, T = 8, B = 20, w = PW - L - 10, h = PH - T - B, n = S.hist.length - 1, ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted");
    c.clearRect(0, 0, PW, PH); c.font = "700 9px sans-serif"; c.textAlign = "right"; c.fillStyle = muted; c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1;
    for (const v of [0, 0.5, 1]) { const y = T + (1 - v) * h; c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke(); c.fillText(pct(v), L - 3, y + 3); }
    c.textAlign = "center"; c.fillText("times the table was applied", L + w / 2, PH - 4); [0, 10, 20, 30].forEach((k) => c.fillText(k, L + (k / n) * w, PH - 12));
    for (let i = 0; i < 3; i++) { c.strokeStyle = ML.cssVar(COL[i]); c.lineWidth = 3; c.beginPath(); S.hist.forEach((d, t) => { const x = L + (t / n) * w, y = T + (1 - d[i]) * h; t ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); }
  }
  function render() {
    const tot = S.counts.reduce((a, b) => a + b, 0), fq = S.counts.map((k) => k / Math.max(1, tot));
    $("today").textContent = `Day ${S.steps}: ${C.STATES[S.cur]}. Tomorrow: ${C.STATES.map((s, j) => s + " " + pct(S.P[S.cur][j])).join(", ")}.`;
    $("power-txt").innerHTML = [0, 1, 2, 5, 30].map((t) => `step ${String(t).padStart(2, " ")}: ${S.hist[t].map((v) => pct(v).padStart(4, " ")).join(" ")}`).join("<br>").replace(/ /g, "&nbsp;") + `<br><b>long-run: ${S.pi.map((v) => pct(v)).join(" ")}</b>`;
    const gap = Math.max(...fq.map((f, i) => Math.abs(f - S.pi[i])));
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Today is <b>${C.STATES[S.cur]}</b>, so only row <b>${C.STATES[S.cur]}</b> of the table is used.</span></div>
      <div class="sig"><span class="dot" style="background:var(--warn)"></span><span>Biggest gap between the walker and the long-run answer: <b>${(gap * 100).toFixed(1)}</b> points.</span></div>
      <div class="decision">${S.steps < 50 ? "Few days so far, so the bars are still wobbly." : "More days, closer to the marker."}</div>`;
    drawMap(); drawFreq(); drawPower(); check(gap);
  }
  function check(gap) {
    const T = { walk: S.steps >= 100 && "100 days walked. The walker only ever looked at today.", match: S.steps >= 2000 && gap < 0.035 && "The bars settled onto the long-run answer. Power iteration predicted it without any walking!",
      rainy: S.pi[2] > 0.5 && "More than half the days are rainy in the long run. The table decides everything." };
    for (const k in T) if (!S.hits[k] && T[k]) done(k, T[k]);
  }
  function done(k, m) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); }

  function hop(fast) {
    const nx = C.step(S.P, S.cur, S.r); S.counts[nx]++; S.steps++; S.from = S.cur; S.cur = nx;
    if (!fast && !reduce) { S.anim = 0; const t0 = performance.now(), id = ++S.tid; const tick = (t) => { if (id !== S.tid) return; S.anim = Math.min(1, (t - t0) / 220); drawMap(); if (S.anim < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); } else S.anim = 1;
  }
  $("step").onclick = () => { hop(false); render(); };
  $("s1k").onclick = () => { for (let i = 0; i < 1000; i++) hop(true); S.anim = 1; render(); };
  $("play").onclick = () => {
    const on = !S.timer; $("play").setAttribute("aria-pressed", on);
    if (on) { S.timer = setInterval(() => { hop(false); render(); }, 300); $("play").innerHTML = '<i data-icon="pause"></i> Pause'; } else { clearInterval(S.timer); S.timer = null; $("play").innerHTML = '<i data-icon="play"></i> Play'; }
    ML.hydrateIcons && ML.hydrateIcons($("play"));
  };
  function restart() { S.tid++; S.counts = [0, 0, 0]; S.counts[S.cur]++; S.steps = 0; S.anim = 1; render(); }
  $("wreset").onclick = () => { S.cur = 0; S.counts = [1, 0, 0]; S.steps = 0; S.anim = 1; S.tid++; render(); };

  // ---- table ----
  function buildTable() {
    let h = '<span></span>' + C.STATES.map((s) => `<span class="h">to ${s}</span>`).join("");
    for (let i = 0; i < 3; i++) { h += `<span class="rl">${C.STATES[i]}</span>`; for (let j = 0; j < 3; j++) h += `<input type="number" min="0" max="100" step="5" data-i="${i}" data-j="${j}" aria-label="Chance of ${C.STATES[j]} after ${C.STATES[i]}" value="${Math.round(S.P ? S.P[i][j] * 100 : S.W[i][j])}">`; }
    $("tbl").innerHTML = h;
  }
  function tableChanged(re) {
    recompute(); S.edited = true; S.counts = [0, 0, 0]; S.counts[S.cur] = 1; S.steps = 0; S.anim = 1; S.tid++;
    if (re) buildTable(); render();
  }
  $("tbl").addEventListener("input", (e) => { const t = e.target; if (!t.dataset.i) return; S.W[+t.dataset.i][+t.dataset.j] = Math.max(0, parseFloat(t.value) || 0); tableChanged(false); });
  $("tbl").addEventListener("change", () => { S.W = S.P.map((r) => r.map((x) => Math.round(x * 100))); buildTable(); });
  $("treset").onclick = () => { S.W = C.DEFAULT_W.map((r) => r.slice()); tableChanged(true); };
  $("trainy").onclick = () => { S.W = [[30, 20, 50], [10, 30, 60], [5, 15, 80]]; tableChanged(true); };

  // ---- text ----
  function model() { S.model = C.buildModel(C.CORPUS, S.order); }
  $("corpus").textContent = C.CORPUS.replace(/ \./g, ".").replace(/(^|\. )(\w)/g, (m, a, b) => a + b.toUpperCase());
  document.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => {
    S.order = +b.dataset.o; model();
    document.querySelectorAll("[data-o]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    $("sentence").textContent = "Press the button!"; $("nexts").innerHTML = "";
  }));
  $("gen").onclick = () => {
    const s = C.generate(S.model, S.r); $("sentence").textContent = s;
    const key = s.toLowerCase().replace(/\./g, "").split(" ").slice(S.order === 1 ? 0 : 0, S.order).join(" ");
    const o = C.nextProbs(S.model, key).slice(0, 5);
    $("nexts").innerHTML = `<span style="border:0;background:none">After "${key}":</span>` + o.map((e) => `<span>${e.word} ${pct(e.p)}</span>`).join("");
    if (!S.hits.text) done("text", "Your chain wrote a sentence by picking each next word from a table of counts.");
    if (S.order === 2 && !S.hits.o2) done("o2", "With 2 words of memory the sentences copy the story more closely, because there are fewer choices.");
  };

  recompute(); model(); buildTable(); render();
  document.addEventListener("themechange", () => { drawMap(); drawFreq(); drawPower(); });
})();
