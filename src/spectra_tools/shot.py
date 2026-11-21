"""Headless Chrome runs with the Playwright-cached chrome-headless-shell (software WebGL).

Slow, but it compiles every shader and reports JS errors, which is the main point.
The scenario is bundled first, so the page loads over file:// with URL parameters
(?t=…&yaw=…&pitch=…&bands=…&paused&dump) instead of patched copies.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
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


@dataclass
class Run:
    stdout: str
    stderr: str
    console: dict[str, int]


def run_headless(name: str, params: dict, *, screenshot: Path | None = None, dump_dom: bool = False,
                 size: str = "1400,850", budget: int = 20000) -> Run:
    """Bundle scenario `name`, open it in headless Chrome with URL `params`; optionally screenshot or dump the DOM."""
    sc = get(name)
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / f"{sc.id}.html"
        page.write_text(bundle(sc), encoding="utf-8")
        url = page.as_uri() + "?" + urlencode(params)
        cmd = [find_chrome(), "--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
               "--ignore-gpu-blocklist", "--enable-logging=stderr", "--v=0", f"--window-size={size}",
               f"--virtual-time-budget={budget}"]
        if screenshot:
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            cmd.append(f"--screenshot={screenshot}")
        if dump_dom:
            cmd.append("--dump-dom")
        proc = subprocess.run(cmd + [url], capture_output=True, text=True, timeout=900)
    return Run(proc.stdout, proc.stderr, console_messages(proc.stderr.splitlines()))


def print_console(run: Run, verbose: bool = False) -> None:
    if verbose:
        print(run.stderr)
    for msg, n in run.console.items():
        print(msg if n == 1 else f"{msg}\n  (repeated {n}×)")


def shot(name: str, out: Path, t: float | None = None, yaw: float | None = None, pitch: float | None = None,
         bands: str | None = None, labels: bool = True, size: str = "1400,850", budget: int = 20000,
         verbose: bool = False) -> int:
    params: dict = {"paused": "1"}
    for k, v in (("t", t), ("yaw", yaw), ("pitch", pitch), ("bands", bands)):
        if v is not None:
            params[k] = v
    if not labels:
        params["labels"] = "0"
    out = out.resolve()
    run = run_headless(name, params, screenshot=out, size=size, budget=budget)
    print_console(run, verbose)
    if out.exists():
        print(f"wrote {out}")
    return 1 if run.console or not out.exists() else 0
