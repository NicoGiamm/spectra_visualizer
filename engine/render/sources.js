// Spectral sources. Every emitter in every scenario goes through Em (point) or Rib (path);
// never hand-draw meshes for a band effect. `set()` adds to S.act[band] (the meters) and
// hides the mesh when the band is filtered off. The loop hides all sources before update(),
// so a source that should be invisible is simply not set() this frame.
import * as THREE from 'three';
import { V3, lerp } from '../core/util.js';
import { S } from '../core/state.js';
import { BI, GAIN, TRANSMIT } from '../core/bands.js';
import { QUAD_VS, QUAD_FS, RIB_VS, RIB_FS } from './shaders.js';

export const EMS = [], RIBS = [], FIELDS = [];
// display gain: the spectral eye (S.eye, engine/render/compose.js) draws sources at their physical intensity and
// lets each band adapt; the default view keeps the per-band instrument GAIN
const gain = band => (S.eye ? 1 : GAIN[band]);

// Source origin: 'ground' (default) | 'high' | 'space' — pass it as the optional last constructor argument
// or set `src.origin` later. In Ground detector mode, sources whose band can't cross the atmosphere from
// that origin (bands.js TRANSMIT: far-UV, X-ray, gamma from 'high'/'space') are not drawn, add no meter
// activity and leave a ghost marker (one per event) for the overlay.
export const absorbed = (band, origin) => S.detector === 'ground' && origin !== 'ground' && !TRANSMIT[band][origin];
function ghost(src, pos) {
  const key = S.curEvent || src, g = S.ghosts.get(key);
  if (g) g.bands.add(src.band); else S.ghosts.set(key, { pos: pos.clone(), bands: new Set([src.band]) });
}
const quadGeo = new THREE.PlaneGeometry(1, 1);

// LOD: changes only how far sources are drawn, never what emits or when. A source still adds to S.act (meters)
// and leaves its ghost; only the draw is skipped. `size` is a world-space quad width (QUAD_VS adds it in view
// space), so its on-screen width is size * pxK / depth — sky objects on the D-radius sphere are sized for that
// and keep their pixels. Em/EmField quads narrower than minPx are not drawn (sub-pixel quads hit no pixel
// centre and shade nothing); Rib points closer than ribPx on screen to the last kept point are dropped (uv and
// width still follow the full path). skipped: per-frame counters, read by ?dump.
export const LOD = { minPx: 1, ribPx: 1.5, skipped: { em: 0, field: 0, ribPts: 0 }, total: { em: 0, field: 0, ribPts: 0 } };
let pxK = 1;
const _fwd = new V3(), _rel = new V3();
function lodFrame() {
  const c = S.camera, h = S.renderer ? S.renderer.domElement.height : 0;
  pxK = h > 0 ? h * c.zoom / (2 * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2)) : Infinity;
  for (const k in LOD.skipped) LOD.skipped[k] = LOD.total[k] = 0;
}
// pixels per world unit at pos's view depth; Infinity at or behind the near plane (left to the GPU)
function pxPerUnit(pos) {
  const c = S.camera; _fwd.set(0, 0, -1).applyQuaternion(c.quaternion);
  const z = _rel.subVectors(pos, c.position).dot(_fwd);
  return z > c.near ? pxK / z : Infinity;
}

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
  constructor(band, color, real, origin = 'ground') { this.band = band; this.origin = origin; this.m = new THREE.Mesh(quadGeo, bandMat(band, color, false, real)); this.m.frustumCulled = false; this.m.renderOrder = 5; S.scene.add(this.m); EMS.push(this); }
  set(pos, size, I) {
    if (!(I > .01)) return this;
    if (absorbed(this.band, this.origin)) { ghost(this, pos); return this; }
    S.act[this.band] += I; LOD.total.em++;
    if (size * pxPerUnit(pos) < LOD.minPx) { LOD.skipped.em++; this.m.visible = false; return this; }
    const u = this.m.material.uniforms; this.m.position.copy(pos); u.uSize.value = size; u.uI.value = I * gain(this.band);
    this.m.visible = S.on[this.band]; return this;
  }
}

