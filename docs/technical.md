# Spectra Visualizer — technical notes

How the scenes are built and run: controls, the rendering model, the physics tables, the tooling and the
contracts for writing scenes and events. The front page is the [README](../README.md).

## Scenes

| Scene | Where you are |
|---|---|
| **Mountain trail** | Walking ~80 m along an alpine trail: a hut, a deer on a thermal camera, cows, fireflies, bats, a campfire, distant hikers' headlamps, a valley cell mast. |
| **Seaside** | On a west-facing beach. The Sun sets into the sea (with a green flash), the sand and the sea swap places in infrared, a lighthouse sweeps the bay, a container ship's radar paints the cliffs, sea mist rolls in. |
| **City** | Out of a street canyon into a park: traffic, pedestrians with phones, Wi-Fi and 5G with multipath reflections, a tram arcing, LiDAR delivery robots, security cameras with near-IR illuminators, fireworks under a light-polluted sky. |

All three share one sky: sunset and twilight, Venus, an airliner, satellites, the Milky Way and the cosmic
microwave background, meteors, a pulsar, a comet, aurora, a setting waxing Moon and halos, cosmic-ray air showers, a
thunderstorm, a fast radio burst, a supernova and a gamma-ray burst.

## Controls

| Action | How |
|---|---|
| Look around (a quarter sphere ahead) | drag, or the arrow keys |
| Zoom | scroll |
| Toggle a band | click it, or keys **1–7** (radio → gamma) |
| Band presets | *All*, *Human eye*, *Invisible only*, *Thermal*, *Radio telescope*, *High energy* |
| Play / pause, scrub | **Space**, the time slider |
| Detector | *Orbit* (default: everything drawn) or *Ground* (what is absorbed by the atmosphere is hidden behind a marker that says where and why) |
| Eye | *adapted* (default: every band has its own receptor) or *absolute* (one receptor, adapted to visible light, for every band); **Eye ⚙** opens per-band brightness sliders and a legend of what each band's brightness means (kept per browser) |

Hover an event's band chips in the side panel to see its physical processes with frequency and wavelength.
Filtering a band off removes its layer from the eye.

## Link to a moment

Every scene page accepts URL parameters, handy for sharing a view:

```
?t=30&yaw=0.3&pitch=0.5&bands=ir,micro&detector=ground&paused&labels=0
```

`t` is script time 0–60, `yaw` ±1.35 rad (positive looks left), `pitch` −0.1…1.5 rad, `bands` the bands to keep on.
`eye=absolute` starts in absolute mode; `eye=0` shows the pre-eye view (one pass, fixed per-band gains, the dark
detector display with Visible off), kept for comparison.

## How it works

