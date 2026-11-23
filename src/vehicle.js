// Rigid-body car on a heightfield: 4 suspension rays, slip-based tyres, friction circle, auto gearbox.
import { Vector3, Quaternion, Matrix4 } from 'three';
import { SURF_PHYS, HALF } from './terrain.js';

export const RALLY_CAR = {
  name: 'Rally hatch', mass: 1300, inertia: [2100, 2300, 760], // pitch(x), yaw(y), roll(z)
  wheelX: 0.8, wheelZf: 1.3, wheelZr: -1.3, attachY: 0.1, radius: 0.36,
  restLen: 0.44, springK: 31000, dampBump: 3600, dampRebound: 5600, bumpStop: 0.28, arbF: 13000, arbR: 7000,
  torque: 420, peakRpm: 4600, redline: 7000, idle: 900, gears: [3.4, 2.1, 1.45, 1.1, 0.9, 0.78], reverse: 3.2, final: 4.3,
  driveFront: 0.4, brakeForce: 15500, brakeFront: 0.62, grip: 1.0, rearGrip: 1.12, wheelbase: 2.6, stability: 3.2, tc: 1, forceLift: 0.22, tapCut: 0.62, airLevel: 7, cdA: 0.9, downforce: 0.55,
  maxSteer: 0.58, box: { x: 0.85, y0: -0.2, y1: 0.9, z: 2.0 },
};

