// Shared library of sky / atmosphere events. They depend only on the camera, the shared
// atmosphere timeline and S.groundAt, so any scenario can reuse them. Each export is a
// factory: `meteorShower()` keeps the default timing, `meteorShower({ t0: 30, t1: 44 })` retimes.
// When retiming, also check what update() hard-codes (several use their default window inside).
import * as THREE from 'three';
import { V3, DEG, clamp, lerp, sm, env, kf, R } from '../core/util.js';
import { S } from '../core/state.js';
import { event } from '../core/events.js';
import { deg, dirAE, skyP, onSky, basis, ringPts, linePts } from '../core/geom.js';
import { Em, Rib } from '../render/sources.js';
import { visOnly } from '../render/instrument.js';
import { cloudTex, moonTex } from '../render/textures.js';
import { ENV, SUN_AZ, sunEl, moonDir, GAL_C, CONTRAIL } from '../world/atmosphere.js';

export const sunset = o => event({ name: 'Sunset', t0: 0, t1: 16, bands: ['vis', 'ir', 'uv', 'radio'], note: 'The Sun is bright in every band; its UV fades first as it sets.',
  init() { this.e = [new Em('ir'), new Em('uv'), new Em('radio'), new Em('vis', '#ffb070')]; },
  update() { const { t } = S, el = sunEl(), I = sm(-3, 1, el); this.p = skyP(SUN_AZ, el);
    this.e[0].set(this.p, deg(2.2), I); this.e[1].set(this.p, deg(1.4), I * (1 - sm(0, 12, t))); this.e[2].set(this.p, deg(2), I * .6); this.e[3].set(this.p, deg(1.6), I * .22); },
  where() { return this.p; } }, o);

const planeDir = p => dirAE(190 + 170 * p, 12 + 40 * Math.sin(Math.PI * p));
export const airliner = o => event({ name: 'Airliner', t0: 3, t1: 27, bands: ['vis', 'ir', 'radio', 'micro'], note: 'Nav lights & sunlit contrail, hot engines (IR), transponder (radio), weather radar (microwave).',
  init() { this.trail = new Rib('vis', '#ffffff', 34); this.s = new Em('vis', '#ffffff'); this.b = new Em('vis', '#ff3030'); this.g = new Em('vis', '#40ff60'); this.ir = new Em('ir', null, 1); this.ex = new Rib('ir', null, 4, 1); this.ra = new Em('radio'); this.mi = new Em('micro'); this.p = null; },
  update() { const { t, T } = S, t0 = this.t0, t1 = this.t1;
    if (t < t0 || t > t1) { this.p = null; return; }
    const p = (t - t0) / (t1 - t0), I = env(t, t0, t1, 1), pos = onSky(planeDir(p)); this.p = pos;
    const pts = []; for (let k = 30; k >= 0; k--) { const pk = p - k * .006; if (pk >= 0) pts.push(onSky(planeDir(pk))); }
    this.trail.m.material.uniforms.uColor.value.setRGB(...kf(CONTRAIL, t)[0]);
    this.trail.set(pts, deg(.55), deg(.1), I * .9, 1);
    this.s.set(pos, deg(.7), T % 1 < .06 ? 1.6 : 0); this.b.set(pos, deg(.5), T % 1.3 < .15 ? 1.3 : 0); this.g.set(pos, deg(.25), .6);
    this.ir.set(pos, deg(.35), I * .55); if (pts.length > 3) this.ex.set([pts[pts.length - 4], pos], deg(.14), deg(.1), I * .45, 1);
    this.ra.set(pos, deg(1.6), t % 2 < .3 ? I * (1 - (t % 2) / .3) : 0); this.mi.set(pos, deg(.6), I * .5);
  }, where() { return this.p; } }, o);

export const venus = o => event({ name: 'Evening star (Venus)', t0: 5, t1: 57, bands: ['vis'], note: 'Reflected sunlight; the first "star" to appear after sunset.',
  init() { this.e = new Em('vis', '#fff6e0'); },
  update() { const { t } = S; this.p = skyP(287, 20 - t * .33); this.e.set(this.p, deg(.45), env(t, 5, 57, 4) * (.3 + .9 * sm(5, 15, t))); }, where() { return this.p; } }, o);

export const cmb = o => event({ name: 'Cosmic microwave background', t0: 16, t1: 60, bands: ['micro'], note: 'Leftover glow from the Big Bang, mottled across the whole sky.',
  update() { const I = sm(16, 26, S.t) * .9; ENV.nightMat.uniforms.uCMB.value = S.on.micro ? I : 0; S.act.micro += I * .6; }, where: () => null }, o);

