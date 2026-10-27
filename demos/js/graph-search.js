// Search Engine page. Logic lives in graph-search-core.js (GraphSearchCore).
(function () {
  const K = window.GraphSearchCore, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const POP = K.popularity(11), idx = {}, hits = {};
  const index = (o) => idx[+o.stop + "" + +o.stem] || (idx[+o.stop + "" + +o.stem] = new K.Index(K.DOCS, o));
  const SAMPLES = ["cat", "cats chasing", "running dogs", "the park", "moon sky", "bike hill", "the of a", "song"];
  const COLS = ["--accent", "--warn", "--good", "--diff", "--bad"];
  $("qchips").innerHTML = SAMPLES.map((s) => `<button type="button">${esc(s)}</button>`).join("");
  $("qchips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { $("q").value = b.textContent; run(); } });
  ML.bindRange("#mix", (v) => v + "%", () => { if ($("res")) run(); });
  ["stop", "stem"].forEach((id) => $(id).addEventListener("change", run));
  $("q").addEventListener("input", run);
  $("stem").checked = true; $("stop").checked = true;

  const hit = (k, m) => { if (hits[k]) return; hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); };
  const ids = (r) => r.map((x) => x.id).sort((a, b) => a - b).join(",");

  function run() {
    const q = $("q").value, o = { stop: $("stop").checked, stem: $("stem").checked }, mix = +$("mix").value / 100;
    const ix = index(o), res = ix.search(q, mix, POP), qv = ix.queryVec(q);
    $("nres").textContent = res.length; $("best").textContent = res.length ? res[0].score.toFixed(2) : "-";
    if (!q.trim()) { $("res").innerHTML = `<li class="empty">Type something above, or tap an example.</li>`; inside(null, ix); return; }
    if (!res.length) { $("res").innerHTML = `<li class="empty">No pages found. ${o.stop && !qv.size ? "Every word you typed is a tiny word that I ignore, or I have never seen it." : "None of these words appear in the library."}</li>`; inside(null, ix); trick(q, mix); return; }
    $("res").innerHTML = res.slice(0, 8).map((r, i) => {
      const d = K.DOCS[r.id], words = d.text.split(/(\s+)/).map((w) => { const t = K.tokenize(w, o)[0]; return t && qv.has(t) ? `<mark>${esc(w)}</mark>` : esc(w); }).join("");
      const cosPart = (1 - mix) * r.cos, popPart = mix * r.pop, tot = Math.max(1e-9, cosPart + popPart);
      const chips = r.parts.map((p) => `<span class="wc">${esc(p.w)}<small>+${p.c.toFixed(2)}</small></span>`).join("");
      return `<li><div class="rt"><span><span class="rk">${i + 1}</span>${esc(d.title)}</span><span class="sc">${r.score.toFixed(2)}</span></div>
        <div class="rx">${words}</div>
        <div class="why"><span>word scores:</span>${chips}<span>= ${r.cos.toFixed(2)} match</span>${mix > 0 ? `<span class="pp">popularity ${r.pop.toFixed(2)}</span>` : ""}</div>
        <div class="stackbar" aria-hidden="true"><i style="width:${(cosPart / tot * 100).toFixed(0)}%;background:var(--accent)"></i><i style="width:${(popPart / tot * 100).toFixed(0)}%;background:var(--warn)"></i></div></li>`;
    }).join("");
    hit("search", "Your first search worked!");
    inside(res[0], ix, qv);
    trick(q, mix, res);
  }
  function trick(q, mix, res) {
    if (!q.trim()) return;
    const o = { stop: $("stop").checked, stem: $("stem").checked };
    const a = index({ stop: o.stop, stem: true }).search(q, 0, POP), b = index({ stop: o.stop, stem: false }).search(q, 0, POP);
    if (ids(a) !== ids(b)) hit("stem", "Matching word endings changed what was found.");
    const c = index({ stop: true, stem: o.stem }).search(q, 0, POP), d = index({ stop: false, stem: o.stem }).search(q, 0, POP);
    if (ids(c) !== ids(d)) hit("stop", "Tiny words change the results a lot.");
    if (mix > 0) { const z = index(o).search(q, 0, POP); if (z.length && res && res.length && z[0].id !== res[0].id) hit("pop", "A popular page overtook the best match.") }
  }
  function inside(top, ix, qv) {
    if (!top) { $("inside").innerHTML = `<div class="sig"><span>I turn every page into word scores. <b>Rare</b> words score high, <b>common</b> ones low. Search to see them.</span></div>`; return; }
    const d = K.DOCS[top.id], rows = [...qv.keys()].map((w) => `<span class="wchip" style="background:var(--bg-2);border:2px solid var(--line);border-radius:10px;padding:2px 8px;font-weight:800;font-size:.85rem">${esc(w)} <small style="font-family:var(--font-mono)">in ${ix.df.get(w)} of 30 pages, weight ${ix.idf(w).toFixed(1)}</small></span>`).join(" ");
    $("inside").innerHTML = `<div class="sig"><span>Top result: <b>${esc(d.title)}</b>.</span></div><div style="display:flex;flex-wrap:wrap;gap:6px">${rows}</div>
      <div class="decision">Rarer words get a bigger weight, so they decide the order.</div>`;
  }
  run();
  window.SearchPage = { run };
})();
