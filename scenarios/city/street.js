// More street life for the city: buses, cyclists, swifts and bats, a rooftop bar, black-light UV,
// the natural gamma of the granite kerbs and a delivery drone. Appended after the original list in
// main.js, so their seeded R() draws come last and the rest of the layout is unchanged.
import * as THREE from 'three';
import { V3, sm, env, R, hash2 } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { Em, Rib, EmField } from 'spectra/render/sources.js';
import { spectralParts, partsGeometry, PRESET } from 'spectra/render/surface.js';
import { inWin, burst } from './events.js';
import { FACE_X, PARK_Z, KERBS, BAR, SIGNS, LAMPS, PAINT } from './world.js';

// ---------------------------------------------------------------- bodies by parts (M11/T4)
// People and vehicles built from parts, each with its own surface (engine/render/surface.js partsGeometry): bare faces
// and hands warm (skin), clothes between skin and air (coat), hair insulating (fur); running tyres, the panel over an
// engine and the tailpipe hot, window glass cold (it mirrors the sky at 8–14 µm), painted steel (PAINT) cooling.
// Exported for the crowd and scooters (rf.js) and the police car (life.js). Local frame: forward is +z.
const SPH = new THREE.SphereGeometry(1, 10, 7), BOX = new THREE.BoxGeometry(1, 1, 1);
const box = (s, at, surf, col) => ({ g: BOX, s, at, surf, col });
const wheel = (r, w, at, surf = 'tyre', col = 0x101010) => ({ g: new THREE.CylinderGeometry(r, r, w, 14), rot: [0, 0, Math.PI / 2], at, surf, col });
const rim = (r, at, surf) => ({ g: new THREE.TorusGeometry(r, .025, 5, 18), rot: [0, Math.PI / 2, 0], at, surf, col: 0x101010 });
// the tyres of a bicycle or a scooter's front wheel roll lightly loaded: at the air's temperature — STAND-IN (the tyre
// row of surface.js, cooling as the street does, 22 → 14 °C)
const COLD_TYRE = { ...PRESET.tyre, A: [22, 14, 1 / 20, PRESET.tyre.A[3]] };
const V = (...a) => new THREE.Vector3(...a), mid = (a, b) => a.clone().add(b).multiplyScalar(.5);
// a person: hip [y, z], torso lean (z offset of the shoulders), feet / hands [[y, z] left, [y, z] right]
function person({ hip, lean = 0, feet, hands, top = 0x2e3440, legs = 0x1c2230 }) {
  const P = [], skin = 0x8a6a58, L = (a, b, r0, r1, surf, col) => P.push({ from: a.toArray(), to: b.toArray(), r0, r1, surf, col });
  const H = V(0, hip[0], hip[1]), Sh = H.clone().add(V(0, .52, lean)), Hd = Sh.clone().add(V(0, .2, lean * .3));
  P.push({ g: SPH, s: [.17, .3, .12], rot: [Math.atan2(lean, .52), 0, 0], at: mid(H, Sh).toArray(), surf: 'coat', col: top });   // torso
  L(Sh, Sh.clone().add(V(0, .1, lean * .1)), .05, .05, 'skin', skin);                                                       // neck
  P.push({ g: SPH, s: [.095, .12, .105], at: Hd.toArray(), surf: 'skin', col: skin },                                         // face / head
    { g: SPH, s: [.1, .075, .11], at: Hd.clone().add(V(0, .055, -.02)).toArray(), surf: 'fur', col: 0x1a120c });           // hair
  [-1, 1].forEach((sd, i) => {
    const hp = H.clone().add(V(sd * .1, 0, 0)), ft = V(sd * .11, feet[i][0], feet[i][1]), kn = mid(hp, ft).add(V(0, 0, .1));
    L(hp, kn, .08, .065, 'coat', legs); L(kn, ft, .06, .05, 'coat', legs);
    P.push(box([.1, .08, .25], ft.clone().add(V(0, -.02, .06)).toArray(), 'coat', 0x141414));                                  // shoe
    const sh = Sh.clone().add(V(sd * .21, -.04, 0)), hd = V(sd * .22, hands[i][0], hands[i][1]), el = mid(sh, hd).add(V(sd * .03, -.04, -.06));
    L(sh, el, .05, .045, 'coat', top); L(el, hd, .045, .04, 'coat', top);
    P.push({ g: SPH, s: [.045, .05, .045], at: hd.toArray(), surf: 'skin', col: skin });                                       // hand
  });
  return P;
}
// a pedestrian in mid-stride (no walk cycle: they glide, too far to tell at most distances)
export const walkerGeo = () => partsGeometry(person({ hip: [.93, 0], feet: [[.06, .3], [.06, -.25]], hands: [[.88, -.18], [.88, .2]] }));
// a cyclist on a city bike: steel frame (PAINT), tyres at the air's temperature
export const cyclistGeo = () => partsGeometry([
  ...person({ hip: [1.0, -.28], lean: .32, feet: [[.32, .06], [.62, -.08]], hands: [[1.06, .42], [1.06, .42]], top: 0x3a4a3a }),
  rim(.34, [0, .34, .52], COLD_TYRE), rim(.34, [0, .34, -.52], COLD_TYRE),
  ...[[[0, .34, -.52], [0, .48, 0]], [[0, .48, 0], [0, .95, -.3]], [[0, .48, 0], [0, .92, .38]], [[0, .92, .38], [0, .34, .52]], [[0, .95, -.3], [0, .34, -.52]], [[0, .92, .38], [0, 1.06, .42]]]
    .map(([a, b]) => ({ from: a, to: b, r0: .02, surf: PAINT, col: 0x30343a })),
  box([.5, .03, .03], [0, 1.06, .42], PAINT, 0x202020), box([.12, .05, .24], [0, .97, -.3], 'coat', 0x101010),   // bars, saddle
]);
// a rider standing on an e-scooter: the rear hub motor runs warm (the tyre row, STAND-IN), the front wheel at air T
export const scooterGeo = () => partsGeometry([
  ...person({ hip: [1.08, -.05], lean: .08, feet: [[.18, .12], [.18, -.2]], hands: [[1.1, .42], [1.1, .42]], top: 0x40302a }),
  box([.16, .05, .9], [0, .12, 0], PAINT, 0x1a1a1a), { from: [0, .12, .42], to: [0, 1.08, .4], r0: .025, surf: PAINT, col: 0x202020 },
  box([.45, .03, .03], [0, 1.1, .4], PAINT, 0x202020), wheel(.1, .05, [0, .1, .45], COLD_TYRE), wheel(.1, .05, [0, .1, -.45], 'tyre'),
]);
// a car: painted steel body, the bonnet over the running engine hot, glass cabin, four running tyres, a tailpipe
export const carGeo = (col = 0x101418, bar = false) => partsGeometry([
  ...(bar ? [box([1.1, .12, .25], [0, 1.59, -.3], PAINT, 0x1a2040)] : []),   // a police light bar
  box([1.8, .62, 4.4], [0, .62, 0], PAINT, col), box([1.7, .05, 1.25], [0, .94, 1.5], 'engine', col),
  box([1.55, .55, 2.2], [0, 1.2, -.25], 'glass', 0x0c1218), box([1.5, .06, 1.75], [0, 1.5, -.3], PAINT, col),
  ...[[.82, 1.35], [-.82, 1.35], [.82, -1.35], [-.82, -1.35]].map(([x, z]) => wheel(.33, .22, [x, .33, z])),
  { g: new THREE.CylinderGeometry(.035, .035, .25, 6), rot: [Math.PI / 2, 0, 0], at: [.5, .28, -2.25], surf: 'exhaust', col: 0x303030 },
]);
// a 12 m city bus (the lit window band and the windscreens are a separate glass draw, busWindows): diesel with the hot
// rear engine cover and exhaust stack, or battery-electric with the roof pack (its warmth is the event's source)
const busGeo = diesel => partsGeometry([
  box([2.55, 2.85, 12], [0, 1.78, 0], PAINT, 0x2c3a44), box([2.6, .35, .15], [0, .55, 6.03], PAINT, 0x15181c), box([2.6, .35, .15], [0, .55, -6.03], PAINT, 0x15181c),
  ...[[1.12, 3.6], [-1.12, 3.6], [1.12, -2.9], [-1.12, -2.9]].map(([x, z]) => wheel(.5, .32, [x, .5, z])),
  ...(diesel ? [box([2.2, 1, .06], [0, 1.0, -6.02], 'engine', 0x22282c), { from: [1.0, 3.1, -5.4], to: [1.0, 3.75, -5.4], r0: .07, surf: 'exhaust', col: 0x303030 }]
    : [box([2.1, .3, 4.5], [0, 3.35, 1], PAINT, 0x3a4650)]),
]);
const busWindows = () => partsGeometry([box([2.6, .95, 11], [0, 2.25, -.2], 'glass', 0xd4dce6), box([2.3, 1.5, .06], [0, 2.0, 6.02], 'glass', 0xb8c4d0), box([2.2, .8, .06], [0, 2.45, -6.02], 'glass', 0x9aa4b0)]);

