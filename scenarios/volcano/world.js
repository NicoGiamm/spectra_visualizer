// Volcano at dusk: you stand on a ridge ~300 m up; west (-z) across a valley a cinder cone holds a lava lake in a
// crater breached toward you, and behind it the main edifice rises to ~1000 m. Lava has run down the cone's flank into
// the valley; a gas plume rises from the crater and drifts south (left) on the wind.
import * as THREE from 'three';
import { V3, clamp, lerp, sm, R, fbm2, ridged2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { spectral, PRESET, mixSurf } from 'spectra/render/surface.js';
import { heightfield } from 'spectra/world/heightfield.js';

// ---------------------------------------------------------------- terrain
export const CRATER = { x: 60, z: -1500, rim: 220, lake: 140 };   // lake ~280 m across (Halema'uma'u 2008–18 lake: ~250 m)
const MTN = [-250, -3900];
const coneH = d => d < 760 ? 270 * (1 - d / 760) ** 1.4 : 0;
const RIM_H = coneH(CRATER.rim), LAKE_REL = RIM_H - 55;
function base(x, z) {
  let h = 6 * fbm2(x * .01, z * .01, 4) + 30 * fbm2(x * .002 + 5, z * .002, 3);
  h += 300 * Math.exp(-(((z - 20) / 260) ** 2)) * (.9 + .2 * fbm2(x * .003, 7, 2));   // the N–S ridge you stand on
  h -= 290 * sm(120, 1000, -z);                                                         // the valley
  const dm = Math.hypot(x - MTN[0], z - MTN[1]);
  h += 1300 * Math.exp(-((dm / 1700) ** 1.5)) * (.8 + .4 * ridged2(x * .0012, z * .0012, 4));
  return h;
}
export const LAKE_Y = base(CRATER.x, CRATER.z) + LAKE_REL;
export function heightAt(x, z) {
  const h = base(x, z), dx = x - CRATER.x, dz = z - CRATER.z, d = Math.hypot(dx, dz);
  if (d > 760) return h;
  const toYou = sm(.55, .92, dz / (d + 1e-3));                    // the breach faces the ridge (+z)
  if (d < CRATER.rim) {
    const rim = lerp(RIM_H, LAKE_REL + 3, toYou);
    return LAKE_Y - LAKE_REL + lerp(LAKE_REL - 12, rim, sm(CRATER.lake - 10, CRATER.rim, d)) + (h - base(CRATER.x, CRATER.z)) * .2;
  }
  const notch = Math.min(coneH(d), LAKE_REL + 3 - (d - CRATER.rim) * .3);
  return h + lerp(coneH(d), Math.max(0, notch), toYou);
}
const slopeAt = (x, z) => { const e = 3; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); };

// Local surface presets ({A,B,C} as engine/render/surface.js: A = [T0, Teq, 1/tau, eIR], B = [eMW, uvAlb, gamma, rRadio],
// C = [gloss, Tradio, Tmicro, Tgamma]); source keys from the header of surface.js.
//   basalt: old lava and the ridge rock. eIR .95 — basalt 0.92–0.96 in 8–14 µm [Sal]; eMW .88 like rock [UMF]; uvAlb .05 —
//     STAND-IN (dark basalt, below granite's .12); gamma .2 of granite — basalt carries ~0.5–1 ppm U, 2–4 ppm Th, ~1 % K
//     against granite's ~4 / 15 / 3.5 [UN]; T0/Teq/tau STAND-IN (rock's, [Oke] order: slow to cool)
//   scoria: loose cinder of the cone, porous, cools faster than solid rock (low admittance, STAND-IN); same emissivities
//   ashSoil: the ridge's thin soil on old ash with dry grass. eIR .95 [EL]; eMW .9 dry soil [UMF]; uvAlb .05 [FG]; gamma .25 [UN]
//   warmFlow: last weeks' flows on the valley floor, still 10–20 °C warmer than the ground (STAND-IN: thick flows take months to
//     cool; Harris 2013, "Thermal Remote Sensing of Active Volcanoes", ch. 4); emissivities as basalt
const surf = (T0, Teq, tau, eIR, eMW, uvAlb, gamma, rRadio) => ({ A: [T0, Teq, tau ? 1 / tau : 0, eIR], B: [eMW, uvAlb, gamma, rRadio], C: [0, ...PRESET.rock.C.slice(1)] });
export const SURF = {
  basalt:   surf(30, 12, 40, .95, .88, .05, .2, .5),
  scoria:   surf(32, 9, 18, .95, .88, .05, .2, .4),
  ashSoil:  surf(24, 8, 12, .95, .9, .05, .25, .3),
  warmFlow: surf(34, 26, 0, .95, .88, .05, .2, .5),
};
// the valley floor where last weeks' flows lie (a band below the cone's foot)
const onOldFlow = (x, z) => sm(.62, .7, fbm2(x * .004 + 2, z * .004, 3)) * sm(-650, -900, z) * (1 - sm(-1200, -1400, z));

