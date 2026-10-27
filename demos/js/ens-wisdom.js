// Wisdom of the Crowd page. Logic lives in ens-wisdom-core.js (WisdomCore).
(function () {
  const C = window.WisdomCore, $ = (id) => document.getElementById(id), MAX = 200;
  const SW = 640, SH = 230, CW = 300, CH = 170;
  const sc = ML.setupCanvas($("strip"), SW, SH).ctx, cc = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 1, n: 10, bias: 0, crowd: null, curve0: null, curveB: null, pickedIdx: -1, picks: 0, wins: 0, hits: {} };
  const fmt = (v) => Math.round(v).toLocaleString();

  function newJar() {
    S.seed = 1 + Math.floor(Math.random() * 90000); S.picks = 0; S.wins = 0; S.pickedIdx = -1; S.hits = {};
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    $("pickout").textContent = "";
    S.curve0 = C.errorCurve(S.seed, MAX, 0); rebuild();
  }
  function rebuild() { S.crowd = C.makeCrowd(S.seed, MAX, S.bias / 100); S.curveB = S.bias ? C.errorCurve(S.seed, MAX, S.bias / 100) : S.curve0; update(); }

  function drawStrip() {
    const c = sc, cr = S.crowd, T = cr.truth, lo = T * 0.1, hi = T * 1.9, L = 14, R = SW - 14, B = SH - 44;
    const X = (v) => L + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (R - L);
    c.clearRect(0, 0, SW, SH);
    const muted = ML.cssVar("--muted"), ink = ML.cssVar("--ink"), good = ML.cssVar("--good"), acc = ML.cssVar("--accent"), warn = ML.cssVar("--warn"), line = ML.cssVar("--line");
    c.strokeStyle = line; c.lineWidth = 2; c.beginPath(); c.moveTo(L, B + 4); c.lineTo(R, B + 4); c.stroke();
    c.font = "700 11px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "center";
    [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].forEach((f) => { c.fillText(fmt(T * f), X(T * f), B + 18); });
    // dot plot: stack dots that land in the same column
    const cols = {}, rad = S.n > 120 ? 3 : S.n > 50 ? 4 : 5, step = rad * 2 + 1;
    for (let i = 0; i < S.n; i++) {
      const x = X(cr.guesses[i]), k = Math.round(x / step), h = (cols[k] = (cols[k] || 0) + 1);
      const y = B - rad - (h - 1) * step; if (y < 8) continue;
      c.fillStyle = i === S.pickedIdx ? warn : "rgba(124,92,255,.55)"; c.beginPath(); c.arc(k * step, y, rad, 0, 7); c.fill();
      if (i === S.pickedIdx) { c.strokeStyle = ink; c.lineWidth = 2; c.stroke(); }
    }
    c.strokeStyle = good; c.lineWidth = 3; c.beginPath(); c.moveTo(X(T), 6); c.lineTo(X(T), B + 4); c.stroke();
    const st = C.stats(cr, S.n), ax = X(st.avg);
    c.fillStyle = acc; c.beginPath(); c.moveTo(ax, B + 6); c.lineTo(ax - 8, B + 22 + 8); c.lineTo(ax + 8, B + 22 + 8); c.closePath(); c.fill();
    c.fillStyle = acc; c.font = "800 11px Nunito, sans-serif"; c.fillText("crowd average", Math.min(SW - 50, Math.max(50, ax)), SH - 3);
    c.fillStyle = good; c.fillText("true " + fmt(T), Math.min(SW - 30, Math.max(30, X(T))), 14);
  }
  function drawChart() {
    const c = cc, L = 32, R = 8, T = 10, Bt = 24, ymax = Math.max(0.3, S.curve0[0]) * 1.05;
    const X = (n) => L + ((n - 1) / (MAX - 1)) * (CW - L - R), Y = (v) => CH - Bt - Math.min(1, v / ymax) * (CH - T - Bt);
    c.clearRect(0, 0, CW, CH); const muted = ML.cssVar("--muted");
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0, 0.1, 0.2, 0.3].forEach((v) => { if (v <= ymax) { c.fillText(Math.round(v * 100) + "%", L - 4, Y(v) + 3); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); } });
    c.textAlign = "center"; c.fillText("crowd size", (L + CW - R) / 2, CH - 4); c.textAlign = "left"; c.fillText("error", 2, 8);
    const draw = (arr, col, w, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); arr.forEach((v, i) => (i ? c.lineTo(X(i + 1), Y(v)) : c.moveTo(X(i + 1), Y(v)))); c.stroke(); c.setLineDash([]); };
    draw(S.curve0, muted, 2, [4, 3]); if (S.bias) draw(S.curveB, ML.cssVar("--accent"), 2.5);
    const st = C.stats(S.crowd, S.n), cur = st.crowdErr / S.crowd.truth;
    c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(X(S.n), T); c.lineTo(X(S.n), CH - Bt); c.stroke(); c.setLineDash([]);
    c.fillStyle = ML.cssVar("--warn"); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1.5; c.beginPath(); c.arc(X(S.n), Y(cur), 5, 0, 7); c.fill(); c.stroke();
  }
  function update() {
    const cr = S.crowd, st = C.stats(cr, S.n), T = cr.truth;
    $("jar").textContent = "· the jar holds a secret number";
    $("avg").textContent = fmt(st.avg); $("cerr").textContent = fmt(st.crowdErr); $("terr").textContent = fmt(st.typical);
    $("best").innerHTML = `Best single guess in the crowd was off by <b>${fmt(st.best)}</b>. But you only know who that is after the answer is revealed.`;
    drawStrip(); drawChart(); check(st);
  }
  function check(st) {
    const T = S.crowd.truth, hit = (k, msg) => { if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (Object.keys(S.hits).length === 3) ML.confetti(40); };
    if (S.n >= 100 && st.crowdErr * 2 <= st.typical) hit("grow", "A big crowd beats a typical person by a mile.");
    if (S.bias >= 20 && S.n >= 100 && st.crowdErr >= 0.1 * T) hit("bias", "A shared bias fools the whole crowd. More people did not help!");
  }
  ML.bindRange("#n", (v) => String(v), (v) => {
    const first = !S.crowd; S.n = v; if (first) return;
    update(); const st = C.stats(S.crowd, S.n);
    ML.say(S.n === 1 ? "Just one guess. It is off by <b>" + fmt(st.crowdErr) + "</b>. Add more people!" : `${S.n} people. The crowd average is off by <b>${fmt(st.crowdErr)}</b>, while a typical person is off by <b>${fmt(st.typical)}</b>.`);
  });
  ML.bindRange("#bias", (v) => v + "%", (v) => {
    const first = !S.crowd; S.bias = v; if (first) return;
    rebuild();
    ML.say(v ? `Now everyone leans <b>${v}%</b> high. Add more people: the error stops shrinking, because they all make the same mistake.` : "No shared lean. Every mistake is random, so averaging works.");
  });
  $("newjar").addEventListener("click", () => { newJar(); ML.say("A new jar and a new crowd. Slide the crowd size up and down."); });
  $("pick").addEventListener("click", () => {
    const i = Math.floor(Math.random() * S.n), g = S.crowd.guesses[i], T = S.crowd.truth, st = C.stats(S.crowd, S.n);
    S.pickedIdx = i; S.picks++;
    const win = st.crowdErr < Math.abs(g - T); if (win) S.wins++;
    $("pickout").innerHTML = `Person #${i + 1} guessed <b>${fmt(g)}</b> (off by ${fmt(Math.abs(g - T))}). The crowd was off by ${fmt(st.crowdErr)}: <b>${win ? "crowd wins" : "that person wins"}</b>. Crowd has won ${S.wins} of ${S.picks}.`;
    update();
    if (S.picks >= 5 && S.wins >= 4 && !S.hits.pick) { S.hits.pick = 1; $("c-pick").classList.add("done"); ML.toast("The crowd wins most fights."); ML.say("<b>Challenge done!</b> The crowd beats most single guessers."); }
  });
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", update);
  window.addEventListener("load", update);
  newJar();
})();
