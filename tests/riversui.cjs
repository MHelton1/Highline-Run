// Coast rivers and bridges in the page: two rivers run to the sea, the roads cross them on bridges, a car drives over
// a bridge without dropping into the valley, the railings stop a car turned straight at the edge, and driving into a
// river's deep water splashes and puts the car back on the road. Pictures: a bridge from the road and from the valley.
// usage: node tests/riversui.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(), errs = []; let bad = 0;
  p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(10), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + '#r=coast');
  await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
  await p.click('#go'); await p.evaluate(() => { const g = window.__game; g.pinQuality(2); g.setWeather('clear'); });
  const info = await p.evaluate(() => { const w = window.__game.world; return { rivers: w.rivers.map((r) => r.name), bridges: w.bridges.map((b) => ({ road: w.roads[b.road].name, len: Math.round((b.i1 - b.i0) * w.roads[b.road].ds) })) }; });
  check('layout', info.rivers.length === 2 && info.bridges.length >= 2 && info.bridges.every((b) => b.len >= 20), info);
  // drive along each bridge: the car stays on the deck the whole way
  const over = await p.evaluate(() => {
    const g = window.__game, w = g.world, c = g.car, out = [];
    for (const b of w.bridges) {
      const r = w.roads[b.road], f = w.frame(r, b.i0 - 10);
      c.place(f.x, f.z, f.yaw, 0.3); g.advance(0.3); c.vel.set(Math.sin(f.yaw) * 14, 0, Math.cos(f.yaw) * 14);
      let low = 99, steps = 0;
      for (let k = 0; k < 80; k++) {
        const near = w.nearestRoad(c.pos.x, c.pos.z), s = r.x.findIndex((x, i) => i >= b.i0 && i <= b.i1 && Math.hypot(x - c.pos.x, r.z[i] - c.pos.z) < 6);
        if (s >= 0) { low = Math.min(low, c.pos.y - r.h[s]); steps++; }
        // steer gently along the road
        const ahead = w.frame(r, Math.min(r.to, (near && near.road === r ? r.x.findIndex((x, i) => Math.hypot(x - c.pos.x, r.z[i] - c.pos.z) < 3) : b.i0) + 8));
        const want = Math.atan2(ahead.x - c.pos.x, ahead.z - c.pos.z), have = Math.atan2(c.fwd.x, c.fwd.z); let d = want - have; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        g.advance(0.1, { steer: Math.max(-1, Math.min(1, -d * 2)), throttle: 0.4, brake: 0, handbrake: false, analog: true });
      }
      out.push({ road: r.name, low: +low.toFixed(2), steps });
    }
    return out;
  });
  check('cross', over.every((o) => o.steps > 5 && o.low > -1), over);
  // straight at the railing from the middle of the longest bridge
  const rail = await p.evaluate(() => {
    const g = window.__game, w = g.world, c = g.car, b = w.bridges.slice().sort((a, q) => (q.i1 - q.i0) - (a.i1 - a.i0))[0], r = w.roads[b.road], m = (b.i0 + b.i1) >> 1, f = w.frame(r, m);
    const yaw = Math.atan2(f.lx, f.lz); c.place(f.x, f.z, yaw, 0.3); g.advance(0.3); c.vel.set(Math.sin(yaw) * 12, 0, Math.cos(yaw) * 12);
    g.advance(2.5, { steer: 0, throttle: 1, brake: 0, handbrake: false, analog: true });
    return { side: +((c.pos.x - f.x) * f.lx + (c.pos.z - f.z) * f.lz).toFixed(2), hw: r.hw, dy: +(c.pos.y - f.h).toFixed(2), drop: +(f.h - w.ground(f.x, f.z)).toFixed(1) };
  });
  check('railing', Math.abs(rail.side) < rail.hw + 1.5 && rail.dy > -1, rail);
  await p.screenshot({ path: path.join(OUT, 'bridge-deck.png') });
  // into a river where it runs above the sea: a splash, then back on the road
  const wet = await p.evaluate(() => {
    const g = window.__game, w = g.world, rv = w.rivers[0]; let i = Math.floor(rv.n * 0.55);
    while (i < rv.n - 1 && rv.wl[i] <= w.sea + 1) i++;
    g.car.place(rv.x[i], rv.z[i], 0, 0.5); return { wl: +rv.wl[i].toFixed(1), y: +g.car.pos.y.toFixed(1), water: +w.waterAt(rv.x[i], rv.z[i]).toFixed(1) };
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__game.advance(1.5));
  const after = await p.evaluate(() => { const g = window.__game, n = g.world.nearestRoad(g.car.pos.x, g.car.pos.z); return { toast: document.getElementById('toast').textContent, road: +Math.hypot(n.x - g.car.pos.x, n.z - g.car.pos.z).toFixed(1) }; });
  check('splash', wet.water > 20.5 && /Splash/.test(after.toast) && after.road < 8, { wet, after });
  // a look at each bridge from the river bank beside it
  const look = (bi, step) => p.evaluate(([bi, step]) => {
    const g = window.__game, w = g.world, b = w.bridges[bi], r = w.roads[b.road], f = w.frame(r, (b.i0 + b.i1) >> 1);
    let rv = null, k = 0, m = 1e9;
    for (const q of w.rivers) for (let i = 0; i < q.n; i++) { const d = Math.hypot(q.x[i] - f.x, q.z[i] - f.z); if (d < m) { m = d; k = i; rv = q; } }
    const i = Math.max(1, Math.min(rv.n - 2, k + step)), tx = rv.x[i + 1] - rv.x[i - 1], tz = rv.z[i + 1] - rv.z[i - 1], l = Math.hypot(tx, tz), off = rv.hw[i] + 4;
    const x = rv.x[i] + (tz / l) * off, z = rv.z[i] - (tx / l) * off;
    g.car.place(x, z, Math.atan2(f.x - x, f.z - z), 0.3); g.advance(0.6);
    return { dry: +(w.ground(x, z) - w.waterAt(x, z)).toFixed(1), below: +(f.h - g.car.pos.y).toFixed(1) };
  }, [bi, step]);
  const view = await look(0, 14);
  check('valley', view.dry > 0 && view.below > 2, view);
  await p.waitForTimeout(2500); await p.screenshot({ path: path.join(OUT, 'bridge-valley.png') });
  const view2 = await look(1, -16);
  await p.waitForTimeout(2500); await p.screenshot({ path: path.join(OUT, 'bridge-valley2.png') });
  console.log('view2', JSON.stringify(view2));
  await p.evaluate(() => window.__game.advance(0.2)); await p.keyboard.press('KeyG'); await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(OUT, 'bridge-map.png') }); await p.keyboard.press('KeyG');
  check('errors', errs.length === 0, errs.slice(0, 5));
  console.log(bad ? `rivers: ${bad} check(s) failed` : 'rivers: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})();
