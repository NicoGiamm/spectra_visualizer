---
paths:
  - "engine/world/**"
  - "engine/core/geom.js"
  - "engine/events/sky.js"
  - "scenarios/*/world.js"
  - "scenarios/*/main.js"
---

# Sky & world — geometry, the shared timeline, terrain

Where things sit and what the light does over the 0–60 script. `engine/world/atmosphere.js` owns the
sunset→night timeline and the lights; `engine/core/geom.js` the sky directions; each scenario's `world.js`
its terrain, props, camera walk and ground height.

## Guardrails

1. **Front is azimuth 270 (west, −z) in every scenario.** `dirAE(az, el)`, `skyP`, `onSky` (`engine/core/geom.js`)
   put things on a sphere of radius `D` around the camera. View clamp: yaw ±1.35, pitch −0.1…1.5 — **keep sky
   azimuths ~205–340 and above the horizon**, or the viewer can never see it.
2. **One shared timeline** in `engine/world/atmosphere.js`: `SUN_AZ`/`sunEl()`, `moonDir()`, `night()`, `moonlit()`,
   keyframes `HEMI`/`HOR`/`CLOUD`/`CONTRAIL` read with `kf()`. Atmosphere also owns the lights (sun, moon, hemi,
   headlamp, storm flash) via `ENV`. Scenario options: `lightPollution` (dims stars/Milky Way, adds a horizon glow),
   `cloudCover`. Never give a scenario its own sun or clock — library sky events must line up everywhere.
3. **Solids go through `solid(mesh, instrMat?)`, visible-only sprites through `visOnly()`**, or the instrument view
   shows them wrong.
4. **Layouts draw from the seeded `R`** (`engine/core/util.js`), never `Math.random`. Adding draws in `build()`
   shifts every event `init()` after it — check `spectra timeline` output is unchanged where it should be.

## Non-derivable facts

- Each surface cools toward its own night equilibrium `Teq`; there is no shared `Tair(t)` curve (only the seaside has
  a local `airTemp`), and no `Tcore` field — the `facade` preset's high `Teq` stands in (plan 1.1 note).
- Things behind the viewer (east, e.g. alpenglow peaks) can't be seen: put a label on the visible side instead.
