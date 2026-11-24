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
(`?eye=0`). **Band looks are physical in the eye (M11):** every source looks like what a camera in its band records —
the stylised band symbols (rings, dashes, crackle, rays, scanlines, starburst) exist only in the old view, behind the
shared uniform `uPhys` (sources.js `PHYS`, 1 while `S.eye`; shaders.js header).

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
   bodies without surfaces of their own — bats, gulls, swifts, rooftop guests, airliner / ship / car exhausts, breath.
   **A body built from parts (rule 13) is its own thermal emitter:** its body-heat glow stays for the meters but is
   not seen in the eye — pass `see = 0` (`set(…, I, 0)`; Rib: `set(pts, w0, w1, I, fade, 0)`), as the deer, cows,
   walkers, scooter riders, bonfire people and car engines do (M11/T6). Static hot sources keep the thermal palette.
4. **Instrument view** (Visible off): `solid(obj, instrMat?)` registers solids (default dark material); `visOnly()`
   for sprites that exist only in visible light. Terrain, ground and buildings go through `spectral(mesh, preset,
   { lines: 'topo' | 'grid', … })` (engine/render/surface.js): the surface presets give the per-band look in the
   instrument view and the faint overlay with Visible on (M1). The older `topoMat` / `gridMat` / `uWarm` in
   engine/render/instrument.js are no longer used by any scenario — don't build on them.
5. **Per-instance values passed to fragment shaders must be `flat varying`** — interpolated seeds + hashes = pixel
   noise.
6. **Emitters are physical (M11).** A point source is one compact glow (shaders.js `srcPSF`; the eye adds the band's
   diffraction, photon grain and speckle) and a path one smooth line (`srcLine`) — no pattern or motion of its own;
   brightness changes only where the physics does (a flash, a blink, a rotating beam). An antenna's pattern goes
   through `set()`'s last argument **`see`**, the gain toward the viewer from `BEAM` (sources.js: `dipole`, `array`,
   `sector(s)`, `dish`, `sweep` — cited there) with the angles from `toViewer(p)`; `see` scales only what the eye
   draws, never the meters, and `see = 0` means metered, not seen. Beams, fans and rays through clear air are not
   drawn in the eye (air does not scatter radio, microwave or a 905 nm LiDAR back: the airport radar, the LiDAR robot);
   only what they light (surfaces, a racon, clutter) shows. Deep-sky objects show their real morphology at its true
   angular size (the Vela remnant, W50 — never beam cones or pulsar arms); a magnified or sped-up part is tagged
   `stylised` / `time-compressed`.
7. **Infrared is a fused goggle (M11/T3):** output 1's IR = thermal 8–14 µm, output 2's IR slot = **near-IR**
   (0.7–1.4 µm, an image intensifier). Sources split by the event's spectral position in IR (smoothstep 3 → 1 µm; the
   position is the mean of the event's IR processes, sources.js `specPos`). Surfaces add near-IR by reflection only
   (`surfNIR`: nirAlb × (sky hemisphere + Moon + near-IR lamps)); a custom surface defines `#define EYE_NIR` with
   `float eyeNIR()` in its hook (the sea, the valley fog, the night sky — without it it is black in near-IR). Lamps
   that light the ground in near-IR register `addTx('nir', () => ({ p, power }))` (power at 1 m in scene light units:
   the city's sodium lamps, the 850 nm camera rings). The near-IR sky (`skyNIR`, airglow + twilight) and every other
   band sky are ONE table, `BAND_SKY` / `BAND_SKY_GLSL` in `engine/world/atmosphere.js`, injected into the sky hook and
   the surfaces' reflections — don't copy the formulas.
8. **Surfaces take their physics from `PRESET`s in `engine/render/surface.js`**, packed as
   `A = [T0, Teq, 1/tau, eIR]`, `B = [eMW, uvAlb, gamma, rRadio]`, `C = [gloss, Tradio, Tmicro, Tgamma]` (rule 12; `P(...)` builds a row;
   `tau = 0` means no cooling) and **`D = [h, nirAlb, R0opt, slope]`** (M11/T2: sub-facet rms height in m, near-IR
   albedo, normal-incidence optical Fresnel reflectance, rms unresolved slope in rad — the `REFL` table; `DEF_D` when
   absent; `'attr'` surfaces need a per-vertex `aSurfD`, `collectSurfD`). **Reflection (eye only):** every band
   reflects its illuminators by Kirchhoff (e = 1 − R): radio R0 = `B.w`, microwave 1 − eMW, thermal 1 − eIR, UV
   `D.z`, Schlick angle law, Beckmann specular fraction from `h`/λ, transmitter mirror images flux-conserving with
   width 2·`slope` (surface.js header REFLECTION). Add or tune a preset there rather than per-mesh literals. **Every value cites a source
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
13. **Animals, people and vehicles are built from parts** (M11/T4): `partsGeometry([{ g, surf, col, at, rot, s } |
    { from, to, r0, r1, surf, col }])` merges the parts into one geometry with a vertex colour and per-vertex
    `aSurfA/B/C/D` per part (one draw, instanced or not; the material needs `vertexColors: true`, an instance colour
    multiplies it), drawn by `spectralParts(mesh, opts)`. Parts presets: `skin`, `limb`, `fur`, `coat`, `glass`, `tyre`,
    `engine`, `exhaust` (cited in surface.js); the city builders (walker, cyclist, scooter, car, bus) live in
    `scenarios/city/street.js` — reuse `carGeo` rather than a box (the parked cars swap the running parts for cooling
    ones per vertex, world.js `parkedCarGeo`). There is no single warm `body` preset any more.

## Tuning

**The eye has no per-band gains.** Brightness on screen comes from the shared receptor model (`EYE` in compose.js:
key, partial-adaptation exponent p, floor; `LREF` in bands.js — one operating point for all bands, the measured
per-band alternatives are recorded there and rejected), apertures (`APERTURE`), air (`EXTINCTION`, `XCOM_AIR`,
`UV_PATH` — luminance units, = `UV_SURF_K` × lum(`UV_COL`), bands.js) and the photon constant. Don't tune a band's look by changing a source's intensity: intensities are the
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
