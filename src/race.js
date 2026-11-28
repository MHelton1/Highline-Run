// Races: circuits and sprints against rival cars, and an off-road time trial, each at three levels of difficulty.
// No rendering (runs in node for tests).
import { Vehicle, collideCars } from './vehicle.js';
import { buildSpec, carRating, classOf, CLASSES } from './cars.js';
import { makePath, Driver, Tracker } from './ai.js';
import { REGIONS } from './regions.js';

const HOLD = { steer: 0, throttle: 0, brake: 0, handbrake: true, analog: true };   // no foot brake: holding it at a standstill selects reverse
const COOL = { steer: 0, throttle: 0, brake: 0.45, handbrake: false, analog: true };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// Difficulty. Moderate is the pace every event was first tuned at; the other two scale the rivals (how hard they corner
// and brake, their top speed, how far they ease off or push), the time trial's medal times, and the prize money.
// `key` is added to an event's id to name its results in the save, so Moderate keeps the names older saves used.
export const LEVELS = [
  { name: 'Easy', key: 'e', skill: 0.93, vcap: 0.9, pace: [0.86, 1], time: 1.15, prize: 0.7 },
  { name: 'Moderate', key: '', skill: 1, vcap: 1, pace: [0.89, 1.03], time: 1, prize: 1 },
  { name: 'Hard', key: 'h', skill: 1.08, vcap: 1.1, pace: [0.93, 1.06], time: 0.88, prize: 1.4 },
  // kid mode (not offered on the card): rivals slow enough to race a car that drives itself at kid mode speeds
  { name: 'Kid mode', key: 'k', skill: 0.85, vcap: 0.66, cap: 20.5, pace: [0.8, 1], time: 1.5, prize: 0.6 },
];
export const KID_LEVEL = 3;
export const rankKey = (id, level = 1) => id + LEVELS[level].key;
export const prizes = (def, level = 1) => def.prize.map((p) => Math.round(p * LEVELS[level].prize / 50) * 50);
export const medals = (def, level = 1) => def.medals.map((t) => (def.school ? Math.round(t * LEVELS[level].time * 10) / 10 : Math.round(t * LEVELS[level].time)));   // driving tests: tenths

