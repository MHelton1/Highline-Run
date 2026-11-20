// Tyre marks: dark strips left on the ground by sliding rear wheels. One mesh holds a ring of short quads; when it is
// full the oldest marks are reused, so the cost never grows.
import * as THREE from 'three';

export const SKID = { n: 1400, width: 0.26, minSlip: 0.32, step: 0.45, lift: 0.035 };
const COL = { 0: [0.02, 0.02, 0.025], 1: [0.32, 0.22, 0.13], 2: [0.18, 0.2, 0.1], 3: [0.22, 0.2, 0.18], 4: [0.55, 0.58, 0.62] };   // by surface

export function createSkids(scene) {
  const N = SKID.n, pos = new Float32Array(N * 4 * 3), col = new Float32Array(N * 4 * 3), idx = new Uint32Array(N * 6);
  for (let i = 0; i < N; i++) { const v = i * 4, o = i * 6; idx[o] = v; idx[o + 1] = v + 2; idx[o + 2] = v + 1; idx[o + 3] = v + 1; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 3); pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('color', ca); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.68, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  let next = 0, dirty = false, count = 0;
  const last = new Map();      // wheel key -> { x, y, z, lx, lz } where its current mark got to
  // one wheel this step: on (sliding and on the ground), contact point p, sideways unit (sx, sz), surface
  function wheel(key, on, p, sx, sz, surf) {
    if (!on) { last.delete(key); return; }
    const y = p.y + SKID.lift, prev = last.get(key), hw = SKID.width / 2;
    if (!prev) { last.set(key, { x: p.x, y, z: p.z, lx: sx, lz: sz }); return; }
    const d = Math.hypot(p.x - prev.x, p.z - prev.z);
    if (d < SKID.step) return;
    if (d > 4) { last.set(key, { x: p.x, y, z: p.z, lx: sx, lz: sz }); return; }   // jumped (reset or teleport): start again
    const v = next * 4 * 3, c = COL[surf] || COL[0];
    pos.set([prev.x + prev.lx * hw, prev.y, prev.z + prev.lz * hw, prev.x - prev.lx * hw, prev.y, prev.z - prev.lz * hw, p.x + sx * hw, y, p.z + sz * hw, p.x - sx * hw, y, p.z - sz * hw], v);
    for (let k = 0; k < 4; k++) col.set(c, v + k * 3);
    next = (next + 1) % N; count = Math.min(N, count + 1); dirty = true;
    last.set(key, { x: p.x, y, z: p.z, lx: sx, lz: sz });
  }
  // the player's rear wheels (and the handbrake makes marks sooner)
  function car(c, key, handbrake) {
    const sx = c.left.x, sz = c.left.z, l = Math.hypot(sx, sz) || 1;
    for (const i of [2, 3]) {
      const w = c.wheels[i], on = w.onGround && c.speed > 3 && (w.slip > SKID.minSlip || (handbrake && c.speed > 6));
      wheel(key + i, on, w.hit, sx / l, sz / l, w.surf);
    }
  }
  function flush() { if (!dirty) return; pa.needsUpdate = true; ca.needsUpdate = true; dirty = false; }
  function clear() { pos.fill(0); next = 0; count = 0; last.clear(); dirty = true; flush(); }
  return { wheel, car, flush, clear, mesh, get count() { return count; } };
}
