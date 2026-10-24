// Shared bits for the Rocket Lander and Creature Walker lessons:
// a progress chart that marks when each challenge started, a checkpoint row,
// and a "challenge watcher" that notices the score drop and the recovery.
(function () {
  // values: [{best, avg}] per generation. marks: [{at, label, on}] (generation index).
  function drawProgress(cv, values, marks, opts = {}) {
    const { ctx, w, h } = cv;
    ctx.clearRect(0, 0, w, h);
    const pad = 26, top = 16, bottom = h - 16;
    // Whole history, squeezed to fit, so challenge markers never scroll away.
    const list = values;
    const off = 0;
    const max = opts.max || Math.max(10, ...list.map((v) => v.best)) * 1.05;
    ctx.fillStyle = ML.cssVar("--muted");
    ctx.font = "700 11px Nunito, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(opts.top || Math.round(max), 2, 12);
    if (!list.length) {
      ctx.textAlign = "center";
      ctx.font = "700 14px Nunito, sans-serif";
      ctx.fillText("Each generation adds a bar here", w / 2, h / 2 + 4);
      return;
    }
    const bw = (w - pad - 4) / Math.max(list.length, 30);
    const y = (v) => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
    ctx.fillStyle = ML.cssVar("--accent");
    ctx.globalAlpha = 0.5;
    list.forEach((v, i) => ctx.fillRect(pad + i * bw, y(v.best), Math.max(1, bw - (bw > 3 ? 1 : 0)), bottom - y(v.best)));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ML.cssVar("--ink");
    ctx.lineWidth = 2;
    ctx.beginPath();
    list.forEach((v, i) => {
      const x = pad + i * bw + bw / 2;
      i ? ctx.lineTo(x, y(v.avg)) : ctx.moveTo(x, y(v.avg));
    });
    ctx.stroke();
    // challenge markers
    ctx.font = "800 10px Nunito, sans-serif";
    let lastX = -999, row = 0;
    for (const m of marks) {
      const i = m.at - off;
      if (i < 0 || i > list.length) continue;
      const x = pad + i * bw;
      ctx.strokeStyle = m.on ? ML.cssVar("--bad") : ML.cssVar("--good");
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, top - 2); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.setLineDash([]);
      row = x - lastX < 70 ? (row + 1) % 3 : 0;
      lastX = x;
      ctx.fillStyle = m.on ? ML.cssVar("--bad") : ML.cssVar("--good");
      ctx.textAlign = x > w - 80 ? "right" : "left";
      ctx.fillText(m.label, x + (x > w - 80 ? -3 : 3), top + 8 + row * 11);
    }
  }

  // Checkpoint row. add(ck) with ck = {gen, label, data}; drawMini(canvas, ck); onPick(ck).
  function checkpoints(host, { drawMini, onPick, onLive }) {
    const list = [];
    let picked = null;
    function render() {
      if (!list.length) {
        host.innerHTML = `<span class="muted">Champions are saved here as the generations go by.</span>`;
        return;
      }
      host.innerHTML = (picked ? `<button class="ckpt" data-live="1" style="display:grid;place-items:center;align-content:center;gap:6px"><b>Back to live</b>${ML.icon("play")}</button>` : "") +
        list.map((c, i) => `<button class="ckpt ${picked === c ? "on" : ""}" data-i="${i}"><canvas width="216" height="96"></canvas><b>${c.title}</b>${c.sub}</button>`).join("");
      host.querySelectorAll(".ckpt[data-i]").forEach((b) => {
        const c = list[+b.dataset.i];
        drawMini(b.querySelector("canvas"), c);
        b.addEventListener("click", () => { picked = c; render(); onPick(c); });
      });
      const live = host.querySelector("[data-live]");
      if (live) live.addEventListener("click", () => { picked = null; render(); onLive(); });
    }
    render();
    return {
      add(c) { list.push(c); if (list.length > 16) list.splice(1, 1); render(); host.scrollLeft = host.scrollWidth; },
      clear() { list.length = 0; picked = null; render(); },
      unpick() { picked = null; render(); },
      get picked() { return picked; },
      render,
    };
  }

  // Watches the score after a challenge: reports the drop, then the recovery.
  // score() = smoothed recent score. say(kind, info) narrates.
  function challengeWatcher(say) {
    let watch = null;
    return {
      start(label, before, gen) { watch = { label, before, gen, low: Infinity, saidDrop: false }; },
      update(now, gen) {
        if (!watch) return;
        watch.low = Math.min(watch.low, now);
        if (!watch.checked && gen - watch.gen >= 2) {
          watch.checked = true;
          if (now < watch.before * 0.85) say("drop", watch);
          else { say("easy", watch); watch = null; return; }
        }
        // Recovered = back to 75% of before, or (when the new world is just harder) clearly better than its worst.
        if (watch.checked && gen - watch.gen >= 3 && (now >= watch.before * 0.75 || (gen - watch.gen >= 6 && now >= watch.low * 1.4))) {
          say("recovered", Object.assign({ gens: gen - watch.gen }, watch));
          watch = null;
        }
      },
      clear() { watch = null; },
    };
  }

  window.GameRW = { drawProgress, checkpoints, challengeWatcher };
})();
