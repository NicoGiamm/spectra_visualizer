// A city avenue running west (-z). You walk the north sidewalk down the street canyon to the edge
// of a large park, where the sky opens up over a distant skyline, a broadcast hill and a power line.
// Every solid is a spectral surface (engine/render/surface.js): asphalt holds the day's heat,
// lawns cool fast, facades leak heat around their windows and the glass mirrors the cold sky in IR.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, sm, R, noise2, hash2, PLAY } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { solid, visOnly } from 'spectra/render/instrument.js';
import { spectral } from 'spectra/render/surface.js';
import { dirAE } from 'spectra/core/geom.js';
import { softTex } from 'spectra/render/textures.js';

export const ROAD = 8, WALK = 4.5;                 // half-width of the carriageway, sidewalk width
export const PARK_Z = -15;                         // the canyon ends here; park to the west
// walk: script time at which the viewer reaches the park edge, z there (the old script-time walk's value, so the park
// stretch is unchanged), and the real seconds it takes to get there (the canyon is walked at an even real pace)
const WALK_TC = 41.3, WALK_ZC = 80 - 2.3 * WALK_TC + .75 * (WALK_TC - 41), WALK_RC = PLAY.real(WALK_TC);
export const FACE_X = ROAD + WALK + 1;             // street-front facades stand at x = ±FACE_X
export const SIDEWALK_X = ROAD + WALK * .55;       // where the viewer walks (north side, +x)
export const TRAM_Z = PARK_Z - 7;                  // tram line on the cross street at the park edge
export const PARK_X = ROAD - .75;                  // parked cars along both kerbs
export const LAMPS = [];                           // { p: head, k: switch-on jitter, led }
export const ROOFS = [];                           // { p: roof centre, h, side } of street-front buildings
export const WINDOWS = [];                         // a few strong routers near the street (5G mast / multipath)
export const FLATS = [];                           // Wi-Fi access points: { p, k: lit threshold, g5: 5 GHz?, r, ph, shop }
export const BOXES = [];                           // axis-aligned building boxes { min, max } for multipath rays
export const SIGNS = [];                           // shop signs { p, col, neon, w }
export const CAMS = [];                            // security cameras { p, n: outward normal }
export const PLUMES = [];                          // rooftop HVAC exhausts
export const MANHOLES = [];                        // steaming manholes
export const PARKED = [];                          // parked cars { p, dir, k }
export const BUS = {};                             // bus shelter: { p, screen }
export const FM = {};                              // broadcast hill: { top, base }
export const MAST = {};                            // 5G mast on a south roof near the park: { base, top, panels }
export const PYLONS = [];
export const KERBS = [];                           // granite kerb stretches near the walk: { x, z0, z1 } (gamma blips)
export const BAR = {};                             // rooftop bar on a low south-side roof: { p: roof edge centre, h, z0, z1 }                          // power-line tower tops (x positions along the line)
export const POWER_Z = PARK_Z - 650, PYLON_H = 38;

// shared window uniforms: fraction of windows lit, shop fronts lit (visible light)
export const BUILD = { lit: { value: 0 }, shop: { value: 0 } };

// Visible-light street lighting of the street surfaces (asphalt, sidewalks, kerbs, facades, parked cars). The
// scene's own lights are only the shared sky (hemi + moon), which leaves these dark surfaces black at night; real
// point lights would add a lighting loop to every material in the scene, so the nearest LAMP_N lamps are uploaded
// as uniforms by the streetLights event and lit here: 1/d², Lambert, full-cutoff optics (nothing above ~80° from
// nadir), most of the flux thrown to the street side (the facades behind the pole get ~30 %). Farther lamps keep the
// cheap merged light-pool mesh. uCityAmb is the diffuse fill of a lit city at night (sky glow off the low cloud deck,
// windows and signs across the street, later the moon), so walls never go black.
export const LAMP_N = 16, POOL_FADE = [62, 88];          // per-pixel lamps, then the pool mesh beyond 62–88 m
export const LIGHT = {
  uLampP: { value: Array.from({ length: LAMP_N }, () => new THREE.Vector4()) },   // xyz = lamp head
  uLampC: { value: Array.from({ length: LAMP_N }, () => new THREE.Vector4()) },   // rgb = colour × intensity, w > 0 = live
  uCityAmb: { value: new THREE.Color(0, 0, 0) },
};
const LAMP_GLSL = `
uniform vec4 uLampP[${LAMP_N}], uLampC[${LAMP_N}]; uniform vec3 uCityAmb;
vec3 streetLight(vec3 W, vec3 N){
  vec3 e = uCityAmb*(.55 + .45*max(N.y, 0.));
  for(int i = 0; i < ${LAMP_N}; i++){ if(uLampC[i].w <= 0.) continue;
    vec3 L = uLampP[i].xyz - W; float d2 = dot(L, L); L *= inversesqrt(max(d2, 1e-4));
    float house = smoothstep(4.5, 7., (W.x - uLampP[i].x)*sign(uLampP[i].x));   // past the sidewalk: house-side shield
    e += uLampC[i].rgb*max(dot(N, L), 0.)*smoothstep(.12, .45, L.y)*(1. - .7*house)/(d2 + 4.); }
  return e;
}
`;
// added after the standard lighting, before fog and tone mapping (diffuseColor = albedo incl. instance colour)
// soft knee l/(1+l): a pale car roof right under a lamp stays under the bloom threshold (.9) instead of flaring
const LIT = { extraDecl: LAMP_GLSL, visExtra: 'vec3 sl = diffuseColor.rgb*streetLight(W, N); gl_FragColor.rgb += sl/(1. + sl);', uniforms: LIGHT };

