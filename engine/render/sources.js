// Spectral sources. Every emitter in every scenario goes through Em (point) or Rib (path);
// never hand-draw meshes for a band effect. `set()` adds to S.act[band] (the meters) and
// hides the mesh when the band is filtered off. The loop hides all sources before update(),
// so a source that should be invisible is simply not set() this frame.
import * as THREE from 'three';
import { V3, lerp, DEG } from '../core/util.js';
import { S } from '../core/state.js';
import { BI, GAIN, TRANSMIT } from '../core/bands.js';
import { QUAD_VS, QUAD_FS, RIB_VS, RIB_FS } from './shaders.js';
import { SPECTRUM, bandOf, bandPos } from '../core/spectrum.js';

export const EMS = [], RIBS = [], FIELDS = [];
// which look the band shaders draw (shaders.js header): 1 = physical (the spectral eye), 0 = the old stylised symbols
// (?eye=0, pixel-identical). One uniform object shared by every source material, set each frame in hideAllSources()
// from S.eye (compose.js createEye), so it does not matter whether the sources or the eye are built first.
export const PHYS = { value: 0 };
// display gain: the spectral eye (S.eye, engine/render/compose.js) draws sources at their physical intensity and
// lets each band adapt; the default view keeps the per-band instrument GAIN
const gain = band => (S.eye ? 1 : GAIN[band]);
// `see` (the optional last argument of set()): the share of the source's intensity sent along the line of sight to the
// eye — an antenna's beam gain toward the viewer (BEAM below). It scales only what the spectral eye draws: the meters
// (S.act) and the old view keep the event's intensity, so a beam turned away still counts as activity in its band.
const seen = see => (S.eye ? see : 1);
// spectral position of a source inside its band (0 long-wave … 1 short-wave, spectrum.js bandPos): the mean over the
// current event's processes in that band, .5 when it declares none; the eye shifts the band hue with it (uSpec).
// A source that draws ONE of its event's processes names it (`em.proc = 'lunarThermal'`, M11/T6): its position is that
// process's, so an event listing thermal and near-IR processes keeps its thermal glow thermal
const ORIGIN = { ground: 0, high: 1, space: 2 };   // uOrigin: the eye attenuates only ground-origin light by distance
const POS = new Map();
// per frame: Σ I and Σ I·position of the sources set in each band (the eye's diffraction blur picks the band's
// wavelength from it, engine/render/compose.js); reset in hideAllSources()
export const SPEC = Object.fromEntries(Object.keys(GAIN).map(b => [b, { w: 0, wp: 0 }]));
const specAdd = (band, I, pos) => { const s = SPEC[band]; s.w += I; s.wp += I * pos; };
function specPos(band) {
  const e = S.curEvent; if (!e) return .5;
  let m = POS.get(e); if (!m) POS.set(e, m = {});
  if (m[band] === undefined) {
    const ps = (e.freq || []).map(k => SPECTRUM[k]).filter(p => p && bandOf(p) === band);
    m[band] = ps.length ? ps.reduce((a, p) => a + bandPos(p), 0) / ps.length : .5;
  }
  return m[band];
}

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
    uniforms: { uBand: { value: BI[band] }, uI: { value: 0 }, uSpec: { value: .5 }, uOrigin: { value: 0 }, uTime: S.TIME, uPhys: PHYS, uSeed: { value: Math.random() }, uSize: { value: 1 }, uReal: { value: real ? 1 : 0 },
      uColor: { value: new THREE.Color(color || '#ffffff') }, uLen: { value: 1 }, uFade: { value: 0 } },
    vertexShader: ribbon ? RIB_VS : QUAD_VS, fragmentShader: ribbon ? RIB_FS : QUAD_FS,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// Point source (camera-facing glow drawn in its band's style)
