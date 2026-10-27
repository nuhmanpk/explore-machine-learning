// Planning core: STRIPS-style actions (preconditions, adds, deletes, cost). Greedy next-step agent vs a planner
// (uniform-cost search over states, then a topological order of its dependencies). Pure logic; Node + browser.
(function (root) {
  const A = (id, name, cost, pre, add, del) => ({ id, name, cost, pre, add, del: del || [] });
  function moves(places, dist) {
    const out = [];
    for (const a of places) for (const b of places) if (a !== b) out.push(A(`go_${a}_${b}`, `Go ${a} to ${b}`, dist[[a, b].sort().join("-")], [`at_${a}`], [`at_${b}`], [`at_${a}`]));
    return out;
  }
  const TASKS = {
    sandwich: {
      name: "Make a sandwich", goal: ["full"], init: ["bread_left"],
      actions: [
        A("fetch_bread", "Fetch the bread", 1, ["bread_left"], ["bread"], ["bread_left"]),
        A("feed_ducks", "Feed the bread to the ducks", 1, ["bread"], ["ducks_happy"], ["bread"]),
        A("wipe_table", "Wipe the table", 1, [], ["clean_table"]),
        A("hum_song", "Hum a song", 1, [], ["happy"]),
        A("slice_bread", "Slice the bread", 1, ["bread"], ["slices"]),
        A("toast_bread", "Toast the bread slowly", 3, ["bread"], ["slices"]),
        A("get_butter", "Get the butter", 2, [], ["butter"]),
        A("get_cheese", "Get the cheese", 2, [], ["filling"]),
        A("get_ham", "Get the ham", 3, [], ["filling"]),
        A("butter_slices", "Butter the slices", 1, ["slices", "butter"], ["buttered"]),
        A("assemble", "Build the sandwich", 1, ["buttered", "filling"], ["sandwich"]),
        A("eat", "Eat it", 1, ["sandwich"], ["full"]),
      ],
    },
    parcel: {
      name: "Deliver a parcel", goal: ["delivered"], init: ["at_home"],
      actions: [].concat(
        moves(["home", "depot", "shop", "friend"], { "depot-home": 5, "home-shop": 2, "friend-home": 4, "depot-shop": 6, "depot-friend": 3, "friend-shop": 5 }),
        [A("chat", "Chat with the neighbour", 1, ["at_home"], ["chatted"]),
          A("get_parcel", "Pick up the parcel", 1, ["at_depot"], ["parcel"]),
          A("buy_stamp", "Buy a stamp", 1, ["at_shop"], ["stamp"]),
          A("pack", "Stick the stamp on the parcel", 1, ["parcel", "stamp"], ["packed"]),
          A("give", "Hand it to your friend", 1, ["at_friend", "packed"], ["delivered"])]),
    },
  };
  const ok = (s, a) => a.pre.every((f) => s.has(f));
  const next = (s, a) => { const n = new Set(s); a.del.forEach((f) => n.delete(f)); a.add.forEach((f) => n.add(f)); return n; };
  const key = (s) => [...s].sort().join(",");
  const done = (task, s) => task.goal.every((f) => s.has(f));

  // uniform-cost search (Dijkstra): the cheapest list of actions from `state` to the goal, or null
  function plan(task, state, blocked = new Set()) {
    const start = new Set(state), best = new Map([[key(start), 0]]); let front = [{ s: start, c: 0, p: [] }], expanded = 0;
    while (front.length) {
      let bi = 0; for (let i = 1; i < front.length; i++) if (front[i].c < front[bi].c) bi = i;
      const cur = front.splice(bi, 1)[0]; if (cur.c > best.get(key(cur.s))) continue;
      if (done(task, cur.s)) return { actions: cur.p, cost: cur.c, expanded };
      expanded++;
      for (const a of task.actions) {
        if (blocked.has(a.id) || !ok(cur.s, a)) continue;
        const ns = next(cur.s, a), k = key(ns), c = cur.c + a.cost;
        if (!best.has(k) || c < best.get(k)) { best.set(k, c); front.push({ s: ns, c, p: cur.p.concat(a) }); }
      }
    }
    return null;
  }
  // topological order of a plan: an action must come after the earlier action that supplies a fact it needs
  function dependencies(task, actions, init) {
    const have = new Set(init || task.init), edges = [], made = {};
    for (const a of actions) { for (const f of a.pre) if (made[f]) edges.push([made[f], a.id]); a.add.forEach((f) => (made[f] = a.id)); }
    return edges;
  }
  function topoOrder(actions, edges) { // Kahn; stable by original order
    const ids = actions.map((a) => a.id), indeg = Object.fromEntries(ids.map((i) => [i, 0])), out = [];
    edges.forEach(([, b]) => indeg[b]++); const q = ids.filter((i) => !indeg[i]);
    while (q.length) { const n = q.shift(); out.push(n); edges.filter((e) => e[0] === n).forEach((e) => { if (--indeg[e[1]] === 0) q.push(e[1]); }); }
    return out;
  }
  // greedy: cheapest applicable action that adds something new and has not been tried; ties by listing order
  function greedyNext(task, state, tried, blocked) {
    let best = null;
    for (const a of task.actions) {
      if (blocked.has(a.id) || tried.has(a.id) || !ok(state, a) || a.add.every((f) => state.has(f))) continue;
      if (!best || a.cost < best.cost) best = a;
    }
    return best;
  }

  class Runner {
    constructor(taskId, mode, broken = []) { this.task = TASKS[taskId]; this.mode = mode; this.broken = new Set(broken); this.known = new Set(); this.reset(); }
    reset() { this.state = new Set(this.task.init); this.cost = 0; this.log = []; this.tried = new Set(); this.status = "running"; this.known = new Set(); this.plan = null; this.pi = 0; this.needReplan = false; if (this.mode === "plan") this.makePlan(); }
    makePlan() { const p = plan(this.task, this.state, this.known); this.plan = p ? p.actions : null; this.planCost = p ? p.cost : null; this.pi = 0; this.needReplan = false; if (!p) { this.status = "stuck"; this.log.push({ type: "stuck", text: "No plan reaches the goal from here." }); } else if (this.log.length) this.log.push({ type: "replan", text: `New plan: ${p.actions.length} steps, cost ${p.cost}.` }); }
    replan() { if (this.mode === "plan" && this.status === "running") this.makePlan(); }
    step() {
      if (this.status !== "running" || this.needReplan) return null;
      if (done(this.task, this.state)) { this.status = "done"; this.log.push({ type: "done", text: "Goal reached!" }); return this.log[this.log.length - 1]; }
      const a = this.mode === "plan" ? this.plan[this.pi] : greedyNext(this.task, this.state, this.tried, this.known);
      if (!a) { this.status = "stuck"; const e = { type: "stuck", text: "Stuck: no useful step left, and the goal is not reached." }; this.log.push(e); return e; }
      this.tried.add(a.id); this.cost += a.cost;
      if (this.broken.has(a.id)) { this.known.add(a.id); const e = { type: "fail", action: a, text: `${a.name}: FAILED (cost ${a.cost} wasted)` }; this.log.push(e); if (this.mode === "plan") this.needReplan = true; return e; }
      this.state = next(this.state, a); this.pi++;
      const e = { type: "act", action: a, text: `${a.name} (cost ${a.cost})` }; this.log.push(e);
      if (done(this.task, this.state)) { this.status = "done"; this.log.push({ type: "done", text: "Goal reached!" }); }
      return e;
    }
    run(autoReplan = false) { let g = 0; while (this.status === "running" && g++ < 200) { if (this.needReplan) { if (!autoReplan) break; this.replan(); continue; } this.step(); } return this; }
  }
  const core = { TASKS, plan, dependencies, topoOrder, greedyNext, Runner, done };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.AgentPlanCore = core;
})(typeof window !== "undefined" ? window : globalThis);
