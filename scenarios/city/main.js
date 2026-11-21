// City: walk out of a street canyon into a park at nightfall. Light pollution hides most stars,
// so the city's own emitters (traffic, lamps, phones, Wi-Fi, mast) carry the spectrum.
import { run } from 'spectra/app.js';
import * as sky from 'spectra/events/sky.js';
import { observer } from 'spectra/events/observer.js';
import { build } from './world.js';
import * as local from './events.js';

run({
  title: 'City',
  loading: 'Raising the skyline…',
  hint: 'Drag to look ahead and up (a quarter sphere) · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · the walk lasts 2 minutes',
  atmosphere: { lightPollution: .7, cloudCover: [.55, .7] },
  fog: .00022,
  meterNorm: { micro: 3.2, vis: 5.5, ir: 3.2 },   // many more near emitters per frame than the countryside
  build,
  events: () => [
    sky.sunset(), local.windows(), local.streetLights(), local.cellTower(), local.wifi(), local.traffic(),
    observer({ name: 'You', note: 'Walking the sidewalk; your phone pings the network (microwave) every few seconds.' }),
    sky.airliner({ note: 'On approach to the airport: nav lights, hot engines (IR), transponder (radio), weather radar (microwave).' }),
    sky.venus(), sky.cmb(), sky.milkyWay({ note: 'Barely there through the city glow; the dust still glows in IR and Sgr A* in radio.' }),
    sky.meteorShower(), sky.pulsar(), sky.comet(), sky.satellitePass(), sky.starlink(), sky.blackHoleBinary(), sky.moonrise(),
    sky.airShowers(), sky.thunderstorm({ note: 'Beyond the suburbs: lightning, radio "sferics" and terrestrial gamma-ray flashes.' }),
    sky.fastRadioBurst(), sky.supernova(), sky.gammaRayBurst(), local.fireworks(), sky.moonHalo(),
  ],
});
