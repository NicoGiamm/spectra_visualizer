// Events that belong to the beach (sky events come from the engine library).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, DEG, lerp, sm, env, R } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { deg, dirAE, skyP, onSky } from 'spectra/core/geom.js';
import { Em, Rib, EmField, BEAM } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { SUN_AZ, sunEl } from 'spectra/world/atmosphere.js';
import { coastZ, heightAt, SEA, STAND, ENVSEA, COAST_STATION, CLIFF_ANT } from './world.js';
import { spectralGroup, spectralParts, partsGeometry, addTx } from 'spectra/render/surface.js';

// The last sliver of Sun flashes green as it drops under a sharp sea horizon (sunEl crosses 0 at t≈7.3).
export const greenFlash = () => event({ name: 'Green flash', t0: 6.4, t1: 8.6, bands: ['vis'], freq: ['greenFlash'], tags: ['rare'], note: 'Refraction splits the last sliver of the Sun over a clean sea horizon: a second of emerald.',
  init() { this.e = new Em('vis', '#5dff8a'); this.c = new Em('vis', '#b8ffd0'); },
  update() { const { t, T } = S, I = env(t, 6.6, 8.4, .5) * (.75 + .25 * Math.sin(T * 30)); this.p = skyP(SUN_AZ, Math.max(sunEl(), -.15) + .12);
    this.e.set(this.p, deg(1.1), I * 1.1); this.c.set(this.p, deg(.35), I * 1.4); },
  where() { return this.p; } });

export const warmSand = () => event({ name: 'Warm sand cooling', t0: 0, t1: 45, bands: ['ir'], freq: ['thermal290'], note: 'Sand soaked up the afternoon Sun and radiates it back as infrared; the sea, slower to change, stays cool.',
  init() { this.e = Array.from({ length: 14 }, () => { const x = (R() - .5) * 90, z = coastZ(x) + 6 + R() * 26; return { p: new V3(x, heightAt(x, z) + .1, z), s: 2.5 + R() * 3 }; }); this.f = new EmField('ir', this.e.length); },
  update() { const w = 1 - sm(0, 30, S.t);   // the beach surface cools by itself; these are the sun-baked hollows
    this.e.forEach((q, k) => this.f.set(k, q.p, q.s, w * .25)); },
  where: () => null });

// Gulls: warm bodies (realistic IR), dark silhouettes against the dusk.
export const gulls = () => event({ name: 'Gulls heading home', t0: 0, t1: 20, bands: ['ir', 'vis'], freq: ['thermal310', 'sunlight'], note: 'Warm-blooded gliders: dim shapes by eye, crisp heat signatures in infrared.',
  init() {
    const m = new THREE.MeshBasicMaterial({ color: 0x0a0a0e, side: THREE.DoubleSide }), wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.12, 0, 0, .12, -.7, .1, 0], 3));
    this.b = Array.from({ length: 9 }, () => { const G = new THREE.Group(), l = new THREE.Mesh(wg, m), r = new THREE.Mesh(wg, m); r.scale.x = -1; G.add(l, r); S.scene.add(solid(G)); G.visible = false;
      return { G, l, r, az: 230 + R() * 70, el: 4 + R() * 9, d: 40 + R() * 60, sp: .5 + R() * .6, ph: R() * 6, e: new Em('ir', null, 1) }; });
  },
  update() { const { t, T } = S, I = env(t, 0, 20, 2), c = S.camera.position;
    this.b.forEach(b => { b.G.visible = I > 0; if (I <= 0) return;
      const az = b.az + Math.sin(T * .25 * b.sp + b.ph) * 14 + t * 1.5, el = b.el + Math.sin(T * .4 + b.ph) * 1.5;
      const p = dirAE(az, el).multiplyScalar(b.d).add(c); b.G.position.copy(p); b.G.rotation.y = -az * DEG;
      const f = Math.sin(T * 6 * b.sp + b.ph) * .35; b.l.rotation.z = f; b.r.rotation.z = -f;
      b.e.set(p, .9, I * .45); }); },
  where: () => null });

