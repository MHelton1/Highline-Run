// Turns world data into Three.js meshes.
import * as THREE from 'three';
import { N, V, CELL, HALF, SURF, SIZE as SIZE_ } from './terrain.js';
import { parts, lam, signTexture, banner, FONT } from './kit.js';

const lin = (c) => Math.pow(c, 2.2);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// A small repeatable random source for textures and scatter, so every visit looks the same.
const rng = (a) => () => { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// Grain for the ground: blotches at several sizes plus fine speckle, in a square that repeats without a seam.
// The ground shader lays it down twice (a tile of a few metres and one of about thirty) and multiplies both in.
function grainTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data, rnd = rng(4711);
  const octs = [4, 8, 16, 32, 64, 128].map((n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd(); return { n, a }; });
  const val = (o, x, y) => {
    const fx = x * o.n, fy = y * o.n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i0 = x0 % o.n, i1 = (x0 + 1) % o.n, j0 = y0 % o.n, j1 = (y0 + 1) % o.n;
    return (o.a[j0 * o.n + i0] * (1 - sx) + o.a[j0 * o.n + i1] * sx) * (1 - sy) + (o.a[j1 * o.n + i0] * (1 - sx) + o.a[j1 * o.n + i1] * sx) * sy;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let n = 0, amp = 1, tot = 0;
    for (let k = 1; k < octs.length; k++) { n += amp * val(octs[k], u, v); tot += amp; amp *= 0.72; }
    n = n / tot - 0.5;
    const l = Math.min(1, Math.max(0.42, 0.8 + n * 1.5 + (rnd() - 0.5) * 0.2)), tint = val(octs[0], u, v) + val(octs[2], u, v) - 1, o = (y * S + x) * 4;
    d[o] = 255 * Math.min(1, l * (1 + tint * 0.1)); d[o + 1] = 255 * l; d[o + 2] = 255 * Math.min(1, l * (1 - tint * 0.14)); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// weather on the ground: how white the open ground is under fresh snow (set by the weather each frame)
export const GROUND_FX = { snow: { value: 0 } };
export function buildTerrain(world, scene) {
  const { heights, normals, snowT, rockT, roadDist, noise } = world;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), grain = grainTexture();   // (both sides, for the skirts)
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.grain = { value: grain }; sh.uniforms.snowAmt = GROUND_FX.snow;
    sh.vertexShader = 'attribute vec2 gpos;\nvarying vec2 vGround;\nvarying float vUpN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGround = gpos; vUpN = objectNormal.y;');
    sh.fragmentShader = 'uniform sampler2D grain;\nuniform float snowAmt;\nvarying vec2 vGround;\nvarying float vUpN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 gA = texture2D(grain, vGround * ${(75 / 256).toFixed(6)}).rgb, gB = texture2D(grain, vGround.yx * ${(8 / 256).toFixed(6)}).rgb;
    float clean = smoothstep(0.42, 0.8, dot(diffuseColor.rgb, vec3(0.3333)));          // snow keeps its own colour
    diffuseColor.rgb *= mix(gA * gB * 1.6, vec3(1.0), clean * 0.75);
    if (snowAmt > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.93) * (0.9 + 0.2 * gA.r), snowAmt * smoothstep(0.55, 0.85, vUpN)); }`);
  };
  const CH = 64, per = CH + 1, group = new THREE.Group();
  // where each point sits inside its own block of ground, in metres: the same for every block, and the grain's two
  // tile sizes divide a block exactly, so the pattern carries on unbroken from one block to the next
  // Each block also has a skirt: its edge points again, a few metres lower, so a block drawn coarse (every other
  // point, far away) shows no gaps against a fine neighbour.
  const rim = []; for (let i = 0; i < CH; i++) rim.push(i); for (let j = 0; j < CH; j++) rim.push(j * per + CH); for (let i = CH; i > 0; i--) rim.push(CH * per + i); for (let j = CH; j > 0; j--) rim.push(j * per);
  const NV = per * per + rim.length;
  const gpos = new Float32Array(NV * 2);
  for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) { gpos[(j * per + i) * 2] = i * CELL; gpos[(j * per + i) * 2 + 1] = j * CELL; }
  rim.forEach((v, k) => { gpos[(per * per + k) * 2] = gpos[v * 2]; gpos[(per * per + k) * 2 + 1] = gpos[v * 2 + 1]; });
  const gposAttr = new THREE.BufferAttribute(gpos, 2);
  const grid = (step) => {
    const out = [];
    for (let j = 0; j < CH; j += step) for (let i = 0; i < CH; i += step) {
      const a = j * per + i, b = a + step, c = a + per * step, d = c + step;
      out.push(a, c, b, b, c, d);
    }
    // the skirt, round the edge (on the rim points this step keeps)
    const keep = rim.map((v, k) => k).filter((k) => { const v = rim[k], i = v % per, j = (v / per) | 0; return i % step === 0 && j % step === 0; });
    for (let q = 0; q < keep.length; q++) { const k0 = keep[q], k1 = keep[(q + 1) % keep.length], a = rim[k0], b = rim[k1], A = per * per + k0, B = per * per + k1; out.push(a, A, b, b, A, B); }
    return new THREE.BufferAttribute(new Uint16Array(out), 1);
  };
  const indexAttr = grid(1), levels = [indexAttr, grid(2), grid(4)];
  const dry = world.regionDef && world.regionDef.ground === 'desert', sea = world.sea;
  // mountain: grass, tundra up high, grey rock, snow. desert: sand, desert varnish up high, red rock in bands, no snow.
  const [gA, gB, tundra, rA, rB, snow, gravel, tH] = dry
    ? [[0.70, 0.52, 0.35], [0.80, 0.63, 0.44], [0.62, 0.42, 0.29], [0.56, 0.27, 0.16], [0.74, 0.44, 0.28], [0.93, 0.95, 0.98], [0.64, 0.53, 0.41], 120]
    : sea != null ? [[0.30, 0.45, 0.18], [0.45, 0.51, 0.24], [0.44, 0.46, 0.28], [0.44, 0.42, 0.38], [0.58, 0.55, 0.50], [0.93, 0.95, 0.98], [0.45, 0.40, 0.33], 150]
    : [[0.27, 0.40, 0.17], [0.40, 0.46, 0.20], [0.47, 0.44, 0.29], [0.40, 0.38, 0.36], [0.52, 0.48, 0.43], [0.93, 0.95, 0.98], [0.45, 0.40, 0.33], 215];
  for (let cj = 0; cj < N / CH; cj++) for (let ci = 0; ci < N / CH; ci++) {
    const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), col = new Float32Array(NV * 3);
    for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
      const gi = ci * CH + i, gj = cj * CH + j, v = gj * V + gi, o = (j * per + i) * 3;
      const x = gi * CELL - HALF, z = gj * CELL - HALF, h = heights[v];
      pos[o] = x; pos[o + 1] = h; pos[o + 2] = z;
      nor[o] = normals[v * 3]; nor[o + 1] = normals[v * 3 + 1]; nor[o + 2] = normals[v * 3 + 2];
      const n1 = noise(x / 55, z / 55) * 0.5 + 0.5, n2 = noise(x / 13 + 9, z / 13) * 0.5 + 0.5;
      let c = mix(gA, gB, n1 * 0.7 + n2 * 0.3);
      c = mix(c, tundra, sm((h - tH) / 60));
      c = mix(c, dry ? mix(mix(rA, rB, 0.5 + 0.5 * Math.sin(h / 4.2 + n1 * 2.2)), [0.86, 0.72, 0.56], sm((Math.sin(h / 11 + 1.3) - 0.82) / 0.1) * 0.7) : mix(rA, rB, n2), rockT[v]);
      if (sea != null) { const wl = world.waterAt(x, z); c = mix(c, [0.82, 0.74, 0.56], 1 - sm((h - wl - 1.5) / 2.5)); c = mix(c, [0.36, 0.42, 0.40], 1 - sm((h - wl + 2) / 3)); }   // beach sand (or a river's gravel), then the floor under the water
      c = mix(c, gravel, 1 - sm((roadDist[v] - 7) / 7));
      c = mix(c, snow, snowT[v]);
      const shade = 0.9 + 0.2 * n2;
      col[o] = lin(c[0] * shade); col[o + 1] = lin(c[1] * shade); col[o + 2] = lin(c[2] * shade);
    }
    rim.forEach((v, k) => { const o = (per * per + k) * 3; for (let c = 0; c < 3; c++) { pos[o + c] = pos[v * 3 + c]; nor[o + c] = nor[v * 3 + c]; col[o + c] = col[v * 3 + c]; } pos[o + 1] -= 3; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('gpos', gposAttr); g.setIndex(indexAttr); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.userData.lvl = 0; group.add(m);
  }
  scene.add(group);
  // blocks further than `far` metres from the camera are drawn with every other point (a quarter of the triangles),
  // and past 2.5 times that with every fourth point (one sixteenth): far off in the haze nobody can tell
  group.userData.lod = (cam, far = 650) => {
    for (const m of group.children) {
      const c = m.geometry.boundingSphere.center, d = Math.hypot(c.x - cam.x, c.z - cam.z) - m.geometry.boundingSphere.radius;
      const lvl = d > far * 2.5 ? 2 : d > far ? 1 : 0;
      if (lvl !== m.userData.lvl) { m.userData.lvl = lvl; m.geometry.setIndex(levels[lvl]); }
    }
  };
  return group;
}

function roadTexture(kind) {
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = rng(kind * 77 + 5);
  const speck = (n, a, b, s) => { for (let i = 0; i < n; i++) { g.fillStyle = rnd() > 0.5 ? a : b; const r = 1 + rnd() * s; g.fillRect(rnd() * W, rnd() * H, r, r); } };
  const band = (x, w, col) => { const gr = g.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - w, 0, 2 * w, H); };
  if (kind === SURF.ASPHALT) {
    g.fillStyle = '#5b5d62'; g.fillRect(0, 0, W, H);
    speck(9000, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.1)', 1.6); speck(260, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.07)', 7);
    for (const x of [70, 106, 150, 186]) band(x, 16, 'rgba(18,18,20,0.2)');                             // where the wheels run
    g.fillStyle = '#e4e1d5'; g.fillRect(13, 0, 8, H); g.fillRect(W - 21, 0, 8, H);
    g.fillStyle = '#e3b23a'; g.fillRect(124, 0, 8, 240);
    speck(1500, 'rgba(91,93,98,0.5)', 'rgba(60,62,66,0.4)', 2.2);                                        // wear on the paint
  } else {
    g.fillStyle = '#7d6347'; g.fillRect(0, 0, W, H);
    speck(9000, 'rgba(255,235,200,0.08)', 'rgba(40,25,10,0.1)', 3); speck(500, 'rgba(120,112,100,0.5)', 'rgba(60,44,28,0.3)', 5);
    for (const x of [74, 182]) band(x, 26, 'rgba(48,32,18,0.36)');                                        // ruts
    band(128, 22, 'rgba(120,128,70,0.2)');                                                              // a little growth down the middle
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function buildRoads(world, scene) {
  for (const road of world.roads) {
    const a0 = road.from, a1 = road.to, cnt = a1 - a0 + 1 + (road.closed ? 1 : 0);
    const pos = [], uv = [], nor = [], idx = [];
    for (let k = 0; k < cnt; k++) {
      const i = road.closed ? (a0 + k) % road.n : a0 + k;
      const p = road.closed ? (i - 1 + road.n) % road.n : Math.max(a0, i - 1), q = road.closed ? (i + 1) % road.n : Math.min(a1, i + 1);
      let tx = road.x[q] - road.x[p], tz = road.z[q] - road.z[p]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      const lx = tz, lz = -tx, y = road.h[i] + 0.03, vv = k * road.ds / 12, hw = road.hw;
      // skirtL, edgeL, edgeR, skirtR
      pos.push(road.x[i] + lx * (hw + 1.2), y - 0.9, road.z[i] + lz * (hw + 1.2), road.x[i] + lx * hw, y, road.z[i] + lz * hw,
        road.x[i] - lx * hw, y, road.z[i] - lz * hw, road.x[i] - lx * (hw + 1.2), y - 0.9, road.z[i] - lz * (hw + 1.2));
      uv.push(0.02, vv, 0, vv, 1, vv, 0.98, vv); nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      if (k < cnt - 1) { const b = k * 4; for (let s = 0; s < 3; s++) idx.push(b + s, b + s + 1, b + s + 4, b + s + 1, b + s + 5, b + s + 4); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: roadTexture(road.surf), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: road.surf === SURF.ASPHALT ? -2 : -1, polygonOffsetUnits: -2 }));
    m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
  }
}

// A shape made of fans: tiers of a fir, a boulder, a bush. Each vertex carries a shade (and an optional tint) that
// the instance colour multiplies, so one mesh gives lit tips, dark undersides and trees of different greens.
function shaded() {
  const pos = [], col = [], idx = [];
  const v = (x, y, z, k, t = [1, 1, 1]) => { pos.push(x, y, z); col.push(k * t[0], k * t[1], k * t[2]); return pos.length / 3 - 1; };
  return {
    v, tri: (a, b, c) => idx.push(a, b, c),
    done() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; },
  };
}
const TAU = Math.PI * 2;

export function buildTrees(world, scene, shadows) {
  if (!world.trees.length) return [];
  if (world.regionDef && world.regionDef.trees === 'cactus') return buildCacti(world, scene, shadows);
  // a fir: three ragged tiers that droop at the tips, darker where the tier above shades them, a closed underside
  const f = shaded(), rnd = rng(31), TIP = [1.1, 1.12, 0.86];
  const tier = (y0, y1, r, seg, base, top, cap) => {
    const apex = f.v(0, y1, 0, top, top > 1 ? TIP : undefined), ring = [], ph = rnd();
    for (let i = 0; i < seg; i++) { const a = (i + ph) / seg * TAU, rr = r * (i % 2 ? 0.8 : 1.08) * (0.94 + rnd() * 0.12); ring.push(f.v(Math.sin(a) * rr, y0 - (i % 2 ? 0 : 0.28) * r * 0.5, Math.cos(a) * rr, base * (i % 2 ? 0.86 : 1.05))); }
    for (let i = 0; i < seg; i++) f.tri(apex, ring[i], ring[(i + 1) % seg]);
    if (cap) { const c = f.v(0, y0 + 0.35, 0, 0.3), under = ring.map((k, i) => { const a = (i + ph) / seg * TAU, rr = r * (i % 2 ? 0.8 : 1.08) * 0.97; return f.v(Math.sin(a) * rr, y0 - (i % 2 ? 0 : 0.28) * r * 0.5 + 0.02, Math.cos(a) * rr, 0.42); }); for (let i = 0; i < seg; i++) f.tri(c, under[(i + 1) % seg], under[i]); }
  };
  tier(1.75, 6.1, 2.4, 9, 0.98, 0.5, true); tier(4.0, 7.9, 1.8, 8, 0.98, 0.56, false); tier(6.05, 9.5, 1.15, 7, 0.95, 1.12, false);
  // the trunk is part of the same mesh, in its own brown. The shader keeps each tree's green off it: trunk points are
  // the ones low down and close to the middle.
  { const BARK = [0.085, 0.048, 0.027], low = [], high = []; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; low.push(f.v(Math.sin(a) * 0.34, -0.2, Math.cos(a) * 0.34, 1, BARK)); high.push(f.v(Math.sin(a) * 0.2, 2.4, Math.cos(a) * 0.2, 0.65, BARK)); }
    for (let i = 0; i < 5; i++) { const j = (i + 1) % 5; f.tri(low[i], low[j], high[i]); f.tri(high[i], low[j], high[j]); } }
  const leafG = f.done(), leafM = new THREE.MeshLambertMaterial({ vertexColors: true });
  leafM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `vColor = vec4(1.0); vColor.rgb *= color;
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, max(step(2.5, position.y), step(0.16, dot(position.xz, position.xz))));
#endif`);
  };
  // one instanced mesh per map region, so trees off screen (and outside the shadow area) are skipped
  const R = Math.round(8 * HALF / 1536), cells = new Map(), meshes = [];
  for (const t of world.trees) { const k = Math.min(R - 1, ((t.x + HALF) / (2 * HALF) * R) | 0) * R + Math.min(R - 1, ((t.z + HALF) / (2 * HALF) * R) | 0); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t); }
  const d = new THREE.Object3D(), col = new THREE.Color();
  for (const list of cells.values()) {
    const leaves = new THREE.InstancedMesh(leafG, leafM, list.length);
    list.forEach((t, i) => {
      const u = (t.r * 7.31) % 1, w = (t.r * 3.77) % 1;       // two more steady numbers from the tree's own
      d.position.set(t.x, t.y - 0.25, t.z); d.rotation.set(0, t.r, 0); d.scale.set(t.s * (0.88 + w * 0.3), t.s * (0.85 + u * 0.5), t.s * (0.88 + w * 0.3)); d.updateMatrix();
      leaves.setMatrixAt(i, d.matrix);
      col.setHSL(0.27 + u * 0.12, 0.44 + w * 0.12, 0.2 + ((t.s * 5.3) % 1) * 0.1); leaves.setColorAt(i, col);
    });
    leaves.castShadow = shadows; leaves.computeBoundingSphere(); leaves.userData.full = list.length;
    scene.add(leaves); meshes.push(leaves);
  }
  return meshes;
}

