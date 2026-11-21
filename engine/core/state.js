// Shared mutable state. One page = one scenario, so a module-level singleton is enough.
// `t` is script time on the 0–60 axis (playback runs at half speed: 120 real seconds),
// `T` is wall-clock seconds for animation that should not stop when paused.
import { BANDS } from './bands.js';

export const S = {
  t: 0, T: 0,
  playing: true, labelsOn: true,
  yaw: 0, pitch: .06,                 // yaw 0 = looking west (-z), the "front" of every scenario
  on: Object.fromEntries(BANDS.map(b => [b.id, true])),   // band filter
  act: Object.fromEntries(BANDS.map(b => [b.id, 0])),     // per-frame activity, drives the meters
  TIME: { value: 0 },                 // shared uTime uniform
  scene: null, camera: null, renderer: null, PR: 1,
  groundAt: () => 0,                  // provided by the scenario's world
  detector: 'orbit',                  // 'orbit' (default) | 'ground': whether the atmosphere absorbs (bands.js TRANSMIT)
  ghosts: new Map(),                  // per frame: event -> { pos, bands: Set } for sources absorbed in Ground mode
  curEvent: null,                     // the event whose update() is running (ghost markers are grouped by it)
};
