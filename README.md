# Highline Run: browser prototype, build 31

**Play it:** https://mhelton1.github.io/Highline-Run/ (works on a phone; progress is saved in that browser).

`index.html` at the top of this repository is the built game, so GitHub Pages serves it as is. After changing anything in `src/` or `template.html`, run `npm install` once, then `node build.mjs` and copy `dist/index.html` over `index.html`.

Open world racing prototype. Three.js, custom car physics (no physics library), one self-contained HTML page.
Published as the Artifact https://claude.ai/artifact/CCe1Vm1bT8vnQcpf8gMy4m with `capabilities: {db: {}, user: {}, downloads: true}` (downloads lets photo mode save pictures inside the Claude viewer).

## Modules

No rendering (run in plain node, so the tests can drive them):

- `src/regions.js` the regions (mountain, desert, coast): names of roads and places, ground kind, trees, surface names

- `src/nav.js` the big map's marker: which place a tap means (`pickPoint`), arrival, the map's view box
- `src/stunts.js` free-roam scoring: `DriftMeter` (drift chains, multiplier, pay), speed trap spots (`placeTraps`) and crossing
- `src/tips.js` tips for new players: each tip's trigger and skip test, `nextTip` (one at a time, at most one a minute, once each)
- `src/binds.js` controls the player can change: every action's keys (and player 2's), controller buttons, key and button names (Xbox, Switch, PlayStation), cleaning a saved copy
- `src/duel.js` two players on one screen: `Duel` (side-by-side grid, each player's checkpoints and laps, finish order, 25 s grace after the first finisher, per-player reset)
- `src/daily.js` the daily challenge: today's task per date and region (`dailyFor`), progress, streak pay, save cleaning
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
    REGION=coast node tests/mapimg.mjs map.png   # the region from above, to check a layout by eye
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
    node tests/tips.mjs                           # tip order, spacing, old saves skip the basics, save cleaning
    node tests/tipsui.cjs [port|desk|land] [outdir]   # first tip, tap to close, gap, menu switch off and back on
    node tests/daily.mjs                          # daily task per date, progress, streaks, travel, save cleaning
    node tests/dailyui.cjs [port|desk] [outdir]   # menu card, doing it pays once with news, done state, tyre marks
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
    node tests/wheelsui.cjs [outdir]  # front-wheel dirt on 4x4s, tracks on dirt, drawing between physics steps
    node tests/riversui.cjs [outdir]  # coast rivers: driving over both bridges, the railings, a splash in a river, pictures
    REGION=coast node tests/townsui.cjs [outdir]  # towns: name on entry, solid buildings, pictures by day, night and map
    REGION=coast node tests/outerui.cjs [outdir]  # bigger map: outer loop, spokes, third town, sizes and pictures
    REGION=coast node tests/traffic.mjs   # traffic: fills in, keeps its lane and speed, slows in towns, queues behind a parked car
    REGION=coast node tests/trafficui.cjs [outdir]  # traffic in the page: drawn, off in races, the menu switch, pictures
    REGION=coast node tests/school.mjs [calibrate]  # driving tests: robot runs in the school car against the medal times
    node tests/brakes.mjs [show]          # 60-0 and 100-0 mph distances, lift-off roll, turn-in time for every car
    node tests/solid.mjs                  # buildings, bridge piers and railings stop the car; it can drive under a bridge
    node tests/cruiseui.cjs               # auto throttle: holds 80 mph, more throttle overrides, brake cancels
    REGION=coast node tests/schoolui.cjs [outdir]  # driving tests in the page: list, school car, pay once, own car back
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
- Coast rivers and bridges (build 30, Michael asked 2026-11-21 for "bridges and water features running through the map"):
  a region's `rivers` list (x, z points from the mouth out at sea up into the hills) becomes `world.rivers` (centre line
  every 4 m, half width `hw`, `depth`, water level `wl` that climbs from the sea no faster than 12%). Roads are laid
  first (`clearRivers` lifts a road at least 6 m over a crossing, smoothing only the lift), then the valleys are cut
  into the stamped ground: channel, low bank, 0.4 slopes. Road stretches left more than 1 m over the ground become
  `world.bridges` ({road, i0, i1}); `road.deck` marks their samples so `world.sample` keeps the deck flat out to the
  walls, and a row of `addCollider` stops (radius 2.1, `lo` = deck − 3, so nothing below hits them) is the railing.
  `world.waterAt(x, z)` is the water level there (sea or river) and replaces `world.sea` in every wet check (splash
  reset, map tint, trees, props, finds, shore sound); `world.ground(x, z)` is the grid height under a deck.
  `scene.js` `buildRivers` (water ribbon where the river runs above the sea, streaks drifting down) and `buildBridges`
  (deck body, walls, piers). Mountain and desert are byte-identical (no `rivers`). Tests: `tests/riversui.cjs`;
  `tests/mapimg.mjs out.png` draws any region from above (water, roads, bridges, places) for checking a layout.