export const milkyWay = o => event({ name: 'Milky Way', t0: 18, t1: 60, bands: ['vis', 'ir', 'radio'], note: 'Starlight with dark dust lanes; the dust glows in IR, Sgr A* (galactic centre, ahead-left) in radio.',
  init() { this.ir = new Em('ir'); this.ra = new Em('radio'); },
  update() { const { t } = S, mw = sm(18, 30, t), ml = sm(38, 50, t); ENV.nightMat.uniforms.uMW.value = S.on.vis ? mw * (1 - .4 * ml) * ENV.starDim : 0; S.act.vis += mw * .3;
    const p = onSky(GAL_C); this.ir.set(p, deg(14), mw * .35); this.ra.set(p, deg(2.5), mw * .6); }, where: () => onSky(GAL_C) }, o);

export const meteorShower = o => event({ name: 'Meteor shower', t0: 19, t1: 33, bands: ['vis', 'uv', 'radio'], note: 'Streaks of light, and radio echoes off the ionized trails.',
  init() { this.m = Array.from({ length: 22 }, () => ({ t0: this.t0 + R() * (this.t1 - this.t0 - 1), az: 205 + R() * 130, el: 38 + R() * 46, daz: (R() - .5) * 46, del: -18 - R() * 24, v: new Rib('vis', '#fff4e0', 2), u: new Rib('uv', null, 2), r: new Em('radio') })); },
  update() { const { t } = S; this.m.forEach(m => { const p = (t - m.t0) / 1.5; if (p < 0 || p > 1) return;
    const a = dirAE(m.az, m.el), b = dirAE(m.az + m.daz, m.el + m.del), head = onSky(a.clone().lerp(b, p)), tail = onSky(a.clone().lerp(b, Math.max(0, p - .3))), I = (1 - p) * 1.5;
    m.v.set([tail, head], deg(.24), deg(.24), I, 1); m.u.set([tail, head], deg(.35), deg(.35), I * .5, 1); m.r.set(head, deg(2), 1 - p); }); },
  where: () => skyP(30, 60) }, o);

// Two opposite arms, each with one faded sweep ghost; more arms read as a windmill.
export const pulsar = o => event({ name: 'Pulsar', t0: 20, t1: 60, bands: ['radio', 'xray'], note: 'A spinning neutron star: the radio wind flares out in two opposite cones along the spin axis, ringed by a terminal shock wave.',
  init() { this.d = dirAE(242, 52); this.v = new Em('vis'); this.r = new Em('radio'); this.x = new Em('xray');
    this.arm = Array.from({ length: 4 }, () => ({ ray: Array.from({ length: 9 }, () => new Rib('radio', null, 4)), ring: new Rib('radio', null, 33) }));
    this.shock = new Rib('radio', null, 49); },
  update() { const { t, T } = S, I = env(t, this.t0, this.t1, 3); if (I <= 0) return;
    const p = onSky(this.d), pulse = Math.max(0, Math.sin(T * 9)) ** 20, [u, v] = basis(this.d), a = T * 3.1, bl = (dir, f) => onSky(this.d.clone().lerp(dir, f));
    this.v.set(p, deg(.2), I * .5); this.r.set(p, deg(1.3), I * (.3 + pulse)); this.x.set(p, deg(.5), I * .5 * pulse);
    for (let s = 0; s < 2; s++) for (let k = 1; k >= 0; k--) {                     // arm s, k = 0 the arm itself, k = 1 its sweep ghost
      const arm = this.arm[s * 2 + k], aa = a - k * .34 + s * Math.PI, w = (1 - k * .4) * (s ? .8 : 1), LEN = 7.5 - k * .6, mD = (1.6 + .35 * Math.sin(T * .8 + k * .6)) * (1 - k * .15);
      const sv = u.clone().multiplyScalar(Math.cos(aa)).add(v.clone().multiplyScalar(Math.sin(aa))), md = this.d.clone().addScaledVector(sv, LEN * DEG).normalize(), [mu, mv] = basis(md);
      arm.ring.set(ringPts(md, mD, 32), deg(.15), deg(.15), I * w * .22 * (.5 + pulse * .5));                             // the cone mouth
      arm.ray[8].set([p, bl(md, .45), bl(md, .9)], deg(.26), deg(.12), I * w * (.34 + pulse * .2), 1);                   // spine
      for (let i = 0; i < 8; i++) { const th = i / 8 * 6.283 + a * .7, rad = i < 4 ? mD : mD * .5;                        // 4 edge + 4 inner streamlines
        const rd = md.clone().addScaledVector(mu, Math.cos(th) * rad * DEG).addScaledVector(mv, Math.sin(th) * rad * DEG).normalize();
        arm.ray[i].set([p, bl(rd, .38), bl(rd, .7), bl(rd, 1)], deg(.16), deg(.05), I * w * (i < 4 ? .14 : .08), 1); }
    }
    this.shock.set(ringPts(this.d, 1.4 + .25 * Math.sin(T * .8), 48), deg(.2), deg(.2), I * (.3 + pulse * .3));
  },
  where() { return onSky(this.d); } }, o);

