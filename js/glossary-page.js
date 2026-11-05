/* Renders glossary.html from window.GLOSSARY + window.CATALOG. */
(function () {
  const G = window.GLOSSARY || [], C = window.CATALOG || [];
  const $ = (s) => document.querySelector(s);
  const icon = (n) => (window.ML && window.ML.icon ? window.ML.icon(n) : "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const byId = new Map(G.map((g) => [g.id, g]));
  const lesson = new Map();
  C.forEach((c) => c.demos.forEach((d) => lesson.set(d.id, { demo: d, ch: c })));
  const chaptersOf = (g) => [...new Set(g.lessons.map((l) => lesson.get(l)).filter(Boolean).map((x) => x.ch.id))];
  const letterOf = (g) => { const ch = g.term[0].toUpperCase(); return /[A-Z]/.test(ch) ? ch : "#"; };

  let q = "", chapter = "";
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const matches = (g) => {
    if (chapter && !chaptersOf(g).includes(chapter)) return false;
    if (!q) return true;
    return [g.term, ...g.aliases].some((t) => norm(t).includes(q));
  };
  const hl = (text) => {
    if (!q) return esc(text);
    const i = norm(text).indexOf(q);
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  };

  function card(g) {
    const aka = g.aliases.filter((a) => a.toLowerCase() !== g.term.toLowerCase()).slice(0, 5);
    const akaHit = q && !norm(g.term).includes(q) ? g.aliases.find((a) => norm(a).includes(q)) : null;
    const lessons = g.lessons.map((l) => lesson.get(l)).filter(Boolean).map(({ demo, ch }) =>
      `<a class="chip accent" style="--c:${ch.color}" href="demos/${demo.id}.html" title="${esc(ch.name)}">${icon(demo.icon)} ${esc(demo.name)}</a>`).join("");
    const see = g.see.map((s) => byId.get(s)).filter(Boolean).map((s) => `<a class="see" href="#${s.id}">${esc(s.term)}</a>`).join(", ");
    return `<article class="gl-card" id="${g.id}" tabindex="-1">
      <h3><a href="#${g.id}">${hl(g.term)}</a></h3>
      ${aka.length ? `<p class="aka">Also: ${akaHit ? hl(akaHit) + (aka.length > 1 ? ", " : "") : ""}${esc(aka.filter((a) => a !== akaHit).join(", "))}</p>` : ""}
      <p class="kid">${esc(g.kid)}</p>
      <details><summary>For grown-ups</summary><p>${esc(g.grown)}</p></details>
      ${lessons ? `<div class="row"><b>Try it in:</b> ${lessons}</div>` : ""}
      ${see ? `<div class="row"><b>See also:</b> ${see}</div>` : ""}
    </article>`;
  }

  function render() {
    const list = G.filter(matches);
    const groups = new Map();
    list.forEach((g) => { const L = letterOf(g); if (!groups.has(L)) groups.set(L, []); groups.get(L).push(g); });
    $("#gl-list").innerHTML = list.length
      ? [...groups].map(([L, gs]) => `<h2 class="gl-letter" id="letter-${L}">${L}</h2><div class="gl-grid">${gs.map(card).join("")}</div>`).join("")
      : `<p class="gl-empty">No words match "${esc(q)}". Try a shorter word, or clear the chapter filter.</p>`;
    $("#gl-count").textContent = `${list.length} of ${G.length} words`;
    $("#gl-az").innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((L) =>
      groups.has(L) ? `<a href="#letter-${L}" aria-label="Jump to ${L}">${L}</a>` : `<span aria-hidden="true">${L}</span>`).join("");
  }

  function chips() {
    const used = new Set(G.flatMap(chaptersOf));
    const all = `<button type="button" class="chip" aria-pressed="true" data-ch="">All chapters</button>`;
    $("#gl-chips").innerHTML = all + C.filter((c) => used.has(c.id)).map((c) =>
      `<button type="button" class="chip" style="--c:${c.color}" aria-pressed="false" data-ch="${c.id}">${icon(c.icon)} ${esc(c.name)}</button>`).join("");
    $("#gl-chips").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-ch]");
      if (!b) return;
      chapter = b.dataset.ch;
      $("#gl-chips").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    });
  }

  function focusEntry(id, open) {
    let el = document.getElementById(id);
    if (!el && byId.has(id)) { q = ""; chapter = ""; $("#gl-q").value = ""; resetChips(); render(); el = document.getElementById(id); }
    if (!el || !el.classList.contains("gl-card")) return;
    document.querySelectorAll(".gl-card.hit").forEach((x) => x.classList.remove("hit"));
    void el.offsetWidth;
    el.classList.add("hit");
    if (open) el.querySelector("details").open = true;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    el.focus({ preventScroll: true });
  }
  function resetChips() { document.querySelectorAll("#gl-chips button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.ch === ""))); }

  function init() {
    if (!G.length) { $("#gl-list").innerHTML = `<p class="gl-empty">The glossary could not load.</p>`; return; }
    chips();
    render();
    let t = 0;
    $("#gl-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { q = norm(e.target.value.trim()); render(); }, 60); });
    $("#gl-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const first = document.querySelector(".gl-card"); if (first) { history.replaceState(null, "", "#" + first.id); focusEntry(first.id, false); } }
      if (e.key === "Escape") { e.target.value = ""; q = ""; render(); }
    });
    $("#gl-random").addEventListener("click", () => {
      const g = G[Math.floor(Math.random() * G.length)];
      history.replaceState(null, "", "#" + g.id);
      focusEntry(g.id, false);
      if (window.ML && window.ML.say) window.ML.say(`Ooh, <b>${esc(g.term)}</b>! ${esc(g.kid)}`);
      else { const s = $("#say"); if (s) s.innerHTML = `Ooh, <b>${esc(g.term)}</b>! ${esc(g.kid)}`; }
    });
    $("#gl-print").addEventListener("click", () => {
      q = ""; chapter = ""; $("#gl-q").value = ""; resetChips(); render();
      setTimeout(() => window.print(), 50);
    });
    window.addEventListener("hashchange", () => { const id = decodeURIComponent(location.hash.slice(1)); if (byId.has(id)) focusEntry(id, true); });
    const id = decodeURIComponent(location.hash.slice(1));
    if (byId.has(id)) setTimeout(() => focusEntry(id, true), 80);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
