// Events that belong to the mountain trail (sky events come from the engine library).
import * as THREE from 'three';
import { V3, DEG, lerp, sm, env, R, fbm2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { deg, skyP, dirAE, FOV_SKY } from 'spectra/core/geom.js';
import { Em, Rib, EmField, BEAM, toViewer } from 'spectra/render/sources.js';
import { solid, visOnly } from 'spectra/render/instrument.js';
import { spectralGroup, spectralParts, partsGeometry, addTx, SURF_U } from 'spectra/render/surface.js';
import { COMMON } from 'spectra/render/shaders.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { softTex } from 'spectra/render/textures.js';
import { trailX, heightAt, NEAR_ROCKS, TRAIL_U, STREAM, SPOTS } from './world.js';
import { moonlit } from 'spectra/world/atmosphere.js';

const warmF = () => 1 - sm(0, 45, S.t);
const CAMP_Z = -118, campPos = () => { const x = trailX(CAMP_Z) - 1.8; return new V3(x, heightAt(x, CAMP_Z), CAMP_Z); };

export const alpenglow = () => event({ name: 'Alpenglow', t0: 4, t1: 16, bands: ['vis'], freq: ['sunlight'], note: 'The high snow faces of the side peaks (look left) still catch the grazing sunlight after the valley is in shade and turn pink; the glow climbs off the summits as the Sun sinks.',
  update() { S.act.vis += .3 * sm(3, 7, S.t) * (1 - sm(12, 17, S.t)); }, where() { return SPOTS.alpen || skyP(215, 6); } });

export const radioTower = () => event({ name: 'Radio / TV tower', t0: 0, t1: 60, bands: ['radio', 'micro', 'vis'], freq: ['fm', 'tvUHF', 'navRed'], note: 'FM radio (100 MHz, radio band) and digital TV (UHF ~600 MHz, already microwave) from the ridge: both light up the slopes facing the mast. Red aviation light on top.',
  init() {
    const a = 330 * DEG, x = Math.cos(a) * 1300, z = Math.sin(a) * 1300, y = heightAt(x, z), H = 70, pts = [];
    const leg = k => new V3(x + Math.cos(k * 2.09) * 5, y, z + Math.sin(k * 2.09) * 5);
    for (let k = 0; k < 3; k++) { pts.push(leg(k), new V3(x, y + H, z)); }
    for (let s = 0; s < 8; s++) for (let k = 0; k < 3; k++) { const f0 = s / 8, f1 = (s + 1) / 8; pts.push(leg(k).lerp(new V3(x, y + H, z), f0), leg((k + 1) % 3).lerp(new V3(x, y + H, z), f1)); }
    S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0b0b10 }))));
    this.top = new V3(x, y + H, z); this.uhf = new V3(x, y + H * .82, z); this.light = new Em('vis', '#ff2020'); this.rad = new Em('radio'); this.mw = new Em('micro');
    addTx('radio', () => ({ p: this.top, power: 1.4 }));   // FM paints the valley slopes
  },
  // beams toward the eye (sources.js BEAM.array): FM from a 4-bay stack about one wavelength apart, UHF TV from an
  // 8-tier panel array (typical broadcast antennas, STAND-IN), both omnidirectional in azimuth, tilted ~0.75° down —
  // from below the ridge you sit under the main beam, so UHF (the narrower stack) looks dimmer than FM
  update() { this.light.set(this.top, 5, S.T % 1.5 < .5 ? 1.3 : .05); this.rad.set(this.top, 170, .8, BEAM.array(toViewer(this.top).el, 4)); this.mw.set(this.uhf, 60, .55, BEAM.array(toViewer(this.uhf).el, 8));
    TRAIL_U.uMTx.value[1].set(this.uhf.x, this.uhf.y, this.uhf.z, S.on.micro ? .5 : 0); S.act.micro += .15; },   // TV UHF coverage on the terrain
  where() { return this.top; } });

export const warmRocks = () => event({ name: 'Warm rocks cooling', t0: 0, t1: 45, bands: ['ir'], freq: ['thermal290'], note: 'Rocks heated during the day give off infrared as they cool.',
  // the rock surfaces cool via their surface properties (plan 1.4); only the 5 largest boulders near the trail
  // (largest thermal mass, so they stay warmest) keep a glow of their own — chosen by size, no R() draws
  init() { this.r = [...NEAR_ROCKS].sort((a, b) => b.s - a.s).slice(0, 5); this.e = new EmField('ir', this.r.length); },
  update() { const w = warmF();
    this.r.forEach((r, i) => this.e.set(i, r.p, r.s * 1.6, w * .35)); },
  where: () => null });

