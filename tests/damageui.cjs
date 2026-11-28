// Crash damage in the page (build 39): a hard knock into a garage wall dents the car and costs power, the menu switch
// turns it off, kid mode never takes damage, and a garage repairs it for a fee.
// usage: node tests/damageui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), errs = []; let bad = 0; p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html'));
  await p.waitForSelector('#go:not([hidden])', { timeout: 240000 });
  await p.click('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(1); g.setWeather('clear'); g.traffic.on = false; g.store.data.traffic = false; g.store.data.kid = false; g.store.data.cash = 5000; });
  // drive into the second garage's building at about 45 mph
  const ram = () => p.evaluate(() => {
    const g = window.__game, G = g.world.places.garages[1], yaw = Math.atan2(G.bx - G.x, G.bz - G.z);
    g.car.place(G.bx - Math.sin(yaw) * 26, G.bz - Math.cos(yaw) * 26, yaw); g.advance(0.3); g.car.vel.copy(g.car.fwd).multiplyScalar(20);
    const pos = () => { let s = 0; g.vis.body.traverse((m) => { if (m.isMesh && m.geometry.attributes.position) { const a = m.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 97) s += a[i]; } }); return s; };
    const before = pos(); for (let k = 0; k < 30; k++) g.advance(0.1, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true });
    return { dmg: g.store.data.cars.hatch.dmg || 0, dented: Math.abs(pos() - before) > 1e-4, toast: document.getElementById('toast').textContent };
  });
  const r1 = await ram();
  check('dented', r1.dmg > 0.05 && r1.dented, r1);
  if (OUT) await p.evaluate(() => { const g = window.__game; g.car.vel.set(0, 0, 0); g.advance(0.5); }), await p.screenshot({ path: path.join(OUT, 'damage-car.png') });
  const slow = await p.evaluate(() => { const g = window.__game, s = g.store.data; s.cars.hatch.dmg = 0.8; const f = g.world.frame(g.world.roads[0], g.world.places.lines.ring.idx); const run = () => { g.car.place(f.x, f.z, f.yaw); g.advance(0.3); for (let k = 0; k < 40; k++) g.advance(0.1, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); return g.car.speed; };
    const hurt = run(); s.cars.hatch.dmg = 0; const fine = run(); return { hurt: +hurt.toFixed(1), fine: +fine.toFixed(1) }; });
  check('power', slow.hurt < slow.fine - 0.5, slow);
  // switched off: no damage
  await p.evaluate(() => { const g = window.__game; g.store.data.cars.hatch.dmg = 0; g.toggleSetting('damage'); });
  const r2 = await ram(); check('off', r2.dmg === 0, r2);
  await p.evaluate(() => { const g = window.__game; g.toggleSetting('damage'); g.store.data.kid = true; });
  const r3 = await ram(); check('kid', r3.dmg === 0, r3);
  await p.evaluate(() => { window.__game.store.data.kid = false; });
  await ram();
  const fix = await p.evaluate(async () => { const g = window.__game, s = g.store.data, d = s.cars.hatch.dmg, c0 = s.cash; g.openGarage(g.world.places.garages[0]); await new Promise((r) => setTimeout(r, 300));
    return { d, paid: c0 - s.cash, after: s.cars.hatch.dmg, toast: document.getElementById('toast').textContent }; });
  check('repair', fix.d > 0 && fix.after === 0 && fix.paid > 0 && /Repairs/.test(fix.toast), fix);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `damage: ${bad} check(s) failed` : 'damage: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
