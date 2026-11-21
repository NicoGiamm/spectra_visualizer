---
id: M4/T7
title: Visible view: RF haze blocks in the sky, overexposed windows and shop fronts
status: in-progress
labels: [gap]
started: 2026-11-21
completed:
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

- [ ] `spectra timeline`: 0 warnings in Orbit and Ground for all three scenarios, city draw calls noted (≤ 97/246/244)
- [ ] `spectra shot city -t 30` (all bands) and `--bands vis`: no large blocky squares in the sky or over the trees
- [ ] Near lit windows and shop fronts show a warm hue with variation, no flat white panels (t 30 and t 54)
- [ ] `spectra shot city --bands micro -t 30`: the haze is still visible in the canyon and fades toward the park

## Notes

*2026-11-21:* the haze half is done in M4/T3 (561c5ab): no haze blocks in the sky or over the trees at -t 30. Still open here: blocky clusters on the right (north) facade at -t 30 are Wi-Fi routers a few metres away drawn at 1.3 m with the 26-cell micro crackle (`events.js` `wifi`, `this.f.set(k, q.p, q.shop ? 1.6 : 1.3, …)`) — shrink with distance like the haze (size = min(1.3, k·d)); the 5G mast's 38 m glow (`events.js` `this.big.set(MAST.top, 38, .55)`) has the same large-cell look when on screen; the flat white windows / shop fronts.

*2026-11-21:* found in T5: with only Visible on (Human eye) at night the street, sidewalks and facade walls render solid black, even under lit lamps (T5 shot at -t 35 vis only); in all-bands view they look lit only because the IR/micro surface overlays paint them. In scope here ("with Human eye, the city reads as a city at night"): lamps should light the asphalt and sidewalks, facades should keep some ambient/moonlit value. Check whether it regressed with the 1.6 surfaces (519656e/a9adb2f) vs the pre-mission city (e6843ca had merged light-pool meshes).

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
