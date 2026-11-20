// Daily challenge in the page: the menu shows today's task with its reward, doing it pays once (news toast), the menu
// then says done, and a skidding car leaves tyre marks.
// usage: node tests/dailyui.cjs [port|desk] [outdir]
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
  await tap('#menubtn'); await p.waitForTimeout(400);
  const m1 = await p.evaluate(() => document.getElementById('dlg-daily').textContent);
  const info = await p.evaluate(() => window.__game.dailyInfo());
  check('menu', m1.includes(info.text) && /Daily challenge · \$3,000/.test(m1) && !info.done, { m1, info });
  await p.screenshot({ path: path.join(OUT, `daily-${mode}.png`) });
  await tap('#dlg-go'); await p.waitForTimeout(300);
  // do today's task through the same hook the game uses
  const r = await p.evaluate(() => { const g = window.__game, rec = g.store.data.daily, kind = g.dailyInfo().text; const cash0 = g.store.data.cash;
    const ch = { deliver: ['deliver', 1], hot: ['hot', 1], race: ['race', 1] }; const t = /deliveries/.test(kind) ? ch.deliver : /Hot load/.test(kind) ? ch.hot : /race/.test(kind) ? ch.race : /drift/.test(kind) ? ['drift', 1e5] : /speed trap/.test(kind) ? ['trap', 200] : ['air', 9];
    for (let i = 0; i < 4; i++) g.daily(t[0], t[1]);
    return { paid: g.store.data.cash - cash0, rec: { ...rec } }; });
  check('paid', r.paid === 3000 && r.rec.done && r.rec.streak === 1, r);
  await p.waitForFunction(() => /Daily challenge done! \+\$3,000/.test(document.getElementById('toast').textContent), null, { timeout: 15000 }).catch(() => {});
  const t = await p.evaluate(() => document.getElementById('toast').textContent);
  check('news', /Daily challenge done! \+\$3,000/.test(t), t);
  const again = await p.evaluate(() => { const g = window.__game, c0 = g.store.data.cash; g.daily('drift', 1e6); g.daily('deliver', 1); return g.store.data.cash - c0; });
  check('once', again === 0, again);
  await tap('#menubtn'); await p.waitForTimeout(400);
  const m2 = await p.evaluate(() => document.getElementById('dlg-daily').textContent);
  check('done', /Daily challenge · done/.test(m2) && /new one tomorrow/.test(m2), m2);
  await tap('#dlg-go'); await p.waitForTimeout(300);
  // tyre marks from a handbrake slide on tarmac
  const sk = await p.evaluate(() => { const g = window.__game, t = g.traps[0], yaw = Math.atan2(t.fx, t.fz), c = g.car, n0 = g.skids.count;
    c.place(t.x - t.fx * 40, t.z - t.fz * 40, yaw, 0.3); g.advance(0.3); c.vel.set(t.fx * 20, 0, t.fz * 20);
    g.advance(0.4, { steer: 0.7, throttle: 0.3, brake: 0, handbrake: true, analog: true }); return g.skids.count - n0; });
  check('skids', sk > 5, sk);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `daily: ${bad} check(s) failed` : 'daily: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
