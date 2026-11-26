// The car catalog: eight originals with their own handling, plus upgrades and tuning that reshape a car's numbers.
// Pure data and math (runs in node for tests).
import { Vehicle, RALLY_CAR, G } from './vehicle.js';

// Turn a short description (weight, size, spring frequency...) into the full set of physics numbers.
function design(d) {
  const m = d.mass, k = (2 * Math.PI * d.freq) ** 2 * m / 4, cc = 2 * Math.sqrt(k * m / 4), stat = m * G / (4 * k);
  const [w, l, h] = d.size, restLen = stat + d.bump + d.tuck, y0 = -(d.comH - d.clearance);
  return {
    name: d.name, style: d.style, look: d.look, mass: m, clearance: d.clearance,
    inertia: [m / 12 * (h * h + l * l) * 1.1, m / 12 * (w * w + l * l) * 1.12, m / 12 * (w * w + h * h) * 1.5],
    wheelX: d.track / 2, wheelZf: d.wheelbase * (1 - d.front), wheelZr: -d.wheelbase * d.front, wheelbase: d.wheelbase, radius: d.radius, tyreW: d.tyreW,
    attachY: d.radius + restLen - stat - d.comH, restLen, springK: k, dampBump: d.zb * cc, dampRebound: d.zr * cc, bumpStop: stat + d.bump, arbF: k * d.arb[0], arbR: k * d.arb[1],
    torque: d.torque, peakRpm: d.peakRpm, redline: d.redline, idle: d.idle, band: d.band, gears: d.gears, reverse: d.reverse, final: d.final,
    driveFront: d.driveFront, brakeForce: m * 11.9, brakeFront: d.brakeFront ?? 0.62,
    grip: d.grip, rearGrip: d.rearGrip, surfGrip: d.surfGrip, rrLoose: d.rrLoose, stability: d.stability, tc: d.tc, forceLift: d.forceLift, tapCut: d.tapCut, airLevel: d.airLevel,
    cdA: d.cdA, downforce: d.downforce, maxSteer: d.maxSteer, steerRate: d.steerRate,
    box: { x: w / 2, y0, y1: y0 + h, z: l / 2 },
  };
}

