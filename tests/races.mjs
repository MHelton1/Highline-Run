// Run each race with a robot in the player's seat and report the result.
import {buildWorld} from '../src/terrain.js';
import {Vehicle} from '../src/vehicle.js';
import {buildSpec} from '../src/cars.js';
import {buildRaces, Race, LEVELS, easeOval} from '../src/race.js';
import {Driver} from '../src/ai.js';
import {plan} from './route.mjs';
const w=buildWorld(process.env.REGION); w.placeTrees(w.regionDef.treeCount[1]); const races=buildRaces(w); const dt=1/120;
const fmt=(t)=>t==null?'  —  ':Math.floor(t/60)+':'+(t%60).toFixed(1).padStart(4,'0');
export function runRoad(id, carId, up, skill, vcap=99, log=true, level=1){
  const def0=races.find(r=>r.base===id); if(!def0) return null; const def=process.env.EASY?easeOval(def0):def0, car=new Vehicle(w,buildSpec(carId,up)), race=new Race(w,def,car,level);
  const bot=new Driver(car,def.path,{skill,vcap,lane:def.drag?def.drag[3]:race.track.off,idx:race.track.idx,prog:race.track.prog});
  let respawns=0, f=0, maxOff=0, posLog=[];
  const origs=race.rivals.map(r=>{const o=r.driver.respawn.bind(r.driver); r.resp=0; r.driver.respawn=()=>{r.resp++; o()}; return o});
  const ob=bot.respawn.bind(bot); bot.respawn=()=>{respawns++; ob()};
  while(race.state!=='done' && race.t<600){
    race.update(1/60); if(race.state==='run'){ bot.think(1/60, race.all); }
    for(let k=0;k<2;k++){ car.step(dt, race.input(bot.input)); race.step(dt); }
    f++; if(race.state==='run'&&f%600===0) posLog.push(race.pos);
    race.events.length=0;
  }
  // let the rest finish (up to 60 s more)
  for(let g=0; g<3600 && race.rivals.some(r=>r.time==null); g++){ race.update(1/60); for(let k=0;k<2;k++){ car.step(dt, race.input(bot.input)); race.step(dt);} }
  const res=race.result||{};
  if(log) console.log(`${def.name}${level===1?'':' ['+LEVELS[level].name+']'}: player ${carId} ${up.join('')} skill ${skill} cap ${vcap} → ${res.pos?res.pos:'DNF'} in ${fmt(res.time)} (resets ${respawns}) | rivals ${race.rivals.map(r=>`#${r.num} ${r.spec.name} ${fmt(r.time)}${r.resp?' resets '+r.resp:''}`).join(', ')} | pos every 10 s: ${posLog.join('')}`);
  return race;
}
export function runTrial(carId, up, vmax, log=true){
  const def=races.find(r=>r.base==='scramble'), car=new Vehicle(w,buildSpec(carId,up)), race=new Race(w,def,car);
  const legs=plan(w,[def.start,...def.gates]); const pts=[]; for(const l of legs) for(const p of l.path) pts.push(p);
  let k=0, stuck=0, flips=0, q={};
  while(race.state!=='done' && race.t<600){
    race.update(1/60);
    // pure pursuit on the planned line
    while(k<pts.length-1 && Math.hypot(pts[k].x-car.pos.x,pts[k].z-car.pos.z)<Math.max(14,car.speed*0.9)) k++;
    // never aim past the next gate
    const g=race.next; let tx=pts[k].x,tz=pts[k].z; if(g && Math.hypot(g.x-car.pos.x,g.z-car.pos.z)<40){tx=g.x;tz=g.z}
    const dx=tx-car.pos.x,dz=tz-car.pos.z, ang=Math.atan2(dx*car.fwd.z-dz*car.fwd.x, dx*car.fwd.x+dz*car.fwd.z);
    w.sample(car.pos.x+car.fwd.x*8,car.pos.z+car.fwd.z*8,q); const steep=1-q.ny;
    let vT=Math.max(7, vmax*(1-steep*4))*(Math.abs(ang)>0.5?0.5:1);
    const inp={steer:Math.max(-1,Math.min(1,ang*2.2)),throttle:car.speed<vT?1:0,brake:car.speed>vT+2?0.6:0,handbrake:false,analog:true};
    for(let s=0;s<2;s++){ car.step(dt, race.input(inp)); race.step(dt); }
    if(race.state==='run'){ if(car.speed<1.5) stuck+=1/60; else stuck=0; if(car.up.y<0.3||stuck>3){flips++; stuck=0; car.place(car.pos.x,car.pos.z,Math.atan2(dx,dz),1.0)} }
    race.events.length=0;
  }
  const res=race.result||{};
  if(log) console.log(`Scramble: ${carId} ${up.join('')} cruise ${(vmax*2.237).toFixed(0)} mph → ${race.state==='done'?fmt(res.time):'DNF at gate '+race.gate} medal ${res.medal} (unstuck ${flips})`);
  return race;
}
if (process.argv[1].endsWith('races.mjs')) {
  const which=process.argv[2]||'all';
  if(which==='all'||which==='ring') for(const [c,u,s,v] of [['hatch',[0,0,0,0],0.5,32],['hatch',[0,0,0,0],0.6,36],['hatch',[0,0,0,0],0.6,40],['hatch',[0,0,0,0],0.7,46],['hatch',[3,3,3,3],0.6,40],['coupe',[0,0,0,0],0.6,44],['truck',[0,0,0,0],0.7,40],['buggy',[0,0,0,0],0.7,40]]) runRoad('ring',c,u,s,v);
  if(which==='all'||which==='dash') for(const [c,u,s,v] of [['hatch',[0,0,0,0],0.35,20],['hatch',[0,0,0,0],0.4,23],['hatch',[0,0,0,0],0.5,26],['hatch',[0,0,0,0],0.65,34],['buggy',[0,0,0,0],0.5,26],['coupe',[0,0,0,0],0.5,26],['truck',[0,0,0,0],0.5,26]]) runRoad('dash',c,u,s,v);
  if(which==='all'||which==='clock') for(const [c,u,s,v] of [['hatch',[0,0,0,0],0.5,32],['hatch',[0,0,0,0],0.6,36],['hatch',[0,0,0,0],0.6,40],['hatch',[0,0,0,0],0.7,46],['coupe',[0,0,0,0],0.6,44],['truck',[0,0,0,0],0.7,40],['buggy',[0,0,0,0],0.7,40]]) runRoad('clock',c,u,s,v);
  if(which==='all'||which==='double') for(const [c,u,s,v] of [['hatch',[0,0,0,0],0.6,40],['hatch',[0,0,0,0],0.7,46],['hatch',[3,3,3,3],0.6,40],['hatch',[3,3,3,3],0.7,46],['coupe',[0,0,0,0],0.6,44],['coupe',[2,2,2,2],0.7,50]]) runRoad('double',c,u,s,v);
  if(which==='all'||which==='descent') for(const [c,u,s,v] of [['hatch',[0,0,0,0],0.35,20],['hatch',[0,0,0,0],0.4,23],['hatch',[0,0,0,0],0.5,26],['hatch',[0,0,0,0],0.65,34],['buggy',[0,0,0,0],0.5,26],['truck',[0,0,0,0],0.5,26]]) runRoad('descent',c,u,s,v);
  if(which==='all'||which==='levels') for(const lv of [0,2]) for(const [id,c,u,s,v] of [['ring','hatch',[0,0,0,0],0.5,32],['ring','hatch',[0,0,0,0],0.6,36],['ring','hatch',[0,0,0,0],0.6,40],['ring','hatch',[0,0,0,0],0.7,46],['ring','coupe',[0,0,0,0],0.7,50],['dash','hatch',[0,0,0,0],0.35,20],['dash','hatch',[0,0,0,0],0.4,23],['dash','hatch',[0,0,0,0],0.5,26],['dash','hatch',[0,0,0,0],0.65,34]]) runRoad(id,c,u,s,v,true,lv);
  if(which==='all'||which==='trial') for(const [c,u,v] of [['hatch',[0,0,0,0],14],['hatch',[0,0,0,0],19],['hatch',[0,0,0,0],24],['buggy',[0,0,0,0],19],['buggy',[0,0,0,0],24],['truck',[0,0,0,0],19],['coupe',[0,0,0,0],19]]) runTrial(c,u,v);
  if((which==='all'&&process.env.REGION==='speedway')||which==='drag') for(const [id,c,u] of [['drag','hatch',[0,0,0,0]],['drag','hatch',[3,3,3,3]],['drag','sprint',[3,3,3,3]],['dragx','coupe',[0,0,0,0]],['dragx','apex',[0,0,0,0]],['dragx','coupe',[3,3,3,3]]]) runRoad(id,c,u,1,99);
  if(which==='all'||which==='outer') for(const [c,u,s,v] of [['hatch',[0,0,0,0],0.5,32],['hatch',[0,0,0,0],0.6,36],['hatch',[0,0,0,0],0.6,40],['hatch',[0,0,0,0],0.7,46],['coupe',[0,0,0,0],0.6,44],['coupe',[2,2,2,2],0.7,50]]) runRoad('outer',c,u,s,v);
}
