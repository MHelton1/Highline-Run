// Traffic in plain node: cars appear round a player driving the ring road, keep their lane and a gap, slow in towns,
// go when far away, and a player parked across the lane is driven up to and waited behind, not rammed.
// usage: REGION=coast node tests/traffic.mjs
import assert from 'node:assert/strict';
import { buildWorld } from '../src/terrain.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec } from '../src/cars.js';
import { makePath, Driver } from '../src/ai.js';
import { Traffic, TRAFFIC, Commuter } from '../src/traffic.js';

const w = buildWorld(process.env.REGION); w.placeTrees(w.regionDef.treeCount[1]);
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const tr = new Traffic(w, { rnd }), dt = 1 / 120;
console.log('routes', tr.routes.map((r) => `${r.road.name}${r.rev ? ' (back)' : ''} n=${r.path.n} slow=${r.slow.reduce((a, v) => a + v, 0)}`).join(', '));
assert.ok(tr.routes.length >= 2);
// 1) the player drives the ring road at a gentle pace for three minutes
const ring = makePath(w.roads[0]), car = new Vehicle(w, buildSpec('hatch')); const f0 = ring.at(100); car.place(f0.x, f0.z, f0.yaw);
const bot = new Driver(car, ring, { skill: 0.5, vcap: 26, lane: -2, idx: 100 });
let maxN = 0, born = 0, seen = new Set(), wrecks = 0, hits = 0, worst = 0, laneErr = [], speeds = [], townSp = [], gaps = 1e9;
for (let f = 0; f < 60 * 180; f++) {
  bot.think(1 / 60, [car, ...tr.cars.map((t) => t.car)]); tr.update(1 / 60, car);
  for (let k = 0; k < 2; k++) { car.step(dt, bot.input); const h = tr.step(dt, car); if (h > 1) { hits++; worst = Math.max(worst, h); if (process.env.V) { const o = tr.cars.map((t) => ({ t, d: t.car.pos.distanceTo(car.pos) })).sort((a, b) => a.d - b.d)[0].t; console.log('hit', h.toFixed(1), 'f', f, 'me off', bot.track.off.toFixed(1), 'mph', (car.speed * 2.237).toFixed(0), 'them off', o.driver.track.off.toFixed(1), 'lane', o.driver.lane.toFixed(1), 'rev', o.driver.path.reverse, 'mph', (o.car.speed * 2.237).toFixed(0), 'age', o.driver.age.toFixed(1), 'wreck', o.driver.wreck); } } }
  for (const t of tr.cars) { if (!seen.has(t.id)) { seen.add(t.id); born++; } if (t.driver.wreck) wrecks++;
    if (t.driver.age > 5 && !t.driver.wreck) { laneErr.push(Math.abs(t.driver.track.off - t.driver.lane)); speeds.push(t.car.speed); if (t.driver.slow[t.driver.track.idx]) townSp.push(t.car.speed); } }
  for (let i = 0; i < tr.cars.length; i++) for (let k = i + 1; k < tr.cars.length; k++) gaps = Math.min(gaps, tr.cars[i].car.pos.distanceTo(tr.cars[k].car.pos));
  maxN = Math.max(maxN, tr.cars.length);
}
const avg = (a) => a.reduce((x, v) => x + v, 0) / Math.max(1, a.length), pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length * q)] || 0; };
const out = { maxN, born, wreckFrames: wrecks, hits, worst: +worst.toFixed(1), lane: { avg: +avg(laneErr).toFixed(2), p95: +pct(laneErr, 0.95).toFixed(2) }, mph: { avg: +(avg(speeds) * 2.237).toFixed(0), p95: +(pct(speeds, 0.95) * 2.237).toFixed(0) }, townMph: +(avg(townSp) * 2.237).toFixed(0), minGap: +gaps.toFixed(1) };
console.log('drive', JSON.stringify(out));
assert.equal(maxN, TRAFFIC.n, 'fills up to the limit'); assert.ok(born > TRAFFIC.n, 'cars come and go');
assert.ok(out.lane.p95 < 1.5, 'keeps its lane'); assert.ok(out.mph.p95 < 60, 'sensible speed');
if (townSp.length) assert.ok(out.townMph < 34, 'slow through towns');
// 2) the player stopped across the lane: traffic waits behind, nobody hits it hard
const t2 = new Traffic(w, { rnd, n: 0 }); const park = new Vehicle(w, buildSpec('hatch')), fp = ring.at(900); park.place(fp.x + fp.tz * -2, fp.z - fp.tx * -2, fp.yaw + Math.PI / 2);
const back = makePath(w.roads[0], true);
for (let s = 0; s < 3; s++) { const pi = 900 - 80 - s * 30, f = ring.at(pi), c = new Vehicle(w, buildSpec('wagon')); c.place(f.x + f.tz * -1.9, f.z - f.tx * -1.9, f.yaw);
  t2.cars.push({ id: s, car: c, kind: 'wagon', paint: 0, driver: new Commuter(c, ring, tr.routes[0].slow, { skill: 0.5, vcap: 22, lane: -1.9, idx: pi }) }); }
let hard = 0;
for (let f = 0; f < 60 * 40; f++) { for (const t of t2.cars) t.driver.think(1 / 60, [park, ...t2.cars.map((q) => q.car)]); for (let k = 0; k < 2; k++) { park.step(dt, { steer: 0, throttle: 0, brake: 0, handbrake: true, analog: true }); hard = Math.max(hard, t2.step(dt, park)); } }
const queue = t2.cars.map((t) => +t.car.pos.distanceTo(park.pos).toFixed(1));
console.log('queue', JSON.stringify({ hard: +hard.toFixed(2), dist: queue, speed: t2.cars.map((t) => +t.car.speed.toFixed(1)) }));
assert.ok(hard < 1.5, 'no hard knock on a parked car'); assert.ok(queue[0] < 25 && queue[0] > 4, 'the first one waits close behind');
console.log('traffic: all checks passed');
