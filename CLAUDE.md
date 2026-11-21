# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

First-person 3D scenes (three.js) that play a 2-minute sunset-to-night timelapse with events emitting across the electromagnetic spectrum; bands can be filtered live. A shared **engine** (`engine/`, plain ES modules, no build) runs **scenarios** (`scenarios/<id>/`: `trail`, `seaside`, `city`). Python tooling in `src/spectra_tools/` (cyclopts CLI `spectra`, run with `uv run`) discovers, serves, bundles and screenshots them. See README.md for the layout and contracts.

- `uv run spectra serve` — dev server (ES modules don't load over file://); also regenerates root `index.html`.
- `uv run spectra build [ids…]` — `dist/<id>.html` single files (each module inlined as a `data:` URL in the import map) + `dist/index.html`; also regenerates root `index.html`. Root `index.html` and `dist/` are generated from `engine/ui/landing.html` — edit the template.
- `uv run spectra shot <id> -t 30 [--yaw .3 --pitch .5 --bands ir,micro] -o out.png` — headless render; prints grouped console messages (shader compile logs included) and exits 1 on any. **Run it after every change**; there is no lint or test suite.

Imports: engine modules import each other relatively; scenarios import the engine as `spectra/...` (import map in each `index.html`) and their own files relatively. The bundler regex only recognises `import`/`export … from` at the start of a line — keep imports static and on their own lines.

## Conventions that matter

- **Band effects live in GLSL, not JS** (`engine/render/shaders.js`). `bandMat(band, color, ribbon, real)`; `Em` (camera-facing glow quad) and `Rib` (camera-facing ribbon along world points) in `engine/render/sources.js`. `set()` adds to `S.act[band]` (meters) and hides the mesh when the band is filtered off. **New spectral sources use `Em`/`Rib`, never hand-drawn meshes.** The loop hides every source before updates, so an invisible source simply isn't `set()`.
- **`real = 1` picks the realistic IR style** (tight, low-contrast rising heat, no false-colour rings) for moving warm bodies: deer `Rib('ir', null, 4, 1)` + head `Em('ir', null, 1)`, bats, gulls, airliner/ship/car exhausts. Static hot sources keep the thermal palette.
- **Events** are objects `{ name, t0, t1, bands, note, init(), update(), where() }` on the **0–60 script axis** (`S.t`; playback `t += dt * .5`, slider 0–120). Shared ones are factories in `engine/events/sky.js` taking overrides (`sky.thunderstorm({ note })`); when retiming a library event check what its `update()` hard-codes. Local ones live in the scenario's `events.js`. `update()` must reset sizes/intensities every frame. Read `t`/`T`/`on`/`camera` from `S` (`engine/core/state.js`).
- **`where` must be a method, not an arrow**, when it reads `this` (ES modules: arrow `this` is undefined).
- **Front is azimuth 270 (west, −z) in every scenario.** `dirAE(az, el)`, `skyP`, `onSky` (`engine/core/geom.js`) put things on a sphere of radius `D` around the camera. View clamp: yaw ±1.35, pitch −0.1…1.5 — keep sky azimuths ~205–340 and above the horizon.
- **One shared timeline** in `engine/world/atmosphere.js`: `SUN_AZ`/`sunEl()`, `moonDir()`, `night()`, `moonlit()`, keyframes `HEMI`/`HOR`/`CLOUD`/`CONTRAIL` read with `kf()`. Atmosphere also owns the lights (sun, moon, hemi, headlamp, storm flash) via `ENV`. Options per scenario: `lightPollution` (dims stars/Milky Way, adds a horizon glow), `cloudCover`.
- **Seeded randomness**: layouts and event `init()`s draw from the shared `R` (`engine/core/util.js`) in list order, never `Math.random`, so scrubbing repeats. The trail's `events()` order matches the original single file so its layout is unchanged.
- **Instrument view** (Visible off): `solid(obj, instrMat?)` registers solids (default dark material); `visOnly()` for sprites that exist only in visible light. Terrain uses `topoMat` (contours) or `gridMat(cell)` for flat ground; both have `uWarm` for an IR heat glow near the viewer. Per-instance values passed to fragment shaders must be `flat varying` (interpolated seeds + hashes = pixel noise).
- **Pulsar has two opposite arms**, each with one faded sweep ghost; more reads as a windmill. **Cone-shaped sources are streamlines + a mouth ring** (`ringPts`), never one tapered ribbon (radio dashes scale with `uLen = length / width` and turn to confetti).
- **Growing structures store a node table** (air showers: `nd` rows `{ n, az, el, j, a, b, lv, w }`, lerped from the parent's current point by `f = clamp((g - a) / (b - a))`; `chain` drives the X-ray shaft).
- **Keep the ends of the timeline dense** but filler events short-lived (sun dogs, zodiacal scatter, green flash, gulls early; noctilucent clouds, moon halo, fire whirl, fireworks late).
- **Tuning**: rendered brightness per band = `GAIN`; meter tops = `METER_NORM` (scenario `meterNorm` overrides; the city raises micro/vis/ir). The sun stays small/dim via `sunEl()`, low `mieCoefficient`, bloom threshold `.9`.

## Verifying visually

`uv run spectra shot` finds the Playwright-cached `chrome-headless-shell` under `~/.cache/ms-playwright/` (or `$SPECTRA_CHROME`) and renders with SwiftShader — slow (~30 s), but it compiles every shader. Check several moments (`-t 5`, `30`, `54`) and an instrument view (`--bands ir,micro`). Drag-to-look can't be exercised; use `--yaw/--pitch`. Write screenshots to the scratchpad, not the repo (`shots/` is git-ignored).
