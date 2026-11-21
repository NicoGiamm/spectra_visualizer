---
id: M2/T3
title: Event audit — apply the verdicts
status: backlog
labels: []
started:
completed:
---

# M2/T3 — Event audit — apply the verdicts

## Goal

**Event audit — apply the verdicts below.** One commit per group (sky library, trail, seaside, city).
Groups: sky library [x] · trail [x] · seaside [ ] · city [ ].
(Trail group's last open verdict — "phone also does Bluetooth bursts" — done 2026-11-21 in the shared observer.)

The verdicts are in [`../audit.md`](../audit.md).

## Plan

files: engine/events/sky.js, scenarios/seaside/events.js, scenarios/city/events.js, engine/core/spectrum.js

- Migrated from plan step 2.3; the Goal is the step text verbatim.

## Acceptance

- [x] Sky library group applied (2026-11-21, see Notes)
- [x] Trail group applied (2026-11-21, see Notes)
- [ ] Seaside group: lighthouse Fl(2) 10 s + AIS AtoN instead of radio beacons; container ship S-band radar + crew phones; green flash tagged `rare`
- [ ] City group: street lights mixed old sodium (near-IR tail) and LED (no IR, slight blue)
- [ ] `spectra timeline seaside city`: 0 warnings, draw calls noted against the last Outcome
- [ ] `spectra shot seaside city` at -t 5 / 30 / 54 and an instrument view of the changed bands: exit 0, images inspected

## Notes

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

*From the plan's progress note "2026-11-21 · review fixes (seeded R order, warm rocks, Bluetooth, meters 1.3, plan corrections)":*

- **Seeded R order:** `scenarios/trail/main.js` lists the pre-existing events in their e6843ca order again
  (`crepuscularRays` in the old `zodiacalScatter` slot, same 18 `R()` draws; removed `thermalUpdraft`/`fireWhirl`
  drew none) and appends the new ones (`cellMast`, `weatherStation`, `mountainStream`, `gnss`, `cows`,
  `sunWarmedSlope`, `farHikers`, `sparkDraft`, `purpleLight`, `zodiacalLight`, `valleyFog`). Seaside gets the same
  layout (`purpleLight`, `zodiacalLight`, `seaMist` appended; they draw no `R()`, so its values were already
  unchanged). Checked with a temporary `R()` call counter in throw-away copies of e6843ca and the fixed tree: every
  pre-existing event starts at the same stream index with the same draw count in both scenes (before the fix the
  air showers drew different values — 272 vs 273 ribbons).
- **1.4 warm rocks:** Ems only for the 5 largest `NEAR_ROCKS` (by size, no `R()`); trail IR field instances 274 → 257.
- **2.3 trail / Hiker:** `bluetooth` process (2.44 GHz) in `spectrum.js` (engine section), listed in the observer's
  `freq`; a second micro `Em` blips twice about every 1.5 script-s at ~⅓ of the LTE ping. Trail/seaside notes
  mention it (city note untouched for the pending city work). The phone sits below the default view, so the
  blip is not visible in the standard screenshots.
- **1.3 meters:** area-weighted terrain `surfMean`; `METER_NORM` micro 1.6 → 4.2, ir 2.1 → 10, vis 3.6 → 18
  (city overrides these three, unchanged). `spectra timeline` before: trail "meters above 0.9 for >20 s: micro
  (60 s), ir (60 s), vis (45 s)", seaside "vis (48 s)"; after: no such line for trail or seaside (Ground and
  Orbit); typical/peak fill trail micro .73/.94, ir .83/.88, vis .83/.98, seaside micro .28/1.00, ir .28/.66,
  vis .52/.89. City still reports micro/ir/vis (60 s) — left for the city retune.
- Plan: 1.1–1.3 ticked after reading the code (deviations noted under each step), 1.5 gamma order corrected, 5.1 →
  `[~]`, Phase 3 note, Q1/Q3 recorded.
- Verified after every change: `spectra timeline` 0 warnings in all three scenarios; `spectra shot` exit 0 for
  trail t 5/30/54, seaside t 30, city t 30 and trail t 30 `--bands ir,micro`.

## Outcome

<Written by `mission-tracker task <ref> --done --evidence <file>`: what changed, numbers, shots, what was not verified.>
