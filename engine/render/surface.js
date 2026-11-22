// Spectral surfaces: every solid surface carries physical properties and shows them in each band.
//
//   A = [T0 °C at t=0, Teq °C (night equilibrium), 1/tau (per script-s), eIR (8–14 µm emissivity)]
//   B = [eMW (microwave emissivity), uvAlb (UV albedo), gamma (terrestrial activity, rel.), rRadio (radio reflectivity)]
//   C = [gloss (0 matte … 1 water/glass: emissivity drops at grazing angles), 0, 0, 0]
//
// Temperature T(t) = Teq + (T0 − Teq)·exp(−t/tau): sand and meadows cool fast, rock and asphalt slowly,
// water barely at all — which gives the beach its thermal crossover. Per band:
//   IR     thermal palette of the radiated temperature e·T + (1−e)·T_sky(−35 °C): wet/glossy surfaces at grazing
//          angles mirror the cold sky.
//   Micro  brightness temperature Tb = eMW·T + (1−eMW)·50 K: calm water reads cold, land warm; plus illumination
//          from microwave transmitters (routers, masts) registered with addTx('micro', …), and short local
//          flashes where a ray hits a surface (multipath reflections) registered with addHits('micro', …).
//   Radio  illumination from radio transmitters (addTx('radio', …)): 1/r², Lambert, moving dashes.
//   UV     uvAlb × the remaining UV skylight (fades with the Sun): snow and sand glow at dusk, grass doesn't.
//   Gamma  sparse scintillation speckle ∝ activity: granite sparkles, the sea is almost silent.
//   X-ray  nothing — the ground is dark in X-rays.
// With Visible on, the same layer is added faintly (OVERLAY); with Visible off, the instrument material shows it fully.
import * as THREE from 'three';
import { V3, sm } from '../core/util.js';
import { S } from '../core/state.js';
import { COMMON } from './shaders.js';
import { solid } from './instrument.js';

export const OVERLAY = { value: .12 };
const MAX_TX = 8, MAX_HIT = 12;
const vec4s = () => Array.from({ length: MAX_TX }, () => new THREE.Vector4());
export const SURF_U = {
  uSOnR: { value: 0 }, uSOnM: { value: 0 }, uSOnI: { value: 0 }, uSOnU: { value: 0 }, uSOnG: { value: 0 },
  uOverlay: OVERLAY, uSurfT: { value: 0 }, uUVsky: { value: 0 }, uSurfTime: S.TIME,
  uTxR: { value: vec4s() }, uTxM: { value: vec4s() },
  uHitM: { value: Array.from({ length: MAX_HIT }, () => new THREE.Vector4()) },
};

// ---------------------------------------------------------------- presets (documented reference values)
const P = (T0, Teq, tau, eIR, eMW, uvAlb, gamma, rRadio, gloss = 0) => ({ A: [T0, Teq, tau ? 1 / tau : 0, eIR], B: [eMW, uvAlb, gamma, rRadio], C: [gloss, 0, 0, 0] });
export const PRESET = {
  water:    P(18, 18, 0, .98, .45, .06, .05, .9, 1),    // sea surface: warm all night, cold in microwave
  wetSand:  P(24, 15, 22, .96, .6, .12, .5, .5, .5),
  sand:     P(34, 9, 18, .92, .9, .22, .6, .3),          // dry sand: hot at sunset, radiates fast (heavy minerals: some gamma)
  rock:     P(33, 13, 40, .9, .88, .12, 1, .5),          // granite: slow to cool, highest natural gamma
  snow:     P(-2, -6, 20, .99, .7, .85, .1, .3, .2),     // fresh snow: UV albedo ~0.85
  meadow:   P(24, 7, 10, .97, .92, .03, .3, .2),         // grass: cools fast under a clear sky (dew)
  forest:   P(21, 12, 25, .97, .93, .03, .25, .3),       // canopy keeps warmth longer
  dirt:     P(28, 10, 15, .94, .9, .08, .4, .3),
  asphalt:  P(38, 17, 30, .95, .88, .05, .3, .5),        // stores the day's heat
  concrete: P(32, 16, 30, .93, .88, .1, .5, .6),
  facade:   P(26, 19, 40, .9, .85, .08, .5, .8),         // walls with heated interiors behind them
  wood:     P(22, 14, 25, .9, .9, .05, .1, .3),
};
export function mixSurf(parts) {   // [[preset, weight], ...] -> blended {A, B, C}
  const out = { A: [0, 0, 0, 0], B: [0, 0, 0, 0], C: [0, 0, 0, 0] }; let W = 0;
  for (const [p, w] of parts) { if (w <= 0) continue; W += w; for (const k of 'ABC') for (let i = 0; i < 4; i++) out[k][i] += p[k][i] * w; }
  for (const k of 'ABC') for (let i = 0; i < 4; i++) out[k][i] /= W || 1;
  return out;
}

