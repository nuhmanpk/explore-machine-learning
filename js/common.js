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
  };
  function applyTheme(t) {
    const dark = t === "dark" || (t === "auto" && sysDark && sysDark.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
  function applyPrefs() {
    applyTheme(prefs.theme);
    document.documentElement.setAttribute("data-text", prefs.text);
    document.documentElement.setAttribute("data-motion", prefs.motion);
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
      <div class="set-row"><div class="set-lbl">Your progress</div>
        <p class="muted" id="set-prog"></p>
        <div class="btn-row"><button type="button" class="btn small" id="set-reset-prog">${icon("reset")} Reset my progress</button><button type="button" class="btn small ghost" id="set-reset-all">${icon("shuffle")} Restore default settings</button></div>
      </div>
      <p class="muted set-note">Everything is saved only on this device, in your browser.</p>
    </form>`;
    document.body.appendChild(dlg);
    const sync = () => {
      for (const k of ["theme", "text", "motion"]) { const r = dlg.querySelector(`input[name="${k}"][value="${prefs[k]}"]`); if (r) r.checked = true; }
      const c = progress.count();
      dlg.querySelector("#set-prog").textContent = `${c.done} of ${c.total} lessons marked done.`;
      dlg.querySelector("#set-reset-prog").disabled = c.done === 0;
    };
    dlg.addEventListener("change", (e) => {
      const r = e.target; if (!r.name) return;
      if (r.name === "theme") { setTheme(r.value); const t = document.getElementById("theme-btn"); if (t) t.innerHTML = icon(isDark() ? "sun" : "moon"); }
      else { store.set(r.name, r.value); applyPrefs(); if (r.name === "motion") toast(r.value === "reduce" ? "Calm mode on. Reload a lesson to apply it fully." : "Normal movement."); }
    });
    dlg.querySelector("#set-reset-prog").addEventListener("click", () => {
      if (confirm("Clear all your finished lessons on this device? This cannot be undone.")) { progress.reset(); sync(); toast("Progress cleared."); setTimeout(() => location.reload(), 600); }
    });
    dlg.querySelector("#set-reset-all").addEventListener("click", () => {
      store.set("theme", "light"); store.set("text", "normal"); store.set("motion", "auto"); applyPrefs();
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
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.ML = {
    ticks, BASE, progress, clamp, lerp, rand, randInt, randn, seeded, $, $$, cssVar, store,
    setupCanvas, canvasPoint, say, toast, confetti, bindRange, isDark, roboSVG, icon, hydrateIcons, ICONS,
  };
})();
