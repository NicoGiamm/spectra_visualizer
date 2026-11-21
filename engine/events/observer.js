// The viewer as an emitter: a phone pinging the network and, optionally, a headlamp after dark.
import { V3, sm } from '../core/util.js';
import { S } from '../core/state.js';
import { event } from '../core/events.js';
import { Em } from '../render/sources.js';
import { ENV } from '../world/atmosphere.js';

export const observer = o => event({ name: 'You', t0: 0, t1: 60, bands: ['vis', 'micro'], freq: ['lte', 'bluetooth', 'ledWhite'], note: 'Your phone pings the network (microwave) every few seconds and sends short Bluetooth bursts (2.4 GHz, also microwave).', lamp: false,
  init() { this.ph = new Em('micro'); this.bt = new Em('micro'); },
  update() { const { t, on, camera } = S;
    if (this.lamp) { const lamp = sm(16, 19, t); ENV.headlamp.intensity = on.vis ? lamp * 60 : 0; S.act.vis += lamp * .4; }
    const f = new V3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    const at = camera.position.clone().addScaledVector(f, .55).add(new V3(0, -.6, 0));
    const ping = (t % 4) / 4; this.ph.set(at, .6, ping < .15 ? 1 - ping / .15 : 0);
    // Bluetooth LE advertising: a pair of tiny, quick blips about every 1.5 script-s, much fainter than the LTE ping
    const b = (t + 1.1) % 1.5, blip = Math.max(0, 1 - Math.abs(b - .04) / .04) + Math.max(0, 1 - Math.abs(b - .16) / .04);
    if (blip > 0) this.bt.set(at.clone().add(new V3(0, .04, 0)), .28, blip * .3); },
  where: () => null }, o);
