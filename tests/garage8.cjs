// Garage with every car on an upright and a sideways phone: the list fits and scrolls, each new car shows in the showroom.
// usage: node tests/garage8.cjs [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [mode, opts] of [['port', { ...devices['iPhone 13'], deviceScaleFactor: 1 }], ['land', { ...devices['iPhone 13 landscape'], deviceScaleFactor: 1 }]]) {
    const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html'));
    await p.waitForSelector('#go:not([hidden])', { timeout: 120000 });
    await p.tap('#go');
    const info = await p.evaluate(() => { const g = window.__game; g.pinQuality(1); g.store.data.cash = 100000; g.openGarage(g.world.places.garages[0]); return { mode: g.mode }; });
    await p.waitForTimeout(800);
    const list = await p.evaluate(() => [...document.querySelectorAll('.caritem')].map((e) => e.querySelector('.ci-name').textContent + ' ' + e.querySelector('.ci-state').textContent));
    console.log(mode, JSON.stringify(info), list.join(' | '));
    for (const id of ['sprint', 'wagon', 'trophy', 'apex']) {
      await p.evaluate((id) => document.getElementById('g-car-' + id).click(), id);
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${OUT}/garage-${mode}-${id}.png` });
    }
    await p.evaluate(() => document.getElementById('g-act').click()); await p.waitForTimeout(500);
    console.log(mode, 'bought', await p.evaluate(() => ({ owned: Object.keys(window.__game.store.data.cars), cash: window.__game.store.data.cash })), 'errors', errs.slice(0, 4));
    await ctx.close();
  }
  await b.close();
})();