const m4 = new Matrix4();
export const G = 13.2;   // heavier than real gravity so jumps land quickly
const AIR_G = 0.45;       // extra pull while all four wheels are off the ground
export const STOP_HOLD = 0.6;   // seconds a car stopped on the brake stays put before reverse is selected
const tmp = new Vector3(), tmp2 = new Vector3(), rel = new Vector3(), fvec = new Vector3(), vc = new Vector3(), cr = new Vector3(), at2 = new Vector3();
const tyreCurve = (x) => { const a = Math.abs(x); return Math.sign(x) * Math.sin(1.3 * Math.atan(1.5 * a)); };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class Vehicle {
  constructor(world, spec = RALLY_CAR) {
    this.world = world;
    this.pos = new Vector3(); this.quat = new Quaternion(); this.prevPos = new Vector3(); this.prevQuat = new Quaternion(); /* where it was before the last step, for drawing between steps */ this.vel = new Vector3(); this.angVel = new Vector3();
    this.up = new Vector3(0, 1, 0); this.fwd = new Vector3(0, 0, 1); this.left = new Vector3(1, 0, 0);
    this.F = new Vector3(); this.T = new Vector3();
    this.wheels = [true, true, false, false].map((front) => ({ local: new Vector3(), front, comp: 0, prevComp: 0, onGround: false, spin: 0, slip: 0, surf: 0, load: 0,
      hit: new Vector3(), n: new Vector3(0, 1, 0), fs: 0 }));
    this.corners = Array.from({ length: 12 }, () => new Vector3());
    this.steer = 0; this.steerIn = 0; this.hold = 0; this.keyDir = 0; this.gear = 1; this.shiftT = 0; this.sinceShift = 1; this.stopT = 0;
    this.speed = 0; this.surf = 0; this.grounded = 0; this.slip = 0; this.q = { nx: 0, ny: 1, nz: 0, surf: 0 }; this.impact = 0; this.brakeOn = false;
    this.applySpec(spec);
  }

  // Swap in a different car (or the same car with new parts). Position and speed carry over.
  applySpec(s) {
    s.shiftUp ??= s.redline - 400; s.shiftDown ??= Math.round(s.redline * 0.386); s.band ??= 5600;
    s.surfGrip ??= [1, 1, 1, 1, 1]; s.rrLoose ??= 1; s.steerRate ??= 7; s.launch ??= Math.round(s.peakRpm * 0.62);
    this.spec = s;
    [[s.wheelX, s.wheelZf], [-s.wheelX, s.wheelZf], [s.wheelX, s.wheelZr], [-s.wheelX, s.wheelZr]].forEach(([x, z], i) => this.wheels[i].local.set(x, s.attachY, z));
    let k = 0;
    for (const x of [-s.box.x, s.box.x]) for (const y of [s.box.y0, s.box.y1]) for (const z of [-s.box.z, 0, s.box.z]) this.corners[k++].set(x, y, z);
    this.lock = s.maxSteer; this.rpm = s.idle; if (this.gear > s.gears.length) this.gear = s.gears.length;
    this.restH = s.radius + s.restLen - s.mass * G / (4 * s.springK) - s.attachY;   // height of the centre of mass when parked
  }

  // Put the car down at (x, z) facing `yaw`, lying on the slope so no end starts buried.
  place(x, z, yaw, lift = this.restH + 0.1) {
    const w = this.world, q = this.q, h = w.sample(x, z, q);
    const n = tmp.set(q.nx, q.ny, q.nz), f = tmp2.set(Math.sin(yaw), 0, Math.cos(yaw));
    f.addScaledVector(n, -f.dot(n)).normalize();
    this.quat.setFromRotationMatrix(m4.makeBasis(cr.crossVectors(n, f), n, f));
    this.pos.set(x, h, z).addScaledVector(n, lift);
    let need = 0;
    for (const c of this.corners) { at2.copy(c).applyQuaternion(this.quat).add(this.pos); need = Math.max(need, w.sample(at2.x, at2.z) + 0.12 - at2.y); }
    this.pos.y += need;
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0); this.gear = 1; this.steer = 0; this.steerIn = 0; this.hold = 0; this.stopT = 0;
    for (const w of this.wheels) { w.comp = w.prevComp = 0; }
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
  }

  addForce(f, at) { this.F.add(f); rel.subVectors(at, this.pos); this.T.add(cr.crossVectors(rel, f)); }
  pointVel(at, out) { rel.subVectors(at, this.pos); return out.crossVectors(this.angVel, rel).add(this.vel); }

  step(dt, input) {
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
    const s = this.spec, world = this.world, q = this.q, m = s.mass;
    this.up.set(0, 1, 0).applyQuaternion(this.quat); this.fwd.set(0, 0, 1).applyQuaternion(this.quat); this.left.set(1, 0, 0).applyQuaternion(this.quat);
    const up = this.up, fwd = this.fwd;
    this.F.set(0, -m * G, 0); this.T.set(0, 0, 0);
    const vF = this.vel.dot(fwd), speed = this.vel.length(); this.speed = speed;

    // ---- steering ----
    // Full input asks for about 90% of the grip available at this speed, never more, so the fronts are not overdriven.
    // When the car is sliding the limit opens up so the driver can still countersteer.
    const av = Math.abs(vF), muNow = SURF_PHYS[this.surf].mu * s.grip * s.surfGrip[this.surf] * (this.world.weatherGrip ? this.world.weatherGrip[this.surf] : 1), peakNow = SURF_PHYS[this.surf].peak;
    const beta = av > 3 ? Math.abs(Math.atan2(this.vel.dot(this.left), av)) : 0;
    let lock = s.wheelbase * muNow * G / Math.max(av * av, 1) + 0.2 * peakNow + Math.min(0.5, Math.max(0, beta - 0.04) * 0.9);
    lock = Math.min(s.maxSteer, lock);
    this.lock += (lock - this.lock) * Math.min(1, dt * 8);
    let cmd = clamp(input.steer, -1, 1);
    if (!input.analog) {
      // Keys and touch buttons: a tap gives a quick, small nudge; holding builds up to full lock.
      // (Quick but gentle is far easier to control with on/off input than slow but strong.)
      const dir = Math.sign(cmd), tap = 1 - s.tapCut * clamp((av - 8) / 20, 0, 1);
      if (dir === 0) this.hold = Math.max(0, this.hold - 3 * dt);                       // brief release: keep most of the build-up
      else if (dir === this.keyDir) this.hold = Math.min(1, this.hold + dt / (0.25 + 0.5 * clamp(av / 30, 0, 1)));
      else { this.hold = 0; this.keyDir = dir; }                                        // other direction: start again
      cmd = dir * (tap + (1 - tap) * this.hold);
    }
    this.steerIn += clamp(cmd - this.steerIn, -s.steerRate * dt, s.steerRate * dt);
    this.steer = this.steerIn * this.lock;

    // ---- gearbox + engine ----
    let thr = clamp(input.throttle, 0, 1), brk = clamp(input.brake, 0, 1);
    // A stop made on the brake holds the car for a moment before reverse comes in, so it can be parked in a light with the
    // brake still down. Pressing the brake again, or pressing it from a standstill, selects reverse at once.
    if (brk <= 0.1 || this.gear < 0) this.stopT = 0; else if (vF > 1.5) this.stopT = STOP_HOLD;
    if (this.gear > 0 && brk > 0.1 && thr < 0.1 && vF < 0.8) { if (this.stopT > 0) this.stopT -= dt; else this.gear = -1; }
    else if (this.gear < 0 && thr > 0.1 && vF > -0.8) this.gear = 1;
    if (this.gear < 0) { const t = thr; thr = brk; brk = t; }
    this.brakeOn = brk > 0.05;
    if (thr < 0.05 && brk < 0.05 && Math.abs(vF) < 1.2) brk = 0.35; // auto-hold on slopes
    const ratio = (this.gear < 0 ? s.reverse : s.gears[this.gear - 1]) * s.final;
    const wheelRpm = Math.abs(vF) / s.radius * 9.5493;
    let rpm = wheelRpm * ratio;
    this.sinceShift += dt; this.shiftT -= dt;
    if (this.gear > 0 && this.sinceShift > 0.45) {
      const lower = this.gear > 1 ? wheelRpm * s.gears[this.gear - 2] * s.final : 1e9;
      if (rpm > s.shiftUp && this.gear < s.gears.length && this.grounded >= 2) { this.gear++; this.shiftT = 0.16; this.sinceShift = 0; }
      else if (this.gear > 1 && lower < s.shiftUp - 900 && (rpm < s.shiftDown || (thr > 0.85 && lower < s.shiftUp - 1400))) { this.gear--; this.shiftT = 0.12; this.sinceShift = 0; }
    }
    // pulling away: the clutch slips so the engine can rev into its torque instead of bogging at idle (matters most on hills)
    if (this.gear <= 1) rpm = Math.max(rpm, s.idle + thr * (s.launch - s.idle));
    rpm = clamp(rpm, s.idle, s.redline + 200);
    const tq = s.torque * Math.max(0.25, 1 - Math.pow((rpm - s.peakRpm) / s.band, 2));
    let drive = 0;
    if (this.shiftT <= 0) {
      if (rpm < s.redline) drive = thr * tq * ratio * 0.9 / s.radius;
      if (thr < 0.05) drive -= Math.sign(vF) * (this.gear < 0 ? -1 : 1) * Math.min(1, Math.abs(vF)) * (300 + rpm * 0.12) * (ratio / 8);
    }
    if (this.gear < 0) drive = -drive;
    const showRpm = this.grounded < 2 || this.slip > 0.6 ? Math.max(rpm, s.idle + thr * (s.redline - 1800)) : rpm;
    this.rpm += (showRpm - this.rpm) * Math.min(1, dt * 12);

    // ---- wheels: contact + suspension ----
    const W = this.wheels;
    for (const w of W) {
      w.prevComp = w.comp; w.onGround = false; w.fs = 0;
      tmp.copy(w.local).applyQuaternion(this.quat).add(this.pos);
      if (up.y > 0.2) {
        let t = (tmp.y - world.sample(tmp.x, tmp.z, undefined, tmp.y)) / up.y;   // (the height lets a car under a bridge see the ground, not the deck)
        for (let k = 0; k < 2; k++) { const hx = tmp.x - up.x * t, hz = tmp.z - up.z * t; t += (tmp.y - up.y * t - world.sample(hx, hz, q, tmp.y)) * up.y; }
        const comp = s.restLen + s.radius - t;
        if (comp > 0) {
          w.onGround = true; w.comp = Math.min(comp, s.restLen);
          w.hit.set(tmp.x - up.x * t, tmp.y - up.y * t, tmp.z - up.z * t); w.n.set(q.nx, q.ny, q.nz); w.surf = q.surf;
          const cv = clamp((w.comp - w.prevComp) / dt, -6, 6);
          let fs = s.springK * comp + (cv > 0 ? s.dampBump : s.dampRebound) * cv;
          if (comp > s.bumpStop) fs += s.springK * 5 * (comp - s.bumpStop) + (cv > 0 ? s.dampBump * 2 * cv : 0);
          w.fs = fs;
        } else w.comp = 0;
      } else w.comp = 0;
    }
    for (let a = 0; a < 2; a++) { // anti-roll bars
      const L = W[a * 2], R = W[a * 2 + 1], k = a ? s.arbR : s.arbF, d = (L.comp - R.comp) * k;
      if (L.onGround) L.fs += d; if (R.onGround) R.fs -= d;
    }

    // ---- tyres ----
    let grounded = 0, slipSum = 0, surfPick = this.surf;
    for (const w of W) {
      w.load = 0;
      if (!w.onGround) { w.slip = 0; w.spin += (this.gear < 0 ? -1 : 1) * thr * 40 * dt; continue; }
      grounded++; surfPick = w.surf;
      const Nf = clamp(w.fs, 0, m * G * 3); w.load = Nf;
      const sp = SURF_PHYS[w.surf], n = w.n;
      const st = w.front ? this.steer : 0, c = Math.cos(st), sn = Math.sin(st);
      // wheel heading projected on the ground plane
      tmp.set(fwd.x * c + this.left.x * sn, fwd.y * c + this.left.y * sn, fwd.z * c + this.left.z * sn);
      tmp.addScaledVector(n, -tmp.dot(n)).normalize();           // forward along ground
      tmp2.crossVectors(n, tmp);                                 // left along ground
      this.pointVel(w.hit, vc);
      const vLong = vc.dot(tmp), vLat = vc.dot(tmp2);
      const hb = !w.front && input.handbrake;
      let mu = sp.mu * s.grip * s.surfGrip[w.surf] * (w.front ? 1 : s.rearGrip) * (this.world.weatherGrip ? this.world.weatherGrip[w.surf] : 1);   // rain or snow: less grip
      // lateral
      let Fy = -mu * Nf * tyreCurve(vLat / (Math.max(Math.abs(vLong), 1.5) * sp.peak)) * (hb ? 0.5 : 1);
      // longitudinal
      const roll = clamp(vLong / 0.5, -1, 1);
      let Fx = drive * (w.front ? s.driveFront : 1 - s.driveFront) * 0.5;
      Fx -= roll * (brk * s.brakeForce * (w.front ? s.brakeFront : 1 - s.brakeFront) * 0.5 + sp.rr * (w.surf ? s.rrLoose : 1) * Nf);
      if (hb) Fx = -roll * mu * Nf * 0.95;
      const lim = mu * Nf;
      let mag = Math.hypot(Fx, Fy), over = 0;
      if (mag > lim) {
        over = mag / lim - 1;
        if (!hb) {            // traction and brake assist: give up drive or brake force before cornering force
          const room = Math.sqrt(Math.max(lim * lim - Fy * Fy, 0)), allow = Math.max(room, lim * (1 - 0.65 * s.tc));
          Fx = clamp(Fx, -allow, allow); mag = Math.hypot(Fx, Fy);
        }
        if (mag > lim) { const k = lim / mag; Fx *= k; Fy *= k; }
      }
      w.slip = clamp(Math.max(over, Math.abs(vLat) / (Math.max(Math.abs(vLong), 3) * sp.peak * 1.6) - 0.6) + (hb && Math.abs(vLong) > 2 ? 1 : 0), 0, 2);
      slipSum += w.slip;
      fvec.copy(n).multiplyScalar(Nf).addScaledVector(tmp, Fx);
      this.addForce(fvec, w.hit);
      // side force acts a little above the ground, which calms body roll and makes tripping over harder
      fvec.copy(tmp2).multiplyScalar(Fy); at2.copy(w.hit).addScaledVector(up, s.forceLift); this.addForce(fvec, at2);
      w.spin += (hb ? 0 : vLong / s.radius + (over > 0.05 && Math.abs(drive) > 100 ? Math.sign(drive) * 25 : 0)) * dt;
    }
    this.grounded = grounded; this.slip = slipSum / 4; this.surf = surfPick;

    // ---- body vs ground ----
    this.impact = 0; let scraping = 0;
    for (const c of this.corners) {
      tmp.copy(c).applyQuaternion(this.quat).add(this.pos);
      const pen = world.sample(tmp.x, tmp.z, q, tmp.y) - tmp.y;
      if (pen <= 0) continue;
      scraping++;
      this.pointVel(tmp, vc);
      const vn = vc.x * q.nx + vc.y * q.ny + vc.z * q.nz;
      const fn = clamp(m * (69 * pen - 8.5 * vn), 0, m * G * 6);
      if (-vn > this.impact) this.impact = -vn;
      fvec.set(q.nx, q.ny, q.nz).multiplyScalar(fn);
      vc.x -= q.nx * vn; vc.y -= q.ny * vn; vc.z -= q.nz * vn;
      const vt = vc.length();
      if (vt > 1e-3) fvec.addScaledVector(vc, -Math.min(0.55 * fn, vt * m * 1.15) / vt);
      this.addForce(fvec, tmp);
    }

    // ---- stability assist: damp yaw the driver did not ask for (off while the handbrake is on) ----
    if (grounded >= 2 && !input.handbrake && av > 6) {
      const yaw = this.angVel.dot(up), lim = muNow * G / Math.max(av, 6);
      const want = clamp(vF * Math.tan(this.steer) / s.wheelbase, -lim, lim);
      let err = want - yaw;
      if (Math.abs(yaw) < Math.abs(want) && yaw * want > 0) err = 0;   // never help the car turn in, only calm it down
      this.T.addScaledVector(up, s.inertia[1] * s.stability * err * Math.min(1, (av - 6) / 10) * (grounded / 4));
    }
    if (!grounded) this.F.y -= m * G * AIR_G;

    // ---- aero, world edge ----
    this.F.addScaledVector(this.vel, -0.6 * s.cdA * speed);
    if (input.boost && grounded >= 2 && this.gear > 0) this.F.addScaledVector(fwd, m * input.boost);   // nitro
    if (grounded) this.F.addScaledVector(up, -0.6 * s.downforce * vF * vF);
    const edge = (world.half ?? HALF) - 30;
    if (Math.abs(this.pos.x) > edge) this.F.x -= m * (Math.sign(this.pos.x) * (Math.abs(this.pos.x) - edge) * 6.9 + this.vel.x * 1.9);
    if (Math.abs(this.pos.z) > edge) this.F.z -= m * (Math.sign(this.pos.z) * (Math.abs(this.pos.z) - edge) * 6.9 + this.vel.z * 1.9);

    // ---- integrate ----
    this.vel.addScaledVector(this.F, dt / m);
    const I = s.inertia, qi = tmp2.set(0, 0, 0); // reuse below
    const inv = this._inv || (this._inv = new Quaternion()); inv.copy(this.quat).invert();
    const tl = tmp.copy(this.T).applyQuaternion(inv), wl = vc.copy(this.angVel).applyQuaternion(inv);
    const gx = wl.y * I[2] * wl.z - wl.z * I[1] * wl.y, gy = wl.z * I[0] * wl.x - wl.x * I[2] * wl.z, gz = wl.x * I[1] * wl.y - wl.y * I[0] * wl.x;
    wl.x += (tl.x - gx) / I[0] * dt; wl.y += (tl.y - gy) / I[1] * dt; wl.z += (tl.z - gz) / I[2] * dt;
    wl.multiplyScalar(1 - Math.min(1, (grounded ? 0.25 : 0.05) * dt));
    this.angVel.copy(wl).applyQuaternion(this.quat);
    if (!grounded && !scraping && s.airLevel) {
      // In the air, ease roll and pitch toward the ground ahead so the car comes down on its wheels.
      world.sample(this.pos.x + this.vel.x * 0.25, this.pos.z + this.vel.z * 0.25, q, this.pos.y);
      tmp.set(q.nx * 0.6, 0.4 + 0.6 * q.ny, q.nz * 0.6).normalize();
      cr.crossVectors(up, tmp);
      tmp2.copy(this.angVel).addScaledVector(up, -this.angVel.dot(up));
      this.angVel.addScaledVector(cr, s.airLevel * dt).addScaledVector(tmp2, -3 * dt);
    }
    if (this.angVel.lengthSq() > 144) this.angVel.setLength(12);
    this.pos.addScaledVector(this.vel, dt);
    const w = this.angVel, Q = this.quat, h = 0.5 * dt;
    const qx = Q.x + h * (w.x * Q.w + w.y * Q.z - w.z * Q.y), qy = Q.y + h * (w.y * Q.w + w.z * Q.x - w.x * Q.z),
      qz = Q.z + h * (w.z * Q.w + w.x * Q.y - w.y * Q.x), qw = Q.w - h * (w.x * Q.x + w.y * Q.y + w.z * Q.z);
    Q.set(qx, qy, qz, qw).normalize();

    // ---- trees and buildings ----
    // Every solid thing is a round stop. It is tested against the car's whole footprint (a box the size of the body),
    // not just its middle, so the nose and the sides meet walls and trees where they look.
    const hash = world.treeHash;
    if (hash.size) {
      const cx = (this.pos.x + HALF) >> 4, cz = (this.pos.z + HALF) >> 4, B = s.box;
      let fx = fwd.x, fz = fwd.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const lx = fz, lz = -fx;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = hash.get((cx + a) * 4096 + cz + b); if (!list) continue;
        for (const t of list) {
          if (this.pos.y - t.y > 4 || (t.lo !== undefined && this.pos.y < t.lo) || (t.hi !== undefined && this.pos.y > t.hi)) continue;
          const r = t.rad ?? 0.3 + 0.06 * t.s, rx = t.x - this.pos.x, rz = t.z - this.pos.z;
          if (rx * rx + rz * rz > (r + B.z + B.x) ** 2) continue;
          const al = rx * fx + rz * fz, la = rx * lx + rz * lz;
          const ca = al < -B.z ? -B.z : al > B.z ? B.z : al, cl = la < -B.x ? -B.x : la > B.x ? B.x : la;
          const ex = rx - fx * ca - lx * cl, ez = rz - fz * ca - lz * cl, d = Math.hypot(ex, ez);
          let nx, nz, push;
          if (d > 1e-4) { if (d >= r) continue; nx = -ex / d; nz = -ez / d; push = r - d; }
          else {                  // the stop's centre is inside the footprint: out by the shorter way
            const pa = B.z - Math.abs(al), pl = B.x - Math.abs(la);
            if (pa < pl) { const sg = al > 0 ? -1 : 1; nx = fx * sg; nz = fz * sg; push = pa + r; } else { const sg = la > 0 ? -1 : 1; nx = lx * sg; nz = lz * sg; push = pl + r; }
          }
          const vn = this.vel.x * nx + this.vel.z * nz;
          this.pos.x += nx * push; this.pos.z += nz * push;
          if (vn < 0) {
            this.vel.x -= nx * vn * 1.25; this.vel.z -= nz * vn * 1.25; this.vel.multiplyScalar(0.8);
            // the knock turns the car about its middle, by how far off-centre it landed (a corner clipped spins it)
            const px = fx * ca + lx * cl, pz = fz * ca + lz * cl;
            this.angVel.y += (pz * nx - px * nz) * -vn * 0.3;
            if (-vn > this.impact) this.impact = -vn;
          }
        }
      }
    }
  }
}