export const hut = () => event({ name: 'Mountain hut', t0: 8, t1: 34, bands: ['vis', 'ir', 'micro'], freq: ['incandescent', 'thermal700', 'wifi24'], note: 'Lit windows, heat leaking from the chimney, Wi-Fi router (2.4 GHz microwave).',
  init() {
    const z = 6, x = trailX(z) + 16, y = heightAt(x, z), G = new THREE.Group(); G.position.set(x, y, z);
    const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(.09, .05, .03), roughness: .9 }), roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(.04, .035, .035), roughness: .8 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, 4.2, 5), wood); box.position.y = 1.1; G.add(box);
    [-1, 1].forEach(s => { const r = new THREE.Mesh(new THREE.BoxGeometry(6.6, .18, 3.4), roof); r.position.set(0, 4.1, s * 1.35); r.rotation.x = s * .62; G.add(r); });
    const gable = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 6, 3, 1), wood); gable.rotation.z = Math.PI / 2; gable.position.y = 3.8; gable.scale.set(1, 1, 1.15); G.add(gable);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.8, .6), wood); ch.position.set(1.6, 5, .9); G.add(ch);
    this.winMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    [-1.4, 1.4].forEach(zz => { const w = new THREE.Mesh(new THREE.PlaneGeometry(.9, .75), this.winMat); w.position.set(-3.01, 1.9, zz); w.rotation.y = -Math.PI / 2; G.add(w); });
    S.scene.add(spectralGroup(G, 'wood', { weight: .05 }));
    this.light = new THREE.PointLight(0xffa050, 0, 30, 1.6); this.light.position.set(x - 4, y + 1.8, z); S.scene.add(this.light);
    this.wins = [-1.4, 1.4].map(zz => new V3(x - 3.1, y + 1.9, z + zz));
    this.chim = new V3(x + 1.6, y + 6, z + .9); this.center = new V3(x, y + 2, z); this.roof = new V3(x, y + 5, z);
    this.smoke = Array.from({ length: 9 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false, opacity: 0 })); S.scene.add(visOnly(s)); return s; });
    addTx('micro', () => ({ p: this.roof, power: .9 }));   // the hut's Wi-Fi lights up the nearby ground
    this.smokeIR = this.smoke.map(() => new Em('ir')); this.wv = this.wins.map(() => new Em('vis', '#ffa040')); this.ir = new Em('ir'); this.mi = new Em('micro');
  },
  update() {
    const { t, T } = S, lit = sm(9, 13, t), n = sm(8, 22, t);
    this.winMat.color.setRGB(.04 + 1.6 * lit, .02 + .85 * lit, .005 + .3 * lit);
    this.light.intensity = S.on.vis ? lit * 25 : 0;
    this.wins.forEach((p, i) => this.wv[i].set(p, 2.2, lit * .45));
    this.ir.set(this.center, 10, .55); this.mi.set(this.roof, 3.5, .8);
    const sc = lerp(.45, .03, n);
    this.smoke.forEach((s, k) => {
      const age = (T * .22 + k / 9) % 1, p = this.chim.clone().add(new V3(age * 4 + Math.sin(age * 6 + k) * .4, age * 11, age * 1.5));
      s.position.copy(p); s.scale.setScalar(.8 + age * 4.5); s.material.opacity = .45 * (1 - age) * (.4 + .6 * sm(0, .1, age)); s.material.color.setRGB(sc, sc, sc * 1.05);
      this.smokeIR[k].set(p, .8 + age * 2.4, .5 * (1 - age));
    });
  }, where() { return this.roof; } });

// Deer (M11/T4): a red-deer stag in summer coat, one merged body + one instanced draw for the four swinging legs, each
// part with its own surface (engine/render/surface.js partsGeometry): the coat reads only a few °C above the air, the
// eyes, nose, ears, lower legs and the antlers in velvet (living, blood-filled skin in summer) are the warm windows.
const SPH = new THREE.SphereGeometry(1, 12, 8);
const DEER_LEG = partsGeometry([
  { from: [0, .04, 0], to: [0, -.42, 0], r0: .075, r1: .05, surf: 'fur', col: 0x3a2416 },     // thigh / forearm in the coat
  { from: [0, -.42, 0], to: [0, -.86, 0], r0: .04, r1: .028, surf: 'limb', col: 0x2a1a10 },   // thin-haired cannon bone
  { from: [0, -.86, 0], to: [0, -.92, 0], r0: .03, r1: .036, surf: 'fur', col: 0x0c0806 },    // hoof (keratin, near air)
]);
function deerBody() {
  const fur = 0x3a2416, pale = 0x7a6450, P = [
    { g: SPH, s: [.66, .33, .26], at: [0, 1.12, 0], surf: 'fur', col: fur },               // barrel
    { g: SPH, s: [.3, .32, .25], at: [.42, 1.14, 0], surf: 'fur', col: fur },              // chest / shoulders
    { g: SPH, s: [.28, .3, .24], at: [-.42, 1.13, 0], surf: 'fur', col: fur },             // haunches
    { g: SPH, s: [.1, .19, .18], at: [-.66, 1.14, 0], surf: 'fur', col: pale },            // rump patch
    { from: [.5, 1.22, 0], to: [.86, 1.66, 0], r0: .15, r1: .09, n: 8, surf: 'fur', col: fur },   // neck
    { g: SPH, s: [.19, .1, .095], rot: [0, 0, -.45], at: [.96, 1.68, 0], surf: 'fur', col: fur },   // head
    { from: [1.05, 1.63, 0], to: [1.2, 1.55, 0], r0: .06, r1: .035, surf: 'skin', col: 0x120c0a }, // muzzle: bare, warm nose
    { from: [.84, 1.76, .07], to: [.8, 1.92, .2], r0: .04, r1: .012, n: 5, surf: 'limb', col: 0x2e1c12 },   // ears
    { from: [.84, 1.76, -.07], to: [.8, 1.92, -.2], r0: .04, r1: .012, n: 5, surf: 'limb', col: 0x2e1c12 },
    { g: SPH, s: [.022, .022, .022], at: [1.0, 1.72, .075], surf: 'skin', col: 0x050404 },   // eyes: the warmest spots
    { g: SPH, s: [.022, .022, .022], at: [1.0, 1.72, -.075], surf: 'skin', col: 0x050404 },
    { g: SPH, s: [.05, .08, .045], at: [-.72, 1.2, 0], surf: 'fur', col: pale },            // tail
  ];
  for (const z of [1, -1]) {                                                                // antlers in velvet: skin
    const b0 = [.9, 1.8, .05 * z], b1 = [.82, 2.1, .2 * z], b2 = [.7, 2.38, .3 * z];
    P.push({ from: b0, to: b1, r0: .025, r1: .02, n: 5, surf: 'skin', col: 0x3a2a20 }, { from: b1, to: b2, r0: .02, r1: .012, n: 5, surf: 'skin', col: 0x3a2a20 },
      { from: [.86, 1.95, .12 * z], to: [1.02, 2.06, .16 * z], r0: .014, r1: .006, n: 4, surf: 'skin', col: 0x3a2a20 },
      { from: b1, to: [.95, 2.28, .25 * z], r0: .013, r1: .006, n: 4, surf: 'skin', col: 0x3a2a20 });
  }
  return partsGeometry(P);
}
export const deer = () => event({ name: 'Deer crossing', t0: 13, t1: 27, bands: ['ir'], freq: ['thermal310'], note: 'Hard to see by eye at dusk, bright on a thermal camera: a stag in his summer coat. The coat itself reads only a few degrees above the air (fur insulates); eyes, nose, ears, the thin-haired lower legs and the antlers, still in their blood-filled velvet, glow warm.',
  init() {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), G = new THREE.Group();
    G.add(spectralParts(new THREE.Mesh(deerBody(), m), { weight: 0 }));
    this.legs = new THREE.InstancedMesh(DEER_LEG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), 4); this.legs.frustumCulled = false; this.legs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    G.add(spectralParts(this.legs, { weight: 0 })); this.tmp = new THREE.Object3D();
    this.g = G; S.scene.add(G); G.visible = false;   // warm surfaces by part (M11/T4); its IR is metered by the sources
    this.a = new V3(30, 0, -2); this.b = new V3(-32, 0, -13); this.body = new Rib('ir', null, 4, 1); this.headIR = new Em('ir', null, 1);
  },
  update() {
    const { t, T } = S, p = (t - 13) / 14; this.g.visible = p > 0 && p < 1; if (!this.g.visible) { this.p = null; return; }
    const x = lerp(this.a.x, this.b.x, p), z = lerp(this.a.z, this.b.z, p), y = heightAt(x, z), dx = this.b.x - this.a.x, dz = this.b.z - this.a.z;
    this.g.position.set(x, y, z); this.g.rotation.y = Math.atan2(-dz, dx);
    [[.42, .15], [.42, -.15], [-.42, .15], [-.42, -.15]].forEach(([lx, lz], i) => {
      this.tmp.position.set(lx, .92, lz); this.tmp.rotation.set(0, 0, Math.sin(T * 7 + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.2 : 0)) * .45);
      this.tmp.updateMatrix(); this.legs.setMatrixAt(i, this.tmp.matrix); });
    this.legs.instanceMatrix.needsUpdate = true;
    const I = env(t, 13, 27, 1), fw = new V3(dx, 0, dz).normalize();
    this.p = new V3(x, y + 1.05, z); this.body.set([this.p.clone().addScaledVector(fw, -.72), this.p.clone().addScaledVector(fw, .55)], 1.5, 1.1, I * .55); this.headIR.set(this.p.clone().addScaledVector(fw, .9).add(new V3(0, .62, 0)), 1.1, I * .4);
  }, where() { return this.p; } });

