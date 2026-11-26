// Goals: a list of things to do in each region (deliveries, escapes, races) and a few for the garage, each paying a
// cash reward once. Finishing every goal in a region unlocks that region's own paint. Progress comes from the save:
// counters kept per region in `stats`, race results in `rank`, and the cars owned. Pure data and math (runs in node).
import { REGIONS, REGION_IDS } from './regions.js';
import { CARS, CAR_IDS, FIND_IDS } from './cars.js';
import { CRATES, BARN_CAR, AIR_GOAL, popcount } from './finds.js';
import { CUP_NAME } from './cup.js';
import { eventsFor, LEVELS } from './race.js';
import { DRIFT_GOAL, TRAP_GOAL_MPH, TRAPS } from './stunts.js';

// counters kept per region: deliveries, hot deliveries, escapes with a hot load, rival beaten, fragile delivered
// without a scratch, deliveries at night, whether the region has been visited, which hidden crates have been found
// (one bit each) and the longest air time (tenths of a second)
export const STAT_KEYS = ['d', 'h', 'e', 'r', 'c', 'n', 'v', 'k', 'a', 'b', 'f', 's0', 's1', 's2'];   // b: roadblocks got past, f: best drift, s0-s2: best speed at each trap (mph)

// the paint each region's goals unlock (index into PAINTS, see cars.js)
export const REGION_PAINT = { mountain: 7, desert: 8, coast: 9 };

const levelKeys = LEVELS.map((L) => L.key);
// best result in an event at any level: 1 is a win (or gold in a time trial)
const bestRank = (s, id, keys = levelKeys) => { let b = 0; for (const k of keys) { const r = s.rank[id + k]; if (r && (!b || r < b)) b = r; } return b; };

// every goal for a region, with how far along the save is: { id, group, name, need, have, pay }
export function regionGoals(s, region) {
  const st = (s.stats && s.stats[region]) || {}, n = (k) => st[k] || 0, ev = eventsFor(region);
  const trial = ev.find((e) => e.kind === 'trial'), road = ev.filter((e) => e.kind !== 'trial'), loop = ev.find((e) => e.base === 'outer'), six = ev.filter((e) => e.base !== 'outer');
  const towns = (REGIONS[region] && REGIONS[region].towns) || [];
  const wins = ev.filter((e) => bestRank(s, e.id) === 1).length;
  const hard = road.some((e) => s.rank[e.id + LEVELS[2].key] === 1) ? 1 : 0;
  const g = (id, name, need, have, pay) => ({ id: region + '.' + id, group: region, name, need, have: Math.min(need, have), pay });
  return [
    g('d3', 'Deliver 3 loads', 3, n('d'), 1000),
    g('d10', 'Deliver 10 loads', 10, n('d'), 3000),
    g('hot', 'Deliver a Hot load', 1, n('h'), 1500),
    g('esc', 'Shake off the patrols with a Hot load on board', 1, n('e'), 1500),
    g('block', 'Get past a roadblock with cargo on board', 1, n('b'), 2000),
    g('rival', 'Beat the rival smuggler to the buyer', 1, n('r'), 1500),
    g('fragile', 'Deliver a Fragile load without a scratch', 1, n('c'), 1500),
    g('night', 'Make a delivery at night', 1, n('n'), 1500),
    g('win3', 'Win 3 different races', 3, wins, 3000),
    g('gold', `Gold medal in the ${trial.name}`, 1, bestRank(s, trial.id) === 1 ? 1 : 0, 2000),
    g('all', 'Finish all six races', 6, six.filter((e) => bestRank(s, e.id) > 0).length, 2500),
    g('hard', 'Win a race on Hard', 1, hard, 4000),
    g('crates', `Find all ${CRATES} hidden crates`, CRATES, popcount(n('k')), 3000),
    g('barn', 'Find the hidden car', 1, s.cars[BARN_CAR[region]] ? 1 : 0, 2500),
    g('air', `Stay in the air for ${AIR_GOAL} seconds`, 1, n('a') >= AIR_GOAL * 10 ? 1 : 0, 1500),
    g('drift', `Score ${DRIFT_GOAL.toLocaleString('en-US')} in one drift`, 1, n('f') >= DRIFT_GOAL ? 1 : 0, 1500),
    g('traps', `Pass all ${TRAPS} speed traps at ${TRAP_GOAL_MPH} mph or more`, TRAPS, [0, 1, 2].filter((i) => n('s' + i) >= TRAP_GOAL_MPH).length, 2000),
    g('cup', `Win the ${CUP_NAME[region] || 'cup'}`, 1, s.cups && s.cups[region] === 1 ? 1 : 0, 5000),
    ...(loop ? [{ ...g('loop', `Win the ${loop.name}`, 1, bestRank(s, loop.id) === 1 ? 1 : 0, 3000), extra: true }] : []),
    ...(towns.length ? [{ ...g('towns', `Drive through all ${towns.length} towns`, towns.length, popcount(n('t')), 1000), extra: true }] : []),
  ];
}