// ---------------------------------------------------------------- GLSL
export const SURF_VERT_DECL = `
varying vec3 vSurfW; varying vec3 vSurfN;
#ifdef SURF_ATTR
attribute vec4 aSurfA; attribute vec4 aSurfB; attribute vec4 aSurfC; varying vec4 vSurfA; varying vec4 vSurfB; varying vec4 vSurfC;
#endif
`;
export const SURF_VERT_MAIN = `{
  mat4 sm_ = modelMatrix;
  #ifdef USE_INSTANCING
    sm_ = modelMatrix * instanceMatrix;
  #endif
  vSurfW = (sm_ * vec4(position, 1.)).xyz; vSurfN = normalize(mat3(sm_) * normal);
  #ifdef SURF_ATTR
    vSurfA = aSurfA; vSurfB = aSurfB; vSurfC = aSurfC;
  #endif
}`;
export const SURF_FRAG_DECL = COMMON + `
varying vec3 vSurfW; varying vec3 vSurfN;
#ifdef SURF_ATTR
varying vec4 vSurfA; varying vec4 vSurfB; varying vec4 vSurfC;
#else
uniform vec4 uSurfA, uSurfB, uSurfC;
#endif
uniform float uSOnR, uSOnM, uSOnI, uSOnU, uSOnG, uOverlay, uSurfT, uUVsky, uSurfTime;
uniform vec4 uTxR[${MAX_TX}], uTxM[${MAX_TX}], uHitM[${MAX_HIT}];
// ray hit flashes: a spot (~2 m) on the hit face, brighter in the middle
float hitField(vec3 W){
  float f = 0.;
  for(int i = 0; i < ${MAX_HIT}; i++){ if(uHitM[i].w <= 0.) continue;
    vec3 d = W - uHitM[i].xyz; f += uHitM[i].w*exp(-dot(d, d)/4.); }
  return f;
}
float txField(vec4 tx[${MAX_TX}], vec3 W, vec3 N, float range, float dashes){
  float f = 0.;
  for(int i = 0; i < ${MAX_TX}; i++){ if(tx[i].w <= 0.) continue;
    vec3 L = tx[i].xyz - W; float d = length(L); L /= max(d, 1e-3);
    float g = tx[i].w*(.25 + .75*max(dot(N, L), 0.))/(1. + d*d/(range*range));
    if(dashes > 0.) g *= .35 + .65*step(.5, fract(d/dashes - uSurfTime*.9));
    f += g; }
  return f;
}
vec3 surfBands(vec3 W, vec3 N, float inVis){   // inVis = 1 for the faint overlay in visible light: smooth terms only
#ifdef SURF_ATTR
  vec4 A = vSurfA, B = vSurfB, C = vSurfC;
#else
  vec4 A = uSurfA, B = uSurfB, C = uSurfC;
#endif
  vec3 V = W - cameraPosition; float dist = length(V); V /= dist;
  float cosv = clamp(dot(-V, N), 0., 1.), near = (1. - smoothstep(12., 90., dist))*(1. - inVis);
  float T = A.y + (A.x - A.y)*exp(-uSurfT*A.z);
  vec3 col = vec3(0.);
  if(uSOnI > 0.){                                                     // INFRARED
    float e = A.w*mix(1., 1. - .7*pow(1. - cosv, 4.), C.x), Tr = e*T + (1. - e)*(-35.);
    float x = clamp((Tr + 4.)/44., 0., 1.);
    col += uSOnI*thermal(x)*(.04 + .5*x*x);
  }
  if(uSOnM > 0.){                                                     // MICROWAVE
    float Tb = B.x*(T + 273.) + (1. - B.x)*50., x = clamp((Tb - 120.)/180., 0., 1.);
    // crackle only up close, in cells of ~0.2° (like the emitter crackle): power-of-two world cells so they don't swim
    float cs = exp2(floor(log2(max(dist*.0035, .03)))); vec3 gc = mod(floor(W/cs), 512.);
    vec2 g = gc.xz + gc.y*17.31; float sp = step(.96 - .06*x, h21(g + floor(uSurfTime*10.)))*near;
    vec3 c = mix(vec3(1.,.42,0.), vec3(1.,.85,.2), h21(g*1.7));        // per-cell tint on the sparks only
    float tx = txField(uTxM, W, N, 22., 0.), txs = tx/(1. + tx), hit = hitField(W);
    // instrument view with IR on: the thermal palette carries the surfaces, so the smooth Tb/tx wash nearly goes and
    // the sparks halve; ray-hit flashes (and the Em/Rib/EmField emitters, drawn elsewhere) stay at full brightness.
    // The faint visible-light overlay keeps its old mean tint (tx unsaturated, no IR toning).
    float wash = mix((1. - .85*uSOnI)*(x*x*.12 + txs*.22), x*x*.12 + tx*.35, inVis);
    col += uSOnM*(vec3(1.,.6,.1)*wash + (1. - .5*uSOnI)*c*sp*(x*.3 + txs*.9)) + uSOnM*vec3(1.,.93,.75)*hit*1.4;
  }
  if(uSOnR > 0.){                                                     // RADIO
    col += uSOnR*vec3(1.,.31,.85)*B.w*txField(uTxR, W, N, 700., 9.)*1.1;
  }
  if(uSOnU > 0.){                                                     // ULTRAVIOLET
    col += uSOnU*vec3(.62,.3,1.)*B.y*uUVsky*(.35 + .65*max(N.y, 0.))*1.3;
  }
  if(uSOnG > 0.){                                                     // GAMMA
    vec3 gc = floor(W*2.2); float h = h21(gc.xz + gc.y*17.31 + floor(uSurfTime*16.)*3.17);
    col += uSOnG*hsv(fract(uSurfTime*1.1 + h21(gc.xz)))*step(1. - B.z*.03, h)*1.8*(1. - smoothstep(40., 260., dist))*(1. - inVis);
  }
  return col;
}
`;

