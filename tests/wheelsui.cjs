// Wheels and smooth drawing in the page: an all-wheel-drive car throws dirt off its front tyres as well as the back
// (a rear-drive car only off the back), every wheel leaves tracks rolling on dirt (none rolling straight on tarmac),
// and cars are drawn between physics steps while physics carries on from the true position.
// usage: node tests/wheelsui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + (process.env.REGION ? '#r=' + process.env.REGION : ''));
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await p.click('#go'); await p.evaluate(() => { window.__game.pinQuality(2); window.__game.setWeather('clear'); });
  // where the dust from one burst of trail() starts, front or back of the car (dry weather: dust only rises)
  const dustSplit = (id) => p.evaluate((id) => {
    const g = window.__game, c = g.car; g.showCar(id);
    const r = g.world.roads.find((q) => q.surf === 1), i = Math.floor((r.from + r.to) / 2);
    c.place(r.x[i], r.z[i], Math.atan2(r.x[i + 3] - r.x[i], r.z[i + 3] - r.z[i]), 0.3); g.advance(0.6);
    const sprites = [];   // the dust sprites are the scene's Sprite objects
    const scene = g.vis.car.parent; scene.traverse((o) => { if (o.isSprite) sprites.push(o); });
    for (const s of sprites) { s.visible = false; s.userData.life = 0; }
    c.speed = 16; g.trail(c, 1.2, 60);
    let front = 0, back = 0;
    for (const s of sprites) if (s.visible && s.userData.kind === 'dust') { const dx = s.position.x - c.pos.x, dz = s.position.z - c.pos.z, f = dx * c.fwd.x + dz * c.fwd.z; if (f > 0.3) front++; else if (f < -0.3) back++; }
    return { front, back, driveFront: c.spec.driveFront };
  }, id);
  const awd = await dustSplit('hatch'), rwd = await dustSplit('buggy');
  check('awd dust', awd.front >= 8 && awd.back >= 8, awd);
  check('rwd dust', rwd.front === 0 && rwd.back >= 8, rwd);
  // tracks: rolling straight and gently on dirt, then on tarmac
  const tracks = await p.evaluate(() => {
    const g = window.__game, c = g.car; g.showCar('hatch');
    const roll = (surf) => { const r = g.world.roads.find((q) => q.surf === surf), i = r.from + 40, yaw = Math.atan2(r.x[i + 3] - r.x[i], r.z[i + 3] - r.z[i]);
      c.place(r.x[i], r.z[i], yaw, 0.3); g.advance(0.4); c.vel.set(Math.sin(yaw) * 9, 0, Math.cos(yaw) * 9); const n0 = g.skids.count;
      g.advance(0.8, { steer: 0, throttle: 0.15, brake: 0, handbrake: false, analog: true }); return { n: g.skids.count - n0, surf: c.surf }; };
    return { dirt: roll(1), tarmac: roll(0) };
  });
  check('tracks', tracks.dirt.n >= 8 && tracks.tarmac.n === 0, tracks);
  // smooth drawing: between frames the car is shown part way between its last two physics steps; physics is unchanged
  await p.evaluate(() => { const g = window.__game, c = g.car, r = g.world.roads[0], i = r.from + 60; c.place(r.x[i], r.z[i], Math.atan2(r.x[i + 3] - r.x[i], r.z[i + 3] - r.z[i]), 0.3); g.advance(0.3); });
  await p.keyboard.down('w'); await p.waitForTimeout(2500);
  const sm = await p.evaluate(() => new Promise((res) => requestAnimationFrame(() => setTimeout(() => {
    const g = window.__game, c = g.car, k = g.shownAt.get(c);
    if (!k || !k.on) return res({ on: false });
    const drawn = c.pos.clone(), truth = k.pos.clone(), prev = c.prevPos.clone(), step = prev.distanceTo(truth);
    const between = drawn.distanceTo(prev) <= step + 1e-6 && drawn.distanceTo(truth) <= step + 1e-6;
    g.trueAgain(); const back = c.pos.equals(truth);       // what physics runs from next: the true position, not the drawn one
    res({ on: true, speed: +c.speed.toFixed(1), step: +step.toFixed(3), between, visMatches: g.vis.car.position.distanceTo(drawn) < 1e-6, back });
  }, 0))));
  await p.keyboard.up('w');
  check('smooth', sm.on && sm.speed > 1 && sm.step > 0 && sm.between && sm.visMatches && sm.back, sm);
  await p.screenshot({ path: path.join(OUT, 'wheels.png') });
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `wheels: ${bad} check(s) failed` : 'wheels: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
