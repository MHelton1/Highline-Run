// More browser checks: stop-to-enter rules, cargo run, a race with rivals in view, keyboard and controller in menus,
// and progress arriving from the player's account. usage: node tests/browser2.cjs [desk|port] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'desk', OUT = process.argv[3] || path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
const FULL = { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true };
(async () => {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const b = await chromium.launch({ args });
  const newPage = async (init) => {
    const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const p = await ctx.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    if (init) await p.addInitScript(init);
    await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
    await p.waitForSelector('#go:not([hidden])', { timeout: 120000 });
    return p;
  };
  const log = (k, v) => console.log(k.padEnd(11), JSON.stringify(v));
  let p = await newPage();
  const snap = async (name, wait = 2200) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/${mode}-${name}.png` }); };
  const tap = (sel) => (mode === 'desk' ? p.click(sel) : p.tap(sel));
  await snap('20title', 1200);
  await p.keyboard.press('Space');
  // --- stopping rules: no auto-open where you start; drive out and back in, stop, and it opens ---
  log('spawn', await p.evaluate(() => { const g = window.__game; g.advance(2); return { mode: g.mode }; }));
  // --- driving in and stopping with the brake held all the way: the car holds still on the brake, so the garage opens ---
  log('brake-in', await p.evaluate((FULL) => {
    const g = window.__game, z = g.zones[0], yaw = z.g.yaw, STOP = { ...FULL, throttle: 0, brake: 1 }, off = () => Math.hypot(g.car.pos.x - z.x, g.car.pos.z - z.z);
    g.car.place(z.x - Math.sin(yaw) * 12, z.z - Math.cos(yaw) * 12, yaw); g.advance(0.5); const far = g.mode;
    for (let n = 0; n < 600 && off() > 3 + g.car.speed ** 2 / 20; n++) g.advance(1 / 60, FULL);
    const top = +g.car.speed.toFixed(1); g.advance(0.5, STOP); const early = g.mode; g.advance(1, STOP);
    return { far, top, early, after: g.mode, fromCentre: +off().toFixed(1) };
  }, FULL));
  await p.keyboard.press('Escape');
  log('re-enter', await p.evaluate((FULL) => { const g = window.__game, z = g.zones[0]; g.car.place(z.x + 30, z.z, 0); g.advance(0.5); const far = g.mode; g.car.place(z.x + 2, z.z, z.g.yaw); g.advance(0.4); const early = g.mode; g.advance(0.8); return { far, early, after: g.mode }; }, FULL));
  await p.keyboard.press('Escape');
  log('esc', await p.evaluate(() => { const g = window.__game; g.advance(1.5); return { mode: g.mode, note: 'stays shut until the car leaves again' }; }));
  // --- keyboard in the garage: E opens, arrows move, Enter picks, Esc leaves ---
  await p.keyboard.press('KeyE');
  await p.waitForTimeout(300);
  const focusId = () => p.evaluate(() => document.activeElement && document.activeElement.id);
  const f0 = await focusId(); await p.keyboard.press('ArrowUp'); const f1 = await focusId(); await p.keyboard.press('ArrowUp'); const f2 = await focusId(); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); const f3 = await focusId();
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  log('keys', { f0, f1, f2, f3, tabAfterEnter: await p.evaluate(() => [...document.querySelectorAll('.tabs button')].find(b => b.getAttribute('aria-selected') === 'true').id), mode: await p.evaluate(() => window.__game.mode) });
  await p.keyboard.press('Escape');
  log('left', await p.evaluate(() => ({ mode: window.__game.mode, menu: window.__game.input.menu })));
  // --- controller: a fake pad presses Start, moves down, presses A ---
  log('pad', await p.evaluate(async () => {
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
    navigator.getGamepads = () => [pad];
    const g = window.__game, frames = (n) => new Promise((r) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); });
    const press = async (i) => { pad.buttons[i].value = 1; await frames(2); pad.buttons[i].value = 0; await frames(2); };
    const out = {};
    await press(9); out.paused = g.paused;
    await press(13); await press(13); out.focus = document.activeElement.id;
    await press(1); out.afterB = g.paused;
    await press(12); out.afterUp = g.mode;                                   // D-pad up in the garage light opens the garage
    await press(5); out.tab = [...document.querySelectorAll('.tabs button')].find(b => b.getAttribute('aria-selected') === 'true').id;
    await press(1); out.afterB2 = g.mode;
    navigator.getGamepads = () => [];
    return out;
  }));
  // --- a cargo run: load, brake lights, deliver ---
  log('cargo', await p.evaluate((FULL) => { const g = window.__game, s = g.game.offers[0]; g.car.place(s.x - 6, s.z, 0.3); g.advance(1.5); const job = g.game.job; g.advance(2.5, FULL); g.advance(0.3, { ...FULL, throttle: 0, brake: 1 }); return { job: !!job, crate: g.vis.cargo.visible, brake: g.car.brakeOn, zonesHidden: g.zones.every(z => !z.beam.visible) }; }, FULL));
  await snap('21cargo', 1500);
  log('deliver', await p.evaluate(() => { const g = window.__game, to = g.game.job.to; g.car.place(to.x - 5, to.z, 1); g.advance(1.5); return { job: !!g.game.job, cash: g.store.data.cash, runs: g.store.data.runs, saved: JSON.parse(localStorage.getItem('highline.save')).cash }; }));
  // --- a contested load: the rival smuggler sets off, shows on the job card and the map, and wins if left alone ---
  log('contest', await p.evaluate(() => {
    const g = window.__game, s = g.game.sites[2]; g.car.place(s.x - 4, s.z, 0.3); g.advance(0.5); g.game.startJob(s, 'rival'); g.advance(3);
    const rv = g.game.rival; return { kind: g.game.job.kind, rival: !!rv, moved: rv ? +Math.hypot(rv.car.pos.x - s.x, rv.car.pos.z - s.z).toFixed(0) : 0 };
  }));
  await snap('21contest', 2500);
  log('contest2', await p.evaluate(() => ({ label: document.getElementById('joblabel').textContent, shown: !!window.__game.game.rival })));
  log('beaten', await p.evaluate(() => { const g = window.__game, rv = g.game.rival, to = g.game.job.to; rv.car.place(to.x + 3, to.z, 0); g.advance(0.3); return { job: !!g.game.job, rival: !!g.game.rival }; }));
  // --- a race with the rivals in view: start the dash and follow the road for a few seconds ---
  log('dash', await p.evaluate(() => {
    const g = window.__game, d = g.races.find(q => q.base === 'dash'); g.startRace(d); g.advance(3.5);
    const r = g.race, path = d.path, car = g.car;
    for (let i = 0; i < 60 * 7; i++) {      // a simple follow-the-road driver at part throttle, so the rivals stay just ahead
      r.track.update(car.pos); const f = path.at(r.track.idx + 8), dx = f.x - car.pos.x, dz = f.z - car.pos.z;
      const ang = Math.atan2(dx * car.fwd.z - dz * car.fwd.x, dx * car.fwd.x + dz * car.fwd.z);
      g.advance(1 / 60, { steer: Math.max(-1, Math.min(1, ang * 2.5)), throttle: car.speed < 17 ? 0.8 : 0, brake: 0, handbrake: false, analog: true });
    }
    return { state: r.state, pos: r.pos, t: +r.t.toFixed(1), speed: +car.speed.toFixed(1), gaps: r.rivals.map(q => Math.round(q.driver.prog - r.track.prog)) };
  }));
  await snap('22dash', 2500);
  log('errors1', p.errs.slice(0, 6));
  await p.context().close();

  // --- progress waiting on the player's account: it is loaded, the car changes, and later changes are sent back ---
  p = await newPage(() => {
    const docs = { 'data/users/u_abc/save': { v: 1, cash: 43210, runs: 12, car: 'truck', cars: { hatch: { up: [0, 0, 0, 0], tune: {}, paint: 0 }, truck: { up: [1, 2, 0, 0], tune: {}, paint: 5 } }, best: { ring: 181.5 }, rank: { ring: 2 }, units: 'metric', muted: true, at: 1, savedAt: Date.now() - 5000 } };
    window.__sets = [];
    const db = { doc: (path) => ({ get: async () => ({ exists: path in docs, data: () => docs[path] }), set: async (body) => { window.__sets.push({ path, cash: body.cash, car: body.car }); docs[path] = body; } }) };
    window.claude = { use: (n) => new Promise((r) => setTimeout(() => r(n === 'db' ? db : n === 'user' ? { id: async () => 'u_abc' } : null), 300)) };
  });
  await p.waitForTimeout(1500);
  log('account', await p.evaluate(() => { const g = window.__game, s = g.store.data; return { go: document.getElementById('go').textContent, saved: document.getElementById('saved').textContent, car: g.car.spec.name, cash: s.cash, units: s.units, cloud: g.store.cloud, nearGarage1: Math.round(Math.hypot(g.car.pos.x - g.world.places.garages[1].x, g.car.pos.z - g.world.places.garages[1].z)) }; }));
  await snap('23account', 1200);
  await tap('#go');
  log('sync', await p.evaluate(async () => { const g = window.__game; g.store.data.cash += 500; g.store.commit(); g.store.flush(); await new Promise((r) => setTimeout(r, 300)); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); /* the speed unit is redrawn with the picture */ return { sets: window.__sets, cloud: g.store.cloud, status: g.store.status(), unit: document.getElementById('unit').textContent }; }));
  await snap('24truck', 1500);
  log('errors2', p.errs.slice(0, 6));
  await b.close();
})();
