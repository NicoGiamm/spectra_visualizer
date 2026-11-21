// A west-facing beach: the sun sets straight into the sea between two rocky headlands.
import * as THREE from 'three';
import { V3, clamp, lerp, sm, kf, R, noise2, fbm2, ridged2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { dirAE } from 'spectra/core/geom.js';
import { spectral, PRESET, mixSurf, surfaceUniforms, SURF_FRAG_DECL, SURF_VERT_DECL } from 'spectra/render/surface.js';
import { COMMON } from 'spectra/render/shaders.js';
import { heightfield } from 'spectra/world/heightfield.js';
import { HOR, HEMI, SUN_AZ, sunEl, moonDir, moonlit } from 'spectra/world/atmosphere.js';

// Shoreline: a straight beach at z = -15 with two promontories ~900 m north (+x) and south (-x).
const PROM = 900, PROM_W = 350, PROM_L = 600;
export const coastZ = x => -15 - PROM_L * Math.exp(-(((Math.abs(x) - PROM) / PROM_W) ** 2));
const coastGLSL = `float coastZ(float x){ float q = (abs(x) - ${PROM.toFixed(1)}) / ${PROM_W.toFixed(1)}; return -15. - ${PROM_L.toFixed(1)}*exp(-q*q); }`;

export function heightAt(x, z) {
  const d = z - coastZ(x);                                    // + inland, - offshore
  let h = d > 0 ? d * .035 : Math.max(d * .03, -14);          // gentle beach, shelving seabed
  h += sm(35, 140, d) * 7 * fbm2(x * .018, z * .018, 3);      // dunes behind the beach
  const head = Math.exp(-(((Math.abs(x) - PROM) / (PROM_W * 1.15)) ** 2));
  h += head * sm(-35, 70, d) * (35 + 170 * Math.pow(ridged2(x * .0014 + 3, z * .0014 + 1, 5), 2));   // rocky promontories, cliffs at the water
  h += sm(250, 900, d) * 120 * fbm2(x * .0015 + 7, z * .0015, 4);                                     // hills far inland
  return h;
}

export const sandMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97, metalness: 0 });
export const SEA = { mat: null };
export const STAND = new V3(0, 0, coastZ(0) + 18);              // where the viewer stands
STAND.y = heightAt(STAND.x, STAND.z);

function terrain() {
  const C = { sand: [.2, .16, .11], wet: [.08, .065, .05], dune: [.07, .075, .035], rock: [.07, .065, .06] };
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const g = heightfield({ heightAt, colorAt(x, y, z, slope) {
    const d = z - coastZ(x), nz = fbm2(x * .05, z * .05, 3);
    let c = mix(C.wet, C.sand, sm(0, 6, d));
    c = mix(c, C.dune, sm(30, 90, d) * (.5 + .5 * nz));
    return mix(c, C.rock, clamp(sm(.15, .35, slope) + sm(8, 30, y) * .8));
  }, surfAt(x, y, z, slope) {        // wet sand -> dry sand -> dune grass -> granite promontories
    const d = z - coastZ(x), L = (a, b, k) => mixSurf([[a, 1 - k], [b, k]]);
    let s = L(PRESET.wetSand, PRESET.sand, sm(0, 6, d));
    s = L(s, PRESET.meadow, sm(30, 90, d) * .7);
    return L(s, PRESET.rock, clamp(sm(.15, .35, slope) + sm(8, 30, y) * .8));
  }, meanRadius: 250 });
  S.scene.add(spectral(new THREE.Mesh(g, sandMat), 'attr', { lines: 'grid', cell: 6, mean: g.userData.surfMean, weight: 1 }));
}