// local surface presets (same shape as PRESET): metal poles/rails/units, car paint, painted road marks.
// Source keys ([Sal], [EL], [UMF], [FG], [WHO], [UN], [RP112], [Oke]) are listed above PRESET in engine/render/surface.js;
// T0/Teq/tau and rRadio are scene stand-ins there too (only their order is physical).
// C.yzw = transmission [Tradio, Tmicro, Tgamma] for light from behind (spectral eye, M10/T6): ground [.05, 0, 0] as the
// engine's TRANS.ground; metal is a conductor — radio and microwave do not cross it (Faraday), gamma at 1.46 MeV does:
// thin steel (poles, rails, 2–3 mm, μ/ρ .052 cm²/g × 7.9 g/cm³) ≈ .9 → .8 for a tube; a car (two steel skins + seats) .7 STAND-IN
const P = (T0, Teq, tau, eIR, eMW, uvAlb, gamma, rRadio, gloss = 0, tr = [.05, 0, 0]) => ({ A: [T0, Teq, tau ? 1 / tau : 0, eIR], B: [eMW, uvAlb, gamma, rRadio], C: [gloss, ...tr] });
// thin bare/galvanised metal: cools fast (little heat capacity per area), mirrors radio. eIR .3 — weathered galvanised
// steel (new 0.05–0.1, weathered/oxidised 0.2–0.3) [EL], reads sky-cold; eMW .02 — a metal reflects (e ≈ 0) [UMF];
// uvAlb .1 — STAND-IN; gamma .05 (steel: negligible activity) [UN]
const METAL = P(22, 10, 8, .3, .02, .1, .05, .95, .7, [0, 0, .8]);
// car bodies: painted steel, glossy, recently driven ones still warm. eIR .9 — the paint layer is opaque at 8–14 µm
// [EL]; eMW .1 — at mm–cm wavelengths a ~0.1 mm paint layer is transparent and the steel underneath reflects [UMF]
// (STAND-IN slightly above bare metal for glass and tyres), so cars read microwave-cold; uvAlb .05 — STAND-IN; gamma .05 [UN]
export const PAINT = P(27, 12, 14, .9, .1, .05, .05, .9, .4, [0, 0, .7]);
// road paint on asphalt: thermally the asphalt under it (μ ~1200) [Oke]; eIR .92 [EL]; eMW .88 as asphalt [UMF];
// uvAlb .1 — white road paint is TiO2-pigmented and TiO2 (band gap ~3.0 eV) absorbs below ~410 nm, so it is only a
// little brighter than asphalt in UV, not 'white' (rutile's absorption edge — why TiO2 is a sunscreen UV blocker);
// gamma .3 as asphalt [RP112]
const MARK = P(34, 16, 30, .92, .88, .1, .3, .5);
// granite kerbstones: like the trail's rock (eIR .9 [Sal, EL], slow to cool, μ ~2200 [Oke]) and the most radioactive
// stone in the street (K-40, U and Th series; granite typically 2-3x the gamma dose rate of concrete or brick) [UN, RP112];
// eMW .88 [UMF]; uvAlb .12 — STAND-IN as the engine's rock
const GRANITE = P(31, 15, 40, .9, .88, .12, 1, .5);

