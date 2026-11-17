// Championships: one cup in each region, three rounds back to back (the Grand Prix, the dirt sprint and the two-lap
// Double) against the same three rival teams, with points for every finish. The best total after round three wins the
// cup's purse and a trophy. Winning the cup in every region earns a car that is not for sale. Pure math (runs in node).
import { LEVELS } from './race.js';

export const CUP_ROUNDS = ['ring', 'dash', 'double'];          // events by their mountain id (def.base)
export const POINTS = [10, 6, 3, 1];
export const PURSE = [6000, 3000, 1500, 500];
export const TROPHY = ['Gold', 'Silver', 'Bronze', 'No'];
export const CUP_CAR = 'champ';
export const CUP_NAME = { mountain: 'Highline Cup', desert: 'Redrock Cup', coast: 'Saltcliff Cup' };
export const purse = (place, level = 1) => Math.round(PURSE[place - 1] * LEVELS[level].prize / 50) * 50;

// the three rival teams: the Grand Prix's grid keeps its numbers and colours all the way through the cup
export const cupTeams = (races) => { const gp = races.find((d) => d.base === 'ring'); return gp.rivals.map((r) => ({ num: r.num, paint: r.paint })); };

// round k (0..2) as a race: that event with the cup's teams on the grid (each team drives the event's own car for it)
export function cupRound(races, region, k) {
  const teams = cupTeams(races), def = races.find((d) => d.base === CUP_ROUNDS[k]);
  return { ...def, cup: { region, round: k, name: CUP_NAME[region] || 'Cup' }, rivals: def.rivals.map((r, i) => ({ ...r, num: teams[i].num, paint: teams[i].paint })) };
}

// a fresh cup in the save
export const newCup = (region, level, teams) => ({ r: region, lv: level, round: 0, pts: { you: 0, ...Object.fromEntries(teams.map((t) => [t.num, 0])) } });

// points from one round's finishing order (race.result.table: { you } or { num }); moves the cup to the next round
export function scoreRound(cup, table) {
  const got = {};
  table.forEach((row, i) => { const key = row.you ? 'you' : String(row.num); got[key] = POINTS[i] || 0; cup.pts[key] = (cup.pts[key] || 0) + got[key]; });
  cup.round++;
  return got;
}

// the cup table, most points first; on a tie the player is ahead (the home driver's benefit), then by number
export function cupTable(cup) {
  return Object.entries(cup.pts).map(([k, p]) => ({ you: k === 'you', num: k === 'you' ? null : +k, pts: p })).sort((a, b) => b.pts - a.pts || (b.you - a.you) || a.num - b.num);
}
export const cupPlace = (cup) => cupTable(cup).findIndex((r) => r.you) + 1;
export const cupOver = (cup) => cup.round >= CUP_ROUNDS.length;

// checks a cup read back from a save; null if it is not a usable cup
export function cleanCup(raw, regions) {
  if (!raw || typeof raw !== 'object' || !regions.includes(raw.r)) return null;
  const lv = [0, 1, 2, 3].includes(raw.lv) ? raw.lv : 1, round = [0, 1, 2].includes(raw.round) ? raw.round : null;
  if (round == null || !raw.pts || typeof raw.pts !== 'object') return null;
  const pts = {};
  for (const [k, v] of Object.entries(raw.pts).slice(0, 4)) if ((k === 'you' || /^\d{1,3}$/.test(k)) && typeof v === 'number' && v >= 0 && v <= 30) pts[k] = Math.round(v);
  return pts.you != null && Object.keys(pts).length === 4 ? { r: raw.r, lv, round, pts } : null;
}