The runtime is plain JavaScript ES modules on [three.js](https://threejs.org/), with no build step. A shared
**engine** provides the band shaders, emitters, sky and atmosphere, HUD and frame loop; each **scenario**
supplies its world and local events and pulls the sky events from a shared library. Python tooling (a
[cyclopts](https://github.com/BrianPugh/cyclopts) CLI run with uv) serves, bundles, screenshots and audits the
scenes.

```
engine/            the runtime shared by every scene
  core/            maths and seeded randomness, shared state, bands and presets, sky geometry,
                   the spectral process table (spectrum.js: every process's frequency / wavelength / energy)
  render/          band shaders, emitters (Em glow, Rib ribbon, EmField instanced crowds),
                   spectral surfaces (temperature, emissivity, albedo per material), instrument view
  world/           atmosphere and the sunset→night timeline, terrain, ray bouncing
  events/          the shared sky/weather event library, the observer (your phone, headlamp)
  ui/              HUD, styles, landing page template
scenarios/<id>/    one folder per scene: index.html, main.js (the scenario), world.js, events.js
src/spectra_tools/ Python tooling: discovery, bundler, dev server, headless screenshots, timeline report
```

Two layers make each band: **sources** (things that glow: a phone, a meteor, a radar sweep) and **surfaces**
(the landscape itself: sand, sea, granite, asphalt and facades each carry a temperature curve, infrared and
microwave emissivity, UV albedo, natural gamma activity and radio reflectivity, so the ground shows the spectrum
too).

### The spectral eye

`engine/render/compose.js` turns the scene into one view (its header has every formula and citation):

| Step | What happens |
|---|---|
| Layers | the scene is drawn once into several outputs: visible light, and each invisible band's emission (surfaces through a per-band hook, sources by their band); infrared fills two channels, thermal (8–14 µm) and near-IR (0.7–1.4 µm, what night-vision goggles see: moonlight, twilight and airglow reflected, lamps and IR illuminators) |
| Air | ground-level light is attenuated over its distance per band: microwave barely, IR through the 8–14 µm window, UV by Rayleigh + haze (which also glows at dusk), X-rays within metres, terrestrial gamma within ~160 m |
| Matter | radio, microwave and gamma pass through what blocks light, by each material's transmission: radio through buildings and round hills, microwave through foliage |
| Sky | every band has its own sky: galactic synchrotron in radio, a dark microwave sky with a glowing horizon (the CMB is too faint to show next to warm ground), a warm IR horizon, the near-IR twilight and OH airglow (brightest ~10° up), UV twilight and airglow, a near-black X-ray / gamma sky — one table (`BAND_SKY`, engine/world/atmosphere.js) for the sky and for what surfaces reflect |
| Adaptation | each band's receptor adapts (partly) to its own field, from one shared model with no per-band gains; night stays darker than dusk |
| Sharpness | each band is blurred by diffraction, 1.22 λ/D, for its receptor aperture (7 mm pupil, a 1 m dish for microwave, a 100 m array for radio) |
| Statistics | light is counted as photons: X-ray and gamma (few, energetic photons) flicker as single hits; coherent radio shows speckle |
| Colour | each band is one hue (shifting a little with frequency inside the band), visible keeps its colour; an asinh stretch (Lupton et al. 2004) combines them so no band washes out the others |

`spectra timeline` reports each band's share of the displayed luminance at t 20 / 40.

**Sources look physical in the eye** (M11): a point source is one compact glow and a path one smooth line, at the
band's own sharpness — the band symbols of the old view (radio rings, microwave crackle, UV rays, X-ray scanlines,
gamma starburst) are behind the `uPhys` switch and appear only with `?eye=0`. Antennas have real beam patterns: an
event passes the gain toward the viewer as `set()`'s last argument (`see`), from `BEAM` in
`engine/render/sources.js` — dipole / monopole doughnuts, stacked broadcast arrays, 3GPP sector panels, Gaussian
dishes and rotating radars that flash once per turn as their beam crosses you. A beam through clear air is not
drawn (air does not scatter it back); what it lights is. Deep-sky objects keep their true angular size and
morphology (the Vela supernova remnant, the W50 nebula around SS 433).

### Spectral surfaces

The landscape's own emission comes from the `PRESET` table in `engine/render/surface.js`: `water`, `wetSand`,
`sand`, `rock`, `snow`, `meadow`, `forest`, `canopy` (tree crowns), `dirt`, `asphalt`, `concrete`, `facade`, `wood`,
and the parts of animals, people and vehicles: `skin`, `limb`, `fur`, `coat`, `glass`, `tyre`, `engine`, `exhaust`.
Each preset packs its physics into four vectors that reach the shaders as uniforms or per-vertex attributes:

| Vector | Fields |
|---|---|
| `A` | `T0` (°C at sunset), `Teq` (°C night equilibrium), `1/tau` (cooling rate per script second), `eIR` (8–14 µm emissivity) |
| `B` | `eMW` (microwave emissivity), `uvAlb` (UV albedo), `gamma` (terrestrial activity, granite = 1), `rRadio` (radio reflectivity) |
| `C` | `gloss` (0 matte … 1 water/glass: emissivity drops at grazing angles), `Tradio`, `Tmicro`, `Tgamma` (what passes through from behind, for the eye) |
| `D` | `h` (sub-facet roughness, m), `nirAlb` (near-IR albedo: leaves and grass bright, water and asphalt dark), `R0opt` (optical Fresnel reflectance at normal incidence), `slope` (rms unresolved slope: how wide a mirror image is) |

Every value cites a source, by the short keys listed above the table (`[Sal]`, `[EL]`, `[UMF]`, `[FG]`, `[WHO]`,
`[UN]`, `[RP112]`, `[Oke]`), or is marked STAND-IN. The temperatures and cooling times are stand-ins chosen per
scene and compressed into script time; only their order follows the measured thermal admittance. Scenes can keep
their own tables in the same shape and with the same keys (the seaside's heavy-mineral sand, the city's metal and
paint).

`spectral(mesh, preset, { lines: 'topo' | 'grid', weight, … })` makes a mesh spectral. The preset is a name, an
`{A, B, C}` object (`mixSurf()` blends several) or `'attr'` for a terrain that carries its blend per vertex.
`spectralGroup()` does the same for every mesh in a group. The spectral eye reads each band from the surface
separately; in the old view (`?eye=0`) the surface layer is added faintly over the normal look with Visible on, and is
all that's left of the landscape with Visible off. Each band shows:

| Band | What the ground shows |
|---|---|
| Infrared | the radiated temperature `T(t) = Teq + (T0 − Teq)·exp(−t/tau)`: sand and meadows cool fast, rock and asphalt slowly, water barely at all (the beach's thermal crossover); wet and glossy surfaces at grazing angles mirror the cold sky |
| Microwave | brightness temperature `eMW·T + (1 − eMW)·50 K`, so calm water reads cold and land warm, lit up by microwave transmitters (routers, masts) and by short flashes where a ray hits a surface (multipath) |
| Radio | the eye: its own brightness temperature plus the reflected sky and transmitters (above); the old view: light from radio transmitters only, 1/r², Lambertian, with moving dashes |
| UV | `uvAlb` × the UV skylight left after sunset: snow and sand glow at dusk, grass doesn't |
| Gamma | emission in proportion to activity (the eye turns it into single photon hits; the old view draws a speckle): granite sparkles, the sea is almost silent |
| X-ray | nothing: the ground is dark in X-rays |

In the spectral eye every surface also **reflects** each band's light (Kirchhoff, e + R + T = 1; T is the
transmission of a thin pane or a crown, `C.yzw`): radio from
transmitters and the synchrotron sky (sea, wet ground and metal are radio mirrors), microwave from transmitters and the
cold sky (metal and calm water read cold), thermal IR the cold sky at grazing angles, UV the skylight; whether a
surface mirrors or scatters a band follows its roughness against the wavelength (Beckmann), with Schlick's Fresnel
law for the angle. In near-IR the sky itself is drawn dark (`NIR_SKY_SHOWN = 0`, a stylised choice: the real airglow sky is bright in night-vision goggles but washed the combined view out), and the surfaces are seen only by reflection: `nirAlb` × the twilight / airglow sky, the
Moon and the near-IR lamps a scene registers (`addTx('nir', …)`: the city's sodium lamps and 850 nm camera
illuminators); the sea shows the Moon's glitter path, fog glows. The real near-IR sky and Moon (Brown 1952 twilight
× a near-IR/visible ratio of .4, the OH airglow ×3.5 the visible night sky, the Moon in linear light) reach the scene
through one shared scale factor, so their ratio is the real one, and carry three.js's physical 1/π (a Lambertian
surface reads albedo·E/π, as in visible light). The Moon's glint on the sea, in near-IR and in visible light, is one
flux-conserving lobe whose width is what the sea shader's own waves leave of Cox & Munk's measured slope
(`scenarios/seaside/world.js` `SEA_WAVES`). The formulas and every reflectivity's source are in the header of
`engine/render/surface.js`.

