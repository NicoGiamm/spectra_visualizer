"""SessionStart: where the work stands — open missions (branches), the current worktree's mission and next task.

stdout becomes session context. Missions live only on their `mission/*` branches (.claude/sdlc.md).
"""

import os
import subprocess

root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
cli = os.path.join(root, ".claude", "skills", "mission-tracker", "cli.py")


def run(*args: str, timeout: int = 30) -> str:
    try:
        return subprocess.run(
            list(args), cwd=os.getcwd(), capture_output=True, text=True, timeout=timeout
        ).stdout.strip()
    except Exception:
        return ""


branch = run("git", "branch", "--show-current")
print(f"Branch {branch}; last commit: {run('git', 'log', '-1', '--format=%h %s')}")
dirty = run("git", "status", "--short")
if dirty:
    print("Uncommitted changes:\n" + "\n".join(dirty.splitlines()[:15]))
if os.path.isfile(cli):
    listing = run("uv", "run", "-q", cli, "list")
    if listing:
        print("Open missions (mission-tracker list):\n" + listing)
    if branch.startswith("mission/M"):
        ref = branch.split("/", 1)[1].split("-", 1)[0]
        print(f"This worktree is mission {ref}; next: {run('uv', 'run', '-q', cli, 'next', ref)}")
print(
    "Workflow: .claude/sdlc.md — /mission-tracker, /verify-scene, /ship. Planning files live only on mission branches."
)
