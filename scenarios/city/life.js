// The visible & infrared street life of the city: shop signs, security light rings, cooling-tower
// and manhole steam, a LiDAR delivery robot, the distant airport radar and one police car.
import * as THREE from 'three';
import { V3, sm, hash2 } from 'spectra/core/util.js';
import { dirAE } from 'spectra/core/geom.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { Em, Rib, EmField } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { burst, inWin } from './events.js';
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

// A band lesson: the 850 nm illuminator ring in front of every security camera is all but dark to the eye.
export const cams = () => event({ name: 'Security cameras: 850 nm rings', t0: 12, t1: 60, bands: ['ir'], freq: ['ir850'], note: 'Security cameras over the sidewalks switch on a ring of 850 nm near-infrared LEDs after dusk. Up close the eye catches only a faint deep-red glow from the ring (940 nm illuminators are the nearly invisible kind), and an 8–14 µm thermal camera sees nothing; to the cameras themselves and to any night-vision sensor it is a floodlight.',
  init() { this.f = new EmField('ir', CAMS.length); },
  update() { const { t, T } = S, on = sm(12, 17, t);
    CAMS.forEach((q, k) => {
      const pulse = .5 + .3 * Math.max(0, Math.sin(T * 1.6 + k * 1.9));
      this.f.set(k, q.p.clone().addScaledVector(q.n, .5), 1.5, on * pulse * .5);
    }); },
  where: () => null });

// Rooftop cooling towers (the office blocks' air-conditioning): their saturated exhaust partly condenses in the humid night
// air. Droplets, not warm air, are what a thermal camera and the eye both see — air is transparent at 8–14 µm (M2
// verdict) — so the plume is drawn in IR and as a pale wisp in visible, and nothing is drawn for dry warm exhaust.
export const hvac = () => event({ name: 'HVAC cooling-tower plumes', t0: 14, t1: 60, bands: ['vis', 'ir'], freq: ['steam', 'dropletScatter'], note: 'The air-conditioning cooling towers on the roofs shed the day\'s heat by evaporating water. On a humid summer night their saturated exhaust partly condenses into a plume over the roof edge: pale in the lamplight, warm in thermal IR because the droplets emit. The dry warm air of an ordinary AC fan would be invisible to both.',
  init() { this.r = PLUMES.map(() => new Rib('ir', null, 5, 1)); this.v = PLUMES.map(() => new Rib('vis', '#cfd5de', 5)); },
  update() { const { t, T } = S, on = sm(14, 22, t), lit = .1 + .1 * night();
    PLUMES.forEach((q, k) => {
      // a saturated plume climbs well clear of the roof before it evaporates; one light westerly bends them all alike
      const p = q.p, rise = 12 + 3 * Math.sin(T * .7 + k * 1.3), bend = 1 + .4 * Math.sin(T * .5 + k), wind = new V3(1.2, 0, 3.5);
      const pts = [p.clone(), p.clone().add(new V3(0, rise * .35, 0)).addScaledVector(wind, .15 * bend), p.clone().add(new V3(0, rise * .7, 0)).addScaledVector(wind, .55 * bend), p.clone().add(new V3(0, rise, 0)).addScaledVector(wind, bend)];
      this.r[k].set(pts, 1, 3, on * (.36 + .1 * Math.sin(T * 1.3 + k)), 1);
      this.v[k].set(pts, 1.2, 4, on * lit, 1);
    }); },
  where: () => null });

export const steam = () => event({ name: 'Manhole steam', t0: 18, t1: 60, bands: ['vis', 'ir'], freq: ['steam', 'dropletScatter'], note: 'Steam from a leaking district-heating line seeps up through the manhole covers and condenses into thin rising plumes: pale white in the lamplight, warm in thermal IR because the droplets emit (the warm air around them alone would not show).',
  init() { this.r = MANHOLES.map(() => new Rib('ir', null, 5, 1)); this.v = MANHOLES.map(() => new Rib('vis', '#d8dde4', 5)); },
  update() { const { t, T } = S, on = sm(18, 26, t), lit = .14 + .1 * night();
    MANHOLES.forEach((m, k) => {
      const h = 2.6 + 1.1 * Math.sin(T * .8 + k * 2.1), drift = .6 * Math.sin(T * .45 + k);
      const pts = [m.clone(), m.clone().add(new V3(0, h * .45, 0)), m.clone().add(new V3(drift, h, 0))];
      this.r[k].set(pts, .6, 1.5, on * .4, 1);
      this.v[k].set(pts, .7, 1.8, on * lit, 1);
    }); },
  where: () => null });

