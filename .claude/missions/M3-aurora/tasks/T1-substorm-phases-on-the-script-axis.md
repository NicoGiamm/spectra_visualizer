---
id: M3/T1
title: Substorm phases on the script axis
status: backlog
labels: [needs-verification]
started:
completed:
---

# M3/T1 — Substorm phases on the script axis

## Goal

**Substorm phases on the script axis.** (replace the 3-s `env` fade):
*growth* (t≈26–33): a faint, homogeneous green arc low on the horizon fades in over ~6 s, almost no rays;
*breakup* (≈33–38): brightening, rays appear, folds speed up, the curtain climbs, red tops (630 nm) appear;
*recovery* (≈38–50): diffuse patches pulsating with 2–20 s periods, slowly dimming to a faint glow.
Intensity also gated by darkness (`night()`), so it never starts in twilight.

## Plan

files: engine/events/sky.js

- Migrated from plan step 3.1; the Goal is the step text verbatim.

## Acceptance

- [ ] Growth (t≈26–33) faint homogeneous arc, breakup (≈33–38) rays + red tops, recovery (≈38–50) pulsating patches — visible at those times in shots
- [ ] Intensity gated by `night()`: nothing in twilight
- [ ] The 3-s `env` fade is gone
- [ ] `spectra timeline trail seaside`: 0 warnings, draw calls noted against the last Outcome
- [ ] `spectra shot trail seaside` at -t 5 / 30 / 54 and -t 30 / 36 / 45: exit 0, images inspected

## Notes

*Note 2026-11-21:* the aurora rework (substorm phases, NW arc, near-IR and VHF-radar bands) was implemented early in
commit c9b3fb3 (with 2.1–2.3). It still needs its own verification against 3.1–3.3, which stay unticked until then.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
