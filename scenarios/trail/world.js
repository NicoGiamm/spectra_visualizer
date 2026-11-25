// Alpine valley: mountains lower to the west so the sun sets over them; a worn trail runs west (-z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, clamp, lerp, sm, kf, R, noise2, fbm2, ridged2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { spectral, PRESET, mixSurf, collectSurfD } from 'spectra/render/surface.js';
import { SUN_AZ, sunEl } from 'spectra/world/atmosphere.js';
import { dirAE } from 'spectra/core/geom.js';
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
  // same classes as the colours: meadow -> dirt trail -> rock -> snow
  const surfAt = collectSurfD((x, y, z, slope) => {
    const nz = fbm2(x * .03, z * .03, 3), L = (a, b, k) => mixSurf([[a, 1 - k], [b, k]]);
    let s = L(PRESET.meadow, PRESET.forest, sm(.44, .6, fbm2(x * .008, z * .008, 3)) * .5);
    s = L(s, PRESET.dirt, sm(1.6, .7, Math.abs(x - trailX(z))) * (Math.hypot(x, z) < 200 ? 1 : 0));
    s = L(s, PRESET.rock, clamp(sm(.18, .4, slope) + sm(200, 420, y) * .7));
    return L(s, PRESET.snow, sm(360 + 90 * nz, 460 + 90 * nz, y) * (1 - sm(.5, .72, slope)));
  });
  const C = { grass: [.03, .045, .014], dry: [.11, .085, .04], rock: [.085, .08, .075], snow: [.78, .8, .86], dirt: [.12, .085, .055] };
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const g = heightfield({ heightAt, colorAt(x, y, z, slope) {
    const nz = fbm2(x * .03, z * .03, 3);
    let c = mix(C.grass, C.dry, sm(.35, .7, nz) * .8 + sm(60, 250, y) * .4);
    c = mix(c, C.dirt, sm(1.6, .7, Math.abs(x - trailX(z))) * (Math.hypot(x, z) < 200 ? 1 : 0));
    c = mix(c, C.rock, clamp(sm(.18, .4, slope) + sm(200, 420, y) * .7));
    return mix(c, C.snow, sm(360 + 90 * nz, 460 + 90 * nz, y) * (1 - sm(.5, .72, slope)));
  }, surfAt });
  surfAt.attach(g);                  // per-vertex reflection data (aSurfD)
  S.scene.add(spectral(new THREE.Mesh(g, terrainMat), 'attr', { lines: 'topo', mean: g.userData.surfMean, weight: 1.2,
    uniforms: { uAlpen: ALPEN.amount, uSunDir: ALPEN.dir, ...TRAIL_U }, extraDecl: TERRAIN_DECL,
    instrExtra: 'c += trailTerrain(W, N, 0.);',
    // alpenglow: snow faces that still catch the grazing sun turn pink (high peaks see it after sunset down here)
    visExtra: `float snowK = smoothstep(.45, .75, vSurfB.y)*smoothstep(250., 520., W.y);
      gl_FragColor.rgb += uAlpen*snowK*max(dot(N, uSunDir), 0.)*vec3(1., .36, .52)*.55;
      gl_FragColor.rgb += uOverlay*trailTerrain(W, N, 1.);` }));
}
// Terrain-only physics on top of the shared surface model (engine/render/surface.js):
//  - sun-warmed slopes: faces that took the afternoon sun (from the WNW, ~15° high) start up to 14 °C warmer and
//    lose the excess with tau ≈ 9 script-s;
//  - the campfire heats the ground around the pit once it burns;
//  - microwave coverage of the cell mast on the ridge and the TV (UHF) transmitter: a long-range field (the shared
//    addTx field is tuned for routers at ~20 m) with radial dashes moving outward. In the spectral eye (M11/T2) the
//    ground reflects that coverage by its microwave reflectivity R = 1 − eMW (Kirchhoff, surface.js) — grass and rock
//    scatter it diffusely at 0.7–2 GHz (h of cm against λ 15–40 cm) — and the dashes give way to their mean.
export const TRAIL_U = {
  uAft: { value: dirAE(SUN_AZ - 10, 15) }, uSlopeK: { value: 1 }, uCamp: { value: new THREE.Vector4() },
  uMTx: { value: [new THREE.Vector4(), new THREE.Vector4()] },
};
const TERRAIN_DECL = `uniform float uAlpen; uniform vec3 uSunDir; uniform vec3 uAft; uniform float uSlopeK; uniform vec4 uCamp; uniform vec4 uMTx[2];
vec3 irCol(float T, float e){ float Tr = e*T + (1. - e)*(-35.), x = clamp((Tr + 4.)/44., 0., 1.); return thermal(x)*(.04 + .5*x*x); }
float slopeWarm(vec3 N){ return clamp((dot(N, uAft) - .32)/.4, 0., 1.); }
vec3 trailTerrain(vec3 W, vec3 N, float inVis){
  vec3 col = vec3(0.);
  if(uSOnI > 0.){
    float dc = length(W.xz - uCamp.xz), dT = 14.*uSlopeK*slopeWarm(N) + uCamp.w*30.*exp(-dc*dc/6.);
    if(dT > .05){ float T = vSurfA.y + (vSurfA.x - vSurfA.y)*exp(-uSurfT*vSurfA.z); col += uSOnI*(irCol(T + dT, vSurfA.w) - irCol(T, vSurfA.w)); }
  }
  if(uSOnM > 0.){
    float cov = 0.;
    for(int i = 0; i < 2; i++){ vec4 tx = uMTx[i]; if(tx.w <= 0.) continue;
      vec3 L = tx.xyz - W; float d = length(L); L /= max(d, 1e-3);
      cov += tx.w*(.15 + .85*max(dot(N, L), 0.))/(1. + d*d/(380.*380.))*mix(.4 + .6*step(.55, fract(d/45. - uSurfTime*.7)), .67, eyeSmooth); }
    col += uSOnM*vec3(1., .5, .1)*cov*(1. - .6*inVis)*mix(1., 1. - vSurfB.x, eyeSmooth);
  }
  return col;
}`;
export const ALPEN = { amount: { value: 0 }, dir: { value: new V3() } };

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
  S.scene.add(spectral(mesh, 'canopy', { weight: .5 }));
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
  S.scene.add(spectral(mesh, 'rock', { weight: .35 }));
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
  S.scene.add(spectral(mesh, 'meadow', { weight: .4 }));
}