// Path source (camera-facing ribbon drawn in its band's style); fade > 0 makes it grow brighter toward the last point
export class Rib {
  constructor(band, color, maxN = 32, real = 0, origin = 'ground') {
    this.band = band; this.max = maxN; this.origin = origin;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxN * 6), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(maxN * 4), 2));
    const idx = []; for (let i = 0; i < maxN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.m = new THREE.Mesh(g, bandMat(band, color, true, real)); this.m.frustumCulled = false; this.m.renderOrder = 5; S.scene.add(this.m); RIBS.push(this);
  }
  set(pts, w0, w1, I, fade = 0) {
    if (!(I > .01) || pts.length < 2) return this;
    if (absorbed(this.band, this.origin)) { ghost(this, pts[fade > 0 ? Math.min(pts.length, this.max) - 1 : Math.min(pts.length, this.max) >> 1]); return this; }
    S.act[this.band] += I * .5;
    const n = Math.min(pts.length, this.max), pos = this.m.geometry.attributes.position, uv = this.m.geometry.attributes.uv;
    let total = 0; const cum = [0];
    for (let i = 1; i < n; i++) { total += pts[i].distanceTo(pts[i - 1]); cum.push(total); }
    // LOD: keep the ends and every point at least ribPx (on screen) from the last kept one
    const keep = [0];
    for (let i = 1; i < n - 1; i++) if ((cum[i] - cum[keep[keep.length - 1]]) * pxPerUnit(pts[i]) >= LOD.ribPx) keep.push(i);
    keep.push(n - 1);
    const m = keep.length; LOD.total.ribPts += n; LOD.skipped.ribPts += n - m;
    const tg = new V3(), vw = new V3(), sd = new V3();
    for (let k = 0; k < m; k++) {
      const i = keep[k];
      tg.subVectors(pts[keep[Math.min(m - 1, k + 1)]], pts[keep[Math.max(0, k - 1)]]);
      vw.subVectors(S.camera.position, pts[i]);
      sd.crossVectors(tg, vw).normalize().multiplyScalar(lerp(w0, w1, i / (n - 1)) / 2);
      pos.setXYZ(k * 2, pts[i].x + sd.x, pts[i].y + sd.y, pts[i].z + sd.z);
      pos.setXYZ(k * 2 + 1, pts[i].x - sd.x, pts[i].y - sd.y, pts[i].z - sd.z);
      const u = total ? cum[i] / total : 0; uv.setXY(k * 2, u, 1); uv.setXY(k * 2 + 1, u, -1);
    }
    pos.needsUpdate = uv.needsUpdate = true;
    this.m.geometry.setDrawRange(0, (m - 1) * 6);
    const U = this.m.material.uniforms; U.uI.value = I * gain(this.band); U.uFade.value = fade; U.uLen.value = total / Math.max(1e-3, (w0 + w1) / 2);
    this.m.visible = S.on[this.band]; return this;
  }
}

// Many point sources of one band in a single draw call (instanced camera-facing quads, same look as Em).
// Per instance: position, size, intensity, seed, colour. Use for crowds: fireflies, lamps, routers, car lights.
//   const f = new EmField('vis', 120, '#b8ff3a');  f.set(i, pos, size, I);  f.color(i, '#ff0000');
const FIELD_VS = `attribute vec3 iPos; attribute float iSize, iI, iSeed; attribute vec3 iColor;
varying vec2 vUv; flat varying float vI, vSeed; flat varying vec3 vColor;
void main(){ vUv = uv; vI = iI; vSeed = iSeed; vColor = iColor;
  if(iI <= 0.){ gl_Position = vec4(2., 2., 2., 1.); return; }          // unused slot: outside the clip volume
  vec4 mv = modelViewMatrix * vec4(iPos, 1.); mv.xy += position.xy * iSize; gl_Position = projectionMatrix * mv; }`;
const FIELD_FS = QUAD_FS.replace('uniform int uBand; uniform float uI, uTime, uSeed, uReal; uniform vec3 uColor; varying vec2 vUv;',
  'uniform int uBand; uniform float uTime, uReal; varying vec2 vUv; flat varying float vI, vSeed; flat varying vec3 vColor;\n#define uI vI\n#define uSeed vSeed\n#define uColor vColor\n');
if (FIELD_FS === QUAD_FS) throw new Error('EmField: QUAD_FS uniform line changed; update FIELD_FS');

export class EmField {
  constructor(band, n, color, real, origin = 'ground') {
    this.band = band; this.n = n; this.dirty = false; this.origin = origin;
    const g = new THREE.InstancedBufferGeometry();
    g.index = quadGeo.index; g.setAttribute('position', quadGeo.attributes.position); g.setAttribute('uv', quadGeo.attributes.uv);
    const attr = (name, size, arr) => { const a = new THREE.InstancedBufferAttribute(arr, size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    const c = new THREE.Color(color || '#ffffff'), cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(cols, i * 3);
    this.aPos = attr('iPos', 3, new Float32Array(n * 3)); this.aSize = attr('iSize', 1, new Float32Array(n));
    this.aI = attr('iI', 1, new Float32Array(n)); this.aColor = attr('iColor', 3, cols);
    attr('iSeed', 1, Float32Array.from({ length: n }, Math.random));   // visual only: keeps the seeded R stream untouched
    g.instanceCount = n;
    this.m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uBand: { value: BI[band] }, uTime: S.TIME, uReal: { value: real ? 1 : 0 } },
      vertexShader: FIELD_VS, fragmentShader: FIELD_FS,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.m.frustumCulled = false; this.m.renderOrder = 5; this.m.visible = false; S.scene.add(this.m); FIELDS.push(this);
  }
  set(i, pos, size, I) {
    if (!(I > .01)) return this;
    if (absorbed(this.band, this.origin)) { ghost(this, pos); return this; }
    S.act[this.band] += I; LOD.total.field++;
    if (size * pxPerUnit(pos) < LOD.minPx) { LOD.skipped.field++; if (this.aI.array[i]) { this.aI.array[i] = 0; this.aI.needsUpdate = true; } return this; }
    this.aPos.setXYZ(i, pos.x, pos.y, pos.z); this.aSize.array[i] = size; this.aI.array[i] = I * gain(this.band);
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aI.needsUpdate = true;
    this.dirty = true; this.m.visible = S.on[this.band]; return this;
  }
  color(i, c) { (c.isColor ? c : new THREE.Color(c)).toArray(this.aColor.array, i * 3); this.aColor.needsUpdate = true; return this; }
  clear() {
    if (this.dirty) { this.aI.array.fill(0); this.aI.needsUpdate = true; this.dirty = false; }
    this.m.visible = false;
  }
}

export function hideAllSources() { lodFrame(); S.ghosts.clear(); EMS.forEach(e => e.m.visible = false); RIBS.forEach(r => r.m.visible = false); FIELDS.forEach(f => f.clear()); }
