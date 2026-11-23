// Events that belong to the open ocean (sky events come from the engine library). Almost nothing human is in range out
// here: your own boat, one ship on the horizon and whatever comes down from orbit.
import * as THREE from 'three';
import { V3, DEG, lerp, sm, env, R } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { deg, dirAE, skyP, FOV_SKY } from 'spectra/core/geom.js';
import { Em, Rib, EmField } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { SUN_AZ, sunEl } from 'spectra/world/atmosphere.js';
import { addTx, addHits } from 'spectra/render/surface.js';
import { SEA, BOAT, MAST, boatP } from './world.js';

// The last sliver of Sun flashes green as it drops under a sharp sea horizon (sunEl crosses 0 at t≈7.3).
export const greenFlash = () => event({ name: 'Green flash', t0: 6.4, t1: 8.6, bands: ['vis'], freq: ['greenFlash'], tags: ['rare'], note: 'Refraction splits the last sliver of the Sun over a clean sea horizon: a second of emerald. Mid-ocean, with no coast or haze in the way, is where it is seen most often.',
  init() { this.e = new Em('vis', '#5dff8a'); this.c = new Em('vis', '#b8ffd0'); },
  update() { const { t, T } = S, I = env(t, 6.6, 8.4, .5) * (.75 + .25 * Math.sin(T * 30)); this.p = skyP(SUN_AZ, Math.max(sunEl(), -.15) + .12);
    this.e.set(this.p, deg(1.1), I * 1.1); this.c.set(this.p, deg(.35), I * 1.4); },
  where() { return this.p; } });

// A radio packet drawn as a short run of dashes travelling from a to b (AIS: 26.7 ms, ITU-R M.1371-5). Radio crosses
// 11 km in 37 µs; the travel is slowed down for the eye, so the events that use it carry 'time-compressed'.
const packet = (rib, a, b, f, len, w, I) => {
  const L = a.distanceTo(b), u1 = Math.min(1, f * (1 + len / L)), u0 = Math.max(0, u1 - len / L);
  if (u1 > u0) rib.set([a.clone().lerp(b, u0), a.clone().lerp(b, u1)], w, w, I);
};
const masthead = () => boatP(MAST.u, BOAT.deck + MAST.h + .3, 0);      // VHF / AIS antenna at the masthead

// Whale blows at dusk: a humpback surfacing a few hundred metres off. The blow is exhaled air at ~35 °C, saturated,
// condensing into a spray column 3–5 m tall; thermal cameras pick blows out against the sea at several km (Zitterbart
// et al. 2013, PLoS ONE 8:e71819), while the back itself, under blubber, is barely warmer than the water.
const BLOWS = [[2.6, 251, 520], [4.4, 254, 540], [6.3, 258, 560], [10.2, 262, 600]];   // [t, az, distance m]
export const whale = () => event({ name: 'Whale blows', t0: 2, t1: 12, bands: ['vis', 'ir'], freq: ['sunlight', 'steam'], tags: ['rare'],
  note: 'A humpback breathing as it travels: each blow is a warm, wet column of exhaled air that hangs a few seconds in the twilight. In thermal infrared the blow stands out far better than the animal, whose back is barely warmer than the sea.',
  init() { this.v = new Rib('vis', '#e4e8f0', 8); this.i = new Rib('ir', null, 8, 1); this.back = new Em('vis', '#0a0c10'); },
  update() { const { t } = S, c = S.camera.position; this.p = null;
    for (const [tb, az, d] of BLOWS) { const a = t - tb; if (a < 0 || a > 1.6) continue;
      const base = dirAE(az, 0).multiplyScalar(d).add(c).setY(.3), h = 5 * sm(0, .25, a), I = (1 - sm(.3, 1.6, a));
      const pts = Array.from({ length: 6 }, (_, k) => base.clone().add(new V3(k * .25 * a, h * k / 5, 0)));
      this.v.set(pts, 1, 3 + 3 * a, I * .6 * (1 - .6 * sm(10, 13, t)), 0); this.i.set(pts, 1.2, 3.5 + 3 * a, I * .8);
      if (a < .9) this.back.set(base.clone().add(new V3(-3, -.1, 0)), 3, .3);
      this.p = base.clone().setY(4); } },
  where() { return this.p; } });

