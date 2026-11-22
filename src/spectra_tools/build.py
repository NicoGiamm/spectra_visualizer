"""Bundle a scenario into one self-contained HTML file.

Browsers refuse ES-module imports over file://, so the multi-file sources need a server.
The bundle sidesteps that without a JS bundler: every local module is rewritten so its imports
use canonical bare specifiers (``@spectra/<repo path>``), and the page's import map points each
specifier at a ``data:`` URL holding that module. Remote entries (three.js on the CDN) are kept,
so the bundle still needs a network connection, like the sources.
"""

from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path

from . import DIST, ROOT
from .scenarios import Scenario, discover

# import/export statements at the start of a line: `import x from '…'`, `import '…'`, `export { a } from '…'`
IMPORT_RE = re.compile(r"""^(\s*(?:import|export)\b[^'";]*?\bfrom\s*|\s*import\s*)(['"])([^'"\n]+)\2""", re.M)
IMPORTMAP_RE = re.compile(r'<script type="importmap">(.*?)</script>', re.S)
STYLESHEET_RE = re.compile(r'<link rel="stylesheet" href="([^"]+)">')
ENTRY_RE = re.compile(r'<script type="module" src="([^"]+)"></script>')


def _key(path: Path) -> str:
    return "@spectra/" + path.relative_to(ROOT).as_posix()


class Bundler:
    def __init__(self, page: Path):
        self.page = page
        text = page.read_text(encoding="utf-8")
        m = IMPORTMAP_RE.search(text)
        imports = json.loads(m.group(1))["imports"] if m else {}
        self.remote = {k: v for k, v in imports.items() if re.match(r"https?://", v)}
        self.local = {k: (page.parent / v).resolve() for k, v in imports.items() if k not in self.remote}
        self.modules: dict[Path, str] = {}

    def resolve(self, spec: str, importer: Path) -> Path | None:
        if spec.startswith((".", "/")):
            return (importer.parent / spec).resolve()
        for prefix, target in sorted(self.local.items(), key=lambda kv: -len(kv[0])):
            if prefix.endswith("/") and spec.startswith(prefix):
                return (target / spec[len(prefix) :]).resolve()
            if spec == prefix:
                return target
        return None  # remote / bare specifier left for the browser

    def add(self, path: Path) -> str:
        if path in self.modules:
            return _key(path)
        if not path.is_file():
            raise SystemExit(f"missing module: {path.relative_to(ROOT)}")
        self.modules[path] = ""  # mark before recursing (cycles)
        src = path.read_text(encoding="utf-8")

        def rewrite(m: re.Match) -> str:
            target = self.resolve(m.group(3), path)
            spec = self.add(target) if target else m.group(3)
            return f"{m.group(1)}{m.group(2)}{spec}{m.group(2)}"

        self.modules[path] = IMPORT_RE.sub(rewrite, src)
        return _key(path)

    def importmap(self) -> str:
        imports = dict(self.remote)
        for path, src in self.modules.items():
            imports[_key(path)] = "data:text/javascript;base64," + base64.b64encode(src.encode()).decode()
        return json.dumps({"imports": imports}, indent=0)


def bundle(sc: Scenario, home: str = "index.html") -> str:
    text = sc.html.read_text(encoding="utf-8")
    b = Bundler(sc.html)

    def inline_css(m: re.Match) -> str:
        css = (sc.path / m.group(1)).read_text(encoding="utf-8")
        return f"<style>\n{css}</style>"

    text = STYLESHEET_RE.sub(inline_css, text)
    entry = ENTRY_RE.search(text)
    if not entry:
        raise SystemExit(f'{sc.html}: no <script type="module" src=…> entry')
    key = b.add((sc.path / entry.group(1)).resolve())
    text = ENTRY_RE.sub(
        lambda _: (
            f"<script>window.SPECTRA_HOME = {json.dumps(home)};</script>\n"
            f"<script type=\"module\">import '{key}';</script>"
        ),
        text,
    )
    text = IMPORTMAP_RE.sub(lambda _: f'<script type="importmap">\n{b.importmap()}\n</script>', text)
    return text


def landing(scenarios: list[Scenario], link=lambda s: f"{s.id}.html") -> str:
    cards = "\n".join(
        f'  <a class="card" href="{link(s)}"><b>{html.escape(s.title)}</b><span>{html.escape(s.description)}</span></a>'
        for s in scenarios
    )
    return (ROOT / "engine" / "ui" / "landing.html").read_text(encoding="utf-8").replace("<!--CARDS-->", cards)


def build(names: list[str] | None = None, out: Path = DIST) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    scenarios = discover()
    chosen = [s for s in scenarios if not names or s.id in names]
    if names and len(chosen) != len(set(names)):
        known = ", ".join(s.id for s in scenarios)
        raise SystemExit(f"unknown scenario in {names} (known: {known})")
    written = []
    for sc in chosen:
        dest = out / f"{sc.id}.html"
        dest.write_text(bundle(sc), encoding="utf-8")
        written.append(dest)
    (out / "index.html").write_text(landing(scenarios), encoding="utf-8")
    written.append(out / "index.html")
    return written
