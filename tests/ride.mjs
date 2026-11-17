// Off-road ride quality: drive straight across open country from many random points and count air time.
import {buildWorld, SIZE, SURF} from '../src/terrain.js';
import {Vehicle, RALLY_CAR} from '../src/vehicle.js';
export function ride(w, spec=RALLY_CAR, speeds=[13,20,27], log=true){
  const dt=1/120, out=[];
  for(const vT of speeds){
    let rnd=777; const R=()=>{rnd=(rnd*1664525+1013904223)>>>0; return rnd/4294967296};
    const car=new Vehicle(w,spec); let air=0,tot=0,jumps=0,longest=0,flips=0,runs=0,q={},peakH=0,vs=0;
    for(let k=0;k<400&&runs<40;k++){ const x=(R()-0.5)*(SIZE-600), z=(R()-0.5)*(SIZE-600); const s=w.sample(x,z,q); if(q.ny<0.9||q.surf!==SURF.GRASS)continue; runs++;
      car.place(x,z,R()*6.28,0.8); let cur=0;
      for(let i=0;i<12*120;i++){ const e=vT-car.speed; car.step(dt,{steer:0,throttle:e>0?Math.min(1,e*0.5):0,brake:e<-2?0.4:0,analog:true}); tot+=dt; vs+=car.speed*dt;
        if(car.grounded===0){air+=dt;cur+=dt; peakH=Math.max(peakH,car.pos.y-w.sample(car.pos.x,car.pos.z));} else { if(cur>0.2){jumps++; longest=Math.max(longest,cur);} cur=0; }
        if(car.up.y<0.2){flips++; break;} }
    }
    const r={vT, air:air/tot*100, jumpsPerMin:jumps/tot*60, longest, flips, runs, avg:vs/tot};
    out.push(r); if(log) console.log(`${spec.name} cross-country at ${(vT*2.237).toFixed(0)} mph (avg ${(r.avg*2.237).toFixed(0)}): in the air ${r.air.toFixed(0)}% of the time, ${r.jumpsPerMin.toFixed(1)} jumps/min, longest ${longest.toFixed(1)} s, peak height ${peakH.toFixed(1)} m, rolled over in ${flips}/${runs} runs`);
  }
  return out;
}
if (process.argv[1].endsWith('ride.mjs')) ride(buildWorld(process.env.REGION));
