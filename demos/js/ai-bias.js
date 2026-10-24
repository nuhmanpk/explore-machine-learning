// Unfair AI — UI: the old decisions, live training, fairness meter, fixes, checkpoints.
(function () {
  const B = window.AIBias;
  const $ = (id) => document.getElementById(id);
  const SEED = 14;
  const PURPLE = "#9b5cff", GREEN = "#2fbf62";
  const pct = (x) => Math.round(x * 100);
  const gapPct = (m) => Math.max(0, pct(m.gapSure));

  const oldSet = B.makeOldHoldout();
  const fairSet = B.makeFairTest();

  const S = {
    data: B.makeData(SEED), mask: { colour: false }, w: B.newWeights(),
    ep: 0, loss: null, running: false, speed: 1, target: 400,
    metrics: null, ckpts: [], viewing: null, pending: "Start", fixedN: 0,
    ask: { purple: 0, big: 1, hat: 0, snack: 1 }, showUnfair: false, hover: -1,
    addedFair: 0, copied: false, relabelled: false, rnd: B.mulberry(77), layout: null,
  };

  // ---------- creatures ----------
  function drawCreature(ctx, cx, cy, size, c, o = {}) {
    const r = size * (c.big ? 0.4 : 0.27);
    ctx.save();
    ctx.translate(cx, cy);
    if (c.hat) {
      ctx.fillStyle = "#ff8a3d";
      ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.7); ctx.lineTo(0, -r * 1.6); ctx.lineTo(r * 0.55, -r * 0.7); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = c.purple ? PURPLE : GREEN;
    ctx.strokeStyle = "rgba(31,33,64,.55)"; ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-r * 0.36, -r * 0.15, r * 0.24, 0, 7); ctx.arc(r * 0.36, -r * 0.15, r * 0.24, 0, 7); ctx.fill();
    ctx.fillStyle = "#1f2140";
    ctx.beginPath(); ctx.arc(-r * 0.33, -r * 0.12, r * 0.11, 0, 7); ctx.arc(r * 0.39, -r * 0.12, r * 0.11, 0, 7); ctx.fill();
    if (c.snack) {
      ctx.fillStyle = "#d9a15b"; ctx.strokeStyle = "#8a5a22";
      ctx.beginPath(); ctx.arc(r * 0.55, r * 0.62, r * 0.3, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#8a5a22";
      ctx.beginPath(); ctx.arc(r * 0.5, r * 0.58, r * 0.06, 0, 7); ctx.arc(r * 0.62, r * 0.68, r * 0.06, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- the data grid ----------
  const DW = 520, DH = 330;
  const data = ML.setupCanvas($("data"), DW, DH);
  function layout(n) {
    for (let cols = 12; cols <= 40; cols++) {
      const cell = DW / cols, rows = Math.ceil(n / cols);
      if (rows * cell <= DH) return { cols, cell, rows };
    }
    return { cols: 40, cell: DW / 40, rows: Math.ceil(n / 40) };
  }
  function drawData() {
    const ctx = data.ctx;
    ctx.clearRect(0, 0, DW, DH);
    const L = (S.layout = layout(S.data.length));
    const good = ML.cssVar("--good"), bad = ML.cssVar("--bad"), card = ML.cssVar("--card"), bg2 = ML.cssVar("--bg-2");
    const now = performance.now();
    S.data.forEach((c, i) => {
      const x = (i % L.cols) * L.cell, y = Math.floor(i / L.cols) * L.cell;
      const tint = c.tag === "new" ? "rgba(47,155,255,.16)" : c.tag === "fixed" ? "rgba(242,183,5,.28)" : c.tag === "copy" ? "rgba(138,140,171,.22)" : null;
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(x + 1, y + 1, L.cell - 2, L.cell - 2); }
      if (i === S.hover) { ctx.fillStyle = bg2; ctx.fillRect(x + 1, y + 1, L.cell - 2, L.cell - 2); }
      drawCreature(ctx, x + L.cell / 2, y + L.cell * 0.55, L.cell, c);
      // decision badge
      const br = Math.max(3, L.cell * 0.15), bx = x + L.cell - br - 1, by = y + br + 1;
      ctx.fillStyle = c.label ? good : bad;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, br * 0.35); ctx.lineCap = "round";
      ctx.beginPath();
      if (c.label) { ctx.moveTo(bx - br * 0.45, by); ctx.lineTo(bx - br * 0.1, by + br * 0.4); ctx.lineTo(bx + br * 0.5, by - br * 0.4); }
      else { ctx.moveTo(bx - br * 0.4, by - br * 0.4); ctx.lineTo(bx + br * 0.4, by + br * 0.4); ctx.moveTo(bx + br * 0.4, by - br * 0.4); ctx.lineTo(bx - br * 0.4, by + br * 0.4); }
      ctx.stroke();
      if (S.showUnfair && B.isUnfair(c)) {
        ctx.strokeStyle = "#ff8a3d"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.lineDashOffset = -now / 80;
        ctx.strokeRect(x + 1.5, y + 1.5, L.cell - 3, L.cell - 3); ctx.setLineDash([]);
      }
    });
    $("n-ex").textContent = `(${S.data.length} creatures, ${S.data.filter((c) => c.purple).length} purple)`;
  }
  const dcv = $("data");
  dcv.addEventListener("pointermove", (e) => {
    const p = ML.canvasPoint(dcv, e, DW, DH), L = S.layout;
    const i = Math.floor(p.y / L.cell) * L.cols + Math.floor(p.x / L.cell);
    S.hover = i >= 0 && i < S.data.length ? i : -1;
    const c = S.data[S.hover];
    $("hover-info").textContent = c ? `${c.purple ? "Purple" : "Green"}, ${c.big ? "big" : "small"}${c.hat ? ", hat" : ""}, ${c.snack ? "brought a snack" : "no snack"}: ${c.label ? "let in" : "turned away"}${B.isUnfair(c) ? " (unfair! they brought a snack)" : ""}${c.tag === "copy" ? " (a copy)" : c.tag === "new" ? " (new, judged fairly)" : c.tag === "fixed" ? " (fixed)" : ""}` : "Hover a creature to see its story.";
  });
  dcv.addEventListener("pointerleave", () => { S.hover = -1; $("hover-info").textContent = "Hover a creature to see its story."; });

  // ---------- learned weights + fairness meter + tiles (built once, updated in place) ----------
  const NAMES = ["Purple colour", "Big size", "Wears a hat", "Brought a snack", "Starting mood"];
  $("weights").innerHTML = NAMES.map((n, i) => `<div class="wrow" id="wr${i}"><span>${n}</span><div class="t"><div class="f" id="wf${i}"></div></div><b id="wv${i}">0.0</b></div>`).join("");
  $("meter").innerHTML = `<div class="mrow"><span>Green</span><div class="t"><div class="f" id="mg" style="background:${GREEN}"></div></div><b id="mgv">–</b></div>
    <div class="mrow"><span>Purple</span><div class="t"><div class="f" id="mp" style="background:${PURPLE}"></div></div><b id="mpv">–</b></div>`;
  $("tiles").innerHTML = `<div class="tile3"><div class="k">Matches the old decisions</div><div class="v" id="t-old">–</div><div class="n">looks great!</div></div>
    <div class="tile3"><div class="k">Fair test: green</div><div class="v" id="t-g">–</div><div class="n" id="t-gn">&nbsp;</div></div>
    <div class="tile3"><div class="k">Fair test: purple</div><div class="v" id="t-p">–</div><div class="n" id="t-pn">&nbsp;</div></div>`;

  function showWeights(w, mask) {
    w.forEach((v, i) => {
      const f = $("wf" + i), pctw = Math.min(50, Math.abs(v) * 11);
      f.style.left = (v >= 0 ? 50 : 50 - pctw) + "%";
      f.style.width = pctw + "%";
      f.style.background = v >= 0 ? ML.cssVar("--good") : ML.cssVar("--bad");
      $("wv" + i).textContent = (v >= 0 ? "+" : "") + v.toFixed(1);
    });
    $("wr0").classList.toggle("off", !!mask.colour);
    $("wr0").lastElementChild.textContent = mask.colour ? "hidden" : $("wv0").textContent;
  }
  function showMetrics(m) {
    $("mg").style.width = pct(m.greenSure) + "%"; $("mgv").textContent = pct(m.greenSure) + "%";
    $("mp").style.width = pct(m.purpleSure) + "%"; $("mpv").textContent = pct(m.purpleSure) + "%";
    const g = $("gap"), gp = Math.max(0, Math.round(m.gapSure * 100));
    g.className = "gap-pill " + (m.gapSure > 0.25 ? "bad" : m.gapSure > 0.08 ? "mid" : "ok");
    g.innerHTML = `${ML.icon(m.gapSure > 0.08 ? "info" : "check")} Fairness gap: ${gp}% ${m.gapSure > 0.25 ? "(unfair!)" : m.gapSure > 0.08 ? "(better, not fixed)" : "(pretty fair)"}`;
    $("t-old").textContent = pct(m.oldAcc) + "%";
    $("t-g").textContent = pct(m.greenAcc) + "%"; $("t-p").textContent = pct(m.purpleAcc) + "%";
    $("t-gn").textContent = `snack-carriers let in: ${pct(m.greenIn)}%`;
    $("t-pn").textContent = `snack-carriers let in: ${pct(m.purpleIn)}%`;
    $("t-p").style.color = m.purpleAcc < 0.7 ? ML.cssVar("--bad") : "";
  }

  // ---------- "Ask the AI" ----------
  const pet = $("pet").getContext("2d");
  function showAsk() {
    const src = S.viewing || { w: S.w, mask: S.mask, data: S.data };
    const c = { ...S.ask, label: 0 };
    const res = B.contributions(src.w, c, src.mask);
    const yes = res.p >= 0.5;
    pet.clearRect(0, 0, 168, 168);
    drawCreature(pet, 84, 96, 150, c);
    $("verdict").innerHTML = `${yes ? "Let in!" : "Turned away"}<small>${pct(res.p)}% sure it should come in</small>`;
    $("verdict").style.color = yes ? ML.cssVar("--good") : ML.cssVar("--bad");
    // inside
    const rows = res.rows.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const sign = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);
    let h = `<div>${ML.icon("eye")} AI sees: <b>${rows.filter((r) => r.key !== "bias").map((r) => r.name.toLowerCase() + " (" + sign(r.v) + ")").join(" + ") || "nothing special"}</b></div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("ruler")} Add them up with its starting mood (${sign(res.rows.find((r) => r.key === "bias").v)}): total <b>${sign(res.z)}</b> → <b>${pct(res.p)}%</b> → <b style="color:${yes ? "var(--good)" : "var(--bad)"}">${yes ? "YES" : "NO"}</b></div>`;
    const hist = B.history(src.data, !!c.purple, !!c.snack);
    if (hist.n) h += `<div class="arrow">${ML.icon("arrow-down")}</div><div>${ML.icon("book")} Why? In the examples, ${c.purple ? "purple" : "green"} creatures ${c.snack ? "<b>with</b>" : "<b>without</b>"} a snack were let in <b>${pct(hist.letIn)}%</b> of the time (${hist.n} examples).</div>`;
    const unfair = c.snack && !yes;
    h += `<div class="muted" style="font-weight:800;color:${unfair ? "var(--bad)" : "var(--ink-2)"}">${unfair ? "Unfair! The club rule says anyone with a snack is welcome." : c.snack === (yes ? 1 : 0) ? "That matches the club rule." : "The club rule says no snack, no entry."}</div>`;
    $("inside").innerHTML = h;
  }

  // ---------- checkpoints ----------
  function renderCkpts() {
    const host = $("ckpts");
    host.innerHTML = S.ckpts.map((k, i) => `<button class="ckpt ${S.viewing === k ? "on" : ""}" data-i="${i}"><canvas width="248" height="112"></canvas><b>${k.label}</b>gap ${gapPct(k.m)}% · purple ${pct(k.m.purpleAcc)}%</button>`).join("")
      + (S.viewing ? `<button class="ckpt" data-live="1" style="display:grid;place-items:center;align-content:center;gap:6px"><b>Back to live</b>${ML.icon("play")}</button>` : "");
    host.querySelectorAll(".ckpt[data-i]").forEach((b) => {
      const k = S.ckpts[+b.dataset.i], c = b.querySelector("canvas").getContext("2d");
      const bar = (y, v, col) => { c.fillStyle = ML.cssVar("--bg-2"); c.fillRect(8, y, 232, 30); c.fillStyle = col; c.fillRect(8, y, 232 * v, 30); };
      bar(14, k.m.greenSure, GREEN); bar(62, k.m.purpleSure, PURPLE);
      b.addEventListener("click", () => view(k));
    });
    const live = host.querySelector("[data-live]");
    if (live) live.addEventListener("click", () => view(null));
    if (!S.ckpts.length) host.innerHTML = `<span class="muted">The first checkpoint appears when training finishes.</span>`;
  }
  function view(k) {
    S.viewing = k;
    if (k) { showWeights(k.w, k.mask); showMetrics(k.m); ML.say(`This is the AI <b>${k.label.toLowerCase()}</b>. The fairness gap was <b>${gapPct(k.m)}%</b>.`); }
    else { showWeights(S.w, S.mask); if (S.metrics) showMetrics(S.metrics); }
    showAsk(); renderCkpts();
  }

  // ---------- training ----------
  function startTraining(label) {
    S.w = B.newWeights(); S.ep = 0; S.loss = null; S.running = true; S.pending = label; S.viewing = null;
    $("train").innerHTML = `${ML.icon("pause")} Training…`;
    renderCkpts();
  }
  function finishTraining() {
    S.running = false;
    S.metrics = B.metrics(S.w, S.mask, oldSet, fairSet);
    S.ckpts.push({ label: S.pending, w: S.w.slice(), mask: { ...S.mask }, m: S.metrics, n: S.data.length });
    $("train").innerHTML = `${ML.icon("play")} Train again`;
    showWeights(S.w, S.mask); showMetrics(S.metrics); showAsk(); renderCkpts();
    narrate();
  }
  function narrate() {
    const m = S.metrics, first = S.ckpts.length === 1;
    if (first) ML.say(`Done! On the old decisions it scores <b>${pct(m.oldAcc)}%</b>. Looks great. But on a <b>fair test</b>, purple creatures only get <b>${pct(m.purpleAcc)}%</b>. Look at the purple weight: it learned "purple means no".`);
    else if (S.pending.startsWith("Copied")) ML.say(`Hmm. The fairness gap is <b>${gapPct(m)}%</b>. Copying the same unfair examples doesn't help, because the copies carry the <b>same unfairness</b>. (It got worse!)`);
    else if (m.gapSure < 0.05) ML.say(`Much fairer! The gap is down to <b>${gapPct(m)}%</b>, and purple creatures now score <b>${pct(m.purpleAcc)}%</b> on the fair test.`);
    else ML.say(`Better! The gap shrank to <b>${gapPct(m)}%</b>. Keep fixing, or try a different fix.`);
    if (!first && m.gapSure < 0.05) ML.confetti(40);
  }
  $("train").addEventListener("click", () => { if (!S.running) startTraining("Retrained"); });
  document.querySelectorAll("#speed button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#speed button").forEach((x) => x.classList.toggle("on", x === b));
    S.speed = +b.dataset.v;
  }));

  // ---------- fixes ----------
  function fix(label, apply, say) {
    apply();
    ML.say(say);
    startTraining(label);
    drawData();
  }
  $("fix-more").addEventListener("click", () => {
    S.addedFair += 15;
    fix(`+${S.addedFair} fair purple`, () => (S.data = B.addFairPurple(S.data, 15, S.rnd)), `Adding <b>15</b> purple creatures, judged fairly by their snack. The AI trains again…`);
  });
  $("fix-hide").addEventListener("click", () => {
    const hide = !S.mask.colour;
    fix(hide ? "Hid colour" : "Colour shown", () => (S.mask.colour = hide), hide ? `The AI can't see colour any more, so it can't treat purple differently…` : `Colour is back. The AI can use it again…`);
    $("fix-hide-t").firstChild.textContent = hide ? "Show the colour again" : "Hide the colour from the AI";
  });
  $("fix-copy").addEventListener("click", () => {
    if (S.copied) return ML.toast("Already copied. Try another fix!");
    S.copied = true;
    fix("Copied purple", () => (S.data = B.copyBalance(S.data)), `Copying the purple creatures until there are as many as green ones…`);
    $("fix-copy").disabled = true;
  });
  $("fix-relabel").addEventListener("click", () => {
    if (S.relabelled) return ML.toast("Already fixed!");
    S.relabelled = true;
    const r = B.relabel(S.data);
    fix("Fixed old decisions", () => (S.data = r.data), `Fixing <b>${r.fixed}</b> unfair old decisions: purple creatures with snacks should have been let in…`);
    $("fix-relabel").disabled = true;
  });
  $("show-unfair").addEventListener("change", (e) => { S.showUnfair = e.target.checked; });
  $("reset").addEventListener("click", () => {
    S.data = B.makeData(SEED); S.mask = { colour: false }; S.ckpts = []; S.addedFair = 0; S.copied = false; S.relabelled = false; S.rnd = B.mulberry(77);
    $("fix-copy").disabled = false; $("fix-relabel").disabled = false; $("fix-hide-t").firstChild.textContent = "Hide the colour from the AI";
    ML.say(`Back to the start: the old, unfair decisions. Training the AI again…`);
    startTraining("Start");
  });
  [["a-col", "purple"], ["a-big", "big"], ["a-hat", "hat"], ["a-snack", "snack"]].forEach(([id, key]) =>
    document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      S.ask[key] = +b.dataset.v; showAsk();
    })));

  // ---------- main loop ----------
  function frame() {
    if (S.running) {
      const n = S.speed === 0 ? S.target : ML.ticks(S.speed * 4, "tr");
      for (let i = 0; i < n && S.ep < S.target; i++) { S.loss = B.trainStep(S.w, S.data, S.mask); S.ep++; }
      if (!S.viewing) { showWeights(S.w, S.mask); showMetrics(B.metrics(S.w, S.mask, oldSet, fairSet)); }
      $("st-ep").textContent = S.ep; $("st-loss").textContent = S.loss === null ? "–" : S.loss.toFixed(2);
      if (S.ep >= S.target) finishTraining();
    }
    drawData();
    requestAnimationFrame(frame);
  }
  // Auto-train once so there is something to look at straight away.
  showWeights(S.w, S.mask);
  showAsk();
  renderCkpts();
  setTimeout(() => { ML.say(`Watch the AI learn from <b>${S.data.length}</b> old decisions. Look at the bars on the left: they show what it decides matters.`); startTraining("Start"); }, 500);
  requestAnimationFrame(frame);
})();
