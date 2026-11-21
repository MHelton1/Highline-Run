// Draws a region from above to a PNG (via a PPM and ImageMagick): ground height, water, roads, places, rivers.
// usage: REGION=coast node tests/mapimg.mjs out.png [px]
import { buildWorld, N, V, CELL, HALF } from '../src/terrain.js';
import { writeFileSync } from 'fs'; import { execSync } from 'child_process';
const w = buildWorld(process.env.REGION || 'coast'), out = process.argv[2] || 'map.png', P = +(process.argv[3] || 768);
const img = Buffer.alloc(P * P * 3), K = P / (N * CELL);
for (let py = 0; py < P; py++) for (let px = 0; px < P; px++) {
  const x = px / K - HALF, z = py / K - HALF, h = w.sample(x, z), o = (py * P + px) * 3;
  const wl = w.waterAt ? w.waterAt(x, z) : w.sea;
  let c;
  if (wl != null && h < wl) c = [40, 110, 170];
  else { const t = Math.min(1, Math.max(0, (h - (w.sea || 0)) / 220)); c = [70 + 150 * t, 120 + 100 * t, 60 + 140 * t]; if (w.steepR) { const ri = Math.min(w.reachN - 1, Math.round((z + HALF) / (3 * CELL))) * w.reachN + Math.min(w.reachN - 1, Math.round((x + HALF) / (3 * CELL))); if (!w.reach[ri]) c = c.map((v) => v * 0.6); } }
  img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
}
const dot = (x, z, col, r = 1) => { const cx = Math.round((x + HALF) * K), cz = Math.round((z + HALF) * K); for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const X = cx + a, Y = cz + b; if (X >= 0 && Y >= 0 && X < P && Y < P) { const o = (Y * P + X) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; } } };
for (const r of w.roads) for (let i = r.from; i <= r.to; i++) dot(r.x[i], r.z[i], r.surf ? [150, 90, 40] : [30, 30, 30], 0);
for (const b of w.bridges || []) { const r = w.roads[b.road]; for (let i = b.i0; i <= b.i1; i++) dot(r.x[i], r.z[i], [255, 0, 255], 1); }
for (const s of w.places.sites) dot(s.x, s.z, [255, 255, 0], 3);
for (const g of w.places.garages) dot(g.x, g.z, [255, 0, 0], 4);
for (const g of w.places.trial.gates) dot(g.x, g.z, [0, 255, 255], 3);
writeFileSync(out + '.ppm', Buffer.concat([Buffer.from(`P6 ${P} ${P} 255\n`), img])); execSync(`convert ${out}.ppm ${out} && rm ${out}.ppm`);
console.log('wrote', out);
