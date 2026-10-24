// Small helpers shared by the rl-flappy and rl-snake lessons: score chart + checkpoint row.
(function () {
  // Bars for each try plus a 20-try moving average. markers: [{i, label}] where i = try index.
  function drawChart(cv, scores, unit = "", markers = []) {
    const { ctx, w, h } = cv;
    ctx.clearRect(0, 0, w, h);
    const list = scores.slice(-300);
    const max = Math.max(5, ...list);
    const pad = 22;
    ctx.fillStyle = ML.cssVar("--muted");
    ctx.font = "700 11px Nunito, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${max}${unit}`, 4, 12);
    if (!list.length) {
      ctx.textAlign = "center";
      ctx.font = "700 14px Nunito, sans-serif";
      ctx.fillText("Each try adds a bar here", w / 2, h / 2 + 4);
      return;
    }
    const bw = (w - pad - 4) / list.length;
    ctx.fillStyle = ML.cssVar("--accent");
    ctx.globalAlpha = 0.45;
    list.forEach((s, i) => {
      const bh = (s / max) * (h - 18);
      ctx.fillRect(pad + i * bw, h - 4 - bh, Math.max(1, bw - (bw > 3 ? 1 : 0)), bh);
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ML.cssVar("--ink");
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    list.forEach((_, i) => {
      const win = list.slice(Math.max(0, i - 19), i + 1);
      const avg = win.reduce((a, b) => a + b, 0) / win.length;
      const x = pad + i * bw + bw / 2, y = h - 4 - (avg / max) * (h - 18);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    // challenge markers: a dashed line + label where the world changed
    const offset = scores.length - list.length;
    ctx.font = "800 10px Nunito, sans-serif";
    ctx.textAlign = "left";
    for (const m of markers) {
      const j = m.i - offset;
      if (j < 0 || j > list.length) continue;
      const x = pad + j * bw;
      ctx.strokeStyle = ML.cssVar("--bad"); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x, h - 4); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ML.cssVar("--bad");
      ctx.fillText(m.label, Math.min(x + 3, w - 80), 26);
    }
  }

  // Tracks a challenge: remembers how well Robo did before, notices the drop, and reports
  // once the 20-try average is back to at least 75% of the old level.
  class Adapt {
    // ratio: how close to the old average counts as "adapted" (some challenges make the game harder for good).
    constructor(ratio = 0.75) { this.ratio = ratio; this.markers = []; this.watch = null; }
    mark(label, scores) {
      const prev = scores.slice(-30);
      const before = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
      this.markers.push({ i: scores.length, label });
      this.watch = { label, from: scores.length, before, low: Infinity };
    }
    clear() { this.markers = []; this.watch = null; }
    // Call after every finished try. Returns once per challenge:
    //   {kind: "easy", …}    — the change barely hurt (or helped)
    //   {kind: "adapted", …} — the average dipped, then climbed back up
    check(scores) {
      const w = this.watch;
      const n = scores.length - w?.from;
      if (!w || n < 20) return null;
      const r = scores.slice(-20), now = r.reduce((a, b) => a + b, 0) / 20;
      const out = (kind) => { this.watch = null; return { kind, label: w.label, tries: n, before: w.before, now, low: Math.min(w.low, now) }; };
      if (n === 20 && now >= w.before * 0.9) return out("easy");
      w.low = Math.min(w.low, now);
      if (n >= 40 && now >= Math.max(3, w.before * this.ratio) && now >= w.low * 1.3 + 0.5) return out("adapted");
      return null;
    }
  }

  // Saves a copy of the brain at certain try counts. onPick(ck) replays it.
  class Checkpoints {
    constructor(host, at, onPick) {
      this.host = host;
      this.at = at;
      this.onPick = onPick;
      this.list = [];
      this.playing = null;
    }
    maybeSave(tries, agent, scores, extra = "") {
      if (!this.at.includes(tries)) return false;
      const recent = scores.slice(-20);
      const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
      this.list.push({ tries, agent: agent.clone(), avg, extra, scores: scores.slice() });
      this.render();
      return true;
    }
    clear() {
      this.list = [];
      this.playing = null;
      this.render();
    }
    render() {
      if (!this.list.length) {
        this.host.innerHTML = `<div class="empty">Checkpoints appear here as Robo practises.</div>`;
        return;
      }
      this.host.innerHTML = this.list.map((c, i) => `<button class="ckpt ${this.playing === c ? "playing" : ""}" data-i="${i}">
        <canvas width="216" height="70"></canvas><b>After ${c.tries} ${c.tries === 1 ? "try" : "tries"}</b><small>avg ${c.avg.toFixed(1)}${c.extra}</small></button>`).join("");
      this.host.querySelectorAll(".ckpt").forEach((b) => {
        const c = this.list[+b.dataset.i];
        const cv = b.querySelector("canvas");
        drawChart({ ctx: cv.getContext("2d"), w: 216, h: 70 }, c.scores);
        b.addEventListener("click", () => this.onPick(c));
      });
      this.host.scrollLeft = this.host.scrollWidth;
    }
  }

  window.RLGames = { drawChart, Checkpoints, Adapt };
})();