export const fireflies = () => event({ name: 'Fireflies', t0: 15, t1: 35, bands: ['vis'], freq: ['luciferin'], note: 'Bioluminescence is "cold light": visible flashes with almost no infrared.',
  init() { this.f = Array.from({ length: 120 }, () => { const z = -170 + R() * 210, x = trailX(z) + (R() - .5) * 26; return { b: new V3(x, heightAt(x, z) + .3 + R() * 2.2, z), s: .5 + R(), p: R() * 6, r: 1.5 + R() * 2 }; }); this.field = new EmField('vis', this.f.length, '#b8ff3a'); },
  update() { const { t, T } = S, I = env(t, 15, 35, 2); if (I <= 0) return;
    this.f.forEach((f, k) => { const b = Math.max(0, Math.sin(T * f.r + f.p)) ** 8; this.field.set(k, f.b.clone().add(new V3(Math.sin(T * .5 * f.s + f.p) * .8, Math.sin(T * 1.1 * f.s) * .3, Math.cos(T * .4 * f.s + f.p) * .8)), .14, I * b * 1.6); }); },
  where: () => null });

export const bats = () => event({ name: 'Bats hunting', t0: 22, t1: 40, bands: ['ir'], freq: ['thermal310'], note: 'Warm-blooded fliers: invisible against the dark sky, obvious in IR.',
  init() {
    const m = new THREE.MeshBasicMaterial({ color: 0x050507, side: THREE.DoubleSide }), wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.06, 0, 0, .06, -.24, 0, 0], 3));
    this.b = Array.from({ length: 7 }, () => { const G = new THREE.Group(), l = new THREE.Mesh(wg, m), r = new THREE.Mesh(wg, m); r.scale.x = -1; G.add(l, r); S.scene.add(solid(G)); G.visible = false; return { G, l, r, s: .6 + R() * .8, p: R() * 6, h: 5 + R() * 9, rad: 5 + R() * 9, e: new Em('ir', null, 1) }; });
  },
  update() { const { t, T } = S, I = env(t, 22, 40, 2), c = S.camera.position;
    this.b.forEach(b => { b.G.visible = I > 0; if (I <= 0) return;
      const a = T * .9 * b.s + b.p, x = c.x + Math.cos(a) * b.rad, z = c.z - 10 + Math.sin(a * 1.3) * b.rad, y = heightAt(x, z) + b.h + Math.sin(a * 2) * 2;
      b.G.position.set(x, y, z); b.G.rotation.y = -a; const f = Math.sin(T * 16 * b.s + b.p) * .7; b.l.rotation.z = f; b.r.rotation.z = -f;
      b.e.set(b.G.position, .28, I * .5); }); },
  where: () => null });

