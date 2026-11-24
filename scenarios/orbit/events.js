// Events of the orbit (all local: the library sky events are placed for an observer under the air). The clock is the
// orbit's (world.js): 1 script unit = 1.55 min, 1 s of playback = 0.5 unit = 46 s of orbit. Things on the Earth are
// placed on the planet (Earth-fixed, they stream away with the ground) or on the line of sight grazing the limb
// (limbP); none of them is a sky event, so FOV_SKY's elevation 0…60° does not apply: they are below the view's
// horizontal, where the Earth is. The Sun follows its own track (atmosphere.js site).
import { V3, sm, env, clamp, hash2, R, DEG } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { dirAE, D } from 'spectra/core/geom.js';
import { Em, Rib } from 'spectra/render/sources.js';
import { ENV } from 'spectra/world/atmosphere.js';
import { N, RE, LIMB_A, T_SET, T_RISE, MIN_PER_UNIT, CROSS, EARTH_U, SHELL_U, sunDir, sunState, limbP, facing, sunlit, onEarth, drift } from './world.js';

const BELOW = () => onEarth(dirAE(270, -22));                  // a point on the ground ahead, for labels
const orbitOnly = () => S.detector !== 'ground';                // the Ground detector removes what the air would stop
// how dark the view is: night from shortly after sunset until the dawn reaches the ground ahead (t ≈ 38)
export const dark = (t = S.t) => sm(T_SET - 1, T_SET + 1.5, t) * (1 - sm(T_RISE + 2, T_RISE + 7, t));

// The Earth itself (world.js does the drawing: its surface hook and the edge-on air).
export const earthBelow = () => event({ name: 'The Earth below', t0: 0, t1: 60, bands: ['vis', 'ir', 'micro', 'uv', 'radio'], freq: ['sunlight', 'solarUV', 'thermal290', 'cloudTopIR', 'earthMicrowave', 'earthRadio'], tags: ['common'],
  note: `Seen from 420 km the Earth fills the lower half of the window and the ground streams by toward the horizon at 7.2 km/s. By day: blue ocean, brown land, white cloud, the Sun's glint on the sea, and a thin blue film of air along the curved limb. In thermal infrared the clear ocean and land glow at 10–30 °C while the cloud tops, 10 km up at −45 °C, are the dark parts; at night the land cools. In microwaves it flips: the sea is a poor emitter (half as bright as land at the same temperature), so the continents glow and the oceans are dark. In radio (100 MHz) the land glows at ~170–260 K of its own; the sea emits little (~30 K) but is a mirror that reflects the galactic radio sky, brighter still where it shows the Milky Way. The sunlit side also glows in near-UV, sunlight scattered by the air. Time-compressed: the whole 93-minute orbit passes in the 2 minutes, 46 s of orbit per second of playback.`,
  update() { const day = sm(-.3, .4, sunDir().dot(N.clone().negate()));
    S.act.vis += 3 * day + .2; S.act.ir += 2.2; S.act.micro += 1.2; S.act.uv += 1.5 * day; S.act.radio += .1; },
  where: () => BELOW() });

// The Sun, unfiltered: no air to redden, dim or absorb it until it touches the limb.
export const sun = () => event({ name: 'The Sun without air', t0: 0, t1: 60, bands: ['vis', 'uv', 'xray', 'radio'], freq: ['sunlight', 'solarEUV', 'solarXray', 'solarRadio'], tags: ['common'],
  note: 'A white disc on a black sky, far too bright to look at. With no air in the way the Sun shows in every band: its chromosphere in extreme UV (He II 30.4 nm), its corona in soft X-rays (~1 keV), patchy and larger than the visible disc, and its radio glow. Only as it touches the limb does the air redden and flatten it, for a few seconds. In the 93-minute orbit it sets ahead of you at t ≈ 9 and rises behind you about 36 minutes later; it is in the window at the start and the end. The EUV and X-rays never reach the ground (Ground detector: hidden).',
  init() { this.v = new Em('vis', '#ffffff', 0, 'space'); this.halo = new Em('vis', '#fff4e0', 0, 'space'); this.u = new Em('uv', null, 0, 'space');
    this.x = new Em('xray', null, 0, 'space'); this.r = new Em('radio', null, 0, 'space'); this.p = new V3(); },
  update() { const s = sunState(); if (s.vis <= .001) { this.vis = false; return; } this.vis = true;
    const red = sm(0, 3, s.h); this.p.copy(sunDir()).multiplyScalar(D);
    this.v.m.material.uniforms.uColor.value.setRGB(1, .55 + .45 * red, .3 + .7 * red);
    this.v.set(this.p, 150, s.vis * (1.2 + 1.8 * red)); this.halo.set(this.p, 900, s.vis * .35 * red);
    this.u.set(this.p, 190, s.vis * 1.4); this.x.set(this.p, 220, s.vis * 1.2); this.r.set(this.p, 420, s.vis * .8); },
  where() { return this.vis && this.p.y > -D * .3 ? this.p : null; } });

