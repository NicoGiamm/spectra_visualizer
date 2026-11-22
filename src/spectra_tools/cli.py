"""`spectra` command line (cyclopts): list, serve, build, shot."""

from __future__ import annotations

import functools
import http.server
import mimetypes
from pathlib import Path
from typing import Annotated

from cyclopts import App, Parameter

from . import DIST, ROOT
from .build import build as build_scenarios
from .build import landing
from .scenarios import discover

app = App(name="spectra", help="Serve, bundle and screenshot Spectra Visualizer scenarios.")


def write_dev_index() -> Path:
    """Root index.html links the source scenarios (served by `spectra serve`)."""
    dest = ROOT / "index.html"
    dest.write_text(landing(discover(), link=lambda s: f"scenarios/{s.id}/index.html"), encoding="utf-8")
    return dest


@app.command(name="list")
def list_scenarios():
    """List the scenarios found under scenarios/."""
    for s in discover():
        print(f"{s.id:<10} {s.title} — {s.description}")


@app.command
def serve(port: int = 8000, host: str = "127.0.0.1"):
    """Serve the repo for development (ES modules need http://, not file://).

    Parameters
    ----------
    port
        Port to listen on.
    host
        Interface to bind.
    """
    write_dev_index()
    mimetypes.add_type("text/javascript", ".js")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer((host, port), handler) as srv:
        print(f"serving {ROOT} at http://{host}:{port}/")
        for s in discover():
            print(f"  {s.title:<16} http://{host}:{port}/scenarios/{s.id}/")
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass


@app.command
def build(*scenarios: str, out: Path = DIST):
    """Bundle scenarios into single self-contained HTML files (open them straight from disk).

    Parameters
    ----------
    scenarios
        Scenario ids to build (default: all).
    out
        Output directory.
    """
    write_dev_index()
    for p in build_scenarios(list(scenarios) or None, out):
        shown = p.relative_to(ROOT) if p.is_relative_to(ROOT) else p
        print(f"wrote {shown}  ({p.stat().st_size // 1024} KB)")


@app.command
def shot(
    scenario: str,
    t: Annotated[float | None, Parameter(name=["-t", "--time"])] = None,
    *,
    yaw: float | None = None,
    pitch: float | None = None,
    bands: str | None = None,
    detector: str | None = None,
    labels: bool = True,
    size: str = "1400,850",
    budget: int = 20000,
    out: Annotated[Path | None, Parameter(name=["-o", "--out"])] = None,
    verbose: Annotated[bool, Parameter(name=["-v", "--verbose"])] = False,
):
    """Headless screenshot of a scenario at a given moment (also reports JS errors).

    Parameters
    ----------
    scenario
        Scenario id, e.g. trail.
    t
        Script time 0–60 (real playback is twice as slow).
    yaw
        Radians, ±1.35; positive looks left (south).
    pitch
        Radians, −0.1…1.5.
    bands
        Comma list of bands to keep on, e.g. ir,micro.
    detector
        ground (default: the atmosphere absorbs far-UV/X-ray/gamma from space) or orbit.
    labels
        Draw event labels.
    size
        Window size "W,H".
    budget
        Virtual time budget in ms.
    out
        Output PNG (default: shots/SCENARIO-tTIME.png).
    verbose
        Print every Chrome log line.
    """
    from .shot import shot as take

    dest = out or Path(f"shots/{scenario}-t{t if t is not None else 0:g}.png")
    raise SystemExit(
        take(
            scenario,
            dest,
            t=t,
            yaw=yaw,
            pitch=pitch,
            bands=bands,
            labels=labels,
            size=size,
            budget=budget,
            verbose=verbose,
            detector=detector,
        )
    )


@app.command
def timeline(
    *scenarios: str,
    step: float = 0.5,
    detector: str = "both",
    json_out: Annotated[bool, Parameter(name="--json")] = False,
):
    """Run scenarios headless and print an event gantt plus per-band activity over the 0–60 script.

    Parameters
    ----------
    scenarios
        Scenario ids (default: all).
    step
        Sampling step in script seconds.
    detector
        both (default): the full report in Orbit mode (the page default) plus the physics check re-run in Ground
        mode, which flags absorbed bands drawn from the ground; or just ground / orbit.
    json_out
        Print the raw report as JSON instead.
    """
    import json

    from .timeline import fetch, physics, render

    ids = list(scenarios) or [s.id for s in discover()]
    failed = False
    for sid in ids:
        rep, console = fetch(sid, step, detector="orbit" if detector == "both" else detector)
        if rep is None:
            print(f"{sid}: no report (see console output above)")
            failed = True
            continue
        failed |= bool(console)
        if detector != "both":
            print(json.dumps(rep) if json_out else render(rep) + "\n")
            continue
        ground, gconsole = fetch(sid, step, detector="ground")
        failed |= bool(gconsole) or ground is None
        if json_out:
            print(json.dumps({"orbit": rep, "ground": ground}))
        else:
            print(render(rep))
            print("\n".join(physics(ground)) if ground else "ground-mode check: no report")
            print()
    raise SystemExit(1 if failed else 0)


def main():
    app()


if __name__ == "__main__":
    main()
