// Phone layouts in four window sizes, including short sideways windows like a phone held sideways inside an app.
// Pictures land in tests/shots/layout-*.png. usage: node tests/layout.cjs
const { chromium, devices } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, vp] of [['port', null], ['land', { width: 844, height: 390 }], ['short', { width: 844, height: 260 }], ['tiny', { width: 640, height: 200 }]]) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, ...(vp ? { viewport: vp } : {}) }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : '')); await p.waitForSelector('#go:not([hidden])', { timeout: 120000 });
    await p.tap('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(2); g.store.data.runs = 3; const s = g.game.sites[2]; g.car.place(s.x - 4, s.z, 0.3); g.advance(0.5); g.game.startJob(s, 'rival'); g.advance(1); });
    await p.waitForTimeout(6000); await p.screenshot({ path: path.join(__dirname, "shots", `layout-${name}.png`) });
    const r = await p.evaluate(() => Object.fromEntries(['mapbox', 'job', 'dash', 'info', 'tl', 'tg', 'th', 'fullbtn'].map((id) => { const e = document.getElementById(id), q = e.getBoundingClientRect(); return [id, [q.left, q.top, q.right, q.bottom].map(Math.round).join(',') + (e.hidden ? ' hidden' : '')]; })));
    console.log(name, JSON.stringify(r), errs);
    await ctx.close();
  }
  await b.close();
})();
