import * as THREE from 'three';
import { buildWorld, SURF, HALF, SIZE } from './terrain.js';
import { Vehicle, G } from './vehicle.js';
import { CARS, PAINTS, FIND_IDS, buildSpec, stockTune, PATROL_SPEC } from './cars.js';
import { buildTerrain, buildRoads, buildSpeedway, buildTrees, buildProps, buildSea, buildSky, buildFall, GROUND_FX, SKIES, buildSites, buildGarages, buildLines, makeBeam, buildCrates, buildBarn, buildRamps, buildTraps, buildRivers, buildBridges, buildTowns } from './scene.js';
import { buildCar, setCarEnv, SHADE } from './carmodel.js';
import { Game, CARGO, RIVAL_SPEC } from './jobs.js';
import { buildRaces, Race, MEDALS, PLACES, KID_LEVEL, spotsFor, rankKey, medals } from './race.js';
import { Traffic, TRAFFIC } from './traffic.js';
import { buildTests, SCHOOL_CAR, SCHOOL_PAINT_INDEX, improvePay } from './school.js';
import { kidInput } from './kid.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { TOD, TOD_NAME, lookAt, hourFor } from './daylight.js';
import { WEATHERS, WEATHER_MODES, WEATHER_MODE_NAME, WEATHER_NEWS, blendWeather, nextWeather, fixedWeather, SPELL, BLEND } from './weather.js';
import { claimGoals, bump, best, mark, allGoals, REGION_PAINT, bonusOpen } from './goals.js';
import { placeFinds, addRamps, clearTrees, barnHint, airPay, AIR_MIN, CRATES, CRATE_PAY, CRATE_R, BARN_R, RAMP, popcount } from './finds.js';
import { GhostRecorder, encodeGhost, loadGhost, saveGhost, ghostAt, clearGhosts } from './ghost.js';
import { createStore } from './save.js';
import { createTilt, createWake, buzz, canBuzz } from './phone.js';
import { cupRound, cupTeams, newCup, scoreRound, cupTable, cupPlace, cupOver, purse, CUP_ROUNDS, CUP_NAME, CUP_CAR } from './cup.js';
import { createUI, money, clock } from './ui.js';
import { mapPoints, pickPoint, arrived, pixelToWorld, mapView } from './nav.js';
import { nextTip, skipped, TIP_SHOW, TIP_GAP } from './tips.js';
import { createSkids } from './skids.js';
import { dayKey, rollDaily, dailyEvent, dailyProgress, streakPay } from './daily.js';
import { Duel, P_NAMES } from './duel.js';
import { cleanBinds, defaultBinds, setBind, resetSet, keyFor, buttonFor, keysFor, STYLES } from './binds.js';
import { DriftMeter, slideAngle, driftPay, trapPay, placeTraps, crossed, MPH, TRAP_MIN_MPH, NitroTank, NITRO } from './stunts.js';
import { REGIONS, REGION_IDS } from './regions.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 120;
const HOLD = { steer: 0, throttle: 0, brake: 0, handbrake: true, analog: true };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function start(hot) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('touch', coarse);
  const canvas = $('game');
  // Phones get the same picture as a desktop (smooth edges, shadows, a sharp image); the frame-rate watcher further
  // down steps detail back if a device cannot keep up.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const shadows = true;
  renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKIES.mountain.fog, 260, 3000);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 6000);
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.42).normalize();
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x5a5340, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4); scene.add(sun, sun.target);
  // The shadow map covers a square that leads the view a little and moves in whole texels, so shadow edges hold still.
  const SHADOW_R = coarse ? 48 : 60, lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize(), lightY = new THREE.Vector3().crossVectors(sunDir, lightX), focus = new THREE.Vector3(), viewDir = new THREE.Vector3();
  if (shadows) { sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048); const c = sun.shadow.camera; c.left = c.bottom = -SHADOW_R; c.right = c.top = SHADOW_R; c.near = 10; c.far = 420; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; }

  // ---- saved progress, sound, world ----
  let ui = null, pendingRemote = false;
  const store = createStore({ onRemote: () => { pendingRemote = true; }, onStatus: () => { if (ui) { ui.refresh(); titleInfo(); } } });
  const S = () => store.data;
  const audio = createAudio(); audio.setMuted(S().muted);
  const metric = () => S().units === 'metric';

  { const m = /(?:^|[#&])r=([a-z]+)/.exec(location.hash); if (m && REGIONS[m[1]]) { S().region = m[1]; try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} } }
  const world = buildWorld(S().region), RG = world.regionDef, SK = SKIES[world.region] || SKIES.mountain;
  const ALT0 = world.sea != null ? -world.sea : 1400; // height shown on the dash: above the sea on the coast
  audio.setRegion(world.region); audio.setMusic(S().music);
  // how near the sea a point is (0 far, 1 on the beach), for the sound of the waves: distance to water on a 32 m grid
  const seaNear = (() => {
    if (world.sea == null) return () => 0;
    const G = 96, C = SIZE / G, d = new Float32Array(G * G).fill(1e9), q = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const x = -HALF + (i + 0.5) * C, z = -HALF + (j + 0.5) * C; if (world.sample(x, z) < world.waterAt(x, z)) { d[j * G + i] = 0; q.push(j * G + i); } }
    for (let h = 0; h < q.length; h++) { const k = q[h], i = k % G, j = (k / G) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, z = j + b; if (x < 0 || z < 0 || x >= G || z >= G) continue; const m = z * G + x; if (d[m] > d[k] + C) { d[m] = d[k] + C; q.push(m); } } }
    return (x, z, y) => { const i = Math.max(0, Math.min(G - 1, ((x + HALF) / C) | 0)), j = Math.max(0, Math.min(G - 1, ((z + HALF) / C) | 0)); return Math.max(0, 1 - d[j * G + i] / 260) * Math.max(0.25, 1 - (y - world.sea) / 160); };
  })();
  world.placeTrees(RG.treeCount[coarse ? 0 : 1]);
  document.body.dataset.region = world.region; scene.fog.color.setHex(SK.fog); hemi.color.setHex(SK.light[0]); hemi.groundColor.setHex(SK.light[1]);
  const races = buildRaces(world), garages = world.places.garages;
  const finds = placeFinds(world, races); clearTrees(world, finds);   // hidden crates, the barn car and the jump ramps
  const specOf = (id) => { const own = S().cars[id]; return buildSpec(id, own ? own.up : undefined, own ? own.tune : undefined); };
  const paintOf = (id) => { const own = S().cars[id]; return PAINTS[own ? own.paint : CARS[id].paint].hex; };

  const sky = buildSky(scene, renderer, sunDir, SK); setCarEnv(sky.env, sky.mirror);
  // ---- time of day: sun (or moon), sky, fog, car reflections, headlights, and how far patrols can see ----
  const DAY = { t: 0, hour: -1, baked: 13, next: 0 }; let night = 0, headlight = null, townVis = null, townT = 0, inTown = null;
  const UP = new THREE.Vector3(0, 1, 0);
  function makeHeadlight() {     // one spotlight for the player's car, made only when the setting is not plain day
    if (headlight) return;
    headlight = new THREE.SpotLight(0xfff1d6, 0, 110, 0.52, 0.55, 1.1); scene.add(headlight, headlight.target);
  }
  // the light, sky and fog: the time of day's look (L) with the weather (WX.cur) laid over it
  let L = lookAt(13, SK);
  const lum = (h) => (((h >> 16) & 255) + ((h >> 8) & 255) + (h & 255)) / 3 || 1;
  const mixH = (a, b, t) => { if (t <= 0) return a; const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
  const scaleH = (a, k) => { if (k === 1) return a; const f = (s) => Math.min(255, Math.round(((a >> s) & 255) * k)); return (f(16) << 16) | (f(8) << 8) | f(0); };
  function applyLook(hour, bake) { L = lookAt(hour, SK); DAY.hour = hour; applyAll(bake, hour); }
  function applyAll(bake, hour = DAY.hour < 0 ? 13 : DAY.hour) {
    const W = WX.cur, cov = W.cover;
    sunDir.set(L.dir[0], L.dir[1], L.dir[2]).normalize(); lightX.crossVectors(UP, sunDir).normalize(); lightY.crossVectors(sunDir, lightX);
    const fog = mixH(L.fog, scaleH(W.tint, Math.min(1.2, lum(L.fog) / lum(W.tint))), W.tintAmt);
    sun.color.setHex(L.sun); sun.intensity = L.si * W.light; hemi.color.setHex(L.hs); hemi.groundColor.setHex(L.hg); hemi.intensity = L.hi * (0.5 + 0.5 * W.light);
    scene.fog.color.setHex(fog); scene.fog.near = 260 * W.fogNear; scene.fog.far = 3000 * W.fogFar;
    sky.set(cov || W.tintAmt ? { ...L, top: mixH(L.top, fog, Math.max(cov * 0.6, W.tintAmt * 0.7)), mid: mixH(L.mid, fog, Math.max(cov * 0.7, W.tintAmt * 0.8)), hor: mixH(L.hor, fog, W.tintAmt * 0.85), envTop: mixH(L.envTop, fog, cov * 0.6), envMid: mixH(L.envMid, fog, cov * 0.7),
      cl: scaleH(L.cl, 1 - 0.35 * cov), cs: scaleH(L.cs, 1 - 0.45 * cov), disc: scaleH(L.disc, 1 - 0.92 * cov), cover: cov } : L);
    night = L.night; game.sight = (1 - 0.4 * night) * W.sight; if (townVis) townVis.glow(night);
    world.weatherGrip = W.grip.every((g) => g === 1) ? undefined : W.grip; GROUND_FX.snow.value = W.ground;
    const d = Math.abs(hour - DAY.baked); if (bake || Math.min(d, 24 - d) > 0.45) {   // redraw the reflections now and then, not every frame
      DAY.baked = hour; const { old, dispose } = sky.bake();
      scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (m.envMap === old) m.envMap = sky.env; });
      setCarEnv(sky.env, sky.mirror); dispose();
    }
  }
  // ---- weather: a fixed choice, or changing by itself every few minutes with a twenty second blend ----
  const fall = buildFall(scene, coarse ? 1400 : 2600);
  const WX = { now: 'clear', from: 'clear', t: 1, spell: 120 + Math.random() * 120, cur: blendWeather('clear', 'clear', 1) };
  function turnWeather(to, instant) {
    if (to === WX.now && WX.t >= 1) return;
    WX.from = WX.t >= 1 ? WX.now : (WX.t < 0.5 ? WX.from : WX.now); WX.now = to; WX.t = instant ? 1 : 0;
    WX.cur = blendWeather(WX.from, WX.now, WX.t); if (instant) applyAll(true);
    if (!instant && mode !== 'title') toast(WEATHER_NEWS[to] || WEATHERS[to].name, 3);
  }
  function setWeather(m) {
    S().weather = m; const f = fixedWeather(m, world.region);
    if (f) turnWeather(f, mode === 'title'); else WX.spell = SPELL[0] + Math.random() * (SPELL[1] - SPELL[0]);
  }
  function weatherTick(dt) {
    if (S().weather === 'auto' && mode !== 'title' && (WX.spell -= dt) <= 0) { WX.spell = SPELL[0] + Math.random() * (SPELL[1] - SPELL[0]); turnWeather(nextWeather(world.region, WX.now)); }
    if (WX.t < 1) { WX.t = Math.min(1, WX.t + dt / BLEND); WX.cur = blendWeather(WX.from, WX.now, WX.t); applyAll(WX.t >= 1); }
  }
  // ---- goals: checked once a second; rewards are paid at once, the news waits until the toast line is free ----
  const goalNews = []; let goalT = 0;
  // ---- the daily challenge (same for everyone on a date; the streak grows the reward) ----
  const today = () => rollDaily(S().daily, dayKey(), world.region);
  function daily(kind, value) {
    const rec = S().daily, ch = today(), had = rec.have, pay = dailyEvent(rec, ch, kind, value);
    if (pay) { S().cash += pay; goalNews.push(`Daily challenge done! +${money(pay)}` + (rec.streak > 1 ? `. ${rec.streak} days in a row` : '')); store.commit(); }
    else if (rec.have !== had) store.commit();
  }
  const dailyInfo = () => { const ch = today(), rec = S().daily; return { text: ch.text, progress: dailyProgress(rec, ch), pay: streakPay(rec.last === rec.day ? rec.streak : (rec.last && (Date.parse(rec.day) - Date.parse(rec.last)) === 864e5 ? rec.streak + 1 : 1)), streak: rec.streak, done: rec.last === rec.day }; };
  function checkGoals(dt) {
    if ((goalT -= dt) > 0) return; goalT = 1;
    if (mode !== 'roam' && mode !== 'garage' && mode !== 'results') return;
    const { got, finished } = claimGoals(S());
    unlockBonus();
    if (got.length) { if (got.length > 2) goalNews.push(`${got.length} goals done. +${money(got.reduce((a, q) => a + q.pay, 0))}. See Goals in the menu`); else for (const q of got) goalNews.push(`Goal done: ${q.name}. +${money(q.pay)}`); for (const r of finished) goalNews.push(`Every ${REGIONS[r].name} goal done! New paint: ${PAINTS[REGION_PAINT[r]].name}`); store.commit(); ui.refresh(); }
    if (goalNews.length && toastT <= 0 && mode !== 'results') { const m = goalNews.shift(); toast(m, m.startsWith('Every') ? 5 : 3.6); audio.chime(m.startsWith('Every') ? [523, 659, 784, 1047, 1319] : [784, 1047, 1319]); }
  }
  // every goal of the three main regions done: the hypercar goes in the garage and the speedway opens (build 38)
  function unlockBonus() {
    const s = S(); if (s.cars.hyper || !bonusOpen(s)) return false;
    s.cars.hyper = { up: [0, 0, 0, 0], tune: stockTune('hyper'), paint: CARS.hyper.paint }; store.commit();
    goalNews.push(`Every map cleared! The ${CARS.hyper.base.name} is in your garage, and ${REGIONS.speedway.name} is open: Travel, in any garage`);
    return true;
  }
  const setTime = (tod) => { S().tod = DAY.tod = tod; DAY.t = 0; if (tod !== 'day') makeHeadlight(); applyLook(hourFor(tod, 0), true); };
  const car = new Vehicle(world, specOf(S().car));
  let vis = null, shownId = null, garageAt = garages[S().at] || garages[0], camSnap = false;
  // nitro flames: two soft blue cones out of the back of the player's car, shown while the nitro burns
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x3f9dff, transparent: true, opacity: 0.85, depthWrite: false }), coreMat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.9, depthWrite: false });
  const flameGeo = new THREE.ConeGeometry(0.13, 0.8, 10, 1, true); flameGeo.rotateX(-Math.PI / 2); flameGeo.translate(0, 0, -0.4);
  const coreGeo = new THREE.ConeGeometry(0.06, 0.4, 8, 1, true); coreGeo.rotateX(-Math.PI / 2); coreGeo.translate(0, 0, -0.2);
  let flames = [];
  function dress(id) {            // build the model for the car the player is in (or looking at in the garage)
    if (vis) { scene.remove(vis.car); vis.dispose(); }
    vis = buildCar(car.spec, { paint: paintOf(id) }); scene.add(vis.car); shownId = id; audio.setCar(CARS[id].sound);
    vis.car.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(vis.car);
    flames = [-1, 1].map((sx) => { const f = new THREE.Mesh(flameGeo, flameMat); f.add(new THREE.Mesh(coreGeo, coreMat)); f.position.set(sx * Math.min(0.34, box.max.x * 0.4), box.min.y + 0.28, box.min.z + 0.02); f.visible = false; vis.car.add(f); return f; });
  }
  const skids = createSkids(scene);
  // Put car `id` on the garage floor. numbersOnly: same car, only its parts or settings changed, so it stays where it is.
  function showCar(id, numbersOnly) {
    car.applySpec(specOf(id));
    if (id !== shownId) { dress(id); numbersOnly = false; } else vis.paint.color.setHex(paintOf(id));
    if (!numbersOnly) { car.place(garageAt.x, garageAt.z, garageAt.yaw); camSnap = true; }
  }
  { const sp = garageAt; car.place(sp.x, sp.z, sp.yaw); }
  if (hot && hot.p) { car.pos.fromArray(hot.p); car.quat.fromArray(hot.q); }
  dress(S().car);

  const bank = { get cash() { return S().cash; }, set cash(v) { S().cash = v; }, get runs() { return S().runs; }, set runs(v) { S().runs = v; } };
  const game = new Game(world, car, bank);
  // everyday traffic (build 34): ordinary cars on the tarmac loops, only in free roam, switch in the menu
  const traffic = new Traffic(world, { n: coarse ? TRAFFIC.nTouch : TRAFFIC.n }), trafficVis = new Map(), trafficSpare = [];
  const trafficOthers = () => { const l = game.patrols.map((pt) => pt.car); if (game.rival) l.push(game.rival.car); return l; };
  function showTraffic(dt) {
    const on = mode === 'roam' || mode === 'garage';
    for (const [id, v] of trafficVis) if (!on || !traffic.cars.some((t) => t.id === id)) { v.car.visible = false; trafficSpare.push(v); trafficVis.delete(id); }
    if (!on) return;
    for (const t of traffic.cars) {
      let v = trafficVis.get(t.id);
      if (!v) { const k = trafficSpare.findIndex((q) => q.kind === t.kind); v = k >= 0 ? trafficSpare.splice(k, 1)[0] : Object.assign(buildCar(t.car.spec, { paint: t.paint }), { kind: t.kind }); if (!v.car.parent) scene.add(v.car); v.paint.color.setHex(t.paint); v.car.visible = true; trafficVis.set(t.id, v); }
      v.car.visible = camera.position.distanceToSquared(t.car.pos) < (coarse ? 260 : 340) ** 2;   // small and many parts: not drawn far off
      if (v.car.visible) pose(t.car, v, dt);
    }
  }
  if (S().tod !== 'day') setTime(S().tod);
  if (S().weather !== 'auto') { const f = fixedWeather(S().weather, world.region); if (f && f !== 'clear') { WX.now = WX.from = f; WX.cur = blendWeather(f, f, 1); applyAll(true); } }
  if (!(S().stats[world.region] || {}).v) { bump(S(), world.region, 'v'); store.commit(); }
  const ground = buildTerrain(world, scene); buildSea(world, scene); buildRivers(world, scene); buildRoads(world, scene); buildBridges(world, scene); buildSpeedway(world, scene); townVis = buildTowns(world, scene); if (townVis) townVis.glow(night); const treeMeshes = buildTrees(world, scene, shadows), smallMeshes = buildProps(world, scene, coarse ? 0.7 : 1);
  buildSites(game.sites, scene); buildGarages(garages, scene); buildLines(world, scene, races);
  // ---- hidden finds: crates to pick up, an old car in a shed, and ramps (laid into the ground after the terrain is drawn) ----
  addRamps(world, finds.ramps); buildRamps(world, finds.ramps, scene, RAMP);
  const crateVis = buildCrates(finds.crates, scene), crateGot = (i) => !!(((S().stats[world.region] || {}).k || 0) & (1 << i));
  crateVis.forEach((v, i) => { v.visible = !crateGot(i); });
  buildBarn(finds.barn, scene); world.addCollider(finds.barn.x, finds.barn.z, 3.2);
  let barnVis = null;
  const showBarnCar = () => {
    if (barnVis) { scene.remove(barnVis.car); barnVis.dispose(); barnVis = null; }
    if (S().cars[finds.barn.car]) return;
    const b = finds.barn, sp = buildSpec(b.car); barnVis = buildCar(sp, { paint: scaleH(PAINTS[CARS[b.car].paint].hex, 0.62) }); scene.add(barnVis.car);
    const stat = sp.mass * G / (4 * sp.springK);                 // resting on its wheels, nose toward the open side
    barnVis.car.position.set(b.x, b.y - 0.2 + sp.radius - (sp.attachY - (sp.restLen - stat)), b.z); barnVis.car.rotation.y = b.yaw;
    if (barnVis.blob) barnVis.blob.visible = false; if (barnVis.cargo) barnVis.cargo.visible = false;
  };
  showBarnCar();
  const bh = barnHint(world, finds.barn);
  const findHints = () => ({ crates: `Crates show up on the map when you are near one. ${CRATES - popcount((S().stats[world.region] || {}).k || 0)} left here.`,
    barn: S().cars[finds.barn.car] ? `Found: the ${CARS[finds.barn.car].base.name}.` : `Look for an old shed about ${metric() ? bh.dist + ' m' : (Math.round(bh.dist * 3.28084 / 100) * 100).toLocaleString('en-US') + ' ft'} ${bh.dir} of ${bh.from}.`,
    air: 'Hit one of the orange jump ramps on the map at full speed.',
    drift: `Slide sideways at speed (the handbrake helps) and keep it going; the score grows the longer you hold it. Best here: ${((S().stats[world.region] || {}).f || 0).toLocaleString('en-US')}.`,
    traps: 'The speed traps are the yellow dots on the map. Best here: ' + [0, 1, 2].map((i) => { const v = (S().stats[world.region] || {})['s' + i] || 0; return v ? (metric() ? Math.round(v / MPH * 3.6) + ' km/h' : v + ' mph') : 'none'; }).join(', ') + '.' });
  function findCheck() {            // driving over a crate picks it up; driving up to the shed claims the car
    const s = S(), R = world.region;
    for (const c of finds.crates) {
      if (crateGot(c.i) || (car.pos.x - c.x) ** 2 + (car.pos.z - c.z) ** 2 > CRATE_R * CRATE_R) continue;
      mark(s, R, 'k', c.i); s.cash += CRATE_PAY; crateVis[c.i].visible = false;
      const n = popcount(s.stats[R].k); shake(30); toast(`Hidden crate ${n} of ${CRATES}. +${money(CRATE_PAY)}`, 2.6); audio.chime([659, 988, 1319]); store.commit();
    }
    const b = finds.barn;
    if (!s.cars[b.car] && (car.pos.x - b.x) ** 2 + (car.pos.z - b.z) ** 2 < BARN_R * BARN_R) {
      s.cars[b.car] = { up: [0, 0, 0, 0], tune: stockTune(b.car), paint: CARS[b.car].paint }; store.commit(); showBarnCar();
      toast(`Barn find! The ${CARS[b.car].base.name} is yours. It is waiting in your garage`, 5); audio.chime([523, 659, 784, 1047, 1319]);
    }
  }
  // ---- tips for new players: one short hint at a time, each shown once (Tips in the menu turns them off or back on) ----
  let tipSince = TIP_GAP - 8, tipUp = 0, tipCheck = 0, driveT = 0, stuckT = 0;   // the first tip comes after about 8 s of driving
  const tipEl = $('tip');
  function tipContext() {
    const s = S(); let near = null, nd = 60;
    for (const z of zones) { const d = Math.hypot(car.pos.x - z.x, car.pos.z - z.z); if (d < nd) { nd = d; near = z.kind; } }
    const delivered = Object.values(s.stats || {}).reduce((a, st) => a + (st.d || 0), 0);
    return { t: driveT, job: !!game.job, heat: !!game.heat, near, cars: Object.keys(s.cars).length, raced: Object.keys(s.rank).length > 0, delivered, stuck: stuckT > 6, cash: s.cash, nitro: !!s.nitro, goalsDone: s.done.length, touch: coarse && !input.pad, key: said };
  }
  function hideTip() { tipUp = 0; tipEl.hidden = true; }
  function tipTick(dt) {
    driveT += dt; tipSince += dt;
    stuckT = input.throttle > 0.5 && car.speed < 1.5 ? stuckT + dt : 0;
    if (tipUp > 0) { tipUp -= dt; if (tipUp <= 0) hideTip(); return; }
    if ((tipCheck -= dt) > 0 || !S().tipsOn || race || toastT > 0) return;   // never on top of a message
    tipCheck = 0.5;
    const c = tipContext(), s = S(), old = skipped(c, s.tips);
    if (old.length) { s.tips.push(...old); store.commit(); }
    const tip = nextTip(c, s.tips, tipSince); if (!tip) return;
    s.tips.push(tip.id); store.commit();
    $('tip-text').textContent = tip.text(c); tipEl.hidden = false; tipUp = TIP_SHOW; tipSince = 0;
  }
  tipEl.addEventListener('click', () => { hideTip(); if (driving()) canvas.focus(); });
  function landed(t) {              // back on the ground after a jump: long air pays outside races
    if (mode === 'roam' && S().nitro) nitro.add(t * NITRO.perAir);
    if (mode === 'roam') daily('air', Math.floor(t * 10) / 10);
    if (mode === 'roam' && t >= AIR_MIN) {
      const pay = airPay(t), rec = best(S(), world.region, 'a', Math.floor(t * 10)); S().cash += pay; store.commit();
      shake(40); toast(`Air time ${t.toFixed(1)} s. +${money(pay)}` + (rec && t >= 1.5 ? '. Your longest here' : ''), 2); audio.chime([784, 1175]);
    } else if (t > 1.1) toast('Air time ' + t.toFixed(1) + ' s', 1.6);
  }
  const smugVis = buildCar(RIVAL_SPEC, { paint: 0x3b3f45, trim: 0xd8a03a }); smugVis.cargo.visible = true; smugVis.car.visible = false; scene.add(smugVis.car);   // the rival smuggler
  const patrolVis = Array.from({ length: 6 }, () => {   // three on the beat, plus room for a roadblock and backup
   const v = buildCar(PATROL_SPEC, { paint: 0x1d2b45, trim: 0xe9edf2, lightbar: true }); scene.add(v.car); return v; });
  const beam = (color, r) => { const b = makeBeam(color, r); scene.add(b); return b; };
  const pickBeams = [0, 1, 2].map(() => beam(0xf2b33d)), dropBeam = beam(0x54d17a), navBeam = beam(0xff6fae, 6), gateBeams = [beam(0x62dcea, 10), beam(0x62dcea, 10)];
  // places where stopping opens something: garages (blue) and race starts (violet)
  const zones = [
    ...garages.map((g) => ({ kind: 'garage', g, x: g.x, z: g.z, y: g.y, r: 7, label: 'Open the garage', beam: beam(0x4f9dff, 7) })),
    ...Object.entries(spotsFor(world.region)).filter(([spot]) => races.some((d) => d.spot === spot)).map(([spot, label]) => { const group = races.filter((d) => d.spot === spot), def = group[0]; return { kind: 'race', def, group, x: def.x, z: def.z, y: def.y, r: 8, label, beam: beam(0xa283ff, 8) }; }),
  ];
  for (const z of zones) z.beam.position.set(z.x, z.y, z.z);
  // free-roam scoring: speed trap cameras on the fast stretches, and a drift meter
  const traps = placeTraps(world, [...zones, ...world.places.sites, ...finds.ramps]); buildTraps(world, traps, scene);
  const drift = new DriftMeter(), nitro = new NitroTank(0.5); let trapPrev = null;
  const nitroOk = () => S().nitro && mode === 'roam' && !S().kid;
  const showNitro = () => document.body.classList.toggle('nitro', !!S().nitro && !S().kid);
  function stunts(dt) {
    if (mode !== 'roam' || S().kid) { drift.reset(); trapPrev = null; return; }
    const r = drift.step(dt, { speed: car.speed, angle: slideAngle(car.vel, car.fwd, car.left), grounded: car.grounded, impact: car.impact });
    if (r && r.kind === 'paid') { daily('drift', r.score); if (S().nitro) nitro.add(r.score * NITRO.perDrift); S().cash += r.pay; const rec = best(S(), world.region, 'f', r.score); store.commit(); toast(`Drift ${r.score.toLocaleString('en-US')}. +${money(r.pay)}` + (rec && r.score >= 500 ? '. Your best here' : ''), 2); audio.chime([659, 988]); }
    else if (r && r.kind === 'lost') toast(`Drift lost (${r.score.toLocaleString('en-US')})`, 1.4);
    const px = car.pos.x, pz = car.pos.z;
    if (trapPrev) for (const t of traps) if (crossed(t, trapPrev.x, trapPrev.z, px, pz)) {
      const mph = Math.round(car.speed * MPH), sp = metric() ? Math.round(car.speed * 3.6) + ' km/h' : mph + ' mph', key = 's' + t.i, was = (S().stats[world.region] || {})[key] || 0;
      daily('trap', mph);
      if (mph < TRAP_MIN_MPH) { toast(`Speed trap: ${sp}. Go faster`, 1.6); continue; }
      if (best(S(), world.region, key, mph)) { const pay = trapPay(mph) - trapPay(Math.max(was, TRAP_MIN_MPH)); S().cash += pay; store.commit(); toast(`Speed trap: ${sp}. New best! +${money(pay)}`, 2.4); audio.chime([784, 1047, 1319]); shake(30); }
      else toast(`Speed trap: ${sp}. Best ${metric() ? Math.round(was / MPH * 3.6) + ' km/h' : was + ' mph'}`, 1.8);
    }
    trapPrev = { x: px, z: pz };
  }

  // ---- dust ----
  const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const dust = Array.from({ length: coarse ? 90 : 140 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.userData = { life: 0, max: 1, vy: 0 }; scene.add(s); return s; });
  let dustI = 0;
  const DUST_COL = SK.dust;
  // What the wheels throw up follows the weather: dust when dry; in rain, clumps of mud off loose ground and a mist of
  // spray off wet tarmac; in snow, white powder off everything (slush on the roads).
  const MUD_COL = [0x3a3734, 0x2f2116, 0x2a2715, 0x3b3226, 0xe9eef3], SNOW_COL = [0xd5dbe0, 0xf1f4f7, 0xeef2f5, 0xeef2f5, 0xf4f7fa];
  const wetNow = () => WX.cur.rain || 0, snowNow = () => Math.min(1, (WX.cur.ground || 0) / 0.6);
  const mudTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff';   // a wet clump: a hard-edged blob with a few drops
    g.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2, r = 15 + (i % 3) * 4 + (i % 2) * 3; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill();
    for (const [x, y, r] of [[10, 14, 4], [54, 20, 3], [50, 52, 4], [14, 50, 3]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } return new THREE.CanvasTexture(c); })();
  function spawn() { const s = dust[dustI = (dustI + 1) % dust.length]; s.userData.vx = s.userData.vz = 0; s.userData.g = 0; s.userData.kind = 'dust'; s.userData.alpha = 0.42; s.userData.grow = 4.5; s.material.map = dustTex; return s; }
  function puff(p, surf, big) { const s = spawn(); s.position.copy(p); s.position.y += 0.25; s.material.color.setHex(DUST_COL[surf]); s.userData.life = s.userData.max = 0.7 + Math.random() * 0.7; s.userData.size = big; s.userData.vy = 0.6 + Math.random(); s.visible = true; }
  function mud(p, c, surf) {        // a clump flung up and back off the tyre, falling under its own weight
    const s = spawn(), u = s.userData; s.material.map = mudTex; s.position.copy(p); s.position.y += 0.2; s.material.color.setHex(MUD_COL[surf]);
    u.kind = 'mud'; u.life = u.max = 0.5 + Math.random() * 0.4; u.size = 0.35 + Math.random() * 0.3; u.grow = 0.5; u.alpha = 1; u.g = 10;
    const side = (Math.random() - 0.5) * 3; u.vx = c.vel.x * 0.72 - c.fwd.x * 1.5 + c.left.x * side; u.vz = c.vel.z * 0.72 - c.fwd.z * 1.5 + c.left.z * side; u.vy = 3 + Math.random() * 2.5; s.visible = true;
  }
  function spray(p, c, col, size, alpha) {   // fine water or snow thrown up behind the car, hanging in the air
    const s = spawn(), u = s.userData; s.position.copy(p); s.position.y += 0.3; s.material.color.setHex(col);
    u.kind = 'spray'; u.life = u.max = 0.5 + Math.random() * 0.5; u.size = size; u.grow = 3.2; u.alpha = alpha; u.g = 1.5;
    u.vx = c.vel.x * 0.55 + (Math.random() - 0.5) * 2; u.vz = c.vel.z * 0.55 + (Math.random() - 0.5) * 2; u.vy = 0.8 + Math.random() * 1.2; s.visible = true;
  }
  function trail(c, dt, rate) {    // dust, mud, spray, snow and tyre smoke behind one car
    const wet = wetNow(), snow = snowNow();
    c.dustAcc = (c.dustAcc || 0) + dt * Math.min(1, c.speed / 12) * rate * (wet > 0.3 || snow > 0.3 ? 1.4 : 1) * (1 + 0.5 * Math.min(1, (c.spec.driveFront || 0) / 0.35));
    while (c.dustAcc > 1) {
      c.dustAcc -= 1;
      // four-wheel-drive cars throw as much off the front tyres as off the back
      const front = (c.spec.driveFront || 0) > 0.05 && Math.random() < 0.5 * Math.min(1, c.spec.driveFront / 0.35);
      const w = c.wheels[(front ? 0 : 2) + (Math.random() * 2 | 0)]; if (!w.onGround) continue; const loose = w.surf !== SURF.ASPHALT;
      if (snow > 0.3 && Math.random() < snow) { if (c.speed > 4 || w.slip > 0.4) spray(w.hit, c, SNOW_COL[w.surf], loose ? 1 : 0.8, loose ? 0.6 : 0.4); continue; }
      if (wet > 0.3 && Math.random() < wet) {
        if (loose && w.surf !== SURF.SNOW) { if (c.speed > 3 || w.slip > 0.4) { mud(w.hit, c, w.surf); if (Math.random() < 0.5) spray(w.hit, c, MUD_COL[w.surf], 0.9, 0.35); } }
        else if (c.speed > 8) spray(w.hit, c, 0xdde4ea, 0.9, 0.3);
        continue;
      }
      if ((loose && c.speed > 4) || w.slip > 0.5) puff(w.hit, w.surf, loose ? 1 : 0.6);
    }
  }

  // ---- minimap: north (+z) is up, which puts +x on the left, as in a true view from above ----
  const mm = $('minimap'), mctx = mm.getContext('2d'), MM = 300, K = MM / SIZE; mm.width = mm.height = MM;
  // on a big map the corner map shows a window round the car (MV), cut from the whole map painted once at MB pixels
  const MV = { cx: 0, cz: 0, span: Math.min(SIZE, 3300) }, MB = Math.round(MM * SIZE / MV.span);
  const mx = (x) => (MV.cx + MV.span / 2 - x) * MM / MV.span, my = (z) => (MV.cz + MV.span / 2 - z) * MM / MV.span;
  // the still part of the map (roads, sea, ramps, garages, race starts), painted once per size: the corner map, and the big map
  let seaImg = null;
  function paintBase(N, ls = 1, q = 1, v = { cx: 0, cz: 0, span: SIZE }) {   // ls: road width scale, q: symbol scale, v: the square shown
    const c = document.createElement('canvas'); c.width = c.height = N; const k = N / v.span, fx = (x) => (v.cx + v.span / 2 - x) * k, fy = (z) => (v.cz + v.span / 2 - z) * k;
    const g = c.getContext('2d'); g.lineCap = g.lineJoin = 'round';
    for (const rv of world.rivers || []) {   // rivers, under the roads, a little wider than they really are so they show
      g.strokeStyle = 'rgba(40,120,165,0.6)';
      g.lineWidth = Math.max(2 * ls, 2 * (rv.hw.reduce((a, b) => a + b, 0) / rv.n + 4) * k); g.setLineDash([]); g.beginPath();
      for (let i = 0; i < rv.n; i += 4) i ? g.lineTo(fx(rv.x[i]), fy(rv.z[i])) : g.moveTo(fx(rv.x[i]), fy(rv.z[i]));
      g.stroke();
    }
    g.fillStyle = 'rgba(214,206,190,0.75)';   // town buildings
    for (const t of world.towns || []) for (const o of t.buildings) { const s = Math.max(1.5, Math.max(o.w, o.d) * k); g.fillRect(fx(o.x) - s / 2, fy(o.z) - s / 2, s, s); }
    for (const road of world.roads.slice().reverse()) { g.beginPath(); for (let i = road.from; i <= road.to; i += 4) { const x = fx(road.x[i]), y = fy(road.z[i]); i === road.from ? g.moveTo(x, y) : g.lineTo(x, y); } if (road.closed) g.closePath(); g.strokeStyle = road.surf === SURF.ASPHALT ? '#f3efe4' : '#c79a5b'; g.lineWidth = (road.surf === SURF.ASPHALT ? 5 : 3) * ls; if (road.surf !== SURF.ASPHALT) g.setLineDash([7 * ls, 6 * ls]); else g.setLineDash([]); g.stroke(); }
    if (world.sea != null) {         // the sea, tinted blue (sampled once at corner map size, stretched for the big map)
      if (!seaImg) {
        const img = g.createImageData(MM, MM), d = img.data;
        for (let py = 0; py < MM; py++) for (let px = 0; px < MM; px++) if (world.sample(HALF - px / K, HALF - py / K) < world.waterAt(HALF - px / K, HALF - py / K)) { const o = (py * MM + px) * 4; d[o] = 40; d[o + 1] = 120; d[o + 2] = 165; d[o + 3] = 120; }
        seaImg = document.createElement('canvas'); seaImg.width = seaImg.height = MM; seaImg.getContext('2d').putImageData(img, 0, 0);
      }
      g.globalCompositeOperation = 'destination-over'; g.drawImage(seaImg, (HALF - v.cx - v.span / 2) * K, (HALF - v.cz - v.span / 2) * K, v.span * K, v.span * K, 0, 0, N, N); g.globalCompositeOperation = 'source-over';
    }
    const u = q, m = N / 2 - v.cx * k, mz = N / 2 - v.cz * k;   // the summit mark
    g.setLineDash([]); g.strokeStyle = 'rgba(243,239,228,0.7)'; g.lineWidth = 2.5 * ls; g.beginPath(); g.moveTo(m - 9 * u, mz + 6 * u); g.lineTo(m - 2 * u, mz - 8 * u); g.lineTo(m + 3 * u, mz - u); g.lineTo(m + 6 * u, mz - 5 * u); g.lineTo(m + 12 * u, mz + 6 * u); g.stroke();
    g.strokeStyle = '#0e1114'; g.lineWidth = 2.5 * q;
    for (const r of finds.ramps) { const x = fx(r.x + r.fx * 8), y = fy(r.z + r.fz * 8), a = Math.atan2(-r.fx, -r.fz); g.save(); g.translate(x, y); g.rotate(-a + Math.PI); g.scale(q, q); g.lineWidth = 2.5; g.fillStyle = '#e0662a'; g.beginPath(); g.moveTo(0, -8); g.lineTo(7, 6); g.lineTo(-7, 6); g.closePath(); g.fill(); g.stroke(); g.restore(); }   // jump ramps
    for (const t of traps) { const x = fx(t.x), y = fy(t.z); g.save(); g.translate(x, y); g.scale(q, q); g.lineWidth = 2; g.fillStyle = '#f2c230'; g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); }   // speed traps
    for (const z of zones) { const x = fx(z.x), y = fy(z.z); g.save(); g.translate(x, y); g.scale(q, q); g.lineWidth = 2.5; g.fillStyle = z.kind === 'garage' ? '#4f9dff' : '#a283ff'; g.beginPath(); if (z.kind === 'garage') g.rect(-7, -7, 14, 14); else { g.moveTo(0, -10); g.lineTo(9, 0); g.lineTo(0, 10); g.lineTo(-9, 0); g.closePath(); } g.fill(); g.stroke(); g.restore(); }
    return c;
  }
  const mapBase = paintBase(MB);
  // out past the map's east edge on the speedway: the corner map follows the car and draws the roads and Sundown Flats
  // as it goes, with the miles left to the town
  function farMap() {
    const x0 = MV.cx - MV.span / 2, x1 = MV.cx + MV.span / 2, z0 = MV.cz - MV.span / 2, z1 = MV.cz + MV.span / 2;
    mctx.lineCap = mctx.lineJoin = 'round';
    mctx.fillStyle = 'rgba(214,206,190,0.75)';
    for (const t of world.towns) for (const o of t.buildings) if (o.x > x0 && o.x < x1 && o.z > z0 && o.z < z1) { const s = Math.max(1.5, Math.max(o.w, o.d) * MM / MV.span); mctx.fillRect(mx(o.x) - s / 2, my(o.z) - s / 2, s, s); }
    for (const road of world.roads) {
      mctx.beginPath(); let on = false;
      for (let i = road.from; i <= road.to; i += 4) { const x = road.x[i], z = road.z[i]; if (x < x0 - 60 || x > x1 + 60 || z < z0 - 60 || z > z1 + 60) { on = false; continue; } if (on) mctx.lineTo(mx(x), my(z)); else { mctx.moveTo(mx(x), my(z)); on = true; } }
      if (road.closed && road.x[0] > x0 && road.x[0] < x1) mctx.closePath();
      mctx.strokeStyle = road.surf === SURF.ASPHALT ? '#f3efe4' : '#c79a5b'; mctx.lineWidth = 5; mctx.setLineDash([]); mctx.stroke();
    }
    const left = Math.max(0, (world.speedway.xE - car.pos.x) / 1609.34);
    mctx.font = '600 26px "Barlow Condensed", sans-serif'; mctx.textAlign = 'center'; mctx.fillStyle = '#f3efe4'; mctx.strokeStyle = 'rgba(14,17,20,0.8)'; mctx.lineWidth = 5;
    const label = left > 0.05 ? `${RG.farTown} ${left.toFixed(1)} mi` : RG.farTown;
    mctx.strokeText(label, MM / 2, MM - 18); mctx.fillText(label, MM / 2, MM - 18);
  }

  // ---- input, modes ----
  // title: the opening screen. roam: free driving with cargo runs. garage, offer (a race card), race, results.
  const input = createInput($('touch'), canvas);
  const tilt = createTilt(), wake = createWake(); input.tilt = tilt;
  // ---- controls the player has changed (menu, Controls) ----
  const kl = (id) => keyFor(input.binds, id) || '?', pl = (id) => buttonFor(input.binds, id, input.padKind()) || '?';
  const said = (id) => (input.pad ? pl(id) : kl(id));       // what to tell the player to press, for the device they use
  function keyText() {           // the hint card and the start screen list follow the bindings
    const b = input.binds, K = (id) => keysFor(b, id) || 'not set', P = (id) => buttonFor(b, id, input.padKind()) || 'not set', esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    $('hint').innerHTML = `<b>${esc(kl('reset'))}</b> back to road &nbsp; <b>${esc(kl('flip'))}</b> flip upright<br><b>${esc(kl('camera'))}</b> camera &nbsp; <b>Esc</b> menu and settings`;
    const d = document.querySelector('#start dl.keys.desk');
    if (d) d.innerHTML = [[`${K('gas')} · ${K('brake')}`, 'Gas · brake (hold at a stop to reverse)'], [`${K('left')} · ${K('right')}`, 'Steer'], [`${K('hand')} · ${K('nitro')}`, 'Handbrake for slides · nitro (once you buy the kit at a garage)'],
      ['Stop in a light', 'Amber loads cargo, green delivers. Blue is a garage, violet a race.'], [`${K('reset')} · ${K('flip')} · Esc`, 'Back to the road · flip upright · menu'], [`${K('map')} · ${K('photo')}`, 'Big map and marker · photo mode'],
      ['Controller', `${P('gas')} gas, ${P('brake')} brake, left stick steer, ${P('hand')} handbrake, ${P('nitro')} nitro, ${P('reset')} road, ${P('flip')} flip, ${P('camera')} camera, ${P('map')} map, ${P('pause')} menu`],
      ['Your controls', 'Change any key or controller button in the menu, Controls.']].map(([t, v]) => `<dt>${esc(t)}</dt><dd>${esc(v)}</dd>`).join('');
  }
  function useBinds() { input.setBinds(S().binds ? cleanBinds(S().binds) : defaultBinds()); keyText(); }
  function saveBinds() { input.setBinds(input.binds); S().binds = JSON.parse(JSON.stringify(input.binds)); store.commit(); keyText(); }
  useBinds();
  addEventListener('gamepadconnected', () => { keyText(); if (ui) ui.padChanged(); });
  addEventListener('gamepaddisconnected', () => { keyText(); if (ui) ui.padChanged(); });
  const shake = (pattern) => { if (S().buzz) buzz(pattern); };
  async function setTilt(on) {        // must run from a tap: iPhones ask before letting the page read the tilt
    if (!on) { tilt.disable(); S().tilt = false; store.commit(); return true; }
    const ok = await tilt.enable(); S().tilt = ok; store.commit();
    toast(ok ? 'Tilt steering on. Tilt the phone like a wheel; the arrows still work' : 'Tilt steering is not available in this browser', 3);
    return ok;
  }
  let mode = 'title', paused = false, race = null, raceNote = null, rivalVis = [], zone = null, armed = false, dwell = 0, resultsT = 0, doneN = 0, offT = 0;
  let camMode = 0, toastT = 0, showFps = false;
  const promptEl = $('prompt');
  const toast = (msg, t = 2.2) => { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = t; };
  const driving = () => (mode === 'roam' || mode === 'race' || mode === 'duel') && !paused;
  const hush = () => { toastT = 0; $('toast').classList.remove('show'); };
  function setMenu() { const m = !driving(); input.menu = m; document.body.classList.toggle('menu', m && mode !== 'title'); if (m || mode !== 'roam') promptEl.hidden = true; }
  function titleInfo() {
    const s = S(), n = Object.keys(s.cars).length, played = s.savedAt > 0;
    $('go').textContent = played ? 'Continue' : 'Start driving';
    $('saved').hidden = false; $('saved').textContent = (played ? `${money(s.cash)} in the bank and ${n} ${n === 1 ? 'car' : 'cars'} in the garage, in ${RG.name}. ` : '') + store.status();
  }

  function begin() {
    if (mode !== 'title') return;
    mode = 'roam'; armed = false; $('start').hidden = true; document.body.classList.add('playing'); audio.start(); setMenu(); canvas.focus();
    wake.set(true); if (S().tilt && coarse) setTilt(true);
    toast(RG.name, 2.6);
  }
  $('go').addEventListener('click', begin);
  addEventListener('keydown', (e) => { if (mode === 'title' && e.code === 'Space') { e.preventDefault(); begin(); } });
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) addEventListener(ev, () => { if (ev === 'pointerdown' || audio.on) audio.start(); }, { passive: true });   // phones only wake sound on a finished tap
  addEventListener('keydown', () => { if (audio.on) audio.start(); });
  addEventListener('gamepadconnected', () => toast('Controller connected'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });

  // garage
  let swing = 0.7, swingDir = 1, swingHold = 0, gView = { ox: 0, oy: 0, fw: 1, fh: 1 };
  function layoutGarage() {        // the part of the screen the garage panel leaves free, where the car is shown
    const c = canvas.getBoundingClientRect(), p = $('garage').getBoundingClientRect();
    if (!c.width || !p.width) return;
    if (p.width > c.width * 0.7) gView = { ox: 0, oy: (p.top - c.top) / 2 - c.height / 2, fw: c.width, fh: Math.max(80, p.top - c.top) };
    else gView = { ox: (p.right - c.left) / 2, oy: 0, fw: Math.max(80, c.right - p.right), fh: c.height };
  }
  function openGarage(g) {
    garageAt = g; mode = 'garage'; game.frozen = true; zone = null;
    const k = garages.indexOf(g); if (S().at !== k) { S().at = k; store.commit(); }
    car.place(g.x, g.z, g.yaw); camSnap = true; swing = 0.7; swingDir = 1; swingHold = 0;
    ui.openGarage(g); setMenu(); layoutGarage();
  }
  function leaveGarage() {
    if (mode !== 'garage') return;
    if (shownId !== S().car) showCar(S().car);         // a car that was only being looked at stays behind
    ui.closeGarage(); mode = 'roam'; game.frozen = false; armed = false; camSnap = true; setMenu(); canvas.focus();
  }
  let dragX = null;
  canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; });
  addEventListener('pointerup', () => { dragX = null; }); addEventListener('pointercancel', () => { dragX = null; });
  canvas.addEventListener('pointermove', (e) => { if (mode !== 'garage' || dragX == null) return; swing = clamp(swing - (e.clientX - dragX) * 0.008, -1.2, 1.2); dragX = e.clientX; swingHold = 4; });

  // races
  const groupOf = (def) => races.filter((d) => d.spot === def.spot);
  const lastRace = {};              // the event last shown at each start light, so the card opens on it again
  function openOffer(def) { mode = 'offer'; zone = null; ui.offer(def, groupOf(def)); setMenu(); }
  function declineRace() { if (mode !== 'offer') return; ui.close(); mode = 'roam'; armed = false; setMenu(); canvas.focus(); }
  // ---- ghost: the best run in this event, played back as a see-through car; the current run is recorded ----
  let ghost = null, ghostVis = null, rec = null;
  const gP = new THREE.Vector3(), gQ = new THREE.Quaternion();
  function showGhost(g) {
    const v = buildCar(buildSpec(g.car && CARS[g.car] ? g.car : 'hatch', g.up), { paint: (PAINTS[g.paint] || PAINTS[0]).hex }), mats = [];
    v.car.traverse((o) => {
      if (!o.isMesh) return; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 2;
      const one = (m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.3; c.depthWrite = false; mats.push(c); return c; };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
    if (v.blob) v.blob.visible = false; if (v.cargo) v.cargo.visible = false;
    v.mats = mats; scene.add(v.car); return v;
  }
  function dropGhost() { if (ghostVis) { scene.remove(ghostVis.car); ghostVis.mats.forEach((m) => m.dispose()); ghostVis.dispose(); } ghostVis = null; ghost = null; rec = null; }
  const ghostTime = (def) => { const g = loadGhost(def.id); return g ? g.time : null; };
  // driving tests run in the plain school car; the player's own car comes back when the test is over
  const schoolTests = buildTests(world);
  function schoolCar(on) {
    if (on) { car.applySpec(buildSpec(SCHOOL_CAR)); if (vis) { scene.remove(vis.car); vis.dispose(); } vis = buildCar(car.spec, { paint: PAINTS[SCHOOL_PAINT_INDEX].hex }); scene.add(vis.car); flames = []; shownId = 'school'; audio.setCar(CARS[SCHOOL_CAR].sound); }
    else if (shownId === 'school') { car.applySpec(specOf(S().car)); dress(S().car); }
  }
  function clearRace() { schoolCar(false); dropGhost(); for (const v of rivalVis) { scene.remove(v.car); v.dispose(); } rivalVis = []; race = null; for (const b of gateBeams) b.visible = false; }
  function startRace(def, level) {
    ui.close(); clearRace(); traffic.clear();
    if (def.school) { level = 1; schoolCar(true); }
    race = new Race(world, def, car, level ?? (S().kid ? KID_LEVEL : S().level)); game.frozen = true;
    rivalVis = race.rivals.map((r) => { const v = buildCar(r.spec, { paint: PAINTS[r.paint].hex, number: r.num }); scene.add(v.car); return v; });
    { const own = def.school ? { paint: SCHOOL_PAINT_INDEX, up: [0, 0, 0, 0] } : S().cars[S().car]; rec = new GhostRecorder({ car: def.school ? SCHOOL_CAR : S().car, paint: own.paint, up: own.up.slice() }); ghost = S().ghost !== false ? loadGhost(def.id) : null; if (ghost) ghostVis = showGhost(ghost); }
    for (const v of patrolVis) v.car.visible = false;
    mode = 'race'; paused = false; camSnap = true; resultsT = 0; doneN = 0; offT = 0; hush(); setMenu(); canvas.focus();
  }
  function endRace() {             // back to free driving from wherever the car is
    ui.close(); clearRace(); game.frozen = false; game.scatter(); for (const v of patrolVis) v.car.visible = true;
    mode = 'roam'; paused = false; armed = false; hush(); setMenu(); canvas.focus();
  }

  // ---- two players, one screen: a head-to-head race, the screen split in two (side by side when wide, else stacked) ----
  let duel = null, car2 = null, vis2 = null, duelSet = null, duoDoneT = 0, duoHudT = 0;
  const duoUp = [0, 0], cam2 = new THREE.PerspectiveCamera(62, 1, camera.near, camera.far), cam2Dir = new THREE.Vector3(0, 0, 1);
  const duoEl = $('duo'), duoP = [0, 1].map((i) => ({ box: $('duo-p' + i), speed: $('duo-s' + i), lbl: $('duo-l' + i), place: $('duo-n' + i), arrow: $('duo-a' + i), time: $('duo-t' + i) }));
  const wideSplit = () => canvas.clientWidth >= canvas.clientHeight;
  // the open map for two: side by side on the nearest road to where player 1 is now
  function openMap2() { const r = world.nearestRoad(car.pos.x, car.pos.z); return { id: 'free', name: 'Open map', free: true, start: { x: r.x, z: r.z, yaw: r.yaw } }; }
  function startDuel(def, p2id) {
    if (game.job) { toast('Deliver or lose the cargo first', 2.4); return; }
    ui.close(); clearRace(); dropDuel(); traffic.clear();
    duelSet = { def, p2: p2id };
    car2 = new Vehicle(world, specOf(p2id)); const p1c = paintOf(S().car), p2c = paintOf(p2id) === p1c ? (p1c === PAINTS[4].hex ? PAINTS[1].hex : PAINTS[4].hex) : paintOf(p2id);   // never two cars the same colour
    vis2 = buildCar(car2.spec, { paint: p2c, number: 2 }); scene.add(vis2.car);
    duel = new Duel(world, def, [car, car2]); game.frozen = true; input.duo = true;
    for (const v of patrolVis) v.car.visible = false;
    document.body.classList.add('duo'); duoEl.hidden = false; duoDoneT = 0; duoUp[0] = duoUp[1] = 0;
    mode = 'duel'; paused = false; camSnap = true; cam2Dir.copy(car2.fwd).setY(0).normalize(); cam2.position.copy(car2.pos).addScaledVector(cam2Dir, -7).add(new THREE.Vector3(0, 2.7, 0));
    hush(); setMenu(); canvas.focus();
  }
  function dropDuel() {
    if (vis2) { scene.remove(vis2.car); vis2.dispose(); }
    vis2 = null; car2 = null; duel = null; input.duo = false; for (const b of gateBeams) b.visible = false;
    document.body.classList.remove('duo'); duoEl.hidden = true;
    renderer.setScissorTest(false); const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setViewport(0, 0, w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function endDuel() { ui.close(); dropDuel(); game.frozen = false; game.scatter(); for (const v of patrolVis) v.car.visible = true; mode = 'roam'; paused = false; armed = false; camSnap = true; hush(); setMenu(); canvas.focus(); }
  function duelEvents() {
    for (const e of duel.events.splice(0)) {
      if (e.type === 'count') { ui.showCount(String(e.n)); audio.count(false); }
      else if (e.type === 'go') { ui.showCount('GO', true); audio.count(true); }
      else if (e.type === 'gate') audio.gate();
      else if (e.type === 'home') { toast(`${P_NAMES[e.who]} finishes ${e.place === 1 ? 'first' : 'second'}! ${clock(e.time)}`, 2.6); audio.chime(e.place === 1 ? [523, 659, 784, 1047] : [523, 659]); }
      else if (e.type === 'finish') duoDoneT = 2.2;
    }
  }
  function duelStep(two) {        // one physics step for both cars
    const kid = S().kid, a = kid ? kidInput(car, two[0], kidOut) : two[0], b = kid ? kidInput(car2, two[1], kidOut2) : two[1];   // kid mode drives both cars' pedals
    car.step(STEP, duel.input(0, a)); car2.step(STEP, duel.input(1, b)); duel.step(STEP);
    skids.car(car, 'p', two[0].handbrake); skids.car(car2, 'q', two[1].handbrake);
    for (let i = 0; i < 2; i++) if (duel.bump[i] > 3) { hit(duel.bump[i] + 4); duel.bump[i] = 0; }
  }
  function duelTick(dt) {          // once per frame: the countdown, events, getting stuck players going again
    duel.update(dt); duelEvents();
    [car, car2].forEach((c, i) => {
      if (c.up.y < 0.35 && c.speed < 2) { duoUp[i] += dt; if (duoUp[i] > 1.5) { duoUp[i] = 0; c.place(c.pos.x, c.pos.z, Math.atan2(c.fwd.x, c.fwd.z), 1.0); } } else duoUp[i] = 0;
      if (world.sea != null && c.pos.y < world.waterAt(c.pos.x, c.pos.z) - 0.6) { duel.resetPlayer(i); audio.splash(); }
    });
    if (duoDoneT > 0 && (duoDoneT -= dt) <= 0) { mode = 'duelres'; ui.duelResults(duel.result, duelSet); setMenu(); }
  }
  function chase2(dt) {            // player 2's chase camera
    const c = car2, v = new THREE.Vector3().copy(c.fwd).setY(0);
    if (v.lengthSq() < 0.01) v.copy(cam2Dir); v.normalize();
    if (c.vel.dot(c.fwd) > 6) { const l = new THREE.Vector3().copy(c.vel).setY(0).normalize(); v.lerp(l, 0.45).normalize(); }
    const jump = cam2.position.distanceToSquared(c.pos) > 80 * 80;
    cam2Dir.lerp(v, jump ? 1 : 1 - Math.exp(-dt * 3.2)).normalize();
    const big = c.spec.box.z - 2, dist = 7.2 + big * 1.6 + c.speed * 0.035, t = new THREE.Vector3().copy(c.pos).addScaledVector(cam2Dir, -dist); t.y += 2.7 + big * 0.5;
    cam2.position.lerp(t, jump ? 1 : 1 - Math.exp(-dt * 9));
    const gh = world.sample(cam2.position.x, cam2.position.z) + 1.0; if (cam2.position.y < gh) cam2.position.y = gh;
    cam2.lookAt(new THREE.Vector3().copy(c.pos).addScaledVector(cam2Dir, 5).add(new THREE.Vector3(0, 1, 0)));
    cam2.fov += (62 + Math.min(18, c.speed * 0.28) - cam2.fov) * Math.min(1, dt * 3);
  }
  function renderDuo() {           // two pictures, one per player
    const w = canvas.clientWidth, h = canvas.clientHeight, wide = wideSplit(), hw = wide ? Math.floor(w / 2) : w, hh = wide ? h : Math.floor(h / 2);
    if (camera.view) camera.clearViewOffset();
    renderer.setScissorTest(true);
    const views = wide ? [[0, 0], [hw, 0]] : [[0, h - hh], [0, 0]];   // player 1 left or on top
    [camera, cam2].forEach((cam, i) => {
      const [x, y] = views[i]; cam.aspect = hw / hh; cam.updateProjectionMatrix();
      renderer.setViewport(x, y, hw, hh); renderer.setScissor(x, y, hw, hh); renderer.render(scene, cam);
    });
    renderer.setScissorTest(false);
    duoEl.classList.toggle('wide', wide);
  }
  function duoHud() {
    if (!duel) return;
    const pl = duel.places(), m = metric();
    [car, car2].forEach((c, i) => {
      const P = duoP[i], q = duel.players[i], g = duel.next(i);
      P.speed.textContent = Math.round(c.speed * (m ? 3.6 : 2.23694)) + (m ? ' km/h' : ' mph');
      if (duel.free) {             // open map: how far apart the two are, and an arrow to the other car
        const o = i ? car : car2, dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
        P.lbl.textContent = 'Open map · arrow to ' + P_NAMES[1 - i]; P.time.textContent = clock(duel.clock);
        P.place.textContent = m ? (d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km') : (d < 161 ? Math.round(d * 3.28084) + ' ft' : (d / 1609.34).toFixed(1) + ' mi');
        P.arrow.style.visibility = 'visible'; P.arrow.style.transform = `rotate(${(-Math.atan2(dx * c.fwd.z - dz * c.fwd.x, dx * c.fwd.x + dz * c.fwd.z)).toFixed(2)}rad)`;
        return;
      }
      P.lbl.textContent = duel.state === 'count' ? 'Get ready' : q.time != null ? 'Finished' : `Checkpoint ${q.gate + 1} of ${duel.gates.length}` + (duel.laps > 1 ? ` · lap ${q.lap + 1} of ${duel.laps}` : '');
      P.place.textContent = PLACES[pl[i] - 1]; P.time.textContent = clock(q.time != null ? q.time : duel.clock);
      P.arrow.style.visibility = g ? 'visible' : 'hidden';
      if (g) { const dx = g.x - c.pos.x, dz = g.z - c.pos.z; P.arrow.style.transform = `rotate(${(-Math.atan2(dx * c.fwd.z - dz * c.fwd.x, dx * c.fwd.x + dz * c.fwd.z)).toFixed(2)}rad)`; }
    });
  }
  function raceEvents() {
    for (const e of race.events.splice(0)) {
      if (e.type === 'count') { ui.showCount(String(e.n)); audio.count(false); }
      else if (e.type === 'go') { ui.showCount('GO', true); audio.count(true); }
      else if (e.type === 'gate') {
        audio.gate();
        if (rec) { rec.split(race.t); const k = rec.splits.length - 1, gt = ghost && ghost.splits[k];
          if (gt != null) { const d = race.t - gt; toast(Math.abs(d) < 0.05 ? 'Level with your ghost' : `${Math.abs(d).toFixed(1)} s ${d < 0 ? 'ahead of' : 'behind'} your ghost`, 1.6); } }
      }
      else if (e.type === 'finish') {
        const def = race.def, s = S(), prev = s.best[def.id], road = def.kind !== 'trial', rank = road ? e.pos : e.medal + 1, won = rank === 1, rk = rankKey(def.id, race.level);
        raceNote = { best: !prev || e.time < prev, prev };
        if (raceNote.best) s.best[def.id] = Math.round(e.time * 100) / 100;
        if (ghost) { const d = e.time - ghost.time; raceNote.ghost = d < 0 ? `You beat your ghost by ${(-d).toFixed(1)} s. This run is your new ghost.` : `Your ghost was ${d.toFixed(1)} s quicker.`; }
        if (rec && (raceNote.best || !loadGhost(def.id))) { if (saveGhost(def.id, encodeGhost(rec, e.time)) && !ghost) raceNote.ghost = 'Ghost saved: race this event again to chase it.'; }
        if (def.school) e.prize = race.result.prize = improvePay(rank, s.rank[rk] || 0);   // a driving test pays a better medal once
        if (rank && (!s.rank[rk] || rank < s.rank[rk])) s.rank[rk] = rank;
        if (rank && !def.school) daily('race', rank);
        s.cash += e.prize; if (def.cup) cupScore(def, e); store.commit();
        audio.chime(won ? [523, 659, 784, 1047, 1319] : rank ? [523, 659, 784] : [392, 330]);
        toast(road ? `Finished ${PLACES[e.pos - 1]}` : e.medal >= 0 ? `${MEDALS[e.medal]} medal` : 'Finished', 2.4);
        resultsT = 2.4;
      }
    }
  }

  // ---- championship: one cup per region, three rounds in a row, saved between rounds ----
  const myCup = () => { const c = S().cup; return c && c.r === world.region ? c : null; };
  const teamsHere = cupTeams(races), teamCar = (num) => { const k = teamsHere.findIndex((t) => t.num === num); const d = cupRound(races, world.region, 0); return k >= 0 ? CARS[d.rivals[k].car].base.name : ''; };
  const cupInfo = () => ({ name: CUP_NAME[world.region], cup: myCup(), best: S().cups[world.region] || 0, rounds: CUP_ROUNDS.map((b) => races.find((d) => d.base === b)),
    teams: teamsHere.map((t) => ({ ...t, car: teamCar(t.num) })), carName: CARS[CUP_CAR].base.name, carWon: !!S().cars[CUP_CAR] });
  function startCup() {
    let c = myCup(); const s = S();
    if (!c) { c = s.cup = newCup(world.region, s.kid ? KID_LEVEL : s.level, teamsHere); store.commit(); }
    startRace(cupRound(races, world.region, c.round), c.lv);
  }
  function cupScore(def, e) {        // a cup round has finished: points, and at the end the purse, the trophy and maybe the car
    const s = S(), c = myCup(); if (!c || c.round !== def.cup.round || !e.table) return;
    const got = scoreRound(c, e.table), over = cupOver(c), note = { name: def.cup.name, cup: JSON.parse(JSON.stringify(c)), got, round: c.round, over };
    if (!over) note.next = races.find((d) => d.base === CUP_ROUNDS[c.round]).name;
    else {
      const place = note.place = cupPlace(c); note.prize = purse(place, c.lv); s.cash += note.prize;
      if (!s.cups[world.region] || place < s.cups[world.region]) s.cups[world.region] = place;
      s.cup = null;
      if (place === 1 && !s.cars[CUP_CAR] && REGION_IDS.every((r) => s.cups[r] === 1)) { s.cars[CUP_CAR] = { up: [0, 0, 0, 0], tune: stockTune(CUP_CAR), paint: CARS[CUP_CAR].paint }; note.car = CARS[CUP_CAR].base.name; }
    }
    raceNote.cup = note;
  }
  // ---- photo mode: the game holds still, the dash goes, and the camera can be moved around the car ----
  const PH = { on: false, yaw: 0, pitch: 0.22, dist: 8, pts: new Map(), pinch: 0 };
  function openPhoto() {
    if (!paused || PH.on) return;
    ui.close(); PH.on = true;
    const dx = camera.position.x - car.pos.x, dz = camera.position.z - car.pos.z;
    PH.yaw = Math.atan2(dx, dz); PH.dist = clamp(Math.hypot(dx, dz), 4, 20); PH.pitch = 0.22; $('ph-zoom').value = PH.dist;
    document.body.classList.add('photo'); $('photo').hidden = false; $('shot').hidden = true; hush(); focusBtn($('ph-snap'));
  }
  function closePhoto() {
    if (!PH.on) return;
    PH.on = false; PH.pts.clear(); document.body.classList.remove('photo'); $('photo').hidden = true; $('shot').hidden = true; camSnap = true; resume();
  }
  const focusBtn = (b) => { try { b.focus({ preventScroll: true }); } catch (_) {} };
  function snap() {               // draw one frame and keep it as a picture
    if (!PH.on) return;
    updateCamera(0); renderer.render(scene, camera);
    let url = ''; try { url = canvas.toDataURL('image/jpeg', 0.92); } catch (_) {}
    if (!url || url.length < 2000) { toast('This browser would not take the picture', 2.4); return; }
    const d = new Date(), stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
    $('shot-img').src = url; $('shot-dl').href = url; $('shot-dl').download = `highline-run-${stamp}.jpg`; $('shot').hidden = false; audio.click(); focusBtn($('shot-dl'));
  }
  // Inside the Claude viewer a plain download link is blocked, so save through its downloads helper
  // when there is one; anywhere else (like GitHub Pages) the plain link does the job.
  let dlApi = null;
  try { window.claude?.use?.('downloads')?.then((d) => { dlApi = d || null; }, () => {}); } catch (_) {}
  $('shot-dl').addEventListener('click', (e) => {
    if (!dlApi) return;
    e.preventDefault();
    const a = $('shot-dl'), url = a.href, name = a.download || 'highline-run.jpg';
    let blob;
    try {
      const bin = atob(url.split(',')[1] || ''), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      blob = new Blob([buf], { type: 'image/jpeg' });
    } catch (_) { toast('Could not save the picture', 2.4); return; }
    dlApi.save({ filename: name, data: blob }).then(
      (r) => { if (r && r.status === 'saved') toast('Picture saved', 2); },
      (err) => {
        const c = err && err.code;
        if (c === 'declined') return;
        if (c === 'rate_limited') toast('One moment, then try again', 2.2);
        else toast('Saving is not available here. Press and hold the picture instead', 3);
      });
  });
  $('ph-snap').addEventListener('click', snap); $('ph-done').addEventListener('click', closePhoto);
  $('shot-back').addEventListener('click', () => { $('shot').hidden = true; focusBtn($('ph-snap')); });
  $('ph-zoom').addEventListener('input', (e) => { PH.dist = +e.target.value; });
  canvas.addEventListener('pointerdown', (e) => { if (PH.on) { PH.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); PH.pinch = 0; } });
  canvas.addEventListener('pointermove', (e) => {
    const pt = PH.on && PH.pts.get(e.pointerId); if (!pt) return;
    if (PH.pts.size >= 2) {        // two fingers: pinch to zoom
      pt.x = e.clientX; pt.y = e.clientY; const [a, b] = [...PH.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (PH.pinch) { PH.dist = clamp(PH.dist * PH.pinch / d, 3.5, 30); $('ph-zoom').value = PH.dist; } PH.pinch = d; return;
    }
    PH.yaw -= (e.clientX - pt.x) * 0.008; PH.pitch = clamp(PH.pitch + (e.clientY - pt.y) * 0.006, -0.05, 1.35); pt.x = e.clientX; pt.y = e.clientY;
  });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => { PH.pts.delete(e.pointerId); PH.pinch = 0; });
  canvas.addEventListener('wheel', (e) => { if (!PH.on) return; e.preventDefault(); PH.dist = clamp(PH.dist * (1 + Math.sign(e.deltaY) * 0.1), 3.5, 30); $('ph-zoom').value = PH.dist; }, { passive: false });
  // pause menu and settings
  // ---- big map: tap the corner map (or G, or Map in the menu); tap a place on it to set a marker the arrow points to ----
  const MAP = { on: false }, navPts = mapPoints(zones, game.sites);
  const BM = 720, VIEW = mapView(navPts, world.roads, SIZE), BK = BM / VIEW.span, bx = (x) => (VIEW.cx + VIEW.span / 2 - x) * BK, by = (z) => (VIEW.cz + VIEW.span / 2 - z) * BK;
  let nav = null, bigBase = null;
  const bmc = $('bm-c'), bctx = bmc.getContext('2d'); bmc.width = bmc.height = BM;
  function navNote() { $('bm-note').textContent = nav ? `Marker: ${nav.name} · ${distText(Math.hypot(nav.x - car.pos.x, nav.z - car.pos.z))}` : 'Tap a place to set a marker'; $('bm-clear').disabled = !nav; }
  function drawPin(g, x, y, s) { g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = '#ff6fae'; g.strokeStyle = '#0e1114'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(-6, -11); g.arc(0, -15, 7.5, Math.PI * 0.8, Math.PI * 0.2); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -15, 2.8, 0, Math.PI * 2); g.fill(); g.restore(); }
  function drawBig() {
    if (!bigBase) bigBase = paintBase(BM, 1.5, 1.6, VIEW);
    const g = bctx, job = game.job, racing = mode === 'race' || mode === 'results';
    g.clearRect(0, 0, BM, BM); g.drawImage(bigBase, 0, 0);
    const spot = (x, z, r, c) => { g.beginPath(); g.arc(bx(x), by(z), r, 0, Math.PI * 2); g.fillStyle = c; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#0e1114'; g.stroke(); };
    if (racing && race) { for (let i = race.gates.length - 1; i >= race.gate; i--) { const gt = race.gates[i]; spot(gt.x, gt.z, i === race.gate ? 11 : 5, i === race.gate ? '#62dcea' : 'rgba(98,220,234,.8)'); } }
    else for (const st of game.sites) { const isDrop = job && job.to === st, isPick = !job && game.offers.includes(st);
      if (isDrop || isPick) spot(st.x, st.z, isDrop ? 14 : 11, isDrop ? '#54d17a' : '#f2b33d'); else { g.fillStyle = 'rgba(243,239,228,0.5)'; g.fillRect(bx(st.x) - 4.5, by(st.z) - 4.5, 9, 9); } }
    g.font = '600 21px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textBaseline = 'bottom'; g.lineJoin = 'round';
    const boxes = [];
    for (const t of world.towns) {   // town names, in white, beside the town away from the garage name
      if (t.far) continue;
      const xs = t.buildings.map((o) => bx(o.x)), zs = t.buildings.map((o) => by(o.z)), x = xs.reduce((a, b) => a + b, 0) / xs.length, w = g.measureText(t.name).width;
      const y = Math.max(26, Math.min(...zs) - 8), l = Math.max(4, Math.min(BM - w - 4, x - w / 2));
      boxes.push({ l, r: l + w, t: y - 21, b: y }); g.textAlign = 'left';
      g.lineWidth = 5; g.strokeStyle = 'rgba(14,17,20,.85)'; g.strokeText(t.name, l, y); g.fillStyle = '#f3efe4'; g.fillText(t.name, l, y);
    }
    for (const z of zones) {      // names over the garages and race starts; under the mark if that spot is taken
      const name = z.kind === 'garage' ? z.g.name : z.label, x = bx(z.x), w = g.measureText(name).width;
      const al = x < w / 2 + 8 ? 'left' : x > BM - w / 2 - 8 ? 'right' : 'center', l = al === 'left' ? x - 8 : al === 'right' ? x - w + 8 : x - w / 2;
      let y = Math.max(26, by(z.z) - 20);
      const hits = (yy) => boxes.some((b) => l < b.r && l + w > b.l && yy - 21 < b.b && yy > b.t);
      if (hits(y)) y = by(z.z) + 40; if (hits(y)) y = by(z.z) + 66;
      boxes.push({ l, r: l + w, t: y - 21, b: y }); g.textAlign = al;
      g.lineWidth = 5; g.strokeStyle = 'rgba(14,17,20,.85)'; g.strokeText(name, al === 'left' ? x - 8 : al === 'right' ? x + 8 : x, y); g.fillStyle = z.kind === 'garage' ? '#9cc6ff' : '#cdbbff'; g.fillText(name, al === 'left' ? x - 8 : al === 'right' ? x + 8 : x, y);
    }
    if (nav) drawPin(g, bx(nav.x), by(nav.z), 1.7);
    const off = Math.abs(car.pos.x) > HALF || Math.abs(car.pos.z) > HALF;   // out on the speedway's interstate: the arrow waits at the map's edge
    if (off && world.speedway) {
      const left = Math.max(0, (world.speedway.xE - car.pos.x) / 1609.34), back = Math.max(0, (car.pos.x - world.speedway.xI) / 1609.34), txt = left > 0.05 ? `On ${RG.interstate}: ${RG.farTown} ${left.toFixed(1)} mi, ${RG.towns[0]} ${back.toFixed(1)} mi back` : `In ${RG.farTown}, ${RG.towns[0]} ${back.toFixed(0)} mi back`;
      g.textAlign = 'left'; g.lineWidth = 5; g.strokeStyle = 'rgba(14,17,20,.85)'; g.strokeText(txt, 12, BM - 14); g.fillStyle = '#f3efe4'; g.fillText(txt, 12, BM - 14);
    }
    g.save(); g.translate(Math.max(14, Math.min(BM - 14, bx(car.pos.x))), Math.max(14, Math.min(BM - 14, by(car.pos.z)))); g.rotate(-Math.atan2(car.fwd.x, car.fwd.z)); g.scale(1.6, 1.6); g.fillStyle = '#e04a2f'; g.strokeStyle = '#0e1114'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -13); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.stroke(); g.fill(); g.restore();
    navNote();
  }
  function setNav(m) { nav = m ? { ...m, y: world.sample(m.x, m.z) } : null; if (MAP.on) drawBig(); }
  function openMap() {
    if (MAP.on || PH.on) return;
    if (driving()) pause();
    if (!paused) return;
    ui.close(); MAP.on = true; document.body.classList.add('bigmap'); $('bigmap').hidden = false; hush(); drawBig(); focusBtn($('bm-done'));
  }
  function closeMap() { if (!MAP.on) return; MAP.on = false; document.body.classList.remove('bigmap'); $('bigmap').hidden = true; resume(); }
  bmc.addEventListener('click', (e) => {
    const r = bmc.getBoundingClientRect(); if (!r.width) return;
    const px = (e.clientX - r.left) / r.width * BM, py = (e.clientY - r.top) / r.height * BM, w = pixelToWorld(px, py, BM, VIEW);
    setNav(pickPoint(navPts, w.x, w.z, 24 * BM / r.width / BK)); audio.click();
  });
  $('bm-clear').addEventListener('click', () => { setNav(null); audio.click(); focusBtn($('bm-done')); });
  $('bm-done').addEventListener('click', closeMap);
  $('mapbox').addEventListener('click', () => { if (driving()) openMap(); });

  function pause() { if (!driving()) return; paused = true; ui.pause(); setMenu(); }
  function resume() { if (!paused) return; paused = false; ui.close(); setMenu(); canvas.focus(); }
  const setUnits = () => { S().units = metric() ? 'imperial' : 'metric'; store.commit(); };
  const setMute = () => { S().muted = !S().muted; audio.setMuted(S().muted); store.commit(); };
  const setMusic = () => { S().music = !S().music; audio.setMusic(S().music); store.commit(); };
  // kid mode: the car drives itself, the GO and SLIDE buttons go, cargo jobs allow more time and patrols bust more slowly
  const showKid = () => { const on = S().kid; game.kid = on; document.body.classList.toggle('kid', on); const b = $('kidbtn'); b.textContent = 'Kid mode: ' + (on ? 'on' : 'off'); b.setAttribute('aria-pressed', String(on));  showNitro(); };
  function setKid(on) {
    S().kid = on; store.commit(); showKid();
    if (mode !== 'title') toast(on ? (coarse ? 'Kid mode on. The car drives itself: just steer, hold ■ to stop' : 'Kid mode on. The car drives itself: just steer, hold brake to stop') : 'Kid mode off', 3.2);
  }
  $('kidbtn').addEventListener('click', () => { audio.click(); setKid(!S().kid); });
  showKid();
  function resetProgress() {
    ui.close(); clearRace(); store.reset(); clearGhosts(); garageAt = garages[0];
    game.job = null; game.rival = null; game.offers = []; game.kinds.clear(); game.refill(null); game.frozen = false; game.scatter(); for (const v of patrolVis) v.car.visible = true;
    showCar(S().car); audio.setMuted(false); crateVis.forEach((v) => { v.visible = true; }); showBarnCar();
    mode = 'roam'; paused = false; armed = false; setMenu(); canvas.focus(); toast('Progress erased. Starting over', 3);
  }
  // progress saved on another device has just arrived: switch to it at a quiet moment
  function applyRemote() {
    pendingRemote = false; const s = S();
    if (s.region !== world.region) { travel(s.region, true); return; }
    garageAt = garages[s.at] || garages[0]; showCar(s.car); crateVis.forEach((v, i) => { v.visible = !crateGot(i); }); showBarnCar(); audio.setMuted(s.muted); audio.setMusic(s.music); if (s.tod !== DAY.tod && (DAY.tod || s.tod !== 'day')) setTime(s.tod); armed = false; titleInfo(); showKid(); useBinds();
    if (mode !== 'title') toast('Loaded your saved progress', 3);
  }

  // Going to another region rebuilds the whole world, so the page starts again there. The save already says where to go
  // (and the address says it too, for a browser that cannot keep the save).
  let leaving = false;
  function travel(id, already) {
    if (leaving || !REGIONS[id]) return; leaving = true;
    if (!already) { S().region = id; S().at = 0; store.commit(); }
    store.flush();
    $('start').hidden = false; $('go').hidden = true; $('saved').hidden = true; $('loading').hidden = false; $('loading').textContent = 'Driving to ' + REGIONS[id].name + '…';
    document.body.classList.remove('playing'); mode = 'title'; setMenu();
    const t0 = Date.now(), go = () => { if (store.cloud === 'saving' && Date.now() - t0 < 2500) { setTimeout(go, 100); return; } location.hash = 'r=' + id; location.reload(); };
    setTimeout(go, 250);
    setTimeout(() => { $('loading').textContent = 'Close the game and open it again to arrive in ' + REGIONS[id].name + '.'; }, 9000);
  }

  ui = createUI({
    region: world.region, travel,
    store, audio, metric, showCar, leaveGarage, startRace, declineRace,
    pickRace: (def) => { if (mode === 'offer') { lastRace[def.spot] = def.id; ui.offer(def, groupOf(def)); } }, setLevel: (i) => { S().level = i; store.commit(); },
    raceDone: endRace, raceAgain: () => startRace(race.def),
    pickCup: () => { if (mode === 'offer') { lastRace.ring = 'cup'; ui.cupOffer(groupOf(races.find((d) => d.base === CUP_ROUNDS[0]))); } }, cupInfo, startCup, dropCup: () => { S().cup = null; store.commit(); },
    nextCupRound: () => { const c = myCup(); if (c) startRace(cupRound(races, world.region, c.round), c.lv); else endRace(); },
    racing: () => mode === 'race' || mode === 'duel', resume, restartRace: () => (duel ? startDuel(duelSet.def, duelSet.p2) : startRace(race.def)), quitRace: () => (duel ? endDuel() : endRace()),
    duelInfo: () => ({ events: [{ id: 'free', name: 'Open map', short: 'Open map', free: true }, ...races.map((d) => ({ id: d.id, name: d.name, short: d.short || d.name, laps: d.laps || 1 }))], cars: Object.keys(S().cars), p1: S().car, touch: coarse, pads: input.pads || 0 }),
    fullInfo: () => ({ can: full.can, on: full.on, desk: !!desk }), toggleFull: () => full.toggle(), quit: () => { if (desk) { store.commit(); desk.quit(); } },
    startDuel: (evId, carId) => startDuel(evId === 'free' ? openMap2() : races.find((d) => d.id === evId), carId), duoFree: () => !!(duel && duel.free), endDuel,
    binds: () => input.binds, capture: (kind, done) => input.capture(kind, done), cancelCapture: () => input.cancelCapture(), padInfo: () => ({ name: input.padName(), kind: input.padKind() }),
    setBind: (set, id, slot, v) => { const from = setBind(input.binds, set, id, slot, v); saveBinds(); return from; }, resetBinds: (set) => { resetSet(input.binds, set); saveBinds(); },
    setPadStyle: (st) => { if (STYLES.includes(st)) { input.binds.style = st; saveBinds(); } }, keyLabel: kl, padLabel: pl, duelBack: () => (mode === 'duelres' ? endDuel() : resume()),
    options: () => ({ metric: metric(), muted: S().muted, music: S().music, tod: TOD_NAME[S().tod], weather: WEATHER_MODE_NAME[S().weather], goals: (() => { const a = allGoals(S()); return { done: a.filter((q) => S().done.includes(q.id)).length, all: a.length }; })(), fps: showFps, kid: S().kid, touch: coarse, tilt: S().tilt, canBuzz: canBuzz(), buzz: S().buzz }), toggleKid: () => setKid(!S().kid),
    toggleUnits: setUnits, toggleMute: setMute, toggleMusic: setMusic, nextWeather: () => { setWeather(WEATHER_MODES[(WEATHER_MODES.indexOf(S().weather) + 1) % WEATHER_MODES.length]); store.commit(); }, ghostTime, setGhost: (on) => { S().ghost = on; store.commit(); }, nextTime: () => { setTime(TOD[(TOD.indexOf(S().tod) + 1) % TOD.length]); store.commit(); }, toggleFps: () => { showFps = !showFps; if (!showFps) $('fps').textContent = ''; },
    findHints, findCars: () => FIND_IDS, showNitro,
    toggleTilt: () => setTilt(!S().tilt).then(() => { if (paused) ui.pause(); }), toggleBuzz: () => { S().buzz = !S().buzz; store.commit(); if (S().buzz) buzz(40); },
    photo: openPhoto, map: openMap, dailyInfo, tipsOn: () => S().tipsOn, cruiseOn: () => !!S().cruise, toggleCruise: () => { S().cruise = !S().cruise; store.commit(); toast(S().cruise ? (S().kid ? 'Auto throttle on (kid mode keeps its own speed while it is on)' : 'Auto throttle on: up to 80 mph. Press the throttle to go faster, brake to slow down') : 'Auto throttle off', 3); }, schoolTests: () => schoolTests, startTest: (id) => { const d = schoolTests.find((q) => q.id === id); if (!d) return; if (game.job) { toast('Deliver or lose the cargo first', 2.4); return; } if (duel) endDuel(); startRace(d, 1); }, trafficOn: () => S().traffic !== false, toggleTraffic: () => { S().traffic = S().traffic === false; store.commit(); if (!S().traffic) traffic.clear(); }, toggleTips: () => { const s = S(); s.tipsOn = !s.tipsOn; if (s.tipsOn) { s.tips = []; tipSince = TIP_GAP - 8; } else hideTip(); store.commit(); },
    testCash: () => { S().cash += 10000; store.commit(); audio.buy(); }, resetProgress,
    bonusOpen: () => bonusOpen(S()), testBonus: () => { S().bonus = true; store.commit(); unlockBonus(); goalT = 0; audio.buy(); },
  });
  titleInfo();

  const enter = (z) => { if (z.kind === 'garage') openGarage(z.g); else if (lastRace[z.def.spot] === 'cup' || (z.def.base === CUP_ROUNDS[0] && myCup() && !lastRace[z.def.spot])) { mode = 'offer'; zone = null; ui.cupOffer(z.group); setMenu(); } else openOffer(z.group.find((d) => d.id === lastRace[z.def.spot]) || z.def); };
  const useZone = () => { if (mode === 'roam' && !paused && zone && car.speed < 2.5) enter(zone); };
  promptEl.addEventListener('click', () => { useZone(); if (driving()) canvas.focus(); });
  $('menubtn').addEventListener('click', () => { pause(); });
  $('duo-menu').addEventListener('click', () => { if (mode === 'duel') pause(); });
  // full screen: in the Windows app through the app itself (window.desktop, see offline/app/preload.js), in a browser
  // where it allows it from inside the viewer's frame (not on iPhone, which has no full screen for pages)
  const desk = typeof window !== 'undefined' && window.desktop && typeof window.desktop.fullscreen === 'function' ? window.desktop : null;
  const full = { can: false, on: false, toggle: () => {} };
  { const de = document.documentElement, req = de.requestFullscreen || de.webkitRequestFullscreen, fb = $('fullbtn');
    const mark = () => { fb.textContent = full.on ? '✕' : '⛶'; fb.setAttribute('aria-label', full.on ? 'Leave full screen' : 'Full screen'); };
    if (desk) {
      full.can = true; fb.hidden = false;
      full.toggle = () => Promise.resolve(desk.fullscreen()).then((v) => { full.on = !!v; mark(); if (paused) ui.pause(); }).catch(() => {});
      Promise.resolve(desk.isFullscreen()).then((v) => { full.on = !!v; mark(); }).catch(() => {});
      addEventListener('resize', () => Promise.resolve(desk.isFullscreen()).then((v) => { if (full.on !== !!v) { full.on = !!v; mark(); } }).catch(() => {}));
    } else if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
      const on = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
      full.can = true; fb.hidden = false;
      full.toggle = () => { try { if (on()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else { const r = req.call(de); if (r && r.catch) r.catch(() => { fb.hidden = true; full.can = false; }); } } catch (_) { fb.hidden = true; full.can = false; } };
      const sync = () => { full.on = on(); mark(); if (paused && ui.kind === 'pause') ui.pause(); };
      document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
    }
    fb.addEventListener('click', () => { full.toggle(); canvas.focus(); });
    if (desk) { const q = $('quitbtn'); if (q) { q.hidden = false; q.addEventListener('click', () => desk.quit()); } }
  }
  input.on('action', useZone);
  input.on('reset', () => {
    if (!driving()) return;
    if (mode === 'duel') { if (duel.state === 'run') duel.resetPlayer(0); return; }
    if (mode === 'race') { if (race.state === 'run') { race.resetPlayer(); camSnap = true; toast(race.track ? 'Back on the course' : 'Back to the last checkpoint'); } return; }
    const r = world.nearestRoad(car.pos.x, car.pos.z); car.place(r.x, r.z, r.yaw, undefined, r.h + 0.5); camSnap = true; toast('Back on ' + r.road.name);
  });
  input.on('reset2', () => { if (mode === 'duel' && !paused && duel.state === 'run') duel.resetPlayer(1); });
  input.on('duoReset', (i) => { if (mode === 'duel' && !paused && duel.state === 'run') duel.resetPlayer(i); });
  input.on('flip', () => { if (!driving() || mode === 'duel' || (race && race.state !== 'run')) return; car.place(car.pos.x, car.pos.z, Math.atan2(car.fwd.x, car.fwd.z), 1.0, car.pos.y + 0.5); toast('Flipped upright'); });
  input.on('camera', () => { if (!driving()) return; camMode = (camMode + 1) % 3; toast(['Chase camera', 'Far camera', 'Hood camera'][camMode], 1.2); });
  input.on('mute', () => { if (!driving()) return; setMute(); toast(S().muted ? 'Sound off' : 'Sound on', 1.2); });
  input.on('time', () => { if (!driving()) return; setTime(TOD[(TOD.indexOf(S().tod) + 1) % TOD.length]); store.commit(); toast('Time of day: ' + TOD_NAME[S().tod], 1.4); });
  input.on('music', () => { if (!driving()) return; setMusic(); toast(S().music ? 'Music on' : 'Music off', 1.2); });
  input.on('units', () => { if (driving()) setUnits(); });
  input.on('map', () => { if (MAP.on) closeMap(); else if (driving() && mode !== 'duel') openMap(); });
  input.on('photo', () => { if (driving() && mode !== 'duel') { pause(); openPhoto(); } else if (PH.on) closePhoto(); });
  input.on('pause', () => { if (MAP.on) { closeMap(); return; } if (PH.on) { if (!$('shot').hidden) $('shot').hidden = true; else closePhoto(); return; } if (paused) resume(); else if (driving()) pause(); else if (mode !== 'title') ui.back(); });
  input.on('back', () => { if (MAP.on) { closeMap(); return; } if (PH.on) { closePhoto(); return; } if (paused) resume(); else ui.back(); });
  input.on('accept', () => { if (mode === 'title') begin(); else ui.accept(); });
  input.on('nav', (dx, dy) => { if (mode !== 'title') ui.nav(dx, dy); });
  input.on('tab', (d) => ui.tab(d));

  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (mode === 'garage') layoutGarage(); }
  addEventListener('resize', resize); new ResizeObserver(resize).observe(canvas); resize();

  // ---- camera ----
  const camDir = new THREE.Vector3().copy(car.fwd.set(0, 0, 1).applyQuaternion(car.quat)), camTarget = new THREE.Vector3(), look = new THREE.Vector3(), v1 = new THREE.Vector3();
  let attract = 0;
  camera.position.copy(car.pos).addScaledVector(camDir, -8).add(v1.set(0, 3, 0));
  function updateCamera(dt) {
    if (PH.on) {                     // photo mode: orbit the car
      if (camera.view) camera.clearViewOffset();
      const c = Math.cos(PH.pitch); camTarget.set(car.pos.x + Math.sin(PH.yaw) * c * PH.dist, car.pos.y + 0.8 + Math.sin(PH.pitch) * PH.dist, car.pos.z + Math.cos(PH.yaw) * c * PH.dist);
      const gh = world.sample(camTarget.x, camTarget.z, undefined, car.pos.y + 1) + 0.4; if (camTarget.y < gh) camTarget.y = gh;
      camera.position.copy(camTarget); look.copy(car.pos); look.y += 0.6; camera.lookAt(look); camera.fov = 55; camera.updateProjectionMatrix(); return;
    }
    if (mode === 'title') { if (camera.view) camera.clearViewOffset(); attract += dt * 0.12; camTarget.set(car.pos.x + Math.sin(attract) * 11, car.pos.y + 3.2, car.pos.z + Math.cos(attract) * 11); camera.position.copy(camTarget); look.copy(car.pos); look.y += 0.6; camera.lookAt(look); camera.fov = 55; camera.updateProjectionMatrix(); return; }
    if (mode === 'garage') {
      // a slow sweep along the road side of the lot, with the workshop behind the car; drag to look around
      if (swingHold > 0) swingHold -= dt; else { swing += swingDir * dt * 0.16; if (Math.abs(swing) > 1.05) swingDir = -Math.sign(swing); }
      const w = canvas.clientWidth, h = canvas.clientHeight, tanF = Math.tan(27.5 * Math.PI / 180), a = garageAt.byaw + swing;
      const dist = Math.max(6.4, (car.spec.box.z * 2 + 2.6) / (2 * tanF * gView.fw / h), 3.6 / (2 * tanF * gView.fh / h));
      camera.fov = 55; camera.setViewOffset(w, h, -gView.ox, -gView.oy, w, h);
      camTarget.set(car.pos.x + Math.sin(a) * dist, car.pos.y + 1.1 + dist * 0.09, car.pos.z + Math.cos(a) * dist);
      const gh = world.sample(camTarget.x, camTarget.z, undefined, car.pos.y + 1) + 0.7; if (camTarget.y < gh) camTarget.y = gh;
      camera.position.lerp(camTarget, camSnap ? 1 : 1 - Math.exp(-dt * 6)); camSnap = false;
      look.copy(car.pos); look.y += 0.2; camera.lookAt(look); return;
    }
    // the view widens a little with speed; a tall window gets a taller view so it still shows the road to both sides
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    let fovT = 62 + Math.min(18, car.speed * 0.28) + (nitro.on ? 7 : 0);
    if (ch > cw) fovT = Math.max(fovT, Math.min(86, 2 * Math.atan(Math.tan(24 * Math.PI / 180) * ch / cw) * 180 / Math.PI + Math.min(6, car.speed * 0.1)));
    camera.fov += (fovT - camera.fov) * Math.min(1, dt * 3);
    // on an upright phone the picture is lifted so the car sits above the thumb buttons
    if (coarse && ch > cw) camera.setViewOffset(cw, ch, 0, ch * 0.1, cw, ch); else if (camera.view) camera.clearViewOffset(); else camera.updateProjectionMatrix();
    if (camMode === 2) { camera.position.copy(car.pos).addScaledVector(car.up, car.spec.box.y1 + 0.05).addScaledVector(car.fwd, 0.35); camera.quaternion.copy(car.quat); camera.rotateY(Math.PI); camSnap = false; return; }
    v1.copy(car.fwd); v1.y = 0;
    if (v1.lengthSq() < 0.01) v1.copy(camDir); v1.normalize();
    const vf = car.vel.dot(car.fwd);
    if (vf > 6) { look.copy(car.vel); look.y = 0; look.normalize(); v1.lerp(look, 0.45).normalize(); }
    const jumped = camSnap || camera.position.distanceToSquared(car.pos) > 80 * 80; camSnap = false;   // after a reset, cut instead of flying over
    camDir.lerp(v1, jumped ? 1 : 1 - Math.exp(-dt * 3.2)).normalize();
    const big = car.spec.box.z - 2, dist = (camMode === 1 ? 13 : 7.2) + big * 1.6 + car.speed * 0.035, height = (camMode === 1 ? 5.2 : 2.7) + big * 0.5;
    camTarget.copy(car.pos).addScaledVector(camDir, -dist); camTarget.y += height;
    camera.position.lerp(camTarget, jumped ? 1 : 1 - Math.exp(-dt * 9));
    const gh = world.sample(camera.position.x, camera.position.z, undefined, car.pos.y + 1) + 1.0; if (camera.position.y < gh) camera.position.y = gh;
    look.copy(car.pos).addScaledVector(camDir, 5); look.y += 1.0; camera.lookAt(look);
  }

  // ---- HUD refs ----
  const el = { cash: $('cash'), job: $('job'), jobLabel: $('joblabel'), jobName: $('jobname'), jobDist: $('jobdist'), arrow: $('arrow'), time: $('jtime'), cond: $('jcond'), pay: $('jpay'), bust: $('bustfill'), bustRow: $('bustrow'),
    speed: $('speed'), unit: $('unit'), gear: $('gear'), rpm: $('rpmfill'), surf: $('surf'), alt: $('alt'),
    race: $('racecard'), rarrow: $('rarrow'), rlabel: $('rlabel'), rtime: $('rtime'), rposLbl: $('rposlbl'), rposN: $('rposn'), rposD: $('rposd'), ptext: $('ptext'), pkey: $('pkey'), drift: $('drift'), nos: $('nosfill') };
  let seaT = 0, kidUpT = 0, kidStuckT = 0, last = -1, acc = 0, upside = 0, hudT = 0, lastSurf = -1, airT = 0, thumpT = 0;

  // ---- adaptive quality: step detail down if the frame rate stays low ----
  // Measures the real frame rate (also on the start screen). While it stays under 45 fps, detail steps down one
  // level at a time. A step that buys nothing (for example on a display capped at 30 Hz) is undone and adapting stops.
  let quality = coarse ? 1 : 0, fpsAvg = 60, grace = 2.5, winT = 0, winN = 0, before = 0, locked = false, lastNow = -1;
  const baseRatio = renderer.getPixelRatio(), SMALL_FAR = coarse ? 240 : 360;
  function applyQuality() {
    renderer.setPixelRatio(Math.min(baseRatio, [2, 1.5, 1.25, 1, 0.75][quality])); resize();
    sun.castShadow = shadows && quality < 2;
    for (const m of treeMeshes) m.count = quality >= 3 ? Math.ceil(m.userData.full / 2) : m.userData.full;
  }
  applyQuality();
  function watchPerf(now) {
    const real = lastNow < 0 ? 0 : (now - lastNow) / 1000; lastNow = now;
    if (real <= 0 || real > 0.5) return;                      // first frame, or the tab was in the background
    fpsAvg += (1 / real - fpsAvg) * 0.05;
    if (locked) return;
    if (grace > 0) { grace -= real; return; }
    winT += real; winN++;
    if (winT < 2) return;
    const fps = winN / winT; winT = winN = 0;
    if (before) {                                             // judging the step we just took
      if (fps < before * 1.12) { quality--; applyQuality(); locked = true; return; }
      before = 0;
    }
    if (fps < 45 && quality < 4) { before = fps; quality++; applyQuality(); grace = 1.2; } else if (fps >= 45) before = 0;
  }

  // ---- one frame of game time ----
  const hit = (v) => { if (thumpT <= 0) { if (audio.on) audio.thump(v); if (v > 8) shake(Math.min(90, Math.round(v * 5))); thumpT = 0.25; } };
  function zoneCheck(dt) {
    let z = null;
    if (!game.job) for (const c of zones) if ((car.pos.x - c.x) ** 2 + (car.pos.z - c.z) ** 2 < c.r * c.r) z = c;
    if (z !== zone) { zone = z; dwell = 0; }
    if (!z) { armed = true; promptEl.hidden = true; return; }
    const slow = car.speed < 2.5;
    if (promptEl.hidden === slow) { promptEl.hidden = !slow; el.ptext.textContent = z.label; el.pkey.textContent = said('action'); promptEl.classList.toggle('race', z.kind === 'race'); }
    dwell = slow && armed ? dwell + dt : 0;
    if (dwell > 0.7) enter(z);           // armed: the car drove in from outside, so stopping is enough
  }
  const kidOut = {}, kidOut2 = {};
  // Physics runs at 120 steps a second, the screen at whatever rate it has, so a frame often falls between two steps.
  // Each car is drawn where it was part way from its last step to the next (that share of a step is acc / STEP), so
  // the picture moves evenly instead of stuttering when a frame gets one step more or less. The true position is put
  // back before any physics runs (and kept if something moved the car meanwhile, such as a reset).
  const shownAt = new Map();          // vehicle -> { pos, quat }: its true pose while the drawn one is in place
  const movers = () => { const l = [car]; if (car2) l.push(car2); if (race) for (const r of race.rivals) l.push(r.car); for (const pt of game.patrols) l.push(pt.car); if (game.rival) l.push(game.rival.car); for (const t of traffic.cars) l.push(t.car); return l; };
  function drawBetween(alpha) {
    for (const v of movers()) {
      if (!v.prevPos || v.prevPos.distanceToSquared(v.pos) > 25) continue;      // a jump (reset): no blending
      let k = shownAt.get(v); if (!k) { k = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), dpos: new THREE.Vector3(), dquat: new THREE.Quaternion(), on: false }; shownAt.set(v, k); }
      k.pos.copy(v.pos); k.quat.copy(v.quat);
      v.pos.lerpVectors(v.prevPos, k.pos, alpha); v.quat.slerpQuaternions(v.prevQuat, k.quat, alpha);
      k.dpos.copy(v.pos); k.dquat.copy(v.quat); k.on = true;
    }
  }
  function trueAgain() {
    for (const [v, k] of shownAt) {
      if (!k.on) continue; k.on = false;
      if (v.pos.equals(k.dpos) && v.quat.equals(k.dquat)) { v.pos.copy(k.pos); v.quat.copy(k.quat); }
    }
    if (shownAt.size > 24) for (const v of [...shownAt.keys()]) if (!movers().includes(v)) shownAt.delete(v);
  }

  function simulate(dt, inp) {
    trueAgain();
    if (paused || mode === 'title' || mode === 'offer') return;
    if (S().kid && (mode === 'roam' || mode === 'race')) inp = kidInput(car, inp, kidOut);
    else if (S().cruise && (mode === 'roam' || mode === 'race')) inp = cruiseInput(inp);
    acc += dt; thumpT -= dt; if (mode !== 'roam') nitro.on = false;
    const two = mode === 'duel' || mode === 'duelres' ? input.poll2() : null;
    while (acc >= STEP) {
      acc -= STEP;
      if (two) { duelStep(two); continue; }
      if (mode === 'roam') { const nos = nitro.step(STEP, inp.nitro, nitroOk(), car.speed); car.step(STEP, nos ? { ...inp, boost: NITRO.acc } : inp); skids.car(car, 'p', inp.handbrake); game.step(STEP); if (game.rammed > 3) { hit(game.rammed + 4); game.rammed = 0; } const th = traffic.step(STEP, car, trafficOthers()); if (th > 1.5) { if (game.job) game.damage(th * 0.7 + 3); if (th > 3) hit(th + 4); } }
      else if (mode === 'garage') { car.step(STEP, HOLD); traffic.step(STEP, car, trafficOthers()); }
      else { car.step(STEP, race.input(inp)); skids.car(car, 'p', inp.handbrake); race.step(STEP); if (rec && race.state === 'run') rec.sample(race.clock, car.pos, car.quat); if (race.bump > 3) { hit(race.bump + 4); race.bump = 0; } }
      if (car.impact > 6) hit(car.impact);
    }
    if (mode === 'roam' || mode === 'garage') { traffic.on = S().traffic !== false; traffic.update(dt, car, trafficOthers()); }
    if (mode === 'roam') { game.update(dt); jobEvents(); if (mode === 'roam') zoneCheck(dt);
      stunts(dt);
      if (nav && arrived(nav, car.pos.x, car.pos.z)) { toast(nav.kind === 'pin' ? 'You reached your marker' : 'You reached ' + nav.name, 2.4); nav = null; audio.click(); } }
    else if (mode === 'duel' || mode === 'duelres') duelTick(dt);
    else if (mode === 'race' || mode === 'results') {
      race.update(dt); raceEvents();
      if (mode === 'race' && race.state === 'done' && (resultsT -= dt) <= 0) { mode = 'results'; ui.results(race, raceNote); setMenu(); }
      if (mode === 'results') { const n = race.rivals.filter((r) => r.time != null).length; if (n !== doneN) { doneN = n; ui.standings(race); } }
      if (mode === 'race' && race.state === 'run' && race.track) { offT = race.track.far > 45 ? offT + dt : 0; if (offT > 1.5) { toast(coarse && !input.pad ? 'Off the course. Tap ROAD to go back' : `Off the course. Press ${said('reset')} to go back`, 1.2); offT = 0; } }
    }
    if (driving() && mode !== 'duel') {
      if (world.sea != null && car.pos.y < world.waterAt(car.pos.x, car.pos.z) - 0.6) {   // into the sea or a river: a splash, then back on the road (or the course)
        seaT += dt; if (seaT > 0.8) { seaT = 0; input.fire('reset'); audio.splash(); toast('Splash! Keep out of the water', 2.2); if (mode === 'roam' && game.job) game.damage(30); }
      } else seaT = 0;
      if ((townT -= dt) <= 0 && world.towns.length) {   // a town's name as you drive into it
        townT = 0.5; const t = world.townAt(car.pos.x, car.pos.z);
        if (t && t !== inTown && mode === 'roam') { toast('Entering ' + t.name, 2.2); if (mark(S(), world.region, 't', world.towns.indexOf(t))) store.commit(); }
        inTown = t;
      }
      if (S().kid) {                  // kid mode puts the car back on its wheels, and back on the road when it is stuck
        if (car.up.y < 0.35 && car.speed < 2) { kidUpT += dt; if (kidUpT > 1.5) { kidUpT = 0; car.place(car.pos.x, car.pos.z, Math.atan2(car.fwd.x, car.fwd.z), 1.0, car.pos.y + 0.5); toast('Back on your wheels', 1.2); } } else kidUpT = 0;
        if (inp.throttle > 0.5 && car.speed < 0.8) { kidStuckT += dt; if (kidStuckT > 4) { kidStuckT = 0; input.fire('reset'); } } else kidStuckT = 0;
      }
      if (car.up.y < 0.35 && car.speed < 2) { upside += dt; if (upside > 1.5) { toast(coarse && !input.pad ? 'Tap FLIP to get back on your wheels' : `Press ${said('flip')} to flip upright`, 1); upside = 1; } } else upside = 0;
      if (car.grounded === 0 && car.up.y > 0.2) airT += dt; else { if (airT > 0.5) landed(airT); airT = 0; }
      if (mode === 'roam') findCheck();
    }
  }
  function jobEvents() {
    for (const e of game.events.splice(0)) {
      if (e.type === 'pickup') { const K = CARGO[e.job.kind]; toast(e.job.kind === 'freight' ? `Cargo loaded. ${e.job.to.name}, ${money(e.job.pay)}` : `${K.name} load for ${e.job.to.name}, ${money(e.job.pay)}. ${K.note}`, e.job.kind === 'freight' ? 3.2 : 4.5); audio.chime([523, 784]); }
      else if (e.type === 'delivered') { daily('deliver', 1); if (e.kind === 'hot') daily('hot', 1); const R = world.region; bump(S(), R, 'd'); if (e.kind === 'hot') bump(S(), R, 'h'); if (e.kind === 'rival') bump(S(), R, 'r'); if (e.kind === 'fragile' && e.cond >= 0.97) bump(S(), R, 'c'); if (night > 0.5) bump(S(), R, 'n');
        toast(`Delivered. +${money(e.total)}` + (e.cond < 0.97 ? `, cargo ${Math.round(e.cond * 100)}%` : ''), 3.5); audio.chime([523, 659, 784, 1047]); store.commit(); }
      else if (e.type === 'busted') { shake([120, 60, 120]); toast(e.fine ? `Busted. Cargo seized, ${money(e.fine)} fine` : 'Busted. Cargo seized', 3.5); audio.chime([330, 220, 165], 'sawtooth'); store.commit(); }
      else if (e.type === 'late') { toast('Too late. The buyer left', 3); audio.chime([330, 247], 'sawtooth'); }
      else if (e.type === 'broken') { toast('The load is smashed. Nothing to sell', 3.2); audio.chime([330, 247], 'sawtooth'); }
      else if (e.type === 'beaten') { toast(`The rival reached ${e.name} first`, 3.2); audio.chime([330, 247], 'sawtooth'); }
      else if (e.type === 'spotted') toast('Patrol on your tail', 2);
      else if (e.type === 'roadblock') { toast(`Roadblock ahead on the ${e.name}! Find the gap or go round`, 3.4); audio.chime([392, 330, 392, 330], 'sawtooth'); }
      else if (e.type === 'backup') toast('The patrols have called for backup', 2.6);
      else if (e.type === 'runblock') { bump(S(), world.region, 'b'); store.commit(); toast('Through the roadblock!', 2); }
      else if (e.type === 'escaped') { toast('Lost them', 1.6); if (game.job && game.job.kind === 'hot') { bump(S(), world.region, 'e'); store.commit(); } }
      else if (e.type === 'damage') toast(`Cargo damaged, ${Math.round(e.cond * 100)}% left`, 1.4);
    }
  }

  const distText = (d) => (metric() ? (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m') : (d >= 322 ? (d / 1609.34).toFixed(1) + ' mi' : Math.round(d * 3.28084 / 50) * 50 + ' ft'));
  const aim = (node, x, z) => { const dx = x - car.pos.x, dz = z - car.pos.z; node.style.transform = `rotate(${(-Math.atan2(dx * car.fwd.z - dz * car.fwd.x, dx * car.fwd.x + dz * car.fwd.z)).toFixed(2)}rad)`; return Math.hypot(dx, dz); };
  const dot = (x, z, r, fill, square) => { mctx.fillStyle = fill; mctx.strokeStyle = '#0e1114'; mctx.lineWidth = 2.5; mctx.beginPath(); if (square) mctx.rect(mx(x) - r, my(z) - r, r * 2, r * 2); else mctx.arc(mx(x), my(z), r, 0, 6.3); mctx.fill(); mctx.stroke(); };
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const pose = (c, v, dt) => {
    const sp = c.spec; v.car.position.copy(c.pos); v.car.quaternion.copy(c.quat);
    c.wheels.forEach((w, i) => {
      const p = v.wheels[i].pivot, y = sp.attachY - (sp.restLen - w.comp);
      p.position.set(w.local.x, p.position.y + (y - p.position.y) * Math.min(1, dt * 30), w.local.z);
      p.rotation.y = w.front ? c.steer : 0; p.scale.x = w.local.x < 0 ? -1 : 1; v.wheels[i].spin.rotation.x = w.spin;
    });
    v.tail.color.setHex(c.brakeOn ? 0xff4a30 : night > 0.3 ? 0xc42418 : 0x7a1512);
    // the dark patch under the car: stretched between the wheels' ground contacts, fading as the car leaves the ground
    // (with sun shadows switched off on a slow device it is stronger and leans away from the sun, standing in for them)
    const P = v.blob.geometry.attributes.position, B = sp.box, ex = B.x + SHADE - sp.wheelX, lean = sun.castShadow ? 0 : 0.55; let gy = 0;
    c.wheels.forEach((w, i) => {
      const g = shadeAt[i]; if (w.onGround) g.copy(w.hit); else { g.copy(w.local).applyQuaternion(c.quat).add(c.pos); g.y = world.sample(g.x, g.z); }
      gy += g.y / 4;
      g.addScaledVector(c.left, w.local.x < 0 ? -ex : ex).addScaledVector(c.fwd, w.front ? B.z + SHADE - sp.wheelZf : -(B.z + SHADE + sp.wheelZr));
      P.setXYZ(i, g.x - sunDir.x * lean, g.y + 0.07, g.z - sunDir.z * lean);
    });
    P.needsUpdate = true; v.car.updateMatrix(); v.blob.matrix.copy(v.car.matrix).invert();
    v.blob.material.opacity = (sun.castShadow ? 0.5 : 0.78) * clamp(1 - (c.pos.y - c.restH - gy) / 2.5, 0, 1);
  };
  const shadeAt = [0, 1, 2, 3].map(() => new THREE.Vector3());

  function frame(now) {
    requestAnimationFrame(frame);
    if (last < 0) last = now;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    checkGoals(dt);
    weatherTick(dt);
    if (S().tod === 'cycle') { DAY.t += dt; if ((DAY.next -= dt) <= 0) { DAY.next = 0.5; applyLook(hourFor('cycle', DAY.t), false); } }
    watchPerf(now);
    const inp = input.poll(now);
    if (pendingRemote && (mode === 'title' || (mode === 'roam' && !game.job && !paused))) applyRemote();
    simulate(dt, inp);
    if (!paused) drawBetween(Math.min(1, acc / STEP));
    const live = driving(), racing = mode === 'race' || mode === 'results';

    // cars
    pose(car, vis, dt); vis.cargo.visible = !!game.job; const duo = !!duel; if (duo) pose(car2, vis2, dt);
    const flash = Math.floor(now / 160) % 2;
    if (!racing && !duo) patrolVis.forEach((v, i) => { v.car.visible = i < game.patrols.length; });
    if (!racing && !duo) game.patrols.forEach((pt, i) => { if (!patrolVis[i]) return; pose(pt.car, patrolVis[i], dt); const on = pt.mode === 'chase' || pt.mode === 'block'; patrolVis[i].bar[0].color.setHex(on && flash ? 0xff2a1a : 0x551111); patrolVis[i].bar[1].color.setHex(on && !flash ? 0x2a55ff : 0x111155); });
    else if (racing) race.rivals.forEach((r, i) => pose(r.car, rivalVis[i], dt));
    if (ghostVis && race) {          // the ghost follows its recording by the race clock, and fades out after its finish
      const live = ghostAt(ghost, race.state === 'count' ? 0 : race.clock, gP, gQ);
      ghostVis.car.position.copy(gP); ghostVis.car.quaternion.copy(gQ);
      const near = Math.min(1, gP.distanceTo(camera.position) / 9), op = (live ? 0.3 : Math.max(0, 0.3 - (race.clock - ghost.time) * 0.15)) * near;
      for (const m of ghostVis.mats) m.opacity = op; ghostVis.car.visible = op > 0.01;
    }
    smugVis.car.visible = !racing && !duo && !!game.rival; if (smugVis.car.visible) pose(game.rival.car, smugVis, dt);
    showTraffic(dt);
    // checkpoint lights
    const pulse = 0.45 + 0.15 * Math.sin(now / 300), free = !racing && !duo && !game.job;
    if (duo) [0, 1].forEach((i) => {   // each player's next checkpoint: player 1 cyan, player 2 orange
      const gt = duel.next(i), b = gateBeams[i]; b.visible = !!gt; if (!gt) return;
      b.position.set(gt.x, gt.y, gt.z); b.scale.set(gt.r / 10, 1, gt.r / 10); const c = i ? 0xff9a3c : 0x62dcea;
      b.userData.beam.material.color.setHex(c); b.userData.ring.material.color.setHex(c); b.userData.beam.material.opacity = pulse + 0.1;
    });
    if (racing) [race.next, race.after].forEach((gt, i) => {
      const b = gateBeams[i]; b.visible = !!gt; if (!gt) return;
      const lastGate = gt === race.gates[race.gates.length - 1] && race.lap + 1 >= (race.def.laps || 1) && (i === 0 || race.gate + 1 === race.gates.length - 1);
      b.position.set(gt.x, gt.y, gt.z); b.scale.set(gt.r / 10, 1, gt.r / 10);
      const c = lastGate ? 0xf3efe4 : 0x62dcea; b.userData.beam.material.color.setHex(c); b.userData.ring.material.color.setHex(c); b.userData.beam.material.opacity = i ? 0.2 : pulse + 0.1;
    });
    // dust
    if (live) { trail(car, dt, 40); if (mode === 'race') for (const r of race.rivals) trail(r.car, dt, 16); if (duo) trail(car2, dt, 40); }
    for (const d of dust) { if (!d.visible) continue; const u = d.userData; if (!paused) u.life -= dt; if (u.life <= 0) { d.visible = false; continue; } const t = 1 - u.life / u.max; if (!paused) { u.vy -= (u.g || 0) * dt; d.position.x += (u.vx || 0) * dt; d.position.y += u.vy * dt; d.position.z += (u.vz || 0) * dt;
      if (u.kind === 'mud' && u.vy < 0) { const gy = world.sample(d.position.x, d.position.z) + 0.12; if (d.position.y < gy) { d.position.y = gy; u.vx = u.vz = u.vy = 0; u.g = 0; } } }   /* mud lands and stays on the ground */ const sc = (0.8 + t * (u.grow ?? 4.5)) * u.size; d.scale.set(sc, sc, 1); d.material.opacity = (u.alpha ?? 0.42) * (u.kind === 'mud' ? 1 - t * t : 1 - t) * Math.min(1, t * (u.kind === 'mud' ? 30 : 8)); }

    updateCamera(dt);
    ground.userData.lod(camera.position);
    for (const m of treeMeshes) m.visible = camera.position.distanceTo(m.boundingSphere.center) < m.boundingSphere.radius + 2600;   // tree blocks out past the haze are skipped
    for (const m of smallMeshes) m.visible = quality < 4 && camera.position.distanceTo(m.boundingSphere.center) < m.boundingSphere.radius + SMALL_FAR;   // bushes and stones: nearby blocks only
    // light columns: each one fades out as the camera comes close, so the picture is never tinted by standing in or beside one
    const lit = (b, on, r, at) => {
      b.visible = !!on; if (!on) return;
      if (at) b.position.set(at.x, at.y, at.z);
      const k = Math.max(0, Math.min(1, (Math.hypot(camera.position.x - b.position.x, camera.position.z - b.position.z) - r - 3) / 40));
      b.userData.beam.visible = k > 0.02; b.userData.beam.material.opacity = pulse * k * (2 - k);
    };
    pickBeams.forEach((b, i) => lit(b, free && game.offers[i], 9, game.offers[i]));
    lit(dropBeam, !racing && game.job, 9, game.job && game.job.to);
    lit(navBeam, free && nav && mode === 'roam', 6, nav);
    for (const z of zones) lit(z.beam, free && mode !== 'garage' && mode !== 'title', z.r);
    sky.dome.position.copy(camera.position); sky.time.value = now / 1000;
    camera.getWorldDirection(viewDir); viewDir.y = 0; focus.copy(car.pos).addScaledVector(viewDir.normalize(), SHADOW_R * 0.45);
    { const tx = 2 * SHADOW_R / sun.shadow.mapSize.x; sun.target.position.set(0, 0, 0).addScaledVector(lightX, Math.round(focus.dot(lightX) / tx) * tx).addScaledVector(lightY, Math.round(focus.dot(lightY) / tx) * tx).addScaledVector(sunDir, focus.dot(sunDir)); }
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 200);
    if (headlight) {                 // headlights: on when it is dark enough, aimed down the road ahead of the car
      const on = night > 0.3 && mode !== 'garage' && mode !== 'title' ? Math.min(1, (night - 0.3) / 0.4) : 0;
      headlight.intensity = on * 260; headlight.visible = true;
      headlight.position.copy(car.pos).addScaledVector(car.fwd, 2.2).addScaledVector(car.up, 0.5);
      headlight.target.position.copy(car.pos).addScaledVector(car.fwd, 30).addScaledVector(car.up, -3);
    }
    fall.update(WX.cur.part, WX.cur.partAmt, camera.position, now / 1000, Math.min(1, L.si / 2.4 + 0.15));
    skids.flush();
    { const on = nitro.on && mode === 'roam' && !paused; for (const f of flames) { f.visible = on; if (on) { const k = 0.75 + Math.random() * 0.55; f.scale.set(1, 1, k); } } }
    if (duo) { chase2(dt); renderDuo(); } else renderer.render(scene, camera);

    audio.update({ nitro: nitro.on, rpm: car.rpm, throttle: live ? (race ? race.input(inp) : inp).throttle : 0, speed: car.speed, slip: car.slip, loose: car.surf !== SURF.ASPHALT ? 1 : 0, grounded: car.grounded, gear: car.gear,
      live: live || mode === 'results', heat: !racing && game.heat, nearest: game.nearest, now,
      intense: (mode === 'race' && race.state === 'run') || (!racing && game.heat) ? 1 : 0, shore: seaNear(car.pos.x, car.pos.z, car.pos.y), rain: WX.cur.rain, storm: WX.cur.wind, indoor: mode !== 'roam' && mode !== 'race' && mode !== 'results' });

    // HUD (15 Hz)
    hudT -= dt; if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('show');
    if (mode === 'roam' && driving()) tipTick(dt);
    if (duel && (duoHudT -= dt) <= 0) { duoHudT = 1 / 15; duoHud(); }
    if (hudT > 0 || mode === 'title') return;
    hudT = 1 / 15;
    const s = car.spec, m = metric();
    el.speed.textContent = Math.round(car.speed * (m ? 3.6 : 2.23694)); el.unit.textContent = m ? 'km/h' : 'mph';
    el.gear.textContent = car.gear < 0 ? 'R' : car.gear;
    el.rpm.style.transform = `scaleX(${Math.min(1, car.rpm / (s.redline + 200)).toFixed(3)})`; el.rpm.classList.toggle('red', car.rpm > s.redline * 0.9);
    if (car.surf !== lastSurf) { lastSurf = car.surf; el.surf.textContent = RG.surfName[car.surf]; el.surf.dataset.s = car.surf; }
    el.alt.textContent = m ? Math.round(Math.max(0, car.pos.y + ALT0)) + ' m' : Math.round(Math.max(0, car.pos.y + ALT0) * 3.28084).toLocaleString('en-US') + ' ft';
    el.cash.textContent = money(S().cash);
    if (S().nitro) { el.nos.style.transform = `scaleX(${nitro.level.toFixed(3)})`; el.nos.classList.toggle('burn', nitro.on); }
    { const on = mode === 'roam' && drift.on && drift.shown >= 60; el.drift.hidden = !on; if (on) el.drift.textContent = `Drift ${drift.shown.toLocaleString('en-US')}` + (drift.mult > 1 ? ` ×${drift.mult}` : ''); }
    if (showFps) $('fps').textContent = Math.round(fpsAvg) + ' fps · q' + quality;
    el.job.hidden = racing; el.race.hidden = !racing;
    const job = game.job;
    if (racing) {
      const gt = race.next, road = race.def.kind !== 'trial', laps = race.def.laps || 1;
      el.rarrow.style.visibility = gt ? 'visible' : 'hidden'; if (gt) aim(el.rarrow, gt.x, gt.z);
      el.rlabel.textContent = race.state === 'count' ? 'Get ready' : race.state === 'done' ? 'Finished' : `Checkpoint ${race.gate + 1} of ${race.gates.length}` + (laps > 1 ? ` · lap ${race.lap + 1} of ${laps}` : '');
      el.rtime.textContent = clock(race.t);
      if (road) { el.rposLbl.textContent = 'Place'; el.rposN.textContent = race.pos; el.rposD.textContent = '/ ' + (race.rivals.length + 1); }
      else { const md = medals(race.def, race.level), k = md.findIndex((t) => race.t <= t); el.rposLbl.textContent = k >= 0 ? 'Still on for' : 'Medals'; el.rposN.textContent = k >= 0 ? MEDALS[k] : 'Gone'; el.rposD.textContent = k >= 0 ? clock(md[k]) : ''; }
    } else {
      const mk = !job && nav, tg = mk ? nav : game.target();
      if (tg) { el.jobName.textContent = tg.name; el.jobDist.textContent = distText(aim(el.arrow, tg.x, tg.z)); }
      el.job.classList.toggle('hot', !!job); el.job.classList.toggle('chase', !!game.heat);
      const kind = job ? job.kind : tg && !mk ? game.kindOf(tg) : 'freight', tag = kind === 'freight' ? '' : CARGO[kind].name + ' · ';
      el.jobLabel.textContent = tag + (job ? (game.rival ? (game.rival.dist < Math.hypot(car.pos.x - job.to.x, car.pos.z - job.to.z) ? 'Rival ahead · ' : 'You lead · ') : '') + 'Deliver to' : mk ? 'Your marker' : game.inside ? 'Stop to load' : 'Pick up at');
      if (job) {
        const t = Math.max(0, Math.ceil(job.left)); el.time.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); el.time.classList.toggle('low', t <= 15);
        el.cond.textContent = Math.round(job.cond * 100) + '%'; el.pay.textContent = money(Math.round(job.pay * job.cond / 10) * 10);
      }
      el.bust.style.transform = `scaleX(${Math.min(1, game.bust).toFixed(2)})`; el.bustRow.hidden = game.bust < 0.03;
    }
    // minimap
    const farOut = world.corridor && car.pos.x > HALF - MV.span / 2 && car.pos.z > world.corridor.z0 && car.pos.z < world.corridor.z1;
    if (farOut) { MV.cx = car.pos.x; MV.cz = car.pos.z; } else { const lim = HALF - MV.span / 2; MV.cx = Math.max(-lim, Math.min(lim, car.pos.x)); MV.cz = Math.max(-lim, Math.min(lim, car.pos.z)); }
    mctx.clearRect(0, 0, MM, MM);
    if (farOut) farMap(); else { const k = MB / SIZE; mctx.drawImage(mapBase, (HALF - MV.cx - MV.span / 2) * k, (HALF - MV.cz - MV.span / 2) * k, MV.span * k, MV.span * k, 0, 0, MM, MM); }
    if (racing) {
      for (let i = race.gates.length - 1; i >= race.gate; i--) { const gt = race.gates[i]; if (i === race.gate) dot(gt.x, gt.z, 8, '#62dcea'); else dot(gt.x, gt.z, 3.5, i === race.gates.length - 1 ? '#f3efe4' : '#62dcea'); }
      for (const r of race.rivals) dot(r.car.pos.x, r.car.pos.z, 5, hex(PAINTS[r.paint].hex), true);
    } else {
      for (const st of game.sites) { const isDrop = job && job.to === st, isPick = !job && game.offers.includes(st);
        if (isDrop || isPick) dot(st.x, st.z, isDrop ? 11 : 8.5, isDrop ? '#54d17a' : '#f2b33d'); else { mctx.fillStyle = 'rgba(243,239,228,0.45)'; mctx.fillRect(mx(st.x) - 3, my(st.z) - 3, 6, 6); } }
      for (const c of finds.crates) if (!crateGot(c.i) && (car.pos.x - c.x) ** 2 + (car.pos.z - c.z) ** 2 < 250 * 250) dot(c.x, c.z, 4.5, '#f2b33d', true);   // hidden crates close by
      for (const t of traffic.cars) dot(t.car.pos.x, t.car.pos.z, 3.2, '#c9ced4');
      if (game.rival) dot(game.rival.car.pos.x, game.rival.car.pos.z, 5.5, '#d8a03a', true);
      if (nav) drawPin(mctx, mx(nav.x), my(nav.z), 1.15);
      for (const pt of game.patrols) dot(pt.car.pos.x, pt.car.pos.z, pt.mode === 'block' ? 7 : 5.5, pt.mode === 'block' ? '#ff3b2a' : pt.mode === 'chase' ? (flash ? '#ff3b2a' : '#4d7bff') : '#7fa2e8', true);
    }
    mctx.save(); mctx.translate(mx(car.pos.x), my(car.pos.z)); mctx.rotate(-Math.atan2(car.fwd.x, car.fwd.z)); mctx.fillStyle = '#e04a2f'; mctx.strokeStyle = '#0e1114'; mctx.lineWidth = 3; mctx.beginPath(); mctx.moveTo(0, -13); mctx.lineTo(9, 10); mctx.lineTo(0, 5); mctx.lineTo(-9, 10); mctx.closePath(); mctx.stroke(); mctx.fill(); mctx.restore();
  }

  window.claude?.hot?.snapshot?.(() => (mode === 'roam' ? { p: car.pos.toArray(), q: car.quat.toArray() } : {}));
  // test hooks: run the game forward without drawing, and jump straight to a garage or a race
  // auto throttle (build 36, Michael asked for "auto drive to 80mph with ability to override by applying more
  // throttle"): the pedal is pressed for you up to CRUISE m/s; pressing the throttle harder than that goes faster,
  // and the brake always wins (and still stops and reverses as usual)
  const CRUISE = 80 / 2.23694;
  const cruiseOut = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true };
  function cruiseInput(inp) {
    if (inp.brake > 0.05 || inp.handbrake) return inp;
    const auto = car.speed < CRUISE ? Math.min(1, (CRUISE - car.speed) * 0.5 + 0.15) : 0;
    if (inp.throttle >= auto) return inp;
    Object.assign(cruiseOut, inp); cruiseOut.throttle = auto; return cruiseOut;
  }
  const advance = (sec, inp = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true }) => { for (let f = 0; f < sec * 60; f++) simulate(1 / 60, inp); };
  window.__game = { traffic, schoolTests, trail, showCar, trueAgain, get shownAt() { return shownAt; }, startDuel, endDuel, get duel() { return duel; }, get car2() { return car2; }, duoHud, get dustKinds() { const k = {}; for (const d of dust) if (d.visible) k[d.userData.kind] = (k[d.userData.kind] || 0) + 1; return k; }, daily, dailyInfo, skids, get flames() { return flames.map((f) => f.visible); }, tipContext, get tip() { return tipEl.hidden ? null : $('tip-text').textContent; }, tipTick, nitro, showNitro, traps, drift, stunts, mapView: VIEW, bigmap: MAP, openMap, closeMap, setNav, navPts, get nav() { return nav; }, photo: PH, openPhoto, closePhoto, snap, tilt, wake, setTilt, startCup, cupInfo, get raceNote() { return raceNote; }, finds, findCheck, get crates() { return crateVis.map((v) => v.visible); }, get barnCar() { return !!barnVis; }, weather: WX, setWeather, turnWeather, get fog() { return [scene.fog.near, scene.fog.far]; }, checkGoals: () => { goalT = 0; checkGoals(0); }, goalNews, audio, setTime, applyLook, day: DAY, get night() { return night; }, get headlight() { return headlight ? headlight.intensity : null; }, car, world, begin, input, camera, game, store, ui, races, zones, advance, openGarage, openOffer, startRace, endRace, pause, resume,
    pinQuality(q) { quality = q; locked = true; applyQuality(); },
    get drawn() { const r = renderer.info.render; return { quality, locked, shadows: sun.castShadow, triangles: r.triangles, calls: r.calls, small: smallMeshes.reduce((n, m) => n + m.count, 0), smallShown: smallMeshes.reduce((n, m) => n + (m.visible ? m.count : 0), 0) }; },
    get ghost() { return ghost && { time: ghost.time, n: ghost.n, splits: ghost.splits.length, shown: !!ghostVis && ghostVis.car.visible, pos: ghostVis ? ghostVis.car.position.toArray().map(Math.round) : null }; },
    get race() { return race; }, get mode() { return mode; }, get paused() { return paused; }, get quality() { return quality; }, get vis() { return vis; } };
  // get every shader ready now (flames, beams, mud, rain and the rest start hidden), so nothing stalls a frame the first
  // time it appears while driving
  { const hid = []; scene.traverse((o) => { if (!o.visible) { hid.push(o); o.visible = true; } }); try { renderer.compile(scene, camera); } catch (_) {} for (const o of hid) o.visible = false; }
  $('loading').hidden = true; $('go').hidden = false;
  store.connect();
  requestAnimationFrame(frame);
}

function boot() {
  const run = (d) => setTimeout(() => { try { start(d || {}); } catch (e) { console.error(e); const l = document.getElementById('loading'); l.hidden = false; l.textContent = 'This device could not start 3D graphics. Try a desktop browser.'; } }, 30);
  if (window.claude?.hot?.ready) window.claude.hot.ready(run); else run(window.claude?.hot?.data ?? {});
}
boot();
