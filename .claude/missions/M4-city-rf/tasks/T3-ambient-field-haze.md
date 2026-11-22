---
id: M4/T3
title: Ambient field haze
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
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

Verified and reworked the street-canyon RF haze (561c5ab, scenarios/city/rf.js `haze`). Density per patch follows the live Wi-Fi APs within 40 m of the patch (kept instead of the Goal's ~80 m around the viewer, see Notes), fading with depth 60–110 m. The large blocky orange squares in the sky and over the park trees at t 30 (T7) were the haze's 2.5–5.5 m patches (up to 24 m high, 10–21 cm crackle cells near the viewer) — proven by switching the haze off for one shot. They are now 360 patches of 0.9–2.0 m (4–8 cm cells), below 9 m (lowest street-front roof 12 m), drawn smaller and faded when close; a new `onCanyon()` line-of-sight check hides any patch whose view would end on the sky, a block gap or the open park end, and the last 20 m before the park fade out. Tagged `stylised` (it shows field density, not a visible thing). One instanced draw call, hash placement, no R() draws.

Numbers: `spectra timeline` 0 warnings Orbit + Ground for all three scenarios; city draw calls 97/243/244 → 97/243/244; field instances 1536 → 1756; micro meter typical/peak 0.80/0.85 → 0.82/0.87. Shots exit 0: city -t 5/30/54, `--bands vis -t 30`, `--bands micro -t 10/30/50` (main session re-ran -t 30 all bands and micro -t 10 after the final comment edit: sky and trees clean at t 30; fine haze puffs on the facades at t 10; none in the park at t 50).

Not verified / deviations: Ground-mode shots (timeline only); only the default view was shot; at `--bands micro -t 30` the haze is hard to see against the bright microwave facades (T8). The blocky clusters still on the right facade at t 30 are nearby Wi-Fi routers (events.js `wifi`), left to T7.
