// Kid mode: the car drives itself forward at a gentle speed that suits the ground and eases off in turns, so the player
// only has to steer. The brake still works (and holding it at a stop still reverses); letting go drives on again.
// Pure math (runs in node for tests).
import { SURF } from './terrain.js';

// cruising speeds in m/s (about 49, 36 and 27 mph), how much longer cargo jobs allow, how slowly patrols can bust you
export const KID = { road: 22, dirt: 16, rough: 12, turn: 0.45, time: 1.4, bust: 0.35 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// the speed kid mode aims for right now
export function kidTarget(car) {
  const s = car.surf, base = s === SURF.ASPHALT ? KID.road : s === SURF.DIRT ? KID.dirt : KID.rough;
  const lock = clamp(Math.abs(car.steer) / (car.spec.maxSteer || 0.55), 0, 1);
  return base * (1 - KID.turn * lock);
}

// turn the player's controls into kid mode controls (out is reused to avoid garbage)
export function kidInput(car, inp, out = {}) {
  out.steer = inp.steer; out.analog = inp.analog; out.handbrake = !!inp.handbrake;
  if (inp.brake > 0.1) { out.throttle = 0; out.brake = inp.brake; return out; }
  const v = kidTarget(car), sp = car.vel.dot(car.fwd);
  out.throttle = car.grounded ? clamp((v - sp) * 0.35, 0, 1) : 0;
  out.brake = sp > v + 3 ? clamp((sp - v - 3) * 0.12, 0, 0.45) : 0;
  return out;
}