export const CARS = {
  hatch: {
    price: 0, value: 8000, paint: 0, drive: 'AWD',
    blurb: 'All-wheel-drive all-rounder. Happy on tarmac, dirt and everything between.',
    sound: { pitch: 1, sub: 0.5, bright: 1 },
    base: { ...RALLY_CAR, name: 'Rally Hatch', style: 'hatch', torque: 360, clearance: 0.36, tyreW: 0.26, surfGrip: [1, 1, 1, 1, 1], rrLoose: 1, band: 5600, steerRate: 7 },
  },
  buggy: {
    price: 6000, value: 6000, paint: 3, drive: 'RWD',
    blurb: 'Featherweight with long, soft suspension. Floats over rough ground and bites on loose surfaces. Runs out of breath on the highway.',
    sound: { pitch: 1.28, sub: 0.25, bright: 1.25 },
    base: design({ name: 'Dune Buggy', style: 'buggy', mass: 780, size: [1.66, 3.3, 1.2], track: 1.62, wheelbase: 2.35, front: 0.44, radius: 0.40, tyreW: 0.34,
      freq: 1.3, zb: 0.52, zr: 0.84, bump: 0.2, tuck: 0.1, arb: [0.25, 0.1], comH: 0.6, clearance: 0.4,
      torque: 190, peakRpm: 5200, redline: 7400, idle: 1000, band: 5600, gears: [3.2, 2.0, 1.4, 1.05], reverse: 3.2, final: 6.3,
      driveFront: 0, grip: 0.97, rearGrip: 1.14, surfGrip: [0.95, 1.2, 1.22, 1.12, 1.3], rrLoose: 0.6, stability: 3.0, tc: 0.85, forceLift: 0.27, tapCut: 0.62, airLevel: 8,
      cdA: 1.05, downforce: 0.2, maxSteer: 0.6, steerRate: 8 }),
  },
  truck: {
    price: 9500, value: 9500, paint: 2, drive: '4WD', cargoArmor: 0.5, payBonus: 1.15,
    blurb: 'Two tonnes of four-wheel drive. Shrugs off ruts and patrol cars, protects cargo and earns 15% more per run. Slow to turn, slower to stop.',
    sound: { pitch: 0.7, sub: 0.8, bright: 0.75 },
    base: design({ name: 'Hauler', style: 'truck', mass: 2100, size: [1.94, 5.2, 1.5], track: 1.74, wheelbase: 3.3, front: 0.54, radius: 0.42, tyreW: 0.32,
      freq: 1.45, zb: 0.56, zr: 0.9, bump: 0.16, tuck: 0.1, arb: [0.4, 0.2], comH: 0.72, clearance: 0.44,
      torque: 400, peakRpm: 3000, redline: 5200, idle: 750, band: 4400, gears: [4.7, 2.6, 1.6, 1.08], reverse: 4.2, final: 4.25,
      driveFront: 0.5, grip: 0.96, rearGrip: 1.1, surfGrip: [1, 1.1, 1.12, 1.1, 1.1], rrLoose: 0.7, stability: 3.4, tc: 1, forceLift: 0.32, tapCut: 0.66, airLevel: 6,
      cdA: 1.35, downforce: 0.3, maxSteer: 0.55, steerRate: 5 }),
  },
  coupe: {
    price: 16000, value: 16000, paint: 4, drive: 'RWD',
    blurb: 'Low, wide and rear-wheel drive. Nothing touches it on tarmac. Keep it off the grass.',
    sound: { pitch: 1.12, sub: 0.4, bright: 1.35 },
    base: design({ name: 'GT Coupe', style: 'coupe', mass: 1250, size: [1.86, 4.4, 1.1], track: 1.68, wheelbase: 2.65, front: 0.5, radius: 0.34, tyreW: 0.3,
      freq: 2.1, zb: 0.6, zr: 0.95, bump: 0.075, tuck: 0.03, arb: [0.55, 0.3], comH: 0.42, clearance: 0.17,
      torque: 500, peakRpm: 5600, redline: 7800, idle: 950, band: 6000, gears: [3.1, 2.05, 1.5, 1.18, 0.96, 0.8], reverse: 3.0, final: 3.9,
      driveFront: 0, grip: 1.13, rearGrip: 1.1, surfGrip: [1, 0.9, 0.82, 0.85, 0.8], rrLoose: 1.5, stability: 3.4, tc: 1, forceLift: 0.16, tapCut: 0.64, airLevel: 7,
      cdA: 0.62, downforce: 1.3, maxSteer: 0.52, steerRate: 8 }),
  },
  sprint: {
    price: 4000, value: 4000, paint: 3, drive: 'RWD',
    blurb: 'A light little rear-drive coupe that loves to rev. Not much power, but it turns in like nothing else at the price. Tarmac only.',
    sound: { pitch: 1.3, sub: 0.3, bright: 1.4 },
    base: design({ name: 'Sprint 1600', style: 'coupe', mass: 860, size: [1.66, 3.95, 1.2], track: 1.48, wheelbase: 2.4, front: 0.5, radius: 0.31, tyreW: 0.22,
      freq: 1.9, zb: 0.6, zr: 0.95, bump: 0.085, tuck: 0.04, arb: [0.5, 0.3], comH: 0.44, clearance: 0.16,
      torque: 185, peakRpm: 6200, redline: 7800, idle: 950, band: 5800, gears: [3.3, 2.1, 1.5, 1.15, 0.92], reverse: 3.2, final: 4.3,
      driveFront: 0, grip: 1.12, rearGrip: 1.08, surfGrip: [1, 0.92, 0.85, 0.88, 0.82], rrLoose: 1.4, stability: 3.2, tc: 1, forceLift: 0.18, tapCut: 0.62, airLevel: 7,
      cdA: 0.6, downforce: 0.45, maxSteer: 0.56, steerRate: 8.5 }),
  },
  wagon: {
    price: 7500, value: 7500, paint: 2, drive: 'AWD', cargoArmor: 0.75, payBonus: 1.08,
    blurb: 'A roomy all-wheel-drive estate. Comfortable over rough ground, kind to cargo and pays 8% more per run, with more pace than the Hauler.',
    sound: { pitch: 0.9, sub: 0.6, bright: 0.9 },
    base: design({ name: 'Trail Wagon', style: 'hatch', look: 'wagon', mass: 1650, size: [1.84, 4.6, 1.5], track: 1.6, wheelbase: 2.8, front: 0.52, radius: 0.37, tyreW: 0.27,
      freq: 1.45, zb: 0.55, zr: 0.9, bump: 0.15, tuck: 0.09, arb: [0.4, 0.2], comH: 0.62, clearance: 0.3,
      torque: 400, peakRpm: 4200, redline: 6300, idle: 800, band: 4800, gears: [3.6, 2.2, 1.5, 1.12, 0.9, 0.76], reverse: 3.4, final: 4.2,
      driveFront: 0.45, grip: 1.0, rearGrip: 1.1, surfGrip: [1, 1.05, 1.05, 1.04, 1.05], rrLoose: 0.85, stability: 3.3, tc: 1, forceLift: 0.24, tapCut: 0.64, airLevel: 7,
      cdA: 0.95, downforce: 0.5, maxSteer: 0.56, steerRate: 6.5 }),
  },
  trophy: {
    price: 26000, value: 26000, paint: 5, drive: '4WD',
    blurb: 'A desert racing truck: huge travel, big tyres and a big engine. Flies across open country faster than anything, and just about holds the road.',
    sound: { pitch: 0.8, sub: 0.9, bright: 1.0 },
    base: design({ name: 'Desert Trophy', style: 'truck', look: 'trophy', mass: 1850, size: [2.06, 5.3, 1.55], track: 1.96, wheelbase: 3.35, front: 0.53, radius: 0.46, tyreW: 0.36,
      freq: 1.1, zb: 0.5, zr: 0.85, bump: 0.3, tuck: 0.12, arb: [0.3, 0.15], comH: 0.78, clearance: 0.52,
      torque: 580, peakRpm: 4800, redline: 6600, idle: 850, band: 5200, gears: [3.4, 2.2, 1.6, 1.3, 1.1], reverse: 3.4, final: 4.9,
      driveFront: 0.35, grip: 0.98, rearGrip: 1.12, surfGrip: [0.95, 1.18, 1.2, 1.12, 1.25], rrLoose: 0.55, stability: 3.2, tc: 0.9, forceLift: 0.3, tapCut: 0.64, airLevel: 8,
      cdA: 1.25, downforce: 0.35, maxSteer: 0.55, steerRate: 6 }),
  },
  apex: {
    price: 45000, value: 45000, paint: 1, drive: 'AWD',
    blurb: 'The fastest thing on the mountain. All-wheel drive, huge grip and downforce, and a top speed the ring road can barely hold.',
    sound: { pitch: 1.2, sub: 0.5, bright: 1.5 },
    base: design({ name: 'Apex GT', style: 'coupe', look: 'wing', mass: 1380, size: [1.98, 4.6, 1.12], track: 1.72, wheelbase: 2.72, front: 0.5, radius: 0.35, tyreW: 0.32,
      freq: 2.2, zb: 0.6, zr: 0.95, bump: 0.07, tuck: 0.03, arb: [0.55, 0.3], comH: 0.42, clearance: 0.15,
      torque: 720, peakRpm: 6400, redline: 8400, idle: 1000, band: 6400, gears: [3.0, 2.05, 1.52, 1.2, 0.98, 0.82], reverse: 3.0, final: 3.7,
      driveFront: 0.32, grip: 1.2, rearGrip: 1.1, surfGrip: [1, 0.9, 0.82, 0.85, 0.8], rrLoose: 1.5, stability: 3.5, tc: 1, forceLift: 0.15, tapCut: 0.64, airLevel: 7,
      cdA: 0.62, downforce: 1.8, maxSteer: 0.52, steerRate: 8 }),
  },
  // ---- barn finds: one old car hidden in each region (see finds.js). Not for sale; finding it puts it in the garage. ----
  ridge: {
    price: 0, value: 14000, paint: 2, drive: '4WD', find: 'mountain', cargoArmor: 0.7,
    blurb: 'A short, tough old four-by-four left in a shed in the mountains. Slow on the highway, but nothing climbs or holds on snow like it.',
    sound: { pitch: 0.78, sub: 0.75, bright: 0.8 },
    base: design({ name: 'Ridgeback 4x4', style: 'truck', mass: 1650, size: [1.84, 4.1, 1.6], track: 1.6, wheelbase: 2.45, front: 0.52, radius: 0.43, tyreW: 0.31,
      freq: 1.35, zb: 0.55, zr: 0.88, bump: 0.2, tuck: 0.1, arb: [0.35, 0.18], comH: 0.74, clearance: 0.5,
      torque: 390, peakRpm: 3400, redline: 5400, idle: 750, band: 4400, gears: [4.4, 2.5, 1.6, 1.12], reverse: 4.0, final: 4.4,
      driveFront: 0.5, grip: 0.98, rearGrip: 1.1, surfGrip: [0.97, 1.16, 1.16, 1.18, 1.3], rrLoose: 0.6, stability: 3.4, tc: 1, forceLift: 0.3, tapCut: 0.66, airLevel: 6,
      cdA: 1.3, downforce: 0.3, maxSteer: 0.6, steerRate: 6 }),
  },
  mesa: {
    price: 0, value: 15000, paint: 3, drive: 'RWD', find: 'desert',
    blurb: 'An old big-engined sand racer found under a tarp in the desert. Light, loud and very fast on open ground. Wild on tarmac.',
    sound: { pitch: 1.0, sub: 0.7, bright: 1.15 },
    base: design({ name: 'Mesa Runner', style: 'buggy', mass: 900, size: [1.8, 3.6, 1.25], track: 1.74, wheelbase: 2.55, front: 0.42, radius: 0.43, tyreW: 0.36,
      freq: 1.15, zb: 0.5, zr: 0.84, bump: 0.26, tuck: 0.11, arb: [0.25, 0.1], comH: 0.62, clearance: 0.44,
      torque: 330, peakRpm: 5000, redline: 7000, idle: 950, band: 5400, gears: [3.1, 2.0, 1.45, 1.12, 0.92], reverse: 3.1, final: 5.4,
      driveFront: 0, grip: 0.97, rearGrip: 1.14, surfGrip: [0.95, 1.2, 1.24, 1.12, 1.25], rrLoose: 0.55, stability: 3.0, tc: 0.85, forceLift: 0.28, tapCut: 0.62, airLevel: 8,
      cdA: 1.05, downforce: 0.25, maxSteer: 0.6, steerRate: 8 }),
  },
  breeze: {
    price: 0, value: 18000, paint: 5, drive: 'RWD', find: 'coast',
    blurb: 'A little open roadster from long ago, found in a boathouse on the coast. Featherlight and sweet-handling on tarmac. Keep it off the sand.',
    sound: { pitch: 1.22, sub: 0.35, bright: 1.3 },
    base: design({ name: 'Seabreeze Roadster', style: 'coupe', mass: 960, size: [1.68, 3.9, 1.1], track: 1.46, wheelbase: 2.3, front: 0.5, radius: 0.32, tyreW: 0.24,
      freq: 1.95, zb: 0.6, zr: 0.95, bump: 0.08, tuck: 0.04, arb: [0.5, 0.3], comH: 0.42, clearance: 0.16,
      torque: 270, peakRpm: 6000, redline: 7600, idle: 900, band: 5800, gears: [3.2, 2.1, 1.5, 1.18, 0.95], reverse: 3.1, final: 4.1,
      driveFront: 0, grip: 1.15, rearGrip: 1.08, surfGrip: [1, 0.9, 0.82, 0.86, 0.8], rrLoose: 1.4, stability: 3.3, tc: 1, forceLift: 0.17, tapCut: 0.62, airLevel: 7,
      cdA: 0.6, downforce: 0.5, maxSteer: 0.56, steerRate: 8.5 }),
  },
  // the speedway's find (build 38): an old endurance prototype in a garage in Sundown Flats, 20 miles out
  endure: {
    price: 0, value: 60000, paint: 5, drive: 'RWD', find: 'speedway',
    blurb: 'A long-tail endurance prototype from the early nineties, found in a garage in Sundown Flats. Featherlight, huge downforce and an engine that screams to 9,500 rpm.',
    sound: { pitch: 1.6, sub: 0.2, bright: 1.7 },
    base: design({ name: 'Vortex 91 Prototype', style: 'coupe', look: 'proto', mass: 850, size: [1.99, 4.78, 1.0], track: 1.62, wheelbase: 2.66, front: 0.47, radius: 0.33, tyreW: 0.33,
      freq: 2.6, zb: 0.62, zr: 0.96, bump: 0.06, tuck: 0.025, arb: [0.6, 0.35], comH: 0.36, clearance: 0.12,
      torque: 540, peakRpm: 8200, redline: 9500, idle: 1300, band: 6500, gears: [2.7, 1.95, 1.5, 1.2, 0.98], reverse: 2.8, final: 3.55,
      driveFront: 0, grip: 1.24, rearGrip: 1.1, surfGrip: [1, 0.85, 0.78, 0.82, 0.75], rrLoose: 1.6, stability: 3.5, tc: 1, forceLift: 0.14, tapCut: 0.64, airLevel: 7,
      cdA: 0.74, downforce: 2.8, maxSteer: 0.5, steerRate: 8.5 }),
  },
  // ---- the champion's car: won by taking the cup in every region (see cup.js). Not for sale. ----
  champ: {
    price: 0, value: 40000, paint: 1, drive: 'AWD', prize: true,
    blurb: 'Built for the champion of all three cups. A light all-wheel-drive rally car that is quick on tarmac, dirt, sand and snow alike.',
    sound: { pitch: 1.15, sub: 0.55, bright: 1.4 },
    base: design({ name: 'Highline Special', style: 'hatch', mass: 1150, size: [1.84, 4.1, 1.38], track: 1.6, wheelbase: 2.55, front: 0.5, radius: 0.35, tyreW: 0.28,
      freq: 1.75, zb: 0.58, zr: 0.92, bump: 0.15, tuck: 0.07, arb: [0.45, 0.25], comH: 0.5, clearance: 0.3,
      torque: 520, peakRpm: 6000, redline: 7800, idle: 950, band: 6000, gears: [3.2, 2.15, 1.6, 1.25, 1.02, 0.85], reverse: 3.1, final: 4.0,
      driveFront: 0.45, grip: 1.12, rearGrip: 1.08, surfGrip: [1, 1.1, 1.08, 1.06, 1.12], rrLoose: 0.8, stability: 3.4, tc: 1, forceLift: 0.2, tapCut: 0.64, airLevel: 7,
      cdA: 0.72, downforce: 1.0, maxSteer: 0.55, steerRate: 8 }),
  },
};
// showroom order: cheapest first (the hidden finds and the champion's car are not for sale)
// the hypercar (build 38): earned by finishing every goal in all three regions, with the speedway. Real 300 mph cars
// were the reference for its numbers (about 1,600 hp, all-wheel drive, low drag, just over 300 mph); the car is our own.
CARS.hyper = {
  price: 0, value: 250000, paint: 4, drive: 'AWD', prize: true, unlock: 'all',
  blurb: 'The reward for clearing every map: a long-tail hypercar with about 1,600 horsepower, all-wheel drive and a top speed just over 300 mph. Take it to the interstate.',
  sound: { pitch: 1.05, sub: 0.7, bright: 1.5 },
  base: design({ name: 'Zenith 300', style: 'coupe', look: 'hyper', mass: 1600, size: [2.04, 4.72, 1.13], track: 1.74, wheelbase: 2.74, front: 0.48, radius: 0.36, tyreW: 0.34,
    freq: 2.3, zb: 0.62, zr: 0.96, bump: 0.07, tuck: 0.03, arb: [0.6, 0.32], comH: 0.42, clearance: 0.13,
    torque: 1650, peakRpm: 6600, redline: 8000, idle: 1000, band: 7400, gears: [2.95, 2.05, 1.58, 1.27, 1.05, 0.88, 0.75], reverse: 3.0, final: 2.95,
    driveFront: 0.38, grip: 1.26, rearGrip: 1.1, surfGrip: [1, 0.88, 0.8, 0.84, 0.78], rrLoose: 1.5, stability: 3.6, tc: 1, forceLift: 0.14, tapCut: 0.66, airLevel: 7,
    cdA: 0.46, downforce: 1.1, maxSteer: 0.5, steerRate: 8 }),
};
export const CAR_IDS = Object.keys(CARS).filter((id) => !CARS[id].find && !CARS[id].prize).sort((a, b) => CARS[a].price - CARS[b].price);
export const PRIZE_IDS = Object.keys(CARS).filter((id) => CARS[id].prize);
export const FIND_IDS = Object.keys(CARS).filter((id) => CARS[id].find);
export const ALL_CAR_IDS = [...CAR_IDS, ...FIND_IDS, ...PRIZE_IDS];

