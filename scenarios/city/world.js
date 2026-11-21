// A city avenue running west (-z). You walk the north sidewalk out of the street canyon to the
// edge of a large park, where the sky opens up over a distant skyline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, clamp, lerp, sm, R, noise2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { solid, visOnly, gridMat } from 'spectra/render/instrument.js';
import { COMMON } from 'spectra/render/shaders.js';
import { softTex } from 'spectra/render/textures.js';

export const ROAD = 8, WALK = 4.5;                 // half-width of the carriageway, sidewalk width
export const PARK_Z = -15;                         // the canyon ends here; park to the west
export const SIDEWALK_X = ROAD + WALK * .55;       // where the viewer walks (north side, +x)
export const LAMPS = [];                           // street-lamp heads, for the street-light event
export const ROOFS = [];                           // { p: roof centre, h } of street-front buildings
export const WINDOWS = [];                         // a few window positions near the street (Wi-Fi)

// shared window uniforms: fraction of windows lit (vis), heat leak (IR instrument view)
export const BUILD = { lit: { value: 0 }, heat: { value: 0 } };

const WIN_GLSL = `
// window mask on vertical faces; aa -> 1 where windows shrink under a few pixels (use the average instead)
float winMask(vec3 wp, vec3 n, vec3 seed, out vec2 cell, out float aa){
  vec3 an = abs(n); aa = 0.; if(an.y > .5 || wp.y < 3.2){ cell = vec2(0.); return 0.; }
  vec2 f = an.x > .5 ? vec2(wp.z, wp.y) : vec2(wp.x, wp.y);
  vec2 q = f/vec2(2.7, 3.4); cell = floor(q) + mod(floor(seed.xz), 97.); vec2 fr = fract(q), fw = fwidth(q);
  aa = smoothstep(.1, .35, max(fw.x, fw.y));
  return step(.2,fr.x)*step(fr.x,.8)*step(.22,fr.y)*step(fr.y,.78);
}
`;

