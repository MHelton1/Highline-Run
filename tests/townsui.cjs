// Towns in the page: each map has two, drawn with lit windows after dark; driving in shows the town's name, a car
// driven at a house stops against it, and the big map names the towns. Pictures by day, at night and on the map.
// usage: REGION=coast node tests/townsui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'), R = process.env.REGION || 'mountain'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + '#r=' + R);
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await p.click('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(2); g.setWeather('clear'); });
  const info = await p.evaluate(() => { const w = window.__game.world; return w.towns.map((t) => ({ name: t.name, n: t.buildings.length, lamps: t.lamps.length, signs: t.signs.length })); });
  check('towns', info.length === 3 && info.every((t) => t.n >= 30 && t.lamps > 10 && t.signs === 2), info);
  // drive in along the ring road from before the first sign
  await p.evaluate(() => { const g = window.__game, w = g.world, r = w.roads[0], t = w.towns[0], i = ((t.from - 30) % r.n + r.n) % r.n, f = w.frame(r, i); g.car.place(f.x, f.z, f.yaw, 0.3); g.advance(0.5); window.__lastToast = ''; });
  const entry = await p.evaluate(() => { const g = window.__game, w = g.world, r = w.roads[0], out = [];
    for (let k = 0; k < 40; k++) { g.advance(0.25, { steer: 0, throttle: 0.5, brake: 0, handbrake: false, analog: true }); const n = w.nearestRoad(g.car.pos.x, g.car.pos.z), ii = r.x.indexOf(n.x); const f = w.frame(r, (ii + 10) % r.n);
      // keep to the road: put the car back on its line each step, heading along it
      g.car.place(n.x, n.z, f.yaw, 0.3); g.car.vel.set(Math.sin(f.yaw) * 14, 0, Math.cos(f.yaw) * 14); out.push(document.getElementById('toast').textContent); if (/Entering/.test(out[out.length - 1])) break; }
    return out.filter((s) => /Entering/.test(s)).slice(-1)[0] || out.slice(-1)[0]; });
  check('entering', entry === 'Entering ' + info[0].name, entry);
  await p.waitForTimeout(2500); await p.screenshot({ path: path.join(OUT, `town-${R}-day.png`) });
  // straight at the nearest front-row building from the road
  const hit = await p.evaluate(() => { const g = window.__game, w = g.world, c = g.car, o = w.towns[0].buildings.slice().sort((a, q) => Math.hypot(a.x - c.pos.x, a.z - c.pos.z) - Math.hypot(q.x - c.pos.x, q.z - c.pos.z))[0];
    const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), x = o.x + fx * (o.d / 2 + 14), z = o.z + fz * (o.d / 2 + 14), yaw = Math.atan2(-fx, -fz);
    c.place(x, z, yaw, 0.3); g.advance(0.3); c.vel.set(-fx * 12, 0, -fz * 12); g.advance(3, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true });
    return { gap: +(Math.hypot(c.pos.x - o.x, c.pos.z - o.z) - o.d / 2).toFixed(1), speed: +c.speed.toFixed(1) }; });
  check('solid', hit.gap > -1.5, hit);
  // night: the windows light up
  await p.evaluate(() => { const g = window.__game, w = g.world, t = w.towns[0], o = t.buildings[Math.floor(t.buildings.length / 2)], fx = Math.sin(o.yaw), fz = Math.cos(o.yaw); g.car.place(o.x + fx * 40, o.z + fz * 40, Math.atan2(-fx, -fz) + 0.5, 0.3); g.advance(0.5); g.setTime('night'); });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(OUT, `town-${R}-night.png`) });
  await p.evaluate(() => window.__game.setTime('day'));
  await p.keyboard.press('KeyG'); await p.waitForTimeout(900); await p.screenshot({ path: path.join(OUT, `town-${R}-map.png`) }); await p.keyboard.press('KeyG');
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `towns: ${bad} check(s) failed` : 'towns: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
