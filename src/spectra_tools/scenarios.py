"""Scenario discovery: every folder under scenarios/ with an index.html is a scenario."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from pathlib import Path

from . import SCENARIOS


@dataclass
class Scenario:
    id: str
    path: Path  # the scenario folder
    title: str
    description: str

    @property
    def html(self) -> Path:
        return self.path / "index.html"


def _meta(text: str, pattern: str) -> str:
    m = re.search(pattern, text, re.S | re.I)
    return html.unescape(m.group(1).strip()) if m else ""


def discover() -> list[Scenario]:
    out = []
    for index in sorted(SCENARIOS.glob("*/index.html")):
        text = index.read_text(encoding="utf-8")
        title = _meta(text, r"<title>(.*?)</title>") or index.parent.name
        title = title.split("·", 1)[-1].strip()
        desc = _meta(text, r'<meta\s+name="description"\s+content="(.*?)"')
        out.append(Scenario(index.parent.name, index.parent, title, desc))
    return out


def get(name: str) -> Scenario:
    for s in discover():
        if s.id == name:
            return s
    known = ", ".join(s.id for s in discover())
    raise SystemExit(f"unknown scenario {name!r} (known: {known})")
