// Photo mode in the page: from the menu the dash goes and the game holds still, dragging moves the camera round the car,
// Take photo shows the picture with a Download link, and Done goes back to driving.
// usage: node tests/photoui.cjs [port|desk] [outdir]
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
  await p.evaluate(() => window.__game.advance(1)); await p.waitForTimeout(500);
  await tap('#menubtn'); await p.waitForTimeout(400); await tap('#dlg-photo'); await p.waitForTimeout(600);
  const s1 = await p.evaluate(() => { const g = window.__game; return { on: g.photo.on, paused: g.paused, hud: getComputedStyle(document.querySelector('.hud')).display, bar: !document.getElementById('photo').hidden, cam: g.camera.position.toArray().map((v) => +v.toFixed(1)), car: g.car.pos.toArray().map((v) => +v.toFixed(2)) }; });
  check('open', s1.on && s1.paused && s1.hud === 'none' && s1.bar, s1);
  // drag across the picture: the camera swings round; the car stays where it is
  const box = await p.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.35 }; });
  if (mode === 'desk') { await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x + 220, box.y + 40, { steps: 8 }); await p.mouse.up(); }
  else { const c = await ctx.newCDPSession(p); await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] }); for (let k = 1; k <= 8; k++) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + k * 28, y: box.y + k * 5 }] }); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  await p.waitForTimeout(600);
  const s2 = await p.evaluate(() => { const g = window.__game; return { cam: g.camera.position.toArray().map((v) => +v.toFixed(1)), car: g.car.pos.toArray().map((v) => +v.toFixed(2)), yaw: +g.photo.yaw.toFixed(2) }; });
  const moved = Math.hypot(s2.cam[0] - s1.cam[0], s2.cam[2] - s1.cam[2]);
  check('orbit', moved > 1.5 && JSON.stringify(s2.car) === JSON.stringify(s1.car), { moved: +moved.toFixed(1), ...s2 });
  await p.screenshot({ path: `${OUT}/photo-${mode}-mode.png` });
  await tap('#ph-snap'); await p.waitForTimeout(800);
  const s3 = await p.evaluate(() => { const img = document.getElementById('shot-img'), a = document.getElementById('shot-dl'); return { shown: !document.getElementById('shot').hidden, src: img.src.slice(0, 23), len: img.src.length, w: img.naturalWidth, dl: a.download, href: a.href.slice(0, 23) }; });
  check('snap', s3.shown && s3.src === 'data:image/jpeg;base64,' && s3.len > 20000 && s3.w > 100 && /^highline-run-\d{8}-\d{6}\.jpg$/.test(s3.dl) && s3.href === s3.src, s3);
  await p.screenshot({ path: `${OUT}/photo-${mode}-shot.png` });
  await tap('#shot-back'); await p.waitForTimeout(300); await tap('#ph-done'); await p.waitForTimeout(500);
  const s4 = await p.evaluate(() => { const g = window.__game; return { on: g.photo.on, paused: g.paused, mode: g.mode, hud: getComputedStyle(document.querySelector('.hud')).display }; });
  check('done', !s4.on && !s4.paused && s4.mode === 'roam' && s4.hud !== 'none', s4);
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `photo page: ${bad} check(s) failed` : 'photo page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
