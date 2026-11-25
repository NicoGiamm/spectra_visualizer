// Shared library of sky / atmosphere events. They depend only on the camera, the shared
// atmosphere timeline and S.groundAt, so any scenario can reuse them. Each export is a
// factory: `meteorShower()` keeps the default timing, `meteorShower({ t0: 30, t1: 44 })` retimes.
// When retiming, also check what update() hard-codes (several use their default window inside).
//
// Source origin (Ground / Orbit detector, plan 2.1): sources default to 'ground'; anything emitted high in the
// atmosphere or in space in a band the air absorbs (far-UV, X-ray, gamma) is built with the optional last
// constructor argument, e.g. `new Em('xray', null, 0, 'space')`, `new Rib('uv', null, 2, 0, 'high')`.
// In Ground mode those are hidden and the overlay draws a ghost marker instead.
import * as THREE from 'three';
import { V3, DEG, clamp, lerp, sm, env, kf, R } from '../core/util.js';
import { S } from '../core/state.js';
import { event } from '../core/events.js';
import { D, deg, dirAE, skyP, onSky, basis, ringPts, linePts, FOV_SKY, fovAz } from '../core/geom.js';
import { Em, Rib, EmField, BEAM, toViewer } from '../render/sources.js';
import { visOnly } from '../render/instrument.js';
import { canvasTex, cloudTex, moonTex, softTex } from '../render/textures.js';
import { ENV, SUN_AZ, sunEl, moonDir, night, moonlit, moonFlux, MOON_ELONG, MOON_K, GAL_C, CONTRAIL } from '../world/atmosphere.js';

export const sunset = o => event({ name: 'Sunset', t0: 0, t1: 16, bands: ['vis', 'ir', 'uv', 'radio'], freq: ['sunlight', 'solarNIR', 'solarUV', 'solarRadio'], tags: ['common'], note: 'The Sun is bright in every band; its UV fades first as it sets.',
  init() { this.e = [new Em('ir'), new Em('uv'), new Em('radio'), new Em('vis', '#ffb070')]; },
  update() { const { t } = S, el = sunEl(), I = sm(-3, 1, el); this.p = skyP(SUN_AZ, el);
    this.e[0].set(this.p, deg(2.2), I); this.e[1].set(this.p, deg(1.4), I * (1 - sm(0, 12, t))); this.e[2].set(this.p, deg(2), I * .6); this.e[3].set(this.p, deg(1.6), I * .22); },
  where() { return this.p; } }, o);

const planeDir = p => dirAE(fovAz(p), 12 + 40 * Math.sin(Math.PI * p));          // crosses the FOV cone left → right, peak 52°
export const airliner = o => event({ name: 'Airliner', t0: 3, t1: 27, bands: ['vis', 'ir', 'radio', 'micro'], freq: ['navRed', 'sunlight', 'thermal700', 'modeS', 'airband', 'wxRadar'], tags: ['common'], note: 'Nav lights & sunlit contrail, hot engines (IR), VHF airband voice bursts (radio), Mode S transponder replies at 1090 MHz and weather radar (microwave).',
  init() { this.trail = new Rib('vis', '#ffffff', 34); this.s = new Em('vis', '#ffffff'); this.b = new Em('vis', '#ff3030'); this.g = new Em('vis', '#40ff60'); this.ir = new Em('ir', null, 1); this.ex = new Rib('ir', null, 4, 1); this.ra = new Em('radio'); this.mi = new Em('micro'); this.wx = new Em('micro'); this.p = null; },
  update() { const { t, T } = S, t0 = this.t0, t1 = this.t1;
    if (t < t0 || t > t1) { this.p = null; return; }
    const p = (t - t0) / (t1 - t0), I = env(t, t0, t1, 1), pos = onSky(planeDir(p)); this.p = pos;
    const pts = []; for (let k = 30; k >= 0; k--) { const pk = p - k * .006; if (pk >= 0) pts.push(onSky(planeDir(pk))); }
    this.trail.m.material.uniforms.uColor.value.setRGB(...kf(CONTRAIL, t)[0]);
    this.trail.set(pts, deg(.55), deg(.1), I * .9, 1);
    this.s.set(pos, deg(.7), T % 1 < .06 ? 1.6 : 0); this.b.set(pos, deg(.5), T % 1.3 < .15 ? 1.3 : 0); this.g.set(pos, deg(.25), .6);
    this.ir.set(pos, deg(.35), I * .55); if (pts.length > 3) this.ex.set([pts[pts.length - 4], pos], deg(.14), deg(.1), I * .45, 1);
    const cyc = (t - t0) % 3.4, talk = cyc < 1.4 ? sm(0, .1, cyc) * (1 - sm(1.2, 1.4, cyc)) * (.75 + .25 * Math.sin(T * 37)) : 0;   // pilot/ATC voice transmissions (118–137 MHz)
    // the eye: what each antenna sends down to you. VHF com and the Mode S transponder use belly blade monopoles (a
    // dipole's doughnut by image theory, axis pointing down: a null straight below, full toward the horizon); the nose
    // weather radar is a ~76 cm flat plate at 9.3 GHz (θ3dB ≈ 70 λ/D ≈ 3°) scanning ahead at ~2° down, so from the
    // ground you only catch its sidelobes (−25 dB) — BEAM in sources.js
    const v = toViewer(pos), belly = BEAM.dipole(Math.sin(-v.el)), wx = BEAM.dish(-v.el - 2 * DEG, 3 * DEG, 10 ** -2.5);
    this.ra.set(pos, deg(1.7), I * talk * .9, belly);
    this.mi.set(pos, deg(.5), T % .45 < .05 ? I * .9 : 0, belly); this.wx.set(pos, deg(.8), I * .3, wx);       // Mode S replies (1090 MHz) + nose weather radar
  }, where() { return this.p; } }, o);

export const venus = o => event({ name: 'Evening star (Venus)', t0: 5, t1: 57, bands: ['vis'], freq: ['sunlight'], tags: ['common'], note: 'Reflected sunlight; the first "star" to appear after sunset.',
  init() { this.e = new Em('vis', '#fff6e0'); },
  update() { const { t } = S; this.p = skyP(287, 20 - t * .33); this.e.set(this.p, deg(.45), env(t, 5, 57, 4) * (.3 + .9 * sm(5, 15, t))); }, where() { return this.p; } }, o);

export const cmb = o => event({ name: 'Cosmic microwave background', t0: 16, t1: 60, bands: ['micro'], freq: ['cmb'], tags: ['stylised'], note: 'Leftover glow from the Big Bang, mottled across the whole sky.',
  // the mottled haze is the old view's symbol, painted into the night sky's visible colour; the spectral eye draws the real
  // microwave sky instead (atmosphere.js BAND_SKY: 2.7 K behind the warm air — the CMB stays invisible next to the
  // ~280 K ground, as it would to a microwave camera), so the eye does not paint it (M11/T6 review)
  update() { const I = sm(16, 26, S.t) * .9; ENV.nightMat.uniforms.uCMB.value = S.on.micro && !S.eye ? I : 0; S.act.micro += I * .6; }, where: () => null }, o);

export const milkyWay = o => event({ name: 'Milky Way', t0: 18, t1: 60, bands: ['vis', 'ir', 'radio'], freq: ['starlight', 'dustFIR', 'synchrotron'], tags: ['common'], note: 'Starlight with dark dust lanes; the dust glows in IR, Sgr A* (galactic centre, ahead-left) in radio.',
  init() { this.ir = new Em('ir'); this.ra = new Em('radio'); },
  update() { const { t } = S, mw = sm(18, 30, t), ml = sm(38, 50, t); ENV.nightMat.uniforms.uMW.value = S.on.vis ? mw * (1 - .4 * ml) * ENV.starDim : 0; S.act.vis += mw * .3;
    const p = onSky(GAL_C); this.ir.set(p, deg(14), mw * .35); this.ra.set(p, deg(2.5), mw * .6); }, where: () => onSky(GAL_C) }, o);

export const meteorShower = o => event({ name: 'Meteor shower', t0: 19, t1: 33, bands: ['vis', 'uv', 'radio'], freq: ['meteorLight', 'meteorUV', 'meteorEcho'], tags: ['time-compressed'], note: 'Streaks of light at ~100 km and radio echoes off the ionized trails; their UV is absorbed before it reaches the ground.',
  init() { this.m = Array.from({ length: 22 }, () => ({ t0: this.t0 + R() * (this.t1 - this.t0 - 1), az: fovAz(.1 + R() * .8), el: 34 + R() * (FOV_SKY.elMax - 36), daz: (R() - .5) * 24, del: -18 - R() * 24, v: new Rib('vis', '#fff4e0', 2), u: new Rib('uv', null, 2, 0, 'high'), r: new Em('radio') })); },
  update() { const { t } = S; this.m.forEach(m => { const p = (t - m.t0) / 1.5; if (p < 0 || p > 1) return;
    const a = dirAE(m.az, m.el), b = dirAE(m.az + m.daz, m.el + m.del), head = onSky(a.clone().lerp(b, p)), tail = onSky(a.clone().lerp(b, Math.max(0, p - .3))), I = (1 - p) * 1.5;
    m.v.set([tail, head], deg(.24), deg(.24), I, 1); m.u.set([tail, head], deg(.35), deg(.35), I * .5, 1); m.r.set(head, deg(2), 1 - p); }); },
  where: () => skyP(270, 46) }, o);

