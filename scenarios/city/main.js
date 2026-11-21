// City: walk out of a street canyon into a park at nightfall. Light pollution hides most stars,
// so the city's own emitters (traffic, lamps, phones, Wi-Fi, mast) carry the spectrum.
import { run } from 'spectra/app.js';
import * as sky from 'spectra/events/sky.js';
import { observer } from 'spectra/events/observer.js';
import { build } from './world.js';
import * as local from './events.js';
import * as rf from './rf.js';
import * as life from './life.js';
import * as street from './street.js';

run({
  title: 'City',
  loading: 'Raising the skyline…',
  hint: 'Drag to look ahead and up (a quarter sphere) · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · the walk lasts 1½ minutes',
  atmosphere: { lightPollution: .7, cloudCover: [.55, .7] },
  fog: .00022,
  // the crowd (phones, TPMS, haze) and the street life raise the near-field counts by an order of magnitude
  meterNorm: { radio: 12, micro: 78, ir: 70, vis: 230, uv: 4.5, xray: 7.5, gamma: 21 },
  build,
  events: () => [
    sky.sunset(), local.windows(), local.streetLights(), local.cellTower(), local.wifi(), local.traffic(),
    observer({ name: 'You', note: 'Walking the sidewalk; your phone pings the network (microwave) every few seconds and sends short Bluetooth LE bursts (2.4 GHz, also microwave).' }),
    sky.airliner({ note: 'On approach: nav lights & contrail, hot engines (IR), Mode S/ADS-B transponder (microwave), VHF airband chatter (radio) and weather radar (microwave).' }),
    sky.venus(), sky.cmb(), sky.milkyWay({ note: 'Barely there through the city glow; the dust still glows in IR and Sgr A* in radio.' }),
    sky.meteorShower(), sky.pulsar(), sky.comet(), sky.satellitePass(), sky.starlink(), sky.blackHoleBinary(), sky.moonrise(),
    sky.airShowers(), sky.thunderstorm({ note: 'Beyond the suburbs: lightning, radio "sferics" and terrestrial gamma-ray flashes.' }),
    sky.fastRadioBurst(), sky.supernova(), sky.gammaRayBurst(), local.fireworks(), sky.moonHalo(),
    // Phase 4: the RF ecosystem + street life, appended last so their seeded init() draws stay after the layout
    rf.crowd(), rf.scooters(), rf.parkedRF(), rf.busStop(), rf.multipath(), rf.haze(),
    rf.tram(), rf.powerlines(), rf.ledSwitch(), rf.fmMast(),
    life.signs(), life.cams(), life.hvac(), life.steam(), life.robot(), life.radar(), life.police(),
    // complexity parity with the trail and seaside: the sky events a light-polluted city still sees (no zodiacal
    // light, no aurora), then more street life; appended last so every earlier seeded R() draw is unchanged
    sky.sunDogs(), sky.crepuscularRays(), sky.purpleLight(),
    sky.noctilucentClouds({ note: 'Silver-blue ripples at 80 km, still sunlit long after sunset: one of the few night-sky sights bright enough to beat the city glow. Their UV never reaches the ground.' }),
    street.buses(), street.cyclists(), street.swifts(), street.bats(), street.rooftopBar(), street.blackLight(), street.stoneGamma(), street.drone(),
  ],
});