// ---------------------------------------------------------------- buses
// One old diesel and two battery-electric buses on the outer lanes. The lesson is in IR: only the diesel carries a
// hot exhaust stack; the electric ones show a faintly warm roof battery pack and nothing at the rear.
export const buses = () => event({ name: 'Buses: diesel & electric', t0: 0, t1: 60, bands: ['vis', 'ir', 'micro'], freq: ['ledWhite', 'ledRed', 'ledAmber', 'thermal700', 'batteryWarm', 'wifi24', 'lte'], note: 'City buses work the avenue. The old diesel has a hot exhaust stack at the rear of its roof (bright in IR); the battery-electric ones have no exhaust at all, only a faintly warm battery pack on the roof. All carry LED-lit interiors, an amber LED destination sign and an onboard Wi-Fi/LTE router.',
  init() {
    this.b = [{ x: -5.3, dir: 1, z0: .12, v: 4.5, diesel: true }, { x: 5.3, dir: -1, z0: .58, v: 4.2, diesel: false }, { x: -5.3, dir: 1, z0: .78, v: 4.8, diesel: false }];
    const n = this.b.length;
    // bodies by parts (M11/T4): one instanced draw for the diesel, one for the electric buses, one for all windows
    const bm = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .3 }), nd = this.b.filter(b => b.diesel).length;
    this.bodies = [new THREE.InstancedMesh(busGeo(true), bm(), nd), new THREE.InstancedMesh(busGeo(false), bm(), n - nd)];
    let k = [0, 0]; this.b.forEach(b => { b.m = b.diesel ? 0 : 1; b.k = k[b.m]++; });
    this.win = new THREE.InstancedMesh(busWindows(), new THREE.MeshBasicMaterial({ vertexColors: true }), n);   // lit from inside; glass in IR
    for (const m of [...this.bodies, this.win]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; S.scene.add(spectralParts(m, { weight: 0 })); }
    this.G = new THREE.Object3D(); this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this.hl = new EmField('vis', n * 2, '#fff4dc'); this.tl = new EmField('vis', n * 2, '#ff2a1a'); this.dest = new EmField('vis', n, '#ffb030');
    this.hot = new EmField('ir', n, null, 1); this.ex = this.b.map(() => new Rib('ir', null, 4, 1)); this.rt = new EmField('micro', n);
  },
  update() { const { t } = S, cam = S.camera.position, Z0 = -900, L = 1600, lights = sm(6, 12, t);
    this.b.forEach((b, i) => {
      const z = Z0 + ((b.z0 * L + b.dir * b.v * t * 2) % L + L) % L, fade = sm(Z0, Z0 + 150, z) * (1 - sm(Z0 + L - 150, Z0 + L, z));
      this.G.position.set(b.x, 0, z); this.G.rotation.y = b.dir > 0 ? 0 : Math.PI; this.G.updateMatrix();
      const show = fade > .01 && inWin(this);
      this.bodies[b.m].setMatrixAt(b.k, show ? this.G.matrix : this.hidden); this.win.setMatrixAt(i, show ? this.G.matrix : this.hidden);
      if (!show) return;
      const fw = new V3(0, 0, b.dir), face = fw.dot(cam.clone().sub(this.G.position).normalize());
      const front = this.G.position.clone().addScaledVector(fw, 6.05), back = this.G.position.clone().addScaledVector(fw, -6.05);
      for (let k = 0; k < 2; k++) { const o = new V3(k ? .95 : -.95, 0, 0);
        this.hl.set(i * 2 + k, front.clone().add(o).setY(.75), 1, (.3 + .7 * lights) * Math.max(0, face) ** .5 * fade * 1.2);
        this.tl.set(i * 2 + k, back.clone().add(o).setY(.9), .55, (.3 + .7 * lights) * Math.max(0, -face) ** .5 * fade); }
      this.dest.set(i, front.clone().setY(2.95), 1.4, (.4 + .5 * lights) * Math.max(0, face) ** .3 * fade);
      if (b.diesel) {
        const st = back.clone().addScaledVector(fw, .6).setY(3.3);
        this.ex[i].set([st, st.clone().add(new V3(0, .7, 0)), st.clone().addScaledVector(fw, -1.6).setY(4.6)], .35, 1.1, .55 * fade, 1);
        this.hot.set(i, back.clone().addScaledVector(fw, 1.5).setY(1), 2.2, .45 * fade, 0);   // the parts engine cover is the emitter in the eye (render rule 3)
      } else this.hot.set(i, this.G.position.clone().setY(3.35), 3, .16 * fade);   // roof battery pack, barely warm
      this.rt.set(i, this.G.position.clone().setY(2.9), 1.2, (.25 + .6 * burst(t, 1.7 + i * .4, i * 3.1, .3)) * fade);
    });
    for (const m of [...this.bodies, this.win]) m.instanceMatrix.needsUpdate = true; },
  where: () => null });

