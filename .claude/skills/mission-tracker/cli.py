# /// script
# requires-python = ">=3.11"
# dependencies = ["cyclopts>=4"]
# ///
"""mission-tracker — missions (GitHub parent issues, one branch + worktree each) and their tasks (sub-issues).

Run as `uv run .claude/skills/mission-tracker/cli.py <command>` from any checkout.
Exit codes: 0 ok · 1 failed (git/GitHub error, check findings) · 3 refused (a gate: wrong place, wrong state,
missing evidence, the mission fails `check`). Mutating commands take `--dry-run`: print the gh/git calls instead.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib"))

import sdlc  # noqa: E402
from cyclopts import App  # noqa: E402
from sdlc import Failed, Refused  # noqa: E402

app = App(
    name="mission-tracker",
    help="Missions (GitHub parent issues + one branch/worktree each) and their tasks (sub-issues).",
)


def _vs_main(m: sdlc.Mission) -> str:
    if not m.branch or not sdlc.branch_exists(m.branch):
        return "no-branch"
    a, b = sdlc.ahead_behind(m.branch, sdlc.config().main)
    return f"+{a}/-{b}"


def _wt(m: sdlc.Mission) -> str:
    if not m.worktree:
        return "-"
    d = len(sdlc.dirty(m.worktree))
    return f"open{f' dirty:{d}' if d else ''}"


def _print_list(ms: list[sdlc.Mission]) -> None:
    print(f"{'mission':8} {'issue':6} {'status':9} {'tasks':6} {'vs main':9} {'worktree':10} title")
    for m in ms:
        done = sum(t.status == "done" for t in m.tasks)
        print(
            f"{m.ref:8} #{m.issue.number:<5} {m.status:9} {done}/{len(m.tasks):<4} {_vs_main(m):9} {_wt(m):10} {m.title}"
        )


@app.command(name="list")
def list_(*, delivered: bool = False) -> None:
    """Open missions: issue, status, tasks done/total (sub-issues), ahead/behind main, worktree. --delivered adds closed ones."""
    _print_list(sdlc.missions())
    if delivered:
        for m in sdlc.missions(include_closed=True):
            if not m.issue.open:
                print(f"{m.ref:8} #{m.issue.number:<5} {m.meta.get('Status', 'closed')}  {m.title}")


def _next_task(ms: list[sdlc.Mission]) -> str:
    for m in ms:
        for t in m.tasks:
            if t.status != "done":
                labels = ", ".join(t.labels)
                return f"{t.ref} (#{t.issue.number}) [{t.status}{'; ' + labels if labels else ''}] {t.title}  (mission {m.status})"
    return "no open task"


@app.command(name="next")
def next_(ref: str | None = None) -> None:
    """The next open task: in REF's mission, else in the first active, then planned, mission."""
    ms = (
        [sdlc.find(ref)[0]]
        if ref
        else sorted(sdlc.missions(), key=lambda m: ({"active": 0, "planned": 1}.get(m.status, 9), m.num))
    )
    print(_next_task(ms))


@app.command
def show(ref: str) -> None:
    """Print a mission (with its sub-issue table) or one task, as the issue body plus its board state."""
    m, t = sdlc.find(ref)
    i = t.issue if t else m.issue
    print(i.body.rstrip())
    if t is None:
        print("\n# sub-issues")
        for x in m.tasks:
            labels = f" [{', '.join(x.labels)}]" if x.labels else ""
            print(f"#   {x.ref:8} #{x.issue.number:<4} {x.status:11} {x.issue.state.lower():6}{labels} {x.title}")
    title = t.title if t else m.title
    where = f" · worktree {m.worktree}" if m.worktree else ""
    print(
        f"# {(t or m).ref} — {title} · #{i.number} {i.state.lower()} · labels {', '.join(i.labels)} · "
        f"project {i.project_status or 'NOT ON BOARD'} · {i.url}{where if t is None else ''}"
    )