export const comet = o => event({ name: 'Comet', t0: 24, t1: 48, bands: ['vis', 'uv', 'ir', 'xray'], note: 'Curved dust tail (visible/IR), straight ion tail (UV), X-rays from solar wind hitting the coma.',
  init() { this.dust = new Rib('vis', '#ffe6c4', 14); this.ion = new Rib('vis', '#8fb4ff', 14); this.uv = new Rib('uv', null, 14); this.dir = new Rib('ir', null, 14); this.hv = new Em('vis', '#eafff2'); this.hi = new Em('ir'); this.hx = new Em('xray'); },
  update() { const I = env(S.t, this.t0, this.t1, 3); if (I <= 0) return;
    const H = dirAE(276, 24), Sd = dirAE(SUN_AZ, sunEl()), td = H.clone().sub(Sd); td.addScaledVector(H, -td.dot(H)).normalize(); const pp = new V3().crossVectors(H, td).normalize(), L = .22;
    const dust = [], ion = []; for (let k = 13; k >= 0; k--) { const f = k / 13; dust.push(onSky(H.clone().addScaledVector(td, f * L).addScaledVector(pp, f * f * L * .3))); ion.push(onSky(H.clone().addScaledVector(td, f * L * 1.3).addScaledVector(pp, -f * L * .05))); }
    this.dust.set(dust, deg(3.2), deg(.3), I * .7, 1); this.ion.set(ion, deg(.6), deg(.15), I * .6, 1); this.uv.set(ion, deg(.5), deg(.15), I * .8, 1); this.dir.set(dust, deg(1.3), deg(.3), I * .35, 1);
    const h = onSky(H); this.hv.set(h, deg(.45), I * 1.2); this.hi.set(h, deg(.8), I * .5); this.hx.set(h, deg(.8), I * .7); },
  where: () => skyP(276, 24) }, o);

const satDir = p => dirAE(205 + 125 * p, 12 + 55 * Math.sin(Math.PI * p));
export const satellitePass = o => event({ name: 'Satellite pass', t0: 25, t1: 39, bands: ['vis', 'micro', 'radio'], note: 'Reflected sunlight plus a microwave downlink to the ground.',
  init() { this.v = new Em('vis'); this.m = new Em('micro'); this.r = new Em('radio'); this.beam = new Rib('micro', null, 24); this.p = null; },
  update() { const { t } = S, sp = (t - this.t0) / (this.t1 - this.t0); if (sp < 0 || sp > 1) { this.p = null; return; } const I = env(t, this.t0, this.t1, 1), p = onSky(satDir(sp)); this.p = p;
    this.v.set(p, deg(.22), I); this.m.set(p, deg(.6), I); this.r.set(p, deg(.6), I * .5);
    const c = S.camera.position, g = new V3(c.x + 6, 0, c.z - 25); g.y = S.groundAt(g.x, g.z); this.beam.set(linePts(p, g, 24), deg(.25), .25, I * .5); },
  where() { return this.p; } }, o);

export const starlink = o => event({ name: 'Starlink train', t0: 28, t1: 36, bands: ['vis', 'micro'], note: 'A string of freshly launched satellites beaming microwave internet.',
  init() { this.s = Array.from({ length: 22 }, (_, k) => ({ v: new Em('vis', '#f4f6ff'), m: k % 3 === 0 ? new Em('micro') : null })); this.p = null; },
  update() { const { t } = S; if (t < this.t0 || t > this.t1) { this.p = null; return; } const p = (t - this.t0) / (this.t1 - this.t0), I = env(t, this.t0, this.t1, 1);
    this.s.forEach((s, k) => { const q = p * 1.3 - k * .014; if (q < 0 || q > 1) return; const pos = onSky(dirAE(210 + 110 * q, 20 + 34 * Math.sin(Math.PI * q))); s.v.set(pos, deg(.18), I * .9); s.m && s.m.set(pos, deg(.4), I * .5); if (k === 0) this.p = pos; }); },
  where() { return this.p; } }, o);

