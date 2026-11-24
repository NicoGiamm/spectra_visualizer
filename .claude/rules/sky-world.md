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
   put things on a sphere of radius `D` around the camera. View clamp: yaw ±1.35, pitch −0.1…1.5; a scenario may set its starting view with `view: { yaw, pitch }`
   in `run()` (URL parameters win; the aurora faces its north-west arc). **Sky events stay
   inside `FOV_SKY` (geom.js): azimuth 210–330, elevation 0…60°, for their whole visible path** (moving tracks,
   jets, rings, branches included) — take positions from it (`fovAz(u)`, `FOV_SKY.elMax`), don't hard-code a wider
   arc. Things physically tied to the Sun (`SUN_AZ`) or the Moon (`moonDir()`) follow them.
2. **One shared timeline** in `engine/world/atmosphere.js`: `SUN_AZ`/`sunEl()`, `moonDir()`, `night()`, `moonlit()`,
   keyframes `HEMI`/`HOR`/`CLOUD`/`CONTRAIL` read with `kf()`. Atmosphere also owns the lights (sun, moon, hemi,
   headlamp, storm flash) via `ENV`. Scenario options: `lightPollution` (dims stars/Milky Way, adds a horizon glow),
   `cloudCover`, and (M12) `site`: a scenario at another latitude/date passes its own Sun/Moon track fits
   (`{sunAz, sunEl, moonAz, moonEl, moonElong}`, computed, cited in its main.js); the twilight colours then follow the
   Sun's depression through `twi()`. Without a site everything is the shared mid-latitude summer track. Never give a
   scenario a sun or clock outside this mechanism; library sky events placed for mid-latitude (Milky Way, Venus,
   planets, Moon) are left out of a scenario whose site makes them wrong.
3. **Solids go through `solid(mesh, instrMat?)`, visible-only sprites through `visOnly()`**, or the instrument view
   shows them wrong.
4. **Layouts draw from the seeded `R`** (`engine/core/util.js`), never `Math.random`. Adding draws in `build()`
   shifts every event `init()` after it — check `spectra timeline` output is unchanged where it should be.

## Non-derivable facts

- Each surface cools toward its own night equilibrium `Teq`; there is no shared `Tair(t)` curve (only the seaside and
  the ocean have a local `airTemp`). Interior heat exists only for city buildings: an `aTcore` instance attribute (hash, not `R`)
  read through `spectral()`'s `vertDecl`/`vertMain` hooks (519656e).
- Things behind the viewer (east, e.g. alpenglow peaks) can't be seen: put a label on the visible side instead.
