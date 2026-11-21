# Spectra Visualizer

First-person 3D scenes that play a two-minute timelapse from sunset into the night. Events in them emit across the whole electromagnetic spectrum: radio, microwave, infrared, visible, ultraviolet, X-ray and gamma. Wavelengths outside visible light get stylised "instrument" looks. You can filter bands live to see what your eyes would miss.

One shared **engine** handles band shaders, emitters, sky, atmosphere, HUD and the loop. Each **scenario** supplies its own world and local events, and pulls the sky events from a shared library.

| Scenario | What happens |
|---|---|
| `trail` (Mountain trail) | Walk ~80 m along an alpine trail: a hut, a deer on a thermal camera, fireflies, bats, a campfire. |
| `seaside` (Seaside) | Stand on a west-facing beach. The Sun sets into the sea (with a green flash), a lighthouse sweeps the bay, a container ship crosses the horizon, the surf glows. |
| `city` (City) | Walk out of a street canyon into a park. Traffic, sodium street lamps, Wi-Fi, a 5G mast and fireworks under a light-polluted sky. |

All three share the sky: sunset, Venus, an airliner, the Milky Way and CMB, meteors, a pulsar, a comet, satellites, a black-hole binary, aurora, moonrise, cosmic-ray air showers, a thunderstorm, a fast radio burst, a supernova and a gamma-ray burst.

## Quick start

You need [uv](https://docs.astral.sh/uv/), a WebGL browser and a network connection (three.js loads from a CDN).

```bash
uv run spectra serve            # http://127.0.0.1:8000 — landing page linking every scenario
uv run spectra build            # dist/<scenario>.html: single self-contained files, open from disk
uv run spectra shot city -t 54  # headless screenshot at script time 54, reports JS/shader errors
uv run spectra list             # scenarios found under scenarios/
```

The source pages use ES modules, and browsers refuse to load those over `file://`. Either serve the repo (`spectra serve`) or open the bundled files in `dist/`.

### Controls

Drag to look around a quarter sphere ahead (you can't turn behind yourself), and scroll to zoom. Click a band or press **1–7** to filter it. The presets (Human eye, Thermal, Radio telescope…) switch groups of bands. **Space** plays and pauses, and the slider scrubs. With Visible switched off, the scene turns into a dark detector display.

### URL parameters

Any scenario page accepts `?t=30&yaw=0.3&pitch=0.5&bands=ir,micro&paused&labels=0`:

- `t`: script time 0–60.
- `yaw`: ±1.35 rad, positive looks left.
- `pitch`: −0.1…1.5 rad.
- `bands`: which bands to keep on.

`spectra shot` drives these parameters for screenshots.

## Project layout

```
engine/                  the runtime, shared by every scenario (plain ES modules, no build)
  app.js                 run(scenario): renderer, bloom, HUD, URL params, the frame loop
  core/                  util (maths, seeded rng, noise, keyframes) · state (shared S) · bands
                         (BANDS, presets, GAIN, meter tops) · geom (sky directions) · events (contract)
  render/                shaders (band GLSL) · sources (Em point / Rib ribbon emitters)
                         instrument (dark detector view, topo/grid materials) · textures
  world/                 atmosphere (sky, stars, clouds, lights, sunset→night timeline) · heightfield
  events/                sky.js (shared sky/weather event library) · observer.js (your phone, headlamp)
  ui/                    style.css · hud.js (controls, meters, panel, labels) · landing.html
scenarios/<id>/          one folder per scene
  index.html             page shell: title, description, import map (`spectra/` → engine)
  main.js                the scenario object: UI text, atmosphere options, build(), events()
  world.js               terrain, props, camera walk, ground height
  events.js              events that only make sense in this place
src/spectra_tools/       Python tooling (cyclopts CLI): scenario discovery, bundler, dev server, screenshots
dist/                    build output (git-ignored)
```

### Why JavaScript at runtime and Python for tooling

Everything per-frame has to run in the browser, 60 times a second, reacting to drags and band filters. That covers the shaders, the emitters and the event timelines, so the runtime stays in JavaScript. Python handles everything around it:

- Discovering scenarios.
- Bundling each one into a single offline-openable HTML file. Each module becomes a `data:` URL in the page's import map, so no JS bundler or Node is needed.
- Serving the repo.
- Rendering headless screenshots that surface JS and shader errors.

## How it fits together

### The scenario contract

```js
run({
  title, loading, hint,                       // UI text
  atmosphere: { lightPollution, cloudCover }, // optional
  fog, meterNorm,                             // optional
  build()  { /* add meshes */ return { walk(t, camera), groundAt(x, z), update(t) }; },
  events() { return [sky.sunset(), local.lighthouse(), ...]; },   // init() runs in list order
});
```

### The event contract

An event is one object that holds both its panel metadata and its drawing:

```js
event({ name, t0, t1, bands: ['vis', 'ir'], note,
  init()   { this.e = new Em('ir'); },                       // build once
  update() { this.e.set(pos, size, intensity); },            // every frame; only set() what is visible
  where()  { return this.p; } })                             // label position, or null
```

- **Timing.** `t0`/`t1` are on a 0–60 script axis. Playback runs at half speed, so a walk lasts 120 s.
- **Emitters.** Every band effect goes through `Em` (camera-facing glow) or `Rib` (camera-facing ribbon along points). `set()` feeds the band meters and respects the filter.
- **Shared events.** Library events are factories that take overrides, e.g. `sky.thunderstorm({ note: '…', az: 190 })`.

### Adding a scenario

1. Copy `scenarios/seaside/` to `scenarios/<id>/`, then change the `<title>` (`Spectra · Name`) and the `<meta name="description">`.
2. Write `world.js`: build the meshes, wrapping solids in `solid(mesh, instrumentMaterial?)` and visible-only sprites in `visOnly()`. Return `walk` and `groundAt`.
3. Compose `events()` from `engine/events/sky.js`, plus your own in `events.js`.
4. Run `uv run spectra shot <id> -t 30` to check for errors, then `uv run spectra build`. The landing page picks the new scenario up automatically.

### Conventions worth knowing

- **Front is west.** Front is azimuth 270, and the view is clamped to yaw ±1.35, pitch −0.1…1.5. Keep sky objects within roughly azimuth 205–340 and above the horizon.
- **Seeded randomness.** Random layout uses the seeded `R` stream, never `Math.random`, so scrubbing repeats identically.
- **One timeline for every scenario.** The sunset-to-night timeline (sun path, colour keyframes, moonrise) lives in `engine/world/atmosphere.js` and is shared, so library sky events line up everywhere.
- **Brightness and meters are tuned separately.** Rendered brightness per band is `GAIN` in `engine/core/bands.js`. Meter scaling is `METER_NORM` there, overridable per scenario.

## License

Not yet specified.
