// Teach the Ear core: band layout, clip -> feature vector, cosine k-nearest-neighbours, quiz score. Pure logic; Node + browser.
(function (root) {
  const BANDS = 32, CLIP = 45, SLICES = 12; // 45 frames ~ 0.75 s

  // log-spaced band edges, 80 Hz to 8 kHz
  function bandEdges(sampleRate, fftSize) {
    const hz = sampleRate / fftSize, idx = [];
    for (let b = 0; b <= BANDS; b++) idx.push(Math.max(1, Math.round((80 * Math.pow(100, b / BANDS)) / hz)));
    return idx;
  }
  function bandsFromFreq(freq, bandIdx) {
    const out = new Float32Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      let s = 0, n = 0;
      for (let i = bandIdx[b]; i < Math.max(bandIdx[b + 1], bandIdx[b] + 1); i++) { s += freq[i]; n++; }
      out[b] = Math.pow(s / n / 255, 1.5);
    }
    return out;
  }

  function centroid(c) {
    if (!c.examples.length) return null;
    const m = new Float32Array(BANDS * SLICES);
    for (const ex of c.examples) for (let i = 0; i < m.length; i++) m[i] += ex.img[i] / c.examples.length;
    return m;
  }


  function makeExample(frames) {
    const img = new Float32Array(BANDS * SLICES);
    const per = frames.length / SLICES;
    for (let s = 0; s < SLICES; s++)
      for (let b = 0; b < BANDS; b++) {
        let v = 0, n = 0;
        for (let f = Math.floor(s * per); f < Math.floor((s + 1) * per); f++) { v += frames[f][b]; n++; }
        img[s * BANDS + b] = n ? v / n : 0;
      }
    let mx = 0;
    for (const v of img) mx = Math.max(mx, v);
    if (mx > 0) for (let i = 0; i < img.length; i++) img[i] /= mx;
    const mean = new Float32Array(BANDS);
    for (let s = 0; s < SLICES; s++) for (let b = 0; b < BANDS; b++) mean[b] += img[s * BANDS + b] / SLICES;
    const vec = Array.from(img).concat(Array.from(mean).map((v) => v * 3));
    const norm = Math.hypot(...vec) || 1;
    return { img, vec: vec.map((v) => v / norm) };
  }

  // k-nearest neighbours with cosine similarity
  function knn(classes, vec, skip) {
    const all = [];
    classes.forEach((c, ci) => c.examples.forEach((ex, ei) => {
      if (ex === skip) return;
      let dot = 0;
      for (let i = 0; i < vec.length; i++) dot += vec[i] * ex.vec[i];
      all.push({ ci, ei, ex, sim: dot });
    }));
    all.sort((a, b) => b.sim - a.sim);
    const near = all.slice(0, 3);
    const votes = new Array(classes.length).fill(0);
    for (const n of near) votes[n.ci] += 1 / (1.05 - n.sim);
    const tot = votes.reduce((a, b) => a + b, 0) || 1;
    return { near, probs: votes.map((v) => v / tot) };
  }

  function quizScore(classes) {
    let n = 0, ok = 0;
    const ready = classes.filter((c) => c.examples.length).length >= 2;
    if (!ready) return null;
    classes.forEach((c, ci) => c.examples.forEach((ex) => {
      const r = knn(classes, ex.vec, ex);
      if (!r.near.length) return;
      n++;
      if (r.probs.indexOf(Math.max(...r.probs)) === ci) ok++;
    }));
    return n ? ok / n : null;
  }

  const core = { BANDS, CLIP, SLICES, bandEdges, bandsFromFreq, centroid, makeExample, knn, quizScore };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.EarCore = core;
})(typeof window !== "undefined" ? window : globalThis);
