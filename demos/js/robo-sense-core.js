// Sensor-fusion core: seeded robot world, noisy position sensor, drifting odometry, and a real Kalman filter
// (constant-velocity model, one 2-state filter per axis). Pure logic.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

  // State [pos, vel], covariance P (2x2). q = acceleration noise (how much we expect the robot to swerve).
  class KF1 {
    constructor(z, r) { this.x = [z, 0]; this.P = [[r, 0], [0, 400]]; }
    predict(dt, q) {
      const [p, v] = this.x, P = this.P, dt2 = dt * dt;
      this.x = [p + v * dt, v];
      const a = P[0][0] + dt * (P[1][0] + P[0][1]) + dt2 * P[1][1], b = P[0][1] + dt * P[1][1], c = P[1][0] + dt * P[1][1], d = P[1][1];
      const q2 = q * q;
      this.P = [[a + q2 * dt2 * dt2 / 4, b + q2 * dt2 * dt / 2], [c + q2 * dt2 * dt / 2, d + q2 * dt2]];
    }
    update(z, rStd) {
      const P = this.P, S = P[0][0] + rStd * rStd, K0 = P[0][0] / S, K1 = P[1][0] / S, y = z - this.x[0];
      this.x = [this.x[0] + K0 * y, this.x[1] + K1 * y];
      // Joseph-free form: P = (I - K H) P
      this.P = [[(1 - K0) * P[0][0], (1 - K0) * P[0][1]], [P[1][0] - K1 * P[0][0], P[1][1] - K1 * P[0][1]]];
    }
    get sigma() { return Math.sqrt(Math.max(0, this.P[0][0])); }
  }

  const W = 400, H = 240, DT = 1 / 30;
  class World {
    constructor(seed) {
      this.r = rng(seed); this.t = 0; this.step_i = 0;
      this.pos = [W * 0.2 + this.r() * 40, H / 2 + (this.r() - 0.5) * 60]; this.vel = [30, 10];
      this.bias = [(this.r() < 0.5 ? -1 : 1) * (3 + this.r() * 2), (this.r() < 0.5 ? -1 : 1) * (3 + this.r() * 2)];
      this.odo = this.pos.slice(); this.tunnel = [W * 0.4, W * 0.62];
    }
    // sensorStd px, tunnel: boolean. Returns one tick of everything.
    step(sensorStd, tunnel) {
      const r = this.r;
      for (let k = 0; k < 2; k++) {
        const c = k ? H / 2 : W / 2, kk = 0.8;
        this.vel[k] += (-kk * (this.pos[k] - c) + gauss(r) * 55) * DT; // spring toward centre + random swerves
        this.vel[k] = Math.max(-70, Math.min(70, this.vel[k]));
        this.pos[k] += this.vel[k] * DT;
        this.odo[k] += (this.vel[k] + this.bias[k] + gauss(r) * 4) * DT; // dead reckoning: biased, noisy speed
      }
      this.t += DT; this.step_i++;
      const inTunnel = tunnel && this.pos[0] > this.tunnel[0] && this.pos[0] < this.tunnel[1];
      const z = inTunnel ? null : [this.pos[0] + gauss(r) * sensorStd, this.pos[1] + gauss(r) * sensorStd];
      return { truth: this.pos.slice(), z, odo: this.odo.slice(), inTunnel };
    }
  }
  class Fuser {
    constructor() { this.kf = null; }
    step(obs, sensorStd, q) {
      if (!this.kf) { if (!obs.z) return null; this.kf = [new KF1(obs.z[0], sensorStd * sensorStd), new KF1(obs.z[1], sensorStd * sensorStd)]; }
      else this.kf.forEach((f) => f.predict(DT, q));
      if (obs.z) this.kf.forEach((f, k) => f.update(obs.z[k], Math.max(0.5, sensorStd)));
      return { est: [this.kf[0].x[0], this.kf[1].x[0]], sig: [this.kf[0].sigma, this.kf[1].sigma] };
    }
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // rolling RMS error tracker
  class Rms { constructor(n) { this.n = n; this.b = []; } add(e) { this.b.push(e * e); if (this.b.length > this.n) this.b.shift(); } get v() { return this.b.length ? Math.sqrt(this.b.reduce((a, c) => a + c, 0) / this.b.length) : 0; } }
  const core = { rng, gauss, KF1, World, Fuser, Rms, dist, W, H, DT };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.SenseCore = core;
})(typeof window !== "undefined" ? window : globalThis);