// The terminator: where day meets night on the ground ahead. Found along the ground straight ahead of you.
function terminatorPoint() {
  for (let k = 0; k <= 40; k++) { const a = LIMB_A * (1 - k / 40), p = onEarth(N.clone().multiplyScalar(Math.cos(a)).add(new V3(0, Math.sin(25 * DEG), -Math.cos(25 * DEG)).multiplyScalar(Math.sin(a))));
    if (p && Math.abs(sunlit(p)) < .05) return p; }
  return null;
}
export const terminator = o => event({ name: 'Terminator pass', t0: 2, t1: 11, bands: ['vis', 'ir'], freq: ['sunlight', 'solarNIR'], tags: ['common', 'time-compressed'],
  note: 'The line between day and night crosses the ground under you and runs away toward the horizon: towns, clouds and sea go from sunlit to orange to dark in a few minutes — the ground track runs at 7.2 km/s, ~15–18 times faster (depending on latitude) than the dusk moves on the ground. When it reaches the limb the Sun sets: the thin layer of air along the horizon turns into bands of red, orange and blue (the troposphere red, the stratosphere blue above it), and fades within a minute or two.',
  update() { this.p = terminatorPoint(); if (this.p) { S.act.vis += .4 * env(S.t, this.t0, this.t1, 1); S.act.ir += .2 * env(S.t, this.t0, this.t1, 1); } },
  where() { return this.p; } }, o);

// Airglow: the night side's own light, seen edge-on as thin layers along the limb.
export const airglow = () => event({ name: 'Airglow layers', t0: T_SET, t1: T_RISE + 7, bands: ['vis', 'ir', 'uv'], freq: ['o5577', 'o6300', 'ohMeinel', 'fuvNightglow'], tags: ['common'],
  note: 'Above the night side the upper air glows by itself, from chemistry powered by the day\'s sunlight. Edge-on at the limb it becomes a thin band floating ~2.5° above the horizon: green oxygen at ~95 km, a faint red oxygen layer at ~250 km, and — brighter than both, in near-infrared — hydroxyl (OH) at ~87 km. Higher still, in the F region, recombining oxygen ions glow at 135.6 nm, far-UV, strongest in two arcs either side of the magnetic equator; that one is absorbed long before the ground. Astronauts photograph the green band on every night pass.',
  init() { this.fuv = [0, 1, 2, 3].map(() => new Rib('uv', null, 20, 0, 'high')); },
  update() { const I = env(S.t, this.t0, this.t1, 2) * dark(); SHELL_U.uAirglow.value = I; this.p = null; if (I <= .01) return;
    S.act.vis += .5 * I; S.act.ir += .8 * I;
    // the two equatorial arcs (~300 km) where the line of sight grazes them; each drawn as two halves tapering to its ends
    [[-1.25, -.15], [.25, 1.15]].forEach(([a, b], k) => { const m = (a + b) / 2;
      [a, b].forEach((e, j) => this.fuv[2 * k + j].set(Array.from({ length: 20 }, (_, i) => limbP(e + (m - e) * i / 19, 30)), 2, 6, I * .5, 1)); });
    this.p = limbP(.05, 9.5); },
  where() { return this.p; } });
export { SHELL_U };

// Night-side cities: the land's lights (drawn by the Earth's surface, uCity), sodium orange and LED white.
export const cities = () => event({ name: 'Night-side cities', t0: T_SET - 2, t1: T_RISE + 7, bands: ['vis'], freq: ['na589', 'ledWhite'], tags: ['common'],
  note: 'Once the ground under you is dark, the inhabited land lights up in strings and clusters: the orange of sodium street lamps, more and more the bluish white of LEDs. The brightest lights shine through thin cloud.',
  update() { const I = env(S.t, this.t0, this.t1, 2); EARTH_U.uCity.value = S.on.vis ? I : 0; S.act.vis += I * dark() * .8; },
  where: () => onEarth(dirAE(262, -12)) });

