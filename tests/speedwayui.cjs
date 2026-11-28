// The speedway in the browser: loads Ironhorse Speedway, checks the car can be driven round the oval, through the
// pit tunnel and out along the interstate, and takes pictures of each part. usage: node tests/speedwayui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(120000); const errs = []; let bad = 0;
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const check = (name, ok, info) => { console.log(name.padEnd(10), ok ? 'ok  ' : 'FAIL', JSON.stringify(info)); if (!ok) bad++; };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + '#r=speedway');
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await p.evaluate(() => window.__game.pinQuality(1));
  await p.click('#go');
  await p.evaluate(() => window.__game.advance(1));
  const snap = async (name, wait = 2500) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/speedway-${name}.png` }); };
  const info = await p.evaluate(() => { const g = window.__game; return { region: g.world.region, roads: g.world.roads.map((r) => r.name), races: g.races.map((d) => d.id), garage: g.zones.filter((z) => z.kind === 'garage').length }; });
  check('loaded', info.region === 'speedway' && info.races.includes('oval') && info.races.includes('inter'), info);
  // the place on a road: sample i of road r, heading along it, at a speed
  const onRoad = (r, i, v = 0, back = false) => p.evaluate(([r, i, v, back]) => { const g = window.__game, rd = g.world.roads[r], j = Math.min(rd.n - 1, i + 2), k = Math.max(0, i - 2); const a = back ? k : j; const yaw = Math.atan2(rd.x[a] - rd.x[i], rd.z[a] - rd.z[i]);
    g.car.place(rd.x[i], rd.z[i], yaw, undefined, rd.h[i] + 0.5); g.advance(0.5); if (v) { g.car.vel.copy(g.car.fwd).multiplyScalar(v); } g.advance(0.3, { steer: 0, throttle: 0.5, brake: 0, handbrake: false, analog: true }); return { y: +g.car.pos.y.toFixed(1) }; }, [r, i, v, back]);
  const S = await p.evaluate(() => ({ kApex: window.__game.world.speedway.kApex, n: window.__game.world.roads[0].n, acc: window.__game.world.roads[3].n }));
  await onRoad(0, Math.round(S.n * 0.36), 40); await snap('turn');
  await onRoad(0, S.kApex - 60, 30); await snap('front');
  // the tunnel: drive along the boulevard from the pit lane, out under the track
  const tun = await p.evaluate(() => { const g = window.__game, rd = g.world.roads[3]; let lo = 0; for (let i = 0; i < rd.n; i++) if (rd.h[i] < rd.h[lo]) lo = i; return lo; });
  await onRoad(3, tun - 40, 8); await snap('tunnel-in', 1500);
  await onRoad(3, tun - 6, 6); await snap('tunnel', 1500);
  const drive = await p.evaluate(([i0]) => { const g = window.__game, rd = g.world.roads[3]; const yaw = Math.atan2(rd.x[i0 + 2] - rd.x[i0], rd.z[i0 + 2] - rd.z[i0]); g.car.place(rd.x[i0], rd.z[i0], yaw); g.advance(0.5);
    let minY = 1e9; for (let k = 0; k < 260; k++) { let best = 0, bd = 1e18; for (let i = 0; i < rd.n; i++) { const d = (rd.x[i] - g.car.pos.x) ** 2 + (rd.z[i] - g.car.pos.z) ** 2; if (d < bd) { bd = d; best = i; } }
      const f = Math.min(rd.n - 1, best + 6), ang = Math.atan2((rd.x[f] - g.car.pos.x) * g.car.fwd.z - (rd.z[f] - g.car.pos.z) * g.car.fwd.x, (rd.x[f] - g.car.pos.x) * g.car.fwd.x + (rd.z[f] - g.car.pos.z) * g.car.fwd.z);
      g.advance(0.1, { steer: Math.max(-1, Math.min(1, ang * 2)), throttle: g.car.speed < 10 ? 0.6 : 0, brake: 0, handbrake: false, analog: true }); minY = Math.min(minY, g.car.pos.y); }
    let best = 0, bd = 1e18; for (let i = 0; i < rd.n; i++) { const d = (rd.x[i] - g.car.pos.x) ** 2 + (rd.z[i] - g.car.pos.z) ** 2; if (d < bd) { bd = d; best = i; } }
    return { from: i0, to: best, minY: +minY.toFixed(1), y: +g.car.pos.y.toFixed(1) }; }, [tun - 50]);
  check('tunnel', drive.to > tun + 30 && drive.minY < 37 && drive.y > 38, drive);
  await onRoad(3, 560, 10); await snap('town');
  await onRoad(4, 20, 25); await snap('ramp');
  await p.evaluate(() => { const g = window.__game; g.car.place(16000, g.world.speedway.zI + 6, Math.PI / 2); g.advance(0.5); g.car.vel.copy(g.car.fwd).multiplyScalar(90); g.advance(1, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); });
  const far = await p.evaluate(() => { const g = window.__game; return { x: Math.round(g.car.pos.x), y: +g.car.pos.y.toFixed(2), mph: Math.round(g.car.speed * 2.237), up: +g.car.up.y.toFixed(2) }; });
  check('interstate', far.x > 16050 && Math.abs(far.y - 40.9) < 0.6 && far.up > 0.97, far);
  await snap('interstate');
  await p.keyboard.press('KeyG'); await snap('farmap', 800); await p.evaluate(() => window.__game.closeMap());
  // interstate extras (build 39): the truck stop, its garage and drag races, and traffic out on the interstate
  const stop = await p.evaluate(() => { const g = window.__game, T = g.world.places.truckStop, G = g.world.places.garages.find((q) => q.far);
    g.store.data.traffic = true; g.store.data.extras = true; g.traffic.on = true; g.traffic.extras = true;
    const r = g.world.roads[4], i = G.idx - 60, f = g.world.frame(r, i); g.car.place(f.x - f.lx * 5, f.z - f.lz * 5, f.yaw); g.car.vel.copy(g.car.fwd).multiplyScalar(25);
    for (let k = 0; k < 40; k++) g.advance(0.25, { steer: 0, throttle: 0.5, brake: 0, handbrake: false, analog: true });
    const drags = g.races.filter((d) => d.spot === 'drag').map((d) => d.id), zone = g.zones.find((z) => z.extra);
    return { garage: G.name, drags, zone: !!zone, traffic: g.traffic.list.filter((t) => t.open).length, x: Math.round(g.car.pos.x) }; });
  check('truckstop', stop.garage === 'Mile 10 Truck Stop' && stop.drags.join() === 'drag,dragx' && stop.zone && stop.traffic > 0, stop);
  await p.evaluate(() => { const g = window.__game, G = g.world.places.garages.find((q) => q.far), f = g.world.frame(g.world.roads[4], G.idx - 90); g.traffic.clear(); g.car.place(f.x - f.lx * 3, f.z - f.lz * 3, f.yaw + 0.5); g.advance(0.8); });
  await snap('truckstop');
  const off = await p.evaluate(() => { const g = window.__game; g.toggleSetting('extras'); g.advance(1); const n = g.traffic.list.filter((t) => t.open).length; const b = g.store.data.extras; g.toggleSetting('extras'); return { n, extras: b }; });
  check('extras off', off.n === 0 && off.extras === false, off);
  await p.evaluate(() => { const g = window.__game, W = g.world.speedway; g.car.place(W.xE - 260, W.zI - 4, Math.PI / 2); g.advance(0.8); });
  await snap('farTown');
  await p.evaluate(() => { const g = window.__game, B = g.world.places.farBarn; const nr = g.world.nearestRoad(B.x, B.z), a = Math.atan2(nr.x - B.x, nr.z - B.z); g.car.place(B.x + Math.sin(a) * 24, B.z + Math.cos(a) * 24, a + Math.PI); g.advance(0.8); });
  await snap('barn');
  await p.evaluate(() => { const g = window.__game; g.car.place(g.world.places.garages[0].x, g.world.places.garages[0].z, g.world.places.garages[0].yaw); g.advance(0.6); });
  await p.keyboard.press('KeyG'); await snap('map', 1500); await p.keyboard.press('KeyG');
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `speedway: ${bad} failed` : 'speedway: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