// Where races start. Several events can share one start light.
export const SPOTS = { ring: 'Ring Road races', west: 'Summit Dash', east: 'Summit Return', trial: 'Backcountry Scramble' };
// The same six events in another region: their own ids (results are kept apart), names and words, and rival pace where
// that region's roads need it. `base` is always the mountain id, so code can find an event by what it is.
const REGION_EVENTS = {
  coast: {
    spots: { ring: 'Coast Road races', west: 'Ridge Run', east: 'Ridge Return', trial: 'Clifftop Scramble' },
    ring: { id: 'coast', name: 'Coast Road Grand Prix', blurb: 'One flat-out lap of the coast road against three rivals, with the sea on one side most of the way.' },
    clock: { id: 'coastb', name: 'Coast Road Reverse', short: 'Reverse', blurb: 'The coast road the other way round. Every corner you know now turns the wrong way.' },
    double: { id: 'coastx', name: 'Coast Road Double' },
    dash: { id: 'ridge', name: 'Ridge Run', short: 'Ridge Run', blurb: 'Point to point over the green ridge on the dirt trail. Three rivals, no second lap to make up for mistakes.' },
    descent: { id: 'ridgeb', name: 'Ridge Return', short: 'Ridge Return', blurb: 'The ridge trail back from the far side, every corner the other way.' },
    scramble: { id: 'cliffs', name: 'Clifftop Scramble', short: 'Scramble', medals: [140, 185, 240], blurb: 'No road and no rivals. Cross the headland through every checkpoint in order and beat the clock. Stay out of the sea.' },
  },
  // the speedway (build 38): the ring events run on the oval, several laps at a time, against faster rivals
  speedway: {
    spots: { ring: 'Oval races', west: 'Ranch Road Run', east: 'Ranch Road Return', trial: 'Prairie Scramble', inter: 'Interstate Run', drag: 'Truck Stop Drags' },
    ring: { id: 'oval', oval: true, name: 'Ironhorse Grand Prix', short: 'Grand Prix', laps: 4, tag: 'Oval · tarmac · 4 laps', blurb: 'Four laps of the banked oval against three rivals. Flat out down the straights; lift a little for the 24 degree turns if the car will not hold them.',
      rivals: [{ num: 23, car: 'coupe', skill: 0.66, vcap: 52, paint: 5 }, { num: 8, car: 'coupe', skill: 0.6, vcap: 50, paint: 1 }, { num: 41, car: 'hatch', skill: 0.66, vcap: 49, paint: 2 }], prize: [2500, 1300, 650, 150] },
    clock: { id: 'ovalb', oval: true, name: 'Ironhorse Reverse', short: 'Reverse', laps: 4, tag: 'Oval · tarmac · 4 laps', blurb: 'The oval the wrong way round: right turns all the way, still on the banking. Four laps.',
      rivals: [{ num: 77, car: 'coupe', skill: 0.64, vcap: 51, paint: 0 }, { num: 12, car: 'coupe', skill: 0.6, vcap: 50, paint: 6 }, { num: 9, car: 'hatch', skill: 0.66, vcap: 48, paint: 3 }], prize: [2500, 1300, 650, 150] },
    double: { id: 'ovalx', oval: true, name: 'Ironhorse 200', short: 'Ironhorse 200', laps: 8, tag: 'Oval · tarmac · 8 laps', blurb: 'Eight laps, about twelve miles, against tuned cars. Bring something fast.',
      rivals: [{ num: 3, car: 'coupe', up: [2, 2, 1, 1], skill: 0.68, vcap: 60, paint: 4 }, { num: 28, car: 'apex', skill: 0.6, vcap: 58, paint: 1 }, { num: 55, car: 'coupe', up: [1, 1, 1, 0], skill: 0.64, vcap: 56, paint: 2 }], prize: [5000, 2600, 1300, 300] },
    dash: { id: 'ranch', name: 'Ranch Road Run', short: 'Ranch Run', blurb: 'Point to point on the dirt ranch road from Trackside round the west side of the prairie. Three rivals.' },
    descent: { id: 'ranchb', name: 'Ranch Road Return', short: 'Ranch Return', blurb: 'The ranch road back to Trackside, every corner the other way.' },
    scramble: { id: 'prairie', name: 'Prairie Scramble', short: 'Scramble', medals: [128, 168, 220], blurb: 'No road and no rivals. Cross the open prairie through every checkpoint in order and beat the clock.' },
  },
  desert: {
    spots: { ring: 'Basin Loop races', west: 'Canyon Run', east: 'Canyon Return', trial: 'Dune Scramble' },
    ring: { id: 'loop', name: 'Basin Loop Grand Prix', blurb: 'One flat-out lap of the basin loop against three rivals.' },
    clock: { id: 'loopb', name: 'Basin Loop Reverse', short: 'Reverse', blurb: 'The basin loop the other way round. Every corner you know now turns the wrong way.' },
    double: { id: 'loopx', name: 'Basin Loop Double' },
    dash: { id: 'canyon', name: 'Canyon Run', short: 'Canyon Run', blurb: 'Point to point on the dirt trail through the canyon between the mesas. Three rivals, no second lap to make up for mistakes.' },
    descent: { id: 'canyonb', name: 'Canyon Return', short: 'Canyon Return', blurb: 'The canyon trail back from the far side. Same walls, every corner the other way.' },
    scramble: { id: 'flats', name: 'Dune Scramble', short: 'Scramble', medals: [135, 180, 235], blurb: 'No road and no rivals. Cross the open desert through every checkpoint in order, pick your own line over the dunes, and beat the clock.' },
  },
};
// the six events of a region by id, name and kind, without building the world (for the goals list)
const BASE_EVENTS = [['ring', 'Ring Road Grand Prix', 'circuit'], ['clock', 'Ring Road Clockwise', 'circuit'], ['double', 'Ring Road Double', 'circuit'],
  ['dash', 'Summit Dash', 'sprint'], ['descent', 'Summit Return', 'sprint'], ['scramble', 'Backcountry Scramble', 'trial']];
