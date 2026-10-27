// Bagging vs Boosting page. Logic lives in ens-compare-core.js (CompareCore).
(function () {
  const C = window.CompareCore, $ = (id) => document.getElementById(id);
  const CW = 520, CH = 300, ROUNDS = 80;
  const cc = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 1, noise: 10, r: 40, res: null, hits: {}, ready: false, touched: false };
  const pct = (v) => Math.round(v * 100) + "%", pt = (v) => (v * 100).toFixed(0) + "%";
  let timer = 0;

  function run() { S.res = C.race(S.seed, S.noise / 100, ROUNDS); render(); }
  function drawChart() {
    const c = cc, x = S.res, L = 40, R = 12, T = 12, B = 30, lo = 0.5, hi = 1;
    const X = (k) => L + ((k - 1) / (ROUNDS - 1)) * (CW - L - R), Y = (v) => CH - B - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); const muted = ML.cssVar("--muted");
    c.font = "700 11px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach((v) => { c.fillText(pct(v), L - 5, Y(v) + 4); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); });
    c.textAlign = "center"; c.fillText("rounds (trees added)", (L + CW - R) / 2, CH - 6);
    [1, 20, 40, 60, 80].forEach((k) => c.fillText(k, X(k), CH - B + 14));
    const draw = (arr, col, w, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => (i ? c.lineTo(X(i + 1), Y(v)) : c.moveTo(X(i + 1), Y(v)))); c.stroke(); c.setLineDash([]); };
    draw(new Array(ROUNDS).fill(x.singleAcc), muted, 2, [5, 4]);
    draw(x.boostTrain, ML.cssVar("--warn"), 1.8, [2, 3]);
    draw(x.bag, ML.cssVar("--good"), 2.5); draw(x.boost, ML.cssVar("--accent"), 2.5);
    c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(X(S.r), T); c.lineTo(X(S.r), CH - B); c.stroke(); c.setLineDash([]);
  }
  const hit = (key, msg) => { if (S.hits[key]) return; S.hits[key] = 1; $("c-" + key).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (Object.keys(S.hits).length === 4) ML.confetti(40); };
  function render() {
    if (!S.res) return;
    const x = S.res, k = S.r - 1, last = ROUNDS - 1, bestBoost = Math.max(...x.boost), bestBag = Math.max(...x.bag);
    $("s-one").textContent = pct(x.singleAcc); $("s-bag").textContent = pct(x.bag[k]); $("s-boost").textContent = pct(x.boost[k]);
    const d = x.boost[k] - x.bag[k];
    $("verdict").textContent = Math.abs(d) < 0.01 ? "A tie at this round." : d > 0 ? `Boosting is ahead by ${(d * 100).toFixed(0)} points here.` : `Bagging is ahead by ${(-d * 100).toFixed(0)} points here.`;
    $("inside").innerHTML = `<div class="sig"><span class="mono">boosting: best <b>${pct(bestBoost)}</b> (round ${x.boost.indexOf(bestBoost) + 1}), round 80 <b>${pct(x.boost[last])}</b></span></div>
      <div class="sig"><span class="mono">bagging: best <b>${pct(bestBag)}</b>, round 80 <b>${pct(x.bag[last])}</b></span></div>
      <div class="sig"><span class="mono">boosting on its own training dots: <b>${pct(x.boostTrain[k])}</b> at round ${S.r}</span></div>
      <div class="decision">${x.boostTrain[k] - x.boost[k] > 0.15 ? "Boosting knows its training dots far better than fresh ones: it is memorising the wrong labels." : "Training and fresh scores are close: not much memorising yet."}</div>`;
    drawChart();
    if (!S.touched) return;
    if (S.noise >= 25 && x.boost.some((v, i) => v < x.bag[i] - 0.005)) hit("noisy", "With lots of wrong labels, boosting falls behind bagging.");
    if (bestBoost - x.boost[last] >= 0.04) hit("peak", "Boosting peaked, then slid down as it learned the wrong labels.");
    if (S.noise >= 20 && bestBag - x.bag[last] <= 0.03) hit("steady", "Bagging barely moves: more trees do not hurt.");
    if (S.noise === 0 && Math.abs(x.boost[last] - x.bag[last]) <= 0.03) hit("clean", "With clean labels both teams do great.");
  }
  ML.bindRange("#noise", (v) => v + "%", (v) => {
    S.noise = v; if (!S.ready) return; S.touched = true; clearTimeout(timer);
    timer = setTimeout(() => { run(); const x = S.res; ML.say(`<b>${v}%</b> wrong labels. At round 80 bagging scores <b>${pct(x.bag[ROUNDS - 1])}</b> and boosting <b>${pct(x.boost[ROUNDS - 1])}</b>. Boosting's best was <b>${pct(Math.max(...x.boost))}</b>.`); }, 120);
  });
  ML.bindRange("#rounds", (v) => String(v), (v) => { S.r = v; if (S.ready) render(); });
  $("newdata").addEventListener("click", () => { S.seed = 1 + Math.floor(Math.random() * 90000); S.touched = true; run(); ML.say("Brand new dots with the same noise level. Different seed, a slightly different story, but the trend is the same."); });
  const redraw = () => { if (S.res) drawChart(); };
  new MutationObserver(redraw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", redraw); window.addEventListener("load", redraw);
  S.seed = 1 + Math.floor(Math.random() * 90000); S.ready = true; run();
})();
