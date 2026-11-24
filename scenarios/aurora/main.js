// Arctic evening aurora: a snowfield near Tromsø on an October evening (an early cold spell); the Sun sets in the south-west and an
// auroral substorm builds, breaks up overhead and fades into pulsating patches.
import { run } from 'spectra/app.js';
import * as sky from 'spectra/events/sky.js';
import { observer } from 'spectra/events/observer.js';
import { FOV_SKY } from 'spectra/core/geom.js';
import { build } from './world.js';
import * as local from './events.js';

// The site (engine/world/atmosphere.js `site`): 69.65° N, 18.96° E (Tromsø), 21 October 2026, script t = 0 at 13:30 UT
// (15:30 local, CEST), 1 script unit = 6 min, so the hour is 13:30–19:30 UT. Sun and Moon from astropy 6
// (get_sun / get_body, geocentric→topocentric AltAz, no refraction), fitted as cubics in t to ≤ 0.07°:
//   t        0     10     20     30     40     50     60
//   UT    13:30  14:30  15:30  16:30  17:30  18:30  19:30
//   Sun az 224.4  238.6  252.5  266.5  280.6  295.2  310.5   el  3.7  −0.4  −5.2 −10.3 −15.5 −20.5 −24.9
//   Moon az 102.3 115.7  129.3  143.2  157.3  171.8  186.4   el −8.2  −3.2   1.2   5.0   7.7   9.3   9.6
// The Sun (declination −10.7°) sets at t ≈ 9 (14:24 UT) in the south-west (az 238), sliding along the horizon:
// at 69.65° N it sinks only ~5° per hour: civil twilight ends at t ≈ 22, nautical at t ≈ 33, astronomical at t ≈ 45. The waxing
// gibbous Moon (elongation 122°, 77 % lit) rises in the east-south-east at t ≈ 17 behind the viewer and stays low in the
// south (az ≤ 186°, left of the view's 193° limit): it lights the snow but is not in sight. Substorm onsets cluster near
// magnetic midnight, ~21–23 MLT; at Tromsø MLT ≈ UT + 2.5 h, so the breakup at t ≈ 40 (17:30 UT, ~20 MLT) is early.
const SITE = {
  lat: 69.65, lon: 18.96, date: '2026-10-21T13:30Z', minPerUnit: 6,
  clock: { start: 15.5, minPerUnit: 6 },   // HUD: local time, CEST (UTC+2 until 25 Oct 2026): 15:30 → 21:30
  sunAz: [224.379, 1.43851, -0.00231122, 3.74152e-05],
  sunEl: [3.66469, -0.362084, -0.00499631, 5.1766e-05],
  moonAz: [102.339, 1.32136, 0.0013568, -3.41519e-07],
  moonEl: [-8.2532, 0.524439, -0.00183771, -3.2597e-05],
  moonElong: 122.3,
};

// The curtain: a close substorm, the same library event as the distant arc of the other scenarios, retimed: quiet arc
// from t 18, breakup at t 40, pulsating recovery to the end. Geometry: arcs run along geomagnetic east–west — at Tromsø
// (IGRF-13, 2026: declination +11.3°, inclination 78.4°) that is az ≈ 101 / 281, the magnetic zenith at az ≈ 191,
// el ≈ 78 (south, out of view). So in the west-facing cone the arc rises from the WNW horizon (az0 280) toward the
// north-west (az1 330, tilt), and during the breakup it climbs toward the zenith (rise) — where the corona would be.
const curtain = sky.aurora({ name: 'Auroral substorm', t0: 18, t1: 60, brk: 22, az0: 280, az1: FOV_SKY.az1, elBot: 6, tilt: 12, rise: 16, topK: 1.1, ampK: 1.3, tags: ['common'],
  note: 'A substorm builds over you. A quiet green arc (oxygen, 557.7 nm, ~110 km up) rises out of the west-north-west across the northern sky in the twilight; then it brightens, climbs and breaks up into rays and folds racing along the curtain, red tops (oxygen 630 nm, 200–300 km) and a pink-violet lower edge (N₂⁺ 427.8 nm, N₂ first positive); then it falls apart into patches that pulse every few seconds. The rays would really converge on the magnetic zenith (the corona), almost overhead and out of view; drawn here straight up (stylised). Its near-IR glow and VHF radar echoes reach the ground; its far-UV and the X-rays the electrons make when they stop in the air are absorbed high up (Orbit only).' });

run({
  title: 'Arctic evening aurora',
  // start facing the arc: yaw −.6 rad ≈ az 304, the middle of the geomagnetically aligned arc (az 280–330); pitch up a little for the curtain
  view: { yaw: -.6, pitch: .22 },
  loading: 'Laying the snow…',
  hint: 'Drag to look ahead and up (a quarter sphere, you can\'t turn behind yourself) · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · the evening lasts 2 minutes',
  atmosphere: { site: SITE, cloudCover: [.86, .9] },
  build,
  // init() order = list order (they share the seeded stream); the panel sorts by t0 itself.
  events: () => [
    sky.sunset(), curtain, local.snowfield(curtain), local.frozenLake(curtain), local.cabin(),
    observer({ name: 'You', note: 'Your phone still pings the nearest mast (microwave) every few seconds and sends short Bluetooth bursts (2.4 GHz).' }),
    local.auroraNearUV(curtain), local.akr(curtain), local.riometer(curtain), local.snowmobile(),
    sky.cmb(),   // no satellite pass: an ISS pass cannot culminate in the west cone at 69.65° N
    sky.airShowers({ note: 'Cosmic rays hit the upper air and their particle cascades fan out as they descend. Near the magnetic pole the geomagnetic field turns fewer of the low-energy ones away. The big showers drawn here, though, come from primaries far too energetic to be deflected. From the ground: a near-UV Cherenkov flash, N₂ fluorescence and a 30–80 MHz radio pulse; the gamma secondaries are absorbed. Real showers last microseconds.' }),
  ],
});
