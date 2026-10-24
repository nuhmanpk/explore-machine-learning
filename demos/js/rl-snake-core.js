// Snake Learns to Eat — game + tabular Q-learning on 11 yes/no feelings. No DOM; runs in Node too.
(function (root) {
  const N = 16; // grid is N × N
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left (clockwise)

  // Challenges the page can switch on while Robo is learning.
  // rocks: a few rocks in the garden. big: a bigger garden. hop: the apple jumps away if you're slow.
  // wrap: walls wrap around (go off one side, come back on the other).
  const world = { rocks: false, big: false, hop: false, wrap: false };

  class Game {
    constructor() {
      this.n = world.big ? 22 : N;
      this.wrap = world.wrap;
      const m = Math.floor(this.n / 2);
      this.snake = [{ x: m, y: m }, { x: m, y: m + 1 }, { x: m, y: m + 2 }];
      this.dir = 0;
      this.score = 0;
      this.steps = 0;
      this.hungry = 0; // steps since last food
      this.dead = false;
      this.rocks = [];
      this.rockDensity = world.rockDensity || 0.02;
      if (world.rocks) {
        const count = Math.round(this.n * this.n * this.rockDensity);
        for (let tries = 0; this.rocks.length < count && tries < 500; tries++) {
          const x = Math.floor(Math.random() * this.n), y = Math.floor(Math.random() * this.n);
          if (Math.abs(x - m) <= 1 && y >= m - 3) continue; // keep the start lane clear
          if (!this.rocks.some((r) => r.x === x && r.y === y)) this.rocks.push({ x, y });
        }
      }
      this.placeFood();
    }
    isRock(x, y) { return this.rocks.some((r) => r.x === x && r.y === y); }
    wrapXY(x, y) { return this.wrap ? { x: (x + this.n) % this.n, y: (y + this.n) % this.n } : { x, y }; }
    placeFood() {
      const free = [];
      for (let x = 0; x < this.n; x++) for (let y = 0; y < this.n; y++) if (!this.snake.some((s) => s.x === x && s.y === y) && !this.isRock(x, y)) free.push({ x, y });
      this.food = free[Math.floor(Math.random() * free.length)];
      this.foodAge = 0;
    }
    blocked(x, y) {
      // the tail tip moves away this step, so it doesn't count
      ({ x, y } = this.wrapXY(x, y));
      return x < 0 || y < 0 || x >= this.n || y >= this.n || this.isRock(x, y) || this.snake.slice(0, -1).some((s) => s.x === x && s.y === y);
    }
    // turn: 0 = straight, 1 = turn right, 2 = turn left
    step(turn) {
      if (this.dead) return 0;
      this.steps++;
      this.hungry++;
      if (turn === 1) this.dir = (this.dir + 1) % 4;
      if (turn === 2) this.dir = (this.dir + 3) % 4;
      const [dx, dy] = DIRS[this.dir];
      const h = this.wrapXY(this.snake[0].x + dx, this.snake[0].y + dy);
      if (this.blocked(h.x, h.y) || this.hungry > 120 + this.n * 2 + this.snake.length * 4) {
        this.dead = true;
        return -10;
      }
      this.snake.unshift(h);
      if (h.x === this.food.x && h.y === this.food.y) {
        this.score++;
        this.hungry = 0;
        if (this.snake.length >= this.n * this.n - this.rocks.length) { this.dead = true; return 10; }
        this.placeFood();
        return 10;
      }
      this.snake.pop();
      if (world.hop && ++this.foodAge > (world.hopAfter || 14)) this.placeFood(); // too slow: the apple hops somewhere else
      return -0.01;
    }
    // The snake's feelings: danger straight/right/left, which way it's heading, where the food is.
    sense() {
      const head = this.snake[0];
      const look = (d) => { const [dx, dy] = DIRS[d]; return this.blocked(head.x + dx, head.y + dy); };
      return {
        dangerStraight: look(this.dir),
        dangerRight: look((this.dir + 1) % 4),
        dangerLeft: look((this.dir + 3) % 4),
        dir: this.dir,
        foodUp: this.food.y < head.y,
        foodDown: this.food.y > head.y,
        foodLeft: this.food.x < head.x,
        foodRight: this.food.x > head.x,
      };
    }
  }

  function stateKey(s) {
    let k = (s.dangerStraight ? 1 : 0) | (s.dangerRight ? 2 : 0) | (s.dangerLeft ? 4 : 0);
    k |= s.dir << 3;
    k |= (s.foodUp ? 1 : 0) << 5 | (s.foodDown ? 1 : 0) << 6 | (s.foodLeft ? 1 : 0) << 7 | (s.foodRight ? 1 : 0) << 8;
    return k;
  }

  class Agent {
    constructor() {
      this.Q = new Map(); // key → [straight, right, left]
      this.alpha = 0.3;
      this.gamma = 0.9;
      this.epsilon = 0.1;
    }
    q(k) {
      let v = this.Q.get(k);
      if (!v) { v = [0, 0, 0]; this.Q.set(k, v); }
      return v;
    }
    act(k, explore = true) {
      if (explore && Math.random() < this.epsilon) return Math.floor(Math.random() * 3);
      const v = this.q(k);
      let best = 0;
      for (let i = 1; i < 3; i++) if (v[i] > v[best]) best = i;
      return best;
    }
    learn(k, a, r, k2, done) {
      const v = this.q(k);
      const target = done ? r : r + this.gamma * Math.max(...this.q(k2));
      v[a] += this.alpha * (target - v[a]);
    }
    clone() {
      const c = new Agent();
      for (const [k, v] of this.Q) c.Q.set(k, v.slice());
      return c;
    }
  }

  function playEpisode(agent, learn = true, maxSteps = 5000) {
    const g = new Game();
    let k = stateKey(g.sense());
    while (!g.dead && g.steps < maxSteps) {
      const a = agent.act(k, learn);
      const r = g.step(a);
      const k2 = g.dead ? k : stateKey(g.sense());
      if (learn) agent.learn(k, a, r, k2, g.dead);
      k = k2;
    }
    return g.score;
  }

  const api = { world, N, DIRS, Game, Agent, stateKey, playEpisode };
  root.SnakeRL = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
