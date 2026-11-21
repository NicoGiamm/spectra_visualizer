// Events that belong to the mountain trail (sky events come from the engine library).
import * as THREE from 'three';
import { V3, DEG, lerp, sm, env, R } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { deg, skyP } from 'spectra/core/geom.js';
import { Em, Rib } from 'spectra/render/sources.js';
import { solid, visOnly, topoMat } from 'spectra/render/instrument.js';
import { softTex } from 'spectra/render/textures.js';
import { trailX, heightAt, terrainMat, NEAR_ROCKS } from './world.js';

const warmF = () => 1 - sm(0, 45, S.t);
const CAMP_Z = -118, campPos = () => { const x = trailX(CAMP_Z) - 1.8; return new V3(x, heightAt(x, CAMP_Z), CAMP_Z); };

export const alpenglow = () => event({ name: 'Alpenglow', t0: 4, t1: 16, bands: ['vis'], note: 'Snowy peaks opposite the Sun turn pink in the last light, just above the ridge ahead.',
  update() { S.act.vis += .3 * (1 - sm(4, 16, S.t)); }, where: () => skyP(245, 5) });

export const radioTower = () => event({ name: 'Radio / TV tower', t0: 0, t1: 60, bands: ['radio', 'vis'], note: 'FM & TV broadcast waves and a blinking red aviation light on the ridge.',
  init() {
    const a = 330 * DEG, x = Math.cos(a) * 1300, z = Math.sin(a) * 1300, y = heightAt(x, z), H = 70, pts = [];
    const leg = k => new V3(x + Math.cos(k * 2.09) * 5, y, z + Math.sin(k * 2.09) * 5);
    for (let k = 0; k < 3; k++) { pts.push(leg(k), new V3(x, y + H, z)); }
    for (let s = 0; s < 8; s++) for (let k = 0; k < 3; k++) { const f0 = s / 8, f1 = (s + 1) / 8; pts.push(leg(k).lerp(new V3(x, y + H, z), f0), leg((k + 1) % 3).lerp(new V3(x, y + H, z), f1)); }
    S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0b0b10 }))));
    this.top = new V3(x, y + H, z); this.light = new Em('vis', '#ff2020'); this.rad = new Em('radio');
  },
  update() { this.light.set(this.top, 5, S.T % 1.5 < .5 ? 1.3 : .05); this.rad.set(this.top, 170, .8); }, where() { return this.top; } });

export const warmRocks = () => event({ name: 'Warm rocks cooling', t0: 0, t1: 45, bands: ['ir'], note: 'Rocks heated during the day give off infrared as they cool.',
  init() { this.e = NEAR_ROCKS.map(() => new Em('ir')); },
  update() { const w = warmF(), on = S.on; topoMat.uniforms.uWarm.value = on.ir ? w : 0; S.act.ir += w * .4; terrainMat.emissive.setRGB(on.ir ? w * .05 : 0, on.ir ? w * .012 : 0, 0);
    NEAR_ROCKS.forEach((r, i) => this.e[i].set(r.p, r.s * 1.8, w * .6)); },
  where: () => null });

