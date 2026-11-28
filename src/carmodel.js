// The four cars as shaped bodies: a skin stretched over cross-sections along the car's length, with real wheel
// arches, a glazed cabin, lights and trim. Local axes: +z forward, +x left, +y up; y = 0 is the centre of mass.
// Each style is laid out from the car's physics numbers, so the model follows upgrades and ride-height tuning.
import * as THREE from 'three';
import { mergeGeos, parts, signTexture, FONT } from './kit.js';
import { G } from './vehicle.js';

let ENV = null, MIRROR = null, SH = null;   // the sky reflection maps (soft for paint and metal, sharp for glass), and the materials every car shares
export function setCarEnv(tex, mirror) { ENV = tex; MIRROR = mirror; SH = null; }
const std = (color, roughness, metalness, more) => new THREE.MeshStandardMaterial({ color, roughness, metalness, envMap: ENV, envMapIntensity: 0.9, ...more });
const shared = () => SH || (SH = {
  dark: std(0x16181b, 0.8, 0.05), rubber: std(0x0f1012, 0.93, 0), under: std(0x0b0c0d, 1, 0),
  glass: new THREE.MeshBasicMaterial({ color: 0x6f7a83, envMap: MIRROR, combine: THREE.MultiplyOperation, reflectivity: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  metal: std(0xc3c8cf, 0.24, 1), steel: std(0x565b62, 0.55, 0.75),
  lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.7) }), amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.75, 0.1) }),
  crate: std(0xb48a4e, 0.9, 0), seat: std(0x2a2d31, 0.9, 0),
});
const paintMat = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.06, envMap: ENV, envMapIntensity: 0.6 });
const trimMat = (color) => std(color, 0.4, 0.1, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

// The soft dark patch under a car: full strength beneath the body, fading out over the last stretch on every side.
// The game stretches it between the four wheels' ground contacts every frame (see SHADE for how far it reaches).
let BLOB = null;
function blobTexture() {
  if (BLOB) return BLOB;
  const w = 32, h = 64, d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = Math.abs((x + 0.5) / w * 2 - 1), v = Math.abs((y + 0.5) / h * 2 - 1);
    d[(y * w + x) * 4 + 3] = Math.round(255 * (1 - sstep(0.4, 1, u)) * (1 - sstep(0.62, 1, v)));
  }
  BLOB = new THREE.DataTexture(d, w, h, THREE.RGBAFormat); BLOB.magFilter = BLOB.minFilter = THREE.LinearFilter; BLOB.needsUpdate = true;
  return BLOB;
}

