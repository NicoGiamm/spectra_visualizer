// Events that belong to the polar snowfield (sky events, the aurora curtain itself included, come from the engine
// library). Several read the shared aurora curtain (`sky.aurora`, passed in from main.js): its substorm state `st`
// (I, gr, bk, rc) and its geometry `at(u, v)`, so the snow, the lake, the riometer and the AKR follow the same substorm.
import * as THREE from 'three';
import { V3, lerp, sm, env, clamp } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { skyP } from 'spectra/core/geom.js';
import { Em, Rib } from 'spectra/render/sources.js';
import { solid, visOnly } from 'spectra/render/instrument.js';
import { spectralGroup } from 'spectra/render/surface.js';
import { softTex } from 'spectra/render/textures.js';
import { night } from 'spectra/world/atmosphere.js';
import { heightAt, LAKE, SNOW_U, ICE, SPOTS, SURF } from './world.js';


const CABIN = new V3(-95, 0, -135);
CABIN.y = heightAt(CABIN.x, CABIN.z);

// The snowfield itself (its surface preset does the work: cold in IR, a UV mirror): the aurora's light on it.
export const snowfield = cur => event({ name: 'Snowfield under the aurora', t0: 0, t1: 60, bands: ['uv', 'ir', 'vis'], freq: ['snowUV', 'snowThermal', 'o5577', 'n2SecondPosAur'], tags: ['common'],
  note: 'Fresh snow reflects about 85 % of UV — at dusk it glows with the last UV skylight, later with the aurora\'s near-UV (N₂, 337 nm). In thermal infrared it is the coldest surface in sight: about −10 °C, radiating straight to the clear sky. Under the breakup the whole field turns faintly green.',
  update() { const st = cur.st || { I: 0, bk: 0 }, I = st.I;
    SNOW_U.uAurVis.value = S.on.vis ? I : 0; SNOW_U.uAurUV.value = I * (.25 + .75 * st.bk) * .35;
    S.act.uv += SNOW_U.uAurUV.value * 1.5; S.act.vis += I * .2; },
  where() { return SPOTS.snow; } });

// The frozen lake: new ice, warmer than the snow in IR, about like it in microwave, a dark mirror in visible light.
export const frozenLake = cur => event({ name: 'Frozen lake', t0: 0, t1: 60, bands: ['ir', 'micro', 'vis'], freq: ['iceThermal', 'waterCold', 'o5577'], tags: ['common'],
  note: 'New, bare ice a few centimetres thick: the water underneath is at 0 °C and the ice conducts that warmth up, so in thermal infrared the lake reads several degrees warmer than the snow. In microwave the clear ice lets the water show through, but its two surfaces soften the reflection: ice-covered water glows much warmer than open water would, about like the snow. In visible light the black ice mirrors the sky — and the green curtain.',
  init() { this.p = new V3(LAKE.x, heightAt(LAKE.x, LAKE.z) + 1, LAKE.z); },
  update() { const { t } = S, st = cur.st, I = st ? st.I : 0, d = 1 - sm(0, 16, t);
    ICE.mat.color.setRGB(.015 + .06 * d + .012 * I, .018 + .04 * d + .08 * I, .03 + .05 * d + .035 * I); S.act.vis += I * .1; },
  where() { return this.p; } });

