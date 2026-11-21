---
id: M4/T5
title: More visible/IR life
status: done
labels: [needs-verification]
started: 2026-11-21
completed: 2026-11-21
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

Verified the 8 street-life features on code and shots and applied the M4 audit fixes #1, #4, #6, #8 that belong to T5 (plus the street.js events from 5a36c6d, which no task covered). Mixed LED/sodium lamps (avenue ~55 % LED, park ~15 %), neon/LED signs, 850 nm camera rings (note: shows a faint red glow; 940 nm is the near-invisible kind), manhole steam (now visible + IR, "cold night" dropped), LiDAR robot, airport S-band radar, police lights + TETRA. HVAC plumes are now AC cooling-tower vapour plumes — droplets emit in LWIR and scatter lamplight, dry warm air does neither (M2 verdict) — 12±3 m high, bending in one westerly wind so they clear the south roofs. New SPECTRUM keys `dropletScatter` (Mie, 550 nm) and `airArcUV` (N₂ second positive 337.1 nm, now the bug zapper's UV); `steam` restricted to droplet plumes. Police bar blue/blue; bus interiors LED; HPS strike bluish-white → orange and street lights tagged `time-compressed`; drone `rare`; granite blip rate "illustrative"; bats' LED insect claim removed. Also fixed: the LiDAR robot started behind the viewer and was never on screen; it now comes from the park and passes at t≈44. No R() draws changed.

Numbers: `spectra timeline` 0 warnings Orbit + Ground for all three scenarios; city draw calls 97/243/244 → 97/266/266 (+18 HVAC and +4 manhole visible ribbons, the robot now in view), under the ~400 budget; Rib sources 476 → 498. Shots exit 0: city -t 5/30/54, `--bands ir -t 30`, `--bands micro -t 30`, Ground -t 30, aimed HVAC (vis/ir/all, pale wisp over the south roofs, checked by the main session), steam vis/ir, cameras ir, police vis, robot ir/all, radar micro, lamp strike.

Not verified: the bug-zapper UV shot was not inspected; the HPS strike colour and TETRA bursts are not clearly confirmed on screen; seaside/trail not shot (data-only spectrum change); the new keys were not reviewed by the physics-auditor (due before shipping M4). Found for T7: with Human eye (vis only) at night the street, sidewalks and facade walls render solid black under lit lamps.
