// The city's radio & microwave ecosystem: crowds of small emitters (phones, Bluetooth, key fobs,
// scooters), multipath bouncing off the facades (engine/world/bounce.js), the ambient RF haze of
// the street canyon, the tram's pantograph arcing, the power line's ELF hum, LED switching
// interference and the FM/DAB mast on the broadcast hill.
import * as THREE from 'three';
import { V3, sm, R, hash2 } from 'spectra/core/util.js';
import { dirAE } from 'spectra/core/geom.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { Em, Rib, EmField } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { bounce, along } from 'spectra/world/bounce.js';
import { addTx, addHits } from 'spectra/render/surface.js';
import { burst, inWin, litNow } from './events.js';
import { SIDEWALK_X, FACE_X, PARK_Z, TRAM_Z, WINDOWS, PARKED, BUS, FM, MAST, PYLONS, POWER_Z, PYLON_H, FLATS, BOXES, SIGNS } from './world.js';

// ---------------------------------------------------------------- 4.1 the crowd

export const crowd = () => event({ name: 'Pedestrians & phones', t0: 4, t1: 60, bands: ['ir', 'micro'], freq: ['thermal310', 'lte', 'bluetooth'], tags: ['time-compressed'], note: 'A hundred pedestrians on the two sidewalks: warm bodies on a thermal camera, phones pinging LTE/5G, Bluetooth earbuds chirping on their own slower cycle. Time-compressed: an idle phone in a pocket only talks to the network now and then, not every few seconds.',
  init() {
    this.p = Array.from({ length: 110 }, () => ({ x: (R() < .5 ? 1 : -1) * SIDEWALK_X + (R() - .5) * 3, z0: -30 + R() * 280, dir: R() < .5 ? -1 : 1, v: .5 + R() * 1.2, per: 2.5 + R() * 5.5, ph: R() * 11, bper: 5 + R() * 13, bph: R() * 17 }));
    this.b = new EmField('ir', this.p.length, null, 1); this.d = new EmField('micro', this.p.length);
  },
  update() { const { t } = S, cam = S.camera.position; if (!inWin(this)) return;
    this.p.forEach((q, k) => {
      // walkers loop along their 280 m stretch of sidewalk (z −30…250) and fade in/out over the last 12 m at each
      // end, instead of drifting up to ~150 m past the canyon by the end of the walk
      const span = 280, u = (((q.z0 + 30 + q.dir * q.v * t * 1.5) % span) + span) % span, z = u - 30;
      if (Math.abs(z - cam.z) > 140) return;
      const edge = sm(0, 12, u) * sm(0, 12, span - u); if (edge <= 0) return;
      const pos = new V3(q.x, 1.05, z);
      this.b.set(k, pos, 1.3, .4 * edge);
      const ping = burst(t, q.per, q.ph, .2) + .4 * burst(t, q.bper, q.bph, .12);
      if (ping > .02) this.d.set(k, pos.clone().setY(1.35), .8, ping * .75 * edge);
    }); },
  where: () => null });

// A few fast e-scooters on the same sidewalks: warm wheels/riders, LTE-M modems on the poles.
export const scooters = () => event({ name: 'E-scooters', t0: 6, t1: 56, bands: ['ir', 'micro'], freq: ['thermal310', 'lteIoT'], note: 'Rental scooters zip down the sidewalks, their onboard LTE-M modem chattering to the masts; the rider and motor read warm in IR.',
  init() {
    this.s = Array.from({ length: 5 }, () => ({ x: (R() < .5 ? 1 : -1) * (SIDEWALK_X - 1.6) + (R() - .5) * 2, z0: R() * 400, dir: R() < .5 ? -1 : 1, v: 6.5 + R() * 3.5, per: 2.6 + R() * 3, ph: R() * 7 }));
    this.b = new EmField('ir', this.s.length, null, 1); this.m = new EmField('micro', this.s.length);
  },
  update() { const { t } = S, cam = S.camera.position; if (!inWin(this)) return;
    this.s.forEach((q, k) => {
      const z = (((q.z0 + q.dir * q.v * t + 80) % 400) + 400) % 400 - 80;   // loop the visible stretch
      if (Math.abs(z - cam.z) > 160) return;
      const pos = new V3(q.x, .8, z);
      this.b.set(k, pos, 1.5, .5);
      const b = burst(t, q.per, q.ph, .22);
      if (b > .02) this.m.set(k, pos.clone().setY(1.15), .9, b * .7);
    }); },
  where: () => null });

