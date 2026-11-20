// Tips: order, spacing, once each, and old saves skip the basics. Run: node tests/tips.mjs
import assert from 'node:assert/strict';
import { nextTip, skipped, TIPS, TIP_GAP, TIP_IDS } from '../src/tips.js';
import { cleanSave } from '../src/save.js';
const base = { t: 0, job: false, heat: false, near: null, cars: 1, raced: false, delivered: 0, stuck: false, cash: 0, nitro: false, goalsDone: 0, touch: true };
const seen = [];
assert.equal(nextTip({ ...base, t: 2 }, seen, 99), null, 'not in the first seconds');
let t = nextTip({ ...base, t: 5 }, seen, 99); assert.equal(t.id, 'start'); seen.push(t.id);
assert.equal(nextTip({ ...base, t: 10, job: true }, seen, TIP_GAP - 1), null, 'spaced out');
t = nextTip({ ...base, t: 40, job: true }, seen, TIP_GAP); assert.equal(t.id, 'load'); seen.push(t.id);
t = nextTip({ ...base, t: 60, near: 'garage' }, seen, 99); assert.equal(t.id, 'garage'); seen.push(t.id);
t = nextTip({ ...base, t: 70 }, seen, 99); assert.equal(t.id, 'map'); seen.push(t.id);
assert.match(t.text({ touch: true }), /Tap the corner map/); assert.match(t.text({ touch: false }), /Press G/);
t = nextTip({ ...base, t: 80, stuck: true }, seen, 99); assert.equal(t.id, 'stuck'); assert.match(t.text({ touch: true }), /FLIP/);
// an old save skips the basics but still gets the new features
const old = { ...base, t: 200, delivered: 30, cars: 5, raced: true, goalsDone: 20, cash: 90000 };
const sk = skipped(old, []); assert.deepEqual(sk.sort(), ['chase', 'garage', 'goals', 'load', 'race', 'start'].sort());
t = nextTip(old, sk, 99); assert.equal(t.id, 'map');
assert.equal(new Set(TIP_IDS).size, TIPS.length);
// the save keeps known tip ids once each, and tips default on
let s = cleanSave({ tips: ['start', 'start', 'nope', 'map'], tipsOn: false }); assert.deepEqual(s.tips, ['start', 'map']); assert.equal(s.tipsOn, false);
s = cleanSave({}); assert.deepEqual(s.tips, []); assert.equal(s.tipsOn, true);
console.log('tips: all checks passed');
