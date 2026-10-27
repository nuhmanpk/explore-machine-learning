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
// Smooth the Wiggles page. Logic lives in time-trend-core.js (TrendCore).
const C = window.TrendCore, W = 340, H = 240, P = Plot($("chart"), W, H);
const S = { seed: 0, d: null, w: 1, mode: "trailing", line: false, truth: false, best: {}, avg: [], err: 0, lag: 0 };
function newShop() {
  S.seed = 1 + Math.floor(Math.random() * 90000); S.d = C.makeSeries(S.seed);
  S.best = { trailing: C.bestWindow(S.d.y, S.d.truth, "trailing"), centered: C.bestWindow(S.d.y, S.d.truth, "centered") };
  update();
}
function update() {
  const { y, truth } = S.d; S.avg = C.movingAvg(y, S.w, S.mode);
  S.err = C.rmse(S.avg, truth); S.lag = C.lagOf(S.avg, truth);
  $("s-err").textContent = S.err.toFixed(1); $("s-wig").textContent = C.wiggle(S.avg).toFixed(1); $("s-lag").textContent = S.lag + " d";
  $("win-v").textContent = S.w;
  $("mode-hint").textContent = S.mode === "trailing" ? "Like a live shop: you only know what already happened." : "Like looking back at old records: each day also uses days after it.";
  const bst = S.best[S.mode], ratio = S.err / bst.err;
  $("s-note").textContent = `"Off by" is how far the line is from the real hidden pattern, in cones. The best size here is about ${bst.w} days (off by ${bst.err.toFixed(1)}).`;
  const f = C.linFit(y); $("s-slope").textContent = S.line ? `Trend line: sales grow by about ${f.slope.toFixed(2)} cones every day.` : "";
  draw(f);
  if (S.mode === "trailing" && ratio <= 1.15) tick("sweet", "Sweet spot! Smooth enough to see the pattern, short enough to keep up.", true);
  if (S.mode === "trailing" && S.w >= 30 && S.lag >= 8) tick("lag", "Too much averaging: the line is " + S.lag + " days behind the real pattern.");
  if (S.mode === "centered" && ratio <= 1.15) tick("cent", "Looking at the future too removes the lag. Handy for old records, impossible live!");
  if (S.line) tick("line", "That straight line is the average speed of growth over the whole time.");
}
function draw(f) {
  const { y, truth } = S.d, n = y.length; P.clear(); P.sc(0, n - 1, 0, Math.ceil(Math.max(...y) / 10) * 10); P.axes("day");
  P.dots(y, 0, ML.cssVar("--muted"), 2.2);
  if (S.truth) P.line(truth, 0, ML.cssVar("--good"), 2, [5, 4]);
  if (S.line) P.line(f.line, 0, ML.cssVar("--warn"), 2.5);
  P.line(S.avg, 0, ML.cssVar("--accent"), 3);
}
function comment() {
  if (S.w <= 2) ML.say("That is still a <b>wiggly mess</b>. Luck on a single day hides the real pattern. Average more days!");
  else if (S.mode === "trailing" && S.w >= 25) ML.say(`Smooth, but look at the heat-wave jump: my line only catches up about <b>${S.lag} days</b> later. Too many days makes me slow.`);
  else if (S.err / S.best[S.mode].err <= 1.15) ML.say("That looks right: calm, yet still following the real changes.");
  else ML.say("Better. Keep sliding and watch the <b>Off by</b> number: it is smallest at the sweet spot.");
}
$("win").addEventListener("input", (e) => { S.w = +e.target.value; update(); comment(); });
function setMode(m) { S.mode = m; $("m-trail").setAttribute("aria-pressed", m === "trailing"); $("m-cent").setAttribute("aria-pressed", m === "centered"); update(); if (m === "centered") ML.say("Now each day also peeks at the <b>future</b> days. The lag disappears, but a shop could never do this live."); }
$("m-trail").addEventListener("click", () => setMode("trailing")); $("m-cent").addEventListener("click", () => setMode("centered"));
$("t-line").addEventListener("change", (e) => { S.line = e.target.checked; update(); });
$("t-truth").addEventListener("change", (e) => { S.truth = e.target.checked; update(); });
$("best").addEventListener("click", () => { S.w = S.best[S.mode].w; $("win").value = S.w; update(); comment(); });
$("newdata").addEventListener("click", () => { newShop(); ML.say("A new shop with new random luck. Find the sweet spot again!"); });
onTheme(() => draw(C.linFit(S.d.y)));
newShop();

})();
