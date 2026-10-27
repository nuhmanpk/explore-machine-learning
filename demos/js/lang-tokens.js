// Word Chopper: a real byte-pair-encoding tokenizer trained live on the story corpus,
// a count-based word embedding map (PPMI + live t-SNE), and an optional real GPT-2 tokenizer.
(function () {
  const { $, $$ } = ML;
  const core = window.TokensCore;
  const CORPUS = LANG_CORPUS.allText();
  const { BASE, baseId } = core;

  // ================= Tokenizers =================
  const { BPE, VOCAB_ID, WORD_ID, bpeWord, pieceId, encBPE, encWords, encLetters } = core.tokenizers(CORPUS);

  // ================= State =================
  const S = { mode: "bpe", M: 0, playing: null, gpt: null, gptLoading: false, lastFresh: null };
  const txt = $("#txt");

  // ================= Chips =================
  const hue = (id) => (typeof id === "number" && id >= 0 ? (id * 47) % 360 : 0);
  function showPiece(t) {
    const esc = t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    if (t === " ") return `<span class="sp">␣</span>`;
    if (t === "\n") return `<span class="sp">⏎</span>`;
    return esc.replace(/^ /, '<span class="sp">·</span>').replace(/\n/g, '<span class="sp">⏎</span>');
  }
  function chipHTML(p, i, animate) {
    const delay = animate ? `animation-delay:${Math.min(i * 18, 600)}ms` : "animation:none";
    return `<span class="tok ${p.unk ? "unk" : ""}" style="--h:${hue(p.id)};${delay}" title="piece #${p.id}"><span class="tt">${showPiece(p.t)}</span><span class="ti">${p.unk ? "?" : "#" + p.id}</span></span>`;
  }

  function encode(mode, text) {
    if (mode === "letters") return encLetters(text);
    if (mode === "words") return encWords(text);
    if (mode === "bpe") return encBPE(text, S.M);
    if (mode === "gpt2" && S.gpt) {
      const ids = S.gpt.encode(text);
      return ids.map((id) => ({ t: S.gpt.decode([id]), id }));
    }
    return null;
  }

  let lastKey = "";
  function render(animate) {
    const text = txt.value;
    const pieces = encode(S.mode, text);
    const host = $("#chips");
    if (!pieces) {
      host.innerHTML = S.gptLoading ? `<div style="width:100%"><div class="progress" id="gpt-prog" style="height:14px;border-radius:999px;background:var(--card);border:2px solid var(--line);overflow:hidden"><i style="display:block;height:100%;width:0;background:var(--sup);transition:width .2s"></i></div><p class="muted" id="gpt-prog-t" style="margin:6px 0 0">Fetching GPT-2's chunk book…</p></div>`
        : `<p class="muted" style="margin:0">Press “Real GPT-2” to download GPT-2's real chunk book (about 2 MB).</p>`;
    } else {
      const key = S.mode + "|" + text + "|" + S.M;
      host.innerHTML = pieces.map((p, i) => chipHTML(p, i, animate && key !== lastKey)).join("");
      lastKey = key;
    }
    $("#tok-count").textContent = pieces ? `${pieces.length} piece${pieces.length === 1 ? "" : "s"}` : "…";
    renderNote(pieces);
    renderCompare();
    const bp = encBPE(text, S.M);
    $("#s-pieces").textContent = pieces ? pieces.length : "–";
    $("#s-avg").textContent = pieces && pieces.length ? (text.length / pieces.length).toFixed(1) : "–";
    $("#s-vocab").textContent = S.mode === "bpe" ? BASE.length + S.M : S.mode === "letters" ? BASE.length : S.mode === "words" ? WORD_ID.size + 1 : "50,257";
    return bp;
  }
  function renderNote(pieces) {
    const n = $("#note");
    if (!pieces) { n.textContent = ""; return; }
    if (S.mode === "letters") n.innerHTML = "Every letter and space is its own piece. That's <b>lots</b> of pieces, so long stories get super long.";
    else if (S.mode === "words") {
      const unk = pieces.filter((p) => p.unk).map((p) => p.t);
      n.innerHTML = unk.length
        ? `Robo never saw <b>${[...new Set(unk)].slice(0, 3).join(", ")}</b>, so it becomes <b>[?]</b>. Whole words can't handle new words!`
        : "Few pieces! But try a word Robo never read, like <b>flibberjab</b>…";
    } else if (S.mode === "bpe") n.innerHTML = S.M === 0
      ? "Robo hasn't glued anything yet, so it's just letters. Press <b>Glue next</b> or drag the slider!"
      : `With <b>${S.M}</b> glued chunks, common bits stay whole and rare words get split into pieces Robo knows. No [?] ever!`;
    else n.innerHTML = "This is how the real GPT-2 chops it. It glued <b>50,000</b> chunks after reading millions of web pages.";
  }
  function renderCompare() {
    const text = txt.value;
    const rows = [
      ["letters", "Letters", encLetters(text).length],
      ["words", "Whole words", encWords(text).length],
      ["bpe", "Robo's chunks", encBPE(text, S.M).length],
      ["gpt2", "Real GPT-2", S.gpt ? S.gpt.encode(text).length : null],
    ];
    const max = Math.max(1, ...rows.map((r) => r[2] || 0));
    const colors = { letters: "--rl", words: "--sup", bpe: "--lang", gpt2: "--nn" };
    $("#cmp").innerHTML = rows.map(([m, name, n]) =>
      `<div class="cmp-row ${m === S.mode ? "on" : ""}" data-m="${m}"><span>${name}</span><span class="track"><i class="fill" style="width:${n == null ? 0 : (n / max) * 100}%;background:${ML.cssVar(colors[m])}"></i></span><span class="n">${n == null ? "tap" : n}</span></div>`).join("");
  }

  function setMode(m) {
    S.mode = m;
    $$("#mode-seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    if (m === "gpt2" && !S.gpt) loadGPT();
    render(true);
    const say = {
      letters: "Letter mode: every letter gets a number. Simple, but sooo many pieces!",
      words: "Whole-word mode: each word I read gets a number. But a word I never read? Uh-oh: <b>[?]</b>.",
      bpe: "Chunk mode! I use the pieces I glued together myself. Common words stay whole, weird words get split.",
      gpt2: S.gpt ? "This is the real GPT-2 chopper. See how its pieces compare to mine?" : "Fetching the real GPT-2 chunk book… ⏳",
    };
    ML.say(say[m]);
  }

  async function loadGPT() {
    if (S.gptLoading) return;
    S.gptLoading = true;
    render(false);
    try {
      S.gpt = await LangAI.tokenizer("Xenova/gpt2", (frac, bytes) => {
        const bar = $("#gpt-prog i"), t = $("#gpt-prog-t");
        if (bar && frac != null) bar.style.width = (frac * 100).toFixed(0) + "%";
        if (t) t.textContent = `Fetching GPT-2's chunk book… ${(bytes / 1e6).toFixed(1)} MB`;
      });
      S.gptLoading = false;
      render(true);
      if (S.mode === "gpt2") ML.say("Got it! This is exactly how the real GPT-2 chops your words. Compare the numbers with mine!");
    } catch (e) {
      console.warn(e);
      S.gptLoading = false;
      ML.toast("Couldn't download GPT-2's chunk book. Check your internet?");
      ML.say("Oops, I couldn't fetch the real GPT-2 chopper (no internet?). My own chunks still work! 👍");
      if (S.mode === "gpt2") setMode("bpe");
      else render(false);
    }
  }

  // ================= Merge stepping (the learning process) =================
  const SAMPLES = [" the", " puppy", " jumped", " rainbow", " yummy", " sleepy", " princess", " flibberjab"];
  const CKPTS = [0, 10, 40, 120, BPE.merges.length];
  function vis(t) { return t.replace(/ /g, "␣").replace(/\n/g, "⏎"); }

  function renderMerge(animate) {
    const box = $("#merge-now");
    $("#step-chip").textContent = `Step ${S.M} of ${BPE.merges.length}`;
    if (S.M === 0) {
      box.classList.remove("go");
      box.innerHTML = `<span style="font-size:1rem;color:var(--ink-2)">Just letters so far: a, b, c, …, ␣ (space). Press <b>Glue next</b>!</span>`;
    } else {
      const m = BPE.merges[S.M - 1];
      box.classList.remove("go");
      box.innerHTML = `<span class="mt a">${vis(m.a)}</span><span>+</span><span class="mt b">${vis(m.b)}</span><span>→</span><span class="mt ab">${vis(m.ab)}</span><small>seen side by side <b>${m.count}</b> times in Robo's stories → new piece #${VOCAB_ID.get(m.ab)}</small>`;
      if (animate) { void box.offsetWidth; box.classList.add("go"); }
    }
    // samples
    const fresh = S.M > 0 ? BPE.merges[S.M - 1].ab : null;
    $("#samples").innerHTML = SAMPLES.map((w) =>
      `<div class="sample">${bpeWord(w, S.M).map((p) => {
        const id = pieceId(p);
        return `<span class="tok ${animate && p === fresh ? "fresh" : ""}" style="--h:${hue(id)};animation-delay:0ms;${animate && p === fresh ? "" : "animation:none"}"><span class="tt">${showPiece(p)}</span><span class="ti">#${id}</span></span>`;
      }).join("")}</div>`).join("");
    // chunk book
    const from = Math.max(0, S.M - 60);
    $("#merge-list").innerHTML = S.M === 0 ? `<span class="muted">Empty for now.</span>` :
      BPE.merges.slice(from, S.M).map((m, i) => `<span class="mchip ${from + i === S.M - 1 ? "new" : ""}">${vis(m.a)} + ${vis(m.b)} → ${vis(m.ab)}</span>`).reverse().join("");
    renderCkpts();
  }
  function renderCkpts() {
    const text = txt.value;
    $("#ckpts").innerHTML = CKPTS.map((c) => {
      const n = encBPE(text, c).length;
      return `<button class="ckpt ${c === S.M ? "on" : ""}" data-m="${c}"><b>Step ${c}</b><span class="cp-n">${n} pieces</span>${c === 0 ? "letters only" : c === BPE.merges.length ? "all chunks" : `${c} chunks glued`}</button>`;
    }).join("");
  }
  function setM(m, animate, talk) {
    S.M = ML.clamp(m, 0, BPE.merges.length);
    $("#merges").value = S.M;
    $("[data-for=merges]").textContent = S.M;
    renderMerge(animate);
    render(animate && S.mode === "bpe");
    if (talk && S.M > 0) {
      const mm = BPE.merges[S.M - 1];
      ML.say(`I noticed <b>“${vis(mm.a)}” + “${vis(mm.b)}”</b> side by side <b>${mm.count} times</b>. Glue! Now <b>“${vis(mm.ab)}”</b> is one piece.`);
    }
  }
  function stopPlay() {
    clearInterval(S.playing); S.playing = null;
    $("#play").innerHTML = `${ML.icon("play")} Play`;
  }

  // ================= Word map: PPMI vectors + live t-SNE =================
  const GROUPS = LANG_CORPUS.GROUPS;
  const GROUP_COLOR = { animals: "--rl", colors: "--diff", food: "--vision", people: "--nn", places: "--sup", other: "--muted" };
  const groupOf = (w) => Object.keys(GROUPS).find((k) => GROUPS[k].includes(w)) || "other";
  const E = core.buildEmbeddings(CORPUS, GROUPS);
  const neighbors = (vec, k, exclude) => core.neighbors(E, vec, k, exclude);
  const tsneSetup = (seed) => core.tsneSetup(E, seed);
  const tsneStep = core.tsneStep;

  const mapCv = $("#map");
  const MV = ML.setupCanvas(mapCv, 820, 520);
  const MAP = { T: null, view: null, hover: -1, pinned: -1, analogy: null, maxIter: 900 };
  function startTSNE(seed) {
    MAP.T = tsneSetup(seed);
    MAP.view = null;
    MAP.analogy = null;
    $("#ana-out").innerHTML = "";
    if (!MAP.running) { MAP.running = true; requestAnimationFrame(mapTick); }
  }
  function mapTick() {
    const T = MAP.T;
    if (T.iter < MAP.maxIter) for (let k = 0; k < 5; k++) tsneStep(T);
    $("#map-status").textContent = T.iter < MAP.maxIter ? `Sorting words… step ${T.iter}` : `Sorted! (${T.iter} steps)`;
    if (T.iter >= MAP.maxIter && MAP.wasRunning) {
      MAP.wasRunning = false;
      if (MAP.announce) ML.say("Look! Animals, colours, food and people each found their own neighbourhood. Nobody told me the groups. I only counted which words hang out together!");
    }
    if (T.iter < MAP.maxIter) MAP.wasRunning = true;
    drawMap();
    requestAnimationFrame(mapTick);
  }
  function project() {
    const Y = MAP.T.Y;
    // Frame the middle 90% of words so a few loners don't squash everyone else.
    const xs = Y.map((p) => p[0]).sort((a, b) => a - b), ys = Y.map((p) => p[1]).sort((a, b) => a - b);
    const q = (arr, f) => arr[Math.round(f * (arr.length - 1))];
    const x0 = q(xs, 0.05), x1 = q(xs, 0.95), y0 = q(ys, 0.05), y1 = q(ys, 0.95);
    const tgt = { x0, x1, y0, y1 };
    if (!MAP.view) MAP.view = tgt;
    else for (const k in tgt) MAP.view[k] = ML.lerp(MAP.view[k], tgt[k], 0.15);
    const v = MAP.view, pad = 46;
    const s = Math.min((MV.w - 2 * pad) / (v.x1 - v.x0 || 1), (MV.h - 2 * pad) / (v.y1 - v.y0 || 1));
    const ox = (MV.w - s * (v.x1 - v.x0)) / 2, oy = (MV.h - s * (v.y1 - v.y0)) / 2;
    return Y.map(([x, y]) => [ML.clamp(ox + (x - v.x0) * s, 12, MV.w - 70), ML.clamp(oy + (y - v.y0) * s, 12, MV.h - 12)]);
  }
  function arrow(ctx, a, b, color, dashed) {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const ex = b[0] - ux * 10, ey = b[1] - uy * 10;
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 3;
    ctx.setLineDash(dashed ? [7, 6] : []);
    ctx.beginPath(); ctx.moveTo(a[0] + ux * 8, a[1] + uy * 8); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(ex + ux * 6, ey + uy * 6); ctx.lineTo(ex - ux * 8 - uy * 7, ey - uy * 8 + ux * 7); ctx.lineTo(ex - ux * 8 + uy * 7, ey - uy * 8 - ux * 7); ctx.closePath(); ctx.fill();
  }
  function drawMap() {
    const { ctx, w, h } = MV;
    ctx.clearRect(0, 0, w, h);
    const pts = project();
    MAP.pts = pts;
    const focus = MAP.hover >= 0 ? MAP.hover : MAP.pinned;
    const ink = ML.cssVar("--ink");
    let nbSet = new Set();
    if (focus >= 0) {
      const nb = neighbors(E.V[focus], 5, [E.words[focus]]);
      ctx.strokeStyle = ML.cssVar("--lang"); ctx.lineWidth = 2.5;
      nb.forEach(([wd]) => {
        const j = E.words.indexOf(wd); nbSet.add(j);
        ctx.beginPath(); ctx.moveTo(pts[focus][0], pts[focus][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
      });
    }
    if (MAP.analogy) {
      const A = MAP.analogy, ix = (wd) => E.words.indexOf(wd);
      arrow(ctx, pts[ix(A.b)], pts[ix(A.a)], ML.cssVar("--nn"), true);
      arrow(ctx, pts[ix(A.c)], pts[ix(A.res)], ML.cssVar("--nn"), false);
    }
    E.words.forEach((wd, i) => {
      const [x, y] = pts[i];
      const on = i === focus || nbSet.has(i) || (MAP.analogy && [MAP.analogy.a, MAP.analogy.b, MAP.analogy.c, MAP.analogy.res].includes(wd));
      const dim = (focus >= 0 || MAP.analogy) && !on;
      ctx.globalAlpha = dim ? 0.3 : 1;
      ctx.fillStyle = ML.cssVar(GROUP_COLOR[groupOf(wd)]);
      ctx.strokeStyle = ink; ctx.lineWidth = i === focus ? 3 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, i === focus ? 9 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = `${on ? 800 : 700} ${on ? 15 : 12.5}px Nunito, sans-serif`;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(wd, x + 10, y);
      ctx.globalAlpha = 1;
    });
  }
  function wordAt(e) {
    if (!MAP.pts) return -1;
    const p = ML.canvasPoint(mapCv, e, MV.w, MV.h);
    let best = -1, bd = 26;
    MAP.pts.forEach(([x, y], i) => { const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function explain(i) {
    if (i < 0) { $("#inside").innerHTML = "Point at a word on the map (or tap it)."; return; }
    const wd = E.words[i], v = E.V[i];
    const ctxTop = v.map((x, j) => [E.ctxWords[j], x]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => `<b>${c}</b>`).join(", ");
    const nb = neighbors(v, 5, [wd]);
    $("#inside").innerHTML = `
      <div>“<b>${wd}</b>” was often near: ${ctxTop}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>Robo turns that into a list of ${E.ctxWords.length} numbers.</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>Words with the most similar lists:</div>
      <div class="nb-list">${nb.map(([n, s]) => `<span class="chip">${n} <span style="font-family:var(--font-mono);color:var(--muted)">${Math.round(s * 100)}%</span></span>`).join("")}</div>`;
  }
  mapCv.addEventListener("pointermove", (e) => {
    const i = wordAt(e);
    if (i !== MAP.hover) { MAP.hover = i; explain(i >= 0 ? i : MAP.pinned); }
  });
  mapCv.addEventListener("pointerleave", () => { MAP.hover = -1; explain(MAP.pinned); });
  mapCv.addEventListener("click", (e) => {
    const i = wordAt(e);
    MAP.pinned = i;
    MAP.analogy = null; $("#ana-out").innerHTML = "";
    explain(i);
    if (i >= 0) {
      const nb = neighbors(E.V[i], 3, [E.words[i]]).map(([n]) => `<b>${n}</b>`).join(", ");
      ML.say(`“${E.words[i]}” hangs out with ${nb}. They get used in the same kinds of sentences, so their numbers look alike.`);
    }
  });

  const ANALOGIES = [["king", "man", "woman"], ["prince", "boy", "girl"], ["queen", "woman", "man"], ["princess", "girl", "boy"]];
  function runAnalogy([a, b, c]) {
    const ix = (wd) => E.words.indexOf(wd);
    const v = E.V[ix(a)].map((x, k) => x - E.V[ix(b)][k] + E.V[ix(c)][k]);
    const n = Math.hypot(...v) || 1;
    const [[res, sim]] = neighbors(v.map((x) => x / n), 1, [a, b, c]);
    MAP.analogy = { a, b, c, res };
    MAP.pinned = -1;
    $("#ana-out").innerHTML = `${a} − ${b} + ${c} = <span style="color:var(--nn)">${res}</span> <span class="muted" style="font-size:.85rem">(${Math.round(sim * 100)}% match)</span>`;
    $("#inside").innerHTML = `
      <div>Start at <b>${a}</b>’s numbers</div><div class="arrow">${ML.icon("minus")}</div>
      <div>take away <b>${b}</b>’s numbers</div><div class="arrow">${ML.icon("plus")}</div>
      <div>add <b>${c}</b>’s numbers</div><div class="arrow">${ML.icon("arrow-down")}</div>
      <div>closest word: <b>${res}</b></div>`;
    ML.say(`I took <b>${a}</b>, removed the “${b}” part and added the “${c}” part… and landed on <b>${res}</b>! (The arrows look wonky because the map squishes ${E.ctxWords.length} numbers into 2.)`);
  }

  // ================= Wire up =================
  function wire() {
    let tmr;
    txt.addEventListener("input", () => {
      clearTimeout(tmr);
      tmr = setTimeout(() => {
        render(true); renderCkpts();
        const unk = encWords(txt.value).filter((p) => p.unk);
        if (S.mode === "words" && unk.length) ML.say(`I never read <b>${unk[0].t}</b> in my stories, so in whole-word mode it's just <b>[?]</b>. Try “Robo's chunks”!`);
        else if (S.mode === "bpe" && S.M > 0) ML.say(`Chopped into <b>${encBPE(txt.value, S.M).length}</b> pieces with my ${S.M} chunks.`);
      }, 160);
    });
    $("#mode-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setMode(b.dataset.m); });
    $("#cmp").addEventListener("click", (e) => { const r = e.target.closest(".cmp-row"); if (r) setMode(r.dataset.m); });
    $("#merges").max = BPE.merges.length;
    $("#merges").addEventListener("input", (e) => { stopPlay(); setM(+e.target.value, false, false); });
    $("#next").addEventListener("click", () => {
      stopPlay();
      if (S.mode !== "bpe") setMode("bpe");
      if (S.M >= BPE.merges.length) { ML.toast("Robo's chunk book is full!"); return; }
      setM(S.M + 1, true, true);
    });
    $("#play").addEventListener("click", () => {
      if (S.playing) { stopPlay(); return; }
      if (S.mode !== "bpe") setMode("bpe");
      if (S.M >= BPE.merges.length) setM(0, false, false);
      $("#play").innerHTML = `${ML.icon("pause")} Pause`;
      S.playing = setInterval(() => {
        if (S.M >= BPE.merges.length) { stopPlay(); ML.say(`All ${BPE.merges.length} chunks glued! Common words like “the” are one piece now.`); return; }
        setM(S.M + 1, true, S.M < 30 || S.M % 10 === 0);
      }, S.M < 20 ? 700 : 260);
    });
    $("#reset").addEventListener("click", () => { stopPlay(); setM(0, false, false); ML.say("Back to just letters!"); });
    $("#ckpts").addEventListener("click", (e) => {
      const b = e.target.closest(".ckpt");
      if (!b) return;
      stopPlay();
      if (S.mode !== "bpe") setMode("bpe");
      setM(+b.dataset.m, true, false);
      ML.say(`At step ${b.dataset.m}, your sentence is <b>${encBPE(txt.value, +b.dataset.m).length}</b> pieces. More glue → fewer, bigger pieces.`);
    });
    $("#shake").addEventListener("click", () => {
      MAP.announce = true;
      startTSNE(Math.floor(Math.random() * 1e9));
      ML.say("Shaking everything up! Watch the words find their friends again. 🫨");
    });
    $("#ana-btns").innerHTML = ANALOGIES.map((a, i) => `<button class="btn small" data-i="${i}">${a[0]} − ${a[1]} + ${a[2]} = ?</button>`).join("");
    $("#ana-btns").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) runAnalogy(ANALOGIES[+b.dataset.i]); });
    $("#map-legend").innerHTML = Object.entries(GROUP_COLOR).map(([g, c]) => `<span><i style="background:var(${c})"></i>${g}</span>`).join("");
    document.addEventListener("themechange", () => render(false));
  }

  $("#s-read").textContent = BPE.nWords.toLocaleString();
  wire();
  setM(0, false, false);
  render(true);
  startTSNE(3);
})();
