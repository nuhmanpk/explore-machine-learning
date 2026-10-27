// Pick the Right Tool page. Logic lives in agent-tools-core.js (AgentToolsCore).
(function () {
  const C = window.AgentToolsCore, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const S = { reqs: [], test: [], labels: new Map(), router: new C.Router(), last: null, ownText: "" };
  const tick = (id) => { const e = $("c-" + id); if (e && !e.classList.contains("done")) { e.classList.add("done"); ML.toast("Challenge done!"); } };
  const NICE = { calculator: "calculator", clock: "clock", lookup: "lookup", none: "no tool" };

  function session() {
    const seed = 1 + Math.floor(Math.random() * 90000);
    S.reqs = C.requests(seed, 32); S.test = C.requests(seed + 1, 24); S.labels = new Map(); S.router.reset(); S.last = null;
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done")); $("ask-out").innerHTML = "";
    build(); refresh();
  }
  function build() {
    $("pile").innerHTML = S.reqs.map((q) => `<div class="rq" data-id="${q.id}"><div class="t">${esc(q.text)}</div><div class="btns">${C.TOOLS.map((t) => `<button type="button" class="opt" data-tool="${t}" aria-pressed="false">${NICE[t]}</button>`).join("")}<span class="pk"></span></div></div>`).join("");
  }
  function label(id, tool) {
    const q = S.reqs[id], old = S.labels.get(id);
    if (old) S.router.learn(q.text, old, -1);
    if (old === tool) S.labels.delete(id); else { S.labels.set(id, tool); S.router.learn(q.text, tool, 1); }
  }
  $("pile").addEventListener("click", (e) => { const b = e.target.closest("[data-tool]"); if (!b) return; const id = +b.closest(".rq").dataset.id; label(id, b.dataset.tool); refresh(); showInside(S.reqs[id].text); });
  function refresh() {
    document.querySelectorAll(".rq").forEach((row) => {
      const id = +row.dataset.id, q = S.reqs[id], l = S.labels.get(id), p = S.router.predict(q.text);
      row.querySelectorAll("[data-tool]").forEach((b) => { const on = b.dataset.tool === l; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      row.querySelector(".pk").textContent = S.router.count() ? `${NICE[p.tool]} ${Math.round(p.conf * 100)}%` : "no idea yet";
    });
    const ev = C.evaluate(S.router, S.test); S.last = ev;
    $("acc").textContent = Math.round(ev.acc * 100) + "%"; $("wrong").textContent = ev.n - ev.ok; $("lab").textContent = S.labels.size;
    $("count").textContent = `· ${S.labels.size} of ${S.reqs.length} labelled`;
    $("fails").innerHTML = ev.wrong.length ? ev.wrong.slice(0, 5).map((w) => `<div class="fail">"${esc(w.q.text)}" needed <b>${NICE[w.q.tool]}</b>, Robo picked <b>${NICE[w.picked]}</b>.<br><span class="pill ${w.result.ok ? "" : "bad"}">${esc(w.result.out)}</span></div>`).join("") + (ev.wrong.length > 5 ? `<p class="muted" style="font-weight:700">...and ${ev.wrong.length - 5} more.</p>` : "") : `<p class="muted" style="font-weight:700">${S.router.count() ? "No wrong picks on the test set!" : "Teach Robo first."}</p>`;
    if (S.labels.size && S.labels.size <= 8 && ev.acc >= 0.6) tick("few");
    if (ev.acc >= 0.85) tick("good");
    if (ev.acc >= 0.95) tick("great");
  }
  function showInside(text) {
    if (!S.router.count()) { $("inside").innerHTML = `<div class="sig"><span>I have not learned anything yet, so my pick is a coin flip. Label a few requests!</span></div>`; return; }
    const ex = S.router.explain(text);
    $("inside").innerHTML = `<div class="sig"><span><b>"${esc(text)}"</b><br>Words that pushed me towards <b>${NICE[ex.top]}</b> rather than <b>${NICE[ex.second]}</b>:</span></div>
      <div class="chips">${ex.words.map((w) => `<span class="pill ${w.v > 0 ? "good" : "bad"}">${esc(w.w)} ${w.v > 0 ? "+" : ""}${w.v.toFixed(1)}</span>`).join("") || "<span class='muted'>no words I know</span>"}</div>`;
  }
  $("ask").addEventListener("click", ask);
  $("own").addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
  function ask() {
    const text = $("own").value.trim(); if (!text) { ML.toast("Type a request first."); return; }
    S.ownText = text; const p = S.router.predict(text), r = C.runTool(p.tool, text);
    $("ask-out").innerHTML = `<div class="bars">${C.TOOLS.map((t, i) => `<div class="bar"><span>${NICE[t]}</span><div><i style="width:${Math.round(p.probs[i] * 100)}%"></i></div><span>${Math.round(p.probs[i] * 100)}%</span></div>`).join("")}</div>
      <div class="res ${r.ok ? "good" : "bad"}"><b>Robo used ${NICE[p.tool]}:</b> ${esc(r.out)}</div>
      <p style="margin:8px 0 4px;font-weight:800;font-size:.9rem">Which tool should it have used?</p><div class="btn-row">${C.TOOLS.map((t) => `<button type="button" class="opt" data-teach="${t}">${NICE[t]}</button>`).join("")}</div>`;
    S.ownPick = p.tool; showInside(text);
    if (!r.ok) { tick("fail"); ML.say(`Oops, ${NICE[p.tool]} could not handle that. A wrong tool means a wrong or missing answer. Teach me the right one!`); }
    else ML.say(`I picked <b>${NICE[p.tool]}</b>. If that is not right, tell me which tool should have been used.`);
  }
  $("ask-out").addEventListener("click", (e) => {
    const b = e.target.closest("[data-teach]"); if (!b) return;
    S.router.learn(S.ownText, b.dataset.teach, 1); tick("teach"); if (b.dataset.teach !== S.ownPick) tick("fail");
    refresh(); ask(); ML.say(`Thanks! I will remember that "${esc(S.ownText)}" needs <b>${NICE[b.dataset.teach]}</b>.`);
  });
  $("teach5").addEventListener("click", () => { const todo = S.reqs.filter((q) => !S.labels.has(q.id)).slice(0, 5); if (!todo.length) { ML.toast("All labelled already."); return; } todo.forEach((q) => label(q.id, q.tool)); refresh(); ML.say(`I learned from 5 more. Right now I pick the correct tool <b>${Math.round(S.last.acc * 100)}%</b> of the time on the secret test.`); });
  $("reset").addEventListener("click", () => { session(); ML.say("Fresh requests, empty router. Label a few!"); });
  session(); showInside("");
})();
