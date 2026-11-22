// Driving tests in the page: the menu list, a test in the yellow school car, a better medal paid once, and the
// player's own car back afterwards. Pictures: the list, the slalom, the results card.
// usage: REGION=coast node tests/schoolui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'), R = process.env.REGION || 'mountain'; require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(), errs = []; let bad = 0; p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  const snap = async (name, wait = 1500) => { await p.waitForTimeout(wait); await p.screenshot({ path: path.join(OUT, `school-${R}-${name}.png`) }); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + '#r=' + R);
  await p.waitForSelector('#go:not([hidden])', { timeout: 240000 });
  await p.click('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(1); g.setWeather('clear'); g.advance(1); });
  const own = await p.evaluate(() => window.__game.car.spec.name);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('#dlg-school'); await p.waitForTimeout(500);
  const list = await p.evaluate(() => [...document.querySelectorAll('#dialog li')].map((li) => li.querySelector('.gname').textContent));
  check('list', list.length === 5, list);
  await snap('list', 600);
  await p.click('#test-go-slalom'); await p.waitForTimeout(300);
  const run = await p.evaluate(() => { const g = window.__game; g.advance(4.5, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); return { mode: g.mode, test: g.race && g.race.def.name, school: !!(g.race && g.race.def.school), car: g.car.spec.name, state: g.race && g.race.state, level: g.race && g.race.level, gate: g.race && g.race.gates[0].r }; });
  check('in test', run.mode === 'race' && run.school && run.car === 'Rally Hatch' && run.state === 'run' && run.level === 1, run);
  await snap('slalom', 2200);
  // finish it with a gold time: paid 2000 once, then nothing more for another gold
  const pay = await p.evaluate(() => { const g = window.__game, c0 = g.store.data.cash; g.race.clock = g.race.t = 10; g.race.finish(); g.advance(0.2); const c1 = g.store.data.cash; return { c0, c1, medal: g.race.result.medal, prize: g.race.result.prize, rank: g.store.data.rank[g.race.def.id] }; });
  check('paid', pay.medal === 0 && pay.c1 - pay.c0 === 2000 && pay.rank === 1, pay);
  await snap('results', 3500);
  await p.click('#dlg-again'); await p.waitForTimeout(300);
  const again = await p.evaluate(() => { const g = window.__game; g.advance(4.5); const c0 = g.store.data.cash; g.race.clock = g.race.t = 9; g.race.finish(); g.advance(3.2); return { paid: g.store.data.cash - c0, prize: g.race.result.prize, card: document.getElementById('dialog').textContent.slice(0, 160) }; });
  check('once', again.paid === 0 && /Paid before/.test(again.card), again);
  await p.click('#dlg-go'); await p.waitForTimeout(300);
  const back = await p.evaluate(() => { const g = window.__game; g.advance(1); return { mode: g.mode, car: g.car.spec.name }; });
  check('own car', back.mode === 'roam' && back.car === own, { own, ...back });
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `school: ${bad} check(s) failed` : 'school: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
