// The marker logic: snapping a tap to a place, plain pins, arrival, and the map's view box. Run: node tests/nav.mjs
import assert from 'node:assert/strict';
import { mapPoints, pickPoint, arrived, mapView, pixelToWorld, worldToPixel, ARRIVE } from '../src/nav.js';
const zones = [{ kind: 'garage', g: { name: 'North Garage' }, x: 100, z: 200 }, { kind: 'race', label: 'Ring races', x: -300, z: 50 }];
const pts = mapPoints(zones, [{ name: 'Old Mill', x: 0, z: -400 }]);
assert.deepEqual(pts.map((p) => p.name), ['North Garage', 'Ring races', 'Old Mill']);
assert.equal(pickPoint(pts, 130, 190).name, 'North Garage');
assert.equal(pickPoint(pts, 130, 190, 10).kind, 'pin');
assert.equal(pickPoint(pts, -290, 60).kind, 'race');
const pin = pickPoint(pts, 500, 500); assert.equal(pin.kind, 'pin'); assert.equal(pin.x, 500);
assert.ok(arrived({ x: 0, z: 0 }, ARRIVE - 1, 0)); assert.ok(!arrived({ x: 0, z: 0 }, ARRIVE + 1, 0)); assert.ok(!arrived(null, 0, 0));
const v = mapView(pts, [], 2400); assert.ok(v.span > 600 && v.span < 2400);
for (const [x, z] of [[100, 200], [-300, 50], [0, -400]]) { const p = worldToPixel(x, z, 720, v); assert.ok(p.x > 0 && p.x < 720 && p.y > 0 && p.y < 720); const w = pixelToWorld(p.x, p.y, 720, v); assert.ok(Math.abs(w.x - x) < 1e-6 && Math.abs(w.z - z) < 1e-6); }
const lone = worldToPixel(100, 0, 720, { cx: 0, cz: 0, span: 2400 }); assert.ok(lone.x < 360);   // +x is drawn to the left
console.log('nav: all checks passed');
