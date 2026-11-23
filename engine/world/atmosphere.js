// Shared sunset-to-night atmosphere: physically based sky, night sky (stars, Milky Way, CMB,
// airglow, optional city glow), cloud deck, sun/moon/hemisphere lights, and the colour
// keyframes that drive them over the 0–60 script axis. Every scenario uses the same timeline,
// so sky events from engine/events/sky.js line up with it wherever they are reused.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { bandPos } from '../core/spectrum.js';
import { V3, DEG, sm, lerp, kf } from '../core/util.js';
import { S } from '../core/state.js';
import { dirAE } from '../core/geom.js';
import { COMMON } from '../render/shaders.js';

// --- timeline -------------------------------------------------------------------------
export const SUN_AZ = 295;
export const sunEl = () => 4 - S.t * .55;                       // kept low and dim: sets at t≈7
export const night = () => sm(8, 22, S.t);
// The Moon (M9/T1): a waxing Moon 6.5 days old, elongation 79° east of the Sun along the ecliptic, already up in the
// south-west at sunset and setting at the end. Track from a spherical-astronomy computation (lat 45° N, Sun at dec
// +17.4° / ecliptic longitude 131° so it sets at SUN_AZ 295 at t ≈ 7.3, 1 script unit = 3.4 min, Moon on the ecliptic
// moving 0.51°/h against the stars), fitted to 0.15°: az 211 → 219 → 227 → 234 → 240 → 246 → 252 and
// el 28 → 25 → 21 → 16 → 11 → 6 → 0 at t = 0, 10 … 60. On a summer evening the ecliptic runs low through the south,
// so an older Moon would start east of the 210° edge of FOV_SKY, a younger one lower and farther west.
export const MOON_ELONG = 79;                                    // deg, Sun–Moon elongation (≈ 12.2°/day × 6.5 d)
export const MOON_K = (1 - Math.cos(MOON_ELONG * DEG)) / 2;      // illuminated fraction ≈ 0.41
// Brightness vs phase angle α = 180° − elongation: m(α) = m_full + 0.026|α| + 4e-9 α⁴ (Krisciunas & Schaefer 1991,
// PASP 103, 1033; cf. Allen's Astrophysical Quantities, lunar phase curve) → 0.061 of full-Moon illuminance here
// (≈ 0.09 at quarter). Drawn as perceived brightness, Stevens' power law with exponent 1/3 (dark-adapted brightness,
// Stevens 1957) — linear light would make a 6 % Moon vanish on screen; ratios below are perceived (cube-root) ratios, not linear ones
// (a full Moon would read only ~2.6× brighter, not 16×) — order and timing stay physical.
const PA = 180 - MOON_ELONG;
export const MOON_ILLUM = 10 ** (-.4 * (.026 * PA + 4e-9 * PA ** 4));
export const moonDir = () => { const t = S.t; return dirAE(211.1 + .824 * t - .00231 * t * t, 28.3 - .345 * t - .00207 * t * t); };
// the Moon's light reaching the scene, 0..~0.39: phase × atmospheric extinction (0.2 mag/airmass, Kasten & Young 1989
// airmass) × the last 1.5° of setting, ramped in as the twilight sky darkens below it — moonlight outshines the
// twilight once the Sun is ~8–13° down (t ≈ 22–31). The Moon is up all along; this is how much its light matters.
export const moonFlux = () => { const el = Math.asin(Math.min(1, moonDir().y)) / DEG, h = Math.max(el, 0);
  const X = 1 / (Math.sin(h * DEG) + .50572 * (h + 6.07995) ** -1.6364);
  return (MOON_ILLUM * 10 ** (-.08 * (X - 1))) ** (1 / 3) * sm(0, 1.5, el); };
export const moonlit = () => moonFlux() * sm(8, 13, -sunEl());
export const GAL_C = dirAE(215, 20);                            // galactic centre ahead-left
export const GAL_N = new V3().crossVectors(GAL_C, dirAE(250, 80)).normalize();   // band arching overhead

// [t, colour...] keyframes; magenta/violet on purpose, the sun stays small
export const HEMI = [[0, [.5, .36, .58], [.19, .11, .12]], [10, [.3, .19, .36], [.1, .06, .07]], [16, [.11, .08, .18], [.032, .02, .03]], [24, [.022, .026, .055], [.008, .008, .01]], [60, [.018, .022, .045], [.006, .006, .008]]];
export const HOR = [[0, [.5, .26, .3]], [8, [.44, .17, .26]], [14, [.22, .09, .18]], [22, [.03, .028, .06]], [60, [.011, .015, .028]]];
export const CLOUD = [[0, [1, .5, .52], [.4, .24, .34]], [9, [1, .3, .38], [.3, .14, .22]], [15, [.3, .1, .2], [.08, .04, .09]], [22, [.02, .02, .034], [.007, .007, .014]], [60, [.014, .014, .026], [.005, .005, .01]]];
export const CONTRAIL = [[0, [1, .55, .55]], [12, [1, .38, .4]], [18, [.12, .1, .14]], [27, [.04, .04, .05]]];

