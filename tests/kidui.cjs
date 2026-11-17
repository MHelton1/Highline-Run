// Kid mode in the page: the start screen switch, the car driving itself, the hidden GO and SLIDE buttons, the menu switch
// and the race card. usage: node tests/kidui.cjs [port|land|desk] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'port', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : await b.newContext({ ...devices[mode === 'land' ? 'iPhone 13 landscape' : 'iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const tap = (sel) => (mode === 'desk' ? p.click(sel) : p.tap(sel));
  const log = (k, v) => console.log(k.padEnd(9), JSON.stringify(v));
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 120000 });
  await tap('#kidbtn');
  log('title', await p.evaluate(() => ({ button: document.getElementById('kidbtn').textContent, pressed: document.getElementById('kidbtn').getAttribute('aria-pressed'), saved: window.__game.store.data.kid })));
  await p.screenshot({ path: `${OUT}/kid-${mode}-title.png` });
  await tap('#go');
  log('drive', await p.evaluate(() => {
    const g = window.__game, r = g.world.roads[0], i = g.world.places.lines.ring.idx, none = { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true };
    g.pinQuality(2); g.car.place(r.x[i], r.z[i], Math.atan2(r.x[i + 2] - r.x[i], r.z[i + 2] - r.z[i])); g.advance(0.3, none);
    g.advance(3, none); const going = +g.car.speed.toFixed(1); g.advance(3, { ...none, brake: 1 }); const braked = +g.car.speed.toFixed(1);
    const vis = (id) => { const e = document.getElementById(id); return !!e && e.getBoundingClientRect().width > 0; };
    return { going, braked, gas: vis('tg'), slide: vis('th'), brake: vis('tbk'), kidClass: document.body.classList.contains('kid'), gameKid: g.game.kid };
  }));
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/kid-${mode}-drive.png` });
  await p.evaluate(() => window.__game.pause());
  await p.waitForTimeout(300);
  log('menu', await p.evaluate(() => document.getElementById('dlg-kid').textContent));
  await tap('#dlg-kid'); log('menu-off', await p.evaluate(() => ({ text: document.getElementById('dlg-kid').textContent, kid: window.__game.store.data.kid, gas: document.getElementById('tg').getBoundingClientRect().width > 0 })));
  await tap('#dlg-kid'); await p.screenshot({ path: `${OUT}/kid-${mode}-menu.png` });
  await p.evaluate(() => window.__game.resume());
  log('card', await p.evaluate(() => { const g = window.__game, z = g.zones.find((q) => q.kind === 'race' && q.def.base === 'ring'); g.openOffer(z.def, z.group); return { levels: document.querySelectorAll('[id^=dlg-lv-]').length, note: [...document.querySelectorAll('#dialog .note')].map((e) => e.textContent).find((t) => t.startsWith('Kid')) || null, prize: document.querySelector('#dialog .rows .pay') && document.querySelector('#dialog .rows .pay').textContent }; }));
  await p.screenshot({ path: `${OUT}/kid-${mode}-card.png` });
  log('race', await p.evaluate(() => { const g = window.__game, z = g.zones.find((q) => q.kind === 'race' && q.def.base === 'ring'); g.startRace(z.def); g.advance(9, { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true }); return { level: g.race.level, speed: +g.car.speed.toFixed(1), state: g.race.state }; }));
  log('errors', errs.slice(0, 5));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
