// Multipath rays: specular reflection off axis-aligned boxes (buildings, the ground).
//
//   bounce(origin, dir, boxes, maxHits, maxLen)
//     -> { pts: [origin, hit1, hit2, …, end], hits: [{ p, n, k }], len: [cumulative length per point] }
//
// boxes: [{ min: Vector3, max: Vector3 }]. The ray reflects off the face it enters (normal from the slab that
// was crossed last) up to maxHits times; after the last hit (or if it escapes) it runs on for the remaining
// maxLen. Pure geometry, no allocation per frame beyond the result: precompute rays in init() and animate a
// packet along `pts` with `along(ray, s)`.
import * as THREE from 'three';

const V3 = THREE.Vector3;

// slab test: entry distance and the axis/sign of the entered face, or null
function hitBox(o, d, b, tMax) {
  let t0 = 1e-4, t1 = tMax, axis = -1, sign = 0;
  for (let a = 0; a < 3; a++) {
    const k = 'xyz'[a], oa = o[k], da = d[k], lo = b.min[k], hi = b.max[k];
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return null; continue; }
    let ta = (lo - oa) / da, tb = (hi - oa) / da, s = -1;
    if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; }
    if (ta > t0) { t0 = ta; axis = a; sign = s; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return axis < 0 ? null : { t: t0, axis, sign };   // axis < 0: origin inside the box -> ignore
}

export function bounce(origin, dir, boxes, maxHits = 3, maxLen = 200) {
  const o = origin.clone(), d = dir.clone().normalize(), pts = [o.clone()], hits = [], len = [0];
  let left = maxLen;
  for (let k = 0; k <= maxHits && left > 1e-3; k++) {
    let best = null;
    if (k < maxHits) for (const b of boxes) { const h = hitBox(o, d, b, left); if (h && (!best || h.t < best.t)) best = h; }
    if (!best) { o.addScaledVector(d, left); pts.push(o.clone()); len.push(maxLen); break; }
    o.addScaledVector(d, best.t); left -= best.t;
    const n = new V3(); n.setComponent(best.axis, best.sign);
    pts.push(o.clone()); len.push(maxLen - left); hits.push({ p: o.clone(), n, k: hits.length + 1 });
    d.setComponent(best.axis, -d.getComponent(best.axis));      // mirror the crossed component
    o.addScaledVector(n, 1e-3);
  }
  return { pts, hits, len };
}

// sub-path of a bounced ray between arc lengths a..b (a packet travelling outward); also returns how many
// reflections the head has undergone (for the per-bounce fade)
export function along(ray, a, b) {
  const { pts, len } = ray, out = [];
  a = Math.max(0, a); b = Math.min(len[len.length - 1], b);
  if (b <= a) return { pts: out, hits: 0 };
  const at = s => { let i = 1; while (i < len.length - 1 && len[i] < s) i++; const f = (s - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]); return [i, pts[i - 1].clone().lerp(pts[i], Math.min(1, Math.max(0, f)))]; };
  const [ia, pa] = at(a), [ib, pb] = at(b);
  out.push(pa); for (let i = ia; i < ib; i++) out.push(pts[i].clone()); out.push(pb);
  return { pts: out, hits: ib - 1 };
}
