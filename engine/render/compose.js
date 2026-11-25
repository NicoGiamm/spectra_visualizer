// The spectral eye (M10): one physically grounded way of seeing every band at once.
//
// Instead of drawing the visible world and laying the invisible bands over it with fixed gains, the scene is drawn
// ONCE into a multiple-render-target (MRT) frame: every material writes its visible light to output 0 and its
// emission in each invisible band, as luminance, to more outputs, so each band becomes its own layer at the cost of
// a single scene pass:
//
//   output 0  visible RGB                       (what the material draws today, minus the 12 % band overlay)
//   output 1  (IR, UV, X-ray, coverage)         optical bands: fog, smoke, cloud hide them (X-ray sits here harmlessly:
//                                               the air absorbs it within metres, long before any fog bank)
//   output 2  output 1 × spectral position      (where in its band the light is: 0 long-wave … 1 short-wave),
//             except its IR channel: the near-IR (0.7–1.4 µm) luminance — output 1's IR channel is then thermal only
//             (M11/T3: two detectors in one IR goggle, see "Near-IR" below)
//   output 3  (radio, microwave, gamma, cov.)   long waves and gamma: they cross fog and cloud (0.01–0.1 g/cm² of water)
//   output 4  output 3 × spectral position
//
// The alpha of outputs 1–4 is the coverage a transparent medium has in that group (blending uses each output's
// own alpha): the IR mist writes coverage into outputs 1/2 only, so it hides the warm ground in IR but not the
// radio links behind it. Sources (Em / Rib / EmField, uniform uBand) write their band's channel, the spectral
// position comes from their event's processes (uSpec, sources.js / spectrum.js bandPos); surfaces registered with
// spectral() bring a GLSL hook `eyeBands(out o1, out o3)` (engine/render/surface.js eyeBandsGLSL, or a scenario's
// own for custom shaders) and take their position from SURF_POS; every other material writes nothing there —
// black if opaque (it occludes), nothing if transparent. No MSAA on the five outputs (memory: 5 half-float
// outputs × 4 samples would be ~750 MB at 1080p × 1.5 pixel ratio); FXAA on the result instead.
// Output 5 holds the frontmost opaque surface's transmission (Tradio, Tmicro, Tgamma) for light from behind it (surface
// PRESET C.yzw; T_PROP for plain props).
//
// What each band sees through (M10/T6). Radio, microwave and gamma sources live on layer 1 only, so the scene pass
// skips them; they are drawn once in a second pass without depth test, against (T, distance) of the frontmost opaque
// surface copied from the scene pass: in front of it as is, behind it × its transmission.
//   * Air. Every ground-origin fragment is attenuated by exp(−α d) over its own line-of-sight distance d (from its depth),
//     α per band from EXTINCTION (bands.js: microwave gas ~0.05 dB/km, IR 8–14 µm window, UV Rayleigh + aerosol) and,
//     for X-ray / gamma, from the photon energy (XCOM_AIR): X-rays die within metres, terrestrial gamma within a few
//     hundred metres. UV haze also glows: opaque fragments add the path radiance UV_PATH·uUVsky·(1 − e^(−α d)) (UV_PATH in luminance units, bands.js).
//     Sky sources ('high' / 'space') are left to the detector (Orbit / Ground, TRANSMIT). Visible keeps the scene fog.
//     A scenario without air (createAtmosphere opts.air = false, M12/T5: the orbit) sets eyeAtm = 0 like ?eatm=0: no
//     extinction and no UV haze between emitter and eye; the detector switch keeps its meaning (TRANSMIT).
//   * Matter. Radio, microwave and gamma sources hidden behind the frontmost opaque surface are drawn again in a
//     second pass (layer 1, no depth test) scaled by that surface's transmission: radio through buildings and round
//     hills, microwave through foliage, gamma through thin walls. One occluder only (the frontmost).
//
// Each layer is then seen by its own receptor:
//
//   1. Adaptation. Every band is seen by the same receptor model: the layer's mean luminance La (the field a
//      receptor adapts to) sets its gain E = key / (Lref^(1−p) · max(La, floor)^p), floor = floorRel · Lref.
//      p < 1 is partial adaptation (a receptor compensates only part of a change in its field — Weber behaviour
//      with a compressive exponent, cf. Naka & Rushton 1966; Ferwerda et al. 1996 for vision): night stays darker
//      than dusk, a band whose whole field glows (IR terrain) is turned down, a dark band turned up — but never
//      past the floor, the receptor's absolute threshold, so an empty band stays black instead of amplifying
//      nothing. Lref is the band's operating point (LREF, engine/core/bands.js): the field level its receptor is
//      built for, like rods and cones have their own. La follows the scene asymmetrically: brightening fast,
//      dark adaptation slow (tauUp / tauDown; light adaptation takes ~seconds, dark adaptation minutes —
//      Hecht, Haig & Chase 1937 — time-compressed like everything else on the script). The log-average (Reinhard
//      et al. 2002) was tried first: a half-black frame (the sky in most invisible bands) drags it to the floor
//      and every band saturates.
//   2. Hue. An invisible band is one hue (BANDS colour, brightest channel 1) carrying its adapted luminance,
//      rotated slightly with the light's position in the band (±hueShift/2 rad around the grey axis: FM radio vs a
//      VLF sferic, 10 µm thermal glow vs near-IR); the visible layer keeps its colour, slightly desaturated (night
//      vision is less coloured).
//   2b. Sharpness. Each band is blurred by diffraction at its receptor aperture (APERTURE, bands.js): a Gaussian of
//      σ ≈ 0.42 λ / D (the Airy core; first null at 1.22 λ / D) in screen pixels for the current field of view. λ is
//      the band's wavelength this frame: the intensity-weighted spectral position of its sources (sources.js SPEC)
//      and of its surfaces (SURF_POS, weighted by their meter activity), mapped back to a wavelength (posLambda).
//      Radio (100 m array) and microwave (1 m dish) are soft, IR at 10 µm through a 7 mm pupil about a pixel,
//      visible / UV sharper than a pixel (not blurred), X-ray / gamma not diffraction-limited. Built as one
//      downsample to 2^k of the frame and a separable Gaussian there (σ' = σ / 2^k in [2, 4)), sampled bilinearly
//      in the combine; σ is capped at a quarter of the frame height (beyond that the band is only a glow).
//   2c. Detection statistics. Light arrives as photons: for the same energy flux the photon rate scales as 1/E, so a
//      pixel that would collect N = L · K / E photons this frame (E = hc/λ from the band's spectral position there)
//      shows Poisson(N) / N · L — the mean is kept, the noise is √N/N. One quantum constant K for every band, set so
//      the darkest visible night sky (L ≈ .01, 2 eV) keeps < 2 % shot noise (the visible scene stays smooth); the
//      photon energy alone then makes X-ray (~keV, ×500) grainy at its faint edges and gamma (~MeV, ×5·10⁵) a
//      sparse flicker of single hits whose density follows the source's rate. IR / microwave photons are so
//      cheap that N is astronomically large: smooth. Radio is coherent (wave, not photon-counting): transmitters and
//      their reflections show speckle — a fully developed field (exponential intensity, mean 1) with the grain of the
//      radio resolution element, drifting slowly (scintillation), applied per emitter in the material wrappers
//      (eyeSpeckle); the incoherent sky (galactic synchrotron) has none. Seeds are visual-only (render rule 9).
//   3. Combine. The hue-coded layers are summed and stretched with the colour-preserving asinh of Lupton et al.
//      2004 (PASP 116:133): out = C · asinh(β I) / (β I), I = mean(C), clipped by the brightest channel so hues
//      survive. Faint things stay linear, bright ones compress logarithmically — no band can wash out the others.
//
// Near-IR (M11/T3). Infrared is two worlds: thermal (8–14 µm, emission: warm is bright) and near-IR (0.7–1.4 µm,
// what night-vision goggles see: reflected moonlight, twilight and airglow — leaves bright by the red edge — plus
// lamps, IR illuminators and flames). Their radiances differ by ~5 orders of magnitude and no single detector sees
// both, so the IR band is a fused goggle (bands.js NIR: image intensifier + thermal camera, as the ENVG): no 7th output —
// output 1's IR channel carries thermal, output 2's IR channel (the position slot) the near-IR luminance.
// Sources split their IR light by spectral position (smoothstep 3 µm → 1 µm: an 850 nm illuminator or the sodium
// 819 nm line is near-IR, a 4 µm exhaust thermal); surfaces bring eyeNIR() (surface.js surfNIR: nirAlb × the Moon and
// sky). Each channel has its own adaptation (state column 7 for near-IR): thermal the shared receptor model; near-IR the
// tube's automatic brightness control (full adaptation, p = 1, above its threshold NIR.floorLx), so the screen holds its
// brightness and the darkness shows as photon grain: the near-IR photons are counted at the real near-IR radiance
// (the scene-scale layer × surface.js uNirPhot, real / scene light), so a moonlit field scintillates. Thermal is blurred by diffraction at 10 µm (its position is now fixed at
// the window centre), near-IR is sharp (0.42 · 0.8 µm / 7 mm ≈ 5e-5 rad, below a pixel). Near-IR is drawn in NIR.color
// (a white-phosphor tube), thermal in the IR hue.
// Within a band only one scalar gain is applied before the stretch, so the band's own brightness ratios are kept.
// Sources are drawn at their physical intensity: GAIN (bands.js) is not applied while the eye is on (S.eye).
// Pipeline: EyePass (MRT scene pass → reduce → adapt → combine) → NaN guard → bloom → FXAA → OutputPass, no tone mapping
// (the stretch is the tone curve). URL knobs: ?ekey= &ep= &efloor=<floorRel> &ebeta= ; ?eyedbg = adaptation readout.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { S } from '../core/state.js';
import { BANDS, LREF, APERTURE, EXTINCTION, XCOM_AIR, UV_PATH, NIR, EXTINCTION_NIR } from '../core/bands.js';
import { applyVisMode } from './instrument.js';
import { SURF_U, OVERLAY } from './surface.js';
import { bandPos, posLambda, bandEdges } from '../core/spectrum.js';
import { ENV } from '../world/atmosphere.js';
import { COMMON } from './shaders.js';
import { SPEC, EMS, RIBS, FIELDS } from './sources.js';