// Light characteristic Fl(2) 10 s (IALA notation: a group of two flashes, period 10 s): a rotating optic with two
// lens panels 72° apart turning once per 10 s, so each panel's beam passes you 2 s after the other, then 8 s dark.
// The old 285–325 kHz marine radiobeacons are mostly retired; lights now announce themselves as AIS aids to
// navigation (message 21 on VHF AIS 1/2, ITU-R M.1371-5; nominal reporting interval 3 min, IMO MSC.1/Circ.1473; IALA G1062).
// An AIS packet (26.7 ms, ITU-R M.1371-5) drawn as a short pulse travelling from the sender to the coast station's AIS
// base-station mast (the eye: a smooth luminous segment; the old view: a run of radio dashes at a constant width, so
// they keep their aspect, uLen).
// The travel is slowed down for the eye (radio crosses the bay in ~10 µs): the events carry 'time-compressed'.
const packet = (rib, a, b, f, len, w, I) => {
  const L = a.distanceTo(b), u1 = Math.min(1, f * (1 + len / L)), u0 = Math.max(0, u1 - len / L);
  if (u1 > u0) rib.set([a.clone().lerp(b, u0), a.clone().lerp(b, u1)], w, w, I);
};
// Ship radar beams in azimuth (the eye, sources.js BEAM.sweep): θ3dB ≈ 70 λ/D — X-band 9.4 GHz from a ~2 m (6.5 ft)
// slotted array ≈ 1.1°, S-band 3.05 GHz from a ~3.7 m (12 ft) array ≈ 1.9° (typical SOLAS array lengths, STAND-IN);
// rotation rates are the event's own (2.4 and 2.1 rad/s). The old view keeps its widened cos^16 / cos^8 look.
const XB_HPBW = 1.1 * DEG, XB_W = 2.4, SB_HPBW = 1.9 * DEG, SB_W = 2.1;
const xband = off => BEAM.sweep(off, XB_HPBW, XB_W);
const FL_PERIOD = 10, FL_GAP = 2, FL_HALF = .15;   // s, s, rad (half-width of a beam: ~0.5 s flash)
const ATON_EVERY = 6;                            // s between drawn AIS bursts (real: ~180 s, time-compressed)
export const lighthouse = () => event({ name: 'Lighthouse', t0: 9, t1: 60, bands: ['vis', 'radio'], freq: ['incandescent', 'aisAtoN'], tags: ['time-compressed'],
  note: 'Its character is Fl(2) 10 s: two flashes in quick succession, then darkness, every 10 seconds, from two lens panels turning together. The sweeping beams show only through what scatters them, the salt haze over the sea and, late on, the mist, where they grow bright and short. The old MF radio beacon is gone; the light announces itself to ships as an AIS aid to navigation, short VHF bursts at 162 MHz (every few minutes in reality, more often here), picked up by the AIS base station on the headland.',
  init() {
    // On the cliff top of the north headland's southern shoulder, 25 m back from the edge: it marks the harbour approach
    // in the headland's lee and, like any coastal light, stands where it is seen from seaward, which here includes the
    // beach (the lantern clears the ridge line from the dune by ~15 m; the old site on the tip was hidden behind it).
    const x = 775, z = coastZ(x) + 25, y = heightAt(x, z), G = new THREE.Group(); G.position.set(x, y, z);
    const white = new THREE.MeshStandardMaterial({ color: 0xbfb8ae, roughness: .7 }), red = new THREE.MeshStandardMaterial({ color: 0x6a1410, roughness: .7 });
    for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.6 - i * .35, 2.95 - i * .35, 5, 16), i % 2 ? red : white); seg.position.y = 2.5 + i * 5; G.add(seg); }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 12), new THREE.MeshStandardMaterial({ color: 0x222226 })); lamp.position.y = 21.2; G.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 12), red); cap.position.y = 23.2; G.add(cap);
    S.scene.add(spectralGroup(G, 'concrete', { weight: .02 }));
    this.top = new V3(x, y + 21.2, z);
    addTx('radio', () => this.aisTx);
    this.beam = [new Rib('vis', '#fff1c8', 2), new Rib('vis', '#fff1c8', 2)]; this.flash = new Em('vis', '#fff6dc'); this.glow = new Em('vis', '#ffe6a8'); this.ra = new Em('radio');
    this.st = COAST_STATION.clone().add(new V3(0, 34, 0)); this.pk = new Rib('radio', null, 2);   // AtoN packet to the AIS base station
  },
  update() { const { t, T } = S, I = sm(9, 13, t); this.aisTx = null; if (I <= 0) return;
    const w = 2 * Math.PI / FL_PERIOD, a = T * w, cam = S.camera.position, toCam = Math.atan2(cam.z - this.top.z, cam.x - this.top.x);
    // A beam is only seen side-on through what scatters it out of the beam: the marine aerosol (sea-salt haze) is always
    // there, the late sea mist adds far more (Mie scattering by droplets), and the same droplets dim the beam with distance.
    const m = ENVSEA.mist.value, hz = .45 + 1.3 * m, reach = 700 * (1 - .35 * m);
    for (let k = 0; k < 2; k++) {                                                    // two panels, FL_GAP seconds apart
      const ak = a - k * w * FL_GAP, dir = new V3(Math.cos(ak), -.012, Math.sin(ak));
      this.beam[k].set([this.top.clone().addScaledVector(dir, reach), this.top], 60 + 30 * m, 6, I * .3 * hz, .75);   // brightest at the lantern, fading out
      const off = Math.abs(Math.atan2(Math.sin(ak - toCam), Math.cos(ak - toCam)));   // beam pointing at you -> blinding flash
      if (off < FL_HALF) this.flash.set(this.top, 60 * (1 - off / FL_HALF) + 6, I * 1.6 * (1 - off / FL_HALF));
    }
    this.glow.set(this.top, 7 + 26 * m, I * (.4 + .25 * m));                         // lantern off-axis; in mist a scattered aureole round it
    const ping = (T % ATON_EVERY) / ATON_EVERY, b = ping < .05 ? I * (1 - ping / .05) : 0;   // short AIS AtoN burst
    if (b > 0) { this.ra.set(this.top, 150, b); this.aisTx = { p: this.top, power: b * .9 };
      packet(this.pk, this.top, this.st, ping / .05, 40, 5, b * .8); } },
  where() { return this.top; } });