function buildingMaterials() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, metalness: .05 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uLit = BUILD.lit;
    sh.vertexShader = 'varying vec3 vWp; varying vec3 vOn; flat varying vec3 vSeed;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vOn = normal; vSeed = vec3(0.); vWp = (modelMatrix * vec4(transformed,1.)).xyz;
      #ifdef USE_INSTANCING
        vWp = (modelMatrix * instanceMatrix * vec4(transformed,1.)).xyz; vSeed = (instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
      #endif`);
    sh.fragmentShader = 'varying vec3 vWp; varying vec3 vOn; flat varying vec3 vSeed; uniform float uLit;\n' + COMMON + WIN_GLSL +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec2 cell; float aa; float w = winMask(vWp, vOn, vSeed, cell, aa); float h = h21(cell);
        vec3 wc = mix(vec3(1.,.66,.32), vec3(.7,.82,1.), step(.72, h21(cell*1.31 + 3.)))*(.8 + .6*h21(cell*2.7));
        float face = step(abs(vOn.y), .5)*step(3.2, vWp.y);
        totalEmissiveRadiance += mix(w*step(h, uLit)*wc, face*.12*uLit*vec3(.92,.7,.5), aa); }`);
  };
  // instrument view: dark blocks whose windows leak heat when IR is on
  const instr = new THREE.ShaderMaterial({
    uniforms: { uHeat: BUILD.heat },
    vertexShader: `varying vec3 vWp; varying vec3 vOn; flat varying vec3 vSeed; void main(){ vOn = normal; vSeed = vec3(0.); vec4 w = modelMatrix*vec4(position,1.);
      #ifdef USE_INSTANCING
        w = modelMatrix*instanceMatrix*vec4(position,1.); vSeed = (instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
      #endif
      vWp = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vWp; varying vec3 vOn; flat varying vec3 vSeed; uniform float uHeat;\n` + COMMON + WIN_GLSL + `
      void main(){ vec2 cell; float aa; float w = winMask(vWp, vOn, vSeed, cell, aa); float dist = length(vWp - cameraPosition), fade = 1. - smoothstep(150., 3000., dist);
        float fl = 1. - smoothstep(0., fwidth(vWp.y/3.4)*1.5, min(fract(vWp.y/3.4), 1. - fract(vWp.y/3.4)));
        vec3 c = vec3(.006,.007,.014) + vec3(.12,.15,.34)*fl*fade*(1. - uHeat);
        float face = step(abs(vOn.y), .5)*step(3.2, vWp.y);
        vec3 win = mix(w*thermal(.42 + .3*h21(cell)), face*.36*thermal(.55), aa);
        c += uHeat*(thermal(.18 + .1*h21(vSeed.xz))*.22 + win*.55)*fade;
        gl_FragColor = vec4(c, 1.); }`,
  });
  return { mat, instr };
}

function ground() {
  const add = (w, d, x, z, color, y = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: .95 })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); S.scene.add(solid(m, GROUND_INSTR)); return m; };
  add(40000, 40000, 0, 0, 0x0d0e0f, -.02);                          // general ground
  add(ROAD * 2, 1800, 0, -100, 0x111214, .01);                      // the avenue runs on through the park
  [-1, 1].forEach(s => add(WALK, 1800, s * (ROAD + WALK / 2), -100, 0x2a2826, .03));   // sidewalks / park paths
  add(1200, 1000, 0, PARK_Z - 500, 0x0b1408, .0);                   // park lawn
  const dashes = [];                                                // centre line: one merged mesh
  for (let z = -900; z < 700; z += 9) { const g = new THREE.PlaneGeometry(.18, 3.2); g.rotateX(-Math.PI / 2); g.translate(0, .02, z); dashes.push(g); }
  S.scene.add(solid(new THREE.Mesh(mergeGeometries(dashes), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: .95 })), GROUND_INSTR));
}

function buildings(mat, instr) {
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const M = [], C = [], tmp = new THREE.Object3D(), col = new THREE.Color();
  const put = (x, z, w, d, h, tone) => { tmp.position.set(x, 0, z); tmp.rotation.set(0, 0, 0); tmp.scale.set(w, h, d); tmp.updateMatrix(); M.push(tmp.matrix.clone()); C.push(col.setHSL(.08 + R() * .06, .12, tone).clone()); };
  // street-front blocks on both sides of the avenue, getting taller away from the park
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
    let z = PARK_Z;
    while (z < 700) {
      const w = 14 + R() * 18, d = 14 + R() * 14, h = (row ? 22 : 12) + R() * (row ? 50 : 26) + sm(0, 400, z) * 30, gap = R() < .15 ? 6 + R() * 6 : 1.5;
      const x = side * (ROAD + WALK + d / 2 + row * 34 + 1), cz = z + w / 2;
      put(x, cz, d, w, h, .1 + R() * .08);
      if (!row) { ROOFS.push({ p: new V3(x, h, cz), h, side }); if (Math.abs(cz) < 140 && R() < .5) WINDOWS.push(new V3(x - side * (d / 2 + .05), 4.5 + Math.floor(R() * (h - 6) / 3.4) * 3.4, cz + (R() - .5) * w * .6)); }
      z += w + gap;
    }
  }
  // distant skyline beyond the park (only the western half is ever seen)
  for (let i = 0; i < 260; i++) {
    const az = (196 + R() * 148) * Math.PI / 180, r = 1100 + R() ** .7 * 2600, x = Math.cos(az) * r, z = Math.sin(az) * r + PARK_Z;
    const tall = R() < .12, h = tall ? 90 + R() * 160 : 20 + R() * 55, w = tall ? 25 + R() * 25 : 30 + R() * 60;
    put(x, z, w, w * (.6 + R() * .8), h, .07 + R() * .06);
  }
  const mesh = new THREE.InstancedMesh(box, mat, M.length);
  M.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, C[i]); });
  S.scene.add(solid(mesh, instr));
}

function lamps() {
  const pole = new THREE.CylinderGeometry(.08, .12, 7, 6); pole.translate(0, 3.5, 0);
  const arm = new THREE.BoxGeometry(1.6, .1, .1); arm.translate(-.8, 7, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: .6, metalness: .4 });
  const poolMat = new THREE.MeshBasicMaterial({ map: softTex(), color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const parts = [], pools = [], m = new THREE.Matrix4();          // all poles/arms and all light pools merged: two draw calls
  const place = (x, z, dir) => {
    m.makeRotationY(dir > 0 ? 0 : Math.PI).setPosition(x, 0, z);    // arm reaches over the road
    parts.push(pole.clone().applyMatrix4(m), arm.clone().applyMatrix4(m));
    const head = new V3(x - 1.5 * dir, 6.9, z);
    const pg = new THREE.PlaneGeometry(14, 14); pg.rotateX(-Math.PI / 2); pg.translate(head.x, .05, head.z); pools.push(pg);
    LAMPS.push({ p: head, k: R() });
  };
  for (let z = PARK_Z + 6; z < 420; z += 24) { place(ROAD + .6, z, 1); place(-ROAD - .6, z + 12, -1); }
  for (let z = PARK_Z - 18; z > PARK_Z - 700; z -= 30) { place(ROAD + .6, z, 1); place(-ROAD - .6, z - 15, -1); }   // on through the park
  S.scene.add(solid(new THREE.Mesh(mergeGeometries(parts), mat)));
  S.scene.add(visOnly(new THREE.Mesh(mergeGeometries(pools), poolMat)));
  LAMPS.poolMat = poolMat;
}

function parkTrees() {
  const crown = new THREE.IcosahedronGeometry(1, 1), cp = crown.attributes.position;
  for (let i = 0; i < cp.count; i++) { const v = new V3().fromBufferAttribute(cp, i); v.multiplyScalar(.8 + .35 * noise2(v.x * 2 + 3, v.y * 2 + v.z)); cp.setXYZ(i, v.x, v.y, v.z); }
  crown.computeVertexNormals();
  const trunk = new THREE.CylinderGeometry(.18, .26, 3, 5); trunk.translate(0, 1.5, 0);
  const cM = [], tM = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 900 && cM.length < 380; i++) {
    const x = (R() - .5) * 800, z = PARK_Z - 15 - R() * 900;
    if (Math.abs(x) < ROAD + WALK + 4) continue;                       // keep the avenue clear
    const s = 2.5 + R() * 3;
    tmp.position.set(x, 0, z); tmp.rotation.set(0, R() * 6.28, 0); tmp.scale.set(1, 1 + R() * .6, 1); tmp.updateMatrix(); tM.push(tmp.matrix.clone());
    tmp.position.set(x, 3 + s * .7, z); tmp.scale.set(s, s * (.8 + R() * .3), s); tmp.updateMatrix(); cM.push(tmp.matrix.clone());
  }
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0x0c1609, roughness: .9, flatShading: true }), cM.length);
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x140e0a, roughness: .9 }), tM.length);
  cM.forEach((m, i) => { crowns.setMatrixAt(i, m); crowns.setColorAt(i, new THREE.Color().setScalar(.7 + R() * .6)); }); tM.forEach((m, i) => trunks.setMatrixAt(i, m));
  S.scene.add(solid(crowns), solid(trunks));
}

export const GROUND_INSTR = gridMat(12);

export function build() {
  const { mat, instr } = buildingMaterials();
  ground(); buildings(mat, instr); lamps(); parkTrees();
  return {
    groundAt: () => 0,
    walk(t, camera) {   // 30 m -> -78 m: out of the street canyon (t < 25) and on into the park
      const z = 30 - t * 1.8, bob = Math.sin(t * 9.5) * .03;
      camera.position.set(SIDEWALK_X, 1.7 + bob, z);
    },
  };
}