// windows on vertical faces (> 3.2 m) and shop fronts at street level. The plane coordinate seeds the cells,
// so visible lit windows and IR heat leaks share one pattern without per-instance data.
const WIN_GLSL = `
uniform float uLit, uShop;
flat varying float vTcore;     // interior heat of this building (°C above the wall), per instance
// x = pane, y = frame/lintel ring, z = aa (-> 1 where windows shrink under a few pixels: use the average)
vec3 winParts(vec3 wp, vec3 n, out vec2 cell){
  vec3 an = abs(n); cell = vec2(0.); if(an.y > .5 || wp.y < 3.2) return vec3(0.);
  float pc = an.x > .5 ? wp.x : wp.z;
  vec2 f = an.x > .5 ? vec2(wp.z, wp.y) : vec2(wp.x, wp.y);
  vec2 q = f/vec2(2.7, 3.4), fr = fract(q), fw = fwidth(q);
  cell = floor(q) + vec2(mod(floor(pc*.7)*13., 97.), mod(floor(pc*.7)*7., 89.));
  float pane = step(.2,fr.x)*step(fr.x,.8)*step(.22,fr.y)*step(fr.y,.78);
  float ring = step(.12,fr.x)*step(fr.x,.88)*step(.14,fr.y)*step(fr.y,.86) - pane;
  return vec3(pane, ring, smoothstep(.1, .35, max(fw.x, fw.y)));
}
// position inside the window bay (0..1), same grid as winParts
vec2 winFr(vec3 wp, vec3 n){ vec2 f = abs(n.x) > .5 ? vec2(wp.z, wp.y) : vec2(wp.x, wp.y); return fract(f/vec2(2.7, 3.4)); }
// street-facing ground floor of the front blocks: shop windows
float shopFront(vec3 wp, vec3 n, out float sc){
  sc = floor(wp.z/6.) + step(0., wp.x)*131.;
  if(abs(wp.x) > ${(FACE_X + .5).toFixed(1)} || n.x*wp.x > -.5 || wp.y < .35 || wp.y > 2.9) return 0.;
  float fz = fract(wp.z/6.); return step(.08, fz)*step(fz, .92)*step(h21(vec2(sc, 3.)), .62);
}
`;