// ---------------------------------------------------------------- cyclists
export const cyclists = () => event({ name: 'Cyclists', t0: 0, t1: 60, bands: ['vis', 'ir'], freq: ['ledWhite', 'ledRed', 'thermal310'], note: 'Cyclists ride along the kerbs: a white LED up front (some flashing), a red one behind, and a warm body that a thermal camera picks out long before the lights come on.',
  init() {
    this.c = Array.from({ length: 12 }, () => { const s = R() < .5 ? 1 : -1; return { x: s * (6.15 + R() * .4), dir: -s, z0: R(), v: 4 + R() * 2.5, flash: R() < .35, ph: R() * 6 }; });
    this.f = new EmField('vis', this.c.length, '#f4f6ff'); this.r = new EmField('vis', this.c.length, '#ff2418'); this.b = new EmField('ir', this.c.length, null, 1);
    this.m = new THREE.InstancedMesh(cyclistGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7 }), this.c.length);   // riders and bikes by parts (M11/T4): one draw
    this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.m.frustumCulled = false; S.scene.add(spectralParts(this.m, { weight: 0 }));
    this.O = new THREE.Object3D(); this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  },
  update() { const { t, T } = S, cam = S.camera.position, lights = sm(7, 11, t);
    this.c.forEach((_, k) => this.m.setMatrixAt(k, this.hidden)); this.m.instanceMatrix.needsUpdate = true;
    if (!inWin(this)) return;
    this.c.forEach((c, k) => {
      const z = -220 + ((c.z0 * 520 + c.dir * c.v * t * 1.6) % 520 + 520) % 520;
      if (Math.abs(z - cam.z) > 150) return;
      this.O.position.set(c.x, 0, z); this.O.rotation.set(0, c.dir > 0 ? 0 : Math.PI, 0); this.O.updateMatrix(); this.m.setMatrixAt(k, this.O.matrix);
      const p = new V3(c.x, 1.1, z), fw = new V3(0, 0, c.dir), face = fw.dot(cam.clone().sub(p).normalize());
      this.b.set(k, p, 1.2, .38, 0);   // parts rider: metered, not seen in the eye (render rule 3)
      const fl = c.flash ? (Math.sin(T * 12 + c.ph) > 0 ? 1 : .1) : 1;
      this.f.set(k, p.clone().addScaledVector(fw, .9).setY(.95), .5, lights * fl * Math.max(0, face) ** .5);
      this.r.set(k, p.clone().addScaledVector(fw, -.8).setY(.8), .35, lights * Math.max(0, -face) ** .5 * .9);
    }); },
  where: () => null });

