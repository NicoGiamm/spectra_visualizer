---
id: M4/T7
title: Visible view: RF haze blocks in the sky, overexposed windows and shop fronts
status: done
labels: [gap]
started: 2026-11-21
completed: 2026-11-21
---

# M4/T7 — Visible view: RF haze blocks in the sky, overexposed windows and shop fronts

## Goal

With all bands on (and with Human eye), the city reads as a city at night, not as noise: the microwave haze no
longer draws clusters of large blocky orange squares in the sky and over the park trees, and lit windows / shop
fronts are not flat, overexposed white panels — they keep a warm interior hue and some variation. Proven by
`spectra shot city` at t 5 / 30 / 54 compared with the 2026-11-21 shots (a48e444), where both problems are visible.

## Plan

files: scenarios/city/rf.js, scenarios/city/world.js, scenarios/city/street.js

- Find what draws the blocky squares at t 30 in the sky (haze patches from 5e7b36b vs other micro sources: shoot
  `--bands micro` and toggle candidates); keep the haze inside the street canyon and below roof height, and make
  its crackle fine-grained rather than large blocks.
- Lit windows / shop fronts: find why near panes saturate to white (emissive × lit fraction × bloom threshold .9);
  cap them below the bloom threshold, keep the warm tint and per-window variation.
- No new events; keep draw calls ≤ the a48e444 numbers (97/246/244 Orbit).

## Acceptance

- [x] `spectra timeline`: 0 warnings in Orbit and Ground for all three scenarios, city draw calls noted (≤ 97/246/244)
- [x] `spectra shot city -t 30` (all bands) and `--bands vis`: no large blocky squares in the sky or over the trees
- [x] Near lit windows and shop fronts show a warm hue with variation, no flat white panels (t 30 and t 54)
- [x] `spectra shot city --bands micro -t 30`: the haze is still visible in the canyon and fades toward the park

## Notes

*2026-11-21:* the haze half is done in M4/T3 (561c5ab): no haze blocks in the sky or over the trees at -t 30. Still open here: blocky clusters on the right (north) facade at -t 30 are Wi-Fi routers a few metres away drawn at 1.3 m with the 26-cell micro crackle (`events.js` `wifi`, `this.f.set(k, q.p, q.shop ? 1.6 : 1.3, …)`) — shrink with distance like the haze (size = min(1.3, k·d)); the 5G mast's 38 m glow (`events.js` `this.big.set(MAST.top, 38, .55)`) has the same large-cell look when on screen; the flat white windows / shop fronts.

*2026-11-21:* found in T5: with only Visible on (Human eye) at night the street, sidewalks and facade walls render solid black, even under lit lamps (T5 shot at -t 35 vis only); in all-bands view they look lit only because the IR/micro surface overlays paint them. In scope here ("with Human eye, the city reads as a city at night"): lamps should light the asphalt and sidewalks, facades should keep some ambient/moonlit value. Check whether it regressed with the 1.6 surfaces (519656e/a9adb2f) vs the pre-mission city (e6843ca had merged light-pool meshes).

*2026-11-21:* the black street was not a regression — e6843ca was the same: hemi-only night lighting on near-black albedos plus 14 m additive pools 24 m apart. Fixed with a per-pixel `streetLight()` term (nearest 16 lamps + city ambient) in the visible material, not real lights (06a6d40). Deviation: asphalt 0x111214 → 0x26272a (the old ~.0056 linear albedo can't be lit visibly through the ACES toe without blowing out kerbs and facades). Lamp brightness `LAMP_LUX` is tuned by eye, not calibrated.

*2026-11-21:* draw calls are 97/266/266, above this task's "≤ 97/246/244": the extra 22 come from T5's vapour plumes and manhole steam (b3dbce2), not from T7, which adds none. Remaining: a few shop fronts read pale grey at -t 35 (closed shops with a night light under lamp light); the shop sign boxes read flat white / pale blue up close in vis (`streetProps` sign material); the granite kerb top is a stark white line under the lamps; the mast sector panels were not on screen in the aimed shots after a mid-run fix (code verified).

## Outcome

With Human eye (Visible only) at night the city now reads as a lit street (06a6d40, scenarios/city/world.js + events.js, no engine files). Cause of the black street/walls (also present in e6843ca): night lighting was the hemi light (~.02) on near-black albedos, plus 14 m additive pool meshes 24 m apart. A per-pixel `streetLight()` term in the visible material of the street surfaces, buildings and parked cars now takes the nearest 16 lamps (LED white or HPS strike → orange incl. warm-up; 1/d², Lambert, full cutoff, house-side shield, soft knee under the bloom threshold) plus a city-glow/moon ambient; the merged pool mesh takes over beyond 62–88 m. Asphalt lightened 0x111214 → 0x26272a. Windows peak ~.4 linear (was ~.87) with warm incandescent / warm LED / cool LED-TV hues, dimmed and curtained variants and the same cell seeds as the IR heat leaks; shop fronts ~.18 (was ~.52). Wi-Fi and 5G-mast micro glows shrink with distance (size ≤ 0.1·d) like the T3 haze; the haze half of this task was done in T3 (561c5ab).

Numbers: `spectra timeline` 0 warnings Orbit + Ground for all three scenarios; city draw calls 97/266/266 → 97/266/266 (the task's ≤ 97/246/244 was set before T5 added 22 vapour/steam ribbons). Shots exit 0, before/after: city -t 5/30/54 all bands, `--bands vis -t 30/35/54`, aimed -t 30 and -t 54, `--bands micro -t 30`, mast views -t 10/30. Main session re-checked: vis -t 35 (grey street, lit sidewalk, kerb and facade base, lit parked car — before: black with one white patch), vis -t 30 (warm tan shop fronts), aimed -t 30 (amber/peach windows with curtains and a few cool ones), timeline. New shader is NaN-safe (inversesqrt of max(d², 1e-4), +4 in the falloff, non-negative terms into the soft knee).

Not verified / remaining: real-GPU cost of the 16-lamp loop per fragment; lamp brightness tuned by eye; mast sector panels not on screen after a mid-run fix (code checked); a few shop fronts pale grey at -t 35; shop sign boxes flat white / pale blue up close; the granite kerb top a stark white line under the lamps.
