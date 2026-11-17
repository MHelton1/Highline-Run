import {buildWorld} from '../src/terrain.js';
import {Vehicle} from '../src/vehicle.js';
import {Game} from '../src/jobs.js';
const w=buildWorld(process.env.REGION); w.placeTrees(w.regionDef.treeCount[1]); const car=new Vehicle(w); const sp=w.spawn(); car.place(sp.x,sp.z,sp.yaw);
const g=new Game(w,car,{cash:0,runs:0}); const dt=1/120;
console.log(g.sites.map(s=>`${s.name} (${s.x|0},${s.z|0}) y${s.y|0} ${s.wild?'wild':''}`).join('\n'));
console.log('offers',g.offers.map(s=>s.name));
// 1) patrols idle for 120s: do they stay on the road and keep moving?
const none={steer:0,throttle:0,brake:0};
let minv=[9,9,9],maxoff=[0,0,0],resets=0;
for(let f=0;f<120*60;f++){ g.update(1/60); for(let k=0;k<2;k++){car.step(dt,none); g.step(dt)} if(f>300) g.patrols.forEach((p,i)=>{minv[i]=Math.min(minv[i],p.car.speed); const r=w.roads[0]; maxoff[i]=Math.max(maxoff[i],Math.hypot(r.x[p.idx]-p.car.pos.x,r.z[p.idx]-p.car.pos.z))}) }
console.log('patrol idle: min speed',minv.map(x=>x.toFixed(1)),'max offset',maxoff.map(x=>x.toFixed(1)),'idx',g.patrols.map(p=>p.idx));
// 2) force a job, sit still near a patrol: expect chase then bust
const pt=g.patrols[0]; const r=w.roads[0]; const i=(pt.idx+60)%r.n; car.place(r.x[i],r.z[i],0);
g.startJob(g.sites[0]); console.log('job',g.job.to.name,'pay',g.job.pay,'time',g.job.time,'dist',g.job.dist|0);
let ev=[]; for(let f=0;f<40*60&&g.job;f++){ g.update(1/60); for(let k=0;k<2;k++){car.step(dt,none); g.step(dt)} for(const e of g.events.splice(0)) ev.push(e.type+'@'+(f/60).toFixed(1)) }
console.log('events',ev.join(' '),'cash',g.cash, 'cond', g.job&&g.job.cond);
// 3) delivery: teleport to destination
car.place(sp.x,sp.z,sp.yaw); g.offers=[g.sites[1]]; car.place(g.sites[1].x,g.sites[1].z,0); for(let f=0;f<90;f++){g.update(1/60);for(let k=0;k<2;k++){car.step(dt,none);g.step(dt)}}
console.log('picked up?',!!g.job, g.job&&g.job.to.name); const to=g.job.to; car.place(to.x,to.z,0); g.patrols.forEach(p=>p.mode='patrol');
ev=[]; for(let f=0;f<120&&g.job;f++){g.update(1/60);for(let k=0;k<2;k++){car.step(dt,none);g.step(dt)} } console.log(g.events.map(e=>JSON.stringify(e)).join(' '),'cash',g.cash,'offers',g.offers.map(s=>s.name));
// 4) chase test: player drives ring flat-ish at 30 m/s with cargo for 60s; report patrol distances
g.events=[]; car.place(sp.x,sp.z,sp.yaw); g.startJob(g.sites[0]); g.job.left=999; let best=30;
const follow=()=>{ let bd=1e9; for(let k=best-5;k<best+60;k++){const j=(k+r.n)%r.n; const d=(r.x[j]-car.pos.x)**2+(r.z[j]-car.pos.z)**2; if(d<bd){bd=d;best=j}} const t=(best+Math.max(6,car.speed*0.35|0))%r.n; const dx=r.x[t]-car.pos.x,dz=r.z[t]-car.pos.z; const ang=Math.atan2(dx*car.fwd.z-dz*car.fwd.x, dx*car.fwd.x+dz*car.fwd.z); const e=30-car.speed; return {steer:Math.max(-1,Math.min(1,ang*3)),throttle:e>0?Math.min(1,e*0.5):0,brake:e<-1?0.5:0,analog:true}};
for(let f=0;f<90*60&&g.job;f++){ g.update(1/60); const inp=follow(); for(let k=0;k<2;k++){car.step(dt,inp); g.step(dt)} if(f%600===0) console.log((f/60)|0,'s v',car.speed.toFixed(0),'heat',g.heat,'patrol d',g.patrols.map(p=>(p.dist|0)+p.mode[0]).join(' '),'cond',g.job.cond.toFixed(2),'bust',g.bust.toFixed(2)); }
console.log('events',g.events.map(e=>e.type).join(' '), 'nan', isNaN(car.pos.x));
