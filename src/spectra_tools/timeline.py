"""`spectra timeline`: run a scenario headless with ?dump and print an event gantt + per-band activity."""

from __future__ import annotations

import html
import json
import re

from .shot import print_console, run_headless

BANDS = ["radio", "micro", "ir", "vis", "uv", "xray", "gamma"]
BAND_LETTER = {"radio": "R", "micro": "M", "ir": "I", "vis": "V", "uv": "U", "xray": "X", "gamma": "G"}
SPARK = " ▁▂▃▄▅▆▇█"
DUMP_RE = re.compile(r'<script type="application/json" id="spectra-dump">(.*?)</script>', re.S)


def fetch(name: str, step: float = 0.5, budget: int = 40000) -> tuple[dict | None, dict[str, int]]:
    run = run_headless(name, {"dump": "1", "dstep": step, "paused": "1"}, dump_dom=True, budget=budget)
    m = DUMP_RE.search(run.stdout)
    if not m:
        print_console(run)
        return None, run.console
    return json.loads(html.unescape(m.group(1))), run.console


def per_second(samples: list[dict], key) -> list[float]:
    """Max of key(sample) within each script second 0..60 (61 columns)."""
    cols = [0.0] * 61
    for s in samples:
        c = min(60, int(s["t"]))
        cols[c] = max(cols[c], key(s))
    return cols


def spark(values: list[float], top: float = 1.0) -> str:
    out = []
    for v in values:
        k = v / top if top else 0
        out.append("█" if k >= 1 else SPARK[max(0, min(8, round(k * 8)))])
    return "".join(out)


def render(rep: dict) -> str:
    W = 30
    lines = [f"{rep['scenario']}  ·  {len(rep['events'])} events  ·  sources: {rep['sources']['em']} Em, "
             f"{rep['sources']['rib']} Rib, {rep['sources']['fields']} fields ({rep['sources']['fieldInstances']} instances)",
             "draw calls (scene pass): " + ", ".join(f"t={d['t']}: {d['calls']}" for d in rep["draws"]), ""]
    axis = "".join(str(t // 10) if t % 10 == 0 else ("·" if t % 5 == 0 else " ") for t in range(61))
    lines.append(f"{'':<{W}} {axis}")
    order = sorted(range(len(rep["events"])), key=lambda i: (rep["events"][i]["t0"], rep["events"][i]["t1"]))
    for i in order:
        e = rep["events"][i]
        row = "".join("█" if e["t0"] <= t + .5 and e["t1"] >= t else "·" for t in range(61))
        bands = "".join(BAND_LETTER[b] for b in BANDS if b in e["bands"])
        lines.append(f"{e['name'][:W]:<{W}} {row} {bands}")
    lines += ["", f"{'activity / meter top':<{W}} {axis}"]
    sat = {}
    for b in BANDS:
        vals = per_second(rep["samples"], lambda s, b=b: s["act"][b])
        top = rep["norm"][b]
        sat[b] = sum(v >= top for v in vals)
        lines.append(f"{b:<{W}} {spark(vals, top)} {max(vals) / top:4.1f}×")
    n_active = per_second(rep["samples"], lambda s: len(s["active"]))
    lines.append(f"{'events active':<{W}} {spark(n_active, max(n_active) or 1)} max {int(max(n_active))}")
    full = [b for b, n in sat.items() if n > 20]
    if full:
        lines.append(f"\nmeters pinned at the top for >20 s: {', '.join(full)} (raise meterNorm / METER_NORM)")
    return "\n".join(lines)
