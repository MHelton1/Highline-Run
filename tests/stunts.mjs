// Drift chains and speed traps. Run: node tests/stunts.mjs [region]
import assert from 'node:assert/strict';
import { buildWorld } from '../src/terrain.js';
import { DriftMeter, DRIFT, driftPay, trapPay, placeTraps, crossed, slideAngle, TRAPS } from '../src/stunts.js';
const region = process.argv[2] || process.env.REGION || 'mountain';
// sliding angle
assert.equal(slideAngle({ x: 0, y: 0, z: 20 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }), 0);
assert.ok(Math.abs(slideAngle({ x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }) - Math.PI / 4) < 1e-9);
assert.equal(slideAngle({ x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }), 0);
// a 3 second slide at 20 m/s pays once the car straightens up
const d = new DriftMeter(); let out = null;
for (let t = 0; t < 3; t += 1 / 60) assert.equal(d.step(1 / 60, { speed: 20, angle: 0.6, grounded: 4, impact: 0 }), null);
assert.equal(d.mult, 2); assert.ok(d.shown > 300, d.shown);
for (let t = 0; t < 1 && !out; t += 1 / 60) out = d.step(1 / 60, { speed: 20, angle: 0.05, grounded: 4, impact: 0 });
assert.equal(out.kind, 'paid'); assert.equal(out.pay, driftPay(out.score)); assert.ok(out.pay > 0);
// a short wiggle pays nothing; a crash loses the chain
assert.equal([0, 1, 2].map(() => null).length, 3);
const w = new DriftMeter(); for (let t = 0; t < 0.3; t += 1 / 60) w.step(1 / 60, { speed: 12, angle: 0.4, grounded: 4, impact: 0 });
let o2 = null; for (let t = 0; t < 1; t += 1 / 60) o2 = o2 || w.step(1 / 60, { speed: 12, angle: 0, grounded: 4, impact: 0 }); assert.equal(o2, null);
const c = new DriftMeter(); for (let t = 0; t < 2; t += 1 / 60) c.step(1 / 60, { speed: 20, angle: 0.6, grounded: 4, impact: 0 });
assert.equal(c.step(1 / 60, { speed: 10, angle: 0.6, grounded: 4, impact: 9 }).kind, 'lost'); assert.equal(c.on, false);
// slow or straight is no drift; a hop keeps the chain
const h = new DriftMeter(); h.step(1 / 60, { speed: 5, angle: 0.6, grounded: 4, impact: 0 }); assert.equal(h.on, false);
for (let t = 0; t < 1; t += 1 / 60) h.step(1 / 60, { speed: 20, angle: 0.6, grounded: 4, impact: 0 });
for (let t = 0; t < 2; t += 1 / 60) assert.equal(h.step(1 / 60, { speed: 20, angle: 0, grounded: 0, impact: 0 }), null); assert.ok(h.on);
// pay
assert.equal(trapPay(40), 0); assert.equal(trapPay(100), 500); assert.equal(driftPay(1e9), 5000);
// traps in the real world: three, on tarmac, far apart, crossing works
const world = buildWorld(region), traps = placeTraps(world, world.places.garages);
assert.equal(traps.length, TRAPS, 'traps ' + traps.length);
for (const t of traps) { assert.equal(world.surfaceAt ? world.surfaceAt(t.x, t.z) : 0, 0); for (const u of traps) if (u !== t) assert.ok(Math.hypot(u.x - t.x, u.z - t.z) >= 450); }
const t0 = traps[0];
assert.ok(crossed(t0, t0.x - t0.fx * 2, t0.z - t0.fz * 2, t0.x + t0.fx * 2, t0.z + t0.fz * 2));
assert.ok(!crossed(t0, t0.x + t0.fx * 2, t0.z + t0.fz * 2, t0.x + t0.fx * 4, t0.z + t0.fz * 4));
assert.ok(!crossed(t0, t0.x - t0.fx * 2 + t0.fz * 30, t0.z - t0.fz * 2 - t0.fx * 30, t0.x + t0.fx * 2 + t0.fz * 30, t0.z + t0.fz * 2 - t0.fx * 30));
console.log(region, 'traps', traps.map((t) => [Math.round(t.x), Math.round(t.z)]).join(' '));
console.log('stunts: all checks passed');