// visible: lit windows (emissive) on top of the standard lighting, shop fronts at street level
function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, metalness: .05 });
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec2 cell; vec3 wp = winParts(vSurfW, vSurfN, cell); float h = h21(cell);   // same cell seeds as the IR heat leaks
        // interior light per window: warm incandescent / warm-white LED / cool LED or a TV, some only a lamp at the
        // back (dim); peak linear values stay ~.4 so ACES keeps the hue and the bloom threshold (.9) is never reached
        float hk = h21(cell*1.31 + 3.), hb = h21(cell*2.7), hd = h21(cell*4.1 + 7.), hc = h21(cell*3.3 + 1.);
        vec3 wc = hk < .45 ? vec3(1.,.55,.22) : hk < .75 ? vec3(1.,.7,.42) : vec3(.6,.74,1.);
        wc *= (.17 + .2*hb)*(hd < .25 ? .3 : 1.);
        vec2 fr = winFr(vSurfW, vSurfN); float u = (fr.x - .2)/.6, v = (fr.y - .22)/.56;
        float cw = step(.4, hc)*(.12 + .3*hc);                          // curtains drawn in from both sides
        float curt = step(u, cw) + step(1. - cw, u);
        wc *= mix(.8 + .3*v, .3, curt)*mix(vec3(1.), vec3(1.,.7,.45), curt);   // brighter under the ceiling; fabric warms and dims
        float face = step(abs(vSurfN.y), .5)*step(3.2, vSurfW.y);
        totalEmissiveRadiance += mix(wp.x*step(h, uLit)*wc, face*.336*uLit*vec3(.9,.62,.38)*.2, wp.z);   // far: the pane-area average
        float sc, sf = shopFront(vSurfW, vSurfN, sc);
        // shop window: mullions every ~1.5 m, a dark stall riser at the bottom, brighter towards the ceiling lights;
        // warm / neutral / cool fittings, a few shops closed with only a night light on
        float mul = step(.07, fract(vSurfW.z/1.5 + .5)), rise = smoothstep(.75, .95, vSurfW.y), top = .65 + .35*smoothstep(1., 2.8, vSurfW.y);
        float hs = h21(vec2(sc, 9.)); vec3 scol = hs < .4 ? vec3(1.,.66,.36) : hs < .75 ? vec3(1.,.82,.62) : vec3(.68,.82,1.);
        totalEmissiveRadiance += sf*mul*rise*top*uShop*scol*(.07 + .11*h21(vec2(sc, 5.)))*(h21(vec2(sc, 11.)) < .2 ? .25 : 1.); }`);
  };
  return mat;
}
// instrument view, IR only. Each building has its own interior heat Tcore (per instance: heated flats, a closed
// office block, …). Glass is opaque at 8–14 µm, so panes show their own (slightly warmed) temperature mixed with
// the cold sky they mirror at grazing angles; the frames and lintels are thermal bridges that leak Tcore; the
// walls leak a little of it; roofs over heated top floors stay warm (the HVAC exhausts are their own event).
const WIN_IR = `
if(uSOnI > 0.){
  vec2 cell; vec3 wp = winParts(W, N, cell);
  float Tw = uSurfA.y + (uSurfA.x - uSurfA.y)*exp(-uSurfT*uSurfA.z), heat = h21(cell*.37 + 5.), Tc = vTcore;
  float cv = clamp(dot(normalize(cameraPosition - W), N), 0., 1.), eg = .84*(1. - .85*pow(1. - cv, 3.));
  float xw = clamp((uSurfA.w*Tw + (1. - uSurfA.w)*(-35.) + 4.)/44., 0., 1.);
  float xl = clamp((uSurfA.w*(Tw + .25*Tc) + (1. - uSurfA.w)*(-35.) + 4.)/44., 0., 1.);
  float xp = clamp((eg*(Tw + .4*Tc*(.6 + .8*heat)) + (1. - eg)*(-35.) + 4.)/44., 0., 1.);
  float xr = clamp((Tw + Tc*(.7 + .6*heat) + 2. + 4.)/44., 0., 1.);
  float xf = clamp((Tw + 3. + .6*Tc + 4.)/44., 0., 1.);
  vec3 cw = thermal(xw)*(.04 + .5*xw*xw), cl = thermal(xl)*(.04 + .5*xl*xl), cp = thermal(xp)*(.04 + .5*xp*xp), cr = thermal(xr)*(.04 + .5*xr*xr), cf = thermal(xf)*(.04 + .5*xf*xf);
  vec3 d = (cl - cw) + mix(wp.x*(cp - cl) + wp.y*(cr - cl), .3*(cr - cl), wp.z);
  d += step(.5, N.y)*step(2., W.y)*(cf - cl);
  c = max(c + uSOnI*d, 0.);
}`;
const TCORE_VS = { vertDecl: 'attribute float aTcore; flat varying float vTcore;\n', vertMain: 'vTcore = aTcore;' };

function ground() {
  const add = (w, d, x, z, color, y, preset, opts) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: .95 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); S.scene.add(spectral(m, preset, { lines: 'grid', cell: 12, ...LIT, ...opts })); return m;
  };
  add(40000, 40000, 0, 0, 0x0d0e0f, -.02, 'concrete', { weight: .25 });                 // general ground
  add(ROAD * 2, 1800, 0, -100, 0x26272a, .01, 'asphalt', { weight: .35 });              // the avenue runs on through the park (aged asphalt: dark grey)
  add(900, 8, 0, TRAM_Z, 0x26272a, .012, 'asphalt', { weight: .05 });                   // cross street with the tram line
  const walks = new THREE.Mesh(mergeGeometries([-1, 1].map(s => { const g = new THREE.PlaneGeometry(WALK, 1800); g.rotateX(-Math.PI / 2); g.translate(s * (ROAD + WALK / 2), .03, -100); return g; })),
    new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: .95 }));
  S.scene.add(spectral(walks, 'concrete', { lines: 'grid', cell: 3, weight: .2, ...LIT }));     // sidewalks / park paths: one draw
  add(1200, 1000, 0, PARK_Z - 500, 0x0b1408, 0, 'meadow', { weight: .45 });             // park lawn
  const marks = [];                                                                     // centre line + crossing: one merged mesh
  for (let z = -900; z < 700; z += 9) { const g = new THREE.PlaneGeometry(.18, 3.2); g.rotateX(-Math.PI / 2); g.translate(0, .02, z); marks.push(g); }
  for (let x = -ROAD + .5; x < ROAD; x += 1.2) { const g = new THREE.PlaneGeometry(.6, 3.5); g.rotateX(-Math.PI / 2); g.translate(x, .021, PARK_Z - 2); marks.push(g); }
  S.scene.add(spectral(new THREE.Mesh(mergeGeometries(marks), new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: .95 })), MARK, { lines: 'grid', cell: 12, weight: 0, ...LIT }));
  // granite kerbs along both sides of the avenue (one merged mesh)
  const kerbs = [-1, 1].map(s => { const g = new THREE.BoxGeometry(.3, .14, 1100); g.translate(s * (ROAD + .15), .07, -200); return g; });
  S.scene.add(spectral(new THREE.Mesh(mergeGeometries(kerbs), new THREE.MeshStandardMaterial({ color: 0x5a5856, roughness: .8 })), GRANITE, { weight: .03, ...LIT }));
  for (const s of [-1, 1]) KERBS.push({ x: s * (ROAD + .15), z0: -750, z1: 350 });
}

function buildings() {
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const M = [], C = [], tmp = new THREE.Object3D(), col = new THREE.Color(), front = [];
  const put = (x, z, w, d, h, tone) => { tmp.position.set(x, 0, z); tmp.rotation.set(0, 0, 0); tmp.scale.set(w, h, d); tmp.updateMatrix(); M.push(tmp.matrix.clone()); C.push(col.setHSL(.08 + R() * .06, .12, tone).clone()); };
  // street-front blocks on both sides of the avenue, getting taller away from the park
  for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
    let z = PARK_Z;
    while (z < 700) {
      const w = 14 + R() * 18, d = 14 + R() * 14, h = (row ? 22 : 12) + R() * (row ? 50 : 26) + sm(0, 400, z) * 30, gap = R() < .15 ? 6 + R() * 6 : 1.5;
      const x = side * (FACE_X + d / 2 + row * 34), cz = z + w / 2;
      put(x, cz, d, w, h, .1 + R() * .08);
      if (z < 450) BOXES.push({ min: new V3(x - d / 2, 0, z), max: new V3(x + d / 2, h, z + w) });
      if (!row) {
        ROOFS.push({ p: new V3(x, h, cz), h, side, z0: z, z1: z + w });
        front.push({ side, z0: z, z1: z + w, h, x });
        if (Math.abs(cz) < 140 && R() < .5) WINDOWS.push(new V3(x - side * (d / 2 + .05), 4.5 + Math.floor(R() * (h - 6) / 3.4) * 3.4, cz + (R() - .5) * w * .6));
      }
      z += w + gap;
    }
  }
  // distant skyline beyond the park (only the western half is ever seen)
  for (let i = 0; i < 260; i++) {
    const az = (196 + R() * 148) * Math.PI / 180, r = 1100 + R() ** .7 * 2600, x = Math.cos(az) * r, z = Math.sin(az) * r + PARK_Z;
    const tall = R() < .12, h = tall ? 90 + R() * 160 : 20 + R() * 55, w = tall ? 25 + R() * 25 : 30 + R() * 60;
    put(x, z, w, w * (.6 + R() * .8), h, .07 + R() * .06);
  }
  // Tcore per building (hash, not R: the seeded layout stays unchanged): most are heated flats (4–10 °C above the
  // wall at night), about one in five is an office block whose heating is set back after hours (0–2 °C)
  const tc = Float32Array.from({ length: M.length }, (_, i) => hash2(i, 77) < .2 ? 2 * hash2(i, 78) : 4 + 6 * hash2(i, 79));
  box.setAttribute('aTcore', new THREE.InstancedBufferAttribute(tc, 1));
  const mesh = new THREE.InstancedMesh(box, buildingMaterial(), M.length);
  M.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, C[i]); });
  S.scene.add(spectral(mesh, 'facade', { weight: .8, extraDecl: WIN_GLSL + LAMP_GLSL, visExtra: LIT.visExtra, instrExtra: WIN_IR, uniforms: { uLit: BUILD.lit, uShop: BUILD.shop, ...LIGHT }, ...TCORE_VS }));
  return front;
}

// Wi-Fi access points: ~60 % of the flats along the street (a flat = three window bays on one floor), plus shops
function accessPoints(front) {
  for (const b of front) {
    if (b.z1 > 260) continue;
    const fx = b.side * (FACE_X - .15);
    for (let fl = 1; fl * 3.4 + 3 < b.h; fl++) for (let z = b.z0 + 1; z + 7 < b.z1; z += 8.1) {
      if (R() > .6) continue;
      FLATS.push({ p: new V3(fx, fl * 3.4 + 1.6, z + 4 + (R() - .5) * 3), k: R(), g5: R() < .45, r: 1.2 + R() * 3.5, ph: R() * 6.28, shop: false });
    }
    for (let z = b.z0 + 3; z < b.z1 - 2; z += 6) if (R() < .45) FLATS.push({ p: new V3(fx, 2.3, z), k: R() * .3, g5: R() < .5, r: 2 + R() * 3, ph: R() * 6.28, shop: true });
  }
}

// emissive shop signs above the shop fronts, security cameras, rooftop units
function streetProps(front, metal) {
  const signG = [], tmp = new THREE.Color();
  const PAL = [['#ff2a4a', 1], ['#2a8bff', 1], ['#ff3cd2', 1], ['#3cff7a', 1], ['#ffffff', 0], ['#ffb03a', 0], ['#7af0ff', 0]];   // [colour, neon?]
  for (const b of front) {
    if (b.z1 > 230) continue;
    const nx = -b.side, fx = b.side * FACE_X;
    for (let z = b.z0 + 2; z < b.z1 - 3; z += 7 + R() * 6) {
      if (R() < .4) continue;
      const w = 2 + R() * 3, h = .7 + R() * .6, y = 3.7 + R() * .8, [c, neon] = PAL[Math.floor(R() * PAL.length)];
      const g = new THREE.BoxGeometry(.12, h, w); g.translate(fx + nx * .1, y, z + w / 2);
      tmp.set(c).multiplyScalar(neon ? 1.4 : 1.1);
      const cols = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < cols.length; i += 3) tmp.toArray(cols, i);
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); signG.push(g);
      SIGNS.push({ p: new V3(fx + nx * .4, y, z + w / 2), col: c, neon: !!neon, w, k: R() });
    }
    if (R() < .55 && b.z0 < 200) {   // a camera at the corner of the block, looking along the sidewalk
      const p = new V3(fx + nx * .35, 4.3, b.z0 + 1.2); CAMS.push({ p, n: new V3(nx, 0, 0) });
      const g = new THREE.BoxGeometry(.5, .22, .22); g.translate(p.x, p.y, p.z); metal.push(g);
    }
  }
  // bus shelter on the south sidewalk with an LED advertising screen
  BUS.p = new V3(-ROAD - 1.3, 0, 14);
  { const s = BUS.p, parts = [[.08, 2.5, 4, 0, 1.25, 0], [1.6, .08, 4.2, -.6, 2.5, 0], [.06, 2.4, .06, .7, 1.2, -2], [.06, 2.4, .06, .7, 1.2, 2]];
    for (const [w, h, d, x, y, z] of parts) { const g = new THREE.BoxGeometry(w, h, d); g.translate(s.x - x, y, s.z + z); metal.push(g); }
    const g = new THREE.BoxGeometry(.1, 1.7, 1.15); g.translate(s.x + .1, 1.35, s.z + 2.4);
    const cols = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < cols.length; i += 3) tmp.set('#bfe0ff').toArray(cols, i);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); signG.push(g);
    BUS.screen = new V3(s.x + .25, 1.35, s.z + 2.4);
    CAMS.push({ p: new V3(s.x + .5, 2.45, s.z - 1.9), n: new V3(1, 0, 0) }); }
  const signMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  // sign boxes: painted metal with a warm LED driver inside (spectral, so they read in every band, not as black voids)
  S.scene.add(spectral(new THREE.Mesh(mergeGeometries(signG), signMat), P(30, 24, 30, .9, .6, .05, .05, .9, .3), { weight: 0 }));
  SIGNS.mat = signMat;
  // rooftop HVAC units and their exhausts
  for (const r of ROOFS) {
    if (r.z0 > 300 || R() < .35) continue;
    const p = new V3(r.p.x + (R() - .5) * 6, r.h, r.z0 + 3 + R() * (r.z1 - r.z0 - 6));
    const g = new THREE.BoxGeometry(2.2, 1.3, 2.2); g.translate(p.x, p.y + .65, p.z); metal.push(g);
    PLUMES.push({ p: p.clone().setY(r.h + 1.4), k: R(), side: r.side });
  }
  // manholes on the carriageway
  for (const [x, z] of [[-3.1, 62], [2.8, 31], [-1.2, 6], [3.4, -40]]) {
    const g = new THREE.CircleGeometry(.4, 12); g.rotateX(-Math.PI / 2); g.translate(x, .03, z); metal.push(g); MANHOLES.push(new V3(x, .05, z));
  }
}

function lamps(metal) {
  const pole = new THREE.CylinderGeometry(.08, .12, 7, 6); pole.translate(0, 3.5, 0);
  const arm = new THREE.BoxGeometry(1.6, .1, .1); arm.translate(-.8, 7, 0);
  const poolMat = new THREE.MeshBasicMaterial({ map: softTex(), vertexColors: true, color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pools = [], m = new THREE.Matrix4();          // all poles/arms merged with the other metal, all light pools merged
  const place = (x, z, dir, ledP) => {
    m.makeRotationY(dir > 0 ? 0 : Math.PI).setPosition(x, 0, z);    // arm reaches over the road
    metal.push(pole.clone().applyMatrix4(m), arm.clone().applyMatrix4(m));
    const head = new V3(x - 1.5 * dir, 6.9, z), led = R() < ledP;
    const pg = new THREE.PlaneGeometry(14, 14); pg.rotateX(-Math.PI / 2); pg.translate(head.x, .05, head.z);
    const c = led ? [.62, .66, .72] : [.75, .4, .13], cols = new Float32Array(pg.attributes.position.count * 3);
    for (let i = 0; i < cols.length; i += 3) cols.set(c, i);
    pg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); pools.push(pg);
    LAMPS.push({ p: head, k: R(), led });
  };
  // the avenue was half re-lamped with LEDs; the park paths still have the old sodium lamps
  for (let z = PARK_Z + 6; z < 420; z += 24) { place(ROAD + .6, z, 1, .55); place(-ROAD - .6, z + 12, -1, .55); }
  for (let z = PARK_Z - 18; z > PARK_Z - 700; z -= 30) { place(ROAD + .6, z, 1, .15); place(-ROAD - .6, z - 15, -1, .15); }
  // far field only: within ~70 m the per-pixel streetLight() term (nearest LAMP_N lamps) lights the ground instead
  poolMat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vPoolW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPoolW = (modelMatrix*vec4(position, 1.)).xyz;');
    sh.fragmentShader = 'varying vec3 vPoolW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb *= smoothstep(${POOL_FADE[0].toFixed(1)}, ${POOL_FADE[1].toFixed(1)}, distance(vPoolW, cameraPosition));`);
  };
  S.scene.add(visOnly(new THREE.Mesh(mergeGeometries(pools), poolMat)));
  LAMPS.poolMat = poolMat;
}