Animals, people and vehicles are **built from parts** (`partsGeometry`, drawn with `spectralParts` in one draw call,
instanced or not): each part keeps its own preset, so a thermal camera sees warm faces, hands, eyes, udders and
thin-haired legs, insulating fur and clothes near the air's temperature, a hot bonnet, tyres and tailpipe, cold
window glass. The city's walker, cyclist, scooter, car and bus builders are in `scenarios/city/street.js`. Such a
body is its own thermal emitter: its event keeps a body-heat glow for the meters only (`see = 0` in the eye).

Surfaces also feed the band meters with the same formulas the shaders use, scaled by each surface's `weight`.

### The spectrum table

`SPECTRUM` in `engine/core/spectrum.js` lists every physical process the scenes show: a key, a name, and one of
frequency `f` (Hz), wavelength `lam` (m) or photon energy `E` (eV). The band is derived from those numbers and is
never typed by hand. `ground: false` marks a process the atmosphere absorbs before it reaches an observer on the
ground. `stylised: true` marks one that isn't real as drawn. Events list their processes as `freq: [...]` keys,
and the panel shows each one's frequency and wavelength when you hover a band chip. An event can also carry
`tags`, which the panel shows as badges: `rare`, `time-compressed`, `stylised` (and `common`).

### Detector: Orbit and Ground

