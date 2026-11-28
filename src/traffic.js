// Everyday traffic: a handful of ordinary cars driving the closed tarmac roads (the ring road and, on the bigger maps,
// the outer loop) at sensible speeds, keeping to the right, slowing through towns and behind whoever is in front.
// They appear out of sight around the player and go again once far away, so only the cars nearby cost anything.
// They are real cars (same physics as everyone else), so they can be bumped, shoved and spun.
// No rendering (runs in node for tests).
import { Vehicle, collideCars } from './vehicle.js';
import { buildSpec } from './cars.js';
import { makePath, Driver } from './ai.js';
import { SURF } from './terrain.js';

// n: cars at once (phones: nTouch). spawn: how far away new cars appear, metres along the road and at least `seen` in a
// straight line. gone: cars further than this are taken away. vOpen/vTown: top speeds, m/s (about 52 and 30 mph).
export const TRAFFIC = { n: 10, nTouch: 7, spawn: [170, 460], seen: 150, gone: 600, clear: 40, vOpen: 23.5, vFast: 31, vTown: 13.5, skill: 0.5 };
const KINDS = ['wagon', 'hatch', 'wagon', 'truck', 'hatch', 'sprint'];
export const TRAFFIC_PAINTS = [0x9aa0a6, 0x2d3a4a, 0x7a2a26, 0xd9d6cf, 0x3e5a3c, 0x202224, 0x8c7a5c, 0x4a6a8a, 0xb8b2a4, 0x5c2f3e];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// One ordinary driver: holds its lane (right of the centre line), follows the car in front at a safe gap, and
// never overtakes. Instead of being put back on the road when stuck, it is marked as a wreck and cleared away.
export class Commuter extends Driver {
  constructor(car, path, slow, opt) { super(car, path, opt); this.slow = slow; this.wreck = 0; this.age = 0; }
  respawn() { this.wreck = 1; }
  think(dt, cars) {
    const c = this.car, p = this.path, n = p.n, inp = this.input, tr = this.track, sp = c.speed;
    tr.update(c.pos); this.age += dt;
    // the nearest car ahead in this lane (or coming at us in it): keep a gap of about a second and a half
    let follow = 1e9;
    for (const o of cars) {
      if (o === c) continue;
      const rx = o.pos.x - c.pos.x, rz = o.pos.z - c.pos.z, ahead = rx * c.fwd.x + rz * c.fwd.z, side = rx * c.left.x + rz * c.left.z;
      if (ahead < 1 || ahead > 14 + sp * 1.8 || Math.abs(side) > 2.6) continue;
      const ov = Math.max(0, o.vel.x * c.fwd.x + o.vel.z * c.fwd.z);
      follow = Math.min(follow, ahead < 7 ? 0 : ov + (ahead - 7 - sp * 0.9) * 0.6);
    }
    // steering: a point a little way up the road, in this driver's lane
    const look = Math.max(4, Math.round(Math.max(sp, 6) * 0.8 / p.ds)), f = p.at(tr.idx + look, this.f);
    const dx = f.x + f.tz * this.lane - c.pos.x, dz = f.z - f.tx * this.lane - c.pos.z;
    const ang = Math.atan2(dx * c.fwd.z - dz * c.fwd.x, dx * c.fwd.x + dz * c.fwd.z), Ld = Math.max(4, Math.hypot(dx, dz));
    inp.steer = clamp(Math.atan(2 * c.spec.wheelbase * Math.sin(ang) / Ld) / c.lock * 1.25, -1, 1);
    const i2 = (tr.idx + 2) % n;
    let vT = this.v[i2];
    if (this.slow[i2] || this.slow[(tr.idx + 40) % n]) vT = Math.min(vT, TRAFFIC.vTown);
    if (Math.abs(tr.off - this.lane) > 4) vT = Math.min(vT, 8);            // knocked off its line: crawl back
    if (Math.abs(ang) > 0.9) vT = Math.min(vT, 5);
    vT = Math.max(0, Math.min(vT, follow));
    const e = vT - sp, park = vT < 0.5 && (sp < 2 || c.vel.dot(c.fwd) < 0.8);
    inp.throttle = e > 0 ? clamp(e * 0.35, 0, 0.8) : 0; inp.brake = !park && e < -0.8 ? clamp(-e * 0.25, 0, 1) : 0; inp.handbrake = park;
    // spun round, on its side, or stuck in the scenery: done for
    if (vT > 3 && sp < 1 && inp.throttle > 0.3) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
    this.flip = c.up.y < 0.4 ? this.flip + dt : 0;
    if (this.stuck > 6 || this.flip > 2 || tr.far > 30 || (c.vel.dot(c.fwd) < -2 && this.age > 3)) this.wreck = 1;
  }
}