// Parked cars: direct TPMS sensors are motion-triggered and sleep once the car stops, so a parked car is quiet
// until a key fob unlocks or locks it (433.92 MHz here; many EU fobs use 868 MHz) — a short 69 cm microwave chirp.
export const parkedRF = () => event({ name: 'Parked cars: key fobs', t0: 0, t1: 60, bands: ['micro'], freq: ['keyFob'], note: 'Now and then someone unlocks a parked car: the key fob sends a short 433.92 MHz burst (a 69 cm microwave), so the kerb side twinkles one car at a time. The tyre-pressure sensors stay silent — they only transmit while the wheels turn.',
  init() {
    this.c = PARKED.map(q => ({ p: q.p.clone().setY(.55), per: 5 + q.k * 22, ph: q.k * 37, side: q.side }));
    this.f = new EmField('micro', this.c.length);
  },
  update() { const { t, camera } = S, cam = camera.position;
    this.c.forEach((q, k) => {
      if (Math.abs(q.p.z - cam.z) > 120) return;
      const I = burst(t, q.per * 3.3 + 7, q.ph + 2.6, .5) * 1.1;   // fob unlock/lock press
      if (I > .02) this.f.set(k, q.p, 1.2, I);
    }); },
  where: () => null });

// The bus shelter: a backlit LED advertising screen and the shelter's LTE-M modem ticketing machines.
export const busStop = () => event({ name: 'Bus shelter: LED screen', t0: 9, t1: 60, bands: ['vis', 'micro'], freq: ['ledWhite', 'lteIoT'], note: 'The advertising panel across the avenue snaps on (white LED, no IR tail like the sodium lamps) and posts to the network through its shelter modem.',
  init() { this.scr = new Em('vis', '#bfe0ff'); this.mod = new Em('micro'); },
  update() { const { t, T } = S; if (!inWin(this)) return;
    const on = sm(9, 12, t) * (hash2(Math.floor(T * 1.7), 3) < .07 ? .3 : 1);   // an ad change briefly blanks the panel
    this.scr.set(BUS.screen, 2.4, on * 1.05);
    this.mod.set(BUS.p.clone().setY(1.4), 1.1, burst(t, 3.1, .8, .25) * .8); },
  where() { return BUS.screen; } });

// ---------------------------------------------------------------- 4.2 multipath

export const multipath = () => event({ name: 'Multipath off the facades', t0: 6, t1: 52, bands: ['micro'], freq: ['nr35', 'wifi24', 'wifi5'], tags: ['stylised', 'time-compressed'], note: 'Packets from the 5G mast and the strongest routers ricochet 2–4 times down the street canyon off the facades and the asphalt, each hop about −6 dB (a quarter of the power) weaker than the last; the facade or asphalt spot each ray hits flashes in the microwave surface term. Stylised and time-compressed: a real packet crosses the canyon at the speed of light in well under a microsecond and spreads as a wavefront; here it crawls along one ray as a ribbon.',
  init() {
    this.walls = BOXES.concat([{ min: new V3(-2e3, -.2, -2e3), max: new V3(2e3, 0, 2e3) }]);   // + the street itself
    // ray i < 2 leaves the mast panels, the others leave one of the routers nearest the viewer (picked per cycle)
    this.rays = Array.from({ length: 8 }, (_, i) => ({ i, per: 2.4 + R() * 2, ph: R() * 9, cyc: -1, ray: null, rib: new Rib('micro', null, 12, 0) }));
    this.hl = [];                                    // facade/asphalt hit points flashing in the microwave surface term
    addHits('micro', () => this.hl);
  },
  update() { const { t } = S, cam = S.camera.position; this.hl = [];
    if (t < this.t0 || t > this.t1) return;
    const on = sm(this.t0, this.t0 + 1.5, t) * (1 - sm(this.t1 - 1.5, this.t1, t));
    for (const q of this.rays) {
      const cyc = Math.floor((t + q.ph) / q.per);
      if (cyc !== q.cyc) { q.cyc = cyc;
        const h = k => hash2(cyc * 31 + q.i * 7, k);
        let org;
        if (q.i < 2) org = MAST.panels[q.i].clone();
        else {
          const zc = cam.z - 15, near = WINDOWS.slice().sort((a, b) => Math.abs(a.z - zc) - Math.abs(b.z - zc)).slice(0, 3);   // routers just ahead
          org = near[Math.floor(h(1) * near.length)].clone(); org.x -= Math.sign(org.x) * .4;   // just off the facade
        }
        // into the canyon: across the street toward the opposite facade, angled 20-65° down the street (mostly
        // west, ahead of the viewer, who cannot turn round), so the packet zig-zags between the walls and finally
        // hits the asphalt. A direction that escapes over the roofs after a single hit is re-drawn (hashed, up to
        // 6 tries) so every packet reflects 2-4 times.
        const across = -Math.sign(org.x), maxHits = 2 + Math.floor(h(5) * 3);
        q.ray = null;
        for (let k = 0; k < 6; k++) {
          const g = j => h(j + 10 * k), el = (q.i < 2 ? -18 - 20 * g(1) : -3 - 9 * g(2)) * Math.PI / 180;
          const a = (20 + 45 * g(3)) * Math.PI / 180, dz = g(4) < .8 ? -1 : 1, ce = Math.cos(el);
          const ray = bounce(org, new V3(across * Math.cos(a) * ce, Math.sin(el), dz * Math.sin(a) * ce), this.walls, maxHits, 200);
          if (!q.ray || ray.hits.length > q.ray.hits.length) q.ray = ray;
          if (ray.hits.length >= 2) break;
        }
      }
      const age = (((t + q.ph) % q.per) + q.per) % q.per, dur = q.per * .9;
      if (age >= dur || !q.ray) continue;
      const s = age / dur * (200 + 22);
      const seg = along(q.ray, s - 22, s);
      if (seg.pts.length < 2) continue;
      q.rib.set(seg.pts, .55, .8, on * .95 * Math.pow(.25, seg.hits), 0);   // −6 dB per bounce: drawn intensity (power) ×¼
      // each reflection point flashes as the packet head passes it, with the same per-bounce fade
      q.ray.hits.forEach((h, k) => { const past = s - q.ray.len[k + 1];
        if (past >= 0 && past < 70) this.hl.push({ p: h.p, power: on * 2.4 * Math.pow(.25, k) * (1 - past / 70) }); });
    } },
  where: () => null });

