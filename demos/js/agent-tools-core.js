// Tool router core: a real bag-of-words Naive Bayes that learns which tool a request needs, plus four toy tools.
// Pure logic; Node + browser.
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const TOOLS = ["calculator", "clock", "lookup", "none"];
  const NOW = "3:45 pm on Monday, 10 March";
  const TABLE = { france: "Paris is the capital of France.", everest: "Mount Everest is 8,849 metres tall.", hamlet: "Hamlet was written by William Shakespeare.", spider: "A spider has 8 legs.", moon: "The Moon is about 384,000 km away.", whale: "A blue whale can be 30 metres long.", sahara: "The Sahara is the biggest hot desert.", tokyo: "Tokyo is the capital of Japan." };
  const KEYS = Object.keys(TABLE);

  function tokenize(s) {
    return (String(s).toLowerCase().replace(/(\d+(\.\d+)?)/g, " <num> ").replace(/[+\-*\/×÷x](?=\s*<num>|\s*\d)/g, " <op> ").match(/<num>|<op>|[a-z]+/g) || []);
  }
  // real, tiny tools. Return {ok, out}
  function runTool(tool, text) {
    if (tool === "calculator") {
      const nums = (text.match(/\d+(\.\d+)?/g) || []).map(Number);
      if (nums.length < 2) return { ok: false, out: "Calculator error: I need two numbers and found " + nums.length + "." };
      const t = text.toLowerCase(); let v, w;
      if (/\*|×|\btimes\b|multipl|\bx\b/.test(t)) { v = nums[0] * nums[1]; w = "times"; }
      else if (/\/|÷|divid|\bshare\b/.test(t)) { v = nums[0] / nums[1]; w = "divided by"; }
      else if (/-|minus|take away|subtract|less/.test(t)) { v = nums[0] - nums[1]; w = "minus"; }
      else { v = nums[0] + nums[1]; w = "plus"; }
      return { ok: true, out: `${nums[0]} ${w} ${nums[1]} = ${Math.round(v * 100) / 100}` };
    }
    if (tool === "clock") return { ok: true, out: "It is " + NOW + "." };
    if (tool === "lookup") { const k = tokenize(text).find((w) => w in TABLE); return k ? { ok: true, out: TABLE[k] } : { ok: false, out: "Lookup error: nothing in the table matches that." }; }
    return { ok: true, out: "(no tool) Just chatting: " + CHAT[text.length % CHAT.length] };
  }
  const CHAT = ["Happy to help!", "That sounds fun!", "Hello, friend!", "Tell me more!"];

  const T = {
    calculator: [(r) => `what is ${r() * 90 + 3 | 0} plus ${r() * 40 + 2 | 0}`, (r) => `${r() * 50 + 2 | 0} * ${r() * 12 + 2 | 0}`, (r) => `how much is ${r() * 80 + 10 | 0} minus ${r() * 9 + 1 | 0}`, (r) => `add ${r() * 30 + 1 | 0} and ${r() * 30 + 1 | 0}`, (r) => `multiply ${r() * 12 + 2 | 0} by ${r() * 12 + 2 | 0}`, (r) => `what is ${(r() * 9 + 1 | 0) * 10} divided by ${pick(r, [2, 5, 10])}`],
    clock: [() => "what time is it", () => "what is the date today", () => "tell me the time now", () => "what day is it today", () => "is it afternoon yet, what time is it", () => "what is the time right now"],
    lookup: [(r) => `what is the capital of ${pick(r, ["France", "Japan"])}`, () => "how tall is Mount Everest", () => "who wrote Hamlet", () => "how many legs does a spider have", () => "how far away is the Moon", () => "how long is a whale", (r) => `tell me about the ${pick(r, ["Sahara", "Moon", "Everest"])}`],
    none: [() => "tell me a joke", () => "hello there robo", () => "thanks, you are great", () => "you are so funny", () => "i feel a bit sad today", () => "let us just chat", () => "good morning"],
  };
  function requests(seed, n) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) { const tool = TOOLS[i % 4], text = pick(r, T[tool])(r); out.push({ id: i, text, tool }); }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out.map((q, i) => ({ ...q, id: i }));
  }

  class Router {
    constructor() { this.reset(); }
    reset() { this.n = { calculator: 0, clock: 0, lookup: 0, none: 0 }; this.w = {}; for (const t of TOOLS) this.w[t] = new Map(); this.tot = { calculator: 0, clock: 0, lookup: 0, none: 0 }; this.vocab = new Set(); }
    learn(text, tool, sign = 1) {
      this.n[tool] += sign;
      for (const w of tokenize(text)) { this.w[tool].set(w, (this.w[tool].get(w) || 0) + sign); this.tot[tool] += sign; this.vocab.add(w); }
    }
    count() { return TOOLS.reduce((s, t) => s + this.n[t], 0); }
    scores(text) {
      const V = this.vocab.size + 1, N = this.count(), ws = tokenize(text).filter((w) => this.vocab.has(w));
      return TOOLS.map((t) => { let s = Math.log((this.n[t] + 1) / (N + 4)); for (const w of ws) s += Math.log(((this.w[t].get(w) || 0) + 1) / (this.tot[t] + V)); return s; });
    }
    predict(text) {
      const s = this.scores(text), mx = Math.max(...s), e = s.map((x) => Math.exp(x - mx)), z = e.reduce((a, b) => a + b, 0);
      const probs = e.map((x) => x / z); let b = 0; probs.forEach((p, i) => { if (p > probs[b] + 1e-9) b = i; });
      return { tool: TOOLS[b], probs, conf: probs[b] };
    }
    explain(text) { // per-word log-odds for the chosen tool vs the runner-up
      const p = this.predict(text), order = p.probs.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]), A = TOOLS[order[0][1]], B = TOOLS[order[1][1]], V = this.vocab.size + 1;
      return { top: A, second: B, words: tokenize(text).filter((w) => this.vocab.has(w)).map((w) => ({ w, v: Math.log(((this.w[A].get(w) || 0) + 1) / (this.tot[A] + V)) - Math.log(((this.w[B].get(w) || 0) + 1) / (this.tot[B] + V)) })) };
    }
  }
  function evaluate(router, set) {
    let ok = 0; const wrong = [];
    for (const q of set) { const p = router.predict(q.text); if (p.tool === q.tool) ok++; else wrong.push({ q, picked: p.tool, result: runTool(p.tool, q.text) }); }
    return { acc: set.length ? ok / set.length : 0, ok, n: set.length, wrong };
  }
  const core = { rng, TOOLS, tokenize, runTool, requests, Router, evaluate, TABLE, KEYS, NOW };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.AgentToolsCore = core;
})(typeof window !== "undefined" ? window : globalThis);
