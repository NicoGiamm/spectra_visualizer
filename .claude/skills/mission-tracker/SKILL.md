---
name: mission-tracker
description: "Missions and their tasks for spectra_visualizer: one branch mission/M<N>-<slug> + one worktree per mission, the mission's plan files living only on that branch. Propose / approve / start a mission, open and close tasks with evidence, record decisions, list what is open, check the standard. Use for 'new mission', 'start M4', 'work on M1/T6', 'next task', 'where are we', 'task done', 'record this decision', and at the start of any repo-changing conversation."
argument-hint: "[list | next | show M<N>[/T<k>] | propose \"title\" | start M<N> | task M<N>/T<k> …]"
allowed-tools: Bash(uv run .claude/skills/mission-tracker/cli.py *) Bash(git status *) Bash(git log *) Bash(git diff *)
---

# mission-tracker — one branch + worktree per mission, tasks are commits on it

Run as `uv run .claude/skills/mission-tracker/cli.py <command>` from any checkout (inside a worktree too).
Arguments given: `$ARGUMENTS`. The flow is `.claude/sdlc.md`; the store's shape and rules are
`.claude/rules/missions.md`; values come from `.claude/sdlc.toml`.

Open missions now:

!`uv run .claude/skills/mission-tracker/cli.py list 2>&1 | head -20`

## Hard rules

- A new mission is **proposed** to the user (Problem, Scope, Delivery, tasks) and `approve`d only after their OK;
  tasks inside an approved mission are added freely.
- Planning files live only on the mission branch — never create `.claude/missions/` or any plan file on `main`.
- `task` acts only inside the mission's worktree, one task at a time; `--done` is refused without an evidence file
  or with an unticked Acceptance item. After a task: the next one; after the last: ask "ship M<N> now?" once.
- Dates come from the work; the cli stamps them. Decisions → `log M<N> "…" --decision`; out-of-scope findings → a
  `gap` task.

## Commands

| Command | What it does |
|---|---|
| `list [--delivered]` | open missions (= `mission/*` branches): status, tasks done/total, ahead/behind main, worktree; `--delivered` adds the merge commits |
| `next [M<N>]` | the next open task (active missions first, then planned) |
| `show M<N>[/T<k>]` | print a mission (with task table) or a task, from its worktree or branch |
| `propose "<title>" [--slug s]` | branch `mission/M<next>-<slug>` off main + worktree + `mission.md` from the template, committed on the branch |
| `add-task M<N> "<title>" [--slug s] [--label gap]…` | `tasks/T<next>-<slug>.md` from the template, committed on the branch |
| `approve M<N>` | after the user's OK: strict check (no placeholders), `proposed → planned` |
| `start M<N>` | `planned → active` (re-opens the worktree if it was closed); then `EnterWorktree path=<worktree>` |
| `open M<N>` | open the worktree of a proposed/planned mission to edit it, status unchanged |
| `close-worktree M<N>` | drop a proposed/planned mission's worktree (the branch keeps everything) |
| `task M<N>/T<k>` | `backlog → in-progress`, prints the task and its gaps |
| `task M<N>/T<k> --done --evidence FILE` | Acceptance all ticked → FILE becomes `## Outcome`, `done` |
| `log M<N> "<text>" [--decision]` | dated Log line (and Key decisions) |
| `sync M<N>` | regenerate the task table after hand edits (no commit) |
| `check` | every mission branch against `[standard]`; flags `.claude/missions/` tracked on main |

Exit codes: 0 ok · 1 failed · 3 refused (a gate). Bookkeeping commits touch only the mission folder and carry
`(refs M<N>[/T<k>])`.

## Recipes

| Need | Do |
|---|---|
| Plan new work | `propose "…"` → edit `mission.md` in the printed worktree → `add-task` per deliverable → fill Goal / Plan / Acceptance → commit `(refs M<N>)` → show the user → `approve M<N>` |
| Work a mission | `start M<N>` → `EnterWorktree path=…` → `task M<N>/T<k>` → explore, plan, implement, `/verify-scene`, commit `(refs M<N>/T<k>)` → tick Acceptance → evidence file in the scratchpad → `task … --done --evidence …` |
| Delegate a task | one `step-dev` with the task ref and the worktree path; review its diff; then commit + `--done` yourself |
| Where are we | `list`, then `next` |
| Read a delivered mission | `list --delivered` → `git show <merge>^2:.claude/missions/` |

## Related

- `.claude/sdlc.md` (lifecycle, lanes, definition of done), `.claude/rules/missions.md` (store guardrails).
- `/ship` (review gate + merge), `/verify-scene` (the test suite); agents `step-dev`, `reviewer`, `physics-auditor`.
