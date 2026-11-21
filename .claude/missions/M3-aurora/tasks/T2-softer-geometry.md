---
id: M3/T2
title: Softer geometry
status: backlog
labels: [needs-verification]
started:
completed:
---

# M3/T2 — Softer geometry

## Goal

**Softer geometry.** Curtain amplitude, height and ray contrast ramp per phase instead of appearing at
full size; soft fade on both arc ends and at the top; per-segment brightness variation along the arc.

## Plan

files: engine/events/sky.js

- Migrated from plan step 3.2; the Goal is the step text verbatim.

## Acceptance

- [ ] Curtain amplitude, height and ray contrast ramp per phase
- [ ] Soft fades on both arc ends and the top; per-segment brightness variation
- [ ] `spectra shot trail` at -t 5 / 30 / 54 and -t 30 / 36 / 45: exit 0, images inspected

## Notes

*Note 2026-11-21:* the aurora rework (substorm phases, NW arc, near-IR and VHF-radar bands) was implemented early in
commit c9b3fb3 (with 2.1–2.3). It still needs its own verification against 3.1–3.3, which stay unticked until then.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
