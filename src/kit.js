// Building blocks shared by the world and the car models: merged geometry, a small parts builder, painted signs.
import * as THREE from 'three';

// Many small shapes become one mesh per material.
export function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; } else for (let i = 0; i < c; i++) idx[io++] = vo + i;
    vo += c; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
export function parts() {
  const lists = new Map(), m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), d = new THREE.Vector3();
  const put = (geo, mat) => { geo.applyMatrix4(m4.premultiply(base)); let l = lists.get(mat); if (!l) lists.set(mat, l = []); l.push(geo); };
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { m4.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), ONE); put(geo, mat); };
  const b = {
    add,
    // everything added from now on is placed relative to this spot and heading
    origin(x, y, z, ry) { base.compose(p.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), ONE); return b; },
    // taper: [x scale, z scale, z shift] of the top face
    box(w, h, l, mat, x, y, z, taper, rx, ry, rz) {
      const g = new THREE.BoxGeometry(w, h, l);
      if (taper) { const a = g.attributes.position; for (let i = 0; i < a.count; i++) if (a.getY(i) > 0) { a.setX(i, a.getX(i) * taper[0]); a.setZ(i, a.getZ(i) * taper[1] + (taper[2] || 0)); } g.computeVertexNormals(); }
      add(g, mat, x, y, z, rx, ry, rz);
    },
    cyl(r0, r1, h, seg, mat, x, y, z, rx, ry, rz) { add(new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z, rx, ry, rz); },
    // a square bar from one point to another
    tube(mat, x1, y1, z1, x2, y2, z2, t = 0.06) {
      d.set(x2 - x1, y2 - y1, z2 - z1); const len = d.length();
      m4.compose(p.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), q.setFromUnitVectors(Z, d.normalize()), ONE); put(new THREE.BoxGeometry(t, t, len), mat);
    },
    // a round bar from one point to another
    rod(mat, x1, y1, z1, x2, y2, z2, r = 0.03, seg = 7) {
      d.set(x2 - x1, y2 - y1, z2 - z1); const len = d.length();
      m4.compose(p.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), q.setFromUnitVectors(Y, d.normalize()), ONE); put(new THREE.CylinderGeometry(r, r, len, seg), mat);
    },
    // a flat panel that shows a picture; faces +z before turning
    plane(w, h, mat, x, y, z, rx = 0, ry = 0) { add(new THREE.PlaneGeometry(w, h), mat, x, y, z, rx, ry, 0); },
    into(parent, cast = true, receive = false) {
      const made = [];
      for (const [mat, l] of lists) { const m = new THREE.Mesh(mergeGeos(l), mat); m.castShadow = cast && !mat.map; m.receiveShadow = receive; parent.add(m); made.push(m); }
      lists.clear(); return made;
    },
  };
  return b;
}

export const lam = (color) => new THREE.MeshLambertMaterial({ color });

// A sign painted on a canvas. Drawn at once, then again when the display typeface has arrived.
export function signTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const paint = () => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; };
  paint();
  try { document.fonts.load('700 40px "Barlow Condensed"').then(paint, () => {}); } catch (_) {}
  return t;
}
export const FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';
export function banner(text, bg, fg, w = 1024, h = 128) {
  return signTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = h * 0.66; g.font = `700 ${size}px ${FONT}`;
    const tw = g.measureText(text).width; if (tw > w * 0.9) { size *= w * 0.9 / tw; g.font = `700 ${size}px ${FONT}`; }
    g.fillText(text, w / 2, h / 2 + size * 0.04);
  });
}
