// All sound is made on the spot with Web Audio: engine, wind, tyres, patrol siren and the short effects.
// Music and each region's background sound live in music.js.
import { createMusic } from './music.js';
export function createAudio() {
  let ctx = null, n = null, muted = false, region = 'mountain', music = true, prof = { pitch: 1, sub: 0.5, bright: 1 }, lastGear = 1;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const out = ctx.createGain(); out.gain.value = muted ? 0 : 1; out.connect(ctx.destination);
      // engine: a saw at firing frequency plus a square an octave down, through a filter that opens with revs and throttle
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createGain(), mix = ctx.createGain(), lp = ctx.createBiquadFilter(), cut = ctx.createGain(), eng = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; sub.gain.value = prof.sub; lp.type = 'lowpass'; eng.gain.value = 0;
      o1.connect(mix); o2.connect(sub); sub.connect(mix); mix.connect(lp); lp.connect(cut); cut.connect(eng); eng.connect(out); o1.start(); o2.start();
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const noise = (type, freq, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(out); s.start(0, Math.random() * 1.5); return { f, g }; };
      const tyre = noise('bandpass', 900, 1), wind = noise('lowpass', 500, 0.4);
      const so = ctx.createOscillator(), sf = ctx.createBiquadFilter(), sg = ctx.createGain(); so.type = 'square'; sg.gain.value = 0; sf.type = 'lowpass'; sf.frequency.value = 1800; so.connect(sf); sf.connect(sg); sg.connect(out); so.start();
      n = { out, o1, o2, sub, lp, cut, eng, tyre, wind, so, sg, buf };
      n.mus = createMusic(ctx, out, buf); n.mus.setRegion(region); n.mus.setOn(music);
    } catch (_) { ctx = null; n = null; }
  }

  // a short tone; `at` is a delay in seconds
  function tone(freq, dur, vol = 0.12, type = 'triangle', at = 0, slide = 0) {
    if (!n) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(n.out); o.start(t); o.stop(t + dur + 0.03);
  }
  const chime = (notes, type = 'triangle', gap = 0.11) => notes.forEach((f, i) => tone(f, 0.35, 0.12, type, i * gap));

  return {
    start,
    get on() { return !!n; },
    setMuted(m) { muted = m; if (n) n.out.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03); },
    // for tests: how loud everything is right now (root mean square of the output)
    level(which) {
      if (!n) return 0;
      if (which) return n.mus.meter(which);
      if (!n.an) { n.an = ctx.createAnalyser(); n.an.fftSize = 2048; n.out.connect(n.an); n.abuf = new Float32Array(2048); }
      n.an.getFloatTimeDomainData(n.abuf); let e = 0; for (const v of n.abuf) e += v * v; return Math.sqrt(e / n.abuf.length);
    },
    get debug() { return n ? n.mus.debug() : null; },
    get state() { return ctx ? ctx.state : 'none'; },
    get musicOn() { return music; },
    setRegion(r) { region = r; if (n) n.mus.setRegion(r); },
    setMusic(on) { music = on; if (n) n.mus.setOn(on); },
    setCar(p) { prof = p; if (n) n.sub.gain.setTargetAtTime(p.sub, ctx.currentTime, 0.05); },
    chime,
    thump(v) { tone(90, 0.2, Math.min(0.3, v * 0.02), 'sine', 0, 35); },
    count(go) { if (go) { tone(988, 0.7, 0.16, 'square'); tone(1976, 0.5, 0.05, 'triangle'); } else tone(494, 0.16, 0.14, 'square'); },
    gate() { tone(1175, 0.12, 0.1); tone(1568, 0.3, 0.1, 'triangle', 0.08); },
    click() { tone(660, 0.05, 0.05, 'square'); },
    deny() { tone(196, 0.18, 0.09, 'sawtooth'); },
    // into the sea: a rush of water and a low thud
    splash() {
      if (!n) return;
      const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = n.buf; f.type = 'lowpass'; f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(300, t + 1.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      s.connect(f); f.connect(g); g.connect(n.out); s.start(t, Math.random() * 0.5, 1.3); tone(70, 0.35, 0.2, 'sine', 0, 30);
    },
    buy() { chime([1319, 1568, 2093], 'triangle', 0.07); },
    // every frame. s: { rpm, throttle, speed, slip, loose, grounded, gear, live, heat, nearest, now, intense, shore, indoor }
    update(s) {
      if (!n) return;
      n.mus.update(s);
      const t = ctx.currentTime, f = s.rpm / 60 * 2 * prof.pitch, on = s.live ? 1 : 0;
      n.o1.frequency.setTargetAtTime(f, t, 0.03); n.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
      n.lp.frequency.setTargetAtTime((350 + s.rpm * 0.22 + s.throttle * 900) * prof.bright, t, 0.05);
      n.eng.gain.setTargetAtTime(on * (0.035 + s.throttle * 0.035), t, 0.05);
      if (s.gear !== lastGear) {      // a gear change: the engine note drops out for a moment
        if (on && s.gear > 0 && lastGear > 0) { n.cut.gain.cancelScheduledValues(t); n.cut.gain.setValueAtTime(0.3, t); n.cut.gain.linearRampToValueAtTime(1, t + 0.2); }
        lastGear = s.gear;
      }
      n.tyre.g.gain.setTargetAtTime(on * (s.grounded ? Math.min(0.09, s.slip * 0.07 + s.loose * Math.min(1, s.speed / 30) * 0.04) : 0), t, 0.06);
      n.tyre.f.frequency.setTargetAtTime(s.loose ? 500 : 1400, t, 0.1);
      const w = Math.min(1, s.speed / 70);
      n.wind.g.gain.setTargetAtTime(on * w * w * 0.11, t, 0.15); n.wind.f.frequency.setTargetAtTime(300 + w * 900, t, 0.15);
      n.so.frequency.setTargetAtTime(Math.floor(s.now / 420) % 2 ? 660 : 880, t, 0.02);
      n.sg.gain.setTargetAtTime(on && s.heat ? 0.035 * Math.max(0, 1 - s.nearest / 320) : 0, t, 0.1);
    },
  };
}
