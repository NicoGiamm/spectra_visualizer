// Vertex-coloured terrain on a warped grid: dense near the origin, sparse toward the horizon.
//   heightAt(x, z)            -> metres
//   colorAt(x, y, z, slope)   -> [r, g, b]  (slope = 1 - normal.y)
//   surfAt(x, y, z, slope)    -> optional {A, B, C} surface properties (see render/surface.js) -> aSurfA/B/C attributes;
//                                g.userData.surfMean holds their mean within `meanRadius` (for the meters)
import * as THREE from 'three';

export function heightfield({ heightAt, colorAt, surfAt, N = 330, SIZE = 6500, power = 2.3, meanRadius = 400 }) {
  const map = u => Math.sign(u) * Math.pow(Math.abs(u), power) * SIZE;
  const pos = new Float32Array((N + 1) ** 2 * 3), idx = new Uint32Array(N * N * 6);
  let k = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = map(i / N * 2 - 1), z = map(j / N * 2 - 1);
    pos[k++] = x; pos[k++] = heightAt(x, z); pos[k++] = z;
  }
  k = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const nor = g.attributes.normal.array, col = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) col.set(colorAt(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], 1 - nor[v * 3 + 1]), v * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (surfAt) {
    const n = pos.length / 3, arr = { A: new Float32Array(n * 4), B: new Float32Array(n * 4), C: new Float32Array(n * 4) };
    const mean = { A: [0, 0, 0, 0], B: [0, 0, 0, 0], C: [0, 0, 0, 0] }; let m = 0;
    for (let v = 0; v < n; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], p = surfAt(x, y, z, 1 - nor[v * 3 + 1]);
      for (const k of 'ABC') arr[k].set(p[k], v * 4);
      if (Math.hypot(x, z) < meanRadius) { m++; for (const k of 'ABC') for (let i = 0; i < 4; i++) mean[k][i] += p[k][i]; }
    }
    for (const k of 'ABC') { g.setAttribute('aSurf' + k, new THREE.BufferAttribute(arr[k], 4)); for (let i = 0; i < 4; i++) mean[k][i] /= m || 1; }
    g.userData.surfMean = mean;
  }
  return g;
}
