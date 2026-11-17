// Hidden finds in the page: a crate pays and disappears, the shed gives up its car (which then shows in the garage),
// a ramp throws the car into the air and the landing pays, and the Goals page gives hints.
// usage: node tests/findsui.cjs [port|desk] [outdir]
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
  const info = await p.evaluate(() => { const f = window.__game.finds; return { region: window.__game.world.region, crates: f.crates.length, ramps: f.ramps.length, barn: f.barn.car, shown: window.__game.crates.filter(Boolean).length, barnCar: window.__game.barnCar }; });
  check('placed', info.crates === 12 && info.ramps === 3 && info.shown === 12 && info.barnCar, info);
  const wait = (re) => p.evaluate(async (src) => { const re = new RegExp(src), t0 = performance.now(); let seen = ''; while (performance.now() - t0 < 30000 && !re.test(seen)) { await new Promise((r) => setTimeout(r, 100)); seen = document.getElementById('toast').textContent; } return seen; }, re.source);
  // a crate: drive onto it
  const r1 = await p.evaluate(async () => {
    const g = window.__game, c = g.finds.crates[4], cash = g.store.data.cash;
    g.car.place(c.x - 12, c.z, Math.PI / 2); await new Promise((r) => setTimeout(r, 400));
    g.car.place(c.x, c.z, Math.PI / 2); g.findCheck();
    return { paid: g.store.data.cash - cash, k: g.store.data.stats[g.world.region].k, shown: g.crates[4] };
  });
  const t1 = await wait(/Hidden crate/);
  check('crate', r1.paid === 250 && r1.k === 16 && r1.shown === false && /Hidden crate 1 of 12\. \+\$250/.test(t1), { ...r1, t1 });
  // the barn: look at it, then drive up to it
  await p.evaluate(() => { const g = window.__game, b = g.finds.barn; g.car.place(b.x + Math.sin(b.yaw) * 22, b.z + Math.cos(b.yaw) * 22, b.yaw + Math.PI); });
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/finds-${mode}-barn.png` });
  const r2 = await p.evaluate(() => { const g = window.__game, b = g.finds.barn; g.car.place(b.x + Math.sin(b.yaw) * 7, b.z + Math.cos(b.yaw) * 7, b.yaw + Math.PI); g.findCheck(); return { owned: !!g.store.data.cars[b.car], left: g.barnCar }; });
  const t2 = await wait(/Barn find/);
  check('barn', r2.owned && !r2.left && /Barn find! The .+ is yours/.test(t2), { ...r2, t2 });
  // a ramp: line up 40 m back and drive at it flat out
  const r3 = await p.evaluate(async () => {
    const g = window.__game, r = g.finds.ramps[0], cash = g.store.data.cash;
    g.car.place(r.x - r.fx * 45, r.z - r.fz * 45, r.yaw); g.car.vel.set(r.fx * 26, 0, r.fz * 26);
    let air = 0, most = 0; const inp = { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true };
    for (let i = 0; i < 60 * 6; i++) { g.advance(1 / 60, inp); if (g.car.grounded === 0) { air += 1 / 60; most = Math.max(most, air); } else air = 0; }
    return { most: +most.toFixed(2), paid: g.store.data.cash - cash, a: g.store.data.stats[g.world.region].a || 0, up: +g.car.up.y.toFixed(2) };
  });
  const t3 = await p.evaluate(() => document.getElementById('toast').textContent);
  check('ramp', r3.most > 0.9 && r3.paid > 0 && r3.a >= 9 && r3.up > 0.8 && /Air time/.test(t3), { ...r3, t3 });
  // a ramp seen from the side for the picture
  await p.evaluate(() => { const g = window.__game, r = g.finds.ramps[1]; g.car.place(r.x - r.fx * 14 + r.fz * 9, r.z - r.fz * 14 - r.fx * 9, r.yaw + 0.6); });
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/finds-${mode}-ramp.png` });
  // crate up close, for the picture
  await p.evaluate(() => { const g = window.__game, c = g.finds.crates[7]; g.car.place(c.x - 14, c.z - 3, Math.PI / 2 + 0.2); });
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/finds-${mode}-crate.png` });
  // goals page: hints for this region, three new goals per region, and the found car in the garage
  await p.evaluate(() => window.__game.checkGoals()); await p.waitForTimeout(300);
  await p.evaluate(() => window.__game.pause()); await p.waitForTimeout(300);
  await tap('#dlg-goals'); await p.waitForTimeout(400);
  const page = await p.evaluate((r) => ({ rows: document.querySelectorAll('.goals li').length, crates: document.getElementById('goal-' + r + '-crates').textContent, barn: document.getElementById('goal-' + r + '-barn').className, air: document.getElementById('goal-' + r + '-air').textContent, finds: document.getElementById('goal-garage-finds').textContent }), info.region);
  check('goals', page.rows === 54 && /1 \/ 12/.test(page.crates) && /11 left here/.test(page.crates) && page.barn === 'done' && /orange jump ramps/.test(page.air) && /1 \/ 3/.test(page.finds), page);
  await p.screenshot({ path: `${OUT}/finds-${mode}-goals.png` });
  await tap('#dlg-back'); await p.waitForTimeout(200); await p.evaluate(() => window.__game.resume()); await p.waitForTimeout(300);
  await p.evaluate(() => { const g = window.__game; g.openGarage(g.world.places.garages[0]); }); await p.waitForTimeout(600);
  const gar = await p.evaluate((id) => ({ listed: !!document.getElementById('g-car-' + id), note: (document.getElementById('g-hidden') || {}).textContent }), info.barn);
  check('garage', gar.listed && /Two more cars are hidden/.test(gar.note || ''), gar);
  await p.evaluate((id) => document.getElementById('g-car-' + id).scrollIntoView(), info.barn); await tap('#g-car-' + info.barn); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/finds-${mode}-garage.png` });
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `finds page: ${bad} check(s) failed` : 'finds page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
