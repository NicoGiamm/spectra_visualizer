---
id: M5/T1
title: Sea in every band
status: backlog
labels: []
started:
completed:
---

# M5/T1 — Sea in every band

## Goal

**Sea in every band.** (built on 1.5): IR thermal crossover; microwave cold sea + warm foam; radio
**sea-interferometer** effect — sky radio sources (pulsar, Milky Way centre, the Sun at the start) get a mirrored
copy on the sea surface that interferes as they move (historical cliff radio astronomy); UV glitter fades early.

## Plan

files: scenarios/seaside/world.js

- Migrated from plan step 5.1; the Goal is the step text verbatim.

## Acceptance

- [x] IR thermal crossover, microwave cold sea + warm foam, UV glitter fading early (2026-11-21, see Notes)
- [ ] Radio sea-interferometer: fringes depend on source elevation and wavelength (Lloyd's mirror), not only moving dashes
- [ ] `spectra timeline seaside`: 0 warnings, draw calls noted against the last Outcome
- [ ] `spectra shot seaside` at -t 5 / 30 / 54 and `--bands radio` at -t 8 and -t 25: exit 0, images inspected

## Notes

*Status 2026-11-21:* the radio "sea interferometer" draws mirror images of the radio sources plus moving radio
dashes, but no real interference — nothing depends on the source elevation or the wavelength (Lloyd's-mirror
fringes would). To be finished later; the other bands are in place.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