// ---------------------------------------------------------------- materials
let variant = 0;
const toVec4 = a => new THREE.Vector4(...a);

// instrument (Visible off) material: dark base + structure lines + full surface bands
// vertDecl / vertMain: optional vertex-shader hooks (e.g. a per-instance attribute passed on as a flat varying)
function instrumentMaterial(props, { lines = 'none', cell = 25, extraDecl = '', instrExtra = '', uniforms = {}, vertDecl = '', vertMain = '' } = {}) {
  const attr = props === 'attr';
  return new THREE.ShaderMaterial({
    defines: attr ? { SURF_ATTR: '' } : {},
    uniforms: { ...SURF_U, ...uniforms, ...(attr ? {} : { uSurfA: { value: toVec4(props.A) }, uSurfB: { value: toVec4(props.B) }, uSurfC: { value: toVec4(props.C) } }) },
    vertexShader: SURF_VERT_DECL + vertDecl + `void main(){ ${SURF_VERT_MAIN} ${vertMain}
      gl_Position = projectionMatrix * viewMatrix * vec4(vSurfW, 1.); }`,
    fragmentShader: SURF_FRAG_DECL + extraDecl + `

      void main(){
        vec3 N = normalize(vSurfN), W = vSurfW; float dist = length(W - cameraPosition), line = 0.;
        ${lines === 'topo' ? `float q = W.y/20., f = fract(q); line = (1. - smoothstep(0., fwidth(q)*1.2, min(f, 1. - f)))*(1. - smoothstep(300., 5500., dist));` : ''}
        ${lines === 'grid' ? `vec2 q = W.xz/${cell.toFixed(1)}, f = abs(fract(q) - .5), w = fwidth(q)*1.2;
          line = max(smoothstep(.5 - w.x, .5, f.x), smoothstep(.5 - w.y, .5, f.y))*(1. - smoothstep(.12, .35, max(w.x, w.y)))*(1. - smoothstep(200., 4000., dist));` : ''}
        vec3 c = vec3(.006,.007,.014) + vec3(.16,.2,.42)*line*.8 + surfBands(W, N, 0.);
        ${instrExtra}
        gl_FragColor = vec4(c, 1.);
      }`,
  });
}

function patchVisible(mat, props, { extraDecl = '', visExtra = '', uniforms = {}, vertDecl = '', vertMain = '' } = {}) {
  const attr = props === 'attr', prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey(), id = ++variant;
  const own = attr ? {} : { uSurfA: { value: toVec4(props.A) }, uSurfB: { value: toVec4(props.B) }, uSurfC: { value: toVec4(props.C) } };
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, SURF_U, uniforms, own);
    if (attr) sh.defines = { ...(sh.defines || {}), SURF_ATTR: '' };
    sh.vertexShader = SURF_VERT_DECL + vertDecl + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SURF_VERT_MAIN + vertMain);
    sh.fragmentShader = SURF_FRAG_DECL + extraDecl + '\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      `#include <opaque_fragment>\n{ vec3 N = normalize(vSurfN), W = vSurfW; gl_FragColor.rgb += uOverlay*surfBands(W, N, 1.); ${visExtra} }`);
  };
  mat.customProgramCacheKey = () => `surf${id}|${prevKey}`;
  mat.needsUpdate = true;
}