export const campfire = () => event({ name: 'Campfire', t0: 40, t1: 60, bands: ['vis', 'ir'], freq: ['flame', 'thermal1200', 'groundHeat'], note: 'Journey\'s end: flickering flame light and strong heat; on a thermal camera the ground around the pit warms up over the next minutes.',
  init() {
    const base = campPos(), G = new THREE.Group(); G.position.copy(base);
    const lm = new THREE.MeshStandardMaterial({ color: new THREE.Color(.05, .03, .02), roughness: .95 });
    for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 1, 6), lm); l.rotation.set(Math.PI / 2 - .5, k * 1.25, 0); l.position.y = .2; G.add(l); }
    for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(.15), new THREE.MeshStandardMaterial({ color: 0x1a1816, flatShading: true })); s.position.set(Math.cos(k * .7) * .6, .05, Math.sin(k * .7) * .6); G.add(s); }
    S.scene.add(solid(G));
    this.base = base; this.light = new THREE.PointLight(0xff7a2a, 0, 40, 1.7); this.light.position.set(base.x, base.y + .8, base.z); S.scene.add(this.light);
    this.fl = [['#ff5a14', 1.4], ['#ff9a2a', 1.0], ['#ffe9a0', .55]].map(([c, s]) => ({ e: new Em('vis', c), s }));
    this.emb = Array.from({ length: 8 }, () => new Em('vis', '#ffb050')); this.ir = new Em('ir');
  },
  update() { const { t, T } = S, lit = sm(38, 40, t), f = .85 + .15 * Math.sin(T * 23) * Math.sin(T * 7.3);
    this.light.intensity = S.on.vis ? lit * 30 * f : 0;
    this.fl.forEach((q, i) => q.e.set(this.base.clone().add(new V3(Math.sin(T * 9 + i) * .05, .35 + i * .18, 0)), q.s * f * (.9 + .2 * Math.random()), lit * 1.3));
    this.emb.forEach((e, k) => { const a = (T * .7 + k / 8) % 1; e.set(this.base.clone().add(new V3(Math.sin(k * 3 + T) * .4 * a, .4 + a * 3, Math.cos(k * 2 + T) * .3 * a)), .05, lit * (1 - a) * 1.5); });
    this.ir.set(this.base.clone().add(new V3(0, .5, 0)), 3.5, lit * f);
    const heat = sm(38, 50, t); TRAIL_U.uCamp.value.set(this.base.x, this.base.y, this.base.z, heat); S.act.ir += heat * .25; },   // the ground around the pit warms up
  where() { return this.base.clone().add(new V3(0, 1, 0)); } });


// ------------------------------------------------------------------ audit replacements (plan 2.3) and Phase 6

export const sunWarmedSlope = () => event({ name: 'Sun-warmed slope', t0: 0, t1: 18, bands: ['ir'], freq: ['sunWarmSlope'], note: 'The slopes ahead-left faced the afternoon sun: on a thermal camera they start warmer than the flat meadow and fade to its temperature as they radiate the heat away. (A thermal camera sees surfaces — air is transparent at 8–14 µm.)',
  update() { S.act.ir += .5 * TRAIL_U.uSlopeK.value; }, where() { return SPOTS.warmSlope; } });

// Valley fog: upright soft banks (cylindrical billboards, one draw call) lying in the hollows ahead.
const FOG_VS = `attribute vec3 aC; attribute vec4 aS; varying vec2 vQ; varying float vSeed; uniform float uGrow;
void main(){ vQ = position.xy; vSeed = aS.z;
  vec3 toC = cameraPosition - aC; toC.y = 0.; vec3 r = normalize(vec3(toC.z, 0., -toC.x));
  vec3 W = aC + r*position.x*aS.x*.5 + vec3(0., (position.y*.5 + .5)*aS.y*uGrow - aS.y*.35, 0.);
  gl_Position = projectionMatrix*viewMatrix*vec4(W, 1.); }`;
const FOG_SHAPE = `float fogA(){ float n = fbm(vec2(vQ.x*2.2 + vSeed*13. + uTime*.012, vQ.y*1.2 + vSeed*5.));
  float top = .05 + .55*n, y = vQ.y;
  return smoothstep(1., .45, abs(vQ.x))*smoothstep(top + .1, top - .5, y)*smoothstep(-1., -.75, y)*(.45 + .55*n)*uAmt; }`;
