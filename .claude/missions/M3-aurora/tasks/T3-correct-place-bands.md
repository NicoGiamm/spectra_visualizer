---
id: M3/T3
title: Correct place & bands
status: backlog
labels: [needs-verification]
started:
completed:
---

# M3/T3 — Correct place & bands

## Goal

**Correct place & bands.** The auroral oval lies toward the pole: put the arc **low over the north-western
horizon** (az ≈ 300–345, el 3–20°, near the view's right edge) and fix the note. Bands from the ground:
visible (557.7 nm green, 630 nm red, 427.8 nm N₂⁺ blue base) and **near-IR** (777.4 nm O, N₂ first positive);
radio = VHF **radar backscatter** off the auroral E-region, not AKR (100–300 kHz, blocked by the ionosphere);
UV and X-ray become `origin:'high'` (Orbit mode only). The side ribbons follow the curtain's own displacement
(same wave function in JS) instead of static lines, and stagger in with the phases.

## Plan

files: engine/events/sky.js, engine/core/spectrum.js

- Migrated from plan step 3.3; the Goal is the step text verbatim.

## Acceptance

- [ ] Arc low over the NW horizon (az ≈ 300–345, el 3–20°) and the note fixed
- [ ] Bands: visible 557.7/630/427.8 nm, near-IR 777.4 nm; radio = VHF radar backscatter (no AKR); UV and X-ray `origin:'high'`
- [ ] Side ribbons follow the curtain displacement and stagger with the phases
- [ ] `spectra timeline trail seaside`: 0 warnings, draw calls noted against the last Outcome
- [ ] `spectra shot trail` at -t 5 / 30 / 54 and `--bands ir,radio` and `--detector orbit`: exit 0, images inspected

## Notes

*Note 2026-11-21:* the aurora rework (substorm phases, NW arc, near-IR and VHF-radar bands) was implemented early in
commit c9b3fb3 (with 2.1–2.3). It still needs its own verification against 3.1–3.3, which stay unticked until then.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
