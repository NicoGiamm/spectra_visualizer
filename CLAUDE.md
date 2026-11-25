# Spectra Visualizer

First-person three.js scenes (`trail`, `seaside`, `city`, `aurora`, `storm`, `volcano`, `ocean`, `orbit`) playing a 2-minute
timelapse — sunset into night, or one orbit for `orbit` — in which events
emit across the electromagnetic spectrum; bands can be filtered live. A shared **engine** (`engine/`, plain ES
modules, no build step) runs **scenarios** (`scenarios/<id>/`); Python tooling (`src/spectra_tools/`, CLI
`spectra`) serves, bundles, screenshots and audits them. README.md is the front page; docs/technical.md has the layout, the rendering model and the scenario/event contracts.

## Commands

| Command | What it is for |
|---|---|
| `uv run spectra serve` | dev server (ES modules don't load over `file://`) |
| `uv run spectra build [ids…]` | `dist/<id>.html` single files + landing page |
| `uv run spectra timeline [ids…]` | event gantt, meter fill (peak, s > 0.9), draw calls at t 5/30/55, **physics check in Orbit and Ground — keep it at 0 warnings** |
| `uv run spectra shot <id> -t 30 [--bands ir,micro] [--yaw .3 --pitch .5] -o <png>` | headless render; exits 1 on any console/shader message |

There is no test suite: `timeline` + `shot` are the tests (`/verify-scene` runs both and inspects the PNGs).
Python (≥ 3.11) runs through `uv`, CLIs use cyclopts, and it stays **ruff**-formatted/linted and **ty**-checked
(`uv run ruff format . && uv run ruff check . && uv run ty check`) — a hook does it on every `.py` edit and
`ship merge` gates on it.

## How work is done

Every change is a task of a **mission**. The plan lives in **GitHub Issues** (user decision 2026-11-22): a mission
is a parent issue `M<N> — <title>` (label `mission`), each task a sub-issue `M<N>/T<k> — <title>` (label `task`),
all on project 4 "Spectralmap"; no planning files in the repo. The code goes on one branch `mission/M<N>-<slug>` +
one worktree under `.claude/worktrees/`. The lifecycle — propose → user approves → start → per task explore / plan
/ implement / verify / commit → fresh-context review → user's OK → `--no-ff` merge — is defined in `.claude/sdlc.md`.

- `/mission-tracker` — `list`, `next`, `show`, `propose`, `add-task`, `approve`, `start`, `task M<N>/T<k> [--done
  --evidence f]`, `log`, `check [M<N>]`. Issues are created, moved and closed only through it (and `ship merge`);
  `check` is a gate — `start`, `task`, `ship review-brief` and `ship merge` refuse while a mission has findings.
- `/verify-scene` — the test suite. `/ship` — review gate and merge into `main`. `/new-event`, `/new-scenario`.
- Agents: `step-dev` (one task per agent in the worktree, never commits; parallel only for tasks the cli accepts as
  independent — disjoint `files:`, no `Depends on:`), `reviewer` (read-only, before every merge),
  `physics-auditor` (events and `spectrum.js`).
- Commits on a mission branch carry `(refs M<N>/T<k>)` (an extra `#<issue>` is fine); nothing is committed straight
  on `main` unless the user says so (`[no-mission]`); never push unasked. Hooks enforce this.

## Conventions that hold everywhere

- **Physics first, stylisation second.** The look per band is stylised; *what* emits, how much and when follows
  real physics. Every event lists its processes in `freq: [...]` (keys of `SPECTRUM`, `engine/core/spectrum.js`);
  add a sourced process there rather than guessing a band; tag what is `stylised`, `rare` or `time-compressed`.
- **The spectral eye is the view** (`engine/render/compose.js`, M10): one multi-output scene pass, every band adapted
  by its own receptor, diffraction, photon grain / speckle, air and matter per band, band skies, asinh combine. `?eye=0`
  is the pre-eye view (fixed `GAIN`, `OVERLAY`, instrument view), kept for comparison. Render rules: `.claude/rules/render.md`.
- **Sources vs surfaces.** Glowing things use `Em` / `Rib` / `EmField` (crowds: one instanced draw); a source
  emitted above the absorbing air takes origin `'high'`/`'space'` (`TRANSMIT`, `engine/core/bands.js`) so Ground
  mode hides it. The landscape's own emission comes from `PRESET`s (`engine/render/surface.js`, `A`/`B`/`C`
  packing, `C.yzw` = transmission for the eye); every value cites a source key from that file's header or says
  STAND-IN. One table per fact.
- **Seeded randomness.** Layout and `init()` draw from `R` (`engine/core/util.js`) in list order — new events go
  after the existing list; `Math.random` only for visual-only jitter.
- **One shared sky.** Front is azimuth 270 (west) everywhere, view clamp yaw ±1.35 / pitch −0.1…1.5; one timeline
  (`engine/world/atmosphere.js`) drives sun, moon and lights for every scenario.
- **Imports** are static, one per line (the bundler's regex inlines them); scenarios import the engine as `spectra/…`.
- **Budget:** the city stays under ~400 draw calls (`spectra timeline` reports them).
- Root `index.html` and `dist/` are generated — edit `engine/ui/landing.html`.

## Where the details are

Path-scoped rules in `.claude/rules/` load when you open matching files: `render` (shaders, emitters, instrument
view, surfaces, tuning), `events` (event contract, timing, `freq`), `sky-world` (geometry, atmosphere, terrain),
`tooling` (the `spectra` CLI, bundler, headless Chrome), `missions` (the GitHub board: issues, labels, gates). Adapter values for the
SDLC: `.claude/sdlc.toml`.
