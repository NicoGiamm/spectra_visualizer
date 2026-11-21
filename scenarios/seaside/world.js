// A west-facing beach: the sun sets straight into the sea between two rocky headlands. You stand on a low dune
// crest ~30 m above the waterline, so the sea fills the lower half of the view in every band.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, clamp, lerp, sm, kf, env, R, noise2, fbm2, ridged2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { dirAE } from 'spectra/core/geom.js';
import { solid } from 'spectra/render/instrument.js';
import { spectral, PRESET, mixSurf, surfaceUniforms, SURF_FRAG_DECL, SURF_VERT_DECL } from 'spectra/render/surface.js';
import { heightfield } from 'spectra/world/heightfield.js';
import { HOR, HEMI, SUN_AZ, sunEl, moonDir, moonlit, GAL_C } from 'spectra/world/atmosphere.js';

// Shoreline: a straight beach at z = -15 with two promontories ~900 m north (+x) and south (-x).
const PROM = 900, PROM_W = 350, PROM_L = 600;
export const coastZ = x => -15 - PROM_L * Math.exp(-(((Math.abs(x) - PROM) / PROM_W) ** 2));
const coastGLSL = `float coastZ(float x){ float q = (abs(x) - ${PROM.toFixed(1)}) / ${PROM_W.toFixed(1)}; return -15. - ${PROM_L.toFixed(1)}*exp(-q*q); }`;
const DUNE_D = 30;                                                // the viewer's dune crest, metres inland of the waterline

export function heightAt(x, z) {
  const d = z - coastZ(x);                                    // + inland, - offshore
  let h = d > 0 ? d * .035 : Math.max(d * .03, -14);          // gentle beach, shelving seabed
  h += 7.5 * Math.exp(-((x / 40) ** 2) - (((d - DUNE_D) / 13) ** 2)) * sm(-2, 8, d);   // the dune you stand on
  h += sm(35, 140, d) * 7 * fbm2(x * .018, z * .018, 3);      // dunes behind the beach
  const head = Math.exp(-(((Math.abs(x) - PROM) / (PROM_W * 1.15)) ** 2));
  h += head * sm(-35, 70, d) * (35 + 170 * Math.pow(ridged2(x * .0014 + 3, z * .0014 + 1, 5), 2));   // rocky promontories, cliffs at the water
  h += sm(250, 900, d) * 120 * fbm2(x * .0015 + 7, z * .0015, 4);                                     // hills far inland
  return h;
}

// Local surface presets (same shape as engine PRESET): { A: [T0, Teq, 1/tau, eIR], B: [eMW, uvAlb, gamma, rRadio], C: [gloss, 0, 0, 0] }
//   wet sand: tracks the water temperature, eMW ~0.6 (water in the pores), glossy (mirrors the sky at grazing angles)
//   granite: slow to cool, highest natural gamma (K-40, U, Th in feldspar and zircon)
//   beach sand: heavy-mineral grains (monazite, zircon) give it a gamma glow second only to granite
export const SURF = {
  wetSand: { A: [23, 16, 1 / 30, .96], B: [.6, .1, .55, .5], C: [.5, 0, 0, 0] },
  sand:    { A: [35, 8, 1 / 22, .92], B: [.9, .24, .7, .3], C: [0, 0, 0, 0] },   // 35 °C at sunset, crosses the sea's 18 °C near t=22
  dune:    { A: [27, 7, 1 / 10, .97], B: [.92, .05, .45, .2], C: [0, 0, 0, 0] },   // marram grass on the dunes
  granite: { A: [31, 14, 1 / 45, .9], B: [.88, .12, 1, .5], C: [0, 0, 0, 0] },
  sea:     PRESET.water,
};

