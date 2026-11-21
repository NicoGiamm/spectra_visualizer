// Mountain trail: walk ~80 m west along an alpine trail from sunset into a full night.
import { run } from 'spectra/app.js';
import * as sky from 'spectra/events/sky.js';
import { observer } from 'spectra/events/observer.js';
import { build } from './world.js';
import * as local from './events.js';

run({
  title: 'Mountain trail',
  loading: 'Building the mountains…',
  hint: 'Drag to look ahead and up (a quarter sphere, you can\'t turn behind yourself) · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · the walk lasts 2 minutes',
  build,
  // init() order = list order (they share the seeded stream); the panel sorts by t0 itself.
  events: () => [
    sky.sunset(), local.alpenglow(), local.radioTower(), local.warmRocks(),
    local.cellMast(), local.weatherStation(), local.mountainStream(), local.gnss(), local.cows(),
    observer({ name: 'Hiker (you)', note: 'Headlamp after dark; your phone pings the network (microwave) every few seconds.', lamp: true }),
    sky.airliner(), sky.venus(), local.hut(), local.deer(), local.sunWarmedSlope(), local.fireflies(), sky.cmb(), sky.milkyWay(), sky.meteorShower(),
    sky.pulsar(), local.bats(), local.farHikers(), sky.comet(), sky.satellitePass(), sky.starlink(), sky.blackHoleBinary(), sky.aurora(), sky.moonrise(),
    sky.airShowers(), sky.thunderstorm({ note: 'Over the southern peaks: lightning, radio "sferics" and terrestrial gamma-ray flashes.' }),
    sky.fastRadioBurst(), sky.supernova(), sky.gammaRayBurst(), local.campfire(), local.sparkDraft(), sky.sunDogs(), sky.zodiacalScatter(),
    sky.noctilucentClouds(), sky.moonHalo(), local.valleyFog(),
  ],
});
