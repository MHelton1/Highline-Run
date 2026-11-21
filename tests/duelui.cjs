// Two players on one screen in the page: the menu opens the setup card, the race splits the screen, both players get
// their own checkpoints and HUD panel, the results card names the winner, and Back to driving returns to free roam.
// usage: node tests/duelui.cjs [desk|port] [outdir]
const { chromium } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'desk', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: mode === 'desk' ? { width: 1280, height: 720 } : { width: 720, height: 1000 } });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await p.click('#go'); await p.evaluate(() => window.__game.pinQuality(2));
  await p.click('#menubtn'); await p.waitForTimeout(300);
  await p.click('#dlg-duo'); await p.waitForTimeout(300);
  const setup = await p.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, evs: [...document.querySelectorAll('[id^="dlg-duo-"]')].map((e) => e.id), car: document.getElementById('dlg-duo-car').textContent }));
  check('setup', setup.title === 'Two players' && setup.evs.includes('dlg-duo-go') && setup.evs.includes('dlg-duo-free') && setup.evs.length >= 11, setup);
  await p.click('#dlg-duo-' + (await p.evaluate(() => window.__game.races[0].id))); await p.waitForTimeout(200);
  await p.click('#dlg-duo-go'); await p.waitForTimeout(300);
  // both players held still: the test drives the cars by moving them
  await p.evaluate(() => { const g = window.__game, z = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true }; g.input.poll2 = () => [z, z]; });
  const st = await p.evaluate(() => { const g = window.__game; return { mode: g.mode, duo: document.body.classList.contains('duo'), shown: !document.getElementById('duo').hidden, car2: !!g.car2, gap: g.car.pos.distanceTo(g.car2.pos) }; });
  check('start', st.mode === 'duel' && st.duo && st.shown && st.car2 && st.gap > 2 && st.gap < 8, st);
  await p.waitForFunction(() => window.__game.duel && window.__game.duel.state === 'run', null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const hud = await p.evaluate(() => ({ l0: document.getElementById('duo-l0').textContent, l1: document.getElementById('duo-l1').textContent, n0: document.getElementById('duo-n0').textContent, n1: document.getElementById('duo-n1').textContent, s0: document.getElementById('duo-s0').textContent, wide: document.getElementById('duo').classList.contains('wide'), hudHidden: getComputedStyle(document.getElementById('dash')).visibility }));
  check('hud', /Checkpoint 1 of/.test(hud.l0) && /Checkpoint 1 of/.test(hud.l1) && [hud.n0, hud.n1].sort().join() === '1st,2nd' && hud.wide === (mode === 'desk') && hud.hudHidden === 'hidden', hud);
  await p.screenshot({ path: path.join(OUT, `duel-${mode}.png`) });
  // player 2 runs every checkpoint first, then player 1
  const run = (i) => p.evaluate((i) => { const g = window.__game, d = g.duel, c = i ? g.car2 : g.car, out = [];
    for (let k = 0; k < d.gates.length * d.laps && d.players[i].time == null; k++) { const q = d.next(i); c.place(q.x, q.z, 0, 0.2); g.advance(0.1); out.push(d.players[i].gate); }
    return { time: d.players[i].time, steps: out.length }; }, i);
  const r1 = await run(1);
  const mid = await p.evaluate(() => ({ l1: document.getElementById('duo-l1').textContent, toast: document.getElementById('toast').textContent, places: window.__game.duel.places() }));
  check('p2 home', r1.time > 0 && mid.places[1] === 1 && /Player 2 finishes first/.test(mid.toast), { r1, mid });
  const r0 = await run(0);
  check('p1 home', r0.time > r1.time, r0);
  await p.waitForFunction(() => window.__game.mode === 'duelres', null, { timeout: 60000 }).catch(() => {});
  const res = await p.evaluate(() => ({ mode: window.__game.mode, title: (document.getElementById('dlg-title') || {}).textContent, table: (document.getElementById('dlg-duo-table') || {}).textContent }));
  check('results', res.mode === 'duelres' && res.title === 'Player 2 wins!' && /1st.*Player 2.*2nd.*Player 1/.test(res.table), res);
  await p.screenshot({ path: path.join(OUT, `duelres-${mode}.png`) });
  await p.click('#dlg-duo-again'); await p.waitForTimeout(300);
  const again = await p.evaluate(() => ({ mode: window.__game.mode, state: window.__game.duel.state, gate: window.__game.duel.players[0].gate }));
  check('again', again.mode === 'duel' && again.state === 'count' && again.gate === 0, again);
  // pause during the race: restart and leave are offered, two players is not
  await p.click('#duo-menu'); await p.waitForTimeout(300);
  const menu = await p.evaluate(() => ({ duo: !!document.getElementById('dlg-duo'), text: document.querySelector('.card.sheet, #dlg') ? document.body.innerText.slice(0, 400) : '' }));
  check('pause', !menu.duo, menu);
  await p.evaluate(() => window.__game.endDuel()); await p.waitForTimeout(300);
  const back = await p.evaluate(() => ({ mode: window.__game.mode, duo: document.body.classList.contains('duo'), car2: window.__game.car2, dash: getComputedStyle(document.getElementById('dash')).visibility }));
  check('back', back.mode === 'roam' && !back.duo && back.car2 == null && back.dash === 'visible', back);
  await p.evaluate(() => window.__game.advance(0.5));
  // the open map for two, with kid mode on: no checkpoints or clock to beat, the arrow points at the other car, and kid
  // mode drives both cars' pedals
  await p.evaluate(() => { window.__game.store.data.kid = true; });
  await p.click('#menubtn'); await p.waitForTimeout(300); await p.click('#dlg-duo'); await p.waitForTimeout(300);
  await p.click('#dlg-duo-free'); await p.waitForTimeout(200);
  const fsetup = { on: await p.evaluate(() => document.getElementById('dlg-duo-free').getAttribute('aria-pressed')), go: await p.evaluate(() => document.getElementById('dlg-duo-go').textContent) };
  await p.click('#dlg-duo-go'); await p.waitForTimeout(300);
  await p.evaluate(() => { const g = window.__game, z = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true }; g.input.poll2 = () => [z, z]; });
  const free = await p.evaluate(() => { const g = window.__game, d = g.duel; g.advance(2.5); g.duoHud(); return { free: d.free, state: d.state, gates: d.next(0), v1: +g.car.speed.toFixed(1), v2: +g.car2.speed.toFixed(1),
    lbl: document.getElementById('duo-l0').textContent, dist: document.getElementById('duo-n0').textContent, gap: +g.car.pos.distanceTo(g.car2.pos).toFixed(1) }; });
  check('open map', fsetup.on === 'true' && fsetup.go === 'Start driving' && free.free && free.state === 'run' && free.gates === null && /Open map/.test(free.lbl) && /\d+ (ft|m)$/.test(free.dist), { fsetup, free });
  check('kid duo', free.v1 > 3 && free.v2 > 3, free);
  await p.click('#duo-menu'); await p.waitForTimeout(300);
  const fm = { restart: await p.evaluate(() => !!document.getElementById('dlg-restart')), quit: await p.evaluate(() => (document.getElementById('dlg-quit') || {}).textContent) };
  await p.click('#dlg-quit'); await p.waitForTimeout(300);
  check('free quit', !fm.restart && fm.quit === 'Back to one player' && (await p.evaluate(() => window.__game.mode)) === 'roam', fm);
  await p.evaluate(() => { window.__game.store.data.kid = false; });
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `duelui: ${bad} check(s) failed` : 'duelui: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
