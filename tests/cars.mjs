// Every car: straight-line numbers, stance, lapping the ring with three driver models, and a cross-country ride.
import {CARS, CAR_IDS, buildSpec, measure, rate, PATROL_SPEC} from '../src/cars.js';
import {G, Vehicle} from '../src/vehicle.js';
import {lap, w} from './laps.mjs';
import {ride} from './ride.mjs';
const only = process.argv[2] ? process.argv[2].split(',') : CAR_IDS;
const quick = process.argv[3] === 'quick';
for (const id of only) {
  for (const up of (quick ? [[0,0,0,0]] : [[0,0,0,0],[3,3,3,3]])) {
    const s = buildSpec(id, up), m = measure(s), r = rate(s, m);
    const stat = s.mass*G/(4*s.springK), comH = s.radius + s.restLen - stat - s.attachY;
    console.log(`\n== ${s.name} ${up.join('')}: ${Math.round(s.mass)} kg, 0-60 ${m.t60.toFixed(2)} s, top ${(m.top*2.237).toFixed(0)} mph | CoM height ${comH.toFixed(2)}, clearance ${(comH+s.box.y0).toFixed(2)}, sag ${stat.toFixed(3)}, bump travel ${(s.bumpStop-stat).toFixed(3)}, body at full tuck ${(s.radius-s.attachY+s.box.y0).toFixed(2)} | bars speed ${r.speed.toFixed(2)} accel ${r.accel.toFixed(2)} grip ${r.grip.toFixed(2)} offroad ${r.offroad.toFixed(2)}`);
    // settle on the flat: must sit still
    const car = new Vehicle(w, s); const sp = w.spawn(); car.place(sp.x, sp.z, sp.yaw); let mv=0; for (let i=0;i<240;i++){car.step(1/120,{steer:0,throttle:0,brake:0}); mv=Math.max(mv,car.speed)} console.log('   settle max speed', mv.toFixed(2), 'up', car.up.y.toFixed(3), 'wheels down', car.grounded);
    if (quick && up[0]) continue;
    for (const mode of ['hold','tap','stick']) for (const [v,a] of (id==='truck'?[[27,8],[36,9]]:id==='buggy'?[[27,8],[36,10]]:[[36,10],[45,11.5]])) lap(s, v, a, mode);
    if (!up[0]) ride(w, s, id==='coupe'?[13,20]:[13,20,27]);
  }
}
