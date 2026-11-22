// Shared sunset-to-night atmosphere: physically based sky, night sky (stars, Milky Way, CMB,
// airglow, optional city glow), cloud deck, sun/moon/hemisphere lights, and the colour
// keyframes that drive them over the 0–60 script axis. Every scenario uses the same timeline,
// so sky events from engine/events/sky.js line up with it wherever they are reused.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { V3, sm, lerp, kf } from '../core/util.js';
import { S } from '../core/state.js';
import { dirAE } from '../core/geom.js';
import { COMMON } from '../render/shaders.js';

// --- timeline -------------------------------------------------------------------------
export const SUN_AZ = 295;
export const sunEl = () => 4 - S.t * .55;                       // kept low and dim: sets at t≈7
export const moonDir = () => dirAE(252 - (S.t - 33) * .3, -4 + (S.t - 33) * 1.25);   // rises ahead from t≈33
export const night = () => sm(8, 22, S.t);
export const moonlit = () => sm(38, 50, S.t);
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
