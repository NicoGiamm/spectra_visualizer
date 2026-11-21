---
id: M4/T3
title: Ambient field haze
status: in-progress
labels: [needs-verification]
started: 2026-11-21
completed:
---

# M4/T3 — Ambient field haze

## Goal

**Ambient field haze.** A screen-space band "fog" for microwave in the street canyon: crackle density
proportional to the number of active APs/phones within ~80 m, attenuated by depth (layered camera-facing quads
at 8/25/70 m or a post pass). Fades as you walk into the park → you *feel* leaving the dense RF zone.

## Plan

files: scenarios/city/rf.js

- Migrated from plan step 4.3; the Goal is the step text verbatim.

## Acceptance

- [ ] Microwave haze density ∝ active APs/phones within ~80 m, attenuated with depth
- [ ] The haze fades walking into the park (shots early vs late in the walk)
- [ ] `spectra shot city` at -t 5 / 30 / 54 and `--bands micro` at -t 10 and -t 50: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

*2026-11-21:* 5e7b36b fixed events drawing outside their t0..t1 (crowd, scooters, LED switching, shelter modem, airport radar), added the tram/robot/police meshes that were never in the scene, replaced the camera-locked haze quads with 140 canyon patches, dimmed the shop fronts.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
