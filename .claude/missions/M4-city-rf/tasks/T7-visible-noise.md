---
id: M4/T7
title: Visible view: RF haze blocks in the sky, overexposed windows and shop fronts
status: backlog
labels: [gap]
started:
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