// Under engine through the calm: the diesel under the cockpit. Its wet exhaust (cooling water injected into the gas,
// ~330 K) leaves the port quarter in warm puffs that stream aft; the engine-room blower vent on the coaming, fed by the
// ~40 °C engine room, is a steady warm spot. (Warm air itself is transparent at 8–14 µm: the vent's cowl and the water
// droplets show, not the air.)
export const engine = () => event({ name: 'Diesel engine', t0: 0, t1: 60, bands: ['ir'], freq: ['wetExhaust', 'thermal310'], tags: ['common'],
  note: 'The boat motors through the evening calm. In thermal infrared its engine shows: warm puffs of wet exhaust off the port quarter, the engine-room vent on the cockpit coaming and the companionway steps over the engine, all warmer than the sea and the cooling deck.',
  init() { this.puff = new Rib('ir', null, 10, 1); this.vent = new Em('ir'); },
  update() { const { T } = S;
    const out = boatP(-5.7, .35, -1.75), aft = boatP(-14, .9, -2.6).sub(out), pts = Array.from({ length: 8 }, (_, k) => out.clone().addScaledVector(aft, k / 7).add(new V3(0, .15 * Math.sin(T * 3 + k), 0)));
    this.puff.set(pts, .4, 2.2, .45 + .1 * Math.sin(T * 5)); this.vent.set(boatP(-3, BOAT.deck + .45, -1.27), .14, .4);
    this.p = boatP(-3, BOAT.deck + .45, -1.27); },
  where() { return this.p; } });

// Navigation lights under engine: a sailing yacht motoring is a power-driven vessel (COLREGs 1972 Rule 25(e), Rule 23):
// a white masthead ("steaming") light 225° forward on the mast, a red/green bicolour at the bow (Rule 25(b): allowed
// below 20 m) and the sternlight on the transom; the masthead tricolour is for sailing only. From the cockpit you are
// abaft all three arcs ahead of you (Annex I §9: cut-off within a few degrees), so you see their lenses' back-glow and
// the light they throw on the foredeck and the bow wave, red to port, green to starboard.
export const navLights = () => event({ name: 'Your navigation lights', t0: 8, t1: 60, bands: ['vis'], freq: ['navWhiteLED', 'navRed', 'navGreen'], tags: ['common'],
  note: 'Motoring, the yacht shows a power-driven vessel\'s lights: a white steaming light on the forward face of the mast, red and green at the bow and white at the stern. They shine ahead and astern, not at you: from the cockpit you see their glow on the foredeck, the forestay and the bow wave.',
  init() { this.st = new Em('vis', '#fff4e0'); this.stHalo = new Em('vis', '#fff4e0'); this.red = new Em('vis', '#ff2a2a'); this.grn = new Em('vis', '#38ff7a'); this.pool = [new Em('vis', '#ff2a2a'), new Em('vis', '#38ff7a')]; },
  update() { const I = sm(8, 12, S.t); if (I <= 0) return;
    const st = boatP(MAST.u + .12, BOAT.deck + MAST.h * .62, 0);
    this.st.set(st, .14, I * .5); this.stHalo.set(boatP(MAST.u + 2, BOAT.deck + MAST.h * .5, 0), 3.5, I * .06);
    this.red.set(boatP(5.95, BOAT.deck + .72, -.08), .1, I * .4); this.grn.set(boatP(5.95, BOAT.deck + .72, .08), .1, I * .4);
    this.pool[0].set(boatP(6.6, .1, -1.6), 2.2, I * .12); this.pool[1].set(boatP(6.6, .1, 1.6), 2.2, I * .12);
    this.p = st; },
  where() { return this.p; } });

// Your own AIS (Class B "CS", ITU-R M.1371-5): a position report on 161.975 / 162.025 MHz every 30 s above 2 kn, from
// the masthead antenna. The ship on the horizon is the only receiver in VHF range (~20 nmi); its AIS answers with its
// own Class A reports (every 10 s at 14–23 kn). Drawn as one burst every few script-seconds (real: many more).
const AIS_EVERY = 5;
export const ownAIS = () => event({ name: 'Your AIS transponder', t0: 0, t1: 60, bands: ['radio'], freq: ['ais'], tags: ['time-compressed'],
  note: 'The boat broadcasts its position, course and speed on VHF (162 MHz) every 30 seconds. Out here the only station that hears it is the ship on the horizon, which plots you on its chart display; its AIS reports come back the same way.',
  init() { this.e = new Em('radio'); this.pk = new Rib('radio', null, 2); this.tx = null; addTx('radio', () => this.tx); },
  update() { const { t } = S, ph = ((t + 1.3) % AIS_EVERY) / AIS_EVERY, b = ph < .06 ? 1 - ph / .06 : 0; this.tx = null; this.p = masthead();
    if (b <= 0) return;
    this.e.set(this.p, 14, b * .8); this.tx = { p: this.p, power: b * 1.5 };
    if (SHIP.on > .5) packet(this.pk, this.p, SHIP.ais, ph / .06, 400, 6, b * .7); },
  where() { return this.p; } });

