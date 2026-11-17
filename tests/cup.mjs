// Championships: points and the cup table, the same three teams in every round, save cleaning, and a whole cup run
// with a robot in the player's seat in each region.  usage: node tests/cup.mjs [region,...]
import assert from 'node:assert/strict';
import { buildWorld } from '../src/terrain.js';
import { Vehicle } from '../src/vehicle.js';
import { buildSpec, CARS, CAR_IDS, PRIZE_IDS } from '../src/cars.js';
import { buildRaces, Race } from '../src/race.js';
import { Driver } from '../src/ai.js';
import { cupRound, cupTeams, newCup, scoreRound, cupTable, cupPlace, cupOver, cleanCup, purse, POINTS, CUP_ROUNDS, CUP_CAR } from '../src/cup.js';
import { freshSave, cleanSave } from '../src/save.js';
import { regionGoals, garageGoals, claimGoals } from '../src/goals.js';

// points: 10 6 3 1 by finishing order; the player wins ties
const c = newCup('mountain', 1, [{ num: 23 }, { num: 8 }, { num: 41 }]);
scoreRound(c, [{ num: 8 }, { you: true }, { num: 23 }, { num: 41 }]);
scoreRound(c, [{ you: true }, { num: 8 }, { num: 41 }, { num: 23 }]);
assert.deepEqual(c.pts, { you: 16, 23: 4, 8: 16, 41: 4 }); assert.equal(cupPlace(c), 1, 'tie goes to the player'); assert.equal(cupOver(c), false);
scoreRound(c, [{ num: 8 }, { num: 23 }, { you: true }, { num: 41 }]);
assert.equal(cupOver(c), true); assert.equal(cupPlace(c), 2); assert.deepEqual(cupTable(c).map((r) => r.pts), [26, 19, 10, 5]);
assert.equal(purse(1, 1), 6000); assert.equal(purse(1, 2), 8400); assert.equal(purse(4, 0), 350);
// save cleaning
assert.deepEqual(cleanCup({ r: 'desert', lv: 2, round: 1, pts: { you: 10, 5: 6, 17: 3, 60: 1 } }, ['mountain', 'desert']), { r: 'desert', lv: 2, round: 1, pts: { 5: 6, 17: 3, 60: 1, you: 10 } });
for (const bad of [null, { r: 'mars', lv: 1, round: 0, pts: {} }, { r: 'desert', lv: 1, round: 3, pts: { you: 0, 1: 0, 2: 0, 3: 0 } }, { r: 'desert', lv: 1, round: 0, pts: { you: 99, 1: 0, 2: 0, 3: 0 } }, { r: 'desert', lv: 1, round: 0, pts: { 1: 0, 2: 0, 3: 0 } }]) assert.equal(cleanCup(bad, ['desert']), null);
const back = cleanSave({ cups: { mountain: 1, desert: 2, coast: 0 }, cup: { r: 'coast', lv: 0, round: 2, pts: { you: 3, 1: 1, 2: 2, 3: 3 } } });
assert.deepEqual(back.cups, { mountain: 1, desert: 2 }); assert.equal(back.cup.round, 2);
// the champion's car is not in the showroom
assert.deepEqual(PRIZE_IDS, [CUP_CAR]); assert.ok(!CAR_IDS.includes(CUP_CAR));
// goals: one cup goal per region, and all three in the garage
const s = freshSave(); s.cups = { mountain: 1, desert: 1 };
assert.equal(regionGoals(s, 'mountain').find((q) => q.id === 'mountain.cup').have, 1); assert.equal(garageGoals(s).find((q) => q.id === 'garage.cups').have, 2);
console.log('cup math: ok');

const dt = 1 / 120;
function run(w, def, carId, up, skill) {      // one round with a robot driving the player's car
  const car = new Vehicle(w, buildSpec(carId, up)), race = new Race(w, def, car, 1);
  const bot = new Driver(car, def.path, { skill, vcap: 99, lane: race.track.off, idx: race.track.idx, prog: race.track.prog });
  while (race.state !== 'done' && race.t < 600) { race.update(1 / 60); if (race.state === 'run') bot.think(1 / 60, race.all); for (let k = 0; k < 2; k++) { car.step(dt, race.input(bot.input)); race.step(dt); } race.events.length = 0; }
  return race;
}
for (const r of process.argv[2] ? process.argv[2].split(',') : ['mountain', 'desert', 'coast']) {
  const w = buildWorld(r); w.placeTrees(w.regionDef.treeCount[1]); const races = buildRaces(w), teams = cupTeams(races);
  const rounds = CUP_ROUNDS.map((b, k) => cupRound(races, r, k));
  assert.ok(rounds.every((d) => d.rivals.map((x) => x.num).join() === teams.map((t) => t.num).join()), 'same teams every round');
  assert.ok(rounds.every((d, k) => d.cup.round === k && d.cup.region === r && d.base === CUP_ROUNDS[k]));
  const cup = newCup(r, 1, teams), log = [];
  for (const d of rounds) { const race = run(w, d, 'coupe', [2, 2, 2, 1], 0.62); assert.ok(race.result && race.result.table, 'round finished'); const got = scoreRound(cup, race.result.table); log.push(`${d.short} ${race.result.pos}${['st', 'nd', 'rd', 'th'][race.result.pos - 1]} +${got.you}`); }
  console.log(`${r}: ${log.join(', ')} → ${cupPlace(cup)} overall, table ${cupTable(cup).map((x) => (x.you ? 'you' : '#' + x.num) + ' ' + x.pts).join(', ')}`);
  assert.equal(cupOver(cup), true); assert.equal(Object.values(cup.pts).reduce((a, b) => a + b, 0), 3 * POINTS.reduce((a, b) => a + b, 0));
}
console.log('cup: all checks passed');
