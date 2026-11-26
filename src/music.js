// Music and background sound for each region, made on the spot with Web Audio (no files to load).
// Music: a four-bar chord loop per region (pad, bass and a plucked tune picked from the chord), with drums added
// while racing or running hot cargo. Background: wind and birds in the mountains, a dry breeze, cicadas and a hawk in
// the desert, waves and gulls on the coast.

// note names to frequency: midi numbers, A4 = 69 = 440 Hz
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// chords are midi roots plus intervals; tune notes come from each chord's tones an octave or two up
export const STYLES = {
  mountain: { bpm: 84, chords: [[57, [0, 3, 7]], [53, [0, 4, 7]], [48, [0, 4, 7, 12]], [55, [0, 4, 7]]], lead: 'bell', pad: 0.9, swing: 0 },
  desert: { bpm: 72, chords: [[52, [0, 3, 7]], [53, [0, 4, 7]], [52, [0, 3, 7]], [50, [0, 3, 7]]], lead: 'twang', pad: 0.75, swing: 0.12 },
  speedway: { bpm: 108, chords: [[55, [0, 4, 7]], [48, [0, 4, 7]], [50, [0, 4, 7]], [55, [0, 4, 7]]], lead: 'twang', pad: 0.7, swing: 0.08 },
  coast: { bpm: 96, chords: [[50, [0, 4, 7]], [47, [0, 3, 7]], [55, [0, 4, 7]], [57, [0, 4, 7]]], lead: 'marimba', pad: 0.75, swing: 0.06 },
};

// a small repeatable random generator, so each loop plays the same tune
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// the tune for one region: for each bar, eight steps of chord-tone indexes (or -1 for a rest)
export function tuneFor(region) {
  const r = rng(region.length * 7919 + region.charCodeAt(0) * 31), bars = [];
  for (let b = 0; b < 8; b++) {
    const steps = [];
    for (let i = 0; i < 8; i++) steps.push(r() < (i % 2 ? 0.35 : 0.7) ? Math.floor(r() * 5) : -1);
    if (steps[0] < 0) steps[0] = 0;
    bars.push(steps);
  }
  return bars;
}

