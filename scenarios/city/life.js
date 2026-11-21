// The visible & infrared street life of the city: shop signs, security light rings, HVAC and
// manhole steam, a LiDAR delivery robot, the distant airport radar and one police car.
import * as THREE from 'three';
import { V3, sm, hash2 } from 'spectra/core/util.js';
import { dirAE } from 'spectra/core/geom.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { Em, Rib, EmField } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { burst } from './events.js';
import { night } from 'spectra/world/atmosphere.js';
import { SIGNS, CAMS, PLUMES, MANHOLES, PARK_Z, SIDEWALK_X } from './world.js';

// ---------------------------------------------------------------- 4.5 more visible & IR life

export const signs = () => event({ name: 'Neon & LED shop signs', t0: 9, t1: 60, bands: ['vis'], freq: ['neon', 'ledWhite'], note: 'After dusk the neon tubes buzz on with an irregular flicker, the LED panels snap on flat. Their boxes are already in the scene; this is the band activity they carry.',
  init() { this.f = new EmField('vis', SIGNS.length); SIGNS.forEach((q, k) => this.f.color(k, q.col)); },
  update() { const { t, T } = S;
    SIGNS.forEach((q, k) => {
      const on = sm(9 + q.k * 9, 12 + q.k * 9, t);
      const fl = q.neon ? (hash2(Math.floor(T * 13), k + 2) < .08 ? .4 : 1) : (hash2(Math.floor(T * 2.5), k) < .25 ? .8 : 1);
      this.f.set(k, q.p, Math.max(1.2, q.w * .5), on * fl * (.45 + .5 * night()));
    }); },
  where: () => null });

// A band lesson: the 850 nm illuminator ring in front of every security camera is dead to the eye.
export const cams = () => event({ name: 'Security cameras: 850 nm rings', t0: 12, t1: 60, bands: ['ir'], freq: ['ir850'], note: 'Security cameras swivel over the sidewalks and open a ring of 850 nm IR — invisible by day and by eye, but a thermal camera sees each cone flare the moment a passer-by breaks it.',
  init() { this.f = new EmField('ir', CAMS.length); },
  update() { const { t, T } = S, on = sm(12, 17, t);
    CAMS.forEach((q, k) => {
      const pulse = .5 + .3 * Math.max(0, Math.sin(T * 1.6 + k * 1.9));
      this.f.set(k, q.p.clone().addScaledVector(q.n, .5), 1.5, on * pulse * .5);
    }); },
  where: () => null });

// Rooftop HVAC units pour exhaust that only a thermal camera reads as rising warm air.
export const hvac = () => event({ name: 'HVAC exhaust plumes', t0: 14, t1: 60, bands: ['ir'], freq: ['steam'], note: 'Rooftop units breathe out warm exhaust over the roof edge — rising heat a thermal camera can see long after the units are dark to the eye.',
  init() { this.r = PLUMES.map(() => new Rib('ir', null, 5, 1)); },
  update() { const { t, T } = S, on = sm(14, 22, t);
    PLUMES.forEach((q, k) => {
      const p = q.p, rise = 5.5 + 1.8 * Math.sin(T * .7 + k * 1.3), drift = q.side * (1.2 + .8 * Math.sin(T * .5 + k));
      this.r[k].set([p.clone(), p.clone().add(new V3(0, rise * .4, 0)), p.clone().add(new V3(drift, rise, 0))], .9, 2, on * (.42 + .12 * Math.sin(T * 1.3 + k)), 1);
    }); },
  where: () => null });

export const steam = () => event({ name: 'Manhole steam', t0: 18, t1: 60, bands: ['ir'], freq: ['steam'], note: 'Warm moist air off the sewers on a cold night: thin rising plumes, hot in IR and cold to the eye.',
  init() { this.r = MANHOLES.map(() => new Rib('ir', null, 5, 1)); },
  update() { const { t, T } = S, on = sm(18, 26, t);
    MANHOLES.forEach((m, k) => {
      const h = 2.6 + 1.1 * Math.sin(T * .8 + k * 2.1), drift = .6 * Math.sin(T * .45 + k);
      this.r[k].set([m.clone(), m.clone().add(new V3(0, h * .45, 0)), m.clone().add(new V3(drift, h, 0))], .6, 1.5, on * .4, 1);
    }); },
  where: () => null });

