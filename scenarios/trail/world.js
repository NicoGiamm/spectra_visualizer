// Alpine valley: mountains lower to the west so the sun sets over them; a worn trail runs west (-z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, clamp, lerp, sm, R, noise2, fbm2, ridged2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { solid, topoMat } from 'spectra/render/instrument.js';
import { heightfield } from 'spectra/world/heightfield.js';

export const trailX = z => 6 * Math.sin(z * .02) + 3 * Math.sin(z * .053);
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = 2.2 * fbm2(x * .02, z * .02, 4) + 6 * fbm2(x * .004 + 3, z * .004, 3);
  h -= (1 - sm(0, 2.5, Math.abs(x - trailX(z)))) * .25;     // worn trail
  const west = Math.max(0, -z / (r + 1));
  const mount = sm(200, 1500, r) * (1 - .85 * sm(.2, .9, west));
  h += mount * (950 * Math.pow(ridged2(x * .00045 + 7, z * .00045 + 3, 6), 2.2) + 110 * fbm2(x * .002, z * .002, 4));
  h += sm(40, 450, r) * 45 * fbm2(x * .006 + 11, z * .006, 4);
  return h;
}
const slopeAt = (x, z) => { const e = 2, hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e); return Math.hypot(hx, hz) / (2 * e); };

export const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
export const NEAR_ROCKS = [];   // rocks close to the trail that glow while cooling (IR)

function terrain() {
  const C = { grass: [.03, .045, .014], dry: [.11, .085, .04], rock: [.085, .08, .075], snow: [.78, .8, .86], dirt: [.12, .085, .055] };
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const g = heightfield({ heightAt, colorAt(x, y, z, slope) {
    const nz = fbm2(x * .03, z * .03, 3);
    let c = mix(C.grass, C.dry, sm(.35, .7, nz) * .8 + sm(60, 250, y) * .4);
    c = mix(c, C.dirt, sm(1.6, .7, Math.abs(x - trailX(z))) * (Math.hypot(x, z) < 200 ? 1 : 0));
    c = mix(c, C.rock, clamp(sm(.18, .4, slope) + sm(200, 420, y) * .7));
    return mix(c, C.snow, sm(360 + 90 * nz, 460 + 90 * nz, y) * (1 - sm(.5, .72, slope)));
  } });
  S.scene.add(solid(new THREE.Mesh(g, terrainMat), topoMat));
}

function trees() {   // instanced pines
  const parts = [], cone = (r, h, y, s = 7) => { const g = new THREE.ConeGeometry(r, h, s, 2); g.translate(0, y, 0); return g; };
  const trunk = new THREE.CylinderGeometry(.14, .24, 2.2, 5); trunk.translate(0, 1.1, 0); parts.push([trunk, [.05, .03, .02]]);
  [[2.3, 4.6, 3.4], [1.8, 3.9, 5.5], [1.2, 3.3, 7.4], [.65, 2.4, 9.1]].forEach(([r, h, y]) => parts.push([cone(r, h, y), [.018, .04, .022]]));
  const geos = parts.map(([g, c]) => {
    g = g.toNonIndexed(); const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), j = .22 * (noise2(x * 3 + y * 7, z * 3 + y) - .5);
      p.setXYZ(i, x * (1 + j), y + j * .4, z * (1 + j)); col.set(c, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); g.computeVertexNormals(); return g;
  });
  const treeGeo = mergeGeometries(geos);
  const M = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 16000 && M.length < 3800; i++) {
    const r = 6 + 1900 * R() ** 2, a = R() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x - trailX(z)) < 4 || fbm2(x * .008, z * .008, 3) < .44) continue;
    const y = heightAt(x, z); if (y > 270 || slopeAt(x, z) > .55) continue;
    tmp.position.set(x, y - .3, z); tmp.rotation.set(0, R() * 6.28, 0); tmp.scale.setScalar(.6 + R() * 1.1); tmp.updateMatrix(); M.push(tmp.matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), M.length);
  M.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color().setScalar(.7 + R() * .6)); });
  S.scene.add(solid(mesh));
}

function rocks() {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new V3().fromBufferAttribute(p, i); v.multiplyScalar(.75 + .5 * noise2(v.x * 2 + 5, v.y * 2 + v.z * 3)); v.y *= .65; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const M = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 520; i++) {
    let x, z, s;
    if (i < 320) { z = -190 + R() * 250; x = trailX(z) + (R() < .5 ? -1 : 1) * (1.6 + R() * 30); s = .15 + R() ** 2 * 1.1; }
    else { const r = 30 + R() * 700, a = R() * 6.28; x = Math.cos(a) * r; z = Math.sin(a) * r; s = 1 + R() * 4; }
    const y = heightAt(x, z);
    tmp.position.set(x, y - s * .15, z); tmp.rotation.set(R() * .4, R() * 6.28, R() * .4); tmp.scale.set(s * (.8 + R() * .5), s, s * (.8 + R() * .5)); tmp.updateMatrix(); M.push(tmp.matrix.clone());
    if (i < 320 && s > .45 && Math.abs(z) < 170 && NEAR_ROCKS.length < 22) NEAR_ROCKS.push({ p: new V3(x, y + s * .3, z), s });
  }
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(.11, .1, .095), roughness: .92, flatShading: true }), M.length);
  M.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color().setScalar(.7 + R() * .6)); });
  S.scene.add(solid(mesh));
}

function grass() {   // instanced blades swaying in the wind
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.018, 0, 0, .018, 0, 0, .011, .2, .008, -.011, .2, .008, 0, .42, .03], 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4]); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .9 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = S.TIME;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wp = (instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
        float k = position.y*position.y*1.6;
        transformed.x += k*.35*sin(uTime*1.6 + wp.x*.35 + wp.z*.2);
        transformed.z += k*.2*sin(uTime*1.1 + wp.z*.3);
      #endif`);
  };
  const COUNT = 70000, mesh = new THREE.InstancedMesh(g, mat, COUNT), tmp = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const z = -190 + R() * 250, side = R() < .5 ? -1 : 1, off = 1.05 + 28 * R() ** 1.6, x = trailX(z) + side * off;
    tmp.position.set(x, heightAt(x, z) - .02, z); tmp.rotation.set((R() - .5) * .4, R() * 6.28, (R() - .5) * .4);
    tmp.scale.setScalar(.4 + R() * .8); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix);
    const dry = R(); mesh.setColorAt(i, c.setRGB(lerp(.07, .26, dry), lerp(.12, .2, dry), lerp(.03, .08, dry)));
  }
  S.scene.add(solid(mesh));
}

export function build() {
  terrain(); trees(); rocks(); grass();
  return {
    groundAt: heightAt,
    walk(t, camera) {   // 42 m -> -40 m along the trail over the minute
      const z = 42 - t * 2.74, x = trailX(z), bob = Math.sin(t * 9) * .03;
      camera.position.set(x, heightAt(x, z) + 1.7 + bob, z);
    },
  };
}