const IDS = BANDS.map(b => b.id);                    // 0 radio, 1 micro, 2 ir, 3 vis, 4 uv, 5 xray, 6 gamma (uBand order)
// where each band lives in the MRT: [output, channel]
export const SLOT = { radio: [3, 0], micro: [3, 1], ir: [1, 0], vis: [0, -1], uv: [1, 1], xray: [1, 2], gamma: [3, 2] };
export const EYE = { key: .05, p: .5, floorRel: .01, beta: 6, satVis: .7, tauUp: .15, tauDown: 1.5, hueShift: .6, quanta: 5e5, cell: 2 };
// spectral position of the landscape's own emission, from what the surface terms model (surface.js header):
// IR = 10 µm thermal (8–14 µm window), UV = 365 nm skylight (UV-A), gamma = 1.46 MeV (K-40 line; U/Th lines nearby),
// radio = 100 MHz (the FM transmitters it mirrors), microwave = 20 GHz (the 10–37 GHz emissivities), X-ray: none
const SURF_POS = { ir: bandPos({ lam: 10e-6 }), uv: bandPos({ lam: 365e-9 }), gamma: bandPos({ E: 1.46e6 }),
  radio: bandPos({ f: 100e6 }), micro: bandPos({ f: 20e9 }), xray: .5 };
// near-IR (M11/T3): the surfaces' reflected near-IR at 0.8 µm (SPECTRUM.nirReflect); a source's near-IR share runs
// from 0 at NIR.split[0] (3 µm) to 1 at NIR.split[1] (1 µm) of its spectral position
const NIR_POS = bandPos({ lam: 800e-9 }), NIR_SPLIT = NIR.split.map(lam => bandPos({ lam }));
const v3 = (a, b, c) => `vec3(${a.toFixed(4)}, ${b.toFixed(4)}, ${c.toFixed(4)})`;

