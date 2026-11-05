// Hot or Cold Words page. Logic lives in lang-temp-core.js (TempCore); the stories come from lang-corpus.js.
(function () {
  const C = window.TempCore, $ = (id) => document.getElementById(id);
  const model = C.buildModel(window.LANG_CORPUS.allText());
  const STARTS = ["once upon a", "the little", "the owl", "robo put", "pip ran to", "the bear"];
  const ROWS = 12, BW = 640, BH = 30 + (ROWS + 1) * 22, GW = 300, GH = 168;
  const bc = ML.setupCanvas($("bars"), BW, BH).ctx, gc = ML.setupCanvas($("gauge"), GW, GH).ctx;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = { prompt: STARTS[0], words: [], picks: [], T: 1, useK: false, k: 5, useP: false, p: 0.6, r: C.rng(1 + Math.floor(Math.random() * 1e6)), lastPick: null, shown: null, hits: {}, writing: false, ready: false, idle: 0, acted: 0 };
  const opts = () => ({ T: S.T, topK: S.useK ? S.k : 0, topP: S.useP ? S.p : 0 });
  const ctx = () => C.tokenize(S.prompt).concat(S.words);
  const pct = (v) => (v >= 0.995 ? "100%" : v < 0.005 && v > 0 ? "<1%" : Math.round(v * 100) + "%");

  // ---------- starting words ----------
  $("starts").innerHTML = STARTS.map((s) => `<button class="btn ghost small" data-s="${s}" aria-pressed="${s === S.prompt}">${s}…</button>`).join("");
  function paintStarts() { document.querySelectorAll("#starts button").forEach((b) => { const on = b.dataset.s === S.prompt; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); }

  // ---------- the story ----------
  // Tokens -> readable HTML: no space before punctuation, capitals after a full stop.
  // The prompt is muted; cls(token, previousToken, index) gives a class for each generated token.
  function toHtml(pr, gen, cls) {
    const all = pr.concat(gen); let html = "", cap = true;
    all.forEach((w, i) => {
      const punct = /^[.,!?]$/.test(w), t = punct ? w : w === "i" ? "I" : cap ? w[0].toUpperCase() + w.slice(1) : w;
      if (punct) { if (w !== ",") cap = true; } else cap = false;
      const gi = i - pr.length, sp = i && !punct ? " " : "";
      if (gi < 0) html += sp + `<span class="pr">${t}</span>`;
      else { const c = cls(w, all[i - 1], gi); html += sp + (c ? `<span class="${c}">${t}</span>` : t); }
    });
    return html;
  }
  function renderStory() {
    const html = toHtml(C.tokenize(S.prompt), S.words, (w, prev, gi) => {
      const pk = S.picks[gi], heat = pk.chance >= 0.35 ? "cold" : pk.chance < 0.08 ? "hot" : "";
      return `w ${heat} ${gi === S.words.length - 1 ? "now" : ""}" title="picked with a ${pct(pk.chance)} chance (bar number ${pk.rank})`;
    });
    $("story").innerHTML = html + '<span class="caret" aria-hidden="true"></span>';
  }

  // ---------- bar chart ----------
  // `shown` = the distribution whose bars are on screen; `anim` eases bar lengths towards it.
  let anim = null, animRaf = 0;
  function computeShown() {
    const c = ctx(), base1 = C.baseDist(model, c), d = C.nextDist(model, c, opts());
    const top = d.slice(0, ROWS).map((x, i) => ({ word: x.word, final: x.final, keep: x.keep, base: base1[i].p }));
    const rest = d.slice(ROWS);
    top.push({ word: `${rest.length} other words`, final: rest.reduce((s, x) => s + x.final, 0), keep: rest.some((x) => x.keep), base: base1.slice(ROWS).reduce((s, x) => s + x.p, 0), other: true });
    return { rows: top, d };
  }
  function drawBars() {
    const c = bc, rows = S.shown.rows, L = 118, R = 54, T = 8, rh = 22;
    c.clearRect(0, 0, BW, BH);
    const muted = ML.cssVar("--muted"), ink = ML.cssVar("--ink"), acc = ML.cssVar("--accent"), line = ML.cssVar("--line"), good = ML.cssVar("--good");
    const mx = Math.max(0.05, ...rows.map((r) => Math.max(r.final, r.base))), X = (v) => L + (v / mx) * (BW - L - R);
    c.font = "800 13px Nunito, sans-serif"; c.textBaseline = "middle";
    rows.forEach((r, i) => {
      const y = T + i * rh, v = anim ? anim[i] : r.final, picked = S.lastPick && !r.other && S.lastPick === r.word;
      c.textAlign = "right"; c.fillStyle = r.keep ? ink : muted; c.font = (r.other ? "700 italic 12px" : "800 13px") + " Nunito, sans-serif";
      c.fillText(r.word, L - 8, y + rh / 2);
      c.fillStyle = picked ? good : r.keep ? acc : line;
      const w = Math.max(r.keep && v > 0 ? 2 : 0, X(v) - L); c.beginPath(); c.roundRect ? c.roundRect(L, y + 3, w, rh - 6, 5) : c.rect(L, y + 3, w, rh - 6); c.fill();
      if (!r.keep) { c.fillStyle = muted; c.fillRect(L, y + rh / 2 - 1, Math.max(8, X(r.base) - L), 2); }
      if (!r.keep || Math.abs(r.base - v) > 0.004) { c.strokeStyle = muted; c.setLineDash([4, 3]); c.lineWidth = 1.5; c.strokeRect(L, y + 3, Math.max(1, X(r.base) - L), rh - 6); c.setLineDash([]); }
      c.textAlign = "left"; c.fillStyle = r.keep ? ink : muted; c.font = "700 12px Nunito, sans-serif";
      c.fillText(r.keep ? pct(r.final) : "out", Math.min(BW - R + 4, Math.max(X(v), X(r.base)) + 6), y + rh / 2);
    });
    c.textBaseline = "alphabetic";
  }
  function setShown(next) {
    const from = S.shown ? S.shown.rows.map((r, i) => (anim ? anim[i] : r.final)) : null;
    S.shown = next;
    if (reduce || !from || S.writing) { anim = null; drawBars(); return; }
    const to = next.rows.map((r) => r.final), t0 = performance.now();
    cancelAnimationFrame(animRaf);
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 260), e = 1 - Math.pow(1 - k, 3);
      anim = to.map((v, i) => from[i] + (v - from[i]) * e); drawBars();
      if (k < 1) animRaf = requestAnimationFrame(tick); else { anim = null; drawBars(); }
    };
    animRaf = requestAnimationFrame(tick);
  }
  function drawGauge() {
    const c = gc, cx = GW / 2, cy = GH - 40, R = 108;
    c.clearRect(0, 0, GW, GH);
    const cold = ML.cssVar("--sup"), hot = ML.cssVar("--bad"), mid = ML.cssVar("--good"), ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted");
    const g = c.createLinearGradient(cx - R, 0, cx + R, 0); g.addColorStop(0, cold); g.addColorStop(0.33, mid); g.addColorStop(1, hot);
    c.lineWidth = 18; c.lineCap = "round"; c.strokeStyle = g; c.beginPath(); c.arc(cx, cy, R, Math.PI, 2 * Math.PI); c.stroke();
    const a = Math.PI + (S.T / 3) * Math.PI;
    c.strokeStyle = ink; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); c.stroke();
    c.fillStyle = ink; c.beginPath(); c.arc(cx, cy, 7, 0, 7); c.fill();
    c.font = "800 12px Nunito, sans-serif"; c.fillStyle = muted; c.textAlign = "left"; c.fillText("cold", 22, cy + 18); c.textAlign = "right"; c.fillText("hot", GW - 22, cy + 18);
    c.textAlign = "center"; c.fillStyle = ink; c.font = "700 15px Fredoka, Nunito, sans-serif";
    c.fillText(S.T <= 0.01 ? "always the top word" : S.T < 0.7 ? "careful" : S.T <= 1.3 ? "normal" : S.T < 2 ? "adventurous" : "silly!", cx, GH - 6);
  }
  function stats() {
    const d = S.shown.d, kept = d.filter((x) => x.keep).length, top = d.reduce((m, x) => Math.max(m, x.final), 0);
    $("inhat").textContent = kept; $("topc").textContent = pct(top); $("spread").textContent = C.entropy(d).toFixed(1);
    const c = ctx().slice(-2).join(" ");
    $("ctxlbl").textContent = `after "${c}"`;
  }
  function refresh() { if (!S.lastPick) setShown(computeShown()); else drawBars(); drawGauge(); stats(); renderStory(); }

  // ---------- picking ----------
  function pickOne() {
    if (S.words.length >= 40) { ML.say("That is a long story! Press <b>Start over</b> or pick new starting words."); return false; }
    const before = computeShown(), pick = C.sample(before.d, S.r), rank = before.d.indexOf(pick) + 1;
    S.words.push(pick.word); S.picks.push({ chance: pick.final, rank }); S.lastPick = pick.word;
    setShown(before); stats();
    $("pickline").innerHTML = `Picked <b>"${pick.word}"</b>: it had a <b>${pct(pick.final)}</b> chance and was bar number ${rank}. Press again to roll for the word after it.`;
    renderStory(); poke();
    return { pick, rank };
  }
  // after a pick, the next roll shows the new context's bars
  function advance() { S.lastPick = null; setShown(computeShown()); stats(); }
  $("next").addEventListener("click", () => {
    if (S.writing) return;
    if (S.lastPick) advance();
    const res = pickOne(); if (!res) return;
    const { pick, rank } = res;
    if (S.T <= 0.01) ML.say(`Ice cold: I <b>always</b> take the biggest bar, so I picked "${pick.word}". Try it again from the start: same story every time.`);
    else if (rank === 1) ML.say(`I picked "<b>${pick.word}</b>", the favourite. Big bars usually win, but not always!`);
    else if (pick.final < 0.08) ML.say(`Ooh, a surprise! "<b>${pick.word}</b>" only had a ${pct(pick.final)} chance. Hot temperatures make surprises more likely.`);
    else ML.say(`I picked "<b>${pick.word}</b>" (bar number ${rank}). Not the top word, but a good one. That is the dice at work.`);
  });
  $("write").addEventListener("click", () => {
    if (S.writing) { S.writing = false; return; }
    S.writing = true; $("write").innerHTML = ML.icon("pause") + " Stop"; let n = 0;
    const go = () => {
      if (!S.writing || n >= 12) { S.writing = false; $("write").innerHTML = ML.icon("play") + " Write 12 words"; drawBars(); return; }
      if (S.lastPick) advance();
      if (!pickOne()) { S.writing = false; $("write").innerHTML = ML.icon("play") + " Write 12 words"; return; }
      n++; setTimeout(go, reduce ? 150 : 480);
    };
    go();
    ML.say(S.T > 1.8 ? "Hot, hot, hot! Watch the little bars sneak in." : S.T < 0.3 ? "Cold and careful: I will always take the top word." : "Writing word by word. Each green bar is the word I just picked.");
  });
  function clearStory() { S.writing = false; S.words = []; S.picks = []; S.lastPick = null; $("pickline").textContent = ""; refresh(); }
  $("clear").addEventListener("click", () => { clearStory(); ML.say("A blank page. Same starting words, new dice rolls."); poke(); });
  $("starts").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-s]"); if (!b) return;
    S.prompt = b.dataset.s; paintStarts(); clearStory(); poke();
    ML.say(`New start: "<b>${S.prompt}</b>". Look how the bars change: different words, different chances.`);
  });

  // ---------- repeat 5 times ----------
  $("rep").addEventListener("click", () => {
    const o = opts(), res = C.repeat(model, S.prompt, 12, 5, o, S.r);
    const pr = C.tokenize(S.prompt);
    $("reps").innerHTML = res.runs.map((w) => `<li>${toHtml(pr, w, (tok, prev, gi) => {
      const odd = !/^[.,!?]$/.test(tok) && !(model.bi[prev] && model.bi[prev][tok]);
      return odd ? "odd" : "";
    })}</li>`).join("");
    const dv = Math.round(res.distinct2 * 100), sv = Math.round(res.sense * 100);
    $("divv").textContent = `${res.distinctRuns} of 5 different · ${dv}%`; $("senv").textContent = sv + "%";
    $("divm").firstElementChild.style.width = dv + "%"; $("senm").firstElementChild.style.width = sv + "%";
    $("divm").setAttribute("aria-valuenow", dv); $("senm").setAttribute("aria-valuenow", sv);
    if (res.distinctRuns === 1) ML.say("All five stories are <b>exactly the same</b>. Cold and safe, but boring. Turn the dial up!");
    else if (res.sense < 0.7 && (S.useK || S.useP)) ML.say(`Only <b>${sv}%</b> makes sense, even with words thrown out. Make the hat smaller: a lower <b>top-p</b> or a smaller <b>top-k</b>.`);
    else if (res.sense < 0.6) ML.say(`Five different stories, but only <b>${sv}%</b> makes sense. Too hot! Try switching on <b>top-p</b>.`);
    else ML.say(`<b>${res.distinctRuns}</b> different stories and <b>${sv}%</b> makes sense. That is the sweet spot between boring and silly.`);
    checkRep(res); poke();
  });
  const TRY = {
    cold: "Try this: set the dial to <b>Hot 2.5</b> and Repeat 5 times again.",
    hot: "Try this: keep it hot, but switch on <b>top-p</b> at 60%, then Repeat.",
    tame: "Try this: switch top-p on and off at temperature 1 and watch how many words stay in the hat.",
  };
  function hit(k, msg) {
    if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg);
    ML.say(`<b>Challenge done!</b> ${msg} ${Object.keys(S.hits).length === 3 ? "You finished every challenge!" : TRY[k]}`);
    if (Object.keys(S.hits).length === 3) ML.confetti(40);
  }
  function checkRep(res) {
    if (S.T <= 0.1 && res.distinctRuns === 1) hit("cold", "Cold means the same choice every time.");
    if (S.T >= 2 && !S.useK && !S.useP && res.distinctRuns === 5 && res.sense < 0.6) hit("hot", "Very hot: every story is different, and most of it is nonsense.");
    if (S.T >= 2 && ((S.useP && S.p <= 0.6 + 1e-9) || (S.useK && S.k <= 5)) && res.distinctRuns >= 4 && res.sense >= 0.7) hit("tame", "Throwing the tiny words out kept the stories varied and sensible.");
  }

  // ---------- controls ----------
  function onSetting() { if (!S.ready) return; S.lastPick = null; refresh(); poke(); }
  ML.bindRange("#temp", (v) => v.toFixed(1), (v) => {
    S.T = v; if (!S.ready) return; onSetting();
    ML.say(v <= 0.01 ? "Temperature 0: the biggest bar gets <b>100%</b>. No dice at all." : v < 0.7 ? "Cold: big bars grow, small bars shrink. Safe choices." : v <= 1.3 ? "Around 1: these are the chances I really learned from the stories." : "Hot: the bars get flatter, so even weird words get a real chance.");
  });
  ML.bindRange("#k", (v) => String(v), (v) => { S.k = v; onSetting(); });
  ML.bindRange("#p", (v) => Math.round(v * 100) + "%", (v) => { S.p = v; onSetting(); });
  $("useK").addEventListener("change", (e) => {
    S.useK = e.target.checked; $("k").disabled = !S.useK; $("kf").classList.toggle("off", !S.useK); onSetting();
    ML.say(S.useK ? `Top-k on: only the <b>${S.k}</b> biggest bars stay in the hat. The rest turn grey.` : "Top-k off: every word is back in the hat.");
  });
  $("useP").addEventListener("change", (e) => {
    S.useP = e.target.checked; $("p").disabled = !S.useP; $("pf").classList.toggle("off", !S.useP); onSetting();
    ML.say(S.useP ? `Top-p on: I keep adding the biggest bars until they fill <b>${Math.round(S.p * 100)}%</b>. Try different starts: sometimes 1 word is enough, sometimes many.` : "Top-p off: every word is back in the hat.");
  });
  document.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => { const el = $("temp"); el.value = b.dataset.t; el.dispatchEvent(new Event("input")); }));

  // ---------- nudges when stuck ----------
  function poke() { S.idle = 0; S.acted++; }
  const NUDGES = [
    "Psst! Press <b>Pick next word</b> to roll my word dice.",
    "Try the <b>Ice cold 0</b> button, then press <b>Repeat 5 times</b>.",
    "Turn the dial to <b>Hot 2.5</b> and watch the dashed and filled bars: the tall ones shrink, the tiny ones grow.",
    "Switch on <b>top-p</b>. Grey bars are thrown out of the hat and can never be picked.",
  ];
  setInterval(() => { if (document.hidden || S.writing) return; S.idle++; if (S.idle === 15) { const n = Object.keys(S.hits).length; ML.say(NUDGES[S.acted === 0 ? 0 : 1 + (n % 3)]); } }, 1000);

  const redraw = () => setTimeout(() => { drawBars(); drawGauge(); }, 0);
  document.addEventListener("themechange", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("load", redraw);
  S.ready = true; paintStarts(); refresh();
})();
