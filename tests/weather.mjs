// Weather: blends run smoothly from one kind to the next, each region only gets its own kinds, the settings pick the
// right storm, and rain and snow really do cost grip (longer stops) while clear weather leaves the car exactly as it was.
import assert from 'node:assert/strict';
import { WEATHERS, REGION_WEATHER, blendWeather, nextWeather, fixedWeather } from '../src/weather.js';
import { buildWorld } from '../src/terrain.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec } from '../src/cars.js';

// blends
const h = blendWeather('clear', 'rain', 0.5);
assert.ok(Math.abs(h.fogFar - (1 + WEATHERS.rain.fogFar) / 2) < 1e-9); assert.equal(h.grip.length, 5);
assert.equal(blendWeather('clear', 'rain', 0.25).part, null); assert.equal(blendWeather('clear', 'rain', 0.75).part, 'rain');
assert.ok(Math.abs(blendWeather('clear', 'rain', 0.75).partAmt - 0.5) < 1e-9);
const r2s = blendWeather('rain', 'snow', 0.4); assert.equal(r2s.part, 'rain'); assert.ok(r2s.partAmt > 0 && r2s.partAmt < 1);
assert.deepEqual(blendWeather('clear', 'clear', 1).grip, [1, 1, 1, 1, 1]);
// regions keep to their own kinds and never repeat
for (const r of Object.keys(REGION_WEATHER)) {
  const allowed = new Set(REGION_WEATHER[r].mix.map(([k]) => k)); let now = 'clear'; const seen = {};
  for (let i = 0; i < 400; i++) { const n = nextWeather(r, now); assert.ok(allowed.has(n), r + ' got ' + n); assert.notEqual(n, now); seen[n] = (seen[n] || 0) + 1; now = n; }
  assert.equal(Object.keys(seen).length, allowed.size, r + ' visits every kind');
}
assert.equal(fixedWeather('storm', 'mountain'), 'snow'); assert.equal(fixedWeather('storm', 'desert'), 'dust'); assert.equal(fixedWeather('storm', 'coast'), 'rain');
assert.equal(fixedWeather('clear', 'coast'), 'clear'); assert.equal(fixedWeather('auto', 'coast'), null);
assert.ok(!REGION_WEATHER.desert.mix.some(([k]) => k === 'snow') && !REGION_WEATHER.coast.mix.some(([k]) => k === 'snow'), 'no snow by the sea or in the desert');

// grip: stopping distance from 25 m/s on the paved spawn road
const w = buildWorld('mountain'), sp = w.spawn(), dt = 1 / 120, none = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true };
function stopDist(grip) {
  w.weatherGrip = grip; const car = new Vehicle(w, buildSpec('hatch', [0, 0, 0, 0])); car.place(sp.x, sp.z, sp.yaw);
  for (let i = 0; i < 120; i++) car.step(dt, none);
  let t = 0; while (car.speed < 25 && t < 20) { car.step(dt, { ...none, throttle: 1 }); t += dt; }
  const a = car.pos.clone(); t = 0; while (car.speed > 0.5 && t < 10) { car.step(dt, { ...none, brake: 1 }); t += dt; }
  return a.distanceTo(car.pos);
}
const clear = stopDist(undefined), ones = stopDist([1, 1, 1, 1, 1]), rain = stopDist(WEATHERS.rain.grip), snow = stopDist(WEATHERS.snow.grip);
assert.equal(ones, clear, 'a grip of exactly 1 changes nothing');
assert.ok(rain > clear * 1.05, `rain stops longer (${rain.toFixed(1)} m against ${clear.toFixed(1)} m)`);
assert.ok(snow > rain, `snow longer still (${snow.toFixed(1)} m)`);
w.weatherGrip = undefined;
console.log(`stopping from 25 m/s: clear ${clear.toFixed(1)} m, rain ${rain.toFixed(1)} m, snow ${snow.toFixed(1)} m`);
console.log('weather: all checks passed');