// A point on the tangent plane of the sky at direction c (basis u, v): x, y in degrees
const tpt = (c, u, v, x, y) => onSky(c.clone().addScaledVector(u, x * DEG).addScaledVector(v, y * DEG));
// Pulsar in its supernova remnant, modelled on Vela (M11/T5). A pulsar's beam is seen only when it sweeps across the
// Earth, so from here the neutron star is a point that pulses: no beam, cones or wind are drawn — nobody sees them from
// the side. What is large on the sky is the remnant around it, drawn at true angular size:
//   * the shell, ~8° across in soft X-rays (ROSAT all-sky survey: Aschenbach, Egger & Trümper 1995, Nature 373, 587)
//     and in radio (Parkes 2.4 GHz: Duncan et al. 1996, MNRAS 280, 252), the catalogued remnant G263.9−3.3 (Green 2019,
//     J. Astrophys. Astron. 40, 36); the pulsar PSR B0833−45 (l, b = 263.55°, −2.79°) sits ~0.6° off its centre;
//   * the X-ray "shrapnel" A–F, ejecta fragments bow-shocked beyond the rim (Aschenbach et al. 1995): positions here
//     schematic, at 1.05–1.3 shell radii as in the ROSAT map; clumpy soft X-ray patches inside the shell;
//   * Vela X, the radio pulsar-wind nebula, ~2° × 3° mostly south of the pulsar (Frail et al. 1997, ApJ 475, 224, VLA 330 MHz; flat spectrum to 34.5 MHz:
//     Dwarakanath 1991, JApA 12, 199), and the X-ray
//     "cocoon" running ~45′ from the pulsar into it (Markwardt & Ögelman 1995, Nature 375, 40); the Chandra torus and
//     jets are arcminutes across — part of the point here;
//   * the optical filaments (Hα, [O III]) tracing the shell — far below the naked eye: a long-exposure camera's view;
//     the pulsar's optical counterpart is V ≈ 23.6 (Lasker 1976; Nasuti et al. 1997, A&A 323, 839), its pulses detected
//     at B ≈ 25.2 (Wallace et al. 1977, Nature 266, 692): drawn barely there.
// The pulses are slowed (stylised): Vela's period is 89 ms, 11 pulses a second; drawn ~1.4 a second so they read.
// Placed for display on the one stylised sky: Vela (Dec −45°) never rises at mid-northern latitudes.
// The sky layout is fixed (built once in init, no R draws: the seeded stream is untouched).
const VELA_R = 4, VELA_OFF = .6;                                  // shell radius (deg), pulsar offset from its centre (deg)
const velaR = a => VELA_R * (1 + .045 * Math.sin(3 * a + 1.1) + .03 * Math.sin(5 * a + .4));   // a slightly irregular rim
const VELA_SHRAPNEL = [[.55, 1.22], [1.25, 1.12], [2.3, 1.08], [3.2, 1.3], [4.1, 1.15], [5.4, 1.06]];   // A–F: [angle rad, r / R]
const fract = s => s - Math.floor(s), hsh = x => fract(Math.sin(x) * 43758.5453);
const VELA_KNOT = Array.from({ length: 12 }, (_, i) => [hsh(i * 12.9 + 1.3) * 6.283, Math.sqrt(hsh(i * 78.2 + 4.1)) * .82, .7 + hsh(i * 3.7 + 9.1) * .6]);   // [angle, r / R, brightness]
const VELA_FIL = [[.2, 1.3], [1.9, 2.7], [3.4, 4.3], [4.9, 5.7]];    // optical filament arcs along the rim [a0, a1] rad
export const pulsar = o => event({ name: 'Vela pulsar & supernova remnant', t0: 20, t1: 60, bands: ['radio', 'xray', 'vis'], freq: ['pulsarRadio', 'pulsarOptical', 'pulsarXray', 'snrShellRadio', 'snrShellXray', 'pwnRadio', 'snrFilaments'], tags: ['stylised'],
  note: 'A spinning neutron star is seen only as a pulsing point — we catch its beam only when it sweeps across us (slowed here: Vela pulses 11 times a second). Around it lies what is big: the remnant of the supernova that made it, an 8° shell in radio and X-rays with fragments punched through the rim, the radio wind nebula Vela X beside the pulsar and faint glowing filaments in the visible. The X-rays only reach detectors in orbit.',
  init() { this.d = dirAE(242, 52); this.v = new Em('vis'); this.r = new Em('radio'); this.x = new Em('xray', null, 0, 'space');
    const [u, v] = basis(this.d); this.c = this.d.clone().addScaledVector(v, -VELA_OFF * DEG).normalize();   // the shell's centre, below the pulsar
    this.shellX = new Rib('xray', null, 65, 0, 'space'); this.shellR = new Rib('radio', null, 65); this.cocoon = new Rib('xray', null, 6, 0, 'space');
    this.knots = new EmField('xray', VELA_SHRAPNEL.length + VELA_KNOT.length, null, 0, 'space');
    this.velaX = [new Em('radio'), new Em('radio')]; this.fil = VELA_FIL.map(() => new Rib('vis', '#ff8a9a', 17));
    const [cu, cv] = basis(this.c), P = (r, a) => tpt(this.c, cu, cv, r * Math.cos(a), r * Math.sin(a));
    this.rim = Array.from({ length: 65 }, (_, i) => { const a = i / 64 * 6.283; return [velaR(a), a]; });
    this.knotA = [...VELA_SHRAPNEL.map(([a, k]) => [k * velaR(a), a]), ...VELA_KNOT.map(([a, k]) => [k * velaR(a), a])];
    this.filA = VELA_FIL.map(([a0, a1]) => Array.from({ length: 17 }, (_, i) => { const a = lerp(a0, a1, i / 16); return [velaR(a) * (.95 + .015 * Math.sin(i * .9)), a]; }));
    this.P = P; this.uv = [u, v]; },
  update() { const { t, T } = S, I = env(t, this.t0, this.t1, 3); if (I <= 0) return;
    const p = onSky(this.d), pulse = Math.max(0, Math.sin(T * 9)) ** 20, [u, v] = this.uv, at = ([r, a]) => this.P(r, a);   // positions follow the camera (onSky)
    this.r.set(p, deg(.8), I * (.25 + .9 * pulse)); this.x.set(p, deg(.4), I * (.1 + .1 * pulse)); this.v.set(p, deg(.15), I * (.04 + .2 * pulse));
    const rim = this.rim.map(at); this.shellR.set(rim, deg(.7), deg(.7), I * .7); this.shellX.set(rim, deg(.9), deg(.9), I * .1);
    this.velaX[0].set(tpt(this.d, u, v, -.35, -.7), deg(8), I); this.velaX[1].set(tpt(this.d, u, v, -.8, -1.9), deg(9), I * .8);   // Vela X: ~2° × 3°, south-west of the pulsar
    this.cocoon.set(linePts(p, tpt(this.d, u, v, -.3, -.7), 6), deg(.22), deg(.12), I * .06);
    this.knotA.forEach((q, i) => { const sh = i < VELA_SHRAPNEL.length; this.knots.set(i, at(q), deg(sh ? .7 : 4), I * (sh ? .025 : .015 * VELA_KNOT[i - VELA_SHRAPNEL.length][2])); });
    this.fil.forEach((f, i) => f.set(this.filA[i].map(at), deg(.12), deg(.12), I * .12));
  },
  where() { return onSky(this.d); } }, o);

export const comet = o => event({ name: 'Comet', t0: 24, t1: 48, bands: ['vis', 'uv', 'ir', 'xray'], freq: ['cometDust', 'cometIon', 'cometLyA', 'cometDustIR', 'cometXray'], tags: ['rare'], note: 'Curved dust tail (visible/IR) and straight blue ion tail (CO⁺); its hydrogen cloud (Lyman-α UV) and solar-wind X-rays only reach detectors in orbit.',
  init() { this.dust = new Rib('vis', '#ffe6c4', 14); this.ion = new Rib('vis', '#8fb4ff', 14); this.uv = new Rib('uv', null, 14, 0, 'space'); this.dir = new Rib('ir', null, 14); this.hv = new Em('vis', '#eafff2'); this.hi = new Em('ir'); this.hx = new Em('xray', null, 0, 'space'); },
  update() { const I = env(S.t, this.t0, this.t1, 3); if (I <= 0) return;
    const H = dirAE(276, 24), Sd = dirAE(SUN_AZ, sunEl()), td = H.clone().sub(Sd); td.addScaledVector(H, -td.dot(H)).normalize(); const pp = new V3().crossVectors(H, td).normalize(), L = .22;
    const dust = [], ion = []; for (let k = 13; k >= 0; k--) { const f = k / 13; dust.push(onSky(H.clone().addScaledVector(td, f * L).addScaledVector(pp, f * f * L * .3))); ion.push(onSky(H.clone().addScaledVector(td, f * L * 1.3).addScaledVector(pp, -f * L * .05))); }
    this.dust.set(dust, deg(3.2), deg(.3), I * .7, 1); this.ion.set(ion, deg(.6), deg(.15), I * .6, 1); this.uv.set(ion, deg(.5), deg(.15), I * .8, 1); this.dir.set(dust, deg(1.3), deg(.3), I * .35, 1);
    const h = onSky(H); this.hv.set(h, deg(.45), I * 1.2); this.hi.set(h, deg(.8), I * .5); this.hx.set(h, deg(.8), I * .7); },
  where: () => skyP(276, 24) }, o);

