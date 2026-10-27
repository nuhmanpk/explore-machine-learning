// A Small Backpack page. Logic lives in agent-memory-core.js (AgentMemoryCore).
(function () {
  const C = window.AgentMemoryCore, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NAMES = { last: "Keep last", summary: "Summarise", retrieve: "Search (TF-IDF)" };
  const S = { convo: null, W: 80, q: 0, tab: "retrieve", res: null };
  const tick = (id) => { const e = $("c-" + id); if (e && !e.classList.contains("done")) { e.classList.add("done"); ML.toast("Challenge done!"); } };

  function newChat() { S.convo = C.makeConvo(1 + Math.floor(Math.random() * 90000)); S.q = 0; document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done")); update(); }
  function update() {
    const cv = S.convo, W = S.W, total = cv.turns.reduce((s, t) => s + C.wc(t.text), 0);
    $("wval").textContent = W; $("wcount").textContent = `· ${cv.turns.length} turns, ${total} words`;
    S.res = C.evaluate(cv, W);
    const q = cv.questions[S.q], factIds = new Set(cv.questions.map((x) => x.turn));
    $("strips").innerHTML = Object.keys(NAMES).map((s) => {
      const ctx = C.ctxFor(s, cv, W, q.q), mark = new Map(ctx.lines.map((l) => [l.id, l.summarised ? "s" : l.retrieved ? "r" : "v"]));
      return `<div class="strip"><div class="nm"><span>${NAMES[s]}</span><span class="muted">${ctx.used} / ${W} words used</span></div><div class="cells" aria-hidden="true">${cv.turns.map((t) => `<i class="${mark.get(t.id) || ""} ${factIds.has(t.id) ? "f" : ""}"></i>`).join("")}</div></div>`;
    }).join("");
    $("qt").innerHTML = `<tr><th>Question</th>${Object.keys(NAMES).map((s) => `<th>${NAMES[s]}</th>`).join("")}</tr>` + cv.questions.map((x, i) => `<tr class="${i === S.q ? "sel" : ""}"><td><button class="qbtn" data-q="${i}" type="button">${esc(x.q)}</button></td>${Object.keys(NAMES).map((s) => { const p = S.res[s].per[i]; return `<td class="${p.good ? "ok" : "no"}" title="${esc(p.got || "no answer")}">${p.good ? "✓" : "✗"}</td>`; }).join("")}</tr>`).join("");
    $("scores").innerHTML = Object.keys(NAMES).map((s) => `<div class="score"><span>${NAMES[s]}</span><div><i style="width:${S.res[s].score / S.res[s].total * 100}%"></i></div><b>${S.res[s].score}/${S.res[s].total}</b></div>`).join("");
    $("tabs").innerHTML = Object.keys(NAMES).map((s) => `<button type="button" class="opt ${s === S.tab ? "on" : ""}" data-tab="${s}" aria-pressed="${s === S.tab}">${NAMES[s]}</button>`).join("");
    const ctx = C.ctxFor(S.tab, cv, W, q.q), got = C.read(ctx.lines, q.key);
    $("qline").innerHTML = `Asked: <b>${esc(q.q)}</b><br>Answer from this backpack: <b class="${got === q.answer ? "ok" : "no"}">${got ? esc(got) : "I do not know"}</b> <span class="muted">(truth: ${esc(q.answer)})</span>`;
    $("ctx").innerHTML = ctx.lines.map((l) => `<div class="${l.summarised ? "s" : l.retrieved ? "r" : "v"}">${esc(l.text)}</div>`).join("") || "<div>(empty: nothing fits!)</div>";
    const L = S.res.last.score, M = S.res.summary.score, R = S.res.retrieve.score;
    if (L <= 2) tick("forget"); if (R >= 7 && L <= 3) tick("rag"); if (M - L >= 2) tick("sum");
    if (W <= 40 && R === 8) tick("tiny"); if (L === 8 && M === 8 && R === 8) tick("big");
  }
  $("win").addEventListener("input", (e) => { S.W = +e.target.value; update(); });
  $("qt").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) { S.q = +b.dataset.q; update(); } });
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { S.tab = b.dataset.tab; update(); } });
  $("newchat").addEventListener("click", () => { newChat(); ML.say("A new chat with new facts. Try a smaller backpack!"); });
  newChat();
})();
