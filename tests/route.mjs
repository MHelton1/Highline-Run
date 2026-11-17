// A* over the world's own steepness map (12 m cells) between the trial's start and gates.
import {buildWorld, HALF, N} from '../src/terrain.js';
export function plan(w, pts, lim=0.42){
  const n=w.reachN, C=2*HALF/n, S=w.steepR;
  const cell=(x,z)=>[Math.max(0,Math.min(n-1,Math.round((x+HALF)/C))),Math.max(0,Math.min(n-1,Math.round((z+HALF)/C)))];
  const legs=[];
  for(let k=0;k<pts.length-1;k++){
    const [si,sj]=cell(pts[k].x,pts[k].z),[ti,tj]=cell(pts[k+1].x,pts[k+1].z);
    const g=new Float32Array(n*n).fill(1e18), from=new Int32Array(n*n).fill(-1), open=[[0,sj*n+si]]; g[sj*n+si]=0; let found=false;
    while(open.length){ let bi=0; for(let q=1;q<open.length;q++) if(open[q][0]<open[bi][0]) bi=q; const [f,c]=open.splice(bi,1)[0]; if(c===tj*n+ti){found=true;break}
      const ci=c%n,cj=(c/n)|0;
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){ if(!a&&!b)continue; const ni=ci+a,nj=cj+b; if(ni<0||nj<0||ni>=n||nj>=n)continue; const nn=nj*n+ni; if(S[nn]>lim && !(ni===ti&&nj===tj))continue;
        const d=Math.hypot(a,b)*C, cost=d*(1+Math.pow(S[nn]/0.22,2)); const ng=g[c]+cost;
        if(ng<g[nn]){g[nn]=ng;from[nn]=c;open.push([ng+Math.hypot(ni-ti,nj-tj)*C,nn])} }
    }
    const path=[]; if(found){ let c=tj*n+ti; while(c>=0){path.push({x:(c%n)*C-HALF,z:((c/n)|0)*C-HALF}); c=from[c]} path.reverse(); }
    let len=0,maxS=0; for(let q=1;q<path.length;q++){len+=Math.hypot(path[q].x-path[q-1].x,path[q].z-path[q-1].z); const [i,j]=cell(path[q].x,path[q].z); maxS=Math.max(maxS,S[j*n+i])}
    legs.push({found,len,maxS,path,straight:Math.hypot(pts[k+1].x-pts[k].x,pts[k+1].z-pts[k].z)});
  }
  return legs;
}
if (process.argv[1].endsWith('route.mjs')) {
  const w=buildWorld(process.env.REGION); const t=w.places.trial; const pts=[{x:t.x,z:t.z},...t.gates];
  let r=0; for(const v of w.reach) r+=v; console.log('reachable',(r/w.reach.length*100).toFixed(1)+'%');
  console.log('start',t.x|0,t.z|0,'y',t.y.toFixed(0)); t.gates.forEach((g,i)=>console.log('gate',i,g.name||'',g.x|0,g.z|0,'y',g.y.toFixed(0)));
  for (const lim of [0.36,0.42,0.47]) { const legs=plan(w,pts,lim); let tot=0; console.log('limit',lim, legs.map((l,i)=>{tot+=l.len; return `leg ${i} ${l.found?'ok':'NONE'} ${l.straight|0}/${l.len|0} m steepest ${l.maxS.toFixed(2)}`}).join(' | '),'total',tot|0); }
  for(const s of w.places.sites) console.log(s.name.padEnd(18), (s.x|0),(s.z|0),'y',s.y.toFixed(1), s.wild?'wild':'');
}
