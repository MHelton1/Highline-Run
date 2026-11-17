// Stopping on the brake: the car holds still long enough for a light to open before reverse comes in, a fresh press
// reverses at once, and rivals that have finished the sprint stay parked.
import assert from 'node:assert';
import { buildWorld } from '../src/terrain.js';
import { Vehicle, STOP_HOLD } from '../src/vehicle.js';
import { buildSpec, CARS } from '../src/cars.js';
import { buildRaces, Race } from '../src/race.js';

const w = buildWorld(process.env.REGION), dt = 1 / 120, sp = w.spawn();
const DWELL = 0.7, SLOW = 2.5;       // main.js: a place opens after the car has been under 2.5 m/s inside its light for 0.7 s
const none = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true }, go = { ...none, throttle: 1 }, stop = { ...none, brake: 1 };
const run = (car, sec, inp, each) => { for (let i = 0; i < sec * 120; i++) { car.step(dt, inp); if (each && each(i * dt) === false) return i * dt; } return sec; };
const upTo = (car, v) => { let t = 0; while (car.speed < v && t < 20) { car.step(dt, go); t += dt; } assert.ok(car.speed >= v, 'reaches speed'); };
const fresh = (id) => { const car = new Vehicle(w, buildSpec(id, [0, 0, 0, 0])); car.place(sp.x, sp.z, sp.yaw); run(car, 1, none); return car; };
const vF = (car) => car.vel.dot(car.fwd);

for (const id of Object.keys(CARS)) {
  // 1. brake held from speed, all the way through the stop
  let car = fresh(id); upTo(car, 14);
  let slowFrom = null, slowFor = 0, revAt = null, still = null, drift = 0, at = null, out = false;
  run(car, 6, stop, (t) => {
    if (car.speed < SLOW) { slowFrom ??= t; slowFor += dt; } else if (slowFrom != null) out = true;
    if (car.gear < 0) revAt ??= t - slowFrom;
    if (still == null && car.speed < 0.3) { still = t; at = car.pos.clone(); }
    if (still != null && car.gear > 0) drift = Math.max(drift, car.pos.distanceTo(at));
    return !out;
  });
  assert.ok(revAt != null && out, `${id}: reverse does come in when the brake stays down`);
  assert.ok(revAt >= DWELL + 0.03, `${id}: still in a forward gear when a light would open (reverse after ${revAt.toFixed(2)} s)`);
  assert.ok(slowFor >= DWELL + 0.3, `${id}: slow for ${slowFor.toFixed(2)} s`);
  assert.ok(drift < 0.15, `${id}: holds its place while stopped (moved ${drift.toFixed(2)} m)`);
  const held = slowFor, heldRev = revAt;

  // 2. pressed from a standstill: reverse at once
  car = fresh(id);
  let t2 = run(car, 1.5, stop, () => vF(car) > -1.5);
  assert.ok(t2 < 0.6, `${id}: backs up at once from a standstill (${t2.toFixed(2)} s to 1.5 m/s)`);

  // 3. stopped on the brake, let go, pressed again: reverse at once
  car = fresh(id); upTo(car, 10); run(car, 3, stop, () => car.speed > 0.3); run(car, 0.1, none);
  assert.ok(car.gear > 0, `${id}: still in a forward gear after the stop`);
  const t3 = run(car, 1.5, stop, () => vF(car) > -1.5);
  assert.ok(t3 < 0.6, `${id}: second press backs up at once (${t3.toFixed(2)} s)`);

  // 4. stopped on the brake, then the throttle: pulls away forwards
  car = fresh(id); upTo(car, 10); run(car, 3, stop, () => car.speed > 0.3);
  const t4 = run(car, 3, go, () => vF(car) < 3);
  assert.ok(t4 < 2, `${id}: pulls away after a stop (${t4.toFixed(2)} s to 3 m/s)`);

  console.log(`${id.padEnd(6)} brake held: slow for ${held.toFixed(2)} s, reverse ${heldRev.toFixed(2)} s after slowing (a light needs ${DWELL} s) | from rest ${t2.toFixed(2)} s | second press ${t3.toFixed(2)} s | pull away ${t4.toFixed(2)} s`);
}
assert.ok(STOP_HOLD > 0.4 && STOP_HOLD < 1, 'the hold is short');

// 5. rivals that have finished the sprint park instead of shuffling back and forth
{
  w.placeTrees(w.regionDef.treeCount[1]);
  const def = buildRaces(w).find((r) => r.base === 'dash'), car = new Vehicle(w, buildSpec('hatch', [0, 0, 0, 0])), race = new Race(w, def, car);
  const idle = { ...none, handbrake: true };
  const tick = () => { race.update(1 / 60); for (let k = 0; k < 2; k++) { car.step(dt, race.input(idle)); race.step(dt); } race.events.length = 0; };
  let t = 0; while (race.rivals.some((r) => r.time == null) && t < 400) { tick(); t += 1 / 60; }
  assert.ok(race.rivals.every((r) => r.time != null), 'every rival finishes the sprint');
  for (let i = 0; i < 12 * 60; i++) tick();                      // time to slow down and stop
  const at = race.rivals.map((r) => r.car.pos.clone()); let worst = 0, moved = 0, rev = false;
  for (let i = 0; i < 10 * 60; i++) { tick(); race.rivals.forEach((r, k) => { worst = Math.max(worst, r.car.speed); moved = Math.max(moved, r.car.pos.distanceTo(at[k])); if (r.car.gear < 0) rev = true; }); }
  assert.ok(!rev, 'no finished rival selects reverse');
  assert.ok(worst < 0.5 && moved < 1, `finished rivals stay put (fastest ${worst.toFixed(2)} m/s, moved ${moved.toFixed(2)} m)`);
  console.log(`sprint rivals after the flag: fastest ${worst.toFixed(2)} m/s, moved ${moved.toFixed(2)} m in 10 s`);
}
console.log('stop: all checks passed');
