// Keyboard, gamepad and touch merged into one input state. While a menu is open the same devices move a highlight instead.
// Which keys and buttons do what comes from the player's bindings (see binds.js); the menu keys themselves are fixed.
import { defaultBinds, pressMap, styleOf, menuButtons } from './binds.js';
export function createInput(touchRoot, canvas) {
  const keys = new Set(), touch = { left: 0, right: 0, gas: 0, brake: 0, hand: 0, nitro: 0 };
  const state = { steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false, analog: false, pad: false };
  const held = new Set(), listeners = {};
  let menu = false, navDir = '', navT = 0;
  const fire = (name, a, b) => { if (listeners[name]) listeners[name](a, b); };
  let B = defaultBinds(), actions = {}, padPress = {}, p2Keys = new Set();
  const setBinds = (b) => { B = b; actions = pressMap(B.keys); actions.Escape = 'pause'; padPress = pressMap(B.pad); p2Keys = new Set(Object.values(B.p2).flat()); };
  setBinds(B);
  let capture = null;                 // waiting for a key or button to bind: { kind: 'key' | 'pad', done(value), armed, until }
  const endCapture = (v) => { const c = capture; capture = null; if (c) c.done(v); };
  const NAV = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  addEventListener('keydown', (e) => {
    if (capture) {                    // binding: Escape cancels, Delete clears, any other key is the new one
      e.preventDefault(); e.stopPropagation(); if (e.repeat) return;
      if (e.code === 'Escape') endCapture(undefined); else if (capture.kind === 'key') endCapture(e.code === 'Delete' ? null : e.code);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (menu) {
      const t = document.activeElement, slider = t && t.type === 'range', n = NAV[e.code];
      if (e.code === 'Escape' || actions[e.code] === 'pause') { e.preventDefault(); if (!e.repeat) fire('pause'); }
      else if (n) { if (slider && n[0]) return; e.preventDefault(); fire('nav', n[0], n[1]); }          // a slider keeps its own left and right
      else if (e.code === 'Enter' && !(t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT'))) { e.preventDefault(); fire('accept'); }
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Slash', 'Tab'].includes(e.code) || B.keys.gas.includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (state.duo && B.p2.reset.includes(e.code)) fire('reset2');
      else if (actions[e.code] && !(state.duo && p2Keys.has(e.code) && e.code !== 'Escape')) fire(actions[e.code]);
    }
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
  // gamepad buttons come from the bindings; in menus the face buttons pick and go back (A picks on Xbox and on Switch,
  // which sit in different places), the D-pad and left stick move, the shoulders change tabs
  const dz = (v) => Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88;
  state.on = (name, fn) => { listeners[name] = fn; };
  state.setBinds = setBinds; Object.defineProperty(state, 'binds', { get: () => B });
  state.padKind = () => { try { for (const p of navigator.getGamepads ? navigator.getGamepads() : []) if (p && p.connected) return styleOf(B.style, p.id); } catch (_) {} return styleOf(B.style, ''); };
  state.padName = () => { try { for (const p of navigator.getGamepads ? navigator.getGamepads() : []) if (p && p.connected) return p.id; } catch (_) {} return ''; };
  // wait for the next key (kind 'key') or controller button (kind 'pad'); done(value) gets the code or button number,
  // null to clear the slot, or undefined if cancelled (Escape, or 6 s with no button)
  state.capture = (kind, done) => { endCapture(undefined); capture = { kind, done, armed: false, until: performance.now() + 6000 }; keys.clear(); };
  state.cancelCapture = () => endCapture(undefined);
  Object.defineProperty(state, 'capturing', { get: () => (capture ? capture.kind : null) });
  const anyKey = (list) => { for (const c of list) if (keys.has(c)) return 1; return 0; };
  state.fire = fire;
  Object.defineProperty(state, 'menu', { get: () => menu, set(v) { menu = !!v; if (menu) { keys.clear(); fingers.clear(); apply(); } } });
  state.poll = (now = performance.now()) => {
    const K = B.keys;
    let steer = (anyKey(K.left) || touch.left) - (anyKey(K.right) || touch.right);
    let thr = anyKey(K.gas) || touch.gas, brk = anyKey(K.brake) || touch.brake, hb = !!(anyKey(K.hand) || touch.hand), nos = !!(anyKey(K.nitro) || touch.nitro), analog = false;
    // tilt steering (phones, when switched on): the steering arrows still win while a thumb is on one
    const T = state.tilt;
    if (T && T.on && !touch.left && !touch.right && !menu) { steer = Math.sign(T.steer) * Math.pow(Math.abs(T.steer), 1.3); analog = true; }
    let gp = null, all = [];
    try { all = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected); gp = all[0] || null; } catch (_) {}
    state.pad = !!gp;
    if (capture && capture.kind === 'pad') {   // binding a button: wait until every button is up, then take the next one pressed
      let down = -1;
      for (const p of all) p.buttons.forEach((x, i) => { if (down < 0 && x && x.value > 0.5) down = i; });
      if (!capture.armed) { if (down < 0) capture.armed = true; }
      else if (down >= 0) { held.add(down); endCapture(down); }
      if (capture && now > capture.until) endCapture(undefined);
      gp = null;
    } else if (capture && capture.kind === 'key') gp = null;
    if (gp && !(state.duo && !menu)) {   // in a two-player race the pads are read by poll2 instead
      const b = (i) => gp.buttons[i] ? gp.buttons[i].value : 0, mb = menuButtons(styleOf(B.style, gp.id));
      const menuMap = { [mb.accept]: 'accept', [mb.back]: 'back', 9: 'pause' }; for (const n of B.pad.pause) menuMap[n] = 'pause';
      const map = menu ? menuMap : padPress;
      for (let i = 0; i < gp.buttons.length && i < 32; i++) {       // act on a fresh press only, so a button held while a menu opens does nothing there
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
        const P = B.pad, most = (list) => list.reduce((m, n) => Math.max(m, b(n)), 0);
        thr = Math.max(thr, most(P.gas)); brk = Math.max(brk, most(P.brake)); if (most(P.hand) > 0.5) hb = true; if (most(P.nitro) > 0.5) nos = true;
        if (most(P.left) > 0.5) steer = 1; if (most(P.right) > 0.5) steer = -1;
      }
    }
    if (menu) { steer = thr = brk = 0; hb = nos = false; }
    state.steer = steer; state.throttle = thr; state.brake = brk; state.handbrake = hb; state.nitro = nos; state.analog = analog;
    return state;
  };
  // Two players on one screen: player 2 has their own keys (the arrows by default) and player 1 keeps every driving key
  // that player 2 does not use. Controllers: with two, one each; with one, it is player 2's and player 1 keeps the
  // keyboard. A controller's "back to the road" button puts that player back on the course, its menu button opens the menu.
  const held2 = [new Set(), new Set()];
  state.duo = false;
  state.poll2 = () => {
    const K = B.keys, Q = B.p2, mine = (list) => anyKey(list.filter((c) => !p2Keys.has(c)));
    const out = [
      { steer: mine(K.left) - mine(K.right), throttle: mine(K.gas), brake: mine(K.brake), handbrake: !!mine(K.hand), analog: false },
      { steer: anyKey(Q.left) - anyKey(Q.right), throttle: anyKey(Q.gas), brake: anyKey(Q.brake), handbrake: !!anyKey(Q.hand), analog: false },
    ];
    let pads = [];
    try { pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected); } catch (_) {}
    const slot = pads.length >= 2 ? [pads[0], pads[1]] : [null, pads[0] || null];
    slot.forEach((gp, i) => {
      if (!gp) return;
      const b = (n) => gp.buttons[n] ? gp.buttons[n].value : 0, o = out[i], P = B.pad, most = (list) => list.reduce((m, n) => Math.max(m, b(n)), 0);
      const acts = [...P.reset.map((n) => [n, 'duoReset']), ...P.pause.map((n) => [n, 'pause']), ...(P.pause.includes(9) ? [] : [[9, 'pause']])];
      for (const [n, a] of acts) { if (b(n) <= 0.5) { held2[i].delete(n); continue; } if (held2[i].has(n)) continue; held2[i].add(n); if (!menu) fire(a, i); }
      const sx = dz(gp.axes[0] || 0);
      if (sx) { o.steer = -Math.sign(sx) * Math.pow(Math.abs(sx), 1.6); o.analog = true; }
      if (most(P.left) > 0.5) o.steer = 1; if (most(P.right) > 0.5) o.steer = -1;
      o.throttle = Math.max(o.throttle, most(P.gas)); o.brake = Math.max(o.brake, most(P.brake)); if (most(P.hand) > 0.5) o.handbrake = true;
    });
    state.pads = pads.length;
    if (menu) for (const o of out) { o.steer = o.throttle = o.brake = 0; o.handbrake = false; }
    return out;
  };
  return state;
}
