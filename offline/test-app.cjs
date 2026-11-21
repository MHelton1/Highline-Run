// Runs the Windows build's app folder in Electron for Linux (same version) with every web request blocked, and checks the
// game starts, draws, drives and keeps a save after a restart. usage: xvfb-run -a node offline/test-app.cjs
const { _electron } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const exe = path.join(__dirname, '.cache/linux/electron'), app = path.join(__dirname, '../dist/win/Highline Run/resources/app');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-'));
let bad = 0; const check = (n, ok, v) => { if (!ok) bad++; console.log(n.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
async function run(first) {
  const ea = await _electron.launch({ env: { ...process.env, HIGHLINE_WINDOWED: first ? '1' : '' }, executablePath: exe, args: [app, '--no-sandbox', '--user-data-dir=' + data, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const web = [], errs = [];
  await ea.context().route(/^https?:/, (r) => { web.push(r.request().url()); r.abort(); });
  const p = await ea.firstWindow(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.waitForSelector('#go:not([hidden])', { timeout: 240000 });
  const info = await ea.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { title: w.getTitle(), size: w.getSize(), menu: w.isMenuBarVisible() }; });
  const fonts = await p.evaluate(async () => { await document.fonts.load('600 16px "Barlow Condensed"'); await document.fonts.load('400 16px Barlow'); return ['600 16px "Barlow Condensed"', '400 16px Barlow'].map((f) => document.fonts.check(f)); });
  check('window', info.title === 'Highline Run' && !info.menu, info);
  check('title quit', await p.evaluate(() => !document.getElementById('quitbtn').hidden && typeof window.desktop.quit === 'function'), null);
  check('fonts', fonts.every(Boolean), fonts);
  await p.click('#go'); await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const g = window.__game; g.advance(2, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); return { speed: g.car.speed, mode: g.mode }; });
  check('drive', r.speed > 5 && r.mode === 'roam', r);
  if (first) { await p.evaluate(() => { const g = window.__game; g.store.data.cash = 4321; g.store.commit(); }); await p.waitForTimeout(800); }
  else check('saved', (await p.evaluate(() => window.__game.store.data.cash)) === 4321, await p.evaluate(() => window.__game.store.data.cash));
  await p.screenshot({ path: path.join(__dirname, '../tests/shots/offline-app.png') });
  check('offline', web.length === 0, web.slice(0, 5));
  check('errors', errs.length === 0, errs.slice(0, 5));
  if (first) { await ea.close(); return; }
  // started full screen this time; the menu switches it off, and Exit game closes the app
  const fs0 = await ea.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
  await p.click('#menubtn'); await p.waitForTimeout(400);
  const btn0 = await p.evaluate(() => (document.getElementById('dlg-full') || {}).textContent);
  await p.click('#dlg-full'); await p.waitForTimeout(1500);
  const fs1 = await ea.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
  const btn1 = await p.evaluate(() => (document.getElementById('dlg-full') || {}).textContent);
  check('fullscreen', fs0 === true && fs1 === false && btn0 === 'Full screen on' && btn1 === 'Full screen off', { fs0, fs1, btn0, btn1 });
  const closed = new Promise((res) => ea.on('close', () => res(true)));
  await p.click('#dlg-exit').catch(() => {});
  check('exit', await Promise.race([closed, new Promise((res) => setTimeout(() => res(false), 15000))]), null);
}
(async () => { fs.mkdirSync(path.join(__dirname, '../tests/shots'), { recursive: true }); await run(true); await run(false);
  console.log(bad ? `offline app: ${bad} check(s) failed` : 'offline app: all checks passed'); process.exit(bad ? 1 : 0); })();
