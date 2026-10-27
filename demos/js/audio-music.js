// Tune Finisher — a note-level n-gram model that learns songs and continues tunes.
(function () {
  const core = window.TuneCore;
  const { NAMES, KEYS, byName, SONGS, pitch, dur, cloneCounts, predict, sample, countLast } = core;
  // ---------- notes + synth ----------
  const BEAT = 0.32; // seconds per beat

  let actx = null;
  function audio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function playNote(name, dur = 1, vol = 0.25) {
    const k = byName[name];
    if (!k) return;
    const a = audio(), t = a.currentTime;
    const f = 440 * Math.pow(2, (k.midi - 69) / 12);
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.25, dur * BEAT * 1.4));
    g.connect(a.destination);
    for (const [type, mult, v] of [["triangle", 1, 1], ["sine", 2, 0.25]]) {
      const o = a.createOscillator(), og = a.createGain();
      o.type = type; o.frequency.value = f * mult; og.gain.value = v;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur * BEAT * 1.5 + 0.1);
    }
    flashKey(name, "robo");
  }

  // ---------- songs (traditional, public domain, simplified) ----------
  // ---------- the model ----------
  // counts[k][context] = Map(next → {n, from:Set(song)})
  const S = {
    learned: [], // {name, notes}
    counts: [null, new Map(), new Map(), new Map()],
    pairs: new Map(), // "a>b" pitch pairs for the map
    notesHeard: 0,
    order: 2,
    temp: 1,
    roll: [], // {tok, who:'you'|'robo'|'song'}
    busy: false,
    ckpts: [],
    flash: null,
  };
  // ---------- piano ----------
  const piano = document.getElementById("piano");
  const KB_WHITE = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"];
  const KB_BLACK = { "C#4": "w", "D#4": "e", "F#4": "t", "G#4": "y", "A#4": "u", "C#5": "o", "D#5": "p" };
  const keyEls = {};
  const kbMap = {};
  (function buildPiano() {
    const whites = KEYS.filter((k) => !k.black);
    const ww = 100 / whites.length;
    let wi = 0;
    KEYS.forEach((k) => {
      const el = document.createElement("div");
      el.className = "key " + (k.black ? "black" : "white");
      if (k.black) {
        el.style.left = `calc(${wi * ww - ww * 0.32}%)`;
        el.style.width = ww * 0.64 + "%";
      } else {
        el.style.left = wi * ww + "%";
        el.style.width = `calc(${ww}% + 2px)`;
        const kb = KB_WHITE[wi];
        if (kb) kbMap[kb] = k.name;
        el.innerHTML = (kb ? `<span class="kb">${kb.toUpperCase()}</span>` : "") + (k.name.startsWith("C") ? k.name : "");
        wi++;
      }
      if (KB_BLACK[k.name]) { kbMap[KB_BLACK[k.name]] = k.name; el.innerHTML = `<span class="kb">${KB_BLACK[k.name].toUpperCase()}</span>`; }
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); userPlay(k.name); el.classList.add("down"); });
      const up = () => el.classList.remove("down");
      el.addEventListener("pointerup", up);
      el.addEventListener("pointerleave", up);
      piano.appendChild(el);
      keyEls[k.name] = el;
    });
  })();
  function flashKey(name, cls) {
    const el = keyEls[name];
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 220);
  }
  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.target.matches("input, textarea")) return;
    const n = kbMap[e.key.toLowerCase()];
    if (!n) return;
    e.preventDefault();
    userPlay(n);
    keyEls[n].classList.add("down");
  });
  document.addEventListener("keyup", (e) => {
    const n = kbMap[e.key.toLowerCase()];
    if (n) keyEls[n].classList.remove("down");
  });

  let lastWasSong = false;
  function userPlay(name) {
    if (S.busy) return;
    audio();
    if (lastWasSong) { S.roll = []; lastWasSong = false; }
    playNote(name, 1, 0.3);
    S.roll.push({ tok: name + ":1", who: "you" });
    if (S.roll.length > 60) S.roll.shift();
    const yours = S.roll.filter((r) => r.who === "you").length;
    if (yours === 1) ML.say(`Nice note! Play a few more, then press <b>Continue it</b> and I'll guess what comes next.`);
    drawRoll();
  }

  // ---------- drawing ----------
  const RW = 660, RH = 170;
  const roll = ML.setupCanvas(document.getElementById("roll"), RW, RH);
  const GW = 340, GH = 300;
  const graph = ML.setupCanvas(document.getElementById("graph"), GW, GH);
  let C = {};
  function readColors() {
    C = { ink: ML.cssVar("--ink"), muted: ML.cssVar("--muted"), line: ML.cssVar("--line"), accent: ML.cssVar("--accent"), card: ML.cssVar("--card"), bg2: ML.cssVar("--bg-2"), warn: ML.cssVar("--warn") };
  }
  readColors();
  document.addEventListener("themechange", () => { readColors(); drawRoll(); drawGraph(); });

  function drawRoll() {
    const ctx = roll.ctx;
    ctx.clearRect(0, 0, RW, RH);
    const lo = 60, hi = 84, rowH = (RH - 10) / (hi - lo + 1);
    for (let m = lo; m <= hi; m++) {
      if (NAMES[m % 12].includes("#")) { ctx.fillStyle = C.bg2; ctx.fillRect(0, RH - 5 - (m - lo + 1) * rowH, RW, rowH); }
    }
    const beatW = 18;
    const totalBeats = S.roll.reduce((s, r) => s + dur(r.tok), 0);
    let x = Math.min(8, RW - 8 - totalBeats * beatW);
    for (const r of S.roll) {
      const k = byName[pitch(r.tok)], w = dur(r.tok) * beatW;
      if (k) {
        const y = RH - 5 - (k.midi - lo + 1) * rowH;
        ctx.fillStyle = r.who === "you" ? C.ink : r.who === "robo" ? C.accent : C.muted;
        ctx.beginPath(); ctx.roundRect(x + 1, y, w - 2, rowH, 3); ctx.fill();
      }
      x += w;
    }
    if (!S.roll.length) {
      ctx.fillStyle = C.muted; ctx.font = "700 14px Nunito, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Notes show up here: low notes at the bottom, high at the top", RW / 2, RH / 2);
    }
  }

  // Pitch map: notes around a circle, lines = "this note came after that one".
  const MAP_NOTES = KEYS.filter((k) => k.midi <= 74).map((k) => k.name);
  function nodePos(i, n = MAP_NOTES.length) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: GW / 2 + Math.cos(a) * 118, y: GH / 2 + Math.sin(a) * 118 };
  }
  function drawGraph(pairs = S.pairs) {
    const ctx = graph.ctx;
    ctx.clearRect(0, 0, GW, GH);
    const max = Math.max(1, ...pairs.values());
    for (const [key, n] of pairs) {
      const [a, b] = key.split(">");
      const ia = MAP_NOTES.indexOf(a), ib = MAP_NOTES.indexOf(b);
      if (ia < 0 || ib < 0) continue;
      const pa = nodePos(ia), pb = nodePos(ib);
      const hot = S.flash === key;
      ctx.strokeStyle = hot ? C.warn : C.accent;
      ctx.globalAlpha = hot ? 1 : 0.2 + 0.7 * (n / max);
      ctx.lineWidth = hot ? 5 : 1 + 5 * (n / max);
      ctx.beginPath();
      if (ia === ib) { ctx.arc(pa.x + (pa.x - GW / 2) * 0.12, pa.y + (pa.y - GH / 2) * 0.12, 9, 0, Math.PI * 2); }
      else { ctx.moveTo(pa.x, pa.y); ctx.quadraticCurveTo(GW / 2 + (pa.x + pb.x - GW) * 0.2, GH / 2 + (pa.y + pb.y - GH) * 0.2, pb.x, pb.y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const used = new Set([...pairs.keys()].flatMap((k) => k.split(">")));
    MAP_NOTES.forEach((nm, i) => {
      const p = nodePos(i), on = used.has(nm);
      const black = nm.includes("#");
      ctx.fillStyle = black ? C.ink : C.card; ctx.strokeStyle = on ? C.accent : C.line; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, black ? 9 : 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (!black) { ctx.fillStyle = on ? C.ink : C.muted; ctx.font = "800 10px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.fillText(nm.replace("4", "").replace("5", "'"), p.x, p.y + 3.5); }
    });
  }

  function updateStats() {
    document.getElementById("st-songs").textContent = S.learned.length;
    document.getElementById("st-notes").textContent = S.notesHeard;
    document.getElementById("st-pat").textContent = S.counts[S.order].size;
  }

  function renderSongs() {
    const host = document.getElementById("songs");
    host.innerHTML = SONGS.map((s, i) => {
      const done = S.learned.some((l) => l.name === s.name);
      return `<div class="song ${done ? "learned" : ""}" data-i="${i}"><span class="tick">${done ? ML.icon("check") : ML.icon("music")}</span><span class="grow">${s.name}</span><button title="Listen" data-listen="${i}">${ML.icon("play")}</button></div>`;
    }).join("");
    host.querySelectorAll("[data-listen]").forEach((b) => b.addEventListener("click", () => listen(+b.dataset.listen)));
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function listen(i) {
    if (S.busy) return;
    S.busy = true;
    const s = SONGS[i];
    S.roll = [];
    lastWasSong = true;
    ML.say(`This is <b>${s.name}</b>. Hum along!`);
    for (const tok of s.notes) {
      S.roll.push({ tok, who: "song" });
      drawRoll();
      playNote(pitch(tok), dur(tok));
      await wait(dur(tok) * BEAT * 1000);
    }
    S.busy = false;
  }

  // ---------- learning (animated) ----------
  async function learnSong(song, fast) {
    S.busy = true;
    const notes = song.notes;
    const row = document.querySelector(`.song[data-i="${SONGS.indexOf(song)}"]`);
    if (row) row.classList.add("now");
    S.roll = [];
    lastWasSong = true;
    for (let i = 0; i < notes.length; i++) {
      S.roll.push({ tok: notes[i], who: song.mine ? "you" : "song" });
      // count this note after each of its last 1, 2 and 3 notes
      countLast(S.counts, notes.slice(Math.max(0, i - 3), i + 1), song.name);
      S.notesHeard++;
      if (i > 0) {
        const key = pitch(notes[i - 1]) + ">" + pitch(notes[i]);
        S.pairs.set(key, (S.pairs.get(key) || 0) + 1);
        S.flash = key;
        if (!fast && i % 2 === 0) {
          const p = predict(S.counts, notes.slice(0, i), 1);
          const e = p.list.find((c) => c.tok === notes[i]);
          document.getElementById("inside").innerHTML =
            `Heard <b>${pitch(notes[i - 1])}</b> then <b>${pitch(notes[i])}</b>. I've now seen "${pitch(notes[i - 1])} → ${pitch(notes[i])}" <b>${S.pairs.get(key)}</b> time${S.pairs.get(key) > 1 ? "s" : ""}, so that line on my note map gets thicker.` +
            (e ? ` After ${pitch(notes[i - 1])}, I'd now bet <b>${Math.round(e.p * 100)}%</b> on ${pitch(notes[i])}.` : "");
        }
      }
      drawRoll();
      drawGraph();
      updateStats();
      if (!fast) { playNote(pitch(notes[i]), dur(notes[i]), 0.18); await wait(dur(notes[i]) * BEAT * 620); }
    }
    S.flash = null;
    if (row) row.classList.remove("now");
    S.learned.push(song);
    renderSongs();
    updateStats();
    drawGraph();
    addCheckpoint();
    S.busy = false;
  }
  // Count the window's last note as following each of its 1-, 2- and 3-note contexts.
  document.getElementById("teach").addEventListener("click", async () => {
    if (S.busy) return;
    audio();
    const next = SONGS.find((s) => !S.learned.some((l) => l.name === s.name));
    if (!next) return ML.say(`I know all the songs in my book! Play me your own tune and press <b>Learn my tune</b>.`);
    ML.say(`Listening to <b>${next.name}</b>… I'm counting which note comes after which.`);
    await learnSong(next, false);
    afterLearn();
  });
  document.getElementById("teach-all").addEventListener("click", async () => {
    if (S.busy) return;
    audio();
    const left = SONGS.filter((s) => !S.learned.some((l) => l.name === s.name));
    if (!left.length) return ML.say(`Already learned them all!`);
    ML.say(`Speed-listening to ${left.length} song${left.length > 1 ? "s" : ""}!`);
    for (const s of left) { await learnSong(s, true); await wait(250); }
    afterLearn();
  });
  function afterLearn() {
    const n = S.learned.length;
    if (n === 1) ML.say(`I learned my first song! Tap the checkpoint to hear what I compose now. It probably sounds a lot like <b>${S.learned[0].name}</b>.`);
    else if (n < SONGS.length) ML.say(`${n} songs learned! My note map is filling up. Compare the checkpoints: are my tunes getting more song-like?`);
    else ML.say(`I know all ${n} songs! Now play me a few notes and press <b>Continue it</b>.`);
  }

  document.getElementById("learn-mine").addEventListener("click", async () => {
    if (S.busy) return;
    const mine = S.roll.filter((r) => r.who === "you").map((r) => r.tok);
    if (mine.length < 3) return ML.say(`Play me at least 3 notes first!`);
    const n = S.learned.filter((l) => l.mine).length + 1;
    ML.say(`Learning <b>your tune</b>! Now it's part of my memory too.`);
    await learnSong({ name: `Your tune ${n}`, notes: mine, mine: true }, false);
    ML.say(`Got it! Your tune #${n} is in my memory. Try <b>Continue it</b> starting with its first notes.`);
  });

  // ---------- composing ----------
  function renderCands(list, picked) {
    const top = list.slice(0, 5);
    document.getElementById("cands").innerHTML = top
      .map((c) => `<div class="cand ${picked && c.tok === picked ? "pick" : ""}"><span>${pitch(c.tok)}${dur(c.tok) === 2 ? " long" : ""}</span><div class="bar"><span style="width:${(c.p * 100).toFixed(0)}%"></span></div><span class="pct">${Math.round(c.p * 100)}%</span></div>`)
      .join("");
  }
  async function compose(counts, prompt, n, who = "robo") {
    const hist = prompt.slice();
    for (let i = 0; i < n; i++) {
      const pr = predict(counts, hist, S.order);
      const { c } = sample(pr.list, S.temp);
      renderCands(pr.list, c.tok);
      let why;
      if (pr.k === 0) why = `I don't know any songs yet, so every note is equally likely. I'm guessing at random!`;
      else {
        const ctxNice = pr.ctx.split(" ").map(pitch).join(" ");
        const top = pr.list.slice(0, 3).map((x) => `${pitch(x.tok)} (${x.n}×)`).join(", ");
        const src = c.from.length === 1 ? ` That pattern only happened in <b>${c.from[0]}</b>, so I'm copying it.` : c.from.length > 1 ? ` I heard it in ${c.from.length} songs.` : "";
        why = `Last note${pr.k > 1 ? "s" : ""}: <b>${ctxNice}</b>. After that I heard ${top}. I picked <b>${pitch(c.tok)}</b>.${src}`;
      }
      document.getElementById("inside").innerHTML = why;
      hist.push(c.tok);
      S.roll.push({ tok: c.tok, who });
      if (S.roll.length > 60) S.roll.shift();
      drawRoll();
      playNote(pitch(c.tok), dur(c.tok));
      await wait(dur(c.tok) * BEAT * 1000);
    }
  }

  document.getElementById("compose").addEventListener("click", async () => {
    if (S.busy) return;
    audio();
    S.busy = true;
    let prompt = S.roll.filter((r) => r.who === "you").map((r) => r.tok);
    if (!prompt.length || lastWasSong) {
      prompt = ["C4:1"];
      S.roll = [{ tok: "C4:1", who: "you" }];
      lastWasSong = false;
      ML.say(`No notes from you, so I'll start on <b>C</b>. Watch my bets!`);
    } else ML.say(S.learned.length ? `Here's how I'd continue your tune…` : `I haven't learned any songs, so this will be random. Teach me some first!`);
    await compose(S.counts, prompt, 14);
    S.busy = false;
  });
  document.getElementById("clear").addEventListener("click", () => {
    if (S.busy) return;
    S.roll = [];
    lastWasSong = false;
    drawRoll();
  });

  // ---------- checkpoints ----------
  function addCheckpoint() {
    const host = document.getElementById("ckpts");
    if (!S.ckpts.length) host.innerHTML = "";
    const c = { counts: cloneCounts(S.counts), pairs: new Map(S.pairs), songs: S.learned.length, label: S.learned[S.learned.length - 1].name };
    S.ckpts.push(c);
    const b = document.createElement("button");
    b.className = "ckpt";
    b.innerHTML = `<canvas></canvas><b>${c.songs} song${c.songs > 1 ? "s" : ""}</b>after ${c.label}`;
    host.appendChild(b);
    host.scrollLeft = host.scrollWidth;
    const cv = ML.setupCanvas(b.querySelector("canvas"), 100, 60);
    drawMiniMap(cv.ctx, c.pairs);
    b.addEventListener("click", async () => {
      if (S.busy) return;
      audio();
      document.querySelectorAll(".ckpt").forEach((x) => x.classList.toggle("on", x === b));
      S.busy = true;
      S.roll = [{ tok: "C4:1", who: "you" }];
      lastWasSong = false;
      drawGraph(c.pairs);
      ML.say(`This is me after <b>${c.songs} song${c.songs > 1 ? "s" : ""}</b>. Here's a tune I'd make back then:`);
      await compose(c.counts, ["C4:1"], 14);
      drawGraph();
      b.classList.remove("on");
      S.busy = false;
    });
  }
  function drawMiniMap(ctx, pairs) {
    ctx.clearRect(0, 0, 100, 60);
    const max = Math.max(1, ...pairs.values());
    const pos = (nm) => { const i = MAP_NOTES.indexOf(nm); const a = -Math.PI / 2 + (i / MAP_NOTES.length) * Math.PI * 2; return { x: 50 + Math.cos(a) * 24, y: 30 + Math.sin(a) * 24 }; };
    ctx.strokeStyle = C.accent;
    for (const [k, n] of pairs) {
      const [a, b] = k.split(">");
      if (MAP_NOTES.indexOf(a) < 0 || MAP_NOTES.indexOf(b) < 0 || a === b) continue;
      const pa = pos(a), pb = pos(b);
      ctx.globalAlpha = 0.25 + 0.75 * (n / max); ctx.lineWidth = 0.6 + 2.5 * (n / max);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- sliders ----------
  ML.bindRange("#order", (v) => `${v} note${v > 1 ? "s" : ""}`, (v) => { S.order = v; updateStats(); });
  ML.bindRange("#temp", (v) => v.toFixed(1), (v) => (S.temp = v));
  document.getElementById("order").addEventListener("input", () => {
    ML.say(S.order === 3 ? `Now I remember 3 notes back. My tunes will sound a lot like the real songs… maybe <b>too</b> much like them!` :
      S.order === 1 ? `Now I only remember the last note. My tunes will wander between songs.` : `I remember the last 2 notes. A nice middle!`);
  });

  renderSongs();
  drawRoll();
  drawGraph();
  updateStats();
  window.__music = S;
})();