// bigger maps (build 33): a seventh event, one long lap of each region's outer loop road, with its own start arch
const OUTER_IDS = { mountain: 'timber', desert: 'frontier', coast: 'island' };
const outerOf = (region) => REGIONS[region] && REGIONS[region].outer;
export const eventsFor = (region) => [...BASE_EVENTS.map(([id, name, kind]) => { const o = (REGION_EVENTS[region] || {})[id] || {}; return { base: id, id: o.id || id, name: o.name || name, kind }; }),
  ...(outerOf(region) ? [{ base: 'outer', id: OUTER_IDS[region] || 'outer', name: outerOf(region).name + ' Grand Prix', kind: 'circuit' }] : [])];
export const spotsFor = (region) => { const o = outerOf(region), base = (REGION_EVENTS[region] && REGION_EVENTS[region].spots) || SPOTS; return o ? { ...base, outer: o.name + ' races' } : base; };

export function buildRaces(world) {
  const list = mountainRaces(world).map((d) => ({ ...d, base: d.id })), over = REGION_EVENTS[world.region];
  const all = !over ? list : list.map((d) => {
    const o = over[d.id] || {}, rivals = o.rivals ? d.rivals.map((r, k) => ({ ...r, ...o.rivals[k] })) : d.rivals;
    return { ...d, ...o, rivals, short: o.short || d.short, base: d.id, dist: o.laps ? d.path.len * o.laps : d.dist };
  });
  const extra = [outerRace(world), interRace(world), ...dragRaces(world)].filter(Boolean), out = [...all, ...extra];
  for (const d of out) d.cls = classLimit(d);
  return out;
}

// road races with rivals are capped at the class of the quickest rival car (build 39); dirt races and time trials take any car
export function classLimit(d) {
  if (!d.rivals || !d.rivals.length || !/tarmac/.test(d.tag || '')) return null;
  return Math.max(...d.rivals.map((r) => classOf(carRating(r.car, r.up || [0, 0, 0, 0]))));
}
// can this car (rating pr) enter? null limit: any car
export const fitsClass = (d, pr) => d.cls == null || classOf(pr) <= d.cls;
export const limitText = (cls) => (cls == null ? 'Any car' : `Class ${CLASSES[cls][0]} or lower (rating up to ${CLASSES[cls][1]})`);

// the speedway's 'easier rivals' switch (build 39, on by default): the oval races' rivals run slower and a little more
// carefully, so an ordinary car driven well can win. Off, they run at the pace the events were first set at.
export const OVAL_EASE = { vcap: 0.88, skill: 0.95 };
export const easeOval = (def) => (def.oval ? { ...def, rivals: def.rivals.map((r) => ({ ...r, vcap: r.vcap * OVAL_EASE.vcap, skill: r.skill * OVAL_EASE.skill })) } : def);

// drag races at the interstate's truck stop (build 39, part of the interstate extras): side by side from a standstill,
// flat out to a line a quarter or half a mile up the eastbound lanes. The rivals run uncapped; only their cars differ.
const DRAG_LANES = [-9, -2.2, 2.2, -5.6];      // three rivals, then the player (metres left of the centre line)
function dragRaces(world) {
  const L = world.places.lines.drag; if (!L) return [];
  const road = world.roads[L.road], path = makePath(road), i0 = path.of(L.idx), R = (num, car, paint, up) => ({ num, car, up, skill: 0.9, vcap: 99, paint });
  const make = (id, name, short, m, blurb, rivals, prize) => {
    const i1 = i0 + Math.round(m / path.ds), f = path.at(i1);
    return { id, base: id, spot: 'drag', name, short, kind: 'sprint', drag: DRAG_LANES, extra: true, tag: `Drag race · tarmac · ${short.toLowerCase()}`, blurb,
      x: L.x, z: L.z, y: L.y, path, startIdx: i0, gates: [{ x: f.x, z: f.z, y: f.y, idx: f.i, r: 16, prog: m }], dist: m, rivals, prize };
  };
  return [
    make('drag', 'Quarter Mile', 'Quarter mile', 402, 'Four abreast from a standstill to the line a quarter of a mile up the road. Launch clean, change up on time, and do not touch the brakes.',
      [R(16, 'sprint', 6), R(42, 'hatch', 2), R(7, 'trophy', 4)], [1200, 600, 300, 100]),
    make('dragx', 'Half Mile Shootout', 'Half mile', 805, 'Half a mile flat out against three serious cars. Top speed counts as much as the launch here.',
      [R(99, 'apex', 1), R(31, 'coupe', 5, [3, 3, 3, 3]), R(64, 'coupe', 0, [2, 2, 1, 1])], [3000, 1500, 750, 200]),
  ];
}