// A cargo ship crossing ~11 km off: COLREGs Rule 23 lights for a vessel ≥ 50 m (two white masthead lights, the after
// one higher; sidelight; sternlight), floodlit decks, X- and S-band radars (SOLAS V/19: both on ships ≥ 3000 GT), AIS
// Class A, a hot funnel. Her radar horizon (antenna ~40 m) is ~30 km, so her X-band sweep finds your boat: each pass
// lights your mast and radar reflector for an instant, as on her screen.
export const SHIP = { on: 0, ais: new V3(), p: new V3() };
export const cargoShip = () => event({ name: 'Cargo ship on the horizon', t0: 6, t1: 58, bands: ['vis', 'micro', 'radio', 'ir'], freq: ['navWhiteLED', 'navGreen', 'deckLight', 'xbandRadar', 'sbandRadar', 'ais', 'thermal700'], tags: ['time-compressed'],
  note: 'The only other vessel for hundreds of kilometres: a bulk carrier on the great-circle route. Two white masthead lights and a green sidelight (she shows you her starboard side), floodlit decks, two rotating radars (9.4 GHz for detail, 3 GHz through rain) whose X-band beam paints your mast each time it sweeps past, AIS reports on VHF and a hot funnel.',
  init() {
    const hull = new THREE.MeshStandardMaterial({ color: 0x15100f, roughness: .8 }), G = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(230, 12, 36), hull); h.position.y = 4; G.add(h);
    const br = new THREE.Mesh(new THREE.BoxGeometry(18, 22, 34), hull); br.position.set(-95, 21, 0); G.add(br);
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 30), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(.02 + R() * .05, .3, .1), roughness: .8 })); c.position.set(-55 + i * 28, 11, 0); G.add(c); }
    this.g = solid(G); S.scene.add(G); this.dist = 11000;
    this.L = new EmField('vis', 9); ['#ffffff', '#ffffff', '#38ff7a', '#ffffff', '#ffcf88', '#ffcf88', '#ffcf88', '#ffcf88', '#ffcf88'].forEach((c, i) => this.L.color(i, c));
    this.radar = new Em('micro'); this.sband = new Em('micro'); this.ais = new Em('radio'); this.funnel = new Rib('ir', null, 6, 1); this.hot = new Em('ir', null, 1);
    this.pk = new Rib('radio', null, 2);
    this.hit = null; addHits('micro', () => this.hit);
  },
  update() { const { t, T } = S, p = (t - this.t0) / (this.t1 - this.t0); this.g.visible = p >= 0 && p <= 1; this.hit = null; SHIP.on = 0;
    if (!this.g.visible) { this.p = null; return; }
    const az = lerp(246, 298, p), c = S.camera.position, d = dirAE(az, 0), pos = new V3(c.x + d.x * this.dist, 0, c.z + d.z * this.dist), hd = az + 78;   // heading: crossing ahead of you, starboard side toward you
    this.g.position.copy(pos); this.g.rotation.y = -hd * DEG;
    const fw = new V3(Math.cos(hd * DEG), 0, Math.sin(hd * DEG)), at = (f, y, s = 0) => pos.clone().addScaledVector(fw, f).add(new V3(-fw.z * s, y, fw.x * s));
    const I = env(t, this.t0, this.t1, 1.5), nav = sm(9, 14, t) * I, k = 10;     // k: light sizes readable at 11 km (as the seaside fishing boats scale theirs)
    this.L.set(0, at(40, 38), 9 * k, nav).set(1, at(-95, 50), 9 * k, nav).set(2, at(-90, 24, 17), 7 * k, nav * .7).set(3, at(-112, 14), 6 * k, nav * .2);
    for (let i = 0; i < 5; i++) this.L.set(4 + i, at(-60 + i * 30, 20), 10 * k, nav * .35);
    const toMe = Math.atan2(c.z - pos.z, c.x - pos.x), ra = T * 2.4, face = Math.max(0, Math.cos(ra - toMe)) ** 16;   // the X-band antenna turns ~24 rpm
    this.radar.set(at(-95, 36), 90 + 260 * face, I * (.2 + .9 * face));
    const sface = Math.max(0, Math.cos(T * 2.1 + 1.7 - toMe)) ** 8; this.sband.set(at(-95, 31), 80 + 180 * sface, I * (.15 + .6 * sface));
    if (face > .3) this.hit = [{ p: masthead().add(new V3(0, -4, 0)), power: I * face * 1.2 }, { p: boatP(MAST.u, BOAT.deck + 6, 0), power: I * face }];
    const ph = ((t + 3.1) % 3.5) / 3.5, b = ph < .12 ? I * (1 - ph / .12) : 0;
    SHIP.on = I; SHIP.ais.copy(at(-95, 52)); SHIP.p.copy(at(-95, 40));
    if (b > 0) { this.ais.set(SHIP.ais, 260, b); packet(this.pk, SHIP.ais, masthead(), ph / .12, 900, 14, b * .6); }
    this.funnel.set([at(-104, 34), at(-108, 70), at(-118, 115)], 30, 70, I * .7); this.hot.set(at(-104, 35), 60, I * .8);
    this.p = SHIP.p; },
  where() { return this.p; } });