export const valleyFog = () => event({ name: 'Valley fog', t0: 30, t1: 60, bands: ['vis', 'ir'], freq: ['fogScatter', 'fogTop'], note: 'Cold air drains into the hollows ahead and its moisture condenses into fog banks. They glow silver once moonlight takes over the darkening sky; on a thermal camera they read cold, hiding the warmer ground beneath.',
  init() {
    const banks = [], c0 = new V3(trailX(-40), 0, -40);
    for (let i = 0; i < 600 && banks.length < 22; i++) {
      const az = 215 + R() * 110, r = 380 + R() ** 1.3 * 1700, x = c0.x + Math.cos(az * DEG) * r, z = c0.z + Math.sin(az * DEG) * r, h = heightAt(x, z), rad = r * .12;
      let ring = 0; for (let k = 0; k < 8; k++) ring += heightAt(x + Math.cos(k * .785) * rad, z + Math.sin(k * .785) * rad) / 8;
      const depth = ring - h; if (depth < Math.max(4, r * .008)) continue;
      if (banks.some(b => Math.hypot(b.x - x, b.z - z) < r * .15)) continue;
      banks.push({ x, z, y: h + depth * .45, w: r * (.22 + R() * .18), hh: Math.min(depth * 1.3, 18 + r * .01) + 6, s: R() });
    }
    const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]], pos = [], aC = [], aS = [], idx = [];
    banks.forEach((b, i) => { quad.forEach(([qx, qy]) => { pos.push(qx, qy, 0); aC.push(b.x, b.y, b.z); aS.push(b.w, b.hh, b.s, 0); }); const a = i * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aC', new THREE.Float32BufferAttribute(aC, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 4)); g.setIndex(idx);
    this.u = { uAmt: { value: 0 }, uGrow: { value: .5 }, uCol: { value: new THREE.Color() }, uTime: S.TIME };
    const common = { vertexShader: FOG_VS, transparent: true, depthWrite: false };
    const vis = new THREE.ShaderMaterial({ ...common, uniforms: this.u, fragmentShader: COMMON + `uniform float uAmt, uTime; uniform vec3 uCol; varying vec2 vQ; varying float vSeed; ${FOG_SHAPE}
      void main(){ float a = fogA(); gl_FragColor = vec4(uCol*(.8 + .35*(vQ.y*.5 + .5)), a*.8); }` });
    // instrument view: in IR the fog top is cold (≈ air at the fog layer) and opaque enough to hide the warmer ground
    const ir = new THREE.ShaderMaterial({ ...common, uniforms: { ...this.u, uSOnI: SURF_U.uSOnI_ }, fragmentShader: COMMON + `uniform float uAmt, uTime, uSOnI; varying vec2 vQ; varying float vSeed; ${FOG_SHAPE}
      void main(){ if(uSOnI < .5) discard; float a = fogA(); gl_FragColor = vec4(thermal(.06 + .05*(vQ.y*.5 + .5))*.22, a*.92); }` });
    // spectral eye (engine/render/compose.js): the same cold fog top in the IR channel, with its own coverage, so it
    // hides the warm ground in IR only (radio, microwave and gamma pass through fog)
    vis.userData.eyeBands = `void eyeBands(out vec4 o1, out vec4 o3){ float a = fogA(); o1 = vec4(eyeL(thermal(.06 + .05*(vQ.y*.5 + .5))*.22), 0., 0., a*.92); o3 = vec4(0.); }`;
    this.mesh = new THREE.Mesh(g, vis); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; S.scene.add(solid(this.mesh, ir));
    const near = banks.reduce((a, b) => (Math.hypot(b.x - c0.x, b.z - c0.z) < Math.hypot(a.x - c0.x, a.z - c0.z) ? b : a), banks[0]);
    this.p = near ? new V3(near.x, near.y + 4, near.z) : null;
  },
  update() { const { t } = S, a = sm(29, 40, t), ml = moonlit();
    this.mesh.visible = a > .01; if (!this.mesh.visible) return;
    this.u.uAmt.value = a; this.u.uGrow.value = .45 + .55 * sm(29, 46, t);
    this.u.uCol.value.setRGB(.05 + .3 * ml, .056 + .33 * ml, .075 + .38 * ml);
    S.act.vis += a * (.15 + .5 * ml); S.act.ir += a * .08; },
  where() { return this.p; } });

export const sparkDraft = () => event({ name: 'Spark draft & smoke plume', t0: 42, t1: 60, bands: ['vis', 'ir'], freq: ['sparkGlow', 'plumeHeat'], note: 'The fire\'s updraft lifts glowing sparks a few metres before they cool and go dark. In infrared the smoke and hot gas are bright just above the flames and fade as they rise and mix with the cold night air.',
  init() {
    this.sp = Array.from({ length: 40 }, () => ({ s: R(), v: .7 + R() * .6, w: R() * 6.28 }));
    this.spark = new EmField('vis', this.sp.length, '#ffb347');
    this.sp.forEach((q, i) => this.spark.color(i, new THREE.Color().setHSL(.07 + q.s * .06, 1, .55 + q.s * .1)));
    this.heat = new EmField('ir', 10);
    this.smoke = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false, opacity: 0 })); S.scene.add(visOnly(s)); return s; });
    this.p = null;
  },
  update() { const { t, T } = S, I = sm(41, 44, t), base = campPos(), ml = moonlit();
    this.smoke.forEach(s => s.visible = false); if (I <= 0) { this.p = null; return; }
    this.p = base.clone().add(new V3(.6, 4.5, 0));
    const drift = (h, k) => new V3(h * .18 + Math.sin(T * .9 + k) * .08 * h, h, Math.cos(T * .7 + k * 1.3) * .06 * h);
    this.sp.forEach((q, k) => { const ph = (T * .32 * q.v + q.s) % 1, h = .5 + ph ** .8 * 6.5;
      const p = base.clone().add(drift(h, q.w)).add(new V3(Math.sin(T * 3 * q.v + q.w) * .25 * ph, 0, Math.cos(T * 2.6 * q.v + q.w) * .25 * ph));
      this.spark.set(k, p, .09, I * (1 - ph) ** 1.6 * (.7 + .3 * Math.sin(T * 30 * q.v + q.w)) * 1.4); });
    const sc = .03 + .1 * ml;
    for (let j = 0; j < 10; j++) { const age = (T * .16 + j / 10) % 1, h = .8 + age * 9, p = base.clone().add(drift(h, j * .7));
      this.heat.set(j, p, .9 + age * 3.2, I * .85 * Math.exp(-age * 4.5));             // warm near the fire, gone within a few metres
      const s = this.smoke[j]; s.visible = S.on.vis; s.position.copy(p); s.scale.setScalar(.9 + age * 5);
      const glow = Math.exp(-age * 7);                                                 // firelit underside
      s.material.color.setRGB(sc + .55 * glow, sc + .24 * glow, sc * 1.1 + .08 * glow); s.material.opacity = I * .4 * (1 - age) * sm(0, .08, age); }
    S.act.vis += I * .1; },
  where() { return this.p; } });

