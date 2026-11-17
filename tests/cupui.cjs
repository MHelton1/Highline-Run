// Championship in the page: the Cup choice at the Grand Prix light, three rounds back to back with points, saved
// between rounds, the purse and trophy at the end, and the champion's car once every region's cup is won.
// usage: node tests/cupui.cjs [port|desk] [outdir]
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
  // the other two cups are already won, so winning this one also gives the car
  const region = await p.evaluate(() => { const g = window.__game, s = g.store.data; for (const r of ['mountain', 'desert', 'coast']) if (r !== g.world.region) s.cups[r] = 1; return g.world.region; });
  await p.evaluate(() => { const g = window.__game; g.openOffer(g.races.find((d) => d.base === 'ring')); }); await p.waitForTimeout(400);
  await tap('#dlg-ev-cup'); await p.waitForTimeout(400);
  const card = await p.evaluate(() => ({ title: document.getElementById('dlg-title').textContent, go: document.getElementById('dlg-go').textContent, text: document.getElementById('dialog').textContent }));
  check('card', /Cup$/.test(card.title) && card.go === 'Start round 1' && /round 3, the .*Double \(2 laps\)/.test(card.text) && /Gold trophy/.test(card.text), { title: card.title, go: card.go });
  await p.screenshot({ path: `${OUT}/cup-${mode}-card.png` });
  await tap('#dlg-go'); await p.waitForTimeout(400);
  // finish a round in first place: the player jumps to the last checkpoint after the countdown
  const win = () => p.evaluate(() => {
    const g = window.__game, r = g.race; g.advance(4, { steer: 0, throttle: 0, brake: 0, handbrake: false, analog: true });
    r.lap = (r.def.laps || 1) - 1; r.gate = r.gates.length - 1; const gt = r.gates[r.gate], f = r.def.path.at(gt.idx - 12); g.car.place(f.x, f.z, f.yaw);
    g.advance(6, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true });
    return { name: r.def.name, round: r.def.cup && r.def.cup.round, nums: r.rivals.map((x) => x.num).join(), pos: r.result && r.result.pos, cup: g.store.data.cup };
  });
  const waitResults = () => p.waitForFunction(() => window.__game.mode === 'results', null, { timeout: 60000 }).then(() => p.waitForTimeout(400));
  const r1 = await win(); await waitResults();
  const res1 = await p.evaluate(() => ({ cup: (document.getElementById('dlg-cup') || {}).textContent, go: document.getElementById('dlg-go').textContent, again: !!document.getElementById('dlg-again') }));
  check('round 1', r1.round === 0 && r1.pos === 1 && r1.cup.round === 1 && r1.cup.pts.you === 10 && /after round 1 of 3/i.test(res1.cup) && /\+10/.test(res1.cup) && /^Round 2: /.test(res1.go) && !res1.again, { r1, res1 });
  await p.screenshot({ path: `${OUT}/cup-${mode}-round1.png` });
  // stop after round 1: the cup is kept and the light offers to carry on
  await tap('#dlg-later'); await p.waitForTimeout(400);
  await p.evaluate(() => { const g = window.__game, z = g.zones.find((q) => q.kind === 'race' && q.def.base === 'ring'); g.car.place(z.x, z.z, 0); }); await p.waitForTimeout(2500);
  const back = await p.evaluate(() => ({ mode: window.__game.mode, go: (document.getElementById('dlg-go') || {}).textContent, note: (document.getElementById('dlg-cupnote') || {}).textContent }));
  if (back.mode !== 'offer') await p.evaluate(() => { const g = window.__game; g.openOffer(g.races.find((d) => d.base === 'ring')); }).then(() => tap('#dlg-ev-cup')).then(() => p.waitForTimeout(400));
  const back2 = await p.evaluate(() => ({ go: document.getElementById('dlg-go').textContent, note: (document.getElementById('dlg-cupnote') || {}).textContent, table: !!document.getElementById('dlg-cuptable') }));
  check('resume', back2.go === 'Start round 2' && /Round 2 of 3 is next/.test(back2.note) && back2.table, { back, back2 });
  await tap('#dlg-go'); await p.waitForTimeout(400);
  const r2 = await win(); await waitResults();
  check('round 2', r2.round === 1 && r2.nums === r1.nums && r2.cup.round === 2 && r2.cup.pts.you === 20, r2);
  await tap('#dlg-go'); await p.waitForTimeout(400);
  const cash0 = await p.evaluate(() => window.__game.store.data.cash);
  const r3 = await win(); await waitResults();
  const end = await p.evaluate(() => { const s = window.__game.store.data; return { cup: s.cup, cups: s.cups, champ: !!s.cars.champ, text: document.getElementById('dlg-cup').textContent, go: document.getElementById('dlg-go').textContent }; });
  check('final', r3.round === 2 && end.cup === null && end.cups[region] === 1 && end.champ && /champion!/i.test(end.text) && /Gold trophy/.test(end.text) && /Highline Special/.test(end.text) && end.go === 'Continue', end);
  await p.screenshot({ path: `${OUT}/cup-${mode}-final.png` });
  await tap('#dlg-go'); await p.waitForTimeout(400);
  await p.evaluate(() => { const g = window.__game; g.openGarage(g.world.places.garages[0]); }); await p.waitForTimeout(600);
  check('garage', await p.evaluate(() => !!document.getElementById('g-car-champ')), 'champion car listed');
  check('errors', errs.length === 0, errs.slice(0, 4));
  console.log(bad ? `cup page: ${bad} check(s) failed` : 'cup page: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
