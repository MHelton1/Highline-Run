// Sound in the page: music and background sound start with the first tap in every region, the menu's Music switch
// turns the music off and on and is saved, and the coast's waves are louder on the beach than up on the ridge.
// usage: node tests/sound.cjs [port|desk] [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const mode = process.argv[2] || 'port', OUT = process.argv[3] || path.join(__dirname, 'shots'); require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  let bad = 0;
  for (const region of ['mountain', 'desert', 'coast']) {
    const ctx = mode === 'desk' ? await b.newContext({ viewport: { width: 1280, height: 720 } }) : await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    const tap = (sel) => (mode === 'desk' ? p.click(sel) : p.tap(sel));
    await p.goto('file://' + path.join(__dirname, '..', 'dist', 'local.html') + '#r=' + region);
    await p.waitForSelector('#go:not([hidden])', { timeout: 180000 });
    await tap('#go');
    await p.evaluate(() => window.__game.pinQuality(2));
    // average loudness over a couple of seconds of real time, with the car parked
    const level = (secs = 2.5, which = 'music') => p.evaluate(async ([secs, which]) => {
      const a = window.__game.audio; let e = 0, k = 0; const t0 = performance.now();
      while (performance.now() - t0 < secs * 1000) { e += a.level(which); k++; await new Promise((r) => setTimeout(r, 50)); }
      return +(e / k).toFixed(4);
    }, [secs, which]);
    await p.waitForTimeout(800);
    const on = await level(), amb = await level(2, 'amb');
    const st = await p.evaluate(() => ({ state: window.__game.audio.state, music: window.__game.audio.musicOn }));
    await p.evaluate(() => window.__game.pause()); await p.waitForTimeout(300);
    const label1 = await p.evaluate(() => document.getElementById('dlg-music').textContent);
    await tap('#dlg-music'); await p.waitForTimeout(300);
    const label2 = await p.evaluate(() => document.getElementById('dlg-music').textContent);
    if (region === 'mountain') await p.screenshot({ path: `${OUT}/sound-${mode}-menu.png` });
    await p.evaluate(() => window.__game.resume()); await p.waitForTimeout(1500);
    const off = await level(), saved = await p.evaluate(() => window.__game.store.data.music);
    let waves = null;
    if (region === 'coast') {   // on the sand by the water, then high on the ridge, music off
      waves = await p.evaluate(async () => {
        const g = window.__game, w = g.world; let beach = null, top = null;
        for (let r = 900; r < 1500 && !beach; r += 8) for (const a of [0, 1.6, 3.2, 4.7]) { const x = Math.cos(a) * r, z = Math.sin(a) * r, h = w.sample(x, z); if (h > w.sea + 1 && h < w.sea + 4 && !beach) beach = [x, z]; }
        for (let k = 0; k < 400 && !top; k++) { const x = (Math.random() - 0.5) * 700, z = (Math.random() - 0.5) * 700; if (w.sample(x, z) > w.sea + 150) top = [x, z]; }
        const meas = async (pt) => { g.car.place(pt[0], pt[1], 0); g.car.vel.set(0, 0, 0); await new Promise((r) => setTimeout(r, 2500)); let e = 0; for (let i = 0; i < 60; i++) { e += g.audio.level('amb'); g.car.vel.set(0, 0, 0); await new Promise((r) => setTimeout(r, 50)); } return +(e / 60).toFixed(4); };
        const atBeach = await meas(beach), d1 = g.audio.debug, atTop = await meas(top), d2 = g.audio.debug;
        return { beach: beach && beach.map(Math.round), top: top && top.map(Math.round), atBeach, atTop, d1, d2 };
      });
      await p.screenshot({ path: `${OUT}/sound-${mode}-coast.png` });
    }
    const ok = st.state === 'running' && st.music && on > 0.004 && off < on * 0.2 && amb > 0.0005 && label1 === 'Music on' && label2 === 'Music off' && saved === false && errs.length === 0 && (!waves || waves.atBeach > waves.atTop * 1.3);
    if (!ok) bad++;
    console.log(region.padEnd(9), JSON.stringify({ ...st, on, amb, off, label1, label2, saved, waves, errors: errs.slice(0, 3) }), ok ? 'OK' : 'FAILED');
    await ctx.close();
  }
  console.log(bad ? `sound: ${bad} region(s) failed` : 'sound: all checks passed');
  await b.close(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