// A container ship crossing the horizon: nav lights, X-band and S-band radar sweeps (microwave; SOLAS ships ≥ 3000 GT
// typically carry both), AIS bursts (VHF radio), the deck crew's phones (LTE + Bluetooth, microwave), hot funnel.
export const ship = () => event({ name: 'Container ship', t0: 4, t1: 52, bands: ['vis', 'micro', 'radio', 'ir'], freq: ['navRed', 'incandescent', 'xbandRadar', 'sbandRadar', 'ais', 'lte', 'bluetooth', 'thermal700'], tags: ['time-compressed', 'stylised'],
  note: 'Masthead and side lights, two rotating radars (X-band 9.4 GHz for detail, S-band 3 GHz that sees through rain and spray), AIS position bursts on VHF (the coast station on the headland logs each packet), the deck crew\'s phones pinging the network (more often than an idle phone would) and a hot exhaust funnel. Its X-band sweep paints the headland cliffs that face it, as on its radar screen.',
  init() {
    const hull = new THREE.MeshStandardMaterial({ color: 0x15100f, roughness: .8 }), G = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(220, 14, 32), hull); h.position.y = 4; G.add(h);
    const br = new THREE.Mesh(new THREE.BoxGeometry(16, 20, 30), hull); br.position.set(-85, 21, 0); G.add(br);
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(17, 9 + (i * 7 % 5) * 2, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(R(), .35, .12), roughness: .8 })); c.position.set(-60 + i * 18, 15, 0); G.add(c); }
    this.g = solid(G); S.scene.add(G); this.dist = 3200;
    this.mast = new Em('vis', '#ffffff'); this.side = new Em('vis', '#ff3030'); this.stern = new Em('vis', '#ffffff'); this.deck = Array.from({ length: 4 }, () => new Em('vis', '#ffcf88'));
    addTx('micro', () => this.radarTx); addTx('micro', () => this.sbandTx); addTx('radio', () => this.aisTx);
    this.sband = new Em('micro'); this.phones = Array.from({ length: 3 }, () => new Em('micro'));   // no R(): later layouts keep their seeds
    this.radar = new Em('micro'); this.ais = new Em('radio'); this.funnel = new Rib('ir', null, 6, 1); this.hot = new Em('ir', null, 1);
    this.st = COAST_STATION.clone().add(new V3(0, 34, 0)); this.pk = new Rib('radio', null, 2);   // AIS packets to the coast station
  },
  update() { const { t, T } = S, p = (t - this.t0) / (this.t1 - this.t0); this.g.visible = p >= 0 && p <= 1; if (!this.g.visible) { this.p = this.radarTx = this.sbandTx = this.aisTx = null; ENVSEA.radI.value = 0; return; }
    const az = lerp(236, 318, p), c = S.camera.position, d = dirAE(az, 0), pos = new V3(c.x + d.x * this.dist, 0, c.z + d.z * this.dist);
    this.g.position.copy(pos); this.g.rotation.y = -(az + 90) * DEG;
    const fw = new V3(Math.cos((az + 90) * DEG), 0, Math.sin((az + 90) * DEG)), at = (f, y) => pos.clone().addScaledVector(fw, f).add(new V3(0, y, 0));
    const nav = sm(9, 14, t), I = env(t, this.t0, this.t1, 1.5);
    this.p = at(-85, 40); this.mast.set(at(-85, 44), 26, nav * I); this.side.set(at(-80, 24), 18, nav * I * .8); this.stern.set(at(-108, 14), 14, nav * I * .6);
    this.deck.forEach((e, k) => e.set(at(-60 + k * 45, 22), 14, nav * I * .5));
    const ra = T * XB_W, toC = Math.atan2(c.z - pos.z, c.x - pos.x), face = Math.max(0, Math.cos(ra - toC)) ** 16;   // old view: radar crackles brightest as its antenna sweeps past you
    // the eye: a steady-sized antenna whose real 1.1° beam flashes once per turn as it crosses you (−30 dB sidelobes between)
    this.radar.set(at(-85, 34), S.eye ? 60 : 60 + 120 * face, I * (.2 + .9 * face), 1.1 * xband(ra - toC) / (.2 + .9 * face));    ENVSEA.radP.value.copy(at(-85, 34)); ENVSEA.radA.value = ra; ENVSEA.radI.value = I * 3; ENVSEA.radB.value.set(XB_HPBW, XB_W / 60);   // the same sweep echoes off the headlands and the sea (surface shaders read this)
    const sa = T * SB_W + 1.7, sface = Math.max(0, Math.cos(sa - toC)) ** 8;   // S-band: wider beam, own rotation
    this.sband.set(at(-85, 29), S.eye ? 50 : 50 + 90 * sface, I * (.15 + .6 * sface), .75 * BEAM.sweep(sa - toC, SB_HPBW, SB_W) / (.15 + .6 * sface));
    this.sbandTx = { p: at(-85, 29), power: I * 25 * sface };
    this.phones.forEach((e, k) => {                                              // crew on deck: LTE ping every ~3 s, Bluetooth blips between
      const lt = ((T + k * 1.1) % 3) / 3, bt = ((T * 1.3 + k * .7) % 1.5) / 1.5;
      const b = lt < .06 ? 1 - lt / .06 : bt < .04 ? .35 * (1 - bt / .04) : 0;
      if (b > 0) e.set(at(-70 + k * 55, 13), 16, I * .5 * b); });
    const ping = (t % 3) / 3; this.ais.set(at(-85, 44), 220, ping < .2 ? I * (1 - ping / .2) : 0);
    // the sweep reaches the beach (range scaled up: X-band is strong); the eye: the real beam's dwell share, as the drawn antenna
    this.radarTx = { p: at(-85, 34), power: I * 40 * (S.eye ? xband(ra - toC) : face), meter: I * 40 * face };   // meters: unchanged
    this.aisTx = { p: at(-85, 44), power: ping < .2 ? I * 3 * (1 - ping / .2) : 0 };
    if (ping < .2) packet(this.pk, at(-85, 44), this.st, ping / .2, 260, 16, I * .9 * (1 - .5 * ping / .2));
    this.funnel.set([at(-95, 30), at(-100, 60), at(-108, 95)], 10, 26, I * .5); this.hot.set(at(-95, 31), 18, I * .45); },
  where() { return this.p; } });

export const bioluminescence = () => event({ name: 'Bioluminescent surf', t0: 24, t1: 60, bands: ['vis'], freq: ['dinoflagellate'], note: 'Plankton flash blue wherever the breaking waves stir them: cold light, no heat.',
  init() { this.e = Array.from({ length: 40 }, () => { const x = STAND.x + (R() - .5) * 140; return { x, off: 2 + R() * 20, ph: R() * 6, s: .5 + R() }; }); this.f = new EmField('vis', this.e.length, '#3fb4ff'); },
  update() { const { t, T } = S, I = sm(24, 32, t); SEA.mat.uniforms.uBio.value = S.on.vis ? I : 0; if (I <= 0) return; S.act.vis += I * .3;
    this.e.forEach((q, k) => { const z = coastZ(q.x) - q.off, b = Math.max(0, Math.sin(T * 1.4 + q.off * .32 + q.ph)) ** 12;
      this.f.set(k, new V3(q.x, .25, z), .9 * q.s, I * b * 1.3); }); },
  where() { return new V3(STAND.x - 6, .5, coastZ(STAND.x) - 6); } });

