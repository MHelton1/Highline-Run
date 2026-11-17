// Tougher smuggling: a Hot load that is spotted brings a roadblock up the ring road ahead and backup from behind; the
// block has a gap a car fits through; blockers bust a player who stops by them, join the chase once passed, and every
// extra patrol goes away when the run ends. Ordinary loads only get a block after a long chase. Kid mode gets none.
// usage: node tests/heat.mjs
import assert from 'node:assert/strict';
import { buildWorld } from '../src/terrain.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec } from '../src/cars.js';
import { Game, ROADBLOCK } from '../src/jobs.js';
const w = buildWorld(process.env.REGION); w.placeTrees(w.regionDef.treeCount[1]);
const ring = w.roads[0];
const setup = (kind, kid = false) => {
  const car = new Vehicle(w, buildSpec('hatch')), f = w.frame(ring, 200); car.place(f.x, f.z, f.yaw); car.vel.set(f.tx * 20, 0, f.tz * 20);
  const g = new Game(w, car, { cash: 1000, runs: 3 }); g.kid = kid; g.startJob(w.places.sites[0], kind); g.events.length = 0;
  return { g, car };
};
const spot = (g) => { const p = g.patrols[0]; p.car.place(g.player.pos.x + 30, g.player.pos.z, 0); };   // a patrol right beside the player

// a hot load, spotted: block ahead (two cars, the gap fits a car) and backup behind
{
  const { g, car } = setup('hot'); spot(g); g.update(1 / 60);
  const ev = g.events.map((e) => e.type), blk = g.patrols.filter((p) => p.temp === 'block'), bk = g.patrols.filter((p) => p.temp === 'backup');
  assert.ok(ev.includes('spotted') && ev.includes('roadblock') && ev.includes('backup'), JSON.stringify(ev));
  assert.equal(blk.length, 2); assert.equal(bk.length, 1);
  const ahead = (q) => (q.x - car.pos.x) * car.fwd.x + (q.z - car.pos.z) * car.fwd.z;
  const bd = ahead(g.blockAt), bkd = ahead(bk[0].car.pos);
  assert.ok(bd > ROADBLOCK.ahead * 0.5, 'block is ahead ' + bd.toFixed(0)); assert.ok(bkd < -ROADBLOCK.ahead * 0.5, 'backup is behind ' + bkd.toFixed(0));
  // across the road at the block: lateral spots covered by a blocker body (sampled every 0.1 m)
  const f = w.frame(ring, g.blockAt.idx), free = [];
  for (let l = -ring.hw; l <= ring.hw; l += 0.1) {
    const x = f.x + f.lx * l, z = f.z + f.lz * l;
    const hit = blk.some((p) => { const c = p.car, dx = x - c.pos.x, dz = z - c.pos.z, u = dx * c.fwd.x + dz * c.fwd.z, v = dx * c.left.x + dz * c.left.z; return Math.abs(u) < c.spec.box.z + 0.1 && Math.abs(v) < c.spec.box.x + 0.1; });
    free.push(!hit);
  }
  let run = 0, best = 0; for (const fr of free) { run = fr ? run + 1 : 0; best = Math.max(best, run); }
  const covered = free.filter((x) => !x).length / free.length;
  console.log(`roadblock ${bd.toFixed(0)} m ahead, backup ${(-bkd).toFixed(0)} m behind, road ${(covered * 100).toFixed(0)}% blocked, widest gap ${(best / 10).toFixed(1)} m`);
  assert.ok(covered > 0.55, 'most of the road is blocked'); assert.ok(best / 10 >= 2.2, 'a car fits through');
  // stopping next to the block gets you busted
  const p0 = blk[0]; car.place(p0.car.pos.x + f.tx * 8, p0.car.pos.z + f.tz * 8, f.yaw); car.vel.set(0, 0, 0);
  g.patrols.filter((p) => !p.temp).forEach((p, k) => p.car.place(ring.x[(g.blockAt.idx + 300 + k * 200) % ring.n], ring.z[(g.blockAt.idx + 300 + k * 200) % ring.n], 0));
  for (const p of g.patrols) if (!p.temp) p.mode = 'patrol';
  bk[0].car.place(ring.x[(g.blockAt.idx + 900) % ring.n], ring.z[(g.blockAt.idx + 900) % ring.n], 0);
  for (let i = 0; i < 60 * 4 && g.job; i++) { g.update(1 / 60); car.vel.set(0, 0, 0); }
  assert.equal(g.job, null, 'busted at the roadblock'); assert.ok(g.events.some((e) => e.type === 'busted'));
  assert.equal(g.extras.length, 0, 'extras gone when the run ends');
}
// once passed, the blockers chase
{
  const { g, car } = setup('hot'); spot(g); g.update(1 / 60);
  const blk = g.patrols.filter((p) => p.temp === 'block'), f = w.frame(ring, g.blockAt.idx);
  car.place(g.blockAt.x - f.tx * 20, g.blockAt.z - f.tz * 20, f.yaw); g.update(1 / 60);
  car.place(g.blockAt.x + f.tx * 80, g.blockAt.z + f.tz * 80, f.yaw); car.vel.set(f.tx * 20, 0, f.tz * 20); g.update(1 / 60);
  assert.ok(blk.every((p) => p.mode === 'chase'), blk.map((p) => p.mode).join());
  g.update(1 / 60); assert.equal(g.events.filter((e) => e.type === 'runblock').length, 1, 'getting past counts once');
}
// an ordinary load: no block at first, one after a long chase; kid mode: never
{
  const { g } = setup('freight'); spot(g);
  for (let i = 0; i < 60 * 3; i++) { g.update(1 / 60); spot(g); }
  assert.equal(g.extras.length, 0, 'no extras early on an ordinary load');
  for (let i = 0; i < 60 * (ROADBLOCK.after + 1) && g.job; i++) { g.update(1 / 60); spot(g); g.job.left = 999; g.bust = 0; }
  assert.equal(g.patrols.filter((p) => p.temp === 'block').length, 2, 'block after a long chase'); assert.equal(g.patrols.filter((p) => p.temp === 'backup').length, 0, 'no backup for ordinary loads');
  const k = setup('hot', true); spot(k.g); for (let i = 0; i < 60 * 30; i++) { k.g.update(1 / 60); spot(k.g); k.g.job.left = 999; k.g.bust = 0; }
  assert.equal(k.g.extras.length, 0, 'kid mode: no roadblocks or backup');
}
console.log('heat: all checks passed');
