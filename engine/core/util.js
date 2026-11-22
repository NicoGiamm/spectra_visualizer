// Pure helpers: maths, easing, seeded randomness, noise, keyframes.
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const DEG = Math.PI / 180;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const sm = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
// envelope: fades in over f after t0, out over f before t1
export const env = (t, t0, t1, f = 1.5) => sm(t0, t0 + f, t) * (1 - sm(t1 - f, t1, t));

// Playback: script time S.t (0–60) advances at speed(t) script-s per real second: one even pace, half a script-s
// per second, from the sunset to the end (no fast-forward — user decision M8, 2026-11-22), so a walk lasts 120 s.
// Event timings stay on the 0–60 axis; only the real-time pacing changes. PLAY.real(t) / PLAY.script(r) map
// between script time and real seconds (the slider runs in real seconds, 0 … PLAY.len).
export const PLAY = (() => {
  const speed = () => .5, N = 1200, cum = new Float32Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + 60 / N / speed((i + .5) / N * 60);   // real seconds to reach t
  const real = t => { const x = clamp(t / 60) * N, i = Math.min(N - 1, Math.floor(x)); return lerp(cum[i], cum[i + 1], x - i); };
  const script = r => { r = clamp(r, 0, cum[N]); let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= r) lo = m; else hi = m; }
    return (lo + (r - cum[lo]) / (cum[hi] - cum[lo] || 1)) / N * 60; };
  return { speed, real, script, len: cum[N] };
})();

export function rng(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// The shared seeded stream. A page runs one scenario, so scene props and event init()s
// draw from it in a fixed order and scrubbing / reloading repeats identically.
export const R = rng(42);

// [[t, [r,g,b], [r,g,b]...]] -> interpolated arrays
export function kf(keys, t) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], k = clamp((t - a[0]) / (b[0] - a[0]));
  return a.slice(1).map((c, j) => c.map((v, m) => lerp(v, b[j + 1][m], k)));
}

export function hash2(x, y) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, o = 5) { let a = 0, w = .5; for (let i = 0; i < o; i++) { a += w * noise2(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; w *= .5; } return a; }
export function ridged2(x, y, o = 6) { let a = 0, w = .5; for (let i = 0; i < o; i++) { a += w * (1 - Math.abs(2 * noise2(x, y) - 1)); x = x * 2.1 + 5.3; y = y * 2.1 + 11.9; w *= .5; } return a; }