// Earth's shadow on the sky (twilight geometry, M8/T3). Is a point h km up along the unit direction `dir` still in
// sunlight? Earth-centred frame with the observer at (0, R⊕, 0) on dirAE's axes (x north, y up, z east), slant range
// s = −R⊕ sin e + √((R⊕ sin e)² + 2R⊕h + h²) for elevation e, the Sun at (SUN_AZ, sunEl()). The shadow is a cylinder
// (no umbral cone: at LEO distances it narrows by < 0.5 %) of radius R⊕ + 20 km — sunlight grazing the lowest ~20 km
// is absorbed and refracted away, the usual "effective screening height" — with a ±25 km soft edge for the penumbra
// and the reddened rim. Straight overhead the shadow height is (R⊕ + 20 km)/cos δ − R⊕ for a Sun δ below the horizon
// (the textbook R⊕(1/cos δ − 1) plus the screening layer): 119 km at δ 10°, 349 km at δ 18°, 430 km at δ 20°. Toward the west (the cone faces the Sun's side)
// points stay lit longer, so on this timeline a 420 km satellite in the cone is lit until t ≈ 46 (δ ≈ 21°) and the
// 82 km noctilucent layer at 5° elevation goes dark at δ ≈ 13°.
const R_EARTH = 6371;
export function sunlitAt(dir, h) {
  const se = dir.y, s = -R_EARTH * se + Math.sqrt((R_EARTH * se) ** 2 + 2 * R_EARTH * h + h * h);
  const px = s * dir.x, py = R_EARTH + s * dir.y, pz = s * dir.z, sd = dirAE(SUN_AZ, sunEl()), along = px * sd.x + py * sd.y + pz * sd.z;
  if (along > 0) return 1;                                                                  // on the day side of the terminator plane
  return sm(-25, 25, Math.sqrt(Math.max(0, px * px + py * py + pz * pz - along * along)) - R_EARTH - 20);
}
const depression = () => -sunEl();                                                         // Sun's depression angle δ (deg)

// LEO satellites shine by reflected sunlight while the observer is already in twilight. Retimed into the opening
// (M8/T3, was t 25–39): an ISS-class pass (mag ≈ −3, ~420 km) is bright enough to see from δ ≈ 2° (t ≈ 11), and in
// the west-facing cone it stays sunlit for the whole pass (sunlitAt: shadow entry only after t ≈ 46, δ ≈ 21°); the
// fade is computed, so a later retime shows the shadow entry mid-pass. Radio/microwave don't care about the sky.
// Duration (M9/T3): the ISS orbits in 92.7 min at ~420 km; horizon to horizon at most 10.4 min, above ~12° (the
// cone's track) ~5 min ≈ 1.5 script units (1 unit ≈ 3.4 min) — 3 real seconds. Drawn over 4 units (×~3 slower,
// tagged `stylised`) so the eye can follow it; the note says so.
const satDir = p => dirAE(fovAz(p), 12 + 46 * Math.sin(Math.PI * p));            // across the FOV cone, culminating at 58°
export const satellitePass = o => event({ name: 'Satellite pass', t0: 12, t1: 16, bands: ['vis', 'radio'], freq: ['sunlight', 'satBeacon'], tags: ['common', 'stylised'], note: 'A bright space station still in sunlight ~400 km up while the ground is in twilight: reflected sunlight, and its amateur-radio downlink on 145.8 MHz that a handheld can pick up (its microwave links go up to relay satellites, not down to you). It would fade out mid-pass where it enters Earth\'s shadow — here, toward the sunset side, that only happens with the Sun ~21° down. Slowed about threefold so you can follow it: a real pass across this part of the sky takes about five minutes.',
  init() { this.v = new Em('vis'); this.r = new Em('radio'); this.p = null; },   // S/Ku links relayed via TDRSS (geostationary), not to the ground
  update() { const { t } = S, sp = (t - this.t0) / (this.t1 - this.t0); if (sp < 0 || sp > 1) { this.p = null; return; } const I = env(t, this.t0, this.t1, 1), d = satDir(sp), p = onSky(d); this.p = p;
    this.v.set(p, deg(.22), I * sunlitAt(d, 420) * sm(1, 3, depression())); this.r.set(p, deg(.6), I * .5); },
  where() { return this.p; } }, o);

// A freshly launched Starlink train (~300 km, still orbit-raising; mag ~2–3 each) needs a darker sky than the ISS:
// it shows from δ ≈ 4–7° (t 15–20). Retimed into the opening (M8/T3, was t 28–36); fully sunlit in the cone (sunlitAt).
// Duration (M9/T3): each satellite crosses the cone in ~4 min at ~300 km (90.5 min orbit), and a fresh train strung
// out over ~10 min files past for longer: ~15 min ≈ 4.5 units. While orbit-raising the satellites serve no users;
// their Ku-band link is telemetry/command with ground stations (SpaceX FCC filings, TT&C in Ku-band).
export const starlink = o => event({ name: 'Starlink train', t0: 18, t1: 22.5, bands: ['vis', 'micro'], freq: ['sunlight', 'kuDownlink'], note: 'A string of freshly launched satellites, still low (~300 km) and sunlit as twilight deepens, filing past for a quarter of an hour. Still raising their orbits, they serve no one yet: their microwave signal is telemetry to ground stations.',
  init() { this.s = Array.from({ length: 22 }, (_, k) => k); this.v = new EmField('vis', 22, '#f4f6ff'); this.m = new EmField('micro', 22); this.p = null; },
  // each satellite ~1.2 units (~4 min) across the cone, the train strung out over ~3 units (~10 min): q = p·3.8 − k·0.125
  update() { const { t } = S; if (t < this.t0 || t > this.t1) { this.p = null; return; } const p = (t - this.t0) / (this.t1 - this.t0), I = env(t, this.t0, this.t1, 1), vis = I * sm(4, 7, depression()); this.p = null;   // label: the first satellite still in the cone
    this.s.forEach((s, k) => { const q = p * 3.8 - k * .125; if (q < 0 || q > 1) return; const d = dirAE(210 + 110 * q, 20 + 34 * Math.sin(Math.PI * q)), pos = onSky(d); this.v.set(k, pos, deg(.18), vis * .9 * sunlitAt(d, 300)); if (k % 3 === 0) this.m.set(k, pos, deg(.4), I * .5); if (!this.p) this.p = pos; }); },
  where() { return this.p; } }, o);

