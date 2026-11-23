// World data: heightfield, roads, surface types. Pure math, no rendering (runs in node for tests).
export const SIZE = 4608, N = 1152, CELL = SIZE / N, HALF = SIZE / 2, V = N + 1;
import { REGIONS } from './regions.js';
export const SNOWLINE = 250, TREELINE = 222;
export const SURF = { ASPHALT: 0, DIRT: 1, GRASS: 2, ROCK: 3, SNOW: 4 };
export const SURF_NAME = ['Asphalt', 'Dirt', 'Grass', 'Rock', 'Snow'];
// grip, rolling resistance, slip angle (tan) where grip peaks
export const SURF_PHYS = [
  { mu: 1.05, rr: 0.013, peak: 0.14 },
  { mu: 0.80, rr: 0.030, peak: 0.20 },
  { mu: 0.66, rr: 0.055, peak: 0.22 },
  { mu: 0.74, rr: 0.040, peak: 0.18 },
  { mu: 0.42, rr: 0.075, peak: 0.26 },
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gradient sets. The even one (12 directions, none square to the noise grid's own lines) is used for anything that
// gets folded into ridges; with the classic set, ridge crests come out as ruler-straight diagonal lines.
const GRAD8 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const GRAD12 = Array.from({ length: 12 }, (_, k) => [Math.cos(k * Math.PI / 6) * 1.2, Math.sin(k * Math.PI / 6) * 1.2]);

function makeNoise(seed, G = GRAD8) {
  const rnd = mulberry32(seed), p = new Uint8Array(512), GN = G.length;
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (x, y) {
    const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, tt, g;
    tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { g = G[p[ii + p[jj]] % GN]; tt *= tt; n += tt * tt * (g[0] * x0 + g[1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { g = G[p[ii + i1 + p[jj + j1]] % GN]; tt *= tt; n += tt * tt * (g[0] * x1 + g[1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { g = G[p[ii + 1 + p[jj + 1]] % GN]; tt *= tt; n += tt * tt * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  };
}

const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

function catmull(pts, closed, per) {
  const out = [], n = pts.length, segs = closed ? n : n - 1;
  const P = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  for (let s = 0; s < segs; s++) {
    const a = P(s - 1), b = P(s), c = P(s + 1), d = P(s + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * b[0] + (c[0] - a[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (3 * b[0] - a[0] - 3 * c[0] + d[0]) * t3),
        0.5 * (2 * b[1] + (c[1] - a[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (3 * b[1] - a[1] - 3 * c[1] + d[1]) * t3)]);
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}

function resample(dense, closed, step) {
  const pts = closed ? dense.concat([dense[0]]) : dense, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1], count = Math.round(total / step), ds = total / count;
  const xs = [], zs = [];
  let j = 0;
  const m = closed ? count : count + 1;
  for (let i = 0; i < m; i++) {
    const d = Math.min(i * ds, total);
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const f = (d - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    xs.push(pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f); zs.push(pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f);
  }
  return { x: Float32Array.from(xs), z: Float32Array.from(zs), ds, n: m };
}

// opts.towns === false leaves the towns out (the handling tests measure the cars on open ground, not the buildings)
export function buildWorld(regionId = 'mountain', opts = {}) {
  if (typeof regionId !== 'string' || !REGIONS[regionId]) regionId = 'mountain';
  const RG = REGIONS[regionId], seed = RG.seed, snowline = RG.snow ? SNOWLINE : 1e9, treeline = RG.snow ? TREELINE : 1e9;
  const noise = makeNoise(seed, GRAD12), noise2 = makeNoise(seed + 101);
  const ROT = Array.from({ length: 6 }, (_, o) => [Math.cos(0.35 + o * 0.62), Math.sin(0.35 + o * 0.62)]);
  const mountain = (x0, z0) => {
    // bend the map a little before reading the ridges, so crests wander like real ones instead of running straight
    const x = x0 + 95 * noise2(x0 / 640 + 11.5, z0 / 640 - 4.2) + 26 * noise2(x0 / 190 - 7, z0 / 190 + 23);
    const z = z0 + 95 * noise2(x0 / 640 - 30.1, z0 / 640 + 17.7) + 26 * noise2(x0 / 190 + 41, z0 / 190 - 13);
    let f = 0, amp = 1, freq = 1 / 2100, sum = 0;
    for (let o = 0; o < 6; o++) {
      // big shapes are sharp ridges; the two finest layers are soft bumps, so small crests do not act as launch ramps.
      // Each layer is turned to its own angle so no grid direction repeats across layers.
      const c = ROT[o][0], sn = ROT[o][1];
      const nv = noise((x * c - z * sn) * freq + o * 17.3, (x * sn + z * c) * freq - o * 31.7);
      // (ridge crests are rounded off a little, which leaves far more of the mountain climbable than knife edges do)
      let r = o < 4 ? (1 - Math.sqrt(nv * nv + 0.016)) ** 2 : 0.5 + 0.5 * nv;
      f += r * amp; sum += amp; amp *= 0.34; freq *= 2.07;
    }
    f /= sum;
    const r2 = (x0 * x0 + z0 * z0) / (540 * 540);
    return 40 + Math.pow(f, 1.6) * 310 + 160 * Math.exp(-r2) + 28 * noise2(x0 / 420, z0 / 420);
  };
  // The desert: a wide basin floor with dune fields, broken by flat-topped mesas in two steps with cliffs between,
  // and a big central butte for the trail to cross.
  const desert = (x0, z0) => {
    const x = x0 + 120 * noise2(x0 / 700 + 3.1, z0 / 700 - 8.4) + 30 * noise2(x0 / 170 - 2, z0 / 170 + 6);
    const z = z0 + 120 * noise2(x0 / 700 - 21.7, z0 / 700 + 12.2) + 30 * noise2(x0 / 170 + 33, z0 / 170 - 19);
    const r2 = (x0 * x0 + z0 * z0) / (600 * 600);
    let h = 45 + 30 * noise2(x0 / 1100 + 4, z0 / 1100) + 7 * noise2(x0 / 160, z0 / 160 + 5);
    const field = smooth((noise2(x0 / 800 + 20, z0 / 800 - 6) - 0.05) / 0.3);                      // dunes, in patches
    h += field * 4.5 * (0.5 + 0.5 * Math.sin((x0 * 0.8 + z0 * 0.6) / 34 + 3 * noise2(x0 / 210, z0 / 210)));
    const m = noise(x / 900, z / 900) * 0.72 + noise(x / 330 + 7.7, z / 330 - 2.1) * 0.28 + 0.32 * Math.exp(-r2);
    const step1 = smooth((m - 0.2) / 0.08), step2 = smooth((m - 0.44) / 0.07);
    h += step1 * 48 + step2 * 42 + 70 * Math.exp(-r2 * 1.4);
    h += (2 + 3 * step1) * noise(x0 / 55 + 3, z0 / 55);                                               // weathering
    return h;
  };
  // The coast: green hills on a big headland, a central ridge for the trail, falling to beaches and, in places, cliffs.
  // Beyond the shore the sea floor drops away under the water (world.sea is the water level).
  const SEA = RG.sea ?? null;
  const coast = (x0, z0) => {
    const x = x0 + 110 * noise2(x0 / 650 + 5.3, z0 / 650 - 1.4) + 28 * noise2(x0 / 180 - 9, z0 / 180 + 2);
    const z = z0 + 110 * noise2(x0 / 650 - 14.2, z0 / 650 + 8.8) + 28 * noise2(x0 / 180 + 21, z0 / 180 - 7);
    const r = Math.hypot(x, z), a = Math.atan2(z, x), edge = 1290 + 120 * noise2(Math.cos(a) * 1.7 + 3, Math.sin(a) * 1.7 - 2) + 50 * noise2(Math.cos(a) * 5, Math.sin(a) * 5 + 7);
    const cliff = smooth((noise2(Math.cos(a) * 1.4 - 6, Math.sin(a) * 1.4 + 4) - 0.05) / 0.25);         // stretches of cliff
    const width = 240 - 180 * cliff;
    let land = smooth((edge - r) / width);
    if (HALF > 1600 && RG.outer) {   // bigger maps: a broken ring of islands out past a sea channel, for the outer loop road
      const R2 = HALF * 0.74 + 160 * noise2(Math.cos(a) * 1.6 + 21, Math.sin(a) * 1.6 - 13), w2 = 150 + 120 * noise2(Math.cos(a) * 2.6 + 9, Math.sin(a) * 2.6 - 4) + 40 * noise2(x / 300, z / 300);
      land = Math.max(land, smooth((w2 - Math.abs(r - R2)) / 110));
    }
    let hills = 0, amp = 1, freq = 1 / 900, sum = 0;
    for (let o = 0; o < 4; o++) { hills += (0.5 + 0.5 * noise(x * freq + o * 9.1, z * freq - o * 4.7)) * amp; sum += amp; amp *= 0.42; freq *= 2.1; }
    hills /= sum;
    const r2 = (x0 * x0 + z0 * z0) / (520 * 520);
    const top = 30 + 70 * hills * hills + 120 * Math.exp(-r2) + 30 * cliff * smooth((edge - r) / 120) * (1 - smooth((edge - r - 260) / 260));   // cliffs stand a little higher than beaches
    return SEA - 22 - 26 * (1 - land) + land * (22 + top);
  };
  const natural = RG.ground === 'desert' ? desert : RG.ground === 'coast' ? coast : mountain;

  const heights = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) heights[j * V + i] = natural(i * CELL - HALF, j * CELL - HALF);

  // ---- roads ----
  const roads = [];
  const limitSlope = (h, ds, g, closed, pinEnds) => {
    const n = h.length, m = g * ds;
    for (let pass = 0; pass < 3; pass++) {
      const a = Float32Array.from(h), b = Float32Array.from(h);
      const lim = closed ? 2 * n : n;
      for (let k = 1; k < lim; k++) { const i = k % n, p = (k - 1) % n; a[i] = Math.max(a[p] - m, Math.min(a[p] + m, a[i])); }
      for (let k = lim - 2; k >= 0; k--) { const i = k % n, p = (k + 1) % n; b[i] = Math.max(b[p] - m, Math.min(b[p] + m, b[i])); }
      for (let i = 0; i < n; i++) { const t = pinEnds ? i / (n - 1) : 0.5; h[i] = a[i] * (1 - t) + b[i] * t; }
    }
  };
  const blur = (h, w, closed, passes, pinEnds) => {
    const n = h.length;
    for (let p = 0; p < passes; p++) {
      const src = Float32Array.from(h);
      for (let i = 0; i < n; i++) {
        let s = 0, c = 0;
        const ww = closed ? w : Math.min(w, i, n - 1 - i);
        for (let k = -ww; k <= ww; k++) { s += src[closed ? (i + k + n) % n : i + k]; c++; }
        h[i] = s / c;
      }
      if (pinEnds) { h[0] = pinEnds[0]; h[n - 1] = pinEnds[1]; }
    }
  };

  // ---- rivers (only regions that list them): a centre line from the mouth out in the sea up into the hills, a width,
  // and a water level that climbs from the sea inland no faster than a steep stream. The valleys are cut into the
  // ground once the roads are in, so the roads keep their line and cross on bridges.
  const rivers = (RG.rivers || []).map((def, k) => {
    let s = resample(catmull(def.pts, false, 30), false, 4);
    const wig = [];                    // a gentle meander on top of the drawn line
    for (let i = 0; i < s.n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(s.n - 1, i + 1); let tx = s.x[b] - s.x[a], tz = s.z[b] - s.z[a]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      const off = 30 * noise2(i * s.ds / 240 + k * 7.3, 3.7 + k) * smooth(i / 15);
      wig.push([s.x[i] + tz * off, s.z[i] - tx * off]);
    }
    s = resample(wig, false, 4);
    const n = s.n, hw = new Float32Array(n), depth = new Float32Array(n), floor = new Float32Array(n), wl = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      hw[i] = (6 + 9 * (1 - t)) * (0.35 + 0.65 * (1 - smooth((t - 0.86) / 0.14))); depth[i] = 1.2 + 1.6 * (1 - t);
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); let tx = s.x[b] - s.x[a], tz = s.z[b] - s.z[a]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      let m = 1e9; for (const f of [-1, -0.5, 0, 0.5, 1]) m = Math.min(m, natural(s.x[i] + tz * f * (hw[i] + 14), s.z[i] - tx * f * (hw[i] + 14)));
      floor[i] = m;
    }
    blur(floor, 6, false, 2);
    for (let i = 0; i < n; i++) wl[i] = i === 0 ? SEA : Math.min(wl[i - 1] + s.ds * 0.12, Math.max(wl[i - 1], floor[i] - 3.5));
    blur(wl, 4, false, 2); for (let i = 1; i < n; i++) wl[i] = Math.max(wl[i], wl[i - 1], SEA);
    return { ...s, name: def.name, hw, depth, wl, floor };
  });
  // a road crossing a river stays well clear of the water: lift it there and smooth the lift out along the road
  const clearRivers = (s, h, closed, ends) => {   // (only the lift is smoothed, so the road elsewhere is untouched)
    if (!rivers.length) return;
    const need = new Float32Array(s.n).fill(-1e9);
    for (let i = 0; i < s.n; i++) for (const rv of rivers) for (let j = 0; j < rv.n; j += 2) {
      const d = Math.hypot(rv.x[j] - s.x[i], rv.z[j] - s.z[i]); if (d < rv.hw[j] + 60) need[i] = Math.max(need[i], rv.wl[j] + 6 - Math.max(0, d - rv.hw[j] - 20) * 0.12);
    }
    const lift = new Float32Array(s.n), gap = (i) => Math.max(0, need[i] - h[i]);
    for (let k = 0; k < 4; k++) { for (let i = 0; i < s.n; i++) lift[i] = Math.max(lift[i], gap(i)); blur(lift, 20, closed, 1, ends && [0, 0]); }
    for (let i = 0; i < s.n; i++) h[i] += Math.max(lift[i], gap(i));
  };

  // main loop road (asphalt)
  {
    const K = 18, cps = [];
    for (let i = 0; i < K; i++) {
      const a = i / K * Math.PI * 2;
      const r = 960 + 250 * noise2(Math.cos(a) * 1.3 + 5, Math.sin(a) * 1.3 - 3) + 70 * noise2(Math.cos(a) * 4, Math.sin(a) * 4 + 9);
      cps.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const s = resample(catmull(cps, true, 60), true, 2);
    const h = new Float32Array(s.n);
    for (let i = 0; i < s.n; i++) h[i] = natural(s.x[i], s.z[i]);
    blur(h, 70, true, 3); limitSlope(h, s.ds, 0.09, true); blur(h, 12, true, 2);
    if (SEA !== null) for (let k = 0; k < 3; k++) { for (let i = 0; i < s.n; i++) h[i] = Math.max(h[i], SEA + 4); blur(h, 25, true, 1); }   // the coast road stays above the water
    clearRivers(s, h, true);
    roads.push({ ...s, h, closed: true, hw: 5, surf: SURF.ASPHALT, blend: 210, name: RG.ring });
  }
  // dirt trail over the central shoulder
  {
    const L = roads[0], iA = 0, iB = Math.floor(L.n * (RG.trailEnd ?? 0.52));
    const A = [L.x[iA], L.z[iA]], B = [L.x[iB], L.z[iB]];
    const dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz), px = -dz / len, pz = dx / len;
    const cps = [A], M = 9;
    for (let k = 1; k < M; k++) {
      const t = k / M, bow = (RG.trailBow ?? 250) * Math.sin(Math.PI * t), wig = (k % 2 ? 1 : -1) * 85 * Math.sin(Math.PI * t);
      cps.push([A[0] + dx * t + px * (bow + wig), A[1] + dz * t + pz * (bow + wig)]);
    }
    cps.push(B);
    const s = resample(catmull(cps, false, 60), false, 2);
    const h = new Float32Array(s.n);
    // Near each junction the trail lies on the ring road's own surface, so the two never disagree about the ground.
    const ringAt = (x, z) => { let m = 1e18, k = 0; for (let i = 0; i < L.n; i++) { const d = (L.x[i] - x) ** 2 + (L.z[i] - z) ** 2; if (d < m) { m = d; k = i; } } return [Math.sqrt(m), L.h[k]]; };
    let k0 = 0, k1 = s.n - 1;
    for (let i = 0; i < s.n; i++) { const [d, rh] = ringAt(s.x[i], s.z[i]); h[i] = d < 17 ? rh : natural(s.x[i], s.z[i]); if (d < 17) { if (i < s.n / 2) k0 = i; else if (k1 === s.n - 1) k1 = i; } }
    const mid = h.slice(k0, k1 + 1), pin = [h[k0], h[k1]];
    blur(mid, 30, false, 3, pin); limitSlope(mid, s.ds, 0.2, false, pin); blur(mid, 8, false, 2, pin);
    if (rivers.length) { const sub = { x: s.x.subarray(k0, k1 + 1), z: s.z.subarray(k0, k1 + 1), n: mid.length }; clearRivers(sub, mid, false, pin); }
    h.set(mid, k0);
    roads.push({ ...s, h, closed: false, hw: 3.5, surf: SURF.DIRT, blend: 95, name: RG.trail });
  }
  // ---- the outer country (maps bigger than the first 3072 m): a second loop road out past the ring road, joined to
  // it by spokes. Over the sea a new road is lifted well clear of the water (the bridge finder below gives it a deck).
  const OUTER = HALF > 1600 && RG.outer && opts.outer !== false;
  const seaLift = (s, h, pinned) => {
    if (SEA === null) return;
    const need = new Float32Array(s.n); for (let i = 0; i < s.n; i++) need[i] = natural(s.x[i], s.z[i]) < SEA + 2 ? SEA + 7 : SEA + 4;
    const lift = new Float32Array(s.n), gap = (i) => Math.max(0, need[i] - h[i]);
    for (let k = 0; k < 4; k++) { for (let i = 0; i < s.n; i++) lift[i] = Math.max(lift[i], gap(i)); blur(lift, 25, !pinned, 1, pinned && [0, 0]); }
    for (let i = 0; i < s.n; i++) h[i] += Math.max(lift[i], gap(i));
  };
  if (OUTER) {
    const K = 24, cps = [], R2 = HALF * 0.74;
    for (let i = 0; i < K; i++) {
      const a = i / K * Math.PI * 2, r = R2 + 160 * noise2(Math.cos(a) * 1.6 + 21, Math.sin(a) * 1.6 - 13) + 60 * noise2(Math.cos(a) * 4.5 - 3, Math.sin(a) * 4.5 + 8);
      cps.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const s = resample(catmull(cps, true, 60), true, 2), h = new Float32Array(s.n);
    for (let i = 0; i < s.n; i++) h[i] = natural(s.x[i], s.z[i]);
    blur(h, 70, true, 3); limitSlope(h, s.ds, 0.09, true); blur(h, 12, true, 2); seaLift(s, h, false); clearRivers(s, h, true);
    roads.push({ ...s, h, closed: true, hw: 4.5, surf: SURF.ASPHALT, blend: 180, name: RG.outer.name, outer: true });
    // spokes: from the ring road out to the loop, each lying on both roads' own surface at its ends
    const ringR = roads[0], loop = roads[roads.length - 1];
    const nearOn = (L, x, z) => { let m = 1e18, k = 0; for (let i = 0; i < L.n; i++) { const d = (L.x[i] - x) ** 2 + (L.z[i] - z) ** 2; if (d < m) { m = d; k = i; } } return [Math.sqrt(m), L.h[k], k]; };
    RG.outer.spokes.forEach(([frac, name, dirt], k) => {
      const iA = Math.floor(ringR.n * frac), A = [ringR.x[iA], ringR.z[iA]], ang = Math.atan2(A[1], A[0]);
      const [, , kB] = nearOn(loop, Math.cos(ang) * R2, Math.sin(ang) * R2), B = [loop.x[kB], loop.z[kB]];
      const dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz), px = -dz / len, pz = dx / len, M = Math.max(3, Math.round(len / 120)), c = [A];
      for (let m = 1; m < M; m++) { const t = m / M, wig = 70 * noise2(m * 0.9 + k * 5.1, 2.3 + k) * Math.sin(Math.PI * t); c.push([A[0] + dx * t + px * wig, A[1] + dz * t + pz * wig]); }
      c.push(B);
      const sp = resample(catmull(c, false, 60), false, 2), hh = new Float32Array(sp.n);
      let k0 = 0, k1 = sp.n - 1;
      for (let i = 0; i < sp.n; i++) {
        const [d0, h0] = nearOn(ringR, sp.x[i], sp.z[i]), [d1, h1] = nearOn(loop, sp.x[i], sp.z[i]);
        hh[i] = d0 < 17 ? h0 : d1 < 17 ? h1 : natural(sp.x[i], sp.z[i]);
        if (d0 < 17) k0 = Math.max(k0, i); if (d1 < 17 && k1 === sp.n - 1 && i > sp.n / 2) k1 = i;
      }
      const mid = hh.slice(k0, k1 + 1), pin = [hh[k0], hh[k1]], sub = { x: sp.x.subarray(k0, k1 + 1), z: sp.z.subarray(k0, k1 + 1), n: mid.length };
      blur(mid, 30, false, 3, pin); limitSlope(mid, sp.ds, dirt ? 0.16 : 0.1, false, pin); blur(mid, 8, false, 2, pin); seaLift(sub, mid, true); clearRivers(sub, mid, false, pin);
      hh.set(mid, k0);
      roads.push({ ...sp, h: hh, closed: false, hw: dirt ? 3.5 : 4.5, surf: dirt ? SURF.DIRT : SURF.ASPHALT, blend: dirt ? 95 : 150, name, spoke: true });
    });
  }

  // ---- places: garages and pull-outs beside the roads, camps out in the wild, race start lines ----
  // Chosen before the ground is shaped, so each place gets a flat lot cut into the terrain.
  const ring = roads[0], trail = roads[1];
  const frame = (road, i) => {   // position, unit tangent and unit left vector at sample i
    const a = road.closed ? (i - 1 + road.n) % road.n : Math.max(0, i - 1), b = road.closed ? (i + 1) % road.n : Math.min(road.n - 1, i + 1);
    let tx = road.x[b] - road.x[a], tz = road.z[b] - road.z[a]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    return { x: road.x[i], z: road.z[i], h: road.h[i], tx, tz, lx: tz, lz: -tx, yaw: Math.atan2(tx, tz) };
  };
  const flattest = (road, frac, span) => {
    const c = Math.floor(road.n * frac); let best = c, bg = 1e9;
    for (let k = -span; k <= span; k += 2) { const i = (c + k + road.n) % road.n, g = Math.abs(road.h[(i + 10) % road.n] - road.h[(i - 10 + road.n) % road.n]); if (g < bg) { bg = g; best = i; } }
    return best;
  };
  const gentler = (f) => Math.abs(natural(f.x + f.lx * 30, f.z + f.lz * 30) - f.h) <= Math.abs(natural(f.x - f.lx * 30, f.z - f.lz * 30) - f.h) ? 1 : -1;
  const roadGap = (x, z) => { let m = 1e18; for (const road of roads) for (let i = 0; i < road.n; i += 4) { const d = (road.x[i] - x) ** 2 + (road.z[i] - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  const shoulders = [], pads = [], places = { sites: [], garages: [], lines: {} };
  const beside = (f, side, d) => [f.x + f.lx * side * d, f.z + f.lz * side * d];
  [[RG.garages[0], 0.03], [RG.garages[1], 0.56]].forEach(([name, frac]) => {
    const idx = flattest(ring, frac, 40), f = frame(ring, idx), side = gentler(f);
    shoulders.push({ r: 0, idx, side, f, len: 17, width: 27 });
    const [x, z] = beside(f, side, ring.hw + 11), [bx, bz] = beside(f, side, ring.hw + 27);
    places.garages.push({ name, idx, side, x, z, yaw: f.yaw, bx, bz, byaw: Math.atan2(-f.lx * side, -f.lz * side) });
  });
  [0.14, 0.30, 0.44, 0.66, 0.82].map((f, k) => [RG.sites[k], f]).forEach(([name, frac], k) => {
    const idx = Math.floor(ring.n * frac), f = frame(ring, idx), side = k % 2 ? 1 : -1;
    shoulders.push({ r: 0, idx, side, f, len: 9, width: 13 });
    const [x, z] = beside(f, side, ring.hw + 3), [hutX, hutZ] = beside(f, side, ring.hw + 18);
    places.sites.push({ name, x, z, wild: false, hutX, hutZ, yaw: f.yaw });
  });
  [[RG.trailSites[0], 0.33], [RG.trailSites[1], 0.67]].forEach(([name, frac], k) => {
    const idx = Math.floor(trail.n * frac), f = frame(trail, idx), side = k % 2 ? 1 : -1;
    shoulders.push({ r: 1, idx, side, f, len: 7, width: 8 });
    const [hutX, hutZ] = beside(f, side, trail.hw + 9);
    places.sites.push({ name, x: f.x, z: f.z, wild: true, hutX, hutZ, yaw: f.yaw });
  });
  // bigger maps: pickups along the outer loop (listed after the camps, so the camps keep their spots) and its town
  const outerSites = [];
  if (OUTER) {
    const ri = roads.findIndex((q) => q.outer), loop = roads[ri];
    RG.outer.sites.forEach((name, k) => {
      const idx = Math.floor(loop.n * [0.1, 0.43, 0.77][k]), f = frame(loop, idx), side = k % 2 ? 1 : -1;
      shoulders.push({ r: ri, idx, side, f, len: 9, width: 13 });
      const [x, z] = beside(f, side, loop.hw + 3), [hutX, hutZ] = beside(f, side, loop.hw + 18);
      outerSites.push({ name, x, z, wild: false, hutX, hutZ, yaw: f.yaw, outer: true });
    });
    places.outerTown = { idx: flattest(loop, 0.6, 60) };
    places.lines.outer = { road: ri, idx: flattest(loop, 0.32, 30) };   // start and finish of the outer loop's race
  }
  // pull-in where the off-road time trial starts (its checkpoints are chosen further down, once the ground is shaped)
  {
    const idx = flattest(ring, 0.36, 30), f = frame(ring, idx);
    shoulders.push({ r: 0, idx, side: -1, f, len: 10, width: 16 });
    const [x, z] = beside(f, -1, ring.hw + 13);
    places.trial = { x, z, yaw: Math.atan2(-f.lx, -f.lz), idx, gates: [] };
  }
  // start and finish lines
  places.lines.ring = { road: 0, idx: flattest(ring, 0.07, 30) };
  places.lines.dashStart = { road: 1, idx: 30 };
  places.lines.dashEnd = { road: 1, idx: trail.n - 31 };
  const shoulderAt = (r, road, s, x, z) => {   // extra flat width beside the road at sample s, on the side this point lies on
    let extra = 0;
    for (const sh of shoulders) {
      if (sh.r !== r) continue;
      let da = Math.abs(s - sh.idx); if (road.closed) da = Math.min(da, road.n - da);
      da *= road.ds; if (da >= sh.len + 16) continue;
      if (((x - road.x[s]) * sh.f.lx + (z - road.z[s]) * sh.f.lz) * sh.side <= 0) continue;
      extra = Math.max(extra, sh.width * (1 - smooth((da - sh.len) / 16)));
    }
    return extra;
  };

  // Stamp roads into the heightfield. Each vertex is pulled toward every nearby road's height, weighted so that
  // the closest road wins outright on its own bed and the hand-over between two roads is smooth.
  const pre = OUTER && SEA !== null ? Float32Array.from(heights) : null;   // the ground before the roads, for the sea under new roads
  const roadDist = new Float32Array(V * V).fill(1e9);
  for (const road of roads) road.ref = new Int32Array(V * V).fill(-1);
  const stamps = roads.map((road) => {
    const D = road.blend, d2 = new Float32Array(V * V).fill(1e12), idx = new Int32Array(V * V).fill(-1);
    const R = Math.ceil(D / CELL);
    for (let s = 0; s < road.n; s++) {
      const px = road.x[s], pz = road.z[s], ci = Math.round((px + HALF) / CELL), cj = Math.round((pz + HALF) / CELL);
      const j0 = Math.max(0, cj - R), j1 = Math.min(N, cj + R), i0 = Math.max(0, ci - R), i1 = Math.min(N, ci + R);
      for (let j = j0; j <= j1; j++) {
        const dz = j * CELL - HALF - pz, dz2 = dz * dz, row = j * V;
        for (let i = i0; i <= i1; i++) {
          const dx = i * CELL - HALF - px, dd = dx * dx + dz2;
          if (dd < d2[row + i]) { d2[row + i] = dd; idx[row + i] = s; }
        }
      }
    }
    return { d2, idx };
  });
  for (let v = 0; v < V * V; v++) {
    let keep = 1, wSum = 0, tSum = 0;
    const x = (v % V) * CELL - HALF, z = ((v / V) | 0) * CELL - HALF;
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r], st = stamps[r];
      if (st.idx[v] < 0) continue;
      const d = Math.sqrt(st.d2[v]); if (d >= road.blend) continue;
      const extra = shoulders.length ? shoulderAt(r, road, st.idx[v], x, z) : 0;
      const inner = road.hw + 6 + extra, a = 1 - smooth((d - inner) / (road.blend - inner));
      const wgt = a / (1 - a + (r === 0 || roads[r].outer ? 1e-5 : 1e-3));          // the ring road has the last word on its own bed
      // the bed sits well under the road ribbon, and only a small step below it beside the road
      wSum += wgt; tSum += wgt * (road.h[st.idx[v]] - (d < road.hw + 1 ? 0.3 : 0.14)); keep *= 1 - a;
      if (d < road.hw + 8) road.ref[v] = st.idx[v];
      const de = Math.max(0, d - extra); if (de < roadDist[v]) roadDist[v] = de;
    }
    if (wSum > 0) heights[v] = heights[v] * keep + (tSum / wSum) * (1 - keep);
  }

  // Where an outer road crosses the sea, put the sea floor back under it, so the road stands on a bridge, not a dam.
  if (pre) for (const road of roads) {
    if (!road.outer && !road.spoke) continue;
    const R = Math.ceil((road.hw + 12) / CELL);
    for (let s = 0; s < road.n; s += 2) {
      const ci = Math.round((road.x[s] + HALF) / CELL), cj = Math.round((road.z[s] + HALF) / CELL);
      for (let j = Math.max(0, cj - R); j <= Math.min(N, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(N, ci + R); i++) {
        const v = j * V + i; if (pre[v] < SEA - 0.5 && pre[v] < heights[v]) heights[v] = pre[v];
      }
    }
  }

  // Cut the river valleys: a channel, a low bank either side, then valley sides of about 22 degrees up to the ground.
  // Where that cuts away the ground under a road, the road is left on a bridge. wetH is each point's water level.
  const wetH = rivers.length ? new Float32Array(V * V).fill(-1e9) : null, under = rivers.length ? new Uint8Array(V * V) : null;
  if (rivers.length) {
    const RR = 240, R = Math.ceil(RR / CELL), d2 = new Float32Array(V * V).fill(RR * RR), near = new Int32Array(V * V).fill(-1), which = new Int8Array(V * V);
    rivers.forEach((rv, k) => {
      for (let s = 0; s < rv.n; s++) {
        const px = rv.x[s], pz = rv.z[s], ci = Math.round((px + HALF) / CELL), cj = Math.round((pz + HALF) / CELL);
        for (let j = Math.max(0, cj - R); j <= Math.min(N, cj + R); j++) {
          const dz = j * CELL - HALF - pz, row = j * V;
          for (let i = Math.max(0, ci - R); i <= Math.min(N, ci + R); i++) {
            const dx = i * CELL - HALF - px, dd = dx * dx + dz * dz;
            if (dd < d2[row + i]) { d2[row + i] = dd; near[row + i] = s; which[row + i] = k; }
          }
        }
      }
    });
    const cut = new Uint8Array(V * V);
    for (let v = 0; v < V * V; v++) {
      if (near[v] < 0) continue;
      // distance to the river's line itself (the two segments either side of the nearest point), with its width,
      // depth and water level taken part way along, so the banks run smoothly instead of in 4 m scallops
      const rv = rivers[which[v]], s0 = near[v], x = (v % V) * CELL - HALF, z = ((v / V) | 0) * CELL - HALF;
      let d = Math.sqrt(d2[v]), w = rv.hw[s0], wl = rv.wl[s0], dep = rv.depth[s0];
      for (const a of [s0 - 1, s0]) {
        const b = a + 1; if (a < 0 || b >= rv.n) continue;
        const ex = rv.x[b] - rv.x[a], ez = rv.z[b] - rv.z[a], l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - rv.x[a]) * ex + (z - rv.z[a]) * ez) / l2)), dd = Math.hypot(x - rv.x[a] - ex * t, z - rv.z[a] - ez * t);
        if (dd < d) { d = dd; w = rv.hw[a] + (rv.hw[b] - rv.hw[a]) * t; wl = rv.wl[a] + (rv.wl[b] - rv.wl[a]) * t; dep = rv.depth[a] + (rv.depth[b] - rv.depth[a]) * t; }
      }
      const e = d - w;
      const tgt = e < 0 ? wl - 0.25 - dep * (1 - (d / w) ** 2) : wl - 0.25 + 2.8 * smooth(e / 9) + Math.max(0, e - 6) * 0.4;
      if (tgt < heights[v]) { if (roadDist[v] < 14 && heights[v] - tgt > 1.5) under[v] = 1; heights[v] = tgt; cut[v] = 1; }
      if (e < 14) wetH[v] = wl;
    }
    // soften what was cut (away from roads): two passes of a 3 x 3 average take out the last steps of the grid
    for (let pass = 0; pass < 2; pass++) {
      const h0 = heights.slice();
      for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
        const v = j * V + i; if (!cut[v] || under[v] || roadDist[v] < 12) continue;
        let sum = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) sum += h0[v + b * V + a];
        heights[v] = Math.min(h0[v] + 0.6, sum / 9);
      }
    }
  }
  const wetV = (v) => wetH && wetH[v] > SEA ? wetH[v] : SEA;

  // ---- which ground can a car get to from the roads without tackling anything steeper than about 25 degrees? ----
  const RC = 3, RN = N / RC, reach = new Uint8Array(RN * RN), steepR = new Float32Array(RN * RN);
  {
    // steepness of each 12 m cell = the steepest spot inside it, so a narrow bank is not averaged away
    const hv = (i, j) => heights[Math.max(0, Math.min(N, j)) * V + Math.max(0, Math.min(N, i))];
    for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
      let m = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const vi = i * RC + a, vj = j * RC + b; m = Math.max(m, Math.hypot(hv(vi + 1, vj) - hv(vi - 1, vj), hv(vi, vj + 1) - hv(vi, vj - 1)) / (2 * CELL)); }
      steepR[j * RN + i] = SEA !== null && hv(i * RC, j * RC) < wetV(Math.min(N, j * RC) * V + Math.min(N, i * RC)) + 0.6 ? 9 : m;     // the sea (and a river) counts as a wall
    }
    const queue = [];
    for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) if (roadDist[j * RC * V + i * RC] < 8 && !(under && under[j * RC * V + i * RC])) { reach[j * RN + i] = 1; queue.push(j * RN + i); }
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q], ci = c % RN, cj = (c / RN) | 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const ni = ci + a, nj = cj + b, nc = nj * RN + ni;
        if (ni < 2 || nj < 2 || ni >= RN - 2 || nj >= RN - 2 || reach[nc] || steepR[nc] > 0.47) continue;
        reach[nc] = 1; queue.push(nc);
      }
    }
  }
  const rcell = (x, z) => Math.max(0, Math.min(RN - 1, Math.round((z + HALF) / (RC * CELL)))) * RN + Math.max(0, Math.min(RN - 1, Math.round((x + HALF) / (RC * CELL))));
  // gentle, reachable ground: this spot and everything within 24 m of it
  const easy = (x, z, lim = 0.2) => { if (steepR[rcell(x, z)] > lim) return false; for (let a = -24; a <= 24; a += 12) for (let b = -24; b <= 24; b += 12) { const c = rcell(x + a, z + b); if (!reach[c] || steepR[c] > lim + 0.14) return false; } return true; };
  const gridH = (x, z) => heights[Math.round((z + HALF) / CELL) * V + Math.round((x + HALF) / CELL)];
  {
    let sd = seed * 977 + 13, tries = 0; const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    for (const name of RG.camps) {
      while (tries++ < 9000) {
        const x = (rnd() - 0.5) * 2300, z = (rnd() - 0.5) * 2300, h = gridH(x, z);
        if (h > snowline - 35 || (SEA !== null && h < SEA + 5) || !easy(x, z)) continue;
        const gap = roadGap(x, z); if (gap < 170 || gap > 520) continue;
        if (places.sites.some((s) => Math.hypot(s.x - x, s.z - z) < 420)) continue;
        pads.push({ x, z, r: 14, blend: 46, h });
        places.sites.push({ name, x, z, wild: true, hutX: x + 9, hutZ: z + 4, yaw: rnd() * 6.28 });
        break;
      }
    }
    places.sites.push(...outerSites);
    // time trial checkpoints: rough waypoints, each moved to the gentlest reachable ground nearby
    const calm = (x0, z0) => {
      let best = null, bs = 1e9;
      for (let a = -96; a <= 96; a += 12) for (let b = -96; b <= 96; b += 12) {
        const x = x0 + a, z = z0 + b; if (!easy(x, z, 0.26)) continue;
        const sc = steepR[rcell(x, z)] + Math.hypot(a, b) * 0.0015; if (sc < bs) { bs = sc; best = { x, z }; }
      }
      return best;
    };
    const via = (n) => { const s = places.sites.find((q) => q.name === n); return s ? { x: s.x, z: s.z, name: n } : null; };
    places.trial.gates = [...RG.trialGates.map(([x, z]) => calm(x, z)), via(RG.trialVia)].filter(Boolean);
  }
  // flat lots for the camps (they sit well away from the roads, so a plain blend into the shaped ground is enough)
  for (const p of pads) {
    const R = p.r + p.blend, i0 = Math.max(0, Math.floor((p.x - R + HALF) / CELL)), i1 = Math.min(N, Math.ceil((p.x + R + HALF) / CELL)), j0 = Math.max(0, Math.floor((p.z - R + HALF) / CELL)), j1 = Math.min(N, Math.ceil((p.z + R + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * CELL - HALF - p.x, j * CELL - HALF - p.z); if (d >= R) continue;
      const a = 1 - smooth((d - p.r) / p.blend), v = j * V + i;
      heights[v] += (p.h - heights[v]) * a;
      const de = Math.max(0, d - p.r + 8.5); if (de < roadDist[v]) roadDist[v] = de;
    }
  }

  // normals + surface types
  const normals = new Float32Array(V * V * 3), surf = new Uint8Array(V * V), snowT = new Float32Array(V * V), rockT = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const v = j * V + i;
    const hl = heights[j * V + Math.max(0, i - 1)], hr = heights[j * V + Math.min(N, i + 1)];
    const hd = heights[Math.max(0, j - 1) * V + i], hu = heights[Math.min(N, j + 1) * V + i];
    const nx = -(hr - hl) / (2 * CELL), nz = -(hu - hd) / (2 * CELL), il = 1 / Math.hypot(nx, 1, nz);
    normals[v * 3] = nx * il; normals[v * 3 + 1] = il; normals[v * 3 + 2] = nz * il;
    const x = i * CELL - HALF, z = j * CELL - HALF, h = heights[v];
    rockT[v] = 1 - smooth((il - 0.72) / 0.13);
    snowT[v] = smooth((h + 34 * noise2(x / 90, z / 90) - (snowline - 22)) / 44) * smooth((il - 0.5) / 0.22);
    surf[v] = roadDist[v] < 9 ? SURF.DIRT : SEA !== null && h < wetV(v) + 2.5 ? SURF.DIRT : snowT[v] > 0.5 ? SURF.SNOW : rockT[v] > 0.5 ? SURF.ROCK : SURF.GRASS;
  }

  // trim the trail where it overlaps the ring road
  const nearRing = (x, z) => { let m = 1e9; for (let i = 0; i < ring.n; i += 2) { const d = Math.hypot(ring.x[i] - x, ring.z[i] - z); if (d < m) m = d; } return m; };
  let t0 = 0, t1 = trail.n - 1;
  while (t0 < trail.n - 2 && nearRing(trail.x[t0], trail.z[t0]) < ring.hw - 0.6) t0++;
  while (t1 > 1 && nearRing(trail.x[t1], trail.z[t1]) < ring.hw - 0.6) t1--;
  trail.from = t0; trail.to = t1; ring.from = 0; ring.to = ring.n - 1;
  for (const road of roads) {     // the outer loop and its spokes (trimmed where a spoke runs onto the road at its end)
    if (road === ring || road === trail) continue;
    if (road.closed) { road.from = 0; road.to = road.n - 1; continue; }
    const loop = roads.find((q) => q.outer), gap = (L, x, z) => { let m = 1e9; for (let i = 0; i < L.n; i += 2) m = Math.min(m, Math.hypot(L.x[i] - x, L.z[i] - z)); return m; };
    let a = 0, b = road.n - 1;
    while (a < road.n - 2 && gap(ring, road.x[a], road.z[a]) < ring.hw - 0.6) a++;
    while (b > 1 && gap(loop, road.x[b], road.z[b]) < loop.hw - 0.6) b--;
    road.from = a; road.to = b;
  }

  const world = { region: regionId, regionDef: RG, sea: SEA, heights, normals, surf, snowT, rockT, roadDist, roads, noise: noise2, seed, trees: [], treeHash: new Map(), places, frame, half: HALF, reach, reachN: RN, steepR };

  world.rivers = rivers;
  // the water level here: the sea, or a river's surface where it runs above the sea (null: a region without water)
  world.waterAt = (x, z) => {
    if (SEA === null) return null;
    if (!wetH) return SEA;
    const i = Math.max(0, Math.min(N, Math.round((x + HALF) / CELL))), j = Math.max(0, Math.min(N, Math.round((z + HALF) / CELL)));
    return wetV(j * V + i);
  };
  // ground height from the grid alone (under a bridge this is the valley floor, not the deck)
  const gridAt = (x, z) => {
    let gx = (x + HALF) / CELL, gz = (z + HALF) / CELL; gx = Math.max(0, Math.min(N - 1e-4, gx)); gz = Math.max(0, Math.min(N - 1e-4, gz));
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, v = j * V + i;
    return (heights[v] * (1 - fx) + heights[v + 1] * fx) * (1 - fz) + (heights[v + V] * (1 - fx) + heights[v + V + 1] * fx) * fz;
  };
  world.ground = gridAt;
  // bridges: stretches of road standing more than a metre over the ground below
  world.bridges = [];
  if (rivers.length || pre) roads.forEach((road, r) => {
    let run = null;
    const flush = () => {
      if (!run) return;
      const b = { road: r, i0: Math.max(road.from, run[0] - 3), i1: Math.min(road.to, run[1] + 3) }; world.bridges.push(b); run = null;
      road.deck = road.deck || new Uint8Array(road.n); for (let i = b.i0; i <= b.i1; i++) road.deck[i] = 1;
    };
    for (let i = road.from; i <= road.to; i++) {
      if (road.h[i] - gridAt(road.x[i], road.z[i]) > 1) { if (run && i - run[1] <= 4) run[1] = i; else { flush(); run = [i, i]; } }
    }
    flush();
  });

  // project a point onto a road near sample s; returns lateral distance, writes height + tangent
  const proj = { h: 0, tx: 0, tz: 1, slope: 0, d: 0, px: 0, pz: 0, i: 0 };
  const RAMP = 1.6;   // metres of embankment between the road surface and the ground beside it
  function projectRoad(road, s, x, z) {
    let best = 1e9;
    for (let k = s - 4; k <= s + 3; k++) {
      let a = k, b = k + 1;
      if (road.closed) { a = (a + road.n) % road.n; b = (b + road.n) % road.n; }
      else if (a < road.from || b > road.to) continue;
      const ax = road.x[a], az = road.z[a], ex = road.x[b] - ax, ez = road.z[b] - az, l2 = ex * ex + ez * ez;
      let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
      if (d < best) { best = d; const l = Math.sqrt(l2); proj.h = road.h[a] + (road.h[b] - road.h[a]) * t; proj.tx = ex / l; proj.tz = ez / l; proj.slope = (road.h[b] - road.h[a]) / l; proj.px = ax + ex * t; proj.pz = az + ez * t; proj.i = a; }
    }
    proj.d = best; return best;
  }

  // ground query: returns height, fills out.nx/ny/nz and out.surf
  // y (optional): the height asked from; more than 2 m under a bridge deck, the deck is ignored (driving under it)
  world.sample = function (x, z, out, y) {
    let gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    gx = gx < 0 ? 0 : gx > N - 1e-4 ? N - 1e-4 : gx; gz = gz < 0 ? 0 : gz > N - 1e-4 ? N - 1e-4 : gz;
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, v = j * V + i;
    const nv = (fz > 0.5 ? j + 1 : j) * V + (fx > 0.5 ? i + 1 : i);
    const h00 = heights[v], h10 = heights[v + 1], h01 = heights[v + V], h11 = heights[v + V + 1];
    const hGrid = (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
    for (let r = 0; r < roads.length; r++) {
      const s = roads[r].ref[nv];
      if (s < 0) continue;
      const hw = roads[r].hw, d = projectRoad(roads[r], s, x, z);
      if (d >= hw + RAMP) continue;
      if (y !== undefined && roads[r].deck && roads[r].deck[proj.i] && y < proj.h - 2.0) continue;
      const t = d <= hw || (roads[r].deck && roads[r].deck[proj.i]) ? 0 : (d - hw) / RAMP;   // a bridge deck stays flat out to its walls
      if (out) {
        let gx = proj.tx * proj.slope, gz = proj.tz * proj.slope;
        if (t > 0) { const k = (hGrid - proj.h) / RAMP / d; gx += (x - proj.px) * k; gz += (z - proj.pz) * k; }
        const il = 1 / Math.hypot(gx, 1, gz);
        out.nx = -gx * il; out.ny = il; out.nz = -gz * il; out.surf = t < 0.5 ? roads[r].surf : surf[nv];
      }
      return proj.h + (hGrid - proj.h) * t;
    }
    if (out) {
      const dhx = ((h10 - h00) * (1 - fz) + (h11 - h01) * fz) / CELL, dhz = ((h01 - h00) * (1 - fx) + (h11 - h10) * fx) / CELL;
      const il = 1 / Math.hypot(dhx, 1, dhz);
      out.nx = -dhx * il; out.ny = il; out.nz = -dhz * il; out.surf = surf[nv];
    }
    return hGrid;
  };

  world.nearestRoad = function (x, z) {
    let best = 1e18, res = null;
    for (const road of roads) for (let i = road.from; i <= road.to; i++) {
      const d = (road.x[i] - x) ** 2 + (road.z[i] - z) ** 2;
      if (d < best) { best = d; const k = Math.min(i + 1, road.n - 1) === i ? i - 1 : i; const b = road.closed ? (k + 1) % road.n : k + 1; res = { x: road.x[i], z: road.z[i], h: road.h[i], yaw: Math.atan2(road.x[b] - road.x[k], road.z[b] - road.z[k]), road }; }
    }
    return res;
  };

  // trees
  // Trees: first the original 3072 m square, drawn exactly as before (so the first maps' trees all stay put), then, on
  // a bigger map, more in the new land round it at about the same density.
  world.placeTrees = function (count) {
    const q = {}, S0 = Math.min(SIZE, 3072);
    const plant = (rnd, n, span, outside) => {
      let tries = 0, skipped = 0, placed = 0;
      while (placed + skipped < n && tries++ < n * 12) {
        const x = (rnd() - 0.5) * (span - 80), z = (rnd() - 0.5) * (span - 80);
        if (outside && Math.abs(x) < S0 / 2 - 40 && Math.abs(z) < S0 / 2 - 40) continue;
        const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL), v = j * V + i;
        if (surf[v] !== SURF.GRASS || roadDist[v] < 16 || normals[v * 3 + 1] < 0.86) continue;
        const h = world.sample(x, z, q);
        if (h > treeline - rnd() * 50 || (SEA !== null && h < world.waterAt(x, z) + 4)) continue;
        if (noise2(x / 260 + 40, z / 260) < -0.25 + rnd() * 0.3) continue;
        const t = { x, z, y: h, s: 0.75 + rnd() * 0.9, r: rnd() * 6.28 };
        if (world.towns && world.towns.length && world.inTown(x, z)) { skipped++; continue; }   // counted, so every other tree stays put
        world.trees.push(t); placed++;
        const key = ((x + HALF) >> 4) * 4096 + ((z + HALF) >> 4);
        if (!world.treeHash.has(key)) world.treeHash.set(key, []);
        world.treeHash.get(key).push(t);
      }
    };
    plant(mulberry32(seed * 31 + 5), count, S0, false);
    if (SIZE > S0) plant(mulberry32(seed * 31 + 77), Math.round(count * (SIZE * SIZE / (S0 * S0) - 1) * 0.8), SIZE, true);
  };
  // solid things the cars can hit, kept in the same 16 m buckets as the trees
  world.addCollider = function (x, z, rad) {
    const t = { x, z, y: world.sample(x, z), rad }, key = ((x + HALF) >> 4) * 4096 + ((z + HALF) >> 4);
    if (!world.treeHash.has(key)) world.treeHash.set(key, []);
    world.treeHash.get(key).push(t);
    return t;
  };
  for (const s of places.sites) { s.y = world.sample(s.x, s.z); s.hutY = world.sample(s.hutX, s.hutZ); world.addCollider(s.hutX, s.hutZ, 3.3); }
  for (const g of places.garages) {
    g.y = world.sample(g.x, g.z); g.by = world.sample(g.bx, g.bz);
    const f = g.f = frame(ring, g.idx);
    for (const k of [-4.6, 0, 4.6]) world.addCollider(g.bx + f.tx * k, g.bz + f.tz * k, 5.6);
  }
  for (const key in places.lines) {
    const L = places.lines[key], road = roads[L.road], f = frame(road, L.idx);
    Object.assign(L, { x: f.x, z: f.z, y: f.h, yaw: f.yaw, hw: road.hw, f });
    for (const sg of [-1, 1]) world.addCollider(f.x + f.lx * sg * (road.hw + 1.7), f.z + f.lz * sg * (road.hw + 1.7), 0.45);
  }
  { const t = places.trial; t.y = world.sample(t.x, t.z); for (const g of t.gates) g.y = world.sample(g.x, g.z); }
  // a bridge deck counts as easy, reachable ground for routes (the water or valley under it is a wall)
  for (const bb of world.bridges) { const road = roads[bb.road]; for (let i = bb.i0; i <= bb.i1; i++) { const c = rcell(road.x[i], road.z[i]); steepR[c] = Math.min(steepR[c], 0.05); reach[c] = 1; } }
  // where another road joins a bridge (a spoke meeting the outer loop out at sea), the railing on that side is left
  // open: b.open[side][i - i0] is 1 there (side 0 is the left edge, 1 the right), for the walls drawn and the stops
  for (const b of world.bridges) {
    const road = roads[b.road]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = b.i0; i <= b.i1; i++) { x0 = Math.min(x0, road.x[i]); x1 = Math.max(x1, road.x[i]); z0 = Math.min(z0, road.z[i]); z1 = Math.max(z1, road.z[i]); }
    const near = [];
    roads.forEach((q, r) => { if (r === b.road) return; const a = q.closed ? 0 : q.from ?? 0, e = q.closed ? q.n - 1 : q.to ?? q.n - 1;
      for (let i = a; i <= e; i++) if (q.x[i] > x0 - 25 && q.x[i] < x1 + 25 && q.z[i] > z0 - 25 && q.z[i] < z1 + 25) near.push(q.x[i], q.z[i], q.hw + 1.5); });
    b.open = [new Uint8Array(b.i1 - b.i0 + 1), new Uint8Array(b.i1 - b.i0 + 1)];
    if (!near.length) continue;
    for (let i = b.i0; i <= b.i1; i++) {
      const f = frame(road, i);
      [1, -1].forEach((sg, side) => { const x = f.x + f.lx * sg * (road.hw + 1), z = f.z + f.lz * sg * (road.hw + 1);
        for (let k = 0; k < near.length; k += 3) if (Math.hypot(near[k] - x, near[k + 1] - z) < near[k + 2]) { b.open[side][i - b.i0] = 1; break; } });
    }
    for (const o of b.open) { const c = o.slice(); for (let k = 0; k < o.length; k++) if (c[k]) for (let d = -3; d <= 3; d++) if (k + d >= 0 && k + d < o.length) o[k + d] = 1; }   // a little wider than the road itself
  }
  // bridge railings: a dense row of small round stops whose inner edge is the wall's inner face (hw + 0.85), solid
  // only at deck height; piers (every 26 m where the ground is well below): solid from the ground to under the deck
  world.piers = [];
  for (const b of world.bridges) {
    const road = roads[b.road];
    for (let i = b.i0; i <= b.i1; i++) {
      for (const half of [0, 0.5]) {
        if (half && i === b.i1) continue;
        const f = frame(road, i), g = half ? frame(road, i + 1) : f, fx = (f.x + g.x) / 2, fz = (f.z + g.z) / 2, fh = (f.h + g.h) / 2;
        [1, -1].forEach((sg, side) => { if (b.open[side][i - b.i0] || (half && b.open[side][i + 1 - b.i0])) return; const t = world.addCollider(fx + f.lx * sg * (road.hw + 1.95), fz + f.lz * sg * (road.hw + 1.95), 1.1); t.y = fh; t.lo = fh - 3; });
      }
      const f = frame(road, i), drop = f.h - gridAt(f.x, f.z);
      // where the deck is too low to drive under (the ends of the bridge), the space under it is solid
      if ((i - b.i0) % 2 === 0 && drop > 0.8 && drop < 3.4) for (let k = -road.hw - 1; k <= road.hw + 1.01; k += 1.5) { const t = world.addCollider(f.x + f.lx * k, f.z + f.lz * k, 0.95); t.y = f.h - drop; t.hi = f.h - 2.0; }
      if ((i - b.i0) % 13 === 6 && drop > 3.5) {
        world.piers.push({ x: f.x, z: f.z, yaw: f.yaw, top: f.h - 1.7, bottom: f.h - drop - 1.5, w: 2 * road.hw + 1 });
        for (let k = -road.hw; k <= road.hw + 0.01; k += 1.5) { const t = world.addCollider(f.x + f.lx * k, f.z + f.lz * k, 0.95); t.y = f.h - drop; t.hi = f.h - 2.4; }
      }
    }
  }
  // ---- towns: houses and shops along the ring road either side of each garage, on whatever ground is there (each
  // building stands on its own plinth, so the ground is not reshaped), plus street lamps and a sign at each end ----
  world.towns = [];
  {
    const rnd = mulberry32(seed * 53 + 11);
    const keep = [...places.sites.flatMap((q) => [[q.hutX, q.hutZ, 12], [q.x, q.z, 12]]), ...places.garages.flatMap((q) => [[q.bx, q.bz, 26], [q.x, q.z, 42]]),
      ...Object.values(places.lines).map((q) => [q.x, q.z, 12]), [places.trial.x, places.trial.z, 22], ...places.trial.gates.map((q) => [q.x, q.z, 30])];
    const rdAt = (x, z) => roadDist[Math.max(0, Math.min(N, Math.round((z + HALF) / CELL))) * V + Math.max(0, Math.min(N, Math.round((x + HALF) / CELL)))];
    (opts.towns === false ? [] : RG.towns || []).forEach((name, k) => {
      // the first two round the garages on the ring road, a third (bigger maps) on the outer loop
      const g = k < 2 ? places.garages[k] : places.outerTown; if (!g) return;
      const road = k < 2 ? ring : roads.find((q) => q.outer), n = road.n, wrap = (i) => ((Math.round(i) % n) + n) % n, f0 = frame(road, g.idx);
      const span = 115, town = { name, x: k < 2 ? g.x : f0.x, z: k < 2 ? g.z : f0.z, road: roads.indexOf(road), from: g.idx - span, to: g.idx + span, buildings: [], lamps: [], signs: [] }, B = town.buildings;
      for (const side of [-1, 1]) for (const row of [0, 1]) {
        let s = g.idx - span + rnd() * 5;
        while (s < g.idx + span - 4) {
          const near = Math.abs(s - g.idx) < span * 0.55, r = rnd();
          const kind = row ? (r < 0.8 ? 'house' : 'shed') : near ? (r < 0.5 ? 'shop' : r < 0.75 ? 'tall' : 'house') : (r < 0.7 ? 'house' : 'shop');
          const w = kind === 'tall' ? 11 + rnd() * 5 : kind === 'shed' ? 7 + rnd() * 4 : 8 + rnd() * 6, d = kind === 'shed' ? 6 + rnd() * 2 : 7 + rnd() * 4;
          const h = kind === 'tall' ? 8.5 + rnd() * 3 : kind === 'shop' ? 3.8 + rnd() * 1.6 : kind === 'shed' ? 3.2 : (rnd() < 0.4 ? 5.8 : 3.1);
          const si = wrap(s + w / 2 / road.ds), f = frame(road, si), lat = road.hw + 14 + (row ? 22 : 0) + d / 2 + rnd() * 2.5;
          // keep the outside of a bend clear (run-off room): turn over 60 m of road, and which way it turns
          const fa = frame(road, wrap(si - 15)), fb = frame(road, wrap(si + 15)), turn = Math.atan2(fa.tx * fb.tz - fa.tz * fb.tx, fa.tx * fb.tx + fa.tz * fb.tz);
          const outside = Math.abs(turn) > 60 / 320 && Math.sign(turn) === side;
          const x = f.x + f.lx * side * lat, z = f.z + f.lz * side * lat, yaw = Math.atan2(-f.lx * side, -f.lz * side);
          const cx = Math.cos(yaw), cz = Math.sin(yaw);   // the building's own x axis (along the road) is (cos yaw, -sin yaw)
          let lo = 1e9, hi = -1e9, ok = true;
          for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]]) {
            const px = x + cx * a * w + Math.sin(yaw) * b * d, pz = z - cz * a * w + Math.cos(yaw) * b * d, hh = gridAt(px, pz);
            lo = Math.min(lo, hh); hi = Math.max(hi, hh);
            if (rdAt(px, pz) < road.hw + 7 || (SEA !== null && hh < world.waterAt(px, pz) + 1.5)) ok = false;
          }
          if (ok && !outside && hi - lo < 4.5 && keep.every(([qx, qz, r]) => Math.hypot(qx - x, qz - z) > r + Math.max(w, d) / 2) && B.every((o) => Math.hypot(o.x - x, o.z - z) > (Math.max(o.w, o.d) + Math.max(w, d)) / 2 + 1)) {
            B.push({ x, z, yaw, w, d, h, kind, lo, hi, wall: rnd(), roof: rnd(), seed: rnd() });
          }
          s += (w + 3 + rnd() * (row ? 12 : 7)) / road.ds;
        }
      }
      for (let s = g.idx - span + 6; s < g.idx + span; s += 14) for (const side of [-1, 1]) {
        const f = frame(road, wrap(s)), x = f.x + f.lx * side * (road.hw + 4.5), z = f.z + f.lz * side * (road.hw + 4.5);
        if (rdAt(x, z) < road.hw + 3 || keep.some(([qx, qz, r]) => Math.hypot(qx - x, qz - z) < 10)) continue;
        town.lamps.push({ x, z, y: gridAt(x, z), yaw: Math.atan2(-f.lx * side, -f.lz * side) });
      }
      for (const [s, dir] of [[g.idx - span - 8, 1], [g.idx + span + 8, -1]]) {
        const f = frame(road, wrap(s)), side = -dir, x = f.x + f.lx * side * (road.hw + 5), z = f.z + f.lz * side * (road.hw + 5);
        town.signs.push({ x, z, y: gridAt(x, z), yaw: Math.atan2(-f.tx * dir, -f.tz * dir) });
      }
      for (const o of B) {          // solid: small round stops close together just inside each wall, so the walls are where they look
        const cx = Math.cos(o.yaw), cz = Math.sin(o.yaw), R = 0.9, W = (o.w + 0.3) / 2 - R, D = (o.d + 0.3) / 2 - R;
        const at = (a, b) => world.addCollider(o.x + cx * a + cz * b, o.z - cz * a + cx * b, R);
        for (const [L, fixed, along] of [[W, D, true], [W, -D, true], [D, W, false], [D, -W, false]]) {
          const m = Math.max(1, Math.ceil((2 * L) / 1.2));
          for (let j = 0; j <= m; j++) { const t = -L + (2 * L * j) / m; if (along) at(t, fixed); else at(fixed, t); }
        }
      }
      world.towns.push(town);
    });
  }
  // inside a town's built-up part (a building, or the yard round it): trees, bushes and stones keep out
  world.inTown = (x, z) => world.towns.some((t) => Math.hypot(t.x - x, t.z - z) < 420 && t.buildings.some((o) => Math.hypot(o.x - x, o.z - z) < Math.max(o.w, o.d) * 0.5 + 5));
  world.townAt = (x, z) => world.towns.find((t) => Math.hypot(t.x - x, t.z - z) < 420 && t.buildings.some((o) => Math.hypot(o.x - x, o.z - z) < 45)) || null;
  world.spawn = () => { const g = places.garages[0]; return { x: g.x, z: g.z, h: g.y, yaw: g.yaw }; };
  return world;
}