- Towns (build 31, Michael asked 2026-11-21 "Can we add some towns to the maps?"): a region's `towns` names (two)
  become `world.towns`, one round each garage along 230 m of ring road each way: two rows of buildings a side
  (front row from hw + 14 m), kinds house, shop, tall, shed, each on its own plinth so the ground is not reshaped,
  none on the outside of a bend tighter than about 320 m (run-off room) or near huts, garage yards, start lines and
  checkpoints. Buildings are solid (`addCollider` rows); lamps and signs are not. `world.inTown` keeps trees (same
  random draws, so every other tree stays put), bushes and stones out; `world.townAt` drives the "Entering ..."
  toast. `scene.js` `buildTowns` (styles per ground in `TOWN_STYLE`, `glow(night)` lights windows). Big map and corner
  map show buildings and names. `buildWorld(region, { towns: false })` leaves them out: `laps.mjs` (so `cars.mjs`)
  uses that, because its keyboard robots wander far off the road at 100 mph. Tests: `tests/townsui.cjs`,
  `TEST=tests/x.mjs node tests/notowns.mjs` runs any node test without towns.
- Bigger maps (build 32, Michael asked 2026-11-21 "make the maps bigger?", 1.5x wider chosen): `SIZE` 4608 m, `N`
  1152 (4 m cells as before, so every old grid point lands on the same spot). The middle 3072 m keeps its roads, races,
  garages and towns; mountain and desert heights there are unchanged with `{ outer: false }`. Each region's `outer`
  adds a loop road at about 0.74 of the half width (`outer:true`), three spokes joining it to the inner roads
  (`spoke:true`, one of them dirt), three pickup spots on it (`places.sites` after the camps; any job touching one
  gets 1.25x time and rivals never go there) and a third town on it (`places.outerTown`). On the coast the loop runs
  over a band of islands, crossing the sea on bridge decks held SEA+7 up. Trees: the first pass is the old one in the
  old square (same draws), a second seeded pass fills the new ground. `buildTerrain` draws blocks with every point,
  every second point past 650 m and every fourth past 1625 m (skirts hide the joins). Corner map is a 3300 m window
  that follows the car. `laps.mjs` uses `{ towns: false, outer: false }`. Tests: `tests/outerui.cjs [outdir]`.
- Outer loop race (build 33): `places.lines.outer` (flattest spot near 0.32 of the loop) is the start of a seventh
  event, base `outer` (ids timber, frontier, island), one 16-gate lap of about seven miles with its own arch and start
  zone (`spotsFor` adds an `outer` spot). Two goals per region came with it, marked `extra` so a region's paint prize
  does not depend on them: win that race, and drive through all three towns (stat `t`, one bit per town, set by the
  "Entering ..." toast). Bridges leave their railing open where another road joins (`bridge.open[side][i]`), for the
  stops and the walls drawn. `races.mjs outer` runs the robots round it.