// Late sea mist: the sea breathes fog in. The look lives in the sea shader (moonlit scatter by day-light
// of the droplets, a ~285 K screen that hides the warm water toward the horizon in IR); this event drives
// the shared uMist and the meter activity.
export const seaMist = () => event({ name: 'Sea mist', t0: 42, t1: 60, bands: ['vis', 'ir'], freq: ['mistScatter', 'mistThermal'],
  note: 'Cool fog rolls in off the sea: it scatters the moonlight, and in 8–14 µm it reads as a cold screen hiding the warm water.',
  init() { this.h = new V3(0, 4, -1); },
  update() { const m = sm(42, 54, S.t); ENVSEA.mist.value = m; if (m <= 0) return;
    S.act.vis += m * .16; S.act.ir += m * .3; },   // scatter + cold screen: the sea surface itself draws them
  where() { return this.h; } });

// ------------------------------------------------------------------ M5/T2: maritime life
// Shared with the VHF event: where the fishing boats are this frame and how far they have come out (0..1).
const FLEET = [];

// Night fishing boats leaving the harbour after dark. Lights per COLREGs 1972 Rule 26 (IMO): a vessel trawling shows
// all-round green over white, any other vessel fishing all-round red over white; working decks are lit by metal-halide
// floodlights (lampara/purse-seine boats also use them to draw fish up). Their diesel exhausts are warm in IR.
// COLREGs Rule 21(b)/(c): sidelights cover 112.5° from dead ahead to 22.5° abaft the beam on their own side, the
// sternlight the 135° astern; Annex I §9(a): full intensity to the arc's edge, cut-off 1–3° outside it forward (≤ 5° allowed at the after limits, §9(a)(ii)).
const arc = (a, lo, hi) => sm(lo - 3, lo - 1, a) * (1 - sm(hi + 1, hi + 3, a));
const BOATS = 5, BOAT_L = 7;   // light slots per boat: two floods, the upper all-round light, the white one below it,
                               // port (red) and starboard (green) sidelights, sternlight
export const fishingBoats = () => event({ name: 'Fishing boats', t0: 16, t1: 60, bands: ['vis', 'ir'], freq: ['deckLight', 'navGreen', 'navRed', 'navWhiteLED', 'thermal700'],
  note: 'Small boats working the grounds through the night: floodlit decks, and the fishing lights of the rules of the road (green over white for a trawler, red over white for any other fishing boat), plus side and stern lights while they make way at trawling speed. Their diesel exhausts show warm on a thermal camera.',
  init() {
    const hull = new THREE.BoxGeometry(18, 3, 5); hull.translate(0, 1, 0);
    const house = new THREE.BoxGeometry(5, 4, 4); house.translate(-4, 4.5, 0);
    const mast = new THREE.BoxGeometry(.3, 8, .3); mast.translate(-4, 8, 0);
    this.mesh = new THREE.InstancedMesh(mergeGeometries([hull, house, mast].map(g => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x14110f, roughness: .85 }), BOATS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); S.scene.add(solid(this.mesh)); this.mesh.visible = false; this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.b = Array.from({ length: BOATS }, (_, k) => { const az = 248 + R() * 50, d = 1200 + R() * 3000, p = dirAE(az, 0).multiplyScalar(d).add(STAND); p.y = 0;
      return { p, hd: R() * 6.28, sp: 1 + R() * 1, ta: 17 + k * 3.5 + R() * 2, trawl: k % 2 === 0, ph: R() * 6 }; });
    this.L = new EmField('vis', BOATS * BOAT_L); this.ex = new EmField('ir', BOATS, null, 1); this.tmp = new THREE.Object3D();
    this.b.forEach((b, k) => { this.L.color(k * BOAT_L, '#eef2ff').color(k * BOAT_L + 1, '#eef2ff').color(k * BOAT_L + 2, b.trawl ? '#38ff7a' : '#ff2a2a').color(k * BOAT_L + 3, '#ffffff')
        .color(k * BOAT_L + 4, '#ff2a2a').color(k * BOAT_L + 5, '#38ff7a').color(k * BOAT_L + 6, '#ffffff');
      FLEET.push({ p: new V3(), on: 0 }); });
  },
  update() { const { t, T } = S; let any = false; this.p = null;
    this.b.forEach((b, k) => { const on = sm(b.ta, b.ta + 2.5, t) * (1 - sm(58.5, 60, t)); FLEET[k].on = on; if (on <= 0) { this.mesh.setMatrixAt(k, this.zero); return; } any = true;
      const fw = new V3(Math.cos(b.hd), 0, Math.sin(b.hd)), p = b.p.clone().addScaledVector(fw, (t - b.ta) * b.sp); p.y = Math.sin(T * .9 + b.ph) * .3;
      this.tmp.position.copy(p); this.tmp.rotation.set(Math.sin(T * .7 + b.ph) * .03, -b.hd, 0); this.tmp.updateMatrix(); this.mesh.setMatrixAt(k, this.tmp.matrix);
      const at = (f, y) => p.clone().addScaledVector(fw, f).add(new V3(0, y, 0)), s = p.distanceTo(STAND) / 3000;   // keep the lights readable far out
      this.L.set(k * BOAT_L, at(3, 6), 34 * s, on * .5).set(k * BOAT_L + 1, at(-7, 6), 28 * s, on * .4);
      this.L.set(k * BOAT_L + 2, at(-4, 13), 18 * s, on * .45).set(k * BOAT_L + 3, at(-4, 9.5), 18 * s, on * .4);
      const side = new V3(-fw.z, 0, fw.x);                                       // starboard; Rule 26(b)(iii)/(c)(iii) when making way
      const v = S.camera.position.clone().sub(p), a = Math.atan2(v.dot(side), v.dot(fw)) / DEG;   // camera's relative bearing, + to starboard
      this.L.set(k * BOAT_L + 4, at(1, 5).addScaledVector(side, -2.6), 10 * s, on * .3 * arc(-a, 0, 112.5))   // port: ahead to 22.5° abaft the beam
        .set(k * BOAT_L + 5, at(1, 5).addScaledVector(side, 2.6), 10 * s, on * .3 * arc(a, 0, 112.5))         // starboard: the mirror arc
        .set(k * BOAT_L + 6, at(-9, 3.5), 10 * s, on * .3 * arc(Math.abs(a), 112.5, 360));                    // stern: 67.5° each side of astern
      this.ex.set(k, at(-6, 8), 16 * s, on * .45); FLEET[k].p.copy(at(-4, 12)); if (!this.p) this.p = FLEET[k].p; });
    this.mesh.visible = any; this.mesh.instanceMatrix.needsUpdate = true; },
  where() { return this.p; } });

