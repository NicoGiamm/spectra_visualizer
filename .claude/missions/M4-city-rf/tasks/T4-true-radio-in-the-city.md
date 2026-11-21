---
id: M4/T4
title: True radio in the city
status: in-progress
labels: [needs-verification]
started: 2026-11-21
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

- [x] FM/DAB mast paints facades; VHF airband from the airliner; tram pantograph arcing (radio + vis/UV); power-line ELF hum; LED-driver interference
- [x] Every process has a sourced `SPECTRUM` entry (no frequency moved to fit a band)
- [x] `spectra timeline city`: 0 warnings, draw calls noted against the last Outcome
- [x] `spectra shot city` at -t 5 / 30 / 54 and `--bands radio`: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

*2026-11-21:* DAB made steady (continuous OFDM) by merging it into the FM glow (one emitter from the same mast); a second always-on glow would have cost one draw call. FM facade paint at constant power 3 (was 2.4–3.6): broadcast power is constant.

*2026-11-21:* "power line hum (ELF … faint steady)": kept, but `powerHum` is `stylised` — at 0.5–1 km a 50 Hz line is a quasi-static near field that falls off within tens of metres, it does not radiate (M4 audit #3); the note says a radio hears its corona noise. `ledSwitch` also tagged `stylised` (continuous switching noise drawn as blips), beyond the audit's list.

*2026-11-21:* VHF airband verified in code and timeline only (shared `sky.airliner`, radio bursts t 3–27), no aimed shot. Tram sparks in headless shots depend on wall-clock `S.T`, so they are not repeatable in shots; the timeline checks them deterministically. Citations written from reference knowledge, not fetched.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
