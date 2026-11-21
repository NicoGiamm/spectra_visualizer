// Sky geometry. Azimuth is measured from north (+x) clockwise through east (+z);
// elevation is above the horizon. Front of every scenario is azimuth 270 (west, -z).
// Sky objects live on a "celestial sphere" of radius D centred on the camera.
import { V3, DEG } from './util.js';
import { S } from './state.js';

export const D = 8000;
export const deg = d => D * d * DEG;                    // angular size (deg) -> world size at D
export const dirAE = (az, el) => new V3(Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG), Math.cos(el * DEG) * Math.sin(az * DEG));
export const skyP = (az, el) => dirAE(az, el).multiplyScalar(D).add(S.camera.position);
export const onSky = dir => dir.clone().normalize().multiplyScalar(D).add(S.camera.position);
export function basis(dir) { const u = new V3().crossVectors(dir, new V3(0, 1, 0)).normalize(); const v = new V3().crossVectors(u, dir).normalize(); return [u, v]; }
export const ringPts = (dir, radDeg, n = 48) => {
  const [u, v] = basis(dir);
  return Array.from({ length: n + 1 }, (_, i) => { const a = i / n * Math.PI * 2; return onSky(dir.clone().add(u.clone().multiplyScalar(Math.cos(a) * radDeg * DEG)).add(v.clone().multiplyScalar(Math.sin(a) * radDeg * DEG))); });
};
export const linePts = (a, b, n = 12) => Array.from({ length: n }, (_, i) => a.clone().lerp(b, i / (n - 1)));
