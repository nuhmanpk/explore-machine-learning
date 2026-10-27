// Spam Filter page. Logic lives in sup-spam-core.js (SpamCore).
(function () {
  const C = window.SpamCore, $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CW = 300, CH = 150;
  const { ctx: cx } = ML.setupCanvas($("chart"), CW, CH);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const S = { seed: 0, pile: [], labels: new Map(), nb: new C.NaiveBayes(), mode: "plain", tests: {}, hist: [], marks: [], hits: {}, sel: { t: "none" }, added: {}, baseAcc: 0, dropped: false, topicSeen: false, running: 0, last: null };

  function newSession() {
    stopRobot();
    S.seed = 1 + Math.floor(Math.random() * 90000);
    S.pile = C.pile(S.seed, 60); S.nb.reset(); S.labels = new Map(); S.mode = "plain"; S.added = {};
    S.tests = { plain: C.testSet(S.seed + 1, "plain"), sneaky: C.testSet(S.seed + 2, "sneaky"), topic: C.testSet(S.seed + 3, "topic") };
    S.hist = []; S.marks = []; S.hits = {}; S.sel = { t: "none" }; S.dropped = false; S.topicSeen = false;
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    buildPile(); record();
  }
  // forget labels but keep the pile (tiny-set challenge)
  function forget() {
    stopRobot(); S.nb.reset(); S.labels = new Map(); S.hist = []; S.marks = []; S.hits = {}; S.dropped = false; S.topicSeen = false;
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    record(); ML.say("<b>Memory wiped.</b> Now teach me with only 2 to 5 messages. Which ones would help most?");
  }

  const find = (id) => S.pile.find((m) => m.id === id);
  const toks = (m) => C.tokenize(m.text);
  function setLabel(id, l) {
    const m = find(id), old = S.labels.get(id);
    if (old) S.nb.learn(toks(m), old === "spam", -1);
    if (old === l) S.labels.delete(id); else { S.labels.set(id, l); S.nb.learn(toks(m), l === "spam", 1); }
  }
  function evalNow() { return C.evaluate(S.nb, S.tests[S.mode]); }

  // ---------- pile ----------
  function buildPile() {
    const host = $("pile"); host.innerHTML = "";
    for (const m of S.pile) {
      const d = document.createElement("div"); d.className = "msg"; d.dataset.id = m.id;
      d.innerHTML = `<button class="mtxt" type="button">${m.fresh ? '<span class="newtag">NEW</span>' : ""}${esc(m.text)}</button>
        <div class="mbtns"><button type="button" class="sp" aria-label="Mark as spam">Spam</button><button type="button" class="fn" aria-label="Mark as fine">Fine</button></div>
        <div class="pmeter"><div class="pbar"><i></i></div><span class="pp"></span></div>`;
      host.appendChild(d);
    }
    refreshPile();
  }
  $("pile").addEventListener("click", (e) => {
    const row = e.target.closest(".msg"); if (!row) return;
    const id = +row.dataset.id, b = e.target.closest("button");
    if (b && (b.classList.contains("sp") || b.classList.contains("fn"))) {
      const l = b.classList.contains("sp") ? "spam" : "fine", was = S.labels.get(id);
      setLabel(id, l); S.sel = { t: "msg", id };
      if (was !== l) sayClue(find(id), l);
      record();
    } else if (b) { S.sel = { t: "msg", id }; refreshPile(); renderInside(); }
  });
  function refreshPile() {
    $("pile").querySelectorAll(".msg").forEach((row) => {
      const id = +row.dataset.id, m = find(id), l = S.labels.get(id), p = S.nb.prob(m.text);
      row.className = "msg" + (l ? " l-" + l : "") + (S.sel.t === "msg" && S.sel.id === id ? " sel" : "");
      row.querySelector(".sp").classList.toggle("on", l === "spam");
      row.querySelector(".fn").classList.toggle("on", l === "fine");
      row.querySelector(".pbar i").style.width = (p * 100).toFixed(0) + "%";
      row.querySelector(".pp").textContent = Math.round(p * 100) + "% spam";
    });
    const n = S.labels.size;
    $("pilecount").textContent = `· ${n} of ${S.pile.length} labelled`;
  }
  function sayClue(m, l) {
    const ws = [...new Set(toks(m))].slice(0, 6).map((w) => `<b>${esc(w)}</b>`).join(", ");
    ML.say(`You said <b>${l === "spam" ? "SPAM" : "FINE"}</b>. The words you were looking at: ${ws}. I will remember ${l === "spam" ? "they show up in spam" : "they show up in normal chat"}!`);
  }

  // ---------- cloud ----------
  function renderCloud() {
    const ws = S.nb.words().filter((x) => Math.abs(x.score) > 0.05 && ((S.nb.s.get(x.w) || 0) + (S.nb.f.get(x.w) || 0)) >= 1);
    ws.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    const top = ws.slice(0, 26), mx = Math.max(1, ...top.map((x) => Math.abs(x.score)));
    const el = $("cloud"); el.classList.toggle("empty", !top.length);
    el.innerHTML = top.map((x) => {
      const sz = 0.8 + 0.9 * (Math.abs(x.score) / mx), col = x.score > 0 ? "var(--bad)" : "var(--good)";
      return `<span style="font-size:${sz.toFixed(2)}rem;color:${col}" title="${x.score.toFixed(2)}">${esc(x.w)}<sup style="font-size:.6rem;font-family:var(--font-mono)">${x.score > 0 ? "+" : ""}${x.score.toFixed(1)}</sup></span>`;
    }).join("");
  }

  // ---------- inside card ----------
  const chip = (it) => {
    if (!it.known) return `<span class="wchip unk">${esc(it.w)}<small>?</small></span>`;
    const a = Math.min(60, 12 + Math.abs(it.score) * 14), col = it.score > 0 ? "var(--bad)" : "var(--good)";
    return `<span class="wchip" style="background:color-mix(in srgb,${col} ${a.toFixed(0)}%,var(--card));color:var(--ink);border-color:${col}">${esc(it.w)}<small>${it.score > 0 ? "+" : ""}${it.score.toFixed(1)}</small></span>`;
  };
  function renderInside() {
    const host = $("inside");
    let text = "", head = "";
    if (S.sel.t === "msg") { const m = find(S.sel.id); text = m.text; head = "This message"; }
    else if (S.sel.t === "own") { text = $("own").value; head = "Your message"; }
    if (!text.trim()) { host.innerHTML = `<div class="sig"><span>Tap any message in the pile, or type your own. I will show which words pushed it towards <b style="color:var(--bad)">spam</b> or <b style="color:var(--good)">fine</b>.</span></div>`; return; }
    const ex = S.nb.explain(text), pct = Math.round(ex.prob * 100);
    host.innerHTML = `<div class="sig"><span><b>${head}:</b> “${esc(text)}”</span></div>
      <div class="chips">${ex.items.map(chip).join("") || "<span class='muted'>No words yet</span>"}</div>
      <div class="sig"><span class="mono">start (how common spam is) <b>${ex.prior >= 0 ? "+" : ""}${ex.prior.toFixed(1)}</b> + words <b>${(ex.total - ex.prior >= 0 ? "+" : "") + (ex.total - ex.prior).toFixed(1)}</b> = <b>${ex.total >= 0 ? "+" : ""}${ex.total.toFixed(1)}</b></span></div>
      <div class="decision">${S.nb.ns + S.nb.nf === 0 ? "I have not learned anything yet, so it is a coin flip: 50%." : pct > 50 ? `Total is above zero: ${pct}% spam.` : pct < 50 ? `Total is below zero: only ${pct}% spam, so it looks fine.` : "Exactly even: 50%."}</div>
      <div class="muted" style="font-size:.82rem;font-weight:700">Red chips push towards spam, green towards fine. A grey ? is a word I have never seen, so it gets no say.</div>`;
  }
  $("own").addEventListener("input", () => { S.sel = { t: "own" }; ownMeter(); refreshPile(); renderInside(); });
  $("own").addEventListener("focus", () => { if ($("own").value) { S.sel = { t: "own" }; refreshPile(); renderInside(); } });
  function ownMeter() { const p = S.nb.prob($("own").value); $("own-bar").style.width = Math.round(p * 100) + "%"; $("own-p").textContent = Math.round(p * 100) + "% spam"; }

  // ---------- chart ----------
  function drawChart() {
    const c = cx, L = 30, R = 8, T = 10, B = 22, n = S.hist.length, xm = Math.max(10, n - 1);
    const X = (i) => L + (i / xm) * (CW - L - R), Y = (v) => CH - B - v * (CH - T - B);
    const muted = ML.cssVar("--muted"), ink = ML.cssVar("--ink");
    c.clearRect(0, 0, CW, CH);
    c.font = "700 10px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "right";
    [0, 0.5, 1].forEach((v) => c.fillText(Math.round(v * 100) + "%", L - 4, Y(v) + 3));
    c.textAlign = "center"; c.fillText("labels / steps", (L + CW - R) / 2, CH - 5);
    c.strokeStyle = ML.cssVar("--line"); c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(L, Y(0.5)); c.lineTo(CW - R, Y(0.5)); c.stroke(); c.setLineDash([]);
    // shaded stretches where a trick test is on
    c.fillStyle = ML.cssVar("--warn"); c.globalAlpha = 0.14;
    for (let i = 1; i < n; i++) if (S.hist[i].mode !== "plain") c.fillRect(X(i - 1), T, X(i) - X(i - 1), CH - T - B);
    c.globalAlpha = 1;
    c.strokeStyle = ML.cssVar("--accent"); c.lineWidth = 2.5; c.lineJoin = "round"; c.beginPath();
    S.hist.forEach((h, i) => (i ? c.lineTo(X(i), Y(h.acc)) : c.moveTo(X(i), Y(h.acc)))); c.stroke();
    S.marks.forEach((m) => { c.strokeStyle = muted; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(X(m.i), T); c.lineTo(X(m.i), CH - B); c.stroke(); c.setLineDash([]); c.fillStyle = muted; c.textAlign = "left"; c.fillText(m.t, Math.min(X(m.i) + 3, CW - 40), T + 8); });
    Object.values(S.hits).forEach((i) => { const h = S.hist[Math.min(i, n - 1)]; if (!h) return; c.fillStyle = ML.cssVar("--warn"); c.strokeStyle = ink; c.lineWidth = 1.5; c.beginPath(); c.arc(X(Math.min(i, n - 1)), Y(h.acc), 6, 0, 7); c.fill(); c.stroke(); });
  }

  // ---------- record + challenges ----------
  function record(extra) {
    const e = evalNow(); S.last = e;
    S.hist.push({ acc: e.acc, mode: S.mode, fa: e.falseAlarms });
    $("acc").textContent = Math.round(e.acc * 100) + "%"; $("fa").textContent = e.falseAlarms; $("miss").textContent = e.misses;
    checkChallenges(e); renderCloud(); refreshPile(); renderInside(); ownMeter(); drawChart();
    $("mode-note").textContent = S.mode === "sneaky" ? "Test is now: sneaky spam with fake spellings and swapped words." : S.mode === "topic" ? "Test is now: normal chat that uses spammy-looking words like FREE." : "";
  }
  const CH_DEF = {
    teach: () => S.mode === "plain" && S.last.acc >= 0.9 && S.labels.size >= 6 && "You taught it well: 90% on messages it never saw!",
    tiny: () => S.mode === "plain" && S.labels.size >= 2 && S.labels.size <= 5 && S.last.acc >= 0.75 && "Wow, a tiny teacher! But with so few examples one unlucky word can fool it.",
    sneak: () => S.mode === "sneaky" && S.labels.size >= 10 && S.baseAcc - S.last.acc >= 0.1 && "Sneaky spam slipped past! It had never seen fr33 or c4ndy.",
    retrain: () => S.mode === "sneaky" && S.hits.sneak != null && S.last.acc >= 0.8 && "Retraining worked: it learned the sneaky spellings.",
    topic: () => S.mode === "topic" && S.labels.size >= 10 && S.last.falseAlarms >= 3 && "False alarms! FREE and WIN also appear in friendly chat.",
    fix: () => S.mode === "topic" && S.hits.topic != null && S.last.falseAlarms <= 2 && "Fixed! Now it knows the whole message matters, not just one word.",
  };
  function checkChallenges() {
    for (const k in CH_DEF) {
      if (S.hits[k] != null) continue;
      const msg = CH_DEF[k]();
      if (msg) { S.hits[k] = S.hist.length - 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); if (k === "teach") ML.confetti(40); }
    }
  }

  // ---------- modes ----------
  function setMode(mode) {
    if (mode !== "plain" && !S.added[mode]) {
      S.added[mode] = true;
      const nid = 1000 * (mode === "sneaky" ? 1 : 2);
      const ex = C.extras(S.seed + 10 + nid, mode, 12, nid).map((m) => ({ ...m, fresh: true }));
      S.pile = ex.concat(S.pile); buildPile();
    }
    if (mode === S.mode) return;
    S.baseAcc = S.mode === "plain" && S.last ? S.last.acc : S.baseAcc;
    S.mode = mode;
    S.marks.push({ i: S.hist.length, t: mode === "plain" ? "normal" : mode === "sneaky" ? "sneaky" : "topic" });
    record();
    if (mode === "sneaky") ML.say(`The spammer got <b>sneaky</b>: <b>fr33</b>, <b>c4ndy</b> and swapped words. Accuracy is now <b>${Math.round(S.last.acc * 100)}%</b>. I added 12 new sneaky messages to the pile. Label them (or press Robot) so I can learn the tricks!`);
    else if (mode === "topic") ML.say(`New topic! Normal chat that says things like <b>free</b> and <b>win</b>. I now cry spam too often: <b>${S.last.falseAlarms}</b> false alarms. Teach me the new messages are <b>Fine</b>.`);
    else ML.say("Back to the normal test messages.");
  }
  $("m-sneaky").addEventListener("click", () => { if (S.labels.size < 6) ML.toast("Teach me a few messages first, then try the sneaky spammer."); setMode("sneaky"); });
  $("m-topic").addEventListener("click", () => { if (S.labels.size < 6) ML.toast("Teach me a few messages first, then try the new topic."); setMode("topic"); });
  $("m-plain").addEventListener("click", () => setMode("plain"));
  $("m-tiny").addEventListener("click", forget);
  $("reset").addEventListener("click", () => { newSession(); ML.say("Fresh pile, fresh robot. Mark some messages!"); });

  // ---------- robot learns from all ----------
  function stopRobot() { clearTimeout(S.running); S.running = 0; const b = $("robot"); if (b) b.innerHTML = `${ML.icon("play")} Robot, learn from all`; }
  $("robot").addEventListener("click", () => {
    if (S.running) { stopRobot(); return; }
    const todo = S.pile.filter((m) => !S.labels.has(m.id));
    if (!todo.length) { ML.toast("Everything is already labelled."); return; }
    $("robot").innerHTML = `${ML.icon("pause")} Stop`;
    ML.say("I will read the rest of the pile and learn from each message, one by one. Watch the accuracy line!");
    let i = 0;
    const step = () => {
      if (i >= todo.length) { stopRobot(); ML.say(`Done! I learned from ${S.labels.size} messages. Accuracy on the secret test: <b>${Math.round(S.last.acc * 100)}%</b>.`); return; }
      const m = todo[i++]; setLabel(m.id, m.spam ? "spam" : "fine"); S.sel = { t: "msg", id: m.id }; record();
      S.running = setTimeout(step, reduce ? 10 : 110);
    };
    S.running = setTimeout(step, 50);
  });

  new MutationObserver(drawChart).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"] });
  window.addEventListener("load", drawChart);
  window.SpamPage = S; // handy for testing
  newSession();
})();
