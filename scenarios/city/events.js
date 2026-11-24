// Events that belong to the city (sky events come from the engine library). The radio/microwave
// ecosystem lives in rf.js, the smaller visible/IR street life in life.js.
import * as THREE from 'three';
import { V3, sm, R, hash2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { Em, Rib, EmField, BEAM, toViewer } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { addTx, spectralParts } from 'spectra/render/surface.js';
import { night, moonlit } from 'spectra/world/atmosphere.js';
import { BUILD, LAMPS, FLATS, PARK_Z, MAST, LIGHT, POOL_FADE } from './world.js';
import { carGeo } from './street.js';

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
const HPS_NIR = .5;   // near-IR / visible of a high-pressure sodium lamp relative to sunlight's — STAND-IN (streetLights)
const LAMP_LUX = 260;   // lamp intensity scale of the streetLight() term (tuned by eye: asphalt under a lamp mid-dark, no bloom)
export const litNow = t => .06 + .5 * sm(6, 24, t);      // fraction of lit windows (shared with the window shader)

export const windows = () => event({ name: 'Lit windows & heat island', t0: 0, t1: 60, bands: ['vis', 'ir'], freq: ['incandescent', 'ledWhite', 'thermal290'], note: 'Windows and shop fronts light up; on a thermal camera the facades leak heat around the window frames while the glass mirrors the cold sky.',
  update() { const { t } = S, lit = litNow(t);
    BUILD.lit.value = lit; BUILD.shop.value = .25 + .75 * sm(4, 12, t);
    S.act.vis += lit * .8 + BUILD.shop.value * .3; S.act.ir += .25; },
  where: () => null });

// Half of the avenue has been re-lamped with white LEDs (no infrared); the rest are old high-pressure sodium lamps
// that strike a dim bluish-white, warm up to orange over several minutes and radiate strongly at 819 nm.
export const streetLights = () => event({ name: 'Street lights', t0: 8, t1: 60, bands: ['vis', 'ir'], freq: ['na589', 'na819', 'ledWhite'], tags: ['time-compressed'], note: 'A mix of new white LED lamps (they switch on instantly, no infrared) and old high-pressure sodium lamps: they strike with a dim bluish-white glow and warm up to orange (minutes in reality, compressed here), with a strong near-infrared line at 819 nm.',
  init() { this.v = new EmField('vis', LAMPS.length); this.i = new EmField('ir', LAMPS.length); this.c = new THREE.Color(); this.lc = LAMPS.map(() => new THREE.Color());
    // near-IR (M11/T6): the sodium lamps light the street for night vision too (surface.js addTx('nir'); the eye's
    // near-IR channel). High-pressure sodium radiates the Na 818.3 / 819.5 nm doublet and a near-IR continuum next to
    // its visible lines (Elvidge et al. 2010, Sensors 10:3961, Fig. 4; de Groot & van Vliet 1986, The High-Pressure
    // Sodium Lamp) — near-IR / visible .5 of sunlight's (STAND-IN within those spectra); white LEDs emit nothing past
    // ~750 nm (Elvidge 2010), so they are not registered. Power = the lamp's visible street-light term at 1 m
    // (LAMP_LUX × its luminance, world.js streetLight) × that ratio; no cutoff optics in surfNIR (STAND-IN).
    this.nir = LAMPS.map(() => 0);
    LAMPS.forEach((l, k) => { if (!l.led) addTx('nir', () => (this.nir[k] > 0 ? { p: l.p, power: this.nir[k] } : null)); }); },
  update() { const { t, T } = S, cam = S.camera.position; let sum = 0;
    LAMPS.forEach((l, k) => {
      const t0 = 9 + l.k * 4;
      if (l.led) { const on = t > t0 ? 1 : 0; sum += on; this.v.color(k, '#eef3ff'); this.v.set(k, l.p, 2.1, on * 1.15); this.lc[k].setRGB(.9, .95, 1).multiplyScalar(on); return; }
      const warm = sm(t0, t0 + 6, t), strike = t > t0 ? 1 : 0, fl = t < t0 + .8 ? .6 + .4 * Math.sin(T * 40 + k) : 1, I = strike * fl * (.25 + .85 * warm);
      sum += warm;
      this.v.color(k, this.c.setRGB(.7 + .3 * warm, .75 - .03 * warm, 1 - .65 * warm));    // HPS: dim bluish-white strike -> orange (pink-red is LPS)
      this.v.set(k, l.p, 2.4, I); this.i.set(k, l.p, 3.2, strike * warm * .3);
      this.lc[k].copy(this.c).multiplyScalar(I / 1.1);
      this.nir[k] = LAMP_LUX * HPS_NIR * (.2126 * this.lc[k].r + .7152 * this.lc[k].g + .0722 * this.lc[k].b) * warm;   // the 819 nm doublet needs the hot arc
    });
    const n = sum / Math.max(1, LAMPS.length); LAMPS.poolMat.color.setScalar(.8 * n);
    // the nearest lamps light the street surfaces per pixel (world.js streetLight); they hand over to the pool mesh
    // over the same distance band the pools fade in, so nothing pops
    const near = LAMPS.map((l, k) => ({ k, d: l.p.distanceTo(cam) })).sort((a, b) => a.d - b.d);
    LIGHT.uLampP.value.forEach((v, i) => {
      const q = near[i], c = LIGHT.uLampC.value[i]; if (!q) { c.set(0, 0, 0, 0); return; }
      const w = LAMP_LUX * (1 - sm(POOL_FADE[0], POOL_FADE[1], q.d)), lc = this.lc[q.k];
      v.set(LAMPS[q.k].p.x, LAMPS[q.k].p.y, LAMPS[q.k].p.z, 1); c.set(lc.r * w, lc.g * w, lc.b * w, w > 0 && lc.r + lc.g + lc.b > 0 ? 1 : 0);
    });
    // diffuse fill of the lit city at night (sky glow off the cloud deck, facades across the street), then moonlight
    const ng = night(), ml = moonlit();
    LIGHT.uCityAmb.value.setRGB(.08 * ng + .025 * ml, .066 * ng + .03 * ml, .054 * ng + .042 * ml); },
  where: () => null });

// Mobile mast on a rooftop on the south side of the avenue, just before the park.
export const cellTower = () => event({ name: '5G mast', t0: 0, t1: 60, bands: ['micro', 'vis'], freq: ['nr35', 'lte800', 'navRed'], note: 'Sector antennas on a rooftop beam microwave to every phone in the street. The red obstruction light is there because the mast stands under the approach to the airport beyond the park — ordinary rooftop masts don\'t carry one.',
  init() {
    this.big = new Em('micro'); this.pe = MAST.panels.map(() => new Em('micro')); this.red = new Em('vis', '#ff2020');
    addTx('micro', () => ({ p: MAST.panels[0], power: .6 }));      // paints the facades below in the microwave surface term
  },
  update() { const { T } = S;
    // spectral eye: each panel beams along its boresight (outward from the mast top) with the cited 3GPP sector
    // pattern (sources.js BEAM.sector: 65° wide, 4° downtilt); the old view's stylised load pulsing becomes its mean
    const azs = MAST.panels.map(q => Math.atan2(q.z - MAST.top.z, q.x - MAST.top.x)), vt = toViewer(MAST.top);
    this.big.set(MAST.top, Math.min(38, MAST.top.distanceTo(S.camera.position) * .1), .55, BEAM.sectors(vt.az, -vt.el, azs));   // no metre-wide crackle cells up close
    this.pe.forEach((e, k) => { const I = .5 + .5 * Math.max(0, Math.sin(T * 3 + k * 2.1)), v = toViewer(MAST.panels[k]);
      e.set(MAST.panels[k], 5, I, BEAM.sector(v.az - azs[k], -v.el) * .66 / I); });
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
      this.f.set(k, q.p, Math.min(q.shop ? 1.6 : 1.3, d * .1), .12 + b * .55);   // near ones shrink like the haze: a cell stays ~0.2°
      if (b > .3 && d < 45) near.push({ p: q.p, power: .25 * b, d });
    });
    near.sort((a, b) => a.d - b.d); this.near = near.slice(0, 3); },
  where: () => null });

