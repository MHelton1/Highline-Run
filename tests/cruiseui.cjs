// Auto throttle in the page: off by default; on, the car speeds up to 80 mph by itself on the ring road, the
// throttle takes it faster, the brake slows it, and the setting is saved. Also drives under a coast bridge.
// usage: node tests/cruiseui.cjs
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), errs = []; let bad = 0; p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + '#r=desert');
  await p.waitForSelector('#go:not([hidden])', { timeout: 240000 });
  await p.click('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(1); g.setWeather('clear'); g.traffic.on = false; g.store.data.traffic = false; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const before = await p.evaluate(() => document.getElementById('dlg-cruise').textContent);
  await p.click('#dlg-cruise'); await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ label: document.getElementById('dlg-cruise').textContent, saved: window.__game.store.data.cruise }));
  check('switch', before === 'Auto throttle off' && after.label === 'Auto throttle on (80 mph)' && after.saved === true, { before, ...after });
  const mph = await p.evaluate(() => {
    const g = window.__game; g.resume(); g.store.data.kid = false;
    // the longest straight-ish run: the ring road from its start line, steered by a simple follower
    const w = g.world, r = w.roads[0], n = r.n; let i0 = w.places.lines.ring.idx; const f = w.frame(r, i0); g.car.place(f.x, f.z, f.yaw, 0.3);
    const drive = (sec, extra) => { for (let k = 0; k < sec * 10; k++) { let bi = i0, bd = 1e18; for (let d = -10; d < 60; d++) { const j = (i0 + d + n) % n, dd = (r.x[j] - g.car.pos.x) ** 2 + (r.z[j] - g.car.pos.z) ** 2; if (dd < bd) { bd = dd; bi = j; } } i0 = bi;
      const t = w.frame(r, (i0 + 25) % n), dx = t.x - g.car.pos.x, dz = t.z - g.car.pos.z, c = g.car, ang = Math.atan2(dx * c.fwd.z - dz * c.fwd.x, dx * c.fwd.x + dz * c.fwd.z);
      g.advance(0.1, { steer: Math.max(-1, Math.min(1, ang * 2.5)), throttle: 0, brake: 0, handbrake: false, analog: true, ...extra }); } return Math.round(g.car.speed * 2.23694); };
    const auto = drive(25, {}), held = drive(8, { throttle: 1 }), braked = drive(2, { brake: 1 });
    return { auto, held, braked };
  });
  check('speeds', mph.auto >= 74 && mph.auto <= 84 && mph.held > mph.auto + 3 && mph.braked < mph.held - 15, mph);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `cruise: ${bad} check(s) failed` : 'cruise: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
