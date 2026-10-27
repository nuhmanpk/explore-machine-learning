// How Sure Is Sure? page. Logic lives in ethics-calibrate-core.js (EthicsCalibrateCore).
(function () {
  const C = window.EthicsCalibrateCore, $ = (id) => document.getElementById(id);
  const S = { method: "raw", thr: 0.5, m: null, cal: null, test: null, preds: null, hits: {}, seed: 1 };
  const pct = (v) => Math.round(v * 100);
  const NS = "http://www.w3.org/2000/svg";

  function newData() {
    S.seed = 1 + Math.floor(Math.random() * 90000);
    S.m = C.train(C.makeFruit(S.seed, 50)); const val = C.makeFruit(S.seed + 1, 300);
    S.cal = { temp: C.fitTemperature(S.m, val), platt: C.fitPlatt(S.m, val) };
    S.test = C.makeFruit(S.seed + 2, 500); S.hits = {};
    document.querySelectorAll(".chal").forEach((e) => e.classList.remove("done"));
    update();
  }
  document.getElementById("meth").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.method = b.dataset.m; update(); });
  ML.bindRange("#thr", (v) => pct(v) + "%", (v) => { S.thr = v; if (S.m) update(); });
  $("newd").addEventListener("click", newData);

  function chart(rel) {
    const X = (v) => 30 + (v - 0.5) / 0.5 * 215, Y = (v) => 230 - v * 215;
    let h = `<line x1="30" y1="230" x2="245" y2="230" stroke="var(--line)" stroke-width="2"/><line x1="30" y1="230" x2="30" y2="15" stroke="var(--line)" stroke-width="2"/>`;
    for (const t of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) h += `<text x="${X(t)}" y="244" text-anchor="middle">${pct(t)}%</text>`;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) h += `<text x="26" y="${Y(t) + 3}" text-anchor="end">${pct(t)}%</text>`;
    h += `<line x1="${X(0.5)}" y1="${Y(0.5)}" x2="${X(1)}" y2="${Y(1)}" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/>`;
    for (const b of rel.bins) {
      if (!b.n) continue;
      const x0 = X(b.lo) + 3, w = X(b.hi) - X(b.lo) - 6, top = Y(b.acc);
      h += `<rect x="${x0}" y="${top}" width="${w}" height="${230 - top}" fill="${b.acc < b.conf - 0.05 ? "var(--bad)" : "var(--good)"}" opacity=".75"><title>${b.n} answers, said ${pct(b.conf)}% sure, right ${pct(b.acc)}%</title></rect>`;
      h += `<text x="${x0 + w / 2}" y="${Math.min(224, top + 11)}" text-anchor="middle" style="fill:#fff">${b.n}</text>`;
      h += `<circle cx="${X(b.conf)}" cy="${Y(b.conf)}" r="3" fill="var(--ink)"/>`;
    }
    $("rel").innerHTML = h;
  }
  function update() {
    S.preds = C.predict(S.m, S.cal, S.method, S.test);
    const rel = C.reliability(S.preds), ab = C.abstain(S.preds, S.thr);
    document.querySelectorAll("#meth button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === S.method));
    chart(rel);
    $("acc").textContent = pct(ab.acc) + "%"; $("cov").textContent = pct(ab.coverage) + "%"; $("wr").textContent = ab.wrongKept; $("ece").textContent = rel.ece.toFixed(2);
    $("ece").style.color = rel.ece <= 0.05 ? "var(--good)" : "var(--bad)";
    $("ans").innerHTML = S.preds.slice(0, 6).map((p) => p.conf >= S.thr
      ? `<div class="ans"><span>${p.yes ? "Ripe" : "Not ripe"}, ${pct(p.conf)}% sure</span><span class="pill ${p.right ? "ok" : "no"}">${p.right ? "right" : "wrong"}</span></div>`
      : `<div class="ans idk"><span>I don't know</span><span class="pill idk">${pct(p.conf)}% sure</span></div>`).join("");
    const cw = S.preds.filter((p) => p.conf >= 0.9 && !p.right).length, big = S.preds.filter((p) => p.conf >= 0.9).length;
    $("stmt").textContent = `Of ${big} answers where it was 90% sure or more, ${cw} were wrong (${big ? pct(cw / big) : 0}%). An honest 90% would be wrong about 10%.`;
    challenges(rel, ab, cw);
  }
  function done(k, msg) { if (S.hits[k]) return; S.hits[k] = 1; $("c-" + k).classList.add("done"); ML.toast(msg); ML.say(`<b>Challenge done!</b> ${msg}`); }
  function challenges(rel, ab, cw) {
    if (S.method === "raw" && cw >= 40) done("over", "It was loudly sure and loudly wrong, like a chatbot making up a fact.");
    if (S.method !== "raw" && rel.ece <= 0.05) done("cal", "Honest now. Its accuracy is the same, but its confidence means something.");
    if (S.method !== "raw" && ab.acc >= 0.85 && ab.coverage >= 0.3) { done("idk", "Saying \"I don't know\" on the hard ones made the rest much more reliable."); ML.confetti(40); }
    if (ab.wrongKept <= 15 && ab.coverage >= 0.15) done("safe", "Very few wrong answers get through, and it still helps on the easy ones.");
  }
  newData();
})();
