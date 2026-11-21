// Events that belong to the city (sky events come from the engine library). The radio/microwave
// ecosystem lives in rf.js, the smaller visible/IR street life in life.js.
import * as THREE from 'three';
import { V3, sm, R, hash2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { Em, Rib, EmField } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { addTx, spectral } from 'spectra/render/surface.js';
import { BUILD, LAMPS, FLATS, PARK_Z, MAST, PAINT } from './world.js';

// Microwave fields are drawn in one fixed orange crackle; multiply it by the per-instance colour so channels can
// be told apart (white = unchanged). Patched locally so the engine shader stays untouched.
export function tintMicro(field) {
  const m = field.m.material, src = 'col = mix(vec3(1.,.42,0.), vec3(1.,.85,.2), h21(g*1.7))*m*1.6';
  if (m.fragmentShader.includes(src)) { m.fragmentShader = m.fragmentShader.replace(src, src.replace('*m*1.6', '*m*1.6*uColor')); m.needsUpdate = true; }
  return field;
}
export const pulse = (x, w) => Math.max(0, 1 - Math.abs(x) / w);   // triangular blip
// deterministic burst schedule: 1 while t is within `len` after a tick of period `per` (phase ph)
export const burst = (t, per, ph, len) => { const u = ((t + ph) % per + per) % per; return u < len ? 1 - u / len : 0; };
export const inWin = e => S.t >= e.t0 && S.t <= e.t1;   // for update()s that have no envelope of their own
export const litNow = t => .06 + .5 * sm(6, 24, t);      // fraction of lit windows (shared with the window shader)

export const windows = () => event({ name: 'Lit windows & heat island', t0: 0, t1: 60, bands: ['vis', 'ir'], freq: ['incandescent', 'ledWhite', 'thermal290'], note: 'Windows and shop fronts light up; on a thermal camera the facades leak heat around the window frames while the glass mirrors the cold sky.',
  update() { const { t } = S, lit = litNow(t);
    BUILD.lit.value = lit; BUILD.shop.value = .25 + .75 * sm(4, 12, t);
    S.act.vis += lit * .8 + BUILD.shop.value * .3; S.act.ir += .25; },
  where: () => null });

// Half of the avenue has been re-lamped with white LEDs (no infrared); the rest are old high-pressure sodium lamps
// that strike pink-red, warm up to orange over several minutes and radiate strongly at 819 nm.
export const streetLights = () => event({ name: 'Street lights', t0: 8, t1: 60, bands: ['vis', 'ir'], freq: ['na589', 'na819', 'ledWhite'], tags: ['time-compressed'], note: 'A mix of new white LED lamps (they switch on instantly, no infrared) and old high-pressure sodium lamps: they strike with a dim bluish-white glow and warm up to orange (minutes in reality, compressed here), with a strong near-infrared line at 819 nm.',
  init() { this.v = new EmField('vis', LAMPS.length); this.i = new EmField('ir', LAMPS.length); this.c = new THREE.Color(); },
  update() { const { t, T } = S; let sum = 0;
    LAMPS.forEach((l, k) => {
      const t0 = 9 + l.k * 4;
      if (l.led) { const on = t > t0 ? 1 : 0; sum += on; this.v.color(k, '#eef3ff'); this.v.set(k, l.p, 2.1, on * 1.15); return; }
      const warm = sm(t0, t0 + 6, t), strike = t > t0 ? 1 : 0, fl = t < t0 + .8 ? .6 + .4 * Math.sin(T * 40 + k) : 1;
      sum += warm;
      this.v.color(k, this.c.setRGB(.7 + .3 * warm, .75 - .03 * warm, 1 - .65 * warm));    // HPS: dim bluish-white strike -> orange (pink-red is LPS)
      this.v.set(k, l.p, 2.4, strike * fl * (.25 + .85 * warm)); this.i.set(k, l.p, 3.2, strike * warm * .3);
    });
    const n = sum / Math.max(1, LAMPS.length); LAMPS.poolMat.color.setScalar(.8 * n); },
  where: () => null });

// Mobile mast on a rooftop on the south side of the avenue, just before the park.
export const cellTower = () => event({ name: '5G mast', t0: 0, t1: 60, bands: ['micro', 'vis'], freq: ['nr35', 'lte800', 'navRed'], note: 'Sector antennas on a rooftop beam microwave to every phone in the street; red light for aircraft.',
  init() {
    this.big = new Em('micro'); this.pe = MAST.panels.map(() => new Em('micro')); this.red = new Em('vis', '#ff2020');
    addTx('micro', () => ({ p: MAST.panels[0], power: .6 }));      // paints the facades below in the microwave surface term
  },
  update() { const { T } = S;
    this.big.set(MAST.top, 38, .55); this.pe.forEach((e, k) => e.set(MAST.panels[k], 5, .5 + .5 * Math.max(0, Math.sin(T * 3 + k * 2.1))));
    this.red.set(MAST.top, 2.2, T % 1.6 < .5 ? 1.3 : .05); },
  where() { return MAST.top; } });

// Wi-Fi: an access point in ~60 % of the flats along the street and in the shops. Beacons tick all the time (dim),
// data bursts come from the flats whose lights are on. 2.4 GHz = deeper orange, 5 GHz = pale yellow.
export const wifi = () => event({ name: 'Wi-Fi routers', t0: 0, t1: 60, bands: ['micro'], freq: ['wifi24', 'wifi5'], note: 'Hundreds of 2.4 GHz (deep orange) and 5 GHz (pale yellow) access points behind the windows and in the shops: steady beacons, bursts of data from the flats where someone is home.',
  init() {
    this.f = tintMicro(new EmField('micro', FLATS.length));
    FLATS.forEach((q, k) => this.f.color(k, q.g5 ? new THREE.Color(.8, 1.15, 1.9) : new THREE.Color(1, .72, .5)));
    this.near = [];                                    // the nearest busy routers light up the facades (surface term)
    for (let i = 0; i < 3; i++) addTx('micro', () => this.near[i] || null);
  },
  update() { const { t } = S, lit = litNow(t), cam = S.camera.position, near = [];
    FLATS.forEach((q, k) => {
      const home = q.shop ? sm(0, 2, t) : (q.k < lit / .56 ? 1 : 0);
      const b = Math.max(0, Math.sin(t * 2 * q.r + q.ph)) ** 8 * home, d = q.p.distanceTo(cam);
      this.f.set(k, q.p, q.shop ? 1.6 : 1.3, .12 + b * .55);
      if (b > .3 && d < 45) near.push({ p: q.p, power: .25 * b, d });
    });
    near.sort((a, b) => a.d - b.d); this.near = near.slice(0, 3); },
  where: () => null });

// Cars on the avenue; it runs on through the park, so they appear and vanish far away.
export const traffic = () => event({ name: 'Traffic', t0: 0, t1: 60, bands: ['vis', 'ir', 'micro'], freq: ['ledWhite', 'navRed', 'thermal700', 'carRadar', 'tpms'], note: 'Headlights and tail lights, hot engines and exhausts, 77 GHz collision radar in every new car, and the tyre-pressure sensors in each wheel chirping at 433 MHz.',
  init() {
    const lanes = [[2.2, -1], [5.3, -1], [-2.2, 1], [-5.3, 1]];   // [x, direction along z]: westbound on the north (+x) side
    const geoB = new THREE.BoxGeometry(1.8, .75, 4.4), geoC = new THREE.BoxGeometry(1.6, .6, 2.3); geoB.translate(0, .62, 0); geoC.translate(0, 1.3, -.2);
    this.cars = [];
    for (const [x, dir] of lanes) for (let k = 0; k < 7; k++) {
      const col = new THREE.Color().setHSL(R(), .3 + R() * .3, .06 + R() * .12);
      this.cars.push({ G: new THREE.Object3D(), col, x: x + (R() - .5) * .4, dir, z0: k / 7 + R() * .08, v: 9 + R() * 5, ex: new Rib('ir', null, 3, 1), tp: 5 + R() * 6, tph: R() * 10 });
    }
    const n = this.cars.length, m = new THREE.MeshStandardMaterial({ roughness: .4, metalness: .5 });   // bodies and cabins: one instanced draw
    const g = new THREE.InstancedMesh(mergeBoxes(geoB, geoC), m, n); g.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.frustumCulled = false;
    this.cars.forEach((c, i) => g.setColorAt(i, c.col)); S.scene.add(spectral(g, PAINT, { weight: 0 })); this.body = g;
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);   // one instanced field per light type for all cars
    this.hl = new EmField('vis', n * 2, '#fff4dc'); this.tl = new EmField('vis', n * 2, '#ff2a1a'); this.hot = new EmField('ir', n, null, 1);
    this.rad = new EmField('micro', n); this.tpms = new EmField('micro', n);
  },
  update() { const { t, T } = S, cam = S.camera.position, lights = sm(6, 12, t), Z0 = -900, L = 1600;
    for (const [ci, c] of this.cars.entries()) {
      const s = ((c.z0 * L + c.dir * c.v * t * 2) % L + L) % L, z = Z0 + s;           // position along the loop, script-time driven
      const fade = sm(Z0, Z0 + 150, z) * (1 - sm(Z0 + L - 150, Z0 + L, z));          // vanish only far away
      c.G.position.set(c.x, 0, z); c.G.rotation.y = c.dir > 0 ? 0 : Math.PI; c.G.updateMatrix();
      this.body.setMatrixAt(ci, fade > .01 ? c.G.matrix : this.hidden);
      if (fade <= .01) continue;
      const fw = new V3(0, 0, c.dir), side = new V3(1, 0, 0), toCam = cam.clone().sub(c.G.position).normalize(), face = fw.dot(toCam);
      const front = c.G.position.clone().addScaledVector(fw, 2.25), back = c.G.position.clone().addScaledVector(fw, -2.25);
      const hI = (.25 + .75 * lights) * Math.max(0, face) ** .5 * fade, tI = (.3 + .7 * lights) * Math.max(0, -face) ** .5 * fade;
      for (let k = 0; k < 2; k++) { const o = side.clone().multiplyScalar(k ? .65 : -.65);
        this.hl.set(ci * 2 + k, front.clone().add(o).setY(.7), .9, hI * 1.2); this.tl.set(ci * 2 + k, back.clone().add(o).setY(.8), .5, tI * .9); }
      c.ex.set([back.clone().setY(.35), back.clone().addScaledVector(fw, -1.6).setY(.6)], .5, .9, .4 * fade);
      this.hot.set(ci, c.G.position.clone().addScaledVector(fw, 1.3).setY(.8), 1.8, .35 * fade);
      this.rad.set(ci, front.clone().setY(.5), .8, (.25 + .3 * Math.max(0, Math.sin(T * 7 + c.z0 * 40))) * fade);
      const tp = burst(t, c.tp, c.tph, .35);                                        // TPMS: a short chirp from one wheel
      if (tp > 0) this.tpms.set(ci, c.G.position.clone().addScaledVector(fw, hash2(ci, Math.floor((t + c.tph) / c.tp)) < .5 ? 1.4 : -1.4).add(new V3(.9 * Math.sign(cam.x - c.x), .35, 0)), .9, tp * .7 * fade);
    }
    this.body.instanceMatrix.needsUpdate = true; },
  where: () => null });

