// Who Did You Ask? page. Logic lives in data-sampling-core.js (DataSamplingCore).
(function () {
  const C = window.DataSamplingCore, $ = (id) => document.getElementById(id), cs = (n) => ML.cssVar(n);
  const SZ = 300, { ctx: cx } = ML.setupCanvas($("chart"), SZ, SZ), GRID = 30, IDS = C.GROUPS.map((g) => g.id);
  const S = { seed: 1, town: null, counts: [40, 0, 0, 0], res: null, grid: null, done: {} };
  const pct = (v) => Math.round(v * 100) + "%", sum = (a) => a.reduce((x, y) => x + y, 0);
  const COL = ["--accent", "--warn", "--diff", "--good"];

  function newTown() {
    S.seed = 1 + Math.floor(Math.random() * 90000); S.town = C.makeTown(S.seed); S.done = {};
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done")); S.ready = false; setCounts([40, 0, 0, 0]); S.ready = true;
  }
  function setCounts(c, say) {
    S.counts = c.slice(); IDS.forEach((id, i) => { $("s-" + id).value = c[i]; $("o-" + id).textContent = c[i]; });
    update(say);
  }
  function mark(k, msg) { if (S.done[k] || !S.ready) return; S.done[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (k === "fair") ML.confetti(40); }

  function draw() {
    const W = SZ, p = (v) => v * W; cx.clearRect(0, 0, W, W);
    if (S.grid) {
      const m = S.grid.length, c = W / m;
      for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { if (S.grid[j][i] == null) continue; cx.globalAlpha = 0.2; cx.fillStyle = S.grid[j][i] ? cs("--good") : cs("--bad"); cx.fillRect(i * c, j * c, c + 0.5, c + 0.5); }
      cx.globalAlpha = 1;
    }
    cx.font = "700 10px Nunito, sans-serif"; cx.fillStyle = cs("--muted"); cx.textAlign = "center";
    C.GROUPS.forEach((g) => cx.fillText(g.name, p(g.cx), p(1 - g.cy) - 34));
    const asked = new Set(S.res.tr.map((d) => d.id));
    for (const d of S.town.people) {
      cx.beginPath(); cx.arc(p(d.x), p(1 - d.y), asked.has(d.id) ? 4.5 : 2.2, 0, 7);
      cx.fillStyle = d.like ? cs("--good") : cs("--bad"); cx.globalAlpha = asked.has(d.id) ? 1 : 0.45; cx.fill(); cx.globalAlpha = 1;
      if (asked.has(d.id)) { cx.strokeStyle = cs("--ink"); cx.lineWidth = 1.6; cx.stroke(); }
    }
  }
  function update(say) {
    const r = S.res = C.evaluate(S.town, S.counts, 5), W = GRID;
    S.grid = [];
    for (let j = 0; j < W; j++) { const row = []; for (let i = 0; i < W; i++) row.push(r.tr.length ? C.predict(r.tr, { x: (i + 0.5) / W, y: 1 - (j + 0.5) / W }, 5) : null); S.grid.push(row); }
    $("acc").textContent = pct(r.overall); $("asked").textContent = r.asked; $("worst").textContent = pct(Math.min(...r.byGroup));
    $("acc").style.color = r.overall >= 0.8 ? "var(--good)" : r.overall < 0.65 ? "var(--bad)" : "var(--ink)";
    $("askedct").textContent = "· you asked " + r.asked + " of " + S.town.people.length;
    C.GROUPS.forEach((g, i) => { $("b-" + g.id).style.width = r.byGroup[i] * 100 + "%"; $("b-" + g.id).style.background = r.byGroup[i] >= 0.7 ? "var(--good)" : r.byGroup[i] < 0.55 ? "var(--bad)" : "var(--warn)"; $("p-" + g.id).textContent = pct(r.byGroup[i]); });
    draw();
    const mn = Math.min(...r.byGroup), nz = S.counts.filter((c) => c > 0).length;
    if (r.asked && nz === 1 && r.overall < 0.65 && mn < 0.55) mark("biased", "Asking one place only: town score " + pct(r.overall) + ", worst place " + pct(mn) + ".");
    if (r.asked && mn >= 0.7) mark("fair", "Every neighbourhood is at " + pct(mn) + " or more.");
    if (r.asked && r.asked <= 100 && mn >= 0.65) mark("smart", "Only " + r.asked + " people asked and every place is at " + pct(mn) + " or more.");
    if (nz === 1 && r.asked >= 100 && r.overall < 0.65) mark("big", "Asked " + r.asked + " people in one place: still only " + pct(r.overall) + " for the town.");
    if (say) ML.say(say.replace("%", pct(r.overall)));
  }
  IDS.forEach((id, i) => $("s-" + id).addEventListener("input", (e) => {
    const c = S.counts.slice(); c[i] = +e.target.value; $("o-" + id).textContent = c[i]; S.counts = c; update();
  }));
  $("p-conv").addEventListener("click", () => setCounts([40, 0, 0, 0], "Convenient! Only Hilltop answered. I know Hilltop but the town score is <b>%</b>. Look at the other places."));
  $("p-fair").addEventListener("click", () => setCounts([30, 30, 30, 30], "30 people from every place. The whole town is now <b>%</b>, and every place is covered."));
  $("p-big").addEventListener("click", () => setCounts([100, 0, 0, 0], "100 people, but all from Hilltop. More of the same does not help the rest of town: <b>%</b>."));
  $("reset").addEventListener("click", () => { newTown(); ML.say("A new town with new people. Who will you ask this time?"); });
  new MutationObserver(() => S.res && draw()).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => S.res && draw());
  window.DataSamplingPage = S;
  newTown();
})();
