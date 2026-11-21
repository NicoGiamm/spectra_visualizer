// Vertex-coloured terrain on a warped grid: dense near the origin, sparse toward the horizon.
//   heightAt(x, z)            -> metres
//   colorAt(x, y, z, slope)   -> [r, g, b]  (slope = 1 - normal.y)
import * as THREE from 'three';

export function heightfield({ heightAt, colorAt, N = 330, SIZE = 6500, power = 2.3 }) {
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
  return g;
}