export const PAINTS = [
  { name: 'Rally orange', hex: 0xd9541e }, { name: 'Glacier white', hex: 0xe6e9ec }, { name: 'Pine green', hex: 0x2f6b4a }, { name: 'Signal yellow', hex: 0xe2b12f },
  { name: 'Midnight blue', hex: 0x24407a }, { name: 'Ember red', hex: 0xb3261e }, { name: 'Slate', hex: 0x4a5057 },
  // prizes for finishing every goal in a region (see goals.js)
  { name: 'Summit gold', hex: 0xc9a227, prize: 'mountain' }, { name: 'Canyon copper', hex: 0xa8552c, prize: 'desert' }, { name: 'Sea glass', hex: 0x4fae9f, prize: 'coast' },
];

export const UPGRADES = [
  { key: 'engine', name: 'Engine', what: 'More torque: stronger acceleration at every speed, and more top speed where the gearing allows it.', cost: [0.12, 0.2, 0.32] },
  { key: 'tires', name: 'Tires', what: 'More grip on every surface: later braking, faster corners.', cost: [0.1, 0.16, 0.26] },
  { key: 'suspension', name: 'Suspension', what: 'Longer travel and firmer damping: calmer over bumps and landings, harder to roll.', cost: [0.1, 0.16, 0.26] },
  { key: 'weight', name: 'Weight', what: 'Strip weight: sharper acceleration, braking and turn-in.', cost: [0.12, 0.2, 0.32] },
];
export const upgradeCost = (id, track, level) => Math.round(CARS[id].value * UPGRADES[track].cost[level] / 10) * 10;

