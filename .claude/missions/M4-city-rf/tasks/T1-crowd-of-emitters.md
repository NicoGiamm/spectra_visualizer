---
id: M4/T1
title: Crowd of emitters
status: backlog
labels: [needs-verification]
started:
completed:
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

- [ ] Pedestrians (realistic-IR bodies, LTE/5G + Bluetooth bursts), Wi-Fi APs per lit flat (~60 %, 2.4 vs 5 GHz colours), shop Wi-Fi, bus-stop LED screens, key-fob/TPMS 433 MHz, scooters — all via `EmField`
- [ ] `spectra timeline city`: 0 warnings, draw calls noted against the last Outcome
- [ ] `spectra shot city` at -t 5 / 30 / 54 and `--bands micro,ir`: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

*2026-11-21:* 5e7b36b fixed events drawing outside their t0..t1 (crowd, scooters, LED switching, shelter modem, airport radar), added the tram/robot/police meshes that were never in the scene, replaced the camera-locked haze quads with 140 canyon patches, dimmed the shop fronts.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
