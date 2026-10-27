// Why Did It Say That? page. Logic lives in ethics-explain-core.js (EthicsExplainCore).
(function () {
  const C = window.EthicsExplainCore, $ = (id) => document.getElementById(id);
  const ALL = C.FEATURES, REAL = ALL.filter((f) => f !== "wall");
  const S = { model: null, mode: "cheat", cur: null, fam: null, fresh: null, shown: null, hits: {}, imp: [], baseProb: null, editedWallOnly: true, seed: 1 };
  const pct = (v) => Math.round(v * 100);

  function init() {
    S.seed = 1 + Math.floor(Math.random() * 90000);
    S.cheat = C.makePhotos(S.seed, 600, 0.95); S.mixed = C.makePhotos(S.seed, 600, 0.5);
    S.fam = C.makePhotos(S.seed + 1, 400, 0.95); S.fresh = C.makePhotos(S.seed + 2, 400, 0.5);
    S.hits = {}; document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    setMode("cheat"); pick();
  }
  function setMode(m) {
    S.mode = m;
    S.model = C.train(m === "mix" ? S.mixed : S.cheat, m === "hide" ? REAL : ALL);
    S.imp = C.permImportance(S.model, S.fam, S.seed + 3, 4);
    $("mode").textContent = { cheat: "Now: trained on the practice photos, wall colour allowed.", hide: "Now: the robot cannot see the wall colour.", mix: "Now: practised with walls mixed up, so wall colour tells nothing." }[m];
    render(); checkScore();
  }
  function pick() {
    const pool = S.fam.filter((d) => d.y === (Math.random() < 0.5 ? 1 : 0));
    S.cur = Object.assign({}, pool[Math.floor(Math.random() * pool.length)]);
    S.orig = Object.assign({}, S.cur); S.changed = {}; S.baseProb = C.prob(S.model, S.cur);
    buildSliders(); render();
  }
  function buildSliders() {
    $("sliders").innerHTML = REAL.map((f) => `<label class="sl" for="s-${f}"><span>${C.LABELS[f]}</span><input id="s-${f}" data-f="${f}" type="range" min="0" max="1" step="0.01" value="${S.cur[f].toFixed(2)}"></label>`).join("") +
      `<div class="sl"><span>Wall colour</span><button class="btn small" id="wallbtn" type="button" aria-pressed="false"></button></div>`;
    $("sliders").oninput = (e) => { const f = e.target.dataset.f; if (!f) return; S.cur[f] = +e.target.value; S.changed[f] = true; edited(); };
    $("wallbtn").onclick = () => { S.cur.wall = 1 - S.cur.wall; S.changed.wall = true; edited(); };
  }
  function edited() {
    render();
    if (!S.hits.edit) done("edit", "The bars moved when you changed a clue. That is the explanation at work.");
    const only = Object.keys(S.changed).length === 1 && S.changed.wall;
    const now = C.prob(S.model, S.cur) >= 0.5, was = S.baseProb >= 0.5;
    if (only && now !== was && S.mode === "cheat") done("flip", "Only the wall changed and the answer flipped. That is the shortcut!");
  }
  function pet(d) {
    const ear = 10 + d.ears * 34, snout = 10 + d.snout * 30, wh = 8 + d.whiskers * 30, sz = 0.7 + d.size * 0.5;
    const bg = d.wall ? "#5b9bf0" : "#e9d9b4";
    return `<rect width="200" height="200" fill="${bg}"/><rect y="150" width="200" height="50" fill="#00000022"/>
      <g transform="translate(100 120) scale(${sz.toFixed(2)})"><ellipse rx="52" ry="44" fill="#b98b5a"/>
      <polygon points="-44,-26 -30,${-26 - ear} -16,-38" fill="#b98b5a"/><polygon points="44,-26 30,${-26 - ear} 16,-38" fill="#b98b5a"/>
      <circle cx="-18" cy="-8" r="5" fill="#222"/><circle cx="18" cy="-8" r="5" fill="#222"/>
      <ellipse cy="${(8 + snout * 0.35).toFixed(1)}" rx="${(10 + snout * 0.3).toFixed(1)}" ry="${(7 + snout * 0.4).toFixed(1)}" fill="#e8c9a0"/><circle cy="${(4 + snout * 0.2).toFixed(1)}" r="4" fill="#222"/>
      <g stroke="#222" stroke-width="2" stroke-linecap="round"><line x1="-14" y1="12" x2="${-14 - wh}" y2="8"/><line x1="-14" y1="16" x2="${-14 - wh}" y2="18"/><line x1="14" y1="12" x2="${14 + wh}" y2="8"/><line x1="14" y1="16" x2="${14 + wh}" y2="18"/></g></g>`;
  }
  function render() {
    if (!S.cur) return;
    const d = S.cur, p = C.prob(S.model, d);
    $("pic").innerHTML = pet(d);
    const wb = $("wallbtn"); if (wb) { wb.textContent = d.wall ? "Blue" : "Beige"; wb.setAttribute("aria-label", "Wall colour, now " + (d.wall ? "blue" : "beige") + ". Press to switch."); wb.disabled = false; }
    $("verdict").textContent = `${p >= 0.5 ? "Dog" : "Cat"}, ${pct(p >= 0.5 ? p : 1 - p)}% sure`;
    $("mbar").style.width = pct(p) + "%";
    const cs = C.contributions(S.model, d), mx = Math.max(2, ...cs.map((c) => Math.abs(c.push))), top = cs.reduce((a, c) => (Math.abs(c.push) > Math.abs(a.push) ? c : a));
    $("why").innerHTML = cs.map((c) => `<div class="crow${c.f === top.f ? " top" : ""}"><span class="nm">${C.LABELS[c.f]}</span><div class="cbar"><i style="${c.push >= 0 ? "left:50%" : "right:50%"};width:${Math.abs(c.push) / mx * 50}%;background:${c.push >= 0 ? "var(--good)" : "var(--bad)"}"></i></div><b>${c.push >= 0 ? "+" : ""}${c.push.toFixed(1)}</b></div>`).join("");
    const imx = Math.max(0.05, ...S.imp.map((o) => o.drop));
    $("imp").innerHTML = S.imp.map((o) => `<div class="crow"><span>${C.LABELS[o.f]}</span><div class="ibar"><i style="width:${o.drop / imx * 100}%"></i></div><b>${pct(o.drop)}%</b></div>`).join("");
    $("acc1").textContent = pct(C.accuracy(S.model, S.fam)) + "%"; $("acc2").textContent = pct(C.accuracy(S.model, S.fresh)) + "%";
  }
  function done(k, msg) { if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); }
  function checkScore() {
    const a = C.accuracy(S.model, S.fam), b = C.accuracy(S.model, S.fresh);
    if (S.mode !== "cheat" && b >= 0.75) done("fix", "Now it works in new places too. No more cheating!");
    if (S.mode !== "cheat" && Math.abs(a - b) <= 0.08 && a >= 0.7 && b >= 0.7) { done("honest", "Familiar and new scores match. This robot is honest about its skill."); ML.confetti(40); }
  }
  $("rnd").addEventListener("click", pick);
  $("hide").addEventListener("click", () => { setMode("hide"); pick(); ML.say("<b>Wall hidden.</b> Familiar score dropped a bit, but the new-places score went up. Honesty costs a little!"); });
  $("mix").addEventListener("click", () => { setMode("mix"); pick(); ML.say("<b>Retrained.</b> The wall no longer predicts the animal, so the robot learned to rely on ears and noses instead."); });
  $("reset").addEventListener("click", () => { setMode("cheat"); pick(); });
  init();
})();
