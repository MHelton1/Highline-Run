// Smuggling runs: sites, cargo jobs, patrol AI, car-to-car contact. No rendering (runs in node for tests).
import { KID } from './kid.js';
import { Vehicle, collideCars } from './vehicle.js';
import { PATROL_SPEC, buildSpec } from './cars.js';
import { route } from './route.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const angTo = (car, x, z) => { const dx = x - car.pos.x, dz = z - car.pos.z; return Math.atan2(dx * car.fwd.z - dz * car.fwd.x, dx * car.fwd.x + dz * car.fwd.z); };

// Kinds of cargo. pay and time scale the job; hurt scales damage from knocks; fragile loads break at 0%; hot loads put
// every patrol on the alert at once and they see further; contested loads are raced for by a rival smuggler.
export const CARGO = {
  freight: { name: 'Freight', note: 'An ordinary load.', pay: 1, time: 1, hurt: 1, w: 34 },
  fragile: { name: 'Fragile', note: 'Glassware. Knocks cost far more, and at 0% it is lost.', pay: 1.45, time: 1.1, hurt: 2.6, fragile: true, w: 17 },
  rush: { name: 'Rush', note: 'Less time, better pay.', pay: 1.35, time: 0.7, hurt: 1, w: 17 },
  hot: { name: 'Hot', note: 'Patrols spot you from much further away and are harder to shake off.', pay: 1.7, time: 1, hurt: 1, hot: true, w: 14 },
  rival: { name: 'Contested', note: 'A rival smuggler is racing you to the buyer. Get there first.', pay: 1.5, time: 1, hurt: 1, rival: true, w: 18 },
};
export const CARGO_IDS = Object.keys(CARGO);
// the rival aims to reach the buyer at this share of the job's time limit (tests/cargo.mjs checks it keeps to it)
export const RIVAL_DUE = 0.82;

// A rival smuggler: plans a line across country to the buyer and follows it, speeding up or easing off to arrive after
// about `due` seconds, so every route is a fair race whatever the ground is like.
export const RIVAL_SPEC = (() => { const s = buildSpec('buggy', [1, 1, 1, 0]); s.name = 'Rival'; return s; })();
export class Rival {
  constructor(world, from, to, due = 90) {
    this.world = world; this.to = to; this.due = due; this.t = 0; this.car = new Vehicle(world, RIVAL_SPEC); this.q = {};
    this.input = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true }; this.stuck = 0; this.resets = 0;
    this.path = route(world, from, to) || [from, to]; this.k = 1;
    const P = this.path; this.rest = new Float32Array(P.length);      // metres left along the line from each point
    for (let i = P.length - 2; i >= 0; i--) this.rest[i] = this.rest[i + 1] + Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
    this.len = this.rest[0]; this.best = Infinity; this.floor = 1;
    const p = this.path[Math.min(2, this.path.length - 1)];
    // start a few metres along its line from the pickup, facing the way it means to go
    const h = Math.atan2(p.x - from.x, p.z - from.z);
    this.car.place(from.x + Math.sin(h) * 6, from.z + Math.cos(h) * 6, h);
  }
  get dist() { return Math.hypot(this.to.x - this.car.pos.x, this.to.z - this.car.pos.z); }
  // metres still to go along its line
  get left() { const P = this.path, c = this.car.pos; return this.rest[this.k] + Math.hypot(P[this.k].x - c.x, P[this.k].z - c.z); }
  think(dt) {
    const c = this.car, P = this.path, inp = this.input, q = this.q;
    // k: the nearest point of the line just ahead; aim at the first point at least a look-ahead distance beyond it
    let bd = Infinity, best = this.k;
    for (let i = Math.max(1, this.floor, this.k - 4); i < Math.min(P.length, this.k + 40); i++) { const d = (P[i].x - c.pos.x) ** 2 + (P[i].z - c.pos.z) ** 2; if (d < bd) { bd = d; best = i; } }
    this.k = best; let j = best; const look = Math.max(14, c.speed * 0.9);
    while (j < P.length - 1 && Math.hypot(P[j].x - c.pos.x, P[j].z - c.pos.z) < look) j++;
    // the cruising speed that would arrive on time from here, held between 9 and 38 m/s
    this.t += dt; this.vmax = clamp(this.left / Math.max(4, this.due - this.t) * 1.3, 9, 38);
    let tg = this.dist < 40 ? this.to : P[j];
    // a pickup's hut stands beside it: if the way in runs through the hut, go round it on the near side
    const T = this.to;
    if (T.hutX !== undefined && this.dist < 60) {
      const ax = c.pos.x, az = c.pos.z, dx = tg.x - ax, dz = tg.z - az, L2 = dx * dx + dz * dz || 1;
      const u = clamp(((T.hutX - ax) * dx + (T.hutZ - az) * dz) / L2, 0, 1), px = ax + dx * u - T.hutX, pz = az + dz * u - T.hutZ;
      if (u > 0 && u < 1 && px * px + pz * pz < 49) {
        const L = Math.sqrt(L2), nx = -dz / L, nz = dx / L, side = px * nx + pz * nz >= 0 ? 1 : -1;
        this.det = this.det || {}; this.det.x = T.hutX + nx * side * 9; this.det.z = T.hutZ + nz * side * 9; tg = this.det;
      }
    }
    const ang = angTo(c, tg.x, tg.z);
    this.world.sample(c.pos.x + c.fwd.x * 8, c.pos.z + c.fwd.z * 8, q);
    let vT = Math.max(7, this.vmax * (1 - (1 - q.ny) * 4)) * (Math.abs(ang) > 0.5 ? 0.5 : 1);
    if (this.dist < 25) vT = Math.min(vT, 8);
    inp.steer = clamp(ang * 2.2, -1, 1); inp.throttle = c.speed < vT ? clamp((vT - c.speed) * 0.5, 0.3, 1) : 0; inp.brake = c.speed > vT + 2 ? 0.6 : 0;
    // stuck, or on its side: put it back on its line a little further on
    // and no headway for a long while (circling, or pinned against something) counts as stuck too
    const left = this.left; if (left < this.best - 5) { this.best = left; this.slowT = 0; } else this.slowT = (this.slowT || 0) + dt;
    this.stuck = c.speed < 1.5 ? this.stuck + dt : 0;
    if (this.stuck > 3 || c.up.y < 0.3 || this.slowT > 7) {
      this.slowT = 0; this.best = Infinity;
      this.k = this.floor = Math.min(P.length - 1, this.k + 2); const a = P[this.k - 1], b = P[this.k];   // never back to the bad spot
      c.place(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z)); this.stuck = 0; this.resets++;
    }
  }
}

