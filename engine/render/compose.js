// The spectral eye (M10, prototype behind ?eye=1): one way of seeing every band at once.
//
// Instead of drawing the visible world and laying the invisible bands over it with fixed gains, every band is
// rendered into its own layer (the visible world; then per invisible band the landscape's own emission in that
// band plus that band's sources, occluded by opaque matter), and each layer is seen by its own "receptor":
//
//   1. Adaptation. Every band is seen by the same receptor model, no per-band constants: the layer's mean
//      luminance La (the field the receptor adapts to) sets its gain E = key / (Lref^(1−p) · max(La, floor)^p).
//      p < 1 is partial adaptation (a receptor compensates only part of a change in its field — Weber behaviour
//      with a compressive exponent, cf. Naka & Rushton 1966; Ferwerda et al. 1996 for vision): night stays
//      darker than dusk, a band whose whole field glows (IR terrain) is turned down, a dark band turned up — but
//      never past the floor, the receptor's absolute threshold, so an empty band stays black instead of
//      amplifying nothing. Lref is the field at which the gain is key/Lref. La follows the scene with time
//      constant tau (eyes adapt, they don't jump). The log-average (Reinhard et al. 2002) was tried first: a
//      half-black frame (the sky in most invisible bands) drags it to the floor and every band saturates.
//   2. Hue. A band is one hue (BANDS colour, brightest channel 1) carrying its adapted brightness, with
//      a little of the layer's own colour kept (chroma); the visible layer keeps its colour, slightly desaturated
//      (night vision is less coloured).
//   3. Combine. The hue-coded layers are summed and stretched with the colour-preserving asinh of Lupton et al.
//      2004 (PASP 116:133): out = C · asinh(β I) / (β I), I = mean(C), clipped by the brightest channel so hues
//      survive. Faint things stay linear, bright ones compress logarithmically — no band can wash out the others.
//
// The pipeline is its own EffectComposer: EyePass (layers → reduce → adapt → combine) → NaN guard → bloom →
// OutputPass with no tone mapping (the asinh stretch is the tone curve). Knobs for the prototype come from the URL:
// ?ekey=<key> &ep=<p> &elref=<Lref> &efloor=<floor> &ebeta=<β> &eyedbg (adaptation readout).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { S } from '../core/state.js';
import { BANDS } from '../core/bands.js';
import { EMS, RIBS, FIELDS } from './sources.js';
import { applyVisMode, setInstrumentBase } from './instrument.js';
import { SURF_U, OVERLAY } from './surface.js';

const IDS = BANDS.map(b => b.id);                    // 0 radio … 3 vis … 6 gamma (the shaders' uBand order)
const SURF_ON = { radio: 'uSOnR', micro: 'uSOnM', ir: 'uSOnI', uv: 'uSOnU', gamma: 'uSOnG' };   // xray: no surface term
const SCALE = { radio: .5, micro: .5, ir: .5, vis: 1, uv: .5, xray: .5, gamma: .5 };       // layer resolution
export const EYE = {
  key: .05, p: .5, lref: .37, floor: .003, beta: 6, chroma: .3, satVis: .7, tau: .6,
};

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const LUM = `float lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
vec3 clean(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.) : max(c, 0.); }`;

// 4×4 box reduction: first level turns colour into (log L, max L, L), later levels average / max those
const REDUCE_FS = LUM + `uniform sampler2D tSrc; uniform vec2 uSrcF; uniform int uFirst;
void main(){ ivec2 uSrc = ivec2(uSrcF), o = ivec2(gl_FragCoord.xy)*4; float s = 0., m = 0., a = 0., n = 0.;
  for(int j = 0; j < 4; j++) for(int i = 0; i < 4; i++){ ivec2 p = o + ivec2(i, j);
    if(p.x >= uSrc.x || p.y >= uSrc.y) continue;
    vec3 c = texelFetch(tSrc, p, 0).rgb;
    if(uFirst == 1){ float l = lum(clean(c)); s += log(l + 1e-5); m = max(m, l); a += l; }
    else { s += c.r; m = max(m, c.g); a += c.b; }
    n += 1.; }
  gl_FragColor = vec4(s/max(n, 1.), m, a/max(n, 1.), 1.); }`;

// 8×1 adaptation state: column b follows band b's 1×1 reduction with rate uAlpha
const ADAPT_FS = `uniform sampler2D tPrev, tR0, tR1, tR2, tR3, tR4, tR5, tR6; uniform float uAlpha;
vec4 cur(int b){ ivec2 z = ivec2(0); if(b == 0) return texelFetch(tR0, z, 0); if(b == 1) return texelFetch(tR1, z, 0);
  if(b == 2) return texelFetch(tR2, z, 0); if(b == 3) return texelFetch(tR3, z, 0); if(b == 4) return texelFetch(tR4, z, 0);
  if(b == 5) return texelFetch(tR5, z, 0); return texelFetch(tR6, z, 0); }
void main(){ int b = int(gl_FragCoord.x); vec4 p = texelFetch(tPrev, ivec2(b, 0), 0);
  gl_FragColor = b < 7 ? mix(p, cur(b), uAlpha) : p; }`;