// The red cabin on the south shore: lit windows, the stove pipe and its smoke in IR; the insulated walls only a few K above the snow.
export const cabin = () => event({ name: 'Cabin on the shore', t0: 0, t1: 60, bands: ['vis', 'ir'], freq: ['incandescent', 'thermal290', 'thermal700', 'plumeHeat'], tags: ['common'],
  note: 'In thermal infrared a heated cabin leaks its warmth where it is least insulated: the windows glow against the −10 °C snow, while the log walls stay only a few degrees above it. The stove pipe is hot (~700 K) and its smoke carries the heat up into the still air.',
  init() {
    const { x, y, z } = CABIN, G = new THREE.Group(); G.position.set(x, y, z);
    const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(.22, .03, .02), roughness: .9 }), roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(.5, .52, .58), roughness: .9 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 5), wood); box.position.y = 1.5; G.add(box);
    [-1, 1].forEach(s => { const r = new THREE.Mesh(new THREE.BoxGeometry(7.6, .3, 3.5), roof); r.position.set(0, 3.9, s * 1.3); r.rotation.x = s * .6; G.add(r); });   // snow on the roof
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x111111 })); ch.position.set(2.2, 4.8, .8); G.add(ch);
    this.winMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    [-1.8, 1.8].forEach(xx => { const w = new THREE.Mesh(new THREE.PlaneGeometry(1, .8), this.winMat); w.position.set(xx, 1.8, 2.51); G.add(w); });
    S.scene.add(spectralGroup(G, SURF.cabin, { weight: .05 }));
    this.light = new THREE.PointLight(0xffa050, 0, 40, 1.6); this.light.position.set(x, y + 1.8, z + 5); S.scene.add(this.light);
    this.wins = [-1.8, 1.8].map(xx => new V3(x + xx, y + 1.8, z + 2.6));
    this.pipe = new V3(x + 2.2, y + 5.5, z + .8); this.center = new V3(x, y + 1.8, z + 2.6); this.roofP = new V3(x, y + 4.4, z);
    this.smoke = Array.from({ length: 9 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false, opacity: 0 })); S.scene.add(visOnly(s)); return s; });
    this.smokeIR = this.smoke.map(() => new Em('ir')); this.wv = this.wins.map(() => new Em('vis', '#ffa040')); this.wi = this.wins.map(() => new Em('ir')); this.hot = new Em('ir');
  },
  update() {
    const { t, T } = S, lit = sm(6, 10, t), n = night();
    this.winMat.color.setRGB(.04 + 1.6 * lit, .02 + .85 * lit, .005 + .3 * lit);
    this.light.intensity = S.on.vis ? lit * 30 : 0;
    this.wins.forEach((p, i) => { this.wv[i].set(p, 2.4, lit * .5); this.wi[i].set(p, 1.6, .5); });
    this.hot.set(this.pipe, 1.2, .9);
    const sc = lerp(.5, .05, n);
    this.smoke.forEach((s, k) => {   // still, cold air: the plume rises almost straight up
      const age = (T * .18 + k / 9) % 1, p = this.pipe.clone().add(new V3(age * 1.5 + Math.sin(age * 5 + k) * .3, age * 14, age * .8));
      s.position.copy(p); s.scale.setScalar(.7 + age * 4); s.material.opacity = .4 * (1 - age) * (.4 + .6 * sm(0, .1, age)); s.material.color.setRGB(sc, sc, sc * 1.05);
      this.smokeIR[k].set(p, .8 + age * 2.4, .5 * (1 - age));
    });
  },
  where() { return this.roofP; } });

// The aurora's near-UV (N₂ second positive, 337 nm) along the curtain's lower border — unlike its far-UV LBH bands
// (drawn by the curtain, Orbit only), this reaches the ground. The curtain is ~100 km up: drawn as a sky source,
// origin 'high' would hide it in Ground mode, so it keeps 'ground' (TRANSMIT uv.ground = 1).
export const auroraNearUV = cur => event({ name: 'Aurora near-UV (N₂ 337 nm)', t0: cur.t0, t1: cur.t1, bands: ['uv'], freq: ['n2SecondPosAur'],
  note: 'The same electrons that make the green light excite nitrogen, which also glows in near-ultraviolet at 337 nm, brightest along the curtain\'s lower edge where the fastest electrons stop. Unlike the far-UV, it passes the ozone layer and reaches you.',
  init() { this.r = new Rib('uv', null, 40); },
  update() { const st = cur.st; this.p = null; if (!st || st.I <= .005) return;
    const c = S.camera.position, pts = Array.from({ length: 40 }, (_, k) => cur.at(.1 + .8 * k / 39, .06).add(c));
    this.r.set(pts, 260, 260, st.I * (.35 + .65 * st.bk)); this.p = pts[20]; },
  where() { return this.p; } });

// Auroral kilometric radiation: beamed out into space from 2000–20 000 km above the oval and turned back by the
// ionosphere: it almost never reaches the ground (rare detections in the dark Antarctic winter: LaBelle & Anderson 2011,
// Geophys. Res. Lett. 38, L04104) — not the air's absorption, which is what the Ground / Orbit switch models. So it is
// never drawn as a source here; the label marks the direction of its source (almost overhead, a little south of the
// magnetic zenith, out of view) while the breakup drives it. (Drawn, its 1.2 km wavelength would also set the radio
// band's diffraction blur and smear the whole radio view: compose.js sigmaPx.)
export const akr = cur => event({ name: 'Auroral kilometric radiation', t0: cur.t0 + 20, t1: cur.t1 - 4, bands: ['radio'], freq: ['akr'],
  note: 'During the breakup, electrons spiralling down the field lines thousands of kilometres above the aurora act as a natural maser at ~250 kHz — the Earth\'s strongest radio emission, discovered by satellites. Its source is almost overhead, a little to the south and out of view. It is beamed out into space and turned back by the ionosphere, so it almost never reaches the ground (only a few detections, in the dark Antarctic winter): the label only marks where it comes from.',
  update() { const st = cur.st, I = st ? env(S.t, this.t0, this.t1, 2) * clamp(st.bk + .35 * st.rc) * night() : 0;
    this.p = I > .05 ? skyP(212, 58) : null; },
  where() { return this.p; } });

