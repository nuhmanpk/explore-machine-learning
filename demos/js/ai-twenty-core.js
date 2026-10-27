// Mind Reader (20 questions) — pick the question that splits the animals best.
// No DOM, so it runs in Node too. This is SEARCH + INFORMATION, not machine learning: nothing is learned.
//
// Each animal has yes/no traits. The AI keeps a "belief" (a weight per animal). A good question splits the
// belief about 50/50, because then either answer throws away half the possibilities (1 bit of information).
(function (root) {
  const QUESTIONS = [
    { k: "water", q: "Does it live in water?" },
    { k: "fly", q: "Can it fly?" },
    { k: "fur", q: "Does it have fur?" },
    { k: "four", q: "Does it walk on four legs?" },
    { k: "big", q: "Is it bigger than a dog?" },
    { k: "meat", q: "Does it eat meat?" },
    { k: "pet", q: "Do people keep it as a pet?" },
    { k: "eggs", q: "Does it lay eggs?" },
    { k: "feathers", q: "Does it have feathers?" },
    { k: "farm", q: "Does it live on a farm?" },
    { k: "swim", q: "Can it swim?" },
    { k: "spots", q: "Does it have stripes or spots?" },
    { k: "night", q: "Is it awake at night?" },
    { k: "danger", q: "Is it dangerous?" },
    { k: "hot", q: "Does it live somewhere hot?" },
    { k: "long", q: "Does it have something very long (neck, trunk or body)?" },
    { k: "horns", q: "Does it have horns or tusks?" },
  ];
  const A = (e, n, t) => ({ e, n, t: t.split(" ") });
  const ANIMALS = [
    A("🐕", "dog", "fur four meat pet swim"),
    A("🐈", "cat", "fur four meat pet night"),
    A("🐄", "cow", "fur four big farm horns spots"),
    A("🐖", "pig", "four farm swim"),
    A("🐎", "horse", "fur four big farm"),
    A("🐑", "sheep", "fur four farm horns"),
    A("🐔", "chicken", "feathers eggs farm"),
    A("🦆", "duck", "feathers eggs farm swim fly"),
    A("🐇", "rabbit", "fur four pet"),
    A("🐹", "hamster", "fur four pet night"),
    A("🐠", "goldfish", "water swim eggs pet"),
    A("🦈", "shark", "water swim eggs meat danger big"),
    A("🐬", "dolphin", "water swim meat big"),
    A("🐋", "whale", "water swim big"),
    A("🐸", "frog", "water swim eggs"),
    A("🐢", "turtle", "swim eggs four pet"),
    A("🐍", "snake", "eggs meat danger long"),
    A("🐊", "crocodile", "water swim eggs meat danger four big hot"),
    A("🦁", "lion", "fur four big meat danger hot"),
    A("🐅", "tiger", "fur four big meat danger spots hot swim"),
    A("🐘", "elephant", "four big long horns hot swim"),
    A("🦒", "giraffe", "four big long spots hot"),
    A("🦓", "zebra", "fur four big spots hot"),
    A("🐒", "monkey", "fur four hot long"),
    A("🐻", "bear", "fur four big meat danger swim"),
    A("🐺", "wolf", "fur four meat danger night"),
    A("🦉", "owl", "feathers fly eggs meat night"),
    A("🦅", "eagle", "feathers fly eggs meat"),
    A("🐧", "penguin", "feathers eggs swim water"),
    A("🦜", "parrot", "feathers fly eggs pet hot"),
    A("🦇", "bat", "fly fur night"),
    A("🦋", "butterfly", "fly eggs spots"),
    A("🦘", "kangaroo", "fur big hot"),
    A("🐪", "camel", "fur four big hot long"),
    A("🐼", "panda", "fur four big spots"),
    A("🦌", "deer", "fur four horns"),
    A("🦊", "fox", "fur four meat night"),
    A("🐙", "octopus", "water swim meat"),
  ];
  const M = ANIMALS.map((a) => QUESTIONS.map((q) => a.t.includes(q.k)));
  const N = ANIMALS.length;
  const MISS = 0.06; // a "wrong" answer shrinks an animal's weight a lot, but not to zero (people make mistakes)

  const H = (p) => (p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)));
  const fresh = () => Array(N).fill(1 / N);
  const normalise = (w) => { const s = w.reduce((a, v) => a + v, 0) || 1; return w.map((v) => v / s); };

  // Every unasked question, with how the animals would split and how much we'd learn (bits). Sorted best first.
  function score(w, asked) {
    const total = w.reduce((a, v) => a + v, 0);
    const out = [];
    for (let q = 0; q < QUESTIONS.length; q++) {
      if (asked.includes(q)) continue;
      let yes = 0, yesN = 0, noN = 0;
      for (let a = 0; a < N; a++) {
        if (w[a] < 0.02 / N) continue; // practically ruled out: don't count
        if (M[a][q]) { yes += w[a]; yesN++; } else noN++;
      }
      out.push({ q, pYes: yes / total, yesN, noN, bits: H(yes / total) });
    }
    return out.sort((x, y) => y.bits - x.bits);
  }

  // mode "smart": the question with the most information. "random": any question that isn't useless.
  function pick(w, asked, mode, rnd) {
    const sc = score(w, asked).filter((s) => s.bits > 0.02);
    if (!sc.length) return null;
    if (mode === "random") return sc[Math.floor((rnd || Math.random)() * sc.length)].q;
    return sc[0].q;
  }

  function update(w, q, ans) {
    return normalise(w.map((v, a) => v * (M[a][q] === ans ? 1 : MISS)));
  }

  const top = (w) => { let b = 0; for (let a = 1; a < N; a++) if (w[a] > w[b]) b = a; return b; };
  const entropy = (w) => -w.reduce((a, p) => a + (p > 0 ? p * Math.log2(p) : 0), 0); // bits of "not sure yet"

  // Play one whole game against a secret animal, answering truthfully. Returns questions asked and whether it guessed right.
  function play(secret, mode, rnd) {
    let w = fresh();
    const asked = [];
    while (true) {
      const t = top(w);
      if (w[t] >= 0.8 || asked.length >= 20) return { n: asked.length, ok: t === secret };
      const q = pick(w, asked, mode, rnd);
      if (q === null) return { n: asked.length, ok: t === secret };
      asked.push(q);
      w = update(w, q, M[secret][q]);
    }
  }
  function simulate(mode, rnd) {
    let n = 0, ok = 0;
    for (let a = 0; a < N; a++) { const r = play(a, mode, rnd); n += r.n; ok += r.ok ? 1 : 0; }
    return { avg: n / N, acc: ok / N };
  }

  const api = { QUESTIONS, ANIMALS, M, N, fresh, score, pick, update, top, entropy, play, simulate, H };
  root.AITwenty = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
