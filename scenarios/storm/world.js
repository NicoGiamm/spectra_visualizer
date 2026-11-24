// Great Plains grassland: a gravel road and a 115 kV line run west, a barbed-wire fence on the right, a farmhouse
// with an antenna mast ahead-right, a NEXRAD radar dome on a tower to the south-west. A supercell comes in from the
// west at sunset, its rain front crossing the viewer at t ≈ 22 and its rear edge at t ≈ 44 (STORM below).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, clamp, lerp, sm, kf, R, noise2, fbm2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { spectral, spectralGroup, PRESET, mixSurf } from 'spectra/render/surface.js';
import { solid } from 'spectra/render/instrument.js';
import { ENV } from 'spectra/world/atmosphere.js';
import { heightfield } from 'spectra/world/heightfield.js';

// ---------------------------------------------------------------- the storm's track (time-compressed)
// 1 script unit = 3.4 min (engine/world/atmosphere.js, no site): the rain front advances 160 m per unit (~0.8 m/s,
// a real supercell moves ~10–15 m/s), and the rain area is drawn only ~3.5 km deep, ~10× smaller than a real one,
// so the passage keeps a realistic length: rain at the viewer t 22.5–44 ≈ 73 min.
export const STORM = {
  frontZ: t => -3600 + 160 * t,          // leading edge of the rain (z; west = −z), reaches the viewer at t ≈ 22.5
  rearZ: t => -3600 + 160 * t - 3500,    // trailing edge: the rain stops here at t ≈ 44
  coreX: -700,                           // the precipitation core passes a little to the south (left)
  CB: 1400,                              // cloud base height above the prairie (m)
  flash: 0,                              // brightest lightning flash this frame (set by the lightning event)
  hail: t => sm(25.2, 26.4, t) * (1 - sm(30, 46, t)),   // hail cover near the viewer: falls ~t 25–29, melts by ~46
};
export const rainHere = t => sm(0, 250, STORM.frontZ(t)) * (1 - sm(-400, 0, STORM.rearZ(t)));   // 0…1: rain falling on the viewer

export const ROAD_X = -14, LINE_X = -21, FENCE_X = 5;
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = 1.6 * fbm2(x * .004, z * .004, 4) + .4 * fbm2(x * .03, z * .03, 2);
  h += sm(300, 3000, r) * 28 * fbm2(x * .0007 + 4, z * .0007 + 9, 4);   // long low swells toward the horizon
  h -= (1 - sm(3, 6, Math.abs(x - ROAD_X))) * .25;                       // the road bed
  return h;
}

export const STORM_U = { uStorm: { value: new THREE.Vector4() } };
// Rain-cooled ground (cold pool) and hail cover on top of the shared surface model:
//  - surface cold pools under thunderstorm outflow are 5–10 K colder than the air ahead (Engerer, Stensrud &
//    Coniglio 2008, Mon. Wea. Rev. 136, 4839); wet ground follows the rain-cooled air (evaporation): −6 K here,
//    STAND-IN within that range;
//  - wet soil lowers the microwave emissivity (dielectric constant of water ~80): 0.92 → ~0.7 for saturated loam
//    (Schmugge 1983, IEEE Trans. Geosci. Remote Sens. GE-21, 321; Ulaby, Moore & Fung vol. III), the basis of
//    passive soil-moisture missions (SMAP: Entekhabi et al. 2010, Proc. IEEE 98, 704);
//  - hailstones on the ground sit at 0 °C until they melt.
const TERRAIN_DECL = `uniform vec4 uStorm;
vec3 irColS(float T, float e){ float Tr = e*T + (1. - e)*(-35.), x = clamp((Tr + 4.)/44., 0., 1.); return thermal(x)*(.04 + .5*x*x); }
vec3 mwColS(float Tk, float e){ float Tb = e*Tk + (1. - e)*50., x = clamp((Tb - 120.)/180., 0., 1.); return vec3(1., .6, .1)*x*x*.12; }
vec3 stormTerrain(vec3 W, vec3 N){
  vec3 col = vec3(0.);
  float wet = smoothstep(0., 250., uStorm.x - W.z), hail = uStorm.y*(1. - smoothstep(250., 650., length(W.xz - vec2(-60., -120.))));
  if(wet + hail < .002) return col;
  float T = vSurfA.y + (vSurfA.x - vSurfA.y)*exp(-uSurfT*vSurfA.z);
  if(uSOnI > 0.){ float T2 = mix(T - 6.*wet, 0., hail*.9); col += uSOnI*(irColS(T2, vSurfA.w) - irColS(T, vSurfA.w)); }
  if(uSOnM > 0.){ float e2 = mix(vSurfB.x, .7, wet); col += uSOnM*(1. - .85*uSOnI)*(mwColS(T + 273., e2) - mwColS(T + 273., vSurfB.x)); }
  return col;
}`;

