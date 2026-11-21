"""Headless screenshots with the Playwright-cached chrome-headless-shell (software WebGL).

Slow, but it compiles every shader and reports JS errors, which is the main point.
The scenario is bundled first, so the page loads over file:// with URL parameters
(?t=…&yaw=…&pitch=…&bands=…&paused) instead of patched copies.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from glob import glob
from pathlib import Path
from urllib.parse import urlencode

from .build import bundle
from .scenarios import get


def find_chrome() -> str:
    env = os.environ.get("SPECTRA_CHROME")
    if env:
        return env
    cands = sorted(glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell")))
    if cands:
        return cands[-1]
    for name in ("chrome-headless-shell", "chromium", "google-chrome"):
        if p := shutil.which(name):
            return p
    raise SystemExit("no headless Chrome found: set SPECTRA_CHROME or run `uvx playwright install chromium-headless-shell`")


def console_messages(lines: list[str]) -> dict[str, int]:
    """Group Chrome's stderr into page console messages (they can span lines), counting repeats."""
    msgs: dict[str, int] = {}
    cur: list[str] | None = None

    def flush():
        if cur:
            key = re.sub(r"^\[[^\]]*\]\s*", "", "\n".join(cur)).strip()
            msgs[key] = msgs.get(key, 0) + 1

    for line in lines:
        if line.startswith("[") and re.match(r"^\[\d+/\d+\.\d+:", line):
            flush()
            cur = [line] if (":CONSOLE" in line or "Uncaught" in line) else None
        elif cur is not None:
            cur.append(line)
    flush()
    return msgs


def shot(name: str, out: Path, t: float | None = None, yaw: float | None = None, pitch: float | None = None,
         bands: str | None = None, labels: bool = True, size: str = "1400,850", budget: int = 20000,
         verbose: bool = False) -> int:
    sc = get(name)
    params = {"paused": "1"}
    if t is not None:
        params["t"] = t
    if yaw is not None:
        params["yaw"] = yaw
    if pitch is not None:
        params["pitch"] = pitch
    if bands:
        params["bands"] = bands
    if not labels:
        params["labels"] = "0"
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / f"{sc.id}.html"
        page.write_text(bundle(sc), encoding="utf-8")
        url = page.as_uri() + "?" + urlencode(params)
        out = out.resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        cmd = [find_chrome(), "--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
               "--ignore-gpu-blocklist", "--enable-logging=stderr", "--v=0", f"--window-size={size}",
               f"--virtual-time-budget={budget}", f"--screenshot={out}", url]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    lines = proc.stderr.splitlines()
    if verbose:
        print("\n".join(lines))
    errors = console_messages(lines)
    for msg, n in errors.items():
        print(msg if n == 1 else f"{msg}\n  (repeated {n}×)")
    if out.exists():
        print(f"wrote {out}")
    return 1 if errors or not out.exists() else 0
