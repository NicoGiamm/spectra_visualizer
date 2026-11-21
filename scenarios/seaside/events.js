// Events that belong to the beach (sky events come from the engine library).
import * as THREE from 'three';
import { V3, DEG, lerp, sm, env, R } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { deg, dirAE, skyP, onSky } from 'spectra/core/geom.js';
import { Em, Rib } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { SUN_AZ, sunEl } from 'spectra/world/atmosphere.js';
import { coastZ, heightAt, sandMat, SAND_INSTR, SEA, STAND } from './world.js';

// The last sliver of Sun flashes green as it drops under a sharp sea horizon (sunEl crosses 0 at t≈7.3).
export const greenFlash = () => event({ name: 'Green flash', t0: 6.4, t1: 8.6, bands: ['vis'], note: 'Refraction splits the last sliver of the Sun over a clean sea horizon: a second of emerald.',
  init() { this.e = new Em('vis', '#5dff8a'); this.c = new Em('vis', '#b8ffd0'); },
  update() { const { t, T } = S, I = env(t, 6.6, 8.4, .5) * (.75 + .25 * Math.sin(T * 30)); this.p = skyP(SUN_AZ, Math.max(sunEl(), -.15) + .12);
    this.e.set(this.p, deg(1.1), I * 1.1); this.c.set(this.p, deg(.35), I * 1.4); },
  where() { return this.p; } });

export const warmSand = () => event({ name: 'Warm sand cooling', t0: 0, t1: 45, bands: ['ir'], note: 'Sand soaked up the afternoon Sun and radiates it back as infrared; the sea, slower to change, stays cool.',
  init() { this.e = Array.from({ length: 14 }, () => { const x = (R() - .5) * 90, z = coastZ(x) + 6 + R() * 26; return { p: new V3(x, heightAt(x, z) + .1, z), s: 2.5 + R() * 3, e: new Em('ir') }; }); },
  update() { const w = 1 - sm(0, 45, S.t), on = S.on; SAND_INSTR.uniforms.uWarm.value = on.ir ? w * .6 : 0; S.act.ir += w * .4; sandMat.emissive.setRGB(on.ir ? w * .05 : 0, on.ir ? w * .014 : 0, 0);
    this.e.forEach(q => q.e.set(q.p, q.s, w * .35)); },
  where: () => null });

// Gulls: warm bodies (realistic IR), dark silhouettes against the dusk.
export const gulls = () => event({ name: 'Gulls heading home', t0: 0, t1: 20, bands: ['ir', 'vis'], note: 'Warm-blooded gliders: dim shapes by eye, crisp heat signatures in infrared.',
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

export const lighthouse = () => event({ name: 'Lighthouse', t0: 9, t1: 60, bands: ['vis', 'radio'], note: 'A rotating beam sweeps the bay every few seconds; its radio beacon keeps broadcasting for ships.',
  init() {
    const x = 900, z = coastZ(x) + 55, y = heightAt(x, z), G = new THREE.Group(); G.position.set(x, y, z);
    const white = new THREE.MeshStandardMaterial({ color: 0xbfb8ae, roughness: .7 }), red = new THREE.MeshStandardMaterial({ color: 0x6a1410, roughness: .7 });
    for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.6 - i * .35, 2.95 - i * .35, 5, 16), i % 2 ? red : white); seg.position.y = 2.5 + i * 5; G.add(seg); }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 12), new THREE.MeshStandardMaterial({ color: 0x222226 })); lamp.position.y = 21.2; G.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 12), red); cap.position.y = 23.2; G.add(cap);
    S.scene.add(solid(G));
    this.top = new V3(x, y + 21.2, z);
    this.beam = [new Rib('vis', '#fff1c8', 2), new Rib('vis', '#fff1c8', 2)]; this.flash = new Em('vis', '#fff6dc'); this.glow = new Em('vis', '#ffe6a8'); this.ra = new Em('radio');
  },
  update() { const { t, T } = S, I = sm(9, 13, t); if (I <= 0) return;
    const a = T * 1.3, cam = S.camera.position, toCam = Math.atan2(cam.z - this.top.z, cam.x - this.top.x);
    for (let k = 0; k < 2; k++) {                                                    // two opposite beams
      const ak = a + k * Math.PI, dir = new V3(Math.cos(ak), -.012, Math.sin(ak));
      this.beam[k].set([this.top, this.top.clone().addScaledVector(dir, 650)], 6, 60, I * .28, 0);   // shorter than the distance to you
      const off = Math.abs(Math.atan2(Math.sin(ak - toCam), Math.cos(ak - toCam)));   // beam pointing at you -> blinding flash
      if (off < .25) this.flash.set(this.top, 60 * (1 - off / .25) + 6, I * 1.6 * (1 - off / .25));
    }
    this.glow.set(this.top, 7, I * .8);
    this.ra.set(this.top, 150, I * (.5 + .3 * Math.sin(T * 2))); },
  where() { return this.top; } });