// the speedway's interstate: a 20 mile time trial from the on-ramp to Sundown Flats, a checkpoint every two miles.
// The medals want a very fast car (gold: about 250 mph on average).
function interRace(world) {
  const road = world.roads.find((r) => r.interstate); if (!road) return null;
  const path = makePath(road), start = path.at(45), n = 10;
  const gates = Array.from({ length: n }, (_, k) => { const f = path.at(45 + Math.round((path.n - 60 - 45) * (k + 1) / n)); return { x: f.x, z: f.z, y: f.y, r: 16 }; });
  return { id: 'inter', base: 'inter', spot: 'inter', name: world.regionDef.interstate + ' Run', short: 'Interstate Run', kind: 'trial', tag: 'Time trial · tarmac · 20 miles',
    blurb: `Twenty miles of dead straight interstate to ${world.regionDef.farTown}. Pin it. Gold needs about 250 mph all the way, so bring the fastest car you have.`,
    x: start.x, z: start.z, y: start.y, start: { x: start.x, z: start.z, yaw: start.yaw }, gates, dist: (path.n - 60 - 45) * path.ds, rivals: [], medals: [290, 400, 520], prize: [6000, 3000, 1500] };
}

// one lap of the outer loop: long (about seven miles), mostly tarmac, out past the third town and the far pickups
function outerRace(world) {
  const L = world.places.lines.outer, o = outerOf(world.region); if (!L || !o) return null;
  const road = world.roads[L.road], path = makePath(road), start = path.of(L.idx);
  const gates = Array.from({ length: 16 }, (_, k) => { const f = path.at(start + Math.round(path.n * (k + 1) / 16)); return { x: f.x, z: f.z, y: f.y, idx: f.i, r: 15, prog: Math.round(path.n * (k + 1) / 16) * path.ds }; });
  const isles = world.region === 'coast';
  return { id: OUTER_IDS[world.region] || 'outer', base: 'outer', spot: 'outer', name: o.name + ' Grand Prix', short: o.name, kind: 'circuit', tag: 'Circuit · tarmac · long',
    blurb: isles ? `One long lap of the ${o.name}, island to island over the bridges, against three rivals. Over seven miles, so a tidy lap beats a wild one.`
      : `One long lap of the ${o.name}, out past the far pickups and ${world.towns[2] ? world.towns[2].name : 'the third town'}, against three rivals. Over seven miles, so a tidy lap beats a wild one.`,
    x: L.x, z: L.z, y: L.y, path, startIdx: start, laps: 1, gates, dist: path.len,
    rivals: [{ num: 19, car: 'coupe', skill: 0.6, vcap: 39, paint: 3 }, { num: 4, car: 'hatch', skill: 0.64, vcap: 37.5, paint: 6 }, { num: 66, car: 'truck', skill: 0.62, vcap: 36, paint: 1 }],
    prize: [3000, 1500, 750, 200] };
}

