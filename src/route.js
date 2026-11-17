// Cross-country routes over the world's steepness map (12 m cells): A* that keeps to slopes a car can climb.
// Used by rival smugglers. No rendering (runs in node for tests).
import { HALF } from './terrain.js';

// a: start {x, z}, b: goal {x, z}; lim: the steepest cell allowed. Returns [{x, z}, ...] from a to b, or null.
export function route(world, a, b, lim = 0.42) {
  const n = world.reachN, C = 2 * HALF / n, S = world.steepR;
  const cell = (x, z) => Math.max(0, Math.min(n - 1, Math.round((z + HALF) / C))) * n + Math.max(0, Math.min(n - 1, Math.round((x + HALF) / C)));
  const s = cell(a.x, a.z), t = cell(b.x, b.z), ti = t % n, tj = (t / n) | 0;
  const g = new Float32Array(n * n).fill(Infinity), from = new Int32Array(n * n).fill(-1), shut = new Uint8Array(n * n);
  // binary heap of [f, cell]
  const hf = [], hc = [];
  const push = (f, c) => { let i = hf.length; hf.push(f); hc.push(c); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hc[i] = hc[p]; i = p; } hf[i] = f; hc[i] = c; };
  const pop = () => {
    const c = hc[0], lf = hf.pop(), lc = hc.pop(), m = hf.length;
    if (m) { let i = 0; for (;;) { let k = 2 * i + 1; if (k >= m) break; if (k + 1 < m && hf[k + 1] < hf[k]) k++; if (hf[k] >= lf) break; hf[i] = hf[k]; hc[i] = hc[k]; i = k; } hf[i] = lf; hc[i] = lc; }
    return c;
  };
  g[s] = 0; push(0, s);
  let found = false;
  while (hf.length) {
    const c = pop(); if (shut[c]) continue; shut[c] = 1;
    if (c === t) { found = true; break; }
    const ci = c % n, cj = (c / n) | 0;
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      if (!da && !db) continue;
      const ni = ci + da, nj = cj + db; if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nn = nj * n + ni; if (shut[nn] || (S[nn] > lim && nn !== t)) continue;
      const ng = g[c] + Math.hypot(da, db) * C * (1 + (S[nn] / 0.22) ** 2);
      if (ng < g[nn]) { g[nn] = ng; from[nn] = c; push(ng + Math.hypot(ni - ti, nj - tj) * C, nn); }
    }
  }
  if (!found) return null;
  const out = []; for (let c = t; c >= 0; c = from[c]) out.push({ x: (c % n) * C - HALF, z: ((c / n) | 0) * C - HALF });
  out.reverse(); out[0] = { x: a.x, z: a.z }; out[out.length - 1] = { x: b.x, z: b.z };
  return out;
}
