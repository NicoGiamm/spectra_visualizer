// Volcano at dusk: on a ridge facing an active basaltic volcano (lava lake, fountains, flows) from sunset into night.
import { run } from 'spectra/app.js';
import * as sky from 'spectra/events/sky.js';
import { observer } from 'spectra/events/observer.js';
import { build } from './world.js';
import * as local from './events.js';

run({
  title: 'Volcano at dusk',
  loading: 'Building the volcano…',
  hint: 'Drag to look around the crater and up the plume · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · the night lasts 2 minutes',
  build,
  // the lava is on all night: lift the IR and visible meter tops so peaks still read as peaks (bands.js METER_NORM rule)
  meterNorm: { ir: 16, vis: 30 },
  // init() order = list order (they share the seeded stream); the panel sorts by t0 itself. Append new events at the end.
  events: () => [
    sky.sunset(), local.lavaLake(), local.activeFlow(), local.coolingFlows(), local.gasPlume(), local.fountain(),
    local.volcanicLightning(), local.radonFumarole(), local.monitoringStation(),
    observer({ name: 'You' }),
    sky.venus(), sky.purpleLight({ note: 'A pink-purple glow above the sunset point once the Sun is a few degrees down: red sunlight scattered by stratospheric aerosol. Volcanic sulfate aerosol makes it vivid (after Pinatubo 1991 it was famous worldwide).' }),
    sky.firstStars(), sky.satellitePass(), sky.milkyWay(), sky.cmb(), sky.moonrise(), sky.meteorShower(), sky.airShowers(),
  ],
});
