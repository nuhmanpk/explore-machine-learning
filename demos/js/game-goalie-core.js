// Goalie vs You — the goalie must dive before the ball is kicked, so the only way to
// save is to learn the kicker's habits. No DOM, so it also runs in Node.
//
// Zones: 0 1 2  (top: left, middle, right)
//        3 4 5  (bottom: left, middle, right)
(function (root) {
  const Z = 6;
  const ZONE_NAMES = ["top-left", "top-middle", "top-right", "bottom-left", "bottom-middle", "bottom-right"];

  // One "clue": counts of where the kicker went next, given some context.
  // Old memories fade (decay), so the goalie can notice when habits change.
  class Clue {
    constructor(id, name, contextFn) {
      this.id = id;
      this.name = name;
      this.contextFn = contextFn; // (history) → context key, or null when there's not enough history
      this.table = new Map();
      this.weight = 1;
    }
    counts(key) {
      let c = this.table.get(key);
      if (!c) { c = new Array(Z).fill(0); this.table.set(key, c); }
      return c;
    }
    predict(h) {
      const key = this.contextFn(h);
      if (key === null) return { key, p: new Array(Z).fill(1 / Z), n: 0 };
      const c = this.counts(key);
      const n = c.reduce((a, b) => a + b, 0);
      const p = c.map((v) => (v + 0.3) / (n + 0.3 * Z));
      return { key, p, n };
    }
    learn(h, zone, decay) {
      const key = this.contextFn(h);
      if (key === null) return;
      const c = this.counts(key);
      for (let i = 0; i < Z; i++) c[i] *= decay;
      c[zone] += 1;
    }
  }

  // h = history: array of { zone, dive, scored }
  const last = (h, k) => h[h.length - k];
  function makeClues() {
    return [
      new Clue("fav", "your favourite spots", () => "all"),
      new Clue("after1", "what you do after your last kick", (h) => (h.length >= 1 ? last(h, 1).zone : null)),
      new Clue("after2", "your last two kicks", (h) => (h.length >= 2 ? last(h, 2).zone * Z + last(h, 1).zone : null)),
      new Clue("dive", "where I dived last time", (h) => (h.length >= 1 ? "d" + last(h, 1).dive : null)),
      new Clue("result", "what you do after you score or miss", (h) => (h.length >= 1 ? last(h, 1).zone + (last(h, 1).scored ? "s" : "m") : null)),
    ];
  }

  class Goalie {
    constructor(opts = {}) {
      this.decay = opts.decay ?? 0.93; // how fast old habits are forgotten
      this.eta = opts.eta ?? 0.6; // how fast it changes which clue it trusts
      this.clues = makeClues();
      this.history = [];
    }
    // Mix every clue's guess, trusting clues that have been right lately.
    belief() {
      const preds = this.clues.map((c) => c.predict(this.history));
      const W = this.clues.reduce((a, c) => a + c.weight, 0);
      const p = new Array(Z).fill(0);
      this.clues.forEach((c, i) => preds[i].p.forEach((v, z) => (p[z] += (c.weight / W) * v)));
      return { p, preds };
    }
    chooseDive() {
      const { p } = this.belief();
      // Several spots tied (e.g. before any kicks)? Pick one of them at random.
      const max = Math.max(...p);
      const tied = [];
      for (let z = 0; z < Z; z++) if (p[z] > max - 1e-9) tied.push(z);
      return tied[Math.floor(Math.random() * tied.length)];
    }
    // After the kick: reward the clues that saw it coming, then remember the kick.
    learn(zone, dive, scored, aim = zone) {
      const preds = this.clues.map((c) => c.predict(this.history));
      this.clues.forEach((c, i) => {
        c.weight *= Math.pow(preds[i].p[zone] * Z, this.eta);
      });
      const W = this.clues.reduce((a, c) => a + c.weight, 0);
      // keep every clue a little bit alive so it can come back when habits change
      this.clues.forEach((c) => (c.weight = Math.max(0.02, c.weight / W)));
      this.clues.forEach((c) => c.learn(this.history, zone, this.decay));
      this.history.push({ zone, dive, scored, aim });
      if (this.history.length > 50) this.history.shift();
    }
    topClue() {
      return this.clues.reduce((a, c) => (c.weight > a.weight ? c : a));
    }
    clone() {
      const g = new Goalie({ decay: this.decay, eta: this.eta });
      g.history = this.history.map((x) => ({ ...x }));
      g.clues.forEach((c, i) => {
        c.weight = this.clues[i].weight;
        for (const [k, v] of this.clues[i].table) c.table.set(k, v.slice());
      });
      return g;
    }
  }

  // Robot kickers with habits. They remember where they AIMED (the goalie only sees where the ball went).
  const pickWeighted = (w, rnd) => {
    const s = w.reduce((a, b) => a + b, 0);
    let r = rnd() * s;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return w.length - 1;
  };
  const aimOf = (x) => (x.aim ?? x.zone);
  const anyBut = (z, rnd) => { let k = Math.floor(rnd() * (Z - 1)); return k >= z ? k + 1 : k; };
  const KICKERS = {
    topleft: { name: "Loves top-left", kick: (h, rnd) => (rnd() < 0.6 ? 0 : Math.floor(rnd() * Z)) },
    alternate: {
      name: "Always alternates",
      kick: (h, rnd) => { if (rnd() < 0.1) return Math.floor(rnd() * Z); return !h.length || aimOf(last(h, 1)) !== 0 ? 0 : 5; },
    },
    clock: {
      name: "Goes round the clock",
      kick: (h, rnd) => {
        const ring = [0, 1, 2, 5, 4, 3];
        if (rnd() < 0.12 || !h.length) return Math.floor(rnd() * Z);
        return ring[(ring.indexOf(aimOf(last(h, 1))) + 1) % Z];
      },
    },
    copy: {
      name: "Copies the goalie",
      kick: (h, rnd) => (h.length && rnd() < 0.8 ? last(h, 1).dive : Math.floor(rnd() * Z)),
    },
    repeat: {
      name: "Repeats after scoring",
      kick: (h, rnd) => {
        if (!h.length) return Math.floor(rnd() * Z);
        const l = last(h, 1);
        return l.scored ? (rnd() < 0.85 ? aimOf(l) : Math.floor(rnd() * Z)) : anyBut(aimOf(l), rnd);
      },
    },
    random: { name: "Totally random", kick: (h, rnd) => Math.floor(rnd() * Z) },
  };

  // Curving ball: shots bend late toward the right post (one zone to the right).
  function curve(zone, rnd) {
    const col = zone % 3;
    if (col < 2 && rnd() < 0.6) return zone + 1;
    return zone;
  }

  // One penalty. aim = where the kicker aimed; returns the full story of the kick.
  function takeKick(goalie, aim, { curving = false, learn = true, rnd = Math.random } = {}) {
    const dive = goalie.chooseDive();
    const zone = curving ? curve(aim, rnd) : aim;
    const saved = dive === zone;
    if (learn) goalie.learn(zone, dive, !saved, aim);
    return { aim, zone, dive, saved };
  }

  const api = { Z, ZONE_NAMES, Goalie, KICKERS, takeKick, curve };
  root.GoalieCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