@app.command
def propose(title: str, *, slug: str | None = None, dry_run: bool = False) -> None:
    """Create a PROPOSED mission: parent issue from the template (label mission, project Todo), branch + worktree."""
    sdlc.set_dry_run(dry_run)
    cfg = sdlc.config()
    n = sdlc.next_number()
    slug = slug or sdlc.slugify(title)
    branch = f"{cfg.prefix}M{n}-{slug}"
    if sdlc.branch_exists(branch):
        raise Refused(f"branch {branch} already exists")
    body = sdlc.render("mission.md", id=f"M{n}", title=title, branch=branch, date=sdlc.today())
    issue = sdlc.create_issue(f"M{n} — {title}", body, [cfg.label("mission")])
    sdlc.set_project_status(issue, cfg.project_status("mission", "proposed"))
    m = sdlc.Mission(n, title, issue)
    sdlc.ensure_worktree(m)
    sdlc.say(f"proposed M{n}: {issue.url} · branch {branch} · worktree {m.worktree}")
    print(
        f'next: fill Problem / Scope / Delivery in the issue, `add-task M{n} "…"`, show the user; on their OK: `approve M{n}`'
    )


@app.command(name="open")
def open_(mission: str, *, dry_run: bool = False) -> None:
    """Open (or show) MISSION's worktree without changing its status."""
    sdlc.set_dry_run(dry_run)
    m = sdlc.ensure_worktree(sdlc.find_open(mission)[0])
    sdlc.say(f"worktree: {m.worktree}")


@app.command
def add_task(mission: str, title: str, *, label: list[str] | None = None, dry_run: bool = False) -> None:
    """Add task T<next> to MISSION: sub-issue from the template (label task + kinds), linked, project Todo.

    If the link fails the new issue is deleted (or, failing that, closed as not planned) and the command fails.
    """
    sdlc.set_dry_run(dry_run)
    cfg = sdlc.config()
    m, _ = sdlc.find_open(mission)
    labels = label or []
    bad = [x for x in labels if x not in cfg.std("task")["labels"]]
    if bad:
        raise Refused(f"unknown labels {bad} (allowed: {cfg.std('task')['labels']})")
    k = max((t.num for t in m.tasks), default=0) + 1
    ref = f"{m.ref}/T{k}"
    body = sdlc.render("task.md", id=ref, title=title, parent=str(m.issue.number))
    test = [x for x in m.issue.labels if x == cfg.gh.get("test_label")]  # throw-away parents keep their kids hidden
    child = sdlc.create_issue(f"{ref} — {title}", body, [cfg.label("task"), *labels, *test])
    try:
        sdlc.add_sub_issue(m.issue, child)
        if not sdlc.DRY_RUN and child.number not in sdlc.sub_issue_numbers(m.issue):
            raise Failed(f"#{child.number} is not listed among #{m.issue.number}'s sub-issues after linking")
    except Failed as e:
        try:
            sdlc.delete_issue(child)
            fate = "deleted"
        except Failed:
            sdlc.edit_issue(child, state="closed", reason="not_planned")
            fate = "closed as not planned (could not delete it)"
        raise Failed(
            f"linking {ref} (#{child.number}) under #{m.issue.number} failed; the new issue was {fate}.\n{e}"
        ) from e
    sdlc.set_project_status(child, cfg.project_status("task", "backlog"))
    m.tasks.append(sdlc.Task(m.num, k, title, child))
    sdlc.edit_issue(m.issue, body=sdlc.set_section(m.body, "Tasks", sdlc.tasks_section(m)))
    sdlc.say(f"added {ref}: {child.url}")
    print(f"next: write its Goal, Plan (files:) and Acceptance in the issue; `check {m.ref}`")


@app.command
def approve(mission: str, *, dry_run: bool = False) -> None:
    """After the user's OK: PROPOSED -> PLANNED (strict check: no template placeholders left in mission or tasks)."""
    sdlc.set_dry_run(dry_run)
    m, _ = sdlc.find_open(mission)
    sdlc.gate(m.status == "proposed", f"{m.ref} is {m.status}, not proposed")
    errs = sdlc.check_mission(m, strict=True)
    sdlc.gate(not errs, "fix the mission first:\n- " + "\n- ".join(errs))
    body = sdlc.append_line(sdlc.set_header(m.body, {"Status": "planned"}), "Log", "approved by the user")
    sdlc.edit_issue(m.issue, body=body)
    sdlc.set_project_status(m.issue, sdlc.config().project_status("mission", "planned"))
    sdlc.say(f"{m.ref} planned: {m.issue.url}")


