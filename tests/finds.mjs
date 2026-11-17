// Hidden finds: every region gets 12 crates, a barn car and 3 ramps on reachable ground, the same every time; the ramps
// are real ground that throws a car into the air without flipping it; air time pays.
// usage: node tests/finds.mjs [region,...]
import { buildWorld } from '../src/terrain.js';
import { buildRaces } from '../src/race.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec, CARS, CAR_IDS, FIND_IDS } from '../src/cars.js';
import { placeFinds, addRamps, clearTrees, barnHint, rampRise, airPay, CRATES, BARN_CAR } from '../src/finds.js';
let bad = 0;
const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(26), ok ? 'ok  ' : 'BAD ', typeof v === 'string' ? v : JSON.stringify(v)); };
check('hidden cars', FIND_IDS.length === 3 && FIND_IDS.every((id) => !CAR_IDS.includes(id) && CARS[id].price === 0) && Object.values(BARN_CAR).every((id) => FIND_IDS.includes(id)), FIND_IDS);
check('air pay', airPay(0.8) === 0 && airPay(1) === 80 && airPay(2) === 320, [airPay(0.8), airPay(1), airPay(2)]);
const regions = process.argv[2] ? process.argv[2].split(',') : ['mountain', 'desert', 'coast'];
for (const r of regions) {
  const w = buildWorld(r); w.placeTrees(5000);
  const races = buildRaces(w), f = placeFinds(w, races), f2 = placeFinds(w, races);
  check(r + ' counts', f.crates.length === CRATES && f.ramps.length === 3 && !!f.barn, { crates: f.crates.length, ramps: f.ramps.length });
  check(r + ' same every time', JSON.stringify(f) === JSON.stringify(f2), '');
  const rc = (x, z) => w.reach[Math.round((z + w.half) / (3072 / w.reachN)) * w.reachN + Math.round((x + w.half) / (3072 / w.reachN))];
  check(r + ' reachable', [...f.crates, f.barn, ...f.ramps].every((p) => rc(p.x, p.z)), '');
  check(r + ' dry', w.sea == null || [...f.crates, f.barn, ...f.ramps].every((p) => p.y > w.sea + 2), '');
  const h = barnHint(w, f.barn); check(r + ' barn hint', !!h.from && h.dist > 0, `${h.dist} m ${h.dir} of ${h.from}`);
  clearTrees(w, f);
  check(r + ' trees cleared', w.trees.every((t) => f.crates.every((c) => Math.hypot(t.x - c.x, t.z - c.z) > 7) && f.ramps.every((q) => { const dx = t.x - q.x, dz = t.z - q.z, u = dx * q.fx + dz * q.fz, v = Math.abs(dx * q.fz - dz * q.fx); return u < -40 || u > 60 || v > 6; })), w.trees.length);
  addRamps(w, f.ramps);
  const R = f.ramps[0], g0 = w.sample(R.x + R.fx * 11, R.z + R.fz * 11);
  check(r + ' ramp is ground', Math.abs(rampRise(R, R.x + R.fx * 11.5, R.z + R.fz * 11.5) - 2.5) < 0.01 && g0 > R.y, { lip: +(g0 - R.y).toFixed(2) });
  // drive at each ramp: hatch at 22 m/s and the truck at 18 m/s; count air time, and the car must land on its wheels
  for (const [id, v] of [['hatch', 22], ['truck', 18], ['buggy', 20]]) {
    const out = [];
    for (const rp of f.ramps) {
      const car = new Vehicle(w, buildSpec(id)); car.place(rp.x - rp.fx * 30, rp.z - rp.fz * 30, rp.yaw, 0.3);
      car.vel.set(rp.fx * v, 0, rp.fz * v);
      let air = 0, best = 0, t = 0, minUp = 1;
      for (let i = 0; i < 120 * 8; i++) {
        const sp = car.vel.dot(car.fwd); car.step(1 / 120, { steer: 0, throttle: sp < v ? 1 : 0, brake: 0, handbrake: false, analog: true }); t += 1 / 120;
        if (car.grounded === 0) air += 1 / 120; else { best = Math.max(best, air); air = 0; }
        minUp = Math.min(minUp, car.up.y);
      }
      out.push({ air: +best.toFixed(2), up: +car.up.y.toFixed(2), minUp: +minUp.toFixed(2) });
    }
    check(`${r} ${id} jumps`, out.every((o) => o.air > 0.7 && o.up > 0.8), out);
  }
}
console.log(bad ? `finds: ${bad} check(s) failed` : 'finds: all checks passed');
process.exit(bad ? 1 : 0);
