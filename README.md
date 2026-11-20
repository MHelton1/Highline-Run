# Highline Run: browser prototype, build 23

**Play it:** https://mhelton1.github.io/Highline-Run/ (works on a phone; progress is saved in that browser).

`index.html` at the top of this repository is the built game, so GitHub Pages serves it as is. After changing anything in `src/` or `template.html`, run `npm install` once, then `node build.mjs` and copy `dist/index.html` over `index.html`.

Open world racing prototype. Three.js, custom car physics (no physics library), one self-contained HTML page.
Published as the Artifact https://claude.ai/artifact/CCe1Vm1bT8vnQcpf8gMy4m with `capabilities: {db: {}, user: {}, downloads: true}` (downloads lets photo mode save pictures inside the Claude viewer).

## Modules

No rendering (run in plain node, so the tests can drive them):

- `src/regions.js` the regions (mountain, desert, coast): names of roads and places, ground kind, trees, surface names

- `src/nav.js` the big map's marker: which place a tap means (`pickPoint`), arrival, the map's view box
- `src/stunts.js` free-roam scoring: `DriftMeter` (drift chains, multiplier, pay), speed trap spots (`placeTraps`) and crossing
- `src/terrain.js` world data: heightfield, roads, surface grip table, ground queries, places (cargo sites, garages, race lines)
- `src/vehicle.js` rigid-body car physics on the heightfield (120 Hz fixed step, gravity 13.2)
- `src/cars.js` the car catalog (hatch, sprint, buggy, wagon, truck, coupe, trophy, apex; `CAR_IDS` is cheapest first), upgrades, tuning sliders, `buildSpec(id, up, tune)`, `measure()` and `rate()` for showroom numbers
- `src/ai.js` path-following drivers (patrols and race rivals)
- `src/jobs.js` cargo runs with five kinds of load (`CARGO`: freight, fragile, rush, hot, contested), patrols, heat and busts,
  and the rival smuggler who races you for a contested load
- `src/route.js` cross-country routes over the steepness map (A*), used by the rival smuggler
- `src/race.js` the six events (three ring circuits, two summit sprints, an off-road time trial) at three difficulty levels
  (`LEVELS`: Easy, Moderate, Hard), grid, countdown, timing, standings
- `src/save.js` saved progress: this browser first, the player's private space in the Artifact database when available

Browser only:

- `src/kit.js` building blocks shared by the world and the cars: merged geometry, the small parts builder, painted signs
- `src/scene.js` the world's meshes: terrain (with ground grain in its shader), roads, trees, bushes, stones and marker
  posts, the sky with clouds and the two reflection maps baked from it, garages, start arches, light columns
- `src/carmodel.js` the car models: a skin lofted over cross-sections with wheel arches, a glazed cabin, wheels, lights
  and trim, laid out per style from the car's physics numbers; also the soft shade under each car
- `src/input.js` keyboard, gamepad and touch merged into one state; the same devices move the highlight in menus
- `src/audio.js` engine, wind, tyres, siren and effects made with Web Audio
- `src/ui.js` garage screen, race cards, results, pause menu
- `src/main.js` game loop, modes (title, roam, garage, offer, race, results), camera, HUD, minimap, shadows, adaptive quality
- `template.html` page markup and styles; `build.mjs` bundles everything into `dist/index.html`

## Build

    npm install
    node build.mjs        # writes dist/index.html (the Artifact page) and dist/local.html (same page with a document wrapper)

## Tests

Plain node, from this folder:

    node tests/save.test.mjs      # save repair, migration from build 2, account sync and conflict rules
    node tests/placement.mjs      # the car settles upright anywhere along the roads and in open country
    node tests/jobs.mjs           # cargo run, patrol chase, bust, delivery
    node tests/cargo.mjs          # cargo kinds: pay and time, fragile loads breaking, hot loads, the rival's pace on every route
    node tests/stop.mjs           # a stop made on the brake holds long enough for a light to open; finished sprint rivals park
    node tests/cars.mjs           # every car: numbers, stance, laps with three driver models, cross-country ride (slow)
    node tests/races.mjs          # robots of different pace in the player's seat for each event (slow)
    node tests/laps.mjs           # the original lap test for the starter car
    node tests/ride.mjs           # the starter car straight across open country: air time and rollovers
    node tests/route.mjs          # the time trial's planned line between gates, and where the cargo sites are

