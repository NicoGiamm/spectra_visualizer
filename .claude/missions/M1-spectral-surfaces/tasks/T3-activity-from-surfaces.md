---
id: M1/T3
title: Activity from surfaces
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
---

# M1/T3 — Activity from surfaces

## Goal

**Activity from surfaces.** Meters get a per-band surface contribution (precomputed area-weighted mean of the band term, recomputed every
~0.5 s) so the bars reflect the landscape, not only point sources. Retune `METER_NORM`.

## Plan

files: engine/render/surface.js, engine/world/heightfield.js, engine/ui/hud.js, engine/core/bands.js

- Migrated from plan step 1.3; the Goal is the step text verbatim.

## Acceptance

- [x] Delivered as the Goal states (see Outcome; deviations in Notes)

## Notes

*Checked 2026-11-21:* `updateSurfaces()` adds each registered surface's band response (per-surface `weight`,
precomputed property means, no geometry, so it runs every frame rather than every 0.5 s); `hud.js` uses
`1 - exp(-act/norm)`. Done in this pass: the terrain mean (`heightfield.js` `surfMean`) is now area-weighted, and
`METER_NORM` micro/ir/vis retuned (see progress note).

## Outcome

*From the plan's progress note "2026-11-21 · review fixes (seeded R order, warm rocks, Bluetooth, meters 1.3, plan corrections)":*

- **Seeded R order:** `scenarios/trail/main.js` lists the pre-existing events in their e6843ca order again
  (`crepuscularRays` in the old `zodiacalScatter` slot, same 18 `R()` draws; removed `thermalUpdraft`/`fireWhirl`
  drew none) and appends the new ones (`cellMast`, `weatherStation`, `mountainStream`, `gnss`, `cows`,
  `sunWarmedSlope`, `farHikers`, `sparkDraft`, `purpleLight`, `zodiacalLight`, `valleyFog`). Seaside gets the same
  layout (`purpleLight`, `zodiacalLight`, `seaMist` appended; they draw no `R()`, so its values were already
  unchanged). Checked with a temporary `R()` call counter in throw-away copies of e6843ca and the fixed tree: every
  pre-existing event starts at the same stream index with the same draw count in both scenes (before the fix the
  air showers drew different values — 272 vs 273 ribbons).
- **1.4 warm rocks:** Ems only for the 5 largest `NEAR_ROCKS` (by size, no `R()`); trail IR field instances 274 → 257.
- **2.3 trail / Hiker:** `bluetooth` process (2.44 GHz) in `spectrum.js` (engine section), listed in the observer's
  `freq`; a second micro `Em` blips twice about every 1.5 script-s at ~⅓ of the LTE ping. Trail/seaside notes
  mention it (city note untouched for the pending city work). The phone sits below the default view, so the
  blip is not visible in the standard screenshots.
- **1.3 meters:** area-weighted terrain `surfMean`; `METER_NORM` micro 1.6 → 4.2, ir 2.1 → 10, vis 3.6 → 18
  (city overrides these three, unchanged). `spectra timeline` before: trail "meters above 0.9 for >20 s: micro
  (60 s), ir (60 s), vis (45 s)", seaside "vis (48 s)"; after: no such line for trail or seaside (Ground and
  Orbit); typical/peak fill trail micro .73/.94, ir .83/.88, vis .83/.98, seaside micro .28/1.00, ir .28/.66,
  vis .52/.89. City still reports micro/ir/vis (60 s) — left for the city retune.
- Plan: 1.1–1.3 ticked after reading the code (deviations noted under each step), 1.5 gamma order corrected, 5.1 →
  `[~]`, Phase 3 note, Q1/Q3 recorded.
- Verified after every change: `spectra timeline` 0 warnings in all three scenarios; `spectra shot` exit 0 for
  trail t 5/30/54, seaside t 30, city t 30 and trail t 30 `--bands ir,micro`.