const COMBINE_FS = LUM + `uniform sampler2D tL0, tL1, tL2, tL3, tL4, tL5, tL6, tA; varying vec2 vUv;
uniform vec3 uHue[7]; uniform float uOn[7]; uniform float uKey, uP, uLref, uFloor, uBeta, uChroma, uSatVis;
vec3 band(sampler2D t, int b){
  vec3 c = clean(texture2D(t, vUv).rgb);
  float La = texelFetch(tA, ivec2(b, 0), 0).b;
  c *= uKey/(pow(uLref, 1. - uP)*pow(max(La, uFloor), uP));
  float l = lum(c);
  if(b == 3) return mix(vec3(l), c, uSatVis);
  return mix(uHue[b]*l, c, uChroma); }
void main(){
  vec3 C = uOn[0]*band(tL0, 0) + uOn[1]*band(tL1, 1) + uOn[2]*band(tL2, 2) + uOn[3]*band(tL3, 3)
         + uOn[4]*band(tL4, 4) + uOn[5]*band(tL5, 5) + uOn[6]*band(tL6, 6);
  float I = (C.r + C.g + C.b)/3.;
  vec3 o = I > 1e-6 ? C*asinh(uBeta*I)/(uBeta*I) : C;
  o *= uBeta/asinh(uBeta);                                  // I = 1 maps to 1
  float m = max(o.r, max(o.g, o.b)); if(m > 1.) o /= m;      // keep the hue where a pixel saturates
  gl_FragColor = vec4(o, 1.); }`;

const rtOpts = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
// hue = the band colour scaled to a brightest channel of 1 (normalising to equal luminance instead multiplies a deep
// red like IR's by ~3.7, so every IR pixel above ~0.1 clipped to flat red)
const hueOf = id => { const c = new THREE.Color(BANDS.find(b => b.id === id).color); const m = Math.max(c.r, c.g, c.b); return new THREE.Vector3(c.r / m, c.g / m, c.b / m); };

