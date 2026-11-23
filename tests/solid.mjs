// Solid things and bridges: a car drives under a bridge on the ground below (not lifted onto the deck), stops at a
// pier, and meets a building wall and a bridge railing with its body, not its middle.
// usage: node tests/solid.mjs  (coast, the region with bridges over dry ground; buildings checked on every region)
import assert from 'node:assert/strict';
import { buildWorld } from '../src/terrain.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec } from '../src/cars.js';

const dt = 1 / 120, GO = (thr = 1) => ({ steer: 0, throttle: thr, brake: 0, handbrake: false, analog: true });
const corners = (c) => { const B = c.spec.box, f = c.fwd, fl = Math.hypot(f.x, f.z), fx = f.x / fl, fz = f.z / fl, lx = fz, lz = -fx; return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [c.pos.x + fx * B.z * a + lx * B.x * b, c.pos.z + fz * B.z * a + lz * B.x * b]); };
const out = {};
// 1) buildings, every region: straight at the middle of a building's front at 16 m/s; how far does the body get in?
for (const R of ['mountain', 'desert', 'coast']) {
  const w = buildWorld(R); let worst = 0;
  const bs = w.towns.flatMap((t) => t.buildings).slice(0, 12);
  for (const o of bs) {
    const cx = Math.cos(o.yaw), cz = Math.sin(o.yaw), nzx = Math.sin(o.yaw), nzz = Math.cos(o.yaw);   // local z (depth) axis
    for (const sg of [1, -1]) {
      const sx = o.x + nzx * sg * (o.d / 2 + 9), sz = o.z + nzz * sg * (o.d / 2 + 9), car = new Vehicle(w, buildSpec('hatch'));
      car.place(sx, sz, Math.atan2(-nzx * sg, -nzz * sg)); car.vel.set(-nzx * sg * 16, 0, -nzz * sg * 16);
      let deep = 0;
      for (let k = 0; k < 240; k++) { car.step(dt, GO(0.6)); for (const [px, pz] of corners(car)) { const rx = px - o.x, rz = pz - o.z, a = rx * cx - rz * cz, b = rx * nzx + rz * nzz; if (Math.abs(a) < o.w / 2 - 0.3) deep = Math.max(deep, o.d / 2 + 0.15 - Math.abs(b)); } }
      worst = Math.max(worst, deep);
    }
  }
  out['building ' + R] = +worst.toFixed(2);
  assert.ok(worst < 0.5, R + ': the car body stays out of buildings (' + worst.toFixed(2) + ' m in)');
}
// 2) coast: under a bridge, a pier, a railing
const w = buildWorld('coast');
const dry = []; for (const b of w.bridges) { const road = w.roads[b.road]; for (let i = b.i0 + 4; i <= b.i1 - 4; i++) { const f = w.frame(road, i), g = w.ground(f.x, f.z), wl = w.waterAt(f.x, f.z); if (f.h - g > 6 && g > wl + 1.2) dry.push({ b, i, f, g }); } }
assert.ok(dry.length > 0, 'a bridge over dry ground');
// drive across under the deck, at right angles to it, from 25 m to one side
let under = null;
for (const q of dry) {
  const { f, g } = q, side = (s) => [f.x + f.lx * s, f.z + f.lz * s];
  const [sx, sz] = side(25); if (Math.abs(w.ground(sx, sz) - g) > 4) continue;
  const car = new Vehicle(w, buildSpec('hatch')); car.place(sx, sz, Math.atan2(-f.lx, -f.lz));
  let maxY = -1e9, passed = false;
  for (let k = 0; k < 120 * 8 && !passed; k++) { car.step(dt, GO(0.5)); const d = (car.pos.x - f.x) * f.lx + (car.pos.z - f.z) * f.lz; if (Math.abs(d) < 6) maxY = Math.max(maxY, car.pos.y - w.ground(car.pos.x, car.pos.z)); if (d < -12) passed = true; }
  under = { at: q.i, deckAbove: +(f.h - g).toFixed(1), rideHeight: +maxY.toFixed(2), passed };
  if (passed) break;
}
out.under = under; console.log('under', JSON.stringify(under));
assert.ok(under && under.passed && under.rideHeight < 2, 'drives under the bridge on the ground');
// a pier: drive along under the deck into one
const pier = w.piers.find((p) => { const g = w.ground(p.x, p.z), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); return g > w.waterAt(p.x, p.z) + 1 && p.top - g > 5 && Math.abs(w.ground(p.x - fx * 20, p.z - fz * 20) - g) < 3; });
out.pierFound = !!pier;
if (pier) {
  const fx = Math.sin(pier.yaw), fz = Math.cos(pier.yaw), car = new Vehicle(w, buildSpec('hatch'));
  car.place(pier.x - fx * 20, pier.z - fz * 20, pier.yaw); car.pos.y = w.ground(car.pos.x, car.pos.z) + car.restH + 0.1; car.vel.set(fx * 12, 0, fz * 12);   // on the ground, under the deck
  let closest = 1e9; for (let k = 0; k < 360; k++) { car.step(dt, GO(0.4)); closest = Math.min(closest, (pier.x - car.pos.x) * fx + (pier.z - car.pos.z) * fz); }
  out.pier = +closest.toFixed(2);
  assert.ok(closest > 1.5, 'the pier stops the car');
}
// a railing: on a deck, steer into the side at about 25 degrees and 20 m/s
const deck = w.bridges.find((b) => b.i1 - b.i0 > 40); const road = w.roads[deck.road], f0 = w.frame(road, deck.i0 + 12);
{ const car = new Vehicle(w, buildSpec('hatch')), yaw = f0.yaw + 0.45; car.place(f0.x, f0.z, yaw); car.vel.set(Math.sin(yaw) * 20, 0, Math.cos(yaw) * 20);
  let deepest = -1e9; for (let k = 0; k < 360; k++) { car.step(dt, GO(0.5)); const ii = deck.i0 + 12 + Math.round(k / 120 * 20 / road.ds); for (const [px, pz] of corners(car)) { let best = 1e9, off = 0; for (let i = deck.i0; i <= deck.i1; i++) { const d = (road.x[i] - px) ** 2 + (road.z[i] - pz) ** 2; if (d < best) { best = d; const fr = w.frame(road, i); off = Math.abs((px - fr.x) * fr.lx + (pz - fr.z) * fr.lz); } } deepest = Math.max(deepest, off - (road.hw + 0.85)); } }
  out.railing = { past: +deepest.toFixed(2), onDeck: car.pos.y > f0.h - 1 };
  assert.ok(deepest < 0.45 && car.pos.y > f0.h - 1.5, 'the railing holds the car body on the deck'); }
console.log(JSON.stringify(out));
console.log('solid: all checks passed');
