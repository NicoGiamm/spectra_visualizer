"""SessionStart: where the work stands — branch, open missions (GitHub issues), this worktree's next task and the
`mission-tracker check` findings.

stdout becomes session context. The GitHub part is time-boxed and never breaks the session: offline (or `gh`
missing / slow) it prints a one-line note instead (.claude/sdlc.md).
"""

import os
import subprocess

root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
cli = os.path.join(root, ".claude", "skills", "mission-tracker", "cli.py")
GH_BUDGET = 20  # seconds for the one `mission-tracker session` call (one GraphQL query + local git)


def run(*args: str, timeout: int = 10) -> tuple[int, str]:
    try:
        p = subprocess.run(list(args), cwd=os.getcwd(), capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout.rstrip() or p.stderr.strip())
    except Exception as e:
        return -1, f"{type(e).__name__}"


branch = run("git", "branch", "--show-current")[1]
print(f"Branch {branch}; last commit: {run('git', 'log', '-1', '--format=%h %s')[1]}")
code, dirty = run("git", "status", "--short")
if dirty and code == 0:
    print("Uncommitted changes:\n" + "\n".join(dirty.splitlines()[:15]))
if os.path.isfile(cli):
    code, out = run("uv", "run", "-q", cli, "session", timeout=GH_BUDGET)
    if code == 0 and out:
        print(out)
    else:
        why = "timed out" if out == "TimeoutExpired" else (out.splitlines()[0] if out else f"exit {code}")
        print(f"Open missions: GitHub not reachable ({why[:160]}); run `mission-tracker list` / `check` later.")
print(
    "Workflow: .claude/sdlc.md — /mission-tracker, /verify-scene, /ship. Missions and tasks are GitHub issues "
    "(NicoGiamm/spectra_visualizer, project 4); no planning files in the repo."
)