// tram line: rails, poles and the overhead contact wire along the cross street
function tramLine(metal) {
  for (const dz of [-.72, .72]) { const g = new THREE.BoxGeometry(900, .06, .08); g.translate(0, .04, TRAM_Z + dz); metal.push(g); }
  const pts = [];
  for (let x = -440; x <= 440; x += 30) {
    if (Math.abs(x) < ROAD + 2) continue;
    for (const s of [-1, 1]) { const g = new THREE.CylinderGeometry(.09, .12, 7.2, 5); g.translate(x, 3.6, TRAM_Z + s * 4.6); metal.push(g); }
    pts.push(new V3(x, 6.8, TRAM_Z - 4.6), new V3(x, 6.8, TRAM_Z + 4.6));      // cross-span wires
  }
  pts.push(new V3(-440, 6, TRAM_Z), new V3(440, 6, TRAM_Z), new V3(-440, 6.5, TRAM_Z), new V3(440, 6.5, TRAM_Z));   // contact wire + messenger
  S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x15161a }))));
}

// broadcast hill to the north-west with an FM/DAB lattice mast, and a high-voltage line across the far park
function farStructures() {
  const base = dirAE(302, 0).multiplyScalar(2700).add(new V3(0, 0, PARK_Z));
  const hill = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2); hill.scale(520, 150, 430); hill.translate(base.x, -4, base.z);
  S.scene.add(spectral(new THREE.Mesh(hill, new THREE.MeshStandardMaterial({ color: 0x0a1007, roughness: .95 })), 'forest', { lines: 'grid', cell: 40, weight: .05 }));
  const H = 175, foot = base.clone().setY(140), pts = [];
  const leg = (k, y) => new V3(foot.x + Math.cos(k * 2.09) * (6 * (1 - y / H) + .8), foot.y + y, foot.z + Math.sin(k * 2.09) * (6 * (1 - y / H) + .8));
  for (let k = 0; k < 3; k++) pts.push(leg(k, 0), leg(k, H));
  for (let y = 0; y < H; y += 12) for (let k = 0; k < 3; k++) pts.push(leg(k, y), leg((k + 1) % 3, y + 12));
  // pylons: two-level lattice towers
  const pyl = [];
  for (let x = -700; x <= 700; x += 140) {
    PYLONS.push(x); const b = new V3(x, 0, POWER_Z), Hp = PYLON_H;
    for (const s of [-1, 1]) { pyl.push(b.clone().add(new V3(s * 4, 0, -3)), b.clone().add(new V3(s * .8, Hp, 0)), b.clone().add(new V3(s * 4, 0, 3)), b.clone().add(new V3(s * .8, Hp, 0))); }
    for (const [y, w] of [[Hp - 4, 7], [Hp - 10, 9]]) pyl.push(b.clone().add(new V3(0, y, -w)), b.clone().add(new V3(0, y, w)));
  }
  S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts.concat(pyl)), new THREE.LineBasicMaterial({ color: 0x0b0b10 }))));
  FM.top = foot.clone().setY(foot.y + H); FM.base = base;
}