function mergeBoxes(a, b) {
  const g = new THREE.BufferGeometry(), pa = a.toNonIndexed(), pb = b.toNonIndexed();
  for (const k of ['position', 'normal']) {
    const A = pa.attributes[k].array, B = pb.attributes[k].array, out = new Float32Array(A.length + B.length);
    out.set(A); out.set(B, A.length); g.setAttribute(k, new THREE.BufferAttribute(out, 3));
  }
  return g;
}

// Fireworks over the park at the end of the walk.
export const fireworks = () => event({ name: 'Fireworks', t0: 50, t1: 60, bands: ['vis', 'ir'], freq: ['strontium', 'thermal1200'], note: 'Metal salts burn in bright colours; the shells and burning stars are hot in infrared too.',
  init() { this.b = Array.from({ length: 8 }, (_, i) => {
    const c = new V3((R() - .5) * 240, 85 + R() * 70, PARK_Z - 230 - R() * 160), hue = R();
    return { t0: 50.2 + i * 1.15 + R() * .4, c, col: '#' + new THREE.Color().setHSL(hue, 1, .62).getHexString(),
      dirs: Array.from({ length: 24 }, () => new V3(R() - .5, R() - .5, R() - .5).normalize()), sp: 22 + R() * 14,
      trail: new Rib('vis', '#ffd9a0', 2), flash: null, ir: new Em('ir') }; });
    this.stars = new EmField('vis', this.b.length * 24);
    this.b.forEach((b, bi) => { b.flash = new Em('vis', b.col); b.base = bi * 24; b.dirs.forEach((_, k) => this.stars.color(b.base + k, b.col)); });
    this.p = null; },
  update() { const { t } = S; this.p = null;
    for (const b of this.b) { const age = t - b.t0; if (age < -.9 || age > 2.6) continue;
      if (age < 0) { const f = 1 + age / .9, base = new V3(b.c.x, 0, b.c.z), head = base.clone().lerp(b.c, f);   // rising shell
        b.trail.set([base.clone().lerp(b.c, Math.max(0, f - .25)), head], .6, .6, .8, 1); b.ir.set(head, 4, .5); continue; }
      this.p = b.c; const I = 1 - sm(.6, 2.6, age);
      b.flash.set(b.c, 30 * (1 - sm(0, .3, age)) + 8, (1 - sm(0, .4, age)) * 1.4);
      b.dirs.forEach((d, k) => { const r = b.sp * (1 - Math.exp(-age * 2.2)); this.stars.set(b.base + k, b.c.clone().addScaledVector(d, r).add(new V3(0, -2.5 * age * age, 0)), 3.2, I * 1.3); });
      b.ir.set(b.c, 40 * (.4 + age * .3), I * .5); } },
  where() { return this.p; } });