const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
function terrain() {
  const C = { grass: [.06, .07, .022], dry: [.15, .12, .05], road: [.13, .11, .09] };
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const roadK = (x, z) => (1 - sm(2.2, 3.4, Math.abs(x - ROAD_X))) * (z < 300 ? 1 : 0);
  const g = heightfield({ heightAt, colorAt(x, y, z) {
    const n = fbm2(x * .01, z * .01, 3);
    return mix(mix(C.grass, C.dry, sm(.35, .65, n)), C.road, roadK(x, z));
  }, surfAt(x, y, z) {   // tallgrass prairie, gravel road
    const L = (a, b, k) => mixSurf([[a, 1 - k], [b, k]]);
    return L(L(PRESET.meadow, PRESET.dirt, .25 * sm(.35, .65, fbm2(x * .01, z * .01, 3))), PRESET.dirt, roadK(x, z));
  } });
  S.scene.add(spectral(new THREE.Mesh(g, terrainMat), 'attr', { lines: 'topo', mean: g.userData.surfMean, weight: 1.2,
    uniforms: STORM_U, extraDecl: TERRAIN_DECL, instrExtra: 'c += stormTerrain(W, N);', visExtra: 'gl_FragColor.rgb += uOverlay*stormTerrain(W, N);' }));
}

function grass() {   // instanced tallgrass blades, bending in the gusts (stronger once the gust front is through)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.02, 0, 0, .02, 0, 0, .012, .35, .01, -.012, .35, .01, 0, .75, .05], 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4]); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .9 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = S.TIME; sh.uniforms.uGust = GUST;
    sh.vertexShader = 'uniform float uTime, uGust;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wp = (instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
        float k = position.y*position.y*1.2, a = .25 + .9*uGust;
        transformed.z += k*a*(.6 + .4*sin(uTime*(1.4 + 2.*uGust) + wp.x*.3 + wp.z*.25));
        transformed.x += k*.15*sin(uTime*1.1 + wp.z*.3);
      #endif`);
  };
  const COUNT = 60000, mesh = new THREE.InstancedMesh(g, mat, COUNT), tmp = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const z = -160 + R() * 190, x = (R() - .5) * 2 * (2 + 70 * R() ** 1.5);
    if (Math.abs(x - ROAD_X) < 3.2) continue;
    tmp.position.set(x, heightAt(x, z) - .02, z); tmp.rotation.set((R() - .5) * .3, R() * 6.28, (R() - .5) * .3);
    tmp.scale.setScalar(.5 + R() * .9); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix);
    const dry = R(); mesh.setColorAt(i, c.setRGB(lerp(.08, .3, dry), lerp(.13, .22, dry), lerp(.03, .08, dry)));
  }
  S.scene.add(spectral(mesh, 'meadow', { weight: .4 }));
}
const GUST = { value: 0 };

// Wire lines (fence strands, conductors) share one LineSegments; posts / poles are merged meshes.
const sag = (a, b, s, n = 8) => { const p = []; for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n;
  for (const u of [u0, u1]) p.push(new V3(lerp(a.x, b.x, u), lerp(a.y, b.y, u) - s * 4 * u * (1 - u), lerp(a.z, b.z, u))); } return p; };
export const POLES = [];   // { base, top, ins: [V3 x3] } of the power line, nearest first
function fenceAndLine() {
  const wires = [], wood = [];
  // barbed-wire fence on the right: posts every 4 m
  for (let z = 30; z > -520; z -= 4) {
    const y = heightAt(FENCE_X, z), p = new THREE.CylinderGeometry(.05, .06, 1.4, 5); p.translate(FENCE_X, y + .7, z); wood.push(p);
    if (z > -516) for (const h of [.55, .9, 1.25]) wires.push(...sag(new V3(FENCE_X, y + h, z), new V3(FENCE_X, heightAt(FENCE_X, z - 4) + h, z - 4), .03, 2));
  }
  // 115 kV line on wooden H-frame-like single poles with a crossarm (three phases), spans of 90 m
  for (let z = 60, i = 0; z > -3200; z -= 90, i++) {
    const y = heightAt(LINE_X, z), H = 15, pole = new THREE.CylinderGeometry(.16, .22, H, 6); pole.translate(LINE_X, y + H / 2, z); wood.push(pole);
    const arm = new THREE.BoxGeometry(5.2, .22, .22); arm.translate(LINE_X, y + H - .9, z); wood.push(arm);
    POLES.push({ base: new V3(LINE_X, y, z), top: new V3(LINE_X, y + H, z), ins: [-2.3, 0, 2.3].map(dx => new V3(LINE_X + dx, y + H - (dx ? .9 : -.4), z)) });
  }
  for (let i = 0; i < POLES.length - 1; i++) for (let k = 0; k < 3; k++) wires.push(...sag(POLES[i].ins[k], POLES[i + 1].ins[k], 2.2));
  const wm = new THREE.LineBasicMaterial({ color: 0x0a0a0c });
  S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), wm)));
  S.scene.add(spectral(new THREE.Mesh(mergeGeometries(wood), new THREE.MeshStandardMaterial({ color: new THREE.Color(.07, .05, .035), roughness: .9 })), 'wood', { weight: .02 }));
}

