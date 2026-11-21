---
name: new-scenario
description: Scaffold a new spectra_visualizer scenario under scenarios/<id>/ (index.html, main.js, world.js, events.js) from an existing one, wire the shared sky library, apply spectral surfaces, and verify it renders and bundles. Use for "add a scenario/scene/location".
argument-hint: "<id> <one-line description of the place>"
disable-model-invocation: true
---

# new-scenario — a new place under the same sky

Arguments: `$ARGUMENTS`. A new scenario is the **large** lane of `.claude/sdlc.md`: plan mode first.

## Steps

1. **Plan** (plan mode): the place, the camera walk, which shared sky events fit (city-like light pollution drops
   aurora/Milky Way), 3–6 local events with their `SPECTRUM` processes, surface presets for the ground and props.
   Get the user's approval. Consider adding it as a plan phase.
2. **Copy** `scenarios/seaside/` → `scenarios/<id>/`. In `index.html` change `<title>Spectra · Name</title>` and
   `<meta name="description">`; keep the import map (`spectra/` → engine).
3. **`world.js`**: terrain (heightfield or flat `gridMat`), props via `solid(mesh, instrMat?)`, visible-only sprites
   via `visOnly()`, spectral surfaces from `engine/render/surface.js` presets; return `{ walk(t, camera),
   groundAt(x, z), update(t) }`. Camera faces west (az 270). Merge/instance static scenery.
4. **`main.js`**: `run({ title, loading, hint, atmosphere: { lightPollution, cloudCover }, fog, meterNorm, build,
   events })`; `events()` = shared `sky.*` factories + local ones (`/new-event`).
5. **Verify**: `uv run spectra list` shows it; `/verify-scene <id>` (timeline 0 warnings, draw calls noted, shots
   at 5/30/54 + instrument view); `uv run spectra build <id>` produces `dist/<id>.html` and the regenerated root
   `index.html` links the new scenario.
6. Update README's scenario table; review and `/ship`.

## Related

- README § "Adding a scenario", § "The scenario contract"; `.claude/rules/sky-world.md`, `.claude/rules/render.md`.