export const mountainStream = () => event({ name: 'Mountain stream', t0: 0, t1: 39, bands: ['ir', 'micro', 'vis'], freq: ['thermal290', 'waterCold', 'sunlight'], note: 'Snow-melt water crossing the meadow ahead: a cold line on the thermal camera (it is ~6 °C and mirrors the cold sky), and dark in microwave, where water emits only about half as much as the land around it.',
  init() { this.p = STREAM.pts.reduce((a, q) => (Math.abs(q.x - trailX(q.z) - 7) < Math.abs(a.x - trailX(a.z) - 7) ? q : a)).clone().add(new V3(0, 1, 0)); },
  update() { const k = 1 - sm(36, 39, S.t); S.act.ir += .06 * k; S.act.micro += .04 * k; S.act.vis += .03 * k; },
  where() { return this.p; } });

export const farHikers = () => event({ name: 'Headlamps on the switchbacks', t0: 23, t1: 60, bands: ['vis'], freq: ['headlamp'], note: 'A party coming down late from the summit: their LED headlamps zigzag down the switchbacks on the far slope.',
  init() {
    const c0 = new V3(trailX(-40), 0, -40), A = new V3(Math.cos(326 * DEG) * 1450, 0, Math.sin(326 * DEG) * 1450).add(c0), B = new V3(Math.cos(335 * DEG) * 2250, 0, Math.sin(335 * DEG) * 2250).add(c0);
    const ax = B.clone().sub(A), side = new V3(-ax.z, 0, ax.x).normalize(), legs = 9, path = [];
    for (let k = 0; k <= legs; k++) path.push(A.clone().lerp(B, k / legs).addScaledVector(side, (k % 2 ? 1 : -1) * 110));
    this.path = []; for (let k = 0; k < legs; k++) for (let s = 0; s < 12; s++) { const p = path[k].clone().lerp(path[k + 1], s / 12); p.y = heightAt(p.x, p.z) + 2; this.path.push(p); }
    this.cum = [0]; for (let i = 1; i < this.path.length; i++) this.cum.push(this.cum[i - 1] + this.path[i].distanceTo(this.path[i - 1]));
    this.h = Array.from({ length: 5 }, (_, i) => ({ o: .12 + i * .045 + R() * .02, b: R() * 6 }));
    this.field = new EmField('vis', 5, '#fff2d6'); this.p = null;
  },
  at(d) { const L = this.cum.at(-1); d = Math.max(0, Math.min(L, d)); let i = 1; while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    return this.path[i - 1].clone().lerp(this.path[i], (d - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1)); },
  update() { const { t, T } = S, I = env(t, 23, 60, 3); if (I <= 0) { this.p = null; return; }
    const L = this.cum.at(-1), prog = (t - 23) / 37;                                       // descending: from the top end of the path
    this.h.forEach((h, i) => { const p = this.at(L * (1 - h.o - prog * .62));
      this.field.set(i, p, 9, I * .5 * (.75 + .25 * Math.sin(T * 1.7 + h.b))); if (i === 2) this.p = p; }); },
  where() { return this.p; } });

