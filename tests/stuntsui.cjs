// Speed traps and drifts in the page: passing a trap fast pays once for a new best, a slower pass only shows the
// speed, a handbrake slide builds a drift chain on the dash and pays when it ends. Also a picture of a trap camera.
// usage: node tests/stuntsui.cjs [port|desk] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'desk', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await (mode === 'desk' ? p.click('#go') : p.tap('#go')); await p.evaluate(() => window.__game.pinQuality(1));
  await p.evaluate(() => { window.__toasts = []; new MutationObserver((recs) => recs.forEach((r) => r.addedNodes.forEach((n) => window.__toasts.push(n.textContent)))).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true }); });
  // run at a trap: put the car 30 m before it, moving along the road
  const pass = (v) => p.evaluate((v) => { const g = window.__game, t = g.traps[0], yaw = Math.atan2(t.fx, t.fz);
    g.car.place(t.x - t.fx * 30, t.z - t.fz * 30, yaw, 0.3); g.stunts(1 / 60);
    g.car.vel.set(t.fx * v, 0, t.fz * v); const cash0 = g.store.state ? 0 : 0; window.__toasts = [];
    const before = JSON.parse(JSON.stringify(g.store.save ? {} : {}));
    g.advance(2.6, { steer: 0, throttle: v < 20 ? 0 : 1, brake: 0, handbrake: false, analog: true });
    return { d: Math.hypot(g.car.pos.x - t.x, g.car.pos.z - t.z) };
  }, v).then(async (r) => ({ ...r, toasts: await p.evaluate(() => window.__toasts.slice()) }));
  const cash = () => p.evaluate(() => document.getElementById('cash').textContent);
  await p.evaluate(() => window.__game.advance(0.2));
  const c0 = await p.evaluate(() => window.__game.store.get ? 0 : 0);
  const r1 = await pass(45);
  check('fast', r1.toasts.some((t) => /Speed trap: \d+ (mph|km\/h)\. New best! \+\$/.test(t)), r1);
  const best1 = await p.evaluate(() => (window.__game.cash, null));
  const r2 = await pass(26);
  check('slower', r2.toasts.some((t) => /Speed trap: \d+ mph\. Best \d+ mph/.test(t)) && !r2.toasts.some((t) => /New best/.test(t)), r2);
  const r3 = await pass(15);
  check('slow', r3.toasts.some((t) => /Go faster/.test(t)), r3);
  // picture of the camera
  await p.evaluate(() => { const g = window.__game, t = g.traps[0], yaw = Math.atan2(t.fx, t.fz); g.car.place(t.x - t.fx * 16, t.z - t.fz * 16, yaw, 0.3); g.advance(0.3); });
  await p.waitForTimeout(1500); await p.screenshot({ path: path.join(OUT, `trap-${mode}.png`) });
  // drift: a hard handbrake turn from speed on the road, then straighten
  const dr = await p.evaluate(() => { const g = window.__game, t = g.traps[1], yaw = Math.atan2(t.fx, t.fz); window.__toasts = [];
    g.car.place(t.x - t.fx * 60, t.z - t.fz * 60, yaw, 0.3); g.advance(0.2); g.car.vel.set(t.fx * 24, 0, t.fz * 24);
    let seen = 0, mult = 1, onFor = 0;
    for (let k = 0; k < 240; k++) { const inp = k < 30 ? { steer: 1, throttle: 0.6, brake: 0, handbrake: true, analog: true } : { steer: -0.4, throttle: 0.9, brake: 0, handbrake: false, analog: true };
      g.advance(1 / 60, inp); if (g.drift.on) { onFor++; seen = Math.max(seen, g.drift.shown); mult = Math.max(mult, g.drift.mult); } }
    g.advance(2, { steer: 0, throttle: 0, brake: 1, handbrake: false, analog: true });
    return { seen, mult, onFor };
  });
  dr.toasts = await p.evaluate(() => window.__toasts.slice());
  check('slide', dr.onFor > 10 && dr.seen > 30, dr);
  const pay = await p.evaluate(() => { const g = window.__game, t = g.traps[1], yaw = Math.atan2(t.fx, t.fz); window.__toasts = [];
    g.car.place(t.x - t.fx * 60, t.z - t.fz * 60, yaw, 0.3); g.advance(0.3); g.drift.on = true; g.drift.score = 500; g.drift.t = 2; g.drift.mult = 2; g.drift.idle = 0;
    g.advance(1.5, { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true }); return g.drift.on; });
  const payT = await p.evaluate(() => window.__toasts.slice());
  check('drift', !pay && payT.some((t) => /^Drift 1,000\. \+\$250/.test(t)), payT);
  // a meter that is on shows on the dash
  const dash = await p.evaluate(() => { const g = window.__game; g.drift.on = true; g.drift.score = 420; g.drift.mult = 2; g.drift.idle = -1e4; return null; });
  await p.waitForFunction(() => !document.getElementById('drift').hidden, null, { timeout: 8000 }).catch(() => {});
  const dv = await p.evaluate(() => { const d = document.getElementById('drift'); return { hidden: d.hidden, text: d.textContent }; });
  check('dash', !dv.hidden && /Drift 840 ×2/.test(dv.text), dv);
  await p.evaluate(() => window.__game.drift.reset());
  // goals list has the two new goals with hints
  const gl = await p.evaluate(() => { const g = window.__game; g.pause(); document.getElementById('dlg-goals').click(); const t = document.getElementById('dialog').textContent; return { drift: /Score 2,000 in one drift/.test(t), traps: /Pass all 3 speed traps/.test(t), hint: /yellow dots on the map\. Best here: \d+ mph/.test(t) }; });
  check('goals', gl.drift && gl.traps && gl.hint, gl);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `stunts page: ${bad} check(s) failed` : 'stunts page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
