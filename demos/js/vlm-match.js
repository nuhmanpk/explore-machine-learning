// Words ↔ Pictures — real CLIP in the browser, with every step made visible.
(function () {
  const MODEL = "Xenova/clip-vit-base-patch32";
  const PRESETS = {
    animals: ["cat", "dog", "fish", "bird", "rabbit", "cow"],
    weather: ["sunny day", "rainy day", "snowy day", "rainbow", "thunderstorm"],
    feelings: ["happy face", "sad face", "angry face", "surprised face"],
    things: ["house", "tree", "car", "apple", "rocket"],
  };

  const state = {
    labels: PRESETS.animals.slice(),
    clip: null,
    textCache: new Map(), // prompt -> normalised Float32Array
    img: null, // normalised image embedding
    result: null,
    busy: false,
    pending: false,
    source: "sample",
    snaps: 0,
  };

  const $ = (id) => document.getElementById(id);
  const src = VLM.ImageSource($("src"), { live: true, start: "cat", onChange });

  // ---------- labels ----------
  function renderChips() {
    $("chips").innerHTML = state.labels
      .map((l, i) => `<span class="lchip">${escapeHTML(l)}<button data-i="${i}" aria-label="remove ${escapeHTML(l)}">${ML.icon("x")}</button></span>`)
      .join("");
  }
  function escapeHTML(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    if (state.labels.length <= 2) return ML.toast("Keep at least 2 words to compare!");
    state.labels.splice(+b.dataset.i, 1);
    renderChips();
    rescore();
  });
  $("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const w = $("add-word").value.trim().toLowerCase();
    if (!w) return;
    if (state.labels.includes(w)) return ML.toast("That word is already there");
    if (state.labels.length >= 10) return ML.toast("10 words max. Remove one first!");
    state.labels.push(w);
    $("add-word").value = "";
    renderChips();
    ML.say(`New word: <b>${escapeHTML(w)}</b>! I'll turn it into its own 512 numbers.`);
    rescore();
  });
  document.querySelectorAll("#presets button").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#presets button").forEach((x) => x.classList.toggle("on", x === b));
      state.labels = PRESETS[b.dataset.set].slice();
      renderChips();
      rescore();
    })
  );
  $("template").addEventListener("change", rescore);

  function article(w) {
    if (/^(a|an|the|some)\s/.test(w) || / (day|face)s$/.test(w)) return w;
    return (/^[aeiou]/.test(w) ? "an " : "a ") + w;
  }
  function prompt(label) {
    let t = $("template").value;
    if (t === "auto") t = state.source === "photo" ? "a photo of {}" : "a drawing of {}";
    return t === "{}" ? label : t.replace("{}", article(label));
  }

  // ---------- picture changes ----------
  let debounce = 0;
  function onChange(reason) {
    state.source = /upload|snap|live|camera/.test(reason) ? "photo" : "drawing";
    if (reason === "camera-on") return ML.say(`Camera on! Press <b>Snap!</b>, or tick <b>Keep looking</b> and I'll check every second or so.`);
    if (!state.clip) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => rescore(reason === "draw" ? "stroke" : reason), reason === "draw" ? 350 : 50);
  }

  // ---------- model ----------
  const dl = VLM.loaderUI($("dl"));
  $("wake").addEventListener("click", wake);
  async function wake() {
    $("wake").disabled = true;
    ML.say(`Waking up… I'm downloading my <b>picture brain</b> and my <b>word brain</b>. This only happens once.`);
    dl.busy("Loading Transformers.js…");
    try {
      const m = await VLM.lib();
      const track = VLM.tracker((f, b) => dl.set(f, b));
      const [tok, textModel, proc, visionModel] = await Promise.all([
        m.AutoTokenizer.from_pretrained(MODEL, { progress_callback: track }),
        m.CLIPTextModelWithProjection.from_pretrained(MODEL, { progress_callback: track, dtype: "q8" }),
        m.AutoProcessor.from_pretrained(MODEL, { progress_callback: track }),
        m.CLIPVisionModelWithProjection.from_pretrained(MODEL, { progress_callback: track, dtype: "q8" }),
      ]);
      state.clip = { m, tok, textModel, proc, visionModel };
      dl.done("Ready! Everything now runs on your computer.");
      $("score").disabled = false;
      ML.say(`I'm awake! Let me look at your picture…`);
      rescore("wake");
    } catch (err) {
      console.warn(err);
      dl.fail("Couldn't download the model. Check your internet and try again.");
      $("wake").disabled = false;
      ML.say(`Oh no, I couldn't download my brain. Maybe the internet is sleepy? Try the button again.`);
    }
  }
  $("score").addEventListener("click", () => rescore("button"));

  // ---------- the pipeline ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function lightStep(i, busy) {
    document.querySelectorAll("#pipe .pstep").forEach((p) => {
      const s = +p.dataset.s;
      p.classList.toggle("on", s <= i);
      p.classList.toggle("busy", busy && s === i);
    });
  }

  async function rescore(reason) {
    if (!state.clip) return;
    if (state.busy) { state.pending = reason || true; return; }
    state.busy = true;
    const quick = reason === "live" || reason === "stroke";
    const pause = quick ? 60 : 380;
    try {
      const { m, tok, textModel, proc, visionModel } = state.clip;
      // 1. chop picture into squares
      lightStep(0, true);
      drawPatches(true);
      await wait(pause);
      // 2. picture -> numbers
      lightStep(1, true);
      const raw = VLM.toRaw(m, src.canvas, 224);
      const { image_embeds } = await visionModel(await proc(raw));
      state.img = VLM.normalize(image_embeds.data);
      drawPatches(false);
      drawCodes(null);
      await wait(pause);
      // 3. words -> numbers (only the ones we haven't read yet)
      lightStep(2, true);
      const prompts = state.labels.map(prompt);
      const todo = prompts.filter((p) => !state.textCache.has(p));
      if (todo.length) {
        const { text_embeds } = await textModel(tok(todo, { padding: true, truncation: true }));
        const d = text_embeds.dims.at(-1);
        todo.forEach((p, i) => state.textCache.set(p, VLM.normalize(text_embeds.data.slice(i * d, (i + 1) * d))));
      }
      await wait(pause);
      // 4. compare
      lightStep(3, true);
      const sims = prompts.map((p) => dot(state.img, state.textCache.get(p)));
      const probs = VLM.softmax(sims, 100);
      state.result = { labels: state.labels.slice(), prompts, sims, probs };
      drawCodes(state.result);
      await wait(pause);
      // 5. winner
      lightStep(4, false);
      renderBars();
      drawMap();
      explain(reason);
      addSnapshot();
    } catch (err) {
      console.warn(err);
      ML.toast("Something went wrong while looking. Try again!");
    }
    state.busy = false;
    if (state.pending) { const r = state.pending; state.pending = false; rescore(r === true ? undefined : r); }
  }

  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // ---------- drawing: patch grid over the picture ----------
  let patchAnim = 0;
  function drawPatches(on) {
    const host = src.overlay;
    cancelAnimationFrame(patchAnim);
    if (!on) { host.innerHTML = ""; return; }
    host.innerHTML = '<canvas style="width:100%;height:100%"></canvas>';
    const c = host.firstChild;
    const { ctx } = ML.setupCanvas(c, 280, 280);
    c.style.aspectRatio = "";
    const n = 7, s = 280 / n, t0 = performance.now();
    const accent = ML.cssVar("--accent");
    const frame = (t) => {
      ctx.clearRect(0, 0, 280, 280);
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 2;
      for (let i = 1; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, 280); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(280, i * s); ctx.stroke();
      }
      const k = Math.floor((t - t0) / 25) % (n * n);
      ctx.fillStyle = accent; ctx.globalAlpha = 0.35;
      ctx.fillRect((k % n) * s, Math.floor(k / n) * s, s, s);
      ctx.globalAlpha = 1;
      patchAnim = requestAnimationFrame(frame);
    };
    patchAnim = requestAnimationFrame(frame);
  }

  // ---------- drawing: barcodes ----------
  const CW = 620;
  const codes = $("codes");
  let codesCtx = null, codesH = 0;
  function drawCodes(res) {
    const rows = res ? res.labels.length : 0;
    const H = 52 + rows * 58 + 10;
    if (H !== codesH) { codes.style.aspectRatio = `${CW} / ${H}`; codesCtx = ML.setupCanvas(codes, CW, H).ctx; codesH = H; }
    const ctx = codesCtx;
    ctx.clearRect(0, 0, CW, H);
    const ink = ML.cssVar("--ink"), muted = ML.cssVar("--muted");
    const LW = 150, BX = LW + 8, BW = CW - BX - 60;
    ctx.font = "800 13px Nunito, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ink;
    ctx.fillText("Your picture", 8, 22);
    if (state.img) VLM.barcode(ctx, state.img, BX, 10, BW, 24, { max: 0.12 });
    ctx.drawImage(src.thumb(40), CW - 48, 4, 40, 40);
    if (!res) return;
    const win = res.probs.indexOf(Math.max(...res.probs));
    const good = ML.cssVar("--good"), bad = ML.cssVar("--bad");
    res.labels.forEach((l, i) => {
      const y = 52 + i * 58;
      const v = state.textCache.get(res.prompts[i]);
      ctx.fillStyle = i === win ? ML.cssVar("--accent") : ink;
      ctx.font = "800 13px Nunito, sans-serif";
      ctx.fillText(trim(ctx, l, LW - 10), 8, y + 10);
      VLM.barcode(ctx, v, BX, y, BW, 18, { max: 0.12 });
      // agreement strip: picture × word, number by number
      const prod = new Float32Array(v.length);
      for (let k = 0; k < v.length; k++) prod[k] = v[k] * state.img[k];
      VLM.barcode(ctx, prod, BX, y + 22, BW, 12, { pos: good, neg: bad, max: 0.006 });
      ctx.fillStyle = muted;
      ctx.font = "700 11px Nunito, sans-serif";
      ctx.fillText("agree / disagree", 8, y + 28);
      ctx.fillStyle = i === win ? ML.cssVar("--accent") : ink;
      ctx.font = "700 13px ui-monospace, monospace";
      ctx.fillText(res.sims[i].toFixed(3), CW - 54, y + 17);
    });
  }
  function trim(ctx, s, w) {
    if (ctx.measureText(s).width <= w) return s;
    while (s.length > 2 && ctx.measureText(s + "…").width > w) s = s.slice(0, -1);
    return s + "…";
  }

  // ---------- bars ----------
  function renderBars() {
    const r = state.result;
    const order = r.probs.map((p, i) => i).sort((a, b) => r.probs[b] - r.probs[a]);
    const host = $("bars");
    if (!host.querySelector(".bar-row") || host.children.length !== order.length) {
      host.innerHTML = order.map(() => `<div class="bar-row"><span class="bl"></span><span class="bt"><span class="bf"></span></span><span class="bp"></span></div>`).join("");
    }
    order.forEach((i, k) => {
      const row = host.children[k];
      row.classList.toggle("win", k === 0);
      row.querySelector(".bl").textContent = r.labels[i];
      row.querySelector(".bf").style.width = (r.probs[i] * 100).toFixed(1) + "%";
      row.querySelector(".bp").textContent = Math.round(r.probs[i] * 100) + "%";
    });
  }

  // ---------- word map ----------
  const MW = 420, MH = 320;
  const mapCtx = ML.setupCanvas($("map"), MW, MH).ctx;
  function pca2(vecs) {
    // Top-2 principal directions via power iteration on the small n×n Gram matrix.
    const n = vecs.length, d = vecs[0].length;
    const mean = new Float32Array(d);
    vecs.forEach((v) => { for (let k = 0; k < d; k++) mean[k] += v[k] / n; });
    const X = vecs.map((v) => v.map((x, k) => x - mean[k]));
    const G = X.map((a) => X.map((b) => dot(a, b)));
    const coords = X.map(() => [0, 0]);
    const used = [];
    for (let c = 0; c < 2; c++) {
      let u = Array.from({ length: n }, (_, i) => Math.sin(i * 1.7 + c * 3.1 + 1));
      let lambda = 0;
      for (let it = 0; it < 80; it++) {
        let w = G.map((row) => row.reduce((s, g, j) => s + g * u[j], 0));
        used.forEach(([uu, ll]) => { const p = uu.reduce((s, x, j) => s + x * u[j], 0); w = w.map((x, j) => x - ll * p * uu[j]); });
        const norm = Math.hypot(...w) || 1;
        lambda = norm;
        u = w.map((x) => x / norm);
      }
      used.push([u, lambda]);
      u.forEach((x, i) => (coords[i][c] = x * Math.sqrt(lambda)));
    }
    return coords;
  }
  function drawMap() {
    const ctx = mapCtx, r = state.result;
    ctx.clearRect(0, 0, MW, MH);
    if (!r) return;
    const vecs = r.prompts.map((p) => state.textCache.get(p));
    let pts = pca2(vecs);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const nx = (x) => 60 + ((x - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs) || 1)) * (MW - 120);
    const ny = (y) => 40 + ((y - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys) || 1)) * (MH - 80);
    pts = pts.map(([x, y]) => [nx(x), ny(y)]);
    const px = pts.reduce((s, p, i) => s + p[0] * r.probs[i], 0);
    // Sit just beside the weighted spot so the winning word stays readable.
    const py0 = pts.reduce((s, p, i) => s + p[1] * r.probs[i], 0);
    const py = py0 + (py0 > MH / 2 ? -40 : 40);
    const accent = ML.cssVar("--accent");
    pts.forEach((p, i) => {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.15 + r.probs[i] * 0.85;
      ctx.lineWidth = 1 + r.probs[i] * 8;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p[0], p[1]); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    const win = r.probs.indexOf(Math.max(...r.probs));
    ctx.font = "800 13px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    pts.forEach((p, i) => {
      const w = ctx.measureText(r.labels[i]).width + 18;
      ctx.fillStyle = i === win ? accent : ML.cssVar("--card");
      ctx.strokeStyle = i === win ? accent : ML.cssVar("--line");
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(p[0] - w / 2, p[1] - 13, w, 26, 13); ctx.fill(); ctx.stroke();
      ctx.fillStyle = i === win ? "#fff" : ML.cssVar("--ink");
      ctx.fillText(r.labels[i], p[0], p[1] + 1);
    });
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, 26, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.clip();
    ctx.drawImage(src.thumb(52), px - 26, py - 26, 52, 52);
    ctx.restore();
    ctx.strokeStyle = ML.cssVar("--ink"); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, 26, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------- narration + inside card ----------
  function explain(reason) {
    const r = state.result;
    const order = r.probs.map((p, i) => i).sort((a, b) => r.probs[b] - r.probs[a]);
    const a = order[0], b = order[1];
    const pct = Math.round(r.probs[a] * 100);
    $("f1").innerHTML = `<b>Your picture</b><br><span class="muted">read as ${state.source === "photo" ? "a photo" : "a drawing"}</span>`;
    $("f2").innerHTML = `<b>Codes compared</b><br>“${escapeHTML(r.prompts[a])}” agrees <b>${r.sims[a].toFixed(3)}</b>, “${escapeHTML(r.labels[b])}” <b>${r.sims[b].toFixed(3)}</b>`;
    $("f3").innerHTML = `<b>${escapeHTML(r.labels[a])}</b> wins with ${pct}%<br><span class="muted">tiny gap × 100, then shared out</span>`;
    const lead = pct > 80 ? "I'm pretty sure" : pct > 45 ? "I think" : "Hmm, maybe";
    let msg = `${lead} it's <b>${escapeHTML(r.labels[a])}</b> (${pct}%). Its numbers agree with your picture a little more than <b>${escapeHTML(r.labels[b])}</b>.`;
    if (reason === "stroke") msg = `New stroke, new numbers! Now ${lead === "I'm pretty sure" ? lead : lead.toLowerCase()} it's <b>${escapeHTML(r.labels[a])}</b> (${pct}%).`;
    if (pct < 35) msg += ` None of the words fit very well. Try adding a better word!`;
    ML.say(msg);
  }

  // ---------- snapshots ----------
  function addSnapshot() {
    const r = state.result;
    const a = r.probs.indexOf(Math.max(...r.probs));
    state.snaps++;
    const b = document.createElement("button");
    b.className = "ckpt";
    const c = src.thumb(108);
    c.style.aspectRatio = "1";
    b.appendChild(c);
    b.insertAdjacentHTML("beforeend", `<b>Look ${state.snaps}</b><span class="wl">${escapeHTML(r.labels[a])}</span> ${Math.round(r.probs[a] * 100)}%`);
    const saved = { img: c, result: r, imgVec: state.img };
    b.addEventListener("click", () => {
      document.querySelectorAll("#ckpts .ckpt").forEach((x) => x.classList.toggle("on", x === b));
      const ctx = src.ctx;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(saved.img, 0, 0, src.canvas.width, src.canvas.height);
      ctx.restore();
      state.img = saved.imgVec; state.result = saved.result;
      renderBars(); drawCodes(saved.result); drawMap();
      ML.say(`This is what I thought at <b>look ${b.querySelector("b").textContent.split(" ")[1]}</b>: ${escapeHTML(saved.result.labels[a])}.`);
    });
    const host = $("ckpts");
    host.appendChild(b);
    while (host.children.length > 24) host.firstChild.remove();
    host.scrollLeft = host.scrollWidth;
  }

  document.addEventListener("themechange", () => { drawCodes(state.result); drawMap(); });
  renderChips();
  drawCodes(null);
  window.__vlmMatch = state; // handy for tests
})();
