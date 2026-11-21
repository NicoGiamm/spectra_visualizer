---
id: M4/T6
title: Tune
status: backlog
labels: []
started:
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

- [ ] `meterNorm`: no band pinned at the top > 20 s in `spectra timeline city`
- [ ] Draw calls < ~400 at every sample
- [ ] Walk speed leaves the canyon section unhurried (checked in shots along the walk)

## Notes

*2026-11-21:* a9adb2f raised the city `meterNorm` ("no band pinned >20 s") and reported draw calls 82/211/213 at t=5/30/55; the walk-speed part is untouched.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