// Marine VHF channel 16 (156.8 MHz, ITU RR Appendix 18): you call the ship to agree how you pass; she answers and both
// move to a working channel (not drawn). FM voice: a steady carrier while the button is held.
export const vhf16 = () => event({ name: 'VHF ch. 16: calling the ship', t0: 30, t1: 38, bands: ['radio'], freq: ['vhf16'], tags: ['time-compressed'],
  note: 'You call the ship on channel 16 (156.8 MHz), the sea\'s calling and distress channel, to check she has seen you; the officer of the watch answers and you both switch to a working channel. The only voice on the radio all night.',
  init() { this.e = [new Em('radio'), new Em('radio')]; this.tx = null; addTx('radio', () => this.tx); },
  update() { const { t } = S; this.tx = this.p = null; const ph = (t - 30) / 8; if (ph < 0 || ph > 1 || SHIP.on < .3) return;
    if (ph < .35) { this.p = masthead(); this.e[0].set(this.p, 18, env(ph, 0, .35, .03) * .9); this.tx = { p: this.p, power: 2 }; }
    else if (ph > .45 && ph < .8) { this.p = SHIP.ais; this.e[1].set(this.p, 300, env(ph, .45, .8, .03) * .9); } },   // her answer: 11 km off, her carrier paints no water near you
  where() { return this.p; } });

// GNSS: the chartplotter's only fix out here. GPS orbits in 11 h 58 min at 20 180 km (Galileo 14 h 05 min at 23 222 km),
// seen from the ground ~25–40°/h (IS-GPS-200; Galileo OS SIS ICD): ~1.7° per script unit on this clock (see the trail's
// gnss), each point drifting along its own track and replaced by another rising into the cone.
const GNSS_RATE = 1.7, GNSS_EL0 = 12, GNSS_EL1 = FOV_SKY.elMax - 2;
export const gnss = () => event({ name: 'GPS & Galileo satellites', t0: 0, t1: 60, bands: ['micro'], freq: ['gpsL1', 'galileoE5'], tags: ['common'],
  note: 'Navigation satellites 20 000 km up broadcast continuously in the L band (1.2–1.6 GHz): faint, steady points drifting slowly across the sky. A thousand kilometres from land they are the only way the chartplotter knows where you are.',
  init() { this.s = Array.from({ length: 10 }, () => ({ az: FOV_SKY.az0 + 4 + R() * 112, el: 14 + R() * (FOV_SKY.elMax - 16), d: (R() - .5) * .12 })); this.f = new EmField('micro', this.s.length, '#ffd27a'); },
  pos(s, i, t) { const h = s.d / .06 * Math.PI + i, w = FOV_SKY.az1 - FOV_SKY.az0 - 8, H = GNSS_EL1 - GNSS_EL0, k = i % 2 ? .87 : 1;
    const az = FOV_SKY.az0 + 4 + ((s.az - FOV_SKY.az0 - 4 + t * GNSS_RATE * k * Math.cos(h) / Math.cos(s.el * DEG)) % w + w) % w;
    const el = GNSS_EL0 + ((s.el - GNSS_EL0 + t * GNSS_RATE * k * Math.sin(h)) % H + H) % H;
    const edge = Math.min(az - FOV_SKY.az0 - 4, FOV_SKY.az0 + 4 + w - az, el - GNSS_EL0, GNSS_EL1 - el);
    return { az, el, a: sm(0, 3, edge) }; },
  update() { const { t } = S; this.s.forEach((s, i) => { const q = this.pos(s, i, t); this.f.set(i, skyP(q.az, q.el), deg(.7), .2 * q.a); }); },
  where() { const q = this.pos(this.s[3], 3, S.t); return skyP(q.az, q.el); } });