// Cows (M11/T4): a brown alpine cow by parts — coat near the air, eyes, ears, lower legs and udder warm — and, once the
// alp cools after dark, the breath condensing into a faint droplet plume at each exhalation (droplets, not the warm air,
// show at 8–14 µm: SPECTRUM.steam, as the city's steam). A resting cow breathes ~20–30 times a minute (STAND-IN; drawn
// as one breath per 2.5 s of real time); condensation needs air near or below ~10 °C at high humidity — STAND-IN
// timing: from t ≈ 20 on, as the meadow cools.
function cowBody() {
  const fur = 0x3b2c22, dark = 0x1a120e, P = [
    { g: SPH, s: [.86, .4, .34], at: [0, 1.08, 0], surf: 'fur', col: fur },               // barrel
    { g: SPH, s: [.36, .42, .34], at: [.5, 1.1, 0], surf: 'fur', col: fur },               // shoulders
    { g: SPH, s: [.36, .4, .35], at: [-.55, 1.12, 0], surf: 'fur', col: fur },             // hips
    { from: [.7, 1.12, 0], to: [1.0, 1.02, 0], r0: .24, r1: .17, n: 8, surf: 'fur', col: fur },   // neck, head lowered to graze
    { g: SPH, s: [.24, .15, .14], rot: [0, 0, -.7], at: [1.14, .9, 0], surf: 'fur', col: fur },   // head
    { g: SPH, s: [.1, .09, .11], at: [1.3, .72, 0], surf: 'limb', col: 0x4a3a36 },          // muzzle (moist: evaporation keeps it below skin)
    { g: SPH, s: [.025, .025, .025], at: [1.16, .98, .12], surf: 'skin', col: 0x050404 },   // eyes: the warmest spots
    { g: SPH, s: [.025, .025, .025], at: [1.16, .98, -.12], surf: 'skin', col: 0x050404 },
    { g: SPH, s: [.1, .035, .06], at: [1.04, 1.05, .2], rot: [.5, 0, 0], surf: 'limb', col: fur },   // ears
    { g: SPH, s: [.1, .035, .06], at: [1.04, 1.05, -.2], rot: [-.5, 0, 0], surf: 'limb', col: fur },
    { from: [1.06, 1.08, .09], to: [1.02, 1.2, .2], r0: .03, r1: .01, n: 5, surf: 'fur', col: 0x8a8070 },   // horns (keratin, near air)
    { from: [1.06, 1.08, -.09], to: [1.02, 1.2, -.2], r0: .03, r1: .01, n: 5, surf: 'fur', col: 0x8a8070 },
    { g: SPH, s: [.2, .13, .17], at: [-.38, .7, 0], surf: 'skin', col: 0x5a4440 },          // udder [Ber]
    { from: [-.88, 1.24, 0], to: [-.92, .5, 0], r0: .025, n: 5, surf: 'fur', col: fur },   // tail
    { g: SPH, s: [.05, .11, .05], at: [-.92, .44, 0], surf: 'fur', col: dark },             // tail switch
    { from: [.88, .86, 0], to: [.88, .74, 0], r0: .06, r1: .08, n: 7, surf: 'fur', col: 0x6a5a30 },   // the bell (drawn at the coat's T)
  ];
  for (const [x, z] of [[.55, .2], [.55, -.2], [-.58, .2], [-.58, -.2]]) P.push(
    { from: [x, 1.0, z], to: [x, .5, z], r0: .12, r1: .08, n: 7, surf: 'fur', col: fur },   // upper leg in the coat
    { from: [x, .5, z], to: [x, .07, z], r0: .065, r1: .05, n: 6, surf: 'limb', col: fur },  // lower leg: thin-haired, warm
    { from: [x, .07, z], to: [x, 0, z], r0: .06, r1: .07, n: 6, surf: 'fur', col: dark });   // hoof
  return partsGeometry(P);
}
export const cows = () => event({ name: 'Cows on the alp', t0: 3, t1: 42, bands: ['ir'], freq: ['cowBody', 'steam'], note: 'A herd grazing on the meadow, bells clanking: dark lumps by eye at dusk, unmistakable warm bodies (~39 °C core) on a thermal camera — the insulating coat a few degrees above the air, eyes, ears, udder and lower legs warm. Once the alp cools after dark, each breath condenses into a faint plume.',
  init() {
    const geo = cowBody();
    this.c = []; for (let i = 0; i < 400 && this.c.length < 8; i++) {
      const z = -12 - R() * 95, side = R() < .5 ? -1 : 1, x = trailX(z) + side * (9 + R() * 30);
      if (Math.abs(z - STREAM.z) < 14 || this.c.some(c => Math.hypot(c.x - x, c.z - z) < 5)) continue;
      this.c.push({ x, z, y: heightAt(x, z), a: R() * 6.28, s: .9 + R() * .2, ph: R() * 6 });
    }
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }), this.c.length);
    this.c.forEach((c, i) => this.mesh.setColorAt(i, new THREE.Color().setScalar(.55 + .9 * ((i * .618) % 1))));   // lighter and darker coats (by index, not R)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); S.scene.add(spectralParts(this.mesh, { weight: 0 }));   // warm parts (M11/T4)
    this.ir = new EmField('ir', this.c.length * 3, null, 1); this.br = new EmField('ir', this.c.length, null, 1); this.tmp = new THREE.Object3D(); this.p = null;
  },
  update() { const { t, T } = S, I = env(t, 3, 42, 2), cold = sm(20, 32, t);
    this.mesh.visible = I > 0; if (I <= 0) { this.p = null; return; }
    let best = 1e9; const cam = S.camera.position;
    this.c.forEach((c, i) => { const a = c.a + .35 * Math.sin(T * .05 + c.ph), fw = new V3(Math.cos(a), 0, -Math.sin(a));
      const x = c.x + Math.sin(T * .03 + c.ph) * 1.5, z = c.z + Math.cos(T * .025 + c.ph) * 1.5, y = heightAt(x, z);
      this.tmp.position.set(x, y, z); this.tmp.rotation.set(0, a, 0); this.tmp.scale.setScalar(c.s); this.tmp.updateMatrix(); this.mesh.setMatrixAt(i, this.tmp.matrix);
      const b = new V3(x, y + 1.05 * c.s, z);
      this.ir.set(i * 3, b.clone().addScaledVector(fw, -.42 * c.s), 1.35 * c.s, I * .5); this.ir.set(i * 3 + 1, b.clone().addScaledVector(fw, .38 * c.s), 1.25 * c.s, I * .5);
      this.ir.set(i * 3 + 2, b.clone().addScaledVector(fw, 1.12 * c.s).add(new V3(0, .08, 0)), .6 * c.s, I * .42);
      const ph = ((T + c.ph) / 2.5) % 1, puff = ph < .4 ? Math.sin(ph / .4 * Math.PI) : 0;   // one exhalation per 2.5 s
      if (cold * puff > .02) this.br.set(i, new V3(x, y + .7 * c.s, z).addScaledVector(fw, (1.45 + .35 * ph) * c.s).add(new V3(0, .15 * ph, 0)), (.25 + .5 * ph) * c.s, I * cold * puff * .14);
      const d = b.distanceTo(cam); if (z < cam.z - 6 && d < best) { best = d; this.p = b.clone().add(new V3(0, 1, 0)); } });
    this.mesh.instanceMatrix.needsUpdate = true; },
  where() { return this.p; } });

export const cellMast = () => event({ name: 'Cell mast on the ridge', t0: 0, t1: 60, bands: ['micro'], freq: ['lte800', 'nr35'], note: 'A mobile-phone mast on the ridge (LTE 800 MHz, 5G 3.5 GHz — both microwave). Its sector antennas cover the whole valley, painting the slopes that face it.',
  init() {
    const c0 = new V3(trailX(-40), 0, -40); let best = null, bs = -1e9;
    for (let az = 288; az <= 316; az += 2) for (let r = 480; r <= 900; r += 30) {
      const x = c0.x + Math.cos(az * DEG) * r, z = c0.z + Math.sin(az * DEG) * r, h = heightAt(x, z);
      let ring = 0; for (let k = 0; k < 6; k++) ring += heightAt(x + Math.cos(k * 1.047) * 40, z + Math.sin(k * 1.047) * 40) / 6;
      if (h - ring > bs) { bs = h - ring; best = new V3(x, h, z); }
    }
    const H = 32, b = best, pts = [], top = new V3(b.x, b.y + H, b.z);
    for (let k = 0; k < 3; k++) { const a = k * 2.094, o = new V3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4); pts.push(b.clone().add(o), top.clone().add(o.clone().multiplyScalar(.4)));
      const p0 = top.clone().add(new V3(Math.cos(a) * 2.2, -1, Math.sin(a) * 2.2)); pts.push(p0, p0.clone().add(new V3(0, -2.6, 0))); }
    S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0b0b10 }))));
    this.top = top.clone().add(new V3(0, -2.2, 0)); this.e = new Em('micro');
  },
  // the eye sees the three sector panels' beams (sources.js BEAM.sectors: 3GPP panel pattern, 65° wide, 4° downtilt,
  // boresights along the drawn panels at k·120°): bright where you stand in a sector's main lobe, ~10 dB down between
  // two sectors. The load flicker f is the old view's; the eye shows the steady pilot/reference-signal power.
  update() { const { T } = S, f = .75 + .25 * Math.sin(T * 3.1) * Math.sin(T * 1.3), v = toViewer(this.top);
    this.e.set(this.top, 28, .55 * f, BEAM.sectors(v.az, -v.el, [0, 2.094, -2.094]) / f); TRAIL_U.uMTx.value[0].set(this.top.x, this.top.y, this.top.z, .9); S.act.micro += .2; },
  where() { return this.top; } });

