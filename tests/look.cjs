// Picture check: a fixed set of views of the built page, for judging the look. Not a pass/fail test.
// TOD=day|sunset|night|cycle and HOUR=0..24 in the environment pick the time of day, WEATHER=rain|snow|fog|dust|cloudy the weather.
// usage: node tests/look.cjs [desk|port] [comma list of views, default all] [outdir] [quality level to hold, default the starting one]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'desk', only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null, OUT = process.argv[4] || path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const b = await chromium.launch({ args });
  const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 120000 });
  const want = (n) => !only || only.includes(n);
  await p.evaluate((q) => { const g = window.__game; g.pinQuality(q === null ? g.quality : q); }, process.argv[5] != null ? +process.argv[5] : null);   // the frame-rate watcher would step detail down on this slow software renderer
  const snap = async (name, wait = 2600) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/look-${mode}-${name}.png` }); console.log('shot', name, JSON.stringify(await p.evaluate(() => (window.__game && window.__game.drawn) || null))); };
  if (want('title')) await snap('title', 1500);
  await (mode === 'desk' ? p.click('#go') : p.tap('#go'));
  await p.evaluate(() => { const g = window.__game; g.store.data.cash += 60000; for (const id of ['buggy', 'truck', 'coupe']) g.store.data.cars[id] = { up: [0, 0, 0, 0], tune: { ...g.store.data.cars.hatch.tune }, paint: { buggy: 3, truck: 2, coupe: 4 }[id] }; g.advance(1); });
  // put the car on a road sample (heading along it), or anywhere on the map
  const onRoad = (road, i, speed = 0) => p.evaluate(([road, i, speed]) => { const g = window.__game, r = g.world.roads[road], j = (i + 2) % r.n; const yaw = Math.atan2(r.x[j] - r.x[i], r.z[j] - r.z[i]); g.car.place(r.x[i], r.z[i], yaw); g.advance(0.6); if (speed) { g.car.vel.copy(g.car.fwd).multiplyScalar(speed); g.advance(0.4, { steer: 0, throttle: 0.6, brake: 0, handbrake: false, analog: true }); } }, [road, i, speed]);
  const at = (x, z, yaw) => p.evaluate(([x, z, yaw]) => { const g = window.__game; g.car.place(x, z, yaw); g.advance(0.6); }, [x, z, yaw]);
  if (process.env.WEATHER) await p.evaluate((w) => window.__game.turnWeather(w, true), process.env.WEATHER);   // WEATHER=rain|snow|fog|dust|cloudy
  if (process.env.TOD) await p.evaluate(([tod, hour]) => { const g = window.__game; g.setTime(tod); if (hour) g.applyLook(+hour, true); }, [process.env.TOD, process.env.HOUR || '']);   // TOD=night|sunset|cycle, HOUR=0..24
  if (want('lot')) await snap('lot');
  if (want('road')) { await onRoad(0, 420, 25); await snap('road'); }
  if (want('road2')) { await onRoad(0, 1500, 30); await snap('road2'); }
  if (want('trail')) { await onRoad(1, 200, 14); await snap('trail'); }
  if (want('hill')) { await at(-334, 300, 1.2); await snap('hill'); }
  if (want('site')) { await p.evaluate(() => { const g = window.__game, s = g.game.sites[0]; g.car.place(s.x + 9, s.z + 6, Math.atan2(-9, -6)); g.advance(0.6); }); await snap('site'); }
  if (want('far')) { await onRoad(0, 2400, 0); await p.keyboard.press('KeyC'); await snap('far'); await p.keyboard.press('KeyC'); await p.keyboard.press('KeyC'); }
  if (want('grid')) { await p.evaluate(() => { const g = window.__game; g.startRace(g.races[0]); g.advance(0.5); }); await snap('grid'); await p.evaluate(() => { const g = window.__game; g.advance(9, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); }); await snap('race'); await p.evaluate(() => window.__game.endRace()); }
  for (const id of ['hatch', 'coupe', 'truck', 'buggy']) if (want('g-' + id) || want('garage')) {
    await p.evaluate(() => { const g = window.__game; if (g.mode !== 'garage') g.openGarage(g.zones[0].g); });
    await (mode === 'desk' ? p.click('#g-car-' + id) : p.tap('#g-car-' + id));
    await p.evaluate(() => window.__game.advance(0.5));
    await snap('g-' + id);
  }
  console.log('errors', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
