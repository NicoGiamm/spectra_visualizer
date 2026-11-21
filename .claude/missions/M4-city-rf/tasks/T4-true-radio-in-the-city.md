---
id: M4/T4
title: True radio in the city
status: done
labels: [needs-verification]
started: 2026-11-21
completed: 2026-11-21
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

Verified true radio in the city on top of a9adb2f/5e7b36b and applied the T4 audit fixes (commit on mission/M4-city-rf, engine/core/spectrum.js + scenarios/city/rf.js). The FM/DAB mast on the hill paints the hill-facing facades through `addTx('radio')` (distance falloff, Lambert, 9 m moving dashes), now at constant power; DAB+ is drawn steady (continuous OFDM) and merged with FM into one glow. The airliner's VHF airband is the shared `sky.airliner` radio bursts (t 3–27). Tram pantograph sparking is intermittent and bunched at the wire joints every 50 m (~10–18 % of each pass, was 53–70 %, which is iced/worn-wire behaviour). `powerHum` (50 Hz) is `stylised` — a quasi-static near field, not radiated — and the power-line event's note points to corona noise (`coronaRF`, worse in rain/fog). LED-driver interference note: 20 kHz–1 MHz switching harmonics vs 100 Hz flicker; tagged `stylised`. `arcUV` 340 → 324.7 nm (Cu I resonance, NIST ASD, still UV); `arcLight` relabelled "electric arc in air: N₂ and metal lines". Every T4 SPECTRUM entry carries a citation comment; no value was moved to fit a band.

Numbers: `spectra timeline` 0 warnings Orbit + Ground for all three scenarios; city draw calls 97/243/244 → 97/243/244; city radio meter p90 unchanged (0.78/0.89). Shots exit 0: city -t 5/30/54, `--bands radio -t 30`, `--bands radio --yaw 0.7` (facades toward the hill in radio magenta), tram at -t 39.9 (blue-white flash + radio streak) and `-t 39.75 --bands radio,uv` (UV starburst + radio streak, dash stripes on the distant blocks; also checked by the main session).

Not verified: no aimed shot of the airliner's airband (timeline only); tram sparks in shots depend on wall-clock `S.T` (not repeatable in shots); near the viewer the FM dashes don't read as stripes; citations from reference knowledge, not fetched. The bug zapper (street.js, T5) reuses `arcUV` = Cu I 324.7 nm although zapper grids are steel/zinc — the N₂ 337 nm band would fit better (T5).
