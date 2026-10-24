// Shared helpers for the supervised / grouping lessons: checkpoint strip, line chart, color utils.
(function () {
  function hexRgb(h) {
    h = (h || "#888").trim().replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // A row of little "photos" of the model at chosen moments in training.
  // milestones: numbers (step / example count / round); label(m) → card title.
  // draw(ctx, w, h, snapshot) paints a thumbnail; onPick(snapshot|null, m) when a card is clicked.
  class Checkpoints {
    constructor(el, { milestones, label, draw, onPick, w = 104, h = 72 }) {
      Object.assign(this, { el, milestones, label, draw, onPick, w, h });
      this.snaps = new Map();
      this.picked = null;
      this.build();
    }
    build() {
      this.el.innerHTML = "";
      this.cards = this.milestones.map((m) => {
        const b = document.createElement("button");
        b.className = "ckpt empty";
        b.type = "button";
        b.innerHTML = `<canvas></canvas><b>${this.label(m)}</b><span class="cp-sub">not yet</span>`;
        const cvs = b.querySelector("canvas");
        const { ctx } = ML.setupCanvas(cvs, this.w, this.h);
        b.addEventListener("click", () => this.pick(m));
        this.el.appendChild(b);
        return { m, b, ctx };
      });
    }
    setMilestones(ms, label) { this.milestones = ms; if (label) this.label = label; this.reset(); this.build(); }
    reset() {
      this.snaps.clear();
      if (this.picked !== null) { this.picked = null; this.onPick && this.onPick(null, null); }
      (this.cards || []).forEach((c) => {
        c.b.classList.add("empty"); c.b.classList.remove("on");
        c.b.querySelector(".cp-sub").textContent = "not yet";
        c.ctx.clearRect(0, 0, this.w, this.h);
      });
    }
    has(m) { return this.snaps.has(m); }
    // Capture snapshot for milestone m (only first time unless force).
    capture(m, snap, sub, force) {
      const c = this.cards.find((x) => x.m === m);
      if (!c || (this.snaps.has(m) && !force)) return false;
      this.snaps.set(m, snap);
      c.b.classList.remove("empty");
      c.b.querySelector(".cp-sub").textContent = sub || "";
      c.ctx.clearRect(0, 0, this.w, this.h);
      this.draw(c.ctx, this.w, this.h, snap);
      return true;
    }
    redraw() {
      this.cards.forEach((c) => { const s = this.snaps.get(c.m); c.ctx.clearRect(0, 0, this.w, this.h); if (s) this.draw(c.ctx, this.w, this.h, s); });
    }
    pick(m) {
      if (!this.snaps.has(m)) return;
      this.picked = this.picked === m ? null : m;
      this.cards.forEach((c) => c.b.classList.toggle("on", c.m === this.picked));
      this.onPick && this.onPick(this.picked === null ? null : this.snaps.get(m), this.picked);
    }
    unpick() { if (this.picked !== null) this.pick(this.picked); }
  }

  // Simple multi-series line chart. series: [{data:[{x,y}], color, label}]
  function lineChart(ctx, w, h, series, { xMax, yMin = 0, yMax, yFmt = (v) => v, xLabel = "", marks = [] } = {}) {
    ctx.clearRect(0, 0, w, h);
    const L = 34, R = 8, T = 10, B = 20;
    const all = series.flatMap((s) => s.data);
    const xm = xMax || Math.max(1, ...all.map((p) => p.x));
    const ym = yMax !== undefined ? yMax : Math.max(1e-9, ...all.map((p) => p.y)) * 1.1;
    const X = (x) => L + (x / xm) * (w - L - R);
    const Y = (y) => h - B - ((y - yMin) / (ym - yMin || 1)) * (h - T - B);
    ctx.strokeStyle = ML.cssVar("--line"); ctx.lineWidth = 1;
    ctx.fillStyle = ML.cssVar("--muted"); ctx.font = "700 10px Nunito, sans-serif";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i = 0; i <= 2; i++) {
      const v = yMin + ((ym - yMin) * i) / 2, y = Y(v);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
      ctx.fillText(yFmt(v), L - 4, y);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(xLabel, (L + w - R) / 2, h - 5);
    marks.forEach((m) => {
      ctx.strokeStyle = ML.cssVar("--muted"); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(m), T); ctx.lineTo(X(m), h - B); ctx.stroke(); ctx.setLineDash([]);
    });
    series.forEach((s) => {
      if (!s.data.length) return;
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
      ctx.beginPath();
      s.data.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.stroke();
      const lp = s.data[s.data.length - 1];
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(X(lp.x), Y(lp.y), 3.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  let ovT;
  function overlay(text, ms = 1500) {
    const ov = document.getElementById("ov");
    if (!ov) return;
    ov.textContent = text; ov.classList.add("show");
    clearTimeout(ovT); ovT = setTimeout(() => ov.classList.remove("show"), ms);
  }

  window.SupKit = { hexRgb, rgb, mix, rr, Checkpoints, lineChart, overlay };
})();
