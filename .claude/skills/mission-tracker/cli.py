# /// script
# requires-python = ">=3.10"
# dependencies = ["cyclopts>=4", "tomli>=2; python_version < '3.11'"]
# ///
"""mission-tracker — missions (one branch + worktree each) and their tasks; a mission's files live only on its branch.

Run as `uv run .claude/skills/mission-tracker/cli.py <command>` from any checkout.
Exit codes: 0 ok · 1 failed (git error) · 3 refused (a gate: wrong place, wrong state, missing evidence).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib"))

from cyclopts import App  # noqa: E402

import sdlc  # noqa: E402
from sdlc import Failed, Refused  # noqa: E402

app = App(name="mission-tracker", help="Missions (one branch + worktree each) and their tasks; mission files live only on the branch.")


@app.command(name="list")
def list_(*, delivered: bool = False) -> None:
    """Open missions (one per branch): status, tasks done/total, ahead/behind main, worktree. --delivered adds merged ones."""
    cfg = sdlc.config()
    print(f"{'mission':8} {'status':9} {'tasks':6} {'vs main':8} {'worktree':10} title")
    for m in sdlc.missions():
        done = sum(t.status == "done" for t in m.tasks)
        a, b = sdlc.ahead_behind(m.branch, cfg.main)
        wt = "-"
        if m.worktree:
            d = len(sdlc.dirty(m.worktree))
            wt = f"open{f' dirty:{d}' if d else ''}"
        print(f"{m.ref:8} {m.status:9} {done}/{len(m.tasks):<4} +{a}/-{b:<5} {wt:10} {m.meta.get('title', '')}")
    if delivered:
        for n, sha, subj in sdlc.delivered():
            print(f"M{n:<7} delivered {sha}  {subj}")


@app.command
def show(ref: str) -> None:
    """Print a mission (with its task table) or one task, read from its worktree or branch."""
    m, t = sdlc.find(ref)
    if t:
        print(sdlc.dump_doc(t.meta, t.body))
        print(f"# {m.branch}:{t.rel}")
    else:
        m.sync_table()
        print(sdlc.dump_doc(m.meta, m.body))
        print(f"# {m.branch}:{m.rel_dir}/mission.md{'  (worktree ' + str(m.worktree) + ')' if m.worktree else ''}")


@app.command(name="next")
def next_(ref: str | None = None) -> None:
    """The next open task: in REF's mission, else in the first active, then planned, mission."""
    ms = [sdlc.find(ref)[0]] if ref else sorted(sdlc.missions(), key=lambda m: ({"active": 0, "planned": 1}.get(m.status, 9), m.num))
    for m in ms:
        for t in m.tasks:
            if t.status != "done":
                labels = ", ".join(t.meta.get("labels", []))
                print(f"{t.ref} [{t.status}{'; ' + labels if labels else ''}] {t.meta.get('title')}  (mission {m.status})")
                return
    print("no open task")


@app.command
def propose(title: str, *, slug: str | None = None) -> None:
    """Create a PROPOSED mission: branch mission/M<next>-<slug> off main + its worktree, mission.md from the template."""
    cfg = sdlc.config()
    n = sdlc.next_number()
    slug = slug or sdlc.slugify(title)
    branch = f"{cfg.prefix}M{n}-{slug}"
    wt = cfg.worktree_of(branch)
    wt.parent.mkdir(parents=True, exist_ok=True)
    sdlc.git("worktree", "add", "-q", "-b", branch, str(wt), cfg.main, cwd=cfg.root)
    d = wt / cfg.missions_rel / f"M{n}-{slug}"
    (d / "tasks").mkdir(parents=True)
    (d / "mission.md").write_text(sdlc.render("mission.md", id=f"M{n}", title=title, branch=branch, date=sdlc.today()), encoding="utf-8")
    sha = sdlc.commit_paths(wt, [d], f"Mission M{n}: propose — {title} (refs M{n})")
    print(f"proposed M{n} on {branch} ({sha})\nfile: {d / 'mission.md'}")
    print(f"next: fill Problem / Scope / Delivery there, `add-task M{n} \"…\"`, show the user; on their OK: `approve M{n}`")


