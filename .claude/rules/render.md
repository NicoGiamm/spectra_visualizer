---
paths:
  - "engine/render/**"
  - "engine/app.js"
  - "engine/events/**"
  - "scenarios/*/world.js"
  - "scenarios/*/events.js"
  - "scenarios/*/rf.js"
---

# Rendering — the spectral eye, band shaders, emitters, surfaces

How anything that glows in a band gets drawn and seen. **The view is the spectral eye** (`engine/render/compose.js`,
M10): one multi-output scene pass, per-band receptor adaptation, diffraction, photon grain / speckle, air and matter
per band, band skies, asinh combine — its header holds every formula and citation. Band looks are GLSL in
`engine/render/shaders.js`; emitters in `engine/render/sources.js`; spectral surfaces (the landscape itself per band)
in `engine/render/surface.js`; the dark detector view (`engine/render/instrument.js`) exists only in the old view
(`?eye=0`).

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
   `A = [T0, Teq, 1/tau, eIR]`, `B = [eMW, uvAlb, gamma, rRadio]`, `C = [gloss, Tradio, Tmicro, Tgamma]` (rule 12; `P(...)` builds a row;
   `tau = 0` means no cooling). Add or tune a preset there rather than per-mesh literals. **Every value cites a source
   by the keys in the header above `PRESET`** (`[Sal]`, `[EL]`, `[MOD]`, `[UMF]`, `[FG]`, `[WHO]`, `[UN]`, `[RP112]`,
   `[Oke]`, or a named paper) **or says STAND-IN** (M7/T4); `T0`/`Teq`/`tau` are stand-ins whose order follows the
   thermal admittance in [Oke]. Scenario-local tables (`SURF` in `scenarios/seaside/world.js`, the city's local
   presets in `scenarios/city/world.js`) follow the same shape and keys. `spectral(mesh, props, opts)` takes a preset
   name, an `{A,B,C}` (`mixSurf` blends) or `'attr'` (per-vertex `aSurfA/B/C`, pass `opts.mean` for the meters);
   `opts.weight` is the surface's meter share — the meters use the shader's formulas (`updateSurfaces`).
9. **`Math.random` only for visual-only jitter** (shader `uSeed`, `EmField` `iSeed`, a flash flicker) — never for
   anything that places, sizes or times a thing: that comes from the seeded `R` so scrubbing repeats.
10. **Every material in the scene is patched by the eye** (`compose.js` `patch`): its `main()` is renamed and wrapped to
    write the band outputs. So a fragment shader needs a `void main()`, and **no shader outside the eye's own code
    (compose.js, the surface hooks) may declare identifiers starting with `eye`** (the wrapper's namespace: a table named `eyeMU` once collided with the UV mask). Sources route by their
    `uBand`; a surface made with `spectral()` gets its band hook from `eyeBandsGLSL`; **a custom `ShaderMaterial`
    surface needs its own `material.userData.eyeBands`** (`void eyeBands(out vec4 o1, out vec4 o3)`: o1 = (IR, UV,
    gamma, coverage), o3 = (radio, micro, X-ray, coverage) as luminance; the wrapper then stores gamma with the long
    waves so fog doesn't hide it; see the sea, the trail mist, the night sky).
    Any other material writes nothing in the bands: black if opaque (it occludes), nothing if transparent.
11. **Surface band switches are macros** (`#define uSOnR (uSOnR_*eyeMR)`): read them as `uSOnR`…, set the uniforms as
    `SURF_U.uSOnR_`…; stylised random terms (speckle, crackle) take `mix(stylised, expectedValue, eyeSmooth)` so the eye
    sees the mean and adds the real statistics itself.
12. **Transparency per band** lives in `C.yzw` = [Tradio, Tmicro, Tgamma] (surface.js `TRANS`, cited; ground has a .05
    radio diffraction leak); a transparent medium covers the optical outputs with its alpha (the mist hides IR, not radio).

## Tuning

**The eye has no per-band gains.** Brightness on screen comes from the shared receptor model (`EYE` in compose.js:
key, partial-adaptation exponent p, floor; `LREF` in bands.js — one operating point for all bands, the measured
per-band alternatives are recorded there and rejected), apertures (`APERTURE`), air (`EXTINCTION`, `XCOM_AIR`,
`UV_PATH`) and the photon constant. Don't tune a band's look by changing a source's intensity: intensities are the
physics within the band. `spectra timeline` prints each band's **share of the displayed luminance** at t 20 / 40 —
check it after changes that affect what is seen.

The old view (`?eye=0`) keeps `GAIN` (sources) and `OVERLAY`. Meter tops = `METER_NORM` (bands.js; scenario
`meterNorm` overrides): **each meter bar (`1 - exp(-act/norm)`) peaks at ~0.9–0.97 in its busiest scenario and stays
above 0.9 for only a few script seconds** (M7/T1) — the meters are independent of the eye. The sun stays small/dim
via `sunEl()`, low `mieCoefficient`, bloom threshold `.9`.

## Non-derivable facts

- Shader compile errors only surface at render time: `uv run spectra shot` prints the compile log and exits 1. A
  shader path behind a band that is off at the chosen moment is not compiled — shoot with `--bands` covering it.
- Old view only: surface overlay with Visible on is a fixed `OVERLAY = .12` (decision in mission M1).
- Draw-call budget for the city: < ~400, whole frame including the eye's passes (mission M4/T6; ~336 after M10).
- A synchronous `readPixels` / `readRenderTargetPixels` logs "GPU stall due to ReadPixels" in headless Chrome, which
  fails `spectra timeline` / `shot`: read back asynchronously (compose.js `readAsync`: pixel-pack buffer + fence) —
  `?eyedbg` / `?eyeratio` are debug readouts that do stall.
- Debug switches: `?eyedbg` (adaptation per band), `?eyeratio&bands=<b>` (within-band ratio check), `?eatm=0` (no air),
  `?epen=0|only|glass` (penetration pass off / only what crossed matter / every occluder transparent).
- No MSAA on the eye's outputs (memory); FXAA instead.
