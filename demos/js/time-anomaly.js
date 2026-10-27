(function () {
// Tiny canvas line-chart helper + challenge ticking, shared by the time lessons.
function Plot(cv, W, H) {
  const c = ML.setupCanvas(cv, W, H).ctx, P = { c, W, H, L: 34, R: 8, T: 10, B: 20 };
  P.sc = (x0, x1, y0, y1) => { P.x0 = x0; P.x1 = x1; P.y0 = y0; P.y1 = y1; };
  P.X = (x) => P.L + ((x - P.x0) / (P.x1 - P.x0 || 1)) * (W - P.L - P.R);
  P.Y = (v) => H - P.B - ((v - P.y0) / (P.y1 - P.y0 || 1)) * (H - P.T - P.B);
  P.clear = () => c.clearRect(0, 0, W, H);
  P.text = (t, x, y, col, al) => { c.font = "700 10px Nunito, sans-serif"; c.fillStyle = col || ML.cssVar("--muted"); c.textAlign = al || "left"; c.fillText(t, x, y); };
  P.axes = (xl, fmt) => {
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1;
    for (let i = 0; i <= 2; i++) { const v = P.y0 + ((P.y1 - P.y0) * i) / 2, y = P.Y(v); c.beginPath(); c.moveTo(P.L, y); c.lineTo(W - P.R, y); c.stroke(); P.text(fmt ? fmt(v) : Math.round(v), P.L - 4, y + 3, null, "right"); }
    if (xl) P.text(xl, (P.L + W - P.R) / 2, H - 4, null, "center");
  };
  P.line = (a, start, col, lw, dash) => {
    c.strokeStyle = col; c.lineWidth = lw || 2; c.lineJoin = "round"; c.setLineDash(dash || []); c.beginPath(); let pen = false;
    a.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } const x = P.X(start + i), y = P.Y(v); pen ? c.lineTo(x, y) : c.moveTo(x, y); pen = true; });
    c.stroke(); c.setLineDash([]);
  };
  P.dots = (a, start, col, r) => { c.fillStyle = col; a.forEach((v, i) => { if (v === null) return; c.beginPath(); c.arc(P.X(start + i), P.Y(v), r || 2, 0, 7); c.fill(); }); };
  P.vline = (x, col, dash) => { c.strokeStyle = col; c.lineWidth = 1.5; c.setLineDash(dash || [3, 3]); c.beginPath(); c.moveTo(P.X(x), P.T); c.lineTo(P.X(x), H - P.B); c.stroke(); c.setLineDash([]); };
  P.band = (x0, x1, col, al) => { c.save(); c.globalAlpha = al; c.fillStyle = col; c.fillRect(P.X(x0), P.T, P.X(x1) - P.X(x0), H - P.T - P.B); c.restore(); };
  return P;
}
const $ = (id) => document.getElementById(id);
const hits = {};
let live = false;
// challenges only count after the person has touched a control
["input", "change"].forEach((t) => document.addEventListener(t, () => { live = true; }, true));
document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && b.id !== "newdata") live = true; }, true);
function tick(k, msg, big) {
  if (!live || hits[k]) return; hits[k] = 1; $("c-" + k).classList.add("done");
  ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (big) ML.confetti(40);
}
function onTheme(fn) { new MutationObserver(fn).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] }); window.addEventListener("load", fn); }
// Spot the Odd One page. Logic lives in time-anomaly-core.js (AnomalyCore).
const C = window.AnomalyCore, P = Plot($("chart"), 340, 240), PR = Plot($("pr"), 340, 120);
const S = { seed: 0, d: null, thr: 3, w: 20, reveal: false, det: null, sc: null };
function newSensor() { S.seed = 1 + Math.floor(Math.random() * 90000); S.d = C.makeStream(S.seed); S.reveal = false; $("reveal").setAttribute("aria-pressed", false); update(); }
function update() {
  S.det = C.detect(S.d.y, S.w, S.thr); S.sc = C.score(S.det.flags, S.d.truth); const s = S.sc, pc = (v) => Math.round(v * 100) + "%", alarms = s.tp + s.fp;
  $("thr-v").textContent = S.thr.toFixed(1); $("win-v").textContent = S.w;
  $("s-prec").textContent = alarms ? pc(s.precision) : "-"; $("s-rec").textContent = pc(s.recall); $("s-f1").textContent = pc(s.f1);
  $("s-note").textContent = `${alarms} alarm${alarms === 1 ? "" : "s"}: ${s.tp} real, ${s.fp} false. Caught ${s.caught} of ${s.events} real problems, missed ${s.missed}.`;
  draw();
  if (alarms >= 5 && s.fp === 0) tick("quiet", "Every alarm was real! But how many problems did you miss?");
  if (s.recall >= 0.9) tick("catch", `Caught ${s.caught} of ${s.events} problems. But look at the false alarms!`);
  if (s.f1 >= 0.65) tick("balance", "A good balance of false alarms and misses.", true);
  if (S.det.flags.slice(240, 276).some(Boolean) && S.d.truth.slice(240, 276).some(Boolean) && S.det.flags.some((f, i) => f && S.d.kind[i] === "drift")) tick("drift", "You caught the slow drift. Sneaky!");
}
function draw() {
  const { y, truth } = S.d, n = y.length, d = S.det, cs = ML.cssVar("--accent");
  P.clear(); P.sc(0, n - 1, 10, 36); P.axes("time (minutes)");
  const hi = d.mu.map((m, i) => (m === null ? null : Math.min(36, m + S.thr * d.sd[i]))), lo = d.mu.map((m, i) => (m === null ? null : Math.max(10, m - S.thr * d.sd[i])));
  P.c.save(); P.c.globalAlpha = 0.16; P.c.fillStyle = cs; P.c.beginPath(); let first = true;
  hi.forEach((v, i) => { if (v === null) return; first ? P.c.moveTo(P.X(i), P.Y(v)) : P.c.lineTo(P.X(i), P.Y(v)); first = false; });
  for (let i = n - 1; i >= 0; i--) if (lo[i] !== null) P.c.lineTo(P.X(i), P.Y(lo[i]));
  P.c.closePath(); P.c.fill(); P.c.restore();
  P.band(0, S.w, ML.cssVar("--muted"), 0.12); P.text("warm-up", P.X(0) + 3, 20);
  P.line(y.map((v) => Math.max(10, Math.min(36, v))), 0, ML.cssVar("--muted"), 1.5);
  if (S.reveal) { P.c.strokeStyle = ML.cssVar("--good"); P.c.lineWidth = 2; truth.forEach((t, i) => { if (!t) return; P.c.beginPath(); P.c.arc(P.X(i), P.Y(Math.max(10, Math.min(36, y[i]))), 7.5, 0, 7); P.c.stroke(); }); }
  P.c.fillStyle = ML.cssVar("--bad"); d.flags.forEach((f, i) => { if (!f) return; P.c.beginPath(); P.c.arc(P.X(i), P.Y(Math.max(10, Math.min(36, y[i]))), 3.5, 0, 7); P.c.fill(); });
  // precision / recall vs alarm line
  const sw = C.sweep(y, truth, S.w, 1, 6, 0.1); PR.clear(); PR.sc(0, sw.length - 1, 0, 1); PR.axes("alarm line: 1 (jumpy) to 6 (relaxed)", (v) => Math.round(v * 100) + "%");
  PR.band((S.thr - 1) * 10 - 0.4, (S.thr - 1) * 10 + 0.4, ML.cssVar("--ink"), 0.5);
  PR.line(sw.map((r) => r.precision), 0, cs, 2.5); PR.line(sw.map((r) => r.recall), 0, ML.cssVar("--warn"), 2.5);
}
function comment(src) {
  const s = S.sc, alarms = s.tp + s.fp;
  if (src === "thr") ML.say(S.thr < 2.2 ? `Very jumpy: <b>${alarms}</b> alarms, but <b>${s.fp}</b> were false. I catch ${s.caught} of ${s.events} problems.` : S.thr > 4.5 ? `Very relaxed: only <b>${alarms}</b> alarms, nearly all real, but I missed <b>${s.missed}</b> of ${s.events} problems.` : `Alarm line <b>${S.thr.toFixed(1)}</b>: ${s.fp} false alarms, ${s.missed} problems missed. Can you get both low?`);
  else ML.say(`Memory of <b>${S.w}</b> readings. ${S.w < 12 ? "A short memory makes my idea of normal jumpy." : S.w > 40 ? "A long memory is steadier, and a slow drift is harder to hide." : "A medium memory balances steady and quick."}`);
}
$("thr").addEventListener("input", (e) => { S.thr = +e.target.value; update(); comment("thr"); });
$("win").addEventListener("input", (e) => { S.w = +e.target.value; update(); comment("win"); });
$("reveal").addEventListener("click", () => { S.reveal = !S.reveal; $("reveal").setAttribute("aria-pressed", S.reveal); draw(); if (S.reveal) ML.say("Green rings are the real problems. Red dots are my alarms. A red dot with no ring is a <b>false alarm</b>; a ring with no red dot is a <b>miss</b>."); });
$("newdata").addEventListener("click", () => { newSensor(); ML.say("A new sensor with new problems hiding in it."); });
onTheme(draw);
newSensor();

})();
