---
id: M4/T2
title: Multipath bouncing
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
---

# M4/T2 — Multipath bouncing

## Goal

**Multipath bouncing.** Engine helper `bounce(origin, dir, boxes, maxHits)` reflecting rays off the
city's axis-aligned building boxes (exported by `world.js`). The mast and a few strong APs emit short-lived
rays that reflect 2–4 times down the canyon as `Rib` polylines, fading per bounce (≈ −6 dB each), dashes moving
outward. Facades hit by rays flash in the radio/micro surface term (1.2).

## Plan

files: engine/world/bounce.js, scenarios/city/rf.js

- Migrated from plan step 4.2; the Goal is the step text verbatim.

## Acceptance

- [x] `bounce(origin, dir, boxes, maxHits)` engine helper; rays reflect 2–4 times down the canyon as `Rib`s fading ≈ −6 dB per bounce
- [x] Facades hit by rays flash in the radio/micro surface term
- [x] `spectra shot city` at -t 5 / 30 / 54 and `--bands micro,radio`: exit 0, images inspected

## Notes

*2026-11-21:* implemented on main in a9adb2f ("City Phase 4: RF ecosystem & street life comes alive"), before missions existed, and never reviewed or ticked in the plan. Verify against the Acceptance; 6604214 already corrected TETRA back to 390 MHz (micro) after a review found the frequency had been moved to fit a band.

*2026-11-21:* 82e40cf made the hits flash on the facades via the shared surface term (`addHits`, `uHitM`, ≤ 12 hits), re-aimed the rays across the canyon and gated the event to its window.

*2026-11-21:* "radio/micro surface term" is met as micro only: the multipath processes (nr35, wifi24, wifi5) are all microwave, so a radio hit term would be wrong physics.

*2026-11-21:* the fade is −6 dB in drawn intensity (×¼); the earlier ×½ "field amplitude" was −3 dB as drawn. Legs after 4 hits fall under the Rib cutoff; their facade flash still shows. "Dashes moving outward" is the travelling packet slice — the micro ribbon style is crackle, not dashes.

*2026-11-21:* also fixed in scope (84df135): 1-hit rays re-drawn (hashed, no R()), last leg absorbed at the next surface (bounce.js), rays aimed mostly west and routers chosen just ahead of the viewer.

## Outcome

Verified the multipath event against the Acceptance and fixed four things in it (84df135, engine/world/bounce.js + scenarios/city/rf.js). `bounce(origin, dir, boxes, maxHits)` reflects 8 `Rib('micro')` packets (2 from the 5G mast panels, 6 from the routers just ahead) off the city's `BOXES` and the street; a 22 m packet slice travels outward along each path. The per-bounce fade was ×½ on shaders that scale intensity linearly (−3 dB as drawn); it is now ×¼ (−6 dB in power) for the ribbons and the facade hit flashes (`addHits('micro')`, ≤ 12 hits per frame in the shared surface term), comment and note match. Rays that escaped after one hit are re-drawn (hashed, no R()) so each reflects 2–4 times; the last leg now stops at the next surface instead of passing through walls and the ground; rays are aimed mostly west because most hits used to fall behind the viewer. The event is tagged `stylised` + `time-compressed` (real packets travel at c; M4 audit #4).

Numbers: `spectra timeline` 0 warnings Orbit + Ground for all three scenarios; city draw calls 97/246/244 → 97/243/244 (faint legs now under the Rib cutoff, packets end at the next surface). Shots exit 0: city -t 5/30/54, `--bands micro,radio -t 30`; aimed `-t 18 --yaw .2 --pitch .3 --bands micro` shows two white hit flashes on opposite facades and packets crossing the canyon (also checked by the main session).

Not verified / deviations: flashes in Ground mode (timeline only); flashes are microwave only (all processes are microwave, no radio hit term); with Visible on they are faint at the fixed .12 overlay; in micro instrument views the surface crackle makes the packets hard to pick out (T8); late in the walk (t ≳ 45) router windows are behind the viewer, so only mast rays reach the view.