@app.command(name="open")
def open_(mission: str) -> None:
    """Open (or show) MISSION's worktree without changing its status — to edit a proposed/planned mission."""
    m = sdlc.ensure_worktree(sdlc.find(mission)[0])
    print(f"worktree: {m.worktree}")


@app.command
def add_task(mission: str, title: str, *, slug: str | None = None, label: list[str] | None = None) -> None:
    """Add task T<next> to MISSION from the template (in its worktree, opened if needed) and commit it on the branch."""
    m = sdlc.ensure_worktree(sdlc.find(mission)[0])
    labels = label or []
    bad = [x for x in labels if x not in sdlc.config().std("task")["labels"]]
    if bad:
        raise Refused(f"unknown labels {bad}")
    n = max((t.num for t in m.tasks), default=0) + 1
    f = m.dir / "tasks" / f"T{n}-{slug or sdlc.slugify(title)}.md"
    f.parent.mkdir(exist_ok=True)
    f.write_text(sdlc.render("task.md", id=f"{m.ref}/T{n}", title=title, labels=", ".join(labels)), encoding="utf-8")
    m = sdlc.load(m.branch, m.worktree)
    m.save()
    sha = m.commit(f"Mission {m.ref}: add task T{n} — {title} (refs {m.ref}/T{n})")
    print(f"added {m.ref}/T{n} ({sha}): {f}\nnext: write its Goal, Plan (files:) and Acceptance, commit with (refs {m.ref}/T{n})")


@app.command
def approve(mission: str) -> None:
    """After the user's OK: PROPOSED -> PLANNED (checked against the standard), committed on the branch."""
    m = sdlc.ensure_worktree(sdlc.find(mission)[0])
    if m.status != "proposed":
        raise Refused(f"{m.ref} is {m.status}, not proposed")
    if sdlc.dirty(m.worktree):
        raise Refused(f"commit the edits in {m.worktree} first")
    errs = sdlc.check_mission(m, strict=True)
    if errs:
        raise Refused("fix the mission first:\n- " + "\n- ".join(errs))
    m.meta["status"] = "planned"
    m.log("approved by the user")
    m.save()
    title = m.meta.get("title", "")
    print(f"{m.ref} planned ({m.commit(f'Mission {m.ref}: approved — {title} (refs {m.ref})')})")


@app.command
def start(mission: str) -> None:
    """Start a PLANNED mission (or re-open an active one): worktree + status active. Then EnterWorktree."""
    m, _ = sdlc.find(mission)
    if m.status not in ("planned", "active"):
        raise Refused(f"{m.ref} is {m.status}: only a planned (user-approved) mission starts")
    m = sdlc.ensure_worktree(m)
    if m.status != "active":
        m.meta["status"] = "active"
        m.log("started")
        m.save()
        m.commit(f"Mission {m.ref}: start (refs {m.ref})")
    a, b = sdlc.ahead_behind(m.branch, sdlc.config().main)
    print(f"{m.ref} active on {m.branch} (+{a}/-{b} vs main{'; `ship align` first' if b else ''})")
    print(f"next: EnterWorktree path={m.worktree}, then `task {m.ref}/T<n>`")