// ---------------------------------------------------------------- material patch (every material in the scene)
const glf = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const EDGE = id => { const [lo, hi] = bandEdges(id); return `vec2(${Math.log(lo).toFixed(5)}, ${Math.log(hi).toFixed(5)})`; };
// props without a surface preset (animals, vehicles, poles, crates): mostly smaller than a VHF wavelength, so they
// barely block radio; vehicles are metal (microwave blocked); a few cm of matter for gamma — STAND-IN [radio, micro, gamma]
const T_PROP = [.7, .2, .7];
const EYE_TOP = `layout(location = 1) out highp vec4 eyeO1;
layout(location = 2) out highp vec4 eyeO2;
layout(location = 3) out highp vec4 eyeO3;
layout(location = 4) out highp vec4 eyeO4;
layout(location = 5) out highp vec4 eyeO5;
uniform float eyeNear, eyeFar, eyeTanY, eyeAspect, eyeUV, eyeP2, eyeAtm, eyeGround, eyeSpk, eyeTime; uniform vec2 eyeRes; uniform sampler2D eyeTZ;
float eyeL(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
// distance (m) from the eye to this fragment, from its depth
float eyeDist(){ float z = gl_FragCoord.z*2. - 1., zv = 2.*eyeNear*eyeFar/(eyeFar + eyeNear - z*(eyeFar - eyeNear));
  vec2 ndc = gl_FragCoord.xy/eyeRes*2. - 1.; return zv*length(vec3(ndc.x*eyeTanY*eyeAspect, ndc.y*eyeTanY, 1.)); }
// air attenuation length for X-ray / gamma: NIST XCOM dry air (bands.js XCOM_AIR), log-log, × 1.205e-3 g/cm³ → 1/m
const float eyeXE[${XCOM_AIR.length}] = float[${XCOM_AIR.length}](${XCOM_AIR.map(r => glf(r[0])).join(', ')});
const float eyeXM[${XCOM_AIR.length}] = float[${XCOM_AIR.length}](${XCOM_AIR.map(r => glf(r[1])).join(', ')});
float eyeMuAir(float keV){ float lk = log(clamp(keV, eyeXE[0], eyeXE[${XCOM_AIR.length - 1}]));
  for(int i = 0; i < ${XCOM_AIR.length - 1}; i++){ float a = log(eyeXE[i]), b = log(eyeXE[i + 1]);
    if(lk <= b) return exp(mix(log(eyeXM[i]), log(eyeXM[i + 1]), (lk - a)/(b - a)))*.1205; }
  return eyeXM[${XCOM_AIR.length - 1}]*.1205; }
// transmission of the air over d metres for band b (uBand order) at spectral position pos
float eyeAtt(int b, float pos, float d){
  float a = b == 1 ? ${glf(EXTINCTION.micro)} : b == 2 ? ${glf(EXTINCTION.ir)} : b == 4 ? ${glf(EXTINCTION.uv)} : ${glf(EXTINCTION.radio)};
  if(b == 5 || b == 6){ vec2 L = b == 5 ? ${EDGE('xray')} : ${EDGE('gamma')};
    a = eyeMuAir(1.23984e-9/exp(L.y - pos*(L.y - L.x))); }
  return exp(-a*d*eyeAtm); }
// coherent radio (transmitters and their reflections) shows speckle: a fully developed field (|complex Gaussian|²,
// mean ≈ 1) with the grain of its resolution element, drifting slowly; applied before the diffraction blur, so the
// grain is 3 σ of it. The incoherent sky (galactic synchrotron) has none.
float eyeH(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float eyeN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(eyeH(i), eyeH(i + vec2(1, 0)), f.x), mix(eyeH(i + vec2(0, 1)), eyeH(i + vec2(1, 1)), f.x), f.y); }
float eyeSpeckle(){ vec2 q = gl_FragCoord.xy/max(eyeSpk, 1.) + vec2(eyeTime*.11, eyeTime*.07);
  float a = eyeN(q) - .5, c = eyeN(q + vec2(31.7, 11.3)) - .5, d = eyeN(q*1.7 + vec2(5.1, 47.)) - .5, e = eyeN(q*1.7 + vec2(19.3, 3.9)) - .5;
  return ((a + .6*d)*(a + .6*d) + (c + .6*e)*(c + .6*e))/.1; }
float eyeNirShare(float pos){ return smoothstep(${NIR_SPLIT[0].toFixed(4)}, ${NIR_SPLIT[1].toFixed(4)}, pos); }
float eyeAttN(float d){ return exp(-${glf(EXTINCTION_NIR)}*d*eyeAtm); }                     // near-IR through the air
float eyeUVpath(float d){ return eyeAtm*eyeUV*${glf(UV_PATH)}*(1. - exp(-${glf(EXTINCTION.uv)}*d)); }
`;
const ZERO = 'eyeO1 = vec4(0.); eyeO2 = vec4(0.); eyeO3 = vec4(0.); eyeO4 = vec4(0.); eyeO5 = vec4(0.);';
const SRC_MAIN = `
uniform float uSpec, uOrigin;
void main(){ ${ZERO} eyeMain_();
  if(uBand != 3){ float l = eyeL(gl_FragColor.rgb); gl_FragColor = vec4(0.);
    float d = eyeDist(), ln = 0.;
    if(uBand == 2){ ln = l*eyeNirShare(uSpec); l -= ln;                     // IR: near-IR share → output 2, thermal → output 1
      if(uOrigin < .5){ ln *= eyeAttN(d); l *= eyeAtt(2, uSpec, d); } }
    else if(uOrigin < .5) l *= eyeAtt(uBand, uSpec, d);                  // ground-origin light crosses the air to the eye
    if(uBand == 0) l *= eyeSpeckle();                                      // coherent radio
    if(eyeP2 > .5){                                                       // second pass: in front of the frontmost opaque
      vec4 tz = texelFetch(eyeTZ, ivec2(gl_FragCoord.xy), 0);                //   surface → as is; behind it → × its T
      bool hidden = d > tz.w*1.0005;
      if(!hidden && eyeP2 > 1.5) discard;                                   //   (?epen=only / glass: just the hidden part)
      if(hidden) l *= uBand == 0 ? tz.r : uBand == 1 ? tz.g : tz.b; }
    vec3 v = vec3(0.), w = vec3(0.);
    if(uBand == 2) v.r = l; else if(uBand == 4) v.g = l; else if(uBand == 5) v.b = l;
    else if(uBand == 0) w.r = l; else if(uBand == 1) w.g = l; else w.b = l;
    eyeO1 = vec4(v, 1.); eyeO2 = vec4(ln, v.gb*uSpec, 1.); eyeO3 = vec4(w, 1.); eyeO4 = vec4(w*uSpec, 1.); }
  else if(eyeP2 > .5) discard; }`;
// surfaces: their band emission (hook), crossed through the air; opaque ones add the UV haze in front of them and
// write their transmission for the penetration pass
// (a hook may #define EYE_OWN_SPECKLE — it applies the radio speckle itself, to its coherent part only (transmitter
// reflections; thermal emission and the mirrored synchrotron sky are incoherent: M11/T2);
// it may #define EYE_SKY — the sky's own emission: no air in front of it — and its own spectral positions
// EYE_POS_A = (IR, UV, gamma), EYE_POS_L = (radio, micro, X-ray); and #define EYE_NIR with float eyeNIR() — its
// near-IR luminance (M11/T3; without it the surface is black in near-IR))
const SURF_MAIN = opaque => `
#ifndef EYE_POS_A
#define EYE_POS_A ${v3(SURF_POS.ir, SURF_POS.uv, SURF_POS.gamma)}
#endif
#ifndef EYE_POS_L
#define EYE_POS_L ${v3(SURF_POS.radio, SURF_POS.micro, SURF_POS.xray)}
#endif
void main(){ ${ZERO} eyeMain_(); eyeBands(eyeO1, eyeO3);
#ifdef EYE_NIR
  float eyeNv = eyeNIR();
#else
  float eyeNv = 0.;
#endif
#ifndef EYE_SKY
  float d = eyeDist(); eyeNv *= eyeAttN(d);
  eyeO1.rgb *= vec3(eyeAtt(2, EYE_POS_A.x, d), eyeAtt(4, EYE_POS_A.y, d), eyeAtt(6, EYE_POS_A.z, d));
  eyeO3.rgb *= vec3(eyeAtt(0, EYE_POS_L.x, d), eyeAtt(1, EYE_POS_L.y, d), 1.);
#ifndef EYE_OWN_SPECKLE
  eyeO3.r *= eyeSpeckle();                                                // coherent radio reflections
#endif
  ${opaque ? 'eyeO1.g += eyeUVpath(d); eyeO5 = vec4(eyeTrans(), 1.);' : ''}
#endif
  // hooks hand gamma in o1.b and X-ray in o3.b; the outputs keep gamma with the long waves (fog and cloud don't hide
  // it) and X-ray with the optical bands
  float hg = eyeO1.b; eyeO1.b = eyeO3.b; eyeO3.b = hg;
  eyeO2 = vec4(eyeNv, eyeO1.gb*vec2(EYE_POS_A.y, EYE_POS_L.z), eyeO1.a);   // IR slot: near-IR (M11/T3)
  eyeO4 = vec4(eyeO3.rgb*vec3(EYE_POS_L.xy, EYE_POS_A.z), eyeO3.a); }`;
// everything else: an opaque prop is black in every band (it occludes), with the UV haze in front of it and T_PROP;
// a transparent one writes nothing
const PLAIN_MAIN = opaque => `
void main(){ ${ZERO} eyeMain_();
  ${opaque ? `float d = eyeDist(); eyeO1 = vec4(0., eyeUVpath(d), 0., 1.); eyeO2 = vec4(0., eyeO1.g*${SURF_POS.uv.toFixed(4)}, 0., 1.);
  eyeO3 = vec4(0., 0., 0., 1.); eyeO4 = vec4(0., 0., 0., 1.); eyeO5 = vec4(${v3(...T_PROP)}, 1.);` : ''} }`;
