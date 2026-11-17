// Saved-progress checks: repair of bad data, and which copy wins when the browser and the account disagree.
import assert from 'node:assert/strict';
import { cleanSave, freshSave, worth, createStore } from '../src/save.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeBrowser(local = {}) {
  const m = new Map(Object.entries(local));
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  return m;
}
// a stand-in for the page database: one private document, counts writes, can fail on demand
function fakeAccount({ doc = null, uid = 'u_test', fail = [] } = {}) {
  const log = { sets: 0, gets: 0, inFlight: 0, maxInFlight: 0, doc };
  const ref = {
    get: async () => { log.gets++; await wait(5); return { exists: log.doc != null, data: () => log.doc }; },
    set: async (body) => { log.sets++; log.inFlight++; log.maxInFlight = Math.max(log.maxInFlight, log.inFlight); await wait(20); log.inFlight--; const f = fail.shift(); if (f) throw { code: f, message: f }; log.doc = body; },
  };
  globalThis.window = { claude: { use: async (n) => (n === 'db' ? { doc: (p) => { log.path = p; return ref; } } : n === 'user' ? { id: async () => uid } : null) } };
  return log;
}

// ---- repair ----
{
  assert.equal(cleanSave({}).music, true); assert.equal(cleanSave({ music: false }).music, false); assert.equal(cleanSave({ music: 'no' }).music, true);
  assert.equal(cleanSave({}).tod, 'day'); assert.equal(cleanSave({ tod: 'night' }).tod, 'night'); assert.equal(cleanSave({ tod: 'noon' }).tod, 'day');
}
{
  const s = cleanSave({ cash: -50, runs: 'lots', car: 'tank', cars: { hatch: { up: [9, -1, 2.4, 'x'], tune: { gear: 5, tc: -3 }, paint: 99 }, tank: { up: [3, 3, 3, 3] }, coupe: { up: [1, 0, 0, 0] } }, best: { ring: 181.2, 'bad key!': 3, dash: -4 }, rank: { ring: 1 }, units: 'metric', savedAt: 12 });
  assert.equal(s.cash, 0); assert.equal(s.runs, 0); assert.equal(s.car, 'hatch');
  assert.deepEqual(s.cars.hatch.up, [3, 0, 2, 0]); assert.equal(s.cars.hatch.tune.gear, 1); assert.equal(s.cars.hatch.tune.tc, 0); assert.equal(s.cars.hatch.paint, 9);
  assert.ok(!('tank' in s.cars)); assert.deepEqual(s.cars.coupe.up, [1, 0, 0, 0]);
  assert.deepEqual(s.best, { ring: 181.2 }); assert.deepEqual(s.rank, { ring: 1 }); assert.equal(s.units, 'metric');
  assert.deepEqual(cleanSave(null), freshSave()); assert.deepEqual(cleanSave('junk'), freshSave());
  assert.equal(cleanSave({ car: '__proto__' }).car, 'hatch');
  assert.ok(worth(s) > worth(freshSave()));
  // race difficulty, and results kept per difficulty under the event's id plus a letter
  assert.equal(s.level, 1); assert.equal(cleanSave({ level: 2 }).level, 2); assert.equal(cleanSave({ level: 0 }).level, 0);
  assert.equal(cleanSave({ level: 9 }).level, 2); assert.equal(cleanSave({ level: 'hard' }).level, 1); assert.equal(cleanSave({ level: 1.4 }).level, 1);
  assert.deepEqual(cleanSave({ rank: { ring: 2, ringh: 1, ringe: 1, doubleh: 3 } }).rank, { ring: 2, ringh: 1, ringe: 1, doubleh: 3 });
}

// ---- a first visit with nothing saved anywhere: nothing is written until something changes ----
{
  fakeBrowser(); const acct = fakeAccount();
  const store = createStore(); await store.connect();
  assert.equal(store.cloud, 'on'); assert.equal(acct.sets, 0); assert.equal(acct.path, 'data/users/u_test/save');
  store.data.cash = 500; store.commit(); store.data.cash = 900; store.commit(); store.data.cash = 1200; store.commit();
  store.flush(); await wait(80);
  assert.equal(acct.sets, 1, 'a burst of changes is one write'); assert.equal(acct.doc.cash, 1200); assert.equal(acct.maxInFlight, 1);
  store.flush(); await wait(40); assert.equal(acct.sets, 1, 'nothing new, nothing written');
}

