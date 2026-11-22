# /// script
# requires-python = ">=3.11"
# dependencies = ["cyclopts>=4"]
# ///
"""ship — deliver a mission branch into main: check + reviewer gate, align, timeline gate, merge commit, cleanup.

Run as `uv run .claude/skills/ship/cli.py <command> M<N>` from any checkout. The mission and its tasks are
GitHub issues (`.claude/lib/sdlc.py`); after the merge commit the mission issue is marked delivered, closed and
set Done on the project (verified by re-reading).
Exit codes: 0 ok · 1 failed (conflict, red gate, git/GitHub error) · 3 refused (a gate said no).
`merge` and `cleanup` run only after the user's OK in words.
"""

from __future__ import annotations

import fnmatch
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib"))

import sdlc  # noqa: E402
from cyclopts import App  # noqa: E402
from sdlc import Failed, Refused  # noqa: E402

app = App(name="ship", help="Deliver a mission branch into main (never without a reviewer ok and the user's word).")


def _open(ref: str) -> sdlc.Mission:
    m, _ = sdlc.find(ref)
    if m.status == "delivered":
        raise Refused(f"{m.ref} is already {m.meta.get('Status')}: {m.issue.url}")
    if not m.worktree:
        raise Refused(f"{m.ref} has no open worktree (status {m.status}); `mission-tracker start {m.ref}`")
    return m


def _rules_for(files: list[str]) -> list[str]:
    root = sdlc.config().root
    out = []
    for r in sorted((root / ".claude" / "rules").glob("*.md")):
        meta_block = re.match(r"\A---\n(.*?)\n---", r.read_text(encoding="utf-8"), re.S)
        globs = re.findall(r'^\s*-\s*"([^"]+)"', meta_block.group(1), re.M) if meta_block else []
        if any(fnmatch.fnmatch(f, g) or fnmatch.fnmatch(f, g.replace("/**", "/*")) for f in files for g in globs):
            out.append(str(r.relative_to(root)))
    return out


@app.command
def status(ref: str) -> None:
    """Where MISSION's branch stands: ahead/behind main, dirty, tasks, recorded verdict vs head, next step."""
    cfg = sdlc.config()
    m = _open(ref)
    a, b = sdlc.ahead_behind(m.branch, cfg.main)
    h = sdlc.head(m.wt)
    v = sdlc.last_verdict(m.num)
    open_ = [t.ref for t in m.tasks if t.status != "done"]
    errs = sdlc.check_mission(m)
    print(f"{m.ref} (#{m.issue.number}) {m.branch} @ {h[:8]}: +{a}/-{b} vs {cfg.main}, dirty {len(sdlc.dirty(m.wt))}")
    print(f"tasks open: {open_ or 'none'}")
    print(f"check: {len(errs)} finding(s)" + "".join(f"\n- {e}" for e in errs))
    print(
        f"verdict: {v['verdict'] + ' for ' + v['head'][:8] if v else 'none'}{' (stale: head moved)' if v and v['head'] != h else ''}"
    )
    nxt = (
        "fix the board (`mission-tracker check " + m.ref + "`)"
        if errs
        else "align"
        if b
        else (
            "finish tasks"
            if open_
            else (
                "review-brief -> reviewer -> deliver"
                if not v or v["head"] != h or not v["verdict"].startswith("ok")
                else "ask the user, then merge"
            )
        )
    )
    print(f"next: {nxt}")


