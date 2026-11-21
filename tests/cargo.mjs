// Cargo kinds: pay and time limits, fragile loads breaking, hot loads drawing patrols from further away, and the rival
// smuggler's pace against the time limit on every route. usage: node tests/cargo.mjs
import assert from 'node:assert';
import { buildWorld } from '../src/terrain.js';
import { Vehicle } from '../src/vehicle.js';
import { Game, Rival, CARGO, CARGO_IDS, RIVAL_DUE } from '../src/jobs.js';
const w = buildWorld(process.env.REGION); w.placeTrees(w.regionDef.treeCount[1]);
const dt = 1 / 120;
const sp = w.spawn(), car = new Vehicle(w); car.place(sp.x, sp.z, sp.yaw);
const bank = { cash: 0, runs: 0 }, g = new Game(w, car, bank);

// first offers are plain freight; later offers are mixed, never two of the same special kind at once
assert.ok(g.offers.every((s) => g.kindOf(s) === 'freight'), 'first run is freight');
bank.runs = 5; const seen = {};
for (let i = 0; i < 400; i++) {
  g.offers = []; g.kinds.clear(); g.refill(null);
  const ks = g.offers.map((s) => g.kindOf(s)); for (const k of ks) seen[k] = (seen[k] || 0) + 1;
  const special = ks.filter((k) => k !== 'freight'); assert.equal(new Set(special).size, special.length, 'no repeated special kind');
}
assert.deepEqual(Object.keys(seen).sort(), [...CARGO_IDS].sort(), 'every kind turns up'); console.log('offer mix over 400 boards', JSON.stringify(seen));

// pay and time for the same route
const from = w.places.sites[0], jobs = {}, real = Math.random;
for (const k of CARGO_IDS) { let s = 7; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; g.startJob(from, k); jobs[k] = g.job; g.job = null; g.rival = null; }
Math.random = real;
for (const k of CARGO_IDS) {
  assert.equal(jobs[k].to, jobs.freight.to);
  assert.ok(Math.abs(jobs[k].pay / jobs.freight.pay - CARGO[k].pay) < 0.02, k + ' pay');
  assert.ok(Math.abs(jobs[k].time / jobs.freight.time - CARGO[k].time) < 0.02, k + ' time');
}
console.log('same route:', CARGO_IDS.map((k) => `${k} $${jobs[k].pay} in ${jobs[k].time} s`).join(', '));

// knocks: freight bottoms out at 30%, fragile breaks
g.startJob(from, 'freight'); for (let i = 0; i < 40; i++) { g.hurtT = 0; g.damage(20); } assert.equal(g.job.cond, 0.3, 'freight keeps 30%'); g.job = null; g.rival = null;
g.events = []; g.startJob(from, 'fragile'); let hits = 0; while (g.job && hits < 50) { g.hurtT = 0; g.damage(14); hits++; }
assert.equal(g.job, null, 'fragile load breaks'); assert.ok(g.events.some((e) => e.type === 'broken')); console.log('fragile load lost after', hits, 'hard knocks');

// hot loads: a patrol 300 m away chases a hot load but not freight
const pt = g.patrols[0], r = w.roads[0];
for (const [k, want] of [['freight', 'patrol'], ['hot', 'chase']]) {
  pt.toRoad(pt.idx); pt.mode = 'patrol';
  car.place(pt.car.pos.x + 300, pt.car.pos.z, 0); g.startJob(from, k); g.update(1 / 60);
  assert.equal(pt.mode, want, k + ' at 300 m'); g.job = null; g.rival = null;
}
console.log('hot load spotted at 300 m, freight not');

// the rival on every route: arrival as a share of the time limit
const shares = []; let worstResets = 0;
for (const a of w.places.sites) for (const b of w.places.sites) {
  if (a === b || Math.hypot(a.x - b.x, a.z - b.z) < 700 || a.outer || b.outer) continue;   // (no rival runs to the outer loop's pickups)
  const wild = a.wild || b.wild, dist = Math.hypot(a.x - b.x, a.z - b.z), limit = dist * 1.45 / (wild ? 16 : 21) + 20;
  const rv = new Rival(w, a, b, limit * RIVAL_DUE); let t = 0;
  while (rv.dist >= 9 && t < limit * 2) { rv.think(1 / 60); rv.car.step(dt, rv.input); rv.car.step(dt, rv.input); t += 1 / 60; }
  shares.push({ a: a.name, b: b.name, share: t / limit, done: rv.dist < 9, resets: rv.resets }); worstResets = Math.max(worstResets, rv.resets);
}
shares.sort((x, y) => x.share - y.share);
const q = (f) => shares[Math.floor(f * (shares.length - 1))].share.toFixed(2), late = shares.filter((s) => !s.done);
console.log(`rival arrival / time limit over ${shares.length} routes: fastest ${q(0)}, quarter ${q(0.25)}, median ${q(0.5)}, three quarters ${q(0.75)}, slowest ${q(1)}; never arrived ${late.length}; most resets ${worstResets}`);
console.log('slowest:', shares.slice(-3).map((s) => `${s.a} to ${s.b} ${s.share.toFixed(2)} (${s.resets} resets)`).join('; '));
assert.ok(late.length <= shares.length * 0.1, 'the rival gets there on nearly every route');
assert.ok(Math.abs(+q(0.5) - RIVAL_DUE) < 0.08 && +q(0.1) > RIVAL_DUE - 0.2 && +q(0.9) < RIVAL_DUE + 0.25, 'the rival keeps close to its schedule');
console.log('cargo: all checks passed');