// Desert: tall ribbed cacti with one to three arms, in a few fixed shapes, tinted per plant.
function buildCacti(world, scene, shadows) {
  const rnd = rng(77), shapes = [];
  const prism = (f, ax, ay, az, bx, by, bz, r, seg, cap) => {          // a ribbed column from a to b, rounded at b when cap
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz), ux = dx / l, uy = dy / l, uz = dz / l;
    let px = Math.abs(uy) < 0.9 ? 0 : 1, py = Math.abs(uy) < 0.9 ? 1 : 0, pz = 0;
    let qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px; const ql = Math.hypot(qx, qy, qz); qx /= ql; qy /= ql; qz /= ql;
    px = qy * uz - qz * uy; py = qz * ux - qx * uz; pz = qx * uy - qy * ux;
    const ring = (cx, cy, cz, rr, k) => { const out = []; for (let i = 0; i < seg; i++) { const a = i / seg * TAU, w = rr * (i % 2 ? 0.86 : 1); out.push(f.v(cx + (Math.cos(a) * px + Math.sin(a) * qx) * w, cy + (Math.cos(a) * py + Math.sin(a) * qy) * w, cz + (Math.cos(a) * pz + Math.sin(a) * qz) * w, k * (i % 2 ? 0.82 : 1))); } return out; };
    const A = ring(ax, ay, az, r, 0.85), B = ring(bx, by, bz, r, 1);
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; f.tri(A[i], B[i], A[j]); f.tri(A[j], B[i], B[j]); }
    if (cap) { const C = ring(bx + ux * r * 0.55, by + uy * r * 0.55, bz + uz * r * 0.55, r * 0.7, 1.05), top = f.v(bx + ux * r, by + uy * r, bz + uz * r, 1.1);
      for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; f.tri(B[i], C[i], B[j]); f.tri(B[j], C[i], C[j]); f.tri(C[i], top, C[j]); } }
  };
  for (let k = 0; k < 4; k++) {
    const f = shaded(), H = 4.6 + rnd() * 2.4, R = 0.36 + rnd() * 0.08, arms = k === 3 ? 0 : 1 + (k % 3);
    prism(f, 0, -0.3, 0, 0, H, 0, R, 12, true);
    for (let a = 0; a < arms; a++) {
      const ang = (a / Math.max(1, arms)) * TAU + rnd() * 0.8, cx = Math.sin(ang), cz = Math.cos(ang), y0 = 1.6 + rnd() * 1.6, out = 0.85 + rnd() * 0.35, up = 1.3 + rnd() * 1.6, r = R * 0.72;
      prism(f, cx * R * 0.5, y0, cz * R * 0.5, cx * out, y0 + 0.25, cz * out, r, 10, false);
      prism(f, cx * out, y0 + 0.1, cz * out, cx * out, y0 + up, cz * out, r, 10, true);
    }
    shapes.push(f.done());
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), d = new THREE.Object3D(), col = new THREE.Color(), meshes = [];
  const R = Math.round(8 * HALF / 1536), cells = new Map();
  for (const t of world.trees) { const k = (Math.min(R - 1, ((t.x + HALF) / (2 * HALF) * R) | 0) * R + Math.min(R - 1, ((t.z + HALF) / (2 * HALF) * R) | 0)) * 4 + (((t.r * 5.17) % 1) * 4 | 0); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t); }
  for (const [k, list] of cells) {
    const m = new THREE.InstancedMesh(shapes[k % 4], mat, list.length);
    list.forEach((t, i) => {
      const u = (t.r * 7.31) % 1, w = (t.r * 3.77) % 1, sc = 0.7 + t.s * 0.35;
      d.position.set(t.x, t.y - 0.2, t.z); d.rotation.set(0, t.r, 0); d.scale.set(sc, sc * (0.8 + u * 0.4), sc); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      col.setHSL(0.24 + u * 0.06, 0.32 + w * 0.12, 0.26 + w * 0.07); m.setColorAt(i, col);
    });
    m.castShadow = shadows; m.computeBoundingSphere(); m.userData.full = list.length; scene.add(m); meshes.push(m);
  }
  return meshes;
}