export const blackHoleBinary = o => event({ name: 'Black-hole X-ray binary', t0: 30, t1: 60, bands: ['xray', 'radio', 'vis'], note: 'Gas falling into a black hole flickers in X-rays; radio jets flare outward in cones along the spin axis.',
  init() { this.d = dirAE(318, 52); this.v = new Em('vis', '#cfe0ff'); this.x = new Em('xray'); this.halo = new Em('radio');
    this.jet = Array.from({ length: 2 }, () => ({ ray: Array.from({ length: 8 }, () => new Rib('radio', null, 3)), mouth: new Rib('radio', null, 33), tip: new Em('radio') })); },
  update() { const { t, T } = S, I = env(t, this.t0, this.t1, 3); if (I <= 0) return;
    const p = onSky(this.d), fl = .35 + .65 * Math.abs(Math.sin(T * 13) * Math.sin(T * 7.1)), [u, v] = basis(this.d), bl = (dir, f) => onSky(this.d.clone().lerp(dir, f));
    this.v.set(p, deg(.15), I * .5); this.x.set(p, deg(1), I * fl);
    this.halo.set(p, deg(2.4 + .4 * Math.sin(T * .9)), I * .16);                                                                 // radio bow around the core
    for (let s = 0; s < 2; s++) { const sg = s ? -1 : 1, LEN = 6.5 + .6 * Math.sin(T * .6), mD = 1.6 + .35 * Math.sin(T * .8 + s);   // twin jets along the spin axis
      const md = this.d.clone().addScaledVector(u, sg * LEN * DEG).addScaledVector(v, sg * LEN * .45 * DEG).normalize(), [mu, mv] = basis(md);
      this.jet[s].ray[7].set([p, bl(md, .5), bl(md, 1)], deg(.2), deg(.09), I * .3 * fl, 1);                                       // jet spine
      for (let i = 0; i < 7; i++) { const th = i / 7 * 6.283 + T * .9 + s * 1.3;                                                   // streamlines fanning to the mouth
        const rd = md.clone().addScaledVector(mu, Math.cos(th) * mD * DEG).addScaledVector(mv, Math.sin(th) * mD * DEG).normalize();
        this.jet[s].ray[i].set([p, bl(rd, .5), bl(rd, 1)], deg(.12), deg(.05), I * .13 * (.6 + fl * .4), 1); }
      this.jet[s].mouth.set(ringPts(md, mD, 32), deg(.16), deg(.16), I * .22 * (.5 + fl * .5));                                    // the cone mouth
      this.jet[s].tip.set(bl(md, 1), deg(1.2), I * .3 * fl); }                                                                     // jet head flash
  },
  where() { return onSky(this.d); } }, o);

