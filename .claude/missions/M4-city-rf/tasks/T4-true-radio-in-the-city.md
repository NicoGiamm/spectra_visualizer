---
id: M4/T4
title: True radio in the city
status: backlog
labels: [needs-verification]
started:
completed:
---

# M4/T4 — True radio in the city

## Goal

**True radio in the city.** FM/DAB broadcast mast on a distant hill (paints facades via 1.2), VHF airband
from the approaching airliner, **tram line** with pantograph arcing (broadband radio + visible/UV blue flashes),
overhead power line hum (ELF, very long-wavelength radio, faint steady), LED-driver/switching interference near
shop signs.

## Plan

files: scenarios/city/rf.js, engine/core/spectrum.js

- Migrated from plan step 4.4; the Goal is the step text verbatim.

## Acceptance

- [ ] FM/DAB mast paints facades; VHF airband from the airliner; tram pantograph arcing (radio + vis/UV); power-line ELF hum; LED-driver interference
- [ ] Every process has a sourced `SPECTRUM` entry (no frequency moved to fit a band)
- [ ] `spectra timeline city`: 0 warnings, draw calls noted against the last Outcome
- [ ] `spectra shot city` at -t 5 / 30 / 54 and `--bands radio`: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