export const hut = () => event({ name: 'Mountain hut', t0: 8, t1: 34, bands: ['vis', 'ir', 'micro'], note: 'Lit windows, heat leaking from the chimney, Wi-Fi router (2.4 GHz microwave).',
  init() {
    const z = 6, x = trailX(z) + 16, y = heightAt(x, z), G = new THREE.Group(); G.position.set(x, y, z);
    const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(.09, .05, .03), roughness: .9 }), roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(.04, .035, .035), roughness: .8 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, 4.2, 5), wood); box.position.y = 1.1; G.add(box);
    [-1, 1].forEach(s => { const r = new THREE.Mesh(new THREE.BoxGeometry(6.6, .18, 3.4), roof); r.position.set(0, 4.1, s * 1.35); r.rotation.x = s * .62; G.add(r); });
    const gable = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 6, 3, 1), wood); gable.rotation.z = Math.PI / 2; gable.position.y = 3.8; gable.scale.set(1, 1, 1.15); G.add(gable);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.8, .6), wood); ch.position.set(1.6, 5, .9); G.add(ch);
    this.winMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    [-1.4, 1.4].forEach(zz => { const w = new THREE.Mesh(new THREE.PlaneGeometry(.9, .75), this.winMat); w.position.set(-3.01, 1.9, zz); w.rotation.y = -Math.PI / 2; G.add(w); });
    S.scene.add(solid(G));
    this.light = new THREE.PointLight(0xffa050, 0, 30, 1.6); this.light.position.set(x - 4, y + 1.8, z); S.scene.add(this.light);
    this.wins = [-1.4, 1.4].map(zz => new V3(x - 3.1, y + 1.9, z + zz));
    this.chim = new V3(x + 1.6, y + 6, z + .9); this.center = new V3(x, y + 2, z); this.roof = new V3(x, y + 5, z);
    this.smoke = Array.from({ length: 9 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false, opacity: 0 })); S.scene.add(visOnly(s)); return s; });
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

export const deer = () => event({ name: 'Deer crossing', t0: 13, t1: 27, bands: ['ir'], note: 'Hard to see by eye at dusk, bright on a thermal camera.',
  init() {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(.09, .06, .04), roughness: .9 }), G = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .9, 4, 8), m); body.rotation.z = Math.PI / 2; body.position.y = 1.05; G.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.09, .14, .7, 6), m); neck.position.set(.66, 1.38, 0); neck.rotation.z = -.6; G.add(neck);
    const head = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .26, 3, 6), m); head.position.set(.88, 1.66, 0); head.rotation.z = Math.PI / 2 - .4; G.add(head);
    [[-1, .3], [1, .3], [-1, -.2], [1, -.2]].forEach(([s, a]) => { const an = new THREE.Mesh(new THREE.CylinderGeometry(.015, .02, .45, 4), m); an.position.set(.82 + a * .1, 1.95, s * .1); an.rotation.set(s * .4, 0, a); G.add(an); });
    this.legs = [[.45, .15], [.45, -.15], [-.45, .15], [-.45, -.15]].map(([x, z]) => { const L = new THREE.Group(); L.position.set(x, .9, z); const c = new THREE.Mesh(new THREE.CylinderGeometry(.045, .03, .9, 5), m); c.position.y = -.45; L.add(c); G.add(L); return L; });
    this.g = solid(G); S.scene.add(G); G.visible = false;
    this.a = new V3(30, 0, -2); this.b = new V3(-32, 0, -13); this.body = new Rib('ir', null, 4, 1); this.headIR = new Em('ir', null, 1);
  },
  update() {
    const { t, T } = S, p = (t - 13) / 14; this.g.visible = p > 0 && p < 1; if (!this.g.visible) { this.p = null; return; }
    const x = lerp(this.a.x, this.b.x, p), z = lerp(this.a.z, this.b.z, p), y = heightAt(x, z), dx = this.b.x - this.a.x, dz = this.b.z - this.a.z;
    this.g.position.set(x, y, z); this.g.rotation.y = Math.atan2(-dz, dx);
    this.legs.forEach((L, i) => L.rotation.z = Math.sin(T * 7 + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.2 : 0)) * .45);
    const I = env(t, 13, 27, 1), fw = new V3(dx, 0, dz).normalize();
    this.p = new V3(x, y + 1.05, z); this.body.set([this.p.clone().addScaledVector(fw, -.72), this.p.clone().addScaledVector(fw, .55)], 1.5, 1.1, I * .55); this.headIR.set(this.p.clone().addScaledVector(fw, .9).add(new V3(0, .62, 0)), 1.1, I * .4);
  }, where() { return this.p; } });

