// Arctic snowfield near Tromsø (69.65° N): open snow sloping gently down to a frozen lake ahead (west), low ridges to
// the north (right), the Lyngen-like peaks far to the west where the Sun sets in the south-west, a red cabin on the
// lake's south shore. The viewer walks slowly toward the shore along a snowshoe track.
import * as THREE from 'three';
import { V3, lerp, sm, R, noise2, fbm2, ridged2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { spectral, mixSurf, collectSurfD } from 'spectra/render/surface.js';
import { heightfield } from 'spectra/world/heightfield.js';

// Lake: an ellipse ahead, its ice at ICE_Y.
export const LAKE = { x: 30, z: -270, rx: 150, rz: 190 };
const ICE_Y = -1.2;
const lakeK = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);   // < 1 inside
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = 1.4 * fbm2(x * .015, z * .015, 4) + 5 * fbm2(x * .003 + 3, z * .003, 3);   // wind-packed snow drifts
  const north = Math.max(0, x / (r + 1)), west = Math.max(0, -z / (r + 1));
  h += sm(250, 1100, x) * (60 + 130 * Math.pow(ridged2(x * .0011 + 2, z * .0011 + 5, 5), 1.6));      // low ridges to the north
  h += sm(1800, 6000, r) * (1 - .55 * north) * (180 + 900 * Math.pow(ridged2(x * .0004 + 7, z * .0004 + 1, 6), 2.4)) * (.35 + .65 * west);   // far peaks, highest west
  h += sm(300, 1200, r) * 25 * fbm2(x * .004 + 11, z * .004, 4);
  h += 14 * sm(-130, 40, z) * (1 - sm(150, 400, Math.abs(x + 10)));    // the viewer's low rise above the lake
  const k = lakeK(x, z);
  return lerp(ICE_Y, h, sm(.97, 1.25, k));                           // flat ice inside, a soft shore
}
const slopeAt = (x, z) => { const e = 2, hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e); return Math.hypot(hx, hz) / (2 * e); };