// Thunderstorms seen from above: cloud tops lit from inside. Each cell streams through the view with the ground
// (drift, world.js: 6.8 units from behind you to the limb), then a new one comes up from behind at another latitude.
const CELLS = 8, V = 1 / CROSS;
export const storms = () => event({ name: 'Thunderstorms from above', t0: 0, t1: 60, bands: ['vis', 'radio'], freq: ['lightning', 'lightningVHF'], tags: ['common', 'time-compressed'],
  note: 'Thunderstorm cells flicker under you like flashbulbs inside cotton wool: the lightning lights the cloud tops from within, best on the night side. About 45 flashes a second (including in-cloud) light up somewhere on Earth; a big storm flashes every few seconds. On this clock (46 s of orbit per second of playback) each cell flickers almost continuously, and each crosses the window in ~10 minutes (14 s of playback). The leaders\' VHF bursts pass straight up through the ionosphere — the FORTE satellite recorded them — while the VLF sferics stay trapped below it.',
  init() { this.cells = Array.from({ length: CELLS }, () => ({ ph: R(), rate: 1.5 + 2 * R(), v: new Em('vis', '#cfdcff'), r: new Em('radio') }));
    this.cells[0].ph = ((.8 - 26.7 * V) % 1 + 1) % 1;   // cell 0 is in the window ahead at t ≈ 26.7: the TGF's storm
    this.p = new V3(); },
  // cell i at time t: its position (generation g gives a new latitude, from a hash so scrubbing repeats)
  pos(i, t = S.t) { const c = this.cells[i], x = t * V + c.ph, g = Math.floor(x); return drift(x - g, (hash2(g, i + 3) - .5) * (i ? .5 : .15), 1.2); },
  update() { const { T } = S; let best = null, bf = 0;
    this.cells.forEach((c, i) => { const p = this.pos(i), f = facing(p); if (f < .05) return;
      const k = Math.floor(T * c.rate + c.ph * 50), h = hash2(k, i + 11), age = T * c.rate + c.ph * 50 - k;
      const flash = h > .45 ? Math.exp(-age * 7) * (.5 + .5 * hash2(k, i + 31)) : 0;
      const night = 1 - sm(-.15, .1, sunlit(p)), I = flash * (.25 + .75 * night);
      const sz = 3.5 + 2 * hash2(k, i + 7);
      c.v.set(p, sz, I * 1.6); c.r.set(p, sz * 2.5, flash * .9);
      if (f > bf) { bf = f; best = p; } });
    if (best) this.p.copy(best); this.ok = !!best; },
  where() { return this.ok ? this.p : null; } });

// A terrestrial gamma-ray flash from the storm cell under you, seen by the station's detectors.
export const tgf = st => event({ name: 'Terrestrial gamma-ray flash', t0: 26, t1: 27.4, bands: ['gamma'], freq: ['tgf'], tags: ['rare', 'stylised'],
  note: 'For a fraction of a millisecond, the strong field above a thunderstorm accelerates electrons to near light speed; their bremsstrahlung shoots gamma rays (up to tens of MeV) up into space. Discovered by a gamma-ray observatory looking for cosmic bursts; the ASIM instrument on the ISS records them from right here (outside the South Atlantic Anomaly, where its detector is switched off). A storm makes one only now and then — a flash within view during one pass is luck. Drawn for 2.8 s of playback (2 min of orbit); the real flash lasts ~0.1 ms.',
  init() { this.e = new Em('gamma'); },
  update() { const p = st.pos(0); this.p = null; if (facing(p) < .05) return;
    this.e.set(p, 12, env(S.t, this.t0, this.t1, .5) * 1.5); this.p = p; },
  where() { return this.p; } });

