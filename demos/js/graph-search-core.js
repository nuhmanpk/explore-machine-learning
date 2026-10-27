// Search Engine core: tiny documents, tokenizer (stop-words, crude stemmer), real TF-IDF + cosine ranking, PageRank popularity.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // [title, text, topic]
  const RAW = [
    ["Cat naps", "Cats sleep for most of the day and love warm sunny spots", "pets"],
    ["Chasing mice", "The cat chases a tiny mouse across the kitchen floor", "pets"],
    ["Puppy school", "A puppy learns to sit and stay and fetch a ball", "pets"],
    ["Dog walks", "Dogs love running in the park and chasing sticks", "pets"],
    ["Fish tank", "Colourful fish swim in a tank with green plants", "pets"],
    ["Hamster wheel", "The hamster runs on a wheel all night long", "pets"],
    ["Moon facts", "The moon circles the Earth and changes shape in the sky", "space"],
    ["Mars rover", "A little rover drives over red rocks on Mars", "space"],
    ["Rocket launch", "The rocket launches into space with a huge roar of fire", "space"],
    ["Stars at night", "Stars are far away suns that shine in the night sky", "space"],
    ["Space station", "Astronauts live and work on the space station above the Earth", "space"],
    ["Pizza night", "Pizza with cheese and tomato is baked in a hot oven", "food"],
    ["Pancake day", "Flip the pancakes in the pan and add sweet syrup", "food"],
    ["Fruit salad", "Chop apples and bananas and berries for a fresh fruit salad", "food"],
    ["Soup recipe", "Warm tomato soup with bread is a lovely lunch", "food"],
    ["Baking cookies", "Mix flour and sugar and butter then bake the cookies", "food"],
    ["Bike repair", "Fix a flat tyre on your bike with a patch and a pump", "bikes"],
    ["Bike race", "Riders race their bikes up the hill as fast as they can", "bikes"],
    ["Helmet safety", "Always wear a helmet when riding a bike or a scooter", "bikes"],
    ["Mountain trail", "A muddy mountain trail is great for bikes and for hiking", "bikes"],
    ["Rainy days", "Rain falls from grey clouds and puddles fill the street", "weather"],
    ["Snow fun", "Snow covers the hill so we ride sleds and build a snowman", "weather"],
    ["Thunder storm", "Thunder rumbles and lightning flashes in the dark sky", "weather"],
    ["Sunny day", "A sunny day is perfect for the park and a picnic", "weather"],
    ["Guitar lesson", "Learn three chords on the guitar and play a simple song", "music"],
    ["Drum beats", "Drums keep the beat while the band plays a loud song", "music"],
    ["Piano practice", "Practise piano every day and the songs get easier", "music"],
    ["Picnic plan", "Pack sandwiches and fruit for a picnic in the park", "food"],
    ["Sky watching", "Look up at the clouds and the moon from the park", "weather"],
    ["Space snacks", "Astronauts eat dried food and drink from pouches in space", "space"],
  ];
  const DOCS = RAW.map((d, i) => ({ id: i, title: d[0], text: d[1], topic: d[2] }));
  const STOP = new Set("a an the of and or to in on at for with is are was were it its that this as by from be so up all can".split(" "));

  function stem(w) {
    if (w.length <= 3) return w;
    if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + "y";
    else if (/(ss|us)$/.test(w)) { /* keep: grass, bus */ }
    else if (/(s|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
    else if (/s$/.test(w)) w = w.slice(0, -1);
    if (/ing$/.test(w) && w.length > 5) { w = w.slice(0, -3); if (/([^aeiou])\1$/.test(w)) w = w.slice(0, -1); }
    else if (/ed$/.test(w) && w.length > 4) { w = w.slice(0, -2); if (/([^aeiou])\1$/.test(w)) w = w.slice(0, -1); }
    if (/e$/.test(w) && w.length > 3) w = w.slice(0, -1);
    return w;
  }
  function tokenize(text, o) {
    o = o || {};
    let t = (String(text).toLowerCase().match(/[a-z0-9]+/g) || []);
    if (o.stop) t = t.filter((w) => !STOP.has(w));
    if (o.stem) t = t.map(stem);
    return t;
  }

  class Index {
    constructor(docs, opts) {
      this.o = { stop: !!(opts && opts.stop), stem: !!(opts && opts.stem) }; this.docs = docs;
      this.toks = docs.map((d) => tokenize(d.title + " " + d.text, this.o));
      this.df = new Map();
      this.toks.forEach((t) => new Set(t).forEach((w) => this.df.set(w, (this.df.get(w) || 0) + 1)));
      this.N = docs.length;
      this.vec = this.toks.map((t) => {
        const c = new Map(); t.forEach((w) => c.set(w, (c.get(w) || 0) + 1));
        const v = new Map(); let n2 = 0;
        c.forEach((k, w) => { const x = (1 + Math.log(k)) * this.idf(w); v.set(w, x); n2 += x * x; });
        const nn = Math.sqrt(n2) || 1; v.forEach((x, w) => v.set(w, x / nn));
        return v;
      });
    }
    idf(w) { return Math.log((this.N + 1) / ((this.df.get(w) || 0) + 1)) + 1; }
    queryVec(q) {
      const c = new Map(); tokenize(q, this.o).forEach((w) => c.set(w, (c.get(w) || 0) + 1));
      const v = new Map(); let n2 = 0;
      c.forEach((k, w) => { if (!this.df.has(w)) return; const x = (1 + Math.log(k)) * this.idf(w); v.set(w, x); n2 += x * x; });
      const nn = Math.sqrt(n2) || 1; v.forEach((x, w) => v.set(w, x / nn));
      return v;
    }
    // results: docs sharing at least one word with the query; score = (1-mix)*cosine + mix*popularity(0..1)
    search(q, mix, pop) {
      const qv = this.queryVec(q), res = [];
      this.vec.forEach((dv, id) => {
        const parts = []; let cos = 0;
        qv.forEach((qw, w) => { const dw = dv.get(w); if (dw) { const c = qw * dw; parts.push({ w, c, idf: this.idf(w) }); cos += c; } });
        if (!parts.length) return;
        parts.sort((a, b) => b.c - a.c);
        const p = pop ? pop[id] : 0, m = mix || 0;
        res.push({ id, cos, pop: p, parts, score: (1 - m) * cos + m * p });
      });
      res.sort((a, b) => b.score - a.score || a.id - b.id);
      return res;
    }
  }

  // popularity: docs "see also" link to other docs (seeded, mostly same topic, rich-get-richer); PageRank by power iteration
  function links(seed) {
    const r = rng(seed || 11), n = DOCS.length, inc = new Array(n).fill(1), out = [];
    for (let i = 0; i < n; i++) {
      const o = new Set(), k = 2 + Math.floor(r() * 2);
      while (o.size < k) {
        const cand = []; for (let j = 0; j < n; j++) if (j !== i && !o.has(j)) cand.push([j, inc[j] * (DOCS[j].topic === DOCS[i].topic ? 4 : 1)]);
        let tot = cand.reduce((s, c) => s + c[1], 0), x = r() * tot, pick = cand[cand.length - 1][0];
        for (const c of cand) { x -= c[1]; if (x <= 0) { pick = c[0]; break; } }
        o.add(pick); inc[pick]++;
      }
      out.push([...o]);
    }
    return out;
  }
  function pagerank(out, d) {
    d = d == null ? 0.85 : d; const n = out.length; let r = new Array(n).fill(1 / n);
    for (let it = 0; it < 100; it++) {
      const nx = new Array(n).fill((1 - d) / n);
      out.forEach((o, i) => o.forEach((j) => { nx[j] += (d * r[i]) / o.length; }));
      r = nx;
    }
    return r;
  }
  function popularity(seed) { const pr = pagerank(links(seed)), mx = Math.max(...pr); return pr.map((v) => v / mx); }

  const core = { rng, DOCS, STOP, stem, tokenize, Index, links, pagerank, popularity };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.GraphSearchCore = core;
})(typeof window !== "undefined" ? window : globalThis);
