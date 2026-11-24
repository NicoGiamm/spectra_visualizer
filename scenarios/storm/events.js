// Events of the thunderstorm on the plains (sky events come from the engine library).
// Clock: with no atmosphere `site`, 1 script unit = 3.4 min of sky time (engine/world/atmosphere.js, the Moon track),
// so the 0–60 axis spans ~3.4 h; playback runs 0.5 script units per real second. Derived durations: rain at the viewer
// t 22.5–44 ≈ 73 min, hail t 25–30 ≈ 17 min, power outage t 31.5–40 ≈ 29 min. A lightning flash (really ~0.2–0.3 s)
// is drawn over ~0.8 script units, i.e. ~1.6 s on screen: slowed about five- to tenfold. The strikes are a sample of
// the storm's flashes (a real supercell gives several a minute).
import * as THREE from 'three';
import { V3, DEG, clamp, lerp, sm, env, kf, R } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { deg, skyP } from 'spectra/core/geom.js';
import { Em, Rib, EmField } from 'spectra/render/sources.js';
import { visOnly } from 'spectra/render/instrument.js';
import { addTx } from 'spectra/render/surface.js';
import { cloudTex, softTex } from 'spectra/render/textures.js';
import { ENV } from 'spectra/world/atmosphere.js';
import { STORM, POLES, SPOTS, rainHere, heightAt } from './world.js';

const azOf = p => ((Math.atan2(p.z, p.x) / DEG) % 360 + 360) % 360;
const groundP = (az, d) => { const x = Math.cos(az * DEG) * d, z = Math.sin(az * DEG) * d; return new V3(x, heightAt(x, z), z); };
// a jagged path from a to b (n points): a random walk pinned at both ends; amp = lateral wander in m
function jagged(a, b, n, amp) {
  const off = [new V3()];
  for (let i = 1; i < n; i++) off.push(off[i - 1].clone().add(new V3((R() - .5) * amp, (R() - .5) * amp * .3, (R() - .5) * amp)));
  const end = off[n - 1];
  return off.map((o, i) => a.clone().lerp(b, i / (n - 1)).add(o.clone().addScaledVector(end, -i / (n - 1))));
}
// sky tint of lit cloud / rain (sunset orange → grey → night), shared by the approach and the rain shafts
const LIT = [[0, [.62, .36, .26]], [8, [.34, .2, .17]], [14, [.1, .085, .09]], [22, [.025, .025, .03]], [60, [.015, .016, .02]]];

