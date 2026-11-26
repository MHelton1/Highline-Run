// Path-following drivers for road races. No rendering (runs in node for tests).
import { G } from './vehicle.js';
import { SURF_PHYS } from './terrain.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// A drivable line along a road: its points, and how sharply it bends at each one. `reverse` gives the same road driven
// the other way.
export function makePath(road, reverse = false) {
  const closed = road.closed, a0 = closed ? 0 : road.from, n = closed ? road.n : road.to - road.from + 1, ds = road.ds, B = closed ? 8 : 5;
  const cut = (a) => (reverse ? Float32Array.from(a.subarray(a0, a0 + n)).reverse() : a.subarray(a0, a0 + n));
  const x = cut(road.x), z = cut(road.z), h = cut(road.h), kappa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = closed ? (i - B + n) % n : i - B, b = closed ? (i + B) % n : i + B;
    if (a < 0 || b >= n) continue;
    let d = Math.atan2(x[b] - x[i], z[b] - z[i]) - Math.atan2(x[i] - x[a], z[i] - z[a]); d = Math.atan2(Math.sin(d), Math.cos(d));
    kappa[i] = Math.abs(d) / (B * ds);      // the two chords' midpoints are B samples apart
  }
  const path = { x, z, h, n, ds, closed, hw: road.hw, surf: road.surf, kappa, len: n * ds, a0, reverse };
  path.of = (roadIdx) => (reverse ? n - 1 - (roadIdx - a0) : roadIdx - a0);      // where a sample of the road sits on this path
  // point, unit tangent and yaw at sample i (left of travel is (tz, -tx))
  path.at = (i, out = {}) => {
    i = closed ? ((i % n) + n) % n : clamp(i, 0, n - 1);
    const b = closed ? (i + 1) % n : Math.min(n - 1, i + 1), a = b === i ? i - 1 : i;
    let tx = x[b] - x[a], tz = z[b] - z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    out.i = i; out.x = x[i]; out.z = z[i]; out.y = h[i]; out.tx = tx; out.tz = tz; out.yaw = Math.atan2(tx, tz);
    return out;
  };
  return path;
}

