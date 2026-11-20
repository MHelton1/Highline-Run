// Free-roam scoring: drift chains and speed traps. No rendering (runs in node for tests).
// A drift chain builds while the car slides sideways at speed and pays when it ends cleanly; a crash loses it.
// Speed traps are cameras beside fast stretches of tarmac that clock the car as it passes; a new best pays.

export const DRIFT = { minSpeed: 9, minAngle: 0.26, maxAngle: 1.45, grace: 0.7, step: 1.6, maxMult: 4, minScore: 150, crash: 5.5, payRate: 0.5 };
export const TRAPS = 3, TRAP_R = 11, TRAP_MIN_MPH = 50, TRAP_GOAL_MPH = 80, DRIFT_GOAL = 2000;
export const MPH = 2.23694;

// how far the car is sliding sideways (radians), 0 when slow or rolling straight
export function slideAngle(vel, fwd, left) {
  const vf = vel.x * fwd.x + vel.y * fwd.y + vel.z * fwd.z, vl = vel.x * left.x + vel.y * left.y + vel.z * left.z;
  if (vf < 3) return 0;          // reversing or crawling is not a drift
  return Math.abs(Math.atan2(vl, vf));
}

export class DriftMeter {
  constructor() { this.reset(); }
  reset() { this.score = 0; this.t = 0; this.idle = 0; this.on = false; this.mult = 1; }
  // one step: returns null, or { kind: 'paid', score, pay } / { kind: 'lost', score } when a chain ends
  step(dt, { speed, angle, grounded, impact }) {
    if (this.on && impact > DRIFT.crash) { const sc = Math.round(this.score * this.mult); this.reset(); return sc >= DRIFT.minScore ? { kind: 'lost', score: sc } : null; }
    const sliding = grounded >= 3 && speed > DRIFT.minSpeed && angle > DRIFT.minAngle && angle < DRIFT.maxAngle;
    if (sliding) {
      this.on = true; this.idle = 0; this.t += dt;
      this.mult = Math.min(DRIFT.maxMult, 1 + Math.floor(this.t / DRIFT.step));
      this.score += dt * speed * Math.min(1, angle / 0.7) * 4;
      return null;
    }
    if (!this.on) return null;
    if (grounded < 2) return null;   // a hop mid-drift keeps the chain alive
    this.idle += dt;
    if (this.idle < DRIFT.grace) return null;
    const sc = Math.round(this.score * this.mult); this.reset();
    return sc >= DRIFT.minScore ? { kind: 'paid', score: sc, pay: driftPay(sc) } : null;
  }
  get shown() { return Math.round(this.score * this.mult); }
}
export const driftPay = (score) => Math.min(5000, Math.round(score * DRIFT.payRate / 10) * 10);

// speed trap pay for a new best: $10 a mile an hour over 50
export const trapPay = (mph) => Math.max(0, Math.round((mph - TRAP_MIN_MPH) * 10 / 10) * 10);

// pick the trap spots: straight, level stretches of tarmac far from each other and from the given places
export function placeTraps(world, avoid = []) {
  const cands = [];
  for (const road of world.roads) {
    if (road.surf !== 0) continue;   // tarmac only
    const n = road.to - road.from;
    for (let i = road.from + 20; i <= road.to - 20; i += 6) {
      const a = Math.atan2(road.x[i] - road.x[i - 20], road.z[i] - road.z[i - 20]), b = Math.atan2(road.x[i + 20] - road.x[i], road.z[i + 20] - road.z[i]);
      let turn = Math.abs(a - b); if (turn > Math.PI) turn = 2 * Math.PI - turn;
      const grade = Math.abs(world.sample(road.x[i + 6], road.z[i + 6]) - world.sample(road.x[i - 6], road.z[i - 6]));
      if (turn < 0.12 && n > 60) cands.push({ x: road.x[i], z: road.z[i], fx: Math.sin(b), fz: Math.cos(b), score: turn + grade * 0.01 });
    }
  }
  cands.sort((p, q) => p.score - q.score);
  const out = [];
  for (const c of cands) {
    if (out.length >= TRAPS) break;
    if (avoid.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 90)) continue;
    if (out.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 450)) continue;
    out.push({ i: out.length, x: c.x, z: c.z, fx: c.fx, fz: c.fz });
  }
  return out;
}

// has the car just crossed the trap line (perpendicular to the road through the trap) close to the trap?
export function crossed(trap, px, pz, qx, qz) {
  const s0 = (px - trap.x) * trap.fx + (pz - trap.z) * trap.fz, s1 = (qx - trap.x) * trap.fx + (qz - trap.z) * trap.fz;
  if ((s0 < 0) === (s1 < 0)) return false;
  return Math.hypot(qx - trap.x, qz - trap.z) < TRAP_R;
}
