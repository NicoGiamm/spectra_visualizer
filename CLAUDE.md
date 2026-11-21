# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

First-person 3D scenes (three.js) that play a 2-minute sunset-to-night timelapse with events emitting across the electromagnetic spectrum; bands can be filtered live. A shared **engine** (`engine/`, plain ES modules, no build) runs **scenarios** (`scenarios/<id>/`: `trail`, `seaside`, `city`). Python tooling in `src/spectra_tools/` (cyclopts CLI `spectra`, run with `uv run`) discovers, serves, bundles and screenshots them. See README.md for the layout and contracts.

- `uv run spectra serve` — dev server (ES modules don't load over file://); also regenerates root `index.html`.
- `uv run spectra build [ids…]` — `dist/<id>.html` single files (each module inlined as a `data:` URL in the import map) + `dist/index.html`; also regenerates root `index.html`. Root `index.html` and `dist/` are generated from `engine/ui/landing.html` — edit the template.
- `uv run spectra timeline [ids…]` — headless `?dump`: event gantt, per-band activity vs meter tops, scene draw calls, and a physics check (declared bands ↔ `freq` processes ↔ bands actually drawn). Keep it at 0 warnings; compare draw calls before/after perf work.
- `uv run spectra shot <id> -t 30 [--yaw .3 --pitch .5 --bands ir,micro] -o out.png` — headless render; prints grouped console messages (shader compile logs included) and exits 1 on any. **Run it after every change**; there is no lint or test suite.

**Roadmap:** `.claude/plans/improvement-plan.md` is the multi-step plan (spectral surfaces, physical realism, aurora, city RF density). Work it step by step, in phase order.

## Workflow

`.claude/sdlc.md` defines the lifecycle: **frame → explore → plan → implement → verify → review → commit**, sized by lane (trivial / standard / large), with a definition of done. In short:

- `/plan-step [id]` runs one roadmap step end to end; `/verify-scene [ids]` is the test suite (timeline at 0 warnings + shots at 3 moments + an instrument view, PNGs inspected); `/ship` commits by explicit path and never pushes unasked. `/new-event`, `/new-scenario` scaffold to contract.
- Agents: `step-dev` implements **one** plan step at a time on `main` (never parallel, never commits); `reviewer` (fresh context, read-only) before every non-trivial commit; `physics-auditor` when events or `spectrum.js` change.
- Detailed conventions are path-scoped rules in `.claude/rules/` (`render`, `events`, `sky-world`, `tooling`, `plan`) and load when you touch matching files. Hooks: generated files (root `index.html`, `dist/`) are refused; `.js` edits are checked for bundler-breaking imports, arrow `where` + `this`, and `Math.random`.

## Conventions that hold everywhere

- Imports: engine modules import each other relatively; scenarios import the engine as `spectra/...` (import map in each `index.html`) and their own files relatively. The bundler regex only recognises `import`/`export … from` at the start of a line — keep imports static and on their own lines.
- **New spectral sources use `Em`/`Rib` (crowds: `EmField`), never hand-drawn meshes**; band effects live in GLSL (`engine/render/shaders.js`).
- **Every event lists its physical processes** in `freq: [...]` — keys of `SPECTRUM` in `engine/core/spectrum.js`; add new processes there rather than guessing a band.
- **Seeded randomness**: layouts and event `init()`s draw from the shared `R` (`engine/core/util.js`) in list order, never `Math.random`, so scrubbing repeats. New events go **after** the existing list in `events()`.
- **Front is azimuth 270 (west, −z) in every scenario**; view clamp yaw ±1.35, pitch −0.1…1.5 — keep sky azimuths ~205–340 and above the horizon. **One shared timeline** (`engine/world/atmosphere.js`) for sun, moon, lights.

## Verifying visually

`uv run spectra shot` finds the Playwright-cached `chrome-headless-shell` under `~/.cache/ms-playwright/` (or `$SPECTRA_CHROME`) and renders with SwiftShader — slow (~30 s), but it compiles every shader. Check several moments (`-t 5`, `30`, `54`) and an instrument view (`--bands ir,micro`). Drag-to-look can't be exercised; use `--yaw/--pitch`. Write screenshots to the scratchpad, not the repo (`shots/` is git-ignored).