export const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
function terrain() {
  const C = { soil: [.07, .06, .045], grass: [.09, .08, .04], basalt: [.035, .032, .03], scoria: [.11, .05, .035], flow: [.018, .017, .017] };
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const coneK = (x, z) => 1 - sm(500, 780, Math.hypot(x - CRATER.x, z - CRATER.z));
  const g = heightfield({ heightAt, colorAt(x, y, z, slope) {
    const nz = fbm2(x * .03, z * .03, 3);
    let c = mix(C.soil, C.grass, sm(.4, .7, nz) * (1 - sm(-200, -500, z)));
    c = mix(c, C.basalt, clamp(sm(.25, .5, slope) + sm(-300, -700, z) * .7));
    c = mix(c, C.scoria, coneK(x, z) * .9);
    return mix(c, C.flow, onOldFlow(x, z));
  }, surfAt(x, y, z, slope) {
    const L = (a, b, k) => mixSurf([[a, 1 - k], [b, k]]);
    let s = L(SURF.ashSoil, SURF.basalt, clamp(sm(.25, .5, slope) + sm(-300, -700, z) * .7));
    s = L(s, SURF.scoria, coneK(x, z) * .9);
    return L(s, SURF.warmFlow, onOldFlow(x, z));
  } });
  S.scene.add(spectral(new THREE.Mesh(g, terrainMat), 'attr', { lines: 'topo', mean: g.userData.surfMean, weight: 1.2 }));
}

// Scattered blocks on the ridge (instanced, seeded R)
function rocks() {
  const g = new THREE.IcosahedronGeometry(1, 0), M = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    const x = (R() - .5) * 160, z = -20 - R() * 160, s = .2 + R() ** 2 * 1.4;
    tmp.position.set(x, heightAt(x, z) - s * .2, z); tmp.rotation.set(R(), R() * 6.28, R()); tmp.scale.set(s, s * .7, s * (.8 + R() * .4)); tmp.updateMatrix(); M.push(tmp.matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(.05, .045, .04), roughness: .95, flatShading: true }), M.length);
  M.forEach((m, i) => mesh.setMatrixAt(i, m));
  S.scene.add(spectral(mesh, SURF.basalt, { weight: .2 }));
}

// Lava follows the steepest descent: a path of points from (x, z) downhill, a little jitter from R so flows braid.
export function downhill(x, z, n = 90, step = 9) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const y = heightAt(x, z); pts.push(new V3(x, y + .6, z));
    const e = 2, gx = heightAt(x + e, z) - heightAt(x - e, z), gz = heightAt(x, z + e) - heightAt(x, z - e), gl = Math.hypot(gx, gz);
    if (gl < .02 && i > 6) break;                                   // flat: the flow spreads and stops
    const j = (R() - .5) * .5, dx = -gx / (gl || 1), dz = -gz / (gl || 1);
    x += (dx * Math.cos(j) - dz * Math.sin(j)) * step; z += (dz * Math.cos(j) + dx * Math.sin(j)) * step;
  }
  return pts;
}
export const SPOTS = {};

export function build() {
  terrain(); rocks();
  SPOTS.breach = new V3(CRATER.x, LAKE_Y + 3, CRATER.z + CRATER.rim);
  SPOTS.fumarole = new V3(-40, heightAt(-40, -108), -108);   // on the crest's flank to your left (look left)
  SPOTS.station = new V3(16, heightAt(16, -104), -104);
  return {
    groundAt: heightAt,
    walk(t, camera) {   // a few slow steps along the crest toward the overlook
      const z = -84 - t * .12, x = 0;
      camera.position.set(x, heightAt(x, z) + 1.7, z);
    },
  };
}
export { slopeAt };
