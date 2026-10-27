// Is It Fair? page. Logic lives in ethics-bias-core.js (EthicsBiasCore).
(function () {
  const C = window.EthicsBiasCore, $ = (id) => document.getElementById(id);
  const S = { seed: 1, train: [], test: [], feats: { skill: true, effort: true, area: true, group: true }, rw: false, thr: 0.5, base: null, m: null, e: null, hits: {}, thrMoved: false, firstGap: null };
  const pct = (v) => Math.round(v * 100);

  function newSet() {
    S.seed = 1 + Math.floor(Math.random() * 90000);
    S.train = C.makeData(S.seed, 1500); S.test = C.makeData(S.seed + 1, 400); S.wts = C.reweigh(S.train);
    S.hits = {}; S.thrMoved = false; S.firstGap = null;
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    S.shown = S.test.slice(0, 100);
    update();
  }
  function build() {
    $("feat").innerHTML = C.FEATURES.map((f) => `<button type="button" data-f="${f}" aria-pressed="true"><span>${C.LABELS[f]}</span><span class="st"></span></button>`).join("");
  }
  $("feat").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const f = b.dataset.f, on = Object.values(S.feats).filter(Boolean).length;
    if (S.feats[f] && on <= 1) { ML.toast("The robot needs at least one clue."); return; }
    S.feats[f] = !S.feats[f]; update(f);
  });
  $("rw").addEventListener("click", () => { S.rw = !S.rw; update("rw"); });
  ML.bindRange("#thr", (v) => v.toFixed(2), (v) => { const was = S.thr; S.thr = v; if (Math.abs(v - 0.5) > 0.03) S.thrMoved = true; if (was !== v && S.m) update("thr"); });

  function update(what) {
    const fs = C.FEATURES.filter((f) => S.feats[f]);
    if (what !== "thr" || !S.m) S.m = C.train(S.train, fs, { weights: S.rw ? S.wts : null });
    S.e = C.evaluate(S.m, S.test, { A: 0.5, B: S.thr });
    render(); challenges(what);
  }
  function render() {
    const e = S.e, old = C.oldRates(S.train);
    document.querySelectorAll("#feat button").forEach((b) => { const on = S.feats[b.dataset.f]; b.setAttribute("aria-pressed", on); b.querySelector(".st").textContent = on ? "used" : "hidden"; });
    $("rw").setAttribute("aria-pressed", S.rw); $("rw-st").textContent = S.rw ? "on" : "off";
    const line = (lbl, v, cls) => `<div class="gline"><span>${lbl}</span><div class="track"><i class="${cls}" style="width:${pct(v)}%"></i></div><b>${pct(v)}%</b></div>`;
    $("gbars").innerHTML = `<div class="gb"><h4>Robot says yes to</h4>${line("Group A", e.A.approval, "a")}${line("Group B", e.B.approval, "b")}</div>
      <div class="gb"><h4>Of the people who really are good members, robot says yes to</h4>${line("Group A", e.A.tpr, "a")}${line("Group B", e.B.tpr, "b")}</div>
      <div class="gb"><h4>The old committee said yes to (what it learned from)</h4>${line("Group A", old[0], "a")}${line("Group B", old[1], "b")}</div>`;
    const dots = (g) => S.shown.filter((d) => d.g === g).slice(0, 40).map((d) => {
      const yes = C.score(S.m, d) >= (g ? S.thr : 0.5);
      return `<i class="${yes ? "yes" : "no"}${g ? " gb" : ""}${!yes && d.q ? " q" : ""}"></i>`; }).join("");
    $("pa").innerHTML = dots(0); $("pb").innerHTML = dots(1);
    $("acc").textContent = pct(e.acc) + "%"; $("agree").textContent = pct(e.agree) + "%";
    const g = Math.round(e.tprGap * 100); $("tprgap").textContent = (g > 0 ? "+" : "") + g;
    const gn = $("gapnote"), ag = Math.round(e.approvalGap * 100);
    gn.className = "gapnote " + (Math.abs(ag) <= 10 && Math.abs(g) <= 5 ? "ok" : "bad");
    gn.textContent = `Yes-rate gap: ${ag} points. Good-member gap: ${g} points.` + (Math.abs(g) <= 5 ? " Close to fair for good members!" : " Group B's good members are missed more.");
    const W = $("weights"), mx = Math.max(...S.m.th.map(Math.abs), 1);
    W.innerHTML = S.m.features.map((f, j) => { const w = S.m.th[j], x = Math.abs(w) / mx * 50;
      return `<div class="wrow"><span>${C.LABELS[f]}</span><div class="wbar"><i style="${w >= 0 ? "left:50%" : "right:50%"};width:${x}%;background:${w >= 0 ? "var(--good)" : "var(--bad)"}"></i></div><b>${w.toFixed(1)}</b></div>`; }).join("") +
      `<p class="muted" style="margin:6px 0 0; font-size:.82rem; font-weight:700">Green pushes towards yes, red towards no.${S.feats.area && !S.feats.group ? " With Group gone, see how the neighbourhood code takes over its job." : ""}</p>`;
  }
  function done(k, msg) { if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); }
  function challenges(what) {
    const e = S.e, gap = Math.abs(e.approvalGap), all = Object.values(S.feats).every(Boolean);
    if (S.firstGap === null && all && !S.rw && S.thr === 0.5) S.firstGap = gap;
    if (all && !S.rw && S.thr === 0.5 && gap >= 0.2) done("see", "The robot is much harder on Group B. It copied the old unfairness.");
    if (!S.feats.group && S.feats.area && gap >= 0.1) done("proxy", "Group is hidden but the gap stays. Neighbourhood code is a proxy for it.");
    if (S.rw && S.firstGap !== null && gap < S.firstGap - 0.05) done("rw", "Reweighting shrank the gap, but it did not close it.");
    if (Math.abs(e.tprGap) <= 0.05 && e.acc >= 0.8) done("fair", "Nearly equal chances for good members, and still accurate.");
    if (what === "thr" && S.thrMoved) done("thr", "Moving a group's bar changes who gets in. It is a trade-off you have to choose.");
  }
  $("newp").addEventListener("click", newSet);
  build(); newSet();
})();
