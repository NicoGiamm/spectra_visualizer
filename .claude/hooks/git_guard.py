"""PreToolUse(Bash): enforce the branching model of .claude/sdlc.md (values from .claude/sdlc.toml).

On main:            no commit except one carrying the no-mission token (only when the user said so); no merge /
                    rebase / cherry-pick / revert / reset --hard — missions reach main only through `ship merge`,
                    and .claude/missions/ never does (it lives only on mission branches).
On mission/M<N>-*:  every commit message carries `refs M<N>[/T<k>]` of that mission.
Anywhere:           no force push.
Exit 2 blocks the call and sends the reason to Claude. The clis run git themselves (not through this hook).
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    tomllib = None

data = json.load(sys.stdin)
cmd = data.get("tool_input", {}).get("command", "")
if "git" not in cmd:
    sys.exit(0)

proj = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
cfg = {"main": "main", "prefix": "mission/", "missions": ".claude/missions", "ref": r"refs M\d+(/T\d+)?", "token": "[no-mission]"}
try:
    raw = tomllib.loads(open(os.path.join(proj, ".claude", "sdlc.toml"), encoding="utf-8").read())
    cfg.update(main=raw["repo"]["main_branch"], prefix=raw["branches"]["mission_prefix"], missions=raw["store"]["missions_dir"],
               ref=raw["store"]["ref_pattern"], token=raw["store"]["no_mission_token"])
except Exception:
    pass


def block(msg: str) -> None:
    print(f"git_guard: {msg}\n(see .claude/sdlc.md § Branches and worktrees)", file=sys.stderr)
    sys.exit(2)


def git_out(cwd: str, *args: str) -> str:
    try:
        return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        return ""


cwd = data.get("cwd") or os.getcwd()
added: list[str] = []
# split on shell separators, keep it simple: heredoc bodies stay attached to their segment
for seg in re.split(r"&&|\|\||;|\n(?=\s*(?:git|cd)\b)", cmd):
    try:
        tok = shlex.split(seg, comments=False)
    except ValueError:
        tok = seg.split()
    if not tok:
        continue
    if tok[0] == "cd" and len(tok) > 1:
        cwd = os.path.normpath(os.path.join(cwd, os.path.expanduser(tok[1])))
        continue
    if tok[0] != "git":
        continue
    i, where = 1, cwd
    while i < len(tok) and tok[i].startswith("-"):
        if tok[i] == "-C" and i + 1 < len(tok):
            where = os.path.normpath(os.path.join(cwd, tok[i + 1]))
            i += 2
        elif tok[i] == "-c":
            i += 2
        else:
            i += 1
    if i >= len(tok):
        continue
    sub, args = tok[i], tok[i + 1:]
    branch = git_out(where, "branch", "--show-current")

    if sub == "push" and any(a in ("-f", "--force", "--force-with-lease") or a.startswith("--force") or a.startswith("+") for a in args):
        block("force push is never allowed")
    if sub == "add":
        if any(a in ("-A", "--all", ".", "-u") for a in args):
            block("stage by explicit path (no `git add -A` / `.` / `-u`)")
        added += [a for a in args if not a.startswith("-")]
        continue
    if branch == cfg["main"]:
        if sub in ("merge", "rebase", "cherry-pick", "revert"):
            block(f"no `git {sub}` on {cfg['main']}: a mission reaches {cfg['main']} only through `ship merge M<N>`")
        if sub == "reset" and "--hard" in args:
            block(f"no `git reset --hard` on {cfg['main']}")
        if sub == "commit":
            if cfg["token"] in cmd:
                continue
            if any(a in ("-a", "--all") or (a.startswith("-") and not a.startswith("--") and "a" in a[1:] and "m" in a[1:]) for a in args):
                block("no `commit -a`: stage by explicit path")
            block(f"no commits on {cfg['main']}: work happens on a mission branch (`mission-tracker start M<N>`, then commit in "
                  f"its worktree). A commit straight on {cfg['main']} needs `{cfg['token']}` in the message, only when the user "
                  f"explicitly said so.")
    elif branch.startswith(cfg["prefix"]) and sub == "commit":
        m = re.match(re.escape(cfg["prefix"]) + r"M(\d+)-", branch)
        refs = [r for r in re.finditer(cfg["ref"], cmd)]
        if not refs:
            block(f"commit on {branch} without `(refs M<N>/T<k>)` in the message")
        if m and not any(re.search(rf"\bM{m.group(1)}\b", r.group(0)) for r in refs):
            block(f"commit on {branch} must reference its own mission M{m.group(1)}")