// roadblocks and backup: how far ahead the block goes up (m), where its two cars stand across the road (m from the
// middle; the gap between them is about 2.6 m), how long a block nobody reaches stays (s), the chase time on an ordinary
// load before one goes up (s), the wait before the next (s), and how far behind the player backup arrives (m)
export const ROADBLOCK = { ahead: 420, lat: [-3.0, 4.0], life: 150, after: 25, cool: 70, backup: 450, backupCool: 90 };

// a sample index along a road: wraps round a closed road, stops at the ends of an open one
const wrap = (r, i) => r.closed ? ((i % r.n) + r.n) % r.n : Math.max(0, Math.min(r.n - 1, i));
// the roads the patrols drive: the ring road, or on a map whose first road is a race track (the speedway) the roads
// listed in world.beats, one per patrol (an open road is driven end to end and back)
const beatRoads = (world) => (world.beats || [0, 0, 0]).map((k) => world.roads[k]);

export class Patrol {
  constructor(world, idx, dir, road) {
    this.world = world; this.ring = road || world.roads[0]; this.car = new Vehicle(world, PATROL_SPEC); this.idx = idx; this.dir = dir;
    this.mode = 'patrol'; this.stuck = 0; this.lost = 0; this.input = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true };
    this.toRoad(idx);
  }
  toRoad(i) { const r = this.ring; i = wrap(r, i); if (!r.closed && (i + this.dir < 0 || i + this.dir >= r.n)) this.dir = -this.dir; const j = wrap(r, i + this.dir); this.idx = i; this.car.place(r.x[i], r.z[i], Math.atan2(r.x[j] - r.x[i], r.z[j] - r.z[i])); this.stuck = 0; }
  nearestIdx(all) {
    const r = this.ring, c = this.car; let best = this.idx, bd = 1e18;
    if (all) { for (let i = 0; i < r.n; i += 3) { const d = (r.x[i] - c.pos.x) ** 2 + (r.z[i] - c.pos.z) ** 2; if (d < bd) { bd = d; best = i; } } }
    else for (let k = -30; k <= 30; k++) { const i = wrap(r, this.idx + k), d = (r.x[i] - c.pos.x) ** 2 + (r.z[i] - c.pos.z) ** 2; if (d < bd) { bd = d; best = i; } }
    this.idx = best; return Math.sqrt(bd);
  }
  // hot: the player carries cargo; wanted: a hot load, seen from further away and harder to shake off
  // sight: 1 by day, less at night (a hot load is seen from closer and easier to lose in the dark)
  think(dt, player, hot, wanted = false, sight = 1) {
    const c = this.car, r = this.ring, inp = this.input, d = Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z);
    this.dist = d;
    if (this.mode === 'block') {        // parked across the road: hold still until the player has come close and got past
      inp.steer = 0; inp.throttle = 0; inp.brake = 1; inp.handbrake = true;
      if (d < 40) this.near = true;
      if (this.near && d > 60 && hot) { this.mode = 'chase'; this.lost = 0; inp.handbrake = false; inp.brake = 0; }
      return;
    }
    if (this.mode === 'patrol' && hot && d < (wanted ? 420 : 240) * sight) { this.mode = 'chase'; this.lost = 0; }
    else if (this.mode === 'chase') { if (!hot) this.mode = 'patrol'; else { this.lost = d > (wanted ? 640 : 460) * (0.5 + 0.5 * sight) ? this.lost + dt : 0; if (this.lost > 5) this.mode = 'patrol'; } if (this.mode === 'patrol') this.nearestIdx(true); }
    let ang, vT;
    if (this.mode === 'chase') {
      const lead = clamp(d / 45, 0, 1.1);
      ang = angTo(c, player.pos.x + player.vel.x * lead, player.pos.z + player.vel.z * lead);
      vT = d < 13 && player.speed < 5 ? 0 : Math.abs(ang) > 0.7 ? 12 : d < 25 ? Math.max(player.speed + 4, 8) : 60;
    } else {
      const off = this.nearestIdx(false), look = Math.max(7, c.speed * 0.4) | 0;
      if (!r.closed && (this.dir > 0 ? this.idx > r.n - 1 - look - 6 : this.idx < look + 6)) this.dir = -this.dir;   // end of an open road: turn back
      const t = wrap(r, this.idx + this.dir * look), t1 = wrap(r, t + this.dir), lx = r.x[t1] - r.x[t], lz = r.z[t1] - r.z[t], ll = Math.hypot(lx, lz) || 1;
      // keep to the right-hand lane; pull into the other lane to pass a slow car ahead
      const px = player.pos.x - c.pos.x, pz = player.pos.z - c.pos.z, ahead = px * c.fwd.x + pz * c.fwd.z, side = px * c.left.x + pz * c.left.z;
      const blocked = ahead > 0 && ahead < 30 && Math.abs(side) < 3.4 && player.vel.x * c.fwd.x + player.vel.z * c.fwd.z < 7;
      this.pass = blocked ? 1.5 : Math.max(0, (this.pass || 0) - dt);
      const lane = this.pass > 0 ? -3.2 : 2.4;
      ang = angTo(c, r.x[t] - lz / ll * lane, r.z[t] + lx / ll * lane);
      const a = wrap(r, this.idx + this.dir * 12), b = wrap(r, this.idx + this.dir * 36), a2 = wrap(r, a + this.dir), b2 = wrap(r, b + this.dir);
      let turn = Math.atan2(r.x[b2] - r.x[b], r.z[b2] - r.z[b]) - Math.atan2(r.x[a2] - r.x[a], r.z[a2] - r.z[a]); turn = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
      vT = off > 30 ? 12 : clamp(17 - turn * 14, 9, 17);
      if (this.pass > 0) vT = Math.min(vT, ahead > 0 && ahead < 10 && Math.abs(side) < 2.3 ? 3 : 10);
    }
    inp.steer = clamp(ang * 2.4, -1, 1);
    const e = vT - c.speed; inp.throttle = e > 0 ? clamp(e * 0.4, 0, 1) : 0; inp.brake = e < -2 ? clamp(-e * 0.25, 0, 1) : 0;
    // stuck or flipped: go back to the road, out of the player's sight if possible
    if (c.speed < 1.2 && (inp.throttle > 0.5 || c.up.y < 0.4)) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 3.5 && (d > 30 || c.up.y < 0.4)) { this.nearestIdx(true); if (d > 150) this.toRoad(this.idx); else { c.place(c.pos.x, c.pos.z, Math.atan2(c.fwd.x, c.fwd.z), 1); this.stuck = 0; } }
  }
}