function mountainRaces(world) {
  const L = world.places.lines, T = world.places.trial, R0 = world.roads[0], R1 = world.roads[1];
  const ring = makePath(R0), ringBack = makePath(R0, true), trail = makePath(R1), trailBack = makePath(R1, true);
  const gate = (path, idx, start, r) => { const f = path.at(idx); return { x: f.x, z: f.z, y: f.y, idx: f.i, r, prog: (idx - start) * path.ds }; };
  const lap = (path, start, n = 12) => Array.from({ length: n }, (_, k) => gate(path, start + Math.round(path.n * (k + 1) / n), start, 15));
  const leg = (path, a, b, n = 8) => Array.from({ length: n }, (_, k) => gate(path, a + Math.round((b - a) * (k + 1) / n), a, 12));
  const at = (line) => ({ x: line.x, z: line.z, y: line.y });
  const r0 = ring.of(L.ring.idx), rb = ringBack.of(L.ring.idx), d0 = trail.of(L.dashStart.idx), d1 = trail.of(L.dashEnd.idx), b0 = trailBack.of(L.dashEnd.idx), b1 = trailBack.of(L.dashStart.idx);
  return [
    { id: 'ring', spot: 'ring', name: 'Ring Road Grand Prix', short: 'Grand Prix', kind: 'circuit', tag: 'Circuit · tarmac', blurb: 'One flat-out lap of the ring road against three rivals.',
      ...at(L.ring), path: ring, startIdx: r0, laps: 1, gates: lap(ring, r0), dist: ring.len,
      rivals: [{ num: 23, car: 'hatch', skill: 0.62, vcap: 37.5, paint: 5 }, { num: 8, car: 'coupe', skill: 0.5, vcap: 36, paint: 1 }, { num: 41, car: 'hatch', skill: 0.58, vcap: 34, paint: 2 }],
      prize: [1500, 800, 400, 100] },
    { id: 'clock', spot: 'ring', name: 'Ring Road Clockwise', short: 'Clockwise', kind: 'circuit', tag: 'Circuit · tarmac', blurb: 'The ring road the other way round. Every corner you know now turns the wrong way, and the climbs have become drops.',
      ...at(L.ring), path: ringBack, startIdx: rb, laps: 1, gates: lap(ringBack, rb), dist: ring.len,
      rivals: [{ num: 77, car: 'hatch', skill: 0.61, vcap: 37, paint: 0 }, { num: 12, car: 'coupe', skill: 0.52, vcap: 36.5, paint: 6 }, { num: 9, car: 'truck', skill: 0.64, vcap: 34.5, paint: 3 }],
      prize: [1500, 800, 400, 100] },
    { id: 'double', spot: 'ring', name: 'Ring Road Double', short: 'Double', kind: 'circuit', tag: 'Circuit · tarmac · 2 laps', blurb: 'Two laps against tuned cars. A standard car will struggle to stay with them, so bring upgrades or something faster.',
      ...at(L.ring), path: ring, startIdx: r0, laps: 2, gates: lap(ring, r0), dist: ring.len * 2,
      rivals: [{ num: 3, car: 'coupe', up: [1, 1, 1, 0], skill: 0.6, vcap: 42, paint: 4 }, { num: 28, car: 'hatch', up: [2, 2, 1, 1], skill: 0.66, vcap: 41, paint: 1 }, { num: 55, car: 'coupe', skill: 0.56, vcap: 40, paint: 2 }],
      prize: [3500, 1800, 900, 250] },
    { id: 'dash', spot: 'west', name: 'Summit Dash', short: 'Summit Dash', kind: 'sprint', tag: 'Sprint · dirt', blurb: 'Point to point over the mountain on the dirt trail. Three rivals, no second lap to make up for mistakes.',
      ...at(L.dashStart), path: trail, startIdx: d0, gates: leg(trail, d0, d1), dist: (d1 - d0) * trail.ds,
      rivals: [{ num: 5, car: 'buggy', skill: 0.4, vcap: 23, paint: 3 }, { num: 17, car: 'hatch', skill: 0.4, vcap: 22, paint: 6 }, { num: 60, car: 'truck', skill: 0.5, vcap: 22, paint: 4 }],
      prize: [1200, 650, 300, 100] },
    { id: 'descent', spot: 'east', name: 'Summit Return', short: 'Summit Return', kind: 'sprint', tag: 'Sprint · dirt', blurb: 'The dirt trail back over the mountain from the far side. The long drop at the end rewards late braking and punishes it too.',
      ...at(L.dashEnd), path: trailBack, startIdx: b0, gates: leg(trailBack, b0, b1), dist: (b1 - b0) * trail.ds,
      rivals: [{ num: 14, car: 'buggy', skill: 0.42, vcap: 23, paint: 5 }, { num: 36, car: 'truck', skill: 0.5, vcap: 22.5, paint: 0 }, { num: 71, car: 'hatch', skill: 0.4, vcap: 22, paint: 2 }],
      prize: [1200, 650, 300, 100] },
    { id: 'scramble', spot: 'trial', name: 'Backcountry Scramble', short: 'Scramble', kind: 'trial', tag: 'Time trial · off-road', blurb: 'No road and no rivals. Hit every checkpoint in order, pick your own line between them, and beat the clock.',
      x: T.x, z: T.z, y: T.y, start: { x: T.x, z: T.z, yaw: T.yaw }, gates: T.gates.map((g) => ({ x: g.x, z: g.z, y: g.y, r: 14 })),
      dist: T.gates.reduce((a, g, i) => a + Math.hypot(g.x - (i ? T.gates[i - 1].x : T.x), g.z - (i ? T.gates[i - 1].z : T.z)), 0),
      rivals: [], medals: [121, 160, 210], prize: [2000, 1000, 500] },
  ];
}