// Marine VHF channel 16 (156.8 MHz, ITU RR Appendix 18): the distress, safety and calling channel every vessel and the
// coast station watch. A call goes out on 16, the answer comes back, then both switch to a working channel (not drawn);
// the coast station announces its navigational warnings (Sécurité) on 16 before reading them on a working channel.
// FM voice keeps a constant carrier while the button is pressed: steady, not flickering, bursts.
const VHF_CYCLE = 4;   // script-s per exchange (time-compressed: a real evening has far fewer calls)
export const vhf16 = () => event({ name: 'Marine VHF ch. 16', t0: 10, t1: 60, bands: ['radio'], freq: ['vhf16'], tags: ['time-compressed'],
  note: 'Channel 16 (156.8 MHz) is the sea\'s calling and distress channel: a skipper calls the harbour, the coast station answers, and both move to a working channel. The coast station also announces its safety warnings here. FM voice: a steady carrier for as long as the button is held.',
  init() { this.st = COAST_STATION.clone().add(new V3(0, 34, 0)); this.e = [new Em('radio'), new Em('radio')]; this.tx = null; addTx('radio', () => this.tx); },
  update() { const { t } = S, I = sm(10, 12, t); this.tx = null; this.p = null; if (I <= 0) return;
    const k = Math.floor(t / VHF_CYCLE), ph = (t % VHF_CYCLE) / VHF_CYCLE;
    const sp = [this.st, ...FLEET.filter(f => f.on > .5).map(f => f.p)], n = sp.length;
    let a = null, b = null;
    if (n < 2 || k % 3 === 0) { if (ph < .45) a = this.st; }                                // Sécurité broadcast from the coast station
    else { const i = (k * 7) % n, j = (i + 1 + (k % (n - 1))) % n; if (ph < .22) a = sp[i]; else if (ph > .3 && ph < .48) b = sp[j]; }   // call, answer
    const src = a || b; if (!src) return;
    this.e[a ? 0 : 1].set(src, src === this.st ? 230 : 160, I * .9); this.tx = { p: src, power: I * 2.2 }; this.p = src; },
  where() { return this.p; } });

// IALA Maritime Buoyage System, Region A (Europe, Africa, most of Asia; IALA MBS / R1001): coming in from the sea, red
// marks to port, green to starboard. A dredged approach to a small harbour in the lee of the north headland, three
// pairs of lateral buoys with LED lanterns and, at the seaward end, a safe-water mark (red and white, LFl 10 s white)
// carrying a racon that answers the ship's X-band radar each time its beam sweeps across (ITU-R M.824; IALA R0101).
// Characteristics, [period s, flashes, flash s, gap s]: Fl 4 s, Fl(2) 6 s, Q (60/min), LFl 10 s (flash >= 2 s).
const FL4 = [4, 1, .5, 0], FL2_6 = [6, 2, .4, 1.2], QK = [1, 1, .3, 0], LFL10 = [10, 1, 2, 0];
const lit = (T, [P, n, d, g], ph) => { const x = (T + ph) % P; for (let i = 0; i < n; i++) if (x >= i * g && x < i * g + d) return 1; return 0; };
export const buoys = () => event({ name: 'Channel buoys (IALA A)', t0: 9, t1: 60, bands: ['vis', 'micro'], freq: ['navRed', 'navGreen', 'navWhiteLED', 'racon'],
  note: 'IALA Region A: red buoys to port, green to starboard as you come in from the sea, each with its own rhythm: Fl R 4s / Fl G 4s at the entrance, Fl(2) 6s, then quick flashes. The red-and-white safe-water mark offshore shows a long white flash every 10 s and carries a racon that answers ship radar in X-band.',
  init() {
    const A = new V3(300, 0, -1300), B = new V3(450, 0, -260), d = B.clone().sub(A).normalize(), port = new V3(d.z, 0, -d.x);   // inbound heading, its left
    const chars = [FL4, FL2_6, QK]; this.bu = [];
    [0, .5, 1].forEach((f, i) => { const c = A.clone().lerp(B, f);
      this.bu.push({ p: c.clone().addScaledVector(port, 60), col: '#ff2a2a', body: 0x7a1410, ch: chars[i], ph: i * .37 });
      this.bu.push({ p: c.clone().addScaledVector(port, -60), col: '#38ff7a', body: 0x0f5a24, ch: chars[i], ph: i * .37 + .21 }); });
    this.bu.push({ p: A.clone().addScaledVector(d, -450), col: '#ffffff', ch: LFL10, ph: 0, racon: true });
    const g = new THREE.CylinderGeometry(1.1, 1.5, 3, 8); g.translate(0, .9, 0); const pil = new THREE.CylinderGeometry(.35, .5, 2.5, 8); pil.translate(0, 3.6, 0);
    const geo = mergeGeometries([g, pil].map(x => x.toNonIndexed())), nLat = this.bu.length - 1;   // the lateral marks share one instanced draw
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6 }), nLat);
    this.bu.forEach((b, i) => { if (i < nLat) { this.mesh.setColorAt(i, new THREE.Color(b.body)); this.mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b.p.x, 0, b.p.z)); } });   // moored there from the start
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); S.scene.add(solid(this.mesh)); this.tmp = new THREE.Object3D();
    // Safe-water mark (IALA MBS §6): red and white vertical stripes — the same body, its faces coloured by azimuth, 4 + 4.
    const sw = geo.clone(), pos = sw.attributes.position, col = new Float32Array(pos.count * 3), red = new THREE.Color(0xb02a22), wht = new THREE.Color(0xe8e8e4);
    for (let f = 0; f < pos.count; f += 3) { let x = 0, z = 0; for (let v = f; v < f + 3; v++) { x += pos.getX(v); z += pos.getZ(v); }
      const c = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) % 2 ? wht : red; for (let v = f; v < f + 3; v++) c.toArray(col, v * 3); }
    sw.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.sw = new THREE.Mesh(sw, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 })); this.sw.position.copy(this.bu[nLat].p); S.scene.add(solid(this.sw));
    this.L = new EmField('vis', this.bu.length); this.bu.forEach((b, i) => this.L.color(i, b.col)); this.rc = new Em('micro');
  },
  update() { const { t, T } = S, I = sm(9, 13, t);   // daylight switches turn the lanterns on at dusk
    this.bu.forEach((b, i) => { const y = Math.sin(T * .8 + i) * .3, tilt = [Math.sin(T * .6 + i) * .06, 0, Math.cos(T * .5 + i) * .06];
      if (b.racon) { this.sw.position.set(b.p.x, y, b.p.z); this.sw.rotation.set(...tilt); }
      else { this.tmp.position.set(b.p.x, y, b.p.z); this.tmp.rotation.set(...tilt); this.tmp.updateMatrix(); this.mesh.setMatrixAt(i, this.tmp.matrix); }
      const s = b.p.distanceTo(STAND) / 1000; if (I > 0) this.L.set(i, new V3(b.p.x, y + 5.2, b.p.z), 22 * s, I * lit(T, b.ch, b.ph) * 1.2);
      if (b.racon && ENVSEA.radI.value > 0) {   // the ship's sweep reaches it: reply (same widened beam as the drawn radar)
        const rp = ENVSEA.radP.value, off = ENVSEA.radA.value - Math.atan2(b.p.z - rp.z, b.p.x - rp.x), face = Math.max(0, Math.cos(off)) ** 16;
        // the eye: it answers while the real 1.1° beam is on it (its own antenna is omnidirectional in azimuth)
        this.rc.set(new V3(b.p.x, y + 5, b.p.z), S.eye ? 30 : 30 + 60 * face, ENVSEA.radI.value / 3 * face * .9, xband(off) / face); } });
    this.mesh.instanceMatrix.needsUpdate = true; },
  where() { return this.bu[0].p.clone().add(new V3(0, 6, 0)); } });

