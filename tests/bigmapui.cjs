// Big map: tapping the corner map opens it and holds the game, a tap near a garage marks that garage, a tap on open
// ground drops a plain pin, the direction card then points to the marker, and driving up to it clears it.
// usage: node tests/bigmapui.cjs [port|desk|land] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'port', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : mode === 'land' ? await b.newContext({ ...devices['iPhone 13 landscape'], deviceScaleFactor: 1 }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const tap = (sel) => (mode === 'desk' ? p.click(sel) : p.tap(sel));
  const tapAt = (x, y) => (mode === 'desk' ? p.mouse.click(x, y) : p.touchscreen.tap(x, y));
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await tap('#go'); await p.evaluate(() => window.__game.pinQuality(2));
  await p.evaluate(() => window.__game.advance(1)); await p.waitForTimeout(500);
  if (mode === 'desk') await p.keyboard.press('KeyG'); else await tap('#mapbox');
  await p.waitForTimeout(700);
  const s1 = await p.evaluate(() => { const g = window.__game; return { on: g.bigmap.on, paused: g.paused, shown: !document.getElementById('bigmap').hidden, note: document.getElementById('bm-note').textContent, clear: document.getElementById('bm-clear').disabled }; });
  check('open', s1.on && s1.paused && s1.shown && /Tap a place/.test(s1.note) && s1.clear, s1);
  await p.screenshot({ path: path.join(OUT, `bigmap-${mode}.png`) });
  // a tap a few metres off the first garage marks the garage
  const toPx = (x, z) => p.evaluate(([x, z]) => { const c = document.getElementById('bm-c').getBoundingClientRect(), v = window.__game.mapView; return { x: c.left + (v.cx + v.span / 2 - x) / v.span * c.width, y: c.top + (v.cz + v.span / 2 - z) / v.span * c.height }; }, [x, z]);
  const gar = await p.evaluate(() => { const z = window.__game.zones.find((q) => q.kind === 'garage'); return { x: z.x, z: z.z, name: z.g.name }; });
  let px = await toPx(gar.x + 12, gar.z - 10); await tapAt(px.x + 3, px.y - 2); await p.waitForTimeout(400);
  const s2 = await p.evaluate(() => ({ nav: window.__game.nav, note: document.getElementById('bm-note').textContent, clear: document.getElementById('bm-clear').disabled }));
  check('garage', s2.nav && s2.nav.name === gar.name && s2.nav.kind === 'garage' && s2.note.startsWith('Marker: ' + gar.name) && !s2.clear, s2);
  await p.screenshot({ path: path.join(OUT, `bigmap-${mode}-marked.png`) });
  // open ground far from any place: a plain pin
  const open = await p.evaluate(() => { const g = window.__game, v = g.mapView; for (let i = 0; i < 400; i++) { const x = v.cx + (Math.random() - 0.5) * v.span * 0.8, z = v.cz + (Math.random() - 0.5) * v.span * 0.8; if (g.navPts.every((q) => Math.hypot(q.x - x, q.z - z) > 260)) return { x, z }; } return null; });
  px = await toPx(open.x, open.z); await tapAt(px.x, px.y); await p.waitForTimeout(400);
  const s3 = await p.evaluate(() => window.__game.nav);
  check('pin', s3 && s3.kind === 'pin' && Math.hypot(s3.x - open.x, s3.z - open.z) < 40, { s3, open });
  await tap('#bm-done'); await p.waitForTimeout(600);
  const s4 = await p.evaluate(() => { const g = window.__game; g.advance(0.05); return { on: g.bigmap.on, paused: g.paused, label: document.getElementById('joblabel').textContent, name: document.getElementById('jobname').textContent, hud: getComputedStyle(document.querySelector('.hud')).visibility }; });
  check('card', !s4.on && !s4.paused && s4.label === 'Your marker' && s4.name === 'Your marker' && s4.hud === 'visible', s4);
  // drive up to it (put the car there) and it clears
  const s5 = await p.evaluate(() => { const g = window.__game, n = g.nav; g.car.place(n.x + 5, n.z + 5, 0, 0.5); g.advance(0.5); return { nav: g.nav, toast: document.getElementById('toast').textContent }; });
  check('arrive', !s5.nav && /reached your marker|Entering/.test(s5.toast), s5);   // a town banner can take the toast
  await p.waitForTimeout(300);
  // menu button route and clear button
  await tap('#menubtn'); await p.waitForTimeout(400); await tap('#dlg-map'); await p.waitForTimeout(600);
  const g2 = await p.evaluate(() => { const g = window.__game; g.setNav({ x: 0, z: 0, name: 'Test', kind: 'pin' }); return g.bigmap.on; });
  await tap('#bm-clear'); await p.waitForTimeout(300);
  const s6 = await p.evaluate(() => ({ on: window.__game.bigmap.on, nav: window.__game.nav }));
  check('clear', g2 && s6.on && !s6.nav, s6);
  if (mode === 'desk') await p.keyboard.press('Escape'); else await tap('#bm-done');
  await p.waitForTimeout(500);
  const s7 = await p.evaluate(() => ({ on: window.__game.bigmap.on, paused: window.__game.paused, mode: window.__game.mode }));
  check('close', !s7.on && !s7.paused && s7.mode === 'roam', s7);
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `big map: ${bad} check(s) failed` : 'big map: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
