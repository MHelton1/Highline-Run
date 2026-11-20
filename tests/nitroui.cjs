// Nitro: bought once in the garage's Parts tab, then the NOS control shows, the dash shows the tank, and holding it
// makes the car faster than the same run without; it does nothing in a race.
// usage: node tests/nitroui.cjs [port|desk] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'port', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const tap = (sel) => (mode === 'desk' ? p.click(sel) : p.tap(sel));
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await tap('#go'); await p.evaluate(() => window.__game.pinQuality(1));
  const before = await p.evaluate(() => ({ cls: document.body.classList.contains('nitro'), tn: getComputedStyle(document.getElementById('tn')).display }));
  check('hidden', !before.cls && before.tn === 'none', before);
  // straight-line run from a standstill on the ring road, with and without nitro
  const run = (nos) => p.evaluate((nos) => { const g = window.__game, r = g.world.roads[0], i = r.from + 40, j = i + 6, yaw = Math.atan2(r.x[j] - r.x[i], r.z[j] - r.z[i]);
    g.car.place(r.x[i], r.z[i], yaw, 0.4); g.advance(0.5); g.nitro.level = 1;
    g.advance(3, { steer: 0, throttle: 1, brake: 0, handbrake: false, nitro: nos, analog: true }); return +g.car.speed.toFixed(2); }, nos);
  const plain0 = await run(true);
  await p.evaluate(() => { const g = window.__game; g.ui && 0; }); 
  // buy it in the garage
  await p.evaluate(() => { const g = window.__game; g.pause(); document.getElementById('dlg-cash').click(); g.resume(); g.openGarage(g.zones.find((z) => z.kind === 'garage').g); });
  await p.waitForTimeout(400); await tap('#g-tab-up'); await p.waitForTimeout(300);
  const btn = await p.evaluate(() => document.getElementById('g-nitro').textContent);
  await tap('#g-nitro'); await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ btn: document.getElementById('g-nitro').textContent, cls: document.body.classList.contains('nitro') }));
  check('buy', /Buy · \$4,000/.test(btn) && /Fitted/.test(after.btn) && after.cls, { btn, after });
  await p.screenshot({ path: path.join(OUT, `nitro-garage-${mode}.png`) });
  await tap('#g-leave'); await p.waitForTimeout(800);
  const shown = await p.evaluate(() => ({ tn: getComputedStyle(document.getElementById('tn')).display, bar: getComputedStyle(document.getElementById('nos')).display }));
  check('shown', (mode === 'desk' || shown.tn !== 'none') && shown.bar !== 'none', shown);
  const plain = await run(false), boost = await run(true), left = await p.evaluate(() => window.__game.nitro.level);
  check('faster', boost > plain + 3 && Math.abs(plain0 - plain) < 1.5 && left < 0.3, { plain0, plain, boost, left });
  await p.screenshot({ path: path.join(OUT, `nitro-${mode}.png`) });
  // touch: the NOS control drives it
  if (mode !== 'desk') {
    const box = await p.evaluate(() => { const r = document.getElementById('tn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 1 }] });
    await p.waitForTimeout(200);
    const held = await p.evaluate(() => window.__game.input.poll().nitro);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('touch', held === true, { held });
  }
  // a race ignores it
  const race = await p.evaluate(() => { const g = window.__game; g.startRace(g.races[0]); g.advance(5); g.nitro.level = 1; const l = g.nitro.level; g.advance(1, { steer: 0, throttle: 1, brake: 0, handbrake: false, nitro: true, analog: true }); const out = { mode: g.mode, level: g.nitro.level, on: g.nitro.on }; g.endRace(); return out; });
  check('race', race.mode === 'race' && race.level === 1 && !race.on, race);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `nitro: ${bad} check(s) failed` : 'nitro: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