// ---------------------------------------------------------------- swifts & bats
// Swifts scream over the roofs at dusk and go up to roost on the wing; bats take over the park later.
export const swifts = () => event({ name: 'Swifts over the roofs', t0: 0, t1: 20, bands: ['ir'], freq: ['thermal310'], note: 'A screaming party of swifts races over the rooftops at dusk before climbing out of sight: warm-blooded specks that a thermal camera follows against the cold sky.',
  init() { this.s = Array.from({ length: 26 }, () => ({ r: 18 + R() * 40, y: 28 + R() * 30, w: .5 + R() * .7, ph: R() * 6.28, dz: R() * 60 })); this.f = new EmField('ir', this.s.length, null, 1); },
  update() { const { t, T } = S, cam = S.camera.position, I = env(t, 0, 20, 3); if (I <= 0) return;
    this.s.forEach((q, k) => {
      const a = T * q.w + q.ph, climb = sm(14, 20, t) * 40;
      this.f.set(k, new V3(Math.cos(a) * q.r * .5, q.y + climb + Math.sin(a * 2.3) * 4, cam.z - 30 - q.dz + Math.sin(a) * q.r), .9, I * .45);
    }); },
  where: () => null });

export const bats = () => event({ name: 'Bats at the park lamps', t0: 24, t1: 54, bands: ['ir'], freq: ['thermal310'], note: 'Pipistrelles hunt the moths that crowd the old sodium lamps of the park paths. Invisible against the night sky, obvious in IR.',
  init() { this.b = Array.from({ length: 12 }, () => ({ k: R(), r: 1.5 + R() * 3, w: 2 + R() * 2.5, ph: R() * 6.28, h: R() * 3 })); this.f = new EmField('ir', this.b.length, null, 1);
    this.lamps = LAMPS.filter(l => !l.led && l.p.z < PARK_Z); },
  update() { const { t, T } = S, cam = S.camera.position, I = env(t, 24, 54, 2); if (I <= 0 || !this.lamps.length) return;
    const ahead = this.lamps.filter(l => l.p.z < cam.z - 6 && l.p.z > cam.z - 90);
    if (!ahead.length) return;
    this.b.forEach((b, k) => {
      const l = ahead[Math.floor(b.k * ahead.length)], a = T * b.w + b.ph;
      this.f.set(k, l.p.clone().add(new V3(Math.cos(a) * b.r, -.5 + b.h * Math.sin(a * 1.7) * .5, Math.sin(a * 1.3) * b.r)), .35, I * .5);
    }); },
  where: () => null });