@app.command
def start(mission: str, *, dry_run: bool = False) -> None:
    """Start a PLANNED mission (or re-open an active one): check gate, worktree, Status active, project In Progress."""
    sdlc.set_dry_run(dry_run)
    m, _ = sdlc.find_open(mission)
    if m.status not in ("planned", "active"):
        raise Refused(f"{m.ref} is {m.status}: only a planned (user-approved) mission starts")
    sdlc.require_consistent(m, ignore="but no worktree")  # start re-opens a missing worktree
    m = sdlc.ensure_worktree(m)
    if m.status != "active":
        body = sdlc.append_line(sdlc.set_header(m.body, {"Status": "active"}), "Log", "started")
        sdlc.edit_issue(m.issue, body=body)
    sdlc.set_project_status(m.issue, sdlc.config().project_status("mission", "active"))
    behind = sdlc.ahead_behind(m.branch, sdlc.config().main)[1] if sdlc.branch_exists(m.branch) else 0
    sdlc.say(f"{m.ref} active on {m.branch}{'; `ship align` first (main moved)' if behind else ''}")
    print(f"next: EnterWorktree path={m.worktree}, then `task {m.ref}/T<k>`")


@app.command
def task(ref: str, *, done: bool = False, evidence: Path | None = None, dry_run: bool = False) -> None:
    """Open task REF (check gate; parallel only if independent of every in-progress task) or close it: --done --evidence FILE."""
    sdlc.set_dry_run(dry_run)
    cfg = sdlc.config()
    m, t = sdlc.find_open(ref)
    if t is None:
        raise Refused("give a task: M<N>/T<k>")
    sdlc.gate(m.status == "active" and m.worktree is not None, f"{m.ref} is {m.status}: `start {m.ref}` first")
    sdlc.gate(
        m.worktree is not None and sdlc.here_root() == m.worktree.resolve(),
        f"run inside {m.ref}'s worktree: {m.worktree}",
    )
    if not done:
        # parallel work: only tasks the cli finds independent (disjoint `files:`, no dependency) run side by side
        clashes = [
            f"{x.ref} (#{x.issue.number}): {why}"
            for x in m.tasks
            if x.status == "in-progress" and x.num != t.num and (why := sdlc.conflict(t, x))
        ]
        sdlc.gate(not clashes, f"{t.ref} is not independent of the task(s) in progress:\n- " + "\n- ".join(clashes))
        deps = sdlc.open_dependencies(t)
        sdlc.gate(not deps, f"{t.ref} depends on open work: {', '.join(deps)}")
        sdlc.gate(t.status != "done", f"{t.ref} is done")
        sdlc.require_consistent(m)
        if t.status != "in-progress":
            body = sdlc.set_header(t.body, {"Status": "in-progress", "Started": sdlc.today()})
            sdlc.edit_issue(t.issue, body=body)
        sdlc.set_project_status(t.issue, cfg.project_status("task", "in-progress"))
        print(t.body.rstrip())
        sdlc.say(f"{t.ref} in progress: {t.issue.url}")
        print(
            f"Commits carry `(refs {t.ref})`. Done: tick Acceptance in the issue, then `task {t.ref} --done --evidence FILE`."
        )
        return
    text = evidence.read_text(encoding="utf-8").strip() if evidence and evidence.is_file() else ""
    if not text:
        raise Refused(
            "--done needs --evidence FILE with the outcome (what changed, verify numbers, what was not verified)"
        )
    acc = sdlc.checklist(sdlc.get_section(t.body, "Acceptance"))
    open_items = [txt for ok, txt in acc if not ok]
    sdlc.gate(
        bool(acc) and not open_items,
        "Acceptance not met (tick verified items in the issue first):\n- "
        + "\n- ".join(open_items or ["(no checklist)"]),
    )
    body = sdlc.set_section(t.body, "Outcome", text)
    body = sdlc.set_header(
        body, {"Status": "done", "Completed": sdlc.today(), "Started": t.meta.get("Started") or sdlc.today()}
    )
    sdlc.close_verified(t.issue, cfg.project_status("task", "done"), body=body)
    sdlc.mission_log(m, f"{t.ref} done")
    sdlc.say(f"{t.ref} done: closed as completed, project Done (verified): {t.issue.url}")
    left = [x for x in m.tasks if x.status != "done" and x.num != t.num]
    print(
        f"next: task {left[0].ref}"
        if left
        else f'all tasks of {m.ref} done -> ask the user once: "ship {m.ref} now?" (/ship)'
    )