export const sandMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97, metalness: 0 });
export const STAND = new V3(0, 0, coastZ(0) + DUNE_D);              // where the viewer stands
STAND.y = heightAt(STAND.x, STAND.z);
export const SEA = { mat: null };
// Shared scene state the events write and the shaders read.
export const ENVSEA = {
  sunDir: { value: new V3() }, sunI: { value: 0 }, moonDir: { value: new V3() }, moonI: { value: 0 },
  hor: { value: new THREE.Color() }, sky: { value: new THREE.Color() },
  radP: { value: new V3() }, radA: { value: 0 }, radI: { value: 0 },          // ship X-band radar: position, beam bearing, power
  fire: { value: new THREE.Vector4(0, 0, 0, 0) },                              // bonfire: position, heat
  mist: { value: 0 }, airT: { value: 20 }, uvGlit: { value: 0 }, bio: { value: 0 },
  rs: { value: Array.from({ length: 3 }, () => new THREE.Vector4()) },        // sky radio sources mirrored by the sea: dir, strength x fringe
};
const PULSAR_D = dirAE(242, 52);   // must match sky.pulsar()'s spin axis
export const airTemp = t => 12 + 10 * Math.exp(-t / 20);         // °C, falls through the evening
// Radar echo of a surface at W: bright where the beam just swept past, fading as the antenna turns on (PPI persistence)
const RADAR_GLSL = `
uniform vec3 uRadP; uniform float uRadA, uRadI;
float radarEcho(vec3 W, vec3 N){
  if(uRadI <= 0.) return 0.;
  vec3 L = uRadP - W; float r = length(L); L /= r;
  float b = atan(-L.z, -L.x), dA = mod(uRadA - b, 6.2831853);              // how far the antenna has turned since it lit W
  return uRadI*exp(-dA/.45)*smoothstep(0., .25, dot(N, L) + .1)*(1. - smoothstep(2500., 5200., r));
}`;

function terrain() {
  const C = { sand: [.2, .16, .11], wet: [.06, .05, .042], dune: [.07, .075, .035], rock: [.07, .065, .06] };
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const g = heightfield({ heightAt, colorAt(x, y, z, slope) {
    const d = z - coastZ(x), nz = fbm2(x * .05, z * .05, 3);
    let c = mix(C.wet, C.sand, sm(1, 7, d));
    c = mix(c, C.dune, sm(30, 90, d) * (.5 + .5 * nz));
    return mix(c, C.rock, clamp(sm(.15, .35, slope) + sm(12, 34, y) * .8));
  }, surfAt(x, y, z, slope) {        // wet sand -> dry sand -> dune grass -> granite promontories
    const d = z - coastZ(x), nz = fbm2(x * .05, z * .05, 3), L = (a, b, k) => mixSurf([[a, 1 - k], [b, k]]);
    let s = L(SURF.wetSand, SURF.sand, sm(1, 7, d));
    s = L(s, SURF.dune, sm(30, 90, d) * (.5 + .5 * nz));
    return L(s, SURF.granite, clamp(sm(.15, .35, slope) + sm(12, 34, y) * .8));
  }, meanRadius: 250 });
  const uniforms = { uRadP: ENVSEA.radP, uRadA: ENVSEA.radA, uRadI: ENVSEA.radI, uFire: ENVSEA.fire, uHor: ENVSEA.hor, uSky: ENVSEA.sky,
    uSunDir: ENVSEA.sunDir, uSunI: ENVSEA.sunI, uMoonDir: ENVSEA.moonDir, uMoonI: ENVSEA.moonI };
  const extraDecl = RADAR_GLSL + `uniform vec4 uFire; uniform vec3 uHor, uSky, uSunDir, uMoonDir; uniform float uSunI, uMoonI;
  vec3 coastExtra(vec3 W, vec3 N, float dist, float inVis){
    vec3 c = vec3(0.);
    if(uSOnM > 0.){                                   // ship radar echoes off the cliffs (microwave)
      float e = radarEcho(W, N); vec2 gc = floor(W.xz*.12);
      c += uSOnM*vec3(1.,.55,.08)*e*(.35 + 1.2*step(.55, h21(gc + floor(uSurfTime*12.))));
    }
    if(uSOnI > 0. && uFire.w > 0.){                   // bonfire: hot sand around the pit
      float r = length(W.xz - uFire.xz); c += uSOnI*thermal(clamp(.95 - r*.22, 0., 1.))*uFire.w*exp(-r*r*.12)*.8;
    }
    if(uSOnG > 0.){                                   // granite gamma speckle that stays visible on the far cliffs
      float cs = max(.45, dist*.006); vec3 gc = floor(W/cs);
      float h = h21(gc.xz + gc.y*17.31 + floor(uSurfTime*14.)*3.17), rk = smoothstep(.7, .95, vSurfB.z);
      c += uSOnG*hsv(fract(uSurfTime*1.1 + h21(gc.xz)))*step(1. - .045*rk, h)*1.5*smoothstep(160., 420., dist)*(1. - inVis);
    }
    return c;
  }`;
  // wet sand mirrors the sky and the low sun in visible light (gloss is stored in aSurfC.x)
  const visExtra = `float wetK = clamp(vSurfC.x*2.2 - .1, 0., 1.);
    if(wetK > 0.){ vec3 V = normalize(W - cameraPosition), Rf = reflect(V, N); Rf.y = abs(Rf.y);
      float fres = .03 + .97*pow(1. - max(dot(-V, N), 0.), 5.);
      vec3 sk = mix(uHor, uSky, smoothstep(0., .35, Rf.y)) + vec3(1., .5, .28)*uSunI*pow(max(dot(Rf, uSunDir), 0.), 300.)*4. + vec3(.75,.82,1.)*uMoonI*pow(max(dot(Rf, uMoonDir), 0.), 400.)*2.;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, sk, wetK*min(fres*1.6, .8)); }
    gl_FragColor.rgb += uOverlay*coastExtra(W, N, length(W - cameraPosition), 1.);`;
  S.scene.add(spectral(new THREE.Mesh(g, sandMat), 'attr', { lines: 'grid', cell: 6, mean: g.userData.surfMean, weight: 1,
    uniforms, extraDecl, visExtra, instrExtra: 'c += coastExtra(W, N, dist, 0.);' }));
}