// ---------------------------------------------------------------- rooftop bar
export const rooftopBar = () => event({ name: 'Rooftop bar', t0: 12, t1: 60, bands: ['vis', 'ir', 'micro'], freq: ['incandescent', 'heaterGlow', 'thermal1200', 'thermal310', 'lte', 'wifi24'], note: 'Up on a low roof across the avenue a bar opens: strings of warm bulbs, two gas patio heaters glowing red-hot (searing in IR), warm guests along the parapet and their phones busy on LTE and the bar Wi-Fi.',
  init() {
    const { z0, z1, h } = BAR;
    this.bulbs = Array.from({ length: 30 }, (_, i) => { const u = i / 29; return new V3(-FACE_X - 1.4, h + 2.6 - Math.sin(u * Math.PI * 3 % Math.PI) * .45, z0 + u * (z1 - z0)); });
    this.guests = Array.from({ length: 12 }, () => ({ p: new V3(-FACE_X - 1.2 - R() * 4.5, h + 1.45, z0 + 1 + R() * (z1 - z0 - 2)), per: 3 + R() * 6, ph: R() * 9 }));
    this.heat = [.3, .72].map(u => new V3(-FACE_X - 3.2, h + 2.2, z0 + u * (z1 - z0)));
    this.v = new EmField('vis', this.bulbs.length, '#ffc27a'); this.g = new EmField('ir', this.guests.length, null, 1); this.ph = new EmField('micro', this.guests.length);
    this.hv = this.heat.map(() => new Em('vis', '#ff5a1e')); this.hi = this.heat.map(() => new Em('ir')); this.ap = new Em('micro');
  },
  update() { const { t, T } = S; if (!inWin(this)) return;
    const on = sm(12, 15, t), busy = sm(14, 26, t);
    this.bulbs.forEach((p, k) => this.v.set(k, p, .55, on * (.8 + .2 * Math.sin(T * 3 + k))));
    this.guests.forEach((q, k) => { if (hash2(k, 5) > busy) return;
      this.g.set(k, q.p, 1, .4); const b = burst(t, q.per, q.ph, .25); if (b > .02) this.ph.set(k, q.p.clone().setY(q.p.y - .3), .6, b * .7); });
    this.heat.forEach((p, k) => { const w = sm(13 + k, 18 + k, t); this.hv[k].set(p, .9, w * .7); this.hi[k].set(p.clone().setY(p.y - .6), 3.2, w * .8); });
    this.ap.set(new V3(-FACE_X - 2, BAR.h + 2.2, (BAR.z0 + BAR.z1) / 2), 1.2, on * (.3 + .5 * burst(t, .9, .2, .3))); },
  where() { return BAR.p.clone().setY(BAR.h + 2.4); } });

