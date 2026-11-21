---
id: M1/T1
title: Surface property model
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
---

# M1/T1 — Surface property model

## Goal

**Surface property model.** Per material (or per vertex/instance via attributes): `T0` surface temp at t=0 (°C), `tau` thermal inertia
(script-s), `Tcore` (interior heat for buildings), `eIR` (8–14 µm emissivity), `eMW` (microwave emissivity),
`uvAlb` (UV albedo), `gamma` (terrestrial activity, relative), `rRadio` (radio reflectivity).
Temperature curve: `T(t) = Tair(t) + (T0 − Tair(0))·exp(−t/tau) + Tcore·k`, with `Tair` falling from ~22 °C to
~12 °C over the timeline (`engine/world/atmosphere.js`).
Reference values (document sources in comments): water `eIR .98, eMW .45, uvAlb .06, gamma .05, tau ∞`;
dry sand `eIR .92, eMW .9, uvAlb .2, gamma .6 (heavy minerals), tau short`; wet sand `eMW .6`;
granite/rock `eIR .9, gamma 1.0, tau long`; fresh snow `eIR .99, uvAlb .85`; grass/forest `eIR .97, uvAlb .02,
tau medium`; asphalt `eIR .95, tau medium, T0 high`; concrete/brick `gamma .5`; glass windows `eIR .85 but reflect
the cold sky at grazing angles`.

## Plan

files: engine/render/surface.js

- Migrated from plan step 1.1; the Goal is the step text verbatim.

## Acceptance

- [x] Delivered as the Goal states (see Outcome; deviations in Notes)

## Notes

*Checked 2026-11-21:* `engine/render/surface.js` packs the properties as `A = [T0, Teq, 1/tau, eIR]`,
`B = [eMW, uvAlb, gamma, rRadio]`, `C = [gloss]` with documented `PRESET`s matching the reference values above.
Two deviations from the text: each material cools toward its own night equilibrium `Teq` instead of a shared
`Tair(t)` curve in `atmosphere.js` (only the seaside has a local `airTemp`), and there is no `Tcore` field (the
`facade` preset's high `Teq` stands in; per-building interior heat is left for 1.6).

## Outcome

Verified by reading the code on 2026-11-21 (commit ba7c34f); see Notes for the deviations from the step text.
