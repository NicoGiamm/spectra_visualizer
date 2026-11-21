---
paths:
  - "engine/events/**"
  - "engine/core/events.js"
  - "engine/core/spectrum.js"
  - "scenarios/*/events.js"
  - "scenarios/*/rf.js"
  - "scenarios/*/main.js"
---

# Events — the timeline contract and its physics

An event is one object holding its panel metadata and its drawing. Shared sky/weather events are
factories in `engine/events/sky.js`; the observer's own (phone, headlamp) in `engine/events/observer.js`;
place-specific ones in `scenarios/<id>/events.js`. Every event declares the physical processes it shows.

## Guardrails

1. **Events are objects `{ name, t0, t1, bands, note, init(), update(), where() }` on the 0–60 script axis** (`S.t`;
   playback `t += dt * .5`, slider 0–120). Read `t`/`T`/`on`/`camera` from `S` (`engine/core/state.js`).
2. **`update()` must reset sizes/intensities every frame** — the loop hides every source first; what isn't `set()`
   this frame is invisible.
3. **`where` must be a method, not an arrow, when it reads `this`** (ES modules: arrow `this` is undefined).
   `where: () => null` is fine.
4. **Every event lists its physical processes in `freq: [...]`** — keys of `SPECTRUM` in `engine/core/spectrum.js`
   (f / λ / E; bands are derived, `ground: false` = absorbed by the atmosphere, `stylised: true` = not real as drawn).
   **Add new processes there rather than guessing a band**; never invent a frequency — cite the source in a comment.
   Optional `tags: ['rare' | 'time-compressed' | 'stylised']`. `spectra timeline` must stay at 0 warnings.
5. **Seeded `R` order: append new events after the original list** in each scenario's `events()`; `init()`s draw
   from `R` in list order, so inserting one in the middle reshuffles every layout after it (fixed in 0b4d29e). A
   replacement may take a removed event's slot only if it makes the same number of `R()` draws (see the comment in
   `scenarios/trail/main.js`). The trail's order matches the original single file.
6. **When retiming a library event, check what its `update()` hard-codes** — a phase computed from literal times
   doesn't follow a changed `t0`/`t1`.
7. **Keep the ends of the timeline dense but filler events short-lived** (sun dogs, crepuscular rays, green flash,
   gulls early; noctilucent clouds, moon halo, spark draft, fireworks late).
8. **Growing structures store a node table** (air showers: `nd` rows `{ n, az, el, j, a, b, lv, w }`, lerped from the
   parent's current point by `f = clamp((g - a) / (b - a))`; `chain` drives the shaft).

## Non-derivable facts

- Detector default is **Ground** (plan Q1): `ground: false` processes are hidden with ghost markers; Orbit is one
  click away (`S.detector`, `?detector=`).
- The night is deliberately "one improbable night" (supernova + GRB + FRB + comet): such events carry
  `rare` / `time-compressed` tags rather than being removed (plan Q2).
- The per-event physics verdicts live in the plan's "Audit of existing events" table; apply them, don't re-derive.