// Local surfaces, same shape and source keys as PRESET (engine/render/surface.js: P(T0, Teq, tau, eIR, eMW, uvAlb,
// gamma, rRadio, gloss, [Tradio, Tmicro, Tgamma])):
//   snow  a shallow early-season cover in an October cold spell: T0 −4 °C at sunset → Teq −12 °C (surface radiative
//         cooling under a clear sky; snow's low conductivity, k ≈ 0.1–0.3 W m⁻¹ K⁻¹ (Sturm et al. 1997, J. Glaciol. 43,
//         26), keeps the surface decoupled from the warmer ground) — temperatures STAND-IN, tau fast (μ 130 [Oke]); eIR
//         .99 [Hori]; eMW .8 — a thin, fine-grained cover scatters less than deep dry snow (.7 at 37 GHz [Mätzler]) and
//         lets the moist ground below show, STAND-IN; uvAlb .85 [WHO, Blumthaler & Ambach]; gamma .1 [UN]
//   ice   new, bare lake ice a few cm thick: conducts heat up from the 0 °C water (k_ice ≈ 2.2 W m⁻¹ K⁻¹ vs snow's
//         0.1–0.3, Sturm et al. 1997), so it stays warmer than the snow — T0 −1 → Teq −4 °C STAND-IN; eIR .97 [Hori,
//         ice]; eMW .7: the low-loss ice passes the microwaves to the water, and the two interfaces reflect R ≈ .08
//         (air–ice, ε' ≈ 3.15) and R ≈ .26 (ice–water) at 37 GHz [UMF], so e ≈ (1 − .08)(1 − .26) ≈ .7 — much warmer
//         than open water (.45 [Wilheit]), about like the snow; uvAlb .1 — STAND-IN (clear ice, like water < 0.1
//         [WHO]); gamma .05 (water shields the ground [UN]); rRadio .5 STAND-IN; glossy (mirrors the sky at grazing angles)
//   rock  frost-shattered schist on the ridges: as PRESET.rock [Sal, EL, UMF, UN], temperatures STAND-IN (−6 → −14 °C)
//   cabin the outside of a heated, insulated log cabin: only a few K above the snow (the heat leaks at the windows
//         and the stove pipe, drawn as sources) — T0 −1 → Teq −8 °C STAND-IN; wood's eIR .9, eMW .9, uvAlb .05
//         (PRESET.wood [EL, UMF]); gamma .1 STAND-IN; transmission TRANS.wood
//   birch leafless mountain birch: PRESET.canopy's emissivities and transmission [EL, MOD, UMF, UN; TRANS.canopy], at
//         air temperature (−10 → −18 °C STAND-IN) — not the summer canopy's 21 °C
// Reflection data D = [h (m), nirAlb, R0opt, slope (rad)] (M11/T2, as surface.js REFL; keys from its header):
//   snow  nirAlb .9 — fresh fine-grained snow at ~0.8 µm (Wiscombe & Warren 1980, J. Atmos. Sci. 37:2712); h .01, slope .1,
//         R0opt .02 (ice n 1.31) as REFL.snow
//   ice   nirAlb .03 — the diffuse part only (the Fresnel reflection is R0opt's, not counted twice): clear new ice
//         over dark water scatters little from its bubbles and cracks, and the near-IR it lets through is absorbed by
//         the ice and the water below. Thin-ice spectral albedos fall toward the open-water value beyond 0.7 µm
//         (Grenfell & Perovich 1984, J. Geophys. Res. 89:3573; Perovich 1996, CRREL Monograph 96-1) — the figure is
//         not read off those papers: STAND-IN; R0opt .02 (ice n 1.31); h .001, slope .03 (a smooth sheet) STAND-IN
//   rock  nirAlb .3 — schist / granite .25–.35 [EL]; h, slope as REFL.rock
//   cabin nirAlb .5 — red-painted weathered wood: iron-oxide red paint and wood are bright beyond 0.7 µm (wood .35–.5
//         [EL]) — STAND-IN; as REFL.wood otherwise
//   birch nirAlb .35 — a leafless crown: pale birch bark and twigs, no red edge — STAND-IN between REFL.canopy (.3) and
//         bark; a volume scatterer as REFL.canopy
const GROUND = [.05, 0, 0], CANOPY = [.9, .25, .95], WOOD = [.95, .6, .88];   // surface.js TRANS.ground / .canopy / .wood
const P = (T0, Teq, tau, eIR, eMW, uvAlb, gamma, rRadio, gloss = 0, tr = GROUND, D) => ({ A: [T0, Teq, tau ? 1 / tau : 0, eIR], B: [eMW, uvAlb, gamma, rRadio], C: [gloss, ...tr], D });
export const SURF = {
  snow: P(-4, -12, 8, .99, .8, .85, .1, .3, .2, GROUND, [.01, .9, .02, .1]),
  ice: P(-1, -4, 25, .97, .7, .1, .05, .5, 1, GROUND, [.001, .03, .02, .03]),
  cabin: P(-1, -8, 12, .9, .9, .05, .1, .3, 0, WOOD, [.003, .5, .04, .1]),
  rock: P(-6, -14, 40, .9, .88, .12, 1, .5, 0, GROUND, [.05, .3, .05, .35]),
  birch: P(-10, -18, 25, .97, .93, .03, .25, .3, 0, CANOPY, [1, .35, .04, 1]),
};

// aurora light on the landscape (set by the snowfield event): visible green on snow, near-UV in the UV band
export const SNOW_U = { uAurVis: { value: 0 }, uAurUV: { value: 0 } };
const SNOW_DECL = 'uniform float uAurVis, uAurUV;';

