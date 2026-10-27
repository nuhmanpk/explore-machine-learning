// Find the Best Knobs page. Logic lives in opt-tune-core.js (TuneCore).
(function () {
  const C = window.TuneCore, $ = (id) => document.getElementById(id);
  const HW = 300, HH = 220, MW = 300, MH = 200, L = 34, T = 6, B = 26, R = 6;
  const hx = ML.setupCanvas($("heat"), HW, HH).ctx, mx = ML.setupCanvas($("model"), MW, MH).ctx;
  const NK = C.KS.length, NP = C.PS.length, CWd = (HW - L - R) / NK, CHt = (HH - T - B) / NP;
  const S = { seed: 1, data: null, by: "val", res: null, reveal: false, hits: {} };
  const pct = (v) => (v * 100).toFixed(0) + "%";
  const esc = (v) => v;

  function newData() {
    S.seed = 1 + Math.floor(Math.random() * 90000); S.data = new C.Data(S.seed); S.res = null;
    $("res").innerHTML = '<tr><td colspan="6" class="muted">Press Search.</td></tr>'; $("bnote").textContent = ""; $("mnote").textContent = "";
    draw();
  }
  function cellColor(v) { return v; }
  function heat() {
    const c = hx; c.clearRect(0, 0, HW, HH);
    const acc = ML.cssVar("--accent"), line = ML.cssVar("--line");
    const paint = (ki, pi, v) => {
      c.globalAlpha = 0.12 + 0.88 * Math.max(0, Math.min(1, (v - 0.7) / 0.25)); c.fillStyle = acc;
      c.fillRect(L + ki * CWd, T + (NP - 1 - pi) * CHt, CWd + 0.5, CHt + 0.5); c.globalAlpha = 1;
    };
    c.strokeStyle = line; c.lineWidth = 1; c.strokeRect(L, T, HW - L - R, HH - T - B);
    if (S.reveal) for (let pi = 0; pi < NP; pi++) for (let ki = 0; ki < NK; ki++) paint(ki, pi, S.data.score("val", ki, pi));
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--muted"); c.textAlign = "center";
    [1, 5, 10, 15, 20, 25].forEach((k) => c.fillText(k, L + (k - 0.5) * CWd, HH - B + 12));
    c.fillText("k: how many neighbours vote", L + (HW - L - R) / 2, HH - 4);
    c.textAlign = "right"; [0, 1, 2, 3].forEach((p) => c.fillText(p, L - 4, T + (NP - 1 - p * 4) * CHt + CHt / 2 + 3));
    c.save(); c.translate(9, T + (HH - T - B) / 2); c.rotate(-Math.PI / 2); c.textAlign = "center"; c.fillText("weight", 0, 0); c.restore();
    if (!S.res) return;
    const mark = (cells, round) => cells.forEach((t) => {
      const x = L + (t.ki + 0.5) * CWd, y = T + (NP - 1 - t.pi + 0.5) * CHt;
      if (!S.reveal) paint(t.ki, t.pi, t.val);
      c.lineWidth = 2; c.strokeStyle = ML.cssVar("--ink");
      if (round) { c.fillStyle = ML.cssVar("--warn"); c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); c.stroke(); } else c.strokeRect(x - 3.5, y - 3.5, 7, 7);
    });
    mark(S.res.grid.tried, false); mark(S.res.rand.tried, true);
    [S.res.grid.best, S.res.rand.best].forEach((b) => { c.strokeStyle = ML.cssVar("--good"); c.lineWidth = 3; c.beginPath(); c.arc(L + (b.ki + 0.5) * CWd, T + (NP - 1 - b.pi + 0.5) * CHt, 8, 0, 7); c.stroke(); });
  }
  function model() {
    const c = mx; c.clearRect(0, 0, MW, MH);
    const b = S.res ? S.res.rand.best : null, ds = S.data.sets.train, X = (x) => ((x + 1.6) / 4) * MW, Y = (y) => MH - ((y + 1.1) / 2.9) * MH;
    if (b) {
      const g = 6; for (let j = 0; j < MH / g; j++) for (let i = 0; i < MW / g; i++) {
        const x = (i * g + g / 2) / MW * 4 - 1.6, y = (MH - (j * g + g / 2)) / MH * 2.9 - 1.1;
        c.fillStyle = S.data.predict(x, y, b.ki, b.pi) ? ML.cssVar("--warn") : ML.cssVar("--accent"); c.globalAlpha = 0.28; c.fillRect(i * g, j * g, g, g);
      } c.globalAlpha = 1;
    }
    ds.forEach((p) => { c.fillStyle = p.c ? ML.cssVar("--warn") : ML.cssVar("--accent"); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 1.5; c.beginPath(); c.arc(X(p.x), Y(p.y), 4, 0, 7); c.fill(); c.stroke(); });
  }
  function draw() { heat(); model(); }

  function search(by) {
    const budget = +$("budget").value, d = S.data;
    S.res = { by, budget, grid: C.search(d, C.gridCells(budget), by), rand: C.search(d, C.randomCells(budget, S.seed + budget), by) };
    const row = (name, r) => `<tr><td><b>${name}</b></td><td class="n">${C.KS[r.best.ki]}</td><td class="n">${C.PS[r.best.pi].toFixed(2)}</td><td class="n">${pct(r.best.val)}</td><td class="n">${pct(r.best.test)}</td><td class="n">${pct(r.fresh)}</td></tr>`;
    $("res").innerHTML = row("Grid (" + S.res.grid.tried.length + " tries)", S.res.grid) + row("Random (" + S.res.rand.tried.length + " tries)", S.res.rand);
    $("bnote").textContent = `· ${budget} tries each`; $("mnote").textContent = `(random's winner: k = ${C.KS[S.res.rand.best.ki]})`;
    draw();
    const rb = S.res.rand, key = by === "val" ? "Validation" : "Test", sc = rb.best[by];
    ML.say(by === "val"
      ? `Random picked k=${C.KS[rb.best.ki]} with a <b>${pct(sc)}</b> validation score. On ${400} fresh points it gets <b>${pct(rb.fresh)}</b>. The validation score is a little hopeful, because I chose the best of many.`
      : `I picked by the <b>test</b> score: ${pct(sc)}. But on fresh points it is only <b>${pct(rb.fresh)}</b>. The test score was used to choose, so it no longer tells the truth.`);
    const ok = { search: true, big: budget >= 30, cheat: by === "test" };
    for (const k in ok) if (ok[k] && !S.hits[k]) done(k, { search: "You ran a search.", big: "A big budget gives more chances.", cheat: "You saw what cheating looks like: Test is higher than Fresh." }[k]);
  }
  function done(k, m) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); if (k === "race") ML.confetti(30); }
  $("go").addEventListener("click", () => search(S.by));
  $("newd").addEventListener("click", () => { newData(); ML.say("New data, new landscape. Press Search."); });
  $("by").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return; S.by = b.dataset.b;
    $("by").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); search(S.by);
  });
  $("reveal").addEventListener("change", () => { S.reveal = $("reveal").checked; draw(); });
  $("race").addEventListener("click", () => {
    const btn = $("race"), r = C.race(S.seed * 3 + 11, +$("budget").value, 30), p = (v) => (v * 100).toFixed(1) + "%";
    $("raceout").innerHTML = `<b>Budget ${$("budget").value}.</b> Average fresh score: grid <b>${p(r.gridFresh)}</b>, random <b>${p(r.randFresh)}</b>. Random won ${r.randWins} times, grid won ${r.gridWins}, the rest tied.<br>
      Picking by validation: the chosen score was <b>${(r.honest * 100).toFixed(1)}</b> points above the fresh score on average. Picking by test: <b>${(r.cheat * 100).toFixed(1)}</b> points above. Cheating is a little more hopeful, and you lose your clean exam.`;
    ML.say("Over 30 datasets the luck averages out. Notice how close grid and random are here, and how the chosen scores often look a bit better than the fresh ones.");
    if (!S.hits.race) done("race", "Averages tell the truth that one run hides.");
  });
  ML.bindRange("#budget", (v) => v);
  new MutationObserver(() => S.data && draw()).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => S.data && draw());
  window.TunePage = S;
  newData();
})();