const MAIN_RE = /void\s+main\s*\(\s*(void)?\s*\)/;

function eyeShader(src, m) {
  if (!MAIN_RE.test(src)) throw new Error(`spectral eye: no main() in the fragment shader of ${m.type} ${m.name}`);
  const body = src.replace(MAIN_RE, 'void eyeMain_()');
  if (m.uniforms && m.uniforms.uBand) return EYE_TOP + body + SRC_MAIN;
  const opaque = !m.transparent;
  if (m.userData.eyeBands) return EYE_TOP + body + m.userData.eyeBands + SURF_MAIN(opaque);
  return EYE_TOP + body + PLAIN_MAIN(opaque);
}
function patch(m) {
  if (!m || m.userData.eyeMRT) return;
  m.userData.eyeMRT = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); Object.assign(sh.uniforms, EYE_U); sh.fragmentShader = eyeShader(sh.fragmentShader, m); };
  m.customProgramCacheKey = () => `eye|${prevKey}`;
  m.needsUpdate = true;
}
// uniforms every patched material shares (set once per frame by the EyePass)
const EYE_U = { eyeNear: { value: .2 }, eyeFar: { value: 4e4 }, eyeTanY: { value: 1 }, eyeAspect: { value: 1 }, eyeRes: { value: new THREE.Vector2(1, 1) },
  eyeUV: SURF_U.uUVsky, eyeP2: { value: 0 }, eyeTZ: { value: null }, eyeAtm: { value: 1 }, eyeGround: { value: 0 }, eyeSpk: { value: 1 }, eyeTime: { value: 0 } };
const patchScene = scene => scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(patch); });

// ---------------------------------------------------------------- reduce / adapt / combine
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const LUM = `float lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
vec4 clean(vec4 c){ return (any(isnan(c)) || any(isinf(c))) ? vec4(0.) : max(c, 0.); }`;

// 4×4 box reduction: first level picks the band's luminance (uSel channel; visible: luminance of RGB) and stores
// (log L, max L, L); later levels average / max those
const REDUCE_FS = LUM + `uniform sampler2D tSrc; uniform vec2 uSrcF; uniform vec4 uSel; uniform int uFirst;
void main(){ ivec2 uSrc = ivec2(uSrcF), o = ivec2(gl_FragCoord.xy)*4; float s = 0., m = 0., a = 0., n = 0.;
  for(int j = 0; j < 4; j++) for(int i = 0; i < 4; i++){ ivec2 p = o + ivec2(i, j);
    if(p.x >= uSrc.x || p.y >= uSrc.y) continue;
    vec4 c = texelFetch(tSrc, p, 0);
    if(uFirst == 1){ c = clean(c); float l = uSel.a > 1.5 ? lum(c.rgb) : dot(c.rgb, uSel.rgb); s += log(l + 1e-5); m = max(m, l); a += l; }
    else { s += c.r; m = max(m, c.g); a += c.b; }
    n += 1.; }
  gl_FragColor = vec4(s/max(n, 1.), m, a/max(n, 1.), 1.); }`;

// 8×1 adaptation state: column b follows band b's 1×1 reduction, fast when it brightens, slow when it darkens
// (columns 0–6 the bands in uBand order, 7 the near-IR channel of IR, M11/T3)
const ADAPT_FS = `uniform sampler2D tPrev, tR0, tR1, tR2, tR3, tR4, tR5, tR6, tR7; uniform float uUp, uDown;
vec4 cur(int b){ ivec2 z = ivec2(0); if(b == 0) return texelFetch(tR0, z, 0); if(b == 1) return texelFetch(tR1, z, 0);
  if(b == 2) return texelFetch(tR2, z, 0); if(b == 3) return texelFetch(tR3, z, 0); if(b == 4) return texelFetch(tR4, z, 0);
  if(b == 5) return texelFetch(tR5, z, 0); if(b == 6) return texelFetch(tR6, z, 0); return texelFetch(tR7, z, 0); }
void main(){ int b = int(gl_FragCoord.x); vec4 p = texelFetch(tPrev, ivec2(b, 0), 0);
  if(b > 7){ gl_FragColor = p; return; }
  vec4 c = cur(b); gl_FragColor = mix(p, c, c.b > p.b ? uUp : uDown); }`;

// after the scene pass: (transmission of the frontmost opaque surface, its distance) per pixel, for the penetration pass;
// no opaque surface: T = 1, distance = far
const TZ_FS = `uniform sampler2D tDepth, tT; uniform float uNear, uFar, uTanY, uAspect, uGlass; varying vec2 vUv;
void main(){ float z = texture2D(tDepth, vUv).r*2. - 1., zv = 2.*uNear*uFar/(uFar + uNear - z*(uFar - uNear));
  vec2 ndc = vUv*2. - 1.; float d = zv*length(vec3(ndc.x*uTanY*uAspect, ndc.y*uTanY, 1.));
  vec4 t = texture2D(tT, vUv); gl_FragColor = vec4(t.a > .5 && uGlass < .5 ? t.rgb : vec3(1.), d); }`;

// diffraction blur: one band's (luminance, luminance × position) from the MRT, box-averaged over 2^k × 2^k pixels
// with 4×4 bilinear taps
const DOWN_FS = LUM + `uniform sampler2D tL, tS; uniform vec4 uSel; uniform vec2 uPx; uniform float uB; varying vec2 vUv;
void main(){ vec2 a = vec2(0.);
  for(int j = 0; j < 4; j++) for(int i = 0; i < 4; i++){ vec2 o = (vec2(float(i), float(j)) - 1.5)*.25*uB*uPx;
    a += vec2(dot(clean(texture2D(tL, vUv + o)).rgb, uSel.rgb), dot(clean(texture2D(tS, vUv + o)).rgb, uSel.rgb)); }
  gl_FragColor = vec4(a/16., 0., 1.); }`;
const GAUSS_FS = `uniform sampler2D t; uniform vec2 uDir; uniform float uSigma; varying vec2 vUv;
void main(){ vec4 a = vec4(0.); float w = 0.; float R = ceil(3.*uSigma);
  for(int i = -16; i <= 16; i++){ float x = float(i); if(abs(x) > R) continue;
    float k = exp(-.5*x*x/(uSigma*uSigma)); a += k*texture2D(t, vUv + x*uDir); w += k; }
  gl_FragColor = a/w; }`;

