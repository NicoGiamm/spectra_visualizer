// Spectral sources. Every emitter in every scenario goes through Em (point) or Rib (path);
// never hand-draw meshes for a band effect. `set()` adds to S.act[band] (the meters) and
// hides the mesh when the band is filtered off. The loop hides all sources before update(),
// so a source that should be invisible is simply not set() this frame.
import * as THREE from 'three';
import { V3, lerp } from '../core/util.js';
import { S } from '../core/state.js';
import { BI, GAIN } from '../core/bands.js';
import { QUAD_VS, QUAD_FS, RIB_VS, RIB_FS } from './shaders.js';

export const EMS = [], RIBS = [];
const quadGeo = new THREE.PlaneGeometry(1, 1);

// real = 1 picks the realistic IR look for moving warm bodies (animals, engines)
export function bandMat(band, color, ribbon, real) {
  return new THREE.ShaderMaterial({
    uniforms: { uBand: { value: BI[band] }, uI: { value: 0 }, uTime: S.TIME, uSeed: { value: Math.random() }, uSize: { value: 1 }, uReal: { value: real ? 1 : 0 },
      uColor: { value: new THREE.Color(color || '#ffffff') }, uLen: { value: 1 }, uFade: { value: 0 } },
    vertexShader: ribbon ? RIB_VS : QUAD_VS, fragmentShader: ribbon ? RIB_FS : QUAD_FS,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// Point source (camera-facing glow drawn in its band's style)
export class Em {
  constructor(band, color, real) { this.band = band; this.m = new THREE.Mesh(quadGeo, bandMat(band, color, false, real)); this.m.frustumCulled = false; this.m.renderOrder = 5; S.scene.add(this.m); EMS.push(this); }
  set(pos, size, I) {
    if (!(I > .01)) return this;
    S.act[this.band] += I;
    const u = this.m.material.uniforms; this.m.position.copy(pos); u.uSize.value = size; u.uI.value = I * GAIN[this.band];
    this.m.visible = S.on[this.band]; return this;
  }
}

// Path source (camera-facing ribbon drawn in its band's style); fade > 0 makes it grow brighter toward the last point
export class Rib {
  constructor(band, color, maxN = 32, real = 0) {
    this.band = band; this.max = maxN;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxN * 6), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(maxN * 4), 2));
    const idx = []; for (let i = 0; i < maxN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.m = new THREE.Mesh(g, bandMat(band, color, true, real)); this.m.frustumCulled = false; this.m.renderOrder = 5; S.scene.add(this.m); RIBS.push(this);
  }
  set(pts, w0, w1, I, fade = 0) {
    if (!(I > .01) || pts.length < 2) return this;
    S.act[this.band] += I * .5;
    const n = Math.min(pts.length, this.max), pos = this.m.geometry.attributes.position, uv = this.m.geometry.attributes.uv;
    let total = 0; const cum = [0];
    for (let i = 1; i < n; i++) { total += pts[i].distanceTo(pts[i - 1]); cum.push(total); }
    const tg = new V3(), vw = new V3(), sd = new V3();
    for (let i = 0; i < n; i++) {
      tg.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]);
      vw.subVectors(S.camera.position, pts[i]);
      sd.crossVectors(tg, vw).normalize().multiplyScalar(lerp(w0, w1, i / (n - 1)) / 2);
      pos.setXYZ(i * 2, pts[i].x + sd.x, pts[i].y + sd.y, pts[i].z + sd.z);
      pos.setXYZ(i * 2 + 1, pts[i].x - sd.x, pts[i].y - sd.y, pts[i].z - sd.z);
      const u = total ? cum[i] / total : 0; uv.setXY(i * 2, u, 1); uv.setXY(i * 2 + 1, u, -1);
    }
    pos.needsUpdate = uv.needsUpdate = true;
    this.m.geometry.setDrawRange(0, (n - 1) * 6);
    const U = this.m.material.uniforms; U.uI.value = I * GAIN[this.band]; U.uFade.value = fade; U.uLen.value = total / Math.max(1e-3, (w0 + w1) / 2);
    this.m.visible = S.on[this.band]; return this;
  }
}

export function hideAllSources() { EMS.forEach(e => e.m.visible = false); RIBS.forEach(r => r.m.visible = false); }
