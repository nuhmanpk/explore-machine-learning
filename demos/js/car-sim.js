// Self-driving car simulation core: road, traffic, ray sensors, a tiny neural
// network and a genetic "pick the best, copy with tweaks" loop.
// No DOM here, so it also runs in Node (used to pre-train the "graduate" brain).
// Inspired by Radu Mariescu-Istodor's freeCodeCamp self-driving car course.
(function (root) {
  const lerp = (a, b, t) => a + (b - a) * t;

  // Deterministic RNG so every car in a generation faces the exact same road.
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- geometry ----------
  function getIntersection(A, B, C, D) {
    const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
    const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
    const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);
    if (bottom !== 0) {
      const t = tTop / bottom;
      const u = uTop / bottom;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), offset: t };
      }
    }
    return null;
  }

  function polysIntersect(p1, p2) {
    for (let i = 0; i < p1.length; i++) {
      for (let j = 0; j < p2.length; j++) {
        if (getIntersection(p1[i], p1[(i + 1) % p1.length], p2[j], p2[(j + 1) % p2.length])) return true;
      }
    }
    return false;
  }

  // ---------- neural network ----------
  // Each level: every input is wired to every output with a weight.
  // An output "fires" (1) when its weighted sum beats its bias, else 0.
  class Level {
    constructor(inputCount, outputCount) {
      this.inputs = new Array(inputCount).fill(0);
      this.outputs = new Array(outputCount).fill(0);
      this.biases = new Array(outputCount);
      this.weights = [];
      for (let i = 0; i < inputCount; i++) this.weights[i] = new Array(outputCount);
      Level.randomize(this);
    }
    static randomize(level) {
      for (let i = 0; i < level.inputs.length; i++)
        for (let j = 0; j < level.outputs.length; j++) level.weights[i][j] = Math.random() * 2 - 1;
      for (let i = 0; i < level.biases.length; i++) level.biases[i] = Math.random() * 2 - 1;
    }
    // soft = smooth 0..1 output (sigmoid) instead of a hard on/off step.
    static feedForward(givenInputs, level, soft) {
      for (let i = 0; i < level.inputs.length; i++) level.inputs[i] = givenInputs[i];
      for (let i = 0; i < level.outputs.length; i++) {
        let sum = 0;
        for (let j = 0; j < level.inputs.length; j++) sum += level.inputs[j] * level.weights[j][i];
        level.outputs[i] = soft ? 1 / (1 + Math.exp(-(sum - level.biases[i]))) : sum > level.biases[i] ? 1 : 0;
      }
      return level.outputs;
    }
  }

  class NeuralNetwork {
    constructor(neuronCounts) {
      this.levels = [];
      for (let i = 0; i < neuronCounts.length - 1; i++) this.levels.push(new Level(neuronCounts[i], neuronCounts[i + 1]));
    }
    static feedForward(givenInputs, network) {
      let outputs = Level.feedForward(givenInputs, network.levels[0], network.soft);
      for (let i = 1; i < network.levels.length; i++) outputs = Level.feedForward(outputs, network.levels[i], network.soft);
      return outputs;
    }
    // Nudge every number a little toward a random value. amount 0 = exact copy, 1 = brand new brain.
    static mutate(network, amount) {
      network.levels.forEach((level) => {
        for (let i = 0; i < level.biases.length; i++) level.biases[i] = lerp(level.biases[i], Math.random() * 2 - 1, amount);
        for (let i = 0; i < level.weights.length; i++)
          for (let j = 0; j < level.weights[i].length; j++) level.weights[i][j] = lerp(level.weights[i][j], Math.random() * 2 - 1, amount);
      });
      return network;
    }
    static toData(network) {
      const levels = network.levels.map((l) => ({ biases: l.biases.slice(), weights: l.weights.map((r) => r.slice()) }));
      return network.soft || network.useSpeed ? { soft: !!network.soft, useSpeed: !!network.useSpeed, levels } : levels;
    }
    static fromData(data) {
      const levels = Array.isArray(data) ? data : data.levels;
      const counts = [levels[0].weights.length, ...levels.map((l) => l.biases.length)];
      const n = new NeuralNetwork(counts);
      levels.forEach((l, i) => {
        n.levels[i].biases = l.biases.slice();
        n.levels[i].weights = l.weights.map((r) => r.slice());
      });
      if (!Array.isArray(data)) { n.soft = data.soft; n.useSpeed = data.useSpeed; }
      return n;
    }
    static clone(network) {
      return NeuralNetwork.fromData(NeuralNetwork.toData(network));
    }
    static shape(network) {
      return [network.levels[0].inputs.length, ...network.levels.map((l) => l.outputs.length)];
    }
  }

  // ---------- road ----------
  // The road's middle line wiggles left/right as you go up (y gets smaller).
  // curve = 0 → straight. Borders are many short segments so sensors work on curves.
  class Road {
    constructor(x, width, laneCount = 3, curve = 0, seed = 1) {
      this.x = x;
      this.width = width;
      this.laneCount = laneCount;
      this.curve = curve;
      this.left = x - width / 2; // edges of the straight part (crossroads use these)
      this.right = x + width / 2;
      const r = seeded(seed * 7919 + 13);
      this.ph1 = r() * Math.PI * 2;
      this.ph2 = r() * Math.PI * 2;
      this.segLen = 30;
      this.y0 = 900;
      const n = 800;
      this.leftPts = [];
      this.rightPts = [];
      for (let k = 0; k <= n; k++) {
        const y = this.y0 - k * this.segLen;
        const c = this.cx(y);
        this.leftPts.push({ x: c - width / 2, y });
        this.rightPts.push({ x: c + width / 2, y });
      }
    }
    cx(y) {
      if (!this.curve) return this.x;
      const t = 100 - y;
      const ramp = Math.max(0, Math.min(1, (t - 150) / 600));
      return this.x + ramp * this.curve * (75 * Math.sin(t / 450 + this.ph1) + 30 * Math.sin(t / 210 + this.ph2));
    }
    // Which way the road points at height y (radians, same convention as Car.angle).
    heading(y) {
      return Math.atan(-(this.cx(y - 1) - this.cx(y + 1)) / 2);
    }
    laneX(i, y) {
      const w = this.width / this.laneCount;
      return this.cx(y) - this.width / 2 + w / 2 + Math.min(i, this.laneCount - 1) * w;
    }
    getLaneCenter(i, y = 100) {
      return this.laneX(i, y);
    }
    // Border segments within `range` of height y.
    bordersNear(y, range = 180) {
      const a = Math.max(0, Math.floor((this.y0 - (y + range)) / this.segLen));
      const b = Math.min(this.leftPts.length - 1, Math.ceil((this.y0 - (y - range)) / this.segLen));
      // Hundreds of cars ask for the same stretch every step: reuse the answer.
      const key = a * 4096 + b;
      if (!this._cache) this._cache = new Map();
      const hit = this._cache.get(key);
      if (hit) return hit;
      if (this._cache.size > 2000) this._cache.clear();
      const out = [];
      for (let k = a; k < b; k++) {
        out.push([this.leftPts[k], this.leftPts[k + 1]]);
        out.push([this.rightPts[k], this.rightPts[k + 1]]);
      }
      this._cache.set(key, out);
      return out;
    }
  }

  // Traffic cars glide along their lane, following the bends.
  function followRoad(car, road) {
    car.angle = road.heading(car.y);
    car.update([], []);
    car.x = road.laneX(car.lane, car.y);
    car.polygon = car.createPolygon();
  }

  // ---------- sensor ----------
  class Sensor {
    constructor(car, rayCount = 5, rayLength = 150, raySpread = Math.PI / 2) {
      this.car = car;
      this.rayCount = rayCount;
      this.rayLength = rayLength;
      this.raySpread = raySpread;
      this.rays = [];
      this.readings = [];
    }
    update(roadBorders, traffic) {
      this.castRays();
      this.readings = this.rays.map((ray) => this.getReading(ray, roadBorders, traffic));
    }
    getReading(ray, roadBorders, traffic) {
      let best = null;
      for (const b of roadBorders) {
        const t = getIntersection(ray[0], ray[1], b[0], b[1]);
        if (t && (!best || t.offset < best.offset)) best = t;
      }
      for (const other of traffic) {
        const poly = other.polygon;
        for (let j = 0; j < poly.length; j++) {
          const t = getIntersection(ray[0], ray[1], poly[j], poly[(j + 1) % poly.length]);
          if (t && (!best || t.offset < best.offset)) best = t;
        }
      }
      return best;
    }
    castRays() {
      this.rays.length = 0;
      for (let i = 0; i < this.rayCount; i++) {
        const t = this.rayCount === 1 ? 0.5 : i / (this.rayCount - 1);
        const a = lerp(this.raySpread / 2, -this.raySpread / 2, t) + this.car.angle;
        const start = { x: this.car.x, y: this.car.y };
        const end = { x: this.car.x - Math.sin(a) * this.rayLength, y: this.car.y - Math.cos(a) * this.rayLength };
        this.rays.push([start, end]);
      }
    }
  }

  // ---------- car ----------
  class Car {
    // type: "AI" (brain drives), "KEYS" (a human drives), "DUMMY" (traffic)
    constructor(x, y, type, opts = {}) {
      this.x = x;
      this.y = y;
      this.width = 30;
      this.height = 50;
      this.speed = 0;
      this.acceleration = 0.2;
      this.maxSpeed = type === "DUMMY" ? opts.maxSpeed || 1 : 3.5;
      this.friction = 0.05;
      this.angle = 0;
      this.damaged = false;
      this.type = type;
      this.controls = { forward: type === "DUMMY", left: false, right: false, reverse: false };
      if (type !== "DUMMY") this.sensor = new Sensor(this, opts.rays || 5);
      // lightEye: one extra input that glows when a red light is coming up.
      this.lightEye = !!opts.lightEye;
      if (type === "AI") this.brain = opts.brain || new NeuralNetwork([this.sensor.rayCount + (this.lightEye ? 1 : 0), opts.hidden || 6, 4]);
      this.polygon = this.createPolygon();
    }
    // walls: things you can bump but not see (a red light's stop line).
    update(roadBorders, traffic, light = 0, walls = []) {
      if (this.damaged) return;
      this.move();
      this.polygon = this.createPolygon();
      this.damaged = this.assessDamage(walls.length ? roadBorders.concat(walls) : roadBorders, traffic);
      if (walls.length && this.damaged && !this.assessDamage(roadBorders, traffic)) this.ranRed = true;
      this.light = light;
      if (this.sensor) {
        this.sensor.update(roadBorders, traffic);
        if (this.brain) {
          const inputs = this.sensor.readings.map((r) => (r == null ? 0 : 1 - r.offset));
          if (this.lightEye) inputs.push(light);
          if (this.brain.useSpeed) inputs.push(this.speed / this.maxSpeed);
          this.inputs = inputs;
          const out = NeuralNetwork.feedForward(inputs, this.brain);
          this.controls.forward = out[0] > 0.5;
          this.controls.left = out[1] > 0.5;
          this.controls.right = out[2] > 0.5;
          this.controls.reverse = out[3] > 0.5;
        }
      }
    }
    assessDamage(roadBorders, traffic) {
      for (const b of roadBorders) if (polysIntersect(this.polygon, b)) return true;
      for (const t of traffic) if (polysIntersect(this.polygon, t.polygon)) return true;
      return false;
    }
    createPolygon() {
      const rad = Math.hypot(this.width, this.height) / 2;
      const alpha = Math.atan2(this.width, this.height);
      const s = Math.sin, c = Math.cos, a = this.angle;
      return [
        { x: this.x - s(a - alpha) * rad, y: this.y - c(a - alpha) * rad },
        { x: this.x - s(a + alpha) * rad, y: this.y - c(a + alpha) * rad },
        { x: this.x - s(Math.PI + a - alpha) * rad, y: this.y - c(Math.PI + a - alpha) * rad },
        { x: this.x - s(Math.PI + a + alpha) * rad, y: this.y - c(Math.PI + a + alpha) * rad },
      ];
    }
    move() {
      if (this.controls.forward) this.speed += this.acceleration;
      if (this.controls.reverse) this.speed -= this.acceleration;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
      if (this.speed < -this.maxSpeed / 2) this.speed = -this.maxSpeed / 2;
      if (this.speed > 0) this.speed -= this.friction;
      if (this.speed < 0) this.speed += this.friction;
      if (Math.abs(this.speed) < this.friction) this.speed = 0;
      if (this.speed !== 0) {
        const flip = this.speed > 0 ? 1 : -1;
        if (this.controls.left) this.angle += 0.03 * flip;
        if (this.controls.right) this.angle -= 0.03 * flip;
      }
      this.x -= Math.sin(this.angle) * this.speed;
      this.y -= Math.cos(this.angle) * this.speed;
    }
  }

  // ---------- traffic ----------
  const TRAFFIC_SPEED = 1;
  // Rows of slow cars ahead. Each row blocks 1 or 2 of the 3 lanes, never all.
  // Tuned in Node so a fresh population usually finishes in ~3–25 rounds.
  const DIFFICULTY = { rows: 30, pTwo: 0.6, gap: 220, gapJitter: 70 };
  const DIFFICULTY_CURVY = { rows: 26, pTwo: 0.35, gap: 260, gapJitter: 80 };
  const DIFFICULTY_CROSS = { rows: 16, pTwo: 0.15, gap: 520, gapJitter: 160 };
  function makeTraffic(road, seed, d = road.curve ? DIFFICULTY_CURVY : DIFFICULTY) {
    const rows = d.rows;
    const rnd = seeded(seed);
    const cars = [];
    let y = -320;
    for (let r = 0; r < rows; r++) {
      const lanes = [0, 1, 2];
      for (let i = lanes.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
      }
      const count = r < 1 ? 1 : rnd() < d.pTwo ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const jitter = (rnd() - 0.5) * 40;
        const ty = y + jitter;
        const c = new Car(road.laneX(lanes[k], ty), ty, "DUMMY", { maxSpeed: TRAFFIC_SPEED });
        c.lane = lanes[k];
        c.angle = road.heading(ty);
        c.polygon = c.createPolygon();
        cars.push(c);
      }
      y -= d.gap + rnd() * d.gapJitter;
    }
    return { cars, finishY: y - 60 };
  }

  // ---------- one generation of learners ----------
  const STALL_STEPS = 220;
  const STALL_STEPS_CROSS = 260; // long enough to wait out a red light

  // ---------- crossroads ----------
  // Each crossing has a traffic light. Red = an invisible wall at the stop line that the
  // eyes can see (drive through it = ran a red light = crash) and cars zooming across.
  const LIGHT_CYCLE = 360, GREEN = 170, YELLOW = 55; // steps; the last 55 of green are yellow, red lasts 190
  function makeCrossings(seed) {
    const rnd = seeded(seed * 31 + 5);
    const list = [];
    let y = -450;
    for (let i = 0; i < 16; i++) {
      list.push({ y, offset: Math.floor(rnd() * LIGHT_CYCLE), red: false, phase: 0 });
      y -= 520 + rnd() * 200;
    }
    return { list, finishY: y + 250 };
  }
  const MAX_STEPS = 60 * 75;

  class World {
    constructor(opts) {
      this.opts = Object.assign({ population: 200, mutation: 0.15, rays: 5, hidden: 6, seed: 1, parent: null, curve: 0, cross: false }, opts);
      this.cross = !!this.opts.cross;
      this.road = new Road(150, 240, 3, this.cross ? 0 : this.opts.curve, this.opts.seed);
      this.crossCars = [];
      if (this.cross) {
        const c = makeCrossings(this.opts.seed);
        this.crossings = c.list;
        this.traffic = makeTraffic(this.road, this.opts.seed, DIFFICULTY_CROSS).cars;
        for (const t of this.traffic) t.maxSpeed = 2.4; // town traffic moves quicker, so you're not stuck behind it forever
        this.finishY = c.finishY;
      } else {
        this.crossings = [];
        const t = makeTraffic(this.road, this.opts.seed);
        this.traffic = t.cars;
        this.finishY = t.finishY; // in the traffic's moving frame
      }
      this.startY = 100;
      this.steps = 0;
      this.cars = [];
      const { population, mutation, rays, hidden, parent } = this.opts;
      for (let i = 0; i < population; i++) {
        let brain;
        if (parent) {
          brain = NeuralNetwork.clone(parent);
          // car 0 = exact copy of the parent (the "champion"). The rest get a spread of changes:
          // early babies get tiny tweaks, later ones bolder ideas, so the family never gets stuck.
          if (i > 0) NeuralNetwork.mutate(brain, Math.min(1, mutation * (0.4 + (2.6 * i) / population)));
        }
        const car = new Car(this.road.laneX(1, this.startY), this.startY, "AI", { rays, hidden, brain, lightEye: this.cross });
        car.progress = 0;
        car.bestProgress = 0;
        car.lastImprove = 0;
        car.index = i;
        this.cars.push(car);
      }
      this.leader = this.cars[0];
      this.finished = null;
      this.done = false;
    }
    // How far ahead of the traffic flow a car has got (traffic itself creeps forward).
    trafficTravel() {
      return this.cross ? 0 : TRAFFIC_SPEED * this.steps;
    }
    // Move everything that isn't a learner: lane traffic, lights, cross traffic.
    envStep() {
      for (const t of this.traffic) if (!this.mustWait(t)) followRoad(t, this.road);
      for (const c of this.crossings) {
        c.phase = (this.steps + c.offset) % LIGHT_CYCLE;
        c.red = c.phase >= GREEN;
        c.yellow = !c.red && c.phase >= GREEN - YELLOW;
        // Cross cars only set off early in the red, so the crossing is clear by green.
        const sinceRed = c.phase - GREEN;
        if (c.red && sinceRed < LIGHT_CYCLE - GREEN - 90 && sinceRed % 28 === 0) {
          const dir = (sinceRed / 28) % 2 ? 1 : -1; // 1 = left→right
          const car = new Car(dir > 0 ? this.road.left - 60 : this.road.right + 60, c.y + (dir > 0 ? 18 : -18), "DUMMY", { maxSpeed: 3 });
          car.angle = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          car.speed = 3;
          car.dir = dir;
          car.polygon = car.createPolygon();
          this.crossCars.push(car);
        }
      }
      for (const car of this.crossCars) car.update([], []);
      this.crossCars = this.crossCars.filter((car) => car.x > this.road.left - 120 && car.x < this.road.right + 120);
    }
    // Traffic obeys the lights: stop before a red/yellow stop line, and don't bump the car in front.
    mustWait(t) {
      for (const c of this.crossings) {
        const d = t.y - (c.y + 60);
        if ((c.red || c.yellow) && d > 20 && d < 40) return true;
      }
      for (const o of this.traffic) if (o !== t && o.lane === t.lane && t.y - o.y > 0 && t.y - o.y < 62) return true;
      return false;
    }
    bordersAt(y) {
      return this.road.bordersNear(y); // shared, read-only
    }
    // Red-light stop lines near height y: bump one and you ran a red light.
    wallsAt(y) {
      const w = [];
      for (const c of this.crossings)
        if (c.red && Math.abs(c.y + 60 - y) < 120) w.push([{ x: this.road.left - 40, y: c.y + 60 }, { x: this.road.right + 40, y: c.y + 60 }]);
      return w;
    }
    // The light eye: 0 = no red ahead, rising to 1 as a red stop line gets close.
    lightAt(y) {
      for (const c of this.crossings) {
        const d = y - (c.y + 60);
        if ((c.red || c.yellow) && d > 0 && d < 180) return 1 - d / 180;
      }
      return 0;
    }
    trafficNear(y) {
      const out = this.traffic.filter((t) => Math.abs(t.y - y) < 220);
      for (const c of this.crossCars) if (Math.abs(c.y - y) < 220) out.push(c);
      return out;
    }
    step() {
      if (this.done) return;
      this.steps++;
      this.envStep();
      const travel = this.trafficTravel();
      let alive = 0;
      let leader = null;
      for (const car of this.cars) {
        if (!car.damaged) {
          // Only look at traffic close by (fast + same result).
          if (this.cross) car.update(this.bordersAt(car.y), this.trafficNear(car.y), this.lightAt(car.y), this.wallsAt(car.y));
          else car.update(this.bordersAt(car.y), this.trafficNear(car.y));
          car.progress = this.startY - car.y - travel;
          if (car.progress > car.bestProgress + 0.5) {
            car.bestProgress = car.progress;
            car.lastImprove = this.steps;
          }
          if (this.steps - car.lastImprove > (this.cross ? STALL_STEPS_CROSS : STALL_STEPS)) {
            car.damaged = true;
            car.stalled = true;
          }
          if (car.damaged) car.diedAt = this.steps;
          else alive++;
          if (!car.damaged && car.y < this.finishLineY()) this.finished = car;
        }
        if (!leader || car.bestProgress > leader.bestProgress || (car.bestProgress === leader.bestProgress && !car.damaged && leader.damaged)) leader = car;
      }
      this.leader = leader;
      this.alive = alive;
      if (this.finished || alive === 0 || this.steps >= (this.cross ? MAX_STEPS * 3 : MAX_STEPS)) this.done = true;
    }
    finishLineY() {
      return this.finishY - this.trafficTravel();
    }
    courseLength() {
      return this.startY - this.finishY;
    }
    // The front-most living car — the camera likes to follow it.
    front() {
      let best = null;
      for (const c of this.cars) if (!c.damaged && (!best || c.y < best.y)) best = c;
      return best || this.leader;
    }
  }

  const CURVY = 0.8;
  const api = { CURVY, DIFFICULTY_CURVY, followRoad, DIFFICULTY, lerp, seeded, getIntersection, polysIntersect, Level, NeuralNetwork, Road, Sensor, Car, World, makeTraffic, TRAFFIC_SPEED };
  root.CarSim = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
