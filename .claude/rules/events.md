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
   playback `t += dt * PLAY.speed(t)`: 4× fast-forward through the opening, easing to half speed between t 16 and 22,
   ~90 s per walk; the slider runs in real seconds, `PLAY` in `engine/core/util.js`). An event before t≈20 is on screen
   only a quarter as long as one later — give early events enough script time to be noticed. Read `t`/`T`/`on`/`camera` from `S` (`engine/core/state.js`).
2. **`update()` must reset sizes/intensities every frame** — the loop hides every source first; what isn't `set()`
   this frame is invisible.
3. **`where` must be a method, not an arrow, when it reads `this`** (ES modules: arrow `this` is undefined).
   `where: () => null` is fine.
4. **Every event lists its physical processes in `freq: [...]`** — keys of `SPECTRUM` in `engine/core/spectrum.js`
   (exactly one of `f` Hz / `lam` m / `E` eV; the band is derived by `bandOf()`, `ground: false` = absorbed by the
   atmosphere, `stylised: true` = not real as drawn). **Add new processes there rather than guessing a band**; never
   invent a frequency — cite the source in a comment. Optional `tags: ['rare' | 'time-compressed' | 'stylised' |
   'common']` (panel badges, `engine/ui/style.css`). A `ground: false` process needs its source built with origin
   `'high'`/`'space'` (render rule 1). `spectra timeline` must stay at 0 warnings: it flags unknown keys, an event
   with no `freq`, a declared band without a process, a process band not declared, a drawn band not declared, and in
   Ground mode an absorbed band still drawn or a reachable band hidden.
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

- Detector default is **Orbit** (user decision, Q1 — recorded in mission M2): everything is drawn; in Ground mode (one click,
  `?detector=ground`) `ground: false` processes are hidden with ghost markers. `spectra timeline` reports in Orbit
  and re-runs the physics check in Ground mode — both must stay at 0 warnings.
- The night is deliberately "one improbable night" (supernova + GRB + FRB + comet): such events carry
  `rare` / `time-compressed` tags rather than being removed (open question Q2, undecided).
- The per-event physics verdicts (M2's `audit.md`, historical) are a comment on the M2 issue (#8,
  `gh issue view 8 --comments`); the M2 branch is gone. Apply them, don't re-derive.