// Kerbside delivery robot: a LiDAR fan at 905 nm that the eye never sees, plus LTE-M chatter.
export const robot = () => event({ name: 'Delivery robot: LiDAR sweep', t0: 16, t1: 60, bands: ['vis', 'ir', 'micro'], freq: ['ledWhite', 'lidar905', 'lteIoT'], note: 'A kerbside robot patrols toward you: an LED status pip, a 905 nm LiDAR fan only the IR band reveals, and an LTE-M modem answering to the masts.',
  init() {
    const g = new THREE.BoxGeometry(.95, .75, 1.15); g.translate(0, .5, 0);
    this.body = solid(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: .5, metalness: .3 })));
    this.vis = new Em('vis', '#cfe4ff'); this.s = new Em('ir', null, 1); this.l = new Rib('ir', null, 3, 1); this.m = new Em('micro');
  },
  update() { const { t, T } = S, cam = S.camera.position;
    this.body.visible = false;
    if (t < 16) return;
    const x = SIDEWALK_X - 1.8, z = 150 - ((t - 16) * 2.8 % 300);   // patrols the north sidewalk
    this.body.position.set(x, 0, z); this.body.visible = true;
    const head = new V3(x, 1, z);
    this.vis.set(head.clone().setY(1.25), .7, .55);
    this.s.set(head, 1.1, .45);
    const d = new V3(Math.sin(T * 2.4), 0, -1).normalize();
    this.l.set([head, head.clone().addScaledVector(d, 1.4), head.clone().addScaledVector(d, 3)], .14, .22, .8);
    this.m.set(head.clone().setY(1.2), .9, burst(t, 3.2, .5, .2) * .6);
    if (z < cam.z - 160) this.body.visible = false; },
  where() { return new V3(SIDEWALK_X - 1.8, 1, 150 - ((S.t - 16) * 2.8 % 300)); } });

// Beyond the park, the airport's S-band surveillance radar sweeps the horizon.
export const radar = () => event({ name: 'Airport radar (S-band)', t0: 8, t1: 60, bands: ['micro'], freq: ['sBandRadar'], note: 'Out beyond the park the airport surveillance radar turns at one revolution per four seconds — 2.8 GHz microwave: you cannot see the aircraft it finds, only the fan.',
  init() {
    this.c = dirAE(232, .35).multiplyScalar(1750).add(new V3(0, 14, PARK_Z + 640));
    this.mast = new Em('micro'); this.fan = new Rib('micro', null, 10, 0);
  },
  update() { const { T, camera } = S;
    const near = 1 - sm(1200, 2200, this.c.distanceTo(camera.position));
    this.mast.set(this.c, 26, .4 * near);
    const a = (T % 4) / 4 * Math.PI * 2, r = 120, pts = [];
    for (let k = 0; k <= 7; k++) { const th = a - .5 + k / 7; pts.push(this.c.clone().add(new V3(Math.cos(th) * r, 0, Math.sin(th) * r))); }
    pts.push(this.c.clone());
    this.fan.set(pts, .7, 2.6, .5 * near); },
  where() { return this.c; } });

export const police = () => event({ name: 'Police car: LEDs & TETRA', t0: 30, t1: 40, bands: ['vis', 'radio'], freq: ['ledBlue', 'ledAmber', 'tetra'], note: 'A cruiser runs down the avenue: the light bar strobes blue and amber, and its TETRA net chirps on radio at 390 MHz — a band the traffic below it never touches.',
  init() {
    const g = new THREE.BoxGeometry(1.8, .8, 4.3); g.translate(0, .7, 0);
    const g2 = new THREE.BoxGeometry(1.55, .55, 2.2); g2.translate(0, 1.32, -.25);
    this.body = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x101418, roughness: .5, metalness: .5 }));
    this.body.add(new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: .6, metalness: .4 })));
    solid(this.body);
    this.b1 = new Em('vis', '#3060ff'); this.b2 = new Em('vis', '#ffb030'); this.r = new Em('radio');
  },
  update() { const { t, T } = S;
    if (t < 30 || t > 40) { this.body.visible = false; return; }
    const u = (t - 30) / 10, x = 5.3, z = 260 - u * 560;
    this.body.visible = true; this.body.position.set(x, 0, z); this.body.rotation.y = Math.PI;
    const blue = T % .9 < .45 ? 1.25 : .06, amber = T % .9 < .45 ? .06 : 1.15;
    this.b1.set(new V3(x, 1.85, z), 1.5, blue); this.b2.set(new V3(x, 1.85, z), 1.5, amber);
    this.r.set(new V3(x, 1.2, z), 2.2, burst(t, 3.6, 1.3, .45) * .9); },
  where() { return null; } });
