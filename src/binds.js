// Controls the player can change: which keys and which controller buttons do what. No rendering (runs in node for tests).
// Keys are KeyboardEvent.code values ('KeyW', 'ArrowUp'); controller buttons are Gamepad button numbers in the browser's
// standard layout (0 bottom face button, 1 right, 2 left, 3 top, 4/5 shoulders, 6/7 triggers, 8 back, 9 start, 12-15 D-pad).
// Each action has up to two keys or buttons. Escape always opens the menu, whatever is set, so nobody can lock themselves out.

export const SLOTS = 2;
// what can be set, in the order the Controls screen lists them
export const ACTIONS = [
  { id: 'gas', name: 'Gas' }, { id: 'brake', name: 'Brake and reverse' }, { id: 'left', name: 'Steer left' }, { id: 'right', name: 'Steer right' },
  { id: 'hand', name: 'Handbrake' }, { id: 'nitro', name: 'Nitro' },
  { id: 'reset', name: 'Back to the road' }, { id: 'flip', name: 'Flip upright' }, { id: 'camera', name: 'Camera' }, { id: 'action', name: 'Use a garage or race' },
  { id: 'map', name: 'Big map' }, { id: 'pause', name: 'Menu' }, { id: 'photo', name: 'Photo mode' },
  { id: 'mute', name: 'Sound on or off' }, { id: 'music', name: 'Music on or off' }, { id: 'time', name: 'Time of day' }, { id: 'units', name: 'mph or km/h' },
];
export const HOLD = ['gas', 'brake', 'left', 'right', 'hand', 'nitro'];          // held down, the rest act once per press
export const P2_ACTIONS = ['gas', 'brake', 'left', 'right', 'hand', 'reset'];      // player 2's keys in a two-player race
export const PAD_ACTIONS = ['gas', 'brake', 'left', 'right', 'hand', 'nitro', 'reset', 'flip', 'camera', 'action', 'map', 'pause', 'photo'];
export const actionName = (id) => (ACTIONS.find((a) => a.id === id) || { name: id }).name;

export const DEFAULT_KEYS = { gas: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], hand: ['Space'], nitro: ['ShiftLeft', 'ShiftRight'],
  reset: ['KeyR'], flip: ['KeyF'], camera: ['KeyC'], action: ['KeyE', 'Enter'], map: ['KeyG'], pause: ['KeyP'], photo: ['KeyO'], mute: ['KeyM'], music: ['KeyN'], time: ['KeyT'], units: ['KeyU'] };
export const DEFAULT_P2 = { gas: ['ArrowUp'], brake: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], hand: ['ShiftRight', 'Slash'], reset: ['Backspace'] };
export const DEFAULT_PAD = { gas: [7], brake: [6], left: [14], right: [15], hand: [0, 5], nitro: [4], reset: [3], flip: [2], camera: [1], action: [12], map: [8], pause: [9], photo: [] };
export const RESERVED = ['Escape'];                       // never bound: always the menu
export const STYLES = ['auto', 'xbox', 'switch', 'ps'];
export const STYLE_NAME = { auto: 'Auto', xbox: 'Xbox', switch: 'Switch', ps: 'PlayStation', generic: 'Controller' };

const copy = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]));
export const defaultBinds = () => ({ keys: copy(DEFAULT_KEYS), p2: copy(DEFAULT_P2), pad: copy(DEFAULT_PAD), style: 'auto' });
const LISTS = { keys: [ACTIONS.map((a) => a.id), DEFAULT_KEYS], p2: [P2_ACTIONS, DEFAULT_P2], pad: [PAD_ACTIONS, DEFAULT_PAD] };

