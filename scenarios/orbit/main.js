// Above the atmosphere: the ISS cupola, ~420 km up, over one whole orbit — day, orbital sunset ahead, 36 minutes of
// night, sunrise behind you, day again. Time-compressed: the 2-minute script is one 92.9-minute orbit, 1 script unit =
// 1.55 min (world.js MIN_PER_UNIT), 46 s of orbit per second of playback.
//
// No air (atmosphere `air: false`, engine/world/atmosphere.js): the sky is black down to the Earth's limb, nothing is
// absorbed or dimmed between a source and the eye, so bands no ground observer can see are all here — the Sun's EUV
// and X-ray corona, the geocoronal Lyman-α sky and far-UV stars, the Earth's gamma-ray limb, the South Atlantic
// Anomaly, far-UV nightglow.
// Detector: the ISS is the detector. Orbit (the default) is the view from here. Ground keeps its meaning in every
// scenario — it removes what the air stops before the ground (ghost markers), i.e. it shows what a ground observer
// would miss of the same scene; it is not a view from the ground.
//
// The Sun (atmosphere.js `site`, as functions of t: it circles the sky once per script, which no cubic follows): in
// the orbit plane tipped 15° (beta angle), turning 6° per unit around the orbit normal; station sunset at t = 9 ahead
// (az ≈ 285, ~5° up in the view), sunrise at t ≈ 32.1 behind; the shadow lasts 35.8 min (world.js). The Moon is new,
// near the Sun (elongation ~5°, drawn on the Sun's track): it rises and sets with it, unlit, and plays no part. The site's twilight clock is
// unused: with no air there is no twilight sky; the world lights itself (world.js update).
import { run } from 'spectra/app.js';
import { build, sunAz, sunEl } from './world.js';
import * as local from './events.js';

const SITE = { sunAz, sunEl, moonAz: sunAz, moonEl: sunEl, moonElong: 5 };

run({
  title: 'Above the atmosphere',
  // start looking a little down at the limb ahead (it sits ~5° above the view's horizontal)
  view: { yaw: 0, pitch: -.1 },
  loading: 'Docking at the station…',
  hint: 'Drag to look around the window (a quarter sphere) · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · one 93-minute orbit lasts 2 minutes',
  atmosphere: { site: SITE, air: false },
  fog: 0,
  build,
  // init() order = list order (they share the seeded stream); the panel sorts by t0 itself.
  events: () => {
    const st = local.storms();
    return [
      local.earthBelow(), local.sun(), local.terminator(),
      local.terminator({ name: 'Dawn sweeps under you', t0: 32, t1: 40, note: 'The Sun has risen behind you. The day comes up from behind and races under you toward the horizon ahead: the ground straight down is sunlit within ~5 minutes, the limb ahead after ~10, its air flaring orange and blue as the terminator reaches it. Its ground track runs at 7.2 km/s, ~15–18 times faster (depending on latitude) than the morning moves across the ground.' }),
      local.airglow(), local.cities(), st, local.tgf(st), local.sprites(), local.saa(), local.limbGamma(), local.radioLeak(),
      local.starfield(), local.cupola(),
    ];
  },
});