// An offshore wind farm ~9 km out to the south-west: 12 turbines (hub 110 m, rotor 160 m, ~9 rpm). Aviation lights per
// ICAO Annex 14 Vol. I §6.2.4: medium-intensity red (type B) on the nacelles of the peripheral turbines, flashing
// 20–60 times a minute, all synchronised; corner turbines carry IALA G1162 marine marks, Fl Y 5 s, also synchronised.
// Tip height 190 m > 150 m, so the lit towers add an intermediate level at half nacelle height: at least three
// low-intensity Type E lights (red, 32 cd, 360° between them, flashing in step with the nacelle; ICAO Annex 14 Vol. I
// §6.2.4.3; Transport Canada AC 601-001: >= 3 CL-810, 32 cd, flash at the CL-864 rate, mid-point ± 10 m; the UK
// onshore policy uses steady Type B instead). At 9 km the three merge into one point per tower, drawn as one dim light
// on the farm's flash clock — stylised: drawn at ~1/3 of the nacelle light instead of the real 32:2000 cd, or it
// would not show at all.
// The ship's X-band radar sees the towers and moving blades as bright, Doppler-smeared clutter (radarClutter).
const WF_C = new V3(-4500, 0, -7794), WF_S = 900, HUB = 110, BLADE = 80, WF_AX = Math.atan2(Math.cos(260 * DEG), Math.sin(260 * DEG));
export const windFarm = () => event({ name: 'Offshore wind farm', t0: 0, t1: 60, bands: ['vis', 'micro'], freq: ['navRed', 'navYellow', 'radarClutter'], tags: ['stylised'],
  note: 'Twelve turbines far out to sea. After dusk their red aviation lights flash together (30 times a minute), with dimmer red lights half way up the towers flashing with them (they stand over 150 m to the blade tip), and the corner towers add yellow marine lights (Fl Y 5s). To the passing ship\'s X-band radar the towers and turning blades are a smear of bright echoes.',
  init() {
    this.tu = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) this.tu.push({ p: WF_C.clone().add(new V3((i - 1.5) * WF_S, 0, (j - 1) * WF_S)), edge: i % 3 === 0 || j !== 1, corner: i % 3 === 0 && j !== 1, ph: (i * 3 + j) * .53 });
    const tw = new THREE.CylinderGeometry(2.4, 3.2, HUB, 10); tw.translate(0, HUB / 2, 0); const tp = new THREE.CylinderGeometry(3.4, 3.4, 15, 10); tp.translate(0, 7.5, 0);   // tower + transition piece
    const nac = new THREE.BoxGeometry(6, 5, 15); nac.translate(0, HUB + 1, -2);
    const m = new THREE.InstancedMesh(mergeGeometries([tw, tp, nac].map(g => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: .6 }), this.tu.length);
    const o = new THREE.Object3D(); this.tu.forEach((u, k) => { o.position.copy(u.p); o.rotation.set(0, WF_AX, 0); o.updateMatrix(); m.setMatrixAt(k, o.matrix); });
    S.scene.add(solid(m));
    const bl = new THREE.BoxGeometry(3.5, BLADE, .8); bl.translate(0, BLADE / 2, 0);
    this.bl = new THREE.InstancedMesh(bl, new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: .5 }), this.tu.length * 3);
    this.bl.instanceMatrix.setUsage(THREE.DynamicDrawUsage); S.scene.add(solid(this.bl)); this.tmp = new THREE.Object3D(); this.tmp.rotation.order = 'YXZ';
    this.ax = new V3(Math.sin(WF_AX), 0, Math.cos(WF_AX));
    this.red = new EmField('vis', this.tu.length * 2, '#ff2020'); this.yel = new EmField('vis', this.tu.length, '#ffc21a'); this.clu = new EmField('micro', this.tu.length);   // red: nacelle slots, then mid-tower
  },
  update() { const { t, T } = S, night = sm(9, 13, t), rI = ENVSEA.radI.value / 3, rp = ENVSEA.radP.value;
    const red = (T % 2) < .9 ? 1 : 0, yel = (T % 5) < .7 ? 1 : 0;   // synchronised: one clock for the whole farm
    this.tu.forEach((u, k) => { const hub = u.p.clone().addScaledVector(this.ax, 6).add(new V3(0, HUB + 1, 0)), spin = T * .94 + u.ph;   // 9 rpm
      for (let b = 0; b < 3; b++) { this.tmp.position.copy(hub); this.tmp.rotation.set(0, WF_AX, spin + b * 2.094); this.tmp.updateMatrix(); this.bl.setMatrixAt(k * 3 + b, this.tmp.matrix); }
      if (u.edge && night > 0) this.red.set(k, u.p.clone().add(new V3(0, HUB + 4.5, 0)), 34, night * red * .7)
        .set(this.tu.length + k, u.p.clone().add(new V3(0, (HUB + 3.5) / 2, 0)), 16, night * red * .22);   // 32 cd vs 2000 cd: far dimmer, same flash
      if (u.corner && night > 0) this.yel.set(k, u.p.clone().add(new V3(0, 18, 0)), 24, night * yel * .6);
      if (rI > 0) { const off = ENVSEA.radA.value - Math.atan2(u.p.z - rp.z, u.p.x - rp.x), face = Math.max(0, Math.cos(off)) ** 8, dop = .6 + .4 * Math.abs(Math.sin(spin * 3));
        // the eye: lit by the real 1.1° beam as it passes (scattered in all directions, so toward you too)
        this.clu.set(k, hub, S.eye ? 90 : 90 + 120 * face, rI * (.06 + .6 * face) * dop, .66 * xband(off) / (.06 + .6 * face)); } });
    this.bl.instanceMatrix.needsUpdate = true; },
  where() { return WF_C.clone().add(new V3(0, HUB, 0)); } });

