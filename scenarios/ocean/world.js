// Open ocean: the cockpit of a 12 m sailing yacht some 1000 km from the nearest land, motoring through an evening calm
// on a long swell. Sea to every horizon, no coast and no human glow; the boat's own deck, cabin, mast and rigging fill
// the foreground. The boat heads 320° (north-west), so the bow and the mast stand ahead-right of the western view.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, sm, kf, DEG } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { dirAE } from 'spectra/core/geom.js';
import { solid } from 'spectra/render/instrument.js';
import { spectral, PRESET, surfaceUniforms, SURF_FRAG_DECL, SURF_VERT_DECL } from 'spectra/render/surface.js';
import { HOR, HEMI, SUN_AZ, sunEl, moonDir, moonlit } from 'spectra/world/atmosphere.js';

// The boat's frame: u forward, v to starboard, y up; origin amidships on the waterline.
export const HEADING = 320;                                       // deg, the course (and the bow's azimuth)
const F = dirAE(HEADING, 0);                                       // forward (unit, world)
export const BOAT = { L: 12.2, beam: 3.9, deck: 1.05, speed: 3 };  // m, m, m freeboard, m/s (≈ 6 kn under engine)
const EYE = { u: -4.3, v: 0, y: BOAT.deck + 1.15 };                // standing in the cockpit (sole ~.5 m below deck)
export const MAST = { u: 1, h: 15.5 };                             // mast step (u) and height above deck
// half-beam of the hull at station u (bow at u = +6.2, transom at u = -6)
const halfBeam = u => u > 6.2 || u < -6 ? 0 : BOAT.beam / 2 * Math.sqrt(Math.max(0, 1 - ((u + .6) / 6.8) ** 2)) * (u < -4 ? .92 + .02 * (u + 6) : 1);

// boat frame -> world, with the current roll/pitch/heave (G's matrix, posed in walk() before anything reads it)
export const boatP = (u, y, v) => new V3(u, y, v).applyMatrix4(G.matrixWorld);
function pose(T) {   // the swell (period ~9 s, λ ≈ 120 m): a gentle roll of ±3°, pitch ±1.5° and heave ±.4 m
  G.position.set(0, .4 * Math.sin(T * .62 + 1.1), 0); G.rotation.set(0, -HEADING * DEG, 0);
  G.rotateX(3 * DEG * Math.sin(T * .7 + .4)); G.rotateZ(1.5 * DEG * Math.sin(T * .55)); G.updateMatrixWorld(true);
}

// Local surface presets (engine PRESET shape { A: [T0, Teq, 1/tau, eIR], B: [eMW, uvAlb, gamma, rRadio], C: [gloss,
// Tradio, Tmicro, Tgamma] }; source keys as listed above PRESET in engine/render/surface.js; T0/Teq/tau are STAND-INS
// there, time-compressed, only their order physical).
//   gelcoat deck (white polyester gelcoat over GFRP): sun-warmed at sunset, a thin skin over foam core cools fast and,
//     like any surface under a clear sky, ends below the air (radiative cooling: dew on deck by midnight) — STAND-IN;
//     eIR .9 (paints and plastics 0.85–0.95) [EL]; eMW .15 and transmission .9 micro / .95 radio: GFRP is radome
//     material (ε' ≈ 4, tan δ ≈ .01–.02, a few mm lose < 1 dB at X-band; Kozakoff, Analysis of Radome-Enclosed
//     Antennas, 2010) — STAND-IN for the exact values; uvAlb .08 (white gelcoat carries UV absorbers) — STAND-IN;
//     gamma .02 (glass fibre K-40 only) — STAND-IN; rRadio .1 (a dielectric, not a conductor) — STAND-IN
//   topsides (hull sides at the waterline): wetted, held at the sea temperature (no cooling) — same physics, gloss .3
//   companionway & engine-room bulkhead: the diesel under the cockpit runs all evening; the bulkhead over it sits at
//     ~40 °C — STAND-IN (engine rooms run 40–50 °C; the steps over the engine are warm to the touch)
//   mast & boom (anodised aluminium): eIR .8 (anodised Al 0.77–0.85, bare Al ~0.05) [EL]; eMW 0 and no transmission
//     (a metal reflects microwaves: e = 1 − R ≈ 0 [UMF]); gamma 0; rRadio 1 (a conductor); slow to cool — STAND-IN
//   sea: the engine's water preset, 18 °C [Masuda, Wilheit]; open-ocean water barely cools overnight
const GFRP = [.95, .9, .95];
export const SURF = {
  deck:     { A: [31, 13, 1 / 14, .9], B: [.15, .08, .02, .1], C: [0, ...GFRP] },
  topsides: { A: [18, 18, 0, .9], B: [.15, .08, .02, .1], C: [.3, ...GFRP] },
  engine:   { A: [40, 40, 0, .9], B: [.15, .06, .02, .1], C: [0, ...GFRP] },
  mast:     { A: [26, 14, 1 / 30, .8], B: [0, .1, 0, 1], C: [.2, 0, 0, 1] },
  sea:      PRESET.water,
};