export const MEDALS = ['Gold', 'Silver', 'Bronze'];
export const PLACES = ['1st', '2nd', '3rd', '4th'];

export class Race {
  constructor(world, def, player, level = 1) {
    this.world = world; this.def = def; this.player = player; this.events = []; this.level = level;
    const lv = this.lv = LEVELS[level];
    this.state = 'count'; this.count = 3.4; this.shown = 4; this.t = 0; this.clock = 0; this.gate = 0; this.lap = 0; this.pos = 1; this.result = null; this.bump = 0;
    this.gates = def.gates; this.rivals = []; this.track = null;
    const p = def.path;
    if (p) {
      // grid: rivals in front, the player at the back
      const slot = (k) => { if (def.drag) { const f = p.at(def.startIdx - Math.round(6 / p.ds)), lat = def.drag[k]; return { back: 6, f, lat, x: f.x + f.tz * lat, z: f.z - f.tx * lat }; }
        const back = 7 + 8 * k, f = p.at(def.startIdx - Math.round(back / p.ds)), lat = (k % 2 ? -1 : 1) * Math.min(2.3, p.hw - 1.7); return { back, f, lat, x: f.x + f.tz * lat, z: f.z - f.tx * lat }; };
      this.rivals = def.rivals.map((r, k) => {
        const spec = buildSpec(r.car, r.up), car = new Vehicle(world, spec), s = slot(k);
        car.place(s.x, s.z, s.f.yaw);
        return { ...r, spec, car, time: null, driver: new Driver(car, p, { skill: r.skill * lv.skill, vcap: Math.min(r.vcap * lv.vcap, lv.cap || 99), lane: s.lat, idx: s.f.i, prog: -s.back }) };
      });
      const s = slot(this.rivals.length);
      player.place(s.x, s.z, s.f.yaw);
      this.track = new Tracker(p, s.f.i, -s.back);
      this.total = def.kind === 'circuit' ? p.len * def.laps : def.dist; this.pos = this.rivals.length + 1;
      this.all = [player, ...this.rivals.map((r) => r.car)];
    } else player.place(def.start.x, def.start.z, def.start.yaw);
  }
  emit(type, data) { this.events.push({ type, ...data }); }
  get next() { return this.state === 'done' ? null : this.gates[this.gate]; }
  get after() { const last = this.gate + 1 >= this.gates.length; return this.state === 'done' || (last && this.lap + 1 >= (this.def.laps || 1)) ? null : this.gates[last ? 0 : this.gate + 1]; }
  // what the player's car is given: held on the grid, the player's own input while racing, then braked to a stop after the flag
  // (the foot brake only while still rolling forward: held at a standstill it would select reverse)
  input(inp) { return this.state === 'count' ? HOLD : this.state === 'done' ? (this.player.vel.dot(this.player.fwd) > 3 ? COOL : HOLD) : inp; }