// Small things that break up the open ground and mark the roads: bushes, stones, and marker posts along the verges.
// None of them stop a car. Bushes and stones are grouped by map block and only drawn near the camera (see `near`).
export function buildProps(world, scene, amount = 1) {
  const { heights, normals, surf, rockT, snowT, roadDist, noise } = world, rnd = rng(world.seed * 53 + 9), q = {}, dry = world.regionDef && world.regionDef.ground === 'desert';
  // a bush: two lumps, dark underneath
  const bush = (() => {
    const f = shaded(), lump = (cx, cy, cz, r, h) => {
      const top = f.v(cx, cy + h, cz, 1.12), n = 7, ph = rnd(), rings = [[0.62, 0.86, 1.05], [1, 0.48, 0.9], [0.8, -0.1, 0.5]].map(([rk, hk, shade], lv) => {
        const ring = []; for (let i = 0; i < n; i++) { const a = (i + ph + lv * 0.5) / n * TAU, k = rk * (0.9 + rnd() * 0.2); ring.push(f.v(cx + Math.sin(a) * r * k, cy + h * hk, cz + Math.cos(a) * r * k, shade)); } return ring; });
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.tri(top, rings[0][i], rings[0][j]); for (let lv = 0; lv < 2; lv++) { const A = rings[lv], B = rings[lv + 1]; f.tri(A[i], B[i], A[j]); f.tri(A[j], B[i], B[j]); } }
    };
    lump(0, 0, 0, 0.8, 0.95); lump(0.62, 0, 0.3, 0.55, 0.62);
    return f.done();
  })();
  // a stone: a squashed, knocked-about ball
  const stone = (() => {
    const g = new THREE.IcosahedronGeometry(0.5, 0), p = g.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) { const key = [p.getX(i), p.getY(i), p.getZ(i)].map((n) => n.toFixed(3)).join(); if (!seen.has(key)) seen.set(key, 0.8 + rnd() * 0.45); const k = seen.get(key); p.setXYZ(i, p.getX(i) * k, Math.max(-0.12, p.getY(i) * k * 0.62), p.getZ(i) * k); }
    g.computeVertexNormals(); return g;
  })();
  const bushM = new THREE.MeshLambertMaterial({ vertexColors: true }), stoneM = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const R = 12, cell = SIZE_ / R, bins = new Map(), bin = (kind, x, z) => { const k = kind + ':' + Math.min(R - 1, ((x + HALF) / cell) | 0) + ':' + Math.min(R - 1, ((z + HALF) / cell) | 0); let l = bins.get(k); if (!l) bins.set(k, l = []); return l; };
  const at = (x, z) => { const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL); return j * V + i; };
  const span = 2 * HALF - 60, fill = (HALF / 1536) ** 2, nBush = Math.round((dry ? 30000 : 46000) * amount * fill), nStone = Math.round((dry ? 34000 : 26000) * amount * fill);   // fill: the same density on a bigger map
  for (let n = 0; n < nBush; n++) {
    const x = (rnd() - 0.5) * span, z = (rnd() - 0.5) * span, v = at(x, z), keep = rnd(), size = rnd(), turn = rnd(), hue = rnd();
    if (surf[v] !== 2 || roadDist[v] < 8.5 || normals[v * 3 + 1] < 0.8 || snowT[v] > 0.05 || world.inTown(x, z)) continue;
    if (noise(x / 90 + 7, z / 90 - 3) + noise(x / 23, z / 23 + 11) * 0.5 < 0.18 + keep * 0.35) continue;      // grows in patches
    bin('b', x, z).push({ x, z, y: world.sample(x, z, q), s: 0.55 + size * 0.95, r: turn * TAU, hue, nx: q.nx, nz: q.nz });
  }
  for (let n = 0; n < nStone; n++) {
    const x = (rnd() - 0.5) * span, z = (rnd() - 0.5) * span, v = at(x, z), keep = rnd(), size = rnd(), turn = rnd(), hue = rnd();
    if (roadDist[v] < 6.5 || snowT[v] > 0.6 || (world.sea != null && heights[v] < world.waterAt(x, z) + 0.5) || world.inTown(x, z)) continue;
    if (keep > 0.1 + rockT[v] * 0.9 + (roadDist[v] < 16 ? 0.25 : 0) + Math.max(0, noise(x / 60 - 9, z / 60 + 4)) * 0.5) continue;   // mostly on rocky ground and verges
    bin('s', x, z).push({ x, z, y: world.sample(x, z, q), s: 0.3 + size * size * 1.1, r: turn * TAU, hue, nx: q.nx, nz: q.nz });
  }
  const d = new THREE.Object3D(), col = new THREE.Color(), near = [];
  for (const [key, list] of bins) {
    const isBush = key[0] === 'b', m = new THREE.InstancedMesh(isBush ? bush : stone, isBush ? bushM : stoneM, list.length);
    list.forEach((t, i) => {
      d.position.set(t.x, t.y - (isBush ? 0.05 : 0.04 * t.s), t.z); d.rotation.set(t.nz * 0.8, t.r, -t.nx * 0.8, 'XZY'); d.scale.set(t.s, t.s * (isBush ? 0.8 + t.hue * 0.5 : 1), t.s); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      if (dry) { if (isBush) col.setHSL(0.14 + t.hue * 0.08, 0.2 + t.hue * 0.1, 0.36 + ((t.s * 3.1) % 1) * 0.1); else col.setHSL(0.03 + t.hue * 0.04, 0.3 + t.hue * 0.15, 0.36 + ((t.s * 7.7) % 1) * 0.16); }
      else if (isBush) col.setHSL(0.2 + t.hue * 0.1, 0.5, 0.27 + ((t.s * 3.1) % 1) * 0.09); else col.setHSL(0.08 + t.hue * 0.04, 0.06 + t.hue * 0.06, 0.34 + ((t.s * 7.7) % 1) * 0.2);
      m.setColorAt(i, col);
    });
    m.computeBoundingSphere(); m.receiveShadow = true; scene.add(m); near.push(m);
  }
  // marker posts down both verges of the paved road, stakes along the trail
  const b = parts(), white = lam(0xe9e6da), band = lam(0x16181b), red = new THREE.MeshBasicMaterial({ color: 0xd8402a }), stake = lam(0x6d5038);
  for (const road of world.roads) {
    const paved = road.surf === SURF.ASPHALT, every = Math.round((paved ? 36 : 60) / road.ds);
    for (let i = road.from + (every >> 1); i <= road.to - 2; i += every) {
      const j = Math.min(road.to, i + 1), tx = road.x[j] - road.x[i], tz = road.z[j] - road.z[i], l = Math.hypot(tx, tz) || 1, lx = tz / l, lz = -tx / l, yaw = Math.atan2(tx, tz);
      for (const side of paved ? [1, -1] : [(i / every) & 1 ? 1 : -1]) {
        const off = road.hw + (paved ? 1.5 : 1.1), x = road.x[i] + lx * side * off, z = road.z[i] + lz * side * off; b.origin(x, world.sample(x, z), z, yaw);
        if (paved) { b.box(0.12, 1.05, 0.05, white, 0, 0.5, 0); b.box(0.125, 0.2, 0.055, band, 0, 0.82, 0); b.box(0.07, 0.11, 0.06, red, 0, 0.82, 0); }
        else b.box(0.1, 0.8, 0.1, stake, 0, 0.36, 0, [0.6, 0.6]);
      }
    }
  }
  b.origin(0, 0, 0, 0); b.into(scene, false, false);
  return near;
}

