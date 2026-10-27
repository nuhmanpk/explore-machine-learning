// Spam filter core: seeded message generator + a real Naive Bayes text classifier (Laplace smoothing, log-odds).
// Pure logic; runs in Node and the browser.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const shuffle = (r, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---- word lists (all harmless) ----
  const SP = {
    free: ["FREE", "free", "FREE", "Free"], prize: ["candy", "prize", "toys", "gift", "cash", "voucher", "bonus", "money", "stickers"],
    act: ["click", "claim", "grab", "hurry", "buy"], now: ["now", "today", "fast", "here"], adj: ["super", "limited", "cheap", "mega", "special"],
    won: ["won", "winner", "win"], deal: ["deal", "offer", "sale"],
  };
  const spamT = [
    (r) => `${pick(r, SP.free)} ${pick(r, SP.prize)}! ${pick(r, SP.act)} ${pick(r, SP.now)}!!!`,
    (r) => `You ${pick(r, SP.won)} a ${pick(r, SP.free)} ${pick(r, SP.prize)}! ${pick(r, SP.act)} ${pick(r, SP.now)}`,
    (r) => `${pick(r, SP.act)} ${pick(r, SP.now)} for ${pick(r, SP.adj)} ${pick(r, SP.deal)} on ${pick(r, SP.prize)}!!`,
    (r) => `WOW ${pick(r, SP.adj)} ${pick(r, SP.deal)}: ${pick(r, SP.free)} ${pick(r, SP.prize)} and ${pick(r, SP.prize)}! ${pick(r, SP.act)}!`,
    (r) => `${pick(r, SP.won)} ${pick(r, SP.prize)} ${pick(r, SP.now)}! ${pick(r, SP.act)} the link ${pick(r, SP.free)}!!!`,
    (r) => `${pick(r, SP.adj)} ${pick(r, SP.prize)} ${pick(r, SP.deal)}, ${pick(r, SP.act)} ${pick(r, SP.now)}! ${pick(r, SP.free)} ${pick(r, SP.prize)}`,
  ];
  const NM = {
    place: ["football practice", "the library", "the park", "school", "the bus stop", "art club", "swimming class"],
    when: ["tomorrow", "on Monday", "after lunch", "at four", "this weekend"],
    thing: ["your math book", "a ball", "the picnic blanket", "your bike", "the board game", "your drawing", "some pizza"],
    who: ["Mom", "Grandma", "my teacher", "Dad", "my sister", "the coach"],
    hw: ["homework", "reading", "science project", "spelling list", "maths sheet"],
    ev: ["the birthday party", "the sleepover", "movie night", "the school trip", "the picnic"],
  };
  const normT = [
    (r) => `See you at ${pick(r, NM.place)} ${pick(r, NM.when)}`,
    (r) => `Can you bring ${pick(r, NM.thing)} to ${pick(r, NM.ev)}?`,
    (r) => `${pick(r, NM.who)} says dinner is at six`,
    (r) => `Did you finish the ${pick(r, NM.hw)}?`,
    (r) => `Thanks for helping with the ${pick(r, NM.hw)}, see you ${pick(r, NM.when)}`,
    (r) => `${pick(r, NM.who)} will pick us up after ${pick(r, NM.place)}`,
    (r) => `Do you want to play at the park ${pick(r, NM.when)}?`,
    (r) => `I left ${pick(r, NM.thing)} at ${pick(r, NM.place)}, can you check?`,
    (r) => `Happy birthday! See you at ${pick(r, NM.ev)}`,
  ];
  // sneaky-ish spam that hides inside friendly words
  spamT.push((r) => `${pick(r, normT)(r)} ${pick(r, SP.free)} ${pick(r, SP.prize)} ${pick(r, SP.act)}!`);
  spamT.push((r) => `${pick(r, normT)(r)} ${pick(r, SP.act)} ${pick(r, SP.now)} for ${pick(r, SP.deal)}`);
  // normal messages that happen to use "spammy" words
  const topicT = [
    (r) => `Is the pool free after ${pick(r, NM.place)}?`,
    (r) => `Did our team win the game ${pick(r, NM.when)}?`,
    (r) => `${pick(r, NM.who)} got free candy for ${pick(r, NM.ev)}`,
    (r) => `The book sale is today at the library, can you come?`,
    (r) => `Click the class page and read the ${pick(r, NM.hw)}`,
    (r) => `Our winner was Sam! See you at ${pick(r, NM.ev)}`,
    (r) => `I have free time ${pick(r, NM.when)}, want to play now?`,
    (r) => `Can you bring a gift for ${pick(r, NM.ev)}? Thanks!`,
    (r) => `Hurry, the bus leaves now! Bring ${pick(r, NM.thing)}`,
  ];
  // sneaky: misspellings (leet) + swapped words, diluted with friendly words
  const SWAP = { free: ["gratis", "freebie", "frree"], candy: ["sweets", "choc0late", "lollies"], prize: ["reward", "treasure", "jackpot"], click: ["tap", "press", "visit"], now: ["rn", "asap", "immediately"], gift: ["present", "surprise"], cash: ["coins", "dollars"], win: ["score", "earn"], won: ["earned", "scored"], winner: ["champ", "lucky one"], toys: ["gadgets", "games"], money: ["funds", "coins"], claim: ["collect", "redeem"], hurry: ["quick", "dash"], deal: ["bargain", "steal"], offer: ["promo", "special"], sale: ["promo", "bargain"], bonus: ["extra", "perk"], voucher: ["coupon", "ticket"], buy: ["purchase", "order"], cheap: ["low price", "tiny price"], fast: ["quickly", "soon"], here: ["below", "inside"], today: ["tonight", "this hour"], stickers: ["decals", "badges"], super: ["ultra", "extra"], limited: ["rare", "few left"], mega: ["huge", "giant"], special: ["exclusive", "vip"], grab: ["get", "snag"], wow: ["whoa", "omg"] };
  const LEET = { a: "4", e: "3", i: "1", o: "0", s: "5" };
  function leet(r, w) {
    const l = w.toLowerCase(); let out = "", ch = false;
    for (const c of l) { if (LEET[c] && r() < 0.6) { out += LEET[c]; ch = true; } else out += c; }
    if (!ch) out = l.slice(0, 1) + "_" + l.slice(1);
    return out;
  }
  const FRIENDLY = ["hello friend", "hope you are well", "hi there", "hey buddy", "see you soon"];
  function sneaky(r, text) {
    const base = text.replace(/!+/g, "").replace(/[,:]/g, "");
    const out = base.split(/\s+/).map((w) => {
      const k = w.toLowerCase();
      if (SWAP[k]) return r() < 0.55 ? pick(r, SWAP[k]) : leet(r, w);
      return w;
    });
    let s = out.join(" ");
    if (r() < 0.7) s = pick(r, FRIENDLY) + ", " + s;
    return s.replace(/^./, (c) => c.toUpperCase());
  }

  function make(r, kind) {
    if (kind === "spam") return pick(r, spamT)(r);
    if (kind === "sneaky") return sneaky(r, pick(r, spamT)(r));
    if (kind === "topic") return pick(r, topicT)(r);
    return pick(r, normT)(r);
  }
  // n messages, half spam; kinds: [spamKind, normalKind]
  function batch(seed, n, kinds, startId) {
    const r = rng(seed), out = [], seen = new Set();
    let tries = 0;
    for (let i = 0; i < n; i++) {
      const spam = i % 2 === 0, kind = spam ? kinds[0] : kinds[1];
      let t; do { t = make(r, kind); tries++; } while (seen.has(t) && tries < n * 30);
      seen.add(t);
      out.push({ id: (startId || 0) + i, text: t, spam, kind });
    }
    return shuffle(r, out).map((m, i) => ({ ...m, id: (startId || 0) + i }));
  }
  const MODES = { plain: ["spam", "normal"], sneaky: ["sneaky", "normal"], topic: ["spam", "topic"] };
  const pile = (seed, n) => batch(seed, n == null ? 60 : n, MODES.plain, 0);
  const extras = (seed, mode, n, startId) => batch(seed, n == null ? 12 : n, MODES[mode], startId);
  const testSet = (seed, mode, n) => batch(seed, n == null ? 40 : n, MODES[mode], 0);

  // ---- Naive Bayes (multinomial, Laplace smoothing) ----
  const tokenize = (t) => (String(t).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1);
  class NaiveBayes {
    constructor() { this.reset(); }
    reset() { this.s = new Map(); this.f = new Map(); this.ts = 0; this.tf = 0; this.ns = 0; this.nf = 0; this.V = 0; }
    learn(tokens, spam, sign) {
      sign = sign || 1;
      const m = spam ? this.s : this.f, o = spam ? this.f : this.s;
      for (const w of tokens) {
        const before = (m.get(w) || 0) + (o.get(w) || 0);
        const c = (m.get(w) || 0) + sign;
        if (c > 0) m.set(w, c); else m.delete(w);
        const after = (m.get(w) || 0) + (o.get(w) || 0);
        if (before === 0 && after > 0) this.V++; else if (before > 0 && after === 0) this.V--;
        if (spam) this.ts += sign; else this.tf += sign;
      }
      if (spam) this.ns += sign; else this.nf += sign;
    }
    known(w) { return this.s.has(w) || this.f.has(w); }
    // log-odds that word w points at spam (positive) or fine (negative)
    wordScore(w) {
      return Math.log(((this.s.get(w) || 0) + 1) / (this.ts + this.V)) - Math.log(((this.f.get(w) || 0) + 1) / (this.tf + this.V));
    }
    prior() { return Math.log((this.ns + 1) / (this.nf + 1)); }
    explain(text) {
      const items = tokenize(text).map((w) => ({ w, known: this.known(w), score: this.known(w) ? this.wordScore(w) : 0 }));
      const prior = this.prior(), total = prior + items.reduce((a, b) => a + b.score, 0);
      return { prior, items, total, prob: 1 / (1 + Math.exp(-total)) };
    }
    prob(text) { return this.explain(text).prob; }
    words() { const set = new Set([...this.s.keys(), ...this.f.keys()]); return [...set].map((w) => ({ w, score: this.wordScore(w) })); }
  }
  function evaluate(nb, set) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const m of set) { const p = nb.prob(m.text) > 0.5; if (m.spam) p ? tp++ : fn++; else p ? fp++ : tn++; }
    const n = set.length;
    return { acc: n ? (tp + tn) / n : 0, tp, fp, fn, tn, falseAlarms: fp, misses: fn, precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0 };
  }
  const core = { rng, tokenize, NaiveBayes, evaluate, pile, extras, testSet, MODES };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.SpamCore = core;
})(typeof window !== "undefined" ? window : globalThis);