export class Game {
  // bank: the saved-progress object; cash and completed runs are kept on it
  constructor(world, player, bank) {
    this.world = world; this.player = player; this.bank = bank; this.sites = world.places.sites;
    this.job = null; this.offers = []; this.kinds = new Map(); this.events = []; this.frozen = false; this.rival = null;
    this.dwell = 0; this.bust = 0; this.heat = 0; this.hurtT = 0; this.rammed = 0; this.nearest = 1e9;
    const beats = beatRoads(world);
    this.patrols = [[0.36, 1], [0.7, -1], [0.9, 1]].map(([u, dir], k) => new Patrol(world, Math.floor(beats[k].n * u), dir, beats[k]));
    this.chaseT = 0; this.blockCool = 0; this.backupCool = 0;
    this.refill(null);
  }
  // ---- extra patrols for a run that has drawn attention: a roadblock ahead, and backup from behind ----
  get extras() { return this.patrols.filter((p) => p.temp); }
  clearExtras() { this.patrols = this.patrols.filter((p) => !p.temp); }
  // where the player is on the ring road: sample index, which way along it they are heading, and how far off it they are
  // (on the speedway: the nearest of the patrols' roads, as r)
  ringSpot() {
    const p = this.player; let r = this.world.roads[0], i0 = 0, bd = 1e18;
    for (const road of new Set(beatRoads(this.world))) for (let i = 0; i < road.n; i += 2) { const d = (road.x[i] - p.pos.x) ** 2 + (road.z[i] - p.pos.z) ** 2; if (d < bd) { bd = d; i0 = i; r = road; } }
    if (!r.closed && i0 >= r.n - 1) i0 = r.n - 2;
    const j = i0 + 1, tx = r.x[j] - r.x[i0], tz = r.z[j] - r.z[i0], h = p.speed > 3 ? p.vel : p.fwd;
    return { r, i: i0, dir: tx * h.x + tz * h.z >= 0 ? 1 : -1, off: Math.sqrt(bd) };
  }
  // two patrol cars parked across the ring road some way ahead, with a gap just wide enough for a car at one side
  setBlock() {
    const spot = this.ringSpot(), r = spot.r; if (spot.off > 140) return false;
    const ahead = Math.round(ROADBLOCK.ahead / (r.ds || 2)), bi = wrap(r, spot.i + spot.dir * ahead); if (!r.closed && Math.abs(bi - spot.i) < ahead / 2) return false;
    const f = this.world.frame(r, bi), flip = Math.random() < 0.5 ? 1 : -1;
    this.blockAt = { x: f.x, z: f.z, idx: bi };
    for (const lat of ROADBLOCK.lat) {
      const pt = new Patrol(this.world, bi, spot.dir, r), l = lat * flip;
      pt.car.place(f.x + f.lx * l, f.z + f.lz * l, Math.atan2(f.lx, f.lz) + (l > 0 ? 0.25 : -0.25));
      pt.mode = 'block'; pt.temp = 'block'; pt.age = 0; pt.input.handbrake = true; this.patrols.push(pt);
    }
    this.emit('roadblock', { name: r.name }); return true;
  }
  // one more patrol, coming up the ring road from behind the player
  callBackup() {
    const spot = this.ringSpot(), r = spot.r; if (spot.off > 300) return false;
    const back = Math.round(ROADBLOCK.backup / (r.ds || 2)), bi = wrap(r, spot.i - spot.dir * back);
    const pt = new Patrol(this.world, bi, spot.dir, r); pt.mode = 'chase'; pt.temp = 'backup'; pt.age = 0; this.patrols.push(pt);
    this.emit('backup', {}); return true;
  }
  // called once a frame: put up a roadblock and call backup when a run gets hot, and send extras away when they are done
  extrasTick(dt, hot, wanted, chasing) {
    this.blockCool -= dt; this.backupCool -= dt;
    this.chaseT = hot && chasing ? this.chaseT + dt : 0;
    if (!hot) { if (this.extras.length) this.clearExtras(); return; }
    for (const pt of this.extras) pt.age += dt;
    if (this.patrols.some((pt) => pt.temp === 'block' && pt.mode === 'chase' && !pt.passed)) { for (const pt of this.patrols) if (pt.temp === 'block') pt.passed = true; this.emit('runblock', {}); }
    // a chaser that has lost the player goes home; a roadblock nobody came to is taken down after a while, out of sight
    this.patrols = this.patrols.filter((pt) => !pt.temp || !((pt.mode === 'patrol') || (pt.mode === 'block' && pt.age > ROADBLOCK.life && pt.dist > 250)));
    if (this.kid) return;
    const blocked = this.patrols.some((pt) => pt.temp === 'block');
    // backup first, so the roadblock is the news that stays on screen when both come at once
    if (wanted && chasing && this.backupCool <= 0 && !this.patrols.some((pt) => pt.temp === 'backup')) { if (this.callBackup()) this.backupCool = ROADBLOCK.backupCool; else this.backupCool = 10; }
    if (!blocked && this.blockCool <= 0 && chasing && (wanted || this.chaseT > ROADBLOCK.after)) { if (this.setBlock()) this.blockCool = ROADBLOCK.cool; else this.blockCool = 10; }
  }
  get cash() { return this.bank.cash; }
  // after a race or a long stop: spread the patrols around the ring, away from the player
  scatter() {
    const p = this.player.pos;
    this.patrols.forEach((pt, k) => {
      const r = pt.ring; let near = 0, bd = 1e18;
      for (let i = 0; i < r.n; i += 4) { const d = (r.x[i] - p.x) ** 2 + (r.z[i] - p.z) ** 2; if (d < bd) { bd = d; near = i; } }
      // round a closed road: spread out away from the player; along an open one: the far part of the road from them
      const i = r.closed ? (near + Math.floor(r.n * (0.3 + k * 0.22))) % r.n : Math.floor((near < r.n / 2 ? 0.6 + k * 0.15 : 0.1 + k * 0.15) * r.n);
      pt.mode = 'patrol'; pt.pass = 0; pt.toRoad(i);
    });
    this.heat = 0; this.bust = 0; this.clearExtras(); this.chaseT = 0;
  }
  emit(type, data) { this.events.push({ type, ...data }); }
  refill(exclude) {
    const pool = this.sites.filter((s) => s !== exclude && !this.offers.includes(s));
    while (this.offers.length < 3 && pool.length) {
      const p = this.player.pos; pool.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      const k = Math.min(pool.length - 1, (Math.random() * Math.min(5, pool.length)) | 0), site = pool.splice(k, 1)[0];
      let kind = this.pickKind(); if (site.outer && CARGO[kind].rival) kind = 'freight';   // the rival runs stay on the first map's ground
      this.offers.push(site); this.kinds.set(site, kind);
    }
  }
  // a kind for a new offer: the first run is always plain freight, and no two offers on the board are the same special kind
  pickKind() {
    if (!this.bank.runs) return 'freight';
    const taken = new Set(this.offers.map((s) => this.kinds.get(s)).filter((k) => k && k !== 'freight'));
    const ids = CARGO_IDS.filter((id) => !taken.has(id)), sum = ids.reduce((a, id) => a + CARGO[id].w, 0);
    let r = Math.random() * sum; for (const id of ids) { r -= CARGO[id].w; if (r < 0) return id; }
    return 'freight';
  }
  kindOf(site) { return this.kinds.get(site) || 'freight'; }
  startJob(from, kind = this.kindOf(from)) {
    const K = CARGO[kind], c = this.sites.filter((s) => s !== from && Math.hypot(s.x - from.x, s.z - from.z) > 700 && !(K.rival && s.outer));
    const to = c[(Math.random() * c.length) | 0], dist = Math.hypot(to.x - from.x, to.z - from.z);
    const wild = to.wild || from.wild, time = Math.round((dist * 1.45 / (wild ? 16 : 21) + 20) * K.time * (this.kid ? KID.time : 1) * (to.outer || from.outer ? 1.25 : 1));   // the outer loop's pickups are further round by road
    const pay = Math.round((250 + dist * 0.75) * (wild ? 1.35 : 1) * K.pay * (this.player.spec.payBonus || 1) / 10) * 10;
    this.job = { from, to, pay, time, left: time, cond: 1, dist, kind };
    if (K.rival) this.rival = new Rival(this.world, from, to, time * RIVAL_DUE);
    this.offers = []; this.kinds.clear(); this.dwell = 0; this.emit('pickup', { job: this.job });
  }
  damage(v) {
    if (!this.job || v < 7 || this.hurtT > 0) return;
    const K = CARGO[this.job.kind];
    this.hurtT = 0.5; this.job.cond = Math.max(K.fragile ? 0 : 0.3, this.job.cond - clamp((v - 5) * 0.012, 0.02, 0.2) * K.hurt * (this.player.spec.cargoArmor ?? 1));
    if (K.fragile && this.job.cond <= 0) return this.endJob(false, 'broken');
    this.emit('damage', { cond: this.job.cond });
  }
  endJob(ok, why) {
    const j = this.job; this.job = null; this.bust = 0; this.rival = null; this.clearExtras(); this.chaseT = 0;
    if (ok) { const bonus = Math.round(j.left * 2 / 10) * 10, total = Math.round(j.pay * j.cond / 10) * 10 + bonus; this.bank.cash += total; this.bank.runs++; this.emit('delivered', { total, bonus, cond: j.cond, name: j.to.name, kind: j.kind }); }
    else if (why === 'bust') { const fine = Math.min(this.bank.cash, 150); this.bank.cash -= fine; this.emit('busted', { fine }); }
    else if (why === 'broken') this.emit('broken', {});
    else if (why === 'beaten') this.emit('beaten', { name: j.to.name });
    else this.emit('late', {});
    this.refill(ok ? j.to : null);
  }
  step(dt) {
    if (this.frozen) return;
    const p = this.player;
    for (const pt of this.patrols) pt.car.step(dt, pt.input);
    const rv = this.rival;
    if (rv) { rv.car.step(dt, rv.input); const h = collideCars(p, rv.car); if (h) this.damage(h * 0.7 + 3); for (const pt of this.patrols) collideCars(pt.car, rv.car); }
    for (let i = 0; i < this.patrols.length; i++) {
      const h = collideCars(p, this.patrols[i].car); if (h) { this.damage(h * 0.7 + 3); this.rammed = Math.max(this.rammed || 0, h); }
      for (let k = i + 1; k < this.patrols.length; k++) collideCars(this.patrols[i].car, this.patrols[k].car);
    }
    if (p.impact > 0) this.damage(p.impact);
    if (this.hurtT > 0) this.hurtT -= dt;
  }
  // once per rendered frame
  update(dt) {
    if (this.frozen) return;
    const p = this.player, hot = !!this.job, wanted = hot && !!CARGO[this.job.kind].hot;
    let chasing = 0, nearest = 1e9;
    for (const pt of this.patrols) { pt.think(dt, p, hot, wanted, this.sight ?? 1); if (pt.mode === 'chase') { chasing++; nearest = Math.min(nearest, pt.dist); } else if (pt.mode === 'block') nearest = Math.min(nearest, pt.dist); }
    if (chasing && !this.heat) this.emit('spotted', {});
    if (!chasing && this.heat && hot) this.emit('escaped', {});
    this.extrasTick(dt, hot, wanted, chasing);
    this.heat = chasing; this.nearest = nearest;
    if (hot) {
      const j = this.job; j.left -= dt;
      if (nearest < 15 && p.speed < 4.5) this.bust += dt / 2.6 * (this.kid ? KID.bust : 1); else this.bust = Math.max(0, this.bust - dt * 0.6);
      if (this.bust >= 1) return this.endJob(false, 'bust');
      if (j.left <= 0) return this.endJob(false, 'late');
      if (this.rival) { this.rival.think(dt); if (this.rival.dist < 9) return this.endJob(false, 'beaten'); }
      const d = Math.hypot(p.pos.x - j.to.x, p.pos.z - j.to.z);
      this.dwell = d < 9 && p.speed < 2.5 ? this.dwell + dt : 0;
      if (this.dwell > 0.5) this.endJob(true);
    } else {
      let inside = null;
      for (const s of this.offers) if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 9) inside = s;
      this.dwell = inside && p.speed < 2.5 ? this.dwell + dt : 0;
      this.inside = inside;
      if (inside && this.dwell > 0.6) this.startJob(inside);
    }
  }
  target() { // where the player should head: destination, or nearest pickup
    if (this.job) return this.job.to;
    let best = null, bd = 1e9; for (const s of this.offers) { const d = Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z); if (d < bd) { bd = d; best = s; } }
    return best;
  }
}
