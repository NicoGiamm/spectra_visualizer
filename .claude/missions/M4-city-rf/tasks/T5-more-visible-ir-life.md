---
id: M4/T5
title: More visible/IR life
status: in-progress
labels: [needs-verification]
started: 2026-11-21
completed:
---

# M4/T5 — More visible/IR life

## Goal

**More visible/IR life.** Mixed LED/sodium lamps, neon & LED signs, security cameras with **850 nm IR
illuminator rings** (near-IR, invisible by eye — a perfect band lesson), rooftop HVAC exhaust plumes (IR),
manhole steam (IR), delivery robot/robotaxi **LiDAR (905 nm near-IR)** sweeping, distant airport **radar**
(S-band, microwave) sweeping from the horizon, police car blue lights + radio bursts.

## Plan

files: scenarios/city/life.js, engine/core/spectrum.js

- Migrated from plan step 4.5; the Goal is the step text verbatim.

## Acceptance

- [x] Mixed LED/sodium lamps, neon/LED signs, 850 nm camera IR rings, HVAC plumes, manhole steam, 905 nm LiDAR robot, airport S-band radar, police lights + radio
- [x] `spectra timeline city`: 0 warnings, draw calls noted against the last Outcome
- [x] `spectra shot city` at -t 5 / 30 / 54 and `--bands ir` and `--bands micro`: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

*2026-11-21:* 5e7b36b fixed events drawing outside their t0..t1 (crowd, scooters, LED switching, shelter modem, airport radar), added the tram/robot/police meshes that were never in the scene, replaced the camera-locked haze quads with 140 canyon patches, dimmed the shop fronts.

*2026-11-21:* "rooftop HVAC exhaust plumes (IR)": a dry warm-air plume is invisible at 8–14 µm (M2 verdict: thermal cameras see surfaces/droplets, not air), so they are now AC cooling-tower vapour plumes (droplets: LWIR + a pale visible wisp), raised 5.5 → 12 m with one shared westerly wind — the units sit behind the parapets and the old ribbons were never visible from the walk. Most units are still hidden behind the north facades (placement is a T6 question).

*2026-11-21:* the 850 nm camera rings stay IR-only: the faint red the eye sees from an 850 nm LED is ~780–820 nm, `ir` in this band table — the note says it instead of a made-up `vis` wavelength. The LiDAR robot path was reversed (it stayed behind the viewer and was never on screen); no R() change.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
