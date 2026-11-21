"""SessionStart: print the roadmap position and working-tree state (stdout becomes session context)."""

import os
import re
import subprocess

root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
plan = os.path.join(root, ".claude", "plans", "improvement-plan.md")

open_steps = []
try:
    with open(plan, encoding="utf-8") as f:
        for line in f:
            m = re.match(r"- \[( |~)\] \*\*([0-9.]+)\s*(.*?)\*\*", line)
            if m:
                open_steps.append(f"{m.group(2)} {m.group(3)}{' (in progress)' if m.group(1) == '~' else ''}")
except OSError:
    pass


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", "-C", root, *args], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        return ""


print("Roadmap (.claude/plans/improvement-plan.md) — next open steps: " + ("; ".join(open_steps[:4]) or "none"))
print(f"Branch {git('branch', '--show-current')}; last commit: {git('log', '-1', '--format=%h %s')}")
dirty = git("status", "--short")
if dirty:
    print("Uncommitted changes:\n" + dirty)
print("Workflow: .claude/sdlc.md (/plan-step, /verify-scene, /ship).")