// ---------------------------------------------------------------- UV
// A black-light insect trap at a takeaway on the north sidewalk and UV decor lights up at the bar.
export const blackLight = () => event({ name: 'Black light & bug zapper', t0: 10, t1: 60, bands: ['uv', 'vis'], freq: ['blacklight365', 'hg405', 'arcLight', 'airArcUV'], note: 'A takeaway hangs an insect trap over its door: a 365 nm black-light tube (UVA, the eye sees only the faint violet mercury line leaking through) and a steel grid that cracks with a blue-white spark in air every time a moth hits it (its UV is nitrogen\'s 337 nm band). The rooftop bar uses black lights as decor.',
  init() {
    const s = SIGNS.filter(q => q.p.x > 0 && q.p.z > 10 && q.p.z < 70).sort((a, b) => b.p.z - a.p.z)[0] || SIGNS[0];
    this.p = s.p.clone().setY(2.9); this.p.x -= .25;
    this.bar = new V3(-FACE_X - 2.6, BAR.h + 2.4, BAR.z0 + .5 * (BAR.z1 - BAR.z0));
    this.uv = new Em('uv'); this.vi = new Em('vis', '#8a5cff'); this.zv = new Em('vis', '#d8e8ff'); this.zu = new Em('uv'); this.bu = new Em('uv');
  },
  update() { const { t } = S; if (!inWin(this)) return;
    const on = sm(10, 12, t);
    this.uv.set(this.p, 1.4, on * .9); this.vi.set(this.p, .7, on * .35);
    const slot = Math.floor(t * 8), zap = hash2(slot, 41) < .07 * sm(14, 24, t) ? 1 - (t * 8 - slot) : 0;   // more moths later
    if (zap > 0) { this.zv.set(this.p, .9, zap * 1.3); this.zu.set(this.p, 1.1, zap); }
    this.bu.set(this.bar, 1.6, sm(14, 17, t) * .55); },
  where() { return this.p; } });