// Microquasar SS 433 inside the W50 nebula (M11/T5; was the "black-hole X-ray binary"). Its jets — 0.26 c, precessing on
// a 20° cone every 162.4 days around an axis 79° from the line of sight (Margon 1984, ARA&A 22, 507) — are far too small
// to see: one precession turn of the corkscrew is ~1.3″ at 5.5 kpc (Blundell & Bowler 2004, ApJ 616, L159), and the
// kinematic corkscrew mapped with the VLA spans arcseconds (Hjellming & Johnston 1981, ApJ 246, L141). What is large is
// what they inflate: the W50 radio nebula, ~2° × 1° — a round shell ~1° across with two "ears" along the jet axis, the
// eastern one longer (VLA 1.4 GHz: Dubner et al. 1998, AJ 116, 1842; LOFAR 140 MHz: Broderick et al. 2018, MNRAS 475,
// 5360); X-ray lobes on the same axis ~0.25–0.9° from the star (ROSAT / ASCA: Safi-Harb & Ögelman 1997, ApJ 483, 868);
// faint Hα filaments near the ears (Zealey, Dopita & Malin 1980, MNRAS 192, 731).
// The corkscrew is drawn with the Hjellming & Johnston kinematic model (ballistic ejecta along the precessing jet;
// light-travel delays left out) but magnified ~1500× (one real turn ≈ 1.3″ at 5.5 kpc, drawn 0.55°) so it reaches the ears, the scale at which the radio eye (~1° beam
// at 150 MHz through its 100 m aperture) can show it at all, and with the precession compressed from 162 days to
// MQ_PREC script-seconds: stylised and time-compressed. The star itself: the X-ray core flickers (thermal X-rays from
// the hot base of the jets, Fe XXV / XXVI lines: Kotani et al. 1996, PASJ 48, 619); the A-type companion is a V ≈ 14 point.
const MQ_PREC = 10, MQ_CONE = 20 * DEG, MQ_INC = 79 * DEG, MQ_PA = 25 * DEG;   // precession (script s), cone, axis–line-of-sight, axis tilt on the sky
const MQ_TURN = .55, MQ_AGE = 1.7;                                    // drawn length of one precession turn (deg), ejecta age shown (turns)
const w50R = a => .5 + (Math.cos(a) > 0 ? .55 : .4) * Math.exp(-((Math.sin(a) / .3) ** 2));   // shell radius (deg) at angle a from the jet axis
export const microquasar = o => event({ name: 'Microquasar SS 433 & W50', t0: 30, t1: 60, bands: ['xray', 'radio', 'vis'], freq: ['jetBaseXray', 'w50Xray', 'jetSynchrotron', 'w50Radio', 'companionStar', 'w50Halpha'], tags: ['stylised', 'time-compressed'],
  note: 'A star feeding a black hole or neutron star that fires two jets at a quarter of the speed of light, wobbling around every 162 days. The jets are far too small to see from here; what is big is the bubble they blew, the W50 nebula, 2° × 1° with two "ears" where the jets push out, X-ray lobes along the jets and faint red filaments. The corkscrew of the jets is magnified and its wobble sped up. X-rays only reach detectors in orbit.',
  init() { this.d = dirAE(312, 48); this.v = new Em('vis', '#cfe0ff'); this.x = new Em('xray', null, 0, 'space'); this.core = new Em('radio');
    this.fill = new Em('radio'); this.shell = new Rib('radio', null, 73); this.jet = [new Rib('radio', null, 33), new Rib('radio', null, 33)];
    this.lobe = [new Rib('xray', null, 6, 0, 'space'), new Rib('xray', null, 6, 0, 'space')]; this.fil = [new Rib('vis', '#ff7a6a', 13), new Rib('vis', '#ff7a6a', 13)];
    this.uv = basis(this.d); },
  update() { const { t, T } = S, I = env(t, this.t0, this.t1, 3); if (I <= 0) return;
    const [u, v] = this.uv, ca = Math.cos(MQ_PA), sa = Math.sin(MQ_PA);
    const P = (x, y) => tpt(this.d, u, v, x * ca - y * sa, x * sa + y * ca), A = (r, a) => P(r * Math.cos(a), r * Math.sin(a));   // x along the jet axis (east +), y across
    const p = onSky(this.d), fl = .45 + .55 * Math.abs(Math.sin(T * 13) * Math.sin(T * 7.1));
    this.v.set(p, deg(.15), I * .05);   // V ≈ 14: below the naked eye, like the pulsar's counterpart this.x.set(p, deg(.6), I * .45 * fl); this.core.set(p, deg(.5), I * .4);
    this.fill.set(p, deg(3.5), I * .1);                                                                          // W50: the shell ~1° across …
    this.shell.set(Array.from({ length: 73 }, (_, i) => { const a = i / 72 * 6.283; return A(w50R(a), a); }), deg(.2), deg(.2), I * .6);   // … and its ears
    for (let s = 0; s < 2; s++) { const sg = s ? -1 : 1, pts = [];                                                // the kinematic corkscrew, far end first
      for (let k = 32; k >= 0; k--) { const age = k / 32 * MQ_AGE, ps = 6.283 * (t / MQ_PREC - age);           // ejected `age` turns ago, at that precession phase
        const nx = Math.cos(MQ_CONE) * Math.sin(MQ_INC) + Math.sin(MQ_CONE) * Math.cos(ps) * Math.cos(MQ_INC), ny = Math.sin(MQ_CONE) * Math.sin(ps);
        pts.push(P(sg * nx * age * MQ_TURN, sg * ny * age * MQ_TURN)); }
      this.jet[s].set(pts, deg(.1), deg(.1), I * .5, 1);                                                          // brightest at the core, fading outward
      this.lobe[s].set(linePts(P(sg * .25, 0), P(sg * (s ? .72 : 1.0), sg * .03), 6), deg(.22), deg(.32), I * .1);   // X-ray lobes
      const a0 = s ? Math.PI : 0;
      this.fil[s].set(Array.from({ length: 13 }, (_, i) => { const a = a0 + (i / 12 - .5) * .9; return A(w50R(a) * .96, a); }), deg(.08), deg(.08), I * .12); }   // Hα at the ears
  },
  where() { return onSky(this.d); } }, o);

// Aurora as a substorm on the script axis (defaults t0 26 → t1 50):
//   growth   t0 … t0+7    a faint, homogeneous green arc low over the NW horizon fades in over ~6 s, almost no rays;
//   breakup  t0+7 … t0+12 it brightens, rays and folds appear and speed up, the curtain climbs, red tops (630 nm);
//   recovery t0+12 … t1   diffuse patches pulsating with 2–20 s periods, slowly fading to a faint glow.
// Gated by darkness (night()). The curtain is a ribbon mesh whose vertices are rebuilt on the CPU every frame
// from one displacement function (`at(u, v)`), so the side ribbons (near-IR, radar, UV, X-ray) follow its folds.
// Overrides: az0 / az1 (arc extent, deg), elBot (lower border, deg), dist (m); phases scale with t0 / t1.
const AUR_FS = `float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  uniform float uTime, uI, uRay, uRed, uPulse, uPhase, uBlue; varying vec2 vUv;
  void main(){ float u = vUv.x, v = vUv.y;
    float ends = smoothstep(0., .2, u)*smoothstep(1., .8, u);                              // soft arc ends
    float along = .45 + .55*n2(vec2(u*5.5 + uPhase*.08, 1.7));                             // brightness varies along the arc
    float rays = mix(1., .2 + 1.2*n2(vec2(u*140. + uPhase*.6, uTime*.35)), uRay);          // vertical rays (breakup)
    float fold = mix(1., .55 + .45*sin(u*26. + uPhase*1.2 + 2.*sin(u*8. - uPhase*.5)), uRay*.7);
    float prof = smoothstep(0., .08, v)*exp(-v*mix(3.4, 1.7, uRay))*(1. - smoothstep(.6, 1., v));   // sharp lower border, soft top
    vec2 cq = vec2(u*11., v*2.6), cell = floor(cq);                                        // pulsating patches (recovery)
    float per = 2. + 18.*h21(cell + 3.1), pul = .5 + .5*sin(6.2832*(uTime/per + h21(cell + 9.7)));
    float blob = smoothstep(.35, .8, n2(cq*1.3 + 4.));
    float patches = mix(1., (.15 + 1.3*blob)*(.25 + .75*pul), uPulse);
    vec3 c = vec3(.16, 1., .42);                                                           // 557.7 nm
    c = mix(c, vec3(.95, .1, .28), smoothstep(.35, .95, v)*uRed);                          // 630 nm tops
    c += vec3(.45, .25, 1.)*exp(-v*22.)*uBlue;                                             // 427.8 nm N2+ lower border
    gl_FragColor = vec4(c*prof*ends*along*rays*fold*patches*uI*.75, 1.); }`;
const ramp = (t, a, b) => t <= a ? 0 : t >= b ? t - (a + b) / 2 : (b - a) * (s => s * s * s - s * s * s * s / 2)((t - a) / (b - a));   // ∫ sm(a, b, t) dt

