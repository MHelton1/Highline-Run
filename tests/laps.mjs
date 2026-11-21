// Driver models lap the ring road: "hold" = bang-bang key holder (worst case), "tap" = key tapper, "stick" = analog.
import {buildWorld} from '../src/terrain.js';
import {Vehicle, RALLY_CAR} from '../src/vehicle.js';
export const w=buildWorld(process.env.REGION, { towns: false });   // handling on the open road, without the town buildings
 const ring=w.roads[0]; const dt=1/120; const sp=w.spawn();
const n=ring.n, kappa=new Float32Array(n);
for(let i=0;i<n;i++){const a=(i-8+n)%n,b=(i+8)%n; const h1=Math.atan2(ring.x[i]-ring.x[a],ring.z[i]-ring.z[a]),h2=Math.atan2(ring.x[b]-ring.x[i],ring.z[b]-ring.z[i]); let d=h2-h1; d=Math.atan2(Math.sin(d),Math.cos(d)); kappa[i]=Math.abs(d)/(8*ring.ds);}
export function lap(spec, vmax, alat, mode='hold', delay=0.1, log=true, lookT=0.8){
  const car=new Vehicle(w,spec); car.place(sp.x,sp.z,sp.yaw);
  let best=30, t=0, maxOff=0, offT=0, maxSlip=0, minUp=1, q=[], vsum=0, steps=0, flips=0, phase=0;
  const startI=30; let passedHalf=false;
  while(t<400){
    let bd=1e9; for(let k=best-5;k<best+60;k++){const j=(k+n)%n; const d=(ring.x[j]-car.pos.x)**2+(ring.z[j]-car.pos.z)**2; if(d<bd){bd=d;best=j}}
    const off=Math.sqrt(bd); maxOff=Math.max(maxOff,off); if(off>5)offT+=dt;
    const look=Math.max(6,Math.round(car.speed*lookT/ring.ds)); const tI=(best+look)%n;
    const dx=ring.x[tI]-car.pos.x,dz=ring.z[tI]-car.pos.z; const ang=Math.atan2(dx*car.fwd.z-dz*car.fwd.x, dx*car.fwd.x+dz*car.fwd.z);
    let vT=vmax; for(let k=0;k<220;k+=4){const j=(best+k)%n; const vc=Math.sqrt(alat/Math.max(kappa[j],1e-5)); const d=k*ring.ds; vT=Math.min(vT, Math.sqrt(vc*vc+2*8*d));}
    let steer;
    if(mode==='stick') steer=Math.max(-1,Math.min(1,Math.atan(2*2.6*Math.sin(ang)/(look*ring.ds))/car.lock*1.25));
    else if(mode==='tap'){ phase=(phase+dt*7)%1; const u=Math.max(-1,Math.min(1,Math.atan(2*2.6*Math.sin(ang)/(look*ring.ds))/car.lock*1.25)); steer=Math.abs(u)>phase?Math.sign(u):0; }
    else steer=ang>0.02?1:ang<-0.02?-1:0;
    const want={steer, throttle: car.speed<vT?1:0, brake: car.speed>vT+1.5?1:0, handbrake:false, analog:mode==='stick'};
    q.push([t+delay,want]); while(q.length>1&&q[1][0]<=t)q.shift(); const inp=q[0][0]<=t?q[0][1]:{steer:0,throttle:1,brake:0};
    car.step(dt,inp); t+=dt; steps++; vsum+=car.speed;
    const vf=car.vel.dot(car.fwd), vl=car.vel.dot(car.left); if(car.speed>8) maxSlip=Math.max(maxSlip,Math.abs(Math.atan2(vl,Math.abs(vf)))*57.3);
    minUp=Math.min(minUp,car.up.y); if(car.up.y<0.3){flips++; const r=w.nearestRoad(car.pos.x,car.pos.z); car.place(r.x,r.z,r.yaw);}
    if(best>n/2&&best<n/2+100)passedHalf=true; if(passedHalf&&best>=startI&&best<startI+40)break;
  }
  const res={time:t, avg:vsum/steps*2.237, maxOff, offT, maxSlip, minUp, flips, done:t<400};
  if(log) console.log(`${mode.padEnd(5)} ${(vmax*2.237).toFixed(0).padStart(3)} mph cap, ${alat} m/s² corners: lap ${t.toFixed(0)}s avg ${res.avg.toFixed(0)} mph | max offset ${maxOff.toFixed(1)} m, off road ${offT.toFixed(1)} s, max sideslip ${maxSlip.toFixed(0)}°, resets ${flips}`);
  return res;
}
if (process.argv[1].endsWith('laps.mjs')) {
  console.log(RALLY_CAR.name);
  for(const mode of ['hold','tap','stick']) for(const [v,a] of [[22,7],[27,8],[31,9],[36,10],[42,11],[50,12]]) lap(RALLY_CAR,v,a,mode);
  console.log('-- slow reactions (0.2 s)'); for(const mode of ['hold','tap']) for(const [v,a] of [[27,8],[36,10]]) lap(RALLY_CAR,v,a,mode,0.2);
}