  step(dt) {   // physics rate
    const hold = this.state === 'count', R = this.rivals;
    for (const r of R) r.car.step(dt, hold ? HOLD : r.driver.input);
    for (let i = 0; i < R.length; i++) {
      const h = collideCars(this.player, R[i].car); if (h > this.bump) this.bump = h;
      for (let k = i + 1; k < R.length; k++) collideCars(R[i].car, R[k].car);
    }
    if (!hold) this.clock += dt;
    if (this.state !== 'run') return;
    this.t = this.clock;
    const g = this.gates[this.gate], p = this.player.pos;
    if ((p.x - g.x) ** 2 + (p.z - g.z) ** 2 < g.r * g.r && (!g.stop || this.player.speed < 0.6)) {   // a stop gate counts once the car is still in it
      if (this.track && g.idx != null) this.track.sync(g.idx, g.prog + this.lap * this.def.path.len);
      this.gate++;
      const lapDone = this.gate >= this.gates.length;
      if (lapDone) { this.lap++; this.gate = 0; }
      if (lapDone && this.lap >= (this.def.laps || 1)) this.finish();
      else this.emit('gate', { n: lapDone ? this.gates.length : this.gate, of: this.gates.length });
    }
  }

  update(dt) {   // once per frame
    if (this.state === 'count') {
      this.count -= dt; const c = Math.ceil(this.count);
      if (c !== this.shown && c >= 1 && c <= 3) { this.shown = c; this.emit('count', { n: c }); }
      if (this.count <= 0) { this.state = 'run'; this.emit('go', {}); }
      return;
    }
    const racing = true;
    if (this.track) {
      if (this.state === 'run') this.track.update(this.player.pos);
      let ahead = 0;
      for (const r of this.rivals) {
        const d = r.driver, gap = d.prog - this.track.prog;
        d.pace = clamp(1 - gap / 1800, this.lv.pace[0], this.lv.pace[1]);   // ease off when far ahead of the player, push when behind
        d.think(dt, this.all, racing);
        if (r.time == null && d.prog >= this.total) { r.time = this.clock; d.done = true; }
        if (r.time != null || gap > 0) ahead++;
      }
      if (this.state === 'run') this.pos = ahead + 1;
    }
  }

  finish() {
    const def = this.def, time = this.t; this.state = 'done';
    if (def.kind === 'trial') {
      const medal = medals(def, this.level).findIndex((m) => time <= m);
      this.result = { time, medal, prize: medal >= 0 ? prizes(def, this.level)[medal] : 0 };
    } else {
      const table = this.table(), pos = table.findIndex((r) => r.you) + 1;
      this.pos = pos;
      this.result = { time, pos, prize: prizes(def, this.level)[pos - 1] || 0, table };
    }
    this.emit('finish', this.result);
  }

  // the order so far: finishers by time (the player ahead on a dead heat), then everyone else by distance covered
  table() {
    const rows = [{ you: true, time: this.state === 'done' ? this.t : null, prog: this.track ? this.track.prog : 0 }, ...this.rivals.map((r) => ({ num: r.num, name: r.spec.name, time: r.time, prog: r.driver.prog }))];
    return rows.sort((a, b) => (a.time == null) - (b.time == null) || (a.time != null ? a.time - b.time : b.prog - a.prog));
  }

  // back onto the course: the spot where the player left the road, or the last checkpoint in a time trial
  resetPlayer() {
    const pl = this.player;
    if (this.track) { const f = this.def.path.at(this.track.idx); pl.place(f.x, f.z, f.yaw); return; }
    const from = this.gate ? this.gates[this.gate - 1] : this.def.start, to = this.gates[this.gate];
    pl.place(from.x, from.z, Math.atan2(to.x - from.x, to.z - from.z));
  }
}
