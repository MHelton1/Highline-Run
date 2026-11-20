// Tips for new players: short hints shown once each, when they first matter. No rendering (runs in node for tests).
// Each tip has a test on what is going on now (c, see tipContext in main.js) and, for players who have clearly done
// the thing already, a skip test so an old save is not told the basics.
export const TIP_GAP = 25;        // seconds between two tips
export const TIP_SHOW = 9;        // seconds a tip stays up

export const TIPS = [
  { id: 'start', when: (c) => c.t > 3 && !c.job, skip: (c) => c.delivered > 0,
    text: (c) => 'Follow the arrow to an amber light and stop inside it to load cargo.' },
  { id: 'load', when: (c) => c.job, skip: (c) => c.delivered > 1,
    text: (c) => 'Take the load to the green light before the clock runs out. Knocks damage the cargo and cut the pay.' },
  { id: 'chase', when: (c) => c.heat, skip: (c) => c.delivered > 4,
    text: (c) => 'A patrol is after you. Get well away to lose it; if it stays close the red bar fills and you are busted.' },
  { id: 'garage', when: (c) => c.near === 'garage' && !c.job, skip: (c) => c.cars > 1,
    text: (c) => 'Blue light: a garage. Stop in it to buy cars and parts and to tune your car.' },
  { id: 'race', when: (c) => c.near === 'race' && !c.job, skip: (c) => c.raced,
    text: (c) => 'Violet light: a race start. Stop in it to pick a race and how hard it is.' },
  { id: 'stuck', when: (c) => c.stuck, skip: () => false,
    text: (c) => c.touch ? 'Stuck or on your roof? FLIP sets the car upright and ROAD puts you back on the road.' : 'Stuck or on your roof? F sets the car upright and R puts you back on the road.' },
  { id: 'map', when: (c) => c.t > 45 && !c.job && !c.heat, skip: () => false,
    text: (c) => (c.touch ? 'Tap the corner map' : 'Press G or click the corner map') + ' for the big map, then tap a place to drop a marker the arrow will point to.' },
  { id: 'daily', when: (c) => c.t > 70 && !c.job && !c.heat, skip: () => false,
    text: (c) => 'There is a new daily challenge every day, with a bigger reward for days in a row. See it in the menu.' },
  { id: 'nitro', when: (c) => c.cash >= 4000 && !c.nitro && !c.job, skip: () => false,
    text: (c) => 'You can afford the nitro kit: any garage, Parts tab. It fits every car.' },
  { id: 'stunts', when: (c) => c.t > 100 && !c.job && !c.heat, skip: () => false,
    text: (c) => 'Free driving pays too: hold a slide for drift points, hit the orange ramps, and fly through the speed traps (yellow dots on the map).' },
  { id: 'goals', when: (c) => c.goalsDone > 0 && !c.heat, skip: (c) => c.goalsDone > 4,
    text: (c) => 'Goals in the menu lists more to do in each region, every one with a cash reward.' },
];
export const TIP_IDS = TIPS.map((t) => t.id);

// the tip to show now, or null: one at a time, at least TIP_GAP seconds apart, each once
export function nextTip(c, seen, since) {
  if (since < TIP_GAP) return null;
  for (const t of TIPS) if (!seen.includes(t.id) && !t.skip(c) && t.when(c)) return t;
  return null;
}
// tips an old save does not need, so they never show (marked seen at load)
export const skipped = (c, seen) => TIPS.filter((t) => !seen.includes(t.id) && t.skip(c)).map((t) => t.id);