export const TUNING = [
  { key: 'gear', name: 'Gearing', lo: 'Acceleration', hi: 'Top speed', min: -1, max: 1, step: 0.1 },
  { key: 'spring', name: 'Springs', lo: 'Soft', hi: 'Firm', min: -1, max: 1, step: 0.1 },
  { key: 'ride', name: 'Ride height', lo: 'Low', hi: 'High', min: -1, max: 1, step: 0.1 },
  { key: 'stab', name: 'Stability assist', lo: 'Off', hi: 'Strong', min: 0, max: 1.5, step: 0.05 },
  { key: 'tc', name: 'Traction control', lo: 'Off', hi: 'Full', min: 0, max: 1, step: 0.05 },
];
export const stockTune = (id) => ({ gear: 0, spring: 0, ride: 0, stab: 1, tc: CARS[id].base.tc });

// The numbers the physics runs on, for one car with its upgrades [engine, tires, suspension, weight] and tuning.
export function buildSpec(id, up = [0, 0, 0, 0], tune = {}) {
  const c = CARS[id], b = c.base, t = { ...stockTune(id), ...tune }, [eng, tyr, sus, wgt] = up;
  const s = { ...b, id, box: { ...b.box } };
  delete s.shiftUp; delete s.shiftDown; delete s.launch;
  s.torque = b.torque * (1 + 0.09 * eng);
  s.grip = b.grip * (1 + 0.045 * tyr);
  const mk = 1 - 0.045 * wgt, kMul = 1 + 0.25 * t.spring;
  s.mass = b.mass * mk; s.inertia = b.inertia.map((v) => v * mk);
  s.springK = b.springK * kMul; s.arbF = b.arbF * kMul; s.arbR = b.arbR * kMul;
  const dMul = Math.sqrt(kMul * mk) * (1 + 0.05 * sus);                 // keeps the damping ratio as stiffness and weight change
  s.dampBump = b.dampBump * dMul; s.dampRebound = b.dampRebound * dMul;
  const sag = s.mass * G / (4 * s.springK) - b.mass * G / (4 * b.springK);   // keep the same stance when weight or springs change
  s.restLen = b.restLen + sag; s.bumpStop = b.bumpStop + sag + 0.02 * sus;
  s.attachY = b.attachY - 0.04 * t.ride; s.clearance = b.clearance + 0.04 * t.ride;
  s.forceLift = b.forceLift + 0.02 * sus;
  s.final = b.final * (1 - 0.13 * t.gear);
  s.stability = b.stability * t.stab; s.tc = t.tc;
  s.cargoArmor = c.cargoArmor ?? 1; s.payBonus = c.payBonus ?? 1;
  return s;
}

