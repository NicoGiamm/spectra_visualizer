// Spectral surfaces: every solid surface carries physical properties and shows them in each band.
//
//   A = [T0 °C at t=0, Teq °C (night equilibrium), 1/tau (per script-s), eIR (8–14 µm emissivity)]
//   B = [eMW (microwave emissivity), uvAlb (UV albedo), gamma (terrestrial activity, rel.), rRadio (radio reflectivity)]
//   C = [gloss (0 matte … 1 water/glass: emissivity drops at grazing angles), Tradio, Tmicro, Tgamma]
//       T* = the fraction of radio / microwave / gamma light from behind that gets through (spectral eye, M10/T6:
//       long waves and gamma cross walls, foliage and thin matter that block light); see TRANS below
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
  uSOnR_: { value: 0 }, uSOnM_: { value: 0 }, uSOnI_: { value: 0 }, uSOnU_: { value: 0 }, uSOnG_: { value: 0 },
  uOverlay: OVERLAY, uRadioDiffuse: { value: 1 }, uSurfT: { value: 0 }, uUVsky: { value: 0 }, uSurfTime: S.TIME,
  uTxR: { value: vec4s() }, uTxM: { value: vec4s() },
  uHitM: { value: Array.from({ length: MAX_HIT }, () => new THREE.Vector4()) },
};

