---
id: M1/T6
title: Apply to the city
status: backlog
labels: []
started:
completed:
---

# M1/T6 — Apply to the city

## Goal

**Apply to the city.** Asphalt (warm, slow), sidewalks, park lawn (cools fast, dew), building facades
(`Tcore` per instance → heat leaks around windows, warm roofs with HVAC), glass (reflects cold sky in IR).
Removes the hard-coded `BUILD.heat` look in favour of the shared chunk.

## Plan

files: scenarios/city/world.js, engine/render/surface.js

- Migrated from plan step 1.6; the Goal is the step text verbatim.

## Acceptance

- [ ] Asphalt (warm, slow), sidewalks, park lawn (cools fast) and facades use surface presets; the hard-coded `BUILD.heat` look is gone
- [ ] Facades leak heat around windows / warm roofs (per-instance warmth or a documented stand-in for `Tcore`)
- [ ] Glass reflects the cold sky in IR at grazing angles
- [ ] `spectra timeline city`: 0 warnings, draw calls noted against the last Outcome
- [ ] `spectra shot city` at -t 5 / 30 / 54 and `--bands ir,micro`: exit 0, images inspected

## Notes

*2026-11-21:* partly done on main in 519656e ("City facades: per-building interior heat Tcore drives the IR leaks"): an `aTcore` instance attribute on the building InstancedMesh (hash, not `R`), thermal-bridge frames/lintels, panes mirroring the cold sky, warm roofs. Asphalt, sidewalks, lawn and the `BUILD.heat` removal still to verify against the Acceptance.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
