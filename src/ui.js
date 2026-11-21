// Menus drawn over the 3D view: the garage, race offers and results, and the pause menu.
import { REGIONS, REGION_IDS } from './regions.js';
import { NITRO } from './stunts.js';
import { CARS, CAR_IDS, FIND_IDS, PRIZE_IDS, PAINTS, UPGRADES, TUNING, upgradeCost, stockTune, buildSpec, measure, rate } from './cars.js';
import { MEDALS, PLACES, LEVELS, KID_LEVEL, rankKey, prizes, medals } from './race.js';
import { regionGoals, garageGoals, isDone, paintLocked, regionComplete, REGION_PAINT } from './goals.js';
import { CUP_ROUNDS, POINTS, TROPHY, purse, cupTable } from './cup.js';
import { ACTIONS, P2_ACTIONS, PAD_ACTIONS, STYLES, STYLE_NAME, actionName, keyName, buttonName, menuButtons } from './binds.js';

const $ = (id) => document.getElementById(id);
// el('button', { class: 'btn', onclick: fn }, 'Text', child...)
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid);
  return e;
}
export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const clock = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

// g: what the game lends the menus (see main.js)
export function createUI(g) {
  const garage = $('garage'), modal = $('modal'), dlg = $('dialog'), body = $('g-body'), start = $('start');
  let tab = 'cars', sel = 'hatch', place = null, kind = null, onBack = null, statT = 0, armed = false;
  const S = () => g.store.data;
  const top = () => (!modal.hidden ? dlg : !garage.hidden ? garage : !start.hidden ? start : null);
  const focusables = () => { const t = top(); return t ? [...t.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((e) => e.offsetParent !== null) : []; };
  const focusOn = (e) => { if (e) { e.focus({ preventScroll: true }); if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); } };

  // ---------- garage ----------
  const cache = new Map();
  function numbers(id) {       // measured on a test strip, so the bars always tell the truth about the car as built
    const own = S().cars[id], up = own ? own.up : [0, 0, 0, 0], tune = own ? own.tune : stockTune(id), key = id + up.join('') + TUNING.map((t) => tune[t.key]).join(',');
    let v = cache.get(key);
    if (!v) { const spec = buildSpec(id, up, tune), m = measure(spec, 45); v = { m, bars: rate(spec, m), mass: spec.mass }; cache.set(key, v); if (cache.size > 80) cache.delete(cache.keys().next().value); }
    return v;
  }
  function drawStats(id) {
    const n = numbers(id), metric = g.metric(), top = n.m.top * (metric ? 3.6 : 2.23694);
    const row = (name, f, val) => [el('dt', null, name), el('dd', { class: 'bar' }, el('i', { style: `transform:scaleX(${f.toFixed(3)})` })), el('dd', { class: 'val' }, val)];
    $('g-stats').replaceChildren(...row('Top speed', n.bars.speed, Math.round(top) + (metric ? ' km/h' : ' mph')), ...row('0–60 mph', n.bars.accel, n.m.t60.toFixed(1) + ' s'), ...row('Grip', n.bars.grip, ''), ...row('Off-road', n.bars.offroad, ''));
    $('g-sub').textContent = CARS[id].drive + ' · ' + (metric ? Math.round(n.mass).toLocaleString('en-US') + ' kg' : (Math.round(n.mass * 2.20462 / 10) * 10).toLocaleString('en-US') + ' lb');
  }
  const buyCar = (id) => {
    const s = S(), c = CARS[id];
    if (s.cash < c.price) return g.audio.deny();
    s.cash -= c.price; s.cars[id] = { up: [0, 0, 0, 0], tune: stockTune(id), paint: c.paint }; s.car = id; g.store.commit(); g.audio.buy(); g.showCar(id, true); draw();
  };
  const driveCar = (id) => { S().car = id; g.store.commit(); g.audio.click(); g.showCar(id, true); draw(); };
  const buyUpgrade = (t) => {
    const s = S(), own = s.cars[s.car], lv = own.up[t]; if (lv >= 3) return;
    const cost = upgradeCost(s.car, t, lv); if (s.cash < cost) return g.audio.deny();
    s.cash -= cost; own.up[t] = lv + 1; g.store.commit(); g.audio.buy(); g.showCar(s.car, true); draw();
  };
  const tuneText = (t, v) => (t.min < 0 ? (Math.abs(v) < 0.005 ? 'Stock' : (v > 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%') : v < 0.005 ? 'Off' : Math.round(v * 100) + '%');
  function tuned(t, input, done) {
    const s = S(), v = Math.round(+input.value * 100) / 100; s.cars[s.car].tune[t.key] = v;
    $('g-tune-' + t.key + '-out').textContent = tuneText(t, v);
    g.showCar(s.car, true);
    clearTimeout(statT); statT = setTimeout(() => drawStats(s.car), done ? 0 : 180);
    if (done) g.store.commit();
  }

  function draw() {
    const s = S(), keep = document.activeElement && garage.contains(document.activeElement) ? document.activeElement.id : null;
    if (tab !== 'cars') sel = s.car;
    const c = CARS[sel], own = s.cars[sel];
    $('g-car').textContent = c.base.name; $('g-cash').textContent = money(s.cash);
    for (const [id, name] of [['g-tab-cars', 'cars'], ['g-tab-up', 'up'], ['g-tab-tune', 'tune']]) $(id).setAttribute('aria-selected', String(tab === name));
    drawStats(sel);
    const carActions = () => {
      const out = [];
      if (own) {
        out.push(el('div', { class: 'swatches', role: 'group', 'aria-label': 'Paint' }, el('span', { class: 'lbl' }, 'Paint'), PAINTS.map((p, i) => { const locked = paintLocked(S(), i), tip = locked ? `${p.name}: finish every goal in ${REGIONS[p.prize].name} to unlock` : p.name;
          return el('button', { id: 'g-paint-' + i, type: 'button', class: 'sw' + (locked ? ' locked' : ''), style: `--c:#${p.hex.toString(16).padStart(6, '0')}`, 'aria-label': tip, title: tip, 'aria-pressed': String(own.paint === i), 'aria-disabled': locked ? 'true' : null,
          onclick: () => { if (locked) { g.audio.deny(); return; } own.paint = i; g.store.commit(); g.audio.click(); g.showCar(sel); draw(); } }); })));
        out.push(sel === s.car ? el('p', { class: 'note' }, 'This is the car you are driving. Parts and tuning for it are on the other two tabs.')
          : el('button', { id: 'g-act', type: 'button', class: 'btn primary', onclick: () => driveCar(sel) }, 'Drive the ' + c.base.name));
      } else {
        const short = c.price - s.cash;
        out.push(el('button', { id: 'g-act', type: 'button', class: 'btn primary', disabled: short > 0, onclick: () => buyCar(sel) }, 'Buy for ' + money(c.price)));
        if (short > 0) out.push(el('p', { class: 'note' }, `You need ${money(short)} more. Cargo runs and race prizes pay cash.`));
      }
      return out;
    };
    const out = [];
    if (tab === 'cars') {
      const hidden = FIND_IDS.filter((id) => !s.cars[id]).length;
      for (const id of [...CAR_IDS, ...FIND_IDS.filter((f) => s.cars[f]), ...PRIZE_IDS.filter((f) => s.cars[f])]) {
        const cc = CARS[id], mine = s.cars[id], now = id === s.car;
        out.push(el('button', { id: 'g-car-' + id, type: 'button', class: 'caritem', 'aria-pressed': String(id === sel), onclick: () => { sel = id; g.audio.click(); g.showCar(id); draw(); } },
          el('span', { class: 'ci-name' }, cc.base.name),
          el('span', { class: 'ci-state ' + (now ? 'now' : mine ? 'own' : s.cash >= cc.price ? 'buy' : 'short') }, now ? 'Driving' : mine ? 'Owned' : money(cc.price)),
          id === sel && el('span', { class: 'ci-drive' }, cc.blurb)));
        if (id === sel) out.push(...carActions());          // paint and buy or drive sit right under the chosen car
      }
      if (hidden) out.push(el('p', { class: 'note', id: 'g-hidden' }, `${hidden === FIND_IDS.length ? 'Three' : hidden === 1 ? 'One more' : hidden === 2 ? 'Two more' : hidden} ${hidden === 1 ? 'car is' : 'cars are'} hidden out in the wild, one in each region. They are not for sale: find them. Goals in the menu has a hint.`));
      // the other regions, reached from any garage
      for (const rid of REGION_IDS) if (rid !== g.region) {
        out.push(el('div', { class: 'travel' }, el('span', { class: 'lbl' }, 'Travel'),
          el('p', { class: 'note' }, `${REGIONS[rid].name}: ${REGIONS[rid].blurb} Your cash, cars and parts come with you.`),
          el('button', { id: 'g-travel-' + rid, type: 'button', class: 'btn', onclick: () => { g.audio.click(); g.travel(rid); } }, 'Drive to ' + REGIONS[rid].name)));
      }
    } else if (tab === 'up') {
      UPGRADES.forEach((u, t) => {
        const lv = own.up[t], cost = lv < 3 ? upgradeCost(sel, t, lv) : 0;
        out.push(el('div', { class: 'uprow' },
          el('span', { class: 'up-name' }, u.name, el('span', { class: 'pips', role: 'img', 'aria-label': `Stage ${lv} of 3` }, [0, 1, 2].map((k) => el('i', { class: k < lv ? 'on' : '' })))),
          el('button', { id: 'g-up-' + u.key, type: 'button', class: 'btn', disabled: lv >= 3 || s.cash < cost, onclick: () => buyUpgrade(t) }, lv >= 3 ? 'Fully fitted' : `Stage ${lv + 1} · ${money(cost)}`),
          el('p', { class: 'up-what' }, u.what)));
      });
      const nos = !!s.nitro;      // the nitro kit: bought once, fits every car
      out.push(el('div', { class: 'uprow' },
        el('span', { class: 'up-name' }, 'Nitro kit'),
        el('button', { id: 'g-nitro', type: 'button', class: 'btn', disabled: nos || s.cash < NITRO.price, onclick: () => { const t = S(); if (t.nitro || t.cash < NITRO.price) return g.audio.deny(); t.cash -= NITRO.price; t.nitro = true; g.store.commit(); g.audio.buy(); g.showNitro(); draw(); } }, nos ? 'Fitted to every car' : `Buy · ${money(NITRO.price)}`),
        el('p', { class: 'up-what' }, `Fits every car you own. Hold NOS (${g.keyLabel('nitro')}, or ${g.padLabel('nitro')} on a controller) for a hard push. Drifts, jumps and steady driving refill it. Free driving only, not in races.`)));
    } else {
      for (const t of TUNING) {
        const v = own.tune[t.key], id = 'g-tune-' + t.key;
        const input = el('input', { id, type: 'range', min: t.min, max: t.max, step: t.step, value: v, 'aria-describedby': id + '-ends' });
        input.addEventListener('input', () => tuned(t, input, false)); input.addEventListener('change', () => tuned(t, input, true));
        out.push(el('div', { class: 'tunerow' }, el('label', { for: id }, t.name), el('output', { id: id + '-out', for: id }, tuneText(t, v)), input, el('div', { class: 'ends', id: id + '-ends' }, el('span', null, t.lo), el('span', null, t.hi))));
      }
      out.push(el('button', { id: 'g-stock', type: 'button', class: 'btn', onclick: () => { own.tune = stockTune(sel); g.store.commit(); g.audio.click(); g.showCar(sel, true); draw(); } }, 'Back to stock settings'));
      out.push(el('p', { class: 'note' }, 'Changes apply to the car straight away. Take it out, feel the difference, and come back to adjust.'));
    }
    body.replaceChildren(...out);
    if (tab === 'cars' && $('g-car-' + sel)) {                 // keep the chosen car and its button in view
      const top = (e) => e.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop, it = $('g-car-' + sel), last = $('g-act') || it;
      const a = top(it), z = top(last) + last.offsetHeight;
      if (a < body.scrollTop || z > body.scrollTop + body.clientHeight) body.scrollTop = Math.max(0, Math.min(a - 8, z + 12 - body.clientHeight));
    }
    focusOn((keep && $(keep) && !$(keep).disabled && $(keep)) || (keep ? focusables().find((e) => body.contains(e)) || $('g-leave') : null));
  }
  const setTab = (name) => { if (tab === name) return; tab = name; g.audio.click(); if (name !== 'cars' && sel !== S().car) { sel = S().car; g.showCar(sel); } draw(); body.scrollTop = 0; };
  $('g-tab-cars').addEventListener('click', () => setTab('cars')); $('g-tab-up').addEventListener('click', () => setTab('up')); $('g-tab-tune').addEventListener('click', () => setTab('tune'));
  $('g-leave').addEventListener('click', () => g.leaveGarage());

  // ---------- cards ----------
  function card(k, parts, back) {
    kind = k; onBack = back; dlg.className = 'dialog card ' + k; dlg.replaceChildren(...parts.flat().filter(Boolean)); modal.hidden = false; modal.scrollTop = 0;
    focusOn(dlg.querySelector('.btn.primary') || dlg.querySelector('button'));
  }
  const fact = (label, value, cls) => el('span', { class: cls || null }, el('span', { class: 'lbl' }, label), value);
  const dist = (m) => (g.metric() ? (m / 1000).toFixed(1) + ' km' : (m / 1609.34).toFixed(1) + ' mi');
  const rivalName = (r) => `#${r.num} ${CARS[r.car] ? CARS[r.car].base.name : r.name}`;

  // a row of choices where one is on
  const seg = (label, list) => el('div', { class: 'pick' }, el('span', { class: 'lbl' }, label), el('div', { class: 'seg', role: 'group', 'aria-label': label },
    list.map((o) => el('button', { id: o.id, type: 'button', 'aria-pressed': o.on ? 'true' : 'false', onclick: () => { if (!o.on) { g.audio.click(); o.pick(); focusOn($(o.id)); } } }, o.text))));

  // the events at this light, plus the cup at the light where its first round starts
  const hasCup = (group) => group.some((d) => d.base === CUP_ROUNDS[0]);
  const eventSeg = (def, group) => (group.length > 1 || hasCup(group)) && seg('Event', [...group.map((d) => ({ id: 'dlg-ev-' + d.id, text: d.short, on: d === def, pick: () => g.pickRace(d) })),
    ...(hasCup(group) ? [{ id: 'dlg-ev-cup', text: 'Cup', on: def === 'cup', pick: () => g.pickCup() }] : [])]);
  const teamName = (num) => `Team #${num}`;   // each team drives the event's own car, so the cup table names only the team
  // the cup table: place, driver, points (and this round's points)
  const cupRows = (cup, got) => cupTable(cup).flatMap((r, i) => [el('dt', { class: 'n' + (r.you ? ' you' : '') }, PLACES[i]), el('dd', { class: r.you ? 'you' : null }, r.you ? 'You' : teamName(r.num)),
    el('dd', { class: 't' + (r.you ? ' you' : '') }, `${r.pts} ${r.pts === 1 ? 'pt' : 'pts'}` + (got ? ` (+${got[r.you ? 'you' : String(r.num)] || 0})` : ''))]);

  // the championship card: its three rounds, points, purse, and the standings if one is under way
  function cupOffer(group) {
    const s = S(), info = g.cupInfo(), cup = info.cup, lv = cup ? cup.lv : s.kid ? KID_LEVEL : s.level;
    card('offer', [
      el('span', { class: 'lbl' }, 'Championship · 3 rounds'), el('h2', { id: 'dlg-title' }, info.name),
      eventSeg('cup', group),
      el('p', null, `Three races back to back against the same three teams: ${info.rounds.map((d, i) => `round ${i + 1}, the ${d.name}` + (d.laps > 1 ? ' (2 laps)' : '')).join('; ')}. Every finish scores points. The most points after round 3 takes the cup.`),
      el('div', { class: 'facts' }, fact('Points', POINTS.join(' · ')), fact('Your best', info.best ? (info.best === 1 ? 'Champion' : PLACES[info.best - 1]) : 'None yet'), fact('Teams', info.teams.map((t) => '#' + t.num).join(', '))),
      cup ? el('p', { class: 'note', id: 'dlg-cupnote' }, `${LEVELS[cup.lv].name} cup under way. Round ${cup.round + 1} of 3 is next: the ${info.rounds[cup.round].name}.`)
        : s.kid ? el('p', { class: 'note' }, 'Kid mode is on: the rivals take it easy and the car drives itself.') : seg('Difficulty', LEVELS.slice(0, 3).map((L, i) => ({ id: 'dlg-lv-' + i, text: L.name, on: i === lv, pick: () => { g.setLevel(i); cupOffer(group); } }))),
      cup ? el('dl', { class: 'rows', id: 'dlg-cuptable' }, cupRows(cup)) : el('dl', { class: 'rows' }, [1, 2, 3].map((p) => [el('dt', { class: 'n' }, PLACES[p - 1]), el('dd', null, TROPHY[p - 1] + ' trophy'), el('dd', { class: 'pay' }, money(purse(p, lv)))])),
      el('p', { class: 'note' }, info.carWon ? `You won the ${info.carName}.` : `Win the cup in all three regions to earn the ${info.carName}, a car that is not for sale. Race prize money is paid as well.`),
      el('div', { class: 'actions' },
        el('button', { id: 'dlg-go', type: 'button', class: 'btn primary', onclick: () => g.startCup() }, cup ? `Start round ${cup.round + 1}` : 'Start round 1'),
        cup && el('button', { id: 'dlg-restart', type: 'button', class: 'btn', onclick: () => { g.dropCup(); cupOffer(group); } }, 'Start the cup over'),
        el('button', { id: 'dlg-no', type: 'button', class: 'btn', onclick: () => g.declineRace() }, 'Not now')),
    ], () => g.declineRace());
  }

  // def: the event shown; group: every event that starts from this light
  function offer(def, group = [def]) {
    const s = S(), lv = s.kid ? KID_LEVEL : s.level, best = s.best[def.id], rank = s.rank[rankKey(def.id, lv)], road = def.kind !== 'trial', pay = prizes(def, lv);
    const rows = road ? pay.map((p, i) => [el('dt', { class: 'n' }, PLACES[i]), el('dd', null, 'place'), el('dd', { class: 'pay' }, money(p))])
      : medals(def, lv).map((t, i) => [el('dt', { class: 'n' }, MEDALS[i]), el('dd', null, 'Under ' + clock(t)), el('dd', { class: 'pay' }, money(pay[i]))]);
    card('offer', [
      el('span', { class: 'lbl' }, def.tag), el('h2', { id: 'dlg-title' }, def.name),
      eventSeg(def, group),
      el('p', null, def.blurb),
      el('div', { class: 'facts' }, fact('Distance', dist(def.dist)), def.kind === 'circuit' && fact('Laps', String(def.laps)), fact('Checkpoints', String(def.gates.length)),
        fact('Your best', best ? clock(best) : 'Not set'), fact(LEVELS[lv].name + ' result', rank ? (road ? PLACES[rank - 1] : MEDALS[rank - 1]) : 'None yet')),
      s.kid ? el('p', { class: 'note' }, 'Kid mode is on: the rivals take it easy and the car drives itself. Turn it off in the menu for Easy, Moderate or Hard.') : seg('Difficulty', LEVELS.slice(0, 3).map((L, i) => ({ id: 'dlg-lv-' + i, text: L.name, on: i === lv, pick: () => { g.setLevel(i); offer(def, group); } }))),
      g.ghostTime(def) != null && seg('Ghost', [{ id: 'dlg-gh-1', text: 'Race my ghost', on: s.ghost !== false, pick: () => { g.setGhost(true); offer(def, group); } }, { id: 'dlg-gh-0', text: 'No ghost', on: s.ghost === false, pick: () => { g.setGhost(false); offer(def, group); } }]),
      road && el('p', { class: 'note' }, 'On the grid: ' + def.rivals.map(rivalName).join(', ') + '. You start at the back.'),
      el('dl', { class: 'rows' }, rows),
      el('div', { class: 'actions' }, el('button', { id: 'dlg-go', type: 'button', class: 'btn primary', onclick: () => g.startRace(def) }, road ? 'Start race' : 'Start the clock'), el('button', { id: 'dlg-no', type: 'button', class: 'btn', onclick: () => g.declineRace() }, 'Not now')),
    ], () => g.declineRace());
  }

  // res: the race's result; note: { best: true } when this beat the saved best
  function results(race, note) {
    const def = race.def, res = race.result, road = def.kind !== 'trial', lv = race.level, pay = prizes(def, lv), times = road ? null : medals(def, lv);
    const head = road ? PLACES[res.pos - 1] + ' place' : res.medal >= 0 ? MEDALS[res.medal] + ' medal' : 'No medal this time';
    const table = road ? el('dl', { class: 'rows', id: 'dlg-table' }) : el('dl', { class: 'rows' }, times.map((t, i) => [el('dt', { class: 'n' + (i === res.medal ? ' you' : '') }, MEDALS[i]), el('dd', { class: i === res.medal ? 'you' : null }, 'Under ' + clock(t)), el('dd', { class: 'pay' }, money(pay[i]))]));
    card('results', [
      el('span', { class: 'lbl' }, def.name + ' · ' + LEVELS[lv].name), el('h2', { id: 'dlg-title', class: (road ? res.pos === 1 : res.medal === 0) ? 'win' : null }, head),
      el('div', { class: 'facts' }, fact('Your time', clock(res.time)), note.best ? fact('Best', 'New best time', 'good') : note.prev ? fact('Best', clock(note.prev)) : null, fact('Prize', res.prize ? '+' + money(res.prize) : 'None', res.prize ? 'good' : null)),
      table,
      note.ghost && el('p', { class: 'note', id: 'dlg-ghostnote' }, note.ghost),
      !road && res.medal < 0 && el('p', { class: 'note' }, `Bronze needs ${clock(times[2])} or better. A car with more ground clearance and a tidier line between checkpoints both help.`),
      note.cup && cupResult(note.cup),
      note.cup && !note.cup.over ? el('div', { class: 'actions' }, el('button', { id: 'dlg-go', type: 'button', class: 'btn primary', onclick: () => g.nextCupRound() }, `Round ${note.cup.round + 1}: ${note.cup.next}`), el('button', { id: 'dlg-later', type: 'button', class: 'btn', onclick: () => g.raceDone() }, 'Later'))
        : note.cup ? el('div', { class: 'actions' }, el('button', { id: 'dlg-go', type: 'button', class: 'btn primary', onclick: () => g.raceDone() }, 'Continue'))
        : el('div', { class: 'actions' }, el('button', { id: 'dlg-go', type: 'button', class: 'btn primary', onclick: () => g.raceDone() }, 'Continue'), el('button', { id: 'dlg-again', type: 'button', class: 'btn', onclick: () => g.raceAgain() }, road ? 'Race again' : 'Try again')),
    ], () => g.raceDone());
    if (road) standings(race);
  }
  // the cup after a round: the table with this round's points, and at the end the trophy and the purse
  function cupResult(c) {
    return el('section', { class: 'cupres', id: 'dlg-cup' },
      el('h3', null, c.over ? (c.place === 1 ? `${c.name} champion!` : `${c.name}: ${PLACES[c.place - 1]} overall`) : `${c.name} after round ${c.round} of 3`),
      el('dl', { class: 'rows' }, cupRows(c.cup, c.got)),
      c.over && el('p', { class: 'note' + (c.place === 1 ? ' good' : '') }, (c.place <= 3 ? `${TROPHY[c.place - 1]} trophy. ` : '') + (c.prize ? `Cup purse +${money(c.prize)}.` : '') + (c.car ? ` You won the ${c.car}! It is waiting in your garage.` : '')),
      !c.over && el('p', { class: 'note' }, 'The cup is saved. You can stop here and pick it up again at the start light.'));
  }
  // the finishing order, redrawn as the other cars come in
  function standings(race) {
    const t = $('dlg-table'); if (!t || kind !== 'results') return;
    t.replaceChildren(...race.table().flatMap((r, i) => [el('dt', { class: 'n' + (r.you ? ' you' : '') }, PLACES[i]), el('dd', { class: r.you ? 'you' : null }, r.you ? 'You' : `#${r.num} ${r.name}`), el('dd', { class: 't' + (r.you ? ' you' : '') }, r.time != null ? clock(r.time) : 'Still racing')]));
  }

  function pause() {
    const racing = g.racing(), opt = g.options();
    armed = false;
    card('pause', [
      el('span', { class: 'lbl' }, racing && !g.duoFree() ? 'Race paused' : 'Paused'), el('h2', { id: 'dlg-title' }, 'Menu'),
      el('p', { class: 'note', id: 'dlg-save' }, g.store.status()),
      (() => { const d = g.dailyInfo(); return el('div', { class: 'daily' + (d.done ? ' done' : ''), id: 'dlg-daily' }, el('span', { class: 'lbl' }, d.done ? 'Daily challenge · done' : `Daily challenge · ${money(d.pay)}`), el('span', { class: 'dtext' }, d.text), el('span', { class: 'dprog' }, d.done ? (d.streak > 1 ? `Done. ${d.streak} days in a row. A new one tomorrow` : 'Done. A new one tomorrow') : d.progress + (d.streak > 0 ? ` · streak ${d.streak}` : ''))); })(),
      el('div', { class: 'actions' },
        el('button', { id: 'dlg-go', type: 'button', class: 'btn primary', onclick: () => g.resume() }, 'Back to driving'),
        racing && !g.duoFree() && el('button', { id: 'dlg-restart', type: 'button', class: 'btn', onclick: () => g.restartRace() }, 'Restart race'),
        racing && el('button', { id: 'dlg-quit', type: 'button', class: 'btn', onclick: () => g.quitRace() }, g.duoFree() ? 'Back to one player' : 'Leave race'),
        el('button', { id: 'dlg-map', type: 'button', class: 'btn', onclick: () => g.map() }, 'Map'),
        !racing && el('button', { id: 'dlg-duo', type: 'button', class: 'btn', onclick: () => duelSetup() }, 'Two players'),
        el('button', { id: 'dlg-controls', type: 'button', class: 'btn', onclick: () => controls() }, 'Controls'),
        el('button', { id: 'dlg-tips', type: 'button', class: 'btn', 'aria-pressed': String(!!g.tipsOn()), onclick: () => { g.toggleTips(); pause(); focusOn($('dlg-tips')); } }, 'Tips ' + (g.tipsOn() ? 'on' : 'off')),
        el('button', { id: 'dlg-photo', type: 'button', class: 'btn', onclick: () => g.photo() }, 'Photo mode'),
        el('button', { id: 'dlg-goals', type: 'button', class: 'btn', onclick: () => goals() }, `Goals ${opt.goals.done}/${opt.goals.all}`),
        el('button', { id: 'dlg-kid', type: 'button', class: 'btn' + (opt.kid ? ' on' : ''), 'aria-pressed': String(!!opt.kid), onclick: () => { g.toggleKid(); pause(); focusOn($('dlg-kid')); } }, 'Kid mode ' + (opt.kid ? 'on' : 'off')),
        el('button', { id: 'dlg-units', type: 'button', class: 'btn', onclick: () => { g.toggleUnits(); pause(); focusOn($('dlg-units')); } }, 'Speed in ' + (opt.metric ? 'km/h' : 'mph')),
        opt.touch && el('button', { id: 'dlg-tilt', type: 'button', class: 'btn' + (opt.tilt ? ' on' : ''), 'aria-pressed': String(!!opt.tilt), onclick: () => { g.toggleTilt(); } }, 'Steering: ' + (opt.tilt ? 'tilt' : 'buttons')),
        opt.canBuzz && el('button', { id: 'dlg-buzz', type: 'button', class: 'btn', 'aria-pressed': String(!!opt.buzz), onclick: () => { g.toggleBuzz(); pause(); focusOn($('dlg-buzz')); } }, 'Vibration ' + (opt.buzz ? 'on' : 'off')),
        el('button', { id: 'dlg-sound', type: 'button', class: 'btn', onclick: () => { g.toggleMute(); pause(); focusOn($('dlg-sound')); } }, 'Sound ' + (opt.muted ? 'off' : 'on')),
        el('button', { id: 'dlg-music', type: 'button', class: 'btn', onclick: () => { g.toggleMusic(); pause(); focusOn($('dlg-music')); } }, 'Music ' + (opt.music ? 'on' : 'off')),
        el('button', { id: 'dlg-weather', type: 'button', class: 'btn', onclick: () => { g.nextWeather(); pause(); focusOn($('dlg-weather')); } }, 'Weather: ' + opt.weather),
        el('button', { id: 'dlg-time', type: 'button', class: 'btn', onclick: () => { g.nextTime(); pause(); focusOn($('dlg-time')); } }, 'Time: ' + opt.tod),
        el('button', { id: 'dlg-fps', type: 'button', class: 'btn', onclick: () => { g.toggleFps(); pause(); focusOn($('dlg-fps')); } }, 'Frame rate ' + (opt.fps ? 'shown' : 'hidden')),
        el('button', { id: 'dlg-cash', type: 'button', class: 'btn', onclick: () => { g.testCash(); pause(); focusOn($('dlg-cash')); } }, 'Add $10,000 test cash'),
        g.fullInfo().can && el('button', { id: 'dlg-full', type: 'button', class: 'btn', 'aria-pressed': String(g.fullInfo().on), onclick: () => { g.toggleFull(); focusOn($('dlg-full')); } }, 'Full screen ' + (g.fullInfo().on ? 'on' : 'off')),
        g.fullInfo().desk && el('button', { id: 'dlg-exit', type: 'button', class: 'btn', onclick: () => g.quit() }, 'Exit game'),
        el('button', { id: 'dlg-wipe', type: 'button', class: 'btn danger', onclick: () => { if (!armed) { armed = true; $('dlg-wipe').textContent = 'Press again to erase everything'; } else g.resetProgress(); } }, 'Erase saved progress')),
      el('p', { class: 'note' }, `Cash ${money(S().cash)}. The test cash button is here so the garage can be tried without grinding; it will go before release.`),
      el('dl', { class: 'keys' },
        el('dt', null, 'Drive'), el('dd', null, `${['gas', 'left', 'brake', 'right'].map((id) => g.keyLabel(id)).join(' ')} to drive, ${g.keyLabel('hand')} is the handbrake. Hold brake at a stop to reverse.`),
        el('dt', null, 'Kid mode'), el('dd', null, 'The car drives forward by itself at a gentle speed, so only steering is needed. Hold brake to stop. Cargo jobs give more time, patrols are slower to catch you, and races get easy rivals.'),
        el('dt', null, 'Lights'), el('dd', null, 'Stop in amber to load cargo and green to deliver. Blue is a garage, violet a race, cyan the next checkpoint.'),
        el('dt', null, 'Keys'), el('dd', null, ['action', 'reset', 'flip', 'camera', 'map', 'units', 'mute', 'music', 'time'].map((id) => `${g.keyLabel(id)} ${actionName(id).toLowerCase()}`).join(', ') + '. Change them in Controls.'),
        el('dt', null, 'Controller'), el('dd', null, ['gas', 'brake', 'hand', 'nitro', 'reset', 'flip', 'camera', 'action', 'map', 'pause'].map((id) => `${g.padLabel(id)} ${actionName(id).toLowerCase()}`).join(', ') + ', left stick to steer.')),
    ], () => g.resume());
  }

  // ---------- goals: this region first, then the others, then the garage ----------
  function goals() {
    const s = S(), here = g.region, order = [here, ...REGION_IDS.filter((r) => r !== here)];
    const row = (q) => { const done = isDone(s, q.id);
      return el('li', { class: done ? 'done' : null, id: 'goal-' + q.id.replace('.', '-') },
        el('span', { class: 'gname' }, q.name),
        el('span', { class: 'gpay' }, done ? 'Done' : money(q.pay)),
        q.hint && !done ? el('span', { class: 'ghint' }, q.hint) : null,
        q.need > 1 && !done ? el('span', { class: 'gbar' }, el('span', { class: 'track' }, el('i', { style: `transform:scaleX(${(q.have / q.need).toFixed(3)})` })), el('b', null, `${q.have} / ${q.need}`)) : null); };
    const group = (title, sub, list) => el('section', { class: 'goalset' }, el('h3', null, title, el('span', null, `${list.filter((q) => isDone(s, q.id)).length} of ${list.length}`)), sub && el('p', { class: 'note' }, sub), el('ul', { class: 'goals' }, list.map(row)));
    card('goals', [
      el('span', { class: 'lbl' }, 'Menu'), el('h2', { id: 'dlg-title' }, 'Goals'),
      el('p', { class: 'note' }, 'Each goal pays once. Finish every goal in a region to unlock its own paint in the garage.'),
      el('div', { class: 'actions' }, el('button', { id: 'dlg-back', type: 'button', class: 'btn primary', onclick: () => pause() }, 'Back to the menu')),
      order.map((r) => group(REGIONS[r].name + (r === here ? ' (here)' : ''), regionComplete(s, r) ? `${regionGoals(s, r).every((q) => isDone(s, q.id)) ? 'All done. ' : ''}${PAINTS[REGION_PAINT[r]].name} paint unlocked.` : `Prize: ${PAINTS[REGION_PAINT[r]].name} paint.`,
        regionGoals(s, r).map((q) => { const k = q.id.split('.')[1], h = r === here ? g.findHints() : null; return h && h[k] ? { ...q, hint: h[k] } : q; }))),
      group('Garage', null, garageGoals(s)),
    ], () => pause());
  }

  // ---------- controls: every key and controller button can be changed ----------
  let ctlTab = 'keys', ctlWait = null, ctlMsg = '';
  const CTL_LISTS = { keys: ACTIONS.map((a) => a.id), p2: P2_ACTIONS, pad: PAD_ACTIONS };
  const padShort = (name) => (name || '').replace(/\s*\(.*$/, '').trim() || 'A controller';
  function controls(t) {
    if (t && t !== ctlTab) { ctlTab = t; ctlMsg = ''; }
    const b = g.binds(), pad = g.padInfo(), set = ctlTab, mb = menuButtons(pad.kind);
    const label = (v) => (set === 'pad' ? buttonName(v, pad.kind) : keyName(v));
    const slot = (id, k) => { const v = b[set][id][k], waiting = !!ctlWait && ctlWait.id === id && ctlWait.slot === k;
      return el('button', { id: `ctl-${id}-${k}`, type: 'button', class: 'slot' + (waiting ? ' wait' : '') + (v == null ? ' empty' : ''), 'aria-label': `${actionName(id)}, ${k ? 'second' : 'first'} ${set === 'pad' ? 'button' : 'key'}: ${v == null ? 'none' : label(v)}`, onclick: () => bindSlot(id, k) },
        waiting ? (set === 'pad' ? 'Press a button' : 'Press a key') : v == null ? '—' : label(v)); };
    const note = set === 'keys' ? 'Pick a box, then press the key you want. Each action can have two keys. Escape always opens the menu.'
      : set === 'p2' ? "Player 2's keys in a two-player race. Player 1 keeps every keyboard key that player 2 does not use."
        : (pad.name ? `Found: ${padShort(pad.name)} (${STYLE_NAME[pad.kind]} buttons).` : 'No controller found yet. Connect one and press any button on it.') +
          ` Pick a box, then press the button you want. Steer with the left stick or the buttons below. In menus ${buttonName(mb.accept, pad.kind)} picks and ${buttonName(mb.back, pad.kind)} goes back.`;
    card('controls', [
      el('span', { class: 'lbl' }, 'Menu'), el('h2', { id: 'dlg-title' }, 'Controls'),
      seg('Set up', [{ id: 'ctl-tab-keys', text: 'Keyboard', on: set === 'keys', pick: () => controls('keys') }, { id: 'ctl-tab-p2', text: 'Player 2', on: set === 'p2', pick: () => controls('p2') }, { id: 'ctl-tab-pad', text: 'Controller', on: set === 'pad', pick: () => controls('pad') }]),
      el('p', { class: 'note', id: 'ctl-note' }, note),
      set === 'pad' && seg('Button names', STYLES.map((st) => ({ id: 'ctl-style-' + st, text: STYLE_NAME[st], on: b.style === st, pick: () => { g.setPadStyle(st); controls(); } }))),
      el('div', { class: 'binds', id: 'ctl-list' }, CTL_LISTS[set].map((id) => [el('span', { class: 'bname' }, actionName(id)), slot(id, 0), slot(id, 1)])),
      el('p', { class: 'note', id: 'ctl-msg', 'aria-live': 'polite' }, ctlMsg || ' '),
      el('div', { class: 'actions' },
        el('button', { id: 'ctl-back', type: 'button', class: 'btn primary', onclick: () => { g.cancelCapture(); pause(); } }, 'Back to the menu'),
        el('button', { id: 'ctl-reset', type: 'button', class: 'btn', onclick: () => { g.cancelCapture(); g.resetBinds(set); ctlMsg = 'Back to the standard ' + (set === 'pad' ? 'buttons.' : 'keys.'); controls(); focusOn($('ctl-reset')); } }, 'Reset to standard')),
    ], () => { if (ctlWait) g.cancelCapture(); else pause(); });
  }
  function bindSlot(id, k) {
    const set = ctlTab, kind0 = g.padInfo().kind, label = (v) => (set === 'pad' ? buttonName(v, kind0) : keyName(v));
    ctlWait = { id, slot: k };
    ctlMsg = set === 'pad' ? `Press the controller button for ${actionName(id)}. Waiting 6 seconds.` : `Press the key for ${actionName(id)}. Escape cancels, Delete clears the box.`;
    controls(); focusOn($(`ctl-${id}-${k}`));
    g.capture(set === 'pad' ? 'pad' : 'key', (v) => {
      ctlWait = null;
      if (v === undefined) ctlMsg = 'No change.';
      else { const from = g.setBind(set, id, k, v); ctlMsg = v == null ? `${actionName(id)}: box cleared.` : `${actionName(id)}: ${label(v)}` + (from ? `, taken off ${actionName(from)}.` : '.'); }
      if (kind === 'controls') { controls(); focusOn($(`ctl-${id}-${k}`)); }
    });
  }
  // ---------- big countdown numbers ----------
  const count = $('count');
  // two players: pick the event and player 2's car, then race head to head on a split screen
  let duoPick = null;
  function duelSetup(sel) {
    const info = g.duelInfo(); duoPick = duoPick || { ev: info.events[0].id, car: info.cars.includes('hatch') ? 'hatch' : info.cars[0] };
    if (sel) Object.assign(duoPick, sel);
    if (!info.events.some((e) => e.id === duoPick.ev)) duoPick.ev = info.events[0].id;
    if (!info.cars.includes(duoPick.car)) duoPick.car = info.cars[0];
    const ev = info.events.find((e) => e.id === duoPick.ev), ci = info.cars.indexOf(duoPick.car);
    card('duel', [
      el('span', { class: 'lbl' }, 'Same screen'), el('h2', { id: 'dlg-title' }, 'Two players'),
      el('p', { class: 'note' }, info.touch && !info.pads ? 'Two players need a keyboard or game controllers (a computer, a TV browser, or a tablet with controllers).' : (() => { const b = g.binds(), K = (set, id) => (b[set][id] || []).map(keyName)[0] || '?', four = (set) => ['gas', 'left', 'brake', 'right'].map((id) => K(set, id)).join(' ');
        return `Player 1: ${four('keys')}, ${K('keys', 'hand')} to slide. Player 2: ${four('p2')}, ${K('p2', 'hand')} to slide. With controllers: two, one each; one, it goes to player 2. Change keys in the menu, Controls.`; })()),
      seg('Event', info.events.map((e) => ({ id: 'dlg-duo-' + e.id, text: e.short || e.name, on: e.id === duoPick.ev, pick: () => duelSetup({ ev: e.id }) }))),
      el('p', { class: 'note' }, ev.free ? 'Open map: drive anywhere together, side by side from the nearest road. No race and no clock; an arrow points to the other car. Leave from the menu.' : ev.name + (ev.laps > 1 ? ` · ${ev.laps} laps` : '')),
      el('div', { class: 'pick' }, el('span', { class: 'lbl' }, 'Player 2 drives'), el('div', { class: 'seg' },
        el('button', { id: 'dlg-duo-prev', type: 'button', 'aria-label': 'Previous car', onclick: () => { g.audio.click(); duelSetup({ car: info.cars[(ci - 1 + info.cars.length) % info.cars.length] }); focusOn($('dlg-duo-prev')); } }, '◀'),
        el('button', { id: 'dlg-duo-car', type: 'button', 'aria-pressed': 'true' }, CARS[duoPick.car].base.name),
        el('button', { id: 'dlg-duo-next', type: 'button', 'aria-label': 'Next car', onclick: () => { g.audio.click(); duelSetup({ car: info.cars[(ci + 1) % info.cars.length] }); focusOn($('dlg-duo-next')); } }, '▶'))),
      el('p', { class: 'note' }, `Player 1 drives the ${CARS[info.p1].base.name}. No prize money; just bragging rights.`),
      el('div', { class: 'actions' },
        el('button', { id: 'dlg-duo-go', type: 'button', class: 'btn primary', onclick: () => g.startDuel(duoPick.ev, duoPick.car) }, ev.free ? 'Start driving' : 'Start the race'),
        el('button', { id: 'dlg-duo-back', type: 'button', class: 'btn', onclick: () => g.duelBack() }, 'Back')),
    ], () => g.duelBack());
  }
  function duelResults(res, set) {
    const t = res.times, name = ['Player 1', 'Player 2'];
    card('duelres', [
      el('span', { class: 'lbl' }, 'Two players'), el('h2', { id: 'dlg-title' }, `${name[res.winner]} wins!`),
      el('dl', { class: 'rows', id: 'dlg-duo-table' }, [res.winner, 1 - res.winner].map((w, k) => [el('dt', { class: 'n' }, k ? '2nd' : '1st'), el('dd', null, name[w]), el('dd', { class: 't' }, t[w] != null ? clock(t[w]) : 'Did not finish')])),
      res.gap != null ? el('p', { class: 'note' }, `Won by ${res.gap.toFixed(2)} s.`) : null,
      el('div', { class: 'actions' },
        el('button', { id: 'dlg-duo-again', type: 'button', class: 'btn primary', onclick: () => g.startDuel(set.def.id, set.p2) }, 'Race again'),
        el('button', { id: 'dlg-duo-other', type: 'button', class: 'btn', onclick: () => duelSetup() }, 'Other race'),
        el('button', { id: 'dlg-duo-done', type: 'button', class: 'btn', onclick: () => g.endDuel() }, 'Back to driving')),
    ], () => g.endDuel());
  }
  function showCount(text, go) { count.textContent = text; count.classList.toggle('go', !!go); count.classList.remove('show'); void count.offsetWidth; count.classList.add('show'); }

  return {
    offer, cupOffer, results, standings, pause, goals, showCount, duelSetup, duelResults, controls,
    padChanged() { if (kind === 'controls' && !modal.hidden && !ctlWait) { const f = document.activeElement && document.activeElement.id; controls(); if (f && $(f)) focusOn($(f)); } },
    openGarage(p) { place = p; tab = 'cars'; sel = S().car; $('g-place').textContent = p.name; garage.hidden = false; draw(); body.scrollTop = 0; focusOn($('g-leave')); },
    closeGarage() { garage.hidden = true; clearTimeout(statT); },
    close() { modal.hidden = true; kind = null; onBack = null; },
    refresh() { if (!garage.hidden) draw(); const s = $('dlg-save'); if (s && kind === 'pause') s.textContent = g.store.status(); },
    get kind() { return modal.hidden ? (garage.hidden ? null : 'garage') : kind; },
    get shown() { return sel; },
    // keyboard and controller: move the highlight, pick, go back, switch garage tab
    nav(dx, dy) {
      const list = focusables(); if (!list.length) return;
      const cur = document.activeElement, i = list.indexOf(cur);
      if (dx && i >= 0 && cur.type === 'range') { cur.value = +cur.value + dx * +cur.step * 2; cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true })); return; }
      focusOn(list[i < 0 ? 0 : (i + (dy || dx) + list.length) % list.length]);
    },
    accept() { const list = focusables(), cur = document.activeElement; if (list.includes(cur)) cur.click(); else focusOn(list.find((e) => e.classList.contains('primary')) || list[0]); },
    back() { if (!modal.hidden) { if (onBack) onBack(); } else if (!garage.hidden) g.leaveGarage(); },
    tab(d) { if (kind === 'controls' && !modal.hidden && !ctlWait) { const t = ['keys', 'p2', 'pad']; controls(t[(t.indexOf(ctlTab) + d + 3) % 3]); focusOn($('ctl-tab-' + ctlTab)); return; }
      if (garage.hidden || !modal.hidden) return; const names = ['cars', 'up', 'tune']; setTab(names[(names.indexOf(tab) + d + 3) % 3]); focusOn($('g-tab-' + tab)); },
  };
}
