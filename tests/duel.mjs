// Two-player race logic: grid, checkpoints per player, finish order, the grace time, reset. Run: node tests/duel.mjs [region]
import assert from 'node:assert/strict';
import { buildWorld } from '../src/terrain.js';
import { buildRaces } from '../src/race.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec } from '../src/cars.js';
import { Duel, DUEL_GRACE, DUEL_HOLD } from '../src/duel.js';
const region = process.argv[2] || 'mountain', world = buildWorld(region), races = buildRaces(world);
const mk = (id) => new Vehicle(world, buildSpec(id, [0, 0, 0, 0]));
for (const def of races) {
  const a = mk('hatch'), b = mk('coupe'), d = new Duel(world, def, [a, b]);
  assert.ok(a.pos.distanceTo(b.pos) > 3 && a.pos.distanceTo(b.pos) < 8, def.id + ' side by side ' + a.pos.distanceTo(b.pos).toFixed(1));
  assert.equal(d.input(0, { throttle: 1 }), DUEL_HOLD, 'held on the grid');
  for (let k = 0; k < 300 && d.state === 'count'; k++) { d.update(1 / 60); a.step(1 / 60, DUEL_HOLD); b.step(1 / 60, DUEL_HOLD); d.step(1 / 60); }
  assert.equal(d.state, 'run'); assert.ok(d.events.some((e) => e.type === 'go'));
  // player 2 takes every checkpoint first; player 1 follows one behind
  const visit = (car, g) => { car.place(g.x, g.z, 0); };
  const laps = def.laps || 1, n = def.gates.length * laps;
  for (let k = 0; k < n; k++) { visit(b, def.gates[k % def.gates.length]); d.step(1 / 60); if (k > 0) { visit(a, def.gates[(k - 1) % def.gates.length]); d.step(1 / 60); } }
  assert.equal(d.players[1].time != null, true, def.id + ' p2 home'); assert.equal(d.players[0].time, null);
  assert.deepEqual(d.places(), [2, 1]); assert.equal(d.state, 'run');
  visit(a, def.gates[(n - 1) % def.gates.length]); d.step(1 / 60);
  assert.equal(d.state, 'done'); assert.equal(d.result.winner, 1); assert.ok(d.result.gap >= 0);
  assert.ok(d.events.filter((e) => e.type === 'home').map((e) => e.place).join() === '1,2');
}
// grace: the race ends 25 s after the first finisher even if the other never arrives
{ const def = races[0], a = mk('hatch'), b = mk('hatch'), d = new Duel(world, def, [a, b]); d.state = 'run';
  for (let k = 0; k < def.gates.length * (def.laps || 1); k++) { const g = def.gates[k % def.gates.length]; a.place(g.x, g.z, 0); d.step(1 / 60); }
  assert.equal(d.players[0].time != null, true);
  for (let t = 0; t < DUEL_GRACE + 1 && d.state !== 'done'; t += 0.5) d.step(0.5);
  assert.equal(d.state, 'done'); assert.equal(d.result.winner, 0); assert.equal(d.result.gap, null); }
// reset puts the player at their last checkpoint facing the next
{ const def = races.find((r) => r.kind === 'sprint') || races[0], a = mk('hatch'), b = mk('hatch'), d = new Duel(world, def, [a, b]); d.state = 'run';
  const g0 = def.gates[0]; a.place(g0.x, g0.z, 0); d.step(1 / 60); a.place(0, 0, 0); d.resetPlayer(0);
  assert.ok(Math.hypot(a.pos.x - g0.x, a.pos.z - g0.z) < 3); d.resetPlayer(1); assert.ok(Number.isFinite(b.pos.x)); }
// the open map: side by side at the start given, racing at once, no checkpoints, never finishes, reset to the road
{ const r = world.nearestRoad(0, 0), def = { id: 'free', free: true, start: { x: r.x, z: r.z, yaw: r.yaw } }, a = mk('hatch'), b = mk('truck'), d = new Duel(world, def, [a, b]);
  assert.equal(d.state, 'run'); assert.equal(d.next(0), null); assert.ok(a.pos.distanceTo(b.pos) > 3 && a.pos.distanceTo(b.pos) < 8);
  assert.deepEqual(d.input(0, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }).throttle, 1);
  for (let t = 0; t < 120; t++) d.step(1); assert.equal(d.state, 'run'); assert.equal(d.events.length, 0);
  a.place(r.x + 200, r.z + 200, 0); d.resetPlayer(0); const n = world.nearestRoad(a.pos.x, a.pos.z); assert.ok(Math.hypot(a.pos.x - n.x, a.pos.z - n.z) < 1); }
console.log(region, 'duel: all checks passed for', races.length, 'events');
