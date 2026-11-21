// The bigger maps in the page: the outer loop, its spokes and town are there, the corner map follows the car, far
// ground is drawn coarse, and nothing errors. Pictures: a spoke, the outer town, (coast) an island bridge, the big map.
// usage: REGION=coast node tests/outerui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'), R = process.env.REGION || 'mountain'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  const t0 = Date.now();
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + '#r=' + R);
  await p.waitForSelector('#go:not([hidden])', { timeout: 240000 });
  console.log('loaded in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  await p.click('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(1); g.setWeather('clear'); });
  const info = await p.evaluate(() => { const w = window.__game.world; return { half: w.half, roads: w.roads.map((r) => r.name), towns: w.towns.map((t) => t.name), outerSites: w.places.sites.filter((s) => s.outer).map((s) => s.name), trees: w.trees.length }; });
  check('layout', info.half > 2000 && info.roads.length === 6 && info.towns.length === 3 && info.outerSites.length === 3, info);
  const shot = async (name, place) => { await p.evaluate(place); await p.waitForTimeout(2600); await p.screenshot({ path: path.join(OUT, `outer-${R}-${name}.png`) }); return p.evaluate(() => window.__game.drawn); };
  const d1 = await shot('spoke', () => { const g = window.__game, w = g.world, r = w.roads[3], i = Math.floor((r.from + r.to) * 0.45), f = w.frame(r, i); g.car.place(f.x, f.z, f.yaw, 0.3); g.advance(0.6); });
  const d2 = await shot('town', () => { const g = window.__game, w = g.world, t = w.towns[2], r = w.roads[t.road], i = ((t.from - 20) % r.n + r.n) % r.n, f = w.frame(r, i); g.car.place(f.x, f.z, f.yaw, 0.3); g.advance(0.6); });
  const mm = await p.evaluate(() => { const g = window.__game; return { x: g.car.pos.x, z: g.car.pos.z }; });
  console.log('drawn', JSON.stringify(d1), JSON.stringify(d2));
  if (R === 'coast') await shot('bridge', () => { const g = window.__game, w = g.world, b = w.bridges.filter((q) => w.roads[q.road].outer).sort((a, q) => (q.i1 - q.i0) - (a.i1 - a.i0))[0], r = w.roads[b.road], f = w.frame(r, Math.max(0, b.i0 - 25)); g.car.place(f.x, f.z, f.yaw, 0.3); g.advance(0.6); });
  await p.keyboard.press('KeyG'); await p.waitForTimeout(900); await p.screenshot({ path: path.join(OUT, `outer-${R}-map.png`) }); await p.keyboard.press('KeyG');
  check('far town', Math.hypot(mm.x, mm.z) > 1300, mm);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `outer: ${bad} check(s) failed` : 'outer: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
