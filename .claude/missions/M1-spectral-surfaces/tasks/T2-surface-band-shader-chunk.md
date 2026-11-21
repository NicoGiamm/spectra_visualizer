---
id: M1/T2
title: Surface band shader chunk
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
---

# M1/T2 — Surface band shader chunk

## Goal

**Surface band shader chunk.** `engine/render/surface.js`: a GLSL chunk + `spectral(material, props)` that patches `MeshStandardMaterial`s
(onBeforeCompile) and is included by custom shaders (sea, buildings). Per active band it adds:
- **IR**: `thermal()` palette of `eIR·T` (radiance-ish), with grazing-angle emissivity drop (water/glass reflect
  the cold sky near the horizon → realistic darker far sea and window panes).
- **Microwave**: brightness temperature `Tb = eMW·T + (1−eMW)·Tsky` in the crackle look — calm sea reads
  *cold*, land warm, foam warmer than open water.
- **Radio**: illumination by up to 8 active radio transmitters (uniform arrays: position, power), `1/r²`,
  Lambert, `rRadio` — broadcast towers paint the slopes/facades in moving dashes.
- **UV**: `uvAlb × UV skylight(t)` (fades with the sun) — snow fields and sand glow violet at dusk, grass doesn't.
- **Gamma**: Poisson-like scintillation speckle (hash on world cell × time) scaled by `gamma` — granite and
  building stone sparkle sparsely, the sea is almost silent.
- **X-ray**: nothing (honest; the ground is dark in X-rays).
Visibility rule: full strength in instrument view (Visible off); **15–20 %** overlay when Visible is on
(tunable `SURFACE_OVERLAY`, maybe a HUD slider). Replaces `topoMat`/`gridMat` thermal hacks; contour/grid
lines stay as a faint structural cue.

## Plan

files: engine/render/surface.js

- Migrated from plan step 1.2; the Goal is the step text verbatim.

## Acceptance

- [x] Delivered as the Goal states (see Outcome; deviations in Notes)

## Notes

*Checked 2026-11-21:* `surfBands()` in `surface.js` has the IR (grazing-angle emissivity drop via gloss), microwave
Tb + transmitter field, radio (≤8 transmitters, Lambert, distance falloff, dashes, `rRadio`), UV, gamma speckle
terms and no X-ray term; `spectral()` patches `MeshStandardMaterial`s via `onBeforeCompile`, the seaside sea
shader calls `surfBands()` itself. Overlay is `OVERLAY = .12` (not 15–20 %), no HUD slider. Trail and seaside no
longer use `topoMat`/`gridMat`; the city still uses `gridMat` (1.6).

## Outcome

Verified by reading the code on 2026-11-21 (commit ba7c34f); see Notes.
