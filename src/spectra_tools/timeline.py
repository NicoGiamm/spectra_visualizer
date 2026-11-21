"""`spectra timeline`: run a scenario headless with ?dump and print an event gantt + per-band activity."""

from __future__ import annotations

import html
import json
import math
import re

from .shot import print_console, run_headless

BANDS = ["radio", "micro", "ir", "vis", "uv", "xray", "gamma"]
BAND_LETTER = {"radio": "R", "micro": "M", "ir": "I", "vis": "V", "uv": "U", "xray": "X", "gamma": "G"}
SPARK = " ▁▂▃▄▅▆▇█"
DUMP_RE = re.compile(r'<script type="application/json" id="spectra-dump">(.*?)</script>', re.S)


def fetch(name: str, step: float = 0.5, budget: int = 40000, detector: str = "ground") -> tuple[dict | None, dict[str, int]]:
    run = run_headless(name, {"dump": "1", "dstep": step, "paused": "1", "detector": detector}, dump_dom=True, budget=budget)
    m = DUMP_RE.search(run.stdout)
    if not m:
        print_console(run)
        return None, run.console
    return json.loads(html.unescape(m.group(1))), run.console


def per_second(samples: list[dict], key, agg=max) -> list[float]:
    """agg (max / mean) of key(sample) within each script second 0..60 (61 columns)."""
    cols: list[list[float]] = [[] for _ in range(61)]
    for s in samples:
        cols[min(60, int(s["t"]))].append(key(s))
    return [agg(c) if c else 0.0 for c in cols]


def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def fill(act: float, norm: float) -> float:
    """Meter fill as drawn by hud.js: soft compression 1 - exp(-act / norm)."""
    return 1 - math.exp(-act / norm) if norm else 0.0


def spark(values: list[float], top: float = 1.0) -> str:
    out = []
    for v in values:
        k = v / top if top else 0
        out.append("█" if k >= 1 else SPARK[max(0, min(8, round(k * 8)))])
    return "".join(out)


def render(rep: dict) -> str:
    W = 30
    lines = [f"{rep['scenario']}  ·  detector: {rep.get('detector', 'ground')}  ·  {len(rep['events'])} events  ·  sources: {rep['sources']['em']} Em, "
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
    lines += ["", f"{'meter fill (1-exp(-act/norm))':<{W}} {axis}  typical  peak  >0.9"]
    near_top = {}
    for b in BANDS:
        norm = rep["norm"][b]
        fills = [fill(s["act"][b], norm) for s in rep["samples"]]
        cols = per_second(rep["samples"], lambda s, b=b, norm=norm: fill(s["act"][b], norm), agg=mean)
        lit = sorted(f for f in fills if f > .01)
        typical = lit[len(lit) // 2] if lit else 0.0               # median while the band is active at all
        above = sum(f >= .9 for f in fills) * rep["step"]          # script seconds near the top
        near_top[b] = above
        lines.append(f"{b:<{W}} {spark(cols)}  {typical:5.2f}  {max(fills, default=0):4.2f}  {above:4.0f} s")
    n_active = per_second(rep["samples"], lambda s: len(s["active"]))
    lines.append(f"{'events active':<{W}} {spark(n_active, max(n_active) or 1)} max {int(max(n_active))}")
    lines += physics(rep)
    full = [f"{b} ({s:.0f} s)" for b, s in near_top.items() if s > 20]
    if full:
        lines.append(f"\nmeters above 0.9 for >20 s: {', '.join(full)} (consider raising meterNorm / METER_NORM)")
    return "\n".join(lines)


def physics(rep: dict) -> list[str]:
    """Cross-check declared bands, listed processes (freq) and the bands actually drawn."""
    ground = rep.get("detector", "ground") == "ground"
    out, warn = ["", f"physics check (declared bands · processes · drawn, {'Ground' if ground else 'Orbit'} detector):"], 0
    for e in sorted(rep["events"], key=lambda e: e["t0"]):
        decl, drawn = set(e["bands"]), set(e["drawn"])
        fb = {f["band"] for f in e["freq"]}
        # bands whose every listed process is absorbed before the ground
        dark = {b for b in fb if all(not f["ground"] for f in e["freq"] if f["band"] == b)}
        notes = []
        if e["unknownFreq"]:
            notes.append(f"unknown process keys {e['unknownFreq']}")
        if not e["freq"]:
            notes.append("no processes listed")
        if decl - fb and e["freq"]:
            notes.append(f"declared without a process: {sorted(decl - fb)}")
        if fb - decl:
            notes.append(f"process band not declared: {sorted(fb - decl)}")
        if drawn - decl:
            notes.append(f"draws undeclared band: {sorted(drawn - decl)}")
        if ground and drawn & dark:
            notes.append(f"draws absorbed band in Ground mode (mark the source origin 'high'/'space'): {sorted(drawn & dark)}")
        hidden = set(e.get("absorbed", []))
        if ground and hidden - dark:
            notes.append(f"hides a band whose processes reach the ground: {sorted(hidden - dark)}")
        absorbed = [f["key"] for f in e["freq"] if not f["ground"]]
        styl = [f["key"] for f in e["freq"] if f["stylised"]]
        info = []
        if absorbed:
            info.append(f"absorbed before the ground: {', '.join(absorbed)}")
        if styl:
            info.append(f"stylised: {', '.join(styl)}")
        if hidden:
            info.append(f"hidden in Ground mode (ghost marker): {', '.join(sorted(hidden))}")
        if e["tags"]:
            info.append("tags: " + ", ".join(e["tags"]))
        if notes:
            warn += len(notes)
            out.append(f"  ! {e['name']}: " + "; ".join(notes))
        if info:
            out.append(f"    {e['name']}: " + "; ".join(info))
    out.append(f"  {warn} warning(s)")
    return out
