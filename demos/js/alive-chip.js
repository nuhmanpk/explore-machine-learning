// "Still driving: 143 / 200" chip on the game canvas, plus a "Show alive count" toggle (remembered).
//
// AliveChip.init({
//   label: "Still driving",                 // what "alive" means, in kid words
//   count: () => [alive, total] | null,     // null hides the chip (you're driving, replaying a checkpoint…)
//   corner: "road",                         // optional: car page puts the chip over the road view
//   toggleHost: ".tab-body[data-t=babies]", // optional: where to put the toggle if no "Show the babies" control exists
// })
// AliveChip.moving(getXs, minMove) → a count() helper for games where nobody dies (walkers):
//   counts creatures whose x moved more than minMove px in the last half second.
(function () {
  const css = `
  .alive-chip { position: absolute; right: 16px; top: 16px; z-index: 6; min-width: 150px; padding: 8px 12px 9px; border-radius: 14px;
    background: color-mix(in srgb, var(--card) 92%, transparent); border: 2px solid var(--line); box-shadow: var(--shadow-sm);
    font-weight: 800; font-size: 0.82rem; color: var(--ink-2); pointer-events: none; transition: opacity .2s; }
  .alive-chip.off { opacity: 0; }
  .alive-chip .al-top { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
  .alive-chip .al-n { font-family: var(--font-head); font-size: 1.35rem; color: var(--ink); line-height: 1; }
  .alive-chip .al-tot { color: var(--muted); }
  .alive-chip .al-bar { margin-top: 6px; height: 7px; border-radius: 999px; background: var(--bg-2); overflow: hidden; }
  .alive-chip .al-bar i { display: block; height: 100%; width: 100%; border-radius: 999px; background: var(--good); transition: width .25s, background .25s; }
  .alive-toggle { display: flex; gap: 10px; align-items: center; font-weight: 800; font-size: .9rem; cursor: pointer; }
  .alive-toggle input { width: 18px; height: 18px; accent-color: var(--accent); }`;

  const KEY = "aliveChip";
  function init(o) {
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    const box = document.querySelector(".canvas-box");
    if (!box) return;
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    const chip = document.createElement("div");
    chip.className = "alive-chip off";
    chip.innerHTML = `<div class="al-top"><span class="al-n">0</span><span class="al-tot">/ 0</span></div>
      <div class="al-lbl">${o.label}</div><div class="al-bar"><i></i></div>`;
    if (o.corner === "road") { chip.style.right = "auto"; chip.style.left = "26px"; chip.style.top = "58px"; } // car: over the road view, clear of the brain labels
    box.appendChild(chip);
    const n = chip.querySelector(".al-n"), tot = chip.querySelector(".al-tot"), bar = chip.querySelector(".al-bar i");

    let on = ML.store.get(KEY, true) !== false;
    const label = document.createElement("label");
    label.className = "alive-toggle";
    label.innerHTML = `<input type="checkbox" ${on ? "checked" : ""}> Show alive count`;
    const input = label.querySelector("input");
    input.addEventListener("change", () => { on = input.checked; ML.store.set(KEY, on); tick(); });

    const babies = document.querySelector(".babies-toggle") || (document.getElementById("babies") && (document.getElementById("babies").closest("label") || document.getElementById("babies")));
    const host = babies || (o.toggleHost && document.querySelector(o.toggleHost)) || document.querySelector(".panel.left .card, .panel.left");
    if (babies) babies.insertAdjacentElement("afterend", label); else if (host) host.appendChild(label);

    function tick() {
      let c = null;
      try { c = o.count(); } catch (e) { c = null; }
      if (!on || !c || !c[1]) { chip.classList.add("off"); return; }
      chip.classList.remove("off");
      n.textContent = c[0];
      tot.textContent = "/ " + c[1];
      const f = c[0] / c[1];
      bar.style.width = (f * 100).toFixed(0) + "%";
      bar.style.background = f > 0.5 ? "var(--good)" : f > 0.2 ? "var(--warn)" : "var(--bad)";
    }
    setInterval(tick, 150);
    tick();
  }

  function moving(getXs, minMove = 3) {
    let prev = null, last = performance.now(), cnt = [0, 0];
    return () => {
      const xs = getXs();
      if (!xs || !xs.length) { prev = null; return null; }
      const now = performance.now();
      if (!prev || prev.length !== xs.length) { prev = xs.slice(); last = now; cnt = [xs.length, xs.length]; return cnt; }
      if (now - last > 500) {
        let m = 0;
        for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - prev[i]) > minMove) m++;
        prev = xs.slice(); last = now; cnt = [m, xs.length];
      }
      return cnt;
    };
  }

  window.AliveChip = { init, moving };
})();