// ---------------------------------------------------------------- the strike table (shared by the lightning events)
// Return strokes of a cloud-to-ground flash: typically 3–5 strokes ~40–60 ms apart (Rakov & Uman 2003, "Lightning:
// Physics and Effects", ch. 4); drawn at these ages (script-s) after the strike starts; the stepped leader takes the
// first LEAD script-s. Each stroke flashes and decays, with a faint continuing current in between.
const LEAD = .35, STROKES = [.35, .47, .58, .74], LIFE = 1.1;
const strokeB = a => { let b = a > LEAD && a < .95 ? .1 : 0; for (const s of STROKES) { const d = a - s; if (d >= 0 && d < .09) b = Math.max(b, (1 - d / .09) ** 1.5); } return b; };
export const STRIKES = [];
const SPECIAL = { close: 28.6, line: 31.2, tgf: 35.4 };
export const LINE_POLE = 5;   // the pole the 31.2 strike hits (~390 m ahead-left)
function buildStrikes() {
  const mk = (t, g, kind, extra = {}) => {
    const s = { t, kind, g, d: g.length(), i: STRIKES.length, ...extra };
    const top = new V3(g.x + (R() - .5) * 500, STORM.CB, g.z + (R() - .5) * 500);
    s.top = top; s.pts = jagged(top, g, 18, Math.max(25, top.distanceTo(g) * .045));
    s.br = [0, 1].map(() => { const i0 = 3 + Math.floor(R() * 6), p0 = s.pts[i0], dir = new V3(R() - .5, -1.2, R() - .5).normalize();
      return jagged(p0, p0.clone().addScaledVector(dir, 250 + R() * 300), 7, 30); });
    // in-cloud flash: the lit cloud volume, and for the trailing anvil (late) a "spider" channel crawling under it
    s.c = new V3(g.x, STORM.CB + 2500, g.z);
    const xs = (R() - .5) * 3000; s.crawl = jagged(new V3(xs, 5500, 2600), new V3(xs + (R() - .5) * 4000, 5800, -5200), 24, 260);
    STRIKES.push(s); return s;
  };
  for (let t = 3.5 + R() * 1.2; t < 55; t += 1.5 + R() * 1.4) {
    const x = STORM.coreX + (R() - .5) * 2600, z = STORM.frontZ(t) - 900 + (R() - .5) * 1800, az = azOf(new V3(x, 0, z));
    if (Object.values(SPECIAL).some(ts => Math.abs(ts - t) < 1.1)) continue;
    const inView = z < -150 && az > 205 && az < 335;
    mk(t, new V3(x, heightAt(x, z), z), inView ? 'cg' : 'ic');
  }
  mk(SPECIAL.close, groundP(250, 110), 'cg', { xray: true });
  mk(SPECIAL.line, POLES[LINE_POLE].ins[0].clone(), 'cg', { line: true });
  mk(SPECIAL.tgf, groundP(228, 700), 'cg', { tgf: true });
  STRIKES.sort((a, b) => a.t - b.t); STRIKES.forEach((s, i) => s.i = i);
}

// ---------------------------------------------------------------- storm approach
export const approach = () => event({ name: 'Supercell approach', t0: 0, t1: 26, bands: ['vis'], freq: ['sunlight'], tags: ['time-compressed'],
  note: 'A supercell rolls in from the west. Its anvil spreads ahead of it over you, its underside lit orange by the setting Sun; the storm tower stands on the horizon and a low shelf cloud marks the gust front, which flattens the grass about a kilometre ahead of the rain.',
  init() {
    const sp = (map, w, h) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false })); s.scale.set(w, h, 1); S.scene.add(visOnly(s)); return s; };
    this.tower = Array.from({ length: 6 }, (_, k) => ({ s: sp(cloudTex(), 5200 + R() * 2600, 4200 + R() * 1800), dx: (R() - .5) * 3600, dz: -R() * 2200, y: 2600 + k * 950 + R() * 500 }));
    this.shelf = Array.from({ length: 4 }, (_, k) => ({ s: sp(cloudTex(), 2600, 520), dx: (k - 1.5) * 1900 + (R() - .5) * 400, y: 520 + R() * 120 }));
  },
  update() {
    const { t } = S, [lit] = kf(LIT, t), f = STORM.flash, I = env(t, this.t0, this.t1, 3);
    this.p = null;
    this.tower.forEach(o => { const z = STORM.frontZ(t) - 6500 + o.dz, op = I * (1 - sm(-6400, -4200, z));
      o.s.visible = S.on.vis && op > .01; o.s.position.set(STORM.coreX + o.dx, o.y, z); o.s.material.opacity = op * .85;
      const b = 1 + f * 2.5, top = sm(3000, 7500, o.y);   // the upper tower keeps the sunset light longest
      o.s.material.color.setRGB(lit[0] * b * (.35 + .55 * top), lit[1] * b * (.33 + .4 * top), lit[2] * b * (.45 + .3 * top));
      if (!this.p && op > .2) this.p = o.s.position; });
    this.shelf.forEach(o => { const z = STORM.frontZ(t) + 700, op = I * (1 - sm(-500, -150, z));
      o.s.visible = S.on.vis && op > .01; o.s.position.set(STORM.coreX * .3 + o.dx, o.y, z); o.s.material.opacity = op * .9;
      const b = .5 + f * 3; o.s.material.color.setRGB(lit[0] * b, lit[1] * b, lit[2] * b * 1.1); });
    S.act.vis += .35 * I * (1 - sm(14, 24, t));
  }, where() { return this.p || null; } });