// A bonfire on the beach with a few people round it. The flame's soot glows at ~1200 K (visible, peak ~2.4 µm),
// the sand under it warms (world shader, ENVSEA.fire); the people are ~310 K bodies, faces warmest; their phones
// ping LTE and one streams music to a Bluetooth speaker (continuous 2.4 GHz traffic), screens lit now and then.
const FIRE = (() => { const x = -14, z = -9; return new V3(x, heightAt(x, z), z); })();
const PEOPLE = 5;
// A person by parts, facing +z: clothes (coat, between skin and air), bare face, neck and hands (skin, ~33 °C), hair
// (insulating, as fur). Standing, or sitting on the sand with the knees up and the arms round them.
function personGeo(sit) {
  const jacket = 0x3a2e2a, jeans = 0x1c2230, skin = 0x8a6a58, hair = 0x1a120c, P = [];
  const L = (from, to, r0, r1, surf, col) => P.push({ from, to, r0, r1, surf, col });
  const B = (s, at, surf, col) => P.push({ g: PSPH, s, at, surf, col });
  const hip = sit ? .14 : .9, sh = sit ? .72 : 1.42, head = sit ? .92 : 1.62;
  B([.17, (sh - hip) / 2 + .04, .12], [0, (sh + hip) / 2, 0], 'coat', jacket);                 // torso
  L([0, sh, 0], [0, sh + .1, 0], .05, .05, 'skin', skin);                                        // neck
  B([.095, .12, .105], [0, head, .01], 'skin', skin);                                            // face / head
  B([.1, .08, .11], [0, head + .05, -.015], 'fur', hair);                                       // hair
  for (const x of [-.1, .1]) {
    if (sit) {
      L([x, hip, 0], [x * 1.2, .42, .38], .075, .065, 'coat', jeans); L([x * 1.2, .42, .38], [x * 1.2, .05, .52], .06, .05, 'coat', jeans);   // thigh, shin
      L([x * 2, sh - .04, 0], [x * 1.6, .45, .3], .05, .045, 'coat', jacket); B([.045, .045, .045], [x * 1.1, .44, .4], 'skin', skin);   // arm round the knees, hand
    } else {
      L([x, hip, 0], [x * 1.1, .47, .02], .08, .065, 'coat', jeans); L([x * 1.1, .47, .02], [x * 1.1, .06, 0], .06, .05, 'coat', jeans);   // thigh, shin
      L([x * 2.2, sh - .04, 0], [x * 2.4, 1.05, .1], .05, .045, 'coat', jacket); L([x * 2.4, 1.05, .1], [x * 2.2, .86, .22], .045, .04, 'coat', jacket);   // arm, forearm
      B([.045, .05, .045], [x * 2.1, .82, .26], 'skin', skin);                                    // hand
    }
    P.push({ g: new THREE.BoxGeometry(.1, .08, .25), at: [x * (sit ? 1.2 : 1.1), .04, sit ? .58 : .06], surf: 'coat', col: 0x141414 });   // shoe
  }
  return partsGeometry(P);
}
const PSPH = new THREE.SphereGeometry(1, 10, 7);
export const bonfire = () => event({ name: 'Beach bonfire', t0: 28, t1: 60, bands: ['vis', 'ir', 'micro'], freq: ['flame', 'thermal1200', 'groundHeat', 'thermal310', 'lte', 'bluetoothA2DP', 'ledWhite'],
  note: 'Friends light a driftwood fire on the sand: flame light by eye, a blazing hot core in infrared and warm sand spreading around the pit. The people are warm silhouettes on a thermal camera; their phones ping the network and one plays music to a Bluetooth speaker.',
  init() {
    const parts = []; for (let k = 0; k < 6; k++) { const l = new THREE.CylinderGeometry(.08, .11, 1.3, 6); l.rotateX(Math.PI / 2 - .55); l.rotateY(k * 1.05); l.translate(FIRE.x, FIRE.y + .25, FIRE.z); parts.push(l); }
    this.wood = solid(new THREE.Mesh(mergeGeometries(parts.map(g => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: .95 })));
    S.scene.add(this.wood); this.wood.visible = false;   // the friends carry the driftwood in
    // the friends by parts (M11/T4, engine/render/surface.js partsGeometry): standing and sitting on the sand, facing
    // the fire (+z), one instanced draw per pose
    const mk = sit => new THREE.InstancedMesh(personGeo(sit), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), PEOPLE);
    const pm = mk(false), ps = mk(true);
    this.pp = Array.from({ length: PEOPLE }, (_, k) => { const a = k * 1.256 + .4 + R() * .5, r = 1.9 + R() * .6, x = FIRE.x + Math.cos(a) * r, z = FIRE.z + Math.sin(a) * r, sit = k % 2 === 1;
      return { p: new V3(x, heightAt(x, z), z), a, sit, ph: R() * 6 }; });
    const o = new THREE.Object3D(), none = new THREE.Matrix4().makeScale(0, 0, 0);
    this.pp.forEach((q, k) => { o.position.copy(q.p); o.rotation.set(0, -q.a - Math.PI / 2, 0); o.updateMatrix(); (q.sit ? ps : pm).setMatrixAt(k, o.matrix); (q.sit ? pm : ps).setMatrixAt(k, none); });
    for (const m of [pm, ps]) { m.frustumCulled = false; S.scene.add(spectralParts(m, { weight: 0 })); m.visible = false; }   // warm faces, cooler clothes (M11/T4); metered by the sources
    this.pm = pm; this.ps = ps;
    this.light = new THREE.PointLight(0xff7a2a, 0, 45, 1.7); this.light.position.copy(FIRE).add(new V3(0, .9, 0)); S.scene.add(this.light);
    this.fl = [['#ff5a14', 1.6], ['#ff9a2a', 1.1], ['#ffe9a0', .6]].map(([c, s]) => ({ e: new Em('vis', c), s }));
    this.emb = new EmField('vis', 10, '#ffb050'); this.hot = new Em('ir');
    this.body = new EmField('ir', PEOPLE * 2, null, 1); this.scr = new EmField('vis', PEOPLE, '#cfe0ff'); this.ph = new EmField('micro', PEOPLE + 1);
  },
  update() { const { t, T } = S, I = env(t, 28, 60, 1.5), lit = sm(31, 33, t), f = .85 + .15 * Math.sin(T * 23) * Math.sin(T * 7.3);
    this.pm.visible = this.ps.visible = this.wood.visible = I > 0; ENVSEA.fire.value.set(FIRE.x, FIRE.y, FIRE.z, sm(31, 44, t)); this.light.intensity = S.on.vis ? lit * 30 * f : 0; if (I <= 0) return;
    if (lit > 0) {
      this.fl.forEach((q, i) => q.e.set(FIRE.clone().add(new V3(Math.sin(T * 9 + i) * .05, .4 + i * .2, 0)), q.s * f, lit));
      for (let k = 0; k < 10; k++) { const a = (T * .6 + k / 10) % 1; this.emb.set(k, FIRE.clone().add(new V3(Math.sin(k * 3 + T) * .5 * a, .5 + a * 4, Math.cos(k * 2 + T) * .4 * a)), .06, lit * (1 - a) * .5); }
      this.hot.set(FIRE.clone().add(new V3(0, .6, 0)), 4, lit * f); S.act.ir += sm(31, 44, t) * .2; }   // + the warming sand (surface shader)
    this.pp.forEach((q, k) => { const y = q.p.y, tc = q.sit ? .5 : 1.12, hd = q.sit ? .92 : 1.6;   // torso and head heights of the pose
      this.body.set(k * 2, new V3(q.p.x, y + tc, q.p.z), q.sit ? .7 : .9, I * .55, 0); this.body.set(k * 2 + 1, new V3(q.p.x, y + hd, q.p.z), .42, I * .6, 0);   // body heat: metered; the eye sees the people's parts (see 0, M11/T6)
      const hand = new V3(q.p.x - Math.cos(q.a) * .3, y + (q.sit ? .45 : 1.0), q.p.z - Math.sin(q.a) * .3);
      if (Math.sin(T * .3 + q.ph) > .55) this.scr.set(k, hand, .3, I * .6);                              // someone checks their phone
      const lt = ((t + k * .7) % 3) / 3; if (lt < .08) this.ph.set(k, hand, .8, I * .6 * (1 - lt / .08)); });   // LTE ping
    const sp = this.pp[0].p, bt = (T * 3) % 1; this.ph.set(PEOPLE, new V3(sp.x + .4, sp.y + .2, sp.z), .5, I * (bt < .5 ? .3 : .15)); },   // A2DP stream: steady 2.4 GHz traffic
  where() { return FIRE.clone().add(new V3(0, 1.5, 0)); } });

// The cliff-top Yagi listens to the radio sky directly and via the sea: a Lloyd's-mirror interferometer (the fringes
// are drawn by the sea shader in world.js, see LLOYD_LAMBDA). The antenna only receives, so the event draws no source
// of its own; it names what the radio sea shows. Sources' meter activity comes from their own events.
export const seaInterferometer = () => event({ name: 'Sea interferometer', t0: 0, t1: 60, bands: ['radio'], freq: ['lloydFringe', 'lloydFringe100'], tags: ['stylised', 'time-compressed'],
  note: 'The antenna on the cliff hears each radio source twice, straight from the sky and reflected off the sea. The two paths interfere, so the signal swells and fades as a source rises or sets: Lloyd\'s mirror, the trick Australian radio astronomers used from sea cliffs in the late 1940s to pin down the first radio sources. On the radio sea, the bars under the setting Sun picture those fringes (the pattern is in the antenna\'s output, not on the water); a rising tide sweeps them for the fixed sources, faster than a real tide.',
  init() {}, update() {},
  where: () => CLIFF_ANT.clone().add(new V3(0, 7, 0)) });
