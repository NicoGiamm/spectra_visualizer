---
id: M4/T8
title: Instrument view: microwave surface crackle buries the IR heat leaks
status: done
labels: [gap]
started: 2026-11-21
completed: 2026-11-21
---

# M4/T8 — Instrument view: microwave surface crackle buries the IR heat leaks

## Goal

In the instrument view with IR and microwave on together (`--bands ir,micro`, the Thermal preset's neighbour), the
IR heat leaks around windows, the warm roofs, asphalt and the people stay legible: today the microwave surface
crackle covers nearly every facade and the street in an orange checkerboard. Each band should still read on its
own (`--bands micro` keeps its crackle; `--bands ir` its thermal palette), and the two combined should layer, not
bury one another. Same check on the trail and seaside, which use the same surface chunk.

## Plan

files: engine/render/surface.js, scenarios/city/world.js

- Measure first: shots `--bands ir`, `--bands micro`, `--bands ir,micro` at t 30 in all three scenarios.
- Tone the microwave surface term when IR is also on (lower coverage / contrast of the crackle, or blend so the
  thermal palette wins on surfaces while micro emitters stay bright) — in the shared chunk, not per scenario.
- Keep the microwave meter share unchanged (meters are tuned in a48e444).

## Acceptance

- [x] `spectra timeline`: 0 warnings in Orbit and Ground for all three scenarios, draw calls unchanged
- [x] `spectra shot city -t 30 --bands ir,micro`: window-frame heat leaks and warm roofs are clearly visible
- [x] `--bands ir` alone looks as before; `--bands micro` alone keeps its brightness-temperature physics readable (city, trail, seaside at t 30) — amended 2026-11-21, see Notes
- [x] Trail and seaside `--bands ir,micro` at t 30 inspected: no regression

## Notes

*2026-11-21:* third Acceptance item amended (was "`--bands micro` alone and `--bands ir` alone look as before"): the brief asked for finer, sparser crackle in micro alone too, because the old large tiles hid every micro emitter; recorded as a decision in mission.md. IR alone is unchanged within run-to-run noise (pixel diff city 1.7 % vs 2.1 % between two identical runs); micro alone differs on purpose (city 58 %, trail 37 % of pixels), seaside micro barely (6.8 %: the sea uses the seaside's own `seaBands` shader).

*2026-11-21:* not changed (scenario-owned): the seaside `seaBands` micro crackle (`cs = max(.4, dist*.012)`, ~0.7° cells) keeps a large foam-line checkerboard at the near shore and has no IR toning; the trail's `trailTerrain` mast coverage dashes are not IR-toned. Candidates for M5 / a trail gap.

## Outcome

The microwave term of the shared surface chunk (c94c5ba, engine/render/surface.js `surfBands`, +10/−4) now crackles in cells of ~0.1–0.2° that scale with distance (power-of-two world sizes so they stay put, 3-D cells so walls get square cells) instead of fixed 0.4 m cells that grew to tens of pixels up close. Spark coverage ~4–10 % (was ~10–35 %), with the per-cell orange/yellow tint on the sparks only over an even amber brightness-temperature wash; the transmitter field is soft-saturated in the instrument view. With IR also on, the wash scales by .15 and the sparks by .5, so the thermal palette carries the surfaces; multipath hit flashes and all Em/Rib/EmField emitters keep full brightness. Visible overlay and meter accounting unchanged; no new uniforms, varyings, draw calls or pow().

Numbers: `spectra timeline` 0 warnings Orbit + Ground for all three scenarios; draw calls unchanged (city 97/266/266, seaside 71/128/107, trail 82/149/162). Before/after shots at -t 30, all exit 0: city `--bands ir,micro` — window-frame heat leaks, cold glass and warm asphalt now read on both facades (scene luminance 92 → 67; checked by the main session); trail ir,micro — warm rocks visible (61 → 40); seaside nearly unchanged (sea uses its own shader); `--bands ir` alone unchanged within run-to-run noise; `--bands micro` alone deliberately finer (city 58 %, trail 37 % of pixels changed; logged decision, item 3 amended); city `--bands vis -t 30` pixel-identical; city all bands within noise; city `--bands micro -t 18 --yaw .2 --pitch .3` keeps both multipath hit flashes, now standing out with the Wi-Fi tints.

Not verified: t 5 / t 54 and Ground-detector shots; a dedicated roof shot; a real GPU (SwiftShader only; no new NaN risk). Not changed (scenario-owned): the seaside `seaBands` foam-line micro crackle (large cells, no IR toning) and the trail's `trailTerrain` mast dashes.
