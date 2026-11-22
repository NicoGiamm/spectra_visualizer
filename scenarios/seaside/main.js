// Seaside: stand on a west-facing beach while the Sun sets into the sea and the night fills in.
import { run } from 'spectra/app.js';
import * as sky from 'spectra/events/sky.js';
import { observer } from 'spectra/events/observer.js';
import { build } from './world.js';
import * as local from './events.js';

run({
  title: 'Seaside',
  loading: 'Filling the bay…',
  hint: 'Drag to look out over the bay (a quarter sphere ahead) · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · lasts 1½ minutes',
  // Microwave only (M7/T1): the ship's and fishing boats' X-band radars, the wind farm and the sea interferometer
  // put twice the trail's 90th-percentile micro activity on the bar (peak ~27 vs ~12); with the shared 4.8 it sat
  // pinned for ~16 s. 9 puts its peak at ~0.95.
  meterNorm: { micro: 9 },
  build,
  events: () => [
    sky.sunset(), local.greenFlash(), sky.sunDogs(), sky.crepuscularRays(), local.warmSand(), local.gulls(),
    observer({ name: 'You', note: 'Standing on the sand; your phone pings the network (microwave) every few seconds and sends short Bluetooth bursts (2.4 GHz, also microwave).' }),
    sky.airliner(), sky.venus(), local.lighthouse(), local.ship(), sky.cmb(), sky.milkyWay(), sky.meteorShower(),
    sky.pulsar(), sky.comet(), sky.satellitePass(), sky.starlink(), sky.blackHoleBinary(), sky.aurora(), sky.moonrise(),
    sky.airShowers(), sky.thunderstorm({ note: 'Far out over the sea: lightning, radio "sferics" and terrestrial gamma-ray flashes.' }),
    sky.fastRadioBurst(), sky.supernova(), sky.gammaRayBurst(), local.bioluminescence(), sky.noctilucentClouds(), sky.moonHalo(),
    // added after the original list so the events above keep their seeded R values (crepuscularRays takes the
    // zodiacalScatter slot with the same 18 R() draws; these three draw none)
    sky.purpleLight(), sky.zodiacalLight(), local.seaMist(),
    // M5/T2 maritime life, appended (they draw from R after everything above)
    local.fishingBoats(), local.vhf16(), local.buoys(), local.windFarm(), local.bonfire(),
    local.seaInterferometer(),
  ],
});
