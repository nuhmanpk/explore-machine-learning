// Shared helpers + page chrome (top bar, mascot, theme, next/prev links).
// Load after catalog.js. Exposes window.ML.
(function () {
  const BASE = (document.currentScript && document.currentScript.src.replace(/js\/common\.js.*$/, "")) || "./";

  // ---------- small math helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  let spare = null;
  function randn() {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
  // Deterministic RNG (mulberry32) — same seed, same numbers.
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // ---------- icons (24×24 line icons, stroke = currentColor) ----------
  const ICONS = {
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    "arrow-down": '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    "arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    play: '<path d="M6 3.8v16.4a.8.8 0 0 0 1.2.7l13-8.2a.8.8 0 0 0 0-1.4l-13-8.2A.8.8 0 0 0 6 3.8Z"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    step: '<path d="M5 4.8v14.4a.8.8 0 0 0 1.2.7l10-7.2a.8.8 0 0 0 0-1.4l-10-7.2A.8.8 0 0 0 5 4.8Z"/><path d="M20 5v14"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    teacher: '<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    magnet: '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"/><path d="m5 8 4 4"/><path d="m12 15 4 4"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>',
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
    tv: '<rect width="20" height="15" x="2" y="7" rx="2"/><path d="m17 2-5 5-5-5"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
    apple: '<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    flask: '<path d="M10 2v7.53a2 2 0 0 1-.21.9L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.07-10.13a2 2 0 0 1-.21-.9V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    gamepad: '<path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
    dice: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M16 8h.01M8 8h.01M8 16h.01M16 16h.01M12 12h.01"/>',
    map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    // custom
    network: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="12" r="2.5"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M6.6 7.3 10 10.3M6.6 16.7l3.4-3M14 10.3l3.4-3M14 13.7l3.4 3"/>',
    groups: '<circle cx="7" cy="8" r="4.5"/><circle cx="17" cy="8" r="4.5"/><circle cx="12" cy="17" r="4.5"/><path d="M6 7h.01M8 9h.01M16 7h.01M18 9h.01M11 17h.01M13 16h.01"/>',
    noise: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7h2v2H7zM13 7h2v2h-2zM10 10h2v2h-2zM16 10h2v2h-2zM7 13h2v2H7zM13 13h2v2h-2zM10 16h2v2h-2z" fill="currentColor" stroke="none"/>',
    maze: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h6M15 3v6M9 15h12M9 9v6M15 15v6"/>',
    candy: '<circle cx="12" cy="12" r="4"/><path d="M8.5 10 3.5 7v10l5-3M15.5 10l5-3v10l-5-3"/>',
    slot: '<rect x="2" y="5" width="16" height="15" rx="2"/><path d="M6 9v7M10 9v7M14 9v7"/><circle cx="21" cy="5" r="1.5"/><path d="M21 6.5V13h-3"/>',
    linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 3.5c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 10c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
    kaggle: '<path d="M7 3v18"/><path d="M17.5 4 9 12.5"/><path d="m11 11 7 9.5"/>',
    hf: '<circle cx="12" cy="11" r="8"/><path d="M9 9.5h.01M15 9.5h.01"/><path d="M8.5 13a4 4 0 0 0 7 0"/><path d="M5 17.5 3.5 21l3.5-1M19 17.5l1.5 3.5-3.5-1"/>',
    wave: '<path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 10v4M22 12h0"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>',
    boat: '<path d="M2 17l2 4h16l2-4z"/><path d="M12 3v14"/><path d="M12 4l7 10h-7"/><path d="M12 7 7 14h5"/>',
    fish: '<path d="M6.5 12c3-5 9-6 13 0-4 6-10 5-13 0Z"/><path d="M6.5 12 2 8v8z"/><path d="M16 11h.01"/>',
    rocket: '<path d="M12 2c3 2 5 6 5 10l-2 4H9l-2-4c0-4 2-8 5-10Z"/><circle cx="12" cy="9" r="2"/><path d="M9 16l-3 3 1-5M15 16l3 3-1-5M10 20l2 2 2-2"/>',
    footprints: '<path d="M6 16v-2c0-3 0-5 2-6s3 1 3 3-1 3-1 5"/><path d="M6 20h4v-3H6z"/><path d="M18 12v-2c0-3 0-5-2-6s-3 1-3 3 1 3 1 5"/><path d="M14 16h4v-3h-4z"/>',
    bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M12 6V3M9 3l1.5 3M15 3l-1.5 3M8 11H3M16 11h5M8 16l-4 2M16 16l4 2M8 9 4 7M16 9l4-2"/>',
    coffee: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M7 2v3M11 2v3M15 2v3"/>',
    keyboard: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',
    robot: '<rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4"/><circle cx="12" cy="3" r="1"/><path d="M9 12h.01M15 12h.01M10 15.5h4"/>',
  };
  function icon(name, cls = "") {
    const body = ICONS[name] || ICONS.sparkles;
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }
  // Swap every <i data-icon="name"></i> for its SVG.
  function hydrateIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      el.outerHTML = icon(el.dataset.icon, el.className || "");
    });
  }

  // Whole steps to run this frame for a possibly fractional speed (0.5 = one step every other frame).
  // Integer speeds behave exactly as before. Pass a key when a page keeps several accumulators.
  const _acc = {};
  function ticks(speed, key = "_") {
    _acc[key] = (_acc[key] || 0) + speed;
    const n = Math.floor(_acc[key]);
    _acc[key] -= n;
    return n;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function cssVar(name, el = document.body) {
    return getComputedStyle(el).getPropertyValue(name).trim();
  }

  // ---------- storage (never trust it to exist) ----------
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem("exploreml:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("exploreml:" + k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- progress (lessons marked done, kept in localStorage) ----------
  const progress = {
    _set() { const a = store.get("done", []); return new Set(Array.isArray(a) ? a : []); },
    isDone(id) { return this._set().has(id); },
    set(id, on) { const s = this._set(); if (on) s.add(id); else s.delete(id); store.set("done", [...s]); },
    reset() { store.set("done", []); },
    // { done, total } for a chapter (a CATALOG entry) or the whole course (no argument).
    count(t) {
      const s = this._set();
      const ids = (t ? [t] : window.CATALOG).flatMap((c) => c.demos.map((d) => d.id));
      return { done: ids.filter((id) => s.has(id)).length, total: ids.length };
    },
    // Accessible bar + words ("3 of 7 done"); never colour alone.
    bar(label, done, total) {
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `<div class="prog" data-complete="${total > 0 && done === total}"><div class="prog-bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-valuetext="${done} of ${total} done"><i style="width:${pct}%"></i></div><span class="prog-txt">${done} of ${total} done</span></div>`;
    },
    badge(id) { return progress.isDone(id) ? `<span class="done-badge" title="You finished this lesson">${icon("check")}<span>Done</span></span>` : ""; },
    resetLink() {
      return `<button type="button" class="reset-link" data-reset-progress>Reset my progress</button>`;
    },
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest("[data-reset-progress]")) return;
    if (confirm("Clear all your finished lessons on this device? This cannot be undone.")) { progress.reset(); location.reload(); }
  });

  // "Mark as done" button on a lesson page, plus auto-complete when every challenge is ticked.
  function buildDoneButton() {
    const host = document.getElementById("next-nav");
    const id = document.body.dataset.demo;
    if (!host || !id || !findDemo(id)) return;
    const wrap = document.createElement("div");
    wrap.className = "done-row";
    wrap.innerHTML = `<button type="button" class="btn done-btn" aria-pressed="false"></button>${progress.resetLink()}`;
    host.parentNode.insertBefore(wrap, host);
    const btn = wrap.firstChild;
    const paint = () => {
      const on = progress.isDone(id);
      btn.setAttribute("aria-pressed", on);
      btn.classList.toggle("on", on);
      btn.innerHTML = on ? `${icon("check")} Done! Tap to undo` : `${icon("flag")} Mark as done`;
    };
    paint();
    btn.addEventListener("click", () => {
      const on = !progress.isDone(id);
      progress.set(id, on);
      paint();
      if (on) { toast("Lesson complete! Great job."); confetti(40); }
    });
    const check = () => {
      const c = document.querySelectorAll(".chal");
      if (c.length && document.querySelectorAll(".chal.done").length === c.length && !progress.isDone(id)) {
        progress.set(id, true); paint(); toast("All challenges done. Lesson complete!");
      }
    };
    const mo = new MutationObserver(check);
    document.querySelectorAll(".chal").forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ["class"] }));
    check();
  }

  // ---------- theme + preferences ----------
  // theme: "light" | "dark" | "auto" (follow the device). text: "normal" | "large" | "xl". motion: "auto" | "reduce".
  const sysDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const realMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
  const prefs = {
    get theme() { return store.get("theme") || "light"; },
    get text() { return store.get("text") || "normal"; },
    get motion() { return store.get("motion") || "auto"; },
    // words: "on" | "off". Dotted-underline word helpers (glossary popovers) on lessons and chapter pages.
    get words() { return store.get("words") === "off" ? "off" : "on"; },
  };
  function applyTheme(t) {
    const dark = t === "dark" || (t === "auto" && sysDark && sysDark.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
  function applyPrefs() {
    applyTheme(prefs.theme);
    document.documentElement.setAttribute("data-text", prefs.text);
    document.documentElement.setAttribute("data-motion", prefs.motion);
    document.documentElement.setAttribute("data-words", prefs.words);
  }
  // Lessons ask matchMedia("(prefers-reduced-motion: reduce)"); the Reduce motion setting answers yes for them too.
  if (realMatchMedia) window.matchMedia = (q) => {
    const r = realMatchMedia(q);
    if (prefs.motion === "reduce" && /prefers-reduced-motion:\s*reduce/.test(q)) return { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false };
    return r;
  };
  applyPrefs();
  if (sysDark && sysDark.addEventListener) sysDark.addEventListener("change", () => { if (prefs.theme === "auto") { applyTheme("auto"); document.dispatchEvent(new CustomEvent("themechange")); } });
  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }
  function setTheme(t) {
    store.set("theme", t);
    applyTheme(t);
    document.dispatchEvent(new CustomEvent("themechange"));
  }
  function toggleTheme() { setTheme(isDark() ? "light" : "dark"); }

  // ---------- settings dialog ----------
  function buildSettings() {
    const btn = document.getElementById("settings-btn");
    if (!btn || document.getElementById("settings-dlg")) return;
    const dlg = document.createElement("dialog");
    dlg.id = "settings-dlg"; dlg.className = "settings";
    dlg.setAttribute("aria-labelledby", "settings-title");
    const seg = (name, label, opts) => `<fieldset class="set-row"><legend>${label}</legend><div class="seg" role="radiogroup">${opts.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}"><span>${t}</span></label>`).join("")}</div></fieldset>`;
    dlg.innerHTML = `<form method="dialog" class="set-body">
      <div class="set-head"><h2 id="settings-title">${icon("settings")} Settings</h2><button class="icon-btn" value="close" aria-label="Close settings">${icon("x")}</button></div>
      ${seg("theme", "Colours", [["light", "Light"], ["dark", "Dark"], ["auto", "Same as my device"]])}
      ${seg("text", "Text size", [["normal", "Normal"], ["large", "Large"], ["xl", "Extra large"]])}
      ${seg("motion", "Movement", [["auto", "Normal"], ["reduce", "Calm (less motion)"]])}
      ${seg("words", "Show word helpers <small class=\"muted\">(tap a dotted word to see what it means)</small>", [["on", "On"], ["off", "Off"]])}
      <div class="set-row"><div class="set-lbl">Your progress</div>
        <p class="muted" id="set-prog"></p>
        <div class="btn-row"><button type="button" class="btn small" id="set-reset-prog">${icon("reset")} Reset my progress</button><button type="button" class="btn small ghost" id="set-reset-all">${icon("shuffle")} Restore default settings</button></div>
      </div>
      <p class="muted set-note">Everything is saved only on this device, in your browser.</p>
    </form>`;
    document.body.appendChild(dlg);
    const sync = () => {
      for (const k of ["theme", "text", "motion", "words"]) { const r = dlg.querySelector(`input[name="${k}"][value="${prefs[k]}"]`); if (r) r.checked = true; }
      const c = progress.count();
      dlg.querySelector("#set-prog").textContent = `${c.done} of ${c.total} lessons marked done.`;
      dlg.querySelector("#set-reset-prog").disabled = c.done === 0;
    };
    dlg.addEventListener("change", (e) => {
      const r = e.target; if (!r.name) return;
      if (r.name === "theme") { setTheme(r.value); const t = document.getElementById("theme-btn"); if (t) t.innerHTML = icon(isDark() ? "sun" : "moon"); }
      else if (r.name === "words") { store.set("words", r.value); applyPrefs(); applyWordHelpers(); }
      else { store.set(r.name, r.value); applyPrefs(); if (r.name === "motion") toast(r.value === "reduce" ? "Calm mode on. Reload a lesson to apply it fully." : "Normal movement."); }
    });
    dlg.querySelector("#set-reset-prog").addEventListener("click", () => {
      if (confirm("Clear all your finished lessons on this device? This cannot be undone.")) { progress.reset(); sync(); toast("Progress cleared."); setTimeout(() => location.reload(), 600); }
    });
    dlg.querySelector("#set-reset-all").addEventListener("click", () => {
      store.set("theme", "light"); store.set("text", "normal"); store.set("motion", "auto"); store.set("words", "on"); applyPrefs(); applyWordHelpers();
      document.dispatchEvent(new CustomEvent("themechange"));
      const t = document.getElementById("theme-btn"); if (t) t.innerHTML = icon(isDark() ? "sun" : "moon");
      sync(); toast("Settings restored.");
    });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    btn.addEventListener("click", () => { sync(); dlg.showModal(); });
  }

  // ---------- canvas ----------
  // Sizes a canvas for crisp drawing on retina screens. Logical size w×h.
  function setupCanvas(canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (!canvas.style.aspectRatio) canvas.style.aspectRatio = `${w} / ${h}`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }
  // Pointer position in the canvas' logical coordinates.
  function canvasPoint(canvas, e, w, h) {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: ((p.clientX - r.left) / r.width) * w, y: ((p.clientY - r.top) / r.height) * h };
  }

  // ---------- mascot ----------
  function roboSVG() {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      <line x1="50" y1="14" x2="50" y2="4" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>
      <circle cx="50" cy="5" r="5" fill="var(--warn)" stroke="var(--ink)" stroke-width="3"/>
      <rect x="10" y="16" width="80" height="66" rx="22" fill="var(--accent)" stroke="var(--ink)" stroke-width="4"/>
      <rect x="20" y="28" width="60" height="38" rx="14" fill="var(--card)" stroke="var(--ink)" stroke-width="3"/>
      <ellipse class="eye" cx="38" cy="45" rx="6" ry="7" fill="var(--ink)"/>
      <ellipse class="eye" cx="62" cy="45" rx="6" ry="7" fill="var(--ink)"/>
      <circle cx="40" cy="42" r="2" fill="#fff"/><circle cx="64" cy="42" r="2" fill="#fff"/>
      <rect class="mouth" x="42" y="56" width="16" height="5" rx="2.5" fill="var(--ink)"/>
      <circle cx="26" cy="58" r="4" fill="var(--diff)" opacity=".55"/><circle cx="74" cy="58" r="4" fill="var(--diff)" opacity=".55"/>
      <rect x="2" y="40" width="10" height="20" rx="5" fill="var(--accent)" stroke="var(--ink)" stroke-width="3"/>
      <rect x="88" y="40" width="10" height="20" rx="5" fill="var(--accent)" stroke="var(--ink)" stroke-width="3"/>
      <rect x="34" y="82" width="32" height="12" rx="6" fill="var(--accent)" stroke="var(--ink)" stroke-width="3"/>
    </svg>`;
  }
  let talkTimer = null;
  // Robo speaks in the bubble with id="say" (or a given element).
  function say(html, el) {
    const bubble = el || document.getElementById("say");
    if (!bubble) return;
    if (bubble.innerHTML === html) return;
    bubble.innerHTML = html;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    const robo = bubble.parentElement && bubble.parentElement.querySelector(".robo");
    if (robo) {
      robo.classList.add("talking");
      clearTimeout(talkTimer);
      talkTimer = setTimeout(() => robo.classList.remove("talking"), 1200);
    }
  }

  // ---------- toast + confetti ----------
  let toastEl, toastTimer;
  function toast(msg, ms = 2200) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.innerHTML = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
  }
  function confetti(n = 80) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["--nn", "--sup", "--unsup", "--rl", "--diff", "--vision", "--lang"].map((c) => cssVar(c));
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "confetti-piece";
      p.style.left = rand(0, 100) + "vw";
      p.style.background = colors[i % colors.length];
      document.body.appendChild(p);
      const dx = rand(-120, 120), rot = rand(-720, 720), dur = rand(1600, 3000);
      p.animate(
        [{ transform: "translate(0,0) rotate(0)" }, { transform: `translate(${dx}px, ${window.innerHeight + 40}px) rotate(${rot}deg)` }],
        { duration: dur, easing: "cubic-bezier(.2,.6,.4,1)", delay: rand(0, 300) }
      ).onfinish = () => p.remove();
    }
  }

  // ---------- slider binding ----------
  // bindRange("#mut", v => v.toFixed(2), v => state.mut = v)
  function bindRange(sel, fmt, onChange) {
    const input = typeof sel === "string" ? $(sel) : sel;
    const out = input && document.querySelector(`[data-for="${input.id}"]`);
    const update = (fire) => {
      const v = parseFloat(input.value);
      if (out) out.textContent = fmt ? fmt(v) : v;
      if (fire && onChange) onChange(v);
    };
    input.addEventListener("input", () => update(true));
    update(false);
    if (onChange) onChange(parseFloat(input.value));
    return input;
  }

  // ---------- page chrome ----------
  function buildTopbar() {
    const host = document.querySelector("header.topbar");
    if (!host) return;
    const page = document.body.dataset.page || "home";
    let crumbs = "";
    if (page === "topic") {
      const t = findTopic(new URLSearchParams(location.search).get("t")) || CATALOG[0];
      crumbs = `<span class="sep">/</span><span class="here">${icon(t.icon)} ${t.name}</span>`;
    } else if (page === "demo") {
      const f = findDemo(document.body.dataset.demo);
      if (f) {
        crumbs = `<span class="sep">/</span><a class="crumb-mid" href="${BASE}topic.html?t=${f.topic.id}">${icon(f.topic.icon)} ${f.topic.name}</a>
          <span class="sep">/</span><span class="here">${icon(f.demo.icon)} ${f.demo.name}</span>`;
      }
    } else if (page === "plans") {
      crumbs = `<span class="sep">/</span><span class="here">${icon("flag")} Learning plans</span>`;
    } else if (page === "glossary") {
      crumbs = `<span class="sep">/</span><span class="here">${icon("book")} Glossary</span>`;
    }
    host.innerHTML = `<div class="topbar-inner">
      <a class="brand" href="${BASE}index.html">Explore ML</a>
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
      <span class="spacer"></span>
      <nav class="social" aria-label="Links">
        <a class="icon-btn" href="https://github.com/nuhmanpk" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub">${icon("github")}</a>
        <a class="icon-btn" href="https://www.linkedin.com/in/nuhmanpk" target="_blank" rel="noopener" title="LinkedIn" aria-label="LinkedIn">${icon("linkedin")}</a>
        <a class="icon-btn" href="https://www.kaggle.com/nuhmanpk" target="_blank" rel="noopener" title="Kaggle" aria-label="Kaggle">${icon("kaggle")}</a>
        <a class="icon-btn sponsor" href="https://www.buymeacoffee.com/nuhmanpk" target="_blank" rel="noopener" title="Sponsor" aria-label="Sponsor this project">${icon("heart")}</a>
      </nav>
      <a class="nav-plans" href="${BASE}plans.html" title="Learning plans"${page === "plans" ? ' aria-current="page"' : ""}>${icon("flag")}<span>Plans</span></a>
      <a class="nav-plans nav-gloss" href="${BASE}glossary.html" title="Glossary: every word explained" aria-label="Glossary"${page === "glossary" ? ' aria-current="page"' : ""}>${icon("book")}<span>Glossary</span></a>
      <button class="icon-btn" id="settings-btn" title="Settings" aria-label="Open settings" aria-haspopup="dialog">${icon("settings")}</button>
      <button class="icon-btn" id="theme-btn" title="Light / dark" aria-label="Toggle light or dark theme"></button>
    </div>`;
    const tb = document.getElementById("theme-btn");
    const setIcon = () => (tb.innerHTML = icon(isDark() ? "sun" : "moon"));
    setIcon();
    tb.addEventListener("click", () => { toggleTheme(); setIcon(); });
  }

  function buildNextNav() {
    const host = document.getElementById("next-nav");
    const f = findDemo(document.body.dataset.demo);
    if (!host || !f) return;
    const all = allLessons();
    const i = all.findIndex((x) => x.d.id === f.demo.id);
    const prev = all[i - 1];
    const next = all[i + 1];
    let left = `<a href="${BASE}index.html#course"><span class="ne">${icon("map")}</span><span><small>Back to</small>The course map</span></a>`;
    if (prev) left = `<a href="${BASE}demos/${prev.d.id}.html"><span class="ne">${icon(prev.d.icon)}</span><span><small>Previous lesson</small>${prev.d.name}</span></a>`;
    let right = `<a class="right" href="${BASE}index.html#course"><span><small>You finished the course!</small>Back to the map</span><span class="ne">${icon("trophy")}</span></a>`;
    if (next && next.chapter !== f.chapter)
      right = `<a class="right" href="${BASE}topic.html?t=${next.t.id}"><span><small>Next chapter ${next.chapter}</small>${next.t.name}</span><span class="ne">${icon(next.t.icon)}</span></a>`;
    else if (next)
      right = `<a class="right" href="${BASE}demos/${next.d.id}.html"><span><small>Next lesson</small>${next.d.name}</span><span class="ne">${icon(next.d.icon)}</span></a>`;
    host.className = "next-nav";
    host.innerHTML = left + right;
  }

  // "Chapter 3 · Lesson 2" tag + a row of lesson pills for the chapter, above the title.
  function buildLessonPath() {
    const f = findDemo(document.body.dataset.demo);
    const hero = document.querySelector(".hero");
    if (!f || !hero) return;
    const t = f.topic;
    const el = document.createElement("nav");
    el.className = "lesson-path";
    el.setAttribute("aria-label", "Lessons in this chapter");
    el.innerHTML = `<a class="lp-chapter" href="${BASE}topic.html?t=${t.id}">${f.chapter === 0 ? t.name : "Chapter " + f.chapter + " · " + t.name}</a>` +
      t.demos.map((d, i) => `<a class="lp-step ${i === f.index ? "on" : ""} ${i < f.index ? "done" : ""}" href="${BASE}demos/${d.id}.html" title="${d.name}">
        <b>${f.chapter}.${i + 1}</b><span>${d.name}</span></a>`).join("");
    hero.insertBefore(el, hero.firstChild);
  }

  // "Meet the model": which model a lesson uses and how it learns, placed before "How it works".
  function buildMeetModel() {
    const id = document.body.dataset.demo;
    const m = window.MODELS && MODELS[id];
    if (!m || document.getElementById("meet-model")) return;
    const how = [...document.querySelectorAll("h2.section-title")].find((h) => /how it works/i.test(h.textContent));
    const anchor = how || document.querySelector(".steps") || document.querySelector("details.grownups");
    if (!anchor) return;
    const sec = document.createElement("section");
    sec.id = "meet-model";
    sec.innerHTML = `<h2 class="section-title">${icon("cpu")} Meet the model</h2>
      <div class="meet card">
        <div class="meet-who">
          <div class="meet-icon">${icon(m.icon || "network")}</div>
          <div><h3>${m.name}</h3><span class="chip accent" title="What grown-ups call it">${m.real}</span>
          <p>${m.kid}</p></div>
        </div>
        <div class="meet-learn">
          <div class="lbl">How it learns</div>
          <ol>${m.learn.map((s) => `<li>${s}</li>`).join("")}</ol>
        </div>
      </div>`;
    anchor.parentNode.insertBefore(sec, anchor);
  }

  function addFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset=".5" stop-color="#2f9bff"/><stop offset="1" stop-color="#ff5c9a"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><g stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M18 20l14 12M18 44l14-12M32 32l14-12M32 32l14 12"/></g><g fill="#fff"><circle cx="16" cy="19" r="6"/><circle cx="16" cy="45" r="6"/><circle cx="32" cy="32" r="7"/><circle cx="48" cy="19" r="6"/><circle cx="48" cy="45" r="6"/></g></svg>`;
    const l = document.createElement("link");
    l.rel = "icon";
    l.type = "image/svg+xml";
    l.href = "data:image/svg+xml," + encodeURIComponent(svg);
    document.head.appendChild(l);
  }

  function buildRobos() {
    $$(".robo").forEach((r) => { if (!r.innerHTML.trim()) r.innerHTML = roboSVG(); });
  }

  function buildFooter() {
    if (document.querySelector(".footer")) return;
    const f = document.createElement("footer");
    f.className = "footer";
    const links = [
      ["github", "GitHub", "https://github.com/nuhmanpk"],
      ["kaggle", "Kaggle", "https://www.kaggle.com/nuhmanpk"],
      ["hf", "Hugging Face", "https://huggingface.co/nuhmanpk"],
      ["cpu", "Buy me GPU credits", "https://www.buymeacoffee.com/nuhmanpk"],
    ];
    f.innerHTML = `<div class="footer-links">${links
      .map(([ic, name, url]) => `<a href="${url}" target="_blank" rel="noopener">${icon(ic)}<span>${name}</span></a>`)
      .join("")}</div>
      <div>Made by <a href="https://github.com/nuhmanpk" target="_blank" rel="noopener">nuhmanpk</a> for curious minds of every age · Everything runs right here in your browser</div>`;
    document.body.appendChild(f);
  }

  // =====================================================================
  // ---------- learning helpers ----------
  // 1. Word helpers: glossary terms on lessons + chapter pages get a dotted underline and a
  //    small popover (kid meaning, grown-up line, link to glossary.html#id).
  // 2. "Stuck? Ask Robo": a floating help button + side sheet (this lesson / words / shortcuts).
  // 3. Site-wide keyboard shortcuts (? t n p g Esc).
  // 4. A one-time tip pointing at the help button on the first lesson someone opens.
  // js/glossary.js (window.GLOSSARY) is loaded lazily; if it is missing, helpers stay quiet.
  // =====================================================================
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const pageKind = () => document.body.dataset.page || "home";

  // ---------- glossary loading + lookup ----------
  let glossPromise = null, gloss = null; // gloss = { list, byId, find(text), re }
  function loadGlossary() {
    if (glossPromise) return glossPromise;
    glossPromise = new Promise((resolve) => {
      const ready = () => resolve(Array.isArray(window.GLOSSARY) ? window.GLOSSARY : []);
      if (Array.isArray(window.GLOSSARY) && window.GLOSSARY.length) return ready();
      // The glossary page includes the script itself (maybe after this one): wait instead of loading it twice.
      if (document.querySelector('script[src*="glossary.js"]')) {
        if (document.readyState === "complete") return ready();
        return window.addEventListener("load", ready, { once: true });
      }
      const s = document.createElement("script");
      s.src = BASE + "js/glossary.js";
      s.async = true;
      s.onload = ready;
      s.onerror = () => resolve([]); // not written yet / offline: skip helpers silently
      document.head.appendChild(s);
    }).then((list) => (gloss = buildGlossIndex(list)));
    return glossPromise;
  }
  const normWord = (w) => String(w).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
  function buildGlossIndex(list) {
    const byId = new Map(), byWord = new Map();
    (list || []).forEach((g) => {
      if (!g || !g.id || !g.term) return;
      byId.set(g.id, g);
      [g.term, ...(g.aliases || [])].forEach((w) => { const k = normWord(w); if (k.length > 1 && !byWord.has(k)) byWord.set(k, g); });
    });
    if (!byId.size) return null;
    // Longest words first so "learning rate" wins over "learning". Letters/digits/hyphen form a word.
    const words = [...byWord.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
    let re = null;
    try { re = new RegExp(`(^|[^\\p{L}\\p{N}-])(${words.join("|")})(?![\\p{L}\\p{N}-])`, "giu"); } catch (e) { re = null; }
    const find = (text) => {
      const k = normWord(text);
      for (const c of [k, k.replace(/ies$/, "y"), k.replace(/es$/, ""), k.replace(/s$/, "")]) if (byWord.has(c)) return byWord.get(c);
      return null;
    };
    return { list, byId, byWord, find, re };
  }

  // ---------- 1. word helpers ----------
  // Where plain-text words are looked for (first occurrence per term per page), and what is never touched.
  const GLOSS_SCOPES = [".recap", "details.grownups .gu-body", ".steps", "#meet-model .meet",
    "body[data-page='topic'] .topic-hero .hero-sub", "body[data-page='topic'] .topic-hero .analogy", "body[data-page='topic'] .topic-hero #say", "body[data-page='topic'] #intro", "body[data-page='topic'] .words"].join(",");
  const GLOSS_SKIP = "a,button,input,textarea,select,option,label,code,pre,kbd,samp,summary,h1,h2,h3,h4,h5,h6,canvas,svg,script,style,dialog,[data-no-gloss],.gloss,.term,.gloss-pop";
  let glossDone = false;
  function makeGloss(el, g) {
    el.classList.add("gloss");
    el.dataset.gloss = g.id;
    if (prefs.words === "on") { el.tabIndex = 0; el.setAttribute("role", "button"); }
  }
  function annotateGlossary() {
    if (glossDone || !gloss || prefs.words !== "on") return;
    const p = pageKind();
    if (p !== "demo" && p !== "topic") return;
    glossDone = true;
    const main = document.querySelector("main") || document.body;
    // (a) every <span class="term"> whose text is a known term or alias
    main.querySelectorAll(".term").forEach((el) => {
      if (el.classList.contains("gloss") || el.closest("a,button,[data-no-gloss]")) return;
      const g = gloss.find(el.textContent);
      if (g) makeGloss(el, g);
    });
    // (b) the first plain-text mention of each term inside the kid-facing explainer blocks
    if (!gloss.re) return;
    const seen = new Set();
    main.querySelectorAll(GLOSS_SCOPES).forEach((scope) => {
      const nodes = [];
      const tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(GLOSS_SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      while (tw.nextNode()) nodes.push(tw.currentNode);
      nodes.forEach((node) => {
        const text = node.nodeValue, re = gloss.re;
        re.lastIndex = 0;
        let m, hit = null;
        while ((m = re.exec(text))) {
          const g = gloss.find(m[2]);
          if (g && !seen.has(g.id)) { hit = { g, at: m.index + m[1].length, len: m[2].length }; break; }
          if (m[0].length === 0) re.lastIndex++;
        }
        if (!hit) return; // one term per text node keeps it calm; other terms may match in later nodes
        seen.add(hit.g.id);
        const word = node.splitText(hit.at);
        word.splitText(hit.len);
        const span = document.createElement("span");
        span.textContent = word.nodeValue;
        word.parentNode.replaceChild(span, word);
        makeGloss(span, hit.g);
      });
    });
  }
  // Settings toggle: hide/show the underline and make the words (un)focusable.
  function applyWordHelpers() {
    const on = prefs.words === "on";
    if (!on) hidePop();
    document.querySelectorAll(".gloss").forEach((el) => {
      if (on) { el.tabIndex = 0; el.setAttribute("role", "button"); }
      else { el.removeAttribute("tabindex"); el.removeAttribute("role"); }
    });
    if (on && !glossDone) loadGlossary().then(annotateGlossary);
  }

  // One shared popover. role="tooltip"; the word points at it with aria-describedby while it is open.
  let pop = null, popFor = null, popPinned = false, showTimer = null, hideTimer = null;
  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.id = "gloss-pop";
    pop.className = "gloss-pop";
    pop.setAttribute("role", "tooltip");
    pop.hidden = true;
    document.body.appendChild(pop);
    pop.addEventListener("pointerenter", () => clearTimeout(hideTimer));
    pop.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !popPinned) hideSoon(); });
    pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); const t = popFor; hidePop(); if (t) t.focus(); }
      if (e.key === "Tab" && e.shiftKey && popFor) { e.preventDefault(); const t = popFor; t.focus(); }
    });
    pop.addEventListener("focusout", (e) => { if (!pop.contains(e.relatedTarget) && e.relatedTarget !== popFor) hidePop(); });
    return pop;
  }
  function showPop(el, pinned) {
    if (prefs.words !== "on" || !gloss) return;
    const g = gloss.byId.get(el.dataset.gloss);
    if (!g) return;
    clearTimeout(hideTimer); clearTimeout(showTimer);
    ensurePop();
    if (popFor && popFor !== el) { popFor.classList.remove("open"); popFor.removeAttribute("aria-describedby"); }
    popFor = el; popPinned = !!pinned;
    pop.innerHTML = `<div class="gp-term">${icon("book")} ${esc(g.term)}</div>
      <p class="gp-kid">${g.kid || ""}</p>
      ${g.grown ? `<p class="gp-grown"><b>For grown-ups:</b> ${g.grown}</p>` : ""}
      <a class="gp-more" href="${BASE}glossary.html#${encodeURIComponent(g.id)}">More in the glossary ${icon("arrow-right")}</a>`;
    pop.hidden = false;
    el.classList.add("open");
    el.setAttribute("aria-describedby", "gloss-pop");
    placePop();
  }
  function placePop() {
    if (!pop || pop.hidden || !popFor) return;
    const r = popFor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 10;
    if (r.bottom < 0 || r.top > vh) return hidePop(); // scrolled away
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const below = r.bottom + 8 + ph <= vh - m || r.top - 8 - ph < m;
    const top = below ? r.bottom + 8 : r.top - 8 - ph;
    const left = clamp(r.left + r.width / 2 - pw / 2, m, Math.max(m, vw - pw - m));
    pop.style.top = Math.round(Math.max(m, top)) + "px";
    pop.style.left = Math.round(left) + "px";
    pop.dataset.side = below ? "below" : "above";
    pop.style.setProperty("--arrow-x", Math.round(clamp(r.left + r.width / 2 - left, 16, pw - 16)) + "px");
  }
  function hidePop() {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    if (pop) pop.hidden = true;
    if (popFor) { popFor.classList.remove("open"); popFor.removeAttribute("aria-describedby"); }
    popFor = null; popPinned = false;
  }
  function hideSoon() { clearTimeout(hideTimer); hideTimer = setTimeout(hidePop, 220); }
  function bindGlossEvents() {
    const target = (e) => (e.target.closest ? e.target.closest(".gloss[role='button']") : null);
    document.addEventListener("pointerover", (e) => {
      const el = target(e);
      if (!el || e.pointerType !== "mouse" || (popPinned && popFor !== el)) return;
      clearTimeout(hideTimer); clearTimeout(showTimer);
      showTimer = setTimeout(() => showPop(el, false), 180);
    });
    document.addEventListener("pointerout", (e) => {
      const el = target(e);
      if (!el || e.pointerType !== "mouse") return;
      clearTimeout(showTimer);
      if (!popPinned && popFor === el && !(pop && pop.contains(e.relatedTarget))) hideSoon();
    });
    document.addEventListener("click", (e) => {
      const el = target(e);
      if (el) { e.preventDefault(); if (popFor === el && popPinned) hidePop(); else showPop(el, true); return; }
      if (pop && !pop.hidden && !pop.contains(e.target)) hidePop();
    });
    document.addEventListener("keydown", (e) => {
      const el = target(e);
      if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (popFor === el && popPinned) hidePop(); else showPop(el, true); return; }
      // Tab from an open word goes into its popover (to reach "More in the glossary").
      if (el && e.key === "Tab" && !e.shiftKey && popFor === el && pop && !pop.hidden) { e.preventDefault(); pop.querySelector("a").focus(); return; }
      if (e.key === "Escape" && pop && !pop.hidden) { const t = popFor; hidePop(); if (el && t) t.focus(); }
    });
    document.addEventListener("focusin", (e) => {
      const el = target(e);
      if (el && el.matches(":focus-visible")) showPop(el, false);
    });
    document.addEventListener("focusout", (e) => {
      const el = target(e);
      if (el && popFor === el && !(pop && pop.contains(e.relatedTarget))) hidePop();
    });
    let raf = 0;
    const re = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; placePop(); }); };
    window.addEventListener("scroll", re, { passive: true, capture: true });
    window.addEventListener("resize", re);
  }

  // ---------- 2. "Stuck? Ask Robo" help panel ----------
  let helpDlg = null, helpFab = null, helpTab = "page", jumpTargets = [];
  const COURSE_STEPS = [
    // [key, title, kid hint, how to find it on the page]
    ["play", "Play first", "Press the buttons and poke the game before reading anything.", () => document.querySelector("main .stage, main .canvas-box, main canvas")],
    ["watch", "Watch it learn", "Look at the live charts and the “inside” card while the robot practises.", () => findHeading(/happening inside|watch it learn|checkpoints/i)],
    ["chal", "Try the challenges", "Do one challenge at a time. Each one changes the world a little.", () => findHeading(/challenge/i)],
    ["model", "Meet the model", "See which kind of brain this is and how it learns.", () => document.getElementById("meet-model")],
    ["recap", "What happened", "Read the short recap. Can you explain it to someone?", () => findHeading(/what just happened|what happened/i)],
  ];
  function findHeading(re) {
    const h = [...document.querySelectorAll("main h2, main h3")].find((x) => re.test(x.textContent));
    if (!h) return null;
    // h2.section-title sits above its content; an h3 usually lives inside its card.
    return h.matches("h2") ? h : h.closest(".card, section") || h;
  }
  const kbdRow = (keys, what) => `<tr><td>${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(" ")}</td><td>${what}</td></tr>`;
  const plain = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

  function lessonPanelHTML(f) {
    const d = f.demo, t = f.topic;
    const chap = f.chapter === 0 ? t.name : `Chapter ${f.chapter} · Lesson ${f.index + 1}`;
    let html = `<div class="hs-lesson"><div class="hs-ic" style="--c:${t.color || "var(--accent)"}">${icon(d.icon)}</div>
      <div><small>${esc(chap)}</small><h3>${esc(d.name)}</h3><p>${d.kid || ""}</p>${d.time ? `<span class="chip accent">${icon("clock")} ${esc(d.time)}</span>` : ""}</div></div>`;
    const said = plain(document.getElementById("say"));
    if (said) html += `<div class="hs-said"><b>${icon("chat")} Robo just said</b><p>${esc(said)}</p></div>`;
    // How to play: a .howto box, or any heading/bold label that starts with "How to play".
    const how = new Set(document.querySelectorAll("main .howto"));
    document.querySelectorAll("main h2, main h3, main h4, main b, main strong").forEach((h) => {
      if (/^\s*how to play/i.test(h.textContent)) how.add(h.closest(".howto, .card, p, li") || h.parentElement);
    });
    // Game Lab pages keep their controls in a "Your turn" card.
    document.querySelectorAll("main .card h3").forEach((h) => { if (/your turn/i.test(h.textContent)) { const p = h.parentElement.querySelector("p"); if (p) how.add(p); } });
    const howTxt = [...how].map(plain).filter(Boolean);
    if (howTxt.length) html += `<h4 class="hs-h">${icon("gamepad")} How to play</h4>${howTxt.map((s) => `<p class="hs-how">${esc(s)}</p>`).join("")}`;
    // The course pattern, each a jump link when that part exists on this page.
    jumpTargets = [];
    html += `<h4 class="hs-h">${icon("map")} Your path through this lesson</h4><ol class="hs-path">`;
    COURSE_STEPS.forEach(([key, title, hint, find]) => {
      const el = find();
      if (el) { jumpTargets.push(el); html += `<li><button type="button" class="hs-jump" data-jump="${jumpTargets.length - 1}"><b>${title}</b><span>${hint}</span>${icon("arrow-down")}</button></li>`; }
      else html += `<li class="missing"><div><b>${title}</b><span>Not on this page.</span></div></li>`;
    });
    html += `</ol>`;
    // Challenges, read live: tick-style (.chal.done) and Game Lab toggle buttons inside .chal.
    const items = [], toggles = [];
    document.querySelectorAll("main .chal").forEach((c) => {
      const btns = c.querySelectorAll("button");
      if (btns.length && !c.querySelector(".tick")) btns.forEach((b) => { const n = b.cloneNode(true); n.querySelectorAll(".tag").forEach((x) => x.remove()); toggles.push({ name: plain(n), on: b.classList.contains("on") || b.getAttribute("aria-pressed") === "true" }); });
      else { const n = c.cloneNode(true); n.querySelectorAll(".tick").forEach((x) => x.remove()); items.push({ name: plain(n), done: c.classList.contains("done") }); }
    });
    if (items.length) {
      const done = items.filter((x) => x.done).length;
      html += `<h4 class="hs-h">${icon("zap")} Challenges <span class="chip">${done} of ${items.length} done</span></h4><ul class="hs-chal">${items.map((x) => `<li class="${x.done ? "done" : ""}"><span class="hs-tick" aria-hidden="true">${x.done ? icon("check") : ""}</span><span>${esc(x.name)}<span class="sr-only">${x.done ? " (done)" : " (not done yet)"}</span></span></li>`).join("")}</ul>`;
    }
    if (toggles.length) {
      html += `<h4 class="hs-h">${icon("zap")} Challenges you can switch on</h4><p class="hs-note">Make the world harder, then watch the robots adapt.</p><ul class="hs-chal">${toggles.map((x) => `<li class="${x.on ? "done" : ""}"><span class="hs-tick" aria-hidden="true">${x.on ? icon("check") : ""}</span><span>${esc(x.name)}<span class="sr-only">${x.on ? " (switched on)" : " (off)"}</span></span></li>`).join("")}</ul>`;
    }
    html += `<h4 class="hs-h">${icon("bulb")} Still stuck?</h4><ul class="hs-tips">
      <li>Press <b>Reset</b> or <b>Start again</b> and change just one thing.</li>
      <li>Read Robo's bubble at the top. It changes as you play.</li>
      <li>Tap a <span class="hs-dotted">dotted word</span> to see what it means.</li>
      <li>Open <b>For grown-ups</b> at the bottom for the real maths.</li></ul>`;
    return html;
  }
  function topicPanelHTML(t) {
    const ti = CATALOG.indexOf(t);
    const next = t.demos.find((d) => !progress.isDone(d.id)) || t.demos[0];
    const c = progress.count(t);
    return `<div class="hs-lesson"><div class="hs-ic" style="--c:${t.color || "var(--accent)"}">${icon(t.icon)}</div>
        <div><small>${ti === 0 ? "Start here" : "Chapter " + ti}</small><h3>${esc(t.name)}</h3><p>${t.kid || t.tagline || ""}</p></div></div>
      ${progress.bar("Chapter progress", c.done, c.total)}
      <a class="btn primary hs-next" href="${BASE}demos/${next.id}.html">${icon("play")} ${c.done && c.done < c.total ? "Carry on with" : "Start with"} ${esc(next.name)}</a>
      <h4 class="hs-h">${icon("map")} Lessons in this chapter</h4>
      <ol class="hs-lessons">${t.demos.map((d, i) => `<li class="${progress.isDone(d.id) ? "done" : ""}"><a href="${BASE}demos/${d.id}.html"><b>${ti}.${i + 1}</b> ${esc(d.name)}</a>${progress.isDone(d.id) ? `<span class="hs-tick">${icon("check")}<span class="sr-only">done</span></span>` : ""}</li>`).join("")}</ol>
      ${guideSteps()}`;
  }
  function guideSteps() {
    return `<h4 class="hs-h">${icon("gamepad")} How every lesson works</h4><ol class="hs-guide">
      <li><b>Play first.</b> Poke the game before you read.</li>
      <li><b>Watch it learn.</b> A robot practises and gets better.</li>
      <li><b>Challenges.</b> Change the world and see what breaks.</li>
      <li><b>Meet the model.</b> Find out which brain it was.</li>
      <li><b>What happened.</b> A short recap, plus a corner for grown-ups.</li></ol>`;
  }
  function sitePanelHTML() {
    const c = progress.count();
    const start = CATALOG[0];
    return `<div class="hs-lesson"><div class="hs-ic">${icon("map")}</div><div><small>Site guide</small><h3>Welcome to Explore ML</h3>
        <p>Short games where you watch a computer learn. No sign-up, nothing to install. Everything runs right here.</p></div></div>
      ${progress.bar("Course progress", c.done, c.total)}
      <h4 class="hs-h">${icon("flag")} Where to start</h4><ul class="hs-tips">
        <li><a href="${BASE}topic.html?t=${start.id}"><b>${esc(start.name)}</b></a>: the very first chapter. Perfect if you are new.</li>
        <li><a href="${BASE}plans.html"><b>Learning plans</b></a>: ready-made paths for kids, classes and grown-ups.</li>
        <li><a href="${BASE}index.html#course"><b>The course map</b></a>: every chapter and lesson in order.</li>
        <li><a href="${BASE}glossary.html"><b>Glossary</b></a>: every tricky word, explained simply.</li></ul>
      ${guideSteps()}
      <h4 class="hs-h">${icon("settings")} Make it comfy</h4>
      <p class="hs-note">The <b>Settings</b> button at the top changes colours, text size and movement. Your progress stays only on this device.</p>`;
  }
  function wordsPanelHTML() {
    const p = pageKind();
    const f = p === "demo" ? findDemo(document.body.dataset.demo) : null;
    const t = f ? f.topic : p === "topic" ? findTopic(new URLSearchParams(location.search).get("t")) || CATALOG[0] : null;
    const more = (g) => (g ? ` <a class="hs-more" href="${BASE}glossary.html#${encodeURIComponent(g.id)}" aria-label="More about ${esc(g.term)} in the glossary">${icon("book")}</a>` : "");
    let html = "";
    if (t && t.words && t.words.length) {
      html += `<h4 class="hs-h">${icon("book")} Words for “${esc(t.name)}”</h4><dl class="hs-words">${t.words.map(([w, d]) => `<div><dt>${esc(w)}${more(gloss && gloss.find(w))}</dt><dd>${d}</dd></div>`).join("")}</dl>`;
    }
    if (gloss) {
      const ids = [...new Set([...document.querySelectorAll("main .gloss[data-gloss]")].map((el) => el.dataset.gloss))];
      const shown = new Set(((t && t.words) || []).map(([w]) => { const g = gloss.find(w); return g && g.id; }));
      const list = ids.filter((id) => !shown.has(id)).map((id) => gloss.byId.get(id)).filter(Boolean).sort((a, b) => a.term.localeCompare(b.term));
      if (list.length) html += `<h4 class="hs-h">${icon("search")} Words on this page</h4><dl class="hs-words">${list.map((g) => `<div><dt><a href="${BASE}glossary.html#${encodeURIComponent(g.id)}">${esc(g.term)}</a></dt><dd>${g.kid || ""}</dd></div>`).join("")}</dl>`;
      if (!t) {
        // Home, plans, glossary: a word of the day (same word all day, changes tomorrow).
        const day = Math.floor(Date.now() / 864e5), g = gloss.list.filter((x) => x && x.id)[day % gloss.list.length];
        if (g) html += `<h4 class="hs-h">${icon("star")} Word of the day</h4><dl class="hs-words"><div><dt><a href="${BASE}glossary.html#${encodeURIComponent(g.id)}">${esc(g.term)}</a></dt><dd>${g.kid || ""}</dd></div></dl>`;
      }
    }
    if (!html) html = `<p class="hs-note">No special words here. Every word in the course lives in the glossary.</p>`;
    return html + `<p class="hs-note">${prefs.words === "on" ? "Tip: tap any dotted word on a lesson to see what it means." : "Word helpers are switched off. Turn them on in Settings."}</p>
      <a class="btn small" href="${BASE}glossary.html">${icon("book")} Open the glossary</a>`;
  }
  function shortcutsPanelHTML() {
    return `<table class="hs-keys"><tbody>
      ${kbdRow(["?"], "Open or close this help")}
      ${kbdRow(["t"], "Switch light / dark colours")}
      ${kbdRow(["n"], "Next lesson")}
      ${kbdRow(["p"], "Previous lesson")}
      ${kbdRow(["g"], "Go to the glossary")}
      ${kbdRow(["Esc"], "Close a popup")}
      ${kbdRow(["Tab"], "Move between buttons; <kbd>Enter</kbd> presses one")}
      </tbody></table>
      <p class="hs-note">Games keep their own keys (arrows, space, letters). While you are playing a game, or typing in a box, these shortcuts step aside so they never get in the way.</p>`;
  }
  function renderHelp() {
    const p = pageKind();
    const f = p === "demo" ? findDemo(document.body.dataset.demo) : null;
    const t = p === "topic" ? findTopic(new URLSearchParams(location.search).get("t")) || CATALOG[0] : null;
    const label = f ? "This lesson" : t ? "This chapter" : "Site guide";
    helpDlg.querySelector('[data-tab="page"] span').textContent = label;
    helpDlg.querySelector("#hs-p-page").innerHTML = f ? lessonPanelHTML(f) : t ? topicPanelHTML(t) : sitePanelHTML();
    helpDlg.querySelector("#hs-p-words").innerHTML = wordsPanelHTML();
    helpDlg.querySelector("#hs-p-keys").innerHTML = shortcutsPanelHTML();
  }
  function selectTab(name, focus) {
    helpTab = name;
    helpDlg.querySelectorAll("[role=tab]").forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    helpDlg.querySelectorAll("[role=tabpanel]").forEach((pn) => (pn.hidden = pn.id !== "hs-p-" + name));
    if (name === "live") live.open();
  }

  // ---------- Live room: wave at everyone on the site ----------
  // Works on a static host (GitHub Pages): messages travel through the free public relay ntfy.sh,
  // received over a WebSocket and sent with a plain HTTPS POST. Nobody can type. The relay is public,
  // so every incoming payload is checked strictly: only numbers are accepted (which message, which
  // nickname), and the words are always taken from the lists below. Any other text is thrown away.
  const live = (() => {
    const RELAY = "ntfy.sh", TOPIC = "explore-ml-live-room-v1-7f3a9c";
    const MESSAGES = ["👋 Hello everyone!", "🤖 Robo is learning so fast!", "🎉 I finished a lesson!", "🏆 I beat a challenge!", "🤔 This one is tricky…",
      "💡 Ooh, now I get it!", "🐢 Slow and steady wins.", "🚀 Trying the hard mode!", "❤️ I love this site!", "🌙 Good night, learners!"];
    const COLOURS = ["Sunny", "Rosy", "Minty", "Sky", "Lemon", "Berry", "Coral", "Lilac", "Mossy", "Cocoa"];
    const ANIMALS = ["Otter", "Panda", "Fox", "Koala", "Penguin", "Owl", "Tiger", "Dolphin", "Hedgehog", "Llama", "Turtle", "Bunny"];
    const COOLDOWN = 5000, BEAT = 30000, ALIVE = 75000;
    const ri = (n) => Math.floor(Math.random() * n);
    const me = { u: Math.random().toString(36).slice(2, 10), n: [ri(COLOURS.length), ri(ANIMALS.length)] };
    const nameOf = (n) => COLOURS[n[0]] + " " + ANIMALS[n[1]];
    let ws = null, state = "idle", retry = 0, timer = 0, beatTimer = 0, until = 0, openedAt = 0, popEl = null, popTimer = 0, actx = null;
    const SOUND_KEY = "ml-live-sound";
    const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { return true; } };
    // Soft two-note chime made with Web Audio (no sound file). Browsers only allow audio after the
    // visitor has clicked or pressed a key, so the audio context is unlocked on the first interaction.
    const unlock = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {} };
    ["pointerdown", "keydown"].forEach((t) => document.addEventListener(t, unlock, { once: true, capture: true }));
    function chime() {
      if (!soundOn() || !actx || actx.state !== "running") return;
      const t0 = actx.currentTime;
      [[880, 0], [1318.5, 0.12]].forEach(([f, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.6);
        o.connect(g).connect(actx.destination); o.start(t0 + d); o.stop(t0 + d + 0.65);
      });
    }
    function hidePopover() { clearTimeout(popTimer); if (popEl) { popEl.remove(); popEl = null; } }
    // A little speech bubble above Robo's button when someone else waves.
    function popover(m) {
      if (!helpFab || (helpDlg && helpDlg.open && helpTab === "live")) return;
      hidePopover(); dismissTip();
      popEl = document.createElement("div");
      popEl.className = "help-tip live-pop" + (helpFab.classList.contains("at-left") ? " at-left" : "");
      popEl.setAttribute("role", "status");
      popEl.innerHTML = `<button type="button" class="lp-body"><small>${icon("chat")} ${nameOf(m.n)} says</small><span>${MESSAGES[m.i]}</span></button><button type="button" class="icon-btn" aria-label="Dismiss">${icon("x")}</button>`;
      popEl.querySelector(".lp-body").addEventListener("click", () => { hidePopover(); openHelp("live"); });
      popEl.querySelector(".icon-btn").addEventListener("click", hidePopover);
      document.body.appendChild(popEl);
      popTimer = setTimeout(hidePopover, 7000);
    }
    const feed = [], seen = new Map(), lastFrom = new Map(), ids = new Set();
    const isIdx = (v, len) => Number.isInteger(v) && v >= 0 && v < len;
    // Returns a clean {k, u, n, i} or null. Nothing from the wire is ever shown as text.
    function clean(raw) {
      let m; try { m = JSON.parse(raw); } catch (e) { return null; }
      if (!m || (m.k !== "m" && m.k !== "p")) return null;
      if (typeof m.u !== "string" || !/^[a-z0-9]{4,12}$/.test(m.u)) return null;
      if (!Array.isArray(m.n) || !isIdx(m.n[0], COLOURS.length) || !isIdx(m.n[1], ANIMALS.length)) return null;
      if (m.k === "m" && !isIdx(m.i, MESSAGES.length)) return null;
      return { k: m.k, u: m.u, n: [m.n[0], m.n[1]], i: m.i };
    }
    const online = () => { const now = Date.now(); let n = 0; seen.forEach((t) => { if (now - t < ALIVE) n++; }); return Math.max(1, n); };
    const panel = () => helpDlg && helpDlg.querySelector("#hs-p-live");
    const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 10 ? "just now" : s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago"; };
    function render() {
      const p = panel(); if (!p || p.hidden) return;
      if (state === "off") { p.innerHTML = `<p class="hs-note">The live room needs a newer browser.</p>`; return; }
      if (state !== "on") { p.innerHTML = `<p class="hs-note">${state === "down" ? "Can't reach the live room right now. Trying again…" : "Connecting to the live room…"}</p>`; return; }
      const wait = Math.max(0, until - Date.now()), n = online();
      p.innerHTML = `<div class="lv-top"><span class="lv-dot" aria-hidden="true"></span><b>${n}</b>&nbsp;${n === 1 ? "learner" : "learners"} here right now · you are <b>${nameOf(me.n)}</b></div>
        <ol class="lv-feed" aria-live="polite" aria-label="Messages from everyone">${feed.length ? feed.slice().reverse().map((m) => `<li><b>${nameOf(m.n)}${m.u === me.u ? " (you)" : ""}</b><span>${MESSAGES[m.i]}</span><small>${ago(m.t)}</small></li>`).join("") : `<li class="lv-empty">No messages yet. Say hi!</li>`}</ol>
        <h4 class="hs-h">Send a wave to everyone</h4>
        <div class="lv-opts">${MESSAGES.map((m, i) => `<button type="button" class="chip" data-say="${i}"${wait ? " disabled" : ""}>${m}</button>`).join("")}</div>
        <p class="hs-note">${wait ? `Wait ${Math.ceil(wait / 1000)}s before the next one.` : "Pick a message. To keep everyone safe there is no typing, only these."}</p>
        <button type="button" class="btn small ghost" data-live-sound>${soundOn() ? "🔔 Chime on" : "🔕 Chime off"}</button>`;
    }
    function onEvent(ev) {
      if (!ev || ev.event !== "message" || typeof ev.message !== "string" || ev.message.length > 200) return;
      if (ev.id && ids.has(ev.id)) return; if (ev.id) ids.add(ev.id);
      const m = clean(ev.message); if (!m) return;
      const t = Math.min(Date.now(), (+ev.time || 0) * 1000 || Date.now());
      seen.set(m.u, Math.max(seen.get(m.u) || 0, t));
      if (m.k === "m") {
        if (t - (lastFrom.get(m.u) || 0) < COOLDOWN - 500) return; // ignore anyone spamming faster than the UI allows
        lastFrom.set(m.u, t);
        feed.push({ u: m.u, n: m.n, i: m.i, t }); feed.sort((a, b) => a.t - b.t); if (feed.length > 20) feed.shift();
        // only new waves from other people pop up; the replayed history on connect stays quiet
        if (m.u !== me.u && openedAt && t >= openedAt - 2000) { popover(m); chime(); }
      }
      render();
    }
    function post(obj) {
      return fetch(`https://${RELAY}/${TOPIC}`, { method: "POST", body: JSON.stringify(Object.assign({ u: me.u, n: me.n }, obj)) }).catch(() => {});
    }
    function connect() {
      if (!("WebSocket" in window) || !window.fetch) { state = "off"; render(); return; }
      state = state === "down" ? "down" : "connecting"; render();
      try { ws = new WebSocket(`wss://${RELAY}/${TOPIC}/ws?since=30m`); } catch (e) { state = "down"; return; }
      ws.onopen = () => {
        retry = 0; state = "on"; openedAt = Date.now(); seen.set(me.u, Date.now()); render();
        post({ k: "p" }); clearInterval(beatTimer); beatTimer = setInterval(() => { if (!document.hidden) post({ k: "p" }); }, BEAT);
      };
      ws.onmessage = (e) => { let ev; try { ev = JSON.parse(e.data); } catch (x) { return; } onEvent(ev); };
      ws.onclose = () => { ws = null; clearInterval(beatTimer); state = "down"; render(); clearTimeout(timer); timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++)); };
    }
    document.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("[data-live-sound]")) {
        try { localStorage.setItem(SOUND_KEY, soundOn() ? "off" : "on"); } catch (x) {}
        unlock(); render(); if (soundOn()) setTimeout(chime, 30); return;
      }
      const b = e.target.closest && e.target.closest("#hs-p-live [data-say]");
      if (!b || state !== "on" || Date.now() < until) return;
      const i = +b.dataset.say; if (!isIdx(i, MESSAGES.length)) return;
      post({ k: "m", i }); until = Date.now() + COOLDOWN; render();
      setTimeout(render, COOLDOWN + 50);
    });
    setInterval(() => { if (helpDlg && helpDlg.open && helpTab === "live") render(); }, 10000);
    return { open() { hidePopover(); if (state === "idle") connect(); else render(); }, start() { if (state === "idle") connect(); } };
  })();
  function buildHelp() {
    if (document.getElementById("help-dlg")) return;
    helpFab = document.createElement("button");
    helpFab.type = "button";
    helpFab.id = "help-fab";
    helpFab.className = "help-fab"; // home has Robo's chat bottom-right
    helpFab.setAttribute("aria-haspopup", "dialog");
    helpFab.setAttribute("aria-controls", "help-dlg");
    helpFab.setAttribute("aria-keyshortcuts", "Shift+?");
    helpFab.title = "Stuck? Ask Robo (press ?)";
    helpFab.innerHTML = `<span class="hf-robo">${roboSVG()}</span><span class="hf-q" aria-hidden="true">?</span><span class="sr-only">Stuck? Ask Robo for help</span>`;
    document.body.appendChild(helpFab);

    helpDlg = document.createElement("dialog");
    helpDlg.id = "help-dlg";
    helpDlg.className = "help-sheet";
    helpDlg.setAttribute("aria-labelledby", "help-title");
    const tab = (name, ic, text) => `<button type="button" role="tab" id="hs-t-${name}" data-tab="${name}" aria-controls="hs-p-${name}">${icon(ic)}<span>${text}</span></button>`;
    helpDlg.innerHTML = `<div class="hs-head"><div class="robo">${roboSVG()}</div><div class="hs-title"><h2 id="help-title">Stuck? Ask Robo</h2><small>Hints, words and shortcuts</small></div>
        <button type="button" class="icon-btn" data-help-close aria-label="Close help">${icon("x")}</button></div>
      <div class="hs-tabs" role="tablist" aria-label="Help sections">${tab("page", "bulb", "This lesson")}${tab("words", "book", "Words to know")}${tab("keys", "keyboard", "Shortcuts")}${tab("live", "chat", "Live")}</div>
      <div class="hs-body">
        <div role="tabpanel" id="hs-p-page" aria-labelledby="hs-t-page" tabindex="0"></div>
        <div role="tabpanel" id="hs-p-words" aria-labelledby="hs-t-words" tabindex="0" hidden></div>
        <div role="tabpanel" id="hs-p-keys" aria-labelledby="hs-t-keys" tabindex="0" hidden></div>
        <div role="tabpanel" id="hs-p-live" aria-labelledby="hs-t-live" tabindex="0" hidden></div>
      </div>
      <div class="hs-foot"><a href="${BASE}glossary.html">${icon("book")} Glossary</a><a href="${BASE}plans.html">${icon("flag")} Learning plans</a><a href="${BASE}index.html#course">${icon("map")} Course map</a></div>`;
    document.body.appendChild(helpDlg);

    helpFab.addEventListener("click", () => openHelp());
    helpDlg.addEventListener("click", (e) => {
      if (e.target === helpDlg || e.target.closest("[data-help-close]")) return helpDlg.close();
      const tb = e.target.closest("[role=tab]");
      if (tb) return selectTab(tb.dataset.tab);
      const j = e.target.closest("[data-jump]");
      if (j) jumpTo(jumpTargets[+j.dataset.jump]);
    });
    helpDlg.addEventListener("keydown", (e) => {
      const tb = e.target.closest && e.target.closest("[role=tab]");
      if (!tb) return;
      const tabs = [...helpDlg.querySelectorAll("[role=tab]")], i = tabs.indexOf(tb);
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault();
      selectTab(tabs[(k + tabs.length) % tabs.length].dataset.tab, true);
    });
    helpDlg.addEventListener("close", () => { helpFab.setAttribute("aria-expanded", "false"); });
    helpFab.setAttribute("aria-expanded", "false");
    setupFabTuck();
    // join the live room quietly in the background so waves can pop up anywhere on the site
    setTimeout(() => live.start(), 1500);
  }
  function openHelp(tabName) {
    if (!helpDlg) return;
    hidePop(); dismissTip();
    const other = document.querySelector("dialog[open]:not(#help-dlg)");
    if (other) other.close();
    renderHelp();
    selectTab(tabName || helpTab);
    if (!helpDlg.open) helpDlg.showModal();
    helpFab.setAttribute("aria-expanded", "true");
    // Words need the glossary; refresh that tab once it arrives.
    if (!gloss) loadGlossary().then(() => { if (helpDlg.open) helpDlg.querySelector("#hs-p-words").innerHTML = wordsPanelHTML(); });
  }
  function toggleHelp() { if (helpDlg && helpDlg.open) helpDlg.close(); else openHelp(); }
  function jumpTo(el) {
    if (!el) return;
    helpDlg.close();
    if (el.matches("details")) el.open = true;
    el.classList.add("help-target");
    el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    if (!el.hasAttribute("tabindex") && !el.matches("a,button,input,select,textarea,canvas")) el.setAttribute("tabindex", "-1");
    try { el.focus({ preventScroll: true }); } catch (e) {}
    el.classList.remove("help-flash"); void el.offsetWidth; el.classList.add("help-flash");
    setTimeout(() => el.classList.remove("help-flash"), 1800);
  }
  // On small screens the button slides mostly off the edge while the game area fills the bottom of
  // the screen, or while someone is playing, so it never sits on top of touch controls.
  function setupFabTuck() {
    let playing = 0, overStage = false;
    const paint = () => helpFab.classList.toggle("tucked", overStage || Date.now() < playing);
    document.addEventListener("pointerdown", (e) => {
      if (e.target.closest && e.target.closest("main .stage, main canvas, main .pad, main [data-game]")) { playing = Date.now() + 4000; paint(); setTimeout(paint, 4100); }
    }, true);
    const stages = document.querySelectorAll("main .stage");
    if (!stages.length || !("IntersectionObserver" in window) || !window.matchMedia) return;
    const narrow = window.matchMedia("(max-width: 760px)");
    let io = null;
    const watch = () => {
      if (io) io.disconnect();
      overStage = false; paint();
      if (!narrow.matches) return;
      // Only the bottom 130px of the viewport counts: that is where the button lives.
      const visible = new Set();
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
        overStage = visible.size > 0; paint();
      }, { rootMargin: `-${Math.max(0, window.innerHeight - 130)}px 0px 0px 0px` });
      stages.forEach((s) => io.observe(s));
    };
    watch();
    let rt = 0;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(watch, 200); });
  }

  // ---------- 3. keyboard shortcuts ----------
  // Listens on window in the bubble phase, so lesson handlers on document run first and can claim a
  // key with preventDefault(). Single letters (t n p g) also stand aside when:
  //  - a modifier is held, or focus is in a text box / contenteditable;
  //  - focus is inside a game area (.stage, canvas, [role=application], [data-game]);
  //  - the lesson uses that letter itself. Lessons that bind letters without preventDefault are listed
  //    in KEYS_TAKEN; a page can also declare its own with <body data-keys="rps">, and any single-letter
  //    <kbd> hint or aria-keyshortcuts on the page counts as taken.
  const KEYS_TAKEN = { "ai-twenty": "yn", "audio-music": "asdfghjkl;'wetyuop", "audio-pitch": "asdfghjkwetyu", "rl-hack": "wasd", "rl-balance": "adw" };
  function keysTaken() {
    const s = new Set((KEYS_TAKEN[document.body.dataset.demo] || "") + (document.body.dataset.keys || "").toLowerCase());
    document.querySelectorAll("main kbd").forEach((k) => { const t = k.textContent.trim().toLowerCase(); if (t.length === 1) s.add(t); });
    document.querySelectorAll("main [aria-keyshortcuts]").forEach((el) => el.getAttribute("aria-keyshortcuts").toLowerCase().split(/\s+/).forEach((t) => { if (t.length === 1) s.add(t); }));
    return s;
  }
  const isTyping = (el) => !!(el && el.closest && (el.closest("input, textarea, select") || el.isContentEditable));
  const inGame = (el) => !!(el && el.closest && el.closest("main .stage, canvas, [role='application'], [data-game]"));
  function onShortcut(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.repeat) return;
    const el = document.activeElement;
    if (isTyping(e.target) || isTyping(el)) return;
    if (e.key === "?") { e.preventDefault(); toggleHelp(); return; }
    if (e.shiftKey || e.key.length !== 1) return;
    const k = e.key.toLowerCase();
    if (!"tnpg".includes(k)) return;
    const dlg = document.querySelector("dialog[open]");
    if ((dlg && dlg !== helpDlg) || inGame(el) || inGame(e.target) || keysTaken().has(k)) return;
    e.preventDefault();
    if (k === "t") { const tb = document.getElementById("theme-btn"); if (tb) tb.click(); else toggleTheme(); toast(isDark() ? "Dark colours" : "Light colours", 1200); }
    else if (k === "g") {
      if (pageKind() === "glossary") { const s = document.querySelector("main input[type=search], main input[type=text]"); if (s) s.focus(); }
      else location.href = BASE + "glossary.html";
    } else {
      const nav = document.getElementById("next-nav") || document.getElementById("chapter-nav");
      const a = nav && nav.querySelector(k === "n" ? "a.right" : "a:not(.right)");
      if (a) location.href = a.href; else toast(k === "n" ? "No next lesson on this page" : "No previous lesson on this page", 1600);
    }
  }

  // ---------- 4. first-visit tip ----------
  let tipEl = null;
  function dismissTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
  function firstVisitTip() {
    if (pageKind() !== "demo" || !helpFab || store.get("helpTipSeen")) return;
    store.set("helpTipSeen", true);
    setTimeout(() => {
      if (helpDlg.open) return;
      tipEl = document.createElement("div");
      tipEl.className = "help-tip" + (helpFab.classList.contains("at-left") ? " at-left" : "");
      tipEl.setAttribute("role", "status");
      tipEl.innerHTML = `<p><b>Stuck?</b> Tap me for hints and word helpers. You can also press <kbd>?</kbd></p><button type="button" class="icon-btn" aria-label="Got it, hide this tip">${icon("x")}</button>`;
      tipEl.querySelector("button").addEventListener("click", dismissTip);
      document.body.appendChild(tipEl);
      setTimeout(dismissTip, 12000);
    }, 1500);
  }

  function initHelpers() {
    buildHelp();
    bindGlossEvents();
    window.addEventListener("keydown", onShortcut);
    const p = pageKind();
    if ((p === "demo" || p === "topic") && prefs.words === "on") loadGlossary().then(annotateGlossary);
    firstVisitTip();
  }

  function init() {
    addFavicon();
    hydrateIcons();
    buildLessonPath();
    buildMeetModel();
    buildTopbar();
    buildSettings();
    buildRobos();
    buildNextNav();
    buildDoneButton();
    buildFooter();
    initHelpers();
    consoleHello();
  }
  // A little hello for curious developers who open DevTools. Shown once per tab.
  function consoleHello() {
    try { if (sessionStorage.getItem("ml-hello")) return; sessionStorage.setItem("ml-hello", "1"); } catch (e) {}
    const big = "font: 700 20px Fredoka, Nunito, sans-serif; color: #c9722a;";
    const txt = "font: 600 13px Nunito, sans-serif; color: inherit;";
    const code = "font: 600 12px monospace; background: rgba(201,114,42,.15); padding: 2px 6px; border-radius: 4px;";
    console.log(
      "%c🤖 Beep boop, a curious human!%c\n\n" +
      "No framework. No bundler. No build step. No npm install.\n" +
      "Just plain vanilla HTML, CSS and JavaScript, the way your browser likes it.\n" +
      "Every model on this site trains right here, in your tab, with hand-written maths.\n\n" +
      "Poke around: %cML%c is the shared toolkit, and each lesson keeps its brain in %cdemos/js/*-core.js%c.\n" +
      "Try %cML.confetti(80)%c. You've earned it.\n\n" +
      "Found a bug or want to add a lesson? Come say hi → https://github.com/nuhmanpk/explore-machine-learning",
      big, txt, code, txt, code, txt, code, txt
    );
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.ML = {
    ticks, BASE, progress, clamp, lerp, rand, randInt, randn, seeded, $, $$, cssVar, store,
    setupCanvas, canvasPoint, say, toast, confetti, bindRange, isDark, roboSVG, icon, hydrateIcons, ICONS,
    loadGlossary, openHelp,
  };
})();
