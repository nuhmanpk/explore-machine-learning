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
// Spot the Seasons page. Logic lives in time-season-core.js (SeasonCore).
const C = window.SeasonCore, W = 340, PH = 300, P = Plot($("chart"), W, PH), PS = Plot($("scan"), 340, 120);
const S = { seed: 0, key: "week", d: null, p: 2, live: false, dec: null, scan: [] };
function load(key) {
  S.key = key; S.seed = S.seed || 1 + Math.floor(Math.random() * 90000); S.d = C.makeSeries(S.seed, key);
  S.scan = C.scan(S.d.y, 2, 30); S.p = 2; S.live = false; $("per").value = 2;
  $("m-week").setAttribute("aria-pressed", key === "week"); $("m-year").setAttribute("aria-pressed", key === "year");
  update();
}
function update() {
  const M = S.d.mode; S.dec = C.decompose(S.d.y, S.p); const f = Math.round(S.dec.strength * 100);
  $("per-v").textContent = S.p; $("fit").textContent = f + "%"; $("fit-bar").style.width = f + "%";
  $("per-hint").textContent = `Each ${M.unit}, the robot asks: has the pattern started over after ${S.p} ${M.unit}s?`;
  inside(); draw();
  if (!S.live) return;
  if (S.key === "week" && S.p === 7 && f >= 70) tick("week", `Found it: it repeats every 7 days. Season fit ${f}%.`, true);
  if (f < 10) tick("wrong", "A wrong length finds almost no pattern. The ups and downs cancel out.");
  if (S.p === M.period * 2 && f >= 70) tick("echo", `Double the length still fits: a 7-day pattern also repeats every 14 days.`);
  if (S.key === "year" && S.p === 12 && f >= 70) tick("year", "Twelve months: the yearly rhythm. Summer sells more ice cream!");
}
function inside() {
  const M = S.d.mode, d = S.dec;
  const peakI = d.pattern.indexOf(Math.max(...d.pattern)), lowI = d.pattern.indexOf(Math.min(...d.pattern));
  const lab = (i) => (S.p === M.period ? M.labels[i] : "step " + (i + 1));
  $("inside").innerHTML = `<div class="sig"><span>Typical high point: <b>${lab(peakI)}</b> (${d.pattern[peakI] >= 0 ? "+" : ""}${d.pattern[peakI].toFixed(1)} cones). Typical low: <b>${lab(lowI)}</b> (${d.pattern[lowI].toFixed(1)}).</span></div>
    <div class="sig"><span>Growth: the trend rises from <b>${d.trend[0].toFixed(0)}</b> to <b>${d.trend[d.trend.length - 1].toFixed(0)}</b>.</span></div>
    <div class="decision">${d.strength >= 0.7 ? "The pattern really repeats at this length." : d.strength >= 0.3 ? "Some of it repeats, so this length is a bit off." : "Almost nothing repeats at this length. Try another."}</div>`;
}
function draw() {
  const { y, truth } = S.d, d = S.dec, n = y.length, M = S.d.mode, cs = ML.cssVar("--accent"), cm = ML.cssVar("--muted");
  P.clear();
  // panel 1: original + trend
  P.sc(0, n - 1, Math.floor(Math.min(...y) / 10) * 10, Math.ceil(Math.max(...y) / 10) * 10);
  const hh = (a, b) => { P.T = a; P.B = PH - b; };
  hh(8, 118); P.axes(); P.line(y, 0, cm, 1.5); P.line(d.trend, 0, ML.cssVar("--warn"), 3); P.text("sales + trend", P.L + 4, 20, ML.cssVar("--ink"));
  // panel 2: season (what robot found), optional truth
  const sm = Math.ceil(Math.max(16, ...d.season.map(Math.abs), ...S.d.season.map(Math.abs)) / 5) * 5;
  hh(128, 208); P.sc(0, n - 1, -sm, sm); P.axes();
  if ($("t-truth").checked) P.line(S.d.season, 0, ML.cssVar("--good"), 2, [5, 4]);
  P.line(d.season, 0, cs, 2.5); P.text("season (repeats every " + S.p + ")", P.L + 4, 140, ML.cssVar("--ink"));
  // panel 3: remainder
  hh(218, 292); P.sc(0, n - 1, -sm, sm); P.axes("time"); P.line(d.remainder, 0, ML.cssVar("--bad"), 1.5); P.text("left over (noise)", P.L + 4, 230, ML.cssVar("--ink"));
  // scan chart
  PS.clear(); PS.L = 34; PS.sc(1.5, 30.5, 0, 1); PS.axes("pattern length", (v) => Math.round(v * 100) + "%");
  const bw = (PS.X(3) - PS.X(2)) * 0.7;
  S.scan.forEach((r) => { const x = PS.X(r.p), y = PS.Y(r.strength); PS.c.fillStyle = r.p === S.p ? ML.cssVar("--ink") : cs; PS.c.globalAlpha = r.p === S.p ? 1 : 0.55; PS.c.fillRect(x - bw / 2, y, bw, PS.Y(0) - y); });
  PS.c.globalAlpha = 1;
}
$("per").addEventListener("input", (e) => {
  S.p = +e.target.value; S.live = true; update(); const f = S.dec.strength, M = S.d.mode;
  ML.say(f >= 0.7 ? `Yes! Lined up every <b>${S.p}</b> ${M.unit}s the same shape shows up again and again: <b>${Math.round(f * 100)}%</b> fit.` : f < 0.1 ? `Nope. At <b>${S.p}</b> the highs and lows land on top of each other and cancel out.` : `Partly. Some of it repeats at <b>${S.p}</b>, but not cleanly. Look at the tall bars below.`);
});
$("auto").addEventListener("click", () => { let b = S.scan[0]; S.scan.forEach((r) => { if (r.strength > b.strength + 0.02) b = r; }); S.p = b.p; S.live = true; $("per").value = b.p; update(); ML.say(`The strongest repeat is every <b>${b.p}</b>. (Its multiples fit well too, so I picked the shortest.)`); });
$("t-truth").addEventListener("change", draw);
$("m-week").addEventListener("click", () => { load("week"); ML.say("Daily sales: how many days until the pattern starts over?"); });
$("m-year").addEventListener("click", () => { load("year"); ML.say("Monthly sales over 7 years. Weather changes through the year, so ice cream has a yearly beat."); });
onTheme(draw);
load("week");

})();