`tests/jobs.mjs` picks cargo offers at random, so its output differs from run to run. The others are repeatable, and
`cars.mjs` and `races.mjs` must print the same results before and after a change that is not meant to alter the driving.

Headless browser walkthroughs (Playwright with Chromium; screenshots land in `tests/shots/`):

    node tests/browser.cjs desk|port|land     # title, garage, buying, upgrades, tuning, race offer, grid, pause, results, time trial
    node tests/browser2.cjs desk|port         # stop-to-enter, keyboard and controller menus, cargo run, sprint race, account save
    node tests/layout.cjs                     # phone layouts at four window sizes, down to a 200 px tall sideways window
    node tests/touch.cjs port|land            # simulated fingers: several at once, sliding, near misses, buttons with a thumb resting

Pictures for judging the look (not pass or fail):

    node tests/look.cjs desk|port [views] [outdir] [quality]   # fixed views of the built game; holds one quality level
    node tests/travel.cjs [desk|port] [outdir]  # travel to the desert, back, then to the coast and into the sea
    node tests/sound.cjs [port|desk] [outdir]   # music, background sound and the Music switch in all three regions
    node tests/tod.cjs [port|desk] [outdir]     # time of day: menu, headlights, patrol sight, cycle, saved
    node tests/goals.cjs [port|desk] [outdir]   # goals: a delivery pays its goal, the Goals page, locked prize paints
    node tests/ghostui.cjs [port|desk] [outdir] # ghost car: saved after a race, shown and compared next time, card switch
    node tests/weatherui.cjs [port|desk] [outdir] # weather: menu, storm effects, changing by itself, saved
    node tests/findsui.cjs [port|desk] [outdir]   # hidden finds: a crate, the barn car, a ramp jump, hints, garage
    node tests/cupui.cjs [port|desk] [outdir]     # championship: Cup card, three rounds with points, resume, purse, prize car
    node tests/nav.mjs                            # marker snapping, arrival, map view box
    node tests/bigmapui.cjs [port|desk|land] [outdir]   # big map: open from the corner map, mark a garage, pin, arrive, clear
    node tests/stunts.mjs [region]                # drift meter, trap pay, trap spots in the real world
    node tests/stuntsui.cjs [desk|port] [outdir]  # speed traps pay a new best once, drift pays and shows on the dash, goals
    node tests/nitroui.cjs [port|desk] [outdir]   # nitro: buy in Parts, NOS control and tank shown, faster run, touch, not in races
    node tests/photoui.cjs [port|desk] [outdir]   # photo mode: dash hidden, drag to orbit, picture and download, back
    node tests/phoneui.cjs [port|land] [outdir]   # phone extras: tilt steering from the menu (fake tilt readings), buzz
    node tests/heatui.cjs [port|desk] [outdir]    # roadblock and backup on a hot run, getting past, clearing up
    node tests/kid.mjs           # kid mode: speeds, brake and reverse, every race with a steering-only robot
    node tests/goals.mjs         # goals: counting, rewards paid once, prize paints, save cleaning
    node tests/ghost.mjs         # ghost car: packing accuracy, playback, size
    node tests/weather.mjs       # weather: blends, region mixes, storms, grip (longer stops in rain and snow)
    node tests/finds.mjs         # hidden finds: placement in every region, same every time, ramps jump cleanly
    node tests/cup.mjs           # championship: points, cup table, save cleaning, a whole cup with a robot per region
    node tests/phone.mjs         # tilt steering math for every screen angle and both sign conventions
    node tests/heat.mjs          # roadblocks: placed ahead with a gap a car fits, busting, chasing once passed, backup
    node tests/kidui.cjs [port|land|desk]  # kid mode switch, hidden buttons, menu, race card in the page
    node tests/garage8.cjs [outdir]  # garage with every car on an upright and a sideways phone (pictures)
    node tests/carshots.cjs [ids] [six|one|two|side|rear|top]  # the car models alone on a pad (bundles tests/viewer/entry.js)

