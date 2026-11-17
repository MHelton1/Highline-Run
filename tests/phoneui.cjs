// Phone extras in the page: Steering in the menu turns tilt steering on (fed here with made-up tilt readings), tilting
// steers the car, the setting is saved, and crashes buzz the phone (Vibration switch).
// usage: node tests/phoneui.cjs [port|land] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'port', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const dev = mode === 'land' ? devices['iPhone 13 landscape'] : devices['iPhone 13'];
  const ctx = await b.newContext({ ...dev, deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => {
    window.__buzz = []; navigator.vibrate = (x) => { window.__buzz.push(x); return true; };
    // a phone tilted with its right side down by `deg`: readings every 50 ms, in the standard sign convention
    window.__tilt = 0;
    // headless browsers have no motion sensor (and no DeviceMotionEvent outside secure pages): stand one in
    if (typeof window.DeviceMotionEvent !== 'function') window.DeviceMotionEvent = class extends Event { constructor(t, o = {}) { super(t); this.accelerationIncludingGravity = o.accelerationIncludingGravity || null; } };
    // the permission question a phone would ask: answered yes here
    window.DeviceMotionEvent.requestPermission = async () => 'granted';
    setInterval(() => { const a = (screen.orientation && screen.orientation.angle) || 0, r = Math.PI / 180, sx = -Math.sin(window.__tilt * r) * 9.81, rest = Math.cos(window.__tilt * r) * 9.81, sy = rest * 0.7, z = rest * 0.7, q = a * r;
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: sx * Math.cos(q) + sy * Math.sin(q), y: -sx * Math.sin(q) + sy * Math.cos(q), z } })); }, 50);
  });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html'));
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await p.tap('#go'); await p.evaluate(() => window.__game.pinQuality(2));
  await p.tap('#menubtn'); await p.waitForTimeout(400);
  const before = await p.evaluate(() => ({ tilt: (document.getElementById('dlg-tilt') || {}).textContent, buzz: (document.getElementById('dlg-buzz') || {}).textContent }));
  check('menu', before.tilt === 'Steering: buttons' && before.buzz === 'Vibration on', before);
  await p.tap('#dlg-tilt'); await p.waitForFunction(() => window.__game.store.data.tilt === true && /tilt$/.test((document.getElementById('dlg-tilt') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const after = await p.evaluate(() => ({ label: (document.getElementById('dlg-tilt') || {}).textContent, saved: window.__game.store.data.tilt, on: window.__game.tilt.on, toast: document.getElementById('toast').textContent }));
  check('tilt on', after.label === 'Steering: tilt' && after.saved && after.on && /Tilt steering on/.test(after.toast), after);
  await p.screenshot({ path: `${OUT}/phone-${mode}-menu.png` });
  await p.evaluate(() => window.__game.resume()); await p.waitForTimeout(300);
  const steer = await p.evaluate(async () => { const out = {}; for (const d of [20, -20, 1]) { window.__tilt = d; await new Promise((r) => setTimeout(r, 600)); out[d] = +window.__game.input.poll().steer.toFixed(2); } return out; });
  check('steering', steer[20] < -0.6 && steer[-20] > 0.6 && steer[1] === 0, steer);
  // a crash buzzes
  const bz = await p.evaluate(async () => { const g = window.__game; window.__buzz.length = 0; g.car.vel.set(0, -14, 0); g.advance(1); await new Promise((r) => setTimeout(r, 300)); return window.__buzz.slice(); });
  check('buzz', bz.length > 0, bz);
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `phone page: ${bad} check(s) failed` : 'phone page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