// A mountain stream crossing the meadow ahead (the trail fords it around z = -64): a strip laid on the terrain,
// water surface properties — a cold line in IR (emissivity drops toward grazing angles: it mirrors the cold sky)
// and dark in microwave (eMW ≈ 0.45). In visible light it mirrors the sky colour.
export const STREAM = { z: -64, pts: [], mat: null };
function stream() {
  const L = [], R_ = [], W = 1.7, n = 140;
  for (let i = 0; i <= n; i++) {
    const s = i / n * 2 - 1, z = STREAM.z + 9 * Math.sin(s * 3.4 + 1) + 3 * Math.sin(s * 11), x = trailX(STREAM.z) - 30 + s * 110;
    STREAM.pts.push(new V3(x, heightAt(x, z) + .12, z));
  }
  STREAM.pts.forEach((p, i, a) => {
    const q = a[Math.min(i + 1, a.length - 1)], o = a[Math.max(i - 1, 0)], d = new V3(q.x - o.x, 0, q.z - o.z).normalize(), side = new V3(-d.z, 0, d.x);
    const w = W * (.75 + .5 * noise2(i * .21, 3.3));
    for (const [arr, k] of [[L, 1], [R_, -1]]) { const x = p.x + side.x * w * k / 2, z = p.z + side.z * w * k / 2; arr.push(x, Math.max(heightAt(x, z), p.y - .25) + .1, z); }
  });
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) pos.push(...L.slice(i * 3, i * 3 + 3), ...R_.slice(i * 3, i * 3 + 3));
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nor = g.attributes.normal.array; for (let i = 0; i < nor.length; i += 3) nor.set([0, 1, 0], i);   // flat water surface
  STREAM.mat = new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  S.scene.add(spectral(new THREE.Mesh(g, STREAM.mat), 'water', { weight: .03 }));
  Object.assign(STREAM.mat.userData.surfInstr, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
}

