// Same Size, Fair Fight page. Logic lives in data-scale-core.js (DataScaleCore).
(function () {
  const C = window.DataScaleCore, $ = (id) => document.getElementById(id), cs = (n) => ML.cssVar(n);
  const W = 320, H = 280, W2 = 320, H2 = 150, K = 5, STEPS = 60;
  const { ctx: cx } = ML.setupCanvas($("chart"), W, H), { ctx: c2 } = ML.setupCanvas($("chart2"), W2, H2);
  const S = { seed: 1, unit: 1, mode: "none", train: [], test: [], q: { an: 0.5, inn: 0.5 }, startAcc: null, done: {}, accNone: null, curves: {} };
  const MODES = ["none", "minmax", "standard"], pct = (v) => Math.round(v * 100) + "%";
  const query = () => ({ age: 10 + S.q.an * 70, income: (20000 + S.q.inn * 180000) / S.unit });

  function build() {
    S.train = C.makePeople(S.seed, 200, S.unit); S.test = C.makePeople(S.seed + 1, 300, S.unit);
    // plotting coordinates come from the underlying 0..1 values, so the picture is the same in every setting
    S.curves = {}; for (const m of MODES) S.curves[m] = C.gdCurve(C.fitScaler(m, S.train), S.train, STEPS).curve;
  }
  function mark(k, msg) { if (S.done[k] || !S.ready) return; S.done[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (k === "fair") ML.confetti(40); }
  function newCrowd() {
    S.seed = 1 + Math.floor(Math.random() * 90000); S.done = {}; S.startAcc = null; S.accNone = null;
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done")); S.ready = false; build(); update(); S.ready = true;
  }
  function sync() {
    $("g-mode").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === S.mode)));
    $("g-unit").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === S.unit)));
  }

  function drawMain(nb) {
    const p = 26, X = (v) => p + v * (W - p - 10), Y = (v) => H - p - v * (H - p - 12);
    cx.clearRect(0, 0, W, H);
    cx.strokeStyle = cs("--line"); cx.fillStyle = cs("--muted"); cx.lineWidth = 1; cx.font = "10px Nunito, sans-serif";
    cx.beginPath(); cx.moveTo(p, 8); cx.lineTo(p, H - p); cx.lineTo(W - 8, H - p); cx.stroke();
    cx.textAlign = "center"; cx.fillText("age: 10", X(0), H - 12); cx.fillText("80", X(1), H - 12);
    cx.textAlign = "right"; cx.fillText("$200k", p - 3, Y(1) + 3); cx.fillText("$20k", p - 3, Y(0));
    S.train.forEach((d, i) => {
      cx.beginPath(); cx.arc(X(d.an), Y(d.inn), 3.4, 0, 7); cx.fillStyle = d.like ? cs("--good") : cs("--bad"); cx.globalAlpha = 0.7; cx.fill(); cx.globalAlpha = 1;
    });
    cx.strokeStyle = cs("--ink"); cx.lineWidth = 2;
    for (const n of nb) { const d = S.train[n.i]; cx.beginPath(); cx.arc(X(d.an), Y(d.inn), 6.5, 0, 7); cx.stroke(); }
    const qx = X(S.q.an), qy = Y(S.q.inn);
    cx.fillStyle = cs("--warn"); cx.strokeStyle = cs("--ink"); cx.lineWidth = 2; cx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 11, a = -Math.PI / 2 + (i * Math.PI) / 5; cx[i ? "lineTo" : "moveTo"](qx + r * Math.cos(a), qy + r * Math.sin(a)); }
    cx.closePath(); cx.fill(); cx.stroke();
  }
  function drawGd() {
    const p = 28, X = (s) => p + (s / STEPS) * (W2 - p - 8), lo = -4, Y = (v) => 8 + ((0 - Math.max(lo, Math.log10(Math.max(v, 1e-9)))) / (0 - lo)) * (H2 - p - 8);
    c2.clearRect(0, 0, W2, H2);
    c2.strokeStyle = cs("--line"); c2.fillStyle = cs("--muted"); c2.lineWidth = 1; c2.font = "10px Nunito, sans-serif";
    c2.beginPath(); c2.moveTo(p, 6); c2.lineTo(p, H2 - p + 6); c2.lineTo(W2 - 8, H2 - p + 6); c2.stroke();
    c2.textAlign = "right"; [["100%", 0], ["1%", -2], ["0.01%", -4]].forEach(([t, e]) => c2.fillText(t, p - 3, 8 + (-e / 4) * (H2 - p - 8) + 3));
    c2.textAlign = "center"; c2.fillText("steps 0", p + 8, H2 - 8); c2.fillText(STEPS, W2 - 14, H2 - 8);
    const col = { none: cs("--bad"), minmax: cs("--warn"), standard: cs("--good") };
    for (const m of MODES) {
      c2.strokeStyle = col[m]; c2.lineWidth = m === S.mode ? 3.5 : 1.5; c2.globalAlpha = m === S.mode ? 1 : 0.45; c2.beginPath();
      S.curves[m].forEach((v, s) => c2[s ? "lineTo" : "moveTo"](X(s), Y(v))); c2.stroke();
    }
    c2.globalAlpha = 1;
  }

  function update(say) {
    const sc = C.fitScaler(S.mode, S.train), nb = C.neighbours(sc, S.train, query(), K), sh = C.distanceShare(sc, nb);
    const acc = C.accuracy(sc, S.train, S.test, K);
    if (S.startAcc === null) S.startAcc = acc;
    $("acc").textContent = pct(acc); $("acc").style.color = acc >= 0.85 ? "var(--good)" : "var(--ink)";
    $("sh-age").textContent = pct(sh.age); $("sh-inc").textContent = pct(sh.income);
    $("b-age").style.width = sh.age * 100 + "%"; $("b-inc").style.width = sh.income * 100 + "%"; $("p-age").textContent = pct(sh.age); $("p-inc").textContent = pct(sh.income);
    const last = S.curves[S.mode][STEPS];
    $("gdnote").textContent = `After ${STEPS} steps the error is down to ${last < 1e-4 ? "under 0.01" : (last * 100).toFixed(last < 0.01 ? 2 : 1)}% of where it started.`;
    drawMain(nb); drawGd();
    if (S.mode === "none" && S.unit === 1) { S.accNone = acc; if (sh.age < 0.05) mark("blind", "Age only supplied " + pct(sh.age) + " of the distance. The robot is nearly blind to it."); }
    if (S.mode !== "none" && S.accNone !== null && S.accNone < 0.75 && acc >= 0.85) mark("fair", "Scaling lifted accuracy from " + pct(S.accNone) + " to " + pct(acc) + ".");
    if (S.mode === "none" && S.unit === 1000 && S.accNone !== null && acc - S.accNone >= 0.08) mark("units", "Just changing units took accuracy from " + pct(S.accNone) + " to " + pct(acc) + ".");
    if (last < 0.01) mark("fast", "Error fell below 1% of its start within " + STEPS + " steps.");
    if (say) ML.say(say);
  }
  $("g-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return; S.mode = b.dataset.v; sync(); update();
    const sc = C.fitScaler(S.mode, S.train), sh = C.distanceShare(sc, C.neighbours(sc, S.train, query(), K));
    ML.say(S.mode === "none" ? `No scaling: income supplies <b>${pct(sh.income)}</b> of the distance. Age barely gets a say.` : `<b>${b.textContent}</b>: now age supplies <b>${pct(sh.age)}</b> of the distance. A much fairer fight!`);
  });
  $("g-unit").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return; S.unit = +b.dataset.v; sync(); build(); update("Income is now written in " + (S.unit === 1 ? "dollars" : "thousands of dollars") + ". Same people, different numbers!");
  });
  function place(e) { const r = $("chart").getBoundingClientRect(), p = 26; const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H; S.q = { an: ML.clamp((x - p) / (W - p - 10), 0, 1), inn: ML.clamp((H - p - y) / (H - p - 12), 0, 1) }; update(); }
  $("chart").addEventListener("pointerdown", (e) => { place(e); $("chart").setPointerCapture && $("chart").setPointerCapture(e.pointerId); $("chart").onpointermove = place; });
  $("chart").addEventListener("pointerup", () => { $("chart").onpointermove = null; });
  $("chart").addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key]; if (!d) return; e.preventDefault();
    S.q = { an: ML.clamp(S.q.an + d[0] * 0.04, 0, 1), inn: ML.clamp(S.q.inn + d[1] * 0.04, 0, 1) }; update();
  });
  $("reset").addEventListener("click", () => { newCrowd(); ML.say("A new crowd of people! Same puzzle, new faces."); });
  new MutationObserver(() => update()).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => update());
  window.DataScalePage = S;
  newCrowd();
})();