@app.command
def align(ref: str) -> None:
    """Merge the current main into MISSION's branch. A stale legacy planning folder on the branch is kept as is. Conflicts: exit 1."""
    cfg = sdlc.config()
    m = _open(ref)
    wt = m.wt
    if sdlc.dirty(wt):
        raise Refused("worktree is dirty: commit first")
    pre = sdlc.head(wt)
    sdlc.run(["git", "merge", "--no-ff", "--no-commit", cfg.main], cwd=wt, check=False)
    unmerged = [f for f in sdlc.git("diff", "--name-only", "--diff-filter=U", cwd=wt).splitlines() if f]
    # an old branch may still carry the retired .claude/missions/: keep its own copy, never fight main over it
    legacy = cfg.legacy_rel
    if sdlc.git("ls-tree", "--name-only", pre, "--", legacy, cwd=wt):
        sdlc.git("checkout", pre, "--", legacy, cwd=wt)
        sdlc.git("add", "-A", "--", legacy, cwd=wt)
    other = [f for f in unmerged if not f.startswith(legacy + "/")]
    if other:
        raise Failed(
            f"conflicts merging {cfg.main} into {m.branch}: {other}\nresolve in {wt}, then "
            f'`git commit -m "Align with {cfg.main} (refs {m.ref})"`'
        )
    if sdlc.rc(["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"], wt) == 0:
        sdlc.git("commit", "-q", "-m", f"Align with {cfg.main} (refs {m.ref}){sdlc.TRAILER}", cwd=wt)
    print(f"{m.branch} aligned with {cfg.main} @ {sdlc.head(wt)[:8]}")


@app.command
def review_brief(ref: str, *, out: Path | None = None) -> None:
    """Print the reviewer's brief: mission, tasks (Goal/Plan/Acceptance/Outcome) from GitHub, diff range, files, rules, head."""
    cfg = sdlc.config()
    m = _open(ref)
    sdlc.require_consistent(m)
    base = sdlc.git("merge-base", cfg.main, m.branch, cwd=m.wt)
    h = sdlc.head(m.wt)
    files = [f for f in sdlc.git("diff", "--name-only", f"{base}..{h}", cwd=m.wt).splitlines() if f]
    lines = [
        f"# Review brief — {m.ref}: {m.title}",
        f"mission issue: #{m.issue.number} {m.issue.url}",
        f"worktree: {m.wt}",
        f"diff range: {base[:12]}..{h[:12]}   (reviewed head: {h})",
        "",
        "## Mission",
        *[f"### {s}\n{sdlc.get_section(m.body, s)}\n" for s in ("Problem", "Scope", "Delivery", "Key decisions")],
        "## Tasks",
    ]
    for t in m.tasks:
        lines.append(f"### {t.ref} [{t.status}] {t.title}  (#{t.issue.number}, {t.issue.state.lower()})")
        for s in ("Goal", "Plan", "Acceptance", "Notes", "Outcome"):
            text = sdlc.get_section(t.body, s)
            if text or s != "Notes":
                lines.append(f"**{s}**\n{text}\n")
    lines += [
        "## Changed files",
        *[f"- {f}" for f in files],
        "",
        "## Rules whose paths match",
        *[f"- {r}" for r in _rules_for(files)],
    ]
    text = "\n".join(lines)
    if out:
        out.write_text(text, encoding="utf-8")
        print(f"brief written to {out} (reviewed head {h})")
    else:
        print(text)


@app.command
def deliver(ref: str, *, verdict_file: Path, reviewed_head: str) -> None:
    """Record the reviewer's FINDINGS/DOCS/VERDICT block for the head it reviewed (state in .claude/logs)."""
    m = _open(ref)
    h = sdlc.head(m.wt)
    if not h.startswith(reviewed_head):
        raise Refused(f"reviewed head {reviewed_head[:8]} is not the branch head {h[:8]}: review again")
    text = verdict_file.read_text(encoding="utf-8")
    v = re.search(r"^VERDICT:\s*(ok|partial|no)\b(.*)$", text, re.M)
    if not v:
        raise Refused("verdict file has no `VERDICT: ok|partial|no` line")
    verdict = v.group(1) + (" (owner override)" if "owner override" in v.group(2) else "")
    sdlc.record_verdict(m.num, {"head": h, "verdict": verdict, "at": sdlc.today(), "text": text})
    print(f"{m.ref}: recorded VERDICT {verdict} for {h[:8]}")