class EyePass extends Pass {
  constructor(renderer, scene, camera, atmo, q) {
    super();
    Object.assign(this, { renderer, scene, camera, atmo, first: true });
    for (const [k, n] of [['ekey', 'key'], ['ep', 'p'], ['elref', 'lref'], ['efloor', 'floor'], ['ebeta', 'beta']]) if (q.has(k)) EYE[n] = +q.get(k);
    this.layers = {}; this.chains = {};
    this.reduceQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: REDUCE_FS,
      uniforms: { tSrc: { value: null }, uSrcF: { value: new THREE.Vector2() }, uFirst: { value: 1 } } }));
    const au = { tPrev: { value: null }, uAlpha: { value: 1 } }; IDS.forEach((_, i) => au['tR' + i] = { value: null });
    this.adaptQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: ADAPT_FS, uniforms: au }));
    this.adapt = [0, 1].map(() => new THREE.WebGLRenderTarget(8, 1, { ...rtOpts, type: THREE.FloatType }));
    this.dbg = q.has('eyedbg');
    const cu = { tA: { value: null }, uHue: { value: IDS.map(hueOf) }, uKey: { value: 0 }, uP: { value: 0 }, uLref: { value: 0 }, uOn: { value: IDS.map(() => 0) },
      uFloor: { value: 0 }, uBeta: { value: 0 }, uChroma: { value: EYE.chroma }, uSatVis: { value: EYE.satVis } };
    IDS.forEach((_, i) => cu['tL' + i] = { value: null });
    this.combineQ = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: COMBINE_FS, uniforms: cu }));
  }
  setSize(w, h) {
    for (const id of IDS) {
      const lw = Math.max(1, Math.round(w * SCALE[id])), lh = Math.max(1, Math.round(h * SCALE[id]));
      this.layers[id]?.dispose();
      this.layers[id] = new THREE.WebGLRenderTarget(lw, lh, { type: THREE.HalfFloatType, samples: id === 'vis' ? 4 : 0 });
      (this.chains[id] || []).forEach(r => r.dispose());
      const chain = []; let cw = lw, ch = lh;
      do { cw = Math.ceil(cw / 4); ch = Math.ceil(ch / 4); chain.push(new THREE.WebGLRenderTarget(cw, ch, rtOpts)); } while (cw > 1 || ch > 1);
      this.chains[id] = chain;
    }
  }
  // the band layers: same scene, same frame, one band at a time
  renderLayers(renderer) {
    const srcs = [...EMS, ...RIBS, ...FIELDS], vis0 = srcs.map(s => s.m.visible);
    const surf0 = Object.fromEntries(Object.values(SURF_ON).map(k => [k, SURF_U[k].value])), ov0 = OVERLAY.value;
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    for (const id of IDS) {
      if (!S.on[id]) continue;
      const vis = id === 'vis';
      applyVisMode(vis); this.atmo.setVis(vis); setInstrumentBase(vis);
      this.atmo.nightSky.visible = vis;              // stars + airglow: gated by S.on.vis in atmo.update(), not by setVis
      OVERLAY.value = 0;
      // Rayleigh criterion (h < λ/8cosθ): at λ ≥ 1 m sea and land are smooth, so they mirror radio sources
      // (glints, the sea interferometer) instead of glowing diffusely — the diffuse stand-in is off in the eye
      SURF_U.uRadioDiffuse.value = 0;
      for (const k in SURF_ON) SURF_U[SURF_ON[k]].value = k === id ? 1 : 0;
      srcs.forEach((s, i) => s.m.visible = vis0[i] && s.band === id);
      renderer.setRenderTarget(this.layers[id]); renderer.clear(); renderer.render(this.scene, this.camera);
    }
    srcs.forEach((s, i) => s.m.visible = vis0[i]);
    Object.assign(OVERLAY, { value: ov0 }); for (const k in surf0) SURF_U[k].value = surf0[k];
    SURF_U.uRadioDiffuse.value = 1; applyVisMode(S.on.vis); this.atmo.setVis(S.on.vis); setInstrumentBase(true); this.atmo.nightSky.visible = true;
    renderer.setClearColor(cc, ca);
  }
  render(renderer, writeBuffer, readBuffer, dt) {
    this.renderLayers(renderer);
    const ru = this.reduceQ.material.uniforms;
    for (const id of IDS) {
      if (!S.on[id]) continue;
      let src = this.layers[id]; ru.uFirst.value = 1;
      for (const rt of this.chains[id]) {
        ru.tSrc.value = src.texture; ru.uSrcF.value.set(src.width, src.height);
        renderer.setRenderTarget(rt); this.reduceQ.render(renderer); ru.uFirst.value = 0; src = rt;
      }
    }
    const au = this.adaptQ.material.uniforms, [prev, next] = this.adapt;
    au.tPrev.value = prev.texture; IDS.forEach((id, i) => au['tR' + i].value = this.chains[id].at(-1).texture);
    au.uAlpha.value = this.first ? 1 : 1 - Math.exp(-(dt || .016) / EYE.tau); this.first = false;
    renderer.setRenderTarget(next); this.adaptQ.render(renderer); this.adapt.reverse();
    if (this.dbg) {          // ?eyedbg: per band [log-average, max, mean] luminance into <script id="eye-dbg"> (readback stalls: debug only)
      const px = new Float32Array(32); renderer.readRenderTargetPixels(next, 0, 0, 8, 1, px);
      let el = document.getElementById('eye-dbg');
      if (!el) { el = document.createElement('script'); el.type = 'application/json'; el.id = 'eye-dbg'; document.body.appendChild(el); }
      el.textContent = JSON.stringify(Object.fromEntries(IDS.map((id, i) => [id, { logavg: Math.exp(px[i * 4]), max: px[i * 4 + 1], mean: px[i * 4 + 2] }])));
    }
    const cu = this.combineQ.material.uniforms;
    IDS.forEach((id, i) => { cu['tL' + i].value = this.layers[id].texture; cu.uOn.value[i] = S.on[id] ? 1 : 0; });
    cu.tA.value = next.texture; cu.uKey.value = EYE.key; cu.uP.value = EYE.p; cu.uLref.value = EYE.lref; cu.uFloor.value = EYE.floor; cu.uBeta.value = EYE.beta;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.combineQ.render(renderer);
  }
}

// the eye's own composer; app.js renders it instead of the default one when ?eye=1
export function createEye(renderer, scene, camera, atmo, nanGuard) {
  const q = new URLSearchParams(location.search), PR = S.PR;
  const rt = new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt), eye = new EyePass(renderer, scene, camera, atmo, q);
  composer.addPass(eye);                            // addPass / setSize size the layers (× pixel ratio)
  composer.addPass(nanGuard());
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .55, .3, .9));
  composer.addPass(new OutputPass());
  renderer.toneMapping = THREE.NoToneMapping;      // the asinh stretch is the tone curve
  return { composer, setSize: (w, h) => composer.setSize(w, h) };
}
