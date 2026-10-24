// Shared bits for Game Lab pages: a round-by-round chart with challenge markers,
// and a checkpoint row. Needs common.js (window.ML).
(function () {
  // series: [{ values: [...], color: "--accent", label: "Made it" }], markers: [{ at: roundIndex, label }]
  function drawChart(cv, series, markers, yMax, unit = "") {
    const { ctx, w, h } = cv;
    ctx.clearRect(0, 0, w, h);
    const L = 34, R = 10, T = 22, B = 22;
    const n = Math.max(10, ...series.map((s) => s.values.length));
    const X = (i) => L + ((w - L - R) * i) / Math.max(1, n - 1);
    const Y = (v) => T + (h - T - B) * (1 - Math.min(1, v / yMax));
    ctx.strokeStyle = ML.cssVar("--line");
    ctx.lineWidth = 1;
    ctx.fillStyle = ML.cssVar("--muted");
    ctx.font = "700 10px Nunito, sans-serif";
    ctx.textAlign = "right";
    for (let k = 0; k <= 4; k++) {
      const v = (yMax * k) / 4, y = Y(v);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
      ctx.fillText(Math.round(v) + unit, L - 4, y + 3);
    }
    ctx.textAlign = "center";
    for (let i = 0; i < n; i += Math.max(1, Math.ceil(n / 10))) ctx.fillText(i + 1, X(i), h - 6);
    // challenge markers
    for (const m of markers) {
      const x = X(Math.max(0, m.at - 0.5));
      ctx.strokeStyle = ML.cssVar("--bad");
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, T - 6); ctx.lineTo(x, h - B); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ML.cssVar("--bad");
      ctx.font = "800 10px Nunito, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(m.label, Math.min(x + 3, w - 90), T - 9 + (markers.indexOf(m) % 2) * 11);
    }
    for (const s of series) {
      if (!s.values.length) continue;
      ctx.strokeStyle = ML.cssVar(s.color);
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.values.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
      ctx.stroke();
      ctx.fillStyle = ML.cssVar(s.color);
      s.values.forEach((v, i) => { ctx.beginPath(); ctx.arc(X(i), Y(v), 2.5, 0, 7); ctx.fill(); });
    }
    if (!series.some((s) => s.values.length)) {
      ctx.fillStyle = ML.cssVar("--muted");
      ctx.font = "700 14px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Each round adds a dot here", w / 2, h / 2);
    }
  }

  // Row of checkpoint cards. items: { label, sub, draw(canvas) }
  class Checkpoints {
    constructor(host, onPick, onLive) {
      this.host = host;
      this.items = [];
      this.onPick = onPick;
      this.onLive = onLive;
      this.active = null;
    }
    add(item) {
      this.items.push(item);
      if (this.items.length > 16) this.items.splice(1, 1); // keep the very first one
      this.render();
    }
    clear() {
      this.items = [];
      this.active = null;
      this.render();
    }
    render() {
      const h = this.host;
      if (!this.items.length) {
        h.innerHTML = `<span class="muted">Each round saves its champion here. Tap one to watch it.</span>`;
        return;
      }
      h.innerHTML = (this.active ? `<button class="ckpt" data-live style="display:grid;place-items:center;align-content:center;gap:6px"><b>Back to live</b>${ML.icon("play")}</button>` : "") +
        this.items.map((it, i) => `<button class="ckpt ${this.active === it ? "on" : ""}" data-i="${i}"><canvas width="216" height="120"></canvas><b>${it.label}</b>${it.sub}</button>`).join("");
      h.querySelectorAll("[data-i]").forEach((b) => {
        const it = this.items[+b.dataset.i];
        it.draw(b.querySelector("canvas"));
        b.addEventListener("click", () => { this.active = it; this.render(); this.onPick(it); });
      });
      const live = h.querySelector("[data-live]");
      if (live) live.addEventListener("click", () => { this.active = null; this.render(); this.onLive(); });
      h.scrollLeft = h.scrollWidth;
    }
  }

  window.GameLab = { drawChart, Checkpoints };
})();