// Sprites and elves over storms at the limb: brief flashes high above the clouds, best seen edge-on from orbit.
export const sprites = () => event({ name: 'Sprites and elves', t0: 12, t1: 31, bands: ['vis'], freq: ['sprite', 'elve'], tags: ['rare', 'stylised'],
  note: 'Above big storms near the horizon: a red sprite — a jellyfish of red light 50–90 km up, with blue tendrils hanging toward the cloud — or an elve, a ring of red glow at 90 km racing outward to hundreds of kilometres in under a millisecond, from the lightning\'s electromagnetic pulse. Worldwide there are sprites about once a minute and elves dozens a minute (too brief and faint for the eye); catching one by eye from the ISS is rare. Real sprites last 10–100 ms and elves < 1 ms; here each is held for ~0.3 s.',
  init() { this.ev = Array.from({ length: 7 }, (_, k) => ({ t: 13 + k * 2.5 + R() * 1.6, psi: (R() - .5) * 1.6, elve: R() < .4, w: 1 + R() }));
    this.rs = Array.from({ length: 4 }, () => new Rib('vis', '#ff3a3a', 10)); this.ring = new Rib('vis', '#ff4a30', 24); this.p = null; },
  update() { const { t } = S; this.p = null; if (dark() < .3) return;
    for (const e of this.ev) { const f = (t - e.t) / .15; if (f < 0 || f > 1) continue; const I = Math.sin(Math.PI * f) * dark();
      if (e.elve) { const r = .05 + .25 * f;   // expanding ring at 90 km, seen edge-on: a flat arc along the limb
        this.ring.set(Array.from({ length: 24 }, (_, j) => limbP(e.psi - r + 2 * r * j / 23, 9 + .4 * Math.sin(Math.PI * j / 23))), 2.2, 2.2, I * .8);
        this.p = limbP(e.psi, 9);
      } else { const b = limbP(e.psi, 4.5), top = limbP(e.psi, 9);
        this.rs.forEach((rb, j) => { const dx = (j - 1.5) * .012 * e.w; rb.set([limbP(e.psi + dx * .4, 4.2), limbP(e.psi + dx, 7), limbP(e.psi + dx * 1.6, 9)], 1.2, 2.6, I * .9, 1); });
        this.p = top.lerp(b, .3); }
      S.act.vis += I * .5; }
  },
  where() { return this.p; } });

// The South Atlantic Anomaly: the inner radiation belt dips lowest here, and the station flies through it.
export const saa = () => event({ name: 'South Atlantic Anomaly', t0: 17, t1: 24, bands: ['gamma', 'vis'], freq: ['saaGamma', 'eyeFlash'], tags: ['common', 'stylised'],
  note: 'Over the South Atlantic the Earth\'s magnetic field is weakest and the inner radiation belt reaches down to the station\'s height. For ~10 minutes trapped protons rain through the hull: the gamma rays they knock out of the aluminium light up the detectors aboard, and in the dark astronauts see brief flashes, streaks and spots with their eyes closed — energetic nuclei and here the trapped protons themselves exciting the retina directly (only the fastest nuclei also make Cherenkov light in the eyeball). Most astronauts report them: about one every 5–10 min in the SAA, fewer outside. Neither reaches the ground: the air stops the particles. Drawn at the real rate on this clock: one every ~5 s of playback.',
  init() { this.g = Array.from({ length: 6 }, () => new Em('gamma', null, 0, 'space')); this.f = new Rib('vis', '#e8f0ff', 3, 0, 'space'); this.fe = new Em('vis', '#e8f0ff', 0, 'space'); this.p = null; },
  update() { const { t, T } = S, I = env(t, this.t0, this.t1, 1.5); this.p = null; if (I <= .01) return;
    const k = Math.floor(T * 3);
    this.g.forEach((e, i) => { const h = hash2(k, i), age = T * 3 - k; if (h > .55) return;
      const d = dirAE(225 + 90 * hash2(k, i + 9), -25 + 55 * hash2(k, i + 17)).multiplyScalar(.6 + .8 * hash2(k, i + 23));
      e.set(d, .12, I * Math.exp(-age * 5) * 1.2); });
    this.p = dirAE(270, 5).multiplyScalar(D * .1);
    // light flashes: ~0.15 per minute in the SAA (Mir): a slot every 4 units (6 min, T / 8), 3 in 4 filled — one every
    // ~8 min of orbit, ~5 s of playback; each shown for ~0.1 s; noticed only when dark-adapted
    const kf = Math.floor(T / 8), age = T / 8 - kf, fl = hash2(kf, 77) < .75 ? Math.exp(-age * 120) : 0;
    if (!orbitOnly() || fl < .02) return;
    const o = dirAE(240 + 60 * hash2(kf, 5), -10 + 30 * hash2(kf, 6)), s = dirAE(240 + 60 * hash2(kf, 5) + 4 * (hash2(kf, 8) - .5), -10 + 30 * hash2(kf, 6) + 4 * (hash2(kf, 9) - .5));
    const J = fl * I * dark();
    if (hash2(kf, 4) < .5) this.f.set([o, s], .006, .006, J * 1.2); else this.fe.set(o, .02, J * 1.2); },
  where() { return this.p; } });