The page exposes `window.__game` for tests. `__game.advance(seconds, input)` runs the simulation without drawing,
`__game.drawn` reports triangles, draw calls and the quality level, `__game.pinQuality(n)` holds a quality level.
HUD text, light visibility and the shade under cars only refresh on a drawn frame, so read those after a short wait.

## Notes

- Brake and reverse share a control. A stop made on the brake holds the car for `STOP_HOLD` (0.6 s, `src/vehicle.js`) before
  reverse is selected, because a place opens after 0.5 to 0.7 s under 2.5 m/s and players keep a thumb on the brake while
  they stop. Without the hold the starter car was slow for only 0.59 s and backed out of the light. Letting go and pressing
  again, or pressing from a standstill, reverses at once. Computer drivers never hold the foot brake at a standstill: they
  park on the handbrake.
- In the slow test browser one frame is a tenth of a second of game time, and each step of a test costs about a frame. A
  check that needs the car to stay put has to make it stay put (see the prompt check in `tests/touch.cjs`).
- The key-tapping lap robot runs wide at the very top pace (101 mph cap with 11.5 m/s² corners). That is the robot's
  duty-cycle steering, not a spin: the key-holding and analog robots are clean at the same pace.
- Rival pace (`skill` and `vcap` in `src/race.js`) and the time trial medal times were first guesses; Michael found races
  right for a moderate level, so Moderate keeps them unchanged and Easy and Hard scale them. Results are saved per level
  under the event id plus `e` or `h` (`rankKey`), so Moderate keeps the names older saves used.
- The rival smuggler adjusts its speed to reach the buyer at `RIVAL_DUE` (82%) of the job's time limit, so every route is
  a fair race whatever the ground. It is a first guess, to be tuned from play.
- Several events share one start light (`spot`); the race card switches between them.
- The headless test browser draws in software at about 2 frames a second, so the frame-rate watcher steps quality down
  there (shadows off at level 2, half the trees at 3, no bushes or stones at 4). Use `pinQuality` when a picture matters.
- Reflections: the sky is baked once into a blurred map for paint and metal and a sharp cube map for glass. They are
  given to the car materials only. Set on the whole scene, Three.js would also light every Lambert material with it.
- A car's `look` (from `design()` in `src/cars.js`) picks a variant of its body style in `src/carmodel.js`: `wagon`
  (estate hatch: roof rails, no rally parts), `trophy` (desert truck: tube bumpers, bed cage, light bar), `wing` (coupe
  with a rear wing). Coupe sizes follow the body width, so a narrow car like the Sprint 1600 fits its parts.
- Regions: `buildWorld(region)` builds the same layout (ring road, trail, garages, sites, camps, race lines) from each
  region's own ground function and names; the mountain is byte-for-byte what it was before regions existed. Desert races
  keep the mountain's rival pace (the robots give the same standings) under their own ids (`loop`, `loopb`, `loopx`,
  `canyon`, `canyonb`, `flats`), so results are kept apart; `def.base` is the mountain id for code that looks events up.
  Travelling saves the new region and reloads the page (the address carries `#r=<region>` too, for browsers that cannot
  keep the save). Node tests take `REGION=desert` (or `coast`) from the environment, the browser tests and picture tools too.
- The coast (`sea: 20` in its region) has water: `world.sea` is the water height, the ring road is lifted at least 4 m
  above it, ground under water counts as a wall for routes (`steepR`), beaches are dirt, and `scene.js` draws one
  see-through plane. A car more than 0.6 m under the surface for 0.8 s is put back on the road (and a cargo load takes
  damage). Coast race ids: `coast`, `coastb`, `coastx`, `ridge`, `ridgeb`, `cliffs`. The dash height is above sea level.
- Sound (build 11): `src/audio.js` makes the engine, tyres, wind, siren and effects; `src/music.js` adds each region's
  music (`STYLES`: tempo, four-chord loop, lead sound; the tune comes from `tuneFor(region)`, the same every time; drums
  join while racing or chased with cargo) and background sound (wind and birds, breeze, cicadas and a hawk, waves louder
  near the water and gulls). Music has its own switch (menu, N key), saved as `music`. `tests/sound.cjs` measures the
  music and background buses through `audio.level('music' | 'amb')`.
