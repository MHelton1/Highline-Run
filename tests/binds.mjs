// Controls the player can change: defaults, setting a key or button (taken off any other action), clearing, cleaning a
// saved copy, names for keys and for Xbox, Switch and PlayStation buttons. Run: node tests/binds.mjs
import { defaultBinds, cleanBinds, setBind, resetSet, pressMap, keyName, padKind, buttonName, menuButtons, styleOf, ACTIONS, PAD_ACTIONS, P2_ACTIONS } from '../src/binds.js';
import { cleanSave, freshSave } from '../src/save.js';
let bad = 0;
const check = (name, ok, v) => { if (!ok) bad++; console.log(name.padEnd(12), ok ? 'ok  ' : 'BAD ', JSON.stringify(v)); };

const d = defaultBinds();
check('defaults', ACTIONS.every((a) => Array.isArray(d.keys[a.id])) && PAD_ACTIONS.every((a) => Array.isArray(d.pad[a])) && P2_ACTIONS.every((a) => Array.isArray(d.p2[a])), Object.keys(d.keys).length);
const all = Object.values(d.keys).flat(); check('no repeats', new Set(all).size === all.length, all.length);
const pm = pressMap(d.keys); check('presses', pm.KeyR === 'reset' && pm.KeyE === 'action' && pm.Enter === 'action' && !pm.KeyW, pm);

const b = defaultBinds();
let from = setBind(b, 'keys', 'flip', 0, 'KeyR');
check('take', from === 'reset' && b.keys.flip[0] === 'KeyR' && !b.keys.reset.includes('KeyR'), { from, flip: b.keys.flip, reset: b.keys.reset });
from = setBind(b, 'keys', 'gas', 1, 'KeyI');
check('second', b.keys.gas.join() === 'KeyW,KeyI' && from === null, b.keys.gas);
setBind(b, 'keys', 'gas', 0, null);
check('clear', b.keys.gas.join() === 'KeyI', b.keys.gas);
check('escape', setBind(b, 'keys', 'map', 0, 'Escape') === null && !b.keys.map.includes('Escape'), b.keys.map);
setBind(b, 'pad', 'hand', 0, 2);
check('pad take', b.pad.hand[0] === 2 && !b.pad.flip.includes(2), { hand: b.pad.hand, flip: b.pad.flip });
resetSet(b, 'keys'); check('reset', JSON.stringify(b.keys) === JSON.stringify(d.keys), b.keys.flip);

// saved copies are repaired
const c = cleanBinds({ keys: { gas: ['KeyI', 'KeyI', 'Escape', 5, 'bad key!'], reset: ['KeyW'] }, pad: { hand: [40, 1, 'x'] }, style: 'switch', junk: 1 });
check('clean', c.keys.gas.join() === 'KeyI' && c.keys.reset.join() === 'KeyW' && c.pad.hand.join() === '1' && c.style === 'switch', { gas: c.keys.gas, reset: c.keys.reset, hand: c.pad.hand });
check('no clash', !c.keys.gas.includes('KeyW') && !c.pad.camera.includes(1), { camera: c.pad.camera, brake: c.keys.brake });
check('bad save', JSON.stringify(cleanBinds('x')) === JSON.stringify(d) && JSON.stringify(cleanBinds({ style: 'nope' }).style) === '"auto"', null);
const s = cleanSave({ ...freshSave(), binds: { keys: { map: ['KeyM'] } } });
check('in save', s.binds.keys.map.join() === 'KeyM' && !s.binds.keys.mute.includes('KeyM') && cleanSave(freshSave()).binds === null, { map: s.binds.keys.map, mute: s.binds.keys.mute });

// names
check('keys', [keyName('KeyW'), keyName('ArrowUp'), keyName('ShiftRight'), keyName('Digit4'), keyName('Numpad0'), keyName('Space')].join('|') === 'W|↑|Right Shift|4|Num 0|Space', null);
const ids = { xbox: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', switch: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
  ps: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', generic: 'USB Gamepad (Vendor: 0079 Product: 0011)' };
check('kinds', Object.entries(ids).every(([k, id]) => padKind(id) === k) && padKind('Joy-Con (L/R)') === 'switch' && padKind('045e-02fd-Xbox Wireless Controller') === 'xbox', null);
check('xbox', [0, 1, 2, 3, 4, 7].map((n) => buttonName(n, 'xbox')).join() === 'A,B,X,Y,LB,RT', null);
check('switch', [0, 1, 2, 3, 4, 7, 9].map((n) => buttonName(n, 'switch')).join() === 'B,A,Y,X,L,ZR,Plus', null);
check('ps', [0, 1, 2, 3].map((n) => buttonName(n, 'ps')).join() === '✕,○,□,△', null);
check('menu', menuButtons('switch').accept === 1 && menuButtons('xbox').accept === 0, null);
check('style', styleOf('auto', ids.switch) === 'switch' && styleOf('xbox', ids.switch) === 'xbox', null);
console.log(bad ? `binds: ${bad} check(s) failed` : 'binds: all checks passed');
process.exit(bad ? 1 : 0);
