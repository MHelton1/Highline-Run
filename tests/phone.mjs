// Phone extras: tilt steering math for every way of holding the phone and both sign conventions, and the save fields.
// usage: node tests/phone.mjs
import assert from 'node:assert/strict';
import { tiltSteer, TILT_FULL } from '../src/phone.js';
import { freshSave, cleanSave } from '../src/save.js';
const G = 9.81, rad = (d) => d * Math.PI / 180;
// gravity reading (spec convention: "up" as seen by the device) for a phone tilted so the screen's right side is
// `deg` degrees down, screen facing up-ish at 45 degrees, held at a given screen angle
function reading(deg, angle) {
  const sx = -Math.sin(rad(deg)) * G, rest = Math.cos(rad(deg)) * G, sy = rest * Math.sin(rad(45)), z = rest * Math.cos(rad(45));
  const a = rad(angle);   // screen axes back to device axes
  return [sx * Math.cos(a) + sy * Math.sin(a), -sx * Math.sin(a) + sy * Math.cos(a), z];
}
for (const angle of [0, 90, 180, 270, -90]) {
  const [x, y, z] = reading(TILT_FULL, angle), right = tiltSteer(x, y, z, angle, 1);
  const [x2, y2, z2] = reading(-12, angle), left = tiltSteer(x2, y2, z2, angle, 1);
  const [x3, y3, z3] = reading(1.5, angle), level = tiltSteer(x3, y3, z3, angle, 1);
  assert.ok(right < -0.98, `angle ${angle}: right tilt steers right (${right})`);
  assert.ok(left > 0.35 && left < 0.55, `angle ${angle}: half left (${left})`);
  assert.ok(level === 0, `angle ${angle}: near level is straight`);
  // a browser that reports the opposite sign: with the sign flipped the result is the same
  assert.ok(Math.abs(tiltSteer(-x, -y, -z, angle, -1) - right) < 1e-9);
}
const s = freshSave(); assert.equal(s.tilt, false); assert.equal(s.buzz, true);
const c = cleanSave({ tilt: true, buzz: false }); assert.equal(c.tilt, true); assert.equal(c.buzz, false);
assert.equal(cleanSave({ tilt: 'yes' }).tilt, false);
console.log('phone: all checks passed');