// ---------------------------------------------------------------- 4.3 ambient haze

export const haze = () => event({ name: 'Street-canyon RF haze', t0: 0, t1: 60, bands: ['micro'], freq: ['wifi24', 'wifi5', 'lte'], note: 'The canyon itself is a cloud of microwave: faint crackle patches fill the street between the facades, denser where more access points are live nearby. Walk into the park and it thins out — you feel yourself leaving the RF zone.',
  init() {
    // fixed patches in the canyon volume (hash-placed, no R); each knows how many routers sit within 40 m
    this.q = Array.from({ length: 140 }, (_, i) => {
      const p = new V3((hash2(i, 1) - .5) * 2 * (FACE_X - 1.5), 2 + 22 * hash2(i, 2) ** 1.6, PARK_Z + 2 + hash2(i, 3) * 260);
      return { p, s: 2.5 + 3 * hash2(i, 4), ph: hash2(i, 5) * 6.28, n: FLATS.filter(f => f.p.distanceTo(p) < 40) };
    });
    this.f = new EmField('micro', this.q.length);
  },
  update() { const { t, T, camera } = S, cam = camera.position, lit = litNow(t);
    this.q.forEach((q, k) => {
      const d = q.p.distanceTo(cam); if (d < 4 || d > 110) return;
      const live = q.n.reduce((a, f) => a + (f.shop || f.k < lit / .56 ? 1 : .35), 0);   // beacons from every AP, data from the busy ones
      const I = sm(2, 25, live) * (1 - sm(60, 110, d)) * (.55 + .45 * Math.sin(T * 1.3 + q.ph)) * .09;
      this.f.set(k, q.p, q.s, I);
    }); },
  where: () => null });

// ---------------------------------------------------------------- 4.4 true radio

