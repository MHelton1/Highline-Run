// Saved progress. It is written to this browser straight away, and to the player's own private space in the page's
// database when that is available, so progress follows them to another device. No rendering (runs in node for tests).
import { CARS, ALL_CAR_IDS, PAINTS, TUNING, stockTune, upgradeCost } from './cars.js';
import { REGIONS } from './regions.js';
import { STAT_KEYS } from './goals.js';
import { cleanCup } from './cup.js';
import { TIP_IDS } from './tips.js';
import { cleanDaily } from './daily.js';
import { cleanBinds } from './binds.js';

const KEY = 'highline.save';
const num = (v, a, b, d) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : d);

export function freshSave() {
  return { v: 1, cash: 0, runs: 0, car: 'hatch', cars: { hatch: { up: [0, 0, 0, 0], tune: stockTune('hatch'), paint: CARS.hatch.paint } },
    best: {}, rank: {}, level: 1, units: 'imperial', muted: false, music: true, ghost: true, tod: 'day', weather: 'auto', at: 0, region: 'mountain', kid: false, tilt: false, buzz: true, traffic: true, cruise: false, nitro: false, tips: [], tipsOn: true, binds: null, daily: cleanDaily(null), stats: {}, done: [], cup: null, cups: {}, savedAt: 0 };
}

// Anything read back from storage is checked and repaired field by field, so a damaged or hand-edited save cannot break the game.
export function cleanSave(raw) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  s.cash = Math.round(num(raw.cash, 0, 1e9, 0)); s.runs = Math.round(num(raw.runs, 0, 1e6, 0));
  if (raw.cars && typeof raw.cars === 'object') for (const id of ALL_CAR_IDS) {
    const c = raw.cars[id]; if (!c || typeof c !== 'object') continue;
    const tune = stockTune(id);
    for (const t of TUNING) tune[t.key] = num(c.tune && c.tune[t.key], t.min, t.max, tune[t.key]);
    s.cars[id] = { up: [0, 1, 2, 3].map((k) => Math.round(num(Array.isArray(c.up) ? c.up[k] : 0, 0, 3, 0))), tune, paint: Math.round(num(c.paint, 0, PAINTS.length - 1, CARS[id].paint)) };
  }
  s.car = typeof raw.car === 'string' && Object.hasOwn(s.cars, raw.car) ? raw.car : 'hatch';
  for (const k of ['best', 'rank']) if (raw[k] && typeof raw[k] === 'object') {
    for (const id of Object.keys(raw[k]).slice(0, 64)) { const v = raw[k][id]; if (/^[a-z]{1,16}$/.test(id) && typeof v === 'number' && isFinite(v) && v > 0) s[k][id] = v; }
  }
  s.level = Math.round(num(raw.level, 0, 2, 1));                // race difficulty: 0 easy, 1 moderate, 2 hard
  s.units = raw.units === 'metric' ? 'metric' : 'imperial'; s.muted = !!raw.muted; s.music = raw.music !== false; s.ghost = raw.ghost !== false; s.weather = ['auto', 'clear', 'storm'].includes(raw.weather) ? raw.weather : 'auto'; s.tod = ['day', 'sunset', 'night', 'cycle'].includes(raw.tod) ? raw.tod : 'day'; s.at = raw.at === 1 ? 1 : 0;
  s.kid = raw.kid === true; s.tilt = raw.tilt === true; s.buzz = raw.buzz !== false; s.nitro = raw.nitro === true; s.tipsOn = raw.tipsOn !== false; s.traffic = raw.traffic !== false; s.cruise = raw.cruise === true; s.daily = cleanDaily(raw.daily); s.binds = raw.binds && typeof raw.binds === 'object' ? cleanBinds(raw.binds) : null;   // null: the default controls
  if (Array.isArray(raw.tips)) s.tips = [...new Set(raw.tips.filter((id) => TIP_IDS.includes(id)))];
  if (raw.stats && typeof raw.stats === 'object') for (const r of Object.keys(REGIONS)) {   // goal counters per region
    const st = raw.stats[r]; if (!st || typeof st !== 'object') continue;
    s.stats[r] = {}; for (const k of STAT_KEYS) { const v = Math.round(num(st[k], 0, 1e6, 0)); if (v) s.stats[r][k] = v; }
  }
  if (Array.isArray(raw.done)) s.done = [...new Set(raw.done.filter((id) => typeof id === 'string' && /^[a-z]{1,16}\.[a-z0-9]{1,16}$/.test(id)))].slice(0, 200);
  s.cup = cleanCup(raw.cup, Object.keys(REGIONS));             // a championship under way
  if (raw.cups && typeof raw.cups === 'object') for (const r of Object.keys(REGIONS)) { const v = raw.cups[r]; if ([1, 2, 3, 4].includes(v)) s.cups[r] = v; }   // best cup finish per region
  s.region = typeof raw.region === 'string' && Object.hasOwn(REGIONS, raw.region) ? raw.region : 'mountain';
  s.savedAt = num(raw.savedAt, 0, 1e14, 0);
  return s;
}

// Everything a save holds, in dollars. Used only to pick a winner when two devices both changed things.
export function worth(s) {
  let w = s.cash + s.runs;
  for (const id in s.cars) { w += CARS[id].price || CARS[id].value; s.cars[id].up.forEach((lv, t) => { for (let k = 0; k < lv; k++) w += upgradeCost(id, t, k); }); }
  return w;
}

