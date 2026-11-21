// Two players, one screen: a head-to-head race on any of the region's events, no rival cars and no prize money.
// Each player has their own checkpoints and laps; the race ends when both are home, or 25 s after the first finisher.
// No rendering (runs in node for tests).
import { collideCars } from './vehicle.js';

export const DUEL_HOLD = { steer: 0, throttle: 0, brake: 0, handbrake: true, analog: true };
const COOL = { steer: 0, throttle: 0, brake: 0.45, handbrake: false, analog: true };
export const DUEL_GRACE = 25;       // seconds the second player has after the first one finishes
export const P_NAMES = ['Player 1', 'Player 2'];

export class Duel {
  constructor(world, def, cars) {
    this.world = world; this.def = def; this.cars = cars; this.events = [];
    this.state = 'count'; this.count = 3.4; this.shown = 4; this.clock = 0; this.bump = [0, 0]; this.firstAt = null;
    this.gates = def.gates; this.laps = def.laps || 1;
    this.players = cars.map((car) => ({ car, gate: 0, lap: 0, time: null }));
    const p = def.path;
    if (p) {      // side by side on the grid, a little behind the line
      const f = p.at(def.startIdx - Math.round(8 / p.ds)), lat = Math.min(2.3, p.hw - 1.7);
      cars.forEach((c, i) => { const l = i ? -lat : lat; c.place(f.x + f.tz * l, f.z - f.tx * l, f.yaw); });
    } else {
      const s = def.start, tx = Math.cos(s.yaw), tz = -Math.sin(s.yaw);
      cars.forEach((c, i) => { const l = i ? -2.6 : 2.6; c.place(s.x + tx * l, s.z + tz * l, s.yaw); });
    }
  }
  emit(type, data) { this.events.push({ type, ...data }); }
  next(i) { const pl = this.players[i]; return pl.time != null ? null : this.gates[pl.gate]; }
  // what player i's car is given: held on the grid, their own input while racing, then braked to a stop after the flag
  input(i, inp) {
    const pl = this.players[i];
    if (this.state === 'count') return DUEL_HOLD;
    if (pl.time != null || this.state === 'done') return pl.car.vel.dot(pl.car.fwd) > 3 ? COOL : DUEL_HOLD;
    return inp;
  }
  step(dt) {    // physics rate, after both cars have stepped
    const h = collideCars(this.cars[0], this.cars[1]); if (h > 3) { this.bump[0] = Math.max(this.bump[0], h); this.bump[1] = Math.max(this.bump[1], h); }
    if (this.state === 'count') return;
    this.clock += dt;
    if (this.state !== 'run') return;
    this.players.forEach((pl, i) => {
      if (pl.time != null) return;
      const g = this.gates[pl.gate], p = pl.car.pos;
      if ((p.x - g.x) ** 2 + (p.z - g.z) ** 2 >= g.r * g.r) return;
      pl.gate++;
      const lapDone = pl.gate >= this.gates.length;
      if (lapDone) { pl.lap++; pl.gate = 0; }
      if (lapDone && pl.lap >= this.laps) {
        pl.time = this.clock; if (this.firstAt == null) this.firstAt = this.clock;
        this.emit('home', { who: i, time: pl.time, place: this.players.filter((q) => q.time != null).length });
      } else this.emit('gate', { who: i, n: lapDone ? this.gates.length : pl.gate, of: this.gates.length, lap: pl.lap });
    });
    const all = this.players.every((q) => q.time != null);
    if (all || (this.firstAt != null && this.clock - this.firstAt > DUEL_GRACE)) this.finish();
  }
  update(dt) {  // once per frame
    if (this.state !== 'count') return;
    this.count -= dt; const c = Math.ceil(this.count);
    if (c !== this.shown && c >= 1 && c <= 3) { this.shown = c; this.emit('count', { n: c }); }
    if (this.count <= 0) { this.state = 'run'; this.emit('go', {}); }
  }
  // how far along player i is: checkpoints passed, then closeness to the next one
  progress(i) {
    const pl = this.players[i]; if (pl.time != null) return 1e9 - pl.time;
    const g = this.gates[pl.gate], d = Math.hypot(pl.car.pos.x - g.x, pl.car.pos.z - g.z);
    return (pl.lap * this.gates.length + pl.gate) * 1e4 - d;
  }
  // 1 or 2 for each player
  places() { const a = this.progress(0), b = this.progress(1); return a >= b ? [1, 2] : [2, 1]; }
  finish() {
    if (this.state === 'done') return;
    this.state = 'done';
    const pl = this.places(), winner = pl[0] === 1 ? 0 : 1;
    this.result = { winner, times: this.players.map((q) => q.time), gap: this.players.every((q) => q.time != null) ? Math.abs(this.players[0].time - this.players[1].time) : null };
    this.emit('finish', this.result);
  }
  // back onto the course at player i's last checkpoint, facing the next one
  resetPlayer(i) {
    const d = this.def, startAt = d.start || (d.path ? d.path.at(d.startIdx) : this.gates[0]);
    const pl = this.players[i], from = pl.gate ? this.gates[pl.gate - 1] : (pl.lap ? this.gates[this.gates.length - 1] : startAt), to = this.gates[pl.gate];
    pl.car.place(from.x, from.z, Math.atan2(to.x - from.x, to.z - from.z));
  }
}
