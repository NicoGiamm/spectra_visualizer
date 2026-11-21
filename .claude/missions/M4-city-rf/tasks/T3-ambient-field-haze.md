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

- [x] Microwave haze density ∝ active APs/phones within ~80 m, attenuated with depth
- [x] The haze fades walking into the park (shots early vs late in the walk)
- [x] `spectra shot city` at -t 5 / 30 / 54 and `--bands micro` at -t 10 and -t 50: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

*2026-11-21:* 5e7b36b fixed events drawing outside their t0..t1 (crowd, scooters, LED switching, shelter modem, airport radar), added the tram/robot/police meshes that were never in the scene, replaced the camera-locked haze quads with 140 canyon patches, dimmed the shop fronts.

*2026-11-21:* density is the APs within 40 m of each patch (local field density, from 5e7b36b), not within ~80 m of the viewer as the Goal says. Kept on purpose: summed over the 110 m view range it follows the APs around you, and it thins the haze toward the open park end. Phones are not counted (the crowd draws them itself).

*2026-11-21:* T7's sky/park blocks were the haze patches (2.5–5.5 m quads up to 24 m high → 10–21 cm crackle cells near the viewer). Fixed here (561c5ab): 360 small patches below 9 m, drawn smaller when close, shown only where the line of sight ends on a facade or the street (`onCanyon`). Tagged `stylised`. At `--bands micro -t 30` the haze is hard to pick out against the bright microwave facades (T8).

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
