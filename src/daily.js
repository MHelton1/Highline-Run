// The daily challenge: one task a day, the same for everyone on that date, in the region being driven. Doing it pays a
// reward that grows with a streak of days in a row. No rendering (runs in node for tests).
import { REGIONS } from './regions.js';

export const DAILY_PAY = 3000, STREAK_STEP = 500, STREAK_MAX = 6;

// the day as YYYY-MM-DD in the player's own time zone
export const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayNum = (key) => Math.round(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 864e5);
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// what can be asked: kind, how much, and the words
const KINDS = [
  { kind: 'deliver', need: [2, 3], text: (n, r) => `Make ${n} deliveries in ${r}` },
  { kind: 'drift', need: [800, 1000, 1200, 1500], text: (n, r) => `Score ${n.toLocaleString('en-US')} in one drift in ${r}` },
  { kind: 'trap', need: [75, 80, 85, 90], text: (n, r) => `Pass a speed trap in ${r} at ${n} mph or more` },
  { kind: 'air', need: [1.2, 1.4, 1.6], text: (n, r) => `Stay in the air for ${n} seconds in ${r}` },
  { kind: 'hot', need: [1], text: (n, r) => `Deliver a Hot load in ${r}` },
  { kind: 'race', need: [1, 2], text: (n, r) => n === 1 ? `Win any race in ${r}` : `Finish any race in ${r} in the top 2` },
];

// today's challenge for a region
export function dailyFor(key, region) {
  const h = hash(key + ':' + region), k = KINDS[h % KINDS.length], need = k.need[(h >>> 8) % k.need.length];
  return { id: key + ':' + region, day: key, region, kind: k.kind, need, text: k.text(need, REGIONS[region] ? REGIONS[region].name : region) };
}

// keep the saved daily record tidy: { day, region, have, done, streak, last }
export function cleanDaily(raw) {
  const d = { day: '', region: '', have: 0, done: false, streak: 0, last: '' };
  if (!raw || typeof raw !== 'object') return d;
  if (typeof raw.day === 'string' && /^\d{4}-\d\d-\d\d$/.test(raw.day)) d.day = raw.day;
  if (typeof raw.region === 'string' && REGIONS[raw.region]) d.region = raw.region;
  d.have = Math.max(0, Math.min(1e6, +raw.have || 0)); d.done = raw.done === true;
  d.streak = Math.max(0, Math.min(999, Math.round(+raw.streak || 0)));
  if (typeof raw.last === 'string' && /^\d{4}-\d\d-\d\d$/.test(raw.last)) d.last = raw.last;
  return d;
}

// make sure the record is for today and this region (progress resets when either changes; the streak only by days)
export function rollDaily(rec, key, region) {
  if (rec.day !== key || rec.region !== region) { rec.day = key; rec.region = region; rec.have = 0; rec.done = rec.last === key; }
  return dailyFor(key, region);
}

export const streakPay = (streak) => DAILY_PAY + STREAK_STEP * Math.min(STREAK_MAX, Math.max(0, streak - 1));

// something happened: { kind, value } (a delivery is value 1, a drift its score, a trap its mph, air its seconds,
// a race its place). Returns the reward when this completes today's challenge, else 0.
export function dailyEvent(rec, ch, kind, value) {
  if (rec.done || rec.last === rec.day || ch.kind !== kind) return 0;
  if (ch.kind === 'deliver') rec.have += 1;
  else if (ch.kind === 'race') { if (value > ch.need) return 0; rec.have = 1; }
  else if (ch.kind === 'hot') rec.have += 1;
  else rec.have = Math.max(rec.have, value);
  const goal = ch.kind === 'race' || ch.kind === 'hot' ? 1 : ch.need;
  if (rec.have < goal) return 0;
  const yesterday = rec.last && dayNum(rec.day) - dayNum(rec.last) === 1;
  rec.streak = yesterday ? rec.streak + 1 : 1; rec.last = rec.day; rec.done = true;
  return streakPay(rec.streak);
}

// progress words for the card: "1 of 3", "best 940"
export function dailyProgress(rec, ch) {
  if (rec.done || rec.last === rec.day) return 'Done';
  if (ch.kind === 'deliver') return `${Math.min(rec.have, ch.need)} of ${ch.need}`;
  if (ch.kind === 'drift') return rec.have ? `Best today ${Math.round(rec.have).toLocaleString('en-US')}` : 'Not yet';
  if (ch.kind === 'trap') return rec.have ? `Best today ${rec.have} mph` : 'Not yet';
  if (ch.kind === 'air') return rec.have ? `Best today ${rec.have.toFixed(1)} s` : 'Not yet';
  return 'Not yet';
}
