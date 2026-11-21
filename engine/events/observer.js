// The viewer as an emitter: a phone pinging the network and, optionally, a headlamp after dark.
import { V3, sm } from '../core/util.js';
import { S } from '../core/state.js';
import { event } from '../core/events.js';
import { Em } from '../render/sources.js';
import { ENV } from '../world/atmosphere.js';

export const observer = o => event({ name: 'You', t0: 0, t1: 60, bands: ['vis', 'micro'], note: 'Your phone pings the network (microwave) every few seconds.', lamp: false,
  init() { this.ph = new Em('micro'); },
  update() { const { t, on, camera } = S;
    if (this.lamp) { const lamp = sm(16, 19, t); ENV.headlamp.intensity = on.vis ? lamp * 60 : 0; S.act.vis += lamp * .4; }
    const f = new V3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    const ping = (t % 4) / 4; this.ph.set(camera.position.clone().addScaledVector(f, .55).add(new V3(0, -.6, 0)), .6, ping < .15 ? 1 - ping / .15 : 0); },
  where: () => null }, o);
