// Plan Before You Go page. Logic lives in agent-plan-core.js (AgentPlanCore).
(function () {
  const C = window.AgentPlanCore, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const S = { task: "sandwich", broken: new Set(), g: null, p: null, sawFail: false, failed: false };
  const tick = (id) => { const e = $("c-" + id); if (e && !e.classList.contains("done")) { e.classList.add("done"); ML.toast("Challenge done!"); } };
  const auto = () => $("auto").checked;

  function fresh() {
    S.g = new C.Runner(S.task, "greedy", [...S.broken]); S.p = new C.Runner(S.task, "plan", [...S.broken]); S.failed = false;
    const t = C.TASKS[S.task], best = C.plan(t, t.init);
    S.best = best; render();
  }
  function build() {
    $("tasks").innerHTML = Object.entries(C.TASKS).map(([id, t]) => `<button type="button" class="opt ${id === S.task ? "on" : ""}" data-t="${id}" aria-pressed="${id === S.task}">${esc(t.name)}</button>`).join("");
    $("tname").textContent = C.TASKS[S.task].name;
    $("brk").innerHTML = C.TASKS[S.task].actions.map((a) => `<option value="${a.id}">${esc(a.name)} (cost ${a.cost})</option>`).join("");
  }
  function log(r) { return r.log.map((e) => `<li class="${e.type}">${esc(e.text)}</li>`).join("") || `<li class="muted">nothing yet</li>`; }
  function badge(el, r) {
    const st = r.needReplan ? "replan" : r.status; el.className = "badge " + (st === "running" ? "" : st);
    el.textContent = r.needReplan ? "plan failed" : r.status === "done" ? "finished" : r.status === "stuck" ? "stuck" : r.log.length ? "working" : "ready";
  }
  function render() {
    const g = S.g, p = S.p;
    $("l-g").innerHTML = log(g); $("l-p").innerHTML = log(p); badge($("b-g"), g); badge($("b-p"), p);
    $("c-g").textContent = g.cost; $("c-p").textContent = p.cost; $("c-b").textContent = S.best ? S.best.cost : "-";
    if (p.plan) {
      const edges = C.dependencies(C.TASKS[S.task], p.plan, null);
      $("plan").innerHTML = "<b>Plan:</b> " + p.plan.map((a, i) => (i < p.pi ? `<s>${esc(a.name)}</s>` : esc(a.name))).join(" → ") + ` <span class="muted">(cost ${p.planCost}, ${edges.length} dependencies, searched ${S.best ? S.best.expanded : "?"} states)</span>`;
    } else $("plan").textContent = "No plan found.";
    $("broken").textContent = S.broken.size ? "Broken: " + [...S.broken].map((id) => C.TASKS[S.task].actions.find((a) => a.id === id).name).join(", ") : "Nothing broken yet.";
    $("replan").disabled = !p.needReplan; $("step").disabled = $("run").disabled = (g.status !== "running" && p.status !== "running") || (p.needReplan && g.status !== "running" && !auto());
    inside();
    if (g.status === "stuck") tick("trap");
    if (p.log.some((e) => e.type === "fail")) tick("break");
    if (p.log.some((e) => e.type === "replan") && p.status === "done") tick("replan");
    if (S.task === "parcel" && g.status === "done" && p.status === "done" && p.cost < g.cost && !S.broken.size) tick("cheaper");
    if (S.broken.size && g.status !== "running" && p.status !== "running" && p.log.some((e) => e.type === "fail")) tick("both");
  }
  function inside() {
    const p = S.p, st = [...p.state].sort().join(", ") || "nothing";
    $("inside").innerHTML = `<div class="sig"><span><b>Facts that are true now (planner):</b><br><span class="mono" style="font-size:.82rem">${esc(st)}</span></span></div>
      <div class="sig"><span><b>Goal:</b> <span class="mono">${esc(C.TASKS[S.task].goal.join(", "))}</span></span></div>
      <div class="muted" style="font-size:.82rem;font-weight:700">Each step needs some facts to be true first, and makes new ones true. The greedy robot picks the cheapest step that adds a new fact. The planner searches all step lists for the cheapest one.</div>`;
  }
  function stepBoth() {
    if (S.p.needReplan && auto()) S.p.replan();
    S.g.step(); if (!S.p.needReplan) S.p.step(); render();
    if (S.p.needReplan && !auto()) ML.say("The planner's step failed, so its plan is no good. Press <b>Re-plan</b>!");
  }
  $("step").addEventListener("click", stepBoth);
  $("run").addEventListener("click", () => { S.g.run(); S.p.run(auto()); render(); if (S.p.needReplan) ML.say("The plan broke. Press <b>Re-plan</b> to search again from here."); else ML.say(`Greedy: <b>${S.g.status}</b> (cost ${S.g.cost}). Planner: <b>${S.p.status}</b> (cost ${S.p.cost}).`); });
  $("reset").addEventListener("click", () => { fresh(); ML.say("Back to the start. Same job, same broken steps."); });
  $("replan").addEventListener("click", () => { S.p.replan(); render(); ML.say("Re-planned from where I stand, without the broken step."); });
  $("break").addEventListener("click", () => { S.broken.add($("brk").value); fresh(); ML.say("That step will now fail when tried. Press Step both!"); });
  $("breaknext").addEventListener("click", () => { const a = S.p.plan && S.p.plan[S.p.pi]; if (!a) { ML.toast("The planner has no next step."); return; } S.broken.add(a.id); S.g.broken.add(a.id); S.p.broken.add(a.id); render(); ML.say(`<b>${esc(a.name)}</b> will fail when the planner tries it.`); });
  $("tasks").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; S.task = b.dataset.t; S.broken = new Set(); build(); fresh(); });
  build(); fresh();
})();
