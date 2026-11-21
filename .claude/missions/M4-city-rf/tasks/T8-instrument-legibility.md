---
id: M4/T8
title: Instrument view: microwave surface crackle buries the IR heat leaks
status: backlog
labels: [gap]
started:
completed:
---

# M4/T8 — Instrument view: microwave surface crackle buries the IR heat leaks

## Goal

In the instrument view with IR and microwave on together (`--bands ir,micro`, the Thermal preset's neighbour), the
IR heat leaks around windows, the warm roofs, asphalt and the people stay legible: today the microwave surface
crackle covers nearly every facade and the street in an orange checkerboard. Each band should still read on its
own (`--bands micro` keeps its crackle; `--bands ir` its thermal palette), and the two combined should layer, not
bury one another. Same check on the trail and seaside, which use the same surface chunk.

## Plan

files: engine/render/surface.js, scenarios/city/world.js

- Measure first: shots `--bands ir`, `--bands micro`, `--bands ir,micro` at t 30 in all three scenarios.
- Tone the microwave surface term when IR is also on (lower coverage / contrast of the crackle, or blend so the
  thermal palette wins on surfaces while micro emitters stay bright) — in the shared chunk, not per scenario.
- Keep the microwave meter share unchanged (meters are tuned in a48e444).

## Acceptance

- [ ] `spectra timeline`: 0 warnings in Orbit and Ground for all three scenarios, draw calls unchanged
- [ ] `spectra shot city -t 30 --bands ir,micro`: window-frame heat leaks and warm roofs are clearly visible
- [ ] `--bands micro` alone and `--bands ir` alone look as before (city, trail, seaside at t 30)
- [ ] Trail and seaside `--bands ir,micro` at t 30 inspected: no regression

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