// ---- build 2 progress in this browser is carried over and sent to the account ----
{
  const m = fakeBrowser({ highline: JSON.stringify({ cash: 4300, runs: 6 }), units: 'metric' }); const acct = fakeAccount();
  const store = createStore(); assert.equal(store.data.cash, 4300); assert.equal(store.data.units, 'metric');
  await store.connect(); await wait(60);
  assert.equal(acct.doc.cash, 4300); assert.equal(acct.doc.runs, 6);
  store.data.cash += 100; store.commit(); assert.equal(JSON.parse(m.get('highline.save')).cash, 4400);
}

// ---- the account is ahead of this browser: the account wins ----
{
  const remote = { ...freshSave(), cash: 9000, savedAt: 5000 }; remote.cars.coupe = { up: [1, 0, 0, 0], tune: {}, paint: 4 }; remote.car = 'coupe';
  const m = fakeBrowser({ 'highline.save': JSON.stringify({ ...freshSave(), cash: 100, savedAt: 1000 }) }); const acct = fakeAccount({ doc: remote });
  let got = null; const store = createStore({ onRemote: (d) => { got = d; } });
  assert.equal(store.data.cash, 100);
  await store.connect();
  assert.equal(store.data.cash, 9000); assert.equal(store.data.car, 'coupe'); assert.ok(got); assert.equal(acct.sets, 0);
  assert.equal(JSON.parse(m.get('highline.save')).cash, 9000);
}

// ---- this browser is ahead: it is sent up ----
{
  fakeBrowser({ 'highline.save': JSON.stringify({ ...freshSave(), cash: 700, savedAt: 9000 }) }); const acct = fakeAccount({ doc: { ...freshSave(), cash: 50, savedAt: 2000 } });
  const store = createStore(); await store.connect(); await wait(60);
  assert.equal(store.data.cash, 700); assert.equal(acct.doc.cash, 700);
}

// ---- both changed (the player started driving before the account answered): the richer save is kept ----
{
  fakeBrowser(); const acct = fakeAccount({ doc: { ...freshSave(), cash: 25000, savedAt: 5000 } });
  const store = createStore(); store.data.cash = 300; store.commit();
  await store.connect();
  assert.equal(store.data.cash, 25000, 'hours of play on the account beat a few minutes here');
  fakeBrowser({ 'highline.save': JSON.stringify({ ...freshSave(), cash: 25000, savedAt: 1000 }) }); const acct2 = fakeAccount({ doc: { ...freshSave(), cash: 40, savedAt: 5000 } });
  const store2 = createStore(); store2.data.cash += 300; store2.commit();
  await store2.connect(); await wait(60);
  assert.equal(store2.data.cash, 25300); assert.equal(acct2.doc.cash, 25300);
}

// ---- a viewer who may not write: one refused write, then quiet for the visit ----
{
  fakeBrowser(); const acct = fakeAccount({ fail: ['invalid_argument'] });
  const store = createStore(); await store.connect();
  store.data.cash = 10; store.commit(); store.flush(); await wait(60);
  assert.equal(store.cloud, 'readonly'); assert.equal(acct.sets, 1);
  store.data.cash = 20; store.commit(); store.flush(); await wait(60);
  assert.equal(acct.sets, 1); assert.match(store.status(), /on this device/);
}

// ---- a passing outage: one retry, and it lands ----
{
  fakeBrowser(); const acct = fakeAccount({ fail: ['unavailable'] });
  const store = createStore(); await store.connect();
  store.data.cash = 10; store.commit(); store.flush(); await wait(2600);
  assert.equal(acct.sets, 2); assert.equal(acct.doc.cash, 10); assert.equal(store.cloud, 'on');
}

// ---- signed out, or opened outside the viewer: this browser only ----
{
  fakeBrowser(); fakeAccount({ uid: null });
  const store = createStore(); await store.connect(); assert.equal(store.cloud, 'off'); assert.match(store.status(), /on this device/);
  globalThis.window = {}; const s2 = createStore(); await s2.connect(); assert.equal(s2.cloud, 'off');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const s3 = createStore(); await s3.connect(); s3.data.cash = 5; s3.commit(); assert.match(s3.status(), /cannot be saved/);
}
console.log('save: all checks passed');