- Traffic (build 34): `src/traffic.js`. `Traffic` keeps up to `TRAFFIC.n` (phones `nTouch`) ordinary cars on the
  closed tarmac roads (ring road, outer loop) in both directions, right of the centre line. Each is a real `Vehicle`
  driven by a `Commuter` (a `Driver` that holds its lane, keeps about a 1.5 s gap to anything ahead in it, never
  overtakes, and slows to `vTown` within 260 m of a town on its road). Cars appear 170 to 460 m along the road from the
  player (at least 150 m away in a straight line, 40 m from any car) and go past 600 m, or once wrecked out of sight.
  `main.js` steps them with the player in free roam and the garage (knocks hurt cargo like patrol contact), clears
  them for races and two players, draws them within 340 m (phones 260 m) from a pool of models, and shows grey dots on
  the corner map. Menu switch "Traffic on/off" is saved as `traffic`. Tests: `tests/traffic.mjs`, `tests/trafficui.cjs`.
- Driving tests (build 35): `src/school.js`. `buildTests(world)` finds each region's straightest flat 360 m of ring
  road (Standing Start, 300 m; Stop Box, a 2.6 m `stop` gate 150 m on that only counts once the car is still), the next
  straightest stretch well away from it (Slalom: seven 2.4 m gates offset 2.3 m left and right), the twistiest 500 m
  (Bends) and 700 m of trail from the Summit Dash start (Gravel Run). They are time trials (`school: true`, level 1
  always, medals in tenths) taken in the stock Rally Hatch painted Signal yellow (`schoolCar` in main.js swaps the
  spec and model in and back). `SCHOOL_MEDALS` come from `node tests/school.mjs calibrate` (gold 3% over the best robot,
  silver 14%, bronze 30%); rerun it after any change to the roads. A better medal pays the difference once
  (`improvePay`), no daily challenge credit. Menu: "Driving tests". Tests: `tests/school.mjs`, `tests/schoolui.cjs`.
- Solid world and auto throttle (build 36, from Michael's report): `world.sample(x, z, out, y)` takes the height of
  whatever asks; a bridge deck more than 2 m above it is ignored, so cars drive on the ground or river bed underneath.
  Bridge piers (`world.piers`, every 13 samples where the deck is over 3.5 m up) and abutment walls (0.8 to 3.4 m) are
  colliders with `hi` limits; railings are dense stops with `lo`/`hi` so they only stop cars on the deck. Car against
  scenery uses the car's box, not its centre: closest point of the box to each collider circle (`t.rad`, trunks
  0.3 + 0.06 x size), push out, bounce, and turn the car by where it hit. Town buildings are ringed with small stops.
  River banks are carved by distance to the river's segments and smoothed twice (not under bridges or near roads).
  Auto throttle (`cruiseInput` in main.js, menu switch saved as `cruise`): holds 80 mph in free roam and races, the
  player's throttle wins when it asks for more, the brake or handbrake hands control back. Tests: `tests/solid.mjs`,
  `tests/cruiseui.cjs`.
