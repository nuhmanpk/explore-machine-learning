// Tune Finisher core: note table, songs, and the n-gram model (counts, backoff prediction, sampling). Pure logic; Node + browser.
(function (root) {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const KEYS = []; // C4..C6
  for (let m = 60; m <= 84; m++) KEYS.push({ midi: m, name: NAMES[m % 12] + (Math.floor(m / 12) - 1), black: NAMES[m % 12].includes("#") });
  const byName = Object.fromEntries(KEYS.map((k) => [k.name, k]));

  const T = (s) => s.trim().split(/\s+/).map((x) => (x.includes(":") ? x : x + ":1"));
  const SONGS = [
    { name: "Twinkle Twinkle", notes: T("C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2") },
    { name: "Mary's Lamb", notes: T("E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:2") },
    { name: "Ode to Joy", notes: T("E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4:2") },
    { name: "Hot Cross Buns", notes: T("E4 D4 C4:2 E4 D4 C4:2 C4 C4 C4 C4 D4 D4 D4 D4 E4 D4 C4:2") },
    { name: "Frère Jacques", notes: T("F4 G4 A4 F4 F4 G4 A4 F4 A4 A#4 C5:2 A4 A#4 C5:2 C5 D5 C5 A#4 A4 F4 C5 D5 C5 A#4 A4 F4 F4 C4 F4:2 F4 C4 F4:2") },
    { name: "London Bridge", notes: T("G4 A4 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4 A4 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:2") },
  ];

  const pitch = (tok) => tok.split(":")[0];
  const dur = (tok) => +tok.split(":")[1];

  function cloneCounts(c) {
    const out = [null];
    for (let k = 1; k <= 3; k++) {
      const m = new Map();
      for (const [ctx, nx] of c[k]) m.set(ctx, new Map([...nx].map(([t, e]) => [t, { n: e.n, from: new Set(e.from) }])));
      out.push(m);
    }
    return out;
  }

  // Next-note probabilities given the history, with backoff to shorter memory.
  function predict(counts, hist, order) {
    for (let k = Math.min(order, hist.length); k >= 1; k--) {
      const ctx = hist.slice(-k).join(" ");
      const m = counts[k].get(ctx);
      if (m && m.size) {
        const tot = [...m.values()].reduce((s, e) => s + e.n, 0);
        const list = [...m].map(([tok, e]) => ({ tok, n: e.n, p: e.n / tot, from: [...e.from] })).sort((a, b) => b.p - a.p);
        return { k, ctx, list, tot };
      }
    }
    // knows nothing: any note equally
    const pool = KEYS.filter((k) => !k.black && k.midi <= 76).map((k) => k.name + ":1");
    return { k: 0, ctx: "", list: pool.map((tok) => ({ tok, n: 0, p: 1 / pool.length, from: [] })), tot: 0 };
  }
  function sample(list, temp, rand = Math.random) {
    const w = list.map((c) => Math.pow(c.p, 1 / temp));
    const s = w.reduce((a, b) => a + b, 0);
    let r = rand() * s;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return { c: list[i], q: w[i] / s }; }
    return { c: list[list.length - 1], q: w[w.length - 1] / s };
  }

  function countLast(counts, win, from) {
    const i = win.length - 1;
    for (let k = 1; k <= 3; k++) {
      if (i - k < 0) continue;
      const ctx = win.slice(i - k, i).join(" ");
      let m = counts[k].get(ctx);
      if (!m) counts[k].set(ctx, (m = new Map()));
      let e = m.get(win[i]);
      if (!e) m.set(win[i], (e = { n: 0, from: new Set() }));
      e.n++;
      e.from.add(from);
    }
  }

  const core = { NAMES, KEYS, byName, SONGS, T, pitch, dur, cloneCounts, predict, sample, countLast };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.TuneCore = core;
})(typeof window !== "undefined" ? window : globalThis);