export const PATROL_SPEC = (() => { const s = buildSpec('hatch'); s.name = 'Patrol'; s.torque = 372; s.grip = 1.03; s.cdA = 1.0; return s; })();

// Flat test strip for measuring a car: 0-60 mph time and top speed.
const strip = { sample(x, z, out) { if (out) { out.nx = 0; out.ny = 1; out.nz = 0; out.surf = 0; } return 0; }, treeHash: new Map(), half: 1e9 };
const idle = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true }, flat = { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true };
export function measure(spec, maxT = 60) {
  const car = new Vehicle(strip, { ...spec, box: { ...spec.box } }), dt = 1 / 120;
  car.place(0, 0, 0, 0.4);
  for (let i = 0; i < 90; i++) car.step(dt, idle);
  let t = 0, t60 = 0, last = 0, mark = 1;
  while (t < maxT) {
    car.step(dt, flat); t += dt;
    if (!t60 && car.speed >= 26.8224) t60 = t;
    if (t >= mark) { if (t60 && car.speed - last < 0.06) break; last = car.speed; mark += 1; }
  }
  return { t60: t60 || maxT, top: car.speed };
}

// 0..1 bars for the showroom. Grip and off-road come straight from the physics numbers.
export function rate(spec, m = measure(spec)) {
  const sg = spec.surfGrip, c = (v) => Math.max(0.04, Math.min(1, v));
  return {
    speed: c((m.top * 2.23694 - 70) / 140), accel: c((8.5 - m.t60) / 6),
    grip: c((spec.grip * (1 + spec.rearGrip) / 2 - 0.85) / 0.5),
    offroad: c(((sg[1] + sg[2] + sg[4]) / 3 * spec.grip - 0.75) / 0.55 * 0.55 + (spec.clearance - 0.14) / 0.34 * 0.45),
  };
}
