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
// Predict Tomorrow page. Logic lives in time-forecast-core.js (ForecastCore).
const C = window.ForecastCore, TRAIN = 154, HMAX = 14;
const P = Plot($("chart"), 340, 230), PE = Plot($("errc"), 340, 130), PC = Plot($("coef"), 340, 100);
const S = { seed: 0, y: [], k: 1, H: 7, off: 10, bt: null, bestK: 1, avgByK: [] };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function newPark() {
  S.seed = 1 + Math.floor(Math.random() * 90000); S.y = C.makeSeries(S.seed);
  S.avgByK = []; for (let k = 1; k <= 28; k++) S.avgByK.push(mean(C.backtest(S.y, TRAIN, k, HMAX).err.ar));
  const m = Math.min(...S.avgByK); S.bestK = S.avgByK.indexOf(m) + 1; S.bestAvg = m; update();
}
function update() {
  S.bt = C.backtest(S.y, TRAIN, S.k, HMAX); const e = S.bt.err, h = S.H - 1;
  $("k-v").textContent = S.k; $("hor-v").textContent = S.H; $("org-v").textContent = "day " + (TRAIN + S.off); $("at-h").textContent = `(${S.H} day${S.H > 1 ? "s" : ""} ahead)`;
  $("e-ar").textContent = e.ar[h].toFixed(1); $("e-nv").textContent = e.naive[h].toFixed(1); $("e-sn").textContent = e.snaive[h].toFixed(1);
  draw();
  const avgAr = mean(e.ar);
  if (S.k >= 7 && e.ar[0] < e.naive[0]) tick("beat", `The robot misses by ${e.ar[0].toFixed(1)} for tomorrow, 'same as yesterday' by ${e.naive[0].toFixed(1)}.`, true);
  if (S.k <= 2 && e.snaive[6] < e.ar[6]) tick("short", "With such a short memory the robot cannot see the weekly rhythm. 'Same as last week' wins.");
  if (S.H >= 10 && e.ar[S.H - 1] > e.ar[0]) tick("far", `Looking ${S.H} days ahead: miss ${e.ar[S.H - 1].toFixed(1)} versus ${e.ar[0].toFixed(1)} for tomorrow. Mistakes pile up.`);
  if (avgAr <= S.bestAvg * 1.05) tick("best", `A memory of ${S.k} days is about the best possible here.`, true);
}
function draw() {
  const o = TRAIN + S.off, y = S.y, H = S.H, hist = y.slice(0, o + 1), m = S.bt.model, a = C.forecastAR(m, hist, H), nv = C.naive(hist, H), sn = C.seasonalNaive(hist, H, 7);
  const x0 = o - 35, cs = ML.cssVar("--accent"), seg = y.slice(x0, o + H + 1);
  P.clear(); P.sc(x0, o + H, Math.floor(Math.min(...seg) / 5) * 5, Math.ceil(Math.max(...seg, ...a) / 5) * 5); P.axes("day");
  P.vline(o, ML.cssVar("--muted")); P.text("now", P.X(o) + 3, 20);
  P.line(y.slice(x0, o + 1), x0, ML.cssVar("--ink"), 2);
  P.line([y[o], ...y.slice(o + 1, o + H + 1)], o, ML.cssVar("--good"), 2, [5, 4]);
  P.dots(y.slice(o + 1, o + H + 1), o + 1, ML.cssVar("--good"), 3);
  P.line([y[o], ...nv], o, ML.cssVar("--muted"), 2); P.line([y[o], ...sn], o, ML.cssVar("--warn"), 2); P.line([y[o], ...a], o, cs, 3);
  // error vs horizon
  const e = S.bt.err, top = Math.ceil(Math.max(...e.ar, ...e.naive, ...e.snaive) / 2) * 2;
  PE.clear(); PE.sc(1, HMAX, 0, top); PE.axes("days ahead");
  PE.band(S.H - 0.4, S.H + 0.4, ML.cssVar("--accent"), 0.15);
  PE.line(e.naive, 1, ML.cssVar("--muted"), 2); PE.line(e.snaive, 1, ML.cssVar("--warn"), 2); PE.line(e.ar, 1, cs, 3);
  // weights
  const co = m.coef.slice(1), mx = Math.max(0.2, ...co.map(Math.abs));
  PC.clear(); PC.sc(0.5, 28.5, -mx, mx); PC.L = 34; PC.axes("how many days back", (v) => v.toFixed(1));
  const bw = Math.max(3, (PC.X(2) - PC.X(1)) * 0.7);
  co.forEach((v, i) => { const x = PC.X(i + 1); PC.c.fillStyle = v >= 0 ? cs : ML.cssVar("--bad"); PC.c.fillRect(x - bw / 2, Math.min(PC.Y(0), PC.Y(v)), bw, Math.abs(PC.Y(v) - PC.Y(0))); });
  const big = co.map((v, i) => [Math.abs(v), i + 1]).sort((p, q) => q[0] - p[0])[0];
  $("coef-note").textContent = `Tall bars are days the robot listens to most. Biggest: ${big[1]} day${big[1] > 1 ? "s" : ""} back. ${S.k >= 7 ? "Look for a bar at 7: that is last week, the weekly rhythm." : "It cannot see 7 days back yet."}`;
}
function comment(src) {
  const e = S.bt.err, h = S.H - 1;
  if (src === "k") ML.say(S.k < 7 ? `With <b>${S.k}</b> day${S.k > 1 ? "s" : ""} of memory I cannot notice the weekly rhythm, so I miss by <b>${e.ar[h].toFixed(1)}</b> when looking ${S.H} ahead.` : `With <b>${S.k}</b> days I can see last week too. Miss at ${S.H} days ahead: <b>${e.ar[h].toFixed(1)}</b> (last week's guess: ${e.snaive[h].toFixed(1)}).`);
  else if (src === "h") ML.say(`Looking <b>${S.H}</b> day${S.H > 1 ? "s" : ""} ahead, I miss by <b>${e.ar[h].toFixed(1)}</b> on average. The further ahead, the more my little mistakes pile up.`);
}
$("k").addEventListener("input", (ev) => { S.k = +ev.target.value; update(); comment("k"); });
$("hor").addEventListener("input", (ev) => { S.H = +ev.target.value; update(); comment("h"); });
$("org").addEventListener("input", (ev) => { S.off = +ev.target.value; update(); });
$("bestk").addEventListener("click", () => { S.k = S.bestK; $("k").value = S.k; update(); ML.say(`A memory of <b>${S.k}</b> days gives the smallest average miss across all 14 horizons.`); });
$("newdata").addEventListener("click", () => { newPark(); ML.say("A new park with new random crowds. Find a good memory size again!"); });
onTheme(draw);
newPark();

})();