// Cars on the avenue; it runs on through the park, so they appear and vanish far away.
export const traffic = () => event({ name: 'Traffic', t0: 0, t1: 60, bands: ['vis', 'ir', 'micro'], freq: ['ledWhite', 'navRed', 'thermal700', 'carRadar', 'tpms'], note: 'Headlights and tail lights, hot engines and exhausts, 77 GHz collision radar in every new car, and the tyre-pressure sensors in each wheel chirping at 433 MHz.',
  init() {
    const lanes = [[2.2, -1], [5.3, -1], [-2.2, 1], [-5.3, 1]];   // [x, direction along z]: westbound on the north (+x) side
    this.cars = [];
    for (const [x, dir] of lanes) for (let k = 0; k < 7; k++) {
      const col = new THREE.Color().setHSL(R(), .3 + R() * .3, .06 + R() * .12);
      this.cars.push({ G: new THREE.Object3D(), col, x: x + (R() - .5) * .4, dir, z0: k / 7 + R() * .08, v: 9 + R() * 5, ex: new Rib('ir', null, 3, 1), tp: 5 + R() * 6, tph: R() * 10 });
    }
    // bodies by parts (M11/T6, street.js carGeo: hot bonnet, running tyres, tailpipe, cold glass cabin, cooling paint),
    // one instanced draw; the paint is white in the geometry so the instance colour gives each car its own
    const n = this.cars.length, m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .4, metalness: .5 });
    const g = new THREE.InstancedMesh(carGeo(0xffffff), m, n); g.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.frustumCulled = false;
    this.cars.forEach((c, i) => g.setColorAt(i, c.col)); S.scene.add(spectralParts(g, { weight: 0 })); this.body = g;
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);   // one instanced field per light type for all cars
    this.hl = new EmField('vis', n * 2, '#fff4dc'); this.tl = new EmField('vis', n * 2, '#ff2a1a'); this.hot = new EmField('ir', n, null, 1);
    this.rad = new EmField('micro', n); this.tpms = new EmField('micro', n);
  },
  update() { const { t } = S, cam = S.camera.position, lights = sm(6, 12, t), Z0 = -900, L = 1600;
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
      this.hot.set(ci, c.G.position.clone().addScaledVector(fw, 1.3).setY(.8), 1.8, .35 * fade, 0);   // engine heat: metered; the eye sees the hot bonnet part (see 0)
      // 77 GHz radar (M11/T6 review): an FMCW chirp train (chirps of tens of µs, frames of ~50 ms) reads steady to any
      // camera frame — the old slow pulse (.25 + .3·max(0, sin)) is replaced by its mean .35 — and it looks forward:
      // a mid-range automotive radar panel, ~30° azimuth × ~10° elevation half-power beam (STAND-IN; ETSI EN 301 091 /
      // typical 76–77 GHz front radars), the 3GPP panel form of sources.js BEAM.sector, no tilt
      const rv = toViewer(front); this.rad.set(ci, front.clone().setY(.5), .8, .35 * fade, BEAM.sector(rv.az - Math.atan2(c.dir, 0), -rv.el, 0, 30 * Math.PI / 180, 10 * Math.PI / 180));
      const tp = burst(t, c.tp, c.tph, .35);                                        // TPMS: a short chirp from one wheel
      if (tp > 0) this.tpms.set(ci, c.G.position.clone().addScaledVector(fw, hash2(ci, Math.floor((t + c.tph) / c.tp)) < .5 ? 1.4 : -1.4).add(new V3(.9 * Math.sign(cam.x - c.x), .35, 0)), .9, tp * .7 * fade);
    }
    this.body.instanceMatrix.needsUpdate = true; },
  where: () => null });

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
