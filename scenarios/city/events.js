// Events that belong to the city (sky events come from the engine library).
import * as THREE from 'three';
import { V3, lerp, sm, env, R } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { Em, Rib } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { BUILD, LAMPS, ROOFS, WINDOWS, PARK_Z, GROUND_INSTR } from './world.js';

export const windows = () => event({ name: 'Lit windows & heat island', t0: 0, t1: 60, bands: ['vis', 'ir'], note: 'Windows light up one by one; on a thermal camera every building leaks the day\'s stored heat.',
  update() { const { t, on } = S, lit = .06 + .5 * sm(6, 24, t);
    BUILD.lit.value = on.vis ? lit : 0; BUILD.heat.value = on.ir ? 1 : 0; GROUND_INSTR.uniforms.uWarm.value = on.ir ? .18 : 0;
    S.act.vis += lit * .8; S.act.ir += .7; },
  where: () => null });

export const streetLights = () => event({ name: 'Street lights', t0: 8, t1: 60, bands: ['vis', 'ir'], note: 'Sodium lamps flicker on at dusk: orange light with a strong near-infrared tail.',
  init() { this.e = LAMPS.map(() => ({ v: new Em('vis', '#ffb45a'), i: new Em('ir') })); },
  update() { const { t, T } = S; let sum = 0;
    LAMPS.forEach((l, k) => { const on = sm(9 + l.k * 4, 9.6 + l.k * 4, t), warm = on * (t < 9.6 + l.k * 4 ? .6 + .4 * Math.sin(T * 40 + k) : 1);   // a brief flicker while striking
      sum += on; this.e[k].v.set(l.p, 2.4, warm * 1.1); this.e[k].i.set(l.p, 3.2, warm * .25); });
    const n = sum / Math.max(1, LAMPS.length); LAMPS.poolMat.color.setRGB(.55 * n, .3 * n, .1 * n); },
  where: () => null });

// Mobile mast on a rooftop on the south side of the avenue, just before the park.
export const cellTower = () => event({ name: '5G mast', t0: 0, t1: 60, bands: ['micro', 'vis'], note: 'Sector antennas on a rooftop beam microwave to every phone in the street; red light for aircraft.',
  init() {
    const cands = ROOFS.filter(r => r.side < 0 && r.p.z > PARK_Z + 8 && r.p.z < PARK_Z + 70);
    const r = cands.sort((a, b) => b.h - a.h)[0] || ROOFS[0], b = r.p, H = 12, pts = [];
    const leg = k => new V3(b.x + Math.cos(k * 2.09) * 1.4, b.y, b.z + Math.sin(k * 2.09) * 1.4), top = new V3(b.x, b.y + H, b.z);
    for (let k = 0; k < 3; k++) pts.push(leg(k), top);
    for (let s = 0; s < 5; s++) for (let k = 0; k < 3; k++) pts.push(leg(k).lerp(top, s / 5), leg((k + 1) % 3).lerp(top, (s + 1) / 5));
    S.scene.add(solid(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x0b0b10 }))));
    this.top = top; this.panels = [0, 1, 2].map(k => new V3(b.x + Math.cos(k * 2.09 + .5) * .9, b.y + H - 1.5, b.z + Math.sin(k * 2.09 + .5) * .9));
    this.big = new Em('micro'); this.pe = this.panels.map(() => new Em('micro')); this.red = new Em('vis', '#ff2020');
  },
  update() { const { T } = S;
    this.big.set(this.top, 45, .7); this.pe.forEach((e, k) => e.set(this.panels[k], 5, .5 + .5 * Math.max(0, Math.sin(T * 3 + k * 2.1))));
    this.red.set(this.top, 2.2, T % 1.6 < .5 ? 1.3 : .05); },
  where() { return this.top; } });

export const wifi = () => event({ name: 'Wi-Fi routers', t0: 0, t1: 60, bands: ['micro'], note: '2.4 and 5 GHz routers behind the windows, chattering in short bursts.',
  init() { this.e = WINDOWS.map(p => ({ p, r: 1.5 + R() * 3, ph: R() * 6, e: new Em('micro') })); },
  update() { const { T } = S; this.e.forEach(q => { const b = Math.max(0, Math.sin(T * q.r + q.ph)) ** 6; q.e.set(q.p, 2.2, .25 + b * .6); }); },
  where: () => null });