**Orbit** is the default: everything is drawn, as a satellite above the atmosphere would see it. **Ground**
(the HUD button, or `?detector=ground`) shows what reaches a detector on the ground. Every source has an origin:
`'ground'` (the default, for near sources), `'high'` (emitted inside the atmosphere above the absorbing layers:
meteors, aurora, air-shower secondaries) or `'space'`. `TRANSMIT` in `engine/core/bands.js` gives the
transmission per band and origin. Far-UV, X-rays and gamma rays from `'high'` or `'space'` don't get through. In
Ground mode such a source isn't drawn and adds nothing to the meters. Instead it leaves a dashed **ghost marker**
at its position, labelled with what was absorbed and at what altitude (e.g. "X-ray absorbed ~40 km"), and the
panel says which of the event's bands are absorbed and why.

### The tooling

```bash
uv run spectra list                   # scenes found under scenarios/
uv run spectra serve                  # dev server + landing page
uv run spectra build [ids…]           # dist/<id>.html single files
uv run spectra shot city -t 54 \
    --bands ir,micro -o city.png      # headless screenshot; exits non-zero on any JS or shader error
uv run spectra timeline city          # event gantt, per-band activity, draw calls, and a physics check
```

Python code is formatted and linted with [ruff](https://docs.astral.sh/ruff/) and type-checked with
[ty](https://docs.astral.sh/ty/): `uv run ruff format . && uv run ruff check . && uv run ty check`.

`spectra timeline` runs a scene headless over the 0–60 script and prints:

- an event gantt with each event's bands;
- per-band meter fill (`1 − exp(−activity / norm)`, as the HUD draws it), with its typical value, its peak and the
  script seconds it spends above 0.9;
- draw calls of the whole frame at t = 5, 30 and 55;
- each band's share of the displayed luminance in the spectral eye at t = 20 and 40;
- a physics check: every event's declared bands must match the bands of the processes it lists and the bands it
  actually draws. The check runs in Orbit mode and again in Ground mode, where an absorbed band drawn from the
  ground is also flagged.

There is no conventional test suite: the timeline check (kept at 0 warnings) and headless screenshots are the
tests.

### Writing a scene or an event

A scenario is one object:

```js
run({
  title, loading, hint,                       // UI text
  atmosphere: { lightPollution, cloudCover }, // optional
  fog, meterNorm,                             // optional
  build()  { /* add meshes */ return { walk(t, camera), groundAt(x, z), update(t) }; },
  events() { return [sky.sunset(), local.lighthouse(), ...]; },
});
```

An event holds its panel metadata, its physics and its drawing:

```js
event({ name: 'Gulls heading home', t0: 0, t1: 20, bands: ['ir', 'vis'], freq: ['thermal310', 'sunlight'], note: '…',
  init()   { this.e = new Em('ir'); },                  // build once
  update() { this.e.set(pos, size, intensity); },       // every frame; only set() what is visible
  where()  { return this.p; } })                        // label position, or null
```

Event times are on a 0–60 script axis; playback runs at one even pace (half a script-second per second, 2 minutes per walk).
Physical processes (`freq`) are keys of `engine/core/spectrum.js`, where each one carries its frequency or
wavelength and the band is derived from it. To add a scene, copy `scenarios/seaside/`, write its `world.js` and
compose `events()` from the shared library plus your own; the landing page picks it up automatically.

A few conventions keep the scenes consistent: the view always faces west (where the Sun sets), randomness is
seeded so scrubbing replays identically, and glowing things always go through the `Em` / `Rib` / `EmField`
emitters so band filtering and the meters work everywhere.