// ---------------------------------------------------------------- close lightning
export const lightning = () => event({ name: 'Close lightning', t0: 3, t1: 56, bands: ['vis', 'ir', 'uv', 'radio'], freq: ['lightning', 'o7774', 'airArcUV', 'lightningVHF', 'sferics'], tags: ['time-compressed'],
  note: 'Cloud-to-ground strikes from a few kilometres to a few hundred metres away, then "spider" lightning crawling under the trailing anvil. The ~30 000 K channel shines across the visible, with one of its brightest lines in the near-IR, the oxygen line at 777.4 nm (the line lightning satellites watch) and in near-UV N₂ bands; each stepped leader crackles in VHF (60–66 MHz) and every return stroke sends a VLF "sferic" racing outward at nearly the speed of light, guided for thousands of km between the ground and the ionosphere (drawn as a ring spreading vastly slowed). Flashes slowed about five- to tenfold so each flash and its 3–4 return strokes can be seen.',
  init() {
    buildStrikes();
    this.pool = [0, 1].map(() => ({ v: new Rib('vis', '#e6ecff', 18), b1: new Rib('vis', '#d8e2ff', 7), b2: new Rib('vis', '#d8e2ff', 7), ir: new Rib('ir', null, 18), uv: new Rib('uv', null, 18),
      vhf: new Rib('radio', null, 18), ring: new Rib('radio', null, 33), sf: new Em('radio'), glow: new Em('vis', '#b9c6ff'), crawl: new Rib('vis', '#cfd8ff', 24) }));
  },
  update() {
    const { t, on } = S; let flash = 0, at = null; this.p = null;
    for (const s of STRIKES) {
      const a = t - s.t; if (a < 0 || a > LIFE) continue;
      const P = this.pool[s.i % 2], b = strokeB(a), fade = 1 - clamp((a - LEAD) / (LIFE - LEAD));
      if (s.kind === 'cg') {
        const w = clamp(s.d * .004, 1.2, 22);
        if (a < LEAD) {   // stepped leader: faint, descending in steps; VHF from every step
          const n = Math.max(2, Math.ceil(Math.floor(a / LEAD * 12) / 12 * s.pts.length)), lead = s.pts.slice(0, n);
          P.v.set(lead, w * .4, w * .4, .3); P.vhf.set(lead, w * 3, w * 3, .7, 1);
          if (n > 8) { P.b1.set(s.br[0].slice(0, n - 7), w * .3, w * .2, .2); }
        } else {
          P.v.set(s.pts, w, w * 1.2, b * 2.4); P.ir.set(s.pts, w * 1.6, w * 1.6, b * 1.3); P.uv.set(s.pts, w * 1.3, w * 1.3, b * .9 * Math.exp(-s.d / 4000));
          if (a < STROKES[1]) { P.b1.set(s.br[0], w * .6, w * .3, b * 1.3); P.b2.set(s.br[1], w * .6, w * .3, b * 1.1); }
          P.glow.set(s.top, 700, b * .8);
          // VLF/LF sferic: the return stroke's current radiates; it travels thousands of km in the Earth–ionosphere waveguide —
          // drawn as a ring spreading outward, vastly slowed (really ~300 km per ms)
          const r = 20 + (a - LEAD) * 2600, ring = Array.from({ length: 33 }, (_, i) => { const q = i / 32 * Math.PI * 2; return new V3(s.g.x + Math.cos(q) * r, s.g.y + 3, s.g.z + Math.sin(q) * r); });
          P.ring.set(ring, 8 + r * .02, 8 + r * .02, .7 * fade); P.sf.set(s.g.clone().add(new V3(0, 40, 0)), clamp(s.d * .08, 60, 600), .9 * fade);
        }
        flash = Math.max(flash, b * clamp(1.6 - s.d / 3500, .35, 1.6)); at = s.top;
        if (!this.p) this.p = s.g.clone().add(new V3(0, Math.min(120, s.d * .15), 0));
      } else {
        P.glow.set(s.c, 2600, b * .7); P.sf.set(s.c, 900, a > LEAD ? .6 * fade : .4); P.vhf.set([s.c.clone().add(new V3(-600, -300, 0)), s.c, s.c.clone().add(new V3(700, 200, 300))], 120, 120, a < LEAD ? .6 : .3);
        if (s.t > 38) {   // trailing-anvil spider lightning: grows along the anvil base, then flashes
          const n = Math.max(2, Math.ceil(clamp(a / .5) * s.crawl.length)); P.crawl.set(s.crawl.slice(0, n), 30, 30, (a < .5 ? .5 : b * 1.8 + .15));
          if (!this.p) this.p = s.crawl[Math.min(n - 1, 12)];
        }
        flash = Math.max(flash, b * .55); at = s.c;
      }
    }
    STORM.flash = flash;
    if (at) ENV.flashLight.position.copy(at);
    ENV.flashLight.intensity = on.vis ? flash * 3 : 0; ENV.cloudMat.uniforms.uFlash.value = on.vis ? flash * .14 : 0;
  }, where() { return this.p; } });