export const fireflies = () => event({ name: 'Fireflies', t0: 15, t1: 35, bands: ['vis'], note: 'Bioluminescence is "cold light": visible flashes with almost no infrared.',
  init() { this.f = Array.from({ length: 120 }, () => { const z = -170 + R() * 210, x = trailX(z) + (R() - .5) * 26; return { b: new V3(x, heightAt(x, z) + .3 + R() * 2.2, z), s: .5 + R(), p: R() * 6, r: 1.5 + R() * 2, e: new Em('vis', '#b8ff3a') }; }); },
  update() { const { t, T } = S, I = env(t, 15, 35, 2); if (I <= 0) return;
    this.f.forEach(f => { const b = Math.max(0, Math.sin(T * f.r + f.p)) ** 8; f.e.set(f.b.clone().add(new V3(Math.sin(T * .5 * f.s + f.p) * .8, Math.sin(T * 1.1 * f.s) * .3, Math.cos(T * .4 * f.s + f.p) * .8)), .14, I * b * 1.6); }); },
  where: () => null });

export const bats = () => event({ name: 'Bats hunting', t0: 22, t1: 40, bands: ['ir'], note: 'Warm-blooded fliers: invisible against the dark sky, obvious in IR.',
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

export const campfire = () => event({ name: 'Campfire', t0: 40, t1: 60, bands: ['vis', 'ir'], note: 'Journey\'s end: flickering flame light and strong heat.',
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
    this.ir.set(this.base.clone().add(new V3(0, .5, 0)), 3.5, lit * f); },
  where() { return this.base.clone().add(new V3(0, 1, 0)); } });

export const thermalUpdraft = () => event({ name: 'Thermal updraft', t0: 0, t1: 20, bands: ['ir'], note: 'A warm column of air peeling off the sunlit slope ahead — heat you only meet in infrared.',
  init() { this.c = Array.from({ length: 4 }, () => new Rib('ir', null, 9)); },
  update() { const { t, T } = S, I = sm(0, 3, t) * (1 - sm(16, 20, t)) * warmF();
    for (let k = 0; k < 4; k++) { const az = 248 + k * 11 + Math.sin(T * .3 + k) * 3, pts = [];
      for (let j = 0; j < 9; j++) { const e = 3 + j * 2.6 + Math.sin(T * .8 + j * .7 + k) * 1.5; pts.push(skyP(az + Math.sin(j * .8 + T * .3 + k) * 2.2, e)); }
      this.c[k].set(pts, deg(.16), deg(.55),I * .1 * (.55 + .45 * Math.sin(T * 1.4 + k * 1.7)), 1); } },
  where: () => skyP(265, 22) });

export const fireWhirl = () => event({ name: 'Fire whirl', t0: 46, t1: 60, bands: ['vis', 'ir'], note: 'A slow whirl of embers lifts off the campfire: bright flame sparks and a great deal of heat.',
  init() { this.s = Array.from({ length: 10 }, () => new Em('vis', '#ffd27a')); this.h = Array.from({ length: 6 }, () => new Em('ir')); this.p = null; },
  update() { const { t, T } = S, I = sm(44, 48, t); if (I <= 0) return;
    const { x, y, z } = campPos(); this.p = new V3(x, y + 4, z);
    this.s.forEach((e, k) => { const a = T * 1.1 + k / 10 * 6.283, rise = 1.2 + ((T * .55 + k / 10) % 1) * 7;
      e.set(new V3(x + Math.cos(a) * (1.6 + rise * .16), y + rise, z + Math.sin(a) * (1.6 + rise * .16)), .22, I * (.9 - rise * .07)); });
    this.h.forEach((e, k) => { const a = T * .7 + k / 6 * 6.283, rise = 1 + ((T * .4 + k / 6) % 1) * 9;
      e.set(new V3(x + Math.cos(a) * (2 + rise * .2), y + rise, z + Math.sin(a) * (2 + rise * .2)), 3 + rise * .2, I * .6); }); },
  where() { return this.p; } });
