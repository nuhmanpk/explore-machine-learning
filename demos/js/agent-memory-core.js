// Agent memory core: a conversation, a word-limited context window, and three memory strategies
// (keep-last-N, extractive summary, TF-IDF retrieval). The "reader" that answers from context is a
// transparent keyword matcher (a toy stand-in for a language model). Pure logic; Node + browser.
(function (root) {
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const FACTS = [
    { key: "dog", kw: ["dog"], say: ["My dog is called {v}.", "We got a puppy and named our dog {v}."], q: "What is my dog called?", values: ["Biscuit", "Nugget", "Pepper", "Waffles", "Mango", "Toast"] },
    { key: "city", kw: ["live", "moved"], say: ["I live in {v}.", "We moved to {v} last year, so now I live there."], q: "Which city do I live in?", values: ["Lisbon", "Oslo", "Nairobi", "Lima", "Kyoto", "Cairo"] },
    { key: "colour", kw: ["colour"], say: ["My favourite colour is {v}.", "Honestly my best colour is {v}."], q: "What is my favourite colour?", values: ["teal", "orange", "purple", "green", "pink"] },
    { key: "allergy", kw: ["allergic"], say: ["I am allergic to {v}.", "Careful, I am allergic to {v}."], q: "What am I allergic to?", values: ["peanuts", "eggs", "shellfish", "kiwi", "sesame"] },
    { key: "sister", kw: ["sister"], say: ["My little sister is named {v}.", "My sister {v} just learned to ride a bike."], q: "What is my sister called?", values: ["Maya", "Zoe", "Ines", "Nora", "Lila"] },
    { key: "game", kw: ["game"], say: ["My favourite game is {v}.", "I could play the game {v} all day."], q: "What is my favourite game?", values: ["chess", "hopscotch", "tetris", "snap", "bingo"] },
    { key: "bus", kw: ["bus"], say: ["I take bus number {v} to school.", "My bus is number {v}, it comes at eight."], q: "Which bus do I take to school?", values: ["12", "47", "9", "31", "88"] },
    { key: "hobby", kw: ["weekends"], say: ["On weekends I love {v}.", "Most weekends you will find me {v}."], q: "What do I love doing at weekends?", values: ["swimming", "painting", "climbing", "baking", "skating"] },
  ];
  const CHAT = ["haha okay", "that sounds fun", "did you see the match yesterday", "I am so tired today", "what a strange cloud", "lol my cousin sent a meme", "can you believe it is already Friday", "my friend Sam walked her dog and it was so loud", "the soup at lunch was cold", "ok good point", "I watched a movie about space last night", "anyway how are you", "my phone battery died again", "it rained all morning here", "did you walk your dog today", "I need to study for the quiz", "thanks, that helps", "nice weather for a bike ride", "we had pizza and Tom ate three slices", "my teacher gave us a bus route puzzle"];
  const STOP = new Set("a an the is are was were am i my me we our you your it its of to in on at and or for with so that this there then just very really honestly most can will do did does be been as by from not no yes what which who how".split(" "));
  const wc = (s) => (String(s).trim().match(/\S+/g) || []).length;
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(.{3,})s$/, "$1");
  const terms = (s) => (String(s).match(/[A-Za-z0-9']+/g) || []).map((w) => w.replace(/'s$/i, "")).map(norm).filter((w) => w && !STOP.has(w));

  function makeConvo(seed, opts = {}) {
    const r = rng(seed), nT = opts.turns || 40, nF = Math.min(opts.facts || 8, FACTS.length);
    const slots = []; for (let i = 0; i < nT; i++) slots.push(i);
    const early = slots.slice(0, Math.floor(nT * 0.7)), chosen = new Set(); // facts lean early, so a small window forgets them
    while (chosen.size < nF) chosen.add(pick(r, r() < 0.8 ? early : slots));
    const fl = FACTS.map((f) => f).sort(() => r() - 0.5).slice(0, nF), pos = [...chosen].sort((a, b) => a - b);
    const turns = [], questions = []; let fi = 0, ci = Math.floor(r() * CHAT.length);
    for (let i = 0; i < nT; i++) {
      if (pos.includes(i)) { const f = fl[fi++], v = pick(r, f.values), text = pick(r, f.say).replace("{v}", v); turns.push({ id: i, text, fact: f.key }); questions.push({ key: f.key, q: f.q, answer: v, turn: i }); }
      else { turns.push({ id: i, text: CHAT[ci++ % CHAT.length], fact: null }); }
    }
    return { turns, questions };
  }

  // ---- context builders: each returns the turns (ids ascending) or text lines that fit in W words ----
  function lastN(convo, W) {
    const out = []; let used = 0;
    for (let i = convo.turns.length - 1; i >= 0; i--) { const c = wc(convo.turns[i].text); if (used + c > W) break; used += c; out.unshift({ id: i, text: convo.turns[i].text }); }
    return { lines: out, used, strategy: "last" };
  }
  function compress(text) { return String(text).split(/\s+/).filter((w) => !STOP.has(w.toLowerCase().replace(/[^a-z']/g, "")) || /\d/.test(w)).join(" "); }
  function importance(text) { // honest, simple heuristic: names/numbers look important
    const ws = text.split(/\s+/); let s = 0; ws.forEach((w, i) => { if (/\d/.test(w)) s += 2; else if (i > 0 && /^[A-Z]/.test(w)) s += 2; }); return s + terms(text).length * 0.3;
  }
  function summary(convo, W) {
    const rec = lastN(convo, Math.floor(W / 2)), first = rec.lines.length ? rec.lines[0].id : convo.turns.length, budget = W - rec.used;
    const old = convo.turns.slice(0, first).map((t) => ({ id: t.id, text: compress(t.text), score: importance(t.text) })).filter((t) => t.text);
    const ranked = old.slice().sort((a, b) => b.score - a.score || a.id - b.id), keep = []; let used = 0;
    for (const t of ranked) { const c = wc(t.text); if (used + c <= budget) { keep.push(t); used += c; } }
    keep.sort((a, b) => a.id - b.id);
    return { lines: keep.map((t) => ({ id: t.id, text: t.text, summarised: true })).concat(rec.lines), used: used + rec.used, strategy: "summary" };
  }
  function tfidf(convo) { // document frequency over all turns
    const df = new Map(), docs = convo.turns.map((t) => { const ts = terms(t.text); new Set(ts).forEach((w) => df.set(w, (df.get(w) || 0) + 1)); return ts; });
    const N = convo.turns.length, idf = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1;
    const vec = (ts) => { const m = new Map(); ts.forEach((w) => m.set(w, (m.get(w) || 0) + 1)); let n = 0; for (const [w, c] of m) { const v = c * idf(w); m.set(w, v); n += v * v; } return { m, n: Math.sqrt(n) || 1 }; };
    return { vec, docs: docs.map(vec) };
  }
  function cosine(a, b) { let d = 0; for (const [w, v] of a.m) if (b.m.has(w)) d += v * b.m.get(w); return d / (a.n * b.n); }
  function retrieve(convo, W, question, k = 3) {
    const rec = lastN(convo, Math.floor(W / 3)), first = rec.lines.length ? rec.lines[0].id : convo.turns.length, idx = tfidf(convo), qv = idx.vec(terms(question));
    const scored = convo.turns.slice(0, first).map((t, i) => ({ id: t.id, text: t.text, score: cosine(qv, idx.docs[i]) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.id - a.id);
    const keep = []; let used = rec.used;
    for (const s of scored) { if (keep.length >= k) break; const c = wc(s.text); if (used + c <= W) { keep.push(s); used += c; } }
    keep.sort((a, b) => a.id - b.id);
    return { lines: keep.map((s) => ({ id: s.id, text: s.text, retrieved: true, score: s.score })).concat(rec.lines), used, strategy: "retrieve" };
  }
  // toy reader: newest line that mentions a keyword AND contains a value of the right kind
  function read(lines, key) {
    const f = FACTS.find((x) => x.key === key);
    for (let i = lines.length - 1; i >= 0; i--) {
      const low = lines[i].text.toLowerCase();
      if (!f.kw.some((k) => low.includes(k))) continue;
      const v = f.values.find((val) => new RegExp("\\b" + val + "\\b", "i").test(lines[i].text)); if (v) return v;
    }
    return null;
  }
  const STRATS = { last: (c, W) => lastN(c, W), summary: (c, W) => summary(c, W), retrieve: (c, W, q) => retrieve(c, W, q) };
  function ctxFor(strategy, convo, W, q) { return STRATS[strategy](convo, W, q); }
  function evaluate(convo, W) {
    const res = {};
    for (const s of Object.keys(STRATS)) {
      let ok = 0; const per = convo.questions.map((q) => { const ctx = ctxFor(s, convo, W, q.q), got = read(ctx.lines, q.key), good = got === q.answer; if (good) ok++; return { key: q.key, got, good }; });
      res[s] = { score: ok, total: convo.questions.length, per };
    }
    return res;
  }
  const core = { rng, FACTS, wc, terms, makeConvo, lastN, summary, retrieve, read, ctxFor, evaluate, compress };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.AgentMemoryCore = core;
})(typeof window !== "undefined" ? window : globalThis);