// The Earth's gamma-ray limb: the planet's brightest glow above 100 MeV, from cosmic rays hitting the upper air.
export const limbGamma = () => event({ name: 'Gamma-ray limb', t0: 0, t1: 60, bands: ['gamma'], freq: ['earthLimbGamma'], tags: ['common'],
  note: 'Cosmic rays strike the top of the atmosphere everywhere, and the gamma rays their showers make come out most where you look through the most upper air: along the limb. To a gamma-ray telescope in low orbit the Earth\'s horizon is a bright ring, brighter than any cosmic source — gamma telescopes point away from it. Day and night alike. None of it reaches the ground: it is made 20–50 km up and the air below absorbs it.',
  init() { this.r = new Rib('gamma', null, 48, 0, 'high'); },
  update() { this.r.set(Array.from({ length: 48 }, (_, j) => limbP(-1.35 + 2.7 * j / 47, 3)), 9, 9, .8); this.p = limbP(.35, 3); },
  where() { return this.p; } });

// Radio leaking up from the ground: broadcast transmitters over the inhabited land (the Earth's surface, uRadio)
// and the sweeping beams of S-band radars (airports on land, ships at sea).
export const radioLeak = () => event({ name: 'Radio from the ground', t0: 0, t1: 60, bands: ['radio', 'micro'], freq: ['fm', 'tvUHF', 'airportASR', 'sbandRadar'], tags: ['common', 'stylised'],
  note: 'Above about 10 MHz radio passes through the ionosphere, so every FM and TV transmitter below shines up into space too: the inhabited land glows in radio, day and night, with the speckle of coherent transmitters. AM and shortwave below the ionosphere\'s cut-off are reflected back down and stay hidden. Here and there an S-band radar sweeps its beam round — an airport\'s surveillance radar, a ship\'s navigation radar at sea — a microwave flash every turn, every ~2–5 s real (drawn slowed, under two a second of playback: real turns would strobe ~10–20 a second on this clock).',
  init() { this.rad = Array.from({ length: 7 }, () => ({ ph: R(), sw: R(), e: new Em('micro') })); this.p = null; },
  update() { EARTH_U.uRadio.value = S.on.radio ? 1 : 0; S.act.radio += 1.2; const { T } = S; this.p = null;
    this.rad.forEach((r, i) => { const x = S.t / CROSS + r.ph, g = Math.floor(x), p = drift(x - g, (hash2(g, i + 40) - .5) * .6, .5); if (facing(p) < .05) return;
      const sw = (T * 1.7 + r.sw) % 1; r.e.set(p, 4, (.25 + 1.1 * Math.exp(-sw * 12)) * (i % 3 ? 1 : .7)); if (!this.p) this.p = p; }); },
  where() { return this.p || BELOW(); } });

// The stars with no air: they don't twinkle and the sky is black right down to the limb; the UV sky opens up.
export const starfield = () => event({ name: 'Stars without air', t0: 0, t1: 60, bands: ['vis', 'uv'], freq: ['starlight', 'starUV', 'geocoronaLyA'], tags: ['common'],
  note: 'No air, no twinkling: the stars are steady points on a sky that stays black right down to the Earth\'s limb, even by day — though the sunlit Earth and the Sun outshine them until your eyes adapt on the night side. In far-UV the sky changes completely: the hottest blue stars dominate, and the whole sky glows faintly in hydrogen Lyman-α, sunlight scattered by the Earth\'s outermost atmosphere, the geocorona, which wraps around the station. None of that far-UV reaches the ground. In microwaves the sky is the 2.7 K cosmic background alone, with no warm air in front of it.',
  // geocorona: ~2 kR on the night side, ~10 kR by day (HST STIS IHB Table 6.5): × (1 + 4 (1 − dark))
  update() { if (ENV.nightMat) ENV.nightMat.uniforms.uGeo.value = 1 + 4 * (1 - dark());
    if (ENV.nightMat) ENV.nightMat.uniforms.uMW.value = S.on.vis ? .7 + .3 * dark() : 0; S.act.vis += .3 * dark(); if (orbitOnly()) S.act.uv += .3; },
  where: () => dirAE(285, 30).multiplyScalar(D) });

// The cupola around you.
export const cupola = () => event({ name: 'The cupola', t0: 0, t1: 60, bands: ['ir'], freq: ['thermal290'], tags: ['stylised'],
  note: 'You float in the ISS cupola, its seven windows looking down at the Earth. The aluminium frame is at cabin temperature, ~22 °C, and glows in thermal infrared like everything indoors. Stylised: the real windows are four panes of fused silica and borosilicate glass with a polycarbonate scratch pane, which block thermal infrared, most UV and all EUV and X-rays, and the metal hull shields radio — the spectral eye looks as if the window were open.',
  update() { S.act.ir += .6; },
  where: () => new V3(0, 0, 0).add(dirAE(240, 28).multiplyScalar(.8)) });

export { MIN_PER_UNIT, RE };