export const tram = () => event({ name: 'Tram: pantograph arcing', t0: 11, t1: 58, bands: ['radio', 'vis', 'uv'], freq: ['arcRF', 'arcLight', 'arcUV'], note: 'The cross-street tram drags its pantograph along the contact wire: broadband radio crackle and blue-white copper-arc light with UVA — the trolley equivalent of a welder flash, overhead right in front of you.',
  init() {
    const g = new THREE.BoxGeometry(13, 3.1, 2.8); g.translate(0, 1.55, 0);
    this.body = solid(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: .5, metalness: .45 })));
    const w = new THREE.BoxGeometry(12.2, .9, 2.86); w.translate(0, 2.05, 0);           // lit passenger windows
    this.body.add(solid(new THREE.Mesh(w, new THREE.MeshBasicMaterial({ color: 0xd8c9a0 }))));
    this.body.visible = false; S.scene.add(this.body);
    this.fl = new Em('vis', '#cfe6ff'); this.uv = new Em('uv'); this.ar = new Rib('radio', null, 6, 0); this.p = null;
  },
  update() { const { t, T } = S; this.body.visible = false; this.p = null;
    for (const [a, b] of [[11.5, 15.5], [38, 41.5], [54, 57.5]]) {   // three passes; the last one late in the night
      if (t < a || t > b) continue;
      const u = (t - a) / (b - a), x = -175 + u * 350, on = 1 - sm(b - .8, b, t);
      this.body.position.set(x, 0, TRAM_Z); this.body.visible = true;
      const spark = hash2(Math.floor(T * 9), 4) < .62 ? .55 + .45 * hash2(Math.floor(T * 31), 7) : 0;
      const top = new V3(x, 6.1, TRAM_Z);
      this.ar.set([top, new V3(x, 3.2, TRAM_Z)], .3, .3, on * spark * .9);
      this.fl.set(new V3(x, 4.4, TRAM_Z), 2.4, on * spark * 1.15);
      this.uv.set(new V3(x, 4.8, TRAM_Z), 1.6, on * spark * .6);
      this.p = new V3(x, 3.1, TRAM_Z);
    } },
  where() { return this.p; } });

export const powerlines = () => event({ name: 'Power line: ELF hum', t0: 0, t1: 60, bands: ['radio'], freq: ['powerHum', 'coronaRF'], note: 'The high-voltage line across the far park hums at 50 Hz — a signal so long-wavelength it counts as radio here — with corona noise crackling off the crossarms: the longest ladder in the city, faint but unbroken.',
  init() {
    this.a = [];
    for (const x of PYLONS) { this.a.push(new V3(x, PYLON_H - 4, POWER_Z - 7)); this.a.push(new V3(x, PYLON_H - 10, POWER_Z + 9)); }
    this.f = new EmField('radio', this.a.length);
  },
  update() { const { T, camera } = S, cam = camera.position;
    this.a.forEach((p, k) => {
      const near = 1 - sm(500, 1100, p.distanceTo(cam));
      const cor = hash2(Math.floor(T * 2) + k * 13, 77) < .1 ? .3 : 0;
      this.f.set(k, p, 30, (.055 + cor) * (.4 + .6 * near));
    }); },
  where: () => null });

export const ledSwitch = () => event({ name: 'LED switching interference', t0: 12, t1: 60, bands: ['radio'], freq: ['smpsEMI'], note: 'Cheap LED drivers behind the shop signs flicker at half-mains cycles; that switching noise leaks into the radio band right at the sign — short broadband blips compressed against the script time.',
  init() { this.s = SIGNS.filter(q => !q.neon); this.f = new EmField('radio', this.s.length); },
  update() { const { t } = S; if (!inWin(this)) return;
    this.s.forEach((q, k) => { const b = burst(t, 1.6 + q.k * 5, q.k * 13.7, .22) * .5; if (b > .02) this.f.set(k, q.p, 1.8, b); }); },
  where: () => null });

export const fmMast = () => event({ name: 'FM & DAB on the hill', t0: 0, t1: 60, bands: ['radio', 'vis'], freq: ['fm', 'dab', 'navRed'], note: 'The lattice mast on the broadcast hill keeps the neighbourhood alive: FM (100 MHz) and DAB+ Band III stream from it, and the radio surface term paints dashes on every facade facing the hill. Red aviation light on the cap.',
  init() {
    this.fm = new Em('radio'); this.dab = new Em('radio'); this.red = new Em('vis', '#ff2020');
    addTx('radio', () => ({ p: FM.top, power: 2.4 + 1.2 * Math.max(0, Math.sin(S.t * .4)) }));
  },
  update() { const { t, T } = S;
    const live = .55 + .45 * sm(0, 8, t);
    this.fm.set(FM.top.clone().setY(FM.top.y - 14), 120, live * .5);
    this.dab.set(FM.top.clone().setY(FM.top.y - 70), 80, burst(t, .66, .2, .2) * live * .8);
    this.red.set(FM.top, 30, T % 2.2 < .6 ? 1.2 : .05); },
  where() { return FM.top; } });