// Registry of surfaces for the meters (activity is the weighted band response of each surface).
const SURFACES = [];

// Make a mesh spectral. props: PRESET entry / {A,B,C} / 'attr' (geometry has aSurfA/B/C; pass opts.mean for meters).
// opts: lines ('none'|'topo'|'grid'), cell, weight (meter share), visExtra/instrExtra/extraDecl/uniforms (GLSL hooks),
//       vertDecl/vertMain (vertex hooks, both materials),
//       custom: true when the visible material is a ShaderMaterial that already calls surfBands().
export function spectral(mesh, props, opts = {}) {
  if (typeof props === 'string' && props !== 'attr') props = PRESET[props];
  const mat = mesh.material, ud = mat.userData;
  if (!ud.surfInstr) {                                   // a material shared by several meshes is patched once
    if (!opts.custom) patchVisible(mat, props, opts);
    ud.surfInstr = instrumentMaterial(props, opts);
    SURFACES.push({ p: props === 'attr' ? opts.mean : props, w: opts.weight ?? 1 });
  }
  solid(mesh, ud.surfInstr);
  return mesh;
}
// every mesh of a group (props per material: one preset for all, or a function material -> preset name)
export function spectralGroup(group, props, opts = {}) {
  group.traverse(o => { if (o.isMesh) spectral(o, typeof props === 'function' ? props(o.material) : props, opts); });
  return group;
}
// uniforms for a custom ShaderMaterial that includes SURF_FRAG_DECL / calls surfBands()
export const surfaceUniforms = props => ({ ...SURF_U, uSurfA: { value: toVec4(props.A) }, uSurfB: { value: toVec4(props.B) }, uSurfC: { value: toVec4(props.C) } });

// ---------------------------------------------------------------- transmitters
const TX = { radio: [], micro: [] };
// fn() -> { p: Vector3, power } or null; strongest MAX_TX per band are uploaded each frame
export const addTx = (band, fn) => TX[band].push(fn);
// ray hits (multipath): fn() -> [{ p: Vector3 on the surface, power }]; the strongest MAX_HIT flash each frame
const HITS = { micro: [] };
export const addHits = (band, fn) => HITS[band].push(fn);

const tempAt = (A, t) => A[1] + (A[0] - A[1]) * Math.exp(-t * A[2]);
export function updateSurfaces(uvSky) {
  const u = SURF_U, on = S.on, t = S.t;
  u.uSOnR.value = on.radio ? 1 : 0; u.uSOnM.value = on.micro ? 1 : 0; u.uSOnI.value = on.ir ? 1 : 0;
  u.uSOnU.value = on.uv ? 1 : 0; u.uSOnG.value = on.gamma ? 1 : 0;
  u.uSurfT.value = t; u.uUVsky.value = uvSky;
  let txPow = { radio: 0, micro: 0 };
  for (const band of ['radio', 'micro']) {
    const live = TX[band].map(f => f()).filter(x => x && x.power > .01).sort((a, b) => b.power - a.power).slice(0, MAX_TX);
    const arr = band === 'radio' ? u.uTxR.value : u.uTxM.value;
    arr.forEach((v, i) => { const x = live[i]; if (x) v.set(x.p.x, x.p.y, x.p.z, x.power); else v.set(0, 0, 0, 0); });
    txPow[band] = live.reduce((a, x) => a + x.power, 0);
  }
  const hits = HITS.micro.flatMap(f => f() || []).filter(x => x.power > .01).sort((a, b) => b.power - a.power).slice(0, MAX_HIT);
  u.uHitM.value.forEach((v, i) => { const x = hits[i]; if (x) v.set(x.p.x, x.p.y, x.p.z, x.power); else v.set(0, 0, 0, 0); });
  S.act.micro += hits.reduce((a, x) => a + x.power, 0) * .1;   // a few small spots: a small meter share
  // meter activity: weighted band response of every registered surface (same formulas as the shader, no geometry)
  for (const { p, w } of SURFACES) {
    if (!p) continue;
    const T = tempAt(p.A, t), xi = Math.min(1, Math.max(0, (p.A[3] * T + (1 - p.A[3]) * -35 + 2) / 42));
    const Tb = p.B[0] * (T + 273) + (1 - p.B[0]) * 50, xm = Math.min(1, Math.max(0, (Tb - 120) / 180));
    S.act.ir += w * xi * .8; S.act.micro += w * (xm * .3 + txPow.micro * .15);
    S.act.uv += w * p.B[1] * uvSky * 2; S.act.gamma += w * p.B[2] * .35; S.act.radio += w * p.B[3] * txPow.radio * .4;
  }
}
export const uvSkylight = sunEl => sm(-6, 3, sunEl);
export { V3 };