// Cars on the avenue; it runs on through the park, so they appear and vanish far away.
export const traffic = () => event({ name: 'Traffic', t0: 0, t1: 60, bands: ['vis', 'ir', 'micro'], note: 'Headlights and tail lights, hot engines and exhausts, and 77 GHz collision radar in every new car.',
  init() {
    const lanes = [[2.2, -1], [5.8, -1], [-2.2, 1], [-5.8, 1]];   // [x, direction along z]: westbound on the north (+x) side
    const geoB = new THREE.BoxGeometry(1.8, .75, 4.4), geoC = new THREE.BoxGeometry(1.6, .6, 2.3); geoB.translate(0, .62, 0); geoC.translate(0, 1.3, -.2);
    this.cars = [];
    for (const [x, dir] of lanes) for (let k = 0; k < 7; k++) {
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(R(), .3 + R() * .3, .06 + R() * .12), roughness: .4, metalness: .5 });
      const G = new THREE.Group(); G.add(new THREE.Mesh(geoB, m), new THREE.Mesh(geoC, m)); S.scene.add(solid(G));
      this.cars.push({ G, x: x + (R() - .5) * .4, dir, z0: k / 7 + R() * .08, v: 9 + R() * 5,
        hl: [new Em('vis', '#fff4dc'), new Em('vis', '#fff4dc')], tl: [new Em('vis', '#ff2a1a'), new Em('vis', '#ff2a1a')],
        ex: new Rib('ir', null, 3, 1), hot: new Em('ir', null, 1), rad: new Em('micro') });
    }
  },
  update() { const { t, T } = S, cam = S.camera.position, lights = sm(6, 12, t), Z0 = -900, L = 1600;
    for (const c of this.cars) {
      const s = ((c.z0 * L + c.dir * c.v * t * 2) % L + L) % L, z = Z0 + s;           // position along the loop, script-time driven
      const fade = sm(Z0, Z0 + 150, z) * (1 - sm(Z0 + L - 150, Z0 + L, z));          // vanish only far away
      c.G.position.set(c.x, 0, z); c.G.rotation.y = c.dir > 0 ? 0 : Math.PI; c.G.visible = fade > .01;
      if (!c.G.visible) continue;
      const fw = new V3(0, 0, c.dir), side = new V3(1, 0, 0), toCam = cam.clone().sub(c.G.position).normalize(), face = fw.dot(toCam);
      const front = c.G.position.clone().addScaledVector(fw, 2.25), back = c.G.position.clone().addScaledVector(fw, -2.25);
      const hI = (.25 + .75 * lights) * Math.max(0, face) ** .5 * fade, tI = (.3 + .7 * lights) * Math.max(0, -face) ** .5 * fade;
      for (let k = 0; k < 2; k++) { const o = side.clone().multiplyScalar(k ? .65 : -.65);
        c.hl[k].set(front.clone().add(o).setY(.7), .9, hI * 1.2); c.tl[k].set(back.clone().add(o).setY(.8), .5, tI * .9); }
      c.ex.set([back.clone().setY(.35), back.clone().addScaledVector(fw, -1.6).setY(.6)], .5, .9, .4 * fade);
      c.hot.set(c.G.position.clone().addScaledVector(fw, 1.3).setY(.8), 1.8, .35 * fade);
      c.rad.set(front.clone().setY(.5), .8, (.25 + .3 * Math.max(0, Math.sin(T * 7 + c.z0 * 40))) * fade);
    } },
  where: () => null });

// Fireworks over the park at the end of the walk.
export const fireworks = () => event({ name: 'Fireworks', t0: 50, t1: 60, bands: ['vis', 'ir'], note: 'Metal salts burn in bright colours; the shells and burning stars are hot in infrared too.',
  init() { this.b = Array.from({ length: 8 }, (_, i) => {
    const c = new V3((R() - .5) * 240, 85 + R() * 70, PARK_Z - 230 - R() * 160), hue = R();
    return { t0: 50.2 + i * 1.15 + R() * .4, c, col: '#' + new THREE.Color().setHSL(hue, 1, .62).getHexString(),
      dirs: Array.from({ length: 24 }, () => new V3(R() - .5, R() - .5, R() - .5).normalize()), sp: 22 + R() * 14,
      trail: new Rib('vis', '#ffd9a0', 2), flash: null, ir: new Em('ir') }; });
    this.b.forEach(b => { b.flash = new Em('vis', b.col); b.st = b.dirs.map(() => new Em('vis', b.col)); });
    this.p = null; },
  update() { const { t } = S; this.p = null;
    for (const b of this.b) { const age = t - b.t0; if (age < -.9 || age > 2.6) continue;
      if (age < 0) { const f = 1 + age / .9, base = new V3(b.c.x, 0, b.c.z), head = base.clone().lerp(b.c, f);   // rising shell
        b.trail.set([base.clone().lerp(b.c, Math.max(0, f - .25)), head], .6, .6, .8, 1); b.ir.set(head, 4, .5); continue; }
      this.p = b.c; const I = 1 - sm(.6, 2.6, age);
      b.flash.set(b.c, 30 * (1 - sm(0, .3, age)) + 8, (1 - sm(0, .4, age)) * 1.4);
      b.st.forEach((e, k) => { const d = b.dirs[k], r = b.sp * (1 - Math.exp(-age * 2.2)); e.set(b.c.clone().addScaledVector(d, r).add(new V3(0, -2.5 * age * age, 0)), 3.2, I * 1.3); });
      b.ir.set(b.c, 40 * (.4 + age * .3), I * .5); } },
  where() { return this.p; } });