// ---------------------------------------------------------------- X-rays from the leaders of the nearest strikes
// Stepped and dart leaders emit bursts of ~30 keV–few MeV X-rays just before each return stroke (Moore et al. 2001,
// Geophys. Res. Lett. 28, 2141; Dwyer et al. 2003, Science 299, 694; Dwyer et al. 2005, GRL 32, L01803). In sea-level
// air a 100 keV photon's mean free path is ~55 m (NIST XCOM μ/ρ 0.154 cm²/g), 1 MeV ~130 m: the bursts reach a
// detector only from the bottom of a channel within ~100–200 m, never from far strikes.
export const leaderXrays = () => event({ name: 'Leader X-rays', t0: 28, t1: 32.5, bands: ['xray'], freq: ['leaderXray'], tags: ['time-compressed'],
  note: 'As the stepped leader of a nearby strike nears the ground, and again with each dart leader before the next return stroke, it emits short bursts of X-rays. Air stops them within ~100–200 m (a 100 keV photon goes ~55 m), so only a strike within ~100–200 m (here one 110 m away) can be detected from the ground.',
  init() { this.s = STRIKES.filter(s => s.xray); this.e = new Em('xray'); this.e2 = new Em('xray'); if (this.s.length) { this.t0 = this.s[0].t; this.t1 = this.s.at(-1).t + 1; } },
  update() { this.p = null;   // the air's attenuation (NIST XCOM) is applied by the spectral eye per line of sight
    for (const s of this.s) { const a = t_(s); if (a < 0 || a > .8) continue;
      if (a < LEAD) { const n = Math.min(s.pts.length - 1, Math.floor(a / LEAD * s.pts.length)), tip = s.pts[n], h = tip.y - s.g.y;
        if (h < 400) { this.e.set(tip, 14, 3 * (.6 + .4 * Math.random())); this.p = tip; } }
      for (const st of STROKES.slice(1)) if (a > st - .035 && a < st) { const bot = s.pts[s.pts.length - 3]; this.e2.set(bot, 12, 2); this.p = bot; } } },
  where() { return this.p; } });
const t_ = s => S.t - s.t;

