// Kid mode: the car drives itself at kid speeds, steering only; brake stops and reverses, letting go drives on; every race
// is winnable on kid mode with a steering-only robot, and the trial medals are in reach. usage: [REGION=desert] node tests/kid.mjs
import assert from 'node:assert';
import { buildWorld } from '../src/terrain.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec } from '../src/cars.js';
import { buildRaces, Race, KID_LEVEL, medals } from '../src/race.js';
import { Driver } from '../src/ai.js';
import { kidInput, KID } from '../src/kid.js';
import { plan } from './route.mjs';
const w = buildWorld(process.env.REGION); w.placeTrees(w.regionDef.treeCount[1]); const races = buildRaces(w), dt = 1 / 120;
const fmt = (t) => (t == null ? '  —  ' : Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0'));

// on level tarmac the car gets up to kid speed by itself, holds it, stops on the brake, reverses, then drives on
{
  const flat = { sample(x, z, o) { if (o) { o.nx = 0; o.ny = 1; o.nz = 0; o.surf = 0; } return 0; }, treeHash: new Map(), half: 1e9 };   // level tarmac
  const car = new Vehicle(flat, buildSpec('coupe')), out = {}; car.place(0, 0, 0);
  const run = (sec, inp) => { for (let f = 0; f < sec * 120; f++) car.step(dt, kidInput(car, inp, out)); };
  const none = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true };
  run(8, none); const cruise = car.speed; run(2.2, { ...none, brake: 1 }); const stopped = car.speed; run(2, { ...none, brake: 1 }); const back = car.vel.dot(car.fwd); run(4, none); const again = car.vel.dot(car.fwd);
  console.log(`cruise ${cruise.toFixed(1)} m/s (${(cruise * 2.237).toFixed(0)} mph, aim ${KID.road}), after braking ${stopped.toFixed(1)}, holding brake ${back.toFixed(1)} (reverse), let go ${again.toFixed(1)}`);
  assert.ok(Math.abs(cruise - KID.road) < 1.5, 'cruises at kid speed'); assert.ok(stopped < 2, 'stops on the brake'); assert.ok(back < -0.5, 'reverses on a held brake'); assert.ok(again > 8, 'drives on when the brake is let go');
}

// races: a steering-only robot (it never touches the pedals; kid mode does)
function race(def, carId, skill) {
  const car = new Vehicle(w, buildSpec(carId)), rc = new Race(w, def, car, KID_LEVEL), out = {};
  const bot = new Driver(car, def.path, { skill, vcap: 99, lane: rc.track.off, idx: rc.track.idx, prog: rc.track.prog });
  let resets = 0; const ob = bot.respawn.bind(bot); bot.respawn = () => { resets++; ob(); };
  while (rc.state !== 'done' && rc.t < 900) {
    rc.update(1 / 60); if (rc.state === 'run') bot.think(1 / 60, rc.all);
    const inp = kidInput(car, { ...bot.input, throttle: 0, brake: 0, handbrake: false }, out);
    for (let k = 0; k < 2; k++) { car.step(dt, rc.input(inp)); rc.step(dt); }
    rc.events.length = 0;
  }
  return { pos: rc.result ? rc.result.pos : null, time: rc.result ? rc.result.time : null, resets, rivals: rc.rivals.map((r) => (r.time != null ? fmt(r.time) : Math.round(def.dist - r.driver.prog) + ' m back')).join(', ') };
}
let wins = 0, n = 0;
for (const def of races.filter((d) => d.path)) for (const carId of ['hatch', 'buggy', 'truck']) {
  const r = race(def, carId, 0.5); n++; if (r.pos === 1) wins++;
  console.log(`${def.name.padEnd(22)} ${carId.padEnd(6)} → ${r.pos ? r.pos : 'DNF'} in ${fmt(r.time)} (robot resets ${r.resets}) | rivals ${r.rivals}`);
}
console.log(`kid races won by the robot: ${wins} of ${n}`);
assert.ok(wins >= n * 0.6, 'kid mode races are winnable');
// the time trial at kid speeds, on the planned line
{
  const def = races.find((r) => r.base === 'scramble'), car = new Vehicle(w, buildSpec('hatch')), rc = new Race(w, def, car, KID_LEVEL), out = {};
  const pts = []; for (const l of plan(w, [def.start, ...def.gates])) for (const p of l.path) pts.push(p);
  let k = 0, stuck = 0;
  while (rc.state !== 'done' && rc.t < 900) {
    rc.update(1 / 60);
    while (k < pts.length - 1 && Math.hypot(pts[k].x - car.pos.x, pts[k].z - car.pos.z) < Math.max(14, car.speed * 0.9)) k++;
    const g = rc.next; let tx = pts[k].x, tz = pts[k].z; if (g && Math.hypot(g.x - car.pos.x, g.z - car.pos.z) < 40) { tx = g.x; tz = g.z; }
    const dx = tx - car.pos.x, dz = tz - car.pos.z, ang = Math.atan2(dx * car.fwd.z - dz * car.fwd.x, dx * car.fwd.x + dz * car.fwd.z);
    const inp = kidInput(car, { steer: Math.max(-1, Math.min(1, ang * 2.2)), throttle: 0, brake: 0, handbrake: false, analog: true }, out);
    for (let s = 0; s < 2; s++) { car.step(dt, rc.input(inp)); rc.step(dt); }
    if (rc.state === 'run') { if (car.speed < 1.5) stuck += 1 / 60; else stuck = 0; if (car.up.y < 0.3 || stuck > 4) { stuck = 0; car.place(car.pos.x, car.pos.z, Math.atan2(dx, dz), 1.0); } }
    rc.events.length = 0;
  }
  const md = medals(def, KID_LEVEL);
  console.log(`${def.name} on kid mode: ${rc.state === 'done' ? fmt(rc.result.time) : 'DNF'} | medals ${md.map(fmt).join(' / ')}`);
  assert.ok(rc.state === 'done' && rc.result.time <= md[2], 'a kid-speed run earns a medal');
}
console.log('kid: all checks passed');