- Time of day (build 12): `src/daylight.js` blends set looks by the hour (`lookAt(hour, sky)`: light direction,
  colour and strength, sky, clouds, fog, stars, `night` 0..1); the day look is each region's own sky, unchanged. The
  setting (`tod`: day, sunset, night, cycle; menu or T key) is saved; the cycle runs a day in 20 minutes. `main.js`
  `applyLook()` sets the lights and sky and redraws the car reflections (`sky.bake()`) when the hour has moved.
  A spotlight headlight exists only when the setting is not day. Patrols see a hot load from `1 - 0.4 * night` as far.
  `tests/tod.cjs` checks it in the page; `TOD=night HOUR=.. node tests/look.cjs` takes pictures.
- Goals (build 13): `src/goals.js` lists 11 goals per region and 4 for the garage, each worth a reward paid once
  (`claimGoals`, checked once a second in `main.js`). Progress comes from `stats[region]` counters (d deliveries,
  h hot, e escapes with a hot load, r rival beaten, c fragile without a scratch, n at night, v visited), race `rank`
  results at any level, and the cars owned; `done` lists goal ids. Finishing a region unlocks its prize paint
  (`PAINTS[7..9]`, `REGION_PAINT`). `eventsFor(region)` in race.js names a region's events without building the world.
  `tests/goals.mjs` (node) and `tests/goals.cjs` (page) check it.
- Ghost car (build 14): `src/ghost.js` records the player's pose ten times a second during a race (`GhostRecorder`,
  fed from the physics loop by the race clock), packs it into 16-bit steps (about 45 KB for four minutes) and keeps one
  ghost per event in this browser's storage (`highline.ghost.<event id>`, not in the account save). A new best time
  replaces it. Playback (`ghostAt`) draws a see-through copy of the car that ran it; checkpoints show the gap to it.
  The race card's Ghost switch is saved as `ghost`. `tests/ghost.mjs` (node) and `tests/ghostui.cjs` (page).
