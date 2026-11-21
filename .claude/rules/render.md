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
   isn't `set()`.
2. **Crowds use `EmField(band, n, color, real)`** (one instanced draw call; `set(i, pos, size, I)`, `color(i, c)`),
   not hundreds of `Em`s. Merge static scenery (`mergeGeometries`) or instance it; watch draw calls in
   `spectra timeline` — compare against the last progress note's numbers.
3. **`real = 1` picks the realistic IR style** (tight, low-contrast rising heat, no false-colour rings) for moving warm
   bodies: deer `Rib('ir', null, 4, 1)` + head `Em('ir', null, 1)`, bats, gulls, airliner/ship/car exhausts. Static
   hot sources keep the thermal palette.
4. **Instrument view** (Visible off): `solid(obj, instrMat?)` registers solids (default dark material); `visOnly()`
   for sprites that exist only in visible light. Terrain uses `topoMat` (contours) or `gridMat(cell)` for flat ground;
   both have `uWarm` for an IR heat glow near the viewer.
5. **Per-instance values passed to fragment shaders must be `flat varying`** — interpolated seeds + hashes = pixel
   noise.
6. **Pulsar has two opposite arms**, each with one faded sweep ghost; more reads as a windmill.
7. **Cone-shaped sources are streamlines + a mouth ring** (`ringPts`), never one tapered ribbon — radio dashes scale
   with `uLen = length / width` and turn to confetti.
8. **Surfaces take their physics from `PRESET`s in `engine/render/surface.js`**, packed as
   `A = [T0, Teq, 1/tau, eIR]`, `B = [eMW, uvAlb, gamma, rRadio]`, `C = [gloss]`. Add or tune a preset there (with
   its source in a comment) rather than per-mesh literals.
9. **`Math.random` only for visual-only jitter** (shader `uSeed`, `EmField` `iSeed`, a flash flicker) — never for
   anything that places, sizes or times a thing: that comes from the seeded `R` so scrubbing repeats.

## Tuning

Rendered brightness per band = `GAIN`; meter tops = `METER_NORM` (both `engine/core/bands.js`; scenario `meterNorm`
overrides; the city raises micro/vis/ir). The sun stays small/dim via `sunEl()`, low `mieCoefficient`, bloom
threshold `.9`.

## Non-derivable facts

- Shader compile errors only surface at render time: `uv run spectra shot` prints the compile log and exits 1. A
  shader path behind a band that is off at the chosen moment is not compiled — shoot with `--bands` covering it.
- Surface overlay with Visible on is a fixed `OVERLAY = .12` (plan Q3); there is no HUD slider yet.
- Draw-call budget for the city: < ~400 (plan 4.6).