export const SEA = { mat: null };
const G = new THREE.Group();                                     // the yacht, built in its own frame (x = u, z = v)
// Shared scene state the events write and the shaders read.
export const ENVSEA = {
  sunDir: { value: new V3() }, sunI: { value: 0 }, moonDir: { value: new V3() }, moonI: { value: 0 },
  hor: { value: new THREE.Color() }, sky: { value: new THREE.Color() },
  airT: { value: 20 }, uvGlit: { value: 0 }, bio: { value: 0 },
  boatP: { value: new THREE.Vector2(0, 0) }, boatF: { value: new THREE.Vector2(F.x, F.z) },
};
export const airTemp = t => 15 + 6 * Math.exp(-t / 20);           // °C, the marine air cools only a little overnight

// Sea: one shader for both looks (visible: sky reflection, glitter, swell, the boat's wash and its bioluminescence;
// instrument: the sea's own band physics). The boat stays at the origin and the water streams past it at BOAT.speed.
const SEA_GLSL = `
uniform float uSunI, uMoonI, uBio, uAirT, uUVglit; uniform vec3 uHor, uSky, uDeep, uSunDir, uMoonDir; uniform vec2 uBoatP, uBoatF;
vec2 wave(vec2 p, vec2 k, float w, float a){ float ph = dot(k,p) + w*uSurfTime; return a*k*cos(ph); }   // gradient of a*sin
float skyT(float y){ float e = 1. - pow(.7, 1./max(y, .04)); return mix(-60., uAirT, e); }                // 8–14 µm sky brightness temp (Idso 1981)
// the boat's wash in its own frame (u forward, v starboard): water pushed off the hull, the Kelvin arms at 19.47°
// (tan = .354) from the bow, the stern wake; 0..1
float washAt(vec2 xz){
  vec2 d = xz - uBoatP; float u = dot(d, uBoatF), v = dot(d, vec2(-uBoatF.y, uBoatF.x)), av = abs(v);
  float hb = (u > 6.2 || u < -6.) ? 0. : 1.95*sqrt(max(0., 1. - ((u + .6)/6.8)*((u + .6)/6.8)));
  float side = (u > -6.5 && u < 6.4) ? exp(-max(av - hb, 0.)/.9) : 0.;
  float b = 6.2 - u, arm = u < 6.2 ? exp(-abs(av - b*.354)/(.5 + .04*b))*exp(-b/70.) : 0.;
  float stern = u < -5.5 ? exp(-av/(1.4 + .12*(-5.5 - u)))*exp((u + 5.5)/90.) : 0.;
  return clamp(side*.9 + arm*.55 + stern*.7, 0., 1.);
}
vec3 seaBands(vec3 W, vec3 N, vec3 V, vec3 Rf, float dist, float foam, float inVis){
  vec3 col = vec3(0.); float cosv = clamp(dot(-V, N), 0., 1.), gz = pow(1. - cosv, 5.);
  float T = uSurfA.x + .3*(n2(W.xz*.003) - .5);                  // open ocean: a uniform surface, ±0.15 K
  if(uSOnI > 0.){                                   // INFRARED: water e = 1 - R(θ); foam is nearly a black body
    float e = mix(1. - (.02 + .6*gz), .99, foam), Tr = e*T + (1. - e)*skyT(Rf.y);
    float x = clamp((Tr + 4.)/44., 0., 1.);
    col += uSOnI*thermal(x)*(.04 + .5*x*x);
  }
  if(uSOnM > 0.){                                   // MICROWAVE: calm sea e≈0.45 (cold), foam e≈0.9 (warm lines)
    float e = mix(.45*(1. - .55*pow(1. - cosv, 3.)), .92, foam);
    float Tb = e*(T + 273.) + (1. - e)*mix(110., 8., pow(clamp(Rf.y, 0., 1.), .3)), x = clamp((Tb - 120.)/180., 0., 1.);
    float cs = max(.4, dist*.012); vec2 g = floor(W.xz/cs);
    float sp = mix(step(.88 - .3*x, h21(g + floor(uSurfTime*10.)))*(1. - inVis), 0., eyeSmooth);   // eye: none (decoration)
    col += uSOnM*mix(vec3(1.,.42,0.), vec3(1.,.85,.2), h21(g*1.7))*(x*x*.22 + sp*x*x*.5);
  }
  if(uSOnR > 0.){                                   // RADIO: transmitters (AIS, VHF) paint the water around them
    col += uSOnR*uRadioDiffuse*vec3(1.,.31,.85)*.9*txField(uTxR, W, N, 700., 9.)*1.1;
  }
  if(uSOnU > 0.){                                   // ULTRAVIOLET: sun glitter only while the low sun still has UV
    float s = max(dot(Rf, uSunDir), 0.);
    col += uSOnU*vec3(.62,.3,1.)*(uUVglit*(pow(s, 500.)*5. + pow(s, 40.)*.3) + uUVsky*(.06 + .4*foam)*.5);
  }
  if(uSOnG > 0.){                                   // GAMMA: 4 km of water under the keel — sea-water K-40 only
    vec3 gc = floor(W*2.2); float h = h21(gc.xz + floor(uSurfTime*16.)*3.17);
    col += uSOnG*mix(hsv(fract(uSurfTime*1.1 + h21(gc.xz)))*step(1. - uSurfB.z*.03, h)*1.8*(1. - smoothstep(40., 200., dist))*(1. - inVis), vec3(uSurfB.z*.03*1.8*.6), eyeSmooth);   // eye: expected value
  }
  return col;
}`;