export const aurora = o => event({ name: 'Aurora', t0: 26, t1: 50, az0: 295, az1: FOV_SKY.az1, elBot: 3, dist: 7600,
  bands: ['vis', 'ir', 'radio', 'uv', 'xray'], freq: ['o5577', 'o6300', 'n2p4278', 'o7774', 'n2FirstPos', 'auroralRadar', 'auroralUV', 'auroralXray'], tags: ['rare', 'time-compressed'],
  note: 'A substorm low over the northern horizon: a faint green arc (557.7 nm) brightens, breaks up into rays and folds with red tops (630 nm), then fades into pulsating patches. Near-IR oxygen/N₂ glow and VHF radar echoes reach the ground; its far-UV and X-rays do not.',
  init() {
    const N = this.N = 120, g = new THREE.BufferGeometry(), uv = [], idx = [];
    for (let i = 0; i <= N; i++) { uv.push(i / N, 0, i / N, 1); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 6), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uTime: S.TIME, uI: { value: 0 }, uRay: { value: 0 }, uRed: { value: 0 }, uPulse: { value: 0 }, uPhase: { value: 0 }, uBlue: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`, fragmentShader: AUR_FS,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false; S.scene.add(this.mesh);
    this.ir = new Rib('ir', null, 40, 1); this.ra = new Rib('radio', null, 40); this.uv = new Rib('uv', null, 40, 0, 'high'); this.xr = new Rib('xray', null, 40, 0, 'high');
    this.st = this.phase(0);
  },
  // substorm state at script time t
  phase(t) {
    const a = this.t0, out = 1 - sm(this.t1 - 4, this.t1, t);
    const gr = sm(a, a + 6, t), bk = sm(a + 7, a + 9.5, t) * (1 - sm(a + 11, a + 14, t)), rc = sm(a + 11, a + 14, t);
    const I = night() * out * Math.max(.32 * gr, bk, rc * lerp(.45, .16, sm(a + 14, this.t1 - 3, t)));
    return { I, gr, bk, rc, amp: 35 * gr + 420 * bk + 170 * rc, top: 7 + 12 * bk + 5 * rc,
      ray: .06 + .9 * bk + .25 * rc, red: .12 * gr + .95 * bk + .3 * rc, pulse: rc * (1 - bk),
      phi: S.T * .1 + .3 * t + 2.4 * (ramp(t, a + 7, a + 9.5) - ramp(t, a + 11, a + 14)) };      // folds speed up during breakup
  },
  // curtain point (camera-relative) at u ∈ [0,1] along the arc, v ∈ [0,1] bottom → top
  at(u, v, out = new V3()) {
    const st = this.st, ph = st.phi;
    const d = st.amp * (.6 * Math.sin(u * 9 + ph) + .3 * Math.sin(u * 23 - ph * 1.7 + 1.3) + .1 * st.bk * Math.sin(u * 51 + ph * 2.3));
    const r = this.dist + d, az = (this.az0 + (this.az1 - this.az0) * u) * DEG;
    const top = st.top * (.82 + .18 * Math.sin(u * 5.3 + ph * .3)), el = lerp(this.elBot, top, v) * DEG;
    return out.set(Math.cos(az) * r, Math.tan(el) * r, Math.sin(az) * r);
  },
  update() {
    const st = this.st = this.phase(S.t), I = st.I; this.p = null;
    this.mesh.visible = S.on.vis && I > .005; if (I <= .005) return; S.act.vis += I * .5;
    const c = S.camera.position, N = this.N, pos = this.mesh.geometry.attributes.position, q = new V3();
    for (let i = 0; i <= N; i++) { this.at(i / N, 0, q); pos.setXYZ(i * 2, q.x, q.y, q.z); this.at(i / N, 1, q); pos.setXYZ(i * 2 + 1, q.x, q.y, q.z); }
    pos.needsUpdate = true; this.mesh.position.copy(c);
    const U = this.mat.uniforms; U.uI.value = I; U.uRay.value = st.ray; U.uRed.value = st.red; U.uPulse.value = st.pulse; U.uPhase.value = st.phi; U.uBlue.value = .5 * st.bk;
    const line = (v, n = 40) => Array.from({ length: n }, (_, k) => this.at(.12 + .76 * k / (n - 1), v).add(c));
    const ir = sm(this.t0 + 1, this.t0 + 6, S.t);                                           // side bands stagger in with the phases
    this.ir.set(line(.22), 320, 320, I * ir * .55);                                         // O 777.4 nm + N2 first positive (near-IR)
    this.ra.set(line(.02), 200, 200, I * (st.bk * .9 + st.rc * .3));                        // VHF radar echoes off the E-region
    this.uv.set(line(.3), 380, 380, I * st.bk * .5);                                        // N2 LBH far-UV (Orbit only)
    this.xr.set(line(0), 160, 160, I * st.bk * .35);                                        // bremsstrahlung X-rays (Orbit only)
    this.p = this.at(.55, .35).add(c);
  },
  where() { return this.p; } }, o);

// The Moon (M9/T1; factory kept as `moonrise` so the scenario lists don't change): the waxing Moon of atmosphere.js
// (moonDir, MOON_K, moonFlux), up in the south-west from the start and setting at the end. The phase is a terminator
// mask on the sprite (lit fraction MOON_K, earthshine on the dark side) rotated each frame so the lit limb faces the
// drawn Sun; pale against the twilight, reddened by extinction low down, faded over the last 1.5° as it sets.
// Lunar thermal IR comes from the sunlit part (~390 K at the subsolar point); the cosmic-ray gamma glow from the whole disc.
const moonPhaseTex = (() => { let tx; return () => tx || (tx = canvasTex(256, (g, s) => {
  const r = s / 2 - 2, c = s / 2, ce = Math.cos(MOON_ELONG * DEG); g.drawImage(moonTex().image, 0, 0, s, s);
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.93)'; g.filter = 'blur(1.5px)'; g.beginPath();   // dark side keeps ~7 % (earthshine)
  for (let k = 0; k <= 48; k++) { const y = -r + 2 * r * k / 48; g.lineTo(c + ce * Math.sqrt(Math.max(0, r * r - y * y)), c + y); }   // terminator, top → bottom
  g.arc(c, c, r + 2, Math.PI / 2, Math.PI * 1.5); g.fill(); })); })();   // lit limb at +x: unlit = left of x = cos(E)·√(r² − y²)
export const moonrise = o => event({ name: 'Waxing Moon', t0: 0, t1: 60, bands: ['vis', 'ir', 'gamma'], freq: ['sunlight', 'lunarThermal', 'lunarGamma', 'moonNIR', 'nirReflect', 'ohAirglow'], tags: ['common'], note: 'A waxing Moon about 6½ days old, 41 % lit, already up in the south-west at sunset and sinking west until it sets. Reflected sunlight, lit limb toward the Sun, and a warm sunlit surface (IR); cosmic rays make the whole disc glow in gamma rays, seen only from orbit. In near-IR night vision it is the main light: moonlit leaves and grass glow (the red edge), with the OH airglow of the night sky as a fainter fill — that airglow sky is drawn dark (stylised).',
  init() { this.s = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonPhaseTex(), depthWrite: false, fog: false })); this.s.renderOrder = 3; S.scene.add(visOnly(this.s)); this.h = new Em('vis', '#cfd6ff'); this.ir = new Em('ir'); this.ir.proc = 'lunarThermal'; this.g = new Em('gamma', null, 0, 'space'); },
  update() { const { t } = S, d = moonDir(), el = Math.asin(clamp(d.y, -1, 1)) / DEG, I = sm(0, 1.5, el); this.s.visible = S.on.vis && I > 0;
    if (I <= 0) { this.p = null; return; } this.p = onSky(d);
    const [u, v] = basis(d), sd = dirAE(SUN_AZ, sunEl()), sp = sd.addScaledVector(d, -sd.dot(d));                      // Sun's direction on the sky at the Moon
    const mat = this.s.material, b = lerp(1.05, 1.6, sm(4, 20, t)), warm = 1 - sm(3, 12, el);                          // pale in twilight; extinction reddens it low down
    mat.rotation = Math.atan2(sp.dot(v), sp.dot(u)); mat.opacity = I * lerp(.8, 1, sm(4, 20, t));
    this.s.position.copy(this.p); this.s.scale.setScalar(deg(1.1)); mat.color.setRGB(b * (1 + .25 * warm), b * (1 - .08 * warm), b * (1 - .35 * warm));
    // lunar IR (10 µm) ∝ the sunlit fraction: the ~100 K night side emits ~1e-4 of the sunlit part
    const f = moonFlux(); S.act.vis += I * f; this.h.set(this.p, deg(7), I * f * .45); this.ir.set(this.p, deg(.9), I * .5 * MOON_K); this.g.set(this.p, deg(1.2), I * .3); },
  where() { return this.p; } }, o);

// Growing structure: node table { n: parent, az, el, j, a, b, lv, w }; a node lerps from its parent's
// current point toward its target by f = clamp((g - a) / (b - a)), so an unstarted branch sits on its parent.
// The branching secondaries are drawn in gamma (absorbed high up: origin 'high'); from the ground you get the
// near-UV Cherenkov flash, N2 fluorescence along the main axis (`chain`, root → deepest node) and a radio pulse.
// Placement inside FOV_SKY: the shower enters at SHOWER_EL (zenith angle ≥ 30°: inclined showers are common) and the
// node table's azimuth offsets (built for a near-zenith entry) are drawn × SHOWER_AZK so the fan stays in the cone.
const SHOWER_EL = FOV_SKY.elMax - 2, SHOWER_AZK = .35;
export const airShowers = o => event({ name: 'Cosmic-ray air showers', t0: 26, t1: 60, bands: ['gamma', 'uv', 'vis', 'radio'], freq: ['cherenkov', 'showerFluor', 'showerGamma', 'showerRadio'], tags: ['time-compressed'], note: 'A cosmic ray hits the upper air and its particle cascade fans out as it descends. From the ground: a near-UV Cherenkov flash, N₂ fluorescence and a 30–80 MHz radio pulse; the gamma secondaries are absorbed. Real showers last microseconds.',
  init() { this.s = Array.from({ length: 14 }, () => {
    const az = fovAz(1 / 6 + R() * 2 / 3), nd = [{ n: -1, az: 0, el: SHOWER_EL, j: 0, a: 0, b: 0, lv: 0, w: .55 }], lv1 = 3 + (R() < .55 ? 1 : 0);
    for (let i = 0; i < lv1; i++) nd.push({ n: 0, az: (i - (lv1 - 1) / 2) * (12 + R() * 9) + (R() - .5) * 6, el: SHOWER_EL - (13 + R() * 9), j: (R() - .5) * 6, a: .05, b: .35, lv: 1, w: .9 });   // wide fan under the entry
    for (let i = 1; i <= lv1; i++) for (let q = 0, c = 2 + (R() < .35 ? 1 : 0); q < c; q++) { const par = nd[i];   // each main branch forks again
      nd.push({ n: i, az: par.az + (q - .5) * (15 + R() * 11), el: par.el - (13 + R() * 12), j: (R() - .5) * 8, a: .3, b: .68, lv: 2, w: .55 }); }
    for (let i = 1 + lv1; i < nd.length; i++) if (nd[i].lv === 2 && R() < .6) { const par = nd[i];   // twigs off the second level only: depth stops at 3
      nd.push({ n: i, az: par.az + (R() - .5) * 18, el: Math.max(10, par.el - (10 + R() * 11)), j: (R() - .5) * 7, a: .62, b: .98, lv: 3, w: .32 }); }
    const tips = nd.map((x, i) => i).filter(i => i > 0 && nd[i].lv >= 2).sort((a, b) => nd[a].el - nd[b].el), deep = tips[0], chain = [];
    for (let i = deep; i >= 0; i = nd[i].n) chain.push(i);
    chain.reverse();                                                                                 // root → deepest: the shower axis
    return { t0: 20 + R() * 38, az, nd, tips, chain, r: Array.from({ length: nd.length }, () => new Rib('gamma', null, 3, 0, 'high')),
      fl: new Rib('uv', null, 8), g: Array.from({ length: 5 }, () => new Em('gamma', null, 0, 'high')), u: new Em('uv'), v: new Em('vis', '#9ab8ff'), ra: new Em('radio') }; }); },
  update() { const { t, T } = S; this.s.forEach(s => { const age = t - s.t0; if (age < 0 || age > 3.4) return; const I = sm(0, .35, age) * (1 - sm(2.1, 3.4, age)), g = Math.min(1, age / 2.4);
    const cur = []; let low = null, lowEl = 9e9;
    s.nd.forEach((n, i) => {
      if (i === 0) { cur.push(onSky(dirAE(s.az, SHOWER_EL))); return; }
      const f = clamp((g - n.a) / Math.max(1e-3, n.b - n.a)), par = cur[n.n];
      if (f <= 0) { cur.push(par); return; }
      const tgt = onSky(dirAE(s.az + n.az * SHOWER_AZK, n.el)), P = par.clone().lerp(tgt, f), mid = par.clone().lerp(P, .5).lerp(onSky(dirAE(s.az + (n.az + n.j) * SHOWER_AZK, n.el)), .16);
      cur.push(P); if (n.el < lowEl) { lowEl = n.el; low = P; }
      const fl = .72 + .28 * Math.abs(Math.sin(T * 9 + i * 2.3));
      s.r[i].set([par, mid, P], deg(n.w), deg(n.w * .5), I * (.8 - n.lv * .11) * fl, 1);
    });
    const axis = s.chain.map(i => cur[i]);                                                           // N2 fluorescence (391 nm) along the axis
    if (axis.length > 1) s.fl.set(axis, deg(.18), deg(.32), I * .45, 1);
    if (!low) return;
    s.g.forEach((ge, q) => { const i = s.tips[q]; if (cur[i]) ge.set(cur[i], deg(1.4 - q * .15), I * .45); });
    s.u.set(low, deg(6.5), I * 1.3); s.v.set(low, deg(3.6), I * .25);
    s.ra.set(low, deg(4.5), env(age, 1.1, 1.9, .2) * (.8 + .2 * Math.sin(T * 23)));                 // geosynchrotron pulse near shower maximum
  }); },
  where: () => null }, o);

// opts.az / opts.dist place the storm cell (default: low in the south-west, just inside FOV_SKY, 4.5 km away)
export const thunderstorm = o => event({ name: 'Distant thunderstorm', t0: 30, t1: 50, bands: ['vis', 'radio', 'xray', 'gamma'], freq: ['lightning', 'sferics', 'leaderXray', 'tgf'], note: 'Lightning, VLF radio "sferics", X-rays from the stepped leaders and terrestrial gamma-ray flashes, all detectable from the ground.', az: FOV_SKY.az0 + 16, dist: 4500,
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

export const fastRadioBurst = o => event({ name: 'Fast radio burst', t0: 38, t1: 45, bands: ['radio'], freq: ['frb'], tags: ['rare'], note: 'A millisecond radio flash from a galaxy billions of light-years away. Plasma along the way disperses it: lower frequencies arrive later, so the point lingers as the burst sweeps down the band (the old view draws the sweep as widening rings).',
  init() { this.d = dirAE(290, 34); this.e = new Em('radio'); this.r1 = new Rib('radio', null, 49); this.r2 = new Rib('radio', null, 49); },
  update() { const { t } = S; if (t < this.t0 || t > this.t0 + 6.2) return; const age = t - this.t0, I = 1 - age / 6.2;
    this.e.set(onSky(this.d), deg(3.2), I * 1.2); const sw = 1 - Math.exp(-age * .9);   // the dispersion sweep, eased so the rings stay inside the FOV cone (≤ ~25°)
    // the rings are the old view's symbol for the dispersion sweep; a dispersed burst is still one point (see = 0: the eye skips them)
    this.r1.set(ringPts(this.d, 2.5 + 22.5 * sw), deg(.5), deg(.5), I, 0, 0); this.r2.set(ringPts(this.d, 1.2 + 15 * sw), deg(.35), deg(.35), I * .7, 0, 0); },
  where() { return onSky(this.d); } }, o);

export const supernova = o => event({ name: 'Supernova', t0: 43, t1: 60, bands: ['uv', 'vis', 'xray', 'gamma', 'ir', 'radio'], freq: ['snUV', 'snOptical', 'snXray', 'snGamma', 'snDust', 'snRadio'], tags: ['rare', 'time-compressed'], note: 'Shock-breakout UV flash, gamma decay lines and X-rays from the shock hitting the gas the star shed before it died (all seen only from orbit), then the visible peak, new dust (IR) and radio last. Weeks to years squeezed into seconds; a supernova stays a point of light — its remnant takes centuries to grow to a visible size.',
  init() { this.d = dirAE(240, 30); this.v = new Em('vis', '#fff6dc'); this.u = new Em('uv', null, 0, 'space'); this.g = new Em('gamma', null, 0, 'space'); this.x = new Em('xray', null, 0, 'space'); this.i = new Em('ir'); this.r = new Em('radio'); },
  update() { const { t } = S; if (t < 43) return; const p = onSky(this.d), L = sm(43, 45, t) * (1 - .7 * sm(48, 60, t));
    this.v.set(p, deg(.4 + L * .9), L * 1.6); this.u.set(p, deg(2.6), sm(43, 43.6, t) * (1 - sm(44, 48, t))); this.g.set(p, deg(1.4), .5 * env(t, 43.5, 47, .5));
    if (t > 44) this.x.set(p, deg(.8), .9 * sm(44, 46, t) * (1 - sm(55, 60, t)));   // unresolved: the shock is light-days across, not degrees
    this.i.set(p, deg(2), sm(48, 54, t)); this.r.set(p, deg(1.8), sm(51, 57, t)); },
  where() { return onSky(this.d); } }, o);

export const gammaRayBurst = o => event({ name: 'Gamma-ray burst', t0: 48, t1: 60, bands: ['gamma', 'xray', 'vis', 'radio'], freq: ['grbGamma', 'afterglowXray', 'afterglowOptical', 'afterglowRadio'], tags: ['rare', 'time-compressed'], note: 'A brief gamma flash (only satellites see it), followed by an afterglow at longer wavelengths; rarely the optical afterglow is bright enough for the naked eye. The afterglow fades over days (radio over weeks), squeezed into seconds; it stays a point — the jet that makes it is far too distant to resolve.',
  init() { this.d = dirAE(322, 30); this.g = new Em('gamma', null, 0, 'space'); this.x = new Em('xray', null, 0, 'space'); this.v = new Em('vis', '#cfe0ff'); this.r = new Em('radio'); this.flash = document.getElementById('flash'); },
  // the full-screen hue-cycling flash is the old view's; the eye shows the burst as the point source it is
  update() { const { t, T, on } = S, fl = !S.eye && on.gamma && S.detector === 'orbit' && t > 48 && t < 48.6 ? .45 * (1 - (t - 48) / .6) : 0;
    this.flash.style.opacity = fl; if (fl) this.flash.style.background = `hsl(${(T * 400) % 360},100%,55%)`;
    if (t < 48) return; const p = onSky(this.d);
    this.g.set(p, deg(4.5), env(t, 48, 50.5, .3)); this.x.set(p, deg(1.4), sm(48.5, 49.5, t) * (1 - sm(50, 58.5, t)));
    this.v.set(p, deg(.5), sm(49, 50, t) * (1 - sm(51, 58.5, t))); this.r.set(p, deg(1.4), sm(53, 55, t) * (1 - sm(58, 60, t))); },
  where() { return onSky(this.d); } }, o);

// Parhelia sit ~22° from the Sun at the same elevation, a little farther as the Sun climbs
// (22.0° at the horizon, ~23.6° at 20°); the azimuth offset widens by the spherical geometry.
export const sunDogs = o => event({ name: 'Sun dog pair', t0: 0, t1: 14, bands: ['vis', 'uv'], freq: ['iceHalo', 'haloUV'], tags: ['common'], note: 'Two bright companions ~22° either side of the low Sun, refracted by plate-shaped ice crystals; red on the inner edge.',
  init() { this.e = Array.from({ length: 2 }, () => ({ v: new Em('vis', '#d8d2ca'), r: new Em('vis', '#ff7a50'), u: new Em('uv') })); },
  daz(el, d) { const e = Math.max(0, el) * DEG, c = Math.cos(e); return Math.acos(clamp((Math.cos(d * DEG) - Math.sin(e) ** 2) / (c * c), -1, 1)) / DEG; },
  update() { const el = sunEl(); if (el < -2) return; const I = sm(-3, 1, el) * (1 - sm(11, 14, S.t)), d = 22 + .004 * Math.max(0, el) ** 2;
    const da = this.daz(el, d), di = this.daz(el, d - .8);
    for (let k = 0; k < 2; k++) { const sg = k ? 1 : -1, p = skyP(SUN_AZ + sg * da, el);
      this.e[k].v.set(p, deg(1.1), I * .5); this.e[k].r.set(skyP(SUN_AZ + sg * di, el), deg(.6), I * .3); this.e[k].u.set(skyP(SUN_AZ + sg * this.daz(el, d + .5), el), deg(1.7), I * .45); } },
  where() { return skyP(SUN_AZ - this.daz(sunEl(), 22), sunEl()); } }, o);

// Crepuscular rays: shadows of clouds beyond the horizon stripe the twilight glow, so beams of
// sunlit haze fan up from the (setting, then hidden) Sun. Replaces the invented "zodiacal scatter".
export const crepuscularRays = o => event({ name: 'Crepuscular rays', t0: 2, t1: 12, bands: ['vis'], freq: ['crepuscular'], tags: ['common'], note: 'Beams of sunlit haze fan up from the setting Sun between the shadows of clouds beyond the horizon.',
  init() { this.s = Array.from({ length: 6 }, () => ({ a: R(), e: R(), tw: R() * 6.3, v: new Rib('vis', '#ffb08a', 10) })); },
  update() { const { t, T } = S, I = env(t, this.t0, this.t1, 2.5); if (I <= 0) return; const el = sunEl(), [lit] = kf(CONTRAIL, t);
    this.s.forEach((s, k) => { const ang = ((k - 2.5) / 2.5 * 34 + (s.a - .5) * 12) * DEG, len = 24 + s.e * 18, pts = [];
      for (let i = 9; i >= 0; i--) { const f = 1.5 + i / 9 * len, e = Math.max(el, 0) + .6 + Math.cos(ang) * f; pts.push(skyP(SUN_AZ + Math.sin(ang) * f / Math.cos(e * DEG), e)); }   // tip → Sun
      s.v.m.material.uniforms.uColor.value.setRGB(...lit);
      s.v.set(pts, deg(6 + s.e * 4), deg(.8), I * (.1 + .05 * Math.sin(T * .4 + s.tw)), .85); }); },
  where() { return skyP(SUN_AZ, Math.max(sunEl(), 0) + 14); } }, o);
// Kept for scenario lists written before the audit: the invented "zodiacal scatter" is now crepuscular rays.
export const zodiacalScatter = o => crepuscularRays(o);

// Purple light: ~10–20 min after sunset (Sun 3–6° below the horizon) a pink-purple glow sits ~20° above
// the sunset point and sinks with it — red sunlight scattered by stratospheric aerosol over the blue sky.
export const purpleLight = o => event({ name: 'Purple light', t0: 8, t1: 16, bands: ['vis'], freq: ['purpleLight'], tags: ['common'], note: 'A pink-purple glow above the sunset point once the Sun is a few degrees down: red sunlight scattered by stratospheric dust over the blue sky.',
  init() { this.s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false })); this.s.renderOrder = -5; S.scene.add(visOnly(this.s)); },
  update() { const { t } = S, I = env(t, this.t0, this.t1, 3); this.s.visible = S.on.vis && I > 0; if (I <= 0) return;
    this.p = skyP(SUN_AZ - 3, 21 - (t - this.t0) * 1.1); this.s.position.copy(this.p); this.s.scale.set(deg(50), deg(30), 1);
    this.s.material.color.setRGB(.5 * I, .16 * I, .62 * I); S.act.vis += I * .3; },
  where() { return this.p; } }, o);

// Zodiacal light: a faint cone of sunlight scattered by interplanetary dust, rising steeply along the
// ecliptic from the western horizon once twilight is over. Needs a dark site (scaled by ENV.starDim)
// and a moonless sky (washed out as the Moon's light takes over the dark sky). Overrides: az (base azimuth), tilt (deg from horizontal).
export const zodiacalLight = o => event({ name: 'Zodiacal light', t0: 26, t1: 45, bands: ['vis'], freq: ['zodiacal'], az: 282, tilt: 62, note: 'A faint cone of sunlight scattered by interplanetary dust, leaning along the ecliptic above where the Sun set. Only from dark sites; the waxing Moon\'s light washes much of it out.',
  init() {
    const n = 16, pos = new Float32Array((n + 1) * 6), uv = [], idx = [], L = 55, W0 = 13, W1 = 2.5, sa = Math.sin(this.tilt * DEG), ca = Math.cos(this.tilt * DEG);
    for (let i = 0; i <= n; i++) { const v = i / n, az = this.az - v * L * ca, el = -4 + v * L * sa, hw = lerp(W0, W1, v);
      for (let s = 0; s < 2; s++) { const sg = s ? 1 : -1, e = el + sg * hw * ca; dirAE(az + sg * hw * sa / Math.cos(Math.max(-80, Math.min(80, e)) * DEG), e).multiplyScalar(D * .97).toArray(pos, (i * 2 + s) * 3); uv.push(sg, v); }
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uI: { value: 0 } }, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uI; varying vec2 vUv; void main(){ float x = abs(vUv.x), v = vUv.y;
        float a = pow(max(1. - x, 0.), 1.8)*pow(max(1. - v, 0.), 1.4)*smoothstep(0., .12, v);   /* max(): pow(<0) is NaN on GPUs; bloom spreads one NaN pixel into a black block */ gl_FragColor = vec4(vec3(1., .93, .8)*a*uI, 1.); }` });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = -4; this.mesh.visible = false; S.scene.add(this.mesh);
    this.top = dirAE(this.az - .35 * L * ca, -4 + .35 * L * sa);
  },
  update() { const I = env(S.t, this.t0, this.t1, 4) * night() * (ENV.starDim ?? 1) * Math.max(0, 1 - 1.5 * moonlit()); this.mesh.visible = S.on.vis && I > .005; if (I <= .005) return;
    this.mesh.position.copy(S.camera.position); this.mat.uniforms.uI.value = I * .11; S.act.vis += I * .15; },
  where() { return onSky(this.top); } }, o);