// onRemote(data): progress from the player's account has replaced what this browser had.
// onStatus(): where progress is being kept has changed (see store.status()).
export function createStore({ onRemote, onStatus } = {}) {
  const st = { data: freshSave(), local: 'ok', cloud: 'checking', touched: false };
  let base = 0, doc = null, writing = false, queued = false, dead = false, sent = '', timer = 0;
  const changed = () => { if (onStatus) onStatus(); };

  // ---- this browser ----
  let raw = null, old = null, oldUnits = null;
  try { raw = localStorage.getItem(KEY); old = localStorage.getItem('highline'); oldUnits = localStorage.getItem('units'); } catch (_) { st.local = 'none'; }
  try {
    if (raw) st.data = cleanSave(JSON.parse(raw));
    else if (old) { const o = JSON.parse(old); st.data = cleanSave({ cash: o.cash, runs: o.runs, units: oldUnits === 'metric' ? 'metric' : 'imperial' }); st.data.savedAt = 1; }   // build 2 kept only cash and runs
  } catch (_) {}
  base = st.data.savedAt;
  const writeLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(st.data)); st.local = 'ok'; } catch (_) { st.local = 'none'; } };

  // ---- the player's account ----
  // One write at a time, and only when something really changed. A failed write is tried once more after a short random
  // wait; if that fails too the next change tries again.
  function push(retry) {
    clearTimeout(timer); timer = 0;
    if (!doc || dead) return;
    if (writing) { queued = true; return; }
    const body = JSON.stringify(st.data);
    if (body === sent) return;
    writing = true; st.cloud = 'saving'; changed();
    let again = 0;
    doc.set(JSON.parse(body)).then(() => { sent = body; st.cloud = 'on'; }, (e) => {
      const code = e && e.code;
      if (code === 'invalid_argument' || code === 'transform_error') { dead = true; st.cloud = 'readonly'; }        // this person may look but not save here
      else if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') { dead = true; st.cloud = 'off'; }
      else if (code === 'quota_exceeded') { dead = true; st.cloud = 'full'; }
      else if (code === 'resource_exhausted' || retry) st.cloud = 'slow';
      else again = 700 + Math.random() * 1600;
    }).then(() => {
      writing = false;
      if (dead) queued = false;
      else if (again) timer = setTimeout(() => push(true), again);
      else if (queued) { queued = false; timer = setTimeout(push, 400); }
      changed();
    });
  }

  async function connect() {
    const c = typeof window !== 'undefined' ? window.claude : null;
    if (!c || typeof c.use !== 'function') { st.cloud = 'off'; changed(); return; }
    const slow = setTimeout(() => { if (st.cloud === 'checking') { st.cloud = 'slow'; changed(); } }, 10000);
    try {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      const uid = db && user ? await user.id() : null;
      if (!uid) st.cloud = 'off';                                   // signed out, or no private space for this viewer: this browser only
      else {
        const ref = db.doc('data/users/' + uid + '/save');
        let snap;
        try { snap = await ref.get(); }
        catch (e) { if (e && e.code && e.code !== 'unavailable') throw e; await new Promise((r) => setTimeout(r, 700 + Math.random() * 1600)); snap = await ref.get(); }
        doc = ref;
        const remote = snap.exists ? cleanSave(snap.data()) : null;
        if (remote && remote.savedAt > base && (!st.touched || worth(remote) >= worth(st.data))) {
          // the account holds newer progress than this browser started from
          st.data = remote; base = remote.savedAt; sent = JSON.stringify(remote); st.touched = false; writeLocal();
          st.cloud = 'on';
          if (onRemote) onRemote(remote);
        } else {
          st.cloud = 'on';
          if (remote && remote.savedAt === st.data.savedAt) sent = JSON.stringify(st.data);
          else if (st.data.savedAt > 0) push();
        }
      }
    } catch (e) {
      const code = e && e.code;
      st.cloud = code === 'unavailable' || code === 'resource_exhausted' ? 'slow' : 'off';
    }
    clearTimeout(slow); changed();
  }

  const store = {
    get data() { return st.data; },
    get cloud() { return st.cloud; },
    // call after every change to the save
    commit() {
      st.data.savedAt = Date.now(); st.touched = true; writeLocal();
      if (doc && !dead) { clearTimeout(timer); timer = setTimeout(push, 1500); }   // a burst of changes (dragging a tuning slider) becomes one write
      changed();
    },
    flush() { if (timer && !writing) push(); },
    reset() { st.data = freshSave(); store.commit(); },
    // one plain sentence for the menu
    status() {
      const c = st.cloud;
      if (c === 'on') return 'Progress is saved to your account.';
      if (c === 'saving') return 'Saving progress to your account…';
      if (c === 'checking') return 'Looking for saved progress on your account…';
      if (st.local !== 'ok') return 'Progress cannot be saved in this browser window.';
      if (c === 'slow') return 'Your account is not answering yet. Progress is saved on this device for now.';
      if (c === 'full') return 'Account storage for this page is full. Progress is saved on this device.';
      return 'Progress is saved on this device.';
    },
    connect,
  };
  return store;
}