// ---------------------------------------------------------------- terrestrial gamma-ray flash (downward)
// TGFs are sub-millisecond bursts of gamma rays up to tens of MeV from runaway electron avalanches in thunderstorm
// fields, discovered from orbit (Fishman et al. 1994, Science 264, 1313; Fermi GBM: Briggs et al. 2010, JGR 115,
// A07323). Most beam upward out of the cloud tops and are seen only by satellites; downward TGFs from ~3–5 km up, in
// the first 1–2 ms of a downward negative leader, have been recorded on the ground at the Telescope
// Array (Abbasi et al. 2018, JGR Atmos. 123, 6864) and under Japanese winter storms (Enoto et al. 2017, Nature 551,
// 481). Their footprint is a few km wide.
export const tgf = () => event({ name: 'Terrestrial gamma-ray flash', t0: SPECIAL.tgf, t1: SPECIAL.tgf + 1, bands: ['gamma'], freq: ['tgf'], tags: ['rare', 'time-compressed'],
  note: 'A downward burst of gamma rays from ~4 km up, at the very start of the leader of a strike 700 m away, its footprint sweeping over you; it lasts less than a millisecond (drawn far longer). Satellites record thousands of (upward) TGFs a year; a ground detector catches one only rarely, from a strike within a few km. Here, at sea level under ~4 km of air (a 10 MeV photon goes ~380 m), almost nothing of it arrives: in the gamma view it barely rises above the ground\'s own speckle — what a ground observer would really get.',
  init() { this.s = STRIKES.find(s => s.tgf); this.c = new Em('gamma'); this.lines = Array.from({ length: 5 }, () => new Rib('gamma', null, 8)); this.ring = new Rib('gamma', null, 33); },
  update() { const s = this.s, a = S.t - s.t; this.p = null; if (a < 0 || a > .08) return;
    const k = 1 - a / .08, src = s.c, R0 = 1200;   // inside the cloud, ~3.9 km up, as the leader starts
    this.c.set(src, 260, 6 * k); this.p = src;
    this.lines.forEach((L, i) => { const q = i / 5 * Math.PI * 2 + .3, end = new V3(s.g.x + Math.cos(q) * R0, s.g.y + 2, s.g.z + Math.sin(q) * R0);
      L.set(Array.from({ length: 8 }, (_, j) => src.clone().lerp(end, j / 7)), 25, 40, 2 * k); });
    this.ring.set(Array.from({ length: 33 }, (_, i) => { const q = i / 32 * Math.PI * 2; return new V3(s.g.x + Math.cos(q) * R0, s.g.y + 2, s.g.z + Math.sin(q) * R0); }), 40, 40, 1.5 * k); },
  where() { return this.p; } });

// ---------------------------------------------------------------- whistlers
export const whistlers = () => event({ name: 'Whistlers', t0: 32, t1: 60, bands: ['radio'], freq: ['whistler'], tags: ['stylised'],
  note: 'Part of some strokes\' VLF energy escapes up through the night-time ionosphere, runs along Earth\'s magnetic field to the other hemisphere and back (a two-hop whistler), and returns dispersed into a falling whistle (~10 → 1 kHz, dispersion ~2 s) that a VLF receiver turns into sound; they are far more common at night. Drawn as the tone sliding down from high in the north-west sky; the delay is stretched.',
  init() { this.s = STRIKES.filter(s => s.t > 32 && s.i % 2 === 0); this.r = new Rib('radio', null, 10); this.e = new Em('radio'); },
  update() { this.p = null;
    for (const s of this.s) { const a = S.t - s.t; if (a < 1 || a > 3.4) continue;
      const p = (a - 1) / 2.4, head = 48 - 34 * p,   // ribbon top = head + 9.9 ≤ 58°: inside FOV_SKY (el ≤ 60)
         I = .75 * Math.sin(Math.PI * p) * sm(30, 40, S.t);
      const pts = Array.from({ length: 10 }, (_, i) => { const el = head + i * 1.1; return skyP(318 - 5 * Math.sin(el * .07), el); });
      this.r.set(pts, deg(.9), deg(.3), I); this.e.set(pts[0], deg(2.2), I); this.p = pts[0]; } },
  where() { return this.p; } });

