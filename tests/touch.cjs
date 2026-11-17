// Simulated fingers on the phone layout: several at once, sliding between controls, near misses, and the on-screen buttons.
// usage: node tests/touch.cjs [port|land]
const { chromium, devices } = require('playwright');
const path = require('path');
const assert = require('assert');
const mode = process.argv[2] || 'port';
(async () => {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const b = await chromium.launch({ args });
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, ...(mode === 'land' ? { viewport: { width: 844, height: 390 } } : {}) });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 120000 });
  await p.tap('#go');
  await p.evaluate(() => {
    const g = window.__game; g.advance(1);
    window.__ev = { cancel: 0, fired: [] };
    for (const t of ['pointercancel', 'touchcancel']) addEventListener(t, () => window.__ev.cancel++, true);
  });
  const cdp = await ctx.newCDPSession(p);
  let pts = [];
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y), id: q.id, radiusX: 14, radiusY: 14, force: 1 })) });
  const down = async (id, x, y) => { pts.push({ id, x, y }); await send('touchStart'); };
  const move = async (id, x, y) => { const q = pts.find((v) => v.id === id); q.x = x; q.y = y; await send('touchMove'); };
  const slide = async (id, x, y, steps = 6) => { const q = pts.find((v) => v.id === id), x0 = q.x, y0 = q.y; for (let i = 1; i <= steps; i++) await move(id, x0 + (x - x0) * i / steps, y0 + (y - y0) * i / steps); };
  const up = async (id) => { const q = pts.find((v) => v.id === id); pts = pts.filter((v) => v.id !== id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: Math.round(q.x), y: Math.round(q.y), id }] }); };   // naming a point in touchEnd lifts just that finger
  const st = () => p.evaluate(() => { const s = window.__game.input.poll(); return { steer: s.steer, thr: s.throttle, brk: s.brake, hb: s.handbrake, on: [...document.querySelectorAll('.tb.on')].map((e) => e.id).sort().join(',') }; });
  const R = await p.evaluate(() => Object.fromEntries(['tl', 'tr', 'tg', 'tbk', 'th', 'trs', 'tf', 'tc', 'menubtn'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, { l: r.left, r: r.right, t: r.top, b: r.bottom, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }]; })));
  const vp = p.viewportSize();
  let n = 0;
  const check = async (name, want) => { const got = await st(); try { assert.deepStrictEqual(got, { steer: 0, thr: 0, brk: 0, hb: false, on: '', ...want }); n++; } catch (e) { console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); process.exitCode = 1; } };

  // two thumbs, then three fingers
  await down(1, R.tg.x, R.tg.y);                       await check('gas', { thr: 1, on: 'tg' });
  await down(2, R.tl.x, R.tl.y);                       await check('gas + left', { thr: 1, steer: 1, on: 'tg,tl' });
  for (let i = 0; i < 8; i++) { await move(1, R.tg.x + (i % 2 ? 13 : -13), R.tg.y + (i % 3) * 6); await move(2, R.tl.x + (i % 2 ? -12 : 12), R.tl.y - (i % 3) * 7); }
  await check('rocking thumbs keep both', { thr: 1, steer: 1, on: 'tg,tl' });
  await slide(2, R.tr.x, R.tr.y);                      await check('slide left to right', { thr: 1, steer: -1, on: 'tg,tr' });
  await down(3, R.th.x, R.th.y);                       await check('three fingers', { thr: 1, steer: -1, hb: true, on: 'tg,th,tr' });
  await up(2);                                         await check('steer finger lifted', { thr: 1, hb: true, on: 'tg,th' });
  await up(3);                                         await check('handbrake finger lifted', { thr: 1, on: 'tg' });
  await slide(1, R.tbk.x, R.tbk.y);                    await check('slide gas to brake', { brk: 1, on: 'tbk' });
  await up(1);                                         await check('all lifted', {});

  // near misses: beyond the edge of the screen-side controls, the corner outside the round button, the gap between two
  await down(1, 2, R.tl.y);                            await check('left of the left button', { steer: 1, on: 'tl' });
  await up(1);
  await down(1, R.tg.x, Math.min(vp.height - 2, R.tg.b + 16)); await check('below the gas button', { thr: 1, on: 'tg' });
  await up(1);
  await down(1, R.tr.r - 2, R.tr.t + 2);               await check('corner of the right button', { steer: -1, on: 'tr' });
  await up(1);
  await down(1, R.tr.l - 3, R.tr.y);                   await check('gap, nearer right', { steer: -1, on: 'tr' });
  await move(1, R.tl.r + 3, R.tl.y);                   await check('gap, nearer left', { steer: 1, on: 'tl' });
  await up(1);
  await down(1, R.tl.x, R.tl.t - 5);                   await check('just above the left button (not the road button)', { steer: 1, on: 'tl' });
  await up(1);
  await down(1, vp.width / 2, vp.height * 0.45);       await check('middle of the picture does nothing', {});
  await down(2, R.tg.x, R.tg.y);                       await check('gas with a finger resting on the picture', { thr: 1, on: 'tg' });
  await up(1); await up(2);                            await check('all lifted again', {});

  // buttons that act once: fire when a finger lands, not when one slides across
  await p.evaluate(() => { const g = window.__game; for (const k of ['camera', 'reset', 'flip']) g.input.on(k, () => window.__ev.fired.push(k)); });
  await down(1, R.tc.x, R.tc.y); await up(1);
  await down(1, R.tl.x, R.tl.y); await slide(1, R.trs.x, R.trs.y); await check('slid onto the road button', {});
  await up(1);
  await down(1, R.tg.x, R.tg.y); await down(2, R.tf.x, R.tf.y); await check('flip while on the gas', { thr: 1, on: 'tf,tg' }); await up(2); await up(1);
  const fired = await p.evaluate(() => window.__ev.fired.join(','));
  assert.strictEqual(fired, 'camera,flip'); n++;

  // the menu button and the prompt are ordinary buttons and still work by tapping, even with a thumb on the gas
  await down(1, R.tg.x, R.tg.y);
  await down(2, R.menubtn.x, R.menubtn.y); await up(2);
  await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => window.__game.paused), true, 'menu button opens the menu'); n++;
  await check('menu open: controls off', {});
  await p.tap('#dlg-go');
  assert.strictEqual(await p.evaluate(() => window.__game.paused), false, 'back to driving'); n++;
  await check('finger held through the menu is ignored until it is pressed again', {});
  await up(1);
  await down(1, R.tg.x, R.tg.y); await check('gas after the menu', { thr: 1, on: 'tg' }); await up(1);
  // a finger resting on the brake must not stop another finger from pressing the prompt or a dialog button
  const mid = (sel) => p.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }, sel);
  // Open and leave the garage once: that puts the car down in the garage light with stop-to-enter switched off, so from here
  // only a press on the prompt can open it.
  await p.evaluate(() => { const g = window.__game; g.openGarage(g.zones[0].g); });
  await p.tap('#g-leave');
  await p.evaluate(() => { window.__ev.prompt = 0; document.getElementById('prompt').addEventListener('click', () => window.__ev.prompt++); });
  await down(1, R.tbk.x, R.tbk.y); await check('brake held', { brk: 1, on: 'tbk' });
  // Roll along the light and stop on the brake, as a player does with a thumb held on it. A stop made on the brake holds the
  // car for a moment before reverse comes in, which leaves the prompt up long enough to press.
  const park = () => p.evaluate(() => {
    const g = window.__game, z = g.zones[0], go = { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true };
    g.car.place(z.x, z.z, z.g.yaw); g.advance(0.6, go); const top = g.car.speed; g.advance(0.3, { ...go, throttle: 0, brake: 1 });
    return { shown: !document.getElementById('prompt').hidden, top, gear: g.car.gear, mode: g.mode };
  });
  let at = await park();
  assert.ok(at.top > 1.5 && at.gear > 0 && at.mode === 'roam', 'stopped on the brake in the light: ' + JSON.stringify(at));
  assert.strictEqual(at.shown, true, 'prompt shows when stopped in the garage light'); n++;
  let m = await mid('#prompt'); await down(2, m.x, m.y); await up(2);
  assert.strictEqual(await p.evaluate(() => window.__game.mode), 'garage', 'prompt opens the garage with the brake held'); n++;
  assert.strictEqual(await p.evaluate(() => window.__ev.prompt), 1, 'and it was the press on the prompt that opened it'); n++;
  m = await mid('#g-tab-up'); await down(2, m.x, m.y); await up(2);
  assert.strictEqual(await p.evaluate(() => document.getElementById('g-tab-up').getAttribute('aria-selected')), 'true', 'garage tab changes with a finger resting'); n++;
  m = await mid('#g-leave'); await down(2, m.x, m.y); await up(2);
  assert.strictEqual(await p.evaluate(() => window.__game.mode), 'roam', 'leave the garage with a finger resting'); n++;
  await up(1);
  await p.evaluate(() => { const g = window.__game; g.openOffer(g.races[0]); });
  await down(1, R.tbk.x, R.tbk.y);
  m = await mid('#dlg-no'); await down(2, m.x, m.y); await up(2);
  assert.strictEqual(await p.evaluate(() => window.__game.mode), 'roam', 'dialog button works with a finger resting'); n++;
  await up(1);
  // one tap is one click: a toggle flips once
  await p.tap('#menubtn'); await p.waitForTimeout(200);
  const before = await p.evaluate(() => document.getElementById('dlg-units').textContent);
  await p.tap('#dlg-units'); await p.waitForTimeout(700);
  const after = await p.evaluate(() => document.getElementById('dlg-units').textContent);
  assert.notStrictEqual(before, after, 'units toggle flipped once'); n++;
  await p.tap('#dlg-units'); await p.waitForTimeout(700);
  assert.strictEqual(await p.evaluate(() => document.getElementById('dlg-units').textContent), before, 'and back'); n++;
  await p.tap('#dlg-go');
  at = await park();                 // still in the light, and stopping alone still does not open it: the car never left
  assert.strictEqual(at.shown, true, 'prompt is back after the menu'); n++;
  await p.tap('#prompt');
  assert.strictEqual(await p.evaluate(() => window.__game.mode), 'garage', 'prompt opens the garage'); n++;
  await down(1, R.tg.x, R.tg.t - 60); await check('garage open: controls off', {}); await up(1);   // above the gas spot: on a phone the Drive away button lies in the gas thumb's reach
  await p.tap('#g-leave');
  assert.strictEqual(await p.evaluate(() => window.__game.mode), 'roam'); n++;

  const cancels = await p.evaluate(() => window.__ev.cancel);
  console.log(mode, 'touch checks passed:', n, '| cancelled touches seen:', cancels, '| errors', JSON.stringify(errs), process.exitCode ? 'WITH FAILURES' : '');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