export function garageGoals(s) {
  const owned = Object.keys(s.cars).length, bought = CAR_IDS.filter((id) => s.cars[id]).length, found = BASE_FINDS.filter((id) => s.cars[id]).length, maxed = Object.values(s.cars).some((c) => c.up.every((v) => v >= 3)) ? 1 : 0;
  const seen = REGION_IDS.filter((r) => s.stats && s.stats[r] && s.stats[r].v).length;
  const g = (id, name, need, have, pay) => ({ id: 'garage.' + id, group: 'garage', name, need, have: Math.min(need, have), pay });
  return [
    g('cars4', 'Own 4 cars', 4, owned, 5000),
    g('cars8', `Own all ${CAR_IDS.length} cars from the showroom`, CAR_IDS.length, bought, 15000),
    g('finds', `Find all ${BASE_FINDS.length} hidden cars`, BASE_FINDS.length, found, 10000),
    g('maxed', 'Fully upgrade a car (every part to level 3)', 1, maxed, 5000),
    g('travel', `Drive in all ${REGION_IDS.length} regions`, REGION_IDS.length, seen, 2000),
    g('cups', `Win the cup in all ${REGION_IDS.length} regions`, REGION_IDS.length, REGION_IDS.filter((r) => s.cups && s.cups[r] === 1).length, 10000),
  ];
}

// the hidden cars of the three main regions (the speedway's is a bonus, not needed for the garage goal)
const BASE_FINDS = FIND_IDS.filter((id) => REGION_IDS.includes(CARS[id].find));
// the speedway and the hypercar open once every goal of the three main regions is done (or the test switch is on)
export const bonusOpen = (s) => !!s.bonus || REGION_IDS.every((r) => regionComplete(s, r));
export const allGoals = (s) => [...REGION_IDS.flatMap((r) => regionGoals(s, r)), ...garageGoals(s)];
export const isDone = (s, id) => !!(s.done && s.done.includes(id));
// (the goals added with the bigger maps are `extra`: a region's paint prize, once won, stays won)
export const regionComplete = (s, region) => regionGoals(s, region).every((q) => q.extra || isDone(s, q.id));
// a paint is free to use unless it is a region's prize that has not been won yet
export const paintLocked = (s, i) => { const r = Object.keys(REGION_PAINT).find((k) => REGION_PAINT[k] === i); return !!r && !regionComplete(s, r); };

// goals reached but not yet paid: marks them done, adds the rewards, and returns them (plus any region just finished)
export function claimGoals(s) {
  const got = [], fin = [];
  for (const q of allGoals(s)) if (q.have >= q.need && !isDone(s, q.id)) { s.done.push(q.id); s.cash += q.pay; got.push(q); }
  for (const r of REGION_IDS) if (got.some((q) => q.group === r && !q.extra) && regionComplete(s, r)) fin.push(r);
  return { got, finished: fin };
}

// keep the biggest value seen (longest air time)
export function best(s, region, key, v) {
  if (!s.stats[region]) s.stats[region] = {};
  if (v > (s.stats[region][key] || 0)) { s.stats[region][key] = Math.min(1e6, v); return true; }
  return false;
}
// mark one bit of a counter (a hidden crate); false if it was already set
export function mark(s, region, key, bit) {
  if (!s.stats[region]) s.stats[region] = {};
  const v = s.stats[region][key] || 0; if (v & (1 << bit)) return false;
  s.stats[region][key] = v | (1 << bit); return true;
}
// count something that happened in a region
export function bump(s, region, key, by = 1) {
  if (!s.stats[region]) s.stats[region] = {};
  s.stats[region][key] = Math.min(1e6, (s.stats[region][key] || 0) + by);
}