@app.command
def task(ref: str, *, done: bool = False, evidence: Path | None = None) -> None:
    """Open task REF (in-progress, shows Plan/Acceptance gaps) or close it: --done --evidence FILE (-> Outcome)."""
    m, t = sdlc.find(ref)
    if t is None:
        raise Refused("give a task: M<N>/T<k>")
    if m.status != "active" or not m.worktree:
        raise Refused(f"{m.ref} is {m.status}: `start {m.ref}` first")
    if sdlc.here_root() != m.worktree.resolve():
        raise Refused(f"run inside {m.ref}'s worktree: {m.worktree}")
    if not done:
        busy = [x.ref for x in m.tasks if x.status == "in-progress" and x.num != t.num]
        if busy:
            raise Refused(f"one task at a time: finish {busy[0]} first")
        if t.status == "done":
            raise Refused(f"{t.ref} is done")
        gaps = [g for g in sdlc.check_mission(m) if g.startswith(f"{m.ref}/{t.name}")]
        if t.status != "in-progress":
            t.meta["status"], t.meta["started"] = "in-progress", sdlc.today()
            m.save_task(t)
            m.save()
            m.commit(f"Mission {t.ref}: start task (refs {t.ref})")
        print(sdlc.dump_doc(t.meta, t.body))
        print(f"{t.ref} in progress." + (f" Gaps to fix first: {'; '.join(gaps)}" if gaps else ""))
        print(f"Commits carry `(refs {t.ref})`. Done: tick Acceptance, then `task {t.ref} --done --evidence FILE`.")
        return
    if evidence is None or not evidence.is_file() or not evidence.read_text(encoding="utf-8").strip():
        raise Refused("--done needs --evidence FILE with the outcome (what changed, verify numbers, what was not verified)")
    acc = sdlc.checklist(sdlc.get_section(t.body, "Acceptance"))
    open_items = [txt for ok, txt in acc if not ok]
    if not acc or open_items:
        raise Refused("Acceptance not met:\n- " + "\n- ".join(open_items or ["(no checklist)"]))
    t.body = sdlc.set_section(t.body, "Outcome", evidence.read_text(encoding="utf-8"))
    t.meta["status"], t.meta["completed"] = "done", sdlc.today()
    if not t.meta.get("started"):
        t.meta["started"] = sdlc.today()
    m.save_task(t)
    m.log(f"{t.ref} done")
    m.save()
    title = t.meta.get("title", "")
    print(f"{t.ref} done ({m.commit(f'Mission {t.ref}: done — {title} (refs {t.ref})')})")
    left = [x for x in m.tasks if x.status != "done"]
    print(f"next: task {left[0].ref}" if left else f"all tasks of {m.ref} done -> ask the user once: \"ship {m.ref} now?\" (/ship)")


@app.command
def log(mission: str, text: str, *, decision: bool = False) -> None:
    """Append a dated Log line to MISSION (--decision: also under Key decisions), committed on its branch."""
    m = sdlc.ensure_worktree(sdlc.find(mission)[0])
    if decision:
        kd = "\n".join(l for l in sdlc.get_section(m.body, "Key decisions").splitlines() if not l.startswith("<!--"))
        m.body = sdlc.set_section(m.body, "Key decisions", f"{kd}\n- {sdlc.today()} · {text}".strip())
    m.log(("decision: " if decision else "") + text)
    m.save()
    kind = "decision" if decision else "log"
    print(m.commit(f"Mission {m.ref}: {kind} (refs {m.ref})") or "nothing to commit")


@app.command
def sync(mission: str) -> None:
    """Regenerate MISSION's task table after hand edits (writes in its worktree, does not commit)."""
    m = sdlc.ensure_worktree(sdlc.find(mission)[0])
    m.save()
    print(f"synced {m.dir / 'mission.md'}")


@app.command
def close_worktree(mission: str) -> None:
    """Remove the worktree of a proposed/planned mission (the branch keeps everything). Refused when dirty."""
    m, _ = sdlc.find(mission)
    if not m.worktree:
        print("no worktree")
        return
    if m.status == "active":
        raise Refused(f"{m.ref} is active: its worktree stays until `ship merge`")
    if sdlc.dirty(m.worktree):
        raise Refused(f"{m.worktree} has uncommitted changes")
    sdlc.git("worktree", "remove", str(m.worktree), cwd=sdlc.config().root)
    print(f"removed {m.worktree}; {m.branch} keeps the mission")


@app.command
def check() -> None:
    """Validate every mission branch against [standard] in .claude/sdlc.toml (and that main holds no missions)."""
    errs = sdlc.check_store()
    for e in errs:
        print(f"- {e}")
    print(f"{len(errs)} finding(s)")
    if errs:
        raise Failed("store does not match the standard")


def main() -> None:
    try:
        app()
    except (Refused, Failed) as e:
        print(f"{'REFUSED' if e.code == 3 else 'FAILED'}: {e}", file=sys.stderr)
        sys.exit(e.code)


if __name__ == "__main__":
    main()