function sea() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...surfaceUniforms(PRESET.water), uTime: S.TIME, uHor: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uDeep: { value: new THREE.Color(.004, .008, .014) },
      uSunDir: { value: new V3() }, uSunI: { value: 0 }, uMoonDir: { value: new V3() }, uMoonI: { value: 0 }, uBio: { value: 0 } },
    vertexShader: SURF_VERT_DECL + `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vSurfW = w.xyz; vSurfN = vec3(0., 1., 0.); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: SURF_FRAG_DECL + coastGLSL + `
    varying vec3 vW; uniform float uTime, uSunI, uMoonI, uBio; uniform vec3 uHor, uSky, uDeep, uSunDir, uMoonDir;
    vec2 wave(vec2 p, vec2 k, float w, float a){ float ph = dot(k,p) + w*uTime; return a*k*cos(ph); }   // gradient of a*sin
    void main(){
      vec3 toP = vW - cameraPosition; float dist = length(toP); vec3 V = toP/dist;
      float fd = 1. - smoothstep(150., 2500., dist), fd2 = 1. - smoothstep(30., 400., dist);
      vec2 p = vW.xz, g = vec2(0.);
      g += wave(p, vec2(.06,.10), .9, .9) + wave(p, vec2(-.09,.07), 1.1, .7) + wave(p, vec2(.13,-.05), 1.3, .5);
      g *= fd;
      g += fd2*(wave(p, vec2(.55,.8), 2.6, .09) + wave(p, vec2(-.9,.45), 3.1, .07) + wave(p, vec2(.3,-1.1), 3.4, .05)
             + .06*vec2(n2(p*1.3+uTime*.6)-.5, n2(p*1.3-uTime*.5+7.)-.5));
      vec3 N = normalize(vec3(-g.x, 1., -g.y)), Rf = reflect(V, N);
      Rf.y = abs(Rf.y);
      float fres = .02 + .98*pow(1. - max(dot(-V, N), 0.), 5.);
      vec3 skyc = mix(uHor, uSky, smoothstep(0., .35, Rf.y));
      vec3 col = mix(uDeep, skyc, fres);
      float s = max(dot(Rf, uSunDir), 0.), m = max(dot(Rf, uMoonDir), 0.);
      col += vec3(1., .5, .28)*uSunI*(pow(s, 900.)*14. + pow(s, 60.)*.35);              // sun glitter path
      col += vec3(.75,.82,1.)*uMoonI*(pow(m, 1200.)*6. + pow(m, 90.)*.12);              // moon glitter path
      // surf: breaking lines rolling in toward the beach, and the wash at the edge
      float d = coastZ(vW.x) - vW.z;                                                    // metres offshore
      float roll = smoothstep(.75, 1., sin(d*.32 + uTime*1.4 + n2(vec2(vW.x*.05, 0.))*3.))*(1. - smoothstep(4., 38., d));
      float wash = 1. - smoothstep(0., 3.5, d), crest = roll*(.5 + .5*n2(p*.8 + uTime*.3));
      float foam = clamp(crest + wash*.7, 0., 1.)*fd;
      col = mix(col, uSky*1.6 + uHor*.6, foam*.55);
      float bio = (crest*smoothstep(.45, .8, n2(p*.35 + uTime*.2)) + wash*.12*n2(p*2. + uTime))*fd;   // patchy, only where waves break
      col += vec3(.1,.55,1.)*uBio*bio*(.6 + .4*n2(p*3. + uTime*2.))*1.2;               // bioluminescent surf
      col = mix(col, uHor, 1. - exp(-pow(dist*.0001, 2.)));
      col += uOverlay*surfBands(vW, N, 1.);                                             // faint spectral layer (water: warm IR, cold microwave)
      gl_FragColor = vec4(col, 1.);
    }`,
  });
  SEA.mat = mat;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000, 1, 1), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = .05;
  S.scene.add(spectral(m, 'water', { custom: true, lines: 'grid', cell: 40, weight: 1.6 }));
}

function rocks() {   // boulders at the foot of the promontories and a few on the beach
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new V3().fromBufferAttribute(p, i); v.multiplyScalar(.75 + .5 * noise2(v.x * 2 + 5, v.y * 2 + v.z * 3)); v.y *= .7; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const M = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    let x, z, s;
    if (i < 40) { x = (R() - .5) * 160; z = coastZ(x) + 2 + R() * 30; s = .2 + R() ** 2 * .9; }
    else { const side = R() < .5 ? -1 : 1; x = side * (PROM + (R() - .5) * PROM_W * 1.6); z = coastZ(x) + (R() - .7) * 40; s = 1 + R() * 5; }
    tmp.position.set(x, heightAt(x, z) - s * .2, z); tmp.rotation.set(R() * .5, R() * 6.28, R() * .5); tmp.scale.set(s * (.8 + R() * .5), s, s * (.8 + R() * .5)); tmp.updateMatrix(); M.push(tmp.matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(.08, .075, .07), roughness: .9, flatShading: true }), M.length);
  M.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color().setScalar(.7 + R() * .6)); });
  S.scene.add(spectral(mesh, 'rock', { weight: .3 }));
}

export function build() {
  terrain(); sea(); rocks();
  return {
    groundAt: (x, z) => Math.max(0, heightAt(x, z)),
    walk(t, camera) {   // standing still; a slow breathing sway
      camera.position.set(STAND.x + Math.sin(t * .7) * .04, STAND.y + 1.7 + Math.sin(t * 2.1) * .015, STAND.z);
    },
    update(t) {
      const u = SEA.mat.uniforms, el = sunEl();
      u.uHor.value.setRGB(...kf(HOR, t)[0]);
      const sk = kf(HEMI, t)[0]; u.uSky.value.setRGB(sk[0] * .7, sk[1] * .7, sk[2] * .8);
      u.uSunDir.value.copy(dirAE(SUN_AZ, Math.max(el, -1))); u.uSunI.value = sm(-1.2, 2, el);
      u.uMoonDir.value.copy(moonDir()); u.uMoonI.value = moonlit() * sm(-1, 3, moonDir().y * 57.3);
    },
  };
}