@app.command
def merge(ref: str, *, partial: bool = False, keep: bool = False) -> None:
    """After the user's OK: gates, then `git merge --no-ff` MISSION into main; closes + cleans up when all tasks are done.

    --partial delivers with tasks still open (the branch continues); --keep keeps branch and worktree.
    """
    cfg = sdlc.config()
    m = _open(ref)
    wt, root = m.wt, cfg.root
    if m.status != "active":
        raise Refused(f"{m.ref} is {m.status}: only an active mission (approved + started, tasks worked) ships")
    if sdlc.dirty(wt):
        raise Refused(f"worktree {wt} is dirty: commit first")
    if sdlc.git("branch", "--show-current", cwd=root) != cfg.main:
        raise Refused(f"the main checkout is not on {cfg.main}")
    if subprocess.run(["git", "merge-base", "--is-ancestor", cfg.main, m.branch], cwd=root).returncode:
        raise Refused(f"{m.branch} does not contain the current {cfg.main}: `ship align {m.ref}` (and re-review)")
    h = sdlc.head(wt)
    v = sdlc.last_verdict(m.num)
    if not v or v["head"] != h or not (v["verdict"].startswith("ok")):
        raise Refused(
            f"no reviewer `ok` for head {h[:8]} (last: {v['verdict'] + ' @ ' + v['head'][:8] if v else 'none'}): review-brief -> reviewer -> deliver"
        )
    sdlc.require_consistent(m)
    open_ = [t.ref for t in m.tasks if t.status != "done"]
    if open_ and not partial:
        raise Refused(f"open tasks {open_}: finish them, or --partial if the user wants a partial delivery")
    for cmd in cfg.raw["ship"].get("quality_gate", []):
        q = subprocess.run(cmd, cwd=wt, capture_output=True, text=True)
        if q.returncode:
            raise Failed(f"quality gate `{' '.join(cmd)}` failed in {wt}:\n{(q.stdout + q.stderr)[-1500:]}")
    gate = sdlc.run(cfg.raw["ship"]["timeline_gate"], cwd=wt, check=False)
    warns = sum(int(x) for x in re.findall(r"(\d+) warning\(s\)", gate))
    if warns or "warning(s)" not in gate:
        raise Failed(f"timeline gate: {warns} warning(s) (or no report) in {wt}:\n{gate[-1500:]}")
    if sdlc.git("diff", "--cached", "--name-only", cwd=root):
        raise Refused("the main checkout has staged changes: they would ride along in the merge commit")
    title = m.title
    done = [t for t in m.tasks if t.status == "done"]
    out = sdlc.run(["git", "merge", cfg.raw["ship"]["merge"], "--no-commit", m.branch], cwd=root, check=False)
    if sdlc.rc(["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"], root):
        raise Failed(f"git did not start the merge in {root} (local changes in the way?):\n{out}")
    unmerged = [f for f in sdlc.git("diff", "--name-only", "--diff-filter=U", cwd=root).splitlines() if f]
    if [f for f in unmerged if not f.startswith(cfg.legacy_rel + "/")]:
        sdlc.git("merge", "--abort", cwd=root, check=False)
        raise Failed(f"merge conflict in the main checkout (aborted): `ship align {m.ref}` first")
    # planning never reaches main: a stale legacy .claude/missions/ on an old branch is left out
    sdlc.git("rm", "-r", "-q", "-f", "--ignore-unmatch", "--", cfg.legacy_rel, cwd=root)
    problem = sdlc.get_section(m.body, "Problem").split("\n")[0]
    body = (
        f"{problem}\n\n"
        + "\n".join(f"- {t.ref} {t.title}" for t in done)
        + f"\n\nReviewer: {v['verdict']} @ {h[:8]}. Timeline: 0 warnings. {'Partial delivery. ' if open_ else ''}"
        f"Mission record: {m.issue.url}"
    )
    sdlc.git("commit", "-q", "-m", f"Merge mission {m.ref}: {title}\n\n{body}{sdlc.TRAILER}", cwd=root)
    merge_sha = sdlc.git("rev-parse", "--short", "HEAD", cwd=root)
    print(f"merged {m.branch} into {cfg.main}: {merge_sha} (legacy planning folder left out)")
    problem_gh = None
    try:
        _record(m, merge_sha, partial=bool(open_), reviewer=f"{v['verdict']} @ {h[:8]}")
    except Failed as e:
        problem_gh = e
    if not open_ and not keep:
        _remove(m)
        print(f"{m.ref} delivered; worktree and branch removed")
    else:
        print(f"branch {m.branch} continues; before new work: `ship align {m.ref}`")
    if problem_gh:
        raise Failed(
            f"merged as {merge_sha}, but the GitHub record failed: {problem_gh}\n"
            f"retry: `ship record {m.ref} --sha {merge_sha}{' --partial' if open_ else ''}`"
        )


