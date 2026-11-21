// Tyre marks: dark strips left on the ground by sliding wheels, and tracks pressed into dirt, sand and snow by every
// rolling wheel. One mesh holds a ring of short quads; when it is full the oldest marks are reused, so the cost never
// grows, and only the quads added since the last frame are sent to the graphics card.
import * as THREE from 'three';

export const SKID = { n: 6000, width: 0.26, minSlip: 0.32, step: 0.45, track: 1.0, lift: 0.035 };
const COL = { 0: [0.02, 0.02, 0.025], 1: [0.12, 0.07, 0.035], 2: [0.035, 0.06, 0.015], 3: [0.08, 0.072, 0.06], 4: [0.36, 0.4, 0.46] };   // by surface (linear colour: small numbers are already mid tones on screen)

export function createSkids(scene) {
  const N = SKID.n, pos = new Float32Array(N * 4 * 3), col = new Float32Array(N * 4 * 3), idx = new Uint32Array(N * 6);
  for (let i = 0; i < N; i++) { const v = i * 4, o = i * 6; idx[o] = v; idx[o + 1] = v + 2; idx[o + 2] = v + 1; idx[o + 3] = v + 1; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 3); pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('color', ca); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.68, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  let next = 0, dirty = false, count = 0, lo = N, hi = -1;   // lo..hi: quads changed since the last upload
  const last = new Map();      // wheel key -> { x, y, z, lx, lz } where its current mark got to
  // one wheel this step: on (sliding and on the ground), contact point p, sideways unit (sx, sz), surface
  function wheel(key, on, p, sx, sz, surf, step = SKID.step) {
    if (!on) { last.delete(key); return; }
    const y = p.y + SKID.lift, prev = last.get(key), hw = SKID.width / 2;
    if (!prev) { last.set(key, { x: p.x, y, z: p.z, lx: sx, lz: sz }); return; }
    const d = Math.hypot(p.x - prev.x, p.z - prev.z);
    if (d < step) return;
    if (d > 4) { last.set(key, { x: p.x, y, z: p.z, lx: sx, lz: sz }); return; }   // jumped (reset or teleport): start again
    const v = next * 4 * 3, c = COL[surf] || COL[0];
    pos.set([prev.x + prev.lx * hw, prev.y, prev.z + prev.lz * hw, prev.x - prev.lx * hw, prev.y, prev.z - prev.lz * hw, p.x + sx * hw, y, p.z + sz * hw, p.x - sx * hw, y, p.z - sz * hw], v);
    for (let k = 0; k < 4; k++) col.set(c, v + k * 3);
    lo = Math.min(lo, next); hi = Math.max(hi, next);
    next = (next + 1) % N; count = Math.min(N, count + 1); dirty = true;
    last.set(key, { x: p.x, y, z: p.z, lx: sx, lz: sz });
  }
  // one car's wheels: on dirt, sand, gravel and snow every rolling wheel leaves a track; on tarmac only a sliding one
  // marks (the back wheels sooner, and with the handbrake on; the front ones when they skid or spin)
  function car(c, key, handbrake) {
    const sx = c.left.x, sz = c.left.z, l = Math.hypot(sx, sz) || 1;
    for (let i = 0; i < 4; i++) {
      const w = c.wheels[i], rear = i >= 2; if (!w.onGround) { wheel(key + i, false); continue; }
      const slide = c.speed > 3 && (w.slip > SKID.minSlip * (rear ? 1 : 1.25) || (rear && handbrake && c.speed > 6));
      const soft = w.surf !== 0 && c.speed > 1.5;
      wheel(key + i, slide || soft, w.hit, sx / l, sz / l, w.surf, slide ? SKID.step : SKID.track);
    }
  }
  function flush() {
    if (!dirty) return;
    for (const a of [pa, ca]) { a.clearUpdateRanges(); if (hi >= lo) a.addUpdateRange(lo * 12, (hi - lo + 1) * 12); a.needsUpdate = true; }
    dirty = false; lo = N; hi = -1;
  }
  function clear() { pos.fill(0); next = 0; count = 0; last.clear(); dirty = true; lo = 0; hi = N - 1; flush(); }
  return { wheel, car, flush, clear, mesh, get count() { return count; } };
}
