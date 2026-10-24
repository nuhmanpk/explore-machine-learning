// Tiny neural network + genetic algorithm shared by the Game Lab lessons.
// No DOM, so it also runs in Node.
(function (root) {
  // Gaussian noise (Box–Muller).
  function gauss() {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

  // A fully connected tanh network stored as one flat list of numbers ("genes").
  class Net {
    constructor(sizes, genes) {
      this.sizes = sizes;
      let n = 0;
      for (let i = 0; i < sizes.length - 1; i++) n += (sizes[i] + 1) * sizes[i + 1];
      this.genes = genes ? Float64Array.from(genes) : Float64Array.from({ length: n }, () => gauss() * 0.6);
      this.acts = sizes.map((s) => new Float64Array(s)); // last activations, for drawing
    }
    forward(input) {
      const a0 = this.acts[0];
      for (let i = 0; i < a0.length; i++) a0[i] = input[i];
      let g = 0;
      for (let l = 0; l < this.sizes.length - 1; l++) {
        const inp = this.acts[l], out = this.acts[l + 1];
        for (let j = 0; j < out.length; j++) {
          let s = this.genes[g++]; // bias
          for (let i = 0; i < inp.length; i++) s += inp[i] * this.genes[g++];
          out[j] = Math.tanh(s);
        }
      }
      return this.acts[this.acts.length - 1];
    }
    // weight from neuron i (layer l) to neuron j (layer l+1)
    weight(l, i, j) {
      let g = 0;
      for (let k = 0; k < l; k++) g += (this.sizes[k] + 1) * this.sizes[k + 1];
      return this.genes[g + j * (this.sizes[l] + 1) + 1 + i];
    }
    clone() {
      return new Net(this.sizes, this.genes);
    }
    mutate(amount) {
      for (let i = 0; i < this.genes.length; i++) if (Math.random() < 0.3) this.genes[i] += gauss() * amount;
      return this;
    }
    static crossover(a, b) {
      const c = a.clone();
      for (let i = 0; i < c.genes.length; i++) if (Math.random() < 0.5) c.genes[i] = b.genes[i];
      return c;
    }
  }

  // Next generation: keep the best few unchanged (elites), fill the rest with
  // mutated children of good parents. Mutation size is spread out: some babies
  // get tiny tweaks, others bold ones.
  function nextGeneration(brains, fitness, opts = {}) {
    const n = brains.length;
    const elite = opts.elite || Math.max(2, Math.round(n * 0.08));
    const order = brains.map((_, i) => i).sort((a, b) => fitness[b] - fitness[a]);
    const top = order.slice(0, Math.max(elite, Math.round(n * 0.25)));
    const pick = () => brains[top[Math.floor(Math.pow(Math.random(), 1.6) * top.length)]];
    const base = opts.mutation ?? 0.3;
    const out = order.slice(0, elite).map((i) => brains[i].clone());
    while (out.length < n) {
      const child = Math.random() < 0.3 ? Net.crossover(pick(), pick()) : pick().clone();
      out.push(child.mutate(base * (0.25 + 1.75 * Math.random())));
    }
    return out;
  }

  const api = { Net, nextGeneration, gauss };
  root.GameNet = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
