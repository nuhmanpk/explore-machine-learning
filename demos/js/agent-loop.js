// Think, Act, Look page. Logic lives in agent-loop-core.js (AgentLoopCore).
(function () {
  const C = window.AgentLoopCore, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const S = { task: "birthday", modes: {}, agent: null, solved: new Set(), sawFail: false };
  const tick = (id) => { const e = $("c-" + id); if (e && !e.classList.contains("done")) { e.classList.add("done"); ML.toast("Challenge done!"); } };
  const fmt = (a) => `${a.tool}(${a.args.map((x) => JSON.stringify(x)).join(", ")})`;

  function fresh() { S.agent = C.makeAgent(S.task, S.modes, 8); S.sawFail = false; render(); }
  function render() {
    const A = S.agent, T = C.TASKS[S.task];
    $("goal").textContent = "· " + T.goal;
    $("trace").innerHTML = A.turns.map((t) => {
      if (t.final) return `<div class="turn final ${A.outcome === "solved" ? "" : "bad"}"><div class="row"><span class="lab">Turn ${t.n}</span><span>${esc(t.thought)}</span></div><div class="row"><span class="lab">Answer</span><b>${esc(t.final)}</b></div></div>`;
      return `<div class="turn ${t.failed ? "fail" : ""}"><div class="row"><span class="lab">Turn ${t.n}</span><span class="n">${ML.icon("bulb")} ${esc(t.thought)}</span></div>
        <div class="row"><span class="lab">Act</span><span class="pill">${esc(fmt(t.action))}</span></div>
        <div class="row"><span class="lab">Look</span><span class="pill ${t.failed ? "bad" : "good"}">${esc(t.observation)}</span></div></div>`;
    }).join("") || `<p class="muted" style="font-weight:700">Press <b>Step</b> to start the first loop.</p>`;
    $("s-turns").textContent = `${A.turns.filter((t) => t.action).length} / 8`;
    $("s-err").textContent = A.turns.filter((t) => t.failed).length;
    $("s-out").textContent = A.outcome === "solved" ? "solved" : A.outcome === "stuck" ? "gave up" : A.outcome === "budget" ? "out of turns" : "working";
    $("s-out").style.color = A.outcome === "solved" ? "var(--good)" : A.outcome ? "var(--bad)" : "";
    $("step").disabled = $("runall").disabled = A.done;
    inside();
    if (A.turns.some((t) => t.failed)) S.sawFail = true;
    if (A.outcome === "solved") {
      S.solved.add(S.task); tick("solve");
      if (S.sawFail && Object.values(S.modes).includes("flaky")) tick("flaky");
      if (S.sawFail && S.modes.clock === "broken" && S.task === "birthday") tick("backup");
      if (S.solved.size >= 3) tick("all");
    }
    if (A.outcome === "stuck" && S.modes.lookup === "broken") tick("honest");
    if (A.outcome === "solved") ML.say(`Done: <b>${esc(A.answer)}</b>. ${S.sawFail ? "A tool failed on the way, but I found a way round." : "Try breaking a tool and run it again!"}`);
    else if (A.outcome === "stuck") ML.say("I could not finish. I would rather tell you that than guess!");
    else if (A.outcome === "budget") ML.say("I ran out of turns. A turn limit stops me looping forever.");
  }
  function inside() {
    const A = S.agent, T = C.TASKS[S.task], have = Object.entries(A.vals).map(([k, v]) => `<span class="pill">${esc(v)}</span>`).join(" ") || "<span class='muted'>nothing yet</span>";
    const next = A.done ? null : T.steps.find((s) => !(s.id in A.vals));
    $("inside").innerHTML = `<div class="sig"><span><b>Facts I have so far:</b> ${have}</span></div>
      <div class="sig"><span><b>Next I need:</b> ${next ? esc(next.why.toLowerCase()) + ", using <b>" + next.tool + "</b>" : "nothing, I am finished."}</span></div>
      <div class="muted" style="font-size:.82rem;font-weight:700">Each turn I read the diary so far, decide what is missing, and pick a tool. If the last tool failed I retry once, then try a backup.</div>`;
  }
  function build() {
    $("tasks").innerHTML = Object.entries(C.TASKS).map(([id, t]) => `<button type="button" class="opt ${id === S.task ? "on" : ""}" data-t="${id}" aria-pressed="${id === S.task}">${esc(t.name)}</button>`).join("");
    $("tools").innerHTML = C.TOOL_NAMES.map((n) => `<div class="tool ${S.modes[n] || ""}"><span>${n}</span><select class="sel" data-tool="${n}" aria-label="${n} tool state">${["ok", "flaky", "broken"].map((m) => `<option value="${m}" ${(S.modes[n] || "ok") === m ? "selected" : ""}>${m === "ok" ? "works" : m}</option>`).join("")}</select></div>`).join("");
  }
  $("tasks").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; S.task = b.dataset.t; build(); fresh(); });
  $("tools").addEventListener("change", (e) => { const s = e.target.closest("[data-tool]"); if (!s) return; if (s.value === "ok") delete S.modes[s.dataset.tool]; else S.modes[s.dataset.tool] = s.value; build(); fresh(); ML.say(s.value === "ok" ? "Fixed! Run it again." : `I broke <b>${s.dataset.tool}</b>. Step through and see what the agent does.`); });
  $("step").addEventListener("click", () => { S.agent.step(); render(); });
  $("runall").addEventListener("click", () => { S.agent.run(); render(); });
  $("reset").addEventListener("click", () => { fresh(); ML.say("Fresh start. Same tools, same task."); });
  build(); fresh();
})();
