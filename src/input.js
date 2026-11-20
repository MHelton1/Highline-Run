// Keyboard, gamepad and touch merged into one input state. While a menu is open the same devices move a highlight instead.
export function createInput(touchRoot, canvas) {
  const keys = new Set(), touch = { left: 0, right: 0, gas: 0, brake: 0, hand: 0, nitro: 0 };
  const state = { steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false, analog: false, pad: false };
  const held = new Set(), listeners = {};
  let menu = false, navDir = '', navT = 0;
  const fire = (name, a, b) => { if (listeners[name]) listeners[name](a, b); };
  const actions = { KeyR: 'reset', KeyF: 'flip', KeyC: 'camera', KeyM: 'mute', KeyN: 'music', KeyT: 'time', KeyU: 'units', KeyO: 'photo', KeyG: 'map', KeyE: 'action', Enter: 'action', Escape: 'pause', KeyP: 'pause' };
  const NAV = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (menu) {
      const t = document.activeElement, slider = t && t.type === 'range', n = NAV[e.code];
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); if (!e.repeat) fire('pause'); }
      else if (n) { if (slider && n[0]) return; e.preventDefault(); fire('nav', n[0], n[1]); }          // a slider keeps its own left and right
      else if (e.code === 'Enter' && !(t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT'))) { e.preventDefault(); fire('accept'); }
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat && actions[e.code]) fire(actions[e.code]);
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  // ---- touch controls ----
  // Every finger on the glass is tracked, and at each moment it presses whichever control is under it. That way fingers
  // work independently of each other, a thumb can slide from one control to its neighbour without lifting, and a near
  // miss still counts. Touch events are used where the browser has them: cancelling them is the one thing every phone
  // respects when it would otherwise treat two thumbs as a pinch, a scroll, a double-tap zoom or a text selection.
  // Pointer events cover mice, pens and browsers without touch events.
  const pads = touchRoot ? [...touchRoot.querySelectorAll('[data-t]')].map((el) => ({ el, k: el.dataset.t, hold: el.dataset.t in touch, big: el.classList.contains('big'), r: null, hit: false })) : [];
  const fingers = new Map();          // finger id -> { x, y, first: the control it landed on }
  const shown = () => {               // measure the controls; false while they are hidden (a menu is open)
    if (!pads.length) return false;
    const box = touchRoot.getBoundingClientRect();
    for (const p of pads) {
      const b = p.el.getBoundingClientRect();
      if (!b.width) { p.r = null; continue; }
      const r = { l: b.left, r: b.right, t: b.top, b: b.bottom, slack: p.hold ? Math.max(18, b.width * 0.28) : 0 };
      // the big controls reach to the edges of the screen, where thumbs tend to land
      if (p.big) { r.b = Math.max(r.b, box.bottom); if (r.l - box.left < 70) r.l = box.left; if (box.right - r.r < 70) r.r = box.right; }
      p.r = r;
    }
    return !!pads[0].r;
  };
  const padAt = (x, y) => {           // the control under a point: the one whose edge is nearest, within its slack
    let best = null, bd = 1e9;
    for (const p of pads) {
      if (!p.r) continue;
      const d = Math.hypot(Math.max(p.r.l - x, 0, x - p.r.r), Math.max(p.r.t - y, 0, y - p.r.b));
      if (d <= p.r.slack && d < bd) { bd = d; best = p; }
    }
    return best;
  };
  const apply = () => {
    for (const k in touch) touch[k] = 0;
    for (const p of pads) p.hit = false;
    for (const f of fingers.values()) { const p = padAt(f.x, f.y); if (p && (p.hold || p === f.first)) { p.hit = true; if (p.hold) touch[p.k] = 1; } }
    for (const p of pads) p.el.classList.toggle('on', p.hit);
  };
  const land = (id, x, y) => {        // a new finger: buttons that act once (road, flip, camera) fire when it lands on them
    const p = padAt(x, y);
    fingers.set(id, { x, y, first: p });
    if (p && !p.hold) fire(p.k);
  };
  const dropAll = () => { if (fingers.size) { fingers.clear(); apply(); } };
  const isUi = (el) => !!(el && el.closest && el.closest('button, input, select, textarea, a'));
  const touchEv = typeof window !== 'undefined' && 'ontouchstart' in window;
  if (pads.length) {
    const heal = (e) => {              // forget fingers the browser no longer reports, so a lost "finger up" cannot leave a control stuck
      const live = new Set(); for (const t of e.touches) live.add('t' + t.identifier);
      for (const id of fingers.keys()) if (id[0] === 't' && !live.has(id)) fingers.delete(id);
    };
    const tStart = (e) => {
      if (!shown()) return;                                        // controls hidden: leave the page alone
      heal(e);
      let mine = false;
      for (const t of e.changedTouches) { if (isUi(t.target)) continue; land('t' + t.identifier, t.clientX, t.clientY); mine = true; }
      if (mine && e.cancelable) e.preventDefault();
      apply();
    };
    const tMove = (e) => {
      let mine = false;
      for (const t of e.changedTouches) { const f = fingers.get('t' + t.identifier); if (f) { f.x = t.clientX; f.y = t.clientY; mine = true; } }
      if (mine) { if (e.cancelable) e.preventDefault(); apply(); }
    };
    const tEnd = (e) => {
      let mine = false;
      for (const t of e.changedTouches) if (fingers.delete('t' + t.identifier)) mine = true;
      heal(e);
      if (mine && e.cancelable) e.preventDefault();
      apply();
    };
    const opt = { passive: false };
    for (const el of [touchRoot, canvas].filter(Boolean)) {
      el.addEventListener('touchstart', tStart, opt); el.addEventListener('touchmove', tMove, opt);
      el.addEventListener('touchend', tEnd, opt); el.addEventListener('touchcancel', tEnd, opt);
      el.addEventListener('contextmenu', (e) => { if (shown()) e.preventDefault(); });
    }
    // Safari's own two-finger gesture events
    for (const g of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(g, (e) => { if (shown()) e.preventDefault(); }, opt);
    // mouse, pen, and touch in browsers without touch events: only a press that starts on a control counts
    const pid = (e) => 'p' + e.pointerId, skip = (e) => e.pointerType === 'touch' && touchEv;
    addEventListener('pointerdown', (e) => {
      if (skip(e) || isUi(e.target) || !shown()) return;
      if (!padAt(e.clientX, e.clientY)) return;
      e.preventDefault(); land(pid(e), e.clientX, e.clientY); apply();
    });
    addEventListener('pointermove', (e) => { const f = fingers.get(pid(e)); if (f) { f.x = e.clientX; f.y = e.clientY; apply(); } });
    const pUp = (e) => { if (fingers.delete(pid(e))) apply(); };
    addEventListener('pointerup', pUp); addEventListener('pointercancel', pUp);
    addEventListener('blur', dropAll); document.addEventListener('visibilitychange', () => { if (document.hidden) dropAll(); });
  }
  // ---- taps on buttons ----
  // A phone only turns a touch into a click when it is the only finger on the glass. With a thumb still resting on the
  // brake, a tap on "Start race" or on the menu button would do nothing. So a touch that starts and ends on a button
  // without moving is clicked here, whatever the other fingers are doing, and the phone's own click for it is dropped.
  if (touchEv && typeof document !== 'undefined') {
    const taps = new Map(), cap = { passive: true, capture: true };
    let ghost = { x: 0, y: 0, t: -1e9 };
    const btnOf = (el) => (el && el.closest ? el.closest('button, a[href], [role="button"]') : null);
    document.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) { const b = btnOf(t.target); if (b && !b.disabled) taps.set(t.identifier, { b, x: t.clientX, y: t.clientY }); } }, cap);
    document.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { const q = taps.get(t.identifier); if (q && Math.hypot(t.clientX - q.x, t.clientY - q.y) > 14) taps.delete(t.identifier); } }, cap);
    document.addEventListener('touchcancel', (e) => { for (const t of e.changedTouches) taps.delete(t.identifier); }, cap);
    document.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        const q = taps.get(t.identifier); if (!q) continue;
        taps.delete(t.identifier);
        if (!q.b.isConnected || q.b.disabled || btnOf(document.elementFromPoint(t.clientX, t.clientY)) !== q.b) continue;
        if (e.cancelable) e.preventDefault();
        ghost = { x: t.clientX, y: t.clientY, t: performance.now() };
        q.b.click();
      }
    }, { passive: false, capture: true });
    // if the phone sends its own click for that tap anyway, it must not count twice
    document.addEventListener('click', (e) => { if (e.isTrusted && performance.now() - ghost.t < 700 && Math.hypot(e.clientX - ghost.x, e.clientY - ghost.y) < 40) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }
  // gamepad buttons: Y road, X flip, B camera, Start menu, D-pad up to use a garage or race start; in menus A picks and B goes back
  const DRIVE = { 3: 'reset', 2: 'flip', 1: 'camera', 9: 'pause', 12: 'action', 8: 'map' }, MENU = { 0: 'accept', 1: 'back', 9: 'pause' };
  const dz = (v) => Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88;
  state.on = (name, fn) => { listeners[name] = fn; };
  state.fire = fire;
  Object.defineProperty(state, 'menu', { get: () => menu, set(v) { menu = !!v; if (menu) { keys.clear(); fingers.clear(); apply(); } } });
  state.poll = (now = performance.now()) => {
    const k = (c) => keys.has(c) ? 1 : 0;
    let steer = (k('KeyA') || k('ArrowLeft') || touch.left) - (k('KeyD') || k('ArrowRight') || touch.right);
    let thr = k('KeyW') || k('ArrowUp') || touch.gas, brk = k('KeyS') || k('ArrowDown') || touch.brake, hb = !!(k('Space') || touch.hand), nos = !!(k('ShiftLeft') || k('ShiftRight') || k('KeyB') || touch.nitro), analog = false;
    // tilt steering (phones, when switched on): the steering arrows still win while a thumb is on one
    const T = state.tilt;
    if (T && T.on && !touch.left && !touch.right && !menu) { steer = Math.sign(T.steer) * Math.pow(Math.abs(T.steer), 1.3); analog = true; }
    let gp = null;
    try { for (const p of navigator.getGamepads ? navigator.getGamepads() : []) if (p && p.connected) { gp = p; break; } } catch (_) {}
    state.pad = !!gp;
    if (gp) {
      const b = (i) => gp.buttons[i] ? gp.buttons[i].value : 0, map = menu ? MENU : DRIVE;
      for (let i = 0; i < 16; i++) {       // act on a fresh press only, so a button held while a menu opens does nothing there
        if (b(i) <= 0.5) { held.delete(i); continue; }
        if (held.has(i)) continue;
        held.add(i);
        if (map[i]) fire(map[i]); else if (menu && (i === 4 || i === 5)) fire('tab', i === 4 ? -1 : 1);
      }
      if (menu) {
        const sx = gp.axes[0] || 0, sy = gp.axes[1] || 0;
        const dx = b(14) > 0.5 || sx < -0.6 ? -1 : b(15) > 0.5 || sx > 0.6 ? 1 : 0, dy = b(12) > 0.5 || sy < -0.6 ? -1 : b(13) > 0.5 || sy > 0.6 ? 1 : 0, dir = dx + ',' + dy;
        if (!dx && !dy) navDir = '';
        else if (dir !== navDir) { navDir = dir; navT = now + 380; fire('nav', dx, dy); }
        else if (now > navT) { navT = now + 130; fire('nav', dx, dy); }
      } else {
        const sx = dz(gp.axes[0] || 0);
        if (sx) { steer = -Math.sign(sx) * Math.pow(Math.abs(sx), 1.6); analog = true; }
        thr = Math.max(thr, b(7)); brk = Math.max(brk, b(6)); if (b(0) > 0.5 || b(5) > 0.5) hb = true; if (b(4) > 0.5) nos = true;
        if (b(14) > 0.5) steer = 1; if (b(15) > 0.5) steer = -1;
      }
    }
    if (menu) { steer = thr = brk = 0; hb = nos = false; }
    state.steer = steer; state.throttle = thr; state.brake = brk; state.handbrake = hb; state.nitro = nos; state.analog = analog;
    return state;
  };
  return state;
}
