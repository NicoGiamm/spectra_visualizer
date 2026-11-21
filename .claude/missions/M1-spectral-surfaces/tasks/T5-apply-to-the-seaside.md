---
id: M1/T5
title: Apply to the seaside
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
---

# M1/T5 — Apply to the seaside

## Goal

**Apply to the seaside.** Sea shader includes the chunk: IR shows the **thermal crossover** — at t=0 the
sand is hotter than the sea, by t≈20–25 the sand has cooled below the sea, which stays warm (≈18 °C) all night;
microwave shows the sea cold with brighter foam lines; UV shows a faint sand/foam glow until ~t=12; gamma: rock
(granite) > sand > sea. Promontory rock gets granite properties.

## Plan

files: scenarios/seaside/world.js, scenarios/seaside/events.js

- Migrated from plan step 1.5; the Goal is the step text verbatim.

## Acceptance

- [x] Delivered as the Goal states (see Outcome; deviations in Notes)

## Notes

*Corrected 2026-11-21:* the text used to say "sand > rock > sea", but 1.1's reference values make granite the most
active (gamma 1.0 vs dry sand .6 from heavy minerals) and the code follows 1.1.

## Outcome

*From the plan's progress note "2026-11-21 · 1.5, 5.1, 5.3 done (seaside, now verified)":*

`scenarios/seaside/world.js`: local presets (`wetSand` glossy eMW .6, `sand` tau 22 s so its 18 °C crossover
with the sea lands near t≈22, `dune`, `granite` gamma 1); terrain `surfAt` blends wet→dry→dune→granite with
`aSurfA/B/C` attrs; terrain hook `coastExtra` (ship-radar microwave echoes off the cliffs + sparkly sea clutter,
bonfire IR hot-spot hook left for 5.2, far-cliff gamma speckle that survives the distance fade) and a `visExtra`
that mirrors sky + sun/moon on the glossy wet band. Sea is one ShaderMaterial for both looks
(`seaMaterial(instr)`): `seaBands()` gives IR water emissivity 1−R(θ) (dark far sea), the crossover, mist cold
screen; microwave Tb with cold calm sea / warm foam + radar sea clutter; radio txField + mirrored radio-sky
slots `ENVSEA.rs` (Sun radio during the sunset, Sgr A* synchrotron, pulsar — Lloyd's-mirror interference fringes,
lloydFringe 200 MHz); UV glitter only while the low sun still has UV (`uUVglit = sm(.8, 4, sunEl)`), foam
reflecting; gamma near-silent. `ENVSEA` shared state; `world.update` fills airT/uvGlit/rs and ties fog density to
mist. `events.js`: `ship` writes `radP/radA/radI` (sweep bearing shared with the surface shaders' `radarEcho`),
new `seaMist` event (t 42–60) drives uMist + meter activity (bands vis/ir, `mistScatter`/`mistThermal`);
`masts()` adds the coast radio station and the cliff-top Yagi interferometer array (merged, for 5.2/5.4 events).
Verified: `spectra timeline seaside` — 0 warnings, 30 events, draw calls 75/125/108 (was 74/125/107, +1 mast
mesh); `spectra shot` exit 0 at t=5/22/30/54 and `--bands ir,micro` (sand hottest t≈5, sea brighter by t=30/54,
mist hides the horizon toward IR), `--bands radio,uv` (t=8 sun mirror + UV glitter path, t=25 interference
fringes on the whole sea), `--bands gamma,radio --yaw .85` (granite speckle across the headland).
Follow-ups: `ENVSEA.fire` hook stays unwired (5.2 bonfire); meters still pinned (1.3/7.1).