// Noctilucent clouds (M8/T3, was t 42–60 — Sun 19–29° down, when they are physically dark): ice at ~82 km, seen only
// in nautical twilight with the Sun ~6–16° below the horizon (Gadsden & Schröder, "Noctilucent Clouds", Springer 1989;
// sky dark enough from δ ≈ 6°, t ≈ 18), low over the sunward (north-western) horizon. Each band is lit while its 82 km
// point is outside Earth's shadow (sunlitAt): the upper bands go dark first and the display sinks to the horizon,
// gone by δ ≈ 13° (t ≈ 31) at 5° elevation. Timing follows sunEl(), the window only bounds it.
export const noctilucentClouds = o => event({ name: 'Noctilucent clouds', t0: 18, t1: 34, bands: ['uv', 'vis'], freq: ['nlcScatter', 'nlcUV'], tags: ['rare'], note: 'Silver-blue ripples at 82 km, low in the north-west, still catching sunlight from below the horizon in deep twilight; the upper bands slip into Earth\'s shadow first.',
  init() { this.r = Array.from({ length: 5 }, () => new Rib('vis', '#dce8f8', 25)); this.u = Array.from({ length: 5 }, () => new Rib('uv', null, 25, 0, 'high')); },
  update() { const { t, T } = S, I0 = env(t, this.t0, this.t1, 2) * sm(5.5, 8, depression()); if (I0 <= 0) return;
    for (let k = 0; k < 5; k++) { const e = 5 + k * 3.4, I = I0 * sunlitAt(dirAE(300, e), 82); if (I <= .01) continue; const pts = [];
      for (let j = 0; j <= 24; j++) { const az = 270 + j * 2.5; pts.push(skyP(az, e + Math.sin(az * .11 + T * .45 + k * 1.3) * 1.4)); }
      const sh = .4 + .6 * Math.abs(Math.sin(T * .7 + k * 1.9)); this.r[k].set(pts, deg(.28), deg(.28), I * sh * .2, 1); this.u[k].set(pts, deg(.6), deg(.6), I * sh * .28, 1); } },
  where: () => skyP(300, 10) }, o);