function seaMaterial(instr) {
  const E = ENVSEA;
  const u = { ...surfaceUniforms(SURF.sea), uHor: E.hor, uSky: E.sky, uDeep: { value: new THREE.Color(.003, .007, .014) },
    uSunDir: E.sunDir, uSunI: E.sunI, uMoonDir: E.moonDir, uMoonI: E.moonI, uBio: E.bio, uAirT: E.airT, uUVglit: E.uvGlit,
    uBoatP: E.boatP, uBoatF: E.boatF };
  return new THREE.ShaderMaterial({ uniforms: u,
    vertexShader: SURF_VERT_DECL + `void main(){ vec4 w = modelMatrix*vec4(position,1.); vSurfW = w.xyz; vSurfN = vec3(0., 1., 0.); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: SURF_FRAG_DECL + SEA_GLSL + `
    // the sea's geometry at this pixel: swell + wind waves streaming past the boat, reflection, foam
    void seaGeo(out vec3 W, out float dist, out vec3 V, out vec3 N, out vec3 Rf, out vec2 p, out float fd, out float wash, out float foam){
      W = vSurfW; vec3 toP = W - cameraPosition; dist = length(toP); V = toP/dist;
      fd = 1. - smoothstep(150., 3000., dist); float fd2 = 1. - smoothstep(20., 400., dist);
      p = W.xz + uBoatF*${BOAT.speed.toFixed(1)}*uSurfTime; vec2 g = vec2(0.);
      // a long swell from the south-west (λ ≈ 120 m) under a light wind sea
      g += wave(p, vec2(.035,.038), .52, 1.5) + wave(p, vec2(.06,-.02), .7, .5) + wave(p, vec2(-.05,.09), 1., .45) + wave(p, vec2(.12,.05), 1.2, .3);
      g *= .5 + .5*fd;
      g += fd2*(wave(p, vec2(.55,.8), 2.6, .07) + wave(p, vec2(-.9,.45), 3.1, .05) + wave(p, vec2(.3,-1.1), 3.4, .04)
             + .05*vec2(n2(p*1.3+uSurfTime*.6)-.5, n2(p*1.3-uSurfTime*.5+7.)-.5));
      N = normalize(vec3(-g.x, 1., -g.y)); Rf = reflect(V, N);
      Rf.y = abs(Rf.y);
      wash = washAt(W.xz)*(.55 + .45*n2(p*1.7 + uSurfTime*.8));
      float caps = smoothstep(.82, .95, n2(p*.06 + 3.))*smoothstep(.6, .9, n2(p*.9 - uSurfTime*.2))*.35;   // a rare whitecap (calm)
      foam = clamp(wash + caps*fd, 0., 1.);
    }
    void main(){
      vec3 W, V, N, Rf; vec2 p; float dist, fd, wash, foam;
      seaGeo(W, dist, V, N, Rf, p, fd, wash, foam);
#ifdef SEA_INSTR
      vec2 q = W.xz/40., f = abs(fract(q) - .5), w = fwidth(q)*1.2;
      float line = max(smoothstep(.5 - w.x, .5, f.x), smoothstep(.5 - w.y, .5, f.y))*(1. - smoothstep(.12, .35, max(w.x, w.y)))*(1. - smoothstep(200., 4000., dist));
      gl_FragColor = vec4(vec3(.006,.007,.014) + vec3(.16,.2,.42)*line*.8 + seaBands(W, N, V, Rf, dist, foam, 0.), 1.);
#else
      float fres = .02 + .98*pow(1. - clamp(dot(-V, N), 0., 1.), 5.);   // clamp: pow(<0) is NaN on GPUs
      vec3 skyc = mix(uHor, uSky, smoothstep(0., .35, Rf.y));
      vec3 col = mix(uDeep, skyc, fres);
      float s = max(dot(Rf, uSunDir), 0.), m = max(dot(Rf, uMoonDir), 0.);
      col += vec3(1., .5, .28)*uSunI*(pow(s, 900.)*14. + pow(s, 60.)*.35);              // sun glitter path
      col += vec3(.75,.82,1.)*uMoonI*(pow(m, 1200.)*6. + pow(m, 90.)*.12);              // moon glitter path
      col = mix(col, uSky*1.6 + uHor*.6, foam*.5);
      // dinoflagellates flash where the hull and the wake shear the water (mechanical stimulation), nowhere else
      // (cells of ~25 cm flashing for ~0.1 s: a speckle of sparks, densest against the hull)
      float bio = wash*wash*smoothstep(.55, .9, n2(p*4. + uSurfTime*.7))*(.4 + .6*n2(p*9. - uSurfTime*3.));
      col += vec3(.1,.55,1.)*uBio*bio*.9;
      col = mix(col, uHor, 1. - exp(-pow(dist*.00008, 2.)));
      col += uOverlay*seaBands(W, N, V, Rf, dist, foam, 1.);
      gl_FragColor = vec4(col, 1.);
#endif
    }`,
    defines: instr ? { SEA_INSTR: '' } : {},
  });
}
// spectral eye (engine/render/compose.js): the sea's own band hook — seaBands one band at a time, as luminance
const SEA_EYE = `
float eyeSeaL(float r, float m, float i, float u, float g, vec3 W, vec3 N, vec3 V, vec3 Rf, float dist, float foam){
  eyeMR = r; eyeMM = m; eyeMI = i; eyeMU = u; eyeMG = g; eyeSmooth = 1.; return eyeL(seaBands(W, N, V, Rf, dist, foam, 0.)); }
vec3 eyeTrans(){ return uSurfC.yzw; }
void eyeBands(out vec4 o1, out vec4 o3){
  vec3 W, V, N, Rf; vec2 p; float dist, fd, wash, foam;
  seaGeo(W, dist, V, N, Rf, p, fd, wash, foam);
  o1 = vec4(eyeSeaL(0., 0., 1., 0., 0., W, N, V, Rf, dist, foam), eyeSeaL(0., 0., 0., 1., 0., W, N, V, Rf, dist, foam),
            eyeSeaL(0., 0., 0., 0., 1., W, N, V, Rf, dist, foam), 1.);
  o3 = vec4(eyeSeaL(1., 0., 0., 0., 0., W, N, V, Rf, dist, foam), eyeSeaL(0., 1., 0., 0., 0., W, N, V, Rf, dist, foam), 0., 1.);
  eyeMR = eyeMM = eyeMI = eyeMU = eyeMG = 1.; eyeSmooth = 0.; }`;

function sea() {
  const mat = seaMaterial(false);
  mat.userData.eyeBands = SEA_EYE;
  SEA.mat = mat;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000, 1, 1), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = .02;
  S.scene.add(spectral(m, SURF.sea, { custom: true, weight: 2 }));
  solid(m, seaMaterial(true));
}

// ------------------------------------------------------------------ the yacht
// Built in the boat frame (x = u forward, z = v starboard, y up) inside one group that rolls and pitches on the swell.
const ni = g => g.index ? g.toNonIndexed() : g;               // mergeGeometries needs one kind
const tube = (a, b, r) => {                                   // a thin cylinder from a to b (boat-frame V3s)
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 5, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return ni(g);
};
function hullShape(scale = 1) {                               // deck outline in (u, v)
  const s = new THREE.Shape(), n = 28;
  for (let i = 0; i <= n; i++) { const u = -6 + 12.2 * i / n; s[i ? 'lineTo' : 'moveTo'](u, -halfBeam(u) * scale); }
  for (let i = n; i >= 0; i--) { const u = -6 + 12.2 * i / n; s.lineTo(u, halfBeam(u) * scale); }
  return s;
}
function yacht() {
  // topsides: the deck outline extruded down to below the waterline
  const hull = new THREE.ExtrudeGeometry(hullShape(), { depth: BOAT.deck + .7, bevelEnabled: false, curveSegments: 1 });
  hull.rotateX(Math.PI / 2); hull.translate(0, BOAT.deck, 0);           // shape (u, v) -> (x, z); extrusion goes down
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: .5 });
  G.add(spectral(new THREE.Mesh(hull, hullMat), SURF.topsides, { weight: .05 }));
  // deck: a thin slab, the coachroof and the cockpit coamings
  const parts = [];
  const deck = new THREE.ExtrudeGeometry(hullShape(.98), { depth: .06, bevelEnabled: false, curveSegments: 1 }); deck.rotateX(Math.PI / 2); deck.translate(0, BOAT.deck + .06, 0); parts.push(deck);
  const roof = new THREE.BoxGeometry(4.4, .55, 2.5); roof.translate(.2, BOAT.deck + .3, 0); parts.push(roof);
  const roofTop = new THREE.BoxGeometry(4, .08, 2.2); roofTop.translate(.2, BOAT.deck + .6, 0); parts.push(roofTop);
  const coam = (v) => { const b = new THREE.BoxGeometry(3.4, .35, .08); b.translate(-4.1, BOAT.deck + .2, v); return b; };
  parts.push(coam(-1.25), coam(1.25));
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: .6 });
  G.add(spectral(new THREE.Mesh(mergeGeometries(parts.map(ni)), deckMat), SURF.deck, { weight: .08 }));
  // companionway and the bulkhead over the engine room (warm while the diesel runs)
  const comp = new THREE.BoxGeometry(.25, .55, 1.1); comp.translate(-1.95, BOAT.deck + .3, 0);
  const hatch = new THREE.BoxGeometry(.9, .1, 1.0); hatch.translate(-1.5, BOAT.deck + .62, 0);
  G.add(spectral(new THREE.Mesh(mergeGeometries([comp, hatch].map(ni)), new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: .7 })), SURF.engine, { weight: .01 }));
  // mast, boom with the stowed main, spreaders, standing rigging, lifelines and pulpits: one aluminium/steel mesh
  const D0 = BOAT.deck, top = new V3(MAST.u, D0 + MAST.h, 0), m = [];
  m.push(new THREE.CylinderGeometry(.08, .1, MAST.h, 8).translate(MAST.u, D0 + MAST.h / 2, 0));
  m.push(tube(new V3(MAST.u, D0 + 2.1, 0), new V3(-3.1, D0 + 2.0, 0), .07));                         // boom (sheeted to the coachroof, clear of the cockpit)
  m.push(new THREE.CylinderGeometry(.16, .16, 3.6, 7).rotateZ(Math.PI / 2).translate(-1, D0 + 2.25, 0));   // stowed mainsail in its cover
  for (const h of [.38, .7]) { const y = D0 + MAST.h * h, w = 1.3 - h * .7; m.push(tube(new V3(MAST.u, y, -w), new V3(MAST.u, y, w), .025)); }
  for (const s of [-1, 1]) {                                                                           // shrouds via the spreaders
    const ch = new V3(MAST.u - .3, D0, s * halfBeam(MAST.u - .3) * .97);
    m.push(tube(ch, new V3(MAST.u, D0 + MAST.h * .38, s * 1.03), .008), tube(new V3(MAST.u, D0 + MAST.h * .38, s * 1.03), new V3(MAST.u, D0 + MAST.h * .7, s * .81), .008),
      tube(new V3(MAST.u, D0 + MAST.h * .7, s * .81), top, .008), tube(ch, new V3(MAST.u, D0 + MAST.h * .38, 0), .008));
    for (let i = 0; i < 5; i++) {                                                                       // stanchions + two lifelines
      const u0 = -5.3 + i * 2.4, u1 = u0 + 2.4, b0 = halfBeam(u0) * .95, b1 = halfBeam(Math.min(u1, 5.4)) * .95;
      m.push(tube(new V3(u0, D0, s * b0), new V3(u0, D0 + .65, s * b0), .014));
      if (i < 4) for (const y of [.35, .65]) m.push(tube(new V3(u0, D0 + y, s * b0), new V3(u1, D0 + y, s * b1), .005));
    }
  }
  m.push(tube(new V3(6.1, D0, 0), top.clone().add(new V3(0, -.2, 0)), .009));                         // forestay
  m.push(tube(new V3(-5.9, D0, 0), top, .009));                                                        // backstay
  m.push(tube(new V3(5.3, D0 + .65, -.7), new V3(6.0, D0 + .65, 0), .016), tube(new V3(5.3, D0 + .65, .7), new V3(6.0, D0 + .65, 0), .016));   // pulpit
  for (const s of [-1, 1]) m.push(tube(new V3(-5.9, D0, s * .8), new V3(-5.9, D0 + 1.9, s * .8), .03)); // stern arch legs
  m.push(tube(new V3(-5.9, D0 + 1.9, -.8), new V3(-5.9, D0 + 1.9, .8), .03));
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: .35, metalness: .7 });
  G.add(spectral(new THREE.Mesh(mergeGeometries(m.map(ni)), metal), SURF.mast, { weight: .01 }));
  S.scene.add(G); pose(0);
}

export function build() {
  sea(); yacht();
  return {
    groundAt: () => 0,
    walk(t, camera) {   // standing in the cockpit; the boat rides the swell and you with it
      pose(S.T); camera.position.copy(boatP(EYE.u, EYE.y, EYE.v));
    },
    update(t) {
      const el = sunEl(), E = ENVSEA;
      E.hor.value.setRGB(...kf(HOR, t)[0]);
      const sk = kf(HEMI, t)[0]; E.sky.value.setRGB(sk[0] * .7, sk[1] * .7, sk[2] * .8);
      E.sunDir.value.copy(dirAE(SUN_AZ, Math.max(el, -1))); E.sunI.value = sm(-1.2, 2, el);
      E.moonDir.value.copy(moonDir()); E.moonI.value = moonlit();
      E.airT.value = airTemp(t); E.uvGlit.value = sm(.8, 4, el);
    },
  };
}
