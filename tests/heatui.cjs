// Tougher smuggling in the page: a spotted Hot load brings a roadblock (shown as cars, on the map and in a message) and
// backup; getting past the block counts for its goal; delivering clears the extra cars away.
// usage: node tests/heatui.cjs [port|desk] [outdir]
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
  await p.evaluate(() => { window.__toasts = []; new MutationObserver(() => window.__toasts.push(document.getElementById('toast').textContent)).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true }); });
  const r1 = await p.evaluate(async () => {
    const g = window.__game, G = g.game, ring = g.world.roads[0], f = g.world.frame(ring, 200);
    g.store.data.runs = 3; g.car.place(f.x, f.z, f.yaw); g.car.vel.set(f.tx * 20, 0, f.tz * 20);
    G.startJob(g.world.places.sites[0], 'hot'); G.job.left = 999;
    G.patrols[0].car.place(g.car.pos.x + 30, g.car.pos.z, 0);
    const t0 = performance.now(); let seen = '';
    while (performance.now() - t0 < 20000 && !/Roadblock/.test(seen)) { await new Promise((r) => setTimeout(r, 100)); seen = window.__toasts.find((t) => /Roadblock/.test(t)) || ''; G.job && (G.job.left = 999); }
    return { toast: seen, extras: G.extras.map((p) => p.temp), shown: g.vis && document.querySelectorAll('canvas').length };
  });
  check('roadblock', /Roadblock ahead on the .+! Find the gap or go round/.test(r1.toast) && r1.extras.filter((t) => t === 'block').length === 2 && r1.extras.includes('backup'), r1);
  // look at the block from up the road
  await p.evaluate(() => { const g = window.__game, G = g.game, ring = g.world.roads[0], i = G.blockAt.idx, back = (i - 18 * Math.sign(1) + ring.n) % ring.n, f = g.world.frame(ring, back), q = g.world.frame(ring, i);
    const dir = (q.x - f.x) * f.tx + (q.z - f.z) * f.tz > 0 ? 0 : Math.PI; g.car.place(f.x, f.z, f.yaw + dir); g.car.vel.set(0, 0, 0); G.bust = 0; });
  await p.waitForTimeout(1800); await p.screenshot({ path: `${OUT}/heat-${mode}-block.png` });
  // drive past: from just before the block to well beyond it
  const r2 = await p.evaluate(async () => {
    const g = window.__game, G = g.game, ring = g.world.roads[0], B = G.blockAt, f = g.world.frame(ring, B.idx);
    g.car.place(B.x - f.tx * 25, B.z - f.tz * 25, f.yaw); G.update(1 / 60);
    g.car.place(B.x + f.tx * 90, B.z + f.tz * 90, f.yaw); g.car.vel.set(f.tx * 20, 0, f.tz * 20); G.update(1 / 60);
    const t0 = performance.now(); let seen = '';
    while (performance.now() - t0 < 20000 && !/Through the roadblock/.test(seen)) { await new Promise((r) => setTimeout(r, 100)); seen = window.__toasts.find((t) => /Through the roadblock/.test(t)) || ''; G.bust = 0; G.job && (G.job.left = 999); }
    return { toast: seen, b: (g.store.data.stats[g.world.region] || {}).b, modes: G.extras.map((p) => p.mode) };
  });
  check('passed', /Through the roadblock/.test(r2.toast) && r2.b === 1 && r2.modes.every((m) => m === 'chase'), r2);
  const r3 = await p.evaluate(() => { const g = window.__game, G = g.game; G.endJob(true); return { extras: G.extras.length, patrols: G.patrols.length }; });
  await p.waitForTimeout(600);
  const vis = await p.evaluate(() => window.__game.game.patrols.length);
  check('cleared', r3.extras === 0 && r3.patrols === 3 && vis === 3, r3);
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `heat page: ${bad} check(s) failed` : 'heat page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