const COMBINE_FS = COMMON + LUM + `uniform sampler2D tV, tB1, tS1, tB2, tS2, tA, tBl0, tBl1, tBl2, tBl4; uniform vec4 uBl; varying vec2 vUv;
uniform vec2 uLogLam[7]; uniform float uK, uSeed, uCell;
uniform vec3 uNirHue; uniform float uPosT, uPosN, uNirP, uNirRef, uNirFloor, uNirPhot;
float hs(vec2 p, float k){ return fract(sin(dot(p + uSeed*vec2(91.7, 37.3) + k*vec2(13.1, 71.9), vec2(12.9898, 78.233)))*43758.5453); }
// photons counted this frame at a pixel that expects N: Poisson by inversion (N ≤ 12) or its Gaussian limit
float poisson(float N, vec2 p){
  if(N > 12.){ float u1 = max(hs(p, 1.), 1e-6), u2 = hs(p, 2.); return max(0., N + sqrt(N)*sqrt(-2.*log(u1))*cos(6.2832*u2)); }
  float u = hs(p, 3.), t = exp(-N), c = t, k = 0.;
  for(int i = 0; i < 40; i++){ if(u <= c) break; k += 1.; t *= N/k; c += t; }
  return k; }
// band b's luminance after photon counting (E from its spectral position: λ = exp(logλhi − pos·(logλhi − logλlo)))
// photons are counted per detector cell of uCell × uCell px (the receptor element; X-ray / gamma have no optics, so a
// hit is one cell): N per cell = L · K / E · uCell², every pixel of the cell shows the same count
float photons(int b, float l, float ls, vec2 p){
  if(l <= 0.) return 0.;
  float lam = exp(uLogLam[b].y - clamp(ls/l, 0., 1.)*(uLogLam[b].y - uLogLam[b].x)), N = l*uK*lam/1.23984e-6*uCell*uCell;
  return N > 1e5 ? l : l*poisson(N, floor(p/uCell))/N; }
uniform vec3 uHue[7]; uniform float uOn[7], uLref[7], uW[7]; uniform float uKey, uP, uFloorRel, uBeta, uSatVis, uShift, uAbs, uShare;
// adapted: each band's receptor adapts to its own layer; absolute (uAbs): one receptor, adapted to the visible field,
// for every band — the invisible bands then show at their raw level next to visible light
float gain(int b){ float La = texelFetch(tA, ivec2(uAbs > .5 ? 3 : b, 0), 0).b;
  return uKey/(pow(uLref[b], 1. - uP)*pow(max(La, uFloorRel*uLref[b]), uP)); }
// near-IR (M11/T3): the intensifier's own adaptation (state column 7): automatic brightness control, p = 1 above
// its threshold uNirFloor (bands.js NIR)
float gainN(){ float La = texelFetch(tA, ivec2(uAbs > .5 ? 3 : 7, 0), 0).b;
  return uKey/(pow(uNirRef, 1. - uNirP)*pow(max(La, uNirFloor), uNirP)); }
// band b's colour: its hue rotated around the grey axis by (position − .5)·uShift (Rodrigues), brightest channel 1
vec3 bandC(int b, float l, float ls){
  if(l <= 0.) return vec3(0.);
  float a = (clamp(ls/l, 0., 1.) - .5)*uShift, c = cos(a), s = sin(a); vec3 k = vec3(.57735), h = uHue[b];
  h = max(h*c + cross(k, h)*s + k*dot(k, h)*(1. - c), 0.); h /= max(max(h.r, h.g), max(h.b, 1e-4));
  return uOn[b]*uW[b]*h*l*gain(b); }
void main(){
  vec3 v = clean(texture2D(tV, vUv)).rgb;
  vec4 b1 = clean(texture2D(tB1, vUv)), s1 = clean(texture2D(tS1, vUv)), b2 = clean(texture2D(tB2, vUv)), s2 = clean(texture2D(tS2, vUv));
  // diffraction-blurred bands (uBl: radio, micro, IR, UV) replace their sharp channel
  vec2 bR = uBl.x > .5 ? texture2D(tBl0, vUv).rg : vec2(b2.r, s2.r), bM = uBl.y > .5 ? texture2D(tBl1, vUv).rg : vec2(b2.g, s2.g);
  // IR: thermal (output 1, blurred at 10 µm, fixed position) and near-IR (output 2's IR slot, sharp) — M11/T3
  float lT = uBl.z > .5 ? texture2D(tBl2, vUv).r : b1.r, lN = s1.r;
  vec2 bI = vec2(lT, lT*uPosT), bU = uBl.w > .5 ? texture2D(tBl4, vUv).rg : vec2(b1.g, s1.g);
  // detection statistics: photon counting (smooth where N is large); radio speckle is applied per coherent emitter
  vec2 px = gl_FragCoord.xy;
  bM.x = photons(1, bM.x, bM.y, px); bI.x = photons(2, bI.x, bI.y, px + 1001.); bU.x = photons(4, bU.x, bU.y, px + 2011.);
  float lx = photons(5, b1.b, s1.b, px + 3007.), lg = photons(6, b2.b, s2.b, px + 4001.);
  // the tube's grain: photocathode shot noise, counted at the real near-IR radiance (scene units × uNirPhot, surface.js)
  lN = photons(2, lN*uNirPhot, lN*uNirPhot*uPosN, px + 5003.)/uNirPhot;
  v *= gain(3);
  vec3 cV = uOn[3]*uW[3]*mix(vec3(lum(v)), v, uSatVis), c0 = bandC(0, bR.x, bR.y), c1 = bandC(1, bM.x, bM.y), c2 = bandC(2, bI.x, bI.y),
       c4 = bandC(4, bU.x, bU.y), c5 = bandC(5, lx, s1.b), c6 = bandC(6, lg, s2.b);
  c2 += uOn[2]*uW[2]*uNirHue*lN*gainN();                                   // near-IR joins the IR band (fused goggle)
  vec3 C = cV + c0 + c1 + c2 + c4 + c5 + c6;
  // the stretch is one scalar per pixel: k = asinh(βI)/(βI) · β/asinh(β) (I = 1 maps to 1), divided by the brightest
  // channel where a pixel saturates (keeps the hue) — so each band's share of the displayed pixel is lum(c_b)·k
  float I = (C.r + C.g + C.b)/3., k = (I > 1e-6 ? asinh(uBeta*I)/(uBeta*I) : 1.)*uBeta/asinh(uBeta);
  float m = max(C.r, max(C.g, C.b))*k; if(m > 1.) k /= m;
  if(uShare > .5){   // share pass (?dump): displayed luminance per band, radio micro IR vis | UV X-ray gamma total
    gl_FragColor = uShare < 1.5 ? vec4(lum(c0), lum(c1), lum(c2), lum(cV))*k : vec4(lum(c4), lum(c5), lum(c6), lum(C))*k; return; }
  gl_FragColor = vec4(C*k, 1.); }`;

// mean of a SHARE_W × SHARE_H float target (x < 1: target A, x ≥ 1: target B) into a 2×1 target
const SHARE_W = 128, SHARE_H = 80;
const MEAN_FS = `uniform sampler2D tA, tB;
void main(){ vec4 a = vec4(0.); bool first = gl_FragCoord.x < 1.;
  for(int y = 0; y < ${SHARE_H}; y++) for(int x = 0; x < ${SHARE_W}; x++) a += first ? texelFetch(tA, ivec2(x, y), 0) : texelFetch(tB, ivec2(x, y), 0);
  gl_FragColor = a/${(SHARE_W * SHARE_H).toFixed(1)}; }`;
// read w×h RGBA floats of the bound target asynchronously (pixel-pack buffer + fence, polled on timers until signalled):
// a synchronous readPixels stalls the GPU and logs a console warning, which fails `spectra timeline`
function readAsync(gl, w, h) {
  const n = w * h * 4, buf = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.bufferData(gl.PIXEL_PACK_BUFFER, n * 4, gl.STREAM_READ);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
  return new Promise(res => {
    const poll = () => {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) { setTimeout(poll, 0); return; }   // timers, not frames: no frame render between polls
      gl.deleteSync(sync); const out = new Float32Array(n);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteBuffer(buf); res(out);
    };
    requestAnimationFrame(poll);
  });
}

