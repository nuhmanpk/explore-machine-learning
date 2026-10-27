// Update Your Belief page. Logic lives in prob-bayes-core.js (BayesCore).
(function () {
  const C = window.BayesCore, $ = (id) => document.getElementById(id);
  const W = 300, H = 150, COLS = 50, GAP = 6;
  const { ctx: cx } = ML.setupCanvas($("grid"), W, H);
  const STORY = {
    med: { crowd: "1000 pretend people", prior: "How common is the sickness?", hp: "Out of 1000 people, how many really have it.", sens: "Test catches the sick", fpr: "False alarms on healthy people",
      tp: "sick and flagged", fp: "healthy but flagged", fn: "sick, missed", tn: "healthy, quiet", has: "sick", pos: "positive", neg: "negative", hasN: "really sick", a: "positive test" },
    key: { crowd: "1000 pretend rooms", prior: "How often are the keys in this room?", hp: "Out of 1000 rooms you check, how many truly hold your keys.", sens: "Beeper beeps when keys are there", fpr: "Beeps when keys are NOT there",
      tp: "keys here, beep", fp: "no keys, beep", fn: "keys here, silent", tn: "no keys, silent", has: "has the keys", pos: "beep", neg: "silence", hasN: "really has the keys", a: "beep" },
  };
  const S = { story: "med", prior: 0.2, sens: 0.9, fpr: 0.1, people: C.crowd(7, 1000), beliefs: [0.2], results: [], start: 0.2, truth: null, truthSeen: false, hits: {}, r: ML.seeded ? ML.seeded(Math.floor(Math.random() * 1e6)) : Math.random };
  const pct = (x) => (x >= 0.1 ? Math.round(x * 100) : x >= 0.001 ? (x * 100).toFixed(1) : (x * 100).toFixed(2)) + "%";

  function resetChain() {
    S.beliefs = [S.prior]; S.results = []; S.start = S.prior; S.truth = null; S.truthSeen = false;
    $("truth").textContent = "";
  }
  function colors() { return { tp: ML.cssVar("--bad"), fp: ML.cssVar("--warn"), fn: ML.cssVar("--bad"), tn: ML.cssVar("--line") }; }
  function draw() {
    const e = S.e, col = colors();
    cx.clearRect(0, 0, W, H);
    const order = ["tp", "fp", "fn", "tn"], rows = Math.ceil(1000 / COLS), ox = (W - COLS * GAP) / 2 + GAP / 2, oy = (H - rows * GAP) / 2 + GAP / 2;
    let i = 0;
    for (const k of order) {
      const n = e[k]; cx.fillStyle = col[k]; cx.globalAlpha = k === "fn" ? 0.4 : k === "tn" ? 0.75 : 1;
      for (let j = 0; j < n; j++, i++) { cx.beginPath(); cx.arc(ox + (i % COLS) * GAP, oy + Math.floor(i / COLS) * GAP, k === "tp" || k === "fp" ? 2.5 : 2, 0, 6.2832); cx.fill(); }
    }
    cx.globalAlpha = 1;
  }
  function render() {
    const T = STORY[S.story], e = S.e = C.classify(S.people, S.prior, S.sens, S.fpr);
    $("crowd-t").textContent = T.crowd;
    $("l-prior").textContent = T.prior; $("h-prior").textContent = T.hp; $("l-sens").textContent = T.sens; $("l-fpr").textContent = T.fpr;
    $("lg-tp").textContent = T.tp; $("lg-fp").textContent = T.fp; $("lg-fn").textContent = T.fn; $("lg-tn").textContent = T.tn;
    const share = C.posterior(S.prior, S.sens, S.fpr, true);
    $("answer").innerHTML = `${e.positives} flagged: ${e.tp} red, ${e.fp} orange. A ${T.a} means <span style="color:var(--accent)">${pct(share)}</span> ${T.hasN}.`;
    $("explain").textContent = e.positives ? `${e.tp} of the ${e.positives} flagged are real (${e.tp} / ${e.positives}).` : "Nobody was flagged.";
    const b = S.beliefs[S.beliefs.length - 1];
    $("belief").textContent = `I believe ${pct(b)} ${T.hasN}`; $("belief-bar").style.width = Math.max(1, b * 100) + "%";
    $("hist").innerHTML = S.results.map((x, i) => `<span class="${x ? "p" : "n"}">${x ? "+" : "−"} ${pct(S.beliefs[i + 1])}</span>`).join("");
    const lr = S.fpr > 0 ? (S.sens / S.fpr).toFixed(1) : "huge";
    $("inside").innerHTML = `<div class="sig"><span class="dot" style="background:var(--accent)"></span><span>Prior <b>${pct(S.prior)}</b> × sensitivity <b>${pct(S.sens)}</b> = <b>${pct(S.prior * S.sens)}</b> real flags</span></div>
      <div class="sig"><span class="dot" style="background:var(--warn)"></span><span>Others <b>${pct(1 - S.prior)}</b> × false alarm <b>${pct(S.fpr)}</b> = <b>${pct((1 - S.prior) * S.fpr)}</b> false flags</span></div>
      <div class="decision">Real ÷ all flags = ${pct(share)}</div><div class="mono">each ${T.pos} multiplies your odds by ${lr}</div>`;
    draw(); check();
  }
  const CH = {
    flip: () => C.posterior(S.prior, S.sens, S.fpr, true) >= 0.9 && "A positive now means 90% or more. Few false alarms plus a common thing makes a test trustworthy.",
    rare: () => S.prior <= 0.01 && S.sens >= 0.9 && C.posterior(S.prior, S.sens, S.fpr, true) < 0.25 && "Rare surprise! Even a 90%-accurate test is mostly false alarms when the thing is rare.",
    twice: () => S.start <= 0.05 && S.results.length >= 2 && S.beliefs[S.beliefs.length - 1] >= 0.9 && "Second opinions add up. Each positive built on the last belief.",
    good: () => S.start >= 0.1 && S.results.length >= 1 && S.beliefs[S.beliefs.length - 1] < 0.01 && "Good news travels: a few negatives made the worry nearly vanish.",
  };
  function check() {
    for (const k in CH) {
      if (S.hits[k]) continue;
      const m = CH[k]();
      if (m) { S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(m); ML.say(`<b>Challenge done!</b> ${m}`); }
    }
  }
  function test(x) {
    S.results.push(x); S.beliefs.push(C.posterior(S.beliefs[S.beliefs.length - 1], S.sens, S.fpr, x));
    if (S.results.length > 14) { S.results.shift(); S.beliefs.shift(); }
    render();
  }
  $("t-pos").onclick = () => test(true);
  $("t-neg").onclick = () => test(false);
  $("t-rand").onclick = () => {
    if (S.truth == null) S.truth = S.r() < S.start;
    const x = C.takeTest(S.r, S.truth, S.sens, S.fpr); test(x);
    $("truth").textContent = "Truth is hidden. Press Random test a few times, then Reveal.";
    $("t-reveal").hidden = false;
  };
  const rev = document.createElement("button");
  rev.className = "btn small ghost"; rev.id = "t-reveal"; rev.hidden = true; rev.type = "button"; rev.textContent = "Reveal the truth";
  rev.onclick = () => { if (S.truth != null) $("truth").textContent = S.truth ? "Truth: it really was there. Belief was right to climb." : "Truth: it was NOT there. Those were false alarms."; };
  $("t-reset").parentNode.appendChild(rev);
  $("t-reset").onclick = () => { resetChain(); rev.hidden = true; render(); };

  function setStory(s) {
    S.story = s;
    $("st-med").classList.toggle("on", s === "med"); $("st-key").classList.toggle("on", s === "key");
    $("st-med").setAttribute("aria-pressed", s === "med"); $("st-key").setAttribute("aria-pressed", s === "key");
    ML.say(s === "med" ? "A medical test! Red dots are sick people the test caught." : "Lost keys! A beeper beeps near keys, but sometimes it beeps for nothing. Red dots are real beeps.");
    resetChain(); rev.hidden = true; render();
  }
  $("st-med").onclick = () => setStory("med"); $("st-key").onclick = () => setStory("key");
  const sl = (sel, key, f) => ML.bindRange(sel, (v) => (key === "prior" ? v / 10 : v) + "%", (v) => { S[key] = key === "prior" ? v / 1000 : v / 100; if (S.ready) { resetChain(); rev.hidden = true; render(); } });
  sl("#prior", "prior"); sl("#sens", "sens"); sl("#fpr", "fpr");
  S.ready = true; resetChain(); render();
  document.addEventListener("themechange", draw);
})();
