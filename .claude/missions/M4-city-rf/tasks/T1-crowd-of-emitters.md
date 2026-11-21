---
id: M4/T1
title: Crowd of emitters
status: done
labels: [needs-verification]
started: 2026-11-21
completed: 2026-11-21
---

# M4/T1 — Crowd of emitters

## Goal

**Crowd of emitters.** (all via `EmField`): pedestrians (realistic-IR bodies, phones pinging LTE/5G,
Bluetooth earbuds bursting), many more Wi-Fi APs (one per lit flat with ~60 % probability, channel-coloured
2.4 vs 5 GHz), shop-front Wi-Fi, bus stops with LED screens, parked cars with key-fob/TPMS bursts (433 MHz =
69 cm micro), scooters.

## Plan

files: scenarios/city/rf.js

- Migrated from plan step 4.1; the Goal is the step text verbatim.

## Acceptance

- [x] Pedestrians (realistic-IR bodies, LTE/5G + Bluetooth bursts), Wi-Fi APs per lit flat (~60 %, 2.4 vs 5 GHz colours), shop Wi-Fi, bus-stop LED screens, key-fob/TPMS 433 MHz, scooters — all via `EmField`
- [x] `spectra timeline city`: 0 warnings, draw calls noted against the last Outcome
- [x] `spectra shot city` at -t 5 / 30 / 54 and `--bands micro,ir`: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

*2026-11-21:* 5e7b36b fixed events drawing outside their t0..t1 (crowd, scooters, LED switching, shelter modem, airport radar), added the tram/robot/police meshes that were never in the scene, replaced the camera-locked haze quads with 140 canyon patches, dimmed the shop fronts.

*2026-11-21:* Deviation from the Goal: parked cars no longer send TPMS bursts — direct TPMS sensors are motion-triggered and sleep once the car stops (M4 audit #2, decision logged in mission.md). The parked-car event keeps only the 433.92 MHz key-fob unlocks (`freq: ['keyFob']`); TPMS from moving traffic (`events.js` `traffic`) stays.

*2026-11-21:* "All via `EmField`" holds for every crowd; the single bus-shelter screen and its modem use `Em` (one source each, render rule 2). The 2.4 vs 5 GHz Wi-Fi tints and single fob/phone bursts are verified in code only — in the micro views the surface crackle hides them (→ T8). Walkers drifted up to ~150 m past the canyon late in the walk (no wrap); fixed in b3435fe.

## Outcome

Verified the Phase 4.1 crowd against the code (a9adb2f/5e7b36b/5a36c6d, never reviewed before): 110 pedestrians with realistic-IR bodies (`EmField('ir', n, null, 1)`) and phones (LTE pings every 2.5–8 script-s plus slower Bluetooth bursts, one micro instance each), Wi-Fi access points in ~60 % of flats (45 % at 5 GHz, tinted pale yellow vs deep orange; data bursts only while the flat is lit), shop-front APs, the bus-shelter LED screen + LTE-M modem (`Em`, single sources), key fobs on the parked cars, 5 scooters (IR + LTE-M). Changes (b3435fe, scenarios/city/rf.js): parked cars no longer chirp TPMS — direct TPMS sleeps when parked (audit #2, logged decision; event renamed "Parked cars: key fobs", 433.92 MHz unlocks kept); the crowd is tagged `time-compressed` (audit #4); walkers loop along their sidewalk (z −30…250, 12 m fade at the ends) instead of drifting ~150 m past the canyon. No R() draws changed.

Numbers: `spectra timeline` 0 warnings in Orbit and Ground for all three scenarios; city draw calls 97/246/244 before → 97/246/244 after; sources unchanged (237 Em, 476 Rib, 35 fields). Shots exit 0: city -t 5/30/54, `--bands micro,ir -t 30`, `--bands ir -t 30` (warm walkers on both sidewalks, window-frame heat leaks), plus two micro views.

Not verified: the 2.4 vs 5 GHz colour difference and individual fob/phone bursts are checked in code only — the microwave surface crackle hides them in the micro views (T8). Moving-traffic TPMS (every 5–11 script-s) and fob presses are faster than real; `traffic` has no `time-compressed` tag (M2/T3 city audit group).
