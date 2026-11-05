// Spot the Motion page. Logic lives in video-flow-core.js (FlowCore).
(function () {
  const F = window.FlowCore, $ = (id) => document.getElementById(id), { W, H } = F;
  const SW = 256, SH = 192, BW = 512, BH = 384, K = BW / W, PW = 200;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ca = ML.setupCanvas($("fa"), SW, SH).ctx, cb = ML.setupCanvas($("fb"), SW, SH).ctx, cf = ML.setupCanvas($("flow"), BW, BH).ctx;
  const cw = ML.setupCanvas($("win"), PW, PW).ctx, ch = ML.setupCanvas($("heat"), PW, PW).ctx, cwh = ML.setupCanvas($("wheel"), 44, 44).ctx;
  const S = { bs: 8, r: 6, speed: 1, wall: false, zoom: false, noise: false, view: "arrows", sel: null, hits: {}, last: Date.now(), nudged: {}, flick: null, ready: false };

  // off-screen pictures of A and B at their real 128×96 size
  const mkOff = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const offA = mkOff(), offB = mkOff();
  function toCanvas(off, rgb) {
    const x = off.getContext("2d"), img = x.createImageData(W, H), d = img.data;
    for (let i = 0; i < W * H; i++) { d[4 * i] = rgb[3 * i] * 255; d[4 * i + 1] = rgb[3 * i + 1] * 255; d[4 * i + 2] = rgb[3 * i + 2] * 255; d[4 * i + 3] = 255; }
    x.putImageData(img, 0, 0);
  }
  function blit(ctx, off, w, h, alpha) { ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.drawImage(off, 0, 0, w, h); ctx.globalAlpha = 1; }

  // ---------- compute ----------
  function rebuildScene() {
    S.scene = F.makeScene({ speed: S.speed, wall: S.wall, zoom: S.zoom, noise: S.noise ? 0.08 : 0 });
    S.pair = F.makePair(S.scene);
    toCanvas(offA, S.pair.A.rgb); toCanvas(offB, S.pair.B.rgb);
    rebuildFlow();
  }
  function rebuildFlow() {
    const keep = S.sel && S.fl ? blockCentre(S.sel.bx, S.sel.by) : [41, 33]; // start on the square
    S.fl = F.blockFlow(S.pair.A.gray, S.pair.B.gray, S.bs, S.r);
    S.ev = F.evaluate(S.fl, S.pair.flow, S.pair.A.id);
    S.sel = blockAt(keep[0], keep[1]);
    draw();
  }
  const blockCentre = (bx, by) => [S.fl.ox + (bx + 0.5) * S.fl.bs, S.fl.oy + (by + 0.5) * S.fl.bs];
  function blockAt(x, y) { const fl = S.fl; return { bx: Math.max(0, Math.min(fl.cols - 1, Math.floor((x - fl.ox) / fl.bs))), by: Math.max(0, Math.min(fl.rows - 1, Math.floor((y - fl.oy) / fl.bs))) }; }

  // ---------- drawing ----------
  function arrow(c, x0, y0, x1, y1, col, w) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w; c.lineCap = "round";
    if (L < 2.5) { c.beginPath(); c.arc(x0, y0, 2.2, 0, 7); c.fill(); return; }
    const hd = Math.min(8, L * 0.45);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 - Math.cos(a) * hd * 0.6, y1 - Math.sin(a) * hd * 0.6); c.stroke();
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - hd * Math.cos(a - 0.45), y1 - hd * Math.sin(a - 0.45)); c.lineTo(x1 - hd * Math.cos(a + 0.45), y1 - hd * Math.sin(a + 0.45)); c.closePath(); c.fill();
  }
  function drawFrames() {
    ca.clearRect(0, 0, SW, SH); cb.clearRect(0, 0, SW, SH);
    blit(ca, offA, SW, SH); blit(cb, offB, SW, SH);
  }
  function drawFlow() {
    const c = cf, fl = S.fl, ev = S.ev, good = ML.cssVar("--good"), bad = ML.cssVar("--bad"), ink = ML.cssVar("--ink"), bg = ML.cssVar("--canvas-bg");
    c.clearRect(0, 0, BW, BH);
    if (S.flick) { blit(c, S.flick.b ? offB : offA, BW, BH); c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(8, 8, 96, 26); c.fillStyle = "#fff"; c.font = "800 14px Nunito, sans-serif"; c.textAlign = "left"; c.fillText(S.flick.b ? "Picture B" : "Picture A", 16, 26); return; }
    blit(c, offA, BW, BH); c.fillStyle = bg; c.globalAlpha = S.view === "colours" ? 0.25 : 0.5; c.fillRect(0, 0, BW, BH); c.globalAlpha = 1;
    const bsK = fl.bs * K;
    // faint block grid
    c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 1;
    for (let i = 0; i <= fl.cols; i++) { const x = (fl.ox + i * fl.bs) * K; c.beginPath(); c.moveTo(x, fl.oy * K); c.lineTo(x, (fl.oy + fl.rows * fl.bs) * K); c.stroke(); }
    for (let j = 0; j <= fl.rows; j++) { const y = (fl.oy + j * fl.bs) * K; c.beginPath(); c.moveTo(fl.ox * K, y); c.lineTo((fl.ox + fl.cols * fl.bs) * K, y); c.stroke(); }
    for (let j = 0; j < fl.rows; j++) for (let i = 0; i < fl.cols; i++) {
      const k = j * fl.cols + i, x = (fl.ox + i * fl.bs) * K, y = (fl.oy + j * fl.bs) * K, cx = x + bsK / 2, cy = y + bsK / 2;
      if (S.view === "colours") {
        const col = F.flowColor(fl.u[k], fl.v[k], 6 * S.speed);
        c.fillStyle = `rgba(${col[0] * 255 | 0},${col[1] * 255 | 0},${col[2] * 255 | 0},.85)`; c.fillRect(x + 1, y + 1, bsK - 2, bsK - 2);
      } else if (S.view === "truth") {
        arrow(c, cx, cy, cx + ev.gu[k] * K, cy + ev.gv[k] * K, ink, 2.5);
      } else {
        arrow(c, cx, cy, cx + fl.u[k] * K, cy + fl.v[k] * K, ev.err[k] < 1 ? good : bad, 2.5);
      }
    }
    if (S.sel) { const x = (fl.ox + S.sel.bx * fl.bs) * K, y = (fl.oy + S.sel.by * fl.bs) * K; c.strokeStyle = ML.cssVar("--warn"); c.lineWidth = 3; c.strokeRect(x, y, bsK, bsK); }
  }
  function drawWheel() {
    const c = cwh; c.clearRect(0, 0, 44, 44);
    for (let y = 0; y < 44; y++) for (let x = 0; x < 44; x++) {
      const u = (x - 22) / 20, v = (y - 22) / 20; if (u * u + v * v > 1) continue;
      const col = F.flowColor(u, v, 1); c.fillStyle = `rgb(${col[0] * 255 | 0},${col[1] * 255 | 0},${col[2] * 255 | 0})`; c.fillRect(x, y, 1, 1);
    }
  }
  function drawPeek() {
    const fl = S.fl, { bx, by } = S.sel, bs = fl.bs, r = fl.r, k = by * fl.cols + bx, n = 2 * r + 1;
    const x0 = fl.ox + bx * bs, y0 = fl.oy + by * bs, span = bs + 2 * r, s = PW / span;
    // search window in B
    cw.clearRect(0, 0, PW, PW); cw.fillStyle = ML.cssVar("--canvas-bg"); cw.fillRect(0, 0, PW, PW);
    cw.imageSmoothingEnabled = false;
    const sx = x0 - r, sy = y0 - r, cx0 = Math.max(0, sx), cy0 = Math.max(0, sy), cx1 = Math.min(W, sx + span), cy1 = Math.min(H, sy + span);
    cw.drawImage(offB, cx0, cy0, cx1 - cx0, cy1 - cy0, (cx0 - sx) * s, (cy0 - sy) * s, (cx1 - cx0) * s, (cy1 - cy0) * s);
    const box = (dx, dy, col, dash, w) => { cw.setLineDash(dash); cw.strokeStyle = col; cw.lineWidth = w; cw.strokeRect((r + dx) * s, (r + dy) * s, bs * s, bs * s); cw.setLineDash([]); };
    box(0, 0, "#fff", [4, 4], 2);
    box(S.ev.gu[k], S.ev.gv[k], ML.cssVar("--good"), [6, 3], 2.5);
    box(fl.u[k], fl.v[k], ML.cssVar("--warn"), [], 3);
    // match map
    const cm = F.costMap(S.pair.A.gray, S.pair.B.gray, bs, r, bx, by);
    let lo = Infinity, hi = 0; for (const v of cm) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const cs = PW / n; ch.clearRect(0, 0, PW, PW);
    let near = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = cm[j * n + i], q = hi > lo ? (v - lo) / (hi - lo) : 0, b = Math.pow(1 - q, 1.6);
      if (v - lo < 0.012) near++;
      ch.fillStyle = `rgb(${30 + 225 * b | 0},${20 + 200 * b | 0},${60 + 80 * b | 0})`; ch.fillRect(i * cs, j * cs, cs + 0.5, cs + 0.5);
    }
    const tx = (S.ev.gu[k] + r + 0.5) * cs, ty = (S.ev.gv[k] + r + 0.5) * cs, inside = Math.abs(S.ev.gu[k]) <= r + 0.5 && Math.abs(S.ev.gv[k]) <= r + 0.5;
    if (inside) { ch.strokeStyle = ML.cssVar("--good"); ch.lineWidth = 3; ch.beginPath(); ch.moveTo(tx - 7, ty); ch.lineTo(tx + 7, ty); ch.moveTo(tx, ty - 7); ch.lineTo(tx, ty + 7); ch.stroke(); }
    const rx = (fl.u[k] + r + 0.5) * cs, ry = (fl.v[k] + r + 0.5) * cs, rr = Math.max(7, cs * 0.8);
    ch.strokeStyle = "#000"; ch.lineWidth = 5; ch.beginPath(); ch.arc(rx, ry, rr, 0, 7); ch.stroke();
    ch.strokeStyle = ML.cssVar("--warn"); ch.lineWidth = 3; ch.beginPath(); ch.arc(rx, ry, rr, 0, 7); ch.stroke();
    const dir = (u, v) => { const p = []; if (Math.abs(u) >= 0.5) p.push(`${Math.abs(u).toFixed(1)} ${u > 0 ? "right" : "left"}`); if (Math.abs(v) >= 0.5) p.push(`${Math.abs(v).toFixed(1)} ${v > 0 ? "down" : "up"}`); return p.length ? p.join(", ") : "stayed still"; };
    const what = F.LAYER_NAMES[S.ev.owner[k]], e = S.ev.err[k];
    let msg = `This block is mostly <b>${what}</b>. I think it moved <b>${dir(fl.u[k], fl.v[k])}</b>. Truly: ${dir(S.ev.gu[k], S.ev.gv[k])}. `;
    msg += !inside ? `<span style="color:var(--bad)">The true move is outside my search box!</span>` : e < 1 ? `<span style="color:var(--good)">Right!</span>` : `<span style="color:var(--bad)">Missed by ${e.toFixed(1)} dots.</span>`;
    if (near > 6) msg += ` ${near} moves look almost equally good, so I had to guess.`;
    $("peektext").innerHTML = msg;
    return { near, inside, what, e, flat: fl.texture[k] };
  }
  function drawStats() {
    const ev = S.ev;
    $("avg").textContent = ev.avg.toFixed(1); $("good").textContent = Math.round(ev.good * 100) + "%";
    const ent = Object.entries(ev.byLayer).sort((a, b) => b[1] - a[1]);
    $("worst").textContent = ent[0][1] >= 1 ? ent[0][0] : "none!";
    $("bylayer").innerHTML = ent.map(([k, v]) => `<span>${k}</span><span class="${v < 1 ? "ok" : "bad"}">${v.toFixed(1)} dots</span>`).join("");
  }
  const TAGS = { arrows: "green = right, red = wrong", colours: "colour = direction", truth: "the real motion" };
  function draw() {
    if (!S.fl) return;
    drawFrames(); drawFlow(); drawStats(); const pk = drawPeek();
    $("viewtag").textContent = TAGS[S.view];
    $("wheelwrap").classList.toggle("show", S.view === "colours");
    if (S.ready) check(pk);
  }

  // ---------- challenges + narration ----------
  const TRY = { fast: "Next: the blank wall puzzle. Press <b>Blank wall</b>.", wall: "Next: press <b>Noisy camera</b> and try to beat the speckles.", noise: "All done! Try <b>Zoom in</b>: the background arrows spread out from the middle like a starburst." };
  function hit(k, msg) {
    if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done");
    ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg} ${TRY[k]}`);
    if (Object.keys(S.hits).length === 3) ML.confetti(50);
  }
  function check(pk) {
    const sq = S.ev.byLayer.square;
    if (S.speed >= 2 && sq != null && sq < 1) hit("fast", "I can see far enough to catch the speedy square.");
    if (S.wall && pk.what === "blank wall" && pk.flat < 0.02) hit("wall", "A blank block matches everywhere, so every move looks the same. I can't tell which way it went!");
    if (S.noise && S.ev.avg < 1) hit("noise", "Bigger blocks average lots of dots, so the speckles cancel out.");
  }
  const NUDGE = {
    fast: "Psst! Slide <b>How fast things move</b> to 2×. Watch the square's arrows turn red, then make my <b>search distance</b> bigger.",
    wall: "Psst! Press <b>Blank wall</b>, then tap a block right in the middle of the pale wall.",
    noise: "Psst! Set the speed to 1×, turn off the other extras and press <b>Noisy camera</b>. Then try making the <b>block size</b> bigger and watch the average miss.",
  };
  function touch() { S.last = Date.now(); }
  setInterval(() => {
    if (Date.now() - S.last < 15000) return;
    const k = ["fast", "wall", "noise"].find((c) => !S.hits[c]);
    if (!k || S.nudged[k]) return;
    S.nudged[k] = 1; S.last = Date.now(); ML.say(NUDGE[k]);
  }, 3000);

  // ---------- controls ----------
  let pend = 0; const soon = (fn) => { cancelAnimationFrame(pend); pend = requestAnimationFrame(fn); };
  ML.bindRange("#bs", (v) => v + " dots", (v) => {
    S.bs = v; if (!S.ready) return; touch(); soon(() => {
      rebuildFlow();
      ML.say(v <= 6 ? `Tiny blocks of <b>${v}×${v}</b> dots. Sharp at the edges, but easy to fool: there isn't much pattern inside each one.` : v >= 14 ? `Big blocks of <b>${v}×${v}</b>. Steady, but a block that covers two moving things can only get one arrow.` : `Blocks of <b>${v}×${v}</b> dots. Average miss: <b>${S.ev.avg.toFixed(1)}</b> dots.`);
    });
  });
  ML.bindRange("#r", (v) => v + " dots", (v) => {
    S.r = v; if (!S.ready) return; touch(); soon(() => {
      rebuildFlow();
      const sq = S.ev.byLayer.square || 0;
      ML.say(sq >= 1 ? `I look up to <b>${v}</b> dots away. The square jumps further than that, so I can't find it!` : `I look up to <b>${v}</b> dots away in every direction. That's ${(2 * v + 1) ** 2} spots to try for each block!`);
    });
  });
  ML.bindRange("#speed", (v) => v + "×", (v) => {
    S.speed = v; if (!S.ready) return; touch(); soon(() => {
      rebuildScene();
      const sq = S.scene.truth.square;
      ML.say(`Now the square jumps <b>${sq[0]}</b> dots right and <b>${sq[1]}</b> down between the pictures. ${sq[0] > S.r ? "That's further than I search! Look at the red arrows." : "I can still reach that."}`);
    });
  });
  const EXTRA_SAY = {
    wall: ["A plain wall slid in. Look at its arrows: inside it there's nothing to match!", "Wall gone."],
    zoom: ["The camera zooms in. The background now moves outwards from the middle: a different arrow for every block.", "No more zoom. The background stays still."],
    noise: ["Speckles everywhere, like filming in the dark! Tiny blocks get very confused.", "Clean pictures again."],
  };
  document.querySelectorAll("#extras button").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.k; S[k] = !S[k]; b.setAttribute("aria-pressed", String(S[k])); touch();
    rebuildScene(); ML.say(EXTRA_SAY[k][S[k] ? 0 : 1]);
  }));
  const VIEW_SAY = { arrows: "My own arrows. Green ones are right, red ones are wrong.", colours: "Every block painted by direction. Same colour = moving the same way. Look how the windmill makes a rainbow: every part goes a different way!", truth: "These are the true moves, because we built this video ourselves. Real videos don't come with answers, which is why this is hard." };
  document.querySelectorAll("#view button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#view button").forEach((x) => x.classList.toggle("on", x === b));
    S.view = b.dataset.v; touch(); draw(); ML.say(VIEW_SAY[S.view]);
  }));
  function pick(x, y) {
    S.sel = blockAt(x / K, y / K); touch(); draw();
    const k = S.sel.by * S.fl.cols + S.sel.bx;
    if (S.fl.texture[k] < 0.02) ML.say("This block has almost no pattern. Look at the match map: a big bright puddle. Lots of moves look the same, so I'm just guessing.");
    else if (S.ev.err[k] >= 1) ML.say("I got this one wrong. Look at the match map: is the true + even inside my search box? Is there more than one bright spot?");
    else ML.say("See the one bright spot on the match map? Only one move fits, so I'm sure. That's my arrow.");
  }
  $("flow").addEventListener("click", (e) => { const p = ML.canvasPoint($("flow"), e, BW, BH); pick(p.x, p.y); });
  $("flow").addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
    e.preventDefault(); const fl = S.fl;
    S.sel = { bx: Math.max(0, Math.min(fl.cols - 1, S.sel.bx + d[0])), by: Math.max(0, Math.min(fl.rows - 1, S.sel.by + d[1])) }; touch(); draw();
  });
  $("flick").addEventListener("click", () => {
    if (S.flick) return; touch();
    S.flick = { b: false, n: 0 }; const step = reduce ? 900 : 450;
    ML.say("Watch closely: A, B, A, B… Your eyes are doing optical flow right now!");
    const tick = () => { if (!S.flick) return; S.flick.n++; S.flick.b = !S.flick.b; if (S.flick.n > 8) { S.flick = null; } draw(); if (S.flick) setTimeout(tick, step); };
    draw(); setTimeout(tick, step);
  });

  document.addEventListener("themechange", draw);
  new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  drawWheel();
  rebuildScene();
  S.ready = true;
})();