// The sky: a gradient, the sun with its glow, and slow clouds. A plain copy of it (ground below the horizon, no
// drift) is baked once into the reflection map that car paint, glass and chrome pick up.
const SKY_VERT = 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const mixHex = (a, b, t) => { const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
const SKY_FRAG = `
precision highp float;
varying vec3 d;
uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun; uniform vec3 ground;
uniform float time; uniform float clouds; uniform float env;
uniform vec3 disc0; uniform vec3 cLit; uniform vec3 cShade; uniform float stars; uniform float cover;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
void main() {
  vec3 n = normalize(d);
  float h = max(n.y, 0.0);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.24, h)); c = mix(c, top, smoothstep(0.16, 0.85, h));
  float s = max(dot(n, sun), 0.0);
  c += disc0 * vec3(1.0, 0.88, 0.7) * (pow(s, 6.0) * 0.16 + pow(s, 48.0) * 0.3);
  float disc = smoothstep(0.99945, 0.9998, s);
  if (stars > 0.0 && n.y > 0.0) {   // stars: a fixed scatter of points, fading toward the horizon
    vec2 g = n.xz / (n.y + 0.35) * 160.0; vec2 cell = floor(g); float r = hash(cell);
    float st = step(0.985, r) * smoothstep(0.42, 0.0, length(fract(g) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5));
    c += vec3(0.85, 0.9, 1.0) * st * stars * smoothstep(0.03, 0.3, n.y) * (0.5 + 0.5 * fract(r * 91.7));
  }
  if (clouds > 0.0 && n.y > 0.012) {
    vec2 uv = n.xz / (n.y + 0.14) * 1.25 + vec2(time * 0.005, time * 0.0017);
    float dns = fbm(uv);
    float cov = smoothstep(0.47 - 0.42 * cover, 0.74 - 0.3 * cover, dns) * smoothstep(0.012, 0.17, n.y) * clouds;
    float lit = clamp((dns - fbm(uv + sun.xz * 0.14)) * 3.2 + 0.62, 0.0, 1.0);
    c = mix(c, mix(cShade, cLit, lit), cov * 0.93);
    disc *= 1.0 - cov;
  }
  c += disc0 * disc * 4.0;
  if (env > 0.5) c = mix(ground, c, smoothstep(-0.05, 0.03, n.y));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const SKY = { top: 0x2a6fd6, mid: 0x7db4ee, hor: 0xd7e6f2, fog: 0xcfdfec, ground: 0x4f5a3a, envTop: 0x6a9be0, envMid: 0xa3caf0, light: [0xcfe2ff, 0x5a5340], dust: [0xbfbfbf, 0xb89468, 0x9a9a72, 0xa39a8e, 0xffffff] };
export const SKIES = { mountain: SKY,
  coast: { top: 0x2a72d8, mid: 0x80b8ee, hor: 0xdbe9f3, fog: 0xd3e3ee, ground: 0x4f5a3a, envTop: 0x6a9be0, envMid: 0xa3caf0, light: [0xd2e6ff, 0x55603f], dust: [0xbfbfbf, 0xcdb88e, 0x9a9a72, 0xa39a8e, 0xffffff] },
  desert: { top: 0x2e6fcf, mid: 0x86b8e6, hor: 0xeadcc6, fog: 0xe3d2b8, ground: 0x8a6446, envTop: 0x6f9fde, envMid: 0xb4cbe2, light: [0xd8e4f6, 0x7d5a40], dust: [0xc4b8a8, 0xc29a6a, 0xd2b07e, 0xb07a5a, 0xffffff] } };
// The sea: one wide sheet of water at the region's sea level, out past the horizon.
export function buildSea(world, scene) {
  if (world.sea == null) return null;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x1d6a86, specular: 0x8fb4c8, shininess: 70, transparent: true, opacity: 0.88, depthWrite: false }));
  m.position.y = world.sea; m.renderOrder = 1; scene.add(m);
  return m;
}
// Rivers: a ribbon of water along each river where it runs above the sea (lower down the sea sheet fills the channel),
// with faint streaks drifting downstream.
export function buildRivers(world, scene) {
  if (!world.rivers || !world.rivers.length) return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d'), rnd = rng(911);
  g.fillStyle = '#2b7c8e'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(220,240,245,${0.05 + rnd() * 0.12})`; g.fillRect(rnd() * 64, rnd() * 256, 1 + rnd() * 2, 10 + rnd() * 40); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshPhongMaterial({ map: tex, specular: 0x8fb4c8, shininess: 70, transparent: true, opacity: 0.9, depthWrite: false });
  const group = new THREE.Group();
  for (const rv of world.rivers) {
    let a = 0; while (a < rv.n - 2 && rv.wl[a + 1] <= world.sea + 0.02) a++;
    const pos = [], uv = [], idx = [];
    for (let i = a, k = 0; i < rv.n; i++, k++) {
      const p = Math.max(0, i - 1), q = Math.min(rv.n - 1, i + 1); let tx = rv.x[q] - rv.x[p], tz = rv.z[q] - rv.z[p]; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      const w = rv.hw[i] + 6, y = Math.max(rv.wl[i], world.sea + 0.03), v = i * rv.ds / 18;
      pos.push(rv.x[i] + tz * w, y, rv.z[i] - tx * w, rv.x[i] - tz * w, y, rv.z[i] + tx * w); uv.push(0, v, (2 * w) / 18, v);
      if (i < rv.n - 1) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 1; m.material.side = THREE.DoubleSide; group.add(m);
  }
  let last = performance.now();
  group.children[0].onBeforeRender = () => { const t = performance.now(); tex.offset.y += (t - last) / 1000 * 0.12; last = t; };   // drift towards the sea
  scene.add(group);
  return group;
}

// Bridges: a concrete deck under the road, a low wall along each edge and piers down to the valley floor.
export function buildBridges(world, scene) {
  if (!world.bridges || !world.bridges.length) return null;
  const group = new THREE.Group(), concrete = new THREE.MeshLambertMaterial({ color: 0xa8a49a, side: THREE.DoubleSide }), wallMat = new THREE.MeshLambertMaterial({ color: 0xc9c5ba, side: THREE.DoubleSide });
  const piers = [];
  for (const b of world.bridges) {
    const road = world.roads[b.road], hw = road.hw, deck = [], dIdx = [], wall = [], wIdx = [];
    for (let i = b.i0, k = 0; i <= b.i1; i++, k++) {
      const f = world.frame(road, i), y = f.h + 0.03, L = (d, h) => [f.x + f.lx * d, y + h, f.z + f.lz * d];
      // deck body: left side, bottom, right side
      deck.push(...L(hw + 1.25, -0.85), ...L(hw + 1.25, -1.7), ...L(-hw - 1.25, -1.7), ...L(-hw - 1.25, -0.85));
      // walls: outer face, top, inner face, for each side
      // (where another road joins, that side's wall drops into the deck)
      [1, -1].forEach((sg, side) => { const top = b.open && b.open[side][k] ? -0.95 : 0.85; wall.push(...L(sg * (hw + 1.25), -0.9), ...L(sg * (hw + 1.25), top), ...L(sg * (hw + 0.85), top), ...L(sg * (hw + 0.85), Math.min(top, -0.1))); });
      if (i < b.i1) {
        const d0 = k * 4; for (let s = 0; s < 3; s++) dIdx.push(d0 + s, d0 + s + 1, d0 + s + 4, d0 + s + 1, d0 + s + 5, d0 + s + 4);
        const w0 = k * 8; for (const o of [0, 4]) for (let s = 0; s < 3; s++) wIdx.push(w0 + o + s, w0 + o + s + 1, w0 + o + s + 8, w0 + o + s + 1, w0 + o + s + 9, w0 + o + s + 8);
      }
    }
    for (const [arr, ix, mat] of [[deck, dIdx, concrete], [wall, wIdx, wallMat]]) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geo.setIndex(ix); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; group.add(m);
    }
  }
  piers.push(...(world.piers || []));   // a pier every 26 m where the ground is well below (solid: see terrain.js)
  if (piers.length) {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), inst = new THREE.InstancedMesh(box, concrete, piers.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    piers.forEach((p, k) => { q.setFromAxisAngle(up, p.yaw); m4.compose(new THREE.Vector3(p.x, p.bottom, p.z), q, new THREE.Vector3(p.w, p.top - p.bottom, 1.8)); inst.setMatrixAt(k, m4); });
    inst.castShadow = true; inst.receiveShadow = true; group.add(inst);
  }
  scene.add(group);
  return group;
}
// Towns: each building on a stone plinth that meets the slope, walls and roof in the region's style, windows that
// light up after dark, plus street lamps and a sign at each end. Returns glow(night 0..1) for the windows.
const TOWN_STYLE = {
  mountain: { walls: [0x8a6a4a, 0xa88a62, 0xcbbca4, 0x76583c, 0xb9a88a], roofs: [0x3b3f45, 0x5a2e24, 0x34402f], pitch: 0.75, plinth: 0x77736b },
  desert: { walls: [0xc9a27a, 0xd8b48c, 0xb88a62, 0xe2cba6, 0xc79070], roofs: [0x9a7556, 0xb08a64, 0x7d5f48], pitch: 0, plinth: 0x9a7a5c },
  coast: { walls: [0xefebe2, 0xd9e4ea, 0xf0d9c4, 0xcfe0d2, 0xece2b8], roofs: [0x9b3a2a, 0x2f4f6f, 0x5a5f66], pitch: 0.5, plinth: 0x8c8a84 },
};
function gable(w, d, rh, over = 0.35) {   // a roof: ridge along x, eaves overhanging by `over`
  const x = w / 2 + over, z = d / 2 + over, p = [];
  const tri = (a, b, c) => p.push(...a, ...b, ...c), quad = (a, b, c, e) => { tri(a, b, c); tri(a, c, e); };
  const A = [-x, 0, z], B = [x, 0, z], C = [x, rh, 0], D = [-x, rh, 0], E = [-x, 0, -z], F = [x, 0, -z];
  quad(A, B, C, D); quad(F, E, D, C); tri(E, A, D); tri(B, F, C); quad(E, F, B, A);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
}
export function buildTowns(world, scene) {
  if (!world.towns || !world.towns.length) return null;
  const st = TOWN_STYLE[world.regionDef.ground] || TOWN_STYLE.mountain, b = parts(), mats = new Map();
  const M = (hex) => { let m = mats.get(hex); if (!m) mats.set(hex, m = lam(hex)); return m; };
  const win = new THREE.MeshLambertMaterial({ color: 0x26313b, emissive: 0xffc870, emissiveIntensity: 0 }), door = M(0x4a3426), glass = win;
  const awnings = [0xb3261e, 0x2f6fb5, 0x2f7a4a, 0xd9a02a], pole = M(0x4a5057), lampM = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  for (const t of world.towns) {
    for (const o of t.buildings) {
      const wall = M(st.walls[Math.floor(o.wall * st.walls.length)]), roof = M(st.roofs[Math.floor(o.roof * st.roofs.length)]), y0 = o.hi;
      b.origin(o.x, 0, o.z, o.yaw);
      b.box(o.w + 0.3, y0 - o.lo + 0.8, o.d + 0.3, M(st.plinth), 0, (y0 + o.lo - 0.8) / 2 + 0.05, 0);
      b.box(o.w, o.h, o.d, wall, 0, y0 + o.h / 2, 0);
      const flat = !st.pitch || o.kind === 'shop' || o.kind === 'tall';
      if (flat) { b.box(o.w + 0.25, 0.5, o.d + 0.25, roof, 0, y0 + o.h + 0.2, 0); }
      else b.add(gable(o.w, o.d, Math.min(o.d, 9) * st.pitch * 0.5), roof, 0, y0 + o.h, 0);
      const front = o.d / 2 + 0.04, floors = Math.max(1, Math.round(o.h / 3)), cols = Math.max(1, Math.floor(o.w / 2.8));
      for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols * o.w - o.w / 2, yy = y0 + 1.6 + f * 2.9;
        if (f === 0 && o.kind === 'shop') continue;
        if (f === 0 && c === Math.floor(cols / 2) && o.kind !== 'shed') { b.box(1.1, 2.1, 0.1, door, x, y0 + 1.05, front); continue; }
        if (o.kind === 'shed' && f === 0) { if (c === 0) b.box(Math.min(3.4, o.w * 0.5), 2.6, 0.1, door, 0, y0 + 1.3, front); continue; }
        b.box(1.1, 1.25, 0.1, win, x, yy, front); b.box(1.1, 1.25, 0.1, win, x, yy, -front);
      }
      if (o.kind === 'shop') {
        b.box(o.w * 0.8, 2.2, 0.1, glass, 0, y0 + 1.4, front);
        b.box(o.w * 0.9, 0.12, 1.6, M(awnings[Math.floor(o.seed * awnings.length)]), 0, y0 + 2.9, front + 0.8, null, 0.18, 0, 0);
        b.box(o.w * 0.7, 0.7, 0.12, M(awnings[Math.floor(o.seed * 7) % awnings.length]), 0, y0 + o.h - 0.5, front + 0.02);
      }
      if (o.kind === 'tall' && st.pitch) b.box(o.w + 0.4, 0.3, o.d + 0.4, roof, 0, y0 + o.h + 0.55, 0);
    }
    for (const l of t.lamps) {
      b.origin(l.x, l.y, l.z, l.yaw);
      b.cyl(0.1, 0.13, 6.2, 6, pole, 0, 3.1, 0); b.box(0.12, 0.12, 1.6, pole, 0, 6.1, 0.75); b.box(0.42, 0.14, 0.7, lampM, 0, 6.0, 1.45);
    }
    const tex = signTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#2d5f3e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f3efe4'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = '#f3efe4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 44px ${FONT}`; g.fillText('WELCOME TO', w / 2, 78);
      let size = 92; g.font = `700 ${size}px ${FONT}`; const tw = g.measureText(t.name.toUpperCase()).width; if (tw > w - 70) { size *= (w - 70) / tw; g.font = `700 ${size}px ${FONT}`; }
      g.fillText(t.name.toUpperCase(), w / 2, 165);
    });
    const face = new THREE.MeshBasicMaterial({ map: tex }), back = M(0x2d5f3e);
    for (const sg of t.signs) {
      b.origin(sg.x, sg.y, sg.z, sg.yaw);
      for (const x of [-1.5, 1.5]) b.box(0.14, 2.6, 0.14, pole, x, 1.3, -0.05);
      b.box(3.7, 1.9, 0.1, back, 0, 2.4, -0.06); b.plane(3.6, 1.8, face, 0, 2.4, 0.01);
    }
  }
  const made = b.into(scene, true, true);
  return { meshes: made, glow: (night) => { win.emissiveIntensity = night > 0.25 ? Math.min(0.9, (night - 0.25) * 1.6) : 0; } };
}
export function buildSky(scene, renderer, sunDir, SKY = SKIES.mountain) {
  const uni = (env) => ({ top: { value: new THREE.Color(env ? SKY.envTop : SKY.top) }, mid: { value: new THREE.Color(env ? SKY.envMid : SKY.mid) }, hor: { value: new THREE.Color(SKY.hor) }, ground: { value: new THREE.Color(SKY.ground) },
    sun: { value: sunDir.clone() }, time: { value: 0 }, clouds: { value: 1 }, env: { value: env },
    disc0: { value: new THREE.Color().setRGB(1.0, 0.93, 0.78, THREE.LinearSRGBColorSpace) }, cLit: { value: new THREE.Color().setRGB(1.0, 0.985, 0.95, THREE.LinearSRGBColorSpace) },
    cShade: { value: new THREE.Color().setRGB(0.56, 0.63, 0.74, THREE.LinearSRGBColorSpace) }, stars: { value: 0 }, cover: { value: 0 } });
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni(0), vertexShader: SKY_VERT, fragmentShader: SKY_FRAG });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), mat); dome.frustumCulled = false; dome.renderOrder = -1; scene.add(dome);
  // The reflection map is handed to the car materials only. Set on the whole scene it would also light the ground
  // and trees a second time, in blue.
  const envMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: uni(1), vertexShader: SKY_VERT, fragmentShader: SKY_FRAG });
  const envScene = new THREE.Scene(), ball = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), envMat); envScene.add(ball);
  const pm = new THREE.PMREMGenerator(renderer); let envRT = pm.fromScene(envScene, 0, 0.1, 100);
  // glass gets a plain mirror picture of the same sky: no sun glare smeared across a window, just the reflection
  const mirror = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }), cubeCam = new THREE.CubeCamera(0.1, 100, mirror);
  cubeCam.update(renderer, envScene);
  const sky = { dome, env: envRT.texture, mirror: mirror.texture, time: mat.uniforms.time };
  // a new look (time of day): set both skies' colours, then call bake() to redraw the reflections
  sky.set = (L) => {
    for (const m of [mat, envMat]) {
      const u = m.uniforms, e = u.env.value > 0.5;
      u.top.value.setHex(e ? (L.envTop ?? L.top) : L.top); u.mid.value.setHex(e ? (L.envMid ?? L.mid) : L.mid); u.hor.value.setHex(L.hor);
      u.sun.value.set(L.dir[0], L.dir[1], L.dir[2]); u.disc0.value.setHex(L.disc, THREE.LinearSRGBColorSpace); u.cLit.value.setHex(L.cl, THREE.LinearSRGBColorSpace); u.cShade.value.setHex(L.cs, THREE.LinearSRGBColorSpace);
      u.stars.value = e ? 0 : L.stars * (1 - (L.cover || 0)); u.cover.value = L.cover || 0; u.ground.value.setHex(mixHex(SKY.ground, 0x000000, L.night * 0.7));
    }
  };
  // redraw the car reflections; returns the new reflection map (the old one is thrown away)
  sky.bake = () => { const old = envRT; envRT = pm.fromScene(envScene, 0, 0.1, 100); cubeCam.update(renderer, envScene); sky.env = envRT.texture; return { old: old.texture, dispose: () => old.dispose() }; };
  return sky;
}

