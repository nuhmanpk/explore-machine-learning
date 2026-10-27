// Who Did You Ask? core: a town of four neighbourhoods whose people answer differently, a survey sample you choose,
// and a k-nearest-neighbours model trained only on who you asked. Pure logic; Node and browser.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Each neighbourhood sits in its own corner. Whether a person likes the new skate park depends on which side of
  // a line through the neighbourhood centre they are, and every neighbourhood has a different line.
  const GROUPS = [
    { id: "hill", name: "Hilltop", cx: 0.25, cy: 0.25, ang: 0 },
    { id: "lake", name: "Lakeside", cx: 0.75, cy: 0.25, ang: 90 },
    { id: "old", name: "Old Town", cx: 0.25, cy: 0.75, ang: 45 },
    { id: "mkt", name: "Market", cx: 0.75, cy: 0.75, ang: 135 }
  ];
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
  function makeTown(seed, perGroup) {
    perGroup = perGroup || 200;
    const r = rng(seed), people = [];
    GROUPS.forEach((g, gi) => {
      const a = (g.ang * Math.PI) / 180, nx = Math.cos(a), ny = Math.sin(a);
      for (let i = 0; i < perGroup; i++) {
        const x = g.cx + gauss(r) * 0.07, y = g.cy + gauss(r) * 0.07;
        let like = (x - g.cx) * nx + (y - g.cy) * ny > 0 ? 1 : 0;
        if (r() < 0.05) like = 1 - like;
        people.push({ id: gi * perGroup + i, g: gi, x, y, like });
      }
    });
    // a fixed random order within each neighbourhood, so "ask n people" always picks the same first n
    const order = GROUPS.map((_, gi) => { const ids = people.filter((p) => p.g === gi).map((p) => p.id); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } return ids; });
    return { people, order };
  }
  // counts: how many to ask in each neighbourhood.
  function sample(town, counts) { return counts.flatMap((c, gi) => town.order[gi].slice(0, c)).map((id) => town.people[id]); }
  function predict(train, q, k) {
    if (!train.length) return 0;
    const nb = train.map((d) => ({ d, e: (d.x - q.x) ** 2 + (d.y - q.y) ** 2 })).sort((a, b) => a.e - b.e || a.d.id - b.d.id).slice(0, Math.min(k || 5, train.length));
    return nb.reduce((s, n) => s + n.d.like, 0) * 2 > nb.length ? 1 : 0;
  }
  // Score on the people who were NOT asked, overall and per neighbourhood.
  function evaluate(town, counts, k) {
    const tr = sample(town, counts), asked = new Set(tr.map((p) => p.id));
    const hit = GROUPS.map(() => 0), tot = GROUPS.map(() => 0);
    for (const p of town.people) { if (asked.has(p.id)) continue; tot[p.g]++; if (predict(tr, p, k) === p.like) hit[p.g]++; }
    const byGroup = hit.map((h, i) => (tot[i] ? h / tot[i] : 0));
    const H = hit.reduce((a, b) => a + b, 0), T = tot.reduce((a, b) => a + b, 0);
    return { overall: T ? H / T : 0, byGroup, asked: tr.length, tr };
  }
  const core = { rng, GROUPS, makeTown, sample, predict, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.DataSamplingCore = core;
})(typeof window !== "undefined" ? window : globalThis);
