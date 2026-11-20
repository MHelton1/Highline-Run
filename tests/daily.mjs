// The daily challenge: same task for a date and region, progress, the streak, and save cleaning. Run: node tests/daily.mjs
import assert from 'node:assert/strict';
import { dayKey, dailyFor, cleanDaily, rollDaily, dailyEvent, dailyProgress, streakPay, DAILY_PAY, STREAK_STEP } from '../src/daily.js';
import { cleanSave } from '../src/save.js';
assert.equal(dayKey(new Date(2026, 10, 20, 23, 59)), '2026-11-20');
assert.deepEqual(dailyFor('2026-11-20', 'mountain'), dailyFor('2026-11-20', 'mountain'), 'same task for the same day');
const kinds = new Set(); for (let d = 1; d <= 28; d++) kinds.add(dailyFor(`2026-02-${String(d).padStart(2, '0')}`, 'desert').kind);
assert.ok(kinds.size >= 5, 'variety ' + [...kinds]);
assert.match(dailyFor('2026-11-20', 'coast').text, /Saltcliff Coast/);
// find a day of each kind to drive the logic
const find = (kind) => { for (let d = 1; d < 400; d++) { const k = dayKey(new Date(2026, 0, d)); const c = dailyFor(k, 'mountain'); if (c.kind === kind) return k; } };
// deliveries: count up, pay once
let rec = cleanDaily(null), key = find('deliver'), ch = rollDaily(rec, key, 'mountain');
assert.equal(dailyEvent(rec, ch, 'drift', 5000), 0, 'other kinds do nothing');
let pay = 0; for (let i = 0; i < ch.need; i++) pay = dailyEvent(rec, ch, 'deliver', 1);
assert.equal(pay, DAILY_PAY); assert.equal(rec.streak, 1); assert.equal(dailyProgress(rec, ch), 'Done');
assert.equal(dailyEvent(rec, ch, 'deliver', 1), 0, 'once a day');
// next day, different region: new task; doing it makes a 2-day streak
const next = dayKey(new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + 1));
ch = rollDaily(rec, next, 'desert'); assert.equal(rec.have, 0); assert.equal(rec.done, false);
const val = ch.kind === 'race' ? 1 : ch.kind === 'deliver' ? 1 : ch.kind === 'hot' ? 1 : ch.need;
for (let i = 0; i < 3 && !rec.done; i++) pay = dailyEvent(rec, ch, ch.kind, val);
assert.equal(rec.streak, 2); assert.equal(pay, DAILY_PAY + STREAK_STEP);
// a day skipped resets the streak
const later = dayKey(new Date(+next.slice(0, 4), +next.slice(5, 7) - 1, +next.slice(8, 10) + 3));
ch = rollDaily(rec, later, 'mountain'); const v2 = ch.kind === 'race' || ch.kind === 'deliver' || ch.kind === 'hot' ? 1 : ch.need;
for (let i = 0; i < 3 && !rec.done; i++) dailyEvent(rec, ch, ch.kind, v2); assert.equal(rec.streak, 1);
// travelling after finishing today keeps it done
ch = rollDaily(rec, later, 'coast'); assert.equal(rec.done, true); assert.equal(dailyEvent(rec, ch, ch.kind, 1e6), 0);
// best-of kinds and race places
rec = cleanDaily(null); key = find('drift'); ch = rollDaily(rec, key, 'mountain');
assert.equal(dailyEvent(rec, ch, 'drift', ch.need - 1), 0); assert.match(dailyProgress(rec, ch), /Best today/); assert.ok(dailyEvent(rec, ch, 'drift', ch.need) > 0);
rec = cleanDaily(null); key = find('race'); ch = rollDaily(rec, key, 'mountain');
assert.equal(dailyEvent(rec, ch, 'race', ch.need + 1), 0); assert.ok(dailyEvent(rec, ch, 'race', ch.need) > 0);
assert.equal(streakPay(100), DAILY_PAY + STREAK_STEP * 6);
// save cleaning
let s = cleanSave({ daily: { day: '2026-11-20', region: 'desert', have: 2, done: true, streak: 4, last: '2026-11-20' } });
assert.deepEqual(s.daily, { day: '2026-11-20', region: 'desert', have: 2, done: true, streak: 4, last: '2026-11-20' });
s = cleanSave({ daily: { day: 'x', region: 'mars', have: -3, streak: 'a' } }); assert.deepEqual(s.daily, { day: '', region: '', have: 0, done: false, streak: 0, last: '' });
console.log('daily: all checks passed');
