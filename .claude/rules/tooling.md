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
2. **Root `index.html` and `dist/` are generated from `engine/ui/landing.html`** by `spectra serve`/`build` — edit the
   template; a hook refuses direct edits.
3. **The bundler regex (`IMPORT_RE` in `build.py`) only recognises `import`/`export … from` at the start of a line.**
   Keep imports static and on their own lines; no dynamic `import()`. A new import form needs a regex change + a
   `spectra build` + opening a `dist/*.html` shot.
4. **`spectra shot` exits 1 on any console message** (JS or shader log). Don't weaken that to make a shot pass —
   fix the message.
5. **`timeline` reads the page's `?dump` JSON** (`<script id="spectra-dump">`, via `--dump-dom`); changing the dump
   shape in `engine/app.js` means changing `timeline.py` in the same commit.

## Non-derivable facts

- Headless Chrome = the Playwright-cached `chrome-headless-shell` under `~/.cache/ms-playwright/` (or
  `$SPECTRA_CHROME`), rendering with SwiftShader: ~30 s per shot, ~5 s per scenario for `timeline`.
- three.js loads from a CDN — offline, every shot fails.
- There is no test suite or linter; `spectra shot` + `spectra timeline` are the checks.