// ---------------------------------------------------------------- presets (documented reference values)
// Sources, one per column (short keys used in the row comments):
//   eIR   broadband 8–14 µm emissivity: [Sal] Salisbury & D'Aria 1992, Remote Sens. Environ. 42:83; [EL] ASTER /
//         ECOSTRESS spectral library (Baldridge et al. 2009; Meerdink et al. 2019); [MOD] MODIS UCSB emissivity
//         library (Wan & Snyder); snow: Hori et al. 2006, Remote Sens. Environ. 100:486; water: Masuda et al. 1988.
//   eMW   passive microwave emissivity ~10–37 GHz near nadir: [UMF] Ulaby, Moore & Fung, Microwave Remote Sensing
//         vol. III (1986), and Ulaby & Long 2014; calm sea: Wilheit 1979; dry snow: Mätzler 1994 (volume scattering
//         lowers it at 37 GHz); a metal is a near-perfect reflector (Kirchhoff: e = 1 − R ≈ 0).
//   uvAlb UV albedo, UV-B → UV-A (the dusk skylight is mostly UV-A): [FG] Feister & Grewe 1995, Photochem. Photobiol.
//         62:736 (vegetation 0.016–0.017, bare soil 0.04–0.05, concrete 0.07–0.10 in UV-B; dry bright beach sand
//         0.14 at 300 nm → 0.24 at 400 nm); [WHO] Global Solar UV Index guide 2002 (fresh snow up to 0.8, dry beach
//         sand ~0.15, sea foam ~0.25, water/grass/soil below 0.1); fresh snow 0.9+ in UV-B: Blumthaler & Ambach 1988.
//   gamma terrestrial gamma dose rate relative to granite (= 1): [UN] UNSCEAR 2000 Annex B, D = 0.0417·K + 0.462·U +
//         0.604·Th nGy/h per Bq/kg; granite K ~1200, U ~60, Th ~80 Bq/kg → ~125 nGy/h; world-median soil (K 400,
//         U 35, Th 30) → ~50 nGy/h ≈ 0.4; [RP112] EC Radiation Protection 112 (1999): concrete ~0.4, brick ~0.6 of
//         granite. Water and snow shield the ground (cosmic + K-40 in sea water only).
//   T0/Teq/tau surface temperature at sunset, clear-sky night equilibrium (mid-latitude summer evening) and cooling
//         time — STAND-INS chosen per scene, time-compressed to script-seconds; only their ORDER is physical, from the
//         thermal admittance μ (J m⁻² s⁻½ K⁻¹) in [Oke] Oke 1987, Boundary Layer Climates, Table 2.1 / urban table:
//         fresh snow 130, wood ~380, dry sandy soil 620, brick ~1070, asphalt ~1200, still water 1545 (mixing makes
//         the sea effectively infinite), wet sand 2550, concrete ~2200, stone/granite ~2200. Vegetation cools fastest
//         despite its water: the canopy is thermally decoupled from the soil (dew); forest canopies trap longwave.
//   rRadio radio reflectivity — STAND-IN (relative, stylised): conductors and sea water high, dry ground low.
// Transmission [Tradio, Tmicro, Tgamma] of what a surface stands for (C.yzw), for light from behind it:
//   ground (terrain, water, paving): radio .05 — knife-edge diffraction over a ridge costs ~13 dB at VHF (ITU-R P.526),
//     the "bending round hills"; microwave 0 — diffraction loss grows ~10 dB per frequency decade (~25 dB at 1–3 GHz);
//     gamma 0 — metres of rock/soil (1.46 MeV in rock: ~6 cm attenuation length)
//   canopy (a tree crown, ~10 m of foliage): radio .9 — ~0.05 dB/m at 100 MHz (ITU-R P.833); microwave .2 —
//     Weissberger 1982 (ECAC-TR-81-101), d < 14 m branch L = 0.45 f^0.284 d dB ≈ 6 dB at 2.4 GHz, 10 m (T ≈ .25);
//     gamma .95 — crown biomass ~1 kg/m³ × 10 m = 1 g/cm² at μ/ρ .052 cm²/g (1.46 MeV); the biomass is a STAND-IN
//   facade (a whole building: several walls and floors): radio .1 — ~10 dB building entry loss at VHF (ITU-R P.2109
//     order of magnitude); microwave .002 — ≥ 25–30 dB at 2–5 GHz across a building; gamma 0
//   wood (boardwalks, huts: a few cm): radio .95, microwave .6 — ~2 dB through 3–5 cm of wood at 2.4 GHz (ITU-R P.2040
//     dry wood ε'≈2, loss tangent ~.05); gamma .88 — 2.5 g/cm² at μ/ρ .052
//   body (an animal or a person: ~30 cm of tissue ≈ water): radio .5 — STAND-IN (the body absorbs/scatters VHF but is
//     smaller than its wavelength); microwave .01 — ~20 dB through a torso at 2.4 GHz (ITU-R P.2040 tissue ε″; body-loss
//     measurements ~15–30 dB); gamma .2 — 30 cm of water at μ/ρ .058 cm²/g (1.46 MeV)
const TRANS = { ground: [.05, 0, 0], canopy: [.9, .25, .95], facade: [.1, .002, 0], wood: [.95, .6, .88], body: [.5, .01, .2] };
const P = (T0, Teq, tau, eIR, eMW, uvAlb, gamma, rRadio, gloss = 0, tr = TRANS.ground) => ({ A: [T0, Teq, tau ? 1 / tau : 0, eIR], B: [eMW, uvAlb, gamma, rRadio], C: [gloss, ...tr] });
export const PRESET = {
  // sea surface: warm all night (no cooling), cold in microwave. eIR .98 [Masuda, EL]; eMW .45 calm sea [Wilheit, UMF];
  // uvAlb .06 [WHO, FG: water < 0.1]; gamma .05 (sea water shields, K-40 only) [UN]
  water:    P(18, 18, 0, .98, .45, .06, .05, .9, 1),
  // eIR .96 (pore water) [EL]; eMW .6 (moist soil 0.6–0.7) [UMF]; uvAlb .12 (wet sand darker than dry) [FG];
  // gamma .25 like ordinary quartz sand [UN]; slower than dry sand (μ 2550 vs 620) [Oke], but an exception to the μ
  // order against concrete/rock: swash and evaporation tie it to the sea's temperature (Teq near the sea's 18 °C)
  wetSand:  P(24, 15, 22, .96, .6, .12, .25, .5, .5),
  // dry quartz sand: hot at sunset, radiates fast (μ 620) [Oke]. eIR .92 (quartz reststrahlen dip at 8–9.5 µm) [Sal, EL];
  // eMW .9 [UMF]; uvAlb .22 (UV-A end of 0.14–0.24) [FG]; gamma .3 — quartz is nearly inert, typical beach sand
  // 20–40 nGy/h [UN]; heavy-mineral (monazite/zircon) sands are higher — see the seaside's local preset
  sand:     P(34, 9, 18, .92, .9, .22, .3, .3),
  // granite: slow to cool (μ ~2200) [Oke], the reference for gamma (= 1) [UN]. eIR .9 [Sal, EL]; eMW .88 [UMF];
  // uvAlb .12 — STAND-IN (no UV albedo measurement for granite found; a bit above concrete's 0.07–0.10 [FG] for pale granite)
  rock:     P(33, 13, 40, .9, .88, .12, 1, .5),
  // fresh snow: lowest thermal admittance (μ 130) → cools fastest [Oke]; eIR .99 [Hori]; eMW .7 dry snow at 37 GHz
  // [Mätzler]; uvAlb .85 [WHO, Blumthaler & Ambach]; gamma .1 (snowpack shields the ground) [UN]
  snow:     P(-2, -6, 10, .99, .7, .85, .1, .3, .2),
  // grass: cools fast under a clear sky (canopy decoupled, dew). eIR .97 [EL, MOD]; eMW .92 [UMF]; uvAlb .03 [FG];
  // gamma .3 — soil beneath (~0.4), lowered by soil moisture and the organic layer [UN]
  meadow:   P(24, 7, 10, .97, .92, .03, .3, .2),
  // canopy keeps warmth longer (trapped longwave). eIR .97 [EL, MOD]; eMW .93 [UMF]; uvAlb .03 [FG]; gamma .25 (soil
  // under litter) [UN]
  forest:    P(21, 12, 25, .97, .93, .03, .25, .3),
  // canopy: tree crowns as objects (same emission as forest; the forest floor / forested terrain stays ground)
  canopy:    P(21, 12, 25, .97, .93, .03, .25, .3, 0, TRANS.canopy),
  // bare dry soil / trail. eIR .94 [Sal, MOD]; eMW .9 dry soil [UMF]; uvAlb .08 (UV-A end; 0.04–0.05 in UV-B) [FG];
  // gamma .4 world-median soil [UN]; μ ~600–1000 [Oke] ≥ dry sand's 620, so it cools no faster than sand
  dirt:     P(28, 10, 20, .94, .9, .08, .4, .3),
  // stores the day's heat (μ ~1200) [Oke]. eIR .95 [EL]; eMW .88 urban surfaces [UMF]; uvAlb .05 [WHO];
  // gamma .3 — STAND-IN (aggregate-dependent, below concrete; RP112 tabulates no asphalt row)
  asphalt:  P(38, 17, 30, .95, .88, .05, .3, .5),
  // μ ~2200 [Oke]. eIR .93 [EL]; eMW .88 [UMF]; uvAlb .1 (0.07–0.10) [FG]; gamma .4 (typical concrete ~0.42 of granite) [RP112]
  concrete: P(32, 16, 30, .93, .88, .1, .4, .6),
  // brick/plaster walls with heated interiors behind them (Teq kept high and tau held up by the interior — STAND-IN). eIR .9
  // (brick 0.90–0.93) [EL]; eMW .85 [UMF]; uvAlb .08 — STAND-IN (like concrete, a bit darker); gamma .5 (brick ~0.65, plaster far lower: a mix) [RP112]
  facade:    P(26, 19, 40, .9, .85, .08, .5, .8, 0, TRANS.facade),
  // μ ~380 [Oke] (below sand and soil, so it cools faster than both); eIR .9 (0.90–0.95) [EL]; eMW .9 [UMF]; uvAlb .05 — STAND-IN (dark organic surface, like soil [FG]);
  // gamma .1 (K-40 only) [UN]
  wood:      P(22, 14, 12, .9, .9, .05, .1, .3, 0, TRANS.wood),
  // warm-blooded body (M10/T9): the skin / fur surface stays ~30 °C all night (metabolism: no cooling, tau 0) —
  // STAND-IN between bare skin (~33 °C) and fur / clothing (~20–30 °C on a cool night); eIR .98 — human skin 0.98
  // (Steketee 1973, Phys. Med. Biol. 18:686), animal fur 0.95–0.99; eMW .6 — STAND-IN (wet tissue reflects microwaves,
  // skin emissivity ~0.5–0.7 at 10–40 GHz); uvAlb .05 — STAND-IN (skin / fur UV-A reflectance ~5–10 %); gamma .02 —
  // body K-40 ~60 Bq/kg vs ~1200 Bq/kg in granite [UN]; rRadio .3 — STAND-IN
  body:      P(30, 30, 0, .98, .6, .05, .02, .3, 0, TRANS.body),
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
uniform float uSOnR_, uSOnM_, uSOnI_, uSOnU_, uSOnG_, uOverlay, uRadioDiffuse, uSurfT, uUVsky, uSurfTime;
// band switches = uniform × eye mask: the spectral eye (engine/render/compose.js) evaluates one band at a time by
// setting the masks; everywhere else they stay 1, so the switches are exactly the uniforms
float eyeMR = 1., eyeMM = 1., eyeMI = 1., eyeMU = 1., eyeMG = 1.;
// eyeSmooth = 1 inside the spectral eye's hooks: stylised random speckle is replaced by its expected value (the eye
// adds the real detection statistics itself, photon grain / speckle — compose.js); 0 everywhere else
float eyeSmooth = 0.;
#define uSOnR (uSOnR_*eyeMR)
#define uSOnM (uSOnM_*eyeMM)
#define uSOnI (uSOnI_*eyeMI)
#define uSOnU (uSOnU_*eyeMU)
#define uSOnG (uSOnG_*eyeMG)
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
    vec2 g = gc.xz + gc.y*17.31; float sp = mix(step(.96 - .06*x, h21(g + floor(uSurfTime*10.)))*near, 0., eyeSmooth);   // eye: none — the sparks are decoration, the emission is the Tb wash
    vec3 c = mix(vec3(1.,.42,0.), vec3(1.,.85,.2), h21(g*1.7));        // per-cell tint on the sparks only
    float tx = txField(uTxM, W, N, 22., 0.), txs = tx/(1. + tx), hit = hitField(W);
    // instrument view with IR on: the thermal palette carries the surfaces, so the smooth Tb/tx wash nearly goes and
    // the sparks halve; ray-hit flashes (and the Em/Rib/EmField emitters, drawn elsewhere) stay at full brightness.
    // The faint visible-light overlay keeps its old mean tint (tx unsaturated, no IR toning).
    float wash = mix((1. - .85*uSOnI)*(x*x*.12 + txs*.22), x*x*.12 + tx*.35, inVis);
    col += uSOnM*(vec3(1.,.6,.1)*wash + (1. - .5*uSOnI)*c*sp*(x*.3 + txs*.9)) + uSOnM*vec3(1.,.93,.75)*hit*1.4;
  }
  if(uSOnR > 0.){                                                     // RADIO
    col += uSOnR*uRadioDiffuse*vec3(1.,.31,.85)*B.w*txField(uTxR, W, N, 700., 9.)*1.1;
  }
  if(uSOnU > 0.){                                                     // ULTRAVIOLET
    col += uSOnU*vec3(.62,.3,1.)*B.y*uUVsky*(.35 + .65*max(N.y, 0.))*1.3;
  }
  if(uSOnG > 0.){                                                     // GAMMA
    vec3 gc = floor(W*2.2); float h = h21(gc.xz + gc.y*17.31 + floor(uSurfTime*16.)*3.17);
    // eye: the expected value (hit probability B.z·.03 × 1.8 × mean hue luminance ~.6) at every distance — terrestrial
    // gamma does not fade with distance, the near fade is a display LOD of the speckle
    col += uSOnG*mix(hsv(fract(uSurfTime*1.1 + h21(gc.xz)))*step(1. - B.z*.03, h)*1.8*(1. - smoothstep(40., 260., dist))*(1. - inVis),
                     vec3(B.z*.03*1.8*.6), eyeSmooth);
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

function patchVisible(mat, props, { extraDecl = '', visExtra = '', instrExtra = '', uniforms = {}, vertDecl = '', vertMain = '' } = {}) {
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
  mat.userData.eyeBands = eyeBandsGLSL(instrExtra);
  mat.needsUpdate = true;
}

// The spectral eye's hook (engine/render/compose.js): the surface's emission per band, the same terms as the
// instrument view (surfBands + instrExtra, full detail) without its dark base and lines, one band at a time via
// the eye masks, as luminance into the eye's band outputs: o1 = (IR, UV, gamma, coverage), o3 = (radio, micro,
// X-ray, coverage). The ground is dark in X-rays and opaque in every band (coverage 1).
export const eyeBandsGLSL = (instrExtra = '') => `
#ifdef SURF_ATTR
vec3 eyeTrans(){ return vSurfC.yzw; }
#else
vec3 eyeTrans(){ return uSurfC.yzw; }
#endif
vec3 eyeSurfC(){ vec3 N = normalize(vSurfN), W = vSurfW; float dist = length(W - cameraPosition), line = 0.;
  vec3 c = surfBands(W, N, 0.); ${instrExtra}
  return c; }
float eyeSurfL(float r, float m, float i, float u, float g){ eyeMR = r; eyeMM = m; eyeMI = i; eyeMU = u; eyeMG = g; eyeSmooth = 1.; return eyeL(eyeSurfC()); }
void eyeBands(out vec4 o1, out vec4 o3){
  o1 = vec4(eyeSurfL(0., 0., 1., 0., 0.), eyeSurfL(0., 0., 0., 1., 0.), eyeSurfL(0., 0., 0., 0., 1.), 1.);
  o3 = vec4(eyeSurfL(1., 0., 0., 0., 0.), eyeSurfL(0., 1., 0., 0., 0.), 0., 1.);
  eyeMR = eyeMM = eyeMI = eyeMU = eyeMG = 1.; eyeSmooth = 0.; }`;

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
  u.uSOnR_.value = on.radio ? 1 : 0; u.uSOnM_.value = on.micro ? 1 : 0; u.uSOnI_.value = on.ir ? 1 : 0;
  u.uSOnU_.value = on.uv ? 1 : 0; u.uSOnG_.value = on.gamma ? 1 : 0;
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