// mobile mast: a lattice tripod on the tallest south-side roof just before the park
// rooftop bar: the lowest south-side roof the walk passes, so it can be seen from the north sidewalk
function bar() {
  const r = ROOFS.filter(q => q.side < 0 && q.p.z > PARK_Z + 12 && q.p.z < 45 && q !== MAST.roof).sort((a, b) => a.h - b.h)[0] || ROOFS[0];
  Object.assign(BAR, { p: new V3(-FACE_X - .6, r.h, (r.z0 + r.z1) / 2), h: r.h, z0: r.z0 + 1, z1: r.z1 - 1 });
}

function mast() {
  const cands = ROOFS.filter(r => r.side < 0 && r.p.z > PARK_Z + 8 && r.p.z < PARK_Z + 70);
  const r = cands.sort((a, b) => b.h - a.h)[0] || ROOFS[0], b = r.p, H = 12, pts = [];
  const leg = k => new V3(b.x + Math.cos(k * 2.09) * 1.4, b.y, b.z + Math.sin(k * 2.09) * 1.4), top = new V3(b.x, b.y + H, b.z);
  for (let k = 0; k < 3; k++) pts.push(leg(k), top);
  for (let s = 0; s < 5; s++) for (let k = 0; k < 3; k++) pts.push(leg(k).lerp(top, s / 5), leg((k + 1) % 3).lerp(top, (s + 1) / 5));
  S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0b0b10 }))));
  Object.assign(MAST, { roof: r, base: b, top, panels: [0, 1, 2].map(k => new V3(b.x + Math.cos(k * 2.09 + .5) * .9, b.y + H - 1.5, b.z + Math.sin(k * 2.09 + .5) * .9)) });
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
  S.scene.add(spectral(crowns, 'canopy', { weight: .3 }), spectral(trunks, 'wood', { weight: 0 }));
}

