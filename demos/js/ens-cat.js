// No Peeking, Snacks! page (CatBoost-style ordered target statistics). Logic lives in ens-gbm-core.js (GBCore).
(function () {
  const C = window.GBCore, $ = (id) => document.getElementById(id);
  const MW = 460, MH = 340, CW = 300, CH = 160, N = 300, NT = 1500, A = 1, RES = 46, MAXT = 100;
  const OPTS = { loss: "log", lr: 0.2, depth: 2, lambda: 0, gamma: 0, minChild: 1 };
  const mx = ML.setupCanvas($("map"), MW, MH).ctx, cx = ML.setupCanvas($("chart"), CW, CH).ctx;
  const S = { seed: 5, view: "n", seen: {}, timer: 0, hits: {}, m: {} };
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pct = (v) => Math.round(v * 100) + "%";
  const pts = (v) => (v >= 0 ? "+" : "") + Math.round(v * 100);

  function newData() {
    stop(); S.seed = 1 + Math.floor(Math.random() * 90000);
    const d = C.snacks(S.seed, N), te = C.snacks(S.seed + 50, NT);
    const prior = d.y.reduce((a, b) => a + b, 0) / N, enc = C.encodeTest(d.cat, d.y, te.cat, prior, A);
    S.d = d; S.te = te; S.prior = prior;
    S.code = { n: C.encodeNaive(d.cat, d.y, prior, A), o: C.encodeOrdered(d.cat, d.y, prior, A, S.seed + 9) };
    S.Xt = te.sweet.map((s, i) => [s, enc[i]]);
    build();
  }
  function build() {
    stop();
    for (const k of ["n", "o"]) { const X = S.d.sweet.map((s, i) => [s, S.code[k][i]]); S.m[k] = { X, b: new C.Booster(X, S.d.y, OPTS) }; }
    refresh();
  }
  function stop() { clearInterval(S.timer); S.timer = 0; $("auto").innerHTML = `${ML.icon("play")} Auto`; }
  function stepBoth() { S.m.n.b.step(); S.m.o.b.step(); }

  function refresh() {
    const T = S.m.n.b.trees.length;
    for (const k of ["n", "o"]) {
      const m = S.m[k]; m.tr = m.b.curve(m.X, S.d.y); m.te = m.b.curve(S.Xt, S.te.y);
      $(k + "-train").textContent = pct(m.tr[T]); $(k + "-test").textContent = pct(m.te[T]);
      $(k + "-gap").textContent = T ? pts(m.tr[T] - m.te[T]) : "-";
    }
    $("round").textContent = T;
    renderInside(); draw(); drawChart(); checks();
  }
  function renderInside() {
    const d = S.d, by = {};
    d.cat.forEach((c, i) => { (by[c] = by[c] || []).push(i); });
    const rare = Object.keys(by).filter((c) => by[c].length <= 2).sort((a, b) => by[a].length - by[b].length).slice(0, 7);
    if (!rare.length) { $("inside").innerHTML = `<div class="sig"><span>No rare snacks this time. Press New kids.</span></div>`; return; }
    const rows = rare.map((c) => {
      const ix = by[c], liked = ix.map((i) => (d.y[i] ? "yes" : "no")).join(", ");
      const nv = ix.map((i) => S.code.n[i].toFixed(2)).join(", "), ov = ix.map((i) => S.code.o[i].toFixed(2)).join(", ");
      const leaky = ix.length === 1;
      return `<tr><td>${C.SNACKS[c]}</td><td>${liked}</td><td class="n ${leaky ? "leak" : ""}">${nv}</td><td class="n">${ov}</td></tr>`;
    }).join("");
    $("inside").innerHTML = `<table class="snk"><thead><tr><th>Snack</th><th>Liked?</th><th>Peeking</th><th>No peeking</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="decision">Average liking is ${S.prior.toFixed(2)}. A snack eaten once gets a peeking number pulled towards its own answer (red). The no-peeking number for the first kid is just the average.</div>`;
  }
  function draw() {
    const c = mx, k = S.view, m = S.m[k], T = m.b.trees.length, cell = MW / RES, cellH = MH / RES;
    const good = ML.cssVar("--good"), bad = ML.cssVar("--bad"), ink = ML.cssVar("--ink");
    c.clearRect(0, 0, MW, MH);
    if (T) {
      for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
        const p = m.b.predict([(i + 0.5) / RES, 1 - (j + 0.5) / RES]);
        c.globalAlpha = 0.08 + 0.3 * Math.abs(p - 0.5) * 2; c.fillStyle = p > 0.5 ? good : bad; c.fillRect(i * cell, j * cellH, cell + 0.5, cellH + 0.5);
      }
      c.globalAlpha = 1;
    }
    const X = m.X;
    for (let i = 0; i < N; i++) {
      const px = X[i][0] * MW, py = (1 - X[i][1]) * MH;
      c.beginPath(); c.arc(px, py, 3.5, 0, 7); c.fillStyle = S.d.y[i] ? good : bad; c.fill(); c.strokeStyle = ink; c.lineWidth = 1; c.stroke();
    }
    c.font = "700 11px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted");
    c.fillText("sweeter →", MW - 70, MH - 6); c.save(); c.translate(12, 90); c.rotate(-Math.PI / 2); c.fillText("snack number →", -70, 0); c.restore();
  }
  function drawChart() {
    const c = cx, L = 32, R = 8, T = 10, B = 24, n = S.m.n.te.length, xm = Math.max(20, n - 1);
    const X = (i) => L + (i / xm) * (CW - L - R), Y = (v) => CH - B - ((Math.max(0.5, v) - 0.5) / 0.4) * (CH - T - B);
    c.clearRect(0, 0, CW, CH); const muted = ML.cssVar("--muted");
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0.5, 0.7, 0.9].forEach((v) => { c.fillText(pct(v), L - 4, Y(v) + 3); c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(CW - R, Y(v)); c.stroke(); });
    c.textAlign = "center"; c.fillText("rounds", (L + CW - R) / 2, CH - 4);
    const line = (arr, col) => { c.strokeStyle = col; c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath(); arr.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke(); };
    line(S.m.n.te, ML.cssVar("--bad")); line(S.m.o.te, ML.cssVar("--accent"));
  }
  const hit = (key, msg) => { if (S.hits[key]) return; S.hits[key] = 1; $("c-" + key).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (Object.keys(S.hits).length === 4) ML.confetti(40); };
  function checks() {
    const T = S.m.n.b.trees.length, n = S.m.n, o = S.m.o;
    if (S.seen.n && S.seen.o) hit("look", "Peeking pushes rare snacks to the edges, right next to their own answer. No peeking keeps them near the average.");
    if (T && n.tr[T] > o.tr[T]) hit("train", `Peeking scores ${pct(n.tr[T])} on its own training kids, more than no peeking's ${pct(o.tr[T])}. Looks great... for now.`);
    if (T >= 20 && o.te[T] > n.te[T]) hit("win", `On new kids: no peeking ${pct(o.te[T])}, peeking ${pct(n.te[T])}. The cheat did not carry over.`);
    if (T && (n.tr[T] - n.te[T]) - (o.tr[T] - o.te[T]) >= 0.03) hit("gap", "The peeking booster fooled itself the most: its training score was too good to be true.");
  }
  $("ten").addEventListener("click", () => {
    if (S.m.n.b.trees.length >= MAXT) { ML.say(`${MAXT} rounds is plenty. Press Start over or New kids.`); return; }
    for (let i = 0; i < 10; i++) stepBoth(); refresh(); const T = S.m.n.b.trees.length;
    ML.say(`${T} rounds. New kids: peeking <b>${pct(S.m.n.te[T])}</b>, no peeking <b>${pct(S.m.o.te[T])}</b>. Training kids: peeking ${pct(S.m.n.tr[T])}, no peeking ${pct(S.m.o.tr[T])}.`);
  });
  $("auto").addEventListener("click", () => {
    if (S.timer) { stop(); return; }
    $("auto").innerHTML = `${ML.icon("pause")} Stop`;
    S.timer = setInterval(() => { if (S.m.n.b.trees.length >= MAXT) { stop(); return; } stepBoth(); refresh(); }, reduce ? 30 : 150);
  });
  $("reset").addEventListener("click", () => { build(); ML.say("Both boosters start again."); });
  $("newdata").addEventListener("click", () => { newData(); ML.say("A fresh class of kids and snacks. Train again!"); });
  $("view").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-v]"); if (!btn) return;
    S.view = btn.dataset.v; S.seen[S.view] = 1; $("view").querySelectorAll("button").forEach((x) => x.classList.toggle("primary", x === btn)); draw(); checks();
    ML.say(S.view === "n" ? "Peeking numbers: look at the dots stuck at the very top and bottom. Those snacks were eaten once, and their number already holds the answer." : "No-peeking numbers: each kid only saw earlier kids' answers, so rare snacks sit near the middle. The booster has to use sweetness, the real clue.");
  });
  S.seen.n = 1;
  const redraw = () => { draw(); drawChart(); };
  new MutationObserver(redraw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  document.addEventListener("themechange", redraw); window.addEventListener("load", redraw);
  newData();
})();