// 22° halo plus the upper tangent arc touching its top: V-shaped "gull wings" while the Moon is low,
// flattening as it climbs (around 30° and higher they droop toward the circumscribed halo). Its brightness follows the
// Moon's light (moonlit: phase, extinction, setting): around the low, 41 % lit Moon of M9 it is a faint ring that fades
// as the Moon sinks and is gone when it sets.
export const moonHalo = o => event({ name: 'Moon halo', t0: 48, t1: 60, bands: ['vis', 'uv'], freq: ['iceHalo', 'haloUV'], tags: ['common'], note: 'A 22° halo around the Moon from hexagonal ice crystals in thin cirrus, with an upper tangent arc touching its top like gull wings. Around a half Moon it is faint.',
  init() { this.m = new Rib('vis', '#e8e4c8', 33); this.u = new Rib('uv', null, 33); this.arc = [0, 1].map(() => new Rib('vis', '#d6dcec', 12)); },
  update() { const I = sm(48, 52, S.t) * moonlit() * 1.6; if (I <= .01) return; const d = moonDir(), [u, v] = basis(d), el = Math.asin(clamp(d.y, -1, 1)) / DEG;
    this.m.set(ringPts(d, 22, 32), deg(.55), deg(.55), I * .5); this.u.set(ringPts(d, 22.6, 32), deg(.9), deg(.9), I * .35);
    const c = lerp(.035, -.004, clamp(el / 32));                                                     // wing curvature: up while low, flat/drooping when high
    for (let s = 0; s < 2; s++) { const pts = [];
      for (let i = 11; i >= 0; i--) { const x = (s ? 1 : -1) * i / 11 * 15, y = 22 + c * x * x;            // wing tip → tangent point
        pts.push(onSky(d.clone().addScaledVector(u, x * DEG).addScaledVector(v, y * DEG))); }
      this.arc[s].set(pts, deg(.25), deg(.6), I * .32, .7); } },
  where: () => onSky(moonDir()) }, o);