// Filled by createAtmosphere(); events read these at update time.
export const ENV = {};

// opts: { lightPollution: 0..1 (dims stars, adds an orange horizon glow), cloudCover: [start, end] }
export function createAtmosphere(opts = {}) {
  const { scene, camera, TIME } = S;
  const lp = opts.lightPollution || 0;

  const sky = new Sky(); sky.scale.setScalar(20000); sky.renderOrder = -10; scene.add(sky);
  const SU = sky.material.uniforms;
  SU.turbidity.value = 10; SU.rayleigh.value = 1.1; SU.mieCoefficient.value = .0006; SU.mieDirectionalG.value = .96;
  SU.uFade = { value: 1 };
  sky.material.fragmentShader = 'uniform float uFade;\n' + sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * uFade, 1.0 );');

  const nightMat = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uStars: { value: 0 }, uMW: { value: 0 }, uCMB: { value: 0 }, uAir: { value: 0 }, uGlow: { value: new THREE.Color(0, 0, 0) }, uGalN: { value: GAL_N }, uGalC: { value: GAL_C } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: COMMON + `
    varying vec3 vDir; uniform float uTime, uStars, uMW, uCMB, uAir; uniform vec3 uGalN, uGalC, uGlow;
    float h31(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
      return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y), f.z); }
    float fbm3(vec3 p){ float a=0., w=.5; for(int i=0;i<5;i++){ a+=w*n3(p); p*=2.03; w*=.5; } return a; }
    vec3 stars(vec3 d, float scale, float dens, float boost){
      vec3 p = d*scale, c = floor(p), f = fract(p);
      float h = h31(c); if(h > dens) return vec3(0.);
      vec3 sp = vec3(h31(c+11.), h31(c+23.), h31(c+37.))*.7+.15;
      float dd = length(f-sp), fw = clamp(length(fwidth(p))*.6, 1e-4, .2);
      float b = pow(h31(c+51.), 5.)*boost + .15;
      float s = 1. - smoothstep(0., fw*(.6 + .9*b), dd);
      float tw = .7 + .3*sin(uTime*(2.+5.*h31(c+3.)) + h*40.);
      return mix(vec3(.65,.75,1.), vec3(1.,.8,.58), h31(c+71.)) * s * b * tw;
    }
    void main(){
      vec3 d = normalize(vDir); float above = smoothstep(-.03,.12,d.y); vec3 col = vec3(0.);
      col += uAir*vec3(.007,.004,.015)*(1.+3.*pow(1.-max(d.y,0.),5.));
      col += uGlow*pow(1.-max(d.y,0.),7.);                       // city light dome
      float g = dot(d, uGalN), band = exp(-g*g/.02), core = pow(max(dot(d,uGalC),0.),5.);
      float dust = smoothstep(.5,.72,fbm3(d*11.+7.))*exp(-g*g/.005);
      float mw = band*(.3+.9*fbm3(d*5.))*(1.+3.*core)*(1.-.85*dust);
      col += uMW*mw*mix(vec3(.5,.58,.85), vec3(1.,.85,.62), core)*.2;
      vec3 s = stars(d,90.,.25,4.) + stars(d,220.,.3,1.5) + stars(d,520.,.18+.5*band,.7)*(.35+band);
      col += uStars*s;
      col *= above;
      if(uCMB > 0.){    // CMB: soft mottled haze with no grid, breathing slowly
        vec3 q = d*3.2 + vec3(uTime*.02, uTime*.01, uTime*.017);
        float v = fbm3(q)*fbm3(q*2.6+11.);
        float breathe = .62 + .38*sin(uTime*.22 + fbm3(q*5.)*3.);
        float soft = smoothstep(.03,.42,v)*breathe;
        col += uCMB*mix(vec3(.82,.11,.02), vec3(1.,.72,.18), v)*soft*.11*smoothstep(-.06,.14,d.y);
      }
      gl_FragColor = vec4(col, 1.);
    }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.BackSide,
  });
  // The sky's own light in every band, for the spectral eye (M10/T7, engine/render/compose.js): emission of the sky
  // itself, so it is not attenuated by distance (EYE_SKY). Each band uses its surfaces' own mapping (surface.js), so
  // sky and ground compare physically inside the band:
  //   radio  galactic synchrotron T_b at 100 MHz: the Haslam et al. 1982 (A&AS 47, 1) 408 MHz all-sky shape — cold
  //          sky ~17 K, plane ~250 K, towards the centre ×3.5 — scaled by (408/100)^2.55 ≈ 36 (synchrotron spectral
  //          index −2.55, Guzmán et al. 2011, A&A 525, A138): ~600 K at the poles, ~9000 K in the plane, brighter than the ~250 K ground (sky noise
  //          dominates receivers at VHF). Its amplitude in shader units (.006 per 1000 K) is a STAND-IN: radio has no
  //          thermal surface term to compare with; the shape and the plane/pole contrast are physical. Incoherent: no
  //          speckle (that belongs to transmitters and their reflections). Key 'synchrotron'.
  //   micro  T_b = 2.725 K·e^(−τ) + 270 K·(1 − e^(−τ)), τ = .05 / sin(el) at ~20 GHz, near the 22 GHz water line (ITU-R P.676) —
  //          the CMB (2.725 K, Fixsen 2009) behind the atmosphere — through the surfaces' microwave wash: a dark sky with
  //          a glowing horizon; the CMB itself is ~100× fainter than the 280 K ground and stays invisible. 'skyMicrowave'.
  //   ir     8–14 µm window sky: zenith window transmittance ~.7 (effective emissivity ~.3 for moderate humidity,
  //          Idso 1981), e = 1 − .7^(1/sin el), T = mix(−60 °C, 10 °C, e) (as the seaside's skyT; air 10 °C STAND-IN):
  //          zenith ≈ −40 °C, warm only near the horizon. 'skyThermalIR'.
  //   uv     after sunset only airglow (O₂ Herzberg, ~95 km, ×(1 + 3(1 − sin el)^5) toward the horizon, ≈ van Rhijn);
  //          the twilight UV sky is the haze's path radiance on the day sky (compose.js). 'uvAirglow'.
  //   xray   cosmic X-ray background, isotropic: ~10 photons cm⁻² s⁻¹ sr⁻¹ at 2–10 keV (Gruber 1999; its νFν peaks
  //          near 30 keV) — a 7 mm pupil (0.385 cm²) would catch ~0.06 per frame (1/60 s) per steradian. Counted at
  //          ~5 keV (the 2–10 keV band the rate is quoted for), the amplitude L = 1.1e-9 makes the eye's photon counting
  //          (compose.js: N = L·K/E per 2×2 px cell) expect that at the default view (65°, ~850 px; N per cell does not
  //          scale with the cell's solid angle, so zooming changes it). 'cxb'.
  //   gamma  diffuse Galactic gamma rays above 100 MeV, ~1e-3 photons cm⁻² s⁻¹ sr⁻¹ in the inner plane (Fermi-LAT,
  //          Ackermann 2012) → ~6e-6 per frame per sr through the pupil: L ≈ 2.3e-9 toward the inner Galaxy. 'gammaDiffuse'.
  //          Both are honestly near-black: a human-sized eye almost never catches one.
  // X-ray / gamma come from space: absorbed in Ground mode. The UV airglow amplitude is a STAND-IN (faint).
  const pos = (lam, E) => bandPos(E ? { E } : { lam });
  nightMat.userData.eyeBands = `
