---
paths:
  - "engine/render/**"
  - "engine/app.js"
  - "engine/events/**"
  - "scenarios/*/world.js"
  - "scenarios/*/events.js"
  - "scenarios/*/rf.js"
---

# Rendering — band shaders, emitters, instrument view, surfaces

How anything that glows in a band gets drawn. Band looks are GLSL in `engine/render/shaders.js`;
emitters in `engine/render/sources.js`; the dark detector view in `engine/render/instrument.js`;
spectral surfaces (the landscape itself per band) in `engine/render/surface.js`.

## Guardrails

1. **Band effects live in GLSL, not JS** (`engine/render/shaders.js`). `bandMat(band, color, ribbon, real)`;
   `Em` (camera-facing glow quad) and `Rib` (camera-facing ribbon along world points) in `engine/render/sources.js`.
   `set()` adds to `S.act[band]` (meters) and hides the mesh when the band is filtered off. **New spectral sources use
   `Em`/`Rib`, never hand-drawn meshes.** The loop hides every source before updates, so an invisible source simply
   isn't `set()`. The optional last constructor argument is the source's **`origin`**: `'ground'` (default),
   `'high'` (inside the atmosphere above the absorbing layers: meteors, aurora, air-shower secondaries) or `'space'`.
   In Ground detector mode `absorbed(band, origin)` (`TRANSMIT[band][origin]` in `engine/core/bands.js` is 0 for
   uv/xray/gamma from high/space) makes `set()` draw nothing, add no meter activity and leave a ghost marker (one per
   event, `S.ghosts`, drawn by `engine/ui/hud.js` with `ABSORB_AT`'s altitude). The origin must match the event's
   `freq`: in Ground mode `spectra timeline` warns when a band whose processes are all `ground: false` is still drawn
   (mark the source `'high'`/`'space'`) and when a band whose processes reach the ground is hidden.
2. **Crowds use `EmField(band, n, color, real, origin)`** (one instanced draw call; `set(i, pos, size, I)`,
   `color(i, c)`; slots not `set()` this frame stay hidden), not hundreds of `Em`s. Merge static scenery
   (`mergeGeometries`) or instance it; watch draw calls in `spectra timeline` (t 5/30/55) against the baseline
   recorded before the task — the task's Outcome states before → after.
3. **`real = 1` picks the realistic IR style** (tight, low-contrast rising heat, no false-colour rings) for moving warm
   bodies: deer `Rib('ir', null, 4, 1)` + head `Em('ir', null, 1)`, bats, gulls, airliner/ship/car exhausts. Static
   hot sources keep the thermal palette.
4. **Instrument view** (Visible off): `solid(obj, instrMat?)` registers solids (default dark material); `visOnly()`
   for sprites that exist only in visible light. Terrain, ground and buildings go through `spectral(mesh, preset,
   { lines: 'topo' | 'grid', … })` (engine/render/surface.js): the surface presets give the per-band look in the
   instrument view and the faint overlay with Visible on (M1). The older `topoMat` / `gridMat` / `uWarm` in
   engine/render/instrument.js are no longer used by any scenario — don't build on them.
5. **Per-instance values passed to fragment shaders must be `flat varying`** — interpolated seeds + hashes = pixel
   noise.
6. **Pulsar has two opposite arms**, each with one faded sweep ghost; more reads as a windmill.
7. **Cone-shaped sources are streamlines + a mouth ring** (`ringPts`), never one tapered ribbon — radio dashes scale
   with `uLen = length / width` and turn to confetti.
8. **Surfaces take their physics from `PRESET`s in `engine/render/surface.js`**, packed as
   `A = [T0, Teq, 1/tau, eIR]`, `B = [eMW, uvAlb, gamma, rRadio]`, `C = [gloss, 0, 0, 0]` (`P(...)` builds a row;
   `tau = 0` means no cooling). Add or tune a preset there rather than per-mesh literals. **Every value cites a source
   by the keys in the header above `PRESET`** (`[Sal]`, `[EL]`, `[MOD]`, `[UMF]`, `[FG]`, `[WHO]`, `[UN]`, `[RP112]`,
   `[Oke]`, or a named paper) **or says STAND-IN** (M7/T4); `T0`/`Teq`/`tau` are stand-ins whose order follows the
   thermal admittance in [Oke]. Scenario-local tables (`SURF` in `scenarios/seaside/world.js`, the city's local
   presets in `scenarios/city/world.js`) follow the same shape and keys. `spectral(mesh, props, opts)` takes a preset
   name, an `{A,B,C}` (`mixSurf` blends) or `'attr'` (per-vertex `aSurfA/B/C`, pass `opts.mean` for the meters);
   `opts.weight` is the surface's meter share — the meters use the shader's formulas (`updateSurfaces`).
9. **`Math.random` only for visual-only jitter** (shader `uSeed`, `EmField` `iSeed`, a flash flicker) — never for
   anything that places, sizes or times a thing: that comes from the seeded `R` so scrubbing repeats.

## Tuning

Rendered brightness per band = `GAIN` (sources only); meter tops = `METER_NORM` (both `engine/core/bands.js`;
scenario `meterNorm` overrides: the city raises micro/ir/vis, the seaside micro). **Rule (M7/T1): each meter bar
(`1 - exp(-act/norm)`) peaks at ~0.9–0.97 in its busiest scenario and stays above 0.9 for only a few script
seconds** — check the peak and `>0.9` columns of `spectra timeline` after any change to sources, surfaces or
`GAIN`. Gamma is burst-driven, so its quiet baseline sits low on purpose. The sun stays small/dim via `sunEl()`, low
`mieCoefficient`, bloom threshold `.9`.

## Non-derivable facts

- Shader compile errors only surface at render time: `uv run spectra shot` prints the compile log and exits 1. A
  shader path behind a band that is off at the chosen moment is not compiled — shoot with `--bands` covering it.
- Surface overlay with Visible on is a fixed `OVERLAY = .12` (decision in mission M1); there is no HUD slider yet.
- Draw-call budget for the city: < ~400 (mission M4/T6).