// ---------------------------------------------------------------- weather radar
export const radar = () => event({ name: 'Weather radar (NEXRAD)', t0: 0, t1: 60, bands: ['micro'], freq: ['nexrad'], tags: ['stylised'],
  note: 'A WSR-88D Doppler radar under its dome 2 km to the south-west sweeps 10-cm (2.8 GHz) pulses around the horizon. Each time the beam passes you it flashes; where it crosses the rain the drops scatter it back to the radar (and a little toward you), which is how forecasters see the storm\'s hook and hail core. The sweep is drawn turning once every 8 s (a real one takes ~10–20 s per turn at low tilt; not compressed with the storm); the beam is drawn only where rain scatters it.',
  init() { this.d = SPOTS.radar; this.lobe = new Em('micro'); this.side = new Em('micro'); this.beam = new Rib('micro', null, 12); },
  update() { const { t, T } = S, d = this.d, phi = (T / 8) % 1 * Math.PI * 2;
    const dang = (x, y) => Math.abs(((x - y) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    const toCam = Math.atan2(-d.z, -d.x), core = new V3(STORM.coreX, 0, STORM.frontZ(t) - 1500), toCore = Math.atan2(core.z - d.z, core.x - d.x), dc = Math.hypot(core.x - d.x, core.z - d.z);
    this.lobe.set(d, 70, 1.6 * Math.exp(-((dang(phi, toCam) / .07) ** 2))); this.side.set(d, 16, .12);   // main lobe passing you / sidelobes
    const hit = Math.exp(-((dang(phi, toCore) / .4) ** 2)) * sm(0, 6, t + 6) * (1 - sm(50, 60, t));
    if (hit > .02) { const dir = new V3(Math.cos(phi), 0, Math.sin(phi)), pts = [];
      for (let i = 0; i < 12; i++) { const r = Math.max(200, dc - 2600) + i / 11 * 5200; pts.push(d.clone().addScaledVector(dir, r).add(new V3(0, r * .0087, 0))); }   // 0.5° tilt
      this.beam.set(pts, 80, 160, hit * .8); } },
  where() { return this.d; } });

// ---------------------------------------------------------------- rain shafts
export const rain = () => event({ name: 'Rain shafts', t0: 3, t1: 50, bands: ['vis', 'micro'], freq: ['sunlight', 'rainMicro'],
  note: 'Grey curtains of rain hang under the storm, sunlit orange at first, then lit only by the lightning. Rain and cloud water glow in microwave (~20–40 GHz): to a radiometer the clear sky is cold (~20 K) and heavy rain almost as warm as the ground, so the shafts stand out — and once the rain is overhead the whole sky turns warm.',
  init() {
    this.c = Array.from({ length: 12 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), transparent: true, depthWrite: false, fog: false })); S.scene.add(visOnly(s));
      return { s, ox: R() * 3400, x: STORM.coreX + (R() - .5) * 3400, w: 700 + R() * 600 }; });
    this.mw = new EmField('micro', 12); this.sky = new Em('micro');
  },
  update() { const { t, camera } = S, I = env(t, this.t0, this.t1, 3), [lit] = kf(LIT, t), f = STORM.flash; this.p = null;
    this.c.forEach((o, i) => { const z = STORM.frontZ(t) - o.ox, vis = I * (1 - sm(-400, -80, z)) * sm(-12000, -9000, z);
      o.s.visible = S.on.vis && vis > .01; if (vis <= .01) return;
      o.s.position.set(o.x, 750, z); o.s.scale.set(o.w, 1700, 1); o.s.material.opacity = vis * .5;
      const b = .75 + f * 2.2; o.s.material.color.setRGB(lit[0] * b, lit[1] * b, lit[2] * b * 1.1);
      this.mw.set(i, o.s.position, o.w * .9, vis * .25); if (!this.p) this.p = o.s.position; });
    const over = rainHere(t); if (over > .01) this.sky.set(camera.position.clone().add(new V3(0, 700, -500)), 1800, over * .35);
    S.act.vis += .25 * I * (1 - sm(10, 18, t)); },
  where() { return this.p; } });

