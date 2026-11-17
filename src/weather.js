// Weather: clear, cloudy, rain, snow, fog and dust storms, each with its look (clouds, fog, light, falling particles),
// its sound and what it does to the driving (grip on each surface, how far patrols can see). Each region has its own
// mix; "Changing" moves between them every few minutes, blending over about twenty seconds. Pure data and math.

// grip: multiplier per surface (asphalt, dirt, grass or sand, rock, snow); fogFar/fogNear: share of the clear-day
// fog distances; light: sun and sky strength; cover: cloud cover 0..1; tint: fog and sky colour it leans toward;
// part: falling particles; rain: rain sound 0..1; wind: extra wind 0..1; sight: how far patrols see
export const WEATHERS = {
  clear: { ground: 0, name: 'Clear', cover: 0, fogFar: 1, fogNear: 1, light: 1, tint: 0xffffff, tintAmt: 0, grip: [1, 1, 1, 1, 1], part: null, rain: 0, wind: 0, sight: 1 },
  cloudy: { ground: 0, name: 'Cloudy', cover: 0.65, fogFar: 0.8, fogNear: 0.9, light: 0.78, tint: 0xb4bcc6, tintAmt: 0.35, grip: [1, 1, 1, 1, 1], part: null, rain: 0, wind: 0.2, sight: 0.95 },
  rain: { ground: 0, name: 'Rain', cover: 1, fogFar: 0.3, fogNear: 0.25, light: 0.45, tint: 0x8e979f, tintAmt: 0.7, grip: [0.86, 0.88, 0.9, 0.86, 1], part: 'rain', rain: 1, wind: 0.45, sight: 0.8 },
  snow: { ground: 0.8, name: 'Snow', cover: 0.95, fogFar: 0.22, fogNear: 0.2, light: 0.68, tint: 0xc9d0d8, tintAmt: 0.8, grip: [0.74, 0.84, 0.86, 0.8, 0.95], part: 'snow', rain: 0, wind: 0.5, sight: 0.75 },
  fog: { ground: 0, name: 'Fog', cover: 0.7, fogFar: 0.11, fogNear: 0.04, light: 0.75, tint: 0xbac2c6, tintAmt: 0.85, grip: [0.95, 1, 1, 1, 1], part: null, rain: 0, wind: 0, sight: 0.55 },
  dust: { ground: 0, name: 'Dust storm', cover: 0.35, fogFar: 0.14, fogNear: 0.03, light: 0.62, tint: 0xc49c6c, tintAmt: 0.85, grip: [0.95, 1, 0.96, 1, 1], part: 'dust', rain: 0, wind: 1, sight: 0.6 },
};

// what each region gets, and how often (weights), and its big storm
export const REGION_WEATHER = {
  mountain: { storm: 'snow', mix: [['clear', 4], ['cloudy', 3], ['rain', 2], ['snow', 2], ['fog', 1]] },
  desert: { storm: 'dust', mix: [['clear', 6], ['cloudy', 2], ['dust', 2], ['rain', 0.6]] },
  coast: { storm: 'rain', mix: [['clear', 4], ['cloudy', 3], ['fog', 2], ['rain', 2.5]] },
};

export const WEATHER_MODES = ['auto', 'clear', 'storm'];
export const WEATHER_MODE_NAME = { auto: 'Changing', clear: 'Clear', storm: 'Stormy' };
// what is said when the weather turns
export const WEATHER_NEWS = { clear: 'The sky is clearing', cloudy: 'Clouds are rolling in', rain: 'Rain is coming in. The roads are slippery', snow: 'Snow is falling. Grip is low', fog: 'Fog is rolling in', dust: 'A dust storm is blowing in' };

const NUMS = ['cover', 'fogFar', 'fogNear', 'light', 'tintAmt', 'rain', 'wind', 'sight', 'ground'];
const mixHex = (a, b, t) => { const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };

// the weather part way from one kind to another (t 0..1); particles follow whichever side is stronger
export function blendWeather(a, b, t) {
  const A = WEATHERS[a] || WEATHERS.clear, B = WEATHERS[b] || WEATHERS.clear, out = { from: a, to: b, t };
  for (const k of NUMS) out[k] = A[k] + (B[k] - A[k]) * t;
  out.tint = A.tintAmt && B.tintAmt ? mixHex(A.tint, B.tint, t) : (B.tintAmt ? B.tint : A.tint);
  out.grip = A.grip.map((g, i) => g + (B.grip[i] - g) * t);
  // particles fade out with the old weather, then in with the new one
  out.part = t < 0.5 ? A.part : B.part; out.partAmt = A.part === B.part ? 1 : (t < 0.5 ? 1 - 2 * t : 2 * t - 1);
  if (!out.part) out.partAmt = 0;
  return out;
}

// a seeded pick of the next weather for a region (never the same twice in a row)
export function nextWeather(region, now, rnd = Math.random) {
  const mix = (REGION_WEATHER[region] || REGION_WEATHER.mountain).mix.filter(([k]) => k !== now);
  let total = 0; for (const [, w] of mix) total += w;
  let r = rnd() * total; for (const [k, w] of mix) { if ((r -= w) <= 0) return k; }
  return mix[mix.length - 1][0];
}

// the weather a setting asks for right now ('auto' keeps whatever the clock picked)
export const fixedWeather = (mode, region) => (mode === 'clear' ? 'clear' : mode === 'storm' ? (REGION_WEATHER[region] || REGION_WEATHER.mountain).storm : null);
// how long each kind lasts when it is changing by itself, in seconds
export const SPELL = [150, 330];
export const BLEND = 20;