- Weather (build 15): `src/weather.js` defines clear, cloudy, rain, snow, fog and dust (cloud cover, fog distances, light,
  tint, particles, sounds, grip per surface, patrol sight) and each region's mix; `blendWeather` mixes two kinds over
  20 s. The setting (`weather`: auto = changing every 2.5 to 5.5 minutes, clear, storm = the region's storm) is saved.
  `world.weatherGrip` (undefined in clear weather, so physics is untouched) multiplies tyre grip in `vehicle.js` and the
  rivals' corner speeds in `ai.js`. `buildFall` in scene.js draws the particles in one call; `GROUND_FX.snow` whitens
  open ground in snow. `tests/weather.mjs` (node) and `tests/weatherui.cjs` (page); `WEATHER=snow node tests/look.cjs`.
- Hidden finds (build 16): `src/finds.js` places 12 crates ($250 each), one shed with an old car (`BARN_CAR`: the
  Ridgeback 4x4, Mesa Runner and Seabreeze Roadster, `find:` entries in cars.js kept out of `CAR_IDS`, the showroom)
  and 3 jump ramps per region from the region's seed, on reachable ground away from roads, spots and race courses.
  Placement happens in main.js only (node race tests see the plain world). `addRamps` wraps `world.sample`, so ramps are
  real ground for every car; call it after the terrain and props are drawn. Found crates are bits in `stats[region].k`,
  the longest air time (tenths) is `stats[region].a`; air time over 0.9 s pays `airPay` outside races. Goals: crates,
  barn, air per region, and "find all hidden cars" in the garage; the Goals page shows hints for the region you are in.
- Championships (build 17): `src/cup.js`. One cup per region (`CUP_NAME`), rounds `CUP_ROUNDS` = Grand Prix, dirt
  sprint, Double, run back to back from the results screen against the Grand Prix's three teams (numbers and colours
  kept, each team drives the event's own car). Points `POINTS` 10/6/3/1 from the finishing table; the player wins ties.
  The cup under way is saved as `cup` (region, level, round, points) and resumes at the Grand Prix light ("Cup" on the
  Event row); best finish per region is `cups`. The purse is paid at the end; winning all three cups gives `champ`, the
  Highline Special (`prize: true` in cars.js, not in the showroom). Goals: a cup per region, all three in the garage.
- Roadblocks and backup (build 18): `ROADBLOCK` in jobs.js. A spotted Hot load (or any load chased for 25 s) gets two
  patrol cars parked across the ring road ~420 m ahead (mode `block`, a ~2.5 m gap at one side) and, for Hot loads, a
  backup patrol from ~450 m behind. They are temporary patrols in `game.patrols` (`temp`), removed when the run ends,
  when they lose the player, or (an unreached block) after 150 s out of sight. Blockers bust a player who stops by them
  and chase once passed (event `runblock`, stat `b`, goal "Get past a roadblock"). None in kid mode. main.js keeps six
  patrol models and shows as many as there are patrols.
- Phone extras (build 19): `src/phone.js`. Tilt steering (`tilt` in the save, menu "Steering", phones only) reads
  `devicemotion` gravity, turns it to the screen's left-right axis with `screen.orientation.angle`, and fixes the
  browser's sign from the first readings (a phone being looked at faces up). Full lock at 24 degrees; the steering arrows
  still win. iPhones need a tap to grant motion access, so it is switched on from the menu or the Start button. Vibration
  (`buzz`, shown only where `navigator.vibrate` exists) on crashes, landings, busts and crates. The screen wake lock is
  asked for when driving starts. All three do nothing where the browser does not allow them.
- Photo mode (build 20): menu "Photo mode" or O. The game stays paused, `body.photo` hides the dash, and
  `updateCamera` orbits the car (`PH`: drag, pinch, wheel or the Zoom slider). Take photo renders one frame and reads
  the canvas straight away (no preserveDrawingBuffer needed), then shows it with a Download link; on a phone, press
  and hold the picture to save it.
- Big map (build 21): tap the corner map, G, Back on a controller, or menu "Map". The game pauses, `paintBase(N, ls, q,
  view)` paints the still map at 720 px over the box `mapView` finds round the roads and places, and a tap sets `nav`
  (snapped to a garage, race start or cargo site within about 24 screen px). With no cargo on board the direction card
  points to the marker ("Your marker"), a pink light column stands on it, and driving within 24 m clears it.
- Drifts and speed traps (build 22), free driving only, not in kid mode: `stunts(dt)` runs the `DriftMeter` (slide angle over
  0.18 rad above 9 m/s; the multiplier rises every 1.6 s to x4; pays a quarter of the score when the slide ends, a crash
  loses it) and clocks the car through 3 trap cameras per region (yellow dots on the maps). A new best pays $10 per mph
  over 50, minus what the old best already paid. Saved per region in `stats`: `f` best drift, `s0`-`s2` trap bests (mph).
  Two goals per region: a 2,000 drift and all three traps at 80 mph (60 goals in all).
- Nitro (build 23): a $4,000 kit in the garage's Parts tab (`nitro` in the save) fits every car. `NitroTank` in
  `src/stunts.js`: 3.5 s of burn, refilled by drifts (score/1500), air time (0.3 per second) and driving over 15 m/s
  (1/70 per second); once empty the button must be let go. While on, `car.step` gets `boost` (6.5 m/s² forward push,
  grounded and in a forward gear) and the view widens 7°. Shift or B, LB on a controller, NOS on touch. Free driving only.
- Cargo rivals steer round a pickup's hut when their way in runs through it (the coast's huts sat on the line in).
- Kid mode (`src/kid.js`, saved as `kid`): `kidInput()` replaces the pedals so the car drives itself at `KID` speeds
  (22 m/s tarmac, 16 dirt, 12 off road, less in turns); a held brake still stops and reverses. Cargo time x1.4, bust
  rate x0.35, automatic flip and back-to-road when stuck. Races use the hidden level `KID_LEVEL` (rivals x0.66 pace, at most
  20.5 m/s), results under the `k` key. `tests/kid.mjs` (node, any region) and `tests/kidui.cjs` (page) check it.
- Bushes, stones and marker posts have no collision on purpose. Anything solid belongs in `world.addCollider`, and
  the race and lap tests then need running again.