// anything read from a save is checked: known actions only, valid keys or buttons, no repeats, at most two each
export function cleanBinds(raw) {
  const b = defaultBinds();
  if (!raw || typeof raw !== 'object') return b;
  for (const [set, [ids]] of Object.entries(LISTS)) {
    const src = raw[set]; if (!src || typeof src !== 'object') continue;
    const used = new Set();
    for (const id of ids) {
      if (!Array.isArray(src[id])) continue;             // missing: keep the default
      const ok = src[id].filter((v) => (set === 'pad' ? Number.isInteger(v) && v >= 0 && v < 32 : typeof v === 'string' && /^[A-Za-z0-9]{1,24}$/.test(v) && !RESERVED.includes(v)));
      b[set][id] = [...new Set(ok)].filter((v) => !used.has(v)).slice(0, SLOTS);
      b[set][id].forEach((v) => used.add(v));
    }
    // a default left in place must not clash with something the player set
    for (const id of ids) if (!Array.isArray(src[id])) b[set][id] = b[set][id].filter((v) => !ids.some((o) => o !== id && Array.isArray(src[o]) && b[set][o].includes(v)));
  }
  if (STYLES.includes(raw.style)) b.style = raw.style;
  return b;
}

// set one slot of one action; the key or button is taken off any other action in the same set. Returns the action it
// was taken from, or null. A value of null clears the slot.
export function setBind(b, set, id, slot, value) {
  const m = b[set]; if (!m || !m[id] || slot < 0 || slot >= SLOTS) return null;
  if (typeof value === 'string' && RESERVED.includes(value)) return null;
  let from = null;
  if (value != null) for (const o of Object.keys(m)) { if (o === id) continue; const k = m[o].indexOf(value); if (k >= 0) { m[o].splice(k, 1); from = o; } }
  const list = m[id].slice(0, SLOTS);
  if (value == null) list.splice(slot, 1);
  else { const k = list.indexOf(value); if (k >= 0 && k !== slot) list.splice(k, 1); if (slot < list.length) list[slot] = value; else list.push(value); }
  m[id] = [...new Set(list)].slice(0, SLOTS);
  return from;
}
export function resetSet(b, set) { b[set] = copy(LISTS[set][1]); }

// which key or button sets off a press action: code -> action
export function pressMap(m) { const out = {}; for (const [id, list] of Object.entries(m)) if (!HOLD.includes(id)) for (const v of list) out[v] = id; return out; }

// ---- names ----
const KEY_NAMES = { Space: 'Space', Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt', AltRight: 'Right Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Slash: '/', Backslash: '\\', Period: '.', Comma: ',', Semicolon: ';',
  Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', CapsLock: 'Caps Lock', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'Page Up', PageDown: 'Page Down', NumpadEnter: 'Num Enter', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .' };
export function keyName(code) {
  if (!code) return '';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit(\d)$/.exec(code); if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code); if (m) return 'Num ' + m[1];
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// what kind of controller a Gamepad id names (USB vendor ids: 045e Microsoft, 057e Nintendo, 054c Sony)
export function padKind(id = '') {
  if (/057e|nintendo|pro controller|joy-?con|switch/i.test(id)) return 'switch';
  if (/045e|xbox|xinput|microsoft/i.test(id)) return 'xbox';
  if (/054c|playstation|dualshock|dualsense|wireless controller/i.test(id)) return 'ps';
  return 'generic';
}
// the names printed on the buttons, by position in the standard layout. On a Switch controller the bottom button is B
// and the right one A, the other way round from Xbox.
const DPAD = ['D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];
export const BUTTON_NAMES = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'Left stick press', 'Right stick press', ...DPAD, 'Xbox'],
  switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', 'Minus', 'Plus', 'Left stick press', 'Right stick press', ...DPAD, 'Home', 'Capture'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', ...DPAD, 'PS', 'Touchpad'],
};
BUTTON_NAMES.generic = BUTTON_NAMES.xbox;
export const styleOf = (style, id) => (style && style !== 'auto' ? style : padKind(id));
export const buttonName = (n, kind = 'xbox') => (BUTTON_NAMES[kind] || BUTTON_NAMES.xbox)[n] || 'Button ' + n;
// in menus: Switch players pick with A (the right button) and go back with B (the bottom one); everyone else the reverse
export const menuButtons = (kind) => (kind === 'switch' ? { accept: 1, back: 0 } : { accept: 0, back: 1 });

// short words for hints: the first key (or button) of an action, or '' if it has none
export const keyFor = (b, id, set = 'keys') => keyName((b[set][id] || [])[0]);
export const buttonFor = (b, id, kind) => { const n = (b.pad[id] || [])[0]; return n == null ? '' : buttonName(n, kind); };
export const keysFor = (b, id, set = 'keys') => (b[set][id] || []).map(keyName).join(' or ');
