// Two-link arm core: forward kinematics, analytic inverse kinematics (law of cosines), joint limits. Pure logic.
(function (root) {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  // a1 = shoulder angle from +x axis, a2 = elbow bend relative to link 1 (radians)
  function fk(l1, l2, a1, a2) {
    const ex = l1 * Math.cos(a1), ey = l1 * Math.sin(a1);
    return { ex, ey, x: ex + l2 * Math.cos(a1 + a2), y: ey + l2 * Math.sin(a1 + a2) };
  }
  function reach(l1, l2) { return { min: Math.abs(l1 - l2), max: l1 + l2 }; }
  // Returns { reachable, solutions:[{a1,a2,elbow:'down'|'up'}] } ; both solutions when reachable (one when on the boundary).
  function ik(l1, l2, x, y) {
    const d2 = x * x + y * y, r = reach(l1, l2), d = Math.sqrt(d2);
    if (d > r.max + 1e-9 || d < r.min - 1e-9) return { reachable: false, solutions: [], d };
    const c2 = Math.max(-1, Math.min(1, (d2 - l1 * l1 - l2 * l2) / (2 * l1 * l2)));
    const out = [];
    for (const s of [1, -1]) {
      const a2 = s * Math.acos(c2);
      const a1 = Math.atan2(y, x) - Math.atan2(l2 * Math.sin(a2), l1 + l2 * Math.cos(a2));
      out.push({ a1: wrap(a1), a2, elbow: s > 0 ? "down" : "up" });
    }
    return { reachable: true, solutions: out, d };
  }
  // limits in degrees: { s:[min,max], e:[min,max] }
  function withinLimits(sol, lim) {
    const s = sol.a1 * R2D, e = sol.a2 * R2D;
    return s >= lim.s[0] - 1e-6 && s <= lim.s[1] + 1e-6 && e >= lim.e[0] - 1e-6 && e <= lim.e[1] + 1e-6;
  }
  function randomTarget(rnd, l1, l2) {
    const r = reach(l1, l2), d = r.min + 8 + rnd() * (r.max - r.min - 16), a = (rnd() * 1.4 - 0.2) * Math.PI;
    return { x: d * Math.cos(a), y: d * Math.sin(a) };
  }
  const core = { D2R, R2D, wrap, fk, ik, reach, withinLimits, randomTarget };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.ArmCore = core;
})(typeof window !== "undefined" ? window : globalThis);
