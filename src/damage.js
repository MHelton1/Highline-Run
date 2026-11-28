// Crash damage (build 39; menu switch saved as `damage`, on by default; never in kid mode or for the second player).
// A hard knock dents the body where it landed, a bad one at the front breaks the headlights, and the car loses some
// pull and drifts a little to one side as damage builds up. Garages repair it for a fee. The amount (0..1) is kept
// per car in the save (cars[id].dmg); dents are redrawn from it when the model is built again.
import * as THREE from 'three';

export const DMG = { min: 7, per: 1 / 45, depth: 0.012, maxDepth: 0.15, radius: 0.8, lights: 0.4, power: 0.18, pull: 0.06, cost: 1800 };
export const repairCost = (dmg) => Math.max(50, Math.round(dmg * DMG.cost / 50) * 50);

// how much a knock (closing speed, m/s) adds
export const knock = (impact) => Math.max(0, Math.min(0.5, (impact - DMG.min) * DMG.per));

// push the body's vertices near a point (in the car's own frame) in toward the middle of the car
export function dent(vis, lx, ly, lz, depth) {
  const p = new THREE.Vector3(), q = new THREE.Vector3(), inv = new THREE.Matrix4(), R = DMG.radius;
  vis.body.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4().copy(vis.body.matrixWorld).invert();
  vis.body.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
    const pos = m.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(toBody, m.matrixWorld); inv.copy(M).invert();
    q.set(lx, ly, lz).applyMatrix4(inv);              // the knock in this mesh's own frame
    const c = new THREE.Vector3(0, ly, 0).applyMatrix4(inv);   // the car's middle at that height
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const d = p.distanceTo(q); if (d > R) continue;
      const k = depth * (1 - d / R) ** 2, dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz) || 1;
      pos.setXYZ(i, p.x + dx / l * k, p.y - k * 0.35, p.z + dz / l * k); moved = true;
    }
    if (moved) { pos.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere(); }
  });
}

// broken headlights: the car's lamp glass goes dark (a copy of the shared material, so other cars keep theirs)
export function breakLights(vis) {
  if (vis.lightsOut) return; vis.lightsOut = true;
  vis.body.traverse((m) => { if (m.isMesh && m.material && m.material.isMeshBasicMaterial && m.material.color && m.material.color.r > 1.5) { m.material = m.material.clone(); m.material.color.setRGB(0.18, 0.18, 0.2); } });
}

// a freshly built model for a damaged car: dents spread round it in proportion to the damage, the same every time
export function redent(vis, dmg, box) {
  if (!(dmg > 0.02)) return;
  const spots = [[1, 0.9], [-1, 0.95], [0.6, -0.95], [-0.7, -0.9], [1, 0.1], [-1, -0.2]];
  const n = Math.min(spots.length, Math.ceil(dmg * 8));
  for (let i = 0; i < n; i++) { const [sx, sz] = spots[i]; dent(vis, sx * box.x, 0.45, sz * box.z, Math.min(DMG.maxDepth, 0.04 + dmg * 0.12)); }
  if (dmg > DMG.lights) breakLights(vis);
}

// what the driver's input becomes in a damaged car: less pull, and a slight drift to one side once it is moving
export function damagedInput(inp, dmg, speed) {
  if (!(dmg > 0.02)) return inp;
  const steer = Math.max(-1, Math.min(1, inp.steer + DMG.pull * dmg * Math.min(1, speed / 12)));
  return { ...inp, throttle: inp.throttle * (1 - DMG.power * dmg), steer };
}
