// Time of day: the light, sky and fog for any hour, blended between a few set looks (night, dawn, morning, day,
// golden hour, sunset, dusk). The day look is each region's own sky; the others are shared, nudged toward the region.
// Pure math (runs in node for tests).

export const TOD = ['day', 'sunset', 'night', 'cycle'];
export const TOD_NAME = { day: 'Day', sunset: 'Sunset', night: 'Night', cycle: 'Day cycle' };
export const TOD_HOUR = { day: 13, sunset: 19.1, night: 0 };
export const CYCLE = { start: 8, hourSecs: 50 };   // the day cycle starts at 8 in the morning; an hour lasts 50 seconds

// one look: light from (elevation, azimuth in degrees), its colour and strength, sky colours, fog, ambient light,
// clouds (lit and shaded colour), sun disc colour, stars (0..1) and night (0..1: car lights on, patrols see less)
const K = (o) => o;
const NIGHT = K({ el: 38, az: 210, sun: 0x9fb6ff, si: 0.55, top: 0x050b1c, mid: 0x0e1a38, hor: 0x23324f, fog: 0x172031, hs: 0x5d73a6, hg: 0x1a1d26, hi: 0.78, cl: 0x1a2030, cs: 0x080b14, disc: 0xdfe6ff, stars: 1, night: 1 });
const DAWN = K({ el: 2, az: 95, sun: 0xff9e6e, si: 1.1, top: 0x27407e, mid: 0x8c86b4, hor: 0xf4a882, fog: 0xc7a0a0, hs: 0xc8b0c0, hg: 0x463a36, hi: 0.75, cl: 0xffc2a0, cs: 0x6a6080, disc: 0xffd0a0, stars: 0.15, night: 0.55 });
const MORNING = K({ el: 14, az: 105, sun: 0xffdcb0, si: 2.0, top: 0x2f68c8, mid: 0x8ab6e6, hor: 0xe9e2d8, fog: 0xdadbd8, hs: 0xd6dcea, hg: 0x55503e, hi: 1.05, cl: 0xfff2e4, cs: 0x8c95a6, disc: 0xfff0d8, stars: 0, night: 0 });
const GOLDEN = K({ el: 11, az: 255, sun: 0xffc488, si: 2.1, top: 0x3466be, mid: 0x9cb6d8, hor: 0xf3cc9e, fog: 0xe6cbaa, hs: 0xe4d6c8, hg: 0x5a4a38, hi: 1.0, cl: 0xffe2c0, cs: 0x8e8aa0, disc: 0xffe0b0, stars: 0, night: 0 });
const SUNSET = K({ el: 2.5, az: 265, sun: 0xff8a4c, si: 1.5, top: 0x23407e, mid: 0x86719e, hor: 0xff9658, fog: 0xc98e80, hs: 0xd8a89c, hg: 0x4a3830, hi: 0.78, cl: 0xffa070, cs: 0x5c4c70, disc: 0xffb070, stars: 0.05, night: 0.45 });
const DUSK = K({ el: 30, az: 230, sun: 0x8c9cd8, si: 0.4, top: 0x0c1838, mid: 0x28345e, hor: 0x5e5274, fog: 0x3e4058, hs: 0x6a6c9c, hg: 0x22222c, hi: 0.7, cl: 0x2c2c44, cs: 0x10121e, disc: 0xdfe6ff, stars: 0.6, night: 0.9 });
// [hour, look]; the day look comes from the region
const KEYS = (day) => [[0, NIGHT], [4.6, NIGHT], [6, DAWN], [7.5, MORNING], [10, day], [16, day], [18, GOLDEN], [19.3, SUNSET], [20.4, DUSK], [21.6, NIGHT], [24, NIGHT]];

const lerp = (a, b, t) => a + (b - a) * t;
const mixHex = (a, b, t) => {
  const r = lerp((a >> 16) & 255, (b >> 16) & 255, t), g = lerp((a >> 8) & 255, (b >> 8) & 255, t), c = lerp(a & 255, b & 255, t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(c);
};
const ease = (t) => t * t * (3 - 2 * t);

// the day look for a region from its sky
export function dayLook(SK) {
  return { el: 41.86, az: 52.62, sun: 0xfff0d8, si: 2.4, top: SK.top, mid: SK.mid, hor: SK.hor, fog: SK.fog, hs: SK.light[0], hg: SK.light[1], hi: 1.25, cl: 0xfffbf2, cs: 0x8fa1bd, disc: 0xffedc7, stars: 0, night: 0, envTop: SK.envTop ?? SK.top, envMid: SK.envMid ?? SK.mid };
}

// the look at an hour (0..24) for a region's sky
export function lookAt(hour, SK) {
  const keys = KEYS(dayLook(SK)), h = ((hour % 24) + 24) % 24;
  let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= h) i++;
  const full = (L) => ({ envTop: L.top, envMid: L.mid, ...L }), [h0, a0] = keys[i], [h1, b0] = keys[i + 1], a = full(a0), b = full(b0), t = ease(h1 > h0 ? (h - h0) / (h1 - h0) : 0), out = {};
  for (const k in a) out[k] = /^(sun|top|mid|hor|fog|hs|hg|cl|cs|disc|envTop|envMid)$/.test(k) ? mixHex(a[k], b[k], t) : lerp(a[k], b[k], t);
  // the region's day colours tint the other looks a little, so a desert sunset is warmer than a coast one
  if (a0 !== b0 || a.night > 0 || a.el < 20) { out.hor = mixHex(out.hor, SK.hor, 0.12 * (1 - out.night)); out.fog = mixHex(out.fog, SK.fog, 0.12 * (1 - out.night)); out.hg = mixHex(out.hg, SK.light[1], 0.3); }
  const el = out.el * Math.PI / 180, az = out.az * Math.PI / 180;
  out.dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  return out;
}

// the hour now for a setting; t is seconds since the cycle started
export function hourFor(tod, t = 0) { return tod === 'cycle' ? (CYCLE.start + t / CYCLE.hourSecs) % 24 : TOD_HOUR[tod] ?? TOD_HOUR.day; }
