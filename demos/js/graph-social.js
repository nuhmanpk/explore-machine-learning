// Friends of Friends page. Logic lives in graph-social-core.js (GraphSocialCore).
(function () {
  const C = window.GraphSocialCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CW = 420, CH = 380, PAL = ["--nn", "--sup", "--unsup", "--rl", "--diff", "--vision", "--lang"];
  const { ctx: cx } = ML.setupCanvas($("net"), CW, CH);
  const S = { seed: 1, g: null, L: null, sel: -1, mode: "pick", comm: null, hits: {}, raf: 0 };
  const col = (c) => ML.cssVar(PAL[c % PAL.length]);
  const X = (p) => CW / 2 + p.x * (CW / 2 - 30), Y = (p) => CH / 2 + p.y * (CH / 2 - 28);
  const maxDeg = () => Math.max(...S.g.adj.map((s) => s.size));
  const nm = (i) => C.NAMES[i];

  function newTown(first) {
    do { S.seed++; S.g = C.makeGraph(S.seed); S.comm = C.communities(S.g, 7); } while (S.comm.count !== 3 && S.seed < 400);
    S.L = C.initLayout(S.g.n, S.seed); S.sel = -1;
    if (!first) { S.hits = {}; document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done")); }
    $("people").innerHTML = C.NAMES.map((n, i) => `<button type="button" data-i="${i}" aria-pressed="false">${n}</button>`).join("");
    setMode("pick"); refresh(); heat();
  }
  $("people").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) clickNode(+b.dataset.i); });

  function heat() {
    if (reduce) { for (let i = 0; i < 300; i++) C.stepLayout(S.g, S.L); draw(); return; }
    if (S.raf) return;
    let n = 0;
    const tick = () => { const e = C.stepLayout(S.g, S.L); draw(); n++; S.raf = e > 0.0004 && n < 400 ? requestAnimationFrame(tick) : 0; };
    S.raf = requestAnimationFrame(tick);
  }

  function setMode(m) {
    S.mode = m; $("m-pick").setAttribute("aria-pressed", String(m === "pick")); $("m-link").setAttribute("aria-pressed", String(m === "link"));
    $("hint").textContent = m === "pick" ? "Tap a dot (or a name below) to pick a person."
      : S.sel < 0 ? "Pick the first person, then tap a second person to make or break their friendship."
      : `Now tap someone to make friends with ${nm(S.sel)}, or tap an existing friend to break the friendship.`;
  }
  $("m-pick").addEventListener("click", () => setMode("pick"));
  $("m-link").addEventListener("click", () => setMode("link"));
  $("newtown").addEventListener("click", () => { newTown(false); ML.say("A brand new town! Different people, different clumps."); });
  $("net").addEventListener("click", (e) => {
    const p = ML.canvasPoint($("net"), e, CW, CH); let best = -1, bd = 24;
    S.L.pos.forEach((q, i) => { const d = Math.hypot(X(q) - p.x, Y(q) - p.y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) clickNode(best);
  });

  function hit(k, msg) { if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); if (k === "hub") ML.confetti(30); }

  function clickNode(i) {
    if (S.mode === "link" && S.sel >= 0 && S.sel !== i) {
      const a = S.sel, was = S.comm.comm.slice(), added = S.g.toggle(a, i);
      S.comm = C.communities(S.g, 7);
      if (added) { if (was[a] !== was[i]) hit("bridge", "A bridge between two groups!"); ML.say(`<b>${nm(a)}</b> and <b>${nm(i)}</b> are now friends. See how the suggestions changed.`); }
      else { hit("break", "A friendship ended. Suggestions are worked out again."); ML.say(`<b>${nm(a)}</b> and <b>${nm(i)}</b> are no longer friends.`); }
      refresh(); heat(); return;
    }
    S.sel = i; hit("pick", "Nice, you picked someone!");
    if (S.g.deg(i) === maxDeg()) hit("hub", "That is the most popular person in town!");
    const s = C.suggest(S.g, i, 3), d = S.g.deg(i);
    ML.say(s.length ? `<b>${nm(i)}</b> has ${d} friend${d === 1 ? "" : "s"}. Best match: <b>${nm(s[0].v)}</b>, who shares ${s[0].n} of their friends.` : `<b>${nm(i)}</b> has ${d} friend${d === 1 ? "" : "s"} and nobody to suggest yet.`);
    refresh(); setMode(S.mode);
  }
  function addFriend(v) {
    const a = S.sel, was = S.comm.comm.slice();
    S.g.add(a, v); S.comm = C.communities(S.g, 7);
    hit("accept", "You followed a suggestion!");
    if (was[a] !== was[v]) hit("bridge", "A bridge between two groups!");
    ML.say(`<b>${nm(a)}</b> and <b>${nm(v)}</b> are friends now. Their shared friends made it a good match.`);
    refresh(); heat();
  }
  $("sugg").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) addFriend(+b.dataset.v); });

  // ---------- panel ----------
  function refresh() {
    const { comm, count } = S.comm, sizes = new Array(count).fill(0); comm.forEach((c) => sizes[c]++);
    $("ngrp").textContent = count;
    document.querySelectorAll("#people button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i === S.sel)));
    const u = S.sel;
    if (u < 0) {
      $("pname").textContent = "Nobody picked yet"; $("pdeg").textContent = $("pgrp").textContent = "-"; $("pfriends").textContent = "";
      $("sugg").innerHTML = `<li><span class="muted">Pick someone to see suggestions.</span></li>`;
      $("inside").innerHTML = `<div class="sig"><span>Groups are found by label passing: everybody copies the label most of their friends have. Suggestions score shared friends.</span></div>`;
    } else {
      $("pname").textContent = nm(u); $("pdeg").textContent = S.g.deg(u); $("pgrp").textContent = sizes[comm[u]];
      $("pfriends").textContent = "Friends: " + ([...S.g.adj[u]].map(nm).join(", ") || "none yet");
      const sg = C.suggest(S.g, u, 5);
      $("sugg").innerHTML = sg.length ? sg.map((s) => `<li><span>${nm(s.v)} <span class="pct">${Math.round(s.jaccard * 100)}%</span></span><button class="btn small" type="button" data-v="${s.v}" aria-label="Add ${nm(s.v)} as a friend of ${nm(u)}"><i data-icon="plus"></i> Add</button><small>${s.n} shared friend${s.n === 1 ? "" : "s"}: ${s.common.map(nm).join(", ")}</small></li>`).join("")
        : `<li><span class="muted">No shared friends with anyone new.</span></li>`;
      if (ML.hydrateIcons) ML.hydrateIcons($("sugg"));
      const s0 = sg[0];
      $("inside").innerHTML = s0 ? `<div class="sig"><span><b>${nm(u)}</b> and <b>${nm(s0.v)}</b>: ${s0.n} shared friend${s0.n === 1 ? "" : "s"} out of ${S.g.deg(u) + S.g.deg(s0.v) - s0.n} different friends in total.</span></div>
        <div class="sig"><span class="mono">Jaccard = ${s0.n} / ${S.g.deg(u) + S.g.deg(s0.v) - s0.n} = <b>${Math.round(s0.jaccard * 100)}%</b></span></div>
        <div class="decision">Higher means more overlap in their circles of friends.</div>` : `<div class="sig"><span>${nm(u)} shares no friends with anybody they have not met. Add a friendship to open new paths.</span></div>`;
    }
    draw();
  }

  // ---------- canvas ----------
  function draw() {
    const c = cx, g = S.g, pos = S.L.pos, ink = ML.cssVar("--ink"), line = ML.cssVar("--line"), muted = ML.cssVar("--muted"), card = ML.cssVar("--card");
    c.clearRect(0, 0, CW, CH);
    const sel = S.sel, nb = sel >= 0 ? g.adj[sel] : new Set(), sg = sel >= 0 ? C.suggest(g, sel, 3) : [];
    c.lineWidth = 1.6;
    for (const [a, b] of g.edges()) {
      const hot = sel >= 0 && (a === sel || b === sel);
      c.strokeStyle = hot ? ink : line; c.lineWidth = hot ? 2.6 : 1.6; c.beginPath(); c.moveTo(X(pos[a]), Y(pos[a])); c.lineTo(X(pos[b]), Y(pos[b])); c.stroke();
    }
    if (sel >= 0) { c.setLineDash([5, 4]); c.strokeStyle = ML.cssVar("--warn"); c.lineWidth = 3; sg.forEach((s) => { c.beginPath(); c.moveTo(X(pos[sel]), Y(pos[sel])); c.lineTo(X(pos[s.v]), Y(pos[s.v])); c.stroke(); }); c.setLineDash([]); }
    c.font = "800 10px Nunito, sans-serif"; c.textAlign = "center";
    for (let i = 0; i < g.n; i++) {
      const x = X(pos[i]), y = Y(pos[i]), r = 6 + g.deg(i) * 0.9, dim = sel >= 0 && i !== sel && !nb.has(i);
      c.globalAlpha = dim ? 0.55 : 1; c.fillStyle = col(S.comm.comm[i]); c.beginPath(); c.arc(x, y, Math.max(4, r), 0, 7); c.fill();
      c.lineWidth = i === sel ? 4 : 2; c.strokeStyle = i === sel ? ink : card; c.stroke(); c.globalAlpha = 1;
      c.fillStyle = i === sel || nb.has(i) ? ink : muted; c.fillText(nm(i), x, y + Math.max(4, r) + 10);
    }
  }
  new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", draw);
  window.SocialPage = S;
  newTown(true);
})();