// Falling weather: rain streaks, snowflakes or blowing dust in a box that moves with the camera. One draw call; the
// points wrap round inside the box in the vertex shader, so nothing is updated on the CPU but a few numbers.
const FALL_VERT = `
uniform float time; uniform vec3 cam; uniform vec3 vel; uniform float size; uniform float box; uniform float wobble;
varying float vA;
void main() {
  vec3 p = position * box + vel * time * (0.75 + 0.5 * fract(position.x * 37.0));
  p.x += sin(time * 1.3 + position.z * 40.0) * wobble; p.z += cos(time * 1.1 + position.x * 40.0) * wobble;
  p = mod(p - cam + 0.5 * box, box) - 0.5 * box + cam;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z; gl_PointSize = clamp(size * 300.0 / max(d, 0.5), 1.0, 64.0);
  vA = smoothstep(0.5 * box, 0.25 * box, d) * smoothstep(0.6, 2.0, d);
}`;
const FALL_FRAG = `
uniform vec3 color; uniform float opacity; uniform float kind;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float a;
  if (kind < 0.5) a = (1.0 - smoothstep(0.012, 0.035, abs(c.x))) * (1.0 - smoothstep(0.3, 0.5, abs(c.y)));   // rain: a thin streak
  else if (kind < 1.5) a = 1.0 - smoothstep(0.22, 0.5, length(c));                                          // snow: a soft flake
  else a = (1.0 - smoothstep(0.0, 0.5, length(c))) * 0.6;                                                  // dust: a faint puff
  a *= opacity * vA; if (a < 0.01) discard;
  gl_FragColor = vec4(color, a);
}`;
export const FALL_KINDS = {
  rain: { kind: 0, vel: [1.5, -22, 0.8], size: 1.2, box: 40, wobble: 0, color: 0xd8e0ea, opacity: 0.42 },
  snow: { kind: 1, vel: [1.2, -2.2, 0.6], size: 0.3, box: 34, wobble: 0.7, color: 0xffffff, opacity: 0.95 },
  dust: { kind: 2, vel: [14, -0.4, 6], size: 2.2, box: 50, wobble: 1.5, color: 0xe0bd8c, opacity: 0.3 },
};
export function buildFall(scene, count) {
  const pos = new Float32Array(count * 3); for (let i = 0; i < pos.length; i++) pos[i] = Math.random();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const u = { time: { value: 0 }, cam: { value: new THREE.Vector3() }, vel: { value: new THREE.Vector3() }, size: { value: 1 }, box: { value: 50 }, wobble: { value: 0 }, color: { value: new THREE.Color() }, opacity: { value: 0 }, kind: { value: 0 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, fog: false }));
  pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 3; scene.add(pts);
  let shown = null;
  return {
    // every frame: which kind (or null), how strong 0..1, the camera, the time, the scene light (to darken at night)
    update(kind, amt, cam, t, light) {
      const K = FALL_KINDS[kind]; pts.visible = !!K && amt > 0.01; if (!pts.visible) return;
      if (shown !== kind) { shown = kind; u.kind.value = K.kind; u.vel.value.set(...K.vel); u.size.value = K.size; u.box.value = K.box; u.wobble.value = K.wobble; }
      u.color.value.setHex(K.color).multiplyScalar(0.35 + 0.65 * light); u.opacity.value = K.opacity * amt; u.cam.value.copy(cam); u.time.value = t;
    },
    get count() { return count; },
  };
}

