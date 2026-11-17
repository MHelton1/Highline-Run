// Weather in the page: the menu's Weather button steps Changing, Clear, Stormy; a storm brings the region's weather with
// less grip, closer fog, falling particles and patrols that see less; Changing turns the weather by itself with a
// message; the choice is saved. usage: node tests/weatherui.cjs [port|desk] [outdir]
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
  const st = () => p.evaluate(() => { const g = window.__game, W = g.weather; return { setting: g.store.data.weather, now: W.now, t: +W.t.toFixed(2), grip: g.world.weatherGrip ? g.world.weatherGrip.map((v) => +v.toFixed(2)) : null, fog: g.fog.map(Math.round), sight: +(g.game.sight ?? 1).toFixed(2), label: (document.getElementById('dlg-weather') || {}).textContent, region: g.world.region }; });
  const s0 = await st();
  check('start', s0.setting === 'auto' && s0.now === 'clear' && s0.grip === null && s0.fog.join() === '260,3000', s0);
  const press = async () => { await p.evaluate(() => window.__game.pause()); await p.waitForTimeout(250); await tap('#dlg-weather'); await p.waitForTimeout(250); const l = (await st()).label; await p.evaluate(() => window.__game.resume()); return l; };
  const l1 = await press(), l2 = await press();
  // the storm blends in over twenty seconds of game time: hurry it along
  await p.evaluate(() => { const W = window.__game.weather; W.t = 0.97; }); await p.waitForTimeout(2500);
  const s2 = await st(), storm = { mountain: 'snow', desert: 'dust', coast: 'rain' }[s2.region];
  check('storm', l1 === 'Weather: Clear' && l2 === 'Weather: Stormy' && s2.now === storm && s2.t === 1 && s2.grip && s2.grip[0] < 1 && s2.fog[1] < 1000 && s2.sight < 1, { l1, l2, s2 });
  await p.screenshot({ path: `${OUT}/weather-${mode}-storm.png` });
  // back to Changing: the clock runs out and the weather turns by itself, with a message
  const l3 = await press();
  const turned = await p.evaluate(async () => {
    const g = window.__game, W = g.weather, was = W.now; W.spell = 0.01; const t0 = performance.now(); let msg = '';
    while (performance.now() - t0 < 20000 && W.now === was) await new Promise((r) => setTimeout(r, 100));
    const t1 = performance.now(); while (performance.now() - t1 < 4000 && !msg) { await new Promise((r) => setTimeout(r, 100)); const tx = document.getElementById('toast').textContent; if (tx !== 'Saltcliff Coast' && tx !== 'Highline Mountains' && tx !== 'Redrock Basin') msg = tx; }
    return { was, now: W.now, blending: W.t < 1, msg };
  });
  check('changing', l3 === 'Weather: Changing' && turned.now !== turned.was && turned.blending && turned.msg.length > 5, { l3, turned });
  // Stormy is saved and comes back after a reload, already in place
  await press(); await press();
  await p.evaluate(() => window.__game.store.flush && window.__game.store.flush());
  await p.reload(); await p.waitForSelector('#go:not([hidden])', { timeout: 180000 }); await tap('#go'); await p.waitForTimeout(1200);
  const s4 = await st();
  check('reload', s4.setting === 'storm' && s4.now === storm && s4.t === 1 && s4.grip !== null, s4);
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `weather page: ${bad} check(s) failed` : 'weather page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