// Snow faces that see the setting Sun from the trail (south-west side peaks): the alpenglow label points there.
function alpenPeak() {
  const cam = new V3(trailX(20), 0, 20), sun = dirAE(SUN_AZ, 2); let best = null, bs = 0;
  for (let az = 190; az <= 335; az += 2.5) for (let r = 900; r <= 4200; r += 150) {
    const x = cam.x + Math.cos(az * DEG_) * r, z = cam.z + Math.sin(az * DEG_) * r, y = heightAt(x, z);
    if (y < 430) continue;
    const e = 6, n = new V3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
    const toCam = new V3(cam.x - x, 6 - y, cam.z - z).normalize(), sc = Math.max(0, n.dot(sun)) * Math.max(0, n.dot(toCam) + .1) * (y - 380) * (az < 300 ? 1 : .5);
    if (sc > bs) { bs = sc; best = new V3(x, y, z); }
  }
  return best;
}
// A slope ahead-left that faced the afternoon sun (and faces the trail): label for "Sun-warmed slope".
function warmSlope() {
  const cam = new V3(trailX(36), 0, 36), aft = TRAIL_U.uAft.value; let best = null, bs = 0;
  for (let az = 200; az <= 262; az += 2) for (let r = 60; r <= 420; r += 12) {
    const x = cam.x + Math.cos(az * DEG_) * r, z = cam.z + Math.sin(az * DEG_) * r, y = heightAt(x, z), e = 3;
    const n = new V3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
    const toCam = new V3(cam.x - x, 6 - y, cam.z - z).normalize(), sc = clamp((n.dot(aft) - .32) / .4) * Math.max(0, n.dot(toCam)) / (1 + r / 300);
    if (sc > bs) { bs = sc; best = new V3(x, y + 2, z); }
  }
  return best;
}
const DEG_ = Math.PI / 180;
export const SPOTS = {};

export function build() {
  terrain(); trees(); rocks(); grass(); stream();
  SPOTS.alpen = alpenPeak(); SPOTS.warmSlope = warmSlope();
  return {
    groundAt: heightAt,
    walk(t, camera) {   // 42 m -> -40 m along the trail over the minute
      const z = 42 - t * 2.74, x = trailX(z), bob = Math.sin(t * 9) * .03;
      camera.position.set(x, heightAt(x, z) + 1.7 + bob, z);
    },
    update(t) {   // alpenglow: from the last direct sunlight until the high snow loses it
      ALPEN.amount.value = sm(3, 7, t) * (1 - sm(12, 17, t));
      ALPEN.dir.value.copy(dirAE(SUN_AZ, Math.max(sunEl(), 0) + 2));
      TRAIL_U.uSlopeK.value = Math.exp(-t / 9);
      const [c0, c1] = kf(SKY_REFL, t), ml = sm(38, 50, t);   // the stream mirrors the sky (then the Moon)
      STREAM.mat.color.setRGB(c0[0] + ml * .05, c0[1] + ml * .06, c0[2] + ml * .08).multiplyScalar(c1[0]);
    },
  };
}
const SKY_REFL = [[0, [.42, .3, .42], [1]], [10, [.3, .17, .3], [.9]], [18, [.08, .06, .13], [.8]], [26, [.02, .025, .05], [.8]], [60, [.015, .02, .04], [.8]]];
