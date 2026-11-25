// Open ocean: the cockpit of a yacht ~1000 km from land, from sunset into night. The counterpart to the city: almost no
// human radio (your own AIS and VHF, one ship's radar and AIS, a satphone burst, GPS from above), no coast, no glow on
// any horizon, and the clearest, darkest sky of the scenarios.
import { run } from 'spectra/app.js';
import * as sky from 'spectra/events/sky.js';
import { build } from './world.js';
import * as local from './events.js';

run({
  title: 'Open Ocean',
  loading: 'Casting off…',
  hint: 'Drag to look out over the ocean (a quarter sphere ahead) · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · lasts 2 minutes',
  // no light pollution; a few fair-weather cumulus at sunset that clear away after dark (uCover is a threshold: higher = fewer)
  atmosphere: { lightPollution: 0, cloudCover: [.62, .9] },
  fog: .00006,
  build,
  // No observer phone: there is no network 1000 km offshore (the satphone and the boat's own radios replace it).
  // Dropped for this site: noctilucent clouds and aurora (high latitude only), sun dogs and moon halo (no cirrus),
  // zodiacal light (the 41 % Moon is up all evening, as at the seaside), the rocket plume (no launch site near).
  events: () => [
    sky.sunset(), local.greenFlash(), sky.crepuscularRays(), local.whale(), local.engine(), local.navLights(),
    local.ownAIS(), local.cargoShip(), local.gnss(),
    sky.airliner({ note: 'An airliner at cruise on an oceanic track, far beyond any radar: nav lights and contrail, hot engines (IR), its ADS-B position (microwave) relayed by satellites, and its weather radar (microwave). Out of VHF range of land, it keeps a listening watch on the air-to-air and guard frequencies.' }),
    sky.venus(), sky.purpleLight(), sky.firstStars(), sky.satellitePass(), sky.cmb(), sky.milkyWay({ note: 'No artificial light for a thousand kilometres: the whole band with its dark dust lanes, the dust glowing in IR and Sgr A* in radio.' }),
    sky.meteorShower(), sky.pulsar(), sky.comet(), sky.starlink(), sky.microquasar(), sky.moonrise(), sky.airShowers(),
    sky.thunderstorm({ note: 'A squall line far over the sea: lightning, radio "sferics" and terrestrial gamma-ray flashes.' }),
    sky.fastRadioBurst(), sky.supernova(), sky.gammaRayBurst(), sky.fireball(),
    local.vhf16(), local.satphone(), local.bioluminescence(),
  ],
});
