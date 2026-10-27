// Meet One Neuron — perceptron maths and the kid's 8 days. No DOM; runs in Node too.
(function (root) {
  // What a real kid decided. Linearly separable (e.g. w = [2,-3,2,-2], b = -1).
  const DAYS = [
    { x: [1, 0, 0, 0], y: 1 },
    { x: [1, 1, 0, 0], y: 0 },
    { x: [0, 0, 1, 1], y: 0 },
    { x: [1, 0, 1, 1], y: 1 },
    { x: [0, 0, 0, 0], y: 0 },
    { x: [0, 0, 1, 0], y: 1 },
    { x: [0, 1, 1, 0], y: 0 },
    { x: [0, 0, 0, 1], y: 0 },
  ];
  const LR = 0.5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const sumOf = (ws, bias, x) => ws.reduce((s, w, i) => s + w * x[i], bias);
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
  const out = (act, z) => (act === "step" ? (z > 0 ? 1 : 0) : sigmoid(z));
  const predict = (ws, bias, x) => (sumOf(ws, bias, x) > 0 ? 1 : 0);

  // One perceptron step on a single day. Returns the guess, the error and the new (rounded, clamped) knobs.
  function perceptronStep(ws, bias, day) {
    const p = predict(ws, bias, day.x);
    const err = day.y - p;
    if (err === 0) return { p, err, w: ws.slice(), b: bias };
    const w = ws.map((v, k) => (day.x[k] ? clamp(+(v + LR * err * day.x[k]).toFixed(1), -3, 3) : v));
    const b = clamp(+(bias + LR * err).toFixed(1), -3, 3);
    return { p, err, w, b };
  }

  const api = { DAYS, LR, sumOf, sigmoid, out, predict, perceptronStep };
  root.NeuronCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