// robot position along the sidewalk: -100 m at t = 16, 2.8 m per script second east; passes you at t ≈ 44
const ROBOT_Z = t => -100 + (t - 16) * 2.8;
// Kerbside delivery robot: a LiDAR fan at 905 nm that the eye never sees, plus LTE-M chatter.
export const robot = () => event({ name: 'Delivery robot: LiDAR sweep', t0: 16, t1: 60, bands: ['vis', 'ir', 'micro'], freq: ['ledWhite', 'lidar905', 'lteIoT'], note: 'A kerbside robot patrols toward you: an LED status pip, a 905 nm LiDAR fan only the IR band reveals, and an LTE-M modem answering to the masts.',
  init() {
    const g = new THREE.BoxGeometry(.95, .75, 1.15); g.translate(0, .5, 0);
    this.body = solid(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: .5, metalness: .3 })));
    this.body.visible = false; S.scene.add(this.body);
    this.vis = new Em('vis', '#cfe4ff'); this.s = new Em('ir', null, 1); this.l = new Rib('ir', null, 3, 1); this.m = new Em('micro');
  },
  update() { const { t, T } = S, cam = S.camera.position;
    this.body.visible = false;
    if (t < 16) return;
    // comes up the north sidewalk from the park toward you (it used to start behind you and never got into view)
    const x = SIDEWALK_X - 1.8, z = ROBOT_Z(t);
    if (z > cam.z + 20) return;   // passed the viewer: body and emitters off (no light or meter share behind you)
    this.body.position.set(x, 0, z); this.body.visible = true;
    const head = new V3(x, 1, z);
    this.vis.set(head.clone().setY(1.25), .7, .55);
    this.s.set(head, 1.1, .45);
    const d = new V3(Math.sin(T * 2.4), 0, 1).normalize();   // the fan scans ahead of it, east toward you
    this.l.set([head, head.clone().addScaledVector(d, 1.4), head.clone().addScaledVector(d, 3)], .14, .22, .8);
    this.m.set(head.clone().setY(1.2), .9, burst(t, 3.2, .5, .2) * .6); },
  where() { return new V3(SIDEWALK_X - 1.8, 1, ROBOT_Z(S.t)); } });

// Beyond the park, the airport's S-band surveillance radar sweeps the horizon.
export const radar = () => event({ name: 'Airport radar (S-band)', t0: 8, t1: 60, bands: ['micro'], freq: ['airportASR'], note: 'Out beyond the park the airport surveillance radar turns at one revolution per four seconds — 2.8 GHz microwave: you cannot see the aircraft it finds, only the fan.',
  init() {
    this.c = dirAE(232, .35).multiplyScalar(1750).add(new V3(0, 14, PARK_Z + 640));
    this.mast = new Em('micro'); this.fan = new Rib('micro', null, 10, 0);
  },
  update() { const { T, camera } = S; if (!inWin(this)) return;
    const near = 1 - sm(1200, 2200, this.c.distanceTo(camera.position));
    this.mast.set(this.c, 26, .4 * near);
    const a = (T % 4) / 4 * Math.PI * 2, r = 120, pts = [];
    for (let k = 0; k <= 7; k++) { const th = a - .5 + k / 7; pts.push(this.c.clone().add(new V3(Math.cos(th) * r, 0, Math.sin(th) * r))); }
    pts.push(this.c.clone());
    this.fan.set(pts, .7, 2.6, .5 * near); },
  where() { return this.c; } });

export const police = () => event({ name: 'Police car: LEDs & TETRA', t0: 30, t1: 40, bands: ['vis', 'micro'], freq: ['ledBlue', 'tetra'], note: 'A cruiser runs down the avenue: the light bar flashes its left and right blue LED heads in turn (amber is only a rear traffic advisor on European cars), and its TETRA radio (the European emergency-services net, ~390 MHz = 77 cm, microwave in this band table) chirps in short bursts.',
  init() {
    const g = new THREE.BoxGeometry(1.8, .8, 4.3); g.translate(0, .7, 0);
    const g2 = new THREE.BoxGeometry(1.55, .55, 2.2); g2.translate(0, 1.32, -.25);
    this.body = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x101418, roughness: .5, metalness: .5 }));
    this.body.add(new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: .6, metalness: .4 })));
    solid(this.body); this.body.visible = false; S.scene.add(this.body);
    this.b1 = new Em('vis', '#3060ff'); this.b2 = new Em('vis', '#3060ff'); this.r = new Em('micro');
  },
  update() { const { t, T } = S;
    if (t < 30 || t > 40) { this.body.visible = false; return; }
    const u = (t - 30) / 10, x = 5.3, z = 260 - u * 560;
    this.body.visible = true; this.body.position.set(x, 0, z); this.body.rotation.y = Math.PI;
    const a = T % .9 < .45, left = a ? 1.25 : .06, right = a ? .06 : 1.25;   // left/right heads alternate
    this.b1.set(new V3(x - .55, 1.85, z), 1.5, left); this.b2.set(new V3(x + .55, 1.85, z), 1.5, right);
    this.r.set(new V3(x, 1.2, z), 2.2, burst(t, 3.6, 1.3, .45) * .9); },
  where() { return null; } });
