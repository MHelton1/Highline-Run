// Driving tests (build 35): five short tests on each region's own roads, all in the same plain school car so a medal
// means the same for everyone. Each test is a time trial (see race.js) with its own checkpoints: a standing start, a
// stop in a box, a slalom through offset gates, a run of bends and a gravel stretch. A better medal pays the
// difference once; times are kept to a tenth of a second. No rendering (runs in node for tests).
import { makePath } from './ai.js';

export const SCHOOL_CAR = 'hatch', SCHOOL_PAINT_INDEX = 3;   // Signal yellow (see PAINTS in cars.js)
export const SCHOOL_PAY = [2000, 1000, 500];               // what a gold, silver or bronze is worth in all
const PREFIX = { mountain: 'tm-', desert: 'td-', coast: 'tc-' };
// medal times (gold, silver, bronze, seconds) per region and test, set from the robot runs in tests/school.mjs
export const SCHOOL_MEDALS = {
  mountain: { start: [9.8, 10.9, 12.4], stop: [8.5, 9.4, 10.7], slalom: [15.4, 17, 19.4], bends: [15.6, 17.2, 19.7], gravel: [27.8, 30.8, 35.1] },
  desert: { start: [11.1, 12.2, 14], stop: [9, 10, 11.4], slalom: [15.7, 17.4, 19.9], bends: [17.5, 19.4, 22.1], gravel: [28.5, 31.5, 35.9] },
  coast: { start: [10.8, 12, 13.7], stop: [9, 10, 11.4], slalom: [15.8, 17.5, 19.9], bends: [16.1, 17.8, 20.3], gravel: [27.1, 30, 34.2] },
};
export const SCHOOL_TESTS = [
  { key: 'start', name: 'Standing Start', blurb: 'From a standstill to the marker 300 m up the road, as quickly as the car will go. Smooth on the throttle, no wheelspin.' },
  { key: 'stop', name: 'Stop Box', blurb: 'Away from the line and stop dead in the box 150 m ahead. The clock only stops once the car does, inside the box.' },
  { key: 'slalom', name: 'Slalom', blurb: 'Weave through every gate in turn: left, right, left. Miss one and you will have to go back for it.' },
  { key: 'bends', name: 'Bends', blurb: 'The twistiest half kilometre of road on the map. Brake before each corner, power out after it.' },
  { key: 'gravel', name: 'Gravel Run', blurb: 'Seven hundred metres of loose dirt trail. Less grip than tarmac, so brake earlier and keep the car straight.' },
];

// the best stretch of a path for a test: `len` metres starting at i, scored by `score(i0, i1)` (lower is better),
// keeping clear of places to leave alone (garages, race starts) by `gap` metres
function pick(path, len, score, avoid, gap = 70) {
  const W = Math.round(len / path.ds), n = path.n, step = 6; let best = -1, bs = 1e18;
  for (let i = 0; i + (path.closed ? 0 : W) < n; i += step) {
    let ok = true;
    for (let k = 0; k <= W && ok; k += 8) { const j = (i + k) % n; for (const a of avoid) if ((path.x[j] - a.x) ** 2 + (path.z[j] - a.z) ** 2 < gap * gap) { ok = false; break; } }
    if (!ok) continue;
    const sc = score(i, i + W); if (sc < bs) { bs = sc; best = i; }
  }
  return best;
}

export function buildTests(world) {
  const pre = PREFIX[world.region] || 't-', M = SCHOOL_MEDALS[world.region] || SCHOOL_MEDALS.mountain, P = world.places;
  const ring = makePath(world.roads[0]), trail = makePath(world.roads[1]);
  const avoid = [...P.garages, ...Object.values(P.lines), ...(world.bridges || []).map((b) => { const r = world.roads[b.road], m = (b.i0 + b.i1) >> 1; return { x: r.x[m], z: r.z[m] }; })];
  const at = (path, i) => path.at(i);
  const kap = (path) => (i0, i1) => { let s = 0, mx = 0; for (let i = i0; i <= i1; i++) { const k = path.kappa[i % path.n]; s += k; mx = Math.max(mx, k); } return s + mx * 40; };
  const climb = (path) => (i0, i1) => Math.abs(path.h[i1 % path.n] - path.h[i0 % path.n]);
  // the straightest flat 360 m of the ring road: standing start, stop box; the next straightest elsewhere: slalom
  const sA = pick(ring, 360, (a, b) => kap(ring)(a, b) * 1000 + climb(ring)(a, b), avoid);
  const away = [...avoid, ...[0, 60, 120, 180].map((k) => at(ring, sA + k))];
  const sB = pick(ring, 260, (a, b) => kap(ring)(a, b) * 1000 + climb(ring)(a, b), away, 300);
  // the twistiest 500 m (most turning, not too steep)
  const sC = pick(ring, 500, (a, b) => -kap(ring)(a, b) + climb(ring)(a, b) * 0.002, avoid);
  const gate = (path, i, r, lat = 0, extra = {}) => { const f = at(path, i); return { x: f.x + f.tz * lat, z: f.z - f.tx * lat, y: f.y, r, ...extra }; };
  const ahead = (path, i, m) => i + Math.round(m / path.ds);
  const startAt = (path, i) => { const f = at(path, i); return { x: f.x, z: f.z, yaw: f.yaw, y: f.y }; };
  const make = (key, path, i0, gates) => {
    const T = SCHOOL_TESTS.find((t) => t.key === key), s = startAt(path, i0);
    let d = 0, px = s.x, pz = s.z; for (const g of gates) { d += Math.hypot(g.x - px, g.z - pz); px = g.x; pz = g.z; }
    return { id: pre + key, key, school: true, car: SCHOOL_CAR, kind: 'trial', name: T.name, short: T.name, tag: 'Driving test', blurb: T.blurb,
      x: s.x, z: s.z, y: s.y, start: { x: s.x, z: s.z, yaw: s.yaw }, gates, dist: d, rivals: [], medals: M[key], prize: SCHOOL_PAY };
  };
  const tests = [
    make('start', ring, sA, [gate(ring, ahead(ring, sA, 300), 9)]),
    make('stop', ring, sA, [gate(ring, ahead(ring, sA, 150), 2.6, 0, { stop: true })]),
    make('slalom', ring, sB, [...Array.from({ length: 7 }, (_, k) => gate(ring, ahead(ring, sB, 45 + k * 26), 2.4, (k % 2 ? -1 : 1) * 2.3)), gate(ring, ahead(ring, sB, 45 + 7 * 26 + 20), 8)]),
    make('bends', ring, sC, Array.from({ length: 12 }, (_, k) => gate(ring, ahead(ring, sC, (k + 1) * 500 / 12), 7.5))),
    make('gravel', trail, P.lines.dashStart.idx - trail.a0 + 10, Array.from({ length: 10 }, (_, k) => gate(trail, ahead(trail, P.lines.dashStart.idx - trail.a0 + 10, (k + 1) * 70), 8))),
  ];
  return tests;
}
// what a medal is worth on its own (bronze 500, silver 1000, gold 2000), and what improving from `prev` pays
export const medalValue = (rank) => (rank >= 1 && rank <= 3 ? SCHOOL_PAY[rank - 1] : 0);
export const improvePay = (rank, prev) => Math.max(0, medalValue(rank) - medalValue(prev));
