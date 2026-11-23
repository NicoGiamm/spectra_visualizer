---
name: new-event
description: Add a new spectral event to spectra_visualizer — a shared sky/weather factory in engine/events/sky.js or a local one in scenarios/<id>/events.js — with its SPECTRUM processes, Em/Rib/EmField drawing, timing on the 0–60 axis and seeded-R-safe placement in events(). Use for "add an event", "make X glow in IR", "add a meteor/boat/antenna…".
argument-hint: "<what> [scenario id | sky]"
---

# new-event — one event, contract-complete

Arguments: `$ARGUMENTS`. The contract is `.claude/rules/events.md` + `.claude/rules/render.md` (they load as you
open the files); this is the procedure.

## Steps

1. **Physics first.** Name each physical process it shows. For each, find it in `engine/core/spectrum.js`
   (`SPECTRUM`); if missing, add an entry `{ name, f | lam | E, ground?, stylised? }` with a source comment — the
   band is derived, never chosen. Decide tags: `rare`, `time-compressed`, `stylised`.
2. **Where it lives.** Visible from every scenario's sky → factory `export const x = o => event({ … , ...o })` in
   `engine/events/sky.js`. Place-specific → `scenarios/<id>/events.js`. Copy the nearest existing event as the
   template (grep for one with the same bands).
3. **Timing & place.** `t0`/`t1` on 0–60 (one even pace, 120 s per walk). Sky objects: `dirAE(az, el)` inside `FOV_SKY`
   (engine/core/geom.js: az 210–330, el 0…60° for the whole visible path; `fovAz(u)`), setting below 0° → fade out. Filler events at the dense ends stay short.
4. **Drawing.** `init()` builds `Em` / `Rib` / `EmField` (crowds) — `real = 1` for moving warm bodies; random
   placement from `R` only. `update()` computes from `S.t`/`S.T` and `set()`s every source it wants visible this
   frame, resetting sizes/intensities. `where()` a method when it reads `this`. Solids → `solid()`, visible-only
   sprites → `visOnly()`.
5. **Register** it in the scenario's `events()` (`scenarios/<id>/main.js`) **after the existing list** — never in
   the middle (seeded `R`).
6. **Verify** with `/verify-scene <ids>`: timeline physics check 0 warnings (declared bands = `freq` bands = drawn
   bands), the event visible in shots inside `t0`–`t1` and in an instrument view of its bands.
7. It is a task of a mission (add one with `mission-tracker add-task` if none fits); close it with evidence. The
   mission's review (`/ship`) runs `reviewer` + `physics-auditor`.

## Related

- docs/technical.md § "Writing a scene or an event"; `engine/core/events.js` (`event()`); `engine/render/sources.js`.
