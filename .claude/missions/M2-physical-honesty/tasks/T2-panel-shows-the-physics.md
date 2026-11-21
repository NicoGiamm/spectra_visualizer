---
id: M2/T2
title: Panel shows the physics
status: done
labels: []
started: 2026-11-21
completed: 2026-11-21
---

# M2/T2 — Panel shows the physics

## Goal

**Panel shows the physics.** Event chips show the process and frequency/wavelength on hover
(`Wi-Fi 2.4 GHz · 12.5 cm`), plus a tag: `common` / `rare` / `time-compressed` / `stylised`. Script-time
compression (e.g. air showers last µs, not seconds) is labelled.

## Plan

files: engine/ui/hud.js, engine/ui/style.css

- Migrated from plan step 2.2; the Goal is the step text verbatim.

## Acceptance

- [x] Delivered as the Goal states (see Outcome; deviations in Notes)

## Outcome

*From the plan's progress note "2026-11-21 · 2.1, 2.2, 2.3-sky done":*

- **2.1** `bands.js`: `TRANSMIT` (band × `origin` 'ground'/'high'/'space' → transmission + `why` strings) and `ABSORB_AT`
  km/label per band; `S.detector` in `state.js` (default `ground`, Q1). `Em/Rib/EmField` take an optional last ctor arg
  `origin`; in Ground mode absorbed sources are not drawn, add no meter activity, and leave one ghost (pos + band set)
  per event in `S.ghosts` (`render/sources.js`); the overlay draws a dashed ring + "Far-UV + X-ray absorbed ~40–50 km"
  (≤12/frame, only for bands left on, `drawGhosts` in `hud.js`). HUD button "Detector: Ground/Orbit" (`style.css`
  chip/btn), `app.js` `?detector=` and `updateEvent()` setting `S.curEvent`; the `?dump` report gains `detector` and
  per-event `absorbed` bands. Tools: `shot --detector`, `timeline --detector`; the physics check now warns on
  "draws absorbed band in Ground mode" and "hides a band whose processes reach the ground".
- **2.2** Panel (`hud.js evHtml`): band chips hover with their processes ("Mode S transponder reply · 1.09 GHz · 27.5 cm",
  `describe()` from `spectrum.js`); absorbed chips get dashed border + strike-through (`chip.abs`) and a title ending
  "Absorbed before the ground: …why. Switch Detector to Orbit to see it."; a "From the ground: … absorbed high in
  the atmosphere." note when partial; tag chips `common / rare / time-compressed / stylised` (`style.css .tag-*`).
- **2.3 sky-library group** (audit applied; trail/seaside/city groups untouched): airliner Mode S/ADS-B → micro bursts,
  radio now VHF airband voice; meteor UV `origin:'high'`; pulsar/comet/BH-binary/supernova/GRB X-rays and comet Lyman-α
  UV, lunar & shower gamma, auroral UV/X-ray, NLC UV → `'space'`/`'high'` (ghosted from the ground); shower gamma cascade
  `'high'`, its X-ray shaft and `showerXray`/`halo*`/`akr` spectrum entries removed, `showerRadio` (30–80 MHz geosynchrotron)
  added, `time-compressed` tag; sun dogs moved to ~22° with the spherical azimuth offset + red inner edge; "zodiacal scatter"
  replaced by `crepuscularRays` (t 2–12) + `purpleLight` (t 8–16) + real `zodiacalLight` cone wired into trail/seaside only
  (alias kept for old lists); moon halo: IR companion ring and 29° ring dropped, upper tangent arc ("gull wings") added;
  moonrise `common`; GRB screen flash gated on `S.detector === 'orbit'`; FRB note relabelled as dispersion; thunderstorm
  note names VLF sferics and ground-detected leader X-rays/TGF.
- Screens checked: `timeline` 0 warnings all three scenarios (Ground default, and Orbit);
  `shot` exit 0: trail t 5/30/40/54 and t 45 `--bands xray,gamma` (ghost rings at pulsar/moonrise, thunderstorm X-rays
  and TGF still drawn at the ground), seaside t 5/10/30/40/54 (purple light + rays at 10, tangent-arc halo at 54),
  city t 5/30/40/54. Screenshots in `shots/`.
- The aurora substorm rework (growth/breakup/recovery, NW horizon, near-IR + VHF radar bands, UV/X-ray `'high'`)
  landed ahead of schedule in this diff — Phase 3 steps still need their own verification/tick.