// ---------------------------------------------------------------- gamma
// Granite kerbs (K-40, U and Th series) are the most radioactive stone in the street. Each blip is one photon a
// detector at your feet would count; the blip rate is illustrative, not a measured count rate.
export const stoneGamma = () => event({ name: 'Granite kerbs: natural gamma', t0: 0, t1: 60, bands: ['gamma'], freq: ['k40Gamma', 'tl208Gamma', 'bi214Gamma'], note: 'The granite kerbstones carry potassium-40 and traces of uranium and thorium; their gamma rays (609 keV to 2.6 MeV) reach a detector right through the air. Each blip along the kerb beside you stands for a counted photon (the rate is illustrative) — the street is quietly radioactive all night, roughly two to three times the concrete and far more than the sea.',
  init() { this.f = new EmField('gamma', 24); },
  update() { const { t } = S, cam = S.camera.position; if (!inWin(this)) return;
    for (let k = 0; k < 24; k++) {
      const b = Math.floor(t * 10 + k * .37), u = t * 10 + k * .37 - b;
      if (hash2(b, k) > .3) continue;
      const kb = KERBS[hash2(b, k + 50) < .7 ? 1 : 0], z = cam.z - 3 - hash2(b, k + 99) * 40;   // mostly the near kerb
      if (z < kb.z0 || z > kb.z1) continue;
      this.f.set(k, new V3(kb.x, .16, z), .35 + .3 * hash2(b, k + 7), (1 - u) * .8);
    } },
  where: () => null });

// ---------------------------------------------------------------- drone
export const drone = () => event({ name: 'Delivery drone', t0: 24, t1: 58, bands: ['vis', 'ir', 'micro'], tags: ['rare'], freq: ['navRed', 'navGreen', 'ledWhite', 'batteryWarm', 'droneLink', 'droneVideo'], note: 'A delivery drone crosses the park and follows the avenue at roof height: red/green position lights and a white anti-collision strobe, four warm motors and battery in IR, a 2.4 GHz control link and a 5.8 GHz video downlink in microwave. Rare: night-time delivery flights over a city are exceptional under the EASA drone rules.',
  init() { this.r = new Em('vis', '#ff2020'); this.g = new Em('vis', '#20ff60'); this.w = new Em('vis', '#ffffff'); this.h = new Em('ir', null, 1); this.c = new Em('micro'); this.v = new Em('micro', '#fff0a0'); this.p = null; },
  update() { const { t, T } = S; this.p = null; if (!inWin(this)) return;
    const u = (t - 24) / 34, I = env(t, 24, 58, 1.5), p = new V3(-2 + 3 * Math.sin(u * 5), 34 + 3 * Math.sin(T * .6), PARK_Z - 420 + u * 700);
    this.p = p;
    this.r.set(p.clone().add(new V3(-.6, 0, 0)), .6, I * .9); this.g.set(p.clone().add(new V3(.6, 0, 0)), .6, I * .9);
    if (T % 1.2 < .08) this.w.set(p.clone().setY(p.y - .2), 1.4, I * 1.4);
    this.h.set(p, 1.3, I * .45);
    this.c.set(p, .9, I * burst(t, .5, 0, .12) * .8); this.v.set(p.clone().setY(p.y - .3), 1.4, I * .45); },
  where() { return this.p; } });