export const weatherStation = () => event({ name: 'Weather-station radio link', t0: 0, t1: 60, bands: ['radio'], freq: ['wxTelemetry'], note: 'An automatic weather station on the knoll ahead sends its readings in short VHF bursts to the transmitter mast on the ridge.',
  init() {
    const z = -150, x = trailX(z) + 24, y = heightAt(x, z), b = new V3(x, y, z), top = b.clone().add(new V3(0, 3.2, 0)), pts = [];
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + .3; pts.push(b.clone().add(new V3(Math.cos(a) * .7, 0, Math.sin(a) * .7)), top); }
    pts.push(top.clone().add(new V3(-.5, 0, 0)), top.clone().add(new V3(.5, 0, 0)), top.clone().add(new V3(0, 0, -.5)), top.clone().add(new V3(0, 0, .5)), top, top.clone().add(new V3(0, 1.6, 0)));
    S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0b0b10 }))));
    const boxM = new THREE.Mesh(new THREE.BoxGeometry(.45, .55, .3), new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: .7 })); boxM.position.copy(b).add(new V3(0, 1.4, 0)); S.scene.add(solid(boxM));
    this.top = top.clone().add(new V3(0, 1.6, 0));
    const a = 330 * DEG, tx = Math.cos(a) * 1300, tz = Math.sin(a) * 1300; this.dst = new V3(tx, heightAt(tx, tz) + 60, tz);
    this.e = new Em('radio'); this.link = new Rib('radio', null, 24);
  },
  update() { const { t } = S, ph = (t % 3.5) / 3.5; if (ph > .22) return;
    const I = Math.sin(ph / .22 * Math.PI);
    this.e.set(this.top, 7, I * .9);
    const pts = Array.from({ length: 24 }, (_, i) => { const k = i / 23, p = this.top.clone().lerp(this.dst, k); p.y += Math.sin(k * Math.PI) * 60; return p; });
    this.link.set(pts, 3, 9, I * .6); },
  where() { return this.top; } });

// GNSS drift: GPS orbits in 11 h 58 min at 20 180 km (Galileo 14 h 05 min at 23 222 km), ~30°/h (GPS) and ~26°/h
// (Galileo) in orbit, seen from the ground ~25–40°/h (faster near the zenith, slower low down) — a satellite crosses the
// sky in ~5–7 h (IS-GPS-200; Galileo OS SIS ICD). On the sunset clock (1 script unit ≈ 3.4 min: the Sun sinks 0.55° per
// unit at ~0.16°/min) that is ~1.7°/unit, ~100° over the night: each point moves along its own track and, leaving the
// cone, is replaced by another rising into it (wrapped, faded at the cone's edges). Same R() draws as before.
const GNSS_RATE = 1.7, GNSS_EL0 = 12, GNSS_EL1 = FOV_SKY.elMax - 2;   // °/script unit; elevation band drawn
export const gnss = () => event({ name: 'GPS & Galileo satellites', t0: 0, t1: 60, bands: ['micro'], freq: ['gpsL1', 'galileoE5'], note: 'Navigation satellites 20 000 km up broadcast continuously in the L band (1.2–1.6 GHz, microwave): faint, steady points that each cross the sky in five to seven hours, so over the evening they drift tens of degrees, one setting as another rises — the signal your phone uses to place you on the trail.',
  init() { this.s = Array.from({ length: 9 }, () => ({ az: FOV_SKY.az0 + 4 + R() * 112, el: 14 + R() * (FOV_SKY.elMax - 16), d: (R() - .5) * .12 })); this.f = new EmField('micro', this.s.length, '#ffd27a'); },
  // track direction from the old drift draw d (−.06….06 → any heading); position wrapped inside the cone
  pos(s, i, t) { const h = s.d / .06 * Math.PI + i, w = FOV_SKY.az1 - FOV_SKY.az0 - 8, H = GNSS_EL1 - GNSS_EL0, k = i % 2 ? .87 : 1;   // Galileo (odd) a bit slower
    const az = FOV_SKY.az0 + 4 + ((s.az - FOV_SKY.az0 - 4 + t * GNSS_RATE * k * Math.cos(h) / Math.cos(s.el * DEG)) % w + w) % w;
    const el = GNSS_EL0 + ((s.el - GNSS_EL0 + t * GNSS_RATE * k * Math.sin(h)) % H + H) % H;
    const edge = Math.min(az - FOV_SKY.az0 - 4, FOV_SKY.az0 + 4 + w - az, el - GNSS_EL0, GNSS_EL1 - el);
    return { az, el, a: sm(0, 3, edge) }; },
  update() { const { t } = S;
    this.s.forEach((s, i) => { const q = this.pos(s, i, t); this.f.set(i, skyP(q.az, q.el), deg(.7), .2 * q.a); }); },
  where() { const q = this.pos(this.s[3], 3, S.t); return skyP(q.az, q.el); } });