export class Traffic {
  // opt: n (cars at once), rnd (random numbers, for tests)
  constructor(world, opt = {}) {
    this.world = world; this.max = opt.n ?? TRAFFIC.n; this.rnd = opt.rnd || Math.random; this.cars = []; this.on = true; this.extras = true; this.spawnT = 0; this.nextId = 1;
    this.routes = [];
    world.roads.forEach((road, r) => {
      // loops of tarmac, and the speedway's interstate (open at both ends: cars leave at the ends); never the race oval
      if (road.noTraffic || road.surf !== SURF.ASPHALT || (!road.closed && !road.interstate)) return;
      for (const rev of [false, true]) {
        const path = makePath(road, rev), slow = new Uint8Array(path.n);
        // slow through towns: anywhere within 260 m of a town on this road
        const towns = (world.towns || []).filter((t) => t.road === r);
        for (let i = 0; i < path.n; i++) for (const t of towns) if ((path.x[i] - t.x) ** 2 + (path.z[i] - t.z) ** 2 < 260 * 260) { slow[i] = 1; break; }
        this.routes.push({ r, road, path, slow, rev, open: !road.closed, fast: !!road.interstate });
      }
    });
  }
  get list() { return this.cars; }
  clear() { this.cars.length = 0; }
  // once per drawn frame: thinking, taking away far or wrecked cars, and adding new ones out of sight.
  // player: the player's car; others: patrols, the rival (cars the traffic should keep clear of)
  update(dt, player, others = []) {
    const P = player.pos, all = [player, ...others, ...this.cars.map((t) => t.car)];
    this.cars = this.cars.filter((t) => {
      const d = Math.hypot(t.car.pos.x - P.x, t.car.pos.z - P.z);
      if (t.open && (t.driver.track.idx > t.driver.path.n - 70 || !this.extras)) return false;   // off the end of the interstate
      return d < TRAFFIC.gone && !(t.driver.wreck && d > 90) && !(t.driver.wreck && t.driver.age > 40);
    });
    if (!this.on) { this.cars.length = 0; return; }
    for (const t of this.cars) t.driver.think(dt, all);
    if ((this.spawnT -= dt) <= 0 && this.cars.length < this.max) { this.spawnT = 0.35; this.spawn(player, others); }
  }
  // a new car somewhere along a road near the player, far enough away not to be seen appearing
  spawn(player, others = []) {
    const P = player.pos, w = this.world, rnd = this.rnd;
    const near = this.routes.filter((rt) => !rt.rev && (this.extras || !rt.fast)).map((rt) => { let bi = 0, bd = 1e18; const p = rt.path; for (let i = 0; i < p.n; i += 4) { const d = (p.x[i] - P.x) ** 2 + (p.z[i] - P.z) ** 2; if (d < bd) { bd = d; bi = i; } } return { rt, i: bi, d: Math.sqrt(bd) }; })
      .filter((q) => q.d < TRAFFIC.spawn[1]);
    if (!near.length) return null;
    const q = near[Math.floor(rnd() * near.length)], rev = rnd() < 0.5, rt = this.routes.find((x) => x.r === q.rt.r && x.rev === rev) || q.rt, p = rt.path;
    const along = (TRAFFIC.spawn[0] + rnd() * (TRAFFIC.spawn[1] - TRAFFIC.spawn[0])) * (rnd() < 0.5 ? -1 : 1);
    let roadIdx;
    if (rt.open) { roadIdx = rt.road.from + q.i + Math.round(along / p.ds); if (roadIdx < rt.road.from + 60 || roadIdx > rt.road.to - 140) return null; }
    else roadIdx = ((q.i + Math.round(along / p.ds)) % p.n + p.n) % p.n;
    const pi = p.of(roadIdx), f = p.at(pi);
    // the interstate has three lanes each way: any of them, a little quicker than town roads
    const lane = rt.fast ? -[2.2, 5.6, 9][Math.floor(rnd() * 3)] : -(p.hw * 0.42), x = f.x + f.tz * lane, z = f.z - f.tx * lane;
    if (Math.hypot(x - P.x, z - P.z) < TRAFFIC.seen) return null;
    for (const o of [player, ...others, ...this.cars.map((t) => t.car)]) if (Math.hypot(o.pos.x - x, o.pos.z - z) < TRAFFIC.clear) return null;
    if (w.waterAt && w.sample(x, z) < w.waterAt(x, z) - 0.5) return null;
    const kind = KINDS[Math.floor(rnd() * KINDS.length)], car = new Vehicle(w, buildSpec(kind));
    car.place(x, z, f.yaw);
    const driver = new Commuter(car, p, rt.slow, { skill: TRAFFIC.skill, vcap: (rt.fast ? TRAFFIC.vFast : TRAFFIC.vOpen) * (0.88 + rnd() * 0.17), lane, idx: pi });
    const v0 = Math.min(driver.v[pi], rt.slow[pi] ? TRAFFIC.vTown : 99) * 0.8; car.vel.set(car.fwd.x * v0, 0, car.fwd.z * v0);
    const t = { id: this.nextId++, open: rt.open, car, driver, kind, paint: TRAFFIC_PAINTS[Math.floor(rnd() * TRAFFIC_PAINTS.length)] };
    this.cars.push(t);
    return t;
  }
  // physics rate: move every car, and knock them against the player, each other and the other cars given.
  // Returns the hardest knock the player took this step.
  step(dt, player, others = []) {
    let hit = 0; const C = this.cars;
    for (const t of C) t.car.step(dt, t.driver.input);
    for (let i = 0; i < C.length; i++) {
      const a = C[i].car;
      if (Math.abs(a.pos.x - player.pos.x) < 8 && Math.abs(a.pos.z - player.pos.z) < 8) { const h = collideCars(player, a); if (h > hit) hit = h; }
      for (const o of others) if (Math.abs(a.pos.x - o.pos.x) < 8 && Math.abs(a.pos.z - o.pos.z) < 8) collideCars(o, a);
      for (let k = i + 1; k < C.length; k++) { const b = C[k].car; if (Math.abs(a.pos.x - b.pos.x) < 8 && Math.abs(a.pos.z - b.pos.z) < 8) collideCars(a, b); }
    }
    return hit;
  }
}
