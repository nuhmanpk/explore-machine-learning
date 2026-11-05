// Find the Note core: a tiny synthesiser, our own FFT, and three pitch detectors. Pure logic, runs in Node.
(function (root) {
  const SR = 16000; // analysis sample rate (Hz)
  const N = 4096; // analysis frame length (samples) -> bin width SR/N ≈ 3.9 Hz
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FMIN = 60, FMAX = 1100; // pitch search range (Hz)

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- notes ----------
  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
  const midiName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const cents = (f, ref) => 1200 * Math.log2(f / ref);
  // nearest note to a frequency, plus how many cents sharp (+) or flat (-) it is
  function describe(f) {
    if (!(f > 0)) return null;
    const m = freqToMidi(f), r = Math.round(m);
    return { midi: r, name: midiName(r), cents: (m - r) * 100, freq: f };
  }

  // ---------- timbres: relative loudness of harmonics 1, 2, 3 ... ----------
  const TIMBRES = {
    pure: { label: "Pure whistle", amps: [1] },
    flute: { label: "Flute", amps: [1, 0.35, 0.12, 0.05] },
    violin: { label: "Violin", amps: [0.55, 1, 0.75, 0.6, 0.45, 0.35, 0.25, 0.18] }, // 2nd harmonic louder than the 1st
    robot: { label: "Robot", amps: [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8, 1 / 9, 1 / 10] }, // buzzy sawtooth: every harmonic
  };

  // Build a tone. opts: { f0, amps, missing (drop harmonic 1), noise (0..1), seed, n, sr, start }
  // Noise is white Gaussian noise with std = noise * 1.5 * (RMS of the clean tone).
  function synth(opts) {
    const sr = opts.sr || SR, n = opts.n || N, f0 = opts.f0, amps = opts.amps || [1];
    const x = new Float64Array(n), t0 = opts.start || 0;
    let p2 = 0;
    for (let h = 1; h <= amps.length; h++) {
      const a = amps[h - 1];
      if (!a || (opts.missing && h === 1) || h * f0 >= sr / 2) continue;
      const w = (2 * Math.PI * h * f0) / sr, ph = 0.7 * h * h; // fixed phases, so it is repeatable
      for (let i = 0; i < n; i++) x[i] += a * Math.sin(w * (i + t0) + ph);
      p2 += a * a / 2;
    }
    if (opts.noise > 0) {
      const r = rng(opts.seed || 1), sd = opts.noise * 1.5 * Math.sqrt(p2 || 0.5);
      for (let i = 0; i < n; i++) x[i] += sd * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    }
    return x;
  }
  // A melody: notes [{midi}] each `dur` seconds, with a short gap, joined end to end.
  function synthMelody(midis, opts) {
    const sr = opts.sr || SR, dur = opts.dur || 0.5, gap = opts.gap || 0.12, per = Math.round(dur * sr), g = Math.round(gap * sr);
    const out = new Float64Array(midis.length * per);
    midis.forEach((m, k) => {
      const len = per - g, x = synth({ ...opts, f0: midiToFreq(m), n: len, sr, noise: 0, start: k * per });
      const fade = Math.round(0.01 * sr);
      for (let i = 0; i < len; i++) out[k * per + i] = x[i] * Math.min(1, i / fade, (len - 1 - i) / fade);
    });
    if (opts.noise > 0) {
      let p2 = 0; for (let i = 0; i < out.length; i++) p2 += out[i] * out[i];
      const r = rng((opts.seed || 1) + 99), sd = opts.noise * 1.5 * Math.sqrt(p2 / out.length);
      for (let i = 0; i < out.length; i++) out[i] += sd * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    }
    return out;
  }

  // ---------- Fourier ----------
  // In-place iterative radix-2 Cooley–Tukey FFT. re, im: arrays whose length is a power of two.
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { // bit-reversal permutation
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  // Slow textbook DFT, only used to check the FFT.
  function dft(xr, xi) {
    const n = xr.length, re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 0; k < n; k++) for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n, c = Math.cos(a), s = Math.sin(a);
      re[k] += xr[t] * c - (xi ? xi[t] : 0) * s; im[k] += xr[t] * s + (xi ? xi[t] : 0) * c;
    }
    return { re, im };
  }
  const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };
  const hann = (n) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  // Magnitude spectrum of a Hann-windowed frame (zero-padded to a power of two). Returns bins 0..M/2.
  function spectrum(x) {
    const M = nextPow2(x.length), re = new Float64Array(M), im = new Float64Array(M), w = hann(x.length);
    for (let i = 0; i < x.length; i++) re[i] = x[i] * w[i];
    fft(re, im);
    const mag = new Float64Array(M / 2 + 1);
    for (let k = 0; k <= M / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    return { mag, size: M };
  }
  // Fit a parabola through three points; returns the offset (-0.5..0.5) of the top.
  function parabola(a, b, c) { const d = a - 2 * b + c; return d === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)); }
  const L = (v) => Math.log(v + 1e-12);

  // (a) Biggest bar: the loudest spectrum bin in range, refined with a parabola on log magnitude.
  function peakPitch(mag, size, sr) {
    const lo = Math.ceil((FMIN * size) / sr), hi = Math.min(mag.length - 2, Math.floor((FMAX * 2.2 * size) / sr));
    let k = lo;
    for (let i = lo; i <= hi; i++) if (mag[i] > mag[k]) k = i;
    const d = parabola(L(mag[k - 1]), L(mag[k]), L(mag[k + 1]));
    return { freq: ((k + d) * sr) / size, bin: k };
  }

  // Fine tune: given a rough f0, find each harmonic's exact spot (parabola on log magnitude), divide by its
  // number, and average (louder harmonics count more). Harmonics we cannot hear are skipped.
  function harmonicFit(mag, size, sr, f0) {
    if (!(f0 > 0)) return 0;
    let mx = 0; for (let k = 1; k < mag.length; k++) if (mag[k] > mx) mx = mag[k];
    const binHz = sr / size;
    let f = f0;
    // pass 1 looks in a wide window around each h·f0, pass 2 in a narrow window around the improved guess
    for (const width of [0.08, 0.02]) {
      let num = 0, den = 0;
      for (let h = 1; h <= 8; h++) {
        const c = Math.round((h * f) / binHz), win = Math.max(2, Math.round((width * h * f) / binHz));
        if (c + win + 1 >= mag.length) break;
        let k = Math.max(1, c - win); for (let j = k; j <= c + win; j++) if (mag[j] > mag[k]) k = j;
        if (mag[k] < 0.12 * mx || k <= 1) continue; // too quiet to trust (or missing on purpose)
        const fk = (k + parabola(L(mag[k - 1]), L(mag[k]), L(mag[k + 1]))) * binHz, w = mag[k] * mag[k];
        num += (fk / h) * w; den += w;
      }
      if (den) f = num / den;
    }
    return f;
  }

  // (b) Echo test: normalised autocorrelation r(τ), computed fast with the FFT (Wiener–Khinchin).
  function autocorr(x, sr) {
    const n = x.length, minLag = Math.floor(sr / FMAX), maxLag = Math.min(n - 2, Math.ceil(sr / FMIN));
    let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
    const M = nextPow2(2 * n), re = new Float64Array(M), im = new Float64Array(M);
    for (let i = 0; i < n; i++) re[i] = x[i] - mean;
    fft(re, im);
    for (let k = 0; k < M; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; }
    fft(re, im); // power spectrum is real and symmetric, so a forward FFT works as the inverse (times M)
    const r = new Float64Array(maxLag + 2), e0 = re[0];
    for (let lag = 0; lag <= maxLag + 1; lag++) r[lag] = e0 > 0 ? (re[lag] / (n - lag)) / (e0 / n) : 0; // unbiased
    return { r, minLag, maxLag };
  }
  // Pick the shortest lag whose echo is nearly as strong as the best one (this avoids "half pitch" mistakes).
  function acfPitch(x, sr, spec) {
    const { r, minLag, maxLag } = autocorr(x, sr);
    // local peaks of r, each with its height read off a parabola (the true top often falls between two lags)
    const peaks = [];
    for (let lag = Math.max(minLag, 1); lag <= maxLag; lag++) {
      if (r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > 0) {
        const d = parabola(r[lag - 1], r[lag], r[lag + 1]);
        peaks.push({ lag: lag + d, h: r[lag] - 0.25 * (r[lag - 1] - r[lag + 1]) * d });
      }
    }
    const best = peaks.reduce((m, p) => Math.max(m, p.h), 0);
    const first = peaks.find((p) => p.h >= 0.85 * best);
    if (!first || best <= 0.05) return { freq: 0, coarse: 0, lag: 0, r, minLag, maxLag, strength: best };
    const lag = first.lag, coarse = sr / lag;
    const fine = spec ? harmonicFit(spec.mag, spec.size, sr, coarse) : 0;
    // the fine tune may only nudge the answer, never jump to another octave
    const freq = fine && Math.abs(cents(fine, coarse)) < 250 ? fine : coarse;
    return { freq, coarse, lag, r, minLag, maxLag, strength: first.h };
  }

  // (c) Harmonic product spectrum, in logs, with a floor so one missing harmonic is a penalty rather than a zero.
  // Ties between f and 2f, 3f... go to the higher one (a pure tone scores the same at f and f/2).
  function hpsPitch(mag, size, sr, H) {
    H = H || 5;
    let mx = 0; for (let k = 1; k < mag.length; k++) if (mag[k] > mx) mx = mag[k];
    if (!mx) return { freq: 0 };
    const floor = 0.2 * mx, lo = Math.ceil((FMIN * size) / sr), hi = Math.floor((FMAX * size) / sr);
    // each harmonic h of bin k may sit anywhere in h·(k ± ½), so take the loudest bin there
    const score = (k) => {
      let s = 0;
      for (let h = 1; h <= H; h++) {
        let v = 0; const a = Math.round(h * (k - 0.5)), b = Math.min(mag.length - 1, Math.round(h * (k + 0.5)));
        for (let j = a; j <= b; j++) if (mag[j] > v) v = mag[j];
        s += Math.log(v + floor);
      }
      return s;
    };
    const sc = new Float64Array(hi + 2);
    let bestK = lo;
    for (let k = lo; k <= hi; k++) { sc[k] = score(k); if (sc[k] > sc[bestK]) bestK = k; }
    let pick = bestK;
    for (let m = 2; bestK * m <= hi; m++) {
      const c = Math.round(bestK * m);
      let k = c; for (let j = c - m; j <= Math.min(hi, c + m); j++) if (sc[j] > sc[k]) k = j;
      if (sc[k] >= sc[bestK] - 0.5) pick = k;
    }
    const coarse = (pick * sr) / size, fine = harmonicFit(mag, size, sr, coarse);
    return { freq: fine && Math.abs(cents(fine, coarse)) < 250 ? fine : coarse, bin: pick };
  }

  // Everything at once for one frame.
  function analyse(x, sr) {
    sr = sr || SR;
    const spec = spectrum(x), pk = peakPitch(spec.mag, spec.size, sr), ac = acfPitch(x, sr, spec), hp = hpsPitch(spec.mag, spec.size, sr);
    let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    return { mag: spec.mag, size: spec.size, sr, rms: Math.sqrt(e / x.length), peak: pk, acf: ac, hps: hp };
  }

  // Spectrogram + echo-test pitch track for a long signal: frames of `win` samples every `hop`.
  function spectrogram(x, sr, win, hop) {
    sr = sr || SR; win = win || 1024; hop = hop || 256;
    let gmax = 0, e = 0;
    for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    const rmsAll = Math.sqrt(e / x.length), frames = [];
    for (let s = 0; s + win <= x.length; s += hop) {
      const f = x.subarray ? x.subarray(s, s + win) : x.slice(s, s + win), spec = spectrum(f);
      for (let k = 0; k < spec.mag.length; k++) if (spec.mag[k] > gmax) gmax = spec.mag[k];
      let fe = 0; for (let i = 0; i < f.length; i++) fe += f[i] * f[i];
      const rms = Math.sqrt(fe / f.length), ac = acfPitch(f, sr, spec);
      frames.push({ mag: spec.mag, rms, freq: rms > 0.5 * rmsAll && ac.strength > 0.3 ? ac.freq : 0 });
    }
    return { frames, max: gmax, win, hop, sr };
  }
  // Collapse a pitch track into notes: runs of frames with the same nearest note.
  function trackNotes(track, minRun) {
    minRun = minRun || 3;
    const notes = []; let cur = null, run = 0;
    const flush = () => { if (cur !== null && run >= minRun) notes.push(cur); }; // silence (null) separates repeated notes
    track.forEach((f) => {
      const m = f > 0 ? Math.round(freqToMidi(f)) : null;
      if (m === cur) run++; else { flush(); cur = m; run = 1; }
    });
    flush();
    return notes;
  }

  const core = { SR, N, NAMES, FMIN, FMAX, rng, midiToFreq, freqToMidi, midiName, cents, describe, TIMBRES, synth, synthMelody, fft, dft, nextPow2, hann, spectrum, peakPitch, harmonicFit, autocorr, acfPitch, hpsPitch, analyse, spectrogram, trackNotes };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.PitchCore = core;
})(typeof window !== "undefined" ? window : globalThis);