@app.command
def log(mission: str, text: str, *, decision: bool = False, dry_run: bool = False) -> None:
    """Append a dated Log line to MISSION's issue (--decision: also under Key decisions)."""
    sdlc.set_dry_run(dry_run)
    m, _ = sdlc.find_open(mission)
    sdlc.mission_log(m, text, decision=decision)
    sdlc.say(f"{m.ref}: {'decision' if decision else 'log'} recorded: {m.issue.url}")


@app.command
def sync(mission: str, *, dry_run: bool = False) -> None:
    """Re-derive MISSION's `## Tasks` section (`- #<n>` per sub-issue; GitHub renders their live state)."""
    sdlc.set_dry_run(dry_run)
    m, _ = sdlc.find_open(mission)
    new = sdlc.set_section(m.body, "Tasks", sdlc.tasks_section(m))
    if new == m.body:
        print(f"{m.ref}: Tasks section already up to date")
        return
    sdlc.edit_issue(m.issue, body=new)
    sdlc.say(f"{m.ref}: Tasks section synced")


@app.command
def close_worktree(mission: str) -> None:
    """Remove the worktree of a proposed/planned mission (the branch keeps the code). Refused when dirty."""
    m, _ = sdlc.find(mission)
    if not m.worktree:
        print("no worktree")
        return
    if m.status == "active":
        raise Refused(f"{m.ref} is active: its worktree stays until `ship merge`")
    if sdlc.dirty(m.wt):
        raise Refused(f"{m.worktree} has uncommitted changes")
    sdlc.git("worktree", "remove", str(m.worktree), cwd=sdlc.config().root)
    print(f"removed {m.worktree}; {m.branch} keeps the code")


@app.command
def check(mission: str | None = None) -> None:
    """The consistency gate: labels, sub-issue links, body Status = issue state = project Status, on the board, sections."""
    errs = sdlc.check_store(mission)
    for e in errs:
        print(f"- {e}")
    print(f"{len(errs)} finding(s)")
    if errs:
        raise Failed("the board does not match the standard (start / task / ship refuse until it does)")


@app.command
def session() -> None:
    """Compact status for the session-start hook: open missions, this worktree's next task, check findings."""
    ms = sdlc.missions()
    print("Open missions (mission-tracker list):")
    _print_list(ms)
    branch = sdlc.git("branch", "--show-current", check=False)
    for m in ms:
        if m.branch and m.branch == branch:
            print(f"This worktree is mission {m.ref}; next: {_next_task([m])}")
    errs = sdlc.check_store()
    if errs:
        print(f"mission-tracker check: {len(errs)} finding(s) — start/task/ship refuse for these missions:")
        print("\n".join(f"- {e}" for e in errs[:15]) + ("\n- …" if len(errs) > 15 else ""))
    else:
        print("mission-tracker check: 0 findings")


def main() -> None:
    try:
        app()
    except SystemExit as e:
        if sdlc.WOULD_REFUSE and not e.code:  # a dry run walked past a gate: report it as refused
            sys.exit(3)
        raise
    except (Refused, Failed) as e:
        print(f"{'REFUSED' if e.code == 3 else 'FAILED'}: {e}", file=sys.stderr)
        sys.exit(e.code)


if __name__ == "__main__":
    main()
