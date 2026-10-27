// Pick the Clues page. Logic lives in data-features-core.js (DataFeaturesCore).
(function () {
  const C = window.DataFeaturesCore, $ = (id) => document.getElementById(id), cs = (n) => ML.cssVar(n);
  const SZ = 300, { ctx: cx } = ML.setupCanvas($("chart"), SZ, SZ), GRID = 36, J = ["j1", "j2", "j3", "j4"];
  const S = { seed: 1, prob: "ring", n: 40, chosen: new Set(["x", "y"]), train: [], test: [], model: null, grid: null, done: {}, best: 0 };
  const pct = (v) => Math.round(v * 100) + "%";

  function data() { S.train = C.makePoints(S.seed, S.prob, S.n); S.test = C.makePoints(S.seed + 1000, S.prob, 400); }
  function buildFeats() {
    $("feats").innerHTML = C.FEATURES.map((f) => `<label class="${f.junk ? "junk" : ""}" data-id="${f.id}"><input type="checkbox" value="${f.id}"> <span>${f.name}</span></label>`).join("");
    syncFeats();
  }
  function syncFeats() { $("feats").querySelectorAll("label").forEach((l) => { const on = S.chosen.has(l.dataset.id); l.classList.toggle("on", on); l.querySelector("input").checked = on; }); }
  function syncProb() {
    $("g-prob").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === S.prob)));
    $("ptitle").textContent = C.PROBLEMS[S.prob].name; $("phint").textContent = "· " + C.PROBLEMS[S.prob].hint;
  }
  function mark(k, msg) { if (S.done[k]) return; S.done[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (k === "ring" || k === "corners") ML.confetti(40); }

  function draw() {
    const W = SZ; cx.clearRect(0, 0, W, W);
    if (S.grid) {
      const m = S.grid.length, c = W / m, A = cs("--good"), B = cs("--bad");
      for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const p = S.grid[j][i]; cx.globalAlpha = 0.12 + 0.28 * Math.abs(p - 0.5) * 2; cx.fillStyle = p > 0.5 ? A : B; cx.fillRect(i * c, j * c, c + 0.5, c + 0.5); }
      cx.globalAlpha = 1;
    }
    cx.strokeStyle = cs("--line"); cx.lineWidth = 1; cx.beginPath(); cx.moveTo(W / 2, 0); cx.lineTo(W / 2, W); cx.moveTo(0, W / 2); cx.lineTo(W, W / 2); cx.stroke();
    for (const p of S.train) {
      cx.beginPath(); cx.arc(((p.x + 1) / 2) * W, ((1 - p.y) / 2) * W, 4.2, 0, 7);
      cx.fillStyle = p.label ? cs("--good") : cs("--bad"); cx.fill(); cx.strokeStyle = cs("--ink"); cx.lineWidth = 1.5; cx.stroke();
    }
  }

  function renderImp() {
    const imp = C.importance(S.model).sort((a, b) => b.share - a.share);
    $("imp").innerHTML = imp.length ? imp.map((o) => { const f = C.FEATURES.find((x) => x.id === o.id); return `<div class="bar"><span>${f.name}</span><div class="t"><i style="width:${(o.share * 100).toFixed(0)}%;background:${f.junk ? "var(--muted)" : "var(--accent)"}"></i></div><b>${pct(o.share)}</b></div>`; }).join("") : `<p class="muted" style="margin:0;font-weight:700">Tick at least one clue.</p>`;
  }
  function trainNow(say) {
    const ch = C.ids.filter((id) => S.chosen.has(id));
    S.model = C.train(S.train, ch); S.grid = C.grid(S.model, GRID);
    const acc = C.accuracy(S.model, S.test), tacc = C.accuracy(S.model, S.train);
    $("acc").textContent = pct(acc); $("acc").style.color = acc >= 0.9 ? "var(--good)" : "var(--ink)"; $("tacc").textContent = pct(tacc);
    const hasJunk = ch.some((i) => J.includes(i)), clean = ch.filter((i) => !J.includes(i));
    let nj = null;
    if (hasJunk && clean.length) { nj = C.accuracy(C.train(S.train, clean), S.test); $("nj").textContent = pct(nj); } else $("nj").textContent = hasJunk ? "-" : "no junk";
    renderImp(); draw();
    if (S.prob === "ring" && ch.length && ch.every((i) => i === "x" || i === "y") && acc < 0.65) mark("stuck", "Only x and y: " + pct(acc) + ". A straight line cannot find a ring.");
    if (S.prob === "ring" && acc >= 0.9) mark("ring", "Bullseye solved with " + pct(acc) + " accuracy.");
    if (S.prob === "corners" && acc >= 0.9) mark("corners", "Corners solved with " + pct(acc) + " accuracy.");
    if (nj !== null && nj - acc >= 0.03 && nj >= 0.8) mark("junk", "Junk clues cost " + Math.round((nj - acc) * 100) + " points: " + pct(nj) + " down to " + pct(acc) + ".");
    if (say) ML.say(say.replace("%", pct(acc)));
  }
  function reset(msg) { data(); trainNow(); if (msg) ML.say(msg); }

  $("feats").addEventListener("change", (e) => { const id = e.target.value; e.target.checked ? S.chosen.add(id) : S.chosen.delete(id); syncFeats(); trainNow("Clues changed. Held-out accuracy is <b>%</b>."); });
  $("train").addEventListener("click", () => trainNow("Trained again on these clues: <b>%</b> on unseen points."));
  $("g-prob").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.prob = b.dataset.v; S.chosen = new Set(["x", "y"]); syncProb(); syncFeats(); reset("New puzzle: <b>" + C.PROBLEMS[S.prob].name + "</b>. " + C.PROBLEMS[S.prob].hint + " I only have x and y again."); });
  ML.bindRange("#n", (v) => v, (v) => { if (v !== S.n) { S.n = v; data(); trainNow(); } });
  $("reset").addEventListener("click", () => { S.seed = 1 + Math.floor(Math.random() * 90000); reset("Fresh dots! Same clues, new luck."); });
  new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", draw);
  window.DataFeaturesPage = S;
  syncProb(); buildFeats(); data(); trainNow();
})();