// Follows one car's progress along a path: nearest sample, metres covered (keeps counting across laps), offset to the left.
export class Tracker {
  constructor(path, idx, prog = 0) { this.path = path; this.idx = idx; this.prog = prog; this.off = 0; this.far = 0; this.f = {}; }
  update(pos) {
    const p = this.path, n = p.n, lost = this.far > 45, w0 = lost ? -30 : -8, w1 = lost ? 130 : 45;
    let best = this.idx, bd = 1e18;
    for (let k = w0; k <= w1; k++) {
      let i = this.idx + k;
      if (p.closed) i = ((i % n) + n) % n; else if (i < 0 || i >= n) continue;
      const d = (p.x[i] - pos.x) ** 2 + (p.z[i] - pos.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    this.far = Math.sqrt(bd);
    if (this.far > 45 && !lost) return;                 // just left the road: hold the last known spot
    let delta = best - this.idx; if (p.closed) { if (delta > n / 2) delta -= n; else if (delta < -n / 2) delta += n; }
    this.prog += delta * p.ds; this.idx = best;
    const f = p.at(best, this.f); this.off = (pos.x - f.x) * f.tz - (pos.z - f.z) * f.tx;
  }
  sync(idx, prog) { this.idx = idx; this.prog = prog; this.far = 0; }
}

export class Driver {
  // opt: skill (cornering and braking, 1 = the limit of grip), vcap (top speed on the straights, m/s), lane (metres left of the centre line), idx and prog (where the car starts)
  constructor(car, path, opt = {}) {
    this.car = car; this.path = path; this.skill = opt.skill ?? 0.9; this.home = this.lane = this.laneT = opt.lane ?? 0;
    this.track = new Tracker(path, opt.idx ?? 0, opt.prog ?? 0);
    this.pace = 1; this.stuck = 0; this.flip = 0; this.done = false; this.f = {};
    this.input = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true };
    // how fast each point of the line can be taken: cornering grip first, then braking distance worked backwards
    const s = car.spec, mu = SURF_PHYS[path.surf].mu * s.grip * (s.surfGrip ? s.surfGrip[path.surf] : 1) * (car.world && car.world.weatherGrip ? car.world.weatherGrip[path.surf] : 1), n = path.n;
    const alat = mu * G * 0.78 * this.skill, brake = mu * G * (path.surf ? 0.5 : 0.62) * this.skill, v = this.v = new Float32Array(n);
    const cap = opt.vcap ?? 99;
    for (let i = 0; i < n; i++) v[i] = Math.min(cap, Math.sqrt(alat / Math.max(path.kappa[i], 1e-5)));
    for (let pass = 0; pass < (path.closed ? 2 : 1); pass++) for (let i = n - 1; i >= 0; i--) {
      const j = path.closed ? (i + 1) % n : i + 1; if (j >= n) continue;
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * path.ds));
    }
  }
  get prog() { return this.track.prog; }
  respawn() { const f = this.path.at(this.track.idx, this.f); this.car.place(f.x, f.z, f.yaw, undefined, f.y + 0.5); this.stuck = this.flip = 0; this.lane = 0; }
  // cars: every other car in the race (Vehicle objects)
  think(dt, cars, racing = true) {
    const c = this.car, p = this.path, n = p.n, inp = this.input, tr = this.track, sp = c.speed, lim = p.hw - 1.25;
    tr.update(c.pos);
    // traffic: find the nearest slower car just ahead and pick the side with room to pass
    let follow = 1e9; this.laneT = this.home;
    for (const o of cars) {
      if (o === c) continue;
      const rx = o.pos.x - c.pos.x, rz = o.pos.z - c.pos.z, ahead = rx * c.fwd.x + rz * c.fwd.z, side = rx * c.left.x + rz * c.left.z;
      if (ahead < 1 || ahead > 9 + sp * 0.6 || Math.abs(side) > 2.7) continue;
      const ov = o.vel.x * c.fwd.x + o.vel.z * c.fwd.z; if (ov > sp + 1.5) continue;
      const oOff = tr.off + side, L = oOff + 2.7, R = oOff - 2.7, okL = L <= lim, okR = R >= -lim;
      if (okL && (!okR || Math.abs(L - tr.off) < Math.abs(R - tr.off))) this.laneT = L; else if (okR) this.laneT = R;
      if (ahead < 7 && Math.abs(side) < 2.1) follow = Math.min(follow, Math.max(ov, 3) + (ahead - 4.5) * 0.8);
    }
    this.lane += clamp(clamp(this.laneT, -lim, lim) - this.lane, -2.6 * dt, 2.6 * dt);
    // steering: aim at a point a short way up the road, shifted into this driver's lane
    const look = Math.max(4, Math.round(sp * (p.surf ? 0.55 : 0.8) / p.ds)), f = p.at(tr.idx + look, this.f);
    const dx = f.x + f.tz * this.lane - c.pos.x, dz = f.z - f.tx * this.lane - c.pos.z;
    const ang = Math.atan2(dx * c.fwd.z - dz * c.fwd.x, dx * c.fwd.x + dz * c.fwd.z), Ld = Math.max(4, Math.hypot(dx, dz));
    inp.steer = clamp(Math.atan(2 * c.spec.wheelbase * Math.sin(ang) / Ld) / c.lock * 1.25, -1, 1);
    // speed
    let vT = this.v[p.closed ? (tr.idx + 2) % n : Math.min(n - 1, tr.idx + 2)] * this.pace;
    if (Math.abs(tr.off) > p.hw + 3) vT = Math.min(vT, 15);
    if (Math.abs(ang) > 0.9) vT = Math.min(vT, 9);
    if (this.done) vT = p.closed ? Math.min(vT, 15) : tr.idx >= n - 8 ? 0 : Math.min(vT, 9);
    vT = Math.min(vT, follow);
    if (!racing) vT = 0;
    // Told to stand still, the driver parks on the handbrake once it is slow (or rolling backwards): the foot brake held at
    // a standstill would select reverse and the car would shuffle back and forth.
    const e = vT - sp, park = vT === 0 && (sp < 2 || c.vel.dot(c.fwd) < 0.8);
    inp.throttle = e > 0 ? clamp(e * 0.6, 0, 1) : 0; inp.brake = !park && e < -1 ? clamp(-e * 0.3, 0, 1) : 0; inp.handbrake = park;
    // stuck or on its roof: back onto the line
    if (racing && !this.done && sp < 1.5 && inp.throttle > 0.3) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 2);
    this.flip = c.up.y < 0.3 ? this.flip + dt : 0;
    if (this.stuck > 2.5 || this.flip > 1.2 || tr.far > 60) this.respawn();
  }
}
