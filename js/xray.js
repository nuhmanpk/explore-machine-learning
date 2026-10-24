// Model X-ray — a deeper look inside a trained game model.
// A game describes its model once with ML.xray.register({...}); the X-ray then measures
// which inputs matter, maps decisions, lets you play "what if", and writes the rules it found.
//
// register({
//   title: "Bird brain",                      // shown in the header
//   kind: "Q-table" | "Neural network" | …,   // model family, one word or two
//   summary: () => "Learned from 312 tries",  // short line under the title (optional)
//   stats: () => [["Tries", 312], ["Best", "84 pipes"]],   // overview tiles (optional)
//   size: () => "255 table cells",           // how big the model is (optional)
//   inputs: [{ key, name, min, max, step?, unit?, describe?(v) }],
//   outputs: [{ name, color? }],
//   predict: (x) => number[] | null,          // scores per output (higher = more likely); null = never seen this situation
//   samples: () => number[][],                // real situations seen recently (optional, improves importance)
//   current: () => number[],                  // the situation right now (optional)
//   drawBrain: (canvas) => void,              // game-specific "inside the brain" picture (optional)
//   brainCaption: "…",                         // text under that picture (optional)
//   notes: ["…"],                              // extra plain-language facts (optional)
//   outputs: [{ name, regression: true, unit }] // one number instead of choices: map becomes a colour scale
//   inputs: []                                 // brain-only mode: just the overview, drawBrain and extraSections
//   extraSections: () => [{ title, html, icon?, wide? }]   // more cards at the end (optional)
//   brainHeight: 300                           // height of the drawBrain canvas (optional)
// })
(function () {
  let model = null;
  let el = null;
  let whatIf = [];
  let mapX = 0, mapY = 1;
  const PALETTE = ["--sup", "--rl", "--vision", "--diff", "--nn", "--lang", "--unsup"];

  const color = (o, i) => (o.color ? o.color : ML.cssVar(PALETTE[i % PALETTE.length]));
  const argmax = (a) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);
  // Turn raw scores into shares that add to 1, so bars are comparable across models.
  function shares(scores) {
    const lo = Math.min(...scores), hi = Math.max(...scores);
    const span = hi - lo || 1;
    const e = scores.map((s) => Math.exp(((s - lo) / span) * 4));
    const t = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / t);
  }
  const fmt = (inp, v) => (inp.describe ? inp.describe(v) : `${(+v).toFixed(Math.abs(inp.max - inp.min) > 20 ? 0 : 2)}${inp.unit || ""}`);

  const pr = (x) => { const v = model.predict(x); return v && v.some((n) => n !== 0) ? v : null; }; // null = unknown
  const isDiscrete = (inp) => (inp.step || 0) >= 1 && inp.max - inp.min <= 6;
  const isReg = () => model.outputs.length === 1 && !!model.outputs[0].regression;
  const noInputs = () => !model.inputs || !model.inputs.length;
  const regFmt = (v) => `${(+v).toFixed(Math.abs(v) >= 100 ? 0 : 2)}${model.outputs[0].unit || ""}`;
  function lerpColor(a, b, t) {
    const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
  }
  const REG_LO = "#2f9bff", REG_HI = "#ff8a3d";

  function randomSample() {
    return model.inputs.map((i) => i.min + Math.random() * (i.max - i.min));
  }
  function sampleSet(n = 300) {
    let s = (model.samples && model.samples()) || [];
    s = s.filter((x) => x && x.length === model.inputs.length);
    if (s.length > n) s = Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]);
    while (s.length < (model.samples ? 30 : 120)) s.push(randomSample());
    return s;
  }

  // Importance: swap one input for a value from another situation and count how often the decision changes.
  function importance() {
    const S = sampleSet();
    if (isReg()) {
      const base = S.map((x) => model.predict(x)[0]);
      const span = Math.max(...base) - Math.min(...base) || 1;
      return model.inputs.map((_, i) => {
        let d = 0;
        S.forEach((x, k) => { const y = x.slice(); y[i] = S[Math.floor(Math.random() * S.length)][i]; d += Math.abs(model.predict(y)[0] - base[k]); });
        return Math.min(1, d / S.length / span);
      });
    }
    const base = S.map((x) => { const v = pr(x); return v ? argmax(v) : -1; });
    return model.inputs.map((_, i) => {
      let flips = 0, n = 0;
      S.forEach((x, k) => {
        if (base[k] < 0) return;
        const y = x.slice();
        y[i] = S[Math.floor(Math.random() * S.length)][i];
        const v = pr(y);
        if (!v) return;
        n++;
        if (argmax(v) !== base[k]) flips++;
      });
      return n ? flips / n : 0;
    });
  }

  // Rules: sweep one input across its range (others at typical values) and describe where the decision switches.
  function rules(imp) {
    const S = sampleSet(200);
    const typical = model.inputs.map((_, i) => {
      const v = S.map((x) => x[i]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    });
    const order = imp.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 4);
    const out = [];
    for (const [v, i] of order) {
      if (v < 0.02) continue;
      const inp = model.inputs[i];
      const steps = 24;
      if (isReg()) {
        const vals = [];
        for (let k = 0; k <= steps; k++) { const x = typical.slice(); x[i] = inp.min + ((inp.max - inp.min) * k) / steps; vals.push(model.predict(x)[0]); }
        const o = model.outputs[0].name.toLowerCase(), a = vals[0], b = vals[steps];
        const hi = Math.max(...vals), lo = Math.min(...vals), span = hi - lo;
        const peak = vals.indexOf(hi);
        if (span < 1e-6) out.push(`<b>${inp.name}</b> barely changes the ${o}.`);
        else if (peak > 2 && peak < steps - 2 && hi - Math.max(a, b) > span * 0.3)
          out.push(`<b>${model.outputs[0].name}</b> is biggest when ${inp.name.toLowerCase()} is about ${fmt(inp, inp.min + ((inp.max - inp.min) * peak) / steps)}.`);
        else out.push(`As <b>${inp.name.toLowerCase()}</b> goes up, <b>${o}</b> goes ${b > a ? "up" : "down"} (${regFmt(a)} → ${regFmt(b)}).`);
        continue;
      }
      const seq = [];
      const disc = isDiscrete(inp);
      const n = disc ? Math.round(inp.max - inp.min) : steps;
      // Ask many real situations "what if only this input changed?" and take the majority answer.
      const bases = S.slice(0, 40);
      for (let k = 0; k <= n; k++) {
        const val = inp.min + ((inp.max - inp.min) * k) / n;
        const votes = new Array(model.outputs.length).fill(0);
        for (const b0 of bases) { const x = b0.slice(); x[i] = val; const v = pr(x); if (v) votes[argmax(v)]++; }
        if (votes.some((c) => c > 0)) seq.push([val, argmax(votes)]);
      }
      // Smooth out one-step blips so the rule reads cleanly.
      if (!disc) for (let k = 1; k < seq.length - 1; k++) if (seq[k - 1][1] === seq[k + 1][1]) seq[k][1] = seq[k - 1][1];
      const runs = [];
      for (const [val, a] of seq) {
        if (!runs.length || runs[runs.length - 1].a !== a) runs.push({ a, vals: [val] });
        else runs[runs.length - 1].vals.push(val);
      }
      const when = (r) => {
        if (disc) return `${inp.name.toLowerCase()} is <i>${[...new Set(r.vals.map((v) => fmt(inp, v)))].join(" or ")}</i>`;
        const a = fmt(inp, r.vals[0]), b = fmt(inp, r.vals[r.vals.length - 1]);
        return `${inp.name.toLowerCase()} is ${a === b ? a : a + " … " + b}`;
      };
      if (!runs.length) continue;
      if (runs.length === 1) {
        out.push(`<b>${inp.name}</b> alone doesn't change its mind here: it mostly <b>${model.outputs[runs[0].a].name}</b>.`);
      } else {
        const parts = runs.slice(0, 4).map((r) => `<b>${model.outputs[r.a].name}</b> when ${when(r)}`);
        out.push(parts.join("; ") + ".");
      }
    }
    return out;
  }

  // ---------- rendering ----------
  function build() {
    el = document.createElement("div");
    el.className = "xray";
    el.innerHTML = `<div class="xray-card" role="dialog" aria-modal="true" aria-label="Model X-ray">
      <header class="xray-head">
        <div class="xray-badge">${ML.icon("search")}</div>
        <div><div class="kicker" style="margin:0 0 4px">Model X-ray</div><h2 id="xr-title"></h2><p class="muted" id="xr-sum" style="margin:0"></p></div>
        <button class="icon-btn" id="xr-close" aria-label="Close">${ML.icon("x")}</button>
      </header>
      <div class="xray-body">
        <section class="xr-sec"><h3>${ML.icon("info")} The model at a glance</h3><div class="stats" id="xr-stats"></div><div id="xr-notes"></div></section>
        <section class="xr-sec"><h3>${ML.icon("eye")} What it pays attention to</h3>
          <p class="muted xr-hint">I jiggled each input and counted how often the model changed its decision. Longer bar = it matters more.</p>
          <div id="xr-imp"></div></section>
        <section class="xr-sec"><h3>${ML.icon("bulb")} Rules it discovered</h3>
          <p class="muted xr-hint">Nobody wrote these. I read them out of the trained model.</p>
          <ul id="xr-rules" class="xr-rules"></ul></section>
        <section class="xr-sec xr-wide"><h3>${ML.icon("map")} Decision map</h3>
          <p class="muted xr-hint">Every spot is a made-up situation. The colour is what the model would do there. The ring is right now.</p>
          <div class="xr-map-row">
            <div><canvas id="xr-map" width="560" height="400"></canvas>
              <div class="row" style="margin-top:8px;font-weight:800;font-size:.85rem">
                <label>Across: <select id="xr-x"></select></label><label>Up: <select id="xr-y"></select></label></div></div>
            <div class="legend" id="xr-legend" style="flex-direction:column;align-items:flex-start"></div>
          </div></section>
        <section class="xr-sec"><h3>${ML.icon("flask")} What-if lab</h3>
          <p class="muted xr-hint">Make up a situation and see what the model would do.</p>
          <div id="xr-sliders" class="xr-sliders"></div>
          <div class="xr-btns"><button class="btn small ghost" id="xr-now">${ML.icon("reset")} Use right now</button></div></section>
        <section class="xr-sec"><h3>${ML.icon("target")} Its prediction</h3><div id="xr-pred"></div><p id="xr-say" class="xr-say"></p></section>
        <section class="xr-sec xr-wide hidden" id="xr-brain-sec"><h3>${ML.icon("network")} Inside the brain</h3>
          <canvas id="xr-brain" width="900" height="300"></canvas><p class="muted xr-hint" id="xr-brain-cap"></p></section>
        <div id="xr-extra" style="display:contents"></div>
      </div></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    el.querySelector("#xr-close").addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && el.classList.contains("open")) close(); });
    el.querySelector("#xr-x").addEventListener("change", (e) => { mapX = +e.target.value; drawMap(); });
    el.querySelector("#xr-y").addEventListener("change", (e) => { mapY = +e.target.value; drawMap(); });
    el.querySelector("#xr-now").addEventListener("click", () => { useNow(); renderSliders(); renderPred(); drawMap(); });
  }

  function useNow() {
    const c = model.current && model.current();
    whatIf = c && c.length === model.inputs.length ? c.slice() : sampleSet(50)[0].slice();
    whatIf = whatIf.map((v, i) => ML.clamp(v, model.inputs[i].min, model.inputs[i].max));
  }

  function renderSliders() {
    const host = el.querySelector("#xr-sliders");
    host.innerHTML = model.inputs.map((inp, i) => {
      const step = inp.step || (inp.max - inp.min) / 100;
      return `<div class="field"><label>${inp.name} <span class="val" id="xr-v${i}">${fmt(inp, whatIf[i])}</span></label>
        <input type="range" min="${inp.min}" max="${inp.max}" step="${step}" value="${whatIf[i]}" data-i="${i}"></div>`;
    }).join("");
    host.querySelectorAll("input").forEach((s) => s.addEventListener("input", () => {
      const i = +s.dataset.i;
      whatIf[i] = +s.value;
      el.querySelector("#xr-v" + i).textContent = fmt(model.inputs[i], whatIf[i]);
      renderPred();
      drawMap();
    }));
  }

  function renderPred() {
    if (isReg()) {
      const v = model.predict(whatIf)[0];
      el.querySelector("#xr-pred").innerHTML = `<div class="xr-big"><span>${model.outputs[0].name}</span><b>${regFmt(v)}</b></div>`;
      const top = model.inputs.map((inp, i) => [lastImp[i] || 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 2)
        .map(([, i]) => `${model.inputs[i].name.toLowerCase()} = ${fmt(model.inputs[i], whatIf[i])}`);
      el.querySelector("#xr-say").innerHTML = `With ${top.join(" and ")}, the model would choose <b>${model.outputs[0].name.toLowerCase()} ${regFmt(v)}</b>.`;
      return;
    }
    const sc = pr(whatIf);
    if (!sc) {
      el.querySelector("#xr-pred").innerHTML = model.outputs.map((o) => `<div class="xr-bar"><span>${o.name}</span><div class="xr-track"></div><b>?</b></div>`).join("");
      el.querySelector("#xr-say").innerHTML = `The model has <b>never been in this situation</b>, so it has no idea yet. (Grey on the map.)`;
      return;
    }
    const sh = shares(sc);
    const best = argmax(sc);
    el.querySelector("#xr-pred").innerHTML = model.outputs.map((o, i) => `<div class="xr-bar ${i === best ? "on" : ""}">
      <span>${o.name}</span><div class="xr-track"><div style="width:${(sh[i] * 100).toFixed(0)}%;background:${color(o, i)}"></div></div>
      <b>${(sh[i] * 100).toFixed(0)}%</b></div>`).join("");
    const top = model.inputs.map((inp, i) => [lastImp[i] || 0, i]).sort((a, b) => b[0] - a[0]).slice(0, 2)
      .map(([, i]) => `${model.inputs[i].name.toLowerCase()} = ${fmt(model.inputs[i], whatIf[i])}`);
    el.querySelector("#xr-say").innerHTML = `With ${top.join(" and ")}, the model would <b style="color:${color(model.outputs[best], best)}">${model.outputs[best].name}</b>.`;
  }

  function drawMap() {
    const cv = el.querySelector("#xr-map");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height, N = 56, M = 40;
    const ix = model.inputs[mapX], iy = model.inputs[mapY];
    ctx.clearRect(0, 0, W, H);
    if (isReg()) {
      const grid = [];
      let lo = Infinity, hi = -Infinity;
      for (let a = 0; a < N; a++)
        for (let b = 0; b < M; b++) {
          const x = whatIf.slice();
          x[mapX] = ix.min + ((ix.max - ix.min) * (a + 0.5)) / N;
          x[mapY] = iy.max - ((iy.max - iy.min) * (b + 0.5)) / M;
          const v = model.predict(x)[0];
          grid.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v);
        }
      let k = 0;
      for (let a = 0; a < N; a++)
        for (let b = 0; b < M; b++) {
          ctx.fillStyle = lerpColor(REG_LO, REG_HI, (grid[k++] - lo) / (hi - lo || 1));
          ctx.fillRect((a * W) / N, (b * H) / M, W / N + 0.5, H / M + 0.5);
        }
      el.querySelector("#xr-legend").innerHTML = `<span><i style="background:${REG_HI}"></i>${model.outputs[0].name}: ${regFmt(hi)}</span>
        <span><i style="background:linear-gradient(${REG_HI},${REG_LO})"></i>in between</span><span><i style="background:${REG_LO}"></i>${regFmt(lo)}</span>`;
    } else
    for (let a = 0; a < N; a++)
      for (let b = 0; b < M; b++) {
        const x = whatIf.slice();
        x[mapX] = ix.min + ((ix.max - ix.min) * (a + 0.5)) / N;
        x[mapY] = iy.max - ((iy.max - iy.min) * (b + 0.5)) / M;
        const sc = pr(x);
        if (!sc) { ctx.globalAlpha = 1; ctx.fillStyle = ML.cssVar("--line"); ctx.fillRect((a * W) / N, (b * H) / M, W / N + 0.5, H / M + 0.5); continue; }
        const k = argmax(sc), sh = shares(sc);
        ctx.fillStyle = color(model.outputs[k], k);
        ctx.globalAlpha = 0.25 + 0.75 * Math.min(1, (sh[k] - 1 / sc.length) * 2.5);
        ctx.fillRect((a * W) / N, (b * H) / M, W / N + 0.5, H / M + 0.5);
      }
    ctx.globalAlpha = 1;
    const px = ((whatIf[mapX] - ix.min) / (ix.max - ix.min)) * W, py = (1 - (whatIf[mapY] - iy.min) / (iy.max - iy.min)) * H;
    ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = ML.cssVar("--ink"); ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.stroke();
    ctx.fillStyle = ML.cssVar("--ink"); ctx.font = "800 14px Nunito, sans-serif";
    ctx.textAlign = "right"; ctx.fillText(`${ix.name} →`, W - 8, H - 8);
    ctx.save(); ctx.translate(16, 8); ctx.rotate(Math.PI / 2); ctx.textAlign = "left"; ctx.fillText(`← ${iy.name}`, 0, 0); ctx.restore();
  }

  let lastImp = [];
  function render() {
    el.querySelector("#xr-title").textContent = model.title;
    el.querySelector("#xr-sum").textContent = [model.kind, model.summary && model.summary()].filter(Boolean).join(" · ");
    const stats = [["Model", model.kind], ...(model.size ? [["Size", model.size()]] : []), ...((model.stats && model.stats()) || [])];
    el.querySelector("#xr-stats").innerHTML = stats.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v" style="font-size:1.15rem">${v}</div></div>`).join("");
    el.querySelector("#xr-notes").innerHTML = (model.notes || []).map((n) => `<p class="pill-note" style="margin-top:10px"><span class="e">${ML.icon("bulb")}</span><span>${n}</span></p>`).join("");

    const only = noInputs();
    ["#xr-imp", "#xr-rules", "#xr-map", "#xr-sliders", "#xr-pred"].forEach((q) => el.querySelector(q).closest(".xr-sec").classList.toggle("hidden", only));
    const ex = el.querySelector("#xr-extra");
    ex.innerHTML = ((model.extraSections && model.extraSections()) || []).map((x) => `<section class="xr-sec ${x.wide ? "xr-wide" : ""}"><h3>${ML.icon(x.icon || "bulb")} ${x.title}</h3>${x.html}</section>`).join("");
    const bs0 = el.querySelector("#xr-brain-sec");
    if (only) { bs0.classList.add("xr-wide"); }
    if (only) { renderBrain(); return; }

    lastImp = importance();
    const mx = Math.max(...lastImp, 0.001);
    const order = lastImp.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    el.querySelector("#xr-imp").innerHTML = order.map(([v, i]) => `<div class="xr-bar"><span>${model.inputs[i].name}</span>
      <div class="xr-track"><div style="width:${((v / mx) * 100).toFixed(0)}%;background:var(--accent)"></div></div><b>${Math.round(v * 100)}%</b></div>`).join("");
    let rl = rules(lastImp);
    if (!rl.length && !isReg()) {
      // Nothing changes its mind: say what it always does.
      const votes = new Array(model.outputs.length).fill(0);
      sampleSet(200).forEach((x) => { const v = pr(x); if (v) votes[argmax(v)]++; });
      const k = argmax(votes);
      rl = votes[k] ? [`In every situation it has met, it picks <b>${model.outputs[k].name}</b>. It found one move that works and sticks to it.`] : [];
    }
    el.querySelector("#xr-rules").innerHTML = rl.map((r) => `<li>${r}</li>`).join("") || "<li>Not enough training yet to read clear rules.</li>";

    mapX = order[0] ? order[0][1] : 0;
    mapY = order[1] ? order[1][1] : Math.min(1, model.inputs.length - 1);
    const opts = model.inputs.map((inp, i) => `<option value="${i}">${inp.name}</option>`).join("");
    el.querySelector("#xr-x").innerHTML = opts;
    el.querySelector("#xr-y").innerHTML = opts;
    el.querySelector("#xr-x").value = mapX;
    el.querySelector("#xr-y").value = mapY;
    if (!isReg()) el.querySelector("#xr-legend").innerHTML = model.outputs.map((o, i) => `<span><i style="background:${color(o, i)}"></i>${o.name}</span>`).join("");

    useNow();
    renderSliders();
    renderPred();
    drawMap();
    renderBrain();
  }
  function renderBrain() {
    const bs = el.querySelector("#xr-brain-sec");
    if (model.drawBrain) {
      bs.classList.remove("hidden");
      const cv = el.querySelector("#xr-brain");
      cv.height = model.brainHeight || 300;
      cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      model.drawBrain(cv);
      el.querySelector("#xr-brain-cap").innerHTML = model.brainCaption || "";
    } else bs.classList.add("hidden");
  }

  function open() {
    if (!model) return ML.toast("This game's model isn't ready yet");
    if (!el) build();
    render();
    el.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function close() {
    if (!el) return;
    el.classList.remove("open");
    document.body.style.overflow = "";
  }

  // A friendly nudge after a training success: a floating button that opens the X-ray.
  let offered = false;
  function offer(msg) {
    if (offered) return;
    offered = true;
    const b = document.createElement("button");
    b.className = "btn primary xray-offer";
    b.innerHTML = `${ML.icon("search")} ${msg || "Training worked! X-ray the trained model"}`;
    b.addEventListener("click", () => { b.remove(); ML.xray.open(); });
    document.body.appendChild(b);
    setTimeout(() => b.classList.add("show"), 50);
  }

  // Adds an "X-ray the model" button to any element (usually the right panel's first card).
  function button(host) {
    if (!host) return;
    const b = document.createElement("button");
    b.className = "btn ghost small";
    b.innerHTML = `${ML.icon("search")} X-ray the model`;
    b.addEventListener("click", () => ML.xray.open());
    host.appendChild(b);
    return b;
  }

  // Draw a layered network: sizes = [in, hidden…, out], weight(l, i, j) = weight from i in layer l to j in layer l+1.
  function drawNet(cv, sizes, weight, inLabels = [], outLabels = []) {
    const c = cv.getContext("2d"), W = cv.width, H = cv.height;
    const left = 150, right = W - 130, top = 16, bottom = H - 16;
    const X = (l) => left + ((right - left) * l) / (sizes.length - 1);
    const Y = (l, i) => (sizes[l] === 1 ? H / 2 : top + ((bottom - top) * i) / (sizes[l] - 1));
    let mx = 0;
    for (let l = 0; l < sizes.length - 1; l++) for (let i = 0; i < sizes[l]; i++) for (let j = 0; j < sizes[l + 1]; j++) mx = Math.max(mx, Math.abs(weight(l, i, j)));
    for (let l = 0; l < sizes.length - 1; l++)
      for (let i = 0; i < sizes[l]; i++)
        for (let j = 0; j < sizes[l + 1]; j++) {
          const w = weight(l, i, j) / (mx || 1);
          c.strokeStyle = w > 0 ? ML.cssVar("--sup") : ML.cssVar("--rl");
          c.globalAlpha = 0.08 + Math.abs(w) * 0.85;
          c.lineWidth = 0.5 + Math.abs(w) * 3.5;
          c.beginPath(); c.moveTo(X(l), Y(l, i)); c.lineTo(X(l + 1), Y(l + 1, j)); c.stroke();
        }
    c.globalAlpha = 1;
    sizes.forEach((n, l) => { for (let i = 0; i < n; i++) { c.fillStyle = ML.cssVar("--card"); c.strokeStyle = ML.cssVar("--ink"); c.lineWidth = 2.5; c.beginPath(); c.arc(X(l), Y(l, i), 7, 0, 7); c.fill(); c.stroke(); } });
    c.font = "800 12px Nunito, sans-serif"; c.fillStyle = ML.cssVar("--ink");
    c.textAlign = "right"; inLabels.forEach((t, i) => c.fillText(t, left - 14, Y(0, i) + 4));
    c.textAlign = "left"; outLabels.forEach((t, i) => c.fillText(t, right + 14, Y(sizes.length - 1, i) + 4));
  }
  const NET_CAPTION = "Left = what it senses, right = what it does. Blue lines push a neuron up, orange lines push it down; thicker = stronger. Evolution tuned every one of these numbers.";

  ML.xray = { register: (m) => (model = m), get: () => model, open, close, offer, button, drawNet, NET_CAPTION };
})();
