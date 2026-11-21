"""PostToolUse(Edit|Write): format, lint and type-check every Python file Claude writes.

Runs in the checkout that holds the file (main or a mission worktree), with the project's pinned tools:
  ruff format <file>        — always applied
  ruff check --fix <file>   — safe fixes applied, the rest reported
  ty check <file>           — reported
Exit 2 sends what is left to fix back to Claude; exit 0 when the file is clean or not Python.
"""

import json
import subprocess
import sys
from pathlib import Path

path = json.load(sys.stdin).get("tool_input", {}).get("file_path", "")
if not path.endswith(".py") or not Path(path).is_file():
    sys.exit(0)


def run(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, timeout=120)


top = run("git", "rev-parse", "--show-toplevel", cwd=Path(path).parent).stdout.strip()
root = Path(top) if top else Path(path).parent
uv = ("uv", "run", "--frozen", "-q")

run(*uv, "ruff", "format", path, cwd=root)
lint = run(*uv, "ruff", "check", "--fix", "--output-format", "concise", path, cwd=root)
types = run(*uv, "ty", "check", "--output-format", "concise", path, cwd=root)

problems = []
if lint.returncode:
    problems.append("ruff:\n" + (lint.stdout or lint.stderr).strip())
if types.returncode:
    problems.append("ty:\n" + (types.stdout or types.stderr).strip())
if problems:
    print(f"python_quality ({path}) — fix before moving on:\n" + "\n".join(problems), file=sys.stderr)
    sys.exit(2)