// Shack, crates and lamp at each smuggling site (all sites share four meshes).
export function buildSites(sites, scene) {
  const wood = lam(0x6d5038), roof = lam(0x8c3a2b), crate = lam(0xb48a4e), dark = lam(0x2a2520), b = parts();
  for (const s of sites) {
    b.origin(s.hutX, s.hutY - 0.25, s.hutZ, s.yaw);
    b.box(3.6, 2.6, 3.0, wood, 0, 1.3, 0);
    b.add(new THREE.ConeGeometry(3.3, 1.5, 4), roof, 0, 3.35, 0, 0, Math.PI / 4);
    b.box(0.9, 1.7, 0.08, dark, 0.6, 0.85, 1.52);
    b.box(0.9, 0.9, 0.9, crate, -2.7, 0.45, 0.6, null, 0, 0.3); b.box(0.9, 0.9, 0.9, crate, -2.9, 0.45, -0.6, null, 0, -0.2); b.box(0.8, 0.8, 0.8, crate, -2.8, 1.3, 0.05, null, 0, 0.6);
  }
  b.into(scene, true, true);
}

// Workshop building at each garage. Its front (local +z) faces the road and the parking spot.
export function buildGarages(garages, scene) {
  const wall = lam(0xb9b2a4), roof = lam(0x3a3f45), door = lam(0x8d949b), dark = lam(0x14171a), blue = lam(0x2f6fb5), tyre = lam(0x1b1c1e), drum = lam(0xb3261e), pole = lam(0x4a5057), lampM = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const b = parts();
  for (const g of garages) {
    b.origin(g.bx, g.by - 0.3, g.bz, g.byaw);
    b.box(20, 4.6, 9, wall, 0, 2.3, 0);
    b.box(21, 0.35, 10.2, roof, 0, 4.78, 0.2);
    b.box(20.1, 1.25, 0.25, blue, 0, 4.0, 4.5);                                   // sign band
    for (const [x, open] of [[-6.4, false], [0, true], [6.4, false]]) {
      b.box(4.9, 3.25, 0.2, dark, x, 1.62, 4.46);
      if (!open) { b.box(4.5, 3.0, 0.12, door, x, 1.5, 4.56); for (let k = 0; k < 5; k++) b.box(4.5, 0.05, 0.05, dark, x, 0.5 + k * 0.55, 4.64); }
      else b.box(4.5, 0.7, 0.12, door, x, 2.75, 4.56);                            // half-raised shutter
    }
    for (const [x, z, n] of [[-9.2, 5.6, 4], [-8.2, 5.9, 2], [9.3, 5.5, 3]]) for (let k = 0; k < n; k++) b.cyl(0.42, 0.42, 0.28, 12, tyre, x, 0.14 + k * 0.28, z);   // tyre stacks
    b.cyl(0.32, 0.32, 0.95, 10, drum, 8.2, 0.47, 5.7); b.cyl(0.32, 0.32, 0.95, 10, blue, 7.5, 0.47, 5.9);
    for (const x of [-11.5, 11.5]) { b.box(0.22, 6, 0.22, pole, x, 3, 6.5); b.box(0.22, 0.22, 1.6, pole, x, 5.9, 7.2); b.box(0.5, 0.12, 0.7, lampM, x, 5.76, 7.75); }   // yard lamps
    b.plane(13, 1.0, new THREE.MeshBasicMaterial({ map: banner(g.name.toUpperCase(), '#2f6fb5', '#f3efe4') }), 0, 4.0, 4.64);
  }
  b.into(scene, true, true);
}

