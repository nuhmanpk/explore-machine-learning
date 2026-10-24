// Unfair AI — a tiny "club bouncer" learned from past decisions with logistic regression.
// No DOM, so it runs in Node too.
//
// Creatures have 4 features: purple (1) or green (0), big, hat, snack.
// The FAIR club rule is simply "let in anyone who brought a snack".
// The OLD bouncer was unfair to purple creatures and purple creatures are rare in the data,
// so an AI that copies the old decisions copies the unfairness too.
(function (root) {
  const FEATURES = [
    { key: "purple", name: "Purple colour" },
    { key: "big", name: "Big size" },
    { key: "hat", name: "Wears a hat" },
    { key: "snack", name: "Brought a snack" },
  ];
  const NF = 4;

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  // How unfair the old bouncer was to purple creatures that DID bring a snack: let in only this often.
  const OLD_PURPLE_LET_IN = 0.15;
  const N_START = 160, N_PURPLE = 16;

  // One creature and the OLD bouncer's decision about it.
  function creature(rnd, purple, fair) {
    const big = rnd() < 0.5 ? 1 : 0, hat = rnd() < 0.4 ? 1 : 0, snack = rnd() < 0.5 ? 1 : 0;
    let label;
    if (fair) label = snack;
    else if (purple) label = snack && rnd() < OLD_PURPLE_LET_IN ? 1 : 0;
    else label = rnd() < 0.04 ? 1 - snack : snack; // the old bouncer was a bit sloppy even with green creatures
    return { purple, big, hat, snack, label, fairLabel: snack, w: 1, tag: "" };
  }

  // The "past decisions" the AI learns from: mostly green creatures, only a few purple ones.
  function makeData(seed = 11) {
    const rnd = mulberry(seed);
    const data = [];
    for (let i = 0; i < N_START; i++) data.push(creature(rnd, i < N_PURPLE ? 1 : 0, false));
    // shuffle so the grid looks natural
    for (let i = data.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [data[i], data[j]] = [data[j], data[i]]; }
    return data;
  }

  // Test sets: the "old decisions" holdout (looks like the training data) and a fair, balanced test.
  function makeOldHoldout(seed = 501) {
    const rnd = mulberry(seed), out = [];
    for (let i = 0; i < 400; i++) out.push(creature(rnd, rnd() < N_PURPLE / N_START ? 1 : 0, false));
    return out;
  }
  function makeFairTest(seed = 902) {
    const rnd = mulberry(seed), out = [];
    for (let i = 0; i < 400; i++) out.push(creature(rnd, i % 2, true)); // half purple, half green, fair labels
    return out;
  }

  // ---------- the model ----------
  const feat = (c, mask) => [mask.colour ? 0 : c.purple, c.big, c.hat, c.snack, 1];
  function predictP(w, c, mask) {
    const x = feat(c, mask);
    let z = 0;
    for (let i = 0; i < x.length; i++) z += w[i] * x[i];
    return sigmoid(z);
  }
  const newWeights = () => [0, 0, 0, 0, 0];

  // One full-batch gradient-descent step (with a little weight decay). Returns the average loss.
  function trainStep(w, data, mask, lr = 0.6, l2 = 0.01) {
    const g = [0, 0, 0, 0, 0];
    let sw = 0, loss = 0;
    for (const c of data) {
      const x = feat(c, mask), p = predictP(w, c, mask), e = (p - c.label) * c.w;
      for (let i = 0; i < 5; i++) g[i] += e * x[i];
      sw += c.w;
      loss -= c.w * (c.label ? Math.log(p + 1e-9) : Math.log(1 - p + 1e-9));
    }
    for (let i = 0; i < 5; i++) w[i] -= lr * (g[i] / sw + (i < 4 ? l2 * w[i] : 0));
    return loss / sw;
  }
  function fit(w, data, mask, epochs = 400) {
    let loss = 0;
    for (let i = 0; i < epochs; i++) loss = trainStep(w, data, mask);
    return loss;
  }

  // ---------- how fair is it? ----------
  const accuracy = (w, set, mask, key = "label") => set.filter((c) => (predictP(w, c, mask) >= 0.5) === !!c[key]).length / set.length;
  function metrics(w, mask, oldSet, fairSet) {
    const grp = (p) => fairSet.filter((c) => c.purple === p);
    const tpr = (p) => { const s = grp(p).filter((c) => c.snack); return s.filter((c) => predictP(w, c, mask) >= 0.5).length / s.length; };
    const acc = (p) => grp(p).filter((c) => (predictP(w, c, mask) >= 0.5) === !!c.snack).length / grp(p).length;
    // Smooth version of "let in": how sure the AI is, on average, that a snack-carrier should come in.
    const sure = (p) => { const s = grp(p).filter((c) => c.snack); return s.reduce((t, c) => t + predictP(w, c, mask), 0) / s.length; };
    const m = {
      oldAcc: accuracy(w, oldSet, mask),
      fairAcc: accuracy(w, fairSet, mask, "fairLabel"),
      greenAcc: acc(0), purpleAcc: acc(1),
      greenIn: tpr(0), purpleIn: tpr(1),
      greenSure: sure(0), purpleSure: sure(1),
    };
    m.gap = m.greenIn - m.purpleIn;
    m.gapSure = m.greenSure - m.purpleSure;
    return m;
  }

  // ---------- the fixes ----------
  // 1. More examples from the rare group, this time judged fairly.
  function addFairPurple(data, n, rnd) {
    const add = [];
    for (let i = 0; i < n; i++) { const c = creature(rnd, 1, true); c.tag = "new"; add.push(c); }
    return data.concat(add);
  }
  // 2. "Balance the crowd" by copying the purple creatures we already have until the groups are equal.
  //    (Copies carry the same unfair decisions. This is NOT a real fix.)
  function copyBalance(data) {
    const purple = data.filter((c) => c.purple && c.tag !== "copy");
    const greens = data.filter((c) => !c.purple).length, haves = data.filter((c) => c.purple).length;
    const out = data.slice();
    for (let i = 0; haves + i < greens && purple.length; i++) { const s = purple[i % purple.length]; out.push({ ...s, tag: "copy" }); }
    return out;
  }
  // 3. Fix the unfair old decisions: purple creatures with a snack should have been let in.
  function relabel(data) {
    let n = 0;
    const out = data.map((c) => (c.purple && c.snack && !c.label ? (n++, { ...c, label: 1, tag: "fixed" }) : c));
    return { data: out, fixed: n };
  }
  // The creatures whose old decision was unfair (for highlighting).
  const isUnfair = (c) => c.purple && c.snack && !c.label;

  // Words for the "inside" card: where each feature's push came from.
  function contributions(w, c, mask) {
    const x = feat(c, mask);
    const rows = [];
    FEATURES.forEach((f, i) => { if (x[i]) rows.push({ name: f.name, v: w[i] * x[i], key: f.key }); });
    rows.push({ name: "Starting mood", v: w[4], key: "bias" });
    const z = rows.reduce((s, r) => s + r.v, 0);
    return { rows, z, p: sigmoid(z) };
  }
  // What the training data actually said about a kind of creature.
  function history(data, purple, snack) {
    const s = data.filter((c) => c.purple === purple && c.snack === snack);
    return { n: s.length, letIn: s.length ? s.filter((c) => c.label).length / s.length : null };
  }

  const api = { FEATURES, N_START, N_PURPLE, OLD_PURPLE_LET_IN, mulberry, makeData, makeOldHoldout, makeFairTest, creature, predictP, newWeights, trainStep, fit, metrics, accuracy, addFairPurple, copyBalance, relabel, isUnfair, contributions, history };
  root.AIBias = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
