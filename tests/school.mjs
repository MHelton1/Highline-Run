// Driving tests: where each one is, and robot runs in the school car to set (and check) the medal times.
// usage: REGION=coast node tests/school.mjs [calibrate]
import assert from 'node:assert/strict';
import { buildWorld } from '../src/terrain.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec } from '../src/cars.js';
import { Race, medals } from '../src/race.js';
import { makePath, Driver } from '../src/ai.js';
import { buildTests, SCHOOL_CAR, improvePay } from '../src/school.js';

const w = buildWorld(process.env.REGION); w.placeTrees(w.regionDef.treeCount[1]);
const tests = buildTests(w), dt = 1 / 120, CAL = process.argv[2] === 'calibrate';
assert.equal(tests.length, 5);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// a robot for each test: follows the line through the gates; skill sets how hard it corners and brakes
function run(def, skill) {
  const car = new Vehicle(w, buildSpec(SCHOOL_CAR)), race = new Race(w, def, car, 1);
  const ring = makePath(w.roads[def.key === 'gravel' ? 1 : 0]);
  let near = 0, bd = 1e18; for (let i = 0; i < ring.n; i++) { const d = (ring.x[i] - def.start.x) ** 2 + (ring.z[i] - def.start.z) ** 2; if (d < bd) { bd = d; near = i; } }
  const bot = new Driver(car, ring, { skill, vcap: 99, lane: 0, idx: near });
  let off = 0, q = {};
  while (race.state !== 'done' && race.clock < 120) {
    race.update(1 / 60);
    bot.think(1 / 60, [car], race.state === 'run');
    const inp = { ...bot.input }, g = race.next;
    if (g && race.state === 'run' && (def.key === 'slalom' || def.key === 'stop')) {
      // aim at the gate itself, at a speed it can stop or turn in time for
      const dx = g.x - car.pos.x, dz = g.z - car.pos.z, d = Math.hypot(dx, dz), ang = Math.atan2(dx * car.fwd.z - dz * car.fwd.x, dx * car.fwd.x + dz * car.fwd.z);
      inp.steer = clamp(ang * 2.4, -1, 1);
      const vT = g.stop ? Math.sqrt(2 * 8.5 * skill * Math.max(0, d - 0.6)) : Math.min(40, 9 + 30 * skill * (1 - Math.min(1, Math.abs(ang) * 2.5)));
      const e = vT - car.speed; inp.throttle = e > 0 ? clamp(e * 0.6, 0, 1) : 0; inp.brake = e < -0.5 ? clamp(-e * 0.5, 0, 1) : 0; inp.handbrake = g.stop && d < 1.2 && car.speed < 1.5;
    }
    for (let k = 0; k < 2; k++) { car.step(dt, race.input(inp)); race.step(dt); }
    w.sample(car.pos.x, car.pos.z, q); if (car.surf >= 2) off += 1 / 60;
    race.events.length = 0;
  }
  return { time: race.state === 'done' ? race.t : null, medal: race.result ? race.result.medal : null, off: +off.toFixed(1), gate: race.gate };
}
const cal = {};
for (const def of tests) {
  const runs = [0.6, 0.75, 0.9].map((sk) => run(def, sk)), best = Math.min(...runs.filter((r) => r.time).map((r) => r.time));
  const md = medals(def, 1);
  cal[def.key] = [best * 1.03, best * 1.14, best * 1.3].map((t) => Math.round(t * 10) / 10);
  console.log(`${def.name.padEnd(15)} ${def.gates.length} gates ${Math.round(def.dist)} m | robots ${runs.map((r) => (r.time ? r.time.toFixed(1) : 'DNF@' + r.gate) + (r.medal >= 0 ? ' ' + ['G', 'S', 'B'][r.medal] : '') + (r.off ? ` off ${r.off}s` : '')).join(', ')} | medals ${md.join(' / ')}`);
  assert.ok(runs.every((r) => r.time), def.name + ': every robot finishes');
  if (!CAL) { assert.ok(runs[2].medal === 0, def.name + ': the best robot gets gold'); assert.ok(runs[0].medal >= 0, def.name + ': the slowest robot gets a medal'); }
}
if (CAL) console.log(process.env.REGION || 'mountain', JSON.stringify(cal));
assert.equal(improvePay(1, 0), 2000); assert.equal(improvePay(1, 3), 1500); assert.equal(improvePay(2, 1), 0);
console.log('school: all checks passed');
