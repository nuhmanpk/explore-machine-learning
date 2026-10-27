// Backprop, Step by Step: three views of one tiny 2-2-1 network.
(function () {
  const C = window.BackpropCore;
  const NS = "http://www.w3.org/2000/svg";
  const f = (v, d = 2) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d);
  const sg = (v, d = 2) => (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toFixed(d);
  const SEED = 3;
  const el = (id) => document.getElementById(id);

  // ---------- geometry ----------
  const P = { x0: [70, 105], x1: [70, 255], h0: [350, 65], h1: [350, 295], o: [630, 180] };
  const EDGES = [
    { k: "w1_0_0", a: "x0", b: "h0", t: 0.32 }, { k: "w1_0_1", a: "x0", b: "h1", t: 0.32 },
    { k: "w1_1_0", a: "x1", b: "h0", t: 0.32 }, { k: "w1_1_1", a: "x1", b: "h1", t: 0.32 },
    { k: "w2_0", a: "h0", b: "o", t: 0.5 }, { k: "w2_1", a: "h1", b: "o", t: 0.5 },
  ];
  const BIASES = [{ k: "b1_0", at: "h0", dy: 46 }, { k: "b1_1", at: "h1", dy: -46 }, { k: "b2", at: "o", dy: 50 }];
  const idxOf = (k) => C.NAMES.indexOf(k);
  const humanName = (k) => {
    const [t, i, j] = k.split("_");
    if (t === "w1") return `the wire from input x${+i + 1} to hidden H${+j + 1}`;
    if (t === "b1") return `the bias of hidden H${+i + 1}`;
    if (t === "w2") return `the wire from hidden H${+i + 1} to the output`;
    return "the bias of the output";
  };

  // ---------- SVG diagram ----------
  function makeView(svg, uid) {
    svg.innerHTML = `<defs><marker id="ar${uid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--accent)"/></marker></defs><g class="ed"></g><g class="nd"></g>`;
    const view = { onEdge: null };
    const posOf = (k) => P[k];
    const gcls = (v, max) => Math.max(0.12, Math.min(1, Math.abs(v) / (max || 1)));
    // o: {fw, net, prev, bw (flat grads) , gShow:{out,hid}, hlNode, sel, numbers:'w'|'g', arrows}
    view.draw = function (o) {
      const flatNet = C.flat(o.net), flatPrev = o.prev ? C.flat(o.prev) : null;
      const gmax = o.g ? Math.max(1e-9, ...o.g.map(Math.abs)) : 1;
      const showG = (k) => o.g && (k[0] === "w" && k[1] === "2" || k === "b2" ? o.gShow.out : o.gShow.hid);
      let ed = "";
      EDGES.forEach((e) => {
        const [ax, ay] = posOf(e.a), [bx, by] = posOf(e.b);
        const w = flatNet[idxOf(e.k)];
        const col = w >= 0 ? "var(--good)" : "var(--bad)";
        const lw = 2 + Math.min(10, Math.abs(w) * 1.5);
        const hl = o.sel === e.k;
        ed += `<g class="edge" data-k="${e.k}">`;
        ed += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" style="stroke:${col};stroke-width:${lw};stroke-linecap:round;opacity:${o.dim ? 0.35 : 0.85}"/>`;
        ed += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="transparent" stroke-width="26"/>`;
        if (showG(e.k) && o.arrows !== false) {
          const g = o.g[idxOf(e.k)];
          const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), nx = -dy / L * 9, ny = dx / L * 9;
          const sw = 2 + 8 * gcls(g, gmax);
          ed += `<line x1="${bx - dx * 0.12 + nx}" y1="${by - dy * 0.12 + ny}" x2="${ax + dx * 0.12 + nx}" y2="${ay + dy * 0.12 + ny}" marker-end="url(#ar${uid})" style="stroke:var(--accent);stroke-width:${sw};opacity:${0.25 + 0.7 * gcls(g, gmax)};stroke-linecap:round"/>`;
        }
        const cx = ax + (bx - ax) * e.t, cy = ay + (by - ay) * e.t;
        let t1 = f(w), t2 = "";
        if (flatPrev) t1 = `${f(flatPrev[idxOf(e.k)])}→${f(w)}`;
        if (showG(e.k) && o.numbers) t2 = (o.g[idxOf(e.k)] < 0 ? "▲ " : "▼ ") + f(Math.abs(o.g[idxOf(e.k)]), 3);
        const wd = Math.max(46, t1.length * 7.4 + 10, t2.length * 7 + 10);
        ed += `<g class="chip"><rect x="${cx - wd / 2}" y="${cy - (t2 ? 20 : 11)}" width="${wd}" height="${t2 ? 40 : 22}" rx="10" style="stroke:${hl ? "var(--accent)" : col};stroke-width:${hl ? 4 : 2}"/><text class="small" x="${cx}" y="${cy - (t2 ? 8 : 0)}">${t1}</text>${t2 ? `<text class="small" x="${cx}" y="${cy + 9}" style="fill:var(--accent)">${t2}</text>` : ""}</g></g>`;
      });
      let nd = "";
      const fw = o.fw;
      const nodeDef = [
        { id: "x0", v: fw ? fw.x[0] : null, lbl: "x1", lit: true, r: 28 }, { id: "x1", v: fw ? fw.x[1] : null, lbl: "x2", lit: true, r: 28 },
        { id: "h0", v: fw && o.vis.h[0] ? fw.h[0] : null, lbl: "H1", r: 34 }, { id: "h1", v: fw && o.vis.h[1] ? fw.h[1] : null, lbl: "H2", r: 34 },
        { id: "o", v: fw && o.vis.o ? fw.o : null, lbl: "OUT", r: 36 },
      ];
      nodeDef.forEach((n) => {
        const [x, y] = P[n.id];
        const lit = n.v != null;
        nd += `<circle class="node ${lit ? "lit" : ""} ${o.hlNode === n.id ? "hl" : ""}" cx="${x}" cy="${y}" r="${n.r}"/>`;
        nd += `<text class="lbl" x="${x}" y="${y + (lit ? -12 : 0)}">${n.lbl}</text>`;
        if (lit) nd += `<text class="val" x="${x}" y="${y + 9}">${f(n.v)}</text>`;
      });
      nd += `<text class="lbl" x="${P.x0[0]}" y="${P.x0[1] - 44}">inputs</text><text class="lbl" x="${P.h0[0] + 70}" y="${P.h0[1] - 30}">hidden</text><text class="lbl" x="${P.o[0]}" y="${P.o[1] - 56}">answer</text>`;
      BIASES.forEach((b) => {
        const [x, y] = P[b.at];
        const v = flatNet[idxOf(b.k)];
        let t = "b " + sg(v);
        if (flatPrev) t = `b ${f(flatPrev[idxOf(b.k)])}→${f(v)}`;
        const gg = showG(b.k) ? o.g[idxOf(b.k)] : null;
        const t2 = gg != null && o.numbers ? (gg < 0 ? "▲ " : "▼ ") + f(Math.abs(gg), 3) : "";
        const wd = Math.max(50, t.length * 7.4 + 10, t2.length * 7 + 10);
        const col = v >= 0 ? "var(--good)" : "var(--bad)";
        const cy = y + b.dy, hl = o.sel === b.k;
        nd += `<g class="edge chip" data-k="${b.k}"><rect x="${x - wd / 2}" y="${cy - (t2 ? 20 : 11)}" width="${wd}" height="${t2 ? 40 : 22}" rx="10" style="stroke:${hl ? "var(--accent)" : col};stroke-width:${hl ? 4 : 2}"/><text class="small" x="${x}" y="${cy - (t2 ? 8 : 0)}">${t}</text>${t2 ? `<text class="small" x="${x}" y="${cy + 9}" style="fill:var(--accent)">${t2}</text>` : ""}</g>`;
        if (gg != null && o.arrows !== false) {
          nd += `<circle cx="${x + (b.dy > 0 ? 0 : 0)}" cy="${y + (b.dy > 0 ? 40 : -40)}" r="0"/>`;
        }
      });
      svg.querySelector(".ed").innerHTML = ed;
      svg.querySelector(".nd").innerHTML = nd;
    };
    svg.addEventListener("click", (e) => {
      const g = e.target.closest(".edge");
      if (g && view.onEdge) view.onEdge(g.dataset.k);
    });
    return view;
  }

  // ---------- 1. play by hand ----------
  const play = { net: C.init(SEED + 20, 1), mode: "one", tries: 0, won: false };
  const pView = makeView(el("p-svg"), "p");
  const ONE = [[[1, 0], 1]];
  const pData = () => (play.mode === "one" ? ONE : C.DATA.XOR);
  const SL_LABEL = { w1_0_0: "x1 → H1", w1_0_1: "x1 → H2", w1_1_0: "x2 → H1", w1_1_1: "x2 → H2", b1_0: "H1 bias", b1_1: "H2 bias", w2_0: "H1 → out", w2_1: "H2 → out", b2: "out bias" };
  el("p-sliders").innerHTML = C.NAMES.map((k) => `<div class="field"><label for="ps-${k}">${SL_LABEL[k]} <span class="val" data-for="ps-${k}"></span></label><input type="range" id="ps-${k}" min="-6" max="6" step="0.1" value="0"></div>`).join("");
  let syncing = true;
  function syncSliders() {
    syncing = true;
    C.flat(play.net).forEach((v, i) => { const s = el("ps-" + C.NAMES[i]); s.value = v; s.dispatchEvent(new Event("input")); });
    syncing = false;
  }
  C.NAMES.forEach((k, i) => {
    ML.bindRange("#ps-" + k, (v) => sg(v, 1), (v) => {
      if (syncing) return;
      const a = C.flat(play.net);
      if (Math.abs(a[i] - v) < 1e-9) return;
      a[i] = v; play.net = C.fromFlat(a); play.tries++;
      renderPlay(true);
    });
  });
  function renderPlay(user) {
    const d = pData();
    const fw = C.forward(play.net, d[0][0]);
    pView.draw({ net: play.net, fw: C.forward(play.net, d[0][0]), vis: { h: [1, 1], o: 1 }, gShow: {} });
    const loss = C.meanLoss(play.net, d), right = C.rightCount(play.net, d);
    el("p-out").textContent = play.mode === "one" ? f(fw.o) : `${right}/4 right`;
    el("p-loss").textContent = f(loss, 3);
    el("p-tries").textContent = play.tries;
    el("p-goal").innerHTML = play.mode === "one"
      ? `Goal: with inputs <b>(1, 0)</b> make the output reach <b>1.00</b> (within 0.05). Now: <b class="${Math.abs(fw.o - 1) < 0.05 ? "ok" : "no"}">${f(fw.o)}</b>`
      : `Goal: XOR. Inputs <b>(0,0)→0, (0,1)→1, (1,0)→1, (1,1)→0</b>. You have <b class="${right === 4 ? "ok" : "no"}">${right}/4</b> right.`;
    const win = play.mode === "one" ? Math.abs(fw.o - 1) < 0.05 : right === 4 && loss < 0.05;
    if (user && win && !play.won) {
      ML.say(`You did it in <b>${play.tries}</b> tweaks! ${play.mode === "one" ? "That was one example. Now try <b>All 4 XOR rows</b>: every weight affects every row, so fixing one breaks another." : "Wow, XOR by hand!"}`);
      ML.confetti();
    } else if (user && play.tries === 12 && !win) ML.say("Notice how each slider changes the answer a little, and other rows too? With 9 knobs this is hard to do by hand. Backprop does it automatically!");
    play.won = win;
  }
  document.querySelectorAll("#p-mode button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#p-mode button").forEach((x) => x.classList.toggle("on", x === b));
    play.mode = b.dataset.m; play.won = false; renderPlay();
  }));
  el("p-shuffle").addEventListener("click", () => { play.net = C.init((Math.random() * 1e6) | 0, 1.5); play.tries = 0; play.won = false; syncSliders(); renderPlay(); });
  el("p-robot").addEventListener("click", () => {
    let n = play.net; const d = pData();
    for (let i = 0; i < 4000 && !(C.meanLoss(n, d) < 0.003); i++) n = C.round(n, d, 2).net;
    play.net = C.fromFlat(C.flat(n).map((v) => ML.clamp(+v.toFixed(1), -6, 6)));
    syncSliders(); renderPlay(); play.won = true;
    ML.say(`Robot used backprop and set all 9 knobs in a blink. Loss is now <b>${f(C.meanLoss(play.net, d), 3)}</b>. Section 2 shows exactly how.`);
  });

  // ---------- 2. stepper ----------
  const XOR = C.DATA.XOR;
  const S = { net: C.init(SEED, 1), before: null, bw: null, idx: 0, round: 0, ex: 2, lr: 1, sel: null, check: false };
  const sView = makeView(el("s-svg"), "s");
  el("s-ex").innerHTML = XOR.map((d, i) => `<button data-i="${i}" class="${i === S.ex ? "on" : ""}">(${d[0][0]},${d[0][1]}) → ${d[1]}</button>`).join("");
  const STEPS = [
    { ph: 0, nxt: "Start: forward pass" },
    { ph: 1, nxt: "Next: hidden neuron H2", hl: "h0" },
    { ph: 1, nxt: "Next: output neuron", hl: "h1" },
    { ph: 1, nxt: "Next: measure the oops", hl: "o" },
    { ph: 2, nxt: "Next: send blame backwards", hl: "o" },
    { ph: 3, nxt: "Next: blame the first layer" },
    { ph: 3, nxt: "Next: nudge the weights" },
    { ph: 4, nxt: "Next: another round" },
  ];
  ML.bindRange("#s-lr", (v) => v.toFixed(1), (v) => { S.lr = v; if (S.idx === 7) { S.idx = 6; renderStep(); } });
  document.querySelectorAll("#s-ex button").forEach((b) => b.addEventListener("click", () => {
    S.ex = +b.dataset.i;
    document.querySelectorAll("#s-ex button").forEach((x) => x.classList.toggle("on", x === b));
    if (S.idx === 7) S.net = S.after;
    S.idx = 0; S.sel = null; renderStep();
  }));
  el("s-check").addEventListener("change", (e) => { S.check = e.target.checked; renderStep(); });
  el("s-reset").addEventListener("click", () => { S.net = C.init(SEED, 1); S.idx = 0; S.round = 0; S.sel = null; renderStep(); ML.say("Network reset. Click through a round again!"); });
  el("s-next").addEventListener("click", () => {
    if (S.idx === 7) { S.net = S.after; S.round++; S.idx = 0; S.sel = null; renderStep(); return; }
    S.idx++;
    if (S.idx === 1) { S.before = C.clone(S.net); }
    const [x, y] = XOR[S.ex].slice();
    S.bw = C.backward(S.before || S.net, XOR[S.ex][0], XOR[S.ex][1]);
    if (S.idx === 5) S.sel = bestKey(["w2_0", "w2_1", "b2"]);
    if (S.idx === 6) S.sel = bestKey(["w1_0_0", "w1_0_1", "w1_1_0", "w1_1_1", "b1_0", "b1_1"]);
    if (S.idx === 7) {
      const v = C.flat(S.before).map((w, i) => w - S.lr * S.bw.flat[i]);
      S.after = C.fromFlat(v);
    }
    renderStep();
  });
  function bestKey(keys) { return keys.reduce((a, k) => (Math.abs(S.bw.flat[idxOf(k)]) > Math.abs(S.bw.flat[idxOf(a)]) ? k : a), keys[0]); }
  sView.onEdge = (k) => {
    if (S.idx === 5 && !/^(w2|b2)/.test(k)) return;
    if (S.idx < 5) return;
    S.sel = k; renderStep();
  };

  function chainText(k) {
    const b = S.bw, g = b.flat[idxOf(k)];
    const A = f(b.dLdo, 3), B = f(b.so, 3);
    const t = k.split("_");
    let math, words;
    if (k === "b2") {
      math = `blame = ${A} × ${B} = <span class="big">${sg(g, 4)}</span>`;
      words = `(how wrong the answer was) × (how much the output neuron reacts to a nudge). A bias has an input of 1, so that is all.`;
    } else if (t[0] === "w2") {
      const j = +t[1];
      math = `blame = ${A} × ${B} × ${f(b.f.h[j], 3)} = <span class="big">${sg(g, 4)}</span>`;
      words = `(how wrong the answer was) × (how much the output reacts) × (how loud H${j + 1} was: ${f(b.f.h[j], 3)}). A quiet neuron gets less blame.`;
    } else if (t[0] === "b1") {
      const j = +t[1];
      math = `blame = ${A} × ${B} × ${f(S.before.w2[j], 3)} × ${f(b.sh[j], 3)} = <span class="big">${sg(g, 4)}</span>`;
      words = `(wrongness) × (output reaction) × (how strongly H${j + 1} talks to the output: ${f(S.before.w2[j], 3)}) × (how sensitive H${j + 1} is right now: ${f(b.sh[j], 3)}).`;
    } else {
      const i = +t[1], j = +t[2], x = XOR[S.ex][0][i];
      math = `blame = ${A} × ${B} × ${f(S.before.w2[j], 3)} × ${f(b.sh[j], 3)} × ${x} = <span class="big">${sg(g, 4)}</span>`;
      words = `(wrongness) × (output reaction) × (how strongly H${j + 1} talks to the output) × (how sensitive H${j + 1} is) × (the input on this wire, ${x}).` + (x === 0 ? " This input was 0, so no signal went down this wire and it gets <b>no blame</b>." : "");
    }
    const dir = g < 0 ? "negative, so this weight should go <b>UP</b>" : g > 0 ? "positive, so this weight should go <b>DOWN</b>" : "zero, so leave it";
    return `<b>${humanName(k)}</b><span class="math">${math}</span>${words}<br>The blame is ${dir}.`;
  }

  function renderStep() {
    const st = STEPS[S.idx], ex = XOR[S.ex], [x, y] = ex;
    const showNet = S.idx === 7 ? S.after : S.net;
    const base = S.idx >= 1 && S.before ? S.before : S.net;
    const fwNet = S.idx === 7 ? S.before : S.net;
    const fw = S.idx >= 1 ? C.forward(fwNet, x) : C.forward(S.net, x);
    const bw = S.idx >= 5 ? S.bw : null;
    const vis = { h: [S.idx >= 1, S.idx >= 2], o: S.idx >= 3 };
    if (S.idx === 0) { vis.h = [0, 0]; vis.o = 0; }
    sView.draw({
      net: showNet, prev: S.idx === 7 ? S.before : null, fw: S.idx === 0 ? { x, h: [0, 0], o: 0 } : fw, vis,
      g: bw ? bw.flat : null, gShow: { out: S.idx >= 5, hid: S.idx >= 6 }, numbers: true, hlNode: st.hl, sel: S.idx >= 5 ? S.sel : null,
    });
    document.querySelectorAll("#phases .phase").forEach((p) => {
      const n = +p.dataset.p;
      p.classList.toggle("on", n === st.ph); p.classList.toggle("done", n < st.ph);
    });
    el("s-next-t").textContent = st.nxt;
    el("s-round").textContent = S.round;
    el("s-tgt").textContent = y;
    const known = S.idx >= 3 || (S.idx === 0 && false);
    el("s-out").textContent = S.idx >= 3 ? f(fw.o, 3) : "?";
    el("s-loss").textContent = S.idx >= 4 ? f(C.lossOf(fw.o, y), 4) : "?";
    let title, body = "";
    const nm = S.net;
    const hid = (j) => {
      const n = fwNet;
      return `<span class="math">z = ${x[0]} × ${sg(n.w1[0][j])} + ${x[1]} × ${sg(n.w1[1][j])} + (${sg(n.b1[j])}) = ${f(fw.z1[j], 3)}</span>Squash with sigmoid: <b class="big">H${j + 1} = ${f(fw.h[j], 3)}</b> (always between 0 and 1).`;
    };
    switch (S.idx) {
      case 0:
        title = `Round ${S.round}: ready`;
        body = `Example inputs <b>(${x[0]}, ${x[1]})</b>, the right answer is <b>${y}</b>. Every wire shows its weight, thicker means bigger, green is positive and red is negative. Press the big button to start the forward pass.`;
        break;
      case 1: title = "1 Forward pass: hidden neuron H1"; body = `H1 adds up each input times its wire weight, plus its bias.${hid(0)}`; break;
      case 2: title = "1 Forward pass: hidden neuron H2"; body = `Same recipe for H2.${hid(1)}`; break;
      case 3: title = "1 Forward pass: the output neuron"; body = `The output listens to H1 and H2.<span class="math">z = ${f(fw.h[0], 3)} × ${sg(fwNet.w2[0])} + ${f(fw.h[1], 3)} × ${sg(fwNet.w2[1])} + (${sg(fwNet.b2)}) = ${f(fw.z2, 3)}</span>Sigmoid gives <b class="big">output = ${f(fw.o, 3)}</b>. The target was ${y}.`; break;
      case 4: title = "2 Measure the oops"; body = `Loss is the squared error, so being far off hurts a lot.<span class="math">loss = (output - target)² = (${f(fw.o, 3)} - ${y})² = <span class="big">${f(C.lossOf(fw.o, y), 4)}</span></span>${C.lossOf(fw.o, y) < 0.01 ? "Almost perfect already!" : "Now we ask: which weights are to blame?"}`; break;
      case 5: title = "3 Backward pass: blame the output layer"; body = `Blame starts at the answer and flows <b>right to left</b>. Arrows show how much each weight contributed to the oops (bigger arrow = more blame).<br>${chainText(S.sel)}`; break;
      case 6: title = "3 Backward pass: blame the first layer"; body = `The blame keeps going left, passing through the output weights and each neuron's slope. This is the <b>chain rule</b>: multiply the local pieces along the path.<br>${chainText(S.sel)}`; break;
      default: {
        title = "4 Nudge every weight";
        body = `New weight = old weight - learning rate × blame. Learning rate is <b>${S.lr.toFixed(1)}</b>.<span class="math">${C.NAMES[idxOf(S.sel)] ? humanName(S.sel).replace(/^the /, "") : ""}: ${f(S.before ? C.flat(S.before)[idxOf(S.sel)] : 0, 3)} - ${S.lr.toFixed(1)} × ${sg(S.bw.flat[idxOf(S.sel)], 4)} = <span class="big">${f(C.flat(S.after)[idxOf(S.sel)], 3)}</span></span>`;
        const nl = C.forward(S.after, x).o;
        body += `All nine moved a little. Re-guess with the new weights: output <b>${f(fw.o, 3)} → ${f(nl, 3)}</b> (target ${y}). ${Math.abs(nl - y) < Math.abs(fw.o - y) ? "Closer!" : "Not closer: the step was too big."} Press again for round ${S.round + 1}.`;
      }
    }
    el("s-title").textContent = title;
    el("s-explain").innerHTML = body;
    // check-my-work table
    let tb = "";
    if (S.check && S.idx >= 5) {
      const num = C.numeric(S.before, x, y);
      const rows = C.NAMES.map((k, i) => {
        const hidden = S.idx === 5 && !/^(w2|b2)/.test(k);
        const d = Math.abs(S.bw.flat[i] - num[i]);
        return `<tr><td>${k}</td><td>${hidden ? "?" : sg(S.bw.flat[i], 6)}</td><td>${hidden ? "?" : sg(num[i], 6)}</td><td class="${d < 1e-6 ? "ok" : "no"}">${hidden ? "" : d.toExponential(1)}</td></tr>`;
      }).join("");
      tb = `<p style="margin:10px 0 0;font-weight:700">Check: backprop's blame vs. a brute-force wiggle test (nudge each weight by 0.0001 both ways and watch the loss).</p><table class="chk"><tr><th>weight</th><th>backprop</th><th>wiggle test</th><th>difference</th></tr>${rows}</table>`;
    } else if (S.check) tb = `<p class="muted" style="margin:10px 0 0">The comparison table appears once the backward pass starts.</p>`;
    el("s-table").innerHTML = tb;
    if (S.idx === 4 && S.round === 0) ML.say("Look at that loss number. Next, the clever part: who is to blame?");
    if (S.idx === 7) ML.say(`Round ${S.round} done! Keep pressing: output moves toward ${y} a bit every round. Try other examples too.`);
  }
  renderStep();

  // ---------- 3. watch it learn ----------
  const L = { net: C.init(SEED, 1), ds: "XOR", lr: 2, round: 0, hist: [], marks: [], grad: null, timer: null, cps: [], solved: false, preview: -1, live: null };
  const lView = makeView(el("l-svg"), "l");
  const data = () => C.DATA[L.ds];
  const cv = el("chart"), CW = 640, CH = 220;
  const cctx = ML.setupCanvas(cv, CW, CH).ctx;
  ML.bindRange("#l-lr", (v) => v.toFixed(1), (v) => { L.lr = v; });
  const showArrows = () => el("l-arrows").checked;
  function drawChart() {
    const c = cctx, ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted"), line = ML.cssVar("--line"), acc = ML.cssVar("--accent");
    c.clearRect(0, 0, CW, CH);
    const m = { l: 44, r: 12, t: 14, b: 28 }, pw = CW - m.l - m.r, ph = CH - m.t - m.b;
    const xmax = Math.max(100, L.hist.length);
    const X = (r) => m.l + (r / xmax) * pw, Y = (v) => m.t + (1 - Math.min(v, 0.55) / 0.55) * ph;
    c.font = "700 11px Nunito, sans-serif"; c.textAlign = "right"; c.textBaseline = "middle";
    c.strokeStyle = line; c.fillStyle = muted; c.lineWidth = 1;
    [0, 0.1, 0.25, 0.5].forEach((v) => { c.beginPath(); c.moveTo(m.l, Y(v)); c.lineTo(CW - m.r, Y(v)); c.stroke(); c.fillText(v.toString(), m.l - 6, Y(v)); });
    c.textAlign = "center"; c.textBaseline = "top";
    c.fillText("rounds: " + xmax, CW - m.r - 36, CH - 16); c.fillText("0", m.l, CH - 16);
    c.save(); c.translate(11, m.t + ph / 2); c.rotate(-Math.PI / 2); c.fillText("loss", 0, 0); c.restore();
    L.marks.forEach((mk) => {
      c.strokeStyle = ML.cssVar("--bad"); c.setLineDash([5, 4]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(X(mk.r), m.t); c.lineTo(X(mk.r), m.t + ph); c.stroke(); c.setLineDash([]);
      c.fillStyle = ML.cssVar("--bad"); c.textAlign = mk.r > xmax * 0.6 ? "right" : "left"; c.textBaseline = "top";
      c.fillText(mk.label, X(mk.r) + (mk.r > xmax * 0.6 ? -4 : 4), m.t + 2 + (L.marks.indexOf(mk) % 3) * 12);
    });
    if (L.hist.length) {
      c.strokeStyle = acc; c.lineWidth = 3; c.lineJoin = "round"; c.beginPath();
      const step = Math.max(1, Math.floor(L.hist.length / 400));
      for (let i = 0; i < L.hist.length; i += step) { i === 0 ? c.moveTo(X(i), Y(L.hist[i])) : c.lineTo(X(i), Y(L.hist[i])); }
      c.lineTo(X(L.hist.length - 1), Y(L.hist[L.hist.length - 1])); c.stroke();
    }
  }
  function renderLearn() {
    const n = L.preview >= 0 ? L.cps[L.preview].net : L.net;
    const d = data();
    const bw = L.grad && L.preview < 0 ? C.fromFlat(L.grad) : null;
    lView.draw({ net: n, fw: null, vis: { h: [0, 0], o: 0 }, g: L.grad && L.preview < 0 ? L.grad : null, gShow: { out: showArrows(), hid: showArrows() }, numbers: false, arrows: showArrows() });
    const loss = C.meanLoss(n, d), right = C.rightCount(n, d);
    el("l-round").textContent = L.preview >= 0 ? L.cps[L.preview].round : L.round;
    el("l-loss").textContent = f(loss, 3);
    el("l-right").innerHTML = `${right}<small>/4</small>`;
    el("l-preds").innerHTML = d.map((r) => { const o = C.forward(n, r[0]).o, ok = (o > 0.5 ? 1 : 0) === r[1]; return `<div class="pr">(${r[0][0]},${r[0][1]}) → <b class="${ok ? "ok" : "no"}">${f(o)}</b> <span class="muted">want ${r[1]}</span></div>`; }).join("");
    drawChart();
    narrate(n, d, loss);
    el("l-cps").innerHTML = L.cps.length ? L.cps.map((c, i) => `<button class="cp ${i === L.preview ? "on" : ""}" data-i="${i}">${c.title}<small>loss ${f(c.loss, 3)}</small></button>`).join("") : '<span class="muted" style="font-size:.9rem">Snapshots appear at round 1, 10, 100, 1000 and when it\'s solved. Tap one to time-travel.</span>';
    el("l-live").classList.toggle("hidden", L.preview < 0);
  }
  function narrate(n, d, loss) {
    const box = el("l-inside");
    if (!L.grad || L.preview >= 0) {
      box.innerHTML = L.preview >= 0 ? `Time travel! This is the brain at <b>${L.cps[L.preview].title.toLowerCase()}</b>. Press <b>Back to live</b> to continue.` : `Nothing has happened yet. Press <b>Run 1 round</b> and I will tell you who got blamed most, and why.`;
      return;
    }
    const g = L.grad, mag = g.map(Math.abs);
    let top = 0, low = 0;
    mag.forEach((v, i) => { if (v > mag[top]) top = i; if (v < mag[low]) low = i; });
    const k = C.NAMES[top], t = k.split("_");
    const fws = d.map((r) => C.forward(n, r[0]));
    let why = "";
    if (t[0] === "w2") why = `H${+t[1] + 1} speaks loudly to the output (it averaged ${f(fws.reduce((s, q) => s + q.h[+t[1]], 0) / fws.length)}), so a wrong answer is mostly its fault.`;
    else if (t[0] === "b2") why = `the output neuron's own bias moves the answer for every example, so it gets the whole oops directly.`;
    else {
      const j = +(t[0] === "b1" ? t[1] : t[2]);
      why = `H${j + 1} is still sensitive (slope ${f(fws.reduce((s, q) => s + q.h[j] * (1 - q.h[j]), 0) / fws.length, 3)}) and the output listens to it with weight ${sg(n.w2[j])}.`;
    }
    let s = `Most blamed: <b>${humanName(k)}</b> (${f(mag[top], 4)}). Why? ${why}<br>Least blamed: <b>${humanName(C.NAMES[low])}</b> (${f(mag[low], 5)}).`;
    const twins = Math.abs(n.w1[0][0] - n.w1[0][1]) < 1e-6 && Math.abs(n.w1[1][0] - n.w1[1][1]) < 1e-6 && Math.abs(n.b1[0] - n.b1[1]) < 1e-6;
    if (twins) s += `<br><b class="no">Twins!</b> H1 and H2 have identical weights, so they get identical blame and move together. They can never become different.`;
    else if (mag[top] < 1e-3 && loss > 0.05) s += `<br><b class="no">Vanishing gradient:</b> every blame number is tiny, but the answer is still wrong. The neurons are stuck at 0 or 1 where sigmoid is flat, so the blame signal fades away on its way back.`;
    else if (L.lr > 30 && loss > 0.2) s += `<br><b class="no">Too big a step:</b> each nudge overshoots and pushes neurons into the flat part of the sigmoid.`;
    box.innerHTML = s;
  }
  function stats(nRounds) {
    for (let i = 0; i < nRounds; i++) {
      const r = C.round(L.net, data(), L.lr);
      L.net = r.net; L.grad = r.grad; L.round++;
      L.hist.push(C.meanLoss(L.net, data()));
      if ([1, 10, 100, 1000].includes(L.round)) snap(`Round ${L.round}`);
      if (!L.solved && C.rightCount(L.net, data()) === 4 && L.hist[L.hist.length - 1] < 0.02) {
        L.solved = true; snap(`Solved (${L.round})`); stopAuto();
        ML.say(`Solved ${L.ds} in <b>${L.round}</b> rounds. Nobody told me the rule, I just kept nudging.`); ML.confetti();
        break;
      }
    }
  }
  function snap(title) { L.cps.push({ title, round: L.round, net: C.clone(L.net), loss: L.hist[L.hist.length - 1] }); }
  function goLive() { L.preview = -1; }
  function reset(keepNet) {
    stopAuto(); L.preview = -1;
    if (!keepNet) L.net = C.init(SEED, 1);
    L.round = 0; L.hist = []; L.marks = []; L.grad = null; L.cps = []; L.solved = false;
    renderLearn();
  }
  function setLr(v) { L.lr = v; const s = el("l-lr"); s.value = v; s.dispatchEvent(new Event("input")); }
  function stopAuto() { clearInterval(L.timer); L.timer = null; el("l-auto").innerHTML = ML.icon("play") + " Auto"; }
  el("l-auto").addEventListener("click", () => {
    if (L.timer) { stopAuto(); return; }
    goLive();
    el("l-auto").innerHTML = ML.icon("pause") + " Pause";
    L.timer = setInterval(() => { stats(Math.max(1, Math.ceil(L.round / 150)) * 3); renderLearn(); if (L.round > 20000) stopAuto(); }, 60);
  });
  el("l-1").addEventListener("click", () => { stopAuto(); goLive(); stats(1); renderLearn(); });
  el("l-100").addEventListener("click", () => { stopAuto(); goLive(); stats(100); renderLearn(); });
  el("l-reset").addEventListener("click", () => { reset(); ML.say("Fresh random weights. Press Auto and watch the loss fall."); });
  el("l-arrows").addEventListener("change", renderLearn);
  document.querySelectorAll("#l-data button").forEach((b) => b.addEventListener("click", () => setDataset(b.dataset.d, false)));
  function setDataset(d, keep) {
    L.ds = d;
    document.querySelectorAll("#l-data button").forEach((x) => x.classList.toggle("on", x.dataset.d === d));
    if (keep) { L.solved = false; renderLearn(); } else reset();
  }
  el("l-cps").addEventListener("click", (e) => {
    const b = e.target.closest(".cp"); if (!b) return;
    stopAuto(); L.preview = +b.dataset.i; renderLearn();
  });
  el("l-live").addEventListener("click", () => { goLive(); renderLearn(); ML.say("Back to live."); });

  // ---------- challenges ----------
  const CH_INFO = {
    zero: ["All-zero start", "Every weight and bias is now 0. H1 and H2 are identical twins, they get identical blame, so they stay twins. The network can only ever act like one neuron, so XOR is out of reach. Press <b>Auto</b> and watch the loss stick near 0.25.", () => { L.net = C.fromFlat(new Array(9).fill(0)); }],
    huge: ["Huge step size", "Learning rate 100! Each nudge is gigantic, so the weights fly past the good spot and the neurons saturate. Press <b>Auto</b>: the loss does not settle. Slide the rate back down to about 2 to rescue it.", () => setLr(100)],
    sat: ["Bigger weights", "All weights are now large (up to ±8). The sigmoids are pinned at 0 or 1 where the curve is flat, so every blame number is tiny. Learning crawls: a vanishing gradient.", () => { L.net = C.init(SEED, 8); setLr(2); }],
    dead: ["Dead neuron", "H2 has a huge negative bias and negative wires, so it outputs 0 for every input. Its blame is about 0, so it never wakes up. One neuron alone cannot do XOR.", () => { const n = C.init(SEED, 1); n.b1[1] = -12; n.w1[0][1] = -3; n.w1[1][1] = -3; L.net = n; setLr(2); }],
  };
  document.querySelectorAll(".chal .btn").forEach((b) => b.addEventListener("click", () => {
    const c = CH_INFO[b.dataset.c];
    stopAuto(); goLive();
    if (L.ds !== "XOR") setDataset("XOR", true);
    c[2]();
    L.solved = false; L.grad = null;
    L.marks.push({ r: L.round, label: c[0] });
    el("c-note").innerHTML = `<b>${c[0]}.</b> ${c[1]}`;
    ML.say(`Challenge: <b>${c[0]}</b>. The dashed line on the chart marks the moment. Press Auto in the section above.`);
    renderLearn();
    el("l-svg").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }));

  syncSliders();
  play.tries = 0;
  renderPlay();
  renderLearn();
  window.addEventListener("resize", () => {});
})();
