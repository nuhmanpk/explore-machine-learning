// Steady Hands (PID) page. Logic lives in robo-pid-core.js (PidCore).
(function () {
  const probe = document.createElement("i"); probe.style.display = "none"; document.body.appendChild(probe);
  const rc = (n) => { probe.style.color = "var(" + n + ")"; return getComputedStyle(probe).color; };
  const al = (c, a) => c.replace("rgb(", "rgba(").replace(")", ", " + a + ")");
  const C = window.PidCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CW = 480, CH = 240, { ctx: cx } = ML.setupCanvas($("plot"), CW, CH);
  const S = { sim: null, ph: null, hits: {} };
  const P = { l: 36, r: 10, t: 12, b: 24 };

  function params() { return { kp: +$("kp").value, ki: +$("ki").value, kd: +$("kd").value, gust: $("gust").checked }; }
  function run() {
    S.sim = C.simulate(params()); const m = S.sim.metrics;
    $("m-os").textContent = m.overshoot.toFixed(0) + "%";
    $("m-st").textContent = m.settle == null ? "never" : m.settle.toFixed(1) + " s";
    $("m-er").textContent = m.endError.toFixed(2) + " m";
    $("verdict").textContent = m.overshoot >= 40 ? "It swings past the target and wobbles. Too much push!" : m.settle == null ? "It has not settled inside the green band yet." : m.overshoot < 1 ? "Smooth landing, no overshoot." : "Nice. It lands close to the target.";
    renderInside(); check(m); draw();
  }
  function renderInside() {
    const p = params(), e = S.sim.metrics;
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>P pushes with <b>${p.kp}</b> × the gap.</span></div>
      <div class="sig"><span class="dot" style="background:var(--good)"></span><span>I adds <b>${p.ki}</b> × all the past gap.</span></div>
      <div class="sig"><span class="dot" style="background:var(--warn)"></span><span>D brakes with <b>${p.kd}</b> × the speed.</span></div>
      <div class="mono">peak height ${e.peak.toFixed(2)} m${p.gust ? ", lowest after gust " + (1 - e.gustDip).toFixed(2) + " m" : ""}</div>`;
  }
  const CH_DEF = {
    fast: (m) => m.overshoot < 10 && m.settle != null && m.settle <= 1.5 && "Quick and neat! Strong P with enough D.",
    smooth: (m) => m.overshoot < 1 && m.settle != null && m.settle <= 3 && "Gentle landing, no overshoot at all.",
    wobble: (m) => m.overshoot >= 40 && "Wobbly! Too much P without D makes it swing.",
    gust: (m) => params().gust && m.endError < 0.02 && "The I term cancelled the wind. No leftover error!",
  };
  function check(m) {
    for (const k in CH_DEF) {
      if (S.hits[k]) continue; const msg = CH_DEF[k](m);
      if (msg) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (k === "gust") ML.confetti(40); }
    }
  }

  function draw() {
    const s = S.sim; if (!s) return;
    const col = (n) => rc(n), ink = col("--ink"), mut = col("--muted"), acc = col("--accent"), good = col("--good"), warn = col("--warn"), line = col("--line");
    cx.clearRect(0, 0, CW, CH);
    const maxY = Math.max(1.5, Math.min(3, s.metrics.peak * 1.05)), minY = -0.1, T = s.p.T;
    const X = (t) => P.l + (t / T) * (CW - P.l - P.r), Y = (v) => CH - P.b - ((v - minY) / (maxY - minY)) * (CH - P.t - P.b);
    cx.font = "11px Nunito, sans-serif"; cx.fillStyle = mut; cx.strokeStyle = line; cx.lineWidth = 1; cx.textAlign = "right";
    for (let v = 0; v <= maxY; v += 0.5) { cx.beginPath(); cx.moveTo(P.l, Y(v)); cx.lineTo(CW - P.r, Y(v)); cx.stroke(); cx.fillText(v.toFixed(1), P.l - 4, Y(v) + 4); }
    cx.textAlign = "center"; for (let t = 0; t <= T; t += 2) cx.fillText(t + "s", X(t), CH - 8);
    cx.fillStyle = al(good, 0.2); cx.fillRect(P.l, Y(1.02), CW - P.l - P.r, Math.max(1, Y(0.98) - Y(1.02)));
    cx.strokeStyle = good; cx.setLineDash([5, 4]); cx.beginPath(); cx.moveTo(P.l, Y(1)); cx.lineTo(CW - P.r, Y(1)); cx.stroke(); cx.setLineDash([]);
    if (s.p.gust) { cx.strokeStyle = warn; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(X(s.p.gustAt), P.t); cx.lineTo(X(s.p.gustAt), CH - P.b); cx.stroke(); cx.fillStyle = warn; cx.textAlign = "left"; cx.fillText("gust", X(s.p.gustAt) + 4, P.t + 10); }
    const upto = S.ph == null ? s.y.length - 1 : Math.min(s.y.length - 1, Math.round(S.ph * (s.y.length - 1)));
    cx.strokeStyle = acc; cx.lineWidth = 3; cx.lineJoin = "round"; cx.beginPath();
    for (let i = 0; i <= upto; i += 2) { const px = X(s.t[i]), py = Math.max(P.t - 4, Math.min(CH - P.b + 4, Y(s.y[i]))); i ? cx.lineTo(px, py) : cx.moveTo(px, py); }
    cx.stroke();
    if (S.ph != null) { cx.fillStyle = ink; cx.beginPath(); cx.arc(X(s.t[upto]), Math.max(P.t, Math.min(CH - P.b, Y(s.y[upto]))), 6, 0, 7); cx.fill(); }
  }
  let raf = 0;
  function replay() {
    cancelAnimationFrame(raf); if (reduce) { S.ph = null; draw(); return; }
    const t0 = performance.now(); S.ph = 0;
    const tick = (now) => { S.ph = Math.min(1, (now - t0) / 3000); draw(); if (S.ph < 1) raf = requestAnimationFrame(tick); else { S.ph = null; draw(); } };
    raf = requestAnimationFrame(tick);
  }
  const set = (kp, ki, kd) => { $("kp").value = kp; $("ki").value = ki; $("kd").value = kd; ["kp", "ki", "kd"].forEach((i) => $(i).dispatchEvent(new Event("input"))); };
  const onChange = () => { S.ph = null; run(); };
  ML.bindRange("#kp", (v) => v.toFixed(1), onChange); ML.bindRange("#ki", (v) => v.toFixed(1), onChange); ML.bindRange("#kd", (v) => v.toFixed(1), onChange);
  $("gust").addEventListener("change", onChange);
  $("replay").addEventListener("click", replay);
  $("r-p").addEventListener("click", () => { set(10, 0, 0); ML.say("<b>P only.</b> It reaches the target fast but swings past it and wobbles, because nothing brakes it."); });
  $("r-pd").addEventListener("click", () => { set(10, 0, 5); ML.say("<b>P + D.</b> Now the brake calms the wobble. With the gust on, though, a small gap stays. That is where I comes in."); });
  $("r-pid").addEventListener("click", () => { set(20, 10, 8); ML.say("<b>P + I + D.</b> I keeps pushing until the gap is really gone, even against the wind. Turn the gust on to see."); });
  $("r-wild").addEventListener("click", () => { set(35, 0, 0); ML.say("<b>Way too much P.</b> A huge push, no brake: the drone overshoots wildly."); });
  document.addEventListener("themechange", draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
})();
