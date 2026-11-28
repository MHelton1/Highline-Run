// Car classes in the page (build 39): the garage shows a rating, road races lock out cars above their class, parts
// come off and go back on for free, dirt races take any car, kid mode takes any car.
// usage: [PHONE=1] node tests/classui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext(process.env.PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } })).newPage(), errs = []; let bad = 0; p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  const snap = async (n) => { if (OUT) await p.screenshot({ path: path.join(OUT, 'class-' + n + '.png') }); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html'));
  await p.waitForSelector('#go:not([hidden])', { timeout: 240000 });
  await p.click('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(1); g.setWeather('clear'); g.traffic.on = false; });
  // a fully upgraded hatch (class A) and a stock Apex GT (class S)
  await p.evaluate(() => { const s = window.__game.store.data; s.cash = 50000; s.kid = false; s.cars.hatch.up = [3, 3, 3, 3]; s.cars.hatch.has = [3, 3, 3, 3]; s.cars.apex = { up: [0, 0, 0, 0], has: [0, 0, 0, 0], tune: { gear: 0, spring: 0, ride: 0, stab: 1, tc: 1 }, paint: 0 }; s.car = 'apex'; });
  const card = async (base) => { await p.evaluate((b) => { const g = window.__game; g.openOffer(g.races.find((d) => d.base === b)); }, base); await p.waitForTimeout(400);
    return p.evaluate(() => ({ note: (document.getElementById('dlg-class') || {}).textContent || null, locked: document.getElementById('dlg-go').disabled })); };
  const gp = await card('ring'); await snap('locked');
  check('apex gp', gp.locked && /Class A or lower/.test(gp.note) && /too quick/.test(gp.note), gp);
  const tried = await p.evaluate(() => { const g = window.__game; g.startRace(g.races.find((d) => d.base === 'ring')); return { mode: !!g.raceNote || document.getElementById('toast').textContent }; });
  check('guard', /Class A or lower/.test(tried.mode), tried);
  await p.evaluate(() => window.__game.declineRace());
  const dash = await card('dash'); check('dirt any', !dash.locked && dash.note === null, dash); await p.evaluate(() => window.__game.declineRace());
  await p.evaluate(() => { window.__game.store.data.car = 'hatch'; });
  const hgp = await card('ring'); check('hatch gp', !hgp.locked && /good to go/.test(hgp.note) && /A 6\d\d/.test(hgp.note), hgp); await p.evaluate(() => window.__game.declineRace());
  // in the garage: rating row, take a part off, refit it for nothing
  const gar = await p.evaluate(async () => {
    const g = window.__game, P = g.world.places.garages[0]; g.openGarage(P); await new Promise((r) => setTimeout(r, 400));
    document.getElementById('g-tab-up').click(); await new Promise((r) => setTimeout(r, 300));
    const rating = () => [...document.querySelectorAll('#g-stats dd.val')][0].textContent;
    const r0 = rating(), cash0 = g.store.data.cash;
    document.getElementById('g-down-engine').click(); await new Promise((r) => setTimeout(r, 300));
    const off = { up: g.store.data.cars.hatch.up.slice(), has: g.store.data.cars.hatch.has.slice(), rating: rating(), label: document.getElementById('g-up-engine').textContent };
    document.getElementById('g-up-engine').click(); await new Promise((r) => setTimeout(r, 300));
    return { r0, off, back: g.store.data.cars.hatch.up.slice(), rating: rating(), cashSame: g.store.data.cash === cash0 };
  });
  await snap('garage');
  check('rating', /^A 6\d\d$/.test(gar.r0), gar.r0);
  check('take off', gar.off.up[0] === 2 && gar.off.has[0] === 3 && /Refit stage 3 · free/.test(gar.off.label) && gar.off.rating !== gar.r0, gar.off);
  check('refit', gar.back[0] === 3 && gar.rating === gar.r0 && gar.cashSame, gar);
  // kid mode takes any car
  await p.evaluate(() => { const g = window.__game; g.leaveGarage(); g.store.data.kid = true; g.store.data.car = 'apex'; });
  const kid = await card('ring'); check('kid any', !kid.locked && /Kid mode takes any car/.test(kid.note), kid);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `classes: ${bad} check(s) failed` : 'classes: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