export class Em {
  constructor(band, color, real, origin = 'ground') { this.band = band; this.origin = origin; this.m = new THREE.Mesh(quadGeo, bandMat(band, color, false, real)); this.m.frustumCulled = false; this.m.renderOrder = 5; S.scene.add(this.m); EMS.push(this); }
  set(pos, size, I, see = 1) {
    if (!(I > .01)) return this;
    if (absorbed(this.band, this.origin)) { ghost(this, pos); return this; }
    S.act[this.band] += I; LOD.total.em++;
    if (size * pxPerUnit(pos) < LOD.minPx) { LOD.skipped.em++; this.m.visible = false; return this; }
    const Is = I * seen(see); if (!(Is > 0)) { this.m.visible = false; return this; }   // beam turned away: metered, not seen
    const u = this.m.material.uniforms; this.m.position.copy(pos); u.uSize.value = size; u.uI.value = Is * gain(this.band); u.uOrigin.value = ORIGIN[this.origin]; u.uSpec.value = this.proc ? bandPos(SPECTRUM[this.proc]) : specPos(this.band); specAdd(this.band, Is, u.uSpec.value);
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
  set(pts, w0, w1, I, fade = 0, see = 1) {
    if (!(I > .01) || pts.length < 2) return this;
    if (absorbed(this.band, this.origin)) { ghost(this, pts[fade > 0 ? Math.min(pts.length, this.max) - 1 : Math.min(pts.length, this.max) >> 1]); return this; }
    S.act[this.band] += I * .5;
    const Is = I * seen(see); if (!(Is > 0)) { this.m.visible = false; return this; }
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
    const U = this.m.material.uniforms; U.uI.value = Is * gain(this.band); U.uOrigin.value = ORIGIN[this.origin]; U.uSpec.value = specPos(this.band); specAdd(this.band, Is * .5, U.uSpec.value); U.uFade.value = fade; U.uLen.value = total / Math.max(1e-3, (w0 + w1) / 2);
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
      uniforms: { uBand: { value: BI[band] }, uSpec: { value: .5 }, uOrigin: { value: 0 }, uTime: S.TIME, uPhys: PHYS, uReal: { value: real ? 1 : 0 } },
      vertexShader: FIELD_VS, fragmentShader: FIELD_FS,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.m.frustumCulled = false; this.m.renderOrder = 5; this.m.visible = false; S.scene.add(this.m); FIELDS.push(this);
  }
  set(i, pos, size, I, see = 1) {
    if (!(I > .01)) return this;
    if (absorbed(this.band, this.origin)) { ghost(this, pos); return this; }
    S.act[this.band] += I; LOD.total.field++;
    const Is = I * seen(see);
    if (size * pxPerUnit(pos) < LOD.minPx || !(Is > 0)) { LOD.skipped.field += Is > 0 ? 1 : 0; if (this.aI.array[i]) { this.aI.array[i] = 0; this.aI.needsUpdate = true; } return this; }
    this.aPos.setXYZ(i, pos.x, pos.y, pos.z); this.aSize.array[i] = size; this.aI.array[i] = Is * gain(this.band); this.m.material.uniforms.uOrigin.value = ORIGIN[this.origin]; this.m.material.uniforms.uSpec.value = specPos(this.band); specAdd(this.band, Is, this.m.material.uniforms.uSpec.value);
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aI.needsUpdate = true;
    this.dirty = true; this.m.visible = S.on[this.band]; return this;
  }
  color(i, c) { (c.isColor ? c : new THREE.Color(c)).toArray(this.aColor.array, i * 3); this.aColor.needsUpdate = true; return this; }
  clear() {
    if (this.dirty) { this.aI.array.fill(0); this.aI.needsUpdate = true; this.dirty = false; }
    this.m.visible = false;
  }
}

export function hideAllSources() { PHYS.value = S.eye ? 1 : 0; lodFrame(); S.ghosts.clear(); for (const b in SPEC) SPEC[b].w = SPEC[b].wp = 0; EMS.forEach(e => e.m.visible = false); RIBS.forEach(r => r.m.visible = false); FIELDS.forEach(f => f.clear()); }

// ---------------------------------------------------------------- antenna beam patterns (M11/T1)
// What an antenna sends toward the eye depends on the angle between its beam and the line of sight. Each pattern is
// the relative power gain toward the viewer: 1 on the main-lobe peak, never below the antenna's far-sidelobe /
// back-lobe floor. Events take the angles from toViewer() and pass the gain as set()'s last argument (`see`).
const dB = x => 10 ** (x / 10);
// error function, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7)
const erf = x => { const a = Math.abs(x), t = 1 / (1 + .3275911 * a);
  return Math.sign(x) * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-a * a)); };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const BEAM = {
  // half-wave dipole — or a quarter-wave monopole over a ground plane (aircraft blade antennas, whips), same pattern
  // by image theory: G(θ) = [cos(π/2 · cosθ) / sinθ]², θ from the element axis (Balanis, Antenna Theory, 4th ed.,
  // eq. 4-84 and §4.7.4). The doughnut: full broadside, a null along the axis. cosT = cos θ.
  dipole(cosT) { const s2 = 1 - cosT * cosT; return s2 < 1e-6 ? 0 : Math.cos(Math.PI / 2 * cosT) ** 2 / s2; },
  // broadcast antenna (FM / TV): N vertically stacked bays d wavelengths apart, omnidirectional in azimuth; elevation
  // pattern = uniform linear-array factor |sin(Nψ/2) / (N sin(ψ/2))|², ψ = 2π d (sin el − sin tilt) (Balanis §6.3),
  // × the dipole element (vertical axis: cos θ = sin el). `tilt` is the electrical beam tilt (rad, negative = down;
  // broadcasters tilt 0.5–1° down to aim at the service area). Nulls below the main beam are filled in practice
  // (null fill) — floor at −20 dB, STAND-IN.
  array(el, N, d = 1, tilt = -.75 * DEG) { const psi = 2 * Math.PI * d * (Math.sin(el) - Math.sin(tilt)), s = Math.sin(psi / 2);
    const af = Math.abs(s) < 1e-6 ? 1 : (Math.sin(N * psi / 2) / (N * s)) ** 2;
    return Math.max(dB(-20), af * BEAM.dipole(Math.sin(el))); },
  // cell-site sector panel, the 3GPP model: A_H = −min(12 (φ/φ3dB)², 30), A_V = −min(12 ((θ − θtilt)/θ3dB)², 30),
  // A = −min(−(A_H + A_V), 30) dB, φ off the boresight azimuth, θ the depression of the line of sight below the horizon.
  // φ3dB = 65° and the 30 dB caps (front-to-back, side-lobe level): 3GPP TR 38.901 Table 7.3-1; θ3dB = 10°: TR 36.814
  // Table A.2.1.1-2 (38.901 uses 65° vertically); a few degrees of downtilt (STAND-IN, 4°).
  sector(phi, dep, tilt = 4 * DEG, hH = 65 * DEG, hV = 10 * DEG) {
    const aH = Math.min(12 * (wrap(phi) / hH) ** 2, 30), aV = Math.min(12 * ((dep - tilt) / hV) ** 2, 30);
    return dB(-Math.min(aH + aV, 30)); },
  // a site of sectors at boresight azimuths `azs` (rad): their powers add
  sectors(az, dep, azs, tilt) { return Math.min(1, azs.reduce((a, b) => a + BEAM.sector(az - b, dep, tilt), 0)); },
  // reflector / slotted-waveguide array (dish, radar): Gaussian fit to the main lobe, G = exp(−4 ln2 (θ/θ3dB)²),
  // θ3dB ≈ 70 λ/D degrees (Skolnik, Introduction to Radar Systems, 3rd ed., ch. 9), never below the sidelobe floor
  dish(off, hpbw, sll = dB(-30)) { return Math.max(sll, Math.exp(-4 * Math.LN2 * (wrap(off) / hpbw) ** 2)); },
  // a rotating radar seen from the side: the dish pattern averaged over the arc its beam sweeps during the
  // exposure: one frame (tau = 1/60 s), like a camera, so a 1–2° beam that passes in a few milliseconds shows as one
  // short flash, once per turn, whose brightness is its dwell share of the frame (the viewer's own eye then sums that
  // frame like any short flash: Bloch's law, Bloch 1885 — so it is not integrated twice here). off = beam azimuth −
  // azimuth to the eye (rad, the beam turning toward +off), w = angular speed (rad per S.T second).
  sweep(off, hpbw, w, sll = dB(-30), tau = 1 / 60) {
    const sg = hpbw / (2 * Math.sqrt(2 * Math.LN2)), k = sg * Math.SQRT2, a = Math.max(1e-6, Math.abs(w) * tau), o = wrap(off);
    const m = sg * Math.sqrt(Math.PI / 2) * (erf(o / k) - erf((o - a) / k)) / a;   // mean of the lobe over [off − a, off]
    return Math.max(sll, m); },
};
// direction from p to the eye: azimuth as atan2(z, x) (the convention the events' antennas use) and elevation, rad
const _tv = new V3();
export function toViewer(p) { const v = _tv.subVectors(S.camera.position, p); return { az: Math.atan2(v.z, v.x), el: Math.atan2(v.y, Math.hypot(v.x, v.z)) }; }
