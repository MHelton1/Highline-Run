// Placement test: put the car down at points along every road and across open country; it must settle upright and stay put.
import {buildWorld, SIZE} from '../src/terrain.js';
import {Vehicle, RALLY_CAR} from '../src/vehicle.js';
const w=buildWorld(process.env.REGION); const dt=1/120; const car=new Vehicle(w,RALLY_CAR); const none={steer:0,throttle:0,brake:0};
let bad=0,total=0,worst=0;
for(const road of w.roads){ let rb=0;
  for(let i=road.from;i<=road.to;i+=5){ const j=Math.min(i+1,road.n-1), k=j===i?i-1:i; const yaw=Math.atan2(road.x[k+1]-road.x[k],road.z[k+1]-road.z[k]);
    car.place(road.x[i],road.z[i],yaw); const p0=car.pos.clone(); let maxV=0,minUp=1;
    for(let s=0;s<180;s++){car.step(dt,none); maxV=Math.max(maxV,car.speed); minUp=Math.min(minUp,car.up.y)}
    const moved=car.pos.distanceTo(p0); total++; worst=Math.max(worst,maxV);
    if(minUp<0.8||maxV>2.5||moved>1.5){bad++; rb++; if(rb<=6)console.log('BAD',road.name,'sample',i,'maxV',maxV.toFixed(1),'minUp',minUp.toFixed(2),'moved',moved.toFixed(1),'ribbon h',road.h[i].toFixed(1),'ground 4 m left/right',[-1,1].map(sg=>{const tx=Math.sin(yaw),tz=Math.cos(yaw);return w.sample(road.x[i]+tz*4*sg*-1,road.z[i]-tx*4*sg*-1).toFixed(1)}).join('/'),'9 m:',[-1,1].map(sg=>{const tx=Math.sin(yaw),tz=Math.cos(yaw);return w.sample(road.x[i]+tz*9*sg,road.z[i]-tx*9*sg).toFixed(1)}).join('/'))}
  }
  console.log(road.name,': bad placements',rb);
}
console.log('roads: placements',total,'bad',bad,'worst settle speed',worst.toFixed(2));
// ribbon vs terrain consistency: terrain just beside the road must sit a little below the ribbon, never above it
for(const road of w.roads){ let maxAbove=-9,maxBelow=-9;
  for(let i=road.from;i<=road.to;i+=2){ const j=Math.min(i+1,road.n-1),k=j===i?i-1:i; let tx=road.x[k+1]-road.x[k],tz=road.z[k+1]-road.z[k]; const l=Math.hypot(tx,tz); tx/=l;tz/=l;
    for(const off of [-(road.hw+3),-(road.hw+2), road.hw+2, road.hw+3]){ const g=w.sample(road.x[i]+tz*off,road.z[i]-tx*off); maxAbove=Math.max(maxAbove,g-road.h[i]); maxBelow=Math.max(maxBelow,road.h[i]-g); } }
  console.log(road.name,': ground beside road is at most',maxAbove.toFixed(2),'m above and',maxBelow.toFixed(2),'m below the road surface');
}
// open country: random placements on slopes up to ~35 degrees: car must not be launched (speed under 6 m/s in the first 0.5 s)
let rnd=12345; const R=()=>{rnd=(rnd*1664525+1013904223)>>>0; return rnd/4294967296}; let launched=0,cnt=0,q={};
for(let k=0;k<400;k++){ const x=(R()-0.5)*(SIZE-200), z=(R()-0.5)*(SIZE-200); w.sample(x,z,q); if(q.ny<0.8)continue; cnt++; car.place(x,z,R()*6.28,1.0); let maxV=0; for(let s=0;s<60;s++){car.step(dt,none); maxV=Math.max(maxV,car.speed)} if(maxV>6)launched++; }
console.log('open country placements',cnt,'launched',launched);