#define EYE_SKY
#define EYE_POS_A vec3(${pos(10e-6).toFixed(4)}, ${pos(340e-9).toFixed(4)}, ${pos(0, 1e8).toFixed(4)})
#define EYE_POS_L vec3(${bandPos({ f: 100e6 }).toFixed(4)}, ${bandPos({ f: 20e9 }).toFixed(4)}, ${pos(0, 5e3).toFixed(4)})
void eyeBands(out vec4 o1, out vec4 o3){
  vec3 d = normalize(vDir); float above = smoothstep(-.03, .12, d.y), sel = max(d.y, .02);
  float g = dot(d, uGalN), core = pow(max(dot(d, uGalC), 0.), 5.);
  float Tr = 36.*(17. + 230.*exp(-g*g/.06)*(1. + 2.5*core)*(.8 + .4*fbm3(d*4.)));
  float r = .006*Tr/1000.;
  float tau = .05/sel, Tm = 2.725*exp(-tau) + 270.*(1. - exp(-tau)), xm = clamp((Tm - 120.)/180., 0., 1.);
  float m = eyeL(vec3(1., .6, .1))*xm*xm*.12;
  float e = 1. - pow(.7, 1./max(sel, .04)), Ti = mix(-60., 10., e), xi = clamp((Ti + 4.)/44., 0., 1.);
  float i = eyeL(thermal(xi))*(.04 + .5*xi*xi);
  float u = 2e-4*(1. + 3.*pow(1. - sel, 5.));
  float space = 1. - eyeGround, x = space*1.1e-9, gm = space*2.3e-9*(.1 + exp(-g*g/.008)*(1. + 3.*core)/4.);
  o1 = vec4(i, u, gm, 1.)*above; o1.a = 1.;
  o3 = vec4(r, m, x, 1.)*above; o3.a = 1.; }`;
  const nightSky = new THREE.Mesh(new THREE.SphereGeometry(15000, 64, 32), nightMat); nightSky.renderOrder = -9; scene.add(nightSky);

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uCover: { value: .5 }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uFlash: { value: 0 }, uOp: { value: 1 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: COMMON + `varying vec3 vW; uniform float uTime, uCover, uFlash, uOp; uniform vec3 uLit, uShade;
    void main(){
      vec2 p = vW.xz*.00022 + vec2(uTime*.003, uTime*.001);
      float f = fbm(p), c = smoothstep(uCover, uCover+.22, f);
      float dist = length(vW.xz - cameraPosition.xz), fade = 1. - smoothstep(5000., 17000., dist);
      float lit = smoothstep(.0,.6, fbm(p*2.3+4.) - (f-uCover)*.8);
      vec3 col = mix(uShade, uLit, lit) + vec3(.55,.6,.8)*uFlash*c;
      gl_FragColor = vec4(col, c*fade*uOp);
    }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), cloudMat);
  clouds.rotation.x = -Math.PI / 2; clouds.renderOrder = -8; scene.add(clouds);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1); scene.add(sunLight, sunLight.target);
  const moonLight = new THREE.DirectionalLight(0x9fb4ff, 0); scene.add(moonLight, moonLight.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1.4); scene.add(hemi);
  const headlamp = new THREE.SpotLight(0xfff2dc, 0, 45, .5, .6, 1.4); camera.add(headlamp, headlamp.target); headlamp.target.position.set(0, -.5, -5);
  const flashLight = new THREE.PointLight(0xc8d4ff, 0, 0, 0); scene.add(flashLight);

  const [c0, c1] = opts.cloudCover || [.5, .66];
  const glow = new THREE.Color(1, .55, .25).multiplyScalar(.09 * lp);

  function update() {
    const t = S.t, on = S.on, n = night(), ml = moonlit(), el = sunEl(), cam = camera.position;
    sky.position.copy(cam); nightSky.position.copy(cam);
    clouds.position.set(cam.x, 2400, cam.z);
    SU.sunPosition.value.copy(dirAE(SUN_AZ, Math.max(el, -2.5)));
    SU.uFade.value = 1 - sm(12, 28, t);
    const dim = 1 - .75 * lp;                                       // light pollution washes out faint stars
    // field stars follow the Sun's depression, not night(): mag 2–3 from δ ≈ 7–8° to mag 6 by δ ≈ 15° (astronomical
    // twilight), so the first planet and bright stars (sky.firstStars) come out on their own first (M8 physics audit)
    const stars = sm(7, 15, -el);
    nightMat.uniforms.uStars.value = on.vis ? stars * (1 - .4 * ml) * dim : 0; S.act.vis += n * .2;
    nightMat.uniforms.uAir.value = on.vis ? n * (1 + 2 * ml) : 0;
    nightMat.uniforms.uGlow.value.copy(glow).multiplyScalar(on.vis ? n : 0);
    ENV.starDim = dim;
    const [lit, shade] = kf(CLOUD, t);
    cloudMat.uniforms.uLit.value.setRGB(lit[0] + .05 * ml + .06 * lp * n, lit[1] + .055 * ml + .035 * lp * n, lit[2] + .07 * ml + .015 * lp * n);
    cloudMat.uniforms.uShade.value.setRGB(...shade);
    cloudMat.uniforms.uCover.value = lerp(c0, c1, sm(14, 30, t));
    const hor = kf(HOR, t)[0]; scene.fog.color.setRGB(on.vis ? hor[0] + .02 * ml : 0, on.vis ? hor[1] + .025 * ml : 0, on.vis ? hor[2] + .04 * ml : 0);
    S.act.vis += 1 - sm(5, 20, t);

    const sd = dirAE(SUN_AZ, el); sunLight.position.copy(cam).addScaledVector(sd, 1000); sunLight.target.position.copy(cam);
    sunLight.intensity = 1.4 * sm(-1, 6, el); sunLight.color.setRGB(1, lerp(.24, .55, sm(0, 9, el)), lerp(.09, .3, sm(0, 9, el)));
    moonLight.intensity = ml * .5; moonLight.position.copy(cam).addScaledVector(moonDir(), 1000); moonLight.target.position.copy(cam);
    const [hs, hg] = kf(HEMI, t); hemi.color.setRGB(hs[0], hs[1] + .01 * ml, hs[2] + .03 * ml); hemi.groundColor.setRGB(...hg);
    S.renderer.toneMappingExposure = lerp(.42, 1.1, n);
  }

  function setVis(vis) { sky.visible = clouds.visible = vis; }

  Object.assign(ENV, { sky, SU, nightMat, nightSky, cloudMat, clouds, sunLight, moonLight, hemi, headlamp, flashLight, update, setVis, starDim: 1 });
  return ENV;
}
