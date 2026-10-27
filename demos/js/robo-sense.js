// Trust Your Sensors page. Logic lives in robo-sense-core.js (SenseCore).
(function () {
  const C = window.SenseCore, $ = (id) => document.getElementById(id);
  const probe = document.createElement("i"); probe.style.display = "none"; document.body.appendChild(probe);
  const rc = (n) => { probe.style.color = "var(" + n + ")"; return getComputedStyle(probe).color; };
  const al = (c, a) => c.replace("rgb(", "rgba(").replace(")", ", " + a + ")");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CW = C.W, CH = C.H, { ctx: cx } = ML.setupCanvas($("cv"), CW, CH);
  const S = { w: null, f: null, run: !reduce, hits: {}, n: 0, last: null, trail: [], ktrail: [], otrail: [], dots: [], rr: new C.Rms(150), ro: new C.Rms(150), rk: new C.Rms(150), entrySig: null, wasIn: false };
  const qOf = () => 5 * Math.pow(400, +$("qs").value / 100); // 5 .. 2000, log scale

  function reset() {
    S.w = new C.World(1 + Math.floor(Math.random() * 90000)); S.f = new C.Fuser(); S.n = 0; S.trail = []; S.ktrail = []; S.otrail = []; S.dots = [];
    S.rr = new C.Rms(150); S.ro = new C.Rms(150); S.rk = new C.Rms(150); S.entrySig = null; S.wasIn = false; S.last = null;
    for (let i = 0; i < 2; i++) tick(); draw();
  }
  function tick() {
    const std = +$("noise").value, o = S.w.step(std, $("tunnel").checked), r = S.f.step(o, std, qOf());
    S.n++; S.last = { o, r };
    S.trail.push(o.truth); S.otrail.push(o.odo); if (S.trail.length > 150) { S.trail.shift(); S.otrail.shift(); }
    if (o.z) { S.dots.push(o.z); if (S.dots.length > 25) S.dots.shift(); S.rr.add(C.dist(o.z, o.truth)); }
    S.ro.add(C.dist(o.odo, o.truth));
    if (r) { S.rk.add(C.dist(r.est, o.truth)); S.ktrail.push(r.est); if (S.ktrail.length > 150) S.ktrail.shift();
      const sg = Math.hypot(r.sig[0], r.sig[1]);
      if (o.inTunnel && !S.wasIn) S.entrySig = sg; if (!o.inTunnel) S.entrySig = null; S.wasIn = o.inTunnel;
      S.sig = sg;
    }
    if (S.n % 5 === 0) check();
  }
  const CH_DEF = {
    best: () => S.n >= 200 && +$("noise").value >= 15 && S.rr.v > 0 && S.rk.v < 0.5 * S.rr.v && "The filter's guess is more than twice as accurate as the raw sensor!",
    drift: () => C.dist(S.last.o.odo, S.last.o.truth) >= 60 && "The wheels-only guess drifted 60 pixels away. Small errors add up forever.",
    tunnel: () => $("tunnel").checked && S.entrySig != null && S.last.o.inTunnel && S.sig >= 2 * S.entrySig && "In the dark the ring keeps growing: with no new measurement the filter becomes less sure.",
    bad: () => S.n >= 250 && S.rr.v > 0 && S.rk.v >= S.rr.v && "A badly tuned filter is no better than the raw sensor. Tuning matters!",
  };
  function check() {
    for (const k in CH_DEF) { if (S.hits[k]) continue; const m = CH_DEF[k](); if (m) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); if (k === "best") ML.confetti(40); } }
  }
  function stats() {
    $("e-raw").textContent = S.rr.v.toFixed(0); $("e-odo").textContent = S.ro.v.toFixed(0); $("e-kf").textContent = S.rk.v.toFixed(0);
    const q = qOf(), lag = S.rk.v > S.rr.v * 1.05;
    $("verdict").textContent = S.last && S.last.o.inTunnel ? "Sensor is dark! The filter is guessing from its own motion model." : lag ? (+$("qs").value < 50 ? "The filter trusts its straight-line idea too much and lags behind the turns." : "The filter trusts the sensor too much and copies its jitter.") : "Green follows the true robot much more closely than the blue dots do.";
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Sensor noise <b>${$("noise").value}</b> px</span></div><div class="sig"><span class="dot" style="background:var(--good)"></span><span>Swerve guess <b>${q.toFixed(0)}</b></span></div>` + (S.last && S.last.r ? `<div class="mono">uncertainty ±${S.last.r.sig[0].toFixed(1)} px in x, ±${S.last.r.sig[1].toFixed(1)} px in y</div><div class="mono">${S.last.o.z ? "New reading arrived: blend it in" : "No reading this step: predict only"}</div>` : "");
  }
  function draw() {
    const ink = rc("--ink"), acc = rc("--accent"), good = rc("--good"), warn = rc("--warn"), line = rc("--line");
    cx.clearRect(0, 0, CW, CH);
    if ($("tunnel").checked) { cx.fillStyle = al(ink, 0.12); cx.fillRect(S.w.tunnel[0], 0, S.w.tunnel[1] - S.w.tunnel[0], CH); cx.fillStyle = rc("--muted"); cx.font = "700 11px Nunito, sans-serif"; cx.textAlign = "center"; cx.fillText("tunnel", (S.w.tunnel[0] + S.w.tunnel[1]) / 2, 14); }
    const trail = (pts, c, w) => { cx.strokeStyle = c; cx.lineWidth = w; cx.beginPath(); pts.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); cx.stroke(); };
    trail(S.otrail, al(warn, 0.7), 2); trail(S.trail, al(ink, 0.35), 2); trail(S.ktrail, al(good, 0.8), 2);
    S.dots.forEach((p, i) => { cx.fillStyle = al(acc, 0.15 + 0.6 * i / S.dots.length); cx.beginPath(); cx.arc(p[0], p[1], 3, 0, 7); cx.fill(); });
    const o = S.last && S.last.o, r = S.last && S.last.r; if (!o) return;
    cx.fillStyle = warn; cx.beginPath(); cx.arc(o.odo[0], o.odo[1], 5, 0, 7); cx.fill();
    if (r) { const rx = Math.max(2, 2 * r.sig[0]), ry = Math.max(2, 2 * r.sig[1]); cx.strokeStyle = good; cx.fillStyle = al(good, 0.12); cx.lineWidth = 2; cx.beginPath(); cx.ellipse(r.est[0], r.est[1], rx, ry, 0, 0, 7); cx.fill(); cx.stroke(); cx.fillStyle = good; cx.beginPath(); cx.arc(r.est[0], r.est[1], 4, 0, 7); cx.fill(); }
    cx.fillStyle = ink; cx.strokeStyle = rc("--card"); cx.lineWidth = 2; cx.beginPath(); cx.arc(o.truth[0], o.truth[1], 6, 0, 7); cx.fill(); cx.stroke();
  }
  let last = 0;
  function frame(t) { if (S.run && t - last > 16) { last = t; tick(); tick(); stats(); draw(); } requestAnimationFrame(frame); }
  function setPlay(v) { S.run = v; $("play").innerHTML = v ? '<i data-icon="pause"></i> Pause' : '<i data-icon="play"></i> Play'; ML.hydrateIcons($("play")); }
  $("play").addEventListener("click", () => setPlay(!S.run));
  $("step").addEventListener("click", () => { setPlay(false); for (let i = 0; i < 4; i++) tick(); stats(); draw(); });
  $("reset").addEventListener("click", () => { reset(); stats(); ML.say("A new robot, a new wander. The wheels start out right, but watch them drift!"); });
  ML.bindRange("#noise", (v) => v + " px", () => { if (S.last) stats(); });
  ML.bindRange("#qs", (v) => "×" + (5 * Math.pow(400, v / 100)).toFixed(0), () => { if (S.last) stats(); });
  $("tunnel").addEventListener("change", () => { S.entrySig = null; if ($("tunnel").checked) ML.say("The sensor goes <b>dark</b> inside the tunnel. Watch the green ring swell while I only guess."); draw(); });
  document.addEventListener("themechange", draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  reset(); stats(); setPlay(S.run); requestAnimationFrame(frame);
})();