export const SPOTS = {};
function farm() {   // farmhouse + a 24 m antenna mast (lattice) beside it
  const x = 95, z = -170, y = heightAt(x, z), G = new THREE.Group(); G.position.set(x, y, z);
  const wall = new THREE.MeshStandardMaterial({ color: new THREE.Color(.16, .14, .12), roughness: .9 }), roofM = new THREE.MeshStandardMaterial({ color: new THREE.Color(.05, .045, .045), roughness: .8 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 8), wall); box.position.y = 2.75; G.add(box);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.9, 4.9, 11.6, 3, 1), roofM); roof.rotation.z = Math.PI / 2; roof.position.y = 7.3; roof.scale.set(1, 1, 1.0); G.add(roof);
  const barn = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 10), wall); barn.position.set(26, 4, 14); G.add(barn);
  const winMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  [-3, 0, 3].forEach(dz => { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.2), winMat); w.position.set(-5.51 - .0, 2.6, dz * .8 + .5); w.rotation.y = -Math.PI / 2; G.add(w); });
  [-3, 2].forEach(dx => { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.2), winMat); w.position.set(dx, 2.6, 4.01); G.add(w); });
  S.scene.add(spectralGroup(G, m => (m === winMat ? 'facade' : 'wood'), { weight: .04 }));
  // lattice mast: three legs + zig-zag bracing, one LineSegments
  const mx = x + 9, mz = z - 8, my = heightAt(mx, mz), H = 24, pts = [], top = new V3(mx, my + H, mz);
  const leg = (k, f) => new V3(mx + Math.cos(k * 2.09) * .45 * (1 - .6 * f), my + H * f, mz + Math.sin(k * 2.09) * .45 * (1 - .6 * f));
  for (let k = 0; k < 3; k++) pts.push(leg(k, 0), leg(k, 1));
  for (let s = 0; s < 16; s++) for (let k = 0; k < 3; k++) pts.push(leg(k, s / 16), leg((k + 1) % 3, (s + 1) / 16));
  pts.push(top, top.clone().add(new V3(0, 2.2, 0)));   // lightning rod
  S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0b0b10 }))));
  Object.assign(SPOTS, { farm: new V3(x, y + 4, z), farmWin: winMat, farmWins: [new V3(x - 5.6, y + 2.6, z + .5), new V3(x - 5.6, y + 2.6, z - 1.9), new V3(x - 5.6, y + 2.6, z + 2.9)],
    farmRoof: new V3(x, y + 8, z), mastTip: top.clone().add(new V3(0, 2.2, 0)) });
}
function radar() {   // WSR-88D-style radome (~11.9 m across on a ~25 m tower), 2.2 km to the south-west
  const a = 235 * Math.PI / 180, x = Math.cos(a) * 2200, z = Math.sin(a) * 2200, y = heightAt(x, z), G = new THREE.Group(); G.position.set(x, y, z);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(.55, .55, .56), roughness: .6 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 25, 6), new THREE.MeshStandardMaterial({ color: new THREE.Color(.2, .2, .21), roughness: .8 })); tower.position.y = 12.5; G.add(tower);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5.95, 16, 10), m); dome.position.y = 30; G.add(dome);
  S.scene.add(spectralGroup(G, 'concrete', { weight: .01 }));
  SPOTS.radar = new V3(x, y + 30, z);
}

// cloud cover of the shared cloud layer (atmosphere.js uCover: lower = more cloud): a broken anvil at sunset, the
// full overcast under the storm, clearing from the west once the trailing rain has gone east
const COVER = [[0, [.36]], [10, [.2]], [17, [.04]], [44, [.08]], [51, [.5]], [60, [.72]]];
export function build() {
  terrain(); grass(); fenceAndLine(); farm(); radar();
  return {
    groundAt: heightAt,
    walk(t, camera) { camera.position.set(0, heightAt(0, 0) + 1.7, 0); },   // standing by the road (a storm chaser's spot)
    update(t) {
      const cover = kf(COVER, t)[0][0];
      ENV.cloudMat.uniforms.uCover.value = cover;
      ENV.nightMat.uniforms.uStars.value *= sm(.3, .6, cover);   // the cloud layer fades out toward the horizon: no stars through the overcast
      S.scene.fog.density = lerp(.0001, .00045, rainHere(t));             // rain cuts the visibility to ~2 km
      GUST.value = sm(-900, 0, STORM.frontZ(t)) * (1 - .6 * sm(30, 45, t));   // the gust front runs ~1 km ahead of the rain
      STORM_U.uStorm.value.set(STORM.frontZ(t), STORM.hail(t), 0, 0);
    },
  };
}