// parked cars along both kerbs of the canyon (one instanced draw, painted-metal surface)
function parkedCars() {
  const b = new THREE.BoxGeometry(1.75, .72, 4.3); b.translate(0, .6, 0);
  const c = new THREE.BoxGeometry(1.55, .58, 2.2); c.translate(0, 1.25, -.2);
  const M = [], C = [], tmp = new THREE.Object3D();
  for (const side of [-1, 1]) for (let z = PARK_Z + 8; z < 210; z += 5.6 + R() * 3) {
    if (R() < .3 || (side < 0 && Math.abs(z - BUS.p.z) < 9)) continue;
    const dir = side > 0 ? -1 : 1;
    tmp.position.set(side * PARK_X, 0, z); tmp.rotation.set(0, dir > 0 ? 0 : Math.PI, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); M.push(tmp.matrix.clone());
    C.push(new THREE.Color().setHSL(R(), .2 + R() * .3, .05 + R() * .14));
    PARKED.push({ p: new V3(side * PARK_X, 0, z), dir, k: R(), side });
  }
  const mesh = new THREE.InstancedMesh(mergeGeometries([b, c]), new THREE.MeshStandardMaterial({ roughness: .35, metalness: .6 }), M.length);
  M.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, C[i]); });
  S.scene.add(spectral(mesh, PAINT, { weight: .05, ...LIT }));
}

export function build() {
  const metal = [];
  ground(); const front = buildings(); accessPoints(front); lamps(metal); streetProps(front, metal); tramLine(metal); parkedCars();
  farStructures(); parkTrees(); mast(); bar();
  S.scene.add(spectral(new THREE.Mesh(mergeGeometries(metal.map(g => g.index ? g.toNonIndexed() : g).map(g => { g.deleteAttribute('uv'); return g; })),
    new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: .5, metalness: .5 })), METAL, { weight: .02 }));
  return {
    groundAt: () => 0,
    // 80 m -> -15 m down the street canyon at an even pace in *real* time (~1.15 m/s with PLAY's even pace; written
    // against PLAY.real so it stays even if the pacing ever changes again), reaching the park edge at t ~41.3; then
    // slower into the park (-45 m at t = 60)
    walk(t, camera) {
      const z = t < WALK_TC ? 80 + (WALK_ZC - 80) * PLAY.real(t) / WALK_RC : WALK_ZC - 1.55 * (t - WALK_TC);
      camera.position.set(SIDEWALK_X, 1.7 + Math.sin(PLAY.real(t) * 4.75) * .03, z);   // head bob at a steady step rate
    },
  };
}
