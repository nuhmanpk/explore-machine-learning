// Tidy the Mess page. Logic lives in data-clean-core.js (DataCleanCore).
(function () {
  const C = window.DataCleanCore, $ = (id) => document.getElementById(id);
  const CW = 320, CH = 220, cs = (n) => ML.cssVar(n);
  const { ctx: cx } = ML.setupCanvas($("chart"), CW, CH);
  const S = { seed: 1, data: null, opts: { missing: "leave", wild: "leave" }, res: null, tried: new Set(), done: {} };
  const fmt = (v) => (v == null ? "" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

  function newSet() {
    S.seed = 1 + Math.floor(Math.random() * 90000); S.data = C.makeData(S.seed);
    S.opts = { missing: "leave", wild: "leave" }; S.tried = new Set(); S.done = {};
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    syncButtons(); update();
  }
  function syncButtons() {
    for (const k of ["missing", "wild"]) $("g-" + k).querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === S.opts[k])));
  }
  function wildCell(d, k, f) { const v = d[k]; return v != null && (v < f[k].lo || v > f[k].hi); }

  function renderRows() {
    const f = S.res.cleaned.fences, byId = new Map(S.res.cleaned.rows.map((r) => [r.id, r]));
    $("rows").innerHTML = S.data.train.map((d) => {
      const r = byId.get(d.id);
      const cell = (k) => {
        const cls = d[k] == null ? "bad-missing" : wildCell(d, k, f) ? "bad-wild" : "";
        const fix = !r.dropped && r[k] != null && (d[k] == null || Math.abs(r[k] - d[k]) > 1e-9) ? `<span class="fix">→ ${fmt(r[k])}</span>` : "";
        return `<td class="${cls}">${d[k] == null ? "?" : fmt(d[k])}${fix}</td>`;
      };
      return `<tr class="${r.dropped ? "gone" : ""}"><td>${d.name}</td>${cell("x")}${cell("y")}</tr>`;
    }).join("");
    $("rowcount").textContent = `· ${S.data.train.length} rows`;
  }

  function draw() {
    const W = CW, H = CH, p = 30, x0 = 0, x1 = 100, y0 = 0, y1 = 40;
    const X = (v) => p + ((Math.min(x1, Math.max(x0, v)) - x0) / (x1 - x0)) * (W - p - 8), Y = (v) => H - p + 6 - ((Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0)) * (H - p - 8);
    cx.clearRect(0, 0, W, H);
    cx.strokeStyle = cs("--line"); cx.fillStyle = cs("--muted"); cx.lineWidth = 1; cx.font = "10px Nunito, sans-serif";
    cx.beginPath(); cx.moveTo(p, 6); cx.lineTo(p, H - p + 6); cx.lineTo(W - 8, H - p + 6); cx.stroke();
    cx.textAlign = "center"; for (const v of [0, 50, 100]) cx.fillText(v, X(v), H - 10);
    cx.textAlign = "right"; for (const v of [0, 20, 40]) cx.fillText(v, p - 4, Y(v) + 3);
    cx.textAlign = "left"; cx.fillText("height (cm) →", W - 80, H - 18);
    const byId = new Map(S.res.cleaned.rows.map((r) => [r.id, r]));
    for (const d of S.data.train) {
      const r = byId.get(d.id); if (r.dropped) continue;
      const col = d.flag === "missing" ? cs("--warn") : d.flag === "ok" ? cs("--accent") : cs("--bad");
      const off = r.x > x1 || r.y > y1 || r.x < x0 || r.y < y0;
      cx.beginPath(); cx.arc(X(r.x), Y(r.y), 3.6, 0, 7);
      if (off) { cx.strokeStyle = col; cx.lineWidth = 2; cx.stroke(); } else { cx.fillStyle = col; cx.globalAlpha = 0.85; cx.fill(); cx.globalAlpha = 1; }
    }
    const L = S.res.line; cx.strokeStyle = cs("--good"); cx.lineWidth = 3;
    cx.beginPath(); cx.moveTo(X(x0), Y(L.a * x0 + L.b)); cx.lineTo(X(x1), Y(L.a * x1 + L.b)); cx.stroke();
  }

  const NOTES = {
    leave: "Blanks are read as 0. A dog that is 0 cm tall? The robot trusts it.",
    drop: "Rows with blanks are thrown away. Safe, but you lose data.",
    mean: "Blanks become the average. Wild values drag the average around.",
    median: "Blanks become the middle value. Wild values hardly move it.",
    predict: "Each blank is guessed from the other column, using a line through the complete rows."
  };
  function mark(k, msg) { if (S.done[k]) return; S.done[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (k === "good") ML.confetti(40); }

  function update(say) {
    S.res = C.run(S.data, S.opts);
    const r = S.res, pct = Math.round(r.score * 100), kept = r.cleaned.kept.length;
    $("score").textContent = pct + "%"; $("mae").textContent = r.mae.toFixed(1) + " kg"; $("kept").textContent = kept + " of " + S.data.train.length;
    $("score").style.color = pct >= 85 ? "var(--good)" : pct < 40 ? "var(--bad)" : "var(--ink)";
    $("note").textContent = NOTES[S.opts.missing] + " " + ({ leave: "Wild values stay as they are.", drop: "Rows with wild values are dropped.", clip: "Wild values are squeezed into the normal range." })[S.opts.wild];
    $("inside").innerHTML = `<p>Line: <b>weight = ${r.line.a.toFixed(2)} × height ${r.line.b < 0 ? "−" : "+"} ${Math.abs(r.line.b).toFixed(1)}</b></p><p class="muted">The true rule is 0.40 × height − 6. The closer the robot's line is to that, the better it does on new dogs.</p>`;
    renderRows(); draw();
    if (S.opts.missing === "mean" || S.opts.missing === "median") S.tried.add(S.opts.missing);
    if (S.opts.missing === "leave" && S.opts.wild === "leave" && pct < 30) mark("bad", "Garbage in, garbage out: the messy table gives " + pct + "%.");
    if (pct >= 85) mark("good", "Clean table, score " + pct + "%.");
    if (pct >= 85 && kept >= 50) mark("keep", "Score " + pct + "% while keeping " + kept + " rows.");
    if (S.tried.size === 2) mark("both", "You tried mean and median fills.");
    if (say) ML.say(say.replace("%", pct + "%"));
  }
  function pick(group) {
    $("g-" + group).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      S.opts[group] = b.dataset.v; syncButtons();
      update(`<b>${b.textContent.trim()}</b>. My score is now <b>%</b>.`);
    });
  }
  pick("missing"); pick("wild");
  $("reset").addEventListener("click", () => { newSet(); ML.say("A brand new messy notebook! Can you clean it faster this time?"); });
  new MutationObserver(() => S.res && draw()).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => S.res && draw());
  window.DataCleanPage = S;
  newSet();
})();
