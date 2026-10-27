// PID core: a drone-height plant (mass, drag, thrust limit, wind gust) and a real PID controller. Pure logic.
(function (root) {
  const DEF = { kp: 8, ki: 0, kd: 3, dt: 0.01, T: 12, sp: 1, mass: 1, drag: 0.4, umax: 30, gust: false, gustAt: 6, gustForce: -6 };
  // Semi-implicit Euler: u = kp*e + ki*∫e - kd*v ; m*a = u + wind - drag*v
  function simulate(o) {
    const p = Object.assign({}, DEF, o), n = Math.round(p.T / p.dt);
    const t = [], y = [], u = [];
    let pos = 0, vel = 0, I = 0;
    for (let i = 0; i <= n; i++) {
      const time = i * p.dt, e = p.sp - pos;
      I += e * p.dt;
      if (p.ki > 0) I = Math.max(-p.umax / p.ki, Math.min(p.umax / p.ki, I)); // anti-windup clamp
      let c = p.kp * e + p.ki * I - p.kd * vel;
      c = Math.max(-p.umax, Math.min(p.umax, c));
      const wind = p.gust && time >= p.gustAt ? p.gustForce : 0;
      vel += ((c + wind - p.drag * vel) / p.mass) * p.dt;
      pos += vel * p.dt;
      if (!isFinite(pos) || Math.abs(pos) > 50) pos = Math.sign(pos || 1) * 50;
      t.push(time); y.push(pos); u.push(c);
    }
    return { p, t, y, u, metrics: metrics(p, t, y) };
  }
  // overshoot / settling are measured before the gust (the step response); endError after everything.
  function metrics(p, t, y) {
    const end = p.gust ? Math.round(p.gustAt / p.dt) : y.length - 1;
    let peak = -Infinity, last = -1;
    for (let i = 0; i <= end; i++) { peak = Math.max(peak, y[i]); if (Math.abs(y[i] - p.sp) > 0.02 * Math.abs(p.sp)) last = i; }
    const settled = last < end - 20 ? (last < 0 ? 0 : t[last + 1]) : null;
    const tail = y.slice(-50), endErr = tail.reduce((a, v) => a + Math.abs(p.sp - v), 0) / tail.length;
    let dip = 0;
    if (p.gust) for (let i = end; i < y.length; i++) dip = Math.max(dip, p.sp - y[i]);
    return { overshoot: Math.max(0, (peak - p.sp) / p.sp * 100), settle: settled, endError: endErr, gustDip: dip, peak };
  }
  const core = { DEF, simulate, metrics };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.PidCore = core;
})(typeof window !== "undefined" ? window : globalThis);