// A container ship crossing the horizon: nav lights, X-band radar sweep (microwave), AIS bursts (VHF radio), hot funnel.
export const ship = () => event({ name: 'Container ship', t0: 4, t1: 52, bands: ['vis', 'micro', 'radio', 'ir'], note: 'Masthead and side lights, a rotating X-band radar, AIS position bursts on VHF and a hot exhaust funnel.',
  init() {
    const hull = new THREE.MeshStandardMaterial({ color: 0x15100f, roughness: .8 }), G = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(220, 14, 32), hull); h.position.y = 4; G.add(h);
    const br = new THREE.Mesh(new THREE.BoxGeometry(16, 20, 30), hull); br.position.set(-85, 21, 0); G.add(br);
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(17, 9 + (i * 7 % 5) * 2, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(R(), .35, .12), roughness: .8 })); c.position.set(-60 + i * 18, 15, 0); G.add(c); }
    this.g = solid(G); S.scene.add(G); this.dist = 3200;
    this.mast = new Em('vis', '#ffffff'); this.side = new Em('vis', '#ff3030'); this.stern = new Em('vis', '#ffffff'); this.deck = Array.from({ length: 4 }, () => new Em('vis', '#ffcf88'));
    this.radar = new Em('micro'); this.ais = new Em('radio'); this.funnel = new Rib('ir', null, 6, 1); this.hot = new Em('ir', null, 1);
  },
  update() { const { t, T } = S, p = (t - this.t0) / (this.t1 - this.t0); this.g.visible = p >= 0 && p <= 1; if (!this.g.visible) { this.p = null; return; }
    const az = lerp(236, 318, p), c = S.camera.position, d = dirAE(az, 0), pos = new V3(c.x + d.x * this.dist, 0, c.z + d.z * this.dist);
    this.g.position.copy(pos); this.g.rotation.y = -(az + 90) * DEG;
    const fw = new V3(Math.cos((az + 90) * DEG), 0, Math.sin((az + 90) * DEG)), at = (f, y) => pos.clone().addScaledVector(fw, f).add(new V3(0, y, 0));
    const nav = sm(9, 14, t), I = env(t, this.t0, this.t1, 1.5);
    this.p = at(-85, 40); this.mast.set(at(-85, 44), 26, nav * I); this.side.set(at(-80, 24), 18, nav * I * .8); this.stern.set(at(-108, 14), 14, nav * I * .6);
    this.deck.forEach((e, k) => e.set(at(-60 + k * 45, 22), 14, nav * I * .5));
    const ra = T * 2.4, face = Math.max(0, Math.cos(ra - Math.atan2(c.z - pos.z, c.x - pos.x))) ** 16;   // radar crackles brightest as its antenna sweeps past you
    this.radar.set(at(-85, 34), 60 + 120 * face, I * (.2 + .9 * face));
    const ping = (t % 3) / 3; this.ais.set(at(-85, 44), 220, ping < .2 ? I * (1 - ping / .2) : 0);
    this.funnel.set([at(-95, 30), at(-100, 60), at(-108, 95)], 10, 26, I * .5); this.hot.set(at(-95, 31), 18, I * .45); },
  where() { return this.p; } });

export const bioluminescence = () => event({ name: 'Bioluminescent surf', t0: 24, t1: 60, bands: ['vis'], note: 'Plankton flash blue wherever the breaking waves stir them: cold light, no heat.',
  init() { this.e = Array.from({ length: 40 }, () => { const x = STAND.x + (R() - .5) * 140; return { x, off: 2 + R() * 20, ph: R() * 6, s: .5 + R(), e: new Em('vis', '#3fb4ff') }; }); },
  update() { const { t, T } = S, I = sm(24, 32, t); SEA.mat.uniforms.uBio.value = S.on.vis ? I : 0; if (I <= 0) return; S.act.vis += I * .3;
    this.e.forEach(q => { const z = coastZ(q.x) - q.off, b = Math.max(0, Math.sin(T * 1.4 + q.off * .32 + q.ph)) ** 12;
      q.e.set(new V3(q.x, .25, z), .9 * q.s, I * b * 1.3); }); },
  where() { return new V3(STAND.x - 6, .5, coastZ(STAND.x) - 6); } });