// ---- curves along the car ----
// keys: [[z, value], ...] in rising z. Joined by a smooth curve that never overshoots a key.
function along(keys) {
  const n = keys.length, x = keys.map((k) => k[0]), y = keys.map((k) => k[1]), d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
  m[0] = d[0] || 0; m[n - 1] = d[n - 2] || 0;
  return (z) => {
    if (z <= x[0]) return y[0]; if (z >= x[n - 1]) return y[n - 1];
    let i = 0; while (z > x[i + 1]) i++;
    const h = x[i + 1] - x[i], t = (z - x[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const fn = (v) => (typeof v === 'function' ? v : Array.isArray(v) ? along(v) : () => v);
const sstep = (a, b, t) => { t = (t - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ---- skins ----
// rings: one array of [x, y, z] points per station, the same count in each, running from the left lower edge over
// the top to the right lower edge (flip: under the car instead). Smooth shading across the whole skin.
function skin(rings, flip) {
  const S = rings.length, K = rings[0].length, pos = new Float32Array(S * K * 3), idx = [];
  for (let i = 0; i < S; i++) for (let k = 0; k < K; k++) pos.set(rings[i][k], (i * K + k) * 3);
  for (let i = 0; i < S - 1; i++) for (let k = 0; k < K - 1; k++) { const a = i * K + k, b = a + K, c = b + 1, d = a + 1; if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.userData = { S, K };
  return g;
}
// The chosen cells of a skin lifted a few millimetres off it: windows, stripes, door panels. pick(i, k, z) -> bool.
function patch(g, rings, pick, lift = 0.006) {
  const { S, K } = g.userData, P = g.attributes.position.array, Nn = g.attributes.normal.array, pos = [], nor = [], idx = [];
  for (let i = 0; i < S - 1; i++) for (let k = 0; k < K - 1; k++) {
    if (!pick(i, k, (rings[i][k][2] + rings[i + 1][k][2]) / 2)) continue;
    const o = pos.length / 3;
    for (const v of [i * K + k, (i + 1) * K + k, (i + 1) * K + k + 1, i * K + k + 1]) { pos.push(P[v * 3] + Nn[v * 3] * lift, P[v * 3 + 1] + Nn[v * 3 + 1] * lift, P[v * 3 + 2] + Nn[v * 3 + 2] * lift); nor.push(Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2]); }
    idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setIndex(idx);
  return out;
}
// A flat lid over the end of a skin. dir: +1 faces forward, -1 backward.
function lid(ring, dir) {
  const K = ring.length, pos = [], idx = []; let cx = 0, cy = 0;
  for (const p of ring) { cx += p[0]; cy += p[1]; } cx /= K; cy /= K;
  pos.push(cx, cy, ring[0][2]); for (const p of ring) pos.push(p[0], p[1], p[2]);
  for (let k = 1; k <= K; k++) { const n = k === K ? 1 : k + 1; if (dir > 0) idx.push(0, k, n); else idx.push(0, n, k); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const TOPF = [0.14, 0.3, 0.5, 0.74, 1];                // where the points across the top sit, from the shoulder to the centre line
const SIDE = 4, ARC = 3, HALF = SIDE + ARC + TOPF.length;   // points in half a ring (the centre point is shared)
// One cross-section. x(y) on the side is given by sideX; the shoulder is a quarter circle of radius rs; the top runs
// from shoulder height ysh to centre height yc, most of the change happening within `tw` of the half-width.
function ring(z, yLow, ysh, yc, xTop, rs, sideX, tw) {
  const half = [];
  for (let j = 0; j < SIDE; j++) { const y = yLow + (ysh - rs - yLow) * j / (SIDE - 1); half.push([sideX(y), y, z]); }
  for (let j = 1; j <= ARC; j++) { const a = j / ARC * Math.PI / 2; half.push([xTop + rs * Math.cos(a), ysh - rs + rs * Math.sin(a), z]); }
  for (const f of TOPF) half.push([xTop * (1 - f), ysh + (yc - ysh) * sstep(0, tw, f), z]);
  const out = half.slice();
  for (let j = HALF - 2; j >= 0; j--) out.push([-half[j][0], half[j][1], z]);
  return out;
}
const isSide = (k) => k < SIDE - 1 || k >= 2 * HALF - 1 - SIDE;                         // cells on the flanks
const topCell = (k) => { const j = k < HALF - 1 ? k : 2 * HALF - 3 - k; return j - (SIDE + ARC - 1); };   // 0.. across the top from the shoulder, -1 elsewhere... negative on side and shoulder

// The stations a body is sampled at: an even spacing plus extra ones round each wheel arch.
function stations(z0, z1, step, arches) {
  const zs = [];
  for (let z = z0; z < z1 - 1e-6; z += step) zs.push(z); zs.push(z1);
  for (const a of arches) for (let j = 0; j <= 12; j++) { const z = a.z - a.R * Math.cos(j / 12 * Math.PI); if (z > z0 + 0.01 && z < z1 - 0.01) zs.push(z); }
  for (const a of arches) for (const s of [-1, 1]) { const z = a.z + s * (a.R + 0.02); if (z > z0 + 0.01 && z < z1 - 0.01) zs.push(z); }
  zs.sort((a, b) => a - b);
  return zs.filter((z, i) => i === 0 || z - zs[i - 1] > 0.012);
}

// ---- the main shell ----
// d: { w, sh, c, low (curves along z: half-width, shoulder height, centre height, lower edge), rs, tumble, tw, len: [z0, z1] }
// Returns the painted shell, the dark floor and wheel wells, and what is needed to cut patches from the shell.
function shell(d, arches) {
  const w = fn(d.w), sh = fn(d.sh), c = fn(d.c), low = fn(d.low), tw = fn(d.tw ?? 0.45), rs = d.rs, tumble = d.tumble;
  const zs = stations(d.len[0], d.len[1], d.step || 0.13, arches), rings = [], under = [];
  for (const z of zs) {
    const W = w(z), yS = sh(z), yB = low(z);
    let yA = yB, inner = null;
    for (const a of arches) { const dz = Math.abs(z - a.z); if (dz < a.R) { yA = Math.max(yA, Math.min(a.y + Math.sqrt(a.R * a.R - dz * dz), yS - rs - 0.035)); inner = a.inner; } }
    const hs = Math.max(0.05, yS - rs - yB);
    const sideX = (y) => { const t = (y - yB) / hs; return t < 0.35 ? W - 0.03 * (1 - t / 0.35) ** 2 : W - tumble * ((t - 0.35) / 0.65) ** 1.6; };
    const r = ring(z, yA, yS, c(z), W - tumble - rs, rs, sideX, tw(z));
    rings.push(r);
    const x0 = r[0][0], xi = inner == null ? x0 - 0.02 : Math.min(inner, x0 - 0.02);
    under.push([[x0, yA, z], [xi, yA, z], [xi, yB, z], [-xi, yB, z], [-xi, yA, z], [-x0, yA, z]]);
  }
  const g = skin(rings), floor = skin(under, true).toNonIndexed(); floor.computeVertexNormals();
  return { g, rings, zs, floor, front: lid(rings[rings.length - 1], 1), back: lid(rings[0], -1) };
}

// ---- the cabin ----
// d: { len: [z0, z1], h (0..1 along z: 0 at the base of the glass, 1 along the roof), roof (height), belt (curve),
//      wb, wt (half-widths at the belt and at the roof), crown }
function cabin(d) {
  const h = fn(d.h), belt = fn(d.belt), wb = fn(d.wb), roof = fn(d.roof), n = Math.max(8, Math.round((d.len[1] - d.len[0]) / 0.11)), rings = [];
  for (let i = 0; i <= n; i++) {
    const z = d.len[0] + (d.len[1] - d.len[0]) * i / n, k = Math.max(0.001, h(z)), y0 = belt(z), yr = y0 + (roof(z) - y0) * k, rr = 0.085 * Math.min(1, k * 1.5);
    const B = wb(z), T = B + (d.wt - B) * k;
    const sideX = (y) => { const t = Math.min(1, Math.max(0, (y - y0) / Math.max(0.01, yr - rr - y0))); return B + (T + rr - B) * t ** 0.85; };
    rings.push(ring(z, y0, yr, yr + d.crown * k, T, rr, sideX, 1));
  }
  return { g: skin(rings), rings, h };
}

// ---- wheels ----
// Tyre with rounded shoulders, a rim with a lip and spokes (or a steel disc), a dark barrel behind. Outer face on +x.
function wheelGeo(r, tw, style) {
  const rim = r * (style.rim || 0.66), o = tw / 2;
  const prof = [[rim, -o], [r * 0.9, -o], [r * 0.975, -o + tw * 0.1], [r, -o + tw * 0.24], [r, o - tw * 0.24], [r * 0.975, o - tw * 0.1], [r * 0.9, o], [rim, o]].map(([a, b]) => new THREE.Vector2(a, b));
  const tyre = new THREE.LatheGeometry(prof, 22); tyre.rotateZ(-Math.PI / 2);
  const dark = [], bright = [];
  const disc = (rad, x, face) => { const g = new THREE.CircleGeometry(rad, 20); g.rotateY(face > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(x, 0, 0); return g; };
  const barrel = new THREE.CylinderGeometry(rim, rim, tw * 0.96, 20, 1, true); barrel.rotateZ(Math.PI / 2); barrel.scale(1, -1, 1); barrel.computeVertexNormals();
  dark.push(disc(rim, o - tw * 0.3, 1), disc(rim, -o + 0.02, -1));
  const lip = new THREE.TorusGeometry(rim - 0.012, 0.016, 6, 22); lip.rotateY(Math.PI / 2); lip.translate(o - 0.012, 0, 0); bright.push(lip);
  const face = o - 0.03;
  if (style.kind === 'steel') {                       // a dished steel wheel with a ring of holes
    const dish = new THREE.CylinderGeometry(rim * 0.45, rim * 0.97, tw * 0.22, 20, 1, false); dish.rotateZ(-Math.PI / 2); dish.translate(face - tw * 0.11, 0, 0); bright.push(dish);
    for (let i = 0; i < style.n; i++) { const a = i / style.n * Math.PI * 2, h = new THREE.CylinderGeometry(rim * 0.11, rim * 0.11, 0.02, 8); h.rotateZ(Math.PI / 2); h.translate(face - tw * 0.07, Math.cos(a) * rim * 0.68, Math.sin(a) * rim * 0.68); dark.push(h); }
  } else {
    for (let i = 0; i < style.n; i++) {
      const a = i / style.n * Math.PI * 2, len = rim * 0.86;
      for (const off of style.twin ? [-0.055, 0.055] : [0]) {
        const s = new THREE.BoxGeometry(0.035, len, rim * (style.wide || 0.16)); s.translate(0, len / 2 + rim * 0.1, off * (style.twin ? 1 : 0)); s.rotateX(a + (style.twin ? off * 1.2 : 0)); s.translate(face, 0, 0); bright.push(s);
      }
    }
  }
  const hub = new THREE.CylinderGeometry(rim * 0.24, rim * 0.28, 0.05, 12); hub.rotateZ(-Math.PI / 2); hub.translate(face + 0.012, 0, 0); bright.push(hub);
  const parts3 = [tyre, mergeGeos([barrel, ...dark]), mergeGeos(bright)];
  const counts = parts3.map((g) => (g.index ? g.index.count : g.attributes.position.count)), all = mergeGeos(parts3);
  let o2 = 0; counts.forEach((n, i) => { all.addGroup(o2, n, i); o2 += n; });
  return all;
}

// ---- styles ----
// Each returns what to build: the shell and cabin curves, which shell and cabin cells are glass, stripe or door panel,
// the small parts, and where the cargo, the race numbers and a roof light bar go.
const STYLES = {
  hatch(s, B, ax) {
    const L = B.z, zf = s.wheelZf, zr = s.wheelZr, wOut = s.wheelX + s.tyreW / 2 + 0.022;
    const sh = along([[-L, 0.4], [-L + 0.1, 0.455], [zr, 0.47], [0, 0.44], [0.95, 0.41], [1.5, 0.38], [L - 0.12, 0.32], [L, 0.27]]);
    const roofY = B.y1 + 0.05, wagon = s.look === 'wagon';
    return {
      body: { len: [-L, L], rs: 0.08, tumble: 0.035, tw: 0.5,
        w: [[-L, 0.8], [-L + 0.12, wOut - 0.05], [zr, wOut + 0.005], [0, wOut - 0.02], [zf, wOut], [L - 0.28, wOut - 0.05], [L, 0.72]],
        sh, c: (z) => (z > 0.95 ? along([[0.95, 0.415], [1.5, 0.398], [L - 0.12, 0.335], [L, 0.28]])(z) : sh(z) - 0.008),
        low: [[-L, B.y0 + 0.13], [-L + 0.22, B.y0 + 0.04], [-1.0, B.y0], [1.0, B.y0], [L - 0.3, B.y0 + 0.04], [L, B.y0 + 0.13]] },
      cabin: { len: [-L + 0.03, 0.95], h: [[-L + 0.03, 0], [-1.5, 1], [0.2, 1], [0.95, 0]], roof: roofY, belt: (z) => sh(z) - 0.012, wb: (z) => wOut - 0.02 - 0.035 - 0.085, wt: 0.63, crown: 0.025 },
      glass: { front: [0.2, 0.95], rear: [-L + 0.03, -1.5], side: [-1.72, 0.84], pillars: wagon ? [-0.5, -1.22] : [-0.52] },
      stripe: wagon ? null : { cells: [3, 4], zs: [[1.0, L - 0.16]], roof: [-1.5, 0.2] },
      door: [-0.75, 0.62],
      arches: [{ z: zf, R: s.radius + 0.062, y: ax + 0.02 }, { z: zr, R: s.radius + 0.062, y: ax + 0.02 }],
      wheel: wagon ? { n: 5, wide: 0.2, rim: 0.62 } : { n: 6, wide: 0.15, rim: 0.66 }, rimTrim: !wagon,
      parts(b, M) {
        b.box(1.5, 0.1, 0.2, M.dark, 0, B.y0 + 0.1, L - 0.06, [0.94, 1]);                                // front lip
        b.box(0.9, 0.1, 0.04, M.dark, 0, 0.0, L); b.box(1.3, 0.12, 0.04, M.dark, 0, 0.17, L - 0.004);             // lower grille, lamp band
        for (const sx of [1, -1]) {
          b.box(0.27, 0.085, 0.05, M.lamp, sx * 0.49, 0.17, L + 0.002);                                   // headlights
          b.box(0.1, 0.05, 0.05, M.amber, sx * 0.58, 0.0, L - 0.002);
          b.box(0.34, 0.1, 0.06, M.tail, sx * 0.52, 0.29, -L - 0.004, null, 0, sx * -0.12); b.box(0.09, 0.1, 0.06, M.lamp, sx * 0.3, 0.29, -L - 0.006);
          b.box(0.1, 0.07, 0.17, M.paint, sx * (wOut - 0.1), sh(0.72) + 0.075, 0.72, [0.7, 0.8]);         // mirrors
          if (wagon) {                                                                                     // estate: roof rails, side cladding
            b.tube(M.dark, sx * 0.56, roofY + 0.075, -1.62, sx * 0.56, roofY + 0.075, 0.08, 0.035);
            for (const z of [-1.55, 0.02]) b.box(0.05, 0.07, 0.08, M.dark, sx * 0.56, roofY + 0.035, z);
            b.box(0.03, 0.13, zf - zr - 2 * s.radius - 0.3, M.dark, sx * (wOut - 0.03), B.y0 + 0.16, (zf + zr) / 2);
            continue;
          }
          b.box(0.03, 0.3, 0.24, M.dark, sx * (s.wheelX + 0.02), ax - 0.1, zr - s.radius - 0.1, null, -0.12);   // mud flaps
          b.box(0.03, 0.26, 0.22, M.dark, sx * (s.wheelX + 0.02), ax - 0.11, zf - s.radius - 0.1, null, -0.12);
          b.box(0.06, 0.2, 0.06, M.dark, sx * 0.52, roofY - 0.06, -1.74, null, 0.5);                      // spoiler stays
        }
        if (!wagon) {
          b.box(1.36, 0.035, 0.34, M.paint, 0, roofY + 0.03, -1.7, null, -0.1);                            // roof spoiler
          b.box(0.34, 0.05, 0.3, M.dark, 0, roofY + 0.03, -0.05, [0.9, 0.7, -0.03]);                       // roof vent
        }
        b.box(1.52, 0.12, 0.12, M.dark, 0, B.y0 + 0.11, -L + 0.03);                                        // rear valance
        b.cyl(0.045, 0.045, 0.16, 10, M.metal, -0.46, B.y0 + 0.07, -L - 0.01, Math.PI / 2);
        b.box(0.44, 0.1, 0.02, M.plate, 0, 0.12, -L - 0.006);
      },
      info: { top: roofY + 0.03, roofZ: -0.75, cargo: [0.95, 0.32, 1.0, 0, roofY + 0.2, -0.75], door: [wOut - 0.012, 0.2, -0.05, 0.5, 0.32], roof: [roofY + 0.032, -0.75, 0.62] },
    };
  },

  coupe(s, B, ax) {
    const L = B.z, zf = s.wheelZf, zr = s.wheelZr, wOut = s.wheelX + s.tyreW / 2 + 0.02;
    const sh = along([[-L, 0.37], [-L + 0.14, 0.45], [zr, 0.475], [-0.45, 0.4], [0.5, 0.37], [zf, 0.42], [L - 0.22, 0.3], [L, 0.2]]);
    const roofY = B.y1 + 0.035, wing = s.look === 'wing', hyper = s.look === 'hyper', proto = s.look === 'proto';
    return {
      body: { len: [-L, L], rs: 0.07, tumble: 0.05,
        tw: (z) => (z > 0.5 || z < -1.6 ? 0.55 : 0.3),
        w: hyper ? [[-L, 0.86], [-L + 0.2, wOut - 0.02], [zr, wOut + 0.03], [-0.2, wOut - 0.08], [0.6, wOut - 0.09], [zf, wOut], [L - 0.32, wOut - 0.08], [L, 0.62]]
          : [[-L, 0.8], [-L + 0.16, wOut - 0.05], [zr, wOut + 0.012], [-0.35, wOut - 0.055], [0.45, wOut - 0.07], [zf, wOut], [L - 0.32, wOut - 0.07], [L, 0.66]],
        sh, c: (z) => (z > 0.55 ? along([[0.55, 0.365], [zf, 0.335], [L - 0.22, 0.25], [L, 0.17]])(z) : z < -1.7 ? along([[-L, 0.385], [-L + 0.14, 0.44], [-1.7, 0.43]])(z) : sh(z) - 0.008),
        low: [[-L, B.y0 + 0.15], [-L + 0.3, B.y0 + 0.05], [-0.9, B.y0 + 0.012], [0.9, B.y0 + 0.012], [L - 0.36, B.y0 + 0.03], [L, B.y0 + 0.09]] },
      // the hypercar (build 39): its own mid-engined shape, the cabin pushed forward over a long, low engine deck
      cabin: hyper ? { len: [-0.95, 1.08], h: [[-0.95, 0], [-0.15, 1], [0.22, 1], [1.08, 0]], roof: roofY - 0.06, belt: (z) => sh(z) - 0.012, wb: (z) => wOut - 0.24 + 0.02 * sstep(0.2, -0.8, z), wt: 0.5, crown: 0.04 }
        : { len: [-1.72, 0.56], h: [[-1.72, 0], [-0.62, 1], [-0.12, 1], [0.56, 0]], roof: roofY, belt: (z) => sh(z) - 0.012, wb: (z) => wOut - 0.22 + 0.03 * sstep(-0.4, -1.5, z), wt: 0.55, crown: 0.03 },
      glass: hyper ? { front: [0.22, 1.08], rear: [-0.8, -0.15], side: [-0.55, 0.98], pillars: [] } : { front: [-0.12, 0.56], rear: [-1.5, -0.62], side: [-1.12, 0.46], pillars: [] },
      stripe: hyper ? { cells: [3], zs: [[1.12, L - 0.2], [-L + 0.16, -1.0]], roof: [-0.15, 0.22] } : { cells: [3], zs: [[0.62, L - 0.2], [-L + 0.16, -1.74]], roof: [-0.62, -0.12] },
      door: hyper ? [-0.25, 0.85] : [-0.72, 0.4],
      arches: [{ z: zf, R: s.radius + 0.058, y: ax + 0.015 }, { z: zr, R: s.radius + 0.062, y: ax + 0.015 }],
      wheel: { n: 5, twin: true, wide: 0.1, rim: 0.72 }, rimTrim: false,
      parts(b, M) {
        b.box(2 * wOut - 0.12, 0.04, 0.34, M.dark, 0, B.y0 + 0.035, L - 0.1, [0.9, 1]);                   // splitter
        b.box(1.0, 0.09, 0.05, M.dark, 0, 0.0, L - 0.012); b.box(0.3, 0.06, 0.05, M.dark, 0.6, -0.02, L - 0.07, null, 0, 0.35); b.box(0.3, 0.06, 0.05, M.dark, -0.6, -0.02, L - 0.07, null, 0, -0.35);
        for (const sx of [1, -1]) {
          b.box(0.34, 0.06, 0.1, M.lamp, sx * 0.5, 0.215, L - 0.13, null, -0.35, sx * 0.3);               // headlights laid back into the wings
          b.box(0.05, 0.12, 1.9, M.dark, sx * (wOut - 0.045), B.y0 + 0.07, 0);                             // skirts
          b.box(0.03, 0.1, 0.24, M.dark, sx * (wOut - 0.012), 0.12, zr + s.radius + 0.28, null, 0, sx * -0.1);   // side intakes
          b.box(0.1, 0.06, 0.16, M.paint, sx * (wOut - 0.15), sh(0.3) + 0.08, 0.3, [0.7, 0.8]);                     // mirrors
          b.cyl(0.055, 0.055, 0.2, 10, M.metal, sx * 0.34, B.y0 + 0.1, -L + 0.01, Math.PI / 2);            // exhausts
        }
        if (!hyper && !proto) b.box(2 * wOut - 0.4, 0.045, 0.3, M.paint, 0, sh(-L + 0.2) + 0.05, -L + 0.13, null, -0.16);        // ducktail
        if (hyper) {           // long low tail: a slim lip spoiler, big side intakes, a spine down the engine cover
          b.box(2 * wOut - 0.3, 0.03, 0.22, M.dark, 0, sh(-L + 0.2) + 0.04, -L + 0.12, null, -0.05);
          for (const sx of [1, -1]) { b.box(0.06, 0.22, 0.7, M.dark, sx * (wOut - 0.03), 0.2, zr + s.radius + 0.5, null, 0, sx * -0.12); b.box(0.04, 0.05, 1.6, M.dark, sx * (wOut - 0.06), sh(-0.6) - 0.02, -0.6); }
          b.box(0.06, 0.08, 1.9, M.paint, 0, sh(-1.4) + 0.02, -1.45, [1, 1], 0.02);                               // spine down the engine deck
          for (const x of [-0.25, 0, 0.25]) b.box(0.05, 0.03, 0.9, M.dark, x + 0.12 * Math.sign(x), sh(-1.5) - 0.002, -1.5);  // engine cover louvres
          b.box(0.36, 0.09, 0.3, M.dark, 0, roofY - 0.02, 0.0, [0.8, 0.6]);                                       // roof air scoop
        }
        if (proto) {           // endurance prototype: full-width high wing on end plates, a shark fin, a roof scoop
          const wy = sh(-L + 0.3) + 0.42;
          for (const sx of [1, -1]) { b.box(0.03, 0.62, 0.62, M.paint, sx * (wOut - 0.06), wy - 0.12, -L + 0.3); b.box(0.04, 0.42, 0.14, M.dark, sx * 0.35, wy - 0.22, -L + 0.36, null, 0.1); }
          b.box(2 * wOut - 0.14, 0.05, 0.46, M.dark, 0, wy, -L + 0.3, null, -0.1); b.box(2 * wOut - 0.14, 0.03, 0.2, M.dark, 0, wy + 0.13, -L + 0.18, null, -0.35);
          b.box(0.03, 0.34, 1.7, M.paint, 0, roofY - 0.06, -L + 1.2, [1, 0.4, -0.5]);
          b.box(0.3, 0.12, 0.42, M.dark, 0, roofY + 0.05, -0.55, [0.8, 0.7]);
        }
        if (wing) {                                                                                        // rear wing on two stays
          const wy = sh(-L + 0.3) + 0.3;
          for (const sx of [1, -1]) { b.box(0.04, 0.3, 0.16, M.dark, sx * 0.48, wy - 0.15, -L + 0.3, null, 0.15); b.box(0.03, 0.14, 0.36, M.dark, sx * (wOut - 0.2), wy + 0.02, -L + 0.26); }
          b.box(2 * wOut - 0.38, 0.04, 0.32, M.dark, 0, wy, -L + 0.26, null, -0.08);
        }
        b.box(1.5, 0.06, 0.05, M.tail, 0, 0.33, -L - 0.004);                                               // light bar
        b.box(1.36, 0.14, 0.1, M.dark, 0, B.y0 + 0.1, -L + 0.04); for (const x of [-0.45, -0.15, 0.15, 0.45]) b.box(0.02, 0.12, 0.2, M.dark, x, B.y0 + 0.07, -L + 0.04);   // diffuser
        b.box(0.44, 0.1, 0.02, M.plate, 0, 0.16, -L - 0.006);
      },
      info: hyper ? { top: roofY - 0.03, roofZ: 0.03, cargo: [0.9, 0.26, 0.8, 0, roofY + 0.11, 0.0], door: [wOut - 0.045, 0.1, 0.3, 0.5, 0.28], roof: [roofY - 0.026, 0.03, 0.3] }
        : { top: roofY + 0.03, roofZ: -0.37, cargo: [0.9, 0.26, 0.8, 0, roofY + 0.17, -0.4], door: [wOut - 0.045, 0.1, -0.15, 0.5, 0.28], roof: [roofY + 0.034, -0.37, 0.44] },
    };
  },

  truck(s, B, ax) {
    const L = B.z, zf = s.wheelZf, zr = s.wheelZr, wOut = s.wheelX + s.tyreW / 2 + 0.025, belt = B.y0 + 0.9;
    const sh = along([[-L, belt - 0.03], [-L + 0.1, belt], [0.9, belt + 0.02], [L - 0.14, belt - 0.04], [L, belt - 0.12]]);
    const roofY = B.y1 + 0.03, cabB = -0.55, bedF = -0.62, bedR = -L + 0.1, floor = belt - 0.4, trophy = s.look === 'trophy';
    return {
      body: { len: [-L, L], rs: 0.075, tumble: 0.03, step: 0.12,
        tw: (z) => (z < bedF + 0.03 && z > bedR - 0.03 ? 0.1 : 0.7),
        w: [[-L, wOut - 0.07], [-L + 0.1, wOut - 0.04], [zr, wOut], [zr + 0.75, wOut - 0.045], [zf - 0.75, wOut - 0.045], [zf, wOut], [L - 0.14, wOut - 0.05], [L, wOut - 0.13]],
        sh, c: (z) => (z > 0.9 ? along([[0.9, belt + 0.04], [L - 0.14, belt - 0.01], [L, belt - 0.1]])(z)
          : z < bedF && z > bedR ? floor + (sh(z) - floor) * (1 - sstep(bedR, bedR + 0.035, z) * sstep(bedF, bedF - 0.035, z)) : sh(z) - 0.008),
        low: [[-L, -0.08], [-L + 0.3, B.y0 + 0.04], [L - 0.42, B.y0 + 0.04], [L, -0.04]] },
      cabin: { len: [cabB, 0.92], h: [[cabB, 0], [cabB + 0.07, 1], [0.34, 1], [0.92, 0]], roof: roofY, belt: (z) => sh(z) - 0.012, wb: () => wOut - 0.045 - 0.03 - 0.085, wt: 0.75, crown: 0.02 },
      glass: { front: [0.34, 0.92], rear: [cabB, cabB + 0.07], side: [cabB + 0.14, 0.8], pillars: [] },
      stripe: null, bed: [bedR, bedF],
      door: [cabB + 0.1, 0.7],
      arches: [{ z: zf, R: s.radius + 0.075, y: ax + 0.03 }, { z: zr, R: s.radius + 0.075, y: ax + 0.03 }],
      wheel: trophy ? { n: 8, wide: 0.11, rim: 0.6 } : { kind: 'steel', n: 6, rim: 0.6 }, rimTrim: false,
      parts(b, M) {
        if (trophy) { this.trophyParts(b, M); return; }
        b.box(2 * wOut - 0.02, 0.2, 0.26, M.steel, 0, B.y0 + 0.2, L + 0.02, [1, 0.8]); b.box(2 * wOut - 0.02, 0.2, 0.24, M.steel, 0, B.y0 + 0.2, -L - 0.02, [1, 0.8]);   // bumpers
        b.box(1.2, 0.3, 0.05, M.dark, 0, belt - 0.33, L - 0.005); for (const y of [-0.42, -0.33, -0.24]) b.box(1.14, 0.03, 0.05, M.metal, 0, belt + y, L + 0.008);       // grille
        for (const sx of [1, -1]) {
          b.box(0.2, 0.17, 0.05, M.lamp, sx * 0.74, belt - 0.3, L + 0.002); b.box(0.2, 0.06, 0.05, M.amber, sx * 0.74, belt - 0.44, L + 0.002);
          b.box(0.1, 0.34, 0.06, M.tail, sx * (wOut - 0.13), belt - 0.25, -L - 0.004);
          b.box(0.12, 0.2, 0.08, M.dark, sx * (wOut + 0.045), belt + 0.2, 0.62); b.box(0.16, 0.03, 0.03, M.dark, sx * (wOut - 0.03), belt + 0.16, 0.62);     // mirrors
          b.box(0.16, 0.05, 1.5, M.steel, sx * (wOut - 0.02), B.y0 + 0.05, (zf + zr) / 2 + 0.05);          // side steps
          for (const wz of [zf, zr]) b.add(new THREE.TorusGeometry(s.radius + 0.1, 0.04, 5, 16, Math.PI).rotateY(Math.PI / 2).scale(1.5, 1, 1), M.dark, sx * (wOut - 0.005), ax + 0.03, wz);   // arch flares
          b.tube(M.dark, sx * (wOut - 0.1), belt + 0.035, bedR, sx * (wOut - 0.1), belt + 0.035, bedF, 0.06);   // bed rails
        }
        b.box(1.5, 0.05, 0.09, M.dark, 0, roofY + 0.05, 0.3); for (const x of [-0.5, -0.17, 0.17, 0.5]) b.box(0.2, 0.12, 0.08, M.lamp, x, roofY + 0.12, 0.33);   // roof lights
        b.box(0.44, 0.1, 0.02, M.plate, 0, B.y0 + 0.2, -L - 0.146);
      },
      // the desert racer: tube bumpers, a cage over the bed, a long light bar, a louvred bonnet and no chrome
      trophyParts(b, M) {
        const bar = (x1, y1, z1, x2, y2, z2, r = 0.035) => b.rod(M.dark, x1, y1, z1, x2, y2, z2, r), fy = B.y0 + 0.24, ry = B.y0 + 0.28;
        bar(-(wOut - 0.2), fy, L + 0.1, wOut - 0.2, fy, L + 0.1, 0.045); bar(-0.5, fy + 0.3, L + 0.04, 0.5, fy + 0.3, L + 0.04);      // front bumper
        bar(-(wOut - 0.15), ry, -L - 0.06, wOut - 0.15, ry, -L - 0.06, 0.045);                                                  // rear bumper
        b.box(1.2, 0.3, 0.05, M.dark, 0, belt - 0.33, L - 0.005); b.box(1.1, 0.03, 0.4, M.dark, 0, belt + 0.02, 1.35);          // grille, bonnet louvres
        for (const z of [1.2, 1.3, 1.4, 1.5]) b.box(1.0, 0.035, 0.02, M.under, 0, belt + 0.045, z);
        for (const sx of [1, -1]) {
          bar(sx * 0.5, fy, L + 0.1, sx * 0.5, fy + 0.3, L + 0.04); bar(sx * (wOut - 0.2), ry, -L - 0.06, sx * (wOut - 0.2), belt - 0.05, -L + 0.06);
          b.cyl(0.13, 0.13, 0.08, 14, M.lamp, sx * 0.62, belt - 0.3, L + 0.01, Math.PI / 2); b.box(0.16, 0.05, 0.05, M.amber, sx * 0.85, belt - 0.46, L + 0.002);   // round headlights
          b.box(0.1, 0.22, 0.06, M.tail, sx * (wOut - 0.13), belt - 0.18, -L - 0.004);
          b.box(0.12, 0.18, 0.08, M.dark, sx * (wOut + 0.04), belt + 0.22, 0.62); b.box(0.16, 0.03, 0.03, M.dark, sx * (wOut - 0.03), belt + 0.18, 0.62);     // mirrors
          for (const wz of [zf, zr]) b.add(new THREE.TorusGeometry(s.radius + 0.12, 0.05, 5, 16, Math.PI).rotateY(Math.PI / 2).scale(1.7, 1, 1), M.dark, sx * (wOut - 0.005), ax + 0.03, wz);   // fender flares
          const cx = sx * (wOut - 0.28);                                                                 // bed cage
          bar(cx, roofY - 0.04, cabB + 0.04, sx * (wOut - 0.16), belt + 0.02, bedR + 0.12); bar(cx, roofY - 0.04, cabB + 0.04, sx * (wOut - 0.16), belt + 0.02, bedF - 0.1, 0.03);
          bar(sx * (wOut - 0.16), belt + 0.02, bedR + 0.12, sx * (wOut - 0.16), belt + 0.02, bedF - 0.1, 0.03);
          b.cyl(0.06, 0.06, 0.34, 10, M.dark, sx * 0.3, belt - 0.02, bedR + 0.35, 0, 0, 0);                // shock towers in the bed
        }
        bar(-(wOut - 0.28), roofY - 0.04, cabB + 0.04, wOut - 0.28, roofY - 0.04, cabB + 0.04);
        b.box(1.7, 0.06, 0.1, M.dark, 0, roofY + 0.06, 0.55); for (let i = 0; i < 6; i++) b.box(0.22, 0.1, 0.06, M.lamp, -0.65 + i * 0.26, roofY + 0.13, 0.58);   // light bar
        b.box(0.44, 0.1, 0.02, M.plate, 0, belt - 0.42, -L - 0.004);
      },
      info: { top: roofY + 0.03, roofZ: -0.1, cargo: [1.3, 0.5, 1.5, 0, floor + 0.27, (bedR + bedF) / 2], door: [wOut - 0.04, belt - 0.42, 0.1, 0.56, 0.34], roof: [roofY + 0.027, -0.1, 0.66] },
    };
  },

  buggy(s, B, ax) {
    const zf = s.wheelZf, zr = s.wheelZr, y = B.y0, top = B.y1 - 0.03;
    const sh = along([[-1.25, y + 0.42], [-0.6, y + 0.46], [0.45, y + 0.44], [1.1, y + 0.36], [1.62, y + 0.2]]);
    return {
      body: { len: [-1.25, 1.62], rs: 0.07, tumble: 0.05, step: 0.11,
        tw: (z) => (z < 0.42 && z > -0.72 ? 0.12 : 0.9),
        w: [[-1.25, 0.47], [-0.6, 0.56], [0.4, 0.54], [1.1, 0.4], [1.62, 0.22]],
        sh, c: (z) => (z > 0.42 ? sh(z) + 0.1 * sstep(1.62, 0.9, z) : z > -0.72 ? y + 0.12 + (sh(z) - y - 0.12) * (1 - sstep(-0.72, -0.685, z) * sstep(0.42, 0.385, z)) : sh(z) + 0.02),
        low: [[-1.25, y + 0.04], [-0.9, y], [1.0, y], [1.62, y + 0.1]] },
      cabin: null, glass: null, stripe: { cells: [3, 4], zs: [[0.5, 1.55]] }, bed: [-0.72, 0.42], door: null, arches: [],
      wheel: { kind: 'steel', n: 8, rim: 0.58 }, rimTrim: false,
      parts(b, M) {
        const cage = (x1, y1, z1, x2, y2, z2, r = 0.028) => b.rod(M.dark, x1, y1, z1, x2, y2, z2, r);
        for (const sx of [1, -1]) {
          cage(sx * 0.5, sh(0.5), 0.5, sx * 0.45, top, -0.02); cage(sx * 0.45, top, -0.02, sx * 0.45, top, -0.62); cage(sx * 0.45, top, -0.62, sx * 0.52, sh(-0.7), -0.72);
          cage(sx * 0.45, top, -0.62, sx * 0.4, y + 0.55, -1.42); cage(sx * 0.52, sh(-0.7), -0.72, sx * 0.4, y + 0.55, -1.42); cage(sx * 0.5, sh(0.5), 0.5, sx * 0.52, sh(-0.7), -0.72, 0.022);
          for (const z of [zf, zr]) {                                                                      // arms, shocks
            b.rod(M.steel, sx * 0.42, y + 0.12, z + 0.16, sx * (s.wheelX - 0.14), ax - 0.06, z, 0.024); b.rod(M.steel, sx * 0.42, y + 0.12, z - 0.16, sx * (s.wheelX - 0.14), ax - 0.06, z, 0.024);
            b.rod(M.steel, sx * 0.4, y + 0.36, z + 0.1, sx * (s.wheelX - 0.14), ax + 0.1, z, 0.02); b.rod(M.steel, sx * 0.4, y + 0.36, z - 0.1, sx * (s.wheelX - 0.14), ax + 0.1, z, 0.02);
            const top2 = z > 0 ? y + 0.4 : y + 0.66, in2 = z > 0 ? 0.3 : 0.36; b.rod(M.paint, sx * in2, top2, z, sx * (s.wheelX - 0.2), ax + 0.02, z, 0.04);
          }
          b.box(0.4, 0.5, 0.42, M.seat, sx * 0.26, y + 0.4, -0.36, [0.9, 0.7, -0.08]); b.box(0.36, 0.1, 0.4, M.seat, sx * 0.26, y + 0.2, -0.06);   // seats
          b.box(0.15, 0.1, 0.07, M.lamp, sx * 0.2, y + 0.3, 1.5, null, -0.3); b.box(0.13, 0.09, 0.05, M.tail, sx * 0.34, y + 0.58, -1.43);
          b.cyl(0.036, 0.036, 0.5, 8, M.metal, sx * 0.2, y + 0.8, -1.3, 0.5);                               // exhaust stacks
          b.cyl(0.11, 0.11, 0.2, 10, M.metal, sx * 0.2, y + 0.7, -0.98);                                    // air filters
        }
        cage(-0.45, top, -0.02, 0.45, top, -0.02); cage(-0.45, top, -0.62, 0.45, top, -0.62); cage(-0.4, y + 0.55, -1.42, 0.4, y + 0.55, -1.42); cage(-0.45, top, -0.62, 0.45, top, -0.02, 0.02);
        b.box(0.92, 0.03, 0.62, M.paint, 0, top + 0.035, -0.32);                                            // roof panel
        b.box(0.7, 0.36, 0.56, M.steel, 0, y + 0.44, -1.02); b.box(0.5, 0.12, 0.4, M.dark, 0, y + 0.66, -1.02);   // engine
        b.rod(M.dark, -0.42, y + 0.2, 1.6, 0.42, y + 0.2, 1.6, 0.035);                                      // nudge bar
        for (const x of [-0.3, -0.1, 0.1, 0.3]) b.box(0.15, 0.1, 0.06, M.lamp, x, top + 0.1, 0.0);         // roof lights
        b.cyl(0.19, 0.19, 0.03, 14, M.dark, 0, y + 0.52, 0.2, 1.1);                                         // steering wheel
      },
      info: { top: top + 0.06, roofZ: -0.32, cargo: [0.74, 0.32, 0.56, 0, y + 0.86, -1.04], door: [0.57, y + 0.22, 0.75, 0.42, 0.3], roof: [top + 0.052, -0.32, 0.5], rimMetal: true },
    };
  },
};

// opt: paint and trim colours, lightbar (patrol cars), number (race rivals)
export const SHADE = 0.75;      // how far the ground shade reaches beyond the body, in metres
export function buildCar(spec, opt = {}) {
  const car = new THREE.Group(), body = new THREE.Group(); car.add(body);
  const own = { paint: paintMat(opt.paint ?? 0xd9541e), trim: trimMat(opt.trim ?? 0xf2efe6), tail: new THREE.MeshBasicMaterial({ color: 0x7a1512 }), plate: std(0xe9e6da, 0.6, 0) };
  const M = { ...shared(), ...own }, B = spec.box;
  const stat = spec.mass * G / (4 * spec.springK), ax = spec.attachY - (spec.restLen - stat);     // axle height with the car at rest
  const st = (STYLES[spec.style] || STYLES.hatch)(spec, B, ax), info = st.info;
  const b = parts(), arches = st.arches.map((a) => ({ ...a, inner: spec.wheelX - (spec.tyreW ?? 0.26) / 2 - 0.035 }));

  const sh = shell(st.body, arches);
  b.add(sh.g, M.paint); b.add(sh.front, M.paint); b.add(sh.back, M.paint); b.add(sh.floor, M.under);
  const zin = (z, r) => z > r[0] && z < r[1];
  if (st.stripe && !opt.lightbar) b.add(patch(sh.g, sh.rings, (i, k, z) => st.stripe.cells.includes(topCell(k)) && st.stripe.zs.some((r) => zin(z, r))), M.trim);
  if (st.bed) b.add(patch(sh.g, sh.rings, (i, k, z) => topCell(k) >= 0 && zin(z, [st.bed[0] - 0.02, st.bed[1] + 0.02]), 0.004), M.dark);
  if (opt.lightbar && st.door) b.add(patch(sh.g, sh.rings, (i, k, z) => isSide(k) && zin(z, st.door)), M.trim);   // patrol cars: white doors
  if (st.cabin) {
    const cb = cabin(st.cabin), gl = st.glass;
    b.add(cb.g, M.paint);
    b.add(patch(cb.g, cb.rings, (i, k, z) => (topCell(k) >= 0 && (zin(z, gl.front) || zin(z, gl.rear))) || (isSide(k) && zin(z, gl.side) && !gl.pillars.some((p) => Math.abs(z - p) < 0.07))), M.glass);
    if (st.stripe && st.stripe.roof && !opt.lightbar) b.add(patch(cb.g, cb.rings, (i, k, z) => st.stripe.cells.includes(topCell(k)) && zin(z, st.stripe.roof), 0.008), M.trim);
  }
  st.parts(b, M);

  let bar = null;
  if (opt.lightbar) {
    b.box(1.04, 0.05, 0.3, M.dark, 0, info.top + 0.02, info.roofZ);
    bar = [new THREE.MeshBasicMaterial({ color: 0x551111 }), new THREE.MeshBasicMaterial({ color: 0x111155 })];
    b.box(0.44, 0.12, 0.24, bar[0], 0.27, info.top + 0.1, info.roofZ, [0.9, 0.8]); b.box(0.44, 0.12, 0.24, bar[1], -0.27, info.top + 0.1, info.roofZ, [0.9, 0.8]);
    own.bar0 = bar[0]; own.bar1 = bar[1];
  }
  if (opt.number != null) {
    const tex = signTexture(96, 96, (g, w, h) => { g.fillStyle = '#f3efe4'; g.fillRect(0, 0, w, h); g.strokeStyle = '#0e1114'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); g.fillStyle = '#0e1114'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${String(opt.number).length > 1 ? 62 : 74}px ${FONT}`; g.fillText(String(opt.number), w / 2, h / 2 + 4); });
    const nm = own.num = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), [dx, dy, dz, dw, dh] = info.door, [ry, rz, rs] = info.roof;
    b.plane(dw, dh, nm, dx, dy, dz, 0, Math.PI / 2); b.plane(dw, dh, nm, -dx, dy, dz, 0, -Math.PI / 2);
    b.add(new THREE.PlaneGeometry(rs, rs).rotateX(-Math.PI / 2).rotateY(Math.PI), nm, 0, ry, rz);
  }
  b.into(body);

  // cargo crate, shown while carrying
  const [cw, ch, cl, cx, cy, cz] = info.cargo, cargo = new THREE.Group();
  b.box(cw, ch, cl, M.crate, cx, cy, cz); b.box(cw + 0.03, ch + 0.03, 0.07, M.dark, cx, cy, cz + cl * 0.26); b.box(cw + 0.03, ch + 0.03, 0.07, M.dark, cx, cy, cz - cl * 0.26);
  b.into(cargo); cargo.visible = false; body.add(cargo);

  // wheels: one shared shape, mirrored on the right-hand side by the game when it places them
  const wheelG = wheelGeo(spec.radius, spec.tyreW ?? 0.26, st.wheel), wheelM = [M.rubber, M.under, st.rimTrim ? M.trim : info.rimMetal ? M.steel : M.metal], wheels = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group(), spin = new THREE.Mesh(wheelG, wheelM); spin.castShadow = true;
    pivot.add(spin); car.add(pivot); wheels.push({ pivot, spin });
  }
  // ground shade: four corners in world space (the game cancels the car's own placement on it)
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)); bg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([1, 1, 0, 1, 1, 0, 0, 0]), 2)); bg.setIndex([0, 2, 1, 1, 2, 3]);
  const blobM = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const blob = new THREE.Mesh(bg, blobM); blob.frustumCulled = false; blob.matrixAutoUpdate = false; blob.renderOrder = 2; car.add(blob);
  const dispose = () => { car.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); blobM.dispose(); for (const k in own) { if (own[k].map) own[k].map.dispose(); own[k].dispose(); } };
  return { car, body, wheels, bar, tail: own.tail, paint: own.paint, cargo, blob, rest: ax, dispose };
}