const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
// hue = the band colour scaled to a brightest channel of 1 (normalising to equal luminance instead multiplies a deep
// red like IR's by ~3.7, so every IR pixel above ~0.1 clipped to flat red)
const hueOfC = col => { const c = new THREE.Color(col); const m = Math.max(c.r, c.g, c.b); return new THREE.Vector3(c.r / m, c.g / m, c.b / m); };
const hueOf = id => hueOfC(BANDS.find(b => b.id === id).color);
const PENETRATE = new Set(['radio', 'micro', 'gamma']);   // bands that cross matter (output 5 / penetration pass)
const BLUR = ['radio', 'micro', 'ir', 'uv'];       // bands with an aperture (vis is sub-pixel and RGB: never blurred)
const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType, depthBuffer: false };
const SEL = id => { const [o, ch] = SLOT[id]; return o === 0 ? new THREE.Vector4(0, 0, 0, 2) : new THREE.Vector4(ch === 0 ? 1 : 0, ch === 1 ? 1 : 0, ch === 2 ? 1 : 0, 0); };

class EyePass extends Pass {
  constructor(scene, camera, q) {
    super();
    Object.assign(this, { scene, camera, first: true, dbg: q.has('eyedbg'), dbgN: 0, ratio: q.has('eyeratio') ? 0 : -1, chains: {} });
    for (const [k, n] of [['ekey', 'key'], ['ep', 'p'], ['efloor', 'floorRel'], ['ebeta', 'beta']]) if (q.has(k)) EYE[n] = +q.get(k);
    // comparison switches: ?eatm=0 no air between emitter and eye, ?epen=0 no penetration pass
    // (a scenario without air — atmosphere.js opts.air false, the orbit — has no air between emitter and eye either)
    EYE_U.eyeAtm.value = q.get('eatm') === '0' || ENV.air === false ? 0 : 1; this.pen = q.get('epen') !== '0'; this.penOnly = q.get('epen') === 'only' || q.get('epen') === 'glass'; this.glass = q.get('epen') === 'glass';   // glass: test, every occluder T = 1   // only: just what crossed matter
    this.mrt = new THREE.WebGLMultipleRenderTargets(1, 1, 6, { type: THREE.HalfFloatType });
    this.mrt.depthTexture = new THREE.DepthTexture(1, 1); this.mrt.depthTexture.type = THREE.UnsignedIntType;
    this.tz = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, type: THREE.FloatType });
    this.tzQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: TZ_FS, uniforms: {
      tDepth: { value: null }, tT: { value: null }, uGlass: { value: 0 }, uNear: { value: .2 }, uFar: { value: 4e4 }, uTanY: { value: 1 }, uAspect: { value: 1 } } }));
    this.reduceQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: REDUCE_FS,
      uniforms: { tSrc: { value: null }, uSrcF: { value: new THREE.Vector2() }, uSel: { value: new THREE.Vector4() }, uFirst: { value: 1 } } }));
    const au = { tPrev: { value: null }, uUp: { value: 1 }, uDown: { value: 1 }, tR7: { value: null } }; IDS.forEach((_, i) => au['tR' + i] = { value: null });
    this.adaptQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: ADAPT_FS, uniforms: au }));
    this.adapt = [0, 1].map(() => new THREE.WebGLRenderTarget(8, 1, { ...rtOpts, type: THREE.FloatType }));
    this.combineQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: COMBINE_FS, uniforms: {
      tV: { value: null }, tB1: { value: null }, tS1: { value: null }, tB2: { value: null }, tS2: { value: null }, tA: { value: null }, uShift: { value: EYE.hueShift },
      uHue: { value: IDS.map(hueOf) }, uOn: { value: IDS.map(() => 0) }, uLref: { value: IDS.map(id => LREF[id]) },
      uKey: { value: 0 }, uP: { value: 0 }, uFloorRel: { value: 0 }, uBeta: { value: 0 }, uSatVis: { value: EYE.satVis },
      uW: { value: IDS.map(() => 1) }, uAbs: { value: 0 }, uShare: { value: 0 },
      tBl0: { value: null }, tBl1: { value: null }, tBl2: { value: null }, tBl4: { value: null }, uBl: { value: new THREE.Vector4() },
      uLogLam: { value: IDS.map(id => { const [lo, hi] = bandEdges(id); return new THREE.Vector2(Math.log(lo), Math.log(hi)); }) },
      uK: { value: EYE.quanta }, uCell: { value: EYE.cell }, uSeed: { value: 0 },
      uNirHue: { value: hueOfC(NIR.color) }, uPosT: { value: SURF_POS.ir }, uPosN: { value: NIR_POS },
      uNirP: { value: NIR.abc ? 1 : EYE.p }, uNirRef: { value: LREF.ir }, uNirFloor: { value: 0 }, uNirPhot: { value: 1 } } }));
    this.downQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: DOWN_FS,
      uniforms: { tL: { value: null }, tS: { value: null }, uSel: { value: new THREE.Vector4() }, uPx: { value: new THREE.Vector2() }, uB: { value: 1 } } }));
    this.gaussQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: GAUSS_FS,
      uniforms: { t: { value: null }, uDir: { value: new THREE.Vector2() }, uSigma: { value: 1 } } }));
    this.blur = Object.fromEntries(BLUR.map(b => [b, { sigma: 0, k: -1, a: null, c: null }]));
  }
  // σ (px) of band b's diffraction blur this frame, from its wavelength mix and its aperture
  sigmaPx(b) {
    const D = APERTURE[b]; if (!D) return 0;
    const sp = SPEC[b], wSurf = Math.max(0, S.act[b] - sp.w), w = sp.w + wSurf;
    // IR: only the thermal channel is blurred, at the 8–14 µm window (the near-IR channel is sharp, M11/T3)
    const pos = b === 'ir' ? SURF_POS.ir : w > 1e-9 ? (sp.wp + wSurf * SURF_POS[b]) / w : SURF_POS[b];
    const radPx = THREE.MathUtils.degToRad(this.camera.fov) / this.camera.zoom / this.mrt.height;
    return Math.min(.42 * posLambda(b, pos) / D / radPx, this.mrt.height / 4);
  }
  // downsample band b to 2^k and blur it there (H then V); returns the texture, or null when σ < 0.5 px
  blurBand(renderer, b) {
    const sig = this.sigmaPx(b), B = this.blur[b]; B.sigma = sig;
    if (!(sig >= .5) || !S.on[b]) return null;
    const k = Math.max(0, Math.floor(Math.log2(sig / 2))), w = Math.ceil(this.mrt.width / 2 ** k), h = Math.ceil(this.mrt.height / 2 ** k);
    if (B.k !== k || !B.a || B.a.width !== w || B.a.height !== h) {
      B.a?.dispose(); B.c?.dispose(); B.k = k;
      B.a = new THREE.WebGLRenderTarget(w, h, lin); B.c = new THREE.WebGLRenderTarget(w, h, lin);
    }
    const [o] = SLOT[b], du = this.downQ.material.uniforms, gu = this.gaussQ.material.uniforms;
    du.tL.value = this.mrt.texture[o]; du.tS.value = this.mrt.texture[o + 1]; du.uSel.value = SEL(b);
    du.uPx.value.set(1 / this.mrt.width, 1 / this.mrt.height); du.uB.value = 2 ** k;
    renderer.setRenderTarget(B.a); this.downQ.render(renderer);
    gu.uSigma.value = sig / 2 ** k;
    gu.t.value = B.a.texture; gu.uDir.value.set(1 / w, 0); renderer.setRenderTarget(B.c); this.gaussQ.render(renderer);
    gu.t.value = B.c.texture; gu.uDir.value.set(0, 1 / h); renderer.setRenderTarget(B.a); this.gaussQ.render(renderer);
    return B.a.texture;
  }
  setSize(w, h) {
    this.mrt.setSize(w, h); this.tz.setSize(w, h);
    for (const id of [...IDS, 'nir']) {
      (this.chains[id] || []).forEach(r => r.dispose());
      const chain = []; let cw = w, ch = h;
      do { cw = Math.ceil(cw / 4); ch = Math.ceil(ch / 4); chain.push(new THREE.WebGLRenderTarget(cw, ch, rtOpts)); } while (cw > 1 || ch > 1);
      this.chains[id] = chain;
    }
  }
  render(renderer, writeBuffer, readBuffer, dt) {
    // one scene pass into the MRT: visible materials always (the Visible filter only drops the layer in the
    // combine), every surface term computed, no 12 % overlay in the visible light, no diffuse radio stand-in
    // (Rayleigh: at λ ≥ 1 m sea and land are smooth, they mirror radio sources instead of glowing)
    applyVisMode(true);
    for (const k of ['uSOnR_', 'uSOnM_', 'uSOnI_', 'uSOnU_', 'uSOnG_']) SURF_U[k].value = this.penOnly ? 0 : 1;   // epen=only: no surface emission either
    OVERLAY.value = 0; SURF_U.uRadioDiffuse.value = 0;
    // the stylised CMB haze of the old view draws into the visible output; the eye shows the physical microwave sky
    if (ENV.nightMat) ENV.nightMat.uniforms.uCMB.value = 0;
    EYE_U.eyeGround.value = S.detector === 'ground' ? 1 : 0;
    EYE_U.eyeSpk.value = Math.max(1, 3 * this.blur.radio.sigma); EYE_U.eyeTime.value = S.T;   // last frame's σ
    if (ENV.setVis) ENV.setVis(true);   // the day sky carries the UV twilight (haze path radiance) even with Visible filtered off
    patchScene(this.scene);
    const cam = this.camera, tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / cam.zoom;
    Object.assign(EYE_U.eyeNear, { value: cam.near }); EYE_U.eyeFar.value = cam.far; EYE_U.eyeTanY.value = tanY;
    EYE_U.eyeAspect.value = cam.aspect; EYE_U.eyeRes.value.set(this.mrt.width, this.mrt.height); EYE_U.eyeP2.value = 0;
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    const pen = [...EMS, ...RIBS, ...FIELDS].filter(x => PENETRATE.has(x.band));
    pen.forEach(x => x.m.layers.set(this.pen ? 1 : 0));                 // layer 1 only: not in the scene pass
    renderer.setRenderTarget(this.mrt); renderer.clear(); renderer.render(this.scene, cam);
    // (T, distance) of the frontmost opaque surface, then the radio / microwave / gamma sources, once, on layer 1
    const tu = this.tzQ.material.uniforms;
    tu.tDepth.value = this.mrt.depthTexture; tu.tT.value = this.mrt.texture[5]; tu.uGlass.value = this.glass ? 1 : 0;
    tu.uNear.value = cam.near; tu.uFar.value = cam.far; tu.uTanY.value = tanY; tu.uAspect.value = cam.aspect;
    renderer.setRenderTarget(this.tz); this.tzQ.render(renderer);
    const shown = pen.filter(x => x.m.visible);
    if (shown.length && this.pen) {
      shown.forEach(x => { x.m.material.depthTest = false; });
      EYE_U.eyeTZ.value = this.tz.texture; EYE_U.eyeP2.value = this.penOnly ? 2 : 1;
      const mask = cam.layers.mask, ac = renderer.autoClear; cam.layers.set(1); renderer.autoClear = false;
      renderer.setRenderTarget(this.mrt); renderer.render(this.scene, cam);
      cam.layers.mask = mask; renderer.autoClear = ac; EYE_U.eyeP2.value = 0;
      shown.forEach(x => { x.m.material.depthTest = true; });
    }
    renderer.setClearColor(cc, ca);
    const tex = this.mrt.texture, ru = this.reduceQ.material.uniforms;
    for (const id of [...IDS, 'nir']) {                                  // 'nir': the near-IR channel (output 2, IR slot)
      const nir = id === 'nir'; if (!S.on[nir ? 'ir' : id]) continue;
      let src = { texture: tex[nir ? 2 : SLOT[id][0]], width: this.mrt.width, height: this.mrt.height }; ru.uFirst.value = 1; ru.uSel.value = SEL(nir ? 'ir' : id);
      for (const rt of this.chains[id]) {
        ru.tSrc.value = src.texture; ru.uSrcF.value.set(src.width, src.height);
        renderer.setRenderTarget(rt); this.reduceQ.render(renderer); ru.uFirst.value = 0; src = rt;
      }
    }
    const au = this.adaptQ.material.uniforms, [prev, next] = this.adapt, step = dt || .016;
    au.tPrev.value = prev.texture; IDS.forEach((id, i) => au['tR' + i].value = this.chains[id].at(-1).texture); au.tR7.value = this.chains.nir.at(-1).texture;
    au.uUp.value = this.first ? 1 : 1 - Math.exp(-step / EYE.tauUp); au.uDown.value = this.first ? 1 : 1 - Math.exp(-step / EYE.tauDown);
    this.first = false;
    renderer.setRenderTarget(next); this.adaptQ.render(renderer); this.adapt.reverse();
    if (this.dbg && this.dbgN++ < 3) this.readout(renderer, next);   // first frames only: adapted from frame 1, readback stalls
    const cu = this.combineQ.material.uniforms;
    cu.tV.value = tex[0]; cu.tB1.value = tex[1]; cu.tS1.value = tex[2]; cu.tB2.value = tex[3]; cu.tS2.value = tex[4]; cu.tA.value = next.texture;
    IDS.forEach((id, i) => cu.uOn.value[i] = S.on[id] ? 1 : 0);
    const view = S.eyeView;                                              // HUD: adapted / absolute, per-band weights
    cu.uAbs.value = view && view.abs ? 1 : 0; IDS.forEach((id, i) => cu.uW.value[i] = view && view.w ? view.w[id] ?? 1 : 1);
    const bl = BLUR.map(b => this.blurBand(renderer, b));
    [cu.tBl0.value, cu.tBl1.value, cu.tBl2.value, cu.tBl4.value] = bl;
    cu.uBl.value.set(...bl.map(t => (t ? 1 : 0)));
    cu.uSeed.value = Math.random();                                      // visual-only noise seed (render rule 9)

    // near-IR: the real/scene light ratio (surface.js) sets the photon count and the tube threshold in scene units
    cu.uNirPhot.value = SURF_U.uNirPhot.value; cu.uNirFloor.value = NIR.floorLx / NIR.lux0 / SURF_U.uNirPhot.value;
    cu.uKey.value = EYE.key; cu.uP.value = EYE.p; cu.uFloorRel.value = EYE.floorRel; cu.uBeta.value = EYE.beta;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.combineQ.render(renderer);
    if (this.ratio >= 0 && ++this.ratio === 1) this.ratioCheck(renderer, next);
  }
  // ?eyeratio&bands=<one band>: within-band ratio check. Reads that band's raw layer and the displayed frame back
  // (once, on the first frame: adaptation starts fully adapted), takes two pixel pairs (brightest vs 2nd-brightest peak ≥ 12 px away; brightest vs the
  // median lit pixel) and writes raw ratio, adapted ratio (raw × the band's gain) and the displayed values into
  // <script id="eye-ratio">. Debug only (full-frame float readbacks).
  ratioCheck(renderer, adaptRT) {
    const id = IDS.find(b => S.on[b]), w = this.mrt.width, h = this.mrt.height;
    const copy = (fs, uniforms) => {
      const rt = new THREE.WebGLRenderTarget(w, h, { ...rtOpts, type: THREE.FloatType }), qd = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms }));
      renderer.setRenderTarget(rt); qd.render(renderer); const px = new Float32Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); rt.dispose(); return px;
    };
    const [o, ch] = SLOT[id];
    const raw = copy(LUM + `uniform sampler2D t; uniform vec4 uSel; varying vec2 vUv; void main(){ vec4 c = clean(texture2D(t, vUv)); gl_FragColor = vec4(uSel.a > 1.5 ? lum(c.rgb) : dot(c.rgb, uSel.rgb)); }`,
      { t: { value: this.mrt.texture[o] }, uSel: { value: SEL(id) } });
    const disp = copy(this.combineQ.material.fragmentShader.replace('gl_FragColor = vec4(C*k, 1.); }', 'gl_FragColor = vec4(C*k, lum(C*k)); }'), this.combineQ.material.uniforms);
    if (disp.every((x, k) => k % 4 !== 3 || x === 1)) throw new Error('eyeratio: the combine patch did not apply');
    const a = new Float32Array(32); renderer.readRenderTargetPixels(adaptRT, 0, 0, 8, 1, a);
    const bi = IDS.indexOf(id), La = a[bi * 4 + 2], Lr = LREF[id];
    const g = EYE.key / (Lr ** (1 - EYE.p) * Math.max(La, EYE.floorRel * Lr) ** EYE.p);
    const L = i => raw[i * 4], D = i => disp[i * 4 + 3], RGB = i => [disp[i * 4], disp[i * 4 + 1], disp[i * 4 + 2]].map(x => +x.toFixed(3));
    let i1 = 0; for (let i = 0; i < w * h; i++) if (L(i) > L(i1)) i1 = i;
    let i2 = -1; for (let i = 0; i < w * h; i++) { const dx = i % w - i1 % w, dy = (i / w | 0) - (i1 / w | 0); if (dx * dx + dy * dy >= 144 && (i2 < 0 || L(i) > L(i2))) i2 = i; }
    const lit = []; for (let i = 0; i < w * h; i++) if (L(i) > L(i1) * .01) lit.push(i);
    lit.sort((x, y) => L(x) - L(y)); const i3 = lit[lit.length >> 1];
    const pair = (x, y) => ({ px: [[x % w, x / w | 0], [y % w, y / w | 0]], raw: [L(x), L(y)], rawRatio: L(x) / L(y), adaptedRatio: (L(x) * g) / (L(y) * g) /* one scalar per band: equal to rawRatio by construction */, displayed: [D(x), D(y)] });
    const el = document.createElement('script'); el.type = 'application/json'; el.id = 'eye-ratio';
    el.textContent = JSON.stringify({ band: id, gain: g, La, pairs: [pair(i1, i2), pair(i1, i3)], brightestRGB: RGB(i1) }); document.body.appendChild(el);
  }
  // each band's mean share of the displayed luminance for the frame just rendered (BANDS order + total), read back
  // asynchronously; used by ?dump (spectra timeline)
  measure(renderer) {
    if (!this.share) {
      const o = { ...rtOpts, type: THREE.FloatType };
      this.share = { a: new THREE.WebGLRenderTarget(SHARE_W, SHARE_H, o), b: new THREE.WebGLRenderTarget(SHARE_W, SHARE_H, o), m: new THREE.WebGLRenderTarget(2, 1, o),
        q: new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: MEAN_FS, uniforms: { tA: { value: null }, tB: { value: null } } })) };
    }
    const sh = this.share, cu = this.combineQ.material.uniforms;
    cu.uShare.value = 1; renderer.setRenderTarget(sh.a); this.combineQ.render(renderer);
    cu.uShare.value = 2; renderer.setRenderTarget(sh.b); this.combineQ.render(renderer);
    cu.uShare.value = 0;
    sh.q.material.uniforms.tA.value = sh.a.texture; sh.q.material.uniforms.tB.value = sh.b.texture;
    renderer.setRenderTarget(sh.m); sh.q.render(renderer);
    const p = readAsync(renderer.getContext(), 2, 1); renderer.setRenderTarget(null);
    return p.then(px => { const v = [px[0], px[1], px[2], px[3], px[4], px[5], px[6]]; return { bands: Object.fromEntries(IDS.map((id, i) => [id, v[i]])), total: px[7] }; });
  }
  // ?eyedbg: per band [log-average, max, mean] luminance into <script id="eye-dbg"> (readback stalls: debug only)
  readout(renderer, rt) {
    const px = new Float32Array(32); renderer.readRenderTargetPixels(rt, 0, 0, 8, 1, px);
    let el = document.getElementById('eye-dbg');
    if (!el) { el = document.createElement('script'); el.type = 'application/json'; el.id = 'eye-dbg'; document.body.appendChild(el); }
    el.textContent = JSON.stringify(Object.fromEntries(IDS.map((id, i) => [id, { logavg: Math.exp(px[i * 4]), max: px[i * 4 + 1], mean: px[i * 4 + 2], sigmaPx: this.blur[id] ? +this.blur[id].sigma.toFixed(2) : 0 }])));
  }
}

// the eye's own composer; app.js renders it instead of the default one when the eye is on
export function createEye(renderer, scene, camera, nanGuard) {
  const q = new URLSearchParams(location.search), PR = S.PR;
  const rt = new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  const pass = new EyePass(scene, camera, q);
  composer.addPass(pass);                                // addPass / setSize size the MRT and the reductions (× pixel ratio)
  composer.addPass(nanGuard());
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .55, .3, .9));
  const fxaa = new ShaderPass(FXAAShader), res = (w, h) => fxaa.material.uniforms.resolution.value.set(1 / (w * PR), 1 / (h * PR));
  res(innerWidth, innerHeight); composer.addPass(fxaa);
  composer.addPass(new OutputPass());
  renderer.toneMapping = THREE.NoToneMapping;      // the asinh stretch is the tone curve
  S.eye = true;                                    // sources drop GAIN (engine/render/sources.js)
  if (q.get('eye') === 'absolute') S.eyeView = { ...(S.eyeView || {}), abs: true };
  return { composer, setSize: (w, h) => { composer.setSize(w, h); res(w, h); }, measure: () => pass.measure(renderer) };
}