// Sea: one shader for both looks. Visible = sky reflection + glitter + surf + mist; instrument = dark base + the sea's own
// band physics (seaBands): IR with water's angle-dependent emissivity, microwave brightness temperature, radio tx and the
// mirrored radio sky, UV glitter while the sun's UV lasts, near-silent gamma.
const SEA_GLSL = coastGLSL + RADAR_GLSL + `
uniform float uSunI, uMoonI, uBio, uMist, uAirT, uUVglit; uniform vec3 uHor, uSky, uDeep, uSunDir, uMoonDir; uniform vec4 uRS[3];
vec2 wave(vec2 p, vec2 k, float w, float a){ float ph = dot(k,p) + w*uSurfTime; return a*k*cos(ph); }   // gradient of a*sin
float skyT(float y){ float e = 1. - pow(.25, 1./max(y, .04)); return mix(-60., uAirT, e); }               // 8–14 µm sky brightness temp
vec3 seaBands(vec3 W, vec3 N, vec3 V, vec3 Rf, float dist, float foam, float inVis){
  vec3 col = vec3(0.); float cosv = clamp(dot(-V, N), 0., 1.), gz = pow(1. - cosv, 5.);
  float T = uSurfA.x + .6*(n2(W.xz*.004) - .5), mistK = uMist*(1. - exp(-dist/700.));
  if(uSOnI > 0.){                                   // INFRARED: water e = 1 - R(θ); foam is nearly a black body
    float e = mix(1. - (.02 + .6*gz), .99, foam), Tr = e*T + (1. - e)*skyT(Rf.y);
    Tr = mix(Tr, uAirT - 3., mistK);                // cold mist hides the warm sea toward the horizon
    float x = clamp((Tr + 4.)/44., 0., 1.);
    col += uSOnI*thermal(x)*(.04 + .5*x*x);
  }
  if(uSOnM > 0.){                                   // MICROWAVE: calm sea e≈0.45 (cold), foam e≈0.9 (warm lines)
    float e = mix(.45*(1. - .55*pow(1. - cosv, 3.)), .92, foam);
    float Tb = e*(T + 273.) + (1. - e)*mix(110., 8., pow(clamp(Rf.y, 0., 1.), .3)), x = clamp((Tb - 120.)/180., 0., 1.);
    float cs = max(.4, dist*.012); vec2 g = floor(W.xz/cs);
    float sp = step(.88 - .3*x, h21(g + floor(uSurfTime*10.)))*(1. - inVis);
    col += uSOnM*mix(vec3(1.,.42,0.), vec3(1.,.85,.2), h21(g*1.7))*(x*x*.22 + sp*x*x*.5);
    float cl = radarEcho(W, vec3(0.,1.,0.))*exp(-length(W - uRadP)/2400.)*step(.55, h21(floor(W.xz*.05) + floor(uSurfTime*12.)));   // radar sea clutter, fading out to the headlands
    col += uSOnM*vec3(1.,.55,.08)*cl*.6;
  }
  if(uSOnR > 0.){                                   // RADIO: transmitters paint the water; the sea mirrors the radio sky
    col += uSOnR*vec3(1.,.31,.85)*.9*txField(uTxR, W, N, 700., 9.)*1.1;
    vec3 R0 = reflect(V, vec3(0., 1., 0.)); float img = 0.;
    for(int i = 0; i < 3; i++){ if(uRS[i].w <= 0.) continue;
      img += uRS[i].w*(pow(max(dot(R0, uRS[i].xyz), 0.), 3000.)*2.5 + pow(max(dot(Rf, uRS[i].xyz), 0.), 160.)*.7); }
    col += uSOnR*vec3(1.,.31,.85)*img*(.45 + .55*step(.5, fract(dist/14. - uSurfTime*.9)));
  }
  if(uSOnU > 0.){                                   // ULTRAVIOLET: sun glitter only while the low sun still has UV; foam reflects some
    float s = max(dot(Rf, uSunDir), 0.);
    col += uSOnU*vec3(.62,.3,1.)*(uUVglit*(pow(s, 500.)*5. + pow(s, 40.)*.3) + uUVsky*(.06 + .4*foam)*.5);
  }
  if(uSOnG > 0.){                                   // GAMMA: water shields the seabed — almost silent
    vec3 gc = floor(W*2.2); float h = h21(gc.xz + floor(uSurfTime*16.)*3.17);
    col += uSOnG*hsv(fract(uSurfTime*1.1 + h21(gc.xz)))*step(1. - uSurfB.z*.03, h)*1.8*(1. - smoothstep(40., 200., dist))*(1. - inVis);
  }
  return col;
}`;