// Start and finish arches over the road, a chequered line on the ground, and the sign at the time trial start.
export function buildLines(world, scene, races) {
  const post = lam(0x30353b), truss = lam(0x4a5057), b = parts(), L = world.places.lines, T = world.places.trial;
  const cheq = signTexture(256, 32, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#f3efe4' : '#101214'; g.fillRect(i * 16, j * 16, 16, 16); } });
  const cheqM = new THREE.MeshBasicMaterial({ map: cheq, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const name = (id) => races.find((r) => r.base === id).name.toUpperCase();
  const arch = (x, y, z, yaw, span, text, colour, line) => {
    b.origin(x, y, z, yaw);
    for (const sx of [1, -1]) { b.box(0.5, 6.4, 0.5, post, sx * span, 3.2, 0); b.box(1.1, 0.3, 1.1, post, sx * span, 0.15, 0); }
    b.box(2 * span + 0.5, 0.16, 0.5, truss, 0, 6.3, 0); b.box(2 * span + 0.5, 0.16, 0.5, truss, 0, 5.1, 0);
    const m = new THREE.MeshBasicMaterial({ map: banner(text, colour, '#f3efe4') });
    b.plane(2 * span - 0.6, 1.04, m, 0, 5.7, 0.27); b.plane(2 * span - 0.6, 1.04, m, 0, 5.7, -0.27, 0, Math.PI);
    if (line) b.add(new THREE.PlaneGeometry(2 * line, 1.5).rotateX(-Math.PI / 2), cheqM, 0, 0.07, 0);
  };
  arch(L.ring.x, L.ring.y, L.ring.z, L.ring.yaw, L.ring.hw + 1.7, name('ring'), '#5b3fa8', L.ring.hw);
  arch(L.dashStart.x, L.dashStart.y, L.dashStart.z, L.dashStart.yaw, L.dashStart.hw + 1.7, name('dash') + ' START · ' + name('descent') + ' FINISH', '#5b3fa8', L.dashStart.hw);
  arch(L.dashEnd.x, L.dashEnd.y, L.dashEnd.z, L.dashEnd.yaw, L.dashEnd.hw + 1.7, name('dash') + ' FINISH · ' + name('descent') + ' START', '#5b3fa8', L.dashEnd.hw);
  if (L.outer && races.some((r) => r.base === 'outer')) arch(L.outer.x, L.outer.y, L.outer.z, L.outer.yaw, L.outer.hw + 1.7, name('outer'), '#5b3fa8', L.outer.hw);
  // the time trial's board stands at the back of its pull-in, clear of where the car waits
  b.origin(T.x - Math.sin(T.yaw) * 9, T.y, T.z - Math.cos(T.yaw) * 9, T.yaw);
  for (const sx of [1, -1]) b.box(0.3, 4.2, 0.3, post, sx * 3.6, 2.1, 0);
  const tm = new THREE.MeshBasicMaterial({ map: banner(name('scramble'), '#5b3fa8', '#f3efe4') });
  b.box(7.5, 1.3, 0.14, truss, 0, 3.5, 0); b.plane(7.2, 1.0, tm, 0, 3.5, 0.08); b.plane(7.2, 1.0, tm, 0, 3.5, -0.08, 0, Math.PI);
  b.into(scene, true, true);
}

// Tall light column + ground ring that marks a place to stop (or a checkpoint) from far away.
let beamTex = null;
export function makeBeam(color, r = 9) {
  if (!beamTex) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#555'); gr.addColorStop(1, '#fff'); x.fillStyle = gr; x.fillRect(0, 0, 4, 128);
    beamTex = new THREE.CanvasTexture(c);
  }
  const g = new THREE.Group(), col = new THREE.CylinderGeometry(r, r, 120, 28, 1, true); col.translate(0, 60, 0);
  const beam = new THREE.Mesh(col, new THREE.MeshBasicMaterial({ color, alphaMap: beamTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  const ringG = new THREE.TorusGeometry(r, 0.2, 6, 48); ringG.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color, fog: false })); ring.position.y = 0.35;
  beam.frustumCulled = false; beam.renderOrder = 5; g.add(beam, ring); g.visible = false; g.userData.beam = beam; g.userData.ring = ring;
  return g;
}

// ---- hidden finds (see finds.js) ----
// A crate with a little flag on a pole, one group per crate so a found one can be taken away.
export function buildCrates(crates, scene) {
  const wood = lam(0xb48a4e), slat = lam(0x7a5530), pole = lam(0x4a5057), flag = new THREE.MeshBasicMaterial({ color: 0xf2b33d, side: THREE.DoubleSide });
  return crates.map((c) => {
    const b = parts(), g = new THREE.Group();
    b.origin(0, 0, 0, 0);
    b.box(1.2, 1.2, 1.2, wood, 0, 0.6, 0);
    for (const y of [0.15, 1.05]) { b.box(1.24, 0.12, 1.24, slat, 0, y, 0); }
    b.box(0.12, 1.24, 1.24, slat, 0, 0.6, 0); b.box(1.24, 1.24, 0.12, slat, 0, 0.6, 0);
    b.cyl(0.04, 0.04, 3.2, 6, pole, 0.45, 1.6, 0.45);
    b.add(new THREE.PlaneGeometry(0.9, 0.55), flag, 0.92, 2.9, 0.45);
    b.into(g, true, false);
    g.position.set(c.x, c.y - 0.05, c.z); g.rotation.y = c.i * 1.3; scene.add(g);
    return g;
  });
}

// The old shed the hidden car waits in: three plank walls, a sagging tin roof, open toward the way in (local +z).
export function buildBarn(barn, scene) {
  const plank = lam(0x6b5640), dark = lam(0x3d3127), tin = lam(0x8a8f8c), rust = lam(0x8c5a3a), hay = lam(0xc9b06a), b = parts();
  b.origin(barn.x, barn.y - 0.2, barn.z, barn.yaw);
  const W = 3.1, D = 3.8, H = 3.0;
  b.box(0.18, H, 2 * D, plank, -W, H / 2, 0); b.box(0.18, H, 2 * D, plank, W, H / 2, 0); b.box(2 * W + 0.18, H, 0.18, plank, 0, H / 2, -D);
  for (const x of [-W, W]) for (const z of [-D, 0, D]) b.box(0.3, H + 0.3, 0.3, dark, x, (H + 0.3) / 2, z);
  b.box(2 * W + 1.2, 0.08, 2 * D + 1.4, tin, 0, H + 0.45, 0.3, null, 0.06, 0, 0);
  b.box(1.6, 0.06, 2.2, rust, 1.2, H + 0.52, -1.2, null, 0.06, 0, 0);
  b.box(1.1, 0.8, 1.6, hay, -W + 0.8, 0.4, -D + 1.1); b.box(1.1, 0.8, 1.6, hay, -W + 0.8, 1.2, -D + 1.1, null, 0, 0.2, 0);
  b.box(0.08, 2.4, 3.2, plank, W + 1.1, 1.2, D + 0.9, null, 0, 0.5, 0.06);       // a door that came off and leans outside
  b.into(scene, true, true);
}

// A wooden kicker ramp laid over the ground (its height comes from the world's own ground query), with orange posts at the lip.
export function buildRamps(world, ramps, scene, RAMP) {
  const tex = signTexture(64, 256, (g, w, h) => { g.fillStyle = '#9b7a50'; g.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#8a6a44' : '#a8865a'; g.fillRect(0, i * 16, w, 15); g.fillStyle = '#5a4430'; g.fillRect(0, i * 16 + 15, w, 1); } });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const face = new THREE.MeshLambertMaterial({ map: tex }), post = lam(0xe0662a), white = lam(0xf3efe4), b = parts();
  const L = RAMP.len + RAMP.top + RAMP.back, Wd = RAMP.half + RAMP.bevel, nu = Math.ceil(L / 0.5), nv = 12;
  for (const r of ramps) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = (i / nu) * L, v = (j / nv - 0.5) * 2 * Wd, x = r.x + r.fx * u + r.fz * v, z = r.z + r.fz * u - r.fx * v;
      pos.push(x, world.sample(x, z) + 0.04, z); uv.push(v / 4, u / 4);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, c = a + nv + 1; idx.push(a, a + 1, c, a + 1, c + 1, c); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    // make sure the face is front-facing from above
    const n = geo.attributes.normal; if (n.getY(Math.floor(n.count / 2)) < 0) { idx.reverse(); geo.setIndex(idx); geo.computeVertexNormals(); }
    const m = new THREE.Mesh(geo, face); m.receiveShadow = true; m.castShadow = true; scene.add(m);
    for (const s of [-1, 1]) {
      const x = r.x + r.fx * RAMP.len + r.fz * s * (RAMP.half + 0.6), z = r.z + r.fz * RAMP.len - r.fx * s * (RAMP.half + 0.6), y = world.sample(x, z);
      b.origin(x, y, z, r.yaw); b.box(0.22, 1.6, 0.22, post, 0, 0.8, 0); b.box(0.24, 0.25, 0.24, white, 0, 1.25, 0);
      const fx = r.x - r.fx * 3 + r.fz * s * (RAMP.half + 0.4), fz = r.z - r.fz * 3 - r.fx * s * (RAMP.half + 0.4);
      b.origin(fx, world.sample(fx, fz), fz, r.yaw); b.box(0.16, 1.0, 0.16, post, 0, 0.5, 0); b.box(0.18, 0.18, 0.18, white, 0, 0.8, 0);
    }
  }
  b.into(scene, true, false);
}

// speed trap cameras: a dark post beside the road with a yellow camera box looking along it, and a white line across
export function buildTraps(world, traps, scene) {
  const post = lam(0x2b2f34), yellow = lam(0xf2c230), dark = lam(0x14171a), white = lam(0xf3efe4), b = parts();
  for (const t of traps) {
    const yaw = Math.atan2(t.fx, t.fz), side = 7.2, x = t.x + t.fz * side, z = t.z - t.fx * side;
    b.origin(x, world.sample(x, z), z, yaw); b.box(0.22, 4.4, 0.22, post, 0, 2.2, 0); b.box(0.75, 0.6, 1.0, yellow, -0.3, 4.2, 0); b.box(0.5, 0.36, 0.1, dark, -0.3, 4.2, 0.52); b.box(0.5, 0.36, 0.1, dark, -0.3, 4.2, -0.52);
    for (let k = -4; k <= 4; k++) { const lx = t.x + t.fz * k * 0.9, lz = t.z - t.fx * k * 0.9; b.origin(lx, world.sample(lx, lz) + 0.035, lz, yaw); b.box(0.85, 0.02, 0.32, white, 0, 0, 0); }
  }
  b.into(scene, true, false);
}