// Riometer: crossed dipoles on a frame near the cabin, listening to the cosmic radio noise straight up; during the
// breakup the D-region absorption swallows part of it. Drawn as the received noise coming down the antenna's beam
// (streamlines + a mouth ring), dimming with the absorption.
export const riometer = cur => event({ name: 'Riometer', t0: 0, t1: 60, bands: ['radio'], freq: ['cosmicNoise38'], tags: ['stylised'],
  note: 'A riometer measures how much of the steady radio hiss from the Galaxy (38 MHz) gets through the ionosphere. When the substorm\'s energetic electrons hit the lower ionosphere, it absorbs part of that noise and the received level drops by a few decibels — the antenna "sees" the sky go dark in radio while it lights up in visible light.',
  init() {
    const x = CABIN.x + 18, z = CABIN.z + 22, y = heightAt(x, z), H = 2.2, pts = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => pts.push(new V3(x + a, y, z + b), new V3(x + a * .2, y + H, z + b * .2)));
    pts.push(new V3(x - 1.8, y + H, z), new V3(x + 1.8, y + H, z), new V3(x, y + H, z - 1.8), new V3(x, y + H, z + 1.8));   // crossed dipoles
    S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x15161c }))));
    this.base = new V3(x, y + H, z); this.top = new V3(x, y + 260, z);
    this.lines = Array.from({ length: 5 }, () => new Rib('radio', null, 3)); this.mouth = new Rib('radio', null, 25); this.e = new Em('radio');
  },
  update() { const st = cur.st, absorb = st ? clamp(.8 * st.bk + .3 * st.rc) : 0, I = .55 * (1 - .75 * absorb);
    const ring = Array.from({ length: 25 }, (_, k) => { const a = k / 24 * 6.283; return this.top.clone().add(new V3(Math.cos(a) * 70, 0, Math.sin(a) * 70)); });
    this.mouth.set(ring, 5, 5, I * .6);
    for (let i = 0; i < 4; i++) this.lines[i].set([ring[i * 6], this.base], 6, 1.5, I * .5, 1);
    this.lines[4].set([this.top, this.base], 8, 2, I * .7, 1);
    this.e.set(this.base, 6, I * (.8 + .2 * Math.sin(S.T * 3)));
    this.absorb = absorb; },
  where() { return this.base; } });

// A snowmobile coming home along the south-west shore (on land: new ice won't carry it): LED headlight and tail light,
// a hot two-stroke exhaust and a warm rider.
const SLED_A = new V3(-260, 0, -420), SLED_B = new V3(CABIN.x - 15, 0, CABIN.z - 10);
export const snowmobile = () => event({ name: 'Snowmobile', t0: 25, t1: 33, bands: ['vis', 'ir'], freq: ['ledWhite', 'ledRed', 'thermal700', 'thermal310'], tags: ['common', 'stylised'],
  note: 'Someone heads home along the shore: a white LED headlight and red tail light, the hot exhaust of the engine (~700 K) trailing a warm plume, and the rider\'s body heat — easy to follow in thermal infrared against the cold snow. Slowed right down so you can follow it: the real ride of about 300 m takes under a minute.',
  init() { this.h = new Em('vis', '#f4f6ff'); this.tl = new Em('vis', '#ff2a20'); this.eng = new Em('ir', null, 1); this.ex = new Rib('ir', null, 6, 1); this.rider = new Em('ir', null, 1); },
  update() { const { t } = S, f = (t - this.t0) / (this.t1 - this.t0); this.p = null; if (f < 0 || f > 1) return;
    const k = sm(0, 1, f), P = SLED_A.clone().lerp(SLED_B, k), dir = SLED_B.clone().sub(SLED_A).setY(0).normalize();
    P.y = heightAt(P.x, P.z) + .6; this.p = P; const I = env(t, this.t0, this.t1, .8);
    this.h.set(P.clone().addScaledVector(dir, 1.2), 3.5, I * 1.1); this.tl.set(P.clone().addScaledVector(dir, -1.3), 1.2, I * .8);
    const ex = P.clone().addScaledVector(dir, -1.4);
    this.eng.set(P, 1.6, I * .55); this.rider.set(P.clone().add(new V3(0, .8, 0)), 1.1, I * .4);
    this.ex.set([ex, ex.clone().addScaledVector(dir, -5).add(new V3(0, .8, 0))], .8, 2.2, I * .45, 1); },
  where() { return this.p; } });
