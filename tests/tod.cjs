// Time of day in the page: the menu's Time button steps Day, Sunset, Night, Day cycle; night turns the headlights on
// and shortens how far patrols see; the cycle moves the clock; the choice is saved and comes back after a reload.
// usage: node tests/tod.cjs [port|desk] [outdir]
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
  const url = 'file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : '');
  await p.goto(url); await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await tap('#go'); await p.evaluate(() => window.__game.pinQuality(2));
  const state = () => p.evaluate(() => { const g = window.__game; return { tod: g.store.data.tod, hour: +g.day.hour.toFixed(2), night: +g.night.toFixed(2), head: g.headlight, sight: g.game.sight ?? 1, label: (document.getElementById('dlg-time') || {}).textContent }; });
  check('start', (await state()).tod === 'day', await state());
  const labels = [];
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => window.__game.pause()); await p.waitForTimeout(250);
    await tap('#dlg-time'); await p.waitForTimeout(250);
    labels.push((await state()).label);
    await p.evaluate(() => window.__game.resume()); await p.waitForTimeout(1200);
    const s = await state();
    if (s.tod === 'sunset') check('sunset', s.hour === 19.1 && s.night > 0.2 && s.night < 0.6 && s.sight < 1, s);
    if (s.tod === 'night') { check('night', s.hour === 0 && s.night === 1 && s.head > 100 && Math.abs(s.sight - 0.6) < 0.01, s); await p.screenshot({ path: `${OUT}/tod-${mode}-night.png` }); }
    if (s.tod === 'cycle') { const a = s; await p.evaluate(() => { window.__game.day.t += 50 * 13; }); await p.waitForTimeout(2500); const c = await state(); check('cycle', a.hour >= 8 && a.hour < 8.5 && c.hour > 21 && c.hour < 22 && c.night > 0.9, { a, c }); }   // jump the clock thirteen hours on: night
  }
  check('labels', labels.join('|') === 'Time: Sunset|Time: Night|Time: Day cycle', labels);
  // the next press goes back to day, then night again, and night survives a reload
  await p.keyboard.press('KeyT'); await p.waitForTimeout(300); await p.keyboard.press('KeyT'); await p.waitForTimeout(300); await p.keyboard.press('KeyT'); await p.waitForTimeout(600);
  check('keys', (await state()).tod === 'night', await state());
  await p.evaluate(() => window.__game.store.flush && window.__game.store.flush());
  await p.reload(); await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await tap('#go'); await p.waitForTimeout(1500);
  check('reload', (await state()).tod === 'night' && (await state()).night === 1, await state());
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `tod: ${bad} check(s) failed` : 'tod: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
