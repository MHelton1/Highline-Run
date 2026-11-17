// Ghost car in the page: a finished race saves a ghost, racing the event again shows it and follows its recording,
// checkpoints compare against it, and the race card can turn it off. usage: node tests/ghostui.cjs [port|desk] [outdir]
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
  // drive the ring race checkpoint by checkpoint: put the car a little before each one and let it run through
  const runRace = (pace) => p.evaluate(async (pace) => {
    const g = window.__game, d = g.races.find((q) => q.base === 'ring'), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), toasts = [];
    g.startRace(d); const r = g.race;
    while (r.state === 'count') await sleep(100);
    const ghost0 = g.ghost;
    for (let k = 0; k < r.gates.length && r.state === 'run'; k++) {
      const gt = r.gates[r.gate], f = r.def.path.at(gt.idx - 14); g.car.place(f.x, f.z, f.yaw);
      g.advance(pace, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true });
      const t0 = performance.now(); while (performance.now() - t0 < 600) { await sleep(50); const tx = document.getElementById('toast').textContent; if (/ghost/.test(tx) && toasts[toasts.length - 1] !== tx) toasts.push(tx); }
    }
    const t0 = performance.now(); while (g.mode !== 'results' && performance.now() - t0 < 30000) await sleep(100);
    return { ghost0, ghostDuring: g.ghost, state: r.state, time: r.result && +r.result.time.toFixed(1), toasts: toasts.slice(0, 3), note: (document.getElementById('dlg-ghostnote') || {}).textContent || null, stored: Object.keys(localStorage).filter((k) => k.startsWith('highline.ghost.')), id: d.id };
  }, pace);
  const a = await runRace(3);
  check('first', a.ghost0 === null && a.state === 'done' && /Ghost saved/.test(a.note) && a.stored.join() === 'highline.ghost.' + a.id, a);
  const b2 = await runRace(2.5);   // a quicker run: the ghost is there, checkpoints compare, and this run replaces it
  check('again', b2.ghost0 && b2.ghost0.n > 50 && b2.ghost0.splits === 11 && b2.toasts.some((t) => /ahead of your ghost/.test(t)) && /You beat your ghost/.test(b2.note), b2);
  // the ghost moves with the race clock while the next run waits on the grid and then starts
  const c = await p.evaluate(async () => {
    const g = window.__game, d = g.races.find((q) => q.base === 'ring'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    g.startRace(d); const r = g.race; await sleep(500); const grid = g.ghost.pos;
    while (r.state === 'count') await sleep(100);
    g.advance(4, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); await sleep(800);
    return { grid, later: g.ghost.pos, shown: g.ghost.shown, clock: +r.clock.toFixed(1) };
  });
  check('moves', c.grid && c.later && Math.hypot(c.grid[0] - c.later[0], c.grid[2] - c.later[2]) > 20 && c.shown, c);
  await p.screenshot({ path: `${OUT}/ghost-${mode}-race.png` });
  // the race card offers the ghost once there is one, and turning it off races without it
  await p.evaluate(() => { const g = window.__game; g.endRace(); g.openOffer(g.races.find((q) => q.base === 'ring')); }); await p.waitForTimeout(500);
  const card = await p.evaluate(() => ({ on: document.getElementById('dlg-gh-1') && document.getElementById('dlg-gh-1').getAttribute('aria-pressed'), off: !!document.getElementById('dlg-gh-0') }));
  await tap('#dlg-gh-0'); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/ghost-${mode}-card.png` });
  await tap('#dlg-go'); await p.waitForTimeout(800);
  const off = await p.evaluate(() => ({ saved: window.__game.store.data.ghost, ghost: window.__game.ghost }));
  check('card', card.on === 'true' && card.off && off.saved === false && off.ghost === null, { card, off });
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `ghost page: ${bad} check(s) failed` : 'ghost page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
