// Car viewer for judging the models: one car on a flat pad, six fixed views in one picture.
import * as THREE from 'three';
import { buildCar, setCarEnv } from '../../src/carmodel.js';
import { buildSky } from '../../src/scene.js';
import { CARS, PAINTS, buildSpec, PATROL_SPEC } from '../../src/cars.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const sunDir = new THREE.Vector3(0.55, 0.62, 0.42).normalize();
scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x5a5340, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4); sun.position.copy(sunDir).multiplyScalar(40); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); { const c = sun.shadow.camera; c.left = c.bottom = -8; c.right = c.top = 8; c.near = 5; c.far = 90; } sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
{ const sky = buildSky(scene, renderer, sunDir); setCarEnv(sky.env, sky.mirror); }
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f7376 })); ground.receiveShadow = true; scene.add(ground);
const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 6000);
let cur = null;
window.show = (id, opt = {}) => {
  if (cur) { scene.remove(cur.car); cur.dispose(); }
  const spec = id === 'patrol' ? PATROL_SPEC : buildSpec(id, opt.up, opt.tune);
  const o = id === 'patrol' ? { paint: 0x1d2b45, trim: 0xe9edf2, lightbar: true } : { paint: PAINTS[opt.paint ?? CARS[id].paint].hex, number: opt.number };
  const v = cur = buildCar(spec, o); scene.add(v.car);
  v.car.traverse((m) => { if (m.isMesh) m.receiveShadow = false; });
  const s = spec, pts = [[s.wheelX, s.wheelZf], [-s.wheelX, s.wheelZf], [s.wheelX, s.wheelZr], [-s.wheelX, s.wheelZr]];
  v.wheels.forEach((w, i) => { w.pivot.position.set(pts[i][0], v.rest, pts[i][1]); w.pivot.scale.x = pts[i][0] < 0 ? -1 : 1; if (i < 2) w.pivot.rotation.y = opt.steer || 0; });
  if (opt.cargo) v.cargo.visible = true;
  ground.position.y = v.rest - s.radius;
  window.spec = s; window.vis = v;
  return { rest: v.rest, box: s.box, wheelX: s.wheelX, zf: s.wheelZf, zr: s.wheelZr, r: s.radius, tris: renderer.info.render.triangles };
};
// views: [azimuth from the nose (deg, + toward the car's left), elevation (deg), distance]
const VIEWS = { six: [[35, 14, 8.6], [90, 4, 8.6], [145, 16, 8.6], [0.01, 89, 9.6], [0, 6, 7.4], [180, 8, 7.4]], one: [[35, 14, 6.2]], side: [[90, 4, 6.4]], rear: [[150, 18, 6.2]], chase: [[180, 16, 8]], low: [[60, 3, 6]], top: [[0.01, 89, 6.5]], two: [[35, 14, 6.4], [150, 18, 6.4]] };
window.draw = (name = 'six') => {
  const W = canvas.width, H = canvas.height, vs = VIEWS[name], cols = vs.length > 2 ? 3 : vs.length, rows = Math.ceil(vs.length / cols), k = window.spec.box.z / 2;
  renderer.setScissorTest(true);
  vs.forEach(([az, el, dist], i) => {
    const w = W / cols, h = H / rows, x = (i % cols) * w, y = H - h - Math.floor(i / cols) * h;
    renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const a = az * Math.PI / 180, e = el * Math.PI / 180, ty = 0.15; dist *= k;
    cam.position.set(Math.sin(a) * Math.cos(e) * dist, ty + Math.sin(e) * dist, Math.cos(a) * Math.cos(e) * dist); cam.lookAt(0, ty, 0);
    renderer.render(scene, cam);
  });
  return renderer.info.render.triangles;
};
window.ready = true;
