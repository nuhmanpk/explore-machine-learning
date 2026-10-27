// Tidy the Mess core: a messy table (missing values, unit typos, outliers), real cleaning rules,
// and a least-squares line scored on clean held-out rows. Pure logic; runs in Node and the browser.
(function (root) {
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const NAMES = ["Rex", "Bella", "Max", "Luna", "Charlie", "Daisy", "Milo", "Coco", "Buddy", "Ruby", "Oscar", "Lola", "Teddy", "Zoe", "Jack", "Molly", "Toby", "Pippa", "Finn", "Nala"];
  // Truth: weight_kg = 0.4 * height_cm - 6 + noise. Dogs 30 to 90 cm tall.
  function trueY(h, r) { return 0.4 * h - 6 + (r() - 0.5) * 5; }

  // flags: ok | missing | typo | outlier
  function makeData(seed, n) {
    n = n || 60;
    const r = rng(seed), train = [];
    for (let i = 0; i < n; i++) {
      const h = 30 + r() * 60, y = trueY(h, r);
      train.push({ id: i, name: NAMES[i % NAMES.length] + (i >= NAMES.length ? " " + (1 + Math.floor(i / NAMES.length)) : ""), x: +h.toFixed(1), y: +y.toFixed(1), flag: "ok", cleanX: +h.toFixed(1), cleanY: +y.toFixed(1) });
    }
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const nm = Math.round(n * 0.14), nt = Math.round(n * 0.08), no = Math.round(n * 0.06);
    let p = 0;
    for (let i = 0; i < nm; i++, p++) { const d = train[idx[p]]; d.flag = "missing"; if (r() < 0.5) d.x = null; else d.y = null; }
    for (let i = 0; i < nt; i++, p++) { const d = train[idx[p]]; d.flag = "typo"; if (r() < 0.5) d.x = +(d.cleanX * 10).toFixed(1); else d.y = +(d.cleanY / 10).toFixed(2); } // decimal slips
    for (let i = 0; i < no; i++, p++) { const d = train[idx[p]]; d.flag = "outlier"; d.y = +(d.cleanY * (3 + r() * 3)).toFixed(1); }
    const test = [];
    for (let i = 0; i < 80; i++) { const h = 30 + r() * 60; test.push({ x: h, y: trueY(h, r) }); }
    return { train, test };
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
  }
  const col = (rows, k) => rows.map((d) => d[k]).filter((v) => v != null).sort((a, b) => a - b);
  // Tukey fences: anything beyond 1.5 x IQR from the quartiles counts as "wild".
  function fences(rows, k) {
    const s = col(rows, k), q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
    return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
  }
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const median = (s) => quantile(s, 0.5);

  // opts: missing = leave|drop|mean|median|predict ; wild = leave|drop|clip.  "leave" for missing means blank is read as 0.
  function clean(train, opts) {
    const f = { x: fences(train, "x"), y: fences(train, "y") };
    const wildOf = (v, k) => v != null && (v < f[k].lo || v > f[k].hi);
    let rows = train.map((d) => ({ id: d.id, flag: d.flag, rawX: d.x, rawY: d.y, x: d.x, y: d.y, changed: false, dropped: false }));
    for (const d of rows) {
      for (const k of ["x", "y"]) {
        if (wildOf(d[k], k)) {
          if (opts.wild === "drop") d.dropped = true;
          else if (opts.wild === "clip") { d[k] = Math.min(f[k].hi, Math.max(f[k].lo, d[k])); d.changed = true; }
        }
      }
    }
    if (opts.missing === "drop") rows.forEach((d) => { if (d.x == null || d.y == null) d.dropped = true; });
    const live = rows.filter((d) => !d.dropped);
    const stat = { x: 0, y: 0 };
    for (const k of ["x", "y"]) { const s = col(live, k); stat[k] = opts.missing === "median" ? median(s) : mean(s); }
    // "predict": fit a line through the complete rows, fill the blank from the other column.
    let fy = null, fx = null;
    if (opts.missing === "predict") {
      const full = live.filter((d) => d.x != null && d.y != null);
      fy = fitLine(full);
      fx = fitLine(full.map((d) => ({ x: d.y, y: d.x })));
    }
    for (const d of live) {
      if (d.x == null && d.y == null) { d.x = stat.x; d.y = stat.y; d.changed = true; continue; }
      for (const k of ["x", "y"]) {
        if (d[k] != null) continue;
        d.changed = true;
        if (opts.missing === "mean" || opts.missing === "median") d[k] = stat[k];
        else if (opts.missing === "predict") d[k] = k === "y" ? fy.a * d.x + fy.b : fx.a * d.y + fx.b;
        else d[k] = 0;
      }
    }
    return { rows, kept: live, dropped: rows.length - live.length, fences: f, fill: stat };
  }

  function fitLine(rows) {
    const n = rows.length;
    if (n < 2) return { a: 0, b: n ? rows[0].y : 0 };
    const mx = mean(rows.map((d) => d.x)), my = mean(rows.map((d) => d.y));
    let sxx = 0, sxy = 0;
    for (const d of rows) { sxx += (d.x - mx) * (d.x - mx); sxy += (d.x - mx) * (d.y - my); }
    const a = sxx > 1e-9 ? sxy / sxx : 0;
    return { a, b: my - a * mx };
  }
  // R-squared and mean absolute error on clean held-out rows. score = R2 clamped to 0..1.
  function evaluate(line, test) {
    const my = mean(test.map((d) => d.y));
    let ssr = 0, sst = 0, ae = 0;
    for (const d of test) { const p = line.a * d.x + line.b; ssr += (d.y - p) ** 2; sst += (d.y - my) ** 2; ae += Math.abs(d.y - p); }
    const r2 = 1 - ssr / sst;
    return { r2, score: Math.max(0, r2), mae: ae / test.length };
  }
  function run(data, opts) { const c = clean(data.train, opts), line = fitLine(c.kept), ev = evaluate(line, data.test); return Object.assign({ line, cleaned: c }, ev); }

  const core = { rng, makeData, clean, fences, fitLine, evaluate, run, quantile };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.DataCleanCore = core;
})(typeof window !== "undefined" ? window : globalThis);