function seaMaterial(instr) {
  const u = { ...surfaceUniforms(SURF.sea), uHor: ENVSEA.hor, uSky: ENVSEA.sky, uDeep: { value: new THREE.Color(.004, .008, .014) },
    uSunDir: ENVSEA.sunDir, uSunI: ENVSEA.sunI, uMoonDir: ENVSEA.moonDir, uMoonI: ENVSEA.moonI, uBio: ENVSEA.bio, uMist: ENVSEA.mist,
    uAirT: ENVSEA.airT, uUVglit: ENVSEA.uvGlit, uRS: ENVSEA.rs, uRadP: ENVSEA.radP, uRadA: ENVSEA.radA, uRadI: ENVSEA.radI };
  return new THREE.ShaderMaterial({ uniforms: u,
    vertexShader: SURF_VERT_DECL + `void main(){ vec4 w = modelMatrix*vec4(position,1.); vSurfW = w.xyz; vSurfN = vec3(0., 1., 0.); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: SURF_FRAG_DECL + SEA_GLSL + `
    void main(){
      vec3 W = vSurfW, toP = W - cameraPosition; float dist = length(toP); vec3 V = toP/dist;
      float fd = 1. - smoothstep(150., 2500., dist), fd2 = 1. - smoothstep(30., 400., dist);
      vec2 p = W.xz, g = vec2(0.);
      g += wave(p, vec2(.06,.10), .9, .9) + wave(p, vec2(-.09,.07), 1.1, .7) + wave(p, vec2(.13,-.05), 1.3, .5);
      g *= fd;
      g += fd2*(wave(p, vec2(.55,.8), 2.6, .09) + wave(p, vec2(-.9,.45), 3.1, .07) + wave(p, vec2(.3,-1.1), 3.4, .05)
             + .06*vec2(n2(p*1.3+uSurfTime*.6)-.5, n2(p*1.3-uSurfTime*.5+7.)-.5));
      vec3 N = normalize(vec3(-g.x, 1., -g.y)), Rf = reflect(V, N);
      Rf.y = abs(Rf.y);
      // surf: breaking lines rolling in toward the beach, and the wash at the edge
      float d = coastZ(W.x) - W.z;                                                     // metres offshore
      float roll = smoothstep(.75, 1., sin(d*.32 + uSurfTime*1.4 + n2(vec2(W.x*.05, 0.))*3.))*(1. - smoothstep(4., 38., d));
      float wash = 1. - smoothstep(0., 3.5, d), crest = roll*(.5 + .5*n2(p*.8 + uSurfTime*.3));
      float foam = clamp(crest + wash*.7, 0., 1.)*fd;
#ifdef SEA_INSTR
      vec2 q = W.xz/40., f = abs(fract(q) - .5), w = fwidth(q)*1.2;
      float line = max(smoothstep(.5 - w.x, .5, f.x), smoothstep(.5 - w.y, .5, f.y))*(1. - smoothstep(.12, .35, max(w.x, w.y)))*(1. - smoothstep(200., 4000., dist));
      gl_FragColor = vec4(vec3(.006,.007,.014) + vec3(.16,.2,.42)*line*.8 + seaBands(W, N, V, Rf, dist, foam, 0.), 1.);
#else
      float fres = .02 + .98*pow(1. - max(dot(-V, N), 0.), 5.);
      vec3 skyc = mix(uHor, uSky, smoothstep(0., .35, Rf.y));
      vec3 col = mix(uDeep, skyc, fres);
      float s = max(dot(Rf, uSunDir), 0.), m = max(dot(Rf, uMoonDir), 0.);
      col += vec3(1., .5, .28)*uSunI*(pow(s, 900.)*14. + pow(s, 60.)*.35);              // sun glitter path
      col += vec3(.75,.82,1.)*uMoonI*(pow(m, 1200.)*6. + pow(m, 90.)*.12);              // moon glitter path
      col = mix(col, uSky*1.6 + uHor*.6, foam*.55);
      float bio = (crest*smoothstep(.45, .8, n2(p*.35 + uSurfTime*.2)) + wash*.12*n2(p*2. + uSurfTime))*fd;   // patchy, only where waves break
      col += vec3(.1,.55,1.)*uBio*bio*(.6 + .4*n2(p*3. + uSurfTime*2.))*1.2;            // bioluminescent surf
      col = mix(col, uHor, 1. - exp(-pow(dist*.0001, 2.)));
      col = mix(col, uHor*.8 + vec3(.05,.06,.08)*uMoonI, uMist*(1. - exp(-dist/900.))*.85);   // sea mist, lit by the moon
      col += uOverlay*seaBands(W, N, V, Rf, dist, foam, 1.);
      gl_FragColor = vec4(col, 1.);
#endif
    }`,
    defines: instr ? { SEA_INSTR: '' } : {},
  });
}

function sea() {
  const mat = seaMaterial(false);
  SEA.mat = mat;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000, 1, 1), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = .05;
  S.scene.add(spectral(m, SURF.sea, { custom: true, weight: 1.6 }));
  solid(m, seaMaterial(true));                         // our own instrument look replaces the generic one
}

function rocks() {   // boulders at the foot of the promontories and a few on the beach
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new V3().fromBufferAttribute(p, i); v.multiplyScalar(.75 + .5 * noise2(v.x * 2 + 5, v.y * 2 + v.z * 3)); v.y *= .7; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const M = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    let x, z, s;
    if (i < 40) { x = (R() - .5) * 160; z = coastZ(x) + 2 + R() * 14; s = .2 + R() ** 2 * .9; }
    else { const side = R() < .5 ? -1 : 1; x = side * (PROM + (R() - .5) * PROM_W * 1.6); z = coastZ(x) + (R() - .7) * 40; s = 1 + R() * 5; }
    tmp.position.set(x, heightAt(x, z) - s * .2, z); tmp.rotation.set(R() * .5, R() * 6.28, R() * .5); tmp.scale.set(s * (.8 + R() * .5), s, s * (.8 + R() * .5)); tmp.updateMatrix(); M.push(tmp.matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(.08, .075, .07), roughness: .9, flatShading: true }), M.length);
  M.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color().setScalar(.7 + R() * .6)); });
  S.scene.add(spectral(mesh, SURF.granite, { weight: .3 }));
}

// Coast radio station on the north headland (AIS base station, VHF ch16 watch) and the cliff-top interferometer
// antenna on the south headland. Positions are exported for the events.
const onLand = (x, dz) => { const z = coastZ(x) + dz; return new V3(x, heightAt(x, z), z); };
export const COAST_STATION = onLand(760, 140);
export const CLIFF_ANT = onLand(-900, 22);
function masts() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: .6, metalness: .3 }), parts = [];
  const mast = new THREE.CylinderGeometry(.35, .9, 34, 6); mast.translate(COAST_STATION.x, COAST_STATION.y + 17, COAST_STATION.z); parts.push(mast);
  const hut = new THREE.BoxGeometry(10, 4, 7); hut.translate(COAST_STATION.x + 9, COAST_STATION.y + 2, COAST_STATION.z); parts.push(hut);
  // 1940s-style cliff-top Yagi array: a short mast with a boom and cross elements, looking out to sea
  const am = new THREE.CylinderGeometry(.2, .3, 7, 5); am.translate(CLIFF_ANT.x, CLIFF_ANT.y + 3.5, CLIFF_ANT.z); parts.push(am);
  const boom = new THREE.BoxGeometry(.25, .25, 9); boom.rotateY(.6); boom.translate(CLIFF_ANT.x, CLIFF_ANT.y + 7, CLIFF_ANT.z); parts.push(boom);
  for (let i = 0; i < 5; i++) { const e = new THREE.BoxGeometry(5 - i * .3, .12, .12); e.rotateY(.6); e.translate(CLIFF_ANT.x - Math.sin(.6) * (i * 2 - 4), CLIFF_ANT.y + 7, CLIFF_ANT.z - Math.cos(.6) * (i * 2 - 4)); parts.push(e); }
  const m = new THREE.Mesh(mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)), mat);
  S.scene.add(spectral(m, 'concrete', { weight: .02 }));
}

export function build() {
  terrain(); sea(); rocks(); masts();
  return {
    groundAt: (x, z) => Math.max(0, heightAt(x, z)),
    walk(t, camera) {   // standing still on the dune crest; a slow breathing sway
      camera.position.set(STAND.x + Math.sin(t * .7) * .04, STAND.y + 1.7 + Math.sin(t * 2.1) * .015, STAND.z);
    },
    update(t) {
      const el = sunEl(), E = ENVSEA;
      E.hor.value.setRGB(...kf(HOR, t)[0]);
      const sk = kf(HEMI, t)[0]; E.sky.value.setRGB(sk[0] * .7, sk[1] * .7, sk[2] * .8);
      E.sunDir.value.copy(dirAE(SUN_AZ, Math.max(el, -1))); E.sunI.value = sm(-1.2, 2, el);
      E.moonDir.value.copy(moonDir()); E.moonI.value = moonlit() * sm(-1, 3, moonDir().y * 57.3);
      E.airT.value = airTemp(t); E.uvGlit.value = sm(.8, 4, el);       // the low sun's UV is gone before it touches the sea
      // sea interferometer: the flat sea mirrors the radio sky, and the mirrored copies interfere with
      // each other as they move (Lloyd's mirror — the cliff antenna watches the fringes). Slots:
      // the Sun's radio during the sunset, Sgr A*'s synchrotron, the pulsar.
      const sunD = dirAE(SUN_AZ, el), rs = E.rs.value;
      rs[0].set(sunD.x, sunD.y, sunD.z, env(t, 0, 16, 2) * .9);
      rs[1].set(GAL_C.x, GAL_C.y, GAL_C.z, sm(18, 30, t) * .7);
      rs[2].set(PULSAR_D.x, PULSAR_D.y, PULSAR_D.z, env(t, 20, 60, 3) * .8);
      if (S.scene.fog) S.scene.fog.density = .0001 + .00025 * E.mist.value;
    },
  };
}
