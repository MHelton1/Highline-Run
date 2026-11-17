// Goals: counting, paying each reward once, the region prize paint, and that a damaged save cannot fake progress.
import assert from 'node:assert/strict';
import { freshSave, cleanSave } from '../src/save.js';
import { regionGoals, garageGoals, allGoals, claimGoals, bump, best, mark, paintLocked, regionComplete, REGION_PAINT } from '../src/goals.js';
import { REGION_IDS } from '../src/regions.js';
import { eventsFor } from '../src/race.js';
import { PAINTS, buildSpec, stockTune } from '../src/cars.js';

const s = freshSave();
assert.equal(allGoals(s).length, REGION_IDS.length * 16 + 6);
assert.equal(claimGoals(s).got.length, 0, 'nothing is done in a fresh save');
for (const r of REGION_IDS) assert.equal(eventsFor(r).length, 6);
assert.deepEqual(eventsFor('coast').map((e) => e.id), ['coast', 'coastb', 'coastx', 'ridge', 'ridgeb', 'cliffs']);

// three deliveries in the desert pay the first goal once, in the desert only
for (let i = 0; i < 3; i++) bump(s, 'desert', 'd');
let c = claimGoals(s);
assert.deepEqual(c.got.map((q) => q.id), ['desert.d3']); assert.equal(s.cash, 1000);
assert.equal(claimGoals(s).got.length, 0, 'paid once'); assert.equal(s.cash, 1000);
assert.equal(regionGoals(s, 'mountain')[0].have, 0);

// race results: a win on Hard counts for "win on Hard" and "win 3"; a kid mode win counts for "win 3" only
s.rank.loopbh = 1; s.rank.canyonk = 1; s.rank.flats = 2;
const dg = Object.fromEntries(regionGoals(s, 'desert').map((q) => [q.id.split('.')[1], q]));
assert.equal(dg.hard.have, 1); assert.equal(dg.win3.have, 2); assert.equal(dg.all.have, 3); assert.equal(dg.gold.have, 0);
s.rank.flatse = 1; assert.equal(regionGoals(s, 'desert').find((q) => q.id === 'desert.gold').have, 1, 'gold on any level');

// every desert goal done: the copper paint unlocks, other prizes stay locked
assert.equal(paintLocked(s, REGION_PAINT.desert), true); assert.equal(paintLocked(s, 0), false);
for (const k of ['h', 'e', 'r', 'c', 'n', 'b']) bump(s, 'desert', k); for (let i = 0; i < 7; i++) bump(s, 'desert', 'd');
for (const e of eventsFor('desert')) s.rank[e.id] = 1;
c = claimGoals(s);
assert.deepEqual(c.finished, [], 'the hidden finds are still to do');
// the finds: twelve crates (each bit once), the barn car, and two seconds of air
for (let i = 0; i < 11; i++) assert.equal(mark(s, 'desert', 'k', i), true);
assert.equal(mark(s, 'desert', 'k', 3), false, 'a crate counts once');
assert.equal(regionGoals(s, 'desert').find((q) => q.id === 'desert.crates').have, 11);
mark(s, 'desert', 'k', 11); s.cars.mesa = { up: [0, 0, 0, 0], tune: stockTune('mesa'), paint: 3 };
assert.equal(best(s, 'desert', 'a', 14), true); assert.equal(best(s, 'desert', 'a', 9), false); assert.equal(regionGoals(s, 'desert').find((q) => q.id === 'desert.air').have, 0);
best(s, 'desert', 'a', 21);
c = claimGoals(s);
assert.deepEqual(c.got.map((q) => q.id), ['desert.crates', 'desert.barn', 'desert.air']);
assert.deepEqual(c.finished, [], 'the cup is still to win');
s.cups.desert = 1; c = claimGoals(s);
assert.deepEqual(c.got.map((q) => q.id), ['desert.cup']);
assert.deepEqual(c.finished, ['desert']); assert.equal(regionComplete(s, 'desert'), true);
assert.equal(paintLocked(s, REGION_PAINT.desert), false); assert.equal(paintLocked(s, REGION_PAINT.coast), true);
assert.equal(PAINTS[REGION_PAINT.desert].prize, 'desert');
const desertPay = regionGoals(s, 'desert').reduce((a, q) => a + q.pay, 0);
assert.equal(s.cash, desertPay, 'every desert reward paid exactly once');

// garage goals
const gg = (x) => garageGoals(x).map((q) => q.have);
assert.deepEqual(gg(s), [2, 1, 1, 0, 0, 1], 'the hidden car counts as owned, not as bought');
bump(s, 'mountain', 'v'); bump(s, 'desert', 'v'); bump(s, 'coast', 'v'); s.cars.hatch.up = [3, 3, 3, 3];
assert.deepEqual(gg(s), [2, 1, 1, 1, 3, 1]);

// a save keeps stats and goals through cleaning, and drops junk
const back = cleanSave(JSON.parse(JSON.stringify({ ...s, stats: { ...s.stats, mars: { d: 5 }, coast: { d: -4, h: 'x', v: 1 } }, done: [...s.done, 'bad id!', 42, 'desert.d3'] })));
assert.deepEqual(back.done, s.done); assert.equal(back.stats.mars, undefined); assert.deepEqual(back.stats.coast, { v: 1 }); assert.equal(back.stats.desert.d, 10); assert.equal(back.stats.desert.k, 4095); assert.equal(back.stats.desert.a, 21); assert.ok(back.cars.mesa, 'a found car is kept');
console.log('goals per region', regionGoals(s, 'mountain').length, 'rewards per region', desertPay, 'garage', garageGoals(s).reduce((a, q) => a + q.pay, 0));
console.log('goals: all checks passed');
