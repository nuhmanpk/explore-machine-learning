// Tricked by Words page (a simulation). Logic lives in ethics-inject-core.js (EthicsInjectCore).
(function () {
  const C = window.EthicsInjectCore, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DEFS = [["data", "Mark the text as data"], ["clean", "Clean fake markers out of the text"], ["allow", "Allow-list of actions per task"], ["confirm", "Ask before risky actions"]];
  const S = { def: { data: false, clean: false, allow: false, confirm: false }, yes: 0, cur: null, peek: false, hits: {}, seed: 3 };
  const DOCS = [].concat(C.LEGIT.map((x) => Object.assign({ legit: true }, x)), C.ATTACKS);

  $("doc").innerHTML = `<optgroup label="Normal documents">` + C.LEGIT.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("") + `</optgroup><optgroup label="Sneaky documents">` + C.ATTACKS.map((x) => `<option value="${x.id}">${x.id.slice(1)}. ${esc(x.name)}</option>`).join("") + `</optgroup>`;
  $("doc").value = "A1"; S.cur = DOCS.find((d) => d.id === "A1");
  $("defs").innerHTML = DEFS.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="false"><span>${l}</span><span class="st">off</span></button>`).join("");
  $("defs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.def[b.dataset.k] = !S.def[b.dataset.k]; update(); $("log").innerHTML = ""; });
  $("doc").addEventListener("change", () => { S.cur = DOCS.find((d) => d.id === $("doc").value); $("log").innerHTML = ""; showDoc(); });
  $("peek").addEventListener("click", () => { S.peek = !S.peek; $("peek").setAttribute("aria-pressed", S.peek); showDoc(); });
  ML.bindRange("#yes", (v) => Math.round(v * 100) + "%", (v) => { S.yes = v; update(); });
  $("run").addEventListener("click", runOne);

  function showDoc() {
    const x = S.cur, T = C.TASKS[x.task];
    $("task").textContent = T.text;
    const inj = x.inj ? `<mark${x.hide ? ' class="hid"' : ""}>${esc(x.inj)}</mark>` : "";
    // A person sees the visible text; hidden tricks are only shown when you peek as the AI.
    const vis = esc(x.base) + (x.inj && (!x.hide || S.peek) ? " " + inj : "");
    $("doctext").innerHTML = vis;
    $("doclbl").textContent = S.peek ? "What the AI reads (sneaky part highlighted)" : "What a person sees in the document";
  }
  const label = (a) => C.ACTION_NAMES[a.type] + (a.arg ? ": " + a.arg : "");
  function runOne() {
    const x = S.cur, r = C.run(x.task, C.docOf(x), S.def, { yesRate: S.yes, seed: S.seed, idx: x.legit ? 100 + C.LEGIT.indexOf(x) : C.ATTACKS.indexOf(x) });
    const rows = r.executed.map((e) => `<div class="step"><span>${esc(label(e.a))}</span><span class="pill ${e.mine ? "ok" : "bad"}">${e.mine ? "what you asked" : e.asked ? "user clicked Yes, tricked!" : "TRICKED (fake)"}</span></div>`)
      .concat(r.blocked.map((b) => `<div class="step"><span>${esc(label(b.a))}</span><span class="pill stop">${b.why === "allow" ? "blocked: not on allow-list" : "you said No"}</span></div>`));
    $("log").innerHTML = `<div class="step" style="border-style:dashed"><span>Simulated assistant</span><span class="pill stop">no real actions</span></div>` + rows.join("");
    if (!r.executed.length) ML.say("It did nothing at all. Careful!");
    else ML.say(r.hijacked ? "<b>Tricked!</b> It obeyed an order that came from the document, not from you. (All fake, of course.)" : "<b>Good.</b> It only did what the user asked.");
    if (!x.legit && r.hijacked && !Object.values(S.def).some(Boolean)) done("hit", "The sneaky order worked, because the assistant cannot tell who is giving orders.");
  }
  function update() {
    const A = C.runAttacks(S.def, S.yes, S.seed), L = C.runLegit(S.def, S.yes, S.seed), n = A.hijacked;
    document.querySelectorAll("#defs button").forEach((b) => { const on = S.def[b.dataset.k]; b.setAttribute("aria-pressed", on); b.querySelector(".st").textContent = on ? "on" : "off"; });
    $("rate").textContent = Math.round(n / A.total * 100) + "%"; $("rate").style.color = n ? "var(--bad)" : "var(--good)";
    $("ratetxt").textContent = `${n} of ${A.total} tricks worked`; $("ratebar").style.width = (n / A.total * 100) + "%";
    $("legit").textContent = `${L.done}/${L.total}`; $("asks").textContent = A.asked;
    $("alist").innerHTML = A.res.map((r) => `<div class="arow"><span>${r.x.id.slice(1)}. ${esc(r.x.name)}</span><span class="pill ${r.hijacked ? "bad" : "ok"}">${r.hijacked ? "worked" : "stopped"}</span></div>`).join("");
    const d = S.def, only = (k) => d[k] && Object.values(d).filter(Boolean).length === 1, byId = (id) => A.res.find((r) => r.x.id === id);
    if (only("data") && byId("A5").hijacked) done("marker", "The attacker wrote a fake end-of-data marker, so the rest counted as orders.");
    if (only("allow") && byId("A9").hijacked) done("hole", "Sending is allowed for this job, so changing the address slips through.");
    if (only("confirm") && S.yes >= 0.3 && n >= 3) done("tired", "People click Yes when they are tired. Asking is only as good as the person answering.");
    if (n === 0 && L.done === L.total) { done("all", "Layers beat any single trick. Remember: real attackers invent new tricks, so stay careful."); ML.confetti(40); }
  }
  function done(k, msg) { if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); }
  showDoc(); update();
})();