function terrain() {
  const surfAt = collectSurfD((x, y, z, slope) => {
    const k = sm(.5, .8, slope) * sm(40, 200, y), ice = 1 - sm(.97, 1.02, lakeK(x, z));
    return mixSurf([[SURF.snow, (1 - k) * (1 - ice)], [SURF.rock, k * (1 - ice)], [SURF.ice, ice]]);
  });
  const C = { snow: [.62, .66, .76], rock: [.07, .07, .075] };
  const g = heightfield({ heightAt, colorAt(x, y, z, slope) {
    const k = sm(.5, .8, slope) * sm(40, 200, y);
    return C.snow.map((v, i) => lerp(v * (.92 + .08 * noise2(x * .05, z * .05)), C.rock[i], k));
  }, surfAt });
  surfAt.attach(g);                  // per-vertex reflection data (aSurfD)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0 });
  S.scene.add(spectral(new THREE.Mesh(g, mat), 'attr', { lines: 'topo', mean: g.userData.surfMean, weight: 1.2,
    uniforms: SNOW_U, extraDecl: SNOW_DECL,
    // the aurora lights the snow: 557.7 nm green in visible light, its near-UV (N₂ 337 nm) in UV — both ∝ the UV albedo
    // proxy for "snow" (B.y = uvAlb: .85 snow, .1 ice, .12 rock)
    instrExtra: 'c += uSOnU*vec3(.62,.3,1.)*vSurfB.y*uAurUV*(.35 + .65*max(N.y, 0.))*1.3;',
    visExtra: 'gl_FragColor.rgb += uAurVis*vec3(.16, 1., .42)*vSurfB.y*(.2 + .8*max(N.y, 0.))*.12;' }));
}

// The frozen lake's visible surface: dark ice mirroring the sky (and the aurora: colour set by the lake event).
export const ICE = { mat: null };
function lake() {
  const g = new THREE.CircleGeometry(1, 96); g.rotateX(-Math.PI / 2); g.scale(LAKE.rx * 1.03, 1, LAKE.rz * 1.03);
  g.translate(LAKE.x, ICE_Y + .05, LAKE.z);
  ICE.mat = new THREE.MeshBasicMaterial({ color: 0x05070c, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  S.scene.add(spectral(new THREE.Mesh(g, ICE.mat), SURF.ice, { weight: .25 }));
  Object.assign(ICE.mat.userData.surfInstr, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
}

// Sparse mountain birch along the south shore and in the hollows (instanced; one draw call).
function birches() {
  const trunk = new THREE.CylinderGeometry(.05, .1, 3.2, 5); trunk.translate(0, 1.6, 0);
  const crown = new THREE.IcosahedronGeometry(1, 0); crown.scale(.9, 1.3, .9); crown.translate(0, 3.2, 0);
  const geos = [[trunk, [.32, .3, .28]], [crown, [.05, .04, .035]]].map(([gg, c]) => {
    if (gg.index) gg = gg.toNonIndexed(); const n = gg.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(c, i * 3);
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3)); gg.deleteAttribute('uv'); return gg;
  });
  const geo = new THREE.BufferGeometry();
  const pos = [], col = [];
  geos.forEach(gg => { pos.push(...gg.attributes.position.array); col.push(...gg.attributes.color.array); });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const M = [], tmp = new THREE.Object3D();
  for (let i = 0; i < 4000 && M.length < 420; i++) {
    const x = -700 + R() * 1200, z = -900 + R() * 1000, k = lakeK(x, z);
    if (k < 1.08 || Math.abs(x + 10) < 25 && z > -80 || fbm2(x * .01, z * .01, 3) < .5 || x > 260) continue;
    const y = heightAt(x, z); if (slopeAt(x, z) > .3) continue;
    tmp.position.set(x, y - .2, z); tmp.rotation.set((R() - .5) * .2, R() * 6.28, (R() - .5) * .2); tmp.scale.setScalar(.7 + R() * .8); tmp.updateMatrix(); M.push(tmp.matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), M.length);
  M.forEach((m, i) => mesh.setMatrixAt(i, m));
  S.scene.add(spectral(mesh, SURF.birch, { weight: .1 }));
}

export const SPOTS = {};
// the snowshoe track: x = −10, from z = 40 toward the shore
const walkZ = t => 40 - t * 1.1;
export function build() {
  terrain(); lake(); birches();
  SPOTS.snow = new V3(-25, heightAt(-25, -40), -40);
  return {
    groundAt: heightAt,
    walk(t, camera) {
      const z = walkZ(t), x = -10 + 1.5 * Math.sin(z * .03), bob = Math.sin(t * 7) * .02;
      camera.position.set(x, heightAt(x, z) + 1.7 + bob, z);
    },
  };
}
