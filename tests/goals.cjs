// Goals in the page: a delivery counts and pays its goal with a message, the menu's Goals page lists every region
// with progress, and a region's prize paint is locked in the garage until its goals are done.
// usage: node tests/goals.cjs [port|desk] [outdir]
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
  await tap('#go'); await p.evaluate(() => window.__game.pinQuality(2));
  const region = await p.evaluate(() => window.__game.world.region);
  check('visited', await p.evaluate((r) => window.__game.store.data.stats[r].v === 1, region), region);
  // a hot delivery: counted, and "Deliver a Hot load" pays $1,500 with a message after the delivery's own
  const r1 = await p.evaluate(async () => {
    const g = window.__game, cash0 = g.store.data.cash;
    g.game.emit('delivered', { total: 500, bonus: 0, cond: 1, name: 'Somewhere', kind: 'hot' }); g.game.bank.cash += 500;
    await new Promise((r) => setTimeout(r, 300)); g.checkGoals();
    const t0 = performance.now(); let seen = '';
    while (performance.now() - t0 < 60000 && !/Goal done/.test(seen)) { await new Promise((r) => setTimeout(r, 200)); seen = document.getElementById('toast').textContent; }
    return { paid: g.store.data.cash - cash0, toast: seen, stats: g.store.data.stats[g.world.region], done: g.store.data.done };
  });
  check('delivery', r1.paid === 2000 && /Goal done: Deliver a Hot load\. \+\$1,500/.test(r1.toast) && r1.stats.d === 1 && r1.stats.h === 1 && r1.done.length === 1, r1);
  await p.screenshot({ path: `${OUT}/goals-${mode}-toast.png` });
  // the Goals page
  await p.evaluate(() => window.__game.pause()); await p.waitForTimeout(300);
  const label = await p.evaluate(() => document.getElementById('dlg-goals').textContent);
  check('button', label === 'Goals 1/54', label);
  await tap('#dlg-goals'); await p.waitForTimeout(400);
  const page = await p.evaluate((r) => ({ sets: [...document.querySelectorAll('.goalset h3')].map((h) => h.textContent), rows: document.querySelectorAll('.goals li').length,
    hot: document.getElementById('goal-' + r + '-hot').className, d3: document.getElementById('goal-' + r + '-d3').textContent }), region);
  check('page', page.sets.length === 4 && page.sets[0].includes('(here)') && page.sets[0].includes('1 of 16') && page.rows === 54 && page.hot === 'done' && /1 \/ 3/.test(page.d3), page);
  await p.screenshot({ path: `${OUT}/goals-${mode}-page.png` });
  await p.evaluate(() => { document.querySelector('.goalset:last-of-type').scrollIntoView(); }); await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/goals-${mode}-page2.png` });
  await tap('#dlg-back'); await p.waitForTimeout(300);
  check('back', await p.evaluate(() => !!document.getElementById('dlg-goals')), 'menu again');
  await p.evaluate(() => window.__game.resume()); await p.waitForTimeout(300);
  // the prize paints are locked in the garage, and tapping one changes nothing
  await p.evaluate(() => { const g = window.__game; g.openGarage(g.world.places.garages[0]); }); await p.waitForTimeout(600);
  const before = await p.evaluate(() => window.__game.store.data.cars.hatch.paint);
  await p.evaluate(() => document.getElementById('g-paint-8').scrollIntoView()); await (mode === 'desk' ? p.click('#g-paint-8', { force: true }) : p.tap('#g-paint-8', { force: true })); await p.waitForTimeout(300);
  const sw = await p.evaluate(() => ({ locked: [7, 8, 9].map((i) => document.getElementById('g-paint-' + i).getAttribute('aria-disabled')), free: document.getElementById('g-paint-2').getAttribute('aria-disabled'), paint: window.__game.store.data.cars.hatch.paint }));
  check('paints', sw.locked.join() === 'true,true,true' && sw.free === null && sw.paint === before, sw);
  await p.screenshot({ path: `${OUT}/goals-${mode}-garage.png` });
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `goals page: ${bad} check(s) failed` : 'goals page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
