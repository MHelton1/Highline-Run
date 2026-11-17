// Travel between regions from the garage: the page starts again in the other region with the same cash and cars,
// and race results stay apart. usage: node tests/travel.cjs [desk|port] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'port', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const tap = (sel) => (mode === 'desk' ? p.click(sel) : p.tap(sel));
  const ready = () => p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  const where = () => p.evaluate(() => { const g = window.__game, s = g.store.data, gar = g.world.places.garages[0]; return { region: g.world.region, saved: s.region, cash: s.cash, cars: Object.keys(s.cars).sort().join(','), atGarage: Math.round(Math.hypot(g.car.pos.x - gar.x, g.car.pos.z - gar.z)), races: g.races.map((r) => r.id).join(','), title: document.getElementById('saved').textContent }; });
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html')); await ready();
  console.log('start', JSON.stringify(await where()));
  await tap('#go');
  await p.evaluate(() => { const g = window.__game, s = g.store.data; s.cash = 23456; s.cars.buggy = { up: [1, 0, 0, 0], tune: { ...s.cars.hatch.tune }, paint: 3 }; s.best.ring = 190; g.store.commit(); g.pinQuality(2); g.openGarage(g.world.places.garages[1]); });
  await p.waitForTimeout(600);
  const btn = await p.evaluate(() => { const e = document.querySelector('[id^="g-travel-"]'); e.scrollIntoView(); return e && e.id + ' ' + e.textContent; });
  console.log('button', btn);
  await p.screenshot({ path: `${OUT}/travel-${mode}-garage.png` });
  await Promise.all([p.waitForEvent('load', { timeout: 60000 }), tap('[id^="g-travel-"]')]);
  await ready(); await p.screenshot({ path: `${OUT}/travel-${mode}-title.png` });
  console.log('arrived', JSON.stringify(await where()), 'hash', JSON.stringify(await p.evaluate(() => location.hash)));
  await tap('#go'); await p.evaluate(() => window.__game.pinQuality(2)); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/travel-${mode}-desert.png` });
  // a result in the desert does not touch the mountain's
  await p.evaluate(() => { const g = window.__game; g.store.data.best.flats = 150; g.store.commit(); g.openGarage(g.world.places.garages[0]); });
  await p.waitForTimeout(400);
  await Promise.all([p.waitForEvent('load', { timeout: 60000 }), tap('[id^="g-travel-"]')]);
  await ready();
  console.log('back', JSON.stringify(await where()), 'best', JSON.stringify(await p.evaluate(() => window.__game.store.data.best)));
  // on to the coast, and a car driven into the sea comes back out
  await tap('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(2); g.openGarage(g.world.places.garages[0]); });
  await p.waitForTimeout(400);
  console.log('buttons', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('[id^="g-travel-"]')].map((e) => e.id))));
  await Promise.all([p.waitForEvent('load', { timeout: 60000 }), p.evaluate(() => { const e = document.getElementById('g-travel-coast'); e.scrollIntoView(); e.click(); })]);
  await ready();
  console.log('coast', JSON.stringify(await where()));
  await tap('#go'); await p.evaluate(() => window.__game.pinQuality(2)); await p.waitForTimeout(1500);
  const sea = await p.evaluate(async () => {
    const g = window.__game, w = g.world; let x = 0, z = 0;
    for (let r = 1300; r < 2400 && !x; r += 20) { const h = w.sample(r, 0); if (h < w.sea - 4) x = r; }
    g.car.place(x, z, 0); g.car.pos.y = w.sea - 3;
    const t0 = performance.now(); let frames = 0; const tick = () => { frames++; if (performance.now() - t0 < 12000 && !/Splash|Back on/.test(document.getElementById('toast').textContent)) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    while (performance.now() - t0 < 12000 && !/Splash|Back on/.test(document.getElementById('toast').textContent)) await new Promise((res) => setTimeout(res, 100));
    await new Promise((res) => setTimeout(res, 500));
    return { sea: w.sea, dropX: x, now: [Math.round(g.car.pos.x), Math.round(g.car.pos.y), Math.round(g.car.pos.z)], ground: Math.round(w.sample(g.car.pos.x, g.car.pos.z)), toast: document.getElementById('toast').textContent, secs: Math.round((performance.now() - t0) / 100) / 10, frames };
  });
  console.log('splash', JSON.stringify(sea), sea.now[1] > sea.sea ? 'OUT OF THE WATER' : 'STILL IN THE WATER');
  await p.screenshot({ path: `${OUT}/travel-${mode}-coast.png` });
  console.log('errors', JSON.stringify(errs.slice(0, 5)));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
