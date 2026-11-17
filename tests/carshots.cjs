// Pictures of the car models on their own, for judging shapes. usage: node tests/carshots.cjs [ids] [view] [outdir]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ids = (process.argv[2] || 'hatch,coupe,truck,buggy,patrol').split(','), view = process.argv[3] || 'six', OUT = process.argv[4] || path.join(__dirname, 'shots');
(async () => {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [path.join(__dirname, 'viewer', 'entry.js')], bundle: true, format: 'iife', write: false, target: 'es2020' });
  const html = path.join(OUT, 'viewer.html'); fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(html, '<!doctype html><html><body style="margin:0;background:#000"><canvas id="c" width="1500" height="900"></canvas><script>' + r.outputFiles[0].text + '</script></body></html>');
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } }); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + html); await p.waitForFunction('window.ready === true', null, { timeout: 60000 }).catch(() => {});
  for (const spec of ids) {
    const [id, extra] = spec.split(':'), opt = extra ? JSON.parse(Buffer.from(extra, 'base64').toString()) : {};
    const info = await p.evaluate(([id, opt, view]) => { const i = window.show(id, opt); i.tris = window.draw(view); return i; }, [id, opt, view]).catch((e) => ({ error: String(e) }));
    await p.waitForTimeout(300);
    await p.locator('#c').screenshot({ path: `${OUT}/car-${id}-${view}.png` });
    console.log(id, JSON.stringify(info));
  }
  console.log('errors', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
