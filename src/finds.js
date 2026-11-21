// Hidden finds: twelve crates and one old car tucked away in each region, plus three jump ramps. All placed from the
// region's own seed on ground a car can get to, away from the roads, the pickup spots and the race courses, so every
// player finds them in the same places. The ramps are real ground: they are laid over the terrain's height query.
// Pure math (runs in node).
import { SIZE, HALF, CELL, V, SURF } from './terrain.js';

export const CRATES = 12, CRATE_PAY = 250, CRATE_R = 4.5, BARN_R = 9;
// the old car hidden in each region (see cars.js)
export const BARN_CAR = { mountain: 'ridge', desert: 'mesa', coast: 'breeze' };
// air time: pays on landing after this long off the ground (outside races), and a goal for a really long one
export const AIR_MIN = 0.9, AIR_GOAL = 2;
export const airPay = (t) => (t < AIR_MIN ? 0 : Math.round(t * t * 80 / 10) * 10);

// A kicker ramp, in its own frame: u runs from the foot (0) up to the lip (len), v across. A curved face (gentle at
// the foot, about 20 degrees at the lip), a short flat top, a slope down the back, and bevelled sides.
export const RAMP = { len: 11, top: 1.4, back: 6, h: 2.5, half: 2.4, bevel: 2.4 };
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export function rampRise(r, x, z) {
  const dx = x - r.x, dz = z - r.z, u = dx * r.fx + dz * r.fz, v = Math.abs(dx * r.fz - dz * r.fx), R = RAMP;
  if (u <= 0 || v >= R.half + R.bevel || u >= R.len + R.top + R.back) return 0;
  const t = u / R.len, p = u < R.len ? R.h * (0.35 * t + 0.65 * t * t) : u < R.len + R.top ? R.h : R.h * (1 - (u - R.len - R.top) / R.back);
  return v <= R.half ? p : p * (1 - sm((v - R.half) / R.bevel));
}

// lay the ramps into the world's ground query (call once, after the terrain mesh and props are built)
export function addRamps(world, ramps) {
  const base = world.sample, E = 0.25;
  for (const r of ramps) { r.cx = r.x + r.fx * 9; r.cz = r.z + r.fz * 9; }
  const RR = 13 * 13;
  world.ramps = ramps;
  world.sample = function (x, z, out) {
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i]; if ((x - r.cx) ** 2 + (z - r.cz) ** 2 > RR) continue;
      const k = rampRise(r, x, z); if (k <= 0) continue;
      const h = base(x, z, out) + k;
      if (out) {
        const gx = (base(x + E, z) + rampRise(r, x + E, z) - h) / E, gz = (base(x, z + E) + rampRise(r, x, z + E) - h) / E, il = 1 / Math.hypot(gx, 1, gz);
        out.nx = -gx * il; out.ny = il; out.nz = -gz * il; out.surf = SURF.ASPHALT;
      }
      return h;
    }
    return base(x, z, out);
  };
}

