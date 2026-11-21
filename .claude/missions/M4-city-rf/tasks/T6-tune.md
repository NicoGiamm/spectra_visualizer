---
id: M4/T6
title: Tune
status: in-progress
labels: []
started: 2026-11-21
completed:
---

# M4/T6 — Tune

## Goal

**Tune.** `meterNorm`, draw-call budget (< ~400), 30 fps target on mid hardware; walk speed so the
canyon section isn't rushed.

## Plan

files: scenarios/city/main.js, engine/core/bands.js

- Migrated from plan step 4.6; the Goal is the step text verbatim.

## Acceptance

- [x] `meterNorm`: no band pinned at the top > 20 s in `spectra timeline city`
- [x] Draw calls < ~400 at every sample
- [x] Walk speed leaves the canyon section unhurried (checked in shots along the walk)

## Notes

*2026-11-21:* a9adb2f raised the city `meterNorm` ("no band pinned >20 s") and reported draw calls 82/211/213 at t=5/30/55; the walk-speed part is untouched.

*2026-11-21:* "30 fps target on mid hardware" cannot be measured headless (SwiftShader); not verified. Draw calls are sampled by `spectra timeline` at t = 5 / 30 / 55 only (97 / 266 / 266). Meter norms were retuned for Orbit on main in a48e444 (override only micro/ir/vis/gamma); none pinned after T1–T8.

*2026-11-21:* walk speed: the 90 s playback (0ffe640, fast-forwarded opening) made the script-time walk run the first 46 m of the canyon at 4–4.6 m/s; now an even ~1.8 m/s in real time through the canyon, same arrival at the park edge (t ≈ 41.3), park stretch unchanged. The trail walk (scenarios/trail/world.js) has the same fast-opening effect — outside M4.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