// ===== M8/T3: twilight opening =====
// First planet and stars: each pops out when the twilight sky falls below its brightness. Naked-eye limiting magnitude
// vs the Sun's depression δ, roughly: −2 at δ ≈ 2.5–3°, 0 at δ ≈ 4.5–5°, +1 at δ ≈ 6–7° (Schaefer 1993, "Astronomy and
// the limits of vision", Vistas Astron. 36, 311 — twilight sky brightness vs the eye's threshold); on this timeline
// δ = 0.55 t − 4, so Jupiter at t ≈ 12, Arcturus at t ≈ 16, Spica at t ≈ 18.5, Denebola (mag 2, δ 8°) at t ≈ 22. Positions:
// one summer evening (Sun dec ≈ +17–20°, late July – early August) at ~45°N facing west (the noctilucent-cloud season) — Arcturus high WSW, Spica low SW,
// Denebola west (Regulus and Pollux have set); the planet sits on the ecliptic above the sunset (Jupiter's place changes every year,
// so it stands for "a bright planet there"). They sink with the western sky, ~0.5°/unit like the Sun (el only; the
// star-field shader is fixed). Light pollution: Jupiter and mag-0 stars show in a city, mag-1 stars dimmed by ENV.starDim. Venus is its
// own event; the faint field comes from the night-sky shader. Jupiter's decametric radio storms (Io-modulated,
// 10–40 MHz) are bursty and reach ground antennas above the ionospheric cutoff.
const FIRST_LIGHTS = [   // az, el at t0, magnitude, depression where it pops out (deg), colour
  // one consistent sky: a summer evening (late July – early August) at ~45°N facing west, the Sun ~4–6° down (alt/az from J2000 RA/Dec)
  [258, 15, -2.3, 2.6, '#fff4dc'],   // Jupiter, on the evening ecliptic (el ≈ 15° at az 258)
  [240, 51, -0.05, 4.6, '#ffd2a0'],  // Arcturus (K1.5 III, orange)
  [231, 19, 0.98, 6.2, '#cfe0ff'],   // Spica (B1, blue-white)
  [266, 25, 2.14, 8.0, '#eef2ff'],   // Denebola (A3 V), the Lion's tail — Regulus and Pollux have set by now
];
export const firstStars = o => event({ name: 'Jupiter & first stars', t0: 11, t1: 60, bands: ['vis', 'radio'], freq: ['sunlight', 'starlight', 'jupiterDAM'], tags: ['common'], note: 'As the Sun sinks 3–7° below the horizon the sky drops below one point of light after another: after Venus, Jupiter (mag −2), then Arcturus (mag 0), then Spica (mag 1) and, as twilight deepens, Denebola (mag 2). Jupiter\'s decametric radio storms (10–40 MHz) crackle on and off.',
  init() { this.f = new EmField('vis', FIRST_LIGHTS.length); FIRST_LIGHTS.forEach((s, i) => this.f.color(i, s[4])); this.r = new Em('radio'); this.p = null; },
  dir(i) { const [az, el] = FIRST_LIGHTS[i]; return dirAE(az, el - .5 * Math.cos((az - 270) * DEG) * Math.max(0, S.t - this.t0)); },   // western sky sinks with the Sun (~0.55°/unit)
  update() { const { t, T } = S, I = env(t, this.t0, this.t1, 1), dep = depression(), dim = ENV.starDim ?? 1;
    // each light fades out as it sets (extinction in the last ~1.5°): Jupiter sets at t ≈ 42, Spica near t 60
    const up = i => sm(0, 1.5, Math.asin(this.dir(i).y) / DEG); this.p = null;
    FIRST_LIGHTS.forEach(([, , mag, d0], i) => { const lp = mag < -1 ? 1 : mag < .5 ? .6 + .4 * dim : dim, tw = mag < -1 ? 1 : .85 + .15 * Math.sin(T * (7 + i * 2.3) + i), u = up(i);
      if (u <= 0) return; this.f.set(i, onSky(this.dir(i)), deg(mag < -1 ? .42 : .3 - .05 * mag), I * u * sm(d0, d0 + 1.3, dep) * lp * tw * (1.1 - .3 * mag));
      if (!this.p) this.p = onSky(this.dir(i)); });   // label: Jupiter while it is up, then the next light still above the horizon
    const storm = (T % 11) < 4 ? .5 + .5 * Math.abs(Math.sin(T * 23) * Math.sin(T * 5.3)) : 0;   // Io-driven bursts
    if (up(0) > 0) this.r.set(onSky(this.dir(0)), deg(1.2), I * up(0) * storm * .7); },
  where() { return this.p; } }, o);

// A sporadic bolide (mag ≈ −8, brighter than Venus): one fireball a night somewhere over a site is far from
// guaranteed, hence `rare`. Typical: starts ~100 km up, 2–5 s of flight, a terminal flare as it fragments, a glowing
// wake (persistent train) for seconds, and an overdense radio echo off its ion trail that outlasts the light. Bright
// enough to beat twilight and city glow. Track from `from` to `to` (az, el), inside the FOV cone; flight 2.4 script-s.
export const fireball = o => event({ name: 'Twilight fireball', t0: 14, t1: 18.5, bands: ['vis', 'uv', 'radio'], freq: ['meteorLight', 'meteorUV', 'meteorEcho'], tags: ['rare'], from: [306, 44], to: [258, 13], note: 'A sporadic bolide, brighter than Venus, streaks down the twilight sky and bursts as it fragments; its wake glows for a few seconds and its ion trail echoes radio even longer. Its UV is absorbed high up.',
  init() { this.v = new Rib('vis', '#fff0c8', 16); this.u = new Rib('uv', null, 16, 0, 'high'); this.h = new Em('vis', '#d8ffe0'); this.r = new Rib('radio', null, 16); this.re = new Em('radio'); this.fr = new EmField('vis', 4, '#ffc880'); this.p = null; },
  update() { const { t } = S, ts = this.t0 + .5, dur = 2.4, p = (t - ts) / dur; this.p = null; if (p < 0 || t > this.t1) return;
    const a = dirAE(...this.from), b = dirAE(...this.to), at = f => onSky(a.clone().lerp(b, f)), hd = Math.min(p, 1), after = Math.max(0, t - ts - dur);
    const flare = Math.exp(-(((p - .82) / .07) ** 2)), wake = [], tail = Math.max(0, hd - .5);
    for (let i = 0; i <= 15; i++) wake.push(at(tail + (hd - tail) * i / 15));
    this.p = at(hd);
    if (p <= 1) { const I = .5 + 1.1 * p ** 1.5 + 2.4 * flare; this.h.set(this.p, deg(.45 + .9 * flare), I); this.u.set(wake, deg(.3), deg(.45), I * .5, 1);
      this.v.set(wake, deg(.12), deg(.32), I * .7, 1); this.re.set(this.p, deg(1.6), I * .6);
      if (p > .82) for (let k = 0; k < 4; k++) this.fr.set(k, onSky(a.clone().lerp(b, .82 + (p - .82) * (1.12 + k * .05)).add(new V3(0, (k - 1.5) * .004 * (p - .82) * 40, 0))), deg(.18), (1 - p) * 5); }
    else this.v.set(wake, deg(.2 + .2 * after), deg(.35 + .2 * after), .5 * (1 - sm(0, 1.4, after)), .3);   // persistent train, drifting wider
    this.r.set(wake, deg(.6), deg(.9), .6 * (1 - sm(.5, 2, after)), .5); },                               // overdense radio echo outlasts the light
  where() { return this.p; } }, o);

// Twilight launch plume ("jellyfish"): an upper stage climbing through 100–300 km from a launch site beyond the
// horizon is in sunlight while the ground lies in twilight; its exhaust expands into a huge glowing bell in near-vacuum.
// Seen when the Sun is ~3–12° down (dark enough sky, plume above Earth's shadow — sunlitAt(·, 150 km)). Reflected
// sunlight only (the exhaust's IR, which orbital sensors do see, is omitted). Needs a launch in that window and direction,
// hence `rare`. Rises from the south-west low horizon; climb 5 script-s, then the bell spreads and fades.
const plumeDir = f => dirAE(230 + 20 * f, 2 + 26 * Math.sin(f * Math.PI / 2));
export const rocketPlume = o => event({ name: 'Rocket-launch twilight plume', t0: 15, t1: 23, bands: ['vis'], freq: ['sunlight'], tags: ['rare'], note: 'A rocket launched from far beyond the horizon climbs out of Earth\'s shadow: its exhaust, 100–300 km up, catches sunlight and swells into a glowing blue-white bell while the ground is already in twilight.',
  init() { this.tr = new Rib('vis', '#e8f0ff', 24); this.h = new Em('vis', '#ffffff'); this.bell = new Em('vis', '#b8d4ff'); this.p = null; },
  update() { const { t } = S, ts = this.t0 + .3, f = clamp((t - ts) / 5), age = Math.max(0, t - ts - 5); this.p = null; if (t < ts || t > this.t1) return;
    const I = env(t, ts, this.t1, 1) * sm(2.5, 4.5, depression()) * sunlitAt(plumeDir(f), 150); if (I <= .01) return;
    const pts = []; for (let i = 0; i <= 23; i++) pts.push(onSky(plumeDir(f * i / 23)));
    this.p = pts[23]; this.tr.set(pts, deg(.25), deg(1.2 + 1.2 * f + .5 * age), I * .5, 1);
    if (f < 1) this.h.set(this.p, deg(.3), I * 1.1);                                                     // engine still burning
    this.bell.set(this.p, deg(2 + 3 * f + 1.6 * age), I * .5 * f * (1 - sm(0, 2.7, age) * .7)); },
  where() { return this.p; } }, o);
