// Stopping and steering response for every car on a flat strip: 60-0 and 100-0 mph distances on the brake, how far a
// car rolls after lifting off at 60, and how quickly a held steering key (or a stick) turns the car at 50 mph.
// `node tests/brakes.mjs` prints the table; checks keep stops short and turn-in quick.
import assert from 'node:assert';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec, ALL_CAR_IDS } from '../src/cars.js';

const strip = { sample(x, z, out) { if (out) { out.nx = 0; out.ny = 1; out.nz = 0; out.surf = 0; } return 0; }, treeHash: new Map(), half: 1e9 };
const dt = 1 / 120, MPH = 0.44704;
const none = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true };
const at = (id, v) => { const car = new Vehicle(strip, buildSpec(id)); car.place(0, 0, 0, 0.4); for (let i = 0; i < 90; i++) car.step(dt, none);
  car.vel.set(car.fwd.x * v, 0, car.fwd.z * v); for (let i = 0; i < 60; i++) { car.step(dt, none); const k = v / Math.max(car.speed, 0.1); car.vel.multiplyScalar(k); } return car; };
const stopDist = (id, mph, inp) => { const car = at(id, mph * MPH), p0 = car.pos.clone(); let t = 0; while (car.vel.dot(car.fwd) > 0.3 && t < 60) { car.step(dt, inp); t += dt; } return { d: car.pos.distanceTo(p0), t }; };
const turn = (id, analog) => { const car = at(id, 50 * MPH), yaws = []; for (let i = 0; i < 240; i++) { car.step(dt, { ...none, throttle: 0.35, steer: 1, analog }); yaws.push(Math.abs(car.angVel.y)); }
  const peak = yaws.slice(120).reduce((a, b) => a + b, 0) / 120, t90 = yaws.findIndex((y) => y > peak * 0.9) * dt; return { t90, yaw: peak, g: peak * car.speed / 9.81 }; };
const rows = {};
for (const id of ALL_CAR_IDS) {
  const b60 = stopDist(id, 60, { ...none, brake: 1, analog: false }), b100 = stopDist(id, 100, { ...none, brake: 1, analog: false });
  const coast = stopDist(id, 60, none), k = turn(id, false), a = turn(id, true);
  rows[id] = { b60: +b60.d.toFixed(1), b100: +b100.d.toFixed(1), t60: +b60.t.toFixed(2), coast60: +coast.d.toFixed(0), keyT90: +k.t90.toFixed(2), stickT90: +a.t90.toFixed(2), latG: +k.g.toFixed(2) };
  console.log(id.padEnd(8), JSON.stringify(rows[id]));
}
if (process.argv[2] !== 'show') {
  for (const [id, r] of Object.entries(rows)) {
    assert.ok(r.b60 < 34, `${id}: 60-0 in ${r.b60} m`);
    assert.ok(r.keyT90 < 0.75, `${id}: turn-in on a key ${r.keyT90} s`);
  }
  console.log('brakes: all checks passed');
}
