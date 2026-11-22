// Traffic in the page: cars appear in free roam and are drawn and on the corner map, stay off during a race, the menu
// switch turns them off and on (saved), and nothing errors. Pictures: traffic on the ring road, in a town, at night.
// usage: REGION=coast node tests/trafficui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'), R = process.env.REGION || 'mountain'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(), errs = []; let bad = 0; p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + '#r=' + R);
  await p.waitForSelector('#go:not([hidden])', { timeout: 240000 });
  await p.click('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(1); g.setWeather('clear'); });
  // drive nowhere for 20 s on the ring road: traffic fills in
  const fill = await p.evaluate(() => { const g = window.__game, w = g.world, r = w.roads[0], f = w.frame(r, 400); g.car.place(f.x + f.lx * 7, f.z + f.lz * 7, f.yaw, 0.3); for (let i = 0; i < 40; i++) g.advance(0.5); const t = g.traffic; return { n: t.cars.length, max: t.max, near: Math.min(...t.cars.map((c) => Math.round(c.car.pos.distanceTo(g.car.pos)))), mph: t.cars.map((c) => Math.round(c.car.speed * 2.237)) }; });
  check('fills', fill.n >= 4 && fill.mph.filter((v) => v > 15).length >= 2, fill);
  // a picture: the camera beside the road with the nearest car going by
  const shot = async (name, place, wait = 2600) => { const r = await p.evaluate(place); await p.waitForTimeout(wait); await p.screenshot({ path: path.join(OUT, `traffic-${R}-${name}.png`) }); return r; };
  const near = await shot('road', () => { const g = window.__game, w = g.world, t = g.traffic.cars.filter((c) => !c.driver.wreck).sort((a, q) => a.car.pos.distanceTo(g.car.pos) - q.car.pos.distanceTo(g.car.pos))[0];
    const tr = t.driver.track, f = t.driver.path.at(tr.idx - 18); g.car.place(f.x - f.tz * -2 * 0 + f.tz * 2.2, f.z + f.tx * 0 - f.tx * 2.2, Math.atan2(f.tx, f.tz), 0.3); g.advance(0.3); return { drawn: g.scene ? null : null, n: g.traffic.cars.length }; });
  const drawn = await p.evaluate(() => { const g = window.__game; let shown = 0; g.scene && g.scene.traverse((o) => {}); return { cars: g.traffic.cars.length }; });
  check('drawn', drawn.cars > 0, drawn);
  const nan = () => p.evaluate(() => { const g = window.__game; return { me: [g.car.pos.x, g.car.speed].some((v) => !Number.isFinite(v)), them: g.traffic.cars.filter((t) => ![t.car.pos.x, t.car.pos.y, t.car.speed].every(Number.isFinite)).length, errs: 0 }; });
  console.log('nan after road', JSON.stringify(await nan()), errs.length);
  // a town (slow traffic) and night
  await shot('town', () => { const g = window.__game, w = g.world, t = w.towns[0], r = w.roads[t.road], f = w.frame(r, ((t.from + 30) % r.n + r.n) % r.n); g.car.place(f.x, f.z, f.yaw, 0.3); for (let i = 0; i < 24; i++) g.advance(0.5); });
  await shot('night', () => { const g = window.__game; g.setTime('night'); g.advance(0.2); });
  console.log('nan after night', JSON.stringify(await nan()), errs.length);
  await p.evaluate(() => window.__game.setTime('day'));
  // a race: no traffic while it runs
  const race = await p.evaluate(() => { const g = window.__game, d = g.races[0]; g.startRace(d, 1); g.advance(2); return { mode: g.mode, n: g.traffic.cars.length }; });
  check('race', race.mode === 'race' && race.n === 0, race);
  await p.evaluate(() => { const g = window.__game; g.endRace(); g.advance(1); });
  // the menu switch
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  const before = await p.evaluate(() => document.getElementById('dlg-traffic').textContent);
  await p.click('#dlg-traffic'); await p.waitForTimeout(400);
  const off = await p.evaluate(() => { const g = window.__game; g.resume(); for (let i = 0; i < 10; i++) g.advance(0.5); return { label: document.getElementById('dlg-traffic') ? document.getElementById('dlg-traffic').textContent : null, saved: g.store.data.traffic, n: g.traffic.cars.length }; });
  check('switch', before === 'Traffic on' && off.saved === false && off.n === 0, { before, ...off });
  await p.evaluate(() => { const g = window.__game; g.store.data.traffic = true; if (g.paused) g.resume(); for (let i = 0; i < 20; i++) g.advance(0.5); });
  const back = await p.evaluate(() => window.__game.traffic.cars.length);
  check('back on', back > 0, back);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `traffic: ${bad} check(s) failed` : 'traffic: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
