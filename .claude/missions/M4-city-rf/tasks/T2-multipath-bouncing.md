---
id: M4/T2
title: Multipath bouncing
status: backlog
labels: [needs-verification]
started:
completed:
---

# M4/T2 — Multipath bouncing

## Goal

**Multipath bouncing.** Engine helper `bounce(origin, dir, boxes, maxHits)` reflecting rays off the
city's axis-aligned building boxes (exported by `world.js`). The mast and a few strong APs emit short-lived
rays that reflect 2–4 times down the canyon as `Rib` polylines, fading per bounce (≈ −6 dB each), dashes moving
outward. Facades hit by rays flash in the radio/micro surface term (1.2).

## Plan

files: engine/world/bounce.js, scenarios/city/rf.js

- Migrated from plan step 4.2; the Goal is the step text verbatim.

## Acceptance

- [ ] `bounce(origin, dir, boxes, maxHits)` engine helper; rays reflect 2–4 times down the canyon as `Rib`s fading ≈ −6 dB per bounce
- [ ] Facades hit by rays flash in the radio/micro surface term
- [ ] `spectra shot city` at -t 5 / 30 / 54 and `--bands micro,radio`: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

*2026-11-21:* 82e40cf made the hits flash on the facades via the shared surface term (`addHits`, `uHitM`, ≤ 12 hits), re-aimed the rays across the canyon and gated the event to its window.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
