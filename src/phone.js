// Phone extras: steering by tilting the phone, a short buzz on crashes and landings, and keeping the screen awake while
// driving. Each one checks what the browser allows and quietly does nothing where it is not available.

// ---- tilt steering ----
// The phone's sense of gravity, turned into the screen's own left-right axis whichever way up the phone is held. A tilt
// of TILT_FULL degrees is full lock; small tilts near level are ignored. Browsers disagree about the sign of the gravity
// reading, so it is checked against the screen: a phone held to be looked at faces upward, which fixes the sign.
export const TILT_FULL = 24, TILT_DEAD = 2.5;
export function tiltSteer(gx, gy, gz, angle, sign = 1) {
  const a = (angle || 0) * Math.PI / 180, sx = (gx * Math.cos(a) - gy * Math.sin(a)) * sign;
  const g = Math.hypot(gx, gy, gz) || 9.81, deg = Math.asin(Math.max(-1, Math.min(1, sx / g))) * 180 / Math.PI;
  const m = Math.max(0, Math.abs(deg) - TILT_DEAD) / (TILT_FULL - TILT_DEAD);
  return Math.sign(deg) * Math.min(1, m);           // positive steers left (tilting the left side down), like the keys
}

export function createTilt() {
  const st = { on: false, steer: 0, live: false, sign: 0, zSum: 0, zN: 0 };
  const angle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : typeof window.orientation === 'number' ? window.orientation : 0);
  const onMotion = (e) => {
    const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
    st.live = true;
    // the first readings settle the sign: screen facing up means z points up in this browser's terms
    if (st.zN < 20) { st.zSum += g.z; st.zN++; st.sign = st.zSum >= 0 ? 1 : -1; }
    const raw = tiltSteer(g.x, g.y, g.z, angle(), st.sign);
    st.steer += (raw - st.steer) * 0.35;           // a little smoothing against hand shake
  };
  // must be called from a tap: iPhones ask for permission first. Resolves true when readings arrive.
  st.enable = async () => {
    try {
      const DM = window.DeviceMotionEvent;
      if (!DM) return false;
      if (typeof DM.requestPermission === 'function') { const r = await DM.requestPermission(); if (r !== 'granted') return false; }
      addEventListener('devicemotion', onMotion); st.on = true; st.live = false; st.zSum = 0; st.zN = 0;
      await new Promise((r) => setTimeout(r, 1200));
      if (!st.live) { st.disable(); return false; }
      return true;
    } catch (_) { st.disable(); return false; }
  };
  st.disable = () => { removeEventListener('devicemotion', onMotion); st.on = false; st.steer = 0; };
  return st;
}

// ---- vibration ----
export const canBuzz = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export function buzz(pattern) { try { if (canBuzz()) navigator.vibrate(pattern); } catch (_) {} }

// ---- keep the screen awake while driving ----
export function createWake() {
  let lock = null, want = false;
  const get = async () => {
    if (!want || lock || document.visibilityState !== 'visible') return;
    try { if (navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (_) { lock = null; }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') get(); });
  return {
    set(on) { want = on; if (on) get(); else if (lock) { lock.release().catch(() => {}); lock = null; } },
    get held() { return !!lock; },
  };
}
