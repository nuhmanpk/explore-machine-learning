// The Random Surfer page. Logic lives in graph-pagerank-core.js (GraphPagerankCore).
(function () {
  const C = window.GraphPagerankCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CW = 420, CH = 420, FARM = 6, BASE = C.PAGES.length;
  const { ctx: cx } = ML.setupCanvas($("web"), CW, CH);
  const S = { out: C.clone(C.START), farm: false, d: 0.85, sel: -1, surfer: null, it: null, iters: 0, diff: 1, exact: null, playing: false, hits: {}, anim: null, speed: 6, last: 0, acc: 0, farmBefore: 0 };

  function posOf(i) {
    const cxn = CW / 2, cyn = CH / 2;
    if (i < BASE) { const a = (i / BASE) * Math.PI * 2 - Math.PI / 2; return { x: cxn + Math.cos(a) * 120, y: cyn + Math.sin(a) * 120 }; }
    const k = i - BASE, a0 = (C.MINE / BASE) * Math.PI * 2 - Math.PI / 2, a = a0 + (k - (FARM - 1) / 2) * 0.2;
    return { x: cxn + Math.cos(a) * 187, y: cyn + Math.sin(a) * 187 };
  }
  const graph = () => (S.farm ? C.withFarm(S.out, C.MINE, FARM) : S.out);
  const nodeR = (i) => 11 + (S.exact ? Math.sqrt(S.exact[i]) * 38 : 0) * (i < BASE ? 1 : 0.7);

  function rebuild(msg) {
    const g = graph();
    S.exact = C.pagerank(g, S.d).rank; S.it = C.uniform(g.length); S.iters = 0; S.diff = 1;
    if (!S.surfer) S.surfer = new C.Surfer(g, S.d, 1 + Math.floor(Math.random() * 9e4)); else { S.surfer.d = S.d; S.surfer.setGraph(g); }
    S.anim = null; refresh();
    if (msg) ML.say(msg);
  }
  const rankOf = (i) => C.ranking(S.exact).indexOf(i) + 1;

  // ---------- controls ----------
  $("pages").innerHTML = C.PAGES.map((n, i) => `<button type="button" data-i="${i}" aria-pressed="false">${n}</button>`).join("");
  $("pages").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) clickPage(+b.dataset.i); });
  $("web").addEventListener("click", (e) => {
    const p = ML.canvasPoint($("web"), e, CW, CH); let best = -1, bd = 30;
    for (let i = 0; i < BASE; i++) { const q = posOf(i), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) clickPage(best);
  });
  function clickPage(i) {
    if (S.sel < 0 || S.sel === i) { S.sel = S.sel === i ? -1 : i; refresh(); return; }
    const a = S.sel, had = S.out[a].includes(i);
    if (had) S.out[a] = S.out[a].filter((x) => x !== i); else S.out[a].push(i);
    const before = S.exact[C.MINE]; rebuild();
    ML.say(had ? `Removed the link <b>${C.PAGES[a]}</b> to <b>${C.PAGES[i]}</b>. The surfer starts counting again.` : `New link: <b>${C.PAGES[a]}</b> points to <b>${C.PAGES[i]}</b>. ${C.PAGES[i]} just got a vote, so its score ${S.exact[i] > 0 ? "goes up" : "changes"}.`);
    void before; check();
  }
  function setPlaying(on) { S.playing = on; $("play").innerHTML = `${ML.icon(on ? "pause" : "play")} ${on ? "Pause" : "Surf"}`; if (on) { S.last = 0; requestAnimationFrame(loop); } }
  $("play").addEventListener("click", () => { setPlaying(!S.playing); if (S.playing) ML.say("Off she goes! Each hop follows a random link, and sometimes she jumps to a random page."); });
  $("burst").addEventListener("click", () => { for (let i = 0; i < 1000; i++) S.surfer.step(); S.anim = null; refresh(); check(); ML.say(`1000 more hops. The surfer's shares now differ from the maths by only <b>${gapPct()}%</b>.`); });
  $("resetc").addEventListener("click", () => { S.surfer.reset(); S.anim = null; refresh(); });
  ML.bindRange("#damp", (v) => v.toFixed(2), (v) => { if (S.d === v && S.surfer) return; S.d = v; if (S.surfer) { rebuild(`Now she keeps clicking links ${Math.round(v * 100)}% of the time and jumps to a random page otherwise.`); check(); } });
  ML.bindRange("#speed", (v) => v + " hops/s", (v) => { S.speed = v; });
  $("farm").addEventListener("click", () => {
    const was = S.exact[C.MINE]; S.farm = !S.farm; S.sel = -1; S.surfer.pos = Math.min(S.surfer.pos, BASE - 1); rebuild();
    $("farm").setAttribute("aria-pressed", String(S.farm)); $("farm").innerHTML = S.farm ? `${ML.icon("minus")} Remove the link farm` : `${ML.icon("plus")} Add the link farm`;
    if (S.farm) { S.farmBefore = was; ML.say(`6 junk pages now all point at the <b>Bike Shop</b>. Its score went from <b>${(was * 100).toFixed(1)}%</b> to <b>${(S.exact[C.MINE] * 100).toFixed(1)}%</b>. Cheating works... on a simple ranker like this one!`); }
    else ML.say("Link farm removed. The Bike Shop falls back down.");
    check();
  });
  $("it1").addEventListener("click", () => { iterOnce(); refresh(); check(); });
  $("settle").addEventListener("click", () => {
    if (S.diff < 1e-6) { S.it = C.uniform(S.out.length); S.iters = 0; }
    let n = 0; const go = () => { iterOnce(); refresh(); n++; if (S.diff >= 1e-6 && n < 200) (reduce ? go() : setTimeout(go, 25)); else { check(); ML.say(`Settled after <b>${S.iters}</b> rounds. The orange bars match the surfer's long-run shares.`); } }; go();
  });
  function iterOnce() { const nx = C.step(graph(), S.it, S.d); S.diff = C.l1(nx, S.it); S.it = nx; S.iters++; }

  // ---------- surfer animation ----------
  function loop(t) {
    if (!S.playing) return;
    if (!S.last) S.last = t;
    const dt = Math.min(200, t - S.last); S.last = t;
    const dur = 1000 / S.speed;
    if (reduce || dur < 70) { S.acc += dt; while (S.acc >= dur) { S.acc -= dur; S.surfer.step(); } S.anim = null; }
    else {
      if (!S.anim) { S.anim = { ...S.surfer.step(), t: 0 }; }
      S.anim.t += dt / dur; if (S.anim.t >= 1) S.anim = null;
    }
    refresh(true); check();
    requestAnimationFrame(loop);
  }

  // ---------- stats + challenges ----------
  const gapPct = () => (C.l1(S.surfer.share(), S.exact) * 50).toFixed(1);
  function check() {
    const hit = (k, m) => { if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); };
    if (S.surfer.steps >= 1000 && +gapPct() <= 6) hit("surf", "The surfer matches the maths!");
    if (S.iters > 1 && S.diff < 1e-6) hit("iter", "Power iteration settled on the answer.");
    if (S.d <= 0.55) hit("damp", "A restless surfer visits pages more evenly.");
    if (!S.farm && C.ranking(S.exact)[0] === C.MINE) hit("boost", "The Bike Shop is number one!");
    if (S.farm && S.exact[C.MINE] >= S.farmBefore * 1.25) hit("farm", "The link farm pumped up the Bike Shop. Cheaters beware!");
  }
  function refresh(light) {
    const n = S.exact.length, sh = S.surfer.share();
    $("steps").textContent = S.surfer.steps; $("gap").textContent = S.surfer.steps ? gapPct() + "%" : "-"; $("iter").textContent = S.iters; $("myrank").textContent = "#" + rankOf(C.MINE);
    const mx = Math.max(0.01, ...S.exact, ...sh, ...S.it);
    $("rows").innerHTML = Array.from({ length: BASE }, (_, i) => `<div class="rrow${i === C.MINE ? " mine" : ""}"><span>${C.PAGES[i]}</span><span class="bars"><span class="bar"><i style="width:${(sh[i] / mx * 100).toFixed(1)}%"></i></span><span class="bar pr"><i style="width:${(S.it[i] / mx * 100).toFixed(1)}%"></i></span></span></div>`).join("")
      + (S.farm ? `<div class="rrow"><span>6 junk pages</span><span class="n">${(S.exact.slice(BASE).reduce((a, b) => a + b, 0) * 100).toFixed(0)}% of the score</span></div>` : "");
    document.querySelectorAll("#pages button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i === S.sel)));
    const s = S.surfer.pos;
    $("inside").innerHTML = `<div class="sig"><span>The surfer is on <b>${C.nameOf(s)}</b>. ${S.out[s] && s < BASE ? (S.out[s].length ? "Its links go to " + S.out[s].map((j) => C.PAGES[j]).join(", ") + "." : "It has no links, so she must jump somewhere random.") : ""}</span></div>
      <div class="sig"><span class="mono">${S.d.toFixed(2)} chance to follow a link, ${(1 - S.d).toFixed(2)} to jump. Top page by maths: <b>${C.nameOf(C.ranking(S.exact)[0])}</b> (${(Math.max(...S.exact) * 100).toFixed(0)}%)</span></div>`;
    draw();
  }

  // ---------- canvas ----------
  function arrow(c, a, b, ra, rb, color, w) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, bend = 14;
    const sx = a.x + ux * ra + nx * 3, sy = a.y + uy * ra + ny * 3, ex = b.x - ux * (rb + 3) + nx * 3, ey = b.y - uy * (rb + 3) + ny * 3;
    const mx = (sx + ex) / 2 + nx * bend * 0.5, my = (sy + ey) / 2 + ny * bend * 0.5;
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = w; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
    const tx = ex - mx, ty = ey - my, tl = Math.hypot(tx, ty) || 1, tux = tx / tl, tuy = ty / tl;
    c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - tux * 9 - tuy * 4.5, ey - tuy * 9 + tux * 4.5); c.lineTo(ex - tux * 9 + tuy * 4.5, ey - tuy * 9 - tux * 4.5); c.closePath(); c.fill();
  }
  function draw() {
    if (!S.exact) return;
    const c = cx, g = graph(), ink = ML.cssVar("--ink"), line = ML.cssVar("--line"), card = ML.cssVar("--card"), warn = ML.cssVar("--warn"), acc = ML.cssVar("--accent");
    c.clearRect(0, 0, CW, CH);
    g.forEach((o, i) => o.forEach((j) => { const hot = i === S.sel; arrow(c, posOf(i), posOf(j), nodeR(i), nodeR(j), hot ? ink : i >= BASE ? ML.cssVar("--bad") : line, hot ? 2.6 : 1.8); }));
    c.font = "800 10.5px Nunito, sans-serif"; c.textAlign = "center";
    const sp = S.surfer.pos;
    for (let i = 0; i < g.length; i++) {
      const p = posOf(i), r = nodeR(i);
      c.fillStyle = i >= BASE ? ML.cssVar("--bad") : i === C.MINE ? acc : ML.cssVar("--sup"); c.globalAlpha = i >= BASE ? 0.6 : 1;
      c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill(); c.globalAlpha = 1; c.lineWidth = i === S.sel ? 4 : 2; c.strokeStyle = i === S.sel ? ink : card; c.stroke();
      if (i < BASE) { c.fillStyle = ink; c.fillText(C.PAGES[i], p.x, p.y + r + 11); c.fillStyle = "#fff"; c.font = "800 11px Nunito, sans-serif"; c.fillText(Math.round(S.exact[i] * 100) + "%", p.x, p.y + 4); c.font = "800 10.5px Nunito, sans-serif"; }
    }
    // surfer dot
    let q = posOf(sp);
    if (S.anim) { const a = posOf(S.anim.from), b = posOf(S.anim.to), t = Math.min(1, S.anim.t); q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    c.fillStyle = warn; c.strokeStyle = ink; c.lineWidth = 2.5; c.beginPath(); c.arc(q.x, q.y, 8, 0, 7); c.fill(); c.stroke();
  }
  new MutationObserver(() => draw()).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", () => draw());
  window.PagerankPage = S;
  rebuild();
})();
