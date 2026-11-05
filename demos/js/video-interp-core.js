// In-Between Frames core: make the picture at time t between frame A (t = 0) and frame B (t = 1).
// Three ways: repeat a frame, cross-fade, or follow the motion arrows. Uses FlowCore (video-flow-core.js). Runs in Node too.
(function (root) {
  const F = root.FlowCore || (typeof require !== "undefined" ? require("./video-flow-core.js") : null);
  const { W, H, N } = F;

  // (a) just show whichever real frame is nearer in time
  function repeat(A, B, t) { return Float32Array.from(t <= 0.5 ? A.rgb : B.rgb); }
  // (b) see-through mix of the two frames: moving things appear twice (ghosts)
  function blend(A, B, t) { const o = new Float32Array(3 * N); for (let i = 0; i < o.length; i++) o[i] = (1 - t) * A.rgb[i] + t * B.rgb[i]; return o; }

  // (c) motion-compensated: for every pixel p of the new frame, find an arrow v so that
  // A at (p - t·v) and B at (p + (1 - t)·v) agree (the thing passing through p), then fetch and mix both.
  // Candidate arrows come from the flow near p, so the search is tiny. Returns the frame and a "trouble" map
  // (how badly the best candidate still disagreed: high where something is hidden in one frame = occlusion).
  const OFFS = [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [4, 4], [-4, -4], [4, -4], [-4, 4], [8, 0], [-8, 0], [0, 8], [0, -8]];
  function motion(A, B, flow, t) {
    const o = new Float32Array(3 * N), trouble = new Float32Array(N), cand = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      cand.length = 0; cand.push([0, 0]);
      for (const d of OFFS) {
        const qx = Math.min(W - 1, Math.max(0, x + d[0])), qy = Math.min(H - 1, Math.max(0, y + d[1])), q = qy * W + qx, cu = flow[2 * q], cv = flow[2 * q + 1];
        let seen = false; for (const c of cand) if (Math.abs(c[0] - cu) < 0.2 && Math.abs(c[1] - cv) < 0.2) { seen = true; break; }
        if (!seen) cand.push([cu, cv]);
      }
      const cx = x + 0.5, cy = y + 0.5;
      let best = Infinity, bu = 0, bv = 0;
      for (const c of cand) {
        let s = 0;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++)
          s += Math.abs(F.sample(A.gray, 1, cx + xx - t * c[0], cy + yy - t * c[1], 0) - F.sample(B.gray, 1, cx + xx + (1 - t) * c[0], cy + yy + (1 - t) * c[1], 0));
        s += 0.002 * Math.hypot(c[0], c[1]);
        if (s < best) { best = s; bu = c[0]; bv = c[1]; }
      }
      const i = y * W + x;
      for (let k = 0; k < 3; k++) o[3 * i + k] = (1 - t) * F.sample(A.rgb, 3, cx - t * bu, cy - t * bv, k) + t * F.sample(B.rgb, 3, cx + (1 - t) * bu, cy + (1 - t) * bv, k);
      trouble[i] = best / 9;
    }
    return { rgb: o, trouble };
  }
  // per-pixel error picture (0..1) and the mean squared error against the true frame
  function diff(a, b) { const d = new Float32Array(N); for (let i = 0; i < N; i++) d[i] = (Math.abs(a[3 * i] - b[3 * i]) + Math.abs(a[3 * i + 1] - b[3 * i + 1]) + Math.abs(a[3 * i + 2] - b[3 * i + 2])) / 3; return d; }
  // everything a lesson needs for one scene: frames, flows (block-matched and true)
  function setup(sceneOpts, bs, r) {
    const scene = F.makeScene(sceneOpts), pair = F.makePair(scene);
    const fl = F.blockFlow(pair.A.gray, pair.B.gray, bs || 8, r || 8);
    return { scene, A: pair.A, B: pair.B, trueFlow: pair.flow, blocks: fl, flow: F.denseFlow(pair.A.gray, pair.B.gray, fl) };
  }
  function make(S, method, t, useTrue) {
    if (method === "repeat") return { rgb: repeat(S.A, S.B, t) };
    if (method === "blend") return { rgb: blend(S.A, S.B, t) };
    return motion(S.A, S.B, useTrue ? S.trueFlow : S.flow, t);
  }

  const core = { repeat, blend, motion, diff, setup, make, mse: F.mse };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.InterpCore = core;
})(typeof window !== "undefined" ? window : globalThis);