// Car-to-car contact: two spheres per car. A heavier car shoves a lighter one further.
export function collideCars(a, b) {
  let hit = 0;
  const ma = a.spec.mass, mb = b.spec.mass, ka = 2 * mb / (ma + mb), kb = 2 * ma / (ma + mb);
  for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
    const ax = a.pos.x + a.fwd.x * 1.05 * i, ay = a.pos.y + a.fwd.y * 1.05 * i, az = a.pos.z + a.fwd.z * 1.05 * i;
    const bx = b.pos.x + b.fwd.x * 1.05 * j, by = b.pos.y + b.fwd.y * 1.05 * j, bz = b.pos.z + b.fwd.z * 1.05 * j;
    const dx = ax - bx, dy = ay - by, dz = az - bz, d = Math.hypot(dx, dy, dz), R = 2.1;
    if (d >= R || d < 1e-4) continue;
    const nx = dx / d, ny = dy / d * 0.3, nz = dz / d, pen = (R - d) * 0.5;
    a.pos.x += nx * pen * ka; a.pos.z += nz * pen * ka; b.pos.x -= nx * pen * kb; b.pos.z -= nz * pen * kb;
    const vn = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * ny + (a.vel.z - b.vel.z) * nz;
    if (vn >= 0) continue;
    const jn = -1.25 * vn * 0.5, ja = jn * ka, jb = jn * kb;
    a.vel.x += nx * ja; a.vel.y += ny * ja; a.vel.z += nz * ja; b.vel.x -= nx * jb; b.vel.y -= ny * jb; b.vel.z -= nz * jb;
    a.angVel.y += (a.fwd.z * i * nx - a.fwd.x * i * nz) * ja * 0.35; b.angVel.y -= (b.fwd.z * j * nx - b.fwd.x * j * nz) * jb * 0.35;
    hit = Math.max(hit, -vn);
  }
  return hit;
}