// ---------------------------------------------------------------- rain-cooled ground (the terrain shader does the drawing)
export const coldGround = () => event({ name: 'Rain-cooled ground', t0: 8, t1: 60, bands: ['ir', 'micro'], freq: ['coldPool', 'wetSoilMW'],
  note: 'Cold, rain-chilled outflow and evaporation leave the wet prairie several degrees colder: on a thermal camera a dark front sweeps toward you with the rain and stays behind it. Wet soil also looks colder in microwave (at L-band, ~1.4 GHz, where the reflected sky is only ~5 K), because water lowers its emissivity — the trick soil-moisture satellites use.',
  update() { const { t } = S, wet = clamp((STORM.frontZ(t) + 3000) / 3500); S.act.ir += .35 * wet; S.act.micro += .12 * wet;
    const z = clamp(STORM.frontZ(t) - 220, -2500, -40); this.p = new V3(-30, heightAt(-30, z) + 1, z); },
  where() { return this.p; } });

// ---------------------------------------------------------------- hail
export const hail = () => event({ name: 'Hail burst', t0: 25, t1: 30, bands: ['vis', 'ir'], freq: ['lightning', 'coldPool'],
  note: 'For about a quarter of an hour the storm\'s hail core passes overhead: stones the size of marbles, seen only in the lightning flashes; the ground turns white-grey, and on a thermal camera into a 0 °C patch until it melts.',
  init() { this.h = Array.from({ length: 220 }, () => ({ x: (R() - .5) * 70, z: -4 - R() * 60, y: R() * 25, s: .8 + R() * .4 })); this.f = new EmField('vis', this.h.length, '#e8f0ff'); },
  update() { const { t, T } = S, I = env(t, 25, 30, .6); if (I <= 0) return;
    const f = STORM.flash;
    if (f > .05) this.h.forEach((o, i) => { const y = 25 - ((o.y + T * 14 * o.s) % 25); this.f.set(i, new V3(o.x, heightAt(o.x, o.z) + y, o.z), .05, I * f * .9); });
    S.act.ir += .3 * STORM.hail(t); },
  where() { return new V3(-10, heightAt(-10, -30) + 3, -30); } });

// ---------------------------------------------------------------- power line: corona in the rain, flashover, St. Elmo's fire
export const powerLine = () => event({ name: 'Power-line corona & flashover', t0: 18, t1: 44, bands: ['radio', 'uv', 'vis'], freq: ['coronaRF', 'airArcUV', 'arcLight'],
  note: 'Rain drops on the 115 kV conductors and insulators break the air into corona: faint near-UV, strongest in the N₂ 337 nm band (daytime corona cameras use the weaker 240–280 nm solar-blind part), and a broadband radio hiss. At t ≈ 31 lightning hits the line: an insulator flashes over in a blue-white arc, the breaker trips and locks out, the line goes dead — the substation feed to the farm drops out with it — and the corona stops until power is restored. Meanwhile, the strong field under the storm core makes the farm mast\'s lightning rod glow violet — St. Elmo\'s fire.',
  init() { this.poles = POLES.slice(0, 10); this.uv = new EmField('uv', 30); this.rf = new EmField('radio', 10);
    this.arcV = new Em('vis', '#cfd6ff'); this.arcU = new Em('uv'); this.arcR = new Em('radio'); this.elmoV = new Em('vis', '#9b8cff'); this.elmoU = new Em('uv'); },
  update() { const { t } = S, live = !(t > SPECIAL.line + LEAD && t < 40), w = rainHere(t) * env(t, this.t0, this.t1, 1.5); this.p = null;
    if (live && w > .02) this.poles.forEach((P, i) => { const k = w * Math.exp(-i * .12);
      P.ins.forEach((q, j) => this.uv.set(i * 3 + j, q, 1.1, k * .3 * (.6 + .4 * Math.random())));
      this.rf.set(i, P.top, 30, k * .25); });
    const a = t - SPECIAL.line, P = POLES[LINE_POLE];
    if (a > LEAD && a < 1) { const b = Math.max(strokeB(a), .25 * (1 - a)); this.arcV.set(P.ins[0], 7, b * 2.4); this.arcU.set(P.ins[0], 9, b * 1.6); this.arcR.set(P.top, 220, b); this.p = P.top; }
    const elmo = env(t, 24, 34, 2); if (elmo > 0) { const fl = .7 + .3 * Math.random(); this.elmoV.set(SPOTS.mastTip, .9, elmo * .5 * fl); this.elmoU.set(SPOTS.mastTip, 1.6, elmo * .7 * fl); }
    if (!this.p) this.p = t < 31 && elmo > .2 ? SPOTS.mastTip : this.poles[2].top; },
  where() { return this.p; } });

