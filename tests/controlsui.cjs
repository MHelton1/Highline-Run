// Controls screen in the page: change a key (and take it off another action), cancel with Escape, the new key works while
// driving and in the hints, a Switch controller is named with Switch buttons, a controller button can be changed by
// pressing it, button names follow the style picked, A on a Switch controller picks in menus, and it all survives a reload.
// A fake controller stands in for a real one. usage: node tests/controlsui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    window.__pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', connected: true, index: 0, mapping: 'standard', timestamp: 0,
      buttons: Array.from({ length: 18 }, () => ({ value: 0, pressed: false, touched: false })), axes: [0, 0, 0, 0] };
    window.__padOn = false;
    Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => (window.__padOn ? [window.__pad] : [null]) });
  });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  const txt = (id) => p.evaluate((id) => { const e = document.getElementById(id); return e ? e.textContent : null; }, id);
  const press = async (n, on) => p.evaluate(([n, on]) => { const x = window.__pad.buttons[n]; x.value = on ? 1 : 0; x.pressed = !!on; }, [n, on]);
  const url = 'file://' + path.join(__dirname, '..', 'dist', 'local.html');
  await p.goto(url);
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await p.click('#go'); await p.evaluate(() => window.__game.pinQuality(2));
  await p.click('#menubtn'); await p.waitForTimeout(300);
  await p.click('#dlg-controls'); await p.waitForTimeout(300);
  const c1 = await p.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, rows: document.querySelectorAll('#ctl-list .bname').length, flip: document.getElementById('ctl-flip-0').textContent, gas: document.getElementById('ctl-gas-1').textContent }));
  check('card', c1.title === 'Controls' && c1.rows === 17 && c1.flip === 'F' && c1.gas === '↑', c1);
  // a new key for flip
  await p.click('#ctl-flip-0'); await p.waitForTimeout(150);
  const wait = await txt('ctl-flip-0');
  await p.keyboard.press('j'); await p.waitForTimeout(250);
  check('set key', wait === 'Press a key' && (await txt('ctl-flip-0')) === 'J' && /Flip upright: J/.test(await txt('ctl-msg')), { wait, now: await txt('ctl-flip-0'), msg: await txt('ctl-msg') });
  // a key already in use moves over
  await p.click('#ctl-camera-0'); await p.keyboard.press('r'); await p.waitForTimeout(250);
  check('take', (await txt('ctl-camera-0')) === 'R' && (await txt('ctl-reset-0')) === '—' && /taken off Back to the road/.test(await txt('ctl-msg')), { cam: await txt('ctl-camera-0'), reset: await txt('ctl-reset-0'), msg: await txt('ctl-msg') });
  // Escape cancels without closing the menu
  await p.click('#ctl-map-0'); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  check('cancel', (await txt('ctl-map-0')) === 'G' && (await p.evaluate(() => window.__game.ui.kind)) === 'controls', await txt('ctl-msg'));
  await p.screenshot({ path: path.join(OUT, 'controls-keys.png') });
  // the new key works while driving, and the hint card says so
  await p.click('#ctl-back'); await p.waitForTimeout(200); await p.click('#dlg-go'); await p.waitForTimeout(300);
  await p.keyboard.press('j'); await p.waitForTimeout(300);
  const drive = { toast: await txt('toast'), hint: await txt('hint'), saved: await p.evaluate(() => window.__game.store.data.binds && window.__game.store.data.binds.keys.flip) };
  check('drive', /Flipped upright/.test(drive.toast) && /^R back to road.*J flip upright/.test(drive.hint.replace(/\s+/g, ' ')) === false && /J flip upright/.test(drive.hint) && drive.saved.join() === 'KeyJ', drive);
  // a Switch controller arrives
  await p.evaluate(() => { window.__padOn = true; dispatchEvent(new Event('gamepadconnected')); });
  await p.click('#menubtn'); await p.waitForTimeout(300); await p.click('#dlg-controls'); await p.waitForTimeout(200); await p.click('#ctl-tab-pad'); await p.waitForTimeout(300);
  const c2 = { note: await txt('ctl-note'), hand: await txt('ctl-hand-0'), gas: await txt('ctl-gas-0'), reset: await txt('ctl-reset-0') };
  check('switch', /Found: Pro Controller \(Switch buttons\)/.test(c2.note) && /A picks and B goes back/.test(c2.note) && c2.hand === 'B' && c2.gas === 'ZR' && c2.reset === 'X', c2);
  await p.screenshot({ path: path.join(OUT, 'controls-pad.png') });
  // bind nitro by pressing the top button (X on a Switch controller)
  await p.click('#ctl-nitro-0'); await p.waitForTimeout(400);
  await press(3, true);
  await p.waitForFunction(() => document.getElementById('ctl-nitro-0').textContent === 'X', null, { timeout: 20000 }).catch(() => {});
  await press(3, false); await p.waitForTimeout(400);
  const c3 = { nitro: await txt('ctl-nitro-0'), reset: await txt('ctl-reset-0'), msg: await txt('ctl-msg'), kind: await p.evaluate(() => window.__game.ui.kind) };
  check('set btn', c3.nitro === 'X' && c3.reset === '—' && /taken off Back to the road/.test(c3.msg) && c3.kind === 'controls', c3);
  await p.click('#ctl-style-xbox'); await p.waitForTimeout(250);
  const c4 = { gas: await txt('ctl-gas-0'), nitro: await txt('ctl-nitro-0') };
  check('xbox', c4.gas === 'RT' && c4.nitro === 'Y', c4);
  await p.click('#ctl-style-auto'); await p.waitForTimeout(250);
  // A (the right button on a Switch controller) picks in the menu: back to the menu, then "Back to driving"
  await p.click('#ctl-back'); await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById('dlg-go').focus());
  await press(1, true); await p.waitForFunction(() => !window.__game.ui.kind, null, { timeout: 20000 }).catch(() => {}); await press(1, false);
  check('A picks', (await p.evaluate(() => window.__game.ui.kind)) === null, await p.evaluate(() => window.__game.ui.kind));
  await p.waitForTimeout(300);
  await press(7, true); await press(3, true);
  const pad = await p.evaluate(() => { const s = window.__game.input.poll(); return { thr: s.throttle, nitro: s.nitro }; });
  await press(7, false); await press(3, false);
  check('pad drive', pad.thr === 1 && pad.nitro === true, pad);
  const prompt = await p.evaluate(() => { const g = window.__game, z = g.zones[0]; g.car.place(z.x, z.z, 0, 0.3); g.advance(1.2); return null; });
  await p.waitForTimeout(800);
  check('prompt', /D-pad ↑/.test(await txt('pkey')), await txt('pkey'));
  // saved: still there after a reload
  await p.evaluate(() => { window.__game.store.commit(); });
  await p.waitForTimeout(500);
  await p.reload(); await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  const after = await p.evaluate(() => ({ flip: window.__game.input.binds.keys.flip, nitro: window.__game.input.binds.pad.nitro, camera: window.__game.input.binds.keys.camera }));
  check('reload', after.flip.join() === 'KeyJ' && after.nitro[0] === 3 && after.camera[0] === 'KeyR', after);
  // reset to standard
  await p.click('#go'); await p.click('#menubtn'); await p.waitForTimeout(300); await p.click('#dlg-controls'); await p.waitForTimeout(200);
  await p.click('#ctl-tab-keys'); await p.click('#ctl-reset'); await p.waitForTimeout(200);
  check('reset', (await txt('ctl-flip-0')) === 'F' && (await txt('ctl-reset-0')) === 'R', { flip: await txt('ctl-flip-0') });
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `controls: ${bad} check(s) failed` : 'controls: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
