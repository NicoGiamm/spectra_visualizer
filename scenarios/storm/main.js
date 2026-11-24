// Thunderstorm on the plains: open grassland as a supercell rolls in at sunset and passes overhead into the night.
import { run } from 'spectra/app.js';
import * as sky from 'spectra/events/sky.js';
import { observer } from 'spectra/events/observer.js';
import { build } from './world.js';
import * as local from './events.js';

run({
  title: 'Thunderstorm on the plains',
  loading: 'Building the storm…',
  hint: 'Drag to look ahead and up (a quarter sphere ahead) · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · the storm passes in 2 minutes',
  build,
  // init() order = list order (they share the seeded stream); the panel sorts by t0 itself. Append new events at the end.
  // Not used: sky.thunderstorm (distant, replaced by the close local lightning), and the night-sky library events
  // (Moon, Milky Way, planets) whose sources would shine through the overcast. No rainbow: with the Sun in the west it
  // would stand in the east, behind the viewer (the view is clamped to the western quarter sphere).
  events: () => [
    sky.sunset(), sky.crepuscularRays(), local.approach(), local.lightning(), local.rain(), local.radar(), local.coldGround(),
    local.leaderXrays(), local.tgf(), local.whistlers(), local.hail(), local.powerLine(), local.farmhouse(),
    observer({ name: 'You (storm chaser)', note: 'Standing by the road; your phone pings the network (microwave) every few seconds and sends short Bluetooth bursts (2.4 GHz, also microwave).' }),
    local.fireflies(),
  ],
});
