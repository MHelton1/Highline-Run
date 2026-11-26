// The big map and the marker: which place a tap on the map means, and when the marker counts as reached.
// No rendering (runs in node for tests).
export const SNAP_M = 70;      // a tap this close (in metres) to a place marks that place
export const ARRIVE = 24;      // driving this close to the marker clears it

// every place worth marking: garages, race starts and the cargo sites
export function mapPoints(zones, sites) {
  const pts = [];
  for (const z of zones) pts.push({ x: z.x, z: z.z, kind: z.kind, name: z.kind === 'garage' ? z.g.name : z.label });
  for (const s of sites) pts.push({ x: s.x, z: s.z, kind: 'site', name: s.name });
  return pts;
}

// what a tap at world point (x, z) means: the nearest place within snap metres, or a plain pin
export function pickPoint(points, x, z, snap = SNAP_M) {
  let best = null, bd = snap;
  for (const p of points) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
  return best ? { x: best.x, z: best.z, name: best.name, kind: best.kind } : { x, z, name: 'Your marker', kind: 'pin' };
}

export const arrived = (m, x, z) => !!m && Math.hypot(m.x - x, m.z - z) < ARRIVE;

// the square part of the world the big map shows: everything worth seeing (roads, places) with a margin round it
export function mapView(points, roads, size, pad = 0.07) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  const h = size / 2, add = (x, z) => { if (Math.abs(x) > h || Math.abs(z) > h) return; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; };
  for (const p of points) add(p.x, p.z);
  for (const r of roads) for (let i = r.from; i <= r.to; i += 8) add(r.x[i], r.z[i]);
  if (x0 > x1) return { cx: 0, cz: 0, span: size };
  const span = Math.min(size, Math.max(x1 - x0, z1 - z0) * (1 + 2 * pad));
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span };
}
// map pixel (on a square map of n pixels showing view) to world point and back; north (+z) up, +x on the left
export const pixelToWorld = (px, py, n, v) => ({ x: v.cx + v.span / 2 - px * v.span / n, z: v.cz + v.span / 2 - py * v.span / n });
export const worldToPixel = (x, z, n, v) => ({ x: (v.cx + v.span / 2 - x) * n / v.span, y: (v.cz + v.span / 2 - z) * n / v.span });
