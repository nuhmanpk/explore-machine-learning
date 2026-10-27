// Think-Act-Look agent loop core. The "brain" is a transparent rule-based policy (a toy stand-in for a language model);
// the loop, tools, error handling and turn budget are real. Pure logic; Node + browser.
(function (root) {
  const DAY = 86400000;
  const utc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const FACTS = { birthday: "2025-04-02", today: "2025-03-10", meal: "12", drink: "3", nile: "6650", amazon: "6400" };

  // ---- tools: each takes string args and returns a string, or throws ----
  const TOOLS = {
    lookup: { desc: "Reads a fact from a notebook.", run: (a) => { const k = String(a[0]).toLowerCase(); if (!(k in FACTS)) throw new Error(`nothing in the notebook about "${k}"`); return FACTS[k]; } },
    clock: { desc: "Tells today's date.", run: () => "2025-03-10" },
    days_between: { desc: "Counts days from one date to another.", run: (a) => String(Math.round((utc(a[1]) - utc(a[0])) / DAY)) },
    add: { desc: "Adds two numbers.", run: (a) => String(+a[0] + +a[1]) },
    sub: { desc: "Subtracts the second number from the first.", run: (a) => String(+a[0] - +a[1]) },
    mul: { desc: "Multiplies two numbers.", run: (a) => String(Math.round(+a[0] * +a[1] * 1000) / 1000) },
    calc: { desc: "A general calculator for 'a+b' style sums.", run: (a) => { const m = /^\s*(-?[\d.]+)\s*([+\-*])\s*(-?[\d.]+)\s*$/.exec(a[0]); if (!m) throw new Error("cannot read that sum"); const x = +m[1], y = +m[3]; return String(m[2] === "+" ? x + y : m[2] === "-" ? x - y : Math.round(x * y * 1000) / 1000); } },
  };
  const TOOL_NAMES = Object.keys(TOOLS);

  // ---- tasks: ordered need-steps. args(v) builds args from earlier results v[id]. fb = fallback tool. ----
  const TASKS = {
    birthday: {
      name: "Days until my birthday, plus 3", goal: "How many days until my birthday, plus 3?",
      steps: [
        { id: "b", tool: "lookup", args: () => ["birthday"], why: "I need to know the birthday date" },
        { id: "t", tool: "clock", args: () => [], why: "I need today's date", fb: { tool: "lookup", args: () => ["today"] } },
        { id: "d", tool: "days_between", args: (v) => [v.t, v.b], why: "Now I can count the days between today and the birthday" },
        { id: "r", tool: "add", args: (v) => [v.d, 3], why: "The question says plus 3", fb: { tool: "calc", args: (v) => [`${v.d}+3`] } },
      ],
      answer: (v) => `${v.r} days`,
    },
    tip: {
      name: "A 15% tip on meal plus drink", goal: "How much is a 15% tip on the meal and the drink together?",
      steps: [
        { id: "m", tool: "lookup", args: () => ["meal"], why: "I need the meal price" },
        { id: "k", tool: "lookup", args: () => ["drink"], why: "I need the drink price" },
        { id: "s", tool: "add", args: (v) => [v.m, v.k], why: "Add the two prices", fb: { tool: "calc", args: (v) => [`${v.m}+${v.k}`] } },
        { id: "p", tool: "mul", args: (v) => [v.s, 0.15], why: "15% means times 0.15", fb: { tool: "calc", args: (v) => [`${v.s}*0.15`] } },
      ],
      answer: (v) => `${v.p} dollars`,
    },
    river: {
      name: "How much longer is the Nile?", goal: "How much longer is the Nile than the Amazon, in km?",
      steps: [
        { id: "n", tool: "lookup", args: () => ["nile"], why: "I need the Nile's length" },
        { id: "a", tool: "lookup", args: () => ["amazon"], why: "I need the Amazon's length" },
        { id: "x", tool: "sub", args: (v) => [v.n, v.a], why: "Subtract to find the difference", fb: { tool: "calc", args: (v) => [`${v.n}-${v.a}`] } },
      ],
      answer: (v) => `${v.x} km`,
    },
  };

  // modes: "ok" works, "broken" always errors, "flaky" errors on its first call only
  function makeAgent(taskId, modes = {}, maxTurns = 8) {
    const task = TASKS[taskId], vals = {}, calls = {}, tries = {}, usedFb = {};
    const A = { task, turns: [], done: false, outcome: null, answer: null, vals };
    function callTool(tool, args) {
      calls[tool] = (calls[tool] || 0) + 1;
      const m = modes[tool] || "ok";
      if (m === "broken" || (m === "flaky" && calls[tool] === 1)) return { ok: false, text: `Error: the ${tool} tool is not working` };
      try { return { ok: true, text: TOOLS[tool].run(args) }; } catch (e) { return { ok: false, text: "Error: " + e.message }; }
    }
    A.step = function () {
      if (A.done) return null;
      const n = A.turns.length + 1;
      if (n > maxTurns) { A.done = true; A.outcome = "budget"; const t = { n, thought: "I am out of turns. I must stop.", action: null, observation: null, final: "I ran out of turns without an answer." }; A.turns.push(t); return t; }
      const st = task.steps.find((s) => !(s.id in vals));
      if (!st) { A.done = true; A.outcome = "solved"; A.answer = task.answer(vals); const t = { n, thought: "I have everything I need.", action: null, observation: null, final: A.answer }; A.turns.push(t); return t; }
      const last = A.turns[A.turns.length - 1], failedLast = last && last.action && last.failed && last.stepId === st.id;
      let tool = st.tool, argf = st.args, thought = st.why + ".";
      if (failedLast) {
        tries[st.id] = (tries[st.id] || 0) + 1;
        if (tries[st.id] === 1 && !usedFb[st.id]) thought = `That failed. Maybe it was a hiccup, so I will try ${st.tool} once more.`;
        else if (st.fb && !usedFb[st.id]) { usedFb[st.id] = true; tool = st.fb.tool; argf = st.fb.args; thought = `${st.tool} keeps failing. I will get the same thing another way, with ${tool}.`; }
        else { A.done = true; A.outcome = "stuck"; const t = { n, thought: `I tried ${st.tool}${st.fb ? " and my backup" : ""} and I have no other way to get this. I should not make up an answer.`, action: null, observation: null, final: "Sorry, I could not finish: a tool I need is broken." }; A.turns.push(t); return t; }
      } else if (usedFb[st.id]) { tool = st.fb.tool; argf = st.fb.args; thought = `Using my backup: ${tool}.`; }
      const args = argf(vals), obs = callTool(tool, args);
      const t = { n, thought, action: { tool, args }, observation: obs.text, failed: !obs.ok, stepId: st.id };
      if (obs.ok) vals[st.id] = obs.text;
      A.turns.push(t); return t;
    };
    A.run = function () { let g = 0; while (!A.done && g++ < 50) A.step(); return A; };
    return A;
  }
  const core = { TOOLS, TOOL_NAMES, TASKS, makeAgent, FACTS };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.AgentLoopCore = core;
})(typeof window !== "undefined" ? window : globalThis);
