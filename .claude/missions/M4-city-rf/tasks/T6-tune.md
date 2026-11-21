---
id: M4/T6
title: Tune
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
---

# M4/T6 — Tune

## Goal

**Tune.** `meterNorm`, draw-call budget (< ~400), 30 fps target on mid hardware; walk speed so the
canyon section isn't rushed.

## Plan

files: scenarios/city/main.js, engine/core/bands.js

- Migrated from plan step 4.6; the Goal is the step text verbatim.

## Acceptance

- [x] `meterNorm`: no band pinned at the top > 20 s in `spectra timeline city`
- [x] Draw calls < ~400 at every sample
- [x] Walk speed leaves the canyon section unhurried (checked in shots along the walk)

## Notes

*2026-11-21:* a9adb2f raised the city `meterNorm` ("no band pinned >20 s") and reported draw calls 82/211/213 at t=5/30/55; the walk-speed part is untouched.

*2026-11-21:* "30 fps target on mid hardware" cannot be measured headless (SwiftShader); not verified. Draw calls are sampled by `spectra timeline` at t = 5 / 30 / 55 only (97 / 266 / 266). Meter norms were retuned for Orbit on main in a48e444 (override only micro/ir/vis/gamma); none pinned after T1–T8.

*2026-11-21:* walk speed: the 90 s playback (0ffe640, fast-forwarded opening) made the script-time walk run the first 46 m of the canyon at 4–4.6 m/s; now an even ~1.8 m/s in real time through the canyon, same arrival at the park edge (t ≈ 41.3), park stretch unchanged. The trail walk (scenarios/trail/world.js) has the same fast-opening effect — outside M4.

## Outcome

Tuning closed after T1–T5, T7 and T8. Meters: the city `meterNorm` retuned for the Orbit default on main (a48e444: overrides only micro 45, ir 48, vis 140, gamma 5); `spectra timeline city` prints no "meters above 0.9 for >20 s" line after all M4 changes. Draw calls: city 97/266/266 at t = 5/30/55, under the ~400 budget (82/211/213 when Phase 4 first landed; +T5 vapour/steam ribbons). Walk speed: the 90 s playback (fast-forwarded opening) made the script-time walk run the first 46 m of the canyon at 4–4.6 m/s; scenarios/city/world.js now walks the canyon (z 80 → −15) at an even ~1.8 m/s in real time (`PLAY.real`), reaching the park edge at the same script moment (t ≈ 41.3) so position-timed events (tram crossing, robot, park lamps) stay put; the park stretch is unchanged; head bob at a steady real step rate.

Numbers: `spectra timeline` 0 warnings Orbit + Ground for all three scenarios; city draw calls 97/266/266 → 97/266/266. Shots exit 0: city -t 5 / 15 / 45 (t 15: early canyon at dusk with the street life; t 45: park edge as before).

Not verified: the 30 fps target on mid hardware (no headless measurement); draw calls only at the three timeline samples. The trail walk has the same fast-opening effect (outside M4).