export function createMusic(ctx, out, buf) {
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
  const amb = ctx.createGain(); amb.gain.value = 1.6; amb.connect(out);
  let style = STYLES.mountain, region = 'mountain', tune = tuneFor('mountain'), on = true, intense = 0, next = 0, step = 0, timer = 0;

  function voice(freq, t, dur, vol, kind) {
    const o = ctx.createOscillator(), g = ctx.createGain(); let dest = bus;
    if (kind === 'twang') {           // a plucked string: bright saw through a closing filter, with a little bend
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
      f.connect(bus); dest = f; o.type = 'sawtooth'; o.frequency.setValueAtTime(freq * 0.985, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
      vol *= 0.55;
    } else if (kind === 'marimba') { o.type = 'sine'; o.frequency.value = freq; dur = Math.min(dur, 0.45); }
    else { o.type = 'triangle'; o.frequency.value = freq; }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    if (kind === 'marimba' || kind === 'bell') {   // a quiet overtone makes it ring
      const o2 = ctx.createOscillator(), g2 = ctx.createGain(); o2.type = 'sine'; o2.frequency.value = freq * (kind === 'bell' ? 3 : 4);
      g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(vol * 0.18, t + 0.008); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4);
      o2.connect(g2); g2.connect(bus); o2.start(t); o2.stop(t + dur);
    }
  }
  function pad(root, iv, t, dur) {   // the chord, held softly under everything
    const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(g); g.connect(bus);
    const v = 0.022 * style.pad; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.3); g.gain.setValueAtTime(v, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    for (const i of iv.slice(0, 3)) for (const d of [-4, 4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(root + 12 + i); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 0.4); }
  }
  function kick(t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25); }
  function hat(t, v) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = buf; f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 1.5, 0.08); }

  // lay out the notes a little ahead of time
  function schedule() {
    const sp = 60 / style.bpm / 2;   // one step: an eighth note
    while (next < ctx.currentTime + 0.35) {
      const bar = Math.floor(step / 8), s = step % 8, [root, iv] = style.chords[bar % 4], t = next + (s % 2 ? style.swing * sp : 0);
      if (s === 0) { pad(root, iv, t, sp * 8); voice(hz(root - 12), t, sp * 3.5, 0.075, 'bass'); }
      if (s === 4) voice(hz(root - 12 + iv[2]), t, sp * 3, 0.06, 'bass');
      const k = tune[bar % 8][s];
      if (k >= 0) { const tones = iv.concat(iv.map((x) => x + 12)); voice(hz(root + 12 + tones[k % tones.length]), t, sp * 2.2, 0.05, style.lead); }
      if (intense > 0.5) { if (s % 4 === 0) kick(t); hat(t, s % 2 ? 0.02 : 0.035); }
      next += sp; step = (step + 1) % 64;
    }
  }

  // ---- background sound ----
  const noise = (type, freq, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(amb); s.start(0, Math.random() * 1.5); return { f, g }; };
  const air = noise('lowpass', 400, 0.5), surf = noise('lowpass', 600, 0.3), rainN = noise('bandpass', 2600, 0.4), gale = noise('lowpass', 700, 0.7);
  // cicadas: a high buzz pulsed thirty times a second
  const cz = ctx.createOscillator(), czg = ctx.createGain(), lfo = ctx.createOscillator(), lfg = ctx.createGain();
  cz.type = 'square'; cz.frequency.value = 4300; czg.gain.value = 0; lfo.frequency.value = 31; lfg.gain.value = 0;
  lfo.connect(lfg); lfg.connect(czg.gain); cz.connect(czg); czg.connect(amb); cz.start(); lfo.start();
  let gust = 0.5, gustT = 0, callT = 3, czT = 6, czOn = 0, last = 0;

  function chirp(t, f0, f1, dur, vol, type = 'sine') {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let d = amb; if (type !== 'sine') { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; f.connect(amb); d = f; }
    o.connect(g); g.connect(d); o.start(t); o.stop(t + dur + 0.05);
  }
  function call(t) {   // one animal call for the region
    if (region === 'coast') { const n = 2 + Math.floor(Math.random() * 3), b = 1250 + Math.random() * 300; for (let i = 0; i < n; i++) chirp(t + i * 0.32, b, b * 0.72, 0.28, 0.022, 'sawtooth'); }
    else if (region === 'desert') chirp(t, 2300, 1500, 0.9, 0.018);
    else { const n = 3 + Math.floor(Math.random() * 4), b = 2600 + Math.random() * 1200; for (let i = 0; i < n; i++) chirp(t + i * 0.13, b, b * 1.3, 0.09, 0.016); }
  }

  const meters = {};
  const rms = (node, key) => {
    if (!meters[key]) { const an = ctx.createAnalyser(); an.fftSize = 2048; node.connect(an); meters[key] = { an, b: new Float32Array(2048) }; }
    const m = meters[key]; m.an.getFloatTimeDomainData(m.b); let e = 0; for (const v of m.b) e += v * v; return Math.sqrt(e / m.b.length);
  };
  return {
    get on() { return on; },
    // for tests: how loud the music or the background is right now
    meter(which) { return which === 'music' ? rms(bus, 'music') : rms(amb, 'amb'); },
    debug: () => ({ region, intense, waves: surf.g.gain.value, air: air.g.gain.value }),
    setOn(v) { on = v; bus.gain.setTargetAtTime(v ? 0.75 : 0, ctx.currentTime, 0.4); if (v && !timer) { next = ctx.currentTime + 0.1; timer = setInterval(schedule, 100); schedule(); } if (!v && timer) { clearInterval(timer); timer = 0; } },
    setRegion(r) { if (!STYLES[r]) r = 'mountain'; region = r; style = STYLES[r]; tune = tuneFor(r); step = 0; },
    // every frame. s: { speed, intense (0..1), shore (0..1, how near the sea), indoor (garage or menus) }
    update(s) {
      const t = ctx.currentTime, dt = Math.min(0.2, t - last || 0); last = t; intense = s.intense;
      if (on) schedule();
      // quieter background at speed (the engine covers it anyway) and in the garage
      const quiet = (1 - Math.min(1, s.speed / 45) * 0.6) * (s.indoor ? 0.35 : 1);
      if ((gustT -= dt) <= 0) { gustT = 2 + Math.random() * 4; gust = 0.25 + Math.random() * 0.75; }
      if (region === 'mountain') { air.f.frequency.setTargetAtTime(250 + gust * 350, t, 1.2); air.g.gain.setTargetAtTime(0.03 * gust * quiet, t, 1.2); }
      else if (region === 'desert') { air.f.frequency.setTargetAtTime(700 + gust * 700, t, 1.5); air.g.gain.setTargetAtTime(0.018 * gust * quiet, t, 1.5); }
      else { air.f.frequency.setTargetAtTime(350, t, 1); air.g.gain.setTargetAtTime(0.012 * gust * quiet, t, 1.2); }
      // weather: rain hiss, and a howling wind in storms (heard over the engine, so not lowered with speed)
      const rv = s.rain || 0, sv = s.storm || 0, inq = s.indoor ? 0.35 : 1;
      rainN.g.gain.setTargetAtTime(0.055 * rv * inq, t, 0.8);
      gale.g.gain.setTargetAtTime(0.05 * sv * (0.4 + 0.6 * gust) * inq, t, 1.0); gale.f.frequency.setTargetAtTime(350 + gust * 600, t, 1.0);
      // waves: a slow swell every seven seconds or so, louder near the water
      const shore = region === 'coast' ? s.shore : 0, swell = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.9 + Math.sin(t * 0.23) * 2), 2);
      surf.g.gain.setTargetAtTime(0.07 * shore * swell * quiet, t, 0.3); surf.f.frequency.setTargetAtTime(400 + swell * 700, t, 0.3);
      // cicadas come and go in the desert heat
      if (region === 'desert' && (czT -= dt) <= 0) { czOn = czOn ? 0 : 1; czT = czOn ? 3 + Math.random() * 5 : 4 + Math.random() * 8; }
      const cv = region === 'desert' ? czOn * 0.004 * quiet : 0; czg.gain.setTargetAtTime(cv, t, 0.8); lfg.gain.setTargetAtTime(cv, t, 0.8);
      // now and then a bird, gull or hawk, mostly when the car is slow
      if ((callT -= dt) <= 0) { callT = (region === 'desert' ? 14 : 6) + Math.random() * 10; if (s.speed < 25 && !s.indoor && (region !== 'coast' || shore > 0.15)) call(t + 0.05); }
    },
  };
}