// ---------------------------------------------------------------- the farmhouse
const powered = t => !(t > SPECIAL.line + LEAD && t < 40);
export const farmhouse = () => event({ name: 'Farmhouse', t0: 0, t1: 60, bands: ['vis', 'micro'], freq: ['incandescent', 'ledWhite', 'wifi24'],
  note: 'Lights come on at dusk and the Wi-Fi router (2.4 GHz) fills the yard; when lightning knocks out the line at t ≈ 31 everything goes dark except a battery lantern moving behind a window, until the power comes back.',
  init() { this.w = SPOTS.farmWins.map(() => new Em('vis', '#ffb060')); this.lan = new Em('vis', '#eef2ff'); this.wifi = new Em('micro');
    addTx('micro', () => (powered(S.t) ? { p: SPOTS.farmRoof, power: .8 } : null)); },
  update() { const { t, T } = S, on = powered(t), lit = sm(5, 9, t) * (on ? 1 : 0);
    SPOTS.farmWin.color.setRGB(.03 + 1.5 * lit, .02 + .8 * lit, .005 + .3 * lit);
    this.w.forEach((e, i) => e.set(SPOTS.farmWins[i], 2.4, lit * .5));
    if (!on) { const k = Math.floor(T * .4) % 3; this.lan.set(SPOTS.farmWins[k], 1.4, .35 * sm(SPECIAL.line + 1.2, SPECIAL.line + 2.5, t)); }
    if (on) this.wifi.set(SPOTS.farmRoof, 4, .8); },
  where() { return SPOTS.farmRoof; } });

// ---------------------------------------------------------------- after the storm
export const fireflies = () => event({ name: 'Fireflies after the rain', t0: 47, t1: 60, bands: ['vis'], freq: ['luciferin'],
  note: 'Once the rain has gone east, a few fireflies flash over the wet grass. This late (2–3 h after an early-August sunset) most species have stopped; the late-night flashers are Photuris. Cold light with almost no infrared.',
  init() { this.f = Array.from({ length: 90 }, () => { const z = -8 - R() * 120, x = (R() - .5) * 90; return { b: new V3(x, heightAt(x, z) + .3 + R() * 1.8, z), s: .5 + R(), p: R() * 6, r: 1.3 + R() * 2 }; }); this.field = new EmField('vis', this.f.length, '#b8ff3a'); },
  update() { const { t, T } = S, I = env(t, this.t0, this.t1, 2); if (I <= 0) return;
    this.f.forEach((f, k) => { const b = Math.max(0, Math.sin(T * f.r + f.p)) ** 8; this.field.set(k, f.b.clone().add(new V3(Math.sin(T * .5 * f.s + f.p) * .7, Math.sin(T * 1.1 * f.s) * .3, Math.cos(T * .4 * f.s + f.p) * .7)), .14, I * b * 1.6); }); },
  where: () => null });