- Brakes and handling (build 37, Michael: "tighten up the handling and braking, cars feel like they take too long to
  stop"): `BRAKE_ASSIST` (3.6 m/s² x brake) and `LIFT_DRAG` (1.2 m/s² with no pedal in a forward gear) push straight
  against the direction of travel while two or more wheels are down, so 60-0 mph is about 22 m (was 29) and lifting
  off at 60 rolls about 150 m (was 300 to 580). Key and touch steering builds to full lock in 0.18 to 0.54 s (was 0.25
  to 0.75) and every car's `steerRate` is x1.3 (`STEER_QUICK`). `STOP_HOLD` went from 0.6 to 0.75 s because the
  harder stop spends less time under 2.5 m/s. School medals recalibrated. Test: `node tests/brakes.mjs [show]`.
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
- Tips (build 24): `tipTick` (free driving only) checks every half second; a tip shows for up to 20 s in `#tip` (tap to close)
  and its id goes into `tips` in the save. Saves that have clearly done the basics (deliveries, cars, races, goals) mark
  those tips seen without showing them. Menu "Tips on/off"; switching back on starts the list again.
- Daily challenge (build 25): one task a day (deliveries, a Hot load, a drift score, a speed trap, air time or a race
  place), picked from a hash of the local date and region, so everyone gets the same one. `daily(kind, value)` is called
  from deliveries, drifts, traps, landings and race finishes. $3,000, plus $500 per day of streak (up to +$3,000). Saved
  as `daily` { day, region, have, done, streak, last }; one per day even after travelling. Shown at the top of the menu.
- Tyre marks (`src/skids.js`) from the player's rear wheels when sliding (slip over 0.32, or the handbrake above 6 m/s);
  nitro flames (two blue cones on the car) and a rush of wind in the sound while nitro burns.
- Weather spray (build 26, Michael asked 2026-11-20): `trail()` picks by weather. Rain (`WX.cur.rain` > 0.3): clumps of
  mud (`mud()`, hard-edged `mudTex`, thrown up and back, land and stay on the ground) off loose surfaces, and a light
  mist (`spray()`) off wet tarmac at speed. Snow (`WX.cur.ground`): white powder, grey slush on tarmac. Dry: dust as
  before. Tips: `TIP_GAP` 60 s (at most one a minute), `TIP_SHOW` 20 s, and never while a message is showing.
- Two players (build 27, Michael asked 2026-11-21): menu "Two players" opens the setup card (event and player 2's car;
  player 1 drives their current car). Mode `duel` then `duelres`; `input.poll2()` reads both players (P1 WASD + Space,
  P2 arrows + right Shift; two pads one each, one pad goes to P2; Backspace or pad Y resets). The screen is split with
  scissor viewports (side by side when wider than tall, else stacked), each half with its own chase camera (`cam2`) and
  panel (`#duo`); patrols, smuggler, tips and the touch controls are hidden. No prize money, no saves touched. Tests:
  `tests/duel.mjs [region]` and `tests/duelui.cjs [desk|port]`.
- Controls (build 28, Michael asked 2026-11-21 for "full keybinding support and controller mapping for switch and Xbox
  controllers"): menu "Controls" has three tabs (Keyboard, Player 2, Controller). Pick a box, press the key or button;
  it is taken off any other action in the same set. Escape cancels and is never bindable (always the menu), Delete clears
  a key box, a controller box gives up after 6 s. Saved as `binds` (null = standard). `input.setBinds()` builds the
  press maps; `input.capture(kind, done)` waits for a key or button. Controller kind from the Gamepad id (vendor 045e
  Xbox, 057e Switch, 054c PlayStation) or forced by the Button names choice; buttons are standard-layout positions, so on
  Switch the bottom button is B and A (right) picks in menus. Hints, tips, prompts and the start screen use the bound
  names. Tests: `tests/binds.mjs`, `tests/controlsui.cjs` (a fake Switch controller).
- Cargo rivals steer round a pickup's hut when their way in runs through it (the coast's huts sat on the line in).
- Kid mode (`src/kid.js`, saved as `kid`): `kidInput()` replaces the pedals so the car drives itself at `KID` speeds
  (22 m/s tarmac, 16 dirt, 12 off road, less in turns); a held brake still stops and reverses. Cargo time x1.4, bust
  rate x0.35, automatic flip and back-to-road when stuck. Races use the hidden level `KID_LEVEL` (rivals x0.66 pace, at most
  20.5 m/s), results under the `k` key. `tests/kid.mjs` (node, any region) and `tests/kidui.cjs` (page) check it.
- Bushes, stones and marker posts have no collision on purpose. Anything solid belongs in `world.addCollider`, and
  the race and lap tests then need running again.