def _record(m: sdlc.Mission, sha: str, *, partial: bool, reviewer: str = "") -> None:
    """Write the delivery into the mission issue: full -> `delivered (<sha>)`, comment, closed + Done (verified)."""
    cfg = sdlc.config()
    done = [t.ref for t in m.tasks if t.status == "done"]
    note = (
        f"Delivered to `{cfg.main}` in {sha}"
        + (" (partial)" if partial else "")
        + f": {', '.join(done) or 'no tasks'}."
    )
    if reviewer:
        note += f" Reviewer: {reviewer}. Timeline gate: 0 warnings."
    sdlc.comment(m.issue, note)
    if partial:
        sdlc.mission_log(m, f"partial delivery to {cfg.main} in {sha}: {', '.join(done)}")
        sdlc.say(f"{m.ref}: partial delivery {sha} logged on {m.issue.url}")
        return
    body = sdlc.set_header(m.body, {"Status": f"delivered ({sha})"})
    body = sdlc.append_line(body, "Log", f"delivered to {cfg.main} in {sha}")
    sdlc.close_verified(m.issue, cfg.project_status("mission", "delivered"), body=body)
    sdlc.say(f"{m.ref}: issue #{m.issue.number} delivered ({sha}), closed, project Done (verified)")


@app.command
def record(ref: str, *, sha: str, partial: bool = False, dry_run: bool = False) -> None:
    """Re-run the GitHub side of a merge (when `merge` merged but could not update the issue): mark delivered + close."""
    sdlc.set_dry_run(dry_run)
    m, _ = sdlc.find(ref)
    if m.status == "delivered" and not m.issue.open:
        print(f"{m.ref} is already {m.meta.get('Status')}")
        return
    if sdlc.rc(["git", "merge-base", "--is-ancestor", sha, sdlc.config().main], sdlc.config().root):
        raise Refused(f"{sha} is not on {sdlc.config().main}")
    open_ = [t.ref for t in m.tasks if t.status != "done"]
    if open_ and not partial:
        raise Refused(f"open tasks {open_}: a full delivery needs every task done (or --partial)")
    _record(m, sha, partial=partial)


def _remove(m: sdlc.Mission) -> None:
    root = sdlc.config().root
    sdlc.git("worktree", "remove", str(m.wt), cwd=root)
    sdlc.git("branch", "-d", m.branch, cwd=root)


@app.command
def cleanup(ref: str) -> None:
    """Remove a fully delivered mission's worktree and branch (refused if it holds undelivered commits)."""
    cfg = sdlc.config()
    m = _open(ref)
    a, _ = sdlc.ahead_behind(m.branch, cfg.main)
    if a or sdlc.dirty(m.wt):
        raise Refused(f"{m.branch} has {a} undelivered commit(s) or a dirty tree: merge or ask the user to drop them")
    _remove(m)
    print(f"removed {m.wt} and {m.branch}")


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
