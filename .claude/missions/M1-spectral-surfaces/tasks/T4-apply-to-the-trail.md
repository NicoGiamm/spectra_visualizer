---
id: M1/T4
title: Apply to the trail
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
---

# M1/T4 — Apply to the trail

## Goal

**Apply to the trail.** Terrain vertex attributes from the existing colour classes (grass, dry, rock,
snow, dirt); trees (`eIR .97`, slight warmth), rocks (slow cooling replaces the 22 hand-placed `NEAR_ROCKS` Ems
→ keep a few Ems only for the hottest boulders), hut walls (`Tcore`). **Alpenglow becomes real**: tint snow faces
that see the sun (`dot(normal, sunDir) > 0` at `sunEl` 0…−3°) pink in visible light — today it draws nothing.

## Plan

files: scenarios/trail/world.js, scenarios/trail/events.js

- Migrated from plan step 1.4; the Goal is the step text verbatim.

## Acceptance

- [x] Delivered as the Goal states (see Outcome; deviations in Notes)

## Notes

*2026-11-21:* warm rocks now keep `EmField` Ems only for the 5 largest boulders (was all 22). The hut walls use
the `wood` preset (no `Tcore`, see 1.1).

## Outcome

*From the plan's progress note "2026-11-21 · 1.4 + 2.3 (trail group) + 6.1–6.3 done — Trail realism":*

`world.js`: terrain `surfAt` maps the colour classes to surface presets (meadow→dirt→rock→snow, `PRESET.*` in
`engine/render/surface.js`, per-vertex `aSurfA/B/C`); trees/rocks/hut/grass registered with `spectral()`; the
stream strip is new (`STREAM`, water preset — cold sky mirror in IR, eMW .45 dark in micro, mirrors the sky
keyframes `SKY_REFL` in visible). Terrain-only physics in `TRAIL_U`/`TERRAIN_DECL`: sun-warmed slope faces
(`uAft`, decay `uSlopeK = exp(-t/9)`), campfire ground heating (`uCamp`), and a long-range microwave coverage
field `uMTx[2]` (cell mast + TV UHF) with radial dashes. **Alpenglow is real**: `visExtra` tints snow faces
that see the grazing sun pink (`uAlpen` × `dot(N, uSunDir)`), label points at the lit side peak (`SPOTS.alpen`).
`events.js`: audit replacements — `thermalUpdraft` → `sunWarmedSlope` + `valleyFog` (cold fog banks in hollows,
silver when moonlit, cold opaque cap in IR), `fireWhirl` → `sparkDraft` (updraft sparks + smoke plume cooling
with height); campfire gained ground heating (`groundHeat`, `uCamp` + meter share); radio/TV tower now carries
TV-UHF **micro** + FM **radio** painting the slopes (`addTx('radio')`, `uMTx[1]`); warm rocks keep a few
`EmField` Ems only for the hottest boulders. Phase 6 events: `mountainStream`, `farHikers` (headlamp switchback
zigzag), `cows` (InstancedMesh herd + realistic-IR `EmField` bodies), `cellMast` (LTE/5G, paints the valley),
`weatherStation` (VHF bursts + arced radio link to the ridge mast), `gnss` (GPS L1 / Galileo E5, faint steady
L-band points). New spectrum.js processes: tvUHF, sunWarmSlope, fogScatter/Top, sparkGlow, plumeHeat, groundHeat,
waterCold, headlamp, cowBody, gpsL1, galileoE5, wxTelemetry.
Verified: `spectra timeline trail` — **0 physics warnings**; draw calls 86/152/162 at t=5/30/55 (baseline 80/136/158 —
the +6…+16 are the new meshes/labels; fields and instancing keep it in the ballpark); sources 232 Em + 406 Rib + 9 fields.
Shots `trail_t5/30/54` + instrument `-t 30 --bands ir,micro` all exit 0; alpenglow label, stream, cows, fog, plume
and satellite points read correctly. Meters still pinned at the top in every band (known 0.1 bug — re-normalisation
is step 1.3; the new micro sources raise the micro peak, retune there).
Follow-ups: seaside/city audit groups; 1.3 meter accounting + soft compression.

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
