// Picture Talker — a real image-captioning model, decoded one word at a time
// so kids can watch (and steer) every choice.
(function () {
  const MODEL = "Xenova/vit-gpt2-image-captioning";
  const MAX_WORDS = 20;
  const $ = (id) => document.getElementById(id);

  const state = {
    model: null, // { m, tok, proc, cap, eos }
    mode: "greedy",
    temp: 1,
    speed: 2,
    running: false,
    stop: false,
    steps: [], // { top: [{id, w, p}], pick, kid }
  };

  const src = VLM.ImageSource($("src"), { start: "car" });

  // ---------- model ----------
  const dl = VLM.loaderUI($("dl"));
  $("wake").addEventListener("click", wake);
  async function wake() {
    $("wake").disabled = true;
    ML.say(`Waking up… downloading my <b>picture brain</b> and my <b>writing brain</b>. Only the first time!`);
    dl.busy("Loading Transformers.js…");
    try {
      const m = await VLM.lib();
      const track = VLM.tracker((f, b) => dl.set(f, b));
      const [tok, proc, cap] = await Promise.all([
        m.AutoTokenizer.from_pretrained(MODEL, { progress_callback: track }),
        m.AutoProcessor.from_pretrained(MODEL, { progress_callback: track }),
        m.AutoModelForVision2Seq.from_pretrained(MODEL, { progress_callback: track, dtype: "q8" }),
      ]);
      cacheEncoder(cap);
      state.model = { m, tok, proc, cap, eos: cap.generation_config?.eos_token_id ?? 50256, Peek: makePeek(m) };
      dl.done("Ready! Everything now runs on your computer.");
      $("go").disabled = false;
      ML.say(`I'm awake! Pick a picture and press <b>Describe it!</b>`);
    } catch (err) {
      console.warn(err);
      dl.fail("Couldn't download the model. Check your internet and try again.");
      $("wake").disabled = false;
      ML.say(`Oh no, I couldn't download my brain. Try the button again in a moment.`);
    }
  }

  // The picture brain only needs to look once per picture: remember its summary
  // so each new word only re-runs the (fast) writing brain.
  function cacheEncoder(cap) {
    const orig = cap._prepare_encoder_decoder_kwargs_for_generation.bind(cap);
    let cache = null;
    cap._prepare_encoder_decoder_kwargs_for_generation = async (args) => {
      if (cache && cache.pv === args.model_inputs.pixel_values) {
        args.model_inputs.encoder_outputs = cache.out;
        return args.model_inputs;
      }
      const r = await orig(args);
      cache = { pv: args.model_inputs.pixel_values, out: r.encoder_outputs };
      return r;
    };
  }

  // A logits processor that replays the words already chosen, then peeks at
  // the scores for the next word.
  function makePeek(m) {
    return class Peek extends m.LogitsProcessor {
      constructor(forced, temp) { super(); this.forced = forced; this.temp = temp; this.i = 0; this.top = null; }
      _call(ids, logits) {
        const d = logits.data, L = logits.dims.at(-1);
        if (this.i < this.forced.length) {
          const f = this.forced[this.i++];
          for (let k = 0; k < L; k++) if (k !== f) d[k] = -Infinity;
          return logits;
        }
        this.i++;
        let mx = -Infinity;
        for (let k = 0; k < L; k++) if (d[k] > mx) mx = d[k];
        const p = new Float32Array(L);
        let s = 0;
        for (let k = 0; k < L; k++) { p[k] = Math.exp((d[k] - mx) / this.temp); s += p[k]; }
        const idx = [];
        for (let k = 0; k < L; k++) {
          if (p[k] === 0) continue;
          if (idx.length < 40 || p[k] > p[idx[idx.length - 1]]) {
            let j = idx.length;
            idx.push(k);
            while (j > 0 && p[idx[j - 1]] < p[k]) { idx[j] = idx[j - 1]; j--; }
            idx[j] = k;
            if (idx.length > 40) idx.pop();
          }
        }
        this.top = idx.map((k) => ({ id: k, p: p[k] / s }));
        return logits;
      }
    };
  }

  // ---------- controls ----------
  document.querySelectorAll("#mode button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("on", x === b));
      state.mode = b.dataset.m;
      $("temp-field").classList.toggle("hidden", state.mode !== "creative");
      ML.say({
        greedy: `I'll always pick my <b>top guess</b>. Same picture, same caption, every time.`,
        creative: `I'll <b>roll the dice</b>: likely words win more often, but surprises can happen!`,
        kid: `You're the boss! At every step <b>you</b> choose the next word from my guesses.`,
      }[state.mode]);
    })
  );
  $("temp-field").classList.add("hidden");
  ML.bindRange("#temp", (v) => v.toFixed(1), (v) => (state.temp = v));
  ML.bindRange("#speed", (v) => ["0.5×", "Slow", "Normal", "Fast"][v], (v) => (state.speed = v));
  $("go").addEventListener("click", describe);
  $("stop").addEventListener("click", () => { state.stop = true; if (pickResolve) pickResolve(null); });

  // ---------- writing loop ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = () => [1800, 900, 380, 60][state.speed];
  let pickResolve = null;

  function lightStep(i) {
    document.querySelectorAll("#pipe .pstep").forEach((p) => {
      const s = +p.dataset.s;
      p.classList.toggle("on", s <= i);
      p.classList.toggle("busy", s === i);
    });
  }

  function label(t) {
    if (t.id === state.model.eos) return "(the end)";
    const w = state.model.tok.decode([t.id]);
    return w.trim() === "" ? "(space)" : w.trim();
  }

  async function describe() {
    if (!state.model || state.running) return;
    const { m, proc, cap, Peek } = state.model;
    state.running = true;
    state.stop = false;
    state.steps = [];
    $("go").disabled = true;
    $("stop").disabled = false;
    $("ckpts").innerHTML = "";
    $("cands").innerHTML = "";
    renderCaption(true);

    // 1–2: look at the picture
    lightStep(0);
    showPatches(true);
    $("inside-text").innerHTML = `Cutting your picture into <b>14 × 14 = 196</b> little squares…`;
    ML.say(`First I chop your picture into 196 tiny squares and study them all…`);
    const inputs = await proc(VLM.toRaw(m, src.canvas, 224));
    await wait(pause() + 200);
    lightStep(1);
    $("inside-text").innerHTML = `The picture brain turns each square into <b>768 numbers</b>. That's the summary the writer will read.`;
    await wait(pause());
    showPatches(false);

    const forced = [];
    try {
      for (let s = 0; s < MAX_WORDS && !state.stop; s++) {
        lightStep(2);
        const peek = new Peek(forced.slice(), state.mode === "creative" ? state.temp : 1);
        await cap.generate({ ...inputs, max_new_tokens: forced.length + 1, no_repeat_ngram_size: 3, logits_processor: [peek] });
        const top = peek.top;
        if (!top || !top.length) break;
        showCands(top.slice(0, 6), null, state.mode === "kid");
        explain(forced, top);

        let pick;
        if (state.mode === "kid") {
          $("cand-title").textContent = "Your turn: tap the next word!";
          ML.say(`Your turn! Which word comes next? My favourite is <b>${escape(label(top[0]))}</b> (${pct(top[0].p)}).`);
          pick = await new Promise((r) => (pickResolve = r));
          pickResolve = null;
          if (pick == null) break;
        } else {
          pick = state.mode === "greedy" ? top[0] : sample(top);
          await wait(pause());
        }
        lightStep(3);
        showCands(top.slice(0, 6), pick, false);
        state.steps.push({ top: top.slice(0, 6), pick, kid: state.mode === "kid" });
        addCard(state.steps.length - 1);
        if (pick.id === state.model.eos) break;
        forced.push(pick.id);
        renderCaption(true);
        if (state.mode !== "kid") narrate(pick, top);
        await wait(pause() / 2);
      }
    } catch (err) {
      console.warn(err);
      ML.toast("Something went wrong while writing. Try again!");
    }
    finish();
  }

  function finish() {
    state.running = false;
    $("go").disabled = false;
    $("stop").disabled = true;
    $("cand-title").textContent = "Robo's guesses for the next word";
    lightStep(-1);
    renderCaption(false);
    const text = captionText();
    if (text) {
      ML.say(`Done! I think it's <b>“${escape(text)}”</b>. I wrote that in ${state.steps.length} little guesses.`);
      $("inside-text").innerHTML = `Finished after <b>${state.steps.length}</b> guesses. Tap any card below to see a step again.`;
    }
  }

  function sample(top) {
    // Roll the dice among the top-40 words, weighted by their chances.
    const tot = top.reduce((s, t) => s + t.p, 0);
    let r = Math.random() * tot;
    for (const t of top) { r -= t.p; if (r <= 0) return t; }
    return top[0];
  }

  // ---------- display ----------
  const pct = (p) => (p >= 0.995 ? "99%" : p < 0.01 ? "<1%" : Math.round(p * 100) + "%");
  function escape(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function captionText() {
    return state.steps.filter((s) => s.pick.id !== state.model.eos).map((s) => state.model.tok.decode([s.pick.id])).join("").trim();
  }

  function renderCaption(writing) {
    const host = $("caption");
    const words = state.steps.filter((s) => s.pick.id !== state.model.eos);
    if (!words.length && !writing) { host.innerHTML = `<span class="placeholder">Press “Describe it!”</span>`; return; }
    host.innerHTML = words
      .map((s) => {
        const w = state.model.tok.decode([s.pick.id]);
        return `${w.startsWith(" ") ? " " : ""}<span class="w ${s.kid && s.pick !== s.top[0] ? "kid" : ""}">${escape(w.trim())}</span>`;
      })
      .join("") + (writing ? `<span class="cursor"></span>` : "");
  }

  function showCands(top, pick, choose) {
    const host = $("cands");
    host.classList.toggle("choose", choose);
    host.innerHTML = top
      .map((t, i) => `<button class="cand ${pick && pick.id === t.id ? "pick" : ""}" data-i="${i}" ${choose ? "" : 'tabindex="-1"'}>
        <span>${escape(label(t))}</span><span class="bt"><span class="bf" style="width:0"></span></span><span class="bp">${pct(t.p)}</span></button>`)
      .join("");
    if (pick && !top.some((t) => t.id === pick.id)) {
      host.insertAdjacentHTML("beforeend", `<button class="cand pick" tabindex="-1"><span>${escape(label(pick))}</span><span class="bt"><span class="bf" style="width:${pick.p * 100}%"></span></span><span class="bp">${pct(pick.p)}</span></button>`);
    }
    requestAnimationFrame(() => host.querySelectorAll(".cand[data-i]").forEach((b) => (b.querySelector(".bf").style.width = Math.max(2, top[+b.dataset.i].p * 100) + "%")));
    if (choose)
      host.querySelectorAll(".cand[data-i]").forEach((b) =>
        b.addEventListener("click", () => pickResolve && pickResolve(top[+b.dataset.i]))
      );
  }

  function explain(forced, top) {
    const so = forced.length ? `“${escape(state.model.tok.decode(forced).trim())}”` : "nothing yet (just “start!”)";
    $("inside-text").innerHTML = `
      <div>Picture summary <b>+</b> words so far: ${so}</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>Writing brain scores all <b>50,257</b> word pieces it knows</div>
      <div class="arrow">${ML.icon("arrow-down")}</div>
      <div>Top guesses: ${top.slice(0, 3).map((t) => `<b>${escape(label(t))}</b> ${pct(t.p)}`).join(", ")}</div>`;
  }

  function narrate(pick, top) {
    const w = escape(label(pick));
    if (pick.id === state.model.eos) return;
    if (pick !== top[0]) ML.say(`Dice roll! I picked <b>${w}</b> (only ${pct(pick.p)}) instead of <b>${escape(label(top[0]))}</b>.`);
    else if (pick.p > 0.8) ML.say(`<b>${w}</b>, easy! I'm ${pct(pick.p)} sure.`);
    else ML.say(`Hmm, <b>${w}</b> (${pct(pick.p)}) or <b>${escape(label(top[1]))}</b> (${pct(top[1].p)})? I'll go with <b>${w}</b>.`);
  }

  function addCard(i) {
    const s = state.steps[i];
    const b = document.createElement("button");
    b.className = "ckpt";
    b.innerHTML = `<b>Word ${i + 1}</b><span class="wl">${escape(label(s.pick))}</span> ${pct(s.pick.p)}
      <span class="mini">${s.top.slice(0, 4).map((t) => `<i style="width:${Math.max(4, t.p * 100)}%"></i>`).join("")}</span>`;
    b.addEventListener("click", () => {
      if (state.running) return ML.toast("Wait until Robo has finished writing");
      document.querySelectorAll("#ckpts .ckpt").forEach((x) => x.classList.toggle("on", x === b));
      showCands(s.top, s.pick, false);
      const before = state.steps.slice(0, i).filter((x) => x.pick.id !== state.model.eos).map((x) => x.pick.id);
      explain(before, s.top);
      ML.say(`At word ${i + 1}, I was choosing between <b>${escape(label(s.top[0]))}</b> and <b>${escape(label(s.top[1]))}</b>. I picked <b>${escape(label(s.pick))}</b>.`);
    });
    $("ckpts").appendChild(b);
    $("ckpts").scrollLeft = $("ckpts").scrollWidth;
  }

  // 14×14 patch grid with a scanning highlight.
  let patchAnim = 0;
  function showPatches(on) {
    const host = src.overlay;
    cancelAnimationFrame(patchAnim);
    if (!on) { host.innerHTML = ""; return; }
    host.innerHTML = '<canvas style="width:100%;height:100%"></canvas>';
    const c = host.firstChild;
    const { ctx } = ML.setupCanvas(c, 280, 280);
    c.style.aspectRatio = "";
    const n = 14, sz = 280 / n, t0 = performance.now(), accent = ML.cssVar("--accent");
    const frame = (t) => {
      ctx.clearRect(0, 0, 280, 280);
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 1;
      for (let i = 1; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(i * sz, 0); ctx.lineTo(i * sz, 280); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * sz); ctx.lineTo(280, i * sz); ctx.stroke();
      }
      const k = Math.floor((t - t0) / 6) % (n * n);
      ctx.fillStyle = accent; ctx.globalAlpha = 0.45;
      for (let j = 0; j < 6; j++) { const q = (k + j * 7) % (n * n); ctx.fillRect((q % n) * sz, Math.floor(q / n) * sz, sz, sz); }
      ctx.globalAlpha = 1;
      patchAnim = requestAnimationFrame(frame);
    };
    patchAnim = requestAnimationFrame(frame);
  }

  window.__vlmCaption = state; // handy for tests
})();
