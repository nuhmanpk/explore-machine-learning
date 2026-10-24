// Basketball Shooter — court physics + a learner that fixes its throw from every miss.
// No DOM, so it also runs in Node (used to check that it learns and re-adapts).
(function (root) {
  const G = 9.8;
  const RELEASE_H = 2.0; // ball leaves the hand at 2 m
  const RIM_H = 3.05;
  const RIM_R = 0.23; // rim radius (m)
  const BALL_R = 0.12;
  const ANGLE = (55 * Math.PI) / 180; // Robo's favourite launch angle
  const DT = 1 / 120;

  // Everything that can change the court. Challenges flip these.
  function makeWorld() {
    return { wind: 0, moving: false, heavy: false, high: false, spots: false, t: 0 };
  }

  // Where the hoop is at time t (seconds since the round began). The moving hoop slides back and forth.
  function hoopAt(world, base, t) {
    if (!world.moving) return { x: base, v: 0 };
    const A = 0.8, w = 0.6;
    return { x: base + A * Math.sin(w * t), v: A * w * Math.cos(w * t) };
  }

  // A new shot: how far away Robo stands this time.
  function newSpot(world, rnd = Math.random) {
    const lo = world.spots ? 2.2 : 3.2, hi = world.spots ? 8.8 : 6.8;
    return { d: lo + rnd() * (hi - lo), t0: rnd() * 20 };
  }

  // Fly the ball. Returns the path, whether it went in, and the miss (+ = too long, − = too short)
  // measured where the ball comes down through rim height.
  function shoot(world, spot, power, angle = ANGLE, keepPath = true) {
    const rimH = RIM_H + (world.high ? 0.8 : 0);
    const speed = power * (world.heavy ? 0.9 : 1); // a heavy ball leaves the hand slower
    let x = 0, y = RELEASE_H, vx = speed * Math.cos(angle), vy = speed * Math.sin(angle);
    const path = keepPath ? [[x, y]] : null;
    let t = 0, rising = true, res = null;
    for (let i = 0; i < 1200; i++) {
      vx += world.wind * DT;
      vy -= G * DT;
      const px = x, py = y;
      x += vx * DT; y += vy * DT; t += DT;
      if (keepPath && i % 2 === 0) path.push([x, y]);
      if (vy < 0) rising = false;
      if (!rising && py >= rimH && y < rimH) {
        // came down through rim height: where, relative to the hoop at that moment?
        const cx = px + ((x - px) * (py - rimH)) / (py - y);
        const hoop = hoopAt(world, spot.d, spot.t0 + t);
        const miss = cx - hoop.x;
        res = { miss, made: Math.abs(miss) < RIM_R - BALL_R * 0.35, hoopX: hoop.x, t };
        // let the ball fall a little further for the drawing
        if (keepPath) for (let k = 0; k < 30; k++) { vy -= G * DT; x += vx * DT; y += vy * DT; if (k % 2 === 0) path.push([x, y]); }
        break;
      }
      if (y < 0) break;
    }
    if (!res) {
      // never got as high as the rim: count it as very short
      const hoop = hoopAt(world, spot.d, spot.t0 + t);
      res = { miss: Math.min(-1.5, x - hoop.x), made: false, hoopX: hoop.x, t, airball: true };
    }
    res.path = path;
    return res;
  }

  // What Robo can see before throwing.
  function features(world, spot) {
    const hoop = hoopAt(world, spot.d, spot.t0);
    const d = hoop.x / 5; // where the hoop is right now
    const h = world.high ? 1 : 0;
    const w = world.wind / 2;
    const hv = hoop.v / 1.5; // how fast it slides
    return [1, d, d * d, 1 / d, h, w, hv, d * w, d * hv, h * d];
  }
  const FEATURE_NAMES = ["habit", "distance", "distance²", "closeness", "hoop height", "wind", "hoop sliding", "distance×wind", "distance×sliding", "height×distance"];

  // The learner: power = weights · features. After each shot it turns "I was 0.4 m short"
  // into "I should have thrown a bit harder" and nudges the weights toward that.
  class Shooter {
    constructor() {
      this.w = [6, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      this.lr = 0.6;
      this.k = 0.55; // how much extra power per metre of miss
    }
    power(x) {
      return Math.max(3, Math.min(16, x.reduce((s, xi, i) => s + xi * this.w[i], 0)));
    }
    learn(x, used, miss) {
      const target = used - this.k * Math.max(-2, Math.min(2, miss));
      const err = target - x.reduce((s, xi, i) => s + xi * this.w[i], 0);
      const norm = 1 + x.reduce((s, xi) => s + xi * xi, 0);
      for (let i = 0; i < this.w.length; i++) this.w[i] += (this.lr * err * x[i]) / norm;
      return target;
    }
    clone() {
      const c = new Shooter();
      c.w = this.w.slice();
      return c;
    }
  }

  // One full shot: look, throw, learn. Returns the result plus what Robo was thinking.
  function practise(world, shooter, learn = true, rnd = Math.random) {
    const spot = newSpot(world, rnd);
    const x = features(world, spot);
    const power = shooter.power(x);
    const r = shoot(world, spot, power, ANGLE, false);
    let target = power;
    if (learn) target = shooter.learn(x, power, r.miss);
    return { spot, x, power, target, ...r };
  }

  const api = { G, RELEASE_H, RIM_H, RIM_R, BALL_R, ANGLE, makeWorld, hoopAt, newSpot, shoot, features, FEATURE_NAMES, Shooter, practise };
  root.Hoops = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
