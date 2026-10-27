// Self-driving car core — "learning by copying" (behaviour cloning). Records what the eyes saw and which keys were held,
// then trains a small smooth network [inputs → 8 → 4] with backprop. No DOM; runs in Node too. Uses CarSim.NeuralNetwork.
(function (root) {
  const CarSim = root.CarSim || (typeof require !== "undefined" ? require("./car-sim.js") : null);
  const HIDDEN = 8, OUTS = 4;

  // One lesson: what the eyes saw (and how fast we were going) → which keys were held (forward, left, right, reverse).
  function lessonInput(readings, cross, light, speedRatio) {
    const x = readings.map((r) => (r ? 1 - r.offset : 0));
    if (cross) x.push(light);
    x.push(speedRatio);
    return x;
  }
  const lessonLabel = (keys) => [keys.forward, keys.left, keys.right, keys.reverse].map(Number);

  // A fresh smooth copycat brain for `nIn` inputs.
  function makeCopycat(nIn) {
    const net = new CarSim.NeuralNetwork([nIn, HIDDEN, OUTS]);
    net.soft = true;
    net.useSpeed = true;
    return net;
  }

  // One epoch of mini-batch SGD over data ([{x, y}]). Mutates net, returns the average per-output cross-entropy loss.
  function trainEpoch(net, data, lr = 0.3, batch = 32, rnd = Math.random) {
    const nIn = data[0].x.length;
    const [L1, L2] = net.levels;
    const sig = (z) => 1 / (1 + Math.exp(-z));
    const h = new Array(HIDDEN), o = new Array(OUTS), dO = new Array(OUTS), dH = new Array(HIDDEN);
    let loss = 0;
    const order = data.map((_, i) => i).sort(() => rnd() - 0.5);
    for (let b0 = 0; b0 < order.length; b0 += batch) {
      const gW1 = L1.weights.map((r) => r.map(() => 0)), gB1 = new Array(HIDDEN).fill(0);
      const gW2 = L2.weights.map((r) => r.map(() => 0)), gB2 = new Array(OUTS).fill(0);
      const idx = order.slice(b0, b0 + batch);
      for (const k of idx) {
        const { x, y } = data[k];
        for (let j = 0; j < HIDDEN; j++) { let s = -L1.biases[j]; for (let i = 0; i < nIn; i++) s += x[i] * L1.weights[i][j]; h[j] = sig(s); }
        for (let j = 0; j < OUTS; j++) { let s = -L2.biases[j]; for (let i = 0; i < HIDDEN; i++) s += h[i] * L2.weights[i][j]; o[j] = sig(s); }
        for (let j = 0; j < OUTS; j++) {
          dO[j] = o[j] - y[j];
          loss -= y[j] * Math.log(o[j] + 1e-7) + (1 - y[j]) * Math.log(1 - o[j] + 1e-7);
        }
        for (let i = 0; i < HIDDEN; i++) {
          let s = 0;
          for (let j = 0; j < OUTS; j++) { s += L2.weights[i][j] * dO[j]; gW2[i][j] += h[i] * dO[j]; }
          dH[i] = s * h[i] * (1 - h[i]);
        }
        for (let j = 0; j < OUTS; j++) gB2[j] -= dO[j];
        for (let j = 0; j < HIDDEN; j++) { gB1[j] -= dH[j]; for (let i = 0; i < nIn; i++) gW1[i][j] += x[i] * dH[j]; }
      }
      const m = lr / idx.length;
      for (let i = 0; i < nIn; i++) for (let j = 0; j < HIDDEN; j++) L1.weights[i][j] -= m * gW1[i][j];
      for (let j = 0; j < HIDDEN; j++) L1.biases[j] -= m * gB1[j];
      for (let i = 0; i < HIDDEN; i++) for (let j = 0; j < OUTS; j++) L2.weights[i][j] -= m * gW2[i][j];
      for (let j = 0; j < OUTS; j++) L2.biases[j] -= m * gB2[j];
    }
    return loss / data.length / OUTS;
  }

  const api = { HIDDEN, OUTS, lessonInput, lessonLabel, makeCopycat, trainEpoch };
  root.CarCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