const mulberry = (a) => () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const segDist = (x, z, a, b) => { const ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1; let t = ((x - a.x) * ex + (z - a.z) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(x - a.x - ex * t, z - a.z - ez * t); };

// where everything goes: { crates: [{ i, x, z, y }], barn: { x, z, y, yaw, car }, ramps: [{ x, z, y, fx, fz, yaw }] }
// races: the region's events (buildRaces), so nothing sits on a course
export function placeFinds(world, races = []) {
  const P = world.places, RN = world.reachN, RCS = SIZE / RN, rnd = mulberry(world.seed * 7919 + 101);
  const rcell = (x, z) => Math.max(0, Math.min(RN - 1, Math.round((z + HALF) / RCS))) * RN + Math.max(0, Math.min(RN - 1, Math.round((x + HALF) / RCS)));
  const road = (x, z) => world.roadDist[Math.max(0, Math.min(V - 1, Math.round((z + HALF) / CELL))) * V + Math.max(0, Math.min(V - 1, Math.round((x + HALF) / CELL)))];
  // gentle, reachable ground here and for r metres around
  const easy = (x, z, lim, r) => { for (let a = -r; a <= r; a += 12) for (let b = -r; b <= r; b += 12) { const c = rcell(x + a, z + b); if (!world.reach[c] || world.steepR[c] > lim) return false; } return true; };
  const dry = (x, z) => world.sea == null || world.sample(x, z) > world.waterAt(x, z) + 3;
  // things to keep clear of: pickup spots and huts, garages, start lines, and every race course
  const spots = [...P.sites.flatMap((s) => [s, { x: s.hutX, z: s.hutZ }]), ...P.garages.flatMap((g) => [g, { x: g.bx, z: g.bz }]), ...Object.values(P.lines), P.trial];
  const courses = [];
  for (const d of races) { const gs = d.gates || []; for (let i = 1; i < gs.length; i++) courses.push([gs[i - 1], gs[i]]); if (d.kind === 'trial' && gs.length) courses.push([P.trial, gs[0]]); }
  const clear = (x, z, spot, course) => spots.every((s) => Math.hypot(s.x - x, s.z - z) > spot) && courses.every(([a, b]) => segDist(x, z, a, b) > course);
  const pick = (n, ok) => { for (let k = 0; k < n; k++) { const x = (rnd() - 0.5) * (SIZE - 360), z = (rnd() - 0.5) * (SIZE - 360); if (ok(x, z)) return { x, z }; } return null; };

  // the hidden car: an old shed on calm ground well away from the roads
  let barn = null;
  for (const [lo, hi, lim] of [[180, 650, 0.16], [120, 800, 0.22], [60, 1000, 0.3]]) {
    barn = pick(5000, (x, z) => { const d = road(x, z); return d > lo && d < hi && dry(x, z) && easy(x, z, lim, 24) && clear(x, z, 260, 70); });
    if (barn) break;
  }
  if (!barn) barn = { x: P.trial.x, z: P.trial.z };
  barn.y = world.sample(barn.x, barn.z); barn.car = BARN_CAR[world.region] || BARN_CAR.mountain;
  { const nr = world.nearestRoad(barn.x, barn.z); barn.yaw = Math.atan2(nr.x - barn.x, nr.z - barn.z); }   // its open side faces the way in

  // crates: a third close to the roads, the rest further out, and never two close together
  const crates = [];
  for (let i = 0; i < CRATES; i++) {
    const near = i % 3 === 0, gap = 230;
    let c = null;
    for (const shrink of [1, 0.75, 0.5]) {
      c = pick(4000, (x, z) => { const d = road(x, z); return (near ? d > 30 && d < 140 : d > 90 && d < 900) && dry(x, z) && easy(x, z, 0.4, 0) && clear(x, z, 70, 20)
        && Math.hypot(x - barn.x, z - barn.z) > 150 && crates.every((q) => Math.hypot(q.x - x, q.z - z) > gap * shrink); });
      if (c) break;
    }
    if (!c) continue;
    c.i = crates.length; c.y = world.sample(c.x, c.z); crates.push(c);
  }

  // ramps: beside the roads, facing downhill, with a clear, gentle run-in and landing
  const downhill = (x, z) => { const e = 6, gx = (world.sample(x + e, z) - world.sample(x - e, z)) / (2 * e), gz = (world.sample(x, z + e) - world.sample(x, z - e)) / (2 * e), g = Math.hypot(gx, gz); return g > 0.01 ? [-gx / g, -gz / g] : [1, 0]; };
  const ramps = [];
  for (let k = 0; k < 3; k++) {
    let at = null;
    for (const lim of [0.16, 0.22, 0.3]) {
      at = pick(6000, (x, z) => {
        const d = road(x, z); if (d < 28 || d > 120 || !dry(x, z) || !clear(x, z, 90, 60) || ramps.some((q) => Math.hypot(q.x - x, q.z - z) < 500)) return false;
        if (Math.hypot(x - barn.x, z - barn.z) < 120 || crates.some((q) => Math.hypot(q.x - x, q.z - z) < 40)) return false;
        const [fx, fz] = downhill(x, z);
        for (let s = -36; s <= 60; s += 12) { const px = x + fx * s, pz = z + fz * s; if (!easy(px, pz, lim, 0) || !dry(px, pz) || road(px, pz) < 10) return false; }
        return true;
      });
      if (at) break;
    }
    if (!at) continue;
    const [fx, fz] = downhill(at.x, at.z);
    ramps.push({ x: at.x, z: at.z, y: world.sample(at.x, at.z), fx, fz, yaw: Math.atan2(fx, fz) });
  }
  return { crates, barn, ramps };
}

// trees standing where a find goes are taken away (call after world.placeTrees, before the trees are drawn)
export function clearTrees(world, finds) {
  const spots = [...finds.crates.map((c) => [c.x, c.z, 7]), [finds.barn.x, finds.barn.z, 16], ...finds.ramps.flatMap((r) => [-36, -18, 0, 18, 36, 54].map((u) => [r.x + r.fx * u, r.z + r.fz * u, 14]))];
  const keep = (t) => spots.every(([x, z, r]) => (t.x - x) ** 2 + (t.z - z) ** 2 > r * r);
  world.trees = world.trees.filter(keep);
  for (const [k, list] of world.treeHash) { const l = list.filter((t) => t.rad != null || keep(t)); if (l.length !== list.length) world.treeHash.set(k, l); }
}

// compass words for a hint
const COMPASS = ['north', 'north-west', 'west', 'south-west', 'south', 'south-east', 'east', 'north-east'];
// north is +z and west is +x on this map (see the minimap)
export const compass = (dx, dz) => COMPASS[(Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) + 8) % 8];

// where to look for the hidden car: the nearest named place, a direction and a rough distance in metres
export function barnHint(world, barn) {
  let best = null, bd = 1e9;
  for (const s of [...world.places.sites, ...world.places.garages]) { const d = Math.hypot(barn.x - s.x, barn.z - s.z); if (d < bd) { bd = d; best = s; } }
  return { from: best.name, dir: compass(barn.x - best.x, barn.z - best.z), dist: Math.round(bd / 50) * 50 };
}

export const popcount = (n) => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };
