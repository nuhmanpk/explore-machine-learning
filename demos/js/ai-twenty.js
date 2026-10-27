// Mind Reader (20 questions) — UI: animal tiles that fade as the AI narrows down, the questions it is weighing, a guess.
(function () {
  const T = window.AITwenty;
  const { QUESTIONS, ANIMALS, N } = T;
  const $ = (id) => document.getElementById(id);

  const S = {
    w: T.fresh(), asked: [], answers: [], q: null, mode: "smart", over: true, guesses: 0, ruledOut: new Set(),
    tally: { right: 0, wrong: 0 }, qTotal: 0, games: 0, started: false, sim: null,
  };

  // ---------- tiles ----------
  function buildTiles() {
    $("tiles").innerHTML = ANIMALS.map((a, i) => `<button class="an" data-i="${i}" title="${a.n}" aria-label="${a.n}"><span class="em">${a.e}</span><span class="nm">${a.n}</span><i class="pb"></i></button>`).join("");
  }
  function paintTiles() {
    const max = Math.max(...S.w);
    $("tiles").querySelectorAll(".an").forEach((el) => {
      const i = +el.dataset.i, p = S.w[i];
      el.style.opacity = S.started ? Math.max(0.12, Math.min(1, p / Math.max(max, 1e-9) * 1.0)) : 1;
      el.style.transform = S.started && p === max && max > 0.2 ? "scale(1.12)" : "";
      el.classList.toggle("out", S.started && p < 0.01 / N * 20 && p / max < 0.03);
      el.classList.toggle("lead", S.started && p === max && max > 0.2);
      el.querySelector(".pb").style.width = S.started ? Math.round(p * 100) + "%" : "0%";
    });
    const alive = S.w.filter((p) => p > 0.02 / N * 5 && p / max > 0.05).length;
    $("st-left").textContent = S.started ? alive : N;
    $("st-bits").textContent = S.started ? T.entropy(S.w).toFixed(1) : T.entropy(T.fresh()).toFixed(1);
  }

  // ---------- thinking panel ----------
  function renderThink() {
    const host = $("think");
    if (!S.started || S.over) { host.innerHTML = `<span class="muted">When I ask a question, I'll show the other questions I was weighing and why I picked this one.</span>`; return; }
    const sc = T.score(S.w, S.asked).slice(0, 5);
    if (S.mode === "random") {
      host.innerHTML = `<p class="muted" style="margin:0">Random mode: I just pick <b>any</b> question that isn't pointless. No thinking about which one helps most!</p>` + sc.slice(0, 4).map(row).join("");
    } else host.innerHTML = sc.map(row).join("") + `<div class="muted" style="font-size:.8rem;margin-top:4px">A bar half green, half grey = the answer splits the animals evenly = the most I can learn.</div>`;
    function row(s) {
      const chosen = s.q === S.q;
      return `<div class="qrow ${chosen ? "chosen" : ""}"><span class="qt">${QUESTIONS[s.q].q}</span><span class="split"><i style="width:${Math.round(s.pYes * 100)}%"></i></span><span class="bits">${s.bits.toFixed(2)} bit${s.bits === 1 ? "" : "s"}</span></div>`;
    }
  }
  function renderInside(msg) { $("inside").innerHTML = msg; }

  // ---------- game flow ----------
  function setBubble(html) { ML.say(html); }
  function startGame() {
    S.w = T.fresh(); S.asked = []; S.answers = []; S.q = null; S.over = false; S.guesses = 0; S.started = true; S.ruledOut = new Set();
    $("controls").classList.remove("hidden"); $("guessbox").classList.add("hidden"); $("revealbox").classList.add("hidden");
    $("start").innerHTML = `${ML.icon("reset")} New game`;
    setBubble(`Think of one of these animals and <b>don't tell me</b>. I'll ask yes/no questions. Press an answer button each time.`);
    next();
  }

  function next() {
    const t = T.top(S.w);
    const p = S.w[t];
    if (p >= 0.8 || S.asked.length >= 20) return guess();
    const q = T.pick(S.w, S.asked, S.mode);
    if (q === null) return guess();
    S.q = q;
    $("qno").textContent = `Question ${S.asked.length + 1}`;
    $("qtext").textContent = QUESTIONS[q].q;
    paintTiles(); renderThink();
    const sc = T.score(S.w, S.asked).find((s) => s.q === q);
    renderInside(`<div>${ML.icon("eye")} I'm still unsure between <b>${S.w.filter((v) => v > 0.02).length}</b> animals.</div><div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("ruler")} ${S.mode === "smart" ? `I tried every question. <b>${QUESTIONS[q].q}</b> would say yes for about <b>${Math.round(sc.pYes * 100)}%</b> of what's left, the closest to an even split.` : `I picked a question at random.`}</div><div class="arrow">${ML.icon("arrow-down")}</div>
      <div>${ML.icon("trophy")} If you say yes I rule out about <b>${Math.round((1 - sc.pYes) * 100)}%</b>; if you say no, about <b>${Math.round(sc.pYes * 100)}%</b>.</div>`);
  }

  function answer(ans) {
    if (S.over || S.q === null) return;
    S.asked.push(S.q); S.answers.push(ans);
    S.w = T.update(S.w, S.q, ans);
    S.q = null;
    const t = T.top(S.w);
    setBubble(ans ? "Yes! That helps." : "No. Good to know.");
    next();
    if (!S.over && S.w.filter((v) => v > 0.02).length <= 3 && S.w[t] < 0.8) setBubble(`Only a few animals left. Let me find a question that tells them apart.`);
  }

  function guess() {
    const t = T.top(S.w);
    S.q = null;
    $("controls").classList.add("hidden");
    $("guessbox").classList.remove("hidden");
    $("gguess").innerHTML = `Is it a <b>${ANIMALS[t].e} ${ANIMALS[t].n}</b>?`;
    S.guessIdx = t;
    $("qno").textContent = "My guess"; $("qtext").textContent = `${ANIMALS[t].e} ${ANIMALS[t].n}?`;
    paintTiles(); renderThink();
    const p = Math.round(S.w[t] * 100);
    setBubble(`I think it's a <b>${ANIMALS[t].n}</b>! I'm about <b>${p}%</b> sure, after <b>${S.asked.length}</b> question${S.asked.length === 1 ? "" : "s"}.`);
    renderInside(`<div>${ML.icon("eye")} After your answers, the <b>${ANIMALS[t].n}</b> fits best.</div><div class="arrow">${ML.icon("arrow-down")}</div><div>${ML.icon("trophy")} Its share of my belief is <b>${p}%</b>. That's enough to make a guess.</div>`);
  }

  function guessAnswer(ok) {
    const t = S.guessIdx;
    $("guessbox").classList.add("hidden");
    if (ok) {
      S.over = true; S.tally.right++; $("st-right").textContent = S.tally.right;
      S.games++; S.qTotal += S.asked.length; $("st-avg").textContent = (S.qTotal / S.games).toFixed(1);
      ML.confetti(50);
      setBubble(`Got it in <b>${S.asked.length}</b> question${S.asked.length === 1 ? "" : "s"}! I never saw your animal, I only used your answers.`);
      renderInside(`<div>${ML.icon("check")} Every answer cut down the animals I was still unsure about. Each good question gave me about <b>1 bit</b> of information, like one coin flip's worth.</div>`);
      $("qno").textContent = "Got it!"; $("qtext").textContent = `${ANIMALS[t].e} ${ANIMALS[t].n}`;
      paintTiles();
      return;
    }
    // wrong: rule it out and keep going, up to 3 guesses
    S.guesses++;
    S.w[t] = 0;
    const sum = S.w.reduce((a, v) => a + v, 0) || 1;
    S.w = S.w.map((v) => v / sum);
    if (S.guesses >= 3) return reveal();
    setBubble(`Oops, not a ${ANIMALS[t].n}. Let me think again…`);
    $("controls").classList.remove("hidden");
    next();
  }

  // The AI gives up: ask what it was, then show which answers disagreed with that animal's traits.
  function reveal() {
    S.over = true; S.tally.wrong++; $("st-wrong").textContent = S.tally.wrong;
    S.games++; S.qTotal += S.asked.length; $("st-avg").textContent = (S.qTotal / S.games).toFixed(1);
    $("controls").classList.add("hidden");
    $("revealbox").classList.remove("hidden");
    $("pickwho").innerHTML = ANIMALS.map((a, i) => `<button class="btn small" data-i="${i}">${a.e} ${a.n}</button>`).join("");
    $("qno").textContent = "I give up!"; $("qtext").textContent = "What were you thinking of?";
    setBubble(`You win! What was your animal? Tap it, and I'll check which of my questions went wrong.`);
    $("pickwho").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const a = +b.dataset.i;
      const bad = S.asked.map((q, k) => ({ q, said: S.answers[k], truth: T.M[a][q] })).filter((x) => x.said !== x.truth);
      $("revealbox").classList.add("hidden");
      $("qtext").textContent = `${ANIMALS[a].e} ${ANIMALS[a].n}`;
      if (bad.length) {
        setBubble(`Aha! For a <b>${ANIMALS[a].n}</b>, my table says: ${bad.map((x) => `"${QUESTIONS[x.q].q}" is <b>${x.truth ? "yes" : "no"}</b> (you said ${x.said ? "yes" : "no"})`).join("; ")}. Either you answered differently from my table, or my table is wrong. Animals are tricky!`);
      } else setBubble(`Your answers all fit a <b>${ANIMALS[a].n}</b>. So I must have been unlucky with my guesses. A few animals look very alike on my list of questions.`);
    }));
  }

  // ---------- controls ----------
  $("start").addEventListener("click", startGame);
  $("yes").addEventListener("click", () => answer(true));
  $("no").addEventListener("click", () => answer(false));
  $("gy").addEventListener("click", () => guessAnswer(true));
  $("gn").addEventListener("click", () => guessAnswer(false));
  document.addEventListener("keydown", (e) => {
    if (S.over || S.q === null || e.target.tagName === "INPUT") return;
    if (e.key === "y" || e.key === "Y") answer(true);
    if (e.key === "n" || e.key === "N") answer(false);
  });
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x === b));
    S.mode = b.dataset.m;
    ML.say(S.mode === "smart" ? "Smart mode: I pick the question that splits the animals most evenly." : "Random mode: I'll ask any old question. Watch how many more I need!");
    if (!S.over && S.started) { S.q = null; next(); }
    renderThink();
  }));

  // Run every animal through the game and compare the two ways of choosing questions.
  $("sim").addEventListener("click", () => {
    const a = T.simulate("smart");
    let avg = 0, acc = 0; const R = 20;
    for (let i = 0; i < R; i++) { const r = T.simulate("random"); avg += r.avg; acc += r.acc; }
    avg /= R; acc /= R;
    $("simout").innerHTML = `<div class="stats"><div class="stat"><div class="k">Smart</div><div class="v">${a.avg.toFixed(1)}<small> questions</small></div></div><div class="stat"><div class="k">Random</div><div class="v">${avg.toFixed(1)}<small> questions</small></div></div></div>
      <p class="muted" style="margin:6px 0 0;font-size:.85rem">Played all ${N} animals. Smart picks needed <b>${Math.round((1 - a.avg / avg) * 100)}% fewer</b> questions. Perfect halving would need about ${Math.log2(N).toFixed(1)} (that's log<sub>2</sub> of ${N}).</p>`;
    ML.say(`I played all <b>${N}</b> animals. Choosing questions cleverly took <b>${a.avg.toFixed(1)}</b> on average. Random questions took <b>${avg.toFixed(1)}</b>. That's the power of asking the right question!`);
  });

  buildTiles(); paintTiles(); renderThink();
})();