export const aurora = o => event({ name: 'Aurora', t0: 30, t1: 47, bands: ['vis', 'uv', 'radio', 'xray'], note: 'Green and red curtains to the north, auroral radio emission and faint X-rays.',
  init() {
    const N = 160, pos = [], uv = [], idx = [], rad = i => 7000 + 600 * Math.sin(i * .15), az = i => (215 + 100 * i / N) * DEG;
    for (let i = 0; i <= N; i++) { const x = Math.cos(az(i)) * rad(i), z = Math.sin(az(i)) * rad(i); pos.push(x, 1000, z, x, 4400, z); uv.push(i / N, 0, i / N, 1); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uTime: S.TIME, uI: { value: 0 } },
      vertexShader: `uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; vec2 n = normalize(p.xz);
        p.xz += n*(sin(uv.x*25.+uTime*.4)*260. + sin(uv.x*61.-uTime*.7)*90.); gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
        uniform float uTime, uI; varying vec2 vUv;
        void main(){ float u = vUv.x, v = vUv.y;
          float fold = .45+.55*sin(u*18.+uTime*.6+sin(u*7.-uTime*.4)*2.);
          float rays = .45+.55*n2(vec2(u*170., uTime*.9));
          float prof = smoothstep(0.,.06,v)*(1.-smoothstep(.12,1.,v));
          vec3 c = mix(vec3(.1,1.,.35), vec3(.85,.1,.35), smoothstep(.3,.85,v));
          float a = prof*fold*rays*(1.-smoothstep(.8,1.,abs(u*2.-1.)));
          gl_FragColor = vec4(c*a*uI*.62, 1.); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; S.scene.add(this.mesh);
    this.edge = Array.from({ length: 40 }, (_, i) => { const ii = i * 4; return new V3(Math.cos(az(ii)) * rad(ii), 1000, Math.sin(az(ii)) * rad(ii)); });
    this.uv = new Rib('uv', null, 40); this.ra = new Rib('radio', null, 40); this.xr = new Rib('xray', null, 40);
  },
  update() { const I = env(S.t, this.t0, this.t1, 3); this.mat.uniforms.uI.value = I; this.mesh.visible = S.on.vis && I > 0; if (I <= 0) return; S.act.vis += I * .5;
    // the curtain is anchored around the world origin; follow the walker horizontally
    const c = S.camera.position; this.mesh.position.set(c.x, 0, c.z);
    const e = this.edge.map(p => p.clone().add(new V3(c.x, 0, c.z)));
    this.uv.set(e, 90, 90, I * .45); this.ra.set(e.map(p => p.clone().add(new V3(0, 900, 0))), 70, 70, I * .5); this.xr.set(e.map(p => p.clone().add(new V3(0, 150, 0))), 60, 60, I * .2); },
  where: () => skyP(265, 16) }, o);

export const moonrise = o => event({ name: 'Moonrise', t0: 33, t1: 60, bands: ['vis', 'ir', 'gamma'], note: 'Rising ahead of you: reflected sunlight, warm surface (IR) and a gamma glow from cosmic rays hitting the Moon.',
  init() { this.s = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex(), depthWrite: false, fog: false })); this.s.renderOrder = 3; S.scene.add(visOnly(this.s)); this.h = new Em('vis', '#cfd6ff'); this.ir = new Em('ir'); this.g = new Em('gamma'); },
  update() { const { t } = S, I = sm(33, 35, t); this.s.visible = S.on.vis && I > 0;
    if (I <= 0) { this.p = null; return; } this.p = onSky(moonDir());
    const warm = 1 - sm(36, 50, t); this.s.position.copy(this.p); this.s.scale.setScalar(deg(1.1)); this.s.material.color.setRGB(lerp(2.2, 1.6, 1 - warm), 1.6, lerp(1.0, 1.55, 1 - warm));
    S.act.vis += I * .5; this.h.set(this.p, deg(7), I * .18); this.ir.set(this.p, deg(.9), I * .5); this.g.set(this.p, deg(1.2), I * .3); },
  where() { return this.p; } }, o);

// Growing structure: node table { n: parent, az, el, j, a, b, lv, w }; a node lerps from its parent's
// current point toward its target by f = clamp((g - a) / (b - a)), so an unstarted branch sits on its parent.
export const airShowers = o => event({ name: 'Cosmic-ray air showers', t0: 26, t1: 60, bands: ['gamma', 'uv', 'vis', 'xray'], note: 'A particle from space hits high up, the packet keeps splitting as it descends, and the deepest shaft drives X-rays down to the ground.',
  init() { this.s = Array.from({ length: 14 }, () => {
    const az = 210 + R() * 120, nd = [{ n: -1, az: 0, el: 84, j: 0, a: 0, b: 0, lv: 0, w: .55 }], lv1 = 3 + (R() < .55 ? 1 : 0);
    for (let i = 0; i < lv1; i++) nd.push({ n: 0, az: (i - (lv1 - 1) / 2) * (12 + R() * 9) + (R() - .5) * 6, el: 84 - (13 + R() * 9), j: (R() - .5) * 6, a: .05, b: .35, lv: 1, w: .9 });   // wide fan under the entry
    for (let i = 1; i <= lv1; i++) for (let q = 0, c = 2 + (R() < .35 ? 1 : 0); q < c; q++) { const par = nd[i];   // each main branch forks again
      nd.push({ n: i, az: par.az + (q - .5) * (15 + R() * 11), el: par.el - (13 + R() * 12), j: (R() - .5) * 8, a: .3, b: .68, lv: 2, w: .55 }); }
    for (let i = 1 + lv1; i < nd.length; i++) if (nd[i].lv === 2 && R() < .6) { const par = nd[i];   // twigs off the second level only: depth stops at 3
      nd.push({ n: i, az: par.az + (R() - .5) * 18, el: Math.max(10, par.el - (10 + R() * 11)), j: (R() - .5) * 7, a: .62, b: .98, lv: 3, w: .32 }); }
    const tips = nd.map((x, i) => i).filter(i => i > 0 && nd[i].lv >= 2).sort((a, b) => nd[a].el - nd[b].el), deep = tips[0], chain = [];
    for (let i = deep; i >= 0; i = nd[i].n) chain.push(i);                                          // root-to-deepest path, for the X-ray shaft
    return { t0: 20 + R() * 38, az, nd, tips, chain, r: Array.from({ length: nd.length }, () => new Rib('gamma', null, 3)),
      x: new Rib('xray', null, 8), g: Array.from({ length: 5 }, () => new Em('gamma')), u: new Em('uv'), v: new Em('vis', '#9ab8ff'), e: new Em('xray') }; }); },
  update() { const { t, T } = S; this.s.forEach(s => { const age = t - s.t0; if (age < 0 || age > 3.4) return; const I = sm(0, .35, age) * (1 - sm(2.1, 3.4, age)), g = Math.min(1, age / 2.4);
    const cur = []; let low = null, lowEl = 9e9;
    s.nd.forEach((n, i) => {
      if (i === 0) { cur.push(onSky(dirAE(s.az, 84))); return; }
      const f = clamp((g - n.a) / Math.max(1e-3, n.b - n.a)), par = cur[n.n];
      if (f <= 0) { cur.push(par); return; }
      const tgt = onSky(dirAE(s.az + n.az, n.el)), P = par.clone().lerp(tgt, f), mid = par.clone().lerp(P, .5).lerp(onSky(dirAE(s.az + n.az + n.j, n.el)), .16);
      cur.push(P); if (n.el < lowEl) { lowEl = n.el; low = P; }
      const fl = .72 + .28 * Math.abs(Math.sin(T * 9 + i * 2.3));
      s.r[i].set([par, mid, P], deg(n.w), deg(n.w * .5), I * (.8 - n.lv * .11) * fl, 1);
    });
    const shaft = s.chain.map(i => cur[i]);
    if (shaft.length > 1) s.x.set(shaft, deg(.5), deg(.2), I * (.8 + .2 * Math.abs(Math.sin(T * 11))), 1);
    s.e.set(cur[0], deg(1.8), I * (.7 + .3 * Math.abs(Math.sin(T * 17))));
    if (!low) return;
    s.g.forEach((ge, q) => { const i = s.tips[q]; if (cur[i]) ge.set(cur[i], deg(1.4 - q * .15), I * .45); });
    s.u.set(low, deg(6.5), I * 1.3); s.v.set(low, deg(3.6), I * .25); s.e.set(low, deg(1.5), I * .7); });
  },
  where: () => null }, o);

// opts.az / opts.dist place the storm cell (default: over the southern horizon, 4.5 km away)
export const thunderstorm = o => event({ name: 'Distant thunderstorm', t0: 30, t1: 50, bands: ['vis', 'radio', 'xray', 'gamma'], note: 'Lightning, radio "sferics" and terrestrial gamma-ray flashes.', az: 205, dist: 4500,
  init() {
    const a = this.az * DEG; this.x = Math.cos(a) * this.dist; this.z = Math.sin(a) * this.dist; this.gy = S.groundAt(this.x, this.z); this.cy = Math.max(this.gy + 900, 1900);
    this.strikes = Array.from({ length: 8 }, () => { const ox = (R() - .5) * 1500, oz = (R() - .5) * 1500, pts = []; let jx = 0, jz = 0;
      for (let i = 0; i <= 12; i++) { jx += (R() - .5) * 160; jz += (R() - .5) * 160; pts.push([ox + jx, oz + jz, i / 12]); } return { t0: this.t0 + 7 + R() * (this.t1 - this.t0 - 10), pts }; });
    this.clouds = Array.from({ length: 6 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex(), transparent: true, depthWrite: false, fog: false })); s.position.set(this.x + (R() - .5) * 2600, this.cy + 300 + R() * 500, this.z + (R() - .5) * 2600); s.scale.set(2600, 1500, 1); S.scene.add(visOnly(s)); return s; });
    this.bv = new Rib('vis', '#dfe6ff', 13); this.bx = new Rib('xray', null, 13); this.gl = new Em('vis', '#a9b8ff'); this.gm = new Em('gamma'); this.ra = new Em('radio');
  },
  update() {
    const { t, on } = S, vis = env(t, this.t0, this.t1, 4); let flash = 0;
    for (const s of this.strikes) { const age = t - s.t0; if (age < 0 || age > 1.3) continue;
      const f = age < .25 ? (Math.random() < .7 ? 1 : .3) * (1 - age / .25) : 0; flash = Math.max(flash, f);
      const pts = s.pts.map(([dx, dz, k]) => new V3(this.x + dx, lerp(this.cy, this.gy, k), this.z + dz)), top = pts[0], bot = pts[pts.length - 1];
      this.bv.set(pts, 14, 14, f * 2); this.bx.set(pts, 24, 24, f); this.gl.set(top, 1800, f * .7); this.gm.set(top, 260, age < .12 ? 1 : 0); this.ra.set(bot, 900, 1 - age / 1.3); }
    ENV.flashLight.position.set(this.x, this.cy, this.z); ENV.flashLight.intensity = on.vis ? flash * 3 : 0; ENV.cloudMat.uniforms.uFlash.value = on.vis ? flash * .12 : 0;
    this.clouds.forEach(c => { c.visible = on.vis && vis > 0; const b = .02 + flash * .7; c.material.color.setRGB(b, b, b * 1.15); c.material.opacity = vis * .75; });
  }, where() { return new V3(this.x, this.cy, this.z); } }, o);

export const fastRadioBurst = o => event({ name: 'Fast radio burst', t0: 38, t1: 45, bands: ['radio'], note: 'A millisecond radio flash from a galaxy billions of light-years away, echoed as a long swell.',
  init() { this.d = dirAE(300, 42); this.e = new Em('radio'); this.r1 = new Rib('radio', null, 49); this.r2 = new Rib('radio', null, 49); },
  update() { const { t } = S; if (t < this.t0 || t > this.t0 + 6.2) return; const age = t - this.t0, I = 1 - age / 6.2;
    this.e.set(onSky(this.d), deg(3.2), I * 1.2); this.r1.set(ringPts(this.d, 2.5 + age * 26), deg(.5), deg(.5), I); this.r2.set(ringPts(this.d, 1.2 + age * 17), deg(.35), deg(.35), I * .7); },
  where() { return onSky(this.d); } }, o);

export const supernova = o => event({ name: 'Supernova', t0: 43, t1: 60, bands: ['uv', 'vis', 'xray', 'gamma', 'ir', 'radio'], note: 'UV flash, then visible peak, expanding X-ray shell, dust (IR), radio last.',
  init() { this.d = dirAE(240, 30); this.v = new Em('vis', '#fff6dc'); this.u = new Em('uv'); this.g = new Em('gamma'); this.x = new Rib('xray', null, 49); this.i = new Em('ir'); this.r = new Em('radio'); },
  update() { const { t } = S; if (t < 43) return; const p = onSky(this.d), L = sm(43, 45, t) * (1 - .7 * sm(48, 60, t));
    this.v.set(p, deg(.4 + L * .9), L * 1.6); this.u.set(p, deg(2.6), sm(43, 43.6, t) * (1 - sm(44, 48, t))); this.g.set(p, deg(1.4), .5 * env(t, 43.5, 47, .5));
    if (t > 44) this.x.set(ringPts(this.d, .4 + (t - 44) * .5), deg(.35), deg(.35), .9 * (1 - sm(55, 60, t)));
    this.i.set(p, deg(2), sm(48, 54, t)); this.r.set(p, deg(1.8), sm(51, 57, t)); },
  where() { return onSky(this.d); } }, o);

export const gammaRayBurst = o => event({ name: 'Gamma-ray burst', t0: 48, t1: 60, bands: ['gamma', 'xray', 'vis', 'radio'], note: 'A brief gamma flash, followed by a long afterglow at longer wavelengths.',
  init() { this.d = dirAE(335, 48); this.g = new Em('gamma'); this.x = new Em('xray'); this.v = new Em('vis', '#cfe0ff'); this.r = new Em('radio'); this.flash = document.getElementById('flash'); },
  update() { const { t, T, on } = S, fl = on.gamma && t > 48 && t < 48.6 ? .45 * (1 - (t - 48) / .6) : 0;
    this.flash.style.opacity = fl; if (fl) this.flash.style.background = `hsl(${(T * 400) % 360},100%,55%)`;
    if (t < 48) return; const p = onSky(this.d);
    this.g.set(p, deg(4.5), env(t, 48, 50.5, .3)); this.x.set(p, deg(1.4), sm(48.5, 49.5, t) * (1 - sm(50, 58.5, t)));
    this.v.set(p, deg(.5), sm(49, 50, t) * (1 - sm(51, 58.5, t))); this.r.set(p, deg(1.4), sm(53, 55, t) * (1 - sm(58, 60, t))); },
  where() { return onSky(this.d); } }, o);

export const sunDogs = o => event({ name: 'Sun dog pair', t0: 0, t1: 14, bands: ['vis', 'uv'], note: 'Two bright companions 18° either side of the low Sun, red on the inner edge.',
  init() { this.e = Array.from({ length: 2 }, () => ({ v: new Em('vis', '#d8d2ca'), u: new Em('uv') })); },
  update() { const el = sunEl(); if (el < -2) return; const I = sm(-3, 1, el) * (1 - sm(11, 14, S.t));
    for (let k = 0; k < 2; k++) { const p = skyP(SUN_AZ + (k ? 18 : -18), el); this.e[k].v.set(p, deg(1.1), I * .5); this.e[k].u.set(p, deg(1.7), I * .45); } },
  where: () => skyP(SUN_AZ - 18, sunEl()) }, o);

export const zodiacalScatter = o => event({ name: 'Zodiacal scatter', t0: 0, t1: 12, bands: ['uv', 'vis'], note: 'Bright scintillations 15° either side of the Sun where the halo circle catches the last light.',
  init() { this.s = Array.from({ length: 6 }, () => ({ a: 13 + R() * 5, e: (R() - .5) * 6, tw: R() * 6.3, v: new Em('vis', '#f4f6ff'), u: new Em('uv') })); },
  update() { const el = sunEl(); if (el < -2) return; const I = sm(-3, 1, el) * (1 - sm(9, 12, S.t));
    this.s.forEach((s, k) => { const side = k % 2 ? 1 : -1, p = skyP(SUN_AZ + side * s.a, el + s.e), tw = .4 + .6 * Math.abs(Math.sin(S.T * 4 + s.tw));
      s.v.set(p, deg(.28), I * tw * .5); s.u.set(p, deg(.55), I * tw * .6); }); },
  where: () => skyP(SUN_AZ + 15, sunEl()) }, o);

export const noctilucentClouds = o => event({ name: 'Noctilucent clouds', t0: 42, t1: 60, bands: ['uv', 'vis'], note: 'Silver-blue ripples at 80 km still catching daylight long after the Sun has set.',
  init() { this.r = Array.from({ length: 5 }, () => new Rib('vis', '#dce8f8', 25)); this.u = Array.from({ length: 5 }, () => new Rib('uv', null, 25)); },
  update() { const { t, T } = S, I = sm(42, 50, t);
    for (let k = 0; k < 5; k++) { const e = 26 + k * 3.4, pts = [];
      for (let j = 0; j <= 24; j++) { const az = 218 + j * 5.6; pts.push(skyP(az, e + Math.sin(az * .11 + T * .45 + k * 1.3) * 1.6)); }
      const sh = .4 + .6 * Math.abs(Math.sin(T * .7 + k * 1.9)); this.r[k].set(pts, deg(.28), deg(.28), I * sh * .18, 1); this.u[k].set(pts, deg(.6), deg(.6), I * sh * .28, 1); } },
  where: () => skyP(268, 32) }, o);

export const moonHalo = o => event({ name: 'Moon halo', t0: 48, t1: 60, bands: ['vis', 'uv', 'ir'], note: 'A full 22° halo rings the high Moon, with a fainter circumscribed ring and a warm infrared companion.',
  init() { this.m = new Rib('vis', '#e8e4c8', 33); this.c = new Rib('vis', '#c8d0e8', 33); this.u = new Rib('uv', null, 33); this.i = new Rib('ir', null, 33); },
  update() { const I = sm(48, 52, S.t); if (I <= 0) return; const d = moonDir();
    this.m.set(ringPts(d, 22, 32), deg(.55), deg(.55), I * .5); this.c.set(ringPts(d, 29 + Math.sin(S.T * .5) * .6, 32), deg(.4), deg(.4), I * .28);
    this.u.set(ringPts(d, 24, 32), deg(.9), deg(.9), I * .35); this.i.set(ringPts(d, 26, 32), deg(1.2), deg(1.2), I * .25); },
  where: () => onSky(moonDir()) }, o);
