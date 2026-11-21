# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`index.html` is a first-person 3D walk: a 2-minute sunset-to-night timelapse along a mountain trail, with events emitting across the electromagnetic spectrum. Bands outside visible light get stylized "instrument" looks; bands can be filtered live. Everything is in one file; three.js and its addons load from a jsdelivr CDN through an importmap, so the page needs a network connection.

Open `index.html` in a browser, or `uv run python -m http.server` and visit http://localhost:8000. There is no build, lint or test setup.

## Conventions that matter

- **Band effects live in GLSL, not JS.** `bandMat(band, color, ribbon, real)` builds a shader material; `Em` (camera-facing glow quad) and `Rib` (camera-facing ribbon along a list of world points) wrap them. `set()` adds to `act[band]`, which drives the bottom meters, and hides the mesh when the band is filtered off. **New spectral sources should use `Em`/`Rib`, never hand-drawn meshes.**
- **`real = 1` picks the realistic IR style** (tight, low-contrast heat that rises, no false-colour rings) for moving warm bodies: the deer uses a `Rib('ir', null, 4, 1)` along its body, plus a small head `Em('ir', null, 1)`; same for bats and the airliner's engine trail. Static/hot sources (rocks, campfire, chimney smoke, Moon) keep the thermal-camera palette.
- **The pulsar has two opposite arms** (`aa = a - k * .34 + s * Math.PI`), each with one faded sweep ghost behind it; more arms read as a windmill and looked broken.
- **Events live on a 0–60 script axis.** Real playback is twice as slow: `t += dt * .5` in the loop, and the slider is 0–120 real seconds with `t = value / 2`. Author new events with `t0`/`t1` on the 0–60 axis; the loop converts.
- **Everything is placed ahead of the viewer and above the horizon.** Front is azimuth 270 (west, down the trail). `dirAE(az, el)` gives a sky direction, `skyP`/`onSky` turn it into a world point at distance `D`. The view is clamped to a quarter sphere (yaw ±1.35 rad, pitch −0.1…1.5), so keep random azimuths inside roughly 205–340 and elevations above the horizon; anything outside is never seen.
- **The walk is deliberately dense at both ends.** Sunset-side events (`Sun dog pair`, `Zodiacal scatter`, `Thermal updraft`, `t0` 0–14) and night-side ones (`Noctilucent clouds`, `Moon halo`, `Fire whirl`, `t1` 60) were added because the first and last twenty seconds looked empty; the air showers also start as early as `t0 = 20`. Keep any new filler event short-lived so it does not squash the timeline.
- **Growing structures store a node table, not positions.** The cosmic-ray showers keep `nd` = rows of `{ n: parentIndex, az, el, j, a, b, lv, w }`; each frame `cur` is rebuilt by lerping a node from its parent's current point toward its own `dirAE(s.az + az, el)` target by `f = clamp((g - a) / (b - a))`, so a branch that has not started yet sits exactly on its parent and the packet visibly forks as `g` grows. `chain` (root → deepest node) drives the X-ray shaft. Anything built this way must be seeded from `rng`, never `Math.random`.
- **`where` must be a method, not an arrow.** Events are `<script type="module">`, so an arrow `where: () => this.p` sees `this === undefined` and throws "Cannot read properties of undefined". Write `where() { return this.p; }` whenever the label needs event state.
- **Cone-shaped sources are streamlines + a mouth ring**: rays run from the core direction to points on a ring around the mouth direction (`ringPts(md, radiusDeg, n)`), plus a brighter spine. Do not fake a cone by tapering one ribbon — the radio dash wavelength is `u * uLen * .12` with `uLen = length / width`, so a wide-tipped ribbon breaks into confetti. The pulsar arms and black-hole jets follow this.
- **Panel metadata and drawing share one object** in `EV` (built with `ev({ name, t0, t1, bands, note, init, update, where })`). `init()` builds meshes once, `update()` runs every frame and must reset sizes/intensities (the loop hides all `Em`/`Rib` meshes before updating, so a source that should be invisible just isn't `set()`), and `where()` returns a point for the label/off-screen arrow.

## Structure inside the `<script>`

Helpers and seeded `rng` → band tables → GLSL (`COMMON`, `QUAD_*`, `RIB_*`) → `Em`/`Rib` → sky (`Sky` with a patched `uFade`, night-sky shader for stars/Milky Way/CMB/airglow, cloud plane) → terrain (`heightAt`, vertex-coloured 330² grid, instanced pines/rocks/grass) → lights → `EV` events in script-time order → `updateWorld()` (camera walk, sky/light keyframes, then `EV.forEach(e => e.update())`) → overlay canvas (compass, labels, arrows) → UI → loop.

Time-driven colour lives in keyframe tables read with `kf(table, t)`: `HEMI`, `HOR`, `CLOUD`, `CONTRAIL`, plus `n = sm(8, 22, t)` (night) and `ml = sm(38, 50, t)` (moonlight). Random content is precomputed with the seeded `rng`, so scrubbing repeats identically.

Meter bars are normalised per band (`{ radio: 5.5, micro: 1.6, ir: 2.1, vis: 3.6, uv: 2.1, xray: 1.7, gamma: 3.4 }`) — radio and gamma were raised once the radio cones and the branching air showers were added, since those events carry many more sources per frame. Rendered brightness is separate: `GAIN` multiplies the intensity of every `Em`/`Rib` source per band (invisible bands get ~2×), keeping them readable against the night. Retune there if intensities change. The sun is kept small and dim through `sunEl()`, low `mieCoefficient`/high `mieDirectionalG` in the `Sky` uniforms, `bloom` threshold `.9`, and the magenta/violet keyframe tables `HOR`, `HEMI`, `CLOUD`, `CONTRAIL`.

## Verifying visually

No Node is installed. A Playwright headless Chromium is cached under `~/.cache/ms-playwright/` and can render the page with software WebGL (slow, but it compiles shaders and reports JS errors):

```
chrome-headless-shell --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader \
  --ignore-gpu-blocklist --enable-logging=stderr --window-size=1400,850 --virtual-time-budget=20000 \
  --screenshot=out.png file:///path/to/index.html
```

To capture a moment, copy the file with the initial `let t = 0, T = 0,` changed. Drag-to-look cannot be exercised this way, so view changes are checked by also patching `let yaw = 0, pitch = .06;`.
