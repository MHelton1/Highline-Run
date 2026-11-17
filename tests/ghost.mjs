// Ghost car: a recorded run survives packing and unpacking with centimetre accuracy, playback runs smoothly between
// samples, and the stored size stays small.
import assert from 'node:assert/strict';
import { GhostRecorder, encodeGhost, decodeGhost, ghostAt, GHOST_DT } from '../src/ghost.js';

const rec = new GhostRecorder({ car: 'hatch', paint: 3, up: [1, 0, 2, 0] });
const pose = (t) => { const a = t * 0.06, y = 0.3 * t; return { pos: { x: 900 * Math.cos(a), y: 100 + 40 * Math.sin(t * 0.1), z: 900 * Math.sin(a) }, quat: { x: 0, y: Math.sin((-a - Math.PI / 2) / 2) * Math.cos(0.05), z: Math.sin(0.05) * 0.2, w: Math.cos((-a - Math.PI / 2) / 2) } }; };
const norm = (q) => { const l = Math.hypot(q.x, q.y, q.z, q.w); return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }; };
for (let k = 0; k <= 240 * 120; k++) { const t = k / 120, p = pose(t); rec.sample(t, p.pos, norm(p.quat)); if (k % 2400 === 0 && k) rec.split(t); }
const str = encodeGhost(rec, 240), g = decodeGhost(str);
assert.ok(g, 'decodes'); assert.equal(g.car, 'hatch'); assert.equal(g.paint, 3); assert.equal(g.time, 240); assert.ok(g.splits.length >= 10);
assert.equal(g.n, rec.length); assert.ok(Math.abs(g.n - 240 / GHOST_DT) <= 2);
let worst = 0, worstQ = 0;
for (let i = 0; i < g.n; i++) { const o = i * 7; worst = Math.max(worst, Math.abs(g.poses[o] - rec.s[o]), Math.abs(g.poses[o + 1] - rec.s[o + 1]), Math.abs(g.poses[o + 2] - rec.s[o + 2])); for (let k = 3; k < 7; k++) worstQ = Math.max(worstQ, Math.abs(g.poses[o + k] - rec.s[o + k])); }
assert.ok(worst <= 0.006, 'positions within 6 mm: ' + worst); assert.ok(worstQ < 1e-4, 'rotations exact enough: ' + worstQ);
// playback between samples sits between them, and stays unit length
const P = {}, Q = {}; ghostAt(g, 100.05, P, Q); const a = pose(100), b = pose(100.1);
assert.ok(Math.hypot(P.x - (a.pos.x + b.pos.x) / 2, P.z - (a.pos.z + b.pos.z) / 2) < 0.05); assert.ok(Math.abs(Math.hypot(Q.x, Q.y, Q.z, Q.w) - 1) < 1e-6);
assert.equal(ghostAt(g, 239, P, Q), true); assert.equal(ghostAt(g, 400, P, Q), false, 'over after the run');
// a sign flip between neighbouring rotations (same orientation) does not spin the car the long way round
const r2 = new GhostRecorder({}); r2.sample(0, { x: 0, y: 0, z: 0 }, { x: 0, y: 0.7071, z: 0, w: 0.7071 }); r2.sample(0.1, { x: 1, y: 0, z: 0 }, { x: 0, y: -0.7071, z: 0, w: -0.7071 });
const g2 = decodeGhost(encodeGhost(r2, 0.1)); ghostAt(g2, 0.05, P, Q); assert.ok(Math.abs(Math.abs(Q.y) - 0.7071) < 1e-3);
assert.equal(decodeGhost('nonsense'), null); assert.equal(decodeGhost('{"v":1,"n":5,"d":"AAAA"}'), null);
console.log('ghost: 240 s run is', (str.length / 1024).toFixed(0), 'KB, worst position error', (worst * 1000).toFixed(1), 'mm');
console.log('ghost: all checks passed');