// Satellite phone: the evening weather download (GRIB files) through an Iridium terminal clipped to the port cockpit coaming. Iridium
// satellites fly at 780 km and cross the sky in ~10 min, so the link hands over as one sets; on this clock a pass is a
// few script-seconds (time-compressed). The terminal and the satellite talk in short TDMA bursts (8.28 ms every 90 ms).
const SAT_T0 = 34, SAT_T1 = 42;
export const satphone = () => event({ name: 'Satellite phone (Iridium)', t0: SAT_T0, t1: SAT_T1, bands: ['micro'], freq: ['iridium'], tags: ['time-compressed'],
  note: 'No phone network reaches this far, so the weather forecast comes down through an Iridium satellite 780 km up: the terminal on the cockpit coaming and the satellite trade short L-band bursts (1.6 GHz) as it crosses the sky. Apart from the GPS signals it is the only microwave link aboard.',
  init() { this.ant = new Em('micro'); this.sat = new Em('micro'); this.up = new Rib('micro', null, 2); },
  update() { const { t } = S, I = env(t, SAT_T0, SAT_T1, .6); this.p = null; if (I <= 0) return;
    const u = (t - SAT_T0) / (SAT_T1 - SAT_T0), sat = skyP(lerp(222, 318, u), 10 + 16 * Math.sin(Math.PI * u)), a = boatP(-2.5, BOAT.deck + .5, -1.15);
    const ph = (t * 3) % 1, burst = ph < .5 ? 1 : 0;   // bursts drawn slowed down (real: 8 ms in 90 ms); on script time, so a paused frame repeats
    this.sat.set(sat, deg(.6), I * .7); this.p = a;
    if (!burst) return;
    this.ant.set(a, .22, I * .7);
    packet(this.up, a, sat, ph / .5, 1600, 14, I * .6); },
  where() { return this.p; } });

// Bioluminescence: dinoflagellates (Noctiluca, Pyrocystis) flash when the water is sheared, so only the hull's wash and
// the bow wave light up, blue (~475 nm), streaming aft past you. The sea shader draws the glow in the wash; these are
// the brighter individual flashes. Cold light: nothing in IR.
export const bioluminescence = () => event({ name: 'Bioluminescent wake', t0: 20, t1: 60, bands: ['vis'], freq: ['dinoflagellate'], tags: ['common'],
  note: 'Plankton flash blue wherever the hull and the bow wave disturb them: a glowing wash slides down the side of the boat and sparks drift away astern. Cold light — nothing shows in infrared.',
  init() { this.e = Array.from({ length: 48 }, () => ({ u: 7 - R() * 16, s: R() < .5 ? -1 : 1, off: R() ** 2 * 3, ph: R() * 6, sz: .15 + R() * .3 })); this.f = new EmField('vis', this.e.length, '#3fb4ff'); },
  update() { const { t, T } = S, I = sm(20, 28, t); SEA.mat.uniforms.uBio.value = S.on.vis ? I : 0; if (I <= 0) return; S.act.vis += I * .2;
    this.e.forEach((q, k) => { const u = 7 - ((7 - q.u + T * BOAT.speed) % 16), hb = u > 6.2 || u < -6 ? 0 : 1.9 * Math.sqrt(Math.max(0, 1 - ((u + .6) / 6.8) ** 2));
      const b = Math.max(0, Math.sin(T * 2.3 + q.ph)) ** 10; this.f.set(k, boatP(u, .05, q.s * (hb + .2 + q.off)), q.sz, I * b * 1.4); }); },
  where() { return boatP(2, .2, -2.4); } });

