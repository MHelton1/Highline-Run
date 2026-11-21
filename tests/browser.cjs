// Drives the built page in headless Chromium: title, garage, race offer, race, results, pause.
// usage: node tests/browser.cjs [desk|port|land] [outdir]
const { chromium, devices } = require('playwright');
const EV = { desert: { ring: 'loop', double: 'loopx' }, coast: { ring: 'coast', double: 'coastx' } }[process.env.REGION] || { ring: 'ring', double: 'double' };   // event ids in the region under test
const path = require('path');
const mode = process.argv[2] || 'desk', OUT = process.argv[3] || path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const b = await chromium.launch({ args });
  const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, ...(mode === 'land' ? { viewport: { width: 844, height: 390 } } : {}) });
  const p = await ctx.newPage(); p.setDefaultTimeout(90000); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 120000 });
  const snap = async (name, wait = 2500) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/${mode}-${name}.png` }); };
  const tap = (sel) => (mode === 'desk' ? p.click(sel) : p.tap(sel));
  const log = (k, v) => console.log(k.padEnd(10), JSON.stringify(v));
  await snap('0title', 1500);
  log('title', await p.evaluate(() => ({ go: document.getElementById('go').textContent, saved: document.getElementById('saved').textContent })));
  await tap('#go');
  log('start', await p.evaluate(() => { const g = window.__game; g.advance(1); return { mode: g.mode, prompt: !document.getElementById('prompt').hidden, ptext: document.getElementById('ptext').textContent, car: g.car.spec.name, up: +g.car.up.y.toFixed(3) }; }));
  await snap('1roam');
  // garage: open with the prompt, add test cash, look at each car, buy the buggy, fit a part, tune
  await tap('#prompt');
  log('garage', await p.evaluate(() => { const g = window.__game; g.store.data.cash += 30000; g.store.commit(); g.ui.refresh(); return { mode: g.mode, kind: g.ui.kind, cash: document.getElementById('g-cash').textContent, stats: document.getElementById('g-stats').textContent, sub: document.getElementById('g-sub').textContent }; }));
  await snap('2garage');
  for (const id of ['buggy', 'truck', 'coupe']) { await tap('#g-car-' + id); log('look ' + id, await p.evaluate(() => { const g = window.__game; g.advance(1); return { shown: g.ui.shown, name: g.car.spec.name, stats: document.getElementById('g-stats').textContent, act: document.getElementById('g-act').textContent, up: +g.car.up.y.toFixed(3), wheels: g.car.wheels.filter(w => w.onGround).length }; })); await snap('3look-' + id, 1800); }
  await tap('#g-act');
  log('bought', await p.evaluate(() => { const g = window.__game, s = g.store.data; return { car: s.car, cars: Object.keys(s.cars), cash: s.cash }; }));
  await tap('#g-tab-up');
  await tap('#g-up-engine'); await tap('#g-up-engine'); await tap('#g-up-tires');
  log('upgrades', await p.evaluate(() => { const g = window.__game, s = g.store.data; return { up: s.cars[s.car].up, cash: s.cash, torque: Math.round(g.car.spec.torque), stats: document.getElementById('g-stats').textContent, btn: document.getElementById('g-up-engine').textContent }; }));
  await snap('4upgrades', 1500);
  await tap('#g-tab-tune');
  log('tune', await p.evaluate(() => { const g = window.__game, i = document.getElementById('g-tune-gear'); i.value = 0.6; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); const r = document.getElementById('g-tune-ride'); r.value = 1; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); g.advance(1.5); const s = g.store.data; return { tune: s.cars[s.car].tune, final: +g.car.spec.final.toFixed(3), out: document.getElementById('g-tune-gear-out').textContent, up: +g.car.up.y.toFixed(3) }; }));
  await snap('5tune', 1500);
  await tap('#g-tab-cars'); await tap('#g-car-hatch');
  await tap('#g-leave');
  log('left', await p.evaluate(() => { const g = window.__game; g.advance(1); return { mode: g.mode, car: g.car.spec.name, saveCar: g.store.data.car, speed: +g.car.speed.toFixed(2), frozen: g.game.frozen, local: JSON.parse(localStorage.getItem('highline.save')).car }; }));
  await snap('6left');
  // drive to the ring race start: stopping in the light opens the offer
  log('offer', await p.evaluate(() => { const g = window.__game, z = g.zones.find(q => q.kind === 'race' && q.def.base === 'ring'); g.car.place(z.x + 20, z.z, 0); g.advance(0.5); g.car.place(z.x + 1, z.z + 1, z.def.path.at(z.def.startIdx).yaw); g.advance(1.5); return { mode: g.mode, kind: g.ui.kind, title: document.getElementById('dlg-title').textContent, text: document.getElementById('dialog').textContent.slice(0, 400) }; }));
  await snap('7offer', 1500);
  // events sharing the light, and difficulty: pick the two-lap race on Hard, check the card, then go back to the Grand Prix on Moderate
  await tap('#dlg-ev-' + EV.double); await tap('#dlg-lv-2');
  log('hard', await p.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, events: [...document.querySelectorAll('[id^=dlg-ev-]')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    levels: [...document.querySelectorAll('[id^=dlg-lv-]')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')), first: document.querySelector('#dialog .rows .pay').textContent, level: window.__game.store.data.level })));
  await snap('7offer-hard', 1500);
  await tap('#dlg-ev-' + EV.ring); await tap('#dlg-lv-1');
  log('moderate', await p.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, first: document.querySelector('#dialog .rows .pay').textContent, level: window.__game.store.data.level })));
  await tap('#dlg-go');
  log('grid', await p.evaluate(() => { const g = window.__game; g.advance(1.0); const r = g.race; return { mode: g.mode, state: r.state, rivals: r.rivals.map(q => q.spec.name), speed: +g.car.speed.toFixed(2), count: document.getElementById('count').textContent }; }));
  await snap('8grid', 1800);
  log('racing', await p.evaluate(() => { const g = window.__game; g.advance(8, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); const r = g.race; return { state: r.state, t: +r.t.toFixed(1), pos: r.pos, gate: r.gate, speed: +g.car.speed.toFixed(1), label: document.getElementById('rlabel').textContent }; }));
  await snap('9race');
  // pause and resume
  await p.keyboard.press('Escape');
  log('paused', await p.evaluate(() => ({ paused: window.__game.paused, title: document.getElementById('dlg-title').textContent, save: document.getElementById('dlg-save').textContent, buttons: [...document.querySelectorAll('#dialog .btn')].map(b => b.textContent) })));
  await snap('10pause', 1200);
  await tap('#dlg-go');
  // jump to the end: put the player just before the last gate and cross it
  log('finish', await p.evaluate(() => { const g = window.__game, r = g.race; r.gate = r.gates.length - 1; const gt = r.gates[r.gate], f = r.def.path.at(gt.idx - 12); g.car.place(f.x, f.z, f.yaw); g.advance(6, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); return { paused: g.paused, state: r.state, mode: g.mode, result: r.result && { pos: r.result.pos, prize: r.result.prize, time: +r.result.time.toFixed(1) }, cash: g.store.data.cash, best: g.store.data.best, rank: g.store.data.rank, speed: +g.car.speed.toFixed(2), gear: g.car.gear, text: document.getElementById('dialog').textContent.slice(0, 300) }; }));
  await snap('11results', 1500);
  await tap('#dlg-go');
  log('after', await p.evaluate(() => { const g = window.__game; g.advance(2); return { mode: g.mode, race: !!g.race, frozen: g.game.frozen, speed: +g.car.speed.toFixed(2), gear: g.car.gear, patrols: g.game.patrols.map(q => Math.round(Math.hypot(q.car.pos.x - g.car.pos.x, q.car.pos.z - g.car.pos.z))) }; }));
  // the time trial start
  log('trial', await p.evaluate(() => { const g = window.__game, d = g.races.find(q => q.base === 'scramble'); g.startRace(d); g.advance(5, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true }); const r = g.race; return { mode: g.mode, state: r.state, t: +r.t.toFixed(1), gates: r.gates.length, label: document.getElementById('rlabel').textContent, pos: document.getElementById('rpos').textContent }; }));
  await snap('12trial');
  log('quit', await p.evaluate(() => { const g = window.__game; g.endRace(); g.advance(0.5); return { mode: g.mode }; }));
  console.log('errors', errs.slice(0, 8));
  await b.close();
})();
