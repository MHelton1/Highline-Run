// Tips in the page: a fresh game shows the first tip after a few seconds of driving, a tap closes it, the next waits
// its turn, and Tips in the menu switches them off (and back on from the start).
// usage: node tests/tipsui.cjs [port|desk|land] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'port', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : mode === 'land' ? await b.newContext({ ...devices['iPhone 13 landscape'], deviceScaleFactor: 1 }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const tap = (sel) => (mode === 'desk' ? p.click(sel) : p.tap(sel));
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await tap('#go'); await p.evaluate(() => window.__game.pinQuality(2));
  const tick = (sec) => p.evaluate((sec) => { const g = window.__game; for (let i = 0; i < sec * 10; i++) g.tipTick(0.1); return g.tip; }, sec);
  await p.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 20000 }).catch(() => {});
  const t1 = await tick(12);
  check('first', /amber light/.test(t1 || ''), t1);
  await p.waitForTimeout(600); await p.screenshot({ path: path.join(OUT, `tip-${mode}.png`) });
  await tap('#tip'); await p.waitForTimeout(300);
  const closed = await p.evaluate(() => window.__game.tip);
  check('closed', closed === null, closed);
  const t2 = await tick(10);
  check('gap', t2 === null, t2);
  const t3 = await tick(50);
  check('second', !!t3 && t3 !== t1, t3);   // the next tip (here: the garage the car starts at)
  const seen = await p.evaluate(() => window.__game.store.data.tips.slice());
  check('saved', Array.isArray(seen) && seen[0] === 'start' && seen.length === 2, seen);
  // switch off from the menu
  await tap('#menubtn'); await p.waitForTimeout(400);
  const lbl = await p.evaluate(() => document.getElementById('dlg-tips').textContent);
  await tap('#dlg-tips'); await p.waitForTimeout(300);
  const lbl2 = await p.evaluate(() => document.getElementById('dlg-tips').textContent);
  await tap('#dlg-go'); await p.waitForTimeout(300);
  const t4 = await tick(120);
  check('off', lbl === 'Tips on' && lbl2 === 'Tips off' && t4 === null, { lbl, lbl2, t4 });
  // back on: they start again from the top
  await tap('#menubtn'); await p.waitForTimeout(400); await tap('#dlg-tips'); await p.waitForTimeout(300); await tap('#dlg-go'); await p.waitForTimeout(300);
  await p.waitForFunction(() => !document.getElementById('toast').classList.contains('show'), null, { timeout: 20000 }).catch(() => {});
  const t5 = await tick(12);
  check('reset', /amber light/.test(t5 || ''), t5);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `tips: ${bad} check(s) failed` : 'tips: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
