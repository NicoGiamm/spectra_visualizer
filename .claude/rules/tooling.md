---
paths:
  - "src/**"
  - "pyproject.toml"
  - "engine/ui/landing.html"
  - "scenarios/*/index.html"
  - "index.html"
---

# Tooling — the `spectra` CLI (Python, uv, cyclopts)

`src/spectra_tools/`: `scenarios.py` (discovery), `build.py` (bundler), `shot.py` (headless render),
`timeline.py` (`?dump` report), `cli.py` (cyclopts app). It never runs per frame; the browser does that.

## Guardrails

1. **Python runs through `uv`** (`uv run spectra …`, `uv add`), CLIs use **cyclopts** — never pip, argparse or click.
   Python ≥ 3.11.
2. **Python stays ruff-formatted, ruff-clean and ty-clean** (`pyproject.toml` `[tool.ruff]`, `[tool.ty]`; dev group).
   The `python_quality` hook formats, lints and type-checks every `.py` Claude writes; `ship merge` runs the same
   three over the whole worktree. Fix a finding — don't add `# noqa` / `# type: ignore` without a reason in the line.
3. **Root `index.html` and `dist/` are generated from `engine/ui/landing.html`** by `spectra serve`/`build` — edit the
   template; a hook refuses direct edits.
4. **The bundler regex (`IMPORT_RE` in `build.py`) only recognises `import`/`export … from` at the start of a line.**
   Keep imports static and on their own lines; no dynamic `import()`. A new import form needs a regex change + a
   `spectra build` + opening a `dist/*.html` shot.
5. **`spectra shot` exits 1 on any console message** (JS or shader log). Don't weaken that to make a shot pass —
   fix the message.
6. **`timeline` reads the page's `?dump` JSON** (`<script id="spectra-dump">`, via `--dump-dom`); changing the dump
   shape in `engine/app.js` means changing `timeline.py` in the same commit.
7. **What `spectra timeline` reports** (default `--detector both`): the full report in Orbit mode — event gantt with
   band letters, draw calls of the scene pass at t 5/30/55, source counts, per-band meter fill `1 - exp(-act/norm)`
   per script second with typical (median while lit), peak and seconds `>0.9` (a note lists bands above 0.9 for
   more than 20 s), events active, the Orbit physics check — then the physics check re-run in Ground mode. `--json`
   prints the raw dumps.
   It exits 1 on a console message or a missing report, **not on physics warnings** — read the `N warning(s)` lines
   (the `ship merge` timeline gate counts them).

## Non-derivable facts

- Headless Chrome = the Playwright-cached `chrome-headless-shell` under `~/.cache/ms-playwright/` (or
  `$SPECTRA_CHROME`), rendering with SwiftShader: ~30 s per shot, ~5 s per scenario for `timeline`.
- three.js loads from a CDN — offline, every shot fails.
- There is no test suite: `spectra shot` + `spectra timeline` are the checks for the scenes; ruff + ty for the Python.
