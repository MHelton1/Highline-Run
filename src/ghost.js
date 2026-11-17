// Ghost car: the player's best run in each race, recorded ten times a second and played back as a see-through car.
// Kept in this browser only (a ghost is tens of kilobytes, too big for the account save). Pure math (runs in node).

export const GHOST_DT = 0.1;
const POS = 100, ROT = 32000;   // positions in centimetres, rotations in 1/32000ths

export class GhostRecorder {
  constructor(meta) { this.meta = meta; this.s = []; this.splits = []; this.next = 0; }
  // call at physics rate with the race clock; keeps one pose per tenth of a second
  sample(t, pos, quat) { while (t >= this.next) { this.s.push(pos.x, pos.y, pos.z, quat.x, quat.y, quat.z, quat.w); this.next += GHOST_DT; } }
  split(t) { this.splits.push(Math.round(t * 100) / 100); }
  get length() { return this.s.length / 7; }
}

const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b) => { const s = atob(b), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
const c16 = (v) => (v > 32767 ? 32767 : v < -32767 ? -32767 : v);

// a finished run as a string to store: header numbers plus position steps and rotations packed in 16 bits
export function encodeGhost(rec, time) {
  const n = rec.length, S = rec.s, q = new Int16Array(n * 7);
  let px = Math.round(S[0] * POS), py = Math.round(S[1] * POS), pz = Math.round(S[2] * POS);
  const x0 = px, y0 = py, z0 = pz;
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    // each step is measured from where the decoder will think the car was, so rounding never adds up
    const dx = c16(Math.round(S[o] * POS) - px), dy = c16(Math.round(S[o + 1] * POS) - py), dz = c16(Math.round(S[o + 2] * POS) - pz);
    q[o] = dx; q[o + 1] = dy; q[o + 2] = dz; px += dx; py += dy; pz += dz;
    for (let k = 3; k < 7; k++) q[o + k] = c16(Math.round(S[o + k] * ROT));
  }
  return JSON.stringify({ v: 1, ...rec.meta, time: Math.round(time * 100) / 100, splits: rec.splits, x0, y0, z0, n, d: toB64(new Uint8Array(q.buffer)) });
}

// back to poses: a Float32Array of n * 7 (x, y, z, qx, qy, qz, qw); null if the string is not a ghost
export function decodeGhost(str) {
  try {
    const g = JSON.parse(str); if (!g || g.v !== 1 || !g.n || typeof g.d !== 'string') return null;
    const u8 = fromB64(g.d); if (u8.length !== g.n * 14) return null;
    const q = new Int16Array(u8.buffer, u8.byteOffset, g.n * 7), out = new Float32Array(g.n * 7);
    let px = g.x0, py = g.y0, pz = g.z0;
    for (let i = 0; i < g.n; i++) {
      const o = i * 7; px += q[o]; py += q[o + 1]; pz += q[o + 2];
      out[o] = px / POS; out[o + 1] = py / POS; out[o + 2] = pz / POS;
      for (let k = 3; k < 7; k++) out[o + k] = q[o + k] / ROT;
    }
    return { ...g, d: undefined, poses: out };
  } catch (_) { return null; }
}

// where the ghost is at race time t: writes into pos {x,y,z} and quat {x,y,z,w}; returns false once its run is over
export function ghostAt(g, t, pos, quat) {
  const P = g.poses, n = g.n, f = Math.max(0, t / GHOST_DT), i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), a = Math.min(1, f - i);
  const o = i * 7, p = j * 7;
  pos.x = P[o] + (P[p] - P[o]) * a; pos.y = P[o + 1] + (P[p + 1] - P[o + 1]) * a; pos.z = P[o + 2] + (P[p + 2] - P[o + 2]) * a;
  const s = P[o + 3] * P[p + 3] + P[o + 4] * P[p + 4] + P[o + 5] * P[p + 5] + P[o + 6] * P[p + 6] < 0 ? -1 : 1;   // the short way round
  let x = P[o + 3] + (s * P[p + 3] - P[o + 3]) * a, y = P[o + 4] + (s * P[p + 4] - P[o + 4]) * a, z = P[o + 5] + (s * P[p + 5] - P[o + 5]) * a, w = P[o + 6] + (s * P[p + 6] - P[o + 6]) * a;
  const l = Math.hypot(x, y, z, w) || 1; quat.x = x / l; quat.y = y / l; quat.z = z / l; quat.w = w / l;
  return f < n;
}

// browser storage, one ghost per event; every call is safe when storage is missing or full
const KEY = (id) => 'highline.ghost.' + id;
export function loadGhost(id) { try { const s = globalThis.localStorage && localStorage.getItem(KEY(id)); return s ? decodeGhost(s) : null; } catch (_) { return null; } }
export function saveGhost(id, str) { try { localStorage.setItem(KEY(id), str); return true; } catch (_) { return false; } }
export function clearGhosts() { try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('highline.ghost.')) localStorage.removeItem(k); } } catch (_) {} }
